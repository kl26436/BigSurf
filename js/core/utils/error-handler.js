// Global Error Handler - js/core/utils/error-handler.js
// Catches unhandled errors, logs them in-memory, and persists to Firestore

import { showNotification } from '../ui/ui-helpers.js';
import { AppState } from './app-state.js';

// ===================================================================
// IN-MEMORY ERROR LOG (ring buffer)
// ===================================================================

const MAX_LOG_ENTRIES = 100;
const errorLogEntries = [];
let unreadErrorCount = 0;
let onBadgeUpdate = null; // callback for UI badge

// Track errors to prevent notification spam
const errorTimestamps = [];
const MAX_ERRORS_SHOWN = 3;
const ERROR_WINDOW_MS = 5000;

/**
 * Get all logged errors (newest first).
 */
export function getErrorLog() {
    return [...errorLogEntries].reverse();
}

/**
 * Get count of unread errors since last log view.
 */
export function getUnreadErrorCount() {
    return unreadErrorCount;
}

/**
 * Mark all errors as read (called when user opens log viewer).
 */
export function markErrorsRead() {
    unreadErrorCount = 0;
    if (onBadgeUpdate) onBadgeUpdate(0);
}

/**
 * Register a callback for badge count changes.
 */
export function onErrorBadgeChange(callback) {
    onBadgeUpdate = callback;
}

/**
 * Clear all logged errors.
 */
export function clearErrorLog() {
    errorLogEntries.length = 0;
    unreadErrorCount = 0;
    if (onBadgeUpdate) onBadgeUpdate(0);
}

// ===================================================================
// CORE LOGGING
// ===================================================================

/**
 * Log an error entry to the in-memory buffer and optionally persist to Firestore.
 * @param {Object} entry
 * @param {string} entry.message - Human-readable message
 * @param {string} [entry.stack] - Stack trace
 * @param {string} [entry.source] - Where the error originated (function/module name)
 * @param {'error'|'warn'|'info'} [entry.severity] - Severity level
 * @param {boolean} [entry.shownToUser] - Whether user saw a toast
 * @param {Object} [entry.context] - Extra context (e.g., exerciseName, workoutType)
 */
function logError(entry) {
    const record = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        message: entry.message || 'Unknown error',
        stack: entry.stack || null,
        source: entry.source || null,
        severity: entry.severity || 'error',
        shownToUser: entry.shownToUser || false,
        context: entry.context || null,
        url: typeof window !== 'undefined' ? window.location.href : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    };

    // Add to ring buffer
    errorLogEntries.push(record);
    if (errorLogEntries.length > MAX_LOG_ENTRIES) {
        errorLogEntries.shift();
    }

    // Bump unread count and notify badge
    unreadErrorCount++;
    if (onBadgeUpdate) onBadgeUpdate(unreadErrorCount);

    // Persist critical errors to Firestore (non-blocking)
    if (record.severity === 'error') {
        persistErrorToFirestore(record).catch(() => {
            // Can't do much if persistence itself fails — already logged in memory
        });
    }

    return record;
}

/**
 * Public API: manually log an error from anywhere in the app.
 * Use this in catch blocks for important operations.
 */
export function captureError(error, source, context) {
    const message = error?.message || String(error);
    const stack = error?.stack || null;

    return logError({
        message,
        stack,
        source,
        severity: 'error',
        shownToUser: false,
        context,
    });
}

/**
 * Public API: log a warning (non-critical).
 */
export function captureWarning(message, source, context) {
    return logError({
        message,
        source,
        severity: 'warn',
        shownToUser: false,
        context,
    });
}

// ===================================================================
// FIRESTORE PERSISTENCE
// ===================================================================

const FIRESTORE_LOG_COLLECTION = 'errorLogs';
const MAX_FIRESTORE_LOGS = 50; // Keep last 50 in Firestore

async function persistErrorToFirestore(record) {
    if (!AppState.currentUser) return;

    try {
        const { db, doc, setDoc, collection, query, orderBy, limit, getDocs, deleteDoc } =
            await import('../data/firebase-config.js');

        const userId = AppState.currentUser.uid;
        const docId = record.id;

        // Write the error doc
        const errorRef = doc(db, 'users', userId, FIRESTORE_LOG_COLLECTION, docId);
        await setDoc(errorRef, {
            timestamp: record.timestamp,
            message: record.message,
            stack: record.stack,
            source: record.source,
            severity: record.severity,
            context: record.context,
            url: record.url,
            userAgent: record.userAgent,
        });

        // Trim old entries (keep MAX_FIRESTORE_LOGS)
        // Only run cleanup occasionally to avoid extra reads
        if (Math.random() < 0.1) {
            await trimFirestoreErrors(userId);
        }
    } catch (_) {
        // Silently fail — we still have the in-memory log
    }
}

