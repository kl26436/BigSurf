// Chart Line — SVG line chart with optional goal line and gradient fill

/**
 * Render an SVG line chart.
 * @param {Object} opts
 * @param {Array<{x: number|string, y: number}>} opts.points
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {string} opts.color — CSS color
 * @param {boolean} [opts.fill=false] — add gradient fill below line
 * @param {number} [opts.goalY] — draw a dashed goal line at this y value
 * @param {string} [opts.goalLabel] — label for goal line
 * @param {Object} [opts.overlay] — optional second series drawn on top
 * @param {Array<{x:*,y:number}>} [opts.overlay.points]
 * @param {string} [opts.overlay.color]
 * @param {number} [opts.padding=8]
 */
export function chartLine({ points, width, height, color, fill = false, goalY, goalLabel, overlay, padding = 8 }) {
    if (!points || points.length === 0) return '<svg></svg>';
    const ys = points.map(p => p.y);
    const overlayYs = overlay?.points?.map(p => p.y) || [];
    const yMin = Math.min(...ys, ...overlayYs, goalY ?? Infinity);
    const yMax = Math.max(...ys, ...overlayYs, goalY ?? -Infinity);
    const yRange = (yMax - yMin) || 1;

    const xStep = (width - padding * 2) / Math.max(1, points.length - 1);
    const yToPx = y => padding + (height - padding * 2) * (1 - (y - yMin) / yRange);

    const path = points.map((p, i) => {
        const x = padding + i * xStep;
        const y = yToPx(p.y);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    // Overlay uses the same x grid so it aligns point-for-point with the main series.
    let overlayPath = '';
    if (overlay?.points?.length) {
        const op = overlay.points.map((p, i) => {
            const x = padding + i * xStep;
            const y = yToPx(p.y);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        overlayPath = `<path d="${op}" fill="none" stroke="${overlay.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4,3" opacity="0.85"/>`;
    }

    const gradId = `grad-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

    const fillPath = fill
        ? `${path} L${(padding + (points.length - 1) * xStep).toFixed(1)},${(height - padding).toFixed(1)} L${padding.toFixed(1)},${(height - padding).toFixed(1)} Z`
        : null;

    const goalEl = goalY != null
        ? `<line x1="${padding}" y1="${yToPx(goalY).toFixed(1)}" x2="${width - padding}" y2="${yToPx(goalY).toFixed(1)}"
                  stroke="${color}" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>
           ${goalLabel ? `<text x="${width - padding}" y="${(yToPx(goalY) - 3).toFixed(1)}" fill="${color}" font-size="9" text-anchor="end">${goalLabel}</text>` : ''}`
        : '';

    const gridLines = [1, 2, 3].map(i =>
        `<line x1="0" y1="${(height / 4) * i}" x2="${width}" y2="${(height / 4) * i}" stroke="var(--border-light)" stroke-dasharray="2,4"/>`
    ).join('');

    return `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            ${gridLines}
            ${goalEl}
            ${fill ? `<defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="${color}"/>
                  <stop offset="1" stop-color="${color}" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path d="${fillPath}" fill="url(#${gradId})" opacity="0.3"/>` : ''}
            <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            ${overlayPath}
        </svg>
    `;
}
