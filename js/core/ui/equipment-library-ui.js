// Equipment Library UI Module - core/ui/equipment-library-ui.js
// Gym-centric equipment management page

import { AppState } from '../utils/app-state.js';
import { showNotification, escapeHtml, escapeAttr, openModal, closeModal } from './ui-helpers.js';
import { db, doc, updateDoc, arrayUnion, arrayRemove, deleteField, getDoc } from '../data/firebase-config.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';

let workoutManager = null;
let allEquipment = [];
let currentLocationFilter = 'all';
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

// ===================================================================
// EQUIPMENT LIST PAGE
// ===================================================================

export async function openEquipmentLibrary() {
    const section = document.getElementById('equipment-library-section');
    if (!section) return;

    section.classList.remove('hidden');

    // Load data
    allEquipment = await getManager().getUserEquipment();

    renderEquipmentLibrary();
}

function renderEquipmentLibrary() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Collect all locations
    const locationSet = new Set();
    allEquipment.forEach(eq => {
        (eq.locations || []).forEach(l => locationSet.add(l));
        if (eq.location) locationSet.add(eq.location);
    });
    const locations = Array.from(locationSet).sort();

    // Filter by search
    let filtered = allEquipment;
    if (currentSearchTerm) {
        const term = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(eq =>
            eq.name?.toLowerCase().includes(term) ||
            (eq.exerciseTypes || []).some(t => t.toLowerCase().includes(term))
        );
    }

    // Filter by location
    if (currentLocationFilter !== 'all') {
        filtered = filtered.filter(eq =>
            (eq.locations || []).includes(currentLocationFilter) ||
            eq.location === currentLocationFilter
        );
    }

    // Group equipment by primary location
    const grouped = new Map();
    filtered.forEach(eq => {
        const locs = eq.locations?.length ? eq.locations : (eq.location ? [eq.location] : ['No Location']);
        // Use first location as primary group
        const primary = locs[0];
        if (!grouped.has(primary)) grouped.set(primary, []);
        grouped.get(primary).push(eq);
    });

    // Build search + filter bar
    const searchHTML = `
        <div class="equip-lib-toolbar">
            <div class="equip-lib-search">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Search equipment..."
                       value="${escapeAttr(currentSearchTerm)}"
                       oninput="filterEquipmentBySearch(this.value)">
            </div>
            ${locations.length > 1 ? `
                <select class="equip-lib-filter" onchange="filterEquipmentByLocation(this.value)">
                    <option value="all" ${currentLocationFilter === 'all' ? 'selected' : ''}>All Gyms (${allEquipment.length})</option>
                    ${locations.map(loc => {
                        const count = allEquipment.filter(eq =>
                            (eq.locations || []).includes(loc) || eq.location === loc
                        ).length;
                        return `<option value="${escapeAttr(loc)}" ${currentLocationFilter === loc ? 'selected' : ''}>${escapeHtml(loc)} (${count})</option>`;
                    }).join('')}
                </select>
            ` : ''}
        </div>
    `;

    // Build grouped list
    let listHTML = '';
    if (filtered.length === 0) {
        listHTML = `
            <div class="empty-state">
                <i class="fas fa-wrench"></i>
                <h3>No Equipment</h3>
                <p>${currentSearchTerm ? 'No matches found' : 'Equipment you use during workouts will appear here.'}</p>
            </div>
        `;
    } else {
        for (const [location, items] of grouped) {
            // Group by brand within each location
            const byBrand = {};
            items.forEach(eq => {
                const brand = eq.brand || 'Other';
                if (!byBrand[brand]) byBrand[brand] = [];
                byBrand[brand].push(eq);
            });

            // Sort brands alphabetically, "Other" last
            const sortedBrands = Object.keys(byBrand).sort((a, b) => {
                if (a === 'Other') return 1;
                if (b === 'Other') return -1;
                return a.localeCompare(b);
            });

            // Sort items within each brand alphabetically
            sortedBrands.forEach(brand => {
                byBrand[brand].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            });

            const hasBrands = sortedBrands.length > 1 || (sortedBrands.length === 1 && sortedBrands[0] !== 'Other');

            listHTML += `
                <div class="equip-lib-group">
                    <div class="equip-lib-group-header">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${escapeHtml(location)}</span>
                        <span class="equip-lib-group-count">${items.length}</span>
                    </div>
                    ${hasBrands ? sortedBrands.map(brand => `
                        <div class="equip-brand-group">
                            <div class="equip-brand-header">
                                <span class="equip-brand-name">${escapeHtml(brand)}</span>
                                <span class="equip-brand-count">${byBrand[brand].length}</span>
                            </div>
                            ${byBrand[brand].map(eq => renderEquipmentRow(eq)).join('')}
                        </div>
                    `).join('') : items.map(eq => renderEquipmentRow(eq)).join('')}
                </div>
            `;
        }
    }

    container.innerHTML = searchHTML + `<div class="equip-lib-list">${listHTML}</div>`;
}

