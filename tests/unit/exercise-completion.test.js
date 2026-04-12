// Tests for exercise completion and reorder logic (Phase 2.2, 2.8)
// Verifies per-set completion, exercise completion detection, and sort order

import { describe, it, expect } from 'vitest';

/**
 * Check if all sets in an exercise are completed.
 * Mirrors logic used in exercise-ui.js to determine exercise completion.
 */
function isExerciseComplete(exercise) {
    if (!exercise || !exercise.sets || exercise.sets.length === 0) return false;
    return exercise.sets.every(set => set.completed === true);
}

/**
 * Toggle a set's completion status and return whether the exercise is now fully complete.
 * @returns {{ setCompleted: boolean, exerciseComplete: boolean }}
 */
function toggleSetComplete(exercise, setIndex) {
    if (!exercise || !exercise.sets || setIndex < 0 || setIndex >= exercise.sets.length) {
        return { setCompleted: false, exerciseComplete: false };
    }
    const set = exercise.sets[setIndex];
    set.completed = !set.completed;
    return {
        setCompleted: set.completed,
        exerciseComplete: isExerciseComplete(exercise),
    };
}

/**
 * Sort exercises into two groups: incomplete first, completed last.
 * Returns indices in display order (visual only, does not mutate data).
 */
function getExerciseDisplayOrder(exercises) {
    if (!exercises || typeof exercises !== 'object') return [];

    const entries = Object.entries(exercises);
    const incomplete = [];
    const completed = [];

    for (const [key, ex] of entries) {
        if (ex.completed || isExerciseComplete(ex)) {
            completed.push(key);
        } else {
            incomplete.push(key);
        }
    }

    return [...incomplete, ...completed];
}

describe('isExerciseComplete', () => {
    it('returns true when all sets are completed', () => {
        const exercise = {
            sets: [
                { weight: 135, reps: 10, completed: true },
                { weight: 135, reps: 8, completed: true },
            ],
        };
        expect(isExerciseComplete(exercise)).toBe(true);
    });

    it('returns false when some sets are not completed', () => {
        const exercise = {
            sets: [
                { weight: 135, reps: 10, completed: true },
                { weight: 135, reps: 8, completed: false },
            ],
        };
        expect(isExerciseComplete(exercise)).toBe(false);
    });

    it('returns false when no sets have completed field', () => {
        const exercise = {
            sets: [
                { weight: 135, reps: 10 },
                { weight: 135, reps: 8 },
            ],
        };
        expect(isExerciseComplete(exercise)).toBe(false);
    });

    it('returns false for exercise with no sets', () => {
        expect(isExerciseComplete({ sets: [] })).toBe(false);
        expect(isExerciseComplete({})).toBe(false);
        expect(isExerciseComplete(null)).toBe(false);
    });
});

describe('toggleSetComplete', () => {
    it('marks an uncompleted set as completed', () => {
        const exercise = { sets: [{ weight: 100, reps: 10, completed: false }] };
        const result = toggleSetComplete(exercise, 0);
        expect(result.setCompleted).toBe(true);
        expect(exercise.sets[0].completed).toBe(true);
    });

    it('marks a completed set as uncompleted', () => {
        const exercise = { sets: [{ weight: 100, reps: 10, completed: true }] };
        const result = toggleSetComplete(exercise, 0);
        expect(result.setCompleted).toBe(false);
    });

    it('detects exercise completion when last set is toggled', () => {
        const exercise = {
            sets: [
                { weight: 100, reps: 10, completed: true },
                { weight: 100, reps: 8, completed: false },
            ],
        };
        const result = toggleSetComplete(exercise, 1);
        expect(result.setCompleted).toBe(true);
        expect(result.exerciseComplete).toBe(true);
    });

    it('handles invalid set index gracefully', () => {
        const exercise = { sets: [{ weight: 100, reps: 10 }] };
        expect(toggleSetComplete(exercise, -1).setCompleted).toBe(false);
        expect(toggleSetComplete(exercise, 5).setCompleted).toBe(false);
    });

    it('handles null exercise gracefully', () => {
        expect(toggleSetComplete(null, 0).setCompleted).toBe(false);
    });
});

describe('getExerciseDisplayOrder', () => {
    it('puts incomplete exercises before completed ones', () => {
        const exercises = {
            exercise_0: { completed: true, sets: [{ completed: true }] },
            exercise_1: { completed: false, sets: [{ completed: false }] },
            exercise_2: { completed: true, sets: [{ completed: true }] },
            exercise_3: { completed: false, sets: [{ completed: false }] },
        };
        const order = getExerciseDisplayOrder(exercises);
        expect(order).toEqual(['exercise_1', 'exercise_3', 'exercise_0', 'exercise_2']);
    });

    it('maintains original order within each group', () => {
        const exercises = {
            exercise_0: { sets: [{ completed: false }] },
            exercise_1: { sets: [{ completed: false }] },
            exercise_2: { completed: true, sets: [{ completed: true }] },
        };
        const order = getExerciseDisplayOrder(exercises);
        expect(order[0]).toBe('exercise_0');
        expect(order[1]).toBe('exercise_1');
        expect(order[2]).toBe('exercise_2');
    });

    it('returns all exercises when none are completed', () => {
        const exercises = {
            exercise_0: { sets: [{ completed: false }] },
            exercise_1: { sets: [{ completed: false }] },
        };
        const order = getExerciseDisplayOrder(exercises);
        expect(order).toEqual(['exercise_0', 'exercise_1']);
    });

    it('returns empty array for null/empty input', () => {
        expect(getExerciseDisplayOrder(null)).toEqual([]);
        expect(getExerciseDisplayOrder({})).toEqual([]);
    });

    it('detects completion from sets when completed flag not set', () => {
        const exercises = {
            exercise_0: { sets: [{ completed: true }, { completed: true }] },
            exercise_1: { sets: [{ completed: true }, { completed: false }] },
        };
        const order = getExerciseDisplayOrder(exercises);
        expect(order[0]).toBe('exercise_1'); // incomplete first
        expect(order[1]).toBe('exercise_0'); // all sets done → completed
    });
});
