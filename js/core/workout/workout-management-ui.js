// Workout Management UI Functions
import { AppState } from '../app-state.js';
import { FirebaseWorkoutManager } from '../firebase-workout-manager.js';
import { showNotification } from '../ui-helpers.js';

let workoutManager;
let currentEditingTemplate = null;
let exerciseLibrary = [];
let filteredExercises = [];

export function initializeWorkoutManagement(appState) {
    workoutManager = new FirebaseWorkoutManager(appState);

    // Listen for exercise library updates from exercise-manager-ui
    window.addEventListener('exerciseLibraryUpdated', async () => {
        const libraryModal = document.getElementById('exercise-library-modal');
        if (libraryModal && !libraryModal.classList.contains('hidden')) {
            exerciseLibrary = await workoutManager.getExerciseLibrary();
            filteredExercises = [...exerciseLibrary];
            renderExerciseLibrary();
        }
    });
}

// Main navigation functions
export async function showWorkoutManagement() {

    const section = document.getElementById('workout-management-section');
    if (!section) {
        console.error('❌ Workout management section not found');
        return;
    }

    // Hide all other sections
    const sections = ['dashboard', 'workout-selector', 'active-workout', 'workout-history-section', 'stats-section', 'exercise-manager-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Show workout management section
    section.classList.remove('hidden');

    // Load all templates (unified list)
    setTimeout(() => {
        loadAllTemplates();
    }, 100);
}

export function closeWorkoutManagement() {

    const section = document.getElementById('workout-management-section');
    if (section) {
        section.classList.add('hidden');
    }

    // Show dashboard
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        dashboard.classList.remove('hidden');
    }
}

export function hideWorkoutManagement() {
    const workoutManagement = document.getElementById('workout-management');
    const templateEditor = document.getElementById('template-editor');
    
    if (workoutManagement) workoutManagement.classList.add('hidden');
    if (templateEditor) templateEditor.classList.add('hidden');
    
    currentEditingTemplate = null;
}

