// Exercise Progress Module - core/features/exercise-progress.js
// Aggregates workout history by exercise + equipment for progress charts

import { AppState } from '../utils/app-state.js';
import { db, collection, query, where, getDocs, orderBy } from '../data/firebase-config.js';
import { getDateString } from '../utils/date-helpers.js';

// ===================================================================
// DATA STRUCTURES
// ===================================================================

/**
 * Progress data structure:
 * {
 *   "Bench Press|Hammer Strength Flat": {
 *     exercise: "Bench Press",
 *     equipment: "Hammer Strength Flat",
 *     bodyPart: "Chest",
 *     sessions: [
 *       { date: "2025-01-15", maxWeight: 185, maxReps: 8, totalVolume: 5400, location: "Gym A" },
 *       { date: "2025-01-18", maxWeight: 190, maxReps: 6, totalVolume: 4800, location: "Gym A" }
 *     ]
 *   }
 * }
 */

let progressCache = null;
let lastCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ===================================================================
// MAIN DATA LOADING
// ===================================================================

/**
 * Load all workout history and aggregate by exercise + equipment
 * @param {boolean} forceRefresh - Force reload from Firebase
 * @returns {Promise<Object>} Progress data by exercise+equipment key
 */
export async function loadExerciseProgress(forceRefresh = false) {
    // Return cached data if fresh
    if (!forceRefresh && progressCache && lastCacheTime && Date.now() - lastCacheTime < CACHE_DURATION) {
        return progressCache;
    }

    if (!AppState.currentUser) {
        return {};
    }

    try {
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const q = query(workoutsRef, where('completedAt', '!=', null), orderBy('completedAt', 'asc'));

        const snapshot = await getDocs(q);
        const progressData = {};

        snapshot.forEach((doc) => {
            const workout = doc.data();

            // Skip cancelled workouts
            if (workout.cancelledAt) return;

            const workoutDate = workout.date || getDateString(workout.completedAt);
            const location = workout.location || 'Unknown';

            if (!workout.exercises || !workout.exerciseNames) return;

            // Process each exercise in the workout
            for (const exerciseKey in workout.exercises) {
                const exerciseData = workout.exercises[exerciseKey];
                const exerciseName = workout.exerciseNames[exerciseKey];

                if (!exerciseName || !exerciseData.sets) continue;

                // Get equipment from original workout template
                const exerciseIndex = exerciseKey.replace('exercise_', '');
                const originalExercise = workout.originalWorkout?.exercises?.[exerciseIndex];
                const equipment = originalExercise?.equipment || exerciseData.equipment || 'Unknown';

                // Try multiple sources for bodyPart:
                // 1. Original workout template
                // 2. Exercise data directly
                // 3. Exercise database lookup by name
                // 4. Default to 'Other'
                let bodyPart = originalExercise?.bodyPart || exerciseData.bodyPart;
                if (!bodyPart && AppState.exerciseDatabase) {
                    const dbExercise = AppState.exerciseDatabase.find(
                        (ex) => ex.name?.toLowerCase() === exerciseName?.toLowerCase()
                    );
                    bodyPart = dbExercise?.bodyPart;
                }
                if (!bodyPart) bodyPart = 'Other';

                // Create unique key for exercise + equipment
                const key = `${exerciseName}|${equipment}`;

                // Initialize if first time seeing this combo
                if (!progressData[key]) {
                    progressData[key] = {
                        exercise: exerciseName,
                        equipment: equipment,
                        bodyPart: bodyPart,
                        sessions: [],
                    };
                }

                // Calculate session stats from sets
                let maxWeight = 0;
                let maxReps = 0;
                let totalVolume = 0;
                let bestSet = null;

                for (const set of exerciseData.sets) {
                    if (!set.reps || !set.weight) continue;

                    const volume = set.reps * set.weight;
                    totalVolume += volume;

                    // Track max weight (primary metric for strength)
                    if (set.weight > maxWeight) {
                        maxWeight = set.weight;
                        maxReps = set.reps;
                        bestSet = { weight: set.weight, reps: set.reps };
                    }
                }

                // Only add session if we have valid data
                if (maxWeight > 0) {
                    progressData[key].sessions.push({
                        date: workoutDate,
                        maxWeight,
                        maxReps,
                        totalVolume,
                        location,
                        bestSet,
                    });
                }
            }
        });

        // Sort sessions by date for each exercise
        for (const key in progressData) {
            progressData[key].sessions.sort((a, b) => a.date.localeCompare(b.date));
        }

        // Cache the results
        progressCache = progressData;
        lastCacheTime = Date.now();

        return progressData;
    } catch (error) {
        console.error('❌ Error loading exercise progress:', error);
        return {};
    }
}

