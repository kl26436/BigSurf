// Tests for streak calculation logic from streak-tracker.js
// Re-implements the pure date-processing logic to test in isolation

import { describe, it, expect } from 'vitest';

/**
 * Pure function re-implementation of streak calculation from streak-tracker.js
 * Takes workout date strings and a "today" string, returns streak data.
 *
 * Algorithm:
 * 1. Deduplicates dates
 * 2. Sorts chronologically
 * 3. Works backwards from today: if last workout was today or yesterday, streak is active
 * 4. Each consecutive previous day adds 1
 * 5. Also calculates longest streak
 */
function calculateStreaks(workoutDates, todayStr) {
    // Deduplicate
    const uniqueDates = [...new Set(workoutDates)];

    // Sort chronologically
    uniqueDates.sort();

    if (uniqueDates.length === 0) {
        return { currentStreak: 0, longestStreak: 0 };
    }

    // Parse a YYYY-MM-DD string into a Date at midnight local time
    function parseDate(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    const today = parseDate(todayStr);

    // Calculate current streak (working backwards)
    let currentStreak = 0;

    for (let i = uniqueDates.length - 1; i >= 0; i--) {
        const workoutDate = parseDate(uniqueDates[i]);

        if (i === uniqueDates.length - 1) {
            // Check if last workout was today or yesterday
            const daysDiff = Math.floor((today - workoutDate) / (1000 * 60 * 60 * 24));

            if (daysDiff === 0 || daysDiff === 1) {
                currentStreak = 1;
            } else {
                // More than 1 day ago - streak is broken
                break;
            }
        } else {
            // Compare with next date (the one after this in chronological order)
            const nextDate = parseDate(uniqueDates[i + 1]);
            const daysDiff = Math.floor((nextDate - workoutDate) / (1000 * 60 * 60 * 24));

            if (daysDiff === 1) {
                currentStreak++;
            } else if (daysDiff === 0) {
                // Same day (shouldn't happen after dedup, but just in case)
                continue;
            } else {
                break;
            }
        }
    }

    // Calculate longest streak (working forwards)
    let longestStreak = 0;
    let tempStreak = 1;

    for (let i = 0; i < uniqueDates.length; i++) {
        if (i === 0) {
            tempStreak = 1;
        } else {
            const currentDate = parseDate(uniqueDates[i]);
            const prevDate = parseDate(uniqueDates[i - 1]);
            const daysDiff = Math.floor((currentDate - prevDate) / (1000 * 60 * 60 * 24));

            if (daysDiff === 1) {
                tempStreak++;
            } else if (daysDiff === 0) {
                continue;
            } else {
                longestStreak = Math.max(longestStreak, tempStreak);
                tempStreak = 1;
            }
        }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return { currentStreak, longestStreak };
}

describe('calculateStreaks', () => {
    const TODAY = '2025-06-15';

    it('counts consecutive days including today', () => {
        const dates = ['2025-06-13', '2025-06-14', '2025-06-15'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(3);
    });

    it('stops at gaps in consecutive days', () => {
        // Gap on June 13
        const dates = ['2025-06-12', '2025-06-14', '2025-06-15'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(2);
    });

    it('counts streak when last workout was yesterday (not today)', () => {
        const dates = ['2025-06-12', '2025-06-13', '2025-06-14'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(3);
    });

    it('returns 0 when last workout was more than 1 day ago', () => {
        // Last workout was June 13, today is June 15 - gap of 2 days
        const dates = ['2025-06-12', '2025-06-13'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(0);
    });

    it('deduplicates dates', () => {
        const dates = ['2025-06-14', '2025-06-15', '2025-06-15'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(2);
    });

    it('returns 0 for empty array', () => {
        const result = calculateStreaks([], TODAY);
        expect(result.currentStreak).toBe(0);
        expect(result.longestStreak).toBe(0);
    });

    it('returns 1 for single workout today', () => {
        const dates = ['2025-06-15'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(1);
    });

    it('returns 1 for single workout yesterday', () => {
        const dates = ['2025-06-14'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(1);
    });

    it('handles unsorted input dates', () => {
        const dates = ['2025-06-15', '2025-06-13', '2025-06-14'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(3);
    });
});

describe('calculateStreaks - longest streak', () => {
    const TODAY = '2025-06-15';

    it('longest streak equals current streak when it is the longest', () => {
        const dates = ['2025-06-13', '2025-06-14', '2025-06-15'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.longestStreak).toBe(3);
    });

    it('longest streak can be longer than current streak', () => {
        // 5-day streak in early June, but current streak is broken
        const dates = [
            '2025-06-01', '2025-06-02', '2025-06-03', '2025-06-04', '2025-06-05',
            // gap
            '2025-06-14', '2025-06-15',
        ];
        const result = calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(2);
        expect(result.longestStreak).toBe(5);
    });

    it('single workout has longest streak of 1', () => {
        const dates = ['2025-06-10'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.longestStreak).toBe(1);
    });

    it('non-consecutive dates each count as streak of 1', () => {
        const dates = ['2025-06-01', '2025-06-05', '2025-06-10'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.longestStreak).toBe(1);
    });

    it('handles duplicates in longest streak calculation', () => {
        const dates = ['2025-06-01', '2025-06-01', '2025-06-02', '2025-06-03'];
        const result = calculateStreaks(dates, TODAY);
        expect(result.longestStreak).toBe(3);
    });
});
