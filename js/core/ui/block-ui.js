// Plan page (TP-3; was the Block page, AP-24) — one continuous plan.
//
// Route 'plan' (alias 'block' for old links). What was done, this week with
// today's Start, the planned weeks of the current wave with their targets,
// and projected weeks to the horizon (session names and week kinds, no
// numbers), with goals and dated events on the timeline. The user never sees
// a "block": waves are scaffolding (features/plan-timeline.js). When a wave
// ends, the Sunday job rolls the next (features/plan-roller.js) — this page
// shows the notice, the waiting accessory swaps, and undo.

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification, formatSet, unitLabel } from './ui-helpers.js';
import { navigateTo } from './navigation.js';
import { debugLog } from '../utils/config.js';
import { buildBlockSession } from '../features/block-view.js';
import { buildPlanTimeline } from '../features/plan-timeline.js';
import { rollUndoable } from '../features/plan-roller.js';
import { waitingSwaps, rankRotationCandidates, rotationHistory, variantForWeek, DEFAULT_VARIETY_CADENCE } from '../features/exercise-rotation.js';
import { inferRole, inferPattern } from '../features/movement-patterns.js';
import { travelOn, genericFallbacks, gymLevel, usualGym, LEVEL_LABELS } from '../features/gym-profile.js';
import { planWeekSessions } from '../features/plan-sessions.js';
import { weekOverrideOf } from '../features/session-intent.js';
import { openSheet, closeSheet } from './sheet.js';
import { confirmSheet, promptSheet } from './confirm-sheet.js';
import { cloneForMyWorkouts } from '../features/plan-sessions.js';
import { once } from './busy.js';

let _tl = null;    // the timeline on screen
let _ctx = null;   // the data it was built from

export function openBlockPage() {
    navigateTo('plan');
}

// TP-6 b — another surface (the Sunday card's "Pick a different one") opens
// the Plan page with the rotate sheet already on one exercise.
let _pendingRotate = null;
export function openRotateFromCard(templateId, index) {
    _pendingRotate = { templateId, index: Number(index) };
    navigateTo('plan');
}

const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const varietyCadence = () => _ctx?.plan?.varietyCadence || DEFAULT_VARIETY_CADENCE;

function plates(unit) {
    return unit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs;
}

async function loadContext() {
    const [{ loadPlan, loadPrograms }, { loadGoalData, loadGoals, loadEvents }] = await Promise.all([
        import('../features/plan.js'), import('../features/goals.js'),
    ]);
    // TP-6 j — a coach edit whose re-read missed the server: ask again first.
    // Never fatal: the page renders from what's in memory.
    try {
        const { ensureFreshAfterServerWrite } = await import('../data/server-sync.js');
        await ensureFreshAfterServerWrite();
    } catch (e) { debugLog('plan: server re-read skipped', e); }
    if (AppState._weekPlan === undefined) {
        try {
            const { loadWeekPlan } = await import('../features/week-plan.js');
            await loadWeekPlan();
        } catch (e) { debugLog('plan: week plan load failed', e); }
    }
    const [plan, programs, data, goals, events] = await Promise.all([loadPlan(), loadPrograms(), loadGoalData(), loadGoals(), loadEvents()]);
    return {
        plan, programs, goals, events,
        weekPlan: AppState._weekPlan || null,
        templates: data.templates, workouts: data.workouts, measurements: data.measurements, dexa: data.dexa,
        unit: data.unit, today: data.today,
        override: weekOverrideOf(AppState.settings),
    };
}

export async function renderBlockPage() {
    const container = document.getElementById('block-content');
    if (!container) return;
    container.innerHTML = '<div class="skeleton skeleton-card dash-skel--hero"></div>';
    try {
        _ctx = await loadContext();
        const hasSplit = Object.values(_ctx.weekPlan?.days || {}).some(v => v && v !== 'rest');
        if (!_ctx.plan && !_ctx.programs.length && !hasSplit) { container.innerHTML = emptyHTML(); return; }
        _tl = buildPlanTimeline({ ..._ctx, plates: plates(_ctx.unit) });
        container.innerHTML = planHTML(_tl, _ctx);
        if (_pendingRotate) {
            const r = _pendingRotate;
            _pendingRotate = null;
            openRotateSheet(r.templateId, r.index);
        }
    } catch (e) {
        console.error('❌ Plan page failed:', e);
        container.innerHTML = `${headerHTML('Your plan', '')}<div class="d-content"><div class="empty-state">
            <div class="empty-state-title">Couldn't load your plan</div>
            <div class="empty-state-description">Check your connection and try again.</div>
        </div></div>`;
    }
}

function headerHTML(title, subtitle, { settings = false } = {}) {
    return `
        <div class="page-header page-header--detail">
            <button class="page-header__back" onclick="navigateBack()" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info">
                <div>
                    <div class="d-title">${escapeHtml(title)}</div>
                    ${subtitle ? `<div class="d-subtitle">${escapeHtml(subtitle)}</div>` : ''}
                </div>
            </div>
            ${settings ? '<button class="page-header__icon-btn" onclick="openPlanSettings()" aria-label="Plan settings"><i class="fas fa-gear" aria-hidden="true"></i></button>' : ''}
        </div>`;
}

function emptyHTML() {
    return `
        ${headerHTML('Your plan', '')}
        <div class="d-content block-page">
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-flag-checkered"></i></div>
                <div class="empty-state-title">No plan yet</div>
                <div class="empty-state-description">Plan the next few weeks with the coach — every week, day and target shows up here, and it keeps going on its own.</div>
                <button class="btn btn-primary" onclick="startProgramChat()">Build my plan</button>
            </div>
        </div>`;
}

const PILL = { ahead: 'goal-pill--good', 'on-track': 'goal-pill--good', met: 'goal-pill--good', behind: 'goal-pill--warn', missed: 'goal-pill--bad' };

