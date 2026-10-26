// Sunday report card page (TP-2) — route 'reportcard', #reportcard-section.
//
// The card is computed in code (features/report-card.js) by the Sunday job
// and saved to users/{uid}/reportCards/{weekKey}; the model's share is two
// sentences and one pick from the card's own options. Opening the page
// recomputes the code part when a workout landed after the card was built
// (cheap, no model call) and keeps the narrative unless the chosen option
// stopped being valid — then it falls back to "Keep going as planned" and
// says why. One tap applies the option through the same writes the coach's
// cards use (settings.weekOverride, the workout's exercise list).

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification } from './ui-helpers.js';
import { navigateTo } from './navigation.js';
import { debugLog } from '../utils/config.js';
import {
    buildReportCard, reportWeek, optionStillValid, dayIndex, GRADE_LABELS, DEFAULT_TIME_ZONE,
} from '../features/report-card.js';
import { shortDate } from '../features/goal-progress.js';
import { makeSessionCache } from '../data/session-cache.js';
import { once } from './busy.js';

let _doc = null;      // the reportCards doc on screen (card possibly recomputed)
let _weekKey = null;  // which week to open (null = latest)
// PF-2 — the dashboard's report-card row, once per 5 minutes; cleared when a card is built or applied.
const _entryCache = makeSessionCache();

export function openReportCard(weekKey = null) {
    _weekKey = typeof weekKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekKey) ? weekKey : null;
    navigateTo('reportcard');
}

const tz = () => AppState.settings?.timeZone || DEFAULT_TIME_ZONE;

async function fs() {
    return import('../data/firebase-config.js');
}

async function loadDoc(weekKey) {
    const { db, doc, getDoc, collection, query, orderBy, limit, getDocs } = await fs();
    const uid = AppState.currentUser?.uid;
    if (!uid) return null;
    if (weekKey) {
        const snap = await getDoc(doc(db, 'users', uid, 'reportCards', weekKey));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }
    const q = await getDocs(query(collection(db, 'users', uid, 'reportCards'), orderBy('weekKey', 'desc'), limit(1)));
    return q.empty ? null : { id: q.docs[0].id, ...q.docs[0].data() };
}

