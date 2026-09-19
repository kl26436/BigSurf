// Plate-relative weight: the number the user actually TYPED for a set.
//
// On base-weight equipment (a machine's starting stack, a bar) the set row is
// labelled "Plates" and logging stores the TOTAL in `set.weight`, keeping the
// typed value in `_plateWeight`. Anything that feeds a weight input or a
// "last session" readout has to show the typed value — the 8/12 report was
// "machine starting weight was 90 and I did 270, I want to see 270 not 380".
//
// Imports the REAL modules (weight-calculations + progression).

import { describe, it, expect, vi } from 'vitest';

// progression.js -> ui-helpers.js is DOM-heavy at import; mock with real math.
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    convertWeight: (weight, fromUnit, toUnit) => {
        if (!weight || isNaN(weight) || weight <= 0 || weight > 1000) return 0;
        if (fromUnit === toUnit) return Math.round(weight * 10) / 10;
        if (fromUnit === 'lbs' && toUnit === 'kg') return Math.round(weight * 0.453592 * 10) / 10;
        if (fromUnit === 'kg' && toUnit === 'lbs') return Math.round(weight * 2.20462 * 10) / 10;
        return Math.round(weight * 10) / 10;
    },
    showNotification: () => {},
    escapeHtml: (s) => s,
}));

const { plateRelativeWeight } = await import('../../js/core/utils/weight-calculations.js');
const { buildExerciseSessions, computeOverloadNudge } = await import('../../js/core/features/progression.js');

describe('plateRelativeWeight', () => {
    it('returns the typed plate load, not the stored total', () => {
        // 90 lb machine base, 270 lb of plates loaded -> 360 stored.
        const set = { weight: 360, _plateWeight: 270, _equipBaseWeight: 90 };
        expect(plateRelativeWeight(set)).toBe(270);
    });

    it('falls back to set.weight when there is no base weight', () => {
        expect(plateRelativeWeight({ weight: 135 })).toBe(135);
    });

    it('falls back for legacy sets logged before _plateWeight existed', () => {
        expect(plateRelativeWeight({ weight: 225, _equipBaseWeight: 45 })).toBe(225);
    });

    it('ignores _plateWeight when the base is zero (free weights)', () => {
        expect(plateRelativeWeight({ weight: 100, _plateWeight: 0, _equipBaseWeight: 0 })).toBe(100);
    });

    it('handles a genuine zero-plate set on a base-weight machine', () => {
        // Carriage only: typed 0, total is the 90 lb base.
        expect(plateRelativeWeight({ weight: 90, _plateWeight: 0, _equipBaseWeight: 90 })).toBe(0);
    });

    it('is safe on null/undefined', () => {
        expect(plateRelativeWeight(null)).toBe(0);
        expect(plateRelativeWeight(undefined)).toBe(0);
    });
});

describe('buildExerciseSessions with base-weight equipment', () => {
    const workoutWith = (date, sets) => ({
        date,
        completedAt: `${date}T12:00:00.000Z`,
        cancelledAt: null,
        exercises: { exercise_0: { name: 'Leg Press', sets } },
    });

    it('reports top weight in plate terms, not totals', () => {
        const workouts = [
            workoutWith('2026-09-01', [
                { weight: 360, _plateWeight: 270, _equipBaseWeight: 90, reps: 8, completed: true, originalUnit: 'lbs' },
            ]),
        ];
        const sessions = buildExerciseSessions(workouts, 'Leg Press', 'lbs');
        expect(sessions).toHaveLength(1);
        expect(sessions[0].topWeight).toBe(270);
        expect(sessions[0].topReps).toBe(8);
    });

    it('keeps totals for equipment without a base weight', () => {
        const workouts = [
            workoutWith('2026-09-01', [
                { weight: 185, reps: 5, completed: true, originalUnit: 'lbs' },
            ]),
        ];
        expect(buildExerciseSessions(workouts, 'Leg Press', 'lbs')[0].topWeight).toBe(185);
    });

    it('gives the coach a plate-relative bump so advice matches the input field', () => {
        // Rep target hit at 270 of plates -> advise 280, never 370.
        const workouts = [
            workoutWith('2026-09-01', [
                { weight: 360, _plateWeight: 270, _equipBaseWeight: 90, reps: 10, completed: true, originalUnit: 'lbs' },
            ]),
        ];
        const sessions = buildExerciseSessions(workouts, 'Leg Press', 'lbs');
        const nudge = computeOverloadNudge(sessions, 'lbs', 10, 10);
        expect(nudge).toContain('280');
        expect(nudge).not.toContain('370');
    });
});
