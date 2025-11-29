// Exercise Manager UI Module
// Handles the integrated exercise manager modal

import { AppState } from './app-state.js';
import { showNotification } from './ui-helpers.js';
import { FirebaseWorkoutManager } from './firebase-workout-manager.js';

let allExercises = [];
let filteredExercises = [];
let currentEditingExercise = null;
let workoutManager = null;

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

    // Render grouped exercises with collapsible sections
    grid.innerHTML = sortedBodyParts.map(bodyPart => {
        const exercises = groupedExercises[bodyPart];
        const groupId = `group-${bodyPart.toLowerCase().replace(/\s+/g, '-')}`;

        const exerciseCards = exercises.map(exercise => {
            const exerciseTypeClass = exercise.isOverride ? 'override' : exercise.isCustom ? 'custom' : '';
            const badge = exercise.isOverride ?
                '<span class="exercise-type-badge badge-override">YOUR</span>' :
                exercise.isCustom ?
                '<span class="exercise-type-badge badge-custom">CUSTOM</span>' :
                '';

            const deleteButton = getDeleteButton(exercise);

            return `
                <div class="exercise-card ${exerciseTypeClass}">
                    <div class="exercise-card-header">
                        <h5>${exercise.name}</h5>
                        ${badge}
                    </div>
                    <div class="exercise-card-stats">
                        <span>${exercise.sets}×${exercise.reps}</span>
                        <span>${exercise.weight} lbs</span>
                        <span class="equipment-tag">${exercise.equipmentType}</span>
                    </div>
                    <div class="exercise-card-actions">
                        <button class="btn-icon" onclick="editExercise('${exercise.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${deleteButton}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="exercise-group">
                <button class="exercise-group-header" onclick="toggleExerciseGroup('${groupId}')">
                    <div class="group-header-content">
                        <h3>${bodyPart}</h3>
                        <span class="exercise-count">${exercises.length}</span>
                    </div>
                    <i class="fas fa-chevron-down group-toggle-icon"></i>
                </button>
                <div class="exercise-group-grid collapsed" id="${groupId}">
                    ${exerciseCards}
                </div>
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
export function refreshExerciseLibrary() {
    loadExercises();
}

// Show add exercise modal
export function showAddExerciseModal() {
    currentEditingExercise = null;
    const modal = document.getElementById('add-exercise-modal');
    const title = document.getElementById('add-exercise-modal-title');
    const form = document.getElementById('add-exercise-form');

    if (title) title.textContent = 'Add New Exercise';
    if (form) form.reset();
    if (modal) modal.classList.remove('hidden');

    document.getElementById('new-exercise-name')?.focus();
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

// Edit exercise
export function editExercise(exerciseId) {
    const exercise = allExercises.find(ex => ex.id === exerciseId);
    if (!exercise) return;

    currentEditingExercise = exercise;

    // Populate form
    const nameInput = document.getElementById('new-exercise-name');
    const bodyPartSelect = document.getElementById('new-exercise-body-part');
    const equipmentSelect = document.getElementById('new-exercise-equipment');
    const setsInput = document.getElementById('new-exercise-sets');
    const repsInput = document.getElementById('new-exercise-reps');
    const weightInput = document.getElementById('new-exercise-weight');
    const videoInput = document.getElementById('new-exercise-video');

    if (nameInput) nameInput.value = exercise.name;
    if (bodyPartSelect) bodyPartSelect.value = exercise.bodyPart;
    if (equipmentSelect) equipmentSelect.value = exercise.equipmentType;
    if (setsInput) setsInput.value = exercise.sets;
    if (repsInput) repsInput.value = exercise.reps;
    if (weightInput) weightInput.value = exercise.weight;
    if (videoInput) videoInput.value = exercise.video || '';

    const title = document.getElementById('add-exercise-modal-title');
    if (title) {
        title.textContent = exercise.isOverride ? 'Edit Your Version' :
                           exercise.isDefault ? 'Customize Exercise' :
                           'Edit Exercise';
    }

    const modal = document.getElementById('add-exercise-modal');
    if (modal) modal.classList.remove('hidden');

    nameInput?.focus();
}

// Save exercise
export async function saveExercise(event) {
    event.preventDefault();

    const formData = {
        name: document.getElementById('new-exercise-name')?.value.trim() || '',
        bodyPart: document.getElementById('new-exercise-body-part')?.value || 'Chest',
        equipmentType: document.getElementById('new-exercise-equipment')?.value || 'Machine',
        sets: parseInt(document.getElementById('new-exercise-sets')?.value) || 3,
        reps: parseInt(document.getElementById('new-exercise-reps')?.value) || 10,
        weight: parseInt(document.getElementById('new-exercise-weight')?.value) || 50,
        video: document.getElementById('new-exercise-video')?.value.trim() || ''
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

        await workoutManager.saveCustomExercise(formData, false);

        closeAddExerciseModal();
        await refreshExerciseLibrary();

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

            // Delete from Firebase
            if (exercise.isCustom) {
                await workoutManager.deleteCustomExercise(exerciseId);
            } else if (exercise.isOverride) {
                await workoutManager.deleteExerciseOverride(exerciseId);
            } else {
                await workoutManager.hideDefaultExercise(exerciseId);
            }

            // Refresh the exercise library
            await refreshExerciseLibrary();

        } catch (error) {
            console.error('❌ Error deleting exercise:', error);
            alert('Error processing request: ' + error.message);
        }
    }
}
