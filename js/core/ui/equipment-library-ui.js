// Equipment Library UI Module - core/ui/equipment-library-ui.js
// Gym-centric equipment management page

import { AppState } from '../utils/app-state.js';
import { showNotification, escapeHtml, escapeAttr, openModal, closeModal } from './ui-helpers.js';
import { db, doc, updateDoc, arrayUnion, arrayRemove, deleteField, getDoc } from '../data/firebase-config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { EQUIPMENT_CATALOG } from '../data/equipment-catalog.js';

let workoutManager = null;
let allEquipment = [];
let currentLocationFilter = null;
let currentSearchTerm = '';
let currentDetailId = null;

// Phase 2: list can be grouped "By Brand" (default after migration) or "By Body Part"
// (the legacy view). expandedBrands tracks per-brand collapse state so toggling
// filters doesn't re-collapse everything.
let currentView = 'brand'; // 'brand' | 'bodypart'
const expandedBrands = new Set();

// Phase 6: scan-history state. unlinkedEquipment is populated lazily on the
// first library open (background scan); the review view rebuilds from it.
// dismissedUnlinked is per-session — names the user said "ignore" to. The
// banner hides automatically when (unlinked - dismissed) is empty.
let unlinkedEquipment = null;       // Map<name, {exercises, locations, count}> | null
const dismissedUnlinked = new Set(); // names dismissed this session
let scanReviewActive = false;       // when true, library shows the review list instead of the normal grid

function getManager() {
    if (!workoutManager) workoutManager = new FirebaseWorkoutManager(AppState);
    return workoutManager;
}

// Equipment-type icons. The `color` field here is documentary — actual colors
// come from the .equip-row__icon--{type} modifier classes in equipment-library.css
// which read --equip-{type} tokens. Keep "Machine" for legacy data; v3 migration
// reclassifies most to Plate-Loaded / Selectorized via catalog match.
const EQUIPMENT_TYPE_ICONS = {
    'Plate-Loaded': { icon: 'fa-cog',           color: 'var(--equip-plate-loaded)' },
    Selectorized:   { icon: 'fa-th-list',       color: 'var(--equip-selectorized)' },
    Machine:        { icon: 'fa-cog',           color: 'var(--equip-machine)' },
    Cable:          { icon: 'fa-link',          color: 'var(--equip-cable)' },
    Barbell:        { icon: 'fa-dumbbell',      color: 'var(--equip-barbell)' },
    Dumbbell:       { icon: 'fa-dumbbell',      color: 'var(--equip-dumbbell)' },
    Bench:          { icon: 'fa-couch',         color: 'var(--equip-bench)' },
    Rack:           { icon: 'fa-border-all',    color: 'var(--equip-rack)' },
    Cardio:         { icon: 'fa-heartbeat',     color: 'var(--equip-cardio)' },
    Bodyweight:     { icon: 'fa-child',         color: 'var(--equip-bodyweight)' },
    Other:          { icon: 'fa-wrench',        color: 'var(--equip-other)' },
};

// Body part classification + display config
const BODY_PART_CONFIG = {
    'Chest':     { icon: 'fas fa-compress-arrows-alt', color: 'var(--cat-push)' },
    'Back':      { icon: 'fas fa-arrows-alt-v',        color: 'var(--cat-pull)' },
    'Shoulders': { icon: 'fas fa-arrow-up',             color: 'var(--cat-push)' },
    'Arms':      { icon: 'fas fa-hand-rock',            color: 'var(--cat-pull)' },
    'Legs':      { icon: 'fas fa-shoe-prints',          color: 'var(--cat-legs)' },
    'Core':      { icon: 'fas fa-bullseye',             color: 'var(--cat-core)' },
    'Cardio':    { icon: 'fas fa-heartbeat',            color: 'var(--danger)' },
    'Multi-Use': { icon: 'fas fa-th',                   color: 'var(--text-secondary)' },
};

const BODY_PART_ORDER = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio', 'Multi-Use'];

/**
 * Classify an exercise name into a body part group.
 */
function classifyExerciseBodyPart(exerciseName) {
    const name = exerciseName.toLowerCase();
    if (/chest press|bench press|pec deck|pec fly|fly.*chest|incline press|decline press|push.?up|dips.*press|chest/.test(name)) return 'Chest';
    if (/row|lat pull|pull.?down|pull.?up|chin.?up|deadlift|back ext|reverse fly|shrug|face pull/.test(name)) return 'Back';
    if (/shoulder press|overhead press|military press|lateral raise|front raise|rear delt|arnold|upright row/.test(name)) return 'Shoulders';
    if (/curl|tricep|bicep|pushdown|skull crush|hammer curl|preacher|dip(?!.*press)|kickback|extension.*arm/.test(name)) return 'Arms';
    if (/squat|leg press|leg curl|leg ext|lunge|calf|glute|hip|hamstring|quad|romanian|hack squat|step.?up/.test(name)) return 'Legs';
    if (/ab|crunch|plank|sit.?up|core|oblique|wood.?chop|cable twist|russian twist|hanging leg/.test(name)) return 'Core';
    if (/treadmill|bike|elliptical|rower|run|sprint|stair|jump rope|cardio/.test(name)) return 'Cardio';
    return 'Multi-Use';
}

/**
 * Build Brand → Line → Equipment[] hierarchy for the "By Brand" view.
 *
 * Brands are sorted alphabetically. "Unknown" (or missing brand) is pushed to
 * the bottom so users see identified brands first. Lines within a brand are
 * alphabetical; equipment within a line is sorted by function (falling back
 * to name) so the same physical machine appears in the same place regardless
 * of how it was originally named.
 *
 * Returns Map<brandName, Map<lineName, equipment[]>>.
 */
function buildBrandHierarchy(equipment) {
    const brands = new Map();

    for (const eq of equipment) {
        const brand = eq.brand && eq.brand !== 'Unknown' ? eq.brand : 'Unknown';
        if (!brands.has(brand)) brands.set(brand, new Map());
        const lines = brands.get(brand);

        const line = eq.line || '(No line)';
        if (!lines.has(line)) lines.set(line, []);
        lines.get(line).push(eq);
    }

    // Sort: identified brands alphabetically, then "Unknown" at the bottom.
    const sorted = new Map(
        [...brands.entries()].sort((a, b) => {
            if (a[0] === 'Unknown') return 1;
            if (b[0] === 'Unknown') return -1;
            return a[0].localeCompare(b[0]);
        })
    );

    for (const [brand, lines] of sorted) {
        const sortedLines = new Map([...lines.entries()].sort((a, b) => a[0].localeCompare(b[0])));
        for (const equips of sortedLines.values()) {
            equips.sort((a, b) =>
                (a.function || a.name || '').localeCompare(b.function || b.name || '')
            );
        }
        sorted.set(brand, sortedLines);
    }

    return sorted;
}

/**
 * Build Body Part → Exercise → Equipment[] hierarchy.
 * Inverts the equipment.exerciseTypes array to group by exercise first.
 */
function buildEquipmentHierarchy(equipment) {
    const exerciseToEquipment = {};
    for (const equip of equipment) {
        const exercises = equip.exerciseTypes || [];
        for (const exName of exercises) {
            if (!exerciseToEquipment[exName]) exerciseToEquipment[exName] = [];
            exerciseToEquipment[exName].push(equip);
        }
    }

    const hierarchy = {};
    for (const [exName, equips] of Object.entries(exerciseToEquipment)) {
        const bodyPart = classifyExerciseBodyPart(exName);
        if (!hierarchy[bodyPart]) hierarchy[bodyPart] = {};
        hierarchy[bodyPart][exName] = equips;
    }
    return hierarchy;
}

// ===================================================================
// EQUIPMENT LIST PAGE
// ===================================================================

export async function openEquipmentLibrary() {
    const section = document.getElementById('equipment-library-section');
    if (!section) return;

    section.classList.remove('hidden');
    scanReviewActive = false; // always land on the normal list, not the review view
    allEquipment = await getManager().getUserEquipment();
    // Cache for cross-module access (plate calculator, weight calculations)
    AppState._cachedEquipment = allEquipment;
    renderEquipmentLibrary();

    // Background scan for workout-history equipment names that don't appear in
    // the library. Non-blocking — banner appears on the next render once the
    // scan completes.
    scanForUnlinkedEquipment().then(() => {
        if (!scanReviewActive) renderEquipmentLibrary();
    }).catch((err) => {
        console.error('❌ Equipment scan failed:', err);
    });
}

