// Tests for PR persistence and rebuild (pr-tracker.js beyond checkForNewPR,
// which pr-detection.test.js covers). Imports the REAL module — Firestore is
// replaced with an in-memory store, and ui-helpers is mocked because it touches
// the DOM at import time (pulled in via weight-calculations).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map() }));

vi.mock('../../js/core/data/firebase-config.js', async () => {
    const { createFirestoreMock } = await import('../fixtures/firestore-mock.js');
    return createFirestoreMock(store);
});

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    convertWeight: vi.fn((w) => w),
    escapeHtml: vi.fn((s) => s),
    openModal: vi.fn(),
    closeModal: vi.fn(),
}));

import { AppState } from '../../js/core/utils/app-state.js';
import { Config } from '../../js/core/utils/config.js';
import {
    loadPRData,
    savePRData,
    recordPR,
    rebuildPRsFromHistory,
    getExercisePRs,
    getTotalPRCount,
} from '../../js/core/features/pr-tracker.js';
import { completedWorkout } from '../fixtures/mock-workouts.js';

const UID = 'test-user';
const PR_DOC_PATH = `users/${UID}/stats/personalRecords`;
const workoutPath = (id) => `users/${UID}/workouts/${id}`;

// Config.PR_CUTOFF_DATE is '2025-07-01' — dates below are chosen around it.
const CUTOFF = Config.PR_CUTOFF_DATE;

let seq = 0;
const seedWorkout = ({
    date,
    name = 'Bench Press',
    equipment = 'Barbell',
    sets,
    completedAt = `${date}T11:00:00.000Z`,
    cancelledAt = null,
    location = 'Downtown Gym',
}) => {
    const id = `${date}_${1750000000000 + seq}_gen${seq++}`;
    store.set(workoutPath(id), {
        workoutType: 'Chest – Push',
        date,
        completedAt,
        cancelledAt,
        location,
        exercises: { exercise_0: { sets, completed: true } },
        exerciseNames: { exercise_0: name },
        originalWorkout: { exercises: [{ machine: name, equipment, bodyPart: 'Chest' }] },
        version: '3.0',
    });
    return id;
};

beforeEach(async () => {
    store.clear();
    AppState.currentUser = { uid: UID };
    // Reset the module-private prData between tests (empty store → empty structure)
    await loadPRData();
});

describe('loadPRData', () => {
    it('returns an empty structure when no PR doc exists', async () => {
        const data = await loadPRData();
        expect(data).toEqual({ exercisePRs: {}, locations: {}, currentLocation: null });
    });

    it('returns null when no user is signed in', async () => {
        AppState.currentUser = null;
        expect(await loadPRData()).toBeNull();
    });

    it('loads previously saved PR data from Firestore', async () => {
        store.set(PR_DOC_PATH, {
            exercisePRs: {
                'Bench Press': {
                    bodyPart: 'Chest',
                    Barbell: { maxWeight: { weight: 225, reps: 5, date: '2025-07-20', location: 'Gym A', unit: 'lbs' } },
                },
            },
            locations: {},
            currentLocation: 'Gym A',
        });

        await loadPRData();

        const prs = getExercisePRs('Bench Press', 'Barbell');
        expect(prs.maxWeight).toMatchObject({ weight: 225, reps: 5, date: '2025-07-20' });
    });
});

