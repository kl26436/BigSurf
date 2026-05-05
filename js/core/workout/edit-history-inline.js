// edit-history-inline.js
// Inline historical-workout edit flow.
//
// Replaces the heavyweight `editHistoricalWorkout` path (which loaded a
// historical workout into the live active-workout UI). Instead, the existing
// detail modal switches into an edit mode in place — no header swap, no nav
// hide, no AppState pollution. All edits stay local until "Save changes".
//
// Entry: `enterHistoricalEditMode(docId)` (replaces editWorkout data-action).
// Exit:  `saveHistoricalEdits()` or `discardHistoricalEdits()`.
// Spec:  docs/edit-history-redesign.md

import { AppState } from '../utils/app-state.js';
import { loadWorkoutById, updateHistoricalWorkout } from '../data/data-manager.js';
import { displayWeight, escapeHtml, escapeAttr, showNotification } from '../ui/ui-helpers.js';
import { getCategoryIcon } from '../utils/config.js';
import { openSharedAddExerciseSheet, openSharedEquipmentSheet } from './active-workout-ui.js';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

// editState shape (in-memory only — see deriveSavePayload before persisting):
// {
//   docId: string,
//   workoutType: string,
//   displayDate: string,
//   exercises: { exercise_0: { name, equipment, equipmentLocation?, sets: [], notes, completed, displayUnit, _originalKey: string|null } },
//   originalWorkout: { exercises: [ { machine, name, sets, reps, weight, equipment, ... } ] } | null,
// }
let editState = null;

// Frozen deep clone taken at edit-mode entry. Used for dirty diffing and discard.
let originalState = null;

// Currently-editing set inputs. While set, that row renders inputs; on commit
// the draft values are written back into editState.exercises[key].sets[idx].
// Shape: { exerciseKey, setIndex, draftReps: string, draftWeight: string }
let editingSet = null;

// Holds the most recently removed set so the undo toast can restore it.
// Shape: { exerciseKey, setIndex, set, expiresAt }
let pendingUndo = null;
let pendingUndoTimer = null;

// ---------------------------------------------------------------------------
// Public entry / exit
// ---------------------------------------------------------------------------

export async function enterHistoricalEditMode(docId) {
    if (!AppState.currentUser) {
        showNotification('Sign in to edit workouts', 'error');
        return;
    }
    if (!docId) {
        console.error('enterHistoricalEditMode: missing docId');
        return;
    }

    const workoutData = await loadWorkoutById(AppState, docId);
    if (!workoutData) {
        showNotification("Couldn't load workout", 'error');
        return;
    }

    editState = buildEditStateFromWorkout(docId, workoutData);
    originalState = deepClone(editState);
    editingSet = null;
    clearPendingUndo();

    // Make sure the detail section is visible — caller might have come from
    // the calendar modal which uses a different element.
    const section = document.getElementById('workout-detail-section');
    if (section && section.classList.contains('hidden')) {
        section.classList.remove('hidden');
    }

    renderEditMode();
}

export async function saveHistoricalEdits() {
    if (!editState) return;
    // Auto-commit any in-flight set edit so the user doesn't lose typed-but-
    // not-confirmed values when they tap Save.
    if (editingSet) {
        wehCommitSet(editingSet.exerciseKey, editingSet.setIndex);
    }
    if (dirtyCount() === 0) return;

    const patch = deriveSavePayload(editState);

    try {
        await updateHistoricalWorkout(AppState, editState.docId, patch);
    } catch (err) {
        console.error('❌ Failed to save historical edits:', err);
        showNotification("Couldn't save changes — try again", 'error');
        return;
    }

    // Refresh the in-memory history list so the read-only modal renders fresh
    // values immediately. The all-workouts cache was already cleared inside
    // updateHistoricalWorkout.
    if (window.workoutHistory) {
        try {
            await window.workoutHistory.loadHistory();
            await window.workoutHistory.loadCalendarWorkouts?.();
            window.workoutHistory.updateCalendarDisplay?.();
        } catch (e) {
            console.warn('History refresh after edit failed:', e);
        }
    }

    const docId = editState.docId;
    editState = null;
    originalState = null;
    editingSet = null;
    clearPendingUndo();

    // Re-open the read-only modal with the fresh data.
    if (window.workoutHistory) {
        const fresh = (window.workoutHistory.currentHistory || []).find(
            (w) => (w.docId || w.id) === docId
        );
        if (fresh && typeof window.workoutHistory.showFixedWorkoutModal === 'function') {
            window.workoutHistory.showFixedWorkoutModal(fresh, 0);
        }
    }

    showNotification('Changes saved', 'success');
}

