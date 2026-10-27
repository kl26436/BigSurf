// Training Insights Module - core/features/training-insights.js
// Rules engine for real-time training analysis (no API cost)
// Phase 17.2 — runs on dashboard load using local data only

import { AppState } from '../utils/app-state.js';
import { Config } from '../utils/config.js';
import { formatBodyPart } from '../utils/workout-helpers.js';
import { buildExerciseSessions, stallState, scaleLoadableWeight, weightIncrement } from './progression.js';
import { pickPrimaries } from './progress-scoreboard.js';
import {
    getBodyPartForExercise, workoutTonnage, getISOWeekKey,
    analyzeWeeklyVolume as rulesWeeklyVolume,
    averageWeeklyVolume as rulesAverageVolume,
    checkDeloadNeeded as rulesCheckDeload,
} from './training-rules.js';

/**
 * Iterate a workout's exercises with `name` resolved from the workout-level
 * `exerciseNames` map (persisted exercises carry no inline name — see the
 * exercise-name-resolution note). Inlined deliberately rather than imported:
 * prod pins JS for a year, so a cross-module export would crash on version
 * skew between this file and aggregators.js. Keep this in sync with the copy
 * in aggregators.js / ai-coach-ui.js.
 */
function withResolvedNames(workout) {
    const exercises = workout?.exercises || {};
    return Object.entries(exercises).map(([key, ex]) => ({
        ...ex,
        name: ex?.name || ex?.machine || workout?.exerciseNames?.[key] || null,
    }));
}

/**
 * Normalize a set's weight to the user's display unit so comparisons across
 * sessions are apples-to-apples even when some sets were logged in a
 * different unit. Returns 0 for missing/invalid weights.
 */
function normalizedWeight(set, displayUnit) {
    const w = Number(set?.weight);
    if (!w || isNaN(w)) return 0;
    const from = set?.originalUnit || 'lbs';
    const to = displayUnit || 'lbs';
    if (from === to) return w;
    if (from === 'lbs' && to === 'kg') return w * 0.453592;
    if (from === 'kg' && to === 'lbs') return w * 2.20462;
    return w;
}

function currentDisplayUnit() {
    return AppState?.globalUnit || 'lbs';
}

// ===================================================================
// BODY PART MAPPING + WEEKLY VOLUME (AP-16: pure rules in training-rules.js)
// ===================================================================

// The algorithms live in training-rules.js (mirrored to functions/ so the
// coach's server-side verdicts run the same math); these wrappers keep the
// existing API and feed in the runtime Config thresholds.
export { getBodyPartForExercise, workoutTonnage, getISOWeekKey };

export function analyzeWeeklyVolume(workouts, exerciseDatabase, { weeks = 1 } = {}) {
    return rulesWeeklyVolume(workouts, exerciseDatabase, { weeks, mev: Config.VOLUME_MEV, mrv: Config.VOLUME_MRV });
}

export function averageWeeklyVolume(allWorkouts, exerciseDatabase, { today, days = 28 } = {}) {
    return rulesAverageVolume(allWorkouts, exerciseDatabase, { today, days, mev: Config.VOLUME_MEV, mrv: Config.VOLUME_MRV });
}

// ===================================================================
// PLATEAU DETECTION
// ===================================================================

/**
 * Detect exercises where the user has plateaued — the SAME definition the
 * active-workout card uses (AP-8): progression.js#stallState over
 * buildExerciseSessions (deload sessions excluded). This used to be a
 * parallel 3-session model that told a stalled lift "Try adding 5 lbs" —
 * the opposite of stall rung 1 (hold the weight, chase a rep).
 *
 * @param {Array} workouts - Recent completed workouts (multi-week)
 * @param {number} minSessions - Minimum flat sessions to report
 * @returns {Array<{exercise, weight, sessions, rung, equipment, suggestion}>}
 */
export function detectPlateaus(workouts, minSessions = Config.PLATEAU_MIN_SESSIONS) {
    const unit = currentDisplayUnit();
    const inc = weightIncrement(unit, unit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs);

    // Latest equipment per exercise name, newest workout first.
    const names = new Map();
    const sorted = [...(workouts || [])].filter(w => w && w.date)
        .sort((x, y) => y.date.localeCompare(x.date));
    for (const workout of sorted) {
        if (!workout.exercises) continue;
        for (const exercise of withResolvedNames(workout)) {
            if (exercise.name && !names.has(exercise.name)) names.set(exercise.name, exercise.equipment || null);
        }
    }

    const plateaus = [];
    for (const [exerciseName, equipment] of names) {
        const sessions = buildExerciseSessions(sorted, exerciseName, unit);
        const stall = stallState(sessions);
        if (stall.rung < 1 || stall.run < minSessions) continue;
        const W = sessions[0].topWeight;
        const R = sessions[0].topReps || sessions[0].maxReps || 0;
        const suggestion = stall.rung === 1
            ? `Hold ${W} ${unit} and chase ${R + 1} reps`
            : stall.rung === 2
                ? `Drop to ${scaleLoadableWeight(W, 0.9, inc)} ${unit} for two sessions, then rebuild`
                : 'Swap in a similar movement for the next few weeks';
        plateaus.push({ exercise: exerciseName, weight: W, sessions: stall.run, rung: stall.rung, equipment, suggestion });
    }
    plateaus.sort((x, y) => y.sessions - x.sessions);
    return plateaus;
}

