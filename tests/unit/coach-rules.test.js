// AP-16 — rules verdicts: the rules engine's answers, computed once and
// handed to the coach as facts. Pure module (and its functions/ mirror runs
// the same code — movement-patterns-mirror.test.js enforces parity).

import { describe, it, expect } from 'vitest';
import {
    pickVerdictExercises, computeVerdicts, formatVerdictsContext, verdictLine,
} from '../../js/core/features/coach-rules.js';
import { scaleLoadableWeight } from '../../js/core/features/progression.js';

const TODAY = '2026-10-24'; // a Saturday

const set = (weight, reps, extra = {}) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true, ...extra });
function wo(date, workoutType, exercises, extra = {}) {
    return {
        date,
        completedAt: `${date}T18:00:00Z`,
        workoutType,
        exerciseNames: Object.fromEntries(exercises.map((e, i) => [`exercise_${i}`, e.name])),
        exercises: Object.fromEntries(exercises.map((e, i) => [`exercise_${i}`, { sets: e.sets }])),
        ...extra,
    };
}

const push = { id: 'push', name: 'Push day', exercises: [{ machine: 'Bench Press', sets: 3, defaultReps: 8 }, { machine: 'Shoulder Press', reps: 10 }] };
const pull = { id: 'pull', name: 'Pull day', exercises: [{ machine: 'Lat Pulldown', defaultReps: 10 }, { machine: 'Bench Press' }] };
const legs = { id: 'legs', name: 'Legs', exercises: [{ machine: 'Squat', defaultReps: 5 }] };

describe('pickVerdictExercises', () => {
    it("today's planned workout first, then the rest of the week from tomorrow, deduped", () => {
        const weekPlan = { days: { sat: 'pull', mon: 'push', tue: 'legs' } };
        const picks = pickVerdictExercises({ templates: [push, pull, legs], weekPlan, today: TODAY });
        expect(picks.map(p => [p.name, p.template, p.today])).toEqual([
            ['Lat Pulldown', 'Pull day', true],
            ['Bench Press', 'Pull day', true],
            ['Shoulder Press', 'Push day', false],
            ['Squat', 'Legs', false],
        ]);
        expect(picks.find(p => p.name === 'Squat').repTarget).toBe(5);
    });

    it('without a week plan, the most recently used templates', () => {
        const workouts = [wo('2026-10-20', 'Legs', []), wo('2026-10-10', 'Push day', [])];
        const picks = pickVerdictExercises({ templates: [push, pull, legs], today: TODAY, workouts });
        expect(picks.map(p => p.template)).toEqual(['Legs', 'Push day', 'Push day']);
    });

    it('skips archived templates', () => {
        const weekPlan = { days: { sat: 'pull' } };
        expect(pickVerdictExercises({ templates: [{ ...pull, archived: true }], weekPlan, today: TODAY })).toEqual([]);
    });
});

