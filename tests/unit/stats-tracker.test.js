// Tests for weekly/monthly stats aggregation in stats-tracker.js.
// Imports the REAL module — Firestore is an in-memory store, streak-tracker is
// mocked (stats-tracker delegates to it, per CLAUDE.md), and ui-helpers is
// mocked because getRecentPRs dynamically imports pr-tracker which pulls it in.
//
// "Today" is pinned to Wednesday 2025-06-18 so the week runs from Sunday
// 2025-06-15 — matching the dates used by the tests/fixtures/mock-workouts.js
// fixtures.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map() }));

vi.mock('../../js/core/data/firebase-config.js', async () => {
    const { createFirestoreMock } = await import('../fixtures/firestore-mock.js');
    return createFirestoreMock(store);
});

vi.mock('../../js/core/features/streak-tracker.js', () => ({
    StreakTracker: { calculateStreaks: vi.fn() },
}));

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    convertWeight: vi.fn((w) => w),
    escapeHtml: vi.fn((s) => s),
    openModal: vi.fn(),
    closeModal: vi.fn(),
}));

import { AppState } from '../../js/core/utils/app-state.js';
import { StreakTracker } from '../../js/core/features/streak-tracker.js';
import {
    calculateWorkoutStreak,
    getWorkoutCount,
    getWorkoutsThisWeek,
    getWorkoutsThisMonth,
    getRecentWorkouts,
    getLastWorkout,
    getWeeklyStats,
    getRecentPRs,
} from '../../js/core/features/stats-tracker.js';
import { completedWorkout, newSchemaWorkout, mixedUnitsWorkout } from '../fixtures/mock-workouts.js';

const UID = 'test-user';
const workoutPath = (id) => `users/${UID}/workouts/${id}`;

let seq = 0;
const seedWorkout = (date, overrides = {}) => {
    const id = `${date}_${1750000000000 + seq}_gen${seq++}`;
    store.set(workoutPath(id), {
        workoutType: 'Chest – Push',
        date,
        completedAt: `${date}T11:00:00.000Z`,
        cancelledAt: null,
        totalDuration: 3600,
        exercises: {},
        version: '3.0',
        ...overrides,
    });
    return id;
};

beforeEach(() => {
    store.clear();
    seq = 0;
    AppState.currentUser = { uid: UID };
    StreakTracker.calculateStreaks.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 18, 12, 0, 0)); // Wednesday, June 18 2025 (local)
});

afterEach(() => {
    vi.useRealTimers();
});

describe('calculateWorkoutStreak', () => {
    it('delegates to the canonical streak tracker', async () => {
        StreakTracker.calculateStreaks.mockResolvedValue({ currentStreak: 7, longestStreak: 12 });

        expect(await calculateWorkoutStreak()).toBe(7);
        expect(StreakTracker.calculateStreaks).toHaveBeenCalledTimes(1);
    });

    it('returns 0 when the streak tracker has no data', async () => {
        StreakTracker.calculateStreaks.mockResolvedValue(null);
        expect(await calculateWorkoutStreak()).toBe(0);
    });
});

describe('getWorkoutCount', () => {
    it('counts only completed workouts inside the date range', async () => {
        seedWorkout('2025-06-15');
        seedWorkout('2025-06-16');
        seedWorkout('2025-06-16', { completedAt: null }); // never finished
        seedWorkout('2025-06-17', { cancelledAt: '2025-06-17T11:05:00.000Z' });
        seedWorkout('2025-05-01'); // completed but out of range

        const count = await getWorkoutCount(new Date(2025, 5, 15), new Date(2025, 5, 18, 23));

        expect(count).toBe(2);
    });

    it('returns 0 when no user is signed in', async () => {
        AppState.currentUser = null;
        expect(await getWorkoutCount(new Date(2025, 5, 1), new Date(2025, 5, 30))).toBe(0);
    });
});

describe('getWorkoutsThisWeek', () => {
    it('counts workouts from the start of the current week', async () => {
        seedWorkout('2025-06-15'); // Sunday — week start
        seedWorkout('2025-06-18'); // today
        seedWorkout('2025-06-13'); // Friday of the previous week

        expect(await getWorkoutsThisWeek()).toBe(2);
    });
});

describe('getWorkoutsThisMonth', () => {
    it('counts workouts within the current month only', async () => {
        seedWorkout('2025-06-01');
        seedWorkout('2025-06-30');
        seedWorkout('2025-05-30');
        seedWorkout('2025-07-02');

        expect(await getWorkoutsThisMonth()).toBe(2);
    });
});

