# Edit history redesign — inline edit in the detail modal

Handoff spec for Claude Code. Self-contained: read this doc + `CLAUDE.md` and you have everything you need to implement.

## Problem

`editHistoricalWorkout` (in `js/core/workout/workout-session.js`) loads a historical workout into the full active-workout UI — same machinery as a live session: header swap, hidden bottom nav, rest-timer wiring, location detection, "Save / Discard" at the bottom of the active-workout section. That's overkill when the user just wants to fix a wrong rep count or weight on a single set.

User intent: "I need to change some workouts that are clearly wrong but it opens up an active workout type of setup and won't let me just fix what I want."

## Goal

Edits happen inside the existing `workout-detail-section` modal. Tap a set value to edit it inline. Add/remove sets and exercises without leaving the modal. Save commits everything in one Firestore write.

## Design decisions (already settled with the user)

1. **Edit scope:** fix set values (reps/weight/type), add/remove sets, add/remove exercises, edit per-exercise notes. Workout-level fields (date, type, location, duration) are **out of scope** for this pass.
2. **UX pattern:** inline editing in the existing detail modal. No mode toggle for tap-to-edit-a-set — set rows are always tappable in edit mode. Add/remove affordances also visible in edit mode.
3. **Quick-fix path:** tap a set value → row expands to show reps + weight inputs → save commits the row to local edit state (not Firestore yet).
4. **Save model:** **batched.** All edits stay local until the user taps "Save changes" at the bottom of the modal. One `updateDoc` call. "Discard" reverts everything.
5. **Add exercise:** reuse the existing exercise picker — `openSharedAddExerciseSheet` in `js/core/workout/active-workout-ui.js`.
6. **Equipment:** per-exercise equipment chip under the exercise name. Tapping it opens the existing equipment picker — `openSharedEquipmentSheet` in `js/core/workout/active-workout-ui.js`.
7. **lb/kg toggle:** per-exercise toggle. Switching display unit converts visible values, but **only sets the user actually edits get their `originalUnit` rewritten**. Untouched sets keep their original unit. Avoids silent mass-rewrites of historical data.

## Visual spec

The detail modal already exists (`workout-detail-section`). When the user taps "Edit Workout" in the action buttons, the modal switches to edit mode in place — no navigation, no header swap, no nav hide.

Edit-mode layout (top to bottom):

- Header — keeps existing back arrow, title (`{workoutType} – {date}`), `Editing` pill (amber).
- Meta strip — `{n} exercises · {n} sets · {n} unsaved changes` (last item amber when dirty count > 0; hidden when count is 0).
- Body — list of exercise cards.
  - Exercise header: category icon (28px square, category-tinted), exercise name, trash icon (removes the whole exercise after a confirm).
  - Sub-row under header: equipment chip (tap to open equipment picker), `lb / kg` toggle pill (right-aligned).
  - Set rows: `[set #] [type chip] [reps] [weight] [×]`. The type chip cycles `working → warmup → dropset → failure → working` on tap; default is `working`. Tap a reps or weight value → row enters editing state (input fields appear); a confirmed save commits to local edit state. The × removes the set with an undo toast.
  - `+ Add set` dashed button at the bottom of the set list. Tapping appends a blank set in editing state.
  - Per-exercise `notes` textarea below the set list, collapsed by default; expands on tap. Edits commit to `editState` on blur.
- `+ Add exercise` dashed button below the last exercise.
- Footer (sticky): `Discard` (left) + `Save changes` (right, primary).

Visual reference: `workout_inline_edit_mockup_v2` widget shown in chat earlier. Match the spacing and component patterns used in the rest of the codebase (see CLAUDE.md "Design System Rules").

## Behaviour spec

### Entering edit mode

- The "Edit Workout" button in `workout-detail-section` no longer calls `editHistoricalWorkout`. It calls a new function (e.g. `enterHistoricalEditMode(docId)`) that:
  - Loads the workout via `loadWorkoutById` from `js/core/data/data-manager.js`.
  - Clones the workout into a module-scoped `editState` object (deep clone via `JSON.parse(JSON.stringify(...))`).
  - Re-renders the detail modal content in edit-mode markup (new render function — keep the existing read-only renderer alongside it for non-edit paths).
- The `workoutModal` legacy path (`generateWorkoutDetailHTML` in `workout-history.js`) should also route to the same edit flow when its Edit button is tapped, for consistency.

### Per-exercise unit toggle

