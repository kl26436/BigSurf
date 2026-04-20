// Metric Detail UI — drill-down detail views for tappable metric cards

import { AppState } from '../utils/app-state.js';
import { escapeHtml } from './ui-helpers.js';
import { setBottomNavVisible, updateBottomNavActive, navigateTo } from './navigation.js';
import { setHeaderMode } from './ui-helpers.js';

import { renderRangeFilter, getRangeBounds, getPreviousRangeBounds, rangeLabel } from '../features/metrics/range-filter.js';
import {
    aggregateVolumeByBodyPart, aggregateVolumeTimeseries,
    aggregate1RMSeries, countSessionsAndSets, bodyPartTrendPoints,
    formatNumber, formatVolume, capitalize, BP_TO_CAT,
} from '../features/metrics/aggregators.js';
import { chartSparkline } from '../features/charts/chart-sparkline.js';
import { chartLine } from '../features/charts/chart-line.js';
import { chartAreaStacked } from '../features/charts/chart-area-stacked.js';
import { chartDonut } from '../features/charts/chart-donut.js';

// ===================================================================
// DETAIL RENDERERS REGISTRY
// ===================================================================

const DETAIL_RENDERERS = {
    'volume-by-body-part': renderVolumeBodyPartDetail,
    'strength-top-lifts': renderStrengthDetail,
    'body-weight': renderBodyWeightDetail,
    'body-composition': renderBodyCompositionDetail,
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
        const range = AppState.dashboardRange || 'W';
        const renderer = DETAIL_RENDERERS[id];
        if (renderer) {
            renderer(container, range);
        } else {
            container.innerHTML = renderUnknownMetric(id);
        }
    }
}

/**
 * Close the detail view and return to dashboard.
 */
export function closeMetricDetail() {
    const section = document.getElementById('metric-detail-section');
    if (section) section.classList.add('hidden');
    navigateTo('dashboard');
}

/**
 * Re-render the currently open detail with a new range.
 */
