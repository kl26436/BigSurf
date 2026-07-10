// Enhanced Data Manager - core/data-manager.js
// Schema v3.0: Multiple workouts per day support
// - Old schema: document ID = date (YYYY-MM-DD), one workout per day
// - New schema: document ID = unique ID, date stored as field, multiple workouts per day
import {
    db,
    doc,
    setDoc,
    getDoc,
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    where,
    deleteDoc,
    writeBatch,
    updateDoc,
} from './firebase-config.js';
import { showNotification, convertWeight, escapeHtml } from '../ui/ui-helpers.js';
import { validateWorkoutData } from '../utils/validation.js';
import { getDateString } from '../utils/date-helpers.js';
import { confidentEquipmentId } from './equipment-id-resolver.js';
import { AppState } from '../utils/app-state.js';
import { Config } from '../utils/config.js';

/**
 * Wrap a promise with a timeout — rejects if it doesn't resolve within ms
 */
function withTimeout(promise, ms = Config.FIREBASE_TIMEOUT_MS) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Operation timed out')), ms)),
    ]);
}

/**
 * Retry a function with exponential backoff.
 * @param {function} fn - Async function to retry
 * @param {number} maxRetries - Max retry attempts (default 2)
 */
async function withRetry(fn, maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
}

/**
 * Generate a unique workout ID
 * Format: {date}_{timestamp}_{random}
 */
export function generateWorkoutId(date) {
    const timestamp = Date.now();
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    const random = Array.from(arr, (b) => b.toString(36).padStart(2, '0'))
        .join('')
        .substring(0, 12);
    return `${date}_${timestamp}_${random}`;
}

export async function saveWorkoutData(state) {
    if (!state.currentUser) return;

    // Ensure proper date handling to prevent timezone issues
    let saveDate = state.savedData.date || state.getTodayDateString();

    saveDate = getDateString(saveDate) || state.getTodayDateString();

    // Validate YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saveDate)) {
        saveDate = state.getTodayDateString();
    }

    state.savedData.date = saveDate;
    state.savedData.exerciseUnits = state.exerciseUnits;

    // CRITICAL: Store exercise names and workout structure for proper history display
    if (state.currentWorkout) {
        const exerciseNames = {};
        state.currentWorkout.exercises.forEach((exercise, index) => {
            exerciseNames[`exercise_${index}`] = exercise.machine || exercise.name;
        });
        state.savedData.exerciseNames = exerciseNames;

        // Store the complete workout structure for reconstruction
        state.savedData.originalWorkout = {
            day: state.currentWorkout.day || state.currentWorkout.name,
            exercises: state.currentWorkout.exercises.map((ex) => ({
                machine: ex.machine || ex.name,
                sets: ex.sets,
                reps: ex.reps,
                weight: ex.weight,
                video: ex.video || '',
                equipment: ex.equipment || null,
                // Carry the stable id — PR processing at completion reads
                // originalExercise.equipmentId; dropping it here made every
                // fresh session id-less and re-split the id-keyed PR store.
                equipmentId: ex.equipmentId || null,
                equipmentLocation: ex.equipmentLocation || null,
                bodyPart: ex.bodyPart || null, // Include bodyPart for progress categorization
            })),
        };

        // Store total exercise count for progress tracking
        state.savedData.totalExercises = state.currentWorkout.exercises.length;
    }

    // Deep-clone so validation + normalization don't mutate AppState in-memory
    const normalizedData = JSON.parse(JSON.stringify(state.savedData));
    if (normalizedData.exercises) {
        // Phase 8b dual-write: stamp a stable equipmentId next to the equipment
        // NAME so the eventual identity migration has ground truth from new
        // workouts onward. Additive — the name stays the source of truth; we only
        // write the id when it resolves confidently (exact/alias) against the
        // warm equipment cache, never on an ambiguous guess.
        const equipCache = state._cachedEquipment || [];
        Object.keys(normalizedData.exercises).forEach((exerciseKey) => {
            const exerciseData = normalizedData.exercises[exerciseKey];
            const exerciseIndex = parseInt(exerciseKey.split('_')[1]);
            const currentUnit = state.exerciseUnits[exerciseIndex] || state.globalUnit;

            if (exerciseData.equipment) {
                // Prefer an explicitly-set id that's still valid (the user's
                // actual pick — two docs can share a name, so re-resolving by
                // name could land on the wrong one). Else resolve by name.
                const existingValid = exerciseData.equipmentId
                    && equipCache.some((e) => e.id === exerciseData.equipmentId);
                if (!existingValid) {
                    const eid = confidentEquipmentId(exerciseData.equipment, equipCache);
                    if (eid) exerciseData.equipmentId = eid;
                    // Only clear a stale id when the cache is WARM and disowns it.
                    // A cold cache (resume + autosave before any equipment screen
                    // loads) must not strip every previously-backfilled id.
                    else if (equipCache.length && exerciseData.equipmentId) {
                        delete exerciseData.equipmentId;
                    }
                }
            }

            if (exerciseData.sets) {
                exerciseData.sets = exerciseData.sets.map((set) => {
                    // Preserve each set's own originalUnit (that's the unit the
                    // value was typed in). Only default it when missing — if we
                    // overwrite, a user who switches the exercise unit mid-
                    // workout would have previously-completed sets silently
                    // re-tagged, causing history to double-convert later.
                    return {
                        ...set,
                        originalUnit: set.originalUnit || currentUnit || 'lbs',
                    };
                });
            }
        });
    }

    try {
        // Schema v3.0: Use unique IDs for documents instead of date
        // Check if we're updating an existing workout (has workoutId) or creating new
        let workoutId = state.savedData.workoutId;

        if (!workoutId) {
            // New workout - generate unique ID
            workoutId = generateWorkoutId(saveDate);
            state.savedData.workoutId = workoutId;
        }

        const docRef = doc(db, 'users', state.currentUser.uid, 'workouts', workoutId);
        const validatedData = validateWorkoutData(normalizedData) || normalizedData;
        const savedDoc = {
            ...validatedData,
            workoutId: workoutId, // Store ID in document for reference
            lastUpdated: new Date().toISOString(),
            version: '3.0', // New schema version
        };
        await withRetry(() => withTimeout(setDoc(docRef, savedDoc)));

        // CRITICAL: Update window.inProgressWorkout so exercise changes persist on resume
        // This ensures added/deleted exercises are retained when closing and reopening workout
        if (window.inProgressWorkout && !state.savedData.completedAt && !state.savedData.cancelledAt) {
            window.inProgressWorkout = {
                ...savedDoc,
                originalWorkout: state.savedData.originalWorkout,
            };
        }

        return true;
    } catch (error) {
        console.error('Error saving workout data:', error);
        showNotification("Couldn't save workout", 'error');
        return false;
    }
}

