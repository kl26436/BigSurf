// LB-5 — a catalog machine's `pattern` is copied onto the user's equipment
// doc by the one writer (FirebaseWorkoutManager#getOrCreateEquipment →
// saveEquipment), which every catalog → equipment path goes through
// (library promote / quick-add, the workout's catalog suggestions), and by
// updateEquipment when a doc is linked to the catalog. Real module over the
// shared in-memory Firestore mock.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map() }));
vi.mock('../../js/core/data/firebase-config.js', async () => {
    const { createFirestoreMock } = await import('../fixtures/firestore-mock.js');
    return createFirestoreMock(store);
});
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    convertWeight: vi.fn((w) => w),
    escapeHtml: vi.fn((s) => s),
}));

import { FirebaseWorkoutManager, catalogPatternForRef } from '../../js/core/data/firebase-workout-manager.js';
import { AppState } from '../../js/core/utils/app-state.js';
import { EQUIPMENT_CATALOG } from '../../js/core/data/equipment-catalog.js';
import { augmentStaticCatalog } from '../../js/core/data/equipment-catalog-helpers.js';
import { composeEquipmentName } from '../../js/core/utils/equipment-name.js';
import { patternsForEquipment } from '../../js/core/features/movement-patterns.js';

const UID = 'lb5';
const ARSENAL_45 = 'arsenal-strength/alpha/45-degree-back-extension';
const ARSENAL_NAME = composeEquipmentName({ brand: 'Arsenal Strength', line: 'Alpha', function: '45 Degree Back Extension' });
const mgr = () => new FirebaseWorkoutManager(AppState);
const saved = () => [...store.entries()].filter(([k]) => k.startsWith(`users/${UID}/equipment/`)).map(([, v]) => v);

// The fields promoteCatalogToEquipment (equipment-library-ui.js) passes.
const promoteFields = (ref, fn, extra = {}) => ({
    brand: 'Arsenal Strength', line: 'Alpha', function: fn, equipmentType: 'Rack',
    baseWeight: 0, baseWeightUnit: 'lbs', catalogRef: ref, exerciseTypes: [], ...extra,
});

beforeEach(() => {
    store.clear();
    AppState.currentUser = { uid: UID };
    AppState._cachedEquipment = null;
    AppState._cachedLocations = [];
    AppState.equipmentCatalog = null;
});

describe('catalogPatternForRef', () => {
    it('resolves from the static seed; a loaded (Firestore) catalog without the field falls through', async () => {
        expect(await catalogPatternForRef(ARSENAL_45)).toBe('hip-dominant');
        const firestoreOld = augmentStaticCatalog(EQUIPMENT_CATALOG).map(b => ({
            ...b, lines: b.lines.map(l => ({ ...l, machines: l.machines.map(({ pattern: _p, ...m }) => m) })),
        }));
        expect(await catalogPatternForRef(ARSENAL_45, firestoreOld)).toBe('hip-dominant');
        expect(await catalogPatternForRef('hammer-strength/plate-loaded/shrug-deadlift')).toBeNull(); // combo
        expect(await catalogPatternForRef(null)).toBeNull();
        expect(await catalogPatternForRef('not/a/machine')).toBeNull();
    });
});

describe('promote from the catalog → the doc carries the catalog pattern', () => {
    it('acceptance: the Arsenal 45° bench, promoted with no exerciseTypes, is a hinge', async () => {
        const eq = await mgr().getOrCreateEquipment(ARSENAL_NAME, promoteFields(ARSENAL_45, '45 Degree Back Extension', { knownEquipment: [] }));
        expect(eq.id).toBeTruthy();
        const [doc] = saved();
        expect(doc).toMatchObject({ catalogRef: ARSENAL_45, pattern: 'hip-dominant', exerciseTypes: [] });
        expect(patternsForEquipment(doc)).toEqual(['hip-dominant']);
    });

    it('a catalog machine without a single movement writes no pattern field', async () => {
        await mgr().getOrCreateEquipment('Arsenal Strength — Alpha — Combo Rack',
            promoteFields('arsenal-strength/alpha/combo-rack', 'Combo Rack', { knownEquipment: [] }));
        expect(saved()[0]).not.toHaveProperty('pattern');
    });

    it('a typed (non-catalog) machine gets no pattern; an explicit valid one is kept, an invalid one dropped', async () => {
        await mgr().getOrCreateEquipment('Pec deck', { knownEquipment: [] });
        expect(saved()[0]).not.toHaveProperty('pattern');
        store.clear();
        await mgr().getOrCreateEquipment('Reverse hyper', { pattern: 'hip-dominant', knownEquipment: [] });
        expect(saved()[0].pattern).toBe('hip-dominant');
        store.clear();
        await mgr().getOrCreateEquipment('Mystery', { pattern: 'bogus', knownEquipment: [] });
        expect(saved()[0]).not.toHaveProperty('pattern');
    });

    it('promoting a machine you already own (same name) stamps the pattern it was missing', async () => {
        const existing = { id: 'e1', name: ARSENAL_NAME, catalogRef: ARSENAL_45, locations: [], exerciseTypes: ['Back Extension Machine'] };
        store.set(`users/${UID}/equipment/e1`, { ...existing });
        const eq = await mgr().getOrCreateEquipment(ARSENAL_NAME, promoteFields(ARSENAL_45, '45 Degree Back Extension', { knownEquipment: [{ ...existing }] }));
        expect(eq.id).toBe('e1');
        expect(saved()).toHaveLength(1);
        expect(store.get(`users/${UID}/equipment/e1`)).toMatchObject({ pattern: 'hip-dominant', exerciseTypes: ['Back Extension Machine'] });
    });
});

describe('updateEquipment — linking to the catalog brings the pattern', () => {
    it('a new link stamps; a re-link to a combo removes the stale one; an explicit pattern wins', async () => {
        store.set(`users/${UID}/equipment/e2`, { id: 'e2', name: 'My back ext', exerciseTypes: [] });
        await mgr().updateEquipment('e2', { catalogRef: ARSENAL_45 });
        expect(store.get(`users/${UID}/equipment/e2`).pattern).toBe('hip-dominant');

        await mgr().updateEquipment('e2', { catalogRef: 'hammer-strength/plate-loaded/shrug-deadlift' });
        expect(store.get(`users/${UID}/equipment/e2`)).not.toHaveProperty('pattern');

        await mgr().updateEquipment('e2', { catalogRef: ARSENAL_45, pattern: 'trunk-ext' });
        expect(store.get(`users/${UID}/equipment/e2`).pattern).toBe('trunk-ext');
    });

    it('an edit that doesn\'t touch the link leaves pattern alone', async () => {
        store.set(`users/${UID}/equipment/e3`, { id: 'e3', name: 'X', catalogRef: ARSENAL_45, pattern: 'hip-dominant' });
        await mgr().updateEquipment('e3', { name: 'Renamed' });
        expect(store.get(`users/${UID}/equipment/e3`)).toMatchObject({ name: 'Renamed', pattern: 'hip-dominant' });
    });
});