// ===================================================================
// DELOAD DETECTION (AP-16: pure rule in training-rules.js)
// ===================================================================

/**
 * If user has trained 5+ days/week for 4+ consecutive weeks, suggest a
 * deload week — see training-rules.js#checkDeloadNeeded for the recovery-week
 * rules. Runs on the live Config thresholds.
 * @returns {{ needed: boolean, consecutiveHardWeeks: number, inRecoveryWeek: boolean } | null}
 */
export function checkDeloadNeeded(workouts) {
    const unit = currentDisplayUnit();
    const inc = weightIncrement(unit, unit === 'kg' ? AppState.settings?.plateKg : AppState.settings?.plateLbs);
    const primaries = pickPrimaries({ templates: AppState.workoutPlans || [], workouts, today: AppState.getTodayDateString?.() || null })
        .map(p => p.name);
    return rulesCheckDeload(workouts, Config, { unit, inc, primaries });
}

// ===================================================================
// FREQUENCY ANALYSIS
// ===================================================================

/**
 * Check how often each muscle group is trained per week.
 * Flag muscles hit <1x/week or >4x/week.
 *
 * @param {Array} workouts - Recent completed workouts
 * @param {Array} exerciseDatabase - Exercise library
 * @param {number} weeks - Number of weeks to analyze
 * @returns {Array} Frequency analysis per body part
 */
export function analyzeFrequency(workouts, exerciseDatabase, weeks = 4) {
    const bodyPartWeeks = {}; // { bodyPart: Set<weekKey> }

    for (const workout of workouts) {
        if (!workout.exercises || !workout.date) continue;
        const weekKey = getISOWeekKey(workout.date);

        for (const exercise of withResolvedNames(workout)) {
            const bodyPart = getBodyPartForExercise(exercise, exerciseDatabase);
            if (!bodyPart) continue;

            if (!bodyPartWeeks[bodyPart]) bodyPartWeeks[bodyPart] = {};
            if (!bodyPartWeeks[bodyPart][weekKey]) bodyPartWeeks[bodyPart][weekKey] = 0;
            bodyPartWeeks[bodyPart][weekKey]++;
        }
    }

    return Object.entries(bodyPartWeeks).map(([part, weekData]) => {
        const totalSessions = Object.values(weekData).reduce((sum, c) => sum + c, 0);
        const avgPerWeek = weeks > 0 ? totalSessions / weeks : 0;

        return {
            bodyPart: part,
            avgPerWeek: Math.round(avgPerWeek * 10) / 10,
            status: avgPerWeek < 1 ? 'low' : avgPerWeek > 4 ? 'high' : 'good',
            recommendation: avgPerWeek < 1
                ? `Train ${part} at least 1-2x per week for growth`
                : avgPerWeek > 4
                    ? `${part} is being hit ${avgPerWeek.toFixed(1)}x/week — consider consolidating`
                    : null,
        };
    });
}

// ===================================================================
// POSITIVE TRENDS
// ===================================================================

/**
 * Detect exercises with recent weight increases (positive reinforcement).
 *
 * @param {Array} workouts - Recent completed workouts (4+ weeks)
 * @returns {Array} Exercises with upward trends
 */
export function detectPositiveTrends(workouts) {
    const exerciseHistory = {};
    const unit = currentDisplayUnit();

    for (const workout of workouts) {
        if (!workout.exercises || !workout.date) continue;

        for (const exercise of withResolvedNames(workout)) {
            const name = exercise.name;
            if (!name) continue;

            const workingSets = (exercise.sets || []).filter(s =>
                s.completed !== false && s.weight && (s.type || 'working') !== 'warmup'
            );
            if (workingSets.length === 0) continue;

            const normalizedMax = Math.round(
                Math.max(...workingSets.map(s => normalizedWeight(s, unit))) * 10
            ) / 10;

            if (!exerciseHistory[name]) exerciseHistory[name] = [];
            exerciseHistory[name].push({
                date: workout.date,
                maxWeight: normalizedMax,
            });
        }
    }

    const trends = [];

    for (const [exerciseName, sessions] of Object.entries(exerciseHistory)) {
        if (sessions.length < 3) continue;

        sessions.sort((a, b) => a.date.localeCompare(b.date));

        const oldest = sessions[0].maxWeight;
        const newest = sessions[sessions.length - 1].maxWeight;
        const gain = newest - oldest;

        if (gain > 0 && oldest > 0) {
            trends.push({
                exercise: exerciseName,
                gain,
                from: oldest,
                to: newest,
                sessions: sessions.length,
            });
        }
    }

    // Sort by absolute gain descending
    trends.sort((a, b) => b.gain - a.gain);
    return trends.slice(0, 3);
}

