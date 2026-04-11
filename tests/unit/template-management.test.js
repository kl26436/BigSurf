// Tests for template management helpers (Phase 9)
import { describe, it, expect } from 'vitest';
import {
    reorderTemplateExercise,
    normalizeExercisesToArray,
    normalizeWorkoutToTemplate,
    validateTemplate,
} from '../../js/core/utils/template-helpers.js';

describe('reorderTemplateExercise', () => {
    const A = { name: 'Bench Press' };
    const B = { name: 'Incline Press' };
    const C = { name: 'Flyes' };

    it('moves an exercise down', () => {
        const result = reorderTemplateExercise([A, B, C], 0, 'down');
        expect(result).toEqual([B, A, C]);
    });

    it('moves an exercise up', () => {
        const result = reorderTemplateExercise([A, B, C], 2, 'up');
        expect(result).toEqual([A, C, B]);
    });

    it('moving first item up returns same array', () => {
        const exercises = [A, B, C];
        const result = reorderTemplateExercise(exercises, 0, 'up');
        expect(result).toEqual([A, B, C]);
    });

    it('moving last item down returns same array', () => {
        const exercises = [A, B, C];
        const result = reorderTemplateExercise(exercises, 2, 'down');
        expect(result).toEqual([A, B, C]);
    });

    it('does not mutate the original array', () => {
        const exercises = [A, B, C];
        reorderTemplateExercise(exercises, 0, 'down');
        expect(exercises).toEqual([A, B, C]);
    });

    it('handles single-element array', () => {
        const result = reorderTemplateExercise([A], 0, 'down');
        expect(result).toEqual([A]);
    });

    it('handles empty array', () => {
        const result = reorderTemplateExercise([], 0, 'down');
        expect(result).toEqual([]);
    });

    it('handles out-of-bounds index', () => {
        const result = reorderTemplateExercise([A, B], 5, 'down');
        expect(result).toEqual([A, B]);
    });

    it('handles negative index', () => {
        const result = reorderTemplateExercise([A, B], -1, 'up');
        expect(result).toEqual([A, B]);
    });

    it('swaps middle elements correctly', () => {
        const D = { name: 'Dips' };
        const result = reorderTemplateExercise([A, B, C, D], 1, 'down');
        expect(result).toEqual([A, C, B, D]);
    });
});

describe('normalizeExercisesToArray', () => {
    it('returns array as-is', () => {
        const exercises = [{ name: 'Bench' }, { name: 'Squat' }];
        expect(normalizeExercisesToArray(exercises)).toEqual(exercises);
    });

    it('converts object format to array', () => {
        const exercises = {
            exercise_0: { name: 'Bench Press', sets: 3 },
            exercise_1: { name: 'Squat', sets: 4 },
        };
        const result = normalizeExercisesToArray(exercises);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('Bench Press');
        expect(result[1].name).toBe('Squat');
    });

    it('sorts object keys to maintain order', () => {
        const exercises = {
            exercise_2: { name: 'C' },
            exercise_0: { name: 'A' },
            exercise_1: { name: 'B' },
        };
        const result = normalizeExercisesToArray(exercises);
        expect(result[0].name).toBe('A');
        expect(result[1].name).toBe('B');
        expect(result[2].name).toBe('C');
    });

    it('filters out null entries', () => {
        const exercises = {
            exercise_0: { name: 'Bench' },
            exercise_1: null,
            exercise_2: { name: 'Squat' },
        };
        const result = normalizeExercisesToArray(exercises);
        expect(result).toHaveLength(2);
    });

    it('merges exerciseNames map', () => {
        const exercises = {
            exercise_0: { sets: [{ reps: 10, weight: 135 }] },
        };
        const exerciseNames = { exercise_0: 'Bench Press' };
        const result = normalizeExercisesToArray(exercises, exerciseNames);
        expect(result[0].name).toBe('Bench Press');
    });

    it('does not override existing name with exerciseNames', () => {
        const exercises = {
            exercise_0: { name: 'Custom Name', sets: [] },
        };
        const exerciseNames = { exercise_0: 'Bench Press' };
        const result = normalizeExercisesToArray(exercises, exerciseNames);
        expect(result[0].name).toBe('Custom Name');
    });

    it('returns empty array for null', () => {
        expect(normalizeExercisesToArray(null)).toEqual([]);
    });

    it('returns empty array for undefined', () => {
        expect(normalizeExercisesToArray(undefined)).toEqual([]);
    });
});

