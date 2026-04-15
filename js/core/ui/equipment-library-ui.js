// Equipment Library UI Module - core/ui/equipment-library-ui.js
// Gym-centric equipment management page

import { AppState } from '../utils/app-state.js';
import { showNotification, escapeHtml, escapeAttr, openModal, closeModal } from './ui-helpers.js';
import { db, doc, updateDoc, arrayUnion, arrayRemove, deleteField, getDoc } from '../data/firebase-config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';

let workoutManager = null;
let allEquipment = [];
let currentLocationFilter = null;
let currentSearchTerm = '';
let currentDetailId = null;

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

    // Build location filter pills
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
                <input type="text" placeholder="Search equipment or exercises..."
                       value="${escapeAttr(currentSearchTerm)}"
                       oninput="filterEquipmentBySearch(this.value)">
            </div>
        </div>
    `;

    // Build hierarchy
    const hierarchy = buildEquipmentHierarchy(filtered);

    let listHTML = '';
    if (filtered.length === 0) {
        listHTML = `
            <div class="empty-state-compact">
                <i class="fas fa-wrench"></i>
                <p>${currentSearchTerm ? 'No matches found' : 'No equipment found'}</p>
                <p class="empty-state-hint">Equipment is auto-saved when you use it in a workout</p>
            </div>
        `;
    } else {
        let hasAnyExercise = false;
        for (const bodyPart of BODY_PART_ORDER) {
            const exercises = hierarchy[bodyPart];
            if (!exercises) continue;
            hasAnyExercise = true;

            const exerciseNames = Object.keys(exercises).sort();
            const totalEquipment = exerciseNames.reduce((sum, ex) => sum + exercises[ex].length, 0);
            const config = BODY_PART_CONFIG[bodyPart];

            // Body part header (sticky)
            listHTML += `
                <div class="equip-group-header">
                    <div class="equip-group-header__left">
                        <i class="${config.icon}"></i>
                        <span>${bodyPart}</span>
                    </div>
                    <span class="equip-group-header__count">${exerciseNames.length} exercise${exerciseNames.length !== 1 ? 's' : ''} · ${totalEquipment} machine${totalEquipment !== 1 ? 's' : ''}</span>
                </div>
            `;

            // Exercise rows (collapsible)
            for (const exName of exerciseNames) {
                const equips = exercises[exName];
                const equipId = exName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

                listHTML += `
                    <div class="equip-exercise-row" onclick="toggleEquipmentExercise('${equipId}')">
                        <div class="equip-exercise-row__name">${escapeHtml(exName)}</div>
                        <div class="equip-exercise-row__meta">
                            <span class="equip-exercise-row__count">${equips.length}</span>
                            <i class="fas fa-chevron-down equip-exercise-chevron" id="chevron-${equipId}"></i>
                        </div>
                    </div>
                    <div class="equip-nested-list" id="equip-list-${equipId}" style="display: none;">
                `;

                for (const equip of equips) {
                    const locationNames = (equip.locations || []).join(', ') || '';
                    const brandLabel = equip.brand || '';
                    const subtitle = [brandLabel, locationNames].filter(Boolean).join(' · ');

                    listHTML += `
                        <div class="row-card equip-nested-item" onclick="event.stopPropagation(); openEquipmentDetail('${escapeAttr(equip.id)}')">
                            <div class="equip-nested-item__info">
                                <span class="row-card__title">${escapeHtml(equip.name)}</span>
                                ${subtitle ? `<span class="row-card__subtitle">${escapeHtml(subtitle)}</span>` : ''}
                            </div>
                            <div class="row-card__action"><i class="fas fa-chevron-right"></i></div>
                        </div>
                    `;
                }

                listHTML += `</div>`; // close equip-nested-list
            }
        }

        // Equipment with no exercise associations
        const unlinked = filtered.filter(eq => !eq.exerciseTypes || eq.exerciseTypes.length === 0);
        if (unlinked.length > 0) {
            listHTML += `
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
                const brandLabel = equip.brand || '';
                const subtitle = [brandLabel, locationNames].filter(Boolean).join(' · ');

                listHTML += `
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
            listHTML = `
                <div class="empty-state-compact">
                    <i class="fas fa-wrench"></i>
                    <p>No equipment found</p>
                    <p class="empty-state-hint">Equipment is auto-saved when you use it in a workout</p>
                </div>
            `;
        }
    }

    container.innerHTML = filterHTML + searchHTML + `<div class="equip-lib-list">${listHTML}</div>`;
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

    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

export function filterEquipmentByLocation(location) {
    currentLocationFilter = location;
    renderEquipmentLibrary();
}

export function filterEquipmentBySearch(term) {
    currentSearchTerm = term;
    renderEquipmentLibrary();
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

    const currentType = equipment.equipmentType || 'Other';

    container.innerHTML = `
        <div class="equipment-detail">
            <!-- Sticky header -->
            <div class="page-header">
                <div class="header-left">
                    <button class="back-btn" onclick="backToEquipmentList()" aria-label="Back">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <div class="page-title">${escapeHtml(equipment.name)}</div>
                </div>
                <button class="btn-save" onclick="backToEquipmentList()">Done</button>
            </div>

            <div style="padding: 14px 16px 80px;">
                <!-- Name -->
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

                <!-- Type chips -->
                <div class="field">
                    <div class="field-label">Type</div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
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
                    <div class="field-label">Base weight <span style="color: var(--text-muted); text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 0.7rem;">(empty machine / bar)</span></div>
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
                    <span style="color: var(--primary); font-size: 0.78rem; font-weight: 600; cursor: pointer;"
                          onclick="assignExerciseToEquipment('${escapeAttr(equipmentId)}')">+ Add</span>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
                    ${locations.map(loc => `
                        <div class="chip active" style="padding-right: 6px;">
                            <i class="fas fa-map-marker-alt"></i> ${escapeHtml(loc)}
                        </div>
                    `).join('')}
                    ${locations.length === 0 ? '<span style="font-size: 0.78rem; color: var(--text-muted);">No locations yet</span>' : ''}
                </div>

                <!-- Used for exercises -->
                <div class="sec-head">
                    <h4>Used for <span class="count">${exercises.length} exercise${exercises.length !== 1 ? 's' : ''}</span></h4>
                    <span style="color: var(--primary); font-size: 0.78rem; font-weight: 600; cursor: pointer;"
                          onclick="assignExerciseToEquipment('${escapeAttr(equipmentId)}')">+ Assign</span>
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
                <textarea class="form-input" style="resize: none; min-height: 60px;"
                          placeholder="e.g., Setting 5 for chest fly, setting 8 for pushdown"
                          oninput="saveEquipmentNotes('${escapeAttr(equipmentId)}', this.value)">${escapeHtml(notes)}</textarea>

                <!-- Delete -->
                <div style="margin-top: 24px; text-align: center;">
                    <button style="background: transparent; border: none; color: var(--danger); font-size: 0.82rem; font-weight: 600; cursor: pointer;"
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
// ADD EQUIPMENT FLOW
// ===================================================================

