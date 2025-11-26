// Core Workout Management Module - core/workout-core.js
// Handles workout session execution, exercise management, and workout lifecycle

import { AppState } from './app-state.js';
import { showNotification, convertWeight, updateProgress } from './ui-helpers.js';
import { saveWorkoutData, loadExerciseHistory } from './data-manager.js';

// ===================================================================
// CORE WORKOUT LIFECYCLE
// ===================================================================

export async function startWorkout(workoutType) {
    console.log(`🚀 Starting workout: ${workoutType}`);

    if (!AppState.currentUser) {
        showNotification('Please sign in to start a workout', 'warning');
        return;
    }

    // Check if location is set, if not, show location selector
    const { PRTracker } = await import('./pr-tracker.js');
    const currentLocation = PRTracker.getCurrentLocation();

    if (!currentLocation) {
        console.log('📍 No location set, showing location selector...');
        const { showLocationSelector } = await import('./location-ui.js');
        showLocationSelector(() => startWorkout(workoutType)); // Retry after location is set
        return;
    }

    // Find the workout plan
    const workout = AppState.workoutPlans.find(plan =>
        plan.day === workoutType || plan.name === workoutType || plan.id === workoutType
    );

    if (!workout) {
        showNotification(`Workout "${workoutType}" not found`, 'error');
        return;
    }

    // Set up workout state
    AppState.currentWorkout = { ...workout };
    AppState.workoutStartTime = new Date();
    AppState.savedData = {
        workoutType: workoutType,
        date: AppState.getTodayDateString(),
        startedAt: new Date().toISOString(),
        exercises: {},
        version: '2.0',
        location: currentLocation // Store location with workout
    };

    // Initialize exercise units
    AppState.exerciseUnits = {};

    const workoutNameElement = document.getElementById('current-workout-name');
    if (workoutNameElement) {
        workoutNameElement.textContent = workoutType;
    }
    
    // Hide other sections and show active workout
    const workoutSelector = document.getElementById('workout-selector');
    const activeWorkout = document.getElementById('active-workout');
    const workoutManagement = document.getElementById('workout-management');
    const historySection = document.getElementById('workout-history-section');
    
    if (workoutSelector) workoutSelector.classList.add('hidden');
    if (workoutManagement) workoutManagement.classList.add('hidden');
    if (historySection) historySection.classList.add('hidden');
    if (activeWorkout) activeWorkout.classList.remove('hidden');
    
    // Start duration timer
    startWorkoutTimer();
    
    // Render exercises
    renderExercises();

    // Save initial state
    await saveWorkoutData(AppState);

    // Removed annoying "workout started" notification
}

export function pauseWorkout() {
    if (!AppState.currentWorkout) return;
    
    // Save current state
    AppState.savedData.pausedAt = new Date().toISOString();
    saveWorkoutData(AppState);
    
    // Stop timers
    AppState.clearTimers();
    
    showNotification('Workout paused', 'info');
}

export async function completeWorkout() {
    if (!AppState.currentWorkout) return;

    // Stop duration timer
    AppState.clearTimers();

    // Update saved data with completion info
    AppState.savedData.completedAt = new Date().toISOString();
    AppState.savedData.totalDuration = Math.floor((new Date() - AppState.workoutStartTime) / 1000);

    // Save final data
    await saveWorkoutData(AppState);

    // Process workout for PRs
    const { PRTracker } = await import('./pr-tracker.js');
    await PRTracker.processWorkoutForPRs(AppState.savedData);

    showNotification('Workout completed! Great job!', 'success');

    // Reset state BEFORE showing selector (critical order!)
    AppState.reset();

    // Clear in-progress workout since it's now completed
    window.inProgressWorkout = null;

    // Now show workout selector (after state is cleared)
    showWorkoutSelector();
}

export function cancelWorkout() {
    if (!AppState.currentWorkout) return;

    // Remove the annoying confirm popup
    AppState.savedData.cancelledAt = new Date().toISOString();
    saveWorkoutData(AppState);

    AppState.reset();
    AppState.clearTimers();

    // Clear in-progress workout since it's been cancelled
    window.inProgressWorkout = null;

    showNotification('Workout cancelled', 'info');

    // Navigate to dashboard instead of legacy workout selector
    import('./navigation.js').then(({ navigateTo }) => {
        navigateTo('dashboard');
    });
}

export function cancelCurrentWorkout() {
    cancelWorkout();
}

// ===================================================================
// IN-PROGRESS WORKOUT MANAGEMENT
// ===================================================================

export function continueInProgressWorkout() {
    
    console.log('🔄 Resuming workout:', window.inProgressWorkout.workoutType);
    
    // Hide the resume banner
    const banner = document.getElementById('resume-workout-banner');
    if (banner) banner.classList.add('hidden');
    window.showingProgressPrompt = false;
    if (!window.inProgressWorkout) {
        showNotification('No in-progress workout found', 'warning');
        return;
    }
    
    // Restore workout state
    AppState.currentWorkout = window.inProgressWorkout.originalWorkout;
    AppState.savedData = window.inProgressWorkout;
    AppState.exerciseUnits = window.inProgressWorkout.exerciseUnits || {};

    // CRITICAL: Restore start time from saved data
    if (window.inProgressWorkout.startedAt) {
        AppState.workoutStartTime = new Date(window.inProgressWorkout.startedAt);
    } else {
        AppState.workoutStartTime = new Date();
    }

    // Hide all other sections and show active workout
    const sections = ['workout-selector', 'dashboard', 'workout-history-section', 'stats-section'];
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('hidden');
    });

    const activeWorkout = document.getElementById('active-workout');
    if (activeWorkout) activeWorkout.classList.remove('hidden');

    // Resume timer
    startWorkoutTimer();
    
    // Render exercises
    renderExercises();
    
    // Clear in-progress state
    // DON'T clear this - keep it so we can resume again if user navigates away
    // It will be cleared when workout is completed or cancelled
    // window.inProgressWorkout = null;
    
    showNotification('Resumed workout!', 'success');
}

