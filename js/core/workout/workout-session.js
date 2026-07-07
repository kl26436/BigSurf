// Workout Session Module - core/workout/workout-session.js
// Handles workout session lifecycle: start, pause, complete, cancel, resume, edit

import { AppState } from '../utils/app-state.js';
import { showNotification, setHeaderMode, stopActiveWorkoutRestTimer, escapeAttr, escapeHtml, openModal, closeModal } from '../ui/ui-helpers.js';
import { setBottomNavVisible, navigateTo, setWorkoutActiveState } from '../ui/navigation.js';
import { saveWorkoutData, clearLastSessionCache, clearAllWorkoutsCache, loadAllWorkouts } from '../data/data-manager.js';
import {
    detectLocation,
    setSessionLocation,
    getSessionLocation,
    resetLocationState,
    showLocationPrompt,
    updateLocationIndicator,
    getCurrentCoords,
    calculateDistance,
} from '../features/location-service.js';
import { renderActiveWorkout, loadAutofillForAllExercises, openSharedEquipmentSheet, openSharedAddExerciseSheet } from './active-workout-ui.js';
import { getEquipmentAtLocation, getExercisesAtLocation, checkTemplateCompatibility } from '../features/equipment-planner.js';
import { haptic } from '../utils/haptics.js';
import { Config } from '../utils/config.js';
import { cancelRestNotification } from '../utils/push-notification-manager.js';
import { confirmSheet, promptSheet } from '../ui/confirm-sheet.js';

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
        showNotification('Sign in to start a workout', 'warning');
        return;
    }

    // Check if there's already a workout for today
    const { loadTodaysWorkout } = await import('../data/data-manager.js');
    const todaysWorkout = await loadTodaysWorkout(AppState);

    if (todaysWorkout) {
        if (todaysWorkout.completedAt && !todaysWorkout.cancelledAt) {
            // There's already a COMPLETED workout today - warn about overriding
            const workoutName = todaysWorkout.workoutType || 'Unknown';
            const confirmed = await confirmSheet({
                title: `Replace today's "${workoutName}" workout?`,
                message: "You already completed a workout today. Starting a new one overwrites its progress, PRs, and stats.",
                confirmLabel: 'Start new workout',
                cancelLabel: 'Keep workout',
                destructive: true,
            });

            if (!confirmed) {
                // Navigate back to dashboard
                navigateTo('dashboard');
                return;
            }
            // User confirmed - proceed to start new workout (will overwrite completed one)
        } else if (!todaysWorkout.completedAt && !todaysWorkout.cancelledAt) {
            // There's an in-progress workout - existing behavior
            const workoutName = todaysWorkout.workoutType || 'Unknown';
            const confirmed = await confirmSheet({
                title: `Cancel "${workoutName}" and start a new workout?`,
                message: "Your in-progress workout will be cancelled and you'll lose any unsaved progress.",
                confirmLabel: 'Start new workout',
                cancelLabel: 'Keep current workout',
                destructive: true,
            });

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

    // F4: count equipment mapped (created / gym-tagged) during this session
    // for the completion payoff line. Reset before the substitution sheet —
    // its Machine links count too.
    AppState._sessionMappedEquipment = new Set();

    // Tier 3 Phase 4: partially-mapped workout at a known gym → offer
    // Keep / Machine / Swap / Skip per missing exercise before starting.
    // Never blocks: resolves keep-all on dismiss, and only fires for
    // `partial` compatibility (D3).
    const substitutions = await maybeCollectSubstitutions(workout);

    // Clear last-session cache so autofill freshly queries Firestore for this
    // workout's exercises. Without this, a previous workout's null hits stay
    // cached and the new workout gets blank placeholders.
    clearLastSessionCache();

    // Set up workout state - DEEP CLONE to avoid modifying the template
    AppState.currentWorkout = JSON.parse(JSON.stringify(workout));
    applySessionSubstitutions(substitutions);
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
    const exerciseManagerSection = document.getElementById('exercise-manager-section');
    const historySection = document.getElementById('workout-history-section');
    const dashboard = document.getElementById('dashboard');

    if (workoutSelector) workoutSelector.classList.add('hidden');
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

    // 5.6.2 — usage stats on the template doc (fire-and-forget merge write):
    // most-used floats to the top of the library, cleanup finds the never-used.
    bumpTemplateUsage(AppState.savedData?.workoutType);

    // Readiness check-in (Phase 5) — one tap, skippable, never blocking.
    showReadinessSheet();
}

/** 5.6.0 — auto-archive a kind:'oneOff' template after its first completion. */
async function archiveOneOffTemplate(workoutType) {
    try {
        if (!workoutType || !AppState.currentUser) return;
        const t = (AppState.workoutPlans || []).find(p => (p.name || p.day) === workoutType);
        if (!t?.id || t.kind !== 'oneOff' || t.archived) return;
        const { db, doc, setDoc } = await import('../data/firebase-config.js');
        await setDoc(doc(db, 'users', AppState.currentUser.uid, 'workoutTemplates', t.id),
            { archived: true, lastUpdated: new Date().toISOString() }, { merge: true });
        t.archived = true;
    } catch (e) {
        console.error('❌ One-off auto-archive failed:', e);
    }
}

/** Denormalized usageCount/lastUsedDate on the template doc (5.6.2). */
async function bumpTemplateUsage(workoutType) {
    try {
        if (!workoutType || !AppState.currentUser) return;
        const t = (AppState.workoutPlans || []).find(p => (p.name || p.day) === workoutType);
        if (!t?.id) return;
        const { db, doc, setDoc } = await import('../data/firebase-config.js');
        const usageCount = (t.usageCount || 0) + 1;
        const lastUsedDate = AppState.getTodayDateString();
        await setDoc(doc(db, 'users', AppState.currentUser.uid, 'workoutTemplates', t.id),
            { usageCount, lastUsedDate }, { merge: true });
        t.usageCount = usageCount;
        t.lastUsedDate = lastUsedDate;
    } catch (e) {
        console.error('❌ Template usage bump failed:', e);
    }
}

/**
 * Phase 7 — start a workout with NO template (the improviser: "it's leg day,
 * I'll pick machines as I go"). Opens the active-workout wizard with zero
 * exercises and pops the add-exercise sheet immediately. Parallel to
 * startWorkout (per the active-workout safety rule — no refactor of the
 * template path); the today's-workout conflict guard is duplicated on purpose.
 *
 * @param {string|null} focus - optional focus label (e.g. 'Legs') → workoutType
 *   becomes "Freestyle — Legs"; null → plain "Freestyle".
 */
export async function startFreestyleWorkout(focus = null, seedExercises = null) {
    if (!AppState.currentUser) {
        showNotification('Sign in to start a workout', 'warning');
        return;
    }

    // Respect an existing workout today — same guard as startWorkout.
    const { loadTodaysWorkout } = await import('../data/data-manager.js');
    const todaysWorkout = await loadTodaysWorkout(AppState);
    if (todaysWorkout && !todaysWorkout.cancelledAt) {
        const name = todaysWorkout.workoutType || 'Unknown';
        if (todaysWorkout.completedAt) {
            const ok = await confirmSheet({
                title: `Replace today's "${name}" workout?`,
                message: 'You already completed a workout today. Starting a new one overwrites its progress, PRs, and stats.',
                confirmLabel: 'Start new workout',
                cancelLabel: 'Keep workout',
                destructive: true,
            });
            if (!ok) { navigateTo('dashboard'); return; }
        } else {
            const ok = await confirmSheet({
                title: `Cancel "${name}" and start a new workout?`,
                message: "Your in-progress workout will be cancelled and you'll lose any unsaved progress.",
                confirmLabel: 'Start new workout',
                cancelLabel: 'Keep current workout',
                destructive: true,
            });
            if (!ok) { navigateTo('dashboard'); return; }
            AppState.savedData = { ...todaysWorkout, cancelledAt: new Date().toISOString() };
            await saveWorkoutData(AppState);
            window.inProgressWorkout = null;
        }
    }

    await initializeWorkoutLocation();
    clearLastSessionCache();

    const displayName = focus ? `Freestyle — ${focus}` : 'Freestyle';
    // Synthetic, template-less workout — no id, no substitutions. Usually an
    // empty list ("add as you go"); Repeat on a past freestyle session seeds it
    // with that session's exercises instead (deep-cloned — never mutate history).
    const seeded = Array.isArray(seedExercises) && seedExercises.length > 0;
    AppState.currentWorkout = {
        name: displayName,
        category: (focus || '').toLowerCase() || 'other',
        exercises: seeded ? JSON.parse(JSON.stringify(seedExercises)) : [],
    };
    AppState.workoutStartTime = new Date();
    AppState.savedData = {
        workoutType: displayName,
        date: AppState.getTodayDateString(),
        startedAt: new Date().toISOString(),
        exercises: {},
        version: '2.0',
        location: getSessionLocation() || null,
        templateId: null,
        templateIsDefault: false,
        isFreestyle: true,
    };
    // No template to diff against — empty snapshot so completion "changed?"
    // detection treats every added exercise as freestyle (offers Save as workout).
    AppState.savedData.initialTemplateSnapshot = { exercises: [] };
    window._initialTemplateSnapshot = AppState.savedData.initialTemplateSnapshot;
    AppState.exerciseUnits = {};

    // Show the active-workout section (mirrors startWorkout).
    document.getElementById('workout-selector')?.classList.add('hidden');
    document.getElementById('exercise-manager-section')?.classList.add('hidden');
    document.getElementById('workout-history-section')?.classList.add('hidden');
    document.getElementById('dashboard')?.classList.add('hidden');
    document.getElementById('active-workout')?.classList.remove('hidden');

    setHeaderMode(false);
    setBottomNavVisible(true);
    setWorkoutActiveState(true);
    document.getElementById('resume-workout-banner')?.classList.add('hidden');

    startWorkoutTimer();
    await loadAutofillForAllExercises();
    renderActiveWorkout();

    window.inProgressWorkout = { ...AppState.savedData, originalWorkout: AppState.currentWorkout };
    await saveWorkoutData(AppState);

    // Freestyle memory — precompute the "Recent" section (his own recently
    // freestyled exercises) before the add sheet auto-opens, so it renders in
    // the first paint instead of popping in. History is usually already cached.
    try {
        const [{ loadAllWorkouts }, mem] = await Promise.all([
            import('../data/data-manager.js'),
            import('../features/freestyle-memory.js'),
        ]);
        AppState._freestyleRecent = mem.getRecentFreestyleExercises(await loadAllWorkouts(AppState));
    } catch {
        AppState._freestyleRecent = [];
    }

    // Drop straight into picking the first exercise — the whole point of
    // freestyle is "add as you go", so don't make them find a menu. Pass the
    // focus so the sheet's body-part filter is already parked on it (Legs/Core/
    // Cardio map 1:1; Push/Pull span body parts and fall back to All). A seeded
    // repeat already has its exercises — no sheet.
    //
    // Readiness check-in only when the add-exercise sheet ISN'T auto-opening:
    // stacking two sheets on the zero-ceremony freestyle path is exactly the
    // friction that persona rejects. Plain freestyle starts skip it.
    if (!seeded && typeof window.awAddExercise === 'function') window.awAddExercise(focus);
    else showReadinessSheet();
}

// ===================================================================
// READINESS CHECK-IN (Phase 5) — 1-5 + optional note on the workout doc
// ===================================================================

// Asked at most once per session (keyed on startedAt), even across re-renders.
let _readinessAskedFor = null;

export function showReadinessSheet() {
    const session = AppState.savedData?.startedAt;
    if (!session || _readinessAskedFor === session || AppState.savedData.readiness) return;
    _readinessAskedFor = session;

    document.getElementById('readiness-backdrop')?.remove();
    document.getElementById('readiness-sheet')?.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'readiness-backdrop';
    backdrop.onclick = dismissReadinessSheet;

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'readiness-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Readiness check-in');
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">How are you feeling?</div>
            <div class="aw-sheet__subtitle">One tap — the coach uses it to adjust today's load</div>
        </div>
        <div class="aw-sheet__body">
            <div class="readiness-scale">
                ${[1, 2, 3, 4, 5].map(n =>
                    `<button class="readiness-scale__btn" onclick="pickReadiness(${n})" aria-label="Feeling ${n} of 5">${n}</button>`
                ).join('')}
            </div>
            <div class="readiness-scale__labels"><span>Wrecked</span><span>Great</span></div>
            <input type="text" id="readiness-note" class="field-input"
                   placeholder="Optional note — slept badly, sore, etc." aria-label="Optional readiness note">
        </div>
        <div class="aw-sheet__actions">
            <button class="aw-sheet__action" onclick="dismissReadinessSheet()">Skip</button>
        </div>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => { backdrop.classList.add('visible'); sheet.classList.add('visible'); });
}

