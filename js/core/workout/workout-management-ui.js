// Workout Management UI Functions
import { FirebaseWorkoutManager } from '../firebase-workout-manager.js';
import { showNotification } from '../ui-helpers.js';
import { switchTemplateCategory } from '../template-selection.js';

let workoutManager;
let currentEditingTemplate = null;
let exerciseLibrary = [];
let filteredExercises = [];

export function initializeWorkoutManagement(appState) {
    workoutManager = new FirebaseWorkoutManager(appState);
}

// Main navigation functions
export async function showWorkoutManagement() {
    console.log('🔧 Opening Workout Management section');

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
    console.log('✅ Workout management section opened');

    // Initialize with default templates category
    setTimeout(() => {
        switchTemplateCategory('default');
    }, 100);
}

export function closeWorkoutManagement() {
    console.log('🔧 Closing Workout Management section');

    const section = document.getElementById('workout-management-section');
    if (section) {
        section.classList.add('hidden');
        console.log('✅ Workout management section closed');
    }

    // Show dashboard
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        dashboard.classList.remove('hidden');
        console.log('✅ Dashboard shown');
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
                    <i class="fas fa-clipboard-list"></i>
                    <h3>No Custom Templates</h3>
                    <p>Create your first custom workout template to get started.</p>
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

function createTemplateCard(template) {
    const card = document.createElement('div');
    card.className = 'template-card';
    
    const exerciseCount = template.exercises?.length || 0;
    const exercisePreview = template.exercises?.slice(0, 3).map(ex => ex.name).join(', ') || 'No exercises';
    const moreText = exerciseCount > 3 ? ` and ${exerciseCount - 3} more...` : '';
    
    card.innerHTML = `
        <h4>${template.name}</h4>
        <div class="template-category">${template.category || 'Other'}</div>
        <div class="template-exercises-preview">
            ${exerciseCount} exercises: ${exercisePreview}${moreText}
        </div>
        <div class="template-actions">
            <button class="btn btn-primary btn-small" onclick="useTemplate('${template.id}')">
                <i class="fas fa-play"></i> Use Today
            </button>
            <button class="btn btn-secondary btn-small" onclick="editTemplate('${template.id}')">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn btn-danger btn-small" onclick="deleteTemplate('${template.id}')">
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

export async function editTemplate(templateId) {
    console.log('📝 Loading template for editing:', templateId);

    try {
        // Load all templates to find the one we want to edit
        const templates = await workoutManager.getUserWorkoutTemplates();
        const template = templates.find(t => t.id === templateId);

        if (!template) {
            console.error('❌ Template not found:', templateId);
            alert('Template not found');
            return;
        }

        // Check if this is a default template (can't edit defaults)
        if (template.isDefault) {
            alert('Default templates cannot be edited. Please create a copy instead.');
            return;
        }

        // Set as current editing template (make a copy to avoid mutating original)
        currentEditingTemplate = {
            id: template.id,
            name: template.name || template.day,
            category: template.category || template.type || 'other',
            exercises: [...template.exercises]
        };

        console.log('✅ Template loaded for editing:', currentEditingTemplate);
        showTemplateEditor();

    } catch (error) {
        console.error('❌ Error loading template for editing:', error);
        alert('Error loading template for editing');
    }
}

export async function deleteTemplate(templateId) {
    if (!workoutManager) {
        console.error('❌ Workout manager not initialized');
        alert('Cannot delete template: System not ready');
        return;
    }

    if (confirm('Are you sure you want to delete this template? This cannot be undone.')) {
        try {
            console.log('🗑️ Deleting template:', templateId);
            await workoutManager.deleteWorkoutTemplate(templateId);
            console.log('✅ Template deleted successfully');

            // Reload the template list
            switchTemplateCategory('custom');
        } catch (error) {
            console.error('❌ Error deleting template:', error);
            alert('Error deleting template. Please try again.');
        }
    }
}

export function useTemplate(templateId) {
    console.log('🏋️ Using template:', templateId);

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

    // Build the template editor form
    editorContent.innerHTML = `
        <form id="template-editor-form" class="template-editor-form">
            <div class="form-group">
                <label for="template-name">Template Name *</label>
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
    
    if (!nameInput?.value.trim()) {
        showNotification('Please enter a template name', 'warning');
        return;
    }
    
    currentEditingTemplate.name = nameInput.value.trim();
    currentEditingTemplate.category = categorySelect?.value || 'Other';
    
    if (currentEditingTemplate.exercises.length === 0) {
        showNotification('Please add at least one exercise to the template', 'warning');
        return;
    }
    
    const success = await workoutManager.saveWorkoutTemplate(currentEditingTemplate);

    if (success) {
        // Reload AppState.workoutPlans so new template is available for startWorkout()
        AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();
        console.log('✅ Workout plans reloaded after template save:', AppState.workoutPlans.length);

        closeTemplateEditor();
        await loadWorkoutTemplates();

        // CRITICAL: Also refresh the template selector UI
        const { loadTemplatesByCategory } = await import('../template-selection.js');
        await loadTemplatesByCategory();
        console.log('✅ Template selector UI refreshed');
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
    console.log('✅ Exercise updated');
}

export function removeTemplateExercise(index) {
    if (!currentEditingTemplate) return;
    
    currentEditingTemplate.exercises.splice(index, 1);
    renderTemplateExercises();
    showNotification('Exercise removed from template', 'success');
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

    console.log('✅ Exercise library search and filter listeners set up');
}

export function closeExerciseLibrary() {
    const modal = document.getElementById('exercise-library-modal');
    if (modal) {
        modal.classList.add('hidden');
        // Reset z-index
        modal.style.zIndex = '';
    }

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
    // Add to current template
    if (currentEditingTemplate) {
        const templateExercise = {
            name: exercise.name || exercise.machine,
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
        showNotification(`Added "${templateExercise.name}" to template`, 'success');
    }
}

// Create Exercise functions
export function showCreateExerciseForm() {
    const modal = document.getElementById('create-exercise-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

export function closeCreateExerciseModal() {
    const modal = document.getElementById('create-exercise-modal');
    const form = document.getElementById('create-exercise-form');
    
    if (modal) modal.classList.add('hidden');
    if (form) form.reset();
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
        closeCreateExerciseModal();
        
        // Refresh exercise library if it's open
        const libraryModal = document.getElementById('exercise-library-modal');
        if (libraryModal && !libraryModal.classList.contains('hidden')) {
            exerciseLibrary = await workoutManager.getExerciseLibrary();
            filteredExercises = [...exerciseLibrary];
            renderExerciseLibrary();
        }
    }
}

export function returnToWorkoutsFromManagement(appState) {
    console.log('🔄 BUG-032 FIX: Smart navigation from workout management');
    
    const hasActiveCustomTemplate = checkForActiveCustomTemplate(appState);
    
    // Hide management UI first
    hideWorkoutManagement();
    
    if (hasActiveCustomTemplate) {
        // Custom template active - navigate without popup warning
        console.log('📋 Active custom template detected - bypassing popup warning');
        showWorkoutSelectorSafe(appState, true);
    } else {
        // No active custom template - normal navigation
        console.log('✅ Normal navigation - no active custom template');
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
    
    console.log('🔍 Checking for in-progress workout...');
    
    try {
        const { loadTodaysWorkout } = await import('./data-manager.js');
        const todaysData = await loadTodaysWorkout(appState);
        
        // Check if there's an incomplete workout from today
        if (todaysData && !todaysData.completedAt && !todaysData.cancelledAt) {
            console.log('📋 Found in-progress workout:', todaysData.workoutType);
            
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
            console.log('✅ No in-progress workout found');
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