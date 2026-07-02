// Workout History UI Module - core/workout-history-ui.js
// Handles workout history UI interactions with FULL CALENDAR VIEW

import { AppState } from '../utils/app-state.js';
import { showNotification, setHeaderMode, escapeHtml, escapeAttr } from './ui-helpers.js';
import { confirmSheet } from './confirm-sheet.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';
import { formatStatus } from '../utils/workout-helpers.js';

// ===================================================================
// MAIN HISTORY DISPLAY FUNCTION
// ===================================================================

export async function showWorkoutHistory() {
    if (!AppState.currentUser) {
        showNotification('Sign in to view workout history', 'warning');
        return;
    }

    // Hide all sections including dashboard
    const sections = ['workout-selector', 'active-workout', 'workout-management', 'dashboard', 'muscle-group-detail-section', 'exercise-detail-section', 'composition-detail-section'];
    sections.forEach((sectionId) => {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('hidden');
    });

    // Show history section
    const historySection = document.getElementById('workout-history-section');
    if (historySection) historySection.classList.remove('hidden');

    // Show full header with logo on history page
    setHeaderMode(true);

    // Show bottom nav and set active tab
    setBottomNavVisible(true);
    updateBottomNavActive('history');

    // Initialize calendar view
    await initializeCalendarView();
}

// ===================================================================
// CALENDAR INITIALIZATION AND DISPLAY
// ===================================================================

async function initializeCalendarView() {
    // Make sure workoutHistory is available
    if (!window.workoutHistory) {
        console.error(' workoutHistory not available');
        showNotification('Workout history not available', 'error');
        return;
    }

    try {
        // Initialize the calendar with current month
        await window.workoutHistory.initializeCalendar();
    } catch (error) {
        console.error(' Error initializing calendar:', error);
        showNotification('Error loading calendar view', 'error');
    }
}

// ===================================================================
// CALENDAR NAVIGATION FUNCTIONS
// ===================================================================

export function previousMonth() {
    if (!window.workoutHistory) {
        console.error(' workoutHistory not available');
        return;
    }

    window.workoutHistory.previousMonth();
}

export function nextMonth() {
    if (!window.workoutHistory) {
        console.error(' workoutHistory not available');
        return;
    }

    window.workoutHistory.nextMonth();
}

// ===================================================================
// WORKOUT DETAIL FUNCTIONS
// ===================================================================

export function viewWorkout(workoutId) {
    if (!window.workoutHistory) {
        console.error(' workoutHistory not available');
        return;
    }

    const workout = window.workoutHistory.getWorkoutDetails(workoutId);
    if (!workout) {
        showNotification('Workout not found', 'error');
        return;
    }

    // Show workout details
    showWorkoutDetailModal(workout);
}

// Schema v3.0: Alias for resumeWorkout that accepts docId
export function resumeWorkoutById(docId) {
    resumeWorkout(docId);
}

export async function resumeWorkout(workoutId) {
    if (!window.workoutHistory) return;

    const workout = window.workoutHistory.getWorkoutDetails(workoutId);
    if (!workout) {
        showNotification('Workout not found', 'error');
        return;
    }

    // Get workout name from formatted object or rawData
    const workoutName = workout.name || workout.rawData?.workoutType || 'Workout';

    // Check if workout can be resumed
    if (workout.status === 'completed') {
        showNotification("Can't resume a completed workout", 'warning');
        return;
    }

    if (workout.status === 'cancelled') {
        showNotification("Can't resume a cancelled workout", 'warning');
        return;
    }

    // Confirm and resume
    const workoutDate = workout.rawData?.date || workoutId;
    const ok = await confirmSheet({
        title: `Resume "${workoutName}" from ${new Date(workoutDate + 'T12:00:00').toLocaleDateString()}?`,
        confirmLabel: 'Resume workout',
        cancelLabel: 'Not now',
    });
    if (ok) {
        // Close the modal first
        if (window.workoutHistory) {
            window.workoutHistory.closeWorkoutDetailModal();
        }

        // Check if this is today's in-progress workout - use continueInProgressWorkout
        if (window.inProgressWorkout && window.inProgressWorkout.date === workoutDate) {
            if (typeof window.continueInProgressWorkout === 'function') {
                window.continueInProgressWorkout();
            } else {
                console.error('❌ continueInProgressWorkout function not available');
                showNotification("Couldn't resume workout — refresh the page", 'error');
            }
        } else {
            // For older workouts, load the workout data and continue it
            // Set inProgressWorkout from the raw data and then continue
            if (workout.rawData) {
                window.inProgressWorkout = workout.rawData;
                if (typeof window.continueInProgressWorkout === 'function') {
                    window.continueInProgressWorkout();
                } else {
                    console.error('❌ continueInProgressWorkout function not available');
                    showNotification("Couldn't resume workout — refresh the page", 'error');
                }
            } else {
                showNotification("Couldn't load workout data", 'error');
            }
        }
    }
}

