// Metric Card Base — shared render template for tappable dashboard cards

import { escapeHtml } from '../../ui/ui-helpers.js';

/**
 * Render a generic tappable metric card.
 *
 * @param {Object} opts
 * @param {string} opts.id           Unique ID — also used as drill-down key
 * @param {string} opts.label        e.g. "Volume by Body Part"
 * @param {string} opts.icon         FA icon class (without "fa-")
 * @param {string} opts.iconColor    CSS color or token
 * @param {string} opts.value        Big number (already formatted)
 * @param {string} opts.unit         e.g. "lb this week"
 * @param {string} [opts.delta]      e.g. "↑ 12% vs last week"
 * @param {'up'|'down'} [opts.deltaDir]
 * @param {string} [opts.body]       HTML for chart / breakdown
 * @param {string} [opts.tag]        Optional tag (e.g. "Withings")
 * @param {boolean} [opts.drillable=true] Show chevron and make tappable
 */
export function renderMetricCard({ id, label, icon, iconColor, value, unit, delta, deltaDir, body, tag, drillable = true }) {
    const onclick = drillable ? `onclick="openMetricDetail('${id}')"` : '';
    return `
        <div class="metric-card" data-metric="${id}" ${onclick}>
            <div class="metric-card__head">
                <div class="metric-card__label">
                    <i class="fas fa-${icon}" style="--icon-color:${iconColor};"></i>
                    ${escapeHtml(label)}
                    ${tag ? `<span class="metric-card__tag">${escapeHtml(tag)}</span>` : ''}
                </div>
                ${drillable ? '<i class="fas fa-chevron-right metric-card__chev"></i>' : ''}
            </div>
            ${value ? `<div class="metric-card__val">${value}<span class="metric-card__unit">${unit || ''}</span></div>` : ''}
            ${delta ? `<div class="metric-card__delta delta-${deltaDir || 'up'}">${delta}</div>` : ''}
            ${body ? `<div class="metric-card__body">${body}</div>` : ''}
        </div>
    `;
}
