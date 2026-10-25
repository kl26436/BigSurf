// Tests for js/core/workout/set-seeding.js — how autofill writes prefilled
// numbers onto set rows. Imports the real (pure) module.
//
// What this guards (10/23 report): mid-workout replace / add / switch-machine
// showed the new "Last:" card above blank or stale rows, because render pads
// blank rows before autofill lands and autofill only seeded an EMPTY list.

import { describe, it, expect, vi } from 'vitest';

// set-seeding imports convertWeight from ui-helpers — real math, mocked module.
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    convertWeight: (weight, fromUnit, toUnit) => {
        if (!weight || isNaN(weight) || weight <= 0) return 0;
        if (fromUnit === toUnit) return Math.round(weight * 10) / 10;
        if (fromUnit === 'lbs' && toUnit === 'kg') return Math.round(weight * 0.453592 * 10) / 10;
        if (fromUnit === 'kg' && toUnit === 'lbs') return Math.round(weight * 2.20462 * 10) / 10;
        return Math.round(weight * 10) / 10;
    },
}));

import {
    isTouchedSet,
    isBlankSet,
    mergeSeededSets,
    historyFromSameMachine,
    seedSetsFromLastSession,
    seedSetsFromTemplate,
    plateRelativeDisplay,
    reindexAfterDelete,
    plateRelativeNudge,
} from '../../js/core/workout/set-seeding.js';
import { scaleLoadableWeight } from '../../js/core/features/progression.js';

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
        expect(isBlankSet({ weight: 0, reps: 0, completed: false })).toBe(true); // saved blank row
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

describe('seedSetsFromLastSession', () => {
    const last = [
        { weight: 95, reps: 10, type: 'warmup', originalUnit: 'lbs' },
        { weight: 180, reps: 10, originalUnit: 'lbs' },
        { weight: 190, reps: 8, originalUnit: 'lbs' },
    ];

    it('copies last session exactly when nothing is earned', () => {
        const out = seedSetsFromLastSession(last, { bumped: false, weight: 190 }, null, 'lbs', 10);
        expect(out.map(s => [s.weight, s.reps])).toEqual([[95, 10], [180, 10], [190, 8]]);
        expect(out.some(s => s._suggested || s._adjusted)).toBe(false);
    });

    it('an earned bump moves each working set by the increment and flags the up marker', () => {
        const out = seedSetsFromLastSession(last, { bumped: true, weight: 200, reps: 10 }, null, 'lbs', 10);
        expect(out.map(s => s.weight)).toEqual([95, 190, 200]);
        expect(out[0]._suggested).toBeUndefined();
        expect(out[1]._suggested).toBe(true);
    });

    it('a stall back-off lowers each working set and flags lighter, not heavier', () => {
        const out = seedSetsFromLastSession(last, { backOff: true, weight: 170 }, null, 'lbs', 10);
        expect(out[2].weight).toBe(scaleLoadableWeight(190, 0.9, 10));
        expect(out[2]._adjusted).toBe('back-off');
        expect(out[2]._suggested).toBeUndefined();
    });

    it('a deload never bumps: scales working sets, clamps reps into the band, flags lighter', () => {
        const deload = { mode: 'deload', weightPct: -35, repRange: [12, 15] };
        const out = seedSetsFromLastSession(last, { bumped: true, weight: 200, reps: 10 }, deload, 'lbs', 10);
        expect(out[0]).toMatchObject({ weight: 95, reps: 10 }); // warmup untouched
        expect(out[1]).toMatchObject({ weight: scaleLoadableWeight(180, 0.65, 10), reps: 12, _adjusted: 'deload' });
        expect(out[2]).toMatchObject({ weight: scaleLoadableWeight(190, 0.65, 10), reps: 12, _adjusted: 'deload' });
        expect(out.some(s => s._suggested)).toBe(false);
    });

    it('does not scale a source that was already a deload session', () => {
        const deload = { mode: 'deload', weightPct: -35 };
        const out = seedSetsFromLastSession(last, null, deload, 'lbs', 10, { alreadyLight: true });
        expect(out.map(s => s.weight)).toEqual([95, 180, 190]);
        expect(out.some(s => s._adjusted)).toBe(false);
    });

    it('keeps plate-relative seeds marked as plates', () => {
        const plates = [{ weight: 270, reps: 10, originalUnit: 'lbs', _plateWeight: 270, _equipBaseWeight: 90 }];
        const out = seedSetsFromLastSession(plates, null, { mode: 'deload', weightPct: -30 }, 'lbs', 10);
        expect(out[0]._plateWeight).toBe(out[0].weight);
        expect(out[0].weight).toBe(scaleLoadableWeight(270, 0.7, 10));
    });

    it('converts to the exercise unit when it changes a number', () => {
        const out = seedSetsFromLastSession([{ weight: 100, reps: 10, originalUnit: 'kg' }], { bumped: true, weight: 105 }, null, 'kg', 2.5);
        expect(out[0]).toMatchObject({ weight: 102.5, originalUnit: 'kg', _suggested: true });
    });
});

