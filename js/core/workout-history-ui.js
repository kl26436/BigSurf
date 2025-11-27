// Workout History UI Module - core/workout-history-ui.js
// Handles workout history UI interactions with FULL CALENDAR VIEW

import { AppState } from './app-state.js';
import { showNotification } from './ui-helpers.js';

// ===================================================================
// MAIN HISTORY DISPLAY FUNCTION
// ===================================================================

export async function showWorkoutHistory() {
    if (!AppState.currentUser) {
        showNotification('Please sign in to view workout history', 'warning');
        return;
    }

    console.log('📅 Opening workout history with calendar view...');

    // Hide all sections including dashboard
    const sections = ['workout-selector', 'active-workout', 'workout-management', 'dashboard', 'stats-section'];
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('hidden');
    });

    // Show history section
    const historySection = document.getElementById('workout-history-section');
    if (historySection) historySection.classList.remove('hidden');

    // Initialize calendar view
    await initializeCalendarView();
}

// ===================================================================
// CALENDAR INITIALIZATION AND DISPLAY
// ===================================================================

async function initializeCalendarView() {
    console.log(' Initializing calendar view...');
    
    // Make sure workoutHistory is available
    if (!window.workoutHistory) {
        console.error(' workoutHistory not available');
        showNotification('Workout history not available', 'error');
        return;
    }
    
    try {
        // Initialize the calendar with current month
        await window.workoutHistory.initializeCalendar();
        
        console.log(' Calendar view initialized successfully');
        
    } catch (error) {
        console.error(' Error initializing calendar:', error);
        showNotification('Error loading calendar view', 'error');
    }
}

// ===================================================================
// CALENDAR NAVIGATION FUNCTIONS
// ===================================================================

export function previousMonth() {
    console.log(' Previous month clicked');
    
    if (!window.workoutHistory) {
        console.error(' workoutHistory not available');
        return;
    }
    
    window.workoutHistory.previousMonth();
}

