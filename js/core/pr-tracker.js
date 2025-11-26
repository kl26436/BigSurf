// PR Tracking Module - core/pr-tracker.js
// Tracks personal records with equipment-specific and location-aware tracking

import { AppState } from './app-state.js';
import { db, doc, setDoc, getDoc } from './firebase-config.js';
import { showNotification } from './ui-helpers.js';

// ===================================================================
// PR TRACKING STATE
// ===================================================================

/**
 * PR Data Structure (stored in Firebase per user):
 * {
 *   exercisePRs: {
 *     "Bench Press": {
 *       "Barbell": {
 *         maxWeight: { weight: 225, reps: 5, date: "2025-01-20", location: "Gym A" },
 *         maxReps: { weight: 185, reps: 15, date: "2025-01-18", location: "Gym A" },
 *         maxVolume: { weight: 205, reps: 10, volume: 2050, date: "2025-01-19", location: "Gym A" }
 *       },
 *       "Hammer Strength": {
 *         maxWeight: { weight: 200, reps: 8, date: "2025-01-15", location: "Gym B" }
 *       }
 *     }
 *   },
 *   locations: {
 *     "Gym A": { name: "Gym A", lastVisit: "2025-01-20", visitCount: 45 },
 *     "Gym B": { name: "Gym B", lastVisit: "2025-01-15", visitCount: 12 }
 *   },
 *   currentLocation: "Gym A"
 * }
 */

let prData = {
    exercisePRs: {},
    locations: {},
    currentLocation: null
};

// ===================================================================
// FIREBASE OPERATIONS
// ===================================================================

/**
 * Load PR data from Firebase
 */
export async function loadPRData() {
    if (!AppState.currentUser) {
        console.log('⚠️ No user logged in, skipping PR data load');
        return null;
    }

    try {
        const prDocRef = doc(db, 'users', AppState.currentUser.uid, 'stats', 'personalRecords');
        const prDoc = await getDoc(prDocRef);

        if (prDoc.exists()) {
            prData = prDoc.data();
            console.log('✅ PR data loaded:', Object.keys(prData.exercisePRs || {}).length, 'exercises tracked');
            return prData;
        } else {
            console.log('📊 No PR data found, starting fresh');
            prData = {
                exercisePRs: {},
                locations: {},
                currentLocation: null
            };
            return prData;
        }
    } catch (error) {
        console.error('❌ Error loading PR data:', error);
        return null;
    }
}

/**
 * Save PR data to Firebase
 */
export async function savePRData() {
    if (!AppState.currentUser) {
        console.warn('⚠️ Cannot save PR data - no user logged in');
        return false;
    }

    try {
        const prDocRef = doc(db, 'users', AppState.currentUser.uid, 'stats', 'personalRecords');
        await setDoc(prDocRef, {
            ...prData,
            lastUpdated: new Date().toISOString()
        });
        console.log('✅ PR data saved successfully');
        return true;
    } catch (error) {
        console.error('❌ Error saving PR data:', error);
        return false;
    }
}

// ===================================================================
// LOCATION MANAGEMENT
// ===================================================================

/**
 * Get current location or prompt user to set one
 */
export function getCurrentLocation() {
    return prData.currentLocation;
}

/**
 * Set current workout location
 */
export async function setCurrentLocation(locationName) {
    if (!locationName) return;

    // Update or create location
    if (!prData.locations[locationName]) {
        prData.locations[locationName] = {
            name: locationName,
            lastVisit: new Date().toISOString(),
            visitCount: 1
        };
        console.log(`🏢 New location added: ${locationName}`);
    } else {
        prData.locations[locationName].lastVisit = new Date().toISOString();
        prData.locations[locationName].visitCount++;
    }

    prData.currentLocation = locationName;
    await savePRData();
    console.log(`📍 Current location set to: ${locationName}`);
}

/**
 * Get list of all saved locations
 */
