// @vitest-environment jsdom
// PF-2 / PF-3 / PF-4 — the launch and dashboard speed-ups: the shared session
// cache, loadAllWorkouts answering from the device first, and the generated
// modulepreload block staying in step with the import graph.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

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

import { makeSessionCache } from '../../js/core/data/session-cache.js';
import { loadAllWorkouts, clearAllWorkoutsCache, workoutsFingerprint } from '../../js/core/data/data-manager.js';
import { AppState } from '../../js/core/utils/app-state.js';
import * as firebaseConfig from '../../js/core/data/firebase-config.js';
import { rewriteIndex, staticGraph } from '../../scripts/gen-modulepreload.mjs';

const UID = 'test-user';

function putWorkout(id, date) {
    store.set(`users/${UID}/workouts/${id}`, {
        date, completedAt: `${date}T12:00:00.000Z`, cancelledAt: null, exercises: {},
    });
}

/** A device-cache snapshot holding only these workouts (what this phone had). */
function localSnapshot(workouts) {
    const docs = workouts.map(w => ({ id: w.id, data: () => ({ ...w }) }));
    return { empty: docs.length === 0, docs, forEach: (cb) => docs.forEach(cb) };
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('makeSessionCache', () => {
    it('shares one in-flight read between callers and serves the cache after', async () => {
        const cache = makeSessionCache();
        const loader = vi.fn(async () => 'data');
        const [a, b] = await Promise.all([cache.get('k', 'u', loader), cache.get('k', 'u', loader)]);
        expect([a, b]).toEqual(['data', 'data']);
        expect(await cache.get('k', 'u', loader)).toBe('data');
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it('re-reads after the TTL and for a different user', async () => {
        let t = 0;
        const cache = makeSessionCache({ ttlMs: 100, now: () => t });
        const loader = vi.fn(async () => t);
        await cache.get('k', 'u', loader);
        await cache.get('k', 'other', loader);
        t = 150;
        await cache.get('k', 'u', loader);
        expect(loader).toHaveBeenCalledTimes(3);
    });

    it('never remembers a failed read', async () => {
        const cache = makeSessionCache();
        const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok');
        await expect(cache.get('k', 'u', loader)).rejects.toThrow('offline');
        expect(await cache.get('k', 'u', loader)).toBe('ok');
    });

    it('a read that started before clear() does not re-store stale data', async () => {
        const cache = makeSessionCache();
        let release;
        const slow = cache.get('k', 'u', () => new Promise(r => { release = r; }));
        cache.clear();
        release('stale');
        await slow;
        expect(cache.peek('k', 'u')).toBeUndefined();
    });
});

describe('loadAllWorkouts — device first (PF-3)', () => {
    beforeEach(() => {
        store.clear();
        clearAllWorkoutsCache();
        AppState.currentUser = { uid: UID };
        vi.restoreAllMocks();
    });

    it('answers from the device, then refreshes and announces a change', async () => {
        putWorkout('w1', '2026-10-01');
        putWorkout('w2', '2026-10-20'); // logged on another device — not on this phone yet
        vi.spyOn(firebaseConfig, 'getDocsFromCache').mockResolvedValueOnce(
            localSnapshot([{ id: 'w1', date: '2026-10-01', completedAt: '2026-10-01T12:00:00.000Z', cancelledAt: null }]),
        );
        const changed = vi.fn();
        window.addEventListener('bigsurf:data-changed', changed);

        const first = await loadAllWorkouts(AppState);
        expect(first.map(w => w.id)).toEqual(['w1']);

        await flush(); await flush();
        expect(changed).toHaveBeenCalledTimes(1);
        expect(changed.mock.calls[0][0].detail).toEqual({ what: 'workouts' });
        expect((await loadAllWorkouts(AppState)).map(w => w.id).sort()).toEqual(['w1', 'w2']);
        window.removeEventListener('bigsurf:data-changed', changed);
    });

    it('stays quiet when the server agrees with the device', async () => {
        putWorkout('w1', '2026-10-01');
        const changed = vi.fn();
        window.addEventListener('bigsurf:data-changed', changed);
        await loadAllWorkouts(AppState);
        await flush(); await flush();
        expect(changed).not.toHaveBeenCalled();
        window.removeEventListener('bigsurf:data-changed', changed);
    });

    it('waits for the server on a first launch (nothing on the device)', async () => {
        putWorkout('w1', '2026-10-01');
        vi.spyOn(firebaseConfig, 'getDocsFromCache').mockResolvedValueOnce(localSnapshot([]));
        expect((await loadAllWorkouts(AppState)).map(w => w.id)).toEqual(['w1']);
    });

    it('fresh: true skips the device answer', async () => {
        putWorkout('w1', '2026-10-01');
        const spy = vi.spyOn(firebaseConfig, 'getDocsFromCache');
        await loadAllWorkouts(AppState, { fresh: true });
        expect(spy).not.toHaveBeenCalled();
    });

    it('fingerprint moves on a new workout and on an edit', () => {
        const a = [{ completedAt: '2026-10-01T12:00:00Z' }];
        expect(workoutsFingerprint(a)).not.toBe(workoutsFingerprint([...a, { completedAt: '2026-10-02T12:00:00Z' }]));
        expect(workoutsFingerprint(a)).not.toBe(workoutsFingerprint([{ ...a[0], lastUpdated: '2026-10-03T00:00:00Z' }]));
    });
});

describe('modulepreload block (PF-4)', () => {
    it('index.html lists the current static import graph — run `npm run build:preload`', () => {
        const html = readFileSync('index.html', 'utf8');
        expect(rewriteIndex(html)).toBe(html);
    });

    it('starts at main.js and lists dependencies before their importers', () => {
        const graph = staticGraph();
        expect(graph.at(-1)).toBe('js/main.js');
        expect(graph.indexOf('js/core/utils/config.js')).toBeLessThan(graph.indexOf('js/main.js'));
        expect(new Set(graph).size).toBe(graph.length);
    });
});
