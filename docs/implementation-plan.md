# Implementation Plan — Library/Editor Consolidation + Keyboard Fix

This is a self-contained spec for Claude Code. Each phase is independently shippable, listed in the order I'd merge them.

## Goals

1. Make `#workout-selector` (the green-button "Workouts" screen) the single library + editor. Retire `#workout-management-section` and `#template-editor-section`.
2. Fix the chevron-vs-play accidental-start collision.
3. Fold the missing edit functionality (rename, sets/reps/weight, equipment picker, delete, reorder) into the inline expansion of selector rows.
4. Wire the "Equipment picker coming soon" placeholder in `showCreateExerciseForm` to the real equipment sheet.
5. Fix the app-wide on-screen-keyboard issue where bottom-anchored search results render under the keyboard.

## Out of scope

- Drag-and-drop reorder. Use inline ↑/↓ arrows; native drag is a future enhancement.
- Bodyweight flag at template level — already handled via `equipmentType: 'Bodyweight'` and the `BODYWEIGHT_PATTERNS` fallback in `js/core/workout/exercise-ui.js`.
- Dashboard.css V1 dead-code purge (separate PR track).

## Files referenced

- `index.html`
- `js/main.js`
- `js/core/ui/navigation.js`
- `js/core/ui/template-selection.js`
- `js/core/workout/workout-management-ui.js`
- `js/core/workout/active-workout-ui.js`
- `js/core/data/data-manager.js` — for `getLastSessionDefaults`
- `js/core/features/metrics/aggregators.js` — for `getTemplatesForDayOfWeek`
- `js/core/app-initialization.js` — for global focus handler
- `styles/tokens.css`
- `styles/pages/templates.css`
- `styles/pages/active-workout-v2.css`
- `styles/components/modals.css`
- `styles/components/fields.css`

---

# Phase 0 — Keyboard/search fix (ship first)

**Effort:** ~30 min. **Risk:** none. Three independent edits.

## 0.1 — Viewport meta

Edit `index.html`, line 5:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
```

The added `interactive-widget=resizes-content` tells Chrome/Android to shrink the layout viewport when the keyboard opens, fixing most of the issue automatically.

## 0.2 — Global focus handler

Add to `js/core/app-initialization.js`, after the existing `DOMContentLoaded` setup:

```js
// Keep focused inputs visible above the soft keyboard
document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;
    // Wait for the keyboard animation, then center the input in the visible area
    setTimeout(() => {
        try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
    }, 300);
});
```

## 0.3 — vh → dvh sweep

In each of these files, replace `100vh` with `100dvh` and `Xvh` (where `X >= 50`) with `Xdvh`:

- `styles/components/modals.css` — already uses dvh in some places; convert remaining `vh`
- `styles/pages/active-workout-v2.css` — particularly `.aw-sheet { max-height: 85vh }` → `85dvh`
- `styles/pages/exercise-lib.css` — search for `vh` and convert
- `styles/pages/dexa.css`, `styles/pages/templates.css`, `styles/pages/history.css` — sweep

Leave `min-height: 100vh` on outer page containers alone if they support older Safari fallback already (i.e., when both 100vh and 100dvh are declared). Otherwise convert.

## Acceptance criteria — Phase 0

- Tap any search input. Type. Filtered results stay visible above the keyboard.
- Bottom sheets (`.aw-sheet` for equipment, add-exercise) reposition above the keyboard when an input inside them is focused.
- No regression on screens without inputs (active workout, dashboard, history calendar).

---

# Phase 1 — Drop the chevron/play collision and consolidate routing

**Effort:** ~1 hour. **Risk:** low. Single commit.

## 1.1 — Remove the play button from collapsed selector rows

In `js/core/ui/template-selection.js`, find the template row markup (around line 464). The current return contains:

```js
return `
    <div class="row-card template-row ${isExpanded ? 'expanded' : ''}" ...>
        ...
        <i class="fas fa-chevron-down template-row__chevron"></i>
        <button class="btn-start-small" data-action="startTemplateRow" data-workout="${escapeAttr(templateName)}" aria-label="Start ${escapeAttr(templateName)}">
            <i class="fas fa-play"></i>
        </button>
    </div>
    ${editorHtml}
`;
```

Delete the `<button class="btn-start-small">` element entirely. Keep the chevron. The expanded panel already has a "Start Workout" button.

Also remove the now-unused `.btn-start-small` CSS rules from `styles/pages/templates.css` (search for `.btn-start-small`).

In `setupSelectorDelegation`, the `startTemplateRow` action is still wired for the in-panel button — leave it. Just the collapsed-row button goes away.

## 1.2 — Update the subtitle

In `index.html`, line 219:

```html
<p class="section-subtitle">Tap a workout to edit or start</p>
```

## 1.3 — Route all "Workouts" entry points to `workout-selector`

In `js/core/ui/navigation.js`, find the routing table (around lines 9-200). Anywhere that routes to `workout-management` or `showWorkoutManagement()`, change it to `workout-selector` / `showWorkoutSelector()`.

Specifically:
- The `case 'workout-management':` block (around line 162) — change destination to `workout-selector`, or delete the case if `workout-management` is no longer reachable from any nav entry point.
- Bottom nav "Workouts" tab — should already route to `workout-selector`.
- Any `bottomNavTo('workout')` callsites in dashboard/history etc. — should already work via `workout-selector`.

In `index.html`, add `hidden` to the `#workout-management-section` element at line 324 if not already, so it never renders. Don't delete it yet — Phase 9 cleans up.

## Acceptance criteria — Phase 1

