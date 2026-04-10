# Big Surf Workout Tracker — Improvement Plan

Use this plan with Claude Code. Each phase is a self-contained session you can tackle one at a time. Copy a phase into Claude Code as your prompt, or reference this file and say "do phase 1."

**Important:** Do Phase T first. It sets up tests that protect you during every subsequent phase.

---

## Phase T: Set Up Tests (Do This First)

**Why:** There are zero tests right now. Before changing anything, put a safety net in place. The tests in this phase cover the core logic most likely to break during refactoring: weight conversions, date parsing, streak calculations, PR detection, and ID generation. Run them after every phase to make sure nothing broke.

### Setup

1. **Initialize the project and install Vitest.** Create a `package.json` at the project root if one doesn't exist:

```bash
npm init -y
npm install --save-dev vitest
```

2. **Add a test script to `package.json`:**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "type": "module"
}
```

3. **Create a `vitest.config.js`** at the project root:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globals: true,
  },
});
```

4. **Create the test directory structure:**

```
tests/
  unit/
    weight-conversion.test.js
    date-helpers.test.js
    id-generation.test.js
    pr-detection.test.js
    streak-calculation.test.js
    volume-calculation.test.js
  fixtures/
    mock-workouts.js
    mock-pr-data.js
```

### Test Files to Write

#### T.1 Weight conversion tests

**What to test:** `convertWeight()` from `js/core/ui/ui-helpers.js`

This function is pure (takes weight, fromUnit, toUnit → returns number). Extract or import it and test:

- `convertWeight(100, 'lbs', 'kg')` → `45.4` (rounded to 1 decimal)
- `convertWeight(45.4, 'kg', 'lbs')` → `100` (rounded to whole)
- `convertWeight(100, 'lbs', 'lbs')` → `100` (same unit, no change)
- `convertWeight(0, 'lbs', 'kg')` → `0`
- `convertWeight(null, 'lbs', 'kg')` → should not throw
- `convertWeight('not a number', 'lbs', 'kg')` → should handle gracefully
- `convertWeight(1000, 'lbs', 'kg')` → verify large weights aren't corrupted

**Why this matters:** Weight displays throughout the app depend on this. A rounding bug silently shows users wrong numbers.

#### T.2 Date helper tests

**What to test:** `getDateString()` and `getTodayDateString()` from AppState, plus the `.split('T')[0]` pattern used everywhere (which Phase 4 will centralize).

- ISO string `"2025-06-15T10:30:00.000Z"` → `"2025-06-15"`
- Already formatted `"2025-06-15"` → `"2025-06-15"` (idempotent)
- Date object `new Date(2025, 5, 15)` → `"2025-06-15"`
- Null/undefined → should not throw, return sensible default
- Timezone edge case: a date at 11:30pm in UTC that's the next day in local time → should return the local date, not UTC date

**Why this matters:** Date bugs are the #1 source of "my workout shows on the wrong day" issues. The split('T')[0] pattern appears 40+ times — if any refactoring breaks it, workouts land on wrong dates.

#### T.3 ID generation and schema detection tests

**What to test:** `generateWorkoutId()` and `isOldSchemaDoc()` from `js/core/data/data-manager.js`