// ===================================================================
// DATA ACCESSORS
// ===================================================================

/**
 * Map body part to training category (Push/Pull/Legs/Other)
 */
function getTrainingCategory(bodyPart) {
    if (!bodyPart) return 'Other';
    const bp = bodyPart.toLowerCase();

    // Push muscles
    if (bp.includes('chest') || bp.includes('shoulder') || bp.includes('tricep')) {
        return 'Push';
    }
    // Pull muscles
    if (bp.includes('back') || bp.includes('bicep') || bp.includes('rear delt')) {
        return 'Pull';
    }
    // Legs
    if (
        bp.includes('leg') ||
        bp.includes('quad') ||
        bp.includes('hamstring') ||
        bp.includes('glute') ||
        bp.includes('calf') ||
        bp.includes('lower')
    ) {
        return 'Legs';
    }
    // Core/Cardio
    if (bp.includes('core') || bp.includes('ab') || bp.includes('cardio')) {
        return 'Core';
    }
    return 'Other';
}

/**
 * Get list of all exercise + equipment combinations
 * @returns {Promise<Array>} Array of { key, exercise, equipment, bodyPart, category, sessionCount }
 */
export async function getExerciseList() {
    const progress = await loadExerciseProgress();

    const list = Object.entries(progress).map(([key, data]) => ({
        key,
        exercise: data.exercise,
        equipment: data.equipment,
        bodyPart: data.bodyPart,
        category: getTrainingCategory(data.bodyPart),
        sessionCount: data.sessions.length,
        latestDate: data.sessions[data.sessions.length - 1]?.date || null,
    }));

    // Sort by most recent first, then by session count
    list.sort((a, b) => {
        if (b.latestDate && a.latestDate) {
            return b.latestDate.localeCompare(a.latestDate);
        }
        return b.sessionCount - a.sessionCount;
    });

    return list;
}

/**
 * Get hierarchical exercise structure: Category > Exercise > Equipment
 * @returns {Promise<Object>} { category: { exercise: [{ key, equipment, sessionCount }] } }
 */
export async function getExerciseHierarchy() {
    const list = await getExerciseList();
    const hierarchy = {};

    // Category order for display
    const categoryOrder = ['Push', 'Pull', 'Legs', 'Core', 'Other'];

    for (const item of list) {
        const category = item.category || 'Other';
        const exercise = item.exercise;

        if (!hierarchy[category]) {
            hierarchy[category] = {};
        }

        if (!hierarchy[category][exercise]) {
            hierarchy[category][exercise] = [];
        }

        hierarchy[category][exercise].push({
            key: item.key,
            equipment: item.equipment,
            bodyPart: item.bodyPart,
            sessionCount: item.sessionCount,
            latestDate: item.latestDate,
        });
    }

    // Sort equipment within each exercise by session count
    for (const category in hierarchy) {
        for (const exercise in hierarchy[category]) {
            hierarchy[category][exercise].sort((a, b) => b.sessionCount - a.sessionCount);
        }
    }

    // Return ordered by category
    const ordered = {};
    for (const cat of categoryOrder) {
        if (hierarchy[cat] && Object.keys(hierarchy[cat]).length > 0) {
            ordered[cat] = hierarchy[cat];
        }
    }

    return ordered;
}

/**
 * Get progress data for a specific exercise + equipment
 * @param {string} key - The exercise|equipment key
 * @param {string} timeRange - '1M', '3M', '6M', '1Y', 'ALL'
 * @returns {Promise<Object>} Filtered progress data with stats
 */
