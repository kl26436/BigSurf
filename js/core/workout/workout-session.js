// Workout Session Module - core/workout/workout-session.js
// Handles workout session lifecycle: start, pause, complete, cancel, resume, edit

import { AppState } from '../utils/app-state.js';
import { showNotification, setHeaderMode, stopActiveWorkoutRestTimer, escapeAttr, escapeHtml, openModal, closeModal } from '../ui/ui-helpers.js';
import { getExerciseName } from '../utils/workout-helpers.js';
import { setBottomNavVisible, navigateTo, setWorkoutActiveState } from '../ui/navigation.js';
import { saveWorkoutData, debouncedSaveWorkoutData, clearLastSessionCache, clearAllWorkoutsCache } from '../data/data-manager.js';
import {
    detectLocation,
    setSessionLocation,
    getSessionLocation,
    lockLocation,
    isLocationLocked,
    resetLocationState,
    showLocationPrompt,
    updateLocationIndicator,
    getCurrentCoords,
} from '../features/location-service.js';
import { renderExercises, toggleExerciseExpansion } from './exercise-ui.js';
import { renderActiveWorkout, loadAutofillForAllExercises } from './active-workout-ui.js';
import { haptic } from '../utils/haptics.js';
import { cancelRestNotification } from '../utils/push-notification-manager.js';

// ===================================================================
// TEMPLATE CHANGE DETECTION
// ===================================================================

function detectTemplateChanges(currentExercises, originalWorkout) {
    const original = originalWorkout?.exercises || [];
    if (!currentExercises || original.length === 0) return null;

    const currentNames = currentExercises.map(ex => ex.machine || ex.name || 'Unknown');
    const originalNames = original.map(ex => ex.machine || ex.name || 'Unknown');

    const added = currentNames.length - originalNames.length;
    const reordered = currentNames.length === originalNames.length &&
        currentNames.some((name, i) => name !== originalNames[i]);
    const swapped = currentNames.filter(n => !originalNames.includes(n));

    if (added !== 0 || reordered || swapped.length > 0) {
        const details = [];
        if (added > 0) details.push(`${added} exercise(s) added`);
        if (added < 0) details.push(`${Math.abs(added)} exercise(s) removed`);
        if (reordered) details.push('exercises reordered');
        if (swapped.length > 0) details.push(`${swapped.length} exercise(s) swapped`);
        return { hasChanges: true, details };
    }
    return null;
}

// Listen for exercise rename events to refresh active workout UI
window.addEventListener('exerciseRenamed', (event) => {
    // If we have an active workout, refresh the exercises display
    if (AppState.currentWorkout) {
        renderActiveWorkout();
        // Close exercise modal if open and re-open with refreshed data
        const { exerciseIndex } = event.detail;
        if (typeof exerciseIndex === 'number') {
            // v2 wizard handles its own navigation
        }
    }
});

// ===================================================================
// CORE WORKOUT LIFECYCLE
// ===================================================================

