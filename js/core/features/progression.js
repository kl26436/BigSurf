// Progression (Phase 5.7.3) — deterministic double-progression, no API.
//
// The "coach" for the daily loop: given an exercise's recent completed
// sessions, decide today's target with a plain rule matrix (hit the rep
// target → add weight; below it → chase a rep; stuck → flag a stall). Pure,
// instant, offline. The model only ever sees the OUTPUT (stall flags), never
// runs this path.
//
// Extracted from active-workout-ui.js (was inline + mirror-tested); the render
// layer imports buildExerciseSessions/computeOverloadNudge from here now.

import { convertWeight } from '../ui/ui-helpers.js';

const INCREMENT = { lbs: 5, kg: 2.5 };

/**
 * The smallest REAL weight jump at this user's gym: plates load in pairs, so
 * it's 2× the smallest plate they own (from the plate-calculator settings) —
 * a gym with no 2.5 lb plates can't move a bar by 5. Floors at the classic
 * default so microplates don't shrink the standard progression jump. Pure:
 * callers pass the plate list (settings.plateLbs / settings.plateKg by unit).
 */
export function weightIncrement(unit, plates) {
    const fallback = INCREMENT[unit] || 5;
    if (!Array.isArray(plates) || plates.length === 0) return fallback;
    const smallest = Math.min(...plates.filter(p => typeof p === 'number' && p > 0));
    if (!Number.isFinite(smallest)) return fallback;
    return Math.max(fallback, smallest * 2);
}

/**
 * Scale a weight by `factor`, snapping the CHANGE to whole steps so the
 * result stays loadable. The starting weight was real (it was lifted), and
 * moving by multiples of the smallest jump keeps it real — rounding the
 * scaled value to a bare multiple of the step would not (a 45 lb bar with
 * 10 lb jumps lives on 95/105/115…, never 100). Pure.
 */
export function scaleLoadableWeight(weight, factor, step) {
    if (typeof weight !== 'number' || weight <= 0 || !step) return weight;
    const k = Math.round((weight * factor - weight) / step);
    const out = weight + k * step;
    return out > 0 ? Math.round(out * 10) / 10 : weight;
}

/**
 * Collapse a workout history into one entry per session for ONE exercise,
 * newest-first: { date, topWeight, topReps, maxReps } in the display unit.
 * Warmups excluded; a session with no working sets is skipped.
 */
export function buildExerciseSessions(allWorkouts, exName, displayUnit) {
    if (!Array.isArray(allWorkouts) || !exName) return [];
    const sessions = [];
    for (const w of allWorkouts) {
        if (!w || !w.exercises || !w.date || !w.completedAt || w.cancelledAt) continue;
        for (const [k, ex] of Object.entries(w.exercises)) {
            const name = w.exerciseNames?.[k] || ex?.name || ex?.machine;
            if (name !== exName) continue;
            const working = (ex.sets || []).filter(s =>
                s && s.completed !== false && s.weight && (s.type || 'working') !== 'warmup');
            if (working.length === 0) break;
            let topWeight = 0;
            for (const s of working) {
                topWeight = Math.max(topWeight, convertWeight(s.weight, s.originalUnit || 'lbs', displayUnit));
            }
            topWeight = Math.round(topWeight * 10) / 10;
            let topReps = 0, maxReps = 0;
            for (const s of working) {
                maxReps = Math.max(maxReps, s.reps || 0);
                const w2 = Math.round(convertWeight(s.weight, s.originalUnit || 'lbs', displayUnit) * 10) / 10;
                if (w2 === topWeight) topReps = Math.max(topReps, s.reps || 0);
            }
            sessions.push({ date: w.date, topWeight, topReps, maxReps });
            break; // one entry per workout
        }
    }
    sessions.sort((a, b) => b.date.localeCompare(a.date));
    return sessions;
}

/**
 * Smart progressive-overload coach for the last-session card. Reads the
 * multi-session history and applies double-progression logic:
 *   1. Plateau (3+ sessions at the same top weight) → add weight / back-off.
 *   2. Hit the rep target at this weight → add weight.
 *   3. Just went up last session → consolidate before pushing again.
 *   4. Below the rep target → chase a rep first.
 *   5. Not enough signal → simple next-step suggestion.
 * Pure; returns the advisory string (or null).
 */
