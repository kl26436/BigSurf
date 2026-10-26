// Goals page (TP-1) — route 'goals', #goals-section.
//
// What you're training for (settings.coachGoal), each goal with where you
// are now, the target, the date and one plain sentence (goal-progress.js —
// the same sentence the coach quotes), and the dated events the plan aims
// at. Baselines are measured at creation, never asked for.

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification } from './ui-helpers.js';
import { navigateTo } from './navigation.js';
import { openSheet, closeSheet } from './sheet.js';
import { confirmSheet } from './confirm-sheet.js';
import {
    loadGoalsWithStatus, createGoal, updateGoal, deleteGoal, createEvent, deleteEvent, mainLiftNames,
} from '../features/goals.js';
import {
    goalName, measureGoal, STATUS_LABELS, shortDate, weeksUntil, normalizeGoal,
} from '../features/goal-progress.js';
import { PATTERN_LABELS } from '../features/progress-scoreboard.js';

const ADD_GOAL_SHEET = 'goal-add-sheet';
const ADD_EVENT_SHEET = 'event-add-sheet';
const GOAL_ACTIONS_SHEET = 'goal-actions-sheet';

let _state = null;     // { goals, events, data, rows }
let _draft = null;     // the add-goal sheet's draft

export function openGoalsPage() {
    navigateTo('goals');
}

const DIRECTIONS = [
    { value: 'cut', label: 'Cut' },
    { value: 'bulk', label: 'Bulk' },
    { value: 'recomp', label: 'Recomp' },
    { value: 'strength', label: 'Strength' },
    { value: 'general', label: 'General' },
];

const TYPE_ROWS = [
    { type: 'lift', icon: 'fa-dumbbell', title: 'A lift', sub: 'Get a main lift\'s estimated max to a number' },
    { type: 'bodyweight', icon: 'fa-weight-scale', title: 'Body weight', sub: 'Reach a weight — measured as a 7-day average' },
    { type: 'composition', icon: 'fa-person', title: 'Body composition', sub: 'Lean mass or body fat, from your DEXA scans' },
    { type: 'consistency', icon: 'fa-calendar-check', title: 'Days a week', sub: 'Train a number of days every week' },
    { type: 'balance', icon: 'fa-scale-balanced', title: 'A movement', sub: 'Weekly sets for a pattern, like hinge or vertical pull' },
];

const BALANCE_PATTERNS = ['hip-dominant', 'knee-dominant', 'horizontal-push', 'vertical-push', 'horizontal-pull', 'vertical-pull'];

const PILL_CLASS = {
    ahead: 'goal-pill--good', 'on-track': 'goal-pill--good', met: 'goal-pill--good',
    behind: 'goal-pill--warn', missed: 'goal-pill--bad',
};

function headerHTML() {
    return `
        <div class="page-header page-header--detail">
            <button class="page-header__back" onclick="navigateBack()" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info"><div><div class="d-title">Goals</div></div></div>
        </div>`;
}

export async function renderGoalsPage() {
    const container = document.getElementById('goals-content');
    if (!container) return;
    container.innerHTML = `${headerHTML()}<div class="d-content"><div class="skeleton skeleton-card dash-skel--hero"></div></div>`;
    try {
        _state = await loadGoalsWithStatus();
        container.innerHTML = pageHTML(_state);
    } catch (e) {
        console.error('❌ Goals page failed:', e);
        container.innerHTML = `${headerHTML()}<div class="d-content"><div class="empty-state">
            <div class="empty-state-title">Couldn't load your goals</div>
            <div class="empty-state-description">Check your connection and try again.</div>
        </div></div>`;
    }
}

function directionHTML() {
    const current = AppState.settings?.coachGoal || null;
    return `
        <div class="goals-direction">
            <div class="field-label">Training for</div>
            <div class="segmented">${DIRECTIONS.map(o => `<button class="${o.value === current ? 'active' : ''}" onclick="goalsSetDirection('${o.value}', this)">${escapeHtml(o.label)}</button>`).join('')}</div>
        </div>`;
}