// Debounced save — collapses rapid set updates into a single Firestore write
let _saveTimeout = null;
export function debouncedSaveWorkoutData(state, delay = 400) {
    clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => saveWorkoutData(state), delay);
}

// Session-level cache for last session defaults
const _lastSessionCache = {};

/**
 * Clear the last-session cache. Call on workout complete or new workout start
 * so the next workout picks up fresh defaults.
 */
export function clearLastSessionCache() {
    for (const key of Object.keys(_lastSessionCache)) {
        delete _lastSessionCache[key];
    }
}

/**
 * Gets the most recent completed workout data for a specific exercise.
 * Matches by exercise name AND equipment to get equipment-specific history.
 * Returns { sets, date } from the last session, or null if no history.
 */
export async function getLastSessionDefaults(exerciseName, equipment = null, location = null) {
    if (!exerciseName) return null;

    const cacheKey = `${exerciseName}__${equipment || ''}__${location || ''}`;
    if (_lastSessionCache[cacheKey] !== undefined) return _lastSessionCache[cacheKey];

    const state = (await import('../utils/app-state.js')).AppState;
    if (!state.currentUser) return null;

    try {
        // Order by the actual workout date (not completedAt) — editing a
        // historical workout rewrites completedAt to "now", which pushes
        // stale edits to the top of this query and can starve out the
        // actually-most-recent session within the limit.
        //
        // Limit is 90 (not 30) because cancelled/junk workout docs share
        // this window: a testing-heavy week (see 2026-07-01..07 with ~20
        // cancelled attempts) can push the actual last-session out of a
        // 30-doc fetch. Server-side filtering on cancelledAt isn't safe
        // without a backfill — legacy completed docs don't have the field,
        // and Firestore `== null` only matches docs where the field exists.
        const workoutsRef = collection(db, 'users', state.currentUser.uid, 'workouts');
        const q = query(workoutsRef, orderBy('date', 'desc'), limit(90));
        const snapshot = await withTimeout(getDocs(q));

        const today = state.getTodayDateString();
        const locLC = (location || '').toLowerCase();

        // Tiered match preference (most → least specific):
        //   1. same exercise + same equipment + same location  → exact
        //   2. same exercise + same equipment (any location)   → equipment-only
        //   3. same exercise + same location (any equipment)   → location-only
        //   4. same exercise (any equipment, any location)     → name-only
        // Equipment-rename / catalog-migration tolerance lives in the
        // name-only fallback so a strict-only search doesn't return null
        // when the user has the history but the equipment string changed.
        let bestExact = null;
        let bestEquipOnly = null;
        let bestLocationOnly = null;
        let bestNameOnly = null;

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (data.date === today) continue;
            if (!data.completedAt || data.cancelledAt) continue;
            if (!data.exercises) continue;

            const wLoc = (typeof data.location === 'object' ? data.location?.name : data.location) || '';
            const locMatches = !!locLC && wLoc.toLowerCase() === locLC;

            for (const [key, exData] of Object.entries(data.exercises)) {
                if (!exData || !exData.sets || exData.sets.length === 0) continue;

                const idx = key.replace('exercise_', '');
                const exName = data.exerciseNames?.[key]
                    || data.originalWorkout?.exercises?.[idx]?.machine
                    || exData.name;

                if (exName !== exerciseName) continue;

                // Equipment fallback: only trust originalWorkout's slot when
                // its NAME still matches the exercise we just matched. If the
                // user swapped the exercise mid-workout (Standing Arm → Shoulder
                // Press), originalWorkout[idx] still holds the ORIGINAL
                // exercise with its original equipment. Without this guard the
                // fallback leaked the wrong equipment back as "last session"
                // for the new exercise — the 6/9 "Shoulder Press loaded with
                // standing arm equipment" report.
                const originalAtIdx = data.originalWorkout?.exercises?.[idx];
                const originalNameMatches = originalAtIdx &&
                    (originalAtIdx.machine || originalAtIdx.name) === exerciseName;
                const exEquipment = exData.equipment
                    || (originalNameMatches ? originalAtIdx?.equipment : null)
                    || null;
                const equipMatches = !!equipment && !!exEquipment && equipment === exEquipment;

                const result = {
                    sets: exData.sets.filter(s => s && (s.reps || s.weight)),
                    date: data.date,
                    // Surface the source equipment so the active-workout card
                    // can show "from <equipment>" when this is a fallback
                    // (different equipment than the user's current selection).
                    equipment: exEquipment,
                    location: wLoc || null,
                };

                if (equipMatches && locMatches && !bestExact) {
                    bestExact = result;
                    // Best possible — short-circuit.
                    _lastSessionCache[cacheKey] = bestExact;
                    return bestExact;
                }
                if (equipMatches && !bestEquipOnly) bestEquipOnly = result;
                if (locMatches && !bestLocationOnly) bestLocationOnly = result;
                if (!bestNameOnly) bestNameOnly = result;
            }
        }

        const finalResult = bestExact || bestEquipOnly || bestLocationOnly || bestNameOnly || null;
        _lastSessionCache[cacheKey] = finalResult;
        return finalResult;
    } catch (error) {
        console.error('Error loading last session defaults:', error);
        return null;
    }
}