export function pickReadiness(score) {
    const note = document.getElementById('readiness-note')?.value?.trim() || null;
    if (AppState.savedData) {
        // Additive field on the workout doc — persisted by the normal
        // saveWorkoutData path, read back into the coach context.
        AppState.savedData.readiness = { score, ...(note ? { note } : {}) };
        saveWorkoutData(AppState);
    }
    dismissReadinessSheet();
}

export function dismissReadinessSheet() {
    const backdrop = document.getElementById('readiness-backdrop');
    const sheet = document.getElementById('readiness-sheet');
    backdrop?.classList.remove('visible');
    sheet?.classList.remove('visible');
    setTimeout(() => { backdrop?.remove(); sheet?.remove(); }, 300);
}

// Self-wire (rendered from this module's own template strings).
if (typeof window !== 'undefined') {
    window.pickReadiness = pickReadiness;
    window.dismissReadinessSheet = dismissReadinessSheet;
}

export function pauseWorkout() {
    if (!AppState.currentWorkout) return;

    // Save current state
    AppState.savedData.pausedAt = new Date().toISOString();
    saveWorkoutData(AppState);

    // Stop timers
    AppState.clearTimers();
}

/**
 * Drop sets the user never actually logged — autofill placeholders left
 * unchecked (completed !== true) — and any exercise left with no logged sets.
 * Without this, finishing a workout early persisted last session's pre-filled
 * numbers as if they'd been done: they showed up in history, counted toward
 * the summary, and could even record false PRs. Mutates the exercises map in
 * place. Fresh completions only — callers skip it for historical edits, whose
 * sets may pre-date the `completed` flag. Internal to this module (nothing
 * imports it), so it stays a plain function — no cross-module export.
 */
