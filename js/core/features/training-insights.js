// Training Insights Module - core/features/training-insights.js
// Rules engine for real-time training analysis (no API cost)
// Phase 17.2 — runs on dashboard load using local data only

import { AppState } from '../utils/app-state.js';
import { Config, debugLog } from '../utils/config.js';

// ===================================================================
// BODY PART MAPPING
// ===================================================================

/**
 * Map exercise name to body part using the exercise database.
 * Falls back to keyword matching if not found in database.
 */
function getBodyPartForExercise(exerciseName, exerciseDatabase) {
    if (!exerciseName) return null;

    // Check database first
    if (exerciseDatabase && exerciseDatabase.length > 0) {
        const match = exerciseDatabase.find(
            ex => (ex.name || ex.machine || '').toLowerCase() === exerciseName.toLowerCase()
        );
        if (match && match.bodyPart) return match.bodyPart;
    }

    // Keyword fallback
    const name = exerciseName.toLowerCase();
    if (name.includes('bench') || name.includes('chest') || name.includes('fly') || name.includes('pec')) return 'Chest';
    if (name.includes('row') || name.includes('pull') || name.includes('lat') || name.includes('back')) return 'Back';
    if (name.includes('shoulder') || name.includes('press') || name.includes('delt') || name.includes('lateral raise')) return 'Shoulders';
    if (name.includes('squat') || name.includes('leg') || name.includes('lunge') || name.includes('hamstring') || name.includes('quad') || name.includes('calf')) return 'Legs';
    if (name.includes('bicep') || name.includes('curl') || name.includes('tricep') || name.includes('arm') || name.includes('extension')) return 'Arms';
    if (name.includes('core') || name.includes('ab') || name.includes('crunch') || name.includes('plank')) return 'Core';
    if (name.includes('deadlift')) return 'Back';
    if (name.includes('glute') || name.includes('hip thrust')) return 'Glutes';

    return null;
}

// ===================================================================
// WEEKLY VOLUME ANALYSIS
// ===================================================================

/**
 * Calculate weekly volume (working sets) per muscle group from recent workouts.
 * Compare against evidence-based landmarks:
 * - Minimum Effective Volume (MEV): ~6-8 sets/muscle/week
 * - Maximum Recoverable Volume (MRV): ~15-25 sets/muscle/week
 * - Sweet spot for most: 10-20 sets/muscle/week
 *
 * @param {Array} workouts - Recent completed workouts (1 week)
 * @param {Array} exerciseDatabase - Exercise library with bodyPart fields
 * @returns {Array} Volume analysis per body part
 */
export function analyzeWeeklyVolume(workouts, exerciseDatabase) {
    const volumeByPart = {};

    for (const workout of workouts) {
        if (!workout.exercises) continue;

        for (const exercise of Object.values(workout.exercises)) {
            const bodyPart = exercise.bodyPart || getBodyPartForExercise(exercise.name, exerciseDatabase);
            if (!bodyPart) continue;

            const completedSets = (exercise.sets || []).filter(s =>
                s.completed !== false && (s.type || 'working') !== 'warmup'
            ).length;

            volumeByPart[bodyPart] = (volumeByPart[bodyPart] || 0) + completedSets;
        }
    }

    return Object.entries(volumeByPart).map(([part, sets]) => ({
        bodyPart: part,
        weeklySets: sets,
        status: sets < Config.VOLUME_MEV ? 'low' : sets > Config.VOLUME_MRV ? 'high' : 'good',
        recommendation: sets < Config.VOLUME_MEV
            ? `Add ${Config.VOLUME_MEV - sets} more sets of ${part} this week`
            : sets > Config.VOLUME_MRV
                ? `Consider reducing ${part} volume to aid recovery`
                : null,
    }));
}

// ===================================================================
// PLATEAU DETECTION
// ===================================================================

/**
 * Detect exercises where the user has plateaued (no weight increase
 * over the last N sessions).
 *
 * @param {Array} workouts - Recent completed workouts (multi-week)
 * @param {number} minSessions - Minimum sessions needed to detect plateau
 * @returns {Array} Plateaued exercises
 */
