// AP-12 / AP-13 — the equipment create planner (pure) and the one writer,
// FirebaseWorkoutManager#getOrCreateEquipment (real module over the shared
// in-memory Firestore mock).

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

import {
    planInlineEquipment, parseEquipmentName, knownBrands, matchOwnedEquipment, suggestedBaseWeight,
} from '../../js/core/data/equipment-create.js';
import { inferEquipmentType } from '../../js/core/data/catalog-search.js';
import * as firebaseConfig from '../../js/core/data/firebase-config.js';
import { FirebaseWorkoutManager } from '../../js/core/data/firebase-workout-manager.js';
import { AppState } from '../../js/core/utils/app-state.js';

const owned = [
    { id: 'e1', name: 'Hammer Strength — Chest Press', brand: 'Hammer Strength', locations: ['Downtown'], exerciseTypes: ['Chest Press'] },
    { id: 'e2', name: 'Life Fitness Leg Press', brand: 'Life Fitness', locations: [], exerciseTypes: [] },
];
const catalog = [{ name: 'Nautilus' }, { name: 'Hammer Strength' }, { name: 'Hammer Strength Pro' }];

describe('parseEquipmentName / knownBrands', () => {
    it('recognises catalog brands as well as owned ones, longest first', () => {
        const brands = knownBrands(owned, catalog);
        expect(brands[0]).toBe('Hammer Strength Pro');
        expect(brands).toContain('Nautilus');
        expect(parseEquipmentName('nautilus incline press', brands)).toEqual({ brand: 'Nautilus', function: 'incline press' });
        expect(parseEquipmentName('Hammer Strength Pro — Row', brands)).toEqual({ brand: 'Hammer Strength Pro', function: 'Row' });
        expect(parseEquipmentName('Incline press', brands)).toEqual({ brand: null, function: null });
    });
});

describe('matchOwnedEquipment', () => {
    it('exact ignores case, spacing and separators', () => {
        expect(matchOwnedEquipment('hammer strength chest press', owned)).toMatchObject({ how: 'exact', equipment: { id: 'e1' } });
    });
    it('a close name is "similar", not exact', () => {
        expect(matchOwnedEquipment('Hammer Strength Chest Pres', owned)).toMatchObject({ how: 'similar', equipment: { id: 'e1' } });
        expect(matchOwnedEquipment('Cable crossover', owned)).toBeNull();
    });
});

describe('planInlineEquipment', () => {
    it('rejects one character', () => {
        expect(planInlineEquipment({ query: 'h', owned })).toEqual({ action: 'invalid', error: 'Type at least 2 characters' });
    });
    it('an owned (or nearly owned) name is used, not duplicated', () => {
        expect(planInlineEquipment({ query: 'hammer strength chest press', owned }).action).toBe('use-existing');
        const near = planInlineEquipment({ query: 'Hammer Strength Chest Pres', owned });
        expect(near).toMatchObject({ action: 'use-existing', how: 'similar' });
    });
    it('"add as new anyway" (force) creates over a similar match — never over an exact one', () => {
        expect(planInlineEquipment({ query: 'Hammer Strength Chest Pres', owned, force: true }).action).toBe('create');
        expect(planInlineEquipment({ query: 'Hammer Strength — Chest Press', owned, force: true }).action).toBe('use-existing');
    });
    it('a new machine: brand composed, type inferred, unit, gym and exercise set, base weight suggested', () => {
        const plan = planInlineEquipment({
            query: 'nautilus  incline press', exerciseName: 'Incline Press', gymName: 'Downtown', unit: 'kg', owned, catalog,
        });
        expect(plan).toMatchObject({ action: 'create', similar: null });
        expect(plan.doc).toEqual({
            name: 'Nautilus — incline press', brand: 'Nautilus', function: 'incline press',
            equipmentType: 'Machine', baseWeight: 0, baseWeightUnit: 'kg', preferredUnit: 'kg',
            locations: ['Downtown'], exerciseTypes: ['Incline Press'], createdVia: 'picker',
        });
        expect(planInlineEquipment({ query: 'Olympic barbell', owned }).doc).toMatchObject({ equipmentType: 'Barbell', baseWeight: 45 });
    });
    it('no gym, no exercise → no tags (created anyway)', () => {
        expect(planInlineEquipment({ query: 'Pec deck', owned }).doc).toMatchObject({ locations: [], exerciseTypes: [] });
    });
    it('the details form: explicit brand, type, unit and base win', () => {
        const plan = planInlineEquipment({ query: 'Row', brand: 'Arsenal', type: 'Plate-Loaded', unit: 'lbs', baseWeight: 90, owned, force: true });
        expect(plan.doc).toMatchObject({ name: 'Arsenal — Row', brand: 'Arsenal', equipmentType: 'Plate-Loaded', baseWeight: 90 });
        // A brand already typed into the name isn't said twice.
        expect(planInlineEquipment({ query: 'Arsenal Row', brand: 'Arsenal', owned, force: true }).doc.name).toBe('Arsenal — Row');
    });
    it('suggestedBaseWeight per unit', () => {
        expect(suggestedBaseWeight('Barbell', 'kg')).toBe(20);
        expect(suggestedBaseWeight('Machine', 'lbs')).toBe(0);
    });
});

