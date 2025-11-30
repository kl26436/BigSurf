// Exercise Manager UI Module
// Handles the integrated exercise manager modal

import { AppState } from './app-state.js';
import { showNotification } from './ui-helpers.js';
import { FirebaseWorkoutManager } from './firebase-workout-manager.js';

let allExercises = [];
let filteredExercises = [];
let currentEditingExercise = null;
let workoutManager = null;
let selectedEquipmentId = null;
let selectedEquipmentData = null;
let editingEquipmentData = null;  // For equipment editor modal
let editingEquipmentLocations = [];  // Locations being edited

// Open exercise manager section
export function openExerciseManager() {

    // Close sidebar first
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.remove('open');
    }

    const section = document.getElementById('exercise-manager-section');
    if (section) {
        // Hide all other sections
        const sections = ['dashboard', 'workout-selector', 'active-workout', 'workout-history-section', 'stats-section', 'workout-management-section'];
        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        section.classList.remove('hidden');
        loadExercises();
    }
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
        // Clear the flag
        window.editingFromActiveWorkout = false;
    } else {
        // Show dashboard (normal behavior from exercise library)
        const dashboard = document.getElementById('dashboard');
        if (dashboard) {
            dashboard.classList.remove('hidden');
        }
    }
}

// Load exercises from AppState
async function loadExercises() {

    // Initialize workout manager if needed
    if (!workoutManager) {
        workoutManager = new FirebaseWorkoutManager(AppState);
    }

    if (!AppState.exerciseDatabase || AppState.exerciseDatabase.length === 0) {
        allExercises = [];
        filteredExercises = [];
        renderExercises();
        return;
    }

    allExercises = AppState.exerciseDatabase.map(exercise => ({
        id: exercise.id || `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: exercise.name || exercise.machine || 'Unnamed Exercise',
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
        isOverride: exercise.isOverride || false
    }));

    filteredExercises = [...allExercises];
    renderExercises();
}

// Render exercises to grid
function renderExercises() {
    const grid = document.getElementById('exercise-manager-grid');
    if (!grid) return;

    if (filteredExercises.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-dumbbell"></i>
                <p>No exercises found matching your criteria.</p>
                <button class="btn btn-primary" onclick="showAddExerciseModal()" style="margin-top: 1rem;">
                    <i class="fas fa-plus"></i> Add First Exercise
                </button>
            </div>
        `;
        return;
    }

    // Group exercises by body part
    const groupedExercises = {};
    filteredExercises.forEach(exercise => {
        const bodyPart = exercise.bodyPart || 'Other';
        if (!groupedExercises[bodyPart]) {
            groupedExercises[bodyPart] = [];
        }
        groupedExercises[bodyPart].push(exercise);
    });

    // Sort body parts alphabetically
    const sortedBodyParts = Object.keys(groupedExercises).sort();

    // Render grouped exercises (expanded by default)
    grid.innerHTML = sortedBodyParts.map(bodyPart => {
        const exercises = groupedExercises[bodyPart];

        const exerciseRows = exercises.map(exercise => {
            const badge = exercise.isOverride ?
                '<span class="exercise-type-badge badge-override">YOUR</span>' :
                exercise.isCustom ?
                '<span class="exercise-type-badge badge-custom">CUSTOM</span>' :
                '';

            return `
                <div class="exercise-manager-row" data-exercise-id="${exercise.id}">
                    <span class="exercise-manager-name">${exercise.name}</span>
                    ${badge}
                    <div class="exercise-manager-actions">
                        <button class="btn-icon" onclick="editExercise('${exercise.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="exercise-manager-group">
                <div class="exercise-manager-group-header">${bodyPart} <span class="exercise-count">${exercises.length}</span></div>
                <div class="exercise-manager-group-items">${exerciseRows}</div>
            </div>
        `;
    }).join('');
}

function getDeleteButton(exercise) {
    if (exercise.isOverride) {
        return `<button class="btn-icon btn-icon-warning" onclick="deleteExercise('${exercise.id}')" title="Revert to default">
            <i class="fas fa-undo"></i>
        </button>`;
    } else if (exercise.isCustom) {
        return `<button class="btn-icon btn-icon-danger" onclick="deleteExercise('${exercise.id}')" title="Delete exercise">
            <i class="fas fa-trash"></i>
        </button>`;
    } else {
        return `<button class="btn-icon" onclick="deleteExercise('${exercise.id}')" title="Hide exercise">
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

// Filter exercises
export function filterExerciseLibrary() {
    const searchTerm = document.getElementById('exercise-search-input')?.value.toLowerCase() || '';
    const bodyPartFilter = document.getElementById('exercise-body-part-filter')?.value || '';
    const equipmentFilter = document.getElementById('exercise-equipment-filter')?.value || '';

    filteredExercises = allExercises.filter(exercise => {
        const matchesSearch = !searchTerm ||
            exercise.name.toLowerCase().includes(searchTerm) ||
            exercise.bodyPart.toLowerCase().includes(searchTerm) ||
            exercise.equipmentType.toLowerCase().includes(searchTerm);
        const matchesBodyPart = !bodyPartFilter || exercise.bodyPart === bodyPartFilter;
        const matchesEquipment = !equipmentFilter || exercise.equipmentType === equipmentFilter;

        return matchesSearch && matchesBodyPart && matchesEquipment;
    });

    renderExercises();
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

// Open the edit exercise section (full screen)
export function openEditExerciseSection(exercise) {
    const section = document.getElementById('edit-exercise-section');
    const title = document.getElementById('edit-exercise-title');

    // Clear any previous selection state first
    selectedEquipmentId = null;
    selectedEquipmentData = null;

    // Hide all other sections
    const sections = ['dashboard', 'workout-selector', 'active-workout', 'workout-history-section',
                      'stats-section', 'workout-management-section', 'exercise-manager-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Also hide template editor modal if open (we'll show it again when returning)
    const templateModal = document.getElementById('template-editor-modal');
    if (templateModal) templateModal.classList.add('hidden');

    // Show/hide delete button container based on add vs edit
    const deleteContainer = document.getElementById('delete-exercise-container');

    // Set title based on add vs edit
    if (exercise) {
        currentEditingExercise = exercise;
        if (title) {
            // Special title for template exercise editing
            if (exercise.isTemplateExercise) {
                title.textContent = 'Edit Workout Exercise';
            } else {
                title.textContent = exercise.isOverride ? 'Edit Your Version' :
                                   exercise.isDefault ? 'Customize Exercise' :
                                   'Edit Exercise';
            }
        }
        populateEditForm(exercise);
        // Show delete button when editing (but not for template exercises)
        if (deleteContainer) {
            if (exercise.isTemplateExercise) {
                deleteContainer.classList.add('hidden');
            } else {
                deleteContainer.classList.remove('hidden');
            }
        }
    } else {
        currentEditingExercise = null;
        if (title) title.textContent = 'Add New Exercise';
        clearEditForm();
        // Hide delete button when adding new
        if (deleteContainer) deleteContainer.classList.add('hidden');
    }

    // Show the edit section
    if (section) section.classList.remove('hidden');

    // Populate equipment list for THIS exercise (will pre-select if exercise has equipment)
    const exerciseName = exercise?.name || exercise?.machine || null;
    populateEquipmentListForSection(exerciseName, exercise?.equipment, exercise?.equipmentLocation);

    // Focus on name field
    document.getElementById('edit-exercise-name')?.focus();
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
        const templateModal = document.getElementById('template-editor-modal');
        if (templateModal) templateModal.classList.remove('hidden');

        // Clear the flags (callback clears these, but do it here too for cancel case)
        window.editingFromTemplateEditor = false;
        window.templateExerciseEditCallback = null;
    } else if (window.editingFromActiveWorkout) {
        // Return to active workout - hide exercise manager section first
        const exerciseManager = document.getElementById('exercise-manager-section');
        if (exerciseManager) exerciseManager.classList.add('hidden');

        const activeWorkout = document.getElementById('active-workout');
        if (activeWorkout) activeWorkout.classList.remove('hidden');

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

// Populate the edit form with exercise data
function populateEditForm(exercise) {
    document.getElementById('edit-exercise-name').value = exercise.name || '';
    document.getElementById('edit-exercise-body-part').value = exercise.bodyPart || 'Chest';
    document.getElementById('edit-exercise-equipment-type').value = exercise.equipmentType || 'Machine';
    document.getElementById('edit-exercise-sets').value = exercise.sets || 3;
    document.getElementById('edit-exercise-reps').value = exercise.reps || 10;
    document.getElementById('edit-exercise-weight').value = exercise.weight || 50;
    document.getElementById('edit-exercise-video').value = exercise.video || '';
    document.getElementById('edit-equipment-video').value = exercise.equipmentVideo || '';
}

// Clear the edit form
function clearEditForm() {
    document.getElementById('edit-exercise-name').value = '';
    document.getElementById('edit-exercise-body-part').value = 'Chest';
    document.getElementById('edit-exercise-equipment-type').value = 'Machine';
    document.getElementById('edit-exercise-sets').value = 3;
    document.getElementById('edit-exercise-reps').value = 10;
    document.getElementById('edit-exercise-weight').value = 50;
    document.getElementById('edit-exercise-video').value = '';
    document.getElementById('edit-equipment-name').value = '';
    document.getElementById('edit-equipment-location').value = '';
    document.getElementById('edit-equipment-video').value = '';
}

// Populate equipment list for the full-screen edit section
// Only shows equipment that has been used with this specific exercise
async function populateEquipmentListForSection(exerciseName = null, preselectedEquipment = null, preselectedLocation = null) {
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
        listEl.innerHTML = exerciseEquipment.map(eq => {
            // Get locations from either array or single field
            let locationsList = [];
            if (eq.locations && Array.isArray(eq.locations)) {
                locationsList = eq.locations;
            } else if (eq.location) {
                locationsList = [eq.location];
            }
            const locationDisplay = locationsList.length > 0 ? locationsList.join(', ') : '';

            return `
            <div class="edit-equipment-item" data-equipment-id="${eq.id}" data-name="${eq.name}"
                 data-location="${locationDisplay}" data-equipment-json='${JSON.stringify(eq).replace(/'/g, "&#39;")}'>
                <div class="edit-equipment-item-info">
                    <div class="edit-equipment-item-name">${eq.name}</div>
                    ${locationDisplay ? `<div class="edit-equipment-item-location">${locationDisplay}</div>` : ''}
                </div>
                <button type="button" class="edit-equipment-item-edit" data-equipment-id="${eq.id}" title="Edit equipment">
                    <i class="fas fa-pen"></i>
                </button>
            </div>
        `}).join('');

        // Add click handlers for selection
        listEl.querySelectorAll('.edit-equipment-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.edit-equipment-item-edit')) return;
                selectEquipmentItemForSection(item);
            });
        });

        // Add click handlers for edit buttons
        listEl.querySelectorAll('.edit-equipment-item-edit').forEach(btn => {
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
    listEl?.querySelectorAll('.edit-equipment-item').forEach(i => i.classList.remove('selected'));

    // Mark as selected
    item.classList.add('selected');

    // Store selection data
    selectedEquipmentId = item.dataset.equipmentId;
    selectedEquipmentData = {
        name: item.dataset.name,
        location: item.dataset.location || null
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
    listEl?.querySelectorAll('.edit-equipment-item').forEach(i => i.classList.remove('selected'));

    // Hide display
    if (selectedDisplay) selectedDisplay.classList.add('hidden');
}

// Delete equipment item
async function deleteEquipmentItem(equipmentId) {
    if (!confirm('Delete this equipment? It will be removed from your saved equipment list.')) {
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
        const exerciseName = currentEditingExercise?.name || currentEditingExercise?.machine ||
                            document.getElementById('edit-exercise-name')?.value.trim() || null;
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
    const exerciseName = currentEditingExercise?.name || currentEditingExercise?.machine ||
                        document.getElementById('edit-exercise-name')?.value.trim() || null;

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
        const equipment = await workoutManager.getOrCreateEquipment(equipmentName, locationName, exerciseName, videoUrl);

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

        showNotification('Equipment added!', 'success');

    } catch (error) {
        console.error('❌ Error adding equipment:', error);
        showNotification('Error adding equipment', 'error');
    }
}

// Close add exercise modal
export function closeAddExerciseModal() {
    const modal = document.getElementById('add-exercise-modal');
    if (modal) modal.classList.add('hidden');
    currentEditingExercise = null;

    // If we were editing from active workout, close the entire exercise manager
    if (window.editingFromActiveWorkout) {
        closeExerciseManager();
    }
}

// Edit exercise - opens full-screen edit section
export function editExercise(exerciseId) {
    const exercise = allExercises.find(ex => ex.id === exerciseId);
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
        equipmentLocation: locationName || null
    };

    if (!formData.name) {
        alert('Please enter an exercise name');
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
                id: currentEditingExercise.id
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

        showNotification(isEditing ? 'Exercise updated!' : 'Exercise created!', 'success');
        closeAddExerciseModal();

        // Refresh AppState exercise database
        AppState.exerciseDatabase = await workoutManager.getExerciseLibrary();

        // Refresh exercise manager section if visible
        const managerSection = document.getElementById('exercise-manager-section');
        if (managerSection && !managerSection.classList.contains('hidden')) {
            await loadExercises();
        }

        // Also refresh the exercise-library-modal if it's open (used in workout management)
        const libraryModal = document.getElementById('exercise-library-modal');
        if (libraryModal && !libraryModal.classList.contains('hidden')) {
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
    const exercise = allExercises.find(ex => ex.id === exerciseId);
    if (!exercise) return;

    let confirmMessage;
    if (exercise.isDefault && !exercise.isOverride) {
        confirmMessage = `Hide "${exercise.name}" from your library? (You can unhide it later if needed)`;
    } else if (exercise.isOverride) {
        confirmMessage = `Revert "${exercise.name}" to default version? (This will remove your custom changes)`;
    } else if (exercise.isCustom) {
        confirmMessage = `Permanently delete "${exercise.name}"? This cannot be undone.`;
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
                exercise.isCustom ? 'Exercise deleted!' :
                exercise.isOverride ? 'Reverted to default!' :
                'Exercise hidden!',
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
        confirmMessage = `Permanently delete "${exercise.name}"? This cannot be undone.`;
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
                exercise.isCustom ? 'Exercise deleted!' :
                exercise.isOverride ? 'Reverted to default!' :
                'Exercise hidden!',
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
        bodyPart: document.getElementById('edit-exercise-body-part')?.value || 'Chest',
        equipmentType: document.getElementById('edit-exercise-equipment-type')?.value || 'Machine',
        sets: parseInt(document.getElementById('edit-exercise-sets')?.value) || 3,
        reps: parseInt(document.getElementById('edit-exercise-reps')?.value) || 10,
        weight: parseInt(document.getElementById('edit-exercise-weight')?.value) || 50,
        video: document.getElementById('edit-exercise-video')?.value.trim() || '',
        equipment: equipmentName || null,
        equipmentLocation: locationName || null,
        equipmentVideo: document.getElementById('edit-equipment-video')?.value.trim() || null
    };

    if (!formData.name) {
        showNotification('Please enter an exercise name', 'warning');
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
                id: currentEditingExercise.id
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

        showNotification(isEditing ? 'Exercise updated!' : 'Exercise created!', 'success');

        // Close section and return to exercise manager
        closeEditExerciseSection();

        // Refresh AppState exercise database
        AppState.exerciseDatabase = await workoutManager.getExerciseLibrary();

        // Refresh exercise manager section
        await loadExercises();

        // Also refresh the exercise-library-modal if it's open (used in workout management)
        const libraryModal = document.getElementById('exercise-library-modal');
        if (libraryModal && !libraryModal.classList.contains('hidden')) {
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
 * Open equipment editor modal
 * @param {Object} equipment - Equipment data with id, name, location(s), video
 */
export function openEquipmentEditor(equipment) {
    if (!equipment || !equipment.id) return;

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

    // Show modal
    const modal = document.getElementById('equipment-editor-modal');
    if (modal) modal.classList.remove('hidden');
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

    container.innerHTML = editingEquipmentLocations.map((loc, index) => `
        <div class="equipment-location-item">
            <span class="location-name">
                <i class="fas fa-map-marker-alt"></i>
                ${loc}
            </span>
            <button type="button" class="remove-location-btn" onclick="removeLocationFromEquipmentEditor(${index})" title="Remove location">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
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

        // Update the equipment
        await workoutManager.updateEquipment(editingEquipmentData.id, {
            name: name,
            video: video || null,
            locations: editingEquipmentLocations,
            location: null  // Clear old single location field
        });

        showNotification('Equipment saved!', 'success');
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
    if (!editingEquipmentData || !editingEquipmentData.id) return;

    const confirmed = confirm(`Delete "${editingEquipmentData.name}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
        if (!workoutManager) {
            workoutManager = new FirebaseWorkoutManager(AppState);
        }

        await workoutManager.deleteEquipment(editingEquipmentData.id);

        showNotification('Equipment deleted', 'success');
        closeEquipmentEditor();

        // Clear selection if this was the selected equipment
        if (selectedEquipmentId === editingEquipmentData.id) {
            selectedEquipmentId = null;
            selectedEquipmentData = null;
        }

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
 * Close equipment editor modal
 */
export function closeEquipmentEditor() {
    const modal = document.getElementById('equipment-editor-modal');
    if (modal) modal.classList.add('hidden');

    editingEquipmentData = null;
    editingEquipmentLocations = [];
}
