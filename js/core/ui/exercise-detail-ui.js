// Exercise Detail — Level 3 drill-down from muscle group exercise list

import { AppState } from '../utils/app-state.js';
import { escapeHtml } from './ui-helpers.js';
import {
    aggregateExerciseStats, classifyBodyPart, capitalize, formatVolume,
} from '../features/metrics/aggregators.js';
import { rangeLabel } from '../features/metrics/range-filter.js';
import { chartSparkline } from '../features/charts/chart-sparkline.js';

const BP_ICONS = {
    chest: 'fa-hand-paper', back: 'fa-fist-raised', legs: 'fa-walking',
    shoulders: 'fa-arrows-alt-v', arms: 'fa-hand-rock', core: 'fa-bullseye',
    other: 'fa-dumbbell',
};
const BP_TINTS = {
    chest: 'ic-chest', back: 'ic-back', legs: 'ic-legs',
    shoulders: 'ic-shoulders', arms: 'ic-arms', core: 'ic-core',
    other: '',
};

function bodyPartColor(bp) {
    const map = { chest: 'var(--cat-push)', back: 'var(--cat-pull)', legs: 'var(--cat-legs)', shoulders: 'var(--cat-shoulders)', arms: 'var(--cat-arms)', core: 'var(--cat-core)' };
    return map[bp] || 'var(--text-muted)';
}

const DETAIL_RANGES = ['M', '3M', '6M', 'Y', 'All'];

export function renderExerciseDetail(exerciseName) {
    const container = document.getElementById('exercise-detail-content');
    if (!container || !exerciseName) return;

    const range = AppState.exerciseDetailRange || '6M';
    const workouts = AppState.workouts || [];
    const s = aggregateExerciseStats(workouts, exerciseName, range);
    const bodyPart = classifyBodyPart(exerciseName);
    const color = bodyPartColor(bodyPart);

    container.innerHTML = `
        <div class="d-header">
            <button class="d-back" onclick="navigateBack()"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info">
                <div class="d-header-icon ${BP_TINTS[bodyPart] || ''}"><i class="fas ${BP_ICONS[bodyPart] || 'fa-dumbbell'}"></i></div>
                <div>
                    <div class="d-title">${escapeHtml(exerciseName)}</div>
                    <div class="d-subtitle">${capitalize(bodyPart)} · ${s.sessions.length} sessions</div>
                </div>
            </div>
        </div>
        <div class="d-content">
            ${renderRangePills(range)}

            <div class="d-hero-stats">
                <div class="d-stat">
                    <div class="d-stat__label"><i class="fas fa-trophy text-badge-gold"></i> Max weight</div>
                    <div class="d-stat__val">${s.maxWeight}<span class="d-stat__unit"> lb</span></div>
                </div>
                <div class="d-stat">
                    <div class="d-stat__label">Heaviest set</div>
                    <div class="d-stat__val">${s.heaviestSet ? `${s.heaviestSet.totalWeight}<span class="d-stat__unit">× ${s.heaviestSet.reps}</span>` : '—'}</div>
                </div>
            </div>

            <div class="d-pill-row">
                <div class="d-pill">Est. 1RM <strong>${Math.round(s.est1RM)} lb</strong></div>
                <div class="d-pill">Volume <strong>${formatVolume(s.totalVolume)} lb</strong></div>
            </div>

            ${s.trend.length > 1 ? `
                <div class="d-chart-card">
                    <div class="d-chart-head">
                        <div class="d-chart-title">Heaviest weight per session</div>
                        <div class="d-chart-legend">${s.trend.length >= 2 ? `${s.trend[s.trend.length - 1].y - s.trend[0].y >= 0 ? '↑' : '↓'} ${Math.abs(s.trend[s.trend.length - 1].y - s.trend[0].y)} lb` : ''}</div>
                    </div>
                    ${chartSparkline({ points: s.trend.map((t, i) => ({ x: i, y: t.y })), color, width: 280, height: 100 })}
                </div>
            ` : ''}

            ${s.topSets.length > 0 ? `
                <div class="d-sec-head">Best sets ever</div>
                <div class="d-best-table">
                    ${s.topSets.map((set, i) => `
                        <div class="d-best-row">
                            <div class="d-best-rank">${i + 1}</div>
                            <div class="d-best-weight">${set.totalWeight} lb</div>
                            <div class="d-best-reps">${set.reps} reps</div>
                            <div class="d-best-1rm">~${Math.round(set.est1RM)} 1RM</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            ${s.sessions.length > 0 ? `
                <div class="d-sec-head">Recent sessions</div>
                ${s.sessions.slice(0, 5).map(renderSessionRow).join('')}
                ${s.sessions.length > 5 ? `<button class="d-see-all">See all ${s.sessions.length} sessions</button>` : ''}
            ` : ''}
        </div>
    `;
}

function renderRangePills(activeRange) {
    return `
        <div class="range-pills">
            ${DETAIL_RANGES.map(r => `
                <button class="${r === activeRange ? 'active' : ''}" onclick="setExerciseRange('${r}')">${r}</button>
            `).join('')}
        </div>
    `;
}

function renderSessionRow(session) {
    const dateStr = formatSessionDate(session.date);
    const chips = session.sets.map(s => {
        return `<span class="set-chip">${s.reps}×${s.weight}</span>`;
    }).join(' ');

    return `
        <div class="d-session-row">
            <div class="d-session-row__head">
                <div class="d-session-row__date">${dateStr}</div>
            </div>
            <div class="d-session-row__chips">${chips}</div>
        </div>
    `;
}

function formatSessionDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Window-bound range setter
export function setExerciseRange(range) {
    AppState.exerciseDetailRange = range;
    renderExerciseDetail(AppState.activeExercise);
}
