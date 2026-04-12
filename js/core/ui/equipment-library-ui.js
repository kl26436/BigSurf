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
            // Sort items alphabetically within each group
            items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            listHTML += `
                <div class="equip-lib-group">
                    <div class="equip-lib-group-header">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${escapeHtml(location)}</span>
                        <span class="equip-lib-group-count">${items.length}</span>
                    </div>
                    ${items.map(eq => renderEquipmentRow(eq)).join('')}
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

export async function assignExerciseToEquipment(equipmentId) {
    const exercises = AppState.exerciseDatabase || [];
    const equipment = allEquipment.find(e => e.id === equipmentId);
    const existing = new Set(equipment?.exerciseTypes || []);

    // Build a simple picker
    const available = exercises
        .map(ex => ex.name || ex.machine)
        .filter(name => name && !existing.has(name))
        .sort();

    const name = prompt('Exercise name to assign:\n\n' + available.slice(0, 20).join(', ') + (available.length > 20 ? '...' : ''));
    if (!name?.trim()) return;

    try {
        const userId = AppState.currentUser.uid;
        await updateDoc(doc(db, 'users', userId, 'equipment', equipmentId), {
            exerciseTypes: arrayUnion(name.trim()),
        });

        // Update cache
        if (equipment) {
            if (!equipment.exerciseTypes) equipment.exerciseTypes = [];
            equipment.exerciseTypes.push(name.trim());
        }

        showNotification(`Assigned "${name.trim()}"`, 'success', 1500);
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

export async function showAddEquipmentFlow() {
    const name = prompt('Equipment name (e.g., Hammer Strength Flat Bench):');
    if (!name?.trim()) return;

    try {
        const result = await getManager().getOrCreateEquipment(name.trim());
        if (result) {
            // Refresh list and open detail
            allEquipment = await getManager().getUserEquipment();
            showNotification('Equipment added', 'success', 1500);
            openEquipmentDetail(result.id);
        }
    } catch (error) {
        console.error('Error adding equipment:', error);
        showNotification('Failed to add equipment', 'error');
    }
}