export function discardHistoricalEdits() {
    if (!editState) return;

    const n = dirtyCount();
    if (n > 0) {
        const ok = confirm(`Discard ${n} unsaved ${n === 1 ? 'change' : 'changes'}?`);
        if (!ok) return;
    }

    const docId = editState.docId;
    editState = null;
    originalState = null;
    editingSet = null;
    clearPendingUndo();

    // Restore the read-only modal.
    if (window.workoutHistory) {
        const fresh = (window.workoutHistory.currentHistory || []).find(
            (w) => (w.docId || w.id) === docId
        );
        if (fresh && typeof window.workoutHistory.showFixedWorkoutModal === 'function') {
            window.workoutHistory.showFixedWorkoutModal(fresh, 0);
            return;
        }
    }
    // Fall back to closing the section.
    if (window.workoutHistory?.closeWorkoutDetailModal) {
        window.workoutHistory.closeWorkoutDetailModal();
    }
}

// Used by the section's back button (window.closeWorkoutDetailModal in main.js)
// to avoid silent loss of unsaved edits. Returns true if the caller should
// proceed with closing, false if the user cancelled the discard.
export function requestExitEditMode() {
    if (!editState) return true;
    const n = dirtyCount();
    if (n > 0) {
        const ok = confirm(`Discard ${n} unsaved ${n === 1 ? 'change' : 'changes'}?`);
        if (!ok) return false;
    }
    editState = null;
    originalState = null;
    editingSet = null;
    clearPendingUndo();
    return true;
}

export function isInEditMode() {
    return !!editState;
}

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

function buildEditStateFromWorkout(docId, workoutData) {
    const rawExercises = workoutData.exercises || {};
    const rawOriginal = workoutData.originalWorkout?.exercises || null;

    // Order keys so exercise_N indices stay contiguous regardless of how the
    // legacy data was saved.
    const orderedKeys = Object.keys(rawExercises).sort((a, b) => {
        const ai = parseInt(a.split('_')[1], 10);
        const bi = parseInt(b.split('_')[1], 10);
        return (isNaN(ai) ? 0 : ai) - (isNaN(bi) ? 0 : bi);
    });

    const exercises = {};
    orderedKeys.forEach((key, i) => {
        const e = rawExercises[key] || {};
        const newKey = `exercise_${i}`;
        const sets = Array.isArray(e.sets) ? e.sets.map(normalizeSet) : [];
        const name = workoutData.exerciseNames?.[key]
            || e.name
            || rawOriginal?.[i]?.name
            || rawOriginal?.[i]?.machine
            || 'Exercise';
        exercises[newKey] = {
            name,
            equipment: e.equipment || rawOriginal?.[i]?.equipment || null,
            equipmentLocation: e.equipmentLocation || rawOriginal?.[i]?.equipmentLocation || null,
            sets,
            notes: e.notes || '',
            completed: e.completed !== false,
            displayUnit: deriveDisplayUnitForSets(sets),
            _originalKey: newKey,
        };
    });

    // Rebuild originalWorkout.exercises in array form, contiguous.
    const originalWorkout = rawOriginal
        ? {
            ...workoutData.originalWorkout,
            exercises: orderedKeys.map((key, i) => {
                const src = rawOriginal[i] || {};
                return {
                    machine: src.machine || src.name || exercises[`exercise_${i}`].name,
                    name: src.name || src.machine || exercises[`exercise_${i}`].name,
                    sets: src.sets ?? exercises[`exercise_${i}`].sets.length,
                    reps: src.reps ?? 10,
                    weight: src.weight ?? 0,
                    video: src.video || '',
                    equipment: exercises[`exercise_${i}`].equipment,
                    equipmentLocation: exercises[`exercise_${i}`].equipmentLocation,
                };
            }),
        }
        : null;

    let displayDate = '';
    if (workoutData.date && /^\d{4}-\d{2}-\d{2}$/.test(workoutData.date)) {
        const safe = new Date(workoutData.date + 'T12:00:00');
        displayDate = safe.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    }

    return {
        docId,
        workoutType: workoutData.workoutType || 'Workout',
        displayDate,
        exercises,
        originalWorkout,
    };
}