function pruneUnloggedSets(savedData) {
    const exMap = savedData?.exercises;
    if (!exMap) return;
    for (const key of Object.keys(exMap)) {
        const ex = exMap[key];
        if (ex && Array.isArray(ex.sets)) {
            ex.sets = ex.sets.filter(s => s && s.completed === true);
        }
        if (!ex || !ex.sets || ex.sets.length === 0) {
            delete exMap[key];
        }
    }
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

    // Drop unlogged (autofill-only) sets and empty exercises so finishing early
    // doesn't persist last session's pre-filled numbers as if done — this also
    // keeps them out of PR detection and the summary below. Fresh completions
    // only; historical edits keep their existing sets.
    if (!isEditingHistorical) {
        pruneUnloggedSets(AppState.savedData);
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

    // 5.6.0 — one-off templates auto-archive after their first completed use:
    // built for one occasion, then out of the way (unarchive brings it back).
    archiveOneOffTemplate(AppState.savedData?.workoutType);

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

// Sum reps×weight across a saved workout's exercises. Mirrors the summary's own
// (unit-naive) summation so a current-vs-prior delta compares like with like.
function computeWorkoutVolume(workout) {
    let vol = 0;
    const exs = workout?.exercises;
    if (!exs) return 0;
    Object.values(exs).forEach(ex => {
        (ex.sets || []).forEach(s => {
            if (s.reps && s.weight) vol += s.reps * s.weight;
        });
    });
    return vol;
}

// Progressive enhancement for the completion modal: find the previous workout of
// the same type and fill in a volume delta. Async + best-effort — if history
// can't load or there's no prior session, the line just stays hidden.
async function hydratePriorComparison(workoutData, currentVolume) {
    try {
        const el = document.getElementById('completion-compare');
        if (!el || !currentVolume) return;

        const type = workoutData.workoutType;
        if (!type) return;

        const all = await loadAllWorkouts(AppState);

        // Freestyle sessions compare like-for-like by declared-or-DERIVED focus
        // (an unlabeled leg day still matches last week's "Freestyle — Legs");
        // exact-label matching silently lost the comparison whenever the focus
        // chip was skipped one of the weeks. Template workouts keep exact match.
        let prior;
        let compareName = type;
        const mem = await import('../features/freestyle-memory.js');
        if (mem.isFreestyleWorkout(workoutData)) {
            const match = mem.findPriorComparableFreestyle(all, workoutData);
            if (!match) return; // no comparable session → no noise
            prior = match.workout;
            compareName = `${match.key} freestyle`;
        } else {
            prior = all
                .filter(w => w.workoutType === type && w.id !== workoutData.workoutId)
                .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))[0];
        }
        if (!prior) return;

        const priorVol = computeWorkoutVolume(prior);
        if (!priorVol) return;

        const unit = AppState.globalUnit || 'lbs';
        const priorStr = priorVol >= 1000 ? `${(priorVol / 1000).toFixed(1)}k` : `${priorVol}`;
        const pct = Math.round(((currentVolume - priorVol) / priorVol) * 100);
        const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
        const icon = dir === 'up' ? 'fa-arrow-trend-up' : dir === 'down' ? 'fa-arrow-trend-down' : 'fa-equals';
        const label = pct === 0
            ? `Same volume as last ${escapeHtml(compareName)} — ${priorStr} ${unit}`
            : `${pct > 0 ? '+' : ''}${pct}% volume vs. last ${escapeHtml(compareName)} · ${priorStr} ${unit}`;

        el.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
        el.classList.add(`completion-compare--${dir}`);
        el.classList.remove('hidden');
    } catch (err) {
        // Never let a missing comparison break the recap.
        console.error('Prior-session comparison failed:', err);
    }
}

/**
 * Show workout completion summary modal with stats, PRs, and notes
 */
/**
 * F4 completion payoff (Tier 3 Phase 5): the user just did invisible mapping
 * work — tell them what it bought. One card, only when count > 0 (D0).
 */
