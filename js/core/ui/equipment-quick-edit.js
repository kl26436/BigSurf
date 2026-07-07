// Equipment Quick-Edit Sheet - core/ui/equipment-quick-edit.js
//
// Tier 3 Phase 7 / traveler-flow F5: the equipment detail view is a full-page
// form — right for deliberate curation, wrong for "fix this machine's name"
// or "this also does rows" mid-flow. This sheet does the 80% of edits with
// 20% of the navigation: name + brand/line/function rows (which regenerate the
// composed name while it's still derived), exercise-link chips, gym-tag chips,
// and a "Full details" escape to the big form.
//
// Standalone module (natural seam per multigym-assessment tech-debt note):
// all writes go through FirebaseWorkoutManager (the equipment doc is the sole
// source of truth for gym tags — 8b step 4), and every save path ends by
// refreshing AppState._cachedEquipment.

import { AppState } from '../utils/app-state.js';
import { showNotification, escapeHtml, escapeAttr } from './ui-helpers.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { composeEquipmentName } from '../utils/equipment-name.js';

let state = null;
// Shape: { equipmentId, original, name, brand, line, function,
//          exerciseTypes: [], locations: [], contextExercise, addExerciseQuery }

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
        brand: equipment.brand && equipment.brand !== 'Unknown' ? equipment.brand : '',
        line: equipment.line || '',
        function: equipment.function || '',
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
            <div class="qe-field__hint">Auto-fills from brand, line, and function below.</div>
        </div>
        <div class="qe-field-row">
            <div class="qe-field qe-field--third">
                <div class="qe-field__label">Brand</div>
                <input type="text" class="qe-field__input" id="qe-brand-input"
                       placeholder="e.g. Hammer Strength"
                       value="${escapeAttr(state.brand)}" oninput="qeSetField('brand', this.value)">
            </div>
            <div class="qe-field qe-field--third">
                <div class="qe-field__label">Line</div>
                <input type="text" class="qe-field__input" id="qe-line-input"
                       placeholder="e.g. Fit Evo"
                       value="${escapeAttr(state.line)}" oninput="qeSetField('line', this.value)">
            </div>
            <div class="qe-field qe-field--third">
                <div class="qe-field__label">Function</div>
                <input type="text" class="qe-field__input" id="qe-function-input"
                       placeholder="e.g. Chest press"
                       value="${escapeAttr(state.function)}" oninput="qeSetField('function', this.value)">
            </div>
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

// Editing brand/line/function regenerates the composed name and reflects it in
// the Name input live. No full re-render (that would blur the field mid-type) —
// just patch state and the Name input's value directly.
//
// Guard: only auto-fill while the Name is still DERIVED (empty, or equal to
// what the previous field values compose to). Once the user hand-types a name,
// it has diverged and brand/line/function edits must not stomp it.
function qeSetField(field, v) {
    if (!state) return;
    const prevComposed = composeEquipmentName({
        brand: state.brand, line: state.line, function: state.function,
    });
    state[field] = v;
    const nameIsDerived = !state.name || state.name === prevComposed;
    if (!nameIsDerived) return;
    const composed = composeEquipmentName({
        brand: state.brand, line: state.line, function: state.function,
    });
    if (composed) {
        state.name = composed;
        const nameInput = document.getElementById('qe-name-input');
        if (nameInput) nameInput.value = composed;
    }
}

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
            brand: (st.brand || '').trim() || null,
            line: (st.line || '').trim() || null,
            function: (st.function || '').trim() || null,
            exerciseTypes: st.exerciseTypes,
            locations: st.locations,
        });

        // (Phase 8b step 4: the location.equipment[] catalogRef mirror was
        // removed — the equipment doc's locations[]/locationIds[] written above
        // is the single source of truth for where this machine lives.)

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
window.qeSetField = qeSetField;
window.qeSetExerciseQuery = qeSetExerciseQuery;
window.qeAddExercise = qeAddExercise;
window.qeAddTypedExercise = qeAddTypedExercise;
window.qeRemoveExercise = qeRemoveExercise;
window.qeAddGym = qeAddGym;
window.qeRemoveGym = qeRemoveGym;
window.qeOpenFullDetails = qeOpenFullDetails;
window.qeSave = qeSave;
