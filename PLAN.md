# Big Surf Workout Tracker — Improvement Plan

Use this plan with Claude Code. Each phase is a self-contained session you can tackle one at a time. Copy a phase into Claude Code as your prompt, or reference this file and say "do phase 1."

**Important:** Do Phase T first. It sets up tests that protect you during every subsequent phase.

---

## Phase T: Expand Test Coverage (Do This First)

**Why:** Vitest is installed and there are 4 test files (weight conversion, date helpers, validation, workout helpers), but the most breakable logic — PR detection, streak calculation, and ID generation — isn't tested yet. Add those before changing anything else.

### What's Already Done

- `package.json` exists with `vitest run` script, ESLint, and Prettier
- `vitest.config.mjs` exists
- `tests/unit/weight-conversion.test.js` (57 lines)
- `tests/unit/date-helpers.test.js` (41 lines)
- `tests/unit/validation.test.js` (84 lines)
- `tests/unit/workout-helpers.test.js` (55 lines)

### New Test Files to Add

Add these to `tests/unit/`:

```
tests/unit/
  id-generation.test.js      (NEW)
  pr-detection.test.js        (NEW)
  streak-calculation.test.js  (NEW)
tests/fixtures/
  mock-workouts.js            (NEW)
  mock-pr-data.js             (NEW)
```

### Test Files to Write

#### T.1 ID generation and schema detection tests (NEW)

**What to test:** `generateWorkoutId()` (line 36) and `isOldSchemaDoc()` (line 49) from `js/core/data/data-manager.js`. Both are pure functions — `generateWorkoutId` uses `crypto.getRandomValues()` for the random portion.