function noticeHTML(tl, ctx) {
    const active = tl.activeProgram;
    if (!ctx.plan && active) {
        return `
            <div class="hero-card plan-notice">
                <div class="plan-notice__title">Keep it going</div>
                <div class="plan-notice__text">When these weeks end, the next ones are set up for you — same sessions, a lighter week every fourth. You can undo any week until you log a workout in it.</div>
                <div class="plan-notice__actions"><button class="btn btn-primary btn-sm" onclick="planEnable()">Turn it on</button></div>
            </div>`;
    }
    if (!ctx.plan) {
        return `
            <div class="hero-card plan-notice">
                <div class="plan-notice__title">Turn on your plan</div>
                <div class="plan-notice__text">Your week plan repeats as it is. Turn on your plan and the weeks fill in with targets — three build weeks, then a lighter one.</div>
                <div class="plan-notice__actions"><button class="btn btn-primary btn-sm" onclick="planEnable()">Turn it on</button></div>
            </div>`;
    }
    if (ctx.plan.paused) {
        return `
            <div class="hero-card plan-notice">
                <div class="plan-notice__title">Your plan is paused</div>
                <div class="plan-notice__text">It won't continue on its own until you turn it back on.</div>
                <div class="plan-notice__actions"><button class="btn btn-primary btn-sm" onclick="planResume()">Resume</button></div>
            </div>`;
    }
    // TP-6 f — swaps waiting on ANY program (a rolled wave's, or ones a
    // coach-made plan describes but the workouts don't have yet).
    const pending = waitingSwaps(active, ctx.templates);
    if (active?.createdVia === 'auto-roll' && (pending.length || rollUndoable(active, ctx.workouts))) {
        const lighter = tl.weeks.find(w => w.programId === active.id && w.kind === 'lighter');
        const undoable = rollUndoable(active, ctx.workouts);
        const applied = (active.rotationsApplied || []).flatMap(r => r.swaps);
        return `
            <div class="hero-card plan-notice">
                <div class="plan-notice__title">Your plan continues</div>
                <div class="plan-notice__text">The next ${escapeHtml(String(active.weeks))} weeks are set from ${escapeHtml(fmtDate(active.startDate))}: same sessions${lighter ? `, lighter week ${escapeHtml(fmtDate(lighter.weekStart))}` : ''}.${applied.length ? ` Swapped in: ${escapeHtml(applied.map(s => `${s.from} → ${s.to}`).join(', '))}.` : ''}</div>
                ${pending.length ? `<div class="plan-notice__text">${pending.length} accessory swap${pending.length === 1 ? '' : 's'} ready: ${escapeHtml(pending.map(s => `${s.from} → ${s.to}`).join(', '))}</div>` : ''}
                <div class="plan-notice__actions">
                    ${pending.length ? '<button class="btn btn-primary btn-sm" onclick="planApplySwaps()">Rotate them</button>' : ''}
                    ${undoable ? '<button class="btn btn-secondary btn-sm" onclick="planUndoRoll()">Undo</button>' : '<button class="btn btn-secondary btn-sm" onclick="blockDiscuss()">Change my plan</button>'}
                </div>
            </div>`;
    }
    if (pending.length) {
        return `
            <div class="hero-card plan-notice">
                <div class="plan-notice__title">${pending.length} swap${pending.length === 1 ? '' : 's'} waiting</div>
                <div class="plan-notice__text">Your plan lists ${escapeHtml(pending.map(s => `${s.to} in place of ${s.from}`).join(', '))} — your workouts don't have ${pending.length === 1 ? 'it' : 'them'} yet.</div>
                <div class="plan-notice__actions"><button class="btn btn-primary btn-sm" onclick="planApplySwaps()">Make ${pending.length === 1 ? 'this swap' : 'these swaps'}</button></div>
            </div>`;
    }
    return '';
}

/** TP-6 m — a "what's new" row says whether it happened. */
function changedState(x, waiting) {
    if (x.state === 'not-applied') return 'not made';
    if (x.from && waiting.some(w => w.from.toLowerCase() === x.from.toLowerCase() && w.to.toLowerCase() === String(x.to).toLowerCase())) return 'waiting';
    return '';
}

function rationaleHTML(r, waiting = []) {
    if (!r?.block) return '';
    const list = (items, render) => `<ul class="block-rationale__list">${items.map(render).join('')}</ul>`;
    return `
        <div class="block-rationale">
            <div class="block-rationale__line">${escapeHtml(r.block)}</div>
            ${r.fixed?.length ? `<details class="block-rationale__more"><summary>What stays the same and why (${r.fixed.length})</summary>
                ${list(r.fixed, x => `<li><b>${escapeHtml(x.name)}</b>${x.why ? ` — ${escapeHtml(x.why)}` : ''}</li>`)}</details>` : ''}
            ${r.changed?.length ? `<details class="block-rationale__more"><summary>What's new and why (${r.changed.length})</summary>
                ${list(r.changed, x => {
                    const st = changedState(x, waiting);
                    return `<li>${x.from ? `${escapeHtml(x.from)} → ` : ''}<b>${escapeHtml(x.to)}</b>${x.why ? ` — ${escapeHtml(x.why)}` : ''}${st ? ` <span class="chip chip--sm">${st}</span>` : ''}</li>`;
                })}</details>` : ''}
            ${r.watch?.length ? `<details class="block-rationale__more"><summary>What we're watching</summary>
                ${list(r.watch, x => `<li>${escapeHtml(x)}</li>`)}</details>` : ''}
        </div>`;
}

