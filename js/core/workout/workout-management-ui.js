// Workout Management UI Functions
import { AppState } from '../utils/app-state.js';
import { getCategoryIcon } from '../utils/config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { showNotification, setHeaderMode, escapeHtml, escapeAttr, openModal, closeModal } from '../ui/ui-helpers.js';
import { saveWorkoutData } from '../data/data-manager.js';
import { reorderTemplateExercise, normalizeWorkoutToTemplate } from '../utils/template-helpers.js';
import { getSessionLocation, detectLocation } from '../features/location-service.js';
import { setBottomNavVisible } from '../ui/navigation.js';
import { groupExercises, ungroupExercise } from '../features/superset-manager.js';
import {
    getEquipmentAtLocation,
    getExercisesAtLocation,
    rankExercisesForLocation,
} from '../features/equipment-planner.js';

let workoutManager;
let currentEditingTemplate = null;
let exerciseLibrary = [];
let filteredExercises = [];
let allWorkoutTemplates = [];
let currentWorkoutCategory = '';

// Track which containers already have delegation listeners
const delegatedContainers = new WeakSet();

function setupWorkoutManagementDelegation(container) {
    if (!container || delegatedContainers.has(container)) return;
    delegatedContainers.add(container);

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        e.stopPropagation(); // Preserve original stopPropagation behavior for edit buttons
        const action = btn.dataset.action;

        if (action === 'editTemplate') {
            window.editTemplate(btn.dataset.templateId, btn.dataset.isDefault === 'true');
        }
    });
}