export async function startWorkout(workoutType) {
    if (!AppState.currentUser) {
        alert('Sign in to start a workout');
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
                `\u26A0\uFE0F You already completed a workout today: "${workoutName}"\n\n` +
                    `Starting a new workout will REPLACE your completed workout data.\n\n` +
                    `Your previous workout progress, PRs from that session, and stats will be overwritten.\n\n` +
                    `Start a new workout?`
            );

            if (!confirmed) {
                // Navigate back to dashboard
                navigateTo('dashboard');
                return;
            }
            // User confirmed - proceed to start new workout (will overwrite completed one)
        } else if (!todaysWorkout.completedAt && !todaysWorkout.cancelledAt) {
            // There's an in-progress workout - existing behavior
            const workoutName = todaysWorkout.workoutType || 'Unknown';
            const confirmed = confirm(
                `\u26A0\uFE0F You already have a workout in progress: "${workoutName}"\n\n` +
                    `Starting a new workout will cancel your current workout and you'll lose any unsaved progress.\n\n` +
                    `Do you want to continue?`
            );

            if (!confirmed) {
                // Navigate back to dashboard
                navigateTo('dashboard');
                return;
            }

            // User confirmed - cancel the current workout (mark it as cancelled in Firebase)
            // Mark the existing workout as cancelled and save
            AppState.savedData = {
                ...todaysWorkout,
                cancelledAt: new Date().toISOString(),
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
    let workout = AppState.workoutPlans.find(
        (plan) => plan.day === workoutType || plan.name === workoutType || plan.id === workoutType
    );

    // If not found in cache, try refreshing from Firebase
    if (!workout) {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();

        workout = AppState.workoutPlans.find(
            (plan) => plan.day === workoutType || plan.name === workoutType || plan.id === workoutType
        );
    }

    if (!workout) {
        showNotification(`Workout "${workoutType}" not found. It may have been deleted.`, 'error');
        return;
    }

    // Set up workout state - DEEP CLONE to avoid modifying the template
    AppState.currentWorkout = JSON.parse(JSON.stringify(workout));
    AppState.workoutStartTime = new Date();
    // Normalize display name: callers may pass a Firestore id (e.g. "chest___push")
    // rather than the pretty name. Resolve via the found plan.
    const displayName = workout.name || workout.day || workoutType;
    AppState.savedData = {
        workoutType: displayName,
        date: AppState.getTodayDateString(),
        startedAt: new Date().toISOString(),
        exercises: {},
        version: '2.0',
        location: getSessionLocation() || null,
        templateId: workout.id || null,
        templateIsDefault: workout.isDefault || false,
    };

    // Snapshot the initial template for change detection at completion.
    // Persisted on AppState.savedData (so it lands in Firestore) AND mirrored
    // on window for in-memory reads. The window copy alone isn't enough —
    // iOS can tear down the PWA between start and completion; on resume
    // only the Firestore-backed field survives.
    AppState.savedData.initialTemplateSnapshot = {
        exercises: workout.exercises.map(ex => ({
            machine: ex.machine || ex.name,
            name: ex.name || ex.machine,
        })),
    };
    window._initialTemplateSnapshot = AppState.savedData.initialTemplateSnapshot;

    // Initialize exercise units
    AppState.exerciseUnits = {};

    const workoutNameElement = document.getElementById('current-workout-name');
    if (workoutNameElement) {
        workoutNameElement.textContent = displayName;
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
    setWorkoutActiveState(true);

    // Hide resume banner when starting a workout
    const resumeBanner = document.getElementById('resume-workout-banner');
    if (resumeBanner) resumeBanner.classList.add('hidden');

    // Start duration timer (v1 — v2 has its own)
    startWorkoutTimer();

    // V2 wizard UI: load autofill then render
    await loadAutofillForAllExercises();
    renderActiveWorkout();

    // Initialize window.inProgressWorkout so saveWorkoutData can update it
    // This ensures exercise additions/deletions persist when closing/reopening workout
    window.inProgressWorkout = {
        ...AppState.savedData,
        originalWorkout: AppState.currentWorkout,
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

    // Prevent double-tap
    const finishBtn = document.querySelector('.btn-finish');
    if (finishBtn) {
        if (finishBtn.disabled) return;
        finishBtn.disabled = true;
    }

    // Stop duration timer and rest timer display
    AppState.clearTimers();
    stopActiveWorkoutRestTimer();
    setWorkoutActiveState(false);

    // Cancel any pending server-side rest push so the user doesn't get a
    // lock-screen "Rest Complete" notification minutes after they've finished.
    cancelRestNotification().catch(() => {});

    const isEditingHistorical = window.editingHistoricalWorkout === true;

    // Update saved data with completion info
    if (isEditingHistorical) {
        // Editing historical workout - preserve original duration and completedAt
        // Only update completedAt if it wasn't already set
        if (!AppState.savedData.completedAt) {
            AppState.savedData.completedAt = new Date().toISOString();
        }
        // Preserve original duration - use stored value, existing value, or calculate
        if (window.editingWorkoutOriginalDuration && window.editingWorkoutOriginalDuration > 0) {
            AppState.savedData.totalDuration = window.editingWorkoutOriginalDuration;
        } else if (!AppState.savedData.totalDuration || AppState.savedData.totalDuration <= 0) {
            // Fallback: calculate from timestamps or default to 1 hour
            if (AppState.savedData.startedAt && AppState.savedData.completedAt) {
                const durationMs = new Date(AppState.savedData.completedAt) - new Date(AppState.savedData.startedAt);
                AppState.savedData.totalDuration = Math.floor(durationMs / 1000);
            } else {
                AppState.savedData.totalDuration = 3600; // Default 1 hour
            }
        }
    } else {
        // New workout - calculate duration normally
        AppState.savedData.completedAt = new Date().toISOString();
        AppState.savedData.totalDuration = Math.floor((new Date() - AppState.workoutStartTime) / 1000);
    }

    // Fire-and-forget save — don't block UI on Firebase write
    saveWorkoutData(AppState).catch(err => {
        console.error('Error saving completed workout:', err);
    });

    // Capture workout data for summary and template before reset clears it
    const savedDataSnapshot = JSON.parse(JSON.stringify(AppState.savedData));
    const completedWorkoutData = savedDataSnapshot;

    // Process PRs in background — don't block completion flow
    let newPRs = [];
    if (!isEditingHistorical) {
        try {
            const { PRTracker } = await import('../features/pr-tracker.js');
            newPRs = await PRTracker.processWorkoutForPRs(savedDataSnapshot) || [];
        } catch (err) {
            // PR detection failed — not critical, continue to summary
            console.error('PR detection failed:', err);
        }
    } else {
        // Historical edit — rebuild PRs so corrected values (e.g. fixed typos) are reflected
        try {
            const { PRTracker } = await import('../features/pr-tracker.js');
            await PRTracker.rebuildPRsFromHistory();
        } catch (err) {
            console.error('PR rebuild after historical edit failed:', err);
        }
    }

    // Auto-sync equipment selections back to template (Phase 16)
    if (!isEditingHistorical && completedWorkoutData.templateId) {
        syncEquipmentToTemplate(completedWorkoutData).catch(err => {
            console.error('Equipment sync failed (non-critical):', err);
        });
    }

    // Detect structural changes (reorder, swap, add, remove) for template update prompt.
    // Compare current exercises against the INITIAL template snapshot. Prefer the
    // persisted copy on savedData so resumed workouts (where the window mirror was
    // lost to PWA teardown) still get the prompt.
    let templateChanges = null;
    if (!isEditingHistorical) {
        const currentExercises = AppState.currentWorkout?.exercises || [];
        const initialSnapshot = AppState.savedData?.initialTemplateSnapshot
            || window._initialTemplateSnapshot;
        if (initialSnapshot?.exercises) {
            templateChanges = detectTemplateChanges(currentExercises, initialSnapshot);
        }
    }
    window._initialTemplateSnapshot = null;

    // Reset state BEFORE showing summary (critical order!)
    AppState.reset();
    AppState.clearTimers();
    stopActiveWorkoutRestTimer();

    // Clear in-progress workout since it's now completed
    window.inProgressWorkout = null;
    clearLastSessionCache();
    // Invalidate the dashboard's full-history cache so the just-completed
    // workout shows up in body-part stats / streaks on next render.
    clearAllWorkoutsCache();

    // Clear editing flags if we were editing a historical workout
    window.editingHistoricalWorkout = false;
    window.editingWorkoutDate = null;
    window.editingWorkoutOriginalDuration = null;

    // Reset buttons to normal mode
    updateWorkoutButtonsForEditMode(false);

    // Show completion summary modal (or go to dashboard for historical edits)
    document.getElementById('active-workout-pill')?.remove();

    if (!isEditingHistorical) {
        haptic('complete');
        window._lastCompletedWorkout = completedWorkoutData;
        try {
            showWorkoutSummary(completedWorkoutData, newPRs, templateChanges);
        } catch (err) {
            // Never leave the user hanging on a blank screen. If rendering the
            // summary modal throws for any reason, log + surface + fall back
            // to the dashboard so they at least see something.
            console.error('Workout summary modal failed:', err);
            showNotification("Workout saved — couldn't show summary", 'error');
            navigateTo('dashboard');
        }
    } else {
        navigateTo('dashboard');
    }
}

/**
 * Show workout completion summary modal with stats, PRs, and notes
 */
export function showWorkoutSummary(workoutData, newPRs = [], templateChanges = null) {
    const modal = document.getElementById('workout-completion-modal');
    const content = document.getElementById('workout-completion-content');
    if (!modal || !content) {
        // Fallback to dashboard if modal not found — surface this so we know
        // when it happens instead of silently skipping the recap.
        console.error('Workout summary modal element missing', { modal: !!modal, content: !!content });
        showNotification("Workout saved — couldn't show summary", 'warning');
        navigateTo('dashboard');
        return;
    }

    // Calculate stats
    let totalSets = 0;
    let totalVolume = 0;
    let exerciseCount = 0;
    if (workoutData.exercises) {
        exerciseCount = Object.keys(workoutData.exercises).length;
        Object.values(workoutData.exercises).forEach(ex => {
            if (ex.sets) {
                ex.sets.forEach(s => {
                    if (s.reps && s.weight) {
                        totalSets++;
                        totalVolume += s.reps * s.weight;
                    }
                });
            }
        });
    }

    // Format duration
    const duration = workoutData.totalDuration || 0;
    const dMin = Math.floor(duration / 60);
    const durationStr = dMin >= 60
        ? `${Math.floor(dMin / 60)}h ${dMin % 60}m`
        : `${dMin}m`;

    // Format volume
    const volumeStr = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : `${totalVolume}`;

    // PR section
    let prsHtml = '';
    if (newPRs && newPRs.length > 0) {
        prsHtml = `
            <div class="completion-prs">
                <h3><i class="fas fa-trophy completion-prs__trophy"></i> New Personal Records!</h3>
                ${newPRs.map(pr => `
                    <div class="completion-pr-item">
                        <strong>${escapeHtml(pr.exercise)}</strong>: ${pr.weight} ${pr.unit} &times; ${pr.reps}
                    </div>
                `).join('')}
            </div>
        `;
    }

    content.innerHTML = `
        <div class="completion-summary">
            <div class="completion-header">
                <i class="fas fa-check-circle completion-header__icon"></i>
                <h2>Workout Complete!</h2>
                <p class="completion-workout-name">${escapeHtml(workoutData.workoutType || 'Workout')}</p>
            </div>

            <div class="completion-stats-grid">
                <div class="completion-stat">
                    <span class="completion-stat-value">${durationStr}</span>
                    <span class="completion-stat-label">Duration</span>
                </div>
                <div class="completion-stat">
                    <span class="completion-stat-value">${totalSets}</span>
                    <span class="completion-stat-label">Sets</span>
                </div>
                <div class="completion-stat">
                    <span class="completion-stat-value">${volumeStr}</span>
                    <span class="completion-stat-label">Volume</span>
                </div>
                <div class="completion-stat">
                    <span class="completion-stat-value">${exerciseCount}</span>
                    <span class="completion-stat-label">Exercises</span>
                </div>
            </div>

            ${prsHtml}

            ${templateChanges?.hasChanges && workoutData.templateId && !workoutData.templateIsDefault ? `
            <div class="completion-template-changes" id="template-changes-banner">
                <div class="template-changes-text">
                    <i class="fas fa-sync-alt"></i>
                    <span>Workout modified (${templateChanges.details.join(', ')})</span>
                </div>
                <button class="btn btn-primary btn-small" id="save-template-changes-btn">Update workout</button>
                <button class="btn-text" id="dismiss-template-changes-btn"><i class="fas fa-times"></i></button>
            </div>
            ` : ''}

            <div class="completion-notes-section">
                <label for="workout-notes">How did it feel?</label>
                <textarea id="workout-notes" placeholder="Great session, felt strong…" rows="2"></textarea>
            </div>

            <div class="completion-actions">
                <button class="btn btn-primary btn-full" id="completion-done-btn">Done</button>
            </div>
        </div>
    `;

    // Open modal
    openModal('workout-completion-modal');

    // Done button handler
    document.getElementById('completion-done-btn')?.addEventListener('click', async () => {
        // Save notes if provided
        const notesField = document.getElementById('workout-notes');
        if (notesField?.value && workoutData.workoutId) {
            try {
                const { doc, db, updateDoc } = await import('../data/firebase-config.js');
                const workoutRef = doc(db, 'users', AppState.currentUser?.uid, 'workouts', workoutData.workoutId);
                await updateDoc(workoutRef, { workoutNotes: notesField.value });
            } catch (err) {
                console.error('Error saving workout notes:', err);
            }
        }
        closeModal('workout-completion-modal');
        navigateTo('dashboard');
    });

    // Template changes: save or dismiss
    document.getElementById('save-template-changes-btn')?.addEventListener('click', async () => {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);

            // Build updated exercises from the completed workout
            const updatedExercises = Object.keys(workoutData.exercises || {})
                .sort()
                .map(key => {
                    const idx = key.replace('exercise_', '');
                    const orig = workoutData.originalWorkout?.exercises?.[idx] || {};
                    const savedEx = workoutData.exercises[key];
                    return {
                        ...orig,
                        machine: workoutData.exerciseNames?.[key] || orig.machine || orig.name,
                        name: workoutData.exerciseNames?.[key] || orig.name || orig.machine,
                        equipment: savedEx.equipment || orig.equipment,
                        sets: orig.sets || 3,
                        reps: orig.reps || 10,
                        weight: orig.weight || 0,
                    };
                });

            await workoutManager.updateWorkoutTemplate(workoutData.templateId, {
                exercises: updatedExercises,
            });

            const banner = document.getElementById('template-changes-banner');
            if (banner) banner.innerHTML = '<i class="fas fa-check completion-template-saved"></i> Workout updated';
            showNotification('Workout updated', 'success');
        } catch (err) {
            console.error('Error updating template:', err);
            showNotification("Couldn't update workout", 'error');
        }
    });

    document.getElementById('dismiss-template-changes-btn')?.addEventListener('click', () => {
        document.getElementById('template-changes-banner')?.remove();
    });
}

function showSaveAsTemplatePrompt(workoutData) {
    const workoutName = escapeHtml(workoutData.workoutType || 'Workout');
    const canUpdate = workoutData.templateId && !workoutData.templateIsDefault;

    const banner = document.createElement('div');
    banner.className = 'save-template-banner';
    banner.innerHTML = `
        <span>${canUpdate ? `Update workout "${workoutName}"?` : `Save "${workoutName}" as a workout?`}</span>
        <div class="save-template-actions">
            ${canUpdate ? `
                <button class="btn btn-primary btn-small" id="update-template-btn">
                    <i class="fas fa-sync-alt"></i> Update
                </button>
                <button class="btn btn-secondary btn-small" id="save-as-template-btn">
                    <i class="fas fa-plus"></i> Save new
                </button>
            ` : `
                <button class="btn btn-primary btn-small" id="save-as-template-btn">
                    <i class="fas fa-bookmark"></i> Save
                </button>
            `}
            <button class="btn-dismiss" id="dismiss-template-banner" aria-label="Dismiss">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        dashboard.prepend(banner);
    }

    document.getElementById('update-template-btn')?.addEventListener('click', () => {
        banner.remove();
        updateExistingTemplate(workoutData);
    });

    document.getElementById('save-as-template-btn')?.addEventListener('click', () => {
        banner.remove();
        if (window.saveWorkoutAsTemplate) {
            window.saveWorkoutAsTemplate(workoutData);
        }
    });

    document.getElementById('dismiss-template-banner')?.addEventListener('click', () => {
        banner.remove();
    });

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
        if (banner.parentNode) banner.remove();
    }, 15000);
}

async function updateExistingTemplate(workoutData) {
    if (!workoutData.templateId || !AppState.currentUser) return;

    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);

        // Build updated template from actual workout performance
        const exercises = (workoutData.originalWorkout?.exercises || []).map((ex, i) => {
            const key = `exercise_${i}`;
            const actual = workoutData.exercises?.[key];
            const name = ex.machine || ex.name || workoutData.exerciseNames?.[key] || 'Unknown';

            let sets = ex.sets || 3;
            let reps = ex.reps || 10;
            let weight = ex.weight || 0;

            // Use actual performance data if available
            if (actual?.sets?.length > 0) {
                sets = actual.sets.filter(s => s && (s.reps || s.weight)).length || sets;
                const lastSet = actual.sets[actual.sets.length - 1];
                if (lastSet?.reps) reps = lastSet.reps;
                if (lastSet?.weight) weight = lastSet.weight;
            }

            return {
                machine: name,
                name: name,
                bodyPart: ex.bodyPart || '',
                equipment: actual?.equipment || ex.equipment || '',
                equipmentLocation: ex.equipmentLocation || '',
                sets,
                reps,
                weight,
                video: ex.video || '',
            };
        });

        await workoutManager.updateWorkoutTemplate(workoutData.templateId, {
            exercises,
            name: workoutData.workoutType,
            day: workoutData.workoutType,
        });

        // Refresh cached plans
        AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();

        showNotification('Workout updated', 'success');
    } catch (error) {
        console.error('Error updating template:', error);
        showNotification("Couldn't update workout", 'error');
    }
}

/**
 * Silently sync equipment selections from a completed workout back to its template.
 * Only updates equipment fields — does not change reps, weights, or sets.
 */
async function syncEquipmentToTemplate(workoutData) {
    if (!workoutData.templateId || !AppState.currentUser) return;

    const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
    const workoutManager = new FirebaseWorkoutManager(AppState);

    // Load the current template
    const templates = await workoutManager.getUserWorkoutTemplates();
    const template = templates.find(t => t.id === workoutData.templateId);
    if (!template || !template.exercises || template.isDefault) return;

    // Check if any equipment actually changed
    let hasChanges = false;
    const updatedExercises = template.exercises.map((ex, i) => {
        const key = `exercise_${i}`;
        const actual = workoutData.exercises?.[key];
        if (!actual) return ex;

        const newEquipment = actual.equipment || '';
        const newLocation = actual.equipmentLocation || '';

        if (newEquipment && newEquipment !== (ex.equipment || '')) {
            hasChanges = true;
            return { ...ex, equipment: newEquipment, equipmentLocation: newLocation || ex.equipmentLocation || '' };
        }
        if (newLocation && newLocation !== (ex.equipmentLocation || '')) {
            hasChanges = true;
            return { ...ex, equipmentLocation: newLocation };
        }
        return ex;
    });

    if (!hasChanges) return;

    await workoutManager.updateWorkoutTemplate(workoutData.templateId, {
        exercises: updatedExercises,
    });

    // Refresh cached plans
    AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();
}

export function toggleWorkoutOverflowMenu() {
    toggleWorkoutOverflow();
}

export function closeWorkoutOverflowMenu() {
    closeWorkoutOverflow();
}

export function toggleWorkoutOverflow() {
    const menu = document.getElementById('workout-overflow-menu');
    if (!menu) return;

    const isHidden = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');

    if (isHidden) {
        // Close on outside tap
        const closeHandler = (e) => {
            if (!menu.contains(e.target) && !e.target.closest('.compact-hero__overflow')) {
                menu.classList.add('hidden');
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 10);
    }
}

export function closeWorkoutOverflow() {
    const menu = document.getElementById('workout-overflow-menu');
    if (menu) {
        menu.classList.add('hidden');
    }
}

/**
 * Update the compact hero progress bar and stats.
 * Call after each set completion, exercise completion, or set count change.
 */
export function updateWorkoutProgress() {
    const exercises = AppState.currentWorkout?.exercises || [];
    const saved = AppState.savedData?.exercises || {};

    let totalSets = 0;
    let completedSets = 0;
    let completedExercises = 0;

    exercises.forEach((ex, i) => {
        const sets = saved[`exercise_${i}`]?.sets || [];
        const exSets = ex.sets || 3;
        totalSets += exSets;
        const done = sets.filter(s => s.reps && s.weight).length;
        completedSets += done;
        if (done >= exSets && done > 0) completedExercises++;
    });

    const percent = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

    const fill = document.getElementById('workout-progress-fill');
    if (fill) fill.style.width = `${percent}%`;

    const setCount = document.getElementById('set-count');
    const setTotal = document.getElementById('set-total');
    const exDone = document.getElementById('exercise-done-count');
    const exTotal = document.getElementById('exercise-total');

    if (setCount) setCount.textContent = completedSets;
    if (setTotal) setTotal.textContent = totalSets;
    if (exDone) exDone.textContent = completedExercises;
    if (exTotal) exTotal.textContent = exercises.length;

    // Also update legacy elements if they exist
    const progressDisplay = document.getElementById('workout-progress-display');
    if (progressDisplay) progressDisplay.textContent = `${completedSets}/${totalSets}`;
    const exercisesCount = document.getElementById('workout-exercises-count');
    if (exercisesCount) exercisesCount.textContent = `${completedExercises}/${exercises.length}`;

    // Make footer prominent when at least one exercise is done
    const footer = document.getElementById('workout-footer');
    if (footer) {
        footer.classList.toggle('workout-footer--ready', completedExercises > 0);
    }
}

/**
 * Show a mid-workout summary preview without completing the workout.
 * Opens the completion modal in read-only preview mode.
 */
export function showMidWorkoutSummary() {
    if (!AppState.currentWorkout) return;

    const exercises = AppState.currentWorkout.exercises || [];
    const saved = AppState.savedData?.exercises || {};

    let totalSets = 0;
    let totalVolume = 0;
    let exerciseCount = 0;

    exercises.forEach((ex, i) => {
        const exData = saved[`exercise_${i}`];
        if (exData?.sets) {
            exerciseCount++;
            exData.sets.forEach(s => {
                if (s.reps && s.weight) {
                    totalSets++;
                    totalVolume += s.reps * s.weight;
                }
            });
        }
    });

    // Format elapsed duration
    const elapsed = AppState.currentWorkout.startedAt
        ? Math.floor((Date.now() - new Date(AppState.currentWorkout.startedAt).getTime()) / 1000)
        : 0;
    const dMin = Math.floor(elapsed / 60);
    const durationStr = dMin >= 60 ? `${Math.floor(dMin / 60)}h ${dMin % 60}m` : `${dMin}m`;

    const volumeStr = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : `${totalVolume}`;

    const modal = document.getElementById('workout-completion-modal');
    const content = document.getElementById('workout-completion-content');
    if (!modal || !content) return;

    content.innerHTML = `
        <div class="completion-summary">
            <div class="completion-header">
                <i class="fas fa-chart-bar completion-hero__chart"></i>
                <h2>Session So Far</h2>
                <p class="completion-workout-name">${escapeHtml(AppState.currentWorkout.workoutType || 'Workout')}</p>
            </div>

            <div class="completion-stats-grid">
                <div class="completion-stat">
                    <span class="completion-stat-value">${durationStr}</span>
                    <span class="completion-stat-label">Elapsed</span>
                </div>
                <div class="completion-stat">
                    <span class="completion-stat-value">${totalSets}</span>
                    <span class="completion-stat-label">Sets</span>
                </div>
                <div class="completion-stat">
                    <span class="completion-stat-value">${volumeStr}</span>
                    <span class="completion-stat-label">Volume</span>
                </div>
                <div class="completion-stat">
                    <span class="completion-stat-value">${exerciseCount}/${exercises.length}</span>
                    <span class="completion-stat-label">Exercises</span>
                </div>
            </div>

            <div class="completion-actions">
                <button class="btn btn-primary" onclick="closeModal('workout-completion-modal')">
                    <i class="fas fa-arrow-left"></i> Back to Workout
                </button>
            </div>
        </div>
    `;

    openModal('workout-completion-modal');
}

export function saveActiveWorkoutAsTemplate() {
    if (!AppState.currentWorkout) {
        showNotification('No active workout', 'warning');
        return;
    }

    // Build a snapshot of the current workout state
    const snapshot = {
        workoutType: AppState.savedData.workoutType || AppState.currentWorkout.day || '',
        exercises: AppState.savedData.exercises || {},
        exerciseNames: AppState.savedData.exerciseNames || {},
        originalWorkout: {
            exercises: AppState.currentWorkout.exercises || [],
        },
        templateId: AppState.savedData.templateId || null,
        templateIsDefault: AppState.savedData.templateIsDefault || false,
    };

    const canUpdate = snapshot.templateId && !snapshot.templateIsDefault;

    if (canUpdate) {
        // Offer choice: update existing or save new
        const choice = confirm(
            `Update the existing "${snapshot.workoutType}" template with your current exercises and weights?\n\n` +
            `OK = Update existing template\nCancel = Save as a new template`
        );
        if (choice) {
            updateExistingTemplate(snapshot);
        } else if (window.saveWorkoutAsTemplate) {
            window.saveWorkoutAsTemplate(snapshot);
        }
    } else if (window.saveWorkoutAsTemplate) {
        window.saveWorkoutAsTemplate(snapshot);
    }
}

export async function cancelWorkout(skipConfirmation = false) {
    // The dashboard pill can be shown from window.inProgressWorkout alone
    // (a resumable workout from a previous session) without AppState.currentWorkout
    // ever being restored. Without this fallback, tapping Cancel from that state
    // would hit the early return and silently do nothing. Hydrate savedData from
    // the in-progress record so the rest of the function can mark it cancelled
    // and persist to Firestore.
    if (!AppState.currentWorkout && window.inProgressWorkout) {
        AppState.savedData = { ...window.inProgressWorkout };
    }
    if (!AppState.currentWorkout && !AppState.savedData?.workoutId) return;

    // Confirm cancellation unless explicitly skipped
    if (!skipConfirmation) {
        const exercises = AppState.savedData?.exercises || {};
        const completedSets = Object.values(exercises)
            .flatMap(ex => ex.sets || [])
            .filter(s => s.completed).length;

        const message = completedSets > 0
            ? `Cancel workout? You've completed ${completedSets} set${completedSets !== 1 ? 's' : ''} — they'll be saved as a cancelled session.`
            : 'Cancel this workout?';

        if (!confirm(message)) {
            return; // User chose not to cancel
        }
    }

    AppState.savedData.cancelledAt = new Date().toISOString();

    // Fire-and-forget save — don't block UI on Firebase write
    saveWorkoutData(AppState).catch(err => {
        console.error('Error saving cancelled workout:', err);
    });

    // Cancel any pending rest push so it doesn't fire after the workout
    // has been cancelled.
    cancelRestNotification().catch(() => {});

    AppState.reset();
    AppState.clearTimers();
    setWorkoutActiveState(false);
    document.getElementById('active-workout-pill')?.remove();
    stopActiveWorkoutRestTimer();

    // Clear in-progress workout since it's been cancelled
    window.inProgressWorkout = null;

    // Clear editing flags if we were editing a historical workout
    window.editingHistoricalWorkout = false;
    window.editingWorkoutDate = null;
    window.editingWorkoutOriginalDuration = null;

    // Reset buttons to normal mode
    updateWorkoutButtonsForEditMode(false);

    navigateTo('dashboard');
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
    const sections = [
        'workout-selector',
        'dashboard',
        'workout-history-section',
        'muscle-group-detail-section',
        'exercise-detail-section',
        'composition-detail-section',
        'workout-management-section',
        'exercise-manager-section',
        'location-management-section',
    ];
    sections.forEach((sectionId) => {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('hidden');
    });

    const activeWorkout = document.getElementById('active-workout');
    if (activeWorkout) activeWorkout.classList.remove('hidden');

    // Hide main header (no logo on active workout), show bottom nav
    setHeaderMode(false);
    setBottomNavVisible(true);
    setWorkoutActiveState(true);

    // Set workout name in header
    const workoutNameElement = document.getElementById('current-workout-name');
    if (workoutNameElement) {
        workoutNameElement.textContent = window.inProgressWorkout.workoutType;
    }

    // Resume timer (v1 — v2 has its own)
    startWorkoutTimer();

    // V2 wizard UI
    loadAutofillForAllExercises().then(() => renderActiveWorkout());

    // Restore location from saved data
    if (window.inProgressWorkout.location) {
        setSessionLocation(window.inProgressWorkout.location);
        // If workout has logged sets, location should be locked
        const hasLoggedSets = Object.values(window.inProgressWorkout.exercises || {}).some(
            (ex) => ex.sets && ex.sets.some((set) => set.reps || set.weight)
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
export async function editHistoricalWorkout(docIdOrDate) {
    if (!AppState.currentUser) {
        alert('Sign in to edit workouts');
        return;
    }

    // Guard: editing history overwrites AppState.currentWorkout / savedData /
    // exerciseUnits, which pollutes any in-progress active workout. The
    // inProgressWorkout doc on window + Firestore stays intact so the user
    // can resume from dashboard — but they should understand that's required.
    const hasActive = !window.editingHistoricalWorkout
        && (AppState.currentWorkout || window.inProgressWorkout);
    if (hasActive) {
        const ok = confirm(
            'You have an active workout in progress.\n\n' +
            'Editing this historical workout will set aside your active session. ' +
            'You can resume it from the Dashboard afterward.\n\n' +
            'Continue?'
        );
        if (!ok) return;
    }

    // Load the workout data from Firebase by document ID
    const { loadWorkoutById } = await import('../data/data-manager.js');
    const workoutData = await loadWorkoutById(AppState, docIdOrDate);

    if (!workoutData) {
        showNotification("Couldn't load workout data", 'error');
        return;
    }

    // Close the workout detail modal if open
    if (window.workoutHistory) {
        window.workoutHistory.closeWorkoutDetailModal();
    }

    // Set flag to indicate we're editing a historical workout
    window.editingHistoricalWorkout = true;
    // Use the actual date from workout data (not the docId)
    window.editingWorkoutDate = workoutData.date || docIdOrDate;

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
                equipmentLocation: savedExercise.equipmentLocation || ex.equipmentLocation || null,
            };
        });
    } else if (workoutData.exerciseNames) {
        // Reconstruct from exerciseNames and exercises data
        const exerciseKeys = Object.keys(workoutData.exerciseNames).sort();
        workoutExercises = exerciseKeys.map((key) => {
            const name = workoutData.exerciseNames[key];
            const savedExercise = workoutData.exercises?.[key] || {};
            return {
                machine: name,
                sets: 3,
                reps: 10,
                weight: 0,
                video: '',
                equipment: savedExercise.equipment || null,
                equipmentLocation: savedExercise.equipmentLocation || null,
            };
        });
    }

    // Set up the current workout state
    AppState.currentWorkout = {
        day: workoutData.workoutType,
        name: workoutData.workoutType,
        exercises: workoutExercises,
    };

    // Reset once-per-session UX flags
    AppState._autofillHintShown = false;

    // Restore saved data (sets, reps, weights, notes)
    // Use the actual date from workoutData, not the docId
    AppState.savedData = {
        ...workoutData,
        date: workoutData.date, // Preserve original date
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
    // If no duration stored, calculate from timestamps or use a reasonable default
    if (workoutData.totalDuration && workoutData.totalDuration > 0) {
        window.editingWorkoutOriginalDuration = workoutData.totalDuration;
    } else if (workoutData.startedAt && workoutData.completedAt) {
        // Calculate from timestamps (result in seconds)
        const durationMs = new Date(workoutData.completedAt) - new Date(workoutData.startedAt);
        window.editingWorkoutOriginalDuration = Math.floor(durationMs / 1000);
    } else {
        // Default to 1 hour if no duration info available
        window.editingWorkoutOriginalDuration = 3600;
    }

    // DON'T set workoutStartTime - we'll use the stored duration instead
    AppState.workoutStartTime = null;

    // Hide all sections and show active workout
    const sections = [
        'workout-selector',
        'dashboard',
        'workout-history-section',
        'muscle-group-detail-section',
        'exercise-detail-section',
        'composition-detail-section',
        'workout-management-section',
        'exercise-manager-section',
        'location-management-section',
    ];
    sections.forEach((sectionId) => {
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

    // V2 wizard UI for editing
    loadAutofillForAllExercises().then(() => renderActiveWorkout());
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
        `Discard in-progress "${window.inProgressWorkout.workoutType}" workout? ` +
            `This permanently deletes your progress and can't be undone.`
    );

    if (!confirmDiscard) {
        return;
    }

    try {
        // Store workout info BEFORE clearing variables
        const workoutToDelete = {
            workoutId: window.inProgressWorkout.workoutId,
            workoutType: window.inProgressWorkout.workoutType,
            userId: AppState.currentUser?.uid,
        };

        // Clear in-progress workout state immediately for responsive UI
        window.inProgressWorkout = null;

        // DELETE from Firebase in background
        if (workoutToDelete.userId && workoutToDelete.workoutId) {
            import('../data/firebase-config.js').then(({ deleteDoc, doc, db }) => {
                const workoutRef = doc(db, 'users', workoutToDelete.userId, 'workouts', workoutToDelete.workoutId);
                deleteDoc(workoutRef).catch(err => console.error('Error deleting workout from Firebase:', err));
            });
        }

        // Clear any related UI state
        AppState.reset();

        // Stay on dashboard
        navigateTo('dashboard');
    } catch (error) {
        console.error('Error during discard process:', error);
        alert("Couldn't discard workout — try again");
    }
}

