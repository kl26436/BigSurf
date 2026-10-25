// Block page (AP-24) — the whole program, by week and day.
//
// The planner's view: past sessions with what was logged against the target,
// this week highlighted with today's Start, future sessions with the targets
// the rules will seed, the rationale from the planning conversation, and
// one-tap doors to adjust the week, swap an accessory, or plan the next
// block. Model: features/block-view.js (pure, tested); this file renders it.

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification } from './ui-helpers.js';
import { navigateTo } from './navigation.js';
import { debugLog } from '../utils/config.js';
import { loadAllWorkouts } from '../data/data-manager.js';
import { buildBlockModel, buildBlockSession } from '../features/block-view.js';
import { buildScoreboard } from '../features/progress-scoreboard.js';
import { weightIncrement } from '../features/progression.js';
import { weekOverrideOf } from '../features/session-intent.js';

let _model = null;
let _ctx = null;

export function openBlockPage() {
    navigateTo('block');
}

const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function plates(unit) {
    return unit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs;
}

async function loadContext() {
    if (AppState._activeProgram === undefined) {
        try {
            const { loadActiveProgram } = await import('../features/program-session.js');
            await loadActiveProgram();
        } catch (e) { debugLog('block: program load failed', e); }
    }
    let templates = AppState.workoutPlans || [];
    if (!templates.length) {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            templates = await new FirebaseWorkoutManager(AppState).getUserWorkoutTemplates();
            AppState.workoutPlans = templates;
        } catch (e) { debugLog('block: templates load failed', e); }
    }
    const workouts = await loadAllWorkouts(AppState);
    const unit = AppState.globalUnit || 'lbs';
    return {
        program: AppState._activeProgram || null,
        templates, workouts, unit,
        today: AppState.getTodayDateString(),
        override: weekOverrideOf(AppState.settings),
    };
}

export async function renderBlockPage() {
    const container = document.getElementById('block-content');
    if (!container) return;
    container.innerHTML = '<div class="skeleton skeleton-card dash-skel--hero"></div>';
    try {
        _ctx = await loadContext();
        const { program, templates, workouts, unit, today, override } = _ctx;
        const scoreboard = buildScoreboard({
            workouts, templates, unit, today,
            config: { increment: weightIncrement(unit, plates(unit)) },
        });
        _model = buildBlockModel({ program, templates, workouts, today, unit, plates: plates(unit), override, scoreboard });
        container.innerHTML = _model ? blockHTML(_model) : emptyHTML(scoreboard);
    } catch (e) {
        console.error('❌ Block page failed:', e);
        container.innerHTML = `${headerHTML('Your block', '')}<div class="d-content"><div class="empty-state">
            <div class="empty-state-title">Couldn't load your block</div>
            <div class="empty-state-description">Check your connection and try again.</div>
        </div></div>`;
    }
}

function headerHTML(title, subtitle) {
    return `
        <div class="d-header">
            <button class="d-back" onclick="navigateBack()" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info">
                <div>
                    <div class="d-title">${escapeHtml(title)}</div>
                    ${subtitle ? `<div class="d-subtitle">${escapeHtml(subtitle)}</div>` : ''}
                </div>
            </div>
        </div>`;
}

function emptyHTML(scoreboard) {
    return `
        ${headerHTML('Your block', '')}
        <div class="d-content block-page">
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-flag-checkered"></i></div>
                <div class="empty-state-title">No block planned</div>
                <div class="empty-state-description">${scoreboard?.headline ? `${escapeHtml(scoreboard.headline)}. ` : ''}Plan 4–6 weeks with the coach and every week, day and target shows up here.</div>
                <button class="btn btn-primary" onclick="startProgramChat()">Plan a block with the coach</button>
            </div>
        </div>`;
}

function blockHTML(m) {
    const h = m.header;
    const sub = h.finished ? 'Finished' : `Week ${h.week} of ${h.weeks} — ${h.weekLabel}`;
    return `
        ${headerHTML(h.name, sub)}
        <div class="d-content block-page">
            <div class="hero-card block-hero">
                <div class="block-hero__meta">${[h.goal, `${fmtDate(h.startDate)} → ${fmtDate(h.endDate)}`].filter(Boolean).map(escapeHtml).join(' · ')}</div>
                ${h.headline ? `<div class="block-hero__headline">${escapeHtml(h.headline)}</div>` : ''}
                <div class="block-hero__days">${h.daysTrained} of ${h.daysPlanned} planned days trained</div>
            </div>
            ${rationaleHTML(m.rationale)}
            <div class="block-actions">
                <button class="chip chip--sm" onclick="blockAdjustWeek()"><i class="fas fa-feather"></i> Adjust this week</button>
                <button class="chip chip--sm" onclick="blockSwapAccessory()"><i class="fas fa-arrow-right-arrow-left"></i> Swap an accessory</button>
                ${m.planNextVisible ? '<button class="chip chip--sm" onclick="blockPlanNext()"><i class="fas fa-forward"></i> Plan next block</button>' : ''}
                <button class="chip chip--sm" onclick="blockDiscuss()"><i class="fas fa-robot"></i> Discuss</button>
                <button class="chip chip--sm" onclick="openWeekPlanSheet()"><i class="fas fa-calendar-week"></i> Week plan</button>
            </div>
            ${m.weeks.map(weekHTML).join('')}
        </div>`;
}

