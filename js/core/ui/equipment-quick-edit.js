// Equipment Quick-Edit Sheet - core/ui/equipment-quick-edit.js
//
// Tier 3 Phase 7 / traveler-flow F5: the equipment detail view is a full-page
// form — right for deliberate curation, wrong for "fix this machine's name"
// or "this also does rows" mid-flow. This sheet does the 80% of edits with
// 20% of the navigation: rename, exercise-link chips, gym-tag chips, and a
// "Full details" escape to the big form.
//
// Standalone module (natural seam per multigym-assessment tech-debt note):
// all writes go through FirebaseWorkoutManager so Tier 0/1 mirroring keeps
// working, and every save path ends by refreshing AppState._cachedEquipment.

import { AppState } from '../utils/app-state.js';
import { showNotification, escapeHtml, escapeAttr } from './ui-helpers.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';

let state = null;
// Shape: { equipmentId, original, name, exerciseTypes: [], locations: [],
//          contextExercise, addExerciseQuery }

/**
 * Open the quick-edit sheet for an equipment doc (by name or doc object).
 * `contextExercise` — the exercise the user is currently on, offered as a
 * one-tap suggested link when not already linked.
 */
export async function openEquipmentQuickEdit(equipmentName, { contextExercise = null } = {}) {
    let equipment = (AppState._cachedEquipment || [])
        .find(eq => (eq.name || '').toLowerCase() === (equipmentName || '').toLowerCase());
    if (!equipment) {
        try {
            const mgr = new FirebaseWorkoutManager(AppState);
            AppState._cachedEquipment = await mgr.getUserEquipment();
            equipment = AppState._cachedEquipment
                .find(eq => (eq.name || '').toLowerCase() === (equipmentName || '').toLowerCase());
        } catch { /* fall through to the not-found notification */ }
    }
    if (!equipment?.id) {
        showNotification('Equipment not found', 'error');
        return;
    }

    state = {
        equipmentId: equipment.id,
        original: equipment,
        name: equipment.name || '',
        exerciseTypes: [...(equipment.exerciseTypes || [])],
        locations: [...(equipment.locations || [])],
        contextExercise: contextExercise || null,
        addExerciseQuery: '',
    };
    renderSheet();
}

function renderSheet() {
    closeImmediate();
    if (!state) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'qe-sheet-backdrop';
    backdrop.onclick = () => closeEquipmentQuickEdit();

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'qe-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Edit equipment');
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">Edit equipment</div>
            <div class="aw-sheet__subtitle">${escapeHtml(state.original.name || '')}</div>
        </div>
        <div class="aw-sheet__body" id="qe-sheet-body">${renderBody()}</div>
        <div class="aw-sheet__actions">
            <button class="aw-sheet__action" onclick="qeOpenFullDetails()">Full details</button>
            <button class="aw-sheet__action primary" onclick="qeSave()">Save</button>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => {
        backdrop.classList.add('visible');
        sheet.classList.add('visible');
    });
}

function renderBody() {
    if (!state) return '';

    // Exercise-link chips + suggested chip for the in-context exercise
    const exerciseChips = state.exerciseTypes.map((name, i) => `
        <span class="qe-chip">
            ${escapeHtml(name)}
            <button type="button" class="qe-chip__remove" onclick="qeRemoveExercise(${i})" aria-label="Unlink ${escapeAttr(name)}">
                <i class="fas fa-times"></i>
            </button>
        </span>
    `).join('');
    const suggestChip = (state.contextExercise && !state.exerciseTypes.includes(state.contextExercise))
        ? `<button type="button" class="qe-chip qe-chip--add" onclick="qeAddExercise('${escapeAttr(state.contextExercise)}')">
               <i class="fas fa-plus"></i> ${escapeHtml(state.contextExercise)}
           </button>`
        : '';

    // Exercise search input backed by the library datalist
    const libraryOptions = (AppState.exerciseDatabase || [])
        .map(ex => ex.name || ex.machine)
        .filter(n => n && !state.exerciseTypes.includes(n))
        .slice(0, 400)
        .map(n => `<option value="${escapeAttr(n)}">`)
        .join('');

    // Gym-tag chips + add-chips for untagged saved gyms
    const gymChips = state.locations.map((name, i) => `
        <span class="qe-chip">
            <i class="fas fa-map-marker-alt"></i> ${escapeHtml(name)}
            <button type="button" class="qe-chip__remove" onclick="qeRemoveGym(${i})" aria-label="Remove from ${escapeAttr(name)}">
                <i class="fas fa-times"></i>
            </button>
        </span>
    `).join('');
    const knownGyms = new Set();
    (AppState._cachedEquipment || []).forEach(eq =>
        (eq.locations || []).forEach(l => l && knownGyms.add(l))
    );
    const addGymChips = [...knownGyms]
        .filter(g => !state.locations.includes(g))
        .sort()
        .slice(0, 6)
        .map(g => `
            <button type="button" class="qe-chip qe-chip--add" onclick="qeAddGym('${escapeAttr(g)}')">
                <i class="fas fa-plus"></i> ${escapeHtml(g)}
            </button>
        `).join('');

    return `
        <div class="qe-field">
            <div class="qe-field__label">Name</div>
            <input type="text" class="qe-field__input" id="qe-name-input"
                   value="${escapeAttr(state.name)}" oninput="qeSetName(this.value)">
        </div>
        <div class="qe-field">
            <div class="qe-field__label">Exercises</div>
            <div class="qe-chips">${exerciseChips}${suggestChip}</div>
            <div class="qe-add-row">
                <input type="text" class="qe-field__input" id="qe-exercise-input" list="qe-exercise-list"
                       placeholder="Link an exercise…" oninput="qeSetExerciseQuery(this.value)">
                <datalist id="qe-exercise-list">${libraryOptions}</datalist>
                <button type="button" class="qe-add-row__btn" onclick="qeAddTypedExercise()" aria-label="Add exercise link">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        </div>
        <div class="qe-field">
            <div class="qe-field__label">Gyms</div>
            <div class="qe-chips">${gymChips}${addGymChips}</div>
        </div>
    `;
}