export async function discardInProgressWorkout() {
    console.log('🗑️ Starting discard process...', window.inProgressWorkout);
    
    
    // Hide the resume banner
    const banner = document.getElementById('resume-workout-banner');
    if (banner) banner.classList.add('hidden');
    window.showingProgressPrompt = false;
    if (!window.inProgressWorkout) {
        console.log('ℹ️ No in-progress workout to discard');
        return;
    }
    
    const confirmDiscard = confirm(
        `Are you sure you want to discard your in-progress "${window.inProgressWorkout.workoutType}" workout? ` +
        `This will permanently delete your progress and cannot be undone.`
    );
    
    if (!confirmDiscard) {
        console.log('ℹ️ User cancelled discard');
        return;
    }
    
    try {
        // Store workout info BEFORE clearing variables
        const workoutToDelete = {
            date: window.inProgressWorkout.date,
            workoutType: window.inProgressWorkout.workoutType,
            userId: AppState.currentUser?.uid
        };
        
        console.log('📋 Workout to delete:', workoutToDelete);
        
        // DELETE the workout from Firebase FIRST
        try {
            if (workoutToDelete.userId && workoutToDelete.date) {
                console.log('🔥 Attempting Firebase deletion...');
                
                const { deleteDoc, doc, db } = await import('./firebase-config.js');
                
                const workoutRef = doc(db, "users", workoutToDelete.userId, "workouts", workoutToDelete.date);
                await deleteDoc(workoutRef);
                
                console.log('✅ SUCCESS: Workout deleted from Firebase:', workoutToDelete.date);
            } else {
                console.log('⚠️ Missing userId or date for Firebase deletion:', workoutToDelete);
            }
        } catch (firebaseError) {
            console.error('âŒ ERROR deleting workout from Firebase:', firebaseError);
        }
        
        // Clear in-progress workout state
        window.inProgressWorkout = null;
        
        // Clear any related UI state
        AppState.reset();
        
        // Show workout selector
        showWorkoutSelector();
        
        showNotification('In-progress workout discarded', 'info');
        console.log('✅ Discard process completed successfully');
        
    } catch (error) {
        console.error('âŒ Error during discard process:', error);
        showNotification('Error discarding workout. Please try again.', 'error');
    }
}

// ===================================================================
// EXERCISE RENDERING AND MANAGEMENT
// ===================================================================

export function renderExercises() {
    const container = document.getElementById('exercise-list');
    if (!container || !AppState.currentWorkout) return;
    
    container.innerHTML = '';

    // Add single "Add Exercise" button at the top
    const addExerciseHeader = document.createElement('div');
    addExerciseHeader.className = 'add-exercise-header';
    addExerciseHeader.innerHTML = `
        <button class="btn btn-primary" onclick="addExerciseToActiveWorkout()" title="Add new exercise to workout">
            <i class="fas fa-plus"></i> Add Exercise
        </button>
    `;
    container.appendChild(addExerciseHeader);

    // Render each exercise card
    AppState.currentWorkout.exercises.forEach((exercise, index) => {
        const card = createExerciseCard(exercise, index);
        container.appendChild(card);
    });
    
    // Show empty state if no exercises
    if (AppState.currentWorkout.exercises.length === 0) {
        container.innerHTML += `
            <div class="empty-workout-message">
                <i class="fas fa-dumbbell"></i>
                <h3>No exercises in this workout</h3>
                <p>Add some exercises to get started!</p>
            </div>
        `;
    }
    
    updateProgress(AppState);
}

function generateQuickSetsHtml(exercise, exerciseIndex, unit) {
    const savedSets = AppState.savedData.exercises?.[`exercise_${exerciseIndex}`]?.sets || [];
    const targetSets = exercise.sets || 3;
    
    let html = '<div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">';
    
    for (let setIndex = 0; setIndex < targetSets; setIndex++) {
        const set = savedSets[setIndex] || {};
        const isCompleted = set.reps && set.weight;
        
        if (isCompleted) {
            // Convert stored lbs weight to display unit
            let displayWeight = set.weight; // stored in lbs
            if (set.weight && unit === 'kg') {
                displayWeight = Math.round(set.weight * 0.453592); // Convert lbs to kg, rounded to whole number
            }
            
            html += `
                <div style="background: var(--success); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500;">
                    Set ${setIndex + 1}: ${set.reps} × ${displayWeight} ${unit}
                </div>
            `;
        } else {
            // Show incomplete sets as gray placeholders
            html += `
                <div style="background: var(--bg-tertiary); color: var(--text-secondary); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; border: 1px dashed var(--border);">
                    Set ${setIndex + 1}
                </div>
            `;
        }
    }
    
    html += '</div>';
    return html;
}

export function createExerciseCard(exercise, index) {
    const card = document.createElement('div');
    card.className = 'exercise-card';
    card.dataset.index = index;

    const unit = AppState.exerciseUnits[index] || AppState.globalUnit;
    const savedSets = AppState.savedData.exercises?.[`exercise_${index}`]?.sets || [];
    
    // Calculate completion status
    const completedSets = savedSets.filter(set => set && set.reps && set.weight).length;
    const totalSets = exercise.sets || 3;
    
    // Fix: Exercise is only completed when ALL sets are done
    const isCompleted = completedSets === totalSets && completedSets > 0;

    if (isCompleted) {
        card.classList.add('completed');
        card.classList.add('collapsed'); // Auto-collapse completed exercises
    }
    
    card.innerHTML = `
        <div class="exercise-header">
            <div class="exercise-info">
                <h3 class="exercise-title">${exercise.machine}</h3>
                <div class="exercise-meta">
                    ${completedSets}/${totalSets} sets • ${exercise.reps || 10} reps • ${exercise.weight || 50} ${unit}
                </div>
                <!-- Add unit toggle for each exercise -->
                <div class="exercise-unit-toggle-mini">
                    <button class="unit-btn-mini ${unit === 'lbs' ? 'active' : ''}" onclick="setExerciseUnit(${index}, 'lbs')">lbs</button>
                    <button class="unit-btn-mini ${unit === 'kg' ? 'active' : ''}" onclick="setExerciseUnit(${index}, 'kg')">kg</button>
                </div>
            </div>
            <div class="exercise-actions">
                <button class="btn btn-danger btn-small" onclick="deleteExerciseFromWorkout(${index})" title="Delete exercise">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="exercise-focus-btn" onclick="focusExercise(${index})" title="Open exercise details">
                    <i class="fas fa-expand-alt"></i>
                </button>
                ${exercise.video ? `
                    <button class="btn btn-success btn-small" onclick="showExerciseVideo('${exercise.video}', '${exercise.machine}')" title="Show form video">
                        <i class="fas fa-play"></i>
                    </button>
                ` : ''}
            </div>
        </div>
        <div class="exercise-sets-preview">
            ${generateQuickSetsHtml(exercise, index, unit)}
        </div>
    `;

    // Add click handler for completed exercises to toggle collapse
    if (isCompleted) {
        const header = card.querySelector('.exercise-header');
        if (header) {
            header.addEventListener('click', () => {
                card.classList.toggle('collapsed');
            });
        }
    }

    return card;
}