// ===================================================================
// TOP INSIGHTS ORCHESTRATOR
// ===================================================================

/**
 * Get the top 1-3 most actionable insights for the dashboard.
 * Requires at least 3 workouts in the last 2 weeks to show anything.
 *
 * @param {Array} recentWorkouts - Workouts from the last 7 days (loadInsightsData) —
 *   the volume figures below are one week's sets, so the copy says "last 7 days"
 * @param {Array} allWorkouts - Workouts from last 6-8 weeks (for plateaus, deload, frequency)
 * @param {Array} exerciseDatabase - Exercise library
 * @returns {Array} Top insights with type, severity, and message
 */
export function getTopInsights(recentWorkouts, allWorkouts, exerciseDatabase, { intent = null } = {}) {
    const insights = [];

    // Need minimum data to produce insights
    if (!recentWorkouts || recentWorkouts.length < Config.INSIGHTS_MIN_WORKOUTS) {
        return insights;
    }

    // AP-8: in a deload (planned, manual, or already logged this week) the
    // dashboard doesn't ask for more load — or for the deload you're in.
    const deload = checkDeloadNeeded(allWorkouts);
    const inDeload = intent?.mode === 'deload' || !!deload?.inRecoveryWeek;

    // 1. Deload check (highest priority — health/recovery)
    if (deload && deload.needed && !inDeload) {
        insights.push({
            type: 'deload',
            severity: 'warning',
            icon: 'fa-bed',
            message: deload.source === 'fatigue'
                ? `Effort is climbing ${deload.fatiguedMain?.length >= 2 ? `on ${deload.fatiguedMain.slice(0, 2).join(' and ')}` : 'and readiness is low'} — take the lighter week a week early.`
                : `You've trained hard for ${deload.consecutiveHardWeeks} weeks straight. Consider a lighter week — cut volume 40–50%.`,
        });
    }

    // 1b. AP-22 — leading fatigue signs: effort climbing at the same load,
    // or a run of low readiness check-ins. The set targets already hold or
    // back off for them (phase 2); this says why before the reps drop.
    if (deload && !inDeload && !deload.needed) {
        const f = deload.fatigue?.[0];
        if (f) {
            insights.push({
                type: 'fatigue',
                severity: 'warning',
                icon: 'fa-gauge-high',
                message: `Effort creeping on ${f.exercise} at ${f.load} ${currentDisplayUnit()} — consider pulling the lighter week forward.`,
                exerciseName: f.exercise,
            });
        } else if (deload.readinessLow) {
            insights.push({
                type: 'readiness',
                severity: 'warning',
                icon: 'fa-battery-quarter',
                message: 'Readiness has been low across recent check-ins — go lighter today or pull the lighter week forward.',
            });
        }
    }

    // 2. Volume warnings (low volume)
    const volume = analyzeWeeklyVolume(recentWorkouts, exerciseDatabase);
    const lowVolume = volume.filter(v => v.status === 'low');
    const highVolume = volume.filter(v => v.status === 'high');

    if (highVolume.length > 0) {
        const parts = highVolume.map(v => formatBodyPart(v.bodyPart)).join(', ');
        insights.push({
            type: 'volume-high',
            severity: 'warning',
            icon: 'fa-exclamation-triangle',
            message: `${parts} volume is very high over the last 7 days. Consider reducing to aid recovery.`,
        });
    }

    if (lowVolume.length > 0) {
        const top = lowVolume[0];
        insights.push({
            type: 'volume-low',
            severity: 'info',
            icon: 'fa-chart-bar',
            message: `${formatBodyPart(top.bodyPart)} volume is low — ${top.weeklySets} set${top.weeklySets === 1 ? '' : 's'} in the last 7 days. ${top.recommendation}`,
        });
    }

    // 3. Plateau detection — same stall ladder as the workout card.
    const plateaus = inDeload ? [] : detectPlateaus(allWorkouts);
    if (plateaus.length > 0) {
        const top = plateaus[0];
        insights.push({
            type: 'plateau',
            severity: 'info',
            icon: 'fa-equals',
            message: `${top.exercise} has been at ${top.weight} ${currentDisplayUnit()} for ${top.sessions} sessions — ${top.suggestion.charAt(0).toLowerCase()}${top.suggestion.slice(1)}.`,
            exerciseName: top.exercise,
            suggestion: top.suggestion,
            sessions: top.sessions,
        });
    }

    // 4. Positive trends (good vibes)
    const trends = detectPositiveTrends(allWorkouts);
    if (trends.length > 0) {
        const top = trends[0];
        insights.push({
            type: 'trend',
            severity: 'success',
            icon: 'fa-arrow-trend-up',
            message: `${top.exercise} up ${top.gain} lbs over your last ${top.sessions} sessions.`,
        });
    }

    // Return top 3, prioritized by severity
    const severityOrder = { warning: 0, info: 1, success: 2 };
    insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return insights.slice(0, 3);
}

