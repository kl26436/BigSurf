// Workout History UI Module - core/workout-history-ui.js
// Handles workout history UI interactions with FULL CALENDAR VIEW

import { AppState } from '../utils/app-state.js';
import { db } from '../data/firebase-config.js';
import { showNotification, setHeaderMode } from './ui-helpers.js';
import { confirmSheet } from './confirm-sheet.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';

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

export async function viewWorkout(workoutId) {
    const wh = window.workoutHistory;
    if (!wh) {
        console.error(' workoutHistory not available');
        return;
    }

    // Consolidated on the rich detail modal (showFixedWorkoutModal: Edit /
    // Repeat / Save as workout / Delete) so every entry point — dashboard
    // last-session card, recent list, and calendar — shows the SAME detail
    // view. Resolve the full workout doc: prefer the loaded history row, else
    // the raw doc embedded in the calendar object. Both are the same shape.
    let workout =
        (wh.currentHistory || []).find((w) => w.id === workoutId || w.docId === workoutId) ||
        wh.getWorkoutDetails(workoutId)?.rawData;

    // Fallback: fetch straight from Firestore. Fresh freestyle workouts
    // caused the 7/4 07:56 "workout not found" report — completeWorkout
    // clears the dashboard's loadAllWorkouts cache but doesn't refresh
    // wh.currentHistory or calendarWorkouts, so tapping the last-session
    // card from the dashboard right after finishing a freestyle missed
    // both local caches and dead-ended in a toast. Direct doc fetch by
    // ID is the safety net.
    if (!workout && AppState.currentUser) {
        try {
            // Visible feedback while the network fetch runs — on gym wifi the
            // tapped row otherwise looks dead for a couple of seconds.
            showNotification('Loading…', 'silent', 1500);
            const { doc: fsDoc, getDoc } = await import('../data/firebase-config.js');
            const snap = await getDoc(fsDoc(db, 'users', AppState.currentUser.uid, 'workouts', workoutId));
            if (snap.exists()) workout = { id: snap.id, ...snap.data() };
        } catch (err) {
            console.error('viewWorkout: firestore fallback failed', err);
        }
    }

    if (!workout) {
        showNotification('Workout not found', 'error');
        return;
    }

    wh.showFixedWorkoutModal(workout, 0);
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

        // Freestyle sessions were never templates, so startWorkout() can't
        // resolve them by name — it threw "Workout not found" at exactly the
        // user who taps Repeat the most. Route them to a fresh freestyle
        // seeded with the same exercises (same focus label).
        const raw = workout.rawData || workout;
        const isFreestyle = !!raw?.isFreestyle
            || (raw?.templateId == null && /^Freestyle\b/.test(workoutName));
        if (isFreestyle && typeof window.startFreestyleWorkout === 'function') {
            const focus = (workoutName.match(/^Freestyle — (.+)$/) || [])[1] || null;
            const seed = Array.isArray(raw?.originalWorkout?.exercises)
                ? raw.originalWorkout.exercises : [];
            window.startFreestyleWorkout(focus, seed);
            return;
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
// The detail renderer lives in workout-history.js (showFixedWorkoutModal) —
// viewWorkout() above routes every tap path through it so there's one modal.

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
