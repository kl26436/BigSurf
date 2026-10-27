// Workout Management UI Functions
import { AppState } from '../utils/app-state.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { showNotification, escapeHtml, escapeAttr, openModal, closeModal } from '../ui/ui-helpers.js';
import { confirmSheet, promptSheet } from '../ui/confirm-sheet.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { saveWorkoutData } from '../data/data-manager.js';
import { normalizeWorkoutToTemplate } from '../utils/template-helpers.js';
import { getSessionLocation, detectLocation } from '../features/location-service.js';
import { once } from '../ui/busy.js';
import {
    getEquipmentAtLocation,
    getExercisesAtLocation,
    rankExercisesForLocation,
} from '../features/equipment-planner.js';

let workoutManager;
let exerciseLibrary = [];
let filteredExercises = [];

export function initializeWorkoutManagement(appState) {
    workoutManager = new FirebaseWorkoutManager(appState);

    // Listen for exercise library updates from exercise-manager-ui
    window.addEventListener('exerciseLibraryUpdated', async () => {
        const libraryModal = document.getElementById('exercise-library-section');
        if (libraryModal && (libraryModal.open || !libraryModal.classList.contains('hidden'))) {
            exerciseLibrary = await workoutManager.getExerciseLibrary();
            filteredExercises = [...exerciseLibrary];
            renderExerciseLibrary();
        }
    });
}

// Phase 9: showWorkoutManagement / closeWorkoutManagement / hideWorkoutManagement
// targeted #workout-management-section, deleted in Phase 9.1. Navigation routes
// 'templates' / 'workout-management' to showWorkoutSelector now (Phase 1).

/**
 * Normalize exercises to array format
 * Handles both array format: [{...}, {...}]
 * and object format: {exercise_0: {...}, exercise_1: {...}}
 */
// Phase 9 cleanup: normalizeExercisesToArray was deleted; the live copy
// is now in template-helpers.js (used by template-selection.js).

/**
 * Phase 9: convert a completed workout to a saved template, then drop the
 * user on the workout-selector with the new template's row pre-expanded so
 * they can rename it inline. Replaces the legacy showTemplateEditor flow.
 */
/** Single-flight (busy.js): a second tap while this runs is ignored. */
export function saveWorkoutAsTemplate(...args) {
    return once('save-as-workout', () => saveWorkoutAsTemplateNow(...args));
}

async function saveWorkoutAsTemplateNow(workoutData) {
    const template = normalizeWorkoutToTemplate(workoutData);
    if (!template) {
        showNotification("Couldn't save as a workout", 'error');
        return;
    }

    const defaultName = workoutData.workoutType || '';
    const name = await promptSheet({
        title: 'Name this workout',
        placeholder: 'Workout name',
        initialValue: defaultName,
        confirmLabel: 'Save workout',
    });
    if (!name || !name.trim()) return;

    const toSave = {
        name: name.trim(),
        category: template.category || 'other',
        exercises: template.exercises || [],
        suggestedDays: [],
        isCustom: true,
    };

    // 5.6.0 — classify at birth: most save-from-workout templates aren't new
    // workouts, they're variations or one-offs. One chip question; the best
    // match is pre-derived from exercise overlap so the user confirms.
    const bestMatch = findBestTemplateMatch(toSave.exercises);
    const pick = await askTemplateKind(bestMatch);
    toSave.kind = pick.kind;
    if (pick.kind === 'variation' && pick.parentTemplateId) {
        toSave.parentTemplateId = pick.parentTemplateId;
    }

    try {
        const wm = new FirebaseWorkoutManager(AppState);
        const docRef = await wm.saveWorkoutTemplate(toSave);
        AppState.workoutPlans = await wm.getUserWorkoutTemplates();
        showNotification('Saved as workout', 'success');

        const newId = docRef?.id || toSave.id;
        const { expandTemplateInSelector } = await import('../ui/template-selection.js');
        if (newId) expandTemplateInSelector(newId);
    } catch (err) {
        console.error('❌ Error saving as template:', err);
        showNotification('Could not save workout', 'error');
    }
}

/**
 * 5.6.0 — best existing template for "Variation of <X>": highest exercise-name
 * overlap ≥ 50% among non-archived templates. Null when nothing's close.
 */
function findBestTemplateMatch(exercises) {
    const names = new Set((exercises || []).map(e => (e.machine || e.name || '').toLowerCase()).filter(Boolean));
    if (!names.size) return null;
    let best = null;
    for (const t of (AppState.workoutPlans || [])) {
        if (t.archived) continue;
        const tNames = new Set((t.exercises || []).map(e => (e.machine || e.name || '').toLowerCase()).filter(Boolean));
        if (!tNames.size) continue;
        const shared = [...names].filter(n => tNames.has(n)).length;
        const ratio = shared / Math.max(names.size, tNames.size);
        if (ratio >= 0.5 && (!best || ratio > best.ratio)) best = { template: t, ratio };
    }
    return best?.template || null;
}