describe('seedSetsFromTemplate', () => {
    it('uses template defaults, clamping reps into a deload band', () => {
        expect(seedSetsFromTemplate({ sets: 2, defaultReps: 8 }, null)).toEqual([
            { weight: null, reps: 8, completed: false }, { weight: null, reps: 8, completed: false },
        ]);
        expect(seedSetsFromTemplate({ sets: 1, defaultReps: 8 }, { mode: 'deload', repRange: [12, 15] })[0].reps).toBe(12);
        expect(seedSetsFromTemplate({}, null)).toHaveLength(3);
    });
});

describe('seedSetsFromTemplate — template weight and the deload (§3.4)', () => {
    const ex = { sets: 2, reps: 10, weight: 100 };
    it('no history anywhere: the template weight seeds the rows', () => {
        expect(seedSetsFromTemplate(ex, null, { useTemplateWeight: true }))
            .toEqual([{ weight: 100, reps: 10, completed: false }, { weight: 100, reps: 10, completed: false }]);
    });
    it('history on another machine: a new machine starts fresh (no weight)', () => {
        expect(seedSetsFromTemplate(ex, null, { useTemplateWeight: false })[0].weight).toBeNull();
    });
    it('a deload scales the template weight, plate-loadably, and marks it ↓', () => {
        const rows = seedSetsFromTemplate(ex, { mode: 'deload', weightPct: -35, repRange: [12, 15] }, { useTemplateWeight: true, inc: 10 });
        expect(rows[0]).toEqual({ weight: scaleLoadableWeight(100, 0.65, 10), reps: 12, completed: false, _adjusted: 'deload' });
    });
    it('manual entry\'s defaultWeight still wins', () => {
        expect(seedSetsFromTemplate({ ...ex, defaultWeight: 80 }, null)[0].weight).toBe(80);
    });
});

describe('plateRelativeDisplay (AP-4 / D6)', () => {
    it('no base weight → the stored number', () => {
        expect(plateRelativeDisplay({ weight: 270 }, 0)).toBe(270);
    });
    it('a seeded plate-relative row shows its plates — not plates minus the base again', () => {
        expect(plateRelativeDisplay({ weight: 270, _plateWeight: 270 }, 90)).toBe(270);
    });
    it('a completed row shows what was typed', () => {
        expect(plateRelativeDisplay({ weight: 360, _plateWeight: 270, completed: true }, 90)).toBe(270);
    });
    it('a number typed this session already is plates', () => {
        expect(plateRelativeDisplay({ weight: 250, _userEdited: true }, 90)).toBe(250);
    });
    it('a legacy total loses the base', () => {
        expect(plateRelativeDisplay({ weight: 360 }, 90)).toBe(270);
        expect(plateRelativeDisplay({ weight: 50 }, 90)).toBe(0);
    });
});

describe('reindexAfterDelete (AP-5 / D10)', () => {
    it('shifts exercise_<i> keys above the deleted slot down one', () => {
        expect(reindexAfterDelete({ exercise_0: 'a', exercise_1: 'b', exercise_2: 'c' }, 1))
            .toEqual({ exercise_0: 'a', exercise_1: 'c' });
    });
    it('does the same for bare index keys (exerciseUnits) — the kg flag follows its exercise', () => {
        expect(reindexAfterDelete({ 0: 'lbs', 2: 'kg' }, 1)).toEqual({ 0: 'lbs', 1: 'kg' });
        expect(reindexAfterDelete({ 0: 'kg' }, 0)).toEqual({});
    });
    it('leaves non-index keys alone', () => {
        expect(reindexAfterDelete({ note: 'x', 1: 'kg' }, 0)).toEqual({ note: 'x', 0: 'kg' });
    });
});

describe('plateRelativeNudge (AU-3 — base-weight gear runs the stall ladder)', () => {
    // Leg press, 90 lb sled, history in TOTALS: 6 sessions flat at 270 total.
    const flat = Array.from({ length: 6 }, (_, i) => ({ date: `2026-10-${String(20 - i * 2).padStart(2, '0')}`, topWeight: 270, topReps: 8, maxReps: 8 }));
    const opts = { base: 90, baseUnit: 'lb', unit: 'lbs', repTarget: 10, inc: 10 };

    it('6 flat sessions → the rung copy on the plate load, never "Beat it"', () => {
        const nudge = plateRelativeNudge(flat, opts);
        expect(nudge).not.toMatch(/Beat it/);
        expect(nudge).toMatch(/^6 sessions at 180 lbs — drop to \d+ for two sessions/); // rung 2, plate-relative
    });

    it('hit the rep target → bump the plates', () => {
        const nudge = plateRelativeNudge([{ date: '2026-10-20', topWeight: 270, topReps: 10, maxReps: 10 }], opts);
        expect(nudge).toBe('10 reps at 180 lbs — bump to 190');
    });

    it('nothing to say without history or a base', () => {
        expect(plateRelativeNudge(null, opts)).toBeNull();
        expect(plateRelativeNudge(flat, { ...opts, base: 0 })).toBeNull();
    });
});