export async function getExerciseProgressData(key, timeRange = 'ALL') {
    const progress = await loadExerciseProgress();
    const data = progress[key];

    if (!data) return null;

    // Filter sessions by time range
    const cutoffDate = getDateCutoff(timeRange);
    const filteredSessions = cutoffDate ? data.sessions.filter((s) => s.date >= cutoffDate) : data.sessions;

    if (filteredSessions.length === 0) {
        return {
            ...data,
            sessions: [],
            stats: null,
        };
    }

    // Calculate stats
    const firstSession = filteredSessions[0];
    const lastSession = filteredSessions[filteredSessions.length - 1];
    const allWeights = filteredSessions.map((s) => s.maxWeight);
    const maxWeight = Math.max(...allWeights);
    const minWeight = Math.min(...allWeights);

    // Find PR session
    const prSession = filteredSessions.find((s) => s.maxWeight === maxWeight);

    // Calculate improvement
    const startWeight = firstSession.maxWeight;
    const currentWeight = lastSession.maxWeight;
    const improvement = currentWeight - startWeight;
    const improvementPercent = startWeight > 0 ? ((improvement / startWeight) * 100).toFixed(1) : 0;

    // Calculate trend
    const trend = calculateTrend(filteredSessions.map((s) => ({ date: s.date, value: s.maxWeight })));

    return {
        exercise: data.exercise,
        equipment: data.equipment,
        bodyPart: data.bodyPart,
        sessions: filteredSessions,
        stats: {
            sessionCount: filteredSessions.length,
            startWeight,
            currentWeight,
            maxWeight,
            minWeight,
            improvement,
            improvementPercent,
            trend,
            prDate: prSession?.date,
            prReps: prSession?.maxReps,
            firstDate: firstSession.date,
            lastDate: lastSession.date,
        },
    };
}

/**
 * Calculate trend direction by comparing first half vs second half averages
 */
function calculateTrend(dataPoints) {
    if (!dataPoints || dataPoints.length < 3) return 'flat';
    const values = dataPoints.map((p) => p.value);
    const midpoint = Math.floor(values.length / 2);
    const avgFirst = values.slice(0, midpoint).reduce((s, v) => s + v, 0) / midpoint;
    const avgSecond = values.slice(midpoint).reduce((s, v) => s + v, 0) / (values.length - midpoint);
    const changePercent = ((avgSecond - avgFirst) / avgFirst) * 100;
    if (changePercent > 2) return 'up';
    if (changePercent < -2) return 'down';
    return 'flat';
}

/**
 * Estimate 1RM using Epley formula: 1RM = weight * (1 + reps/30)
 */
function estimate1RM(weight, reps) {
    if (!weight || weight <= 0 || !reps || reps <= 0) return 0;
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Get chart-ready data for an exercise
 * @param {string} key - The exercise|equipment key
 * @param {string} timeRange - Time range filter
 * @param {string} chartType - 'weight', 'volume', or '1rm'
 * @returns {Promise<Object>} { labels: [], data: [], tooltips: [] }
 */
export async function getChartData(key, timeRange = 'ALL', chartType = 'weight') {
    const progressData = await getExerciseProgressData(key, timeRange);

    if (!progressData || progressData.sessions.length === 0) {
        return { labels: [], data: [], tooltips: [] };
    }

    const labels = progressData.sessions.map((s) => formatDateShort(s.date));

    let data;
    let tooltips;

    switch (chartType) {
        case 'volume':
            data = progressData.sessions.map((s) => s.totalVolume);
            tooltips = progressData.sessions.map((s) => ({
                date: s.date,
                volume: s.totalVolume,
                weight: s.maxWeight,
                reps: s.maxReps,
                location: s.location,
            }));
            break;
        case '1rm':
            data = progressData.sessions.map((s) => estimate1RM(s.maxWeight, s.maxReps));
            tooltips = progressData.sessions.map((s) => ({
                date: s.date,
                estimated1RM: estimate1RM(s.maxWeight, s.maxReps),
                weight: s.maxWeight,
                reps: s.maxReps,
                location: s.location,
            }));
            break;
        default: // 'weight'
            data = progressData.sessions.map((s) => s.maxWeight);
            tooltips = progressData.sessions.map((s) => ({
                date: s.date,
                weight: s.maxWeight,
                reps: s.maxReps,
                location: s.location,
            }));
            break;
    }

    return { labels, data, tooltips, stats: progressData.stats, chartType };
}

/**
 * Get weekly volume data for bar chart (last 12 weeks)
 * @returns {Promise<Object>} { labels: [], data: [], maxVolume: number }
 */
export async function getWeeklyVolumeData(timeRange = '3M') {
    const progress = await loadExerciseProgress();
    const today = new Date();

    // Number of weeks based on time range
    const weekCounts = { '1M': 5, '3M': 12, '6M': 26, '1Y': 52 };
    let numWeeks = weekCounts[timeRange] || 12;

    // For ALL, derive week count from earliest session date
    if (timeRange === 'ALL') {
        let earliest = getDateString(today);
        for (const key in progress) {
            for (const session of progress[key].sessions) {
                if (session.date < earliest) earliest = session.date;
            }
        }
        const diffMs = today - new Date(earliest);
        numWeeks = Math.max(Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)), 12);
    }

    // Build weeks of data
    const weeks = [];
    for (let i = numWeeks - 1; i >= 0; i--) {
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() - (i * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);

        weeks.push({
            startDate: getDateString(weekStart),
            endDate: getDateString(weekEnd),
            label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            volume: 0,
        });
    }

    // Sum volume into each week bucket
    for (const key in progress) {
        for (const session of progress[key].sessions) {
            for (const week of weeks) {
                if (session.date >= week.startDate && session.date <= week.endDate) {
                    week.volume += session.totalVolume || 0;
                    break;
                }
            }
        }
    }

    return {
        labels: weeks.map((w) => w.label),
        data: weeks.map((w) => w.volume),
        maxVolume: Math.max(...weeks.map((w) => w.volume), 0),
    };
}

