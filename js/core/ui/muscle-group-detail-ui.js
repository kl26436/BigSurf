// Muscle Group Detail — Level 2 drill-down from dashboard body-part cards

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr } from './ui-helpers.js';
import {
    aggregateBodyPartStats, getExercisesForBodyPart, getPRsForBodyPart,
    formatVolume, capitalize, BP_TO_CAT,
} from '../features/metrics/aggregators.js';
import { rangeLabel } from '../features/metrics/range-filter.js';
import { chartSparkline } from '../features/charts/chart-sparkline.js';
import { chartComboBarsLine } from '../features/charts/chart-combo-bars-line.js';

const BP_ICONS = {
    chest: 'fa-hand-paper', back: 'fa-fist-raised', legs: 'fa-walking',
    shoulders: 'fa-arrows-alt-v', arms: 'fa-hand-rock', core: 'fa-bullseye',
};
const BP_TINTS = {
    chest: 'ic-chest', back: 'ic-back', legs: 'ic-legs',
    shoulders: 'ic-shoulders', arms: 'ic-arms', core: 'ic-core',
};

function bodyPartColor(bp) {
    const map = { chest: 'var(--cat-push)', back: 'var(--cat-pull)', legs: 'var(--cat-legs)', shoulders: 'var(--cat-shoulders)', arms: 'var(--cat-arms)', core: 'var(--cat-core)' };
    return map[bp] || 'var(--text-muted)';
}

const DETAIL_RANGES = ['W', 'M', '3M', 'Y', 'All'];

export function renderMuscleGroupDetail(bodyPart) {
    const container = document.getElementById('muscle-group-detail-content');
    if (!container || !bodyPart) return;

    const range = AppState.muscleDetailRange || 'M';
    const workouts = AppState.workouts || [];
    const stats = aggregateBodyPartStats(workouts, bodyPart, range);
    const exercises = getExercisesForBodyPart(workouts, bodyPart, range);
    const prs = getPRsForBodyPart(workouts, bodyPart);

    const heroShort = stats.heroLift ? stats.heroLift.split(' ')[0] : '';

    container.innerHTML = `
        <div class="d-header">
            <button class="d-back" onclick="navigateBack()"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info">
                <div class="d-header-icon ${BP_TINTS[bodyPart]}"><i class="fas ${BP_ICONS[bodyPart]}"></i></div>
                <div>
                    <div class="d-title">${capitalize(bodyPart)}</div>
                    <div class="d-subtitle">${stats.sessions} sessions · past ${rangeLabel(range)}</div>
                </div>
            </div>
        </div>
        <div class="d-content">
            ${renderRangePills(range)}

            <div class="d-hero-stats">
                <div class="d-stat">
                    <div class="d-stat__label"><i class="fas fa-trophy text-badge-gold"></i> Heaviest · ${heroShort}</div>
                    <div class="d-stat__val">${stats.heaviest ? `${stats.heaviest.weight}<span class="d-stat__unit">× ${stats.heaviest.reps}</span>` : '—'}</div>
                </div>
                <div class="d-stat">
                    <div class="d-stat__label">Total volume</div>
                    <div class="d-stat__val">${formatVolume(stats.volume)}<span class="d-stat__unit"> lb</span></div>
                    ${stats.volumeDeltaPct != null ? `<div class="d-stat__delta ${stats.volumeDeltaPct >= 0 ? 'up' : 'down'}">${stats.volumeDeltaPct >= 0 ? '↑' : '↓'} ${Math.abs(stats.volumeDeltaPct).toFixed(0)}% vs prev</div>` : ''}
                </div>
            </div>

            ${stats.volumeTrend.length > 1 ? `
                <div class="d-chart-card">
                    <div class="d-chart-head">
                        <div class="d-chart-title">Volume trend</div>
                        ${stats.volumeDeltaPct != null ? `<div class="d-chart-legend">${stats.volumeDeltaPct >= 0 ? '↑' : '↓'} ${Math.abs(stats.volumeDeltaPct).toFixed(0)}% vs prev</div>` : ''}
                    </div>
                    ${chartComboBarsLine({ bars: stats.volumeTrend, line: stats.volumeTrend, width: 300, height: 140, barColor: bodyPartColor(bodyPart), lineColor: 'var(--badge-gold)' })}
                </div>
            ` : ''}

            ${exercises.length > 0 ? `
                <div class="d-sec-head">Exercises · ${rangeLabel(range)}</div>
                ${exercises.map(ex => renderExerciseRow(ex, bodyPart)).join('')}
            ` : ''}

            ${prs.length > 0 ? `
                <div class="d-sec-head">${capitalize(bodyPart)} PRs</div>
                ${prs.slice(0, 5).map(renderPRRow).join('')}
            ` : ''}
        </div>
    `;
}

function renderRangePills(activeRange) {
    return `
        <div class="range-pills">
            ${DETAIL_RANGES.map(r => `
                <button class="${r === activeRange ? 'active' : ''}" onclick="setMuscleRange('${r}')">${r}</button>
            `).join('')}
        </div>
    `;
}

function renderExerciseRow(ex, bodyPart) {
    const color = bodyPartColor(bodyPart);
    return `
        <div class="d-exercise-row" onclick="showExerciseDetail('${escapeAttr(ex.name)}')">
            <div class="d-ex-spark">${chartSparkline({ points: ex.trend, color, width: 54, height: 24 })}</div>
            <div class="d-ex-info">
                <div class="d-ex-name">${escapeHtml(ex.name)}</div>
                <div class="d-ex-meta">${ex.sessions} sessions · ${ex.sets} sets · best ${ex.heaviest ? `${ex.heaviest.reps}×${ex.heaviest.weight}` : '—'}</div>
            </div>
            <div class="d-ex-right">
                <div class="d-ex-val">${formatVolume(ex.volume)} lb</div>
                ${ex.volumeDeltaPct != null ? `<div class="d-ex-delta ${ex.volumeDeltaPct >= 0 ? '' : 'down'}">${ex.volumeDeltaPct >= 0 ? '↑' : '↓'} ${Math.abs(ex.volumeDeltaPct).toFixed(0)}%</div>` : ''}
            </div>
        </div>
    `;
}

function renderPRRow(pr) {
    return `
        <div class="d-pr-row">
            <div class="pr-badge"><i class="fas fa-trophy"></i></div>
            <div class="pr-info">
                <div class="pr-name">${escapeHtml(pr.exercise)}</div>
                <div class="pr-meta">${pr.date} · ${pr.reps} reps</div>
            </div>
            <div class="pr-val">${pr.weight} lb</div>
        </div>
    `;
}

// Window-bound range setter
export function setMuscleRange(range) {
    AppState.muscleDetailRange = range;
    renderMuscleGroupDetail(AppState.activeMuscleGroup);
}
