// Tests for progress calculation functions: 1RM estimation, volume, trend detection, body-part aggregation
// These are pure functions extracted for testability

import { describe, it, expect } from 'vitest';

// ===================================================================
// PURE FUNCTION RE-IMPLEMENTATIONS (mirrors logic from exercise-progress.js)
// ===================================================================

/**
 * Estimate 1RM using Epley formula: 1RM = weight * (1 + reps/30)
 * @param {number} weight - Weight lifted
 * @param {number} reps - Number of reps performed
 * @returns {number} Estimated 1RM (rounded to 1 decimal)
 */
function estimate1RM(weight, reps) {
    if (!weight || weight <= 0) return 0;
    if (!reps || reps <= 0) return 0;
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Calculate total session volume from exercises
 * Volume = sum of (weight * reps) for each set across all exercises
 * @param {Object} exercises - Workout exercises object
 * @returns {number} Total volume
 */
function calculateSessionVolume(exercises) {
    if (!exercises || typeof exercises !== 'object') return 0;

    let totalVolume = 0;

    for (const key of Object.keys(exercises)) {
        const exercise = exercises[key];
        if (!exercise || !exercise.sets || !Array.isArray(exercise.sets)) continue;

        for (const set of exercise.sets) {
            if (set && typeof set.weight === 'number' && typeof set.reps === 'number' && set.weight > 0 && set.reps > 0) {
                totalVolume += set.weight * set.reps;
            }
        }
    }

    return totalVolume;
}

/**
 * Detect trend from a series of data points
 * Compares average of last N/2 points to average of first N/2 points
 * @param {Array<{date: string, value: number}>} dataPoints - Sorted by date ascending
 * @returns {'up'|'down'|'flat'} Trend direction
 */
function calculateTrend(dataPoints) {
    if (!dataPoints || dataPoints.length < 3) return 'flat';

    const values = dataPoints.map((p) => p.value);
    const midpoint = Math.floor(values.length / 2);

    const firstHalf = values.slice(0, midpoint);
    const secondHalf = values.slice(midpoint);

    const avgFirst = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;

    // Use a 2% threshold to determine trend direction
    const changePercent = ((avgSecond - avgFirst) / avgFirst) * 100;

    if (changePercent > 2) return 'up';
    if (changePercent < -2) return 'down';
    return 'flat';
}

/**
 * Aggregate volume by body part from a set of workouts
 * @param {Array} workouts - Array of workout objects with exercises
 * @param {Object} exerciseBodyPartMap - Map of exercise name (lowercase) to body part
 * @returns {Object} { bodyPart: totalVolume }
 */
function aggregateVolumeByBodyPart(workouts, exerciseBodyPartMap = {}) {
    if (!workouts || !Array.isArray(workouts)) return {};

    const volumeByPart = {};

    for (const workout of workouts) {
        if (!workout.exercises) continue;

        for (const key of Object.keys(workout.exercises)) {
            const exercise = workout.exercises[key];
            if (!exercise || !exercise.sets) continue;

            // Determine body part from exercise name
            const name = (exercise.name || workout.exerciseNames?.[key] || '').toLowerCase();
            const bodyPart = exerciseBodyPartMap[name] || 'Other';

            let exerciseVolume = 0;
            for (const set of exercise.sets) {
                if (set && set.weight > 0 && set.reps > 0) {
                    exerciseVolume += set.weight * set.reps;
                }
            }

            if (exerciseVolume > 0) {
                volumeByPart[bodyPart] = (volumeByPart[bodyPart] || 0) + exerciseVolume;
            }
        }
    }

    return volumeByPart;
}

// ===================================================================
// TESTS
// ===================================================================

describe('estimate1RM (Epley formula)', () => {
    it('returns the weight itself for 1 rep', () => {
        expect(estimate1RM(225, 1)).toBe(225);
    });

    it('calculates correctly for typical working set', () => {
        // 225 * (1 + 5/30) = 225 * 1.1667 = 262.5
        expect(estimate1RM(225, 5)).toBe(262.5);
    });

    it('calculates correctly for higher reps', () => {
        // 135 * (1 + 10/30) = 135 * 1.333 = 180
        expect(estimate1RM(135, 10)).toBe(180);
    });

    it('returns 0 for zero weight', () => {
        expect(estimate1RM(0, 5)).toBe(0);
    });

    it('returns 0 for zero reps', () => {
        expect(estimate1RM(225, 0)).toBe(0);
    });

    it('returns 0 for null/undefined input', () => {
        expect(estimate1RM(null, 5)).toBe(0);
        expect(estimate1RM(225, null)).toBe(0);
        expect(estimate1RM(undefined, undefined)).toBe(0);
    });

    it('returns 0 for negative values', () => {
        expect(estimate1RM(-100, 5)).toBe(0);
        expect(estimate1RM(100, -5)).toBe(0);
    });

    it('handles very high reps (formula becomes less accurate but still computes)', () => {
        // 100 * (1 + 30/30) = 100 * 2 = 200
        expect(estimate1RM(100, 30)).toBe(200);
        // 100 * (1 + 50/30) = 100 * 2.667 = 266.7
        expect(estimate1RM(100, 50)).toBe(266.7);
    });
});

describe('calculateSessionVolume', () => {
    it('calculates volume for a simple workout', () => {
        const exercises = {
            exercise_0: {
                sets: [
                    { weight: 135, reps: 10 },
                    { weight: 135, reps: 8 },
                ],
            },
        };
        // (135*10) + (135*8) = 1350 + 1080 = 2430
        expect(calculateSessionVolume(exercises)).toBe(2430);
    });

    it('calculates volume across multiple exercises', () => {
        const exercises = {
            exercise_0: {
                sets: [{ weight: 200, reps: 5 }],
            },
            exercise_1: {
                sets: [{ weight: 100, reps: 10 }],
            },
        };
        // (200*5) + (100*10) = 1000 + 1000 = 2000
        expect(calculateSessionVolume(exercises)).toBe(2000);
    });

    it('skips sets with missing weight or reps', () => {
        const exercises = {
            exercise_0: {
                sets: [
                    { weight: 135, reps: 10 },
                    { weight: null, reps: 8 },
                    { weight: 135, reps: null },
                    { weight: 135 },
                    { reps: 10 },
                    {},
                ],
            },
        };
        expect(calculateSessionVolume(exercises)).toBe(1350);
    });

    it('skips exercises without sets array', () => {
        const exercises = {
            exercise_0: { name: 'Bench Press' },
            exercise_1: { sets: [{ weight: 100, reps: 10 }] },
        };
        expect(calculateSessionVolume(exercises)).toBe(1000);
    });

    it('returns 0 for empty exercises', () => {
        expect(calculateSessionVolume({})).toBe(0);
    });

    it('returns 0 for null/undefined', () => {
        expect(calculateSessionVolume(null)).toBe(0);
        expect(calculateSessionVolume(undefined)).toBe(0);
    });

    it('ignores zero or negative weight/reps', () => {
        const exercises = {
            exercise_0: {
                sets: [
                    { weight: 0, reps: 10 },
                    { weight: 100, reps: 0 },
                    { weight: -50, reps: 10 },
                    { weight: 100, reps: -5 },
                    { weight: 100, reps: 10 }, // only valid set
                ],
            },
        };
        expect(calculateSessionVolume(exercises)).toBe(1000);
    });
});

describe('calculateTrend', () => {
    it('detects an upward trend', () => {
        const data = [
            { date: '2025-01-01', value: 100 },
            { date: '2025-01-08', value: 105 },
            { date: '2025-01-15', value: 110 },
            { date: '2025-01-22', value: 120 },
        ];
        expect(calculateTrend(data)).toBe('up');
    });

    it('detects a downward trend', () => {
        const data = [
            { date: '2025-01-01', value: 200 },
            { date: '2025-01-08', value: 190 },
            { date: '2025-01-15', value: 180 },
            { date: '2025-01-22', value: 170 },
        ];
        expect(calculateTrend(data)).toBe('down');
    });

    it('detects a flat/plateau trend', () => {
        const data = [
            { date: '2025-01-01', value: 150 },
            { date: '2025-01-08', value: 151 },
            { date: '2025-01-15', value: 150 },
            { date: '2025-01-22', value: 149 },
        ];
        expect(calculateTrend(data)).toBe('flat');
    });

    it('returns flat for insufficient data (< 3 points)', () => {
        expect(calculateTrend([{ date: '2025-01-01', value: 100 }])).toBe('flat');
        expect(
            calculateTrend([
                { date: '2025-01-01', value: 100 },
                { date: '2025-01-08', value: 200 },
            ])
        ).toBe('flat');
    });

    it('returns flat for null/empty input', () => {
        expect(calculateTrend(null)).toBe('flat');
        expect(calculateTrend([])).toBe('flat');
    });

    it('handles exactly 3 data points', () => {
        const data = [
            { date: '2025-01-01', value: 100 },
            { date: '2025-01-08', value: 120 },
            { date: '2025-01-15', value: 140 },
        ];
        expect(calculateTrend(data)).toBe('up');
    });

    it('handles a V-shaped recovery (overall flat)', () => {
        const data = [
            { date: '2025-01-01', value: 200 },
            { date: '2025-01-08', value: 180 },
            { date: '2025-01-15', value: 190 },
            { date: '2025-01-22', value: 200 },
        ];
        // First half avg: 190, second half avg: 195 — ~2.6% up
        expect(calculateTrend(data)).toBe('up');
    });
});

describe('aggregateVolumeByBodyPart', () => {
    const bodyPartMap = {
        'bench press': 'Chest',
        'incline press': 'Chest',
        'barbell row': 'Back',
        'squat': 'Legs',
        'lateral raise': 'Shoulders',
    };

    it('aggregates volume correctly by body part', () => {
        const workouts = [
            {
                exercises: {
                    exercise_0: {
                        name: 'Bench Press',
                        sets: [{ weight: 135, reps: 10 }],
                    },
                    exercise_1: {
                        name: 'Barbell Row',
                        sets: [{ weight: 135, reps: 10 }],
                    },
                },
            },
        ];

        const result = aggregateVolumeByBodyPart(workouts, bodyPartMap);
        expect(result).toEqual({
            Chest: 1350,
            Back: 1350,
        });
    });

    it('combines volume for exercises in the same body part', () => {
        const workouts = [
            {
                exercises: {
                    exercise_0: {
                        name: 'Bench Press',
                        sets: [{ weight: 200, reps: 5 }],
                    },
                    exercise_1: {
                        name: 'Incline Press',
                        sets: [{ weight: 150, reps: 8 }],
                    },
                },
            },
        ];

        const result = aggregateVolumeByBodyPart(workouts, bodyPartMap);
        // (200*5) + (150*8) = 1000 + 1200 = 2200
        expect(result.Chest).toBe(2200);
    });

    it('aggregates across multiple workouts', () => {
        const workouts = [
            {
                exercises: {
                    exercise_0: {
                        name: 'Squat',
                        sets: [{ weight: 225, reps: 5 }],
                    },
                },
            },
            {
                exercises: {
                    exercise_0: {
                        name: 'Squat',
                        sets: [{ weight: 245, reps: 5 }],
                    },
                },
            },
        ];

        const result = aggregateVolumeByBodyPart(workouts, bodyPartMap);
        // (225*5) + (245*5) = 1125 + 1225 = 2350
        expect(result.Legs).toBe(2350);
    });

    it('assigns unknown exercises to "Other"', () => {
        const workouts = [
            {
                exercises: {
                    exercise_0: {
                        name: 'Mystery Exercise',
                        sets: [{ weight: 100, reps: 10 }],
                    },
                },
            },
        ];

        const result = aggregateVolumeByBodyPart(workouts, bodyPartMap);
        expect(result.Other).toBe(1000);
    });

    it('uses exerciseNames fallback when name is missing', () => {
        const workouts = [
            {
                exerciseNames: { exercise_0: 'Bench Press' },
                exercises: {
                    exercise_0: {
                        sets: [{ weight: 100, reps: 10 }],
                    },
                },
            },
        ];

        const result = aggregateVolumeByBodyPart(workouts, bodyPartMap);
        expect(result.Chest).toBe(1000);
    });

    it('returns empty object for empty/null input', () => {
        expect(aggregateVolumeByBodyPart([])).toEqual({});
        expect(aggregateVolumeByBodyPart(null)).toEqual({});
    });

    it('skips workouts without exercises', () => {
        const workouts = [{ date: '2025-01-01' }, { exercises: {} }];
        expect(aggregateVolumeByBodyPart(workouts, bodyPartMap)).toEqual({});
    });
});