/**
 * 5.6.0 — one chip question at save time: Regular / Variation of <match> /
 * Just this once. Backdrop tap = Regular (safe default, matches old behavior).
 */
function askTemplateKind(bestMatch) {
    return new Promise((resolve) => {
        // SH-3b: one resolve, whichever way the sheet goes — a row tap
        // records the pick and closes; backdrop / Escape / swipe-down /
        // navigation close with no pick → Regular (the safe default).
        let pick = null;
        window._pickTemplateKind = (kind, parentTemplateId = null) => {
            pick = { kind, parentTemplateId };
            closeSheet('template-kind-sheet');
        };

        openSheet({
            id: 'template-kind-sheet',
            title: 'Keep as',
            subtitle: 'Variations nest under their workout; one-timers archive after use',
            onClose: () => resolve(pick || { kind: 'core' }),
            bodyHTML: `
                <div class="js-row" onclick="_pickTemplateKind('core')">
                    <i class="fas fa-dumbbell"></i>
                    <div class="js-row__txt">Regular workout</div>
                </div>
                ${bestMatch ? `
                <div class="js-row" onclick="_pickTemplateKind('variation', '${escapeAttr(bestMatch.id || bestMatch._id || '')}')">
                    <i class="fas fa-code-branch"></i>
                    <div class="js-row__txt">Variation of ${escapeHtml(bestMatch.name || '')}</div>
                </div>` : ''}
                <div class="js-row" onclick="_pickTemplateKind('oneOff')">
                    <i class="fas fa-clock"></i>
                    <div class="js-row__txt">Just this once</div>
                </div>
            `,
        });
    });
}

/**
 * Phase 9: create a new blank template and open it in the selector for
 * inline editing (rename + add exercises). Replaces the legacy
 * showTemplateEditor flow.
 */
/** Single-flight (busy.js): a second tap while this runs is ignored. */
export function createNewTemplate(...args) {
    return once('create-workout', () => createNewTemplateNow(...args));
}

async function createNewTemplateNow() {
    const name = await promptSheet({
        title: 'Name your new workout',
        placeholder: 'e.g. Upper body',
        confirmLabel: 'Create workout',
    });
    if (!name || !name.trim()) return;

    const toSave = {
        name: name.trim(),
        category: 'other',
        exercises: [],
        suggestedDays: [],
        isCustom: true,
    };

    try {
        const wm = new FirebaseWorkoutManager(AppState);
        const docRef = await wm.saveWorkoutTemplate(toSave);
        AppState.workoutPlans = await wm.getUserWorkoutTemplates();

        const newId = docRef?.id || toSave.id;
        const { expandTemplateInSelector } = await import('../ui/template-selection.js');
        if (newId) expandTemplateInSelector(newId);
    } catch (err) {
        console.error('❌ Error creating template:', err);
        showNotification('Could not create workout', 'error');
    }
}

/**
 * Phase 9: editTemplate now just navigates to the workout-selector and
 * pre-expands the row. The inline editor (Phases 1-7) replaces the legacy
 * full-page editor entirely.
 *
 * Default templates expand the same way; saves go through saveTemplateInline
 * which handles the override flow.
 */
export async function editTemplate(templateId, isDefault = false) {
    if (!templateId) return;
    try {
        const { expandTemplateInSelector } = await import('../ui/template-selection.js');
        expandTemplateInSelector(templateId);
    } catch (err) {
        console.error('❌ Error opening template:', err);
        showNotification('Could not open workout', 'error');
    }
    // isDefault retained in the signature for callsite compatibility (ai-coach,
    // workout-history) — the selector's renderSingleTemplateRow handles default
    // vs custom rendering on its own based on AppState.workoutPlans.
    void isDefault;
}

export async function deleteTemplate(templateId, isDefault = false) {
    if (!workoutManager) {
        console.error('❌ Workout manager not initialized');
        showNotification("Can't delete right now — try again in a moment", 'error');
        return;
    }

    // Get template name for the hidden marker
    let templateName = templateId;
    if (isDefault) {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const manager = new FirebaseWorkoutManager(AppState);
        const allDefaults = await manager.getGlobalDefaultTemplates();
        const template = allDefaults.find((t) => (t.id || t.day) === templateId);
        if (template) {
            templateName = template.name || template.day;
        }
    }

    const confirmed = await confirmSheet({
        title: 'Delete this workout?',
        message: "This can't be undone.",
        confirmLabel: 'Delete workout',
        cancelLabel: 'Keep workout',
        destructive: true,
    });

    if (confirmed) {
        try {
            if (isDefault) {
                // Create a "hidden" marker for this default template
                const hiddenMarker = {
                    id: `hidden_${templateId}`,
                    name: templateName,
                    overridesDefault: templateId,
                    isHidden: true,
                    hiddenAt: new Date().toISOString(),
                };
                await workoutManager.saveWorkoutTemplate(hiddenMarker);
            } else {
                // Actually delete the custom template
                await workoutManager.deleteWorkoutTemplate(templateId);
            }

            // Reload AppState so the workout-selector picks up the change.
            AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();
        } catch (error) {
            console.error(`❌ Error deleting template:`, error);
            showNotification("Couldn't delete workout — try again", 'error');
        }
    }
}

