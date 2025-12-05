// Core Workout Management Module - core/workout-core.js
// Handles workout session execution, exercise management, and workout lifecycle

import { AppState } from '../utils/app-state.js';
import { showNotification, convertWeight, updateProgress, setHeaderMode, stopActiveWorkoutRestTimer } from '../ui/ui-helpers.js';
import { setBottomNavVisible } from '../ui/navigation.js';
import { saveWorkoutData, loadExerciseHistory } from '../data/data-manager.js';
import { scheduleRestNotification, cancelRestNotification, isFCMAvailable } from '../utils/push-notification-manager.js';
import {
    detectLocation, setSessionLocation, getSessionLocation,
    lockLocation, isLocationLocked, resetLocationState,
    showLocationPrompt, updateLocationIndicator, getCurrentCoords
} from '../features/location-service.js';

// Global timer state to persist across modal re-renders
let activeRestTimer = null;

// Listen for exercise rename events to refresh active workout UI
window.addEventListener('exerciseRenamed', (event) => {
    // If we have an active workout, refresh the exercises display
    if (AppState.currentWorkout) {
        renderExercises();
        // Close exercise modal if open and re-open with refreshed data
        const modal = document.getElementById('exercise-modal');
        if (modal && !modal.classList.contains('hidden')) {
            const { exerciseIndex } = event.detail;
            if (typeof exerciseIndex === 'number') {
                focusExercise(exerciseIndex);
            }
        }
    }
});

// ===================================================================
// CORE WORKOUT LIFECYCLE
// ===================================================================

