// One-time fix to normalize exercises in Firebase templates
// Run this once to convert object format to array format

import { AppState } from './app-state.js';
import { db, collection, getDocs, doc, setDoc } from '../data/firebase-config.js';

/**
 * Normalize exercises from object to array format in all templates
 * Run this once: window.fixTemplateExercises()
 */
export async function fixTemplateExercises() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return;
    }

    try {
        console.log('🔧 Starting template exercises normalization...');

        let fixedCount = 0;

        // Fix global default templates
        console.log('📋 Checking global templates in /workouts collection...');
        const globalRef = collection(db, "workouts");
        const globalSnapshot = await getDocs(globalRef);

        for (const docSnapshot of globalSnapshot.docs) {
            const data = docSnapshot.data();

            if (data.exercises && !Array.isArray(data.exercises)) {
                console.log(`  Fixing global template: ${docSnapshot.id}`);

                // Convert object to array
                const keys = Object.keys(data.exercises).sort();
                const exercisesArray = keys.map(key => data.exercises[key]).filter(ex => ex);

                // Update in Firebase
                const docRef = doc(db, "workouts", docSnapshot.id);
                await setDoc(docRef, {
                    ...data,
                    exercises: exercisesArray
                });

                fixedCount++;
                console.log(`    ✅ Converted ${keys.length} exercises to array format`);
            }
        }

        // Fix user custom templates
        console.log('📋 Checking user templates...');
        const userRef = collection(db, "users", AppState.currentUser.uid, "workoutTemplates");
        const userSnapshot = await getDocs(userRef);

        for (const docSnapshot of userSnapshot.docs) {
            const data = docSnapshot.data();

            if (data.exercises && !Array.isArray(data.exercises)) {
                console.log(`  Fixing user template: ${docSnapshot.id}`);

                // Convert object to array
                const keys = Object.keys(data.exercises).sort();
                const exercisesArray = keys.map(key => data.exercises[key]).filter(ex => ex);

                // Update in Firebase
                const docRef = doc(db, "users", AppState.currentUser.uid, "workoutTemplates", docSnapshot.id);
                await setDoc(docRef, {
                    ...data,
                    exercises: exercisesArray
                });

                fixedCount++;
                console.log(`    ✅ Converted ${keys.length} exercises to array format`);
            }
        }

        console.log(`✅ Fixed ${fixedCount} templates`);

        // Reload templates
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();

        console.log('✅ Templates reloaded. Please refresh the page.');

        return { fixedCount };

    } catch (error) {
        console.error('❌ Error fixing template exercises:', error);
        throw error;
    }
}

// Make it available globally for console access
window.fixTemplateExercises = fixTemplateExercises;
