// Tests for the inline historical-edit pure helpers (edit-history-inline.js).
// Following the project convention: re-implement the pure logic here so tests
// don't transitively import firebase from CDN URLs.
//
// Spec: docs/edit-history-redesign.md

import { describe, it, expect } from 'vitest';

// -----------------------------------------------------------------------------
// Re-implementations (kept in lockstep with edit-history-inline.js)
// -----------------------------------------------------------------------------

function deriveExerciseNames(state) {
    const names = {};
    Object.keys(state.exercises).forEach((key) => {
        names[key] = state.exercises[key].name;
    });
    return names;
}

function rekeyExercisesContiguous(state) {
    const keys = Object.keys(state.exercises).sort((a, b) => {
        const ai = parseInt(a.split('_')[1], 10);
        const bi = parseInt(b.split('_')[1], 10);
        return (isNaN(ai) ? 0 : ai) - (isNaN(bi) ? 0 : bi);
    });
    const rebuilt = {};
    const originalWorkoutExercises = state.originalWorkout ? [] : null;
    keys.forEach((oldKey, i) => {
        const newKey = `exercise_${i}`;
        rebuilt[newKey] = state.exercises[oldKey];
        if (originalWorkoutExercises && state.originalWorkout?.exercises) {
            const oldIdx = parseInt(oldKey.split('_')[1], 10);
            const src = state.originalWorkout.exercises[oldIdx];
            if (src) originalWorkoutExercises.push(src);
        }
    });
    state.exercises = rebuilt;
    if (state.originalWorkout && originalWorkoutExercises) {
        state.originalWorkout.exercises = originalWorkoutExercises;
    }
    return state;
}