export function focusExercise(index) {
    if (!AppState.currentWorkout) return;
    
    AppState.focusedExerciseIndex = index;
    const exercise = AppState.currentWorkout.exercises[index];
    const modal = document.getElementById('exercise-modal');
    const title = document.getElementById('modal-exercise-title');
    const content = document.getElementById('exercise-content');
    
    if (!modal || !title || !content) {
        console.error('Modal elements not found:', { modal: !!modal, title: !!title, content: !!content });
        return;
    }

    title.textContent = exercise.machine;
    
    // Define currentUnit FIRST
    const currentUnit = AppState.exerciseUnits[index] || AppState.globalUnit;
    
    // Generate the HTML content (this creates the unit toggle)
    content.innerHTML = generateExerciseTable(exercise, index, currentUnit);
    
    // NOW find and set up the unit toggle (after it's been created)
    const unitToggle = modal.querySelector('.exercise-unit-toggle .unit-toggle');
    
    if (unitToggle) {
        unitToggle.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setExerciseUnit(index, btn.dataset.unit);
            });
        });
    }

    modal.classList.remove('hidden');
}

export function generateExerciseTable(exercise, exerciseIndex, unit) {
    const savedSets = AppState.savedData.exercises?.[`exercise_${exerciseIndex}`]?.sets || [];
    const savedNotes = AppState.savedData.exercises?.[`exercise_${exerciseIndex}`]?.notes || '';
    const convertedWeight = convertWeight(exercise.weight, 'lbs', unit);

    // Ensure we have the right number of sets
    while (savedSets.length < exercise.sets) {
        savedSets.push({ reps: '', weight: '' });
    }

    let html = `
        <!-- Exercise History Reference -->
        <div class="exercise-history-section">
            <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap;">
                <button class="btn btn-secondary btn-small" onclick="loadExerciseHistory('${exercise.machine}', ${exerciseIndex})">
                    <i class="fas fa-history"></i> Show Last Workout
                </button>
                ${exercise.video ?
                    `<button class="btn btn-primary btn-small" onclick="showExerciseVideo('${exercise.video}', '${exercise.machine}')">
                        <i class="fas fa-play"></i> Form Video
                    </button>` : ''
                }
            </div>
            <div id="exercise-history-${exerciseIndex}" class="exercise-history-display hidden"></div>
        </div>

        <!-- Exercise Unit Toggle -->
        <div class="exercise-unit-toggle">
            <div class="unit-toggle">
                <button class="unit-btn ${unit === 'lbs' ? 'active' : ''}" data-unit="lbs">lbs</button>
                <button class="unit-btn ${unit === 'kg' ? 'active' : ''}" data-unit="kg">kg</button>
            </div>
        </div>

        <!-- In-Modal Rest Timer -->
        <div id="modal-rest-timer-${exerciseIndex}" class="modal-rest-timer hidden">
            <div class="modal-rest-content">
                <div class="modal-rest-exercise">Rest Period</div>
                <div class="modal-rest-display">90s</div>
                <div class="modal-rest-controls">
                    <button class="btn btn-small" onclick="toggleModalRestTimer(${exerciseIndex})">
                        <i class="fas fa-pause"></i>
                    </button>
                    <button class="btn btn-small" onclick="skipModalRestTimer(${exerciseIndex})">
                        <i class="fas fa-forward"></i>
                    </button>
                </div>
            </div>
        </div>

        <table class="exercise-table">
            <thead>
                <tr>
                    <th>Set</th>
                    <th>Reps</th>
                    <th>Weight (${unit})</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let i = 0; i < exercise.sets; i++) {
    const set = savedSets[i] || { reps: '', weight: '' };
    
    // Convert stored lbs weight to display unit
    let displayWeight = set.weight || '';
    if (displayWeight && unit === 'kg') {
        displayWeight = Math.round(displayWeight * 0.453592); // Round kg to whole number
    }
    
    html += `
        <tr>
            <td>Set ${i + 1}</td>
            <td>
                <input type="number" class="set-input" 
                       placeholder="${exercise.reps}" 
                       value="${set.reps}"
                       onchange="updateSet(${exerciseIndex}, ${i}, 'reps', this.value)">
            </td>
            <td>
                <input type="number" class="set-input" 
                       placeholder="${convertedWeight}" 
                       value="${displayWeight}"
                       onchange="updateSet(${exerciseIndex}, ${i}, 'weight', this.value)">
            </td>
        </tr>
    `;
}

    html += `
            </tbody>
        </table>
        
        <textarea id="exercise-notes-${exerciseIndex}" class="notes-area" placeholder="Exercise notes..."
                  onchange="saveExerciseNotes(${exerciseIndex})">${savedNotes}</textarea>
        
        <div class="exercise-complete-section" style="margin-top: 1rem; text-align: center;">
            <button class="btn btn-success" onclick="markExerciseComplete(${exerciseIndex})">
                <i class="fas fa-check-circle"></i> Mark Exercise Complete
            </button>
        </div>
    `;

    return html;
}

export { loadExerciseHistory };

// ===================================================================
// SET MANAGEMENT
// ===================================================================

export async function updateSet(exerciseIndex, setIndex, field, value) {
    console.log('🔧 updateSet called:', exerciseIndex, setIndex, field, value);
    
    if (!AppState.currentWorkout || !AppState.savedData.exercises) {
        AppState.savedData.exercises = {};
    }
    
    const exerciseKey = `exercise_${exerciseIndex}`;
    if (!AppState.savedData.exercises[exerciseKey]) {
        AppState.savedData.exercises[exerciseKey] = { sets: [], notes: '' };
    }
    
    if (!AppState.savedData.exercises[exerciseKey].sets[setIndex]) {
        AppState.savedData.exercises[exerciseKey].sets[setIndex] = {};
    }
    
    // Convert and validate value
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
        if (field === 'weight') {
            const currentUnit = AppState.exerciseUnits[exerciseIndex] || AppState.globalUnit;
            let weightInLbs = numValue;
            
            // Convert to lbs if entered in kg
            if (currentUnit === 'kg') {
                weightInLbs = Math.round(numValue * 2.20462);
            }
            
            // Store weight in lbs and track original unit
            AppState.savedData.exercises[exerciseKey].sets[setIndex][field] = weightInLbs;
            AppState.savedData.exercises[exerciseKey].sets[setIndex].originalUnit = currentUnit;
            
            // Store both values for reference
            AppState.savedData.exercises[exerciseKey].sets[setIndex].originalWeights = {
                lbs: weightInLbs,
                kg: currentUnit === 'kg' ? numValue : Math.round(weightInLbs * 0.453592)
            };
            
            console.log(`✅ Weight stored in lbs: ${weightInLbs} (entered as ${numValue} ${currentUnit})`);
        } else {
            AppState.savedData.exercises[exerciseKey].sets[setIndex][field] = numValue;
            console.log('✅ Set field updated:', field, '=', numValue);
        }
    } else {
        AppState.savedData.exercises[exerciseKey].sets[setIndex][field] = null;
        console.log('⚠️ Invalid value, set to null');
    }
    
    // Save to Firebase
    saveWorkoutData(AppState);
    
    // Update UI
    updateProgress(AppState);
    renderExercises();

    const setData = AppState.savedData.exercises[exerciseKey].sets[setIndex];
    console.log('🎯 Checking set data:', setData);

    if (setData.reps && setData.weight) {
        console.log('🚀 Starting timer for set completion');

        // Check for PR (returns true if PR was found)
        const isPR = await checkSetForPR(exerciseIndex, setIndex);

        autoStartRestTimer(exerciseIndex, setIndex);

        // Only show generic notification if it's not a PR
        if (!isPR) {
            showNotification(`Set ${setIndex + 1} recorded`, 'success');
        }
    }
}

// Track which sets have already shown PR notifications to avoid duplicates
const prNotifiedSets = new Set();

// Check if a set is a PR and show visual feedback
// Returns true if a PR was detected
async function checkSetForPR(exerciseIndex, setIndex) {
    try {
        const exercise = AppState.currentWorkout.exercises[exerciseIndex];
        const exerciseName = exercise.machine;
        const equipment = exercise.equipment || 'Unknown Equipment';

        const exerciseKey = `exercise_${exerciseIndex}`;
        const set = AppState.savedData.exercises[exerciseKey].sets[setIndex];

        if (!set || !set.reps || !set.weight) return false;

        // Create unique key for this set to track if we've already notified
        const setKey = `${exerciseIndex}-${setIndex}-${set.reps}-${set.weight}`;

        // Skip if we've already notified about this exact set
        if (prNotifiedSets.has(setKey)) {
            return false;
        }

        const { PRTracker } = await import('./pr-tracker.js');
        const prCheck = PRTracker.checkForNewPR(exerciseName, set.reps, set.weight, equipment);

        if (prCheck.isNewPR) {
            // Mark this set as notified
            prNotifiedSets.add(setKey);

            // Add PR badge to the set row
            const setRow = document.querySelector(`#exercise-${exerciseIndex} tbody tr:nth-child(${setIndex + 1})`);
            if (setRow && !setRow.querySelector('.pr-badge')) {
                const prBadge = document.createElement('span');
                prBadge.className = 'pr-badge';
                prBadge.innerHTML = ' <i class="fas fa-trophy" style="color: gold; margin-left: 0.5rem; animation: pulse 1s infinite;"></i>';
                prBadge.title = `New ${prCheck.prType.replace('max', '').replace(/([A-Z])/g, ' $1').trim()} PR!`;

                const firstCell = setRow.querySelector('td');
                if (firstCell) {
                    firstCell.appendChild(prBadge);
                }
            }

            // For "first time" PRs, only show notification once per exercise
            // For other PR types (maxWeight, maxReps, maxVolume), show for each unique achievement
            const exerciseNotifyKey = `${exerciseIndex}-${prCheck.prType}`;
            const shouldNotify = prCheck.prType === 'first'
                ? !prNotifiedSets.has(exerciseNotifyKey)
                : true;

            if (shouldNotify) {
                if (prCheck.prType === 'first') {
                    // Mark the entire exercise as notified for "first" type
                    prNotifiedSets.add(exerciseNotifyKey);
                }

                // Show PR notification
                let prMessage = '🏆 NEW PR! ';
                if (prCheck.prType === 'maxWeight') {
                    prMessage += `Max Weight: ${set.weight} lbs × ${set.reps}`;
                } else if (prCheck.prType === 'maxReps') {
                    prMessage += `Max Reps: ${set.reps} @ ${set.weight} lbs`;
                } else if (prCheck.prType === 'maxVolume') {
                    prMessage += `Max Volume: ${set.reps * set.weight} lbs`;
                } else if (prCheck.prType === 'first') {
                    prMessage += `First time doing ${exerciseName}!`;
                }

                showNotification(prMessage, 'success');
                console.log(`🏆 PR detected for ${exerciseName}:`, prCheck);
            }

            return true;
        }

        return false;
    } catch (error) {
        console.error('Error checking for PR:', error);
        return false;
    }
}