export function initializeWorkoutManagement(appState) {
    workoutManager = new FirebaseWorkoutManager(appState);

    // Listen for exercise library updates from exercise-manager-ui
    window.addEventListener('exerciseLibraryUpdated', async () => {
        const libraryModal = document.getElementById('exercise-library-section');
        if (libraryModal && (libraryModal.open || !libraryModal.classList.contains('hidden'))) {
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
    const sections = [
        'dashboard',
        'workout-selector',
        'active-workout',
        'workout-history-section',
        'muscle-group-detail-section',
        'exercise-detail-section',
        'composition-detail-section',
        'exercise-manager-section',
        'location-management-section',
    ];
    sections.forEach((id) => {
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
        templates.forEach((template) => {
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

            const filtered = allWorkoutTemplates.filter(
                (t) =>
                    t.name?.toLowerCase().includes(query) ||
                    t.exercises?.some((ex) => (ex.name || ex.machine || '').toLowerCase().includes(query))
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
        filtered = allWorkoutTemplates.filter((t) => {
            const templateCategory = (t.category || t.type || 'other').toLowerCase();
            const searchCategory = category.toLowerCase();
            return templateCategory.includes(searchCategory) || t.name?.toLowerCase().includes(searchCategory);
        });
    }

    renderFilteredWorkouts(filtered);
}

// Render filtered workouts to container
function renderFilteredWorkouts(templates, titleOverride = null) {
    const container = document.getElementById('all-templates');
    const titleEl = document.getElementById('workout-list-title');

    if (!container) return;

    setupWorkoutManagementDelegation(container);

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
    templates.forEach((template) => {
        const card = createTemplateCard(template);
        container.appendChild(card);
    });
}

// Create a simple workout card (like exercise library)
function createTemplateCard(template) {
    const card = document.createElement('div');
    card.className = 'workout-list-item';

    // Handle both array and object exercise structures
    const exercisesArray = normalizeExercisesToArray(template.exercises);
    const exerciseCount = exercisesArray.length;
    const isDefault = template.isDefault || false;

    // Get category icon
    const categoryIcon = getCategoryIcon(template.category || template.type);

    // Create exercise summary (just names, comma separated)
    let exerciseSummary = 'No exercises';
    if (exerciseCount > 0) {
        const names = exercisesArray.slice(0, 4).map((ex) => ex.name || ex.machine);
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
            <div class="workout-item-name">${escapeHtml(template.name)}</div>
            <div class="workout-item-meta">${exerciseCount} exercises</div>
            <div class="workout-item-exercises">${escapeHtml(exerciseSummary)}</div>
        </div>
        <button class="workout-item-edit" data-action="editTemplate" data-template-id="${escapeAttr(template.id)}" data-is-default="${isDefault}">
            EDIT
        </button>
    `;

    // Click on card to use the workout (but not when clicking EDIT)
    card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        useTemplate(template.id, isDefault);
    });

    return card;
}

// getCategoryIcon is now imported from config.js

/**
 * Normalize exercises to array format
 * Handles both array format: [{...}, {...}]
 * and object format: {exercise_0: {...}, exercise_1: {...}}
 */
function normalizeExercisesToArray(exercises) {
    if (!exercises) return [];

    // If already an array, return as-is
    if (Array.isArray(exercises)) {
        return exercises;
    }

    // If it's an object (e.g., {exercise_0: {...}, exercise_1: {...}}), convert to array
    if (typeof exercises === 'object') {
        const keys = Object.keys(exercises).sort(); // Sort to maintain order
        return keys.map((key) => exercises[key]).filter((ex) => ex); // Filter out null/undefined
    }

    return [];
}

export function saveWorkoutAsTemplate(workoutData) {
    const template = normalizeWorkoutToTemplate(workoutData);
    if (!template) {
        showNotification('Could not convert workout to template', 'error');
        return;
    }

    currentEditingTemplate = {
        name: '',
        category: template.category,
        exercises: template.exercises,
    };

    // Show the template editor (it will be pre-populated)
    showTemplateEditor();

    // Pre-fill name suggestion from workout type
    setTimeout(() => {
        const nameInput = document.getElementById('template-name');
        if (nameInput && workoutData.workoutType) {
            nameInput.value = workoutData.workoutType;
            nameInput.select();
        }
    }, 50);
}

export function createNewTemplate() {
    currentEditingTemplate = {
        name: '',
        category: 'Other',
        exercises: [],
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
            template = allDefaults.find((t) => (t.id || t.day) === templateId);

            if (!template) {
                console.error('❌ Default template not found:', templateId);
                alert('Default template not found');
                return;
            }
        } else {
            // Load from user templates
            const templates = await manager.getUserWorkoutTemplates();
            template = templates.find((t) => t.id === templateId);

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
            overridesDefault: isDefault ? template.id || template.day : template.overridesDefault,
            isEditingDefault: isDefault,
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
        const template = allDefaults.find((t) => (t.id || t.day) === templateId);
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
                    hiddenAt: new Date().toISOString(),
                };
                await workoutManager.saveWorkoutTemplate(hiddenMarker);
            } else {
                // Actually delete the custom template
                await workoutManager.deleteWorkoutTemplate(templateId);
            }

            // Reload AppState and UI
            AppState.workoutPlans = await workoutManager.getUserWorkoutTemplates();
            await loadAllTemplatesInBackground();
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
            const override = templates.find((t) => t.overridesDefault === defaultTemplateId);

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
    const templateEditor = document.getElementById('template-editor-section');
    const editorContent = document.getElementById('template-editor-content');

    if (!templateEditor || !editorContent) {
        console.error('❌ Template editor modal not found');
        showNotification('Template editor not available', 'error');
        return;
    }

    const cat = (currentEditingTemplate.category || 'other').toLowerCase();
    const days = currentEditingTemplate.suggestedDays || [];
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const dayValues = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    const categories = [
        { value: 'push', label: 'Push', icon: 'fa-hand-paper', color: 'var(--cat-push)' },
        { value: 'pull', label: 'Pull', icon: 'fa-fist-raised', color: 'var(--cat-pull)' },
        { value: 'legs', label: 'Legs', icon: 'fa-walking', color: 'var(--cat-legs)' },
        { value: 'core', label: 'Core', icon: 'fa-bullseye', color: 'var(--cat-core)' },
        { value: 'cardio', label: 'Cardio', icon: 'fa-heartbeat', color: 'var(--warning)' },
        { value: 'other', label: 'Mixed', icon: 'fa-th', color: 'var(--text-secondary)' },
    ];

    // Update the existing full-page header (defined in index.html)
    const headerTitle = templateEditor.querySelector('#template-editor-title');
    if (headerTitle) headerTitle.textContent = currentEditingTemplate.name ? 'Edit Workout' : 'Create Workout';

    // Replace the header action slot with a Save button
    const headerAction = templateEditor.querySelector('.full-page-header-action');
    if (headerAction) {
        headerAction.innerHTML = `<button class="btn-save" onclick="saveCurrentTemplate()">Save</button>`;
    }

    // Build the workout editor form — redesigned (no duplicate header)
    editorContent.innerHTML = `
        <div style="padding: 14px 16px 100px;">
            <div class="field">
                <div class="field-label">Name</div>
                <input class="field-input" id="template-name"
                       value="${escapeAttr(currentEditingTemplate.name)}"
                       placeholder="e.g. Push Day">
            </div>

            <div class="field">
                <div class="field-label">Category</div>
                <div class="chips" id="template-category-chips">
                    ${categories.map(c => `
                        <div class="chip ${cat === c.value ? 'active' : ''}"
                             style="${cat === c.value ? `color:${c.color};border-color:${c.color};background:${c.color}15;` : ''}"
                             onclick="selectTemplateCategory('${c.value}', this)" data-cat="${c.value}">
                            <i class="fas ${c.icon}" style="color:${c.color};"></i> ${c.label}
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="field">
                <div class="field-label">Schedule (optional)</div>
                <div class="day-chips" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">
                    ${dayLabels.map((label, i) => `
                        <div class="day-chip ${days.includes(dayValues[i]) ? 'active' : ''}"
                             style="aspect-ratio:1;background:${days.includes(dayValues[i]) ? 'var(--primary)' : 'var(--bg-card)'};border:1.5px solid ${days.includes(dayValues[i]) ? 'var(--primary)' : 'var(--border-subtle)'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:600;color:${days.includes(dayValues[i]) ? '#04201a' : 'var(--text-secondary)'};cursor:pointer;"
                             onclick="toggleTemplateDay('${dayValues[i]}', this)">
                            ${label}
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="sec-head"><h3>Exercises <span class="count">${currentEditingTemplate.exercises.length}</span></h3></div>

            <!-- Estimated stats -->
            <div id="template-est-stats" class="est-stats"></div>

            <div id="template-exercises" class="template-exercises-list">
                <!-- Populated by renderTemplateExercises() -->
            </div>

            <div class="inline-add-exercise">
                <div id="quick-add-chips" class="quick-add-chips">
                    <!-- Populated by renderQuickAddChips() -->
                </div>
                <div class="inline-search-wrapper">
                    <i class="fas fa-search inline-search-icon"></i>
                    <input type="text"
                           id="inline-exercise-search"
                           class="form-input"
                           placeholder="Search exercises to add..."
                           autocomplete="off">
                </div>
                <div id="inline-search-results" class="inline-search-results hidden">
                    <!-- Populated by search -->
                </div>
            </div>
        </div>

    `;

    // Show as full-page section
    templateEditor.classList.remove('hidden');

    // Render the exercises list
    renderTemplateExercises();

    // Wire up inline exercise search
    setupInlineExerciseSearch();
}

// Inline search state
let inlineSearchExercises = [];

async function setupInlineExerciseSearch() {
    // Preload exercise library
    if (workoutManager) {
        inlineSearchExercises = await workoutManager.getExerciseLibrary();
    }

    const searchInput = document.getElementById('inline-exercise-search');
    if (!searchInput) return;

    // Replace the node to remove old listeners
    const fresh = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(fresh, searchInput);

    // Render quick-add chips from user's template exercises
    renderQuickAddChips();

    fresh.addEventListener('input', () => {
        const query = fresh.value.trim().toLowerCase();
        if (query.length < 2) {
            hideInlineSearchResults();
            return;
        }
        showInlineSearchResults(query);
    });

    fresh.addEventListener('focus', () => {
        const query = fresh.value.trim().toLowerCase();
        if (query.length >= 2) showInlineSearchResults(query);
    });
}

function renderQuickAddChips() {
    const container = document.getElementById('quick-add-chips');
    if (!container) return;

    // Build frequency map from all user templates
    const frequencyMap = new Map();
    const templates = allWorkoutTemplates.length > 0 ? allWorkoutTemplates : AppState.workoutPlans || [];

    templates.forEach((t) => {
        const exercises = Array.isArray(t.exercises) ? t.exercises : [];
        exercises.forEach((ex) => {
            const name = ex.name || ex.machine;
            if (!name) return;
            frequencyMap.set(name, (frequencyMap.get(name) || 0) + 1);
        });
    });

    // Get exercises already in the current template
    const existing = currentEditingTemplate
        ? new Set(currentEditingTemplate.exercises.map((ex) => (ex.name || ex.machine || '').toLowerCase()))
        : new Set();

    // Sort by frequency and take top 6 that aren't already in this template
    const topExercises = [...frequencyMap.entries()]
        .filter(([name]) => !existing.has(name.toLowerCase()))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    if (topExercises.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `<div class="quick-add-label">Quick add:</div>` +
        topExercises
            .map(([name]) => {
                const exercise = inlineSearchExercises.find(
                    (ex) => (ex.name || ex.machine) === name
                );
                if (!exercise) return '';
                return `<button type="button" class="quick-add-chip"
                            data-exercise-id="${escapeAttr(exercise.id || name)}">${escapeHtml(name)}</button>`;
            })
            .join('');

    // Add click handlers
    container.querySelectorAll('.quick-add-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            const id = chip.dataset.exerciseId;
            const exercise = inlineSearchExercises.find((ex) => (ex.id || ex.name || ex.machine) === id);
            if (exercise) {
                // Quick-add with default equipment
                const exerciseName = exercise.name || exercise.machine;
                const templateExercise = {
                    name: exerciseName,
                    machine: exercise.machine || exercise.name,
                    bodyPart: exercise.bodyPart || '',
                    equipmentType: exercise.equipmentType || '',
                    equipment: exercise.equipment || '',
                    equipmentLocation: exercise.equipmentLocation || '',
                    sets: exercise.sets || 3,
                    reps: exercise.reps || 10,
                    weight: exercise.weight || 50,
                    video: exercise.video || '',
                };
                currentEditingTemplate.exercises.push(templateExercise);
                renderTemplateExercises();
                renderQuickAddChips(); // Refresh chips to remove the added one
            }
        });
    });
}

function showInlineSearchResults(query) {
    const resultsEl = document.getElementById('inline-search-results');
    if (!resultsEl) return;

    const existing = currentEditingTemplate
        ? new Set(currentEditingTemplate.exercises.map((ex) => (ex.name || ex.machine || '').toLowerCase()))
        : new Set();

    const matches = inlineSearchExercises
        .filter((ex) => {
            const name = (ex.name || ex.machine || '').toLowerCase();
            const bodyPart = (ex.bodyPart || '').toLowerCase();
            const tags = (ex.tags || []).join(' ').toLowerCase();
            return name.includes(query) || bodyPart.includes(query) || tags.includes(query);
        })
        .slice(0, 8);

    if (matches.length === 0) {
        resultsEl.innerHTML = `<div class="inline-search-empty">No exercises found. <a href="#" onclick="event.preventDefault(); showCreateExerciseForm()">Create one</a></div>`;
        resultsEl.classList.remove('hidden');
        return;
    }

    resultsEl.innerHTML = matches
        .map((ex) => {
            const name = escapeHtml(ex.name || ex.machine);
            const bodyPart = ex.bodyPart ? ` <span class="inline-result-meta">${escapeHtml(ex.bodyPart)}</span>` : '';
            const alreadyAdded = existing.has((ex.name || ex.machine || '').toLowerCase());
            return `<div class="inline-search-result ${alreadyAdded ? 'inline-result-added' : ''}"
                         data-exercise-id="${escapeAttr(ex.id || ex.name || ex.machine)}"
                         ${alreadyAdded ? 'title="Already in workout"' : ''}>
                        <span class="inline-result-name">${name}</span>${bodyPart}
                        ${alreadyAdded ? '<i class="fas fa-check inline-result-check"></i>' : ''}
                    </div>`;
        })
        .join('');

    resultsEl.classList.remove('hidden');

    // Add click handlers
    resultsEl.querySelectorAll('.inline-search-result:not(.inline-result-added)').forEach((el) => {
        el.addEventListener('click', () => {
            const id = el.dataset.exerciseId;
            const exercise = inlineSearchExercises.find((ex) => (ex.id || ex.name || ex.machine) === id);
            if (exercise) selectInlineExercise(exercise);
        });
    });
}

function hideInlineSearchResults() {
    const resultsEl = document.getElementById('inline-search-results');
    if (resultsEl) resultsEl.classList.add('hidden');
}

async function selectInlineExercise(exercise) {
    hideInlineSearchResults();

    // Clear search input
    const searchInput = document.getElementById('inline-exercise-search');
    if (searchInput) searchInput.value = '';

    // Add immediately — equipment can be set via the inline edit accordion
    const exerciseName = exercise.name || exercise.machine;
    const templateExercise = {
        name: exerciseName,
        machine: exercise.machine || exercise.name,
        bodyPart: exercise.bodyPart || '',
        equipmentType: exercise.equipmentType || '',
        equipment: exercise.equipment || '',
        equipmentLocation: exercise.equipmentLocation || '',
        sets: exercise.sets || 3,
        reps: exercise.reps || 10,
        weight: exercise.weight || 50,
        video: exercise.video || '',
    };

    currentEditingTemplate.exercises.push(templateExercise);
    renderTemplateExercises();
    renderQuickAddChips();

    // Auto-open the inline edit for the newly added exercise so user can set equipment
    const newIndex = currentEditingTemplate.exercises.length - 1;
    editTemplateExercise(newIndex);
}

// Keep exports for backward compat with window assignments
export function confirmInlineAdd() {}
export function cancelInlineAdd() {
    hideInlineSearchResults();
}

export function closeTemplateEditor() {
    const templateEditor = document.getElementById('template-editor-section');
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
    const selectedDays = Array.from(dayCheckboxes).map((cb) => cb.value);

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
        await loadAllTemplatesInBackground();
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

    // Update the estimated stats
    updateTemplateEstStats();

    // Update exercise count
    const countEl = document.querySelector('.sec-head .count');
    if (countEl) countEl.textContent = currentEditingTemplate.exercises.length;

    // Add the superset selection action bar
    ensureSupersetBar(container);
}

function ensureSupersetBar(container) {
    let bar = document.getElementById('superset-action-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'superset-action-bar';
        bar.className = 'superset-action-bar hidden';
        bar.innerHTML = `
            <button type="button" class="btn btn-primary btn-small" onclick="groupSelectedTemplateExercises()">
                <i class="fas fa-link"></i> Group as Superset
            </button>
        `;
        container.parentNode.appendChild(bar);
    }
}

export function updateSupersetSelectionBar() {
    const checkboxes = document.querySelectorAll('.superset-select-checkbox:checked');
    const bar = document.getElementById('superset-action-bar');
    if (!bar) return;
    if (checkboxes.length >= 2) {
        bar.classList.remove('hidden');
    } else {
        bar.classList.add('hidden');
    }
}

export function groupSelectedTemplateExercises() {
    if (!currentEditingTemplate) return;

    const checkboxes = document.querySelectorAll('.superset-select-checkbox:checked');
    const indices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
    if (indices.length < 2) return;

    // Convert array to object format for groupExercises()
    const exercisesObj = {};
    currentEditingTemplate.exercises.forEach((ex, i) => {
        exercisesObj[`exercise_${i}`] = ex;
    });

    const letter = groupExercises(indices, exercisesObj);
    if (letter) {
        showNotification(`Grouped as Superset ${letter}`, 'success');
    }

    renderTemplateExercises();
}

export function ungroupTemplateExercise(index) {
    if (!currentEditingTemplate || index >= currentEditingTemplate.exercises.length) return;

    // Convert array to object format for ungroupExercise()
    const exercisesObj = {};
    currentEditingTemplate.exercises.forEach((ex, i) => {
        exercisesObj[`exercise_${i}`] = ex;
    });

    ungroupExercise(index, exercisesObj);
    renderTemplateExercises();
}

function createTemplateExerciseItem(exercise, index) {
    const item = document.createElement('div');
    item.className = 'template-exercise-item';
    item.dataset.exerciseIndex = index;

    const group = exercise.group || null;
    const groupBadge = group
        ? `<span class="superset-badge" style="background: var(--primary); color: var(--bg-app); font-size: 0.6rem; padding: 1px 6px; border-radius: var(--radius-pill); margin-right: 4px;">${escapeHtml(group)}</span>`
        : '';

    const weight = exercise.weight || 0;
    const unit = AppState.globalUnit || 'lbs';
    const displayWeight = unit === 'kg' ? Math.round(weight * 0.453592 * 2) / 2 : weight;

    item.innerHTML = `
        <div class="ex-row" onclick="editTemplateExercise(${index})" style="cursor:pointer;">
            <i class="fas fa-grip-vertical ex-drag" style="color:var(--text-muted);font-size:0.9rem;padding:4px;margin-left:-4px;"></i>
            <div class="ex-info" style="flex:1;min-width:0;">
                <div class="ex-name" style="font-size:0.92rem;font-weight:600;color:var(--text-strong);margin-bottom:3px;">${groupBadge}${escapeHtml(exercise.name || exercise.machine || 'Exercise')}</div>
                <div class="ex-meta" style="display:flex;align-items:center;gap:8px;font-size:0.72rem;color:var(--text-muted);">
                    <span class="ex-meta-chip" style="background:var(--bg-card-hi);padding:2px 8px;border-radius:var(--radius-pill);font-variant-numeric:tabular-nums;">${exercise.sets || 3} × ${exercise.reps || 10}${weight ? ` @ ${displayWeight} ${unit === 'kg' ? 'kg' : 'lb'}` : ''}</span>
                </div>
                ${exercise.equipment ? `
                    <div class="ex-equip" style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);margin-top:4px;">
                        <i class="fas fa-cog" style="font-size:0.68rem;color:var(--primary);opacity:0.8;"></i> ${escapeHtml(exercise.equipment)}
                    </div>
                ` : ''}
            </div>
            <button class="ex-menu" style="width:32px;height:32px;border-radius:50%;background:transparent;color:var(--text-muted);display:flex;align-items:center;justify-content:center;border:none;flex-shrink:0;" onclick="event.stopPropagation(); toggleTemplateExerciseMenu(${index})">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
        <div class="template-ex-overflow hidden" id="template-ex-menu-${index}" style="background:var(--bg-card-hi);border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:4px 0;margin-bottom:8px;box-shadow:var(--shadow-md);">
            <div style="padding:10px 14px;font-size:0.82rem;color:var(--text-main);display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="editTemplateExercise(${index})"><i class="fas fa-pen" style="width:14px;color:var(--text-muted);"></i>Edit details</div>
            <div style="padding:10px 14px;font-size:0.82rem;color:var(--text-main);display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="moveTemplateExercise(${index}, 'up')"><i class="fas fa-arrow-up" style="width:14px;color:var(--text-muted);"></i>Move up</div>
            <div style="padding:10px 14px;font-size:0.82rem;color:var(--text-main);display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="moveTemplateExercise(${index}, 'down')"><i class="fas fa-arrow-down" style="width:14px;color:var(--text-muted);"></i>Move down</div>
            <div style="border-top:1px solid var(--border-subtle);padding:10px 14px;font-size:0.82rem;color:var(--danger);display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="removeTemplateExercise(${index})"><i class="fas fa-trash" style="width:14px;"></i>Remove</div>
        </div>
        <div class="exercise-inline-edit hidden" id="inline-edit-${index}">
            <div class="inline-edit-fields">
                <div class="inline-edit-row">
                    <div class="inline-edit-field">
                        <label>Sets</label>
                        <input type="text" inputmode="numeric" pattern="[0-9]*" class="form-input" id="inline-sets-${index}" value="${exercise.sets || 3}">
                    </div>
                    <div class="inline-edit-field">
                        <label>Reps</label>
                        <input type="text" inputmode="numeric" pattern="[0-9]*" class="form-input" id="inline-reps-${index}" value="${exercise.reps || 10}">
                    </div>
                    <div class="inline-edit-field">
                        <label>Weight</label>
                        <input type="text" inputmode="decimal" class="form-input" id="inline-weight-${index}" value="${exercise.weight || 0}">
                    </div>
                </div>
                <div class="inline-edit-row">
                    <div class="inline-edit-field inline-edit-field-wide">
                        <label>Equipment</label>
                        <input type="text" class="form-input" id="inline-equipment-${index}" value="${escapeAttr(exercise.equipment || '')}" placeholder="e.g., Hammer Strength Flat">
                    </div>
                </div>
                <div class="inline-edit-row">
                    <div class="inline-edit-field inline-edit-field-wide">
                        <label>Notes</label>
                        <input type="text" class="form-input" id="inline-notes-${index}" value="${escapeAttr(exercise.notes || '')}" placeholder="Optional notes">
                    </div>
                </div>
            </div>
            <div class="inline-edit-actions">
                <button type="button" class="btn btn-primary" onclick="saveInlineEdit(${index})">
                    <i class="fas fa-check"></i> Done
                </button>
            </div>
        </div>
    `;

    return item;
}

/**
 * Toggle the overflow menu for a template exercise row.
 */
function toggleTemplateExerciseMenu(index) {
    const menu = document.getElementById(`template-ex-menu-${index}`);
    if (!menu) return;
    // Close all other menus
    document.querySelectorAll('.template-ex-overflow').forEach(m => {
        if (m !== menu) m.classList.add('hidden');
    });
    menu.classList.toggle('hidden');
}

/**
 * Select a category chip in the template editor.
 */
export function selectTemplateCategory(value, el) {
    if (!currentEditingTemplate) return;
    currentEditingTemplate.category = value;
    // Update chip active states
    const container = el.parentElement;
    container.querySelectorAll('.chip').forEach(c => {
        c.classList.remove('active');
        c.style.removeProperty('color');
        c.style.removeProperty('border-color');
        c.style.removeProperty('background');
    });
    el.classList.add('active');
}

/**
 * Toggle a day chip in the template editor schedule.
 */
export function toggleTemplateDay(day, el) {
    if (!currentEditingTemplate) return;
    if (!currentEditingTemplate.suggestedDays) currentEditingTemplate.suggestedDays = [];

    const idx = currentEditingTemplate.suggestedDays.indexOf(day);
    if (idx >= 0) {
        currentEditingTemplate.suggestedDays.splice(idx, 1);
        el.classList.remove('active');
        el.style.background = 'var(--bg-card)';
        el.style.borderColor = 'var(--border-subtle)';
        el.style.color = 'var(--text-secondary)';
    } else {
        currentEditingTemplate.suggestedDays.push(day);
        el.classList.add('active');
        el.style.background = 'var(--primary)';
        el.style.borderColor = 'var(--primary)';
        el.style.color = '#04201a';
    }
}

/**
 * Update the estimated stats bar in the template editor.
 */
function updateTemplateEstStats() {
    const container = document.getElementById('template-est-stats');
    if (!container || !currentEditingTemplate) return;

    const exercises = currentEditingTemplate.exercises || [];
    if (exercises.length === 0) {
        container.innerHTML = '';
        return;
    }

    let totalSets = 0;
    let totalReps = 0;
    exercises.forEach(ex => {
        const sets = ex.sets || 3;
        const reps = ex.reps || 10;
        totalSets += sets;
        totalReps += sets * reps;
    });
    const estMinutes = Math.round(totalSets * 2.5); // ~2.5 min per set including rest

    container.innerHTML = `
        <div class="est-stat" style="text-align:center;">
            <div class="est-val" style="font-size:1.1rem;font-weight:700;color:var(--text-strong);">${totalSets}</div>
            <div class="est-label" style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-top:2px;">Sets</div>
        </div>
        <div class="est-stat" style="text-align:center;">
            <div class="est-val" style="font-size:1.1rem;font-weight:700;color:var(--text-strong);">${totalReps}</div>
            <div class="est-label" style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-top:2px;">Reps</div>
        </div>
        <div class="est-stat" style="text-align:center;">
            <div class="est-val" style="font-size:1.1rem;font-weight:700;color:var(--text-strong);">~${estMinutes}m</div>
            <div class="est-label" style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-top:2px;">Est time</div>
        </div>
    `;
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

    const editPanel = document.getElementById(`inline-edit-${index}`);
    if (!editPanel) return;

    // If this panel is already open, close it
    if (!editPanel.classList.contains('hidden')) {
        editPanel.classList.add('hidden');
        editingTemplateExerciseIndex = null;
        return;
    }

    // Close any other open panel
    if (editingTemplateExerciseIndex !== null && editingTemplateExerciseIndex !== index) {
        const prevPanel = document.getElementById(`inline-edit-${editingTemplateExerciseIndex}`);
        if (prevPanel) prevPanel.classList.add('hidden');
    }

    // Open this panel
    editPanel.classList.remove('hidden');
    editingTemplateExerciseIndex = index;

    // Focus the sets input
    const setsInput = document.getElementById(`inline-sets-${index}`);
    if (setsInput) setsInput.focus();
}

export function saveInlineEdit(index) {
    if (!currentEditingTemplate || index >= currentEditingTemplate.exercises.length) return;

    const exercise = currentEditingTemplate.exercises[index];
    const sets = parseInt(document.getElementById(`inline-sets-${index}`)?.value) || exercise.sets;
    const reps = parseInt(document.getElementById(`inline-reps-${index}`)?.value) || exercise.reps;
    const weight = parseFloat(document.getElementById(`inline-weight-${index}`)?.value) ?? exercise.weight;
    const equipment = document.getElementById(`inline-equipment-${index}`)?.value.trim() || null;
    const notes = document.getElementById(`inline-notes-${index}`)?.value.trim() || null;

    exercise.sets = sets;
    exercise.reps = reps;
    exercise.weight = weight;
    exercise.equipment = equipment;
    exercise.notes = notes;

    // Close the panel and re-render to show updated values
    editingTemplateExerciseIndex = null;
    renderTemplateExercises();
}

export function closeTemplateExerciseEdit() {
    const modal = document.getElementById('template-exercise-edit-modal');
    if (modal) closeModal(modal);
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

export function moveTemplateExercise(index, direction) {
    if (!currentEditingTemplate) return;
    currentEditingTemplate.exercises = reorderTemplateExercise(currentEditingTemplate.exercises, index, direction);
    renderTemplateExercises();
}

export function removeTemplateExercise(index) {
    if (!currentEditingTemplate) return;

    const exercise = currentEditingTemplate.exercises[index];
    const name = exercise?.name || 'this exercise';

    if (!confirm(`Remove "${name}" from this template?`)) return;

    currentEditingTemplate.exercises.splice(index, 1);
    renderTemplateExercises();
}

// Exercise Library functions
let recentExercises = [];
let gymSuggestedExercises = [];
let gymLocationName = null;

export async function openExerciseLibrary(mode = 'template') {
    const modal = document.getElementById('exercise-library-section');
    if (!modal) return;

    // Show as full-page section (no longer a dialog)
    modal.classList.remove('hidden');

    // Load exercise library, recent exercises, and equipment data in parallel
    const [library, , allEquipment, savedLocations] = await Promise.all([
        workoutManager.getExerciseLibrary(),
        workoutManager.getMostUsedExercises(8).then((r) => { recentExercises = r; }).catch(() => { recentExercises = []; }),
        workoutManager.getUserEquipment().catch(() => []),
        workoutManager.getUserLocations().catch(() => []),
    ]);
    exerciseLibrary = library;
    filteredExercises = [...exerciseLibrary];

    // Compute gym-suggested exercises (Phase 16.2)
    gymSuggestedExercises = [];
    gymLocationName = null;
    try {
        let locationName = getSessionLocation();
        if (!locationName && savedLocations.length > 0) {
            const result = await detectLocation(savedLocations);
            if (result.location) {
                locationName = result.location.name;
            }
        }
        if (locationName && allEquipment.length > 0) {
            gymLocationName = locationName;
            const locationEquipment = getEquipmentAtLocation(allEquipment, locationName);
            const availableExercises = getExercisesAtLocation(locationEquipment);
            gymSuggestedExercises = rankExercisesForLocation(availableExercises, recentExercises, exerciseLibrary);
        }
    } catch {
        // Non-critical — gym suggestions just won't appear
    }

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
    const modal = document.getElementById('exercise-library-section');
    if (modal) {
        modal.classList.add('hidden');
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
    filteredExercises.forEach((exercise) => {
        const bodyPart = exercise.bodyPart || 'General';
        if (!grouped[bodyPart]) {
            grouped[bodyPart] = [];
        }
        grouped[bodyPart].push(exercise);
    });

    // Sort body parts alphabetically
    const sortedBodyParts = Object.keys(grouped).sort();

    // Check if search/filter is active
    const searchQuery = document.getElementById('exercise-library-search')?.value || '';
    const bodyPartFilter = document.getElementById('body-part-filter')?.value || '';
    const equipmentFilterVal = document.getElementById('equipment-filter')?.value || '';
    const isFiltered = !!(searchQuery || bodyPartFilter || equipmentFilterVal);

    // Quick Add chips for recently used exercises
    const quickAddHTML = (recentExercises.length > 0)
        ? `<div class="quick-add-section">
            <div class="quick-add-label">Quick Add</div>
            <div class="quick-add-chips">
                ${recentExercises.map((ex) => `<button class="quick-add-chip" data-exercise-name="${escapeAttr(ex.name)}" data-equipment="${escapeAttr(ex.equipment)}">${escapeHtml(ex.name)}</button>`).join('')}
            </div>
        </div>`
        : '';

    // Gym-suggested exercises (Phase 16.2) — only in unfiltered view
    const gymSuggestedHTML = (!isFiltered && gymSuggestedExercises.length > 0 && gymLocationName)
        ? `<div class="quick-add-section">
            <div class="quick-add-label"><i class="fas fa-map-marker-alt"></i> Suggested for ${escapeHtml(gymLocationName)}</div>
            <div class="quick-add-chips">
                ${gymSuggestedExercises.slice(0, 12).map((ex) => {
                    const name = ex.name || ex.machine;
                    const chipClass = ex.usedBefore ? 'quick-add-chip quick-add-chip--used' : 'quick-add-chip';
                    return `<button class="${chipClass}" data-exercise-name="${escapeAttr(name)}" data-equipment="${escapeAttr(ex.equipment || '')}">${escapeHtml(name)}</button>`;
                }).join('')}
            </div>
        </div>`
        : '';

    // Render grouped exercises
    grid.innerHTML = quickAddHTML + gymSuggestedHTML + sortedBodyParts
        .map((bodyPart) => {
            const exercises = grouped[bodyPart];
            const exerciseCards = exercises
                .map((exercise) => {
                    const exerciseName = exercise.name || exercise.machine;
                    return `<div class="library-exercise-card" data-exercise-id="${escapeAttr(exercise.id || exerciseName)}">
                <span class="library-exercise-name">${escapeHtml(exerciseName)}</span>
            </div>`;
                })
                .join('');

            return `
            <div class="library-group">
                <div class="library-group-header">${escapeHtml(bodyPart)}</div>
                <div class="library-group-items">${exerciseCards}</div>
            </div>
        `;
        })
        .join('');

    // Add click handlers
    grid.querySelectorAll('.library-exercise-card').forEach((card) => {
        card.addEventListener('click', () => {
            const exerciseId = card.dataset.exerciseId;
            const exercise = filteredExercises.find((ex) => (ex.id || ex.name || ex.machine) === exerciseId);
            if (exercise) selectExerciseFromLibrary(exercise);
        });
    });

    // Quick Add chip click handlers
    grid.querySelectorAll('.quick-add-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            const name = chip.dataset.exerciseName;
            const equipment = chip.dataset.equipment;
            const exercise = exerciseLibrary.find((ex) => (ex.name || ex.machine) === name) || { name, equipment };
            selectExerciseFromLibrary(exercise);
        });
    });
}

function createLibraryExerciseCard(exercise) {
    const card = document.createElement('div');
    card.className = 'library-exercise-card';

    const exerciseName = exercise.name || exercise.machine;

    card.innerHTML = `
        <span class="library-exercise-name">${escapeHtml(exerciseName)}</span>
        <span class="library-exercise-body-part">${escapeHtml(exercise.bodyPart || 'General')}</span>
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
        const isDuplicate = currentEditingTemplate.exercises.some(
            (ex) => ex.name === exerciseName || ex.machine === exerciseName
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

    const { populateEquipmentPicker } = await import('../ui/equipment-picker.js');
    await populateEquipmentPicker({
        exerciseName,
        currentEquipment: exercise.equipment || null,
        currentLocation: exercise.equipmentLocation || null,
        sessionLocation: isActiveWorkout ? getSessionLocation() : null,
    });

    // Store whether this is for active workout
    window.equipmentPickerForActiveWorkout = isActiveWorkout;

    if (modal) openModal(modal);
}

// Close equipment picker
export function closeEquipmentPicker() {
    const modal = document.getElementById('equipment-picker-modal');
    if (modal) closeModal(modal);
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
            listEl.innerHTML = exerciseEquipment
                .map(
                    (eq) => `
                <div class="equipment-option ${eq.name === equipmentName ? 'selected' : ''}"
                     data-equipment-id="${escapeAttr(eq.id)}"
                     data-equipment-name="${escapeAttr(eq.name)}"
                     data-equipment-location="${escapeAttr(eq.location || '')}">
                    <div class="equipment-option-radio"></div>
                    <div class="equipment-option-details">
                        <div class="equipment-option-name">${escapeHtml(eq.name)}</div>
                        ${eq.location ? `<div class="equipment-option-location">${escapeHtml(eq.location)}</div>` : ''}
                    </div>
                </div>
            `
                )
                .join('');

            // Re-add click handlers
            listEl.querySelectorAll('.equipment-option').forEach((option) => {
                option.addEventListener('click', () => {
                    listEl.querySelectorAll('.equipment-option').forEach((o) => o.classList.remove('selected'));
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
            const equipment = await workoutManager.getOrCreateEquipment(
                equipmentName,
                equipmentLocation,
                exerciseName,
                equipmentVideo
            );

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
            equipmentLocation: equipmentLocation,
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
            video: exercise.video || '',
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

// Category definitions for chip row
const CREATE_EXERCISE_CATEGORIES = [
    { key: 'Push', css: 'cat-push', icon: 'fa-hand-paper' },
    { key: 'Pull', css: 'cat-pull', icon: 'fa-fist-raised' },
    { key: 'Legs', css: 'cat-legs', icon: 'fa-walking' },
    { key: 'Core', css: 'cat-core', icon: 'fa-bullseye' },
    { key: 'Cardio', css: 'cat-cardio', icon: 'fa-heartbeat' },
    { key: 'Arms', css: 'cat-arms', icon: 'fa-hand-rock' },
];

let _createExSelectedCategory = '';
let _createExSelectedEquipment = '';
let _createExMoreDetailsOpen = false;

function updateCreateExerciseSaveState() {
    const name = document.getElementById('new-exercise-name')?.value.trim();
    const headerSave = document.getElementById('create-ex-header-save');
    const footerSave = document.getElementById('create-ex-footer-save');
    const canSave = !!(name && _createExSelectedCategory);
    if (headerSave) headerSave.disabled = !canSave;
    if (footerSave) footerSave.disabled = !canSave;
}

function selectCreateExCategory(key) {
    _createExSelectedCategory = key;
    document.querySelectorAll('#create-ex-chips .chip').forEach((chip) => {
        const isActive = chip.dataset.category === key;
        chip.classList.toggle('active', isActive);
    });
    updateCreateExerciseSaveState();
}

function adjustStepper(inputId, delta) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const min = parseInt(input.min) || 1;
    const max = parseInt(input.max) || 99;
    const current = parseInt(input.value) || 0;
    input.value = Math.max(min, Math.min(max, current + delta));
}

function toggleCreateExMoreDetails() {
    _createExMoreDetailsOpen = !_createExMoreDetailsOpen;
    const section = document.getElementById('create-ex-more-details');
    const toggle = document.getElementById('create-ex-more-toggle');
    if (section) section.classList.toggle('hidden', !_createExMoreDetailsOpen);
    if (toggle) {
        toggle.innerHTML = _createExMoreDetailsOpen
            ? '<i class="fas fa-chevron-up"></i> Less details'
            : '+ More details (notes, video URL)';
    }
}

export function showCreateExerciseForm() {
    // Set flag so we know to refresh library modal after save
    creatingFromLibraryModal = true;

    // Reset state
    _createExSelectedCategory = '';
    _createExSelectedEquipment = '';
    _createExMoreDetailsOpen = false;

    const modal = document.getElementById('add-exercise-modal');
    const content = document.getElementById('add-exercise-modal-content');
    if (!content) return;

    // Build category chips
    const chipHtml = CREATE_EXERCISE_CATEGORIES.map(
        (cat) =>
            `<div class="chip ${cat.css}" data-category="${cat.key}" onclick="window._createExSelectCategory('${cat.key}')"><i class="fas ${cat.icon}"></i> ${cat.key}</div>`
    ).join('');

    content.innerHTML = `
        <div class="page-header">
            <div class="header-left">
                <button class="back-btn" aria-label="Back" onclick="closeCreateExerciseModal()"><i class="fas fa-chevron-left"></i></button>
                <div class="page-title">New Exercise</div>
            </div>
            <button class="btn-save" id="create-ex-header-save" disabled onclick="createNewExercise(event)">Save</button>
        </div>
        <div style="padding:16px;padding-bottom:100px;overflow-y:auto;flex:1;">
            <div class="field">
                <div class="field-label">Name</div>
                <input class="field-input" type="text" id="new-exercise-name" placeholder="e.g. Bulgarian Split Squat" oninput="window._createExUpdateSave()">
            </div>
            <div class="field">
                <div class="field-label">Category</div>
                <div class="chips" id="create-ex-chips">${chipHtml}</div>
            </div>
            <div class="field">
                <div class="field-label">Default sets &amp; reps</div>
                <div class="stepper-card">
                    <div class="stepper-row">
                        <div class="stepper-label">Sets</div>
                        <div class="stepper">
                            <button type="button" onclick="window._createExAdjustStepper('new-exercise-sets',-1)">\u2212</button>
                            <input type="number" id="new-exercise-sets" value="3" min="1" max="10" inputmode="numeric">
                            <button type="button" onclick="window._createExAdjustStepper('new-exercise-sets',1)">+</button>
                        </div>
                    </div>
                    <div class="stepper-row">
                        <div class="stepper-label">Reps</div>
                        <div class="stepper">
                            <button type="button" onclick="window._createExAdjustStepper('new-exercise-reps',-1)">\u2212</button>
                            <input type="number" id="new-exercise-reps" value="10" min="1" max="50" inputmode="numeric">
                            <button type="button" onclick="window._createExAdjustStepper('new-exercise-reps',1)">+</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="sec-head"><h3>Equipment</h3></div>
            <div id="create-ex-equipment-area">
                <div class="empty-state-card" style="text-align:center;padding:24px 16px;">
                    <div style="font-size:1.4rem;color:var(--text-muted);margin-bottom:8px;"><i class="fas fa-cog"></i></div>
                    <div style="font-size:0.86rem;font-weight:600;color:var(--text-main);margin-bottom:4px;">Pick equipment</div>
                    <div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:12px;">Bodyweight, barbell, or pick a specific machine</div>
                    <button class="btn-redesign" style="width:auto;display:inline-flex;padding:10px 18px;font-size:0.82rem;" onclick="window._createExChooseEquipment()"><i class="fas fa-dumbbell"></i> Choose equipment</button>
                </div>
            </div>
            <button class="more-details-toggle" id="create-ex-more-toggle" type="button" onclick="window._createExToggleMore()">+ More details (notes, video URL)</button>
            <div id="create-ex-more-details" class="hidden">
                <div class="field">
                    <div class="field-label">Notes</div>
                    <textarea class="field-input" id="new-exercise-notes" rows="2" placeholder="Form cues, tips..."></textarea>
                </div>
                <div class="field">
                    <div class="field-label">Form video URL (optional)</div>
                    <input class="field-input" type="url" id="new-exercise-video" placeholder="YouTube or direct video link">
                </div>
            </div>
        </div>
        <div class="page-footer">
            <button class="btn-redesign" id="create-ex-footer-save" disabled onclick="createNewExercise(event)"><i class="fas fa-check"></i> Save Exercise</button>
        </div>
    `;

    // Expose helpers to window for onclick handlers
    window._createExSelectCategory = selectCreateExCategory;
    window._createExUpdateSave = updateCreateExerciseSaveState;
    window._createExAdjustStepper = adjustStepper;
    window._createExToggleMore = toggleCreateExMoreDetails;
    window._createExChooseEquipment = () => {
        // Placeholder for future equipment picker integration
        showNotification('Equipment picker coming soon', 'info');
    };

    if (modal) {
        openModal(modal);
    }

    // Focus name field after modal opens
    setTimeout(() => document.getElementById('new-exercise-name')?.focus(), 100);
}

export function closeCreateExerciseModal() {
    const modal = document.getElementById('add-exercise-modal');
    if (modal) {
        closeModal(modal);
    }
    _createExSelectedCategory = '';
    _createExSelectedEquipment = '';
    creatingFromLibraryModal = false;
}

export async function createNewExercise(event) {
    if (event) event.preventDefault();

    const name = document.getElementById('new-exercise-name')?.value.trim();
    const category = _createExSelectedCategory;
    const sets = parseInt(document.getElementById('new-exercise-sets')?.value) || 3;
    const reps = parseInt(document.getElementById('new-exercise-reps')?.value) || 10;
    const video = document.getElementById('new-exercise-video')?.value?.trim() || '';
    const notes = document.getElementById('new-exercise-notes')?.value?.trim() || '';

    if (!name) {
        showNotification('Please enter an exercise name', 'warning');
        return;
    }
    if (!category) {
        showNotification('Please select a category', 'warning');
        return;
    }

    // Map category to bodyPart for backward compatibility
    const categoryToBodyPart = {
        Push: 'Chest',
        Pull: 'Back',
        Legs: 'Legs',
        Core: 'Core',
        Cardio: 'Cardio',
        Arms: 'Arms',
    };
    const bodyPart = categoryToBodyPart[category] || category;
    const equipmentType = _createExSelectedEquipment || 'Bodyweight';

    const exerciseData = {
        name,
        machine: name,
        bodyPart,
        category,
        equipmentType,
        tags: [bodyPart.toLowerCase(), equipmentType.toLowerCase()],
        sets,
        reps,
        weight: 0,
        video,
        notes,
    };

    const success = await workoutManager.createExercise(exerciseData);

    if (success) {
        const modal = document.getElementById('add-exercise-modal');
        if (modal) {
            closeModal(modal);
        }

        // Refresh exercise library if it's open
        if (creatingFromLibraryModal) {
            const libraryModal = document.getElementById('exercise-library-section');
            if (libraryModal && (libraryModal.open || !libraryModal.classList.contains('hidden'))) {
                exerciseLibrary = await workoutManager.getExerciseLibrary();
                filteredExercises = [...exerciseLibrary];
                renderExerciseLibrary();
            }
        }

        creatingFromLibraryModal = false;
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
    const isDefaultWorkout = appState.workoutPlans.some((plan) => plan.day === appState.savedData.workoutType);

    return !isDefaultWorkout; // If not default, it's likely a custom template
}

// Safe wrapper for showWorkoutSelector that respects navigation context
function showWorkoutSelectorSafe(appState, fromNavigation = false) {
    // Only show warning popup if NOT from navigation and has real progress
    const shouldShowWarning =
        !fromNavigation && appState.hasWorkoutProgress() && appState.currentWorkout && appState.savedData.workoutType;

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
            const workoutPlan = appState.workoutPlans.find(
                (plan) =>
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
                originalWorkout: todaysData.originalWorkout || workoutPlan,
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
            import('./workout-core.js').then((module) => {
                module.continueInProgressWorkout();
            });
        } else {
            // Use your existing discard function
            import('./workout-core.js').then((module) => {
                module.discardInProgressWorkout();
            });
        }
        window.showingProgressPrompt = false;
    }, 500);
}