export async function startWorkout(workoutType) {
    if (!AppState.currentUser) {
        alert('Please sign in to start a workout');
        return;
    }

    // Check if there's already a workout for today
    const { loadTodaysWorkout } = await import('../data/data-manager.js');
    const todaysWorkout = await loadTodaysWorkout(AppState);

    if (todaysWorkout) {
        if (todaysWorkout.completedAt && !todaysWorkout.cancelledAt) {
            // There's already a COMPLETED workout today - warn about overriding
            const workoutName = todaysWorkout.workoutType || 'Unknown';
            const confirmed = confirm(
                `⚠️ You already completed a workout today: "${workoutName}"\n\n` +
                `Starting a new workout will REPLACE your completed workout data.\n\n` +
                `Your previous workout progress, PRs from that session, and stats will be overwritten.\n\n` +
                `Are you sure you want to start a new workout?`
            );

            if (!confirmed) {
                // Navigate back to dashboard
                const { navigateTo } = await import('../ui/navigation.js');
                navigateTo('dashboard');
                return;
            }
            // User confirmed - proceed to start new workout (will overwrite completed one)
        } else if (!todaysWorkout.completedAt && !todaysWorkout.cancelledAt) {
            // There's an in-progress workout - existing behavior
            const workoutName = todaysWorkout.workoutType || 'Unknown';
            const confirmed = confirm(
                `⚠️ You already have a workout in progress: "${workoutName}"\n\n` +
                `Starting a new workout will cancel your current workout and you'll lose any unsaved progress.\n\n` +
                `Do you want to continue?`
            );

            if (!confirmed) {
                // Navigate back to dashboard
                const { navigateTo } = await import('../ui/navigation.js');
                navigateTo('dashboard');
                return;
            }

            // User confirmed - cancel the current workout (mark it as cancelled in Firebase)
            // Mark the existing workout as cancelled and save
            AppState.savedData = {
                ...todaysWorkout,
                cancelledAt: new Date().toISOString()
            };
            await saveWorkoutData(AppState);

            // Clear in-progress workout reference
            window.inProgressWorkout = null;

            // Hide the resume banner since we're starting a new workout
            const resumeBanner = document.getElementById('resume-workout-banner');
            if (resumeBanner) {
                resumeBanner.classList.add('hidden');
            }
        }
        // If cancelled workout exists, proceed without warning
    }

    // Detect location via GPS
    await initializeWorkoutLocation();

    // Find the workout plan (refresh from Firebase if not found in cache)
    let workout = AppState.workoutPlans.find(plan =>
        plan.day === workoutType || plan.name === workoutType || plan.id === workoutType
    );

    // If not found in cache, try refreshing from Firebase
    if (!workout) {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();

        workout = AppState.workoutPlans.find(plan =>
            plan.day === workoutType || plan.name === workoutType || plan.id === workoutType
        );
    }

    if (!workout) {
        showNotification(`Workout "${workoutType}" not found. It may have been deleted.`, 'error');
        return;
    }

    // Set up workout state - DEEP CLONE to avoid modifying the template
    AppState.currentWorkout = JSON.parse(JSON.stringify(workout));
    AppState.workoutStartTime = new Date();
    AppState.savedData = {
        workoutType: workoutType,
        date: AppState.getTodayDateString(),
        startedAt: new Date().toISOString(),
        exercises: {},
        version: '2.0',
        location: getSessionLocation() || null
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
    const workoutManagementSection = document.getElementById('workout-management-section');
    const exerciseManagerSection = document.getElementById('exercise-manager-section');
    const historySection = document.getElementById('workout-history-section');
    const dashboard = document.getElementById('dashboard');

    if (workoutSelector) workoutSelector.classList.add('hidden');
    if (workoutManagementSection) workoutManagementSection.classList.add('hidden');
    if (exerciseManagerSection) exerciseManagerSection.classList.add('hidden');
    if (historySection) historySection.classList.add('hidden');
    if (dashboard) dashboard.classList.add('hidden');
    if (activeWorkout) activeWorkout.classList.remove('hidden');

    // Hide main header (no logo on active workout), show bottom nav
    setHeaderMode(false);
    setBottomNavVisible(true);

    // Hide resume banner when starting a workout
    const resumeBanner = document.getElementById('resume-workout-banner');
    if (resumeBanner) resumeBanner.classList.add('hidden');

    // Start duration timer
    startWorkoutTimer();

    // Render exercises
    renderExercises();

    // Update location indicator
    updateLocationIndicator(getSessionLocation(), isLocationLocked());

    // Initialize window.inProgressWorkout so saveWorkoutData can update it
    // This ensures exercise additions/deletions persist when closing/reopening workout
    window.inProgressWorkout = {
        ...AppState.savedData,
        originalWorkout: AppState.currentWorkout
    };

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

}

export async function completeWorkout() {
    if (!AppState.currentWorkout) return;

    // Stop duration timer and rest timer display
    AppState.clearTimers();
    stopActiveWorkoutRestTimer();

    const isEditingHistorical = window.editingHistoricalWorkout === true;

    // Update saved data with completion info
    if (isEditingHistorical) {
        // Editing historical workout - preserve original duration and completedAt
        // Only update completedAt if it wasn't already set
        if (!AppState.savedData.completedAt) {
            AppState.savedData.completedAt = new Date().toISOString();
        }
        // Preserve original duration - use stored value or keep existing
        if (window.editingWorkoutOriginalDuration) {
            AppState.savedData.totalDuration = window.editingWorkoutOriginalDuration;
        }
    } else {
        // New workout - calculate duration normally
        AppState.savedData.completedAt = new Date().toISOString();
        AppState.savedData.totalDuration = Math.floor((new Date() - AppState.workoutStartTime) / 1000);
    }

    // Save final data
    await saveWorkoutData(AppState);

    // Process workout for PRs - ONLY for new workouts, not edits (to avoid duplicate PRs)
    if (!isEditingHistorical) {
        const { PRTracker } = await import('../features/pr-tracker.js');
        await PRTracker.processWorkoutForPRs(AppState.savedData);
    }

    // Reset state BEFORE showing dashboard (critical order!)
    AppState.reset();

    // Clear in-progress workout since it's now completed
    window.inProgressWorkout = null;

    // Clear editing flags if we were editing a historical workout
    window.editingHistoricalWorkout = false;
    window.editingWorkoutDate = null;
    window.editingWorkoutOriginalDuration = null;

    // Reset buttons to normal mode
    updateWorkoutButtonsForEditMode(false);

    // Show dashboard after completion
    const { showDashboard } = await import('../ui/dashboard-ui.js');
    showDashboard();
}

export function cancelWorkout(skipConfirmation = false) {
    if (!AppState.currentWorkout) return;

    // Confirm cancellation unless explicitly skipped
    if (!skipConfirmation) {
        if (!confirm('Cancel this workout? All progress will be saved but marked as cancelled.')) {
            return; // User chose not to cancel
        }
    }

    AppState.savedData.cancelledAt = new Date().toISOString();
    saveWorkoutData(AppState);

    AppState.reset();
    AppState.clearTimers();
    stopActiveWorkoutRestTimer();

    // Clear in-progress workout since it's been cancelled
    window.inProgressWorkout = null;

    // Clear editing flags if we were editing a historical workout
    window.editingHistoricalWorkout = false;
    window.editingWorkoutDate = null;
    window.editingWorkoutOriginalDuration = null;

    // Reset buttons to normal mode
    updateWorkoutButtonsForEditMode(false);

    // Navigate to dashboard instead of legacy workout selector
    import('../ui/navigation.js').then(({ navigateTo }) => {
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
    
    
    // Hide the resume banner
    const banner = document.getElementById('resume-workout-banner');
    if (banner) banner.classList.add('hidden');
    window.showingProgressPrompt = false;
    if (!window.inProgressWorkout) {
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
    const sections = ['workout-selector', 'dashboard', 'workout-history-section', 'stats-section', 'workout-management-section', 'exercise-manager-section', 'location-management-section'];
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('hidden');
    });

    const activeWorkout = document.getElementById('active-workout');
    if (activeWorkout) activeWorkout.classList.remove('hidden');

    // Hide main header (no logo on active workout), show bottom nav
    setHeaderMode(false);
    setBottomNavVisible(true);

    // Set workout name in header
    const workoutNameElement = document.getElementById('current-workout-name');
    if (workoutNameElement) {
        workoutNameElement.textContent = window.inProgressWorkout.workoutType;
    }

    // Resume timer
    startWorkoutTimer();

    // Render exercises
    renderExercises();

    // Restore location from saved data
    if (window.inProgressWorkout.location) {
        setSessionLocation(window.inProgressWorkout.location);
        // If workout has logged sets, location should be locked
        const hasLoggedSets = Object.values(window.inProgressWorkout.exercises || {}).some(ex =>
            ex.sets && ex.sets.some(set => set.reps || set.weight)
        );
        if (hasLoggedSets) {
            lockLocation();
        }
        updateLocationIndicator(window.inProgressWorkout.location, hasLoggedSets);
    }

    // Clear in-progress state
    // DON'T clear this - keep it so we can resume again if user navigates away
    // It will be cleared when workout is completed or cancelled
    // window.inProgressWorkout = null;

}

// ===================================================================
// EDIT HISTORICAL WORKOUT
// ===================================================================

/**
 * Edit a historical workout - loads it into the active workout UI
 * @param {string} dateStr - The date of the workout to edit (YYYY-MM-DD)
 */
export async function editHistoricalWorkout(dateStr) {
    if (!AppState.currentUser) {
        alert('Please sign in to edit workouts');
        return;
    }

    // Load the workout data from Firebase
    const { loadWorkoutByDate } = await import('../data/data-manager.js');
    const workoutData = await loadWorkoutByDate(AppState, dateStr);

    if (!workoutData) {
        showNotification('Could not load workout data', 'error');
        return;
    }

    // Close the workout detail modal if open
    if (window.workoutHistory) {
        window.workoutHistory.closeWorkoutDetailModal();
    }

    // Set flag to indicate we're editing a historical workout
    window.editingHistoricalWorkout = true;
    window.editingWorkoutDate = dateStr;

    // Reconstruct the workout structure for the active workout UI
    // Use originalWorkout if available, otherwise reconstruct from exercises
    let workoutExercises = [];

    if (workoutData.originalWorkout && workoutData.originalWorkout.exercises) {
        // Use the saved template structure
        workoutExercises = workoutData.originalWorkout.exercises.map((ex, index) => {
            const key = `exercise_${index}`;
            const savedExercise = workoutData.exercises?.[key] || {};
            return {
                machine: ex.machine || ex.name,
                sets: ex.sets || 3,
                reps: ex.reps || 10,
                weight: ex.weight || 0,
                video: ex.video || '',
                equipment: savedExercise.equipment || ex.equipment || null,
                equipmentLocation: savedExercise.equipmentLocation || ex.equipmentLocation || null
            };
        });
    } else if (workoutData.exerciseNames) {
        // Reconstruct from exerciseNames and exercises data
        const exerciseKeys = Object.keys(workoutData.exerciseNames).sort();
        workoutExercises = exerciseKeys.map(key => {
            const name = workoutData.exerciseNames[key];
            const savedExercise = workoutData.exercises?.[key] || {};
            return {
                machine: name,
                sets: 3,
                reps: 10,
                weight: 0,
                video: '',
                equipment: savedExercise.equipment || null,
                equipmentLocation: savedExercise.equipmentLocation || null
            };
        });
    }

    // Set up the current workout state
    AppState.currentWorkout = {
        day: workoutData.workoutType,
        name: workoutData.workoutType,
        exercises: workoutExercises
    };

    // Restore saved data (sets, reps, weights, notes)
    AppState.savedData = {
        ...workoutData,
        date: dateStr // Ensure we save back to the same date
    };

    // Restore exercise units
    AppState.exerciseUnits = workoutData.exerciseUnits || {};

    // Set location from saved workout (or clear if none)
    if (workoutData.location) {
        setSessionLocation(workoutData.location);
    } else {
        setSessionLocation(null);
    }

    // For historical edits, don't lock the location - allow changes
    // resetLocationState is not needed since we're editing, not starting fresh

    // Store the original duration - DON'T recalculate when editing
    window.editingWorkoutOriginalDuration = workoutData.totalDuration || null;

    // DON'T set workoutStartTime - we'll use the stored duration instead
    AppState.workoutStartTime = null;

    // Hide all sections and show active workout
    const sections = ['workout-selector', 'dashboard', 'workout-history-section', 'stats-section', 'workout-management-section', 'exercise-manager-section', 'location-management-section'];
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('hidden');
    });

    const activeWorkout = document.getElementById('active-workout');
    if (activeWorkout) activeWorkout.classList.remove('hidden');

    // Set workout name in header with (Editing) indicator
    const workoutNameElement = document.getElementById('current-workout-name');
    if (workoutNameElement) {
        workoutNameElement.textContent = `${workoutData.workoutType} (Editing)`;
    }

    // Update section title to "Edit Workout"
    const sectionTitle = document.getElementById('active-workout-title');
    if (sectionTitle) {
        sectionTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Workout';
    }

    // Show close button for edit mode (X in top right)
    const closeBtn = document.getElementById('edit-workout-close-btn');
    if (closeBtn) closeBtn.classList.remove('hidden');

    // Hide header and nav for workout view (no hamburger needed - has X to close)
    setHeaderMode(false);
    setBottomNavVisible(false);

    // Display static duration (don't start a live timer when editing)
    displayStaticDuration(workoutData.totalDuration);

    // Render exercises
    renderExercises();

    // Update location indicator to show current location with change option
    // Don't lock it so user can change it when editing
    const currentLocation = getSessionLocation();
    updateLocationIndicator(currentLocation, false);

    // Update button labels for edit mode
    updateWorkoutButtonsForEditMode(true);
}

