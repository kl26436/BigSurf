// Workout Management UI Functions
import { AppState } from '../utils/app-state.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { showNotification, setHeaderMode } from '../ui/ui-helpers.js';
import { getSessionLocation } from '../features/location-service.js';
import { setBottomNavVisible } from '../ui/navigation.js';

let workoutManager;
let currentEditingTemplate = null;
let exerciseLibrary = [];
let filteredExercises = [];
let allWorkoutTemplates = [];
let currentWorkoutCategory = '';

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
    const sections = ['dashboard', 'workout-selector', 'active-workout', 'workout-history-section', 'stats-section', 'exercise-manager-section', 'location-management-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Show workout management section
    section.classList.remove('hidden');

    // Hide header but keep bottom nav for consistency
    setHeaderMode(false);

    // Keep bottom nav visible for consistency
    setBottomNavVisible(true);

    // Show category view, hide list view
    showWorkoutCategoryView();

    // Preload templates in background
    loadAllTemplatesInBackground();
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

// Preload all templates in background
async function loadAllTemplatesInBackground() {
    try {
        allWorkoutTemplates = await workoutManager.getUserWorkoutTemplates();
    } catch (error) {
        console.error('❌ Error preloading templates:', error);
    }
}

// Show category view (entry page)
export function showWorkoutCategoryView() {
    const categoryView = document.getElementById('workout-category-view');
    const listView = document.getElementById('workout-list-view');

    if (categoryView) categoryView.classList.remove('hidden');
    if (listView) listView.classList.add('hidden');

    currentWorkoutCategory = '';
}

// Select a workout category and show filtered list
export async function selectWorkoutCategory(category) {
    currentWorkoutCategory = category;

    const categoryView = document.getElementById('workout-category-view');
    const listView = document.getElementById('workout-list-view');
    const titleEl = document.getElementById('workout-list-title');

    if (categoryView) categoryView.classList.add('hidden');
    if (listView) listView.classList.remove('hidden');

    // Update title
    if (titleEl) {
        titleEl.textContent = category ? `${category} Workouts` : 'All Workouts';
    }

    // Render filtered templates
    renderWorkoutList(category);
}

// Handle workout search from category view
export function handleWorkoutSearch() {
    const searchInput = document.getElementById('workout-search-input');
    const query = searchInput?.value.trim().toLowerCase();

    if (query && query.length >= 2) {
        // Show list view with search results
        selectWorkoutCategory('');

        // Filter by search after showing
        setTimeout(() => {
            const container = document.getElementById('all-templates');
            if (!container) return;

            const filtered = allWorkoutTemplates.filter(t =>
                t.name?.toLowerCase().includes(query) ||
                t.exercises?.some(ex => (ex.name || ex.machine || '').toLowerCase().includes(query))
            );

            renderFilteredWorkouts(filtered, `Search: "${query}"`);
        }, 50);
    }
}

// Render workout list for a category
function renderWorkoutList(category) {
    const container = document.getElementById('all-templates');
    if (!container) return;

    // Filter templates by category
    let filtered = allWorkoutTemplates;
    if (category) {
        filtered = allWorkoutTemplates.filter(t => {
            const templateCategory = (t.category || t.type || 'other').toLowerCase();
            const searchCategory = category.toLowerCase();
            return templateCategory.includes(searchCategory) ||
                   t.name?.toLowerCase().includes(searchCategory);
        });
    }

    renderFilteredWorkouts(filtered);
}

// Render filtered workouts to container
function renderFilteredWorkouts(templates, titleOverride = null) {
    const container = document.getElementById('all-templates');
    const titleEl = document.getElementById('workout-list-title');

    if (!container) return;

    if (titleOverride && titleEl) {
        titleEl.textContent = titleOverride;
    }

    if (templates.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-dumbbell"></i>
                <h3>No Workouts Found</h3>
                <p>Create a workout to get started.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    templates.forEach(template => {
        const card = createTemplateCard(template);
        container.appendChild(card);
    });
}

// Create a simple workout card (like exercise library)
function createTemplateCard(template) {
    const card = document.createElement('div');
    card.className = 'workout-list-item';

    const exerciseCount = template.exercises?.length || 0;
    const isDefault = template.isDefault || false;

    // Get category icon
    const categoryIcon = getCategoryIcon(template.category || template.type);

    // Create exercise summary (just names, comma separated)
    let exerciseSummary = 'No exercises';
    if (exerciseCount > 0) {
        const names = template.exercises.slice(0, 4).map(ex => ex.name || ex.machine);
        exerciseSummary = names.join(', ');
        if (exerciseCount > 4) {
            exerciseSummary += ` +${exerciseCount - 4} more`;
        }
    }

    card.innerHTML = `
        <div class="workout-item-icon">
            <i class="${categoryIcon}"></i>
        </div>
        <div class="workout-item-content">
            <div class="workout-item-name">${template.name}</div>
            <div class="workout-item-meta">${exerciseCount} exercises</div>
            <div class="workout-item-exercises">${exerciseSummary}</div>
        </div>
        <button class="workout-item-edit" onclick="event.stopPropagation(); editTemplate('${template.id}', ${isDefault})">
            EDIT
        </button>
    `;

    // Click on card to use the workout
    card.addEventListener('click', () => {
        useTemplate(template.id, isDefault);
    });

    return card;
}

// Get icon for workout category - matches Start Workout page icons
function getCategoryIcon(category) {
    const cat = (category || '').toLowerCase();
    const icons = {
        'push': 'fas fa-hand-paper',
        'pull': 'fas fa-fist-raised',
        'legs': 'fas fa-running',
        'leg': 'fas fa-running',
        'cardio': 'fas fa-heartbeat',
        'core': 'fas fa-heartbeat',
        'other': 'fas fa-dumbbell',
        'full body': 'fas fa-dumbbell',
        'fullbody': 'fas fa-dumbbell',
        'upper': 'fas fa-hand-paper',
        'lower': 'fas fa-running',
        'chest': 'fas fa-hand-paper',
        'back': 'fas fa-fist-raised',
        'shoulders': 'fas fa-hand-paper',
        'arms': 'fas fa-fist-raised'
    };
    return icons[cat] || 'fas fa-dumbbell';
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
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
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
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
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
                const { loadTemplatesByCategory } = await import('../ui/template-selection.js');
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
            <button type="button" class="btn btn-secondary btn-small" onclick="editTemplateExercise(${index})">
                <i class="fas fa-edit"></i>
            </button>
            <button type="button" class="btn btn-danger btn-small" onclick="removeTemplateExercise(${index})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    return item;
}

export function addExerciseToTemplate() {
    openExerciseLibrary('template');
}

// Store which template exercise index is being edited
let editingTemplateExerciseIndex = null;

export function editTemplateExercise(index) {
    if (!currentEditingTemplate || index >= currentEditingTemplate.exercises.length) {
        console.error('❌ Invalid exercise index:', index);
        return;
    }

    const exercise = currentEditingTemplate.exercises[index];
    editingTemplateExerciseIndex = index;

    // Use the full Exercise Manager edit section (same one used in Exercise Library)
    // This provides the full equipment management UI
    if (window.openEditExerciseSection) {
        // Set flag so we know to return to template editor after saving
        window.editingFromTemplateEditor = true;
        window.templateExerciseEditCallback = (updatedExercise) => {
            // Update the template exercise with new values
            if (editingTemplateExerciseIndex !== null && currentEditingTemplate) {
                const ex = currentEditingTemplate.exercises[editingTemplateExerciseIndex];
                ex.name = updatedExercise.name;
                ex.machine = updatedExercise.name;
                ex.sets = updatedExercise.sets;
                ex.reps = updatedExercise.reps;
                ex.weight = updatedExercise.weight;
                ex.equipment = updatedExercise.equipment;
                ex.equipmentLocation = updatedExercise.equipmentLocation;
                ex.video = updatedExercise.video;
                renderTemplateExercises();
                // Removed notification - UI update is self-evident
            }
            editingTemplateExerciseIndex = null;
            // Note: Don't clear flags here - closeEditExerciseSection() needs them
            // to know where to return. It will clear them after navigation.
        };

        // Open the full edit section with this exercise's data
        window.openEditExerciseSection({
            ...exercise,
            name: exercise.name || exercise.machine,
            isTemplateExercise: true
        });
    } else {
        // Fallback to simple modal if edit section not available
        editTemplateExerciseFallback(index, exercise);
    }
}

// Fallback if modal doesn't exist
function editTemplateExerciseFallback(index, exercise) {
    const newName = prompt('Exercise name:', exercise.name);
    if (newName === null) return;

    const newSets = prompt('Number of sets:', exercise.sets);
    if (newSets === null) return;

    const newReps = prompt('Number of reps:', exercise.reps);
    if (newReps === null) return;

    const newWeight = prompt('Weight (lbs):', exercise.weight);
    if (newWeight === null) return;

    exercise.name = newName.trim() || exercise.name;
    exercise.sets = parseInt(newSets) || exercise.sets;
    exercise.reps = parseInt(newReps) || exercise.reps;
    exercise.weight = parseFloat(newWeight) || exercise.weight;

    renderTemplateExercises();
}

export function closeTemplateExerciseEdit() {
    const modal = document.getElementById('template-exercise-edit-modal');
    if (modal) modal.classList.add('hidden');
    editingTemplateExerciseIndex = null;
}

export function saveTemplateExerciseEdit() {
    if (editingTemplateExerciseIndex === null || !currentEditingTemplate) {
        closeTemplateExerciseEdit();
        return;
    }

    const exercise = currentEditingTemplate.exercises[editingTemplateExerciseIndex];

    // Get values from form
    const name = document.getElementById('template-exercise-name')?.value.trim();
    const sets = parseInt(document.getElementById('template-exercise-sets')?.value) || 3;
    const reps = parseInt(document.getElementById('template-exercise-reps')?.value) || 10;
    const weight = parseFloat(document.getElementById('template-exercise-weight')?.value) || 50;
    const equipment = document.getElementById('template-exercise-equipment')?.value.trim() || null;
    const location = document.getElementById('template-exercise-location')?.value.trim() || null;

    if (!name) {
        showNotification('Please enter an exercise name', 'warning');
        return;
    }

    // Update exercise
    exercise.name = name;
    exercise.machine = name;
    exercise.sets = sets;
    exercise.reps = reps;
    exercise.weight = weight;
    exercise.equipment = equipment;
    exercise.equipmentLocation = location;

    closeTemplateExerciseEdit();
    renderTemplateExercises();
    // Removed notification - UI update is self-evident
}

export function removeTemplateExercise(index) {
    if (!currentEditingTemplate) return;
    
    currentEditingTemplate.exercises.splice(index, 1);
    renderTemplateExercises();
    // Removed notification - UI update is self-evident
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

    // Group exercises by body part
    const grouped = {};
    filteredExercises.forEach(exercise => {
        const bodyPart = exercise.bodyPart || 'General';
        if (!grouped[bodyPart]) {
            grouped[bodyPart] = [];
        }
        grouped[bodyPart].push(exercise);
    });

    // Sort body parts alphabetically
    const sortedBodyParts = Object.keys(grouped).sort();

    // Render grouped exercises
    grid.innerHTML = sortedBodyParts.map(bodyPart => {
        const exercises = grouped[bodyPart];
        const exerciseCards = exercises.map(exercise => {
            const exerciseName = exercise.name || exercise.machine;
            return `<div class="library-exercise-card" data-exercise-id="${exercise.id || exerciseName}">
                <span class="library-exercise-name">${exerciseName}</span>
            </div>`;
        }).join('');

        return `
            <div class="library-group">
                <div class="library-group-header">${bodyPart}</div>
                <div class="library-group-items">${exerciseCards}</div>
            </div>
        `;
    }).join('');

    // Add click handlers
    grid.querySelectorAll('.library-exercise-card').forEach(card => {
        card.addEventListener('click', () => {
            const exerciseId = card.dataset.exerciseId;
            const exercise = filteredExercises.find(ex =>
                (ex.id || ex.name || ex.machine) === exerciseId
            );
            if (exercise) selectExerciseFromLibrary(exercise);
        });
    });
}

function createLibraryExerciseCard(exercise) {
    const card = document.createElement('div');
    card.className = 'library-exercise-card';

    const exerciseName = exercise.name || exercise.machine;

    card.innerHTML = `
        <span class="library-exercise-name">${exerciseName}</span>
        <span class="library-exercise-body-part">${exercise.bodyPart || 'General'}</span>
    `;

    card.addEventListener('click', () => selectExerciseFromLibrary(exercise));

    return card;
}

// Pending exercise for equipment selection
let pendingExerciseForEquipment = null;

function selectExerciseFromLibrary(exercise) {
    const exerciseName = exercise.name || exercise.machine;

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
        const isDuplicate = currentEditingTemplate.exercises.some(ex =>
            (ex.name === exerciseName || ex.machine === exerciseName)
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
    const titleEl = document.getElementById('equipment-picker-exercise-name');
    const listEl = document.getElementById('equipment-picker-list');
    const newNameInput = document.getElementById('equipment-picker-new-name');
    const newLocationInput = document.getElementById('equipment-picker-new-location');

    if (titleEl) titleEl.textContent = `for "${exerciseName}"`;
    if (newNameInput) newNameInput.value = exercise.equipment || '';
    // Pre-fill location with exercise location, or fall back to current session location
    const sessionLocation = isActiveWorkout ? getSessionLocation() : null;
    if (newLocationInput) newLocationInput.value = exercise.equipmentLocation || sessionLocation || '';

    // Load equipment that has been used with this exercise
    try {
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const exerciseEquipment = await workoutManager.getEquipmentForExercise(exerciseName);
        const allEquipment = await workoutManager.getUserEquipment();

        // Render equipment options
        if (listEl) {
            if (exerciseEquipment.length > 0) {
                listEl.innerHTML = exerciseEquipment.map(eq => `
                    <div class="equipment-option" data-equipment-id="${eq.id}" data-equipment-name="${eq.name}" data-equipment-location="${eq.location || ''}">
                        <div class="equipment-option-radio"></div>
                        <div class="equipment-option-details">
                            <div class="equipment-option-name">${eq.name}</div>
                            ${eq.location ? `<div class="equipment-option-location">${eq.location}</div>` : ''}
                        </div>
                    </div>
                `).join('');

                // Add click handlers for selection
                listEl.querySelectorAll('.equipment-option').forEach(option => {
                    option.addEventListener('click', () => {
                        listEl.querySelectorAll('.equipment-option').forEach(o => o.classList.remove('selected'));
                        option.classList.add('selected');
                        // Clear the new equipment inputs when selecting existing
                        if (newNameInput) newNameInput.value = '';
                        if (newLocationInput) newLocationInput.value = '';
                    });
                });
            } else {
                listEl.innerHTML = `<div class="equipment-picker-empty">No equipment saved for this exercise yet</div>`;
            }
        }

        // Populate suggestions datalists
        const equipmentDatalist = document.getElementById('equipment-picker-suggestions');
        const locationDatalist = document.getElementById('equipment-picker-location-suggestions');

        if (equipmentDatalist) {
            const equipmentNames = [...new Set(allEquipment.map(eq => eq.name))];
            equipmentDatalist.innerHTML = equipmentNames.map(name => `<option value="${name}">`).join('');
        }

        if (locationDatalist) {
            // Get locations from equipment AND from saved gym locations
            const equipmentLocations = allEquipment.filter(eq => eq.location).map(eq => eq.location);
            let savedGymLocations = [];
            try {
                savedGymLocations = await workoutManager.getUserLocations();
                savedGymLocations = savedGymLocations.map(loc => loc.name);
            } catch (e) {
                // Ignore errors fetching gym locations
            }
            const allLocations = [...new Set([...equipmentLocations, ...savedGymLocations])];
            locationDatalist.innerHTML = allLocations.map(loc => `<option value="${loc}">`).join('');
        }
    } catch (error) {
        console.error('Error loading equipment:', error);
        if (listEl) {
            listEl.innerHTML = `<div class="equipment-picker-empty">Error loading equipment</div>`;
        }
    }

    // Store whether this is for active workout
    window.equipmentPickerForActiveWorkout = isActiveWorkout;

    if (modal) modal.classList.remove('hidden');
}

// Close equipment picker
export function closeEquipmentPicker() {
    const modal = document.getElementById('equipment-picker-modal');
    if (modal) modal.classList.add('hidden');
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
            listEl.innerHTML = exerciseEquipment.map(eq => `
                <div class="equipment-option ${eq.name === equipmentName ? 'selected' : ''}"
                     data-equipment-id="${eq.id}"
                     data-equipment-name="${eq.name}"
                     data-equipment-location="${eq.location || ''}">
                    <div class="equipment-option-radio"></div>
                    <div class="equipment-option-details">
                        <div class="equipment-option-name">${eq.name}</div>
                        ${eq.location ? `<div class="equipment-option-location">${eq.location}</div>` : ''}
                    </div>
                </div>
            `).join('');

            // Re-add click handlers
            listEl.querySelectorAll('.equipment-option').forEach(option => {
                option.addEventListener('click', () => {
                    listEl.querySelectorAll('.equipment-option').forEach(o => o.classList.remove('selected'));
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
            const equipment = await workoutManager.getOrCreateEquipment(equipmentName, equipmentLocation, exerciseName, equipmentVideo);

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
            equipmentLocation: equipmentLocation
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
            video: exercise.video || ''
        };

        currentEditingTemplate.exercises.push(templateExercise);
        renderTemplateExercises();
        closeExerciseLibrary();
        closeEquipmentPicker();
        // Silent success - exercise appears immediately in template editor
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
        // Silent success - exercise appears immediately in library
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
            // Use todaysData.originalWorkout if it exists (contains modified exercise list)
            window.inProgressWorkout = {
                ...todaysData,
                originalWorkout: todaysData.originalWorkout || workoutPlan
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