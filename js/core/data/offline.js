// Offline helpers — js/core/data/offline.js
//
// Gyms have bad signal. With Firestore's persistent cache on (firebase-config.js)
// a write lands in the local cache the moment it's issued, but the promise the
// SDK hands back only settles when the SERVER acknowledges it. Offline that's
// "never", so every `await setDoc(...)` used to hang (or time out into a
// "Couldn't save" toast) even though the data was safe on the device.
//
// These helpers say what the app means instead: a write is done once it's
// saved locally, and a read that can't reach the server uses the cache.
//
// PURE — no Firebase import. firebase-config.js wraps the SDK writes with
// commitWrite; data modules pass their own read functions to
// readWithCacheFallback. That keeps this file importable from tests, the
// error handler and the coach UI without pulling the SDK.

/** How long an online write waits for the server's ack before it counts as queued. */
export const WRITE_ACK_WAIT_MS = 5000;

/** How long an online read waits for the server before falling back to the cache. */
export const READ_WAIT_MS = 10000;

/** navigator.onLine, defaulting to online where there's no navigator (node, tests). */
export function isOnline(nav = globalThis.navigator) {
    return !nav || nav.onLine !== false;
}

// Firestore / Functions / Auth codes that mean "couldn't reach the server",
// not "the server said no". Functions codes arrive prefixed ('functions/…').
const OFFLINE_CODES = new Set([
    'unavailable',
    'deadline-exceeded',
    'functions/unavailable',
    'functions/deadline-exceeded',
    'auth/network-request-failed',
]);

// Messages browsers and the SDKs use for the same thing. Chrome: "Failed to
// fetch"; Safari: "Load failed"; Firefox: "NetworkError when attempting…";
// Firestore: "…because the client is offline"; ours: "Operation timed out".
const OFFLINE_MESSAGE = /client is offline|failed to fetch|load failed|networkerror|network error|network request failed|timed out/i;

/**
 * True when an error means the device couldn't reach the server (offline,
 * dead signal, no answer in time) — as opposed to a real refusal like
 * permission-denied or invalid data, which must still surface.
 */
export function isOfflineError(err) {
    if (!err) return false;
    const code = String(err.code || '').toLowerCase();
    if (OFFLINE_CODES.has(code)) return true;
    const message = typeof err === 'string' ? err : String(err.message || '');
    return OFFLINE_MESSAGE.test(message);
}

/** A promise that rejects with the app's standard timeout error after `ms`. */
function deadline(ms) {
    let timer;
    const promise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Operation timed out')), ms);
    });
    return { promise, cancel: () => clearTimeout(timer) };
}

// ---- Bad signal ("lie-fi") ------------------------------------------------
// navigator.onLine stays true on a gym's captive Wi-Fi or one bar of LTE, so
// it can't be the only test. Once the server misses an answer, treat it as
// unreachable for a while: writes count as queued at once and reads go to
// the cache, instead of every save and read paying the full wait again. The
// next write the server DOES ack (they keep syncing in the background) or
// the browser's 'online' event clears it; so does the grace period running out.

/** How long a missed server answer keeps the app in "use the device" mode. */
export const UNREACHABLE_GRACE_MS = 60000;
let unreachableSince = 0;

export function markServerUnreachable(now = Date.now()) {
    unreachableSince = now;
}
export function markServerReachable() {
    unreachableSince = 0;
}
/** False for UNREACHABLE_GRACE_MS after the server last missed an answer. */
export function serverLooksReachable(now = Date.now()) {
    return !unreachableSince || now - unreachableSince >= UNREACHABLE_GRACE_MS;
}
/** Worth asking the server: the device is online and the server answered recently. */
function shouldTryServer() {
    return isOnline() && serverLooksReachable();
}

let lateWriteHandler = (err) => console.error('❌ Queued write was rejected by the server:', err);

/**
 * Who hears about a write that resolved as 'queued' and was later REJECTED
 * by the server (e.g. a rules violation once the device reconnects). The
 * error handler installs one that logs it and tells the user.
 */
export function onQueuedWriteRejected(handler) {
    if (typeof handler === 'function') lateWriteHandler = handler;
}

/**
 * Settle a Firestore write the way the app means it.
 *
 *   'synced' — the server acknowledged it.
 *   'queued' — saved locally; it syncs when the connection is back. Returned
 *              at once when the device is offline (or the server missed an
 *              answer recently), or after `timeoutMs` with no ack. The SDK keeps retrying on its own, so
 *              there is nothing for the caller to retry.
 *
 * Rejects only when the write is refused before it counts as queued (bad
 * data, permission-denied while online). A refusal after that goes to the
 * onQueuedWriteRejected handler instead of a caller that has moved on.
 *
 * @param {Promise<unknown>} write - the SDK's write promise
 * @param {{timeoutMs?: number, online?: boolean}} [opts]
 * @returns {Promise<'synced'|'queued'>}
 */
export function commitWrite(write, { timeoutMs = WRITE_ACK_WAIT_MS, online = shouldTryServer() } = {}) {
    return new Promise((resolve, reject) => {
        let answered = false;
        let timer = null;
        const answer = (fn, value) => {
            if (answered) return;
            answered = true;
            if (timer) clearTimeout(timer);
            fn(value);
        };

        Promise.resolve(write).then(
            () => {
                // An ack — even a late one — proves the server is back.
                markServerReachable();
                answer(resolve, 'synced');
            },
            (err) => {
                // A refusal is an answer too (permission-denied, bad data).
                if (!isOfflineError(err)) markServerReachable();
                if (answered) lateWriteHandler(err);
                else answer(reject, err);
            },
        );

        if (!online) {
            // Let an immediate local rejection (a rejected promise handed in)
            // win over 'queued' — it's checked on the microtask queue first.
            Promise.resolve().then(() => answer(resolve, 'queued'));
            return;
        }
        timer = setTimeout(() => {
            markServerUnreachable();
            answer(resolve, 'queued');
        }, timeoutMs);
    });
}

/**
 * Read from the server when possible, from the local cache when not.
 *
 * Offline, or the server missed an answer recently → straight to the cache
 * (no 10 s wait for a server that isn't there). Otherwise → `read()`, falling back to `readCache()` when it fails for
 * a network reason or doesn't answer within `timeoutMs`. Other errors
 * (permission-denied…) are rethrown, and so is the ORIGINAL error if the
 * cache read fails too (e.g. a doc that was never cached).
 *
 * @template T
 * @param {() => Promise<T>} read - server-backed read (getDocs, getDocsFromServer…)
 * @param {() => Promise<T>} readCache - cache-only read (getDocsFromCache…)
 * @param {{timeoutMs?: number, online?: boolean}} [opts]
 * @returns {Promise<T>}
 */
export async function readWithCacheFallback(read, readCache, { timeoutMs = READ_WAIT_MS, online = shouldTryServer() } = {}) {
    if (!online) return readCache();
    const timeout = deadline(timeoutMs);
    try {
        return await Promise.race([read(), timeout.promise]);
    } catch (err) {
        if (!isOfflineError(err)) throw err;
        markServerUnreachable();
        try {
            return await readCache();
        } catch {
            throw err;
        }
    } finally {
        timeout.cancel();
    }
}

/** What a network-only feature (the coach, AI tools) says when there's no connection. */
export const NEEDS_CONNECTION_COPY = "You're offline — the coach needs a connection. Try again when you're back.";
