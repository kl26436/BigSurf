// Template Selection Module - core/template-selection.js
// Handles template browsing, selection, and immediate usage

import { AppState } from './app-state.js';
import { showNotification } from './ui-helpers.js';

// ===================================================================
// TEMPLATE SELECTION STATE
// ===================================================================

let selectedWorkoutCategory = null;
let currentTemplateCategory = 'default';

// ===================================================================
// TEMPLATE SELECTION UI
// ===================================================================

export function showTemplateSelection() {
    const modal = document.getElementById('template-selection-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    
    // Load default templates
    switchTemplateCategory('default');
}

export function closeTemplateSelection() {
    const modal = document.getElementById('template-selection-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export async function selectTemplate(templateId, isDefault = false) {
    
    if (!AppState.currentUser) {
        alert('Please sign in to start workouts');
        return;
    }
    
    try {
        let selectedTemplate = null;
        
        if (isDefault) {
            // Find in default workout plans
            selectedTemplate = AppState.workoutPlans.find(plan => 
                plan.day === templateId || plan.name === templateId || plan.id === templateId
            );
        } else {
            // Load user's custom templates
            const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);
            const userTemplates = await workoutManager.getUserWorkoutTemplates();
            
            selectedTemplate = userTemplates.find(template => 
                template.id === templateId || template.name === templateId
            );
        }
        
        if (!selectedTemplate) {
            console.error('❌ Template not found');
            return;
        }
        
        // Close template selection
        closeTemplateSelection();
        
        // Import and use startWorkout function (dynamic import to avoid circular dependency)
        const { startWorkout } = await import('./workout-core.js');
        await startWorkout(selectedTemplate.day || selectedTemplate.name || templateId);
        
    } catch (error) {
        console.error('Error selecting template:', error);
        alert('Error starting workout from template');
    }
}

export function showWorkoutSelector() {
    const workoutSelector = document.getElementById('workout-selector');
    const activeWorkout = document.getElementById('active-workout');
    const workoutManagement = document.getElementById('workout-management');
    const historySection = document.getElementById('workout-history-section');
    const dashboard = document.getElementById('dashboard');

    // Hide all other sections
    if (activeWorkout) activeWorkout.classList.add('hidden');
    if (workoutManagement) workoutManagement.classList.add('hidden');
    if (historySection) historySection.classList.add('hidden');
    if (dashboard) dashboard.classList.add('hidden');

    // Show workout selector
    if (workoutSelector) workoutSelector.classList.remove('hidden');
}

// ===================================================================
// TEMPLATE CATEGORY MANAGEMENT
// ===================================================================

export function switchTemplateCategory(category) {
    currentTemplateCategory = category;

    // Update active tab (supports both .template-category-tab and .category-tab)
    document.querySelectorAll('.template-category-tab, .category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
    });

    // Show/hide category content divs
    const defaultTemplates = document.getElementById('default-templates');
    const customTemplates = document.getElementById('custom-templates');

    if (defaultTemplates && customTemplates) {
        if (category === 'default') {
            defaultTemplates.classList.remove('hidden');
            customTemplates.classList.add('hidden');
        } else if (category === 'custom') {
            defaultTemplates.classList.add('hidden');
            customTemplates.classList.remove('hidden');
        }
    }

    // Load templates for category
    loadTemplatesByCategory();
}