function normalizeSet(s) {
    return {
        reps: s.reps ?? null,
        weight: s.weight ?? null,
        originalUnit: s.originalUnit || 'lbs',
        type: s.type || 'working',
        completed: s.completed !== false,
    };
}

function deriveDisplayUnitForSets(sets) {
    const counts = { lbs: 0, kg: 0 };
    (sets || []).forEach((s) => {
        const u = s.originalUnit === 'kg' ? 'kg' : 'lbs';
        counts[u]++;
    });
    if (counts.kg > counts.lbs) return 'kg';
    if (counts.lbs > 0) return 'lbs';
    return AppState.globalUnit || 'lbs';
}

// ---------------------------------------------------------------------------
// Save payload
// ---------------------------------------------------------------------------

function deriveSavePayload(state) {
    const exercises = {};
    const exerciseNames = {};
    Object.keys(state.exercises).forEach((key) => {
        const e = state.exercises[key];
        exercises[key] = {
            name: e.name,
            equipment: e.equipment || null,
            equipmentLocation: e.equipmentLocation || null,
            sets: (e.sets || []).map((s) => ({
                reps: s.reps ?? null,
                weight: s.weight ?? null,
                originalUnit: s.originalUnit || 'lbs',
                type: s.type || 'working',
                completed: s.completed !== false,
            })),
            notes: e.notes || '',
            completed: e.completed !== false,
        };
        exerciseNames[key] = e.name;
    });

    const patch = {
        exercises,
        exerciseNames,
        lastUpdated: new Date().toISOString(),
    };
    if (state.originalWorkout) {
        patch.originalWorkout = state.originalWorkout;
    }
    return patch;
}

// `deriveExerciseNames` is exported separately for the unit tests.
export function deriveExerciseNames(state) {
    const names = {};
    Object.keys(state.exercises).forEach((key) => {
        names[key] = state.exercises[key].name;
    });
    return names;
}

// ---------------------------------------------------------------------------
// Diff / dirty count
// ---------------------------------------------------------------------------

export function dirtyCount() {
    if (!editState || !originalState) return 0;
    return countDiffs(originalState, editState);
}

function countDiffs(orig, edit) {
    let n = 0;

    // Map original exercises by their stable identity. Each original exercise
    // is its own _originalKey. Edited exercises that share an _originalKey
    // map to the same original; null _originalKey marks an addition.
    const origByKey = {};
    Object.keys(orig.exercises).forEach((key) => {
        origByKey[orig.exercises[key]._originalKey || key] = orig.exercises[key];
    });

    const seen = new Set();
    Object.keys(edit.exercises).forEach((key) => {
        const e = edit.exercises[key];
        const o = e._originalKey ? origByKey[e._originalKey] : null;
        if (!o) {
            n++; // added exercise
            return;
        }
        seen.add(e._originalKey);
        if (normalizeStr(o.equipment) !== normalizeStr(e.equipment)) n++;
        if (normalizeStr(o.notes) !== normalizeStr(e.notes)) n++;
        const oSets = o.sets || [];
        const eSets = e.sets || [];
        const max = Math.max(oSets.length, eSets.length);
        for (let i = 0; i < max; i++) {
            const os = oSets[i];
            const es = eSets[i];
            if (!os || !es) { n++; continue; }
            if (
                (os.reps || 0) !== (es.reps || 0)
                || (os.weight || 0) !== (es.weight || 0)
                || (os.type || 'working') !== (es.type || 'working')
            ) {
                n++;
            }
        }
    });
    Object.keys(origByKey).forEach((k) => {
        if (!seen.has(k)) n++; // removed exercise
    });

    return n;
}

function normalizeStr(s) {
    return (s == null ? '' : String(s)).trim();
}

// ---------------------------------------------------------------------------
// Re-keying helpers (exported for tests)
// ---------------------------------------------------------------------------

