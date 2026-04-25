// Exercise Manager UI Module
// Handles the integrated exercise manager modal

import { AppState } from '../utils/app-state.js';
import { showNotification, setHeaderMode, escapeHtml, escapeAttr, openModal, closeModal } from './ui-helpers.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { countReassignmentImpact, reassignEquipment } from '../data/data-manager.js';
import { setBottomNavVisible } from './navigation.js';
import { getExerciseName, formatBodyPart } from '../utils/workout-helpers.js';

let allExercises = [];
let filteredExercises = [];
let currentEditingExercise = null;
let workoutManager = null;
let selectedEquipmentId = null;
let selectedEquipmentData = null;
let editingEquipmentData = null; // For equipment editor modal
let editingEquipmentLocations = []; // Locations being edited
let currentBodyPartFilter = ''; // Current body part category selected
let currentEquipmentFilter = ''; // Current equipment filter
let exerciseGridDelegationSetup = false;
let exerciseUsageCounts = null; // Cache: exercise name → usage count

// Edit-section chip state (Phase F §1 rewrite — replaces <select> dropdowns)
let selectedBodyPart = 'Chest';
let selectedEquipmentType = 'Machine';

const BODY_PARTS = [
    { value: 'Chest',     chipClass: 'cat-push' },
    { value: 'Back',      chipClass: 'cat-pull' },
    { value: 'Legs',      chipClass: 'cat-legs' },
    { value: 'Shoulders', chipClass: 'cat-shoulders' },
    { value: 'Arms',      chipClass: 'cat-arms' },
    { value: 'Core',      chipClass: 'cat-core' },
    { value: 'Calves',    chipClass: 'cat-legs' },
    { value: 'Abs',       chipClass: 'cat-core' },
];

const EQUIPMENT_TYPES = ['Machine', 'Cable', 'Dumbbell', 'Barbell', 'Bodyweight'];

// Equipment type to icon mapping
const equipmentIcons = {
    Barbell: 'fa-dumbbell',
    Dumbbell: 'fa-dumbbell',
    Machine: 'fa-cogs',
    Cable: 'fa-link',
    Bodyweight: 'fa-person',
    default: 'fa-dumbbell',
};

// Get icon class for equipment type
function getEquipmentIcon(equipmentType) {
    return equipmentIcons[equipmentType] || equipmentIcons['default'];
}

// Open exercise manager section
export function openExerciseManager() {
    const section = document.getElementById('exercise-manager-section');
    if (section) {
        // Hide all other sections
        const sections = [
            'dashboard',
            'workout-selector',
            'active-workout',
            'workout-history-section',
            'muscle-group-detail-section',
            'exercise-detail-section',
            'composition-detail-section',
            'workout-management-section',
            'location-management-section',
        ];
        sections.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        section.classList.remove('hidden');

        // Hide header but keep bottom nav for consistency
        setHeaderMode(false);

        // Keep bottom nav visible for consistency
        setBottomNavVisible(true);

        // Setup event delegation on the grid (once)
        if (!exerciseGridDelegationSetup) {
            const grid = document.getElementById('exercise-manager-grid');
            if (grid) {
                grid.addEventListener('click', (e) => {
                    // Check for edit button first (nested inside card)
                    const editEl = e.target.closest('[data-action="editExercise"]');
                    if (editEl) {
                        e.stopPropagation();
                        editExercise(editEl.dataset.exerciseId);
                        return;
                    }
                    const deleteEl = e.target.closest('[data-action="deleteExercise"]');
                    if (deleteEl) {
                        e.stopPropagation();
                        deleteExercise(deleteEl.dataset.exerciseId);
                        return;
                    }
                    const cardEl = e.target.closest('[data-action="exerciseCardClick"]');
                    if (cardEl) {
                        handleExerciseCardClick(cardEl.dataset.exerciseId);
                    }
                });
                exerciseGridDelegationSetup = true;
            }
        }

        // Show category view by default
        showCategoryView();
        loadExercises();
    }
}

// Show category grid view (entry page)
export function showCategoryView() {
    const categoryView = document.getElementById('exercise-category-view');
    const listView = document.getElementById('exercise-list-view');

    if (categoryView) categoryView.classList.remove('hidden');
    if (listView) listView.classList.add('hidden');

    // Reset filters
    currentBodyPartFilter = '';
    currentEquipmentFilter = '';

    // Clear search
    const searchInput = document.getElementById('exercise-search-input');
    if (searchInput) searchInput.value = '';
}

// Select a body part category and show exercise list
export function selectBodyPartCategory(bodyPart) {
    currentBodyPartFilter = bodyPart;
    currentEquipmentFilter = '';

    // Update title
    const title = document.getElementById('exercise-list-title');
    if (title) {
        title.textContent = bodyPart ? `${formatBodyPart(bodyPart)} Exercises` : 'All Exercises';
    }

    // Reset equipment filter pills
    const pills = document.querySelectorAll('.filter-pill');
    pills.forEach((pill) => {
        pill.classList.toggle('active', pill.dataset.equipment === '');
    });

    // Show list view
    const categoryView = document.getElementById('exercise-category-view');
    const listView = document.getElementById('exercise-list-view');

    if (categoryView) categoryView.classList.add('hidden');
    if (listView) listView.classList.remove('hidden');

    // Filter and render exercises
    filterAndRenderExercises();
}

// Filter by equipment type (from pills)
export function filterByEquipment(equipmentType) {
    currentEquipmentFilter = equipmentType;

    // Update pill active states
    const pills = document.querySelectorAll('.filter-pill');
    pills.forEach((pill) => {
        pill.classList.toggle('active', pill.dataset.equipment === equipmentType);
    });

    filterAndRenderExercises();
}

// Handle search from category view (shows all matching exercises)
export function handleExerciseSearch() {
    const searchInput = document.getElementById('exercise-search-input');
    const searchTerm = searchInput?.value.trim();

    if (searchTerm && searchTerm.length >= 2) {
        // Switch to list view with search results
        currentBodyPartFilter = '';
        currentEquipmentFilter = '';

        const title = document.getElementById('exercise-list-title');
        if (title) title.textContent = 'Search Results';

        const categoryView = document.getElementById('exercise-category-view');
        const listView = document.getElementById('exercise-list-view');

        if (categoryView) categoryView.classList.add('hidden');
        if (listView) listView.classList.remove('hidden');

        // Show the list view search bar and copy search term
        const listSearchDiv = document.getElementById('exercise-list-search');
        const listSearchInput = document.getElementById('exercise-list-search-input');
        if (listSearchDiv) listSearchDiv.classList.remove('hidden');
        if (listSearchInput) {
            listSearchInput.value = searchTerm;
            listSearchInput.focus();
        }

        filterAndRenderExercises(searchTerm);
    }
}

// Toggle search bar in list view
export function toggleExerciseListSearch() {
    const searchDiv = document.getElementById('exercise-list-search');
    const searchInput = document.getElementById('exercise-list-search-input');

    if (searchDiv) {
        searchDiv.classList.toggle('hidden');
        if (!searchDiv.classList.contains('hidden') && searchInput) {
            searchInput.focus();
        }
    }
}

// Filter and render exercises based on current filters
function filterAndRenderExercises(searchTerm = '') {
    // Get search term from list view search if not provided
    if (!searchTerm) {
        const listSearchInput = document.getElementById('exercise-list-search-input');
        searchTerm = listSearchInput?.value.toLowerCase() || '';
    } else {
        searchTerm = searchTerm.toLowerCase();
    }

    filteredExercises = allExercises.filter((exercise) => {
        const matchesSearch =
            !searchTerm ||
            exercise.name.toLowerCase().includes(searchTerm) ||
            exercise.bodyPart.toLowerCase().includes(searchTerm) ||
            exercise.equipmentType.toLowerCase().includes(searchTerm);

        // Handle body part filter - check for Biceps/Triceps mapping to Arms
        let matchesBodyPart = !currentBodyPartFilter;
        if (currentBodyPartFilter) {
            if (currentBodyPartFilter === 'Biceps' || currentBodyPartFilter === 'Triceps') {
                // Check if exercise body part matches directly or is "Arms"
                matchesBodyPart =
                    exercise.bodyPart === currentBodyPartFilter ||
                    (exercise.bodyPart === 'Arms' &&
                        exercise.name.toLowerCase().includes(currentBodyPartFilter.toLowerCase()));
            } else if (currentBodyPartFilter === 'Arms') {
                matchesBodyPart =
                    exercise.bodyPart === 'Arms' || exercise.bodyPart === 'Biceps' || exercise.bodyPart === 'Triceps';
            } else {
                matchesBodyPart = exercise.bodyPart === currentBodyPartFilter;
            }
        }

        const matchesEquipment = !currentEquipmentFilter || exercise.equipmentType === currentEquipmentFilter;

        return matchesSearch && matchesBodyPart && matchesEquipment;
    });

    renderExercises();
}