export function addSet(exerciseIndex) {
    if (!AppState.currentWorkout) return;
    
    AppState.currentWorkout.exercises[exerciseIndex].sets = 
        (AppState.currentWorkout.exercises[exerciseIndex].sets || 3) + 1;
    
    renderExercises();
    showNotification('Set added', 'success');

    const setData = AppState.savedData.exercises[exerciseKey].sets[setIndex];
    if (setData.reps && setData.weight) {
        // Auto-start rest timer (no notification needed - user can see timer)
        autoStartRestTimer(exerciseIndex, setIndex);
    }
}

export function deleteSet(exerciseIndex, setIndex) {
    if (!AppState.savedData.exercises) return;
    
    const exerciseKey = `exercise_${exerciseIndex}`;
    if (AppState.savedData.exercises[exerciseKey]?.sets) {
        AppState.savedData.exercises[exerciseKey].sets.splice(setIndex, 1);
        saveWorkoutData(AppState);
        renderExercises();
        showNotification('Set deleted', 'info');
    }
}

export function saveExerciseNotes(exerciseIndex) {
    const notesTextarea = document.getElementById(`exercise-notes-${exerciseIndex}`);
    if (!notesTextarea) return;
    
    if (!AppState.savedData.exercises) AppState.savedData.exercises = {};
    
    const exerciseKey = `exercise_${exerciseIndex}`;
    if (!AppState.savedData.exercises[exerciseKey]) {
        AppState.savedData.exercises[exerciseKey] = { sets: [], notes: '' };
    }
    
    AppState.savedData.exercises[exerciseKey].notes = notesTextarea.value;
    saveWorkoutData(AppState);
    
    showNotification('Notes saved', 'success');
}