function renderMappedEquipmentCard(workoutData) {
    const mapped = AppState._sessionMappedEquipment;
    const count = mapped ? mapped.size : 0;
    const loc = workoutData.location;
    const gymName = typeof loc === 'object' ? loc?.name : loc;
    if (!count || !gymName) return '';

    const totalAtGym = (AppState._cachedEquipment || []).filter(eq =>
        (eq.locations || []).some(l => (l || '').toLowerCase() === gymName.toLowerCase())
    ).length;

    const line = totalAtGym > count
        ? `You mapped ${count} more machine${count !== 1 ? 's' : ''} at ${gymName} — ${totalAtGym} total.`
        : `You mapped ${count} machine${count !== 1 ? 's' : ''} at ${gymName} — next time you'll see what's possible before you start.`;

    // One-shot: don't re-show if the summary re-renders.
    AppState._sessionMappedEquipment = null;

    return `
        <div class="completion-mapped">
            <i class="fas fa-map-marked-alt completion-mapped__icon"></i>
            <span>${escapeHtml(line)}</span>
        </div>
    `;
}

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

    // Format volume — the summary sums raw reps×weight, so label it with the
    // user's working unit rather than leaving a bare number (18,420 — of what?).
    const volumeUnit = AppState.globalUnit || 'lbs';
    const volumeStr = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : `${totalVolume}`;

    // PR section — this is the earned-hype moment, so it leads the recap (above
    // the stats grid) with gold emphasis. Kept as "New PRs" per copy rules
    // (no exclamation; the PR itself is the celebration).
    let prsHtml = '';
    if (newPRs && newPRs.length > 0) {
        prsHtml = `
            <div class="completion-prs completion-prs--hero">
                <h3><i class="fas fa-trophy completion-prs__trophy"></i> ${newPRs.length === 1 ? 'New PR' : `${newPRs.length} new PRs`}</h3>
                ${newPRs.map(pr => `
                    <div class="completion-pr-item">
                        <strong>${escapeHtml(pr.exercise)}</strong>
                        <span class="completion-pr-item__value">${pr.weight} ${pr.unit} &times; ${pr.reps}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    content.innerHTML = `
        <div class="completion-summary">
            <div class="completion-header">
                <i class="fas fa-check-circle completion-header__icon"></i>
                <h2>Workout complete</h2>
                <p class="completion-workout-name">${escapeHtml(workoutData.workoutType || 'Workout')}</p>
            </div>

            ${prsHtml}

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
                    <span class="completion-stat-label">Volume · ${volumeUnit}</span>
                </div>
                <div class="completion-stat">
                    <span class="completion-stat-value">${exerciseCount}</span>
                    <span class="completion-stat-label">Exercises</span>
                </div>
            </div>

            ${renderMappedEquipmentCard(workoutData)}

            <div class="completion-compare hidden" id="completion-compare"></div>

            ${templateChanges?.hasChanges && workoutData.templateId ? `
            <div class="completion-template-changes" id="template-changes-banner">
                <div class="template-changes-text">
                    <i class="fas fa-sync-alt"></i>
                    <span>Workout modified (${templateChanges.details.join(', ')})</span>
                </div>
                <div class="template-changes-actions">
                    <button class="btn btn-primary btn-small" id="save-template-changes-btn">${workoutData.templateIsDefault ? 'Save changes' : 'Update workout'}</button>
                    <button class="btn btn-secondary btn-small" id="save-as-new-template-btn">Save as new</button>
                    <button class="btn-text" id="dismiss-template-changes-btn" aria-label="Dismiss"><i class="fas fa-times"></i></button>
                </div>
            </div>
            ` : ''}

            ${!workoutData.templateId && exerciseCount > 0 ? (
                (AppState.settings?.freestyleSaveDismissals || 0) >= 3
                    // Dismissed a few times → he's a committed freestyler. Keep the
                    // door open but drop the sales pitch to a quiet one-liner.
                    ? `
            <div class="completion-save-subtle" id="freestyle-save-banner">
                <button class="btn-text" id="save-freestyle-btn"><i class="fas fa-bookmark"></i> Save as workout</button>
            </div>
            `
                    : `
            <div class="completion-template-changes" id="freestyle-save-banner">
                <div class="template-changes-text">
                    <i class="fas fa-bookmark"></i>
                    <span>Liked this one? Save it to start again with one tap.</span>
                </div>
                <div class="template-changes-actions">
                    <button class="btn btn-primary btn-small" id="save-freestyle-btn">Save as workout</button>
                    <button class="btn-text" id="dismiss-freestyle-btn" aria-label="Dismiss"><i class="fas fa-times"></i></button>
                </div>
            </div>
            `) : ''}

            <div class="completion-notes-section">
                <label for="workout-notes">How did it feel?</label>
                <textarea id="workout-notes" placeholder="Add notes…" rows="2"></textarea>
            </div>

            <div class="completion-actions">
                <button class="btn btn-primary btn-full" id="completion-done-btn">Done</button>
            </div>
        </div>
    `;

    // Open modal
    openModal('workout-completion-modal');

    // Async-hydrate a "vs. last {type}" volume delta once prior history loads.
    // Best-effort progressive enhancement — the modal is already usable without it.
    hydratePriorComparison(workoutData, totalVolume);

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

    // Template changes: save or dismiss. For default templates we save the
    // user-modified version as a custom override (overridesDefault: defaultId)
    // so the original default stays intact for other users; for custom
    // templates we update in place. Either path uses saveWorkoutTemplate
    // since updateWorkoutTemplate doesn't set overridesDefault.
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

            if (workoutData.templateIsDefault) {
                // Defaults are shared seed data — we can't mutate them. Save
                // the modifications as a custom override; the dedup in
                // getUserWorkoutTemplates will show this version going forward.
                await workoutManager.saveWorkoutTemplate({
                    id: workoutData.templateId,
                    name: workoutData.workoutType,
                    exercises: updatedExercises,
                    overridesDefault: workoutData.templateId,
                });
            } else {
                await workoutManager.updateWorkoutTemplate(workoutData.templateId, {
                    exercises: updatedExercises,
                });
            }

            const banner = document.getElementById('template-changes-banner');
            if (banner) banner.innerHTML = '<i class="fas fa-check completion-template-saved"></i> Workout updated';
            showNotification('Workout updated', 'success');
        } catch (err) {
            console.error('Error updating template:', err);
            showNotification("Couldn't update workout", 'error');
        }
    });

    // Save the modified workout under a brand new name instead of overwriting
    // the source template. Keeps the original intact and adds a new template
    // to the user's library.
    document.getElementById('save-as-new-template-btn')?.addEventListener('click', async () => {
        const suggested = `${workoutData.workoutType || 'Workout'} (modified)`;
        const newName = await promptSheet({
            title: 'Name this new workout',
            initialValue: suggested,
            confirmLabel: 'Save workout',
        });
        if (!newName || !newName.trim()) return;

        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);

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

            // Omit id so saveWorkoutTemplate generates a fresh one from the
            // new name — keeps the source template untouched.
            await workoutManager.saveWorkoutTemplate({
                name: newName.trim(),
                exercises: updatedExercises,
            });

            const banner = document.getElementById('template-changes-banner');
            if (banner) banner.innerHTML = `<i class="fas fa-check completion-template-saved"></i> Saved as "${escapeHtml(newName.trim())}"`;
            showNotification(`Saved as "${newName.trim()}"`, 'success');
        } catch (err) {
            console.error('Error saving as new template:', err);
            showNotification("Couldn't save new workout", 'error');
        }
    });

    document.getElementById('dismiss-template-changes-btn')?.addEventListener('click', () => {
        document.getElementById('template-changes-banner')?.remove();
    });

    // Graduation path (Phase 7): a freestyle workout has no source template, so
    // offer to save it as a reusable one — an improviser organically becomes a
    // routine user. Saves in place (stays in the completion modal), mirroring
    // the save-as-new path; no navigation away to the editor.
    document.getElementById('save-freestyle-btn')?.addEventListener('click', async () => {
        const suggested = workoutData.workoutType && workoutData.workoutType !== 'Freestyle'
            ? workoutData.workoutType.replace(/^Freestyle — /, '')
            : '';
        const newName = await promptSheet({
            title: 'Name this workout',
            initialValue: suggested,
            placeholder: 'e.g. Leg day',
            confirmLabel: 'Save workout',
        });
        if (!newName || !newName.trim()) return;

        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);

            const exercises = Object.keys(workoutData.exercises || {})
                .sort()
                .map(key => {
                    const idx = key.replace('exercise_', '');
                    const orig = workoutData.originalWorkout?.exercises?.[idx] || {};
                    const savedEx = workoutData.exercises[key];
                    return {
                        ...orig,
                        machine: workoutData.exerciseNames?.[key] || orig.machine || orig.name,
                        name: workoutData.exerciseNames?.[key] || orig.name || orig.machine,
                        equipment: savedEx.equipment || orig.equipment || '',
                        sets: orig.sets || 3,
                        reps: orig.reps || 10,
                        weight: orig.weight || 0,
                    };
                });

            await workoutManager.saveWorkoutTemplate({
                name: newName.trim(),
                exercises,
            });
            // Keep the selector in sync so the new workout is startable immediately.
            AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();

            const banner = document.getElementById('freestyle-save-banner');
            if (banner) banner.innerHTML = `<i class="fas fa-check completion-template-saved"></i> Saved as "${escapeHtml(newName.trim())}"`;
            showNotification(`Saved as "${newName.trim()}"`, 'success');
        } catch (err) {
            console.error('Error saving freestyle as workout:', err);
            showNotification("Couldn't save workout", 'error');
        }
    });

    document.getElementById('dismiss-freestyle-btn')?.addEventListener('click', async () => {
        document.getElementById('freestyle-save-banner')?.remove();
        // Count the dismissal (persisted in settings — no localStorage in this
        // app). After 3, the banner renders as the subtle one-line variant.
        try {
            const { updateSetting } = await import('../ui/settings-ui.js');
            updateSetting('freestyleSaveDismissals', (AppState.settings?.freestyleSaveDismissals || 0) + 1);
        } catch { /* cosmetic counter — never block completion */ }
    });
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

