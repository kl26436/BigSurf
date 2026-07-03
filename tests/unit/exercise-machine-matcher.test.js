// Tests for the exercise → machine reverse matcher (Tier 3 Phase 2 / F2, D7)
import { describe, it, expect } from 'vitest';
import { suggestMachinesForExercise } from '../../js/core/features/exercise-machine-matcher.js';

const CATALOG = [
    {
        name: 'Hammer Strength', slug: 'hammer-strength',
        lines: [
            {
                name: 'Iso-Lateral', type: 'Plate-Loaded',
                machines: [
                    { id: 'hs/iso/bench', name: 'Iso-Lateral Bench Press', type: 'Plate-Loaded', bodyPart: 'Chest' },
                    { id: 'hs/iso/row', name: 'Iso-Lateral Row', type: 'Plate-Loaded', bodyPart: 'Back' },
                    { id: 'hs/iso/legpress', name: 'Leg Press', type: 'Plate-Loaded', bodyPart: 'Legs' },
                ],
            },
        ],
    },
    {
        name: 'Life Fitness', slug: 'life-fitness',
        lines: [
            {
                name: 'Signature', type: 'Selectorized',
                machines: [
                    { id: 'lf/sig/pulldown', name: 'Lat Pulldown', type: 'Selectorized', bodyPart: 'Back' },
                    { id: 'lf/sig/pecdeck', name: 'Pec Deck', type: 'Selectorized', bodyPart: 'Chest' },
                    { id: 'lf/sig/legext', name: 'Leg Extension', type: 'Selectorized', bodyPart: 'Legs' },
                ],
            },
        ],
    },
];

describe('suggestMachinesForExercise', () => {
    it('finds machines containing the exercise phrase', () => {
        const result = suggestMachinesForExercise('Bench Press', CATALOG);
        expect(result.map(m => m.catalogRef)).toContain('hs/iso/bench');
    });

    it('ranks the exact-name machine first', () => {
        const result = suggestMachinesForExercise('Leg Press', CATALOG);
        expect(result[0].catalogRef).toBe('hs/iso/legpress');
    });

    it('matches hyphen/space variants via compact comparison', () => {
        const result = suggestMachinesForExercise('Lat Pull-Down', CATALOG);
        expect(result.map(m => m.catalogRef)).toContain('lf/sig/pulldown');
    });

    it('matches machine-inside-exercise with one extra word', () => {
        const result = suggestMachinesForExercise('Pec Deck Fly', CATALOG);
        expect(result.map(m => m.catalogRef)).toContain('lf/sig/pecdeck');
    });

    it('returns ranked entries with full context for the add pipeline', () => {
        const [top] = suggestMachinesForExercise('Leg Extension', CATALOG);
        expect(top).toMatchObject({
            catalogRef: 'lf/sig/legext',
            brandName: 'Life Fitness',
            lineName: 'Signature',
            type: 'Selectorized',
        });
        expect(top.score).toBeUndefined();
    });

    it('suggests nothing rather than guessing (D7)', () => {
        expect(suggestMachinesForExercise('Face Pull', CATALOG)).toEqual([]);
        expect(suggestMachinesForExercise('', CATALOG)).toEqual([]);
        expect(suggestMachinesForExercise('Row', CATALOG)).toEqual([]); // too generic
    });

    it('caps results at max', () => {
        const result = suggestMachinesForExercise('Leg Press', CATALOG, { max: 1 });
        expect(result).toHaveLength(1);
    });
});