describe('inferEquipmentType — Selectorized (AP-12)', () => {
    it('pin-and-stack names are Selectorized, plate-loaded still wins its words', () => {
        expect(inferEquipmentType('Selectorized leg curl')).toBe('Selectorized');
        expect(inferEquipmentType('Pin loaded chest press')).toBe('Selectorized');
        expect(inferEquipmentType('Hammer iso lateral row')).toBe('Plate-Loaded');
    });
});

describe('getOrCreateEquipment — the one writer (AP-12 / AP-13)', () => {
    const UID = 'u1';
    const mgr = () => new FirebaseWorkoutManager(AppState);
    const docsUnder = () => [...store.entries()].filter(([k]) => k.startsWith(`users/${UID}/equipment/`));
    beforeEach(() => {
        store.clear();
        AppState.currentUser = { uid: UID };
        AppState._cachedEquipment = null;
        AppState._cachedLocations = [];
    });

    it('with the warm cache passed: zero reads, one write, the new doc lands in the cache', async () => {
        const getDocs = vi.spyOn(firebaseConfig, 'getDocs');
        const known = owned.map(e => ({ ...e }));
        const eq = await mgr().getOrCreateEquipment('Nautilus — Incline press', {
            equipmentType: 'Machine', preferredUnit: 'kg', createdVia: 'picker', locations: ['Downtown'], knownEquipment: known,
        });
        expect(getDocs).not.toHaveBeenCalled();
        getDocs.mockRestore();
        expect(docsUnder()).toHaveLength(1);
        expect(AppState._cachedEquipment.map(e => e.id)).toEqual(['e1', 'e2', eq.id]);
    });

    it('saveEquipment keeps preferredUnit and createdVia (they used to be dropped)', async () => {
        await mgr().getOrCreateEquipment('Pec deck', { preferredUnit: 'kg', createdVia: 'photo-id', knownEquipment: owned });
        const [, saved] = docsUnder()[0];
        expect(saved).toMatchObject({ name: 'Pec deck', preferredUnit: 'kg', createdVia: 'photo-id' });
        expect(saved.knownEquipment).toBeUndefined();
    });

    it('an existing name (any spelling) writes no new doc and gains the requested gym + exercise', async () => {
        store.set(`users/${UID}/equipment/e1`, { ...owned[0] });
        const known = [{ ...owned[0] }];
        const eq = await mgr().getOrCreateEquipment('hammer strength chest press', {
            locations: ['Uptown'], exerciseTypes: ['Incline Press'], knownEquipment: known,
        });
        expect(eq.id).toBe('e1');
        expect(docsUnder()).toHaveLength(1);
        expect(store.get(`users/${UID}/equipment/e1`)).toMatchObject({
            locations: ['Downtown', 'Uptown'], exerciseTypes: ['Chest Press', 'Incline Press'],
        });
    });

    it('brand parsing on the raw-name path uses the shared rules', async () => {
        const eq = await mgr().getOrCreateEquipment('Life Fitness Hip Abductor', { knownEquipment: owned });
        expect(eq).toMatchObject({ brand: 'Life Fitness', function: 'Hip Abductor' });
    });
});