describe('normalizeWorkoutToTemplate', () => {
    it('converts workout with originalWorkout to template format', () => {
        const workoutData = {
            workoutType: 'Chest – Push',
            exerciseNames: { exercise_0: 'Bench Press', exercise_1: 'Incline Press' },
            exercises: {
                exercise_0: {
                    sets: [
                        { reps: 10, weight: 135 },
                        { reps: 8, weight: 155 },
                    ],
                    equipment: 'Hammer Strength Flat',
                },
                exercise_1: {
                    sets: [{ reps: 12, weight: 95 }],
                    equipment: null,
                },
            },
            originalWorkout: {
                exercises: [
                    { name: 'Bench Press', machine: 'Bench Press', bodyPart: 'Chest', equipmentType: 'Barbell', sets: 3, reps: 10, weight: 135 },
                    { name: 'Incline Press', machine: 'Incline Press', bodyPart: 'Chest', equipmentType: 'Dumbbell', sets: 3, reps: 12, weight: 90 },
                ],
            },
        };

        const result = normalizeWorkoutToTemplate(workoutData);

        expect(result.category).toBe('push');
        expect(result.exercises).toHaveLength(2);

        // First exercise should use actual workout data
        expect(result.exercises[0].name).toBe('Bench Press');
        expect(result.exercises[0].sets).toBe(2); // 2 sets were logged
        expect(result.exercises[0].reps).toBe(8); // last set reps
        expect(result.exercises[0].weight).toBe(155); // last set weight
        expect(result.exercises[0].equipment).toBe('Hammer Strength Flat');
        expect(result.exercises[0].bodyPart).toBe('Chest');

        // Second exercise
        expect(result.exercises[1].name).toBe('Incline Press');
        expect(result.exercises[1].sets).toBe(1);
        expect(result.exercises[1].reps).toBe(12);
    });

    it('converts workout without originalWorkout (fallback)', () => {
        const workoutData = {
            workoutType: 'Pull Day',
            exerciseNames: { exercise_0: 'Deadlift' },
            exercises: {
                exercise_0: {
                    sets: [
                        { reps: 5, weight: 225 },
                        { reps: 5, weight: 245 },
                        { reps: 3, weight: 275 },
                    ],
                    equipment: 'Olympic Bar',
                },
            },
        };

        const result = normalizeWorkoutToTemplate(workoutData);

        expect(result.category).toBe('pull');
        expect(result.exercises).toHaveLength(1);
        expect(result.exercises[0].name).toBe('Deadlift');
        expect(result.exercises[0].sets).toBe(3);
        expect(result.exercises[0].reps).toBe(3); // last set
        expect(result.exercises[0].weight).toBe(275); // last set
        expect(result.exercises[0].equipment).toBe('Olympic Bar');
    });

    it('returns null for null input', () => {
        expect(normalizeWorkoutToTemplate(null)).toBeNull();
    });

    it('handles workout with no exercises', () => {
        const result = normalizeWorkoutToTemplate({ workoutType: 'Empty' });
        expect(result.exercises).toEqual([]);
    });

    it('handles exercises with empty sets array', () => {
        const workoutData = {
            exerciseNames: { exercise_0: 'Curl' },
            exercises: { exercise_0: { sets: [] } },
        };
        const result = normalizeWorkoutToTemplate(workoutData);
        expect(result.exercises[0].sets).toBe(3); // falls back to default
        expect(result.exercises[0].reps).toBe(10);
    });
});

describe('validateTemplate', () => {
    it('accepts valid template', () => {
        const template = { name: 'Push Day', exercises: [{ name: 'Bench' }] };
        expect(validateTemplate(template)).toEqual({ valid: true, error: null });
    });

    it('rejects null template', () => {
        expect(validateTemplate(null).valid).toBe(false);
    });

    it('rejects empty name', () => {
        expect(validateTemplate({ name: '', exercises: [{ name: 'Bench' }] }).valid).toBe(false);
    });

    it('rejects whitespace-only name', () => {
        expect(validateTemplate({ name: '   ', exercises: [{ name: 'Bench' }] }).valid).toBe(false);
    });

    it('rejects template with zero exercises', () => {
        expect(validateTemplate({ name: 'Push Day', exercises: [] }).valid).toBe(false);
    });

    it('rejects template with no exercises array', () => {
        expect(validateTemplate({ name: 'Push Day' }).valid).toBe(false);
    });
});
