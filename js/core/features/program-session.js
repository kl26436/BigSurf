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
 * Start today's workout WITH the program adjustments applied to the session
 * copy (start tap = the confirmation). Mirrors applySessionAdjustments'
 * weight handling: plate-rounded, template untouched, history honest.
 */
export async function startProgramSession(templateName) {
    const program = AppState._activeProgram;
    const session = program ? programSessionForToday(program, AppState.getTodayDateString()) : null;
    try {
        await window.startWorkout(templateName);
        if (!session) return; // plain start — program had nothing for today

        const unit = AppState.globalUnit || 'lbs';
        const step = unit === 'kg' ? 2.5 : 5;
        const f = 1 + session.weightPct / 100;
        for (const ex of (AppState.currentWorkout?.exercises || [])) {
            if (typeof ex.weight === 'number' && ex.weight > 0) {
                ex.weight = Math.max(step, Math.round((ex.weight * f) / step) * step);
            }
        }
        if (AppState.savedData) {
            AppState.savedData.basedOn = program.id;
            AppState.savedData.sessionLabel = session.label;
        }
        const { renderActiveWorkout } = await import('../workout/workout-core.js');
        renderActiveWorkout();
        debouncedSaveWorkoutData(AppState);
        showNotification(`${session.label} week — weights adjusted ${session.weightPct > 0 ? '+' : ''}${session.weightPct}%`, 'success');
    } catch (e) {
        debugLog('program session start failed (plain start already ran):', e);
    }
}

// Self-wire — the dashboard hero renders this handler.
if (typeof window !== 'undefined') {
    window.startProgramSession = startProgramSession;
}