export function computeOverloadNudge(sessions, displayUnit, repTarget, increment) {
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    const cur = sessions[0];
    const W = cur.topWeight;
    if (!W) return null;
    const inc = increment || INCREMENT[displayUnit] || 5;
    const next = Math.round((W + inc) * 10) / 10;
    const rt = repTarget && repTarget > 0 ? repTarget : null;
    const R = cur.topReps || cur.maxReps || 0;

    // 1) Plateau — same top weight three sessions running.
    if (sessions.length >= 3 && sessions[1].topWeight === W && sessions[2].topWeight === W) {
        const repsClimbing = (sessions[0].maxReps || 0) > (sessions[2].maxReps || 0);
        return repsClimbing
            ? `3 sessions at ${W} ${displayUnit} — reps are climbing, go ${next} next`
            : `Stalled at ${W} ${displayUnit} for 3 sessions — try ${next} or a back-off set`;
    }
    // 2) Double progression — hit the rep target, time to add weight.
    if (rt && R >= rt) {
        return `${R} reps at ${W} ${displayUnit} — bump to ${next}`;
    }
    // 3) Went up last session — lock it in before the next jump.
    if (sessions.length >= 2 && W > sessions[1].topWeight) {
        return `Up from ${sessions[1].topWeight} — own ${W} ${displayUnit} for ${rt || R || 'your'} reps`;
    }
    // 4) Below the rep target — chase a rep first.
    if (rt && R > 0 && R < rt) {
        return `Add a rep — aim ${R + 1}×${W} ${displayUnit} toward ${rt}`;
    }
    // 5) Fallback — simple progressive step.
    return `Beat it — try ${next} ${displayUnit}`;
}

/**
 * Structured recommendation for the same rule matrix (5.7.3): today's target
 * weight/reps, whether it's a bump (↑ marker), and a stall flag the coach
 * context can read. Kept separate from computeOverloadNudge so the advisory
 * string and the machine-readable target never drift.
 *
 * @returns {{weight:number, reps:number|null, bumped:boolean, stalled:boolean,
 *            action:'bump'|'consolidate'|'chase-rep'|'stalled'|'start'}|null}
 */
export function progressionTarget(sessions, displayUnit, repTarget, increment) {
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    const cur = sessions[0];
    const W = cur.topWeight;
    if (!W) return null;
    const inc = increment || INCREMENT[displayUnit] || 5;
    const next = Math.round((W + inc) * 10) / 10;
    const rt = repTarget && repTarget > 0 ? repTarget : null;
    const R = cur.topReps || cur.maxReps || 0;

    const flat3 = sessions.length >= 3 && sessions[1].topWeight === W && sessions[2].topWeight === W;
    const repsClimbing = flat3 && (sessions[0].maxReps || 0) > (sessions[2].maxReps || 0);

    // Stall: three sessions at the same weight with reps NOT climbing — a true
    // plateau the coach should be told about.
    if (flat3 && !repsClimbing) {
        return { weight: W, reps: rt || R || null, bumped: false, stalled: true, action: 'stalled' };
    }
    // Earned the bump: hit the rep target (or reps climbed through a plateau).
    if ((rt && R >= rt) || repsClimbing) {
        return { weight: next, reps: rt || R || null, bumped: true, stalled: false, action: 'bump' };
    }
    // Went up last session — hold and own it.
    if (sessions.length >= 2 && W > sessions[1].topWeight) {
        return { weight: W, reps: rt || R || null, bumped: false, stalled: false, action: 'consolidate' };
    }
    // Below the rep target — same weight, chase a rep.
    if (rt && R > 0 && R < rt) {
        return { weight: W, reps: R + 1, bumped: false, stalled: false, action: 'chase-rep' };
    }
    // Not enough signal — hold last weight, no marker.
    return { weight: W, reps: rt || R || null, bumped: false, stalled: false, action: 'start' };
}
