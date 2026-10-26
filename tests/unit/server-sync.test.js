// @vitest-environment jsdom
// TP-6 j — coach / Sunday-roll writes reach the phone: a stamp on
// users/{uid}/meta/sync makes the app re-read its workouts from the server,
// and a re-read that fell back to the device cache stays marked stale.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ listener: null, fromServer: true, reads: 0 }));

vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {},
    doc: (...p) => ({ path: p.slice(1).join('/') }),
    onSnapshot: (ref, next) => { h.listener = next; return () => { h.listener = null; }; },
}));
vi.mock('../../js/core/data/firebase-workout-manager.js', () => ({
    FirebaseWorkoutManager: class {
        async getUserWorkoutTemplates() {
            h.reads++;
            this.lastTemplatesFromServer = h.fromServer;
            return [{ id: 'legs', name: `Leg day v${h.reads}` }];
        }
    },
}));
vi.mock('../../js/core/ui/template-selection.js', () => ({ clearSelectorCache: vi.fn(), acceptCoachTemplateRefresh: vi.fn() }));

import { refreshAfterServerWrite, ensureFreshAfterServerWrite, watchServerWrites, stopWatchingServerWrites } from '../../js/core/data/server-sync.js';
import { AppState } from '../../js/core/utils/app-state.js';

const snap = (data) => ({ exists: () => !!data, data: () => data });
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
    h.reads = 0;
    h.fromServer = true;
    stopWatchingServerWrites();
    AppState._templatesStale = false;
    AppState._templatesServerAt = '2026-10-26T10:00:00.000Z';
    AppState._weekPlan = { days: {} };
    AppState._activeProgram = { id: 'old' };
});

describe('refreshAfterServerWrite', () => {
    it('drops the cached plan and program, re-reads workouts, tells the pages', async () => {
        const seen = vi.fn();
        window.addEventListener('bigsurf:data-changed', seen);
        expect(await refreshAfterServerWrite('coach-card')).toBe(true);
        expect(AppState._weekPlan).toBeUndefined();
        expect(AppState._activeProgram).toBeUndefined();
        expect(AppState.workoutPlans[0].name).toBe('Leg day v1');
        expect(seen.mock.calls[0][0].detail).toEqual({ what: 'plan', why: 'coach-card' });
        window.removeEventListener('bigsurf:data-changed', seen);
    });

    it('a re-read that came from the device cache stays stale until one reaches the server', async () => {
        h.fromServer = false;
        expect(await refreshAfterServerWrite()).toBe(false);
        expect(AppState._templatesStale).toBe(true);
        h.fromServer = true;
        await ensureFreshAfterServerWrite();
        expect(AppState._templatesStale).toBe(false);
        expect(h.reads).toBe(2);
        await ensureFreshAfterServerWrite();
        expect(h.reads).toBe(2); // fresh: nothing to do
    });
});

describe('watchServerWrites', () => {
    it('first stamp older than the launch read: nothing; a new stamp: re-read', async () => {
        watchServerWrites('u1');
        h.listener(snap({ serverWriteAt: '2026-10-26T09:00:00.000Z' }));
        await flush();
        expect(h.reads).toBe(0);
        h.listener(snap({ serverWriteAt: '2026-10-26T11:00:00.000Z', serverWriteBy: 'coach' }));
        await flush();
        expect(h.reads).toBe(1);
    });

    it('a stamp newer than the launch read (written while the app was closed) re-reads once', async () => {
        watchServerWrites('u1');
        h.listener(snap({ serverWriteAt: '2026-10-26T12:00:00.000Z' }));
        await flush();
        expect(h.reads).toBe(1);
        h.listener(snap({ serverWriteAt: '2026-10-26T12:00:00.000Z' }));
        await flush();
        expect(h.reads).toBe(1);
    });
});
