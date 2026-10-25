// AP-22 — fatigue signal from RPE-at-load and readiness. Phase 1 reports it
// (verdicts, scoreboard, dashboard, deload reasons); phase 2 acts on it (a
// fatigued stall backs off a rung early, a fatigued lift isn't bumped, the
// deload comes a week early). Pure modules, imported real.

import { describe, it, expect } from 'vitest';
import { buildExerciseSessions, fatigueState, progressionTarget, computeOverloadNudge, scaleLoadableWeight } from '../../js/core/features/progression.js';
import { rpePromptSetIndex } from '../../js/core/workout/set-seeding.js';
import { checkDeloadNeeded, readinessState, fatigueSignals } from '../../js/core/features/training-rules.js';
import { buildScoreboard } from '../../js/core/features/progress-scoreboard.js';
import { computeVerdicts, formatVerdictsContext } from '../../js/core/features/coach-rules.js';

const TODAY = '2026-10-24';
const set = (weight, reps, rpe, extra = {}) => ({
    weight, reps, originalUnit: 'lbs', type: 'working', completed: true, ...(rpe != null ? { rpe } : {}), ...extra,
});
const wo = (date, sets, extra = {}) => ({
    date, completedAt: `${date}T18:00:00Z`, workoutType: 'Push day',
    exerciseNames: { exercise_0: 'Smith Bench' },
    exercises: { exercise_0: { sets } },
    ...extra,
});
// The specimen shape: same load, effort climbing.
const creeping = [
    wo('2026-10-08', [set(185, 8, 7), set(185, 8, 7.5)]),
    wo('2026-10-15', [set(185, 8, 8.5)]),
    wo('2026-10-22', [set(185, 8, 9)]),
];
const sessionsOf = (ws) => buildExerciseSessions(ws, 'Smith Bench', 'lbs');

describe('buildExerciseSessions topRpe', () => {
    it('is the max RPE among working sets at the top load; null when none logged', () => {
        const s = sessionsOf([wo('2026-10-01', [set(185, 8, 7), set(185, 8, 8), set(165, 10, 9.5)])]);
        expect(s[0]).toMatchObject({ topWeight: 185, topRpe: 8, rpeLogged: true });
        const none = sessionsOf([wo('2026-10-01', [set(185, 8)])]);
        expect(none[0]).toMatchObject({ topRpe: null, rpeLogged: false });
    });
});

describe('fatigueState', () => {
    it('is null until minSessions sessions carry RPE — never a false signal', () => {
        expect(fatigueState(sessionsOf(creeping.slice(1)))).toBeNull();
        expect(fatigueState(sessionsOf([wo('2026-10-01', [set(185, 8)]), ...creeping.slice(1)]))).toBeNull();
    });

    it('rising RPE at constant load → fatigued', () => {
        const f = fatigueState(sessionsOf(creeping));
        expect(f).toMatchObject({ fatigued: true, load: 185, rpeTrend: [7.5, 8.5, 9], repsTrend: [8, 8, 8] });
        expect(f.reason).toBe('RPE 7.5→8.5→9 at 185 over 3 sessions');
    });

    it('rising RPE with rising load is progress, not fatigue', () => {
        const f = fatigueState(sessionsOf([
            wo('2026-10-08', [set(175, 8, 7)]), wo('2026-10-15', [set(185, 8, 8)]), wo('2026-10-22', [set(195, 8, 9)]),
        ]));
        expect(f.fatigued).toBe(false);
    });

    it('falling reps at rising RPE → fatigued', () => {
        const f = fatigueState(sessionsOf([
            wo('2026-10-08', [set(185, 8, 8)]), wo('2026-10-15', [set(185, 7, 8.5)]), wo('2026-10-22', [set(185, 6, 9)]),
        ]));
        expect(f.fatigued).toBe(true);
    });

    it('RPE 9.5+ at a load once done at ≤ 8 → fatigued', () => {
        const f = fatigueState(sessionsOf([
            wo('2026-10-01', [set(185, 8, 8)]), wo('2026-10-08', [set(195, 5, 9)]),
            wo('2026-10-15', [set(195, 5, 9)]), wo('2026-10-22', [set(185, 8, 9.5)]),
        ]));
        expect(f).toMatchObject({ fatigued: true, reason: 'RPE 9.5 at 185, was RPE 8 on 2026-10-01' });
    });

    it('a deload session in the window is excluded (via buildExerciseSessions)', () => {
        const withDeload = [...creeping.slice(0, 2), wo('2026-10-22', [set(120, 12, 6)], { sessionLabel: 'Deload' })];
        expect(fatigueState(sessionsOf(withDeload))).toBeNull(); // only two rated build sessions left
    });

});

