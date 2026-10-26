// Tests for getLastSessionDefaults in data-manager.js — the history lookup
// behind the active-workout "Last:" card and prefilled rows. Real module;
// firebase-config is the shared in-memory mock, ui-helpers is stubbed.

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

import { getLastSessionDefaults, clearLastSessionCache, clearAllWorkoutsCache } from '../../js/core/data/data-manager.js';
import { AppState } from '../../js/core/utils/app-state.js';
import * as firebaseConfig from '../../js/core/data/firebase-config.js';

const UID = 'test-user';

function putWorkout(id, { date, location = 'Downtown Gym', equipment, equipmentId, weight, sessionLabel }) {
    store.set(`users/${UID}/workouts/${id}`, {
        date,
        ...(sessionLabel ? { sessionLabel } : {}),
        completedAt: `${date}T12:00:00.000Z`,
        cancelledAt: null,
        location,
        exerciseNames: { exercise_0: 'Incline Press' },
        exercises: {
            exercise_0: {
                equipment,
                ...(equipmentId ? { equipmentId } : {}),
                sets: [{ reps: 10, weight, originalUnit: 'lbs', completed: true }],
            },
        },
    });
}

beforeEach(() => {
    store.clear();
    clearLastSessionCache();
    clearAllWorkoutsCache();
    AppState.currentUser = { uid: UID };
});

describe('getLastSessionDefaults', () => {
    it('matches equipment ignoring case and whitespace', async () => {
        putWorkout('w2', { date: '2026-10-20', equipment: 'Other Machine', weight: 50 });
        putWorkout('w1', { date: '2026-10-10', equipment: 'Hammer Strength Incline', weight: 180 });
        const last = await getLastSessionDefaults('Incline Press', '  hammer strength incline ', 'Downtown Gym');
        expect(last.equipment).toBe('Hammer Strength Incline');
        expect(last.sets[0].weight).toBe(180);
    });

    it('matches by equipment id when the machine was renamed', async () => {
        putWorkout('w2', { date: '2026-10-20', equipment: 'Other Machine', equipmentId: 'eq_other', weight: 50 });
        putWorkout('w1', { date: '2026-10-10', equipment: 'Old Name', equipmentId: 'eq_1', weight: 180 });
        const last = await getLastSessionDefaults('Incline Press', 'New Name', 'Downtown Gym', 'eq_1');
        expect(last.equipmentId).toBe('eq_1');
        expect(last.sets[0].weight).toBe(180);
    });

    it('falls back to another machine at the gym and says which', async () => {
        putWorkout('w1', { date: '2026-10-10', equipment: 'Hammer Strength Incline', equipmentId: 'eq_1', weight: 180 });
        const last = await getLastSessionDefaults('Incline Press', 'Brand New Machine', 'Downtown Gym', 'eq_new');
        expect(last.equipment).toBe('Hammer Strength Incline');
        expect(last.equipmentId).toBe('eq_1');
    });

    it('preferBuild skips a deload session when a build session exists', async () => {
        putWorkout('w2', { date: '2026-10-21', equipment: 'Hammer Strength Incline', weight: 120, sessionLabel: 'Deload' });
        putWorkout('w1', { date: '2026-10-14', equipment: 'Hammer Strength Incline', weight: 180 });
        const plain = await getLastSessionDefaults('Incline Press', 'Hammer Strength Incline', 'Downtown Gym');
        expect(plain.sets[0].weight).toBe(120);
        expect(plain.recovery).toBe(true);
        clearLastSessionCache();
        const build = await getLastSessionDefaults('Incline Press', 'Hammer Strength Incline', 'Downtown Gym', null, { preferBuild: true });
        expect(build.sets[0].weight).toBe(180);
        expect(build.recovery).toBe(false);
    });

    it('preferBuild still falls back to a deload session when it is all there is', async () => {
        putWorkout('w2', { date: '2026-10-21', equipment: 'Hammer Strength Incline', weight: 120, sessionLabel: 'Deload' });
        const last = await getLastSessionDefaults('Incline Press', 'Hammer Strength Incline', 'Downtown Gym', null, { preferBuild: true });
        expect(last.sets[0].weight).toBe(120);
        expect(last.recovery).toBe(true);
    });
});

describe('getLastSessionDefaults — tier, name matching, cache (AP-3)', () => {
    it('reports which tier matched, most specific first', async () => {
        putWorkout('w3', { date: '2026-10-20', location: 'Uptown Gym', equipment: 'Other Machine', weight: 60 });
        putWorkout('w2', { date: '2026-10-15', location: 'Uptown Gym', equipment: 'Hammer Strength Incline', weight: 170 });
        putWorkout('w1', { date: '2026-10-10', equipment: 'Hammer Strength Incline', weight: 180 });
        expect((await getLastSessionDefaults('Incline Press', 'Hammer Strength Incline', 'Downtown Gym')).tier).toBe('exact');
        expect((await getLastSessionDefaults('Incline Press', 'Hammer Strength Incline', 'Elsewhere')).tier).toBe('equipment');
        expect((await getLastSessionDefaults('Incline Press', 'Brand New', 'Uptown Gym')).tier).toBe('location');
        expect((await getLastSessionDefaults('Incline Press', 'Brand New', 'Elsewhere')).tier).toBe('name');
    });

    it('matches the exercise name ignoring case and whitespace', async () => {
        putWorkout('w1', { date: '2026-10-10', equipment: 'Hammer Strength Incline', weight: 180 });
        const last = await getLastSessionDefaults('  incline PRESS ', 'Hammer Strength Incline', 'downtown gym');
        expect(last).toMatchObject({ tier: 'exact', equipment: 'Hammer Strength Incline' });
    });

    it('says when the answer came from the session cache', async () => {
        putWorkout('w1', { date: '2026-10-10', equipment: 'Hammer Strength Incline', weight: 180 });
        expect((await getLastSessionDefaults('Incline Press', 'Hammer Strength Incline', 'Downtown Gym')).cacheHit).toBe(false);
        expect((await getLastSessionDefaults('Incline Press', 'Hammer Strength Incline', 'Downtown Gym')).cacheHit).toBe(true);
    });

    it('D9: a failed history read is not cached as "no history"', async () => {
        putWorkout('w1', { date: '2026-10-10', equipment: 'Hammer Strength Incline', weight: 180 });
        // PF-3: the history read answers from the device cache first — empty
        // that step too so the server failure is what the call sees.
        const cacheSpy = vi.spyOn(firebaseConfig, 'getDocsFromCache').mockRejectedValueOnce(new Error('no cache'));
        const spy = vi.spyOn(firebaseConfig, 'getDocs').mockRejectedValueOnce(new Error('offline'));
        expect(await getLastSessionDefaults('Incline Press', 'Hammer Strength Incline', 'Downtown Gym')).toBeNull();
        spy.mockRestore();
        cacheSpy.mockRestore();
        const retry = await getLastSessionDefaults('Incline Press', 'Hammer Strength Incline', 'Downtown Gym');
        expect(retry).toMatchObject({ tier: 'exact', cacheHit: false });
        expect(retry.sets[0].weight).toBe(180);
    });
});
