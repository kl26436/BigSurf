// UI utility functions

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

export function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.setAttribute('role', 'alert');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-secondary);
        color: var(--text-primary);
        padding: 1rem 1.5rem;
        border-radius: 8px;
        border: 1px solid var(--${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'primary'});
        z-index: 10000;
        animation: slideDown 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${escapeHtml(message)}</span>
        </div>
    `;

    const container = document.getElementById('notifications-container') || document.body;
    container.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
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

    if (fromUnit === toUnit) return Math.round(weight);

    if (fromUnit === 'lbs' && toUnit === 'kg') {
        return Math.round(weight * 0.453592 * 10) / 10; // 1 decimal for kg
    } else if (fromUnit === 'kg' && toUnit === 'lbs') {
        return Math.round(weight * 2.20462); // Whole number for lbs
    }

    return weight;
}

import { registerRestDisplayUpdater, unregisterRestDisplayUpdater } from '../utils/rest-display-manager.js';

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

// Lock body scroll when any modal is visible, unlock when all are hidden
export function initModalScrollLock() {
    const updateBodyScroll = () => {
        const anyModalVisible = document.querySelector('.modal:not(.hidden)');
        document.body.style.overflow = anyModalVisible ? 'hidden' : '';
    };

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName === 'class' && m.target.classList.contains('modal')) {
                updateBodyScroll();
                break;
            }
        }
    });

    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
}
