// Home model (HOME.md, Option B "Today-first") — the pure pieces of the Home
// screen: the week strip, the hero's title / stat tiles, and the main-lift
// tiles' badge + sparkline series. dashboard-ui.js renders them; keeping them
// here keeps them testable without the Firebase import graph.

import { weekTargetEffects } from './week-targets.js';
import { bestE1rmBetween } from './progress-scoreboard.js';
import { shiftDay } from './training-rules.js';

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function localDateString(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The hero's week strip, Sunday first — the same week the "N of M this week"
 * count uses (StatsTracker.getWeeklyStats). A day is done when a completed
 * workout landed on it; otherwise today is today, a day the week plan (or,
 * without one, a workout's usual days) schedules is planned, and the rest are
 * rest. A planned day that went by stays "planned", never "missed" — the
 * plan reflows quietly and Home doesn't nag.
 * @param {{workouts?: object[], weekPlan?: object|null, templates?: object[], today: string}} args
 * @returns {Array<{letter:string, date:string, dayName:string, state:'done'|'today'|'plan'|'rest', isToday:boolean}>}
 */
export function buildWeekStrip({ workouts = [], weekPlan = null, templates = [], today }) {
    const t = new Date(`${today}T12:00:00`);
    const sunday = new Date(t);
    sunday.setDate(t.getDate() - t.getDay());
    const doneDates = new Set(
        (workouts || []).filter(w => w?.date && w.completedAt && !w.cancelledAt).map(w => w.date)
    );
    const live = (templates || []).filter(x => x && !x.archived);
    return LETTERS.map((letter, i) => {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        const date = localDateString(d);
        const key = DAY_KEYS[i];
        const planned = weekPlan
            ? !!weekPlan.days?.[key] && !(weekPlan.restDays || []).includes(key)
            : live.some(x => Array.isArray(x.suggestedDays) && x.suggestedDays.includes(DAY_NAMES[i].toLowerCase()));
        const isToday = date === today;
        let state = 'rest';
        if (doneDates.has(date)) state = 'done';
        else if (isToday) state = 'today';
        else if (planned) state = 'plan';
        return { letter, date, dayName: DAY_NAMES[i], state, isToday };
    });
}

/**
 * "Leg Day — Strength (knee-smart)" → { title: 'Leg Day', sub: 'Strength · knee-smart' }.
 * The name before the dash is the title; what follows loses its parentheses
 * and joins with " · ". No dash → the whole name, no subtitle.
 */
export function splitWorkoutTitle(name) {
    const full = String(name || '').trim();
    const m = full.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    if (!m) return { title: full, sub: '' };
    const sub = m[2]
        .replace(/\(([^)]*)\)/g, ' · $1 ')
        .split('·')
        .map(s => s.trim())
        .filter(Boolean)
        .join(' · ');
    return { title: m[1].trim(), sub };
}

/**
 * The hero's stat tiles: how long it usually takes, how many exercises, and
 * what this plan week asks for (rep range + effort, else the load / set
 * change). Without a plan week the third tile is the planned set count.
 * @param {{exercises?: object[], lastDuration?: number, target?: object|null}} args
 * @returns {Array<{value:string, label:string}>}
 */
export function heroStats({ exercises = [], lastDuration = 0, target = null } = {}) {
    const tiles = [];
    const mins = Math.round((lastDuration || 0) / 60);
    if (mins > 0) tiles.push({ value: `~${mins}`, label: 'min' });
    tiles.push({ value: String(exercises.length), label: exercises.length === 1 ? 'exercise' : 'exercises' });
    const fx = target ? weekTargetEffects(target) : null;
    const signed = (n) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
    if (fx?.repRange) {
        tiles.push({ value: `${fx.repRange[0]}–${fx.repRange[1]}`, label: fx.rpeTarget != null ? `reps · ${fx.rpeTarget}/10` : 'reps' });
    } else if (fx?.weightPct != null) {
        tiles.push({ value: `${signed(fx.weightPct)}%`, label: 'weight' });
    } else if (fx?.setDelta != null) {
        tiles.push({ value: signed(fx.setDelta), label: Math.abs(fx.setDelta) === 1 ? 'set' : 'sets' });
    } else if (fx?.rpeTarget != null) {
        tiles.push({ value: `${fx.rpeTarget}/10`, label: 'effort' });
    } else {
        const sets = exercises.reduce((s, e) => s + (Number(e?.sets) || 0), 0);
        if (sets > 0) tiles.push({ value: String(sets), label: 'sets' });
    }
    return tiles;
}

/**
 * A main lift's badge. Stuck (the stall ladder) wins over the 4-week delta;
 * otherwise the delta in the user's unit, signed.
 * @returns {{text:string, tone:'stuck'|'up'|'down'|'flat'|'new'}}
 */
export function liftBadge(p) {
    if (p?.rung > 0) return { text: 'Stuck', tone: 'stuck' };
    if (p?.trend === 'up' && p.delta != null) return { text: `+${p.delta}`, tone: 'up' };
    if (p?.trend === 'down' && p.delta != null) return { text: `−${Math.abs(p.delta)}`, tone: 'down' };
    if (p?.trend === 'flat') return { text: '±0', tone: 'flat' };
    if (p?.trend === 'new') return { text: 'New', tone: 'new' };
    return { text: 'Not trained', tone: 'flat' };
}

/**
 * Weekly best estimated max for one main lift, oldest first — the tile's
 * sparkline. Weeks without a session are skipped (not zeroed), so a missed
 * week doesn't read as a crash.
 * @returns {number[]}
 */
export function weeklyE1rmSeries(workouts, lift, unit, today, weeks = 6) {
    const machine = lift?.equipment ? { name: lift.equipment } : null;
    const out = [];
    for (let i = weeks - 1; i >= 0; i--) {
        const to = shiftDay(today, -7 * i);
        const from = shiftDay(to, -6);
        const v = bestE1rmBetween(workouts, lift.name, unit, from, to, machine)
            ?? (machine ? bestE1rmBetween(workouts, lift.name, unit, from, to) : null);
        if (v != null) out.push(v);
    }
    return out;
}
