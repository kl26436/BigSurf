// Body Weight & Measurements UI — Phase 12.2, 12.3, 12.4
// Dashboard widget, weight entry modal, Stats chart, body measurements modal

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification, openModal, closeModal, displayWeight, formatHeight, parseHeightToCm } from '../ui/ui-helpers.js';
import { formatRelativeDate } from '../utils/date-helpers.js';
import { navigateTo, navigateBack } from '../ui/navigation.js';
import {
    saveBodyWeight,
    loadBodyWeightHistory,
    getLatestBodyWeight,
    deleteBodyWeight,
    getBodyWeightSince,
    calculate7DayAverage,
    calculateWeightTrend,
    convertMeasurementUnit,
    MEASUREMENT_TYPES,
} from './body-measurements.js';

// ===================================================================
// DASHBOARD WIDGET (Phase 12.2)
// ===================================================================

/**
 * Render the body weight dashboard card.
 * Called from dashboard-ui.js renderDashboard().
 * @returns {string} HTML string
 */
export async function renderBodyWeightCard() {
    const emptyCard = `
        <div class="hero-card bodyweight-card">
            <div class="bodyweight-header">
                <h3><i class="fas fa-weight-scale"></i> Body Weight</h3>
            </div>
            <div class="bodyweight-empty">
                <p>Track your body weight to see trends over time.</p>
                <button class="btn btn-primary btn-sm" onclick="showWeightEntryModal()">
                    <i class="fas fa-plus"></i> Log Weight
                </button>
            </div>
        </div>
    `;

    try {
        const latest = await getLatestBodyWeight();
        const unit = AppState.globalUnit || 'lbs';

        if (!latest) {
            return emptyCard;
        }

        // Convert to user's preferred unit for display
        const displayEntry = convertMeasurementUnit(latest, unit);
        const formattedDate = formatRelativeDate(latest.date);

        // Load recent entries for trend
        const entries = await loadBodyWeightHistory(30);
        const convertedEntries = entries.map(e => convertMeasurementUnit(e, unit));
        const trend = calculateWeightTrend(convertedEntries);

        let trendHTML = '';
        if (trend) {
            const arrow = trend.direction === 'up' ? 'fa-arrow-up' : trend.direction === 'down' ? 'fa-arrow-down' : 'fa-minus';
            const trendClass = trend.direction === 'flat' ? 'trend-flat' : trend.direction;
            trendHTML = `
                <span class="bodyweight-trend ${trendClass}">
                    <i class="fas ${arrow}"></i> ${trend.value} ${unit} this week
                </span>
            `;
        }

        return `
            <div class="hero-card bodyweight-card">
                <div class="bodyweight-header">
                    <h3><i class="fas fa-weight-scale"></i> Body Weight</h3>
                    ${trendHTML}
                </div>
                <div class="bodyweight-current" onclick="showWeightEntryModal()">
                    <span class="bodyweight-value">${displayEntry.weight}</span>
                    <span class="bodyweight-unit">${unit}</span>
                    <span class="bodyweight-date">${escapeHtml(formattedDate)}</span>
                </div>
                <button class="btn btn-primary btn-sm" onclick="showWeightEntryModal()">
                    <i class="fas fa-plus"></i> Log Weight
                </button>
            </div>
        `;
    } catch (error) {
        console.error('❌ Error rendering body weight card:', error);
        return emptyCard;
    }
}

// ===================================================================
// WEIGHT ENTRY MODAL (Phase 12.2)
// ===================================================================

/**
 * Show the redesigned weight entry modal — hero weight card + body composition + circumference.
 */
/**
 * Render the full-page Body Measurements entry (Phase F §2).
 * Spec: page-header + hero bm-weight-card + bm-row family + segmented unit
 * toggle + import-sources group + sticky footer primary CTA.
 */