export async function loadTemplatesByCategory() {
    // Determine which container to use
    let container = document.getElementById('template-cards-container');

    // If we're in the modal, use the appropriate grid
    if (!container) {
        if (currentTemplateCategory === 'default') {
            container = document.getElementById('default-templates');
        } else if (currentTemplateCategory === 'custom') {
            container = document.getElementById('custom-templates');
        }
    }

    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading templates...</span></div>';

    try {
        let templates = [];

        if (currentTemplateCategory === 'default') {
            // Load default/global templates
            templates = AppState.workoutPlans || [];
        } else if (currentTemplateCategory === 'custom') {
            // Load user's custom templates
            if (AppState.currentUser) {
                const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
                const workoutManager = new FirebaseWorkoutManager(AppState);
                templates = await workoutManager.getUserWorkoutTemplates();
                templates = templates.filter(t => t.isCustom);
            }
        } else {
            // Filter by specific category
            templates = AppState.workoutPlans.filter(plan =>
                getWorkoutCategory(plan.day || plan.name) === currentTemplateCategory
            );
        }

        renderTemplateCards(templates, container);

    } catch (error) {
        console.error('Error loading templates:', error);
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Templates</h3>
                <p>Please try again later.</p>
            </div>
        `;
    }
}

// ===================================================================
// TEMPLATE ACTIONS FROM SELECTION
// ===================================================================

export function useTemplate(templateId) {
    selectTemplate(templateId, true);
}

export async function useTemplateFromManagement(templateId, isDefault) {

    try {
        // Hide management UI first
        const workoutManagement = document.getElementById('workout-management-section');
        if (workoutManagement) {
            workoutManagement.classList.add('hidden');
        }

        // Start workout with template directly (don't show workout selector)
        await selectTemplate(templateId, isDefault);

    } catch (error) {
        console.error('Error in useTemplateFromManagement:', error);
        alert('Error starting template');
    }
}

export async function copyTemplateToCustom(templateId) {
    if (!AppState.currentUser) {
        alert('Please sign in to copy templates');
        return;
    }
    
    try {
        // Find the default template
        const defaultTemplate = AppState.workoutPlans.find(plan => 
            plan.day === templateId || plan.name === templateId || plan.id === templateId
        );
        
        if (!defaultTemplate) {
            console.error('❌ Template not found');
            return;
        }
        
        // Create custom version with DEEP CLONE of exercises
        const customTemplate = {
            name: `${defaultTemplate.day || defaultTemplate.name} (Custom)`,
            category: getWorkoutCategory(defaultTemplate.day || defaultTemplate.name),
            exercises: JSON.parse(JSON.stringify(defaultTemplate.exercises || [])), // Deep clone to make exercises editable
            isCustom: true,
            isDefault: false,
            createdFrom: templateId
        };
        
        // Save to Firebase
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        await workoutManager.saveWorkoutTemplate(customTemplate);

        // CRITICAL: Reload AppState.workoutPlans so new template is available
        AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();

        // Switch to custom tab to show the newly copied template
        switchTemplateCategory('custom');
        
    } catch (error) {
        console.error('Error copying template:', error);
        alert('Error copying template');
    }
}

export async function deleteCustomTemplate(templateId) {
    if (!AppState.currentUser) {
        alert('Please sign in to delete templates');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this custom template? This cannot be undone.')) {
        return;
    }
    
    try {
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        await workoutManager.deleteWorkoutTemplate(templateId);
        
        // Refresh templates
        loadTemplatesByCategory();
        
    } catch (error) {
        console.error('Error deleting template:', error);
        alert('Error deleting template');
    }
}

// ===================================================================
// TEMPLATE RENDERING FOR SELECTION
// ===================================================================

export function renderTemplateCards(templates, targetContainer = null) {
    const container = targetContainer || document.getElementById('template-cards-container');
    if (!container) return;

    if (templates.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard-list"></i>
                <h3>No Templates Found</h3>
                <p>${currentTemplateCategory === 'custom' ?
                    'Create your first custom template in Workout Management.' :
                    'No templates available in this category.'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    templates.forEach(template => {
        const card = createTemplateCard(template, currentTemplateCategory === 'default');
        container.appendChild(card);
    });
}

export function createTemplateCard(template, isDefault = false) {
    const card = document.createElement('div');
    card.className = 'template-card';

    const exerciseCount = template.exercises?.length || 0;

    // Build full exercise list as bullet points
    const exerciseList = template.exercises?.map(ex =>
        `<li>${getExerciseName(ex)}</li>`
    ).join('') || '<li>No exercises</li>';

    // Use template.id for custom templates, template.day for default templates
    const templateId = template.id || template.day;
    const templateName = template.name || template.day;

    card.innerHTML = `
        <div class="template-header">
            <h4>${templateName}</h4>
            <div class="template-meta">
                <span class="template-category">${getWorkoutCategory(templateName)}</span>
                <small class="template-source">${isDefault ? 'Global' : 'User'}</small>
            </div>
        </div>
        <div class="template-preview">
            <div class="exercise-count">${exerciseCount} exercises</div>
            <ul class="exercise-list-preview">
                ${exerciseList}
            </ul>
        </div>
        <div class="template-actions">
            <button class="btn btn-primary btn-small" onclick="useTemplateFromManagement('${templateId}', ${isDefault})">
                <i class="fas fa-play"></i> Use Today
            </button>
            <button class="btn btn-secondary btn-small" onclick="editTemplate('${templateId}', ${isDefault})">
                <i class="fas fa-edit"></i> Edit
            </button>
            ${template.overridesDefault ? `
                <button class="btn btn-warning btn-small" onclick="resetToDefault('${template.overridesDefault}')">
                    <i class="fas fa-undo"></i> Reset
                </button>
            ` : ''}
            <button class="btn btn-danger btn-small" onclick="deleteTemplate('${templateId}', ${isDefault})">
                <i class="fas fa-${isDefault ? 'eye-slash' : 'trash'}"></i> ${isDefault ? 'Hide' : 'Delete'}
            </button>
        </div>
    `;

    return card;
}

// ===================================================================
// TEMPLATE FILTERING AND SEARCH
// ===================================================================

export function filterTemplates(category) {
    selectedWorkoutCategory = category;
    
    // Update filter buttons
    document.querySelectorAll('.workout-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    
    // Filter and render
    const container = document.getElementById('workout-cards-container');
    if (!container) return;
    
    let filteredWorkouts;
    if (category === 'all') {
        filteredWorkouts = AppState.workoutPlans;
    } else {
        filteredWorkouts = AppState.workoutPlans.filter(workout => 
            getWorkoutCategory(workout.day || workout.name) === category
        );
    }
    
    renderWorkoutCards(filteredWorkouts);
}

export function searchTemplates(query) {
    if (!query.trim()) {
        loadTemplatesByCategory();
        return;
    }
    
    const searchTerm = query.toLowerCase();
    let templates = [];
    
    if (currentTemplateCategory === 'default') {
        templates = AppState.workoutPlans || [];
    } else if (currentTemplateCategory === 'custom') {
        // Would need to load custom templates here
        templates = [];
    }
    
    const filteredTemplates = templates.filter(template => {
        const name = (template.name || template.day || '').toLowerCase();
        const category = getWorkoutCategory(template.day || template.name).toLowerCase();
        const exercises = template.exercises?.map(ex => 
            getExerciseName(ex).toLowerCase()
        ).join(' ') || '';
        
        return name.includes(searchTerm) || 
               category.includes(searchTerm) || 
               exercises.includes(searchTerm);
    });
    
    renderTemplateCards(filteredTemplates);
}

// ===================================================================
// WORKOUT PREVIEW FUNCTIONALITY
// ===================================================================

// Add missing previewWorkout function
export function previewWorkout(workoutType) {
    const workout = AppState.workoutPlans.find(plan => 
        plan.day === workoutType || plan.name === workoutType || plan.id === workoutType
    );
    
    if (!workout) {
        console.error('❌ Workout not found');
        return;
    }
    
    // Show preview modal
    showWorkoutPreviewModal(workout);
}

function showWorkoutPreviewModal(workout) {
    // Create preview modal if it doesn't exist
    let modal = document.getElementById('workout-preview-modal');
    if (!modal) {
        createWorkoutPreviewModal();
        modal = document.getElementById('workout-preview-modal');
    }
    
    // Populate modal
    const title = document.getElementById('preview-workout-title');
    const content = document.getElementById('preview-workout-content');
    
    if (title) {
        title.textContent = workout.day || workout.name;
    }
    
    if (content) {
        content.innerHTML = generateWorkoutPreviewHtml(workout);
    }
    
    modal.classList.remove('hidden');
}

function createWorkoutPreviewModal() {
    const modalHtml = `
        <div id="workout-preview-modal" class="modal hidden">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="preview-workout-title">Workout Preview</h3>
                    <button class="close-btn" onclick="closeWorkoutPreviewModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div id="preview-workout-content">
                        <!-- Content will be populated here -->
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeWorkoutPreviewModal()">Close</button>
                    <button id="preview-start-workout" class="btn btn-primary">Start This Workout</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Add event listener for start workout button
    const startBtn = document.getElementById('preview-start-workout');
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            const title = document.getElementById('preview-workout-title');
            if (title) {
                closeWorkoutPreviewModal();
                
                // Import and use startWorkout function (dynamic import to avoid circular dependency)
                const { startWorkout } = await import('./workout-core.js');
                await startWorkout(title.textContent);
            }
        });
    }
}

