// Template Selection Module - core/template-selection.js
// Handles template browsing, selection, and immediate usage

import { AppState } from '../utils/app-state.js';
import { getCategoryIcon, CATEGORY_COLORS } from '../utils/config.js';
import { showNotification, escapeHtml, escapeAttr, openModal, closeModal } from './ui-helpers.js';
import { getExerciseName } from '../utils/workout-helpers.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';
import { getEquipmentAtLocation, getExercisesAtLocation, checkTemplateCompatibility, categorizeTemplates } from '../features/equipment-planner.js';
import { showFirstUseTip } from '../features/first-use-tips.js';

// ===================================================================
// TEMPLATE SELECTION STATE
// ===================================================================

let selectedWorkoutCategory = null;
let currentTemplateCategory = 'default';
let equipmentFilterActive = false;
let cachedAvailableExercises = null; // Set<string> of exercises at current location

// Track which containers already have delegation listeners
const delegatedContainers = new WeakSet();

function setupTemplateDelegation(container) {
    if (!container || delegatedContainers.has(container)) return;
    delegatedContainers.add(container);

    container.addEventListener('click', (e) => {
        // Handle overflow menu toggle
        const overflowToggle = e.target.closest('.template-overflow-toggle');
        if (overflowToggle) {
            e.stopPropagation();
            const menu = overflowToggle.nextElementSibling;
            if (!menu) return;
            // Close any other open menus first
            container.querySelectorAll('.template-overflow-menu:not(.hidden)').forEach(m => {
                if (m !== menu) m.classList.add('hidden');
            });
            menu.classList.toggle('hidden');
            return;
        }

        // Close any open overflow menus on any other click
        if (!e.target.closest('.template-overflow-wrapper')) {
            container.querySelectorAll('.template-overflow-menu:not(.hidden)').forEach(m => m.classList.add('hidden'));
        }

        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const templateId = btn.dataset.templateId;
        const isDefault = btn.dataset.isDefault === 'true';
        const workoutName = btn.dataset.workout;

        if (action === 'useTemplateFromManagement') {
            window.useTemplateFromManagement(templateId, isDefault);
        } else if (action === 'editTemplate') {
            window.editTemplate(templateId, isDefault);
        } else if (action === 'resetToDefault') {
            window.resetToDefault(templateId);
        } else if (action === 'deleteTemplate') {
            window.deleteTemplate(templateId, isDefault);
        } else if (action === 'startWorkout') {
            window.startWorkout(workoutName);
        } else if (action === 'previewWorkout') {
            previewWorkout(workoutName);
        }
    });
}

// ===================================================================
// EQUIPMENT FILTER — "At this gym"
// ===================================================================

/**
 * Load available exercises at the current/detected location.
 * Caches result for the session to avoid repeated queries.
 */
async function loadAvailableExercisesAtLocation() {
    if (cachedAvailableExercises) return cachedAvailableExercises;

    try {
        const locationName = AppState.currentLocation
            || AppState.savedData?.location
            || null;
        if (!locationName) return null;

        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const allEquipment = await workoutManager.getUserEquipment();
        const locationEquipment = getEquipmentAtLocation(allEquipment, locationName);
        cachedAvailableExercises = getExercisesAtLocation(locationEquipment);
        return cachedAvailableExercises;
    } catch (err) {
        console.error('Error loading equipment for location filter:', err);
        return null;
    }
}

/**
 * Toggle the "At this gym" equipment compatibility filter.
 */
export async function toggleEquipmentFilter() {
    equipmentFilterActive = !equipmentFilterActive;

    // Update button state
    const btn = document.getElementById('equipment-filter-btn');
    if (btn) btn.classList.toggle('active', equipmentFilterActive);

    if (equipmentFilterActive) {
        await loadAvailableExercisesAtLocation();
    }

    loadTemplatesByCategory();
}

/**
 * Clear equipment cache (call on location change or workout start).
 */
export function clearEquipmentFilterCache() {
    cachedAvailableExercises = null;
    equipmentFilterActive = false;
}

// ===================================================================
// TEMPLATE SELECTION UI
// ===================================================================

export function showTemplateSelection() {
    const modal = document.getElementById('template-selection-modal');
    if (!modal) return;

    openModal(modal);

    // Inject the "At this gym" filter button if location is known
    injectEquipmentFilterButton();

    // Load default templates
    switchTemplateCategory('default');
}

function injectEquipmentFilterButton() {
    const header = document.querySelector('#template-selection-modal .modal-header');
    if (!header || header.querySelector('#equipment-filter-btn')) return;

    const locationName = AppState.currentLocation || AppState.savedData?.location;
    if (!locationName) return;

    const btn = document.createElement('button');
    btn.id = 'equipment-filter-btn';
    btn.className = `btn btn-secondary btn-small${equipmentFilterActive ? ' active' : ''}`;
    btn.innerHTML = `<i class="fas fa-map-marker-alt"></i> At this gym`;
    btn.addEventListener('click', () => window.toggleEquipmentFilter());
    header.insertBefore(btn, header.querySelector('.close-btn'));
}

export function closeTemplateSelection() {
    const modal = document.getElementById('template-selection-modal');
    if (modal) {
        closeModal(modal);
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
            selectedTemplate = AppState.workoutPlans.find(
                (plan) => plan.day === templateId || plan.name === templateId || plan.id === templateId
            );
        } else {
            // Load user's custom templates
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const workoutManager = new FirebaseWorkoutManager(AppState);
            const userTemplates = await workoutManager.getUserWorkoutTemplates();

            selectedTemplate = userTemplates.find(
                (template) => template.id === templateId || template.name === templateId
            );
        }

        if (!selectedTemplate) {
            console.error('❌ Template not found');
            return;
        }

        // Close template selection
        closeTemplateSelection();

        // Import and use startWorkout function (dynamic import to avoid circular dependency)
        const { startWorkout } = await import('../workout/workout-core.js');
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

    // Show bottom nav and set workout tab active
    setBottomNavVisible(true);
    updateBottomNavActive('workout');

    // Render the new flat template list UI
    renderWorkoutSelectorUI();

    // First-use tip for new users
    showFirstUseTip('workout-selector');
}

// ===================================================================
// WORKOUT SELECTOR — flat template list with filter pills
// ===================================================================