/**
 * Get exercises grouped by body part
 * @returns {Promise<Object>} { bodyPart: [exercises] }
 */
export async function getExercisesByBodyPart() {
    const list = await getExerciseList();
    const grouped = {};

    for (const item of list) {
        const bodyPart = item.bodyPart || 'Other';
        if (!grouped[bodyPart]) {
            grouped[bodyPart] = [];
        }
        grouped[bodyPart].push(item);
    }

    return grouped;
}

// ===================================================================
// HELPERS
// ===================================================================

/**
 * Get date cutoff based on time range
 */
function getDateCutoff(timeRange) {
    const now = new Date();
    let cutoff = null;

    switch (timeRange) {
        case '1M':
            cutoff = new Date(now.setMonth(now.getMonth() - 1));
            break;
        case '3M':
            cutoff = new Date(now.setMonth(now.getMonth() - 3));
            break;
        case '6M':
            cutoff = new Date(now.setMonth(now.getMonth() - 6));
            break;
        case '1Y':
            cutoff = new Date(now.setFullYear(now.getFullYear() - 1));
            break;
        case 'ALL':
        default:
            return null;
    }

    return getDateString(cutoff);
}

/**
 * Format date for chart labels
 */
function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Clear cache (call after workout completion)
 */
export function clearProgressCache() {
    progressCache = null;
    lastCacheTime = null;
}

// ===================================================================
// BODY PART DISTRIBUTION
// ===================================================================

/**
 * Get volume distribution by body part for donut chart
 * @param {string} timeRange - Time range filter
 * @returns {Promise<Object>} { labels: [], data: [], colors: [], total: number }
 */
export async function getBodyPartDistribution(timeRange = '3M') {
    const progress = await loadExerciseProgress();
    const cutoffDate = getDateCutoff(timeRange);

    const bodyPartVolume = {};

    for (const key in progress) {
        const data = progress[key];
        const bodyPart = data.bodyPart || 'Other';

        for (const session of data.sessions) {
            // Filter by time range
            if (cutoffDate && session.date < cutoffDate) continue;

            if (!bodyPartVolume[bodyPart]) {
                bodyPartVolume[bodyPart] = 0;
            }
            bodyPartVolume[bodyPart] += session.totalVolume || 0;
        }
    }

    // Sort by volume descending
    const sorted = Object.entries(bodyPartVolume).sort((a, b) => b[1] - a[1]);

    // Color palette matching app theme
    const colors = [
        '#1dd3b0', // Primary teal
        '#5856d6', // Purple
        '#ff9500', // Orange
        '#ff6b6b', // Red/coral
        '#4cd964', // Green
        '#007aff', // Blue
        '#ffcc00', // Yellow
        '#8e8e93', // Gray
    ];

    const total = sorted.reduce((sum, [_, vol]) => sum + vol, 0);

    return {
        labels: sorted.map(([bp]) => bp),
        data: sorted.map(([_, vol]) => vol),
        percentages: sorted.map(([_, vol]) => (total > 0 ? Math.round((vol / total) * 100) : 0)),
        colors: sorted.map((_, i) => colors[i % colors.length]),
        total,
    };
}

// ===================================================================
// CONSISTENCY HEAT MAP CALENDAR
// ===================================================================

/**
 * Get workout data for heat map calendar
 * @param {string} timeRange - Time range filter (1M/3M/6M/1Y/ALL)
 * @returns {Promise<Object>} { weeks: [[{date, intensity, sets}]] }
 */
