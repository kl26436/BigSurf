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
import { escapeHtml, escapeAttr, showNotification } from './ui-helpers.js';
import { navigateTo } from './navigation.js';
import { debugLog } from '../utils/config.js';
import { buildBlockSession } from '../features/block-view.js';
import { buildPlanTimeline } from '../features/plan-timeline.js';
import { rollUndoable } from '../features/plan-roller.js';
import { weekOverrideOf } from '../features/session-intent.js';
import { openSheet, closeSheet } from './sheet.js';
import { confirmSheet, promptSheet } from './confirm-sheet.js';
import { cloneForMyWorkouts } from '../features/plan-sessions.js';

let _tl = null;    // the timeline on screen
let _ctx = null;   // the data it was built from

export function openBlockPage() {
    navigateTo('plan');
}

const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function plates(unit) {
    return unit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs;
}

async function loadContext() {
    const [{ loadPlan, loadPrograms }, { loadGoalData, loadGoals, loadEvents }] = await Promise.all([
        import('../features/plan.js'), import('../features/goals.js'),
    ]);
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
    } catch (e) {
        console.error('❌ Plan page failed:', e);
        container.innerHTML = `${headerHTML('Your plan', '')}<div class="d-content"><div class="empty-state">
            <div class="empty-state-title">Couldn't load your plan</div>
            <div class="empty-state-description">Check your connection and try again.</div>
        </div></div>`;
    }
}

function headerHTML(title, subtitle) {
    return `
        <div class="page-header page-header--detail">
            <button class="page-header__back" onclick="navigateBack()" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info">
                <div>
                    <div class="d-title">${escapeHtml(title)}</div>
                    ${subtitle ? `<div class="d-subtitle">${escapeHtml(subtitle)}</div>` : ''}
                </div>
            </div>
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
                <button class="btn btn-primary" onclick="startProgramChat()">Plan it with the coach</button>
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
                <div class="plan-notice__text">When these weeks end, the next ones roll on their own: same sessions, with a lighter week in place. You can undo a roll until you log a workout in it.</div>
                <div class="plan-notice__actions"><button class="btn btn-primary btn-sm" onclick="planEnable()">Turn it on</button></div>
            </div>`;
    }
    if (!ctx.plan) {
        return `
            <div class="hero-card plan-notice">
                <div class="plan-notice__text">These weeks are a projection from your week plan. Plan them with the coach and they fill in with targets.</div>
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
    if (active?.createdVia === 'auto-roll') {
        const lighter = tl.weeks.find(w => w.programId === active.id && w.kind === 'lighter');
        const undoable = rollUndoable(active, ctx.workouts);
        const pending = (active.pendingRotations || []).flatMap(r => r.swaps.map(s => ({ ...s, workout: r.name })));
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
    return '';
}

function rationaleHTML(r) {
    if (!r?.block) return '';
    const list = (items, render) => `<ul class="block-rationale__list">${items.map(render).join('')}</ul>`;
    return `
        <div class="block-rationale">
            <div class="block-rationale__line">${escapeHtml(r.block)}</div>
            ${r.fixed?.length ? `<details class="block-rationale__more"><summary>What stays the same and why (${r.fixed.length})</summary>
                ${list(r.fixed, x => `<li><b>${escapeHtml(x.name)}</b>${x.why ? ` — ${escapeHtml(x.why)}` : ''}</li>`)}</details>` : ''}
            ${r.changed?.length ? `<details class="block-rationale__more"><summary>What's new and why (${r.changed.length})</summary>
                ${list(r.changed, x => `<li>${x.from ? `${escapeHtml(x.from)} → ` : ''}<b>${escapeHtml(x.to)}</b>${x.why ? ` — ${escapeHtml(x.why)}` : ''}</li>`)}</details>` : ''}
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
    const policy = ctx.plan?.rotationPolicy === 'auto' ? 'auto' : 'ask';
    return `
        ${headerHTML(h.name, sub)}
        <div class="d-content block-page">
            <div class="hero-card block-hero">
                ${meta.length ? `<div class="block-hero__meta">${meta.map(escapeHtml).join(' · ')}</div>` : ''}
                ${tl.goalsStrip.length ? `<div class="plan-goals">${tl.goalsStrip.map(g => `<button class="chip chip--sm" onclick="openGoalsPage()">${escapeHtml(g.name)}${g.statusLabel ? ` <span class="goal-pill ${PILL[g.status] || ''}">${escapeHtml(g.statusLabel)}</span>` : ''}</button>`).join('')}</div>` : ''}
            </div>
            ${noticeHTML(tl, ctx)}
            ${rationaleHTML(tl.activeProgram?.rationale)}
            <div class="block-actions">
                <button class="chip chip--sm" onclick="blockAdjustWeek()"><i class="fas fa-feather"></i> Make this week lighter</button>
                <button class="chip chip--sm" onclick="blockSwapAccessory()"><i class="fas fa-arrow-right-arrow-left"></i> Rotate an exercise</button>
                <button class="chip chip--sm" onclick="blockDiscuss()"><i class="fas fa-robot"></i> Change my plan</button>
                <button class="chip chip--sm" onclick="openGoalsPage()"><i class="fas fa-bullseye"></i> Goals</button>
                <button class="chip chip--sm" onclick="openWeekPlanSheet()"><i class="fas fa-calendar-week"></i> Week plan</button>
            </div>
            ${ctx.plan ? `
            <div class="plan-policy">
                <div class="field-label">Between waves, accessory swaps</div>
                <div class="segmented">
                    <button class="${policy === 'ask' ? 'active' : ''}" onclick="planSetRotationPolicy('ask', this)">Ask me</button>
                    <button class="${policy === 'auto' ? 'active' : ''}" onclick="planSetRotationPolicy('auto', this)">Do it</button>
                </div>
            </div>` : ''}
            ${past.length ? `<details class="plan-past"><summary>Earlier weeks (${past.length})</summary>${past.map(x => weekHTML(x.w, x.i)).join('')}</details>` : ''}
            ${rest.map(x => weekHTML(x.w, x.i)).join('')}
        </div>`;
}