// Close exercise manager section
export function closeExerciseManager() {
    const section = document.getElementById('exercise-manager-section');
    if (section) {
        section.classList.add('hidden');
    }

    // Check if we came from active workout
    if (window.editingFromActiveWorkout) {
        // Return to active workout
        const activeWorkout = document.getElementById('active-workout');
        if (activeWorkout) {
            activeWorkout.classList.remove('hidden');
        }
        // Show bottom nav again
        setBottomNavVisible(true);
        // Clear the flag
        window.editingFromActiveWorkout = false;
    } else {
        // Show dashboard (normal behavior from exercise library)
        const dashboard = document.getElementById('dashboard');
        if (dashboard) {
            dashboard.classList.remove('hidden');
        }
        setBottomNavVisible(true);
    }
}

// Build exercise usage cache from workout history
async function buildUsageCache() {
    if (exerciseUsageCounts) return; // Already built
    exerciseUsageCounts = {};
    try {
        if (!workoutManager) workoutManager = new FirebaseWorkoutManager(AppState);
        const workouts = await workoutManager.getUserWorkouts();
        workouts.forEach(w => {
            if (w.exercises) {
                Object.values(w.exercises).forEach(ex => {
                    const name = ex.name || '';
                    if (name) exerciseUsageCounts[name] = (exerciseUsageCounts[name] || 0) + 1;
                });
            }
        });
    } catch {
        // Silently fail — usage counts are cosmetic
    }
}