function goalRowHTML(r, events) {
    const g = r.goal;
    const pill = STATUS_LABELS[r.status] || '';
    const by = g.by ? ` · by ${shortDate(g.by)}` : '';
    const ev = g.eventId ? events.find(e => e.id === g.eventId) : null;
    return `
        <div class="row-card goal-row" onclick="openGoalActions('${escapeAttr(g.id)}')">
            <div class="row-card__content">
                <div class="goal-row__head">
                    <div class="row-card__title">${escapeHtml(goalName(g, { events }))}</div>
                    ${pill ? `<span class="goal-pill ${PILL_CLASS[r.status] || ''}">${escapeHtml(pill)}</span>` : ''}
                </div>
                <div class="row-card__subtitle">${escapeHtml(r.sentence)}</div>
                ${by || ev ? `<div class="row-card__detail">${g.baseline ? `Started at ${escapeHtml(String(g.baseline.value))}${escapeHtml(g.unit === '%' ? '%' : g.unit === 'days/week' || g.unit === 'sets/week' ? '' : ` ${g.unit}`)}` : 'No baseline yet'}${escapeHtml(by)}${ev ? ` · for ${escapeHtml(ev.name)}` : ''}</div>` : ''}
            </div>
            <i class="fas fa-chevron-right row-card__action" aria-hidden="true"></i>
        </div>`;
}

function eventRowHTML(e, today) {
    const weeks = weeksUntil(e.date, today);
    return `
        <div class="row-card" onclick="openEventActions('${escapeAttr(e.id)}')">
            <div class="row-card__icon"><i class="fas fa-calendar-day"></i></div>
            <div class="row-card__content">
                <div class="row-card__title">${escapeHtml(e.name)}</div>
                <div class="row-card__subtitle">${escapeHtml(shortDate(e.date))} · ${weeks === 0 ? 'this week' : `in ${weeks} week${weeks === 1 ? '' : 's'}`}</div>
            </div>
            <i class="fas fa-chevron-right row-card__action" aria-hidden="true"></i>
        </div>`;
}

function pageHTML({ events, data, rows }) {
    const active = rows.filter(r => ['active', 'paused'].includes(r.goal.status));
    const done = rows.filter(r => ['met', 'missed'].includes(r.goal.status));
    const upcoming = events.filter(e => e.date > data.today);
    return `
        ${headerHTML()}
        <div class="d-content goals-page">
            ${directionHTML()}
            <div class="sec-head"><h3>Your goals</h3></div>
            ${active.length ? active.map(r => goalRowHTML(r, events)).join('') : `
                <div class="empty-state-compact">
                    <p>No goals yet</p>
                    <p class="empty-state-hint">Set a lift, a body weight or days a week. The app measures where you are now and tracks it from there.</p>
                </div>`}
            <button class="btn btn-primary btn-block" onclick="openAddGoalSheet()"><i class="fas fa-plus"></i> Add a goal</button>
            <div class="sec-head"><h3>Dates to be ready for</h3></div>
            ${upcoming.length ? upcoming.map(e => eventRowHTML(e, data.today)).join('') : `
                <div class="empty-state-compact">
                    <p>No dates yet</p>
                    <p class="empty-state-hint">A wedding, a trip, a meet — add it and your plan builds toward it.</p>
                </div>`}
            <button class="btn btn-secondary btn-block" onclick="openAddEventSheet()"><i class="fas fa-plus"></i> Add a date</button>
            ${done.length ? `<div class="sec-head"><h3>Done</h3></div>${done.map(r => goalRowHTML(r, events)).join('')}` : ''}
            <button class="chip chip--sm goals-coach" onclick="goalsAskCoach()"><i class="fas fa-robot"></i> Plan around my goals</button>
        </div>`;
}

export function goalsSetDirection(value, btn) {
    if (typeof window.updateSetting === 'function') window.updateSetting('coachGoal', value);
    btn?.parentElement?.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
}

// ── Add a goal ──────────────────────────────────────────────────────

export function openAddGoalSheet() {
    _draft = null;
    openSheet({
        id: ADD_GOAL_SHEET,
        title: 'New goal',
        subtitle: 'Pick what you want to move',
        bodyHTML: TYPE_ROWS.map(t => `
            <div class="js-row" onclick="goalPickType('${t.type}')">
                <div class="row-card__icon"><i class="fas ${t.icon}"></i></div>
                <div class="js-row__info">
                    <div class="js-row__name">${escapeHtml(t.title)}</div>
                    <div class="js-row__meta">${escapeHtml(t.sub)}</div>
                </div>
            </div>`).join(''),
    });
}

