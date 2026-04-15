// Aggregators — pure functions for volume, 1RM, body-part breakdown
// All functions take workout arrays + date bounds, return computed data.

import { AppState } from '../../utils/app-state.js';

// ===================================================================
// BODY PART CLASSIFICATION
// ===================================================================

// Reuses the keyword matching from training-insights.js
const BP_MAP = {
    chest: 'chest', back: 'back', shoulders: 'shoulders',
    legs: 'legs', arms: 'arms', core: 'core', glutes: 'legs',
};

function classifyBodyPart(exerciseName) {
    if (!exerciseName) return 'other';

    // Check exercise database first
    const db = AppState.exerciseDatabase || [];
    const match = db.find(ex => (ex.name || ex.machine || '').toLowerCase() === exerciseName.toLowerCase());
    if (match && match.bodyPart) {
        const bp = match.bodyPart.toLowerCase();
        return BP_MAP[bp] || bp;
    }

    // Keyword fallback
    const name = exerciseName.toLowerCase();
    if (name.includes('bench') || name.includes('chest') || name.includes('fly') || name.includes('pec')) return 'chest';
    if (name.includes('row') || name.includes('pull') || name.includes('lat') || name.includes('back') || name.includes('deadlift')) return 'back';
    if (name.includes('shoulder') || name.includes('delt') || name.includes('lateral raise')) return 'shoulders';
    if (name.includes('squat') || name.includes('leg') || name.includes('lunge') || name.includes('hamstring') || name.includes('quad') || name.includes('calf') || name.includes('glute') || name.includes('hip thrust')) return 'legs';
    if (name.includes('bicep') || name.includes('curl') || name.includes('tricep') || name.includes('arm') || name.includes('extension')) return 'arms';
    if (name.includes('core') || name.includes('ab') || name.includes('crunch') || name.includes('plank')) return 'core';
    if (name.includes('press') && !name.includes('leg')) return 'shoulders';
    return 'other';
}

// ===================================================================
// DATE HELPERS
// ===================================================================

function isInRange(dateStr, start, end) {
    if (!dateStr) return false;
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d >= start && d <= end;
}

// ===================================================================
// VOLUME AGGREGATORS
// ===================================================================

/**
 * Total volume (reps * weight) within a date range.
 */
export function aggregateVolume(workouts, { start, end }) {
    let total = 0;
    for (const w of workouts) {
        if (!isInRange(w.date, start, end)) continue;
        if (w.cancelledAt) continue;
        for (const ex of Object.values(w.exercises || {})) {
            for (const set of ex.sets || []) {
                if (set.reps && set.weight) total += set.reps * set.weight;
            }
        }
    }
    return total;
}

/**
 * Volume broken down by body part within a date range.
 * Returns { chest: 10200, back: 8400, ... }
 */
export function aggregateVolumeByBodyPart(workouts, { start, end }) {
    const out = { chest: 0, back: 0, legs: 0, arms: 0, core: 0, shoulders: 0 };
    for (const w of workouts) {
        if (!isInRange(w.date, start, end)) continue;
        if (w.cancelledAt) continue;
        for (const ex of Object.values(w.exercises || {})) {
            const part = classifyBodyPart(ex.name);
            if (!out.hasOwnProperty(part)) out[part] = 0;
            for (const set of ex.sets || []) {
                if (set.reps && set.weight) {
                    out[part] = (out[part] || 0) + set.reps * set.weight;
                }
            }
        }
    }
    return out;
}

/**
 * Volume per body part bucketed by day or week (for stacked area chart).
 * Returns [{ date, chest, back, legs, ... }, ...]
 */