export function rekeyExercisesContiguous(state) {
    const keys = Object.keys(state.exercises).sort((a, b) => {
        const ai = parseInt(a.split('_')[1], 10);
        const bi = parseInt(b.split('_')[1], 10);
        return (isNaN(ai) ? 0 : ai) - (isNaN(bi) ? 0 : bi);
    });
    const rebuilt = {};
    const originalWorkoutExercises = state.originalWorkout ? [] : null;
    keys.forEach((oldKey, i) => {
        const newKey = `exercise_${i}`;
        rebuilt[newKey] = state.exercises[oldKey];
        if (originalWorkoutExercises && state.originalWorkout?.exercises) {
            const oldIdx = parseInt(oldKey.split('_')[1], 10);
            const src = state.originalWorkout.exercises[oldIdx];
            if (src) originalWorkoutExercises.push(src);
        }
    });
    state.exercises = rebuilt;
    if (state.originalWorkout && originalWorkoutExercises) {
        state.originalWorkout.exercises = originalWorkoutExercises;
    }
    return state;
}

// ---------------------------------------------------------------------------
// Inline handlers — wired via inline onclick (window.weh*)
// ---------------------------------------------------------------------------

export function wehTapSetField(exKey, setIdx) {
    if (!editState) return;
    const set = editState.exercises[exKey]?.sets?.[setIdx];
    if (!set) return;
    const ex = editState.exercises[exKey];
    const dw = displayWeight(set.weight || 0, set.originalUnit || 'lbs', ex.displayUnit);
    editingSet = {
        exerciseKey: exKey,
        setIndex: setIdx,
        draftReps: set.reps == null ? '' : String(set.reps),
        draftWeight: set.weight == null ? '' : String(dw.value),
    };
    renderEditMode();
    // Focus the reps input after render
    setTimeout(() => {
        const repsInput = document.querySelector(`[data-weh-reps-input="${exKey}-${setIdx}"]`);
        if (repsInput) {
            repsInput.focus();
            repsInput.select();
        }
    }, 0);
}

export function wehUpdateSetDraft(field, value) {
    if (!editingSet) return;
    if (field === 'reps') editingSet.draftReps = value;
    else if (field === 'weight') editingSet.draftWeight = value;
}

export function wehCommitSet(exKey, setIdx) {
    if (!editingSet) return;
    if (editingSet.exerciseKey !== exKey || editingSet.setIndex !== setIdx) return;

    const ex = editState.exercises[exKey];
    if (!ex || !ex.sets[setIdx]) {
        editingSet = null;
        renderEditMode();
        return;
    }

    const set = ex.sets[setIdx];
    const reps = parseInt(editingSet.draftReps, 10);
    const weightDisplay = parseFloat(editingSet.draftWeight);

    // Reps
    set.reps = isNaN(reps) || reps < 0 ? null : reps;

    // Weight: stored in the unit the user is currently editing in. Only this
    // set gets its `originalUnit` rewritten — historical sets the user didn't
    // touch keep theirs (avoids silent mass-rewrites).
    if (isNaN(weightDisplay) || weightDisplay < 0) {
        set.weight = null;
    } else {
        set.weight = weightDisplay;
        set.originalUnit = ex.displayUnit;
    }

    editingSet = null;
    renderEditMode();
}

export function wehCancelSetEdit() {
    editingSet = null;
    renderEditMode();
}

export function wehCycleSetType(exKey, setIdx) {
    if (!editState) return;
    const set = editState.exercises[exKey]?.sets?.[setIdx];
    if (!set) return;
    const order = ['working', 'warmup', 'dropset', 'failure'];
    const i = order.indexOf(set.type || 'working');
    set.type = order[(i + 1) % order.length];
    renderEditMode();
}

export function wehRemoveSet(exKey, setIdx) {
    if (!editState) return;
    const ex = editState.exercises[exKey];
    if (!ex || !ex.sets[setIdx]) return;
    const removed = ex.sets[setIdx];
    ex.sets.splice(setIdx, 1);
    pendingUndo = { exerciseKey: exKey, setIndex: setIdx, set: removed };
    showUndoToast(`Set ${setIdx + 1} removed`);
    renderEditMode();
}

export function wehUndoRemoveSet() {
    if (!pendingUndo || !editState) return;
    const ex = editState.exercises[pendingUndo.exerciseKey];
    if (!ex) { clearPendingUndo(); return; }
    const idx = Math.min(pendingUndo.setIndex, ex.sets.length);
    ex.sets.splice(idx, 0, pendingUndo.set);
    clearPendingUndo();
    renderEditMode();
}

