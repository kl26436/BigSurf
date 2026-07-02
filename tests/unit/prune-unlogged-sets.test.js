// Tests for pruneUnloggedSets (workout-session.js) — the fix for finishing a
// workout early persisting autofill placeholders as if they'd been logged.
// Pure mutation of the exercises map; re-implemented here for isolation:
// importing workout-session.js in node would require mocking its whole import
// graph (ui-helpers, navigation, data-manager/firebase, active-workout-ui,
// haptics, push-notification-manager) — a mock tower not worth two functions.

import { describe, it, expect } from 'vitest';

// MIRRORS: js/core/workout/workout-session.js#pruneUnloggedSets (lines 261-273)
// — keep in sync manually.
function pruneUnloggedSets(savedData) {
    const exMap = savedData?.exercises;
    if (!exMap) return;
    for (const key of Object.keys(exMap)) {
        const ex = exMap[key];
        if (ex && Array.isArray(ex.sets)) {
            ex.sets = ex.sets.filter(s => s && s.completed === true);
        }
        if (!ex || !ex.sets || ex.sets.length === 0) {
            delete exMap[key];
        }
    }
}

const done = (reps, weight) => ({ reps, weight, completed: true });
const autofill = (reps, weight) => ({ reps, weight, completed: false });

describe('pruneUnloggedSets', () => {
    it('keeps completed sets and drops autofill-only sets', () => {
        const data = { exercises: { exercise_0: { sets: [done(10, 135), autofill(8, 135), autofill(6, 135)] } } };
        pruneUnloggedSets(data);
        expect(data.exercises.exercise_0.sets).toEqual([done(10, 135)]);
    });

    it('deletes an exercise with no logged sets entirely', () => {
        const data = {
            exercises: {
                exercise_0: { sets: [done(10, 135)] },
                exercise_1: { sets: [autofill(8, 95), autofill(8, 95)] }, // never touched
            },
        };
        pruneUnloggedSets(data);
        expect(Object.keys(data.exercises)).toEqual(['exercise_0']);
    });

    it('is a no-op for a fully completed workout', () => {
        const data = { exercises: { exercise_0: { sets: [done(10, 135), done(8, 145)] } } };
        pruneUnloggedSets(data);
        expect(data.exercises.exercise_0.sets).toHaveLength(2);
    });

    it('treats a partially-logged exercise correctly (keeps only logged)', () => {
        const data = { exercises: { exercise_0: { sets: [done(10, 135), autofill(8, 135)] } } };
        pruneUnloggedSets(data);
        expect(data.exercises.exercise_0.sets).toEqual([done(10, 135)]);
    });

    it('drops exercises whose sets are missing or empty', () => {
        const data = { exercises: { exercise_0: { sets: [] }, exercise_1: {}, exercise_2: { sets: [done(5, 225)] } } };
        pruneUnloggedSets(data);
        expect(Object.keys(data.exercises)).toEqual(['exercise_2']);
    });

    it('handles missing exercises map without throwing', () => {
        expect(() => pruneUnloggedSets({})).not.toThrow();
        expect(() => pruneUnloggedSets(null)).not.toThrow();
    });
});