/**
 * Get the single most actionable insight for the dashboard hero view.
 * Returns only ONE insight with action-oriented text.
 *
 * @param {Array} recentWorkouts - Workouts from last 2 weeks
 * @param {Array} allWorkouts - Workouts from last 6-8 weeks
 * @param {Array} exerciseDatabase - Exercise library
 * @returns {Object|null} Top insight or null
 */
export function getTopInsight(recentWorkouts, allWorkouts, exerciseDatabase, options = {}) {
    const all = getTopInsights(recentWorkouts, allWorkouts, exerciseDatabase, options);
    if (all.length === 0) return null;

    const insight = all[0];

    // Rewrite messages to be actionable (suggestion, not observation)
    const actionableMessages = {
        'deload': `Take a lighter week — you've trained hard for ${insight.message.match(/(\d+) weeks/)?.[1] || 'several'} weeks straight. Cut volume 40–50%.`,
        'volume-high': `Ease up on ${insight.message.match(/^(.+?) volume/)?.[1] || 'that muscle group'} this week to aid recovery.`,
        'volume-low': insight.message, // Already has recommendation text
        'plateau': `${insight.suggestion || 'Hold the weight and chase a rep'} on ${insight.exerciseName || 'that exercise'} — it's been flat for ${insight.sessions || 'a few'} sessions.`,
        'trend': insight.message, // Positive trends are already good
    };

    return {
        ...insight,
        message: actionableMessages[insight.type] || insight.message,
    };
}

// ===================================================================
// DATA LOADING HELPERS
// ===================================================================

/**
 * Load workouts for insights analysis.
 * Returns { recentWorkouts (1 week), allWorkouts (8 weeks) }.
 */
export async function loadInsightsData(workoutsIn = null) {
    if (!AppState.currentUser) return { recentWorkouts: [], allWorkouts: [] };

    try {
        const { db, collection, query, where, orderBy, getDocs } = await import('../data/firebase-config.js');
        const { getDateString } = await import('../utils/date-helpers.js');

        const now = new Date();

        // 1 week ago
        const oneWeekAgo = new Date(now);
        oneWeekAgo.setDate(now.getDate() - 7);
        const oneWeekStr = getDateString(oneWeekAgo);

        // 8 weeks ago
        const eightWeeksAgo = new Date(now);
        eightWeeksAgo.setDate(now.getDate() - 56);
        const eightWeeksStr = getDateString(eightWeeksAgo);

        // Prefer the caller's already-loaded list (the dashboard's shared
        // cache) over a fresh range query — see calculateStreaks.
        let records;
        if (Array.isArray(workoutsIn)) {
            records = workoutsIn.filter((w) => w && w.date >= eightWeeksStr);
        } else {
            const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
            const q = query(
                workoutsRef,
                where('date', '>=', eightWeeksStr),
                orderBy('date', 'desc')
            );
            const snapshot = await getDocs(q);
            records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        }
        const allWorkouts = [];
        const recentWorkouts = [];

        records.forEach((data) => {

            // Only completed, non-cancelled workouts
            if (!data.completedAt || data.cancelledAt) return;

            allWorkouts.push(data);

            if (data.date >= oneWeekStr) {
                recentWorkouts.push(data);
            }
        });

        return { recentWorkouts, allWorkouts };
    } catch (error) {
        console.error('Error loading insights data:', error);
        return { recentWorkouts: [], allWorkouts: [] };
    }
}

// ===================================================================
// EXPORTS
// ===================================================================

export const TrainingInsights = {
    analyzeWeeklyVolume,
    averageWeeklyVolume,
    detectPlateaus,
    checkDeloadNeeded,
    analyzeFrequency,
    detectPositiveTrends,
    getTopInsights,
    getTopInsight,
    loadInsightsData,
};