export function getLocations() {
    return Object.values(prData.locations).sort((a, b) => b.visitCount - a.visitCount);
}

/**
 * Suggest location based on workout history
 */
export function suggestLocation() {
    const locations = getLocations();
    if (locations.length === 0) return null;

    // Return most frequently visited location
    return locations[0].name;
}

// ===================================================================
// PR CALCULATION AND DETECTION
// ===================================================================

/**
 * Calculate volume for a set (reps × weight)
 */
function calculateVolume(reps, weight) {
    return reps * weight;
}

/**
 * Get exercise equipment from exercise library
 */
function getExerciseEquipment(exerciseName) {
    // Look up exercise in exercise database
    const exercise = AppState.exerciseDatabase?.find(ex => ex.name === exerciseName);
    return exercise?.equipment || 'Unknown Equipment';
}

/**
 * Get PRs for a specific exercise and equipment
 */
export function getExercisePRs(exerciseName, equipment = null) {
    if (!equipment) {
        equipment = getExerciseEquipment(exerciseName);
    }

    const exerciseData = prData.exercisePRs[exerciseName];
    if (!exerciseData || !exerciseData[equipment]) {
        return null;
    }

    return exerciseData[equipment];
}

/**
 * Check if a set is a new PR
 * Returns: { isNewPR: boolean, prType: 'maxWeight'|'maxReps'|'maxVolume'|null, previousPR: object|null }
 */
export function checkForNewPR(exerciseName, reps, weight, equipment = null) {
    if (!reps || !weight) return { isNewPR: false, prType: null, previousPR: null };

    if (!equipment) {
        equipment = getExerciseEquipment(exerciseName);
    }

    const currentPRs = getExercisePRs(exerciseName, equipment);
    const volume = calculateVolume(reps, weight);

    let isNewPR = false;
    let prType = null;
    let previousPR = null;

    if (!currentPRs) {
        // First time doing this exercise with this equipment
        return { isNewPR: true, prType: 'first', previousPR: null };
    }

    // Check max weight PR
    if (!currentPRs.maxWeight || weight > currentPRs.maxWeight.weight) {
        isNewPR = true;
        prType = 'maxWeight';
        previousPR = currentPRs.maxWeight;
    }
    // Check max reps PR (at same or higher weight)
    else if (currentPRs.maxReps && weight >= currentPRs.maxReps.weight && reps > currentPRs.maxReps.reps) {
        isNewPR = true;
        prType = 'maxReps';
        previousPR = currentPRs.maxReps;
    }
    // Check max volume PR
    else if (!currentPRs.maxVolume || volume > currentPRs.maxVolume.volume) {
        isNewPR = true;
        prType = 'maxVolume';
        previousPR = currentPRs.maxVolume;
    }

    return { isNewPR, prType, previousPR };
}

/**
 * Record a new PR
 */
export async function recordPR(exerciseName, reps, weight, equipment = null, location = null, date = null) {
    if (!equipment) {
        equipment = getExerciseEquipment(exerciseName);
    }

    if (!location) {
        location = prData.currentLocation || 'Unknown Location';
    }

    const volume = calculateVolume(reps, weight);

    // Use provided date or default to today
    if (!date) {
        date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    }

    // Initialize exercise PRs if needed
    if (!prData.exercisePRs[exerciseName]) {
        prData.exercisePRs[exerciseName] = {};
    }

    if (!prData.exercisePRs[exerciseName][equipment]) {
        prData.exercisePRs[exerciseName][equipment] = {};
    }

    const equipmentPRs = prData.exercisePRs[exerciseName][equipment];

    // Update max weight PR
    if (!equipmentPRs.maxWeight || weight > equipmentPRs.maxWeight.weight) {
        equipmentPRs.maxWeight = { weight, reps, date, location };
        console.log(`🏆 New max weight PR for ${exerciseName} (${equipment}): ${weight} lbs × ${reps}`);
    }

    // Update max reps PR
    if (!equipmentPRs.maxReps || reps > equipmentPRs.maxReps.reps) {
        equipmentPRs.maxReps = { weight, reps, date, location };
        console.log(`🏆 New max reps PR for ${exerciseName} (${equipment}): ${reps} reps @ ${weight} lbs`);
    }

    // Update max volume PR
    if (!equipmentPRs.maxVolume || volume > equipmentPRs.maxVolume.volume) {
        equipmentPRs.maxVolume = { weight, reps, volume, date, location };
        console.log(`🏆 New max volume PR for ${exerciseName} (${equipment}): ${volume} lbs (${reps} × ${weight})`);
    }

    await savePRData();
}

