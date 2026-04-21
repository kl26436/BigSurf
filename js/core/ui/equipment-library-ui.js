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

function getManager() {
    if (!workoutManager) workoutManager = new FirebaseWorkoutManager(AppState);
    return workoutManager;
}

const EQUIPMENT_TYPE_ICONS = {
    Machine:    { icon: 'fa-cog',        color: '#4A90D9' },
    Barbell:    { icon: 'fa-dumbbell',   color: '#D96A4A' },
    Dumbbell:   { icon: 'fa-dumbbell',   color: '#D9A74A' },
    Cable:      { icon: 'fa-link',       color: '#7B4AD9' },
    Bench:      { icon: 'fa-couch',      color: '#4AD9A7' },
    Rack:       { icon: 'fa-border-all', color: '#D94A7A' },
    Bodyweight: { icon: 'fa-child',      color: '#4AD9D9' },
    Other:      { icon: 'fa-wrench',     color: 'var(--text-muted)' },
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
    allEquipment = await getManager().getUserEquipment();
    // Cache for cross-module access (plate calculator, weight calculations)
    AppState._cachedEquipment = allEquipment;
    renderEquipmentLibrary();
}

function renderEquipmentLibrary() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

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

    // Search bar (hidden by default)
    const searchHTML = `
        <div class="equip-search-bar hidden" id="equip-search-bar">
            <div class="equip-lib-search">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Search equipment, brand, line, exercises…"
                       value="${escapeAttr(currentSearchTerm)}"
                       oninput="filterEquipmentBySearch(this.value)">
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
        viewToggleHTML +
        filterHTML +
        searchHTML +
        `<div class="equip-lib-list">${listHTML}</div>`;
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
    renderEquipmentLibrary();
}

export function filterEquipmentBySearch(term) {
    currentSearchTerm = term;

    // Save search bar state, re-render list only, then restore search bar
    const searchBar = document.getElementById('equip-search-bar');
    const wasVisible = searchBar && !searchBar.classList.contains('hidden');

    renderEquipmentLibrary();

    // Restore search bar visibility and re-focus input
    if (wasVisible) {
        const newBar = document.getElementById('equip-search-bar');
        if (newBar) {
            newBar.classList.remove('hidden');
            const input = newBar.querySelector('input');
            if (input) {
                input.value = term;
                input.focus();
                // Move cursor to end
                input.setSelectionRange(term.length, term.length);
            }
        }
    }
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

                <!-- Brand -->
                <div class="field">
                    <div class="field-label">Brand</div>
                    <input class="field-input" value="${escapeAttr(equipment.brand || '')}" placeholder="e.g., Hammer Strength"
                           onchange="saveEquipmentField('${escapeAttr(equipmentId)}', 'brand', this.value)">
                </div>

                <!-- Line (product line within brand, e.g. "Fit Evo" for Panatta) -->
                <div class="field">
                    <div class="field-label">Line</div>
                    <input class="field-input" value="${escapeAttr(equipment.line || '')}" placeholder="e.g., Fit Evo, Plate-Loaded"
                           onchange="saveEquipmentField('${escapeAttr(equipmentId)}', 'line', this.value)">
                </div>

                <!-- Function (the machine's purpose, e.g. "Leg Extension") -->
                <div class="field">
                    <div class="field-label">Function</div>
                    <input class="field-input" value="${escapeAttr(equipment.function || '')}" placeholder="e.g., Leg Extension"
                           onchange="saveEquipmentField('${escapeAttr(equipmentId)}', 'function', this.value)">
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
                <input type="text" placeholder="Search exercises..." oninput="filterAssignList(this.value)">
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
        showNotification('Failed to assign exercise', 'error');
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
        showNotification('Failed to remove exercise', 'error');
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
        showNotification('Failed to save video', 'error');
    }
}

export async function deleteEquipmentFromLibrary(equipmentId) {
    const equipment = allEquipment.find(e => e.id === equipmentId);
    if (!confirm(`Delete "${equipment?.name || 'this equipment'}"? This cannot be undone.`)) return;

    try {
        await getManager().deleteEquipment(equipmentId);
        allEquipment = allEquipment.filter(e => e.id !== equipmentId);
        showNotification('Equipment deleted', 'success', 1500);
        backToEquipmentList();
    } catch (error) {
        console.error('Error deleting equipment:', error);
        showNotification('Failed to delete equipment', 'error');
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

const EQUIPMENT_TYPES_LIST = ['Machine', 'Barbell', 'Dumbbell', 'Cable', 'Bench', 'Rack', 'Bodyweight', 'Other'];

/** Equipment types that have a meaningful base/bar weight */
const BASE_WEIGHT_TYPES = ['Machine', 'Barbell', 'Cable', 'Bench', 'Rack'];

/** Suggested default base weights when switching type */
const BASE_WEIGHT_SUGGESTIONS = {
    Barbell: 45,
    Cable: 5,
};

const addFlowState = {
    step: 1,        // 1, 2, or 3
    brand: null,    // selected brand name
    line: null,     // selected line name (null = skipped)
    func: '',       // typed function name
    type: 'Machine',
};

/**
 * Merge user's existing brands (with usage counts) and catalog brands into a
 * single list ordered by: used-by-user desc, then alpha. Used brands win over
 * catalog-only brands for display ordering so the user sees their own gym first.
 */
function getAddFlowBrandList() {
    const userCounts = new Map();
    for (const eq of allEquipment) {
        if (!eq.brand || eq.brand === 'Unknown') continue;
        userCounts.set(eq.brand, (userCounts.get(eq.brand) || 0) + 1);
    }
    const catalogBrands = EQUIPMENT_CATALOG.map((b) => b.brand);
    const allNames = new Set([...userCounts.keys(), ...catalogBrands]);

    return [...allNames]
        .map((name) => ({ name, count: userCounts.get(name) || 0 }))
        .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return a.name.localeCompare(b.name);
        });
}

/**
 * Lines for the chosen brand — user's actual lines under this brand + the
 * catalog's line list for this brand (if any). Sorted alpha.
 */
function getAddFlowLinesForBrand(brand) {
    if (!brand) return [];
    const userLines = new Map();
    for (const eq of allEquipment) {
        if (eq.brand !== brand || !eq.line) continue;
        userLines.set(eq.line, (userLines.get(eq.line) || 0) + 1);
    }
    const catalogEntry = EQUIPMENT_CATALOG.find((b) => b.brand === brand);
    const catalogLines = catalogEntry ? catalogEntry.lines.map((l) => l.name) : [];
    const allNames = new Set([...userLines.keys(), ...catalogLines]);

    return [...allNames]
        .map((name) => ({ name, count: userLines.get(name) || 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function getAddFlowFunctionsForBrandLine(brand, line) {
    // Suggest machines from the catalog entry (if the combination is known).
    const brandEntry = EQUIPMENT_CATALOG.find((b) => b.brand === brand);
    if (!brandEntry) return [];
    const lineEntry = brandEntry.lines.find((l) => l.name === line);
    if (!lineEntry) return [];
    return lineEntry.machines.map((m) => m.name);
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
    addFlowState.step = 1;
    addFlowState.brand = null;
    addFlowState.line = null;
    addFlowState.func = '';
    addFlowState.type = 'Machine';
    renderAddFlow();
}

function renderAddFlow() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Rewrite the page header for the flow — "Add Equipment" title + back btn
    // behaves per step (returns to list on step 1, prior step otherwise).
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        const backAction = addFlowState.step === 1 ? 'backToEquipmentList()' : 'addFlowBack()';
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="${backAction}" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">Add Equipment</div>
            </div>
        `;
    }

    const progressHTML = `
        <div class="add-progress" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow="${addFlowState.step}">
            ${[1, 2, 3].map((n) => {
                let cls = 'add-progress__step';
                if (n < addFlowState.step) cls += ' is-done';
                else if (n === addFlowState.step) cls += ' is-active';
                return `<div class="${cls}"></div>`;
            }).join('')}
        </div>
    `;

    const breadcrumbs = [];
    if (addFlowState.step >= 2 && addFlowState.brand) {
        breadcrumbs.push(`<span class="add-crumb"><i class="fas fa-industry"></i> ${escapeHtml(addFlowState.brand)}</span>`);
    }
    if (addFlowState.step >= 3 && addFlowState.line) {
        breadcrumbs.push(`<span class="add-crumb"><i class="fas fa-layer-group"></i> ${escapeHtml(addFlowState.line)}</span>`);
    } else if (addFlowState.step >= 3 && addFlowState.line === null && addFlowState.brand) {
        breadcrumbs.push(`<span class="add-crumb add-crumb--muted"><i class="fas fa-minus"></i> No line</span>`);
    }
    const breadcrumbHTML = breadcrumbs.length > 0
        ? `<div class="add-crumbs">${breadcrumbs.join('')}</div>`
        : '';

    let stepHTML;
    switch (addFlowState.step) {
        case 1: stepHTML = renderAddBrandStep(); break;
        case 2: stepHTML = renderAddLineStep(); break;
        case 3: stepHTML = renderAddNameStep(); break;
        default: stepHTML = '';
    }

    container.innerHTML = `
        <div class="add-flow">
            ${progressHTML}
            ${breadcrumbHTML}
            ${stepHTML}
        </div>
    `;
}