describe('progressionTarget acts on fatigue (phase 2)', () => {
    const back = scaleLoadableWeight(185, 0.9, 5);

    it('a fatigued rung-1 stall skips to the back-off rung', () => {
        const t = progressionTarget(sessionsOf(creeping), 'lbs', 8, 5);
        expect(t).toMatchObject({ action: 'back-off', rung: 2, early: true, backOff: true, weight: back, fatigued: true });
        expect(t.fatigueReason).toBe('RPE 7.5→8.5→9 at 185 over 3 sessions');
        const nudge = computeOverloadNudge(sessionsOf(creeping), 'lbs', 8, 5);
        expect(nudge).toContain('Effort is climbing at 185 lbs');
        expect(nudge).toContain(`drop to ${back}`);
    });

    it('the same history without RPE keeps the normal ladder', () => {
        const plain = creeping.map(w => ({ ...w, exercises: { exercise_0: { sets: [set(185, 8)] } } }));
        const t = progressionTarget(sessionsOf(plain), 'lbs', 8, 5);
        expect(t).toMatchObject({ action: 'chase-rep', rung: 1, weight: 185 });
        expect(t.fatigued).toBeUndefined();
    });

    it('reps earned a bump but effort spiked → hold, card agrees', () => {
        const spiked = [
            wo('2026-10-08', [set(185, 8, 8)]), wo('2026-10-15', [set(180, 8, 8)]), wo('2026-10-22', [set(185, 8, 9.5)]),
        ];
        const t = progressionTarget(sessionsOf(spiked), 'lbs', 8, 5);
        expect(t).toMatchObject({ action: 'consolidate', weight: 185, bumped: false, fatigued: true });
        expect(computeOverloadNudge(sessionsOf(spiked), 'lbs', 8, 5)).toContain('hold 185 before the next jump');
        // Without the RPE spike the same reps bump.
        const easy = [...spiked.slice(0, 2), wo('2026-10-22', [set(185, 8, 8)])];
        expect(progressionTarget(sessionsOf(easy), 'lbs', 8, 5)).toMatchObject({ action: 'bump', weight: 190 });
    });

    it('a deload session still wins over fatigue', () => {
        const t = progressionTarget(sessionsOf(creeping), 'lbs', 8, 5, { mode: 'deload', weightPct: -35 });
        expect(t.action).toBe('deload');
    });
});

describe('rpePromptSetIndex (one RPE tap per exercise)', () => {
    it('the heaviest completed working set; ties → the later one; warmups and open sets skipped', () => {
        expect(rpePromptSetIndex([
            { weight: 95, completed: true, type: 'warmup' }, { weight: 185, completed: true },
            { weight: 185, completed: true }, { weight: 205, completed: false },
        ])).toBe(2);
        expect(rpePromptSetIndex([{ weight: 185, completed: false }])).toBe(-1);
        expect(rpePromptSetIndex([{ weight: null, completed: true }, { weight: null, completed: true }])).toBe(1);
    });
});

describe('readinessState', () => {
    it('counts only check-ins at 2/5 or below, in the window', () => {
        const ws = [
            wo('2026-10-10', [], { readiness: { score: 1 } }),          // outside 10 days
            wo('2026-10-16', [], { readiness: { score: 2 } }),
            wo('2026-10-19', [], { readiness: { score: 3 } }),
            wo('2026-10-21', [], { readiness: { score: 2 } }),
            wo('2026-10-23', [], { readiness: { score: 1 } }),
            wo('2026-10-24', []),                                        // no check-in
        ];
        expect(readinessState(ws, { today: TODAY })).toEqual({ low: 3, of: 4, avg: 2, readinessLow: true });
    });
});

