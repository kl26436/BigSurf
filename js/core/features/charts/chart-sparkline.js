// Chart Sparkline — mini SVG line for inside metric cards

/**
 * Render a mini sparkline SVG.
 * @param {Object} opts
 * @param {Array<{x: number, y: number}>} opts.points
 * @param {string} opts.color — CSS color or variable
 * @param {number} [opts.width=64]
 * @param {number} [opts.height=28]
 */
export function chartSparkline({ points, color, width = 64, height = 28 }) {
    if (!points || points.length === 0) return '';
    const ys = points.map(p => p.y);
    const yMin = Math.min(...ys);
    const yRange = (Math.max(...ys) - yMin) || 1;
    const xStep = width / Math.max(1, points.length - 1);
    const path = points.map((p, i) => {
        const x = i * xStep;
        const y = height - (height - 4) * ((p.y - yMin) / yRange) - 2;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}