export function markExerciseComplete(exerciseIndex) {
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    const exerciseKey = `exercise_${exerciseIndex}`;
    
    if (!AppState.savedData.exercises[exerciseKey]) {
        AppState.savedData.exercises[exerciseKey] = { sets: [], notes: '' };
    }
    
    // Mark all sets as completed with target values
    const targetSets = exercise.sets || 3;
    for (let i = 0; i < targetSets; i++) {
        if (!AppState.savedData.exercises[exerciseKey].sets[i]) {
            AppState.savedData.exercises[exerciseKey].sets[i] = {};
        }
        if (!AppState.savedData.exercises[exerciseKey].sets[i].reps) {
            AppState.savedData.exercises[exerciseKey].sets[i].reps = exercise.reps || 10;
        }
        if (!AppState.savedData.exercises[exerciseKey].sets[i].weight) {
            AppState.savedData.exercises[exerciseKey].sets[i].weight = exercise.weight || 50;
        }
    }
    
    saveWorkoutData(AppState);
    renderExercises();
    
    // Close modal if open
    const modal = document.getElementById('exercise-modal');
    if (modal) modal.classList.add('hidden');
    
    showNotification(`${exercise.machine} marked complete!`, 'success');
}

function markSetComplete(exerciseIndex, setIndex) {
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    updateSet(exerciseIndex, setIndex, 'reps', exercise.reps || 10);
    updateSet(exerciseIndex, setIndex, 'weight', exercise.weight || 50);
}

export function deleteExerciseFromWorkout(exerciseIndex) {
    if (!AppState.currentWorkout) return;
    
    const exerciseName = AppState.currentWorkout.exercises[exerciseIndex].machine;
    
    if (confirm(`Remove "${exerciseName}" from this workout?`)) {
        AppState.currentWorkout.exercises.splice(exerciseIndex, 1);
        
        // Remove saved data for this exercise and shift remaining exercises
        if (AppState.savedData.exercises) {
            delete AppState.savedData.exercises[`exercise_${exerciseIndex}`];
            
            // Shift remaining exercise data
            for (let i = exerciseIndex + 1; i < AppState.currentWorkout.exercises.length + 1; i++) {
                if (AppState.savedData.exercises[`exercise_${i}`]) {
                    AppState.savedData.exercises[`exercise_${i - 1}`] = AppState.savedData.exercises[`exercise_${i}`];
                    delete AppState.savedData.exercises[`exercise_${i}`];
                }
            }
        }
        
        saveWorkoutData(AppState);
        renderExercises();
        showNotification(`Removed "${exerciseName}" from workout`, 'info');
    }
}

// ===================================================================
// EXERCISE ADDITION AND SWAPPING
// ===================================================================

export function addExerciseToActiveWorkout() {
    if (!AppState.currentWorkout) {
        showNotification('No active workout', 'warning');
        return;
    }
    
    if (!AppState.currentUser) {
        showNotification('Please sign in to add exercises', 'warning');
        return;
    }
    
    // Open exercise library for workout addition
    if (window.exerciseLibrary && window.exerciseLibrary.openForWorkoutAdd) {
        window.exerciseLibrary.openForWorkoutAdd();
    } else {
        console.log('📚 Using fallback method to open exercise library');
        showNotification('Exercise library opened - select exercises manually', 'info');
    }
}

export function confirmExerciseAddToWorkout(exerciseData) {
    if (!AppState.currentWorkout) return;
    
    let exercise;
    try {
        if (typeof exerciseData === 'string') {
            const cleanJson = exerciseData.replace(/&quot;/g, '"');
            exercise = JSON.parse(cleanJson);
        } else {
            exercise = exerciseData;
        }
    } catch (e) {
        console.error('Error parsing exercise data:', e);
        return;
    }
    
    // Add exercise to current workout
    const newExercise = {
        machine: exercise.name || exercise.machine,
        sets: exercise.sets || 3,
        reps: exercise.reps || 10,
        weight: exercise.weight || 50,
        video: exercise.video || ''
    };
    
    AppState.currentWorkout.exercises.push(newExercise);
    
    // Save and update UI
    saveWorkoutData(AppState);
    renderExercises();
    
    // Close exercise library
    if (window.exerciseLibrary && window.exerciseLibrary.close) {
        window.exerciseLibrary.close();
    }
    
    showNotification(`Added "${newExercise.machine}" to workout!`, 'success');
}

// REMOVED: swapExercise() and confirmExerciseSwap() - Replaced by delete + add workflow