function renderEquipmentRow(eq) {
    const typeInfo = EQUIPMENT_TYPE_ICONS[eq.equipmentType] || EQUIPMENT_TYPE_ICONS.Other;
    const exerciseCount = (eq.exerciseTypes || []).length;
    const exerciseNames = (eq.exerciseTypes || []).slice(0, 3).join(', ');
    const extra = exerciseCount > 3 ? ` +${exerciseCount - 3}` : '';

    return `
        <div class="row-card equip-lib-item" onclick="openEquipmentDetail('${escapeAttr(eq.id)}')">
            <div class="row-card__icon" style="background: ${typeInfo.color}20; color: ${typeInfo.color}">
                <i class="fas ${typeInfo.icon}"></i>
            </div>
            <div class="row-card__content">
                <span class="row-card__title">${escapeHtml(eq.name)}</span>
                <span class="row-card__subtitle">${exerciseNames ? escapeHtml(exerciseNames + extra) : 'No exercises assigned'}</span>
            </div>
            <div class="row-card__action">
                <i class="fas fa-chevron-right"></i>
            </div>
        </div>
    `;
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

    container.innerHTML = `
        <div class="equipment-detail" style="padding: var(--pad-page);">
            <!-- Back + name -->
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                <button class="btn-icon" onclick="backToEquipmentList()" aria-label="Back">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <h3 style="flex: 1; margin: 0;">${escapeHtml(equipment.name)}</h3>
                <button class="btn-icon" onclick="deleteEquipmentFromLibrary('${escapeAttr(equipmentId)}')" aria-label="Delete" title="Delete equipment">
                    <i class="fas fa-trash" style="color: var(--danger);"></i>
                </button>
            </div>

            <!-- Type + locations -->
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px;">
                <span class="equipment-type-badge" style="background: ${typeInfo.color}20; color: ${typeInfo.color}">
                    <i class="fas ${typeInfo.icon}"></i> ${equipment.equipmentType || 'Other'}
                </span>
                ${locations.map(loc => `
                    <span class="location-chip">
                        <i class="fas fa-map-marker-alt"></i> ${escapeHtml(loc)}
                    </span>
                `).join('')}
            </div>

            <!-- Exercises section -->
            <div class="section-header" style="margin-bottom: 8px;">
                <h4 class="section-header__title" style="margin: 0;">Exercises</h4>
                <button class="btn-text btn-small" onclick="assignExerciseToEquipment('${escapeAttr(equipmentId)}')">
                    <i class="fas fa-plus"></i> Assign
                </button>
            </div>

            ${exercises.length === 0 ? `
                <div class="empty-state" style="padding: 24px 0;">
                    <p>No exercises assigned yet</p>
                    <button class="btn btn-secondary btn-small" onclick="assignExerciseToEquipment('${escapeAttr(equipmentId)}')">
                        <i class="fas fa-plus"></i> Assign Exercise
                    </button>
                </div>
            ` : exercises.map(ex => `
                <div class="row-card" style="margin-bottom: 6px;">
                    <div class="row-card__content">
                        <span class="row-card__title">${escapeHtml(ex.name)}</span>
                        <span class="row-card__subtitle">
                            ${ex.videoUrl ? '<i class="fas fa-play-circle" style="color: var(--primary);"></i> Video set' : '<i class="fas fa-video-slash"></i> No video'}
                        </span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-text" onclick="editEquipmentExerciseVideoFromLib('${escapeAttr(equipmentId)}', '${escapeAttr(ex.name)}')" title="Set form video">
                            <i class="fas fa-video"></i>
                        </button>
                        <button class="btn-text btn-text-danger" onclick="unassignExercise('${escapeAttr(equipmentId)}', '${escapeAttr(ex.name)}')" title="Remove">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `).join('')}

            <!-- Notes section -->
            <div class="section-header" style="margin: 20px 0 8px;">
                <h4 class="section-header__title" style="margin: 0;">Notes</h4>
            </div>
            <textarea class="form-input" style="width: 100%; min-height: 80px; resize: vertical;"
                      placeholder="e.g., Setting 5 for chest fly, setting 8 for pushdown"
                      oninput="saveEquipmentNotes('${escapeAttr(equipmentId)}', this.value)">${escapeHtml(notes)}</textarea>
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
        listHTML += `<div class="equip-lib-group-header" style="margin-top: 12px;"><span>${escapeHtml(group)}</span><span class="equip-lib-group-count">${items.length}</span></div>`;
        listHTML += items.map(ex => `
            <div class="row-card equip-lib-item" onclick="confirmAssignExercise('${escapeAttr(ex.name)}')">
                <div class="row-card__content">
                    <span class="row-card__title">${escapeHtml(ex.name)}</span>
                </div>
                <div class="row-card__action"><i class="fas fa-plus" style="color: var(--primary);"></i></div>
            </div>
        `).join('');
    }

    container.innerHTML = `
        <div style="padding: var(--pad-page);">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <button class="btn-icon" onclick="openEquipmentDetail('${escapeAttr(equipmentId)}')" aria-label="Back">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <h3 style="flex: 1; margin: 0;">Assign Exercise</h3>
            </div>
            <div class="equip-lib-search" style="margin-bottom: 12px;">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Search exercises..." oninput="filterAssignList(this.value)">
            </div>
            <div id="assign-exercise-list">
                ${exercises.length === 0 ? '<div class="empty-state"><p>All exercises already assigned</p></div>' : listHTML}
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

export async function editEquipmentExerciseVideoFromLib(equipmentId, exerciseName) {
    const equipment = allEquipment.find(e => e.id === equipmentId);
    const currentUrl = equipment?.exerciseVideos?.[exerciseName] || '';

    const newUrl = prompt(`YouTube URL for ${exerciseName}:`, currentUrl);
    if (newUrl === null) return;

    try {
        const userId = AppState.currentUser.uid;
        const equipRef = doc(db, 'users', userId, 'equipment', equipmentId);

        if (newUrl.trim() === '') {
            await updateDoc(equipRef, { [`exerciseVideos.${exerciseName}`]: deleteField() });
            if (equipment?.exerciseVideos) delete equipment.exerciseVideos[exerciseName];
        } else {
            await updateDoc(equipRef, { [`exerciseVideos.${exerciseName}`]: newUrl.trim() });
            if (!equipment.exerciseVideos) equipment.exerciseVideos = {};
            equipment.exerciseVideos[exerciseName] = newUrl.trim();
        }

        showNotification('Video updated', 'success', 1500);
        openEquipmentDetail(equipmentId);
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

    try {
        const result = await getManager().getOrCreateEquipment(name, {
            brand: brand || null,
            model: model || null,
            function: func || null,
            equipmentType: selectedEquipType,
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