export function detectPlateaus(workouts, minSessions = Config.PLATEAU_MIN_SESSIONS) {
    // Build per-exercise session history (most recent first)
    const exerciseHistory = {};

    for (const workout of workouts) {
        if (!workout.exercises || !workout.date) continue;

        for (const exercise of Object.values(workout.exercises)) {
            const name = exercise.name;
            if (!name) continue;

            const workingSets = (exercise.sets || []).filter(s =>
                s.completed !== false && s.weight && (s.type || 'working') !== 'warmup'
            );
            if (workingSets.length === 0) continue;

            if (!exerciseHistory[name]) exerciseHistory[name] = [];
            exerciseHistory[name].push({
                date: workout.date,
                maxWeight: Math.max(...workingSets.map(s => s.weight)),
                maxReps: Math.max(...workingSets.map(s => s.reps || 0)),
                equipment: exercise.equipment,
            });
        }
    }

    const plateaus = [];

    for (const [exerciseName, sessions] of Object.entries(exerciseHistory)) {
        // Sort by date descending
        sessions.sort((a, b) => b.date.localeCompare(a.date));

        if (sessions.length < minSessions) continue;

        const recent = sessions.slice(0, minSessions);
        const maxWeights = recent.map(s => s.maxWeight);
        const isFlat = maxWeights.every(w => w === maxWeights[0]);

        if (isFlat && maxWeights[0] > 0) {
            // Also check reps — if reps are increasing, not a true plateau
            const maxReps = recent.map(s => s.maxReps);
            const repsIncreasing = maxReps[0] > maxReps[maxReps.length - 1];

            if (!repsIncreasing) {
                plateaus.push({
                    exercise: exerciseName,
                    weight: maxWeights[0],
                    sessions: minSessions,
                    equipment: recent[0].equipment,
                    suggestion: 'Try adding 5 lbs or an extra rep per set',
                });
            }
        }
    }

    return plateaus;
}

// ===================================================================
// DELOAD DETECTION
// ===================================================================

/**
 * If user has trained 5+ days/week for 4+ consecutive weeks,
 * suggest a deload week.
 *
 * @param {Array} workouts - Recent completed workouts (6+ weeks)
 * @returns {{ needed: boolean, consecutiveHardWeeks: number } | null}
 */
export function checkDeloadNeeded(workouts) {
    if (!workouts || workouts.length === 0) return null;

    // Group workouts by ISO week
    const weekMap = {};

    for (const workout of workouts) {
        if (!workout.date) continue;
        const weekKey = getISOWeekKey(workout.date);
        if (!weekMap[weekKey]) weekMap[weekKey] = new Set();
        weekMap[weekKey].add(workout.date);
    }

    // Sort weeks newest first
    const sortedWeeks = Object.entries(weekMap)
        .sort((a, b) => b[0].localeCompare(a[0]));

    // Count consecutive weeks with 5+ unique workout days
    let consecutiveHardWeeks = 0;
    for (const [, days] of sortedWeeks) {
        if (days.size >= Config.DELOAD_DAYS_PER_WEEK) {
            consecutiveHardWeeks++;
        } else {
            break;
        }
    }

    return {
        needed: consecutiveHardWeeks >= Config.DELOAD_CONSECUTIVE_WEEKS,
        consecutiveHardWeeks,
    };
}

/**
 * Get ISO week key (YYYY-WXX) for a date string.
 */
