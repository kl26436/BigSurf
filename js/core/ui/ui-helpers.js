// UI utility functions
import { registerRestDisplayUpdater, unregisterRestDisplayUpdater } from '../utils/rest-display-manager.js';

// Escape HTML to prevent XSS — use for any user-controlled string rendered in innerHTML
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Escape a string for safe use inside an inline onclick attribute value (single-quoted)
export function escapeAttr(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/'/g, '&#39;');
}

let lastErrorTime = 0;

export function showNotification(message, type = 'info') {
    // Rate limit error notifications — max 1 per 10 seconds to prevent stacking
    if (type === 'error') {
        const now = Date.now();
        if (now - lastErrorTime < 10000) return;
        lastErrorTime = now;
    }

    // Remove any existing notification
    const existing = document.querySelector('.app-toast');
    if (existing) existing.remove();

    const isError = type === 'error';
    const variantClass = type === 'success' ? 'app-toast--success'
        : isError ? 'app-toast--error'
        : 'app-toast--info';
    const duration = isError ? 4000 : 1500;

    const notification = document.createElement('div');
    notification.className = `app-toast ${variantClass}`;
    notification.setAttribute('role', 'alert');
    notification.textContent = message;

    document.body.appendChild(notification);
    requestAnimationFrame(() => { notification.classList.add('app-toast--show'); });

    setTimeout(() => {
        notification.classList.remove('app-toast--show');
        setTimeout(() => notification.remove(), 200);
    }, duration);
}

export function setTodayDisplay() {
    const today = new Date();
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    };

    const todayDateDisplay = document.getElementById('today-date-display');
    if (todayDateDisplay) {
        todayDateDisplay.textContent = `Today - ${today.toLocaleDateString('en-US', options)}`;
    }
}

export function convertWeight(weight, fromUnit, toUnit) {
    // Handle corrupted or invalid weights
    if (!weight || isNaN(weight) || weight <= 0) return 0;
    if (weight > 1000) {
        console.warn('⚠️ convertWeight: weight exceeds 1000, likely corrupted:', weight);
        return 0;
    }

    // 1 decimal everywhere — dashboard and detail pages must agree on displayed
    // values or users see mismatched numbers for the same underlying weight.
    if (fromUnit === toUnit) return Math.round(weight * 10) / 10;

    if (fromUnit === 'lbs' && toUnit === 'kg') {
        return Math.round(weight * 0.453592 * 10) / 10;
    } else if (fromUnit === 'kg' && toUnit === 'lbs') {
        return Math.round(weight * 2.20462 * 10) / 10;
    }

    return Math.round(weight * 10) / 10;
}

/**
 * Converts a stored weight to the user's preferred display unit.
 * Uses the set's originalUnit to determine what conversion is needed.
 * @param {number} weight - The stored weight value
 * @param {string} storedUnit - The unit it was stored in ('lbs' or 'kg')
 * @param {string} displayUnit - The unit to display in
 * @returns {{ value: number, label: string }} Converted weight and unit label
 */
export function displayWeight(weight, storedUnit, displayUnit) {
    if (!weight || isNaN(weight)) return { value: 0, label: displayUnit || 'lbs' };
    const unit = displayUnit || 'lbs';
    const stored = storedUnit || 'lbs';
    // 1 decimal everywhere — consistent with convertWeight() so the same
    // underlying weight reads identically on dashboard and detail views.
    if (stored === unit) return { value: Math.round(weight * 10) / 10, label: unit };
    if (stored === 'lbs' && unit === 'kg') {
        return { value: Math.round(weight * 0.453592 * 10) / 10, label: 'kg' };
    }
    if (stored === 'kg' && unit === 'lbs') {
        return { value: Math.round(weight * 2.20462 * 10) / 10, label: 'lbs' };
    }
    return { value: Math.round(weight * 10) / 10, label: unit };
}

// ---------------------------------------------------------------------------
// Height helpers — storage is always cm; display adapts to the user's unit
// preference (lbs → ft'in", kg → cm).
// ---------------------------------------------------------------------------