// Load exercises from AppState
async function loadExercises() {
    // Initialize workout manager if needed
    if (!workoutManager) {
        workoutManager = new FirebaseWorkoutManager(AppState);
    }

    // Build usage cache in parallel (non-blocking)
    buildUsageCache();

    if (!AppState.exerciseDatabase || AppState.exerciseDatabase.length === 0) {
        allExercises = [];
        filteredExercises = [];
        renderExercises();
        return;
    }

    allExercises = AppState.exerciseDatabase.map((exercise) => ({
        id: exercise.id || `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: getExerciseName(exercise),
        machine: exercise.machine || exercise.name,
        bodyPart: exercise.bodyPart || 'General',
        equipmentType: exercise.equipmentType || exercise.equipment || 'Machine',
        sets: exercise.sets || 3,
        reps: exercise.reps || 10,
        weight: exercise.weight || 50,
        video: exercise.video || '',
        equipment: exercise.equipment || null,
        equipmentLocation: exercise.equipmentLocation || null,
        isCustom: exercise.isCustom || false,
        isDefault: exercise.isDefault || false,
        isOverride: exercise.isOverride || false,
    }));

    filteredExercises = [...allExercises];
    renderExercises();
}

// Render exercises to grid (new card design)
function renderExercises() {
    const grid = document.getElementById('exercise-manager-grid');
    if (!grid) return;

    if (filteredExercises.length === 0) {
        grid.innerHTML = `
            <div class="exercise-empty-state">
                <i class="fas fa-dumbbell"></i>
                <p>No exercises found</p>
                <button class="btn-add-exercise" onclick="showAddExerciseModal()">
                    <i class="fas fa-plus"></i> Add Exercise
                </button>
            </div>
        `;
        return;
    }

    // Sort by relevance: favorites first, then usage count, then alphabetical
    const isFav = (name) => window.exerciseLibrary?.isFavorite?.(name) ? 1 : 0;
    const sortedExercises = [...filteredExercises].sort((a, b) => {
        const aFav = isFav(a.name);
        const bFav = isFav(b.name);
        if (aFav !== bFav) return bFav - aFav;

        const aCount = exerciseUsageCounts?.[a.name] || 0;
        const bCount = exerciseUsageCounts?.[b.name] || 0;
        if (aCount !== bCount) return bCount - aCount;

        return a.name.localeCompare(b.name);
    });

    // Render exercise cards (flat list, no grouping in list view)
    grid.innerHTML = sortedExercises
        .map((exercise) => {
            const iconClass = getEquipmentIcon(exercise.equipmentType);
            const eid = escapeAttr(exercise.id);
            const usageCount = exerciseUsageCounts?.[exercise.name] || 0;
            const usageBadge = usageCount > 0
                ? `<span class="exercise-usage-badge">&times;${usageCount}</span>`
                : '';

            return `
            <div class="exercise-card-new" data-action="exerciseCardClick" data-exercise-id="${eid}">
                <div class="exercise-card-icon">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="exercise-card-info">
                    <span class="exercise-card-name">${escapeHtml(exercise.name)}</span>
                    <span class="exercise-card-meta">${escapeHtml(exercise.bodyPart)}${exercise.equipmentType ? ' · ' + escapeHtml(exercise.equipmentType) : ''}</span>
                </div>
                ${usageBadge}
                <button class="exercise-card-edit" data-action="editExercise" data-exercise-id="${eid}" title="Edit">
                    EDIT
                </button>
            </div>
        `;
        })
        .join('');
}

// Handle exercise card click (for adding to workout)
export function handleExerciseCardClick(exerciseId) {
    const exercise = allExercises.find((e) => e.id === exerciseId);
    if (!exercise) return;

    // Check if we're in "add to workout" context
    if (window.selectExerciseCallback) {
        // Call the callback with the exercise
        window.selectExerciseCallback(exercise);
    } else {
        // Default behavior: open edit
        editExercise(exerciseId);
    }
}

function getDeleteButton(exercise) {
    const eid = escapeAttr(exercise.id);
    if (exercise.isOverride) {
        return `<button class="btn-icon btn-icon-warning" data-action="deleteExercise" data-exercise-id="${eid}" title="Revert to default">
            <i class="fas fa-undo"></i>
        </button>`;
    } else if (exercise.isCustom) {
        return `<button class="btn-icon btn-icon-danger" data-action="deleteExercise" data-exercise-id="${eid}" title="Delete exercise">
            <i class="fas fa-trash"></i>
        </button>`;
    } else {
        return `<button class="btn-icon" data-action="deleteExercise" data-exercise-id="${eid}" title="Hide exercise">
            <i class="fas fa-eye-slash"></i>
        </button>`;
    }
}

// Toggle exercise group visibility
export function toggleExerciseGroup(groupId) {
    const group = document.getElementById(groupId);
    const header = group?.previousElementSibling;

    if (group && header) {
        group.classList.toggle('collapsed');
        const icon = header.querySelector('.group-toggle-icon');
        if (icon) {
            icon.style.transform = group.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    }
}

// Filter exercises - used by both category view search and list view search
export function filterExerciseLibrary() {
    // Check list view search input first (used when in list view)
    const listSearchInput = document.getElementById('exercise-list-search-input');
    // Then check category view search input (used when in category view)
    const categorySearchInput = document.getElementById('exercise-search-input');

    // Use list view search if it has a value, otherwise use category search
    const searchTerm = (listSearchInput?.value || categorySearchInput?.value || '').toLowerCase();

    filterAndRenderExercises(searchTerm);
}

// Clear filters
export function clearExerciseFilters() {
    const searchInput = document.getElementById('exercise-search-input');
    const bodyPartFilter = document.getElementById('exercise-body-part-filter');
    const equipmentFilter = document.getElementById('exercise-equipment-filter');

    if (searchInput) searchInput.value = '';
    if (bodyPartFilter) bodyPartFilter.value = '';
    if (equipmentFilter) equipmentFilter.value = '';

    filteredExercises = [...allExercises];
    renderExercises();
}

// Refresh exercise library
export async function refreshExerciseLibrary() {
    // Initialize workout manager if needed
    if (!workoutManager) {
        workoutManager = new FirebaseWorkoutManager(AppState);
    }

    // Reload from Firebase
    AppState.exerciseDatabase = await workoutManager.getExerciseLibrary();
    await loadExercises();
}

// Show add exercise section (full screen)
export function showAddExerciseModal() {
    currentEditingExercise = null;
    openEditExerciseSection(null);
}

// Open the edit exercise section (full screen, Phase F §1 spec-aligned)
export function openEditExerciseSection(exercise) {
    const section = document.getElementById('edit-exercise-section');
    if (!section) return;

    // Clear any previous selection state first
    selectedEquipmentId = null;
    selectedEquipmentData = null;

    // Hide all other sections
    const sections = [
        'dashboard',
        'workout-selector',
        'active-workout',
        'workout-history-section',
        'muscle-group-detail-section',
        'exercise-detail-section',
        'composition-detail-section',
        'workout-management-section',
        'exercise-manager-section',
    ];
    sections.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Also hide template editor modal if open (we'll show it again when returning)
    const templateModal = document.getElementById('template-editor-section');
    if (templateModal) closeModal(templateModal);

    // Resolve title + initial field values (null `exercise` = create mode)
    const isEdit = !!exercise;
    currentEditingExercise = isEdit ? exercise : null;

    let title = 'New Exercise';
    if (isEdit) {
        if (exercise.isTemplateExercise) title = 'Edit Workout Exercise';
        else if (exercise.isOverride) title = 'Edit Your Version';
        else if (exercise.isDefault) title = 'Customize Exercise';
        else title = 'Edit Exercise';
    }

    const initial = {
        name: exercise?.name || '',
        bodyPart: exercise?.bodyPart || 'Chest',
        equipmentType: exercise?.equipmentType || 'Machine',
        sets: exercise?.sets ?? 3,
        reps: exercise?.reps ?? 10,
        weight: exercise?.weight ?? 50,
        notes: exercise?.notes || '',
        video: exercise?.video || '',
        equipmentVideo: exercise?.equipmentVideo || '',
    };
    selectedBodyPart = initial.bodyPart;
    selectedEquipmentType = initial.equipmentType;

    const showDelete = isEdit && !exercise.isTemplateExercise;

    section.innerHTML = renderEditExerciseMarkup(title, initial, showDelete);

    // Show the edit section
    section.classList.remove('hidden');

    // Wire name-input validity listener
    const nameInput = document.getElementById('edit-exercise-name');
    if (nameInput) {
        nameInput.addEventListener('input', updateEditExerciseValidity);
    }

    // Initial save-button state
    updateEditExerciseValidity();

    // Populate equipment list for THIS exercise (will pre-select if exercise has equipment)
    const exerciseName = isEdit && getExerciseName(exercise) ? getExerciseName(exercise) : null;
    populateEquipmentListForSection(exerciseName, exercise?.equipment, exercise?.equipmentLocation);

    // Focus name field for new-exercise flow
    if (!isEdit) nameInput?.focus();
}

function renderEditExerciseMarkup(title, v, showDelete) {
    const bpChips = BODY_PARTS.map(b => `
                    <div class="chip ${b.chipClass}${selectedBodyPart === b.value ? ' active' : ''}"
                         data-bp="${escapeAttr(b.value)}"
                         onclick="setExerciseBodyPart('${escapeAttr(b.value)}')">${escapeHtml(b.value)}</div>`).join('');

    const eqChips = EQUIPMENT_TYPES.map(t => `
                    <div class="chip${selectedEquipmentType === t ? ' active' : ''}"
                         data-eqtype="${escapeAttr(t)}"
                         onclick="setExerciseEquipmentType('${escapeAttr(t)}')"><i class="fas ${getEquipmentIcon(t)}"></i> ${escapeHtml(t)}</div>`).join('');

    return `
        <div class="page-header">
            <div class="page-header__left">
                <button class="page-header__back" aria-label="Go back" onclick="closeEditExerciseSection()">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">${escapeHtml(title)}</div>
            </div>
            <button id="edit-ex-save-header" class="page-header__save" onclick="saveExerciseFromSection()" disabled>Save</button>
        </div>

        <div class="content-section-body edit-exercise-body">
            <div class="field">
                <div class="field-label">Name</div>
                <input id="edit-exercise-name" class="field-input" type="text" required
                       placeholder="e.g., Bench Press" value="${escapeAttr(v.name)}">
            </div>

            <div class="field">
                <div class="field-label">Body part</div>
                <div class="chips" id="edit-ex-bp-row">${bpChips}
                </div>
            </div>

            <div class="field">
                <div class="field-label">Equipment type</div>
                <div class="chips" id="edit-ex-eqtype-row">${eqChips}
                </div>
            </div>

            <div class="field">
                <div class="field-label">Default sets &amp; reps</div>
                <div class="stepper-card">
                    <div class="stepper-row">
                        <div class="stepper-label">Sets</div>
                        <div class="stepper" data-field="edit-exercise-sets">
                            <button type="button" onclick="adjustExerciseStepper('edit-exercise-sets', -1, 1, 10)">−</button>
                            <input id="edit-exercise-sets" type="number" inputmode="numeric" min="1" max="10" value="${v.sets}">
                            <button type="button" onclick="adjustExerciseStepper('edit-exercise-sets', 1, 1, 10)">+</button>
                        </div>
                    </div>
                    <div class="stepper-row">
                        <div class="stepper-label">Reps</div>
                        <div class="stepper" data-field="edit-exercise-reps">
                            <button type="button" onclick="adjustExerciseStepper('edit-exercise-reps', -1, 1, 50)">−</button>
                            <input id="edit-exercise-reps" type="number" inputmode="numeric" min="1" max="50" value="${v.reps}">
                            <button type="button" onclick="adjustExerciseStepper('edit-exercise-reps', 1, 1, 50)">+</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="field">
                <div class="field-label">Starting weight <span class="field-label__hint">(lbs)</span></div>
                <input id="edit-exercise-weight" class="field-input" type="number"
                       inputmode="decimal" min="0" max="1000" value="${v.weight}">
            </div>

            <div class="sec-head sec-head--toggle" onclick="toggleEditExerciseMore()" id="edit-ex-more-head">
                <h3>More details</h3>
                <i class="fas fa-chevron-down sec-head__chev"></i>
            </div>
            <div class="edit-ex-more hidden" id="edit-ex-more">
                <div class="field">
                    <div class="field-label">Notes</div>
                    <textarea id="edit-exercise-notes" class="field-input"
                              placeholder="Form cues, range of motion, etc.">${escapeHtml(v.notes)}</textarea>
                </div>
                <div class="field">
                    <div class="field-label">Form video URL <span class="field-label__hint">(optional)</span></div>
                    <input id="edit-exercise-video" class="field-input" type="url"
                           placeholder="https://youtube.com/watch?v=..." value="${escapeAttr(v.video)}">
                </div>
            </div>

            <div class="sec-head"><h3>Your equipment <span class="count">(optional)</span></h3></div>
            <div class="field-helper">Equipment you use for this specific exercise.</div>

            <div id="edit-selected-equipment" class="edit-selected-equipment hidden">
                <i class="fas fa-check-circle"></i>
                <span id="edit-selected-equipment-text"></span>
                <button type="button" class="btn-clear" onclick="clearSelectedEquipment()" aria-label="Clear selection">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <h4 class="edit-subsection-title">Saved for this exercise</h4>
            <div id="edit-equipment-list" class="edit-equipment-list">
                <div class="edit-equipment-empty">No equipment saved for this exercise</div>
            </div>

            <h4 class="edit-subsection-title">Add new equipment</h4>
            <div class="edit-equipment-form">
                <div class="field">
                    <input id="edit-equipment-name" class="field-input" type="text"
                           placeholder="Equipment name (e.g., Life Fitness Chest Press)">
                </div>
                <div class="field">
                    <input id="edit-equipment-location" class="field-input" type="text"
                           placeholder="Location/Gym (e.g., LA Fitness Downtown)"
                           list="edit-equipment-location-list">
                    <datalist id="edit-equipment-location-list"></datalist>
                </div>
                <div class="field">
                    <input id="edit-equipment-video" class="field-input" type="url"
                           placeholder="Video URL (optional)">
                </div>
                <button type="button" class="btn-add-equipment" onclick="addEquipmentToList()">
                    <i class="fas fa-plus"></i> Add Equipment
                </button>
            </div>

            <div id="delete-exercise-container" class="danger-action-row ${showDelete ? '' : 'hidden'}">
                <button type="button" class="danger-action-btn" onclick="deleteExerciseFromSection()">
                    <i class="fas fa-trash"></i> Delete exercise
                </button>
            </div>
        </div>

        <div class="page-footer">
            <button type="button" id="edit-ex-save-footer" class="btn-primary" onclick="saveExerciseFromSection()" disabled>
                <i class="fas fa-check"></i> Save Exercise
            </button>
        </div>
    `;
}

// Close the edit exercise section
export function closeEditExerciseSection() {
    const section = document.getElementById('edit-exercise-section');
    if (section) section.classList.add('hidden');

    // Check if we were editing from template editor
    if (window.editingFromTemplateEditor) {
        // Return to template editor modal (workout-management-section)
        const workoutManagement = document.getElementById('workout-management-section');
        if (workoutManagement) workoutManagement.classList.remove('hidden');

        // Show the template editor modal
        const templateModal = document.getElementById('template-editor-section');
        if (templateModal) openModal(templateModal);

        // Clear the flags (callback clears these, but do it here too for cancel case)
        window.editingFromTemplateEditor = false;
        window.templateExerciseEditCallback = null;
    } else if (window.editingFromActiveWorkout) {
        // Return to active workout - hide exercise manager section first
        const exerciseManager = document.getElementById('exercise-manager-section');
        if (exerciseManager) exerciseManager.classList.add('hidden');

        const activeWorkout = document.getElementById('active-workout');
        if (activeWorkout) activeWorkout.classList.remove('hidden');

        // Show bottom nav again
        setBottomNavVisible(true);

        window.editingFromActiveWorkout = false;
    } else {
        // Return to exercise manager (normal behavior)
        const exerciseManager = document.getElementById('exercise-manager-section');
        if (exerciseManager) exerciseManager.classList.remove('hidden');
    }

    currentEditingExercise = null;
    selectedEquipmentId = null;
    selectedEquipmentData = null;
}

// --- Create/Edit Exercise form interactions (Phase F §1) -------------------

export function setExerciseBodyPart(value) {
    selectedBodyPart = value;
    const row = document.getElementById('edit-ex-bp-row');
    if (!row) return;
    row.querySelectorAll('.chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.bp === value);
    });
    updateEditExerciseValidity();
}

export function setExerciseEquipmentType(value) {
    selectedEquipmentType = value;
    const row = document.getElementById('edit-ex-eqtype-row');
    if (!row) return;
    row.querySelectorAll('.chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.eqtype === value);
    });
    updateEditExerciseValidity();
}

export function adjustExerciseStepper(inputId, delta, min, max) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const current = parseInt(input.value, 10);
    const base = Number.isNaN(current) ? min : current;
    const next = Math.max(min, Math.min(max, base + delta));
    input.value = String(next);
    input.dispatchEvent(new Event('change'));
}

export function toggleEditExerciseMore() {
    const body = document.getElementById('edit-ex-more');
    const head = document.getElementById('edit-ex-more-head');
    if (!body || !head) return;
    const isOpen = !body.classList.contains('hidden');
    body.classList.toggle('hidden');
    head.classList.toggle('sec-head--open', !isOpen);
}

function updateEditExerciseValidity() {
    const name = document.getElementById('edit-exercise-name')?.value.trim() || '';
    const valid = name.length > 0 && !!selectedBodyPart && !!selectedEquipmentType;
    const header = document.getElementById('edit-ex-save-header');
    const footer = document.getElementById('edit-ex-save-footer');
    if (header) header.disabled = !valid;
    if (footer) footer.disabled = !valid;
}

// Populate location datalist with all saved gym locations
async function populateLocationDatalist() {
    const datalist = document.getElementById('edit-equipment-location-list');
    if (!datalist) return;

    // Ensure workoutManager is initialized
    if (!workoutManager) {
        workoutManager = new FirebaseWorkoutManager(AppState);
    }

    try {
        // Get all user locations from Firebase
        const locations = await workoutManager.getUserLocations();

        // Also get locations from all equipment
        const allEquipment = await workoutManager.getUserEquipment();
        const equipmentLocations = new Set();
        allEquipment.forEach((eq) => {
            if (eq.location) equipmentLocations.add(eq.location);
            if (eq.locations && Array.isArray(eq.locations)) {
                eq.locations.forEach((loc) => equipmentLocations.add(loc));
            }
        });

        // Combine gym locations and equipment locations
        const allLocations = new Set([...locations.map((loc) => loc.name), ...equipmentLocations]);

        // Populate datalist
        datalist.innerHTML = Array.from(allLocations)
            .sort()
            .map((name) => `<option value="${escapeAttr(name)}">`)
            .join('');
    } catch (error) {
        console.error('❌ Error loading locations for datalist:', error);
        datalist.innerHTML = '';
    }
}

// Populate equipment list for the full-screen edit section
// Only shows equipment that has been used with this specific exercise
async function populateEquipmentListForSection(
    exerciseName = null,
    preselectedEquipment = null,
    preselectedLocation = null
) {
    if (!workoutManager) {
        workoutManager = new FirebaseWorkoutManager(AppState);
    }

    const listEl = document.getElementById('edit-equipment-list');
    const selectedDisplay = document.getElementById('edit-selected-equipment');
    const selectedText = document.getElementById('edit-selected-equipment-text');

    // Reset selection state
    selectedEquipmentId = null;
    selectedEquipmentData = null;
    if (selectedDisplay) selectedDisplay.classList.add('hidden');

    try {
        // Populate location datalist with all saved gym locations
        await populateLocationDatalist();

        // Only get equipment associated with THIS exercise
        let exerciseEquipment = [];
        if (exerciseName) {
            exerciseEquipment = await workoutManager.getEquipmentForExercise(exerciseName);
        }

        if (!listEl) return;

        if (exerciseEquipment.length === 0) {
            listEl.innerHTML = '<div class="edit-equipment-empty">No equipment saved for this exercise</div>';
            return;
        }

        // Render equipment items - support both single location and locations array
        listEl.innerHTML = exerciseEquipment
            .map((eq) => {
                // Get locations from either array or single field
                let locationsList = [];
                if (eq.locations && Array.isArray(eq.locations)) {
                    locationsList = eq.locations;
                } else if (eq.location) {
                    locationsList = [eq.location];
                }
                const locationDisplay = locationsList.length > 0 ? locationsList.join(', ') : '';

                return `
            <div class="edit-equipment-item" data-equipment-id="${escapeAttr(eq.id)}" data-name="${escapeAttr(eq.name)}"
                 data-location="${escapeAttr(locationDisplay)}" data-equipment-json='${JSON.stringify(eq).replace(/'/g, '&#39;').replace(/</g, '&lt;')}'>
                <div class="edit-equipment-item-info">
                    <div class="edit-equipment-item-name">${escapeHtml(eq.name)}</div>
                    ${locationDisplay ? `<div class="edit-equipment-item-location">${escapeHtml(locationDisplay)}</div>` : ''}
                </div>
                <button type="button" class="edit-equipment-item-edit" data-equipment-id="${escapeAttr(eq.id)}" title="Edit equipment">
                    <i class="fas fa-pen"></i>
                </button>
            </div>
        `;
            })
            .join('');

        // Add click handlers for selection
        listEl.querySelectorAll('.edit-equipment-item').forEach((item) => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.edit-equipment-item-edit')) return;
                selectEquipmentItemForSection(item);
            });
        });

        // Add click handlers for edit buttons
        listEl.querySelectorAll('.edit-equipment-item-edit').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = btn.closest('.edit-equipment-item');
                const equipmentJson = item.dataset.equipmentJson;
                try {
                    const equipment = JSON.parse(equipmentJson.replace(/&#39;/g, "'"));
                    openEquipmentEditor(equipment);
                } catch (err) {
                    console.error('Error parsing equipment data:', err);
                }
            });
        });

        // Pre-select equipment if editing an exercise with equipment
        if (preselectedEquipment) {
            const matchingItem = listEl.querySelector(
                `.edit-equipment-item[data-name="${preselectedEquipment}"]${preselectedLocation ? `[data-location="${preselectedLocation}"]` : ''}`
            );
            if (matchingItem) {
                selectEquipmentItemForSection(matchingItem);
            }
        }
    } catch (error) {
        console.error('❌ Error populating equipment list:', error);
        if (listEl) {
            listEl.innerHTML = '<div class="edit-equipment-empty">Error loading equipment</div>';
        }
    }
}

// Select an equipment item (for section)
function selectEquipmentItemForSection(item) {
    const listEl = document.getElementById('edit-equipment-list');
    const selectedDisplay = document.getElementById('edit-selected-equipment');
    const selectedText = document.getElementById('edit-selected-equipment-text');

    // Clear previous selection
    listEl?.querySelectorAll('.edit-equipment-item').forEach((i) => i.classList.remove('selected'));

    // Mark as selected
    item.classList.add('selected');

    // Store selection data
    selectedEquipmentId = item.dataset.equipmentId;
    selectedEquipmentData = {
        name: item.dataset.name,
        location: item.dataset.location || null,
    };

    // Update display
    if (selectedDisplay && selectedText) {
        const displayText = selectedEquipmentData.location
            ? `${selectedEquipmentData.name} @ ${selectedEquipmentData.location}`
            : selectedEquipmentData.name;
        selectedText.textContent = displayText;
        selectedDisplay.classList.remove('hidden');
    }

    // Clear the "add new" inputs since we selected existing
    const nameInput = document.getElementById('edit-equipment-name');
    const locationInput = document.getElementById('edit-equipment-location');
    if (nameInput) nameInput.value = '';
    if (locationInput) locationInput.value = '';
}

// Clear selected equipment (works with full-screen edit section)
export function clearSelectedEquipment() {
    const listEl = document.getElementById('edit-equipment-list');
    const selectedDisplay = document.getElementById('edit-selected-equipment');

    // Clear selection state
    selectedEquipmentId = null;
    selectedEquipmentData = null;

    // Clear visual selection
    listEl?.querySelectorAll('.edit-equipment-item').forEach((i) => i.classList.remove('selected'));

    // Hide display
    if (selectedDisplay) selectedDisplay.classList.add('hidden');
}

// Delete equipment item
async function deleteEquipmentItem(equipmentId) {
    if (!confirm('Delete this equipment? You can re-add it later.')) {
        return;
    }

    try {
        if (!workoutManager) {
            workoutManager = new FirebaseWorkoutManager(AppState);
        }

        await workoutManager.deleteEquipment(equipmentId);
        showNotification('Equipment deleted', 'success');

        // If this was the selected equipment, clear selection
        if (selectedEquipmentId === equipmentId) {
            clearSelectedEquipment();
        }

        // Refresh the equipment list for this exercise
        const exerciseName =
            currentEditingExercise?.name ||
            currentEditingExercise?.machine ||
            document.getElementById('edit-exercise-name')?.value.trim() ||
            null;
        await populateEquipmentListForSection(exerciseName);
    } catch (error) {
        console.error('❌ Error deleting equipment:', error);
        showNotification('Error deleting equipment', 'error');
    }
}

// Add equipment to list instantly (from the Add Equipment button in full-screen section)
export async function addEquipmentToList() {
    const nameInput = document.getElementById('edit-equipment-name');
    const locationInput = document.getElementById('edit-equipment-location');
    const videoInput = document.getElementById('edit-equipment-video');

    const equipmentName = nameInput?.value.trim();
    let locationName = locationInput?.value.trim();
    const videoUrl = videoInput?.value.trim();

    if (!equipmentName) {
        showNotification('Enter an equipment name', 'warning');
        nameInput?.focus();
        return;
    }

    // Auto-fill location from active workout session if not provided
    if (!locationName && window.getSessionLocation) {
        const sessionLocation = window.getSessionLocation();
        if (sessionLocation) {
            locationName = sessionLocation;
        }
    }

    // Get the current exercise name
    const exerciseName =
        currentEditingExercise?.name ||
        currentEditingExercise?.machine ||
        document.getElementById('edit-exercise-name')?.value.trim() ||
        null;

    if (!exerciseName) {
        showNotification('Enter exercise name first', 'warning');
        document.getElementById('edit-exercise-name')?.focus();
        return;
    }

    try {
        if (!workoutManager) {
            workoutManager = new FirebaseWorkoutManager(AppState);
        }

        // Save the new equipment AND associate it with this exercise (including video)
        const equipment = await workoutManager.getOrCreateEquipment(
            equipmentName,
            locationName,
            exerciseName,
            videoUrl
        );

        // If we're in an active workout with a location, also add that location to the equipment
        if (equipment && equipment.id && window.getSessionLocation) {
            const sessionLocation = window.getSessionLocation();
            if (sessionLocation) {
                await workoutManager.addLocationToEquipment(equipment.id, sessionLocation);
            }
        }

        // Clear the input fields
        if (nameInput) nameInput.value = '';
        if (locationInput) locationInput.value = '';
        if (videoInput) videoInput.value = '';

        // Refresh the list and auto-select the new equipment
        await populateEquipmentListForSection(exerciseName, equipmentName, locationName);

        // Silent success - equipment appears in list immediately
    } catch (error) {
        console.error('❌ Error adding equipment:', error);
        showNotification('Error adding equipment', 'error');
    }
}

// Close add exercise modal
export function closeAddExerciseModal() {
    const modal = document.getElementById('add-exercise-modal');
    if (modal) closeModal(modal);
    currentEditingExercise = null;

    // If we were editing from active workout, close the entire exercise manager
    if (window.editingFromActiveWorkout) {
        closeExerciseManager();
    }
}

// Edit exercise - opens full-screen edit section
export function editExercise(exerciseId) {
    const exercise = allExercises.find((ex) => ex.id === exerciseId);
    if (!exercise) return;

    openEditExerciseSection(exercise);
}

// Save exercise
export async function saveExercise(event) {
    event.preventDefault();

    // Get equipment from EITHER selected item OR new input fields
    let equipmentName = '';
    let locationName = '';

    if (selectedEquipmentData) {
        // Use selected equipment from list
        equipmentName = selectedEquipmentData.name;
        locationName = selectedEquipmentData.location || '';
    } else {
        // Check for new equipment entry
        equipmentName = document.getElementById('new-exercise-machine-name')?.value.trim() || '';
        locationName = document.getElementById('new-exercise-location')?.value.trim() || '';
    }

    const formData = {
        name: document.getElementById('new-exercise-name')?.value.trim() || '',
        bodyPart: document.getElementById('new-exercise-body-part')?.value || 'Chest',
        equipmentType: document.getElementById('new-exercise-equipment')?.value || 'Machine',
        sets: parseInt(document.getElementById('new-exercise-sets')?.value) || 3,
        reps: parseInt(document.getElementById('new-exercise-reps')?.value) || 10,
        weight: parseInt(document.getElementById('new-exercise-weight')?.value) || 50,
        video: document.getElementById('new-exercise-video')?.value.trim() || '',
        equipment: equipmentName || null,
        equipmentLocation: locationName || null,
    };

    if (!formData.name) {
        alert('Add an exercise name');
        return;
    }

    try {
        // Save to Firebase using FirebaseWorkoutManager
        if (!workoutManager) {
            workoutManager = new FirebaseWorkoutManager(AppState);
        }

        const isEditing = !!currentEditingExercise;

        if (isEditing) {
            // Merge with existing exercise data
            const exerciseToSave = {
                ...currentEditingExercise,
                ...formData,
                id: currentEditingExercise.id,
            };
            await workoutManager.saveUniversalExercise(exerciseToSave, true);
        } else {
            // New exercise
            await workoutManager.saveCustomExercise(formData, false);
        }

        // If new equipment was entered (not selected from list), save it
        if (equipmentName && !selectedEquipmentData) {
            await workoutManager.getOrCreateEquipment(equipmentName, locationName, formData.name);
        }

        // Silent success - UI updates are self-evident
        closeAddExerciseModal();

        // Refresh AppState exercise database
        AppState.exerciseDatabase = await workoutManager.getExerciseLibrary();

        // Refresh exercise manager section if visible
        const managerSection = document.getElementById('exercise-manager-section');
        if (managerSection && !managerSection.classList.contains('hidden')) {
            await loadExercises();
        }

        // Also refresh the exercise-library-section if it's open (used in workout management)
        const libraryModal = document.getElementById('exercise-library-section');
        if (libraryModal && (libraryModal.open || !libraryModal.classList.contains('hidden'))) {
            // Dispatch custom event to trigger refresh in workout-management-ui
            window.dispatchEvent(new CustomEvent('exerciseLibraryUpdated'));
        }
    } catch (error) {
        console.error('❌ Error saving exercise:', error);
        alert('Error saving exercise: ' + error.message);
    }
}

// Delete exercise
export async function deleteExercise(exerciseId) {
    const exercise = allExercises.find((ex) => ex.id === exerciseId);
    if (!exercise) return;

    let confirmMessage;
    if (exercise.isDefault && !exercise.isOverride) {
        confirmMessage = `Hide "${exercise.name}" from your library? (You can unhide it later if needed)`;
    } else if (exercise.isOverride) {
        confirmMessage = `Revert "${exercise.name}" to default version? (This will remove your custom changes)`;
    } else if (exercise.isCustom) {
        confirmMessage = `Permanently delete "${exercise.name}"? This can't be undone.`;
    }

    if (confirm(confirmMessage)) {
        try {
            // Initialize workout manager if needed
            if (!workoutManager) {
                workoutManager = new FirebaseWorkoutManager(AppState);
            }

            // Delete from Firebase using universal delete method
            await workoutManager.deleteUniversalExercise(exerciseId, exercise);

            showNotification(
                exercise.isCustom
                    ? 'Exercise deleted'
                    : exercise.isOverride
                      ? 'Reverted to default'
                      : 'Exercise hidden',
                'success'
            );

            // Refresh AppState exercise database
            AppState.exerciseDatabase = await workoutManager.getExerciseLibrary();
            await loadExercises();
        } catch (error) {
            console.error('❌ Error deleting exercise:', error);
            alert('Error processing request: ' + error.message);
        }
    }
}