// Template management functions
async function loadWorkoutTemplates() {
    const templateList = document.getElementById('template-list');
    if (!templateList) return;
    
    templateList.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading templates...</span></div>';
    
    try {
        const templates = await workoutManager.getUserWorkoutTemplates();
        
        if (templates.length === 0) {
            templateList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-dumbbell"></i>
                    <h3>No Workouts</h3>
                    <p>Create your first workout to get started.</p>
                </div>
            `;
            return;
        }
        
        templateList.innerHTML = '';
        templates.forEach(template => {
            const card = createTemplateCard(template);
            templateList.appendChild(card);
        });
        
    } catch (error) {
        console.error('❌ Error loading templates:', error);
        templateList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Templates</h3>
                <p>Please try again later.</p>
            </div>
        `;
    }
}

// Load all templates in a unified list (both default and custom)
async function loadAllTemplates() {
    const container = document.getElementById('all-templates');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading templates...</span></div>';

    try {
        // Load all templates (Firebase manager filters out hidden defaults)
        const templates = await workoutManager.getUserWorkoutTemplates();

        if (templates.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-dumbbell"></i>
                    <h3>No Workouts Available</h3>
                    <p>Create your first workout to get started.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        templates.forEach(template => {
            const card = createTemplateCard(template);
            container.appendChild(card);
        });

    } catch (error) {
        console.error('❌ Error loading templates:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Templates</h3>
                <p>Please try again later.</p>
            </div>
        `;
    }
}

function createTemplateCard(template) {
    const card = document.createElement('div');
    card.className = 'template-card';

    const exerciseCount = template.exercises?.length || 0;
    const isDefault = template.isDefault || false;

    // Create full exercise list
    let exerciseListHTML = '';
    if (exerciseCount === 0) {
        exerciseListHTML = '<div class="template-exercise-item">No exercises</div>';
    } else {
        exerciseListHTML = template.exercises.map((ex, index) => {
            const sets = ex.sets || 3;
            const reps = ex.reps || 10;
            const weight = ex.weight || 50;
            return `
                <div class="template-exercise-item">
                    <span class="exercise-number">${index + 1}.</span>
                    <span class="exercise-name">${ex.name || ex.machine}</span>
                    <span class="exercise-details">${sets}×${reps} @ ${weight}lbs</span>
                </div>
            `;
        }).join('');
    }

    card.innerHTML = `
        <h4>${template.name}</h4>
        <div class="template-exercises-list">
            ${exerciseListHTML}
        </div>
        <div class="template-actions">
            <button class="btn btn-primary btn-small" onclick="useTemplate('${template.id}', ${isDefault})">
                <i class="fas fa-play"></i> Use Today
            </button>
            <button class="btn btn-secondary btn-small" onclick="editTemplate('${template.id}', ${isDefault})">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn btn-danger btn-small" onclick="deleteTemplate('${template.id}', ${isDefault})">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `;

    return card;
}

export function createNewTemplate() {
    currentEditingTemplate = {
        name: '',
        category: 'Other',
        exercises: []
    };
    
    showTemplateEditor();
}

export async function editTemplate(templateId, isDefault = false) {

    try {
        // Load all templates including raw defaults
        const { FirebaseWorkoutManager } = await import('../firebase-workout-manager.js');
        const manager = new FirebaseWorkoutManager(AppState);

        let template;

        if (isDefault) {
            // Load the default template directly
            const allDefaults = await manager.getGlobalDefaultTemplates();
            template = allDefaults.find(t => (t.id || t.day) === templateId);

            if (!template) {
                console.error('❌ Default template not found:', templateId);
                alert('Default template not found');
                return;
            }
        } else {
            // Load from user templates
            const templates = await manager.getUserWorkoutTemplates();
            template = templates.find(t => t.id === templateId);

            if (!template) {
                console.error('❌ Template not found:', templateId);
                alert('Template not found');
                return;
            }
        }

        // Set as current editing template (deep clone to avoid mutations)
        currentEditingTemplate = {
            id: template.id || template.day,
            name: template.name || template.day,
            category: template.category || template.type || 'other',
            exercises: JSON.parse(JSON.stringify(template.exercises || [])),
            suggestedDays: template.suggestedDays || [],
            overridesDefault: isDefault ? (template.id || template.day) : template.overridesDefault,
            isEditingDefault: isDefault
        };
        showTemplateEditor();

    } catch (error) {
        console.error('❌ Error loading template for editing:', error);
        alert('Error loading template for editing');
    }
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
        const { FirebaseWorkoutManager } = await import('../firebase-workout-manager.js');
        const manager = new FirebaseWorkoutManager(AppState);
        const allDefaults = await manager.getGlobalDefaultTemplates();
        const template = allDefaults.find(t => (t.id || t.day) === templateId);
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
                    hiddenAt: new Date().toISOString()
                };
                await workoutManager.saveWorkoutTemplate(hiddenMarker);
            } else {
                // Actually delete the custom template
                await workoutManager.deleteWorkoutTemplate(templateId);
            }

            // Reload AppState and UI
            AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();
            await loadAllTemplates();

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
            const override = templates.find(t => t.overridesDefault === defaultTemplateId);

            if (override) {
                await workoutManager.deleteWorkoutTemplate(override.id);

                // Reload AppState and UI
                AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();
                await loadWorkoutTemplates();
                const { loadTemplatesByCategory } = await import('../template-selection.js');
                await loadTemplatesByCategory();
            }

        } catch (error) {
            console.error('❌ Error resetting template:', error);
            alert('Error resetting template. Please try again.');
        }
    }
}

export function useTemplate(templateId) {

    // This is essentially the same as "Use Today" - start a workout with this template
    if (typeof window.useTemplateFromManagement === 'function') {
        window.useTemplateFromManagement(templateId, false);
    } else {
        console.error('❌ useTemplateFromManagement not available');
        alert('Cannot start workout. Please try again.');
    }
}