function nowLine(draft) {
    if (!_state) return '';
    const v = normalizeGoal({ ...draft, target: draft.target || 1 }, { today: _state.data.today, unit: _state.data.unit });
    if (!v.ok) return '';
    const m = measureGoal(v.goal, _state.data);
    if (m.now == null) return 'No data yet — it starts from your next session, weigh-in or scan.';
    const u = v.goal.unit === '%' ? '%' : v.goal.unit === 'days/week' ? ' days a week' : v.goal.unit === 'sets/week' ? ' sets this week' : ` ${v.goal.unit}`;
    return `Now: ${m.now}${u}${v.goal.type === 'bodyweight' ? ' (7-day average)' : v.goal.type === 'lift' ? ' estimated max' : ''}`;
}

function goalFormHTML(draft) {
    const unit = _state?.data?.unit || 'lbs';
    const lifts = _state ? mainLiftNames(_state.data) : [];
    const events = (_state?.events || []).filter(e => e.date > (_state?.data?.today || ''));
    const field = (label, inner, hint = '') => `<div class="field"><div class="field-label">${escapeHtml(label)}${hint ? `<span class="field-label__hint">${escapeHtml(hint)}</span>` : ''}</div>${inner}</div>`;
    const chips = (name, options, current) => `<div class="chips">${options.map(o => `<button class="chip chip--sm${o.value === current ? ' active' : ''}" onclick="goalDraftSet('${name}', '${escapeAttr(o.value)}')">${escapeHtml(o.label)}</button>`).join('')}</div>`;
    const parts = [];
    if (draft.type === 'lift') {
        parts.push(field('Lift', lifts.length ? chips('exercise', lifts.map(n => ({ value: n, label: n })), draft.key?.exercise) : '<div class="field-helper">Pick your main lifts in Settings first — goals track those.</div>'));
    }
    if (draft.type === 'composition') {
        parts.push(field('Measure', chips('metric', [{ value: 'leanMass', label: 'Lean mass' }, { value: 'bodyFatPct', label: 'Body fat %' }], draft.metric || 'leanMass')));
    }
    if (draft.type === 'balance') {
        parts.push(field('Movement', chips('pattern', BALANCE_PATTERNS.map(p => ({ value: p, label: PATTERN_LABELS[p] || p })), draft.key?.pattern)));
    }
    const targetUnit = draft.type === 'consistency' ? 'days a week' : draft.type === 'balance' ? 'sets a week'
        : draft.type === 'composition' && draft.metric === 'bodyFatPct' ? '%' : unit;
    parts.push(field('Target', `<input class="field-input" id="goal-target" type="number" inputmode="decimal" min="0" step="0.5" value="${escapeAttr(draft.target ?? '')}" oninput="goalDraftTarget(this.value)">`, targetUnit));
    parts.push(`<div class="field-helper" id="goal-now">${escapeHtml(nowLine(draft))}</div>`);
    if (draft.type !== 'consistency' && draft.type !== 'balance') {
        parts.push(field('By', `<input class="field-input" id="goal-by" type="date" value="${escapeAttr(draft.by || '')}" onchange="goalDraftSet('by', this.value)">`, 'optional'));
        if (events.length) parts.push(field('For', chips('eventId', [{ value: '', label: 'Nothing in particular' }, ...events.map(e => ({ value: e.id, label: `${e.name} · ${shortDate(e.date)}` }))], draft.eventId || '')));
    }
    return parts.join('');
}

function renderGoalForm() {
    const t = TYPE_ROWS.find(x => x.type === _draft.type);
    openSheet({
        id: ADD_GOAL_SHEET,
        title: t ? t.title : 'New goal',
        subtitle: 'Where you are now comes from your data',
        bodyHTML: goalFormHTML(_draft),
        footerHTML: '<button class="btn btn-secondary" onclick="openAddGoalSheet()">Back</button><button class="btn btn-primary" onclick="goalSave()">Save goal</button>',
    });
}