- Tapping the green Workouts nav button lands on the selector list. No way to land on the category-grid screen.
- A collapsed row has only a chevron on the right, no play button.
- Tapping anywhere on a collapsed row expands it; nothing accidentally starts a workout.
- The expanded panel's existing "Start Workout" button still works.

---

# Phase 2 — Inline rename

**Effort:** ~30 min. **Risk:** low. Single commit.

In `js/core/ui/template-selection.js`, around line 437 the expanded `editorHtml` includes:

```html
<button class="template-editor__action" data-action="editTemplateFull" ...>
    <i class="fas fa-pen"></i> Rename
</button>
```

## 2.1 — Replace static title with editable input on expand

In the row markup (around line 467-470), replace:

```js
<div class="row-card__content">
    <div class="row-card__title">${escapeHtml(templateName)}</div>
    <div class="row-card__subtitle">${exerciseCount} exercises${timeInfo}</div>
</div>
```

with two states based on `isExpanded`:

```js
<div class="row-card__content">
    ${isExpanded
        ? `<input class="template-row__title-input" data-stop-propagation
                  data-template-id="${escapeAttr(templateId)}"
                  data-action="renameTemplate"
                  value="${escapeAttr(templateName)}" />`
        : `<div class="row-card__title">${escapeHtml(templateName)}</div>`
    }
    <div class="row-card__subtitle">${exerciseCount} exercises${timeInfo}</div>
</div>
```

## 2.2 — Add a `renameTemplate` action to the delegation handler

In `setupSelectorDelegation`, add a `change` listener (in addition to the existing `click`):

```js
container.addEventListener('change', async (e) => {
    if (!e.target.matches('input[data-action="renameTemplate"]')) return;
    const templateId = e.target.dataset.templateId;
    const newName = e.target.value.trim();
    if (!newName) {
        e.target.value = loadedTemplates.find(t => t._id === templateId)?._name || '';
        return;
    }
    const template = loadedTemplates.find(t => t._id === templateId);
    if (!template) return;
    template._name = newName;
    template.name = newName;
    await saveTemplateInline(template, normalizeExercisesToArray(template.exercises));
    renderWorkoutSelectorUI();
});
```

## 2.3 — Remove the Rename action button

Delete the `data-action="editTemplateFull"` button from the expanded `editorHtml`. Keep Duplicate and Delete.

## 2.4 — CSS for the title input

Add to `styles/pages/templates.css`:

```css
.template-row__title-input {
    width: 100%;
    background: transparent;
    border: 0.5px solid var(--border-light);
    border-radius: var(--radius-sm);
    color: var(--text-strong);
    font-size: var(--font-md);
    font-weight: 600;
    padding: 6px 10px;
    outline: none;
}
.template-row__title-input:focus {
    border-color: var(--primary);
}
```

## Acceptance criteria — Phase 2

- Expanding a row turns the title into an input. Edit it, tap outside, the new name is saved (Firestore + UI).
- The "Rename" button no longer appears in the expanded panel.
- Empty save is rejected (input snaps back to original value).
- Editing an empty newly-created template still works.

---

# Phase 3 — Rich exercise rows with inline drill-in edit + reorder arrows

**Effort:** ~3-4 hours. **Risk:** medium (largest single change). One or two commits.

This replaces the current name-only exercise list inside the expanded selector row with a richer pattern: tap a row to expand it, edit sets/reps/weight/equipment/notes inline, ↑/↓ arrows reorder.

## 3.1 — New row renderer in `template-selection.js`

Find the exercise list block in `renderTemplateRowExpansion` (approx. line 415):

```js
const exerciseListHtml = exercisesArray.map((ex, i) => {
    const exName = getExerciseName(ex);
    const isFirst = i === 0;
    const isLast = i === exercisesArray.length - 1;
    return `
        <div class="template-editor__exercise">
            <div class="template-editor__reorder">...</div>
            <span class="template-editor__exercise-name">${escapeHtml(exName)}</span>
            <button class="template-editor__remove-btn" ...>...</button>
        </div>
    `;
}).join('');
```

Replace with:

```js
const expandedExerciseId = expandedExerciseInTemplate; // module-level state
const exerciseListHtml = exercisesArray.map((ex, i) => renderTemplateExerciseRow(ex, i, exercisesArray.length, templateId, template._isDefault, expandedExerciseId === `${templateId}_${i}`)).join('');
```

Add a module-level state variable above:

```js
let expandedExerciseInTemplate = null;
```

Add a new function:

```js
function renderTemplateExerciseRow(ex, idx, total, templateId, isDefault, isExpanded) {
    const exName = getExerciseName(ex);
    const category = (ex.category || ex.bodyPart || 'other').toLowerCase();
    const sets = ex.sets || 3;
    const reps = ex.reps || 10;
    const weight = ex.weight || 0;
    const unit = AppState.globalUnit || 'lbs';
    const equipment = ex.equipment || '';
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
                           data-action="updateExerciseField" data-template-id="${escapeAttr(templateId)}"
                           data-index="${idx}" data-field="sets">
                </div>
                <div class="te-stepper">
                    <div class="te-stepper__label">Reps</div>
                    <input type="number" inputmode="numeric" min="1" max="100"
                           value="${reps}"
                           data-action="updateExerciseField" data-template-id="${escapeAttr(templateId)}"
                           data-index="${idx}" data-field="reps">
                </div>
                <div class="te-stepper">
                    <div class="te-stepper__label">Weight</div>
                    <input type="number" inputmode="decimal" step="0.5"
                           value="${weight}"
                           data-action="updateExerciseField" data-template-id="${escapeAttr(templateId)}"
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
                          data-index="${idx}" data-field="notes">${escapeHtml(ex.notes || '')}</textarea>
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
                            data-action="moveExerciseUp" data-template-id="${escapeAttr(templateId)}"
                            data-index="${idx}" aria-label="Move up">
                        <i class="fas fa-chevron-up"></i>
                    </button>
                    <button class="te-row__arrow" ${isLast ? 'disabled' : ''}
                            data-action="moveExerciseDown" data-template-id="${escapeAttr(templateId)}"
                            data-index="${idx}" aria-label="Move down">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <div class="te-row__icon tint-${category}">
                    <i class="fas fa-dumbbell"></i>
                </div>
                <div class="te-row__info">
                    <div class="te-row__name">${escapeHtml(exName)}</div>
                    <div class="te-row__meta">${summary}</div>
                </div>
                <button class="te-row__remove" data-stop-propagation
                        data-action="removeTemplateExercise"
                        data-template-id="${escapeAttr(templateId)}" data-index="${idx}"
                        aria-label="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${expandedBody}
        </div>
    `;
}
```

## 3.2 — Add new actions to delegation

In `setupSelectorDelegation`, extend the `data-stop-propagation` action handlers and add a top-level action for `toggleExerciseExpand`:

```js
// Inside the data-stop-propagation block, add:
} else if (action === 'updateExerciseField') {
    const field = actionEl.dataset.field;
    const value = actionEl.value;
    await updateExerciseField(templateId, index, field, value);
} else if (action === 'openEquipmentForExercise') {
    await openEquipmentSheetForTemplate(templateId, index);
}