/** Active category filter for the workout selector (null = "All") */
let activeSelectorCategory = null;

/** Cached recent workout history for template recency sorting */
let cachedWorkoutHistory = null;

/** Currently expanded template ID for inline editing (null = all collapsed) */
let expandedTemplateId = null;

/** Currently expanded exercise within a template (key = `${templateId}_${idx}`).
 *  Phase 3 — only one exercise expanded at a time across the whole list. */
let expandedExerciseInTemplate = null;

/** Phase 6 — which template's "Details" accordion (category + schedule) is open.
 *  Independent of which template-row itself is expanded. */
let detailsOpenForTemplate = null;

/** Phase 7 — session-level cache for last-session lookups so re-renders of the
 *  selector don't re-hit Firestore. Key = `${exerciseName}__${equipment}`.
 *  Cleared by clearSelectorCache (called on workout complete). */
const _lastSessionCache = new Map();

async function getLastSessionForExercise(exerciseName, equipment = null) {
    if (!exerciseName) return null;
    const key = `${exerciseName}__${equipment || ''}`;
    if (_lastSessionCache.has(key)) return _lastSessionCache.get(key);
    try {
        const { getLastSessionDefaults } = await import('../data/data-manager.js');
        const result = await getLastSessionDefaults(exerciseName, equipment || null);
        if (result && result.date) {
            const parts = result.date.split('-');
            if (parts.length === 3) {
                const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                result.daysAgo = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
            }
        }
        _lastSessionCache.set(key, result);
        return result;
    } catch (_) {
        _lastSessionCache.set(key, null);
        return null;
    }
}

/** All loaded templates (cached for inline editor access) */
let loadedTemplates = [];

/**
 * Main render function for the workout selector page.
 * Loads all templates (default + custom), renders filter pills and flat rows.
 */
async function renderWorkoutSelectorUI() {
    const pillsContainer = document.getElementById('category-pills');
    const listContainer = document.getElementById('template-list');
    if (!pillsContainer || !listContainer) return;

    // Use AppState.workoutPlans as the single source of truth (already deduped)
    let allTemplates = (AppState.workoutPlans || []).map(t => ({
        ...t,
        _id: t.id || t.day,
        _name: t.name || t.day,
        _isDefault: !t.isCustom,
    }));

    // Load workout history for recency sorting (cached)
    if (!cachedWorkoutHistory && AppState.currentUser) {
        try {
            const { db, collection, query, orderBy, limit, getDocs } = await import('../data/firebase-config.js');
            const ref = collection(db, `users/${AppState.currentUser.uid}/workouts`);
            const q = query(ref, orderBy('completedAt', 'desc'), limit(50));
            const snapshot = await getDocs(q);
            cachedWorkoutHistory = [];
            snapshot.forEach(doc => cachedWorkoutHistory.push(doc.data()));
        } catch (_) {
            cachedWorkoutHistory = [];
        }
    }

    // Collect unique categories
    const categories = [...new Set(allTemplates.map(t => getWorkoutCategory(t._name)))];

    // Render filter pills
    renderCategoryPills(pillsContainer, categories);

    // Filter by active category
    let filtered = allTemplates;
    if (activeSelectorCategory) {
        filtered = allTemplates.filter(t => getWorkoutCategory(t._name) === activeSelectorCategory);
    }

    // Sort: most recently used first, then alphabetical
    filtered = sortTemplatesByRecency(filtered);

    // Cache for inline editor access
    loadedTemplates = allTemplates;

    // Render template rows
    renderTemplateRows(listContainer, filtered, activeSelectorCategory !== null);

    // Set up delegation for clicks
    setupSelectorDelegation(listContainer);

    // Phase 7: kick off async last-session hydration for any rendered exercise
    // rows. Fire-and-forget — hydrateLastSession only fills in `data-pending`
    // placeholders it finds in the DOM.
    hydrateLastSession();
}

/**
 * Walk all `.te-row__last[data-pending]` placeholders rendered in the current
 * selector view and fill each with the exercise's most recent session summary.
 * Removes the placeholder if there is no history.
 */
function hydrateLastSession() {
    document.querySelectorAll('.te-row__last[data-pending]').forEach(async (el) => {
        el.removeAttribute('data-pending');
        const name = el.dataset.exercise;
        const equip = el.dataset.equipment || null;
        const last = await getLastSessionForExercise(name, equip);
        if (!last || !last.sets || last.sets.length === 0) {
            el.remove();
            return;
        }
        const setStr = last.sets.slice(0, 3).map(s => {
            const w = s.weight || 0;
            const r = s.reps || 0;
            return `${r}×${w}`;
        }).join(' · ');
        let daysAgoStr = '';
        if (last.daysAgo != null) {
            daysAgoStr = last.daysAgo === 0 ? 'today'
                : last.daysAgo === 1 ? '1d ago'
                : `${last.daysAgo}d ago`;
        }
        el.textContent = `Last: ${setStr}${daysAgoStr ? ` · ${daysAgoStr}` : ''}`;
    });
}

function renderCategoryPills(container, categories) {
    const pills = categories.map(cat => {
        const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
        const isActive = activeSelectorCategory === cat;
        return `
            <button class="category-pill ${isActive ? 'active' : ''}"
                    ${isActive ? `style="--pill-color: ${color};"` : ''}
                    data-category="${escapeAttr(cat)}">
                <i class="${getCategoryIcon(cat.toLowerCase())}"></i> ${escapeHtml(cat)}
            </button>
        `;
    }).join('');

    container.innerHTML = `
        <button class="category-pill ${!activeSelectorCategory ? 'active' : ''}" data-category="all">All</button>
        ${pills}
    `;

    // Delegate pill clicks
    if (!delegatedContainers.has(container)) {
        delegatedContainers.add(container);
        container.addEventListener('click', (e) => {
            const pill = e.target.closest('.category-pill');
            if (!pill) return;
            const cat = pill.dataset.category;
            activeSelectorCategory = cat === 'all' ? null : cat;
            renderWorkoutSelectorUI();
        });
    }
}

function sortTemplatesByRecency(templates) {
    return [...templates].sort((a, b) => {
        const aDate = getLastWorkoutDate(a._name);
        const bDate = getLastWorkoutDate(b._name);
        if (aDate && bDate) return bDate.localeCompare(aDate);
        if (aDate) return -1;
        if (bDate) return 1;
        return a._name.localeCompare(b._name);
    });
}

