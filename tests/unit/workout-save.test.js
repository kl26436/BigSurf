// Tests for the saveWorkoutData path in data-manager.js — normalizedData
// mapping, date-field discipline, ID generation, and metadata stamping.
// Imports the REAL module; only firebase-config (in-memory store) and
// ui-helpers (DOM at import time) are mocked. saveWorkoutData takes its state
// as a parameter, so tests inject a plain object shaped like AppState.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { saveWorkoutData, generateWorkoutId } from '../../js/core/data/data-manager.js';

const UID = 'test-user';
const TODAY = '2025-08-15';

// Return [id, doc] pairs for everything saved under the workouts collection
const savedWorkouts = () =>
    [...store.entries()]
        .filter(([path]) => path.startsWith(`users/${UID}/workouts/`))
        .map(([path, data]) => [path.split('/').pop(), data]);

const onlySavedWorkout = () => {
    const all = savedWorkouts();
    expect(all.length).toBe(1);
    return all[0];
};

function makeState(overrides = {}) {
    return {
        currentUser: { uid: UID },
        savedData: {
            workoutType: 'Chest – Push',
            date: TODAY,
            startedAt: `${TODAY}T10:30:00.000Z`,
            exercises: {
                exercise_0: {
                    name: 'Bench Press',
                    equipment: 'Hammer Strength Flat',
                    sets: [
                        { reps: 10, weight: 135, originalUnit: 'lbs', type: 'working', completed: true },
                        { reps: 8, weight: 95, originalUnit: 'lbs', type: 'warmup', completed: true },
                    ],
                    notes: 'Felt strong today',
                    completed: true,
                },
            },
        },
        exerciseUnits: {},
        globalUnit: 'lbs',
        currentWorkout: {
            day: 'Chest – Push',
            exercises: [
                {
                    machine: 'Bench Press',
                    sets: 3,
                    reps: 10,
                    weight: 135,
                    equipment: 'Hammer Strength Flat',
                    equipmentLocation: 'Downtown Gym',
                    bodyPart: 'Chest',
                },
            ],
        },
        getTodayDateString: () => TODAY,
        ...overrides,
    };
}

