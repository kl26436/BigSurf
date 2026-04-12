// Error Log UI - core/ui/error-log-ui.js
// In-app error log viewer for debugging at the gym

import { escapeHtml } from './ui-helpers.js';
import {
    getErrorLog,
    getUnreadErrorCount,
    markErrorsRead,
    clearErrorLog,
    loadPersistedErrors,
    clearPersistedErrors,
    onErrorBadgeChange,
} from '../utils/error-handler.js';

// ===================================================================
// BADGE MANAGEMENT
// ===================================================================

/**
 * Initialize the error badge listener.
 * Call once at app startup (after DOM ready).
 */
export function initErrorBadge() {
    onErrorBadgeChange(updateBadge);
    // Set initial state
    updateBadge(getUnreadErrorCount());
}

function updateBadge(count) {
    const badge = document.getElementById('error-log-badge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ===================================================================
// ERROR LOG MODAL
// ===================================================================

let showingPersisted = false;
let persistedErrors = [];

/**
 * Open the error log viewer modal.
 */
export async function showErrorLog() {
    showingPersisted = false;
    persistedErrors = [];
    markErrorsRead();

    const modal = document.getElementById('error-log-modal');
    if (!modal) return;

    renderErrorLogContent();

    // Open as dialog
    if (modal.showModal) {
        modal.showModal();
    } else {
        modal.classList.remove('hidden');
    }
}

/**
 * Close the error log modal.
 */
export function closeErrorLog() {
    const modal = document.getElementById('error-log-modal');
    if (!modal) return;

    if (modal.close) {
        modal.close();
    } else {
        modal.classList.add('hidden');
    }
}

/**
 * Toggle between current-session and persisted (Firestore) errors.
 */
export async function toggleErrorLogSource() {
    showingPersisted = !showingPersisted;

    if (showingPersisted && persistedErrors.length === 0) {
        // Show loading state
        const list = document.getElementById('error-log-list');
        if (list) list.innerHTML = '<div class="error-log-empty">Loading saved errors...</div>';

        persistedErrors = await loadPersistedErrors();
    }

    renderErrorLogContent();
}

/**
 * Clear all errors (both in-memory and Firestore).
 */
export async function clearAllErrors() {
    clearErrorLog();
    await clearPersistedErrors();
    persistedErrors = [];
    renderErrorLogContent();
}

/**
 * Copy all visible errors to clipboard for sharing/debugging.
 */
export async function copyErrorLog() {
    const errors = showingPersisted ? persistedErrors : getErrorLog();
    if (errors.length === 0) return;

    const text = errors.map(e => {
        const time = new Date(e.timestamp).toLocaleString();
        let line = `[${e.severity?.toUpperCase() || 'ERROR'}] ${time}\n  ${e.message}`;
        if (e.source) line += `\n  Source: ${e.source}`;
        if (e.stack) line += `\n  Stack: ${e.stack.split('\n').slice(0, 3).join('\n    ')}`;
        if (e.context) line += `\n  Context: ${JSON.stringify(e.context)}`;
        return line;
    }).join('\n\n');

    try {
        await navigator.clipboard.writeText(text);
        const btn = document.getElementById('error-log-copy-btn');
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied';
            setTimeout(() => { btn.innerHTML = orig; }, 1500);
        }
    } catch (_) {
        // Fallback: select text in a textarea
    }
}

// ===================================================================
// RENDERING
// ===================================================================

function renderErrorLogContent() {
    const list = document.getElementById('error-log-list');
    const sessionBtn = document.getElementById('error-log-session-btn');
    const savedBtn = document.getElementById('error-log-saved-btn');

    if (!list) return;

    // Update tab buttons
    if (sessionBtn) sessionBtn.classList.toggle('active', !showingPersisted);
    if (savedBtn) savedBtn.classList.toggle('active', showingPersisted);

    const errors = showingPersisted ? persistedErrors : getErrorLog();

    if (errors.length === 0) {
        list.innerHTML = `
            <div class="error-log-empty">
                <i class="fas fa-check-circle"></i>
                <p>${showingPersisted ? 'No saved errors' : 'No errors this session'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = errors.map(renderErrorEntry).join('');
}

function renderErrorEntry(entry) {
    const time = new Date(entry.timestamp);
    const timeStr = formatErrorTime(time);
    const severityClass = entry.severity === 'error' ? 'error-severity-error'
        : entry.severity === 'warn' ? 'error-severity-warn'
        : 'error-severity-info';

    const severityLabel = entry.severity === 'error' ? 'ERR'
        : entry.severity === 'warn' ? 'WARN'
        : 'INFO';

    const source = entry.source ? escapeHtml(entry.source) : '';
    const message = escapeHtml(entry.message || 'Unknown error');
    const hasDetails = entry.stack || entry.context;

    let detailsHtml = '';
    if (hasDetails) {
        const stackHtml = entry.stack
            ? `<div class="error-stack"><pre>${escapeHtml(entry.stack)}</pre></div>`
            : '';
        const contextHtml = entry.context
            ? `<div class="error-context"><strong>Context:</strong> <code>${escapeHtml(JSON.stringify(entry.context, null, 2))}</code></div>`
            : '';

        detailsHtml = `
            <div class="error-details hidden" id="error-detail-${entry.id}">
                ${stackHtml}
                ${contextHtml}
            </div>
        `;
    }

    const expandBtn = hasDetails
        ? `<button class="error-expand-btn" onclick="toggleErrorDetail('${entry.id}')"><i class="fas fa-chevron-down"></i></button>`
        : '';

    const shownIcon = entry.shownToUser
        ? '<span class="error-shown-badge" title="Shown to user"><i class="fas fa-eye"></i></span>'
        : '<span class="error-hidden-badge" title="Silent — not shown to user"><i class="fas fa-eye-slash"></i></span>';

    return `
        <div class="error-log-entry ${severityClass}">
            <div class="error-log-header">
                <span class="error-severity-tag ${severityClass}">${severityLabel}</span>
                <span class="error-time">${timeStr}</span>
                ${shownIcon}
                ${expandBtn}
            </div>
            <div class="error-message">${message}</div>
            ${source ? `<div class="error-source">${source}</div>` : ''}
            ${detailsHtml}
        </div>
    `;
}

export function toggleErrorDetail(id) {
    const el = document.getElementById(`error-detail-${id}`);
    if (!el) return;
    el.classList.toggle('hidden');

    // Rotate chevron
    const btn = el.previousElementSibling?.querySelector
        ? el.closest('.error-log-entry')?.querySelector('.error-expand-btn i')
        : null;
    if (btn) {
        btn.classList.toggle('fa-chevron-down');
        btn.classList.toggle('fa-chevron-up');
    }
}

function formatErrorTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;

    // Older than a day — show date
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