function getLastWorkoutForTemplate(templateName) {
    if (!cachedWorkoutHistory) return null;
    return cachedWorkoutHistory.find(w => w.workoutType === templateName && w.completedAt) || null;
}

function getLastWorkoutDate(templateName) {
    const last = getLastWorkoutForTemplate(templateName);
    return last?.date || null;
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
}

function renderTemplateRows(container, templates, isFiltered) {
    if (templates.length === 0) {
        if (isFiltered) {
            container.innerHTML = `
                <div class="template-empty-state">
                    <div class="template-empty-state__icon"><i class="fas fa-filter"></i></div>
                    <div class="template-empty-state__text">No templates in this category</div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="template-empty-state">
                    <div class="template-empty-state__icon"><i class="fas fa-dumbbell"></i></div>
                    <div class="template-empty-state__text">Create your first workout template to get started</div>
                    <button class="template-empty-state__cta" onclick="createNewTemplate()">
                        <i class="fas fa-plus"></i> Create Template
                    </button>
                </div>
            `;
        }
        return;
    }

    container.innerHTML = templates.map(t => renderSingleTemplateRow(t)).join('');
}

function renderSingleTemplateRow(template) {
    const category = getWorkoutCategory(template._name);
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
    const exercisesArray = normalizeExercisesToArray(template.exercises);
    const exerciseCount = exercisesArray.length;
    const templateId = template._id;
    const templateName = template._name;
    const isExpanded = expandedTemplateId === templateId;

    // Build subtitle: exercise count + relative time
    const lastWorkout = getLastWorkoutForTemplate(templateName);
    let timeInfo = '';
    if (lastWorkout?.date) {
        timeInfo = ` · ${formatTimeAgo(lastWorkout.date)}`;
    }

    // Inline editor HTML (shown when expanded)
    let editorHtml = '';
    if (isExpanded) {
        const exerciseListHtml = exercisesArray.map((ex, i) =>
            renderTemplateExerciseRow(ex, i, exercisesArray.length, templateId, expandedExerciseInTemplate === `${templateId}_${i}`)
        ).join('');

        editorHtml = `
            <div class="template-editor" data-stop-propagation>
                ${renderTemplateDetailsAccordion(template)}
                <div class="template-editor__section-header">
                    <span class="template-editor__section-label">EXERCISES</span>
                    <button class="template-editor__section-add"
                            data-action="addTemplateExercise"
                            data-template-id="${escapeAttr(templateId)}"
                            data-is-default="${template._isDefault}"
                            aria-label="Add exercise">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <div class="template-editor__exercise-list">
                    ${exerciseListHtml || '<div class="template-editor__empty">No exercises yet — tap + above to add one</div>'}
                </div>
                <button class="template-editor__add-btn" data-action="addTemplateExercise" data-template-id="${escapeAttr(templateId)}" data-is-default="${template._isDefault}">
                    <i class="fas fa-plus"></i> Add Exercise
                </button>
                <div class="template-editor__actions">
                    <button class="template-editor__action" data-action="duplicateTemplate" data-template-id="${escapeAttr(templateId)}" data-is-default="${template._isDefault}">
                        <i class="fas fa-copy"></i> Duplicate
                    </button>
                    <button class="template-editor__action template-editor__action--danger" data-action="deleteTemplateInline" data-template-id="${escapeAttr(templateId)}" data-is-default="${template._isDefault}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
                <button class="template-editor__start-btn" data-action="startTemplateRow" data-workout="${escapeAttr(templateName)}">
                    <i class="fas fa-play"></i> Start Workout
                </button>
            </div>
        `;
    }

    return `
        <div class="row-card template-row ${isExpanded ? 'expanded' : ''}" data-template-id="${escapeAttr(templateId)}" data-is-default="${template._isDefault}" data-action="toggleTemplateRow">
            <div class="template-row__dot" style="--dot-color: ${color};"></div>
            <div class="row-card__content">
                ${isExpanded
                    ? `<input class="template-row__title-input"
                              data-stop-propagation
                              data-template-id="${escapeAttr(templateId)}"
                              data-action="renameTemplate"
                              value="${escapeAttr(templateName)}"
                              aria-label="Workout name" />`
                    : `<div class="row-card__title">${escapeHtml(templateName)}</div>`
                }
                <div class="row-card__subtitle">${exerciseCount} exercises${timeInfo}</div>
            </div>
            <button class="btn-start-small" data-action="startTemplateRow" data-workout="${escapeAttr(templateName)}" aria-label="Start ${escapeAttr(templateName)}">
                <i class="fas fa-play"></i>
            </button>
        </div>
        ${editorHtml}
    `;
}

/**
 * Render a single exercise row inside an expanded template.
 * Tap the head to expand → reveals sets/reps/weight steppers, equipment pill,
 * and notes. ↑/↓ arrows reorder; × removes.
 */
// ===================================================================
// PHASE 6 — Details accordion (category + schedule summary at top of editor)
// ===================================================================

const DAY_VALUES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_DISPLAY = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

const TEMPLATE_CATEGORIES = [
    { value: 'push',   label: 'Push' },
    { value: 'pull',   label: 'Pull' },
    { value: 'legs',   label: 'Legs' },
    { value: 'core',   label: 'Core' },
    { value: 'cardio', label: 'Cardio' },
    { value: 'other',  label: 'Mixed' },
];

/**
 * Days the user has *actually* logged this template on, sorted by recency.
 * Returns up to 2 day-of-week labels with count >= 2 (so a one-off Tuesday
 * doesn't get promoted to "Usually Tuesday").
 */
function deriveUsuallyDays(templateName) {
    if (!templateName || !cachedWorkoutHistory) return [];
    const dayCounts = Array(7).fill(0); // index 0 = Sunday (JS getDay convention)
    for (const w of cachedWorkoutHistory) {
        if (w.workoutType !== templateName || !w.completedAt) continue;
        const parts = (w.date || '').split('-');
        if (parts.length !== 3) continue;
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const dow = d.getDay();
        if (dow >= 0 && dow < 7) dayCounts[dow]++;
    }
    // Mon-first labels for display
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayCounts
        .map((count, jsDow) => ({ count, label: labels[jsDow] }))
        .filter(d => d.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 2)
        .map(d => d.label);
}

