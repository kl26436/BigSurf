// Manual Workout Module - core/manual-workout.js
// Simplified flow: Select date → Pick workout from library OR create custom → Enter sets → Save

import { AppState } from './app-state.js';
import { showNotification } from './ui-helpers.js';

// ===================================================================
// STATE
// ===================================================================

let manualWorkoutState = {
    date: '',
    workoutType: '',      // Name of the workout
    category: '',
    isCustom: false,      // true if creating new custom workout
    exercises: [],        // Array of exercises with sets, equipment
    duration: 60,
    status: 'completed',
    notes: '',
    location: '',         // Gym location
    sourceTemplateId: null  // If from library, track which template
};

// ===================================================================
// MODAL MANAGEMENT
// ===================================================================

export function showAddManualWorkoutModal() {
    const modal = document.getElementById('add-manual-workout-modal');
    if (!modal) return;

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

    modal.classList.remove('hidden');
}

export function closeAddManualWorkoutModal() {
    const modal = document.getElementById('add-manual-workout-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    resetManualWorkoutState();
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
        sourceTemplateId: null
    };

    // Reset form inputs
    const inputs = ['manual-workout-name', 'manual-workout-notes'];
    inputs.forEach(id => {
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

        // Update header
        const titleDisplay = document.getElementById('manual-workout-title-display');
        const dateDisplay = document.getElementById('manual-workout-date-display');
        if (titleDisplay) titleDisplay.textContent = manualWorkoutState.workoutType || 'Your Workout';
        if (dateDisplay) dateDisplay.textContent = formatDateForDisplay(manualWorkoutState.date);

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
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const locations = await workoutManager.getLocations();

        // Clear existing options except first placeholder
        locationSelect.innerHTML = '<option value="">Select gym location...</option>';

        // Add locations
        locations.forEach(loc => {
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
        const activeTemplates = templates.filter(t => !t.isHidden && !t.deleted);

        if (activeTemplates.length === 0) {
            container.innerHTML = `
                <div class="no-workouts-message">
                    <p>No saved workouts found.</p>
                    <p>Create a custom workout instead!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = activeTemplates.map((template, index) => `
            <div class="manual-library-item" onclick="selectWorkoutForManual(${index})">
                <div class="library-item-name">
                    <i class="fas fa-dumbbell"></i>
                    ${template.name || template.day}
                </div>
                <div class="library-item-meta">
                    ${template.exercises?.length || 0} exercises
                </div>
                <i class="fas fa-chevron-right"></i>
            </div>
        `).join('');

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
    const activeTemplates = templates.filter(t => !t.isHidden && !t.deleted);
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
    manualWorkoutState.exercises = (template.exercises || []).map(ex => ({
        name: ex.name || ex.machine,
        bodyPart: ex.bodyPart || '',
        equipmentType: ex.equipmentType || '',
        defaultSets: ex.sets || 3,
        defaultReps: ex.reps || 10,
        defaultWeight: ex.weight || 0,
        sets: Array(ex.sets || 3).fill(null).map(() => ({
            reps: ex.reps || 10,
            weight: ex.weight || 0,
            completed: false
        })),
        notes: ''
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

    if (manualWorkoutState.exercises.length === 0) {
        container.innerHTML = `
            <div class="empty-exercises-state">
                <i class="fas fa-dumbbell"></i>
                <p>No exercises yet</p>
                <p class="hint">Click "Add Exercise" to get started</p>
            </div>
        `;
        return;
    }

    container.innerHTML = manualWorkoutState.exercises.map((exercise, exIndex) => {
        const equipmentDisplay = exercise.equipment
            ? `${exercise.equipment}${exercise.equipmentLocation ? ' @ ' + exercise.equipmentLocation : ''}`
            : 'No equipment';

        return `
        <div class="manual-exercise-card">
            <div class="manual-exercise-header">
                <div class="manual-exercise-title-row">
                    <h4>${exercise.name}</h4>
                    <button class="btn btn-danger btn-small" onclick="removeManualExercise(${exIndex})" title="Remove">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="manual-exercise-equipment" onclick="openEquipmentPickerForManual(${exIndex})">
                    <i class="fas fa-cog"></i>
                    <span>${equipmentDisplay}</span>
                    <i class="fas fa-pen"></i>
                </div>
            </div>
            <div class="manual-sets-grid">
                ${exercise.sets.map((set, setIndex) => `
                    <div class="manual-set-row">
                        <span class="set-label">Set ${setIndex + 1}</span>
                        <input type="number" class="mini-input" placeholder="Reps"
                               value="${set.reps || ''}"
                               onchange="updateManualSet(${exIndex}, ${setIndex}, 'reps', this.value)">
                        <span class="separator">×</span>
                        <input type="number" class="mini-input" placeholder="Weight"
                               value="${set.weight || ''}"
                               onchange="updateManualSet(${exIndex}, ${setIndex}, 'weight', this.value)">
                        <span class="unit">lbs</span>
                        <button class="btn btn-danger btn-tiny" onclick="removeManualSet(${exIndex}, ${setIndex})" title="Remove set">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-secondary btn-small add-set-btn" onclick="addManualSet(${exIndex})">
                <i class="fas fa-plus"></i> Add Set
            </button>
        </div>
    `}).join('');
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

    exercise.sets.push({
        reps: exercise.defaultReps || 10,
        weight: exercise.defaultWeight || 0,
        completed: false
    });

    renderManualExercises();
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
                weight: 0
            });
        }
    }
}

// Called by exercise library when exercise is selected
export function addExerciseToManualWorkout(exerciseData) {
    const exercise = typeof exerciseData === 'string' ? JSON.parse(exerciseData) : exerciseData;

    manualWorkoutState.exercises.push({
        name: exercise.name || exercise.machine,
        bodyPart: exercise.bodyPart || '',
        equipmentType: exercise.equipmentType || '',
        equipment: exercise.equipment || null,
        equipmentLocation: exercise.equipmentLocation || null,
        defaultSets: exercise.sets || 3,
        defaultReps: exercise.reps || 10,
        defaultWeight: exercise.weight || 0,
        sets: Array(exercise.sets || 3).fill(null).map(() => ({
            reps: exercise.reps || 10,
            weight: exercise.weight || 0,
            completed: false
        })),
        notes: ''
    });

    // Close exercise library if open
    if (window.exerciseLibrary?.close) {
        window.exerciseLibrary.close();
    }

    renderManualExercises();
    showNotification(`Added ${exercise.name || exercise.machine}`, 'success');
}

// Alias for backwards compatibility
export function addToManualWorkoutFromLibrary(exerciseData) {
    addExerciseToManualWorkout(exerciseData);
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
                exercises: manualWorkoutState.exercises.map(ex => ({
                    name: ex.name,
                    sets: ex.sets.length,
                    reps: ex.defaultReps,
                    weight: ex.defaultWeight,
                    equipment: ex.equipment,
                    equipmentLocation: ex.equipmentLocation
                }))
            },
            version: '2.0'
        };

        // Process exercises
        manualWorkoutState.exercises.forEach((exercise, index) => {
            const key = `exercise_${index}`;
            workoutData.exerciseNames[key] = exercise.name;
            workoutData.exercises[key] = {
                sets: exercise.sets.map(s => ({
                    reps: s.reps || 0,
                    weight: s.weight || 0,
                    originalUnit: 'lbs'
                })),
                notes: exercise.notes || '',
                completed: true,
                equipment: exercise.equipment || null,
                equipmentLocation: exercise.equipmentLocation || null
            };
        });

        // Save to Firebase
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
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
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);

        const templateData = {
            name: manualWorkoutState.workoutType,
            day: manualWorkoutState.workoutType,
            category: manualWorkoutState.category,
            exercises: manualWorkoutState.exercises.map(ex => ({
                name: ex.name,
                machine: ex.name,
                bodyPart: ex.bodyPart,
                equipmentType: ex.equipmentType,
                sets: ex.sets.length,
                reps: ex.defaultReps || 10,
                weight: ex.defaultWeight || 0
            })),
            isDefault: false,
            isHidden: false,
            createdAt: new Date().toISOString()
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

    // Get the equipment picker modal
    const modal = document.getElementById('equipment-picker-modal');
    if (!modal) {
        console.error('❌ Equipment picker modal not found');
        return;
    }

    // Load available equipment
    try {
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const equipmentList = await workoutManager.getEquipment();

        const listContainer = document.getElementById('equipment-picker-list');
        if (listContainer) {
            if (equipmentList.length === 0) {
                listContainer.innerHTML = '<p class="empty-state">No equipment saved yet</p>';
            } else {
                listContainer.innerHTML = equipmentList.map(eq => `
                    <div class="equipment-picker-item" onclick="selectEquipmentForManual('${eq.id}', '${(eq.name || '').replace(/'/g, "\\'")}', '${(eq.location || '').replace(/'/g, "\\'")}')">
                        <i class="fas fa-cog"></i>
                        <div class="equipment-info">
                            <span class="equipment-name">${eq.name || 'Unknown'}</span>
                            ${eq.location ? `<span class="equipment-location">@ ${eq.location}</span>` : ''}
                        </div>
                    </div>
                `).join('');
            }
        }

        modal.classList.remove('hidden');
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
    if (modal) modal.classList.add('hidden');

    manualEquipmentEditIndex = null;

    // Re-render to show updated equipment
    renderManualExercises();
    showNotification(`Equipment set: ${name}`, 'success');
}

export function closeEquipmentPickerForManual() {
    const modal = document.getElementById('equipment-picker-modal');
    if (modal) modal.classList.add('hidden');
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
