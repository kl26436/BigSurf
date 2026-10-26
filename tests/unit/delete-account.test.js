// Delete account client flow (launch blocker 11b) — js/core/ui/delete-account.js.
// Both confirmations must pass before the callable runs; success signs out;
// failure shows plain copy and stays signed in.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    callable: vi.fn(),
    httpsCallable: vi.fn(),
    confirmSheet: vi.fn(),
    promptSheet: vi.fn(),
    showNotification: vi.fn(),
    signOutUser: vi.fn(),
    AppState: { currentUser: { uid: 'u1' } },
}));

vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: { name: 'db' },
    functions: { name: 'functions' },
    httpsCallable: h.httpsCallable,
}));
vi.mock('../../js/core/utils/app-state.js', () => ({ AppState: h.AppState }));
vi.mock('../../js/core/ui/ui-helpers.js', () => ({ showNotification: h.showNotification }));
vi.mock('../../js/core/ui/confirm-sheet.js', () => ({ confirmSheet: h.confirmSheet, promptSheet: h.promptSheet }));
vi.mock('../../js/core/app-initialization.js', () => ({ signOutUser: h.signOutUser }));

const { confirmDeleteAccount, deleteAccountErrorMessage, clearDeviceCache, freezeFirestoreWrites } = await import('../../js/core/ui/delete-account.js');

beforeEach(() => {
    vi.clearAllMocks();
    h.AppState.currentUser = { uid: 'u1' };
    h.httpsCallable.mockReturnValue(h.callable);
    h.callable.mockResolvedValue({ data: { success: true } });
    h.confirmSheet.mockResolvedValue(true);
    h.promptSheet.mockResolvedValue('DELETE');
    h.signOutUser.mockResolvedValue();
});

describe('confirmDeleteAccount', () => {
    it('uses a destructive confirm whose buttons name the action', async () => {
        await confirmDeleteAccount({ clearCache: vi.fn(), reload: vi.fn() });
        const opts = h.confirmSheet.mock.calls[0][0];
        expect(opts.destructive).toBe(true);
        expect(opts.title).toBe('Delete your account?');
        expect(opts.confirmLabel).toBe('Delete account');
        expect(opts.cancelLabel).toBe('Keep account');
        expect(opts.message).toMatch(/can't be undone/);
    });

    it('stops at the first confirm', async () => {
        h.confirmSheet.mockResolvedValue(false);
        expect(await confirmDeleteAccount()).toBe(false);
        expect(h.promptSheet).not.toHaveBeenCalled();
        expect(h.callable).not.toHaveBeenCalled();
    });

    it('stops when the typed confirmation is cancelled or wrong', async () => {
        h.promptSheet.mockResolvedValue(null);
        expect(await confirmDeleteAccount()).toBe(false);
        h.promptSheet.mockResolvedValue('delete');
        expect(await confirmDeleteAccount()).toBe(false);
        expect(h.callable).not.toHaveBeenCalled();
        expect(h.signOutUser).not.toHaveBeenCalled();
    });

    it('calls deleteAccount with no payload, signs out, clears the device cache, reloads', async () => {
        const order = [];
        h.signOutUser.mockImplementation(async () => { order.push('signOut'); });
        const clearCache = vi.fn(async () => { order.push('clearCache'); });
        const reload = vi.fn(() => { order.push('reload'); });
        expect(await confirmDeleteAccount({ clearCache, reload })).toBe(true);
        expect(order).toEqual(['signOut', 'clearCache', 'reload']);
        expect(h.httpsCallable).toHaveBeenCalledWith({ name: 'functions' }, 'deleteAccount', expect.any(Object));
        // nothing about the user is sent — the server uses the caller's auth uid
        expect(h.callable).toHaveBeenCalledWith();
        expect(h.signOutUser).toHaveBeenCalledTimes(1);
        expect(h.showNotification).toHaveBeenCalledWith('Account deleted', 'success', expect.any(Number));
    });

    it('stays signed in and shows plain copy when the call fails', async () => {
        const clearCache = vi.fn();
        const reload = vi.fn();
        h.callable.mockRejectedValue(Object.assign(new Error('INTERNAL raw'), { code: 'functions/internal' }));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await confirmDeleteAccount({ clearCache, reload })).toBe(false);
        errSpy.mockRestore();
        expect(h.signOutUser).not.toHaveBeenCalled();
        expect(clearCache).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
        const [msg, type] = h.showNotification.mock.calls.at(-1);
        expect(type).toBe('error');
        expect(msg).not.toMatch(/INTERNAL/);
        expect(msg).toMatch(/try again/);
    });

    it('pauses Firestore writes before the call, and resumes them when the call fails', async () => {
        const order = [];
        const unfreeze = vi.fn(async () => { order.push('unfreeze'); });
        const freeze = vi.fn(async () => { order.push('freeze'); return unfreeze; });
        h.callable.mockImplementation(async () => { order.push('call'); throw Object.assign(new Error('x'), { code: 'functions/internal' }); });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await confirmDeleteAccount({ clearCache: vi.fn(), reload: vi.fn(), freeze })).toBe(false);
        errSpy.mockRestore();
        expect(order).toEqual(['freeze', 'call', 'unfreeze']);
    });

    it('freezeFirestoreWrites flushes, then disables the network; its undo re-enables it', async () => {
        const sdk = { waitForPendingWrites: vi.fn(async () => {}), disableNetwork: vi.fn(async () => {}), enableNetwork: vi.fn(async () => {}) };
        const undo = await freezeFirestoreWrites(async () => sdk, 10);
        expect(sdk.waitForPendingWrites).toHaveBeenCalledWith({ name: 'db' });
        expect(sdk.disableNetwork).toHaveBeenCalledWith({ name: 'db' });
        await undo();
        expect(sdk.enableNetwork).toHaveBeenCalledWith({ name: 'db' });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const noop = await freezeFirestoreWrites(async () => { throw new Error('no sdk'); });
        warn.mockRestore();
        await expect(noop()).resolves.toBeUndefined();
    });

    it('does nothing when signed out', async () => {
        h.AppState.currentUser = null;
        expect(await confirmDeleteAccount()).toBe(false);
        expect(h.confirmSheet).not.toHaveBeenCalled();
    });
});

describe('clearDeviceCache', () => {
    it('terminates Firestore before clearing its IndexedDB cache', async () => {
        const order = [];
        const sdk = {
            terminate: vi.fn(async (db) => { order.push(['terminate', db.name]); }),
            clearIndexedDbPersistence: vi.fn(async (db) => { order.push(['clear', db.name]); }),
        };
        expect(await clearDeviceCache(async () => sdk)).toBe(true);
        expect(order).toEqual([['terminate', 'db'], ['clear', 'db']]);
    });

    it('is best effort (another tab holding the cache)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const sdk = {
            terminate: async () => {},
            clearIndexedDbPersistence: async () => { throw Object.assign(new Error('open elsewhere'), { code: 'failed-precondition' }); },
        };
        expect(await clearDeviceCache(async () => sdk)).toBe(false);
        warn.mockRestore();
    });
});

describe('deleteAccountErrorMessage', () => {
    it('maps callable codes to plain copy', () => {
        expect(deleteAccountErrorMessage({ code: 'functions/unavailable' })).toMatch(/connection/);
        expect(deleteAccountErrorMessage({ code: 'functions/failed-precondition' })).toMatch(/can't be deleted/);
        expect(deleteAccountErrorMessage({ code: 'functions/unauthenticated' })).toMatch(/Sign in again/);
        expect(deleteAccountErrorMessage(new Error('x'))).toMatch(/Some data may already be gone/);
    });
});