export function nextMonth() {
    console.log(' Next month clicked');
    
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

export function resumeWorkout(workoutId) {
    if (!window.workoutHistory) return;
    
    const workout = window.workoutHistory.getWorkoutDetails(workoutId);
    if (!workout) {
        showNotification('Workout not found', 'error');
        return;
    }
    
    // Check if workout can be resumed
    if (workout.status === 'completed') {
        showNotification('Cannot resume a completed workout', 'warning');
        return;
    }
    
    if (workout.status === 'cancelled') {
        showNotification('Cannot resume a cancelled workout', 'warning');
        return;
    }
    
    // Confirm and resume
    const confirmMessage = `Resume "${workout.workoutType}" from ${new Date(workout.date).toLocaleDateString()}?`;
    if (confirm(confirmMessage)) {
        console.log(' Resuming workout:', workoutId);
        // TODO: Implement actual resume functionality
        showNotification('Resume functionality coming soon', 'info');
    }
}

export function repeatWorkout(workoutId) {
    if (!window.workoutHistory) return;
    
    const workout = window.workoutHistory.getWorkoutDetails(workoutId);
    if (!workout) {
        showNotification('Workout not found', 'error');
        return;
    }
    
    const confirmMessage = `Start a new workout based on "${workout.workoutType}"?`;
    if (confirm(confirmMessage)) {
        console.log(' Repeating workout:', workoutId);

        // Start a workout using the workout type/name
        if (typeof window.startWorkout === 'function') {
            window.startWorkout(workout.workoutType);
        } else {
            console.error('❌ startWorkout function not available');
            alert('Cannot start workout. Please refresh the page.');
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

    const confirmMessage = `Are you sure you want to delete "${workout.workoutType}" from ${new Date(workout.date).toLocaleDateString()}?\n\nThis action cannot be undone.`;
    
    if (confirm(confirmMessage)) {
        console.log(' Deleting workout:', workoutId);

        // Call the delete method from workout-history
        if (window.workoutHistory && typeof window.workoutHistory.deleteWorkout === 'function') {
            window.workoutHistory.deleteWorkout(workoutId);
        } else {
            console.error('❌ Delete workout function not available');
            alert('Cannot delete workout. Please refresh the page.');
        }
    }
}

export function retryWorkout(workoutId) {
    if (!window.workoutHistory) return;
    
    const workout = window.workoutHistory.getWorkoutDetails(workoutId);
    if (!workout) {
        showNotification('Workout not found', 'error');
        return;
    }
    
    console.log(' Retrying workout:', workoutId);
    // TODO: Implement actual retry functionality
    showNotification('Retry functionality coming soon', 'info');
}

// ===================================================================
// WORKOUT DETAIL MODAL
// ===================================================================

function showWorkoutDetailModal(workout) {
    const modal = document.getElementById('workout-detail-modal');
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
        exerciseHTML = workout.exercises.map(exercise => `
            <div class="exercise-summary">
                <h4>${exercise.name}</h4>
                <div class="exercise-sets">
                    ${exercise.sets.map((set, index) => `
                        <span class="set-summary">Set ${index + 1}: ${set.reps} reps @ ${set.weight}lbs</span>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } else {
        exerciseHTML = '<p>No exercise details available</p>';
    }
    
    // Build action buttons
    const actionButtons = `
        <div class="modal-actions" style="margin-top: 2rem; display: flex; gap: 1rem; justify-content: flex-end;">
            ${workout.status !== 'completed' ? `
                <button class="btn btn-primary" onclick="resumeWorkout('${workout.id}')">
                    <i class="fas fa-play"></i> Resume
                </button>
            ` : ''}
            <button class="btn btn-secondary" onclick="repeatWorkout('${workout.id}')">
                <i class="fas fa-redo"></i> Repeat
            </button>
            <button class="btn btn-danger" onclick="deleteWorkout('${workout.id}')">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `;
    
    // Set modal content
    content.innerHTML = `
        <div class="workout-detail-summary">
            <div class="workout-meta">
                <div class="meta-item">
                    <strong>Status:</strong> ${workout.status?.charAt(0).toUpperCase() + workout.status?.slice(1) || 'Unknown'}
                </div>
                <div class="meta-item">
                    <strong>Duration:</strong> ${workout.duration || 'Unknown'}m
                </div>
                <div class="meta-item">
                    <strong>Progress:</strong> ${workout.progress || 0}%
                </div>
            </div>
        </div>
        
        <div class="workout-exercises">
            <h3>Exercises & Sets</h3>
            ${exerciseHTML}
        </div>
        
        ${actionButtons}
    `;
    
    // Show modal
    modal.classList.remove('hidden');
}

export function closeWorkoutDetailModal() {
    const modal = document.getElementById('workout-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ===================================================================
// ADDITIONAL CALENDAR HELPERS
// ===================================================================

export function clearAllHistoryFilters() {
    console.log(' Clearing all history filters');
    // TODO: Implement filter clearing
    showNotification('Filter clearing coming soon', 'info');
}

// REMOVED: setupHistoryFilters(), applyHistoryFilters(), enhanceWorkoutData(),
// formatWorkoutForDisplay(), getWorkoutActionButton() - Never implemented TODO stubs

// ===================================================================
// EVENT LISTENER SETUP
// ===================================================================

export function setupWorkoutHistoryEventListeners() {
    console.log(' Setting up workout history event listeners...');
    
    // Set up modal close handlers
    const modal = document.getElementById('workout-detail-modal');
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
            if (activeModal && activeModal.id === 'workout-detail-modal') {
                closeWorkoutDetailModal();
            }
        }
    });
    
    console.log(' Workout history event listeners setup complete');
}

// ===================================================================
// INITIALIZE ON MODULE LOAD
// ===================================================================

// Auto-setup event listeners when module loads
setupWorkoutHistoryEventListeners();

console.log(' Workout History UI module loaded with calendar support');