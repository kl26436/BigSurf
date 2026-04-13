// Plate Calculator — core/features/plate-calculator.js
// Greedy algorithm for calculating plates per side of a barbell,
// plus standalone page UI and in-modal popover.

import { AppState } from '../utils/app-state.js';

export const LBS_PLATES = [45, 35, 25, 10, 5, 2.5];
export const KG_PLATES = [20, 15, 10, 5, 2.5, 1.25];
export const LBS_BAR = 45;
export const KG_BAR = 20;

// Plate colors for visual diagram
const PLATE_COLORS = {
    45: '#e35d6a', 25: '#4A90D9', 35: '#7B4AD9', 10: '#36c46b',
    5: '#f0c24b', 2.5: '#9aa3ad',
    20: '#e35d6a', 15: '#7B4AD9', 1.25: '#9aa3ad',
};

/**
 * Calculate plates needed per side given a target weight and bar weight.
 * Uses a greedy algorithm with available plate sizes.
 *
 * @param {number} targetWeight - Total weight including bar
 * @param {number} barWeight - Weight of the bar (default 45 lbs)
 * @param {number[]} availablePlates - Plate sizes available, descending order
 * @returns {{ plates: number[], remainder: number, error?: string }}
 */
export function calculatePlates(targetWeight, barWeight = LBS_BAR, availablePlates = LBS_PLATES) {
    let perSide = (targetWeight - barWeight) / 2;
    if (perSide < 0) return { plates: [], remainder: 0, error: 'Weight is less than bar' };
    if (perSide === 0) return { plates: [], remainder: 0 };

    const plates = [];
    const sorted = [...availablePlates].sort((a, b) => b - a);

    for (const plate of sorted) {
        while (perSide >= plate) {
            plates.push(plate);
            perSide -= plate;
        }
    }

    return {
        plates,
        remainder: Math.round(perSide * 100) / 100,
    };
}

// ===================================================================
// STANDALONE PAGE
// ===================================================================

let pageInitialized = false;

export function initPlateCalculatorPage() {
    const container = document.getElementById('plate-calc-content');
    if (!container) return;

    const unit = AppState.globalUnit || 'lbs';
    const isKg = unit === 'kg';
    const defaultPlates = isKg ? KG_PLATES : LBS_PLATES;
    const defaultBar = isKg ? KG_BAR : LBS_BAR;
    const settings = AppState.settings || {};
    const savedPlates = isKg ? settings.plateKg : settings.plateLbs;
    const savedBar = isKg ? settings.plateBarKg : settings.plateBarLbs;
    const activePlates = savedPlates || defaultPlates;
    const barWeight = savedBar || defaultBar;

    container.innerHTML = `
        <div class="plate-calc-section">
            <label class="plate-calc-label">Target Weight (${unit})</label>
            <input type="number" id="plate-calc-target" class="form-input plate-calc-input"
                   inputmode="decimal" placeholder="e.g. ${isKg ? '100' : '225'}" autocomplete="off">
        </div>

        <div class="plate-calc-section">
            <label class="plate-calc-label">Bar Weight</label>
            <div class="plate-calc-bar-options" id="plate-calc-bar-options">
                ${getBarOptions(isKg, barWeight)}
            </div>
        </div>

        <div class="plate-calc-section">
            <label class="plate-calc-label">Available Plates</label>
            <div class="plate-calc-plates-grid" id="plate-calc-plates-grid">
                ${getPlateCheckboxes(defaultPlates, activePlates, unit)}
            </div>
        </div>

        <div class="plate-calc-result" id="plate-calc-result">
            <div class="plate-calc-empty">Enter a target weight above</div>
        </div>
    `;

    bindPlateCalcEvents();
    pageInitialized = true;

    // Register window functions for inline onclick handlers
    window.closePlateCalcPopover = closePlateCalcPopover;
}

function getBarOptions(isKg, selectedBar) {
    const unit = isKg ? 'kg' : 'lbs';
    const presets = isKg ? [20, 15, 10, 7] : [45, 35, 30, 25, 15];
    const isCustom = !presets.includes(selectedBar);

    const buttons = presets.map(v =>
        `<button class="plate-calc-bar-btn ${v === selectedBar ? 'active' : ''}" data-bar="${v}">${v}</button>`
    ).join('');

    return `${buttons}
        <div class="plate-calc-bar-custom">
            <input type="number" id="plate-calc-bar-custom" class="form-input"
                   inputmode="decimal" placeholder="Custom"
                   value="${isCustom ? selectedBar : ''}"
                   style="width: 70px; text-align: center;">
            <span>${unit}</span>
        </div>`;
}

