// Goals & events — Firestore data layer (TP-1).
//
// users/{uid}/goals/{id} and users/{uid}/events/{id}. The math lives in
// goal-progress.js (pure, mirrored); this file loads what that math needs
// (workouts, templates, bodyweight, scans), captures the baseline at
// creation — never typed — and writes the docs. The coach's set_goal /
// add_event executors write the same shapes server-side.

import { db, doc, setDoc, getDocs, deleteDoc, collection } from '../data/firebase-config.js';
import { AppState } from '../utils/app-state.js';
import { debugLog } from '../utils/config.js';
import { loadAllWorkouts } from '../data/data-manager.js';
import {
    normalizeGoal, normalizeEvent, captureBaseline, goalsWithStatus,
} from './goal-progress.js';
import { pickPrimaries } from './progress-scoreboard.js';

const uid = () => AppState.currentUser?.uid || null;
const newId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export async function loadGoals() {
    if (!uid()) return [];
    try {
        const snap = await getDocs(collection(db, 'users', uid(), 'goals'));
        const out = [];
        snap.forEach(d => out.push({ id: d.id, ...d.data() }));
        return out.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    } catch (e) {
        console.error('❌ Failed to load goals:', e);
        return [];
    }
}

export async function loadEvents() {
    if (!uid()) return [];
    try {
        const snap = await getDocs(collection(db, 'users', uid(), 'events'));
        const out = [];
        snap.forEach(d => out.push({ id: d.id, ...d.data() }));
        return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    } catch (e) {
        console.error('❌ Failed to load events:', e);
        return [];
    }
}

async function templatesNow() {
    let templates = AppState.workoutPlans || [];
    if (!templates.length) {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            templates = await new FirebaseWorkoutManager(AppState).getUserWorkoutTemplates();
            AppState.workoutPlans = templates;
        } catch (e) { debugLog('goals: templates load failed', e); }
    }
    return templates;
}

/**
 * Everything goal math reads, in one object: what measureGoal / captureBaseline
 * / goalsWithStatus take as `data`.
 */
export async function loadGoalData() {
    const today = AppState.getTodayDateString();
    const unit = AppState.globalUnit === 'kg' ? 'kg' : 'lbs';
    const [workouts, templates, measurements, dexa] = await Promise.all([
        loadAllWorkouts(AppState).catch(() => []),
        templatesNow(),
        import('./body-measurements.js').then(m => m.loadBodyWeightHistory(365)).catch(() => []),
        import('./dexa-scan.js').then(m => m.loadDexaHistory(50)).catch(() => []),
    ]);
    const done = (workouts || []).filter(w => w?.completedAt && !w.cancelledAt);
    const plates = unit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs;
    return { workouts: done, templates, measurements, dexa, today, unit, plates };
}

/** The main lifts, by name — the only lifts a lift goal may name. */
export function mainLiftNames(data) {
    return pickPrimaries({ templates: data.templates || [], workouts: data.workouts || [], today: data.today }).map(p => p.name);
}

/**
 * Validate a draft, capture its baseline from the data, write it.
 * @returns {{ok: true, goal: object} | {ok: false, error: string, hint?: string}}
 */
export async function createGoal(draft, data, { events = [] } = {}) {
    if (!uid()) return { ok: false, error: 'Sign in to set goals' };
    const v = normalizeGoal(draft, { today: data.today, mainLifts: mainLiftNames(data), eventIds: events.map(e => e.id), unit: data.unit });
    if (!v.ok) return v;
    const { baseline, direction } = captureBaseline(v.goal, data);
    const goal = { ...v.goal, direction, baseline, createdAt: new Date().toISOString(), source: 'app' };
    const id = newId('goal');
    try {
        await setDoc(doc(db, 'users', uid(), 'goals', id), goal);
        return { ok: true, goal: { id, ...goal } };
    } catch (e) {
        console.error('❌ Failed to save goal:', e);
        return { ok: false, error: "Couldn't save the goal — try again" };
    }
}

/** Status changes and edits (target / date / name / status). */
export async function updateGoal(id, patch) {
    if (!uid() || !id) return false;
    try {
        await setDoc(doc(db, 'users', uid(), 'goals', id), { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
        return true;
    } catch (e) {
        console.error('❌ Failed to update goal:', e);
        return false;
    }
}

export async function deleteGoal(id) {
    if (!uid() || !id) return false;
    try {
        await deleteDoc(doc(db, 'users', uid(), 'goals', id));
        return true;
    } catch (e) {
        console.error('❌ Failed to delete goal:', e);
        return false;
    }
}

export async function createEvent(draft, { today }) {
    if (!uid()) return { ok: false, error: 'Sign in to add events' };
    const v = normalizeEvent(draft, { today });
    if (!v.ok) return v;
    const id = newId('event');
    const event = { ...v.event, createdAt: new Date().toISOString(), source: 'app' };
    try {
        await setDoc(doc(db, 'users', uid(), 'events', id), event);
        return { ok: true, event: { id, ...event } };
    } catch (e) {
        console.error('❌ Failed to save event:', e);
        return { ok: false, error: "Couldn't save the event — try again" };
    }
}

export async function deleteEvent(id) {
    if (!uid() || !id) return false;
    try {
        await deleteDoc(doc(db, 'users', uid(), 'events', id));
        return true;
    } catch (e) {
        console.error('❌ Failed to delete event:', e);
        return false;
    }
}

/** Goals + events + statuses, for the page and the coach context. */
export async function loadGoalsWithStatus() {
    const [goals, events, data] = await Promise.all([loadGoals(), loadEvents(), loadGoalData()]);
    return { goals, events, data, rows: goalsWithStatus(goals, { ...data, events }) };
}