function planHTML(tl, ctx) {
    const h = tl.header;
    const sub = [h.thisWeek ? `This week: ${h.thisWeek}` : null, h.paused ? 'Paused' : null].filter(Boolean).join(' · ');
    const meta = [
        ctx.plan ? `${h.cadenceText.charAt(0).toUpperCase()}${h.cadenceText.slice(1)}, through ${h.through}` : null,
        h.nextLighter ? `Lighter week starts ${fmtDate(h.nextLighter)}` : null,
        h.nextEvent ? `${h.nextEvent.name} in ${h.nextEvent.weeks} week${h.nextEvent.weeks === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    const past = tl.weeks.map((w, i) => ({ w, i })).filter(x => x.w.state === 'past');
    const rest = tl.weeks.map((w, i) => ({ w, i })).filter(x => x.w.state !== 'past');
    const why = rationaleHTML(tl.activeProgram?.rationale, waitingSwaps(tl.activeProgram, ctx.templates));
    // TP-6 d — what the user came to see (this week) comes first; settings
    // live behind the gear, the explanation behind "Why this plan".
    return `
        ${headerHTML(h.name, sub, { settings: !!ctx.plan })}
        <div class="d-content block-page">
            ${meta.length || tl.goalsStrip.length ? `
            <div class="block-hero">
                ${meta.length ? `<div class="block-hero__meta">${meta.map(escapeHtml).join(' · ')}</div>` : ''}
                ${tl.goalsStrip.length ? `<div class="plan-goals">${tl.goalsStrip.map(g => `<button class="chip chip--sm" onclick="openGoalsPage()">${escapeHtml(g.name)}${g.statusLabel ? ` <span class="goal-pill ${PILL[g.status] || ''}">${escapeHtml(g.statusLabel)}</span>` : ''}</button>`).join('')}</div>` : ''}
            </div>` : ''}
            ${noticeHTML(tl, ctx)}
            ${rest.map(x => weekHTML(x.w, x.i)).join('')}
            ${past.length ? `<details class="plan-past"><summary>Earlier weeks (${past.length})</summary>${past.map(x => weekHTML(x.w, x.i)).join('')}</details>` : ''}
            ${why ? `<details class="block-rationale__more plan-why"><summary>Why this plan</summary>${why}</details>` : ''}
            <div class="block-actions">
                <button class="chip chip--sm" onclick="blockAdjustWeek()"><i class="fas fa-feather" aria-hidden="true"></i> Lighter week</button>
                <button class="chip chip--sm" onclick="openRotateSheet()"><i class="fas fa-arrow-right-arrow-left" aria-hidden="true"></i> Rotate an exercise</button>
                <button class="chip chip--sm" onclick="blockDiscuss()"><i class="fas fa-comment" aria-hidden="true"></i> Change my plan</button>
            </div>
        </div>`;
}

const STATUS_ICON = {
    done: 'fa-check', missed: 'fa-times', today: 'fa-play', upcoming: 'fa-circle', projected: 'fa-circle',
};

// Block targets and results are already in the plan's unit — no conversion.
function blockSet(x, unit) {
    if (!x) return '—';
    if (!x.reps) return `${x.weight} ${unitLabel(unit)}`;
    return formatSet({ reps: x.reps, weight: x.weight, originalUnit: unit }, unit, { effort: false });
}

function primaryLine(cell, unit) {
    const p = cell.primary;
    if (cell.status === 'projected') return '';
    if (!p) return '';
    if (cell.status === 'done' && p.logged) {
        const mark = p.result === 'hit' ? ' ✓' : p.result === 'below' ? ' ↓' : '';
        return `${p.name} ${blockSet(p.logged, unit)}${p.target ? ` · target ${blockSet(p.target, unit)}` : ''}${mark}`;
    }
    return p.target ? `${p.name} · target ${blockSet(p.target, unit)}` : `${p.name} · no history yet`;
}

/** TP-7 c — the trip a date falls on (the plan keeps the session; the gym changes). */
function tripOf(date) {
    return date ? travelOn(date, _ctx?.events || []) : null;
}

/** TP-8 — any session this week on a different version than last week. */
function switchesThisWeek(w) {
    if (!w.programId || !(w.waveWeek > 1)) return false;
    const byId = new Map((_ctx?.templates || []).map(t => [t.id, t]));
    const cad = varietyCadence();
    return w.days.some(c => (byId.get(c.templateId)?.exercises || []).some((row, i) =>
        variantForWeek(row, w.waveWeek, cad, i).variantIndex !== variantForWeek(row, w.waveWeek - 1, cad, i).variantIndex));
}

function weekHTML(w, idx) {
    const unit = _ctx?.unit || 'lbs';
    const meta = [w.projected ? 'projected' : w.levers, `${fmtDate(w.weekStart)}–${fmtDate(w.weekEnd)}`].filter(Boolean).join(' · ');
    const state = w.state === 'current' ? ' block-week--current' : w.state === 'past' ? ' block-week--past' : w.projected ? ' plan-week--projected' : '';
    return `
        <section class="block-week${state}" aria-label="${escapeAttr(`${w.label}, week of ${fmtDate(w.weekStart)}`)}">
            <div class="sec-head sec-head--compact">
                <h3>${escapeHtml(w.label)}${w.state === 'current' ? ' <span class="block-week__now">This week</span>' : ''}</h3>
                <span class="sec-head__meta">${escapeHtml(meta)}</span>
            </div>
            ${w.markers.length || switchesThisWeek(w) ? `<div class="plan-markers">${w.markers.map(m => `<span class="chip chip--sm"><i class="fas ${{ event: 'fa-calendar-day', travel: 'fa-plane', goal: 'fa-bullseye' }[m.type] || 'fa-calendar-day'}" aria-hidden="true"></i> ${escapeHtml(m.label)}</span>`).join('')}${switchesThisWeek(w) ? '<span class="chip chip--sm"><i class="fas fa-rotate" aria-hidden="true"></i> Accessories switch</span>' : ''}</div>` : ''}
            ${w.override ? `<div class="block-week__override"><i class="fas fa-feather"></i> ${escapeHtml(w.override.label)}${w.override.levers ? ` · ${escapeHtml(w.override.levers)}` : ''}${w.override.reason ? ` — ${escapeHtml(w.override.reason)}` : ''}</div>` : ''}
            <div class="block-week__cells">
                ${w.days.map((c, i) => `
                    <div class="row-card block-cell block-cell--${c.status}" role="button" tabindex="0"
                         onclick="openBlockSession(${idx}, ${i})" aria-label="${escapeAttr(`${c.dayLabel} ${c.name}, ${c.status}`)}">
                        <div class="row-card__icon block-cell__icon"><i class="fas ${STATUS_ICON[c.status] || 'fa-circle'}" aria-hidden="true"></i></div>
                        <div class="row-card__content">
                            <div class="row-card__title">${escapeHtml(c.dayLabel)} · ${escapeHtml(c.name)}</div>
                            ${primaryLine(c, unit) ? `<div class="row-card__detail">${escapeHtml(primaryLine(c, unit))}</div>` : ''}
                            ${tripOf(c.date) ? `<div class="row-card__detail"><i class="fas fa-plane" aria-hidden="true"></i> ${escapeHtml(tripOf(c.date).name)} · ${escapeHtml(LEVEL_LABELS[tripOf(c.date).level || 'hotel'].toLowerCase())}</div>` : ''}
                        </div>
                        ${c.status === 'today'
        ? `<button class="btn btn-primary btn-sm block-cell__start" onclick="event.stopPropagation(); blockStartSession('${escapeAttr(c.name)}')">Start</button>`
        : '<i class="fas fa-chevron-right row-card__action" aria-hidden="true"></i>'}
                    </div>`).join('')}
            </div>
        </section>`;
}

// ── Session sheet: one cell in full ──────────────────────────────────

const BLOCK_SESSION_SHEET_ID = 'block-session-sheet';

export function closeBlockSession({ immediate = false } = {}) {
    closeSheet(BLOCK_SESSION_SHEET_ID, { immediate: immediate === true });
}

export function openBlockSession(weekIdx, cellIdx) {
    const w = _tl?.weeks?.[weekIdx];
    const cell = w?.days?.[cellIdx];
    if (!cell || !_ctx) return;
    const template = (_ctx.templates || []).find(t => t.id === cell.templateId);
    const program = w.programId ? (_ctx.programs || []).find(p => p.id === w.programId) : null;
    const rows = w.projected
        ? (template?.exercises || []).map(ex => ({ name: ex.machine || ex.name, sets: Number(ex.sets) || 3, primary: ex.role === 'primary', target: null, logged: null })).filter(r => r.name)
        : buildBlockSession({ cell, template, workouts: _ctx.workouts, program, override: _ctx.override, unit: _ctx.unit, plates: plates(_ctx.unit), week: w.waveWeek, cadence: varietyCadence() });
    // TP-7 c — on a trip, each exercise gets what to do on the gym there.
    const trip = tripOf(cell.date);
    const tripText = (r) => {
        if (!trip) return '';
        const f = genericFallbacks(inferPattern({ name: r.name }), trip.level || 'hotel', { exclude: [r.name] })[0];
        return f ? ` · ${LEVEL_LABELS[trip.level || 'hotel'].toLowerCase()}: ${f.name}` : '';
    };
    // TP-8 — "Rope Face Pulls from Nov 9": the date the slot switches next.
    const switchText = (r) => {
        if (!r.next || !program?.startDate) return '';
        const d = new Date(`${program.startDate}T12:00:00`);
        d.setDate(d.getDate() + (r.next.week - 1) * 7);
        return ` · ${r.next.name} from ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    };
    // TP-6 b — accessories swap from here in one tap (not on a session already done).
    const swapIndex = (name) => {
        if (!template || cell.status === 'done' || w.state === 'past') return -1;
        const i = (template.exercises || []).findIndex(ex => (ex.machine || ex.name) === name || (ex.alternates || []).some(a => a?.name === name));
        return i >= 0 && inferRole(template.exercises[i], i) !== 'primary' ? i : -1;
    };
    const fmt = (x) => blockSet(x, _ctx?.unit || 'lbs');
    const status = { done: `Done ${cell.doneOn ? fmtDate(cell.doneOn) : ''}`, missed: 'Missed', today: 'Today', upcoming: fmtDate(cell.date), projected: `${fmtDate(cell.date)} · projected` }[cell.status];
    const startable = ['today', 'upcoming', 'missed', 'projected'].includes(cell.status);
    const primaryAction = startable
        ? { label: `Start ${escapeHtml(cell.name)}`, onClick: `blockStartSession('${escapeAttr(cell.name)}')`, primary: true }
        : (cell.workoutId ? { label: 'Open workout', onClick: `closeBlockSession(); viewWorkout('${escapeAttr(cell.workoutId)}')`, primary: true } : null);

    openSheet({
        id: BLOCK_SESSION_SHEET_ID,
        title: cell.name,
        subtitle: `${w.label} · ${status}${trip ? ` · ${trip.name}` : ''}`,
        bodyHTML: rows.length ? rows.map(r => `
                <div class="js-row">
                    <div class="js-row__info">
                        <div class="js-row__name">${escapeHtml(r.name)}${r.primary ? ' <span class="block-session__main">Main lift</span>' : ''}</div>
                        <div class="js-row__meta">${r.sets} sets${w.projected ? ' · targets fill in when these weeks are set' : ` · target ${escapeHtml(fmt(r.target))}`}${r.logged ? ` · logged ${escapeHtml(fmt(r.logged))}` : ''}${r.variantOf ? ` · in place of ${escapeHtml(r.variantOf)}` : ''}${escapeHtml(switchText(r))}${escapeHtml(tripText(r))}</div>
                    </div>
                    ${swapIndex(r.name) >= 0 ? `<button class="btn btn-secondary btn-sm" onclick="closeBlockSession({ immediate: true }); openRotateSheet('${escapeAttr(template.id)}', ${swapIndex(r.name)})" aria-label="${escapeAttr(`Swap ${r.name}`)}"><i class="fas fa-arrow-right-arrow-left" aria-hidden="true"></i></button>` : ''}
                </div>`).join('') : `
                <div class="empty-state-compact">
                    <p>This workout has no exercises yet</p>
                    <p class="empty-state-hint">Add some in your workouts and their targets show up here.</p>
                </div>`,
        actions: [
            { label: 'Close', onClick: 'closeBlockSession()' },
            // TP-4 — a session built for the plan can be kept in the user's own list.
            ...(template?.planOwned ? [{ label: 'Save to my workouts', onClick: `closeBlockSession(); saveSessionToMyWorkouts('${escapeAttr(template.id)}')` }] : []),
            ...(primaryAction ? [primaryAction] : []),
        ],
    });
}

