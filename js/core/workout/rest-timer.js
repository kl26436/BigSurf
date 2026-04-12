// Rest Timer Module - core/workout/rest-timer.js
// Handles in-modal rest timer functionality during workouts

import { AppState } from '../utils/app-state.js';
import { Config } from '../utils/config.js';
import { getExerciseName } from '../utils/workout-helpers.js';
import {
    scheduleRestNotification,
    cancelRestNotification,
    isFCMAvailable,
} from '../utils/push-notification-manager.js';

// Global timer state to persist across modal re-renders
let activeRestTimer = null;

// ===================================================================
// REST TIMER FUNCTIONS
// ===================================================================

export function toggleModalRestTimer(exerciseIndex) {
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    if (!modalTimer) return;

    if (modalTimer.classList.contains('hidden')) {
        // Start new timer
        startModalRestTimer(exerciseIndex, Config.DEFAULT_REST_TIMER_SECONDS);
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

function startModalRestTimer(exerciseIndex, duration = Config.DEFAULT_REST_TIMER_SECONDS) {
    const exercise = AppState.currentWorkout.exercises[exerciseIndex];

    clearModalRestTimer(exerciseIndex);

    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    const exerciseLabel = modalTimer?.querySelector('.modal-rest-exercise');
    const timerDisplay = modalTimer?.querySelector('.modal-rest-display');

    if (!modalTimer || !exerciseLabel || !timerDisplay) return;

    const restExerciseName = getExerciseName(exercise);
    exerciseLabel.textContent = `Rest Period - ${restExerciseName}`;
    modalTimer.classList.remove('hidden');

    // Set timer text to primary color (teal)
    timerDisplay.classList.remove('timer-complete');

    let timeLeft = duration;
    let isPaused = false;
    let startTime = Date.now();
    let pausedTime = 0;

    // Schedule server-side push notification for iOS background support
    // This will send a notification even if the app is backgrounded/locked
    if (isFCMAvailable()) {
        const notifExerciseName = getExerciseName(exercise) !== 'Unknown Exercise' ? getExerciseName(exercise) : 'your next set';
        scheduleRestNotification(duration, notifExerciseName).catch(() => {}); // Silently fail - local timer still works
    }

    // Header timer element for persistent display
    const headerTimerEl = document.getElementById('workout-rest-timer');
    const headerStatEl = document.getElementById('workout-rest-stat');

    const updateDisplay = () => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        timerDisplay.textContent = timeStr;

        // Sync header timer
        if (headerTimerEl) headerTimerEl.textContent = timeStr;
        if (headerStatEl) headerStatEl.classList.add('timer-active');
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
            timerDisplay.classList.add('timer-complete');

            // Update header timer with "GO!" message
            if (headerTimerEl) headerTimerEl.textContent = 'GO!';
            if (headerStatEl) {
                headerStatEl.classList.remove('timer-active');
                headerStatEl.classList.add('timer-done');
            }

            // Reset header after 3 seconds
            setTimeout(() => {
                if (headerTimerEl) headerTimerEl.textContent = '--';
                if (headerStatEl) headerStatEl.classList.remove('timer-done');
            }, 3000);

            // Mark timer as completed in AppState (but don't clear - shows "Ready" on dashboard)
            if (AppState.activeRestTimer) {
                AppState.activeRestTimer.completed = true;
            }

            // Vibration
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200]);
            }

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
                pauseBtn.innerHTML = isPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
                pauseBtn.setAttribute('aria-label', isPaused ? 'Resume timer' : 'Pause timer');
            }
        },

        skip: () => {
            if (modalTimer.timerData.animationFrame) {
                cancelAnimationFrame(modalTimer.timerData.animationFrame);
            }
            modalTimer.classList.add('hidden');
            timerDisplay.classList.remove('timer-complete');
            modalTimer.timerData = null;

            // Reset header timer
            if (headerTimerEl) headerTimerEl.textContent = '--';
            if (headerStatEl) {
                headerStatEl.classList.remove('timer-active', 'timer-done');
            }

            // Clear AppState timer
            AppState.activeRestTimer = null;

            // Cancel the server-side scheduled notification
            cancelRestNotification().catch(() => {});
        },
    };

    // Store timer state in AppState for dashboard display
    const timerExerciseName = getExerciseName(exercise);
    AppState.activeRestTimer = {
        exerciseIndex,
        exerciseName: timerExerciseName,
        duration,
        startTime,
        pausedTime,
        isPaused: false,
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
        timerDisplay.classList.remove('timer-complete');
    }

    // Reset pause button
    const pauseBtn = modalTimer.querySelector('.modal-rest-controls .btn:first-child');
    if (pauseBtn) {
        pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        pauseBtn.setAttribute('aria-label', 'Pause timer');
    }
}

