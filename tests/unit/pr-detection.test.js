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
import { loadPRData, checkForNewPR as realCheckForNewPR, calculateVolume } from '../../js/core/features/pr-tracker.js';

AppState.currentUser = { uid: 'test-user' };
const PR_DOC_PATH = 'users/test-user/stats/personalRecords';

// Harness: seed the mocked Firestore doc with the fixture, hydrate the module's
// prData state via the real loadPRData(), then run the real checkForNewPR().
async function checkForNewPR(exerciseName, reps, weight, equipment, prData) {
    store.set(PR_DOC_PATH, JSON.parse(JSON.stringify(prData)));
    await loadPRData();
    return realCheckForNewPR(exerciseName, reps, weight, equipment);
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
