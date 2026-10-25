// AU-11 — the engine cross-checks its own numbers: a target far below the
// lift's 4-week best was computed off a light session; a verdict off a
// 6-week-old session restarts at the last weight. Plus the characterization
// test: every action has a defined path through every consumer.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    convertWeight: (w, from, to) => (from === to ? w : from === 'kg' ? Math.round(w * 2.20462 * 10) / 10 : Math.round(w * 0.453592 * 10) / 10),
}));

import {
    progressionTarget, computeOverloadNudge, PROGRESSION_ACTIONS, STALE_SESSION_DAYS, buildExerciseSessions,
} from '../../js/core/features/progression.js';
import { verdictLine } from '../../js/core/features/coach-rules.js';
import { seedSetsFromLastSession } from '../../js/core/workout/set-seeding.js';
import { progressionGuard } from '../../js/core/features/coach-guards.js';

const S = (date, topWeight, topReps) => ({ date, topWeight, topReps, maxReps: topReps });

describe('stale history → reacquaint (AU-11)', () => {
    const old = [S('2026-08-01', 90, 12), S('2026-07-25', 85, 12)];

    it('inert without today — every existing caller unchanged', () => {
        expect(progressionTarget(old, 'lbs', 12, 5)).toMatchObject({ action: 'bump', weight: 95 });
    });

    it(`> ${STALE_SESSION_DAYS} days since the last session → start at the last weight, no bump`, () => {
        expect(progressionTarget(old, 'lbs', 12, 5, null, '2026-10-25')).toMatchObject({
            action: 'reacquaint', weight: 90, reps: 12, bumped: false, stalled: false, staleDays: 85,
        });
        expect(progressionTarget(old, 'lbs', 12, 5, null, '2026-08-20').action).toBe('bump'); // 19 days: fine
        expect(computeOverloadNudge(old, 'lbs', 12, 5, null, '2026-10-25')).toBe('Last done 85 days ago — start at 90 lbs and feel it out');
    });

    it('a deload still wins over staleness', () => {
        expect(progressionTarget(old, 'lbs', 12, 5, { mode: 'deload', weightPct: -35 }, '2026-10-25').action).toBe('deload');
    });
});

describe('light-target cross-check (AU-11)', () => {
    // Newest session light and un-noted (AU-10(a) can't see it).
    const sessions = [S('2026-10-19', 105, 10), S('2026-10-12', 160, 10), S('2026-10-05', 155, 10), S('2026-09-28', 150, 10)];

    it('a target < 80% of the 4-week best e1RM is recomputed from the last normal session and flagged', () => {
        expect(progressionTarget(sessions, 'lbs', 10, 10)).toMatchObject({
            action: 'bump', weight: 170, warning: 'light-session', fromSession: '2026-10-12',
        });
        expect(computeOverloadNudge(sessions, 'lbs', 10, 10)).toBe('10 reps at 160 lbs — bump to 170 (last session looked light — going off 2026-10-12)');
    });

    it('a planned deload and an honest back-off are not "light"', () => {
        expect(progressionTarget(sessions, 'lbs', 10, 10, { mode: 'deload', weightPct: -35 }).warning).toBeUndefined();
        const flat = [S('2026-10-19', 185, 6), S('2026-10-12', 185, 6), S('2026-10-05', 185, 6), S('2026-09-28', 185, 6), S('2026-09-21', 185, 6), S('2026-09-14', 185, 6)];
        const t = progressionTarget(flat, 'lbs', 8, 10);
        expect(t).toMatchObject({ action: 'back-off', rung: 2 });
        expect(t.warning).toBeUndefined();
    });

    it('rows follow the target when the session they would copy was skipped (fromTarget)', () => {
        const last = [{ weight: 105, reps: 10, originalUnit: 'lbs', type: 'working' }, { weight: 45, reps: 10, type: 'warmup' }];
        const rows = seedSetsFromLastSession(last, { weight: 170, reps: 10, bumped: true, action: 'bump' }, null, 'lbs', 10, { fromTarget: true });
        expect(rows[0]).toMatchObject({ weight: 170, reps: 10, _suggested: true });
        expect(rows[1]).toMatchObject({ weight: 45, reps: 10 });
    });
});

describe('every action has a path through every consumer (characterization)', () => {
    const histories = [
        [], [S('2026-10-19', 100, 8)], [S('2026-10-19', 105, 8), S('2026-10-12', 100, 8)], [S('2026-10-19', 105, 6), S('2026-10-12', 100, 6)],
        [S('2026-10-19', 100, 6), S('2026-10-12', 100, 6), S('2026-10-05', 100, 6)],
        Array.from({ length: 6 }, (_, i) => S(`2026-10-${String(19 - i * 2).padStart(2, '0')}`, 100, 6)),
        Array.from({ length: 9 }, (_, i) => S(`2026-10-${String(19 - i * 2).padStart(2, '0')}`, 100, 6)),
        [S('2026-10-19', 100, 10)], [S('2026-06-01', 100, 8)],
    ];
    const intents = [null, { mode: 'deload', weightPct: -35 }, { mode: 'peak', weightPct: 5 }];

    it('progressionTarget only ever returns a listed action — and every listed action is reachable', () => {
        const seen = new Set();
        for (const h of histories) for (const intent of intents) for (const today of [null, '2026-10-25']) for (const rt of [8, null]) {
            const t = progressionTarget(h, 'lbs', rt, 5, intent, today);
            if (t) { expect(PROGRESSION_ACTIONS).toContain(t.action); seen.add(t.action); }
        }
        expect([...seen].sort()).toEqual([...PROGRESSION_ACTIONS].sort());
    });

    it('verdictLine, prefill and the progression guard handle every action', () => {
        const last = [{ weight: 100, reps: 8, originalUnit: 'lbs', type: 'working' }];
        for (const action of PROGRESSION_ACTIONS) {
            const v = { action, weight: 100, reps: 8, rung: action === 'chase-rep' ? 0 : 2, stallRun: 6, staleDays: 60, last: { weight: 100, reps: 8, date: '2026-10-19' } };
            const line = verdictLine(v, 'lbs');
            expect(line, action).toBeTruthy();
            expect(line, action).not.toBe('no logged history — start conservative');
            const rows = seedSetsFromLastSession(last, { ...v, bumped: action === 'bump', backOff: action === 'back-off' }, action === 'deload' ? { mode: 'deload', weightPct: -35 } : null, 'lbs', 5);
            expect(rows, action).toHaveLength(1);
            expect(typeof rows[0].weight === 'number' || rows[0].weight === null, action).toBe(true);
        }
        const workouts = [{ date: '2026-06-01', completedAt: '2026-06-01T18:00:00Z', exerciseNames: { exercise_0: 'Bench' }, exercises: { exercise_0: { sets: [{ weight: 100, reps: 8, type: 'working' }] } } }];
        expect(() => progressionGuard({ workouts, exercise: 'Bench', weight: 120, repTarget: 8 })).not.toThrow();
        expect(buildExerciseSessions(workouts, 'Bench', 'lbs')).toHaveLength(1);
    });
});
