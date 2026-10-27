// Metric Detail UI — drill-down detail views for tappable metric cards

import { AppState } from '../utils/app-state.js';
import { escapeHtml } from './ui-helpers.js';
import { navigateTo, navigateBack } from './navigation.js';
import { confirmSheet } from './confirm-sheet.js';
import { formatRelativeDate as formatRelativeDateShared } from '../utils/date-helpers.js';

import { renderRangeFilter, getRangeBounds, rangeLabel, DEFAULT_RANGE, persistRange } from '../features/metrics/range-filter.js';
import { chartLine } from '../features/charts/chart-line.js';

// ===================================================================
// DETAIL RENDERERS REGISTRY
// ===================================================================

// Only body weight has a door (Home's Body card, More → Body & scans). The
// volume / strength / composition renderers were reachable only from
// metric-card-base.js, which nothing imported — deleted with it (UD-6).
const DETAIL_RENDERERS = {
    'body-weight': renderBodyWeightDetail,
};

// ===================================================================
// ENTRY POINTS
// ===================================================================

/**
 * Open a metric detail view.
 */
export function openMetricDetail(id) {
    AppState.activeMetricDetail = id;

    // Use navigateTo so all other sections (dashboard, stats, etc.) are hidden
    navigateTo('metric-detail');

    // Render content after navigation
    const container = document.getElementById('metric-detail-content');
    if (container) {
        const range = AppState.dashboardRange || DEFAULT_RANGE;
        const renderer = DETAIL_RENDERERS[id];
        if (renderer) {
            renderer(container, range);
        } else {
            container.innerHTML = renderUnknownMetric(id);
        }
    }
}

/**
 * Close the detail view — back to wherever it was opened from (SH-6: one
 * back system; it used to jump to the dashboard and hide the section by hand).
 */
export function closeMetricDetail() {
    navigateBack();
}

/**
 * Re-render the currently open detail with a new range.
 */
export function setDetailRange(range) {
    AppState.dashboardRange = range;
    persistRange(range);
    const id = AppState.activeMetricDetail;
    if (!id) return;
    const container = document.getElementById('metric-detail-content');
    const renderer = DETAIL_RENDERERS[id];
    if (container && renderer) renderer(container, range);
}

/**
 * Delete a body-weight entry from the breakdown list on the detail page.
 * Confirms first, then re-renders the page so chart/hero reflect the delete.
 */
export async function deleteBodyWeightEntry(entryId) {
    if (!entryId) return;
    // C-6 — the in-app sheet, never a native dialog.
    const ok = await confirmSheet({
        title: 'Delete this weight entry?',
        message: "This can't be undone.",
        confirmLabel: 'Delete entry',
        cancelLabel: 'Keep entry',
        destructive: true,
    });
    if (!ok) return;

    try {
        const { deleteBodyWeight } = await import('../features/body-measurements.js');
        await deleteBodyWeight(entryId);
    } catch (error) {
        console.error('❌ Delete weight entry failed:', error);
        return;
    }

    // Re-render at the current range so hero/chart/breakdown all refresh.
    const range = AppState.dashboardRange || DEFAULT_RANGE;
    const container = document.getElementById('metric-detail-content');
    const renderer = DETAIL_RENDERERS[AppState.activeMetricDetail];
    if (container && renderer) renderer(container, range);
}

// ===================================================================
// SHARED LAYOUT TEMPLATE
// ===================================================================

/**
 * Classify a BMI value into standard CDC/WHO adult categories.
 * Not medical advice — just a label to contextualize the number.
 */
function bmiCategory(bmi) {
    if (bmi < 18.5)  return { key: 'under',  label: 'Underweight' };
    if (bmi < 25)    return { key: 'normal', label: 'Normal' };
    if (bmi < 30)    return { key: 'over',   label: 'Overweight' };
    if (bmi < 35)    return { key: 'ob1',    label: 'Obese I' };
    if (bmi < 40)    return { key: 'ob2',    label: 'Obese II' };
    return              { key: 'ob3',    label: 'Obese III' };
}

// One label for logging a weigh-in, everywhere (UD-1 word table).
const LOG_WEIGHT_ACTION = '<button class="detail-breakdown-action" onclick="showWeightEntryModal()"><i class="fas fa-plus"></i> Log weight</button>';