/**
 * Process workout completion and update PRs
 */
export async function processWorkoutForPRs(workoutData) {
    if (!AppState.currentUser || !workoutData.exercises) {
        return;
    }

    console.log('📊 Processing workout for PRs...');
    let newPRCount = 0;

    // Iterate through all exercises in the workout
    for (const exerciseKey in workoutData.exercises) {
        const exerciseData = workoutData.exercises[exerciseKey];
        const exerciseName = workoutData.exerciseNames?.[exerciseKey];

        if (!exerciseName || !exerciseData.sets) continue;

        // Get equipment from original workout template
        const exerciseIndex = exerciseKey.replace('exercise_', '');
        const originalExercise = workoutData.originalWorkout?.exercises?.[exerciseIndex];
        const equipment = originalExercise?.equipment || 'Unknown Equipment';

        // Check each set for PRs
        for (const set of exerciseData.sets) {
            if (!set.reps || !set.weight) continue;

            const prCheck = checkForNewPR(exerciseName, set.reps, set.weight, equipment);

            if (prCheck.isNewPR) {
                await recordPR(exerciseName, set.reps, set.weight, equipment, prData.currentLocation);
                newPRCount++;
            }
        }
    }

    if (newPRCount > 0) {
        showNotification(`🏆 ${newPRCount} new PR${newPRCount > 1 ? 's' : ''} achieved!`, 'success');
    }

    console.log(`✅ PR processing complete. ${newPRCount} new PRs recorded.`);
}

// ===================================================================
// PR DISPLAY HELPERS
// ===================================================================

/**
 * Get formatted PR display for an exercise
 */
export function getPRDisplayText(exerciseName, equipment = null) {
    if (!equipment) {
        equipment = getExerciseEquipment(exerciseName);
    }

    const prs = getExercisePRs(exerciseName, equipment);
    if (!prs) return null;

    const displays = [];

    if (prs.maxWeight) {
        displays.push(`Max Weight: ${prs.maxWeight.weight} lbs × ${prs.maxWeight.reps}`);
    }

    if (prs.maxReps && prs.maxReps !== prs.maxWeight) {
        displays.push(`Max Reps: ${prs.maxReps.reps} @ ${prs.maxReps.weight} lbs`);
    }

    if (prs.maxVolume) {
        displays.push(`Max Volume: ${prs.maxVolume.volume} lbs (${prs.maxVolume.reps} × ${prs.maxVolume.weight})`);
    }

    return displays.join(' | ');
}

/**
 * Get all PRs for display (grouped by exercise and equipment)
 */
export function getAllPRs() {
    const prList = [];

    for (const exerciseName in prData.exercisePRs) {
        const equipmentPRs = prData.exercisePRs[exerciseName];

        for (const equipment in equipmentPRs) {
            const prs = equipmentPRs[equipment];

            prList.push({
                exercise: exerciseName,
                equipment: equipment,
                prs: prs
            });
        }
    }

    return prList;
}

// ===================================================================
// EXPORTS
// ===================================================================

export const PRTracker = {
    loadPRData,
    savePRData,
    getCurrentLocation,
    setCurrentLocation,
    getLocations,
    suggestLocation,
    getExercisePRs,
    checkForNewPR,
    recordPR,
    processWorkoutForPRs,
    getPRDisplayText,
    getAllPRs
};