export async function repeatWorkout(workoutId) {
    if (!window.workoutHistory) return;

    const workout = window.workoutHistory.getWorkoutDetails(workoutId);
    if (!workout) {
        showNotification('Workout not found', 'error');
        return;
    }

    // Get workout name from formatted object or rawData
    const workoutName = workout.name || workout.rawData?.workoutType || 'Workout';

    const ok = await confirmSheet({
        title: `Start a new workout based on "${workoutName}"?`,
        confirmLabel: 'Start workout',
        cancelLabel: 'Not now',
    });
    if (ok) {
        // Close the modal first
        if (window.workoutHistory) {
            window.workoutHistory.closeWorkoutDetailModal();
        }

        // Start a workout using the workout type/name
        if (typeof window.startWorkout === 'function') {
            window.startWorkout(workoutName);
        } else {
            console.error('❌ startWorkout function not available');
            showNotification("Couldn't start workout — refresh the page", 'error');
        }
    }
}

export function deleteWorkout(workoutId) {
    if (!window.workoutHistory) return;

    const workout = window.workoutHistory.getWorkoutDetails(workoutId);
    if (!workout) {
        showNotification('Workout not found', 'error');
        return;
    }

    // Use the global deleteWorkoutFromCalendar function which handles Firebase deletion
    if (typeof window.deleteWorkoutFromCalendar === 'function') {
        // Pass the date (workoutId is the date)
        window.deleteWorkoutFromCalendar(workoutId);
    } else {
        console.error('❌ Delete workout function not available');
        showNotification("Couldn't delete workout — refresh the page", 'error');
    }
}

export function retryWorkout(workoutId) {
    if (!window.workoutHistory) return;

    const workout = window.workoutHistory.getWorkoutDetails(workoutId);
    if (!workout) {
        showNotification('Workout not found', 'error');
        return;
    }

    // Get workout name from formatted object or rawData
    const workoutName = workout.name || workout.rawData?.workoutType || 'Workout';

    // Close the modal first
    if (window.workoutHistory) {
        window.workoutHistory.closeWorkoutDetailModal();
    }

    // Retry is the same as Repeat - start a new workout with the same type
    if (typeof window.startWorkout === 'function') {
        window.startWorkout(workoutName);
    } else {
        console.error('❌ startWorkout function not available');
        showNotification("Couldn't retry workout — refresh the page", 'error');
    }
}

// ===================================================================
// WORKOUT DETAIL MODAL
// ===================================================================