// Outside the data-stop-propagation block, before the row-toggle handler:
const exRowToggle = e.target.closest('[data-action="toggleExerciseExpand"]');
if (exRowToggle && !e.target.closest('[data-stop-propagation]')) {
    const rowKey = exRowToggle.dataset.rowKey;
    expandedExerciseInTemplate = (expandedExerciseInTemplate === rowKey) ? null : rowKey;
    renderWorkoutSelectorUI();
    return;
}
```

Also handle the change event for input fields (or use blur). Add to the existing `change` listener:

```js
container.addEventListener('change', async (e) => {
    // ... existing renameTemplate handler ...
    if (e.target.matches('[data-action="updateExerciseField"]')) {
        const templateId = e.target.dataset.templateId;
        const index = parseInt(e.target.dataset.index, 10);
        const field = e.target.dataset.field;
        const value = e.target.value;
        await updateExerciseField(templateId, index, field, value);
    }
});
```

Implement `updateExerciseField`:

```js
async function updateExerciseField(templateId, index, field, value) {
    const template = loadedTemplates.find(t => t._id === templateId);
    if (!template) return;
    const exercises = normalizeExercisesToArray(template.exercises);
    if (index < 0 || index >= exercises.length) return;
    const ex = exercises[index];
    if (field === 'sets' || field === 'reps') {
        ex[field] = parseInt(value, 10) || ex[field];
    } else if (field === 'weight') {
        ex[field] = parseFloat(value) || 0;
    } else if (field === 'notes') {
        ex[field] = value.trim();
    } else if (field === 'equipment') {
        ex[field] = value || '';
    }
    template.exercises = exercises;
    await saveTemplateInline(template, exercises);
    renderWorkoutSelectorUI();
}
```

## 3.3 — Equipment picker reuse

Add this function in `template-selection.js`. It opens the active-workout's equipment sheet and writes the result back to the template exercise.

```js
async function openEquipmentSheetForTemplate(templateId, index) {
    const template = loadedTemplates.find(t => t._id === templateId);
    if (!template) return;
    const exercises = normalizeExercisesToArray(template.exercises);
    const exercise = exercises[index];
    if (!exercise) return;

    // Lazy-import the active-workout sheet helper
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
```

## 3.4 — Refactor active-workout's equipment sheet to be reusable

In `js/core/workout/active-workout-ui.js`, the existing `awOpenEquipmentSheet(exerciseIdx)` function (around line 1023) is hardcoded to read from `AppState.currentWorkout.exercises[exerciseIdx]` and write to `AppState.savedData.exercises[key].equipment`. Generalize:

Add a new exported function alongside it:

```js
export async function openSharedEquipmentSheet({ exerciseName, currentEquipment, onSelect }) {
    equipSearchQuery = '';

    // Ensure equipment is loaded
    if (!AppState._cachedEquipment || AppState._cachedEquipment.length === 0) {
        try {
            const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
            const mgr = new FirebaseWorkoutManager(AppState);
            AppState._cachedEquipment = await mgr.getUserEquipment();
        } catch {
            AppState._cachedEquipment = [];
        }
    }

    _sharedEquipmentContext = { exerciseName, currentEquipment, onSelect };
    renderSharedEquipmentSheet();
}
```

Add the matching `renderSharedEquipmentSheet` function (copy `renderEquipmentSheet`, but read from `_sharedEquipmentContext` rather than `currentWorkout`, and on row tap call `_sharedEquipmentContext.onSelect(equipName)` then `awCloseSheet()`). Add a `_sharedEquipmentContext` module variable.

Then refactor `awOpenEquipmentSheet(exerciseIdx)` to be a thin wrapper that calls `openSharedEquipmentSheet` with the active-workout context (so the active workout still works).

Export `openSharedEquipmentSheet` from `active-workout-ui.js`.

## 3.5 — Add the ↑/↓ reorder handlers

`moveExerciseUp` and `moveExerciseDown` action handlers (in `setupSelectorDelegation`) already call `moveTemplateExerciseInline(templateId, index, 'up' | 'down')`. That existing function works — no change needed.

## 3.6 — Remove the lying grip handle from the OLD editor (if it's still rendered)

In `js/core/workout/workout-management-ui.js`, line 967, delete this line:

```html
<i class="fas fa-grip-vertical ex-drag"></i>
```

Also remove `.ex-drag` rule from `styles/pages/templates.css`.

(This is a defensive cleanup since the old editor still ships until Phase 9.)

## 3.7 — CSS for the new row pattern

Add to `styles/pages/templates.css`:

```css
.te-row {
    background: var(--bg-card);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-6);
    overflow: hidden;
    transition: border-color var(--anim-fast);
    border: 0.5px solid var(--border-subtle);
}
.te-row--expanded {
    border-color: var(--primary-border);
}
.te-row__head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-8) var(--space-10);
    cursor: pointer;
}
.te-row__reorder {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.te-row__arrow {
    width: 24px; height: 20px;
    border-radius: var(--radius-xs);
    background: transparent;
    border: 0.5px solid var(--border-light);
    color: var(--text-main);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    font-size: 10px;
}
.te-row__arrow:disabled {
    opacity: 0.3;
    cursor: default;
}
.te-row__arrow:not(:disabled):active { background: var(--bg-card-hi); }
.te-row__icon {
    width: 28px; height: 28px;
    border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
}
.te-row__icon.tint-push { background: var(--cat-push-bg); color: var(--cat-push); }
.te-row__icon.tint-pull { background: var(--cat-pull-bg); color: var(--cat-pull); }
.te-row__icon.tint-legs { background: var(--cat-legs-bg); color: var(--cat-legs); }
.te-row__icon.tint-core { background: var(--cat-core-bg); color: var(--cat-core); }
.te-row__icon.tint-cardio { background: var(--cat-cardio-bg); color: var(--cat-cardio); }
.te-row__icon.tint-other { background: var(--bg-card-hi); color: var(--text-muted); }
.te-row__info { flex: 1; min-width: 0; }
.te-row__name {
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-strong);
}
.te-row__meta {
    font-size: var(--font-xs);
    color: var(--text-muted);
    margin-top: 2px;
}
.te-row__remove {
    width: 28px; height: 28px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
}
.te-row__remove:active { color: var(--danger); }
.te-row__edit {
    padding: 0 var(--space-10) var(--space-10);
    display: flex; flex-direction: column; gap: var(--space-8);
}
.te-row__steppers {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--space-6);
}
.te-stepper__label {
    font-size: var(--font-2xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 3px;
}
.te-stepper input {
    width: 100%; box-sizing: border-box;
    background: var(--bg-app);
    border: 0.5px solid var(--border-light);
    border-radius: var(--radius-xs);
    padding: 6px 8px;
    color: var(--text-strong);
    font-size: var(--font-base);
    font-weight: 600;
    text-align: center;
    outline: none;
}
.te-stepper input:focus { border-color: var(--primary); }
.te-row__equip {
    background: var(--bg-app);
    border: 0.5px solid var(--border-light);
    border-radius: var(--radius-xs);
    padding: 8px 10px;
    display: flex; align-items: center; gap: 8px;
    cursor: pointer;
}
.te-row__equip-name {
    flex: 1; min-width: 0; font-size: var(--font-xs);
    color: var(--text-main);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.te-row__equip-action {
    color: var(--primary);
    font-size: var(--font-xs);
    font-weight: 600;
}
.te-row__notes-field textarea {
    width: 100%; box-sizing: border-box;
    background: var(--bg-app);
    border: 0.5px solid var(--border-light);
    border-radius: var(--radius-xs);
    padding: 8px 10px;
    color: var(--text-main);
    font-size: var(--font-xs);
    font-family: inherit;
    resize: none;
    outline: none;
}
.te-row__notes-field textarea:focus { border-color: var(--primary); }
```

## Acceptance criteria — Phase 3

- Each exercise in the expanded template row shows: ↑/↓ arrows, category-tinted icon, name, sets×reps + equipment summary, × remove.
- ↑/↓ arrows swap the exercise with its neighbor; first row's ↑ and last row's ↓ are disabled.
- Tapping the row body expands it to show Sets / Reps / Weight inputs, an Equipment pill, and Notes textarea.
- Editing any field saves automatically (Firestore round-trip).
- Tapping "Choose equipment" opens the same sheet used by the active workout, scoped to this template exercise.
- Picking equipment in that sheet writes back to the template exercise and closes the sheet.
- The grip-handle icon is gone from the old editor (no more visual lie).

---

# Phase 4 — Shared Add-Exercise sheet

**Effort:** ~2 hours. **Risk:** medium.

## 4.1 — Generalize `awAddExercise` into a reusable function

In `js/core/workout/active-workout-ui.js`, the current `awAddExercise()` (around line 1327) and `renderAddExerciseSheet()` (line 1334) are coupled to `AppState.currentWorkout.exercises`. Refactor:

```js
let _sharedAddExerciseContext = null;

export function openSharedAddExerciseSheet({ targetWorkoutLabel, alreadyAdded, onSelect, onCreateRequested }) {
    awCloseMenus();
    addExerciseFilter = 'All';
    addExerciseSearch = '';
    _sharedAddExerciseContext = { targetWorkoutLabel, alreadyAdded: new Set(alreadyAdded || []), onSelect, onCreateRequested };
    renderSharedAddExerciseSheet();
}
```

Add `renderSharedAddExerciseSheet()` (copy from `renderAddExerciseSheet` but use context). On exercise tap, call `_sharedAddExerciseContext.onSelect(exerciseRecord)` then close.

Refactor `awAddExercise` to call `openSharedAddExerciseSheet` with the active-workout context.

## 4.2 — Wire the selector's "+ Add exercise" to the shared sheet

In `template-selection.js`, the inline editor currently has:

```html
<button class="template-editor__add-btn" data-action="addTemplateExercise" ...>
    <i class="fas fa-plus"></i> Add Exercise
</button>
```

…and the `addTemplateExercise` action calls `window.editTemplate(templateId, isDefault)` (kicks out to the full-page editor). Change the handler:

```js
} else if (action === 'addTemplateExercise') {
    await openAddExerciseSheetForTemplate(templateId);
}
```

Implement `openAddExerciseSheetForTemplate`:

```js
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
        },
        onCreateRequested: (initialName) => {
            // Hand off to existing showCreateExerciseForm; see Phase 5
            window.showCreateExerciseForm({ initialName, onCreated: async (newRecord) => {
                // Re-trigger the same selection flow
                await openAddExerciseSheetForTemplate(templateId);
                // Or directly insert and skip reopening
            }});
        },
    });
}
```

## 4.3 — Hook "no results → create" branch

In `renderSharedAddExerciseSheet`, when filtered results are empty AND the search query is non-empty, show a "Create '{query}'" row that calls `_sharedAddExerciseContext.onCreateRequested(query)`.

## Acceptance criteria — Phase 4

- Tapping "+ Add exercise" inside the expanded template row opens a bottom sheet identical to the active workout's add-exercise sheet (search, suggestions, category chips, results).
- Picking an exercise inserts it at the end of the template list and saves.
- Already-added exercises are visually marked or filtered.
- Searching for a non-existent name surfaces "Create [name]" which routes to Phase 5's create flow.

---

# Phase 5 — Wire `showCreateExerciseForm` equipment picker

**Effort:** ~30 min. **Risk:** low.

## 5.1 — Replace the "coming soon" stub

In `js/core/workout/workout-management-ui.js`, around line 1910, the current handler is:

```js
window._createExChooseEquipment = () => {
    showNotification('Equipment picker coming soon', 'info');
};
```

Replace with:

```js
window._createExChooseEquipment = async () => {
    const { openSharedEquipmentSheet } = await import('./active-workout-ui.js');
    const exName = document.getElementById('new-exercise-name')?.value?.trim() || 'this exercise';
    openSharedEquipmentSheet({
        exerciseName: exName,
        currentEquipment: _createExSelectedEquipment || '',
        onSelect: (equipName) => {
            _createExSelectedEquipment = equipName;
            renderEquipmentArea();
            updateCreateExerciseSaveState();
        },
    });
};
```

## 5.2 — Render the chosen equipment in the form

Add a `renderEquipmentArea` function in the same file:

```js
function renderEquipmentArea() {
    const area = document.getElementById('create-ex-equipment-area');
    if (!area) return;
    if (_createExSelectedEquipment) {
        area.innerHTML = `
            <div class="te-row__equip" onclick="window._createExChooseEquipment()">
                <i class="fas fa-cog"></i>
                <span class="te-row__equip-name">${escapeHtml(_createExSelectedEquipment)}</span>
                <span class="te-row__equip-action">Change</span>
            </div>
        `;
    } else {
        area.innerHTML = `
            <div class="empty-state-card create-ex-equip-empty">
                <div class="create-ex-equip-empty__icon"><i class="fas fa-cog"></i></div>
                <div class="create-ex-equip-empty__title">Pick equipment</div>
                <div class="create-ex-equip-empty__desc">Bodyweight, barbell, or pick a specific machine</div>
                <button class="btn-redesign create-ex-equip-empty__btn" onclick="window._createExChooseEquipment()"><i class="fas fa-dumbbell"></i> Choose equipment</button>
            </div>
        `;
    }
}
```

In `showCreateExerciseForm`, after setting `content.innerHTML`, call `renderEquipmentArea()` once.

## 5.3 — `createNewExercise` already uses `_createExSelectedEquipment`

The save path at line 1962 already does:

```js
const equipmentType = _createExSelectedEquipment || 'Bodyweight';
```

Note: this writes the equipment **name** into the `equipmentType` field. That's a misnomer in the current code — the variable holds an equipment record name, not its type. Keep behavior for now; flag for follow-up.

## Acceptance criteria — Phase 5

- Tapping "Choose equipment" in the New Exercise form opens the equipment sheet (no more toast).
- Picking equipment populates the equipment area with the chosen item + "Change" action.
- Saving the exercise persists the chosen equipment.

---

# Phase 6 — Details accordion (category + schedule)

**Effort:** ~2 hours. **Risk:** low.

## 6.1 — Collapsed summary row

At the top of the expanded selector row (inside `editorHtml` in `template-selection.js`), insert before the "EXERCISES" label:

```js
<div class="te-details" data-stop-propagation>
    <div class="te-details__summary" data-action="toggleDetails" data-template-id="${escapeAttr(templateId)}">
        <div class="te-details__summary-text">
            ${renderTemplateSummary(template)}
        </div>
        <i class="fas fa-chevron-${detailsOpenForTemplate === templateId ? 'up' : 'down'} te-details__chev"></i>
    </div>
    ${detailsOpenForTemplate === templateId ? renderTemplateDetailsBody(template) : ''}
