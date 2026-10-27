// Bodyweight Prompt — core/features/bodyweight-prompt.js
// Ensures the user has a fresh body-weight reading before logging
// bodyweight exercises (pull-ups, dips, push-ups, etc.).
// If stale or missing, shows a quick-input sheet.

import { AppState } from '../utils/app-state.js';
import { getLatestBodyWeight, saveBodyWeight } from './body-measurements.js';
import { convertWeight, unitLabel } from '../ui/ui-helpers.js';
import { formatRelative } from '../utils/date-helpers.js';
import { BW_STALENESS_DAYS, checkBodyWeightFreshness } from '../utils/weight-calculations.js';
import { openSheet, closeSheet } from '../ui/sheet.js';

const BW_PROMPT_SHEET_ID = 'bw-prompt-sheet';

/**
 * Ensure a fresh body weight is available for the current session.
 * - If fresh (≤14 days), resolves silently with the weight in lbs.
 * - If stale or missing, shows a quick-input prompt.
 * - Caches the result in AppState for the rest of the workout session.
 *
 * @returns {Promise<number|null>} Weight in lbs, or null if user skipped.
 */
export async function ensureFreshBodyWeight() {
    // Return cached value if already resolved this session
    if (AppState.currentSessionBodyWeightLbs !== null) {
        return AppState.currentSessionBodyWeightLbs;
    }

    const entry = await getLatestBodyWeight();
    const freshness = checkBodyWeightFreshness(entry);

    if (freshness && freshness.ageInDays <= BW_STALENESS_DAYS) {
        // Fresh — use it silently
        const weightLbs = freshness.unit === 'kg'
            ? convertWeight(freshness.weight, 'kg', 'lbs')
            : freshness.weight;
        AppState.currentSessionBodyWeight = freshness;
        AppState.currentSessionBodyWeightLbs = weightLbs;
        return weightLbs;
    }

    // Stale or missing — prompt
    return showBodyWeightPrompt(freshness);
}

// The open prompt's promise — a render that re-triggers the prompt while it
// is up (active-workout render calls ensureFreshBodyWeight) shares it instead
// of stacking a second prompt, so every caller resolves exactly once.
let _pendingPrompt = null;

/**
 * Show a quick-input sheet to capture the user's current body weight.
 * Returns a promise that resolves when the user saves or skips. SH-3b —
 * rendered through the sheet primitive (keyboard inset, page lock, inert,
 * focus trap). Only Save or Skip close it; navigating away counts as Skip,
 * so the promise always settles.
 */
function showBodyWeightPrompt(stale) {
    if (_pendingPrompt) return _pendingPrompt;
    _pendingPrompt = new Promise((resolve) => {
        const displayUnit = AppState.globalUnit || 'lbs';
        const unitText = unitLabel(displayUnit);
        const prefillValue = stale ? stale.weight.toFixed(1) : '';
        const lastInfo = stale
            ? `Last entry: ${stale.weight.toFixed(1)} ${unitLabel(stale.unit)} · ${formatRelative(stale.date)}`
            : '';

        let settled = false;
        let saving = false; // a dismissal mid-save mustn't turn the save into a skip
        const settle = (value) => {
            if (settled) return;
            settled = true;
            _pendingPrompt = null;
            resolve(value);
        };
        const skip = () => {
            // Mark as explicitly skipped so we don't re-prompt this session
            AppState.currentSessionBodyWeightLbs = 0; // 0 = skipped (vs null = not asked)
            settle(null);
        };

        const { el } = openSheet({
            id: BW_PROMPT_SHEET_ID,
            className: 'bw-prompt-sheet',
            // Skipping drops bodyweight volume for the whole session, so it
            // takes the Skip button — a stray backdrop tap, swipe or system
            // back must not do it (the old overlay had no backdrop dismiss).
            dismissible: false,
            bodyHTML: `
            <div class="bw-prompt">
                <div class="bw-prompt__icon"><i class="fas fa-weight"></i></div>
                <h2 class="bw-prompt__title" id="bw-prompt-title">What's your body weight today?</h2>
                <p class="bw-prompt__desc">We use this to track total volume on bodyweight exercises like pull-ups and dips.</p>
                <div class="bw-prompt__input-card">
                    <input type="number" inputmode="decimal" step="0.1"
                           class="bw-prompt__input" id="bw-prompt-input"
                           value="${prefillValue}"
                           placeholder="${displayUnit === 'kg' ? '83.0' : '184.0'}"
                           aria-label="Body weight in ${unitText}">
                    <span class="bw-prompt__unit">${unitText}</span>
                </div>
                ${lastInfo ? `<div class="bw-prompt__hint">${lastInfo}</div>` : ''}
                <button class="btn btn-primary bw-prompt__save" id="bw-prompt-save">
                    <i class="fas fa-check"></i> Use this weight
                </button>
                <button class="btn-text bw-prompt__skip" id="bw-prompt-skip">
                    Skip · log without bodyweight
                </button>
            </div>
        `,
            // Every way out that isn't Save (Skip, navigation) is a Skip.
            onClose: () => { if (!settled && !saving) skip(); },
        });
        el.setAttribute('aria-labelledby', 'bw-prompt-title');
        // Focus the input
        setTimeout(() => el.querySelector('#bw-prompt-input')?.focus(), 100);

        el.querySelector('#bw-prompt-save').addEventListener('click', async () => {
            if (saving || settled) return;
            const input = el.querySelector('#bw-prompt-input');
            const w = parseFloat(input.value);
            if (!w || w <= 0) {
                input.classList.add('input-error');
                setTimeout(() => input.classList.remove('input-error'), 600);
                return;
            }

            // Persist to body measurements (never throws — it notifies itself)
            saving = true;
            await saveBodyWeight(w, displayUnit);

            // Convert to lbs for internal use
            const weightLbs = displayUnit === 'kg' ? convertWeight(w, 'kg', 'lbs') : w;
            AppState.currentSessionBodyWeight = { weight: w, unit: displayUnit, ageInDays: 0 };
            AppState.currentSessionBodyWeightLbs = weightLbs;

            settle(weightLbs);
            closeSheet(BW_PROMPT_SHEET_ID);
        });

        el.querySelector('#bw-prompt-skip').addEventListener('click', () => {
            closeSheet(BW_PROMPT_SHEET_ID); // onClose → skip
        });
    });
    return _pendingPrompt;
}

/**
 * Re-open the BW prompt (e.g., user taps "Edit" on the BW banner).
 * Clears cached value so ensureFreshBodyWeight() will re-prompt.
 */
export function editBodyWeight() {
    AppState.currentSessionBodyWeight = null;
    AppState.currentSessionBodyWeightLbs = null;
    return ensureFreshBodyWeight();
}