function generateWorkoutPreviewHtml(workout) {
    const exerciseCount = workout.exercises?.length || 0;
    const estimatedDuration = calculateEstimatedDuration(workout);
    
    let html = `
        <div class="workout-preview-info">
            <div class="preview-stats">
                <div class="stat-item">
                    <span class="stat-label">Exercises:</span>
                    <span class="stat-value">${exerciseCount}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Estimated Duration:</span>
                    <span class="stat-value">${estimatedDuration} minutes</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Category:</span>
                    <span class="stat-value">${getWorkoutCategory(workout.day || workout.name)}</span>
                </div>
            </div>
        </div>
        <div class="workout-exercises-preview">
            <h4>Exercises in this workout:</h4>
    `;
    
    if (workout.exercises && workout.exercises.length > 0) {
        html += '<div class="exercises-preview-list">';
        workout.exercises.forEach((exercise, index) => {
            const exerciseName = getExerciseName(exercise);
            html += `
                <div class="exercise-preview-item">
                    <div class="exercise-preview-info">
                        <span class="exercise-name">${exerciseName}</span>
                        <span class="exercise-details">
                            ${exercise.sets || 3} sets × ${exercise.reps || 10} reps
                            ${exercise.weight ? ` @ ${exercise.weight} lbs` : ''}
                        </span>
                    </div>
                    ${exercise.bodyPart ? `<span class="exercise-body-part">${exercise.bodyPart}</span>` : ''}
                </div>
            `;
        });
        html += '</div>';
    } else {
        html += '<p>No exercises defined for this workout.</p>';
    }
    
    html += '</div>';
    return html;
}

