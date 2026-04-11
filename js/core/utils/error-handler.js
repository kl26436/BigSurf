// Global Error Handler - js/core/error-handler.js
// Catches unhandled errors and provides better UX

import { showNotification } from '../ui/ui-helpers.js';

// Track errors to prevent spam
const errorLog = [];
const MAX_ERRORS_SHOWN = 3;
const ERROR_WINDOW_MS = 5000;

/**
 * Global error handler for uncaught errors
 */
export function initializeErrorHandler() {
    // Handle uncaught JavaScript errors
    window.addEventListener('error', (event) => {
        console.error('❌ Uncaught error:', event.error);
        handleError(event.error, 'Unexpected error occurred');

        // Prevent default browser error display
        event.preventDefault();
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        console.error('❌ Unhandled promise rejection:', event.reason);
        handleError(event.reason, 'Operation failed');

        // Prevent default browser error display
        event.preventDefault();
    });

    // Handle offline/online events
    window.addEventListener('offline', () => {
        console.warn('⚠️ Lost internet connection');
        showNotification('You are offline. Changes will sync when reconnected.', 'warning');
    });

    window.addEventListener('online', () => {
        showNotification('Back online! Syncing data...', 'success');

        // Trigger data sync if needed
        if (window.AppState?.currentUser) {
        }
    });
}

/**
 * Handle errors with user-friendly messages
 */
function handleError(error, userMessage) {
    // Suppress certain non-critical errors
    const errorMessage = error?.message || '';
    const errorCode = error?.code || '';

    // Don't show errors for:
    // - Push notification failures (not critical)
    // - Firebase messaging not supported (expected on some browsers)
    // - Network errors when app is being suspended
    if (
        errorMessage.includes('push') ||
        errorMessage.includes('messaging') ||
        errorMessage.includes('Messaging') ||
        errorMessage.includes('getToken') ||
        errorMessage.includes('subscription') ||
        errorCode === 'messaging/unsupported-browser' ||
        errorCode === 'messaging/permission-blocked'
    ) {
        console.warn('⚠️ Suppressed non-critical notification error:', errorMessage);
        return;
    }

    // Check if we're spamming too many errors
    const now = Date.now();
    const recentErrors = errorLog.filter((time) => now - time < ERROR_WINDOW_MS);

    if (recentErrors.length >= MAX_ERRORS_SHOWN) {
        console.warn('⚠️ Too many errors, suppressing notification');
        return;
    }

    errorLog.push(now);

    // Determine severity and user-facing message
    // 'silent' — log only, no toast
    // 'warn' — subtle dismissible toast
    // 'error' — prominent toast
    let message = userMessage;
    let severity = 'error';

    if (error?.code === 'permission-denied') {
        message = 'Please sign in again to continue.';
    } else if (error?.code === 'unavailable' || error?.message?.includes('timeout') || error?.message?.includes('timed out')) {
        message = 'Slow connection — saving will retry automatically.';
        severity = 'warn';
    } else if (error?.code === 'not-found') {
        message = 'Data not found. It may have been deleted.';
    } else if (error?.message?.includes('Firebase') || error?.message?.includes('firestore')) {
        message = 'Slow connection — saving will retry automatically.';
        severity = 'warn';
    } else if (error?.message?.includes('network') || error?.message?.includes('Network')) {
        message = 'Having trouble connecting. Your data will save when you\'re back online.';
        severity = 'warn';
    } else if (error?.message?.includes('Load failed') || error?.message?.includes('fetch')) {
        message = 'Couldn\'t load your data. Pull down to refresh.';
        severity = 'warn';
    }

    if (severity === 'silent') {
        return;
    }

    showNotification(message, severity === 'warn' ? 'warning' : 'error');
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling(fn, errorMessage = 'Operation failed') {
    return async function (...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            console.error(`❌ Error in ${fn.name}:`, error);
            handleError(error, errorMessage);
            throw error; // Re-throw for caller to handle if needed
        }
    };
}

/**
 * Check if browser is online
 */
export function isOnline() {
    return navigator.onLine;
}

/**
 * Check Firebase connectivity
 */
export async function checkFirebaseConnection(db) {
    try {
        // Try to read from a test collection
        const { collection, getDocs, limit, query } = await import('../data/firebase-config.js');
        const testQuery = query(collection(db, 'exercises'), limit(1));
        await getDocs(testQuery);
        return true;
    } catch (error) {
        // Permission denied is expected when not signed in
        if (error.code === 'permission-denied') {
            return false;
        }
        console.error('Firebase connectivity check failed:', error);
        return false;
    }
}

/**
 * Show connection status in UI
 */
export function updateConnectionStatus(isConnected) {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;

    if (isConnected) {
        statusEl.classList.remove('offline');
        statusEl.classList.add('online');
        statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
    } else {
        statusEl.classList.remove('online');
        statusEl.classList.add('offline');
        statusEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Offline';
    }
}

/**
 * Monitor connection status
 */
let connectionMonitorInterval = null;

export function startConnectionMonitoring(db) {
    // Clear any existing monitor to prevent stacking
    if (connectionMonitorInterval) {
        clearInterval(connectionMonitorInterval);
    }

    // Initial check
    checkFirebaseConnection(db).then((isConnected) => {
        updateConnectionStatus(isConnected);
    });

    // Check every 30 seconds
    connectionMonitorInterval = setInterval(async () => {
        const isConnected = await checkFirebaseConnection(db);
        updateConnectionStatus(isConnected);
    }, 30000);
}
