// Tests for PR detection logic from pr-tracker.js
// Imports the REAL module — firebase-config is mocked with an in-memory doc
// store (same pattern as schema-migration.test.js) so loadPRData() hydrates the
// module's internal prData state from each test's fixture before checking.

import { describe, it, expect, vi } from 'vitest';
import { mockPRData, emptyPRData } from '../fixtures/mock-pr-data.js';

// vi.mock factories are hoisted, so shared state must come from vi.hoisted.
const { store } = vi.hoisted(() => ({ store: new Map() }));

vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {},
    doc: (_db, ...segments) => ({ __path: segments.join('/') }),
    setDoc: async (ref, data) => { store.set(ref.__path, data); },
    getDoc: async (ref) => ({
        exists: () => store.has(ref.__path),
        data: () => store.get(ref.__path),
    }),
}));

import { AppState } from '../../js/core/utils/app-state.js';
import {
    loadPRData,
    checkForNewPR as realCheckForNewPR,
    calculateVolume,
    getExercisePRs,
    recordPR,
    getAllPRs,
} from '../../js/core/features/pr-tracker.js';

AppState.currentUser = { uid: 'test-user' };
const PR_DOC_PATH = 'users/test-user/stats/personalRecords';

// Harness: seed the mocked Firestore doc with the fixture, hydrate the module's
// prData state via the real loadPRData(), then run the real checkForNewPR().
async function checkForNewPR(exerciseName, reps, weight, equipment, prData, equipmentId = null) {
    store.set(PR_DOC_PATH, JSON.parse(JSON.stringify(prData)));
    await loadPRData();
    return realCheckForNewPR(exerciseName, reps, weight, equipment, equipmentId);
}

// Seed a fixture and hydrate prData without running a check — for tests that
// then call getExercisePRs / recordPR / getAllPRs against the real module state.
async function seedPRData(prData) {
    store.set(PR_DOC_PATH, JSON.parse(JSON.stringify(prData)));
    await loadPRData();
}

describe('calculateVolume', () => {
    it('calculates volume correctly', () => {
        expect(calculateVolume(10, 135)).toBe(1350);
    });

    it('returns 0 when reps is 0', () => {
        expect(calculateVolume(0, 135)).toBe(0);
    });

    it('returns 0 when weight is 0', () => {
        expect(calculateVolume(10, 0)).toBe(0);
    });

    it('handles large values', () => {
        expect(calculateVolume(20, 500)).toBe(10000);
    });
});