// ── Actions ──────────────────────────────────────────────────────────

// AU-14 — every plan action PREFILLS the coach input; nothing is sent
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
    const h = _tl?.header;
    askCoachSeeded(h?.thisWeek
        ? `Make this week lighter (it's a ${h.thisWeek.replace(/ \d+$/, '').toLowerCase()} in my plan) — I want it a bit easier. Propose the week adjustment.`
        : 'Make this week lighter — I want it a bit easier.');
}

export function blockSwapAccessory(exercise = null) {
    askCoachSeeded(exercise
        ? `Swap ${exercise} in my plan for something that trains the same thing — show me the best candidates and keep my main lifts.`
        : 'Rotate an accessory in my plan — show me the best candidates for something I\'ve been doing too long, and keep my main lifts.');
}

export function blockPlanNext() {
    askCoachSeeded('Plan my next few weeks — start with how these went and the draft of what comes next, then propose it.');
}

export function blockDiscuss() {
    const h = _tl?.header;
    const parts = h ? [h.cadenceText, h.thisWeek ? `this week is ${h.thisWeek.toLowerCase()}` : null, h.nextLighter ? `lighter week ${fmtDate(h.nextLighter)}` : null].filter(Boolean) : [];
    askCoachSeeded(parts.length ? `Let's change my plan (${parts.join(', ')}). ` : "Let's talk about my training plan.");
}