function calculateEstimatedDuration(workout) {
    if (!workout.exercises) return 30;
    
    // Estimate 2-3 minutes per set + rest time
    let totalSets = 0;
    workout.exercises.forEach(exercise => {
        totalSets += exercise.sets || 3;
    });
    
    // 2.5 minutes per set (includes exercise time + rest)
    return Math.round(totalSets * 2.5);
}

export function closeWorkoutPreviewModal() {
    const modal = document.getElementById('workout-preview-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function renderWorkoutCards(workouts) {
    const container = document.getElementById('workout-cards-container');
    if (!container) return;
    
    if (workouts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>No Workouts Found</h3>
                <p>Try adjusting your filters or search terms.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    workouts.forEach(workout => {
        const card = createWorkoutCard(workout);
        container.appendChild(card);
    });
}

function createWorkoutCard(workout) {
    const card = document.createElement('div');
    card.className = 'workout-card';

    // Use name or day field (some workouts use name, others use day)
    const workoutName = workout.name || workout.day || 'Unnamed Workout';

    card.dataset.category = getWorkoutCategory(workoutName);

    const exerciseCount = workout.exercises?.length || 0;
    const exerciseNames = workout.exercises?.slice(0, 3).map(ex =>
        getExerciseName(ex)
    ).join(', ') || 'No exercises listed';
    const moreText = exerciseCount > 3 ? ` and ${exerciseCount - 3} more...` : '';

    card.innerHTML = `
        <div class="workout-header">
            <h3>${workoutName}</h3>
            <span class="workout-category">${getWorkoutCategory(workoutName)}</span>
        </div>
        <div class="workout-preview">
            <div class="exercise-count">${exerciseCount} exercises</div>
            <div class="exercise-list">${exerciseNames}${moreText}</div>
        </div>
        <div class="workout-actions">
            <button class="btn btn-primary" onclick="window.startWorkout('${workoutName}')">
                <i class="fas fa-play"></i> Start Workout
            </button>
            <button class="btn btn-secondary" onclick="previewWorkout('${workoutName}')">
                <i class="fas fa-eye"></i> Preview
            </button>
        </div>
    `;

    return card;
}

// ===================================================================
// ENHANCED TEMPLATE MANAGEMENT FUNCTIONS
// ===================================================================

export async function editTemplate(templateId) {
    
    if (!AppState.currentUser) {
        alert('Please sign in to edit templates');
        return;
    }
    
    try {
        // Load the template
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        
        let template = null;
        
        // Try to find in user templates first
        const userTemplates = await workoutManager.getUserWorkoutTemplates();
        template = userTemplates.find(t => t.id === templateId);
        
        if (!template) {
            console.error('❌ Template not found');
            return;
        }
        
        // Open template editor
        await openTemplateEditor(template);
        
    } catch (error) {
        console.error('Error editing template:', error);
        alert('Error loading template for editing');
    }
}

async function openTemplateEditor(template) {
    // Import the workout management module
    try {
        const { showTemplateEditorWithData } = await import('../workout/workout-management-ui.js');
        
        if (showTemplateEditorWithData) {
            showTemplateEditorWithData(template);
        } else {
            // Fallback: show basic editor
            showBasicTemplateEditor(template);
        }
    } catch (error) {
        // Fallback: show basic editor
        showBasicTemplateEditor(template);
    }
}

function showBasicTemplateEditor(template) {
    // Create a basic template editor modal if the advanced one isn't available
    let modal = document.getElementById('basic-template-editor-modal');
    if (!modal) {
        createBasicTemplateEditorModal();
        modal = document.getElementById('basic-template-editor-modal');
    }
    
    // Populate with template data
    const nameInput = document.getElementById('basic-template-name');
    const categorySelect = document.getElementById('basic-template-category');
    const exercisesList = document.getElementById('basic-template-exercises');
    
    if (nameInput) nameInput.value = template.name || '';
    if (categorySelect) categorySelect.value = template.category || 'Other';
    
    if (exercisesList) {
        exercisesList.innerHTML = '';
        if (template.exercises) {
            template.exercises.forEach((exercise, index) => {
                const exerciseItem = createBasicExerciseItem(exercise, index);
                exercisesList.appendChild(exerciseItem);
            });
        }
    }
    
    // Store template reference for saving
    modal.dataset.templateId = template.id;
    modal.templateData = template;
    
    modal.classList.remove('hidden');
}

function createBasicTemplateEditorModal() {
    const modalHtml = `
        <div id="basic-template-editor-modal" class="modal hidden">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3>Edit Template</h3>
                    <button class="close-btn" onclick="closeBasicTemplateEditor()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="template-editor-form">
                        <div class="form-group">
                            <label for="basic-template-name">Template Name:</label>
                            <input type="text" id="basic-template-name" class="form-input" placeholder="Enter template name">
                        </div>
                        <div class="form-group">
                            <label for="basic-template-category">Category:</label>
                            <select id="basic-template-category" class="form-select">
                                <option value="Push">Push</option>
                                <option value="Pull">Pull</option>
                                <option value="Legs">Legs</option>
                                <option value="Cardio">Cardio</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Exercises:</label>
                            <div id="basic-template-exercises" class="exercises-list">
                                <!-- Exercises will be populated here -->
                            </div>
                            <button type="button" class="btn btn-secondary" onclick="addExerciseToBasicTemplate()">
                                <i class="fas fa-plus"></i> Add Exercise
                            </button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeBasicTemplateEditor()">Cancel</button>
                    <button class="btn btn-primary" onclick="saveBasicTemplate()">Save Template</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function createBasicExerciseItem(exercise, index) {
    const item = document.createElement('div');
    item.className = 'basic-exercise-item';
    item.dataset.index = index;
    
    item.innerHTML = `
        <div class="exercise-info">
            <span class="exercise-name">${getExerciseName(exercise)}</span>
            <span class="exercise-details">
                ${exercise.sets || 3} sets × ${exercise.reps || 10} reps @ ${exercise.weight || 50} lbs
            </span>
        </div>
        <div class="exercise-actions">
            <button class="btn btn-small btn-secondary" onclick="editBasicExercise(${index})">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-small btn-danger" onclick="removeBasicExercise(${index})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    return item;
}

export function closeBasicTemplateEditor() {
    const modal = document.getElementById('basic-template-editor-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.templateData = null;
    }
}

export async function saveBasicTemplate() {
    const modal = document.getElementById('basic-template-editor-modal');
    if (!modal || !modal.templateData) return;
    
    const nameInput = document.getElementById('basic-template-name');
    const categorySelect = document.getElementById('basic-template-category');
    
    if (!nameInput?.value.trim()) {
        alert('Please enter a template name');
        return;
    }
    
    try {
        const updatedTemplate = {
            ...modal.templateData,
            name: nameInput.value.trim(),
            category: categorySelect?.value || 'Other',
            lastUpdated: new Date().toISOString()
        };
        
        const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        await workoutManager.saveWorkoutTemplate(updatedTemplate);
        
        closeBasicTemplateEditor();
        
        // Refresh templates if we're currently showing them
        if (currentTemplateCategory === 'custom') {
            loadTemplatesByCategory();
        }
        
    } catch (error) {
        console.error('Error saving template:', error);
        alert('Error saving template');
    }
}

// ===================================================================
// TEMPLATE UTILITIES
// ===================================================================

export function getWorkoutCategory(workoutName) {
    if (!workoutName) return 'Other';
    const name = workoutName.toLowerCase();
    if (name.includes('chest') || name.includes('push')) return 'Push';
    if (name.includes('back') || name.includes('pull')) return 'Pull';
    if (name.includes('legs') || name.includes('leg')) return 'Legs';
    if (name.includes('cardio') || name.includes('core')) return 'Cardio';
    return 'Other';
}

function getExerciseName(exercise) {
    if (!exercise) return 'Unknown Exercise';
    return exercise.name || exercise.machine || exercise.exercise || 'Unknown Exercise';
}

// ===================================================================
// MISSING UTILITY FUNCTIONS
// ===================================================================

export function clearTemplateFilters() {
    // Clear any active filters
    document.querySelectorAll('.template-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Reset to show all templates
    loadTemplatesByCategory();
}

export function refreshTemplates() {
    
    // Clear any cached data
    if (AppState.workoutPlans) {
        AppState.workoutPlans = [];
    }
    
    // Reload templates
    loadTemplatesByCategory();
}

// ===================================================================
// STATE GETTERS (for coordination with main.js)
// ===================================================================

export function getSelectedWorkoutCategory() {
    return selectedWorkoutCategory;
}

export function getCurrentTemplateCategory() {
    return currentTemplateCategory;
}

export function setSelectedWorkoutCategory(category) {
    selectedWorkoutCategory = category;
}

export function setCurrentTemplateCategory(category) {
    currentTemplateCategory = category;
}

// ===================================================================
// WINDOW FUNCTION ASSIGNMENTS (for HTML onclick handlers)
// ===================================================================

window.addExerciseToBasicTemplate = function() {
    const modal = document.getElementById('basic-template-editor-modal');
    if (!modal || !modal.templateData) return;

    const exerciseName = prompt('Exercise name:');
    if (!exerciseName) return;

    const sets = parseInt(prompt('Number of sets:', '3') || '3');
    const reps = parseInt(prompt('Number of reps:', '10') || '10');
    const weight = parseFloat(prompt('Weight (lbs):', '50') || '50');

    modal.templateData.exercises.push({
        name: exerciseName.trim(),
        sets: sets,
        reps: reps,
        weight: weight
    });

    showBasicTemplateEditor(modal.templateData);
};

window.editBasicExercise = function(index) {
    const modal = document.getElementById('basic-template-editor-modal');
    if (!modal || !modal.templateData || index >= modal.templateData.exercises.length) return;

    const exercise = modal.templateData.exercises[index];

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

    showBasicTemplateEditor(modal.templateData);
};

window.removeBasicExercise = function(index) {
    const modal = document.getElementById('basic-template-editor-modal');
    if (!modal || !modal.templateData) return;
    
    if (confirm('Remove this exercise from the template?')) {
        modal.templateData.exercises.splice(index, 1);
        showBasicTemplateEditor(modal.templateData);
    }
};