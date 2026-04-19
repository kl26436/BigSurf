// Chart Donut — multi-arc donut for body composition

/**
 * Render a multi-arc donut SVG.
 * @param {Object} opts
 * @param {Array<{label: string, value: number, color: string}>} opts.segments — values should sum to ~100
 * @param {number} [opts.size=60]
 */
export function chartDonut({ segments, size = 60 }) {
    const radius = 15.915;
    let offset = 25;
    const arcs = segments.map(seg => {
        const len = seg.value;
        const arc = `<circle cx="21" cy="21" r="${radius}" fill="none" stroke="${seg.color}" stroke-width="6"
            stroke-dasharray="${len.toFixed(1)} ${(100 - len).toFixed(1)}"
            stroke-dashoffset="${offset.toFixed(1)}"
            transform="rotate(-90 21 21)"/>`;
        offset -= len;
        return arc;
    }).join('');
    return `<svg width="${size}" height="${size}" viewBox="0 0 42 42">${arcs}</svg>`;
}
