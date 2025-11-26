// Exercise Manager UI Module
// Handles the integrated exercise manager modal

import { AppState } from './app-state.js';
import { showNotification } from './ui-helpers.js';

let allExercises = [];
let filteredExercises = [];
let currentEditingExercise = null;

// Open exercise manager modal
export function openExerciseManager() {
    console.log('📚 Opening exercise manager...');
    const modal = document.getElementById('exercise-manager-modal');
    if (modal) {
        modal.classList.remove('hidden');
        loadExercises();
    }
}

// Close exercise manager modal
export function closeExerciseManager() {
    const modal = document.getElementById('exercise-manager-modal');
    if (modal) {
        modal.classList.add('hidden');
    }

    // Hide legacy workout selector if it's showing
    const workoutSelector = document.getElementById('workout-selector');
    if (workoutSelector && !workoutSelector.classList.contains('hidden')) {
        workoutSelector.classList.add('hidden');
    }

    // Check which section should be visible
    const dashboardSection = document.getElementById('dashboard');
    const workoutSection = document.getElementById('active-workout');
    const historySection = document.getElementById('workout-history-section');

    // If no other section is visible, default to dashboard
    const anyVisible = dashboardSection && !dashboardSection.classList.contains('hidden') ||
                      workoutSection && !workoutSection.classList.contains('hidden') ||
                      historySection && !historySection.classList.contains('hidden');

    if (!anyVisible && dashboardSection) {
        dashboardSection.classList.remove('hidden');
    }
}

// Load exercises from AppState
async function loadExercises() {
    console.log('🔄 Loading exercises from library...');

    if (!AppState.exerciseDatabase || AppState.exerciseDatabase.length === 0) {
        console.log('⚠️ No exercises in database');
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

    console.log(`✅ Loaded ${allExercises.length} exercises`);
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

    grid.innerHTML = filteredExercises.map(exercise => {
        const exerciseTypeClass = exercise.isOverride ? 'override' : exercise.isCustom ? 'custom' : '';
        const badge = exercise.isOverride ?
            '<span class="exercise-type-badge badge-override">YOUR VERSION</span>' :
            exercise.isCustom ?
            '<span class="exercise-type-badge badge-custom">CUSTOM</span>' :
            '<span class="exercise-type-badge badge-default">DEFAULT</span>';

        const deleteButton = getDeleteButton(exercise);

        return `
            <div class="exercise-card ${exerciseTypeClass}">
                <h4>
                    ${exercise.name}
                    ${badge}
                </h4>

                <div class="exercise-meta">
                    <span class="meta-tag"><i class="fas fa-muscle"></i> ${exercise.bodyPart}</span>
                    <span class="meta-tag"><i class="fas fa-dumbbell"></i> ${exercise.equipmentType}</span>
                </div>

                <div class="exercise-stats">
                    <div class="stat">
                        <div class="stat-value">${exercise.sets}</div>
                        <div class="stat-label">Sets</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${exercise.reps}</div>
                        <div class="stat-label">Reps</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${exercise.weight}</div>
                        <div class="stat-label">lbs</div>
                    </div>
                </div>

                ${exercise.video ? `
                    <div style="margin-bottom: 0.75rem;">
                        <a href="${exercise.video}" target="_blank" class="btn btn-secondary btn-sm">
                            <i class="fas fa-play"></i> Video
                        </a>
                    </div>
                ` : ''}

                <div class="exercise-actions">
                    <button class="btn btn-secondary" onclick="editExercise('${exercise.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    ${deleteButton}
                </div>
            </div>
        `;
    }).join('');
}

function getDeleteButton(exercise) {
    if (exercise.isOverride) {
        return `<button class="btn btn-warning" onclick="deleteExercise('${exercise.id}')">
            <i class="fas fa-undo"></i> Revert
        </button>`;
    } else if (exercise.isCustom) {
        return `<button class="btn btn-danger" onclick="deleteExercise('${exercise.id}')">
            <i class="fas fa-trash"></i> Delete
        </button>`;
    } else {
        return `<button class="btn btn-secondary" onclick="deleteExercise('${exercise.id}')">
            <i class="fas fa-eye-slash"></i> Hide
        </button>`;
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
    showNotification('Refreshing exercises...', 'info');
    loadExercises();
    showNotification('Exercises refreshed!', 'success');
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
        showNotification('Please enter an exercise name', 'warning');
        return;
    }

    try {
        // TODO: Implement actual save to Firebase using FirebaseWorkoutManager
        showNotification(`Exercise "${formData.name}" saved! (Firebase integration pending)`, 'info');

        closeAddExerciseModal();
        await refreshExerciseLibrary();

    } catch (error) {
        console.error('❌ Error saving exercise:', error);
        showNotification('Error saving exercise', 'error');
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
            // TODO: Implement actual delete using FirebaseWorkoutManager
            showNotification(`Exercise "${exercise.name}" removed! (Firebase integration pending)`, 'info');

            // Remove from local array for now
            allExercises = allExercises.filter(ex => ex.id !== exerciseId);
            filterExerciseLibrary();

        } catch (error) {
            console.error('❌ Error deleting exercise:', error);
            showNotification('Error processing request', 'error');
        }
    }
}