export async function loadTodaysWorkout(state) {
    if (!state.currentUser) return null;

    const today = state.getTodayDateString();
    try {
        // Schema v3.0: Query by date field instead of document ID
        // This finds incomplete workouts for today
        const workoutsRef = collection(db, 'users', state.currentUser.uid, 'workouts');
        const q = query(workoutsRef, where('date', '==', today));
        const snapshot = await withTimeout(getDocs(q));

        let incompleteWorkout = null;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // Find an incomplete workout for today
            if (data.workoutType && data.workoutType !== 'none' && !data.completedAt && !data.cancelledAt) {
                // Add document ID for reference
                incompleteWorkout = { ...data, docId: docSnap.id };
            }
        });

        return incompleteWorkout;
    } catch (error) {
        console.error("Error loading today's workout:", error);
        if (error.message === 'Operation timed out') {
            showNotification('Loading timed out — check your connection', 'error');
        }
        return null;
    }
}

/**
 * Load all workouts for a specific date (supports multiple workouts per day)
 * @param {Object} state - AppState
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Array} - Array of workout data objects (empty if none found)
 */
export async function loadWorkoutsByDate(state, dateStr) {
    if (!state.currentUser) return [];

    try {
        const workouts = [];

        // Schema v3.0: Query by date field
        const workoutsRef = collection(db, 'users', state.currentUser.uid, 'workouts');
        const q = query(workoutsRef, where('date', '==', dateStr));
        const snapshot = await withTimeout(getDocs(q));

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            workouts.push({ ...data, docId: docSnap.id });
        });

        // Sort by startedAt (most recent first) if available
        workouts.sort((a, b) => {
            const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
            const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
            return timeB - timeA;
        });

        return workouts;
    } catch (error) {
        console.error('Error loading workouts by date:', error);
        if (error.message === 'Operation timed out') {
            showNotification('Loading timed out — check your connection', 'error');
        }
        return [];
    }
}

/**
 * Load a single workout by specific date (legacy function for backwards compatibility)
 * Returns the first/most recent workout for that date
 * @param {Object} state - AppState
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Object|null} - Workout data or null if not found
 */
export async function loadWorkoutByDate(state, dateStr) {
    const workouts = await loadWorkoutsByDate(state, dateStr);
    return workouts.length > 0 ? workouts[0] : null;
}

/**
 * Load a workout by its unique document ID
 * @param {Object} state - AppState
 * @param {string} workoutId - The unique workout document ID
 * @returns {Object|null} - Workout data or null if not found
 */
export async function loadWorkoutById(state, workoutId) {
    if (!state.currentUser || !workoutId) return null;

    try {
        const docRef = doc(db, 'users', state.currentUser.uid, 'workouts', workoutId);
        const docSnap = await withTimeout(getDoc(docRef));

        if (docSnap.exists()) {
            return { ...docSnap.data(), docId: docSnap.id };
        }
        return null;
    } catch (error) {
        console.error('Error loading workout by ID:', error);
        if (error.message === 'Operation timed out') {
            showNotification('Loading timed out — check your connection', 'error');
        }
        return null;
    }
}

/**
 * Patch fields on a historical workout document.
 * Used by the inline-edit flow — single seam so callers don't reach into
 * Firestore directly. Wraps updateDoc with retry and invalidates the
 * all-workouts cache so dashboard aggregations re-read fresh data.
 * @param {Object} state - AppState
 * @param {string} workoutId - Document ID
 * @param {Object} patch - Fields to merge
 */
export async function updateHistoricalWorkout(state, workoutId, patch) {
    if (!state.currentUser || !workoutId) {
        throw new Error('updateHistoricalWorkout: missing user or workoutId');
    }
    const docRef = doc(db, 'users', state.currentUser.uid, 'workouts', workoutId);
    await withRetry(() => withTimeout(updateDoc(docRef, patch)));
    clearAllWorkoutsCache();
}

/**
 * Delete a workout by its document ID
 * @param {Object} state - AppState
 * @param {string} workoutId - The workout document ID to delete
 * @returns {boolean} - Success status
 */
export async function deleteWorkoutById(state, workoutId) {
    if (!state.currentUser || !workoutId) return false;

    try {
        const docRef = doc(db, 'users', state.currentUser.uid, 'workouts', workoutId);
        await withTimeout(deleteDoc(docRef));
        return true;
    } catch (error) {
        console.error('Error deleting workout:', error);
        if (error.message === 'Operation timed out') {
            showNotification('Delete timed out — check your connection', 'error');
        }
        return false;
    }
}

export async function loadWorkoutPlans(state) {
    try {
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(state);

        const [plans, exercises] = await Promise.all([
            workoutManager.getUserWorkoutTemplates(),
            workoutManager.getExerciseLibrary(),
        ]);
        state.workoutPlans = plans;
        state.exerciseDatabase = exercises;
    } catch (error) {
        console.error('Error loading data from Firebase:', error);
        showNotification('Error loading workout data from Firebase. Using fallback.', 'warning');

        // Fallback to JSON files if Firebase fails
        try {
            const workoutResponse = await fetch('./data/workouts.json');
            if (workoutResponse.ok) {
                state.workoutPlans = await workoutResponse.json();
            } else {
                state.workoutPlans = getDefaultWorkouts();
            }

            const exerciseResponse = await fetch('./data/exercises.json');
            if (exerciseResponse.ok) {
                state.exerciseDatabase = await exerciseResponse.json();
            } else {
                state.exerciseDatabase = getDefaultExercises();
            }
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
            showNotification("Couldn't load workout data — check your connection", 'error');
            state.workoutPlans = getDefaultWorkouts();
            state.exerciseDatabase = getDefaultExercises();
        }
    }
}