/**
 * Phase 6 — scan workout history for equipment name strings that don't match
 * any record in the user's equipment library. Stores results in module-scoped
 * `unlinkedEquipment` for the banner + review view to render.
 *
 * Names are compared after normalization (lowercase, collapsed whitespace) so
 * trivial casing differences don't trigger false positives.
 */
async function scanForUnlinkedEquipment() {
    const norm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

    const knownNorm = new Set((allEquipment || []).map((e) => norm(e.name)));
    const workouts = await getManager().getUserWorkouts();
    const found = new Map();

    for (const w of workouts) {
        const exercises = w.exercises || {};
        for (const key of Object.keys(exercises)) {
            const ex = exercises[key];
            const equipName = ex?.equipment;
            if (!equipName) continue;
            if (knownNorm.has(norm(equipName))) continue;

            if (!found.has(equipName)) {
                found.set(equipName, {
                    exercises: new Set(),
                    locations: new Set(),
                    count: 0,
                });
            }
            const entry = found.get(equipName);
            if (ex.name) entry.exercises.add(ex.name);
            if (w.location) entry.locations.add(w.location);
            entry.count++;
        }
    }

    unlinkedEquipment = found;
}

function getUnlinkedActive() {
    if (!unlinkedEquipment) return [];
    return [...unlinkedEquipment.entries()]
        .filter(([name]) => !dismissedUnlinked.has(name))
        .map(([name, meta]) => ({ name, ...meta }));
}

/** Switch the library content area to the scan review list. */
export function reviewDiscoveredEquipment() {
    scanReviewActive = true;
    renderEquipmentLibrary();
}

