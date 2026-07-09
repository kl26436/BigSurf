// Program sessions (Phase 9, trust rung 2: auto-generate + confirm).
//
// When the active program's trust level is 'auto_confirm', the dashboard's
// Today hero pre-builds the program-adjusted session ("Push day — Heavy
// (+5%) · from your program") and START is the confirmation — one tap accepts
// and applies the week's adjustments to the session copy. The template is
// never modified; the workout doc records basedOn + sessionLabel exactly like
// a coach-proposed session adjustment (5.6.1).
//
// Trust stays opt-in and reversible: programs are created at 'propose'; the
// user upgrades through the coach ("switch my program to auto") via
// adjust_program, which the consent rule guards. Rung 3 (outcome-driven
// regeneration) remains gated — there's no outcome data to learn from until
// coachAdvice docs age past the Phase 7 scoring window.

import { AppState } from '../utils/app-state.js';
import { debugLog } from '../utils/config.js';
import { showNotification } from '../ui/ui-helpers.js';
import { deriveProgramWeek } from './coach-context.js';
import { debouncedSaveWorkoutData } from '../data/data-manager.js';

/**
 * Hydrate the active program once per session. null = fetched, none active.
 * Invalidated (set undefined) when a program_set action card lands.
 */
export async function loadActiveProgram() {
    if (!AppState.currentUser) return null;
    try {
        const { db, collection, query, where, limit, getDocs } = await import('../data/firebase-config.js');
        const snap = await getDocs(query(
            collection(db, 'users', AppState.currentUser.uid, 'programs'),
            where('active', '==', true), limit(1)
        ));
        const program = snap.empty ? null : snap.docs[0].data();
        AppState._activeProgram = program;
        return program;
    } catch (e) {
        console.error('❌ Active program load failed:', e);
        AppState._activeProgram = null;
        return null;
    }
}

/**
 * The program-adjusted session for today's planned template, or null when
 * there's nothing to adjust (no program / propose-only trust / finished /
 * baseline week with no target). Pure — inputs injected for tests.
 *
 * @returns {{label:string, weightPct:number|null, week:number, note:string|null}|null}
 */
export function programSessionForToday(program, today) {
    if (!program?.startDate) return null;
    if ((program.trustLevel || 'propose') !== 'auto_confirm') return null;
    const { week, target, finished } = deriveProgramWeek(program, today);
    if (finished || !target) return null;
    // Only surface weeks that actually CHANGE the session — a baseline week
    // starts like any normal day, no special chrome.
    if (target.weightPct == null || target.weightPct === 0) return null;
    return {
        label: target.label,
        weightPct: target.weightPct,
        week,
        note: target.note || null,
    };
}

/** "Heavy · +5% · from your program" hero meta line. */
export function programSessionMeta(session) {
    if (!session) return '';
    const pct = `${session.weightPct > 0 ? '+' : ''}${session.weightPct}%`;
    return `${session.label} · ${pct} weight · week ${session.week} of your program`;
}

/**
 * Propose-only visibility: the current week's nonbaseline target for ANY
 * trust level, so the hero can show a quiet notice line even before auto
 * mode. Without this, the default Start habit blows straight past the one
 * week the program exists for (auto_confirm gets the full pre-built session
 * via programSessionForToday instead). Pure — inputs injected for tests.
 */
export function programNoticeForToday(program, today) {
    if (!program?.startDate) return null;
    const { week, target, finished } = deriveProgramWeek(program, today);
    if (finished || !target) return null;
    if (target.weightPct == null || target.weightPct === 0) return null;
    return { label: target.label, weightPct: target.weightPct, week, weeks: program.weeks || 1 };
}

/**
 * Program-end signal: an active program past its last week. The dashboard
 * closes the loop (celebrate + plan-next door) instead of letting the block
 * quietly expire as LLM-context-only text. Week < 1 = not started, not done.
 * Pure — inputs injected for tests.
 */
export function programCompletionForToday(program, today) {
    if (!program?.startDate || program.active === false) return null;
    const { week, finished } = deriveProgramWeek(program, today);
    if (!finished || week < 1) return null;
    return { id: program.id, name: program.name || 'Your program', weeks: program.weeks || 1 };
}

