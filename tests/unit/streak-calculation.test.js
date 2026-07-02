// Tests for streak calculation logic from streak-tracker.js
// Imports the REAL calculateStreaks — firebase-config is mocked with an
// in-memory workout list (same pattern as schema-migration.test.js), and fake
// timers pin "today" since the source reads new Date() directly.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// vi.mock factories are hoisted, so shared state must come from vi.hoisted.
const { store } = vi.hoisted(() => ({ store: { workouts: [] } }));

vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {},
    collection: (_db, ...segments) => ({ __path: segments.join('/') }),
    getDocs: async () => ({
        docs: store.workouts.map((w) => ({ data: () => w })),
    }),
}));

import { AppState } from '../../js/core/utils/app-state.js';
import { calculateStreaks as realCalculateStreaks } from '../../js/core/features/streak-tracker.js';

AppState.currentUser = { uid: 'test-user' };

beforeAll(() => vi.useFakeTimers());
afterAll(() => vi.useRealTimers());

// Harness: seed the mocked workouts collection with one completed workout per
// date, pin the system clock to todayStr (local noon), then run the real
// async calculateStreaks().
async function calculateStreaks(workoutDates, todayStr) {
    store.workouts = workoutDates.map((date) => ({
        date,
        completedAt: `${date}T10:00:00.000Z`,
        cancelledAt: null,
    }));
    const [year, month, day] = todayStr.split('-').map(Number);
    vi.setSystemTime(new Date(year, month - 1, day, 12, 0, 0));
    return realCalculateStreaks();
}

describe('calculateStreaks', () => {
    const TODAY = '2025-06-15';

    it('counts consecutive days including today', async () => {
        const dates = ['2025-06-13', '2025-06-14', '2025-06-15'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(3);
    });

    it('stops at gaps in consecutive days', async () => {
        // Gap on June 13
        const dates = ['2025-06-12', '2025-06-14', '2025-06-15'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(2);
    });

    it('counts streak when last workout was yesterday (not today)', async () => {
        const dates = ['2025-06-12', '2025-06-13', '2025-06-14'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(3);
    });

    it('returns 0 when last workout was more than 1 day ago', async () => {
        // Last workout was June 13, today is June 15 - gap of 2 days
        const dates = ['2025-06-12', '2025-06-13'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(0);
    });

    it('deduplicates dates', async () => {
        const dates = ['2025-06-14', '2025-06-15', '2025-06-15'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(2);
    });

    it('returns 0 for empty array', async () => {
        const result = await calculateStreaks([], TODAY);
        expect(result.currentStreak).toBe(0);
        expect(result.longestStreak).toBe(0);
    });

    it('returns 1 for single workout today', async () => {
        const dates = ['2025-06-15'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(1);
    });

    it('returns 1 for single workout yesterday', async () => {
        const dates = ['2025-06-14'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(1);
    });

    it('handles unsorted input dates', async () => {
        const dates = ['2025-06-15', '2025-06-13', '2025-06-14'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(3);
    });
});

describe('calculateStreaks - longest streak', () => {
    const TODAY = '2025-06-15';

    it('longest streak equals current streak when it is the longest', async () => {
        const dates = ['2025-06-13', '2025-06-14', '2025-06-15'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.longestStreak).toBe(3);
    });

    it('longest streak can be longer than current streak', async () => {
        // 5-day streak in early June, but current streak is broken
        const dates = [
            '2025-06-01', '2025-06-02', '2025-06-03', '2025-06-04', '2025-06-05',
            // gap
            '2025-06-14', '2025-06-15',
        ];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.currentStreak).toBe(2);
        expect(result.longestStreak).toBe(5);
    });

    it('single workout has longest streak of 1', async () => {
        const dates = ['2025-06-10'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.longestStreak).toBe(1);
    });

    it('non-consecutive dates each count as streak of 1', async () => {
        const dates = ['2025-06-01', '2025-06-05', '2025-06-10'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.longestStreak).toBe(1);
    });

    it('handles duplicates in longest streak calculation', async () => {
        const dates = ['2025-06-01', '2025-06-01', '2025-06-02', '2025-06-03'];
        const result = await calculateStreaks(dates, TODAY);
        expect(result.longestStreak).toBe(3);
    });
});