function commitSetEdit(set, draftReps, draftWeightInDisplayUnit, displayUnit) {
    const reps = parseInt(draftReps, 10);
    const weight = parseFloat(draftWeightInDisplayUnit);
    set.reps = isNaN(reps) || reps < 0 ? null : reps;
    if (isNaN(weight) || weight < 0) {
        set.weight = null;
    } else {
        set.weight = weight;
        // Only edited sets get their originalUnit rewritten — historical sets
        // the user didn't touch keep theirs.
        set.originalUnit = displayUnit;
    }
    return set;
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('deriveExerciseNames', () => {
    it('produces a key→name map matching editState.exercises', () => {
        const state = {
            exercises: {
                exercise_0: { name: 'Bench Press' },
                exercise_1: { name: 'Cable Fly' },
                exercise_2: { name: 'Tricep Pushdown' },
            },
        };
        expect(deriveExerciseNames(state)).toEqual({
            exercise_0: 'Bench Press',
            exercise_1: 'Cable Fly',
            exercise_2: 'Tricep Pushdown',
        });
    });

    it('returns an empty object for no exercises', () => {
        expect(deriveExerciseNames({ exercises: {} })).toEqual({});
    });

    it('stays in sync after a re-key (contiguous indices)', () => {
        const state = {
            exercises: {
                exercise_0: { name: 'Bench' },
                exercise_2: { name: 'Squat' }, // gap at exercise_1
            },
        };
        rekeyExercisesContiguous(state);
        expect(deriveExerciseNames(state)).toEqual({
            exercise_0: 'Bench',
            exercise_1: 'Squat',
        });
    });
});

describe('rekeyExercisesContiguous', () => {
    it('compacts gapped keys to contiguous exercise_N indices', () => {
        const state = {
            exercises: {
                exercise_0: { name: 'A' },
                exercise_2: { name: 'B' },
                exercise_5: { name: 'C' },
            },
        };
        rekeyExercisesContiguous(state);
        expect(Object.keys(state.exercises).sort()).toEqual([
            'exercise_0',
            'exercise_1',
            'exercise_2',
        ]);
        expect(state.exercises.exercise_0.name).toBe('A');
        expect(state.exercises.exercise_1.name).toBe('B');
        expect(state.exercises.exercise_2.name).toBe('C');
    });

    it('keeps order stable across delete + re-key (delete middle)', () => {
        const state = {
            exercises: {
                exercise_0: { name: 'A' },
                exercise_1: { name: 'B' },
                exercise_2: { name: 'C' },
                exercise_3: { name: 'D' },
            },
        };
        delete state.exercises.exercise_1;
        rekeyExercisesContiguous(state);
        expect(state.exercises.exercise_0.name).toBe('A');
        expect(state.exercises.exercise_1.name).toBe('C');
        expect(state.exercises.exercise_2.name).toBe('D');
        expect(state.exercises.exercise_3).toBeUndefined();
    });

    it('keeps originalWorkout.exercises array aligned with re-keyed exercises', () => {
        const state = {
            exercises: {
                exercise_0: { name: 'A' },
                exercise_1: { name: 'B' },
                exercise_2: { name: 'C' },
            },
            originalWorkout: {
                exercises: [
                    { machine: 'A', name: 'A' },
                    { machine: 'B', name: 'B' },
                    { machine: 'C', name: 'C' },
                ],
            },
        };
        delete state.exercises.exercise_1;
        rekeyExercisesContiguous(state);
        expect(state.originalWorkout.exercises).toHaveLength(2);
        expect(state.originalWorkout.exercises[0].name).toBe('A');
        expect(state.originalWorkout.exercises[1].name).toBe('C');
    });

    it('handles state without originalWorkout (no-op on that side)', () => {
        const state = {
            exercises: {
                exercise_0: { name: 'A' },
                exercise_3: { name: 'B' },
            },
        };
        rekeyExercisesContiguous(state);
        expect(Object.keys(state.exercises).sort()).toEqual(['exercise_0', 'exercise_1']);
        expect(state.originalWorkout).toBeUndefined();
    });
});

describe('unit-toggle invariant', () => {
    it('only edited sets get originalUnit rewritten; untouched sets keep theirs', () => {
        // Exercise has 3 sets, all originally logged in lbs.
        const sets = [
            { reps: 10, weight: 135, originalUnit: 'lbs', type: 'working', completed: true },
            { reps: 8, weight: 145, originalUnit: 'lbs', type: 'working', completed: true },
            { reps: 6, weight: 155, originalUnit: 'lbs', type: 'working', completed: true },
        ];
        // User toggles to kg, edits set 1 (index 1) only — weight 65 kg.
        commitSetEdit(sets[1], '8', '65', 'kg');

        // Edited set: originalUnit flipped, weight stored in kg.
        expect(sets[1].originalUnit).toBe('kg');
        expect(sets[1].weight).toBe(65);
        // Untouched sets: originalUnit and weight unchanged.
        expect(sets[0].originalUnit).toBe('lbs');
        expect(sets[0].weight).toBe(135);
        expect(sets[2].originalUnit).toBe('lbs');
        expect(sets[2].weight).toBe(155);
    });

    it('rewrites originalUnit on an edited set even when display unit matches existing unit', () => {
        const set = { reps: 10, weight: 135, originalUnit: 'lbs', type: 'working', completed: true };
        commitSetEdit(set, '11', '140', 'lbs');
        expect(set.originalUnit).toBe('lbs');
        expect(set.weight).toBe(140);
        expect(set.reps).toBe(11);
    });

    it('null/empty weight does not rewrite originalUnit (preserves prior unit on cleared field)', () => {
        const set = { reps: 10, weight: 135, originalUnit: 'lbs', type: 'working', completed: true };
        commitSetEdit(set, '10', '', 'kg');
        expect(set.weight).toBeNull();
        // originalUnit stays at 'lbs' because we didn't actually persist a new
        // weight — there's nothing to attribute to a unit.
        expect(set.originalUnit).toBe('lbs');
    });

    it('handles negative numbers as null (treated as cleared)', () => {
        const set = { reps: 10, weight: 135, originalUnit: 'lbs', type: 'working', completed: true };
        commitSetEdit(set, '-5', '-10', 'kg');
        expect(set.reps).toBeNull();
        expect(set.weight).toBeNull();
        expect(set.originalUnit).toBe('lbs');
    });
});

describe('exerciseNames stays in sync with exercises (post-edit invariant)', () => {
    it('after add+remove sequence, names match contiguous keys', () => {
        const state = {
            exercises: {
                exercise_0: { name: 'A' },
                exercise_1: { name: 'B' },
                exercise_2: { name: 'C' },
            },
            originalWorkout: { exercises: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] },
        };

        // Remove middle.
        delete state.exercises.exercise_1;
        rekeyExercisesContiguous(state);
        expect(deriveExerciseNames(state)).toEqual({ exercise_0: 'A', exercise_1: 'C' });

        // Add a new one.
        const i = Object.keys(state.exercises).length;
        state.exercises[`exercise_${i}`] = { name: 'D' };
        if (state.originalWorkout?.exercises) {
            state.originalWorkout.exercises.push({ name: 'D', machine: 'D' });
        }
        expect(deriveExerciseNames(state)).toEqual({
            exercise_0: 'A',
            exercise_1: 'C',
            exercise_2: 'D',
        });

        // originalWorkout.exercises array should still be in lockstep.
        expect(state.originalWorkout.exercises.map((e) => e.name)).toEqual(['A', 'C', 'D']);
    });
});