/**
 * Persistent heartbeat: a calm "you're mid-block" signal for the dashboard,
 * shown at EVERY week (baseline included) while a program is active and
 * ongoing — so a freshly-started program has proof of life on the screen the
 * user actually looks at, not only in Settings. Distinct from the loud
 * adjustment-week notice (which only fires on deload/heavy weeks). Null once
 * finished (the completion banner takes over) or before it starts.
 * Pure — inputs injected for tests.
 */
export function programHeartbeat(program, today) {
    if (!program?.startDate || program.active === false) return null;
    const { week, finished } = deriveProgramWeek(program, today);
    if (finished || week < 1) return null;
    return { name: program.name || 'Program', week, weeks: program.weeks || 1 };
}

function shiftDays(dateStr, days) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Block retrospective stats for the completion banner — real numbers, not a
 * hollow "the clock ran out" trophy. Counts unique training days and PRs
 * inside the block window [startDate, startDate + weeks·7); `planned` comes
 * from the split snapshot (per-week training days × weeks). Pure.
 *
 * @param {object} program  active/finished program doc
 * @param {Array} workouts  full history [{date, completedAt, cancelledAt}]
 * @param {Array} prs       PR list [{date}] (PRTracker.getRecentPRs)
 * @returns {{daysTrained:number, planned:number, prCount:number, weeks:number}|null}
 */
export function programBlockStats(program, workouts = [], prs = [], today) {
    if (!program?.startDate) return null;
    const start = program.startDate;
    const weeks = program.weeks || 1;
    const end = shiftDays(start, weeks * 7 - 1);
    const cap = today && today < end ? today : end; // don't count the future
    const dates = new Set();
    for (const w of (workouts || [])) {
        if (!w.date || !w.completedAt || w.cancelledAt) continue;
        if (w.date < start || w.date > cap) continue;
        dates.add(w.date);
    }
    const perWeek = Object.values(program.split || {}).filter(t => t && t !== 'rest').length;
    const prCount = (prs || []).filter(p => p.date && p.date >= start && p.date <= end).length;
    return { daysTrained: dates.size, planned: perWeek * weeks, prCount, weeks };
}

/**
 * Was the trailing 7 days light against the plan? Drives the pre-Start caution
 * before a program-adjusted HEAVY session — the "you just got back from a
 * trip, is a +5% day smart?" moment the weekly digest catches a week too late.
 * `planned` = per-week training days in the plan; light when 2+ were missed.
 * Pure — inputs injected for tests.
 *
 * @returns {{planned:number, trained:number, light:boolean}|null}
 */
export function trailingWeekLight(plan, workouts = [], today) {
    const perWeek = Object.values(plan?.days || {}).filter(t => t && t !== 'rest').length;
    if (!perWeek || !today) return null;
    const from = shiftDays(today, -6);
    const trained = new Set();
    for (const w of (workouts || [])) {
        if (!w.date || !w.completedAt || w.cancelledAt) continue;
        if (w.date < from || w.date > today) continue;
        trained.add(w.date);
    }
    return { planned: perWeek, trained: trained.size, light: (perWeek - trained.size) >= 2 };
}

/**
 * Apply an adjustment {label, weightPct} to the in-flight session copy:
 * plate-rounded weight scale on weighted moves only, template untouched,
 * history honest (basedOn + sessionLabel). Returns the count of bodyweight
 * moves left unscaled so callers can footnote it. Assumes startWorkout ran.
 */
function applyAdjustmentToCurrentSession(program, adj) {
    const unit = AppState.globalUnit || 'lbs';
    const step = unit === 'kg' ? 2.5 : 5;
    const f = 1 + adj.weightPct / 100;
    let skippedBw = 0;
    for (const ex of (AppState.currentWorkout?.exercises || [])) {
        if (typeof ex.weight === 'number' && ex.weight > 0) {
            ex.weight = Math.max(step, Math.round((ex.weight * f) / step) * step);
        } else {
            skippedBw++;
        }
    }
    if (AppState.savedData) {
        AppState.savedData.basedOn = program.id;
        AppState.savedData.sessionLabel = adj.label;
    }
    return skippedBw;
}

/**
 * Shared start path: begin today's workout, then (if the program has an
 * adjustment for today) apply it to the session copy and confirm. Both the
 * auto-mode Start button and the propose-mode "Apply & start" route here —
 * the adjustment math is identical; only who initiated differs.
 */