export async function saveActiveWorkoutAsTemplate() {
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
        // Offer choice: update existing or save new. Cancel (or backdrop/Escape)
        // takes the save-as-new path — same as native confirm's Cancel did.
        const choice = await confirmSheet({
            title: `Update "${snapshot.workoutType}"?`,
            message: 'Replaces its exercises and weights with your current session, or save them as a new workout instead.',
            confirmLabel: 'Update workout',
            cancelLabel: 'Save as new',
        });
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

        const confirmed = await confirmSheet({
            title: 'Cancel this workout?',
            message: completedSets > 0
                ? `You've completed ${completedSets} set${completedSets !== 1 ? 's' : ''} — they'll be saved as a cancelled session.`
                : '',
            confirmLabel: 'Cancel workout',
            cancelLabel: 'Keep going',
            destructive: true,
        });
        if (!confirmed) {
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
        updateLocationIndicator(window.inProgressWorkout.location);
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
        showNotification('Sign in to edit workouts', 'warning');
        return;
    }

    // Guard: editing history overwrites AppState.currentWorkout / savedData /
    // exerciseUnits, which pollutes any in-progress active workout. The
    // inProgressWorkout doc on window + Firestore stays intact so the user
    // can resume from dashboard — but they should understand that's required.
    const hasActive = !window.editingHistoricalWorkout
        && (AppState.currentWorkout || window.inProgressWorkout);
    if (hasActive) {
        const ok = await confirmSheet({
            title: 'Set aside your active workout?',
            message: 'Editing this workout pauses your active session — resume it from the dashboard when you\'re done.',
            confirmLabel: 'Edit workout',
            cancelLabel: 'Not now',
        });
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
        // Use the saved template structure. Name uses exerciseNames first
        // (authoritative — saveWorkoutData writes it from currentWorkout
        // at save time) before falling back to originalWorkout, since the
        // originalWorkout slot can still carry a pre-swap predecessor on
        // older docs. Equipment fallback to originalWorkout.equipment is
        // gated on the slot's name still matching the authoritative name —
        // otherwise we'd inherit the predecessor's equipment.
        workoutExercises = workoutData.originalWorkout.exercises.map((ex, index) => {
            const key = `exercise_${index}`;
            const savedExercise = workoutData.exercises?.[key] || {};
            const authoritativeName = workoutData.exerciseNames?.[key]
                || ex.machine
                || ex.name
                || null;
            const originalName = ex.machine || ex.name || null;
            const originalSlotNameMatches = !!authoritativeName && originalName === authoritativeName;
            return {
                machine: authoritativeName,
                sets: ex.sets || 3,
                reps: ex.reps || 10,
                weight: ex.weight || 0,
                video: ex.video || '',
                equipment: savedExercise.equipment
                    || (originalSlotNameMatches ? ex.equipment : null)
                    || null,
                equipmentLocation: savedExercise.equipmentLocation
                    || (originalSlotNameMatches ? ex.equipmentLocation : null)
                    || null,
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

    const confirmDiscard = await confirmSheet({
        title: `Discard "${window.inProgressWorkout.workoutType}" workout?`,
        message: "This permanently deletes your progress and can't be undone.",
        confirmLabel: 'Discard workout',
        cancelLabel: 'Keep workout',
        destructive: true,
    });

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
        showNotification("Couldn't discard workout — try again", 'error');
    }
}

// ===================================================================
// WORKOUT SELECTOR AND IN-PROGRESS CHECK
// ===================================================================

export async function showWorkoutSelector() {
    const workoutSelector = document.getElementById('workout-selector');
    const activeWorkout = document.getElementById('active-workout');
    const historySection = document.getElementById('workout-history-section');

    // If user has an active workout in progress, show that instead of selector
    if (AppState.currentWorkout && AppState.savedData.workoutType) {
        if (workoutSelector) workoutSelector.classList.add('hidden');
        if (activeWorkout) activeWorkout.classList.remove('hidden');
        if (historySection) historySection.classList.add('hidden');

        // Re-render v2 wizard UI to ensure UI is up to date
        renderActiveWorkout();
        return; // Don't show selector or check for in-progress workout
    }

    // No active workout - show selector
    if (workoutSelector) workoutSelector.classList.remove('hidden');
    if (activeWorkout) activeWorkout.classList.add('hidden');
    if (historySection) historySection.classList.add('hidden');

    // In-progress workout check removed - dashboard banner handles this now
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
            // Matched a known location — nearest is preselected so logging
            // is never blocked on a location decision.
            setSessionLocation(result.location.name);

            // Trust the match silently only when GPS puts us close to exactly
            // one saved gym. A single FAR match (150–500m) may really be an
            // unsaved gym next door to a saved one — first workout at the
            // Cosmopolitan with only Bellagio saved — so confirm instead of
            // silently mis-tagging. Multiple close matches also confirm.
            const matches = result.nearbyMatches || [];
            const confident =
                matches[0].distance <= Config.GPS_CONFIDENT_MATCH_METERS &&
                (matches.length === 1 || matches[1].distance > Config.GPS_CONFIDENT_MATCH_METERS);

            if (confident) {
                await workoutManager.updateLocationVisit(result.location.id);
            } else {
                showGymChooserSheet(matches, workoutManager);
            }
        } else if (result.isNew && result.coords) {
            // At a new location - prompt user to name it
            await promptForNewLocation(result.coords, workoutManager, savedLocations);
        } else if (!result.coords) {
            // No usable GPS (denied, timed out, or hopelessly inaccurate).
            // Saved gyms get a tap-to-pick sheet — typing a name into a modal
            // was a dead-end when the answer is almost always "one of these".
            if (savedLocations.length > 0) {
                showGymFallbackSheet(savedLocations, workoutManager);
            } else {
                await promptForLocationSelection(workoutManager, savedLocations);
            }
        }
    } catch (error) {
        console.error('\u274C Error initializing workout location:', error);
        // Don't block workout start on location errors
    }
}

/**
 * Bottom sheet shown when GPS matches MORE THAN ONE saved gym (overlapping
 * radii). The nearest gym is already set as the session location, so this is
 * a confirm-or-correct affordance, not a blocker — dismissing keeps nearest.
 * Self-contained DOM (mirrors the manual-link sheet pattern); the tap handler
 * hangs off window directly so no new main.js export wiring is needed.
 */
function showGymChooserSheet(matches, workoutManager) {
    document.getElementById('gym-chooser-backdrop')?.remove();
    document.getElementById('gym-chooser-sheet')?.remove();

    const fmtDistance = (d) => (d < 1000 ? `${Math.round(d)} m away` : `${(d / 1000).toFixed(1)} km away`);

    const close = () => {
        document.getElementById('gym-chooser-backdrop')?.remove();
        document.getElementById('gym-chooser-sheet')?.remove();
        delete window._bsPickDetectedGym;
        delete window._bsGymSomewhereElse;
    };

    // "None of these" — first time at a gym that neighbors a saved one.
    // Opens the location selector, which has the new-gym name input; the
    // nearest saved gym stays as the fallback if the user bails out.
    window._bsGymSomewhereElse = () => {
        close();
        changeWorkoutLocation();
    };

    window._bsPickDetectedGym = async (index) => {
        const match = matches[index];
        close();
        if (!match) return;

        setSessionLocation(match.name);
        if (AppState.savedData) {
            AppState.savedData.location = match.name;
            await saveWorkoutData(AppState);
        }
        if (AppState.currentWorkout) renderActiveWorkout();

        try {
            if (match.id) await workoutManager.updateLocationVisit(match.id);
        } catch (err) {
            console.error('❌ Error updating location visit:', err);
        }
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'gym-chooser-backdrop';
    backdrop.onclick = () => window._bsPickDetectedGym(0);

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'gym-chooser-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Choose your gym');

    const rows = matches.map((m, i) => `
        <div class="js-row ${i === 0 ? 'current' : ''}" onclick="_bsPickDetectedGym(${i})">
            <div class="js-row__icon js-row__icon--equip"><i class="fas fa-map-marker-alt"></i></div>
            <div class="js-row__info">
                <div class="js-row__name">${escapeHtml(m.name)}${i === 0 ? ' ✓' : ''}</div>
                <div class="js-row__meta">${fmtDistance(m.distance)}${m.visitCount ? ` · ${m.visitCount} visits` : ''}</div>
            </div>
        </div>
    `).join('');

    const subtitle = matches.length > 1
        ? 'More than one saved gym is nearby'
        : `${escapeHtml(matches[0].name)} is ${fmtDistance(matches[0].distance)} — right one?`;

    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">Which gym?</div>
            <div class="aw-sheet__subtitle">${subtitle}</div>
        </div>
        <div class="aw-sheet__body">${rows}</div>
        <div class="aw-sheet__actions">
            <button class="aw-sheet__action" onclick="_bsGymSomewhereElse()">Somewhere else</button>
            <button class="aw-sheet__action primary" onclick="_bsPickDetectedGym(0)">Keep ${escapeHtml(matches[0].name)}</button>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        sheet.classList.add('visible');
    });
}

