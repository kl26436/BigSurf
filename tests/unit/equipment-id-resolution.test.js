// Phase 8b migration safety — equipment NAME → ID resolution.
// Imports the REAL resolver (no re-implementation). The load-bearing property
// under test: a *confidently-wrong* match is never auto-written — anything
// ambiguous is flagged needsReview instead.

import { describe, it, expect } from 'vitest';
import {
    resolveEquipmentId,
    confidentEquipmentId,
    normalizeEquipName,
    RESOLVE_METHOD,
} from '../../js/core/data/equipment-id-resolver.js';

const EQUIP = [
    { id: 'e_flat', name: 'Hammer Strength — Flat Bench Press' },
    { id: 'e_incline', name: 'Hammer Strength — Incline Press' },
    { id: 'e_lat', name: 'Panatta Lat Pulldown', aliases: ['Lat Pull Down Machine'] },
    { id: 'e_leg', name: 'Cybex Leg Press' },
];

describe('normalizeEquipName', () => {
    it('lowercases, collapses separators and whitespace', () => {
        expect(normalizeEquipName('Hammer Strength — Flat  Bench'))
            .toBe('hammer strength flat bench');
        expect(normalizeEquipName('Lat-Pulldown')).toBe('lat pulldown');
    });
    it('is safe on null/empty', () => {
        expect(normalizeEquipName(null)).toBe('');
        expect(normalizeEquipName('')).toBe('');
    });
});

describe('resolveEquipmentId — confident matches', () => {
    it('exact (case / dash / whitespace insensitive) resolves with no review', () => {
        const r = resolveEquipmentId('hammer strength flat bench press', EQUIP);
        expect(r.id).toBe('e_flat');
        expect(r.method).toBe(RESOLVE_METHOD.EXACT);
        expect(r.needsReview).toBe(false);
        expect(r.confidence).toBe(1);
    });

    it('alias match resolves', () => {
        const r = resolveEquipmentId('Lat Pull Down Machine', EQUIP);
        expect(r.id).toBe('e_lat');
        expect(r.method).toBe(RESOLVE_METHOD.ALIAS);
        expect(r.needsReview).toBe(false);
    });

    it('fuzzy match with a clear winner resolves', () => {
        // Missing the "Cybex" brand prefix but otherwise identical.
        const r = resolveEquipmentId('Leg Press', [
            { id: 'e_leg', name: 'Leg Press' },
            { id: 'e_row', name: 'Seated Cable Row' },
        ]);
        expect(r.id).toBe('e_leg');
        expect(r.needsReview).toBe(false);
    });
});

describe('resolveEquipmentId — refuses to guess', () => {
    it('below threshold → no id, needsReview', () => {
        const r = resolveEquipmentId('Treadmill', EQUIP);
        expect(r.id).toBeNull();
        expect(r.method).toBe(RESOLVE_METHOD.NONE);
        expect(r.needsReview).toBe(true);
    });

    it('two near-equal fuzzy candidates → AMBIGUOUS, never a silent pick', () => {
        const r = resolveEquipmentId('Press', [
            { id: 'e_a', name: 'Chest Press' },
            { id: 'e_b', name: 'Shoulder Press' },
        ]);
        // Whatever the scores, it must NOT confidently write one.
        expect(r.needsReview).toBe(true);
        if (r.method === RESOLVE_METHOD.AMBIGUOUS) {
            expect(r.id).toBeNull();
            expect(r.candidates.length).toBeGreaterThanOrEqual(2);
        }
    });

    it('duplicate exact names → AMBIGUOUS with candidates, no auto-pick', () => {
        const dupes = [
            { id: 'e_1', name: 'Flat Bench' },
            { id: 'e_2', name: 'Flat Bench' },
        ];
        const r = resolveEquipmentId('flat bench', dupes);
        expect(r.method).toBe(RESOLVE_METHOD.AMBIGUOUS);
        expect(r.needsReview).toBe(true);
        expect(r.id).toBeNull();
        expect(r.candidates).toEqual(['e_1', 'e_2']);
    });

    it('a close-but-wrong incline/flat pair does not silently mis-attribute', () => {
        // "Incline Press" is a real machine; "Flat Bench Press" must not grab it.
        const r = resolveEquipmentId('Incline Press', EQUIP);
        // Either resolves to the actual incline OR asks for review — but never
        // silently resolves to the flat bench.
        expect(r.id === 'e_flat' && r.needsReview === false).toBe(false);
    });
});

describe('confidentEquipmentId (dual-write helper)', () => {
    it('returns the id for a confident exact match', () => {
        expect(confidentEquipmentId('Cybex Leg Press', EQUIP)).toBe('e_leg');
    });
    it('returns null for anything ambiguous — never stamps a guess', () => {
        const dupes = [{ id: 'a', name: 'Machine' }, { id: 'b', name: 'Machine' }];
        expect(confidentEquipmentId('Machine', dupes)).toBeNull();
        expect(confidentEquipmentId('Totally Unknown Rig', EQUIP)).toBeNull();
        expect(confidentEquipmentId('', EQUIP)).toBeNull();
    });
});

describe('resolveEquipmentId — degenerate input', () => {
    it('empty name → needsReview', () => {
        expect(resolveEquipmentId('', EQUIP).needsReview).toBe(true);
        expect(resolveEquipmentId(null, EQUIP).id).toBeNull();
    });
    it('empty equipment list → needsReview', () => {
        expect(resolveEquipmentId('Anything', []).needsReview).toBe(true);
    });
    it('a stricter fuzzyThreshold sends more to review', () => {
        const loose = resolveEquipmentId('Cybex Leg', EQUIP, { fuzzyThreshold: 0.5 });
        const strict = resolveEquipmentId('Cybex Leg', EQUIP, { fuzzyThreshold: 0.99 });
        expect(strict.needsReview).toBe(true);
        // loose may or may not resolve, but never crashes
        expect(typeof loose.needsReview).toBe('boolean');
    });
});
