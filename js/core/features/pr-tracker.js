// PR Tracking Module - core/pr-tracker.js
// Tracks personal records with equipment-specific and location-aware tracking

import { AppState } from '../utils/app-state.js';
import { db, doc, setDoc, getDoc } from '../data/firebase-config.js';

// ===================================================================
// PR CUTOFF DATE - Only count PRs from this date onwards
// ===================================================================
const PR_CUTOFF_DATE = '2025-07-01';

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
        return null;
    }

    try {
        const prDocRef = doc(db, 'users', AppState.currentUser.uid, 'stats', 'personalRecords');
        const prDoc = await getDoc(prDocRef);

        if (prDoc.exists()) {
            prData = prDoc.data();
            return prData;
        } else {
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
    } else {
        prData.locations[locationName].lastVisit = new Date().toISOString();
        prData.locations[locationName].visitCount++;
    }

    prData.currentLocation = locationName;
    await savePRData();
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
 * Get exercise body part from exercise library
 */
function getExerciseBodyPart(exerciseName) {
    // Look up exercise in exercise database
    const exercise = AppState.exerciseDatabase?.find(ex => ex.name === exerciseName);
    return exercise?.bodyPart || 'Other';
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
export async function recordPR(exerciseName, reps, weight, equipment = null, location = null, date = null, bodyPart = null) {
    if (!equipment) {
        equipment = getExerciseEquipment(exerciseName);
    }

    if (!location) {
        location = prData.currentLocation || 'Unknown Location';
    }

    // Get body part from exercise library if not provided
    if (!bodyPart) {
        bodyPart = getExerciseBodyPart(exerciseName);
    }

    const volume = calculateVolume(reps, weight);

    // Use provided date or default to today
    if (!date) {
        date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    }

    // Check cutoff date - only record PRs from cutoff date onwards
    if (date < PR_CUTOFF_DATE) {
        return; // Don't record PRs before cutoff
    }

    // Initialize exercise PRs if needed
    if (!prData.exercisePRs[exerciseName]) {
        prData.exercisePRs[exerciseName] = {
            bodyPart: bodyPart
        };
    } else {
        // Update body part if it changed
        prData.exercisePRs[exerciseName].bodyPart = bodyPart;
    }

    if (!prData.exercisePRs[exerciseName][equipment]) {
        prData.exercisePRs[exerciseName][equipment] = {};
    }

    const equipmentPRs = prData.exercisePRs[exerciseName][equipment];

    // Update max weight PR
    if (!equipmentPRs.maxWeight || weight > equipmentPRs.maxWeight.weight) {
        equipmentPRs.maxWeight = { weight, reps, date, location };
    }

    // Update max reps PR
    if (!equipmentPRs.maxReps || reps > equipmentPRs.maxReps.reps) {
        equipmentPRs.maxReps = { weight, reps, date, location };
    }

    // Update max volume PR
    if (!equipmentPRs.maxVolume || volume > equipmentPRs.maxVolume.volume) {
        equipmentPRs.maxVolume = { weight, reps, volume, date, location };
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

    // Get the workout date
    const workoutDate = workoutData.date || new Date().toISOString().split('T')[0];

    // Check cutoff date - don't process workouts before cutoff
    if (workoutDate < PR_CUTOFF_DATE) {
        return;
    }

    // Get the workout's saved location (from when the workout was done)
    const workoutLocation = workoutData.location || prData.currentLocation || 'Unknown Location';

    let newPRCount = 0;

    // Iterate through all exercises in the workout
    for (const exerciseKey in workoutData.exercises) {
        const exerciseData = workoutData.exercises[exerciseKey];
        const exerciseName = workoutData.exerciseNames?.[exerciseKey];

        if (!exerciseName || !exerciseData.sets) continue;

        // Get equipment and body part from original workout template
        const exerciseIndex = exerciseKey.replace('exercise_', '');
        const originalExercise = workoutData.originalWorkout?.exercises?.[exerciseIndex];
        const equipment = originalExercise?.equipment || 'Unknown Equipment';
        const bodyPart = originalExercise?.bodyPart || getExerciseBodyPart(exerciseName);

        // Check each set for PRs
        for (const set of exerciseData.sets) {
            if (!set.reps || !set.weight) continue;

            const prCheck = checkForNewPR(exerciseName, set.reps, set.weight, equipment);

            if (prCheck.isNewPR) {
                // Use the workout's location, not the current location
                await recordPR(exerciseName, set.reps, set.weight, equipment, workoutLocation, workoutDate, bodyPart);
                newPRCount++;
            }
        }
    }
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
        const exerciseData = prData.exercisePRs[exerciseName];
        const bodyPart = exerciseData.bodyPart || 'Other';

        for (const equipment in exerciseData) {
            // Skip the bodyPart property
            if (equipment === 'bodyPart') continue;

            const prs = exerciseData[equipment];

            prList.push({
                exercise: exerciseName,
                equipment: equipment,
                bodyPart: bodyPart,
                prs: prs
            });
        }
    }

    return prList;
}

/**
 * Get PRs grouped by body part for the PR browser
 * Returns: { bodyPart: { exerciseName: { equipment: PRs } } }
 */
export function getPRsByBodyPart() {
    const grouped = {};

    for (const exerciseName in prData.exercisePRs) {
        const exerciseData = prData.exercisePRs[exerciseName];
        const bodyPart = exerciseData.bodyPart || 'Other';

        if (!grouped[bodyPart]) {
            grouped[bodyPart] = {};
        }

        if (!grouped[bodyPart][exerciseName]) {
            grouped[bodyPart][exerciseName] = {};
        }

        for (const equipment in exerciseData) {
            // Skip the bodyPart property
            if (equipment === 'bodyPart') continue;

            grouped[bodyPart][exerciseName][equipment] = exerciseData[equipment];
        }
    }

    return grouped;
}

/**
 * Get recent PRs (most recent first, limited count)
 * Only returns maxWeight PRs with 5+ reps for display
 */
export function getRecentPRs(count = 5) {
    const prsWithDates = [];

    for (const exerciseName in prData.exercisePRs) {
        const exerciseData = prData.exercisePRs[exerciseName];
        const bodyPart = exerciseData.bodyPart || 'Other';

        for (const equipment in exerciseData) {
            if (equipment === 'bodyPart') continue;

            const prs = exerciseData[equipment];

            // Only include max weight PRs with 5+ reps
            if (prs.maxWeight && prs.maxWeight.reps >= 5) {
                prsWithDates.push({
                    exercise: exerciseName,
                    equipment: equipment,
                    bodyPart: bodyPart,
                    type: 'maxWeight',
                    weight: prs.maxWeight.weight,
                    reps: prs.maxWeight.reps,
                    date: prs.maxWeight.date,
                    location: prs.maxWeight.location
                });
            }
        }
    }

    // Sort by date descending
    prsWithDates.sort((a, b) => b.date.localeCompare(a.date));

    return prsWithDates.slice(0, count);
}

/**
 * Get total PR count
 */
export function getTotalPRCount() {
    let count = 0;

    for (const exerciseName in prData.exercisePRs) {
        const exerciseData = prData.exercisePRs[exerciseName];

        for (const equipment in exerciseData) {
            if (equipment === 'bodyPart') continue;
            count++;
        }
    }

    return count;
}

/**
 * Clear all PRs (for fresh start)
 */
export async function clearAllPRs() {
    prData.exercisePRs = {};
    await savePRData();
}

/**
 * Rebuild all PRs from workout history
 * This reprocesses all workouts to fix incorrect dates/locations
 */
export async function rebuildPRsFromHistory() {
    if (!AppState.currentUser) {
        console.error('❌ Cannot rebuild PRs - no user logged in');
        return { success: false, error: 'Not logged in' };
    }

    try {
        // Clear existing PRs
        prData.exercisePRs = {};

        // Load all workouts from Firebase
        const { collection, getDocs, query, orderBy } = await import('../data/firebase-config.js');
        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        const workoutsQuery = query(workoutsRef, orderBy('date', 'asc'));
        const snapshot = await getDocs(workoutsQuery);

        let processedCount = 0;
        let prCount = 0;

        for (const docSnap of snapshot.docs) {
            const workoutData = docSnap.data();

            // Skip cancelled or incomplete workouts
            if (!workoutData.completedAt || workoutData.cancelledAt) continue;

            // Skip workouts before cutoff date
            const workoutDate = workoutData.date;
            if (!workoutDate || workoutDate < PR_CUTOFF_DATE) continue;

            // Get the workout's location
            const workoutLocation = workoutData.location || 'Unknown Location';

            // Process each exercise
            if (workoutData.exercises && workoutData.exerciseNames) {
                for (const exerciseKey in workoutData.exercises) {
                    const exerciseData = workoutData.exercises[exerciseKey];
                    const exerciseName = workoutData.exerciseNames[exerciseKey];

                    if (!exerciseName || !exerciseData.sets) continue;

                    // Get equipment from original workout
                    const exerciseIndex = exerciseKey.replace('exercise_', '');
                    const originalExercise = workoutData.originalWorkout?.exercises?.[exerciseIndex];
                    const equipment = originalExercise?.equipment || 'Unknown Equipment';
                    const bodyPart = originalExercise?.bodyPart || getExerciseBodyPart(exerciseName);

                    // Process each set
                    for (const set of exerciseData.sets) {
                        if (!set.reps || !set.weight) continue;

                        // Record PR with correct date and location
                        await recordPR(exerciseName, set.reps, set.weight, equipment, workoutLocation, workoutDate, bodyPart);
                        prCount++;
                    }
                }
            }
            processedCount++;
        }

        await savePRData();
        return { success: true, workoutsProcessed: processedCount, setsProcessed: prCount };
    } catch (error) {
        console.error('❌ Error rebuilding PRs:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get the cutoff date
 */
export function getPRCutoffDate() {
    return PR_CUTOFF_DATE;
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
    getAllPRs,
    getPRsByBodyPart,
    getRecentPRs,
    getTotalPRCount,
    clearAllPRs,
    rebuildPRsFromHistory,
    getPRCutoffDate
};