- `generateWorkoutId("2025-06-15")` → matches pattern `2025-06-15_{timestamp}_{random}`
- Two calls to `generateWorkoutId()` with the same date → produce different IDs
- `isOldSchemaDoc("2025-06-15")` → `true`
- `isOldSchemaDoc("2025-06-15_1234567890_abc123")` → `false`
- `isOldSchemaDoc("")` → `false`
- `isOldSchemaDoc("not-a-date")` → `false`
- `isOldSchemaDoc("2025-13-45")` → `true` (regex doesn't validate date ranges — document this as a known limitation)

**Why this matters:** The v2→v3 migration and multi-workout-per-day feature depends on correctly distinguishing old IDs from new ones.

#### T.4 PR detection tests

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

#### T.5 Streak calculation tests

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

#### T.6 Create test fixtures

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

### Tasks

#### 0.1 Fix the viewport meta tag

**File:** `index.html` line 5

Change:
```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```
To:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
```

This prevents accidental pinch-zoom and double-tap zoom, and enables safe-area inset support for notch devices (iPhone X and later).

#### 0.2 Fix all input font sizes below 16px

iOS Safari auto-zooms the page to ~200% whenever a user taps an input/select/textarea with font-size below 16px. This is the single most likely cause of the "weird zooms."

**Search for and fix all form element font sizes below 1rem (16px):**

- `style.css` ~line 1327: `.exercise-notes { font-size: 0.9rem }` — change to `1rem`
- `style.css` ~line 3025: `.edit-select, .edit-input-number { font-size: 0.95rem }` — change to `1rem`
- Search the entire CSS for any other `font-size` declarations on `input`, `select`, `textarea`, or classes used on form elements. Every one must be at least `1rem` (16px).

**Also add this global rule near the top of style.css:**
```css
input, select, textarea {
  font-size: 1rem; /* Prevent iOS auto-zoom on focus */
}
```

#### 0.3 Replace 100vh with 100dvh on full-screen modals

`100vh` is broken on iOS Safari — it equals the viewport height *including* the browser chrome (address bar, tab bar), so content is always taller than visible. `100dvh` (dynamic viewport height) adjusts as the toolbar shows/hides.

**Files to fix in style.css:**

- ~line 2472: `#exercise-library-modal > .modal-content` and related selectors — change `min-height: 100vh` and `max-height: 100vh` to `100dvh`
- ~line 3779: `.section-content { min-height: 100vh }` — change to `min-height: 100dvh`
- Search for any other `100vh` usage and replace with `100dvh`

**Add a fallback for older browsers:**
```css
min-height: 100vh; /* fallback */
min-height: 100dvh;
```

#### 0.4 Add momentum scrolling to all scrollable containers

Without `-webkit-overflow-scrolling: touch`, scrolling inside modals and sidebars feels laggy on iOS (no momentum/bounce).

**Add to style.css:**
```css
.sidebar,
.modal > .modal-content,
.modal-content-editor,
.exercise-list-container {
  -webkit-overflow-scrolling: touch;
}
```

Or apply it globally to any element with `overflow-y: auto` or `overflow-y: scroll`.

#### 0.5 Lock background scroll when modals are open

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

#### 0.6 Fix safe-area insets for notch devices

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

#### 0.7 Add modal entrance/exit animations

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

#### 0.8 Add section transition animations

When tapping between Dashboard, Stats, and History in the bottom nav, content just appears/disappears.

**In navigation.js**, instead of adding `hidden` immediately, add a fade:
```css
.section { opacity: 1; transition: opacity 0.15s ease; }
.section.fade-out { opacity: 0; }
```

In JS: add `fade-out` class, wait 150ms, then `display: none` the old section and `display: block` + remove `fade-out` on the new one.

#### 0.9 Add `touch-action: manipulation` to interactive elements

This tells the browser "this element is interactive, don't wait for double-tap zoom":

```css
button, a, .btn, input, select, textarea, .bottom-nav-item, .clickable {
  touch-action: manipulation;
}
```

#### 0.10 Add `inputmode="numeric"` to number inputs

This ensures iOS shows the numeric keypad instead of the full keyboard for weight/rep/set inputs.

**Search index.html and all JS that generates `<input type="number">` elements.** Add `inputmode="numeric"` to each. For weight inputs that allow decimals, use `inputmode="decimal"`.

### Verification

- On an iPhone (or iOS Simulator), tap a weight input field — the page should NOT zoom in.
- Open any full-screen modal — it should exactly fill the visible screen, not extend behind the toolbar.
- Scroll inside a modal — it should feel smooth with momentum (flick and coast).
- Swipe on the page behind an open modal — the background should not scroll.
- Open the app on an iPhone with a notch — no content should be hidden behind the notch or home indicator.
- Navigate between Dashboard/Stats/History — transitions should feel smooth, not jarring.

---

## Phase 1: Fix XSS & Inline Handler Security

**Why:** These are the most serious issues — user-controlled strings are rendered as HTML and inline onclick handlers use fragile escaping that can be bypassed.

### Tasks

1. **Audit all `innerHTML` assignments that include user data.** Search for `innerHTML` across the codebase. For each occurrence, determine whether user-controlled values (exercise names, equipment names, location names, notes) are interpolated. Key files: `workout-core.js`, `location-ui.js`, `manual-workout.js`, `template-selection.js`, `dashboard-ui.js`, `workout-history-ui.js`.

2. **Create an `escapeHtml()` utility in `js/core/utils/ui-helpers.js`** (or verify one exists and is used consistently). It should escape `&`, `<`, `>`, `"`, and `'`. Use it anywhere innerHTML is necessary. Prefer `textContent` or programmatic DOM construction where possible.

3. **Replace the most dangerous inline onclick handlers with event delegation.** Focus on handlers that pass user-supplied strings (exercise names, equipment names). Use `data-*` attributes to pass values safely. Start with `workout-core.js` line 792 and the equipment picker in `manual-workout.js`.

4. **Test by creating an exercise with a name like `<img src=x onerror=alert('xss')>` and verifying it renders as text, not HTML.**

### Verification
- Grep for `innerHTML` — every remaining instance should either use only static content or pass through `escapeHtml()`/`textContent`.
- No inline onclick handlers should use `.replace(/'/g, "\\'")` on user input.

---

## Phase 2: Input Validation & Stronger IDs

**Why:** Data goes to Firestore without checks, and workout IDs use weak randomness.

### Tasks

1. **Create a validation utility in `js/core/utils/validation.js`.** Export functions like `sanitizeString(str, maxLength)`, `validateWorkoutData(data)`, and `validateExerciseData(data)`. Sanitize by trimming, enforcing max length (e.g., 200 chars for names, 1000 for notes), and stripping HTML tags.

2. **Add validation calls before all Firestore writes in `data-manager.js`.** Specifically in `saveWorkoutData()`, and in `firebase-workout-manager.js` for template, exercise, equipment, and location saves.

3. **Replace the ID generator in `data-manager.js` line 12-15.** Replace `Math.random().toString(36).substring(2, 8)` with `crypto.getRandomValues()`:
   ```js
   const arr = new Uint8Array(12);
   crypto.getRandomValues(arr);
   const random = Array.from(arr, b => b.toString(36).padStart(2, '0')).join('').substring(0, 12);
   ```

4. **Import and expose the validation module in `main.js` if any validation functions need to be called from HTML.**

### Verification
- Manually test saving an exercise with a 10,000-character name — it should be truncated.
- Verify workout IDs are now 12+ random characters.

---

## Phase 3: Error Handling & Debounced Auto-Save

**Why:** Firebase operations fail silently and auto-save fires on every keystroke.

### Tasks

1. **Add a debounce wrapper for `saveWorkoutData()`.** In `data-manager.js`, create a `debouncedSave()` function with a 400ms delay. Replace direct `saveWorkoutData()` calls in `workout-core.js` with the debounced version. Keep the non-debounced version for explicit saves (complete workout, cancel workout).

2. **Audit async functions for missing try/catch.** Key files to check: `data-manager.js`, `firebase-workout-manager.js`, `workout-core.js`, `workout-history.js`. Every Firestore read/write should be in a try/catch that logs the error with context and shows a user notification.

3. **Add timeout handling for Firestore operations.** Create a `withTimeout(promise, ms)` utility that rejects after a timeout (10 seconds). Wrap critical Firestore calls with it, especially in `loadTodaysWorkout()`, `saveWorkoutData()`, and `getExerciseLibrary()`.

4. **Fix `convertWeight()` in `ui-helpers.js`.** Instead of returning `'??'` for invalid input, return `0` and log a warning. Audit callers to ensure they handle the `0` case gracefully.

### Verification
- Rapidly update 5 sets in quick succession — network tab should show only 1-2 Firestore writes, not 5.
- Simulate offline: disable network in DevTools, try to save a workout, verify a meaningful error message appears.

---

## Phase 4: Extract Utilities & Reduce Duplication

**Why:** The same patterns are repeated 5-40 times across files. Centralizing them reduces bugs and makes future changes easier.

### Tasks

1. **Create `js/core/utils/date-helpers.js`.** Extract a `getDateString(value)` function that handles ISO strings, Date objects, and YYYY-MM-DD strings uniformly. Search for `.split('T')[0]` across the codebase (40+ instances) and replace each with `getDateString()`. Export from `main.js` if needed.

2. **Create `js/core/utils/workout-helpers.js`.** Extract:
   - `getWorkoutDisplayName(workout)` — replaces the `workout.name || workout.day || 'Unnamed'` pattern
   - `getExerciseName(exercise)` — replaces `exercise.name || exercise.machine || exercise.exercise || 'Unknown'`

3. **Extract a shared equipment picker component.** The equipment selection UI is duplicated between `workout-core.js` (~line 1447) and `workout-management-ui.js` (~line 1001). Create `js/core/ui/equipment-picker.js` with a single `renderEquipmentPicker(options)` function both can call.

4. **Consolidate rest timer logic.** Timer display code is duplicated between `ui-helpers.js` and `workout-core.js`. Create `js/core/features/rest-timer.js` as a single class that manages the timer state and display updates.

### Verification
- Grep for `.split('T')[0]` — should find 0 results (all replaced).
- Grep for `|| 'Unnamed'` or `|| 'Unknown Exercise'` — should find only the new utility functions.

---

## Phase 5: Split Large Files & Remove Dead Code

**Why:** `workout-core.js` is 2,700 lines and `debug-utilities.js` ships 1,800 lines of dev-only code to production.

### Tasks

1. **Split `workout-core.js` into focused modules:**
   - `js/core/workout/workout-session.js` — session lifecycle: start, pause, complete, cancel, resume, timer
   - `js/core/workout/exercise-ui.js` — exercise card rendering, set management UI, exercise modal
   - `js/core/workout/rest-timer.js` — if not already created in Phase 4
   - Keep `workout-core.js` as a thin re-export barrel file so existing imports don't break.

2. **Gate `debug-utilities.js` behind a flag.** Only import and execute debug code when a URL param or localStorage flag is set (e.g., `?debug=true`). This keeps it available for development but out of the production path. In `main.js`, change the import to:
   ```js
   if (new URL(window.location).searchParams.has('debug')) {
     import('./core/utils/debug-utilities.js').then(mod => mod.init());
   }
   ```

3. **Remove one-time migration scripts from the main bundle.** `fix-template-exercises.js` and `pr-migration.js` should only be imported if actually needed (check a version flag in Firestore). Remove their `window` assignments from `main.js`.

4. **Update all imports across the codebase** to point to the new file locations. Run the app and verify no console errors about missing modules.

### Verification
- `workout-core.js` should be under 200 lines (just re-exports).
- Loading the app without `?debug=true` should not load debug-utilities.js (check network tab).
- All existing features should still work after the split.

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

3. **Fix color contrast.** Adjust `--text-muted` to meet WCAG AA (4.5:1 ratio against the background). A value around `#B0B8C1` should work on the dark background.

4. **Add `aria-live="polite"` to the notification container** so screen readers announce notifications.

### Verification
- Run Lighthouse accessibility audit — aim for 90+ score.
- Tab through the app with keyboard only — all interactive elements should be reachable and modals should trap focus.

---

## Phase 8: Developer Experience

**Why:** Linting and formatting prevent bugs and make the code easier to work on.

### Tasks

1. **Add ESLint with a minimal config.** Create `.eslintrc.json` with `eslint:recommended` and `env: { browser: true, es2022: true }`. Run it and fix the most critical warnings (unused variables, unreachable code).

2. **Add Prettier with a `.prettierrc`.** Set your preferred style (e.g., single quotes, 2-space indent, no trailing commas). Format the entire codebase in one commit.

3. **Consider adding Vite as a dev server.** It requires minimal config, gives you hot module reload, and can tree-shake unused code in production builds. Start with `npm create vite@latest` and copy your files in.

4. **(Optional) Add basic Firestore emulator tests.** Firebase provides a local emulator that lets you write tests against your security rules and data operations without hitting production.

### Verification
- `npx eslint js/` should pass with 0 errors.
- `npx prettier --check js/` should pass.

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

### Verification
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

### Verification
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

### Verification
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

### Verification
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

### Verification
- Log body weight for 7 consecutive days. Chart should show all 7 points plus a trend line.
- Switch between lbs and kg — chart and entries should convert.

---

## Phase 14: Data Export & Backup

**Why:** Users get anxious about data lock-in. The ability to export gives them confidence to invest in the app. It's also a common feature request on every workout app's review page.

### Tasks

1. **Add CSV export for workout history.** Create an "Export Data" button in Settings/More menu. Generate a CSV with columns: Date, Workout Name, Exercise, Set #, Reps, Weight, Unit, Notes, Duration.

2. **Add JSON backup/restore.** Export all user data (workouts, templates, exercises, equipment, locations) as a single JSON file. Add an import function that reads the JSON and writes to Firestore. This doubles as a migration tool.

3. **(Optional) Add Google Sheets integration.** Auto-sync workout logs to a Google Sheet for users who want to do their own analysis.

### Verification
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

### Verification
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
