// Plan — Firestore data layer (TP-3).
//
// users/{uid}/plan/current holds only what has no other home: cadence,
// horizon, sessionMinutes, rotationPolicy, paused, name. The split stays in
// preferences/weekPlan. Waves are program docs; the Sunday job rolls the
// next one (functions/plan-roll.js). This file covers what the Plan page and
// the report card do on the device: turn the plan on from an existing
// program, change its policy, apply waiting accessory swaps, and undo a roll
// while nothing has been logged under it.

import { db, doc, getDoc, setDoc, deleteDoc, getDocs, collection } from '../data/firebase-config.js';
import { AppState } from '../utils/app-state.js';
import { cadenceFromProgram, rollUndoable } from './plan-roller.js';
import { applyRotation, resolveSwaps, waitingSwaps } from './exercise-rotation.js';

const uid = () => AppState.currentUser?.uid || null;
const planRef = () => doc(db, 'users', uid(), 'plan', 'current');

export async function loadPlan() {
    if (!uid()) return null;
    try {
        const snap = await getDoc(planRef());
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        console.error('❌ Failed to load plan:', e);
        return null;
    }
}

export async function savePlan(patch) {
    if (!uid()) return false;
    try {
        await setDoc(planRef(), { ...patch, lastUpdated: new Date().toISOString() }, { merge: true });
        return true;
    } catch (e) {
        console.error('❌ Failed to save plan:', e);
        return false;
    }
}

export async function loadPrograms() {
    if (!uid()) return [];
    try {
        const snap = await getDocs(collection(db, 'users', uid(), 'programs'));
        const out = [];
        snap.forEach(d => out.push({ id: d.id, ...d.data() }));
        return out;
    } catch (e) {
        console.error('❌ Failed to load programs:', e);
        return [];
    }
}

/** "Keep it going": the plan doc from the current program's shape. */
export async function enablePlanFromProgram(program) {
    return savePlan({
        name: 'My plan', cadence: cadenceFromProgram(program), horizonWeeks: 12, rotationPolicy: 'ask',
        paused: false, createdAt: new Date().toISOString(), createdVia: 'plan-page',
    });
}

const lookupFromState = () => {
    const byName = new Map((AppState.exerciseDatabase || []).filter(e => e?.name).map(e => [e.name.toLowerCase(), e]));
    return (n) => byName.get(String(n || '').toLowerCase());
};

/**
 * Apply the plan's waiting swaps — a rolled wave's (rotationPolicy 'ask') and
 * any "what's new" swap the workouts don't have yet (TP-6 f: a coach-made plan
 * could describe swaps it never wrote). The user said yes on the card or the
 * Plan page. A swap whose row changed since is skipped, never forced. Keeps
 * the prior lists on the program for undo.
 * @returns {Promise<{applied: number, skipped: number}>}
 */
export async function applyPendingRotations(program) {
    const templates = AppState.workoutPlans || AppState.templates || [];
    const lookup = lookupFromState();
    const fromPlan = waitingSwaps({ ...program, pendingRotations: [] }, templates);
    const resolved = resolveSwaps({
        templates: templates.filter(t => fromPlan.some(w => w.templateId === t.id)),
        swaps: fromPlan.map(w => ({ templateId: w.templateId, from: w.from, to: w.to, why: w.why })),
        lookup, equipment: AppState._cachedEquipment || [],
    }).rotations;
    const pending = [...(program?.pendingRotations || []), ...resolved];
    if (!uid() || !pending.length) return { applied: 0, skipped: 0 };
    const today = AppState.getTodayDateString();
    const priorTemplates = [...(program.priorTemplates || [])];
    let applied = 0;
    let skipped = 0;
    const done = [];
    for (const r of pending) {
        const t = templates.find(x => x.id === r.templateId);
        if (!t || !Array.isArray(t.exercises)) { skipped += r.swaps.length; continue; }
        const ok = r.swaps.filter(s => (t.exercises[s.index]?.machine || t.exercises[s.index]?.name) === s.from);
        skipped += r.swaps.length - ok.length;
        if (!ok.length) continue;
        if (!priorTemplates.some(p => p.templateId === t.id)) priorTemplates.push({ templateId: t.id, exercises: t.exercises });
        const exercises = applyRotation(t.exercises, ok, { lookup, today });
        await setDoc(doc(db, 'users', uid(), 'workoutTemplates', t.id), { exercises, lastUpdated: new Date().toISOString() }, { merge: true });
        t.exercises = exercises;
        applied += ok.length;
        done.push({ ...r, swaps: ok });
    }
    const madeKeys = new Set(done.flatMap(r => r.swaps.map(s => `${s.from}|${s.to}`.toLowerCase())));
    const changed = program.rationale?.changed?.map(c => (c.from && madeKeys.has(`${c.from}|${c.to}`.toLowerCase()) ? { ...c, state: 'applied' } : c));
    await setDoc(doc(db, 'users', uid(), 'programs', program.id), {
        pendingRotations: [], rotationsApplied: [...(program.rotationsApplied || []), ...done], priorTemplates,
        ...(changed ? { rationale: { ...program.rationale, changed } } : {}),
        lastUpdated: new Date().toISOString(),
    }, { merge: true });
    return { applied, skipped };
}

/**
 * Undo a roll: only while no workout is dated inside it. Restores the
 * workouts the roll's swaps changed, deletes the wave, puts the previous one
 * back, and pauses the plan (otherwise next Sunday would roll it again).
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function undoRoll(program, workouts = []) {
    if (!uid() || !program?.id) return { ok: false, reason: 'missing' };
    if (program.createdVia !== 'auto-roll') return { ok: false, reason: 'not_rolled' };
    if (!rollUndoable(program, workouts)) return { ok: false, reason: 'logged' };
    const nowIso = new Date().toISOString();
    for (const p of program.priorTemplates || []) {
        await setDoc(doc(db, 'users', uid(), 'workoutTemplates', p.templateId), { exercises: p.exercises, lastUpdated: nowIso }, { merge: true });
        const t = (AppState.workoutPlans || []).find(x => x.id === p.templateId);
        if (t) t.exercises = p.exercises;
    }
    await deleteDoc(doc(db, 'users', uid(), 'programs', program.id));
    if (program.rolledFrom) {
        await setDoc(doc(db, 'users', uid(), 'programs', program.rolledFrom), { active: true, state: 'active', lastUpdated: nowIso }, { merge: true });
    }
    await savePlan({ paused: true, pausedAt: nowIso, pausedBy: 'undo-roll' });
    AppState._activeProgram = undefined;
    return { ok: true };
}