function renderDetailLayout({ title, tag, range, hero, chart, insight, breakdown, breakdownAction }) {
    return `
        <div class="page-header page-header--detail">
            <button class="page-header__back" onclick="closeMetricDetail()" aria-label="Back">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="detail-page-header__title">${escapeHtml(title)}</div>
            ${tag ? `<div class="detail-page-header__tag">${escapeHtml(tag)}</div>` : ''}
        </div>
        <div class="md-body">
            ${renderRangeFilter(range, 'setDetailRange')}
            <div class="detail-hero">${hero}</div>
            <div class="detail-chart">${chart}</div>
            ${insight ? `<div class="detail-insight"><i class="fas fa-lightbulb"></i><div>${insight}</div></div>` : ''}
            <div class="detail-breakdown-head">
                <h3>Breakdown</h3>
                ${breakdownAction || ''}
            </div>
            ${breakdown}
        </div>
    `;
}

function renderUnknownMetric(id) {
    return `
        <div class="page-header page-header--detail">
            <button class="page-header__back" onclick="closeMetricDetail()" aria-label="Back">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="detail-page-header__title">${escapeHtml(id)}</div>
        </div>
        <div class="md-placeholder">
            Detail view coming soon.
        </div>
    `;
}

// ===================================================================
// BODY WEIGHT DETAIL
// ===================================================================