// ===================================================================
// SUBSTITUTION SHEET ON START (Tier 3 Phase 4 / traveler-flow Step 4)
// ===================================================================

// Active sheet state: { gym, templateKey, available, rows, resolve }
// rows: [{ name, equipment, choice: 'keep'|'machine'|'swap'|'skip', swapTo, machine }]
let _subSheetState = null;

/**
 * Decide whether the substitution sheet applies to this start, show it, and
 * resolve with the user's choices. Returns null when it doesn't apply
 * (no gym, D0 no equipment, F1 unmapped gym, full compatibility) or when
 * every row is Keep.
 */
async function maybeCollectSubstitutions(workout) {
    try {
        const gym = getSessionLocation();
        if (!gym) return null;

        let equipment = AppState._cachedEquipment;
        if (!equipment) {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            equipment = await new FirebaseWorkoutManager(AppState).getUserEquipment();
            AppState._cachedEquipment = equipment;
        }
        if (!Array.isArray(equipment) || equipment.length === 0) return null; // D0

        const atGym = getEquipmentAtLocation(equipment, gym);
        if (atGym.length === 0) return null; // F1 territory — no interrogation

        const available = getExercisesAtLocation(atGym);
        const exercises = Array.isArray(workout.exercises)
            ? workout.exercises
            : Object.values(workout.exercises || {});
        const compat = checkTemplateCompatibility({ exercises }, available);
        // D3: only `partial` raises the sheet — full and unmapped-only don't.
        if (compat.missing === 0 || compat.available === 0) return null;

        const templateKey = workout.id || workout.day || workout.name;
        const memory = AppState.settings?.gymSubstitutions?.[gym] || {};

        const rows = compat.exercises
            .filter(e => !e.available)
            .map(e => {
                const remembered = memory[`${templateKey}::${e.name}`];
                return {
                    name: e.name,
                    equipment: e.equipment,
                    // Preselect Keep (Kevin's call) unless a remembered choice
                    // exists — D10: never ask twice, pre-fill last time's answer.
                    choice: remembered?.choice === 'skip' ? 'skip'
                        : remembered?.choice === 'swap' ? 'swap'
                        : 'keep',
                    swapTo: remembered?.choice === 'swap' && remembered.swapTo
                        ? { name: remembered.swapTo }
                        : null,
                    machine: null,
                };
            });

        return await new Promise((resolve) => {
            _subSheetState = { gym, templateKey, available, rows, resolve };
            renderSubstitutionSheet();
        });
    } catch (e) {
        console.error('❌ Substitution sheet failed — starting unmodified:', e);
        return null;
    }
}

