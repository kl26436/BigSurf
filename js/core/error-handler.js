// Global Error Handler - js/core/error-handler.js
// Catches unhandled errors and provides better UX

import { showNotification } from './ui-helpers.js';

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
    // Check if we're spamming too many errors
    const now = Date.now();
    const recentErrors = errorLog.filter(time => now - time < ERROR_WINDOW_MS);

    if (recentErrors.length >= MAX_ERRORS_SHOWN) {
        console.warn('⚠️ Too many errors, suppressing notification');
        return;
    }

    errorLog.push(now);

    // Determine error type and show appropriate message
    let message = userMessage;
    let type = 'error';

    if (error?.code === 'permission-denied') {
        message = 'Permission denied. Please try signing out and back in.';
    } else if (error?.code === 'unavailable') {
        message = 'Cannot connect to server. Check your internet connection.';
        type = 'warning';
    } else if (error?.code === 'not-found') {
        message = 'Data not found. It may have been deleted.';
    } else if (error?.message?.includes('Firebase')) {
        message = 'Database error. Your data is safe, please try again.';
    } else if (error?.message?.includes('network')) {
        message = 'Network error. Check your connection and try again.';
        type = 'warning';
    }

    showNotification(message, type);
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling(fn, errorMessage = 'Operation failed') {
    return async function(...args) {
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
        const { collection, getDocs, limit, query } = await import('../core/firebase-config.js');
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
export function startConnectionMonitoring(db) {
    // Initial check
    checkFirebaseConnection(db).then(isConnected => {
        updateConnectionStatus(isConnected);
    });

    // Check every 30 seconds
    setInterval(async () => {
        const isConnected = await checkFirebaseConnection(db);
        updateConnectionStatus(isConnected);
    }, 30000);
}
