// CP-3 — MRV governor: a week's +sets never pushes a muscle past MRV.

import { describe, it, expect } from 'vitest';
import { governSetDelta } from '../../js/core/features/volume-governor.js';

const db = [
    { name: 'Seated Chest Press', bodyPart: 'Chest' },
    { name: 'Pec Deck', bodyPart: 'Chest' },
    { name: 'Lat Pulldown', bodyPart: 'Back' },
];

describe('governSetDelta', () => {
    it('passes the delta through when the muscle has headroom', () => {
        const out = governSetDelta({
            setDelta: 2, mrv: 22,
            exercises: [{ machine: 'Seated Chest Press', sets: 4 }, { machine: 'Lat Pulldown', sets: 4 }],
            weeklyVolume: [{ bodyPart: 'Chest', weeklySets: 8 }],
            exerciseDatabase: db,
        });
        expect(out.deltas).toEqual([2, 2]);
        expect(out.clamped).toEqual([]);
    });

    it('clamps per muscle: allowance = MRV − done this week − today\'s baseline, spent in exercise order', () => {
        const out = governSetDelta({
            setDelta: 2, mrv: 22,
            // Chest: 12 done + 4 + 4 baseline = 20 → 2 sets of headroom for the whole session.
            exercises: [{ machine: 'Seated Chest Press', sets: 4 }, { machine: 'Pec Deck', sets: 4 }, { machine: 'Lat Pulldown', sets: 4 }],
            weeklyVolume: [{ bodyPart: 'Chest', weeklySets: 12 }],
            exerciseDatabase: db,
        });
        expect(out.deltas).toEqual([2, 0, 2]);
        expect(out.clamped).toEqual([{ index: 1, name: 'Pec Deck', bodyPart: 'Chest', weeklySets: 12 }]);
    });

    it('a muscle already at MRV gets nothing', () => {
        const out = governSetDelta({
            setDelta: 1, mrv: 22,
            exercises: [{ machine: 'Seated Chest Press', sets: 4, bodyPart: 'Chest' }],
            weeklyVolume: [{ bodyPart: 'Chest', weeklySets: 20 }],
        });
        expect(out.deltas).toEqual([0]);
        expect(out.clamped).toHaveLength(1);
    });

    it('never clamps a deload, and leaves unknown muscles ungoverned', () => {
        expect(governSetDelta({ setDelta: -2, exercises: [{ machine: 'Seated Chest Press', sets: 4 }], weeklyVolume: [{ bodyPart: 'Chest', weeklySets: 40 }], exerciseDatabase: db }).deltas).toEqual([-2]);
        expect(governSetDelta({ setDelta: 2, mrv: 22, exercises: [{ machine: 'Mystery Machine', sets: 4 }], weeklyVolume: [] }).deltas).toEqual([2]);
        expect(governSetDelta({ setDelta: 0, exercises: [{ machine: 'X', sets: 3 }] }).deltas).toEqual([0]);
    });
});
