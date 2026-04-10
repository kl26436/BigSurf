// Tests for PR detection logic from pr-tracker.js
// Re-implements the pure functions to test in isolation
// (same pattern as weight-conversion.test.js)

import { describe, it, expect } from 'vitest';
import { mockPRData, emptyPRData } from '../fixtures/mock-pr-data.js';

// Re-implemented from pr-tracker.js
function calculateVolume(reps, weight) {
    return reps * weight;
}

/**
 * Re-implemented PR check logic from pr-tracker.js checkForNewPR()
 * Takes prData object instead of relying on module-level state
 */
function checkForNewPR(exerciseName, reps, weight, equipment, prData) {
    if (!reps || !weight) return { isNewPR: false, prType: null, previousPR: null };

    // Look up existing PRs for this exercise + equipment
    const exerciseData = prData.exercisePRs[exerciseName];
    const currentPRs = exerciseData && exerciseData[equipment] ? exerciseData[equipment] : null;

    const volume = calculateVolume(reps, weight);

    if (!currentPRs) {
        // First time doing this exercise with this equipment
        return { isNewPR: true, prType: 'first', previousPR: null };
    }

    // Check max weight PR
    if (!currentPRs.maxWeight || weight > currentPRs.maxWeight.weight) {
        return { isNewPR: true, prType: 'maxWeight', previousPR: currentPRs.maxWeight };
    }
    // Check max reps PR (at same or higher weight)
    if (currentPRs.maxReps && weight >= currentPRs.maxReps.weight && reps > currentPRs.maxReps.reps) {
        return { isNewPR: true, prType: 'maxReps', previousPR: currentPRs.maxReps };
    }
    // Check max volume PR
    if (!currentPRs.maxVolume || volume > currentPRs.maxVolume.volume) {
        return { isNewPR: true, prType: 'maxVolume', previousPR: currentPRs.maxVolume };
    }

    return { isNewPR: false, prType: null, previousPR: null };
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
    it('detects new weight PR', () => {
        const result = checkForNewPR('Bench Press', 5, 210, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('maxWeight');
        expect(result.previousPR.weight).toBe(200);
    });

    it('detects new reps PR at same or higher weight', () => {
        // Existing maxReps: weight 135, reps 12
        const result = checkForNewPR('Bench Press', 15, 135, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('maxReps');
        expect(result.previousPR.reps).toBe(12);
    });

    it('detects new volume PR', () => {
        // Existing maxVolume: 1920 (160 x 12)
        // New: 180 x 12 = 2160 > 1920
        const result = checkForNewPR('Bench Press', 12, 180, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('maxVolume');
        expect(result.previousPR.volume).toBe(1920);
    });

    it('returns no PR when set does not beat any record', () => {
        // 135 x 8 = 1080 volume, weight 135 < 200, reps 8 < 12
        const result = checkForNewPR('Bench Press', 8, 135, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(false);
        expect(result.prType).toBeNull();
    });

    it('returns first PR for new exercise', () => {
        const result = checkForNewPR('Overhead Press', 10, 95, 'Barbell', mockPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('first');
        expect(result.previousPR).toBeNull();
    });

    it('returns first PR for existing exercise with new equipment', () => {
        const result = checkForNewPR('Bench Press', 10, 135, 'Barbell', mockPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('first');
        expect(result.previousPR).toBeNull();
    });

    it('returns no PR for zero reps', () => {
        const result = checkForNewPR('Bench Press', 0, 200, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(false);
    });

    it('returns no PR for zero weight', () => {
        const result = checkForNewPR('Bench Press', 10, 0, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(false);
    });

    it('returns no PR for null reps', () => {
        const result = checkForNewPR('Bench Press', null, 200, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(false);
    });

    it('does not count reps PR at lower weight', () => {
        // Existing maxReps: weight 135, reps 12
        // Trying 15 reps at only 100 lbs - should NOT be a reps PR
        // But 100 x 15 = 1500 < 1920 volume, and 100 < 200 weight
        const result = checkForNewPR('Bench Press', 15, 100, 'Hammer Strength', mockPRData);
        expect(result.isNewPR).toBe(false);
    });

    it('works with empty PR data', () => {
        const result = checkForNewPR('Bench Press', 10, 135, 'Barbell', emptyPRData);
        expect(result.isNewPR).toBe(true);
        expect(result.prType).toBe('first');
    });

    it('weight PR takes priority over volume PR', () => {
        // If weight is a new max, it should report maxWeight even if volume is also new
        const result = checkForNewPR('Bench Press', 10, 210, 'Hammer Strength', mockPRData);
        expect(result.prType).toBe('maxWeight');
    });
});
