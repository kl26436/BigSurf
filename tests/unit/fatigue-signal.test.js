// AP-22 phase 1 — fatigue signal from RPE-at-load and readiness. Leading
// indicators, REPORTED (verdicts, scoreboard, dashboard, deload reasons) but
// never changing a target. Pure modules, imported real.

import { describe, it, expect } from 'vitest';
import { buildExerciseSessions, fatigueState, progressionTarget } from '../../js/core/features/progression.js';
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

    it('phase 1: progressionTarget is unchanged by fatigue', () => {
        const s = sessionsOf(creeping);
        const t = progressionTarget(s, 'lbs', 8, 5);
        expect(t).toMatchObject({ action: 'chase-rep', rung: 1, weight: 185 }); // the stall ladder, as before
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

describe('checkDeloadNeeded reasons (phase 1: reported, not recommended)', () => {
    it('lists the fatigue reason without flipping needed', () => {
        const d = checkDeloadNeeded(creeping, undefined, { today: TODAY });
        expect(d.needed).toBe(false);
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

    it('fatigueSignals ignores lifts without RPE', () => {
        expect(fatigueSignals(creeping.map(w => ({ ...w, exercises: { exercise_0: { sets: [set(185, 8)] } } })), { today: TODAY })).toEqual([]);
    });
});

describe('fatigue in the verdicts and the scoreboard', () => {
    const templates = [{ id: 'push', name: 'Push day', exercises: [{ machine: 'Smith Bench', defaultReps: 8, role: 'primary' }] }];

    it('the verdict line carries the signal; the target is the same as without it', () => {
        const v = computeVerdicts({ workouts: creeping, templates, weekPlan: { days: { sat: 'push' } }, today: TODAY });
        const e = v.exercises[0];
        expect(e).toMatchObject({ action: 'chase-rep', weight: 185, fatigue: 'RPE 7.5→8.5→9 at 185 over 3 sessions' });
        const text = formatVerdictsContext(v);
        expect(text).toContain('· fatigue: RPE 7.5→8.5→9 at 185 over 3 sessions — target unchanged');
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
