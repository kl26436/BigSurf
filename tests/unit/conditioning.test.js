// Leftover 10(b) — the "Conditioning" line on Progress: cardio sessions in
// the range, minutes only where the workout timer honestly measures cardio.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    convertWeight: vi.fn((w) => w),
    showNotification: vi.fn(),
    escapeHtml: vi.fn((s) => s),
}));

import { AppState } from '../../js/core/utils/app-state.js';
import { aggregateConditioning, isCardioExercise } from '../../js/core/features/metrics/aggregators.js';

const range = { start: new Date(2026, 9, 19), end: new Date(2026, 9, 25, 23, 59) };
const done = [{ reps: 1, completed: true }];
const w = (date, exercises, extra = {}) => ({
    date,
    completedAt: `${date}T12:00:00Z`,
    exercises: Object.fromEntries(exercises.map((e, i) => [`exercise_${i}`, { sets: done, ...e }])),
    ...extra,
});

beforeEach(() => {
    AppState.exerciseDatabase = [
        { name: 'Assault Bike', bodyPart: 'Cardio' },
        { name: 'Leg Press', bodyPart: 'Legs' },
    ];
});

describe('aggregateConditioning', () => {
    it('counts sessions with cardio; a cardio-only session contributes its timer minutes', () => {
        const c = aggregateConditioning([
            w('2026-10-20', [{ name: 'Treadmill' }], { totalDuration: 1800 }),
            w('2026-10-22', [{ name: 'Assault Bike' }, { name: 'Rowing Machine' }], { totalDuration: 1500 }),
        ], range);
        expect(c).toEqual({ sessions: 2, minutes: 55, minutesComplete: true, lastDate: '2026-10-22' });
    });

    it('a lifting day with a cardio finisher counts as a session but has no honest minutes', () => {
        const c = aggregateConditioning([
            w('2026-10-21', [{ name: 'Leg Press' }, { name: 'Stationary Bike' }], { totalDuration: 4200 }),
        ], range);
        expect(c.sessions).toBe(1);
        expect(c.minutesComplete).toBe(false);
        expect(c.minutes).toBe(0);
    });

    it('skips cancelled workouts, untouched cardio rows, and days outside the range — but remembers the last cardio', () => {
        const c = aggregateConditioning([
            w('2026-10-23', [{ name: 'Treadmill' }], { cancelledAt: '2026-10-23T13:00:00Z' }),
            w('2026-10-24', [{ name: 'Treadmill', sets: [{ reps: null, weight: null }] }, { name: 'Leg Press' }]),
            w('2026-10-02', [{ name: 'Treadmill' }], { totalDuration: 900 }),
        ], range);
        expect(c.sessions).toBe(0);
        expect(c.lastDate).toBe('2026-10-02');
    });

    it('a pure lifter has no cardio at all (the line stays hidden)', () => {
        expect(aggregateConditioning([w('2026-10-20', [{ name: 'Leg Press' }])], range).lastDate).toBeNull();
    });
});

describe('isCardioExercise', () => {
    it('uses the exercise database first, then the name', () => {
        expect(isCardioExercise('Assault Bike')).toBe(true);
        expect(isCardioExercise('Incline Treadmill Walk')).toBe(true);
        expect(isCardioExercise('Seated Cable Row')).toBe(false);
        expect(isCardioExercise('Leg Press')).toBe(false);
    });

    it('a known non-cardio exercise stays non-cardio even when its name has "bike"', () => {
        AppState.exerciseDatabase.push({ name: 'Bike Crunch', bodyPart: 'Core' });
        expect(isCardioExercise('Bike Crunch')).toBe(false);
        expect(isCardioExercise('Stationary Bike')).toBe(true); // unknown → the name decides
    });

    it('an unfinished workout does not count', () => {
        const open = { ...w('2026-10-22', [{ name: 'Assault Bike' }]), completedAt: null };
        expect(aggregateConditioning([open], range).sessions).toBe(0);
    });
});