// FIXED loadExerciseHistory function for data-manager.js
// Priority: 1) Same exercise + equipment + location, 2) Same exercise + equipment, 3) Same exercise
export async function loadExerciseHistory(exerciseName, exerciseIndex, state) {
    if (!state.currentUser) return;

    const historyDisplay = document.getElementById(`exercise-history-${exerciseIndex}`);
    const historyButton = document.querySelector(
        `button[data-action="loadExerciseHistory"][data-index="${exerciseIndex}"]`
    );

    if (!historyDisplay || !historyButton) return;

    // If already showing, hide it and change button text back
    if (!historyDisplay.classList.contains('hidden')) {
        historyDisplay.classList.add('hidden');
        historyButton.innerHTML = '<i class="fas fa-history"></i> Show Last Workout';
        return;
    }

    // Change button text to indicate it can be hidden
    historyButton.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Last Workout';

    // Get current exercise's equipment and location for matching
    const currentExercise = state.currentWorkout?.exercises?.[exerciseIndex];
    const currentEquipment = currentExercise?.equipment || null;
    const { getSessionLocation } = await import('../features/location-service.js');
    const currentLocation = getSessionLocation() || state.savedData?.location || null;

    try {
        // Query for recent workouts containing this exercise
        const workoutsRef = collection(db, 'users', state.currentUser.uid, 'workouts');
        const q = query(workoutsRef, orderBy('lastUpdated', 'desc'), limit(50)); // Increased limit
        const querySnapshot = await withTimeout(getDocs(q));

        let lastWorkout = null;
        let lastExerciseData = null;
        let workoutDate = null;

        // Find the most recent workout with this exercise (excluding today)
        const today = state.getTodayDateString();
        const allMatches = []; // Collect ALL matches with metadata

        querySnapshot.forEach((doc) => {
            const data = doc.data();

            // Skip today's workout
            if (data.date === today) return;

            // FIX: Search through ALL exercises in the workout for a name match
            // This searches across different workout templates
            let foundExerciseKey = null;

            // Method 1: Check exerciseNames mapping
            if (data.exerciseNames) {
                for (const [key, name] of Object.entries(data.exerciseNames)) {
                    if (name === exerciseName) {
                        foundExerciseKey = key;
                        break;
                    }
                }
            }

            // Method 2: Check originalWorkout exercises if exerciseNames didn't work
            if (!foundExerciseKey && data.originalWorkout && data.originalWorkout.exercises) {
                data.originalWorkout.exercises.forEach((exercise, index) => {
                    if (exercise.machine === exerciseName) {
                        foundExerciseKey = `exercise_${index}`;
                    }
                });
            }

            // Method 3: Search through exercises object directly for machine names
            if (!foundExerciseKey && data.exercises) {
                for (const [key, exerciseData] of Object.entries(data.exercises)) {
                    // Check if this exercise has sets data (meaning it was actually done)
                    if (exerciseData && exerciseData.sets && exerciseData.sets.length > 0) {
                        // Get the corresponding exercise name
                        const idx = key.replace('exercise_', '');
                        const exerciseName_check =
                            data.exerciseNames?.[key] || data.originalWorkout?.exercises?.[idx]?.machine;

                        if (exerciseName_check === exerciseName) {
                            foundExerciseKey = key;
                            break;
                        }
                    }
                }
            }

            // If we found a matching exercise, collect this workout with metadata
            if (foundExerciseKey && data.exercises?.[foundExerciseKey]) {
                const exerciseData = data.exercises[foundExerciseKey];

                // Only use if it has actual set data
                if (exerciseData.sets && exerciseData.sets.length > 0) {
                    // Get equipment and location for this exercise
                    const histEquipment = exerciseData.equipment || null;
                    const histLocation = data.location || null;

                    // Calculate match score:
                    // 3 = same exercise + same equipment + same location (best)
                    // 2 = same exercise + same equipment (different or no location)
                    // 1 = same exercise only (fallback)
                    let matchScore = 1;
                    let matchDescription = 'exercise';

                    if (currentEquipment && histEquipment === currentEquipment) {
                        matchScore = 2;
                        matchDescription = 'exercise + equipment';

                        if (currentLocation && histLocation === currentLocation) {
                            matchScore = 3;
                            matchDescription = 'exercise + equipment + location';
                        }
                    }

                    allMatches.push({
                        workout: data,
                        exerciseData: exerciseData,
                        date: data.date,
                        matchScore: matchScore,
                        matchDescription: matchDescription,
                        equipment: histEquipment,
                        location: histLocation,
                    });
                }
            }
        });

        // Sort matches: first by matchScore (highest first), then by date (most recent first)
        if (allMatches.length > 0) {
            allMatches.sort((a, b) => {
                if (b.matchScore !== a.matchScore) {
                    return b.matchScore - a.matchScore; // Higher score first
                }
                return new Date(b.date) - new Date(a.date); // More recent first
            });

            const bestMatch = allMatches[0];
            lastWorkout = bestMatch.workout;
            lastExerciseData = bestMatch.exerciseData;
            workoutDate = bestMatch.date;
        }

        // Display the results
        if (lastExerciseData && lastExerciseData.sets) {
            const displayDate = new Date(workoutDate + 'T12:00:00').toLocaleDateString('en-US', {
                month: 'numeric',
                day: 'numeric',
                year: 'numeric',
            });

            const unit = state.exerciseUnits[exerciseIndex] || state.globalUnit;

            // Get PR data for this exercise (id-first — the store is id-keyed)
            const { PRTracker } = await import('../features/pr-tracker.js');
            const exercise = state.currentWorkout?.exercises?.[exerciseIndex];
            const equipment = exercise?.equipment || 'Unknown Equipment';
            const prs = PRTracker.getExercisePRs(exerciseName, equipment, exercise?.equipmentId || null);

            // Show match info (equipment/location context)
            const histEquipment = lastExerciseData.equipment;
            const histLocation = lastWorkout.location;
            let matchInfo = '';
            if (histEquipment || histLocation) {
                const parts = [];
                if (histEquipment) parts.push(escapeHtml(histEquipment));
                if (histLocation) parts.push(escapeHtml(histLocation));
                matchInfo = ` <span class="exercise-history-content__match">@ ${parts.join(' - ')}</span>`;
            }

            let historyHTML = `
                <div class="exercise-history-content">`;

            // Show PR if available (only max weight with 5+ reps counts as a real PR)
            if (prs && prs.maxWeight && prs.maxWeight.reps >= 5) {
                const prStoredUnit = prs.maxWeight.unit || 'lbs';
                const prDisplayWeight = convertWeight(prs.maxWeight.weight, prStoredUnit, unit);
                historyHTML += `
                    <div class="exercise-history-content__pr">
                        <i class="fas fa-trophy exercise-history-content__pr-icon"></i>
                        <span class="exercise-history-content__pr-label">PR:</span>
                        <span>${prDisplayWeight} ${unit} × ${prs.maxWeight.reps}</span>
                    </div>`;
            }

            historyHTML += `
                    <div class="exercise-history-content__last">
                        <strong>Last (${displayDate}):</strong>${matchInfo}
                    </div>
                    <div class="exercise-history-content__sets">
            `;

            lastExerciseData.sets.forEach((set, index) => {
                if (set.reps && set.weight) {
                    let displayWeight;

                    // Use originalWeights if available (most reliable)
                    if (set.originalWeights && set.originalWeights[unit]) {
                        displayWeight = set.originalWeights[unit];
                    } else if (set.originalWeights) {
                        // Use whichever originalWeight exists and convert
                        const availableUnit = set.originalWeights.kg ? 'kg' : 'lbs';
                        const availableWeight = set.originalWeights[availableUnit];
                        displayWeight = convertWeight(availableWeight, availableUnit, unit);
                    } else {
                        // Fallback: check originalUnit and handle corrupted data
                        const storedUnit = set.originalUnit || 'lbs';
                        if (set.weight > 500) {
                            // Corrupted weight - show placeholder
                            displayWeight = '??';
                        } else {
                            displayWeight = convertWeight(set.weight, storedUnit, unit);
                        }
                    }

                    historyHTML += `
                        <div class="exercise-history-content__set-chip">
                            Set ${index + 1}: ${set.reps} × ${displayWeight} ${unit}
                        </div>
                    `;
                }
            });

            if (lastExerciseData.notes) {
                historyHTML += `</div><div class="exercise-history-content__notes"><strong>Notes:</strong> ${escapeHtml(lastExerciseData.notes)}</div>`;
            } else {
                historyHTML += `</div>`;
            }

            historyHTML += `</div>`;

            historyDisplay.innerHTML = historyHTML;
            historyDisplay.classList.remove('hidden');
        } else {
            historyDisplay.innerHTML = `
                <div class="exercise-history-placeholder">
                    No previous data found for this exercise
                </div>
            `;
            historyDisplay.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error loading exercise history:', error);
        historyDisplay.innerHTML = `
            <div class="exercise-history-placeholder exercise-history-placeholder--error">
                Error loading exercise history
            </div>
        `;
        historyDisplay.classList.remove('hidden');

        // Reset button text on error
        historyButton.innerHTML = '<i class="fas fa-history"></i> Show Last Workout';
    }
}

// Enhanced function to load workout history for display
export async function loadWorkoutHistory(state, limitCount = 50) {
    if (!state.currentUser) return [];

    try {
        const workoutsRef = collection(db, 'users', state.currentUser.uid, 'workouts');
        const q = query(workoutsRef, orderBy('lastUpdated', 'desc'), limit(limitCount));
        const querySnapshot = await withTimeout(getDocs(q));

        const workouts = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();

            // Enhanced workout data with proper exercise names
            // docId is the canonical reference for all operations
            const workout = {
                id: docSnap.id, // Legacy reference
                docId: docSnap.id, // Canonical document ID for all operations
                workoutId: data.workoutId || docSnap.id, // Schema v3.0 ID or fallback to doc ID
                date: data.date,
                workoutType: data.workoutType,
                startTime: data.startTime,
                startedAt: data.startedAt,
                completedAt: data.completedAt,
                cancelledAt: data.cancelledAt,
                totalDuration: data.totalDuration,
                exercises: data.exercises || {},
                exerciseNames: data.exerciseNames || {},
                exerciseUnits: data.exerciseUnits || {},
                originalWorkout: data.originalWorkout,
                totalExercises: data.totalExercises || 0,
                addedManually: data.addedManually || false,
                manualNotes: data.manualNotes || '',
                version: data.version || '1.0',
            };

            // Calculate progress
            let completedSets = 0;
            let totalSets = 0;

            if (workout.originalWorkout && workout.exercises) {
                workout.originalWorkout.exercises.forEach((exercise, index) => {
                    totalSets += exercise.sets;
                    const exerciseData = workout.exercises[`exercise_${index}`];
                    if (exerciseData && exerciseData.sets) {
                        const completed = exerciseData.sets.filter((set) => set && set.reps && set.weight).length;
                        completedSets += completed;
                    }
                });
            }

            workout.progress = {
                completedSets,
                totalSets,
                percentage: totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0,
            };

            // Determine status
            if (workout.completedAt) {
                workout.status = 'completed';
            } else if (workout.cancelledAt) {
                workout.status = 'cancelled';
            } else {
                workout.status = 'incomplete';
            }

            workouts.push(workout);
        });

        return workouts;
    } catch (error) {
        console.error('Error loading workout history:', error);
        return [];
    }
}