// Delete exercise from full-screen section
export async function deleteExerciseFromSection() {
    if (!currentEditingExercise) {
        showNotification('No exercise selected', 'error');
        return;
    }

    const exercise = currentEditingExercise;
    let confirmMessage;
    if (exercise.isDefault && !exercise.isOverride) {
        confirmMessage = `Hide "${exercise.name}" from your library? (You can unhide it later if needed)`;
    } else if (exercise.isOverride) {
        confirmMessage = `Revert "${exercise.name}" to default version? (This will remove your custom changes)`;
    } else if (exercise.isCustom) {
        confirmMessage = `Permanently delete "${exercise.name}"? This can't be undone.`;
    } else {
        confirmMessage = `Delete "${exercise.name}"?`;
    }

    if (confirm(confirmMessage)) {
        try {
            // Initialize workout manager if needed
            if (!workoutManager) {
                workoutManager = new FirebaseWorkoutManager(AppState);
            }

            // Delete from Firebase using universal delete method
            await workoutManager.deleteUniversalExercise(exercise.id, exercise);

            showNotification(
                exercise.isCustom
                    ? 'Exercise deleted'
                    : exercise.isOverride
                      ? 'Reverted to default'
                      : 'Exercise hidden',
                'success'
            );

            // Refresh AppState exercise database
            AppState.exerciseDatabase = await workoutManager.getExerciseLibrary();
            await loadExercises();

            // Close the edit section and return to exercise manager
            closeEditExerciseSection();
        } catch (error) {
            console.error('❌ Error deleting exercise:', error);
            alert('Error processing request: ' + error.message);
        }
    }
}

