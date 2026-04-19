// Composition Detail — drill-down from dashboard composition card
// Shows DEXA summary, body weight trend, and links to upload/history

import { AppState } from '../utils/app-state.js';
import { escapeHtml } from './ui-helpers.js';
import { chartDonut } from '../features/charts/chart-donut.js';
import { chartSparkline } from '../features/charts/chart-sparkline.js';

export async function renderCompositionDetail() {
    const container = document.getElementById('composition-detail-content');
    if (!container) return;

    container.innerHTML = `<div class="skeleton skeleton-card" style="height:200px;"></div>`;

    // Load DEXA + body weight data in parallel
    let scan = null;
    let prevScan = null;
    let bwEntries = [];

    try {
        const [dexaMod, bwMod] = await Promise.all([
            import('../features/dexa-scan.js'),
            import('../features/body-measurements.js'),
        ]);

        const history = await dexaMod.loadDexaHistory(5);
        if (history && history.length > 0) {
            scan = history[0];
            if (history.length > 1) prevScan = history[1];
        }

        bwEntries = await bwMod.loadBodyWeightHistory(90) || [];
    } catch (e) {
        console.error('Error loading composition data:', e);
    }

    const hasDexa = scan && scan.totalBodyFat != null;
    const userUnit = AppState.globalUnit || 'lbs';

    container.innerHTML = `
        <div class="d-header">
            <button class="d-back" onclick="navigateBack()"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info">
                <div class="d-header-icon ic-core"><i class="fas fa-circle-nodes"></i></div>
                <div>
                    <div class="d-title">Composition</div>
                    <div class="d-subtitle">${hasDexa ? `Last scan: ${formatDate(scan.date)}` : 'No DEXA data yet'}</div>
                </div>
            </div>
        </div>
        <div class="d-content">
            ${hasDexa ? renderDexaSummary(scan, prevScan) : renderNoDexaState()}
            ${renderBodyWeightSection(bwEntries, userUnit)}
            ${renderActions(hasDexa)}
        </div>
    `;
}

function renderDexaSummary(scan, prev) {
    const fatPct = Math.round(scan.totalBodyFat || 0);
    const leanMass = scan.totalLeanMass || scan.leanMass || 0;
    const fatMass = scan.totalFatMass || scan.fatMass || 0;
    const boneMass = scan.boneMass || 0;
    const totalWeight = scan.totalWeight || 0;
    const musclePct = totalWeight > 0 ? Math.round((leanMass / totalWeight) * 100) : 0;
    const waterPct = Math.max(0, 100 - fatPct - musclePct);

    const segments = [
        { label: `Muscle ${musclePct}%`, value: musclePct, color: 'var(--cat-legs)' },
        { label: `Fat ${fatPct}%`, value: fatPct, color: 'var(--cat-pull)' },
        { label: `Water ${waterPct}%`, value: waterPct, color: 'var(--cat-shoulders)' },
    ];

    return `
        <div style="display:flex;align-items:center;gap:14px;padding:16px 14px;">
            ${chartDonut({ segments, size: 80 })}
            <div class="bc-legend" style="gap:6px;">
                ${segments.map(s => `<div class="bc-leg"><div class="bc-dot" style="background:${s.color};"></div>${s.label}</div>`).join('')}
            </div>
        </div>

        <div class="d-sec-head">Summary${prev ? ` <span style="font-size:var(--font-xs);color:var(--text-muted);font-weight:400;">vs ${formatDate(prev.date)}</span>` : ''}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 14px 14px;">
            ${renderStatCard('Body fat', fatPct, '%', prev ? Math.round(prev.totalBodyFat || 0) : null, true)}
            ${renderStatCard('Lean mass', Math.round(leanMass * 10) / 10, ` ${scan.unit || 'lb'}`, prev?.totalLeanMass || prev?.leanMass, false)}
            ${renderStatCard('Fat mass', Math.round(fatMass * 10) / 10, ` ${scan.unit || 'lb'}`, prev?.totalFatMass || prev?.fatMass, true)}
            ${renderStatCard('Bone', Math.round(boneMass * 10) / 10, ` ${scan.unit || 'lb'}`, prev?.boneMass, false)}
        </div>

        ${renderInsight(scan, prev)}
        ${renderRegionalBars(scan)}
        ${scan.vat != null ? renderVisceralFat(scan) : ''}
    `;
}