function estimateDurationMinutes(template) {
    const exercises = normalizeExercisesToArray(template.exercises);
    if (exercises.length === 0) return 0;
    const totalSets = exercises.reduce((sum, ex) => sum + (parseInt(ex.sets) || 3), 0);
    return Math.round(totalSets * 2.5); // ~2.5 min/set including rest
}

function getCategoryLabel(value) {
    const cat = TEMPLATE_CATEGORIES.find(c => c.value === value);
    return cat ? cat.label : 'Mixed';
}

function renderTemplateSummary(template) {
    const cat = (template.category || 'other').toLowerCase();
    const catLabel = getCategoryLabel(cat);

    const usuallyArr = deriveUsuallyDays(template._name);
    let scheduleText = null;
    if (usuallyArr.length > 0) {
        scheduleText = `Usually ${usuallyArr.join(', ')}`;
    } else if (Array.isArray(template.suggestedDays) && template.suggestedDays.length > 0) {
        const labels = template.suggestedDays.map(d => DAY_DISPLAY[d] || d).join(', ');
        scheduleText = `Schedule: ${labels}`;
    }

    const exCount = normalizeExercisesToArray(template.exercises).length;
    const estMin = estimateDurationMinutes(template);

    const parts = [
        `<span class="te-cat te-cat--${escapeAttr(cat)}">${escapeHtml(catLabel)}</span>`,
        scheduleText ? escapeHtml(scheduleText) : null,
        `${exCount} exercise${exCount === 1 ? '' : 's'}`,
        estMin ? `~${estMin} min` : null,
    ].filter(Boolean);
    return parts.join(' · ');
}

function renderTemplateDetailsBody(template) {
    const cat = (template.category || 'other').toLowerCase();
    const days = Array.isArray(template.suggestedDays) ? template.suggestedDays : [];
    const templateId = template._id;

    const catChips = TEMPLATE_CATEGORIES.map(c => `
        <span class="chip cat-${c.value} ${cat === c.value ? 'active' : ''}"
              data-action="setTemplateCategory"
              data-template-id="${escapeAttr(templateId)}"
              data-cat="${c.value}">${c.label}</span>
    `).join('');

    const dayChipsHtml = DAY_SHORT_LABELS.map((short, i) => `
        <span class="day-chip ${days.includes(DAY_VALUES[i]) ? 'active' : ''}"
              data-action="toggleTemplateDay"
              data-template-id="${escapeAttr(templateId)}"
              data-day="${DAY_VALUES[i]}">${short}</span>
    `).join('');

    return `
        <div class="te-details__body">
            <div class="te-details__row">
                <div class="te-details__label">Category</div>
                <div class="te-details__chips">${catChips}</div>
            </div>
            <div class="te-details__row">
                <div class="te-details__label">Schedule</div>
                <div class="te-details__day-chips">${dayChipsHtml}</div>
                <div class="te-details__hint">Override the auto-detected schedule.</div>
            </div>
        </div>
    `;
}

function renderTemplateDetailsAccordion(template) {
    const isOpen = detailsOpenForTemplate === template._id;
    return `
        <div class="te-details">
            <div class="te-details__summary"
                 data-action="toggleDetails"
                 data-template-id="${escapeAttr(template._id)}">
                <div class="te-details__summary-text">${renderTemplateSummary(template)}</div>
                <i class="fas fa-chevron-${isOpen ? 'up' : 'down'} te-details__chev"></i>
            </div>
            ${isOpen ? renderTemplateDetailsBody(template) : ''}
        </div>
    `;
}

function renderTemplateExerciseRow(ex, idx, total, templateId, isExpanded) {
    const exName = getExerciseName(ex);
    const category = (ex.category || ex.bodyPart || 'other').toLowerCase();
    const tintCat = ['push', 'pull', 'legs', 'core', 'cardio'].includes(category) ? category : 'other';
    const sets = ex.sets || 3;
    const reps = ex.reps || 10;
    const weight = ex.weight || 0;
    const unit = AppState.globalUnit || 'lbs';
    const equipment = ex.equipment || '';
    const notes = ex.notes || '';
    const isFirst = idx === 0;
    const isLast = idx === total - 1;
    const rowKey = `${templateId}_${idx}`;

    const summary = equipment
        ? `${sets} × ${reps} · ${escapeHtml(equipment)}`
        : `${sets} × ${reps}${weight ? ` · ${weight} ${unit}` : ''}`;

    const expandedBody = isExpanded ? `
        <div class="te-row__edit" data-stop-propagation>
            <div class="te-row__steppers">
                <div class="te-stepper">
                    <div class="te-stepper__label">Sets</div>
                    <input type="number" inputmode="numeric" min="1" max="20"
                           value="${sets}"
                           data-action="updateExerciseField"
                           data-template-id="${escapeAttr(templateId)}"
                           data-index="${idx}" data-field="sets">
                </div>
                <div class="te-stepper">
                    <div class="te-stepper__label">Reps</div>
                    <input type="number" inputmode="numeric" min="1" max="100"
                           value="${reps}"
                           data-action="updateExerciseField"
                           data-template-id="${escapeAttr(templateId)}"
                           data-index="${idx}" data-field="reps">
                </div>
                <div class="te-stepper">
                    <div class="te-stepper__label">Weight</div>
                    <input type="number" inputmode="decimal" step="0.5"
                           value="${weight}"
                           data-action="updateExerciseField"
                           data-template-id="${escapeAttr(templateId)}"
                           data-index="${idx}" data-field="weight">
                </div>
            </div>
            <div class="te-row__equip" data-action="openEquipmentForExercise"
                 data-template-id="${escapeAttr(templateId)}" data-index="${idx}">
                <i class="fas fa-cog"></i>
                <span class="te-row__equip-name">${equipment ? escapeHtml(equipment) : 'Choose equipment'}</span>
                <span class="te-row__equip-action">${equipment ? 'Change' : 'Pick'}</span>
            </div>
            <div class="te-row__notes-field">
                <textarea rows="1" placeholder="Notes (optional)"
                          data-action="updateExerciseField"
                          data-template-id="${escapeAttr(templateId)}"
                          data-index="${idx}" data-field="notes">${escapeHtml(notes)}</textarea>
            </div>
        </div>
    ` : '';

    return `
        <div class="te-row ${isExpanded ? 'te-row--expanded' : ''}"
             data-action="toggleExerciseExpand"
             data-template-id="${escapeAttr(templateId)}"
             data-index="${idx}"
             data-row-key="${rowKey}">
            <div class="te-row__head">
                <div class="te-row__reorder" data-stop-propagation>
                    <button class="te-row__arrow" ${isFirst ? 'disabled' : ''}
                            data-action="moveExerciseUp"
                            data-template-id="${escapeAttr(templateId)}"
                            data-index="${idx}" aria-label="Move up">
                        <i class="fas fa-chevron-up"></i>
                    </button>
                    <button class="te-row__arrow" ${isLast ? 'disabled' : ''}
                            data-action="moveExerciseDown"
                            data-template-id="${escapeAttr(templateId)}"
                            data-index="${idx}" aria-label="Move down">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <div class="te-row__icon tint-${tintCat}">
                    <i class="fas fa-dumbbell"></i>
                </div>
                <div class="te-row__info">
                    <div class="te-row__name">${escapeHtml(exName)}</div>
                    <div class="te-row__meta">${summary}</div>
                    <div class="te-row__last" data-pending data-exercise="${escapeAttr(exName)}" data-equipment="${escapeAttr(equipment || '')}"></div>
                </div>
                <button class="te-row__remove" data-stop-propagation
                        data-action="removeTemplateExercise"
                        data-template-id="${escapeAttr(templateId)}"
                        data-index="${idx}"
                        aria-label="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${expandedBody}
        </div>
    `;
}