describe('checkDeloadNeeded reasons', () => {
    it('lists the fatigue reason without flipping needed', () => {
        const d = checkDeloadNeeded(creeping, undefined, { today: TODAY });
        expect(d.needed).toBe(false);
        expect(d.source).toBeNull();
        expect(d.fatigue).toEqual([{ exercise: 'Smith Bench', reason: 'RPE 7.5→8.5→9 at 185 over 3 sessions', load: 185 }]);
        expect(d.reasons).toContain('effort rising on Smith Bench: RPE 7.5→8.5→9 at 185 over 3 sessions');
    });

    it('lists low readiness', () => {
        const ws = ['2026-10-18', '2026-10-20', '2026-10-22'].map(d => wo(d, [set(185, 8)], { readiness: { score: 2 } }));
        const d = checkDeloadNeeded(ws, undefined, { today: TODAY });
        expect(d.readinessLow).toBe(true);
        expect(d.reasons[0]).toMatch(/^readiness ≤2\/5 on 3 of 3 check-ins/);
    });

    it('stays quiet inside a recovery week', () => {
        const ws = [...creeping, wo('2026-10-23', [set(120, 12)], { sessionLabel: 'Deload' })];
        expect(checkDeloadNeeded(ws, undefined, { today: TODAY }).reasons).toEqual([]);
    });

    // Phase 2 — one week short of the run, with effort rising on 2+ main lifts.
    // Same tonnage every week, so no week reads as a recovery week.
    const even = [wo('2026-10-08', [set(185, 8, 7.5)]), creeping[1], creeping[2]];
    const twoLifts = even.map(w => ({
        ...w,
        exerciseNames: { exercise_0: 'Smith Bench', exercise_1: 'Leg Press' },
        exercises: { exercise_0: w.exercises.exercise_0, exercise_1: w.exercises.exercise_0 },
    }));
    const t = { DELOAD_DAYS_PER_WEEK: 1, DELOAD_CONSECUTIVE_WEEKS: 4 };

    it('a week early when two main lifts show it', () => {
        const d = checkDeloadNeeded(twoLifts, t, { today: TODAY, primaries: ['Smith Bench', 'leg press'] });
        expect(d).toMatchObject({ needed: true, source: 'fatigue', consecutiveHardWeeks: 3, fatiguedMain: ['Smith Bench', 'Leg Press'] });
        expect(d.reasons[0]).toBe('3 hard weeks and effort rising on 2 main lifts — a week early');
    });

    it('not early on one main lift, or two weeks short', () => {
        expect(checkDeloadNeeded(twoLifts, t, { today: TODAY, primaries: ['Smith Bench'] }).needed).toBe(false);
        expect(checkDeloadNeeded(twoLifts, { ...t, DELOAD_CONSECUTIVE_WEEKS: 5 }, { today: TODAY }).needed).toBe(false);
        expect(checkDeloadNeeded(twoLifts, { ...t, DELOAD_CONSECUTIVE_WEEKS: 3 }, { today: TODAY }).source).toBe('weeks');
    });

    it('low readiness alone also pulls it a week early', () => {
        const tired = even.map(w => ({ ...w, readiness: { score: 2 } }));
        const d = checkDeloadNeeded(tired, { ...t, READINESS_WINDOW_DAYS: 30, READINESS_LOW_COUNT: 3 }, { today: TODAY, primaries: [] });
        expect(d).toMatchObject({ needed: true, source: 'fatigue', readinessLow: true });
    });

    it('fatigueSignals ignores lifts without RPE', () => {
        expect(fatigueSignals(creeping.map(w => ({ ...w, exercises: { exercise_0: { sets: [set(185, 8)] } } })), { today: TODAY })).toEqual([]);
    });
});

describe('fatigue in the verdicts and the scoreboard', () => {
    const templates = [{ id: 'push', name: 'Push day', exercises: [{ machine: 'Smith Bench', defaultReps: 8, role: 'primary' }] }];

    it('the verdict is the fatigued target, and says why', () => {
        const v = computeVerdicts({ workouts: creeping, templates, weekPlan: { days: { sat: 'push' } }, today: TODAY });
        const e = v.exercises[0];
        expect(e).toMatchObject({ action: 'back-off', early: true, fatigue: 'RPE 7.5→8.5→9 at 185 over 3 sessions' });
        const text = formatVerdictsContext(v);
        expect(text).toContain('stall rung 2 a rung early — effort rising');
        expect(text).toContain('· fatigue: RPE 7.5→8.5→9 at 185 over 3 sessions (already in the target');
        expect(text).toContain('early fatigue signs: effort rising on Smith Bench');
    });

    it('readiness line in the verdicts block', () => {
        const ws = creeping.map(w => ({ ...w, readiness: { score: 2 } }));
        const text = formatVerdictsContext(computeVerdicts({ workouts: ws, templates, today: TODAY }));
        expect(text).toContain('Readiness (last check-ins): avg 2/5, 2 of 2 at ≤2/5');
    });

    it('scoreboard primary carries the fatigue reason (dashboard "Effort ↑" chip)', () => {
        const sb = buildScoreboard({ workouts: creeping, templates, today: TODAY });
        expect(sb.primaries[0].fatigue).toBe('RPE 7.5→8.5→9 at 185 over 3 sessions');
    });
});