/**
 * Load ALL completed workouts (no limit) for dashboard aggregations.
 * Results are cached on a module-private TTL cache to avoid repeating the
 * full-collection scan on every dashboard render. Invalidate explicitly via
 * `clearAllWorkoutsCache()` after any write (workout complete / edit / delete).
 */
let _allWorkoutsCache = null;
// Shape: { uid: string, fetchedAt: number, data: Workout[] }
const ALL_WORKOUTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — re-fetch if user lingers across that boundary

export function clearAllWorkoutsCache() {
    _allWorkoutsCache = null;
}

export async function loadAllWorkouts(state) {
    if (!state.currentUser) return [];
    const uid = state.currentUser.uid;
    const now = Date.now();
    if (
        _allWorkoutsCache
        && _allWorkoutsCache.uid === uid
        && (now - _allWorkoutsCache.fetchedAt) < ALL_WORKOUTS_CACHE_TTL_MS
    ) {
        return _allWorkoutsCache.data;
    }
    try {
        const workoutsRef = collection(db, 'users', uid, 'workouts');
        const q = query(workoutsRef, orderBy('date', 'desc'));
        const snapshot = await getDocs(q);
        const workouts = [];
        snapshot.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            if (data.completedAt && !data.cancelledAt) workouts.push(data);
        });
        _allWorkoutsCache = { uid, fetchedAt: now, data: workouts };
        return workouts;
    } catch (error) {
        console.error('❌ Error loading all workouts:', error);
        return [];
    }
}