export function showWeightEntryModal() {
    const section = document.getElementById('body-measurements-entry-section');
    if (!section) return;

    const unit = AppState.globalUnit || 'lbs';
    const unitLabel = unit === 'kg' ? 'kg' : 'lb';
    const circumUnit = unit === 'kg' ? 'cm' : 'in';
    const today = AppState.getTodayDateString?.() || new Date().toISOString().split('T')[0];

    const lastEntry = AppState._lastBodyWeight;
    const lastValueStr = lastEntry
        ? `${lastEntry.weight} ${lastEntry.unit}${lastEntry.date ? ' · ' + lastEntry.date : ''}`
        : '—';

    const circumFields = [
        { key: 'chest', label: 'Chest', icon: 'fa-ruler-horizontal' },
        { key: 'waist', label: 'Waist', icon: 'fa-ruler-horizontal' },
        { key: 'bicepLeft', label: 'Arm (L/R avg)', icon: 'fa-ruler-horizontal' },
    ];

    section.innerHTML = `
        <div class="page-header">
            <div class="page-header__left">
                <button class="page-header__back" onclick="closeWeightEntryModal()" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
                <div class="page-header__title">Log Measurements</div>
            </div>
            <button class="page-header__save" onclick="saveBodyWeightEntry()">Save</button>
        </div>

        <div class="content-section-body bm-entry-body">
            <div class="field">
                <div class="field-label">Date</div>
                <input class="field-input" type="date" id="bm-entry-date" value="${today}">
            </div>

            <!-- Hero weight card (spec §2) -->
            <div class="sec-head"><h3>Weight</h3></div>
            <div class="bm-weight-card">
                <div class="bm-weight-card__row">
                    <input type="number" id="body-weight-input" class="bm-weight-card__input"
                           placeholder="${unit === 'kg' ? '83.0' : '184.0'}"
                           step="0.1" min="0" max="999" inputmode="decimal" autofocus>
                    <span class="bm-weight-card__unit">${unitLabel}</span>
                    <div class="bm-weight-card__last">
                        <div class="bm-weight-card__last-label">Last</div>
                        <div class="bm-weight-card__last-val">${escapeHtml(lastValueStr)}</div>
                    </div>
                </div>
                <div class="segmented" data-field="weightUnit">
                    <button class="${unit === 'lbs' ? 'active' : ''}" onclick="setBodyWeightUnit('lbs')">lb</button>
                    <button class="${unit === 'kg' ? 'active' : ''}" onclick="setBodyWeightUnit('kg')">kg</button>
                </div>
            </div>

            <!-- Body composition -->
            <div class="sec-head"><h3>Body composition <span class="count">(optional)</span></h3></div>
            ${renderBmRow('body-fat-input', 'Body fat', 'fa-percent', '%')}
            ${renderBmRow('muscle-mass-input', 'Muscle mass', 'fa-fire', unitLabel)}

            <!-- Height — stored on the user profile (not a dated entry).
                 Displayed and entered in ft/in; stored as cm. -->
            <div class="sec-head"><h3>Profile <span class="count">(saved to your profile, not this entry)</span></h3></div>
            ${renderHeightRow(AppState.settings?.profileHeightCm)}

            <!-- Circumference -->
            <div class="sec-head"><h3>Circumference <span class="count">(optional)</span></h3></div>
            ${circumFields.map(f => renderBmRow(`measure-${f.key}`, f.label, f.icon, circumUnit)).join('')}

            <!-- Import sources -->
            <div class="sec-head"><h3>Or import from</h3></div>
            <div class="group bm-import-sources">
                <div class="srow srow--clickable" onclick="handleWithingsSettingsAction()">
                    <div class="srow-icon ic-blue"><i class="fas fa-link"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Withings</div>
                        <div class="srow-desc" id="bm-withings-status">Weight & body composition</div>
                    </div>
                    <div class="srow-right"><span class="srow-action">Sync</span></div>
                </div>
                <div class="srow srow--clickable" onclick="showDexaUploadModal()">
                    <div class="srow-icon ic-warm"><i class="fas fa-x-ray"></i></div>
                    <div class="srow-info">
                        <div class="srow-name">Upload DEXA scan</div>
                        <div class="srow-desc">PDF or CSV from your facility</div>
                    </div>
                    <div class="srow-right"><span class="srow-action">Upload</span></div>
                </div>
            </div>
        </div>

        <div class="page-footer">
            <button class="btn-primary" onclick="saveBodyWeightEntry()">
                <i class="fas fa-check"></i> Save Entry
            </button>
        </div>
    `;

    navigateTo('body-measurements-entry-section');
    setTimeout(() => document.getElementById('body-weight-input')?.focus(), 150);

    // Surface freshness on the Withings row — "Synced 2h ago" / "Never synced"
    // so users know whether tapping Sync will pull anything new.
    refreshWithingsFreshnessLabel();
}