- `generateWorkoutId("2025-06-15")` → matches pattern `2025-06-15_{timestamp}_{12-char-random}`
- Two calls to `generateWorkoutId()` with the same date → produce different IDs (random portion differs)
- `isOldSchemaDoc("2025-06-15")` → `true`
- `isOldSchemaDoc("2025-06-15_1234567890_abc123")` → `false`
- `isOldSchemaDoc("")` → `false`
- `isOldSchemaDoc("not-a-date")` → `false`
- `isOldSchemaDoc("2025-13-45")` → `true` (regex doesn't validate date ranges — document this as a known limitation)

**Note:** `generateWorkoutId` uses `crypto.getRandomValues()` which isn't available in Node by default. Use `import { webcrypto } from 'node:crypto'` and polyfill `globalThis.crypto = webcrypto` in the test setup, or mock the random portion.

**Why this matters:** The v2→v3 migration and multi-workout-per-day feature depends on correctly distinguishing old IDs from new ones.

#### T.2 PR detection tests (NEW)

**What to test:** `checkForNewPR()` and `calculateVolume()` from `js/core/features/pr-tracker.js`

These functions need the in-memory `prData` state to be set up. Mock it:

```js
// Mock the internal prData state before calling checkForNewPR
const mockPRData = {
  "Bench Press": {
    "Hammer Strength": {
      maxWeight: { value: 200, reps: 5, date: "2025-06-01" },
      maxReps: { value: 12, weight: 135, date: "2025-06-01" },
      maxVolume: { value: 2000, date: "2025-06-01" },
    }
  }
};
```

Test cases:
- New weight PR: 210 lbs × 5 reps → `{ isNewPR: true, prType: 'weight' }`
- New reps PR: 135 lbs × 15 reps → `{ isNewPR: true, prType: 'reps' }`
- New volume PR: 180 lbs × 12 reps (2160 > 2000) → `{ isNewPR: true, prType: 'volume' }`
- No PR: 135 lbs × 8 reps → `{ isNewPR: false }`
- First ever set for a new exercise → should count as a PR
- `calculateVolume(10, 135)` → `1350`
- `calculateVolume(0, 135)` → `0`

**Why this matters:** False PRs are annoying. Missed PRs are demoralizing. This is the emotional core of the app.

#### T.3 Streak calculation tests (NEW)

**What to test:** The streak calculation logic from `js/core/features/streak-tracker.js`

This is the trickiest to test because it depends on "today's date." Mock `Date` or pass the reference date as a parameter.

Test cases with a mocked "today" of 2025-06-15:
- Workouts on [June 15, 14, 13] → streak of 3
- Workouts on [June 15, 14, 12] → streak of 2 (gap on 13th)
- Workouts on [June 14, 13, 12] (none today) → streak of 3 (yesterday counts)
- Workouts on [June 13, 12] (none today or yesterday) → streak of 0
- Multiple workouts on same day [June 15, 15, 14] → streak of 2 (deduplicated)
- Empty workout list → streak of 0
- Single workout today → streak of 1

**Why this matters:** Streaks are a motivational feature. If the streak count jumps or resets incorrectly, users lose trust.

#### T.4 Create test fixtures

**Create `tests/fixtures/mock-workouts.js`** with a set of realistic workout documents covering:
- A normal completed workout (all sets filled in)
- A workout with no completed exercises (started and cancelled)
- A workout using old schema (date as document ID)
- A workout using new schema (unique ID, date field)
- A workout with multiple exercises, mixed units (lbs and kg)
- A workout at the boundary of a week/month (Sunday night)

These fixtures will be reused across multiple test files and in future phases.

### Running Tests After Each Phase

Add this to your workflow: after completing any phase, run:

```bash
npm test
```

If any test fails, the phase introduced a regression — fix it before moving on. As you add new features in later phases, add tests for them in the same session.

### Verification
- `npm test` runs and all tests pass.
- Each test file covers at least the cases listed above.
- Tests run in under 5 seconds (they're all pure functions, no network).

---

## Phase 0: Fix iOS UX — Zooms, Clunky Scrolling, and Mobile Polish

**Why:** The app feels clunky on iOS with unexpected zooms and sluggish interactions. These are the issues users actually feel. This phase will make the biggest perceived difference.

### Root Cause

The "weird zooms" come from three iOS Safari behaviors colliding: auto-zoom when tapping inputs with font-size below 16px, `100vh` not accounting for the dynamic toolbar (address bar slides in/out), and missing momentum scrolling on modal containers.

### What's Already Done

- Viewport meta tag already has `maximum-scale=1, viewport-fit=cover` (index.html line 5).
- Global `input, select, textarea { font-size: 1rem; }` already exists (style.css lines 84-88).
- `touch-action: manipulation` already applied globally to buttons, inputs, etc. (style.css lines 96-100).
- `.section-content` already uses `100dvh` with fallback (style.css line 4717-4718).
- `-webkit-overflow-scrolling: touch` already exists (style.css line 108).
- `inputmode="numeric"` already used on number inputs throughout index.html and JS.
- All remaining `100vh` uses are paired with `100dvh` fallback — no changes needed.

### Tasks

#### 0.1 Lock background scroll when modals are open

Currently the page behind a modal scrolls when the user swipes, which is disorienting.

**In every modal show function** (search for `classList.remove('hidden')` on modals), add:
```js
document.body.style.overflow = 'hidden';
```

**In every modal close function** (search for `classList.add('hidden')` on modals), add:
```js
document.body.style.overflow = '';
```

Alternatively, create a central `openModal(id)` / `closeModal(id)` pair in `ui-helpers.js` that handles this automatically, and refactor existing modal toggles to use it.

#### 0.2 Fix safe-area insets for notch devices

The bottom nav already has `env(safe-area-inset-bottom)` (good), but nothing else does.

**Add to style.css:**
```css
.main-header {
  padding-top: env(safe-area-inset-top, 0);
}

.app-container {
  padding-bottom: calc(80px + env(safe-area-inset-bottom, 0));
}

.notification {
  bottom: calc(80px + env(safe-area-inset-bottom, 0));
}
```

#### 0.3 Add modal entrance/exit animations

Modals currently snap in and out with `display: none`. Add smooth transitions:

```css
.modal {
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0.2s;
}
.modal.active {
  opacity: 1;
  visibility: visible;
}
.modal > .modal-content {
  transform: translateY(20px);
  transition: transform 0.25s ease;
}
.modal.active > .modal-content {
  transform: translateY(0);
}
```

This requires changing the show/hide pattern from toggling a `hidden` class to toggling an `active` class, and using `visibility: hidden` instead of `display: none`. Update the JS accordingly.

#### 0.4 Add section transition animations

When tapping between Dashboard, Stats, and History in the bottom nav, content just appears/disappears.

**In navigation.js**, instead of adding `hidden` immediately, add a fade:
```css
.section { opacity: 1; transition: opacity 0.15s ease; }
.section.fade-out { opacity: 0; }
```

In JS: add `fade-out` class, wait 150ms, then `display: none` the old section and `display: block` + remove `fade-out` on the new one.

### Verification

- Swipe on the page behind an open modal — the background should not scroll.
- Open the app on an iPhone with a notch — no content should be hidden behind the notch or home indicator.
- Open any modal — it should animate in smoothly, not snap.
- Navigate between Dashboard/Stats/History — transitions should feel smooth, not jarring.

---

## Phase 1: Audit XSS & Reduce innerHTML Usage

**Why:** `escapeHtml()` and `escapeAttr()` utilities already exist in `ui-helpers.js` (lines 4-14) and are used in key places like `exercise-ui.js` line 207. The old `.replace(/'/g, "\\'")` pattern has been removed. However, `innerHTML` is still used ~64 times across 8 JS files. Each use is a potential XSS surface if a future change forgets to escape.

### What's Already Done

- `escapeHtml()` and `escapeAttr()` exist in `js/core/ui/ui-helpers.js` (lines 4-14)
- `exercise-ui.js` line 207 uses `escapeHtml(exerciseName)` and `escapeAttr(exerciseName)` in innerHTML
- The fragile `.replace(/'/g, "\\'")` pattern has been removed from all JS files
- `workout-core.js` is now a 67-line barrel re-export — the actual UI code is in `exercise-ui.js`

### Tasks

1. **Audit all remaining `innerHTML` assignments** (~64 across 8 files). The breakdown: `exercise-ui.js` (15), `stats-ui.js` (14), `workout-session.js` (10), `workout-history.js` (9), `data-manager.js` (6), `rest-timer.js` (4), `ui-helpers.js` (3), `dashboard-ui.js` (3). For each, verify that any user-controlled string passes through `escapeHtml()`. Flag any that don't.

2. **Where possible, replace `innerHTML` with programmatic DOM construction** using `createElement` + `textContent`. This eliminates the need to remember escaping. Prioritize the files with the most innerHTML usage: `exercise-ui.js` (15), `stats-ui.js` (14), and `workout-session.js` (10).

3. **Replace inline onclick handlers with event delegation** where they pass user data. Use `data-*` attributes instead. The `escapeAttr()` function mitigates the risk, but event delegation is the long-term fix.

4. **Test by creating an exercise with a name like `<img src=x onerror=alert('xss')>` and verifying it renders as text, not HTML, everywhere it appears** (workout screen, history, stats, dashboard, template editor).

### Verification
- Grep for `innerHTML` — every instance should either use only static content or pass user data through `escapeHtml()`.
- The XSS test exercise name should render as literal text everywhere.

---

## Phase 2: Input Validation for Firestore Writes

**Why:** Data goes to Firestore without validation on string lengths, types, or structure. The ID generation is already strong (uses `crypto.getRandomValues()` at `data-manager.js` line 38-42), so this phase focuses on data validation.

### What's Already Done

- `generateWorkoutId()` already uses `crypto.getRandomValues()` with 12-char random strings — no change needed.
- `js/core/utils/validation.js` already exists (~97 lines) with `sanitizeString`, `validateWorkoutData`, `validateExerciseData`, `validateTemplateData`, and other validation functions.
- `tests/unit/validation.test.js` already exists (84 lines).

### Tasks

1. **Verify validation is actually called before Firestore writes.** The validation module exists, but check whether `saveWorkoutData()` (data-manager.js line 53) and the save functions in `firebase-workout-manager.js` actually call the validators. If not, add the calls.

2. **Check edge cases in existing validation.** Review `validation.js` for completeness: does it handle deeply nested exercise data? Does it validate the `sets` array structure? Does it strip HTML from notes?

3. **Run existing tests and check for gaps.** Run `npm test` and review `validation.test.js` — does it cover the edge cases listed in Phase T?

### Verification
- Manually test saving an exercise with a 10,000-character name — it should be truncated.
- Run `npm test` — validation tests should pass.

---

## Phase 3: Error Handling Audit

**Why:** Firebase operations can still fail silently in some paths. The debounce and timeout infrastructure is in place — this phase is about ensuring it's used everywhere.

### What's Already Done

- `debouncedSaveWorkoutData()` already exists at data-manager.js line 155.
- `withTimeout(promise, ms)` utility already exists at data-manager.js lines 25-30.
- `convertWeight()` already returns `0` for invalid input (ui-helpers.js line 66).

### Tasks

1. **Verify debounced save is used for auto-saves.** Check that `workout-session.js` and `exercise-ui.js` call `debouncedSaveWorkoutData()` (not the raw `saveWorkoutData()`) for set updates. The raw version should only be used for explicit saves (complete, cancel).

2. **Verify `withTimeout()` wraps critical Firestore calls.** Check `loadTodaysWorkout()`, `getExerciseLibrary()`, and other load functions. If any call Firestore without the timeout wrapper, add it.

3. **Audit async functions for missing try/catch.** Key files to check: `data-manager.js`, `firebase-workout-manager.js`, `workout-session.js`, `exercise-ui.js`, `workout-history.js`. Every Firestore read/write should be in a try/catch that logs the error with context and shows a user notification.

4. **Verify `convertWeight()` callers handle the `0` return gracefully** (e.g., don't display "0 lbs" when the weight is actually unknown).

### Verification
- Rapidly update 5 sets in quick succession — network tab should show only 1-2 Firestore writes, not 5.
- Simulate offline: disable network in DevTools, try to save a workout, verify a meaningful error message appears.

---

## Phase 4: Extract Utilities & Reduce Duplication

**Why:** The same patterns are repeated 5-40 times across files. Centralizing them reduces bugs and makes future changes easier.

### Tasks

1. **Verify `js/core/utils/date-helpers.js` is used everywhere.** `getDateString()` already exists in `date-helpers.js` (lines 8-29) and `.split('T')[0]` has been mostly centralized — only 3 uses remain in `date-helpers.js` itself (where it's the implementation) and 2 in `debug-utilities.js`. Search the full codebase to confirm no other files use the raw `.split('T')[0]` pattern. If any remain, replace with `getDateString()` imports.

2. **Verify `workout-helpers.js` is used everywhere.** `js/core/utils/workout-helpers.js` already exists with `getExerciseName()` (used in `exercise-ui.js`) and likely `getWorkoutDisplayName()`. Search for any remaining raw fallback chains (`workout.name || workout.day || 'Unnamed'` or `exercise.name || exercise.machine || 'Unknown'`) and replace with the helper functions.

3. **Extract a shared equipment picker component.** Equipment picker logic exists in `exercise-ui.js` (~lines 844-940). Check if similar code is duplicated in `workout-management-ui.js`. If so, extract into `js/core/ui/equipment-picker.js` with a single `renderEquipmentPicker(options)` function both can call.

4. **Consolidate rest timer logic.** Timer display code is duplicated between `ui-helpers.js` and `workout-core.js`. Create `js/core/features/rest-timer.js` as a single class that manages the timer state and display updates.

### Verification
- Grep for `.split('T')[0]` — should only appear in `date-helpers.js` (the implementation) and `debug-utilities.js`.
- Grep for `|| 'Unnamed'` or `|| 'Unknown Exercise'` — should find only the utility functions in `workout-helpers.js`.

---

## Phase 5: Remove Dead Code

**Why:** `workout-core.js` has already been split into focused modules (it's now a 67-line barrel re-export with the actual code in `workout-session.js`, `exercise-ui.js`, and `rest-timer.js`). The remaining task is cleaning up dead code.

### What's Already Done

- `workout-core.js` is already a 67-line barrel re-export file.
- The actual logic lives in `workout-session.js`, `exercise-ui.js`, and `rest-timer.js`.

### Tasks

1. **Gate `debug-utilities.js` behind a flag.** It's still ~1,812 lines shipping to production. Only import and execute debug code when a URL param or localStorage flag is set (e.g., `?debug=true`). In `main.js`, change the import to a dynamic one:
   ```js
   if (new URL(window.location).searchParams.has('debug')) {
     import('./core/utils/debug-utilities.js').then(mod => mod.init());
   }
   ```

2. **Remove `fix-template-exercises.js` from the main bundle** if it's still imported. This is a one-time migration utility. `pr-migration.js` does not exist (previous reference was incorrect). Check `main.js` for any other one-time migration imports that can be removed or gated.

3. **Audit `main.js` for unused window assignments.** With the module split done, some `window.*` assignments may now point to functions that have moved. Verify each export is still needed and remove any dead references.

### Verification
- Loading the app without `?debug=true` should not load debug-utilities.js (check network tab).
- No console errors about missing modules or undefined functions.
- `npm test` passes.

---

## Phase 6: DOM Performance & Targeted Updates

**Why:** Re-rendering all exercises on every set change causes lag on mobile.

### Tasks

1. **Refactor `renderExercises()` to do incremental updates.** Instead of rebuilding all exercise HTML, maintain a map of exercise index → DOM element. When a set is updated, only update that set's row. When an exercise is added/removed, only add/remove that card.

2. **Replace `setInterval` timers with a single timer manager.** Ensure only one interval is running at a time for rest timer display. Clear the interval when the timer is stopped or the modal is closed.

3. **Add pagination or lazy rendering for workout history.** If loading history for a month with many workouts, don't render all at once. Render the first 10 and add a "Load more" button or use IntersectionObserver for infinite scroll.

### Verification
- Start a workout with 8+ exercises. Use Chrome DevTools Performance tab to profile adding a set — DOM update time should be under 16ms (one frame).
- Check that only one timer interval is active at any time (add a console.log in the timer callback temporarily).

---

## Phase 7: Accessibility & HTML Cleanup

**Why:** Screen reader users and keyboard-only users can't fully use the app.

### Tasks

1. **Add ARIA labels to all icon-only buttons.** Search for `<button` and `<a href` elements that contain only `<i class="fas ...">` — each needs an `aria-label` attribute describing its action.

2. **Convert modals to use `<dialog>` element.** Start with the most-used modal (exercise detail modal). `<dialog>` gives you free focus trapping, Escape key handling, and proper screen reader announcements. Keep the existing show/hide pattern but use `dialog.showModal()` and `dialog.close()`.

3. **Fix color contrast.** `--text-muted` is currently `#b0b8c1` (style.css line 30). Verify this meets WCAG AA (4.5:1 ratio) against the app background `--bg-app`. If not, adjust slightly lighter.

4. **Add `aria-live="polite"` to the notification container.** Individual notifications created by `showNotification()` in ui-helpers.js already have `role="alert"` and `aria-live="polite"` (line 18-19), but the `.notifications-container` element itself (style.css lines 4873-4882) does not. Add `aria-live="polite"` to the container so screen readers properly announce dynamically added notifications.

### Verification
- Run Lighthouse accessibility audit — aim for 90+ score.
- Tab through the app with keyboard only — all interactive elements should be reachable and modals should trap focus.

---

## Phase 8: Developer Experience

**Why:** The tooling foundation is in place — now make it work for you.

### What's Already Done

- ESLint 10.x installed with `eslint-config-prettier` (`package.json` devDependencies)
- Prettier installed with `.prettierrc` (single quotes, 4-space tabs, trailing commas)
- Vitest installed with `vitest.config.mjs`
- `npm run lint`, `npm run format`, and `npm test` scripts exist

### Tasks

1. **Run ESLint and fix warnings.** `eslint.config.mjs` (flat config) already exists at the project root. Run `npm run lint` and fix the most critical warnings (unused variables, unreachable code). Use `npm run lint:fix` for auto-fixable issues.

2. **Run `npm run format` to apply Prettier across the full codebase.** Review the changes and commit in a single formatting commit so future diffs are clean.

3. **Consider adding Vite as a dev server.** It requires minimal config, gives you hot module reload, and can tree-shake unused code in production builds. Start with `npm create vite@latest` and copy your files in.

4. **(Optional) Add basic Firestore emulator tests.** Firebase provides a local emulator that lets you write tests against your security rules and data operations without hitting production.

### Verification
- `npm run lint` should pass with 0 errors.
- `npm run format:check` should pass.
- `npm test` should pass.

---

## Phase 9: Redesign Template Creation & Editing

**Why:** Templates are the core of the app — every workout starts with one. Right now creating a template means going 3 modals deep, there's no way to reorder exercises, and you can't save a workout you just did as a template. This is the biggest UX friction in the app.

### Current Pain Points

- Adding an exercise requires: Template Editor → Exercise Library → Equipment Picker (3 modals deep)
- No exercise reordering — you have to delete and re-add to change order
- Can't save a completed workout as a new template
- Editing an exercise in a template sometimes falls back to browser `prompt()` dialogs
- No way to quickly duplicate and tweak an exercise (e.g., same exercise, different weight)

### Tasks

#### 9.1 Add exercise reordering with move up/down buttons

In `workout-management-ui.js`, add move-up and move-down buttons to each exercise row in the template editor. When tapped, swap the exercise with its neighbor in the `exercises` array and re-render the list.

**Implementation:** Add two icon buttons (chevron-up, chevron-down) to each exercise row in `showTemplateEditor()`. Wire them to a `reorderTemplateExercise(fromIndex, direction)` function that splices the array. Disable up on the first item, down on the last.

**Stretch goal:** Add touch-based drag-and-drop using the HTML5 Drag and Drop API or a lightweight library like SortableJS (available via CDN). Mobile drag-and-drop is tricky — move buttons are the reliable first step.

#### 9.2 Add "Save Workout as Template"

After completing a workout, show a "Save as Template" button on the completion screen. This should:

1. Take the completed workout's exercises (names, equipment, sets/reps/weight as defaults)
2. Open the template editor pre-populated with that data
3. Let the user name it, pick a category, and tweak exercises before saving

**Implementation:** Add a `saveWorkoutAsTemplate(workoutData)` function in `workout-management-ui.js`. It should normalize the workout's exercise format (workouts use `exercise_0`, `exercise_1` object keys; templates use an array), then call the existing `showTemplateEditor()` with the pre-populated data.

Also add this option to the workout history — a "Save as Template" button on any past workout card so users can template a workout they did weeks ago.

#### 9.3 Flatten the "Add Exercise" flow

The 3-modal depth is the main friction. Redesign so that adding an exercise to a template stays within the template editor screen:

**Option A (simpler):** When the user taps "Add Exercise," slide the exercise library into the same modal (replacing the template editor content) rather than opening a new modal on top. After selecting an exercise, slide back to the template editor. This avoids stacking modals.

**Option B (more ambitious):** Add an inline search bar directly in the template editor. The user types an exercise name, gets autocomplete suggestions from their exercise library, and taps to add. Equipment selection happens inline as a dropdown below the exercise, not in a separate modal. This is how Strong and Hevy handle it.

Either option should reduce the flow from 3 modals to 1.

#### 9.4 Inline exercise editing in the template editor

Replace the current edit flow (which sometimes falls back to `prompt()` dialogs) with inline editing. When the user taps "Edit" on an exercise in the template editor:

- The exercise row expands to show editable fields: sets, reps, weight, equipment (dropdown), notes
- The user makes changes and taps "Done" to collapse it
- No separate modal needed

This is similar to how an accordion works — one exercise can be expanded for editing at a time.

#### 9.5 Add "Quick Add" for recently used exercises

Keep a list of the user's most-used exercises (query from workout history) and show them as quick-add chips at the top of the exercise library. One tap adds the exercise with its most recent equipment and weight defaults — no equipment picker needed.

### Tests to Write

Add `tests/unit/template-management.test.js`:

- **Reorder logic:** `reorderTemplateExercise([A, B, C], 0, 'down')` → `[B, A, C]`. Test moving first item down, last item up, edge cases (move first up = no change, move last down = no change).
- **Workout-to-template conversion:** `normalizeWorkoutToTemplate(workoutData)` should convert `{ exercise_0: {...}, exercise_1: {...} }` object format to array format, preserving exercise names, equipment, and last-used sets/reps/weight as defaults.
- **Template validation:** Template save should reject empty name, template with zero exercises.

### Verification
- `npm test` passes with new template tests.
- Create a template with 5 exercises. Reorder them using move buttons. Save and reopen — order should persist.
- Complete a workout, tap "Save as Template," name it, save it. Start a new workout from that template — exercises should match.
- Add 3 exercises to a new template. Count the number of modal layers you go through — should be 1 (the template editor), not 3.
- Edit an exercise's sets/reps/weight inline without any browser `prompt()` dialogs appearing.

---

## Phase 10: Progress Charts & Visualization

**Why:** This is the #1 feature that makes people stick with a workout app. Users need to see that they're getting stronger over time. Right now the app tracks PRs and weekly stats, but there's no way to visualize long-term trends.

### Tasks

#### 10.1 Add per-exercise progress charts

Create a new module `js/core/features/progress-charts.js`. When a user taps on an exercise (in history or during a workout), show a chart of their performance over time.

**Chart types to implement:**

- **Weight over time** (line chart): X-axis = date, Y-axis = max weight used that session. This is the most important chart — "is my bench press going up?"
- **Volume over time** (bar chart): X-axis = date, Y-axis = total volume (sets × reps × weight). Shows training load trends.
- **Estimated 1RM over time** (line chart): Calculate using Epley formula: `1RM = weight × (1 + reps/30)`. Use the heaviest set from each session.

**Chart library:** Use Chart.js via CDN (`https://cdn.jsdelivr.net/npm/chart.js`). It's lightweight, mobile-friendly, and handles touch interactions.

**Data source:** Query `users/{userId}/workouts` where exercises contain the exercise name. Extract the relevant sets data. Cache results in memory to avoid repeated Firestore queries.

#### 10.2 Add a weekly/monthly volume summary

On the Stats page, add a section showing total weekly volume over the last 8-12 weeks as a bar chart. This gives users the "big picture" view of their training consistency.

Also add a **muscle group balance chart** — a simple horizontal bar chart or radar chart showing volume distribution across body parts (Chest, Back, Shoulders, Arms, Legs, Core) for the current week. This helps users spot imbalances like "I'm doing way more push than pull."

#### 10.3 Add an exercise history detail view

When viewing a specific exercise's history (already accessible via `loadExerciseHistory()` in `workout-core.js`), enhance it with:

- The charts from 10.1 above the set-by-set history
- Best set per session highlighted
- PR badges on sessions where a new record was hit
- Trend indicator (arrow up/down/flat) comparing last 4 weeks to the previous 4

### Tests to Write

Add `tests/unit/progress-calculations.test.js`:

- **1RM estimation (Epley formula):** `estimate1RM(weight, reps)` — 225 lbs × 5 reps → ~260 lbs. Edge cases: 1 rep (1RM = weight itself), 0 reps, very high reps (>30 where formula becomes unreliable).
- **Volume calculation:** `calculateSessionVolume(exercises)` — sum of (sets × reps × weight) across all exercises. Handle missing/null sets, incomplete exercises, mixed units.
- **Trend detection:** `calculateTrend(dataPoints)` — given an array of `{ date, value }`, return 'up', 'down', or 'flat'. Test with clear uptrend, clear downtrend, plateau, insufficient data (<3 points).
- **Muscle group aggregation:** `aggregateVolumeByBodyPart(workouts)` — given a week's workouts, return `{ Chest: 12000, Back: 9500, ... }`. Test with workouts that have exercises mapped to body parts.

### Verification
- `npm test` passes with new progress tests.
- Go to any exercise and view its chart. It should show data points for every session where you used that exercise.
- Check the weekly volume summary — it should match your workout frequency (e.g., 4 workouts/week should show 4 bars of volume).
- Verify charts render correctly on mobile (no overflow, touch-to-zoom on data points works).

---

## Phase 11: Superset & Circuit Support

**Why:** Supersets (alternating between two exercises) and circuits (rotating through 3+ exercises) are extremely common training patterns. Every competitive app supports them.

### Tasks

#### 11.1 Update the data model

Add a `group` field to exercises in both templates and workout documents:

```javascript
exercises: {
  exercise_0: { name: "Bench Press", group: "A", ... },
  exercise_1: { name: "Bent Over Row", group: "A", ... },  // Superset with Bench
  exercise_2: { name: "Lateral Raises", group: null, ... }, // Standalone
}
```

Exercises with the same `group` letter are done together. `null` = standalone. Update the schema version and add migration logic.

#### 11.2 Update the workout UI

When exercises share a group, visually connect them:

- Draw a colored bracket or connecting line on the left side of grouped exercise cards
- Add a label: "Superset A", "Circuit B", etc.
- When the user completes a set on one exercise in the group, automatically scroll to / highlight the next exercise in the group

#### 11.3 Add grouping controls to the template editor

In the template editor (Phase 9), add a way to group exercises:

- Long-press or select multiple exercises → "Group as Superset" button
- Grouped exercises get a visual indicator (colored bar on the left)
- Tap the group indicator to ungroup

#### 11.4 Add grouping during an active workout

Let users create ad-hoc supersets during a workout (not just in templates):

- "Superset with next exercise" button on each exercise card
- Links the current exercise with the one below it

### Tests to Write

Add `tests/unit/exercise-grouping.test.js`:

- **Group assignment:** `groupExercises([0, 1], exercises)` → exercises 0 and 1 get `group: "A"`. Next group call assigns `"B"`.
- **Group detection:** `getExerciseGroups(exercises)` → `{ A: [0, 1], B: [2, 3, 4] }`. Handle exercises with `group: null` (standalone).
- **Next-in-group navigation:** `getNextInGroup(currentIndex, exercises)` → returns next exercise index in the same group, or wraps to the first.
- **Ungrouping:** `ungroupExercise(index, exercises)` → sets `group: null` on that exercise. If only one exercise remains in the group, ungroup it too.
- **Schema migration:** Old workout documents without `group` field should be treated as all-standalone (no errors).

### Verification
- `npm test` passes with new grouping tests.
- Create a template with a superset (2 exercises grouped). Start a workout from it — the exercises should appear visually connected.
- During a workout, complete a set on the first exercise in a superset — the UI should guide you to the second exercise.
- Save a workout with supersets → view in history — grouping should be visible.

---

## Phase 12: Plate Calculator

**Why:** "How do I load 185 on the bar?" is a question every gym-goer asks. A built-in plate calculator saves users from doing mental math or opening a separate app.

### Tasks

1. **Create `js/core/features/plate-calculator.js`.** Given a target weight and bar weight (default 45 lbs / 20 kg), calculate the plates needed per side. Support standard plate sizes: 45, 35, 25, 10, 5, 2.5 lbs (and kg equivalents).

2. **Add a plate calculator button next to weight inputs during a workout.** When tapped, show a small popover or bottom sheet displaying the plate breakdown visually (colored circles representing plates, like a barbell diagram).

3. **Make it configurable.** Let users set their available plates (some gyms don't have 35lb plates) and bar weight (some exercises use lighter bars). Store in user preferences.

4. **Add a standalone plate calculator page** accessible from the More menu for quick reference outside of a workout.

### Tests to Write

Add `tests/unit/plate-calculator.test.js`:

- **Basic calculation:** `calculatePlates(225, 45, [45, 35, 25, 10, 5, 2.5])` → `[45, 45]` per side (greedy algorithm).
- **Odd weight:** `calculatePlates(185, 45)` → `[45, 25]` per side.
- **Impossible weight:** `calculatePlates(183, 45)` → should return closest achievable (182.5 or 185) and indicate remainder.
- **No 35s available:** `calculatePlates(255, 45, [45, 25, 10, 5, 2.5])` → `[45, 45, 10, 5]` per side (not `[45, 35, 25]`).
- **Kg mode:** `calculatePlates(100, 20, [20, 15, 10, 5, 2.5, 1.25])` → `[20, 20]` per side.
- **Just the bar:** `calculatePlates(45, 45)` → `[]` (no plates).
- **Less than bar:** `calculatePlates(30, 45)` → error or indication that weight is less than the bar.

### Verification
- `npm test` passes with new plate calculator tests.
- Enter 225 lbs with a 45 lb bar → should show two 45s per side.
- Enter 185 lbs → should show one 45 and one 25 per side.
- Change available plates to exclude 35s → calculator should adjust.
- Switch to kg mode → plates and bar weight should convert.

---

## Phase 13: Body Measurements & Weight Tracking

**Why:** Most users care about both strength progress and body composition. Tracking body weight alongside workout data gives the complete picture.

### Tasks

1. **Create a new Firestore collection** `users/{userId}/measurements/{docId}` with: `{ date, weight, unit, bodyFat (optional), notes (optional) }`.

2. **Add a body weight entry widget** to the dashboard — a small card showing current weight with a +/- quick entry. One tap to log today's weight.

3. **Add a weight trend chart** to the Stats page — line chart showing body weight over time with a 7-day moving average line (smooths out daily fluctuations).

4. **(Optional) Add body measurements:** neck, chest, waist, hips, biceps, thighs. Show progress over time. This is a nice-to-have — weight alone covers 80% of the use case.

### Tests to Write

Add `tests/unit/body-measurements.test.js`:

- **Moving average:** `calculate7DayAverage(entries)` — given `[{date, weight}]`, return the 7-day moving average at each point. Test with exactly 7 entries, fewer than 7 (should use available data), gaps in dates.
- **Unit conversion on entries:** `convertMeasurementUnit(entry, toUnit)` — convert a stored entry from lbs to kg and back. Verify the original entry is not mutated.
- **Date validation:** Reject duplicate entries for the same date (or overwrite with latest).

### Verification
- `npm test` passes with new measurement tests.
- Log body weight for 7 consecutive days. Chart should show all 7 points plus a trend line.
- Switch between lbs and kg — chart and entries should convert.

---

## Phase 14: Data Export & Backup

**Why:** Users get anxious about data lock-in. The ability to export gives them confidence to invest in the app. It's also a common feature request on every workout app's review page.

### Tasks

1. **Add CSV export for workout history.** Create an "Export Data" button in Settings/More menu. Generate a CSV with columns: Date, Workout Name, Exercise, Set #, Reps, Weight, Unit, Notes, Duration.

2. **Add JSON backup/restore.** Export all user data (workouts, templates, exercises, equipment, locations) as a single JSON file. Add an import function that reads the JSON and writes to Firestore. This doubles as a migration tool.

3. **(Optional) Add Google Sheets integration.** Auto-sync workout logs to a Google Sheet for users who want to do their own analysis.

### Tests to Write

Add `tests/unit/data-export.test.js`:

- **CSV generation:** `generateCSV(workouts)` — given mock workout data, produce a CSV string with correct headers and one row per set. Test with: a normal workout (3 exercises, multiple sets each), a workout with notes containing commas and quotes (must be escaped), a workout with mixed lbs/kg units, an empty workout array.
- **JSON export structure:** `generateExportJSON(userData)` — verify the output includes all collections (workouts, templates, exercises, equipment, locations) and has a metadata header with export date and version.
- **JSON import validation:** `validateImportJSON(json)` — reject malformed JSON, reject JSON missing required fields, accept valid export format. Test with a round-trip: export → import → compare.

### Verification
- `npm test` passes with new export tests.
- Export CSV → open in Excel/Google Sheets → verify all workouts and sets are present.
- Export JSON → create a new account → import JSON → verify all data restored correctly.

---

## Phase 15: Social Features

**Why:** Your friends already use the app. Social features turn a solo tool into a community. This is what made Hevy grow and it's the hardest feature for competitors to replicate — it requires an existing user base, which you already have.

### Tasks

#### 15.1 Activity feed

Create a shared feed where users can see each other's workouts. Requires:

- A new Firestore collection `feed/{docId}` with: `{ userId, userName, workoutType, date, highlights (e.g., "Bench Press PR: 225 lbs"), timestamp }`
- A feed UI on the dashboard or a new "Social" tab
- Privacy controls: let users choose between public, friends-only, or private
- Friend/follow system using a `users/{userId}/following` subcollection

#### 15.2 PR celebrations

When a user hits a PR, optionally post it to the feed with a celebration animation. Other users can react (fire emoji, fist bump, etc.).

#### 15.3 Shared workout challenges

Let a user create a challenge (e.g., "Most total volume this week") and invite friends. Track progress on a leaderboard. This is the most engaging social feature and drives daily opens.

**Note:** Social features are the biggest architectural change in this plan. They require thinking about privacy, data sharing, and potentially Cloud Functions for the feed aggregation. Plan for this to take 2-3x longer than other phases.

### Tests to Write

Add `tests/unit/social-feed.test.js`:

- **Feed item generation:** `createFeedItem(workout, userId)` — given a completed workout, produce a feed document with the right structure (userId, workoutType, date, highlights array, timestamp). Test with a workout that has PRs (should appear in highlights) and one without.
- **Privacy filtering:** `filterFeedByPrivacy(feedItems, viewerRelationship)` — `public` items visible to all, `friends` items visible only if viewer is in following list, `private` items visible only to owner.
- **Highlight extraction:** `extractWorkoutHighlights(workout)` — pull out notable achievements: PR sets, total volume, exercise count. Test with various workout sizes.

### Verification
- `npm test` passes with new social tests.
- Complete a workout → it should appear in the feed (if set to public).
- A friend completes a workout → you should see it in your feed.
- Hit a PR → celebration should appear in your feed and your friend's feed.

---

## Quick Reference: File Map for New Modules

```
js/core/utils/
  ├── validation.js              (Phase 2)
  ├── date-helpers.js            (Phase 4)
  └── workout-helpers.js         (Phase 4)
js/core/ui/
  └── equipment-picker.js        (Phase 4)
js/core/features/
  ├── rest-timer.js              (Phase 4 or 5)
  ├── progress-charts.js         (Phase 10)
  ├── plate-calculator.js        (Phase 12)
  ├── body-measurements.js       (Phase 13)
  ├── data-export.js             (Phase 14)
  └── social-feed.js             (Phase 15)
js/core/workout/
  ├── workout-session.js         (Phase 5)
  ├── exercise-ui.js             (Phase 5)
  └── workout-core.js            (Phase 5, becomes barrel re-export)
```
