// Tests for weekly goal progress calculation (Phase 1.3, 5.2)
// Verifies progress ring percentage and day-of-week dot logic.
//
// NOTE: dashboard-ui.js's renderWeeklyGoalSection (the original source of
// these mirrors) was retired in the dashboard redesign — the weekly goal now
// renders as a hero chip (renderHeroChipRow) with no ring/percentage math.
// These helpers are kept as spec-level mirrors of the surviving analogs noted
// per function; there is no longer a 1:1 exportable source.

import { describe, it, expect } from 'vitest';

/**
 * Calculate weekly goal percentage for progress ring.
 * No current source equivalent (ex-renderWeeklyGoalSection); kept as the
 * historical Phase 1.3/5.2 spec.
 */
function calculateGoalPercentage(weekCount, weeklyGoal) {
    return weeklyGoal > 0 ? Math.min((weekCount / weeklyGoal) * 100, 100) : 0;
}

/**
 * Calculate SVG stroke-dashoffset for a progress ring.
 * MIRRORS: js/core/workout/exercise-ui.js exercise mini-ring math
 * (lines 584-585, inline in the card render) — keep in sync manually.
 * @param {number} percentage - 0-100
 * @param {number} radius - Circle radius
 * @returns {number} stroke-dashoffset value
 */
function calculateStrokeDashoffset(percentage, radius) {
    const circumference = 2 * Math.PI * radius;
    return circumference - (percentage / 100) * circumference;
}

/**
 * Determine which days of the week have workouts.
 * No exported source equivalent — nearest analog is the local-date day
 * counting inside dashboard-ui.js#computeWeekPace (lines ~331-360). Kept as
 * the historical day-dot spec.
 * @param {Array<{date: string}>} workouts - Workouts with YYYY-MM-DD date strings
 * @returns {Set<number>} Set of day-of-week indices (0=Sun, 6=Sat)
 */
function getWorkoutDays(workouts) {
    const days = new Set();
    if (!workouts || !Array.isArray(workouts)) return days;
    for (const w of workouts) {
        if (w.date) {
            const parts = w.date.split('-');
            const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            days.add(d.getDay());
        }
    }
    return days;
}

describe('calculateGoalPercentage', () => {
    it('returns 0 when weekCount is 0', () => {
        expect(calculateGoalPercentage(0, 5)).toBe(0);
    });

    it('returns correct percentage for partial completion', () => {
        expect(calculateGoalPercentage(2, 5)).toBe(40);
        expect(calculateGoalPercentage(3, 5)).toBe(60);
    });

    it('caps at 100% when goal exceeded', () => {
        expect(calculateGoalPercentage(7, 5)).toBe(100);
        expect(calculateGoalPercentage(10, 3)).toBe(100);
    });

    it('returns 100% when exactly at goal', () => {
        expect(calculateGoalPercentage(5, 5)).toBe(100);
    });

    it('returns 0 when weeklyGoal is 0 (prevents division by zero)', () => {
        expect(calculateGoalPercentage(3, 0)).toBe(0);
    });

    it('returns 0 when weeklyGoal is negative (guard)', () => {
        expect(calculateGoalPercentage(3, -1)).toBe(0);
    });

    it('handles fractional results', () => {
        // 1/3 = 33.333...%
        const pct = calculateGoalPercentage(1, 3);
        expect(pct).toBeCloseTo(33.33, 1);
    });
});

describe('calculateStrokeDashoffset', () => {
    const radius = 52; // Same as dashboard uses
    const circumference = 2 * Math.PI * radius;

    it('returns full circumference at 0%', () => {
        expect(calculateStrokeDashoffset(0, radius)).toBeCloseTo(circumference);
    });

    it('returns 0 at 100%', () => {
        expect(calculateStrokeDashoffset(100, radius)).toBeCloseTo(0);
    });

    it('returns half circumference at 50%', () => {
        expect(calculateStrokeDashoffset(50, radius)).toBeCloseTo(circumference / 2);
    });
});

describe('getWorkoutDays', () => {
    it('returns correct days of week for workouts', () => {
        // 2026-04-06 is Monday (1), 2026-04-08 is Wednesday (3)
        const workouts = [
            { date: '2026-04-06' },
            { date: '2026-04-08' },
        ];
        const days = getWorkoutDays(workouts);
        expect(days.has(1)).toBe(true); // Monday
        expect(days.has(3)).toBe(true); // Wednesday
        expect(days.size).toBe(2);
    });

    it('deduplicates same day-of-week', () => {
        // Two workouts on different Mondays
        const workouts = [
            { date: '2026-04-06' },
            { date: '2026-04-13' },
        ];
        const days = getWorkoutDays(workouts);
        expect(days.has(1)).toBe(true); // Both are Monday
        expect(days.size).toBe(1);
    });

    it('returns empty set for no workouts', () => {
        expect(getWorkoutDays([])).toEqual(new Set());
        expect(getWorkoutDays(null)).toEqual(new Set());
    });

    it('skips workouts without date', () => {
        const workouts = [
            { date: '2026-04-06' },
            { name: 'No date workout' },
        ];
        const days = getWorkoutDays(workouts);
        expect(days.size).toBe(1);
    });
});