export async function blockStartSession(templateName) {
    closeBlockSession({ immediate: true });
    if (typeof window.startWorkout === 'function') await window.startWorkout(templateName);
}

/** Single-flight (busy.js): a second tap while this runs is ignored. */
export function planEnable() {
    return once('plan-enable', () => planEnableNow());
}

async function planEnableNow() {
    const { enablePlanFromProgram } = await import('../features/plan.js');
    if (await enablePlanFromProgram(_tl?.activeProgram || {})) {
        showNotification('Plan on — it keeps going on its own', 'success', 2000);
        await renderBlockPage();
    } else showNotification("Couldn't turn the plan on — try again", 'error');
}

/** Single-flight (busy.js): a second tap while this runs is ignored. */
export function planResume() {
    return once('plan-resume', () => planResumeNow());
}

async function planResumeNow() {
    const { savePlan } = await import('../features/plan.js');
    if (await savePlan({ paused: false })) {
        showNotification('Plan resumed', 'success', 1500);
        await renderBlockPage();
    } else showNotification("Couldn't resume the plan — try again", 'error');
}

// ── Plan settings (TP-6 a) ───────────────────────────────────────────
// Every field update_plan takes, without the coach. The swap choice is a
// setting with a date, not an action: nothing happens on tap.

const PLAN_SETTINGS_ID = 'plan-settings-sheet';
let _draft = null;

const SETTING_OPTIONS = {
    sessionMinutes: [[45, '45 min'], [60, '60 min'], [75, '75 min'], [90, '90 min']],
    lighter: [[2, 'Every 3rd week'], [3, 'Every 4th week'], [4, 'Every 5th week'], [0, 'Never']],
    horizonWeeks: [[4, '1 month'], [8, '2 months'], [12, '3 months'], [26, '6 months']],
    rotationPolicy: [['ask', 'Ask me first'], ['auto', 'Swap them for me']],
    paused: [[false, 'Keep going'], [true, 'Paused']],
    varietyCadence: [['biweekly', 'Every 2 weeks'], ['weekly', 'Every week'], ['wave', 'Only with new weeks']],
};

function segmentedHTML(key) {
    return `<div class="segmented" role="group">${SETTING_OPTIONS[key].map(([v, label]) => `
        <button class="${_draft[key] === v ? 'active' : ''}" onclick="planSettingPick('${key}', ${JSON.stringify(v).replace(/"/g, "'")}, this)">${escapeHtml(label)}</button>`).join('')}</div>`;
}

function trainingDaysText() {
    const days = _ctx?.weekPlan?.days || {};
    const names = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
    const on = Object.keys(names).filter(d => days[d] && days[d] !== 'rest').map(d => names[d]);
    return on.length ? on.join(' · ') : 'Not set';
}

function planSettingsBody() {
    return `
        <div class="plan-settings">
            <label class="field-label" for="plan-set-name">Name</label>
            <input id="plan-set-name" class="field-input" value="${escapeAttr(_draft.name)}" maxlength="60">
            <button class="row-card plan-settings__row" onclick="closePlanSettings(); openWeekPlanSheet()">
                <span class="row-card__content"><span class="row-card__title">Training days</span><span class="row-card__subtitle">${escapeHtml(trainingDaysText())}</span></span>
                <i class="fas fa-chevron-right row-card__action" aria-hidden="true"></i>
            </button>
            <div class="field-label">Minutes per session</div>
            ${segmentedHTML('sessionMinutes')}
            <div class="field-label">Lighter week</div>
            ${segmentedHTML('lighter')}
            <div class="field-label">How far ahead to fill in</div>
            ${segmentedHTML('horizonWeeks')}
            <div class="field-label">Accessories with an alternate switch</div>
            ${segmentedHTML('varietyCadence')}
            <div class="field-label">When the next weeks are set up, accessory swaps</div>
            ${segmentedHTML('rotationPolicy')}
            <p class="plan-settings__hint">Main lifts never swap. Accessories swap when you've been on one a long time.</p>
            <div class="field-label">Plan</div>
            ${segmentedHTML('paused')}
        </div>`;
}