export function aggregateVolumeTimeseries(workouts, { start, end }, bucketBy = 'week') {
    const buckets = new Map();
    for (const w of workouts) {
        if (!isInRange(w.date, start, end)) continue;
        if (w.cancelledAt) continue;
        const parts = w.date.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const key = bucketKey(d, bucketBy);
        if (!buckets.has(key)) buckets.set(key, { date: key, chest: 0, back: 0, legs: 0, arms: 0, core: 0, shoulders: 0 });
        const bucket = buckets.get(key);
        for (const ex of Object.values(w.exercises || {})) {
            const part = classifyBodyPart(ex.name);
            for (const set of ex.sets || []) {
                if (set.reps && set.weight) {
                    bucket[part] = (bucket[part] || 0) + set.reps * set.weight;
                }
            }
        }
    }
    return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function bucketKey(date, bucket) {
    if (bucket === 'day') return date.toISOString().slice(0, 10);
    if (bucket === 'week') {
        const d = new Date(date);
        const day = (d.getDay() + 6) % 7; // Monday=0
        d.setDate(d.getDate() - day);
        return d.toISOString().slice(0, 10);
    }
    if (bucket === 'month') return date.toISOString().slice(0, 7);
    return date.toISOString().slice(0, 10);
}

// ===================================================================
// STRENGTH / 1RM AGGREGATORS
// ===================================================================

/**
 * Best 1RM estimate per workout for a specific exercise (Epley formula).
 * Returns [{ date, oneRM }, ...]
 */
export function aggregate1RMSeries(workouts, exerciseName, { start, end }) {
    const out = [];
    for (const w of workouts) {
        if (!isInRange(w.date, start, end)) continue;
        if (w.cancelledAt) continue;
        let best = 0;
        for (const ex of Object.values(w.exercises || {})) {
            if (ex.name !== exerciseName) continue;
            for (const set of ex.sets || []) {
                if (!set.reps || !set.weight || set.reps === 0) continue;
                const oneRM = set.weight * (1 + set.reps / 30); // Epley
                if (oneRM > best) best = oneRM;
            }
        }
        if (best > 0) out.push({ date: w.date, oneRM: best });
    }
    return out;
}

/**
 * "Top Lifts" — combined 1RM change for the big compound lifts.
 */
const BIG_LIFTS = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press'];

export function aggregateTopLifts(workouts, range, getRangeBoundsFn, getPrevBoundsFn) {
    const curBounds = getRangeBoundsFn(range);
    const prevBounds = getPrevBoundsFn(range);

    function getPeak1RMs(bounds) {
        const peaks = {};
        if (!bounds) return peaks;
        for (const lift of BIG_LIFTS) {
            const series = aggregate1RMSeries(workouts, lift, bounds);
            const maxRM = series.reduce((max, p) => Math.max(max, p.oneRM), 0);
            if (maxRM > 0) peaks[lift] = maxRM;
        }
        return peaks;
    }

    const cur = getPeak1RMs(curBounds);
    const prev = getPeak1RMs(prevBounds);
    const totalDelta = BIG_LIFTS.reduce((sum, l) => sum + ((cur[l] || 0) - (prev[l] || 0)), 0);
    return { totalDelta, perLift: cur, prevPerLift: prev };
}

/**
 * Sparkline points for combined top-lift 1RM trend.
 */
export function getTopLiftsTrendPoints(workouts, { start, end }) {
    // Collect all workout dates in range and compute combined peak 1RM per date
    const dateMap = new Map();
    for (const w of workouts) {
        if (!isInRange(w.date, start, end)) continue;
        if (w.cancelledAt) continue;
        let combined = dateMap.get(w.date) || 0;
        for (const lift of BIG_LIFTS) {
            for (const ex of Object.values(w.exercises || {})) {
                if (ex.name !== lift) continue;
                for (const set of ex.sets || []) {
                    if (!set.reps || !set.weight) continue;
                    const oneRM = set.weight * (1 + set.reps / 30);
                    combined = Math.max(combined, (dateMap.get(w.date) || 0));
                    // Track per-workout best across all lifts
                    let best = 0;
                    for (const s of ex.sets || []) {
                        if (s.reps && s.weight) best = Math.max(best, s.weight * (1 + s.reps / 30));
                    }
                    combined += best;
                    break; // Only count first match per exercise per workout
                }
            }
        }
        dateMap.set(w.date, combined);
    }

    // Simpler approach: running sum of best 1RMs per workout
    const points = [];
    let runningBest = {};
    const sorted = [...dateMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [date] of sorted) {
        // Recalculate from workouts on this date
        const dayWorkouts = workouts.filter(w => w.date === date && !w.cancelledAt);
        for (const lift of BIG_LIFTS) {
            for (const w of dayWorkouts) {
                for (const ex of Object.values(w.exercises || {})) {
                    if (ex.name !== lift) continue;
                    for (const set of ex.sets || []) {
                        if (set.reps && set.weight) {
                            const rm = set.weight * (1 + set.reps / 30);
                            runningBest[lift] = Math.max(runningBest[lift] || 0, rm);
                        }
                    }
                }
            }
        }
        const total = Object.values(runningBest).reduce((s, v) => s + v, 0);
        if (total > 0) points.push({ x: points.length, y: Math.round(total) });
    }
    return points;
}

// ===================================================================
// SESSION / SET COUNTING
// ===================================================================

/**
 * Count sessions and sets for a given body part within a range.
 */
export function countSessionsAndSets(workouts, bodyPart, { start, end }) {
    let sessions = 0;
    let sets = 0;
    for (const w of workouts) {
        if (!isInRange(w.date, start, end)) continue;
        if (w.cancelledAt) continue;
        let foundInSession = false;
        for (const ex of Object.values(w.exercises || {})) {
            if (classifyBodyPart(ex.name) === bodyPart) {
                if (!foundInSession) { sessions++; foundInSession = true; }
                sets += (ex.sets || []).filter(s => s.reps && s.weight).length;
            }
        }
    }
    return { sessions, sets };
}

/**
 * Per-body-part volume trend points (for sparklines in breakdown rows).
 */
export function bodyPartTrendPoints(workouts, bodyPart, { start, end }) {
    const dateMap = new Map();
    for (const w of workouts) {
        if (!isInRange(w.date, start, end)) continue;
        if (w.cancelledAt) continue;
        let vol = 0;
        for (const ex of Object.values(w.exercises || {})) {
            if (classifyBodyPart(ex.name) !== bodyPart) continue;
            for (const set of ex.sets || []) {
                if (set.reps && set.weight) vol += set.reps * set.weight;
            }
        }
        if (vol > 0) {
            const prev = dateMap.get(w.date) || 0;
            dateMap.set(w.date, prev + vol);
        }
    }
    return [...dateMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map((entry, i) => ({ x: i, y: entry[1] }));
}

// ===================================================================
// V2 DASHBOARD AGGREGATORS
// ===================================================================

/** Hero lift per body part — the signature exercise shown on each card. */
const HERO_LIFT_BY_BODY_PART = {
    chest: 'Bench Press',
    back: 'Weighted Pull-up',
    legs: 'Deadlift',
    shoulders: 'Overhead Press',
    arms: 'Barbell Curl',
    core: 'Plank',
};

export function getHeroLiftForBodyPart(bodyPart) {
    return HERO_LIFT_BY_BODY_PART[bodyPart] || '';
}

/**
 * Count how many times each template has been used on each day of the week.
 */
export function aggregateSessionsPerDayOfWeek(workouts) {
    const map = new Map();
    for (const w of workouts) {
        const name = w.workoutType;
        if (!name || !w.completedAt) continue;
        const parts = w.date.split('-');
        const dow = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getDay();
        if (!map.has(name)) map.set(name, Array(7).fill(0));
        map.get(name)[dow]++;
    }
    return map;
}

/**
 * Return templates ordered by how often they're used on a given day of week.
 */
export function getTemplatesForDayOfWeek(templates, workouts, dow) {
    const counts = aggregateSessionsPerDayOfWeek(workouts);
    return templates
        .map(t => ({ template: t, count: counts.get(t.name || t.day)?.[dow] || 0 }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Find the most recent workout that trained this body part.
 */
export function getLastTrainedDate(workouts, bodyPart) {
    let latest = null;
    for (const w of workouts) {
        if (w.cancelledAt) continue;
        for (const ex of Object.values(w.exercises || {})) {
            if (classifyBodyPart(ex.name) !== bodyPart) continue;
            if (!latest || w.date > latest) latest = w.date;
            break;
        }
    }
    if (!latest) return null;
    const parts = latest.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const daysAgo = Math.floor((Date.now() - d.getTime()) / 86400000);
    return { date: latest, daysAgo };
}

/**
 * Get the heaviest set for a specific exercise within a range.
 */
export function aggregateHeaviestSet(workouts, exerciseName, { start, end }) {
    let best = null;
    for (const w of workouts) {
        if (!isInRange(w.date, start, end)) continue;
        if (w.cancelledAt) continue;
        for (const ex of Object.values(w.exercises || {})) {
            if (ex.name !== exerciseName) continue;
            for (const set of ex.sets || []) {
                if (!set.weight || !set.reps) continue;
                const weight = set.weight;
                if (!best || weight > best.weight || (weight === best.weight && set.reps > best.reps)) {
                    best = { weight, reps: set.reps, date: w.date };
                }
            }
        }
    }
    if (!best) return null;
    // Compute delta from previous period
    // We'll keep it simple — delta from all-time previous best before range
    return best;
}

/**
 * Count sessions that include a given body part within a range.
 */
export function countSessions(workouts, bodyPart, { start, end }) {
    let count = 0;
    for (const w of workouts) {
        if (!isInRange(w.date, start, end)) continue;
        if (w.cancelledAt) continue;
        for (const ex of Object.values(w.exercises || {})) {
            if (classifyBodyPart(ex.name) === bodyPart) { count++; break; }
        }
    }
    return count;
}

/**
 * Volume trend points for a body part (for sparklines on body-part cards).
 * Re-exports bodyPartTrendPoints with a friendlier name.
 */
export function aggregateVolumeTrend(workouts, bodyPart, { start, end }) {
    return bodyPartTrendPoints(workouts, bodyPart, { start, end });
}

/**
 * Single entry point for rendering a body-part card or detail page.
 */
export function aggregateBodyPartStats(workouts, bodyPart, range = 'W') {
    const { getRangeBounds, getPreviousRangeBounds } = _rangeFns;
    const bounds = getRangeBounds(range);
    const prevBounds = getPreviousRangeBounds(range);

    const volume = aggregateVolumeByBodyPart(workouts, bounds)[bodyPart] || 0;
    const prevVolume = prevBounds ? (aggregateVolumeByBodyPart(workouts, prevBounds)[bodyPart] || 0) : 0;
    const volumeDeltaPct = prevVolume ? ((volume - prevVolume) / prevVolume * 100) : null;

    const heroLift = getHeroLiftForBodyPart(bodyPart);
    const heaviest = heroLift ? aggregateHeaviestSet(workouts, heroLift, bounds) : null;

    const sessions = countSessions(workouts, bodyPart, bounds);
    const lastTrained = getLastTrainedDate(workouts, bodyPart);
    const isStale = lastTrained ? lastTrained.daysAgo > 5 : true;

    const volumeTrend = aggregateVolumeTrend(workouts, bodyPart, bounds);

    return { bodyPart, heroLift, heaviest, volume, volumeDeltaPct, sessions, lastTrained, isStale, volumeTrend };
}

/**
 * Get all exercises for a body part with stats (for muscle group detail page).
 */
export function getExercisesForBodyPart(workouts, bodyPart, range = 'M') {
    const { getRangeBounds, getPreviousRangeBounds } = _rangeFns;
    const bounds = getRangeBounds(range);
    const prevBounds = getPreviousRangeBounds(range);
    const exerciseMap = new Map(); // name → { sessions, sets, volume, heaviest, trend }

    for (const w of workouts) {
        if (!isInRange(w.date, bounds.start, bounds.end)) continue;
        if (w.cancelledAt) continue;
        for (const ex of Object.values(w.exercises || {})) {
            if (classifyBodyPart(ex.name) !== bodyPart) continue;
            if (!exerciseMap.has(ex.name)) {
                exerciseMap.set(ex.name, { name: ex.name, bodyPart, sessions: 0, sets: 0, volume: 0, heaviest: null, dates: [] });
            }
            const entry = exerciseMap.get(ex.name);
            entry.sessions++;
            let dayVol = 0;
            for (const set of ex.sets || []) {
                if (!set.weight || !set.reps) continue;
                entry.sets++;
                const vol = set.weight * set.reps;
                entry.volume += vol;
                dayVol += vol;
                if (!entry.heaviest || set.weight > entry.heaviest.weight) {
                    entry.heaviest = { weight: set.weight, reps: set.reps };
                }
            }
            if (dayVol > 0) entry.dates.push({ date: w.date, vol: dayVol });
        }
    }

    // Compute trends and prev-period delta
    const results = [];
    for (const [, entry] of exerciseMap) {
        const trend = entry.dates
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((d, i) => ({ x: i, y: d.vol }));

        // Previous period volume for delta
        let prevVolume = 0;
        if (prevBounds) {
            for (const w of workouts) {
                if (!isInRange(w.date, prevBounds.start, prevBounds.end)) continue;
                if (w.cancelledAt) continue;
                for (const ex of Object.values(w.exercises || {})) {
                    if (ex.name !== entry.name) continue;
                    for (const set of ex.sets || []) {
                        if (set.weight && set.reps) prevVolume += set.weight * set.reps;
                    }
                }
            }
        }
        const volumeDeltaPct = prevVolume ? ((entry.volume - prevVolume) / prevVolume * 100) : null;

        results.push({ ...entry, trend, volumeDeltaPct, dates: undefined });
    }

    return results.sort((a, b) => b.volume - a.volume);
}

/**
 * Get PRs for a specific body part.
 */
export function getPRsForBodyPart(workouts, bodyPart) {
    const prs = new Map(); // exerciseName → { weight, reps, date }
    const sorted = [...workouts].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const w of sorted) {
        if (w.cancelledAt) continue;
        for (const ex of Object.values(w.exercises || {})) {
            if (classifyBodyPart(ex.name) !== bodyPart) continue;
            for (const set of ex.sets || []) {
                if (!set.weight || !set.reps) continue;
                const current = prs.get(ex.name);
                if (!current || set.weight > current.weight) {
                    prs.set(ex.name, { exercise: ex.name, weight: set.weight, reps: set.reps, date: w.date });
                }
            }
        }
    }
    return [...prs.values()].sort((a, b) => b.weight - a.weight);
}

/**
 * For the Level 3 exercise detail page.
 */
export function aggregateExerciseStats(workouts, exerciseName, range = 'All') {
    const { getRangeBounds } = _rangeFns;
    const bounds = getRangeBounds(range);
    const sessions = [];
    const allSets = [];

    for (const w of workouts) {
        if (!isInRange(w.date, bounds.start, bounds.end)) continue;
        if (w.cancelledAt) continue;
        const matching = Object.values(w.exercises || {}).filter(e => e.name === exerciseName);
        if (matching.length === 0) continue;

        const sessionSets = matching.flatMap(e => e.sets || []).filter(s => s.weight && s.reps);
        if (sessionSets.length === 0) continue;

        sessions.push({ date: w.date, sets: sessionSets });
        allSets.push(...sessionSets);
    }

    if (allSets.length === 0) {
        return { maxWeight: 0, heaviestSet: null, est1RM: 0, totalVolume: 0, sessions, topSets: [], trend: [] };
    }

    const maxWeight = Math.max(...allSets.map(s => s.weight));
    const heaviestSet = allSets.reduce((best, s) => {
        return (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps))
            ? { ...s, totalWeight: s.weight }
            : best;
    }, null);
    const est1RM = Math.max(...allSets.map(s => s.weight * (1 + s.reps / 30)));
    const totalVolume = allSets.reduce((sum, s) => sum + s.weight * s.reps, 0);

    // Heaviest weight per session — for the trend chart
    const trend = sessions.map(({ date, sets }) => ({
        date,
        y: Math.max(...sets.map(s => s.weight)),
    }));

    // Top 4 best sets ever by estimated 1RM
    const topSets = [...allSets]
        .map(s => ({ ...s, totalWeight: s.weight, est1RM: s.weight * (1 + s.reps / 30) }))
        .sort((a, b) => b.est1RM - a.est1RM)
        .slice(0, 4);

    return { maxWeight, heaviestSet, est1RM, totalVolume, sessions, topSets, trend };
}

/** Export classifyBodyPart for use by other modules. */
export { classifyBodyPart };

// Late-bound range functions (avoids circular import with range-filter.js)
let _rangeFns = {
    getRangeBounds: (range) => {
        const RANGE_DAYS = { W: 7, M: 30, '3M': 90, '6M': 180, Y: 365, All: Infinity };
        const end = new Date();
        const start = new Date();
        const days = RANGE_DAYS[range] || 7;
        if (days === Infinity) { start.setTime(0); } else { start.setDate(end.getDate() - days); }
        return { start, end, days };
    },
    getPreviousRangeBounds: (range) => {
        const { start } = _rangeFns.getRangeBounds(range);
        const RANGE_DAYS = { W: 7, M: 30, '3M': 90, '6M': 180, Y: 365, All: Infinity };
        const days = RANGE_DAYS[range] || 7;
        if (days === Infinity) return null;
        const prevEnd = new Date(start);
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - days);
        return { start: prevStart, end: prevEnd };
    },
};

/** Allow range-filter to inject its functions (avoids circular deps). */
export function setRangeFunctions(getRangeBounds, getPreviousRangeBounds) {
    _rangeFns = { getRangeBounds, getPreviousRangeBounds };
}

// ===================================================================
// HELPERS
// ===================================================================

export function formatNumber(n, decimals = 0) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: decimals });
}

export function formatVolume(v) {
    if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
    return Math.round(v).toString();
}

export function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Body part name → category color token */
export const BP_TO_CAT = {
    chest: 'push', back: 'pull', legs: 'legs',
    arms: 'arms', core: 'core', shoulders: 'shoulders',
    glutes: 'legs', cardio: 'cardio', other: 'other',
};
