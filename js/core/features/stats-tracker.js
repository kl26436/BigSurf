// Stats Tracker Module - core/stats-tracker.js
// Calculates workout statistics and streaks

import { AppState } from '../utils/app-state.js';
import { db, collection, query, where, getDocs, orderBy, limit } from '../data/firebase-config.js';

// ===================================================================
// WORKOUT STREAK CALCULATION
// ===================================================================

/**
 * Calculate current workout streak (consecutive days)
 * @returns {Promise<number>} Number of consecutive days with workouts
 */
export async function calculateWorkoutStreak() {
    if (!AppState.currentUser) return 0;

    try {
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const q = query(
            workoutsRef,
            where('completedAt', '!=', null),
            orderBy('completedAt', 'desc'),
            limit(100) // Look back at last 100 workouts
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) return 0;

        const workouts = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            workouts.push({
                date: doc.id, // Document ID is the date (YYYY-MM-DD)
                completedAt: data.completedAt
            });
        });

        // Sort by date descending
        workouts.sort((a, b) => b.date.localeCompare(a.date));

        // Check if today has a workout
        const today = AppState.getTodayDateString();
        let streak = 0;
        let currentDate = today;

        for (const workout of workouts) {
            if (workout.date === currentDate) {
                streak++;
                // Move to previous day
                const date = new Date(currentDate);
                date.setDate(date.getDate() - 1);
                currentDate = date.toISOString().split('T')[0];
            } else {
                // Check if we should continue from yesterday
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];

                if (streak === 0 && workout.date === yesterdayStr) {
                    // Start streak from yesterday if no workout today
                    streak++;
                    const date = new Date(yesterdayStr);
                    date.setDate(date.getDate() - 1);
                    currentDate = date.toISOString().split('T')[0];
                } else {
                    // Streak broken
                    break;
                }
            }
        }

        return streak;
    } catch (error) {
        console.error('Error calculating workout streak:', error);
        return 0;
    }
}

// ===================================================================
// WORKOUT COUNTS
// ===================================================================

/**
 * Get workout count for a date range
 * @param {Date} startDate - Start of range
 * @param {Date} endDate - End of range
 * @returns {Promise<number>} Number of completed workouts
 */
export async function getWorkoutCount(startDate, endDate) {
    if (!AppState.currentUser) return 0;

    try {
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const q = query(
            workoutsRef,
            where('completedAt', '!=', null),
            where('completedAt', '>=', startDate.toISOString()),
            where('completedAt', '<=', endDate.toISOString())
        );

        const snapshot = await getDocs(q);
        return snapshot.size;
    } catch (error) {
        console.error('Error getting workout count:', error);
        return 0;
    }
}

/**
 * Get workouts this week
 */
export async function getWorkoutsThisWeek() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek); // Go to Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    endOfWeek.setHours(23, 59, 59, 999);

    return await getWorkoutCount(startOfWeek, endOfWeek);
}

/**
 * Get workouts this month
 */
export async function getWorkoutsThisMonth() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    return await getWorkoutCount(startOfMonth, endOfMonth);
}

// ===================================================================
// RECENT WORKOUTS
// ===================================================================

/**
 * Get recent completed workouts
 * @param {number} count - Number of workouts to retrieve
 * @returns {Promise<Array>} Array of recent workout data
 */