- `editState.exercises[key].displayUnit` holds the current display unit (`'lbs' | 'kg'`). Initialize to the most common `originalUnit` across that exercise's sets, falling back to `AppState.exerciseUnits[exerciseIndex]` then `AppState.globalUnit`.
- Toggling re-renders the visible set values via the existing `displayWeight()` helper from `ui-helpers.js`.
- When a set is **edited** while displayed in unit X, the saved set's `originalUnit` becomes X and `weight` is stored in X. Untouched sets are not modified.

### Adding a set

- `+ Add set` appends `{ reps: null, weight: null, originalUnit: <displayUnit>, type: 'working', completed: true }` to the local exercise's `sets` array and immediately puts the new row in editing state. Historical edits log what already happened, so `completed` is always `true` for new sets.

### Removing a set

- `×` removes the set from local `sets` array. Show an undo toast (use existing `showNotification` + a 5s undo affordance — same pattern as the autosave/reorder messages).

### Adding an exercise

- `+ Add exercise` calls `openSharedAddExerciseSheet({ onSelect: (exercise) => addExerciseToEditState(exercise), onCreateRequested, alreadyAdded })` from active-workout-ui.js.
- Append to `editState.exercises` with a new key `exercise_{n}`. Mirror the active-workout shape: `{ name, equipment: null, sets: [], notes: '', completed: true }`. (`completed: true` because historical edits represent things that already happened.) Also append to `originalWorkout.exercises` if the workout has one (so the read-only renderer continues to work post-save).

### Removing an exercise

- Trash icon on exercise header → confirm → splice from `editState.exercises` and `originalWorkout.exercises`. Re-key remaining exercises so the `exercise_N` indices stay contiguous (preserves the existing schema — see `data-manager.js` save path).

### Equipment chip

- Renders the current equipment as a chip. Tap → `openSharedEquipmentSheet({ onSelect: (equipment) => setEquipmentInEditState(exerciseKey, equipment) })`.
- Updates `editState.exercises[key].equipment` (and `equipmentLocation` if your existing picker returns that).

### Save changes

- Bottom-right primary button. Disabled when dirty count is 0.
- Action: build the persisted shape from `editState` and call:

  ```js
  import { doc, updateDoc, db } from '../data/firebase-config.js';
  await updateDoc(
    doc(db, 'users', AppState.currentUser.uid, 'workouts', docId),
    {
      exercises: editState.exercises,
      exerciseNames: deriveExerciseNames(editState),
      originalWorkout: editState.originalWorkout, // if present
      lastUpdated: new Date().toISOString(),
    }
  );
  ```

- After save: `clearAllWorkoutsCache()` from data-manager.js, refresh `workoutHistory.currentHistory`, re-render the detail modal in read-only mode, show `Changes saved` toast.
- Don't change `completedAt`, `cancelledAt`, or `totalDuration` — those are workout-level metadata the user said is out of scope here.

### Discard

- Wipes `editState`, re-renders the modal in read-only mode. If there are unsaved changes, confirm before discarding (`Discard {n} unsaved changes?` / `Discard` / `Keep editing`).

## Implementation plan

### New file

- `js/core/workout/edit-history-inline.js`
  - Module-scoped `editState` object plus exports:
    - `enterHistoricalEditMode(docId)`
    - `exitHistoricalEditMode({ saved })`
    - `saveHistoricalEdits()`
    - `discardHistoricalEdits()`
    - Internal handlers for set tap, set save, set remove, set add, exercise add, exercise remove, equipment change, unit toggle.
  - The render function takes the modal `content` element and writes the edit-mode HTML into it.

### Modified files

- `js/core/workout/workout-history.js`
  - Add an `'enterEditMode'` data-action and handler in `actionHandler` (the delegated click handler on `workout-detail-section`, `workoutModal`, `workout-history-section`).
  - Change the `editWorkout` data-action to call `window.enterHistoricalEditMode(docId)` instead of `window.editHistoricalWorkout(docId)`.
  - Add a renderer function `generateWorkoutEditHTML(editState)` (or put it in the new module — preference: new module, exported and called from workout-history.js).

- `js/main.js`
  - Import and assign to window: `enterHistoricalEditMode`, `saveHistoricalEdits`, `discardHistoricalEdits` (and any inline handlers triggered by data-action).
  - Keep `editHistoricalWorkout` exported for now (don't break the old flow; it's still callable from any caller we missed).

- `js/core/data/data-manager.js`
  - No new function strictly required — call `updateDoc` directly from the new module. But if you want a single seam: add `updateHistoricalWorkout(docId, patch)` that does `withRetry(() => updateDoc(...))` and invalidates the cache. Cleaner.