function renderStatCard(label, val, unit, prevVal, lowerIsBetter) {
    let deltaHtml = '';
    if (prevVal != null && val != null) {
        const delta = val - prevVal;
        if (Math.abs(delta) >= 0.05) {
            const isGood = (delta < 0) === lowerIsBetter;
            const cls = isGood ? 'up' : 'down';
            const arrow = delta > 0 ? '↑' : '↓';
            deltaHtml = `<div class="stat-delta ${cls}">${arrow} ${Math.abs(delta).toFixed(1)}${unit}</div>`;
        }
    }
    return `
        <div class="stat-card">
            <div class="stat-label">${label}</div>
            <div class="stat-val">${val != null ? (typeof val === 'number' ? val.toFixed(1) : val) : '—'}<span class="stat-unit">${unit}</span></div>
            ${deltaHtml}
        </div>
    `;
}

function renderInsight(scan, prev) {
    if (!prev) return '';
    const leanDelta = (scan.totalLeanMass || scan.leanMass || 0) - (prev.totalLeanMass || prev.leanMass || 0);
    const fatDelta = (scan.totalFatMass || scan.fatMass || 0) - (prev.totalFatMass || prev.fatMass || 0);

    let message = '';
    if (leanDelta > 0 && fatDelta < 0) {
        message = `Strong recomp trend: you added <strong>${leanDelta.toFixed(1)} lb of lean mass</strong> while losing <strong>${Math.abs(fatDelta).toFixed(1)} lb of fat</strong>.`;
    } else if (leanDelta > 0) {
        message = `You gained <strong>${leanDelta.toFixed(1)} lb of lean mass</strong> since your last scan.`;
    } else if (fatDelta < 0) {
        message = `You lost <strong>${Math.abs(fatDelta).toFixed(1)} lb of fat</strong> since your last scan.`;
    }
    if (!message) return '';

    return `
        <div class="dexa-insight-card" style="margin:0 14px 14px;">
            <i class="fas fa-lightbulb"></i>
            <div>${message}</div>
        </div>
    `;
}

function renderRegionalBars(scan) {
    const leanMass = scan.leanMass;
    if (!leanMass || typeof leanMass !== 'object') return '';

    const trunk = leanMass.trunk || 0;
    const arms = (leanMass.leftArm || 0) + (leanMass.rightArm || 0);
    const legs = (leanMass.leftLeg || 0) + (leanMass.rightLeg || 0);
    const maxVal = Math.max(trunk, arms, legs, 1);

    // L/R balance
    const leftTotal = (leanMass.leftArm || 0) + (leanMass.leftLeg || 0);
    const rightTotal = (leanMass.rightArm || 0) + (leanMass.rightLeg || 0);
    const balancePct = leftTotal + rightTotal > 0
        ? Math.abs(leftTotal - rightTotal) / ((leftTotal + rightTotal) / 2) * 100
        : 0;
    const isBalanced = balancePct < 3;

    return `
        <div class="d-sec-head">Regional lean mass</div>
        <div class="stat-card" style="margin:0 14px 14px;">
            <div class="regional-bars">
                ${renderBarRow('Trunk', trunk, maxVal, 'var(--cat-push)')}
                ${renderBarRow('Arms', arms, maxVal, 'var(--cat-arms)')}
                ${renderBarRow('Legs', legs, maxVal, 'var(--cat-legs)')}
                <div class="regional-bar-row">
                    <div class="regional-bar-label">L/R bal.</div>
                    <div class="regional-balance-status ${isBalanced ? 'balanced' : 'imbalanced'}">${isBalanced ? 'Balanced' : 'Imbalanced'}</div>
                    <div class="regional-bar-value ${isBalanced ? 'balanced' : 'imbalanced'}">${balancePct.toFixed(1)}%</div>
                </div>
            </div>
        </div>
    `;
}

function renderBarRow(label, value, maxVal, color) {
    const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
    return `
        <div class="regional-bar-row">
            <div class="regional-bar-label">${label}</div>
            <div class="regional-bar-track"><div class="regional-bar-fill" style="width:${pct.toFixed(0)}%;background:${color};"></div></div>
            <div class="regional-bar-value">${value.toFixed(1)} lb</div>
        </div>
    `;
}

function renderVisceralFat(scan) {
    const vat = scan.vat;
    const status = vat < 1.0 ? 'Low · healthy range' : vat < 2.0 ? 'Moderate' : 'High';
    const statusColor = vat < 1.0 ? 'var(--success)' : vat < 2.0 ? 'var(--warning)' : 'var(--danger)';

    return `
        <div class="d-sec-head">Visceral fat</div>
        <div class="stat-card" style="margin:0 14px 14px;">
            <div class="vat-row">
                <div class="vat-info">
                    <div class="stat-val" style="font-size:1.3rem;">${vat}<span class="stat-unit">lb</span></div>
                    <div class="vat-status" style="color:${statusColor};">${status}</div>
                </div>
            </div>
        </div>
    `;
}

