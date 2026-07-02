// Tests for schema migration (v2 date-ID docs → v3 unique-ID docs).
// Mocks the Firestore layer with an in-memory store so the REAL module code
// runs — no re-implementation, so source changes can't drift past these tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory Firestore: flat map of 'users/{uid}/workouts/{id}' → data.
// vi.mock factories are hoisted, so shared state must come from vi.hoisted.
const { store } = vi.hoisted(() => ({ store: new Map() }));

vi.mock('../../js/core/data/firebase-config.js', () => {
    const pathOf = (segments) => segments.join('/');
    const docsInCollection = (colPath) =>
        [...store.entries()]
            .filter(([path]) => {
                if (!path.startsWith(colPath + '/')) return false;
                return !path.slice(colPath.length + 1).includes('/');
            })
            .map(([path, data]) => ({
                id: path.slice(colPath.length + 1),
                data: () => data,
                ref: { __path: path },
            }));

    return {
        db: {},
        doc: (_db, ...segments) => ({ __path: pathOf(segments), id: segments[segments.length - 1] }),
        collection: (_db, ...segments) => ({ __path: pathOf(segments) }),
        getDocs: async (colRef) => {
            const docs = docsInCollection(colRef.__path);
            return { forEach: (cb) => docs.forEach(cb), docs, size: docs.length };
        },
        getDoc: async (ref) => ({
            exists: () => store.has(ref.__path),
            data: () => store.get(ref.__path),
        }),
        setDoc: async (ref, data) => { store.set(ref.__path, data); },
        updateDoc: async (ref, data) => {
            store.set(ref.__path, { ...(store.get(ref.__path) || {}), ...data });
        },
        deleteDoc: async (ref) => { store.delete(ref.__path); },
        writeBatch: () => {
            const ops = [];
            return {
                update: (ref, data) => ops.push(() => {
                    store.set(ref.__path, { ...(store.get(ref.__path) || {}), ...data });
                }),
                commit: async () => ops.forEach((op) => op()),
            };
        },
    };
});

import { needsMigration, runMigration, migrateEquipmentBaseWeight } from '../../js/core/data/schema-migration.js';

const UID = 'test-user';
const workoutPath = (id) => `users/${UID}/workouts/${id}`;
const equipmentPath = (id) => `users/${UID}/equipment/${id}`;

const v2Workout = (overrides = {}) => ({
    workoutType: 'Chest – Push',
    exercises: {
        exercise_0: {
            name: 'Bench Press',
            sets: [{ reps: 10, weight: 135, originalUnit: 'lbs', completed: true }],
            completed: true,
        },
    },
    completedAt: '2025-01-15T11:45:00.000Z',
    ...overrides,
});

beforeEach(() => store.clear());

describe('needsMigration', () => {
    it('is true when any doc uses a date as its ID', async () => {
        store.set(workoutPath('2025-01-15'), v2Workout());
        expect(await needsMigration(UID)).toBe(true);
    });

    it('is false when all docs use unique v3 IDs', async () => {
        store.set(workoutPath('2025-01-15_1736900000000_abc123'), v2Workout({ version: '3.0' }));
        expect(await needsMigration(UID)).toBe(false);
    });

    it('is false for an empty collection and for a missing userId', async () => {
        expect(await needsMigration(UID)).toBe(false);
        expect(await needsMigration(null)).toBe(false);
    });

    it('does not treat near-date IDs as old schema', async () => {
        store.set(workoutPath('2025-1-5'), v2Workout());
        expect(await needsMigration(UID)).toBe(false);
    });
});

