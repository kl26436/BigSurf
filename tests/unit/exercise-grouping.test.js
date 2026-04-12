// Tests for exercise grouping / superset logic (Phase 10.5)

import { describe, it, expect } from 'vitest';
import {
    groupExercises,
    getExerciseGroups,
    getNextInGroup,
    ungroupExercise,
} from '../../js/core/features/superset-manager.js';

// ===================================================================
// TESTS
// ===================================================================

describe('groupExercises', () => {
    it('assigns group "A" to first pair', () => {
        const exercises = {
            exercise_0: { name: 'Bench Press', group: null },
            exercise_1: { name: 'Cable Fly', group: null },
            exercise_2: { name: 'Tricep Pushdown', group: null },
        };
        const group = groupExercises([0, 1], exercises);
        expect(group).toBe('A');
        expect(exercises.exercise_0.group).toBe('A');
        expect(exercises.exercise_1.group).toBe('A');
        expect(exercises.exercise_2.group).toBeNull();
    });

    it('assigns next available letter for second group', () => {
        const exercises = {
            exercise_0: { name: 'Bench', group: 'A' },
            exercise_1: { name: 'Fly', group: 'A' },
            exercise_2: { name: 'Squat', group: null },
            exercise_3: { name: 'Lunge', group: null },
        };
        const group = groupExercises([2, 3], exercises);
        expect(group).toBe('B');
        expect(exercises.exercise_2.group).toBe('B');
        expect(exercises.exercise_3.group).toBe('B');
    });

    it('skips non-existent exercise indices', () => {
        const exercises = {
            exercise_0: { name: 'Bench', group: null },
        };
        groupExercises([0, 5], exercises);
        expect(exercises.exercise_0.group).toBe('A');
    });
});

describe('getExerciseGroups', () => {
    it('returns correct group mapping', () => {
        const exercises = {
            exercise_0: { group: 'A' },
            exercise_1: { group: 'A' },
            exercise_2: { group: 'B' },
            exercise_3: { group: 'B' },
            exercise_4: { group: null },
        };
        expect(getExerciseGroups(exercises)).toEqual({
            A: [0, 1],
            B: [2, 3],
        });
    });

    it('handles exercises with no group field', () => {
        const exercises = {
            exercise_0: { name: 'Bench' },
            exercise_1: { name: 'Squat' },
        };
        expect(getExerciseGroups(exercises)).toEqual({});
    });

    it('handles old workout documents without group field', () => {
        const exercises = {
            exercise_0: { name: 'Bench', sets: [] },
        };
        expect(getExerciseGroups(exercises)).toEqual({});
    });
});

describe('getNextInGroup', () => {
    it('returns next exercise in group', () => {
        const exercises = {
            exercise_0: { group: 'A' },
            exercise_1: { group: 'A' },
            exercise_2: { group: 'A' },
        };
        expect(getNextInGroup(0, exercises)).toBe(1);
        expect(getNextInGroup(1, exercises)).toBe(2);
    });

    it('wraps to first exercise in group', () => {
        const exercises = {
            exercise_0: { group: 'A' },
            exercise_1: { group: 'A' },
        };
        expect(getNextInGroup(1, exercises)).toBe(0);
    });

    it('returns null for ungrouped exercise', () => {
        const exercises = {
            exercise_0: { group: null },
        };
        expect(getNextInGroup(0, exercises)).toBeNull();
    });

    it('returns self for single-member group', () => {
        const exercises = {
            exercise_0: { group: 'A' },
        };
        expect(getNextInGroup(0, exercises)).toBe(0);
    });
});

describe('ungroupExercise', () => {
    it('removes exercise from its group', () => {
        const exercises = {
            exercise_0: { group: 'A' },
            exercise_1: { group: 'A' },
            exercise_2: { group: 'A' },
        };
        ungroupExercise(0, exercises);
        expect(exercises.exercise_0.group).toBeNull();
        expect(exercises.exercise_1.group).toBe('A');
        expect(exercises.exercise_2.group).toBe('A');
    });

    it('ungroups remaining member when only one left', () => {
        const exercises = {
            exercise_0: { group: 'A' },
            exercise_1: { group: 'A' },
        };
        ungroupExercise(0, exercises);
        expect(exercises.exercise_0.group).toBeNull();
        expect(exercises.exercise_1.group).toBeNull(); // auto-ungrouped
    });

    it('does nothing for ungrouped exercise', () => {
        const exercises = {
            exercise_0: { group: null },
        };
        ungroupExercise(0, exercises);
        expect(exercises.exercise_0.group).toBeNull();
    });
});