// Known brands for autocomplete
const KNOWN_BRANDS = [
    'Pannatta', 'Hammer Strength', 'Life Fitness', 'Cybex', 'Nautilus',
    'Precor', 'Technogym', 'Rogue', 'Atlantis', 'Hoist', 'Matrix',
    'Star Trac', 'Body-Solid', 'Arsenal Strength', 'Prime Fitness',
    'REP Fitness', 'Eleiko', 'Concept2', 'AssaultFitness',
];

const EQUIPMENT_TYPES_LIST = ['Machine', 'Barbell', 'Dumbbell', 'Cable', 'Bench', 'Rack', 'Bodyweight', 'Other'];

/** Equipment types that have a meaningful base/bar weight */
const BASE_WEIGHT_TYPES = ['Machine', 'Barbell', 'Cable', 'Bench', 'Rack'];

/** Suggested default base weights when switching type */
const BASE_WEIGHT_SUGGESTIONS = {
    Barbell: 45,
    Cable: 5,
};

function getExistingBrands() {
    const brands = [...new Set(allEquipment.map(e => e.brand).filter(Boolean))];
    return [...new Set([...KNOWN_BRANDS, ...brands])].sort();
}

function generateEquipmentDisplayName(brand, model, func) {
    const parts = [brand, model].filter(Boolean).join(' ');
    if (parts && func) return `${parts} — ${func}`;
    if (func) return func;
    return parts || 'Unnamed Equipment';
}

