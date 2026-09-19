// CP-7 — discovery surfaces: unmapped docs, line gaps, branch scouting.

import { describe, it, expect } from 'vitest';
import { unmappedEquipment, lineGaps, branchScouting } from '../../js/core/features/equipment-discovery.js';
import { patternsForEquipment } from '../../js/core/features/movement-patterns.js';

describe('unmappedEquipment', () => {
    it('lists nameless docs first, then docs with no exercise mapping', () => {
        const out = unmappedEquipment([
            { id: 'a', name: 'Pec Deck', exerciseTypes: ['Pec Deck'] },
            { id: 'b', name: 'Newtech Incline Chest Press 2', exerciseTypes: [] },
            { id: 'c', name: '', exerciseTypes: [] },
            { id: 'd', name: 'Arsenal ISO Multi Row' },
        ]);
        expect(out).toEqual([
            { id: 'c', name: '', reason: 'no name' },
            { id: 'd', name: 'Arsenal ISO Multi Row', reason: 'no exercises' },
            { id: 'b', name: 'Newtech Incline Chest Press 2', reason: 'no exercises' },
        ]);
        expect(unmappedEquipment([])).toEqual([]);
    });
});

const catalog = [{
    name: 'Panatta', brand: 'Panatta',
    lines: [{
        name: 'Fit Evo', slug: 'fit-evo', type: 'Selectorized',
        machines: [
            { id: 'panatta/fit-evo/chest-press', name: 'Chest Press', bodyPart: 'Chest' },
            { id: 'panatta/fit-evo/super-horizontal-row', name: 'Super Horizontal Row', bodyPart: 'Back' },
            { id: 'panatta/fit-evo/leg-extension', name: 'Leg Extension', bodyPart: 'Legs' },
            { id: 'panatta/fit-evo/pullover', name: 'Pullover', bodyPart: 'Back' },
        ],
    }],
}];

const owned = (fn, gym = 'Absolute Recomp') => ({ name: `Panatta Fit Evo ${fn}`, brand: 'Panatta', line: 'Fit Evo', function: fn, locations: [gym] });

describe('lineGaps', () => {
    it('suggests the missing members of a line the user owns several pieces of, per gym', () => {
        const out = lineGaps([owned('Chest Press'), owned('Leg Extension')], catalog);
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ gym: 'Absolute Recomp', brand: 'Panatta', line: 'Fit Evo', owned: 2 });
        expect(out[0].missing.map(m => m.name)).toEqual(['Super Horizontal Row', 'Pullover']);
        expect(out[0].missing[0].key).toBe('Absolute Recomp|panatta/fit-evo/super-horizontal-row');
    });

    it('needs minOwned pieces, and answered machines never come back (D10)', () => {
        expect(lineGaps([owned('Chest Press')], catalog)).toEqual([]);
        const out = lineGaps([owned('Chest Press'), owned('Leg Extension')], catalog, {
            answered: ['Absolute Recomp|panatta/fit-evo/super-horizontal-row'],
        });
        expect(out[0].missing.map(m => m.name)).toEqual(['Pullover']);
    });

    it('a fully-owned line and unknown brands/lines produce nothing', () => {
        const all = ['Chest Press', 'Super Horizontal Row', 'Leg Extension', 'Pullover'].map(f => owned(f));
        expect(lineGaps(all, catalog)).toEqual([]);
        expect(lineGaps([owned('X'), owned('Y')].map(d => ({ ...d, brand: 'Nobody' })), catalog)).toEqual([]);
    });
});

describe('branchScouting', () => {
    const eq = (name, exerciseTypes, gym) => ({ name, exerciseTypes, locations: [gym] });
    const patternsFor = (doc) => patternsForEquipment(doc);

    it('names patterns the home gym serves poorly that another gym covers', () => {
        const floor = [
            eq('Hammer Chest Press', ['Seated Chest Press'], 'Absolute Recomp'),
            eq('Pec Deck', ['Pec Deck'], 'Absolute Recomp'),
            eq('Lat Pulldown', ['Lat Pulldown'], 'Absolute Recomp'),
            eq('Hip Thrust Machine', ['Hip Thrust Machine'], 'Hurst'),
            eq('Rogers Hip Press', ['Hip Thrust Machine'], 'Hurst'),
            eq('Glute Drive', ['Hip Thrust Machine'], 'Hurst'),
        ];
        const out = branchScouting(floor, null, { patternsFor });
        expect(out.homeGym).toBe('Absolute Recomp');
        expect(out.gaps).toEqual([{ pattern: 'hip-dominant', home: 0, gym: 'Hurst', count: 3 }]);
    });

    it('stays silent with a single mapped gym (D6: positive evidence only)', () => {
        const out = branchScouting([eq('A', ['Hip Thrust Machine'], 'Only Gym')], null, { patternsFor });
        expect(out.gaps).toEqual([]);
        expect(branchScouting([], null, {}).gaps).toEqual([]);
    });
});