/**
 * Update workout action buttons for edit mode vs new workout mode
 */
function updateWorkoutButtonsForEditMode(isEditing) {
    const cancelBtn = document.querySelector('.btn-workout-action.btn-cancel');
    const finishBtn = document.querySelector('.btn-workout-action.btn-finish');
    const sectionTitle = document.getElementById('active-workout-title');
    const closeBtn = document.getElementById('edit-workout-close-btn');

    if (isEditing) {
        // Edit mode: Cancel = discard edits, Finish = save changes
        if (cancelBtn) {
            cancelBtn.innerHTML = '<i class="fas fa-times"></i> Discard';
            cancelBtn.onclick = discardEditedWorkout;
        }
        if (finishBtn) {
            finishBtn.innerHTML = '<i class="fas fa-check"></i> Save';
        }
        // Edit mode title and close button handled in enterWorkoutEditMode
    } else {
        // Normal mode: Cancel = cancel workout, Finish = complete workout
        if (cancelBtn) {
            cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel';
            cancelBtn.onclick = cancelWorkout;
        }
        if (finishBtn) {
            finishBtn.innerHTML = '<i class="fas fa-check"></i> Finish';
        }
        // Reset section title to "Active Workout"
        if (sectionTitle) {
            sectionTitle.innerHTML = '<i class="fas fa-dumbbell"></i> Active Workout';
        }
        // Hide close button
        if (closeBtn) closeBtn.classList.add('hidden');
    }
}

/**
 * Discard edits to a historical workout (don't delete, just exit without saving)
 */
export async function discardEditedWorkout() {
    // Clear editing flags
    window.editingHistoricalWorkout = false;
    window.editingWorkoutDate = null;
    window.editingWorkoutOriginalDuration = null;

    // Reset buttons to normal mode
    updateWorkoutButtonsForEditMode(false);

    // Clear current workout state
    AppState.currentWorkout = null;
    AppState.savedData = {};

    // Navigate back to history
    const { navigateTo } = await import('../ui/navigation.js');
    navigateTo('history');
}

export async function discardInProgressWorkout() {
    
    
    // Hide the resume banner
    const banner = document.getElementById('resume-workout-banner');
    if (banner) banner.classList.add('hidden');
    window.showingProgressPrompt = false;
    if (!window.inProgressWorkout) {
        return;
    }
    
    const confirmDiscard = confirm(
        `Are you sure you want to discard your in-progress "${window.inProgressWorkout.workoutType}" workout? ` +
        `This will permanently delete your progress and cannot be undone.`
    );
    
    if (!confirmDiscard) {
        return;
    }
    
    try {
        // Store workout info BEFORE clearing variables
        const workoutToDelete = {
            date: window.inProgressWorkout.date,
            workoutType: window.inProgressWorkout.workoutType,
            userId: AppState.currentUser?.uid
        };
        
        // DELETE the workout from Firebase FIRST
        try {
            if (workoutToDelete.userId && workoutToDelete.date) {
                const { deleteDoc, doc, db } = await import('../data/firebase-config.js');

                const workoutRef = doc(db, "users", workoutToDelete.userId, "workouts", workoutToDelete.date);
                await deleteDoc(workoutRef);
            }
        } catch (firebaseError) {
            console.error('Error deleting workout from Firebase', firebaseError);
        }
        
        // Clear in-progress workout state
        window.inProgressWorkout = null;
        
        // Clear any related UI state
        AppState.reset();
        
        // Show workout selector
        showWorkoutSelector();
        
    } catch (error) {
        console.error('Error during discard process:', error);
        alert('Error discarding workout. Please try again.');
    }
}

// ===================================================================
// EXERCISE RENDERING AND MANAGEMENT
// ===================================================================