export function openPlanSettings() {
    const p = _ctx?.plan;
    if (!p) return;
    const cad = p.cadence || {};
    _draft = {
        name: p.name || 'My plan',
        sessionMinutes: Number(p.sessionMinutes) || null,
        lighter: cad.lighterWeek === false ? 0 : (Number(cad.buildWeeks) || 3),
        horizonWeeks: Number(p.horizonWeeks) || 12,
        rotationPolicy: p.rotationPolicy === 'auto' ? 'auto' : 'ask',
        paused: p.paused === true,
        varietyCadence: p.varietyCadence || DEFAULT_VARIETY_CADENCE,
    };
    openSheet({
        id: PLAN_SETTINGS_ID,
        title: 'Plan settings',
        bodyHTML: planSettingsBody(),
        actions: [
            { label: 'Close', onClick: 'closePlanSettings()' },
            { label: 'Save changes', onClick: 'savePlanSettings()', primary: true },
        ],
    });
}

export function closePlanSettings() {
    closeSheet(PLAN_SETTINGS_ID);
}

export function planSettingPick(key, value, btn) {
    if (!_draft || !(key in SETTING_OPTIONS)) return;
    _draft[key] = value;
    btn?.parentElement?.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
}

/** Single-flight (busy.js): a second tap while this runs is ignored. */
export function savePlanSettings() {
    return once('plan-settings-save', () => savePlanSettingsNow(), { button: document.querySelector(`#${PLAN_SETTINGS_ID} .btn-primary`), label: 'Saving…' });
}

async function savePlanSettingsNow() {
    const p = _ctx?.plan;
    if (!p || !_draft) return;
    const name = (document.getElementById('plan-set-name')?.value || '').trim().slice(0, 60) || 'My plan';
    const cadence = _draft.lighter === 0
        ? { buildWeeks: Number(p.cadence?.buildWeeks) || 3, lighterWeek: false }
        : { buildWeeks: _draft.lighter, lighterWeek: true };
    const patch = {};
    if (name !== (p.name || 'My plan')) patch.name = name;
    if (_draft.sessionMinutes && _draft.sessionMinutes !== Number(p.sessionMinutes)) patch.sessionMinutes = _draft.sessionMinutes;
    if (cadence.buildWeeks !== Number(p.cadence?.buildWeeks || 3) || cadence.lighterWeek !== (p.cadence?.lighterWeek !== false)) patch.cadence = cadence;
    if (_draft.horizonWeeks !== (Number(p.horizonWeeks) || 12)) patch.horizonWeeks = _draft.horizonWeeks;
    const policyChanged = _draft.rotationPolicy !== (p.rotationPolicy === 'auto' ? 'auto' : 'ask');
    if (policyChanged) patch.rotationPolicy = _draft.rotationPolicy;
    if (_draft.varietyCadence !== (p.varietyCadence || DEFAULT_VARIETY_CADENCE)) patch.varietyCadence = _draft.varietyCadence;
    if (_draft.paused !== (p.paused === true)) Object.assign(patch, _draft.paused ? { paused: true, pausedAt: new Date().toISOString(), pausedBy: 'plan-settings' } : { paused: false });
    if (!Object.keys(patch).length) { closePlanSettings(); return; }
    const { savePlan } = await import('../features/plan.js');
    if (!(await savePlan(patch))) { showNotification("Couldn't save your plan — try again", 'error'); return; }
    // The swap choice takes effect at the next set-up, so say when.
    const roll = _tl?.header?.nextRoll;
    const msg = !policyChanged ? 'Plan saved'
        : _draft.rotationPolicy === 'auto'
            ? `Got it — swaps happen when the next weeks are set up${roll ? ` on ${fmtDate(roll)}` : ''}`
            : 'Got it — swaps will be offered on your Sunday card';
    showNotification(msg, 'success', 2500);
    closePlanSettings();
    await renderBlockPage();
}

// ── Rotate an exercise (TP-6 b) — rules only, no coach turn ──────────

const ROTATE_SHEET_ID = 'plan-rotate-sheet';
let _rotate = null; // { templateId, index, candidates }

const lc = (x) => String(x || '').trim().toLowerCase();
const nameOfRow = (ex) => ex?.machine || ex?.name || '';