export function closeExerciseModal() {
    const modal = document.getElementById('exercise-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    
    // Clear any modal rest timers
    if (AppState.focusedExerciseIndex !== null) {
        const modalTimer = document.getElementById(`modal-rest-timer-${AppState.focusedExerciseIndex}`);
        if (modalTimer && modalTimer.timerData) {
            if (modalTimer.timerData.animationFrame) {
                cancelAnimationFrame(modalTimer.timerData.animationFrame);
            }
            modalTimer.classList.add('hidden');
        }
    }
    
    AppState.focusedExerciseIndex = null;
}

// ===================================================================
// PROGRESS AND STATE MANAGEMENT
// ===================================================================

// REMOVED: updateExerciseProgress(), validateSetInput(), updateFormCompletion(), handleUnknownWorkout() - Never used

// ===================================================================
// TIMER FUNCTIONS
// ===================================================================

// REMOVED: startRestTimer() and stopRestTimer() - Replaced by modal rest timer system

export function toggleModalRestTimer(exerciseIndex) {
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    if (!modalTimer) return;
    
    if (modalTimer.classList.contains('hidden')) {
        // Start new timer
        startModalRestTimer(exerciseIndex, 90);
    } else {
        // Pause/resume existing timer
        if (modalTimer.timerData && modalTimer.timerData.pause) {
            modalTimer.timerData.pause();
        }
    }
}

export function skipModalRestTimer(exerciseIndex) {
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    if (modalTimer && modalTimer.timerData && modalTimer.timerData.skip) {
        modalTimer.timerData.skip();
    }
    showNotification('Rest timer skipped', 'info');
}

function startModalRestTimer(exerciseIndex, duration = 90) {
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    
    clearModalRestTimer(exerciseIndex);
    
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    const exerciseLabel = modalTimer?.querySelector('.modal-rest-exercise');
    const timerDisplay = modalTimer?.querySelector('.modal-rest-display');
    
    if (!modalTimer || !exerciseLabel || !timerDisplay) return;
    
    exerciseLabel.textContent = `Rest Period - ${exercise.machine}`;
    modalTimer.classList.remove('hidden');

    // Set timer text to black immediately
    timerDisplay.style.color = '#000000';

    let timeLeft = duration;
    let isPaused = false;
    let startTime = Date.now();
    let pausedTime = 0;
    
    const updateDisplay = () => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };
    
    const checkTime = () => {
        if (isPaused) return;
        
        const elapsed = Math.floor((Date.now() - startTime - pausedTime) / 1000);
        timeLeft = Math.max(0, duration - elapsed);
        
        updateDisplay();
        
        if (timeLeft === 0) {
            timerDisplay.textContent = 'Ready!';
            timerDisplay.style.color = 'var(--success)';

            // Vibration
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200]);
            }

            // Use service worker notification for background support
            import('./notification-helper.js').then(({ showNotification }) => {
                showNotification('Rest complete!', 'Time for your next set', {
                    tag: 'rest-timer',
                    silent: true // No sound - user can see timer at 0:00
                });
            }).catch(() => {
                // Fallback to regular notification if service worker not available
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Rest complete!', {
                        body: 'Time for your next set',
                        icon: '/BigSurf.png',
                        silent: true
                    });
                }
            });

            // Removed in-app notification - timer shows 0:00 which is clear enough

            // *** REMOVED AUTO-HIDE - Timer stays visible until manually dismissed ***
            return;
        }
    };
    
    updateDisplay();
    
    const timerLoop = () => {
        checkTime();
        if (timeLeft > 0) {
            modalTimer.timerData.animationFrame = requestAnimationFrame(timerLoop);
        }
    };
    
    modalTimer.timerData = {
        animationFrame: requestAnimationFrame(timerLoop),
        timeLeft: timeLeft,
        isPaused: isPaused,
        startTime: startTime,
        pausedTime: pausedTime,
        
        pause: () => {
            isPaused = !isPaused;
            if (isPaused) {
                pausedTime += Date.now() - startTime;
            } else {
                startTime = Date.now();
            }
            
            const pauseBtn = modalTimer.querySelector('.modal-rest-controls .btn:first-child');
            if (pauseBtn) {
                pauseBtn.innerHTML = isPaused ? 
                    '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
            }
            
            showNotification(isPaused ? 'Timer paused' : 'Timer resumed', 'info');
        },
        
        skip: () => {
            if (modalTimer.timerData.animationFrame) {
                cancelAnimationFrame(modalTimer.timerData.animationFrame);
            }
            modalTimer.classList.add('hidden');
            timerDisplay.style.color = '#000000';
            modalTimer.timerData = null;
        }
    };
    
    // Request notification permission if not granted
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function clearModalRestTimer(exerciseIndex) {
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    if (!modalTimer) return;
    
    if (modalTimer.timerData) {
        if (modalTimer.timerData.animationFrame) {
            cancelAnimationFrame(modalTimer.timerData.animationFrame);
        }
        modalTimer.timerData = null;
    }
    
    modalTimer.classList.add('hidden');
    
    // Reset display
    const timerDisplay = modalTimer.querySelector('.modal-rest-display');
    if (timerDisplay) {
        timerDisplay.style.color = '#000000';
    }
    
    // Reset pause button
    const pauseBtn = modalTimer.querySelector('.modal-rest-controls .btn:first-child');
    if (pauseBtn) {
        pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    }
}

function restoreModalRestTimer(exerciseIndex, timerState) {
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    const exerciseLabel = modalTimer?.querySelector('.modal-rest-exercise');
    const timerDisplay = modalTimer?.querySelector('.modal-rest-display');
    
    if (!modalTimer || !exerciseLabel || !timerDisplay) return;
    
    // Restore visual state
    exerciseLabel.textContent = timerState.exerciseLabel;
    modalTimer.classList.remove('hidden');

    // Set timer text to black immediately
    timerDisplay.style.color = '#000000';

    let timeLeft = timerState.timeLeft;
    let isPaused = timerState.isPaused;
    let startTime = timerState.startTime || Date.now();
    let pausedTime = timerState.pausedTime || 0;
    
    const updateDisplay = () => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };
    
    const checkTime = () => {
        if (isPaused) return;
        
        const elapsed = Math.floor((Date.now() - startTime - pausedTime) / 1000);
        timeLeft = Math.max(0, timerState.timeLeft - elapsed);
        
        updateDisplay();
        
        if (timeLeft === 0) {
            timerDisplay.textContent = 'Ready!';
            timerDisplay.style.color = 'var(--success)';

            // Vibration
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200]);
            }

            // Use service worker notification for background support
            import('./notification-helper.js').then(({ showNotification }) => {
                showNotification('Rest complete!', 'Time for your next set', {
                    tag: 'rest-timer',
                    silent: true // No sound - user can see timer at 0:00
                });
            }).catch(() => {
                // Fallback to regular notification if service worker not available
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Rest complete!', {
                        body: 'Time for your next set',
                        icon: '/BigSurf.png',
                        silent: true
                    });
                }
            });

            // Removed in-app notification - timer shows 0:00 which is clear enough

            // *** REMOVED AUTO-HIDE - Timer stays visible ***
            return;
        }
    };
    
    updateDisplay();
    
    const timerLoop = () => {
        checkTime();
        if (timeLeft > 0) {
            modalTimer.timerData.animationFrame = requestAnimationFrame(timerLoop);
        }
    };
    
    // Store timer state
    modalTimer.timerData = {
        animationFrame: requestAnimationFrame(timerLoop),
        timeLeft: timeLeft,
        isPaused: isPaused,
        startTime: startTime,
        pausedTime: pausedTime,
        
        pause: () => {
            isPaused = !isPaused;
            if (isPaused) {
                pausedTime += Date.now() - startTime;
            } else {
                startTime = Date.now();
            }
            
            const pauseBtn = modalTimer.querySelector('.modal-rest-controls .btn:first-child');
            if (pauseBtn) {
                pauseBtn.innerHTML = isPaused ? 
                    '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
            }
            
            modalTimer.timerData.isPaused = isPaused;
            modalTimer.timerData.pausedTime = pausedTime;
            modalTimer.timerData.timeLeft = timeLeft;
        },
        
        skip: () => {
            if (modalTimer.timerData.animationFrame) {
                cancelAnimationFrame(modalTimer.timerData.animationFrame);
            }
            modalTimer.classList.add('hidden');
            timerDisplay.style.color = '#000000';
            modalTimer.timerData = null;
        }
    };
}