export function goalPickType(type) {
    _draft = { type, metric: type === 'composition' ? 'leanMass' : undefined, key: null, target: null, by: null, eventId: null };
    if (type === 'lift') {
        const lifts = _state ? mainLiftNames(_state.data) : [];
        if (lifts.length) _draft.key = { exercise: lifts[0] };
    }
    if (type === 'balance') _draft.key = { pattern: 'hip-dominant' };
    renderGoalForm();
}

export function goalDraftSet(name, value) {
    if (!_draft) return;
    if (name === 'exercise') _draft.key = { exercise: value };
    else if (name === 'pattern') _draft.key = { pattern: value };
    else if (name === 'metric') _draft.metric = value;
    else if (name === 'eventId') _draft.eventId = value || null;
    else if (name === 'by') { _draft.by = value || null; return; }
    // Keep what was typed in the target box across the re-render.
    const t = document.getElementById('goal-target');
    if (t) _draft.target = t.value === '' ? null : Number(t.value);
    renderGoalForm();
}

export function goalDraftTarget(value) {
    if (!_draft) return;
    _draft.target = value === '' ? null : Number(value);
}

export async function goalSave() {
    if (!_draft || !_state) return;
    const byEl = document.getElementById('goal-by');
    if (byEl) _draft.by = byEl.value || null;
    if (!(Number(_draft.target) > 0)) { showNotification('Add a target', 'warning'); return; }
    const r = await createGoal({ ..._draft, unit: _state.data.unit }, _state.data, { events: _state.events });
    if (!r.ok) {
        showNotification(r.hint ? `${r.error} ${r.hint}` : r.error, 'warning', 4000);
        return;
    }
    closeSheet(ADD_GOAL_SHEET);
    showNotification('Goal set', 'success', 1500);
    await renderGoalsPage();
}

// ── Goal actions ────────────────────────────────────────────────────

export function openGoalActions(id) {
    const r = _state?.rows.find(x => x.goal.id === id);
    if (!r) return;
    const g = r.goal;
    const row = (icon, label, onclick, cls = '') => `
        <div class="js-row${cls}" onclick="${onclick}">
            <div class="row-card__icon"><i class="fas ${icon}"></i></div>
            <div class="js-row__info"><div class="js-row__name">${escapeHtml(label)}</div></div>
        </div>`;
    openSheet({
        id: GOAL_ACTIONS_SHEET,
        title: goalName(g, { events: _state.events }),
        subtitle: r.sentence,
        bodyHTML: [
            g.status === 'paused' ? row('fa-play', 'Resume', `goalSetStatus('${escapeAttr(id)}', 'active')`) : g.status === 'active' ? row('fa-pause', 'Pause', `goalSetStatus('${escapeAttr(id)}', 'paused')`) : '',
            g.status !== 'met' ? row('fa-check', 'Mark as met', `goalSetStatus('${escapeAttr(id)}', 'met')`) : row('fa-rotate-left', 'Track it again', `goalSetStatus('${escapeAttr(id)}', 'active')`),
            row('fa-trash', 'Delete goal', `goalDelete('${escapeAttr(id)}')`, ' goal-action--danger'),
        ].join(''),
    });
}

export async function goalSetStatus(id, status) {
    closeSheet(GOAL_ACTIONS_SHEET);
    if (await updateGoal(id, { status })) {
        showNotification(status === 'paused' ? 'Goal paused' : status === 'met' ? 'Goal marked as met' : 'Goal back on', 'success', 1500);
        await renderGoalsPage();
    } else showNotification("Couldn't update the goal — try again", 'error');
}

export async function goalDelete(id) {
    closeSheet(GOAL_ACTIONS_SHEET);
    const r = _state?.rows.find(x => x.goal.id === id);
    const ok = await confirmSheet({
        title: `Delete ${r ? goalName(r.goal, { events: _state.events }) : 'this goal'}?`,
        message: "Its history isn't affected — your sessions and weigh-ins stay.",
        confirmLabel: 'Delete goal', cancelLabel: 'Keep goal', destructive: true,
    });
    if (!ok) return;
    if (await deleteGoal(id)) {
        showNotification('Goal deleted', 'success', 1500);
        await renderGoalsPage();
    } else showNotification("Couldn't delete the goal — try again", 'error');
}

