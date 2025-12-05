// Enhanced Data Manager - core/data-manager.js
// Schema v3.0: Multiple workouts per day support
// - Old schema: document ID = date (YYYY-MM-DD), one workout per day
// - New schema: document ID = unique ID, date stored as field, multiple workouts per day
import { db, doc, setDoc, getDoc, collection, query, orderBy, limit, getDocs, where, deleteDoc } from './firebase-config.js';
import { showNotification, convertWeight } from '../ui/ui-helpers.js';

/**
 * Generate a unique workout ID
 * Format: {date}_{timestamp}_{random}
 */
function generateWorkoutId(date) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
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

    if (saveDate && typeof saveDate === 'string') {
        // If it's an ISO string, extract just the date part
        if (saveDate.includes('T')) {
            saveDate = saveDate.split('T')[0];
        }

        // Validate YYYY-MM-DD format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(saveDate)) {
            saveDate = state.getTodayDateString();
        }
    } else {
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
            exercises: state.currentWorkout.exercises.map(ex => ({
                machine: ex.machine || ex.name,
                sets: ex.sets,
                reps: ex.reps,
                weight: ex.weight,
                video: ex.video || '',
                equipment: ex.equipment || null,
                equipmentLocation: ex.equipmentLocation || null
            }))
        };

        // Store total exercise count for progress tracking
        state.savedData.totalExercises = state.currentWorkout.exercises.length;
    }

    // Convert weights to pounds for storage - FIXED to prevent corruption
    const normalizedData = { ...state.savedData };
    if (normalizedData.exercises) {
        Object.keys(normalizedData.exercises).forEach(exerciseKey => {
            const exerciseData = normalizedData.exercises[exerciseKey];
            const exerciseIndex = parseInt(exerciseKey.split('_')[1]);
            const currentUnit = state.exerciseUnits[exerciseIndex] || state.globalUnit;

            if (exerciseData.sets) {
                exerciseData.sets = exerciseData.sets.map(set => {
                    return {
                        ...set,
                        originalUnit: currentUnit || 'lbs'
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

        const docRef = doc(db, "users", state.currentUser.uid, "workouts", workoutId);
        const savedDoc = {
            ...normalizedData,
            workoutId: workoutId,  // Store ID in document for reference
            lastUpdated: new Date().toISOString(),
            version: '3.0'  // New schema version
        };
        await setDoc(docRef, savedDoc);

        // CRITICAL: Update window.inProgressWorkout so exercise changes persist on resume
        // This ensures added/deleted exercises are retained when closing and reopening workout
        if (window.inProgressWorkout && !state.savedData.completedAt && !state.savedData.cancelledAt) {
            window.inProgressWorkout = {
                ...savedDoc,
                originalWorkout: state.savedData.originalWorkout
            };
        }

        return true;
    } catch (error) {
        console.error('Error saving workout data:', error);
        showNotification('Failed to save workout data', 'error');
        return false;
    }
}

export async function loadTodaysWorkout(state) {
    if (!state.currentUser) return null;

    const today = state.getTodayDateString();
    try {
        // Schema v3.0: Query by date field instead of document ID
        // This finds incomplete workouts for today
        const workoutsRef = collection(db, "users", state.currentUser.uid, "workouts");
        const q = query(workoutsRef, where("date", "==", today));
        const snapshot = await getDocs(q);

        let incompleteWorkout = null;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // Find an incomplete workout for today
            if (data.workoutType &&
                data.workoutType !== 'none' &&
                !data.completedAt &&
                !data.cancelledAt) {
                // Add document ID for reference
                incompleteWorkout = { ...data, docId: docSnap.id };
            }
        });

        // Fallback: Check old schema (document ID = date) for backwards compatibility
        if (!incompleteWorkout) {
            const oldDocRef = doc(db, "users", state.currentUser.uid, "workouts", today);
            const oldDocSnap = await getDoc(oldDocRef);

            if (oldDocSnap.exists()) {
                const data = oldDocSnap.data();
                if (data.workoutType &&
                    data.workoutType !== 'none' &&
                    data.date === today &&
                    !data.completedAt &&
                    !data.cancelledAt) {
                    incompleteWorkout = { ...data, docId: today };
                }
            }
        }

        return incompleteWorkout;
    } catch (error) {
        console.error('Error loading today\'s workout:', error);
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
        const workoutsRef = collection(db, "users", state.currentUser.uid, "workouts");
        const q = query(workoutsRef, where("date", "==", dateStr));
        const snapshot = await getDocs(q);

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            workouts.push({ ...data, docId: docSnap.id });
        });

        // Fallback: Check old schema (document ID = date) for backwards compatibility
        // Only if we didn't find any workouts with the new schema
        if (workouts.length === 0) {
            const oldDocRef = doc(db, "users", state.currentUser.uid, "workouts", dateStr);
            const oldDocSnap = await getDoc(oldDocRef);

            if (oldDocSnap.exists()) {
                const data = oldDocSnap.data();
                workouts.push({ ...data, docId: dateStr });
            }
        }

        // Sort by startedAt (most recent first) if available
        workouts.sort((a, b) => {
            const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
            const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
            return timeB - timeA;
        });

        return workouts;
    } catch (error) {
        console.error('Error loading workouts by date:', error);
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
        const docRef = doc(db, "users", state.currentUser.uid, "workouts", workoutId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { ...docSnap.data(), docId: docSnap.id };
        }
        return null;
    } catch (error) {
        console.error('Error loading workout by ID:', error);
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
        const docRef = doc(db, "users", state.currentUser.uid, "workouts", workoutId);
        await deleteDoc(docRef);
        return true;
    } catch (error) {
        console.error('Error deleting workout:', error);
        return false;
    }
}

import { FirebaseWorkoutManager } from './firebase-workout-manager.js';

export async function loadWorkoutPlans(state) {
    try {
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(state);

        state.workoutPlans = await workoutManager.getUserWorkoutTemplates();
        state.exerciseDatabase = await workoutManager.getExerciseLibrary();
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
    const historyButton = document.querySelector(`button[onclick="loadExerciseHistory('${exerciseName}', ${exerciseIndex})"]`);

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
        const workoutsRef = collection(db, "users", state.currentUser.uid, "workouts");
        const q = query(workoutsRef, orderBy("lastUpdated", "desc"), limit(50)); // Increased limit
        const querySnapshot = await getDocs(q);

        let lastWorkout = null;
        let lastExerciseData = null;
        let workoutDate = null;
        let matchType = null; // Track what type of match we found

        // Find the most recent workout with this exercise (excluding today)
        const today = state.getTodayDateString();
        let allMatches = []; // Collect ALL matches with metadata

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
                        const exerciseName_check = data.exerciseNames?.[key] ||
                                                 data.originalWorkout?.exercises?.[idx]?.machine;

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
                        location: histLocation
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
                year: 'numeric'
            });

            const unit = state.exerciseUnits[exerciseIndex] || state.globalUnit;

            // Get PR data for this exercise
            const { PRTracker } = await import('../features/pr-tracker.js');
            const exercise = state.currentWorkout?.exercises?.[exerciseIndex];
            const equipment = exercise?.equipment || 'Unknown Equipment';
            const prs = PRTracker.getExercisePRs(exerciseName, equipment);

            let historyHTML = `
                <div class="exercise-history-content" style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-top: 1rem;">`;

            // Show PRs if available
            if (prs) {
                historyHTML += `
                    <div style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(64, 224, 208, 0.1); border-left: 3px solid var(--primary); border-radius: 4px;">
                        <h5 style="margin: 0 0 0.5rem 0; color: var(--primary); display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-trophy"></i> Personal Records (${equipment})
                        </h5>
                        <div style="display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.875rem;">`;

                if (prs.maxWeight) {
                    historyHTML += `
                        <div><strong>Max Weight:</strong> ${prs.maxWeight.weight} lbs × ${prs.maxWeight.reps}</div>`;
                }
                if (prs.maxReps) {
                    historyHTML += `
                        <div><strong>Max Reps:</strong> ${prs.maxReps.reps} @ ${prs.maxReps.weight} lbs</div>`;
                }
                if (prs.maxVolume) {
                    historyHTML += `
                        <div><strong>Max Volume:</strong> ${prs.maxVolume.volume} lbs</div>`;
                }

                historyHTML += `
                        </div>
                    </div>`;
            }

            // Show match info (equipment/location context)
            const histEquipment = lastExerciseData.equipment;
            const histLocation = lastWorkout.location;
            let matchInfo = '';
            if (histEquipment || histLocation) {
                const parts = [];
                if (histEquipment) parts.push(histEquipment);
                if (histLocation) parts.push(histLocation);
                matchInfo = ` <span style="font-size: 0.75rem; color: var(--text-muted);">@ ${parts.join(' - ')}</span>`;
            }

            historyHTML += `
                    <h5 style="margin: 0 0 0.5rem 0; color: var(--text-secondary);">Last Workout (${displayDate}):${matchInfo}</h5>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
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
                        <div style="background: var(--bg-secondary); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">
                            Set ${index + 1}: ${set.reps} × ${displayWeight} ${unit}
                        </div>
                    `;
                }
            });
            
            if (lastExerciseData.notes) {
                historyHTML += `</div><div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);"><strong>Notes:</strong> ${lastExerciseData.notes}</div>`;
            } else {
                historyHTML += `</div>`;
            }
            
            historyHTML += `</div>`;
            
            historyDisplay.innerHTML = historyHTML;
            historyDisplay.classList.remove('hidden');
        } else {
            historyDisplay.innerHTML = `
                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-top: 1rem; text-align: center; color: var(--text-secondary);">
                    No previous data found for this exercise
                </div>
            `;
            historyDisplay.classList.remove('hidden');
        }
        
    } catch (error) {
        console.error('Error loading exercise history:', error);
        historyDisplay.innerHTML = `
            <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-top: 1rem; text-align: center; color: var(--danger);">
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
        const workoutsRef = collection(db, "users", state.currentUser.uid, "workouts");
        const q = query(workoutsRef, orderBy("lastUpdated", "desc"), limit(limitCount));
        const querySnapshot = await getDocs(q);

        const workouts = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();

            // Enhanced workout data with proper exercise names
            // docId is the canonical reference for all operations
            const workout = {
                id: docSnap.id,           // Legacy reference
                docId: docSnap.id,        // Canonical document ID for all operations
                workoutId: data.workoutId || docSnap.id,  // Schema v3.0 ID or fallback to doc ID
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
                version: data.version || '1.0'
            };
            
            // Calculate progress
            let completedSets = 0;
            let totalSets = 0;
            
            if (workout.originalWorkout && workout.exercises) {
                workout.originalWorkout.exercises.forEach((exercise, index) => {
                    totalSets += exercise.sets;
                    const exerciseData = workout.exercises[`exercise_${index}`];
                    if (exerciseData && exerciseData.sets) {
                        const completed = exerciseData.sets.filter(set => set && set.reps && set.weight).length;
                        completedSets += completed;
                    }
                });
            }
            
            workout.progress = {
                completedSets,
                totalSets,
                percentage: totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0
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

// Function to migrate old workout data to new format
export async function migrateWorkoutData(state) {
    if (!state.currentUser) return;

    try {
        const workoutsRef = collection(db, "users", state.currentUser.uid, "workouts");
        const q = query(workoutsRef, orderBy("lastUpdated", "desc"), limit(10));
        const querySnapshot = await getDocs(q);
        
        let migrationCount = 0;
        
        for (const docSnapshot of querySnapshot.docs) {
            const data = docSnapshot.data();
            
            // Check if this is old format (no version or version 1.0)
            if (!data.version || data.version === '1.0') {
                
                // Find the original workout plan
                const workoutPlan = state.workoutPlans?.find(w => w.day === data.workoutType);
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
                            exercises: workoutPlan.exercises
                        },
                        totalExercises: workoutPlan.exercises.length,
                        version: '2.0'
                    };
                    
                    // Save updated data
                    await setDoc(doc(db, "users", state.currentUser.uid, "workouts", data.date), updatedData);
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
            "day": "Chest – Push",
            "exercises": [
                {
                    "machine": "Seated Chest Press",
                    "sets": 4,
                    "reps": 10,
                    "weight": 110,
                    "video": "https://www.youtube.com/watch?v=n8TOta_pfr4"
                },
                {
                    "machine": "Pec Deck",
                    "sets": 3,
                    "reps": 12,
                    "weight": 70,
                    "video": "https://www.youtube.com/watch?v=JJitfZKlKk4"
                }
            ]
        }
    ];
}

function getDefaultExercises() {
    return [
        {
            "name": "Incline Dumbbell Press",
            "machine": "Incline Dumbbell Press",
            "bodyPart": "Chest",
            "equipmentType": "Dumbbell",
            "tags": ["chest", "upper body", "push"],
            "sets": 4,
            "reps": 8,
            "weight": 45,
            "video": "https://www.youtube.com/watch?v=example"
        }
    ];
}
// RECOVERY FUNCTION: Fix corrupted weight data
async function recoverCorruptedWeights(state) {
    if (!state.currentUser) return;

    let fixedCount = 0;
    
    // Get all workout data
    const workoutsRef = collection(db, "users", state.currentUser.uid, "workouts");
    const snapshot = await getDocs(workoutsRef);
    
    for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data();
        let needsUpdate = false;
        
        if (data.exercises) {
            Object.keys(data.exercises).forEach(exerciseKey => {
                const exerciseData = data.exercises[exerciseKey];
                if (exerciseData.sets) {
                    exerciseData.sets.forEach(set => {
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
            await setDoc(doc(db, "users", state.currentUser.uid, "workouts", docSnapshot.id), data);
        }
    }

    if (fixedCount > 0) {
        showNotification(`Recovered ${fixedCount} corrupted weights!`, 'success');
    }
}