// Manual Workout Module - core/manual-workout.js
// Full-page two-step flow (§3 rewrite): pick date + source → enter sets → save.
//
// Step 1 and Step 2 share the #manual-workout-section container; the module
// just toggles which step's wrapper is visible and delegates the page header
// to each step's .page-header markup. Date/duration editing is inline (no
// prompt dialogs) — the date chip wraps a hidden <input type="date"> and the
// duration chip uses a ± stepper.

import { AppState } from '../utils/app-state.js';
import { showNotification, escapeHtml, escapeAttr, openModal, closeModal } from '../ui/ui-helpers.js';
import { navigateTo, navigateBack } from '../ui/navigation.js';

// ===================================================================
// STATE
// ===================================================================

let manualWorkoutState = {
    date: '',
    workoutType: '', // Name of the workout
    category: '',
    isCustom: false, // true if creating new custom workout
    exercises: [], // Array of exercises with sets, equipment
    duration: 60,
    status: 'completed',
    notes: '',
    location: '', // Gym location
    sourceTemplateId: null, // If from library, track which template
};

// ===================================================================
// MODAL MANAGEMENT
// ===================================================================

export function showAddManualWorkoutModal() {
    const section = document.getElementById('manual-workout-section');
    if (!section) return;

    // Reset state
    resetManualWorkoutState();

    // Set default date to today
    const dateInput = document.getElementById('manual-workout-date');
    if (dateInput) {
        dateInput.value = AppState.getTodayDateString();
    }

    // Reset UI to step 1
    showManualStep(1);

    // Load workout library for selection
    loadWorkoutLibraryForManual();

    navigateTo('manual-workout-section');
}

export function closeAddManualWorkoutModal() {
    resetManualWorkoutState();
    navigateBack();
}

function resetManualWorkoutState() {
    manualWorkoutState = {
        date: '',
        workoutType: '',
        category: '',
        isCustom: false,
        exercises: [],
        duration: 60,
        status: 'completed',
        notes: '',
        location: '',
        sourceTemplateId: null,
    };

    // Reset form inputs
    const inputs = ['manual-workout-name', 'manual-workout-notes'];
    inputs.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const durationInput = document.getElementById('manual-workout-duration');
    if (durationInput) durationInput.value = '60';

    const categorySelect = document.getElementById('manual-workout-category');
    if (categorySelect) categorySelect.value = '';

    // Collapse source options
    const libraryList = document.getElementById('manual-library-list');
    const customForm = document.getElementById('manual-custom-form');
    if (libraryList) libraryList.classList.add('hidden');
    if (customForm) customForm.classList.add('hidden');
}

// ===================================================================
// STEP NAVIGATION
// ===================================================================

function showManualStep(step) {
    const step1 = document.getElementById('manual-step-1');
    const step2 = document.getElementById('manual-step-2');

    if (step === 1) {
        if (step1) step1.classList.remove('hidden');
        if (step2) step2.classList.add('hidden');
    } else if (step === 2) {
        if (step1) step1.classList.add('hidden');
        if (step2) step2.classList.remove('hidden');

        // Title
        const titleDisplay = document.getElementById('manual-workout-title-display');
        if (titleDisplay) titleDisplay.textContent = manualWorkoutState.workoutType || 'Your Workout';

        // Date chip: seed hidden native input + friendly label
        const dateDisplay = document.getElementById('manual-workout-date-display');
        const dateHidden = document.getElementById('manual-workout-date-step2');
        if (dateDisplay) dateDisplay.textContent = formatDateForDisplay(manualWorkoutState.date);
        if (dateHidden) dateHidden.value = manualWorkoutState.date;

        // Duration chip + hidden input kept in lockstep
        const durationChip = document.getElementById('manual-workout-duration-chip');
        const durationInput = document.getElementById('manual-workout-duration');
        if (durationChip) durationChip.textContent = String(manualWorkoutState.duration || 60);
        if (durationInput) durationInput.value = String(manualWorkoutState.duration || 60);

        // Show/hide add exercise button based on custom vs library
        const addExerciseSection = document.getElementById('manual-add-exercise-section');
        if (addExerciseSection) {
            addExerciseSection.classList.toggle('hidden', !manualWorkoutState.isCustom);
        }

        // Load locations dropdown
        loadLocationsForManual();

        renderManualExercises();
    }
}