function getPlateCheckboxes(allPlates, activePlates, unit) {
    return allPlates.map(p =>
        `<label class="plate-calc-plate-toggle ${activePlates.includes(p) ? 'active' : ''}">
            <input type="checkbox" value="${p}" ${activePlates.includes(p) ? 'checked' : ''}>
            <span>${p} ${unit}</span>
        </label>`
    ).join('');
}

function bindPlateCalcEvents() {
    const targetInput = document.getElementById('plate-calc-target');
    const barContainer = document.getElementById('plate-calc-bar-options');
    const platesGrid = document.getElementById('plate-calc-plates-grid');

    if (targetInput) {
        targetInput.addEventListener('input', () => runCalculation());
    }

    if (barContainer) {
        barContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.plate-calc-bar-btn');
            if (!btn) return;
            barContainer.querySelectorAll('.plate-calc-bar-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const customInput = document.getElementById('plate-calc-bar-custom');
            if (customInput) customInput.value = '';
            runCalculation();
        });

        const customBarInput = document.getElementById('plate-calc-bar-custom');
        if (customBarInput) {
            customBarInput.addEventListener('input', () => {
                if (customBarInput.value) {
                    barContainer.querySelectorAll('.plate-calc-bar-btn').forEach(b => b.classList.remove('active'));
                }
                runCalculation();
            });
        }
    }

    if (platesGrid) {
        platesGrid.addEventListener('change', (e) => {
            const label = e.target.closest('.plate-calc-plate-toggle');
            if (label) {
                label.classList.toggle('active', e.target.checked);
            }
            runCalculation();
        });
    }
}

function getActiveBarWeight() {
    const customInput = document.getElementById('plate-calc-bar-custom');
    if (customInput && customInput.value) {
        const custom = parseFloat(customInput.value);
        if (!isNaN(custom) && custom > 0) return custom;
    }
    const activeBtn = document.querySelector('.plate-calc-bar-btn.active');
    return activeBtn ? parseFloat(activeBtn.dataset.bar) : (AppState.globalUnit === 'kg' ? KG_BAR : LBS_BAR);
}

