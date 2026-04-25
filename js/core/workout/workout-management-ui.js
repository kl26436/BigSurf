// Workout Management UI Functions
import { AppState } from '../utils/app-state.js';
import { getCategoryIcon } from '../utils/config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { showNotification, setHeaderMode, escapeHtml, escapeAttr, openModal, closeModal, convertWeight } from '../ui/ui-helpers.js';
import { saveWorkoutData } from '../data/data-manager.js';
import { formatCategory } from '../utils/workout-helpers.js';
import { reorderTemplateExercise, normalizeWorkoutToTemplate } from '../utils/template-helpers.js';
import { getSessionLocation, detectLocation } from '../features/location-service.js';
import { setBottomNavVisible } from '../ui/navigation.js';
import { groupExercises, ungroupExercise } from '../features/superset-manager.js';
import {
    getEquipmentAtLocation,
    getExercisesAtLocation,
    rankExercisesForLocation,
} from '../features/equipment-planner.js';

let workoutManager;
const currentEditingTemplate = null;
let exerciseLibrary = [];
let filteredExercises = [];
const allWorkoutTemplates = [];
const currentWorkoutCategory = '';

// Track which containers already have delegation listeners
const delegatedContainers = new WeakSet();

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
function normalizeExercisesToArray(exercises) {
    if (!exercises) return [];

    // If already an array, return as-is
    if (Array.isArray(exercises)) {
        return exercises;
    }

    // If it's an object (e.g., {exercise_0: {...}, exercise_1: {...}}), convert to array
    if (typeof exercises === 'object') {
        const keys = Object.keys(exercises).sort(); // Sort to maintain order
        return keys.map((key) => exercises[key]).filter((ex) => ex); // Filter out null/undefined
    }

    return [];
}

/**
 * Phase 9: convert a completed workout to a saved template, then drop the
 * user on the workout-selector with the new template's row pre-expanded so
 * they can rename it inline. Replaces the legacy showTemplateEditor flow.
 */
export async function saveWorkoutAsTemplate(workoutData) {
    const template = normalizeWorkoutToTemplate(workoutData);
    if (!template) {
        showNotification('Could not convert workout to template', 'error');
        return;
    }

    const defaultName = workoutData.workoutType || '';
    const name = (typeof prompt === 'function')
        ? prompt('Save as workout — name:', defaultName)
        : defaultName;
    if (!name || !name.trim()) return;

    const toSave = {
        name: name.trim(),
        category: template.category || 'other',
        exercises: template.exercises || [],
        suggestedDays: [],
        isCustom: true,
    };

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
 * Phase 9: create a new blank template and open it in the selector for
 * inline editing (rename + add exercises). Replaces the legacy
 * showTemplateEditor flow.
 */
export async function createNewTemplate() {
    const name = (typeof prompt === 'function') ? prompt('New workout name:', '') : '';
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
        alert('Cannot perform action: System not ready');
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

    const message = 'Delete this template? This cannot be undone.';

    if (confirm(message)) {
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
            alert(`Error deleting template. Please try again.`);
        }
    }
}

