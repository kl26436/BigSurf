// Tests for the equipment pickers' inline catalog search
// (js/core/data/catalog-search.js). Imports the real module — it's pure, so
// no Firebase/DOM mocks needed.
//
// What this guards: the mid-workout "add the machine I'm standing at" flow.
// A result here becomes a one-tap row that creates + gym-tags + selects an
// equipment doc, so a machine the user already owns must never show up as an
// "add" row (that's the duplicate-equipment vector).

import { describe, it, expect } from 'vitest';
import {
    equipNameKey,
    ownedEquipmentKeys,
    searchCatalogMachines,
    inferEquipmentType,
    matchesAllTokens,
} from '../../js/core/data/catalog-search.js';
import { EQUIPMENT_CATALOG } from '../../js/core/data/equipment-catalog.js';
import { augmentStaticCatalog } from '../../js/core/data/equipment-catalog-helpers.js';

const CATALOG = [
    {
        name: 'Hammer Strength',
        lines: [
            {
                name: 'Iso-Lateral',
                type: 'Plate-Loaded',
                machines: [
                    { id: 'hs-iso-bench', name: 'Iso-Lateral Bench Press', type: 'Plate-Loaded', bodyPart: 'Chest' },
                    { id: 'hs-iso-row', name: 'Iso-Lateral Row', type: 'Plate-Loaded', bodyPart: 'Back' },
                ],
            },
        ],
    },
    {
        name: 'Life Fitness',
        lines: [
            {
                name: 'Signature',
                type: 'Selectorized',
                machines: [
                    { id: 'lf-leg-press', name: 'Leg Press', type: 'Selectorized', bodyPart: 'Legs' },
                    { id: 'lf-hack', name: 'Hack Squat', bodyPart: 'Legs' },
                ],
            },
        ],
    },
];

describe('equipNameKey', () => {
    it('collapses case, separators and spacing', () => {
        expect(equipNameKey('Hammer Strength — Chest Press')).toBe('hammer strength chest press');
        expect(equipNameKey('Hammer Strength  Chest   Press')).toBe('hammer strength chest press');
    });

    it('survives null and empty input', () => {
        expect(equipNameKey(null)).toBe('');
        expect(equipNameKey('')).toBe('');
    });
});

describe('ownedEquipmentKeys', () => {
    it('collects catalogRefs plus normalized name and function strings', () => {
        const owned = ownedEquipmentKeys([
            { catalogRef: 'hs-iso-bench', name: 'Hammer Strength — Iso-Lateral Bench Press', function: 'Iso-Lateral Bench Press' },
            { name: 'Hack Squat' },
        ]);
        expect(owned.refs.has('hs-iso-bench')).toBe(true);
        expect(owned.names.has('hammer strength iso lateral bench press')).toBe(true);
        expect(owned.names.has('iso lateral bench press')).toBe(true);
        expect(owned.names.has('hack squat')).toBe(true);
    });

    it('handles equipment with no catalogRef or function', () => {
        const owned = ownedEquipmentKeys([{ name: 'Squat Rack' }]);
        expect(owned.refs.size).toBe(0);
        expect(owned.names.has('squat rack')).toBe(true);
    });
});

describe('matchesAllTokens', () => {
    it('matches every word in any order, ignoring separators', () => {
        expect(matchesAllTokens('Hammer Strength — Chest Press', 'hammer chest')).toBe(true);
        expect(matchesAllTokens('Hammer Strength — Chest Press', 'chest hammer')).toBe(true);
        expect(matchesAllTokens('Hammer Strength — Chest Press', 'hammer row')).toBe(false);
        expect(matchesAllTokens('Anything', '  ')).toBe(false);
    });
});