/** Update the Withings row's desc line with a freshness label. */
async function refreshWithingsFreshnessLabel() {
    const el = document.getElementById('bm-withings-status');
    if (!el) return;
    try {
        const { getWithingsStatus } = await import('./withings-integration.js');
        const status = await getWithingsStatus();
        if (!status?.connected) {
            el.textContent = 'Not connected — tap to set up';
            return;
        }
        if (!status.lastSync) {
            el.textContent = 'Connected · never synced';
            return;
        }
        el.textContent = `Synced ${formatRelativeTimestamp(status.lastSync)}`;
    } catch (err) {
        // Non-fatal — leave the default text
        console.warn('Could not refresh Withings freshness label:', err);
    }
}

/** Format an ISO timestamp as a short relative string ("2h ago", "3d ago"). */
function formatRelativeTimestamp(iso) {
    if (!iso) return 'unknown';
    const now = Date.now();
    const then = new Date(iso).getTime();
    if (isNaN(then)) return 'unknown';
    const seconds = Math.max(0, Math.floor((now - then) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

function renderBmRow(inputId, label, icon, unit) {
    return `
        <div class="bm-row">
            <div class="bm-row__icon"><i class="fas ${icon}"></i></div>
            <div class="bm-row__info">
                <div class="bm-row__name">${escapeHtml(label)}</div>
            </div>
            <input type="number" id="${inputId}" class="bm-row__input"
                   placeholder="—" step="0.1" min="0" max="999" inputmode="decimal">
            <div class="bm-row__unit">${escapeHtml(unit)}</div>
        </div>
    `;
}

/** Height row — unit-aware entry, stored as cm on the user profile.
 *  lbs pref → ft/in string input (e.g. 5'10"); kg pref → cm numeric input. */
function renderHeightRow(currentCm) {
    const unitPref = AppState.settings?.weightUnit || AppState.globalUnit || 'lbs';
    const usesImperial = unitPref === 'lbs';
    const display = currentCm != null
        ? (usesImperial ? formatHeight(currentCm, 'lbs') : String(Math.round(currentCm)))
        : '';
    const placeholder = usesImperial ? "5'10\"" : '178';
    const unitLabel = usesImperial ? 'ft/in' : 'cm';
    const inputType = usesImperial ? 'text' : 'number';
    return `
        <div class="bm-row">
            <div class="bm-row__icon"><i class="fas fa-ruler-vertical"></i></div>
            <div class="bm-row__info">
                <div class="bm-row__name">Height</div>
            </div>
            <input type="${inputType}" id="bm-height-input" class="bm-row__input bm-row__input--wide"
                   placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(display)}"
                   inputmode="${usesImperial ? 'text' : 'decimal'}"
                   aria-label="Height">
            <div class="bm-row__unit">${unitLabel}</div>
        </div>
    `;
}

/**
 * Close the measurements entry page (navigate back to dashboard/previous).
 */
export function closeWeightEntryModal() {
    navigateBack();
}

/**
 * Save body weight from the entry modal.
 */
export async function saveBodyWeightEntry() {
    const weightInput = document.getElementById('body-weight-input');
    const fatInput = document.getElementById('body-fat-input');
    const muscleInput = document.getElementById('muscle-mass-input');

    const weight = parseFloat(weightInput?.value);
    if (!weight || weight <= 0) {
        showNotification('Enter a valid weight', 'warning');
        return;
    }

    const bodyFat = fatInput?.value ? parseFloat(fatInput.value) : null;
    const muscleMass = muscleInput?.value ? parseFloat(muscleInput.value) : null;
    const unit = AppState.globalUnit || 'lbs';

    // Circumference fields
    const circumKeys = ['chest', 'waist', 'bicepLeft'];
    const measurements = {};
    for (const k of circumKeys) {
        const el = document.getElementById(`measure-${k}`);
        const v = el?.value ? parseFloat(el.value) : null;
        if (v && v > 0) measurements[k] = v;
    }

    const dateEl = document.getElementById('bm-entry-date');
    const entryDate = dateEl?.value || null;

    // Height — stored on the user profile, not the measurements record. Write-through
    // only when the user actually typed something so a blank field doesn't clear it.
    const heightEl = document.getElementById('bm-height-input');
    const heightRaw = heightEl?.value?.trim() || '';
    if (heightRaw) {
        const cm = parseHeightToCm(heightRaw, unit);
        if (cm != null) {
            const { updateSetting } = await import('../ui/settings-ui.js');
            updateSetting('profileHeightCm', cm);
        }
    }

    const extra = { bodyFat, muscleMass };
    if (Object.keys(measurements).length > 0) extra.measurements = measurements;
    if (entryDate) extra.date = entryDate;

    const result = await saveBodyWeight(weight, unit, extra);
    if (result) {
        closeWeightEntryModal();
    }
}

// ===================================================================
// BODY MEASUREMENTS MODAL (Phase 12.4)
// ===================================================================

/**
 * Show the body measurements modal for tracking circumference measurements.
 */
export function showMeasurementsModal() {
    const modal = document.getElementById('measurements-modal');
    if (!modal) return;

    const unit = AppState.globalUnit === 'kg' ? 'cm' : 'in';

    const measurementFields = Object.entries(MEASUREMENT_TYPES).map(([key, label]) => `
        <div class="measurement-row">
            <label class="measurement-label">${label}</label>
            <div class="measurement-input-wrap">
                <input type="number" id="measure-${key}" class="form-input measurement-input"
                       placeholder="—" step="0.1" min="0" max="200" inputmode="decimal">
                <span class="measurement-unit">${unit}</span>
            </div>
        </div>
    `).join('');

    modal.querySelector('.modal-content').innerHTML = `
        <div class="modal-header">
            <h3>Body Measurements</h3>
            <button class="modal-close-btn" onclick="closeMeasurementsModal()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <p class="measurements-hint">All measurements in ${unit}. Leave blank to skip.</p>
            <div class="measurements-form">
                ${measurementFields}
            </div>
            <button class="btn btn-primary btn-block measurements-save-btn" onclick="saveMeasurementsEntry()">
                <i class="fas fa-check"></i> Save Measurements
            </button>
        </div>
    `;

    openModal(modal);
}

/**
 * Close measurements modal.
 */
export function closeMeasurementsModal() {
    const modal = document.getElementById('measurements-modal');
    if (modal) closeModal(modal);
}

/**
 * Save body measurements from the modal.
 */
export async function saveMeasurementsEntry() {
    const measurements = {};
    let hasAny = false;

    for (const key of Object.keys(MEASUREMENT_TYPES)) {
        const input = document.getElementById(`measure-${key}`);
        const val = input ? parseFloat(input.value) : null;
        if (val && val > 0) {
            measurements[key] = val;
            hasAny = true;
        }
    }

    if (!hasAny) {
        showNotification('Enter at least one measurement', 'warning');
        return;
    }

    const unit = AppState.globalUnit || 'lbs';
    const measureUnit = unit === 'kg' ? 'cm' : 'in';

    // Save as a body weight entry with measurements attached
    // Use 0 for weight since this is measurements-only
    const result = await saveBodyWeight(0, unit, {
        notes: 'Body measurements',
        measurements: { ...measurements, unit: measureUnit },
    });

    if (result) {
        closeMeasurementsModal();
        showNotification('Measurements saved', 'success', 1500);
    }
}

// ===================================================================
// WEIGHT HISTORY MODAL
// ===================================================================

/**
 * Show weight history list modal.
 */
export async function showWeightHistory() {
    const modal = document.getElementById('weight-history-section');
    if (!modal) return;

    const unit = AppState.globalUnit || 'lbs';
    const entries = await loadBodyWeightHistory(90);

    let historyHTML = '';
    if (entries.length === 0) {
        historyHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-weight-scale"></i></div>
                <div class="empty-state-title">No entries yet</div>
                <div class="empty-state-description">Start logging your weight to see history here.</div>
            </div>
        `;
    } else {
        const displayEntries = entries
            .filter(e => e.weight > 0) // Skip measurements-only entries
            .reverse(); // Most recent first

        historyHTML = displayEntries.map(entry => {
            const converted = convertMeasurementUnit(entry, unit);
            const dateStr = formatRelativeDate(entry.date);
            const fatStr = entry.bodyFat ? ` | ${entry.bodyFat}% BF` : '';
            const noteStr = entry.notes ? ` — ${escapeHtml(entry.notes)}` : '';
            const measStr = entry.measurements ? ' <i class="fas fa-ruler" title="Has body measurements"></i>' : '';

            return `
                <div class="weight-history-item row-card">
                    <div class="weight-history-info">
                        <span class="weight-history-value">${converted.weight} ${unit}</span>
                        <span class="weight-history-meta">${escapeHtml(dateStr)}${fatStr}${noteStr}${measStr}</span>
                    </div>
                    <button class="btn-icon" onclick="deleteWeightEntry('${escapeAttr(entry.id)}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    // Populate the full-page body content
    const body = document.getElementById('weight-history-content') || modal.querySelector('.full-page-body');
    if (body) {
        body.innerHTML = historyHTML;
    }

    // Show as full-page section
    modal.classList.remove('hidden');
}

/**
 * Close weight history modal.
 */
export function closeWeightHistory() {
    const modal = document.getElementById('weight-history-section');
    if (modal) modal.classList.add('hidden');
}

/**
 * Delete a weight entry and refresh the history modal.
 */
export async function deleteWeightEntry(docId) {
    await deleteBodyWeight(docId);
    // Refresh the history modal
    await showWeightHistory();
}

// ===================================================================
// STATS PAGE CHART (Phase 12.3)
// ===================================================================

let bodyWeightChart = null;

/**
 * Render the body weight chart section for the Stats page.
 * @returns {string} HTML string for the chart section
 */
export function renderBodyWeightChartSection() {
    return `
        <div class="stats-section" id="bodyweight-chart-section">
            <div class="section-header-row" onclick="toggleStatsSection('bodyweight-chart-content')">
                <h3 class="section-title"><i class="fas fa-weight-scale"></i> Body Weight</h3>
                <i class="fas fa-chevron-down section-toggle"></i>
            </div>
            <div id="bodyweight-chart-content" class="section-collapsible">
                <div class="chart-time-range-pills">
                    <button class="pill-btn active" onclick="setBodyWeightTimeRange('3M')">3M</button>
                    <button class="pill-btn" onclick="setBodyWeightTimeRange('6M')">6M</button>
                    <button class="pill-btn" onclick="setBodyWeightTimeRange('1Y')">1Y</button>
                    <button class="pill-btn" onclick="setBodyWeightTimeRange('ALL')">All</button>
                </div>
                <div class="chart-container" id="bodyweight-chart-container">
                    <canvas id="bodyweight-chart"></canvas>
                </div>
                <div class="bodyweight-chart-actions">
                    <button class="btn btn-sm btn-outline" onclick="showWeightEntryModal()">
                        <i class="fas fa-plus"></i> Log Weight
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="showWeightHistory()">
                        <i class="fas fa-list"></i> History
                    </button>
                </div>
            </div>
        </div>
    `;
}

let currentBodyWeightTimeRange = '3M';

/**
 * Set time range and re-render the body weight chart.
 */
export async function setBodyWeightTimeRange(range) {
    currentBodyWeightTimeRange = range;

    // Update pill buttons
    const pills = document.querySelectorAll('#bodyweight-chart-section .pill-btn');
    pills.forEach(btn => {
        btn.classList.toggle('active', btn.textContent === range);
    });

    await renderBodyWeightChart();
}

/**
 * Render (or re-render) the body weight chart using Chart.js.
 */
export async function renderBodyWeightChart() {
    const canvas = document.getElementById('bodyweight-chart');
    if (!canvas) return;

    // Destroy previous chart
    if (bodyWeightChart) {
        bodyWeightChart.destroy();
        bodyWeightChart = null;
    }

    // Calculate start date from range
    const now = new Date();
    let startDate;
    switch (currentBodyWeightTimeRange) {
        case '3M': startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
        case '6M': startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
        case '1Y': startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
        case 'ALL': startDate = new Date(2020, 0, 1); break;
        default: startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const entries = await getBodyWeightSince(startDateStr);

    if (entries.length === 0) {
        const container = document.getElementById('bodyweight-chart-container');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-chart-line"></i></div>
                    <div class="empty-state-description">No weight data for this period.</div>
                </div>
            `;
        }
        return;
    }

    // Convert all to user's unit
    const unit = AppState.globalUnit || 'lbs';
    const converted = entries
        .filter(e => e.weight > 0) // Skip measurements-only
        .map(e => convertMeasurementUnit(e, unit));

    const movingAvg = calculate7DayAverage(converted);

    const labels = converted.map(e => {
        const d = new Date(e.date + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const ctx = canvas.getContext('2d');
    bodyWeightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `Weight (${unit})`,
                    data: converted.map(e => e.weight),
                    borderColor: 'rgba(0, 200, 180, 0.5)',
                    backgroundColor: 'rgba(0, 200, 180, 0.05)',
                    pointRadius: 3,
                    pointBackgroundColor: 'rgba(0, 200, 180, 0.7)',
                    borderWidth: 1.5,
                    tension: 0.1,
                    fill: false,
                },
                {
                    label: '7-Day Avg',
                    data: movingAvg.map(e => e.weight),
                    borderColor: 'rgba(0, 200, 180, 1)',
                    backgroundColor: 'rgba(0, 200, 180, 0.1)',
                    pointRadius: 0,
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#999',
                        boxWidth: 12,
                        padding: 12,
                        font: { size: 11 },
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 30, 30, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#ddd',
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        title: (items) => items[0]?.label || '',
                        label: (item) => `${item.dataset.label}: ${item.raw} ${unit}`,
                    },
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim() || '#666',
                        maxTicksLimit: 6,
                        font: { size: 10 },
                    },
                    grid: { display: false },
                },
                y: {
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim() || '#666',
                        font: { size: 10 },
                        callback: (v) => `${v}`,
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                    },
                },
            },
        },
    });
}

/**
 * Destroy the body weight chart (for cleanup when leaving Stats page).
 */
export function destroyBodyWeightChart() {
    if (bodyWeightChart) {
        bodyWeightChart.destroy();
        bodyWeightChart = null;
    }
}