describe('savePRData', () => {
    it('returns false when no user is signed in', async () => {
        AppState.currentUser = null;
        expect(await savePRData()).toBe(false);
        expect(store.has(PR_DOC_PATH)).toBe(false);
    });

    it('writes the personalRecords doc with a lastUpdated stamp', async () => {
        expect(await savePRData()).toBe(true);

        const saved = store.get(PR_DOC_PATH);
        expect(saved.exercisePRs).toEqual({});
        expect(saved.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('round-trips PR data through save and load', async () => {
        await recordPR('Bench Press', 5, 225, 'Barbell', 'Gym A', '2025-07-10', 'Chest', 'lbs');

        // Reload from the mocked Firestore (setDoc deep-clones, so this is a
        // genuine round trip, not the same in-memory object)
        const loaded = await loadPRData();

        expect(loaded.exercisePRs['Bench Press'].Barbell.maxWeight).toMatchObject({
            weight: 225,
            reps: 5,
            date: '2025-07-10',
            location: 'Gym A',
            unit: 'lbs',
        });
        expect(loaded.exercisePRs['Bench Press'].bodyPart).toBe('Chest');
    });
});

describe('recordPR cutoff handling', () => {
    it('ignores PRs dated before the cutoff date', async () => {
        await recordPR('Bench Press', 5, 500, 'Barbell', 'Gym A', '2025-06-30');

        expect(getExercisePRs('Bench Press', 'Barbell')).toBeNull();
        expect(getTotalPRCount()).toBe(0);
        expect(store.has(PR_DOC_PATH)).toBe(false);
    });

    it('records PRs on the cutoff date itself', async () => {
        await recordPR('Bench Press', 5, 225, 'Barbell', 'Gym A', CUTOFF);

        expect(getExercisePRs('Bench Press', 'Barbell').maxWeight.weight).toBe(225);
        expect(getTotalPRCount()).toBe(1);
    });
});

describe('rebuildPRsFromHistory', () => {
    it('fails safely when no user is signed in', async () => {
        AppState.currentUser = null;
        const result = await rebuildPRsFromHistory();
        expect(result.success).toBe(false);
    });

    it('keeps the best weight, reps, and volume per exercise and equipment', async () => {
        seedWorkout({ date: '2025-07-05', sets: [{ reps: 8, weight: 185, originalUnit: 'lbs' }] });
        seedWorkout({
            date: '2025-07-12',
            sets: [
                { reps: 5, weight: 205, originalUnit: 'lbs' },
                { reps: 12, weight: 155, originalUnit: 'lbs' },
            ],
        });

        const result = await rebuildPRsFromHistory();

        expect(result.success).toBe(true);
        const prs = getExercisePRs('Bench Press', 'Barbell');
        expect(prs.maxWeight).toMatchObject({ weight: 205, reps: 5, date: '2025-07-12' });
        expect(prs.maxReps).toMatchObject({ weight: 155, reps: 12 });
        // Volumes: 185×8=1480, 205×5=1025, 155×12=1860 → 1860 wins
        expect(prs.maxVolume).toMatchObject({ weight: 155, reps: 12, volume: 1860 });
    });

    it('skips warmup sets when rebuilding', async () => {
        seedWorkout({
            date: '2025-07-05',
            sets: [
                { reps: 5, weight: 315, originalUnit: 'lbs', type: 'warmup' },
                { reps: 8, weight: 225, originalUnit: 'lbs', type: 'working' },
            ],
        });

        await rebuildPRsFromHistory();

        expect(getExercisePRs('Bench Press', 'Barbell').maxWeight.weight).toBe(225);
    });

    it('skips cancelled and incomplete workouts', async () => {
        seedWorkout({ date: '2025-07-05', sets: [{ reps: 8, weight: 185, originalUnit: 'lbs' }] });
        seedWorkout({
            date: '2025-07-06',
            sets: [{ reps: 5, weight: 400, originalUnit: 'lbs' }],
            cancelledAt: '2025-07-06T11:05:00.000Z',
        });
        seedWorkout({
            date: '2025-07-07',
            sets: [{ reps: 5, weight: 405, originalUnit: 'lbs' }],
            completedAt: null,
        });

        const result = await rebuildPRsFromHistory();

        expect(result.workoutsProcessed).toBe(1);
        expect(getExercisePRs('Bench Press', 'Barbell').maxWeight.weight).toBe(185);
    });

    it('ignores workouts before the PR cutoff date', async () => {
        // Fixture workout is dated 2025-06-15 — before the 2025-07-01 cutoff
        store.set(workoutPath('pre-cutoff'), completedWorkout);
        seedWorkout({ date: '2025-07-05', sets: [{ reps: 8, weight: 185, originalUnit: 'lbs' }] });

        const result = await rebuildPRsFromHistory();

        expect(result.workoutsProcessed).toBe(1);
        expect(getTotalPRCount()).toBe(1);
        expect(getExercisePRs('Bench Press', 'Barbell').maxWeight.weight).toBe(185);
        expect(getExercisePRs('Incline Dumbbell Press', 'Unknown Equipment')).toBeNull();
    });

    it('includes bodyweight plus added weight for bodyweight sets', async () => {
        seedWorkout({
            date: '2025-07-05',
            name: 'Pull-Up',
            equipment: 'Pull-Up Bar',
            sets: [{ reps: 8, isBodyweight: true, bodyWeight: 180, addedWeight: 25, originalUnit: 'lbs' }],
        });

        await rebuildPRsFromHistory();

        expect(getExercisePRs('Pull-Up', 'Pull-Up Bar').maxWeight.weight).toBe(205);
    });

    it('preserves the unit each set was typed in', async () => {
        seedWorkout({
            date: '2025-07-05',
            name: 'Deadlift',
            sets: [{ reps: 5, weight: 120, originalUnit: 'kg' }],
        });

        await rebuildPRsFromHistory();

        expect(getExercisePRs('Deadlift', 'Barbell').maxWeight.unit).toBe('kg');
    });

    it('uses the workout date and location for rebuilt PRs, not current values', async () => {
        seedWorkout({
            date: '2025-07-08',
            location: 'Hotel Gym',
            sets: [{ reps: 10, weight: 135, originalUnit: 'lbs' }],
        });

        await rebuildPRsFromHistory();

        const pr = getExercisePRs('Bench Press', 'Barbell').maxWeight;
        expect(pr.date).toBe('2025-07-08');
        expect(pr.location).toBe('Hotel Gym');
    });

    it('replaces previously tracked PRs and persists the rebuilt data', async () => {
        // Existing (stale) PR heavier than anything in history
        await recordPR('Bench Press', 3, 500, 'Barbell', 'Gym A', '2025-07-02');
        seedWorkout({ date: '2025-07-05', sets: [{ reps: 8, weight: 185, originalUnit: 'lbs' }] });

        const result = await rebuildPRsFromHistory();

        expect(result.success).toBe(true);
        expect(getExercisePRs('Bench Press', 'Barbell').maxWeight.weight).toBe(185);

        // Rebuilt data was saved — reloading from Firestore gives the same answer
        const loaded = await loadPRData();
        expect(loaded.exercisePRs['Bench Press'].Barbell.maxWeight.weight).toBe(185);
    });

    it('reports processed workout and set counts', async () => {
        seedWorkout({
            date: '2025-07-05',
            sets: [
                { reps: 10, weight: 135, originalUnit: 'lbs' },
                { reps: 8, weight: 155, originalUnit: 'lbs' },
                { reps: 5, weight: 95, originalUnit: 'lbs', type: 'warmup' },
            ],
        });
        seedWorkout({ date: '2025-07-06', sets: [{ reps: 8, weight: 165, originalUnit: 'lbs' }] });

        const result = await rebuildPRsFromHistory();

        expect(result).toEqual({ success: true, workoutsProcessed: 2, setsProcessed: 3 });
    });

    it('succeeds with an empty history and clears existing PRs', async () => {
        await recordPR('Bench Press', 5, 225, 'Barbell', 'Gym A', '2025-07-10');

        const result = await rebuildPRsFromHistory();

        expect(result).toEqual({ success: true, workoutsProcessed: 0, setsProcessed: 0 });
        expect(getTotalPRCount()).toBe(0);
    });
});
