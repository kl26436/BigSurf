// Withings Integration — OAuth + Weight Sync
// Connects to Withings API via Cloud Functions for body weight data

import { functions, httpsCallable } from '../data/firebase-config.js';
import { AppState } from '../utils/app-state.js';
import { showNotification } from '../ui/ui-helpers.js';
import { debugLog } from '../utils/config.js';

// Withings OAuth client ID (public — safe to include client-side)
const WITHINGS_CLIENT_ID = '332086edb8febf30285cb268783ae86686a2253dd2c2883f685963b607c21756';

// ===================================================================
// OAUTH FLOW
// ===================================================================

/**
 * Start the Withings OAuth flow.
 * Builds auth URL client-side and redirects the user to Withings.
 */
export async function connectWithings() {
    if (!AppState.currentUser) {
        showNotification('Sign in to continue', 'warning');
        return;
    }

    // Use current origin as callback URL (must match Withings dashboard)
    const callbackUrl = window.location.origin;
    const state = AppState.currentUser.uid;

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: WITHINGS_CLIENT_ID,
        redirect_uri: callbackUrl,
        scope: 'user.metrics',
        state: state,
    });

    window.location.href = `https://account.withings.com/oauth2_user/authorize2?${params.toString()}`;
}

/**
 * Handle the OAuth callback — called on app load if URL has Withings params.
 * Withings redirects back with ?code=XXX&state=XXX
 */
export async function handleWithingsCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    // Only process if we have a code and it looks like a Withings callback
    if (!code || !state) return false;

    console.log('🔗 Withings OAuth callback detected — code:', code.substring(0, 8) + '...');

    // Clean the URL immediately so it doesn't re-trigger on refresh
    const origin = url.origin;
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.pathname + url.search);

    // Store callback data — will be processed after auth is ready
    sessionStorage.setItem('withings_pending_code', code);
    sessionStorage.setItem('withings_pending_origin', origin);
    return true;
}

/**
 * Process a pending Withings callback after auth is ready.
 * Called from app initialization after user is authenticated.
 */
export async function processPendingWithingsCallback() {
    const code = sessionStorage.getItem('withings_pending_code');
    const origin = sessionStorage.getItem('withings_pending_origin');
    if (!code) return false;

    sessionStorage.removeItem('withings_pending_code');
    sessionStorage.removeItem('withings_pending_origin');

    return await exchangeWithingsCode(code, origin);
}

/**
 * Exchange the authorization code for tokens via Cloud Function.
 */
async function exchangeWithingsCode(code, callbackUrl) {
    try {
        const cbUrl = callbackUrl || window.location.origin;
        console.log('🔗 Exchanging Withings code, callback:', cbUrl);
        showNotification('Completing Withings setup…', 'info', 3000);

        const exchangeToken = httpsCallable(functions, 'withingsExchangeToken');
        const result = await exchangeToken({
            code,
            callbackUrl: cbUrl,
        });

        if (result.data?.success) {
            showNotification('Withings connected · syncing weight data…', 'success', 2000);
            // Auto-sync after connecting
            await syncWithingsWeight();
            return true;
        } else {
            showNotification("Couldn't finish Withings setup", 'error');
            return false;
        }
    } catch (error) {
        console.error('❌ Withings token exchange error:', error);
        showNotification("Couldn't connect Withings", 'error');
        return false;
    }
}

// ===================================================================
// SYNC
// ===================================================================

/**
 * Sync weight data from Withings.
 * @param {number} [days=30] - Number of days to sync
 * @param {Object} [options] - { silent: true } to suppress notifications (for auto-sync)
 */
export async function syncWithingsWeight(days = 30, options = {}) {
    if (!AppState.currentUser) return;

    const silent = options.silent || false;

    try {
        if (!silent) showNotification('Syncing from Withings…', 'info', 2000);

        const sync = httpsCallable(functions, 'withingsSyncWeight');
        const result = await sync({ days });

        if (result.data?.success) {
            // Reload in-memory settings — the Cloud Function may have written
            // profileHeightCm into preferences/settings (meastype 4) and the
            // UI reads from AppState.settings, not Firestore live.
            try {
                const { loadUserSettings } = await import('../ui/settings-ui.js');
                await loadUserSettings();
            } catch (e) {
                console.warn('Could not refresh settings after Withings sync:', e);
            }

            if (!silent) {
                const count = result.data.synced || 0;
                showNotification(
                    count > 0 ? `Synced ${count} weight entries from Withings` : 'Already up to date',
                    'success',
                    2000
                );
            }
        }
    } catch (error) {
        console.error('❌ Withings sync error:', error);
        if (!silent) {
            const msg = error.message?.includes('not connected')
                ? 'Withings not connected — tap Connect to set up'
                : 'Withings sync failed';
            showNotification(msg, 'error');
        }
    }
}

// ===================================================================
// STATUS & DISCONNECT
// ===================================================================

/**
 * Check if Withings is connected for the current user.
 * @returns {{connected: boolean, lastSync: string|null, expired: boolean}}
 */
export async function getWithingsStatus() {
    if (!AppState.currentUser) return { connected: false };

    try {
        const status = httpsCallable(functions, 'withingsStatus');
        const result = await status();
        return result.data || { connected: false };
    } catch (error) {
        console.error('❌ Withings status check error:', error);
        return { connected: false };
    }
}

/**
 * Disconnect Withings integration.
 */
export async function disconnectWithings() {
    if (!AppState.currentUser) return;

    try {
        const disconnect = httpsCallable(functions, 'withingsDisconnect');
        await disconnect();
        showNotification('Withings disconnected', 'success', 1500);
    } catch (error) {
        console.error('❌ Withings disconnect error:', error);
        showNotification("Couldn't disconnect", 'error');
    }
}

/**
 * Test that Withings secrets are configured on the server.
 */
export async function testWithingsConfig() {
    try {
        const test = httpsCallable(functions, 'withingsTestConfig');
        const result = await test();
        return result.data;
    } catch (error) {
        console.error('❌ Withings config test error:', error);
        return { configured: false, error: error.message };
    }
}