</div>
```

Add module state: `let detailsOpenForTemplate = null;`

Helpers:

```js
function renderTemplateSummary(template) {
    const cat = template.category || 'Mixed';
    const usually = deriveUsuallyText(template);
    const exCount = normalizeExercisesToArray(template.exercises).length;
    const estMin = estimateDurationMinutes(template);
    const parts = [
        `<span class="te-cat te-cat--${cat.toLowerCase()}">${escapeHtml(cat)}</span>`,
        usually ? escapeHtml(usually) : null,
        `${exCount} exercises`,
        estMin ? `~${estMin} min` : null,
    ].filter(Boolean);
    return parts.join(' · ');
}

function deriveUsuallyText(template) {
    // Cheap implementation: reuse aggregators
    try {
        const { getTemplatesForDayOfWeek } = require('../features/metrics/aggregators.js');
        // Find dominant days from history
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const counts = days.map((_, dow) => {
            const ranked = getTemplatesForDayOfWeek(AppState.templates || [], AppState.workouts || [], dow);
            const found = ranked.find(r => r.template?._id === template._id || r.template?.name === template._name);
            return found ? found.count : 0;
        });
        const top = counts
            .map((c, i) => ({ c, day: days[i] }))
            .filter(x => x.c >= 2)
            .sort((a, b) => b.c - a.c)
            .slice(0, 2);
        if (top.length === 0) return template.suggestedDays?.length ? `Schedule: ${template.suggestedDays.join(', ')}` : null;
        return `Usually ${top.map(t => t.day).join(', ')}`;
    } catch { return null; }
}