describe('getRecentWorkouts', () => {
    it('returns the most recent completed workouts, newest first', async () => {
        seedWorkout('2025-06-01');
        seedWorkout('2025-06-05');
        seedWorkout('2025-06-10');
        seedWorkout('2025-06-12', { cancelledAt: '2025-06-12T11:05:00.000Z' });
        seedWorkout('2025-06-11', { completedAt: null });

        const recent = await getRecentWorkouts(2);

        expect(recent.map((w) => w.date)).toEqual(['2025-06-10', '2025-06-05']);
        expect(recent[0].id).toBeTruthy();
    });

    it('returns an empty array when no user is signed in', async () => {
        AppState.currentUser = null;
        expect(await getRecentWorkouts()).toEqual([]);
    });
});

describe('getLastWorkout', () => {
    it('returns the single most recent completed workout', async () => {
        seedWorkout('2025-06-05');
        seedWorkout('2025-06-10');

        const last = await getLastWorkout();
        expect(last.date).toBe('2025-06-10');
    });

    it('returns null with no workout history', async () => {
        expect(await getLastWorkout()).toBeNull();
    });
});

describe('getWeeklyStats', () => {
    it('counts multiple workouts on one day as a single unique day', async () => {
        // Two workouts on Sunday 06-15, one on Monday 06-16
        store.set(workoutPath('w1'), completedWorkout);
        store.set(workoutPath('w2'), newSchemaWorkout);
        store.set(workoutPath('w3'), mixedUnitsWorkout);

        const stats = await getWeeklyStats();

        expect(stats.workouts.length).toBe(3);
        expect(stats.uniqueDays).toBe(2);
    });

    it('aggregates sets, exercises, and minutes across the week', async () => {
        store.set(workoutPath('w1'), completedWorkout); // 5 sets, 2 exercises, 75 min
        store.set(workoutPath('w2'), mixedUnitsWorkout); // 4 sets, 2 exercises, 90 min

        const stats = await getWeeklyStats();

        expect(stats.sets).toBe(9);
        expect(stats.exercises).toBe(4);
        expect(stats.minutes).toBe(165);
        // Ordered newest first
        expect(stats.workouts[0].date).toBe('2025-06-16');
    });

    it('counts only working sets with both reps and weight', async () => {
        seedWorkout('2025-06-17', {
            exercises: {
                exercise_0: {
                    sets: [
                        { reps: 10, weight: 100 },
                        { reps: 8, weight: 90, type: 'warmup' }, // warmup — excluded
                        { reps: 0, weight: 100 }, // no reps — excluded
                        { reps: 10, weight: 0 }, // no weight — excluded
                        { reps: 10, weight: 50, type: 'dropset' },
                    ],
                },
            },
        });

        const stats = await getWeeklyStats();

        expect(stats.sets).toBe(2);
        expect(stats.exercises).toBe(1);
    });

    it('excludes incomplete and cancelled workouts entirely', async () => {
        seedWorkout('2025-06-16');
        seedWorkout('2025-06-17', { completedAt: null });
        seedWorkout('2025-06-17', { cancelledAt: '2025-06-17T11:05:00.000Z' });

        const stats = await getWeeklyStats();

        expect(stats.workouts.length).toBe(1);
        expect(stats.uniqueDays).toBe(1);
    });

    it('ignores workouts from before this week', async () => {
        seedWorkout('2025-06-13'); // Friday of the previous week
        seedWorkout('2025-06-16');

        const stats = await getWeeklyStats();

        expect(stats.workouts.map((w) => w.date)).toEqual(['2025-06-16']);
        expect(stats.uniqueDays).toBe(1);
    });

    it('sums whole minutes from workout durations', async () => {
        seedWorkout('2025-06-16', { totalDuration: 3661 }); // 61 min + 1s
        seedWorkout('2025-06-17', { totalDuration: 90 }); // 1 min + 30s

        const stats = await getWeeklyStats();

        expect(stats.minutes).toBe(62);
    });

    it('returns zeroed stats when no user is signed in', async () => {
        AppState.currentUser = null;

        expect(await getWeeklyStats()).toEqual({
            sets: 0,
            exercises: 0,
            minutes: 0,
            workouts: [],
            uniqueDays: 0,
        });
    });
});

describe('getRecentPRs', () => {
    it('returns an empty list when no PR data is tracked', async () => {
        expect(await getRecentPRs()).toEqual([]);
    });
});