export function setDetailRange(range) {
    AppState.dashboardRange = range;
    const id = AppState.activeMetricDetail;
    if (!id) return;
    const container = document.getElementById('metric-detail-content');
    const renderer = DETAIL_RENDERERS[id];
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

function renderDetailLayout({ title, tag, range, hero, chart, insight, breakdown }) {
    return `
        <div class="detail-page-header">
            <button class="detail-page-header__back" onclick="closeMetricDetail()">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="detail-page-header__title">${escapeHtml(title)}</div>
            ${tag ? `<div class="detail-page-header__tag">${escapeHtml(tag)}</div>` : ''}
        </div>
        <div class="md-body">
            ${renderRangeFilter(range).replace(/setDashboardRange/g, 'setDetailRange')}
            <div class="detail-hero">${hero}</div>
            <div class="detail-chart">${chart}</div>
            ${insight ? `<div class="detail-insight"><i class="fas fa-lightbulb"></i><div>${insight}</div></div>` : ''}
            <div class="detail-breakdown-head"><h3>Breakdown</h3></div>
            ${breakdown}
        </div>
    `;
}

function renderUnknownMetric(id) {
    return `
        <div class="detail-page-header">
            <button class="detail-page-header__back" onclick="closeMetricDetail()">
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
// VOLUME BY BODY PART DETAIL
// ===================================================================

async function renderVolumeBodyPartDetail(container, range) {
    container.innerHTML = '<div class="skeleton skeleton-card md-skel-tall"></div>';

    try {
        const { StatsTracker } = await import('../features/stats-tracker.js');
        const workouts = await StatsTracker.getRecentWorkouts(100);

        const bounds = getRangeBounds(range);
        const prevBounds = getPreviousRangeBounds(range);
        const cur = aggregateVolumeByBodyPart(workouts, bounds);
        const prev = prevBounds ? aggregateVolumeByBodyPart(workouts, prevBounds) : null;
        const series = aggregateVolumeTimeseries(workouts, bounds, range === 'W' ? 'day' : 'week');

        const total = Object.values(cur).reduce((s, v) => s + v, 0);
        const prevTotal = prev ? Object.values(prev).reduce((s, v) => s + v, 0) : null;
        const deltaPct = prevTotal ? Math.round((total - prevTotal) / prevTotal * 100) : null;

        // Generate insight
        const bodyParts = ['chest', 'back', 'legs', 'arms', 'core', 'shoulders'];
        let insight = '';
        if (prev) {
            const changes = bodyParts.map(bp => ({
                bp,
                cur: cur[bp] || 0,
                prev: prev[bp] || 0,
                pct: prev[bp] ? Math.round((cur[bp] - prev[bp]) / prev[bp] * 100) : 0,
            })).filter(c => c.prev > 0);
            const best = changes.reduce((max, c) => c.pct > max.pct ? c : max, { pct: -Infinity });
            const worst = changes.reduce((min, c) => c.pct < min.pct ? c : min, { pct: Infinity });
            if (best.bp && worst.bp && best.bp !== worst.bp) {
                insight = `Your <strong>${best.bp}</strong> volume is up <strong>${best.pct}%</strong> this ${rangeLabel(range)} while <strong>${worst.bp}</strong> is ${worst.pct >= 0 ? 'up' : 'down'} ${Math.abs(worst.pct)}%.`;
            }
        }

        const breakdownItems = bodyParts.map(part => {
            const { sessions, sets } = countSessionsAndSets(workouts, part, bounds);
            const trend = bodyPartTrendPoints(workouts, part, bounds);
            const prevPart = prev?.[part] || 0;
            const partDelta = prevPart ? Math.round(((cur[part] || 0) - prevPart) / prevPart * 100) : null;
            const color = `var(--cat-${BP_TO_CAT[part] || part})`;
            return `
                <div class="detail-row">
                    ${chartSparkline({ points: trend, color, width: 64, height: 28 })}
                    <div class="detail-row__info">
                        <div class="detail-row__name">${capitalize(part)}</div>
                        <div class="detail-row__sub">${sessions} sessions · ${sets} sets</div>
                    </div>
                    <div class="detail-row__right">
                        <div class="detail-row__val">${formatVolume(cur[part] || 0)} lb</div>
                        ${partDelta != null ? `<div class="detail-row__delta delta-${partDelta >= 0 ? 'up' : 'down'}">${partDelta >= 0 ? '↑' : '↓'} ${Math.abs(partDelta)}%</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = renderDetailLayout({
            title: 'Volume by Body Part',
            range,
            hero: `
                <div class="detail-hero__num">${formatNumber(total)}<span class="detail-hero__unit">lb</span></div>
                ${deltaPct != null ? `<div class="detail-hero__delta delta-${deltaPct >= 0 ? 'up' : 'down'}">${deltaPct >= 0 ? '↑' : '↓'} ${Math.abs(deltaPct)}% vs previous ${rangeLabel(range)}</div>` : ''}
            `,
            chart: chartAreaStacked({ series, width: 300, height: 140 }),
            insight,
            breakdown: breakdownItems,
        });
    } catch (error) {
        console.error('❌ Error rendering volume detail:', error);
        container.innerHTML = '<div class="md-error">Error loading volume data.</div>';
    }
}

// ===================================================================
// STRENGTH / TOP LIFTS DETAIL
// ===================================================================

async function renderStrengthDetail(container, range) {
    container.innerHTML = '<div class="skeleton skeleton-card md-skel-tall"></div>';

    try {
        const { StatsTracker } = await import('../features/stats-tracker.js');
        const workouts = await StatsTracker.getRecentWorkouts(100);
        const bounds = getRangeBounds(range);

        const bigLifts = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press'];
        const liftRows = bigLifts.map(lift => {
            const series = aggregate1RMSeries(workouts, lift, bounds);
            const points = series.map((p, i) => ({ x: i, y: Math.round(p.oneRM) }));
            const latest = series.length > 0 ? Math.round(series[series.length - 1].oneRM) : 0;
            const first = series.length > 1 ? Math.round(series[0].oneRM) : latest;
            const delta = latest - first;

            return `
                <div class="detail-row">
                    ${chartSparkline({ points, color: 'var(--warning)', width: 64, height: 28 })}
                    <div class="detail-row__info">
                        <div class="detail-row__name">${escapeHtml(lift)}</div>
                        <div class="detail-row__sub">${series.length} sessions</div>
                    </div>
                    <div class="detail-row__right">
                        <div class="detail-row__val">${latest} lb</div>
                        ${delta !== 0 ? `<div class="detail-row__delta delta-${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)} lb</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Compute total combined 1RM
        let totalCurrent = 0;
        for (const lift of bigLifts) {
            const series = aggregate1RMSeries(workouts, lift, bounds);
            if (series.length > 0) totalCurrent += Math.round(series[series.length - 1].oneRM);
        }

        container.innerHTML = renderDetailLayout({
            title: 'Strength · Top Lifts',
            range,
            hero: `
                <div class="detail-hero__num">${formatNumber(totalCurrent)}<span class="detail-hero__unit">lb combined</span></div>
                <div class="md-hero-meta">Estimated 1RM · Epley formula</div>
            `,
            chart: '<div class="md-chart-placeholder">Per-lift trends below</div>',
            insight: totalCurrent > 0 ? `Your combined estimated 1RM across the big 4 lifts is <strong>${formatNumber(totalCurrent)} lb</strong>.` : '',
            breakdown: liftRows || '<div class="md-empty-line">No compound lift data in this range.</div>',
        });
    } catch (error) {
        console.error('❌ Error rendering strength detail:', error);
        container.innerHTML = '<div class="md-error">Error loading strength data.</div>';
    }
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
            container.innerHTML = renderDetailLayout({
                title: 'Body Weight',
                range,
                hero: '<div class="md-empty">No body weight entries yet.</div>',
                chart: '',
                breakdown: '<div class="md-empty-line">Add weight entries in Settings to see trends.</div>',
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
        const latest = series[series.length - 1];
        const first = series[0];
        const delta = latest.displayWeight - first.displayWeight;
        const min = Math.min(...series.map(e => e.displayWeight));
        const max = Math.max(...series.map(e => e.displayWeight));
        const avg = series.reduce((s, e) => s + e.displayWeight, 0) / series.length;
        const goal = AppState.settings?.bodyWeightGoal;

        // Recent entries list
        const recentEntries = series.slice(-5).reverse().map(e => {
            const dateLabel = formatRelativeDate(e.date);
            return `
                <div class="detail-row">
                    <div class="detail-weight-icon"><i class="fas fa-weight"></i></div>
                    <div class="detail-row__info">
                        <div class="detail-row__name">${dateLabel}</div>
                        <div class="detail-row__sub">${e.source || 'Manual'}</div>
                    </div>
                    <div class="detail-row__val">${e.displayWeight.toFixed(1)} ${unitLabel}</div>
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

        // BMI — uses the latest weight (converted to kg) and the user's height
        // from the profile. Only rendered when height is set.
        const heightCm = AppState.settings?.profileHeightCm;
        let bmiStr = '';
        if (heightCm && heightCm > 0) {
            // Convert latest displayed weight back to kg for the BMI formula.
            const latestKg = unitLabel === 'kg'
                ? latest.displayWeight
                : latest.displayWeight * 0.453592;
            const meters = heightCm / 100;
            const bmi = latestKg / (meters * meters);
            const cat = bmiCategory(bmi);
            bmiStr = `<span>BMI <strong class="md-bmi-val bmi-${cat.key}">${bmi.toFixed(1)}</strong> <span class="md-bmi-cat">${cat.label}</span></span>`;
        }

        container.innerHTML = renderDetailLayout({
            title: 'Body Weight',
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
            }),
            insight,
            breakdown: recentEntries || '<div class="md-empty-line">No recent entries.</div>',
        });
    } catch (error) {
        console.error('❌ Error rendering body weight detail:', error);
        container.innerHTML = '<div class="md-error">Error loading body weight data.</div>';
    }
}

