// Progression rule matrix (5.7.3) + stall ladder (CP-2).
//
// Characterization tests first: the five branches of computeOverloadNudge /
// progressionTarget are pinned so the ladder change could not silently move
// them. Then the ladder itself: 3 flat → chase-rep, 6 → back-off (plate-
// rounded −10%, seeded), 9 → rotate. The two functions must never disagree.

import { describe, it, expect, vi } from 'vitest';

// progression.js imports convertWeight from ui-helpers (DOM-heavy at import) —
// mock it with the real math so the REAL module is under test.
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    convertWeight: (weight, fromUnit, toUnit) => {
        if (!weight || isNaN(weight) || weight <= 0 || weight > 1000) return 0;
        if (fromUnit === toUnit) return Math.round(weight * 10) / 10;
        if (fromUnit === 'lbs' && toUnit === 'kg') return Math.round(weight * 0.453592 * 10) / 10;
        if (fromUnit === 'kg' && toUnit === 'lbs') return Math.round(weight * 2.20462 * 10) / 10;
        return Math.round(weight * 10) / 10;
    },
}));

import {
    computeOverloadNudge, progressionTarget, stallState, scaleLoadableWeight,
} from '../../js/core/features/progression.js';

// Newest-first session stubs: [topWeight, maxReps]
const S = (...rows) => rows.map(([topWeight, maxReps], i) => ({ date: `2026-09-${18 - i}`, topWeight, topReps: maxReps, maxReps }));

describe('characterization — the five branches', () => {
    it('hit the rep target → bump', () => {
        const s = S([190, 10], [190, 8]);
        expect(progressionTarget(s, 'lbs', 10, 10)).toMatchObject({ weight: 200, reps: 10, bumped: true, stalled: false, action: 'bump' });
        expect(computeOverloadNudge(s, 'lbs', 10, 10)).toBe('10 reps at 190 lbs — bump to 200');
    });

    it('went up last session → consolidate', () => {
        const s = S([190, 7], [180, 10]);
        expect(progressionTarget(s, 'lbs', 10, 10)).toMatchObject({ weight: 190, reps: 10, bumped: false, action: 'consolidate' });
        expect(computeOverloadNudge(s, 'lbs', 10, 10)).toBe('Up from 180 — own 190 lbs for 10 reps');
    });

    it('below the rep target → chase a rep', () => {
        const s = S([190, 8], [190, 8]);
        expect(progressionTarget(s, 'lbs', 10, 10)).toMatchObject({ weight: 190, reps: 9, bumped: false, action: 'chase-rep', stalled: false });
        expect(computeOverloadNudge(s, 'lbs', 10, 10)).toBe('Add a rep — aim 9×190 lbs toward 10');
    });

    it('not enough signal → start / beat it', () => {
        const s = S([190, 8]);
        expect(progressionTarget(s, 'lbs', null, 10)).toMatchObject({ weight: 190, reps: 8, bumped: false, action: 'start' });
        expect(computeOverloadNudge(s, 'lbs', null, 10)).toBe('Beat it — try 200 lbs');
    });

    it('reps climbing through a plateau → bump, not stall', () => {
        const s = S([190, 10], [190, 9], [190, 8]);
        expect(progressionTarget(s, 'lbs', 12, 10)).toMatchObject({ weight: 200, bumped: true, stalled: false, action: 'bump' });
        expect(computeOverloadNudge(s, 'lbs', 12, 10)).toBe('3 sessions at 190 lbs — reps are climbing, go 200 next');
    });

    it('empty / weightless input → null', () => {
        expect(progressionTarget([], 'lbs', 10, 5)).toBeNull();
        expect(progressionTarget(S([0, 10]), 'lbs', 10, 5)).toBeNull();
        expect(computeOverloadNudge(null, 'lbs', 10, 5)).toBeNull();
    });
});