export function renderExercises() {
    const container = document.getElementById('exercise-list');
    if (!container || !AppState.currentWorkout) return;

    container.innerHTML = '';

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
                <p>Use the "Add Exercise" button above to get started!</p>
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

    // Use the larger of completedSets or totalSets for display to avoid showing 4/3
    const displayTotal = Math.max(completedSets, totalSets);

    // Fix: Exercise is only completed when ALL sets are done
    const isCompleted = completedSets >= totalSets && completedSets > 0;

    if (isCompleted) {
        card.classList.add('completed');
        // Don't collapse - show full exercise with green border indicator
    }
    
    // Calculate progress percentage using displayTotal to avoid >100%
    const progressPercent = displayTotal > 0 ? Math.min((completedSets / displayTotal) * 100, 100) : 0;

    // Build equipment display string
    let equipmentDisplay = '';
    if (exercise.equipment) {
        equipmentDisplay = exercise.equipment;
        if (exercise.equipmentLocation) {
            equipmentDisplay += ` @ ${exercise.equipmentLocation}`;
        }
    }

    card.innerHTML = `
        <div class="exercise-title-row" onclick="focusExercise(${index})" style="cursor: pointer;">
            <h3 class="exercise-title">${exercise.machine}</h3>
            ${equipmentDisplay ? `<div class="exercise-equipment-tag">${equipmentDisplay}</div>` : ''}
        </div>
        <div class="exercise-progress-row" onclick="focusExercise(${index})" style="cursor: pointer;">
            <div class="progress-bar-track">
                <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-text">${completedSets}/${displayTotal}</span>
        </div>
        <div class="exercise-actions-row">
            <button class="btn-text btn-text-danger" onclick="event.stopPropagation(); deleteExerciseFromWorkout(${index})">
                <i class="fas fa-trash-alt"></i> Delete
            </button>
        </div>
    `;

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

    // Build title with icons for edit/change
    const equipmentText = exercise.equipment
        ? `${exercise.equipment}${exercise.equipmentLocation ? ' @ ' + exercise.equipmentLocation : ''}`
        : null;

    title.innerHTML = `${exercise.machine} <a href="#" class="exercise-edit-icon" onclick="event.preventDefault(); editExerciseDefaults('${exercise.machine.replace(/'/g, "\\'")}')"><i class="fas fa-pen"></i></a><br><span class="modal-equipment-subtitle">${equipmentText || 'No equipment'} <a href="#" class="equipment-change-icon" onclick="event.preventDefault(); changeExerciseEquipment(${index})"><i class="fas fa-sync-alt"></i></a></span>`;
    
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

    // Hide nav when exercise modal is open (no hamburger needed - has X to close)
    setHeaderMode(false);
    setBottomNavVisible(false);

    // Restore rest timer from AppState if it exists for this exercise
    if (AppState.activeRestTimer && AppState.activeRestTimer.exerciseIndex === index) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            restoreTimerFromAppState(index);
        }, 50);
    }
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
                    `<button id="show-video-btn-${exerciseIndex}" class="btn btn-primary btn-small" onclick="showExerciseVideoAndToggleButton('${exercise.video}', '${exercise.machine}', ${exerciseIndex})">
                        <i class="fas fa-play"></i> Form Video
                    </button>
                    <button id="hide-video-btn-${exerciseIndex}" class="btn btn-secondary btn-small hidden" onclick="hideExerciseVideoAndToggleButton(${exerciseIndex})">
                        <i class="fas fa-times"></i> Hide Video
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

        <div class="set-controls" style="display: flex; gap: 0.5rem; justify-content: center; margin: 1rem 0;">
            <button class="btn btn-secondary btn-small" onclick="removeSetFromExercise(${exerciseIndex})" title="Remove last set">
                <i class="fas fa-minus"></i> Remove Set
            </button>
            <button class="btn btn-primary btn-small" onclick="addSetToExercise(${exerciseIndex})" title="Add new set">
                <i class="fas fa-plus"></i> Add Set
            </button>
        </div>

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
        } else {
            AppState.savedData.exercises[exerciseKey].sets[setIndex][field] = numValue;
        }
    } else {
        AppState.savedData.exercises[exerciseKey].sets[setIndex][field] = null;
    }
    
    // Save to Firebase
    saveWorkoutData(AppState);
    
    // Update UI
    updateProgress(AppState);
    renderExercises();

    const setData = AppState.savedData.exercises[exerciseKey].sets[setIndex];

    if (setData.reps && setData.weight) {
        // Lock location on first completed set (can't change location after logging sets)
        if (!isLocationLocked()) {
            lockLocation();
            updateLocationIndicator(getSessionLocation(), true);

            // Record when location was locked
            if (AppState.savedData) {
                AppState.savedData.locationLockedAt = new Date().toISOString();
            }

            // Associate current workout location with any equipment used in this workout
            const sessionLocation = getSessionLocation();
            if (sessionLocation && AppState.currentWorkout?.exercises) {
                associateLocationWithWorkoutEquipment(sessionLocation);
            }
        }

        // Check for PR (returns true if PR was found)
        const isPR = await checkSetForPR(exerciseIndex, setIndex);

        autoStartRestTimer(exerciseIndex, setIndex);

        // Only show generic notification if it's not a PR
        if (!isPR) {
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

        const { PRTracker } = await import('../features/pr-tracker.js');
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
    }
}

// Add set from exercise modal (refreshes modal instead of full exercise list)
export function addSetToExercise(exerciseIndex) {
    if (!AppState.currentWorkout) return;

    // Save timer state before re-render
    saveActiveTimerState(exerciseIndex);

    // Increment set count in current workout template
    AppState.currentWorkout.exercises[exerciseIndex].sets =
        (AppState.currentWorkout.exercises[exerciseIndex].sets || 3) + 1;

    // Update the exercise cards in the background
    renderExercises();

    // Refresh the exercise modal to show new set
    focusExercise(exerciseIndex);

    // Restore timer after re-render
    restoreActiveTimerState(exerciseIndex);
}

// Remove last set from exercise modal (refreshes modal instead of full exercise list)
export function removeSetFromExercise(exerciseIndex) {
    if (!AppState.currentWorkout) return;

    const currentSets = AppState.currentWorkout.exercises[exerciseIndex].sets || 3;

    // Don't allow removing if only 1 set remains
    if (currentSets <= 1) {
        return;
    }

    // Save timer state before re-render
    saveActiveTimerState(exerciseIndex);

    // Decrement set count
    AppState.currentWorkout.exercises[exerciseIndex].sets = currentSets - 1;

    // Remove the last set's saved data if it exists
    const exerciseKey = `exercise_${exerciseIndex}`;
    if (AppState.savedData.exercises?.[exerciseKey]?.sets) {
        const lastSetIndex = currentSets - 1;
        if (AppState.savedData.exercises[exerciseKey].sets[lastSetIndex]) {
            AppState.savedData.exercises[exerciseKey].sets.splice(lastSetIndex, 1);
            saveWorkoutData(AppState);
        }
    }

    // Update the exercise cards in the background
    renderExercises();

    // Refresh the exercise modal to show updated sets
    focusExercise(exerciseIndex);

    // Restore timer after re-render
    restoreActiveTimerState(exerciseIndex);
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
}

export function markExerciseComplete(exerciseIndex) {
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    const exerciseKey = `exercise_${exerciseIndex}`;

    if (!AppState.savedData.exercises[exerciseKey]) {
        AppState.savedData.exercises[exerciseKey] = { sets: [], notes: '' };
    }

    // Remove empty sets (sets without both reps AND weight)
    // Only keep sets that have actual data entered
    const existingSets = AppState.savedData.exercises[exerciseKey].sets || [];
    AppState.savedData.exercises[exerciseKey].sets = existingSets.filter(set => {
        // Keep set if it has reps OR weight (or both)
        return (set.reps && set.reps > 0) || (set.weight && set.weight > 0);
    });

    const keptSets = AppState.savedData.exercises[exerciseKey].sets.length;

    // Update the exercise template to match the actual number of completed sets
    // This ensures the exercise card shows the correct count and marks as complete
    exercise.sets = keptSets;

    saveWorkoutData(AppState);
    renderExercises();

    // Close modal if open
    const modal = document.getElementById('exercise-modal');
    if (modal) modal.classList.add('hidden');
}

function markSetComplete(exerciseIndex, setIndex) {
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    updateSet(exerciseIndex, setIndex, 'reps', exercise.reps || 10);
    updateSet(exerciseIndex, setIndex, 'weight', exercise.weight || 50);
}

export function deleteExerciseFromWorkout(exerciseIndex) {
    if (!AppState.currentWorkout) return;

    const exerciseName = AppState.currentWorkout.exercises[exerciseIndex].machine;

    // Show confirmation dialog
    if (!confirm(`Remove ${exerciseName} from workout?`)) {
        return; // User cancelled
    }

    // Delete the exercise
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
    // Removed notification - UI update is self-evident
}

// ===================================================================
// EXERCISE ADDITION AND SWAPPING
// ===================================================================

export function addExerciseToActiveWorkout() {
    if (!AppState.currentWorkout) {
        return;
    }

    if (!AppState.currentUser) {
        alert('Please sign in to add exercises');
        return;
    }

    // Open the exercise library modal for adding to active workout
    const modal = document.getElementById('exercise-library-modal');
    if (modal) {
        // Set flag so we know exercises should be added to active workout
        window.addingToActiveWorkout = true;
        modal.classList.remove('hidden');

        // Load exercises into the modal
        if (window.openExerciseLibrary) {
            window.openExerciseLibrary('activeWorkout');
        }
    }
}

export function confirmExerciseAddToWorkout(exerciseData) {
    if (!AppState.currentWorkout) return false;

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
        return false;
    }

    const exerciseName = exercise.name || exercise.machine;

    // Check for duplicate exercise in current workout
    const isDuplicate = AppState.currentWorkout.exercises.some(ex =>
        ex.machine === exerciseName || ex.name === exerciseName
    );

    if (isDuplicate) {
        showNotification(`"${exerciseName}" is already in this workout`, 'warning');
        return false;
    }

    // Add exercise to current workout (include equipment if provided)
    const newExercise = {
        machine: exerciseName,
        sets: exercise.sets || 3,
        reps: exercise.reps || 10,
        weight: exercise.weight || 50,
        video: exercise.video || '',
        equipment: exercise.equipment || null,
        equipmentLocation: exercise.equipmentLocation || null
    };

    AppState.currentWorkout.exercises.push(newExercise);

    // Save and update UI
    saveWorkoutData(AppState);
    renderExercises();

    // Close exercise library
    if (window.exerciseLibrary && window.exerciseLibrary.close) {
        window.exerciseLibrary.close();
    }

    return true;
    
}

// REMOVED: swapExercise() and confirmExerciseSwap() - Replaced by delete + add workflow

export function closeExerciseModal() {
    const modal = document.getElementById('exercise-modal');
    if (modal) {
        modal.classList.add('hidden');
    }

    // Show nav again when exercise modal closes (if still in active workout)
    // Keep header hidden (no logo) during active workout
    if (AppState.currentWorkout) {
        setHeaderMode(false);
        setBottomNavVisible(true);
    }

    // Save current timer state to AppState before closing (for restore on reopen)
    if (AppState.focusedExerciseIndex !== null) {
        const modalTimer = document.getElementById(`modal-rest-timer-${AppState.focusedExerciseIndex}`);
        if (modalTimer && modalTimer.timerData && !modalTimer.classList.contains('hidden')) {
            // Update AppState with current timeLeft so timer resumes correctly on reopen
            if (AppState.activeRestTimer && AppState.activeRestTimer.exerciseIndex === AppState.focusedExerciseIndex) {
                // Store the current remaining time as the new duration baseline
                AppState.activeRestTimer.duration = modalTimer.timerData.timeLeft;
                AppState.activeRestTimer.startTime = Date.now();
                AppState.activeRestTimer.pausedTime = 0;
                AppState.activeRestTimer.isPaused = modalTimer.timerData.isPaused;
            }

            // Cancel animation frame (timer continues via AppState)
            if (modalTimer.timerData.animationFrame) {
                cancelAnimationFrame(modalTimer.timerData.animationFrame);
            }
            modalTimer.classList.add('hidden');
        }
    }

    AppState.focusedExerciseIndex = null;
}

// ===================================================================
// EQUIPMENT CHANGE DURING WORKOUT
// ===================================================================

// Store the exercise index that's being edited for equipment
let pendingEquipmentChangeIndex = null;

export async function changeExerciseEquipment(exerciseIndex) {
    if (!AppState.currentWorkout) return;

    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    const exerciseName = exercise.machine;

    // Store the index for the callback
    pendingEquipmentChangeIndex = exerciseIndex;

    // Set flag to indicate we're changing equipment (not adding new exercise)
    window.changingEquipmentDuringWorkout = true;

    // Open the equipment picker modal
    const modal = document.getElementById('equipment-picker-modal');
    const titleEl = document.getElementById('equipment-picker-exercise-name');
    const listEl = document.getElementById('equipment-picker-list');
    const newNameInput = document.getElementById('equipment-picker-new-name');
    const newLocationInput = document.getElementById('equipment-picker-new-location');

    if (titleEl) titleEl.textContent = `for "${exerciseName}"`;
    if (newNameInput) newNameInput.value = exercise.equipment || '';
    // Pre-fill location with exercise location, or fall back to current session location
    const sessionLocation = getSessionLocation();
    if (newLocationInput) newLocationInput.value = exercise.equipmentLocation || sessionLocation || '';

    // Load equipment that has been used with this exercise
    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const exerciseEquipment = await workoutManager.getEquipmentForExercise(exerciseName);
        const allEquipment = await workoutManager.getUserEquipment();

        // Render equipment options
        if (listEl) {
            if (exerciseEquipment.length > 0) {
                listEl.innerHTML = exerciseEquipment.map(eq => `
                    <div class="equipment-option ${eq.name === exercise.equipment ? 'selected' : ''}"
                         data-equipment-id="${eq.id}"
                         data-equipment-name="${eq.name}"
                         data-equipment-location="${eq.location || ''}">
                        <div class="equipment-option-radio"></div>
                        <div class="equipment-option-details">
                            <div class="equipment-option-name">${eq.name}</div>
                            ${eq.location ? `<div class="equipment-option-location">${eq.location}</div>` : ''}
                        </div>
                    </div>
                `).join('');

                // Add click handlers for selection
                listEl.querySelectorAll('.equipment-option').forEach(option => {
                    option.addEventListener('click', () => {
                        listEl.querySelectorAll('.equipment-option').forEach(o => o.classList.remove('selected'));
                        option.classList.add('selected');
                        // Clear the new equipment inputs when selecting existing
                        if (newNameInput) newNameInput.value = '';
                        if (newLocationInput) newLocationInput.value = '';
                    });
                });
            } else {
                listEl.innerHTML = `<div class="equipment-picker-empty">No equipment saved for this exercise yet</div>`;
            }
        }

        // Populate suggestions datalists
        const equipmentDatalist = document.getElementById('equipment-picker-suggestions');
        const locationDatalist = document.getElementById('equipment-picker-location-suggestions');

        if (equipmentDatalist) {
            const equipmentNames = [...new Set(allEquipment.map(eq => eq.name))];
            equipmentDatalist.innerHTML = equipmentNames.map(name => `<option value="${name}">`).join('');
        }

        if (locationDatalist) {
            // Get locations from equipment AND from saved gym locations
            const equipmentLocations = allEquipment.filter(eq => eq.location).map(eq => eq.location);
            let savedGymLocations = [];
            try {
                savedGymLocations = await workoutManager.getUserLocations();
                savedGymLocations = savedGymLocations.map(loc => loc.name);
            } catch (e) {
                // Ignore errors fetching gym locations
            }
            const allLocations = [...new Set([...equipmentLocations, ...savedGymLocations])];
            locationDatalist.innerHTML = allLocations.map(loc => `<option value="${loc}">`).join('');
        }
    } catch (error) {
        console.error('❌ Error loading equipment:', error);
        if (listEl) {
            listEl.innerHTML = `<div class="equipment-picker-empty">Error loading equipment</div>`;
        }
    }

    if (modal) modal.classList.remove('hidden');
}

// Apply the selected equipment to the current workout exercise
export async function applyEquipmentChange(equipmentName, equipmentLocation, equipmentVideo = null) {
    if (pendingEquipmentChangeIndex === null || !AppState.currentWorkout) {
        window.changingEquipmentDuringWorkout = false;
        return;
    }

    const exerciseIndex = pendingEquipmentChangeIndex;
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];
    const exerciseName = exercise.machine;

    // Update the exercise with new equipment
    exercise.equipment = equipmentName || null;
    exercise.equipmentLocation = equipmentLocation || null;

    // Save equipment to Firebase if it's new (include video)
    if (equipmentName) {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);
            await workoutManager.getOrCreateEquipment(equipmentName, equipmentLocation, exerciseName, equipmentVideo);
        } catch (error) {
            console.error('❌ Error saving equipment:', error);
        }
    }

    // Save workout data
    saveWorkoutData(AppState);

    // Update UI
    renderExercises();

    // Refresh the modal if it's still open
    if (AppState.focusedExerciseIndex === exerciseIndex) {
        focusExercise(exerciseIndex);
    }

    // Removed unnecessary notifications for equipment updates

    // Clean up
    pendingEquipmentChangeIndex = null;
    window.changingEquipmentDuringWorkout = false;
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

    // Set timer text to primary color (teal)
    timerDisplay.style.color = 'var(--primary)';

    let timeLeft = duration;
    let isPaused = false;
    let startTime = Date.now();
    let pausedTime = 0;

    // Schedule server-side push notification for iOS background support
    // This will send a notification even if the app is backgrounded/locked
    if (isFCMAvailable()) {
        scheduleRestNotification(duration, exercise.machine || 'your next set')
            .catch(() => {}); // Silently fail - local timer still works
    }

    const updateDisplay = () => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const checkTime = () => {
        if (isPaused) return;

        const elapsed = Math.floor((Date.now() - startTime - pausedTime) / 1000);
        timeLeft = Math.max(0, duration - elapsed);

        // Update stored timeLeft so save/restore works correctly
        if (modalTimer.timerData) {
            modalTimer.timerData.timeLeft = timeLeft;
        }

        updateDisplay();

        if (timeLeft === 0) {
            timerDisplay.textContent = 'Ready!';
            timerDisplay.style.color = 'var(--success)';

            // Mark timer as completed in AppState (but don't clear - shows "Ready" on dashboard)
            if (AppState.activeRestTimer) {
                AppState.activeRestTimer.completed = true;
            }

            // Vibration
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200]);
            }

            // Don't show local notification - server-side push handles it
            // The push notification is scheduled via Cloud Functions and will arrive
            // even if the app is backgrounded (on supported devices)
            // On iOS, the push may only appear when app is foregrounded due to platform limitations

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
        duration: duration,

        pause: () => {
            isPaused = !isPaused;
            if (isPaused) {
                pausedTime += Date.now() - startTime;
            } else {
                startTime = Date.now();
            }

            // Update AppState for dashboard display
            if (AppState.activeRestTimer) {
                AppState.activeRestTimer.isPaused = isPaused;
            }

            const pauseBtn = modalTimer.querySelector('.modal-rest-controls .btn:first-child');
            if (pauseBtn) {
                pauseBtn.innerHTML = isPaused ?
                    '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
            }
        },

        skip: () => {
            if (modalTimer.timerData.animationFrame) {
                cancelAnimationFrame(modalTimer.timerData.animationFrame);
            }
            modalTimer.classList.add('hidden');
            timerDisplay.style.color = 'var(--primary)';
            modalTimer.timerData = null;

            // Clear AppState timer
            AppState.activeRestTimer = null;

            // Cancel the server-side scheduled notification
            cancelRestNotification().catch(() => {});
        }
    };

    // Store timer state in AppState for dashboard display
    AppState.activeRestTimer = {
        exerciseIndex,
        exerciseName: exercise.machine,
        duration,
        startTime,
        pausedTime,
        isPaused: false
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

        // Clear AppState timer
        AppState.activeRestTimer = null;

        // Cancel the server-side scheduled notification
        cancelRestNotification().catch(() => {});
    }

    modalTimer.classList.add('hidden');
    
    // Reset display
    const timerDisplay = modalTimer.querySelector('.modal-rest-display');
    if (timerDisplay) {
        timerDisplay.style.color = 'var(--primary)';
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

    // Set timer text to primary color (teal)
    timerDisplay.style.color = 'var(--primary)';

    // Use the saved timeLeft as our starting point, reset startTime to now
    // This ensures the timer continues from where it was saved, not recalculated
    let timeLeft = timerState.timeLeft;
    let isPaused = timerState.isPaused;
    let startTime = Date.now(); // Always reset to now
    let pausedTime = 0; // Reset since we're using current timeLeft as baseline
    let initialTimeLeft = timeLeft; // Store initial value for elapsed calculation

    const updateDisplay = () => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const checkTime = () => {
        if (isPaused) return;

        const elapsed = Math.floor((Date.now() - startTime - pausedTime) / 1000);
        timeLeft = Math.max(0, initialTimeLeft - elapsed);

        // Update stored timeLeft so save/restore works correctly
        if (modalTimer.timerData) {
            modalTimer.timerData.timeLeft = timeLeft;
        }

        updateDisplay();

        if (timeLeft === 0) {
            timerDisplay.textContent = 'Ready!';
            timerDisplay.style.color = 'var(--success)';

            // Vibration
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200]);
            }

            // Don't show local notification - server-side push handles it
            // The push notification is scheduled via Cloud Functions

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
            timerDisplay.style.color = 'var(--primary)';
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
        timerDisplay.style.color = 'var(--primary)';
    }
    
    // Reset pause button
    const pauseBtn = modalTimer.querySelector('.modal-rest-controls .btn:first-child');
    if (pauseBtn) {
        pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    }
}

// Save timer state to global variable before modal re-render
function saveActiveTimerState(exerciseIndex) {
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    if (!modalTimer || modalTimer.classList.contains('hidden') || !modalTimer.timerData) {
        activeRestTimer = null;
        return;
    }

    const exercise = AppState.currentWorkout?.exercises[exerciseIndex];
    const exerciseLabel = modalTimer.querySelector('.modal-rest-exercise')?.textContent || `Rest Period - ${exercise?.machine || 'Exercise'}`;

    // Cancel animation frame but preserve state
    if (modalTimer.timerData.animationFrame) {
        cancelAnimationFrame(modalTimer.timerData.animationFrame);
    }

    activeRestTimer = {
        exerciseIndex,
        exerciseLabel,
        timeLeft: modalTimer.timerData.timeLeft,
        isPaused: modalTimer.timerData.isPaused,
        startTime: modalTimer.timerData.startTime,
        pausedTime: modalTimer.timerData.pausedTime
    };
}

// Restore timer state from global variable after modal re-render
function restoreActiveTimerState(exerciseIndex) {
    if (!activeRestTimer || activeRestTimer.exerciseIndex !== exerciseIndex) {
        return;
    }

    // Small delay to ensure DOM is ready
    setTimeout(() => {
        restoreModalRestTimer(exerciseIndex, activeRestTimer);
        activeRestTimer = null;
    }, 50);
}

// Restore timer from AppState when re-opening exercise modal after navigation
function restoreTimerFromAppState(exerciseIndex) {
    if (!AppState.activeRestTimer || AppState.activeRestTimer.exerciseIndex !== exerciseIndex) {
        return;
    }

    const timer = AppState.activeRestTimer;
    const exercise = AppState.currentWorkout?.exercises[exerciseIndex];

    // Calculate current time left
    const elapsed = timer.isPaused ? 0 : Math.floor((Date.now() - timer.startTime - timer.pausedTime) / 1000);
    const timeLeft = Math.max(0, timer.duration - elapsed);

    // Build timer state compatible with restoreModalRestTimer
    const timerState = {
        exerciseLabel: `Rest Period - ${exercise?.machine || 'Exercise'}`,
        timeLeft: timeLeft,
        isPaused: timer.isPaused,
        startTime: timer.startTime,
        pausedTime: timer.pausedTime
    };

    if (timeLeft > 0 && !timer.completed) {
        restoreModalRestTimer(exerciseIndex, timerState);
    } else if (timer.completed || timeLeft === 0) {
        // Show "Ready!" state
        const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
        const timerDisplay = modalTimer?.querySelector('.modal-rest-display');
        if (modalTimer && timerDisplay) {
            modalTimer.classList.remove('hidden');
            timerDisplay.textContent = 'Ready!';
            timerDisplay.style.color = 'var(--success)';
        }
    }
}

export function startWorkoutTimer() {
    const durationDisplay = document.getElementById('workout-duration');
    if (!durationDisplay) return;

    // Clear any existing timer first to prevent duplicates
    if (AppState.workoutDurationTimer) {
        clearInterval(AppState.workoutDurationTimer);
        AppState.workoutDurationTimer = null;
    }

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

// Display a static duration (used when editing historical workouts - no live timer)
export function displayStaticDuration(totalSeconds) {
    const durationDisplay = document.getElementById('workout-duration');
    if (!durationDisplay) return;

    // Clear any existing timer
    if (AppState.workoutDurationTimer) {
        clearInterval(AppState.workoutDurationTimer);
        AppState.workoutDurationTimer = null;
    }

    if (totalSeconds && totalSeconds > 0) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        durationDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
        durationDisplay.textContent = '--:--';
    }
}

export function updateWorkoutDuration() {
    if (AppState.workoutDurationTimer) {
        // Timer is already running
        return;
    }
    startWorkoutTimer();
}

export function autoStartRestTimer(exerciseIndex, setIndex) {
    
    const modal = document.getElementById('exercise-modal');
    const modalHidden = modal?.classList.contains('hidden');
    const focusedMatch = AppState.focusedExerciseIndex === exerciseIndex;
    
    if (modal && !modalHidden && focusedMatch) {
        startModalRestTimer(exerciseIndex, 90);
    } else {
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
        return;
    }

    iframe.src = embedUrl;
    videoSection.classList.remove('hidden');
}

export function hideExerciseVideo() {
    const videoSection = document.getElementById('exercise-video-section');
    const iframe = document.getElementById('exercise-video-iframe');

    if (videoSection) videoSection.classList.add('hidden');
    if (iframe) iframe.src = '';
}

// Wrapper functions to handle button toggling
export function showExerciseVideoAndToggleButton(videoUrl, exerciseName, exerciseIndex) {
    showExerciseVideo(videoUrl, exerciseName);

    // Hide "Form Video" button, show "Hide Video" button
    const showBtn = document.getElementById(`show-video-btn-${exerciseIndex}`);
    const hideBtn = document.getElementById(`hide-video-btn-${exerciseIndex}`);

    if (showBtn) showBtn.classList.add('hidden');
    if (hideBtn) hideBtn.classList.remove('hidden');
}

export function hideExerciseVideoAndToggleButton(exerciseIndex) {
    hideExerciseVideo();

    // Show "Form Video" button, hide "Hide Video" button
    const showBtn = document.getElementById(`show-video-btn-${exerciseIndex}`);
    const hideBtn = document.getElementById(`hide-video-btn-${exerciseIndex}`);

    if (showBtn) showBtn.classList.remove('hidden');
    if (hideBtn) hideBtn.classList.add('hidden');
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
}

// ===================================================================
// NAVIGATION HELPERS
// ===================================================================

export async function editExerciseDefaults(exerciseName) {

    // Find the exercise in the database by name
    const exercise = AppState.exerciseDatabase.find(ex =>
        (ex.name || ex.machine) === exerciseName
    );

    if (!exercise) {
        return;
    }

    // Close the exercise modal first
    closeExerciseModal();

    // Set flag to indicate we're editing from active workout
    window.editingFromActiveWorkout = true;

    // Open the exercise manager and edit this exercise
    const { openExerciseManager, editExercise } = await import('../ui/exercise-manager-ui.js');
    openExerciseManager();

    // Small delay to let the manager UI load
    setTimeout(() => {
        const exerciseId = exercise.id || `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        editExercise(exerciseId);
    }, 100);
}