describe('searchCatalogMachines', () => {
    it('finds a machine from words spread across brand and name', () => {
        const hits = searchCatalogMachines('hammer row', CATALOG);
        expect(hits.map((h) => h.catalogRef)).toEqual(['hs-iso-row']);
    });

    it('finds a machine by name substring', () => {
        const hits = searchCatalogMachines('hack', CATALOG);
        expect(hits.map((h) => h.catalogRef)).toEqual(['lf-hack']);
        expect(hits[0].brandName).toBe('Life Fitness');
    });

    it('ignores queries shorter than two characters', () => {
        expect(searchCatalogMachines('h', CATALOG)).toEqual([]);
        expect(searchCatalogMachines('', CATALOG)).toEqual([]);
    });

    it('matches on brand, line and type as well as machine name', () => {
        expect(searchCatalogMachines('hammer', CATALOG).length).toBe(2);
        expect(searchCatalogMachines('selectorized', CATALOG).map((h) => h.catalogRef).sort())
            .toEqual(['lf-hack', 'lf-leg-press']);
    });

    it('ranks name-prefix above name-substring above brand/line match', () => {
        // "iso" prefixes both Iso-Lateral machine names; "Iso-Lateral" is also
        // the line name, so ranking (not just matching) decides the order.
        const hits = searchCatalogMachines('iso', CATALOG);
        expect(hits.map((h) => h.name)).toEqual(['Iso-Lateral Bench Press', 'Iso-Lateral Row']);

        const rowFirst = searchCatalogMachines('row', CATALOG);
        expect(rowFirst[0].name).toBe('Iso-Lateral Row');
    });

    it('excludes machines the user already owns by catalogRef', () => {
        const owned = ownedEquipmentKeys([{ catalogRef: 'lf-hack', name: 'Whatever it got renamed to' }]);
        expect(searchCatalogMachines('hack', CATALOG, { owned })).toEqual([]);
    });

    it('excludes machines the user owns under a normalized-equal name', () => {
        // Added by hand, so no catalogRef — name normalization is the only guard
        // against offering to add a second copy.
        const owned = ownedEquipmentKeys([{ name: 'hack   squat' }]);
        expect(searchCatalogMachines('hack', CATALOG, { owned })).toEqual([]);
    });

    it('caps results at max', () => {
        expect(searchCatalogMachines('e', CATALOG, { max: 1 }).length).toBeLessThanOrEqual(1);
        expect(searchCatalogMachines('press', CATALOG, { max: 1 }).length).toBe(1);
    });

    it('falls back to the line type and Multi-Use body part', () => {
        const [hack] = searchCatalogMachines('hack', CATALOG);
        expect(hack.type).toBe('Selectorized'); // machine has no type; line does
        expect(hack.bodyPart).toBe('Legs');
    });

    it('tolerates a missing or malformed catalog', () => {
        expect(searchCatalogMachines('press', null)).toEqual([]);
        expect(searchCatalogMachines('press', [{ name: 'Brand' }])).toEqual([]);
        expect(searchCatalogMachines('press', [{ name: 'Brand', lines: [{ name: 'Line' }] }])).toEqual([]);
    });

    // The pickers must hand this the AUGMENTED catalog: the raw export keys the
    // brand as `brand:` and gives machines no id, so reading it directly yields
    // undefined catalogRefs — which is what makes an added machine unlinkable.
    it('returns real, fully-identified results against the shipped catalog', () => {
        const hits = searchCatalogMachines('leg press', augmentStaticCatalog(EQUIPMENT_CATALOG));
        expect(hits.length).toBeGreaterThan(0);
        hits.forEach((h) => {
            expect(h.catalogRef).toBeTruthy();
            expect(h.brandName).toBeTruthy();
            expect(h.type).toBeTruthy();
        });
        expect(hits.some((h) => h.name.toLowerCase().includes('leg press'))).toBe(true);
    });
});

describe('inferEquipmentType', () => {
    it.each([
        ['Cable crossover', 'Cable'],
        ['Lat pulldown', 'Cable'],
        ['Adjustable dumbbell', 'Dumbbell'],
        ['Smith machine', 'Barbell'],
        ['Incline bench', 'Bench'],
        ['Squat rack', 'Rack'],
        ['Concept 2 rower', 'Cardio'],
        ['Hammer chest press', 'Plate-Loaded'],
    ])('types %s as %s', (name, expected) => {
        expect(inferEquipmentType(name)).toBe(expected);
    });

    it('defaults to Machine for anything it cannot place', () => {
        expect(inferEquipmentType('Belt squat')).toBe('Machine');
        expect(inferEquipmentType('')).toBe('Machine');
        expect(inferEquipmentType(null)).toBe('Machine');
    });

    it('matches whole words only, so "bike" inside another word does not win', () => {
        expect(inferEquipmentType('Bikefit trainer')).toBe('Machine');
    });
});
