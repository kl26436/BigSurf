// 9/29 bug-log sweep — the dashboard used to fire four separate full-history
// reads (streaks, weekly stats, insights, loadAllWorkouts) on every open.
// Streaks / stats / insights now accept the shared list; the no-arg fetch
// path is unchanged. Also covers the loose exercise-name matcher that
// replaced the substring test in the add/swap sheets.
//
// Imports the REAL modules; Firestore is stubbed so a stray fetch is loud.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDocs = vi.fn(async () => { throw new Error('unexpected Firestore read'); });
vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {},
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    doc: vi.fn(),
    getDoc: vi.fn(),
    getDocs,
    setDoc: vi.fn(),
}));
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: () => {},
    escapeHtml: (s) => s,
    convertWeight: (w) => w,
    displayWeight: (w, u) => ({ value: w, label: u }),
}));

const { AppState } = await import('../../js/core/utils/app-state.js');
const { calculateStreaks } = await import('../../js/core/features/streak-tracker.js');
const { getWeeklyStats } = await import('../../js/core/features/stats-tracker.js');
const { loadInsightsData } = await import('../../js/core/features/training-insights.js');
const { exerciseNameMatches } = await import('../../js/core/utils/workout-helpers.js');

function ymd(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); }
const workout = (date, extra = {}) => ({
    id: `w_${date}`, date, completedAt: `${date}T12:00:00.000Z`, cancelledAt: null,
    totalDuration: 1800,
    exercises: { exercise_0: { sets: [{ reps: 8, weight: 100 }, { reps: 8, weight: 100 }] } },
    ...extra,
});

beforeEach(() => {
    AppState.currentUser = { uid: 'u1' };
    getDocs.mockClear();
});

describe('calculateStreaks(workouts)', () => {
    it('computes from the passed list without touching Firestore', async () => {
        const list = [workout(daysAgo(0)), workout(daysAgo(1)), workout(daysAgo(2))];
        const s = await calculateStreaks(list);
        expect(getDocs).not.toHaveBeenCalled();
        expect(s.totalWorkouts).toBe(3);
        expect(s.currentStreak).toBeGreaterThanOrEqual(3);
    });

    it('ignores cancelled and unfinished entries in the passed list', async () => {
        const list = [
            workout(daysAgo(0)),
            workout(daysAgo(1), { cancelledAt: 'x' }),
            workout(daysAgo(2), { completedAt: null }),
        ];
        const s = await calculateStreaks(list);
        expect(s.totalWorkouts).toBe(1);
    });
});

describe('getWeeklyStats(allWorkouts)', () => {
    it('filters the passed list to this week and sums sets/minutes', async () => {
        const today = new Date();
        const start = new Date(today); start.setDate(today.getDate() - today.getDay());
        const list = [
            workout(ymd(start)),          // this week
            workout(daysAgo(30)),         // last month
        ];
        const s = await getWeeklyStats(list);
        expect(getDocs).not.toHaveBeenCalled();
        expect(s.workouts).toHaveLength(1);
        expect(s.uniqueDays).toBe(1);
        expect(s.sets).toBe(2);
        expect(s.minutes).toBe(30);
    });
});

describe('loadInsightsData(workouts)', () => {
    it('splits the passed list into 8-week and 1-week windows without Firestore', async () => {
        const list = [workout(daysAgo(2)), workout(daysAgo(20)), workout(daysAgo(80))];
        const r = await loadInsightsData(list);
        expect(getDocs).not.toHaveBeenCalled();
        expect(r.allWorkouts.map(w => w.date)).toEqual([daysAgo(2), daysAgo(20)]);
        expect(r.recentWorkouts.map(w => w.date)).toEqual([daysAgo(2)]);
    });
});

describe('exerciseNameMatches', () => {
    it('forgives a plural the library name does not have', () => {
        expect(exerciseNameMatches('Overhead Triceps Extension', 'Overhead Triceps Extensions')).toBe(true);
    });
    it('matches words in any order', () => {
        expect(exerciseNameMatches('Overhead Triceps Extension', 'tricep overhead')).toBe(true);
    });
    it('still requires every word', () => {
        expect(exerciseNameMatches('Overhead Triceps Extension', 'overhead cable')).toBe(false);
    });
    it('accepts an exercise record and an empty query', () => {
        expect(exerciseNameMatches({ machine: 'Leg Press' }, 'leg')).toBe(true);
        expect(exerciseNameMatches({ name: 'Leg Press' }, '')).toBe(true);
    });
    it('keeps plain substring behaviour', () => {
        expect(exerciseNameMatches('Cable Overhead Triceps Extension', 'cable over')).toBe(true);
        expect(exerciseNameMatches('Hammer Curls', 'hammer curl')).toBe(true);
    });
});
