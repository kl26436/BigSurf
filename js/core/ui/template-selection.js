// Template Selection Module - core/template-selection.js
// Handles template browsing, selection, and immediate usage

import { AppState } from '../utils/app-state.js';
import { getCategoryIcon, CATEGORY_COLORS } from '../utils/config.js';
import { showNotification, escapeHtml, escapeAttr } from './ui-helpers.js';
import { confirmSheet } from './confirm-sheet.js';
import { getExerciseName } from '../utils/workout-helpers.js';
import { setBottomNavVisible, updateBottomNavActive } from './navigation.js';
import { getEquipmentAtLocation, getExercisesAtLocation, checkTemplateCompatibility } from '../features/equipment-planner.js';
// Namespace import so a stale prod-cached equipment-planner.js (1-year JS
// cache) degrades to "no badges" instead of a missing-named-export crash.
import * as equipmentPlanner from '../features/equipment-planner.js';
import { getTemplatesForDayOfWeek } from '../features/metrics/aggregators.js';
import { showFirstUseTip } from '../features/first-use-tips.js';

// ===================================================================
// TEMPLATE SELECTION STATE
// ===================================================================

// ── Gym context for compatibility badges (Tier 3 Phase 1 / traveler-flow) ──
// { gym: string|null, equipmentCount: number, available: Set<string> } or
// null when the user has zero equipment docs (D0: system stays invisible).
let gymContext = null;
let possibleHereFilter = false;
// Per-render badge map (templateId → badge|null); D2 suppression flag.
let renderedBadges = new Map();

// Track which containers already have delegation listeners
const delegatedContainers = new WeakSet();


// ===================================================================
// EQUIPMENT FILTER — "At this gym"
// ===================================================================




// ===================================================================
// TEMPLATE SELECTION UI
// ===================================================================