/** Render the review list — one row per unlinked name with Add / Dismiss. */
function renderScanReview() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Rewrite the page header for the review view (back goes to the list).
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="exitScanReview()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">Review history</div>
            </div>
        `;
    }

    const items = getUnlinkedActive();
    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state-compact">
                <i class="fas fa-check-circle"></i>
                <p>All caught up</p>
                <p class="empty-state-hint">Every machine in your workout history is in the library.</p>
            </div>
        `;
        return;
    }

    const rowsHTML = items.map((item) => {
        const exerciseList = [...item.exercises].slice(0, 3).join(', ');
        const exerciseSuffix = item.exercises.size > 3 ? `, +${item.exercises.size - 3}` : '';
        const locationStr = [...item.locations].join(', ');
        const metaParts = [
            `${item.count} session${item.count !== 1 ? 's' : ''}`,
            exerciseList ? `${exerciseList}${exerciseSuffix}` : null,
            locationStr,
        ].filter(Boolean).join(' · ');

        return `
            <div class="scan-review-row">
                <div class="scan-review-row__info">
                    <div class="scan-review-row__name">${escapeHtml(item.name)}</div>
                    <div class="scan-review-row__meta">${escapeHtml(metaParts)}</div>
                </div>
                <div class="scan-review-row__actions">
                    <button class="btn btn-primary btn-small" onclick="addUnlinkedEquipment('${escapeAttr(item.name)}')">
                        <i class="fas fa-plus"></i> Add
                    </button>
                    <button class="btn btn-text btn-small" onclick="dismissUnlinkedEquipment('${escapeAttr(item.name)}')">
                        Dismiss
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="scan-review">
            <div class="scan-review__hint">
                These equipment names appear in your workout history but aren't in your library.
                Add them to merge their history with a real machine, or dismiss to ignore.
            </div>
            <div class="scan-review__list">${rowsHTML}</div>
        </div>
    `;
}

/** Exit the review view and return to the normal library list. */
export function exitScanReview() {
    scanReviewActive = false;
    // Restore the standard page header
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="navigateBack()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">Equipment</div>
            </div>
            <button class="page-header__save" onclick="showAddEquipmentFlow()">
                <i class="fas fa-plus"></i> Add
            </button>
        `;
    }
    renderEquipmentLibrary();
}

/** Create an equipment doc for a discovered name, then refresh + remove from list. */
export async function addUnlinkedEquipment(name) {
    try {
        const result = await getManager().getOrCreateEquipment(name);
        if (result) {
            // Re-read library so the new doc shows up everywhere
            allEquipment = await getManager().getUserEquipment();
            AppState._cachedEquipment = allEquipment;
            // Drop from the unlinked map (now linked) — also rescan in case more changed
            if (unlinkedEquipment) unlinkedEquipment.delete(name);
            showNotification(`${name} added to library`, 'success', 1500);
            renderEquipmentLibrary();
        }
    } catch (err) {
        console.error('❌ Failed to add unlinked equipment:', err);
        showNotification("Couldn't add equipment", 'error');
    }
}

/** Hide the row for this session. Doesn't persist (next session re-prompts). */
export function dismissUnlinkedEquipment(name) {
    dismissedUnlinked.add(name);
    if (getUnlinkedActive().length === 0) {
        // Auto-exit review when nothing remains
        exitScanReview();
    } else {
        renderEquipmentLibrary();
    }
}

function renderEquipmentLibrary() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Phase 6: when the user is in the review view, render that instead of the list.
    if (scanReviewActive) {
        renderScanReview();
        return;
    }

    // Collect all locations for filter pills
    const locationSet = new Set();
    allEquipment.forEach(eq => {
        (eq.locations || []).forEach(l => locationSet.add(l));
        if (eq.location) locationSet.add(eq.location);
    });
    const locations = Array.from(locationSet).sort();

    // Apply search filter
    let filtered = allEquipment;
    if (currentSearchTerm) {
        const term = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(eq =>
            eq.name?.toLowerCase().includes(term) ||
            eq.brand?.toLowerCase().includes(term) ||
            eq.line?.toLowerCase().includes(term) ||
            eq.function?.toLowerCase().includes(term) ||
            eq.equipmentType?.toLowerCase().includes(term) ||
            (eq.exerciseTypes || []).some(t => t.toLowerCase().includes(term))
        );
    }

    // Apply location filter
    if (currentLocationFilter) {
        filtered = filtered.filter(eq =>
            (eq.locations || []).includes(currentLocationFilter) ||
            eq.location === currentLocationFilter
        );
    }

    // Phase 6 banner — only shown when the scan found names that aren't dismissed.
    const unlinked = getUnlinkedActive();
    const scanBannerHTML = unlinked.length > 0 ? `
        <div class="scan-banner">
            <div class="scan-banner__icon"><i class="fas fa-history"></i></div>
            <div class="scan-banner__text">
                <div class="scan-banner__title">${unlinked.length} machine${unlinked.length !== 1 ? 's' : ''} found in history</div>
                <div class="scan-banner__sub">Not yet in your library</div>
            </div>
            <button class="scan-banner__btn" onclick="reviewDiscoveredEquipment()">Review</button>
        </div>
    ` : '';

    // View toggle (Phase 2) — always present so users can switch while empty
    const viewToggleHTML = `
        <div class="equip-view-toggle" role="tablist" aria-label="Library view">
            <button class="equip-view-toggle__btn ${currentView === 'brand' ? 'is-active' : ''}"
                    role="tab" aria-selected="${currentView === 'brand'}"
                    onclick="setEquipmentView('brand')">By Brand</button>
            <button class="equip-view-toggle__btn ${currentView === 'bodypart' ? 'is-active' : ''}"
                    role="tab" aria-selected="${currentView === 'bodypart'}"
                    onclick="setEquipmentView('bodypart')">By Body Part</button>
        </div>
    `;

    // Location filter pills + search toggle
    const filterHTML = locations.length > 0 ? `
        <div class="equip-filter-row">
            <button class="btn-icon-sm" onclick="toggleEquipmentSearch()" aria-label="Search">
                <i class="fas fa-search"></i>
            </button>
            <div class="equip-location-pills">
                <button class="filter-pill ${!currentLocationFilter ? 'active' : ''}"
                        onclick="filterEquipmentByLocation(null)">All Gyms</button>
                ${locations.map(loc => `
                    <button class="filter-pill ${currentLocationFilter === loc ? 'active' : ''}"
                            onclick="filterEquipmentByLocation('${escapeAttr(loc)}')">${escapeHtml(loc)}</button>
                `).join('')}
            </div>
        </div>
    ` : '';

    // Search bar (hidden by default).
    // onfocus: scroll input to top of viewport after a beat so the keyboard
    // doesn't sit on top of the results list.
    const searchHTML = `
        <div class="equip-search-bar ${currentSearchTerm ? '' : 'hidden'}" id="equip-search-bar">
            <div class="equip-lib-search">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Search equipment, brand, line, exercises…"
                       value="${escapeAttr(currentSearchTerm)}"
                       oninput="filterEquipmentBySearch(this.value)"
                       onfocus="setTimeout(() => this.scrollIntoView({ block: 'start' }), 200)">
            </div>
        </div>
    `;

    let listHTML;
    if (filtered.length === 0) {
        listHTML = `
            <div class="empty-state-compact">
                <i class="fas fa-wrench"></i>
                <p>${currentSearchTerm ? 'No matches found' : 'No equipment found'}</p>
                <p class="empty-state-hint">Equipment is auto-saved when you use it in a workout</p>
            </div>
        `;
    } else if (currentView === 'brand') {
        listHTML = renderBrandView(filtered);
    } else {
        listHTML = renderBodyPartView(filtered);
    }

    container.innerHTML =
        scanBannerHTML +
        viewToggleHTML +
        filterHTML +
        searchHTML +
        // Wrap the results list in its own container so filterEquipmentBySearch
        // can update only this slot without re-rendering the search input.
        // Re-rendering the input on every keystroke was destroying focus and
        // causing the iOS keyboard to dismiss between characters.
        `<div class="equip-lib-list" id="equip-lib-list-wrap">${listHTML}</div>`;
}

/**
 * Re-render JUST the results list (not the search bar) using the current
 * filters. Used by search/location filtering to avoid blowing away the
 * focused input.
 */
function renderEquipmentLibraryList() {
    const wrap = document.getElementById('equip-lib-list-wrap');
    if (!wrap) {
        // Fallback to full render if the slot doesn't exist yet
        renderEquipmentLibrary();
        return;
    }

    let filtered = allEquipment;
    if (currentSearchTerm) {
        const term = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(eq =>
            eq.name?.toLowerCase().includes(term) ||
            eq.brand?.toLowerCase().includes(term) ||
            eq.line?.toLowerCase().includes(term) ||
            eq.function?.toLowerCase().includes(term) ||
            eq.equipmentType?.toLowerCase().includes(term) ||
            (eq.exerciseTypes || []).some(t => t.toLowerCase().includes(term))
        );
    }
    if (currentLocationFilter) {
        filtered = filtered.filter(eq =>
            (eq.locations || []).includes(currentLocationFilter) ||
            eq.location === currentLocationFilter
        );
    }

    let html;
    if (filtered.length === 0) {
        html = `
            <div class="empty-state-compact">
                <i class="fas fa-wrench"></i>
                <p>${currentSearchTerm ? 'No matches found' : 'No equipment found'}</p>
                <p class="empty-state-hint">Equipment is auto-saved when you use it in a workout</p>
            </div>
        `;
    } else if (currentView === 'brand') {
        html = renderBrandView(filtered);
    } else {
        html = renderBodyPartView(filtered);
    }

    wrap.innerHTML = html;
}

/**
 * Render the "By Brand" view: Brand → Line → Machine.
 *
 * - Brand header is collapsible. First render expands every brand so the user
 *   sees everything at once; `expandedBrands` tracks manual state across renders.
 * - Line sub-header is hidden when the brand has only one line AND that line is
 *   "(No line)" — avoids a noisy "Other" row for simple brands.
 * - Equipment row shows: colored type icon, function name (or name fallback),
 *   type badge pill + base weight + location list.
 */
function renderBrandView(filtered) {
    const hierarchy = buildBrandHierarchy(filtered);
    let html = '';

    for (const [brand, lines] of hierarchy) {
        const totalMachines = [...lines.values()].reduce((sum, arr) => sum + arr.length, 0);
        const brandId = brand.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'unknown';
        // Default: expanded. `expandedBrands` tracks explicit collapse — presence = collapsed.
        const isCollapsed = expandedBrands.has(brandId);

        html += `
            <div class="brand-header" onclick="toggleBrandSection('${escapeAttr(brandId)}')">
                <div class="brand-header__name">
                    ${escapeHtml(brand)}
                    <span class="brand-header__count">${totalMachines} machine${totalMachines !== 1 ? 's' : ''}</span>
                </div>
                <i class="fas fa-chevron-down brand-header__chevron ${isCollapsed ? 'is-collapsed' : ''}" id="brand-chevron-${escapeAttr(brandId)}"></i>
            </div>
            <div class="brand-section ${isCollapsed ? 'hidden' : ''}" id="brand-section-${escapeAttr(brandId)}">
        `;

        const multipleLines = lines.size > 1;

        for (const [line, equips] of lines) {
            // Skip the line sub-header when the brand has exactly one "(No line)" group.
            const showLineHeader = multipleLines || line !== '(No line)';
            if (showLineHeader) {
                const lineDisplay = line === '(No line)' ? 'Other' : line;
                html += `
                    <div class="line-header">
                        <div class="line-header__name">
                            <i class="fas fa-layer-group"></i>
                            ${escapeHtml(lineDisplay)}
                        </div>
                        <div class="line-header__count">${equips.length} machine${equips.length !== 1 ? 's' : ''}</div>
                    </div>
                `;
            }

            for (const equip of equips) {
                const typeInfo = EQUIPMENT_TYPE_ICONS[equip.equipmentType] || EQUIPMENT_TYPE_ICONS.Other;
                const typeColorClass = `equip-row__icon--${(equip.equipmentType || 'Other').toLowerCase()}`;
                const locationStr = (equip.locations || []).join(', ');
                const baseStr = equip.baseWeight
                    ? `${equip.baseWeight} ${equip.baseWeightUnit || 'lbs'} base`
                    : '';
                const metaParts = [baseStr, locationStr].filter(Boolean).join(' · ');
                const displayName = equip.function || equip.name || '—';

                html += `
                    <div class="equip-row" onclick="openEquipmentDetail('${escapeAttr(equip.id)}')">
                        <div class="equip-row__icon ${typeColorClass}">
                            <i class="fas ${typeInfo.icon}"></i>
                        </div>
                        <div class="equip-row__info">
                            <div class="equip-row__name">${escapeHtml(displayName)}</div>
                            <div class="equip-row__meta">
                                <span class="equip-row__type-pill ${typeColorClass}">${escapeHtml(equip.equipmentType || 'Other')}</span>
                                ${metaParts ? `<span class="equip-row__meta-text">${escapeHtml(metaParts)}</span>` : ''}
                            </div>
                        </div>
                        <i class="fas fa-chevron-right equip-row__chevron"></i>
                    </div>
                `;
            }
        }

        html += `</div>`; // close brand-section
    }

    return html;
}

/**
 * Render the legacy "By Body Part" view — groups by exercise body part, then
 * by exercise name, then lists equipment. Preserved as-is so users who prefer
 * this grouping can still reach it via the view toggle.
 */
function renderBodyPartView(filtered) {
    const hierarchy = buildEquipmentHierarchy(filtered);
    let html = '';
    let hasAnyExercise = false;

    for (const bodyPart of BODY_PART_ORDER) {
        const exercises = hierarchy[bodyPart];
        if (!exercises) continue;
        hasAnyExercise = true;

        const exerciseNames = Object.keys(exercises).sort();
        const totalEquipment = exerciseNames.reduce((sum, ex) => sum + exercises[ex].length, 0);
        const config = BODY_PART_CONFIG[bodyPart];

        html += `
            <div class="equip-group-header">
                <div class="equip-group-header__left">
                    <i class="${config.icon}"></i>
                    <span>${bodyPart}</span>
                </div>
                <span class="equip-group-header__count">${exerciseNames.length} exercise${exerciseNames.length !== 1 ? 's' : ''} · ${totalEquipment} machine${totalEquipment !== 1 ? 's' : ''}</span>
            </div>
        `;

        for (const exName of exerciseNames) {
            const equips = exercises[exName];
            const equipId = exName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

            html += `
                <div class="equip-exercise-row" onclick="toggleEquipmentExercise('${equipId}')">
                    <div class="equip-exercise-row__name">${escapeHtml(exName)}</div>
                    <div class="equip-exercise-row__meta">
                        <span class="equip-exercise-row__count">${equips.length}</span>
                        <i class="fas fa-chevron-down equip-exercise-chevron" id="chevron-${equipId}"></i>
                    </div>
                </div>
                <div class="equip-nested-list hidden" id="equip-list-${equipId}">
            `;

            for (const equip of equips) {
                const locationNames = (equip.locations || []).join(', ') || '';
                const subtitleParts = [equip.brand, equip.line, locationNames].filter(Boolean);
                const subtitle = subtitleParts.join(' · ');

                html += `
                    <div class="row-card equip-nested-item" onclick="event.stopPropagation(); openEquipmentDetail('${escapeAttr(equip.id)}')">
                        <div class="equip-nested-item__info">
                            <span class="row-card__title">${escapeHtml(equip.name)}</span>
                            ${subtitle ? `<span class="row-card__subtitle">${escapeHtml(subtitle)}</span>` : ''}
                        </div>
                        <div class="row-card__action"><i class="fas fa-chevron-right"></i></div>
                    </div>
                `;
            }

            html += `</div>`; // close equip-nested-list
        }
    }

    // Equipment with no exercise associations
    const unlinked = filtered.filter(eq => !eq.exerciseTypes || eq.exerciseTypes.length === 0);
    if (unlinked.length > 0) {
        html += `
            <div class="equip-group-header">
                <div class="equip-group-header__left">
                    <i class="fas fa-unlink"></i>
                    <span>Unlinked</span>
                </div>
                <span class="equip-group-header__count">${unlinked.length} machine${unlinked.length !== 1 ? 's' : ''}</span>
            </div>
        `;
        for (const equip of unlinked) {
            const locationNames = (equip.locations || []).join(', ') || '';
            const subtitleParts = [equip.brand, equip.line, locationNames].filter(Boolean);
            const subtitle = subtitleParts.join(' · ');

            html += `
                <div class="row-card equip-nested-item" onclick="openEquipmentDetail('${escapeAttr(equip.id)}')">
                    <div class="equip-nested-item__info">
                        <span class="row-card__title">${escapeHtml(equip.name)}</span>
                        ${subtitle ? `<span class="row-card__subtitle">${escapeHtml(subtitle)}</span>` : ''}
                    </div>
                    <div class="row-card__action"><i class="fas fa-chevron-right"></i></div>
                </div>
            `;
        }
    }

    if (!hasAnyExercise && unlinked.length === 0) {
        html = `
            <div class="empty-state-compact">
                <i class="fas fa-wrench"></i>
                <p>No equipment found</p>
                <p class="empty-state-hint">Equipment is auto-saved when you use it in a workout</p>
            </div>
        `;
    }

    return html;
}

/**
 * View toggle callback (wired via window.setEquipmentView).
 */
export function setEquipmentView(view) {
    if (view !== 'brand' && view !== 'bodypart') return;
    if (view === currentView) return;
    currentView = view;
    renderEquipmentLibrary();
}

/**
 * Expand/collapse a brand section in the Brand view. Collapse state is stored
 * in the `expandedBrands` Set — presence means collapsed (default is expanded).
 */
export function toggleBrandSection(brandId) {
    const section = document.getElementById(`brand-section-${brandId}`);
    const chevron = document.getElementById(`brand-chevron-${brandId}`);
    if (!section || !chevron) return;

    if (expandedBrands.has(brandId)) {
        expandedBrands.delete(brandId);
        section.classList.remove('hidden');
        chevron.classList.remove('is-collapsed');
    } else {
        expandedBrands.add(brandId);
        section.classList.add('hidden');
        chevron.classList.add('is-collapsed');
    }
}

/**
 * Toggle search bar visibility
 */
export function toggleEquipmentSearch() {
    const bar = document.getElementById('equip-search-bar');
    if (bar) {
        bar.classList.toggle('hidden');
        if (!bar.classList.contains('hidden')) {
            bar.querySelector('input')?.focus();
        }
    }
}

/**
 * Toggle exercise expand/collapse in the hierarchy
 */
export function toggleEquipmentExercise(equipId) {
    const list = document.getElementById(`equip-list-${equipId}`);
    const chevron = document.getElementById(`chevron-${equipId}`);
    if (!list) return;

    const willOpen = list.classList.contains('hidden');
    list.classList.toggle('hidden');
    if (chevron) chevron.classList.toggle('equip-exercise-chevron--open', willOpen);
}

export function filterEquipmentByLocation(location) {
    currentLocationFilter = location;
    // Re-render only the results list — the location pills row is static
    // and doesn't need to be rebuilt for a filter change.
    renderEquipmentLibraryList();
    // Update the active state on the pill row in place.
    document.querySelectorAll('.equip-location-pills .filter-pill').forEach(btn => {
        btn.classList.remove('active');
    });
    const target = location
        ? document.querySelector(`.equip-location-pills [onclick*="'${location.replace(/'/g, "\\'")}"]`)
        : document.querySelector('.equip-location-pills .filter-pill:first-child');
    if (target) target.classList.add('active');
}

export function filterEquipmentBySearch(term) {
    currentSearchTerm = term;
    // CRITICAL: only re-render the results list, NOT the search input.
    // Previously this called renderEquipmentLibrary() which rebuilt the
    // entire DOM including the input, blowing away focus on every keystroke.
    // On iOS that closed the keyboard between characters, making the search
    // unusable.
    renderEquipmentLibraryList();
}

// ===================================================================
// EQUIPMENT DETAIL VIEW
// ===================================================================

export async function openEquipmentDetail(equipmentId) {
    currentDetailId = equipmentId;

    // Find equipment from cache or reload
    let equipment = allEquipment.find(e => e.id === equipmentId);
    if (!equipment) {
        allEquipment = await getManager().getUserEquipment();
        equipment = allEquipment.find(e => e.id === equipmentId);
    }
    if (!equipment) {
        showNotification('Equipment not found', 'error');
        return;
    }

    const typeInfo = EQUIPMENT_TYPE_ICONS[equipment.equipmentType] || EQUIPMENT_TYPE_ICONS.Other;
    const exercises = (equipment.exerciseTypes || []).map(name => ({
        name,
        videoUrl: equipment.exerciseVideos?.[name] || null,
    }));
    const locations = equipment.locations || (equipment.location ? [equipment.location] : []);
    const notes = equipment.notes || '';

    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Update the static header for detail view (page-header BEM structure).
    // Selector was previously .equip-lib-header which never matched any real
    // element — fixed to target the canonical .page-header in index.html.
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="backToEquipmentList()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">${escapeHtml(equipment.name)}</div>
            </div>
            <button class="page-header__save" onclick="backToEquipmentList()">Done</button>
        `;
    }

    const currentType = equipment.equipmentType || 'Other';
    const heroFunction = equipment.function || equipment.name || '—';
    const heroSubtitleParts = [equipment.brand, equipment.line].filter(Boolean);
    const heroSubtitle = heroSubtitleParts.join(' · ');
    const heroTypeClass = `equip-row__icon--${currentType.toLowerCase()}`;

    container.innerHTML = `
        <div class="equipment-detail">
            <div class="equip-detail-body">
                <!-- Hero — icon + function + Brand · Line subtitle + type badge -->
                <div class="equip-detail-hero">
                    <div class="equip-detail-hero__icon ${heroTypeClass}">
                        <i class="fas ${typeInfo.icon}"></i>
                    </div>
                    <div class="equip-detail-hero__info">
                        <div class="equip-detail-hero__name">${escapeHtml(heroFunction)}</div>
                        ${heroSubtitle ? `<div class="equip-detail-hero__subtitle">${escapeHtml(heroSubtitle)}</div>` : ''}
                    </div>
                    <span class="equip-detail-hero__type-pill ${heroTypeClass}">${escapeHtml(currentType)}</span>
                </div>

                <!-- Name (override — normally derived from Brand / Line / Function) -->
                <div class="field">
                    <div class="field-label">Name</div>
                    <input class="field-input" value="${escapeAttr(equipment.name)}"
                           onchange="saveEquipmentField('${escapeAttr(equipmentId)}', 'name', this.value)">
                </div>

                <!-- Brand — tappable picker row. Opens the generic field picker
                     modal populated with catalog brands + user's existing brands. -->
                <div class="field">
                    <div class="field-label">Brand</div>
                    <button class="field-picker-row" onclick="openBrandPicker('${escapeAttr(equipmentId)}')" aria-haspopup="dialog">
                        <span class="field-picker-row__value ${!equipment.brand || equipment.brand === 'Unknown' ? 'field-picker-row__value--placeholder' : ''}">
                            ${escapeHtml(equipment.brand && equipment.brand !== 'Unknown' ? equipment.brand : 'Select a brand…')}
                        </span>
                        <i class="fas fa-chevron-down field-picker-row__chevron"></i>
                    </button>
                </div>

                <!-- Line — tappable picker row, scoped to the current brand. -->
                <div class="field">
                    <div class="field-label">Line</div>
                    <button class="field-picker-row" onclick="openLinePicker('${escapeAttr(equipmentId)}')" aria-haspopup="dialog">
                        <span class="field-picker-row__value ${!equipment.line ? 'field-picker-row__value--placeholder' : ''}">
                            ${escapeHtml(equipment.line || (equipment.brand && equipment.brand !== 'Unknown' ? 'Select a line…' : 'Pick brand first'))}
                        </span>
                        <i class="fas fa-chevron-down field-picker-row__chevron"></i>
                    </button>
                </div>

                <!-- Function — tappable picker row that opens a bottom-sheet selector.
                     Replaces the previous text-input-with-datalist because datalists on
                     mobile don't feel like a picker (no visible dropdown affordance). -->
                <div class="field">
                    <div class="field-label">Function</div>
                    <button class="field-picker-row" onclick="openFunctionPicker('${escapeAttr(equipmentId)}')" aria-haspopup="dialog">
                        <span class="field-picker-row__value ${!equipment.function ? 'field-picker-row__value--placeholder' : ''}">
                            ${escapeHtml(equipment.function || 'Select a function…')}
                        </span>
                        <i class="fas fa-chevron-down field-picker-row__chevron"></i>
                    </button>
                </div>

                <!-- Type chips -->
                <div class="field">
                    <div class="field-label">Type</div>
                    <div class="chips">
                        ${EQUIPMENT_TYPES_LIST.map(t => `
                            <div class="chip ${currentType === t ? 'active' : ''}"
                                 onclick="saveEquipmentField('${escapeAttr(equipmentId)}', 'equipmentType', '${t}'); openEquipmentDetail('${escapeAttr(equipmentId)}');">
                                ${t}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Base weight (conditional) -->
                ${BASE_WEIGHT_TYPES.includes(currentType) ? `
                <div class="field">
                    <div class="field-label">Base weight <span class="field-label__hint">(empty machine / bar)</span></div>
                    <div class="equip-base-weight-row">
                        <input type="number" inputmode="decimal" step="0.5"
                               class="equip-base-weight-input"
                               value="${equipment.baseWeight || 0}"
                               onchange="saveEquipmentBaseWeight('${escapeAttr(equipmentId)}', this.value)">
                        <div class="equip-base-weight-unit-toggle">
                            <button class="unit-chip ${(equipment.baseWeightUnit || 'lbs') === 'lbs' ? 'active' : ''}"
                                    onclick="setEquipmentBaseWeightUnit('${escapeAttr(equipmentId)}', 'lbs', this)">lb</button>
                            <button class="unit-chip ${(equipment.baseWeightUnit || 'lbs') === 'kg' ? 'active' : ''}"
                                    onclick="setEquipmentBaseWeightUnit('${escapeAttr(equipmentId)}', 'kg', this)">kg</button>
                        </div>
                    </div>
                    <div class="equip-base-weight-hint">Added to plate weight when logging sets and shown in the plate calculator.</div>
                </div>
                ` : ''}

                <!-- Locations -->
                <div class="sec-head">
                    <h4>Locations <span class="count">${locations.length}</span></h4>
                    <button class="sec-head__action" onclick="assignExerciseToEquipment('${escapeAttr(equipmentId)}')">+ Add</button>
                </div>
                <div class="chips equip-locations-chips">
                    ${locations.map(loc => `
                        <div class="chip active eq-location-chip">
                            <i class="fas fa-map-marker-alt"></i> ${escapeHtml(loc)}
                            <button class="chip-remove"
                                    onclick="event.stopPropagation(); removeEquipmentLocation('${escapeAttr(equipmentId)}', '${escapeAttr(loc)}')">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `).join('')}
                    ${locations.length === 0 ? '<span class="equip-locations-empty">No locations yet</span>' : ''}
                </div>

                <!-- Used for exercises -->
                <div class="sec-head">
                    <h4>Used for <span class="count">${exercises.length} exercise${exercises.length !== 1 ? 's' : ''}</span></h4>
                    <button class="sec-head__action" onclick="assignExerciseToEquipment('${escapeAttr(equipmentId)}')">+ Assign</button>
                </div>
                ${exercises.map(ex => `
                    <div class="link-row">
                        <div class="srow-icon ic-blue"><i class="fas fa-dumbbell"></i></div>
                        <div class="link-row-info">${escapeHtml(ex.name)}</div>
                        <button class="link-row-action" onclick="unassignExercise('${escapeAttr(equipmentId)}', '${escapeAttr(ex.name)}')">Remove</button>
                    </div>
                `).join('')}

                <!-- Notes -->
                <div class="sec-head"><h4>Notes</h4></div>
                <textarea class="field-input equip-notes"
                          placeholder="e.g., Setting 5 for chest fly, setting 8 for pushdown"
                          oninput="saveEquipmentNotes('${escapeAttr(equipmentId)}', this.value)">${escapeHtml(notes)}</textarea>

                <!-- Delete -->
                <div class="danger-action-row">
                    <button class="danger-action-btn"
                            onclick="deleteEquipmentFromLibrary('${escapeAttr(equipmentId)}')">
                        <i class="fas fa-trash"></i> Delete equipment
                    </button>
                </div>
            </div>
        </div>
    `;
}

export function backToEquipmentList() {
    currentDetailId = null;

    // Restore the canonical .page-header for the list view (matches the
    // markup in index.html so the DOM snaps back to its original shape).
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="navigateBack()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">Equipment</div>
            </div>
            <button class="page-header__save" onclick="showAddEquipmentFlow()">
                <i class="fas fa-plus"></i> Add
            </button>
        `;
    }

    renderEquipmentLibrary();
}

// ===================================================================
// EQUIPMENT ACTIONS
// ===================================================================

let notesSaveTimeout = null;

export async function saveEquipmentNotes(equipmentId, notes) {
    if (notesSaveTimeout) clearTimeout(notesSaveTimeout);
    notesSaveTimeout = setTimeout(async () => {
        try {
            const userId = AppState.currentUser.uid;
            await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { notes });
            // Update cache
            const eq = allEquipment.find(e => e.id === equipmentId);
            if (eq) eq.notes = notes;
        } catch (error) {
            console.error('Error saving notes:', error);
        }
    }, 800);
}

let assigningToEquipmentId = null;

export function assignExerciseToEquipment(equipmentId) {
    assigningToEquipmentId = equipmentId;
    const equipment = allEquipment.find(e => e.id === equipmentId);
    const existing = new Set(equipment?.exerciseTypes || []);

    const exercises = (AppState.exerciseDatabase || [])
        .map(ex => ({ name: ex.name || ex.machine, bodyPart: ex.bodyPart || ex.category || '' }))
        .filter(ex => ex.name && !existing.has(ex.name))
        .sort((a, b) => a.name.localeCompare(b.name));

    // Group by body part
    const groups = new Map();
    exercises.forEach(ex => {
        const group = ex.bodyPart || 'Other';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(ex);
    });

    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    let listHTML = '';
    for (const [group, items] of groups) {
        listHTML += `<div class="equip-group-header"><div class="equip-group-header__left"><span>${escapeHtml(group)}</span></div><span class="equip-group-header__count">${items.length}</span></div>`;
        listHTML += items.map(ex => `
            <div class="equip-exercise-row" onclick="confirmAssignExercise('${escapeAttr(ex.name)}')">
                <div class="equip-exercise-row__name">${escapeHtml(ex.name)}</div>
                <div class="row-card__action"><i class="fas fa-plus"></i></div>
            </div>
        `).join('');
    }

    container.innerHTML = `
        <div class="equip-detail-page">
            <div class="equip-detail-header">
                <button class="btn-icon" onclick="openEquipmentDetail('${escapeAttr(equipmentId)}')" aria-label="Back">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <h3>Assign Exercise</h3>
            </div>
            <div class="equip-lib-search equip-assign-search">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Search exercises…" oninput="filterAssignList(this.value)">
            </div>
            <div id="assign-exercise-list">
                ${exercises.length === 0 ? '<div class="empty-state-compact"><p>All exercises already assigned</p></div>' : listHTML}
            </div>
        </div>
    `;
}

export function filterAssignList(term) {
    const items = document.querySelectorAll('#assign-exercise-list .equip-lib-item');
    const lower = term.toLowerCase();
    items.forEach(item => {
        const name = item.querySelector('.row-card__title')?.textContent.toLowerCase() || '';
        item.style.display = name.includes(lower) ? '' : 'none';
    });
}

export async function confirmAssignExercise(exerciseName) {
    if (!assigningToEquipmentId) return;
    const equipmentId = assigningToEquipmentId;

    try {
        const userId = AppState.currentUser.uid;
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), {
            exerciseTypes: arrayUnion(exerciseName),
        });

        // Update cache
        const equipment = allEquipment.find(e => e.id === equipmentId);
        if (equipment) {
            if (!equipment.exerciseTypes) equipment.exerciseTypes = [];
            equipment.exerciseTypes.push(exerciseName);
        }

        showNotification(`Assigned "${exerciseName}"`, 'success', 1500);
        assigningToEquipmentId = null;
        openEquipmentDetail(equipmentId);
    } catch (error) {
        console.error('Error assigning exercise:', error);
        showNotification("Couldn't assign exercise", 'error');
    }
}

export async function unassignExercise(equipmentId, exerciseName) {
    if (!confirm(`Remove "${exerciseName}" from this equipment? Past workouts won't be affected.`)) return;

    try {
        const userId = AppState.currentUser.uid;
        const updates = {
            exerciseTypes: arrayRemove(exerciseName),
        };
        // Also remove exercise-specific video if any
        const equipment = allEquipment.find(e => e.id === equipmentId);
        if (equipment?.exerciseVideos?.[exerciseName]) {
            updates[`exerciseVideos.${exerciseName}`] = deleteField();
        }

        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), updates);

        // Update cache
        if (equipment) {
            equipment.exerciseTypes = (equipment.exerciseTypes || []).filter(t => t !== exerciseName);
            if (equipment.exerciseVideos) delete equipment.exerciseVideos[exerciseName];
        }

        showNotification('Exercise removed', 'success', 1500);
        openEquipmentDetail(equipmentId);
    } catch (error) {
        console.error('Error unassigning exercise:', error);
        showNotification("Couldn't remove exercise", 'error');
    }
}

/**
 * Save video URL from inline input in equipment detail view
 */
export async function saveEquipmentExerciseVideoFromLib(equipmentId, exerciseName, newUrl) {
    const equipment = allEquipment.find(e => e.id === equipmentId);
    try {
        const userId = AppState.currentUser.uid;
        const equipRef = doc(db, 'users', userId, 'equipment', equipmentId);

        if (!newUrl || newUrl.trim() === '') {
            await updateDoc(equipRef, { [`exerciseVideos.${exerciseName}`]: deleteField() });
            if (equipment?.exerciseVideos) delete equipment.exerciseVideos[exerciseName];
        } else {
            await updateDoc(equipRef, { [`exerciseVideos.${exerciseName}`]: newUrl.trim() });
            if (!equipment.exerciseVideos) equipment.exerciseVideos = {};
            equipment.exerciseVideos[exerciseName] = newUrl.trim();
        }
    } catch (error) {
        console.error('Error saving video:', error);
        showNotification("Couldn't save video", 'error');
    }
}

export async function deleteEquipmentFromLibrary(equipmentId) {
    const equipment = allEquipment.find(e => e.id === equipmentId);
    if (!confirm(`Delete "${equipment?.name || 'this equipment'}"? This can't be undone.`)) return;

    try {
        await getManager().deleteEquipment(equipmentId);
        allEquipment = allEquipment.filter(e => e.id !== equipmentId);
        showNotification('Equipment deleted', 'success', 1500);
        backToEquipmentList();
    } catch (error) {
        console.error('Error deleting equipment:', error);
        showNotification("Couldn't delete equipment", 'error');
    }
}

// ===================================================================
// ADD EQUIPMENT FLOW — 3-step state machine (Phase 3)
//
// Step 1: Pick Brand (existing + catalog + "New Brand")
// Step 2: Pick Line (existing + catalog + "New Line" + "Skip")
// Step 3: Name Function + Type + live preview
//
// The catalog provides a large initial pool of brands/lines; the user's own
// equipment augments it. State lives in `addFlowState` so back/forward and
// "Add Another" preserve the selection.
// ===================================================================

// Type vocabulary matches the v3 spec (EQUIPMENT-OVERHAUL-IMPLEMENTATION.md L60).
// "Machine" stays in the list for legacy records that haven't been reclassified
// yet by the catalog migration; new equipment should pick Plate-Loaded or
// Selectorized instead.
const EQUIPMENT_TYPES_LIST = [
    'Plate-Loaded', 'Selectorized', 'Machine',
    'Cable', 'Barbell', 'Dumbbell', 'Bench', 'Rack',
    'Cardio', 'Bodyweight', 'Other',
];

/** Equipment types that have a meaningful base/bar weight */
const BASE_WEIGHT_TYPES = ['Plate-Loaded', 'Machine', 'Barbell', 'Cable', 'Bench', 'Rack'];

/** Suggested default base weights when switching type */
const BASE_WEIGHT_SUGGESTIONS = {
    Barbell: 45,
    Cable: 5,
};

const addFlowState = {
    brand: null,    // selected brand name
    line: null,     // selected line name (null = skipped)
    func: '',       // typed function name
    type: 'Machine',
};

// Add-flow suggestion helpers removed — the cascading picker (fieldPickerState
// with mode='add') now calls getDetail{Brand,Line,Function}Suggestions directly
// via computeFieldPickerScope, so there's one code path for both modes.

// ---------------------------------------------------------------------------
// Detail-view datalist suggestions — give the Brand/Line/Function inputs the
// same catalog-backed dropdowns the Add flow has, so users editing existing
// equipment can pick from known options instead of typing free-form (which
// risked typos like "M1" instead of "M-1").
// ---------------------------------------------------------------------------

/**
 * Suggestion-helper return shape: `[{ name, source }]` where `source` is
 * `'catalog'` (from EQUIPMENT_CATALOG) or `'user'` (derived from the user's
 * own equipment records). Catalog entries take priority when a value exists
 * in both — prevents a user's old record with the same name from being
 * labelled as their own custom entry.
 */
function mergeSuggestions(catalogNames, userNames) {
    const catalogSet = new Set(catalogNames.map(n => n.toLowerCase()));
    const out = catalogNames.map(name => ({ name, source: 'catalog' }));
    for (const name of userNames) {
        if (!catalogSet.has(name.toLowerCase())) {
            out.push({ name, source: 'user' });
        }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

function getDetailBrandSuggestions() {
    const userBrands = [...new Set(
        (allEquipment || [])
            .map(e => e.brand)
            .filter(b => b && b !== 'Unknown')
    )];
    const catalogBrands = EQUIPMENT_CATALOG.map(b => b.brand);
    return mergeSuggestions(catalogBrands, userBrands);
}

function getDetailLineSuggestions(brand) {
    if (!brand) return [];
    const brandLC = brand.toLowerCase();
    const userLines = [...new Set(
        (allEquipment || [])
            .filter(e => e.brand?.toLowerCase() === brandLC && e.line)
            .map(e => e.line)
    )];
    const catalogEntry = EQUIPMENT_CATALOG.find(b => b.brand.toLowerCase() === brandLC);
    const catalogLines = catalogEntry ? catalogEntry.lines.map(l => l.name) : [];
    return mergeSuggestions(catalogLines, userLines);
}

/**
 * Returns the machine options shown in the Function picker. Strictly scoped to
 * the given brand + line so the user doesn't get a wall of unrelated machines.
 *   - Both brand + line match catalog → that line's machines.
 *   - Only brand matches → that brand's machines across all its lines.
 *   - Neither matches → user's own custom functions for this combo (no catalog
 *     noise). The picker UI also shows a hint when this happens.
 */
function getDetailFunctionSuggestions(brand, line) {
    const brandLC = (brand || '').toLowerCase();
    const lineLC = (line || '').toLowerCase();

    const userFns = [...new Set(
        (allEquipment || [])
            .filter(e =>
                e.brand?.toLowerCase() === brandLC &&
                (e.line || '').toLowerCase() === lineLC &&
                e.function
            )
            .map(e => e.function)
    )];

    let catalogFns = [];
    const brandEntry = brandLC && brandLC !== 'unknown'
        ? EQUIPMENT_CATALOG.find(b => b.brand.toLowerCase() === brandLC)
        : null;

    if (brandEntry) {
        const lineEntry = line
            ? brandEntry.lines.find(l => l.name.toLowerCase() === lineLC)
            : null;
        if (lineEntry) {
            catalogFns = lineEntry.machines.map(m => m.name);
        } else if (!line) {
            catalogFns = brandEntry.lines.flatMap(l => l.machines.map(m => m.name));
        }
    }

    return mergeSuggestions(catalogFns, userFns);
}

// ---------------------------------------------------------------------------
// Generic field picker — one bottom-sheet modal drives selection for Brand,
// Line, and Function. The three openBrandPicker/openLinePicker/openFunctionPicker
// entry points below all delegate here. Cascading clear: changing brand clears
// line + function; changing line clears function.
// ---------------------------------------------------------------------------

const fieldPickerState = {
    mode: 'edit',         // 'edit' | 'add'
    equipmentId: null,    // only used in edit mode
    field: null,          // 'brand' | 'line' | 'function'
    searchTerm: '',
    customMode: false,
};

// Edit-mode entry points — open the picker scoped to an existing equipment doc.
export function openBrandPicker(equipmentId)    { openFieldPicker(equipmentId, 'brand', 'edit'); }
export function openLinePicker(equipmentId)     { openFieldPicker(equipmentId, 'line', 'edit'); }
export function openFunctionPicker(equipmentId) { openFieldPicker(equipmentId, 'function', 'edit'); }

// Add-mode entry points — open the picker scoped to the in-progress addFlowState draft.
export function openAddFlowBrandPicker()    { openFieldPicker(null, 'brand', 'add'); }
export function openAddFlowLinePicker()     { openFieldPicker(null, 'line', 'add'); }
export function openAddFlowFunctionPicker() { openFieldPicker(null, 'function', 'add'); }

function openFieldPicker(equipmentId, field, mode = 'edit') {
    if (mode === 'edit' && !allEquipment.find(e => e.id === equipmentId)) return;
    fieldPickerState.mode = mode;
    fieldPickerState.equipmentId = mode === 'edit' ? equipmentId : null;
    fieldPickerState.field = field;
    fieldPickerState.searchTerm = '';
    fieldPickerState.customMode = false;
    renderFieldPicker();
    openModal('function-picker-modal');
}

/**
 * Build the {options, currentValue, title, scopeLabel, scopeHint, placeholder}
 * for whichever field we're editing. Separating this from the render lets the
 * same modal chrome handle all three pickers.
 */
function computeFieldPickerScope() {
    const { equipmentId, field, mode } = fieldPickerState;
    // In add mode, read from the in-progress addFlowState draft. addFlowState
    // uses `func` for the function field — translate here so downstream logic
    // is identical across both modes.
    const eq = mode === 'add'
        ? { brand: addFlowState.brand, line: addFlowState.line, function: addFlowState.func }
        : (allEquipment.find(e => e.id === equipmentId) || {});

    if (field === 'brand') {
        return {
            options: getDetailBrandSuggestions(),
            currentValue: eq.brand && eq.brand !== 'Unknown' ? eq.brand : null,
            title: 'Select Brand',
            scopeLabel: 'Catalog + your equipment',
            scopeHint: null,
            placeholder: 'e.g., Hammer Strength',
        };
    }

    if (field === 'line') {
        const hasBrand = eq.brand && eq.brand !== 'Unknown';
        return {
            options: hasBrand ? getDetailLineSuggestions(eq.brand) : [],
            currentValue: eq.line || null,
            title: 'Select Line',
            scopeLabel: hasBrand ? eq.brand : 'No brand set',
            scopeHint: hasBrand ? null : 'Set a brand first so we can filter the line list.',
            placeholder: 'e.g., Fit Evo, Plate-Loaded',
        };
    }

    // field === 'function'
    const brand = eq.brand;
    const line = eq.line;
    const brandLC = (brand || '').toLowerCase();
    const brandEntry = brandLC && brandLC !== 'unknown'
        ? EQUIPMENT_CATALOG.find(b => b.brand.toLowerCase() === brandLC)
        : null;
    const lineEntry = brandEntry && line
        ? brandEntry.lines.find(l => l.name.toLowerCase() === line.toLowerCase())
        : null;

    let scopeLabel;
    let scopeHint = null;
    if (brandEntry && lineEntry) {
        scopeLabel = `${brandEntry.brand} · ${lineEntry.name}`;
    } else if (brandEntry && line) {
        scopeLabel = brandEntry.brand;
        scopeHint = `Line "${line}" isn't in the catalog — showing all ${brandEntry.brand} machines.`;
    } else if (brandEntry) {
        scopeLabel = brandEntry.brand;
        scopeHint = 'No line selected — showing every machine for this brand.';
    } else if (brand && brand !== 'Unknown') {
        scopeLabel = brand;
        scopeHint = `Brand "${brand}" isn't in the catalog — showing your custom entries only.`;
    } else {
        scopeLabel = 'No brand set';
        scopeHint = 'Set a brand on this equipment to see catalog machines.';
    }

    return {
        options: getDetailFunctionSuggestions(brand, line),
        currentValue: eq.function || null,
        title: 'Select Function',
        scopeLabel,
        scopeHint,
        placeholder: 'e.g., Leg Extension',
    };
}

function renderFieldPicker() {
    const modal = document.getElementById('function-picker-modal');
    const content = modal?.querySelector('.modal-content');
    if (!modal || !content) return;

    const { equipmentId, field, searchTerm, customMode } = fieldPickerState;
    const { options, currentValue, title, scopeLabel, scopeHint, placeholder } = computeFieldPickerScope();

    const term = searchTerm.trim().toLowerCase();
    const filtered = term
        ? options.filter(o => o.name.toLowerCase().includes(term))
        : options;

    const rowsHTML = filtered.length > 0
        ? filtered.map(opt => `
            <button class="function-picker__row ${opt.name === currentValue ? 'is-current' : ''}"
                    onclick="selectFieldValue('${escapeAttr(equipmentId)}', '${escapeAttr(field)}', '${escapeAttr(opt.name)}')">
                <span class="function-picker__row-name">${escapeHtml(opt.name)}</span>
                ${opt.source === 'user' ? '<span class="function-picker__row-source">your equipment</span>' : ''}
                ${opt.name === currentValue ? '<i class="fas fa-check function-picker__row-check"></i>' : ''}
            </button>
        `).join('')
        : `<div class="function-picker__empty">No matches — use Custom below to enter a new one.</div>`;

    const customHTML = customMode
        ? `
            <div class="function-picker__custom-row">
                <input type="text" class="function-picker__custom-input" id="function-picker-custom-input"
                       placeholder="${escapeAttr(placeholder || 'Enter a custom name…')}"
                       value="${escapeAttr(searchTerm)}"
                       onkeydown="if(event.key==='Enter') selectFieldValue('${escapeAttr(equipmentId)}', '${escapeAttr(field)}', this.value.trim())">
                <button class="btn btn-primary function-picker__custom-btn"
                        onclick="selectFieldValue('${escapeAttr(equipmentId)}', '${escapeAttr(field)}', document.getElementById('function-picker-custom-input').value.trim())">
                    Use
                </button>
            </div>
        `
        : `
            <button class="function-picker__custom-toggle" onclick="showFieldPickerCustom()">
                <i class="fas fa-pen"></i> Custom name…
            </button>
        `;

    content.innerHTML = `
        <div class="function-picker">
            <div class="function-picker__header">
                <h3 class="function-picker__title">${escapeHtml(title)}</h3>
                <div class="function-picker__scope">${escapeHtml(scopeLabel)}</div>
                <button class="close-btn" aria-label="Close" onclick="closeFieldPicker()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${scopeHint ? `<div class="function-picker__hint">${escapeHtml(scopeHint)}</div>` : ''}
            <div class="function-picker__search">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Search…"
                       value="${escapeAttr(searchTerm)}"
                       oninput="filterFieldPicker(this.value)">
            </div>
            <div class="function-picker__list">${rowsHTML}</div>
            ${customHTML}
        </div>
    `;

    if (customMode) {
        setTimeout(() => {
            const input = document.getElementById('function-picker-custom-input');
            input?.focus();
            input?.setSelectionRange(input.value.length, input.value.length);
        }, 30);
    }
}

export function filterFieldPicker(term) {
    fieldPickerState.searchTerm = term || '';
    renderFieldPicker();
    setTimeout(() => {
        const search = document.querySelector('.function-picker__search input');
        if (search) {
            search.focus();
            search.setSelectionRange(search.value.length, search.value.length);
        }
    }, 0);
}

export function showFieldPickerCustom() {
    fieldPickerState.customMode = true;
    renderFieldPicker();
}

/**
 * Save the picked value for the active field. Cascading clear: changing
 * `brand` nulls both `line` and `function`; changing `line` nulls `function`.
 * Updates Firestore + the local cache, closes the modal, and re-renders the
 * detail page so all three picker rows show the new state.
 */
export async function selectFieldValue(equipmentId, field, value) {
    const v = (value || '').trim();
    if (!v) {
        showNotification('Enter a value', 'error', 1500);
        return;
    }

    // Add mode — route the selection to the in-progress addFlowState draft.
    // addFlowState uses `func` for the function field; cascade clears apply
    // identically (brand → clear line + func; line → clear func).
    if (fieldPickerState.mode === 'add') {
        if (field === 'brand') {
            addFlowState.brand = v;
            addFlowState.line = null;
            addFlowState.func = '';
        } else if (field === 'line') {
            addFlowState.line = v;
            addFlowState.func = '';
        } else {
            addFlowState.func = v;
        }
        closeModal('function-picker-modal');
        renderAddFlow();
        return;
    }

    // Edit mode — persist to Firestore + the local cache, then re-render the
    // detail page. Cascade clears are applied in a single update object.
    const update = { [field]: v };
    if (field === 'brand') { update.line = null; update.function = null; }
    if (field === 'line')  { update.function = null; }

    try {
        const userId = AppState.currentUser.uid;
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), update);

        const eq = allEquipment.find(e => e.id === equipmentId);
        if (eq) Object.assign(eq, update);

        closeModal('function-picker-modal');
        openEquipmentDetail(equipmentId);
    } catch (err) {
        console.error(`Error saving ${field}:`, err);
        showNotification(`Couldn't save ${field}`, 'error');
    }
}

export function closeFieldPicker() {
    closeModal('function-picker-modal');
}

function addFlowGeneratedName() {
    const { brand, line, func } = addFlowState;
    if (brand && line && func) return `${brand} ${line} — ${func}`;
    if (brand && func)         return `${brand} — ${func}`;
    if (brand && line)         return `${brand} ${line}`;
    if (func)                  return func;
    return brand || '';
}

export function showAddEquipmentFlow() {
    addFlowState.brand = null;
    addFlowState.line = null;
    addFlowState.func = '';
    addFlowState.type = 'Machine';
    renderAddFlow();
}

/**
 * Single-page Add Equipment form. Uses the same cascading Brand → Line →
 * Function picker as the detail view (opened via openAddFlow*Picker entry
 * points that set fieldPickerState.mode = 'add'). Type is a chip row below
 * the pickers; preview string shows the generated display name.
 */
function renderAddFlow() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Page header — back always returns to the list (no more steps).
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="backToEquipmentList()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">Add Equipment</div>
            </div>
        `;
    }

    const { brand, line, func, type } = addFlowState;
    const previewName = addFlowGeneratedName() || '—';

    container.innerHTML = `
        <div class="add-flow">
            <div class="add-step__label">New Equipment</div>
            <div class="add-step__hint">Pick a brand, its product line, then the specific machine.</div>

            <div class="field">
                <div class="field-label">Brand</div>
                <button class="field-picker-row" onclick="openAddFlowBrandPicker()" aria-haspopup="dialog">
                    <span class="field-picker-row__value ${!brand ? 'field-picker-row__value--placeholder' : ''}">
                        ${escapeHtml(brand || 'Select a brand…')}
                    </span>
                    <i class="fas fa-chevron-down field-picker-row__chevron"></i>
                </button>
            </div>

            <div class="field">
                <div class="field-label">Line</div>
                <button class="field-picker-row" onclick="openAddFlowLinePicker()" aria-haspopup="dialog">
                    <span class="field-picker-row__value ${!line ? 'field-picker-row__value--placeholder' : ''}">
                        ${escapeHtml(line || (brand ? 'Select a line…' : 'Pick brand first'))}
                    </span>
                    <i class="fas fa-chevron-down field-picker-row__chevron"></i>
                </button>
            </div>

            <div class="field">
                <div class="field-label">Function</div>
                <button class="field-picker-row" onclick="openAddFlowFunctionPicker()" aria-haspopup="dialog">
                    <span class="field-picker-row__value ${!func ? 'field-picker-row__value--placeholder' : ''}">
                        ${escapeHtml(func || (brand ? 'Select a function…' : 'Pick brand first'))}
                    </span>
                    <i class="fas fa-chevron-down field-picker-row__chevron"></i>
                </button>
            </div>

            <div class="add-field">
                <div class="add-field__label">Type</div>
                <div class="add-type-chips">
                    ${EQUIPMENT_TYPES_LIST.map((t) => `
                        <button class="add-type-chip ${type === t ? 'is-active' : ''}"
                                onclick="addFlowSetType('${t}')">
                            ${t}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div class="add-preview">
                <span class="add-preview__label">Will be named:</span>
                <strong class="add-preview__val">${escapeHtml(previewName)}</strong>
            </div>

            <div class="add-step__actions">
                <button class="btn btn-primary" onclick="confirmAddEquipment()">
                    <i class="fas fa-plus"></i> Add Equipment
                </button>
                ${line ? `
                    <button class="btn btn-secondary" onclick="confirmAddEquipment(true)">
                        Add Another to ${escapeHtml(line)}
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

export function addFlowSetType(type) {
    if (!EQUIPMENT_TYPES_LIST.includes(type)) return;
    addFlowState.type = type;
    renderAddFlow();
}

export async function confirmAddEquipment(addAnother = false) {
    const { brand, line, func, type } = addFlowState;
    const cleanFunc = (func || '').trim();

    if (!cleanFunc) {
        showNotification('Enter a function name (e.g., Leg Press)', 'error', 2000);
        return;
    }

    const name = addFlowGeneratedName();
    const defaultBW = BASE_WEIGHT_SUGGESTIONS[type] || 0;

    try {
        const result = await getManager().getOrCreateEquipment(name, {
            brand: brand || null,
            line: line || null,
            function: cleanFunc,
            equipmentType: type,
            baseWeight: defaultBW,
            baseWeightUnit: 'lbs',
        });
        if (!result) {
            showNotification("Couldn't add equipment", 'error');
            return;
        }
        allEquipment = await getManager().getUserEquipment();
        AppState._cachedEquipment = allEquipment;

        if (addAnother) {
            showNotification(`Added — ${name}`, 'success', 1200);
            // Stay on step 3, keep brand+line+type, clear function for the next entry.
            addFlowState.func = '';
            renderAddFlow();
            setTimeout(() => {
                document.getElementById('add-flow-func')?.focus();
            }, 30);
        } else {
            showNotification('Equipment added', 'success', 1500);
            openEquipmentDetail(result.id);
        }
    } catch (error) {
        console.error('Error adding equipment:', error);
        showNotification("Couldn't add equipment", 'error');
    }
}

// ===================================================================
// BASE WEIGHT ACTIONS
// ===================================================================

let fieldSaveTimeout = null;

export async function removeEquipmentLocation(equipmentId, locationName) {
    try {
        const eq = allEquipment.find(e => e.id === equipmentId);
        if (!eq) return;
        const locations = (eq.locations || []).filter(l => l !== locationName);
        const userId = AppState.currentUser.uid;
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { locations });
        eq.locations = locations;
        // Re-render detail page
        openEquipmentDetail(equipmentId);
    } catch (error) {
        console.error('Error removing location:', error);
    }
}

export async function saveEquipmentField(equipmentId, field, value) {
    // Optimistic local update — mutate the in-memory cache FIRST so any
    // re-render triggered alongside this save (e.g., onchange cascades)
    // sees the new value. The Firestore write is still debounced.
    const eq = allEquipment.find(e => e.id === equipmentId);
    if (eq) eq[field] = value;

    if (fieldSaveTimeout) clearTimeout(fieldSaveTimeout);
    fieldSaveTimeout = setTimeout(async () => {
        try {
            const userId = AppState.currentUser.uid;
            await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { [field]: value });
        } catch (error) {
            console.error(`Error saving equipment ${field}:`, error);
        }
    }, 600);
}

let baseWeightSaveTimeout = null;

export async function saveEquipmentBaseWeight(equipmentId, value) {
    const numValue = parseFloat(value);
    const baseWeight = (!isNaN(numValue) && numValue >= 0) ? numValue : 0;

    if (baseWeightSaveTimeout) clearTimeout(baseWeightSaveTimeout);
    baseWeightSaveTimeout = setTimeout(async () => {
        try {
            const userId = AppState.currentUser.uid;
            await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { baseWeight });
            const eq = allEquipment.find(e => e.id === equipmentId);
            if (eq) eq.baseWeight = baseWeight;
        } catch (error) {
            console.error('Error saving base weight:', error);
            showNotification("Couldn't save base weight", 'error');
        }
    }, 600);
}

export async function setEquipmentBaseWeightUnit(equipmentId, unit, btn) {
    try {
        const userId = AppState.currentUser.uid;
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { baseWeightUnit: unit });
        const eq = allEquipment.find(e => e.id === equipmentId);
        if (eq) eq.baseWeightUnit = unit;

        // Update toggle UI
        const parent = btn.parentElement;
        parent.querySelectorAll('.unit-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    } catch (error) {
        console.error('Error saving base weight unit:', error);
    }
}

// Cleanup: autoParseEquipmentName was deleted — it referenced a
// KNOWN_BRANDS constant that was never defined and the function had
// no callers, so calling it would have crashed with ReferenceError.
// Re-add with a real KNOWN_BRANDS table if equipment-name parsing
// becomes a feature.
