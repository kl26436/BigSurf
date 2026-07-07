// Freestyle memory — the pure helpers behind "last Legs: leg press, hack
// squat…" (quick-start sheet) and the add-exercise "Recent" section.

import { describe, it, expect } from 'vitest';
import {
    isFreestyleWorkout,
    freestyleFocusOf,
    getLastFreestyleSession,
    getRecentFreestyleExercises,
    freestyleComparisonKey,
    findPriorComparableFreestyle,
    relativeDaysLabel,
} from '../../js/core/features/freestyle-memory.js';

const fs = (date, focus, exercises, extra = {}) => ({
    workoutType: focus ? `Freestyle — ${focus}` : 'Freestyle',
    isFreestyle: true,
    templateId: null,
    date,
    startedAt: `${date}T10:00:00.000Z`,
    completedAt: `${date}T11:00:00.000Z`,
    cancelledAt: null,
    originalWorkout: { exercises },
    ...extra,
});
const ex = (machine, bodyPart, equipment = null) => ({ machine, bodyPart, equipment, equipmentId: null });

describe('isFreestyleWorkout', () => {
    it('true via the explicit flag', () => {
        expect(isFreestyleWorkout({ isFreestyle: true })).toBe(true);
    });

    it('true via template-less "Freestyle…" label (older docs, no flag)', () => {
        expect(isFreestyleWorkout({ workoutType: 'Freestyle — Legs' })).toBe(true);
        expect(isFreestyleWorkout({ workoutType: 'Freestyle' })).toBe(true);
    });

    it('false for template workouts — even one NAMED "Freestyle…"', () => {
        expect(isFreestyleWorkout({ workoutType: 'Chest – Push', templateId: 't1' })).toBe(false);
        expect(isFreestyleWorkout({ workoutType: 'Freestyle Fridays', templateId: 't2' })).toBe(false);
    });
});

describe('getLastFreestyleSession', () => {
    const legsOld = fs('2026-06-01', 'Legs', [ex('Leg press', 'Legs'), ex('Leg curl', 'Legs')]);
    const legsNew = fs('2026-06-20', 'Legs', [ex('Hack squat', 'Legs'), ex('Calf raise', 'Legs')]);
    const push = fs('2026-06-25', 'Push', [ex('Bench press', 'Chest')]);
    const plain = fs('2026-06-28', null, [ex('Row', 'Back')]);

    it('returns the most recent session matching the focus', () => {
        const last = getLastFreestyleSession([legsOld, push, legsNew, plain], 'Legs');
        expect(last.date).toBe('2026-06-20');
        expect(last.focus).toBe('Legs');
        expect(last.exercises.map((e) => e.machine)).toEqual(['Hack squat', 'Calf raise']);
    });

    it('null focus matches ANY freestyle (returns the latest overall)', () => {
        const last = getLastFreestyleSession([legsOld, push, legsNew, plain], null);
        expect(last.date).toBe('2026-06-28');
        expect(last.focus).toBeNull();
    });

    it('skips cancelled, incomplete, empty, and template sessions', () => {
        const cancelled = fs('2026-06-29', 'Legs', [ex('Leg press', 'Legs')], { cancelledAt: '2026-06-29T11:00:00Z' });
        const incomplete = fs('2026-06-30', 'Legs', [ex('Leg press', 'Legs')], { completedAt: null });
        const empty = fs('2026-07-01', 'Legs', []);
        const template = { workoutType: 'Leg Day', templateId: 't9', date: '2026-07-02', completedAt: 'x', originalWorkout: { exercises: [ex('Squat', 'Legs')] } };
        const last = getLastFreestyleSession([cancelled, incomplete, empty, template, legsNew], 'Legs');
        expect(last.date).toBe('2026-06-20');
    });

    it('returns null when he has never freestyled that focus', () => {
        expect(getLastFreestyleSession([push], 'Legs')).toBeNull();
        expect(getLastFreestyleSession([], null)).toBeNull();
    });
});

