// Tests for js/core/workout/set-seeding.js — how autofill writes prefilled
// numbers onto set rows. Imports the real (pure) module.
//
// What this guards (10/23 report): mid-workout replace / add / switch-machine
// showed the new "Last:" card above blank or stale rows, because render pads
// blank rows before autofill lands and autofill only seeded an EMPTY list.

import { describe, it, expect } from 'vitest';
import {
    isTouchedSet,
    isBlankSet,
    mergeSeededSets,
    historyFromSameMachine,
} from '../../js/core/workout/set-seeding.js';

// The exact shape ensurePersistentSets pads in during render.
const blank = () => ({ reps: null, weight: null, completed: false });

describe('isTouchedSet / isBlankSet', () => {
    it('treats logged or typed rows as touched', () => {
        expect(isTouchedSet({ completed: true })).toBe(true);
        expect(isTouchedSet({ _userEdited: true })).toBe(true);
        expect(isTouchedSet({ weight: 100, reps: 8, completed: false })).toBe(false);
        expect(isTouchedSet(null)).toBe(false);
    });

    it('blank = untouched and empty', () => {
        expect(isBlankSet(blank())).toBe(true);
        expect(isBlankSet(undefined)).toBe(true);
        expect(isBlankSet({ weight: 100, reps: null, completed: false })).toBe(false);
        expect(isBlankSet({ weight: null, reps: null, _userEdited: true })).toBe(false);
    });
});

describe('mergeSeededSets', () => {
    const seeded = [
        { weight: 180, reps: 10, completed: false },
        { weight: 180, reps: 9, completed: false },
        { weight: 180, reps: 8, completed: false },
    ];

    it('seeds into the blank rows render padded in (the bug)', () => {
        expect(mergeSeededSets([blank(), blank(), blank()], seeded)).toEqual(seeded);
    });

    it('seeds an empty list exactly', () => {
        expect(mergeSeededSets([], seeded)).toEqual(seeded);
        expect(mergeSeededSets(undefined, seeded)).toEqual(seeded);
    });

    it('keeps completed and typed rows where they are', () => {
        const done = { weight: 200, reps: 10, completed: true };
        const typed = { weight: 210, reps: null, completed: false, _userEdited: true };
        const out = mergeSeededSets([done, typed, blank()], seeded);
        expect(out[0]).toBe(done);
        expect(out[1]).toBe(typed);
        expect(out[2]).toEqual(seeded[2]);
    });

    it('replaces untouched rows seeded from the previous machine', () => {
        const oldMachine = [
            { weight: 90, reps: 12, completed: false, _suggested: true },
            { weight: 90, reps: 12, completed: false },
        ];
        const out = mergeSeededSets(oldMachine, seeded);
        expect(out).toEqual(seeded);
        expect(out[0]._suggested).toBeUndefined();
    });

    it("clears an old machine's extra untouched rows instead of keeping them", () => {
        const four = [1, 2, 3, 4].map(() => ({ weight: 90, reps: 12, completed: false }));
        const out = mergeSeededSets(four, seeded.slice(0, 2));
        expect(out).toEqual(seeded.slice(0, 2));
    });

    it('blanks (not drops) an untouched row that sits before a touched one', () => {
        const done = { weight: 200, reps: 10, completed: true };
        const out = mergeSeededSets([blank(), { weight: 90, reps: 12, completed: false }, done], seeded.slice(0, 1));
        expect(out).toHaveLength(3);
        expect(out[0]).toEqual(seeded[0]);
        expect(isBlankSet(out[1])).toBe(true);
        expect(out[2]).toBe(done);
    });

    it('does not share objects with the seed array', () => {
        const out = mergeSeededSets([], seeded);
        out[0].weight = 999;
        expect(seeded[0].weight).toBe(180);
    });
});

describe('historyFromSameMachine', () => {
    it('any history counts when no machine is picked', () => {
        expect(historyFromSameMachine(null, null, { equipment: 'Anything' })).toBe(true);
    });

    it('matches by name ignoring case and separators', () => {
        expect(historyFromSameMachine('Hammer Strength — Incline', null, { equipment: 'hammer strength incline' })).toBe(true);
    });

    it('matches by stable id across a rename', () => {
        expect(historyFromSameMachine('New Name', 'eq_1', { equipment: 'Old Name', equipmentId: 'eq_1' })).toBe(true);
    });

    it('a different machine is not the same machine', () => {
        expect(historyFromSameMachine('Panatta Incline', 'eq_2', { equipment: 'Hammer Incline', equipmentId: 'eq_1' })).toBe(false);
    });

    it('a source with no recorded machine is not called a different one', () => {
        expect(historyFromSameMachine('Panatta Incline', 'eq_2', { equipment: null })).toBe(true);
    });

    it('no history is not a match', () => {
        expect(historyFromSameMachine('Panatta Incline', null, null)).toBe(false);
    });
});