function renderBodyWeightSection(entries, unit) {
    if (!entries || entries.length === 0) {
        return `
            <div class="d-sec-head">Body weight</div>
            <div class="stat-card" style="margin:0 14px 14px;text-align:center;padding:20px;">
                <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;">No weight entries yet</div>
                <button class="dash-template-play" style="margin:0 auto;width:auto;padding:8px 16px;border-radius:var(--radius-pill);font-size:0.78rem;" onclick="showWeightEntryModal()">
                    <i class="fas fa-plus"></i> Add weight
                </button>
            </div>
        `;
    }

    // Convert all entries to user's preferred unit for display
    const converted = entries.map(e => {
        const stored = e.unit || 'lbs';
        if (stored === unit) return e.weight;
        if (stored === 'kg' && unit === 'lbs') return Math.round(e.weight * 2.20462 * 10) / 10;
        if (stored === 'lbs' && unit === 'kg') return Math.round(e.weight * 0.453592 * 10) / 10;
        return e.weight;
    });

    const latestW = converted[converted.length - 1];
    const firstW = converted[0];
    const delta = latestW - firstW;
    const points = converted.map((w, i) => ({ x: i, y: w }));

    return `
        <div class="d-sec-head">Body weight</div>
        <div class="stat-card" style="margin:0 14px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
                <div class="stat-val">${latestW.toFixed(1)}<span class="stat-unit">${unit}</span></div>
                <div class="stat-delta ${delta <= 0 ? 'down' : 'up'}">${delta < 0 ? '↓' : '↑'} ${Math.abs(delta).toFixed(1)} ${unit} · 90d</div>
            </div>
            ${chartSparkline({ points, color: 'var(--cat-shoulders)', width: 280, height: 48 })}
        </div>
    `;
}

function renderNoDexaState() {
    return `
        <div style="text-align:center;padding:32px 20px;">
            <div style="width:64px;height:64px;border-radius:50%;background:var(--primary-bg);color:var(--primary);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:1.4rem;">
                <i class="fas fa-circle-nodes"></i>
            </div>
            <div style="font-size:1rem;font-weight:700;color:var(--text-strong);margin-bottom:6px;">No DEXA scan yet</div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px;line-height:1.4;">Upload your DEXA scan results to see body composition breakdown, regional lean mass, and track changes over time.</div>
            <button class="dash-template-play" style="width:auto;padding:10px 20px;border-radius:var(--radius-pill);font-size:0.82rem;font-weight:700;" onclick="showDexaUploadModal()">
                <i class="fas fa-file-upload"></i> Upload DEXA scan
            </button>
        </div>
    `;
}

function renderActions(hasDexa) {
    return `
        <div style="padding:8px 14px 20px;display:flex;flex-direction:column;gap:8px;">
            <div class="dash-template-row" onclick="showDexaUploadModal()">
                <div class="dash-template-icon" style="background:var(--primary-bg);"><i class="fas fa-file-upload" style="color:var(--primary);"></i></div>
                <div class="dash-template-info">
                    <div class="dash-template-name">Upload new DEXA scan</div>
                    <div class="dash-template-meta">PDF, CSV, or enter manually</div>
                </div>
                <i class="fas fa-chevron-right" style="color:var(--text-muted);font-size:0.72rem;"></i>
            </div>
            ${hasDexa ? `
                <div class="dash-template-row" onclick="showDexaHistory()">
                    <div class="dash-template-icon" style="background:rgba(255,215,0,0.1);"><i class="fas fa-history" style="color:var(--badge-gold);"></i></div>
                    <div class="dash-template-info">
                        <div class="dash-template-name">Scan history</div>
                        <div class="dash-template-meta">Compare scans over time</div>
                    </div>
                    <i class="fas fa-chevron-right" style="color:var(--text-muted);font-size:0.72rem;"></i>
                </div>
            ` : ''}
            <div class="dash-template-row" onclick="showWeightEntryModal()">
                <div class="dash-template-icon" style="background:var(--cat-shoulders-bg);"><i class="fas fa-weight" style="color:var(--cat-shoulders);"></i></div>
                <div class="dash-template-info">
                    <div class="dash-template-name">Log body weight</div>
                    <div class="dash-template-meta">Track weight changes over time</div>
                </div>
                <i class="fas fa-chevron-right" style="color:var(--text-muted);font-size:0.72rem;"></i>
            </div>
        </div>
    `;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
