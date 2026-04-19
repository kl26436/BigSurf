// Chart Area Stacked — stacked area for body-part volume over time

const BODY_PART_COLORS = {
    chest:     'var(--cat-push)',
    back:      'var(--cat-pull)',
    legs:      'var(--cat-legs)',
    arms:      'var(--cat-arms)',
    core:      'var(--cat-core)',
    shoulders: 'var(--cat-shoulders)',
    cardio:    'var(--cat-cardio)',
};

/**
 * Render a stacked area chart for body-part-volume-over-time.
 * @param {Object} opts
 * @param {Array<{date: string, chest: number, back: number, legs: number, ...}>} opts.series
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} [opts.padding=0]
 */
export function chartAreaStacked({ series, width, height, padding = 0 }) {
    if (!series || series.length === 0) return '<svg></svg>';
    const parts = ['legs', 'chest', 'back', 'shoulders', 'arms', 'core', 'cardio'];
    const totals = series.map(p => parts.reduce((s, k) => s + (p[k] || 0), 0));
    const yMax = Math.max(...totals) || 1;
    const xStep = width / Math.max(1, series.length - 1);

    // Build cumulative paths bottom-up
    let cumulative = series.map(() => height);
    const layers = parts.map(part => {
        const newCumulative = series.map((p, i) => cumulative[i] - ((p[part] || 0) / yMax) * (height - padding));
        const top = newCumulative.map((y, i) => `${i === 0 ? 'M' : 'L'}${(i * xStep).toFixed(1)},${y.toFixed(1)}`).join(' ');
        const bottom = cumulative.slice().reverse().map((y, i) => `L${((series.length - 1 - i) * xStep).toFixed(1)},${y.toFixed(1)}`).join(' ');
        const path = `${top} ${bottom} Z`;
        cumulative = newCumulative;
        return `<path d="${path}" fill="${BODY_PART_COLORS[part] || 'var(--text-muted)'}" opacity="0.85"/>`;
    });

    const gridLines = [1, 2, 3].map(i =>
        `<line x1="0" y1="${(height / 4) * i}" x2="${width}" y2="${(height / 4) * i}" stroke="var(--border-light)" stroke-dasharray="2,4"/>`
    ).join('');

    return `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            ${gridLines}
            ${layers.join('')}
        </svg>
    `;
}