// Save exercise from full-screen section
export async function saveExerciseFromSection() {
    // Get equipment from EITHER selected item OR new input fields
    let equipmentName = '';
    let locationName = '';

    if (selectedEquipmentData) {
        // Use selected equipment from list
        equipmentName = selectedEquipmentData.name;
        locationName = selectedEquipmentData.location || '';
    } else {
        // Check for new equipment entry (not yet added to list)
        const newEquipName = document.getElementById('edit-equipment-name')?.value.trim() || '';
        const newLocName = document.getElementById('edit-equipment-location')?.value.trim() || '';
        if (newEquipName) {
            equipmentName = newEquipName;
            locationName = newLocName;
        }
    }

    const formData = {
        name: document.getElementById('edit-exercise-name')?.value.trim() || '',
        bodyPart: selectedBodyPart || 'Chest',
        equipmentType: selectedEquipmentType || 'Machine',
        sets: parseInt(document.getElementById('edit-exercise-sets')?.value) || 3,
        reps: parseInt(document.getElementById('edit-exercise-reps')?.value) || 10,
        weight: parseInt(document.getElementById('edit-exercise-weight')?.value) || 50,
        notes: document.getElementById('edit-exercise-notes')?.value.trim() || '',
        video: document.getElementById('edit-exercise-video')?.value.trim() || '',
        equipment: equipmentName || null,
        equipmentLocation: locationName || null,
        equipmentVideo: document.getElementById('edit-equipment-video')?.value.trim() || null,
    };

    if (!formData.name) {
        showNotification('Add an exercise name', 'warning');
        document.getElementById('edit-exercise-name')?.focus();
        return;
    }

    // Check if we're editing from template editor - if so, call callback instead of saving to Firebase
    if (window.editingFromTemplateEditor && typeof window.templateExerciseEditCallback === 'function') {
        // Call the callback with the form data
        window.templateExerciseEditCallback(formData);

        // Close section and return to template editor
        closeEditExerciseSection();
        return;
    }

    try {
        // Save to Firebase using FirebaseWorkoutManager
        if (!workoutManager) {
            workoutManager = new FirebaseWorkoutManager(AppState);
        }

        const isEditing = !!currentEditingExercise;

        if (isEditing) {
            // Merge with existing exercise data
            const exerciseToSave = {
                ...currentEditingExercise,
                ...formData,
                id: currentEditingExercise.id,
            };
            await workoutManager.saveUniversalExercise(exerciseToSave, true);
        } else {
            // New exercise
            await workoutManager.saveCustomExercise(formData, false);
        }

        // If new equipment was entered (not selected from list), save it
        if (equipmentName && !selectedEquipmentData) {
            await workoutManager.getOrCreateEquipment(equipmentName, locationName, formData.name);
        }

        // Silent success - UI updates are self-evident

        // Store old name before refresh to update active workout
        const oldName = currentEditingExercise?.name || currentEditingExercise?.machine;
        const newName = formData.name;

        // Close section and return to exercise manager
        closeEditExerciseSection();

        // Refresh AppState exercise database
        AppState.exerciseDatabase = await workoutManager.getExerciseLibrary();

        // Update active workout if exercise was renamed and we're editing from active workout
        if (isEditing && oldName && newName && oldName !== newName && AppState.currentWorkout) {
            // Find and update the exercise in current workout
            const exerciseIndex = AppState.currentWorkout.exercises.findIndex(
                (ex) => (ex.machine || ex.name) === oldName
            );
            if (exerciseIndex !== -1) {
                AppState.currentWorkout.exercises[exerciseIndex].machine = newName;
                AppState.currentWorkout.exercises[exerciseIndex].name = newName;
                // Also update video if provided
                if (formData.video) {
                    AppState.currentWorkout.exercises[exerciseIndex].video = formData.video;
                }
                // Dispatch event to refresh workout UI
                window.dispatchEvent(
                    new CustomEvent('exerciseRenamed', {
                        detail: { oldName, newName, exerciseIndex },
                    })
                );
            }
        }

        // Refresh exercise manager section
        await loadExercises();

        // Also refresh the exercise-library-section if it's open (used in workout management)
        const libraryModal = document.getElementById('exercise-library-section');
        if (libraryModal && (libraryModal.open || !libraryModal.classList.contains('hidden'))) {
            window.dispatchEvent(new CustomEvent('exerciseLibraryUpdated'));
        }
    } catch (error) {
        console.error('❌ Error saving exercise:', error);
        showNotification('Error saving exercise: ' + error.message, 'error');
    }
}

