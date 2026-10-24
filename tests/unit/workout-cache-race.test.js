// AP-15i — the post-workout "Review this session" coach read history that
// didn't include the session (specimen thread_1789446779692_zyyck8: "No Push
// session shows as logged today"). The finish-save is fire-and-forget; the
// summary modal's history read started while it was in flight, resolved
// AFTER the save had invalidated the cache, and re-pinned the pre-workout
// list for five minutes. These tests drive that exact interleaving through
// the real data-manager.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getDocs, setDoc } = vi.hoisted(() => ({ getDocs: vi.fn(), setDoc: vi.fn() }));

vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {},
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    orderBy: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    doc: vi.fn((...parts) => ({ path: parts.slice(1).join('/') })),
    getDoc: vi.fn(),
    getDocs,
    setDoc,
    deleteDoc: vi.fn(),
    updateDoc: vi.fn(),
    writeBatch: vi.fn(),
    getDocsFromServer: getDocs,
}));
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    convertWeight: vi.fn((w) => w),
    escapeHtml: vi.fn((s) => s),
}));

const { loadAllWorkouts, clearAllWorkoutsCache, saveWorkoutData, settleWorkoutSaves } =
    await import('../../js/core/data/data-manager.js');

const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
};
const snapshotOf = (docs) => ({
    forEach: (fn) => docs.forEach(d => fn({ id: d.id, data: () => d })),
    docs: docs.map(d => ({ id: d.id, data: () => d })),
});
const done = (id, date) => ({ id, date, completedAt: `${date}T18:00:00Z` });
const state = () => ({
    currentUser: { uid: 'u1' },
    savedData: { workoutType: 'Push', date: '2026-10-23', startedAt: '2026-10-23T17:00:00Z', completedAt: '2026-10-23T18:00:00Z', exercises: {} },
    exerciseUnits: {},
    globalUnit: 'lbs',
    currentWorkout: { day: 'Push', exercises: [] },
    getTodayDateString: () => '2026-10-23',
});

beforeEach(() => {
    clearAllWorkoutsCache();
    getDocs.mockReset();
    setDoc.mockReset();
    vi.stubGlobal('window', {});
});
afterEach(() => vi.unstubAllGlobals());

describe('loadAllWorkouts generation guard', () => {
    it('a read that started before an invalidation does not re-pin its stale result', async () => {
        const stale = deferred();
        getDocs.mockReturnValueOnce(stale.promise);
        const inFlight = loadAllWorkouts(state());       // summary modal's read

        clearAllWorkoutsCache();                         // the finish-save lands
        stale.resolve(snapshotOf([done('old', '2026-10-21')]));
        expect((await inFlight).map(w => w.id)).toEqual(['old']);

        getDocs.mockResolvedValueOnce(snapshotOf([done('today', '2026-10-23'), done('old', '2026-10-21')]));
        const fresh = await loadAllWorkouts(state());    // the coach's read
        expect(getDocs).toHaveBeenCalledTimes(2);
        expect(fresh.map(w => w.id)).toEqual(['today', 'old']);
    });

    it('an uninterrupted read still caches', async () => {
        getDocs.mockResolvedValueOnce(snapshotOf([done('a', '2026-10-20')]));
        await loadAllWorkouts(state());
        await loadAllWorkouts(state());
        expect(getDocs).toHaveBeenCalledTimes(1);
    });
});

describe('settleWorkoutSaves', () => {
    it('resolves immediately with nothing in flight', async () => {
        await expect(settleWorkoutSaves(10)).resolves.toBeUndefined();
    });

    it('waits for an in-flight save to land', async () => {
        const write = deferred();
        setDoc.mockReturnValueOnce(write.promise);
        const save = saveWorkoutData(state());
        let settled = false;
        const waiting = settleWorkoutSaves(5000).then(() => { settled = true; });
        await new Promise(r => setTimeout(r, 20));
        expect(settled).toBe(false);
        write.resolve();
        await waiting;
        expect(settled).toBe(true);
        expect(await save).toBe(true);
    });

    it('gives up after the timeout instead of hanging the coach', async () => {
        const write = deferred();
        setDoc.mockReturnValueOnce(write.promise);
        const save = saveWorkoutData(state());
        const t0 = Date.now();
        await settleWorkoutSaves(30);
        expect(Date.now() - t0).toBeLessThan(1000);
        write.resolve();
        await save;
    });
});