describe('checkForNewPR', () => {
    it('detects new weight PR', async () => {
        const result = await checkForNewPR('Bench Press', 5, 210, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('maxWeight');
        expect(result.previousPR.weight).toBe(200);
    });

    it('detects new reps PR at same or higher weight', async () => {
        // Existing maxReps: weight 135, reps 12
        const result = await checkForNewPR('Bench Press', 15, 135, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('maxReps');
        expect(result.previousPR.reps).toBe(12);
    });

    it('detects new volume PR', async () => {
        // Existing maxVolume: 1920 (160 x 12)
        // New: 180 x 12 = 2160 > 1920
        const result = await checkForNewPR('Bench Press', 12, 180, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('maxVolume');
        expect(result.previousPR.volume).toBe(1920);
    });

    it('returns no PR when set does not beat any record', async () => {
        // 135 x 8 = 1080 volume, weight 135 < 200, reps 8 < 12
        const result = await checkForNewPR('Bench Press', 8, 135, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(false);
        expect(result.prType).toBeNull();
    });

    it('returns first PR for new exercise', async () => {
        const result = await checkForNewPR('Overhead Press', 10, 95, 'Barbell', mockPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('first');
        expect(result.previousPR).toBeNull();
    });

    it('returns first PR for existing exercise with new equipment', async () => {
        const result = await checkForNewPR('Bench Press', 10, 135, 'Barbell', mockPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('first');
        expect(result.previousPR).toBeNull();
    });

    it('returns no PR for zero reps', async () => {
        const result = await checkForNewPR('Bench Press', 0, 200, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(false);
    });

    it('returns no PR for zero weight', async () => {
        const result = await checkForNewPR('Bench Press', 10, 0, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(false);
    });

    it('returns no PR for null reps', async () => {
        const result = await checkForNewPR('Bench Press', null, 200, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(false);
    });

    it('does not count reps PR at lower weight', async () => {
        // Existing maxReps: weight 135, reps 12
        // Trying 15 reps at only 100 lbs - should NOT be a reps PR
        // But 100 x 15 = 1500 < 1920 volume, and 100 < 200 weight
        const result = await checkForNewPR('Bench Press', 15, 100, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(false);
    });

    it('works with empty PR data', async () => {
        const result = await checkForNewPR('Bench Press', 10, 135, 'Barbell', emptyPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('first');
    });

    it('weight PR takes priority over volume PR', async () => {
        // If weight is a new max, it should report maxWeight even if volume is also new
        const result = await checkForNewPR('Bench Press', 10, 210, 'Hammer Strength', mockPRData);
        expect(result.prType).toBe('maxWeight');
    });
});

// Equipment id-aware PR keying (8b step 3b, read-tolerance).
// The store may hold entries under either the equipment NAME (legacy) or a stable
// equipmentId (after a future re-key). Reads must find PRs under either key; new
// writes stay name-keyed for now (the deferred-rekey decision), so the display
// code that surfaces the key as the equipment label never shows a raw id.
describe('equipment id-aware PR keying', () => {
    // A store where the PR for "Bench Press" lives under an id key, not its name.
    const idKeyedPRData = {
        exercisePRs: {
            'Bench Press': {
                bodyPart: 'Chest',
                eq_hammer_123: {
                    maxWeight: { weight: 200, reps: 8, date: '2026-01-10', location: 'Gym A', unit: 'lbs' },
                    maxReps: { weight: 135, reps: 12, date: '2026-01-08', location: 'Gym A', unit: 'lbs' },
                    maxVolume: { weight: 160, reps: 12, volume: 1920, date: '2026-01-09', location: 'Gym A', unit: 'lbs' },
                },
            },
        },
        locations: {},
        currentLocation: null,
    };

    it('getExercisePRs finds an id-keyed entry via equipmentId even when the name differs', async () => {
        await seedPRData(idKeyedPRData);
        // Equipment was renamed since — the passed name no longer matches the key,
        // but the id does.
        const prs = getExercisePRs('Bench Press', 'Renamed Hammer Press', 'eq_hammer_123');
        expect(prs).not.toBeNull();
        expect(prs.maxWeight.weight).toBe(200);
    });

    it('getExercisePRs returns null when neither id nor name matches', async () => {
        await seedPRData(idKeyedPRData);
        const prs = getExercisePRs('Bench Press', 'Some Other Machine', 'eq_does_not_exist');
        expect(prs).toBeNull();
    });

    it('getExercisePRs still resolves legacy name-keyed entries with no id', async () => {
        await seedPRData(mockPRData);
        const prs = getExercisePRs('Bench Press', 'Hammer Strength');
        expect(prs).not.toBeNull();
        expect(prs.maxWeight.weight).toBe(200);
    });

    it('checkForNewPR with an equipmentId does not report a false "first" against an id-keyed store', async () => {
        // 150 lbs is under the existing 200 lb id-keyed max → not a new weight PR.
        const result = await checkForNewPR('Bench Press', 5, 150, 'Renamed Hammer Press', idKeyedPRData, 'eq_hammer_123');
        expect(result.isNewPR).toBe(false);
        expect(result.prType).toBeNull();
    });

    it('recordPR keeps a brand-new entry under the NAME key (id keys deferred until re-key)', async () => {
        await seedPRData(emptyPRData);
        // Even though we pass an equipmentId, the new entry must land under the
        // human name so the PR list never renders a raw id as the equipment label.
        await recordPR('Squat', 5, 315, 'Barbell', 'Gym A', '2026-06-01', 'Legs', 'lbs', 'eq_barbell_999');
        const all = getAllPRs().filter((p) => p.exercise === 'Squat');
        expect(all).toHaveLength(1);
        expect(all[0].equipment).toBe('Barbell');
    });

    it('recordPR updates an existing name-keyed entry in place rather than splitting to an id key', async () => {
        await seedPRData(mockPRData); // Bench Press / "Hammer Strength" name-keyed, max 200
        await recordPR('Bench Press', 3, 225, 'Hammer Strength', 'Gym A', '2026-06-01', 'Chest', 'lbs', 'eq_hammer_123');
        const benchEntries = getAllPRs().filter((p) => p.exercise === 'Bench Press');
        // Still exactly one entry for this exercise+equipment, still under the name.
        expect(benchEntries).toHaveLength(1);
        expect(benchEntries[0].equipment).toBe('Hammer Strength');
        expect(benchEntries[0].prs.maxWeight.weight).toBe(225);
    });
});
