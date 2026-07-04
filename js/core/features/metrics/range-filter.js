// Range Filter — shared state for dashboard time range
// D / W / M / 3M / Y / All

import { AppState } from '../../utils/app-state.js';
import { setRangeFunctions } from './aggregators.js';

// One canonical option set + default for every drill-down (exercise, muscle
// group, metric detail). 6M is included so the exercise-detail long-trend view
// keeps its range; W stays for the shorter-window surfaces.
export const RANGES = ['W', 'M', '3M', '6M', 'Y', 'All'];
export const DEFAULT_RANGE = 'M';

const RANGE_DAYS = {
    W: 7, M: 30, '3M': 90, '6M': 180, Y: 365, All: Infinity,
};

/**
 * Persist the drill-down range pick to user settings so it survives reloads.
 * Dynamic import avoids a static cycle with settings-ui. Fire-and-forget.
 */
export function persistRange(range) {
    import('../../ui/settings-ui.js')
        .then(m => m.updateSetting('dashboardRange', range))
        .catch(() => { /* non-critical */ });
}

/**
 * Get the start/end Date pair for the current range.
 * "All" returns from epoch.
 */
export function getRangeBounds(range = AppState.dashboardRange || 'W') {
    const end = new Date();
    const start = new Date();
    const days = RANGE_DAYS[range];
    if (days === Infinity) {
        start.setTime(0);
    } else {
        start.setDate(end.getDate() - days);
    }
    return { start, end, days };
}

/**
 * Get the bounds for the PREVIOUS range (for delta calculations).
 */
export function getPreviousRangeBounds(range = AppState.dashboardRange || 'W') {
    const { start } = getRangeBounds(range);
    const days = RANGE_DAYS[range];
    if (days === Infinity) return null;
    const prevEnd = new Date(start);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - days);
    return { start: prevStart, end: prevEnd };
}

/**
 * Set the active range and notify subscribers.
 */
const subscribers = new Set();
export function setRange(range) {
    AppState.dashboardRange = range;
    subscribers.forEach(fn => fn(range));
}
export function subscribeRange(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}

/**
 * Human-readable label for a range.
 */
export function rangeLabel(range) {
    const labels = { W: 'week', M: 'month', '3M': '3 months', '6M': '6 months', Y: 'year', All: 'all time' };
    return labels[range] || range;
}

/**
 * Render the range filter pills.
 */
// Wire range functions into aggregators (avoids circular dependency)
setRangeFunctions(getRangeBounds, getPreviousRangeBounds);

// `handler` is the window-level onclick function name for a pill tap — every
// surface shares this one widget and just passes its own setter (setDashboardRange
// / setDetailRange / setExerciseRange / setMuscleRange). No more regex-rewiring
// the rendered HTML.
export function renderRangeFilter(activeRange, handler = 'setDashboardRange') {
    return `
        <div class="range-filter" role="tablist" aria-label="Time range">
            ${RANGES.map(r => `
                <button class="${r === activeRange ? 'active' : ''}"
                        onclick="${handler}('${r}')"
                        role="tab" aria-selected="${r === activeRange}">${r}</button>
            `).join('')}
        </div>
    `;
}
