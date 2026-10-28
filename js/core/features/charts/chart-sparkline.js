// Chart Sparkline — mini SVG line for inside metric cards

/**
 * Render a mini sparkline SVG.
 * @param {Object} opts
 * @param {Array<{x: number, y: number}>} opts.points
 * @param {string} opts.color — CSS color or variable
 * @param {number} [opts.width=64]
 * @param {number} [opts.height=28]
 * @param {number} [opts.strokeWidth=2]
 * @param {boolean} [opts.dot=false] — mark the latest point (Home lift tiles)
 */
export function chartSparkline({ points, color, width = 64, height = 28, strokeWidth = 2, dot = false }) {
    if (!points || points.length === 0) return '';
    const ys = points.map(p => p.y);
    const yMin = Math.min(...ys);
    const yRange = (Math.max(...ys) - yMin) || 1;
    const xStep = width / Math.max(1, points.length - 1);
    const xy = points.map((p, i) => [i * xStep, height - (height - 4) * ((p.y - yMin) / yRange) - 2]);
    const path = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const [lx, ly] = xy[xy.length - 1];
    const end = dot ? `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.5" fill="${color}"/>` : '';
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" overflow="visible" aria-hidden="true">
        <path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>${end}
    </svg>`;
}