export async function resetToDefault(defaultTemplateId) {
    if (!workoutManager) {
        console.error('❌ Workout manager not initialized');
        showNotification("Can't reset right now — try again in a moment", 'error');
        return;
    }

    const confirmed = await confirmSheet({
        title: 'Reset this workout to default?',
        message: 'Your changes will be lost.',
        confirmLabel: 'Reset workout',
        cancelLabel: 'Keep changes',
        destructive: true,
    });

    if (confirmed) {
        try {
            // Find and delete the override/hidden marker
            const templates = await workoutManager.getUserWorkoutTemplates();
            const override = templates.find((t) => t.overridesDefault === defaultTemplateId);

            if (override) {
                await workoutManager.deleteWorkoutTemplate(override.id);

                // Reload AppState so the workout-selector picks up the change.
                AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();
            }
        } catch (error) {
            console.error('❌ Error resetting template:', error);
            showNotification("Couldn't reset workout — try again", 'error');
        }
    }
}


// Phase 9: useTemplate, showTemplateEditor, renderTemplateExercises, the inline
// search/quick-add, the supersets bar, createTemplateExerciseItem, the chip
// handlers, addExerciseToTemplate, editTemplateExercise, saveInlineEdit,
// closeTemplateExerciseEdit, saveTemplateExerciseEdit, moveTemplateExercise,
// removeTemplateExercise — all targeted #template-editor-section / its modal
// (deleted in Phase 9.1). The selector (Phases 1-7) replaces every flow.

// Exercise Library functions
let recentExercises = [];
let gymSuggestedExercises = [];
let gymLocationName = null;

// `mode` (kept for API back-compat with active-workout callers) is unused
// — the function always opens the same #exercise-library-section now.
export async function openExerciseLibrary(_mode = 'template') {
    const modal = document.getElementById('exercise-library-section');
    if (!modal) return;

    // Show as full-page section (no longer a dialog)
    modal.classList.remove('hidden');

    // Load exercise library, recent exercises, and equipment data in parallel
    const [library, , allEquipment, savedLocations] = await Promise.all([
        workoutManager.getExerciseLibrary(),
        workoutManager.getMostUsedExercises(8).then((r) => { recentExercises = r; }).catch(() => { recentExercises = []; }),
        workoutManager.getUserEquipment().catch(() => []),
        workoutManager.getUserLocations().catch(() => []),
    ]);
    exerciseLibrary = library;
    filteredExercises = [...exerciseLibrary];

    // Compute gym-suggested exercises (Phase 16.2)
    gymSuggestedExercises = [];
    gymLocationName = null;
    try {
        let locationName = getSessionLocation();
        if (!locationName && savedLocations.length > 0) {
            const result = await detectLocation(savedLocations);
            if (result.location) {
                locationName = result.location.name;
            }
        }
        if (locationName && allEquipment.length > 0) {
            gymLocationName = locationName;
            const locationEquipment = getEquipmentAtLocation(allEquipment, locationName);
            const availableExercises = getExercisesAtLocation(locationEquipment);
            gymSuggestedExercises = rankExercisesForLocation(availableExercises, recentExercises, exerciseLibrary);
        }
    } catch {
        // Non-critical — gym suggestions just won't appear
    }

    renderExerciseLibrary();

    // Set up event listeners for search and filters
    setupExerciseLibraryListeners();
}

function setupExerciseLibraryListeners() {
    const searchInput = document.getElementById('exercise-library-search');
    const bodyPartFilter = document.getElementById('body-part-filter');
    const equipmentFilter = document.getElementById('equipment-filter');

    // Remove any existing listeners to prevent duplicates
    if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        newSearchInput.addEventListener('input', filterExerciseLibrary);
    }

    if (bodyPartFilter) {
        const newBodyPartFilter = bodyPartFilter.cloneNode(true);
        bodyPartFilter.parentNode.replaceChild(newBodyPartFilter, bodyPartFilter);
        newBodyPartFilter.addEventListener('change', filterExerciseLibrary);
    }

    if (equipmentFilter) {
        const newEquipmentFilter = equipmentFilter.cloneNode(true);
        equipmentFilter.parentNode.replaceChild(newEquipmentFilter, equipmentFilter);
        newEquipmentFilter.addEventListener('change', filterExerciseLibrary);
    }
}