// Function to migrate old workout data to new format
export async function migrateWorkoutData(state) {
    if (!state.currentUser) return;

    try {
        const workoutsRef = collection(db, 'users', state.currentUser.uid, 'workouts');
        const q = query(workoutsRef, orderBy('lastUpdated', 'desc'), limit(10));
        const querySnapshot = await getDocs(q);

        let migrationCount = 0;

        for (const docSnapshot of querySnapshot.docs) {
            const data = docSnapshot.data();

            // Check if this is old format (no version or version 1.0)
            if (!data.version || data.version === '1.0') {
                // Find the original workout plan
                const workoutPlan = state.workoutPlans?.find((w) => w.day === data.workoutType);
                if (workoutPlan && data.exercises) {
                    // Add missing fields
                    const exerciseNames = {};
                    workoutPlan.exercises.forEach((exercise, index) => {
                        exerciseNames[`exercise_${index}`] = exercise.machine || exercise.name;
                    });

                    const updatedData = {
                        ...data,
                        exerciseNames,
                        originalWorkout: {
                            day: workoutPlan.day,
                            exercises: workoutPlan.exercises,
                        },
                        totalExercises: workoutPlan.exercises.length,
                        version: '2.0',
                    };

                    // Validate and save updated data
                    const validated = validateWorkoutData(updatedData) || updatedData;
                    await setDoc(doc(db, 'users', state.currentUser.uid, 'workouts', data.date), validated);
                    migrationCount++;
                }
            }
        }

        if (migrationCount > 0) {
            showNotification(`Updated ${migrationCount} workout entries`, 'info');
        }
    } catch (error) {
        console.error('Error during migration:', error);
    }
}

// Default data functions
function getDefaultWorkouts() {
    return [
        {
            day: 'Chest – Push',
            exercises: [
                {
                    machine: 'Seated Chest Press',
                    sets: 4,
                    reps: 10,
                    weight: 110,
                    video: 'https://www.youtube.com/watch?v=n8TOta_pfr4',
                },
                {
                    machine: 'Pec Deck',
                    sets: 3,
                    reps: 12,
                    weight: 70,
                    video: 'https://www.youtube.com/watch?v=JJitfZKlKk4',
                },
            ],
        },
    ];
}

function getDefaultExercises() {
    return [
        {
            name: 'Incline Dumbbell Press',
            machine: 'Incline Dumbbell Press',
            bodyPart: 'Chest',
            equipmentType: 'Dumbbell',
            tags: ['chest', 'upper body', 'push'],
            sets: 4,
            reps: 8,
            weight: 45,
            video: 'https://www.youtube.com/watch?v=example',
        },
    ];
}
/**
 * Count how many workouts and templates would be affected by equipment reassignment.
 * Used to show the user a preview before committing.
 */
export async function countReassignmentImpact(equipmentName, oldExerciseName) {
    const userId = AppState.currentUser?.uid;
    if (!userId) return { workouts: 0, templates: 0 };

    let workoutCount = 0;
    let templateCount = 0;

    // Count affected workouts
    const workoutsRef = collection(db, 'users', userId, 'workouts');
    const allWorkouts = await getDocs(workoutsRef);
    allWorkouts.forEach(docSnap => {
        const data = docSnap.data();
        if (workoutHasEquipmentForExercise(data, equipmentName, oldExerciseName)) {
            workoutCount++;
        }
    });

    // Count affected templates
    const templatesRef = collection(db, 'users', userId, 'workoutTemplates');
    const allTemplates = await getDocs(templatesRef);
    allTemplates.forEach(docSnap => {
        const data = docSnap.data();
        if (templateHasEquipmentForExercise(data, equipmentName, oldExerciseName)) {
            templateCount++;
        }
    });

    return { workouts: workoutCount, templates: templateCount };
}

/**
 * Check if a workout document contains the given equipment+exercise combo.
 */
function workoutHasEquipmentForExercise(data, equipmentName, exerciseName) {
    // Check originalWorkout.exercises
    if (data.originalWorkout?.exercises) {
        for (const ex of data.originalWorkout.exercises) {
            if (ex.equipment === equipmentName && (ex.machine === exerciseName || ex.name === exerciseName)) {
                return true;
            }
        }
    }
    // Check exercises object (exercise_0, exercise_1, etc.)
    if (data.exercises) {
        for (const [key, ex] of Object.entries(data.exercises)) {
            if (ex.equipment === equipmentName) {
                const idx = parseInt(key.split('_')[1]);
                const name = ex.name
                    || ex.machine
                    || data.exerciseNames?.[key]
                    || data.originalWorkout?.exercises?.[idx]?.machine;
                if (name === exerciseName) return true;
            }
        }
    }
    return false;
}

/**
 * Check if a template contains the given equipment+exercise combo.
 */
function templateHasEquipmentForExercise(data, equipmentName, exerciseName) {
    const exercises = Array.isArray(data.exercises) ? data.exercises : Object.values(data.exercises || {});
    return exercises.some(ex =>
        ex.equipment === equipmentName && (ex.machine === exerciseName || ex.name === exerciseName)
    );
}

/**
 * Reassign equipment from one exercise to another.
 * Updates all workouts, templates, and the equipment document's exerciseTypes.
 *
 * @param {string} equipmentId - Firestore doc ID of the equipment
 * @param {string} equipmentName - The equipment name string
 * @param {string} oldExerciseName - The exercise it's currently associated with
 * @param {string} newExerciseName - The exercise it should be associated with
 * @param {function} onProgress - Optional callback(updatedSoFar, total) for progress
 * @returns {Promise<{workouts: number, templates: number, prsMigrated: number, prMergeConflicts: number, videoMigrated: boolean}>}
 */