function renderSubstitutionSheet() {
    const state = _subSheetState;
    if (!state) return;
    closeSubstitutionSheetImmediate();

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop visible';
    backdrop.id = 'sub-sheet-backdrop';
    // Dismiss = start with current selections. Never block a workout (D3).
    backdrop.onclick = () => window._bsSubStart();

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet visible';
    sheet.id = 'sub-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Exercises not mapped at this gym');

    const n = state.rows.length;
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">${n} exercise${n !== 1 ? "s aren't" : " isn't"} mapped at ${escapeHtml(state.gym)}</div>
            <div class="aw-sheet__subtitle">Point at a machine to fix the map, or adjust today's session</div>
        </div>
        <div class="aw-sheet__body" id="sub-sheet-body">${renderSubstitutionRows()}</div>
        <div class="aw-sheet__actions">
            <button class="aw-sheet__action primary" onclick="_bsSubStart()">Start workout</button>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
}

function renderSubstitutionRows() {
    const state = _subSheetState;
    if (!state) return '';
    return state.rows.map((row, i) => {
        const detail = row.choice === 'machine' && row.machine ? `Linked to ${escapeHtml(row.machine)}`
            : row.choice === 'swap' && row.swapTo ? `→ ${escapeHtml(row.swapTo.name)}`
            : row.choice === 'skip' ? 'Skipped today'
            : (row.equipment ? `Uses ${escapeHtml(row.equipment)}` : '');
        // Machine-resolved rows collapse to a done state (the link persists).
        if (row.choice === 'machine') {
            return `
                <div class="bs-sub-row bs-sub-row--done">
                    <div class="bs-sub-row__info">
                        <div class="bs-sub-row__name">${escapeHtml(row.name)}</div>
                        <div class="bs-sub-row__detail"><i class="fas fa-check"></i> ${detail}</div>
                    </div>
                </div>
            `;
        }
        return `
            <div class="bs-sub-row">
                <div class="bs-sub-row__info">
                    <div class="bs-sub-row__name">${escapeHtml(row.name)}</div>
                    ${detail ? `<div class="bs-sub-row__detail">${detail}</div>` : ''}
                </div>
                <div class="bs-sub-row__choices">
                    <button type="button" class="bs-sub-chip ${row.choice === 'keep' ? 'active' : ''}" onclick="_bsSubSetChoice(${i}, 'keep')">Keep</button>
                    <button type="button" class="bs-sub-chip" onclick="_bsSubPickMachine(${i})">Machine</button>
                    <button type="button" class="bs-sub-chip ${row.choice === 'swap' ? 'active' : ''}" onclick="_bsSubPickSwap(${i})">Swap</button>
                    <button type="button" class="bs-sub-chip ${row.choice === 'skip' ? 'active' : ''}" onclick="_bsSubSetChoice(${i}, 'skip')">Skip</button>
                </div>
            </div>
        `;
    }).join('');
}

function rerenderSubstitutionRows() {
    const body = document.getElementById('sub-sheet-body');
    if (body) body.innerHTML = renderSubstitutionRows();
}

function closeSubstitutionSheetImmediate() {
    document.getElementById('sub-sheet-backdrop')?.remove();
    document.getElementById('sub-sheet')?.remove();
}

window._bsSubSetChoice = (i, choice) => {
    const row = _subSheetState?.rows?.[i];
    if (!row) return;
    row.choice = choice;
    if (choice !== 'swap') row.swapTo = null;
    rerenderSubstitutionRows();
};

// "Machine" — point at equipment here (D9: fix the map before changing the
// plan). Opens the shared equipment sheet on top; the selection links
// gym + exercise onto the doc permanently, and the row collapses to done.
window._bsSubPickMachine = (i) => {
    const state = _subSheetState;
    const row = state?.rows?.[i];
    if (!row) return;
    openSharedEquipmentSheet({
        exerciseName: row.name,
        currentEquipment: null,
        onSelect: async (equipName) => {
            if (!equipName) { rerenderSubstitutionRows(); return; }
            try {
                const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
                const mgr = new FirebaseWorkoutManager(AppState);
                await mgr.getOrCreateEquipment(equipName, state.gym, row.name);
                AppState._cachedEquipment = await mgr.getUserEquipment();
            } catch (e) {
                console.error('❌ Machine link failed:', e);
            }
            row.choice = 'machine';
            row.machine = equipName;
            AppState._sessionMappedEquipment?.add(equipName);
            rerenderSubstitutionRows();
        },
    });
};

// "Swap" — session-only replacement (D5), gym-filtered picker first (D8/D9).
window._bsSubPickSwap = (i) => {
    const state = _subSheetState;
    const row = state?.rows?.[i];
    if (!row) return;

    const library = AppState.exerciseDatabase || [];
    const entries = [...state.available]
        .filter(name => name !== row.name)
        .map(name => library.find(ex => (ex.name || ex.machine) === name) || { name });
    const gymSection = entries.length > 0
        ? { gym: state.gym, exercises: entries.slice(0, 8) }
        : null;

    openSharedAddExerciseSheet({
        title: 'Swap exercise',
        targetWorkoutLabel: `Replacing ${row.name} today`,
        alreadyAdded: state.rows.map(r => r.name),
        gymSection,
        onSelect: (exerciseRecord) => {
            row.choice = 'swap';
            row.swapTo = exerciseRecord;
            rerenderSubstitutionRows();
        },
    });
};

window._bsSubStart = () => {
    const state = _subSheetState;
    if (!state) return;
    _subSheetState = null;
    closeSubstitutionSheetImmediate();

    // D10 memory: remember swap/skip per gym+template+exercise so the next
    // visit pre-fills instead of re-asking. Keep/machine clear the memory
    // (machine links persist on the equipment doc itself).
    try {
        const mem = { ...(AppState.settings?.gymSubstitutions || {}) };
        const gymMem = { ...(mem[state.gym] || {}) };
        for (const row of state.rows) {
            const key = `${state.templateKey}::${row.name}`;
            if (row.choice === 'skip') gymMem[key] = { choice: 'skip' };
            else if (row.choice === 'swap' && row.swapTo) gymMem[key] = { choice: 'swap', swapTo: row.swapTo.name || row.swapTo.machine };
            else delete gymMem[key];
        }
        mem[state.gym] = gymMem;
        if (typeof window.updateSetting === 'function') {
            window.updateSetting('gymSubstitutions', mem);
        }
    } catch (e) {
        console.error('❌ Substitution memory save failed:', e);
    }

    const skips = new Set(state.rows.filter(r => r.choice === 'skip').map(r => r.name));
    const swaps = new Map(state.rows
        .filter(r => r.choice === 'swap' && r.swapTo)
        .map(r => [r.name, r.swapTo]));
    state.resolve(skips.size === 0 && swaps.size === 0 ? null : { skips, swaps });
};

