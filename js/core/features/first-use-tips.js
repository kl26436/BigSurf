// First-Use Tips Module - core/features/first-use-tips.js
// Contextual tooltips that appear once on key screens for new users

import { AppState } from '../utils/app-state.js';
import { updateSetting } from '../ui/settings-ui.js';
import { escapeHtml } from '../ui/ui-helpers.js';

const TIPS = {
    'workout-selector': {
        target: '.workout-option:first-child',
        text: 'Tap a category to browse workout templates',
        position: 'below',
    },
    'more-menu': {
        target: '[data-tab="more"]',
        text: 'Equipment Library, Plate Calculator, and more are here',
        position: 'above',
    },
    'exercise-sets': {
        target: '.set-row .set-complete-btn',
        text: 'Tap the checkbox after completing each set',
        position: 'above',
    },
};

/**
 * Show a first-use tooltip if the user hasn't dismissed it yet.
 * @param {string} key - One of the TIPS keys
 */
export function showFirstUseTip(key) {
    const seenTips = AppState.settings?.seenTips || [];
    if (seenTips.includes(key)) return;

    const tip = TIPS[key];
    if (!tip) return;

    // Small delay so the target element is rendered
    requestAnimationFrame(() => {
        const target = document.querySelector(tip.target);
        if (!target) return;

        // Don't stack multiple tooltips
        if (document.querySelector('.first-use-tip')) return;

        const tooltip = document.createElement('div');
        tooltip.className = `first-use-tip first-use-tip--${tip.position}`;
        tooltip.innerHTML = `
            <p class="first-use-tip__text">${escapeHtml(tip.text)}</p>
            <button class="first-use-tip__btn" onclick="dismissFirstUseTip('${key}')">Got it</button>
        `;

        // Position near target
        const rect = target.getBoundingClientRect();
        const scrollY = window.scrollY || window.pageYOffset;

        tooltip.style.left = `${Math.max(16, Math.min(rect.left + rect.width / 2, window.innerWidth - 16))}px`;
        if (tip.position === 'below') {
            tooltip.style.top = `${rect.bottom + scrollY + 8}px`;
        } else {
            tooltip.style.bottom = `${window.innerHeight - rect.top - scrollY + 8}px`;
        }

        document.body.appendChild(tooltip);

        // Auto-dismiss after 8 seconds
        setTimeout(() => {
            if (tooltip.parentNode) {
                dismissFirstUseTip(key);
            }
        }, 8000);
    });
}

/**
 * Dismiss a tip and persist to settings.
 */
export function dismissFirstUseTip(key) {
    // Remove tooltip from DOM
    const tooltip = document.querySelector('.first-use-tip');
    if (tooltip) {
        tooltip.classList.add('first-use-tip--exiting');
        setTimeout(() => tooltip.remove(), 200);
    }

    // Persist
    const seenTips = AppState.settings?.seenTips || [];
    if (!seenTips.includes(key)) {
        seenTips.push(key);
        updateSetting('seenTips', seenTips);
    }
}