function rationaleHTML(r) {
    if (!r?.block) return '';
    const list = (items, render) => `<ul class="block-rationale__list">${items.map(render).join('')}</ul>`;
    return `
        <div class="block-rationale">
            <div class="block-rationale__line">${escapeHtml(r.block)}</div>
            ${r.fixed?.length ? `<details class="block-rationale__more"><summary>What stays fixed (${r.fixed.length})</summary>
                ${list(r.fixed, x => `<li><b>${escapeHtml(x.name)}</b>${x.why ? ` — ${escapeHtml(x.why)}` : ''}</li>`)}</details>` : ''}
            ${r.changed?.length ? `<details class="block-rationale__more"><summary>What changed (${r.changed.length})</summary>
                ${list(r.changed, x => `<li>${x.from ? `${escapeHtml(x.from)} → ` : ''}<b>${escapeHtml(x.to)}</b>${x.why ? ` — ${escapeHtml(x.why)}` : ''}</li>`)}</details>` : ''}
            ${r.watch?.length ? `<details class="block-rationale__more"><summary>How we'll know it worked</summary>
                ${list(r.watch, x => `<li>${escapeHtml(x)}</li>`)}</details>` : ''}
        </div>`;
}

const STATUS_ICON = {
    done: 'fa-check', missed: 'fa-times', today: 'fa-play', upcoming: 'fa-circle',
};

function primaryLine(cell, unit) {
    const p = cell.primary;
    if (!p) return '';
    const fmt = (x) => (x ? `${x.weight}${x.reps ? `×${x.reps}` : ''}` : '—');
    if (cell.status === 'done' && p.logged) {
        const mark = p.result === 'hit' ? ' ✓' : p.result === 'below' ? ' ↓' : '';
        return `${p.name} ${fmt(p.logged)} ${unit}${p.target ? ` · target ${fmt(p.target)}` : ''}${mark}`;
    }
    return p.target ? `${p.name} · target ${fmt(p.target)} ${unit}` : `${p.name} · no history yet`;
}

function weekHTML(w) {
    const unit = _ctx?.unit || 'lbs';
    const meta = [w.levers, `${fmtDate(w.start)}–${fmtDate(w.end)}`].filter(Boolean).join(' · ');
    return `
        <section class="block-week${w.current ? ' block-week--current' : ''}${w.past ? ' block-week--past' : ''}" aria-label="Week ${w.week}">
            <div class="dash-section-head">
                <h3>Week ${w.week} · ${escapeHtml(w.label)}${w.current ? ' <span class="block-week__now">This week</span>' : ''}</h3>
                <span class="dash-section-head__meta">${escapeHtml(meta)}</span>
            </div>
            ${w.override ? `<div class="block-week__override"><i class="fas fa-feather"></i> ${escapeHtml(w.override.label)}${w.override.levers ? ` · ${escapeHtml(w.override.levers)}` : ''}${w.override.reason ? ` — ${escapeHtml(w.override.reason)}` : ''}</div>` : ''}
            <div class="block-week__cells">
                ${w.cells.map((c, i) => `
                    <div class="row-card block-cell block-cell--${c.status}" role="button" tabindex="0"
                         onclick="openBlockSession(${w.week}, ${i})" aria-label="${escapeAttr(`${c.dayLabel} ${c.name}, ${c.status}`)}">
                        <div class="row-card__icon block-cell__icon"><i class="fas ${STATUS_ICON[c.status]}" aria-hidden="true"></i></div>
                        <div class="row-card__content">
                            <div class="row-card__title">${escapeHtml(c.dayLabel)} · ${escapeHtml(c.name)}</div>
                            <div class="row-card__detail">${escapeHtml(primaryLine(c, unit))}</div>
                        </div>
                        ${c.status === 'today'
        ? `<button class="btn btn-primary btn-sm block-cell__start" onclick="event.stopPropagation(); blockStartSession('${escapeAttr(c.name)}')">Start</button>`
        : '<i class="fas fa-chevron-right row-card__action" aria-hidden="true"></i>'}
                    </div>`).join('')}
            </div>
        </section>`;
}

// ── Session sheet: one cell in full ──────────────────────────────────

