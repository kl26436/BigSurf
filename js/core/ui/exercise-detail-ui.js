// Exercise Detail — Level 3 drill-down from muscle group exercise list

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr } from './ui-helpers.js';
import {
    aggregateExerciseStats, classifyBodyPart, capitalize, formatVolume,
} from '../features/metrics/aggregators.js';
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
const SESSIONS_COLLAPSED_LIMIT = 5;

// Module state: which exercise is currently expanded to "show all sessions".
// Tracked per exercise so switching exercises resets the toggle naturally.
let _expandedSessionsFor = null;

export function renderExerciseDetail(exerciseName) {
    const container = document.getElementById('exercise-detail-content');
    if (!container || !exerciseName) return;

    // Reset the expanded state when we switch to a different exercise.
    if (_expandedSessionsFor && _expandedSessionsFor !== exerciseName) {
        _expandedSessionsFor = null;
    }

    const range = AppState.exerciseDetailRange || '6M';
    const workouts = AppState.workouts || [];
    const s = aggregateExerciseStats(workouts, exerciseName, range);
    const bodyPart = classifyBodyPart(exerciseName);
    const color = bodyPartColor(bodyPart);

    // Estimated-1RM trend over the range (Epley), so the headline number reads
    // as "climbing" not just a static peak. Date-sorted so it's correct
    // regardless of the sessions array order.
    const bestE1RM = (sets) => (sets || []).reduce(
        (m, x) => (x.reps && x.weight) ? Math.max(m, x.weight * (1 + x.reps / 30)) : m, 0);
    let est1RMDelta = '';
    if (s.sessions.length >= 2) {
        const byDate = [...s.sessions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const d = Math.round(bestE1RM(byDate[byDate.length - 1].sets) - bestE1RM(byDate[0].sets));
        if (d !== 0) {
            est1RMDelta = ` <span class="d-pill__delta d-pill__delta--${d > 0 ? 'up' : 'down'}">${d > 0 ? '↑' : '↓'}${Math.abs(d)}</span>`;
        }
    }

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
                    <div class="d-stat__val">${Math.round(s.maxWeight)}<span class="d-stat__unit"> ${s.displayUnit || 'lb'}</span></div>
                </div>
                <div class="d-stat">
                    <div class="d-stat__label">Heaviest set</div>
                    <div class="d-stat__val">${s.heaviestSet ? `${Math.round(s.heaviestSet.totalWeight)}<span class="d-stat__unit">× ${s.heaviestSet.reps}</span>` : '—'}</div>
                </div>
            </div>

            <div class="d-pill-row">
                <div class="d-pill">Est. 1RM <strong>${Math.round(s.est1RM)} ${s.displayUnit || 'lb'}</strong>${est1RMDelta}</div>
                <div class="d-pill">Volume <strong>${formatVolume(s.totalVolume)} ${s.displayUnit || 'lb'}</strong></div>
            </div>

            ${s.trend.length > 1 ? `
                <div class="d-chart-card">
                    <div class="d-chart-head">
                        <div class="d-chart-title">Heaviest weight per session</div>
                        <div class="d-chart-legend">${s.trend.length >= 2 ? `${s.trend[s.trend.length - 1].y - s.trend[0].y >= 0 ? '↑' : '↓'} ${Math.round(Math.abs(s.trend[s.trend.length - 1].y - s.trend[0].y))} ${s.displayUnit || 'lb'}` : ''}</div>
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
                            <div class="d-best-weight">${Math.round(set.totalWeight)} ${s.displayUnit || 'lb'}</div>
                            <div class="d-best-reps">${set.reps} reps</div>
                            <div class="d-best-1rm">~${Math.round(set.est1RM)} 1RM</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            ${s.sessions.length > 0 ? (() => {
                const expanded = _expandedSessionsFor === exerciseName;
                const shown = expanded ? s.sessions : s.sessions.slice(0, SESSIONS_COLLAPSED_LIMIT);
                const overflowBtn = s.sessions.length > SESSIONS_COLLAPSED_LIMIT
                    ? `<button class="d-see-all" onclick="toggleAllSessions('${escapeAttr(exerciseName)}')">${
                        expanded
                            ? `Show recent only`
                            : `See all ${s.sessions.length} sessions`
                    }</button>`
                    : '';
                return `
                    <div class="d-sec-head">${expanded ? 'All' : 'Recent'} sessions</div>
                    ${shown.map(renderSessionRow).join('')}
                    ${overflowBtn}
                `;
            })() : ''}
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
        return `<span class="set-chip">${s.reps}×${s.weight}${s.rpe ? `<span class="set-chip__rpe">@${s.rpe}</span>` : ''}</span>`;
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

/**
 * Toggle the "Recent sessions" list between the first N and the full history.
 * Wired to the "See all N sessions" button in the exercise detail — before
 * this, the button had no onclick and did nothing (the 7/2 report).
 */
export function toggleAllSessions(exerciseName) {
    if (!exerciseName) return;
    _expandedSessionsFor = _expandedSessionsFor === exerciseName ? null : exerciseName;
    renderExerciseDetail(exerciseName);
}