function rerenderBody() {
    const body = document.getElementById('qe-sheet-body');
    if (body) body.innerHTML = renderBody();
}

function closeImmediate() {
    document.getElementById('qe-sheet-backdrop')?.remove();
    document.getElementById('qe-sheet')?.remove();
}

export function closeEquipmentQuickEdit() {
    const backdrop = document.getElementById('qe-sheet-backdrop');
    const sheet = document.getElementById('qe-sheet');
    backdrop?.classList.remove('visible');
    sheet?.classList.remove('visible');
    setTimeout(closeImmediate, 300);
    state = null;
}

// ── Field handlers (window-wired below; rendered from this module only) ──

function qeSetName(v) { if (state) state.name = v; }
function qeSetExerciseQuery(v) { if (state) state.addExerciseQuery = v; }

function qeAddExercise(name) {
    if (!state || !name) return;
    if (!state.exerciseTypes.includes(name)) state.exerciseTypes.push(name);
    rerenderBody();
}

function qeAddTypedExercise() {
    const name = (state?.addExerciseQuery || '').trim();
    if (!name) return;
    state.addExerciseQuery = '';
    qeAddExercise(name);
}

function qeRemoveExercise(i) {
    if (!state) return;
    state.exerciseTypes.splice(i, 1);
    rerenderBody();
}

function qeAddGym(name) {
    if (!state || !name) return;
    if (!state.locations.includes(name)) state.locations.push(name);
    rerenderBody();
}

function qeRemoveGym(i) {
    if (!state) return;
    state.locations.splice(i, 1);
    rerenderBody();
}

async function qeOpenFullDetails() {
    const id = state?.equipmentId;
    closeEquipmentQuickEdit();
    if (!id) return;
    // Hand the library's own async paint a target so it renders THIS equipment's
    // detail — no setTimeout guess racing the library's Firestore reads (the old
    // 200ms guess lost whenever those reads ran long, painting the list over us).
    try {
        const m = await import('./equipment-library-ui.js');
        m.setPendingEquipmentDetail(id);
    } catch { /* fall through — navigateTo still lands on the library list */ }
    if (typeof window.navigateTo === 'function') window.navigateTo('equipment-library');
}

async function qeSave() {
    const st = state;
    if (!st) { closeEquipmentQuickEdit(); return; }
    const original = st.original;
    closeEquipmentQuickEdit();

    try {
        const mgr = new FirebaseWorkoutManager(AppState);
        const newName = (st.name || '').trim() || original.name;

        await mgr.updateEquipment(st.equipmentId, {
            name: newName,
            exerciseTypes: st.exerciseTypes,
            locations: st.locations,
        });

        // Tier 0.1 mirror: gym-tag changes on a catalog-promoted doc must
        // reflect onto each gym's location.equipment[] array too.
        if (original.catalogRef) {
            const before = new Set(original.locations || []);
            const after = new Set(st.locations);
            const added = [...after].filter(g => !before.has(g));
            const removed = [...before].filter(g => !after.has(g));
            if (added.length || removed.length) {
                try {
                    const locs = await mgr.getUserLocations();
                    const byName = new Map(locs.map(l => [l.name, l]));
                    for (const gym of added) {
                        const loc = byName.get(gym);
                        if (loc?.id) await mgr.addLocationEquipment(loc.id, [{ catalogRef: original.catalogRef }]);
                    }
                    for (const gym of removed) {
                        const loc = byName.get(gym);
                        if (loc?.id) await mgr.removeLocationEquipment(loc.id, original.catalogRef);
                    }
                } catch (e) {
                    // Non-fatal: docs are the source of truth; arrays heal on render.
                    console.error('Quick-edit catalogRef mirror failed:', e);
                }
            }
        }

        AppState._cachedEquipment = await mgr.getUserEquipment();
        showNotification(`${newName} updated`, 'success');
        // Refresh whichever surface is behind the sheet.
        if (typeof window.renderActiveWorkout === 'function' && AppState.currentWorkout) {
            window.renderActiveWorkout();
        }
    } catch (e) {
        console.error('Quick-edit save failed:', e);
        showNotification("Couldn't save — try again", 'error');
    }
}

// Same-file window wiring (cache-skew rule): every handler above is rendered
// only by this module's own template strings.
window.openEquipmentQuickEdit = openEquipmentQuickEdit;
window.closeEquipmentQuickEdit = closeEquipmentQuickEdit;
window.qeSetName = qeSetName;
window.qeSetExerciseQuery = qeSetExerciseQuery;
window.qeAddExercise = qeAddExercise;
window.qeAddTypedExercise = qeAddTypedExercise;
window.qeRemoveExercise = qeRemoveExercise;
window.qeAddGym = qeAddGym;
window.qeRemoveGym = qeRemoveGym;
window.qeOpenFullDetails = qeOpenFullDetails;
window.qeSave = qeSave;
