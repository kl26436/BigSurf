// Chart Combo — bars + line overlay for drill-down pages

/**
 * Render a combined bar chart with line overlay SVG.
 * @param {Object} opts
 * @param {Array<{y: number}>} opts.bars — bar values
 * @param {Array<{y: number, pr?: boolean}>} opts.line — line data points
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {string} opts.barColor — CSS color
 * @param {string} opts.lineColor — CSS color
 * @param {number} [opts.padding=8]
 * @param {string} [opts.ariaLabel] — accessible description of the chart
 * @param {Object} [opts.axes] — {yMin,yMax,xStart,xEnd} crisp HTML labels
 */
export function chartComboBarsLine({ bars, line, width = 300, height = 140, barColor, lineColor, padding = 8, ariaLabel, axes }) {
    if (!bars || bars.length === 0) return '<svg></svg>';
    const allY = [...bars.map(b => b.y), ...(line || []).map(p => p.y)];
    const yMax = Math.max(...allY) || 1;
    const xStep = (width - padding * 2) / Math.max(1, bars.length);
    const yToPx = y => height - padding - (y / yMax) * (height - padding * 2);

    const barEls = bars.map((b, i) => {
        const x = padding + i * xStep;
        const barW = xStep * 0.7;
        const barH = (height - padding) - yToPx(b.y);
        const opacity = 0.3 + (i / bars.length) * 0.55;
        return `<rect x="${x.toFixed(1)}" y="${yToPx(b.y).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, barH).toFixed(1)}" fill="${barColor}" opacity="${opacity.toFixed(2)}" rx="2"/>`;
    }).join('');

    let lineHtml = '';
    if (line && line.length > 0) {
        const linePath = line.map((p, i) => {
            const x = padding + i * xStep + xStep * 0.35;
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yToPx(p.y).toFixed(1)}`;
        }).join(' ');

        const dots = line.map((p, i) => {
            const x = padding + i * xStep + xStep * 0.35;
            const isLast = i === line.length - 1;
            const isPR = p.pr;
            const r = isLast ? 4 : isPR ? 3 : 2.5;
            const stroke = isLast ? `stroke="var(--bg-card)" stroke-width="2"` : '';
            const fill = isPR ? 'var(--badge-gold)' : lineColor;
            return `<circle cx="${x.toFixed(1)}" cy="${yToPx(p.y).toFixed(1)}" r="${r}" fill="${fill}" ${stroke}/>`;
        }).join('');

        lineHtml = `
            <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            ${dots}
        `;
    }

    const gridLines = [1, 2, 3].map(i =>
        `<line x1="0" y1="${(height / 4) * i}" x2="${width}" y2="${(height / 4) * i}" stroke="var(--border-light)" stroke-dasharray="2,4"/>`
    ).join('');

    const a11y = `role="img" aria-label="${ariaLabel || 'Bar and line chart'}"`;
    const svg = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" ${a11y}>
            ${gridLines}
            ${barEls}
            ${lineHtml}
        </svg>
    `;

    if (!axes) return svg;
    // Crisp HTML axis labels (SVG <text> would distort under the non-uniform
    // scaling). Same wrapper markup as chart-line's wrapWithAxes.
    const axYMax = axes.yMax, axYMin = axes.yMin, axXStart = axes.xStart, axXEnd = axes.xEnd;
    return `
        <div class="chart-axes">
            <div class="chart-axes__y"><span>${axYMax != null ? axYMax : ''}</span><span>${axYMin != null ? axYMin : ''}</span></div>
            <div class="chart-axes__plot">${svg}</div>
            <div class="chart-axes__x"><span>${axXStart != null ? axXStart : ''}</span><span>${axXEnd != null ? axXEnd : ''}</span></div>
        </div>
    `;
}