function showTemplateEditor() {
    const templateEditor = document.getElementById('template-editor-modal');
    const editorContent = document.getElementById('template-editor-content');

    if (!templateEditor || !editorContent) {
        console.error('❌ Template editor modal not found');
        showNotification('Template editor not available', 'error');
        return;
    }

    // Build the workout editor form
    editorContent.innerHTML = `
        <form id="template-editor-form" class="template-editor-form">
            <div class="form-group">
                <label for="template-name">Workout Name *</label>
                <input type="text"
                       id="template-name"
                       class="form-input"
                       value="${currentEditingTemplate.name}"
                       placeholder="e.g., Upper Body Push"
                       required>
            </div>

            <div class="form-group">
                <label for="template-category">Category *</label>
                <select id="template-category" class="form-input" required>
                    <option value="push" ${currentEditingTemplate.category === 'push' ? 'selected' : ''}>Push (Chest, Shoulders, Triceps)</option>
                    <option value="pull" ${currentEditingTemplate.category === 'pull' ? 'selected' : ''}>Pull (Back, Biceps)</option>
                    <option value="legs" ${currentEditingTemplate.category === 'legs' ? 'selected' : ''}>Legs (Quads, Glutes, Hamstrings)</option>
                    <option value="cardio" ${currentEditingTemplate.category === 'cardio' ? 'selected' : ''}>Cardio & Core</option>
                    <option value="other" ${currentEditingTemplate.category === 'other' ? 'selected' : ''}>Other/Mixed</option>
                </select>
            </div>

            <div class="form-group">
                <label>Assign Days</label>
                <div class="day-selector">
                    <label class="day-checkbox">
                        <input type="checkbox" name="suggested-days" value="monday" ${currentEditingTemplate.suggestedDays?.includes('monday') ? 'checked' : ''}>
                        <span>Mon</span>
                    </label>
                    <label class="day-checkbox">
                        <input type="checkbox" name="suggested-days" value="tuesday" ${currentEditingTemplate.suggestedDays?.includes('tuesday') ? 'checked' : ''}>
                        <span>Tue</span>
                    </label>
                    <label class="day-checkbox">
                        <input type="checkbox" name="suggested-days" value="wednesday" ${currentEditingTemplate.suggestedDays?.includes('wednesday') ? 'checked' : ''}>
                        <span>Wed</span>
                    </label>
                    <label class="day-checkbox">
                        <input type="checkbox" name="suggested-days" value="thursday" ${currentEditingTemplate.suggestedDays?.includes('thursday') ? 'checked' : ''}>
                        <span>Thu</span>
                    </label>
                    <label class="day-checkbox">
                        <input type="checkbox" name="suggested-days" value="friday" ${currentEditingTemplate.suggestedDays?.includes('friday') ? 'checked' : ''}>
                        <span>Fri</span>
                    </label>
                    <label class="day-checkbox">
                        <input type="checkbox" name="suggested-days" value="saturday" ${currentEditingTemplate.suggestedDays?.includes('saturday') ? 'checked' : ''}>
                        <span>Sat</span>
                    </label>
                    <label class="day-checkbox">
                        <input type="checkbox" name="suggested-days" value="sunday" ${currentEditingTemplate.suggestedDays?.includes('sunday') ? 'checked' : ''}>
                        <span>Sun</span>
                    </label>
                </div>
            </div>

            <div class="form-section">
                <div class="form-section-header">
                    <h4>Exercises</h4>
                    <button type="button" class="btn btn-primary btn-small" onclick="addExerciseToTemplate()">
                        <i class="fas fa-plus"></i> Add Exercise
                    </button>
                </div>
                <div id="template-exercises" class="template-exercises-list">
                    <!-- Populated by renderTemplateExercises() -->
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeTemplateEditor()">
                    Cancel
                </button>
                <button type="button" class="btn btn-success" onclick="saveCurrentTemplate()">
                    <i class="fas fa-save"></i> Save Template
                </button>
            </div>
        </form>
    `;

    templateEditor.classList.remove('hidden');

    // Render the exercises list
    renderTemplateExercises();
}

export function closeTemplateEditor() {
    const templateEditor = document.getElementById('template-editor-modal');
    if (templateEditor) {
        templateEditor.classList.add('hidden');
    }
    currentEditingTemplate = null;
}