describe('stallState', () => {
    it('counts the flat run and derives the rung (3 → 1, 6 → 2, 9+ → 3)', () => {
        const flat = (n) => S(...Array.from({ length: n }, () => [190, 8]));
        expect(stallState(flat(2))).toEqual({ run: 2, repsClimbing: false, rung: 0 });
        expect(stallState(flat(3)).rung).toBe(1);
        expect(stallState(flat(5)).rung).toBe(1);
        expect(stallState(flat(6)).rung).toBe(2);
        expect(stallState(flat(9)).rung).toBe(3);
        expect(stallState(flat(41)).rung).toBe(3);
    });

    it('a slow grind is not a stall', () => {
        expect(stallState(S([190, 9], [190, 8], [190, 8], [190, 8])).rung).toBe(0);
        expect(stallState(S([190, 9], [190, 8], [190, 8], [190, 8])).repsClimbing).toBe(true);
    });

    it('a different top weight resets the run — a back-off session restarts the count', () => {
        expect(stallState(S([190, 8], [170, 10], [170, 10], [190, 8], [190, 8], [190, 8])).run).toBe(1);
    });
});

describe('stall ladder', () => {
    const flat = (n, w = 190, r = 8) => S(...Array.from({ length: n }, () => [w, r]));

    it('rung 1 — hold the load and chase a rep; never offers more weight', () => {
        const t = progressionTarget(flat(3), 'lbs', 10, 10);
        expect(t).toMatchObject({ weight: 190, reps: 9, bumped: false, stalled: true, rung: 1, stallRun: 3, action: 'chase-rep' });
        const n = computeOverloadNudge(flat(3), 'lbs', 10, 10);
        expect(n).toBe('3rd session at 190 lbs — hold it and chase 9');
        expect(n).not.toMatch(/200/);
    });

    it('rung 2 — plate-rounded −10% back-off, seeded', () => {
        const t = progressionTarget(flat(6), 'lbs', 10, 10);
        expect(t).toMatchObject({ weight: 170, reps: 10, stalled: true, rung: 2, action: 'back-off', backOff: true });
        expect(computeOverloadNudge(flat(6), 'lbs', 10, 10)).toBe('6 sessions at 190 lbs — drop to 170 for two sessions, then back at it');
    });

    it('rung 2 back-off lands on a loadable weight for the gym (10 lb jumps, no 2.5s)', () => {
        // 385 × 0.9 = 346.5 → nearest whole 10 lb jumps from 385 is 345.
        expect(progressionTarget(flat(6, 385), 'lbs', 8, 10).weight).toBe(345);
        expect(scaleLoadableWeight(385, 0.9, 10)).toBe(345);
        // kg on 2.5 steps: 100 → 90.
        expect(progressionTarget(flat(6, 100), 'kg', 8, 2.5).weight).toBe(90);
    });

    it('rung 3 — rotate: hold the load, flag the hand-off', () => {
        const t = progressionTarget(flat(9), 'lbs', 10, 10);
        expect(t).toMatchObject({ weight: 190, stalled: true, rung: 3, action: 'rotate', rotate: true });
        expect(computeOverloadNudge(flat(9), 'lbs', 10, 10)).toMatch(/has had its run \(9 sessions flat\)/);
    });

    it('the advisory string and the structured target agree on every rung and branch', () => {
        const cases = [
            [S([190, 10], [190, 8]), 10],
            [S([190, 7], [180, 10]), 10],
            [S([190, 8], [190, 8]), 10],
            [S([190, 8]), null],
            [flat(3), 10], [flat(6), 10], [flat(9), 10],
            [S([190, 10], [190, 9], [190, 8]), 12],
        ];
        for (const [s, rt] of cases) {
            const t = progressionTarget(s, 'lbs', rt, 10);
            const n = computeOverloadNudge(s, 'lbs', rt, 10);
            // 'start' holds the weight but the string suggests the next step.
            const shown = t.action === 'start' ? t.weight + 10 : t.weight;
            expect(n, t.action).toContain(String(shown));
            if (t.action === 'bump') expect(n).toMatch(/bump|go 200/);
            if (t.action === 'back-off') expect(n).toMatch(/drop to/);
            if (t.action === 'rotate') expect(n).toMatch(/had its run/);
        }
    });
});
