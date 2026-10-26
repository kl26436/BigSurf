// Coach outcomes (Phase 7) — advice + workout history → factual outcome lines.
// Pure-function territory: fixtures in, strings out, no Firebase.

import { describe, it, expect } from 'vitest';
import {
    computeAdviceOutcome, buildOutcomesContext, buildFeedbackContext, convertToUnit,
} from '../../js/core/features/coach-outcomes.js';

const TODAY = '2026-07-07';

// Minimal workout doc factory (schema-shaped: exercises map + exerciseNames).
const wo = (date, exercise, weights, opts = {}) => ({
    date,
    completedAt: `${date}T11:00:00.000Z`,
    exerciseNames: { exercise_0: exercise },
    exercises: {
        exercise_0: {
            sets: weights.map(w => ({ reps: 8, weight: w, completed: true, type: opts.type || 'working' })),
        },
    },
});

describe('computeAdviceOutcome — weight_target', () => {
    const advice = { date: '2026-06-15', type: 'weight_target', exercise: 'Bench Press', targetValue: 155 };

    it('hit: best-after ≥ target, with before/after numbers', () => {
        const workouts = [
            wo('2026-06-01', 'Bench Press', [145]),
            wo('2026-06-25', 'Bench Press', [155]),
        ];
        const line = computeAdviceOutcome(advice, workouts, TODAY);
        expect(line).toContain('hit (best since: 155)');
        expect(line).toContain('was 145 in the 4 weeks before');
    });

    it('not hit yet', () => {
        const line = computeAdviceOutcome(advice, [wo('2026-06-25', 'Bench Press', [150])], TODAY);
        expect(line).toContain('not hit yet (best since: 150)');
    });

    it('warmup sets never count toward the target', () => {
        const line = computeAdviceOutcome(advice, [
            wo('2026-06-01', 'Bench Press', [145]),
            wo('2026-06-25', 'Bench Press', [155], { type: 'warmup' }),
        ], TODAY);
        expect(line).toContain('not hit yet');
    });
});

describe('AP-15c — units: outcomes compare in one unit', () => {
    const kgSession = (date, exercise, kg) => ({
        date,
        completedAt: `${date}T11:00:00.000Z`,
        exerciseNames: { exercise_0: exercise },
        exercises: { exercise_0: { sets: [{ reps: 8, weight: kg, originalUnit: 'kg', completed: true }] } },
    });

    it('convertToUnit rounds to 1 decimal and passes same-unit through', () => {
        expect(convertToUnit(100, 'kg', 'lbs')).toBe(220.5);
        expect(convertToUnit(225, 'lbs', 'kg')).toBe(102.1);
        expect(convertToUnit(135, 'lbs', 'lbs')).toBe(135);
        expect(convertToUnit(0, 'kg', 'lbs')).toBe(0);
        expect(convertToUnit(2050, 'lbs', 'kg')).toBe(929.9); // volumes too (no 1000 cap)
    });

    it('a 70 kg session hits a 155 lbs target (raw 70 < 155 used to read "not hit")', () => {
        const advice = { date: '2026-06-15', type: 'weight_target', exercise: 'Bench Press', targetValue: 155 };
        const line = computeAdviceOutcome(advice, [kgSession('2026-06-25', 'Bench Press', 72)], TODAY, { unit: 'lbs' });
        expect(line).toContain('target 155 lbs');
        expect(line).toContain('hit (best since: 158.7)');
    });

    it("the advice's stamped unit wins over the display unit", () => {
        const advice = { date: '2026-06-15', type: 'weight_target', exercise: 'Bench Press', targetValue: 70, unit: 'kg' };
        const line = computeAdviceOutcome(advice, [wo('2026-06-25', 'Bench Press', [155])], TODAY, { unit: 'lbs' });
        expect(line).toContain('target 70 kg');
        expect(line).toContain('hit (best since: 70.3)');
    });

    it('buildOutcomesContext threads the unit through', () => {
        const advice = [{ date: '2026-06-15', type: 'weight_target', exercise: 'Bench Press', targetValue: 70 }];
        const ctx = buildOutcomesContext(advice, [wo('2026-06-25', 'Bench Press', [155])], TODAY, { unit: 'kg' });
        expect(ctx).toContain('target 70 kg; hit (best since: 70.3)');
    });
});

describe('computeAdviceOutcome — timing gates', () => {
    it('too fresh (<14d) and stale (>70d) return null', () => {
        const mk = (date) => ({ date, type: 'weight_target', exercise: 'Squat', targetValue: 100 });
        expect(computeAdviceOutcome(mk('2026-07-01'), [wo('2026-07-02', 'Squat', [100])], TODAY)).toBeNull();
        expect(computeAdviceOutcome(mk('2026-04-01'), [wo('2026-04-10', 'Squat', [100])], TODAY)).toBeNull();
    });
});

describe('computeAdviceOutcome — deload', () => {
    it('reports the volume drop and the lift move after', () => {
        const advice = { date: '2026-06-08', type: 'deload', exercise: 'Bench Press' };
        const workouts = [
            // Week before: 2 workouts × 3 sets. Week after: 1 workout × 2 sets.
            wo('2026-06-03', 'Bench Press', [185, 185, 185]),
            wo('2026-06-05', 'Bench Press', [185, 185, 185]),
            wo('2026-06-10', 'Bench Press', [135, 135]),
            wo('2026-06-30', 'Bench Press', [195]),
        ];
        const line = computeAdviceOutcome(advice, workouts, TODAY);
        expect(line).toContain('suggested a lighter week for Bench Press');
        expect(line).toContain('volume -67% that week');
        expect(line).toContain('185→195 lbs in the 4 weeks after');
    });
});

describe('computeAdviceOutcome — exercise_swap', () => {
    const advice = { date: '2026-06-10', type: 'exercise_swap', targetValue: 'DB Row' };

    it('never tried / dropped / still doing', () => {
        expect(computeAdviceOutcome(advice, [], TODAY)).toContain('never tried it');
        expect(computeAdviceOutcome(advice, [wo('2026-06-12', 'DB Row', [60])], TODAY)).toContain('tried it but dropped it');
        expect(computeAdviceOutcome(advice, [wo('2026-07-01', 'DB Row', [60])], TODAY)).toContain('still doing it');
    });
});

describe('buildOutcomesContext', () => {
    it('newest first, capped, empty string when nothing checkable', () => {
        const advice = [
            { date: '2026-06-10', type: 'exercise_swap', targetValue: 'DB Row' },
            { date: '2026-06-15', type: 'weight_target', exercise: 'Bench Press', targetValue: 155 },
            { date: '2026-07-06', type: 'weight_target', exercise: 'Squat', targetValue: 300 }, // too fresh
        ];
        const workouts = [wo('2026-06-25', 'Bench Press', [155]), wo('2026-07-01', 'DB Row', [60])];
        const ctx = buildOutcomesContext(advice, workouts, TODAY);
        expect(ctx).toContain('past recommendations');
        expect(ctx.indexOf('Bench Press')).toBeLessThan(ctx.indexOf('DB Row'));
        expect(ctx).not.toContain('Squat');
        expect(buildOutcomesContext([], [], TODAY)).toBe('');
    });
});

describe('buildFeedbackContext', () => {
    it('mentions downs only when they exist', () => {
        expect(buildFeedbackContext(['up', 'up'])).toBe('');
        expect(buildFeedbackContext([])).toBe('');
        const line = buildFeedbackContext(['down', 'up', 'down', 'up']);
        expect(line).toContain('thumbed down 2 of your last 4');
    });
});