export async function reassignEquipment(equipmentId, equipmentName, oldExerciseName, newExerciseName, onProgress) {
    const userId = AppState.currentUser?.uid;
    if (!userId) throw new Error('Must be signed in');

    const BATCH_SIZE = 400;
    let currentBatch = writeBatch(db);
    let opCount = 0;
    let workoutCount = 0;
    let templateCount = 0;
    let totalProcessed = 0;

    // 1. Update workouts
    const workoutsRef = collection(db, 'users', userId, 'workouts');
    const allWorkouts = await getDocs(workoutsRef);
    const totalDocs = allWorkouts.size;

    for (const docSnap of allWorkouts.docs) {
        const data = docSnap.data();
        const updates = {};

        // Collect all exercise indices/keys that match the old equipment+name combo, from any source.
        // A workout can match via originalWorkout.exercises[idx] OR data.exercises[key] (or both).
        const matchedIndices = new Set();
        const matchedKeys = new Set();

        if (data.originalWorkout?.exercises) {
            data.originalWorkout.exercises.forEach((ex, idx) => {
                if (ex?.equipment === equipmentName && (ex.machine === oldExerciseName || ex.name === oldExerciseName)) {
                    matchedIndices.add(idx);
                    matchedKeys.add(`exercise_${idx}`);
                }
            });
        }

        if (data.exercises) {
            for (const [key, ex] of Object.entries(data.exercises)) {
                if (ex?.equipment !== equipmentName) continue;
                const idx = parseInt(key.split('_')[1]);
                const name = ex.name
                    || ex.machine
                    || data.exerciseNames?.[key]
                    || data.originalWorkout?.exercises?.[idx]?.machine;
                if (name === oldExerciseName) {
                    matchedKeys.add(key);
                    if (!isNaN(idx)) matchedIndices.add(idx);
                }
            }
        }

        if (matchedKeys.size === 0 && matchedIndices.size === 0) {
            totalProcessed++;
            if (onProgress) onProgress(totalProcessed, totalDocs);
            continue;
        }

        // Rewrite originalWorkout.exercises (whole-array write — it's an array, not a map).
        if (data.originalWorkout?.exercises && matchedIndices.size > 0) {
            updates['originalWorkout.exercises'] = data.originalWorkout.exercises.map((ex, idx) =>
                matchedIndices.has(idx) ? { ...ex, machine: newExerciseName, name: newExerciseName } : ex
            );
        }

        // For each matched key: update exerciseNames map AND inner exercises[key].name/.machine if present.
        // Cover both cases (originalWorkout-only match and inner-exercises match) by deriving keys from indices too.
        const allKeys = new Set(matchedKeys);
        for (const idx of matchedIndices) allKeys.add(`exercise_${idx}`);
        for (const key of allKeys) {
            updates[`exerciseNames.${key}`] = newExerciseName;
            const ex = data.exercises?.[key];
            if (ex) {
                if (ex.name !== undefined) updates[`exercises.${key}.name`] = newExerciseName;
                if (ex.machine !== undefined) updates[`exercises.${key}.machine`] = newExerciseName;
            }
        }

        updates['lastUpdated'] = new Date().toISOString();
        currentBatch.update(docSnap.ref, updates);
        opCount++;
        workoutCount++;

        if (opCount >= BATCH_SIZE) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            opCount = 0;
        }

        totalProcessed++;
        if (onProgress) onProgress(totalProcessed, totalDocs);
    }

    // 2. Update templates
    const templatesRef = collection(db, 'users', userId, 'workoutTemplates');
    const allTemplates = await getDocs(templatesRef);

    for (const docSnap of allTemplates.docs) {
        const data = docSnap.data();
        const exercises = data.exercises;
        if (!exercises) continue;

        const isArray = Array.isArray(exercises);
        const exerciseList = isArray ? exercises : Object.values(exercises);
        let changed = false;

        const updatedList = exerciseList.map(ex => {
            if (ex.equipment === equipmentName && (ex.machine === oldExerciseName || ex.name === oldExerciseName)) {
                changed = true;
                return { ...ex, machine: newExerciseName, name: newExerciseName };
            }
            return ex;
        });

        if (changed) {
            const updatedExercises = isArray
                ? updatedList
                : Object.fromEntries(Object.keys(exercises).map((k, i) => [k, updatedList[i]]));

            currentBatch.update(docSnap.ref, {
                exercises: updatedExercises,
                lastUpdated: new Date().toISOString(),
            });
            opCount++;
            templateCount++;

            if (opCount >= BATCH_SIZE) {
                await currentBatch.commit();
                currentBatch = writeBatch(db);
                opCount = 0;
            }
        }
    }

    // Commit remaining batch
    if (opCount > 0) {
        await currentBatch.commit();
    }

    // 3. Update equipment document's exerciseTypes AND exerciseVideos map.
    // The exerciseVideos map is keyed by exercise name — without migration the form video orphans.
    let videoMigrated = false;
    const equipRef = doc(db, 'users', userId, 'equipment', equipmentId);
    const equipSnap = await getDoc(equipRef);
    if (equipSnap.exists()) {
        const equipData = equipSnap.data();
        const types = equipData.exerciseTypes || [];
        const updated = types.filter(t => t !== oldExerciseName);
        if (!updated.includes(newExerciseName)) {
            updated.push(newExerciseName);
        }

        const exerciseVideos = { ...(equipData.exerciseVideos || {}) };
        if (exerciseVideos[oldExerciseName] !== undefined) {
            // Don't clobber an existing video on the destination — user may have set one already.
            if (exerciseVideos[newExerciseName] === undefined) {
                exerciseVideos[newExerciseName] = exerciseVideos[oldExerciseName];
            }
            delete exerciseVideos[oldExerciseName];
            videoMigrated = true;
        }

        await setDoc(equipRef, {
            ...equipData,
            exerciseTypes: updated,
            exerciseVideos,
            lastUsed: new Date().toISOString(),
        });
    }

    // 4. Migrate PR records keyed by old exercise name → new exercise name (merging on collision).
    let prsMigrated = 0;
    let prMergeConflicts = 0;
    try {
        const { renamePREquipmentExercise } = await import('../features/pr-tracker.js');
        const prResult = await renamePREquipmentExercise(equipmentName, oldExerciseName, newExerciseName, equipmentId);
        prsMigrated = prResult.migrated;
        prMergeConflicts = prResult.mergedConflicts;
    } catch (err) {
        console.error('❌ PR migration failed during equipment reassignment:', err);
    }

    return {
        workouts: workoutCount,
        templates: templateCount,
        prsMigrated,
        prMergeConflicts,
        videoMigrated,
    };
}

