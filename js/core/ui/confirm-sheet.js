// Confirm / prompt bottom sheet — js/core/ui/confirm-sheet.js
//
// Promise-based replacement for native confirm() and prompt(). Renders as a
// <dialog> via showModal() so it joins the browser top layer and stacks above
// ANY open modal or sheet (z-index can't beat the top layer — the reason the
// old template editor had to close parent dialogs before opening sheets).
// Visual chrome reuses the aw-sheet classes; confirm-sheet.css only resets
// the <dialog> UA styles and styles the message/input rows.
//
// Copy rules (CLAUDE.md §User-Facing Copy) are the caller's job, but the API
// enforces the big one: confirmLabel is required — buttons name actions,
// never "OK".
//
// New self-contained file: safe against prod's 1-year JS cache (nothing old
// imports it; new callers and this file always ship together).

import { escapeHtml } from './ui-helpers.js';

let activeSheet = null;

function openSheet({ title, message, bodyHTML, actionsHTML, onWire }) {
    // A second sheet while one is open cancels the first (native dialogs
    // can't meaningfully stack either).
    if (activeSheet) activeSheet.cancel();

    const dlg = document.createElement('dialog');
    dlg.className = 'aw-sheet confirm-sheet';
    dlg.setAttribute('aria-label', title);
    dlg.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">${escapeHtml(title)}</div>
        </div>
        ${message ? `<div class="confirm-sheet__message">${escapeHtml(message)}</div>` : ''}
        ${bodyHTML || ''}
        <div class="aw-sheet__actions">${actionsHTML}</div>
    `;

    document.body.appendChild(dlg);

    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
            if (activeSheet?.dlg === dlg) activeSheet = null;
            dlg.classList.remove('visible');
            setTimeout(() => {
                try { dlg.close(); } catch { /* already closed */ }
                dlg.remove();
            }, 300);
        };

        const wired = onWire(dlg, finish);
        activeSheet = { dlg, cancel: () => finish(wired.cancelValue) };

        // Escape key fires 'cancel' on the dialog
        dlg.addEventListener('cancel', (e) => {
            e.preventDefault();
            finish(wired.cancelValue);
        });
        // Backdrop tap: clicks on ::backdrop dispatch with target === dialog
        dlg.addEventListener('click', (e) => {
            if (e.target === dlg) finish(wired.cancelValue);
        });

        dlg.showModal();
        requestAnimationFrame(() => {
            dlg.classList.add('visible');
            wired.focusEl?.focus();
        });
    });
}

/**
 * Action-confirmation sheet. Resolves true on confirm, false on cancel,
 * backdrop tap, or Escape.
 *
 * @param {object} opts
 * @param {string} opts.title          The question, naming action and target
 *                                     ("Delete workout from April 12?")
 * @param {string} [opts.message]      Consequence line ("This can't be undone.")
 * @param {string} opts.confirmLabel   Names the action ("Delete workout")
 * @param {string} [opts.cancelLabel]  Names the safe action ("Keep workout")
 * @param {boolean} [opts.destructive] Danger styling + focus lands on cancel
 * @returns {Promise<boolean>}
 */
export function confirmSheet({ title, message = '', confirmLabel, cancelLabel = 'Cancel', destructive = false }) {
    return openSheet({
        title,
        message,
        actionsHTML: `
            <button class="aw-sheet__action" data-confirm-sheet="cancel">${escapeHtml(cancelLabel)}</button>
            <button class="aw-sheet__action ${destructive ? 'danger' : 'primary'}" data-confirm-sheet="confirm">${escapeHtml(confirmLabel)}</button>
        `,
        onWire(dlg, finish) {
            const confirmBtn = dlg.querySelector('[data-confirm-sheet="confirm"]');
            const cancelBtn = dlg.querySelector('[data-confirm-sheet="cancel"]');
            confirmBtn.addEventListener('click', () => finish(true));
            cancelBtn.addEventListener('click', () => finish(false));
            return { cancelValue: false, focusEl: destructive ? cancelBtn : confirmBtn };
        },
    });
}

/**
 * Text-input sheet replacing native prompt(). Resolves the trimmed value on
 * confirm (may be ''), or null on cancel / backdrop / Escape — matching
 * native prompt's null-on-cancel contract so `if (!name) return;` call sites
 * keep working.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.message]
 * @param {string} [opts.placeholder]
 * @param {string} [opts.initialValue]
 * @param {string} [opts.confirmLabel]
 * @param {string} [opts.cancelLabel]
 * @returns {Promise<string|null>}
 */
export function promptSheet({ title, message = '', placeholder = '', initialValue = '', confirmLabel = 'Save', cancelLabel = 'Cancel' }) {
    return openSheet({
        title,
        message,
        bodyHTML: `
            <div class="confirm-sheet__input-wrap">
                <input type="text" class="field-input confirm-sheet__input"
                       value="${escapeHtml(initialValue)}"
                       placeholder="${escapeHtml(placeholder)}"
                       enterkeyhint="done">
            </div>
        `,
        actionsHTML: `
            <button class="aw-sheet__action" data-confirm-sheet="cancel">${escapeHtml(cancelLabel)}</button>
            <button class="aw-sheet__action primary" data-confirm-sheet="confirm">${escapeHtml(confirmLabel)}</button>
        `,
        onWire(dlg, finish) {
            const input = dlg.querySelector('.confirm-sheet__input');
            const confirmBtn = dlg.querySelector('[data-confirm-sheet="confirm"]');
            const cancelBtn = dlg.querySelector('[data-confirm-sheet="cancel"]');
            confirmBtn.addEventListener('click', () => finish(input.value.trim()));
            cancelBtn.addEventListener('click', () => finish(null));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') finish(input.value.trim());
            });
            return { cancelValue: null, focusEl: input };
        },
    });
}