// ===================================================================
// WORKOUT SELECTOR AND IN-PROGRESS CHECK
// ===================================================================

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

        // Re-render v2 wizard UI to ensure UI is up to date
        renderActiveWorkout();
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
            const workoutPlan = AppState.workoutPlans.find(
                (plan) =>
                    plan.day === todaysData.workoutType ||
                    plan.name === todaysData.workoutType ||
                    plan.id === todaysData.workoutType
            );

            if (!workoutPlan) {
                console.warn('\u26A0\uFE0F Workout plan not found for:', todaysData.workoutType);
                return;
            }

            // Store in-progress workout globally
            // Use todaysData.originalWorkout if it exists (contains modified exercise list)
            window.inProgressWorkout = {
                ...todaysData,
                originalWorkout: todaysData.originalWorkout || workoutPlan,
            };

            // Show the prompt
            showInProgressWorkoutPrompt(todaysData);
        } else {
        }
    } catch (error) {
        console.error('\u274CError checking for in-progress workout:', error);
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
// WORKOUT DURATION TIMER
// ===================================================================

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
            const existingLoc = savedLocations.find((loc) => loc.name === existingSessionLocation);
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
        console.error('\u274C Error initializing workout location:', error);
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
            datalist.innerHTML = savedLocations.map((loc) => `<option value="${escapeAttr(loc.name)}">`).join('');
        }

        showLocationPrompt(
            // On save
            async (name) => {
                try {
                    // Check if this is an existing location name
                    const existing = savedLocations.find((loc) => loc.name === name);

                    if (existing) {
                        setSessionLocation(name);
                        await workoutManager.updateLocationVisit(existing.id);
                    } else {
                        // Create new location with GPS coordinates
                        await workoutManager.saveLocation({
                            name: name,
                            latitude: coords.latitude,
                            longitude: coords.longitude,
                        });
                        setSessionLocation(name);
                    }

                    // Removed notification - location indicator already shows
                } catch (error) {
                    console.error('\u274C Error saving location:', error);
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
            datalist.innerHTML = savedLocations.map((loc) => `<option value="${escapeAttr(loc.name)}">`).join('');
        }

        showLocationPrompt(
            // On save
            async (name) => {
                try {
                    // Check if this is an existing location name
                    const existing = savedLocations.find((loc) => loc.name === name);

                    if (existing) {
                        setSessionLocation(name);
                        await workoutManager.updateLocationVisit(existing.id);
                    } else {
                        // Create new location without GPS coordinates
                        await workoutManager.saveLocation({
                            name: name,
                            latitude: null,
                            longitude: null,
                        });
                        setSessionLocation(name);
                    }

                    // Removed notification - location indicator already shows
                } catch (error) {
                    console.error('\u274C Error saving location:', error);
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

// ===================================================================
// WORKOUT LOCATION CHANGE (during active workout)
// ===================================================================

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
            listContainer.textContent = '';
            savedLocations.forEach((loc) => {
                const option = document.createElement('div');
                option.className = 'location-option' + (loc.name === currentLocation ? ' selected' : '');
                option.dataset.locationId = loc.id;
                option.dataset.locationName = loc.name;
                option.addEventListener('click', () => window.selectWorkoutLocationOption(option));

                const icon = document.createElement('i');
                icon.className = 'fas fa-map-marker-alt';
                option.appendChild(icon);

                const nameSpan = document.createElement('span');
                nameSpan.className = 'location-option-name';
                nameSpan.textContent = loc.name;
                option.appendChild(nameSpan);

                const visitsSpan = document.createElement('span');
                visitsSpan.className = 'location-option-visits';
                visitsSpan.textContent = `${loc.visitCount || 0} visits`;
                option.appendChild(visitsSpan);

                listContainer.appendChild(option);
            });
        }

        // Clear new name input
        if (newNameInput) newNameInput.value = '';

        // Show modal
        openModal(modal);
    } catch (error) {
        console.error('\u274C Error loading locations:', error);
        showNotification('Error loading locations', 'error');
    }
}

/**
 * Select a location from the list (workout location selector)
 */
export function selectWorkoutLocationOption(element) {
    // Remove selected from all
    document
        .querySelectorAll('#workout-saved-locations-list .location-option')
        .forEach((el) => el.classList.remove('selected'));
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
    if (modal) closeModal(modal);
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
                    longitude: coords?.longitude || null,
                });
            }
        } catch (error) {
            console.error('\u274C Error saving new location:', error);
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
            console.error('\u274C Error updating location visit:', error);
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
