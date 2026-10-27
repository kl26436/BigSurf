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
import { debouncedSaveWorkoutData, loadAllWorkouts } from '../data/data-manager.js';
import { weightIncrement, scaleLoadableWeight } from './progression.js';
import { weekTargetEffects, describeWeekTarget } from './week-targets.js';
import { weekKindLabel } from './plain-language.js';
import { governSetDelta } from './volume-governor.js';
import { analyzeWeeklyVolume, getISOWeekKey } from './training-insights.js';

/** Smallest real jump for a unit, from the user's plate-calculator inventory. */
function stepFor(unit) {
    return weightIncrement(unit,
        unit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs);
}

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
    if (!Number.isFinite(week) || finished || !target) return null;
    // Only surface weeks that actually CHANGE the session — a baseline week
    // starts like any normal day, no special chrome. CP-3: any lever counts
    // (sets, reps, RPE), not just weightPct — a volume-only week used to be
    // invisible here (Bug 8).
    const fx = weekTargetEffects(target);
    if (!fx.changesSession) return null;
    return {
        label: weekKindLabel(target), // TP-0: the week's kind, not the model's label
        weightPct: fx.weightPct,
        setDelta: fx.setDelta,
        repRange: fx.repRange,
        rpeTarget: fx.rpeTarget,
        week,
        note: target.note || null,
    };
}