/** Format a cm value for display per unit pref. Returns '—' when unset. */
export function formatHeight(cm, unitPref) {
    if (cm == null || isNaN(cm) || cm <= 0) return '—';
    if (unitPref === 'lbs') {
        const totalInches = cm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches - feet * 12);
        // Carry if rounding pushed inches to 12
        if (inches === 12) return `${feet + 1}'0"`;
        return `${feet}'${inches}"`;
    }
    return `${Math.round(cm)} cm`;
}

/** Parse a user-typed height string back to cm. Accepts `5'10"`, `5 10`,
 *  `70in`, `178`, `178cm`. Returns null if unparseable. */
export function parseHeightToCm(input, unitPref) {
    if (input == null) return null;
    const raw = String(input).trim().toLowerCase();
    if (!raw) return null;

    // Explicit cm overrides unit pref
    if (raw.endsWith('cm')) {
        const n = parseFloat(raw);
        return isFinite(n) && n > 0 ? n : null;
    }
    // Explicit inches
    if (raw.endsWith('in') || raw.endsWith('"')) {
        const n = parseFloat(raw);
        return isFinite(n) && n > 0 ? Math.round(n * 2.54 * 10) / 10 : null;
    }
    // Feet'inches" style: 5'10", 5'10, 5' 10
    const ftIn = raw.match(/^(\d+)\s*(?:'|ft)\s*(\d{1,2})(?:"|in)?$/);
    if (ftIn) {
        const ft = parseInt(ftIn[1], 10);
        const inch = parseInt(ftIn[2], 10);
        if (ft >= 0 && inch >= 0 && inch < 12) {
            return Math.round((ft * 12 + inch) * 2.54 * 10) / 10;
        }
        return null;
    }
    // Bare number: interpret by unit pref
    const n = parseFloat(raw);
    if (!isFinite(n) || n <= 0) return null;
    if (unitPref === 'lbs') {
        // Heuristic: < 10 = feet (e.g. 5.83), 36-96 = inches, else invalid
        if (n < 10) return Math.round(n * 12 * 2.54 * 10) / 10;
        if (n < 100) return Math.round(n * 2.54 * 10) / 10;
        return n; // Assume cm if someone typed 178 despite lbs pref
    }
    return n; // Metric: bare number is cm
}

export function updateProgress(state) {
    if (!state.currentWorkout || !state.savedData.exercises) return;

    let completedSets = 0;
    let totalSets = 0;
    let completedExercises = 0;
    const totalExercises = state.currentWorkout.exercises.length;

    state.currentWorkout.exercises.forEach((exercise, index) => {
        const targetSets = exercise.sets || 3;
        totalSets += targetSets;
        const sets = state.savedData.exercises[`exercise_${index}`]?.sets || [];
        const exerciseCompletedSets = sets.filter((set) => set && set.reps && set.weight).length;
        completedSets += exerciseCompletedSets;

        // Count exercise as complete if all target sets are done
        if (exerciseCompletedSets >= targetSets) {
            completedExercises++;
        }
    });

    // Update sets display
    const progressEl = document.getElementById('workout-progress-display');
    if (progressEl) {
        progressEl.textContent = `${completedSets}/${totalSets}`;
    }

    // Update exercises count
    const exercisesEl = document.getElementById('workout-exercises-count');
    if (exercisesEl) {
        exercisesEl.textContent = `${completedExercises}/${totalExercises}`;
    }

    // Start the rest timer update loop for active workout page if not already running
    startActiveWorkoutRestTimer();
}

/**
 * Updates the rest timer display on the active workout page
 * Reads from AppState.activeRestTimer and updates #workout-rest-timer
 */
function updateActiveWorkoutRestDisplay() {
    const restTimerEl = document.getElementById('workout-rest-timer');
    const restStatEl = document.getElementById('workout-rest-stat');

    if (!restTimerEl) {
        // Element not on page, unregister this updater
        unregisterRestDisplayUpdater('activeWorkout');
        return;
    }

    if (window.AppState?.activeRestTimer && !window.AppState.activeRestTimer.completed) {
        const { startTime, pausedTime, duration, isPaused } = window.AppState.activeRestTimer;
        const elapsed = isPaused ? 0 : Math.floor((Date.now() - startTime - pausedTime) / 1000);
        const timeLeft = Math.max(0, duration - elapsed);

        if (timeLeft > 0) {
            const mins = Math.floor(timeLeft / 60);
            const secs = timeLeft % 60;
            restTimerEl.textContent = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
            if (restStatEl) {
                restStatEl.classList.add('rest-active');
                restStatEl.classList.remove('rest-ready');
            }
        } else {
            restTimerEl.textContent = 'Go!';
            window.AppState.activeRestTimer.completed = true;
            if (restStatEl) {
                restStatEl.classList.remove('rest-active');
                restStatEl.classList.add('rest-ready');
            }
        }
    } else if (window.AppState?.activeRestTimer?.completed) {
        restTimerEl.textContent = 'Go!';
        if (restStatEl) {
            restStatEl.classList.remove('rest-active');
            restStatEl.classList.add('rest-ready');
        }
    } else {
        restTimerEl.textContent = '--';
        if (restStatEl) {
            restStatEl.classList.remove('rest-active');
            restStatEl.classList.remove('rest-ready');
        }
    }
}

/**
 * Starts the rest timer update loop for the active workout page
 */
export function startActiveWorkoutRestTimer() {
    registerRestDisplayUpdater('activeWorkout', updateActiveWorkoutRestDisplay);
}

/**
 * Stops the rest timer update loop
 */
export function stopActiveWorkoutRestTimer() {
    unregisterRestDisplayUpdater('activeWorkout');
}

/**
 * Manage header visibility based on active section
 * Shows full header with logo on dashboard/history, hides on other pages
 * @param {boolean} showFullHeader - true for dashboard/history, false for other pages
 */
export function setHeaderMode(showFullHeader) {
    const mainHeader = document.getElementById('main-header');

    if (showFullHeader) {
        // Show full header with logo
        if (mainHeader) mainHeader.style.display = 'flex';
    } else {
        // Hide header
        if (mainHeader) mainHeader.style.display = 'none';
    }
}

// Open a modal — works for both <dialog> and <div> modals, accepts element or ID string
export function openModal(modal) {
    if (typeof modal === 'string') modal = document.getElementById(modal);
    if (!modal) return;
    if (modal.tagName === 'DIALOG') {
        if (!modal.open) modal.showModal();
    } else {
        modal.classList.remove('hidden');
    }
    // Focus trapping: store previously focused element and focus first interactive child
    modal._previousFocus = document.activeElement;
    const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
    // Escape key handler
    if (!modal._escHandler) {
        modal._escHandler = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeModal(modal);
            }
        };
    }
    modal.addEventListener('keydown', modal._escHandler);
    // Focus trap: keep Tab within modal
    if (!modal._trapHandler) {
        modal._trapHandler = (e) => {
            if (e.key !== 'Tab') return;
            const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
    }
    modal.addEventListener('keydown', modal._trapHandler);
}

// Close a modal — works for both <dialog> and <div> modals, accepts element or ID string
export function closeModal(modal) {
    if (typeof modal === 'string') modal = document.getElementById(modal);
    if (!modal) return;
    if (modal.tagName === 'DIALOG') {
        if (modal.open) modal.close();
    } else {
        modal.classList.add('hidden');
    }
    // Remove focus trap and Escape handlers
    if (modal._escHandler) modal.removeEventListener('keydown', modal._escHandler);
    if (modal._trapHandler) modal.removeEventListener('keydown', modal._trapHandler);
    // Restore focus to previously focused element
    if (modal._previousFocus && modal._previousFocus.focus) {
        modal._previousFocus.focus();
        modal._previousFocus = null;
    }
}

// Lock body scroll when any modal is visible, unlock when all are hidden
export function initModalScrollLock() {
    const updateBodyScroll = () => {
        const anyDivModal = document.querySelector('.modal:not(.hidden):not(dialog)');
        const anyDialogOpen = document.querySelector('dialog.modal[open]');
        document.body.style.overflow = (anyDivModal || anyDialogOpen) ? 'hidden' : '';
    };

    const observer = new MutationObserver(() => {
        updateBodyScroll();
    });

    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'open'] });
}
