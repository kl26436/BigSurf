// Offline helpers (js/core/data/offline.js) — the error classifier, the
// local-first write settle (commitWrite) and the server-or-cache read
// (readWithCacheFallback). Pure module: no Firebase, no DOM.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    isOnline,
    isOfflineError,
    commitWrite,
    readWithCacheFallback,
    onQueuedWriteRejected,
    markServerReachable,
    markServerUnreachable,
    serverLooksReachable,
    WRITE_ACK_WAIT_MS,
    READ_WAIT_MS,
    UNREACHABLE_GRACE_MS,
} from '../../js/core/data/offline.js';

const fsError = (code, message = code) => Object.assign(new Error(message), { code });
const never = () => new Promise(() => {});

beforeEach(() => {
    markServerReachable();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('isOnline', () => {
    it('reads navigator.onLine, defaulting to online without a navigator', () => {
        expect(isOnline({ onLine: false })).toBe(false);
        expect(isOnline({ onLine: true })).toBe(true);
        expect(isOnline({})).toBe(true);
        expect(isOnline(null)).toBe(true);
    });
});

describe('isOfflineError', () => {
    it('recognises Firestore, Functions and Auth network codes', () => {
        expect(isOfflineError(fsError('unavailable'))).toBe(true);
        expect(isOfflineError(fsError('deadline-exceeded'))).toBe(true);
        expect(isOfflineError(fsError('functions/unavailable'))).toBe(true);
        expect(isOfflineError(fsError('auth/network-request-failed'))).toBe(true);
    });

    it('recognises browser fetch failures and timeouts by message', () => {
        expect(isOfflineError(new TypeError('Failed to fetch'))).toBe(true); // Chrome
        expect(isOfflineError(new TypeError('Load failed'))).toBe(true); // Safari
        expect(isOfflineError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true); // Firefox
        expect(isOfflineError(new Error('Failed to get document because the client is offline.'))).toBe(true);
        expect(isOfflineError(new Error('Operation timed out'))).toBe(true);
        expect(isOfflineError('Failed to fetch')).toBe(true);
    });

    it('does NOT treat real refusals as offline', () => {
        expect(isOfflineError(fsError('permission-denied', 'Missing or insufficient permissions.'))).toBe(false);
        expect(isOfflineError(fsError('invalid-argument', 'Unsupported field value: undefined'))).toBe(false);
        expect(isOfflineError(fsError('functions/resource-exhausted'))).toBe(false);
        // A callable reports a dropped connection as 'internal' — ambiguous on
        // its own, so callers pair it with isOnline().
        expect(isOfflineError(fsError('functions/internal', 'internal'))).toBe(false);
        expect(isOfflineError(null)).toBe(false);
        expect(isOfflineError(undefined)).toBe(false);
    });
});

describe('commitWrite', () => {
    it("resolves 'synced' when the server acknowledges", async () => {
        await expect(commitWrite(Promise.resolve(), { online: true })).resolves.toBe('synced');
    });

    it("resolves 'queued' at once when offline, without waiting for the ack", async () => {
        await expect(commitWrite(never(), { online: false })).resolves.toBe('queued');
    });

    it("resolves 'queued' after the ack wait on bad signal and marks the server unreachable", async () => {
        vi.useFakeTimers();
        const p = commitWrite(never(), { online: true });
        await vi.advanceTimersByTimeAsync(WRITE_ACK_WAIT_MS - 1);
        let settled = false;
        p.then(() => { settled = true; });
        await Promise.resolve();
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await expect(p).resolves.toBe('queued');
        expect(serverLooksReachable()).toBe(false);
    });

    it('still rejects a refusal that arrives before it counts as queued', async () => {
        const refused = Promise.reject(fsError('permission-denied'));
        await expect(commitWrite(refused, { online: true })).rejects.toMatchObject({ code: 'permission-denied' });
    });

    it('an immediate local rejection wins over queued even offline', async () => {
        const bad = Promise.reject(fsError('invalid-argument'));
        await expect(commitWrite(bad, { online: false })).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('hands a refusal AFTER queued to the late-rejection handler', async () => {
        const handler = vi.fn();
        onQueuedWriteRejected(handler);
        let reject;
        const write = new Promise((_, r) => { reject = r; });
        await expect(commitWrite(write, { online: false })).resolves.toBe('queued');
        reject(fsError('permission-denied'));
        await new Promise((r) => setTimeout(r, 0));
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ code: 'permission-denied' }));
        onQueuedWriteRejected(() => {});
    });

    it('a late ack marks the server reachable again', async () => {
        markServerUnreachable();
        let ack;
        const write = new Promise((r) => { ack = r; });
        await expect(commitWrite(write)).resolves.toBe('queued'); // default: unreachable → queued now
        expect(serverLooksReachable()).toBe(false);
        ack();
        await new Promise((r) => setTimeout(r, 0));
        expect(serverLooksReachable()).toBe(true);
    });

    it('defaults to queued-at-once while the device is offline', async () => {
        vi.stubGlobal('navigator', { onLine: false });
        await expect(commitWrite(never())).resolves.toBe('queued');
    });
});

describe('serverLooksReachable', () => {
    it('stays false for the grace period after a missed answer', () => {
        markServerUnreachable(1000);
        expect(serverLooksReachable(1000 + UNREACHABLE_GRACE_MS - 1)).toBe(false);
        expect(serverLooksReachable(1000 + UNREACHABLE_GRACE_MS)).toBe(true);
        markServerReachable();
        expect(serverLooksReachable(1001)).toBe(true);
    });
});

describe('readWithCacheFallback', () => {
    const fromServer = (value) => vi.fn(async () => value);
    const fromCache = (value) => vi.fn(async () => value);

    it('reads the server when it answers', async () => {
        const read = fromServer('server');
        const cache = fromCache('cache');
        await expect(readWithCacheFallback(read, cache, { online: true })).resolves.toBe('server');
        expect(cache).not.toHaveBeenCalled();
    });

    it('goes straight to the cache offline', async () => {
        const read = fromServer('server');
        const cache = fromCache('cache');
        await expect(readWithCacheFallback(read, cache, { online: false })).resolves.toBe('cache');
        expect(read).not.toHaveBeenCalled();
    });

    it("falls back to the cache on 'unavailable' (getDocsFromServer offline)", async () => {
        const read = vi.fn(async () => { throw fsError('unavailable', 'Failed to get documents from server.'); });
        await expect(readWithCacheFallback(read, fromCache('cache'), { online: true })).resolves.toBe('cache');
        expect(serverLooksReachable()).toBe(false);
    });

    it('falls back to the cache when the server does not answer in time', async () => {
        vi.useFakeTimers();
        const p = readWithCacheFallback(never, fromCache('cache'), { online: true });
        await vi.advanceTimersByTimeAsync(READ_WAIT_MS);
        await expect(p).resolves.toBe('cache');
    });

    it('skips the server while it recently missed an answer', async () => {
        markServerUnreachable();
        const read = fromServer('server');
        await expect(readWithCacheFallback(read, fromCache('cache'))).resolves.toBe('cache');
        expect(read).not.toHaveBeenCalled();
    });

    it('rethrows real refusals instead of hiding them behind the cache', async () => {
        const read = vi.fn(async () => { throw fsError('permission-denied'); });
        const cache = fromCache('cache');
        await expect(readWithCacheFallback(read, cache, { online: true })).rejects.toMatchObject({ code: 'permission-denied' });
        expect(cache).not.toHaveBeenCalled();
    });

    it('rethrows the original error when the cache has nothing either', async () => {
        const read = vi.fn(async () => { throw fsError('unavailable', 'server'); });
        const cache = vi.fn(async () => { throw fsError('unavailable', 'not cached'); });
        await expect(readWithCacheFallback(read, cache, { online: true })).rejects.toThrow('server');
    });
});
