// Manual Workout Management Module - core/manual-workout.js
// Handles manual workout creation, separate workflow from template-based workouts

import { AppState } from './app-state.js';
import { showNotification } from './ui-helpers.js';
import { saveWorkoutData } from './data-manager.js';

// ===================================================================
// MANUAL WORKOUT STATE
// ===================================================================

let currentManualWorkout = {
    date: '',
    category: '',
    name: '',
    duration: 60,
    status: 'completed',
    notes: '',
    exercises: []
};

let currentManualExerciseIndex = null;
let manualExerciseUnit = 'lbs';

// ===================================================================
// MANUAL WORKOUT MODAL MANAGEMENT
// ===================================================================

export function showAddManualWorkoutModal() {
    const modal = document.getElementById('add-manual-workout-modal');
    if (!modal) return;
    
    // Reset to step 1
    showManualWorkoutStep(1);
    
    // Set default date to today
    const dateInput = document.getElementById('manual-workout-date');
    if (dateInput) {
        dateInput.value = AppState.getTodayDateString();
    }
    
    // Clear form
    resetManualWorkoutForm();
    
    modal.classList.remove('hidden');
}

export function closeAddManualWorkoutModal() {
    const modal = document.getElementById('add-manual-workout-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    
    // Reset state
    resetManualWorkoutForm();
    currentManualExerciseIndex = null;
}

function resetManualWorkoutForm() {
    currentManualWorkout = {
        date: AppState.getTodayDateString(),
        category: '',
        name: '',
        duration: 60,
        status: 'completed',
        notes: '',
        exercises: []
    };
    
    // Clear form inputs
    const inputs = ['manual-workout-name', 'manual-workout-notes'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
    
    const categorySelect = document.getElementById('manual-workout-category');
    if (categorySelect) categorySelect.value = '';
    
    const durationInput = document.getElementById('manual-workout-duration');
    if (durationInput) durationInput.value = '60';
}

// ===================================================================
// MANUAL WORKOUT STEP NAVIGATION
// ===================================================================

export function proceedToExerciseSelection() {
    // Validate step 1
    const name = document.getElementById('manual-workout-name')?.value.trim();
    const category = document.getElementById('manual-workout-category')?.value;
    const date = document.getElementById('manual-workout-date')?.value;
    
    if (!name) {
        showNotification('Please enter a workout name', 'warning');
        return;
    }
    
    if (!category) {
        showNotification('Please select a category', 'warning');
        return;
    }
    
    if (!date) {
        showNotification('Please select a date', 'warning');
        return;
    }
    
    // Update manual workout state
    currentManualWorkout.name = name;
    currentManualWorkout.category = category;
    currentManualWorkout.date = date;
    currentManualWorkout.duration = parseInt(document.getElementById('manual-workout-duration')?.value) || 60;
    currentManualWorkout.notes = document.getElementById('manual-workout-notes')?.value || '';
    
    showManualWorkoutStep(2);
}

export function backToBasicInfo() {
    showManualWorkoutStep(1);
}

function showManualWorkoutStep(step) {
    const step1 = document.getElementById('manual-workout-step-1');
    const step2 = document.getElementById('manual-workout-step-2');
    
    if (step === 1) {
        if (step1) step1.classList.remove('hidden');
        if (step2) step2.classList.add('hidden');
    } else if (step === 2) {
        if (step1) step1.classList.add('hidden');
        if (step2) step2.classList.remove('hidden');
        renderManualExerciseList();
    }
}

// ===================================================================
// MANUAL WORKOUT CORE OPERATIONS
// ===================================================================

export async function submitManualWorkout() {
    if (!AppState.currentUser) {
        showNotification('Please sign in to add workouts', 'warning');
        return;
    }
    
    // Validate workout data
    if (!currentManualWorkout.name || !currentManualWorkout.category) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }
    
    if (currentManualWorkout.exercises.length === 0) {
        showNotification('Please add at least one exercise', 'warning');
        return;
    }
    
    try {
        // Prepare workout data for Firebase
        const workoutData = {
            workoutType: currentManualWorkout.name,
            category: currentManualWorkout.category,
            date: currentManualWorkout.date,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            isManual: true,
            status: 'completed',
            totalDuration: currentManualWorkout.duration * 60, // Convert to seconds
            notes: currentManualWorkout.notes,
            exercises: {},
            exerciseNames: {},
            originalWorkout: {
                exercises: currentManualWorkout.exercises
            },
            version: '2.0'
        };
        
        // Process exercises
        currentManualWorkout.exercises.forEach((exercise, index) => {
            const exerciseKey = `exercise_${index}`;
            workoutData.exerciseNames[exerciseKey] = exercise.name;
            workoutData.exercises[exerciseKey] = {
                sets: exercise.sets || [],
                notes: exercise.notes || '',
                completed: exercise.manuallyCompleted || false
            };
        });
        
        // Save to Firebase using the data manager
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        
        // Use the date as the document ID for consistency
        await workoutManager.saveWorkoutData(workoutData);
        
        showNotification(`Manual workout "${currentManualWorkout.name}" added successfully!`, 'success');
        
        // Close modal and reset
        closeAddManualWorkoutModal();
        
        // Refresh history if it's currently shown
        if (window.workoutHistory && !document.getElementById('workout-history-section')?.classList.contains('hidden')) {
            await window.workoutHistory.loadHistory();
        }
        
    } catch (error) {
        console.error('Error adding manual workout:', error);
        showNotification('Error adding workout. Please try again.', 'error');
    }
}

export function finishManualWorkout() {
    // Mark all exercises as manually completed
    currentManualWorkout.exercises.forEach(exercise => {
        exercise.manuallyCompleted = true;
    });
    
    submitManualWorkout();
}

export async function loadWorkoutTemplate() {
    if (!AppState.currentUser) {
        alert('Please sign in to load templates');
        return;
    }

    // Get available templates
    const templates = AppState.workoutPlans || [];

    if (templates.length === 0) {
        alert('No workout templates available');
        return;
    }

    // Create a simple selection dialog
    const templateNames = templates.map((t, i) => `${i + 1}. ${t.name || t.day}`).join('\n');
    const selection = prompt(`Select a template to load:\n\n${templateNames}\n\nEnter the number:`);

    if (!selection) return; // User cancelled

    const index = parseInt(selection) - 1;
    if (index < 0 || index >= templates.length) {
        alert('Invalid selection');
        return;
    }

    const template = templates[index];

    // Load exercises from template into manual workout
    currentManualWorkout.exercises = template.exercises.map(ex => ({
        name: ex.name || ex.machine,
        bodyPart: ex.bodyPart || '',
        equipmentType: ex.equipmentType || '',
        sets: Array(ex.sets || 3).fill(null).map(() => ({
            reps: ex.reps || 10,
            weight: ex.weight || 50,
            completed: false
        })),
        notes: '',
        manuallyCompleted: false
    }));

    // Update UI
    renderManualExerciseList();
    console.log(`✅ Loaded ${currentManualWorkout.exercises.length} exercises from template "${template.name || template.day}"`);
}

// ===================================================================
// MANUAL EXERCISE MANAGEMENT
// ===================================================================

export function addExerciseToManualWorkout() {
    if (!AppState.currentUser) {
        showNotification('Please sign in to add exercises', 'warning');
        return;
    }
    
    // Open exercise library for manual workout
    if (window.exerciseLibrary && window.exerciseLibrary.openForManualWorkout) {
        window.exerciseLibrary.openForManualWorkout();
    } else {
        console.log('📚 Using fallback method to open exercise library');
        showNotification('Exercise library opened - select exercises manually', 'info');
    }
}

export function addToManualWorkoutFromLibrary(exerciseData) {
    try {
        let exercise;
        try {
            exercise = typeof exerciseData === 'string' ? JSON.parse(exerciseData) : exerciseData;
        } catch (e) {
            console.error('Error parsing exercise data:', e);
            return;
        }
        
        // Create exercise entry for manual workout
        const exerciseEntry = {
            name: exercise.name || exercise.machine,
            bodyPart: exercise.bodyPart || '',
            equipmentType: exercise.equipmentType || '',
            sets: [
                // Add default sets based on exercise defaults
                ...Array(exercise.sets || 3).fill(null).map(() => ({
                    reps: exercise.reps || 10,
                    weight: exercise.weight || 50,
                    completed: false
                }))
            ],
            notes: '',
            manuallyCompleted: false
        };
        
        // Add to manual workout
        currentManualWorkout.exercises.push(exerciseEntry);
        
        // Update UI
        renderManualExerciseList();
        
        // Close exercise library
        if (window.exerciseLibrary && window.exerciseLibrary.close) {
            window.exerciseLibrary.close();
        }
        
        showNotification(`Added "${exerciseEntry.name}" to manual workout!`, 'success');
        
    } catch (error) {
        console.error('Error adding exercise to manual workout:', error);
        showNotification('Error adding exercise to manual workout', 'error');
    }
}

export function editManualExercise(index) {
    currentManualExerciseIndex = index;
    const exercise = currentManualWorkout.exercises[index];
    
    if (!exercise) return;
    
    // Show exercise entry modal
    const modal = document.getElementById('manual-exercise-entry-modal');
    if (!modal) return;
    
    // Populate form
    const nameInput = document.getElementById('manual-exercise-entry-name');
    const notesInput = document.getElementById('manual-exercise-entry-notes');
    
    if (nameInput) nameInput.value = exercise.name;
    if (notesInput) notesInput.value = exercise.notes || '';
    
    // Render sets
    renderManualExerciseSets();
    
    modal.classList.remove('hidden');
}

export function removeManualExercise(index) {
    const exercise = currentManualWorkout.exercises[index];
    if (!exercise) return;
    
    if (confirm(`Remove "${exercise.name}" from this workout?`)) {
        currentManualWorkout.exercises.splice(index, 1);
        renderManualExerciseList();
        showNotification(`Removed "${exercise.name}" from workout`, 'info');
    }
}

export function closeManualExerciseEntry() {
    const modal = document.getElementById('manual-exercise-entry-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    
    currentManualExerciseIndex = null;
}

// ===================================================================
// MANUAL SET MANAGEMENT
// ===================================================================

export function updateManualSet(exerciseIndex, setIndex, field, value) {
    const exercise = currentManualWorkout.exercises[exerciseIndex];
    if (!exercise || !exercise.sets[setIndex]) return;
    
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
        exercise.sets[setIndex][field] = numValue;
    } else {
        exercise.sets[setIndex][field] = null;
    }
    
    // Mark set as completed if both reps and weight are filled
    exercise.sets[setIndex].completed = 
        exercise.sets[setIndex].reps && exercise.sets[setIndex].weight;
    
    renderManualExerciseList();
}

export function updateManualExerciseNotes(exerciseIndex) {
    const notesInput = document.getElementById('manual-exercise-entry-notes');
    if (!notesInput || currentManualExerciseIndex !== exerciseIndex) return;
    
    const exercise = currentManualWorkout.exercises[exerciseIndex];
    if (exercise) {
        exercise.notes = notesInput.value;
        showNotification('Notes updated', 'success');
    }
}

export function addSetToManualExercise(exerciseIndex) {
    const exercise = currentManualWorkout.exercises[exerciseIndex];
    if (!exercise) return;
    
    exercise.sets.push({
        reps: null,
        weight: null,
        completed: false
    });
    
    if (currentManualExerciseIndex === exerciseIndex) {
        renderManualExerciseSets();
    }
    
    renderManualExerciseList();
    showNotification('Set added', 'success');
}

export function removeSetFromManualExercise(exerciseIndex, setIndex) {
    const exercise = currentManualWorkout.exercises[exerciseIndex];
    if (!exercise || exercise.sets.length <= 1) {
        showNotification('Exercise must have at least one set', 'warning');
        return;
    }
    
    exercise.sets.splice(setIndex, 1);
    
    if (currentManualExerciseIndex === exerciseIndex) {
        renderManualExerciseSets();
    }
    
    renderManualExerciseList();
    showNotification('Set removed', 'info');
}

export function markManualExerciseComplete(exerciseIndex) {
    const exercise = currentManualWorkout.exercises[exerciseIndex];
    if (!exercise) return;
    
    exercise.manuallyCompleted = !exercise.manuallyCompleted;
    
    // If marking complete, ensure all sets have data
    if (exercise.manuallyCompleted) {
        exercise.sets.forEach(set => {
            if (!set.reps) set.reps = 10;
            if (!set.weight) set.weight = 50;
            set.completed = true;
        });
    }
    
    renderManualExerciseList();
    
    const status = exercise.manuallyCompleted ? 'completed' : 'incomplete';
    showNotification(`Exercise marked as ${status}`, 'success');
}

// ===================================================================
// MANUAL WORKOUT RENDERING
// ===================================================================

export function renderManualExerciseList() {
    const container = document.getElementById('manual-exercise-list');
    if (!container) return;
    
    if (currentManualWorkout.exercises.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-dumbbell"></i>
                <h3>No exercises added yet</h3>
                <p>Click "Add Exercise" to get started.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    currentManualWorkout.exercises.forEach((exercise, index) => {
        const card = createManualExerciseCard(exercise, index);
        container.appendChild(card);
    });
}

export function createManualExerciseCard(exercise, index) {
    const card = document.createElement('div');
    card.className = `manual-exercise-card ${exercise.manuallyCompleted ? 'completed' : ''}`;
    
    const completedSets = exercise.sets.filter(set => set.completed).length;
    const totalSets = exercise.sets.length;
    
    card.innerHTML = `
        <div class="exercise-header">
            <div class="exercise-info">
                <h4>${exercise.name}</h4>
                <div class="exercise-meta">
                    <span class="exercise-progress">${completedSets}/${totalSets} sets</span>
                    ${exercise.bodyPart ? `<span class="body-part">${exercise.bodyPart}</span>` : ''}
                    ${exercise.manuallyCompleted ? '<span class="completed-badge">✓ Complete</span>' : ''}
                </div>
            </div>
            <div class="exercise-actions">
                <button class="btn btn-secondary btn-small" onclick="editManualExercise(${index})" title="Edit exercise">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn ${exercise.manuallyCompleted ? 'btn-warning' : 'btn-success'} btn-small" 
                        onclick="markManualExerciseComplete(${index})" 
                        title="${exercise.manuallyCompleted ? 'Mark incomplete' : 'Mark complete'}">
                    <i class="fas fa-${exercise.manuallyCompleted ? 'undo' : 'check'}"></i>
                </button>
                <button class="btn btn-danger btn-small" onclick="removeManualExercise(${index})" title="Remove exercise">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <div class="manual-sets-preview">
            ${renderManualSetsPreview(exercise, index)}
        </div>
        ${exercise.notes ? `<div class="exercise-notes-preview">${exercise.notes}</div>` : ''}
    `;
    
    return card;
}

function renderManualSetsPreview(exercise, exerciseIndex) {
    let html = '<div class="sets-preview">';
    
    exercise.sets.forEach((set, setIndex) => {
        const isCompleted = set.completed || (set.reps && set.weight);
        
        html += `
            <div class="set-preview ${isCompleted ? 'completed' : ''}">
                <span class="set-number">${setIndex + 1}</span>
                <input type="number" 
                       class="mini-input" 
                       placeholder="Reps" 
                       value="${set.reps || ''}"
                       onchange="updateManualSet(${exerciseIndex}, ${setIndex}, 'reps', this.value)">
                <span>×</span>
                <input type="number" 
                       class="mini-input" 
                       placeholder="Wt" 
                       value="${set.weight || ''}"
                       onchange="updateManualSet(${exerciseIndex}, ${setIndex}, 'weight', this.value)">
                <span class="unit">${manualExerciseUnit}</span>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

function renderManualExerciseSets() {
    if (currentManualExerciseIndex === null) return;
    
    const container = document.getElementById('manual-exercise-sets-container');
    if (!container) return;
    
    const exercise = currentManualWorkout.exercises[currentManualExerciseIndex];
    if (!exercise) return;
    
    container.innerHTML = '';
    
    exercise.sets.forEach((set, setIndex) => {
        const setElement = document.createElement('div');
        setElement.className = `manual-set-row ${set.completed ? 'completed' : ''}`;
        
        setElement.innerHTML = `
            <span class="set-number">${setIndex + 1}</span>
            <input type="number" 
                   class="set-input" 
                   placeholder="Reps" 
                   value="${set.reps || ''}"
                   onchange="updateManualSet(${currentManualExerciseIndex}, ${setIndex}, 'reps', this.value)">
            <span class="separator">×</span>
            <input type="number" 
                   class="set-input" 
                   placeholder="Weight" 
                   value="${set.weight || ''}"
                   onchange="updateManualSet(${currentManualExerciseIndex}, ${setIndex}, 'weight', this.value)">
            <span class="unit">${manualExerciseUnit}</span>
            <button class="btn btn-danger btn-small" onclick="removeSetFromManualExercise(${currentManualExerciseIndex}, ${setIndex})">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        container.appendChild(setElement);
    });
    
    // Add "Add Set" button
    const addSetButton = document.createElement('button');
    addSetButton.className = 'btn btn-secondary';
    addSetButton.innerHTML = '<i class="fas fa-plus"></i> Add Set';
    addSetButton.onclick = () => addSetToManualExercise(currentManualExerciseIndex);
    
    container.appendChild(addSetButton);
}

// ===================================================================
// MANUAL WORKOUT UTILITIES
// ===================================================================

function validateManualWorkoutData() {
    if (!currentManualWorkout.name || !currentManualWorkout.category) {
        return false;
    }
    
    if (currentManualWorkout.exercises.length === 0) {
        return false;
    }
    
    return true;
}

function calculateManualWorkoutDuration() {
    // Estimate duration based on sets and exercises
    let totalSets = 0;
    currentManualWorkout.exercises.forEach(exercise => {
        totalSets += exercise.sets.length;
    });
    
    // Estimate 2 minutes per set
    return Math.max(30, totalSets * 2);
}

// ===================================================================
// EXPORT STATE GETTERS (for coordination with main.js)
// ===================================================================

export function getCurrentManualWorkout() {
    return { ...currentManualWorkout };
}

export function getCurrentManualExerciseIndex() {
    return currentManualExerciseIndex;
}

export function getManualExerciseUnit() {
    return manualExerciseUnit;
}

export function setManualExerciseUnit(unit) {
    manualExerciseUnit = unit;
}