export async function getHeatMapData(timeRange = '3M') {
    if (!AppState.currentUser) return { weeks: [], maxSets: 0 };

    try {
        const today = new Date();
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');

        let q;
        if (timeRange === 'ALL') {
            q = query(workoutsRef, orderBy('date', 'asc'));
        } else {
            const dayLookback = { '1M': 35, '3M': 84, '6M': 182, '1Y': 364 };
            const days = dayLookback[timeRange] || 84;
            const startDate = new Date(today);
            startDate.setDate(startDate.getDate() - days);
            q = query(workoutsRef, where('date', '>=', getDateString(startDate)), orderBy('date', 'asc'));
        }

        const snapshot = await getDocs(q);

        // Build date -> sets map
        const dateData = {};
        let maxSets = 0;

        snapshot.forEach((doc) => {
            const workout = doc.data();
            if (!workout.completedAt || workout.cancelledAt) return;

            const date = workout.date;
            if (!dateData[date]) {
                dateData[date] = { sets: 0, workouts: 0 };
            }

            // Count sets
            if (workout.exercises) {
                for (const ex of Object.values(workout.exercises)) {
                    if (ex.sets) {
                        dateData[date].sets += ex.sets.filter((s) => s.reps && s.weight).length;
                    }
                }
            }
            dateData[date].workouts++;

            if (dateData[date].sets > maxSets) {
                maxSets = dateData[date].sets;
            }
        });

        // Build weeks array (Sun-Sat)
        const weeks = [];
        let currentWeek = [];

        // Determine grid start: earliest workout date for ALL, or computed lookback
        const dates = Object.keys(dateData).sort();
        const gridStart = dates.length > 0 && timeRange === 'ALL'
            ? new Date(dates[0])
            : (() => { const dayLookback = { '1M': 35, '3M': 84, '6M': 182, '1Y': 364 }; const d = new Date(today); d.setDate(d.getDate() - (dayLookback[timeRange] || 84)); return d; })();

        // Start from Sunday of start week
        const startSunday = new Date(gridStart);
        startSunday.setDate(startSunday.getDate() - startSunday.getDay());

        for (let d = new Date(startSunday); d <= today; d.setDate(d.getDate() + 1)) {
            const dateStr = getDateString(d);
            const dayData = dateData[dateStr] || { sets: 0, workouts: 0 };

            // Calculate intensity (0-4 scale)
            let intensity = 0;
            if (dayData.sets > 0) {
                if (dayData.sets >= maxSets * 0.75) intensity = 4;
                else if (dayData.sets >= maxSets * 0.5) intensity = 3;
                else if (dayData.sets >= maxSets * 0.25) intensity = 2;
                else intensity = 1;
            }

            currentWeek.push({
                date: dateStr,
                day: d.getDay(),
                sets: dayData.sets,
                workouts: dayData.workouts,
                intensity,
                isToday: dateStr === getDateString(today),
                isFuture: d > today,
            });

            // Start new week on Saturday
            if (d.getDay() === 6) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
        }

        // Add remaining days
        if (currentWeek.length > 0) {
            weeks.push(currentWeek);
        }

        return { weeks, maxSets };
    } catch (error) {
        console.error('Error getting heat map data:', error);
        return { weeks: [], maxSets: 0 };
    }
}

// ===================================================================
// PR TIMELINE
// ===================================================================

/**
 * Get PR timeline data for milestone view
 * @param {number} limit - Max PRs to return
 * @returns {Promise<Array>} Array of PRs sorted by date
 */
export async function getPRTimeline(limit = 10, timeRange = '3M') {
    const { PRTracker } = await import('./pr-tracker.js');
    const allPRs = PRTracker.getAllPRs();
    const cutoffDate = getDateCutoff(timeRange);

    const timeline = [];

    for (const prGroup of allPRs) {
        const { exercise, equipment, bodyPart, prs } = prGroup;

        // Only include max weight PRs with 5+ reps (significant PRs)
        if (prs.maxWeight && prs.maxWeight.reps >= 5) {
            // Filter by time range
            if (cutoffDate && prs.maxWeight.date < cutoffDate) continue;

            timeline.push({
                exercise,
                equipment,
                bodyPart: bodyPart || 'Other',
                weight: prs.maxWeight.weight,
                reps: prs.maxWeight.reps,
                date: prs.maxWeight.date,
                location: prs.maxWeight.location,
            });
        }
    }

    // Sort by date descending (most recent first)
    timeline.sort((a, b) => b.date.localeCompare(a.date));

    return timeline.slice(0, limit);
}

// ===================================================================
// EXPORTS
// ===================================================================

export const ExerciseProgress = {
    loadExerciseProgress,
    getExerciseList,
    getExerciseHierarchy,
    getExerciseProgressData,
    getChartData,
    getExercisesByBodyPart,
    clearProgressCache,
    getBodyPartDistribution,
    getHeatMapData,
    getPRTimeline,
    getWeeklyVolumeData,
};