async function trimFirestoreErrors(userId) {
    try {
        const { db, collection, query, orderBy, getDocs, deleteDoc, doc } =
            await import('../data/firebase-config.js');

        const logsRef = collection(db, 'users', userId, FIRESTORE_LOG_COLLECTION);
        const q = query(logsRef, orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);

        if (snapshot.size > MAX_FIRESTORE_LOGS) {
            const docsToDelete = snapshot.docs.slice(MAX_FIRESTORE_LOGS);
            for (const d of docsToDelete) {
                await deleteDoc(d.ref);
            }
        }
    } catch (_) {
        // Cleanup failure is not critical
    }
}

/**
 * Load persisted errors from Firestore (for viewing across sessions).
 */
export async function loadPersistedErrors() {
    if (!AppState.currentUser) return [];

    try {
        const { db, collection, query, orderBy, limit, getDocs } =
            await import('../data/firebase-config.js');

        const userId = AppState.currentUser.uid;
        const logsRef = collection(db, 'users', userId, FIRESTORE_LOG_COLLECTION);
        const q = query(logsRef, orderBy('timestamp', 'desc'), limit(MAX_FIRESTORE_LOGS));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (_) {
        return [];
    }
}

/**
 * Clear all persisted errors from Firestore.
 */
export async function clearPersistedErrors() {
    if (!AppState.currentUser) return;

    try {
        const { db, collection, query, getDocs, deleteDoc } =
            await import('../data/firebase-config.js');

        const userId = AppState.currentUser.uid;
        const logsRef = collection(db, 'users', userId, FIRESTORE_LOG_COLLECTION);
        const snapshot = await getDocs(query(logsRef));

        for (const d of snapshot.docs) {
            await deleteDoc(d.ref);
        }
    } catch (_) {
        // Best effort
    }
}

// ===================================================================
// GLOBAL ERROR HANDLER (enhanced from original)
// ===================================================================

/**
 * Global error handler for uncaught errors
 */
export function initializeErrorHandler() {
    // Handle uncaught JavaScript errors
    window.addEventListener('error', (event) => {
        console.error('❌ Uncaught error:', event.error);
        handleError(event.error, 'Unexpected error occurred', 'window.onerror');
        event.preventDefault();
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        console.error('❌ Unhandled promise rejection:', event.reason);
        handleError(event.reason, 'Operation failed', 'unhandledrejection');
        event.preventDefault();
    });

    // Handle offline/online events
    window.addEventListener('offline', () => {
        console.warn('⚠️ Lost internet connection');
        captureWarning('Device went offline', 'network');
        showNotification('You are offline. Changes will sync when reconnected.', 'warning');
    });

    window.addEventListener('online', () => {
        captureWarning('Device came back online', 'network');
        showNotification('Back online! Syncing data...', 'success');

        if (window.AppState?.currentUser) {
            // Could trigger data sync here
        }
    });
}

/**
 * Handle errors with user-friendly messages and structured logging.
 */
function handleError(error, userMessage, source) {
    const errorMessage = error?.message || '';
    const errorCode = error?.code || '';

    // Suppress certain non-critical errors from toast but STILL LOG THEM
    const isSuppressed =
        errorMessage.includes('push') ||
        errorMessage.includes('messaging') ||
        errorMessage.includes('Messaging') ||
        errorMessage.includes('getToken') ||
        errorMessage.includes('subscription') ||
        errorCode === 'messaging/unsupported-browser' ||
        errorCode === 'messaging/permission-blocked';

    if (isSuppressed) {
        // Log it but don't show toast
        logError({
            message: errorMessage || errorCode,
            stack: error?.stack,
            source: source || 'suppressed',
            severity: 'info',
            shownToUser: false,
            context: { code: errorCode, suppressed: true },
        });
        return;
    }

    // Check if we're spamming too many toasts
    const now = Date.now();
    const recentErrors = errorTimestamps.filter((time) => now - time < ERROR_WINDOW_MS);
    const canShowToast = recentErrors.length < MAX_ERRORS_SHOWN;

    if (canShowToast) {
        errorTimestamps.push(now);
    }

    // Determine severity and user-facing message
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

    // Always log, even if toast is suppressed
    logError({
        message: errorMessage || message,
        stack: error?.stack,
        source,
        severity,
        shownToUser: canShowToast && severity !== 'silent',
        context: { code: errorCode, userMessage: message },
    });

    if (severity === 'silent' || !canShowToast) {
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
            handleError(error, errorMessage, fn.name || 'withErrorHandling');
            throw error;
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
        const { collection, getDocs, limit, query } = await import('../data/firebase-config.js');
        const testQuery = query(collection(db, 'exercises'), limit(1));
        await getDocs(testQuery);
        return true;
    } catch (error) {
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
    if (connectionMonitorInterval) {
        clearInterval(connectionMonitorInterval);
    }

    checkFirebaseConnection(db).then((isConnected) => {
        updateConnectionStatus(isConnected);
    });

    connectionMonitorInterval = setInterval(async () => {
        const isConnected = await checkFirebaseConnection(db);
        updateConnectionStatus(isConnected);
    }, 30000);
}