- `styles/pages/history.css`
  - Add edit-mode styles. New classes (BEM-ish per CLAUDE.md):
    - `.we-edit-meta-strip`, `.we-edit-meta-strip__dirty`
    - `.we-edit-ex`, `.we-edit-ex__head`, `.we-edit-ex__sub`, `.we-edit-ex__trash`
    - `.we-edit-set-row`, `.we-edit-set-row--editing`, `.we-edit-set-row--dirty`
    - `.we-edit-equip-chip`, `.we-edit-unit-toggle`, `.we-edit-unit-toggle__opt`, `.we-edit-unit-toggle__opt--on`
    - `.we-edit-add-set`, `.we-edit-add-ex`
    - `.we-edit-foot`
  - All colors via tokens. No raw hex. No inline styles in JS template strings.

- `tests/unit/edit-history.test.js` (new)
  - Pure-function test for the unit-toggle invariant: editing a set updates that set's `originalUnit`; untouched sets preserve theirs.
  - Test for re-keying after exercise removal (indices stay contiguous).
  - Test for `deriveExerciseNames` keeping in sync with `editState.exercises`.

### Out of `editHistoricalWorkout` scope (don't delete it yet)

`editHistoricalWorkout` may still be called from places I haven't enumerated. Leave it intact as a fallback. The intent of this work is to re-route the user-visible "Edit Workout" button on the detail modal to the new flow. Do a follow-up `git grep editHistoricalWorkout` audit in a later pass.

## Acceptance criteria

- Tap "Edit Workout" on a historical workout → detail modal switches into edit mode in place. No section navigation, no header swap, no hidden nav.
- Tap a set's reps or weight → row shows inputs → save updates local state.
- Tap the type chip on a set → cycles through working/warmup/dropset/failure.
- × on a set removes it with undo toast.
- + Add set appends a blank, editable row (`completed: true`, `type: 'working'`).
- Per-exercise notes textarea expands on tap, commits to local state on blur.
- Trash on exercise header removes the exercise (with confirm).
- + Add exercise opens the existing exercise picker; selection appends to local state.
- Equipment chip opens the existing equipment picker; selection updates local state.
- lb/kg toggle converts displayed values; only edited sets get their `originalUnit` rewritten on save.
- Footer "Save changes" writes one `updateDoc`, refreshes the cache, re-renders read-only.
- Footer "Discard" prompts when dirty, reverts otherwise.
- All copy follows CLAUDE.md "User-Facing Copy Rules" (sentence case, no "please", no "successfully", action-first buttons, `…` for ellipsis).
- All CSS follows CLAUDE.md "Design System Rules" (tokens, no inline styles in JS, BEM-ish naming).
- `npm test` passes including the new tests.

## Files to read before starting

- `js/core/workout/workout-history.js` — current detail modal code (`showFixedWorkoutModal`, `generateWorkoutDetailHTML`, `actionHandler`).
- `js/core/workout/workout-session.js` — `editHistoricalWorkout` (line ~1057). Understand what state it sets up so the new flow doesn't have to.
- `js/core/workout/active-workout-ui.js` — `openSharedAddExerciseSheet`, `openSharedEquipmentSheet` (signature, callback shape).
- `js/core/data/data-manager.js` — `saveWorkoutData` (line ~72), `loadWorkoutById` (line ~351), `clearAllWorkoutsCache`, `withRetry`.
- `js/core/ui/ui-helpers.js` — `displayWeight`, `convertWeight`, `showNotification`.
- `styles/pages/history.css` — existing detail-modal styles to mirror.
- `index.html` — `#workout-detail-section` markup.

## Notes / gotchas

- The detail modal has two render paths: `showFixedWorkoutModal` (uses `workout-detail-section`) and the older `showWorkoutDetail`/`generateWorkoutDetailHTML` (uses `workoutModal`). Wire the new edit flow into both, or canonicalize on `workout-detail-section` and have the older path reuse it.
- Workout doc ID format is `{date}_{timestamp}_{random}`. Don't change the doc ID on edits — only the fields listed in the Save section.
- Do **not** touch `completedAt`, `cancelledAt`, `startedAt`, `totalDuration` in edit save. The user said workout-level metadata is out of scope.
- When deriving `exerciseNames`, make sure keys are `exercise_0`, `exercise_1`, … in order — that's the schema invariant the rest of the app assumes.
- Use `debouncedSaveWorkoutData` patterns only as reference; this flow does NOT autosave — it's a single explicit save.