export function closeBlockSession() {
    document.getElementById('block-session-backdrop')?.remove();
    document.getElementById('block-session-sheet')?.remove();
}

export function openBlockSession(weekNum, cellIdx) {
    const w = _model?.weeks?.[weekNum - 1];
    const cell = w?.cells?.[cellIdx];
    if (!cell || !_ctx) return;
    closeBlockSession();
    const template = (_ctx.templates || []).find(t => t.id === cell.templateId);
    const rows = buildBlockSession({
        cell, template, workouts: _ctx.workouts, program: _ctx.program,
        override: _ctx.override, unit: _ctx.unit, plates: plates(_ctx.unit),
    });
    const fmt = (x) => (x ? `${x.weight}${x.reps ? ` × ${x.reps}` : ''}` : '—');
    const status = { done: `Done ${cell.doneOn ? fmtDate(cell.doneOn) : ''}`, missed: 'Missed', today: 'Today', upcoming: fmtDate(cell.date) }[cell.status];

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'block-session-backdrop';
    backdrop.onclick = () => closeBlockSession();
    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'block-session-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', `${cell.name}, week ${weekNum}`);
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">${escapeHtml(cell.name)}</div>
            <div class="aw-sheet__subtitle">Week ${weekNum} · ${escapeHtml(w.label)} · ${escapeHtml(status)}</div>
        </div>
        <div class="aw-sheet__body">
            ${rows.length ? rows.map(r => `
                <div class="js-row">
                    <div class="js-row__info">
                        <div class="js-row__name">${escapeHtml(r.name)}${r.primary ? ' <span class="block-session__main">Main lift</span>' : ''}</div>
                        <div class="js-row__meta">${r.sets} sets · target ${escapeHtml(fmt(r.target))} ${escapeHtml(_ctx.unit)}${r.logged ? ` · logged ${escapeHtml(fmt(r.logged))}` : ''}</div>
                    </div>
                </div>`).join('') : `
                <div class="empty-state-compact">
                    <p>This workout has no exercises yet</p>
                    <p class="empty-state-hint">Add some in your workouts and their targets show up here.</p>
                </div>`}
        </div>
        <div class="aw-sheet__actions">
            <button class="aw-sheet__action" onclick="closeBlockSession()">Close</button>
            ${cell.status === 'today' || cell.status === 'upcoming' || cell.status === 'missed'
        ? `<button class="aw-sheet__action primary" onclick="blockStartSession('${escapeAttr(cell.name)}')">Start ${escapeHtml(cell.name)}</button>`
        : (cell.workoutId ? `<button class="aw-sheet__action primary" onclick="closeBlockSession(); viewWorkout('${escapeAttr(cell.workoutId)}')">Open workout</button>` : '')}
        </div>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => { backdrop.classList.add('visible'); sheet.classList.add('visible'); });
}

// ── Actions: each one tap + the coach's confirmation ─────────────────

// AU-14 — every block action PREFILLS the coach input; nothing is sent
// until the user taps send (they can edit the question first).
function askCoachSeeded(question) {
    import('../features/ai-coach-ui.js')
        .then((m) => m.showAICoach({ prefill: question }))
        .catch((e) => {
            console.error('❌ Coach open failed:', e);
            showNotification("Couldn't open the coach — try again", 'error');
        });
}

export function blockAdjustWeek() {
    const h = _model?.header;
    askCoachSeeded(h
        ? `Adjust this week of my block (week ${h.week} of ${h.weeks}, ${h.weekLabel}) — I want it a bit lighter. Propose the week adjustment.`
        : 'Adjust this week — I want it a bit lighter.');
}

export function blockSwapAccessory() {
    askCoachSeeded('Swap an accessory in my block — show me the best candidates for something I\'ve been doing too long, and keep my main lifts.');
}

export function blockPlanNext() {
    askCoachSeeded('Plan my next block — start with how this one went (get_verdicts scope block), then propose the next one.');
}

export function blockDiscuss() {
    const h = _model?.header;
    askCoachSeeded(h ? `Let's talk about my block — I'm in week ${h.week} of ${h.weeks} (${h.weekLabel}).` : "Let's talk about my training plan.");
}

export async function blockStartSession(templateName) {
    closeBlockSession();
    if (typeof window.startWorkout === 'function') await window.startWorkout(templateName);
}

// Self-wire handlers rendered from this module's own templates.
if (typeof window !== 'undefined') {
    window.openBlockPage = openBlockPage;
    window.openBlockSession = openBlockSession;
    window.closeBlockSession = closeBlockSession;
    window.blockAdjustWeek = blockAdjustWeek;
    window.blockSwapAccessory = blockSwapAccessory;
    window.blockPlanNext = blockPlanNext;
    window.blockDiscuss = blockDiscuss;
    window.blockStartSession = blockStartSession;
}