function getActivePlates() {
    const checkboxes = document.querySelectorAll('#plate-calc-plates-grid input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => parseFloat(cb.value));
}

function runCalculation() {
    const targetInput = document.getElementById('plate-calc-target');
    const resultContainer = document.getElementById('plate-calc-result');
    if (!targetInput || !resultContainer) return;

    const target = parseFloat(targetInput.value);
    if (!target || isNaN(target)) {
        resultContainer.innerHTML = '<div class="plate-calc-empty">Enter a target weight above</div>';
        return;
    }

    const barWeight = getActiveBarWeight();
    const activePlates = getActivePlates();
    const unit = AppState.globalUnit || 'lbs';
    const result = calculatePlates(target, barWeight, activePlates);

    if (result.error) {
        resultContainer.innerHTML = `<div class="plate-calc-error"><i class="fas fa-exclamation-triangle"></i> ${result.error}</div>`;
        return;
    }

    const perSideText = result.plates.length
        ? result.plates.join(' + ')
        : 'Just the bar';

    const totalPerSide = result.plates.reduce((a, b) => a + b, 0);

    resultContainer.innerHTML = `
        ${renderBarbellDiagram(result.plates)}
        <div class="plate-calc-breakdown">
            <div class="plate-calc-total">
                <span class="plate-calc-total-label">Total</span>
                <span class="plate-calc-total-value">${target} ${unit}</span>
            </div>
            <div class="plate-calc-per-side">
                <span>Per side:</span> ${perSideText} ${result.plates.length ? unit : ''}
                ${totalPerSide ? ` (${totalPerSide} ${unit})` : ''}
            </div>
            <div class="plate-calc-bar-label">Bar: ${barWeight} ${unit}</div>
            ${result.remainder > 0 ? `<div class="plate-calc-remainder"><i class="fas fa-info-circle"></i> ${result.remainder} ${unit} cannot be loaded with available plates</div>` : ''}
        </div>
    `;
}

function renderBarbellDiagram(plates) {
    if (!plates.length) {
        return `<div class="barbell-diagram"><div class="barbell-bar-only">Empty bar</div></div>`;
    }

    const maxPlate = Math.max(...plates, 45);
    const reversedPlates = [...plates].reverse();

    const leftPlates = reversedPlates.map(p => plateEl(p, maxPlate)).join('');
    const rightPlates = plates.map(p => plateEl(p, maxPlate)).join('');

    return `
        <div class="barbell-diagram">
            <div class="barbell-side barbell-left">${leftPlates}</div>
            <div class="barbell-collar"></div>
            <div class="barbell-bar"></div>
            <div class="barbell-collar"></div>
            <div class="barbell-side barbell-right">${rightPlates}</div>
        </div>
    `;
}

function plateEl(weight, maxPlate) {
    const minH = 28;
    const maxH = 60;
    const height = minH + ((weight / maxPlate) * (maxH - minH));
    const color = PLATE_COLORS[weight] || 'var(--text-muted)';
    return `<div class="barbell-plate" style="height:${height}px;background:${color};" title="${weight}"><span>${weight}</span></div>`;
}

// ===================================================================
// IN-MODAL POPOVER (for exercise detail view)
// ===================================================================

export function openPlateCalcPopover(exerciseIndex) {
    // Ensure close function is on window for inline onclick
    window.closePlateCalcPopover = closePlateCalcPopover;

    const exercise = AppState.currentWorkout?.exercises?.[exerciseIndex];
    if (!exercise) return;

    const unit = AppState.exerciseUnits[exerciseIndex] || AppState.globalUnit || 'lbs';
    const isKg = unit === 'kg';
    const settings = AppState.settings || {};
    const barWeight = isKg
        ? (settings.plateBarKg || KG_BAR)
        : (settings.plateBarLbs || LBS_BAR);
    const availPlates = isKg
        ? (settings.plateKg || KG_PLATES)
        : (settings.plateLbs || LBS_PLATES);

    // Read current weight from the focused set input or exercise default
    const savedSets = AppState.savedData.exercises?.[`exercise_${exerciseIndex}`]?.sets || [];
    let targetWeight = 0;
    // Find the most recently filled set
    for (let i = savedSets.length - 1; i >= 0; i--) {
        if (savedSets[i]?.weight) {
            targetWeight = savedSets[i].weight;
            if (isKg) targetWeight = Math.round(targetWeight * 0.453592 * 2) / 2;
            break;
        }
    }
    if (!targetWeight) {
        targetWeight = isKg
            ? Math.round((exercise.weight || 0) * 0.453592 * 2) / 2
            : (exercise.weight || 0);
    }

    // Build popover content
    let existing = document.getElementById('plate-calc-popover');
    if (existing) existing.remove();

    const popover = document.createElement('div');
    popover.id = 'plate-calc-popover';
    popover.className = 'plate-calc-popover';

    const result = targetWeight > 0 ? calculatePlates(targetWeight, barWeight, availPlates) : null;

    popover.innerHTML = `
        <div class="plate-calc-popover-header">
            <h3>Plate Calculator</h3>
            <button class="btn-text" onclick="closePlateCalcPopover()"><i class="fas fa-times"></i></button>
        </div>
        <div class="plate-calc-popover-body">
            <div class="plate-calc-popover-input-row">
                <input type="number" id="popover-plate-target" class="form-input"
                       inputmode="decimal" value="${targetWeight || ''}" placeholder="Weight">
                <span class="plate-calc-popover-unit">${unit}</span>
            </div>
            <div id="popover-plate-result">
                ${result && !result.error ? `
                    ${renderBarbellDiagram(result.plates)}
                    <div class="plate-calc-per-side">
                        Per side: ${result.plates.length ? result.plates.join(' + ') + ' ' + unit : 'Just the bar'}
                    </div>
                    <div class="plate-calc-bar-label">Bar: ${barWeight} ${unit}</div>
                    ${result.remainder > 0 ? `<div class="plate-calc-remainder">${result.remainder} ${unit} remainder</div>` : ''}
                ` : (result?.error ? `<div class="plate-calc-error">${result.error}</div>` : '<div class="plate-calc-empty">Enter weight</div>')}
            </div>
        </div>
    `;

    document.body.appendChild(popover);

    // Bind input for live recalculation
    const input = document.getElementById('popover-plate-target');
    if (input) {
        input.addEventListener('input', () => {
            const val = parseFloat(input.value);
            const container = document.getElementById('popover-plate-result');
            if (!container) return;
            if (!val || isNaN(val)) {
                container.innerHTML = '<div class="plate-calc-empty">Enter weight</div>';
                return;
            }
            const r = calculatePlates(val, barWeight, availPlates);
            if (r.error) {
                container.innerHTML = `<div class="plate-calc-error">${r.error}</div>`;
                return;
            }
            container.innerHTML = `
                ${renderBarbellDiagram(r.plates)}
                <div class="plate-calc-per-side">
                    Per side: ${r.plates.length ? r.plates.join(' + ') + ' ' + unit : 'Just the bar'}
                </div>
                <div class="plate-calc-bar-label">Bar: ${barWeight} ${unit}</div>
                ${r.remainder > 0 ? `<div class="plate-calc-remainder">${r.remainder} ${unit} remainder</div>` : ''}
            `;
        });
        input.focus();
        input.select();
    }
}

export function closePlateCalcPopover() {
    const popover = document.getElementById('plate-calc-popover');
    if (popover) popover.remove();
}
