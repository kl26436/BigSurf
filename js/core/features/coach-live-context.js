// Live coach context — core/features/coach-live-context.js (AP-20c)
//
// The compact (~500 token) live-workout snapshot the live coach's first turn
// carries. Pure; split out of coach-live.js (whose import graph pulls the
// workout barrel and Firebase) so the eval runner can build exactly what the
// phone sends. coach-live.js re-exports both functions.

import { getEquipmentAtLocation } from './equipment-planner.js';
import { weightIncrement } from './progression.js';
import { describeWeekTarget } from './week-targets.js';
import { convertToUnit } from './coach-outcomes.js';

/**
 * AP-9 — the one `Session:` line for a deload or peak session (AP-6
 * sessionIntent). '' for build/freestyle/none: an ordinary session needs no
 * steering line.
 */
export function buildLiveSessionLine(intent) {
    if (intent?.mode !== 'deload' && intent?.mode !== 'peak') return '';
    const desc = describeWeekTarget(intent);
    const scope = intent.source === 'program' ? 'week' : 'session';
    const where = intent.source === 'program' && intent.week
        ? `, week ${intent.week}${intent.weeks ? ` of ${intent.weeks}` : ''}` : '';
    const head = `${intent.mode === 'deload' ? 'Deload' : 'Peak'} ${scope}${where}${desc ? ` (${desc})` : ''}`;
    const rule = intent.mode === 'deload'
        ? 'propose_next_target must not exceed the targets already on the set rows.'
        : 'heavier top sets are planned — propose loadable weights at or near the set-row targets, never beyond them.';
    return `Session: ${head} — ${rule}`;
}

/** Heaviest non-warmup set of last session, in `unit`: "8×225". */
function lastTopSet(sets, unit) {
    let best = null;
    for (const s of sets || []) {
        if (!s || s.type === 'warmup' || !(s.reps || s.weight)) continue;
        const w = s.weight ? convertToUnit(s.weight, s.originalUnit || 'lbs', unit) : 0;
        if (!best || w > best.w) best = { w, reps: s.reps };
    }
    return best ? `${best.reps || '?'}×${best.w || 'BW'}` : '';
}

/** The rules engine's verdict for an exercise (AP-15d): "rule: bump → 230×8". */
function progressionVerdict(prog, unit) {
    if (!prog?.action) return '';
    const rung = prog.rung ? ` (stall rung ${prog.rung})` : '';
    const target = prog.weight ? ` → ${prog.weight}${prog.reps ? `×${prog.reps}` : ''} ${unit}` : '';
    return `rule: ${prog.action}${rung}${target}`;
}

/**
 * Compact snapshot of the workout in progress. Pure: state injected so tests
 * don't need the real AppState.
 *
 * AP-9/15d: also carries the session's intent (deload/peak `Session:` line),
 * its label, the user's injuries, and per exercise the rules engine's
 * `_progression` verdict + last session's top set — the coach used to see
 * only the sets logged so far and re-derive (or contradict) the app.
 */
export function buildLiveWorkoutContext({
    currentWorkout, savedData, globalUnit = 'lbs', equipment = [], elapsedMinutes = 0,
    plates = null, sessionIntent = null, injuries = '', exerciseUnits = {},
} = {}) {
    if (!currentWorkout || !savedData) return 'No workout in progress.';

    const lines = [];
    const loc = savedData.location;
    const gym = typeof loc === 'object' ? loc?.name : loc;
    const label = savedData.sessionLabel ? ` · ${savedData.sessionLabel}` : '';
    lines.push(`Workout: ${savedData.workoutType || currentWorkout.name || 'Workout'}${label} · ${elapsedMinutes} min elapsed${gym ? ` · at ${gym}` : ''}`);
    const sessionLine = buildLiveSessionLine(sessionIntent);
    if (sessionLine) lines.push(sessionLine);
    if (savedData.readiness?.score) {
        lines.push(`Readiness today: ${savedData.readiness.score}/5${savedData.readiness.note ? ` ("${savedData.readiness.note}")` : ''}`);
    }
    if (injuries) lines.push(`Injuries / limitations: ${injuries}`);
    lines.push(`Unit: ${globalUnit}`);
    if (Array.isArray(plates) && plates.length) {
        lines.push(`Plates (per side): ${[...plates].sort((a, b) => b - a).join(', ')} ${globalUnit} — smallest real jump ${weightIncrement(globalUnit, plates)} ${globalUnit}; only propose loadable weights`);
    }

    // Per-exercise state — done sets vs plan; the first incomplete is "current".
    const exercises = currentWorkout.exercises || [];
    let currentMarked = false;
    exercises.forEach((ex, idx) => {
        const name = ex.machine || ex.name || 'Exercise';
        const saved = savedData.exercises?.[`exercise_${idx}`] || {};
        const done = (saved.sets || []).filter(s => s.completed && (s.reps || s.weight));
        const doneStr = done.map(s => `${s.reps || '?'}×${s.weight || 'BW'}${s.rpe ? ` @RPE ${s.rpe}` : ''}${s.type && s.type !== 'working' ? ` (${s.type})` : ''}`).join(', ');
        const planned = ex.sets || 3;
        const isCurrent = !currentMarked && done.length < planned && !saved.completed;
        if (isCurrent) currentMarked = true;
        const equip = saved.equipment || ex.equipment;
        const exUnit = exerciseUnits?.[idx] || globalUnit;
        const top = lastTopSet(ex._lastSessionSets, exUnit);
        const lastStr = top
            ? ` · last: ${top}${ex._lastSessionDaysAgo != null ? ` (${ex._lastSessionDaysAgo}d ago)` : ''}${ex._lastSessionOtherMachine ? ' on another machine' : ''}`
            : '';
        const verdict = progressionVerdict(ex._progression, exUnit);
        lines.push(`${isCurrent ? '→ ' : ''}${name}${equip ? ` [${equip}]` : ''}: ${done.length}/${planned} sets${doneStr ? ` — ${doneStr}` : ''}${lastStr}${verdict ? ` · ${verdict}` : ''}${saved.notes ? ` — note: "${saved.notes}"` : ''}`);
    });

    // Equipment available at this gym (so swaps are grounded in reality).
    if (gym && equipment.length) {
        const here = getEquipmentAtLocation(equipment, gym).map(e => e.name).filter(Boolean);
        if (here.length) {
            lines.push(`Equipment at ${gym} (${here.length}): ${here.slice(0, 30).join(', ')}${here.length > 30 ? ', …' : ''}`);
        }
    }

    return lines.join('\n');
}