// ===================================================================
// EQUIPMENT EDITOR FUNCTIONS
// ===================================================================

/**
 * Open equipment editor section (full page)
 * @param {Object} equipment - Equipment data with id, name, location(s), video
 */
export async function openEquipmentEditor(equipment) {
    if (!equipment || !equipment.id) {
        console.error('❌ openEquipmentEditor: Invalid equipment data', equipment);
        showNotification("Can't edit this equipment", 'error');
        return;
    }

    editingEquipmentData = equipment;

    // Build locations array from either locations array or single location field
    editingEquipmentLocations = [];
    if (equipment.locations && Array.isArray(equipment.locations)) {
        editingEquipmentLocations = [...equipment.locations];
    } else if (equipment.location) {
        editingEquipmentLocations = [equipment.location];
    }

    // Populate form fields
    const nameInput = document.getElementById('equipment-editor-name');
    const videoInput = document.getElementById('equipment-editor-video');

    if (nameInput) nameInput.value = equipment.name || '';
    if (videoInput) videoInput.value = equipment.video || '';

    // Render locations list
    renderEquipmentEditorLocations();

    // Render per-exercise video list
    renderEquipmentExerciseVideos();

    // Populate location datalist with saved gym locations
    await populateEquipmentEditorLocationDatalist();

    // Hide edit exercise section and show equipment editor section
    const editExerciseSection = document.getElementById('edit-exercise-section');
    const equipmentSection = document.getElementById('equipment-editor-section');

    if (editExerciseSection) editExerciseSection.classList.add('hidden');
    if (equipmentSection) equipmentSection.classList.remove('hidden');
}

/**
 * Populate location datalist in equipment editor with saved gym locations
 */
async function populateEquipmentEditorLocationDatalist() {
    const datalist = document.getElementById('equipment-editor-location-list');
    if (!datalist) return;

    try {
        // Get all user locations from Firebase
        const locations = await workoutManager.getUserLocations();

        // Also get locations from all equipment
        const allEquipment = await workoutManager.getUserEquipment();
        const equipmentLocations = new Set();
        allEquipment.forEach((eq) => {
            if (eq.location) equipmentLocations.add(eq.location);
            if (eq.locations && Array.isArray(eq.locations)) {
                eq.locations.forEach((loc) => equipmentLocations.add(loc));
            }
        });

        // Combine gym locations and equipment locations
        const allLocations = new Set([...locations.map((loc) => loc.name), ...equipmentLocations]);

        // Populate datalist
        datalist.innerHTML = Array.from(allLocations)
            .sort()
            .map((name) => `<option value="${escapeAttr(name)}">`)
            .join('');
    } catch (error) {
        console.error('❌ Error loading locations for equipment editor datalist:', error);
        datalist.innerHTML = '';
    }
}