async function loadLocationsForManual() {
    const locationSelect = document.getElementById('manual-workout-location');
    if (!locationSelect) return;

    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const locations = await workoutManager.getUserLocations();

        // Clear existing options except first placeholder
        locationSelect.innerHTML = '<option value="">Select gym location...</option>';

        // Add locations
        locations.forEach((loc) => {
            const option = document.createElement('option');
            option.value = loc.name;
            option.textContent = loc.name;
            locationSelect.appendChild(option);
        });

        // Restore selection if exists
        if (manualWorkoutState.location) {
            locationSelect.value = manualWorkoutState.location;
        }
    } catch (error) {
        console.error('❌ Error loading locations:', error);
    }
}

export function backToManualStep1() {
    showManualStep(1);
}

// ===================================================================
// SOURCE SELECTION (Library vs Custom)
// ===================================================================

export function toggleManualWorkoutSource(source) {
    const libraryList = document.getElementById('manual-library-list');
    const customForm = document.getElementById('manual-custom-form');

    if (source === 'library') {
        libraryList?.classList.toggle('hidden');
        customForm?.classList.add('hidden');
    } else if (source === 'custom') {
        customForm?.classList.toggle('hidden');
        libraryList?.classList.add('hidden');
    }
}

async function loadWorkoutLibraryForManual() {
    const container = document.getElementById('manual-library-list');
    if (!container) return;

    container.innerHTML = '<div class="library-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        // Get all workout templates
        const templates = AppState.workoutPlans || [];
        const activeTemplates = templates.filter((t) => !t.isHidden && !t.deleted);

        if (activeTemplates.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-dumbbell"></i></div>
                    <div class="empty-state-title">No saved workouts found</div>
                    <div class="empty-state-description">Create a custom workout instead!</div>
                </div>
            `;
            return;
        }

        container.innerHTML = activeTemplates
            .map(
                (template, index) => `
            <div class="manual-library-item" onclick="selectWorkoutForManual(${index})">
                <div class="library-item-name">
                    <i class="fas fa-dumbbell"></i>
                    ${escapeHtml(template.name || template.day)}
                </div>
                <div class="library-item-meta">
                    ${template.exercises?.length || 0} exercises
                </div>
                <i class="fas fa-chevron-right"></i>
            </div>
        `
            )
            .join('');
    } catch (error) {
        console.error('Error loading workout library:', error);
        container.innerHTML = '<div class="error-message">Error loading workouts</div>';
    }
}

export function selectWorkoutForManual(templateIndex) {
    const date = document.getElementById('manual-workout-date')?.value;
    if (!date) {
        showNotification('Please select a date first', 'warning');
        return;
    }

    const templates = AppState.workoutPlans || [];
    const activeTemplates = templates.filter((t) => !t.isHidden && !t.deleted);
    const template = activeTemplates[templateIndex];

    if (!template) {
        showNotification('Workout not found', 'error');
        return;
    }

    // Set state from template
    manualWorkoutState.date = date;
    manualWorkoutState.workoutType = template.name || template.day;
    manualWorkoutState.category = template.category || 'Other';
    manualWorkoutState.isCustom = false;
    manualWorkoutState.sourceTemplateId = template.id;

    // Copy exercises from template with empty sets for user to fill in
    manualWorkoutState.exercises = (template.exercises || []).map((ex) => ({
        name: ex.name || ex.machine,
        bodyPart: ex.bodyPart || '',
        equipmentType: ex.equipmentType || '',
        defaultSets: ex.sets || 3,
        defaultReps: ex.reps || 10,
        defaultWeight: ex.weight || 0,
        sets: Array(ex.sets || 3)
            .fill(null)
            .map(() => ({
                reps: ex.reps || 10,
                weight: ex.weight || 0,
                completed: false,
            })),
        notes: '',
    }));

    showManualStep(2);
}

export function startCustomManualWorkout() {
    const date = document.getElementById('manual-workout-date')?.value;
    const name = document.getElementById('manual-workout-name')?.value.trim();
    const category = document.getElementById('manual-workout-category')?.value;

    if (!date) {
        showNotification('Please select a date', 'warning');
        return;
    }
    if (!name) {
        showNotification('Please enter a workout name', 'warning');
        return;
    }
    if (!category) {
        showNotification('Please select a category', 'warning');
        return;
    }

    manualWorkoutState.date = date;
    manualWorkoutState.workoutType = name;
    manualWorkoutState.category = category;
    manualWorkoutState.isCustom = true;
    manualWorkoutState.exercises = [];

    showManualStep(2);
}

// ===================================================================
// EXERCISE MANAGEMENT
// ===================================================================

function renderManualExercises() {
    const container = document.getElementById('manual-exercises-container');
    if (!container) return;

    // Build the "recent exercises" quick-pick strip for custom workouts.
    // Filters out anything already on the card list + autofills values from
    // last session when the user taps one.
    let recentStripHtml = '';
    if (manualWorkoutState.isCustom) {
        const existing = new Set(manualWorkoutState.exercises.map(e => e.name));
        const remaining = getRecentExerciseNames(10).filter(n => !existing.has(n));
        if (remaining.length > 0) {
            recentStripHtml = `
                <div class="sec-head"><h4>Recent exercises <span class="count">tap to add</span></h4></div>
                <div class="manual-recent-chips">
                    ${remaining.map(name => `
                        <button class="chip manual-recent-chip" onclick="quickAddRecentExercise('${escapeAttr(name)}')">
                            <i class="fas fa-plus"></i> ${escapeHtml(name)}
                        </button>
                    `).join('')}
                </div>
            `;
        }
    }

    if (manualWorkoutState.exercises.length === 0) {
        container.innerHTML = `
            ${recentStripHtml}
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-dumbbell"></i></div>
                <div class="empty-state-title">No exercises yet</div>
                <div class="empty-state-description">${manualWorkoutState.isCustom ? 'Tap a recent exercise above or use Add Exercise.' : 'Click "Add Exercise" to get started.'}</div>
            </div>
        `;
        return;
    }

    const unit = AppState.globalUnit || 'lbs';

    container.innerHTML = recentStripHtml + manualWorkoutState.exercises
        .map((exercise, exIndex) => {
            const equipmentDisplay = exercise.equipment || '';
            const equipmentLabel = equipmentDisplay
                ? escapeHtml(equipmentDisplay)
                : '<span class="manual-ex-equip-empty">Pick equipment</span>';

            return `
        <div class="manual-exercise-card" data-ex-index="${exIndex}">
            <div class="manual-ex-head">
                <div class="manual-ex-name-col">
                    <div class="manual-ex-name">${escapeHtml(exercise.name)}</div>
                    <button class="manual-ex-equip-btn" onclick="openEquipmentPickerForManual(${exIndex})"
                            aria-label="Change equipment">
                        <i class="fas fa-cog"></i> ${equipmentLabel}
                    </button>
                </div>
                <button class="manual-ex-overflow" onclick="removeManualExercise(${exIndex})"
                        aria-label="Remove exercise">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="manual-sets-grid" role="table" aria-label="Sets">
                <div class="manual-sets-grid__head" role="row">
                    <div role="columnheader">#</div>
                    <div role="columnheader">Weight</div>
                    <div role="columnheader">Reps</div>
                    <div role="columnheader" aria-label="Remove set"></div>
                </div>
                ${exercise.sets.map((set, setIndex) => {
                    const isDone = !!(set.reps && set.weight);
                    return `
                <div class="manual-sets-grid__row${isDone ? ' manual-sets-grid__row--done' : ''}" role="row">
                    <div class="manual-sets-grid__num">${setIndex + 1}</div>
                    <input type="number" inputmode="decimal" class="manual-sets-grid__input"
                           value="${set.weight || ''}" placeholder="0"
                           data-ex-index="${exIndex}" data-set-index="${setIndex}" data-field="weight"
                           onchange="updateManualSet(${exIndex}, ${setIndex}, 'weight', this.value)">
                    <input type="number" inputmode="numeric" class="manual-sets-grid__input"
                           value="${set.reps || ''}" placeholder="0"
                           data-ex-index="${exIndex}" data-set-index="${setIndex}" data-field="reps"
                           onchange="updateManualSet(${exIndex}, ${setIndex}, 'reps', this.value)">
                    <button class="manual-sets-grid__remove" onclick="removeManualSet(${exIndex}, ${setIndex})"
                            aria-label="Remove set ${setIndex + 1}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`;
                }).join('')}
            </div>
            <button class="manual-add-set-btn" onclick="addManualSet(${exIndex})">
                <i class="fas fa-plus"></i> Add Set
            </button>
        </div>
    `;
        })
        .join('');
}

/** Focus the first empty input on the given exercise card. Called after
 *  adding a new exercise or set so typing can continue without a click. */
function focusFirstEmptyInput(exIndex) {
    requestAnimationFrame(() => {
        const container = document.getElementById('manual-exercises-container');
        if (!container) return;
        const card = container.querySelector(`.manual-exercise-card[data-ex-index="${exIndex}"]`);
        if (!card) return;
        const inputs = card.querySelectorAll('.manual-sets-grid__input');
        for (const el of inputs) {
            if (!el.value) { el.focus(); return; }
        }
        // All filled — focus the first anyway so user can edit
        inputs[0]?.focus();
    });
}

export function updateManualSet(exIndex, setIndex, field, value) {
    const exercise = manualWorkoutState.exercises[exIndex];
    if (!exercise || !exercise.sets[setIndex]) return;

    const numValue = parseFloat(value);
    exercise.sets[setIndex][field] = isNaN(numValue) ? null : numValue;
    exercise.sets[setIndex].completed = exercise.sets[setIndex].reps && exercise.sets[setIndex].weight;
}

export function addManualSet(exIndex) {
    const exercise = manualWorkoutState.exercises[exIndex];
    if (!exercise) return;

    // Copy-previous-set: pre-fill from the last set so logging a consistent
    // exercise is one tap + Save instead of retyping weight/reps per set.
    const prev = exercise.sets[exercise.sets.length - 1];
    exercise.sets.push({
        reps: prev?.reps ?? exercise.defaultReps ?? 10,
        weight: prev?.weight ?? exercise.defaultWeight ?? 0,
        completed: false,
    });

    renderManualExercises();
    focusFirstEmptyInput(exIndex);
}

export function removeManualSet(exIndex, setIndex) {
    const exercise = manualWorkoutState.exercises[exIndex];
    if (!exercise || exercise.sets.length <= 1) {
        showNotification('Must have at least one set', 'warning');
        return;
    }

    exercise.sets.splice(setIndex, 1);
    renderManualExercises();
}

export function removeManualExercise(exIndex) {
    if (confirm('Remove this exercise?')) {
        manualWorkoutState.exercises.splice(exIndex, 1);
        renderManualExercises();
    }
}

// Open exercise picker for custom workouts
export function openExercisePickerForManual() {
    // Use the existing exercise library
    if (window.exerciseLibrary && window.exerciseLibrary.openForManualWorkout) {
        window.exerciseLibrary.openForManualWorkout();
    } else {
        // Fallback: simple prompt
        const exerciseName = prompt('Enter exercise name:');
        if (exerciseName && exerciseName.trim()) {
            addExerciseToManualWorkout({
                name: exerciseName.trim(),
                sets: 3,
                reps: 10,
                weight: 0,
            });
        }
    }
}

// Called by exercise library when exercise is selected
export function addExerciseToManualWorkout(exerciseData, opts = {}) {
    const exercise = typeof exerciseData === 'string' ? JSON.parse(exerciseData) : exerciseData;
    // When `opts.lastSessionSets` is provided (e.g. from quickAddRecentExercise),
    // use the real sets the user hit last time — one row per real set — instead
    // of filling N identical rows from the template default.
    const lastSets = Array.isArray(opts.lastSessionSets) ? opts.lastSessionSets : null;
    const defaultSets = lastSets?.length || exercise.sets || 3;

    manualWorkoutState.exercises.push({
        name: exercise.name || exercise.machine,
        bodyPart: exercise.bodyPart || '',
        equipmentType: exercise.equipmentType || '',
        equipment: exercise.equipment || null,
        equipmentLocation: exercise.equipmentLocation || null,
        defaultSets,
        defaultReps: lastSets?.[0]?.reps ?? exercise.reps ?? 10,
        defaultWeight: lastSets?.[0]?.weight ?? exercise.weight ?? 0,
        sets: Array(defaultSets)
            .fill(null)
            .map((_, i) => {
                const last = lastSets?.[i];
                return {
                    reps: last?.reps ?? exercise.reps ?? 10,
                    weight: last?.weight ?? exercise.weight ?? 0,
                    completed: false,
                };
            }),
        notes: '',
    });

    // Close exercise library if open
    if (window.exerciseLibrary?.close) {
        window.exerciseLibrary.close();
    }

    renderManualExercises();
    // Focus the new card's first empty input so typing picks up naturally.
    focusFirstEmptyInput(manualWorkoutState.exercises.length - 1);
}

/**
 * Quick-add an exercise by name — pre-fills sets/reps/weight from the user's
 * most recent session doing this exercise. Fires from the "recent exercises"
 * chip strip above the exercise list.
 */
export async function quickAddRecentExercise(exerciseName) {
    if (!exerciseName) return;
    let last = null;
    try {
        const { getLastSessionDefaults } = await import('../data/data-manager.js');
        last = await getLastSessionDefaults(exerciseName);
    } catch (err) {
        console.warn('Could not load last session for', exerciseName, err);
    }
    addExerciseToManualWorkout(
        { name: exerciseName, sets: 3, reps: 10, weight: 0 },
        { lastSessionSets: last?.sets }
    );
}

/**
 * Distinct exercise names from the user's most recent workouts.
 * Limited by `limit` and de-duplicated in most-recent-first order.
 */
function getRecentExerciseNames(limit = 10) {
    const workouts = Array.isArray(AppState.workouts) ? AppState.workouts : [];
    const seen = new Set();
    const names = [];
    for (const w of workouts) {
        if (!w || !w.exercises) continue;
        for (const [key, ex] of Object.entries(w.exercises)) {
            const idx = key.replace('exercise_', '');
            const name = w.exerciseNames?.[key]
                || w.originalWorkout?.exercises?.[idx]?.machine
                || ex?.name;
            if (!name || seen.has(name)) continue;
            seen.add(name);
            names.push(name);
            if (names.length >= limit) return names;
        }
    }
    return names;
}

// Alias for backwards compatibility
export function addToManualWorkoutFromLibrary(exerciseData) {
    addExerciseToManualWorkout(exerciseData);
}

// ===================================================================
// HEADER CHIP ACTIONS (§3 — inline, no prompt dialogs)
// ===================================================================

/** Called on change of the hidden <input type="date"> inside the date chip. */
export function applyManualDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    manualWorkoutState.date = value;
    const chipLabel = document.getElementById('manual-workout-date-display');
    if (chipLabel) chipLabel.textContent = formatDateForDisplay(value);
}

/** Stepper handler for the duration chip — keeps the display + the hidden
 *  input used by saveManualWorkout in lockstep. Clamped to 1..300 minutes. */
export function adjustManualDuration(delta) {
    const chip = document.getElementById('manual-workout-duration-chip');
    const input = document.getElementById('manual-workout-duration');
    const current = parseInt(chip?.textContent || input?.value || '60', 10);
    const next = Math.max(1, Math.min(300, (isFinite(current) ? current : 60) + delta));
    if (chip) chip.textContent = String(next);
    if (input) input.value = String(next);
    manualWorkoutState.duration = next;
}

// Legacy aliases — still window-bound; now no-op stubs that route to the inline
// editors so any lingering callers (documentation, stale event handlers) don't
// blow up. Safe to remove after a dev cycle of no observed calls.
export function editManualDate() {
    document.getElementById('manual-workout-date-step2')?.showPicker?.();
}
export function editManualDuration() {
    // The ± steppers are always visible — nothing to expand.
}

// ===================================================================
// SAVE WORKOUT
// ===================================================================

export async function saveManualWorkout() {
    if (!AppState.currentUser) {
        showNotification('Please sign in to save workouts', 'warning');
        return;
    }

    // Validate
    if (!manualWorkoutState.date) {
        showNotification('Please select a date', 'warning');
        return;
    }

    if (!manualWorkoutState.workoutType) {
        showNotification('Please select or create a workout', 'warning');
        return;
    }

    if (manualWorkoutState.exercises.length === 0) {
        showNotification('Please add at least one exercise', 'warning');
        return;
    }

    // Get final details from form
    manualWorkoutState.duration = parseInt(document.getElementById('manual-workout-duration')?.value) || 60;
    manualWorkoutState.status = document.getElementById('manual-workout-status')?.value || 'completed';
    manualWorkoutState.notes = document.getElementById('manual-workout-notes')?.value || '';
    manualWorkoutState.location = document.getElementById('manual-workout-location')?.value || '';

    try {
        // Build workout data for Firebase
        const workoutData = {
            workoutType: manualWorkoutState.workoutType,
            category: manualWorkoutState.category,
            date: manualWorkoutState.date,
            startedAt: new Date(manualWorkoutState.date + 'T12:00:00').toISOString(),
            completedAt: new Date(manualWorkoutState.date + 'T13:00:00').toISOString(),
            isManual: true,
            status: manualWorkoutState.status,
            totalDuration: manualWorkoutState.duration * 60,
            notes: manualWorkoutState.notes,
            location: manualWorkoutState.location || null,
            exercises: {},
            exerciseNames: {},
            originalWorkout: {
                exercises: manualWorkoutState.exercises.map((ex) => ({
                    name: ex.name,
                    sets: ex.sets.length,
                    reps: ex.defaultReps,
                    weight: ex.defaultWeight,
                    equipment: ex.equipment,
                    equipmentLocation: ex.equipmentLocation,
                })),
            },
            version: '2.0',
        };

        // Process exercises
        manualWorkoutState.exercises.forEach((exercise, index) => {
            const key = `exercise_${index}`;
            workoutData.exerciseNames[key] = exercise.name;
            workoutData.exercises[key] = {
                sets: exercise.sets.map((s) => ({
                    reps: s.reps || 0,
                    weight: s.weight || 0,
                    originalUnit: 'lbs',
                })),
                notes: exercise.notes || '',
                completed: true,
                equipment: exercise.equipment || null,
                equipmentLocation: exercise.equipmentLocation || null,
            };
        });

        // Save to Firebase
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        await workoutManager.saveWorkout(workoutData);

        showNotification('Workout saved!', 'success');

        // If custom workout, offer to save as template
        if (manualWorkoutState.isCustom && manualWorkoutState.exercises.length > 0) {
            if (confirm('Save this as a new workout template for future use?')) {
                await saveAsNewTemplate();
            }
        }

        closeAddManualWorkoutModal();

        // Refresh calendar/history view if showing
        if (window.workoutHistory) {
            // Reload workout history and regenerate calendar
            await window.workoutHistory.loadHistory();
            if (window.workoutHistory.initializeCalendar) {
                await window.workoutHistory.initializeCalendar();
            }
        }
    } catch (error) {
        console.error('Error saving manual workout:', error);
        showNotification('Error saving workout', 'error');
    }
}

async function saveAsNewTemplate() {
    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);

        const templateData = {
            name: manualWorkoutState.workoutType,
            day: manualWorkoutState.workoutType,
            category: manualWorkoutState.category,
            exercises: manualWorkoutState.exercises.map((ex) => ({
                name: ex.name,
                machine: ex.name,
                bodyPart: ex.bodyPart,
                equipmentType: ex.equipmentType,
                sets: ex.sets.length,
                reps: ex.defaultReps || 10,
                weight: ex.defaultWeight || 0,
            })),
            isDefault: false,
            isHidden: false,
            createdAt: new Date().toISOString(),
        };

        await workoutManager.saveWorkoutTemplate(templateData);
        showNotification('Template saved to Workout Library!', 'success');

        // Refresh workout plans in AppState
        const templates = await workoutManager.getUserWorkoutTemplates();
        AppState.workoutPlans = templates;
    } catch (error) {
        console.error('Error saving template:', error);
        showNotification('Error saving template', 'error');
    }
}

// ===================================================================
// EQUIPMENT PICKER FOR MANUAL WORKOUT
// ===================================================================

let manualEquipmentEditIndex = null;

export async function openEquipmentPickerForManual(exerciseIndex) {
    manualEquipmentEditIndex = exerciseIndex;

    // Get the exercise name for filtering
    const exercise = manualWorkoutState.exercises[exerciseIndex];
    if (!exercise) return;

    const exerciseName = exercise.name;

    // Get the equipment picker modal
    const modal = document.getElementById('equipment-picker-modal');
    if (!modal) {
        console.error('❌ Equipment picker modal not found');
        return;
    }

    // Load equipment for this specific exercise
    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const equipmentList = await workoutManager.getEquipmentForExercise(exerciseName);

        const listContainer = document.getElementById('equipment-picker-list');
        if (listContainer) {
            if (equipmentList.length === 0) {
                listContainer.innerHTML = `<p class="empty-state">No equipment saved for "${escapeHtml(exerciseName)}" yet.<br>Equipment is saved automatically when you log sets during a workout.</p>`;
            } else {
                listContainer.innerHTML = equipmentList
                    .map((eq) => {
                        // Get location from locations array or single location field
                        const location = eq.locations?.length > 0 ? eq.locations[0] : eq.location || '';
                        return `
                    <div class="equipment-picker-item" data-action="selectEquipment" data-eq-id="${escapeAttr(eq.id)}" data-eq-name="${escapeAttr(eq.name || '')}" data-eq-location="${escapeAttr(location || '')}">
                        <i class="fas fa-cog"></i>
                        <div class="equipment-info">
                            <span class="equipment-name">${escapeHtml(eq.name || 'Unknown')}</span>
                            ${location ? `<span class="equipment-location">@ ${escapeHtml(location)}</span>` : ''}
                        </div>
                    </div>
                `;
                    })
                    .join('');

            // Event delegation for equipment selection
            listContainer.addEventListener('click', (e) => {
                const item = e.target.closest('[data-action="selectEquipment"]');
                if (!item) return;
                selectEquipmentForManual(item.dataset.eqId, item.dataset.eqName, item.dataset.eqLocation);
            });
            }
        }

        openModal(modal);
    } catch (error) {
        console.error('❌ Error loading equipment:', error);
        showNotification('Error loading equipment', 'error');
    }
}

export function selectEquipmentForManual(equipmentId, name, location) {
    if (manualEquipmentEditIndex === null) return;

    const exercise = manualWorkoutState.exercises[manualEquipmentEditIndex];
    if (exercise) {
        exercise.equipment = name;
        exercise.equipmentLocation = location || null;
    }

    // Close the modal
    const modal = document.getElementById('equipment-picker-modal');
    closeModal(modal);

    manualEquipmentEditIndex = null;

    // Re-render to show updated equipment
    renderManualExercises();
    // Silent success - equipment appears immediately on exercise card
}

export function closeEquipmentPickerForManual() {
    const modal = document.getElementById('equipment-picker-modal');
    closeModal(modal);
    manualEquipmentEditIndex = null;
}

// ===================================================================
// UTILITIES
// ===================================================================

function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Legacy exports for backwards compatibility
export function proceedToExerciseSelection() {
    // Old function - redirect to new flow
    const date = document.getElementById('manual-workout-date')?.value;
    if (!date) {
        showNotification('Please select a date', 'warning');
        return;
    }
    showNotification('Please select a workout from the library or create a custom one', 'info');
}

export function backToBasicInfo() {
    backToManualStep1();
}

export function finishManualWorkout() {
    saveManualWorkout();
}

// Stubs for old functions
export function editManualExercise(index) {
    // Not needed in new design - inline editing
}

export function markManualExerciseComplete(index) {
    // Not needed - all exercises assumed complete in manual entry
}

export function closeManualExerciseEntry() {
    // Not needed in new design
}