export async function getRecentWorkouts(count = 3) {
    if (!AppState.currentUser) return [];

    try {
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const q = query(
            workoutsRef,
            where('completedAt', '!=', null),
            orderBy('completedAt', 'desc'),
            limit(count)
        );

        const snapshot = await getDocs(q);
        const workouts = [];

        snapshot.forEach(doc => {
            workouts.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return workouts;
    } catch (error) {
        console.error('Error getting recent workouts:', error);
        return [];
    }
}

/**
 * Get last completed workout
 * @returns {Promise<Object|null>} Last workout data or null
 */
export async function getLastWorkout() {
    const workouts = await getRecentWorkouts(1);
    return workouts.length > 0 ? workouts[0] : null;
}

// ===================================================================
// WEEKLY STATS (Sets, Exercises, Minutes)
// ===================================================================

/**
 * Get detailed stats for this week
 * @returns {Promise<{sets: number, exercises: number, minutes: number, workouts: Array}>}
 */
export async function getWeeklyStats() {
    if (!AppState.currentUser) return { sets: 0, exercises: 0, minutes: 0, workouts: [], uniqueDays: 0 };

    try {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfWeekStr = startOfWeek.toISOString().split('T')[0]; // YYYY-MM-DD

        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        // Query by date field (when workout occurred), not completedAt (when it was saved)
        // This ensures edited historical workouts count on their actual date
        const q = query(
            workoutsRef,
            where('date', '>=', startOfWeekStr),
            orderBy('date', 'desc')
        );

        const snapshot = await getDocs(q);
        const workouts = [];
        const workoutDays = new Set(); // Track unique days
        let totalSets = 0;
        let totalExercises = 0;
        let totalMinutes = 0;

        snapshot.forEach(doc => {
            const data = doc.data();

            // Skip workouts without completedAt (not finished)
            if (!data.completedAt) return;

            // Skip cancelled workouts
            if (data.cancelledAt) return;

            // Count completed sets for this workout (for stats, not for counting days)
            let workoutSets = 0;
            let workoutExercises = 0;

            if (data.exercises) {
                workoutExercises = Object.keys(data.exercises).length;

                Object.values(data.exercises).forEach(exercise => {
                    if (exercise.sets && Array.isArray(exercise.sets)) {
                        workoutSets += exercise.sets.filter(s => s.reps && s.weight).length;
                    }
                });
            }

            // Add to workouts list (any completed workout counts)
            workouts.push({
                id: doc.id,
                ...data
            });

            // Track unique workout days (use date string for deduplication)
            if (data.date) {
                workoutDays.add(data.date);
            }

            totalSets += workoutSets;
            totalExercises += workoutExercises;

            // Calculate duration
            if (data.totalDuration) {
                totalMinutes += Math.floor(data.totalDuration / 60);
            }
        });

        return {
            sets: totalSets,
            exercises: totalExercises,
            minutes: totalMinutes,
            workouts,
            uniqueDays: workoutDays.size // Count of unique days with workouts
        };
    } catch (error) {
        console.error('❌ Error getting weekly stats:', error);
        return { sets: 0, exercises: 0, minutes: 0, workouts: [], uniqueDays: 0 };
    }
}

// ===================================================================
// RECENT PRS (Max Weight with 5+ reps only)
// ===================================================================

/**
 * Get recent PRs achieved - only max weight PRs with 5+ reps
 * @param {number} count - Number of PRs to retrieve
 * @returns {Array} Array of recent PRs
 */
export async function getRecentPRs(count = 5) {
    const { PRTracker } = await import('./pr-tracker.js');
    const allPRs = PRTracker.getAllPRs();

    // Flatten PRs - only include maxWeight PRs with 5+ reps
    const prsWithDates = [];

    for (const prGroup of allPRs) {
        const { exercise, equipment, prs } = prGroup;

        // Only include max weight PRs with 5+ reps
        if (prs.maxWeight && prs.maxWeight.reps >= 5) {
            prsWithDates.push({
                exercise,
                equipment,
                type: 'maxWeight',
                label: 'PR',
                value: `${prs.maxWeight.weight} lbs × ${prs.maxWeight.reps}`,
                weight: prs.maxWeight.weight,
                reps: prs.maxWeight.reps,
                date: prs.maxWeight.date,
                location: prs.maxWeight.location
            });
        }
    }

    // Sort by date descending
    prsWithDates.sort((a, b) => b.date.localeCompare(a.date));

    // Return top N
    return prsWithDates.slice(0, count);
}

// ===================================================================
// EXPORTS
// ===================================================================

export const StatsTracker = {
    calculateWorkoutStreak,
    getWorkoutsThisWeek,
    getWorkoutsThisMonth,
    getRecentWorkouts,
    getLastWorkout,
    getRecentPRs,
    getWeeklyStats
};