function getISOWeekKey(dateStr) {
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    // ISO week calculation
    const temp = new Date(d.valueOf());
    const dayNum = (d.getDay() + 6) % 7;
    temp.setDate(temp.getDate() - dayNum + 3);
    const firstThursday = temp.valueOf();
    temp.setMonth(0, 1);
    if (temp.getDay() !== 4) {
        temp.setMonth(0, 1 + ((4 - temp.getDay()) + 7) % 7);
    }
    const weekNum = 1 + Math.ceil((firstThursday - temp) / 604800000);
    return `${temp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
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

        for (const exercise of Object.values(workout.exercises)) {
            const bodyPart = exercise.bodyPart || getBodyPartForExercise(exercise.name, exerciseDatabase);
            if (!bodyPart) continue;

            if (!bodyPartWeeks[bodyPart]) bodyPartWeeks[bodyPart] = {};
            if (!bodyPartWeeks[bodyPart][weekKey]) bodyPartWeeks[bodyPart][weekKey] = 0;
            bodyPartWeeks[bodyPart][weekKey]++;
        }
    }

    return Object.entries(bodyPartWeeks).map(([part, weekData]) => {
        const weekCount = Object.keys(weekData).length;
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

    for (const workout of workouts) {
        if (!workout.exercises || !workout.date) continue;

        for (const exercise of Object.values(workout.exercises)) {
            const name = exercise.name;
            if (!name) continue;

            const workingSets = (exercise.sets || []).filter(s =>
                s.completed !== false && s.weight && (s.type || 'working') !== 'warmup'
            );
            if (workingSets.length === 0) continue;

            if (!exerciseHistory[name]) exerciseHistory[name] = [];
            exerciseHistory[name].push({
                date: workout.date,
                maxWeight: Math.max(...workingSets.map(s => s.weight)),
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
 * @param {Array} recentWorkouts - Workouts from last 2 weeks (for volume)
 * @param {Array} allWorkouts - Workouts from last 6-8 weeks (for plateaus, deload, frequency)
 * @param {Array} exerciseDatabase - Exercise library
 * @returns {Array} Top insights with type, severity, and message
 */
export function getTopInsights(recentWorkouts, allWorkouts, exerciseDatabase) {
    const insights = [];

    // Need minimum data to produce insights
    if (!recentWorkouts || recentWorkouts.length < Config.INSIGHTS_MIN_WORKOUTS) {
        return insights;
    }

    // 1. Deload check (highest priority — health/recovery)
    const deload = checkDeloadNeeded(allWorkouts);
    if (deload && deload.needed) {
        insights.push({
            type: 'deload',
            severity: 'warning',
            icon: 'fa-bed',
            message: `You've trained hard for ${deload.consecutiveHardWeeks} weeks straight. Consider a deload week — reduce volume 40-50%.`,
        });
    }

    // 2. Volume warnings (low volume)
    const volume = analyzeWeeklyVolume(recentWorkouts, exerciseDatabase);
    const lowVolume = volume.filter(v => v.status === 'low');
    const highVolume = volume.filter(v => v.status === 'high');

    if (highVolume.length > 0) {
        const parts = highVolume.map(v => v.bodyPart).join(', ');
        insights.push({
            type: 'volume-high',
            severity: 'warning',
            icon: 'fa-exclamation-triangle',
            message: `${parts} volume is very high this week. Consider reducing to aid recovery.`,
        });
    }

    if (lowVolume.length > 0) {
        const top = lowVolume[0];
        insights.push({
            type: 'volume-low',
            severity: 'info',
            icon: 'fa-chart-bar',
            message: `${top.bodyPart} volume is low this week (${top.weeklySets} sets). ${top.recommendation}`,
        });
    }

    // 3. Plateau detection
    const plateaus = detectPlateaus(allWorkouts);
    if (plateaus.length > 0) {
        const top = plateaus[0];
        insights.push({
            type: 'plateau',
            severity: 'info',
            icon: 'fa-equals',
            message: `${top.exercise} has been flat at ${top.weight} lbs for ${top.sessions} sessions. ${top.suggestion}`,
            exerciseName: top.exercise,
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
            message: `${top.exercise} is up ${top.gain} lbs over your last ${top.sessions} sessions. Keep it up!`,
        });
    }

    // Return top 3, prioritized by severity
    const severityOrder = { warning: 0, info: 1, success: 2 };
    insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return insights.slice(0, 3);
}

// ===================================================================
// DATA LOADING HELPERS
// ===================================================================

/**
 * Load workouts for insights analysis.
 * Returns { recentWorkouts (1 week), allWorkouts (8 weeks) }.
 */
export async function loadInsightsData() {
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

        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const q = query(
            workoutsRef,
            where('date', '>=', eightWeeksStr),
            orderBy('date', 'desc')
        );

        const snapshot = await getDocs(q);
        const allWorkouts = [];
        const recentWorkouts = [];

        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };

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
    detectPlateaus,
    checkDeloadNeeded,
    analyzeFrequency,
    detectPositiveTrends,
    getTopInsights,
    loadInsightsData,
};