function stopModalRestTimer(exerciseIndex) {
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    if (!modalTimer) return;
    
    // Clear animation frame
    if (modalTimer.timerData && modalTimer.timerData.animationFrame) {
        cancelAnimationFrame(modalTimer.timerData.animationFrame);
    }
    
    // Hide timer and reset
    modalTimer.classList.add('hidden');
    modalTimer.timerData = null;
    
    // Reset display color
    const timerDisplay = modalTimer.querySelector('.modal-rest-display');
    if (timerDisplay) {
        timerDisplay.style.color = '#000000';
    }
    
    // Reset pause button
    const pauseBtn = modalTimer.querySelector('.modal-rest-controls .btn:first-child');
    if (pauseBtn) {
        pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    }
}

export function startWorkoutTimer() {
    const durationDisplay = document.getElementById('workout-duration');
    if (!durationDisplay) return;
    
    const startTime = AppState.workoutStartTime || new Date();
    
    const updateDuration = () => {
        const elapsed = Math.floor((new Date() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        durationDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };
    
    updateDuration();
    AppState.workoutDurationTimer = setInterval(updateDuration, 1000);
}

export function updateWorkoutDuration() {
    if (AppState.workoutDurationTimer) {
        // Timer is already running
        return;
    }
    startWorkoutTimer();
}

export function autoStartRestTimer(exerciseIndex, setIndex) {
    console.log('autoStartRestTimer called for exercise', exerciseIndex, 'set', setIndex);
    
    const modal = document.getElementById('exercise-modal');
    const modalHidden = modal?.classList.contains('hidden');
    const focusedMatch = AppState.focusedExerciseIndex === exerciseIndex;
    
    console.log('Modal exists:', !!modal);
    console.log('Modal hidden:', modalHidden);
    console.log('Focused exercise:', AppState.focusedExerciseIndex, 'Target:', exerciseIndex);
    console.log('Match:', focusedMatch);
    
    if (modal && !modalHidden && focusedMatch) {
        console.log('✅ All conditions met, starting timer');
        startModalRestTimer(exerciseIndex, 90);
    } else {
        console.log(' Conditions not met for timer start');
    }
}

// ===================================================================
// VIDEO FUNCTIONS
// ===================================================================

export function convertYouTubeUrl(url) {
    if (!url) return url;
    
    let videoId = null;
    
    if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('youtube.com/watch?v=')) {
        videoId = url.split('youtube.com/watch?v=')[1].split('&')[0];
    } else if (url.includes('youtube.com/embed/')) {
        return url; // Already in embed format
    }
    
    if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
    }
    
    return url; // Return original if not a YouTube URL
}

export function showExerciseVideo(videoUrl, exerciseName) {
    const videoSection = document.getElementById('exercise-video-section');
    const iframe = document.getElementById('exercise-video-iframe');
    
    if (!videoSection || !iframe) return;
    
    const embedUrl = convertYouTubeUrl(videoUrl);
    
    // Check if it's a valid URL (not a placeholder)
    if (!embedUrl || embedUrl.includes('example') || embedUrl === videoUrl && !embedUrl.includes('youtube')) {
        showNotification('No form video available for this exercise', 'info');
        return;
    }
    
    iframe.src = embedUrl;
    videoSection.classList.remove('hidden');
    
    showNotification(`Showing form video for ${exerciseName}`, 'success');
}

export function hideExerciseVideo() {
    const videoSection = document.getElementById('exercise-video-section');
    const iframe = document.getElementById('exercise-video-iframe');
    
    if (videoSection) videoSection.classList.add('hidden');
    if (iframe) iframe.src = '';
}

// ===================================================================
// UNIT MANAGEMENT
// ===================================================================

export function setGlobalUnit(unit) {
    if (AppState.globalUnit === unit) return; // No change needed
    
    AppState.globalUnit = unit;
    
    // Update global unit toggle
    document.querySelectorAll('.global-settings .unit-btn')?.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.unit === unit);
    });
    
    // Update all exercises that don't have individual unit preferences
    if (AppState.currentWorkout) {
        AppState.currentWorkout.exercises.forEach((exercise, index) => {
            if (!AppState.exerciseUnits[index]) {
                AppState.exerciseUnits[index] = unit;
            }
        });
        
        renderExercises();
        saveWorkoutData(AppState); // Save unit preferences
    }
}

export function setExerciseUnit(exerciseIndex, unit) {
    if (!AppState.currentWorkout || exerciseIndex >= AppState.currentWorkout.exercises.length) return;
    
    console.log(`Setting unit for exercise ${exerciseIndex} to ${unit}`);
    
    // Just change the display unit preference
    AppState.exerciseUnits[exerciseIndex] = unit;
    
    // PRESERVE TIMER STATE BEFORE REFRESHING MODAL
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    let timerState = null;
    
    if (modalTimer && modalTimer.timerData && !modalTimer.classList.contains('hidden')) {
        timerState = {
            isActive: true,
            isPaused: modalTimer.timerData.isPaused || false,
            timeLeft: modalTimer.timerData.timeLeft,
            exerciseLabel: modalTimer.querySelector('.modal-rest-exercise')?.textContent,
            startTime: modalTimer.timerData.startTime,
            pausedTime: modalTimer.timerData.pausedTime
        };
        
        if (modalTimer.timerData.animationFrame) {
            cancelAnimationFrame(modalTimer.timerData.animationFrame);
        }
    }

    // No weight conversion - weights stay in lbs, only display changes
    
    // Update modal display
    const modal = document.getElementById('exercise-modal');
    if (modal) {
        modal.querySelectorAll('.unit-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.unit === unit);
        });
        
        const exercise = AppState.currentWorkout.exercises[exerciseIndex];
        const content = document.getElementById('exercise-content');
        if (content) {
            content.innerHTML = generateExerciseTable(exercise, exerciseIndex, unit);
            
            // Re-setup unit toggle event listeners
            const unitToggle = modal.querySelector('.exercise-unit-toggle .unit-toggle');
            if (unitToggle) {
                unitToggle.querySelectorAll('.unit-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        setExerciseUnit(exerciseIndex, btn.dataset.unit);
                    });
                });
            }
            
            // RESTORE TIMER STATE
            if (timerState && timerState.isActive) {
                restoreModalRestTimer(exerciseIndex, timerState);
            }
        }
    }
    
    // Refresh main view
    renderExercises();
    
    // Save unit preference (weights unchanged)
    saveWorkoutData(AppState);
    
    showNotification(`Switched to ${unit.toUpperCase()} for this exercise`, 'success');
}

