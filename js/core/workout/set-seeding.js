// Set seeding - core/workout/set-seeding.js
//
// Pure rules for how autofill writes prefilled numbers onto an exercise's set
// rows. Kept out of active-workout-ui.js so they're directly testable (that
// module needs a DOM to import). Tests mock ui-helpers (convertWeight).
//
// Why it exists: rendering pads blank rows onto the exercise before autofill's
// history read lands, and autofill used to seed only an EMPTY set list — so
// every mid-workout change (replace, add, switch machine) showed the new
// "Last:" card above blank or stale rows.

import { equipNameKey } from '../data/catalog-search.js';
import { convertWeight } from '../ui/ui-helpers.js';
import { scaleLoadableWeight } from '../features/progression.js';

/** Back-off factor for CP-2 stall rung 2 (mirrors progression.js). */
const BACK_OFF_FACTOR = 0.9;

/**
 * Turn last session's sets into today's prefilled rows.
 *
 * - Earned bump (prog.bumped): each weighted working set +inc, relative to
 *   its own last weight so a ramp keeps its shape; flagged `_suggested` (↑).
 * - Stall rung 2 (prog.backOff): each weighted set −10%, plate-loadable;
 *   flagged `_adjusted:'back-off'` (↓).
 * - Deload intent (AP-7): never a bump; each weighted set scaled by the
 *   intent's percentage, reps clamped into its band; flagged
 *   `_adjusted:'deload'` (↓) when the weight actually dropped. `alreadyLight`
 *   (the source session was itself a deload) skips the scaling so a second
 *   deload day can't compound to 0.65².
 * - Otherwise last session's exact numbers — never a number the user didn't earn.
 * Warmups and unweighted sets are copied as they were.
 *
 * A source set that recorded its plate load comes back plate-relative
 * (getLastSessionDefaults), so the seeded number IS plates — `_plateWeight`
 * says so, or completion would subtract the base a second time.
 */
export function seedSetsFromLastSession(lastSets, prog, intent, unit, inc, { alreadyLight = false, fallbackUnit = 'lbs' } = {}) {
    const deload = intent?.mode === 'deload';
    const pct = deload && !alreadyLight && typeof intent.weightPct === 'number' ? intent.weightPct : null;
    const repRange = deload && Array.isArray(intent.repRange) ? intent.repRange : null;
    const bump = !deload && !!prog && prog.bumped && prog.weight > 0;
    const backOff = !deload && !!prog && prog.backOff && prog.weight > 0;
    const step = inc || (unit === 'kg' ? 2.5 : 5);

    return (lastSets || []).map(s => {
        const working = (s.type || 'working') !== 'warmup';
        const weighted = s.weight > 0 && working;
        const bumpThis = bump && weighted;
        const backThis = !bumpThis && backOff && weighted;
        const deloadThis = !!pct && weighted;
        const lastW = weighted ? convertWeight(s.weight, s.originalUnit || 'lbs', unit) : 0;
        const weight = bumpThis
            ? Math.round((lastW + step) * 10) / 10
            : backThis
                ? scaleLoadableWeight(lastW, BACK_OFF_FACTOR, step)
                : deloadThis
                    ? scaleLoadableWeight(lastW, 1 + pct / 100, step)
                    : ((s.weight && s.weight > 0) ? s.weight : null);
        let reps = bumpThis && prog.reps ? prog.reps : ((s.reps && s.reps > 0) ? s.reps : null);
        if (repRange && working && reps != null) reps = Math.min(repRange[1], Math.max(repRange[0], reps));
        const converted = bumpThis || backThis || deloadThis;
        const lowered = (backThis || deloadThis) && weight != null && weight < lastW;
        const platesKnown = typeof s._plateWeight === 'number' && s._equipBaseWeight > 0;
        return {
            weight,
            reps,
            completed: false,
            originalUnit: converted ? unit : (s.originalUnit || fallbackUnit),
            ...(bumpThis ? { _suggested: true } : {}),
            ...(lowered ? { _adjusted: deloadThis ? 'deload' : 'back-off' } : {}),
            ...((platesKnown && weight != null) ? { _plateWeight: weight } : {}),
        };
    });
}

/** Rows for an exercise with no history on this machine — template defaults, deload reps clamped. */
export function seedSetsFromTemplate(exercise, intent) {
    const repRange = intent?.mode === 'deload' && Array.isArray(intent.repRange) ? intent.repRange : null;
    let reps = exercise?.defaultReps || null;
    if (repRange && reps != null) reps = Math.min(repRange[1], Math.max(repRange[0], reps));
    return Array.from({ length: exercise?.sets || 3 }, () => ({
        weight: exercise?.defaultWeight || null,
        reps,
        completed: false,
    }));
}

/** A row the user has logged or typed into — autofill never overwrites it. */
export function isTouchedSet(set) {
    return !!set && !!(set.completed || set._userEdited);
}

/**
 * Untouched AND empty — the placeholder rows render pads in. 0 counts as
 * empty: saveWorkoutData's validator writes a blank row back as 0/0, so a
 * resumed doc's padded rows come home as zeros.
 */
export function isBlankSet(set) {
    return !set || (!isTouchedSet(set) && !set.weight && !set.reps);
}

/**
 * Replace every untouched row with the freshly seeded one. Touched rows stay
 * exactly where they are. Untouched rows past the end of the new seed are
 * cleared (an old machine's 4th set must not survive a switch to a machine
 * logged with 3), and trailing cleared rows are dropped — render pads the
 * list back to the exercise's set count.
 */
export function mergeSeededSets(existing, seeded) {
    const cur = Array.isArray(existing) ? existing : [];
    const next = Array.isArray(seeded) ? seeded : [];
    const out = [];
    for (let i = 0; i < Math.max(cur.length, next.length); i++) {
        if (isTouchedSet(cur[i])) out.push(cur[i]);
        else out.push(next[i] ? { ...next[i] } : { reps: null, weight: null, completed: false });
    }
    while (out.length > next.length && isBlankSet(out[out.length - 1])) out.pop();
    return out;
}

/**
 * Did this history come from the machine the exercise is on now? No machine
 * picked → any history for the exercise applies. A source that recorded no
 * machine can't be called a different one. Otherwise match by stable id, then
 * by name ignoring case and separators.
 */
export function historyFromSameMachine(equipName, equipId, lastSession) {
    if (!equipName && !equipId) return true;
    if (!lastSession) return false;
    if (equipId && lastSession.equipmentId && equipId === lastSession.equipmentId) return true;
    if (!lastSession.equipment) return true;
    return !!equipName && equipNameKey(equipName) === equipNameKey(lastSession.equipment);
}