/** "Heavy · +5% weight · +1 set · from your program" hero meta line. */
export function programSessionMeta(session) {
    if (!session) return '';
    return `${session.label} · ${describeWeekTarget(session)} · week ${session.week} of your plan`;
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
    if (!Number.isFinite(week) || finished || !target) return null;
    const fx = weekTargetEffects(target);
    if (!fx.changesSession) return null;
    return {
        label: weekKindLabel(target), // TP-0: the week's kind, not the model's label
        weightPct: fx.weightPct, setDelta: fx.setDelta, repRange: fx.repRange, rpeTarget: fx.rpeTarget,
        week, weeks: program.weeks || 1,
    };
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
    if (!Number.isFinite(week) || !finished || week < 1) return null;
    return { id: program.id, name: program.name || 'Your plan', weeks: program.weeks || 1 };
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
    if (!Number.isFinite(week) || finished || week < 1) return null;
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
 * Scale the SESSION's per-set targets, not just the template default weight.
 * startWorkout AWAITS autofill, so by the time an adjustment applies, the set
 * rows already carry last-session numbers in savedData — scaling only
 * ex.weight never reaches the targets the user actually sees. Plate-rounded
 * per each set's own unit; completed and user-edited sets are never touched.
 * Shared with the coach's session-adjustment apply (ai-coach-ui.js).
 */
export function scaleSessionSetTargets(factor) {
    for (const saved of Object.values(AppState.savedData?.exercises || {})) {
        for (const set of (saved?.sets || [])) {
            if (!set || set.completed || set._userEdited) continue;
            if (typeof set.weight !== 'number' || set.weight <= 0) continue;
            // Snap the CHANGE to whole plate-jumps from the last real weight —
            // keeps the result loadable at the user's gym (see progression.js).
            set.weight = scaleLoadableWeight(set.weight, factor,
                stepFor(set.originalUnit || AppState.globalUnit || 'lbs'));
            // A scaled target is the adjustment now, not the earned-bump hint.
            delete set._suggested;
        }
    }
}

/**
 * Add or trim sets on one session exercise (CP-3 setDelta). The template
 * count moves so the set grid renders the new number; the autofilled rows
 * follow — added sets copy the last row's targets, trimmed sets come off the
 * end and never touch a completed or user-edited row. Floors at one set.
 * Pure over its two arguments — exported for tests.
 */
export function applySetDeltaToExercise(ex, saved, delta) {
    if (!ex || !delta) return;
    ex.sets = Math.max(1, (Number(ex.sets) || 3) + delta);
    const rows = saved?.sets;
    if (!Array.isArray(rows)) return;
    if (delta > 0) {
        const last = rows[rows.length - 1];
        for (let k = 0; k < delta; k++) {
            rows.push(last
                ? { weight: last.weight ?? null, reps: last.reps ?? null, completed: false, originalUnit: last.originalUnit, ...(last.type && last.type !== 'warmup' ? { type: last.type } : {}) }
                : { weight: null, reps: null, completed: false });
        }
        return;
    }
    let n = -delta;
    for (let i = rows.length - 1; i >= 0 && n > 0 && rows.length > 1; i--) {
        if (rows[i]?.completed || rows[i]?._userEdited) continue;
        rows.splice(i, 1);
        n--;
    }
}

/**
 * Clamp an exercise's rep targets into the week's band (CP-3 repRange):
 * template default and every uncompleted, un-edited autofilled row.
 * Exported for tests.
 */
export function clampRepsToRange(ex, saved, repRange) {
    if (!ex || !Array.isArray(repRange) || repRange.length !== 2) return;
    const [lo, hi] = repRange;
    const clamp = (r) => Math.min(hi, Math.max(lo, r));
    if (typeof ex.defaultReps === 'number' && ex.defaultReps > 0) ex.defaultReps = clamp(ex.defaultReps);
    if (typeof ex.reps === 'number' && ex.reps > 0) ex.reps = clamp(ex.reps);
    for (const set of (saved?.sets || [])) {
        if (!set || set.completed || set._userEdited) continue;
        if (typeof set.reps === 'number' && set.reps > 0) set.reps = clamp(set.reps);
    }
}

/**
 * Apply an adjustment {label, weightPct, setDelta, repRange, rpeTarget} to
 * the in-flight session copy: plate-rounded weight scale on weighted moves
 * only, MRV-governed set deltas, rep clamping, RPE target on the exercise;
 * template untouched, history honest (basedOn + sessionLabel). Returns the
 * bodyweight-skip count and the muscles the governor clamped so callers can
 * footnote both. Assumes startWorkout ran.
 */
function applyAdjustmentToCurrentSession(program, adj, { weeklyVolume = [] } = {}) {
    const unit = AppState.globalUnit || 'lbs';
    const step = stepFor(unit);
    const exercises = AppState.currentWorkout?.exercises || [];
    const savedFor = (i) => AppState.savedData?.exercises?.[`exercise_${i}`];
    let skippedBw = 0;
    if (adj.weightPct) {
        const f = 1 + adj.weightPct / 100;
        // Autofill already seeded this deload (AP-7: the session intent
        // carries the week's percentage into every entry path, and the
        // no-history seeder scales the template weight too, §3.4). Scaling
        // again here would apply −35% twice — to the rows now, and to the
        // template weight a later reseed (equipment change) starts from.
        const seededByIntent = AppState.savedData?.sessionIntent?.mode === 'deload'
            && typeof AppState.savedData.sessionIntent.weightPct === 'number';
        for (const ex of exercises) {
            if (typeof ex.weight === 'number' && ex.weight > 0) {
                if (!seededByIntent) ex.weight = scaleLoadableWeight(ex.weight, f, step);
            } else {
                skippedBw++;
            }
        }
        // The visible set targets (autofilled from last session) scale too —
        // without this the "-40%" toast shows but the rows still say last week.
        if (!seededByIntent) scaleSessionSetTargets(f);
    }
    let clamped = [];
    if (adj.setDelta) {
        const gov = governSetDelta({
            setDelta: adj.setDelta, exercises, weeklyVolume,
            exerciseDatabase: AppState.exerciseDatabase || [],
        });
        exercises.forEach((ex, i) => applySetDeltaToExercise(ex, savedFor(i), gov.deltas[i]));
        clamped = gov.clamped;
    }
    if (adj.repRange) {
        exercises.forEach((ex, i) => clampRepsToRange(ex, savedFor(i), adj.repRange));
    }
    if (adj.rpeTarget) {
        for (const ex of exercises) ex._rpeTarget = adj.rpeTarget;
    }
    if (AppState.savedData) {
        AppState.savedData.basedOn = program.id;
        AppState.savedData.sessionLabel = adj.label;
    }
    return { skippedBw, clamped };
}

/**
 * This ISO week's completed workouts, aggregated to sets per muscle — the
 * governor's view of what has already been trained. Non-fatal: an empty
 * list just means "no landmark to clamp against".
 */
async function weeklyVolumeSoFar(today) {
    try {
        const all = await loadAllWorkouts(AppState);
        const wk = getISOWeekKey(today);
        const thisWeek = (all || []).filter(w => w?.date && w.completedAt && !w.cancelledAt && getISOWeekKey(w.date) === wk);
        return analyzeWeeklyVolume(thisWeek, AppState.exerciseDatabase || []);
    } catch (e) {
        debugLog('weekly volume for governor failed (ungoverned):', e);
        return [];
    }
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
    const weeklyVolume = adj.setDelta > 0 ? await weeklyVolumeSoFar(AppState.getTodayDateString()) : [];
    const { skippedBw, clamped } = applyAdjustmentToCurrentSession(program, adj, { weeklyVolume });
    const { renderActiveWorkout } = await import('../workout/workout-core.js');
    renderActiveWorkout();
    debouncedSaveWorkoutData(AppState);
    // Unchanged dips on a "+5%" week read as a bug — say the skip out loud;
    // same for a muscle the governor held at MRV.
    const parts = [describeWeekTarget(adj)];
    if (skippedBw && adj.weightPct) parts.push('bodyweight moves unchanged');
    const held = [...new Set(clamped.map(c => c.bodyPart.toLowerCase()))];
    if (held.length) parts.push(`${held.join(', ')} at the most sets a muscle can recover from — no extra set`);
    showNotification(`${adj.label} week — ${parts.join(' · ')}`, 'success');
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
 * prefilled (AU-14 — the user sends it), for discussing rather than applying.
 */
export function askCoachAboutProgramWeek() {
    import('./ai-coach-ui.js').then(m => {
        m.showAICoach({ prefill: "What's today's session on my plan? Propose the adjustments." }); // AU-14: prefill, never send
    }).catch(e => debugLog('program week ask failed:', e));
}

/**
 * From the pre-Start light-week caution: hand off to the coach to reflow the
 * program against what actually got trained.
 */
export function askCoachToReflow() {
    import('./ai-coach-ui.js').then(m => {
        m.showAICoach({ prefill: 'I trained fewer days than planned recently — can you reflow my plan so this week still makes sense?' }); // AU-14: prefill, never send
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
 * "Plan the next block" — hand off to the coach with the ask prefilled. The
 * finished program stays active until the coach supersedes it (create_program
 * deactivates it) so its context is still visible while planning.
 */
export function planNextBlock() {
    import('./ai-coach-ui.js').then(m => {
        m.showAICoach({ prefill: 'My plan\'s weeks just wrapped up — how did they go, and what should the next few weeks be? Propose it.' }); // AU-14: prefill, never send
    }).catch(e => debugLog('plan next block failed:', e));
}

// ── Program home → the Block page (AP-24) ──────────────────────────
// The bottom sheet that used to live here showed weeks and the split only —
// no exercises, targets or results. The Block page (ui/block-ui.js) replaced
// it; the old entry points (dashboard heartbeat, Settings program row) keep
// their names and land there.

export function closeProgramDetailSheet() {
    document.getElementById('program-detail-backdrop')?.remove();
    document.getElementById('program-detail-sheet')?.remove();
}

export function openProgramDetailSheet() {
    closeProgramDetailSheet();
    if (typeof window.openBlockPage === 'function') window.openBlockPage();
}

/** Edit the schedule that drives the program — routes to the week plan sheet. */
export function editProgramSchedule() {
    closeProgramDetailSheet();
    if (typeof window.openWeekPlanSheet === 'function') window.openWeekPlanSheet();
}

/** Bring the coach in to change or discuss the program, from the detail sheet. */
export function discussProgramWithCoach() {
    closeProgramDetailSheet();
    import('./ai-coach-ui.js').then(m => {
        m.showAICoach({ prefill: "Let's review my plan — walk me through the coming weeks, and what we could change." }); // AU-14: prefill, never send
    }).catch(e => debugLog('program discuss failed:', e));
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
    window.openProgramDetailSheet = openProgramDetailSheet;
    window.closeProgramDetailSheet = closeProgramDetailSheet;
    window.editProgramSchedule = editProgramSchedule;
    window.discussProgramWithCoach = discussProgramWithCoach;
}