// ===================================================================
// NAVIGATION HELPERS
// ===================================================================

export async function showWorkoutSelector() {
    const workoutSelector = document.getElementById('workout-selector');
    const activeWorkout = document.getElementById('active-workout');
    const workoutManagement = document.getElementById('workout-management');
    const historySection = document.getElementById('workout-history-section');
    
    // If user has an active workout in progress, show that instead of selector
    if (AppState.currentWorkout && AppState.savedData.workoutType) {
        console.log('Restoring active workout view');
        if (workoutSelector) workoutSelector.classList.add('hidden');
        if (activeWorkout) activeWorkout.classList.remove('hidden');
        if (workoutManagement) workoutManagement.classList.add('hidden');
        if (historySection) historySection.classList.add('hidden');
        
        // Re-render exercises to ensure UI is up to date
        renderExercises();
        return; // Don't show selector or check for in-progress workout
    }
    
    // No active workout - show selector
    if (workoutSelector) workoutSelector.classList.remove('hidden');
    if (activeWorkout) activeWorkout.classList.add('hidden');
    if (workoutManagement) workoutManagement.classList.add('hidden');
    if (historySection) historySection.classList.add('hidden');
    
    // *** Check for in-progress workout whenever showing selector ***
    await checkForInProgressWorkout();
}

async function checkForInProgressWorkout() {
    // Skip if already showing prompt
    if (window.showingProgressPrompt) return;
    
    // Skip if user is already in an active workout - they dont need a prompt
    if (AppState.currentWorkout && AppState.savedData.workoutType) {
        console.log("Already in active workout, no prompt needed");
        return;
    }

    console.log('Checking for in-progress workout...');
    
    try {
        const { loadTodaysWorkout } = await import('./data-manager.js');
        const todaysData = await loadTodaysWorkout(AppState);
        
        // Check if there's an incomplete workout from today
        if (todaysData && !todaysData.completedAt && !todaysData.cancelledAt) {
            console.log('Found in-progress workout:', todaysData.workoutType);
            
            // Validate workout plan exists
            const workoutPlan = AppState.workoutPlans.find(plan => 
                plan.day === todaysData.workoutType || 
                plan.name === todaysData.workoutType ||
                plan.id === todaysData.workoutType
            );
            
            if (!workoutPlan) {
                console.warn('âš ï¸ Workout plan not found for:', todaysData.workoutType);
                return;
            }
            
            // Store in-progress workout globally
            window.inProgressWorkout = {
                ...todaysData,
                originalWorkout: workoutPlan
            };
            
            // Show the prompt
            showInProgressWorkoutPrompt(todaysData);
        } else {
            console.log('✅ No in-progress workout found');
        }
        
    } catch (error) {
        console.error('âŒ Error checking for in-progress workout:', error);
    }
}

function showInProgressWorkoutPrompt(workoutData) {
    if (window.showingProgressPrompt) return;
    window.showingProgressPrompt = true;
    
    const workoutDate = new Date(workoutData.date).toLocaleDateString();
    const message = `You have an in-progress "${workoutData.workoutType}" workout from ${workoutDate}.\n\nWould you like to continue where you left off?`;
    
    setTimeout(() => {
        if (confirm(message)) {
            continueInProgressWorkout(); // Already exists in this file
        } else {
            discardInProgressWorkout(); // Already exists in this file
        }
        window.showingProgressPrompt = false;
    }, 500);
}

// ===================================================================
// EXERCISE HISTORY INTEGRATION
// ===================================================================

// REMOVED: loadExerciseHistoryForModal() - loadExerciseHistory() is called directly instead

// Load last workout hint - shows quick summary without full history
export async function loadLastWorkoutHint(exerciseName, exerciseIndex) {
    const hintDiv = document.getElementById(`last-workout-hint-${exerciseIndex}`);
    if (!hintDiv || !AppState.currentUser) {
        if (hintDiv) hintDiv.remove();
        return;
    }

    try {
        const { collection, query, orderBy, limit, getDocs } = await import('./firebase-config.js');
        const { db } = await import('./firebase-config.js');

        const workoutsRef = collection(db, "users", AppState.currentUser.uid, "workouts");
        const q = query(workoutsRef, orderBy("lastUpdated", "desc"), limit(10));
        const querySnapshot = await getDocs(q);

        const today = AppState.getTodayDateString();
        let lastWorkoutData = null;

        querySnapshot.forEach((doc) => {
            if (lastWorkoutData) return; // Already found

            const data = doc.data();
            if (data.date === today) return; // Skip today

            // Search for this exercise
            if (data.exerciseNames) {
                for (const [key, name] of Object.entries(data.exerciseNames)) {
                    if (name === exerciseName && data.exercises?.[key]?.sets?.length > 0) {
                        const sets = data.exercises[key].sets;
                        const completedSets = sets.filter(s => s && (s.reps || s.weight));
                        if (completedSets.length > 0) {
                            lastWorkoutData = {
                                date: data.date,
                                sets: completedSets
                            };
                            break;
                        }
                    }
                }
            }
        });

        if (lastWorkoutData) {
            const avgReps = Math.round(lastWorkoutData.sets.reduce((sum, s) => sum + (s.reps || 0), 0) / lastWorkoutData.sets.length);
            const avgWeight = Math.round(lastWorkoutData.sets.reduce((sum, s) => sum + (s.weight || 0), 0) / lastWorkoutData.sets.length);

            hintDiv.innerHTML = `
                <i class="fas fa-history"></i>
                <strong>Last:</strong> ${lastWorkoutData.sets.length} sets × ${avgReps} reps × ${avgWeight} lbs
                <span style="color: var(--text-secondary); margin-left: 0.5rem;">(${new Date(lastWorkoutData.date).toLocaleDateString()})</span>
            `;
        } else {
            hintDiv.innerHTML = `<i class="fas fa-info-circle"></i> No previous workout found for this exercise`;
        }
    } catch (error) {
        console.error('Error loading last workout hint:', error);
        hintDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Could not load previous workout`;
    }
}