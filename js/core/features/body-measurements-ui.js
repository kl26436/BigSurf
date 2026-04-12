// Body Weight & Measurements UI — Phase 12.2, 12.3, 12.4
// Dashboard widget, weight entry modal, Stats chart, body measurements modal

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification, openModal, closeModal, displayWeight } from '../ui/ui-helpers.js';
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
 * Show the weight entry modal for quick daily logging.
 */
export function showWeightEntryModal() {
    const modal = document.getElementById('weight-entry-modal');
    if (!modal) return;

    const unit = AppState.globalUnit || 'lbs';

    modal.querySelector('.modal-content').innerHTML = `
        <div class="modal-header">
            <h3>Log Body Weight</h3>
            <button class="modal-close-btn" onclick="closeWeightEntryModal()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <div class="weight-entry-form">
                <div class="weight-input-row">
                    <input type="number" id="body-weight-input" class="weight-input-large"
                           placeholder="0" step="0.1" min="0" max="999" inputmode="decimal"
                           autofocus>
                    <span class="weight-input-unit">${unit}</span>
                </div>

                <div class="weight-entry-optional">
                    <div class="form-group">
                        <label>Body Fat % <span class="optional-label">(optional)</span></label>
                        <input type="number" id="body-fat-input" class="form-input"
                               placeholder="e.g. 15" step="0.1" min="0" max="100" inputmode="decimal">
                    </div>
                    <div class="form-group">
                        <label>Notes <span class="optional-label">(optional)</span></label>
                        <input type="text" id="body-weight-notes" class="form-input"
                               placeholder="e.g. Morning, fasted">
                    </div>
                </div>

                <button class="btn btn-primary btn-block" onclick="saveBodyWeightEntry()">
                    <i class="fas fa-check"></i> Save
                </button>
            </div>
        </div>
    `;

    openModal(modal);

    // Focus the input after modal opens
    setTimeout(() => {
        const input = document.getElementById('body-weight-input');
        if (input) input.focus();
    }, 100);
}

/**
 * Close the weight entry modal.
 */
export function closeWeightEntryModal() {
    const modal = document.getElementById('weight-entry-modal');
    if (modal) closeModal(modal);
}

/**
 * Save body weight from the entry modal.
 */
export async function saveBodyWeightEntry() {
    const weightInput = document.getElementById('body-weight-input');
    const fatInput = document.getElementById('body-fat-input');
    const notesInput = document.getElementById('body-weight-notes');

    const weight = parseFloat(weightInput?.value);
    if (!weight || weight <= 0) {
        showNotification('Enter a valid weight', 'warning');
        return;
    }

    const bodyFat = fatInput?.value ? parseFloat(fatInput.value) : null;
    const notes = notesInput?.value?.trim() || '';
    const unit = AppState.globalUnit || 'lbs';

    const result = await saveBodyWeight(weight, unit, { bodyFat, notes });
    if (result) {
        closeWeightEntryModal();
        // Refresh dashboard to show updated weight
        if (typeof window.showDashboard === 'function') {
            // Soft refresh — re-render dashboard
            const { renderDashboard } = await import('../ui/dashboard-ui.js');
        }
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

// ===================================================================
// HELPERS
// ===================================================================

function formatRelativeDate(dateStr) {
    const today = AppState.getTodayDateString();
    if (dateStr === today) return 'Today';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (dateStr === yesterdayStr) return 'Yesterday';

    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
