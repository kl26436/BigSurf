// Set seeding - core/workout/set-seeding.js
//
// Pure rules for how autofill writes prefilled numbers onto an exercise's set
// rows. Kept out of active-workout-ui.js so they're directly testable (that
// module needs a DOM to import).
//
// Why it exists: rendering pads blank rows onto the exercise before autofill's
// history read lands, and autofill used to seed only an EMPTY set list — so
// every mid-workout change (replace, add, switch machine) showed the new
// "Last:" card above blank or stale rows.

import { equipNameKey } from '../data/catalog-search.js';

/** A row the user has logged or typed into — autofill never overwrites it. */
export function isTouchedSet(set) {
    return !!set && !!(set.completed || set._userEdited);
}

/** Untouched AND empty — the placeholder rows render pads in. */
export function isBlankSet(set) {
    return !set || (!isTouchedSet(set) && set.weight == null && set.reps == null);
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