export function wehAddSet(exKey) {
    if (!editState) return;
    const ex = editState.exercises[exKey];
    if (!ex) return;
    const newSet = {
        reps: null,
        weight: null,
        originalUnit: ex.displayUnit,
        type: 'working',
        completed: true, // historical edits represent things that already happened
    };
    ex.sets.push(newSet);
    const newIdx = ex.sets.length - 1;
    editingSet = {
        exerciseKey: exKey,
        setIndex: newIdx,
        draftReps: '',
        draftWeight: '',
    };
    renderEditMode();
    setTimeout(() => {
        const repsInput = document.querySelector(`[data-weh-reps-input="${exKey}-${newIdx}"]`);
        if (repsInput) repsInput.focus();
    }, 0);
}

export function wehRemoveExercise(exKey) {
    if (!editState) return;
    const ex = editState.exercises[exKey];
    if (!ex) return;
    const ok = confirm(`Remove ${ex.name} from this workout?`);
    if (!ok) return;
    delete editState.exercises[exKey];
    rekeyExercisesContiguous(editState);
    renderEditMode();
}

export function wehAddExercise() {
    if (!editState) return;
    const alreadyAdded = Object.values(editState.exercises).map((e) => e.name).filter(Boolean);
    openSharedAddExerciseSheet({
        targetWorkoutLabel: editState.workoutType,
        alreadyAdded,
        onSelect: (exerciseRecord) => {
            const name = exerciseRecord.name || exerciseRecord.machine || 'Exercise';
            const i = Object.keys(editState.exercises).length;
            const newKey = `exercise_${i}`;
            editState.exercises[newKey] = {
                name,
                equipment: exerciseRecord.equipment || null,
                equipmentLocation: null,
                sets: [],
                notes: '',
                completed: true, // historical edits represent things that already happened
                displayUnit: AppState.globalUnit || 'lbs',
                _originalKey: null,
            };
            if (editState.originalWorkout?.exercises) {
                editState.originalWorkout.exercises.push({
                    machine: name,
                    name,
                    sets: 3,
                    reps: 10,
                    weight: 0,
                    video: exerciseRecord.video || '',
                    equipment: exerciseRecord.equipment || null,
                });
            }
            renderEditMode();
        },
        onCreateRequested: () => {
            // Custom-exercise creation isn't wired into this flow yet — surface
            // a hint so the user knows to add it from the library first.
            showNotification('Add custom exercises from the exercise library', 'info');
        },
    });
}

export function wehChangeEquipment(exKey) {
    if (!editState) return;
    const ex = editState.exercises[exKey];
    if (!ex) return;
    openSharedEquipmentSheet({
        exerciseName: ex.name,
        currentEquipment: ex.equipment,
        onSelect: (equipName) => {
            ex.equipment = equipName || null;
            renderEditMode();
        },
    });
}

export function wehToggleUnit(exKey) {
    if (!editState) return;
    const ex = editState.exercises[exKey];
    if (!ex) return;
    ex.displayUnit = ex.displayUnit === 'kg' ? 'lbs' : 'kg';
    // If the user is mid-edit on this exercise, convert the draft so the input
    // reflects the new unit.
    if (editingSet && editingSet.exerciseKey === exKey) {
        const set = ex.sets[editingSet.setIndex];
        if (set && set.weight != null) {
            const dw = displayWeight(
                set.weight,
                set.originalUnit || 'lbs',
                ex.displayUnit
            );
            editingSet.draftWeight = String(dw.value);
        }
    }
    renderEditMode();
}

