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

import { convertWeight } from '../ui/ui-helpers.js';
import { scaleLoadableWeight, computeOverloadNudge, sameMachine } from '../features/progression.js';

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

/**
 * Rows for an exercise with no history on this machine — template defaults.
 *
 * `useTemplateWeight` (no history for the exercise ANYWHERE): the template's
 * weight is the starting point. It used to read `defaultWeight`, which only
 * manual entry sets, so a live workout never showed the template weight — and
 * in a deload week the program's % never reached a new exercise at all
 * (§3.4). A deload scales it like a history row (plate-loadable, ↓ marker).
 * History from a DIFFERENT machine passes false: a new machine starts fresh.
 */
export function seedSetsFromTemplate(exercise, intent, { useTemplateWeight = false, inc = null, unit = 'lbs' } = {}) {
    const deload = intent?.mode === 'deload';
    const repRange = deload && Array.isArray(intent.repRange) ? intent.repRange : null;
    let reps = exercise?.defaultReps || exercise?.reps || null;
    if (repRange && reps != null) reps = Math.min(repRange[1], Math.max(repRange[0], reps));
    const templateWeight = Number(exercise?.defaultWeight ?? (useTemplateWeight ? exercise?.weight : null)) || null;
    const pct = deload && typeof intent.weightPct === 'number' ? intent.weightPct : null;
    const step = inc || (unit === 'kg' ? 2.5 : 5);
    const weight = templateWeight && pct ? scaleLoadableWeight(templateWeight, 1 + pct / 100, step) : templateWeight;
    const lowered = !!templateWeight && weight < templateWeight;
    return Array.from({ length: exercise?.sets || 3 }, () => ({
        weight,
        reps,
        completed: false,
        ...(lowered ? { _adjusted: 'deload' } : {}),
    }));
}

/**
 * The number a set row shows in its weight field on a base-weight machine
 * (AP-4 / D6). Storage keeps the TOTAL; the row shows what's ON the machine.
 * A row that knows its typed plates (`_plateWeight` — completed sets and
 * plate-relative seeds) shows them; a number typed this session already is
 * plates; anything else is a legacy total and loses the base. Seeded rows
 * used to have the base subtracted from a number that was already plates —
 * the card said 270, the row said 180.
 */
export function plateRelativeDisplay(set, baseWeight) {
    const w = set?.weight;
    if (!(baseWeight > 0) || w == null) return w;
    if (typeof set._plateWeight === 'number') return set._plateWeight;
    if (set._userEdited && !set.completed) return w;
    return Math.max(0, w - baseWeight);
}

/**
 * Re-key an index-keyed map after deleting slot `deletedIdx` (AP-5 / D10):
 * entries above it shift down one, the deleted one goes. Works for both
 * shapes the workout uses — `exercise_<i>` keys (savedData.exercises) and
 * bare `<i>` keys (AppState.exerciseUnits). Pure.
 */
export function reindexAfterDelete(map, deletedIdx) {
    const out = {};
    for (const [key, value] of Object.entries(map || {})) {
        const m = /^(exercise_)?(\d+)$/.exec(key);
        if (!m) { out[key] = value; continue; }
        const i = Number(m[2]);
        if (i === deletedIdx) continue;
        out[`${m[1] || ''}${i > deletedIdx ? i - 1 : i}`] = value;
    }
    return out;
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
    // One definition (AU-12): progression.js#sameMachine, also used to key
    // the progression and scoreboard series by machine.
    return sameMachine(equipName, equipId, lastSession);
}

/**
 * AP-22 — which completed set asks for RPE. The fatigue rule reads only the
 * top set, so one tap per exercise: the heaviest completed working set (ties
 * → the later set, the harder effort). Sets that already carry an RPE keep
 * their chips separately (the caller shows those too).
 * @returns {number} set index, or -1 when nothing is completed
 */
export function rpePromptSetIndex(sets) {
    let best = -1;
    let bestW = -Infinity;
    (sets || []).forEach((s, i) => {
        if (!s?.completed || s.type === 'warmup') return;
        const w = Number(s.weight) || 0;
        if (w >= bestW) { bestW = w; best = i; }
    });
    return best;
}

/**
 * AU-3 — the multi-session nudge for base-weight gear whose history stores
 * TOTALS (no recorded plate load): the same stall ladder as every other lift,
 * on plate-relative weights, so the card says "hold 140 and chase a rep",
 * never a single-session "Beat it — try N". `sessions` is
 * buildExerciseSessions() output in `unit`; `base` is the machine's base
 * weight in `baseUnit`.
 * @returns {string|null}
 */
export function plateRelativeNudge(sessions, { base, baseUnit = 'lbs', unit = 'lbs', repTarget = null, inc, intent = null } = {}) {
    if (!Array.isArray(sessions) || !sessions.length || !(base > 0)) return null;
    const b = convertWeight(base, /^kg/i.test(baseUnit) ? 'kg' : 'lbs', unit);
    const rel = sessions.map(x => ({ ...x, topWeight: Math.max(0, Math.round((x.topWeight - b) * 10) / 10) }));
    return computeOverloadNudge(rel, unit, repTarget, inc, intent);
}