export function showAddEquipmentFlow() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    const brands = getExistingBrands();
    const existingFunctions = [...new Set(allEquipment.flatMap(e => e.exerciseTypes || []))].sort();

    container.innerHTML = `
        <div style="padding: var(--pad-page);">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: var(--gap-section);">
                <button class="btn-icon" onclick="backToEquipmentList()" aria-label="Back">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <h3 style="flex: 1; margin: 0;">Add Equipment</h3>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-16);">
                <label class="form-label">Brand</label>
                <input type="text" id="equip-brand" class="form-input"
                    placeholder="e.g., Hammer Strength, Rogue"
                    list="brand-suggestions"
                    oninput="updateEquipNamePreview()">
                <datalist id="brand-suggestions">
                    ${brands.map(b => `<option value="${escapeAttr(b)}">`).join('')}
                </datalist>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-16);">
                <label class="form-label">Model / Line <span style="color: var(--text-muted); font-weight: 400;">(optional)</span></label>
                <input type="text" id="equip-model" class="form-input"
                    placeholder="e.g., Monolith, Plate-Loaded"
                    oninput="updateEquipNamePreview()">
            </div>

            <div class="form-group" style="margin-bottom: var(--space-16);">
                <label class="form-label">What is it?</label>
                <input type="text" id="equip-function" class="form-input"
                    placeholder="e.g., Leg Press, Lat Pulldown"
                    list="function-suggestions"
                    oninput="updateEquipNamePreview()">
                <datalist id="function-suggestions">
                    ${existingFunctions.map(f => `<option value="${escapeAttr(f)}">`).join('')}
                </datalist>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-16);">
                <label class="form-label">Type</label>
                <div style="display: flex; flex-wrap: wrap; gap: var(--space-8);">
                    ${EQUIPMENT_TYPES_LIST.map(t => `
                        <button class="btn btn-secondary btn-small equip-type-btn" data-type="${t}"
                            onclick="selectEquipType(this, '${t}')">
                            ${t}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div style="background: var(--bg-card-hi); border-radius: var(--radius-sm); padding: var(--space-12); margin-bottom: var(--space-24);">
                <span style="font-size: var(--font-xs); color: var(--text-muted);">Preview:</span>
                <strong id="equip-name-preview" style="display: block; margin-top: var(--space-4); color: var(--text-strong);">—</strong>
            </div>

            <button class="btn btn-primary" style="width: 100%;" onclick="confirmAddEquipment()">
                <i class="fas fa-plus"></i> Add Equipment
            </button>
        </div>
    `;
}

let selectedEquipType = 'Machine';

export function selectEquipType(btn, type) {
    selectedEquipType = type;
    document.querySelectorAll('.equip-type-btn').forEach(b => b.classList.remove('btn-primary'));
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
    // Remove btn-secondary from selected, add to others
    document.querySelectorAll('.equip-type-btn').forEach(b => {
        if (b !== btn) {
            b.classList.remove('btn-primary');
            b.classList.add('btn-secondary');
        }
    });
}

export function updateEquipNamePreview() {
    const brand = document.getElementById('equip-brand')?.value?.trim() || '';
    const model = document.getElementById('equip-model')?.value?.trim() || '';
    const func = document.getElementById('equip-function')?.value?.trim() || '';
    const preview = document.getElementById('equip-name-preview');
    if (preview) {
        preview.textContent = generateEquipmentDisplayName(brand, model, func) || '—';
    }
}

export async function confirmAddEquipment() {
    const brand = document.getElementById('equip-brand')?.value?.trim() || '';
    const model = document.getElementById('equip-model')?.value?.trim() || '';
    const func = document.getElementById('equip-function')?.value?.trim() || '';
    const name = generateEquipmentDisplayName(brand, model, func);

    if (!name || name === 'Unnamed Equipment') {
        showNotification('Please fill in at least one field', 'error');
        return;
    }

    // Set default base weight based on equipment type
    const defaultBW = BASE_WEIGHT_SUGGESTIONS[selectedEquipType] || 0;

    try {
        const result = await getManager().getOrCreateEquipment(name, {
            brand: brand || null,
            model: model || null,
            function: func || null,
            equipmentType: selectedEquipType,
            baseWeight: defaultBW,
            baseWeightUnit: 'lbs',
        });
        if (result) {
            allEquipment = await getManager().getUserEquipment();
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