export function restoreModalRestTimer(exerciseIndex, timerState) {
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    const exerciseLabel = modalTimer?.querySelector('.modal-rest-exercise');
    const timerDisplay = modalTimer?.querySelector('.modal-rest-display');

    if (!modalTimer || !exerciseLabel || !timerDisplay) return;

    // Restore visual state
    exerciseLabel.textContent = timerState.exerciseLabel;
    modalTimer.classList.remove('hidden');

    // Set timer text to primary color (teal)
    timerDisplay.classList.remove('timer-complete');

    // Use the saved timeLeft as our starting point, reset startTime to now
    // This ensures the timer continues from where it was saved, not recalculated
    let timeLeft = timerState.timeLeft;
    let isPaused = timerState.isPaused;
    let startTime = Date.now(); // Always reset to now
    let pausedTime = 0; // Reset since we're using current timeLeft as baseline
    const initialTimeLeft = timeLeft; // Store initial value for elapsed calculation

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
            timerDisplay.classList.add('timer-complete');

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
                pauseBtn.innerHTML = isPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
                pauseBtn.setAttribute('aria-label', isPaused ? 'Resume timer' : 'Pause timer');
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
            timerDisplay.classList.remove('timer-complete');
            modalTimer.timerData = null;
        },
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
        timerDisplay.classList.remove('timer-complete');
    }

    // Reset pause button
    const pauseBtn = modalTimer.querySelector('.modal-rest-controls .btn:first-child');
    if (pauseBtn) {
        pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        pauseBtn.setAttribute('aria-label', 'Pause timer');
    }
}

// Save timer state to global variable before modal re-render
export function saveActiveTimerState(exerciseIndex) {
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    if (!modalTimer || modalTimer.classList.contains('hidden') || !modalTimer.timerData) {
        activeRestTimer = null;
        return;
    }

    const exercise = AppState.currentWorkout?.exercises[exerciseIndex];
    const exerciseLabel =
        modalTimer.querySelector('.modal-rest-exercise')?.textContent ||
        `Rest Period - ${exercise ? getExerciseName(exercise) : 'Exercise'}`;

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
        pausedTime: modalTimer.timerData.pausedTime,
    };
}

// Restore timer state from global variable after modal re-render
export function restoreActiveTimerState(exerciseIndex) {
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
export function restoreTimerFromAppState(exerciseIndex) {
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
        exerciseLabel: `Rest Period - ${exercise ? getExerciseName(exercise) : 'Exercise'}`,
        timeLeft: timeLeft,
        isPaused: timer.isPaused,
        startTime: timer.startTime,
        pausedTime: timer.pausedTime,
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
            timerDisplay.classList.add('timer-complete');
        }
    }
}

export function autoStartRestTimer(exerciseIndex, setIndex) {
    const modal = document.getElementById('exercise-modal');
    const modalHidden = modal?.classList.contains('hidden');
    const focusedMatch = AppState.focusedExerciseIndex === exerciseIndex;

    if (modal && !modalHidden && focusedMatch) {
        startModalRestTimer(exerciseIndex, Config.DEFAULT_REST_TIMER_SECONDS);
    }
}

export function skipHeaderRestTimer() {
    // Skip the active rest timer from the header
    if (!AppState.activeRestTimer) return;
    const exerciseIndex = AppState.activeRestTimer.exerciseIndex;
    const modalTimer = document.getElementById(`modal-rest-timer-${exerciseIndex}`);
    if (modalTimer?.timerData?.skip) {
        modalTimer.timerData.skip();
    } else {
        // Timer modal not mounted — just reset header display
        const headerTimerEl = document.getElementById('workout-rest-timer');
        const headerStatEl = document.getElementById('workout-rest-stat');
        if (headerTimerEl) headerTimerEl.textContent = '--';
        if (headerStatEl) headerStatEl.classList.remove('timer-active', 'timer-done');
        AppState.activeRestTimer = null;
    }
}