async function loadPast() {
    const { db, collection, query, orderBy, limit, getDocs } = await fs();
    const uid = AppState.currentUser?.uid;
    if (!uid) return [];
    const q = await getDocs(query(collection(db, 'users', uid, 'reportCards'), orderBy('weekKey', 'desc'), limit(9)));
    return q.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Recompute the code part of the card when a workout in the week was logged
 * after the card was built. The narrative stays; an option that no longer
 * exists falls back to "stay".
 */
async function freshen(docData) {
    const card = docData.card;
    if (!card?.from) return docData;
    const { loadGoalData, loadGoals, loadEvents } = await import('../features/goals.js');
    const data = await loadGoalData();
    const builtAt = docData.builtAt || card.builtAt || '';
    const newer = data.workouts.some(w => w.date >= card.from && w.date <= card.to && String(w.completedAt || '') > builtAt);
    if (!newer) return docData;
    try {
        if (AppState._weekPlan === undefined) {
            const { loadWeekPlan } = await import('../features/week-plan.js');
            await loadWeekPlan();
        }
        if (AppState._activeProgram === undefined) {
            const { loadActiveProgram } = await import('../features/program-session.js');
            await loadActiveProgram();
        }
    } catch (e) { debugLog('report card: plan/program load failed', e); }
    const [goals, events] = await Promise.all([loadGoals(), loadEvents()]);
    const byName = new Map((AppState.exerciseDatabase || []).filter(e => e?.name).map(e => [e.name.toLowerCase(), e]));
    const fresh = buildReportCard({
        workouts: data.workouts, templates: data.templates, weekPlan: AppState._weekPlan || null,
        program: AppState._activeProgram || null, measurements: data.measurements, dexa: data.dexa,
        goals, events, settings: AppState.settings || {}, unit: data.unit,
        week: { weekKey: card.weekKey, from: card.from, to: card.to }, today: data.today,
        rotation: { equipment: AppState._cachedEquipment || [], location: null, lookup: (n) => byName.get(String(n || '').toLowerCase()) },
        builtAt: new Date().toISOString(),
    });
    const keep = optionStillValid(docData.chosenOption, fresh);
    return {
        ...docData,
        card: fresh,
        chosenOption: keep ? docData.chosenOption : { ...fresh.options[0], why: '' },
        recomputed: true,
        fallbackNote: keep ? null : 'Your latest session changed the picture — keeping next week as planned.',
    };
}

function headerHTML(sub = '') {
    return `
        <div class="page-header page-header--detail">
            <button class="page-header__back" onclick="navigateBack()" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
            <div class="d-header-info"><div>
                <div class="d-title">Report card</div>
                ${sub ? `<div class="d-subtitle">${escapeHtml(sub)}</div>` : ''}
            </div></div>
        </div>`;
}

export async function renderReportCardPage() {
    const container = document.getElementById('reportcard-content');
    if (!container) return;
    container.innerHTML = `${headerHTML()}<div class="d-content"><div class="skeleton skeleton-card dash-skel--hero"></div></div>`;
    try {
        let docData = await loadDoc(_weekKey);
        const past = await loadPast();
        if (!docData) { container.innerHTML = emptyHTML(past); return; }
        docData = await freshen(docData);
        _doc = docData;
        container.innerHTML = pageHTML(docData, past);
    } catch (e) {
        console.error('❌ Report card failed:', e);
        container.innerHTML = `${headerHTML()}<div class="d-content"><div class="empty-state">
            <div class="empty-state-title">Couldn't load your report card</div>
            <div class="empty-state-description">Check your connection and try again.</div>
        </div></div>`;
    }
}

function enableRowHTML() {
    if (AppState.settings?.reportCard === true) return '';
    return `
        <div class="row-card row-card--static rc-enable">
            <div class="row-card__icon"><i class="fas fa-bell"></i></div>
            <div class="row-card__content">
                <div class="row-card__title">Every Sunday night</div>
                <div class="row-card__subtitle">Get this card at 7:30 pm Sunday instead of the Monday review</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="reportCardEnable(this)">Turn on</button>
        </div>`;
}

function emptyHTML(past) {
    return `
        ${headerHTML()}
        <div class="d-content rc-page">
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-clipboard-check"></i></div>
                <div class="empty-state-title">No report card yet</div>
                <div class="empty-state-description">Your week in one page — showed up, strength, body, goals, recovery — with one change for next week. Build this week's now, or get one every Sunday night.</div>
                <button class="btn btn-primary" onclick="reportCardBuildNow(this)">Build this week's card</button>
            </div>
            ${enableRowHTML()}
            ${pastHTML(past, null)}
        </div>`;
}

const section = (label, sentence, extra = '') => `
    <div class="rc-section">
        <div class="field-label">${escapeHtml(label)}</div>
        <div class="rc-section__text">${escapeHtml(sentence)}</div>
        ${extra}
    </div>`;

function pageHTML(d, past) {
    const c = d.card;
    const weekLabel = `Week of ${shortDate(c.from)} – ${shortDate(c.to)}`;
    const days = c.showedUp.days.length
        ? `<div class="rc-days">${c.showedUp.days.map(x => `<span class="chip chip--sm">${escapeHtml(`${x.day} ${x.name}`)} ✓</span>`).join('')}</div>` : '';
    const strengthRows = c.strength.length
        ? c.strength.map(r => `<div class="rc-line" onclick="openExerciseDetailFromReport('${escapeAttr(r.name)}')">${escapeHtml(r.sentence)}</div>`).join('')
        : '<div class="rc-line rc-line--muted">Pick your main lifts in Settings and their strength shows up here.</div>';
    const goalRows = c.goals.length
        ? c.goals.map(g => `<div class="rc-line">${escapeHtml(g.sentence)}</div>`).join('')
        : '<div class="rc-line rc-line--muted">No goals yet — set one and it gets graded here.</div>';
    return `
        ${headerHTML(weekLabel)}
        <div class="d-content rc-page">
            <div class="hero-card rc-hero">
                <div class="rc-hero__top"><span class="rc-grade rc-grade--${escapeAttr(c.grade)}">${escapeHtml(GRADE_LABELS[c.grade] || '')}</span></div>
                <div class="rc-hero__narrative">${escapeHtml(d.narrative || c.headline)}</div>
            </div>
            ${section('Showed up', c.showedUp.sentence, days)}
            <div class="rc-section"><div class="field-label">Strength</div>${strengthRows}</div>
            ${section('Body', c.body.sentence)}
            <div class="rc-section"><div class="field-label">Goals</div>${goalRows}<button class="chip chip--sm" onclick="openGoalsPage()"><i class="fas fa-bullseye"></i> Goals</button></div>
            ${section('Recovery', c.recovery.sentence)}
            ${section('Balance', c.balance.sentence)}
            ${section('Next week', c.upcoming.sentence)}
            ${c.rolled ? section('Your plan', c.rolled.sentence, '<button class="chip chip--sm" onclick="openBlockPage()"><i class="fas fa-calendar-week"></i> See the plan</button>') : ''}
            ${proposalHTML(d)}
            <div class="rc-links">
                <button class="chip chip--sm" onclick="reportCardDiscuss()"><i class="fas fa-robot"></i> Discuss this week</button>
            </div>
            ${enableRowHTML()}
            ${pastHTML(past, d.weekKey || c.weekKey)}
        </div>`;
}

const BUTTON = { stay: 'Keep going', 'lighter-week': 'Make next week lighter', swap: 'Rotate it', peak: 'Make it lighter', 'rotate-accessories': 'Rotate them' };

function proposalHTML(d) {
    const o = d.chosenOption || d.card.options[0];
    const applied = d.applied?.kind === o.kind;
    const why = d.fallbackNote || o.why || o.payload?.reason || '';
    const swapLine = o.kind === 'swap' && o.payload ? `${o.payload.from} → ${o.payload.to} (${o.payload.equipment})`
        : o.kind === 'rotate-accessories' && o.payload ? o.payload.swaps.map(x => `${x.from} → ${x.to}`).join(' · ') : '';
    return `
        <div class="hero-card rc-proposal" id="rc-proposal">
            <div class="rc-proposal__title">${escapeHtml(o.label)}</div>
            ${swapLine ? `<div class="rc-proposal__detail">${escapeHtml(swapLine)}</div>` : ''}
            ${why ? `<div class="rc-proposal__why">${escapeHtml(why)}</div>` : ''}
            <div class="rc-proposal__actions">
                ${applied
                    ? '<span class="coach-receipt-tag">Applied</span>'
                    : `<button class="btn btn-primary" onclick="reportCardApply()">${escapeHtml(BUTTON[o.kind] || 'Apply')}</button>`}
            </div>
        </div>`;
}

function pastHTML(past, currentKey) {
    const rows = (past || []).filter(p => p.weekKey !== currentKey);
    if (!rows.length) return '';
    return `
        <div class="sec-head"><h3>Past report cards</h3></div>
        ${rows.slice(0, 8).map(p => `
            <div class="row-card" onclick="openReportCard('${escapeAttr(p.weekKey)}')">
                <div class="row-card__content">
                    <div class="row-card__title">${escapeHtml(shortDate(p.weekKey))} · ${escapeHtml(GRADE_LABELS[p.card?.grade] || '')}</div>
                    <div class="row-card__detail">${escapeHtml(p.narrative || p.card?.headline || '')}</div>
                </div>
                <i class="fas fa-chevron-right row-card__action" aria-hidden="true"></i>
            </div>`).join('')}`;
}

// ── Actions ─────────────────────────────────────────────────────────

async function markApplied(kind) {
    const { db, doc, setDoc } = await fs();
    const uid = AppState.currentUser?.uid;
    const key = _doc?.weekKey || _doc?.card?.weekKey;
    if (!uid || !key) return;
    await setDoc(doc(db, 'users', uid, 'reportCards', key), { applied: { kind, at: new Date().toISOString() } }, { merge: true });
    _doc.applied = { kind };
    _entryCache.clear();
}

async function applySwap(p) {
    const templates = AppState.workoutPlans || AppState.templates || [];
    const t = templates.find(x => x.id === p.templateId);
    if (!t || !Array.isArray(t.exercises)) throw new Error('workout not found');
    const row = t.exercises[p.index];
    if (!row || (row.machine || row.name) !== p.from) throw new Error('the workout changed since the card was built');
    const { applyRotation } = await import('../features/exercise-rotation.js');
    const byName = new Map((AppState.exerciseDatabase || []).filter(e => e?.name).map(e => [e.name.toLowerCase(), e]));
    const exercises = applyRotation(t.exercises, [{ index: p.index, from: p.from, to: p.to, equipment: p.equipment }], {
        lookup: (n) => byName.get(String(n || '').toLowerCase()), today: AppState.getTodayDateString(),
    });
    const { db, doc, setDoc } = await fs();
    await setDoc(doc(db, 'users', AppState.currentUser.uid, 'workoutTemplates', t.id), { exercises, lastUpdated: new Date().toISOString() }, { merge: true });
    t.exercises = exercises;
}

/** Single-flight (busy.js): a second tap while this runs is ignored. */
export function reportCardApply() {
    return once('report-card-apply', () => reportCardApplyNow());
}

async function reportCardApplyNow() {
    const o = _doc?.chosenOption;
    if (!o || !AppState.currentUser) return;
    try {
        if (o.kind === 'lighter-week' || o.kind === 'peak') {
            const { updateSetting } = await import('./settings-ui.js');
            const p = o.payload || {};
            updateSetting('weekOverride', {
                from: p.from, weeks: p.weeks || 1, weightPct: p.weightPct ?? -10,
                label: p.label || 'Lighter week', ...(p.reason ? { reason: p.reason } : {}), setBy: 'report-card',
            });
            if (AppState.settings?.manualDeload) updateSetting('manualDeload', null);
        } else if (o.kind === 'swap') {
            await applySwap(o.payload);
        } else if (o.kind === 'rotate-accessories') {
            // TP-3 — the rolled wave's waiting swaps, the same write the Plan page makes.
            const { loadPrograms, applyPendingRotations } = await import('../features/plan.js');
            const program = (await loadPrograms()).find(p => p.id === o.payload?.programId);
            if (!program?.pendingRotations?.length) throw new Error('those swaps were already handled');
            await applyPendingRotations(program);
        }
        await markApplied(o.kind);
        showNotification(o.kind === 'stay' ? 'Next week stays as planned' : o.kind === 'swap' ? `${o.payload.to} is in` : o.kind === 'rotate-accessories' ? 'Swapped in for the next few weeks' : 'Next week is lighter', 'success', 2000);
        const el = document.getElementById('rc-proposal');
        if (el) el.outerHTML = proposalHTML(_doc);
    } catch (e) {
        console.error('❌ Report card apply failed:', e);
        showNotification(`Couldn't apply it — ${e.message || 'try again'}`, 'error');
    }
}

export async function reportCardBuildNow(btn) {
    const { isOnline } = await import('../data/offline.js');
    if (!isOnline()) { showNotification("You're offline — the report card needs a connection. Try again when you're back.", 'warning'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Building…'; }
    try {
        const { functions, httpsCallable } = await fs();
        const res = await httpsCallable(functions, 'requestReportCard')({});
        const status = res?.data?.status;
        if (status === 'ok') { _entryCache.clear(); _weekKey = res.data.weekKey; await renderReportCardPage(); return; }
        showNotification(status === 'rate_limited' ? 'One report card a day — check back tomorrow' : "Couldn't build the card — try again", 'warning');
    } catch (e) {
        console.error('❌ requestReportCard failed:', e);
        showNotification("Couldn't build the card — try again", 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = "Build this week's card"; }
}

export async function reportCardEnable(btn) {
    const { updateSetting } = await import('./settings-ui.js');
    updateSetting('reportCard', true);
    if (!AppState.settings?.timeZone) {
        try { updateSetting('timeZone', Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE); } catch { /* default zone */ }
    }
    showNotification('Report card on — every Sunday at 7:30 pm', 'success', 2000);
    btn?.closest('.rc-enable')?.remove();
}

export function reportCardDiscuss() {
    const c = _doc?.card;
    const prefill = c
        ? `Let's talk about my week (${shortDate(c.from)} – ${shortDate(c.to)}): ${_doc.narrative || c.headline}`
        : "Let's talk about my week.";
    // AU-14: prefill, never send.
    import('../features/ai-coach-ui.js').then(m => m.showAICoach({ prefill })).catch(() => {});
}

export function openExerciseDetailFromReport(name) {
    if (typeof window.showExerciseDetail === 'function') window.showExerciseDetail(name);
}

/** Dashboard entry, Sunday and Monday only, when this week's card exists. */
export async function reportCardEntryHTML() {
    try {
        const week = reportWeek(new Date(), tz());
        const dow = dayIndex(week.today);
        if (dow !== 6 && dow !== 0) return '';
        // PF-2 — session-cached: the dashboard asks on every visit Sun/Mon.
        const d = await _entryCache.get(week.weekKey, AppState.currentUser?.uid || '', () => loadDoc(week.weekKey));
        if (!d) return '';
        return `
            <div class="row-card rc-entry" onclick="openReportCard('${escapeAttr(week.weekKey)}')">
                <div class="row-card__icon"><i class="fas fa-clipboard-check"></i></div>
                <div class="row-card__content">
                    <div class="row-card__title">Report card · ${escapeHtml(GRADE_LABELS[d.card?.grade] || '')}</div>
                    <div class="row-card__detail">${escapeHtml(d.narrative || d.card?.headline || '')}</div>
                </div>
                <i class="fas fa-chevron-right row-card__action" aria-hidden="true"></i>
            </div>`;
    } catch (e) {
        debugLog('report card entry skipped', e);
        return '';
    }
}

// Self-wire handlers rendered from this module's own templates.
if (typeof window !== 'undefined') {
    window.openReportCard = openReportCard;
    window.reportCardApply = reportCardApply;
    window.reportCardBuildNow = reportCardBuildNow;
    window.reportCardEnable = reportCardEnable;
    window.reportCardDiscuss = reportCardDiscuss;
    window.openExerciseDetailFromReport = openExerciseDetailFromReport;
}