/**
 * Export all user workout data as a JSON file download.
 */
export async function exportWorkoutData(state) {
    if (!state.currentUser) {
        showNotification('Sign in to export data', 'warning');
        return;
    }

    try {
        showNotification('Preparing export…', 'info', 2000);

        const userId = state.currentUser.uid;

        // Load all data in parallel
        const [workoutsSnap, templatesSnap, equipmentSnap] = await Promise.all([
            getDocs(collection(db, 'users', userId, 'workouts')),
            getDocs(collection(db, 'users', userId, 'workoutTemplates')),
            getDocs(collection(db, 'users', userId, 'equipment')),
        ]);

        const workouts = [];
        workoutsSnap.forEach(d => workouts.push({ id: d.id, ...d.data() }));

        const templates = [];
        templatesSnap.forEach(d => templates.push({ id: d.id, ...d.data() }));

        const equipment = [];
        equipmentSnap.forEach(d => equipment.push({ id: d.id, ...d.data() }));

        const exportData = {
            exportDate: new Date().toISOString(),
            version: '3.0',
            userId: userId,
            workouts,
            templates,
            equipment,
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const today = getDateString(new Date());
        a.download = `bigsurf-export-${today}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification(`Exported ${workouts.length} workouts`, 'success', 2000);
    } catch (error) {
        console.error('❌ Export failed:', error);
        showNotification('Export failed', 'error');
    }
}

/**
 * Export an AI-friendly JSON bundle for pasting/uploading into ChatGPT (or any
 * LLM). Unlike exportWorkoutData, this resolves exercise names inline (so the
 * data reads as "Hack Squat" not "exercise_0") and includes the full
 * body-composition picture — body-weight/body-fat trend and DEXA history —
 * which is what makes for good charts and analysis. Self-contained name
 * resolver (see prod JS cache note — avoid cross-module exports).
 */
export async function exportDataForAI(state) {
    if (!state.currentUser) {
        showNotification('Sign in to export data', 'warning');
        return;
    }

    const resolveName = (w, key, ex) => ex?.name || ex?.machine || w?.exerciseNames?.[key] || 'Unknown';

    try {
        showNotification('Preparing ChatGPT export…', 'info', 2000);
        const userId = state.currentUser.uid;
        const unit = state.globalUnit || 'lbs';

        // Workouts + equipment from Firestore; DEXA + measurements via their
        // feature modules (dynamic import keeps firebase deps lazy).
        const [workoutsSnap, equipmentSnap, dexaMod, bodyMod] = await Promise.all([
            getDocs(collection(db, 'users', userId, 'workouts')),
            getDocs(collection(db, 'users', userId, 'equipment')),
            import('../features/dexa-scan.js'),
            import('../features/body-measurements.js'),
        ]);

        const workouts = [];
        workoutsSnap.forEach(d => {
            const w = { id: d.id, ...d.data() };
            if (!w.completedAt || w.cancelledAt) return; // completed only
            const exercises = Object.entries(w.exercises || {}).map(([key, ex]) => ({
                name: resolveName(w, key, ex),
                equipment: ex.equipment || null,
                sets: (ex.sets || []).map(s => ({
                    reps: s.reps ?? null,
                    weight: s.weight ?? null,
                    unit: s.originalUnit || unit,
                    type: s.type || 'working',
                    completed: s.completed !== false,
                })),
            }));
            workouts.push({
                date: w.date,
                type: w.workoutType || 'Workout',
                location: w.location || null,
                durationSec: w.totalDuration ?? null,
                exercises,
            });
        });
        workouts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const equipment = [];
        equipmentSnap.forEach(d => {
            const e = d.data();
            equipment.push({ name: e.name, type: e.equipmentType || null, locations: e.locations || [] });
        });

        const [dexaScans, measurements] = await Promise.all([
            dexaMod.loadDexaHistory?.(50) ?? [],
            // High cap so daily Withings weigh-ins going back years are all
            // included — the full body-weight history is what makes the
            // transformation legible in a chart.
            bodyMod.loadBodyWeightHistory?.(5000) ?? [],
        ]);

        const bundle = {
            app: 'Big Surf Workout Tracker',
            exportDate: new Date().toISOString(),
            preferredUnit: unit,
            instructions: 'Workout export. Each set weight is in its own "unit" field (lbs/kg). bodyComposition.measurements weights use their "unit". DEXA masses use each scan\'s "massUnit". Dates are YYYY-MM-DD, newest first for workouts/DEXA and oldest first for measurements.',
            profile: {
                heightCm: state.settings?.profileHeightCm ?? null,
                weeklyGoalDays: state.settings?.weeklyGoal ?? null,
            },
            workouts,
            bodyComposition: {
                measurements: (measurements || []).map(m => ({
                    date: m.date,
                    weight: m.weight ?? null,
                    unit: m.unit || 'lbs',
                    bodyFat: m.bodyFat ?? null,
                    muscleMass: m.muscleMass ?? null,
                    source: m.source || 'manual',
                })),
                dexaScans: dexaScans || [],
            },
            equipment,
        };

        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const today = getDateString(new Date());
        a.download = `bigsurf-chatgpt-${today}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification(`Exported ${workouts.length} workouts + body data`, 'success', 2500);
    } catch (error) {
        console.error('❌ ChatGPT export failed:', error);
        showNotification('Export failed', 'error');
    }
}