describe('runMigration', () => {
    it('converts a date-ID doc to a unique-ID doc and deletes the original', async () => {
        store.set(workoutPath('2025-01-15'), v2Workout());

        const results = await runMigration(UID);

        expect(results.success).toBe(true);
        expect(results.migrated).toBe(1);
        expect(results.errors).toEqual([]);
        expect(store.has(workoutPath('2025-01-15'))).toBe(false);

        const [path, data] = [...store.entries()][0];
        const newId = path.split('/').pop();
        expect(newId).toMatch(/^2025-01-15_\d+_[a-z0-9]{6}$/);
        expect(data.workoutId).toBe(newId);
        expect(data.date).toBe('2025-01-15');
        expect(data.version).toBe('3.0');
        expect(data.migratedFrom).toBe('2025-01-15');
        expect(data.migratedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('preserves all workout content through migration', async () => {
        const original = v2Workout();
        store.set(workoutPath('2025-01-15'), original);

        await runMigration(UID);

        const migrated = [...store.values()][0];
        expect(migrated.workoutType).toBe(original.workoutType);
        expect(migrated.completedAt).toBe(original.completedAt);
        expect(migrated.exercises).toEqual(original.exercises);
    });

    it('leaves v3 docs untouched and assigns distinct IDs to multiple migrations', async () => {
        const v3Id = '2025-01-10_1736500000000_xyz789';
        store.set(workoutPath(v3Id), v2Workout({ version: '3.0', date: '2025-01-10' }));
        store.set(workoutPath('2025-01-15'), v2Workout());
        store.set(workoutPath('2025-01-16'), v2Workout({ workoutType: 'Legs' }));

        const results = await runMigration(UID);

        expect(results.migrated).toBe(2);
        expect(store.has(workoutPath(v3Id))).toBe(true);
        expect(store.size).toBe(3);
        const ids = [...store.keys()].map((p) => p.split('/').pop());
        expect(new Set(ids).size).toBe(3);
    });

    it('is idempotent — a second run migrates nothing', async () => {
        store.set(workoutPath('2025-01-15'), v2Workout());

        await runMigration(UID);
        const second = await runMigration(UID);

        expect(second.success).toBe(true);
        expect(second.migrated).toBe(0);
        expect(second.message).toBe('No migration needed');
        expect(store.size).toBe(1);
    });

    it('fails safely without a userId', async () => {
        const results = await runMigration(null);
        expect(results.success).toBe(false);
        expect(results.migrated).toBe(0);
        expect(results.errors.length).toBe(1);
    });
});

describe('migrateEquipmentBaseWeight', () => {
    it('applies type defaults only to docs missing baseWeight', async () => {
        store.set(equipmentPath('eq1'), { name: 'Oly bar', equipmentType: 'Barbell' });
        store.set(equipmentPath('eq2'), { name: 'Lat pulldown', equipmentType: 'Cable' });
        store.set(equipmentPath('eq3'), { name: 'Leg press', equipmentType: 'Machine' });
        store.set(equipmentPath('eq4'), { name: 'Custom bar', equipmentType: 'Barbell', baseWeight: 35, baseWeightUnit: 'lbs' });

        const touched = await migrateEquipmentBaseWeight(UID);

        expect(touched).toBe(3);
        expect(store.get(equipmentPath('eq1'))).toMatchObject({ baseWeight: 45, baseWeightUnit: 'lbs' });
        expect(store.get(equipmentPath('eq2'))).toMatchObject({ baseWeight: 5, baseWeightUnit: 'lbs' });
        expect(store.get(equipmentPath('eq3'))).toMatchObject({ baseWeight: 0, baseWeightUnit: 'lbs' });
        expect(store.get(equipmentPath('eq4')).baseWeight).toBe(35);
    });

    it('does not touch an explicit baseWeight of 0', async () => {
        store.set(equipmentPath('eq1'), { name: 'Bodyweight station', equipmentType: 'Barbell', baseWeight: 0, baseWeightUnit: 'lbs' });

        const touched = await migrateEquipmentBaseWeight(UID);

        expect(touched).toBe(0);
        expect(store.get(equipmentPath('eq1')).baseWeight).toBe(0);
    });

    it('is idempotent — a second run touches nothing', async () => {
        store.set(equipmentPath('eq1'), { name: 'Oly bar', equipmentType: 'Barbell' });

        expect(await migrateEquipmentBaseWeight(UID)).toBe(1);
        expect(await migrateEquipmentBaseWeight(UID)).toBe(0);
    });

    it('returns 0 without a userId', async () => {
        expect(await migrateEquipmentBaseWeight(null)).toBe(0);
    });
});