export function wehSaveNotes(exKey, value) {
    if (!editState) return;
    const ex = editState.exercises[exKey];
    if (!ex) return;
    ex.notes = value || '';
    // No re-render needed — the textarea is the source of truth and a render
    // would lose focus.
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderEditMode() {
    const content = document.getElementById('workout-detail-content');
    const titleEl = document.getElementById('workout-detail-title');
    if (!content) return;

    if (titleEl) titleEl.textContent = 'Edit workout';

    const dirty = dirtyCount();
    const exerciseKeys = Object.keys(editState.exercises);
    const totalSets = exerciseKeys.reduce(
        (n, k) => n + (editState.exercises[k].sets?.length || 0),
        0
    );

    const metaItems = [
        `${exerciseKeys.length} ${exerciseKeys.length === 1 ? 'exercise' : 'exercises'}`,
        `${totalSets} ${totalSets === 1 ? 'set' : 'sets'}`,
    ];
    if (dirty > 0) {
        metaItems.push(`<span class="weh-meta__dirty">${dirty} unsaved ${dirty === 1 ? 'change' : 'changes'}</span>`);
    }

    const exercisesHTML = exerciseKeys
        .map((key) => renderExerciseCard(key, editState.exercises[key]))
        .join('');

    content.innerHTML = `
        <div class="weh">
            <div class="weh-meta">
                <div class="weh-meta__pill">
                    <i class="fas fa-pen"></i>
                    Editing
                </div>
                <div class="weh-meta__title">${escapeHtml(editState.workoutType)} — ${escapeHtml(editState.displayDate || '')}</div>
                <div class="weh-meta__counts">${metaItems.join(' · ')}</div>
            </div>

            <div class="weh-list">
                ${exercisesHTML}
                <button class="weh-add-ex" onclick="wehAddExercise()">
                    <i class="fas fa-plus"></i> Add exercise
                </button>
            </div>

            <div class="weh-foot">
                <button class="btn btn-secondary" onclick="discardHistoricalEdits()">Discard</button>
                <button class="btn btn-primary" onclick="saveHistoricalEdits()" ${dirty === 0 ? 'disabled' : ''}>
                    Save changes
                </button>
            </div>
        </div>
    `;
}

function renderExerciseCard(key, exercise) {
    const cat = inferCategory(exercise.name);
    const iconClass = getCategoryIcon(cat);
    const equipText = exercise.equipment || 'Choose equipment';
    const unit = exercise.displayUnit;

    const setsHTML = (exercise.sets || [])
        .map((set, idx) => renderSetRow(key, idx, set, unit))
        .join('');

    return `
        <div class="weh-ex" data-weh-ex-key="${escapeAttr(key)}">
            <div class="weh-ex__head">
                <div class="weh-ex__icon weh-ex__icon--${escapeAttr(cat)}">
                    <i class="${iconClass}"></i>
                </div>
                <div class="weh-ex__name">${escapeHtml(exercise.name)}</div>
                <button class="weh-ex__trash" aria-label="Remove exercise" onclick="wehRemoveExercise('${escapeAttr(key)}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>

            <div class="weh-ex__sub">
                <button class="weh-equip-chip" onclick="wehChangeEquipment('${escapeAttr(key)}')">
                    <i class="fas fa-cog"></i>
                    <span>${escapeHtml(equipText)}</span>
                </button>
                <div class="weh-unit" role="group" aria-label="Weight unit">
                    <button class="weh-unit__opt ${unit === 'lbs' ? 'weh-unit__opt--on' : ''}" onclick="wehToggleUnit('${escapeAttr(key)}')">lb</button>
                    <button class="weh-unit__opt ${unit === 'kg' ? 'weh-unit__opt--on' : ''}" onclick="wehToggleUnit('${escapeAttr(key)}')">kg</button>
                </div>
            </div>

            <div class="weh-set-list">
                ${setsHTML || '<div class="weh-set-empty">No sets yet</div>'}
                <button class="weh-add-set" onclick="wehAddSet('${escapeAttr(key)}')">
                    <i class="fas fa-plus"></i> Add set
                </button>
            </div>

            <details class="weh-notes">
                <summary class="weh-notes__summary">${exercise.notes ? 'Notes' : 'Add notes'}</summary>
                <textarea
                    class="weh-notes__input"
                    placeholder="How did this exercise feel?"
                    onblur="wehSaveNotes('${escapeAttr(key)}', this.value)"
                >${escapeHtml(exercise.notes || '')}</textarea>
            </details>
        </div>
    `;
}

function renderSetRow(key, idx, set, displayUnitForExercise) {
    const isEditing = editingSet
        && editingSet.exerciseKey === key
        && editingSet.setIndex === idx;
    const typeLabel = setTypeLabel(set.type || 'working');
    const typeClass = `weh-set__type weh-set__type--${set.type || 'working'}`;

    const dw = displayWeight(set.weight || 0, set.originalUnit || 'lbs', displayUnitForExercise);
    const repsDisplay = set.reps == null ? '—' : String(set.reps);
    const weightDisplay = set.weight == null ? '—' : String(dw.value);

    if (isEditing) {
        const draftReps = editingSet.draftReps;
        const draftWeight = editingSet.draftWeight;
        return `
            <div class="weh-set weh-set--editing">
                <div class="weh-set__num">#${idx + 1}</div>
                <button class="${typeClass}" onclick="wehCycleSetType('${escapeAttr(key)}', ${idx})">${typeLabel}</button>
                <input
                    type="number"
                    class="weh-set__input"
                    inputmode="numeric"
                    min="0"
                    placeholder="reps"
                    value="${escapeAttr(draftReps)}"
                    data-weh-reps-input="${escapeAttr(key)}-${idx}"
                    oninput="wehUpdateSetDraft('reps', this.value)"
                />
                <input
                    type="number"
                    class="weh-set__input"
                    inputmode="decimal"
                    min="0"
                    step="0.5"
                    placeholder="${displayUnitForExercise}"
                    value="${escapeAttr(draftWeight)}"
                    oninput="wehUpdateSetDraft('weight', this.value)"
                />
                <button class="weh-set__commit" aria-label="Save set" onclick="wehCommitSet('${escapeAttr(key)}', ${idx})">
                    <i class="fas fa-check"></i>
                </button>
                <button class="weh-set__cancel" aria-label="Cancel" onclick="wehCancelSetEdit()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }

    return `
        <div class="weh-set">
            <div class="weh-set__num">#${idx + 1}</div>
            <button class="${typeClass}" onclick="wehCycleSetType('${escapeAttr(key)}', ${idx})">${typeLabel}</button>
            <button class="weh-set__val" onclick="wehTapSetField('${escapeAttr(key)}', ${idx})">
                <span class="weh-set__val-num">${escapeHtml(repsDisplay)}</span>
                <span class="weh-set__val-unit">reps</span>
            </button>
            <button class="weh-set__val" onclick="wehTapSetField('${escapeAttr(key)}', ${idx})">
                <span class="weh-set__val-num">${escapeHtml(weightDisplay)}</span>
                <span class="weh-set__val-unit">${escapeHtml(displayUnitForExercise === 'kg' ? 'kg' : 'lb')}</span>
            </button>
            <button class="weh-set__remove" aria-label="Remove set" onclick="wehRemoveSet('${escapeAttr(key)}', ${idx})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
}

function setTypeLabel(type) {
    switch (type) {
        case 'warmup': return 'Warmup';
        case 'dropset': return 'Drop';
        case 'failure': return 'Failure';
        default: return 'Working';
    }
}

function inferCategory(exerciseName) {
    if (!exerciseName) return 'other';
    const lib = AppState.exerciseDatabase || [];
    const found = lib.find((ex) => {
        const n = ex.name || ex.machine || '';
        return n.toLowerCase() === exerciseName.toLowerCase();
    });
    if (found && found.category) return String(found.category).toLowerCase();
    return 'other';
}

// ---------------------------------------------------------------------------
// Undo toast
// ---------------------------------------------------------------------------

function showUndoToast(message) {
    if (pendingUndoTimer) clearTimeout(pendingUndoTimer);

    const existing = document.querySelector('.weh-undo-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'weh-undo-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
        <span class="weh-undo-toast__msg">${escapeHtml(message)}</span>
        <button class="weh-undo-toast__btn" onclick="wehUndoRemoveSet()">Undo</button>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('weh-undo-toast--show'));

    pendingUndoTimer = setTimeout(() => {
        clearPendingUndo();
        toast.classList.remove('weh-undo-toast--show');
        setTimeout(() => toast.remove(), 200);
    }, 5000);
}

function clearPendingUndo() {
    pendingUndo = null;
    if (pendingUndoTimer) {
        clearTimeout(pendingUndoTimer);
        pendingUndoTimer = null;
    }
    const existing = document.querySelector('.weh-undo-toast');
    if (existing) existing.remove();
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
}

// Test-only re-exports kept lean. The pure helpers above (`deriveExerciseNames`,
// `rekeyExercisesContiguous`, `dirtyCount`, `countDiffs`) cover the spec's
// invariants without needing DOM/Firestore.
export const __testing = {
    buildEditStateFromWorkout,
    deriveSavePayload,
    countDiffs,
    normalizeSet,
    deriveDisplayUnitForSets,
};