const STATUS_ICON = {
    done: 'fa-check', missed: 'fa-times', today: 'fa-play', upcoming: 'fa-circle', projected: 'fa-circle',
};

function primaryLine(cell, unit) {
    const p = cell.primary;
    if (cell.status === 'projected') return '';
    if (!p) return '';
    const fmt = (x) => (x ? `${x.weight}${x.reps ? `×${x.reps}` : ''}` : '—');
    if (cell.status === 'done' && p.logged) {
        const mark = p.result === 'hit' ? ' ✓' : p.result === 'below' ? ' ↓' : '';
        return `${p.name} ${fmt(p.logged)} ${unit}${p.target ? ` · target ${fmt(p.target)}` : ''}${mark}`;
    }
    return p.target ? `${p.name} · target ${fmt(p.target)} ${unit}` : `${p.name} · no history yet`;
}

function weekHTML(w, idx) {
    const unit = _ctx?.unit || 'lbs';
    const meta = [w.projected ? 'projected' : w.levers, `${fmtDate(w.weekStart)}–${fmtDate(w.weekEnd)}`].filter(Boolean).join(' · ');
    const state = w.state === 'current' ? ' block-week--current' : w.state === 'past' ? ' block-week--past' : w.projected ? ' plan-week--projected' : '';
    return `
        <section class="block-week${state}" aria-label="${escapeAttr(`${w.label}, week of ${fmtDate(w.weekStart)}`)}">
            <div class="dash-section-head">
                <h3>${escapeHtml(w.label)}${w.state === 'current' ? ' <span class="block-week__now">This week</span>' : ''}</h3>
                <span class="dash-section-head__meta">${escapeHtml(meta)}</span>
            </div>
            ${w.markers.length ? `<div class="plan-markers">${w.markers.map(m => `<span class="chip chip--sm"><i class="fas ${m.type === 'event' ? 'fa-calendar-day' : 'fa-bullseye'}" aria-hidden="true"></i> ${escapeHtml(m.label)}</span>`).join('')}</div>` : ''}
            ${w.override ? `<div class="block-week__override"><i class="fas fa-feather"></i> ${escapeHtml(w.override.label)}${w.override.levers ? ` · ${escapeHtml(w.override.levers)}` : ''}${w.override.reason ? ` — ${escapeHtml(w.override.reason)}` : ''}</div>` : ''}
            <div class="block-week__cells">
                ${w.days.map((c, i) => `
                    <div class="row-card block-cell block-cell--${c.status}" role="button" tabindex="0"
                         onclick="openBlockSession(${idx}, ${i})" aria-label="${escapeAttr(`${c.dayLabel} ${c.name}, ${c.status}`)}">
                        <div class="row-card__icon block-cell__icon"><i class="fas ${STATUS_ICON[c.status] || 'fa-circle'}" aria-hidden="true"></i></div>
                        <div class="row-card__content">
                            <div class="row-card__title">${escapeHtml(c.dayLabel)} · ${escapeHtml(c.name)}</div>
                            ${primaryLine(c, unit) ? `<div class="row-card__detail">${escapeHtml(primaryLine(c, unit))}</div>` : ''}
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
        : buildBlockSession({ cell, template, workouts: _ctx.workouts, program, override: _ctx.override, unit: _ctx.unit, plates: plates(_ctx.unit) });
    const fmt = (x) => (x ? `${x.weight}${x.reps ? ` × ${x.reps}` : ''}` : '—');
    const status = { done: `Done ${cell.doneOn ? fmtDate(cell.doneOn) : ''}`, missed: 'Missed', today: 'Today', upcoming: fmtDate(cell.date), projected: `${fmtDate(cell.date)} · projected` }[cell.status];
    const startable = ['today', 'upcoming', 'missed', 'projected'].includes(cell.status);
    const primaryAction = startable
        ? { label: `Start ${escapeHtml(cell.name)}`, onClick: `blockStartSession('${escapeAttr(cell.name)}')`, primary: true }
        : (cell.workoutId ? { label: 'Open workout', onClick: `closeBlockSession(); viewWorkout('${escapeAttr(cell.workoutId)}')`, primary: true } : null);

    openSheet({
        id: BLOCK_SESSION_SHEET_ID,
        title: cell.name,
        subtitle: `${w.label} · ${status}`,
        bodyHTML: rows.length ? rows.map(r => `
                <div class="js-row">
                    <div class="js-row__info">
                        <div class="js-row__name">${escapeHtml(r.name)}${r.primary ? ' <span class="block-session__main">Main lift</span>' : ''}</div>
                        <div class="js-row__meta">${r.sets} sets${w.projected ? ' · targets fill in when these weeks are set' : ` · target ${escapeHtml(fmt(r.target))} ${escapeHtml(_ctx.unit)}`}${r.logged ? ` · logged ${escapeHtml(fmt(r.logged))}` : ''}</div>
                    </div>
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

export function blockSwapAccessory() {
    askCoachSeeded('Rotate an accessory in my plan — show me the best candidates for something I\'ve been doing too long, and keep my main lifts.');
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

export async function planEnable() {
    const { enablePlanFromProgram } = await import('../features/plan.js');
    if (await enablePlanFromProgram(_tl?.activeProgram || {})) {
        showNotification('Plan on — it keeps going on its own', 'success', 2000);
        await renderBlockPage();
    } else showNotification("Couldn't turn the plan on — try again", 'error');
}

export async function planResume() {
    const { savePlan } = await import('../features/plan.js');
    if (await savePlan({ paused: false })) {
        showNotification('Plan resumed', 'success', 1500);
        await renderBlockPage();
    } else showNotification("Couldn't resume the plan — try again", 'error');
}

export async function planSetRotationPolicy(policy, btn) {
    const { savePlan } = await import('../features/plan.js');
    if (await savePlan({ rotationPolicy: policy === 'auto' ? 'auto' : 'ask' })) {
        btn?.parentElement?.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn?.classList.add('active');
        if (_ctx?.plan) _ctx.plan.rotationPolicy = policy;
    } else showNotification("Couldn't save that — try again", 'error');
}

export async function planApplySwaps() {
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

export async function planUndoRoll() {
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
export async function saveSessionToMyWorkouts(templateId) {
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
    window.planSetRotationPolicy = planSetRotationPolicy;
    window.planApplySwaps = planApplySwaps;
    window.planUndoRoll = planUndoRoll;
    window.saveSessionToMyWorkouts = saveSessionToMyWorkouts;
}