// ── Events ──────────────────────────────────────────────────────────

let _eventKind = 'look';

export function openAddEventSheet() {
    _eventKind = 'look';
    renderEventSheet();
}

function renderEventSheet() {
    const kinds = [{ value: 'look', label: 'Look my best' }, { value: 'perform', label: 'Perform' }, { value: 'other', label: 'Other' }];
    const name = document.getElementById('event-name')?.value || '';
    const date = document.getElementById('event-date')?.value || '';
    openSheet({
        id: ADD_EVENT_SHEET,
        title: 'A date to be ready for',
        subtitle: 'Your plan lightens the week before and holds steady through it',
        bodyHTML: `
            <div class="field"><div class="field-label">What</div><input class="field-input" id="event-name" type="text" maxlength="60" placeholder="Beach trip, wedding, meet…" value="${escapeAttr(name)}"></div>
            <div class="field"><div class="field-label">When</div><input class="field-input" id="event-date" type="date" value="${escapeAttr(date)}"></div>
            <div class="field"><div class="field-label">For</div><div class="chips">${kinds.map(k => `<button class="chip chip--sm${k.value === _eventKind ? ' active' : ''}" onclick="eventSetKind('${k.value}')">${escapeHtml(k.label)}</button>`).join('')}</div></div>`,
        footerHTML: '<button class="btn btn-primary btn-block" onclick="eventSave()">Save date</button>',
    });
}

export function eventSetKind(kind) {
    _eventKind = kind;
    renderEventSheet();
}

export async function eventSave() {
    const name = document.getElementById('event-name')?.value || '';
    const date = document.getElementById('event-date')?.value || '';
    if (!name.trim()) { showNotification('Add a name', 'warning'); return; }
    if (!date) { showNotification('Pick a date', 'warning'); return; }
    const r = await createEvent({ name, date, kind: _eventKind }, { today: AppState.getTodayDateString() });
    if (!r.ok) { showNotification(r.error, 'warning', 3500); return; }
    closeSheet(ADD_EVENT_SHEET);
    showNotification(`${r.event.name} added`, 'success', 1500);
    await renderGoalsPage();
}

export async function openEventActions(id) {
    const e = _state?.events.find(x => x.id === id);
    if (!e) return;
    const ok = await confirmSheet({
        title: `Remove ${e.name}?`,
        message: `${shortDate(e.date)} comes off your plan. Goals set for it stay, without the date.`,
        confirmLabel: 'Remove date', cancelLabel: 'Keep it', destructive: true,
    });
    if (!ok) return;
    if (await deleteEvent(id)) {
        for (const g of _state.goals.filter(x => x.eventId === id)) await updateGoal(g.id, { eventId: null });
        showNotification(`${e.name} removed`, 'success', 1500);
        await renderGoalsPage();
    } else showNotification("Couldn't remove it — try again", 'error');
}

export function goalsAskCoach() {
    const lines = (_state?.rows || []).filter(r => r.goal.status === 'active').map(r => `- ${r.sentence}`);
    const prefill = lines.length
        ? `Plan my training around my goals:\n${lines.join('\n')}`
        : 'Help me set goals I can track — a lift, a body weight, days a week.';
    // AU-14: prefill, never send.
    import('../features/ai-coach-ui.js').then(m => m.showAICoach({ prefill })).catch(() => {});
}

// Self-wire handlers rendered from this module's own templates.
if (typeof window !== 'undefined') {
    window.openGoalsPage = openGoalsPage;
    window.goalsSetDirection = goalsSetDirection;
    window.openAddGoalSheet = openAddGoalSheet;
    window.goalPickType = goalPickType;
    window.goalDraftSet = goalDraftSet;
    window.goalDraftTarget = goalDraftTarget;
    window.goalSave = goalSave;
    window.openGoalActions = openGoalActions;
    window.goalSetStatus = goalSetStatus;
    window.goalDelete = goalDelete;
    window.openAddEventSheet = openAddEventSheet;
    window.eventSetKind = eventSetKind;
    window.eventSave = eventSave;
    window.openEventActions = openEventActions;
    window.goalsAskCoach = goalsAskCoach;
}