beforeEach(() => {
    store.clear();
    // data-manager touches window.inProgressWorkout inside the save path;
    // the node test environment has no window, so stub a bare object.
    vi.stubGlobal('window', {});
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('date handling', () => {
    it('keeps a YYYY-MM-DD date exactly as stored', async () => {
        const state = makeState();
        state.savedData.date = '2025-08-10';

        expect(await saveWorkoutData(state)).toBe(true);

        const [id, doc] = onlySavedWorkout();
        expect(doc.date).toBe('2025-08-10');
        expect(id.startsWith('2025-08-10_')).toBe(true);
    });

    it('derives the date from the string, never from timezone math on the timestamp', async () => {
        const state = makeState();
        // 23:30 UTC — a Date-based conversion would roll this to 08-11 in
        // eastern timezones; string extraction must keep 08-10
        state.savedData.date = '2025-08-10T23:30:00.000Z';

        await saveWorkoutData(state);

        const [, doc] = onlySavedWorkout();
        expect(doc.date).toBe('2025-08-10');
        expect(doc.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('falls back to today for a malformed date', async () => {
        const state = makeState();
        state.savedData.date = 'not-a-date';

        await saveWorkoutData(state);

        expect(onlySavedWorkout()[1].date).toBe(TODAY);
    });

    it('defaults to today when no date is set', async () => {
        const state = makeState();
        delete state.savedData.date;

        await saveWorkoutData(state);

        expect(onlySavedWorkout()[1].date).toBe(TODAY);
    });
});

describe('document identity', () => {
    it('generates a unique {date}_{timestamp}_{random} ID for a new workout', async () => {
        const state = makeState();

        await saveWorkoutData(state);

        const [id, doc] = onlySavedWorkout();
        expect(id).toMatch(/^2025-08-15_\d+_[a-z0-9]+$/);
        expect(doc.workoutId).toBe(id);
        expect(state.savedData.workoutId).toBe(id);
    });

    it('reuses the existing workoutId on subsequent saves', async () => {
        const state = makeState();

        await saveWorkoutData(state);
        const [firstId] = onlySavedWorkout();

        state.savedData.exercises.exercise_0.sets[0].weight = 140;
        await saveWorkoutData(state);

        const [secondId, doc] = onlySavedWorkout();
        expect(secondId).toBe(firstId);
        expect(doc.exercises.exercise_0.sets[0].weight).toBe(140);
    });

    it('generateWorkoutId produces distinct IDs for the same date', () => {
        const a = generateWorkoutId('2025-08-15');
        const b = generateWorkoutId('2025-08-15');
        expect(a).not.toBe(b);
        expect(a).toMatch(/^2025-08-15_\d+_[a-z0-9]+$/);
    });
});

describe('metadata stamping', () => {
    it('stamps lastUpdated as an ISO timestamp and version 3.0', async () => {
        const before = Date.now();
        await saveWorkoutData(makeState());

        const [, doc] = onlySavedWorkout();
        expect(doc.version).toBe('3.0');
        expect(doc.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(Date.parse(doc.lastUpdated)).toBeGreaterThanOrEqual(before);
    });
});

describe('set normalization', () => {
    it('preserves each set\'s own originalUnit even when the exercise unit differs', async () => {
        const state = makeState();
        state.exerciseUnits = { 0: 'kg' };
        // The lbs set was typed in lbs before the unit switch — must stay lbs
        await saveWorkoutData(state);

        const [, doc] = onlySavedWorkout();
        expect(doc.exercises.exercise_0.sets[0].originalUnit).toBe('lbs');
    });

    it('defaults a missing originalUnit to the exercise unit, then the global unit', async () => {
        const state = makeState();
        state.exerciseUnits = { 0: 'kg' };
        state.globalUnit = 'lbs';
        state.savedData.exercises = {
            exercise_0: { sets: [{ reps: 10, weight: 60 }] },
            exercise_1: { sets: [{ reps: 10, weight: 135 }] },
        };
        state.currentWorkout = null;

        await saveWorkoutData(state);

        const [, doc] = onlySavedWorkout();
        expect(doc.exercises.exercise_0.sets[0].originalUnit).toBe('kg');
        expect(doc.exercises.exercise_1.sets[0].originalUnit).toBe('lbs');
    });

    it('preserves set type and completed flags through save', async () => {
        const state = makeState();
        state.savedData.exercises.exercise_0.sets.push(
            { reps: 6, weight: 155, originalUnit: 'lbs', type: 'dropset', completed: false }
        );

        await saveWorkoutData(state);

        const [, doc] = onlySavedWorkout();
        const types = doc.exercises.exercise_0.sets.map((s) => s.type);
        expect(types).toEqual(['working', 'warmup', 'dropset']);
        expect(doc.exercises.exercise_0.sets.map((s) => s.completed)).toEqual([true, true, false]);
    });

    it('does not mutate the in-memory sets while normalizing the saved copy', async () => {
        const state = makeState();
        state.savedData.exercises.exercise_0.sets = [{ reps: 10, weight: 135 }];

        await saveWorkoutData(state);

        // Saved doc got the defaulted unit; live state did not
        expect(onlySavedWorkout()[1].exercises.exercise_0.sets[0].originalUnit).toBe('lbs');
        expect(state.savedData.exercises.exercise_0.sets[0].originalUnit).toBeUndefined();
    });

    it('preserves other exercise fields (name, equipment, notes) untouched', async () => {
        await saveWorkoutData(makeState());

        const [, doc] = onlySavedWorkout();
        expect(doc.exercises.exercise_0).toMatchObject({
            name: 'Bench Press',
            equipment: 'Hammer Strength Flat',
            notes: 'Felt strong today',
            completed: true,
        });
        expect(doc.workoutType).toBe('Chest – Push');
        expect(doc.startedAt).toBe(`${TODAY}T10:30:00.000Z`);
    });
});

describe('exerciseNames and originalWorkout snapshot', () => {
    it('builds the exerciseNames map from the current workout', async () => {
        const state = makeState();
        state.currentWorkout.exercises.push({ name: 'Cable Fly', sets: 3, reps: 12, weight: 30 });

        await saveWorkoutData(state);

        const [, doc] = onlySavedWorkout();
        expect(doc.exerciseNames).toEqual({
            exercise_0: 'Bench Press',
            exercise_1: 'Cable Fly', // falls back to name when machine is absent
        });
        expect(doc.totalExercises).toBe(2);
    });

    it('snapshots originalWorkout with equipment and bodyPart per exercise', async () => {
        await saveWorkoutData(makeState());

        const [, doc] = onlySavedWorkout();
        expect(doc.originalWorkout.day).toBe('Chest – Push');
        expect(doc.originalWorkout.exercises[0]).toMatchObject({
            machine: 'Bench Press',
            equipment: 'Hammer Strength Flat',
            equipmentLocation: 'Downtown Gym',
            bodyPart: 'Chest',
        });
    });

    it('keeps pre-existing exerciseNames when there is no current workout', async () => {
        const state = makeState({ currentWorkout: null });
        state.savedData.exerciseNames = { exercise_0: 'Bench Press' };

        await saveWorkoutData(state);

        const [, doc] = onlySavedWorkout();
        expect(doc.exerciseNames).toEqual({ exercise_0: 'Bench Press' });
        expect(doc.originalWorkout).toBeUndefined();
    });
});

describe('guards and side effects', () => {
    it('saves nothing when no user is signed in', async () => {
        const state = makeState({ currentUser: null });

        const result = await saveWorkoutData(state);

        expect(result).toBeUndefined();
        expect(savedWorkouts()).toEqual([]);
    });

    it('sanitizes string fields before writing', async () => {
        const state = makeState();
        state.savedData.workoutType = '<b>Chest – Push</b>';

        await saveWorkoutData(state);

        expect(onlySavedWorkout()[1].workoutType).toBe('Chest – Push');
    });

    it('refreshes window.inProgressWorkout while the workout is in progress', async () => {
        window.inProgressWorkout = { workoutId: 'stale' };
        const state = makeState();

        await saveWorkoutData(state);

        expect(window.inProgressWorkout.workoutId).toBe(state.savedData.workoutId);
        expect(window.inProgressWorkout.version).toBe('3.0');
    });

    it('leaves window.inProgressWorkout alone once the workout is completed', async () => {
        window.inProgressWorkout = { workoutId: 'stale' };
        const state = makeState();
        state.savedData.completedAt = `${TODAY}T11:45:00.000Z`;

        await saveWorkoutData(state);

        expect(window.inProgressWorkout).toEqual({ workoutId: 'stale' });
    });
});