function renderAddBrandStep() {
    const brands = getAddFlowBrandList();

    return `
        <div class="add-step">
            <div class="add-step__label">Pick a Brand</div>
            <div class="add-step__hint">Choose a brand you already have, or add a new one.</div>
            <div class="add-grid">
                ${brands.map((b) => `
                    <div class="add-option" onclick="addFlowSelectBrand('${escapeAttr(b.name)}')">
                        <div class="add-option__icon"><i class="fas fa-industry"></i></div>
                        <div class="add-option__name">${escapeHtml(b.name)}</div>
                        ${b.count > 0 ? `<div class="add-option__count">${b.count} machine${b.count !== 1 ? 's' : ''}</div>` : '<div class="add-option__count add-option__count--muted">from catalog</div>'}
                    </div>
                `).join('')}
                <div class="add-option add-option--new" onclick="addFlowShowNewBrand()">
                    <div class="add-option__icon add-option__icon--accent"><i class="fas fa-plus-circle"></i></div>
                    <div class="add-option__name">New Brand</div>
                </div>
            </div>
            <div id="add-flow-new-brand" class="add-input-row hidden">
                <label for="add-flow-new-brand-input">Brand name</label>
                <input type="text" id="add-flow-new-brand-input"
                       placeholder="e.g., Life Fitness, Cybex"
                       onkeydown="if(event.key==='Enter') addFlowSelectBrand(this.value.trim())">
                <button class="btn btn-primary" onclick="addFlowSelectBrand(document.getElementById('add-flow-new-brand-input').value.trim())">
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

function renderAddLineStep() {
    const lines = getAddFlowLinesForBrand(addFlowState.brand);

    return `
        <div class="add-step">
            <div class="add-step__label">Pick a Line</div>
            <div class="add-step__hint">Product line within <strong>${escapeHtml(addFlowState.brand)}</strong> — or skip if this brand doesn't use lines.</div>
            <div class="add-grid">
                ${lines.map((l) => `
                    <div class="add-option" onclick="addFlowSelectLine('${escapeAttr(l.name)}')">
                        <div class="add-option__icon"><i class="fas fa-layer-group"></i></div>
                        <div class="add-option__name">${escapeHtml(l.name)}</div>
                        ${l.count > 0 ? `<div class="add-option__count">${l.count} machine${l.count !== 1 ? 's' : ''}</div>` : '<div class="add-option__count add-option__count--muted">from catalog</div>'}
                    </div>
                `).join('')}
                <div class="add-option add-option--new" onclick="addFlowShowNewLine()">
                    <div class="add-option__icon add-option__icon--accent"><i class="fas fa-plus-circle"></i></div>
                    <div class="add-option__name">New Line</div>
                </div>
            </div>
            <div id="add-flow-new-line" class="add-input-row hidden">
                <label for="add-flow-new-line-input">Line name</label>
                <input type="text" id="add-flow-new-line-input"
                       placeholder="e.g., Monolith, Plate-Loaded"
                       onkeydown="if(event.key==='Enter') addFlowSelectLine(this.value.trim())">
                <button class="btn btn-primary" onclick="addFlowSelectLine(document.getElementById('add-flow-new-line-input').value.trim())">
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <button class="btn btn-text add-flow__skip" onclick="addFlowSkipLine()">
                Skip — this brand doesn't use lines
            </button>
        </div>
    `;
}

function renderAddNameStep() {
    const suggestions = getAddFlowFunctionsForBrandLine(addFlowState.brand, addFlowState.line);
    const previewName = addFlowGeneratedName() || '—';

    return `
        <div class="add-step">
            <div class="add-step__label">Name &amp; Type</div>
            <div class="add-step__hint">What does this machine do?</div>

            <div class="add-field">
                <label for="add-flow-func" class="add-field__label">Function</label>
                <input type="text" id="add-flow-func" class="add-field__input"
                       placeholder="e.g., Leg Press, Lat Pulldown"
                       value="${escapeAttr(addFlowState.func)}"
                       list="add-flow-func-suggestions"
                       oninput="addFlowSetFunction(this.value)">
                ${suggestions.length > 0 ? `
                    <datalist id="add-flow-func-suggestions">
                        ${suggestions.map((s) => `<option value="${escapeAttr(s)}">`).join('')}
                    </datalist>
                ` : ''}
            </div>

            <div class="add-field">
                <div class="add-field__label">Type</div>
                <div class="add-type-chips">
                    ${EQUIPMENT_TYPES_LIST.map((t) => `
                        <button class="add-type-chip ${addFlowState.type === t ? 'is-active' : ''}"
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
                ${addFlowState.line ? `
                    <button class="btn btn-secondary" onclick="confirmAddEquipment(true)">
                        Add Another to ${escapeHtml(addFlowState.line)}
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// --- Flow actions (all wired to window via main.js) ---

export function addFlowBack() {
    if (addFlowState.step <= 1) return;
    addFlowState.step--;
    renderAddFlow();
}

export function addFlowSelectBrand(brandName) {
    const name = (brandName || '').trim();
    if (!name) {
        showNotification('Enter a brand name', 'error', 1500);
        return;
    }
    addFlowState.brand = name;
    addFlowState.step = 2;
    renderAddFlow();
}

export function addFlowShowNewBrand() {
    const row = document.getElementById('add-flow-new-brand');
    const input = document.getElementById('add-flow-new-brand-input');
    if (row) row.classList.remove('hidden');
    if (input) input.focus();
}

export function addFlowSelectLine(lineName) {
    const name = (lineName || '').trim();
    if (!name) {
        showNotification('Enter a line name (or tap Skip)', 'error', 1500);
        return;
    }
    addFlowState.line = name;
    addFlowState.step = 3;
    renderAddFlow();
}

export function addFlowShowNewLine() {
    const row = document.getElementById('add-flow-new-line');
    const input = document.getElementById('add-flow-new-line-input');
    if (row) row.classList.remove('hidden');
    if (input) input.focus();
}

export function addFlowSkipLine() {
    addFlowState.line = null;
    addFlowState.step = 3;
    renderAddFlow();
}

export function addFlowSetFunction(value) {
    addFlowState.func = value;
    // Reactive preview update — target just the span so the input keeps focus.
    const preview = document.querySelector('.add-preview__val');
    if (preview) preview.textContent = addFlowGeneratedName() || '—';
}

export function addFlowSetType(type) {
    if (!EQUIPMENT_TYPES_LIST.includes(type)) return;
    addFlowState.type = type;
    // Only the type chip row changes — re-render the whole step to keep things simple.
    // (Re-renders the step only; flow state stays put.)
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
            showNotification('Failed to add equipment', 'error');
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
        showNotification('Failed to add equipment', 'error');
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
    if (fieldSaveTimeout) clearTimeout(fieldSaveTimeout);
    fieldSaveTimeout = setTimeout(async () => {
        try {
            const userId = AppState.currentUser.uid;
            await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), { [field]: value });
            const eq = allEquipment.find(e => e.id === equipmentId);
            if (eq) eq[field] = value;
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
            showNotification('Failed to save base weight', 'error');
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

// ===================================================================
// AUTO-PARSE EQUIPMENT NAME
// ===================================================================

export function autoParseEquipmentName(name) {
    let brand = null, model = null, func = name;

    for (const b of KNOWN_BRANDS) {
        if (name.toLowerCase().startsWith(b.toLowerCase())) {
            brand = b;
            func = name.slice(b.length).trim();
            if (func.includes('—')) {
                [model, func] = func.split('—').map(s => s.trim());
            } else if (func.includes('-')) {
                const parts = func.split('-').map(s => s.trim());
                if (parts.length === 2) {
                    [model, func] = parts;
                }
            }
            break;
        }
    }

    return { brand, model, function: func };
}