/** How long an exercise has been on: since its swap-in (or first log) and how many sessions. */
function tenure(row) {
    const n = lc(nameOfRow(row));
    const since = row?.rotatedAt ? String(row.rotatedAt).slice(0, 10) : null;
    const dates = (_ctx?.workouts || []).filter(wo => (!since || wo.date >= since) && [
        ...Object.values(wo.exerciseNames || {}),
        ...Object.values(wo.exercises || {}).map(e => e?.name),
    ].some(x => lc(x) === n)).map(wo => wo.date).sort();
    const from = since || dates[0] || null;
    return [from ? `since ${fmtDate(from)}` : 'not logged yet', dates.length ? `${dates.length} session${dates.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
}

function rotateListBody() {
    const sessions = planWeekSessions({ weekPlan: _ctx?.weekPlan || null, templates: _ctx?.templates || [], workouts: _ctx?.workouts || [], today: _ctx?.today });
    const seen = new Set();
    const groups = sessions.filter(x => !seen.has(x.template.id) && seen.add(x.template.id)).map((x) => {
        const t = x.template;
        const rows = (t.exercises || []).map((ex, i) => {
            const name = nameOfRow(ex);
            if (!name) return '';
            if (inferRole(ex, i) === 'primary') {
                return `<div class="js-row js-row--locked"><div class="js-row__info"><div class="js-row__name"><i class="fas fa-lock" aria-hidden="true"></i> ${escapeHtml(name)}</div><div class="js-row__meta">Stays — your strength numbers depend on it</div></div></div>`;
            }
            return `<button class="js-row" onclick="rotatePick('${escapeAttr(t.id)}', ${i})"><div class="js-row__info"><div class="js-row__name">${escapeHtml(name)}</div><div class="js-row__meta">${escapeHtml(tenure(ex))}</div></div><i class="fas fa-chevron-right" aria-hidden="true"></i></button>`;
        }).join('');
        return `<div class="field-label">${escapeHtml(x.dayLabel)} · ${escapeHtml(t.name || t.id)}</div>${rows}`;
    }).join('');
    return groups || `
        <div class="empty-state-compact">
            <p>No sessions this week</p>
            <p class="empty-state-hint">Set your training days in Plan settings and their exercises show up here.</p>
        </div>`;
}

export async function openRotateSheet(templateId = null, index = null) {
    if (!_ctx) return;
    _rotate = null;
    openSheet({
        id: ROTATE_SHEET_ID,
        title: 'Rotate an exercise',
        subtitle: 'Pick an accessory to swap',
        bodyHTML: rotateListBody(),
        actions: [
            { label: 'Close', onClick: 'closeRotateSheet()' },
            { label: 'Ask the coach instead', onClick: 'closeRotateSheet(); blockSwapAccessory()' },
        ],
    });
    if (templateId != null && index != null) await rotatePick(templateId, index);
}

export function closeRotateSheet() {
    closeSheet(ROTATE_SHEET_ID);
}

export function rotateBack() {
    _rotate = null;
    openRotateSheet();
}

async function equipmentNow() {
    if (Array.isArray(AppState._cachedEquipment) && AppState._cachedEquipment.length) return AppState._cachedEquipment;
    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        return (await new FirebaseWorkoutManager(AppState).getUserEquipment()) || [];
    } catch { return []; }
}

export async function rotatePick(templateId, index) {
    const t = (_ctx?.templates || []).find(x => x.id === templateId);
    const row = t?.exercises?.[index];
    if (!row) return;
    const name = nameOfRow(row);
    const byName = new Map((AppState.exerciseDatabase || []).filter(e => e?.name).map(e => [lc(e.name), e]));
    // TP-7 — start from what's at the gym you usually train at, then plan
    // what isn't mapped there (machines from other gyms, the movement on
    // dumbbells or a cable) — you pick the machine when you get there.
    const equipment = await equipmentNow();
    const gym = usualGym(_ctx.workouts || [], { today: _ctx.today });
    const gymDoc = (AppState._cachedLocations || []).find(l => l?.name === gym) || null;
    const mapped = gym ? equipment.filter(e => (e.locations || []).some(l => lc(l) === lc(gym))).length : 0;
    const ranked = rankRotationCandidates({
        exercise: name, slot: row, equipment, location: gym,
        lookup: (n) => byName.get(lc(n)), exclude: (t.exercises || []).map(nameOfRow).filter(Boolean),
        history: rotationHistory(_ctx.programs || []), today: _ctx.today, limit: 4,
        widen: true, level: gymLevel(gymDoc, mapped),
    });
    _rotate = { templateId, index, candidates: ranked.candidates };
    const cadText = { biweekly: 'every 2 weeks', weekly: 'every week', wave: 'with new weeks' }[varietyCadence()] || 'every 2 weeks';
    const rows = ranked.candidates.map((c, i) => `
        <div class="js-row">
            <div class="js-row__info"><div class="js-row__name">${escapeHtml(c.name)}</div><div class="js-row__meta">${c.equipment ? `${escapeHtml(c.equipment)} · ` : ''}${escapeHtml(c.reason)}</div></div>
            <button class="btn btn-secondary btn-sm" onclick="rotateAlternate(${i})" aria-label="${escapeAttr(`Alternate ${name} with ${c.name}, ${cadText}`)}">Alternate</button>
            <button class="btn btn-primary btn-sm" onclick="rotateApply(${i})" aria-label="${escapeAttr(`Replace ${name} with ${c.name}`)}">Replace</button>
        </div>`).join('');
    const left = (ranked.excluded || []).map(x => `${x.name} (${x.reason})`).join(', ');
    const body = `
        <div class="field-label">Replace ${escapeHtml(name)}, or alternate with it ${escapeHtml(cadText)}</div>
        ${(row.alternates || []).length ? `<p class="plan-settings__hint">Alternates now with ${escapeHtml(row.alternates.map(a => a.name).join(', '))} — picking another replaces that.</p>` : ''}
        ${rows || `<div class="empty-state-compact"><p>Nothing else in your equipment trains this</p><p class="empty-state-hint">Ask the coach — it can suggest one and you pick the machine at the gym.</p></div>`}
        ${left ? `<p class="plan-settings__hint">Left out: ${escapeHtml(left)} — you just moved off ${(ranked.excluded || []).length === 1 ? 'it' : 'them'}.</p>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="rotateBack()">Back to the list</button>`;
    const sheet = document.getElementById(ROTATE_SHEET_ID);
    if (!sheet) return;
    openSheet({
        id: ROTATE_SHEET_ID,
        title: 'Rotate an exercise',
        subtitle: `${t.name || ''} · ${tenure(row)}`,
        bodyHTML: body,
        actions: [
            { label: 'Close', onClick: 'closeRotateSheet()' },
            { label: 'Ask the coach instead', onClick: `closeRotateSheet(); blockSwapAccessory('${escapeAttr(name)}')` },
        ],
    });
}

/** TP-8 — keep the exercise and add an alternate (the plan switches between them). */
export function rotateAlternate(i) {
    return once('plan-rotate', () => rotateAlternateNow(i));
}

async function rotateAlternateNow(i) {
    const c = _rotate?.candidates?.[i];
    const t = (_ctx?.templates || []).find(x => x.id === _rotate?.templateId);
    const row = t?.exercises?.[_rotate.index];
    if (!c || !row) return;
    try {
        const { setAlternate } = await import('../features/plan.js');
        const done = await setAlternate(t.id, _rotate.index, { name: c.name, equipment: c.equipment });
        if (!done) { showNotification("Couldn't add it — try again", 'error'); return; }
        closeRotateSheet();
        showNotification(`${nameOfRow(row)} and ${c.name} now take turns`, 'success', null, {
            label: 'Undo',
            onClick: async () => {
                await setAlternate(t.id, _rotate?.index ?? done.index, null, { restore: done.prior });
                showNotification(`${nameOfRow(row)} stays as it was`, 'success', 1500);
                await renderBlockPage();
            },
        });
        await renderBlockPage();
    } catch (e) {
        console.error('❌ Alternate failed:', e);
        showNotification("Couldn't add it — try again", 'error');
    }
}

/** Single-flight (busy.js): a second tap while this runs is ignored. */
export function rotateApply(i) {
    return once('plan-rotate', () => rotateApplyNow(i));
}

async function rotateApplyNow(i) {
    const c = _rotate?.candidates?.[i];
    const t = (_ctx?.templates || []).find(x => x.id === _rotate?.templateId);
    const row = t?.exercises?.[_rotate.index];
    if (!c || !row) return;
    const swap = { index: _rotate.index, from: nameOfRow(row), to: c.name, equipment: c.equipment, reason: c.reason };
    try {
        const { swapInTemplate, undoSwapInTemplate } = await import('../features/plan.js');
        const program = _tl?.activeProgram || null;
        const done = await swapInTemplate(t.id, swap, program);
        if (!done) { showNotification("Couldn't swap it — try again", 'error'); return; }
        closeRotateSheet();
        showNotification(`${swap.to} in place of ${swap.from}`, 'success', null, {
            label: 'Undo',
            onClick: async () => {
                await undoSwapInTemplate(t.id, done, program);
                showNotification(`${swap.from} is back`, 'success', 1500);
                await renderBlockPage();
            },
        });
        await renderBlockPage();
    } catch (e) {
        console.error('❌ Rotate failed:', e);
        showNotification("Couldn't swap it — try again", 'error');
    }
}

/** Single-flight (busy.js): a second tap while this runs is ignored. */
export function planApplySwaps() {
    return once('plan-apply-swaps', () => planApplySwapsNow());
}

async function planApplySwapsNow() {
    const program = _tl?.activeProgram;
    if (!program) return;
    try {
        const { applyPendingRotations } = await import('../features/plan.js');
        const r = await applyPendingRotations(program);
        showNotification(r.skipped ? `${r.applied} swapped · ${r.skipped} skipped (the workout changed)` : `${r.applied} swapped in`, 'success', 2500);
        await renderBlockPage();
    } catch (e) {
        console.error('❌ Apply swaps failed:', e);
        showNotification("Couldn't apply the swaps — try again", 'error');
    }
}

/** Single-flight (busy.js): a second tap while this runs is ignored. */
export function planUndoRoll() {
    return once('plan-undo', () => planUndoRollNow());
}

async function planUndoRollNow() {
    const program = _tl?.activeProgram;
    if (!program) return;
    const ok = await confirmSheet({
        title: 'Undo the next few weeks?',
        message: 'The weeks go back to a projection and your plan pauses until you resume it. Any swaps it made are put back.',
        confirmLabel: 'Undo them', cancelLabel: 'Keep them', destructive: true,
    });
    if (!ok) return;
    try {
        const { undoRoll } = await import('../features/plan.js');
        const r = await undoRoll(program, _ctx?.workouts || []);
        if (!r.ok) {
            showNotification(r.reason === 'logged' ? "You've logged a workout in these weeks — change them with the coach instead" : "Couldn't undo — try again", 'warning', 3500);
            return;
        }
        showNotification('Undone — your plan is paused', 'success', 2000);
        await renderBlockPage();
    } catch (e) {
        console.error('❌ Undo roll failed:', e);
        showNotification("Couldn't undo — try again", 'error');
    }
}

/**
 * TP-4 — "Save to my workouts": a copy of a plan session in the user's own
 * list (name editable). Later swaps in the plan change the plan's copy only.
 */
/** Single-flight (busy.js): a second tap while this runs is ignored. */
export function saveSessionToMyWorkouts(templateId) {
    return once(`save-copy-${templateId}`, () => saveSessionToMyWorkoutsNow(templateId));
}

async function saveSessionToMyWorkoutsNow(templateId) {
    const templates = AppState.workoutPlans || [];
    const t = templates.find(x => x.id === templateId);
    if (!t) { showNotification("Couldn't find that workout — refresh and try again", 'warning'); return; }
    const name = await promptSheet({
        title: 'Save to my workouts',
        message: "A copy goes in your list. Changes to the plan won't touch it.",
        placeholder: 'Workout name', initialValue: `${t.name || 'Workout'} (saved)`, confirmLabel: 'Save workout', cancelLabel: 'Keep it in the plan',
    });
    if (name == null) return;
    try {
        const clone = cloneForMyWorkouts(t, { name, date: AppState.getTodayDateString() });
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        await new FirebaseWorkoutManager(AppState).saveWorkoutTemplate(clone);
        AppState.workoutPlans = [...templates, clone];
        showNotification(`${clone.name} saved to your workouts`, 'success', 2000);
        // Accept the in-memory list as current and repaint the Workouts tab if it's up.
        const { acceptCoachTemplateRefresh } = await import('./template-selection.js').catch(() => ({}));
        if (typeof acceptCoachTemplateRefresh === 'function') acceptCoachTemplateRefresh();
    } catch (e) {
        console.error('❌ Save to my workouts failed:', e);
        showNotification("Couldn't save the workout — try again", 'error');
    }
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
    window.planEnable = planEnable;
    window.planResume = planResume;
    window.openPlanSettings = openPlanSettings;
    window.closePlanSettings = closePlanSettings;
    window.planSettingPick = planSettingPick;
    window.savePlanSettings = savePlanSettings;
    window.openRotateSheet = openRotateSheet;
    window.closeRotateSheet = closeRotateSheet;
    window.rotatePick = rotatePick;
    window.rotateBack = rotateBack;
    window.rotateApply = rotateApply;
    window.rotateAlternate = rotateAlternate;
    window.planApplySwaps = planApplySwaps;
    window.planUndoRoll = planUndoRoll;
    window.saveSessionToMyWorkouts = saveSessionToMyWorkouts;
    // TP-6 j — a coach / Sunday-roll write landed while the Plan page is up.
    window.addEventListener('bigsurf:data-changed', (e) => {
        const section = document.getElementById('block-section');
        if (e.detail?.what === 'plan' && section && !section.classList.contains('hidden')) renderBlockPage();
    });
}