describe('computeVerdicts', () => {
    const weekPlan = { days: { sat: 'push' } };

    it('bump when the rep target was hit — same answer as the set rows', () => {
        const workouts = [
            wo('2026-10-14', 'Push day', [{ name: 'Bench Press', sets: [set(190, 8)] }]),
            wo('2026-10-21', 'Push day', [{ name: 'Bench Press', sets: [set(200, 8)] }]),
        ];
        const v = computeVerdicts({ workouts, templates: [push], weekPlan, today: TODAY });
        const bench = v.exercises.find(e => e.name === 'Bench Press');
        expect(bench).toMatchObject({ action: 'bump', weight: 205, reps: 8, bumped: true, today: true });
        expect(bench.last).toEqual({ weight: 200, reps: 8, date: '2026-10-21' });
    });

    it('plate-aware increment: a gym without 2.5s jumps by 10', () => {
        const workouts = [wo('2026-10-21', 'Push day', [{ name: 'Bench Press', sets: [set(200, 8)] }])];
        const v = computeVerdicts({ workouts, templates: [push], weekPlan, today: TODAY, plates: [45, 25, 10, 5] });
        expect(v.increment).toBe(10);
        expect(v.exercises.find(e => e.name === 'Bench Press').weight).toBe(210);
    });

    it('a flat run reports the stall rung', () => {
        const workouts = ['2026-10-07', '2026-10-14', '2026-10-21']
            .map(d => wo(d, 'Push day', [{ name: 'Bench Press', sets: [set(200, 7)] }]));
        const bench = computeVerdicts({ workouts, templates: [push], weekPlan, today: TODAY })
            .exercises.find(e => e.name === 'Bench Press');
        expect(bench).toMatchObject({ action: 'chase-rep', rung: 1, stallRun: 3, weight: 200, reps: 8, stalled: true });
    });

    it('a program deload week turns every verdict into the deload target', () => {
        const program = {
            name: 'Block', startDate: '2026-10-19', weeks: 4, active: true,
            weekTargets: [{ week: 1, label: 'Deload', weightPct: -35 }],
        };
        const workouts = [
            wo('2026-10-14', 'Push day', [{ name: 'Bench Press', sets: [set(190, 8)] }]),
            wo('2026-10-21', 'Push day', [{ name: 'Bench Press', sets: [set(200, 8)] }]),
        ];
        const v = computeVerdicts({ workouts, templates: [push], weekPlan, program, today: TODAY });
        expect(v.intent.mode).toBe('deload');
        const bench = v.exercises.find(e => e.name === 'Bench Press');
        expect(bench).toMatchObject({ action: 'deload', bumped: false, weight: scaleLoadableWeight(200, 0.65, 5) });
    });

    it("an in-progress session's stored intent wins over the derived one", () => {
        const workouts = [wo('2026-10-21', 'Push day', [{ name: 'Bench Press', sets: [set(200, 8)] }])];
        const v = computeVerdicts({
            workouts, templates: [push], weekPlan, today: TODAY,
            intent: { mode: 'deload', weightPct: -30, label: 'Deload', source: 'manual' },
        });
        expect(v.exercises.find(e => e.name === 'Bench Press').action).toBe('deload');
    });

    it('matches history case-insensitively (template "bench press" vs log "Bench Press")', () => {
        const workouts = [wo('2026-10-21', 'Push day', [{ name: 'Bench Press', sets: [set(200, 8)] }])];
        const t = { ...push, exercises: [{ machine: 'bench press', defaultReps: 8 }] };
        const v = computeVerdicts({ workouts, templates: [t], weekPlan, today: TODAY });
        expect(v.exercises[0]).toMatchObject({ name: 'Bench Press', action: 'bump' });
    });

    it('MRV headroom for this ISO week only', () => {
        const workouts = [
            wo('2026-10-12', 'Push day', [{ name: 'Bench Press', sets: Array.from({ length: 10 }, () => set(100, 8)) }]),
            wo('2026-10-20', 'Push day', [{ name: 'Bench Press', sets: Array.from({ length: 6 }, () => set(100, 8)) }]),
        ];
        const v = computeVerdicts({ workouts, today: TODAY });
        expect(v.volume).toEqual([{ bodyPart: 'Chest', sets: 6, mrv: 22, headroom: 16, status: 'ok' }]);
    });

    it('carries the progress scoreboard and the deload check', () => {
        const v = computeVerdicts({ workouts: [wo('2026-10-21', 'Push day', [{ name: 'Bench Press', sets: [set(200, 5)] }])], today: TODAY });
        expect(v.scoreboard.primaries.map(p => p.name)).toEqual(['Bench Press']);
        expect(v.deload).toMatchObject({ needed: false });
    });
});

describe('formatVerdictsContext', () => {
    it('renders an authoritative block with targets, deload check, volume and scoreboard', () => {
        const workouts = [
            wo('2026-10-14', 'Push day', [{ name: 'Bench Press', sets: [set(190, 8)] }]),
            wo('2026-10-21', 'Push day', [{ name: 'Bench Press', sets: [set(200, 8)] }]),
        ];
        const text = formatVerdictsContext(computeVerdicts({ workouts, templates: [push], weekPlan: { days: { sat: 'push' } }, today: TODAY }));
        expect(text).toMatch(/^Rules verdicts \(computed by the app/);
        expect(text).toContain("don't override them");
        expect(text).toContain('Deload check: not due');
        expect(text).toContain('- Bench Press (Push day, today): bump → 205×8 lbs (last 200×8 lbs on 2026-10-21 hit the target)');
        expect(text).toContain('Volume this week so far vs MRV 22: Chest 1 (21 left)');
        expect(text).toContain('Progress scoreboard');
    });

    it("leads with today's session when it's a deload", () => {
        const text = formatVerdictsContext(computeVerdicts({
            workouts: [wo('2026-10-21', 'Push day', [{ name: 'Bench Press', sets: [set(200, 8)] }])],
            today: TODAY,
            intent: { mode: 'deload', weightPct: -30, label: 'Deload', source: 'manual', reason: 'Deload week through 2026-10-30' },
        }));
        expect(text.split('\n')[1]).toBe("Today's session: Deload · -30% weight — Deload week through 2026-10-30");
    });

    it('is empty when there is nothing to say', () => {
        expect(formatVerdictsContext(computeVerdicts({ workouts: [], today: TODAY }))).toBe('');
        expect(formatVerdictsContext(null)).toBe('');
    });
});

describe('verdictLine', () => {
    it('names every action in words', () => {
        expect(verdictLine({ action: 'back-off', weight: 180, reps: 8, stallRun: 6 }, 'lbs'))
            .toBe('stall rung 2 (6 sessions flat) — back off to 180×8 lbs for two sessions, then rebuild');
        expect(verdictLine({ action: 'rotate', weight: 200, stallRun: 9 }, 'kg'))
            .toBe('stall rung 3 (9 sessions flat at 200) — rotate to a similar movement this block');
        expect(verdictLine({ action: 'no-history' }, 'lbs')).toBe('no logged history — start conservative');
    });
});