function estimateDurationMinutes(template) {
    const exercises = normalizeExercisesToArray(template.exercises);
    const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets || 3), 0);
    return Math.round(totalSets * 2.5); // rough average min/set
}
```

## 6.2 — Details body with editable chips

```js
function renderTemplateDetailsBody(template) {
    const cat = (template.category || 'other').toLowerCase();
    const days = template.suggestedDays || [];
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const dayValues = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const cats = [
        { value: 'push', label: 'Push' },
        { value: 'pull', label: 'Pull' },
        { value: 'legs', label: 'Legs' },
        { value: 'core', label: 'Core' },
        { value: 'cardio', label: 'Cardio' },
        { value: 'other', label: 'Mixed' },
    ];
    return `
        <div class="te-details__body">
            <div class="te-details__row">
                <div class="te-details__label">Category</div>
                <div class="chips">
                    ${cats.map(c => `
                        <span class="chip ${cat === c.value ? 'chip--active' : ''}"
                              data-action="setTemplateCategory"
                              data-template-id="${escapeAttr(template._id)}"
                              data-cat="${c.value}">${c.label}</span>
                    `).join('')}
                </div>
            </div>
            <div class="te-details__row">
                <div class="te-details__label">Schedule</div>
                <div class="day-chips">
                    ${dayLabels.map((label, i) => `
                        <span class="day-chip ${days.includes(dayValues[i]) ? 'day-chip--active' : ''}"
                              data-action="toggleTemplateDay"
                              data-template-id="${escapeAttr(template._id)}"
                              data-day="${dayValues[i]}">${label}</span>
                    `).join('')}
                </div>
                <div class="te-details__hint">Override the auto-detected schedule.</div>
            </div>
        </div>
    `;
}
```

## 6.3 — Action handlers

In `setupSelectorDelegation`, add inside the `data-stop-propagation` block:

```js
} else if (action === 'toggleDetails') {
    detailsOpenForTemplate = (detailsOpenForTemplate === templateId) ? null : templateId;
    renderWorkoutSelectorUI();
} else if (action === 'setTemplateCategory') {
    const cat = actionEl.dataset.cat;
    const t = loadedTemplates.find(x => x._id === templateId);
    if (t) {
        t.category = cat;
        await saveTemplateInline(t, normalizeExercisesToArray(t.exercises));
        renderWorkoutSelectorUI();
    }
} else if (action === 'toggleTemplateDay') {
    const day = actionEl.dataset.day;
    const t = loadedTemplates.find(x => x._id === templateId);
    if (t) {
        const days = t.suggestedDays || [];
        t.suggestedDays = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
        await saveTemplateInline(t, normalizeExercisesToArray(t.exercises));
        renderWorkoutSelectorUI();
    }
}
```

`saveTemplateInline` already saves `category`. Make sure it also passes through `suggestedDays`:

```js
const saveData = {
    name: template._name,
    exercises,
    category: template.category || getWorkoutCategory(template._name),
    suggestedDays: template.suggestedDays || [],
};
```

## 6.4 — CSS (compact)

Add to `templates.css`:

```css
.te-details {
    margin: var(--space-6) 0 var(--space-10);
    background: var(--bg-card-hi);
    border-radius: var(--radius-sm);
}
.te-details__summary {
    padding: 8px 10px;
    display: flex; align-items: center; gap: 8px;
    cursor: pointer;
}
.te-details__summary-text {
    flex: 1; font-size: var(--font-xs); color: var(--text-muted);
}
.te-cat { font-weight: 600; }
.te-cat--push { color: var(--cat-push); }
.te-cat--pull { color: var(--cat-pull); }
.te-cat--legs { color: var(--cat-legs); }
.te-cat--core { color: var(--cat-core); }
.te-cat--cardio { color: var(--cat-cardio); }
.te-cat--other { color: var(--text-muted); }
.te-details__body {
    padding: 0 10px 10px;
    display: flex; flex-direction: column; gap: var(--space-8);
}
.te-details__label {
    font-size: var(--font-2xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
}
.te-details__hint {
    font-size: var(--font-2xs);
    color: var(--text-muted);
    margin-top: 4px;
}
.chip--active { background: var(--primary-bg); border-color: var(--primary); color: var(--primary); }
.day-chip {
    width: 28px; height: 28px;
    border-radius: 50%;
    border: 0.5px solid var(--border-light);
    color: var(--text-main);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: var(--font-xs);
    cursor: pointer;
    margin-right: 4px;
}
.day-chip--active {
    background: var(--primary-bg);
    border-color: var(--primary);
    color: var(--primary);
}
```

## Acceptance criteria — Phase 6

- Top of every expanded row shows a one-liner: `Push · Usually Tue, Fri · 6 exercises · ~45 min`.
- Tapping it expands to reveal category chips and day-of-week chips.
- Editing chips saves and reflects in the summary.
- "Usually [day]" auto-derives from `getTemplatesForDayOfWeek`; when user has fewer than 2 sessions on any day, falls back to `suggestedDays` field if set.

---

# Phase 7 — Last-session meta on rows

**Effort:** ~1 hour. **Risk:** low.

In the collapsed exercise row's meta line (`te-row__meta`), append last-session info when available.

## 7.1 — Cache last-session at expand

In `template-selection.js`, add a session-level cache map:

```js
const _lastSessionCache = new Map();

async function getLastSessionForExercise(exerciseName) {
    if (_lastSessionCache.has(exerciseName)) return _lastSessionCache.get(exerciseName);
    try {
        const { getLastSessionDefaults } = await import('../data/data-manager.js');
        const result = await getLastSessionDefaults(exerciseName, AppState);
        _lastSessionCache.set(exerciseName, result);
        return result;
    } catch {
        _lastSessionCache.set(exerciseName, null);
        return null;
    }
}
```

## 7.2 — Render asynchronously

When rendering the expanded panel, kick off async loads for each exercise's last-session data and update the DOM when ready:

In `renderTemplateExerciseRow`, render a placeholder `<div class="te-row__last" data-exercise="...">…</div>` element. After `renderWorkoutSelectorUI` completes, walk all visible `.te-row__last` elements and fetch:

```js
function hydrateLastSession() {
    document.querySelectorAll('.te-row__last[data-pending]').forEach(async (el) => {
        el.removeAttribute('data-pending');
        const name = el.dataset.exercise;
        const last = await getLastSessionForExercise(name);
        if (!last || !last.sets || last.sets.length === 0) {
            el.remove();
            return;
        }
        const setStr = last.sets.slice(0, 3).map(s => `${s.weight}×${s.reps}`).join(' · ');
        el.textContent = `Last: ${setStr}${last.daysAgo != null ? ` · ${last.daysAgo}d ago` : ''}`;
    });
}
```

Call `hydrateLastSession()` at the end of `renderWorkoutSelectorUI`.

In the row template, render:

```html
<div class="te-row__last" data-pending data-exercise="${escapeAttr(exName)}"></div>
```

## 7.3 — Cache invalidation

Clear `_lastSessionCache` when:
- A workout completes (hook into `completeWorkout`)
- The selector is reopened from a fresh navigation

## 7.4 — CSS

```css
.te-row__last {
    font-size: var(--font-2xs);
    color: var(--text-secondary);
    margin-top: 2px;
}
```

## Acceptance criteria — Phase 7

- Rows for exercises that have prior sessions show a third line: `Last: 10×135 · 8×135 · 6×135 · 3d ago`.
- Rows for never-logged exercises show just sets×reps + equipment, no third line.
- No N+1 query bursts: each exercise's lookup is cached for the session.

---

# Phase 8 — Swipe-to-delete with Undo (optional polish)

**Effort:** ~3 hours. **Risk:** medium (gesture handling).

Skip if Phase 3's tap-× is sufficient. If pursuing:

## 8.1 — Touch handlers

Add a small swipe-detector to `.te-row__head`. On `touchstart`, record X. On `touchmove`, translateX the head if moving left. On `touchend`, if displacement > 80px, animate fully open and reveal a delete button. Tap delete → remove + show toast with Undo.

## 8.2 — Toast component

Reuse `showNotification` if it supports actions; otherwise add a small custom toast at the bottom of the expanded panel with a 5-second timer.

## 8.3 — Undo behavior

Store `[exerciseRecord, originalIndex]` in a pending-delete buffer. Toast Undo restores it. After 5s without Undo, the delete is committed.

(Detailed CSS/JS omitted — implement only if you want the polish; the existing × button is fine.)

---

# Phase 9 — Retire `workout-management-section` and `template-editor-section`

**Effort:** ~2 hours. **Risk:** low (only after Phases 1-7 are stable).

## 9.1 — Verify no callsites

```sh
grep -rn "showWorkoutManagement\|showTemplateEditor\|workout-management-section\|template-editor-section\|editTemplate\|workout-category-view\|workout-list-view" js/ index.html
```

Replace any remaining `editTemplate(id)` calls with no-ops or routes to selector.

## 9.2 — Delete from `index.html`

- Remove `<section id="workout-management-section">` (lines ~324–401)
- Remove `<section id="template-editor-section">` (lines ~610–622)

## 9.3 — Delete from JS

- Most of `js/core/workout/workout-management-ui.js`. Specifically delete:
  - `showWorkoutManagement`, `showWorkoutCategoryView`, `selectWorkoutCategory`, `handleWorkoutSearch`
  - `renderWorkoutList`, `renderFilteredWorkouts`, `createTemplateCard`
  - `showTemplateEditor`, `closeTemplateEditor`, `saveCurrentTemplate`, `editTemplate`, `saveWorkoutAsTemplate`
  - `setupInlineExerciseSearch`, `renderQuickAddChips`, `showInlineSearchResults`, `selectInlineExercise`
  - `renderTemplateExercises`, `createTemplateExerciseItem`, `editTemplateExercise`, `saveInlineEdit`, `closeTemplateExerciseEdit`, `saveTemplateExerciseEdit`, `moveTemplateExercise`, `removeTemplateExercise`, `addExerciseToTemplate`
  - `selectTemplateCategory`, `toggleTemplateDay`, `updateTemplateEstStats`, `ensureSupersetBar`, `groupSelectedTemplateExercises`, `ungroupTemplateExercise`, `toggleTemplateExerciseMenu`
- **Keep**: `showCreateExerciseForm`, `closeCreateExerciseModal`, `createNewExercise`, `openExerciseLibrary` (if still used elsewhere — check).
- In `js/main.js`, delete corresponding `window.X = X` exports.

## 9.4 — Delete from CSS

In `styles/pages/templates.css`, delete:

- `.template-exercise-item`, `.ex-row`, `.ex-info`, `.ex-name`, `.ex-meta`, `.ex-equip`, `.ex-menu`, `.ex-drag`
- `.template-editor-body`, `.template-exercises-list`, `.inline-add-exercise`, `.inline-search-wrapper`, `.inline-search-results`, `.inline-search-result`, `.inline-search-empty`, `.inline-result-meta`, `.inline-result-added`, `.inline-result-check`, `.inline-result-name`
- `.exercise-inline-edit`, `.inline-edit-fields`, `.inline-edit-row`, `.inline-edit-field`, `.inline-edit-actions`
- `.template-ex-overflow`, `.template-ex-overflow__item`
- Category-grid styles in `templates.css` if specific to the deleted section
- `.workout-library-view`, `.workout-list-item`, `.workout-item-icon`, `.workout-item-content`, `.workout-item-name`, `.workout-item-meta`, `.workout-item-exercises`, `.workout-item-edit` (if defined here)

## 9.5 — Delete from navigation

In `js/core/ui/navigation.js`, remove the `'workout-management'` case from the routing switch and any references in the section list.

## Acceptance criteria — Phase 9

- App still runs. Nothing broken.
- `grep -rn "workout-management-section\|template-editor-section"` returns no matches in `js/` or `index.html`.
- All workout editing happens inline on the selector.
- File size: `workout-management-ui.js` shrinks from ~2,100 LOC to a few hundred (only the Create Exercise form remains).

---

# Testing checklist

After each phase, verify on a real device (or at least Chrome DevTools mobile emulator):

**Phase 0 (keyboard):**
- Search in History → results stay visible above keyboard.
- Search in Add-Exercise sheet → same.
- Equipment sheet search → same.
- Active workout doesn't break.

**Phase 1 (chevron/play):**
- Tap collapsed row → expands.
- Tap expand panel "Start Workout" → starts session.
- Cannot accidentally start a workout from the collapsed row.

**Phase 2 (rename):**
- Expand row, edit title, tap outside → saved.
- Empty save → reverts.

**Phase 3 (rich rows):**
- Tap exercise row → expands inline.
- Edit sets/reps/weight → autosaves.
- Tap "Choose equipment" → equipment sheet opens.
- Pick equipment → reflects in row.
- ↑/↓ arrows reorder; first row's ↑ disabled, last row's ↓ disabled.
- × removes the row.
- Active workout still works (we didn't break the underlying equipment sheet).

**Phase 4 (add):**
- "+ Add exercise" inside a template → bottom sheet opens.
- Pick from suggestions → added to template.
- Search → filters.
- Empty search "Create" → routes to create form.

**Phase 5 (create equipment):**
- New Exercise form → "Choose equipment" → real sheet, not toast.
- Pick → reflects in form.
- Save → exercise persisted with equipment.

**Phase 6 (details):**
- Top of expanded row: summary line with category, schedule, count, est min.
- Expand → category chips + day chips.
- Toggling chips updates summary.

**Phase 7 (last session):**
- Rows with prior sessions show "Last: ...".
- New exercises show no "Last:" line.

**Phase 9 (cleanup):**
- Smoke-test all major flows end-to-end.
- Check console for errors on app load.

---

# Risk and rollback

- **Phase 0** can be reverted by un-doing the viewport-meta line.
- **Phases 1–7** are additive. Until Phase 9 deletes the old sections, both libraries coexist; routing decides which is reachable.
- **Phase 9 is the irreversible cleanup**. Don't merge until 1–7 have been used in real workouts for at least a week.
- The shared sheets in `active-workout-ui.js` are touched in Phases 3 and 4 — regression-test active workout heavily after each.

---

# Notes for Claude Code

- Use the existing `escapeHtml`, `escapeAttr`, `getExerciseName`, `normalizeExercisesToArray`, `saveTemplateInline` helpers — already exported in their files. Don't reimplement.
- Module state variables (`expandedExerciseInTemplate`, `detailsOpenForTemplate`, `_lastSessionCache`) live at the top of `template-selection.js` next to `expandedTemplateId`.
- Maintain the "no inline styles in JS" rule from `CLAUDE.md` for any new CSS — define classes, don't `style="..."`.
- Reuse design tokens from `tokens.css`. Don't add raw colors / hex / rem font sizes.
- Don't add new package dependencies. The codebase has no bundler.