export async function showWorkoutSelector() {
    const workoutSelector = document.getElementById('workout-selector');
    const activeWorkout = document.getElementById('active-workout');
    const workoutManagement = document.getElementById('workout-management');
    const historySection = document.getElementById('workout-history-section');
    
    // If user has an active workout in progress, show that instead of selector
    if (AppState.currentWorkout && AppState.savedData.workoutType) {
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

    // In-progress workout check removed - dashboard banner handles this now
}

async function checkForInProgressWorkout() {
    // Skip if already showing prompt
    if (window.showingProgressPrompt) return;
    
    // Skip if user is already in an active workout - they dont need a prompt
    if (AppState.currentWorkout && AppState.savedData.workoutType) {
        return;
    }
    
    try {
        const { loadTodaysWorkout } = await import('../data/data-manager.js');
        const todaysData = await loadTodaysWorkout(AppState);
        
        // Check if there's an incomplete workout from today
        if (todaysData && !todaysData.completedAt && !todaysData.cancelledAt) {
            
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
            // Use todaysData.originalWorkout if it exists (contains modified exercise list)
            window.inProgressWorkout = {
                ...todaysData,
                originalWorkout: todaysData.originalWorkout || workoutPlan
            };
            
            // Show the prompt
            showInProgressWorkoutPrompt(todaysData);
        } else {
        }
        
    } catch (error) {
        console.error('âŒError checking for in-progress workout:', error);
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
        const { collection, query, orderBy, limit, getDocs } = await import('../data/firebase-config.js');
        const { db } = await import('../data/firebase-config.js');

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

// ===================================================================
// LOCATION MANAGEMENT
// ===================================================================

/**
 * Initialize location detection when starting a workout
 * Checks GPS, matches against saved locations, prompts for new location name if needed
 */
async function initializeWorkoutLocation() {
    try {
        // Check if session location was already set (e.g., from Manage Locations page)
        const existingSessionLocation = getSessionLocation();
        if (existingSessionLocation) {
            // Already have a location, update visit count and proceed
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);
            const savedLocations = await workoutManager.getUserLocations();
            const existingLoc = savedLocations.find(loc => loc.name === existingSessionLocation);
            if (existingLoc) {
                await workoutManager.updateLocationVisit(existingLoc.id);
            }
            return;
        }

        // Reset any previous location state
        resetLocationState();

        // Get user's saved locations from Firebase
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const savedLocations = await workoutManager.getUserLocations();

        // Detect current GPS location and match against saved
        const result = await detectLocation(savedLocations);

        if (result.location) {
            // Matched a known location
            setSessionLocation(result.location.name);
            // Update visit count
            await workoutManager.updateLocationVisit(result.location.id);
        } else if (result.isNew && result.coords) {
            // At a new location - prompt user to name it
            await promptForNewLocation(result.coords, workoutManager, savedLocations);
        } else if (!result.coords) {
            // No GPS available - prompt user to select/enter location
            await promptForLocationSelection(workoutManager, savedLocations);
        }

    } catch (error) {
        console.error('❌ Error initializing workout location:', error);
        // Don't block workout start on location errors
    }
}

/**
 * Prompt user to name a new location (when GPS detected a new location)
 */
function promptForNewLocation(coords, workoutManager, savedLocations) {
    return new Promise((resolve) => {
        // Populate datalist with existing locations for autocomplete
        const datalist = document.getElementById('saved-locations-list');
        if (datalist && savedLocations.length > 0) {
            datalist.innerHTML = savedLocations
                .map(loc => `<option value="${loc.name}">`)
                .join('');
        }

        showLocationPrompt(
            // On save
            async (name) => {
                try {
                    // Check if this is an existing location name
                    const existing = savedLocations.find(loc => loc.name === name);

                    if (existing) {
                        setSessionLocation(name);
                        await workoutManager.updateLocationVisit(existing.id);
                    } else {
                        // Create new location with GPS coordinates
                        await workoutManager.saveLocation({
                            name: name,
                            latitude: coords.latitude,
                            longitude: coords.longitude
                        });
                        setSessionLocation(name);
                    }

                    // Removed notification - location indicator already shows
                } catch (error) {
                    console.error('❌ Error saving location:', error);
                }
                resolve();
            },
            // On skip
            () => {
                resolve();
            }
        );
    });
}

/**
 * Prompt user to select or enter a location (when no GPS available)
 */
function promptForLocationSelection(workoutManager, savedLocations) {
    return new Promise((resolve) => {
        // Populate datalist with existing locations for autocomplete
        const datalist = document.getElementById('saved-locations-list');
        if (datalist && savedLocations.length > 0) {
            datalist.innerHTML = savedLocations
                .map(loc => `<option value="${loc.name}">`)
                .join('');
        }

        showLocationPrompt(
            // On save
            async (name) => {
                try {
                    // Check if this is an existing location name
                    const existing = savedLocations.find(loc => loc.name === name);

                    if (existing) {
                        setSessionLocation(name);
                        await workoutManager.updateLocationVisit(existing.id);
                    } else {
                        // Create new location without GPS coordinates
                        await workoutManager.saveLocation({
                            name: name,
                            latitude: null,
                            longitude: null
                        });
                        setSessionLocation(name);
                    }

                    // Removed notification - location indicator already shows
                } catch (error) {
                    console.error('❌ Error saving location:', error);
                }
                resolve();
            },
            // On skip
            () => {
                resolve();
            }
        );
    });
}

/**
 * Associate the current workout location with all equipment used in the workout
 * Called when location is locked (first set logged)
 */
async function associateLocationWithWorkoutEquipment(locationName) {
    if (!locationName || !AppState.currentWorkout?.exercises) return;

    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);

        // Get all equipment from user's collection
        const allEquipment = await workoutManager.getUserEquipment();
        if (!allEquipment || allEquipment.length === 0) return;

        // Loop through exercises in the workout that have equipment
        for (const exercise of AppState.currentWorkout.exercises) {
            const equipmentName = exercise.equipment;
            if (!equipmentName) continue;

            // Find matching equipment by name
            const matchingEquipment = allEquipment.find(eq => eq.name === equipmentName);
            if (matchingEquipment && matchingEquipment.id) {
                // Add the workout's location to this equipment
                await workoutManager.addLocationToEquipment(matchingEquipment.id, locationName);
            }
        }
    } catch (error) {
        console.error('❌ Error associating location with equipment:', error);
    }
}