/**
 * Persist a single field change on a template exercise.
 * Called from the inline change listener; the spec accepts a re-render
 * that may steal focus, since change events fire only after blur.
 */
async function updateExerciseField(templateId, index, field, value) {
    const template = loadedTemplates.find(t => t._id === templateId);
    if (!template) return;
    const exercises = normalizeExercisesToArray(template.exercises);
    if (index < 0 || index >= exercises.length) return;
    const ex = exercises[index];

    if (field === 'sets' || field === 'reps') {
        const n = parseInt(value, 10);
        if (Number.isFinite(n) && n > 0) ex[field] = n;
    } else if (field === 'weight') {
        const n = parseFloat(value);
        ex[field] = Number.isFinite(n) ? n : 0;
    } else if (field === 'notes') {
        ex.notes = (value || '').trim();
    }

    template.exercises = exercises;
    await saveTemplateInline(template, exercises);
    renderWorkoutSelectorUI();
}

/**
 * Open the shared add-exercise sheet for the template editor's "+ Add"
 * flow. Inserts the picked exercise at the end of the template list and
 * saves to Firestore.
 */
async function openAddExerciseSheetForTemplate(templateId) {
    const template = loadedTemplates.find(t => t._id === templateId);
    if (!template) return;
    const exercises = normalizeExercisesToArray(template.exercises);
    const alreadyAdded = exercises.map(e => (e.name || e.machine || '').toLowerCase()).filter(Boolean);

    const { openSharedAddExerciseSheet } = await import('../workout/active-workout-ui.js');
    openSharedAddExerciseSheet({
        targetWorkoutLabel: template._name,
        alreadyAdded,
        onSelect: async (exerciseRecord) => {
            const newExercise = {
                name: exerciseRecord.name || exerciseRecord.machine,
                machine: exerciseRecord.machine || exerciseRecord.name,
                bodyPart: exerciseRecord.bodyPart || '',
                category: exerciseRecord.category || '',
                equipmentType: exerciseRecord.equipmentType || '',
                equipment: exerciseRecord.equipment || '',
                sets: exerciseRecord.sets || 3,
                reps: exerciseRecord.reps || 10,
                weight: exerciseRecord.weight || 0,
            };
            exercises.push(newExercise);
            template.exercises = exercises;
            await saveTemplateInline(template, exercises);
            renderWorkoutSelectorUI();

            // Chain straight into the equipment picker so the user can finish
            // binding the exercise to a piece of equipment without expanding
            // the row. They can Cancel the picker if they'll set it later.
            const newIndex = exercises.length - 1;
            openEquipmentSheetForTemplate(templateId, newIndex);
        },
        onCreateRequested: (initialName) => {
            // Phase 5 will accept { initialName, onCreated } to round-trip
            // back into this sheet. For now, hand off to the existing
            // create-exercise modal.
            if (typeof window.showCreateExerciseForm === 'function') {
                window.showCreateExerciseForm({ initialName });
            }
        },
    });
}

/**
 * Open the active-workout equipment sheet pre-loaded with the template
 * exercise's current equipment, then write the selection back.
 */
async function openEquipmentSheetForTemplate(templateId, index) {
    const template = loadedTemplates.find(t => t._id === templateId);
    if (!template) return;
    const exercises = normalizeExercisesToArray(template.exercises);
    const exercise = exercises[index];
    if (!exercise) return;

    const { openSharedEquipmentSheet } = await import('../workout/active-workout-ui.js');
    openSharedEquipmentSheet({
        exerciseName: getExerciseName(exercise),
        currentEquipment: exercise.equipment || '',
        onSelect: async (equipName) => {
            exercise.equipment = equipName || '';
            template.exercises = exercises;
            await saveTemplateInline(template, exercises);
            renderWorkoutSelectorUI();
        },
    });
}

/**
 * Toggle inline template editor expansion.
 */
export function toggleTemplateEdit(templateId) {
    expandedTemplateId = (expandedTemplateId === templateId) ? null : templateId;
    // Collapsing the parent template should also reset which exercise is open
    if (expandedTemplateId === null) expandedExerciseInTemplate = null;
    renderWorkoutSelectorUI();
}

/**
 * Save a modified template to Firebase (handles both default and custom).
 * For default templates, saves as a custom override with `overridesDefault` set.
 */
