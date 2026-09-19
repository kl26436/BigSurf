// CP-4 — variety engine: accessories rotate to the stalest same-pattern
// machine at the gym; primaries and secondaries never move.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { selectRotation, applyRotation } from '../../js/core/features/exercise-rotation.js';
import { inferRole } from '../../js/core/features/movement-patterns.js';

const library = JSON.parse(readFileSync('data/exercises.json', 'utf8'));
const lookup = (name) => library.find(e => e.name === name);

const GYM = 'Absolute Recomp';
const eq = (name, exerciseTypes, lastUsed = null, locations = [GYM]) => ({ name, exerciseTypes, lastUsed, locations });

const floor = [
    eq('Hammer Chest Press', ['Seated Chest Press'], '2026-09-10'),
    eq('Pec Deck Machine', ['Pec Deck'], '2026-09-12'),
    eq('Panatta Super Lower Chest Flight', ['Cable Chest Fly'], '2026-04-02'),
    eq('Cable Crossover Station', ['Cable Crossover'], null),
    eq('Lateral Raise Machine', ['Lateral Raise Machine'], '2026-09-14'),
    eq('Standing Lateral Raise', ['Cable Lateral Raise'], null),
    eq('Rogers Hip Press', ['Hip Thrust Machine'], '2025-12-01'),
    eq('Other Gym Fly', ['Cable Chest Fly'], null, ['Hurst']),
];

const pushDay = [
    { machine: 'Seated Chest Press', sets: 4, reps: 10, weight: 290, equipment: 'Hammer Chest Press' },
    { machine: 'Shoulder Press Machine', sets: 4, reps: 10, weight: 140 },
    { machine: 'Pec Deck', sets: 3, reps: 12, weight: 120, equipment: 'Pec Deck Machine' },
    { machine: 'Lateral Raise Machine', sets: 3, reps: 15, weight: 60, equipment: 'Lateral Raise Machine' },
];

describe('selectRotation', () => {
    it('rotates accessories to the stalest same-pattern machine at the gym and holds the primaries', () => {
        const { swaps, held } = selectRotation({ exercises: pushDay, equipment: floor, location: GYM, lookup });
        expect(held.map(h => h.name)).toEqual(['Seated Chest Press', 'Shoulder Press Machine']);
        expect(held[0].role).toBe('primary');
        expect(swaps).toEqual([
            { index: 2, from: 'Pec Deck', to: 'Cable Crossover', equipment: 'Cable Crossover Station', pattern: 'horizontal-push', reason: 'never used' },
            { index: 3, from: 'Lateral Raise Machine', to: 'Cable Lateral Raise', equipment: 'Standing Lateral Raise', pattern: 'lateral-delt', reason: 'never used' },
        ]);
    });

    it('never-used beats idle beats recent, and other gyms are invisible', () => {
        const noNeverUsed = floor.filter(d => d.name !== 'Cable Crossover Station');
        const { swaps } = selectRotation({ exercises: pushDay, equipment: noNeverUsed, location: GYM, lookup });
        expect(swaps[0]).toMatchObject({ to: 'Cable Chest Fly', equipment: 'Panatta Super Lower Chest Flight', reason: 'idle since 2026-04' });
        // 'Other Gym Fly' is never-used but lives at Hurst.
        expect(swaps.map(s => s.equipment)).not.toContain('Other Gym Fly');
    });

    it('a primary never rotates, whatever the floor offers (property over generated days)', () => {
        const compounds = ['Seated Chest Press', 'Leg Press', 'Lat Pulldown', 'Shoulder Press Machine', 'Seated Row Machine'];
        const isolations = ['Pec Deck', 'Leg Extension', 'Cable Lateral Raise', 'Triceps Pushdown', 'Machine Crunch'];
        const richFloor = library.map((e, i) => eq(`Machine ${i}`, [e.name], i % 2 ? null : '2026-01-01'));
        for (let seed = 0; seed < 40; seed++) {
            const day = [
                { machine: compounds[seed % 5], sets: 4, reps: 8 },
                { machine: compounds[(seed + 1) % 5], sets: 4, reps: 8 },
                { machine: isolations[seed % 5], sets: 3, reps: 12 },
                { machine: isolations[(seed + 2) % 5], sets: 3, reps: 12 },
            ];
            const { swaps } = selectRotation({ exercises: day, equipment: richFloor, location: GYM, lookup });
            for (const s of swaps) {
                expect(inferRole({ ...lookup(day[s.index].machine), ...day[s.index] }, s.index)).not.toBe('primary');
                expect(s.index).toBeGreaterThanOrEqual(2);
            }
        }
    });

    it('degrades to no swaps with nothing mapped (D0: enrichment, never a gate)', () => {
        const { swaps, held } = selectRotation({ exercises: pushDay, equipment: [], location: GYM, lookup });
        expect(swaps).toEqual([]);
        expect(held.find(h => h.name === 'Pec Deck').reason).toBe('no alternative at this gym');
        expect(selectRotation({})).toEqual({ swaps: [], held: [] });
    });

    it('never hands two slots the same machine or the same exercise, and never picks a name already on the day', () => {
        const twoFlies = [
            { machine: 'Seated Chest Press', sets: 4, reps: 10 },
            { machine: 'Pec Deck', sets: 3, reps: 12, equipment: 'Pec Deck Machine' },
            { machine: 'Cable Crossover', sets: 3, reps: 12, equipment: 'Cable Crossover Station' },
        ];
        const { swaps } = selectRotation({ exercises: twoFlies, equipment: floor, location: GYM, lookup });
        const machines = swaps.map(s => s.equipment);
        expect(new Set(machines).size).toBe(machines.length);
        expect(swaps.map(s => s.to)).not.toContain('Pec Deck');
        expect(swaps.map(s => s.to)).not.toContain('Cable Crossover');
    });

    it('is deterministic', () => {
        const a = selectRotation({ exercises: pushDay, equipment: floor, location: GYM, lookup });
        const b = selectRotation({ exercises: [...pushDay], equipment: [...floor].reverse(), location: GYM, lookup });
        expect(a).toEqual(b);
    });
});

describe('applyRotation', () => {
    it('swaps the row in place, keeps sets/reps, drops the old weight, records provenance, never mutates input', () => {
        const { swaps } = selectRotation({ exercises: pushDay, equipment: floor, location: GYM, lookup });
        const out = applyRotation(pushDay, swaps, { lookup, today: '2026-09-21' });
        expect(pushDay[2].machine).toBe('Pec Deck');
        expect(out[2]).toMatchObject({ machine: 'Cable Crossover', sets: 3, reps: 12, equipment: 'Cable Crossover Station', bodyPart: 'Chest', rotatedFrom: 'Pec Deck', rotatedAt: '2026-09-21' });
        expect(out[2].weight).toBeUndefined();
        expect(out[0]).toBe(pushDay[0]);
    });
});
