// Delete account — core/ui/delete-account.js (launch blocker 11b)
//
// Settings → Danger zone → Delete account. Two confirmations (a destructive
// confirm sheet, then typing DELETE), then the `deleteAccount` callable does
// the actual work server-side (functions/account-deletion.js) — the client
// can't list subcollections, reach the admin-only top-level docs, or delete
// its own Auth user. On success we sign out, drop this device's offline
// Firestore cache (it still holds the deleted account's data), and reload to
// the signed-out screen.

import { db, functions, httpsCallable } from '../data/firebase-config.js';
import { AppState } from '../utils/app-state.js';
import { showNotification } from './ui-helpers.js';
import { confirmSheet, promptSheet } from './confirm-sheet.js';

export const DELETE_CONFIRM_WORD = 'DELETE';

const FIRESTORE_SDK_URL = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Drop the on-device Firestore cache (IndexedDB) so the deleted account's
 * workouts don't linger on a shared phone. terminate() is required first and
 * leaves this page's Firestore unusable, so the caller must reload after.
 * Best effort: another open tab holds the cache open (failed-precondition).
 */
export async function clearDeviceCache(loadSdk = () => import(FIRESTORE_SDK_URL)) {
    try {
        const { terminate, clearIndexedDbPersistence } = await loadSdk();
        await terminate(db);
        await clearIndexedDbPersistence(db);
        return true;
    } catch (error) {
        console.warn('⚠️ Could not clear the offline cache after account deletion:', error);
        return false;
    }
}

const reloadPage = () => window.location.reload();

/**
 * Stop this device writing before the server wipes the account: flush what's
 * queued (a few seconds at most), then take Firestore offline so a debounced
 * settings or workout save can't land under users/{uid} after the server's
 * sweep (the ID token stays valid until it expires). Returns the undo for a
 * failed deletion. Best effort — a failure here never blocks the deletion.
 */
export async function freezeFirestoreWrites(loadSdk = () => import(FIRESTORE_SDK_URL), waitMs = 4000) {
    try {
        const { waitForPendingWrites, disableNetwork, enableNetwork } = await loadSdk();
        await Promise.race([waitForPendingWrites(db), new Promise(r => setTimeout(r, waitMs))]);
        await disableNetwork(db);
        return async () => { try { await enableNetwork(db); } catch { /* reload recovers */ } };
    } catch (error) {
        console.warn('⚠️ Could not pause Firestore before account deletion:', error);
        return async () => {};
    }
}

const PROGRESS_SHEET_ID = 'delete-account-progress';

/** A sheet that stays up while the server works (toasts last 1.5 s). */
async function showProgress() {
    try {
        const { openSheet } = await import('./sheet.js');
        openSheet({
            id: PROGRESS_SHEET_ID, title: 'Deleting your account…', dismissible: false,
            bodyHTML: '<div class="empty-state-compact"><p><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Erasing your data. Keep the app open — this can take a minute.</p></div>',
        });
    } catch { /* non-DOM contexts (tests) */ }
}
async function hideProgress() {
    try {
        const { closeSheet } = await import('./sheet.js');
        closeSheet(PROGRESS_SHEET_ID, { immediate: true });
    } catch { /* non-DOM contexts (tests) */ }
}

/** Plain-language copy for a failed call (never the raw error). */
export function deleteAccountErrorMessage(error) {
    const code = String(error?.code || '').replace(/^functions\//, '');
    if (code === 'unavailable' || code === 'deadline-exceeded') {
        // The server may still be finishing; a retry is safe (it's idempotent).
        return "Couldn't reach the server — check your connection and try again";
    }
    if (code === 'unauthenticated') return 'Sign in again, then delete your account';
    if (code === 'failed-precondition') return "This account can't be deleted from the app";
    return "Couldn't finish deleting your account — try again. Some data may already be gone.";
}

let inFlight = false;

/**
 * Confirm twice, delete the account server-side, then sign out.
 * Called bare from the Settings row; tests pass the device-side steps.
 * @param {object} [deps]
 * @param {Function} [deps.clearCache]
 * @param {Function} [deps.reload]
 * @returns {Promise<boolean>} true when the account was deleted
 */
export async function confirmDeleteAccount({ clearCache = clearDeviceCache, reload = reloadPage, freeze = freezeFirestoreWrites } = {}) {
    if (inFlight) return false;
    if (!AppState.currentUser) {
        showNotification('Sign in to delete your account', 'warning');
        return false;
    }

    const confirmed = await confirmSheet({
        title: 'Delete your account?',
        message: 'Your workouts, programs, equipment, gyms, measurements, DEXA scans, ' +
            "coach conversations and settings are erased, and you're signed out. " +
            "This can't be undone — export your data first if you want a copy.",
        confirmLabel: 'Delete account',
        cancelLabel: 'Keep account',
        destructive: true,
    });
    if (!confirmed) return false;

    const typed = await promptSheet({
        title: `Type ${DELETE_CONFIRM_WORD} to delete your account`,
        message: 'This is the last step.',
        placeholder: DELETE_CONFIRM_WORD,
        confirmLabel: 'Delete account',
        cancelLabel: 'Keep account',
    });
    if (typed == null) return false;
    if (typed.trim() !== DELETE_CONFIRM_WORD) {
        showNotification(`Account kept — type ${DELETE_CONFIRM_WORD} to confirm`, 'info', 3000);
        return false;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        showNotification("You're offline — connect and try again", 'warning');
        return false;
    }

    inFlight = true;
    await showProgress();
    const unfreeze = await freeze();
    try {
        await httpsCallable(functions, 'deleteAccount', { timeout: 300000 })();
    } catch (error) {
        console.error('❌ Delete account failed:', error);
        await unfreeze();
        await hideProgress();
        showNotification(deleteAccountErrorMessage(error), 'error', 6000);
        inFlight = false;
        return false;
    }
    await hideProgress();

    showNotification('Account deleted', 'success', 3000);
    try {
        // The Auth user is already gone server-side; signing out clears the
        // local session and shows the signed-out screen.
        const { signOutUser } = await import('../app-initialization.js');
        await signOutUser();
        await clearCache();
        reload();
    } finally {
        inFlight = false;
    }
    return true;
}