/**
 * Change workout location (called when user clicks location indicator)
 */
export async function changeWorkoutLocation() {
    // Don't allow changing if location is locked (first set already logged)
    if (isLocationLocked()) {
        showNotification('Location is locked after logging sets', 'warning');
        return;
    }

    const modal = document.getElementById('workout-location-selector-modal');
    const listContainer = document.getElementById('workout-saved-locations-list');
    const newNameInput = document.getElementById('workout-location-new-name');

    if (!modal || !listContainer) return;

    try {
        // Load saved locations
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const savedLocations = await workoutManager.getUserLocations();

        // Store for later use
        window._locationSelectorData = { savedLocations, workoutManager };

        // Populate location list
        if (savedLocations.length === 0) {
            listContainer.innerHTML = '<div class="location-list-empty">No saved locations yet</div>';
        } else {
            const currentLocation = getSessionLocation();
            listContainer.innerHTML = savedLocations.map(loc => `
                <div class="location-option ${loc.name === currentLocation ? 'selected' : ''}"
                     data-location-id="${loc.id}" data-location-name="${loc.name}"
                     onclick="selectWorkoutLocationOption(this)">
                    <i class="fas fa-map-marker-alt"></i>
                    <span class="location-option-name">${loc.name}</span>
                    <span class="location-option-visits">${loc.visitCount || 0} visits</span>
                </div>
            `).join('');
        }

        // Clear new name input
        if (newNameInput) newNameInput.value = '';

        // Show modal
        modal.classList.remove('hidden');

    } catch (error) {
        console.error('❌ Error loading locations:', error);
        showNotification('Error loading locations', 'error');
    }
}