export async function selectTemplate(templateId, isDefault = false) {
    if (!AppState.currentUser) {
        showNotification('Sign in to start workouts', 'warning');
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

        // Import and use startWorkout function (dynamic import to avoid circular dependency)
        const { startWorkout } = await import('../workout/workout-core.js');
        await startWorkout(selectedTemplate.day || selectedTemplate.name || templateId);
    } catch (error) {
        console.error('Error selecting template:', error);
        showNotification("Couldn't start workout", 'error');
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

/**
 * Canonical Title-Case form for a category string. The details-accordion
 * chips save lowercase tokens (push/pull/legs/core/cardio/other), while
 * getWorkoutCategory returns Title-Case ("Push", "Pull", …). Without
 * normalizing, the pill list renders BOTH "push" and "Push" for the same
 * logical bucket.
 */
function normalizeCategoryLabel(raw) {
    const k = (raw || '').toLowerCase().trim();
    if (k === 'push') return 'Push';
    if (k === 'pull') return 'Pull';
    if (k === 'legs' || k === 'leg') return 'Legs';
    if (k === 'core') return 'Core';
    if (k === 'cardio') return 'Cardio';
    if (k === 'other' || k === 'mixed' || k === '') return 'Other';
    // Unknown custom value — preserve the user's casing if it looks
    // intentional, otherwise Title-Case the first letter.
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Effective category for a template: the explicit `category` field wins over
 * the name-derived fallback. Without this, changing a workout's category in
 * the details accordion saves to Firestore but the pill filter keeps using
 * getWorkoutCategory(name) — so the row never moves between pills.
 */
function effectiveTemplateCategory(t) {
    if (!t) return 'Other';
    return normalizeCategoryLabel(t.category || getWorkoutCategory(t._name || t.name || t.day));
}

/** Cached recent workout history for template recency sorting */
let cachedWorkoutHistory = null;

/** Currently expanded exercise within a template (key = `${templateId}_${idx}`).
 *  Phase 3 — only one exercise expanded at a time across the whole list. */
let expandedExerciseInTemplate = null;

/** Phase 3b — which template the dedicated editor page is currently showing.
 *  The list is now read-first: tapping a row opens this editor on its own page
 *  (#workout-editor-section) instead of expanding in place. */
let activeEditorTemplateId = null;

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
    } catch {
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
/**
 * Load the gym context for badges. Rebuilt on every selector render so
 * badges reflect equipment added mid-session (the caches make this cheap;
 * gym RESOLUTION is cached inside gym-session-context). D0 guard lives
 * here: a user with zero equipment docs gets `null` and every availability
 * surface stays invisible — no chip, no badges, no banner.
 */
async function loadGymContext() {
    try {
        let equipment = AppState._cachedEquipment;
        if (!equipment) {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            equipment = await new FirebaseWorkoutManager(AppState).getUserEquipment();
            AppState._cachedEquipment = equipment;
        }
        if (!Array.isArray(equipment) || equipment.length === 0) {
            gymContext = null; // D0: nothing renders
            return null;
        }
        const { resolveSessionGym } = await import('../features/gym-session-context.js');
        const gym = await resolveSessionGym();
        const atGym = gym ? getEquipmentAtLocation(equipment, gym) : [];
        gymContext = {
            gym: gym || null,
            equipmentCount: atGym.length,
            available: getExercisesAtLocation(atGym),
        };
    } catch (err) {
        console.error('Gym context load failed:', err);
        gymContext = null;
    }
    return gymContext;
}

/**
 * Gym chip tap → pick a gym (or clear) for the availability context. Reuses
 * the shared gym-picker sheet via window (existing wiring, no import skew).
 */
async function openGymContextSwitcher() {
    if (typeof window.openGymPickerSheet !== 'function') return;

    const gymNames = new Set();
    (AppState._cachedEquipment || []).forEach(eq =>
        (eq.locations || []).forEach(l => l && gymNames.add(l))
    );
    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        (await new FirebaseWorkoutManager(AppState).getUserLocations())
            .forEach(l => l?.name && gymNames.add(l.name));
    } catch { /* equipment-derived list is enough */ }

    const gyms = [...gymNames].sort();
    if (gymContext?.gym) gyms.push('Clear gym');

    window.openGymPickerSheet({
        title: 'Which gym?',
        subtitle: 'Availability badges use this gym',
        gyms,
        currentGym: gymContext?.gym || null,
        onSelect: async (name) => {
            try {
                const { setSessionGym } = await import('../features/gym-session-context.js');
                setSessionGym(name === 'Clear gym' ? null : name);
            } catch { /* context module unavailable — leave as-is */ }
            possibleHereFilter = false;
            renderWorkoutSelectorUI();
        },
    });
}

/** Badge for one template at the current gym context (null = no badge). */
function computeBadge(template) {
    if (!gymContext?.gym || gymContext.equipmentCount === 0) return null;
    if (typeof equipmentPlanner.badgeForTemplate !== 'function') return null;
    const compatibility = checkTemplateCompatibility(
        { exercises: normalizeExercisesToArray(template.exercises) },
        gymContext.available
    );
    return equipmentPlanner.badgeForTemplate(compatibility, gymContext.equipmentCount);
}

/**
 * Load gym context + recent workout history, then rebuild the template working
 * set (`loadedTemplates`) from AppState.workoutPlans. Shared by the list view
 * and the Phase 3b editor page so both have their data regardless of which one
 * the user reached first (e.g. a deep-link straight into the editor).
 */
async function ensureSelectorContext() {
    await loadGymContext();

    // Load workout history for recency sorting + "usually" derivation (cached).
    if (!cachedWorkoutHistory && AppState.currentUser) {
        try {
            const { db, collection, query, orderBy, limit, getDocs } = await import('../data/firebase-config.js');
            const ref = collection(db, `users/${AppState.currentUser.uid}/workouts`);
            const q = query(ref, orderBy('completedAt', 'desc'), limit(50));
            const snapshot = await getDocs(q);
            cachedWorkoutHistory = [];
            snapshot.forEach(doc => cachedWorkoutHistory.push(doc.data()));
        } catch {
            cachedWorkoutHistory = [];
        }
    }

    // Use AppState.workoutPlans as the single source of truth (already deduped)
    const allTemplates = (AppState.workoutPlans || []).map(t => ({
        ...t,
        _id: t.id || t.day,
        _name: t.name || t.day,
        _isDefault: !t.isCustom,
    }));
    loadedTemplates = allTemplates;
    return allTemplates;
}

async function renderWorkoutSelectorUI() {
    const pillsContainer = document.getElementById('category-pills');
    const listContainer = document.getElementById('template-list');
    if (!pillsContainer || !listContainer) return;

    const allTemplates = await ensureSelectorContext();

    // Phase 7 — archived workouts drop out of the main browsing surface (and
    // For Today ranking + dashboard); they live in a collapsed group at the
    // bottom of the list, restorable any time.
    const activeTemplates = allTemplates.filter(t => !t.archived);
    const archivedTemplates = allTemplates.filter(t => t.archived);

    // Collect unique categories (from active workouts only)
    const categories = [...new Set(activeTemplates.map(effectiveTemplateCategory))];

    // Render filter pills
    renderCategoryPills(pillsContainer, categories);

    // Filter by active category
    let filtered = activeTemplates;
    if (activeSelectorCategory) {
        filtered = activeTemplates.filter(t => effectiveTemplateCategory(t) === activeSelectorCategory);
    }

    // "Possible here" pill: keep workouts with positive evidence at this gym
    // (full or partial — partial starts fine with substitutions; D3).
    if (possibleHereFilter && gymContext?.gym && gymContext.equipmentCount > 0) {
        filtered = filtered.filter(t => {
            const b = computeBadge(t);
            return b && (b.state === 'full' || b.state === 'partial');
        });
    }

    // Sort: most recently used first, then alphabetical
    filtered = sortTemplatesByRecency(filtered);

    // Render template rows (archived group appended when not category-filtered)
    renderTemplateRows(listContainer, filtered, activeSelectorCategory !== null, archivedTemplates);

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

    // "Possible here" filter pill — only when badges are live at a gym.
    const possiblePill = (gymContext?.gym && gymContext.equipmentCount > 0)
        ? `<button class="category-pill category-pill--possible ${possibleHereFilter ? 'active' : ''}"
                   data-category="__possible-here__" aria-pressed="${possibleHereFilter}">
               <i class="fas fa-check-circle"></i> Possible here
           </button>`
        : '';

    container.innerHTML = `
        <button class="category-pill ${!activeSelectorCategory ? 'active' : ''}" data-category="all">All</button>
        ${possiblePill}
        ${pills}
    `;

    // Delegate pill clicks
    if (!delegatedContainers.has(container)) {
        delegatedContainers.add(container);
        container.addEventListener('click', (e) => {
            const pill = e.target.closest('.category-pill');
            if (!pill) return;
            const cat = pill.dataset.category;
            if (cat === '__possible-here__') {
                possibleHereFilter = !possibleHereFilter;
                renderWorkoutSelectorUI();
                return;
            }
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

function renderTemplateRows(container, templates, isFiltered, archivedTemplates = []) {
    // Category filter with no matches — simple message (archived group not shown
    // while a filter is active).
    if (templates.length === 0 && isFiltered) {
        container.innerHTML = `
            <div class="template-empty-state">
                <div class="template-empty-state__icon"><i class="fas fa-filter"></i></div>
                <div class="template-empty-state__text">No workouts in this category</div>
            </div>
        `;
        return;
    }

    // Truly empty — no active AND no archived workouts. New-user two-door state.
    if (templates.length === 0 && archivedTemplates.length === 0) {
        container.innerHTML = `
            <div class="template-empty-state">
                <div class="template-empty-state__icon"><i class="fas fa-dumbbell"></i></div>
                <div class="template-empty-state__text">No workouts yet</div>
                <div class="template-empty-state__sub">Jump in now, or plan a reusable workout you can start with one tap.</div>
                <div class="template-empty-state__doors">
                    <button class="btn btn-primary" onclick="openQuickStartSheet()">
                        <i class="fas fa-bolt"></i> Quick start
                    </button>
                    <button class="btn btn-secondary" onclick="createNewTemplate()">
                        <i class="fas fa-plus"></i> Plan a workout
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // Compute badges for this render. D2: when every visible workout is fully
    // compatible, badges carry no information — suppress them all. F1: a gym
    // with zero mapped equipment gets one banner instead of per-card badges.
    renderedBadges = new Map();
    if (gymContext?.gym && gymContext.equipmentCount > 0) {
        templates.forEach(t => renderedBadges.set(t._id, computeBadge(t)));
        const badges = [...renderedBadges.values()].filter(Boolean);
        if (badges.length > 0 && badges.every(b => b.state === 'full')) {
            renderedBadges = new Map(); // D2 suppression
        }
    }

    // 5.6.0 — variations nest under their parent so four push riffs read as
    // one family, not four rows. Orphaned variations (parent deleted/archived)
    // render at top level like cores.
    const parentIds = new Set(templates.map(t => t.id || t._id));
    const isNestedVariation = (t) => t.kind === 'variation' && t.parentTemplateId
        && parentIds.has(t.parentTemplateId) && (t.id || t._id) !== t.parentTemplateId;
    const byParent = new Map();
    for (const t of templates) {
        if (isNestedVariation(t)) {
            const list = byParent.get(t.parentTemplateId) || [];
            list.push(t);
            byParent.set(t.parentTemplateId, list);
        }
    }
    const ordered = templates.filter(t => !isNestedVariation(t)).flatMap(t => [
        t, ...(byParent.get(t.id || t._id) || []),
    ]);

    container.innerHTML = renderQuickStartCta()
        + renderGymContextHeader()
        + renderSuggestedForToday(templates, isFiltered)
        + ordered.map(t => isNestedVariation(t)
            ? `<div class="template-row--variation">${renderSingleTemplateRow(t)}</div>`
            : renderSingleTemplateRow(t)).join('')
        + (isFiltered ? '' : renderArchivedGroup(archivedTemplates));

    // Pre-filled notes textareas start at their content height, not one row.
    if (typeof window.awAutoGrowNotes === 'function') {
        container.querySelectorAll('.te-row__notes-field textarea')
            .forEach((t) => window.awAutoGrowNotes(t));
    }
}

// ===================================================================
// PHASE 7 — Quick start (freestyle: start now, add exercises as you go)
// ===================================================================

/** Prominent CTA at the top of the list — the improviser's door. */
function renderQuickStartCta() {
    return `
        <button class="quick-start-cta" onclick="openQuickStartSheet()">
            <div class="quick-start-cta__icon"><i class="fas fa-bolt"></i></div>
            <div class="quick-start-cta__text">
                <div class="quick-start-cta__title">Quick start</div>
                <div class="quick-start-cta__sub">Start now, add exercises as you go</div>
            </div>
            <i class="fas fa-chevron-right quick-start-cta__chev"></i>
        </button>
    `;
}

// Focus is optional — the workoutType label becomes "Freestyle — Legs" etc.
// Options are the template/workout categories (a programming focus), styled with
// the shared .chip (no new pill variant — Phase 7 consistency gate).
let _quickStartFocus = null;
// Last matching freestyle session (hydrated async per focus) — powers the
// "Start from last Legs" shortcut. Freestyle memory: the improviser's own
// history is his template, so surface it without ever calling it one.
let _qsLastSession = null;
const QUICK_START_FOCUSES = ['Push', 'Pull', 'Legs', 'Core', 'Cardio'];

export function openQuickStartSheet() {
    _quickStartFocus = null;
    _qsLastSession = null;
    const chips = QUICK_START_FOCUSES.map(f =>
        `<button class="chip chip--sm" data-qs-focus="${f}" onclick="qsSetFocus('${f}')">${escapeHtml(f)}</button>`
    ).join('');

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'qs-sheet-backdrop';
    backdrop.onclick = closeQuickStartSheet;

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'qs-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">Quick start</div>
            <div class="aw-sheet__subtitle">Pick a focus (optional), then add exercises as you go</div>
        </div>
        <div class="aw-sheet__body">
            <div class="qs-focus-chips">${chips}</div>
            <div id="qs-memory"></div>
        </div>
        <div class="aw-sheet__actions">
            <button class="aw-sheet__action" onclick="closeQuickStartSheet()">Cancel</button>
            <button class="aw-sheet__action primary" onclick="qsStart()">Start workout</button>
        </div>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => { backdrop.classList.add('visible'); sheet.classList.add('visible'); });
    hydrateQuickStartMemory();
}

export function qsSetFocus(focus) {
    // Toggle — tapping the active chip clears it (focus is optional).
    _quickStartFocus = (_quickStartFocus === focus) ? null : focus;
    document.querySelectorAll('#qs-sheet [data-qs-focus]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.qsFocus === _quickStartFocus);
    });
    hydrateQuickStartMemory();
}

/**
 * Async-fill the "last time" line for the current focus: "Last Legs · 2w ago —
 * Leg press · Hack squat · Leg curl +2 more" with a one-tap "Start from last".
 * Silent when there's no matching history (first-timers see nothing extra).
 */
async function hydrateQuickStartMemory() {
    const el = document.getElementById('qs-memory');
    if (!el) return;
    const focusAtRequest = _quickStartFocus;
    try {
        const [{ loadAllWorkouts }, mem] = await Promise.all([
            import('../data/data-manager.js'),
            import('../features/freestyle-memory.js'),
        ]);
        const workouts = await loadAllWorkouts(AppState);
        // The user may have tapped another chip while we loaded — drop stale fills.
        if (_quickStartFocus !== focusAtRequest) return;
        const last = mem.getLastFreestyleSession(workouts, _quickStartFocus);
        const target = document.getElementById('qs-memory');
        if (!target) return;
        if (!last) { _qsLastSession = null; target.innerHTML = ''; return; }

        _qsLastSession = last;
        const names = last.exercises.map((e) => e.machine || e.name).filter(Boolean);
        const shown = names.slice(0, 3).join(' · ');
        const more = names.length > 3 ? ` +${names.length - 3} more` : '';
        const label = last.focus ? `Last ${last.focus}` : 'Last freestyle';
        const rel = mem.relativeDaysLabel(last.date);
        target.innerHTML = `
            <div class="qs-memory">
                <div class="qs-memory__info">
                    <div class="qs-memory__meta">${escapeHtml(label)}${rel ? ` · ${escapeHtml(rel)}` : ''}</div>
                    <div class="qs-memory__list">${escapeHtml(shown + more)}</div>
                </div>
                <button class="qs-memory__go" onclick="qsStartFromLast()">
                    <i class="fas fa-rotate-right" aria-hidden="true"></i> Start from last
                </button>
            </div>
        `;
    } catch {
        // Memory is a bonus, never a blocker — leave the sheet plain.
    }
}

/** Start a freestyle session pre-loaded with the last matching session's
 *  exercises (same seeding path Repeat uses). */
export function qsStartFromLast() {
    const last = _qsLastSession;
    if (!last) return;
    const focus = _quickStartFocus || last.focus || null;
    closeQuickStartSheet();
    if (typeof window.startFreestyleWorkout === 'function') {
        window.startFreestyleWorkout(focus, last.exercises);
    }
}

export function closeQuickStartSheet() {
    document.getElementById('qs-sheet')?.remove();
    document.getElementById('qs-sheet-backdrop')?.remove();
}

export function qsStart() {
    const focus = _quickStartFocus;
    closeQuickStartSheet();
    if (typeof window.startFreestyleWorkout === 'function') {
        window.startFreestyleWorkout(focus);
    }
}

// ===================================================================
// PHASE 7 — Archive (keep the list tight as workouts accumulate)
// ===================================================================

let _archivedGroupOpen = false;

/** Collapsed "Archived (N)" group at the bottom of the list. Reuses .row-card
 *  markup for restore rows (no new collapsed-group component — Phase 7 gate). */
function renderArchivedGroup(archived) {
    if (!archived || archived.length === 0) return '';
    const rows = _archivedGroupOpen
        ? archived.map(t => `
            <div class="row-card archived-row" data-template-id="${escapeAttr(t._id)}" data-action="openWorkoutEditor">
                <div class="row-card__content">
                    <div class="row-card__title">${escapeHtml(t._name)}</div>
                    <div class="row-card__subtitle">${normalizeExercisesToArray(t.exercises).length} exercises</div>
                </div>
                <button class="archived-row__restore" data-stop-propagation
                        onclick="unarchiveTemplate('${escapeAttr(t._id)}')">Restore</button>
            </div>`).join('')
        : '';
    return `
        <div class="archived-group">
            <button class="archived-group__header" onclick="toggleArchivedGroup()" aria-expanded="${_archivedGroupOpen}">
                <span>Archived (${archived.length})</span>
                <i class="fas fa-chevron-${_archivedGroupOpen ? 'up' : 'down'}"></i>
            </button>
            ${rows}
        </div>
    `;
}

export function toggleArchivedGroup() {
    _archivedGroupOpen = !_archivedGroupOpen;
    renderWorkoutSelectorUI();
}

async function setTemplateArchived(templateId, archived) {
    const t = loadedTemplates.find(x => x._id === templateId);
    if (!t) return;
    t.archived = archived;
    await saveTemplateInline(t, normalizeExercisesToArray(t.exercises));
}

export async function archiveTemplate(templateId) {
    await setTemplateArchived(templateId, true);
    showNotification('Workout archived', 'success', 1500);
    // Archived from the editor page → the workout left the main list, so return
    // to it; otherwise just re-render the list in place.
    if (activeEditorTemplateId === templateId) {
        activeEditorTemplateId = null;
        if (typeof window.navigateTo === 'function') window.navigateTo('workout-selector');
        else renderWorkoutSelectorUI();
    } else {
        renderWorkoutSelectorUI();
    }
}

export async function unarchiveTemplate(templateId) {
    await setTemplateArchived(templateId, false);
    showNotification('Workout restored', 'success', 1500);
    renderWorkoutSelectorUI();
}

/**
 * Gym context chip + F1 banner above the list (Tier 3 Phase 1).
 * D0: renders nothing when the user has no equipment docs (gymContext null).
 */
function renderGymContextHeader() {
    if (!gymContext) return '';
    const gym = gymContext.gym;

    const chip = `
        <button type="button" class="gym-context-chip" data-stop-propagation
                data-action="switchGymContext"
                aria-label="${gym ? `At ${escapeAttr(gym)} — change gym` : 'Set gym for availability'}">
            <i class="fas fa-map-marker-alt"></i>
            <span class="gym-context-chip__name">${gym ? `At ${escapeHtml(gym)}` : 'Set gym for availability'}</span>
            <i class="fas fa-chevron-down gym-context-chip__caret"></i>
        </button>
    `;

    // F1: a known gym with zero mapped equipment gets one neutral banner —
    // never a page of hard negatives. Dismissible once per gym.
    let banner = '';
    if (gym && gymContext.equipmentCount === 0) {
        const dismissed = (AppState.settings?.dismissedGymBanners || []).includes(gym);
        if (!dismissed) {
            banner = `
                <div class="gym-new-banner" data-stop-propagation>
                    <i class="fas fa-compass gym-new-banner__icon"></i>
                    <div class="gym-new-banner__text">New gym — start a workout and it'll get mapped as you go</div>
                    <button type="button" class="gym-new-banner__dismiss"
                            data-action="dismissGymBanner" data-gym="${escapeAttr(gym)}"
                            aria-label="Dismiss">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }
    }

    return `<div class="gym-context-row" data-stop-propagation>${chip}</div>${banner}`;
}

/**
 * "Suggested for [day]" banner — ranks templates by how often they're done on
 * today's weekday (getTemplatesForDayOfWeek, same source as the dashboard).
 * Renders nothing when filtering, when history is thin, or when the top pick
 * was already done today.
 */
function renderSuggestedForToday(templates, isFiltered) {
    if (isFiltered || !cachedWorkoutHistory || cachedWorkoutHistory.length === 0) return '';
    const dow = new Date().getDay();
    const ranked = getTemplatesForDayOfWeek(
        templates.map(t => ({ ...t, name: t._name })),
        cachedWorkoutHistory,
        dow
    );
    const top = ranked[0];
    if (!top || top.count < 2) return '';
    const name = top.template._name;
    const doneToday = getLastWorkoutDate(name) === AppState.getTodayDateString?.();
    if (doneToday) return '';
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow];
    return `
        <div class="tpl-suggested" data-stop-propagation
             data-action="startTemplateRow" data-workout="${escapeAttr(name)}" role="button">
            <i class="fas fa-calendar-check tpl-suggested__icon"></i>
            <div class="tpl-suggested__text">Suggested for ${dayName}: <strong>${escapeHtml(name)}</strong></div>
            <span class="tpl-suggested__go"><i class="fas fa-play"></i></span>
        </div>
    `;
}

/** Badge chip for a workout row — reads the per-render map (D2-suppressed). */
function renderCompatBadge(templateId) {
    const badge = renderedBadges.get(templateId);
    if (!badge) return '';
    const icon = badge.state === 'full' ? '<i class="fas fa-check"></i>'
        : badge.state === 'partial' ? '<i class="fas fa-adjust"></i>'
        : '<i class="far fa-circle"></i>';
    return `<span class="compat-badge compat-badge--${badge.state}">${icon}${escapeHtml(badge.label)}</span>`;
}

function renderSingleTemplateRow(template) {
    const category = effectiveTemplateCategory(template);
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
    const templateId = template._id;
    const templateName = template._name;

    // Read-first row (Phase 3b): all the scent the editor used to hide in the
    // accordion — category chip + "Usually [day]" + exercise count + ~duration
    // (line 1, via renderTemplateSummary) and last-done (line 2). Tapping the
    // row opens the editor page; the play button starts now.
    const lastWorkout = getLastWorkoutForTemplate(templateName);
    const lastDone = lastWorkout?.date
        ? `Last done ${formatTimeAgo(lastWorkout.date).toLowerCase()}`
        : 'Not done yet';

    return `
        <div class="row-card template-row" data-template-id="${escapeAttr(templateId)}" data-is-default="${template._isDefault}" data-action="openWorkoutEditor">
            <div class="template-row__dot" style="--dot-color: ${color};"></div>
            <div class="row-card__content">
                <div class="row-card__title">${escapeHtml(templateName)}</div>
                <div class="row-card__subtitle template-row__summary">${renderTemplateSummary(template)}</div>
                <div class="row-card__subtitle template-row__last">${escapeHtml(lastDone)}</div>
                ${renderCompatBadge(templateId)}
            </div>
            <i class="fas fa-chevron-right template-row__chev" aria-hidden="true"></i>
            <div class="template-row__start">
                <button class="btn-start-small" data-action="startTemplateRow" data-workout="${escapeAttr(templateName)}" aria-label="Start ${escapeAttr(templateName)}">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        </div>
    `;
}

// ===================================================================
// PHASE 3b — the workout editor on its own page (#workout-editor-section)
// The list stays read-first; tapping a row opens this. All the editor
// machinery (steppers, autosave, reorder, add/equipment sheets, day/category
// chips) is unchanged — only the container moved off the list.
// ===================================================================

/**
 * Open the editor page for a template. Sets the active editor id, then routes
 * through navigateTo so the section un-hides and back-nav is recorded.
 */
export function showWorkoutEditor(templateId) {
    if (templateId) activeEditorTemplateId = templateId;
    if (!activeEditorTemplateId) return;
    expandedExerciseInTemplate = null;
    if (typeof window.navigateTo === 'function') {
        window.navigateTo('workout-editor');
    } else {
        renderActiveWorkoutEditor();
    }
}

/**
 * Leave the editor. Flush any pending debounced edit first so a value typed
 * then immediately backed-out of isn't lost, then return to the list (Phase 2b
 * back contract — navigateBack returns exactly where the user came from).
 */
export async function closeWorkoutEditor() {
    await flushPendingTemplateEdits();
    activeEditorTemplateId = null;
    expandedExerciseInTemplate = null;
    if (typeof window.navigateBack === 'function') {
        window.navigateBack();
    } else if (typeof window.navigateTo === 'function') {
        window.navigateTo('workout-selector');
    }
}

/**
 * Render the editor page for `activeEditorTemplateId` into
 * #workout-editor-content. Self-sufficient: loads gym context + history +
 * rebuilds loadedTemplates, so it works whether reached via a list tap or a
 * deep-link (editTemplate / createNewTemplate / AI-coach).
 */
export async function renderActiveWorkoutEditor() {
    const container = document.getElementById('workout-editor-content');
    if (!container) return;

    const allTemplates = await ensureSelectorContext();
    const template = allTemplates.find(t => t._id === activeEditorTemplateId);
    if (!template) {
        // Template gone (deleted while open) — bail back to the list.
        container.innerHTML = '';
        activeEditorTemplateId = null;
        if (typeof window.navigateTo === 'function') window.navigateTo('workout-selector');
        return;
    }

    // Per-render compat badge for this one template (reuses the list's map).
    renderedBadges = new Map();
    if (gymContext?.gym && gymContext.equipmentCount > 0) {
        renderedBadges.set(template._id, computeBadge(template));
    }

    container.innerHTML = renderWorkoutEditorPage(template);
    setupSelectorDelegation(container);
    hydrateLastSession();
    if (typeof window.awAutoGrowNotes === 'function') {
        container.querySelectorAll('.te-row__notes-field textarea')
            .forEach((t) => window.awAutoGrowNotes(t));
    }
}

/** Re-render whichever surface is live after an edit — editor page if it's
 *  open, otherwise the list. Edit handlers call this instead of hard-coding
 *  the list re-render. */
function refreshEditorOrList() {
    const editorSection = document.getElementById('workout-editor-section');
    const editorVisible = editorSection && !editorSection.classList.contains('hidden');
    if (activeEditorTemplateId && editorVisible) {
        renderActiveWorkoutEditor();
    } else {
        renderWorkoutSelectorUI();
    }
}

function renderWorkoutEditorPage(template) {
    const templateId = template._id;
    const templateName = template._name;
    const exercisesArray = normalizeExercisesToArray(template.exercises);

    const exerciseListHtml = exercisesArray.map((ex, i) =>
        renderTemplateExerciseRow(ex, i, exercisesArray.length, templateId,
            expandedExerciseInTemplate === `${templateId}_${i}`)
    ).join('');

    const unmappedCount = exercisesArray.filter(ex => isExerciseUnmappedAtGym(ex)).length;
    const unmappedNote = (unmappedCount > 0 && unmappedCount < exercisesArray.length)
        ? `<div class="template-editor__unmapped-note">${unmappedCount} not mapped — pick machines or swaps when you start. Asked once, remembered.</div>`
        : '';

    const isArchived = !!template.archived;

    // Archive suggestion (Phase 7): a workout untouched for 60+ days is clutter —
    // offer to tuck it away. Only when it has been done at least once.
    const lastW = getLastWorkoutForTemplate(templateName);
    let archiveSuggestion = '';
    if (!isArchived && lastW?.date) {
        const days = Math.floor((Date.now() - new Date(lastW.date + 'T00:00:00').getTime()) / 86400000);
        if (days >= 60) {
            archiveSuggestion = `
                <div class="editor-archive-hint">
                    <i class="fas fa-box-archive"></i>
                    <span>Not done in ${days} days — archive it to keep your list tidy?</span>
                    <button data-action="archiveTemplate" data-template-id="${escapeAttr(templateId)}">Archive</button>
                </div>`;
        }
    }

    return `
        <div class="we-header">
            <button class="d-back" onclick="closeWorkoutEditor()" aria-label="Back to workouts">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="we-header__info">
                <input class="we-title-input" data-action="renameTemplate"
                       data-template-id="${escapeAttr(templateId)}"
                       value="${escapeAttr(templateName)}" aria-label="Workout name" />
                <div class="we-subtitle">${renderTemplateSummary(template)}</div>
            </div>
        </div>

        <div class="we-body" data-stop-propagation>
            <div class="template-editor__details">
                ${renderTemplateDetailsBody(template)}
            </div>

            <div class="template-editor__section-header">
                <span class="template-editor__section-label">Exercises</span>
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
            ${unmappedNote}
            <button class="template-editor__add-btn" data-action="addTemplateExercise" data-template-id="${escapeAttr(templateId)}" data-is-default="${template._isDefault}">
                <i class="fas fa-plus"></i> Add exercise
            </button>
            ${archiveSuggestion}
            <div class="template-editor__actions">
                <button class="template-editor__action" data-action="duplicateTemplate" data-template-id="${escapeAttr(templateId)}" data-is-default="${template._isDefault}">
                    <i class="fas fa-copy"></i> Duplicate
                </button>
                <button class="template-editor__action" data-action="${isArchived ? 'unarchiveTemplate' : 'archiveTemplate'}" data-template-id="${escapeAttr(templateId)}">
                    <i class="fas fa-box-archive"></i> ${isArchived ? 'Restore' : 'Archive'}
                </button>
                <button class="template-editor__action template-editor__action--danger" data-action="deleteTemplateInline" data-template-id="${escapeAttr(templateId)}" data-is-default="${template._isDefault}">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>

        <div class="we-start-bar" data-stop-propagation>
            <button class="we-start-btn" data-action="startTemplateRow" data-workout="${escapeAttr(templateName)}">
                <i class="fas fa-play"></i> Start workout
            </button>
        </div>
    `;
}

/**
 * Render a single exercise row inside the workout editor.
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
        <button type="button" class="chip cat-${c.value} ${cat === c.value ? 'active' : ''}"
                aria-pressed="${cat === c.value}"
                data-action="setTemplateCategory"
                data-template-id="${escapeAttr(templateId)}"
                data-cat="${c.value}">${c.label}</button>
    `).join('');

    const dayChipsHtml = DAY_SHORT_LABELS.map((short, i) => {
        const active = days.includes(DAY_VALUES[i]);
        return `
        <button type="button" class="day-chip ${active ? 'active' : ''}"
                aria-pressed="${active}"
                data-action="toggleTemplateDay"
                data-template-id="${escapeAttr(templateId)}"
                data-day="${DAY_VALUES[i]}"
                aria-label="${DAY_VALUES[i].charAt(0).toUpperCase() + DAY_VALUES[i].slice(1)}">${short}</button>
    `;
    }).join('');

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

/**
 * Per-exercise availability at the session gym — STATUS ONLY (traveler-flow
 * Step 3: the card informs, it never solicits; resolution lives in the start
 * sheet and the mid-workout picker). Equipment-less exercises (including
 * D10-skipped ones) count as available. Returns false when no gym context.
 */
function isExerciseUnmappedAtGym(ex) {
    if (!gymContext?.gym || gymContext.equipmentCount === 0) return false;
    if (!ex.equipment) return false;
    return !gymContext.available.has(getExerciseName(ex));
}

function renderTemplateExerciseRow(ex, idx, total, templateId, isExpanded) {
    const exName = getExerciseName(ex);
    const category = (ex.category || ex.bodyPart || 'other').toLowerCase();
    const tintCat = ['push', 'pull', 'legs', 'core', 'cardio'].includes(category) ? category : 'other';
    const unmapped = isExerciseUnmappedAtGym(ex);
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

    // Real tap targets around each value (mockup: workout-editor-ergonomics).
    // Tap the value itself for keyboard entry; +/− for one-handed adjustment.
    const weightStep = unit === 'kg' ? 2.5 : 5;
    const stepper = (label, field, value, inputAttrs, delta) => `
        <div class="te-stepper">
            <div class="te-stepper__label">${label}</div>
            <div class="te-stepper__controls">
                <button type="button" class="te-stepper__btn"
                        data-action="stepExerciseField"
                        data-template-id="${escapeAttr(templateId)}"
                        data-index="${idx}" data-field="${field}" data-delta="-${delta}"
                        aria-label="Decrease ${field}">−</button>
                <input type="number" ${inputAttrs}
                       value="${value}"
                       data-action="updateExerciseField"
                       data-template-id="${escapeAttr(templateId)}"
                       data-index="${idx}" data-field="${field}">
                <button type="button" class="te-stepper__btn"
                        data-action="stepExerciseField"
                        data-template-id="${escapeAttr(templateId)}"
                        data-index="${idx}" data-field="${field}" data-delta="${delta}"
                        aria-label="Increase ${field}">+</button>
            </div>
        </div>
    `;

    const expandedBody = isExpanded ? `
        <div class="te-row__edit" data-stop-propagation>
            <div class="te-row__steppers">
                ${stepper('Sets', 'sets', sets, 'inputmode="numeric" min="1" max="20"', 1)}
                ${stepper('Reps', 'reps', reps, 'inputmode="numeric" min="1" max="100"', 1)}
                ${stepper('Weight', 'weight', weight, 'inputmode="decimal" step="0.5" min="0"', weightStep)}
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
        <div class="te-row ${isExpanded ? 'te-row--expanded' : ''} ${unmapped ? 'te-row--unmapped' : ''}"
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
                ${unmapped ? '<span class="te-row__unmapped" aria-label="Not mapped at this gym">Not mapped</span>' : ''}
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
 * Persist a single field change on a template exercise. `reRender` controls
 * whether we re-render the selector after save — for input-while-typing we
 * skip the re-render because it would steal focus, blow away the user's
 * cursor position, and feel awful. Blur/Enter still re-renders so any
 * derived UI (last-session hint, badges) stays in sync.
 */
async function updateExerciseField(templateId, index, field, value, reRender = true) {
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
    if (reRender) refreshEditorOrList();
}

// Pending inline edit — used by the input-event debounce path so we keep
// autosaving while the user types (instead of relying on a blur that may
// never fire if they tap a nav button on iOS). Always holds at most one
// entry; flushed on blur, on navigation, or when the debounce timer fires.
let _pendingTemplateEdit = null;
const PENDING_EDIT_DEBOUNCE_MS = 500;

function schedulePendingTemplateEdit(edit) {
    if (_pendingTemplateEdit?.timeoutId) {
        clearTimeout(_pendingTemplateEdit.timeoutId);
    }
    edit.timeoutId = setTimeout(() => runPendingTemplateEdit(), PENDING_EDIT_DEBOUNCE_MS);
    _pendingTemplateEdit = edit;
}

async function runPendingTemplateEdit() {
    const p = _pendingTemplateEdit;
    if (!p) return;
    if (p.timeoutId) clearTimeout(p.timeoutId);
    _pendingTemplateEdit = null;

    if (p.kind === 'field') {
        // Don't re-render while typing — preserves focus + caret on mobile.
        await updateExerciseField(p.templateId, p.index, p.field, p.value, false);
    } else if (p.kind === 'rename') {
        const template = loadedTemplates.find(t => t._id === p.templateId);
        if (!template) return;
        const newName = (p.value || '').trim();
        if (!newName || newName === template._name) return;
        template._name = newName;
        template.name = newName;
        await saveTemplateInline(template, normalizeExercisesToArray(template.exercises));
    }
}

/**
 * Flush any pending inline template edit immediately. Call before navigation
 * or any other context-switch so a user who typed a value then tapped away
 * doesn't lose it to the debounce.
 */
export async function flushPendingTemplateEdits() {
    if (!_pendingTemplateEdit) return;
    await runPendingTemplateEdit();
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
            refreshEditorOrList();

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
            refreshEditorOrList();
        },
    });
}

/**
 * Toggle inline template editor expansion.
 */
/**
 * Phase 9 — entry point for "open this template for editing". Used by:
 *   - createNewTemplate (after a new blank template is saved to Firestore)
 *   - editTemplate (the legacy "edit this template" entry)
 *   - saveWorkoutAsTemplate (after a workout is converted + saved)
 *   - ai-coach-ui's "open this template" deep-link
 *
 * Navigates to the workout-selector and pre-expands the template's row so
 * the user lands on the inline editor for that specific template.
 */
export function expandTemplateInSelector(templateId) {
    if (!templateId) return;
    // Phase 3b — "open this template for editing" now lands on the editor page.
    showWorkoutEditor(templateId);
}

export function toggleTemplateEdit(templateId) {
    // Kept as a compatibility alias — the list no longer expands in place, so
    // any lingering caller opens the editor page instead.
    showWorkoutEditor(templateId);
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
            // Phase 7 — archive flag round-trips so archived workouts stay out of
            // the main list / For Today / dashboard until restored.
            archived: !!template.archived,
        };

        // If editing a default template, mark it as an override so the
        // deduplication in getUserWorkoutTemplates replaces the default
        if (template._isDefault) {
            saveData.overridesDefault = template._id;
        }

        // Use the template's existing ID so it overwrites (not duplicates)
        saveData.id = template._id;

        await wm.saveWorkoutTemplate(saveData);

        // Optimistic in-place update of AppState.workoutPlans. A full refetch
        // here cost a Firestore round-trip per keystroke, which was the main
        // source of inline-edit delay; we already hold the authoritative data
        // locally so just patch it in.
        const plans = AppState.workoutPlans || [];
        const idx = plans.findIndex(p => (p.id || p.day) === template._id);
        const patched = {
            ...(idx >= 0 ? plans[idx] : {}),
            ...saveData,
            isCustom: true,
            isDefault: false,
            source: 'user-firebase',
            lastUpdated: new Date().toISOString(),
        };
        if (idx >= 0) plans[idx] = patched;
        else plans.push(patched);
        AppState.workoutPlans = [...plans];
    } catch (err) {
        console.error('Error saving template:', err);
        showNotification("Couldn't save changes", 'error');
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
    refreshEditorOrList();
}

/**
 * Remove an exercise from a template (inline editor).
 */
export async function removeTemplateExerciseInline(templateId, index) {
    const template = loadedTemplates.find(t => t._id === templateId);
    if (!template) return;

    const exercises = normalizeExercisesToArray(template.exercises);
    const name = getExerciseName(exercises[index]);
    const ok = await confirmSheet({
        title: `Remove "${name}" from this workout?`,
        confirmLabel: 'Remove exercise',
        cancelLabel: 'Keep exercise',
        destructive: true,
    });
    if (!ok) return;

    exercises.splice(index, 1);
    template.exercises = exercises;

    await saveTemplateInline(template, exercises);
    refreshEditorOrList();
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
            } else if (action === 'archiveTemplate') {
                archiveTemplate(templateId);
            } else if (action === 'unarchiveTemplate') {
                unarchiveTemplate(templateId);
            } else if (action === 'deleteTemplateInline') {
                window.deleteTemplate(templateId, isDefault);
            } else if (action === 'openEquipmentForExercise') {
                openEquipmentSheetForTemplate(templateId, index);
            } else if (action === 'setTemplateCategory') {
                const cat = actionEl.dataset.cat;
                const t = loadedTemplates.find(x => x._id === templateId);
                if (t) {
                    t.category = cat;
                    saveTemplateInline(t, normalizeExercisesToArray(t.exercises))
                        .then(() => refreshEditorOrList());
                }
            } else if (action === 'toggleTemplateDay') {
                const day = actionEl.dataset.day;
                const t = loadedTemplates.find(x => x._id === templateId);
                if (t) {
                    const cur = Array.isArray(t.suggestedDays) ? t.suggestedDays : [];
                    t.suggestedDays = cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day];
                    saveTemplateInline(t, normalizeExercisesToArray(t.exercises))
                        .then(() => refreshEditorOrList());
                }
            } else if (action === 'switchGymContext') {
                openGymContextSwitcher();
            } else if (action === 'dismissGymBanner') {
                const gym = actionEl.dataset.gym;
                const cur = AppState.settings?.dismissedGymBanners || [];
                if (gym && !cur.includes(gym) && typeof window.updateSetting === 'function') {
                    window.updateSetting('dismissedGymBanners', [...cur, gym]);
                }
                renderWorkoutSelectorUI();
            } else if (action === 'stepExerciseField') {
                const field = actionEl.dataset.field;
                const delta = parseFloat(actionEl.dataset.delta);
                const input = actionEl.parentElement?.querySelector('input');
                if (input && Number.isFinite(delta)) {
                    const cur = parseFloat(input.value) || 0;
                    let next = cur + delta;
                    const min = parseFloat(input.min);
                    const max = parseFloat(input.max);
                    if (Number.isFinite(min)) next = Math.max(min, next);
                    if (Number.isFinite(max)) next = Math.min(max, next);
                    input.value = next;
                    // Same debounced path as typing — rapid taps coalesce into
                    // one save, and no mid-tap re-render steals the row.
                    schedulePendingTemplateEdit({
                        kind: 'field',
                        templateId,
                        index,
                        field,
                        value: next,
                    });
                }
            } else if (action === 'toggleExerciseExpand') {
                // .te-row sits inside .template-editor's data-stop-propagation
                // zone, so this action lands here (not the unreachable check
                // below the if-block).
                const rowKey = actionEl.dataset.rowKey;
                expandedExerciseInTemplate = (expandedExerciseInTemplate === rowKey) ? null : rowKey;
                refreshEditorOrList();
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

        // Row tap = open the editor page (Phase 3b — read-first list)
        const row = e.target.closest('[data-action="openWorkoutEditor"]');
        if (row) {
            const templateId = row.dataset.templateId;
            if (templateId) showWorkoutEditor(templateId);
        }
    });

    // Input listener (fires on every keystroke / stepper change) — debounces
    // a save so the user doesn't have to blur the field for changes to stick.
    // This is the safety net for mobile, where tapping a nav button doesn't
    // reliably fire `change` on the focused input.
    container.addEventListener('input', (e) => {
        const renameInput = e.target.closest('input[data-action="renameTemplate"]');
        if (renameInput) {
            schedulePendingTemplateEdit({
                kind: 'rename',
                templateId: renameInput.dataset.templateId,
                value: renameInput.value,
            });
            return;
        }
        const fieldEl = e.target.closest('[data-action="updateExerciseField"]');
        if (fieldEl) {
            // Notes textarea grows with content (same pattern as the active
            // workout's awAutoGrowNotes — reached via window to avoid a new
            // cross-module import).
            if (fieldEl.tagName === 'TEXTAREA' && typeof window.awAutoGrowNotes === 'function') {
                window.awAutoGrowNotes(fieldEl);
            }
            schedulePendingTemplateEdit({
                kind: 'field',
                templateId: fieldEl.dataset.templateId,
                index: parseInt(fieldEl.dataset.index, 10),
                field: fieldEl.dataset.field,
                value: fieldEl.value,
            });
            return;
        }
    });

    // Change listener: explicit commit on blur / Enter. Flushes the debounce
    // so we don't double-write, then re-renders to refresh any derived UI.
    container.addEventListener('change', async (e) => {
        // 1) Rename template title
        const renameInput = e.target.closest('input[data-action="renameTemplate"]');
        if (renameInput) {
            const templateId = renameInput.dataset.templateId;
            const newName = renameInput.value.trim();
            const template = loadedTemplates.find(t => t._id === templateId);
            if (!template) return;

            // Cancel any pending debounce — we're committing now.
            if (_pendingTemplateEdit?.timeoutId) {
                clearTimeout(_pendingTemplateEdit.timeoutId);
                _pendingTemplateEdit = null;
            }

            if (!newName) {
                renameInput.value = template._name || '';
                return;
            }
            if (newName === template._name) return;

            template._name = newName;
            template.name = newName;
            await saveTemplateInline(template, normalizeExercisesToArray(template.exercises));
            refreshEditorOrList();
            return;
        }

        // 2) Sets / reps / weight / notes on an expanded exercise row
        const fieldEl = e.target.closest('[data-action="updateExerciseField"]');
        if (fieldEl) {
            if (_pendingTemplateEdit?.timeoutId) {
                clearTimeout(_pendingTemplateEdit.timeoutId);
                _pendingTemplateEdit = null;
            }
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
            filtered = loadedTemplates.filter(t => effectiveTemplateCategory(t) === activeSelectorCategory);
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



// ===================================================================
// TEMPLATE ACTIONS FROM SELECTION
// ===================================================================



export async function copyTemplateToCustom(templateId) {
    if (!AppState.currentUser) {
        showNotification('Sign in to copy workouts', 'warning');
        return;
    }

    try {
        const source = AppState.workoutPlans.find(
            (plan) => plan.day === templateId || plan.name === templateId || plan.id === templateId
        );
        if (!source) {
            console.error('Template not found');
            return;
        }

        const newName = `${source.day || source.name} (Custom)`;
        const customTemplate = {
            name: newName,
            category: getWorkoutCategory(source.day || source.name),
            exercises: JSON.parse(JSON.stringify(source.exercises || [])),
            isCustom: true,
            isDefault: false,
            createdFrom: templateId,
        };

        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const newId = await workoutManager.saveWorkoutTemplate(customTemplate);

        // Optimistic local add — no Firestore refetch. Keeps the click → "ready
        // to edit" latency tight; the refetch path was the main source of
        // post-duplicate delay.
        const newTemplate = {
            id: newId,
            ...customTemplate,
            lastUpdated: new Date().toISOString(),
            createdBy: AppState.currentUser.uid,
            source: 'user-firebase',
        };
        AppState.workoutPlans = [...(AppState.workoutPlans || []), newTemplate];

        // Open the editor on the new row so the user can immediately rename /
        // tweak the copy — otherwise it's invisible at the bottom of the list
        // with the same name as the source.
        expandTemplateInSelector(newId);
        showNotification(`Duplicated as "${newName}"`, 'success', 1500);
    } catch (error) {
        console.error('Error copying template:', error);
        showNotification("Couldn't copy workout", 'error');
    }
}

export async function deleteCustomTemplate(templateId) {
    if (!AppState.currentUser) {
        showNotification('Sign in to delete workouts', 'warning');
        return;
    }

    const ok = await confirmSheet({
        title: 'Delete this workout?',
        message: "This can't be undone.",
        confirmLabel: 'Delete workout',
        cancelLabel: 'Keep workout',
        destructive: true,
    });
    if (!ok) {
        return;
    }

    // Optimistic remove — pull the row out of the list immediately, then
    // hit Firestore. If the write fails, roll back so the user sees the row
    // come back instead of a phantom-deleted entry.
    const plans = AppState.workoutPlans || [];
    const idx = plans.findIndex(p => (p.id || p.day) === templateId);
    const removed = idx >= 0 ? plans[idx] : null;
    if (idx >= 0) {
        plans.splice(idx, 1);
        AppState.workoutPlans = [...plans];
        // If the editor page was open on this template, it's gone now — return
        // to the list. Otherwise just re-render the list in place.
        if (activeEditorTemplateId === templateId) {
            activeEditorTemplateId = null;
            if (typeof window.navigateTo === 'function') window.navigateTo('workout-selector');
            else renderWorkoutSelectorUI();
        } else {
            renderWorkoutSelectorUI();
        }
    }

    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const workoutManager = new FirebaseWorkoutManager(AppState);
        await workoutManager.deleteWorkoutTemplate(templateId);
        showNotification('Workout deleted', 'success', 1500);
    } catch (error) {
        console.error('Error deleting template:', error);
        if (removed && idx >= 0) {
            AppState.workoutPlans = [...AppState.workoutPlans.slice(0, idx), removed, ...AppState.workoutPlans.slice(idx)];
            renderWorkoutSelectorUI();
        }
        showNotification("Couldn't delete workout", 'error');
    }
}

// ===================================================================
// TEMPLATE RENDERING FOR SELECTION
// ===================================================================



// ===================================================================
// TEMPLATE FILTERING AND SEARCH
// ===================================================================



// ===================================================================
// WORKOUT PREVIEW FUNCTIONALITY
// ===================================================================









// ===================================================================
// ENHANCED TEMPLATE MANAGEMENT FUNCTIONS
// ===================================================================








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



// ===================================================================
// STATE GETTERS (for coordination with main.js)
// ===================================================================





// ===================================================================
// WINDOW FUNCTION ASSIGNMENTS (for HTML onclick handlers)
// ===================================================================




// These handlers render in this module's own template strings — assign window
// here rather than main.js so the handler ships in the same file as its
// template. Prod caches JS for a year, and a same-file assignment can't be
// version-skewed away from the markup that calls it.
// Phase 3b — editor page back button renders in this module's template string.
window.closeWorkoutEditor = closeWorkoutEditor;
// Deep-link entry (AI coach "open this workout", etc.) may reach us via window.
window.showWorkoutEditor = showWorkoutEditor;
// Phase 7 — Quick start (freestyle) handlers render in this module's strings.
window.openQuickStartSheet = openQuickStartSheet;
window.qsSetFocus = qsSetFocus;
window.closeQuickStartSheet = closeQuickStartSheet;
window.qsStart = qsStart;
window.qsStartFromLast = qsStartFromLast;
// Phase 7 — archive: group toggle + restore render in this module's strings.
window.toggleArchivedGroup = toggleArchivedGroup;
window.unarchiveTemplate = unarchiveTemplate;
window.archiveTemplate = archiveTemplate;

// Same-file wiring (see CLAUDE.md): openQuickStartSheet is referenced by this
// module's own template strings AND the dashboard hero — a same-file window
// assignment can't be version-skewed away from its markup by prod caching.
window.openQuickStartSheet = openQuickStartSheet;

// Pull-to-refresh (owner's gym bug log): the workout list is where coach-made
// changes land — a pull re-fetches templates instead of needing a hard refresh.
import('../utils/pull-to-refresh.js').then(({ registerPullToRefresh }) => {
    registerPullToRefresh(
        () => {
            const section = document.getElementById('workout-selector');
            return !!section && !section.classList.contains('hidden');
        },
        async () => {
            clearSelectorCache();
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            AppState.workoutPlans = await new FirebaseWorkoutManager(AppState).getUserWorkoutTemplates();
            await renderWorkoutSelectorUI();
        }
    );
}).catch(() => { /* non-critical enhancement */ });
