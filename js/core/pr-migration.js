// PR Migration Utility - one-time script to process old workouts
// Run this in console: window.migrateOldWorkoutsToPRs()

import { AppState } from './app-state.js';
import { db, collection, getDocs } from './firebase-config.js';
import { PRTracker } from './pr-tracker.js';

/**
 * Migrate old completed workouts to PR system
 * This processes all past workouts and extracts PRs from them
 */
export async function migrateOldWorkoutsToPRs() {
    if (!AppState.currentUser) {
        console.error('❌ No user logged in');
        return;
    }

    console.log('🔄 Starting PR migration for old workouts...');

    try {
        // Get all workouts
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const snapshot = await getDocs(workoutsRef);

        let processedCount = 0;
        let prCount = 0;

        for (const doc of snapshot.docs) {
            const workout = doc.data();

            // Only process completed workouts
            if (!workout.completedAt || !workout.exercises) {
                continue;
            }

            console.log(`📊 Processing workout: ${workout.workoutType} (${doc.id})`);

            // Process each exercise
            for (const exerciseKey in workout.exercises) {
                const exerciseData = workout.exercises[exerciseKey];
                const exerciseName = workout.exerciseNames?.[exerciseKey];

                if (!exerciseName || !exerciseData.sets) continue;

                // Get equipment from original workout template
                const exerciseIndex = exerciseKey.replace('exercise_', '');
                const originalExercise = workout.originalWorkout?.exercises?.[exerciseIndex];
                const equipment = originalExercise?.equipment || 'Unknown Equipment';

                // Process each set
                for (const set of exerciseData.sets) {
                    if (!set.reps || !set.weight) continue;

                    const prCheck = PRTracker.checkForNewPR(
                        exerciseName,
                        set.reps,
                        set.weight,
                        equipment
                    );

                    if (prCheck.isNewPR) {
                        // Use the workout date (doc.id is YYYY-MM-DD format)
                        await PRTracker.recordPR(
                            exerciseName,
                            set.reps,
                            set.weight,
                            equipment,
                            workout.location || 'Unknown Location',
                            doc.id // Pass the workout date
                        );
                        prCount++;
                    }
                }
            }

            processedCount++;
        }

        console.log(`✅ Migration complete!`);
        console.log(`   Processed ${processedCount} workouts`);
        console.log(`   Found ${prCount} personal records`);

        alert(`PR Migration Complete!\n\nProcessed: ${processedCount} workouts\nFound: ${prCount} PRs`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        alert('Migration failed. Check console for details.');
    }
}

// Make available in console
window.migrateOldWorkoutsToPRs = migrateOldWorkoutsToPRs;

//export { migrateOldWorkoutsToPRs };
