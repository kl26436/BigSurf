// Exercise Detail — Level 3 drill-down from muscle group exercise list

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr } from './ui-helpers.js';
import {
    aggregateExerciseStats, exerciseEquipmentCounts, classifyBodyPart, capitalize, formatVolume,
} from '../features/metrics/aggregators.js';
import { chartTrend } from '../features/charts/chart-trend.js';
import { renderRangeFilter, DEFAULT_RANGE, persistRange, rangeLabel } from '../features/metrics/range-filter.js';
import { detectPlateaus } from '../features/training-insights.js';

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

const SESSIONS_COLLAPSED_LIMIT = 5;

// Module state: which exercise is currently expanded to "show all sessions".
// Tracked per exercise so switching exercises resets the toggle naturally.
let _expandedSessionsFor = null;
// Which machine the trend is filtered to (UX-1). null = all machines. A
// sentinel '' means "no equipment" (bodyweight/unassigned). Reset on switch.
let _equipmentFilterFor = null;   // the exercise name the filter belongs to
let _equipmentFilter = null;      // null | '' | machine name

export function renderExerciseDetail(exerciseName) {
    const container = document.getElementById('exercise-detail-content');
    if (!container || !exerciseName) return;

    // Reset per-exercise state when we switch to a different exercise.
    if (_expandedSessionsFor && _expandedSessionsFor !== exerciseName) {
        _expandedSessionsFor = null;
    }
    if (_equipmentFilterFor !== exerciseName) {
        _equipmentFilterFor = exerciseName;
        _equipmentFilter = null;
    }

    const range = AppState.dashboardRange || DEFAULT_RANGE;
    const workouts = AppState.workouts || [];
    const equipCounts = exerciseEquipmentCounts(workouts, exerciseName, range);
    // Drop a stale filter if the selected machine has no sessions in this range.
    if (_equipmentFilter !== null &&
        !equipCounts.byEquipment.some(e => (e.equipment || '') === _equipmentFilter)) {
        _equipmentFilter = null;
    }
    const s = aggregateExerciseStats(workouts, exerciseName, range, _equipmentFilter);
    const bodyPart = classifyBodyPart(exerciseName);
    const color = bodyPartColor(bodyPart);

    // Subtitle names the selected machine when filtered.
    const activeMachine = _equipmentFilter === null ? null
        : _equipmentFilter === '' ? 'No machine' : _equipmentFilter;
    const subtitleParts = [capitalize(bodyPart)];
    if (activeMachine) subtitleParts.push(escapeHtml(activeMachine));
    subtitleParts.push(`${s.sessions.length} sessions`);

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

    // Coach deep link (5.7.4): a quiet dismissible chip when THIS lift is
    // stalled. Dismissal persists per finding (shared with the dashboard chip).
    let stallChip = '';
    try {
        const plateau = detectPlateaus(workouts)
            .find(p => (p.exercise || '').toLowerCase() === exerciseName.toLowerCase());
        if (plateau) {
            const sig = `plateau:${plateau.exercise.toLowerCase()}`;
            if (!(AppState.settings?.dismissedCoachChips || []).includes(sig)) {
                stallChip = `
                    <div class="coach-chip" role="button" tabindex="0" onclick="coachChipAsk('${escapeAttr(plateau.exercise)}')">
                        <i class="fas fa-equals coach-chip__icon"></i>
                        <span class="coach-chip__txt">Stalled ${plateau.sessions} sessions · Ask the coach</span>
                        <button class="coach-chip__dismiss" onclick="coachChipDismiss(event, '${escapeAttr(sig)}')" aria-label="Dismiss">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }
        }
    } catch { /* chip is best-effort — the page renders without it */ }

    container.innerHTML = `
        <div class="d-header">
            <button class="d-back" onclick="navigateBack()"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info">
                <div class="d-header-icon ${BP_TINTS[bodyPart] || ''}"><i class="fas ${BP_ICONS[bodyPart] || 'fa-dumbbell'}"></i></div>
                <div>
                    <div class="d-title">${escapeHtml(exerciseName)}</div>
                    <div class="d-subtitle">${subtitleParts.join(' · ')}</div>
                </div>
            </div>
        </div>
        <div class="d-content">
            ${renderMachinePills(equipCounts)}
            <div class="d-range">${renderRangeFilter(range, 'setExerciseRange')}</div>

            ${s.sessions.length === 0 ? renderEmptyRange(range) : `
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

            ${stallChip}

            ${renderTrendCard(s, color, activeMachine, equipCounts)}

            ${s.topSets.length > 0 ? `
                <div class="d-sec-head">Best sets${activeMachine ? ` — ${escapeHtml(activeMachine)}` : ''}</div>
                <div class="d-best-table">
                    ${s.topSets.map((set, i) => {
                        // Meta line: date + gym + machine (only what we have).
                        const meta = [
                            formatSessionDate(set.date),
                            set.location ? escapeHtml(set.location) : null,
                            !activeMachine && set.equipment ? escapeHtml(set.equipment) : null,
                        ].filter(Boolean).join(' · ');
                        return `
                        <div class="d-best-row">
                            <div class="d-best-rank">${i + 1}</div>
                            <div class="d-best-info">
                                <div class="d-best-weight">${Math.round(set.totalWeight)} ${s.displayUnit || 'lb'} × ${set.reps}</div>
                                ${meta ? `<div class="d-best-meta">${meta}</div>` : ''}
                            </div>
                            <div class="d-best-1rm">~${Math.round(set.est1RM)} 1RM</div>
                        </div>
                        `;
                    }).join('')}
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
                    <div class="d-sec-head">${expanded ? 'All' : 'Recent'} sessions ${activeMachine ? '' : '<span class="d-sec-head__meta">equipment shown</span>'}</div>
                    ${shown.map(sess => renderSessionRow(sess, activeMachine)).join('')}
                    ${overflowBtn}
                `;
            })() : ''}
            `}
        </div>
    `;
}

// Shown when the picked range has zero sessions for this exercise — a clear
// reason + one-tap widen instead of a screen of zeros and dashes.
function renderEmptyRange(range) {
    const longer = range !== 'All';
    const title = longer ? `No sets in the last ${rangeLabel(range)}` : 'No sets logged yet';
    const desc = longer
        ? 'Try a longer range to see your history.'
        : "Log a set and it'll show up here.";
    return `
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-calendar-xmark"></i></div>
            <div class="empty-state-title">${title}</div>
            <div class="empty-state-description">${desc}</div>
            ${longer ? `<div class="empty-state-actions">
                <button class="btn btn-secondary" onclick="setExerciseRange('All')">View all time</button>
            </div>` : ''}
        </div>
    `;
}

/**
 * Machine picker (UX-1): "All machines" + one pill per machine, with session
 * counts. Only renders when the exercise has been logged on more than one
 * machine — a single-machine history has nothing to pick. `''` equipment
 * (logged with no machine) shows as "No machine".
 */
function renderMachinePills(equipCounts) {
    const machines = equipCounts.byEquipment;
    if (machines.length <= 1) return '';
    const pill = (key, label, count) => {
        const on = _equipmentFilter === key;
        return `<button class="m-pill ${on ? 'on' : ''}" aria-pressed="${on}"
                    onclick="setExerciseEquipment(${key === null ? 'null' : `'${escapeAttr(key)}'`})">
                ${escapeHtml(label)} <span class="m-pill__n">${count}</span>
            </button>`;
    };
    return `
        <div class="machine-pills">
            ${pill(null, 'All machines', equipCounts.total)}
            ${machines.map(m => pill(m.equipment || '', m.equipment || 'No machine', m.count)).join('')}
        </div>
    `;
}

/**
 * Trend card: labeled chart + "Mixed equipment" / "Same machine" badge.
 * Mixed badge shows when viewing All machines and the range spans >1 machine
 * (a machine swap can masquerade as a PR/regression); Same-machine badge when
 * filtered. Chart points are sorted chronologically for a left→right trend.
 */
function renderTrendCard(s, color, activeMachine, equipCounts) {
    if (s.trend.length <= 1) return '';
    const chrono = [...s.trend].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const multiMachine = equipCounts.byEquipment.length > 1;

    let badge = '';
    if (activeMachine) {
        badge = `<span class="cc-badge cc-badge--clean"><i class="fas fa-check"></i> Same machine</span>`;
    } else if (multiMachine) {
        badge = `<span class="cc-badge cc-badge--mixed"><i class="fas fa-exclamation-triangle"></i> Mixed equipment</span>`;
    }

    const footer = !activeMachine && multiMachine
        ? `<div class="cc-foot">Warm dots mark a different machine than the session before. Machines start at different resistance — pick one above for a true trend.</div>`
        : '';

    return `
        <div class="d-chart-card">
            <div class="cc-head">
                <span class="cc-title">Heaviest per session</span>
                ${badge}
            </div>
            ${chartTrend({ points: chrono, width: 300, height: 120, color, unit: s.displayUnit || 'lb', markChanges: !activeMachine })}
            ${footer}
        </div>
    `;
}

function renderSessionRow(session, activeMachine) {
    const dateStr = formatSessionDate(session.date);
    const chips = session.sets.map(s => {
        return `<span class="set-chip">${s.reps}×${s.weight}${s.rpe ? `<span class="set-chip__rpe">@${s.rpe}</span>` : ''}</span>`;
    }).join(' ');
    // Name the session's machine when viewing All machines (the honesty cue).
    const equipStr = (!activeMachine && session.equipment)
        ? `<span class="d-session-row__equip"><i class="fas fa-dumbbell"></i> ${escapeHtml(session.equipment)}</span>`
        : '';

    return `
        <div class="d-session-row">
            <div class="d-session-row__head">
                <div class="d-session-row__date">${dateStr}</div>
                ${equipStr}
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
    AppState.dashboardRange = range;
    persistRange(range);
    renderExerciseDetail(AppState.activeExercise);
}

/**
 * Machine-picker setter (UX-1). `null` = all machines; `''` = the "no machine"
 * bucket; otherwise a machine name. Re-renders the detail with the filter.
 */
export function setExerciseEquipment(equipment) {
    _equipmentFilterFor = AppState.activeExercise;
    _equipmentFilter = equipment;
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