export function closeExerciseLibrary() {
    const modal = document.getElementById('exercise-library-section');
    if (modal) {
        modal.classList.add('hidden');
    }

    // Clear the active workout flags so the next time the library opens it's
    // treated as a fresh Add (a leftover replacingExerciseIndex would cause
    // the add to be delegated to replace on the wrong exercise).
    window.addingToActiveWorkout = false;
    window.replacingExerciseIndex = null;

    // Clear search
    const searchInput = document.getElementById('exercise-library-search');
    const bodyPartFilter = document.getElementById('body-part-filter');
    const equipmentFilter = document.getElementById('equipment-filter');

    if (searchInput) searchInput.value = '';
    if (bodyPartFilter) bodyPartFilter.value = '';
    if (equipmentFilter) equipmentFilter.value = '';
}

export function searchExerciseLibrary() {
    filterExerciseLibrary();
}

export function filterExerciseLibrary() {
    const searchQuery = document.getElementById('exercise-library-search')?.value || '';
    const bodyPartFilter = document.getElementById('body-part-filter')?.value || '';
    const equipmentFilter = document.getElementById('equipment-filter')?.value || '';

    const filters = {};
    if (bodyPartFilter) filters.bodyPart = bodyPartFilter;
    if (equipmentFilter) filters.equipment = equipmentFilter;

    filteredExercises = workoutManager.searchExercises(exerciseLibrary, searchQuery, filters);
    renderExerciseLibrary();
}

