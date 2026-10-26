// Offline behaviour of the real data modules over the shared in-memory
// Firestore mock: the store stands in for the device's local cache, and
// `control.serverOffline` makes server-only reads fail the way the SDK does
// offline (getDocsFromServer → code 'unavailable').

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { store, control } = vi.hoisted(() => ({
    store: new Map(),
    control: { serverOffline: false, prDocUnreadable: false },
}));

vi.mock('../../js/core/data/firebase-config.js', async () => {
    const { createFirestoreMock } = await import('../fixtures/firestore-mock.js');
    const mock = createFirestoreMock(store, control);
    return {
        ...mock,
        // Offline with the PR doc never cached: getDoc throws like the SDK does.
        getDoc: async (ref) => {
            if (control.prDocUnreadable && ref.__path.endsWith('stats/personalRecords')) {
                throw Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });
            }
            return mock.getDoc(ref);
        },
    };
});

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    convertWeight: vi.fn((w) => w),
    escapeHtml: vi.fn((s) => s),
    openModal: vi.fn(),
    closeModal: vi.fn(),
}));

import { AppState } from '../../js/core/utils/app-state.js';
import { FirebaseWorkoutManager } from '../../js/core/data/firebase-workout-manager.js';
import { loadAllWorkouts, clearAllWorkoutsCache } from '../../js/core/data/data-manager.js';
import { processWorkoutForPRs } from '../../js/core/features/pr-tracker.js';
import { markServerReachable } from '../../js/core/data/offline.js';

const UID = 'offline-user';
const seed = (id, data) => store.set(`users/${UID}/workouts/${id}`, data);

beforeEach(() => {
    store.clear();
    control.serverOffline = false;
    control.prDocUnreadable = false;
    markServerReachable();
    clearAllWorkoutsCache();
    AppState.currentUser = { uid: UID };
    seed('w1', { date: '2026-10-20', workoutType: 'Push', completedAt: '2026-10-20T11:00:00Z', cancelledAt: null });
    seed('w2', { date: '2026-10-22', workoutType: 'Pull', completedAt: '2026-10-22T11:00:00Z', cancelledAt: null });
    seed('w3', { date: '2026-10-23', workoutType: 'Legs', completedAt: null, cancelledAt: '2026-10-23T10:00:00Z' });
});

afterEach(() => {
    vi.unstubAllGlobals();
    AppState.currentUser = null;
});

describe('FirebaseWorkoutManager#getUserWorkouts offline', () => {
    it('reads the server when it is reachable', async () => {
        const workouts = await new FirebaseWorkoutManager(AppState).getUserWorkouts();
        expect(workouts.map((w) => w.id)).toEqual(['w2', 'w1']);
    });

    it('falls back to the device cache when getDocsFromServer fails offline', async () => {
        control.serverOffline = true;
        const workouts = await new FirebaseWorkoutManager(AppState).getUserWorkouts();
        // Same filtering + order as the server path — not an empty history.
        expect(workouts.map((w) => w.id)).toEqual(['w2', 'w1']);
    });

    it('goes straight to the cache when the device reports offline', async () => {
        vi.stubGlobal('navigator', { onLine: false });
        control.serverOffline = true;
        const workouts = await new FirebaseWorkoutManager(AppState).getUserWorkouts();
        expect(workouts.map((w) => w.id)).toEqual(['w2', 'w1']);
    });
});

describe('getUserWorkoutTemplates({ fromServer }) offline', () => {
    it('still returns the custom templates from the cache', async () => {
        store.set(`users/${UID}/workoutTemplates/t1`, { name: 'My push', exercises: [] });
        control.serverOffline = true;
        const templates = await new FirebaseWorkoutManager(AppState).getUserWorkoutTemplates({ fromServer: true });
        expect(templates.some((t) => t.id === 't1')).toBe(true);
    });
});

describe('loadAllWorkouts offline', () => {
    it('serves completed workouts from the cache with the device offline', async () => {
        vi.stubGlobal('navigator', { onLine: false });
        const workouts = await loadAllWorkouts(AppState, { throwOnError: true });
        expect(workouts.map((w) => w.id)).toEqual(['w2', 'w1']);
    });
});

describe('processWorkoutForPRs with the PR store unreadable', () => {
    const workout = {
        date: '2026-10-24',
        exercises: { exercise_0: { sets: [{ reps: 5, weight: 225, type: 'working', originalUnit: 'lbs' }] } },
        exerciseNames: { exercise_0: 'Bench Press' },
        originalWorkout: { exercises: [{ machine: 'Bench Press', equipment: 'Barbell' }] },
    };

    // Order matters: this must run before anything loads the PR store in this file.
    it('records nothing rather than overwrite the real store with an empty one', async () => {
        store.set(`users/${UID}/stats/personalRecords`, {
            exercisePRs: { Squat: { bodyPart: 'Legs', Barbell: { maxWeight: { weight: 315, reps: 3 } } } },
        });
        control.prDocUnreadable = true;
        const prs = await processWorkoutForPRs(workout);
        expect(prs).toEqual([]);
        // The stored PRs are untouched.
        expect(store.get(`users/${UID}/stats/personalRecords`).exercisePRs.Squat).toBeDefined();
        expect(store.get(`users/${UID}/stats/personalRecords`).exercisePRs['Bench Press']).toBeUndefined();
    });

    it('records PRs once the store can be read', async () => {
        const prs = await processWorkoutForPRs(workout);
        expect(prs.length).toBeGreaterThan(0);
        expect(store.get(`users/${UID}/stats/personalRecords`).exercisePRs['Bench Press']).toBeDefined();
    });
});