// ===================================================================
// BODY COMPOSITION DETAIL
// ===================================================================

async function renderBodyCompositionDetail(container, range) {
    container.innerHTML = '<div class="skeleton skeleton-card md-skel-tall"></div>';

    try {
        const { loadDexaHistory, getLatestDexaScan, compareDexaScans } = await import('../features/dexa-scan.js');
        const history = await loadDexaHistory(10);

        if (!history || history.length === 0) {
            container.innerHTML = renderDetailLayout({
                title: 'Body Composition',
                range,
                hero: '<div class="md-empty">No DEXA scans uploaded yet.</div>',
                chart: '',
                breakdown: '<div class="md-empty-line">Upload a DEXA scan PDF to see body composition breakdown.</div>',
            });
            return;
        }

        const latest = history[0]?.data || {};
        const fatPct = latest.bodyFatPercentage || latest.totalBodyFat || 0;
        const leanMass = latest.totalLeanMass || 0;
        const fatMass = latest.totalFatMass || 0;
        const totalWeight = latest.totalWeight || (leanMass + fatMass) || 0;
        const musclePct = totalWeight > 0 ? Math.round(leanMass / totalWeight * 100) : 0;
        const otherPct = Math.max(0, 100 - fatPct - musclePct);

        const segments = [
            { label: `Muscle ${musclePct}%`, value: musclePct, color: 'var(--cat-legs)' },
            { label: `Fat ${Math.round(fatPct)}%`, value: fatPct, color: 'var(--cat-pull)' },
            { label: `Other ${otherPct}%`, value: otherPct, color: 'var(--cat-shoulders)' },
        ];

        // Comparison if multiple scans
        let insight = '';
        if (history.length >= 2) {
            try {
                const comparison = compareDexaScans(history[1].data, history[0].data);
                if (comparison) {
                    const leanDelta = comparison.totalLeanMass?.toFixed(1) || '0';
                    const fatDelta = comparison.totalFatMass?.toFixed(1) || '0';
                    insight = `Since last scan: lean mass <strong>${leanDelta > 0 ? '+' : ''}${leanDelta} lb</strong>, fat mass <strong>${fatDelta > 0 ? '+' : ''}${fatDelta} lb</strong>.`;
                }
            } catch { /* comparison may fail */ }
        }

        // Scan history list
        const scanRows = history.slice(0, 5).map(scan => {
            const data = scan.data || {};
            const date = data.date || scan.id;
            const fat = data.bodyFatPercentage || data.totalBodyFat || 0;
            return `
                <div class="detail-row">
                    <div class="detail-weight-icon"><i class="fas fa-file-medical"></i></div>
                    <div class="detail-row__info">
                        <div class="detail-row__name">${formatRelativeDate(date)}</div>
                        <div class="detail-row__sub">DEXA Scan</div>
                    </div>
                    <div class="detail-row__val">${Math.round(fat)}% BF</div>
                </div>
            `;
        }).join('');

        container.innerHTML = renderDetailLayout({
            title: 'Body Composition',
            range,
            hero: `
                <div class="md-bc-row">
                    ${chartDonut({ segments, size: 80 })}
                    <div class="dash-bc-legend md-bc-legend">
                        ${segments.map(s => `<div class="dash-bc-leg"><div class="dash-bc-dot" style="--dot-color:${s.color};"></div>${s.label}</div>`).join('')}
                    </div>
                </div>
            `,
            chart: '<div class="md-chart-placeholder">DEXA scan history below</div>',
            insight,
            breakdown: scanRows || '<div class="md-empty-line">No scan history.</div>',
        });
    } catch (error) {
        console.error('❌ Error rendering body composition detail:', error);
        container.innerHTML = '<div class="md-error">Error loading composition data.</div>';
    }
}

// ===================================================================
// HELPERS
// ===================================================================

function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const today = new Date();
    const diff = Math.floor((today - date) / (1000 * 60 * 60 * 24));

    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff} days ago`;
    if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