function renderExerciseLibrary() {
    const grid = document.getElementById('exercise-library-grid');
    if (!grid) return;

    if (filteredExercises.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>No exercises found</h3>
                <p>Try adjusting your search or filters.</p>
            </div>
        `;
        return;
    }

    // Group exercises by body part
    const grouped = {};
    filteredExercises.forEach((exercise) => {
        const bodyPart = exercise.bodyPart || 'General';
        if (!grouped[bodyPart]) {
            grouped[bodyPart] = [];
        }
        grouped[bodyPart].push(exercise);
    });

    // Sort body parts alphabetically
    const sortedBodyParts = Object.keys(grouped).sort();

    // Check if search/filter is active
    const searchQuery = document.getElementById('exercise-library-search')?.value || '';
    const bodyPartFilter = document.getElementById('body-part-filter')?.value || '';
    const equipmentFilterVal = document.getElementById('equipment-filter')?.value || '';
    const isFiltered = !!(searchQuery || bodyPartFilter || equipmentFilterVal);

    // Quick Add chips for recently used exercises
    const quickAddHTML = (recentExercises.length > 0)
        ? `<div class="quick-add-section">
            <div class="quick-add-label">Quick add</div>
            <div class="quick-add-chips">
                ${recentExercises.map((ex) => `<button class="chip chip--sm quick-add-chip" data-exercise-name="${escapeAttr(ex.name)}" data-equipment="${escapeAttr(ex.equipment)}">${escapeHtml(ex.name)}</button>`).join('')}
            </div>
        </div>`
        : '';

    // Gym-suggested exercises (Phase 16.2) — only in unfiltered view
    const gymSuggestedHTML = (!isFiltered && gymSuggestedExercises.length > 0 && gymLocationName)
        ? `<div class="quick-add-section">
            <div class="quick-add-label"><i class="fas fa-map-marker-alt"></i> Suggested for ${escapeHtml(gymLocationName)}</div>
            <div class="quick-add-chips">
                ${gymSuggestedExercises.slice(0, 12).map((ex) => {
                    const name = ex.name || ex.machine;
                    const chipClass = ex.usedBefore ? 'chip chip--sm chip--used quick-add-chip' : 'chip chip--sm quick-add-chip';
                    return `<button class="${chipClass}" data-exercise-name="${escapeAttr(name)}" data-equipment="${escapeAttr(ex.equipment || '')}">${escapeHtml(name)}</button>`;
                }).join('')}
            </div>
        </div>`
        : '';

    // Render grouped exercises
    grid.innerHTML = quickAddHTML + gymSuggestedHTML + sortedBodyParts
        .map((bodyPart) => {
            const exercises = grouped[bodyPart];
            const exerciseCards = exercises
                .map((exercise) => {
                    const exerciseName = exercise.name || exercise.machine;
                    return `<div class="library-exercise-card" data-exercise-id="${escapeAttr(exercise.id || exerciseName)}">
                <span class="library-exercise-name">${escapeHtml(exerciseName)}</span>
            </div>`;
                })
                .join('');

            return `
            <div class="library-group">
                <div class="library-group-header">${escapeHtml(bodyPart)}</div>
                <div class="library-group-items">${exerciseCards}</div>
            </div>
        `;
        })
        .join('');

    // Add click handlers
    grid.querySelectorAll('.library-exercise-card').forEach((card) => {
        card.addEventListener('click', () => {
            const exerciseId = card.dataset.exerciseId;
            const exercise = filteredExercises.find((ex) => (ex.id || ex.name || ex.machine) === exerciseId);
            if (exercise) selectExerciseFromLibrary(exercise);
        });
    });

    // Quick Add chip click handlers
    grid.querySelectorAll('.quick-add-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            const name = chip.dataset.exerciseName;
            const equipment = chip.dataset.equipment;
            const exercise = exerciseLibrary.find((ex) => (ex.name || ex.machine) === name) || { name, equipment };
            selectExerciseFromLibrary(exercise);
        });
    });
}

// Phase 9 cleanup: createLibraryExerciseCard was unused — renderExerciseLibrary
// builds rows inline.

// Pending exercise for equipment selection
let pendingExerciseForEquipment = null;

function selectExerciseFromLibrary(exercise) {
    // Swap mode: one-tap commit. The "Swap Exercise" action sets
    // replacingExerciseIndex — in that case, tapping an exercise should
    // replace immediately. Previously this fell through to the equipment
    // picker, which was easy to miss and made the swap feel broken.
    // Users can set equipment afterward via "Change Equipment".
    if (window.replacingExerciseIndex !== undefined && window.replacingExerciseIndex !== null) {
        if (window.confirmExerciseAddToWorkout) {
            window.confirmExerciseAddToWorkout(exercise);
        }
        const librarySection = document.getElementById('exercise-library-section');
        if (librarySection) librarySection.classList.add('hidden');
        window.addingToActiveWorkout = false;
        return;
    }

    // Check if we're adding to active workout
    if (window.addingToActiveWorkout && window.confirmExerciseAddToWorkout) {
        // For active workouts, pick equipment on the shared sheet (AP-13)
        pendingExerciseForEquipment = exercise;
        showEquipmentPicker(exercise);
        return;
    }

    // Phase 9 cleanup: the "add to template" branch used to live here, but
    // template editing now happens in the workout-selector via Phases 1-7.
    // selectExerciseFromLibrary is only reached during an active-workout
    // add/replace flow.
}

// Pick equipment for an exercise being added from the library to the active
// workout — the shared sheet (one door; AP-13 retired #equipment-picker-modal).
// '' from the sheet's "None" row adds it with no equipment.
async function showEquipmentPicker(exercise) {
    const { openSharedEquipmentSheet } = await import('./active-workout-ui.js');
    await openSharedEquipmentSheet({
        exerciseName: exercise.name || exercise.machine,
        currentEquipment: exercise.equipment || null,
        onSelect: (name) => finalizeExerciseAddition(name || null, name ? (getSessionLocation() || null) : null),
        onCancel: () => { pendingExerciseForEquipment = null; },
    });
}

// Finalize adding the exercise with equipment info
async function finalizeExerciseAddition(equipmentName, equipmentLocation, equipmentVideo = null) {
    if (!pendingExerciseForEquipment) return;

    const exercise = pendingExerciseForEquipment;
    const exerciseName = exercise.name || exercise.machine;

    // Save equipment if new (include video)
    if (equipmentName) {
        try {
            const workoutManager = new FirebaseWorkoutManager(AppState);
            const equipment = await workoutManager.getOrCreateEquipment(
                equipmentName,
                equipmentLocation,
                exerciseName,
                equipmentVideo
            );

            // Auto-associate equipment with current workout location (if set)
            if (equipment && window.getSessionLocation) {
                const currentWorkoutLocation = window.getSessionLocation();
                if (currentWorkoutLocation && equipment.id) {
                    await workoutManager.addLocationToEquipment(equipment.id, currentWorkoutLocation);
                }
            }
        } catch (error) {
            console.error('Error saving equipment:', error);
        }
    }

    // Handle active workout
    if (window.confirmExerciseAddToWorkout) {
        const exerciseWithEquipment = {
            ...exercise,
            equipment: equipmentName,
            equipmentLocation: equipmentLocation,
        };
        window.confirmExerciseAddToWorkout(exerciseWithEquipment);
        closeExerciseLibrary();
        pendingExerciseForEquipment = null;
        window.addingToActiveWorkout = false;
        // Silent success - exercise card appears immediately in workout
        return;
    }

    // Phase 9 cleanup: the "add to current template" branch used to live
    // here (mutated currentEditingTemplate). Templates are now edited
    // inline in the selector — finalizeExerciseAddition is reached only
    // from active-workout flows, which are handled above.
}

// Create Exercise functions - uses the add-exercise-modal
let creatingFromLibraryModal = false;

// Category definitions for chip row
const CREATE_EXERCISE_CATEGORIES = [
    { key: 'Push', css: 'cat-push', icon: 'fa-hand-paper' },
    { key: 'Pull', css: 'cat-pull', icon: 'fa-fist-raised' },
    { key: 'Legs', css: 'cat-legs', icon: 'fa-walking' },
    { key: 'Core', css: 'cat-core', icon: 'fa-bullseye' },
    { key: 'Cardio', css: 'cat-cardio', icon: 'fa-heartbeat' },
    { key: 'Arms', css: 'cat-arms', icon: 'fa-hand-rock' },
];

let _createExSelectedCategory = '';
let _createExSelectedEquipment = '';
let _createExMoreDetailsOpen = false;

// The Save buttons stay ENABLED at all times and createNewExercise reports
// what is missing. A disabled Save with no explanation reads as "this app
// won't let me save" — reported twice (7/14 and 8/20) as "appears to be no
// way to save a new exercise that I created". A hint line carries the
// requirement instead of the button going dead.
function updateCreateExerciseSaveState() {
    const name = document.getElementById('new-exercise-name')?.value.trim();
    const hint = document.getElementById('create-ex-hint');
    if (!hint) return;
    const missing = [];
    if (!name) missing.push('a name');
    if (!_createExSelectedCategory) missing.push('a category');
    hint.textContent = missing.length ? `Add ${missing.join(' and ')} to save` : '';
}

function selectCreateExCategory(key) {
    _createExSelectedCategory = key;
    document.querySelectorAll('#create-ex-chips .chip').forEach((chip) => {
        const isActive = chip.dataset.category === key;
        chip.classList.toggle('active', isActive);
    });
    updateCreateExerciseSaveState();
}

function adjustStepper(inputId, delta) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const min = parseInt(input.min) || 1;
    const max = parseInt(input.max) || 99;
    const current = parseInt(input.value) || 0;
    input.value = Math.max(min, Math.min(max, current + delta));
}

function toggleCreateExMoreDetails() {
    _createExMoreDetailsOpen = !_createExMoreDetailsOpen;
    const section = document.getElementById('create-ex-more-details');
    const toggle = document.getElementById('create-ex-more-toggle');
    if (section) section.classList.toggle('hidden', !_createExMoreDetailsOpen);
    if (toggle) {
        toggle.innerHTML = _createExMoreDetailsOpen
            ? '<i class="fas fa-chevron-up"></i> Less details'
            : '+ More details (notes, video URL)';
    }
}

/**
 * @param {{initialName?: string}} [opts] - B7: the name typed in a search
 *   that found nothing ("Create “Landmine press”") carries into the form.
 */
export function showCreateExerciseForm({ initialName = '' } = {}) {
    // Set flag so we know to refresh library modal after save
    creatingFromLibraryModal = true;

    // Reset state
    _createExSelectedCategory = '';
    _createExSelectedEquipment = '';
    _createExMoreDetailsOpen = false;

    const modal = document.getElementById('add-exercise-modal');
    const content = document.getElementById('add-exercise-modal-content');
    if (!content) return;

    // Build category chips
    const chipHtml = CREATE_EXERCISE_CATEGORIES.map(
        (cat) =>
            `<div class="chip ${cat.css}" data-category="${cat.key}" onclick="window._createExSelectCategory('${cat.key}')"><i class="fas ${cat.icon}"></i> ${cat.key}</div>`
    ).join('');

    content.innerHTML = `
        <div class="page-header">
            <div class="page-header__left">
                <button class="page-header__back" aria-label="Back" onclick="closeCreateExerciseModal()"><i class="fas fa-chevron-left"></i></button>
                <div class="page-header__title">New exercise</div>
            </div>
        </div>
        <div class="create-ex-form-body">
            <div class="field">
                <div class="field-label">Name</div>
                <input class="field-input" type="text" id="new-exercise-name" placeholder="e.g. Bulgarian Split Squat" oninput="window._createExUpdateSave()">
            </div>
            <div class="field">
                <div class="field-label">Category</div>
                <div class="chips" id="create-ex-chips">${chipHtml}</div>
            </div>
            <div class="field">
                <div class="field-label">Default sets &amp; reps</div>
                <div class="stepper-card">
                    <div class="stepper-row">
                        <div class="stepper-label">Sets</div>
                        <div class="stepper">
                            <button type="button" onclick="window._createExAdjustStepper('new-exercise-sets',-1)">\u2212</button>
                            <input type="number" id="new-exercise-sets" value="3" min="1" max="10" inputmode="numeric">
                            <button type="button" onclick="window._createExAdjustStepper('new-exercise-sets',1)">+</button>
                        </div>
                    </div>
                    <div class="stepper-row">
                        <div class="stepper-label">Reps</div>
                        <div class="stepper">
                            <button type="button" onclick="window._createExAdjustStepper('new-exercise-reps',-1)">\u2212</button>
                            <input type="number" id="new-exercise-reps" value="10" min="1" max="50" inputmode="numeric">
                            <button type="button" onclick="window._createExAdjustStepper('new-exercise-reps',1)">+</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="sec-head"><h3>Equipment</h3></div>
            <div id="create-ex-equipment-area">
                <div class="empty-state-card create-ex-equip-empty">
                    <div class="create-ex-equip-empty__icon"><i class="fas fa-cog"></i></div>
                    <div class="create-ex-equip-empty__title">Pick equipment</div>
                    <div class="create-ex-equip-empty__desc">Bodyweight, barbell, or pick a specific machine</div>
                    <button class="btn btn-primary btn-lg btn-block create-ex-equip-empty__btn" onclick="window._createExChooseEquipment()"><i class="fas fa-dumbbell"></i> Choose equipment</button>
                </div>
            </div>
            <button class="more-details-toggle" id="create-ex-more-toggle" type="button" onclick="window._createExToggleMore()">+ More details (notes, video URL)</button>
            <div id="create-ex-more-details" class="hidden">
                <div class="field">
                    <div class="field-label">Notes</div>
                    <textarea class="field-input" id="new-exercise-notes" rows="2" placeholder="Form cues, tips…"></textarea>
                </div>
                <div class="field">
                    <div class="field-label">Form video URL (optional)</div>
                    <input class="field-input" type="url" id="new-exercise-video" placeholder="YouTube or direct video link">
                </div>
            </div>
        </div>
        <div class="page-footer">
            <div class="create-ex-hint" id="create-ex-hint">Add a name and a category to save</div>
            <button class="btn btn-primary btn-lg btn-block" id="create-ex-footer-save" onclick="createNewExercise(event)"><i class="fas fa-check"></i> Save exercise</button>
        </div>
    `;

    // Expose helpers to window for onclick handlers
    window._createExSelectCategory = selectCreateExCategory;
    window._createExUpdateSave = updateCreateExerciseSaveState;
    window._createExAdjustStepper = adjustStepper;
    window._createExToggleMore = toggleCreateExMoreDetails;
    window._createExChooseEquipment = async () => {
        const { openSharedEquipmentSheet } = await import('./active-workout-ui.js');
        const exName = document.getElementById('new-exercise-name')?.value?.trim() || 'this exercise';

        // Native <dialog>.showModal() puts the create-exercise modal in the
        // top layer, which would render OVER any sheet appended to body.
        // Close the dialog before opening the sheet (form content stays in
        // the DOM, so user input is preserved), then reopen on close.
        const createModal = document.getElementById('add-exercise-modal');
        const reopenCreateModal = () => {
            if (createModal && createModal.tagName === 'DIALOG' && !createModal.open) {
                createModal.showModal();
            }
        };
        if (createModal && createModal.tagName === 'DIALOG' && createModal.open) {
            createModal.close();
        }

        openSharedEquipmentSheet({
            exerciseName: exName,
            currentEquipment: _createExSelectedEquipment || '',
            onSelect: (equipName) => {
                _createExSelectedEquipment = equipName || '';
                reopenCreateModal();
                renderCreateExEquipmentArea();
                updateCreateExerciseSaveState();
            },
            onCancel: () => {
                reopenCreateModal();
            },
        });
    };

    if (modal) {
        openModal(modal);
    }

    const nameInput = document.getElementById('new-exercise-name');
    if (nameInput && typeof initialName === 'string' && initialName) {
        nameInput.value = initialName;
        updateCreateExerciseSaveState();
    }

    // Focus name field after modal opens
    setTimeout(() => nameInput?.focus(), 100);
}

/**
 * Phase 5: render the "Equipment" area inside the Create Exercise form.
 * Two states:
 *   - selected: a pill-style row with a Change action
 *   - empty:    the original "Pick equipment" empty-state card
 * Called after the user picks something in the shared equipment sheet.
 */
function renderCreateExEquipmentArea() {
    const area = document.getElementById('create-ex-equipment-area');
    if (!area) return;
    if (_createExSelectedEquipment) {
        area.innerHTML = `
            <div class="te-row__equip" onclick="window._createExChooseEquipment()">
                <i class="fas fa-cog"></i>
                <span class="te-row__equip-name">${escapeHtml(_createExSelectedEquipment)}</span>
                <span class="te-row__equip-action">Change</span>
            </div>
        `;
    } else {
        area.innerHTML = `
            <div class="empty-state-card create-ex-equip-empty">
                <div class="create-ex-equip-empty__icon"><i class="fas fa-cog"></i></div>
                <div class="create-ex-equip-empty__title">Pick equipment</div>
                <div class="create-ex-equip-empty__desc">Bodyweight, barbell, or pick a specific machine</div>
                <button class="btn btn-primary btn-lg btn-block create-ex-equip-empty__btn" onclick="window._createExChooseEquipment()"><i class="fas fa-dumbbell"></i> Choose equipment</button>
            </div>
        `;
    }
}

export function closeCreateExerciseModal() {
    const modal = document.getElementById('add-exercise-modal');
    if (modal) {
        closeModal(modal);
    }
    _createExSelectedCategory = '';
    _createExSelectedEquipment = '';
    creatingFromLibraryModal = false;
}

export async function createNewExercise(event) {
    if (event) event.preventDefault();

    const name = document.getElementById('new-exercise-name')?.value.trim();
    const category = _createExSelectedCategory;
    const sets = parseInt(document.getElementById('new-exercise-sets')?.value) || 3;
    const reps = parseInt(document.getElementById('new-exercise-reps')?.value) || 10;
    const video = document.getElementById('new-exercise-video')?.value?.trim() || '';
    const notes = document.getElementById('new-exercise-notes')?.value?.trim() || '';

    if (!name) {
        showNotification('Add an exercise name', 'warning');
        return;
    }
    if (!category) {
        showNotification('Pick a category', 'warning');
        return;
    }

    // Map category to bodyPart for backward compatibility
    const categoryToBodyPart = {
        Push: 'Chest',
        Pull: 'Back',
        Legs: 'Legs',
        Core: 'Core',
        Cardio: 'Cardio',
        Arms: 'Arms',
    };
    const bodyPart = categoryToBodyPart[category] || category;
    const equipmentType = _createExSelectedEquipment || 'Bodyweight';

    const exerciseData = {
        name,
        machine: name,
        bodyPart,
        category,
        equipmentType,
        tags: [bodyPart.toLowerCase(), equipmentType.toLowerCase()],
        sets,
        reps,
        weight: 0,
        video,
        notes,
    };

    const success = await workoutManager.createExercise(exerciseData);

    if (success) {
        const modal = document.getElementById('add-exercise-modal');
        if (modal) {
            closeModal(modal);
        }

        // Refresh exercise library if it's open
        if (creatingFromLibraryModal) {
            const libraryModal = document.getElementById('exercise-library-section');
            if (libraryModal && (libraryModal.open || !libraryModal.classList.contains('hidden'))) {
                exerciseLibrary = await workoutManager.getExerciseLibrary();
                filteredExercises = [...exerciseLibrary];
                renderExerciseLibrary();
            }
        }

        creatingFromLibraryModal = false;
    }
}

export async function returnToWorkoutsFromManagement(appState) {
    // Phase 9: workout-management-section is gone, so there is no "management
    // UI" to hide. Just navigate to the selector.
    const hasActiveCustomTemplate = checkForActiveCustomTemplate(appState);
    await showWorkoutSelectorSafe(appState, hasActiveCustomTemplate);
}

// Helper function to detect active custom templates
function checkForActiveCustomTemplate(appState) {
    if (!appState.currentWorkout || !appState.savedData.workoutType) {
        return false;
    }

    // Check if current workoutType is NOT in default workout plans
    const isDefaultWorkout = appState.workoutPlans.some((plan) => plan.day === appState.savedData.workoutType);

    return !isDefaultWorkout; // If not default, it's likely a custom template
}

// Safe wrapper for showWorkoutSelector that respects navigation context
async function showWorkoutSelectorSafe(appState, fromNavigation = false) {
    // Only show warning popup if NOT from navigation and has real progress
    const shouldShowWarning =
        !fromNavigation && appState.hasWorkoutProgress() && appState.currentWorkout && appState.savedData.workoutType;

    if (shouldShowWarning) {
        const confirmChange = await confirmSheet({
            title: 'Leave your current workout?',
            message: "Your progress is saved — you can pick it back up anytime.",
            confirmLabel: 'Go to workouts',
            cancelLabel: 'Stay here',
        });
        if (!confirmChange) {
            // User chose to stay — bail out without changing pages.
            return;
        }

        // Save progress before switching
        saveWorkoutData(appState);
    }

    // Perform navigation
    navigateToWorkoutSelector(fromNavigation, appState);
}

// Clean navigation function
async function navigateToWorkoutSelector(fromNavigation, appState) {
    const workoutSelector = document.getElementById('workout-selector');
    const activeWorkout = document.getElementById('active-workout');
    const historySection = document.getElementById('workout-history-section');

    // Show/hide appropriate sections
    if (workoutSelector) workoutSelector.classList.remove('hidden');
    if (activeWorkout) activeWorkout.classList.add('hidden');
    if (historySection) historySection.classList.add('hidden');

    // Clear timers
    appState.clearTimers();

    // Preserve currentWorkout when returning from navigation
    if (!fromNavigation) {
        appState.currentWorkout = null;
    }

    // In-progress workout check removed - dashboard banner handles this now
}

// Phase 9 cleanup: checkForInProgressWorkout and showInProgressWorkoutPrompt
// were never called — the dashboard's resume-workout banner replaced this
// flow (see comment at navigateToWorkoutSelector).
