// Chart Trend — labeled line chart for the exercise-detail "heaviest per
// session" trend (UX-1 / mockup exercise-detail-v2). Unlike chart-line
// (preserveAspectRatio="none", stretched to fill), this keeps a uniform
// aspect ratio so axis <text> stays crisp and machine-change dots stay round.

/**
 * @param {Object} opts
 * @param {Array<{y:number, date?:string, equipment?:string|null}>} opts.points
 * @param {number} [opts.width=300]
 * @param {number} [opts.height=120]
 * @param {string} opts.color — CSS color for the line
 * @param {string} [opts.unit=''] — weight unit, for the aria-label
 * @param {boolean} [opts.markChanges=true] — flag machine-change points
 * @param {boolean} [opts.fill=true]
 * @param {string} [opts.ariaLabel]
 */
export function chartTrend({ points, width = 300, height = 120, color, unit = '', markChanges = true, fill = true, ariaLabel }) {
    if (!points || points.length === 0) return '<svg></svg>';

    const padL = 26;   // room for y-axis labels
    const padR = 6;
    const padT = 8;
    const padB = 18;   // room for x-axis date labels
    const ys = points.map(p => p.y);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const yRange = (yMax - yMin) || 1;

    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const xAt = i => padL + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
    const yAt = y => padT + plotH * (1 - (y - yMin) / yRange);

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(' ');

    const fillPath = fill && points.length > 1
        ? `${line} L${xAt(points.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${xAt(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
        : null;
    const gradId = `trend-grad-${(color || '').replace(/[^a-zA-Z0-9]/g, '')}`;

    // Dots: last point gets a gold marker when it's the peak; interior points
    // whose equipment differs from the previous session are warm "machine
    // changed" markers (the combined-view honesty cue from the mockup).
    const dots = points.map((p, i) => {
        const isLast = i === points.length - 1;
        const changed = markChanges && i > 0 && (p.equipment || null) !== (points[i - 1].equipment || null);
        if (!isLast && !changed) return '';
        const isPeak = p.y === yMax;
        const r = isLast ? 3.5 : 3;
        const fillC = isLast && isPeak ? 'var(--badge-gold)' : changed ? 'var(--warning)' : color;
        return `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="${r}" fill="${fillC}"/>`;
    }).join('');

    const gridLines = [0, 0.5, 1].map(f => {
        const y = (padT + plotH * f).toFixed(1);
        return `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="var(--border-light)" stroke-dasharray="2,4"/>`;
    }).join('');

    const round = n => Math.round(n);
    const xStart = points[0]?.date ? shortDate(points[0].date) : '';
    const xEnd = points[points.length - 1]?.date ? shortDate(points[points.length - 1].date) : '';

    const label = ariaLabel
        || `Heaviest weight per session trend, ${round(yMin)} to ${round(yMax)} ${unit}`.trim();

    return `
        <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${label}" class="chart-trend">
            ${gridLines}
            ${fillPath ? `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${color}" stop-opacity="0.25"/>
                <stop offset="1" stop-color="${color}" stop-opacity="0"/>
              </linearGradient></defs>
              <path d="${fillPath}" fill="url(#${gradId})"/>` : ''}
            <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            ${dots}
            <text class="chart-trend__axis" x="2" y="${(padT + 4).toFixed(1)}">${round(yMax)}</text>
            <text class="chart-trend__axis" x="2" y="${(padT + plotH).toFixed(1)}">${round(yMin)}</text>
            ${xStart ? `<text class="chart-trend__axis" x="${padL}" y="${(height - 4).toFixed(1)}">${xStart}</text>` : ''}
            ${xEnd ? `<text class="chart-trend__axis chart-trend__axis--end" x="${(width - padR).toFixed(1)}" y="${(height - 4).toFixed(1)}">${xEnd}</text>` : ''}
        </svg>
    `;
}

/** "2026-06-29" → "Jun 29". Safe on partial/empty input. */
function shortDate(dateStr) {
    if (!dateStr) return '';
    const parts = String(dateStr).split('-');
    if (parts.length < 3) return dateStr;
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
