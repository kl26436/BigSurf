// Bodyweight Prompt — core/features/bodyweight-prompt.js
// Ensures the user has a fresh body-weight reading before logging
// bodyweight exercises (pull-ups, dips, push-ups, etc.).
// If stale or missing, shows a quick-input modal.

import { AppState } from '../utils/app-state.js';
import { getLatestBodyWeight, saveBodyWeight } from './body-measurements.js';
import { convertWeight, openModal, closeModal } from '../ui/ui-helpers.js';
import { BW_STALENESS_DAYS, checkBodyWeightFreshness } from '../utils/weight-calculations.js';

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

/**
 * Show a quick-input modal to capture the user's current body weight.
 * Returns a promise that resolves when the user saves or skips.
 */
function showBodyWeightPrompt(stale) {
    return new Promise((resolve) => {
        const displayUnit = AppState.globalUnit || 'lbs';
        const unitLabel = displayUnit === 'kg' ? 'kg' : 'lb';
        const prefillValue = stale ? stale.weight.toFixed(1) : '';
        const lastInfo = stale
            ? `Last entry: ${stale.weight.toFixed(1)} ${stale.unit} · ${stale.ageInDays} days ago`
            : '';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay bw-prompt-overlay';
        overlay.innerHTML = `
            <div class="bw-prompt">
                <div class="bw-prompt__icon"><i class="fas fa-weight"></i></div>
                <h2 class="bw-prompt__title">What's your body weight today?</h2>
                <p class="bw-prompt__desc">We use this to track total volume on bodyweight exercises like pull-ups and dips.</p>
                <div class="bw-prompt__input-card">
                    <input type="number" inputmode="decimal" step="0.1"
                           class="bw-prompt__input" id="bw-prompt-input"
                           value="${prefillValue}"
                           placeholder="${displayUnit === 'kg' ? '83.0' : '184.0'}">
                    <span class="bw-prompt__unit">${unitLabel}</span>
                </div>
                ${lastInfo ? `<div class="bw-prompt__hint">${lastInfo}</div>` : ''}
                <button class="btn btn-primary bw-prompt__save" id="bw-prompt-save">
                    <i class="fas fa-check"></i> Use this weight
                </button>
                <button class="btn-text bw-prompt__skip" id="bw-prompt-skip">
                    Skip · log without bodyweight
                </button>
            </div>
        `;

        document.body.appendChild(overlay);
        // Focus the input
        setTimeout(() => overlay.querySelector('#bw-prompt-input')?.focus(), 100);

        const cleanup = () => {
            overlay.classList.add('bw-prompt-closing');
            setTimeout(() => overlay.remove(), 200);
        };

        overlay.querySelector('#bw-prompt-save').addEventListener('click', async () => {
            const input = overlay.querySelector('#bw-prompt-input');
            const w = parseFloat(input.value);
            if (!w || w <= 0) {
                input.classList.add('input-error');
                setTimeout(() => input.classList.remove('input-error'), 600);
                return;
            }

            // Persist to body measurements
            await saveBodyWeight(w, displayUnit);

            // Convert to lbs for internal use
            const weightLbs = displayUnit === 'kg' ? convertWeight(w, 'kg', 'lbs') : w;
            AppState.currentSessionBodyWeight = { weight: w, unit: displayUnit, ageInDays: 0 };
            AppState.currentSessionBodyWeightLbs = weightLbs;

            cleanup();
            resolve(weightLbs);
        });

        overlay.querySelector('#bw-prompt-skip').addEventListener('click', () => {
            // Mark as explicitly skipped so we don't re-prompt this session
            AppState.currentSessionBodyWeightLbs = 0; // 0 = skipped (vs null = not asked)
            cleanup();
            resolve(null);
        });
    });
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