/**
 * Select a location from the list (workout location selector)
 */
export function selectWorkoutLocationOption(element) {
    // Remove selected from all
    document.querySelectorAll('#workout-saved-locations-list .location-option').forEach(el => el.classList.remove('selected'));
    // Add selected to clicked
    element.classList.add('selected');
    // Clear new name input
    const newNameInput = document.getElementById('workout-location-new-name');
    if (newNameInput) newNameInput.value = '';
}

/**
 * Close workout location selector modal
 */
export function closeWorkoutLocationSelector() {
    const modal = document.getElementById('workout-location-selector-modal');
    if (modal) modal.classList.add('hidden');
    window._locationSelectorData = null;
}

/**
 * Confirm workout location change
 */
export async function confirmWorkoutLocationChange() {
    const selectedOption = document.querySelector('#workout-saved-locations-list .location-option.selected');
    const newNameInput = document.getElementById('workout-location-new-name');
    const newName = newNameInput?.value.trim();

    let locationName = null;

    if (newName) {
        // User entered a new location name
        locationName = newName;

        // Save new location to Firebase
        try {
            const { workoutManager } = window._locationSelectorData || {};
            if (workoutManager) {
                const coords = getCurrentCoords();
                await workoutManager.saveLocation({
                    name: newName,
                    latitude: coords?.latitude || null,
                    longitude: coords?.longitude || null
                });
            }
        } catch (error) {
            console.error('❌ Error saving new location:', error);
        }
    } else if (selectedOption) {
        // User selected an existing location
        locationName = selectedOption.dataset.locationName;

        // Update visit count
        try {
            const { workoutManager } = window._locationSelectorData || {};
            if (workoutManager) {
                await workoutManager.updateLocationVisit(selectedOption.dataset.locationId);
            }
        } catch (error) {
            console.error('❌ Error updating location visit:', error);
        }
    }

    if (locationName) {
        setSessionLocation(locationName);
        updateLocationIndicator(locationName, isLocationLocked());

        // Update saved workout data
        if (AppState.savedData) {
            AppState.savedData.location = locationName;
            await saveWorkoutData(AppState);
        }

        // Removed notification - location indicator already shows
    }

    closeWorkoutLocationSelector();
}