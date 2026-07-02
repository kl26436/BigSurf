// Tests for the machine → exercise fuzzy matcher (Tier 0.2)
import { describe, it, expect } from 'vitest';
import { suggestExercisesForMachine } from '../../js/core/features/machine-exercise-matcher.js';

const LIBRARY = [
    'Bench Press',
    'Incline Bench Press',
    'Chest Press',
    'Shoulder Press',
    'Lat Pulldown',
    'Seated Cable Row',
    'Bicep Curl',
    'Tricep Pushdown',
    'Leg Press',
    'Leg Extension',
    'Leg Curl',
    'Squat',
    'Hack Squat',
    'Pec Deck Fly',
    'Calf Raise',
    'Row',
];

describe('suggestExercisesForMachine', () => {
    it('matches an exercise phrase inside a longer machine name', () => {
        expect(suggestExercisesForMachine('Iso-Lateral Bench Press', LIBRARY))
            .toEqual(['Bench Press']);
    });

    it('matches exact machine/exercise names', () => {
        expect(suggestExercisesForMachine('Leg Extension', LIBRARY))
            .toEqual(['Leg Extension']);
    });

    it('prefers the most specific overlapping match', () => {
        const result = suggestExercisesForMachine('Hack Squat Machine', LIBRARY);
        expect(result[0]).toBe('Hack Squat');
        expect(result).not.toContain('Squat'); // subsumed by Hack Squat
    });

    it('handles hyphen/space variants via compact comparison', () => {
        expect(suggestExercisesForMachine('Lat Pull-Down', LIBRARY))
            .toEqual(['Lat Pulldown']);
    });

    it('matches plural machine names against singular exercises', () => {
        expect(suggestExercisesForMachine('Seated Bicep Curls', LIBRARY))
            .toEqual(['Bicep Curl']);
    });

    it('matches machine-inside-exercise with one extra word (Pec Deck → Pec Deck Fly)', () => {
        expect(suggestExercisesForMachine('Pec Deck', LIBRARY))
            .toEqual(['Pec Deck Fly']);
    });

    it('skips short generic single-token exercises', () => {
        // "Row" alone is too generic to link from a name
        expect(suggestExercisesForMachine('Row Machine', LIBRARY)).toEqual([]);
    });

    it('returns empty for unmatched machines instead of guessing', () => {
        expect(suggestExercisesForMachine('Smith Machine', LIBRARY)).toEqual([]);
        expect(suggestExercisesForMachine('Adjustable Bench', LIBRARY)).toEqual([]);
    });

    it('caps results at max', () => {
        const result = suggestExercisesForMachine('Leg Press Leg Extension Combo', LIBRARY, { max: 1 });
        expect(result).toHaveLength(1);
    });

    it('handles empty inputs', () => {
        expect(suggestExercisesForMachine('', LIBRARY)).toEqual([]);
        expect(suggestExercisesForMachine('Bench Press', [])).toEqual([]);
        expect(suggestExercisesForMachine('Bench Press', undefined)).toEqual([]);
    });
});