function showWorkoutDetailModal(workout) {
    const modal = document.getElementById('workout-detail-section');
    const title = document.getElementById('workout-detail-title');
    const content = document.getElementById('workout-detail-content');

    if (!modal || !title || !content) {
        console.error(' Workout detail modal elements not found');
        return;
    }

    // Set modal title
    title.textContent = `${workout.workoutType} - ${new Date(workout.date).toLocaleDateString()}`;

    // Build modal content
    let exerciseHTML = '';
    if (workout.exercises && workout.exercises.length > 0) {
        exerciseHTML = workout.exercises
            .map(
                (exercise) => `
            <div class="exercise-summary">
                <button class="exercise-summary__name" onclick="showExerciseDetail('${escapeAttr(exercise.name)}')" aria-label="View ${escapeAttr(exercise.name)} progress">
                    <span>${escapeHtml(exercise.name)}</span>
                    <i class="fas fa-chevron-right" aria-hidden="true"></i>
                </button>
                <div class="exercise-sets">
                    ${exercise.sets
                        .map(
                            (set, index) => `
                        <span class="set-summary">Set ${index + 1}: ${set.reps} reps @ ${set.weight}lbs</span>
                    `
                        )
                        .join('')}
                </div>
            </div>
        `
            )
            .join('');
    } else {
        exerciseHTML = '<p>No exercise details available</p>';
    }

    // Build action buttons using data attributes for event delegation
    const escapedId = escapeAttr(workout.id);
    const actionButtons = `
        <div class="modal-actions modal-actions--end">
            ${
                workout.status !== 'completed'
                    ? `
                <button class="btn btn-primary" data-action="resumeWorkout" data-workout-id="${escapedId}">
                    <i class="fas fa-play"></i> Resume
                </button>
            `
                    : ''
            }
            <button class="btn btn-secondary" data-action="repeatWorkout" data-workout-id="${escapedId}">
                <i class="fas fa-redo"></i> Repeat
            </button>
            <button class="btn btn-danger" data-action="deleteWorkout" data-workout-id="${escapedId}">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `;

    // Set modal content
    content.innerHTML = `
        <div class="workout-detail-summary">
            <div class="workout-meta">
                <div class="meta-item">
                    <strong>Status:</strong> ${escapeHtml(formatStatus(workout.status) || 'Unknown')}
                </div>
                <div class="meta-item">
                    <strong>Duration:</strong> ${escapeHtml(String(workout.duration || 'Unknown'))}m
                </div>
                <div class="meta-item">
                    <strong>Progress:</strong> ${parseInt(workout.progress) || 0}%
                </div>
            </div>
        </div>
        
        <div class="workout-exercises">
            <h3>Exercises & Sets</h3>
            ${exerciseHTML}
        </div>
        
        ${actionButtons}
    `;

    // Show as full-page section
    modal.classList.remove('hidden');

    // Event delegation for action buttons
    content.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const workoutId = btn.dataset.workoutId;
        if (action === 'resumeWorkout' && window.resumeWorkout) window.resumeWorkout(workoutId);
        else if (action === 'repeatWorkout' && window.repeatWorkout) window.repeatWorkout(workoutId);
        else if (action === 'deleteWorkout' && window.deleteWorkout) window.deleteWorkout(workoutId);
    });
}

export function closeWorkoutDetailModal() {
    const modal = document.getElementById('workout-detail-section');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ===================================================================
// ADDITIONAL CALENDAR HELPERS
// ===================================================================

export function clearAllHistoryFilters() {
    // Clear search input if it exists
    const searchInput = document.getElementById('history-search');
    if (searchInput) {
        searchInput.value = '';
    }

    // Clear the filter in workout-history module
    if (window.workoutHistory && typeof window.workoutHistory.filterHistory === 'function') {
        window.workoutHistory.filterHistory('');
    } else {
        console.warn('⚠️ Workout history filter function not available');
    }
}

// REMOVED: setupHistoryFilters(), applyHistoryFilters(), enhanceWorkoutData(),
// formatWorkoutForDisplay(), getWorkoutActionButton() - Never implemented TODO stubs

// ===================================================================
// EVENT LISTENER SETUP
// ===================================================================

export function setupWorkoutHistoryEventListeners() {
    // Set up modal close handlers
    const modal = document.getElementById('workout-detail-section');
    if (modal) {
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeWorkoutDetailModal();
            }
        });
    }

    // Set up ESC key handler for modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal:not(.hidden)');
            if (activeModal && activeModal.id === 'workout-detail-section') {
                closeWorkoutDetailModal();
            }
        }
    });
}

// ===================================================================
// INITIALIZE ON MODULE LOAD
// ===================================================================

// Auto-setup event listeners when module loads
setupWorkoutHistoryEventListeners();
