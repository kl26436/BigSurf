// Streak Tracking Module - core/streak-tracker.js
// Tracks workout streaks and frequency stats

import { AppState } from './app-state.js';
import { db, doc, setDoc, getDoc, collection, getDocs, query, where } from './firebase-config.js';

// ===================================================================
// STREAK CALCULATION
// ===================================================================

/**
 * Calculate streaks from workout history
 * Returns: { currentStreak, longestStreak, totalWorkouts, workoutsThisWeek, workoutsThisMonth }
 */
export async function calculateStreaks() {
    if (!AppState.currentUser) {
        console.log('⚠️ No user logged in');
        return null;
    }

    try {
        // Get all completed workouts
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const snapshot = await getDocs(workoutsRef);

        // Extract and sort workout dates
        const workoutDates = [];
        for (const doc of snapshot.docs) {
            const workout = doc.data();
            if (workout.completedAt) {
                workoutDates.push(doc.id); // doc.id is YYYY-MM-DD format
            }
        }

        // Sort dates chronologically
        workoutDates.sort();

        if (workoutDates.length === 0) {
            return {
                currentStreak: 0,
                longestStreak: 0,
                totalWorkouts: 0,
                workoutsThisWeek: 0,
                workoutsThisMonth: 0,
                lastWorkoutDate: null
            };
        }

        // Calculate current streak (consecutive days with workouts)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 1;
        let lastDate = null;

        // Work backwards from today to find current streak
        for (let i = workoutDates.length - 1; i >= 0; i--) {
            const workoutDate = new Date(workoutDates[i]);
            workoutDate.setHours(0, 0, 0, 0);

            if (i === workoutDates.length - 1) {
                // Check if last workout was today or yesterday
                const daysDiff = Math.floor((today - workoutDate) / (1000 * 60 * 60 * 24));
                if (daysDiff <= 1) {
                    currentStreak = 1;
                    lastDate = workoutDate;
                } else {
                    break; // Streak is broken
                }
            } else {
                const prevDate = new Date(workoutDates[i + 1]);
                prevDate.setHours(0, 0, 0, 0);
                const daysDiff = Math.floor((prevDate - workoutDate) / (1000 * 60 * 60 * 24));

                if (daysDiff === 1) {
                    currentStreak++;
                } else if (daysDiff === 0) {
                    // Same day, multiple workouts - don't increment streak
                    continue;
                } else {
                    break; // Gap in streak
                }
            }
        }

        // Calculate longest streak
        for (let i = 0; i < workoutDates.length; i++) {
            if (i === 0) {
                tempStreak = 1;
            } else {
                const currentDate = new Date(workoutDates[i]);
                const prevDate = new Date(workoutDates[i - 1]);
                currentDate.setHours(0, 0, 0, 0);
                prevDate.setHours(0, 0, 0, 0);

                const daysDiff = Math.floor((currentDate - prevDate) / (1000 * 60 * 60 * 24));

                if (daysDiff === 1) {
                    tempStreak++;
                } else if (daysDiff === 0) {
                    // Same day - continue streak
                    continue;
                } else {
                    longestStreak = Math.max(longestStreak, tempStreak);
                    tempStreak = 1;
                }
            }
        }
        longestStreak = Math.max(longestStreak, tempStreak);

        // Calculate workouts this week
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];
        const workoutsThisWeek = workoutDates.filter(date => date >= weekAgoStr).length;

        // Calculate workouts this month
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthStartStr = monthStart.toISOString().split('T')[0];
        const workoutsThisMonth = workoutDates.filter(date => date >= monthStartStr).length;

        const stats = {
            currentStreak,
            longestStreak,
            totalWorkouts: workoutDates.length,
            workoutsThisWeek,
            workoutsThisMonth,
            lastWorkoutDate: workoutDates[workoutDates.length - 1]
        };

        console.log('📊 Streak stats:', stats);
        return stats;

    } catch (error) {
        console.error('❌ Error calculating streaks:', error);
        return null;
    }
}

/**
 * Get workout frequency by day of week
 * Returns array: [{ day: 'Monday', count: 5 }, ...]
 */
export async function getWorkoutFrequencyByDay() {
    if (!AppState.currentUser) {
        return [];
    }

    try {
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const snapshot = await getDocs(workoutsRef);

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayCounts = [0, 0, 0, 0, 0, 0, 0];

        for (const doc of snapshot.docs) {
            const workout = doc.data();
            if (workout.completedAt) {
                const date = new Date(doc.id);
                const dayIndex = date.getDay();
                dayCounts[dayIndex]++;
            }
        }

        return dayNames.map((day, index) => ({
            day,
            count: dayCounts[index]
        }));

    } catch (error) {
        console.error('❌ Error calculating frequency:', error);
        return [];
    }
}

/**
 * Get workout frequency by month (last 12 months)
 */
export async function getWorkoutFrequencyByMonth() {
    if (!AppState.currentUser) {
        return [];
    }

    try {
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const snapshot = await getDocs(workoutsRef);

        const monthCounts = {};
        const today = new Date();

        // Initialize last 12 months
        for (let i = 11; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthCounts[key] = 0;
        }

        for (const doc of snapshot.docs) {
            const workout = doc.data();
            if (workout.completedAt) {
                const date = new Date(doc.id);
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (monthCounts.hasOwnProperty(key)) {
                    monthCounts[key]++;
                }
            }
        }

        return Object.entries(monthCounts).map(([month, count]) => ({
            month,
            count
        }));

    } catch (error) {
        console.error('❌ Error calculating monthly frequency:', error);
        return [];
    }
}

// ===================================================================
// EXPORTS
// ===================================================================

export const StreakTracker = {
    calculateStreaks,
    getWorkoutFrequencyByDay,
    getWorkoutFrequencyByMonth
};
