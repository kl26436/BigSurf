// LB-2 — exercise labels survive the round trip through the real
// FirebaseWorkoutManager over the shared in-memory Firestore mock:
// `pattern` is no longer stripped on the default-library read, an override
// saved with empty tags no longer erases the built-in's tags, and saves
// carry (validated) `pattern` through.

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
    openModal: vi.fn(),
    closeModal: vi.fn(),
}));

import { AppState } from '../../js/core/utils/app-state.js';
import { FirebaseWorkoutManager } from '../../js/core/data/firebase-workout-manager.js';
import { validateExerciseData } from '../../js/core/utils/validation.js';

const UID = 'labels-user';
let mgr;

beforeEach(() => {
    store.clear();
    AppState.currentUser = { uid: UID };
    mgr = new FirebaseWorkoutManager(AppState);
});

describe('getDefaultExercises keeps the CP-1 labels', () => {
    it('pattern (and role/progression when present) come through the read', async () => {
        store.set('exercises/hip_thrust', {
            name: 'Hip Thrust Machine', bodyPart: 'Glutes', tags: ['glutes'], pattern: 'hip-dominant',
            role: 'primary', progression: 'double',
        });
        store.set('exercises/pec_deck', { name: 'Pec Deck', bodyPart: 'Chest', tags: ['chest'] });
        const list = await mgr.getDefaultExercises();
        const hip = list.find(e => e.name === 'Hip Thrust Machine');
        expect(hip.pattern).toBe('hip-dominant');
        expect(hip.role).toBe('primary');
        expect(hip.progression).toBe('double');
        const pec = list.find(e => e.name === 'Pec Deck');
        expect(pec.pattern).toBeNull(); // null = inferred at read time
        expect(pec).not.toHaveProperty('role');
    });
});

describe('mergeExercisesWithOverrides', () => {
    const defaults = [{ id: 'hip', name: 'Hip Thrust Machine', bodyPart: 'Glutes', tags: ['glutes', 'hamstrings'], pattern: 'hip-dominant' }];

    it('an override with empty tags keeps the built-in tags and pattern', () => {
        const [m] = mgr.mergeExercisesWithOverrides(defaults, [], [{ originalId: 'hip', name: 'Hip Thrust Machine', bodyPart: 'Core', tags: [] }]);
        expect(m.bodyPart).toBe('Core');
        expect(m.tags).toEqual(['glutes', 'hamstrings']);
        expect(m.pattern).toBe('hip-dominant');
        expect(m.isOverridden).toBe(true);
    });

    it('an override with its own tags wins', () => {
        const [m] = mgr.mergeExercisesWithOverrides(defaults, [], [{ originalName: 'hip thrust machine', tags: ['glutes'] }]);
        expect(m.tags).toEqual(['glutes']);
    });
});

describe('saves carry pattern through', () => {
    it('a custom exercise stores its pattern', async () => {
        const id = await mgr.saveCustomExercise({ name: 'Reverse Glute-Ham Raise', bodyPart: 'Glutes', equipmentType: 'Machine', tags: ['glutes'], pattern: 'hip-dominant' });
        expect(store.get(`users/${UID}/customExercises/${id}`).pattern).toBe('hip-dominant');
    });

    it('an invalid pattern is dropped (null = infer it), never stored', async () => {
        const id = await mgr.saveCustomExercise({ name: 'Odd One', bodyPart: 'Legs', equipmentType: 'Machine', pattern: 'hinge' });
        expect(store.get(`users/${UID}/customExercises/${id}`).pattern).toBeNull();
    });

    it('a first edit of a built-in writes an override with tags and pattern', async () => {
        const id = await mgr.saveUniversalExercise({
            id: 'back_ext', name: 'Back Extension Machine', bodyPart: 'Back', equipmentType: 'Machine',
            tags: ['lower back', 'glutes'], pattern: 'hip-dominant', isDefault: true,
        }, true);
        const doc = store.get(`users/${UID}/exerciseOverrides/${id}`);
        expect(doc.tags).toEqual(['lower back', 'glutes']);
        expect(doc.pattern).toBe('hip-dominant');
    });
});

describe('validateExerciseData', () => {
    it('keeps a valid pattern, drops an unknown one, normalizes tags', () => {
        expect(validateExerciseData({ name: 'x', pattern: 'calf' }).pattern).toBe('calf');
        expect(validateExerciseData({ name: 'x', pattern: 'Hinge' }).pattern).toBeNull();
        expect(validateExerciseData({ name: 'x' })).not.toHaveProperty('pattern');
        expect(validateExerciseData({ name: 'x', tags: ['Calves', 'calves', ''] }).tags).toEqual(['calves']);
    });
});
