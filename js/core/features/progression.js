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
import { plateRelativeWeight } from '../utils/weight-calculations.js';
import { isRecoveryWorkout } from './session-intent.js';

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
 *
 * Deload/recovery sessions are excluded by default (AP-7): a −35% week is
 * not a strength signal. Left in, the week AFTER a deload read sessions[0]
 * as the light session and "earned" a bump off it (0.65·W + 5), and a deload
 * at full reps looked like a fresh plateau start.
 */
export function buildExerciseSessions(allWorkouts, exName, displayUnit, { excludeRecovery = true } = {}) {
    if (!Array.isArray(allWorkouts) || !exName) return [];
    const sessions = [];
    for (const w of allWorkouts) {
        if (!w || !w.exercises || !w.date || !w.completedAt || w.cancelledAt) continue;
        if (excludeRecovery && isRecoveryWorkout(w)) continue;
        for (const [k, ex] of Object.entries(w.exercises)) {
            const name = w.exerciseNames?.[k] || ex?.name || ex?.machine;
            if (name !== exName) continue;
            const working = (ex.sets || []).filter(s =>
                s && s.completed !== false && s.weight && (s.type || 'working') !== 'warmup');
            if (working.length === 0) break;
            // Plate-relative: on a base-weight machine the advisory has to
            // talk in the same number the set row asks for, or "bump to 385"
            // sits above a field the user types 270 into.
            const wOf = (s) => convertWeight(
                plateRelativeWeight(s), s.originalUnit || 'lbs', displayUnit);
            let topWeight = 0;
            for (const s of working) {
                topWeight = Math.max(topWeight, wOf(s));
            }
            topWeight = Math.round(topWeight * 10) / 10;
            let topReps = 0, maxReps = 0;
            for (const s of working) {
                maxReps = Math.max(maxReps, s.reps || 0);
                const w2 = Math.round(wOf(s) * 10) / 10;
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
 * Today's deload target off the last BUILD session: weight scaled by the
 * intent's percentage (plate-loadable), reps at the bottom of the deload rep
 * band. Without a percentage (a volume-only deload, or a legacy labelled
 * session already scaled at start) the weight holds.
 */
export function deloadTarget(W, R, rt, intent, inc) {
    const pct = typeof intent?.weightPct === 'number' ? intent.weightPct : null;
    const weight = pct ? scaleLoadableWeight(W, 1 + pct / 100, inc) : W;
    const reps = intent?.repRange?.[0] ?? (rt || R || null);
    return { weight, reps };
}

/** The deload line for the last-session card. */
export function deloadNudgeText(W, R, rt, intent, displayUnit, inc) {
    const t = deloadTarget(W, R, rt, intent, inc);
    const repsStr = t.reps ? ` for ${t.reps}` : '';
    return t.weight !== W
        ? `Deload week — ${t.weight} ${displayUnit}${repsStr}, two reps in the tank`
        : `Deload week — hold ${W} ${displayUnit}, stop two reps short`;
}

/** Back-off factor for stall rung 2 — drop a step and rebuild. */
const BACK_OFF_FACTOR = 0.9;
/** Sessions per rung: 3 flat → chase reps, 6 → back off, 9 → rotate. */
const STALL_SESSIONS_PER_RUNG = 3;

/**
 * Stall ladder state (CP-2). A stall is a run of consecutive sessions
 * (newest first) at the same top weight with reps NOT climbing across the
 * run. Nothing is stored: the rung derives from history alone, so a
 * back-off session (different top weight) naturally resets the count.
 *
 * @returns {{run:number, repsClimbing:boolean, rung:0|1|2|3}}
 *   run   — sessions at the newest top weight (≥1)
 *   rung  — 0 = no stall · 1 chase-rep · 2 back-off · 3 rotate
 */
export function stallState(sessions) {
    if (!Array.isArray(sessions) || sessions.length === 0) return { run: 0, repsClimbing: false, rung: 0 };
    const W = sessions[0].topWeight;
    let run = 1;
    while (run < sessions.length && sessions[run].topWeight === W) run++;
    // "Climbing" compares the newest session against the start of the flat
    // run, so a slow grind (8 → 8 → 9 reps) still counts as progress.
    const repsClimbing = run >= 3 && (sessions[0].maxReps || 0) > (sessions[run - 1].maxReps || 0);
    const rung = run >= 3 && !repsClimbing ? Math.min(3, Math.floor(run / STALL_SESSIONS_PER_RUNG)) : 0;
    return { run, repsClimbing, rung };
}

/**
 * Smart progressive-overload coach for the last-session card. Reads the
 * multi-session history and applies double-progression logic:
 *   1. Plateau (3+ sessions at the same top weight) → the stall ladder:
 *      rung 1 chase a rep · rung 2 back off −10% · rung 3 rotate the movement.
 *      Reps climbing through the plateau → add weight instead.
 *   2. Hit the rep target at this weight → add weight.
 *   3. Just went up last session → consolidate before pushing again.
 *   4. Below the rep target → chase a rep first.
 *   5. Not enough signal → simple next-step suggestion.
 * Pure; returns the advisory string (or null).
 */
export function computeOverloadNudge(sessions, displayUnit, repTarget, increment, intent = null) {
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    const cur = sessions[0];
    const W = cur.topWeight;
    if (!W) return null;
    const inc = increment || INCREMENT[displayUnit] || 5;
    const next = Math.round((W + inc) * 10) / 10;
    const rt = repTarget && repTarget > 0 ? repTarget : null;
    const R = cur.topReps || cur.maxReps || 0;

    // 0) Deload session — never "go heavier", whatever history says.
    if (intent?.mode === 'deload') return deloadNudgeText(W, R, rt, intent, displayUnit, inc);

    // 1) Plateau — same top weight three sessions running.
    const stall = stallState(sessions);
    if (stall.run >= 3) {
        if (stall.repsClimbing) return `${stall.run} sessions at ${W} ${displayUnit} — reps are climbing, go ${next} next`;
        // Never offer MORE load at a detected stall (the old string did).
        if (stall.rung === 1) return `${ordinal(stall.run)} session at ${W} ${displayUnit} — hold it and chase ${R + 1}`;
        if (stall.rung === 2) {
            const back = scaleLoadableWeight(W, BACK_OFF_FACTOR, inc);
            return `${stall.run} sessions at ${W} ${displayUnit} — drop to ${back} for two sessions, then back at it`;
        }
        return `${W} ${displayUnit} has had its run (${stall.run} sessions flat) — swap in a similar movement this block`;
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

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Structured recommendation for the same rule matrix (5.7.3): today's target
 * weight/reps, whether it's a bump (↑ marker), and a stall flag the coach
 * context can read. Kept separate from computeOverloadNudge so the advisory
 * string and the machine-readable target never drift.
 *
 * Stall rungs (CP-2) all carry `stalled: true` plus `rung` and `stallRun`:
 *   rung 1 `chase-rep` — hold W, reps R+1 (advice only; nothing is seeded)
 *   rung 2 `back-off`  — weight = plate-rounded 90% of W, `backOff: true`
 *                        (the set rows seed the reduced load)
 *   rung 3 `rotate`    — hold W, `rotate: true` (hand-off to the variety
 *                        engine; until then a swap suggestion)
 *
 * A deload intent (AP-7) short-circuits to `action:'deload', deload:true`.
 *
 * @returns {{weight:number, reps:number|null, bumped:boolean, stalled:boolean,
 *            action:'bump'|'consolidate'|'chase-rep'|'back-off'|'rotate'|'start'|'deload',
 *            rung?:number, stallRun?:number, backOff?:boolean, rotate?:boolean}|null}
 */
export function progressionTarget(sessions, displayUnit, repTarget, increment, intent = null) {
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    const cur = sessions[0];
    const W = cur.topWeight;
    if (!W) return null;
    const inc = increment || INCREMENT[displayUnit] || 5;
    const next = Math.round((W + inc) * 10) / 10;
    const rt = repTarget && repTarget > 0 ? repTarget : null;
    const R = cur.topReps || cur.maxReps || 0;

    // Deload session: the stall ladder doesn't run (a planned light week is
    // not a plateau) and nothing is a bump.
    if (intent?.mode === 'deload') {
        const t = deloadTarget(W, R, rt, intent, inc);
        return { weight: t.weight, reps: t.reps, bumped: false, stalled: false, action: 'deload', deload: true };
    }

    const stall = stallState(sessions);
    const repsClimbing = stall.run >= 3 && stall.repsClimbing;

    // Stall: three+ sessions at the same weight with reps NOT climbing — a
    // true plateau, answered by the rung rather than a terminal flag.
    if (stall.rung >= 1) {
        const base = { bumped: false, stalled: true, rung: stall.rung, stallRun: stall.run };
        if (stall.rung === 1) return { ...base, weight: W, reps: R + 1, action: 'chase-rep' };
        if (stall.rung === 2) {
            return { ...base, weight: scaleLoadableWeight(W, BACK_OFF_FACTOR, inc), reps: rt || R || null, action: 'back-off', backOff: true };
        }
        return { ...base, weight: W, reps: rt || R || null, action: 'rotate', rotate: true };
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