async function saveTemplateInline(template, exercises) {
    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const wm = new FirebaseWorkoutManager(AppState);

        const saveData = {
            name: template._name,
            exercises,
            // Phase 6: prefer explicit template.category (set via the details
            // accordion) over the name-derived fallback. Persist suggestedDays
            // so manual schedule overrides round-trip through Firestore.
            category: template.category || getWorkoutCategory(template._name),
            suggestedDays: Array.isArray(template.suggestedDays) ? template.suggestedDays : [],
        };

        // If editing a default template, mark it as an override so the
        // deduplication in getUserWorkoutTemplates replaces the default
        if (template._isDefault) {
            saveData.overridesDefault = template._id;
        }

        // Use the template's existing ID so it overwrites (not duplicates)
        saveData.id = template._id;

        await wm.saveWorkoutTemplate(saveData);

        // Refresh workoutPlans so the updated template shows immediately
        AppState.workoutPlans = await wm.getUserWorkoutTemplates();
    } catch (err) {
        console.error('Error saving template:', err);
        showNotification('Failed to save changes', 'error');
    }
}

/**
 * Move an exercise up or down within a template's exercise list (inline editor).
 */
export async function moveTemplateExerciseInline(templateId, index, direction) {
    const template = loadedTemplates.find(t => t._id === templateId);
    if (!template) return;

    const exercises = normalizeExercisesToArray(template.exercises);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= exercises.length) return;

    // Swap
    [exercises[index], exercises[targetIndex]] = [exercises[targetIndex], exercises[index]];
    template.exercises = exercises;

    await saveTemplateInline(template, exercises);
    renderWorkoutSelectorUI();
}

/**
 * Remove an exercise from a template (inline editor).
 */
export async function removeTemplateExerciseInline(templateId, index) {
    const template = loadedTemplates.find(t => t._id === templateId);
    if (!template) return;

    const exercises = normalizeExercisesToArray(template.exercises);
    const name = getExerciseName(exercises[index]);
    if (!confirm(`Remove "${name}" from this template?`)) return;

    exercises.splice(index, 1);
    template.exercises = exercises;

    await saveTemplateInline(template, exercises);
    renderWorkoutSelectorUI();
}

/** Set up event delegation on the template list container */
function setupSelectorDelegation(container) {
    if (!container || delegatedContainers.has(container)) return;
    delegatedContainers.add(container);

    container.addEventListener('click', (e) => {
        // Stop propagation on editor actions so row toggle doesn't fire
        if (e.target.closest('[data-stop-propagation]')) {
            const actionEl = e.target.closest('[data-action]');
            if (!actionEl) return;
            const action = actionEl.dataset.action;
            const templateId = actionEl.dataset.templateId;
            const isDefault = actionEl.dataset.isDefault === 'true';
            const index = parseInt(actionEl.dataset.index, 10);

            if (action === 'startTemplateRow') {
                const workoutName = actionEl.dataset.workout;
                if (workoutName) window.startWorkout(workoutName);
            } else if (action === 'moveExerciseUp') {
                moveTemplateExerciseInline(templateId, index, 'up');
            } else if (action === 'moveExerciseDown') {
                moveTemplateExerciseInline(templateId, index, 'down');
            } else if (action === 'removeTemplateExercise') {
                removeTemplateExerciseInline(templateId, index);
            } else if (action === 'addTemplateExercise') {
                openAddExerciseSheetForTemplate(templateId);
            } else if (action === 'duplicateTemplate') {
                window.copyTemplateToCustom(templateId);
            } else if (action === 'deleteTemplateInline') {
                window.deleteTemplate(templateId, isDefault);
            } else if (action === 'openEquipmentForExercise') {
                openEquipmentSheetForTemplate(templateId, index);
            } else if (action === 'toggleDetails') {
                detailsOpenForTemplate = (detailsOpenForTemplate === templateId) ? null : templateId;
                renderWorkoutSelectorUI();
            } else if (action === 'setTemplateCategory') {
                const cat = actionEl.dataset.cat;
                const t = loadedTemplates.find(x => x._id === templateId);
                if (t) {
                    t.category = cat;
                    saveTemplateInline(t, normalizeExercisesToArray(t.exercises))
                        .then(() => renderWorkoutSelectorUI());
                }
            } else if (action === 'toggleTemplateDay') {
                const day = actionEl.dataset.day;
                const t = loadedTemplates.find(x => x._id === templateId);
                if (t) {
                    const cur = Array.isArray(t.suggestedDays) ? t.suggestedDays : [];
                    t.suggestedDays = cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day];
                    saveTemplateInline(t, normalizeExercisesToArray(t.exercises))
                        .then(() => renderWorkoutSelectorUI());
                }
            } else if (action === 'toggleExerciseExpand') {
                // .te-row sits inside .template-editor's data-stop-propagation
                // zone, so this action lands here (not the unreachable check
                // below the if-block).
                const rowKey = actionEl.dataset.rowKey;
                expandedExerciseInTemplate = (expandedExerciseInTemplate === rowKey) ? null : rowKey;
                renderWorkoutSelectorUI();
            }
            return;
        }

        // Start button
        const startBtn = e.target.closest('[data-action="startTemplateRow"]');
        if (startBtn) {
            e.stopPropagation();
            const workoutName = startBtn.dataset.workout;
            if (workoutName) window.startWorkout(workoutName);
            return;
        }

        // Row tap = toggle inline editor
        const row = e.target.closest('[data-action="toggleTemplateRow"]');
        if (row) {
            const templateId = row.dataset.templateId;
            if (templateId) toggleTemplateEdit(templateId);
        }
    });

    // Change listener: handles inline rename, exercise field edits.
    // Fires on blur or Enter for inputs / textareas.
    container.addEventListener('change', async (e) => {
        // 1) Rename template title
        const renameInput = e.target.closest('input[data-action="renameTemplate"]');
        if (renameInput) {
            const templateId = renameInput.dataset.templateId;
            const newName = renameInput.value.trim();
            const template = loadedTemplates.find(t => t._id === templateId);
            if (!template) return;

            if (!newName) {
                renameInput.value = template._name || '';
                return;
            }
            if (newName === template._name) return;

            template._name = newName;
            template.name = newName;
            await saveTemplateInline(template, normalizeExercisesToArray(template.exercises));
            renderWorkoutSelectorUI();
            return;
        }

        // 2) Sets / reps / weight / notes on an expanded exercise row
        const fieldEl = e.target.closest('[data-action="updateExerciseField"]');
        if (fieldEl) {
            const templateId = fieldEl.dataset.templateId;
            const index = parseInt(fieldEl.dataset.index, 10);
            const field = fieldEl.dataset.field;
            await updateExerciseField(templateId, index, field, fieldEl.value);
            return;
        }
    });
}

