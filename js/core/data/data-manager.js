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
} from './firebase-config.js';
import { showNotification, convertWeight, escapeHtml } from '../ui/ui-helpers.js';
import { validateWorkoutData } from '../utils/validation.js';
import { getDateString } from '../utils/date-helpers.js';
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
function generateWorkoutId(date) {
    const timestamp = Date.now();
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    const random = Array.from(arr, (b) => b.toString(36).padStart(2, '0'))
        .join('')
        .substring(0, 12);
    return `${date}_${timestamp}_${random}`;
}

/**
 * Check if a document ID uses the old schema (date as ID)
 */
function isOldSchemaDoc(docId) {
    return /^\d{4}-\d{2}-\d{2}$/.test(docId);
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
                equipmentLocation: ex.equipmentLocation || null,
                bodyPart: ex.bodyPart || null, // Include bodyPart for progress categorization
            })),
        };

        // Store total exercise count for progress tracking
        state.savedData.totalExercises = state.currentWorkout.exercises.length;
    }

    // Convert weights to pounds for storage - FIXED to prevent corruption
    const normalizedData = { ...state.savedData };
    if (normalizedData.exercises) {
        Object.keys(normalizedData.exercises).forEach((exerciseKey) => {
            const exerciseData = normalizedData.exercises[exerciseKey];
            const exerciseIndex = parseInt(exerciseKey.split('_')[1]);
            const currentUnit = state.exerciseUnits[exerciseIndex] || state.globalUnit;

            if (exerciseData.sets) {
                exerciseData.sets = exerciseData.sets.map((set) => {
                    return {
                        ...set,
                        originalUnit: currentUnit || 'lbs',
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
        showNotification('Failed to save workout data', 'error');
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
export async function getLastSessionDefaults(exerciseName, equipment = null) {
    if (!exerciseName) return null;

    const cacheKey = `${exerciseName}__${equipment || ''}`;
    if (_lastSessionCache[cacheKey] !== undefined) return _lastSessionCache[cacheKey];

    const state = (await import('../utils/app-state.js')).AppState;
    if (!state.currentUser) return null;

    try {
        const workoutsRef = collection(db, 'users', state.currentUser.uid, 'workouts');
        const q = query(workoutsRef, orderBy('completedAt', 'desc'), limit(20));
        const snapshot = await withTimeout(getDocs(q));

        const today = state.getTodayDateString();

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (data.date === today) continue;
            if (!data.completedAt) continue;
            if (!data.exercises) continue;

            // Search all exercises in the workout for a match
            for (const [key, exData] of Object.entries(data.exercises)) {
                if (!exData || !exData.sets || exData.sets.length === 0) continue;

                // Get exercise name from exerciseNames map or originalWorkout
                const idx = key.replace('exercise_', '');
                const exName = data.exerciseNames?.[key]
                    || data.originalWorkout?.exercises?.[idx]?.machine
                    || exData.name;

                if (exName !== exerciseName) continue;

                // If equipment specified, prefer equipment match
                const exEquipment = exData.equipment || data.originalWorkout?.exercises?.[idx]?.equipment || null;
                if (equipment && exEquipment && equipment !== exEquipment) continue;

                // Found a match — return sets and date
                const result = {
                    sets: exData.sets.filter(s => s && (s.reps || s.weight)),
                    date: data.date,
                };
                _lastSessionCache[cacheKey] = result;
                return result;
            }
        }

        _lastSessionCache[cacheKey] = null;
        return null;
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

import { FirebaseWorkoutManager } from './firebase-workout-manager.js';

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
            showNotification('Error loading workout data. Please check your connection.', 'error');
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
        let matchType = null; // Track what type of match we found

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
            matchType = bestMatch.matchDescription;
        }

        // Display the results
        if (lastExerciseData && lastExerciseData.sets) {
            const displayDate = new Date(workoutDate + 'T12:00:00').toLocaleDateString('en-US', {
                month: 'numeric',
                day: 'numeric',
                year: 'numeric',
            });

            const unit = state.exerciseUnits[exerciseIndex] || state.globalUnit;

            // Get PR data for this exercise
            const { PRTracker } = await import('../features/pr-tracker.js');
            const exercise = state.currentWorkout?.exercises?.[exerciseIndex];
            const equipment = exercise?.equipment || 'Unknown Equipment';
            const prs = PRTracker.getExercisePRs(exerciseName, equipment);

            // Show match info (equipment/location context)
            const histEquipment = lastExerciseData.equipment;
            const histLocation = lastWorkout.location;
            let matchInfo = '';
            if (histEquipment || histLocation) {
                const parts = [];
                if (histEquipment) parts.push(escapeHtml(histEquipment));
                if (histLocation) parts.push(escapeHtml(histLocation));
                matchInfo = ` <span style="font-size: 0.8rem; color: var(--text-muted);">@ ${parts.join(' - ')}</span>`;
            }

            let historyHTML = `
                <div class="exercise-history-content" style="background: var(--bg-secondary); padding: 0.5rem 0.75rem; border-radius: 8px; margin-top: 0.5rem;">`;

            // Show PR if available (only max weight with 5+ reps counts as a real PR)
            if (prs && prs.maxWeight && prs.maxWeight.reps >= 5) {
                const prStoredUnit = prs.maxWeight.unit || 'lbs';
                const prDisplayWeight = convertWeight(prs.maxWeight.weight, prStoredUnit, unit);
                historyHTML += `
                    <div style="margin-bottom: 0.4rem; padding: 0.3rem 0.5rem; background: rgba(64, 224, 208, 0.1); border-left: 3px solid var(--primary); border-radius: 4px; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-trophy" style="color: var(--primary); font-size: 0.9rem;"></i>
                        <span style="color: var(--primary); font-weight: 600;">PR:</span>
                        <span>${prDisplayWeight} ${unit} × ${prs.maxWeight.reps}</span>
                    </div>`;
            }

            historyHTML += `
                    <div style="margin-bottom: 0.3rem; font-size: 0.85rem; color: var(--text-secondary);">
                        <strong>Last (${displayDate}):</strong>${matchInfo}
                    </div>
                    <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
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
                        <div style="background: var(--bg-secondary); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">
                            Set ${index + 1}: ${set.reps} × ${displayWeight} ${unit}
                        </div>
                    `;
                }
            });

            if (lastExerciseData.notes) {
                historyHTML += `</div><div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);"><strong>Notes:</strong> ${escapeHtml(lastExerciseData.notes)}</div>`;
            } else {
                historyHTML += `</div>`;
            }

            historyHTML += `</div>`;

            historyDisplay.innerHTML = historyHTML;
            historyDisplay.classList.remove('hidden');
        } else {
            historyDisplay.innerHTML = `
                <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; margin-top: 1rem; text-align: center; color: var(--text-secondary);">
                    No previous data found for this exercise
                </div>
            `;
            historyDisplay.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error loading exercise history:', error);
        historyDisplay.innerHTML = `
            <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; margin-top: 1rem; text-align: center; color: var(--danger);">
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
 * Results are cached on AppState.workouts for drill-down pages.
 */
export async function loadAllWorkouts(state) {
    if (!state.currentUser) return [];
    try {
        const workoutsRef = collection(db, 'users', state.currentUser.uid, 'workouts');
        const q = query(workoutsRef, orderBy('date', 'desc'));
        const snapshot = await getDocs(q);
        const workouts = [];
        snapshot.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            if (data.completedAt && !data.cancelledAt) workouts.push(data);
        });
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
// RECOVERY FUNCTION: Fix corrupted weight data
async function recoverCorruptedWeights(state) {
    if (!state.currentUser) return;

    let fixedCount = 0;

    // Get all workout data
    const workoutsRef = collection(db, 'users', state.currentUser.uid, 'workouts');
    const snapshot = await getDocs(workoutsRef);

    for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data();
        let needsUpdate = false;

        if (data.exercises) {
            Object.keys(data.exercises).forEach((exerciseKey) => {
                const exerciseData = data.exercises[exerciseKey];
                if (exerciseData.sets) {
                    exerciseData.sets.forEach((set) => {
                        // Check if weight is corrupted (unreasonably high)
                        if (set.weight && set.weight > 500 && set.originalWeights) {
                            // Use the original kg value if available
                            if (set.originalWeights.kg && set.originalUnit === 'kg') {
                                set.weight = Math.round(set.originalWeights.kg * 2.20462);
                            } else if (set.originalWeights.lbs) {
                                set.weight = set.originalWeights.lbs;
                            }

                            set.alreadyConverted = true;
                            needsUpdate = true;
                            fixedCount++;
                        }
                    });
                }
            });
        }

        if (needsUpdate) {
            await setDoc(doc(db, 'users', state.currentUser.uid, 'workouts', docSnapshot.id), data);
        }
    }

    if (fixedCount > 0) {
        showNotification(`Recovered ${fixedCount} corrupted weights!`, 'success');
    }
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
                const name = data.exerciseNames?.[key] || data.originalWorkout?.exercises?.[idx]?.machine;
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
 * @returns {Promise<{workouts: number, templates: number}>} Count of updated documents
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
        let needsUpdate = false;
        const updates = {};

        // Update originalWorkout.exercises array
        if (data.originalWorkout?.exercises) {
            const updatedExercises = data.originalWorkout.exercises.map(ex => {
                if (ex.equipment === equipmentName && (ex.machine === oldExerciseName || ex.name === oldExerciseName)) {
                    needsUpdate = true;
                    return { ...ex, machine: newExerciseName, name: newExerciseName };
                }
                return ex;
            });
            if (needsUpdate) {
                updates['originalWorkout.exercises'] = updatedExercises;
            }
        }

        // Update exercises object and exerciseNames
        if (data.exercises) {
            for (const [key, ex] of Object.entries(data.exercises)) {
                if (ex.equipment === equipmentName) {
                    const idx = parseInt(key.split('_')[1]);
                    const name = data.exerciseNames?.[key] || data.originalWorkout?.exercises?.[idx]?.machine;
                    if (name === oldExerciseName) {
                        needsUpdate = true;
                        // exerciseNames stores the display name
                        updates[`exerciseNames.${key}`] = newExerciseName;
                    }
                }
            }
        }

        if (needsUpdate) {
            updates['lastUpdated'] = new Date().toISOString();
            currentBatch.update(docSnap.ref, updates);
            opCount++;
            workoutCount++;

            if (opCount >= BATCH_SIZE) {
                await currentBatch.commit();
                currentBatch = writeBatch(db);
                opCount = 0;
            }
        }

        totalProcessed++;
        if (onProgress) onProgress(totalProcessed, totalDocs);
    }

    // 2. Update templates
    const templatesRef = collection(db, 'users', userId, 'workoutTemplates');
    const allTemplates = await getDocs(templatesRef);

    for (const docSnap of allTemplates.docs) {
        const data = docSnap.data();
        let exercises = data.exercises;
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

    // 3. Update equipment document's exerciseTypes
    const equipRef = doc(db, 'users', userId, 'equipment', equipmentId);
    const equipSnap = await getDoc(equipRef);
    if (equipSnap.exists()) {
        const equipData = equipSnap.data();
        const types = equipData.exerciseTypes || [];
        const updated = types.filter(t => t !== oldExerciseName);
        if (!updated.includes(newExerciseName)) {
            updated.push(newExerciseName);
        }
        await setDoc(equipRef, { ...equipData, exerciseTypes: updated, lastUsed: new Date().toISOString() });
    }

    return { workouts: workoutCount, templates: templateCount };
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
        showNotification('Preparing export...', 'info', 2000);

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
        const today = new Date().toISOString().split('T')[0];
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
