// Tests for workout completion summary calculations (Phase 6.1)
// Verifies stats computed when showing the workout summary modal

import { describe, it, expect } from 'vitest';

/**
 * Count total completed sets across all exercises in a workout.
 * Mirrors logic from workout-session.js showWorkoutSummary().
 */
function countCompletedSets(workoutData) {
    if (!workoutData || !workoutData.exercises) return 0;
    let total = 0;
    for (const key of Object.keys(workoutData.exercises)) {
        const ex = workoutData.exercises[key];
        if (ex && ex.sets && Array.isArray(ex.sets)) {
            total += ex.sets.length;
        }
    }
    return total;
}

/**
 * Calculate total volume (weight × reps) across all exercises.
 */
function calculateTotalVolume(workoutData) {
    if (!workoutData || !workoutData.exercises) return 0;
    let volume = 0;
    for (const key of Object.keys(workoutData.exercises)) {
        const ex = workoutData.exercises[key];
        if (!ex || !ex.sets) continue;
        for (const set of ex.sets) {
            if (set && typeof set.weight === 'number' && typeof set.reps === 'number' && set.weight > 0 && set.reps > 0) {
                volume += set.weight * set.reps;
            }
        }
    }
    return volume;
}

/**
 * Count distinct exercises in a workout.
 */
function countExercises(workoutData) {
    if (!workoutData || !workoutData.exercises) return 0;
    return Object.keys(workoutData.exercises).length;
}

/**
 * Format a duration in seconds to a display string.
 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Calculate volume change percentage between two sessions.
 */
function calculateVolumeChange(currentVolume, previousVolume) {
    if (!previousVolume || previousVolume === 0) return null;
    return ((currentVolume - previousVolume) / previousVolume) * 100;
}

// ===================================================================
// TESTS
// ===================================================================

describe('countCompletedSets', () => {
    it('counts sets across multiple exercises', () => {
        const data = {
            exercises: {
                exercise_0: { sets: [{ reps: 10 }, { reps: 8 }] },
                exercise_1: { sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }] },
            },
        };
        expect(countCompletedSets(data)).toBe(5);
    });

    it('returns 0 for empty exercises', () => {
        expect(countCompletedSets({ exercises: {} })).toBe(0);
    });

    it('returns 0 for null data', () => {
        expect(countCompletedSets(null)).toBe(0);
    });

    it('handles exercises without sets array', () => {
        const data = {
            exercises: {
                exercise_0: { name: 'Bench Press' },
                exercise_1: { sets: [{ reps: 10 }] },
            },
        };
        expect(countCompletedSets(data)).toBe(1);
    });
});

describe('calculateTotalVolume', () => {
    it('calculates volume correctly', () => {
        const data = {
            exercises: {
                exercise_0: {
                    sets: [
                        { weight: 135, reps: 10 },
                        { weight: 135, reps: 8 },
                    ],
                },
            },
        };
        expect(calculateTotalVolume(data)).toBe(135 * 10 + 135 * 8);
    });

    it('sums across multiple exercises', () => {
        const data = {
            exercises: {
                exercise_0: { sets: [{ weight: 200, reps: 5 }] },
                exercise_1: { sets: [{ weight: 100, reps: 10 }] },
            },
        };
        expect(calculateTotalVolume(data)).toBe(2000);
    });

    it('skips sets with zero or missing weight/reps', () => {
        const data = {
            exercises: {
                exercise_0: {
                    sets: [
                        { weight: 100, reps: 10 },
                        { weight: 0, reps: 10 },
                        { weight: 100, reps: 0 },
                        { weight: null, reps: 10 },
                        {},
                    ],
                },
            },
        };
        expect(calculateTotalVolume(data)).toBe(1000);
    });

    it('returns 0 for null data', () => {
        expect(calculateTotalVolume(null)).toBe(0);
    });
});

describe('countExercises', () => {
    it('counts exercises correctly', () => {
        const data = {
            exercises: {
                exercise_0: {},
                exercise_1: {},
                exercise_2: {},
            },
        };
        expect(countExercises(data)).toBe(3);
    });

    it('returns 0 for no exercises', () => {
        expect(countExercises({ exercises: {} })).toBe(0);
        expect(countExercises(null)).toBe(0);
    });
});

describe('formatDuration', () => {
    it('formats seconds correctly', () => {
        expect(formatDuration(90)).toBe('1:30');
    });

    it('formats hours correctly', () => {
        expect(formatDuration(3661)).toBe('1:01:01');
    });

    it('formats zero seconds', () => {
        expect(formatDuration(0)).toBe('0:00');
    });

    it('handles null/undefined', () => {
        expect(formatDuration(null)).toBe('0:00');
        expect(formatDuration(undefined)).toBe('0:00');
    });

    it('pads minutes and seconds', () => {
        expect(formatDuration(61)).toBe('1:01');
        expect(formatDuration(3601)).toBe('1:00:01');
    });
});

describe('calculateVolumeChange', () => {
    it('calculates positive increase', () => {
        expect(calculateVolumeChange(11000, 10000)).toBeCloseTo(10);
    });

    it('calculates negative decrease', () => {
        expect(calculateVolumeChange(9000, 10000)).toBeCloseTo(-10);
    });

    it('calculates zero change', () => {
        expect(calculateVolumeChange(10000, 10000)).toBe(0);
    });

    it('returns null when no previous session', () => {
        expect(calculateVolumeChange(10000, null)).toBeNull();
        expect(calculateVolumeChange(10000, 0)).toBeNull();
    });
});