/** Search templates by name or exercise name */
export function searchWorkoutTemplates(query) {
    const listContainer = document.getElementById('template-list');
    if (!listContainer) return;

    if (!query || !query.trim()) {
        // Re-render full list
        let filtered = loadedTemplates;
        if (activeSelectorCategory) {
            filtered = loadedTemplates.filter(t => getWorkoutCategory(t._name) === activeSelectorCategory);
        }
        filtered = sortTemplatesByRecency(filtered);
        renderTemplateRows(listContainer, filtered, false);
        return;
    }

    const term = query.toLowerCase().trim();
    const matched = loadedTemplates.filter(t => {
        // Match template name
        if (t._name.toLowerCase().includes(term)) return true;
        // Match exercise names
        const exercises = normalizeExercisesToArray(t.exercises);
        return exercises.some(ex => getExerciseName(ex).toLowerCase().includes(term));
    });

    renderTemplateRows(listContainer, sortTemplatesByRecency(matched), false);
}

/** Clear cached workout history (call on workout complete/start) */
export function clearSelectorCache() {
    cachedWorkoutHistory = null;
    _lastSessionCache.clear();
}

// ===================================================================
// TEMPLATE CATEGORY MANAGEMENT
// ===================================================================

export function switchTemplateCategory(category) {
    currentTemplateCategory = category;

    // Update active tab (supports both .template-category-tab and .category-tab)
    document.querySelectorAll('.template-category-tab, .category-tab').forEach((tab) => {
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

    setupTemplateDelegation(container);
    container.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading templates...</span></div>';

    try {
        let templates = [];

        if (currentTemplateCategory === 'default') {
            // Load default/global templates
            templates = AppState.workoutPlans || [];
        } else if (currentTemplateCategory === 'custom') {
            // Load user's custom templates
            if (AppState.currentUser) {
                const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
                const workoutManager = new FirebaseWorkoutManager(AppState);
                templates = await workoutManager.getUserWorkoutTemplates();
                templates = templates.filter((t) => t.isCustom);
            }
        } else {
            // Filter by specific category
            templates = AppState.workoutPlans.filter(
                (plan) => getWorkoutCategory(plan.day || plan.name) === currentTemplateCategory
            );
        }

        // Apply equipment filter if active
        if (equipmentFilterActive && cachedAvailableExercises) {
            const { fullyCompatible, partiallyCompatible } = categorizeTemplates(templates, cachedAvailableExercises);
            templates = [...fullyCompatible, ...partiallyCompatible];
        }

        renderTemplateCards(templates, container, cachedAvailableExercises);
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
        const defaultTemplate = AppState.workoutPlans.find(
            (plan) => plan.day === templateId || plan.name === templateId || plan.id === templateId
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
            createdFrom: templateId,
        };

        // Save to Firebase
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
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
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
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

export function renderTemplateCards(templates, targetContainer = null, availableExercises = null) {
    const container = targetContainer || document.getElementById('template-cards-container');
    if (!container) return;

    setupTemplateDelegation(container);

    if (templates.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard-list"></i>
                <h3>No Templates Found</h3>
                <p>${
                    equipmentFilterActive
                        ? 'No templates match the equipment at this gym.'
                        : currentTemplateCategory === 'custom'
                            ? 'Create your first custom template in Workout Management.'
                            : 'No templates available in this category.'
                }</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    templates.forEach((template) => {
        const card = createTemplateCard(template, currentTemplateCategory === 'default', availableExercises);
        container.appendChild(card);
    });
}

export function createTemplateCard(template, isDefault = false, availableExercises = null) {
    const card = document.createElement('div');
    card.className = 'row-card template-row-card';

    // Handle both array and object exercise structures
    const exercisesArray = normalizeExercisesToArray(template.exercises);
    const exerciseCount = exercisesArray.length;

    // Use template.id for custom templates, template.day for default templates
    const templateId = template.id || template.day;
    const templateName = template.name || template.day;

    const category = getWorkoutCategory(templateName);
    const icon = getCategoryIcon(category);
    const catKey = category.toLowerCase();

    // Equipment compatibility badge
    let compatBadgeHtml = '';
    if (availableExercises && availableExercises.size > 0) {
        const compat = template.compatibility || checkTemplateCompatibility(template, availableExercises);
        if (compat.compatible) {
            compatBadgeHtml = '<span class="compat-badge compat-badge--full"><i class="fas fa-check-circle"></i> All equipment available</span>';
        } else if (compat.missing > 0 && compat.available > 0) {
            compatBadgeHtml = `<span class="compat-badge compat-badge--partial"><i class="fas fa-exclamation-triangle"></i> ${compat.missing} exercise${compat.missing > 1 ? 's' : ''} need other equipment</span>`;
        }
    }

    // Exercise summary: first 3 names
    const exerciseSummary = exercisesArray.length > 0
        ? exercisesArray.slice(0, 3).map(ex => getExerciseName(ex)).join(', ') + (exerciseCount > 3 ? ` +${exerciseCount - 3} more` : '')
        : 'No exercises';

    // Secondary actions: reset (if overrides default) and delete/hide
    let secondaryActions = '';
    if (template.overridesDefault) {
        secondaryActions += `<button class="template-overflow-item" data-action="resetToDefault" data-template-id="${escapeAttr(template.overridesDefault)}"><i class="fas fa-undo"></i> Reset to Default</button>`;
    }
    secondaryActions += `<button class="template-overflow-item template-overflow-item--danger" data-action="deleteTemplate" data-template-id="${escapeAttr(templateId)}" data-is-default="${isDefault}"><i class="fas fa-${isDefault ? 'eye-slash' : 'trash'}"></i> ${isDefault ? 'Hide' : 'Delete'}</button>`;

    card.innerHTML = `
        <div class="row-card__icon template-cat-icon--${escapeAttr(catKey)}">
            <i class="${icon}"></i>
        </div>
        <div class="row-card__content">
            <div class="row-card__title">${escapeHtml(templateName)}</div>
            <div class="row-card__subtitle">${exerciseCount} exercises · ${isDefault ? 'Default' : 'Custom'}${compatBadgeHtml ? ' ' + compatBadgeHtml : ''}</div>
            <div class="row-card__detail">${escapeHtml(exerciseSummary)}</div>
        </div>
        <div class="row-card__action template-row-actions">
            <button class="btn btn-primary btn-small" data-action="useTemplateFromManagement" data-template-id="${escapeAttr(templateId)}" data-is-default="${isDefault}" title="Start workout">
                <i class="fas fa-play"></i>
            </button>
            <button class="btn btn-secondary btn-icon btn-small" data-action="editTemplate" data-template-id="${escapeAttr(templateId)}" data-is-default="${isDefault}" title="Edit">
                <i class="fas fa-edit"></i>
            </button>
            <div class="template-overflow-wrapper">
                <button class="btn btn-icon btn-small template-overflow-toggle" title="More actions">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
                <div class="template-overflow-menu hidden">
                    ${secondaryActions}
                </div>
            </div>
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
    document.querySelectorAll('.workout-filter-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });

    // Filter and render with brief visual feedback
    const container = document.getElementById('workout-cards-container');
    if (!container) return;

    const list = container.querySelector('.template-list');
    if (list) list.classList.add('filtering');

    let filteredWorkouts;
    if (category === 'all') {
        filteredWorkouts = AppState.workoutPlans;
    } else {
        filteredWorkouts = AppState.workoutPlans.filter(
            (workout) => getWorkoutCategory(workout.day || workout.name) === category
        );
    }

    requestAnimationFrame(() => {
        renderWorkoutCards(filteredWorkouts);
    });
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

    const filteredTemplates = templates.filter((template) => {
        const name = (template.name || template.day || '').toLowerCase();
        const category = getWorkoutCategory(template.day || template.name).toLowerCase();
        const exercisesArray = normalizeExercisesToArray(template.exercises);
        const exercises = exercisesArray.map((ex) => getExerciseName(ex).toLowerCase()).join(' ');

        return name.includes(searchTerm) || category.includes(searchTerm) || exercises.includes(searchTerm);
    });

    renderTemplateCards(filteredTemplates);
}

// ===================================================================
// WORKOUT PREVIEW FUNCTIONALITY
// ===================================================================

// Add missing previewWorkout function
export function previewWorkout(workoutType) {
    const workout = AppState.workoutPlans.find(
        (plan) => plan.day === workoutType || plan.name === workoutType || plan.id === workoutType
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

    openModal(modal);
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
                const { startWorkout } = await import('../workout/workout-core.js');
                await startWorkout(title.textContent);
            }
        });
    }
}

function generateWorkoutPreviewHtml(workout) {
    const exercisesArray = normalizeExercisesToArray(workout.exercises);
    const exerciseCount = exercisesArray.length;
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

    if (exercisesArray.length > 0) {
        html += '<div class="exercises-preview-list">';
        exercisesArray.forEach((exercise, index) => {
            const exerciseName = getExerciseName(exercise);
            html += `
                <div class="exercise-preview-item">
                    <div class="exercise-preview-info">
                        <span class="exercise-name">${escapeHtml(exerciseName)}</span>
                        <span class="exercise-details">
                            ${exercise.sets || 3} sets × ${exercise.reps || 10} reps
                            ${exercise.weight ? ` @ ${exercise.weight} lbs` : ''}
                        </span>
                    </div>
                    ${exercise.bodyPart ? `<span class="exercise-body-part">${escapeHtml(exercise.bodyPart)}</span>` : ''}
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
    const exercisesArray = normalizeExercisesToArray(workout.exercises);
    if (exercisesArray.length === 0) return 30;

    // Estimate 2-3 minutes per set + rest time
    let totalSets = 0;
    exercisesArray.forEach((exercise) => {
        totalSets += exercise.sets || 3;
    });

    // 2.5 minutes per set (includes exercise time + rest)
    return Math.round(totalSets * 2.5);
}

export function closeWorkoutPreviewModal() {
    const modal = document.getElementById('workout-preview-modal');
    if (modal) {
        closeModal(modal);
    }
}

function renderWorkoutCards(workouts) {
    const container = document.getElementById('workout-cards-container');
    if (!container) return;

    setupTemplateDelegation(container);

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

    workouts.forEach((workout) => {
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

    const exercisesArray = normalizeExercisesToArray(workout.exercises);
    const exerciseCount = exercisesArray.length;
    const exerciseNames =
        exercisesArray
            .slice(0, 3)
            .map((ex) => getExerciseName(ex))
            .join(', ') || 'No exercises listed';
    const moreText = exerciseCount > 3 ? ` and ${exerciseCount - 3} more...` : '';

    card.innerHTML = `
        <div class="workout-header">
            <h3>${escapeHtml(workoutName)}</h3>
            <span class="workout-category">${escapeHtml(getWorkoutCategory(workoutName))}</span>
        </div>
        <div class="workout-preview">
            <div class="exercise-count">${exerciseCount} exercises</div>
            <div class="exercise-list">${escapeHtml(exerciseNames)}${escapeHtml(moreText)}</div>
        </div>
        <div class="workout-actions">
            <button class="btn btn-primary" data-action="startWorkout" data-workout="${escapeAttr(workoutName)}">
                <i class="fas fa-play"></i> Start Workout
            </button>
            <button class="btn btn-secondary" data-action="previewWorkout" data-workout="${escapeAttr(workoutName)}">
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
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);

        let template = null;

        // Try to find in user templates first
        const userTemplates = await workoutManager.getUserWorkoutTemplates();
        template = userTemplates.find((t) => t.id === templateId);

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

    openModal(modal);
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
            <span class="exercise-name">${escapeHtml(getExerciseName(exercise))}</span>
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
        closeModal(modal);
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
            lastUpdated: new Date().toISOString(),
        };

        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
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

// getExerciseName imported from workout-helpers.js

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

// ===================================================================
// MISSING UTILITY FUNCTIONS
// ===================================================================

export function clearTemplateFilters() {
    // Clear any active filters
    document.querySelectorAll('.template-filter-btn').forEach((btn) => {
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

window.addExerciseToBasicTemplate = function () {
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
        weight: weight,
    });

    showBasicTemplateEditor(modal.templateData);
};

window.editBasicExercise = function (index) {
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

window.removeBasicExercise = function (index) {
    const modal = document.getElementById('basic-template-editor-modal');
    if (!modal || !modal.templateData) return;

    if (confirm('Remove this exercise from the template?')) {
        modal.templateData.exercises.splice(index, 1);
        showBasicTemplateEditor(modal.templateData);
    }
};