/**
 * Render locations list in equipment editor
 */
function renderEquipmentEditorLocations() {
    const container = document.getElementById('equipment-editor-locations');
    if (!container) return;

    if (editingEquipmentLocations.length === 0) {
        container.innerHTML = '<div class="equipment-locations-empty">No locations added</div>';
        return;
    }

    container.innerHTML = editingEquipmentLocations
        .map(
            (loc, index) => `
        <div class="equipment-location-item">
            <span class="location-name">
                <i class="fas fa-map-marker-alt"></i>
                ${escapeHtml(loc)}
            </span>
            <button type="button" class="remove-location-btn" onclick="removeLocationFromEquipmentEditor(${index})" title="Remove location">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `
        )
        .join('');
}

/**
 * Render per-exercise video list in equipment editor.
 * Shows each exercise this equipment is used with and an inline video URL input.
 */
function renderEquipmentExerciseVideos() {
    const container = document.getElementById('equipment-exercise-videos');
    if (!container || !editingEquipmentData) return;

    const exerciseTypes = editingEquipmentData.exerciseTypes || [];
    const exerciseVideos = editingEquipmentData.exerciseVideos || {};

    if (exerciseTypes.length === 0) {
        container.innerHTML = '<div class="equipment-locations-empty">No exercises linked yet</div>';
        return;
    }

    container.innerHTML = exerciseTypes.map(exName => {
        const videoUrl = exerciseVideos[exName] || '';
        const safeExName = escapeAttr(exName);
        return `
            <div class="equipment-video-row">
                <div class="equipment-video-info">
                    <span class="equipment-video-exercise">${escapeHtml(exName)}</span>
                    <input type="url" class="form-input equipment-video-input"
                           id="equip-video-${safeExName}"
                           data-exercise="${safeExName}"
                           value="${escapeAttr(videoUrl)}"
                           placeholder="YouTube URL"
                           onchange="editEquipmentExerciseVideo('${safeExName}', this.value)">
                </div>
                ${videoUrl ? `<button type="button" class="btn-text" onclick="editEquipmentExerciseVideo('${safeExName}', ''); this.closest('.equipment-video-row').querySelector('input').value='';" title="Clear video">
                    <i class="fas fa-times"></i>
                </button>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Update the video URL for a specific exercise on this equipment (inline input).
 */
export function editEquipmentExerciseVideo(exerciseName, newUrl) {
    if (!editingEquipmentData) return;

    // Update local state
    if (!editingEquipmentData.exerciseVideos) {
        editingEquipmentData.exerciseVideos = {};
    }

    if (!newUrl || newUrl.trim() === '') {
        delete editingEquipmentData.exerciseVideos[exerciseName];
    } else {
        editingEquipmentData.exerciseVideos[exerciseName] = newUrl.trim();
    }

    // Re-render to update clear button visibility
    renderEquipmentExerciseVideos();
}

/**
 * Add location to equipment editor
 */
export function addLocationToEquipmentEditor() {
    const input = document.getElementById('equipment-editor-new-location');
    const locationName = input?.value.trim();

    if (!locationName) {
        showNotification('Enter a location name', 'warning');
        input?.focus();
        return;
    }

    // Check for duplicate
    if (editingEquipmentLocations.includes(locationName)) {
        showNotification('Location already added', 'warning');
        return;
    }

    editingEquipmentLocations.push(locationName);
    renderEquipmentEditorLocations();

    // Clear input
    if (input) input.value = '';
}

/**
 * Remove location from equipment editor
 */
export function removeLocationFromEquipmentEditor(index) {
    if (index >= 0 && index < editingEquipmentLocations.length) {
        editingEquipmentLocations.splice(index, 1);
        renderEquipmentEditorLocations();
    }
}

/**
 * Save equipment from editor
 */
export async function saveEquipmentFromEditor() {
    if (!editingEquipmentData || !editingEquipmentData.id) return;

    const nameInput = document.getElementById('equipment-editor-name');
    const videoInput = document.getElementById('equipment-editor-video');

    const name = nameInput?.value.trim();
    const video = videoInput?.value.trim();

    if (!name) {
        showNotification('Enter equipment name', 'warning');
        nameInput?.focus();
        return;
    }

    try {
        if (!workoutManager) {
            workoutManager = new FirebaseWorkoutManager(AppState);
        }

        // Update the equipment (include per-exercise videos)
        const exerciseVideos = editingEquipmentData.exerciseVideos || {};
        await workoutManager.updateEquipment(editingEquipmentData.id, {
            name: name,
            video: video || null,
            exerciseVideos: Object.keys(exerciseVideos).length > 0 ? exerciseVideos : null,
            locations: editingEquipmentLocations,
            location: null, // Clear old single location field
        });

        // Removed notification - action is self-evident
        closeEquipmentEditor();

        // Refresh the equipment list if we're in the exercise edit section
        if (currentEditingExercise) {
            const exerciseName = currentEditingExercise.name || currentEditingExercise.machine;
            await populateEquipmentListForSection(exerciseName);
        }
    } catch (error) {
        console.error('❌ Error saving equipment:', error);
        showNotification('Error saving equipment', 'error');
    }
}

/**
 * Delete equipment from editor
 */
export async function deleteEquipmentFromEditor() {
    if (!editingEquipmentData || !editingEquipmentData.id) {
        showNotification('No equipment selected to delete', 'warning');
        return;
    }

    // Store data before any async operations that might clear it
    const equipmentId = editingEquipmentData.id;
    const equipmentName = editingEquipmentData.name;

    const confirmed = confirm(`Delete "${equipmentName}"? This can't be undone.`);
    if (!confirmed) return;

    try {
        if (!workoutManager) {
            workoutManager = new FirebaseWorkoutManager(AppState);
        }

        await workoutManager.deleteEquipment(equipmentId);

        // Clear selection if this was the selected equipment
        if (selectedEquipmentId === equipmentId) {
            selectedEquipmentId = null;
            selectedEquipmentData = null;
        }

        // Close the editor (this clears editingEquipmentData)
        closeEquipmentEditor();

        // Refresh the equipment list
        if (currentEditingExercise) {
            const exerciseName = currentEditingExercise.name || currentEditingExercise.machine;
            await populateEquipmentListForSection(exerciseName);
        }
    } catch (error) {
        console.error('❌ Error deleting equipment:', error);
        showNotification('Error deleting equipment', 'error');
    }
}

/**
 * Close equipment editor section
 */
export function closeEquipmentEditor() {
    const equipmentSection = document.getElementById('equipment-editor-section');
    const editExerciseSection = document.getElementById('edit-exercise-section');

    if (equipmentSection) equipmentSection.classList.add('hidden');
    if (editExerciseSection) editExerciseSection.classList.remove('hidden');

    editingEquipmentData = null;
    editingEquipmentLocations = [];
}

// ===================================================================
// EQUIPMENT REASSIGNMENT
// ===================================================================

let reassignmentState = {
    equipmentId: null,
    equipmentName: null,
    oldExerciseName: null,
    newExerciseName: null,
    impactWorkouts: 0,
    impactTemplates: 0,
};

/**
 * Show the reassignment modal — lets user pick a new exercise for this equipment.
 * Called from the equipment editor UI.
 */
export async function showReassignEquipment() {
    if (!editingEquipmentData) {
        showNotification('No equipment selected', 'warning');
        return;
    }

    const equipmentId = editingEquipmentData.id;
    const equipmentName = editingEquipmentData.name;
    const exerciseTypes = editingEquipmentData.exerciseTypes || [];

    // We need to know which exercise this equipment is currently assigned to.
    // If multiple, show a picker for the source exercise too.
    // For simplicity, if there's only one exerciseType, use it directly.
    let oldExerciseName;
    if (exerciseTypes.length === 1) {
        oldExerciseName = exerciseTypes[0];
    } else if (exerciseTypes.length > 1) {
        // Show a picker for which exercise to reassign FROM
        oldExerciseName = await showSourceExercisePicker(exerciseTypes);
        if (!oldExerciseName) return; // Cancelled
    } else {
        showNotification('This equipment has no associated exercises', 'warning');
        return;
    }

    reassignmentState = {
        equipmentId,
        equipmentName,
        oldExerciseName,
        newExerciseName: null,
        impactWorkouts: 0,
        impactTemplates: 0,
    };

    // Build exercise list for the target picker
    const exercises = AppState.exerciseDatabase || [];
    const exerciseList = exercises
        .filter(ex => {
            const name = ex.name || ex.machine;
            return name && name !== oldExerciseName;
        })
        .sort((a, b) => (a.name || a.machine || '').localeCompare(b.name || b.machine || ''));

    const modal = document.getElementById('reassign-equipment-modal');
    const content = modal?.querySelector('.reassign-exercise-list');
    const headerEl = modal?.querySelector('.reassign-header-info');

    if (!modal || !content) return;

    // Set header
    if (headerEl) {
        headerEl.innerHTML = `
            <div class="reassign-current">
                <span class="text-muted">Equipment:</span>
                <strong>${escapeHtml(equipmentName)}</strong>
            </div>
            <div class="reassign-current">
                <span class="text-muted">Currently on:</span>
                <strong>${escapeHtml(oldExerciseName)}</strong>
            </div>
        `;
    }

    // Build searchable exercise list
    content.innerHTML = exerciseList.map(ex => {
        const name = ex.name || ex.machine;
        const bodyPart = ex.bodyPart || ex.category || '';
        return `
            <div class="reassign-exercise-option" data-exercise="${escapeAttr(name)}" data-action="selectReassignTarget">
                <div class="reassign-exercise-name">${escapeHtml(name)}</div>
                <div class="reassign-exercise-meta">${escapeHtml(bodyPart)}</div>
            </div>
        `;
    }).join('');

    // Setup search filter
    const searchInput = modal.querySelector('#reassign-exercise-search');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = () => {
            const term = searchInput.value.toLowerCase();
            content.querySelectorAll('.reassign-exercise-option').forEach(el => {
                const name = el.dataset.exercise.toLowerCase();
                const meta = el.querySelector('.reassign-exercise-meta')?.textContent.toLowerCase() || '';
                el.style.display = (name.includes(term) || meta.includes(term)) ? '' : 'none';
            });
        };
    }

    // Setup delegation for exercise selection
    content.onclick = (e) => {
        const option = e.target.closest('.reassign-exercise-option');
        if (!option) return;
        // Toggle selection
        content.querySelectorAll('.reassign-exercise-option.selected').forEach(el => el.classList.remove('selected'));
        option.classList.add('selected');
        reassignmentState.newExerciseName = option.dataset.exercise;
    };

    // Hide equipment editor, show reassignment modal
    const equipmentSection = document.getElementById('equipment-editor-section');
    if (equipmentSection) equipmentSection.classList.add('hidden');
    openModal(modal);
}

/**
 * Prompt user to pick which exercise to reassign FROM (when equipment has multiple exerciseTypes).
 */
function showSourceExercisePicker(exerciseTypes) {
    return new Promise((resolve) => {
        const choices = exerciseTypes.map(name =>
            `<button class="btn btn-secondary btn-full reassign-source-btn" data-exercise="${escapeAttr(name)}">${escapeHtml(name)}</button>`
        ).join('');

        const modal = document.getElementById('reassign-equipment-modal');
        if (!modal) { resolve(null); return; }

        const content = modal.querySelector('.reassign-exercise-list');
        const headerEl = modal.querySelector('.reassign-header-info');
        if (headerEl) {
            headerEl.innerHTML = `<div class="reassign-current"><strong>Which exercise should this equipment move FROM?</strong></div>`;
        }
        if (content) {
            content.innerHTML = choices;
            content.onclick = (e) => {
                const btn = e.target.closest('[data-exercise]');
                if (btn) {
                    closeModal(modal);
                    resolve(btn.dataset.exercise);
                }
            };
        }

        // Show cancel button to close
        const cancelBtn = modal.querySelector('[data-action="closeReassignModal"]');
        const origHandler = cancelBtn?.onclick;
        if (cancelBtn) {
            cancelBtn.onclick = () => { closeModal(modal); resolve(null); };
        }

        openModal(modal);
    });
}

/**
 * User confirmed target exercise — now show impact preview before committing.
 */
export async function confirmReassignmentTarget() {
    if (!reassignmentState.newExerciseName) {
        showNotification('Select an exercise first', 'warning');
        return;
    }

    const modal = document.getElementById('reassign-equipment-modal');
    const content = modal?.querySelector('.reassign-exercise-list');
    const headerEl = modal?.querySelector('.reassign-header-info');
    if (!content || !headerEl) return;

    // Show loading
    content.innerHTML = `<div class="reassign-loading"><i class="fas fa-spinner fa-spin"></i> Scanning workouts...</div>`;

    // Count impact
    const impact = await countReassignmentImpact(reassignmentState.equipmentName, reassignmentState.oldExerciseName);
    reassignmentState.impactWorkouts = impact.workouts;
    reassignmentState.impactTemplates = impact.templates;

    // Show confirmation preview
    headerEl.innerHTML = `
        <h3 class="reassign-preview__title">Confirm Reassignment</h3>
        <div class="reassign-preview">
            <div class="reassign-from">
                <span class="text-muted">From:</span>
                <strong>${escapeHtml(reassignmentState.oldExerciseName)}</strong>
            </div>
            <i class="fas fa-arrow-right reassign-preview__arrow"></i>
            <div class="reassign-to">
                <span class="text-muted">To:</span>
                <strong>${escapeHtml(reassignmentState.newExerciseName)}</strong>
            </div>
        </div>
    `;

    content.innerHTML = `
        <div class="reassign-impact">
            <p>
                <i class="fas fa-database"></i>
                This will update <strong>${impact.workouts}</strong> session${impact.workouts !== 1 ? 's' : ''}
                and <strong>${impact.templates}</strong> workout${impact.templates !== 1 ? 's' : ''}.
            </p>
            <p class="text-muted reassign-impact__hint">
                The equipment record "${escapeHtml(reassignmentState.equipmentName)}" will be moved to "${escapeHtml(reassignmentState.newExerciseName)}".
            </p>
        </div>
        <div id="reassign-progress" class="reassign-progress hidden">
            <div class="reassign-progress-bar"></div>
            <span class="reassign-progress-text">Updating…</span>
        </div>
        <div class="reassign-confirm-actions">
            <button class="btn btn-secondary" onclick="closeReassignModal()">Cancel</button>
            <button class="btn btn-primary" id="reassign-commit-btn" onclick="commitReassignment()">
                <i class="fas fa-check"></i> Reassign
            </button>
        </div>
    `;
}

/**
 * Execute the equipment reassignment.
 */
export async function commitReassignment() {
    const { equipmentId, equipmentName, oldExerciseName, newExerciseName } = reassignmentState;
    if (!equipmentId || !oldExerciseName || !newExerciseName) return;

    const commitBtn = document.getElementById('reassign-commit-btn');
    const progressEl = document.getElementById('reassign-progress');
    const progressBar = progressEl?.querySelector('.reassign-progress-bar');
    const progressText = progressEl?.querySelector('.reassign-progress-text');

    // Disable button and show progress
    if (commitBtn) commitBtn.disabled = true;
    if (progressEl) progressEl.classList.remove('hidden');

    try {
        const result = await reassignEquipment(
            equipmentId,
            equipmentName,
            oldExerciseName,
            newExerciseName,
            (done, total) => {
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                if (progressBar) progressBar.style.setProperty('--progress', `${pct}%`);
                if (progressText) progressText.textContent = `Updating ${done} of ${total} sessions…`;
            }
        );

        const extras = [];
        if (result.prsMigrated) {
            extras.push(result.prMergeConflicts
                ? `PRs migrated (${result.prMergeConflicts} merged)`
                : 'PRs migrated');
        }
        if (result.videoMigrated) extras.push('form video moved');
        const tail = extras.length ? ` · ${extras.join(' · ')}` : '';

        showNotification(
            `Reassigned to ${newExerciseName} (${result.workouts} session${result.workouts !== 1 ? 's' : ''}, ${result.templates} workout${result.templates !== 1 ? 's' : ''})${tail}`,
            'success',
            3500
        );

        closeReassignModal();

        // Refresh exercise library if open
        if (AppState.exerciseDatabase) {
            if (!workoutManager) workoutManager = new FirebaseWorkoutManager(AppState);
            AppState.exerciseDatabase = await workoutManager.getExerciseLibrary();
        }
    } catch (error) {
        console.error('❌ Equipment reassignment failed:', error);
        showNotification('Reassignment failed — please try again', 'error');
        if (commitBtn) commitBtn.disabled = false;
    }
}

/**
 * Close the reassignment modal and return to equipment editor.
 */
export function closeReassignModal() {
    const modal = document.getElementById('reassign-equipment-modal');
    if (modal) closeModal(modal);

    // Re-show equipment editor if it was hidden
    const equipmentSection = document.getElementById('equipment-editor-section');
    if (equipmentSection && editingEquipmentData) {
        equipmentSection.classList.remove('hidden');
    }

    reassignmentState = {
        equipmentId: null, equipmentName: null,
        oldExerciseName: null, newExerciseName: null,
        impactWorkouts: 0, impactTemplates: 0,
    };
}