/**
 * Apply session-only choices to the CLONED workout (D5: the template doc is
 * never touched). Swapped-in exercises inherit the slot's set count.
 */
function applySessionSubstitutions(subs) {
    if (!subs || !AppState.currentWorkout?.exercises) return;
    const library = AppState.exerciseDatabase || [];

    let exercises = AppState.currentWorkout.exercises
        .filter(ex => !subs.skips.has(ex.name || ex.machine));

    exercises = exercises.map(ex => {
        const swapTo = subs.swaps.get(ex.name || ex.machine);
        if (!swapTo) return ex;
        const record = library.find(e => (e.name || e.machine) === (swapTo.name || swapTo.machine)) || swapTo;
        const newName = record.name || record.machine;
        return {
            machine: newName,
            name: newName,
            sets: ex.sets || 3,
            reps: record.reps || ex.reps || 10,
            weight: record.weight || 0,
            video: record.video || '',
            equipment: record.equipment || null,
            category: record.category || null,
        };
    });

    AppState.currentWorkout.exercises = exercises;
}

/**
 * Bottom sheet shown when GPS is unavailable (denied / timed out / too
 * inaccurate) but the user has saved gyms: "Couldn't find you — pick your
 * gym." Tap-first, non-blocking — dismissing starts the workout with no
 * location, and "New gym" falls through to the name prompt.
 * Self-contained DOM like showGymChooserSheet; handlers hang off window so
 * no main.js export wiring is needed.
 */
function showGymFallbackSheet(savedLocations, workoutManager) {
    document.getElementById('gym-fallback-backdrop')?.remove();
    document.getElementById('gym-fallback-sheet')?.remove();

    const close = () => {
        document.getElementById('gym-fallback-backdrop')?.remove();
        document.getElementById('gym-fallback-sheet')?.remove();
        delete window._bsPickFallbackGym;
        delete window._bsFallbackNewGym;
        delete window._bsFallbackSkip;
    };

    window._bsFallbackSkip = () => close();

    window._bsFallbackNewGym = () => {
        close();
        promptForLocationSelection(workoutManager, savedLocations);
    };

    window._bsPickFallbackGym = async (index) => {
        const loc = savedLocations[index];
        close();
        if (!loc) return;

        setSessionLocation(loc.name);
        if (AppState.savedData) {
            AppState.savedData.location = loc.name;
            await saveWorkoutData(AppState);
        }
        if (AppState.currentWorkout) renderActiveWorkout();
        updateLocationIndicator(loc.name);

        try {
            if (loc.id) await workoutManager.updateLocationVisit(loc.id);
        } catch (err) {
            console.error('❌ Error updating location visit:', err);
        }
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'gym-fallback-backdrop';
    backdrop.onclick = () => window._bsFallbackSkip();

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'gym-fallback-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Pick your gym');

    // savedLocations arrive sorted by last visit (getUserLocations orderBy),
    // so the most likely gym is already on top.
    const rows = savedLocations.map((loc, i) => `
        <div class="js-row" onclick="_bsPickFallbackGym(${i})">
            <div class="js-row__icon js-row__icon--equip"><i class="fas fa-map-marker-alt"></i></div>
            <div class="js-row__info">
                <div class="js-row__name">${escapeHtml(loc.name)}</div>
                ${loc.cityState ? `<div class="js-row__meta">${escapeHtml(loc.cityState)}</div>` : ''}
            </div>
        </div>
    `).join('');

    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">Couldn't find you</div>
            <div class="aw-sheet__subtitle">Pick your gym — GPS isn't available</div>
        </div>
        <div class="aw-sheet__body">${rows}</div>
        <div class="aw-sheet__actions">
            <button class="aw-sheet__action" onclick="_bsFallbackSkip()">Skip</button>
            <button class="aw-sheet__action" onclick="_bsFallbackNewGym()">New gym</button>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        sheet.classList.add('visible');
    });
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
 * Change workout location (called when user clicks location indicator).
 * Allowed even after sets are logged — GPS matching can pick the wrong gym
 * when saved gyms sit within each other's radius (adjacent casino gyms on
 * the Strip), and the user must be able to correct it mid-workout.
 */
export async function changeWorkoutLocation() {
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

        // Populate location list — nearest first when GPS is available, so
        // overlapping gyms (two casinos on the same block) are easy to tell apart.
        if (savedLocations.length === 0) {
            listContainer.innerHTML = '<div class="location-list-empty">No saved locations yet</div>';
        } else {
            const coords = getCurrentCoords();
            const sorted = savedLocations
                .map((loc) => ({
                    ...loc,
                    _distance: coords && loc.latitude && loc.longitude
                        ? calculateDistance(coords.latitude, coords.longitude, loc.latitude, loc.longitude)
                        : null,
                }))
                .sort((a, b) => (a._distance ?? Infinity) - (b._distance ?? Infinity));

            const currentLocation = getSessionLocation();
            listContainer.textContent = '';
            sorted.forEach((loc) => {
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

                const metaSpan = document.createElement('span');
                metaSpan.className = 'location-option-visits';
                if (loc._distance !== null) {
                    metaSpan.textContent = loc._distance < 1000
                        ? `${Math.round(loc._distance)} m away`
                        : `${(loc._distance / 1000).toFixed(1)} km away`;
                } else {
                    metaSpan.textContent = `${loc.visitCount || 0} visits`;
                }
                option.appendChild(metaSpan);

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
        updateLocationIndicator(locationName);

        // Update saved workout data
        if (AppState.savedData) {
            AppState.savedData.location = locationName;
            await saveWorkoutData(AppState);
        }

        // Re-render the V2 wizard so the header shows the corrected gym
        if (AppState.currentWorkout) renderActiveWorkout();

        // Equipment already used this session was associated with the old gym.
        // Add the corrected gym to those equipment docs (idempotent). The old
        // association is left alone — it may be a real one from past sessions;
        // the equipment library is the place to prune it.
        try {
            const { workoutManager } = window._locationSelectorData || {};
            const exercises = AppState.savedData?.exercises || {};
            const usedNames = new Set();
            for (const key of Object.keys(exercises)) {
                const ex = exercises[key];
                if (ex?.equipment && (ex.sets || []).some((s) => s.completed)) {
                    usedNames.add(ex.equipment.toLowerCase());
                }
            }
            if (workoutManager && usedNames.size > 0) {
                const allEquipment = await workoutManager.getUserEquipment();
                for (const eq of allEquipment) {
                    if (eq.name && usedNames.has(eq.name.toLowerCase())) {
                        await workoutManager.addLocationToEquipment(eq.id, locationName);
                    }
                }
            }
        } catch (err) {
            console.error('❌ Error re-associating equipment with corrected location:', err);
        }
    }

    closeWorkoutLocationSelector();
}