export async function resetToDefault(defaultTemplateId) {
    if (!workoutManager) {
        console.error('❌ Workout manager not initialized');
        alert('Cannot reset: System not ready');
        return;
    }

    if (confirm('Reset this template to default? Your changes will be lost.')) {
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
            alert('Error resetting template. Please try again.');
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

export async function openExerciseLibrary(mode = 'template') {
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
                <h3>No Exercises Found</h3>
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
            <div class="quick-add-label">Quick Add</div>
            <div class="quick-add-chips">
                ${recentExercises.map((ex) => `<button class="quick-add-chip" data-exercise-name="${escapeAttr(ex.name)}" data-equipment="${escapeAttr(ex.equipment)}">${escapeHtml(ex.name)}</button>`).join('')}
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
                    const chipClass = ex.usedBefore ? 'quick-add-chip quick-add-chip--used' : 'quick-add-chip';
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

function createLibraryExerciseCard(exercise) {
    const card = document.createElement('div');
    card.className = 'library-exercise-card';

    const exerciseName = exercise.name || exercise.machine;

    card.innerHTML = `
        <span class="library-exercise-name">${escapeHtml(exerciseName)}</span>
        <span class="library-exercise-body-part">${escapeHtml(exercise.bodyPart || 'General')}</span>
    `;

    card.addEventListener('click', () => selectExerciseFromLibrary(exercise));

    return card;
}

// Pending exercise for equipment selection
let pendingExerciseForEquipment = null;

function selectExerciseFromLibrary(exercise) {
    const exerciseName = exercise.name || exercise.machine;

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
        // For active workouts, show equipment picker
        pendingExerciseForEquipment = exercise;
        showEquipmentPicker(exercise, true);
        return;
    }

    // Add to current template (editing mode)
    if (currentEditingTemplate) {
        // Check for duplicate exercise names
        const isDuplicate = currentEditingTemplate.exercises.some(
            (ex) => ex.name === exerciseName || ex.machine === exerciseName
        );

        if (isDuplicate) {
            showNotification(`"${exerciseName}" is already in this workout`, 'warning');
            return;
        }

        // Show equipment picker before adding
        pendingExerciseForEquipment = exercise;
        showEquipmentPicker(exercise, false);
    }
}

// Show equipment picker modal
async function showEquipmentPicker(exercise, isActiveWorkout) {
    const exerciseName = exercise.name || exercise.machine;
    const modal = document.getElementById('equipment-picker-modal');

    const { populateEquipmentPicker } = await import('../ui/equipment-picker.js');
    await populateEquipmentPicker({
        exerciseName,
        currentEquipment: exercise.equipment || null,
        currentLocation: exercise.equipmentLocation || null,
        sessionLocation: isActiveWorkout ? getSessionLocation() : null,
    });

    // Store whether this is for active workout
    window.equipmentPickerForActiveWorkout = isActiveWorkout;

    if (modal) openModal(modal);
}

// Close equipment picker
export function closeEquipmentPicker() {
    const modal = document.getElementById('equipment-picker-modal');
    if (modal) closeModal(modal);
    pendingExerciseForEquipment = null;
    window.equipmentPickerForActiveWorkout = false;
    window.changingEquipmentDuringWorkout = false;
}

// Add equipment from picker (saves to list and auto-selects)
export async function addEquipmentFromPicker() {
    const nameInput = document.getElementById('equipment-picker-new-name');
    const locationInput = document.getElementById('equipment-picker-new-location');
    const videoInput = document.getElementById('equipment-picker-new-video');

    const equipmentName = nameInput?.value.trim();
    let locationName = locationInput?.value.trim();
    const videoUrl = videoInput?.value.trim();

    if (!equipmentName) {
        showNotification('Enter an equipment name', 'warning');
        nameInput?.focus();
        return;
    }

    // If no location specified and we're in an active workout, use session location
    if (!locationName && (window.equipmentPickerForActiveWorkout || window.changingEquipmentDuringWorkout)) {
        locationName = getSessionLocation() || '';
    }

    // Get the exercise name from pending exercise or current workout
    let exerciseName = null;
    if (pendingExerciseForEquipment) {
        exerciseName = pendingExerciseForEquipment.name || pendingExerciseForEquipment.machine;
    } else if (window.changingEquipmentDuringWorkout && AppState.currentWorkout) {
        // Get from focused exercise index during active workout equipment change
        const idx = AppState.focusedExerciseIndex;
        if (idx !== null && AppState.currentWorkout.exercises[idx]) {
            exerciseName = AppState.currentWorkout.exercises[idx].machine;
        }
    }

    // Fallback: parse exercise name from the modal title (shows "for "Exercise Name"")
    if (!exerciseName) {
        const titleEl = document.getElementById('equipment-picker-exercise-name');
        if (titleEl) {
            const match = titleEl.textContent.match(/for "(.+)"/);
            if (match) {
                exerciseName = match[1];
            }
        }
    }

    if (!exerciseName) {
        showNotification('No exercise selected', 'error');
        return;
    }

    try {
        const workoutManager = new FirebaseWorkoutManager(AppState);
        await workoutManager.getOrCreateEquipment(equipmentName, locationName, exerciseName, videoUrl);

        // Clear inputs
        if (nameInput) nameInput.value = '';
        if (locationInput) locationInput.value = '';
        if (videoInput) videoInput.value = '';

        // Refresh the equipment list
        const exerciseEquipment = await workoutManager.getEquipmentForExercise(exerciseName);
        const listEl = document.getElementById('equipment-picker-list');

        if (listEl && exerciseEquipment.length > 0) {
            listEl.innerHTML = exerciseEquipment
                .map(
                    (eq) => `
                <div class="equipment-option ${eq.name === equipmentName ? 'selected' : ''}"
                     data-equipment-id="${escapeAttr(eq.id)}"
                     data-equipment-name="${escapeAttr(eq.name)}"
                     data-equipment-location="${escapeAttr(eq.location || '')}">
                    <div class="equipment-option-radio"></div>
                    <div class="equipment-option-details">
                        <div class="equipment-option-name">${escapeHtml(eq.name)}</div>
                        ${eq.location ? `<div class="equipment-option-location">${escapeHtml(eq.location)}</div>` : ''}
                    </div>
                </div>
            `
                )
                .join('');

            // Re-add click handlers
            listEl.querySelectorAll('.equipment-option').forEach((option) => {
                option.addEventListener('click', () => {
                    listEl.querySelectorAll('.equipment-option').forEach((o) => o.classList.remove('selected'));
                    option.classList.add('selected');
                    if (nameInput) nameInput.value = '';
                    if (locationInput) locationInput.value = '';
                });
            });
        }

        // Silent success - equipment appears in list immediately
    } catch (error) {
        console.error('Error adding equipment:', error);
        showNotification('Error adding equipment', 'error');
    }
}

// Skip equipment selection (no equipment)
export function skipEquipmentSelection() {
    // Check if we're changing equipment during a workout
    if (window.changingEquipmentDuringWorkout && window.applyEquipmentChange) {
        window.applyEquipmentChange(null, null);
        closeEquipmentPicker();
        return;
    }
    finalizeExerciseAddition(null, null);
}

// Confirm equipment selection
export function confirmEquipmentSelection() {
    const listEl = document.getElementById('equipment-picker-list');
    const newNameInput = document.getElementById('equipment-picker-new-name');
    const newLocationInput = document.getElementById('equipment-picker-new-location');
    const newVideoInput = document.getElementById('equipment-picker-new-video');

    let equipmentName = null;
    let equipmentLocation = null;
    let equipmentVideo = null;

    // Check if existing equipment is selected
    const selectedOption = listEl?.querySelector('.equipment-option.selected');
    if (selectedOption) {
        equipmentName = selectedOption.dataset.equipmentName;
        equipmentLocation = selectedOption.dataset.equipmentLocation || null;
    }

    // Check if new equipment was entered
    const newName = newNameInput?.value.trim();
    const newLocation = newLocationInput?.value.trim();
    const newVideo = newVideoInput?.value.trim();
    if (newName) {
        equipmentName = newName;
        equipmentLocation = newLocation || null;
        equipmentVideo = newVideo || null;
    }

    // If no location and we're in an active workout, use session location
    if (!equipmentLocation && (window.equipmentPickerForActiveWorkout || window.changingEquipmentDuringWorkout)) {
        equipmentLocation = getSessionLocation() || null;
    }

    // Check if we're changing equipment during a workout
    if (window.changingEquipmentDuringWorkout && window.applyEquipmentChange) {
        window.applyEquipmentChange(equipmentName, equipmentLocation, equipmentVideo);
        closeEquipmentPicker();
        return;
    }

    finalizeExerciseAddition(equipmentName, equipmentLocation, equipmentVideo);
}

// Finalize adding the exercise with equipment info
async function finalizeExerciseAddition(equipmentName, equipmentLocation, equipmentVideo = null) {
    if (!pendingExerciseForEquipment) {
        closeEquipmentPicker();
        return;
    }

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
    if (window.equipmentPickerForActiveWorkout && window.confirmExerciseAddToWorkout) {
        const exerciseWithEquipment = {
            ...exercise,
            equipment: equipmentName,
            equipmentLocation: equipmentLocation,
        };
        window.confirmExerciseAddToWorkout(exerciseWithEquipment);
        closeExerciseLibrary();
        closeEquipmentPicker();
        window.addingToActiveWorkout = false;
        // Silent success - exercise card appears immediately in workout
        return;
    }

    // Handle template editing
    if (currentEditingTemplate) {
        const templateExercise = {
            name: exerciseName,
            machine: exercise.machine || exercise.name,
            bodyPart: exercise.bodyPart,
            equipmentType: exercise.equipmentType,
            equipment: equipmentName,
            equipmentLocation: equipmentLocation,
            sets: exercise.sets || 3,
            reps: exercise.reps || 10,
            weight: exercise.weight || 50,
            video: exercise.video || '',
        };

        currentEditingTemplate.exercises.push(templateExercise);
        // Phase 9: the legacy template-editor's renderTemplateExercises is gone.
        // The workout-selector renders templates via template-selection.js;
        // re-rendering it here keeps the in-memory state in sync if the user
        // is on the selector page.
        if (typeof window.renderWorkoutSelectorUI === 'function') {
            window.renderWorkoutSelectorUI();
        }
        closeExerciseLibrary();
        closeEquipmentPicker();
    }
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

function updateCreateExerciseSaveState() {
    const name = document.getElementById('new-exercise-name')?.value.trim();
    const headerSave = document.getElementById('create-ex-header-save');
    const footerSave = document.getElementById('create-ex-footer-save');
    const canSave = !!(name && _createExSelectedCategory);
    if (headerSave) headerSave.disabled = !canSave;
    if (footerSave) footerSave.disabled = !canSave;
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

export function showCreateExerciseForm() {
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
                <div class="page-header__title">New Exercise</div>
            </div>
            <button class="page-header__save" id="create-ex-header-save" disabled onclick="createNewExercise(event)">Save</button>
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
                    <button class="btn-redesign create-ex-equip-empty__btn" onclick="window._createExChooseEquipment()"><i class="fas fa-dumbbell"></i> Choose equipment</button>
                </div>
            </div>
            <button class="more-details-toggle" id="create-ex-more-toggle" type="button" onclick="window._createExToggleMore()">+ More details (notes, video URL)</button>
            <div id="create-ex-more-details" class="hidden">
                <div class="field">
                    <div class="field-label">Notes</div>
                    <textarea class="field-input" id="new-exercise-notes" rows="2" placeholder="Form cues, tips..."></textarea>
                </div>
                <div class="field">
                    <div class="field-label">Form video URL (optional)</div>
                    <input class="field-input" type="url" id="new-exercise-video" placeholder="YouTube or direct video link">
                </div>
            </div>
        </div>
        <div class="page-footer">
            <button class="btn-redesign" id="create-ex-footer-save" disabled onclick="createNewExercise(event)"><i class="fas fa-check"></i> Save Exercise</button>
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

    // Focus name field after modal opens
    setTimeout(() => document.getElementById('new-exercise-name')?.focus(), 100);
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
                <button class="btn-redesign create-ex-equip-empty__btn" onclick="window._createExChooseEquipment()"><i class="fas fa-dumbbell"></i> Choose equipment</button>
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
        showNotification('Please enter an exercise name', 'warning');
        return;
    }
    if (!category) {
        showNotification('Please select a category', 'warning');
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

export function returnToWorkoutsFromManagement(appState) {
    // Phase 9: workout-management-section is gone, so there is no "management
    // UI" to hide. Just navigate to the selector.
    const hasActiveCustomTemplate = checkForActiveCustomTemplate(appState);
    showWorkoutSelectorSafe(appState, hasActiveCustomTemplate);
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
function showWorkoutSelectorSafe(appState, fromNavigation = false) {
    // Only show warning popup if NOT from navigation and has real progress
    const shouldShowWarning =
        !fromNavigation && appState.hasWorkoutProgress() && appState.currentWorkout && appState.savedData.workoutType;

    if (shouldShowWarning) {
        const confirmChange = confirm(
            'You have progress on your current workout. Changing will save your progress but return you to workout selection. Continue?'
        );
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
    const workoutManagement = document.getElementById('workout-management');
    const historySection = document.getElementById('workout-history-section');
    const templateEditor = document.getElementById('template-editor-section');

    // Show/hide appropriate sections
    if (workoutSelector) workoutSelector.classList.remove('hidden');
    if (activeWorkout) activeWorkout.classList.add('hidden');
    if (workoutManagement) workoutManagement.classList.add('hidden');
    if (historySection) historySection.classList.add('hidden');
    if (templateEditor) templateEditor.classList.add('hidden');

    // Clear timers
    appState.clearTimers();

    // Preserve currentWorkout when returning from navigation
    if (!fromNavigation) {
        appState.currentWorkout = null;
    }

    // In-progress workout check removed - dashboard banner handles this now
}

async function checkForInProgressWorkout(appState) {
    // Skip if already showing prompt
    if (window.showingProgressPrompt) return;

    try {
        const { loadTodaysWorkout } = await import('../data/data-manager.js');
        const todaysData = await loadTodaysWorkout(appState);

        // Check if there's an incomplete workout from today
        if (todaysData && !todaysData.completedAt && !todaysData.cancelledAt) {
            // Validate workout plan exists
            const workoutPlan = appState.workoutPlans.find(
                (plan) =>
                    plan.day === todaysData.workoutType ||
                    plan.name === todaysData.workoutType ||
                    plan.id === todaysData.workoutType
            );

            if (!workoutPlan) {
                console.warn('⚠️ Workout plan not found for:', todaysData.workoutType);
                return;
            }

            // Store in-progress workout globally
            // Use todaysData.originalWorkout if it exists (contains modified exercise list)
            window.inProgressWorkout = {
                ...todaysData,
                originalWorkout: todaysData.originalWorkout || workoutPlan,
            };

            // Show the prompt (uses your existing continueInProgressWorkout function)
            showInProgressWorkoutPrompt(todaysData);
        } else {
        }
    } catch (error) {
        console.error('❌ Error checking for in-progress workout:', error);
    }
}

/**
 * Prompt user to continue or discard in-progress workout
 * Uses your existing continueInProgressWorkout() and discardInProgressWorkout() functions
 */
function showInProgressWorkoutPrompt(workoutData) {
    if (window.showingProgressPrompt) return;
    window.showingProgressPrompt = true;

    const workoutDate = new Date(workoutData.date).toLocaleDateString();
    const message = `You have an in-progress "${workoutData.workoutType}" workout from ${workoutDate}.\n\nWould you like to continue where you left off?`;

    setTimeout(() => {
        if (confirm(message)) {
            // Use your existing continue function
            import('./workout-core.js').then((module) => {
                module.continueInProgressWorkout();
            });
        } else {
            // Use your existing discard function
            import('./workout-core.js').then((module) => {
                module.discardInProgressWorkout();
            });
        }
        window.showingProgressPrompt = false;
    }, 500);
}