async function startWithAdjustment(templateName, program, adj) {
    await window.startWorkout(templateName);
    if (!adj || !program) return; // plain start — program had nothing for today
    const skippedBw = applyAdjustmentToCurrentSession(program, adj);
    const { renderActiveWorkout } = await import('../workout/workout-core.js');
    renderActiveWorkout();
    debouncedSaveWorkoutData(AppState);
    // Unchanged dips on a "+5%" week read as a bug — say the skip out loud.
    showNotification(`${adj.label} week — weights adjusted ${adj.weightPct > 0 ? '+' : ''}${adj.weightPct}%${skippedBw ? ' · bodyweight moves unchanged' : ''}`, 'success');
}

/**
 * Auto-mode Start (trust rung 2): the tap on the dashboard hero IS the
 * confirmation; weights come pre-adjusted from programSessionForToday.
 */
export async function startProgramSession(templateName) {
    const program = AppState._activeProgram;
    const session = program ? programSessionForToday(program, AppState.getTodayDateString()) : null;
    try {
        await startWithAdjustment(templateName, program, session);
    } catch (e) {
        debugLog('program session start failed (plain start already ran):', e);
    }
}

/**
 * Propose-mode "Apply & start": the adjustment is fully deterministic
 * (weightPct · template · today are all known client-side), so applying it
 * shouldn't cost a chat round trip mid-workout. This is the one-tap path off
 * the hero notice; the coach detour stays available for actual questions.
 */
export async function applyProgramWeekAndStart(templateName) {
    const program = AppState._activeProgram;
    const adj = program ? programNoticeForToday(program, AppState.getTodayDateString()) : null;
    try {
        await startWithAdjustment(templateName, program, adj);
    } catch (e) {
        debugLog('program week apply failed (plain start already ran):', e);
    }
}

/**
 * Secondary path off the hero notice: open the coach with the session ask
 * pre-sent, for when the user wants to discuss rather than just apply.
 */
export function askCoachAboutProgramWeek() {
    import('./ai-coach-ui.js').then(m => {
        m.showAICoach();
        setTimeout(() => window.askCoach?.("What's today's session on my program? Propose the adjustments."), 350);
    }).catch(e => debugLog('program week ask failed:', e));
}

/**
 * From the pre-Start light-week caution: hand off to the coach to reflow the
 * program against what actually got trained.
 */
export function askCoachToReflow() {
    import('./ai-coach-ui.js').then(m => {
        m.showAICoach();
        setTimeout(() => window.askCoach?.('I trained fewer days than planned recently — can you reflow my program so this week still makes sense?'), 350);
    }).catch(e => debugLog('reflow ask failed:', e));
}

/** Finished-block banner dismissed — retire the program and re-render. */
export async function dismissProgramComplete(programId) {
    if (!AppState.currentUser || !programId) return;
    try {
        const { db, doc, setDoc } = await import('../data/firebase-config.js');
        await setDoc(doc(db, 'users', AppState.currentUser.uid, 'programs', programId),
            { active: false, state: 'completed', lastUpdated: new Date().toISOString() }, { merge: true });
        AppState._activeProgram = undefined;
        const { renderDashboard } = await import('../ui/dashboard-ui.js');
        renderDashboard();
    } catch (e) {
        console.error('❌ Program dismiss failed:', e);
    }
}

/**
 * "Plan the next block" — hand off to the coach with the ask pre-sent. The
 * finished program stays active until the coach supersedes it (create_program
 * deactivates it) so its context is still visible while planning.
 */
export function planNextBlock() {
    import('./ai-coach-ui.js').then(m => {
        m.showAICoach();
        setTimeout(() => window.askCoach?.('My program just wrapped up — how did it go, and what should the next block be? Propose it.'), 350);
    }).catch(e => debugLog('plan next block failed:', e));
}

// Self-wire — the dashboard renders these handlers (same-file assignment
// keeps template and handler in one cache unit; see CLAUDE.md).
if (typeof window !== 'undefined') {
    window.startProgramSession = startProgramSession;
    window.applyProgramWeekAndStart = applyProgramWeekAndStart;
    window.askCoachAboutProgramWeek = askCoachAboutProgramWeek;
    window.askCoachToReflow = askCoachToReflow;
    window.dismissProgramComplete = dismissProgramComplete;
    window.planNextBlock = planNextBlock;
}
