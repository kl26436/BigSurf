// Server writes reach the phone (TP-6 j).
//
// The coach's tools and the Sunday roll write through the Admin SDK, so
// nothing on the phone knows its copies of the workouts, the week plan or the
// program are stale — the action card said "updated" while the Workouts tab
// and the Plan page kept the old rows (10/26). The server stamps
// users/{uid}/meta/sync after any such write; this listens and re-reads from
// the server. A re-read that falls back to the device cache (gym signal) is
// NOT the server's version, so it leaves AppState._templatesStale set and the
// next screen that opens asks again.

import { db, doc, onSnapshot } from './firebase-config.js';
import { AppState } from '../utils/app-state.js';
import { debugLog } from '../utils/config.js';

let _unsub = null;
let _seen = null;
let _refreshing = null;

/**
 * Drop every client copy a server write can make stale and re-read the
 * workouts from the server. Single-flight.
 * @returns {Promise<boolean>} true when the re-read reached the server
 */
export function refreshAfterServerWrite(why = 'server') {
    if (_refreshing) return _refreshing;
    _refreshing = (async () => {
        AppState._weekPlan = undefined;
        AppState._activeProgram = undefined;
        let fresh = false;
        try {
            const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
            const mgr = new FirebaseWorkoutManager(AppState);
            AppState.workoutPlans = await mgr.getUserWorkoutTemplates({ fromServer: true });
            fresh = mgr.lastTemplatesFromServer === true;
        } catch (e) { debugLog('server-sync: workouts re-read failed', e); }
        AppState._templatesStale = !fresh;
        try {
            const sel = await import('../ui/template-selection.js');
            sel.clearSelectorCache?.();
            if (fresh) sel.acceptCoachTemplateRefresh?.();
        } catch { /* the Workouts page isn't loaded yet */ }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bigsurf:data-changed', { detail: { what: 'plan', why } }));
        }
        return fresh;
    })().finally(() => { _refreshing = null; });
    return _refreshing;
}

/** Before a screen shows workouts: if the last re-read missed the server, try again. */
export async function ensureFreshAfterServerWrite() {
    if (AppState._templatesStale) await refreshAfterServerWrite('retry');
}

/** Listen for server writes while signed in (started after the first paint). */
export function watchServerWrites(uid) {
    stopWatchingServerWrites();
    if (!uid) return;
    _unsub = onSnapshot(doc(db, 'users', uid, 'meta', 'sync'), (snap) => {
        const data = snap.exists() ? snap.data() : null;
        const at = data?.serverWriteAt || null;
        if (!at) return;
        if (_seen === null) {
            _seen = at;
            // Written while the app was closed, after the launch read? (Or the
            // launch read came from the device cache.) Re-read once.
            if (!AppState._templatesServerAt || at > AppState._templatesServerAt) refreshAfterServerWrite('launch');
            return;
        }
        if (at !== _seen) {
            _seen = at;
            refreshAfterServerWrite(data.serverWriteBy || 'server');
        }
    }, (err) => debugLog('server-sync: listener error', err));
}

export function stopWatchingServerWrites() {
    if (_unsub) _unsub();
    _unsub = null;
    _seen = null;
}