async function renderBodyWeightDetail(container, range) {
    container.innerHTML = '<div class="skeleton skeleton-card md-skel-tall"></div>';

    try {
        const { loadBodyWeightHistory } = await import('../features/body-measurements.js');
        const { displayWeight } = await import('./ui-helpers.js');
        const entries = await loadBodyWeightHistory(365);
        const userUnit = AppState.globalUnit || 'lbs';

        if (!entries || entries.length === 0) {
            // B11 — the empty page carries the way in (it used to point at
            // Settings, which has no weight path).
            container.innerHTML = renderDetailLayout({
                title: 'Body weight',
                range,
                hero: '<div class="md-empty">No weigh-ins yet</div>',
                chart: '',
                breakdown: '<div class="md-empty-line">Log your weight and the trend shows up here.</div>',
                breakdownAction: LOG_WEIGHT_ACTION,
            });
            return;
        }

        const bounds = getRangeBounds(range);
        const filtered = entries.filter(e => {
            if (!e.date) return false;
            const parts = e.date.split('-');
            const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            return d >= bounds.start && d <= bounds.end;
        });

        const raw = filtered.length > 0 ? filtered : entries.slice(-10);
        // Convert all weights to user's display unit
        const series = raw.map(e => {
            const dw = displayWeight(e.weight, e.unit || 'lbs', userUnit);
            return { ...e, displayWeight: dw.value, displayUnit: dw.label };
        });
        const unitLabel = series[0]?.displayUnit || userUnit;

        const points = series.map((e, i) => ({ x: i, y: e.displayWeight }));
        // 7-day moving average overlay — smooths noisy day-to-day swings. Uses a
        // simple trailing window: for each point, avg the last 7 entries (or
        // however many fit). Points align index-for-index with `points`.
        const maPoints = series.map((_, i) => {
            const start = Math.max(0, i - 6);
            const window = series.slice(start, i + 1);
            const sum = window.reduce((s, e) => s + e.displayWeight, 0);
            return { x: i, y: sum / window.length };
        });
        const latest = series[series.length - 1];
        const first = series[0];
        const delta = latest.displayWeight - first.displayWeight;
        const min = Math.min(...series.map(e => e.displayWeight));
        const max = Math.max(...series.map(e => e.displayWeight));
        const avg = series.reduce((s, e) => s + e.displayWeight, 0) / series.length;
        const goal = AppState.settings?.bodyWeightGoal;

        // Recent entries list — each row has a delete action for typo fixes.
        const recentEntries = series.slice(-5).reverse().map(e => {
            const dateLabel = formatRelativeDate(e.date);
            const entryId = escapeHtml(e.id || '');
            return `
                <div class="detail-row">
                    <div class="detail-weight-icon"><i class="fas fa-weight"></i></div>
                    <div class="detail-row__info">
                        <div class="detail-row__name">${dateLabel}</div>
                        <div class="detail-row__sub">${e.source || 'Manual'}</div>
                    </div>
                    <div class="detail-row__val">${e.displayWeight.toFixed(1)} ${unitLabel}</div>
                    <button class="detail-row__del" aria-label="Delete entry"
                            onclick="event.stopPropagation(); deleteBodyWeightEntry('${entryId}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }).join('');

        let insight = '';
        if (series.length >= 3 && delta !== 0) {
            const direction = delta < 0 ? 'losing' : 'gaining';
            const rate = Math.abs(delta / Math.max(1, bounds.days || 7) * 30).toFixed(1);
            insight = `You're ${direction} <strong>~${rate} ${unitLabel}/month</strong>.`;
            if (goal && delta < 0) {
                const remaining = latest.displayWeight - goal;
                if (remaining > 0) {
                    const weeks = Math.round(remaining / (Math.abs(delta) / Math.max(1, bounds.days || 7) * 7));
                    insight += ` On track to hit <strong>${goal} ${unitLabel} goal</strong> in ~${weeks} weeks.`;
                }
            }
        }

        // BMI — uses height + weight. Shows current value, category, and
        // delta across the selected range so users see the trend alongside.
        const heightCm = AppState.settings?.profileHeightCm;
        let bmiStr = '';
        if (heightCm && heightCm > 0) {
            const meters = heightCm / 100;
            const toKg = (wVal) => unitLabel === 'kg' ? wVal : wVal * 0.453592;
            const latestBmi = toKg(latest.displayWeight) / (meters * meters);
            const firstBmi = toKg(first.displayWeight) / (meters * meters);
            const bmiDelta = latestBmi - firstBmi;
            const cat = bmiCategory(latestBmi);
            const deltaLabel = Math.abs(bmiDelta) >= 0.1
                ? ` <span class="md-bmi-delta delta-${bmiDelta <= 0 ? 'up' : 'down'}">${bmiDelta < 0 ? '↓' : '↑'}${Math.abs(bmiDelta).toFixed(1)}</span>`
                : '';
            bmiStr = `<span>BMI <strong class="md-bmi-val bmi-${cat.key}">${latestBmi.toFixed(1)}</strong> <span class="md-bmi-cat">${cat.label}</span>${deltaLabel}</span>`;
        }

        container.innerHTML = renderDetailLayout({
            title: 'Body weight',
            tag: latest.source === 'withings' ? 'Withings' : null,
            range,
            hero: `
                <div class="detail-hero__num">${avg.toFixed(1)}<span class="detail-hero__unit">${unitLabel} avg</span></div>
                <div class="detail-hero__delta delta-${delta <= 0 ? 'up' : 'down'}">${delta < 0 ? '↓' : '↑'} ${Math.abs(delta).toFixed(1)} ${unitLabel} · ${rangeLabel(range)}</div>
                <div class="detail-hero__minmax">
                    <span>Min <strong>${min.toFixed(1)}</strong></span>
                    <span>Max <strong>${max.toFixed(1)}</strong></span>
                    ${goal ? `<span>Goal <strong class="md-goal-strong">${goal}</strong></span>` : ''}
                    ${bmiStr}
                </div>
            `,
            chart: chartLine({
                points, width: 300, height: 140, color: 'var(--cat-shoulders)',
                fill: true,
                goalY: goal || null, goalLabel: goal ? `Goal ${goal}` : null,
                // Only draw the MA when there's at least ~2 weeks of data, otherwise
                // it hugs the raw line and adds visual noise without value.
                overlay: series.length >= 14
                    ? { points: maPoints, color: 'var(--text-strong)' }
                    : null,
                ariaLabel: `Body weight trend, ${min.toFixed(1)} to ${max.toFixed(1)} ${unitLabel}`,
                axes: {
                    yMax: max.toFixed(1), yMin: min.toFixed(1),
                    xStart: shortAxisDate(first?.date), xEnd: shortAxisDate(latest?.date),
                },
            }),
            insight,
            breakdown: recentEntries || '<div class="md-empty-line">No recent entries.</div>',
            breakdownAction: LOG_WEIGHT_ACTION,
        });
    } catch (error) {
        console.error('❌ Error rendering body weight detail:', error);
        container.innerHTML = '<div class="md-error">Error loading body weight data.</div>';
    }
}

// ===================================================================
// HELPERS
// ===================================================================

function formatRelativeDate(dateStr) {
    return formatRelativeDateShared(dateStr, { daysAgo: true, weeksAgo: true });
}

/** "2026-06-29" → "Jun 29" for chart x-axis labels. Safe on empty input. */
function shortAxisDate(dateStr) {
    if (!dateStr) return '';
    const parts = String(dateStr).split('-');
    if (parts.length < 3) return dateStr;
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