export async function saveCurrentTemplate() {
    if (!currentEditingTemplate) return;

    const nameInput = document.getElementById('template-name');
    const categorySelect = document.getElementById('template-category');

    // Get all checked day checkboxes
    const dayCheckboxes = document.querySelectorAll('input[name="suggested-days"]:checked');
    const selectedDays = Array.from(dayCheckboxes).map(cb => cb.value);

    if (!nameInput?.value.trim()) {
        showNotification('Please enter a workout name', 'warning');
        return;
    }

    currentEditingTemplate.name = nameInput.value.trim();
    currentEditingTemplate.category = categorySelect?.value || 'Other';
    currentEditingTemplate.suggestedDays = selectedDays.length > 0 ? selectedDays : null;

    if (currentEditingTemplate.exercises.length === 0) {
        showNotification('Please add at least one exercise to the workout', 'warning');
        return;
    }

    const success = await workoutManager.saveWorkoutTemplate(currentEditingTemplate);

    if (success) {
        // Reload AppState.workoutPlans so new template is available for startWorkout()
        AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();

        closeTemplateEditor();

        // Refresh the unified workout list
        await loadAllTemplates();
    }
}

function renderTemplateExercises() {
    const container = document.getElementById('template-exercises');
    if (!container) return;
    
    if (currentEditingTemplate.exercises.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-dumbbell"></i>
                <p>No exercises added yet. Click "Add Exercise" to get started.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    currentEditingTemplate.exercises.forEach((exercise, index) => {
        const item = createTemplateExerciseItem(exercise, index);
        container.appendChild(item);
    });
}

function createTemplateExerciseItem(exercise, index) {
    const item = document.createElement('div');
    item.className = 'template-exercise-item';
    
    item.innerHTML = `
        <div class="exercise-info">
            <h5>${exercise.name}</h5>
            <div class="exercise-details">
                ${exercise.sets} sets × ${exercise.reps} reps @ ${exercise.weight} lbs
                ${exercise.bodyPart ? ` • ${exercise.bodyPart}` : ''}
                ${exercise.equipmentType ? ` • ${exercise.equipmentType}` : ''}
            </div>
        </div>
        <div class="exercise-item-actions">
            <button class="btn btn-secondary btn-small" onclick="editTemplateExercise(${index})">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-danger btn-small" onclick="removeTemplateExercise(${index})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    return item;
}

export function addExerciseToTemplate() {
    openExerciseLibrary('template');
}

export function editTemplateExercise(index) {
    if (!currentEditingTemplate || index >= currentEditingTemplate.exercises.length) {
        console.error('❌ Invalid exercise index:', index);
        return;
    }

    const exercise = currentEditingTemplate.exercises[index];

    // Prompt for new values
    const newName = prompt('Exercise name:', exercise.name);
    if (newName === null) return; // User cancelled

    const newSets = prompt('Number of sets:', exercise.sets);
    if (newSets === null) return;

    const newReps = prompt('Number of reps:', exercise.reps);
    if (newReps === null) return;

    const newWeight = prompt('Weight (lbs):', exercise.weight);
    if (newWeight === null) return;

    // Update exercise
    exercise.name = newName.trim() || exercise.name;
    exercise.sets = parseInt(newSets) || exercise.sets;
    exercise.reps = parseInt(newReps) || exercise.reps;
    exercise.weight = parseFloat(newWeight) || exercise.weight;

    // Re-render
    renderTemplateExercises();
}

export function removeTemplateExercise(index) {
    if (!currentEditingTemplate) return;
    
    currentEditingTemplate.exercises.splice(index, 1);
    renderTemplateExercises();
    showNotification('Exercise removed from workout', 'success');
}

// Exercise Library functions
export async function openExerciseLibrary(mode = 'template') {
    const modal = document.getElementById('exercise-library-modal');
    if (!modal) return;

    // Increase z-index to appear above template editor modal
    modal.style.zIndex = '1100';
    modal.classList.remove('hidden');

    // Load exercise library
    exerciseLibrary = await workoutManager.getExerciseLibrary();
    filteredExercises = [...exerciseLibrary];

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
    const modal = document.getElementById('exercise-library-modal');
    if (modal) {
        modal.classList.add('hidden');
        // Reset z-index
        modal.style.zIndex = '';
    }

    // Clear the active workout flag
    window.addingToActiveWorkout = false;

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
    
    grid.innerHTML = '';
    filteredExercises.forEach(exercise => {
        const card = createLibraryExerciseCard(exercise);
        grid.appendChild(card);
    });
}

function createLibraryExerciseCard(exercise) {
    const card = document.createElement('div');
    card.className = 'library-exercise-card';
    
    card.innerHTML = `
        <h5>${exercise.name || exercise.machine}</h5>
        <div class="library-exercise-info">
            ${exercise.bodyPart || 'General'} • ${exercise.equipmentType || 'Machine'}
            ${exercise.isCustom ? ' • Custom' : ''}
        </div>
        <div class="library-exercise-stats">
            ${exercise.sets || 3} sets × ${exercise.reps || 10} reps @ ${exercise.weight || 50} lbs
        </div>
    `;
    
    card.addEventListener('click', () => selectExerciseFromLibrary(exercise));
    
    return card;
}

function selectExerciseFromLibrary(exercise) {
    const exerciseName = exercise.name || exercise.machine;

    // Check if we're adding to active workout
    if (window.addingToActiveWorkout && window.confirmExerciseAddToWorkout) {
        window.confirmExerciseAddToWorkout(exercise);
        closeExerciseLibrary();
        window.addingToActiveWorkout = false;
        showNotification(`Added "${exerciseName}" to workout`, 'success');
        return;
    }

    // Add to current template (editing mode)
    if (currentEditingTemplate) {
        // Check for duplicate exercise names
        const isDuplicate = currentEditingTemplate.exercises.some(ex =>
            (ex.name === exerciseName || ex.machine === exerciseName)
        );

        if (isDuplicate) {
            showNotification(`"${exerciseName}" is already in this workout`, 'warning');
            return;
        }

        const templateExercise = {
            name: exerciseName,
            machine: exercise.machine || exercise.name, // CRITICAL: workout system expects 'machine' field
            bodyPart: exercise.bodyPart,
            equipmentType: exercise.equipmentType,
            sets: exercise.sets || 3,
            reps: exercise.reps || 10,
            weight: exercise.weight || 50,
            video: exercise.video || ''
        };

        currentEditingTemplate.exercises.push(templateExercise);
        renderTemplateExercises();
        closeExerciseLibrary();
        showNotification(`Added "${templateExercise.name}" to workout`, 'success');
    }
}

// Create Exercise functions - uses the add-exercise-modal
let creatingFromLibraryModal = false;

export function showCreateExerciseForm() {
    // Set flag so we know to refresh library modal after save
    creatingFromLibraryModal = true;

    // Use the existing add-exercise-modal
    const modal = document.getElementById('add-exercise-modal');
    const title = document.getElementById('add-exercise-modal-title');
    const form = document.getElementById('add-exercise-form');

    if (title) title.textContent = 'Create New Exercise';
    if (form) form.reset();

    if (modal) {
        // Increase z-index to appear above exercise library modal
        modal.style.zIndex = '1200';
        modal.classList.remove('hidden');
    }

    document.getElementById('new-exercise-name')?.focus();
}

export function closeCreateExerciseModal() {
    const modal = document.getElementById('add-exercise-modal');
    const form = document.getElementById('add-exercise-form');

    if (modal) {
        modal.classList.add('hidden');
        modal.style.zIndex = ''; // Reset z-index
    }
    if (form) form.reset();
    creatingFromLibraryModal = false;
}

export async function createNewExercise(event) {
    event.preventDefault();

    const name = document.getElementById('new-exercise-name')?.value.trim();
    const bodyPart = document.getElementById('new-exercise-body-part')?.value;
    const equipment = document.getElementById('new-exercise-equipment')?.value;
    const sets = parseInt(document.getElementById('new-exercise-sets')?.value) || 3;
    const reps = parseInt(document.getElementById('new-exercise-reps')?.value) || 10;
    const weight = parseInt(document.getElementById('new-exercise-weight')?.value) || 50;
    const video = document.getElementById('new-exercise-video')?.value.trim();

    if (!name) {
        showNotification('Please enter an exercise name', 'warning');
        return;
    }

    const exerciseData = {
        name,
        machine: name,
        bodyPart,
        equipmentType: equipment,
        tags: [bodyPart.toLowerCase(), equipment.toLowerCase()],
        sets,
        reps,
        weight,
        video
    };

    const success = await workoutManager.createExercise(exerciseData);

    if (success) {
        // Close the add-exercise-modal
        const modal = document.getElementById('add-exercise-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.zIndex = '';
        }

        // Refresh exercise library if it's open
        if (creatingFromLibraryModal) {
            const libraryModal = document.getElementById('exercise-library-modal');
            if (libraryModal && !libraryModal.classList.contains('hidden')) {
                exerciseLibrary = await workoutManager.getExerciseLibrary();
                filteredExercises = [...exerciseLibrary];
                renderExerciseLibrary();
            }
        }

        creatingFromLibraryModal = false;
        showNotification(`Created "${name}"`, 'success');
    }
}

export function returnToWorkoutsFromManagement(appState) {
    
    const hasActiveCustomTemplate = checkForActiveCustomTemplate(appState);
    
    // Hide management UI first
    hideWorkoutManagement();
    
    if (hasActiveCustomTemplate) {
        // Custom template active - navigate without popup warning
        showWorkoutSelectorSafe(appState, true);
    } else {
        // No active custom template - normal navigation
        showWorkoutSelectorSafe(appState, false);
    }
}

// Helper function to detect active custom templates
function checkForActiveCustomTemplate(appState) {
    if (!appState.currentWorkout || !appState.savedData.workoutType) {
        return false;
    }
    
    // Check if current workoutType is NOT in default workout plans
    const isDefaultWorkout = appState.workoutPlans.some(plan => 
        plan.day === appState.savedData.workoutType
    );
    
    return !isDefaultWorkout; // If not default, it's likely a custom template
}

// Safe wrapper for showWorkoutSelector that respects navigation context
function showWorkoutSelectorSafe(appState, fromNavigation = false) {
    // Only show warning popup if NOT from navigation and has real progress
    const shouldShowWarning = !fromNavigation && 
                             appState.hasWorkoutProgress() && 
                             appState.currentWorkout && 
                             appState.savedData.workoutType;
    
    if (shouldShowWarning) {
        const confirmChange = confirm(
            'You have progress on your current workout. Changing will save your progress but return you to workout selection. Continue?'
        );
        if (!confirmChange) {
            // User chose to stay - show management again
            showWorkoutManagement();
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
    
    // Show in-progress workout prompt if returning with active workout
    await checkForInProgressWorkout(appState);
}

async function checkForInProgressWorkout(appState) {
    // Skip if already showing prompt
    if (window.showingProgressPrompt) return;
    
    try {
        const { loadTodaysWorkout } = await import('./data-manager.js');
        const todaysData = await loadTodaysWorkout(appState);
        
        // Check if there's an incomplete workout from today
        if (todaysData && !todaysData.completedAt && !todaysData.cancelledAt) {
            
            // Validate workout plan exists
            const workoutPlan = appState.workoutPlans.find(plan => 
                plan.day === todaysData.workoutType || 
                plan.name === todaysData.workoutType ||
                plan.id === todaysData.workoutType
            );
            
            if (!workoutPlan) {
                console.warn('⚠️ Workout plan not found for:', todaysData.workoutType);
                return;
            }
            
            // Store in-progress workout globally
            window.inProgressWorkout = {
                ...todaysData,
                originalWorkout: workoutPlan
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
            import('./workout-core.js').then(module => {
                module.continueInProgressWorkout();
            });
        } else {
            // Use your existing discard function
            import('./workout-core.js').then(module => {
                module.discardInProgressWorkout();
            });
        }
        window.showingProgressPrompt = false;
    }, 500);
}