describe('getRecentFreestyleExercises', () => {
    it('dedupes by name (case-insensitive), most recent first, counts uses', () => {
        const older = fs('2026-06-01', 'Legs', [ex('Leg press', 'Legs', 'Old Machine'), ex('Leg curl', 'Legs')]);
        const newer = fs('2026-06-20', 'Legs', [ex('LEG PRESS', 'Legs', 'New Machine'), ex('Hack squat', 'Legs')]);
        const recent = getRecentFreestyleExercises([older, newer]);
        expect(recent.map((r) => r.name)).toEqual(['LEG PRESS', 'Hack squat', 'Leg curl']);
        const legPress = recent.find((r) => r.name.toLowerCase() === 'leg press');
        expect(legPress.timesUsed).toBe(2);
        expect(legPress.equipment).toBe('New Machine'); // most recent occurrence wins
        expect(legPress.lastDate).toBe('2026-06-20');
    });

    it('spans focuses (the body-part filter narrows later) and respects limit', () => {
        const legs = fs('2026-06-20', 'Legs', [ex('Leg press', 'Legs')]);
        const push = fs('2026-06-25', 'Push', [ex('Bench press', 'Chest')]);
        const recent = getRecentFreestyleExercises([legs, push], { limit: 1 });
        expect(recent).toHaveLength(1);
        expect(recent[0].name).toBe('Bench press'); // most recent session first
    });

    it('empty history → empty list (no crash)', () => {
        expect(getRecentFreestyleExercises([])).toEqual([]);
        expect(getRecentFreestyleExercises(undefined)).toEqual([]);
    });
});

describe('freestyleComparisonKey', () => {
    it('prefers the declared focus label', () => {
        const w = fs('2026-07-01', 'Legs', [ex('Bench press', 'Chest')]); // label wins even over contents
        expect(freestyleComparisonKey(w)).toBe('Legs');
    });

    it('derives the dominant body-part bucket when the chip was skipped', () => {
        const w = fs('2026-07-01', null, [
            ex('Leg press', 'Legs'), ex('Hack squat', 'Quads'), ex('Leg curl', 'Hamstrings'),
            ex('Crunch', 'Abs'),
        ]);
        expect(freestyleComparisonKey(w)).toBe('Legs'); // 3 of 4 bucketable → majority
    });

    it('returns null for a mixed session with no majority (comparison would be noise)', () => {
        const w = fs('2026-07-01', null, [
            ex('Bench press', 'Chest'), ex('Row', 'Back'), ex('Squat', 'Legs'),
        ]);
        expect(freestyleComparisonKey(w)).toBeNull();
    });

    it('returns null when nothing buckets', () => {
        expect(freestyleComparisonKey(fs('2026-07-01', null, [ex('Mystery', null)]))).toBeNull();
    });
});

describe('findPriorComparableFreestyle', () => {
    it('matches an UNLABELED leg day against a labeled "Freestyle — Legs" (the chip-skip case)', () => {
        const labeled = fs('2026-06-20', 'Legs', [ex('Leg press', 'Legs')]);
        const current = fs('2026-07-01', null, [ex('Hack squat', 'Legs'), ex('Leg curl', 'Legs')]);
        const match = findPriorComparableFreestyle([labeled, current], current);
        expect(match).not.toBeNull();
        expect(match.workout).toBe(labeled);
        expect(match.key).toBe('Legs');
    });

    it('never compares unlike sessions (legs vs push), even under the same plain label', () => {
        const push = fs('2026-06-20', null, [ex('Bench press', 'Chest'), ex('Incline press', 'Chest')]);
        const current = fs('2026-07-01', null, [ex('Leg press', 'Legs'), ex('Leg curl', 'Legs')]);
        expect(findPriorComparableFreestyle([push, current], current)).toBeNull();
    });

    it('picks the most recent comparable and excludes the current doc by id', () => {
        const older = fs('2026-06-01', 'Legs', [ex('Leg press', 'Legs')], { id: 'w1' });
        const newer = fs('2026-06-20', 'Legs', [ex('Hack squat', 'Legs')], { id: 'w2' });
        const current = { ...fs('2026-07-01', 'Legs', [ex('Leg curl', 'Legs')], { id: 'w3' }), workoutId: 'w3' };
        const match = findPriorComparableFreestyle([older, newer, current], current);
        expect(match.workout.id).toBe('w2');
    });
});

describe('relativeDaysLabel', () => {
    const now = new Date('2026-07-06T15:00:00');
    it('labels', () => {
        expect(relativeDaysLabel('2026-07-06', now)).toBe('today');
        expect(relativeDaysLabel('2026-07-05', now)).toBe('yesterday');
        expect(relativeDaysLabel('2026-07-01', now)).toBe('5d ago');
        expect(relativeDaysLabel('2026-06-15', now)).toBe('3w ago');
        expect(relativeDaysLabel('2026-04-01', now)).toBe('3mo ago');
        expect(relativeDaysLabel(null, now)).toBe('');
    });
});
