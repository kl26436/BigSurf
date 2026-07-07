// Week plan (Phase 5.5) — the lightest possible scheduling layer.
//
// One template per weekday, rest days explicit, no dates: a repeating weekly
// shape stored at users/{uid}/preferences/weekPlan. The reflow rules are
// DETERMINISTIC and boring on purpose (no AI call): missed day → next open
// day this week, never double-booked, silently. The coach only gets involved
// when asked. Pure logic lives here (unit-tested); Firestore access uses
// dynamic imports so tests can import this module without firebase.

import { AppState } from '../utils/app-state.js';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export function emptyWeekPlan() {
    const days = {};
    for (const d of DAY_KEYS) days[d] = null;
    return { days, restDays: [], updatedAt: null };
}

/** Day key ('mon'…'sun') for a Date. */
export function dayKeyOf(date = new Date()) {
    return DAY_KEYS[(date.getDay() + 6) % 7]; // JS: 0=Sun → our week starts Mon
}

/** YYYY-MM-DD strings for each day of the week containing `date` (Mon-first). */
export function weekDates(date = new Date()) {
    const monday = new Date(date);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const out = {};
    DAY_KEYS.forEach((key, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        out[key] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    return out;
}

/**
 * Which planned days already count as done this week? A completed workout
 * counts for a planned day when it matches that day's template (by id, else
 * name) — regardless of WHICH day it was done on ("wrong day" is fine, the
 * plan never nags). Each workout can satisfy at most one planned day.
 *
 * @param {object} plan - {days:{mon:templateId|null,…}}
 * @param {Array} weekWorkouts - completed workouts from THIS week:
 *   [{date, templateId?, workoutType}]
 * @param {Array} templates - [{id, name}] to resolve names
 * @returns {Set<string>} day keys satisfied
 */
export function satisfiedDays(plan, weekWorkouts = [], templates = []) {
    const nameOf = (id) => (templates.find(t => t.id === id)?.name || '').toLowerCase();
    const used = new Set(); // workout indices already consumed
    const satisfied = new Set();
    for (const day of DAY_KEYS) {
        const tid = plan?.days?.[day];
        if (!tid) continue;
        const tName = nameOf(tid);
        const idx = weekWorkouts.findIndex((w, i) => !used.has(i)
            && (w.templateId === tid
                || (tName && (w.workoutType || '').toLowerCase() === tName)));
        if (idx !== -1) {
            used.add(idx);
            satisfied.add(day);
        }
    }
    return satisfied;
}

/**
 * THE reflow: effective plan for the rest of the week.
 * - Days before today that were planned but not satisfied are MISSED: each
 *   missed workout shifts to the next OPEN day (no planned template, not a
 *   rest day, not already consumed) at or after today; if none exists it
 *   drops (weekly review mentions it once — nothing here notifies).
 * - Never double-books: one template per effective day.
 *
 * @returns {{effective: Object<string,string|null>, dropped: string[]}}
 *   effective: dayKey → templateId for today..sunday; dropped: templateIds
 *   that couldn't be placed.
 */
export function reflowWeek(plan, satisfied, today = new Date()) {
    const todayIdx = DAY_KEYS.indexOf(dayKeyOf(today));
    const days = plan?.days || {};
    const restDays = new Set(plan?.restDays || []);

    // Start with the as-planned remainder of the week.
    const effective = {};
    for (let i = todayIdx; i < DAY_KEYS.length; i++) {
        const key = DAY_KEYS[i];
        effective[key] = satisfied.has(key) ? null : (days[key] || null);
    }

    // Collect missed (before today, planned, unsatisfied), in day order.
    const missed = [];
    for (let i = 0; i < todayIdx; i++) {
        const key = DAY_KEYS[i];
        if (days[key] && !satisfied.has(key)) missed.push(days[key]);
    }

    // Shift each missed workout to the next open day.
    const dropped = [];
    for (const tid of missed) {
        // Already scheduled later this week (or satisfied elsewhere)? Skip.
        if (Object.values(effective).includes(tid)) continue;
        let placed = false;
        for (let i = todayIdx; i < DAY_KEYS.length; i++) {
            const key = DAY_KEYS[i];
            if (!effective[key] && !restDays.has(key) && !days[key]) {
                effective[key] = tid;
                placed = true;
                break;
            }
        }
        if (!placed) dropped.push(tid);
    }

    return { effective, dropped };
}

/**
 * What should the dashboard's Today card show?
 * @returns {{kind:'workout', templateId:string} | {kind:'rest'} | {kind:'done'}
 *   | {kind:'open'} | {kind:'none'}}
 *   none = no plan configured at all.
 */
export function todayCard(plan, satisfied, today = new Date()) {
    const hasAny = plan && DAY_KEYS.some(d => plan.days?.[d]) ;
    if (!hasAny && !(plan?.restDays || []).length) return { kind: 'none' };
    const key = dayKeyOf(today);
    if (satisfied.has(key)) return { kind: 'done' };
    const { effective } = reflowWeek(plan, satisfied, today);
    if (effective[key]) return { kind: 'workout', templateId: effective[key] };
    if ((plan.restDays || []).includes(key)) return { kind: 'rest' };
    return { kind: 'open' };
}

/** One-line week summary for action cards / context: "Mon push · Wed pull · rest Sun". */
export function summarizeWeekPlan(plan, templates = []) {
    const nameOf = (id) => templates.find(t => t.id === id)?.name || id;
    const parts = [];
    for (const d of DAY_KEYS) {
        if (plan?.days?.[d]) parts.push(`${DAY_LABELS[d].slice(0, 3)} ${nameOf(plan.days[d])}`);
    }
    const rest = (plan?.restDays || []).map(d => DAY_LABELS[d]?.slice(0, 3)).filter(Boolean);
    if (rest.length) parts.push(`rest ${rest.join('/')}`);
    return parts.join(' · ') || 'No days planned';
}

// ── Firestore access (dynamic imports keep the module test-importable) ──

export async function loadWeekPlan() {
    if (!AppState.currentUser) return null;
    try {
        const { db, doc, getDoc } = await import('../data/firebase-config.js');
        const snap = await getDoc(doc(db, 'users', AppState.currentUser.uid, 'preferences', 'weekPlan'));
        // null (vs undefined) = fetched and absent — callers use that to skip refetching.
        const data = snap.exists() ? snap.data() : null;
        AppState._weekPlan = data;
        return data;
    } catch (e) {
        console.error('❌ Week plan load failed:', e);
        return null;
    }
}

export async function saveWeekPlan(days, restDays = []) {
    if (!AppState.currentUser) return false;
    try {
        const { db, doc, setDoc } = await import('../data/firebase-config.js');
        const plan = { days, restDays, updatedAt: new Date().toISOString() };
        await setDoc(doc(db, 'users', AppState.currentUser.uid, 'preferences', 'weekPlan'), plan);
        AppState._weekPlan = plan;
        return true;
    } catch (e) {
        console.error('❌ Week plan save failed:', e);
        return false;
    }
}
