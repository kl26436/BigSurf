# Big Surf Workout Tracker — Complete UI/UX Overhaul Roadmap

This document is a comprehensive implementation plan for Claude Code. It covers every bug fix, UI/UX improvement, tech debt cleanup, and new feature needed to bring Big Surf up to professional workout app standards. Work through each phase sequentially — later phases depend on earlier ones.

**Ground rules for all changes:**
- This is a vanilla JS app with no build process. All code must be ES6 module compatible.
- Follow existing patterns: export from module → import in `main.js` → assign to `window`.
- Use `async/await`, not raw Promises. Use `console.error()` with emoji prefixes for errors.
- All dates must use `YYYY-MM-DD` strings. Use `AppState.getTodayDateString()` for current date.
- Mobile-first. Test all layouts at 375px width minimum.
- Read `CLAUDE.md` before starting any work for full architecture context.

---

## Phase 0: Tech Debt Cleanup & Dead Code Removal

Clean up before building new things. This phase has no user-visible changes.

### 0.1 Remove dead code and migration artifacts

**Files to delete entirely:**
- `archive/style-backup-2025-12-02.css` (234KB old CSS backup)
- `archive/style.css` (234KB duplicate)
- `debug-scripts/check-parent-color.js`
- `debug-scripts/debug-timer-color.js`
- `debug-scripts/fix-timer-color.js`
- `debug-scripts/force-clear-cache.js`
- `debug-scripts/clear-cache-v2.js`
- `debug-scripts/test-streak-logic.js`

**Files to evaluate for removal** (confirm all users have been migrated first):
- `js/core/utils/fix-template-exercises.js` — one-time template format migration
- `js/core/features/pr-migration.js` — one-time PR extraction script
- If removing these, also remove their lazy-load references in `main.js` (around line 633+ where `?debug` param gates dynamic imports)

**Files to evaluate for removal or completion:**
- `js/core/utils/capacitor-push.js` — Capacitor native push stubs. If there's no native app planned, remove entirely. If native is planned, leave but don't touch during this overhaul.

### 0.2 Extract hardcoded magic numbers into a config module

Create a new file: `js/core/utils/config.js`

```javascript
// js/core/utils/config.js
export const Config = {
  // Workout session
  ABANDONED_WORKOUT_TIMEOUT_HOURS: 3,
  DEFAULT_REST_TIMER_SECONDS: 90,

  // Location
  GPS_MATCH_RADIUS_METERS: 500, // Note: CLAUDE.md says 150m but code uses 500m. Verify which is correct.

  // PR tracking
  PR_CUTOFF_DATE: '2025-07-01',

  // UI
  EXERCISE_MODAL_HISTORY_COUNT: 5, // how many past sessions to show
  RECENT_EXERCISES_COUNT: 8,       // quick-add chips in exercise picker

  // Firebase
  FIREBASE_TIMEOUT_MS: 10000,
  MAX_STREAK_QUERY_LIMIT: 100,
};
```

Then replace all hardcoded values with imports from this config:
- `pr-tracker.js:11` — `PR_CUTOFF_DATE`
- `dashboard-ui.js:87` — `ABANDONED_WORKOUT_TIMEOUT_HOURS` (the `> 3` check)
- `rest-timer.js:25,41` — `DEFAULT_REST_TIMER_SECONDS`
- `location-service.js:9` — `GPS_MATCH_RADIUS_METERS`
- `exercise-ui.js:396` — `DEFAULT_REST_TIMER_SECONDS` (the "90s" display text)

### 0.3 Consolidate duplicate streak calculation

Two files calculate streaks differently:
- `streak-tracker.js` — loads ALL workouts, dedupes by date, calculates multiple streak types
- `stats-tracker.js` — queries last 100 completed workouts, looks for consecutive days

**Action:** Keep `streak-tracker.js` as the canonical implementation (it's more comprehensive). Refactor `stats-tracker.js` to import and call the streak function from `streak-tracker.js` instead of reimplementing it. The `stats-tracker.js` should only add stats-specific logic (weekly volume, monthly counts) on top of the shared streak data.

### 0.4 Fix documentation discrepancy

In `CLAUDE.md`, the GPS radius is documented as 150m but code uses 500m (`location-service.js:9`). Verify with the actual usage which is correct, then update whichever is wrong.

### 0.5 Clean up console noise and error notifications

**Console messages:** The app has 50+ `console.log` and `console.error` statements across production modules. Many use emoji prefixes (good for debugging, noisy in production).

1. In `service-worker.js`, remove all `console.log` statements. Keep `console.error` for actual errors only.
2. In all core modules, wrap `console.log` calls in a debug check:
```javascript
import { Config } from '../utils/config.js';
function debugLog(...args) {
  if (Config.DEBUG_MODE) console.log(...args);
}
```
3. Add `DEBUG_MODE` to the config module (Phase 0.2). Set it based on URL param: `DEBUG_MODE: new URL(window.location).searchParams.has('debug')`.
4. Replace bare `console.log(...)` calls in production modules with `debugLog(...)`. Keep `console.error(...)` for actual errors since those should always be visible.
5. **Do not** touch `debug-utilities.js` — that file is already gated behind `?debug`.

**Error notifications / pop-ups:** The current error handling uses `showNotification()` with `type: 'error'` which renders as a red toast. The problem is:
- Too many errors surface to the user (Firebase timeout retries, network blips, non-critical failures)
- Error messages are developer-facing, not user-facing (e.g., "Firestore query timeout" instead of "Having trouble connecting. Your data will save when you're back online.")
- Errors stack up and feel alarming

Fix approach:
1. In `error-handler.js`, add severity levels to errors:
   - `'silent'` — log to console only (network retries, non-critical)
   - `'warn'` — show a subtle, dismissible toast (data sync issues)
   - `'error'` — show a prominent toast (save failures, auth issues)
2. Rewrite user-facing error messages to be friendly and actionable:
   - "Firestore timeout" → "Slow connection — saving will retry automatically"
   - "Auth error" → "Please sign in again to continue"
   - "Load failed" → "Couldn't load your data. Pull down to refresh."
3. Add rate limiting to error notifications — max 1 error toast per 10 seconds to prevent stacking.
4. Add the error rate limiter to `showNotification()` in `ui-helpers.js`:
```javascript
let lastErrorTime = 0;
export function showNotification(message, type = 'info', duration = 3000) {
  if (type === 'error') {
    const now = Date.now();
    if (now - lastErrorTime < 10000) return; // Rate limit errors
    lastErrorTime = now;
  }
  // ... existing notification logic ...
}
```

### 0.6 Fix innerHTML anti-pattern

In `exercise-ui.js`, replace all `container.innerHTML += ...` patterns with `insertAdjacentHTML('beforeend', ...)` or `appendChild()`. Specifically:
- Line 84: `container.innerHTML += ...` → `container.insertAdjacentHTML('beforeend', ...)`
- Apply same fix to any other `innerHTML +=` usage found in the codebase

### 0.7 Fix false "Operation failed" error on workout finish

**Bug:** When tapping "Finish" to complete a workout, an "Operation failed" error notification appears and the user stays on the workout page. However, the workout data actually saves successfully — navigating to the dashboard confirms the workout is recorded.

**Root cause investigation:**
1. In `workout-session.js`, find `completeWorkout()` (or equivalent finish handler)
2. The function likely calls multiple async operations: save workout data, update stats, detect PRs, update streaks
3. One of these operations is throwing/rejecting, which triggers the error notification via `showNotification('Operation failed', 'error')`
4. But the primary save operation succeeds before the error occurs

**Likely fix:**
- Wrap the secondary operations (PR detection, streak update, stats recalc) in individual try/catch blocks so a failure in one doesn't block the others or trigger a generic error
- The primary save (`saveWorkoutData()`) should be the only operation that can prevent navigation to dashboard
- If secondary operations fail, log them silently or as warnings — not as blocking errors
- Check for race conditions: is `completeWorkout()` being called twice (double-tap on Finish button)?
- Add a `disabled` state to the Finish button immediately on first tap to prevent double submission:
```javascript
async function completeWorkout() {
  const finishBtn = document.getElementById('finish-workout-btn');
  if (finishBtn) finishBtn.disabled = true;

  try {
    // Primary: save workout — this MUST succeed
    await saveWorkoutData();

    // Secondary: these can fail gracefully
    try { await detectAndSavePRs(); } catch (e) { debugLog('PR detection failed:', e); }
    try { await updateStreaks(); } catch (e) { debugLog('Streak update failed:', e); }
    try { await recalculateWeeklyStats(); } catch (e) { debugLog('Stats recalc failed:', e); }

    // Show completion summary (Phase 6.1) or navigate to dashboard
    navigateTo('dashboard');
  } catch (e) {
    console.error('❌ Workout save failed:', e);
    showNotification('Failed to save workout. Please try again.', 'error');
    if (finishBtn) finishBtn.disabled = false;
  }
}
```

---

## Phase 1: CSS & Layout Bug Fixes

Fix the visual bugs that make the app look broken. These are quick wins.

### 1.1 Fix massive blank vertical space

**Root cause:** Multiple containers have excessive height properties. The `.app-container` has `padding-bottom: calc(80px + env(safe-area-inset-bottom))` which stacks with section-level padding. Full-page overlay sections (`#active-workout`, `#workout-history-section`, etc.) at lines 4992-5043 in `style.css` use `min-height: 100vh` / `min-height: 100dvh`.

**Fix:**
- In `style.css`, find all inner containers (children of the main sections) that have `min-height: 100vh` or `min-height: 100dvh`. Remove these — only the outermost viewport wrapper should have viewport height.
- Check the `.stats-section` inner div (reported as 2165px computed height for 800px of content). Look for explicit `height` or `min-height` on `.stats-section` or its children. Remove or change to `min-height: auto`.
- Ensure `.app-container` padding-bottom only applies on the dashboard/scrollable views, not inside fixed overlay sections that already account for the bottom nav.
- The full-page overlay sections (lines 4992-5043) already have `bottom: calc(70px + env(...))` which accounts for nav. They should NOT also have internal padding-bottom for the nav.

### 1.2 Fix weekly goal card clipping

**Location:** `dashboard-ui.js` lines 353-399, `style.css` lines 502-539

**Problem:** "5 to go" text is clipped, card bleeds outside viewport.

**Fix:**
- On `.weekly-goal-card` or `.weekly-goal-card.compact`, ensure `overflow: hidden` and the card has proper `max-width: 100%` and `box-sizing: border-box`.
- On `.weekly-goal-status-inline`, ensure text doesn't overflow — add `white-space: nowrap` and `overflow: hidden; text-overflow: ellipsis` if needed, or ensure the parent container has sufficient padding.
- Check if the progress ring SVG (`width="80" height="80"`) is pushing content out. It may need `flex-shrink: 0`.

### 1.3 Fix weekly goal progress bar appearance

**Problem:** Progress bar looks 100% full when workout count is 0/5.

**Fix:** In `dashboard-ui.js` `renderWeeklyGoalSection()`, verify the progress bar width calculation. The teal line should be `width: ${(completedDays / weeklyGoal) * 100}%`. If `completedDays` is 0, the bar should have `width: 0%`. Check if there's a minimum width or border on `.progress-bar-fill` in CSS that makes it appear full even at 0%.

### 1.4 Fix header overlap in workout selector

**Problem:** The "Start Workout" section header with `+ New` button overlaps with the Big Surf logo/nav bar.

**Fix:** The workout selector view header should have `position: sticky` within its own section container, with `top` set to clear the global header height. Or ensure the section has proper `padding-top` to account for the fixed global header. Check `#workout-selector` positioning in the full-page overlay CSS (lines 4992-5043).

### 1.5 Fix locations section on dashboard

**Problem:** Dashboard shows "Select a location to view on map" with no locations and no map — dead space.

**Fix:** Conditionally render the locations section. In `dashboard-ui.js`, only show the locations section if the user has at least one saved location. If no locations exist, hide the section entirely. Add a check:
```javascript
const locations = await loadLocations();
if (!locations || locations.length === 0) {
  document.getElementById('dashboard-locations-section')?.classList.add('hidden');
}
```

---

## Phase 2: Active Workout — Core Flow Rework

This is the highest-impact phase. Rework how set logging, rest timers, and exercise interaction work.

### 2.1 Smart defaults from last session

**Current behavior:** Exercise defaults come from the template (static `sets`, `reps`, `weight` values). These get stale quickly.

**New behavior:** When opening an exercise in the active workout, pre-fill set fields with the user's last completed values for that exercise + equipment combination.

**Implementation:**

1. Create a new function in `data-manager.js`:
```javascript
/**
 * Gets the most recent completed workout data for a specific exercise.
 * Matches by exercise name AND equipment to get equipment-specific history.
 * Returns the sets array from the last session, or null if no history.
 */
export async function getLastSessionDefaults(exerciseName, equipment = null) {
  // Query workouts collection, ordered by date desc, limit 10
  // Loop through results looking for this exercise name + equipment match
  // Return the sets array (reps, weight, originalUnit) from the match
  // Cache results for the session to avoid repeated queries
}
```

2. In `exercise-ui.js`, modify `generateExerciseTable()` (around line 349):
   - Before rendering the table, call `getLastSessionDefaults(exercise.name, exercise.equipment)`
   - If last session data exists, use those values as placeholder/ghost text in the input fields
   - Show the last session values as grey `placeholder` attributes on the inputs
   - The user can type over them or tap to accept
   - If no last session data, fall back to template defaults as currently done

3. Visual treatment: Last-session values should appear as light grey placeholder text, not pre-filled black text. This lets users distinguish "I entered this" from "suggested from last time."

4. Add a small label above the set table: "Last session: Jan 15" (date of the session the defaults came from) so users have context.

### 2.2 Per-set completion checkboxes

**Current behavior:** Only whole-exercise completion via "Mark Exercise Complete" button at the bottom of the modal.

**New behavior:** Each set row gets a checkbox/tap target. Tapping it marks that set as done and provides visual feedback.

**Implementation:**

1. In `exercise-ui.js` `generateExerciseTable()`, add a completion column to each set row:
```html
<td class="set-complete-cell">
  <button class="set-check ${set.completed ? 'checked' : ''}"
          onclick="toggleSetComplete(${exerciseIndex}, ${setIndex})"
          aria-label="Mark set ${setIndex + 1} complete">
    <i class="fas ${set.completed ? 'fa-check-circle' : 'fa-circle'}"></i>
  </button>
</td>
```

2. Create `toggleSetComplete(exerciseIndex, setIndex)` function:
   - Toggle `AppState.savedData.exercises[exercise_${exerciseIndex}].sets[setIndex].completed`
   - Update the button icon (circle → check-circle)
   - Add a subtle green tint to the completed row
   - Auto-start rest timer after set completion (see 2.4)
   - Call `debouncedSaveWorkoutData()` to persist
   - Update the exercise card progress bar on the main workout screen

3. The "Mark Exercise Complete" button should auto-check when all sets are completed, and vice versa — completing all sets individually should mark the exercise complete.

4. Export `toggleSetComplete` in the module, import in `main.js`, assign to `window`.

### 2.3 Swipe-to-delete sets

**Current behavior:** Remove set via button at bottom of set table.

**New behavior:** Swipe left on a set row to reveal delete action. Also keep the remove button as fallback.

**Implementation:**

1. Add touch event handlers to set rows in the exercise modal:
```javascript
function addSwipeToDelete(rowElement, exerciseIndex, setIndex) {
  let startX = 0;
  let currentX = 0;

  rowElement.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
  });

  rowElement.addEventListener('touchmove', (e) => {
    currentX = e.touches[0].clientX;
    const diff = startX - currentX;
    if (diff > 0 && diff < 80) {
      rowElement.style.transform = `translateX(-${diff}px)`;
    }
  });

  rowElement.addEventListener('touchend', () => {
    const diff = startX - currentX;
    if (diff > 60) {
      // Show delete confirmation or delete directly
      removeSetFromExercise(exerciseIndex, setIndex);
    } else {
      rowElement.style.transform = 'translateX(0)';
    }
  });
}
```

2. Add a hidden delete button that's revealed by the swipe:
```css
.set-row-wrapper {
  position: relative;
  overflow: hidden;
}
.set-delete-bg {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 80px;
  background: var(--danger);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}
```

### 2.4 Persistent rest timer in workout header

**Current behavior:** Rest timer only visible inside exercise modal. Main workout screen shows "-- REST" as static text in `#workout-rest-timer`.

**New behavior:** Rest timer displays prominently in the workout header area, visible without opening any modal. Auto-starts after marking a set complete.

**Implementation:**

1. The element already exists: `#workout-rest-timer` (index.html line 431-433) with `#workout-rest-stat`. Currently shows "--" as the rest value.

2. In `rest-timer.js`, modify `startModalRestTimer()` to ALSO update `#workout-rest-timer` in the main workout header. Use `requestAnimationFrame` to keep both in sync (modal timer + header timer).

3. Make the header rest timer **compact and secondary** when active — it should NOT visually compete with the set/exercise counts. The current teal pill treatment is too dominant. Use a smaller, subtler treatment:
```css
#workout-rest-stat.timer-active {
  background: rgba(29, 211, 176, 0.12);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
}
#workout-rest-stat.timer-active .workout-stat-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--primary);
}
/* Only pulse the text color, not the whole background */
#workout-rest-stat.timer-active .workout-stat-value {
  animation: timer-pulse 1.5s ease-in-out infinite;
}
@keyframes timer-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```
The timer should feel like a secondary status indicator (like a badge), not a hero element. The set/exercise counts and workout name are the primary content.

4. Auto-start: When `toggleSetComplete()` is called (from 2.2), automatically start the rest timer. Import `Config.DEFAULT_REST_TIMER_SECONDS` for the duration. The user can skip via the header timer or the modal timer.

5. When timer completes, change the header display to "GO!" in green for 3 seconds, with vibration feedback (existing pattern in rest-timer.js). Then reset to "--".

6. Make the header timer tappable — tapping it should either skip the timer or open a quick +15s/-15s adjustment.

### 2.5 Make exercise cards obviously tappable

**Current behavior:** Exercise cards in the workout view are plain cards with a progress bar and delete button. No visual indication they're interactive.

**New behavior:** Cards should clearly invite tapping to open the exercise detail modal.

**Implementation:**

1. In `exercise-ui.js` `createExerciseCard()`, add visual affordances:
   - Add a chevron icon (`fa-chevron-right`) on the right side of each card
   - Add `cursor: pointer` (already may exist, verify)
   - Add a subtle hover/active state:
```css
.exercise-card {
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.exercise-card:active {
  transform: scale(0.98);
  box-shadow: 0 0 0 2px var(--primary);
}
```

2. Add a "Tap to log sets" subtitle text on cards that have 0 completed sets:
```html
<span class="exercise-card-hint">Tap to log sets</span>
```
Hide this hint once the user has logged at least one set for that exercise.

3. Style the card tap area to exclude the delete button (prevent accidental deletions when trying to open the modal). The delete button should have `event.stopPropagation()` on its click handler.

### 2.6 Improve kg display — whole numbers not decimals

**Current behavior:** In `ui-helpers.js` `convertWeight()`, lbs→kg conversion uses `Math.round(weight * 0.453592 * 10) / 10` which gives 1 decimal place (e.g., 67.5 kg).

**Fix:** For display purposes in set logging inputs and defaults, round kg to the nearest 0.5 (since most gym plates come in 0.5kg increments in metric gyms, or 2.5kg increments):

```javascript
// In convertWeight() for lbs to kg:
const kg = weight * 0.453592;
return Math.round(kg * 2) / 2; // Round to nearest 0.5
```

For the default template values (which are stored in lbs), when displaying in kg mode, use this same rounding. This prevents values like "22.7 kg" appearing in input fields — instead showing "22.5 kg".

### 2.7 Compact action button row — reduce visual footprint

**Problem:** The Cancel / Add Exercise / More / Finish button row takes up too much vertical space in the active workout view. Four full-width-ish text buttons compete for attention and push exercise content down.

**Fix:** Restructure the action row to minimize footprint:

```html
<div class="workout-action-bar">
  <!-- Primary action: always visible, full width -->
  <button class="btn btn-primary btn-full" onclick="finishWorkout()" id="finish-workout-btn">
    <i class="fas fa-check"></i> Finish Workout
  </button>

  <!-- Secondary actions: icon-only row below -->
  <div class="workout-secondary-actions">
    <button class="btn-icon-label" onclick="addExerciseToWorkout()">
      <i class="fas fa-plus"></i>
      <span>Add</span>
    </button>
    <button class="btn-icon-label" onclick="toggleWorkoutOverflowMenu()">
      <i class="fas fa-ellipsis-h"></i>
      <span>More</span>
    </button>
    <button class="btn-icon-label btn-icon-label--danger" onclick="cancelWorkout()">
      <i class="fas fa-times"></i>
      <span>Cancel</span>
    </button>
  </div>
</div>
```

```css
.workout-action-bar {
  padding: 12px var(--pad-page);
  background: var(--bg-surface);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
.workout-secondary-actions {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-top: 10px;
}
.btn-icon-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--font-xs);
  cursor: pointer;
  padding: 6px 12px;
}
.btn-icon-label i {
  font-size: 1.1rem;
}
.btn-icon-label:active {
  color: var(--primary);
}
.btn-icon-label--danger:active {
  color: var(--danger);
}
```

This pattern: "Finish" is the hero action (full-width primary button). Add / More / Cancel are small icon+label items below — similar to how iOS action sheets have a prominent action and secondary options. Total height goes from ~120px (4 stacked buttons) to ~80px (1 button + icon row).

### 2.8 Auto-sort completed exercises to bottom

**Problem:** When you complete all sets for an exercise, the card stays in its original position. As you work through a long workout, you have to scroll past completed exercises to find the next one you need to do.

**New behavior:** When an exercise is marked complete, animate it down to the bottom of the exercise list. Incomplete exercises stay at the top in their original order.

**Implementation:**

1. In `exercise-ui.js`, after marking an exercise complete (all sets done or manual "Mark Complete"), call `reorderExercisesByCompletion()`:

```javascript
function reorderExercisesByCompletion() {
  const container = document.getElementById('exercise-list'); // or whatever the container ID is
  const cards = Array.from(container.querySelectorAll('.exercise-card'));

  // Sort: incomplete first (in original order), completed last (in completion order)
  const incomplete = cards.filter(c => !c.classList.contains('completed'));
  const completed = cards.filter(c => c.classList.contains('completed'));

  // Add a separator if there are both incomplete and completed
  const fragment = document.createDocumentFragment();
  incomplete.forEach(card => fragment.appendChild(card));

  if (incomplete.length > 0 && completed.length > 0) {
    // Add a visual separator
    let separator = container.querySelector('.completed-separator');
    if (!separator) {
      separator = document.createElement('div');
      separator.className = 'completed-separator';
      separator.innerHTML = `<span>Completed</span>`;
    }
    fragment.appendChild(separator);
  }

  completed.forEach(card => fragment.appendChild(card));
  container.appendChild(fragment);
}
```

2. **Animate the move** — when a card transitions from incomplete to complete:
```css
.exercise-card.just-completed {
  animation: slide-to-bottom 0.4s ease;
}
@keyframes slide-to-bottom {
  0% { opacity: 0.5; transform: translateY(-10px); }
  100% { opacity: 0.7; transform: translateY(0); }
}
.completed-separator {
  text-align: center;
  padding: 8px 0;
  font-size: var(--font-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

3. **De-emphasize completed cards** — reduce opacity and collapse the set preview:
```css
.exercise-card.completed {
  opacity: 0.6;
}
.exercise-card.completed .exercise-card-sets-preview {
  max-height: 0;
  overflow: hidden;
  margin: 0;
  transition: max-height 0.3s ease, margin 0.3s ease;
}
```

4. **Auto-scroll** to the next incomplete exercise after a completion:
```javascript
function scrollToNextIncomplete() {
  const next = document.querySelector('.exercise-card:not(.completed)');
  if (next) {
    next.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
```

5. **Important:** This reorder is visual only — it does NOT change the `AppState.savedData.exercises` order or the Firestore document. The exercise indices stay the same so set logging continues to work correctly. Only the DOM order changes.

### 2.9 Unit conversion in workout history and charts

**Problem:** The lb/kg toggle on an exercise only affects the current workout display. When viewing workout history or stats charts, past workouts show in whatever unit they were originally logged in. If you switch gyms (metric vs imperial) or change your unit preference, your history becomes a confusing mix of units.

**Fix:** All history views and charts should display weights in the user's current preferred unit, regardless of what `originalUnit` each set was logged in.

**Implementation:**

1. The `originalUnit` field already exists on every set in Firestore — this is the source of truth for what unit the weight was stored in.

2. Create a display conversion utility in `ui-helpers.js`:
```javascript
/**
 * Converts a stored weight to the user's preferred display unit.
 * @param {number} weight - The stored weight value
 * @param {string} storedUnit - The unit it was stored in ('lbs' or 'kg')
 * @param {string} displayUnit - The unit to display in (from AppState.settings.weightUnit)
 * @returns {number} The converted weight, rounded appropriately
 */
export function displayWeight(weight, storedUnit, displayUnit) {
  if (storedUnit === displayUnit) return weight;
  if (storedUnit === 'lbs' && displayUnit === 'kg') {
    return Math.round(weight * 0.453592 * 2) / 2; // Round to nearest 0.5 kg
  }
  if (storedUnit === 'kg' && displayUnit === 'lbs') {
    return Math.round(weight * 2.20462); // Round to nearest lb
  }
  return weight;
}
```

3. **Apply in workout history** (`workout-history-ui.js`): When rendering past workout details, pass each set's weight through `displayWeight(set.weight, set.originalUnit, AppState.settings.weightUnit)`.

4. **Apply in stats charts** (`stats-ui.js`): When building chart datasets, convert all weight data points to the user's preferred unit before plotting. Add unit label to the Y-axis: `"Weight (${AppState.settings.weightUnit})"`.

5. **Apply in PR tracker** (`pr-tracker.js`): When displaying PRs, convert to current display unit. Note: PR *detection* should still compare in the original stored unit to avoid false PRs from rounding errors. Only the *display* converts.

6. **Show unit label** wherever weights appear in history: "135 lbs" or "61 kg", never ambiguous bare numbers.

### 2.10 Simplify exercise detail modal header

**Problem:** The exercise detail modal header is cluttered — edit icon, swap/replace icon, close icon, gym/location name, sync indicator, and the exercise name all compete for space. On a phone screen it's hard to parse what's important.

**Fix:** Establish a clear hierarchy:

```html
<div class="exercise-detail-header">
  <!-- Row 1: Exercise name + close button -->
  <div class="exercise-detail-title-row">
    <h3 class="exercise-detail-name">${exerciseName}</h3>
    <button class="btn-icon" onclick="closeExerciseDetail()" aria-label="Close">
      <i class="fas fa-times"></i>
    </button>
  </div>

  <!-- Row 2: Equipment + meta (subtle, secondary) -->
  <div class="exercise-detail-meta">
    <span class="exercise-detail-equipment">
      <i class="fas fa-cog"></i> ${equipmentName || 'No equipment'}
    </span>
    ${location ? `<span class="exercise-detail-location"><i class="fas fa-map-marker-alt"></i> ${location}</span>` : ''}
  </div>

  <!-- Row 3: Action pills (only the most used actions) -->
  <div class="exercise-detail-actions">
    <button class="btn-text btn-small" onclick="replaceExercise(${idx})">
      <i class="fas fa-exchange-alt"></i> Swap
    </button>
    <button class="btn-text btn-small" onclick="editExerciseDefaults(${idx})">
      <i class="fas fa-pen"></i> Edit
    </button>
    <button class="btn-text btn-small" onclick="toggleFormVideo(${idx})">
      <i class="fas fa-play-circle"></i> Video
    </button>
  </div>
</div>
```

```css
.exercise-detail-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.exercise-detail-name {
  font-size: var(--font-xl);
  font-weight: 700;
  color: var(--text-strong);
  margin: 0;
}
.exercise-detail-meta {
  display: flex;
  gap: 12px;
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin-top: 4px;
}
.exercise-detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
```

Key changes: exercise name is the only large text. Equipment/location are small meta underneath. Actions are a row of text buttons with icons — not competing with the title. Close button is standard top-right X. Sync indicator removed from the header (move to a global status indicator if needed).

---

## Phase 3: Exercise Reorder & Mid-Workout Flexibility

### 3.1 Drag-and-drop exercise reorder

**Current state:** No reorder support. Exercises render in fixed array order.

**Implementation:**

1. Use the HTML5 Drag and Drop API with touch polyfill for mobile. Since we can't add npm packages to the browser app, implement a lightweight touch-based reorder:

```javascript
// In exercise-ui.js, add to createExerciseCard():

// Add drag handle to each card
const dragHandle = document.createElement('div');
dragHandle.className = 'exercise-drag-handle';
dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
dragHandle.setAttribute('aria-label', 'Drag to reorder');

// Touch-based reorder
let draggedCard = null;
let draggedIndex = -1;
let placeholder = null;

function initDragReorder(container) {
  container.addEventListener('touchstart', handleDragStart, { passive: false });
  container.addEventListener('touchmove', handleDragMove, { passive: false });
  container.addEventListener('touchend', handleDragEnd);
}
```

2. On drag completion, update `AppState.currentWorkout.exercises` array order and `AppState.savedData.exercises` (renumber the `exercise_N` keys). Then call `renderExercises()` to rebuild the card list and `debouncedSaveWorkoutData()` to persist.

3. Add a reorder mode toggle button in the workout hero actions area (next to Add Exercise):
```html
<button class="btn-workout-action btn-reorder" onclick="toggleReorderMode()">
  <i class="fas fa-arrows-alt-v"></i> Reorder
</button>
```

4. When reorder mode is active:
   - Show drag handles on all exercise cards
   - Hide delete buttons (prevent accidents during reorder)
   - Add a "Done" button to exit reorder mode
   - Cards get a dashed border to indicate they're draggable

5. Export `toggleReorderMode` and assign to `window` in `main.js`.

### 3.2 Exercise swap/replace

**New feature:** When viewing an exercise in the modal, offer a "Replace" option that swaps it for a different exercise targeting the same muscle group.

**Implementation:**

1. Add a "Replace" button to the exercise modal header area (near the exercise title):
```html
<button class="btn-icon" onclick="replaceExercise(${exerciseIndex})" aria-label="Replace exercise">
  <i class="fas fa-exchange-alt"></i>
</button>
```

2. `replaceExercise(index)` should:
   - Get the current exercise's `bodyPart`
   - Open the exercise library modal pre-filtered to that body part
   - When user selects a replacement, swap it into the same position in the workout
   - Preserve any logged sets if the user confirms (or clear them with a prompt)
   - Close the exercise library modal and reopen the exercise detail modal with the new exercise

3. Export and assign to `window`.

### 3.3 Sticky "Add Exercise" button

**Current behavior:** The "Add Exercise" button is in the workout hero area at the top. When scrolling through a long exercise list, it's not visible.

**Fix:** Make the workout action buttons (Cancel / Add Exercise / Finish) sticky at the bottom of the workout view, above the bottom nav:

```css
.workout-hero-actions {
  position: sticky;
  bottom: calc(70px + env(safe-area-inset-bottom, 0px));
  z-index: 10;
  background: var(--bg-surface);
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
```

This keeps Cancel/Add/Finish always accessible regardless of scroll position.

---

## Phase 4: Template Selection & Workout Start Flow

Reduce the taps from app open to logging the first set.

### 4.1 Reduce taps to start workout

**Current flow:** Nav tap (1) → Category grid (2) → Template list (3) → Start button (4) = 4 taps minimum.

**Target flow:** 2 taps from dashboard, 3 taps maximum from anywhere.

**Implementation:**

1. **Dashboard quick-start cards:** In `dashboard-ui.js`, the suggested workouts section should render as prominent, clearly tappable cards with a "Start" button:
```html
<div class="quick-start-card" onclick="startSuggestedWorkout('${templateId}', ${isDefault})">
  <div class="quick-start-info">
    <h4>${templateName}</h4>
    <span class="quick-start-meta">${exerciseCount} exercises</span>
  </div>
  <button class="btn btn-primary btn-small">Start</button>
</div>
```

2. **Recent workouts on template selection screen:** At the top of the template selection modal, add a "Recent" section showing the last 3 workout types the user did. One tap to start any of them:
```javascript
async function getRecentWorkoutTypes(userId, limit = 3) {
  // Query workouts ordered by date desc, get unique workoutType values
  // Return array of { workoutType, templateId, lastDate }
}
```

3. **Skip category step when few templates:** If user has fewer than 8 templates total, skip the category grid and show all templates directly as a flat list.

### 4.2 Favorites in exercise picker

**New feature:** Let users mark exercises as favorites for quick access.

**Implementation:**

1. Add a favorites array to the user's Firestore profile or a dedicated `favorites` subcollection.

2. In `exercise-library.js`, add a star/heart toggle on each exercise in the library:
```html
<button class="btn-icon favorite-toggle ${isFavorite ? 'active' : ''}"
        onclick="toggleExerciseFavorite('${exerciseId}')">
  <i class="fas ${isFavorite ? 'fa-star' : 'fa-star'}"
     style="color: ${isFavorite ? 'gold' : 'grey'}"></i>
</button>
```

3. In the exercise picker (when adding exercise to workout), show favorites as a section above "Recent" and above the full library:
```
[Favorites]     ★ Bench Press  ★ Squat  ★ Deadlift
[Recent]        Cable Fly  Lat Pulldown  Leg Press
[All Exercises] Search... | Filter by body part ▼
```

4. Store favorites in Firestore: `users/{userId}/preferences/favorites` with an array of exercise names/IDs.

### 4.3 Empty states

**Problem:** Dashboard shows zeroes with no call to action when there's no activity.

**Fix:** Add meaningful empty states:

1. **Dashboard — no workouts this week:**
```html
<div class="empty-state">
  <i class="fas fa-dumbbell empty-state-icon"></i>
  <h3>No workouts this week yet</h3>
  <p>Start your first workout to see your progress here.</p>
  <button class="btn btn-primary" onclick="navigateTo('workout')">Start Workout</button>
</div>
```

2. **Workout history — no history:**
```html
<div class="empty-state">
  <i class="fas fa-calendar-alt empty-state-icon"></i>
  <h3>No workout history</h3>
  <p>Complete your first workout and it will show up here.</p>
</div>
```

3. **Stats page — no data:**
```html
<div class="empty-state">
  <i class="fas fa-chart-line empty-state-icon"></i>
  <h3>Not enough data yet</h3>
  <p>Complete a few workouts to see your progress charts and personal records.</p>
</div>
```

Style:
```css
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-secondary);
}
.empty-state-icon {
  font-size: 3rem;
  margin-bottom: 16px;
  opacity: 0.3;
}
.empty-state h3 {
  margin-bottom: 8px;
  color: var(--text-primary);
}
```

---

## Phase 5: Dashboard Redesign & Navigation

This phase goes beyond bug fixes — it's a visual and functional redesign of the dashboard to feel like a modern fitness app. The current dashboard is functional but flat: same-styled dark cards, text-only stats, minimal visual hierarchy. Compare to Hevy/Strong where the dashboard has large progress rings, inline sparklines, color-coded indicators, and motivational elements.

### 5.1 Fix in-progress workout banner

**Problem:** The `#resume-workout-banner` has `class="hidden"` in index.html (line 251) and the `checkForInProgressWorkout()` function in `dashboard-ui.js` (line 47) is supposed to remove the `hidden` class, but it's not working.

**Debug steps:**
1. In `dashboard-ui.js`, find `checkForInProgressWorkout()` (line 47).
2. Trace the logic: it queries today's workouts, checks for incomplete ones (no `completedAt`, not cancelled).
3. Find where `card.classList.remove('hidden')` should be called.
4. Check for race conditions: is the dashboard rendering before the Firebase query completes?
5. Check if the 3-hour timeout logic is prematurely hiding the banner.

**Likely fix:** The function may be checking `window.inProgressWorkout` which gets cleared on page refresh. The fix is to always query Firestore for incomplete workouts on dashboard load, not rely on in-memory state.

**Redesigned banner:** Once the logic is fixed, upgrade the visual treatment. The in-progress banner should be the most prominent element on the dashboard — it's the primary action the user needs to take:

```html
<div class="resume-banner">
  <div class="resume-banner-glow"></div> <!-- Subtle animated glow border -->
  <div class="resume-banner-content">
    <div class="resume-banner-header">
      <span class="resume-pulse-dot"></span> <!-- Animated pulsing green dot -->
      <h3>Workout In Progress</h3>
      <span class="resume-time-ago">2 min ago</span>
    </div>
    <div class="resume-banner-body">
      <div class="resume-workout-name">Chest — Push</div>
      <div class="resume-progress-ring-row">
        <!-- Circular progress ring (larger, 60px) showing exercise completion -->
        <svg class="resume-ring" width="60" height="60">
          <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.08)" stroke-width="4" fill="none"/>
          <circle cx="30" cy="30" r="26" stroke="var(--primary)" stroke-width="4" fill="none"
                  stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                  stroke-linecap="round" transform="rotate(-90 30 30)"/>
        </svg>
        <div class="resume-stats-compact">
          <span>3/6 Sets</span>
          <span>2/3 Exercises</span>
          <span>5:23 Elapsed</span>
        </div>
      </div>
    </div>
    <div class="resume-banner-actions">
      <button class="btn btn-primary btn-full" onclick="continueInProgressWorkout()">
        Continue Workout
      </button>
      <button class="btn-text-small" onclick="discardInProgressWorkout()">Discard</button>
    </div>
  </div>
</div>
```

```css
.resume-banner {
  background: linear-gradient(135deg, rgba(29, 211, 176, 0.08), rgba(29, 211, 176, 0.02));
  border: 1px solid rgba(29, 211, 176, 0.2);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: var(--gap-section);
  position: relative;
  overflow: hidden;
}
.resume-pulse-dot {
  width: 8px;
  height: 8px;
  background: var(--success);
  border-radius: 50%;
  display: inline-block;
  animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(54, 196, 107, 0.4); }
  50% { opacity: 0.8; box-shadow: 0 0 0 6px rgba(54, 196, 107, 0); }
}
```

### 5.2 Redesign weekly goal section

**Current:** Small 80px progress ring with text stats beside it. Clipping issues.

**Redesign:** Make the weekly goal the hero element. Larger ring (120px), animated fill on load, day-by-day indicator dots below showing which days of the week had workouts:

```html
<div class="weekly-goal-hero">
  <div class="weekly-ring-container">
    <!-- Larger animated progress ring -->
    <svg class="weekly-ring" width="120" height="120">
      <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,0.06)" stroke-width="8" fill="none"/>
      <circle cx="60" cy="60" r="52" stroke="var(--primary)" stroke-width="8" fill="none"
              stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
              stroke-linecap="round" transform="rotate(-90 60 60)"
              class="ring-progress" /> <!-- Animate with CSS transition -->
    </svg>
    <div class="ring-center-text">
      <span class="ring-count">${completed}</span>
      <span class="ring-goal">of ${goal}</span>
    </div>
  </div>

  <!-- Day-of-week dots: M T W T F S S -->
  <div class="week-day-dots">
    <span class="day-dot ${mon ? 'completed' : today === 'Mon' ? 'today' : ''}">M</span>
    <span class="day-dot ${tue ? 'completed' : ''}">T</span>
    <span class="day-dot ${wed ? 'completed' : ''}">W</span>
    <!-- ... -->
  </div>

  <!-- Inline weekly stats row -->
  <div class="weekly-stats-row">
    <div class="weekly-stat">
      <span class="weekly-stat-value">${totalSets}</span>
      <span class="weekly-stat-label">Sets</span>
    </div>
    <div class="weekly-stat-divider"></div>
    <div class="weekly-stat">
      <span class="weekly-stat-value">${totalVolume}</span>
      <span class="weekly-stat-label">Volume</span>
    </div>
    <div class="weekly-stat-divider"></div>
    <div class="weekly-stat">
      <span class="weekly-stat-value">${totalMinutes}</span>
      <span class="weekly-stat-label">Minutes</span>
    </div>
  </div>
</div>
```

```css
.weekly-goal-hero {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 24px;
  text-align: center;
  margin-bottom: var(--gap-section);
}
.ring-progress {
  transition: stroke-dashoffset 1s ease-out; /* Animated fill on load */
}
.ring-count {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-strong);
}
.ring-goal {
  font-size: 0.8rem;
  color: var(--text-muted);
  display: block;
}
.week-day-dots {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 16px 0;
}
.day-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
}
.day-dot.completed {
  background: var(--primary);
  color: white;
}
.day-dot.today {
  border: 2px solid var(--primary);
  color: var(--primary);
}
.weekly-stats-row {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 16px;
}
```

### 5.3 Redesign suggested workouts as quick-start cards

**Current:** Flat text rows with a dumbbell icon and chevron. Don't look clickable or exciting.

**Redesign:** Prominent action cards with category color coding, muscle group tags, estimated time, and a clear "Start" button. The top suggestion should be larger/featured:

```html
<div class="suggested-section">
  <div class="section-header">
    <h3>Today's Workouts</h3>
    <button class="btn-text-small" onclick="navigateTo('workout')">See all</button>
  </div>

  <!-- Featured suggestion (larger card) -->
  <div class="suggested-featured" onclick="startSuggestedWorkout('${id}', ${isDefault})">
    <div class="suggested-featured-accent" style="background: ${categoryColor}"></div>
    <div class="suggested-featured-content">
      <div class="suggested-category-badge" style="background: ${categoryColor}20; color: ${categoryColor}">
        ${category}
      </div>
      <h4 class="suggested-name">${templateName}</h4>
      <div class="suggested-meta-row">
        <span><i class="fas fa-dumbbell"></i> ${exerciseCount} exercises</span>
        <span><i class="fas fa-clock"></i> ~${estimatedMinutes} min</span>
      </div>
      <div class="suggested-muscle-tags">
        ${muscleTags.map(t => `<span class="muscle-tag">${t}</span>`).join('')}
      </div>
    </div>
    <button class="btn btn-primary">Start</button>
  </div>

  <!-- Secondary suggestions (compact row cards) -->
  ${otherSuggestions.map(s => `
    <div class="suggested-compact" onclick="startSuggestedWorkout('${s.id}', ${s.isDefault})">
      <div class="suggested-compact-bar" style="background: ${s.color}"></div>
      <div class="suggested-compact-info">
        <span class="suggested-compact-name">${s.name}</span>
        <span class="suggested-compact-meta">${s.exerciseCount} exercises</span>
      </div>
      <i class="fas fa-play-circle" style="color: var(--primary); font-size: 1.2rem;"></i>
    </div>
  `).join('')}
</div>
```

Category color mapping:
```javascript
const CATEGORY_COLORS = {
  'Push':     '#4A90D9', // Blue
  'Pull':     '#D94A7A', // Pink/Red
  'Legs':     '#7B4AD9', // Purple
  'Cardio':   '#D9A74A', // Gold
  'Core':     '#4AD9A7', // Green
  'Arms':     '#D96A4A', // Orange
  'Full Body':'#4AD9D9', // Cyan
  'Custom':   'var(--primary)', // Teal
};
```

```css
.suggested-featured {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 10px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.1s ease;
}
.suggested-featured:active {
  transform: scale(0.98);
}
.suggested-featured-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}
.suggested-category-badge {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: 4px;
  display: inline-block;
  margin-bottom: 4px;
}
.muscle-tag {
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 4px;
}
.suggested-compact {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
.suggested-compact-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
```

### 5.4 Redesign streak display

**Current:** Three identical-looking boxes in a row with icons and numbers.

**Redesign:** Make the current streak the hero with an animated flame, and show the others as supporting context. Add a streak calendar heatmap (like GitHub's contribution graph) for the current month:

```html
<div class="streak-section">
  <!-- Current streak: hero treatment -->
  <div class="streak-hero ${currentStreak > 0 ? 'active' : ''}">
    <div class="streak-flame-wrap">
      <i class="fas fa-fire streak-flame ${currentStreak >= 7 ? 'on-fire' : ''}"></i>
      <span class="streak-count">${currentStreak}</span>
    </div>
    <div class="streak-hero-text">
      <span class="streak-label">Day Streak</span>
      <span class="streak-subtext">${currentStreak > 0 ? 'Keep it going!' : 'Start a streak today'}</span>
    </div>
  </div>

  <!-- Supporting stats row -->
  <div class="streak-stats-row">
    <div class="streak-stat">
      <span class="streak-stat-value">${longestStreak}</span>
      <span class="streak-stat-label">Best Streak</span>
    </div>
    <div class="streak-stat">
      <span class="streak-stat-value">${thisMonth}</span>
      <span class="streak-stat-label">This Month</span>
    </div>
    <div class="streak-stat">
      <span class="streak-stat-value">${totalWorkouts}</span>
      <span class="streak-stat-label">All Time</span>
    </div>
  </div>

  <!-- Mini month heatmap (current month only) -->
  <div class="streak-heatmap">
    ${daysInMonth.map(day => `
      <div class="heatmap-cell ${day.hasWorkout ? 'active' : ''} ${day.isToday ? 'today' : ''}"
           title="${day.date}">
      </div>
    `).join('')}
  </div>
</div>
```

```css
.streak-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  margin-bottom: 12px;
}
.streak-hero.active {
  background: linear-gradient(135deg, rgba(247, 168, 101, 0.1), rgba(247, 168, 101, 0.02));
  border: 1px solid rgba(247, 168, 101, 0.15);
}
.streak-flame-wrap {
  position: relative;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.streak-flame {
  font-size: 2.5rem;
  color: var(--highlight-warm);
  opacity: 0.3;
}
.streak-hero.active .streak-flame {
  opacity: 1;
}
.streak-flame.on-fire {
  animation: flame-glow 2s ease-in-out infinite;
}
@keyframes flame-glow {
  0%, 100% { filter: drop-shadow(0 0 4px rgba(247, 168, 101, 0.4)); }
  50% { filter: drop-shadow(0 0 12px rgba(247, 168, 101, 0.6)); }
}
.streak-count {
  position: absolute;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-strong);
}
.heatmap-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.04);
}
.heatmap-cell.active {
  background: var(--primary);
}
.heatmap-cell.today {
  border: 1px solid var(--primary);
}
.streak-heatmap {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 12px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
}
```

### 5.5 Redesign recent PRs with inline progress

**Current:** Text list with dumbbell icons.

**Redesign:** Show PRs as achievement cards with the exercise trend inline:

```html
<div class="pr-card">
  <div class="pr-card-header">
    <i class="fas fa-trophy" style="color: gold;"></i>
    <span class="pr-exercise">${exerciseName}</span>
    <span class="pr-date">${relativeDate}</span>
  </div>
  <div class="pr-card-body">
    <span class="pr-value">${weight} ${unit}</span>
    <span class="pr-detail">× ${reps} reps</span>
    <span class="pr-improvement ${isUp ? 'up' : ''}">
      ${isUp ? '↑' : ''} ${improvementText}
    </span>
  </div>
  <!-- Mini sparkline showing weight progression for this exercise -->
  <div class="pr-sparkline">
    <svg width="100%" height="32">
      <polyline points="${sparklinePoints}" fill="none" stroke="var(--primary)" stroke-width="1.5"/>
      <circle cx="${lastX}" cy="${lastY}" r="3" fill="var(--primary)"/> <!-- Current point highlighted -->
    </svg>
  </div>
</div>
```

### 5.6 Add week-over-week comparison chip

**New widget:** A small inline indicator showing total volume trend vs. last week. Goes in the weekly stats row:

```html
<div class="volume-trend-chip ${trend >= 0 ? 'up' : 'down'}">
  <i class="fas fa-arrow-${trend >= 0 ? 'up' : 'down'}"></i>
  ${Math.abs(trend)}% vs last week
</div>
```

### 5.7 "More" menu as bottom sheet

**Current state:** Plain dropdown menu (`#more-menu` in index.html lines 1847-1906) with `.more-menu` class.

**Rework to bottom sheet:**

```css
.more-menu {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  transform: translateY(100%);
  transition: transform 0.3s ease;
  z-index: 400;
  max-height: 70vh;
  overflow-y: auto;
}
.more-menu.visible {
  transform: translateY(0);
}
.more-menu-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}
```

Update `toggleMoreMenu()` in `navigation.js` to use `visible` class instead of `hidden`, with the slide-up animation. Add a drag-to-dismiss gesture on the sheet handle.

Add a small drag handle bar at the top:
```html
<div class="bottom-sheet-handle"></div>
```
```css
.bottom-sheet-handle {
  width: 40px;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  margin: 0 auto 16px;
}
```

### 5.8 Fix "Workouts" vs "Tracked" labels

**Location:** `stats-ui.js` lines 284-296

**Problem:** Both show the same number.

**Fix:** Rename "Tracked" to "Exercises" and show total unique exercises logged (use `new Set()` of exercise names across all workouts). This is a meaningful distinction from total workout count.

### 5.9 Fix calendar red X marks

**Location:** `workout-history.js` lines 420-424

**Fix:**
1. Remove the red X entirely. Days without workouts should be empty/default styled. Only highlight days WITH workouts (positive reinforcement, not negative).
2. Add a small legend below the calendar:
```html
<div class="calendar-legend">
  <span class="legend-item"><span class="legend-dot completed"></span> Workout logged</span>
  <span class="legend-item"><span class="legend-dot today"></span> Today</span>
</div>
```

### 5.10 Make calendar dates tappable for workout details

In `workout-history.js`, ensure each calendar date cell with a workout has a clear click handler that opens the workout detail modal. Add visual hover/active state. If multiple workouts exist for that day, show a picker.

### 5.11 Conditionally hide locations section

Only show the locations/map section on the dashboard if the user has at least one saved location. If none exist, hide entirely — don't show dead "Select a location to view on map" space.

---

## Phase 6: Workout Completion Experience

### 6.1 Workout completion summary screen

**Current behavior:** Completing a workout saves data and navigates back to dashboard. No celebration or summary.

**New behavior:** Show a summary modal with stats, PRs, and comparison to last session.

**Implementation:**

1. Create a new function in `workout-session.js`:
```javascript
async function showWorkoutSummary(workoutData) {
  // Calculate summary stats
  const totalSets = countCompletedSets(workoutData);
  const totalVolume = calculateTotalVolume(workoutData); // weight × reps for all sets
  const duration = workoutData.totalDuration;
  const prsHit = await getNewPRsFromWorkout(workoutData); // from pr-tracker

  // Get comparison data
  const lastSession = await getLastSessionForTemplate(workoutData.workoutType);
  const volumeChange = lastSession ? ((totalVolume - lastSession.volume) / lastSession.volume * 100) : null;

  // Build summary modal HTML
  const summaryHTML = `
    <div class="workout-summary">
      <div class="summary-header">
        <i class="fas fa-trophy"></i>
        <h2>Workout Complete!</h2>
      </div>

      <div class="summary-stats-grid">
        <div class="summary-stat">
          <span class="summary-stat-value">${formatDuration(duration)}</span>
          <span class="summary-stat-label">Duration</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${totalSets}</span>
          <span class="summary-stat-label">Sets</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${formatVolume(totalVolume)}</span>
          <span class="summary-stat-label">Volume</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${Object.keys(workoutData.exercises).length}</span>
          <span class="summary-stat-label">Exercises</span>
        </div>
      </div>

      ${prsHit.length > 0 ? `
        <div class="summary-prs">
          <h3>New Personal Records!</h3>
          ${prsHit.map(pr => `
            <div class="pr-callout">
              <i class="fas fa-trophy" style="color: gold"></i>
              ${pr.exercise}: ${pr.value} ${pr.unit} (${pr.type})
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${volumeChange !== null ? `
        <div class="summary-comparison">
          <span class="${volumeChange >= 0 ? 'positive' : 'negative'}">
            ${volumeChange >= 0 ? '+' : ''}${volumeChange.toFixed(0)}% volume vs last ${workoutData.workoutType}
          </span>
        </div>
      ` : ''}

      <button class="btn btn-primary btn-full" onclick="closeSummaryAndGoToDashboard()">
        Done
      </button>
    </div>
  `;
}
```

2. Call `showWorkoutSummary()` from `completeWorkout()` instead of immediately navigating to dashboard. The "Done" button on the summary dismisses the modal and navigates to dashboard.

3. Style with celebratory treatment — maybe a subtle confetti animation for PR workouts, or just a clean card layout.

### 6.2 Workout-level notes

**New feature:** Add a notes field at the workout level (not per-exercise).

**Implementation:**

1. Add a notes textarea to the workout completion summary:
```html
<div class="workout-notes-section">
  <label for="workout-notes">How did it feel?</label>
  <textarea id="workout-notes" placeholder="Great session, felt strong..." rows="2"></textarea>
</div>
```

2. Save `workoutNotes` field in the workout document when completing:
```javascript
// In completeWorkout(), before saving:
const notesField = document.getElementById('workout-notes');
if (notesField?.value) {
  AppState.savedData.workoutNotes = notesField.value;
}
```

3. Show the notes in workout history detail view when reviewing past workouts.

### 6.3 Move "Save as Template" to overflow menu

**Current behavior:** "Save as Template" button sits below Cancel/Add/Finish in the active workout view, creating cognitive noise.

**Fix:** Remove the button from the main workout view. Instead:
1. Add it to a "..." overflow menu in the workout header
2. Also offer it on the workout completion summary screen as a secondary action

```html
<!-- In workout header area -->
<button class="btn-icon" onclick="toggleWorkoutOverflowMenu()" aria-label="More options">
  <i class="fas fa-ellipsis-h"></i>
</button>

<!-- Overflow menu (hidden by default) -->
<div id="workout-overflow-menu" class="overflow-menu hidden">
  <button onclick="saveCurrentWorkoutAsTemplate()">
    <i class="fas fa-save"></i> Save as Template
  </button>
  <button onclick="toggleReorderMode()">
    <i class="fas fa-arrows-alt-v"></i> Reorder Exercises
  </button>
</div>
```

---

## Phase 7: Visual Polish & Small Fixes

### 7.1 Fix ABCDE badge on exercise cards

**Problem:** A teal badge showing note text appears on exercise cards without a label.

**Fix:** In `exercise-ui.js` `createExerciseCard()`, if the exercise has a note, display it with a clear "Note:" prefix:
```html
<span class="exercise-note-badge">
  <i class="fas fa-sticky-note"></i> ${escapeHtml(truncateText(exercise.notes, 20))}
</span>
```

If it's a PR badge, ensure it has a trophy icon and "PR" label.

### 7.2 Improve icon consistency in exercise library

**Problem:** Category icons are inconsistent — some represent the muscle group, others are generic.

**Fix:** Create a consistent icon mapping:
```javascript
const BODY_PART_ICONS = {
  'Chest': 'fa-dumbbell',
  'Back': 'fa-person-falling',    // or use a custom SVG
  'Legs': 'fa-person-walking',
  'Shoulders': 'fa-arrows-up-down',
  'Arms': 'fa-hand-fist',
  'Core': 'fa-bullseye',
  'Cardio': 'fa-heart-pulse',
  'Full Body': 'fa-person',
  'Glutes': 'fa-fire',
  // Add remaining categories
};
```

Apply this mapping wherever body part icons are rendered (exercise library modal, template cards, etc.).

### 7.3 Add calendar legend

Already covered in 5.4 — add a legend below the calendar explaining what the indicators mean.

### 7.4 Equipment reassignment — move equipment to correct exercise

**Problem:** If a user accidentally associates an equipment record with the wrong exercise (e.g., added an "Atlantis Leg Curl" machine under "Glute Kickback" instead of "Leg Curl"), there's no way to fix it. The user is stuck using the wrong exercise name just to keep tracking to that machine. Historical workout data is also tied to the wrong exercise name.

**Why this is tricky:** Equipment is stored as a **name string** inside each workout document (not a reference ID). The equipment name appears in 3 places per workout: `originalWorkout.exercises[i].equipment`, `exercises.exercise_N.equipment`, and `currentWorkout.exercises[i].equipment` (in-memory). Plus the equipment document's `exerciseTypes` array tracks which exercises use it.

**Implementation:**

1. **Add "Reassign Equipment" option to the equipment editor** in `exercise-manager-ui.js`. When editing an equipment item, add a button:
```html
<button class="btn btn-secondary btn-full" onclick="showReassignEquipment('${equipmentId}', '${equipmentName}')">
  <i class="fas fa-exchange-alt"></i> Move to Different Exercise
</button>
```

2. **Create `showReassignEquipment(equipmentId, equipmentName)` function:**
   - Opens a modal showing the current exercise association
   - Shows the exercise library picker filtered to let the user choose the **correct** exercise
   - Displays a preview: "Move 'Atlantis Leg Curl' from Glute Kickback → Leg Curl"
   - Shows count of historical workouts that will be affected: "This will update 14 past workouts"
   - Confirm button triggers the migration

3. **Create `reassignEquipment(equipmentId, equipmentName, oldExerciseName, newExerciseName)` in `data-manager.js`:**

```javascript
/**
 * Moves an equipment record from one exercise to another.
 * Updates the equipment document AND all historical workout documents.
 *
 * @param {string} equipmentId - Firestore doc ID of the equipment
 * @param {string} equipmentName - The equipment name string (e.g., "Atlantis Leg Curl")
 * @param {string} oldExerciseName - The exercise it's currently (wrongly) associated with
 * @param {string} newExerciseName - The exercise it should be associated with
 */
export async function reassignEquipment(equipmentId, equipmentName, oldExerciseName, newExerciseName) {
  const userId = AppState.currentUser.uid;
  const batch = writeBatch(db);

  // 1. Update equipment document's exerciseTypes array
  const equipRef = doc(db, 'users', userId, 'equipment', equipmentId);
  batch.update(equipRef, {
    exerciseTypes: arrayRemove(oldExerciseName)
  });
  // Need a second update since arrayUnion and arrayRemove can't be in the same update
  // Actually, handle this after the batch with a separate update

  // 2. Query all workouts that contain this equipment name
  // Since Firestore can't query inside nested objects efficiently,
  // we need to load workouts and filter client-side.
  // Optimization: query by exercise name in originalWorkout if indexed,
  // otherwise load all workouts (paginated).
  const workoutsRef = collection(db, 'users', userId, 'workouts');
  const allWorkouts = await getDocs(workoutsRef);

  let updatedCount = 0;

  allWorkouts.forEach(docSnap => {
    const data = docSnap.data();
    let needsUpdate = false;
    const updates = {};

    // Check originalWorkout.exercises array
    if (data.originalWorkout?.exercises) {
      const updatedExercises = data.originalWorkout.exercises.map(ex => {
        if (ex.equipment === equipmentName && ex.machine === oldExerciseName) {
          needsUpdate = true;
          return { ...ex, machine: newExerciseName };
        }
        return ex;
      });
      if (needsUpdate) {
        updates['originalWorkout.exercises'] = updatedExercises;
      }
    }

    // Check exercises object (exercise_0, exercise_1, etc.)
    if (data.exercises) {
      Object.entries(data.exercises).forEach(([key, ex]) => {
        if (ex.equipment === equipmentName && data.originalWorkout?.exercises) {
          // Find the matching exercise by index
          const idx = parseInt(key.split('_')[1]);
          const origEx = data.originalWorkout.exercises[idx];
          if (origEx?.machine === oldExerciseName) {
            updates[`exercises.${key}.name`] = newExerciseName;
            needsUpdate = true;
          }
        }
      });
    }

    if (needsUpdate) {
      updates['lastUpdated'] = new Date().toISOString();
      batch.update(docSnap.ref, updates);
      updatedCount++;
    }
  });

  // Firestore batches max at 500 operations
  // If > 250 workouts affected, split into multiple batches
  await batch.commit();

  // 3. Update equipment document
  await updateDoc(equipRef, {
    exerciseTypes: arrayRemove(oldExerciseName),
  });
  await updateDoc(equipRef, {
    exerciseTypes: arrayUnion(newExerciseName),
  });

  return updatedCount;
}
```

4. **Also update templates** that reference the old exercise + equipment combo. In `firebase-workout-manager.js`, query templates and update any that have `exercises[i].machine === oldExerciseName && exercises[i].equipment === equipmentName`.

5. **Update exercise overrides** if they exist for the old exercise with this equipment: `users/{userId}/exerciseOverrides/{overrideId}`.

6. **Batch size handling:** Firestore batches are limited to 500 operations. If the user has many workouts, split into multiple batch commits:
```javascript
const BATCH_SIZE = 400; // Leave headroom
let currentBatch = writeBatch(db);
let opCount = 0;

// ... inside the loop:
if (opCount >= BATCH_SIZE) {
  await currentBatch.commit();
  currentBatch = writeBatch(db);
  opCount = 0;
}
```

7. **Progress indicator:** Since this could take a few seconds for users with lots of history, show a progress bar:
```html
<div class="reassign-progress">
  <div class="reassign-progress-bar" style="width: ${pct}%"></div>
  <span>Updating ${updatedCount} of ${totalCount} workouts...</span>
</div>
```

8. **Confirmation + undo safety:** Before committing, show a summary modal:
```html
<div class="reassign-confirm">
  <h3>Confirm Equipment Reassignment</h3>
  <div class="reassign-preview">
    <div class="reassign-from">
      <span class="text-muted">From:</span>
      <strong>${oldExerciseName}</strong>
    </div>
    <i class="fas fa-arrow-right" style="color: var(--primary)"></i>
    <div class="reassign-to">
      <span class="text-muted">To:</span>
      <strong>${newExerciseName}</strong>
    </div>
  </div>
  <p class="reassign-impact">
    <i class="fas fa-database"></i>
    This will update <strong>${affectedCount}</strong> historical workouts,
    <strong>${affectedTemplates}</strong> templates, and the equipment record.
  </p>
  <p class="text-muted" style="font-size: var(--font-sm);">
    💡 Tip: Export your data first (Settings → Export) if you want a backup before this change.
  </p>
  <div class="reassign-actions">
    <button class="btn btn-secondary" onclick="closeReassignModal()">Cancel</button>
    <button class="btn btn-primary" onclick="confirmReassignment()">
      <i class="fas fa-check"></i> Reassign Equipment
    </button>
  </div>
</div>
```

9. **Export functions** and assign to `window` in `main.js`:
   - `showReassignEquipment`
   - `confirmReassignment`
   - `closeReassignModal`

### 7.5 Equipment-specific form videos with exercise-level fallback

**Problem:** The current video system is half-built and doesn't match how users actually think about form videos. A "Bench Press" on a Hammer Strength machine has completely different form than a "Bench Press" with a barbell. Users need to see the video for their *specific equipment*, not just a generic exercise video. Currently:
- Exercises can have a `video` field (from `exercises.json` or custom exercises)
- Equipment records can have a `video` field (from the equipment editor)
- But the resolution logic is incomplete — `showExerciseVideo`, `hideExerciseVideo`, `convertYouTubeUrl`, and related functions are stub exports with missing implementations
- There's no clear UI that communicates "this video is for this specific machine" vs. "this is the default exercise form video"

**New model — 3-tier video resolution:**

```
Priority 1: Equipment-specific video (e.g., "Atlantis Leg Curl machine" video)
Priority 2: Exercise default video (e.g., generic "Leg Curl" form video)
Priority 3: No video (show "Add form video" prompt)
```

**Data model changes:**

The equipment document already has a `video` field. The exercise definitions already have a `video` field. No schema changes needed — just fix the resolution logic and UI.

For equipment-specific videos tied to a particular exercise+equipment combo, store in a new map on the equipment document:

```javascript
// Equipment document in Firestore: users/{userId}/equipment/{equipmentId}
{
  name: "Atlantis Leg Curl",
  locations: ["Downtown Gym"],
  exerciseTypes: ["Leg Curl", "Seated Leg Curl"],
  video: "https://youtube.com/...",           // Legacy: single video for equipment
  exerciseVideos: {                            // NEW: per-exercise video overrides
    "Leg Curl": "https://youtube.com/...",
    "Seated Leg Curl": "https://youtube.com/..."
  },
  lastUsed: "...",
  createdAt: "..."
}
```

**Implementation:**

1. **Create video resolution function** in `exercise-ui.js`:

```javascript
/**
 * Resolves the best form video for a given exercise + equipment combination.
 * Priority: equipment-specific > equipment general > exercise default > null
 *
 * @param {string} exerciseName - e.g., "Leg Curl"
 * @param {string|null} equipmentName - e.g., "Atlantis Leg Curl"
 * @returns {Promise<{url: string|null, source: 'equipment'|'exercise'|null}>}
 */
async function resolveFormVideo(exerciseName, equipmentName) {
  // 1. Try equipment-specific video for this exercise
  if (equipmentName) {
    const equipment = await getEquipmentByName(equipmentName);
    if (equipment?.exerciseVideos?.[exerciseName]) {
      return { url: equipment.exerciseVideos[exerciseName], source: 'equipment' };
    }
    // Fallback to equipment's general video
    if (equipment?.video) {
      return { url: equipment.video, source: 'equipment' };
    }
  }

  // 2. Try exercise default video
  const exercise = getExerciseFromLibrary(exerciseName);
  if (exercise?.video) {
    return { url: exercise.video, source: 'exercise' };
  }

  // 3. No video available
  return { url: null, source: null };
}
```

2. **Implement the stub video display functions** in `exercise-ui.js`:

```javascript
/**
 * Converts various YouTube URL formats to embeddable format.
 */
function convertYouTubeUrl(url) {
  if (!url) return null;
  // Handle: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return url; // Return as-is if not YouTube (could be other video host)
}

/**
 * Shows the form video in the exercise modal.
 * Resolves the best video for the current exercise + equipment combo.
 */
async function showExerciseVideo(exerciseName, equipmentName) {
  const { url, source } = await resolveFormVideo(exerciseName, equipmentName);

  const videoSection = document.getElementById('exercise-video-section');
  const iframe = document.getElementById('exercise-video-iframe');
  const videoSourceLabel = document.getElementById('video-source-label');

  if (!url) {
    videoSection.classList.add('hidden');
    return;
  }

  const embedUrl = convertYouTubeUrl(url);
  iframe.src = embedUrl;
  videoSection.classList.remove('hidden');

  // Show source label so user knows where the video came from
  if (videoSourceLabel) {
    videoSourceLabel.textContent = source === 'equipment'
      ? `Video for ${equipmentName}`
      : `Default ${exerciseName} form`;
    videoSourceLabel.className = source === 'equipment'
      ? 'video-source-label equipment'
      : 'video-source-label default';
  }
}

function hideExerciseVideo() {
  const videoSection = document.getElementById('exercise-video-section');
  const iframe = document.getElementById('exercise-video-iframe');
  if (videoSection) videoSection.classList.add('hidden');
  if (iframe) iframe.src = ''; // Stop video playback
}
```

3. **Update the exercise modal video button** in `exercise-ui.js`:

Replace the current "Form Video" button (around line 591-600) with a smarter version that shows the video source:

```html
<div class="form-video-row">
  <button class="btn btn-secondary btn-small" onclick="toggleFormVideo(${exerciseIndex})">
    <i class="fas fa-play-circle"></i>
    <span id="video-btn-label-${exerciseIndex}">Form Video</span>
  </button>
  <span id="video-source-label" class="video-source-label"></span>
</div>
```

When video is showing, the button changes to "Hide Video". The source label shows "Video for Atlantis Leg Curl" (equipment-specific) or "Default Leg Curl form" (exercise default).

4. **Add "Set Video" action in equipment editor:**

In the equipment editor section of `exercise-manager-ui.js`, make the video field exercise-aware:

```html
<div class="equipment-video-section">
  <div class="section-header">
    <h4 class="section-header__title">Form Videos</h4>
  </div>

  <!-- Per-exercise video list -->
  <div class="equipment-exercise-videos">
    ${exerciseTypes.map(exName => `
      <div class="row-card equipment-video-row">
        <div class="row-card__content">
          <span class="row-card__title">${exName}</span>
          <span class="row-card__subtitle ${videoUrl ? '' : 'text-muted'}">
            ${videoUrl ? truncateUrl(videoUrl) : 'No video set'}
          </span>
        </div>
        <button class="btn-text" onclick="editEquipmentExerciseVideo('${equipmentId}', '${exName}')">
          <i class="fas fa-${videoUrl ? 'pen' : 'plus'}"></i>
        </button>
      </div>
    `).join('')}
  </div>

  <!-- Default equipment video (fallback for any exercise) -->
  <div class="settings-item" style="margin-top: 12px;">
    <label class="settings-name">Default Equipment Video</label>
    <input type="url" id="edit-equipment-video" class="form-input"
           placeholder="https://youtube.com/..." value="${equipment.video || ''}">
    <span class="settings-description">Used when no exercise-specific video is set</span>
  </div>
</div>
```

5. **Create `editEquipmentExerciseVideo(equipmentId, exerciseName)` function:**

```javascript
async function editEquipmentExerciseVideo(equipmentId, exerciseName) {
  const equipment = await getEquipmentById(equipmentId);
  const currentUrl = equipment.exerciseVideos?.[exerciseName] || '';

  // Show a simple prompt or inline editor
  const newUrl = await showVideoInputModal(exerciseName, currentUrl);
  if (newUrl === null) return; // Cancelled

  // Save to Firestore
  const userId = AppState.currentUser.uid;
  const equipRef = doc(db, 'users', userId, 'equipment', equipmentId);

  if (newUrl === '') {
    // Remove the exercise-specific video
    await updateDoc(equipRef, {
      [`exerciseVideos.${exerciseName}`]: deleteField()
    });
  } else {
    await updateDoc(equipRef, {
      [`exerciseVideos.${exerciseName}`]: newUrl
    });
  }

  showNotification('Video updated', 'success', 1500);
  // Refresh the equipment editor UI
  renderEquipmentEditor(equipmentId);
}
```

6. **Add quick "Set Video" prompt during active workout:**

When a user opens the exercise modal and there's no video for the current exercise+equipment combo, show a subtle prompt:

```html
<div class="video-prompt" id="add-video-prompt-${exerciseIndex}">
  <i class="fas fa-video"></i>
  <span>Add a form video for ${equipmentName || exerciseName}?</span>
  <button class="btn-text" onclick="promptAddFormVideo(${exerciseIndex})">Add</button>
  <button class="btn-text" onclick="dismissVideoPrompt(${exerciseIndex})">Not now</button>
</div>
```

```css
.video-prompt {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(29, 211, 176, 0.06);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin-bottom: 12px;
}
```

This prompt only shows once per exercise+equipment combo per session (track dismissals in memory). When tapped, it opens a quick URL input — user pastes a YouTube link and it's saved to the equipment's `exerciseVideos` map.

7. **Video source badge in exercise card** (active workout screen):

On exercise cards that have a form video available, show a small video icon so users know a reference is available without opening the modal:

```html
<span class="exercise-card-video-badge" title="Form video available">
  <i class="fas fa-play-circle"></i>
</span>
```

```css
.exercise-card-video-badge {
  font-size: var(--font-xs);
  color: var(--text-muted);
  opacity: 0.5;
}
```

8. **Export all new functions** and assign to `window` in `main.js`:
   - `showExerciseVideo`
   - `hideExerciseVideo`
   - `toggleFormVideo`
   - `editEquipmentExerciseVideo`
   - `promptAddFormVideo`
   - `dismissVideoPrompt`

This phase ensures every screen in the app shares the same visual language. The goal is a cohesive, premium feel — no screen should look like it was designed separately. This phase is informed by a comprehensive audit of all 11 UI modules and ~7,000 lines of CSS.

### 7A.1 Establish complete design token system

The current design tokens (`:root` in `style.css` lines 9-57) are a good start but incomplete. Extend them to cover every variable currently hardcoded throughout the app:

```css
:root {
  /* === EXISTING TOKENS (keep as-is) === */

  /* === NEW: Font size scale === */
  --font-xs: 0.7rem;     /* Badges, micro labels */
  --font-sm: 0.8rem;     /* Meta text, subtitles */
  --font-base: 0.9rem;   /* Body text, buttons */
  --font-md: 1rem;       /* Card titles, inputs */
  --font-lg: 1.15rem;    /* Section headers */
  --font-xl: 1.4rem;     /* Page titles */
  --font-2xl: 2rem;      /* Hero numbers (ring count, streak count) */
  --font-3xl: 2.5rem;    /* Timer display */

  /* === NEW: Extended border-radius scale === */
  --radius-xs: 4px;      /* Badges, tags, small pills */
  --radius-pill: 999px;  /* Fully rounded pills, toggle switches */
  /* Keep existing: --radius-sm: 12px, --radius-md: 16px, --radius-lg: 20px */

  /* === NEW: Category colors (consistent across all screens) === */
  --cat-push: #4A90D9;
  --cat-pull: #D94A7A;
  --cat-legs: #7B4AD9;
  --cat-cardio: #D9A74A;
  --cat-core: #4AD9A7;
  --cat-arms: #D96A4A;
  --cat-fullbody: #4AD9D9;
  --cat-custom: var(--primary);

  /* === NEW: Badge/achievement colors (replacing hardcoded hex) === */
  --badge-gold: #ffd700;
  --badge-silver: #c0c0c0;
  --badge-bronze: #cd7f32;
  --badge-purple: #9370db;

  /* === NEW: Animation durations (single source of truth) === */
  --anim-fast: 100ms;     /* Button press, scale */
  --anim-normal: 200ms;   /* Fade, slide */
  --anim-slow: 300ms;     /* Modal open/close, page transition */
  --anim-ring: 1000ms;    /* Progress ring fill */

  /* === NEW: Z-index scale (documented, not scattered) === */
  --z-sticky: 10;
  --z-header: 100;
  --z-sidebar: 300;
  --z-overlay: 350;
  --z-modal: 500;
  --z-exercise-lib: 550;
  --z-add-exercise: 600;
  --z-toast: 700;
}
```

**Migration:** Search all of `style.css` and every JS file for hardcoded values that match these tokens and replace them. Specific targets:

- **Font sizes:** 65+ occurrences of hardcoded `rem` values across CSS → replace with `var(--font-*)` tokens
- **Border-radius:** Replace all `3px`, `4px`, `6px` hardcoded radius values with `var(--radius-xs)` or the appropriate token
- **Category colors:** Replace the JS `CATEGORY_COLORS` object (Phase 5.3) to reference CSS custom properties: `getComputedStyle(document.documentElement).getPropertyValue('--cat-push')`
- **Badge colors:** Replace `#ffd700`, `#c0c0c0`, `#cd7f32`, `#9370db` (found in streak badges, PR displays) with `var(--badge-*)`
- **Z-index values:** Replace all scattered z-index numbers with `var(--z-*)` tokens
- **Animation durations:** Replace JS `FADE_DURATION = 150` in `navigation.js` with reading from CSS: `parseFloat(getComputedStyle(root).getPropertyValue('--anim-normal'))`

### 7A.2 Refactor and split style.css (~7,000 lines → organized modules)

**Problem:** `style.css` is ~7,000 lines in a single file. It's hard to maintain, has duplicate rules, legacy sections that contradict the design tokens, and no clear organization after the first 300 lines.

**Solution:** Split into modular CSS files imported from a single `styles/index.css`:

```
styles/
├── index.css              # @import all modules
├── tokens.css             # :root design tokens (lines 1-57)
├── reset.css              # Reset & base styles (lines 59-120)
├── components/
│   ├── cards.css          # .hero-card, .row-card patterns
│   ├── buttons.css        # .btn-* system
│   ├── forms.css          # Inputs, selects, toggles
│   ├── modals.css         # Modal overlay, content, animations
│   ├── nav.css            # Bottom nav, sidebar, More menu
│   └── empty-states.css   # Empty state pattern
├── pages/
│   ├── dashboard.css      # Dashboard-specific layout
│   ├── workout.css        # Active workout screen
│   ├── templates.css      # Template selection
│   ├── stats.css          # Stats page
│   ├── history.css        # Workout history & calendar
│   ├── settings.css       # Settings page
│   └── exercise-lib.css   # Exercise library modal
└── utilities.css          # .hidden, .text-muted, animations
```

**Migration steps:**
1. Create the `styles/` directory structure
2. Cut sections from `style.css` into the appropriate module files
3. Replace `<link rel="stylesheet" href="style.css">` with `<link rel="stylesheet" href="styles/index.css">`
4. `index.css` uses `@import` statements in the correct cascade order (tokens first, reset, components, pages, utilities last)
5. During the split, **delete duplicate rules** — the audit found:
   - `.weekly-goal-card`, `.in-progress-card`, `.streak-box` all duplicate `.hero-card` → refactor to use `.hero-card` base class + modifier
   - `.complete-exercise-btn` defined twice (lines ~1723 and ~1786)
   - Rest timer styles duplicated (lines ~1660 and ~1766)
   - Section header variants (`.section-header`, `.stats-section-header`, `.section-header-row`) → consolidate into single `.section-header` pattern
6. Remove any rules that reference undefined tokens (e.g., `--bg-tertiary` is used in `exercise-ui.js` but never defined — define it as alias for `--bg-card-hi` or replace the reference)

**Important:** Since this app has no build process, `@import` works natively in browsers. The slight performance cost of multiple file requests is acceptable for development — and can be concatenated for production later if needed.

### 7A.3 Consolidate card patterns — single source of truth

The audit found that dashboard widgets (`.weekly-goal-card`, `.in-progress-card`, `.streak-box`), template cards (`.template-card`), exercise cards (`.exercise-card-new`), location items (`.location-management-item`), and manual workout items (`.manual-library-item`) all implement their own card styling independently.

**Fix:** Every card-like element should extend one of two base patterns:

1. **`.hero-card`** — For prominent widgets (dashboard goal, streak hero, PR cards, stats summary, resume banner). Characteristics: `var(--bg-card)`, `var(--radius-lg)`, `var(--shadow-sm)`, optional `::before` accent bar.

2. **`.row-card`** — For list items (exercises, templates, locations, equipment, history items, workout selections). Characteristics: horizontal flex, icon + content + action chevron, `var(--radius-md)`, subtle border.

**Specific refactors:**
- `.weekly-goal-card` → `.hero-card.hero-card--goal`
- `.in-progress-card` → `.hero-card.hero-card--resume` (with the glow border from 5.1)
- `.streak-box` → `.hero-card.hero-card-warm` (already exists, just use it)
- `.template-card` → `.hero-card.hero-card-flat` (no accent bar, already exists)
- `.exercise-card-new` → `.row-card` (exercise manager)
- `.location-management-item` → `.row-card` (location list)
- `.manual-library-item` → `.row-card` (manual workout picker)
- `.suggested-compact` → `.row-card` (dashboard quick-start)

Each refactored element keeps its modifier class for unique styling but inherits the base layout, shadows, radius, and interaction states from the shared pattern.

### 7A.4 Eliminate inline styles from JavaScript

The audit found **inline `style=` attributes** in generated HTML across multiple JS files. These bypass the design system and are impossible to maintain consistently.

**Files with inline styles to fix:**

| File | Lines | What's inline | Replace with |
|------|-------|---------------|--------------|
| `exercise-ui.js` | ~133 | `display: flex; gap: 0.5rem` | `.exercise-tags` class |
| `exercise-ui.js` | ~147 | `background: var(--success); color: white` | `.badge--success` class |
| `exercise-ui.js` | ~154 | `background: var(--bg-tertiary)` | `.badge--muted` class (fix undefined token) |
| `exercise-ui.js` | ~364 | Multiple layout styles | `.set-row-layout` class |
| `exercise-ui.js` | ~517 | `color: gold` | `.text-badge-gold { color: var(--badge-gold) }` |
| `rest-timer.js` | ~58,93 | `timerDisplay.style.color = ...` | `.rest-timer--active`, `.rest-timer--complete` classes |
| `dashboard-ui.js` | ~175 | `progressBar.style.width` | Keep (dynamic width is acceptable via JS) |
| `template-selection.js` | nested | `background: rgba(0,0,0,0.15)` | `.template-exercise-list` class using `var(--bg-card-hi)` |
| `stats-ui.js` | summary cards | Missing CSS entirely | Create `.summary-stat-card` class |

**Rule going forward:** No `element.style.color`, `element.style.background`, or HTML `style="..."` attributes except for truly dynamic values (width percentages, transform positions, SVG coordinates). All visual styling must come from CSS classes.

### 7A.5 Template selection screen visual redesign

**Current state:** Template cards are functional but plain — dark rectangles with exercise lists. No visual hierarchy, no color coding, and the category grid step adds friction.

**Redesign:**

```html
<!-- Template card with category color accent and muscle group tags -->
<div class="hero-card hero-card-flat template-card" onclick="selectTemplate('${id}')">
  <div class="template-accent-bar" style="background: var(--cat-${categoryKey})"></div>

  <div class="template-card-header">
    <div class="template-category-pill" style="background: var(--cat-${categoryKey}); opacity: 0.15">
      <span style="color: var(--cat-${categoryKey})">${category}</span>
    </div>
    <span class="template-exercise-count">${exerciseCount} exercises</span>
  </div>

  <h3 class="template-card-title">${templateName}</h3>

  <div class="template-muscle-tags">
    ${muscleTags.map(t => `<span class="muscle-tag">${t}</span>`).join('')}
  </div>

  <div class="template-card-footer">
    <span class="template-last-used"><i class="fas fa-clock"></i> ${lastUsedText}</span>
    <button class="btn btn-primary btn-small">Start</button>
  </div>
</div>
```

```css
.template-accent-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
}
.template-category-pill {
  font-size: var(--font-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  display: inline-block;
}
.template-muscle-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 8px 0;
}
.template-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
.template-last-used {
  font-size: var(--font-sm);
  color: var(--text-muted);
}
```

**Additional changes:**
- Show "Last used: 3 days ago" on each card (query latest workout with that template name)
- Add estimated duration based on average past session time for that template
- **Flat list by default** — skip the category grid step entirely. Show all templates sorted by last-used date. Add filter pills at the top: `All | Push | Pull | Legs | Custom`
- Search bar at the top for users with many templates

### 7A.6 Active workout screen visual overhaul

Phase 2 covers functional changes (smart defaults, set checkboxes, rest timer). This sub-phase covers the **visual treatment** to make the active workout screen feel premium and consistent with the redesigned dashboard.

**Workout header redesign:**

```css
.active-workout-hero {
  background: linear-gradient(180deg, var(--bg-card) 0%, var(--bg-surface) 100%);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  padding: 20px var(--pad-page);
  border-bottom: 1px solid var(--border);
}
.workout-type-name {
  font-size: var(--font-xl);
  font-weight: 700;
  color: var(--text-strong);
  letter-spacing: -0.02em;
}
.workout-location-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  margin-top: 6px;
}
```

**Exercise card redesign** (during active workout):

```css
.exercise-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid rgba(255, 255, 255, 0.03);
  padding: 16px;
  margin-bottom: var(--gap-items);
  cursor: pointer;
  transition: transform var(--anim-fast) ease, box-shadow var(--anim-fast) ease;
  position: relative;
  overflow: hidden;
}
.exercise-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: var(--text-muted);
  opacity: 0.3;
  transition: background var(--anim-normal) ease, opacity var(--anim-normal) ease;
}
.exercise-card.in-progress::before {
  background: var(--primary);
  opacity: 1;
}
.exercise-card.completed::before {
  background: var(--success);
  opacity: 1;
}
.exercise-card.completed {
  opacity: 0.7;
}
.exercise-card:active {
  transform: scale(0.98);
}
```

**Exercise card content layout:**
```html
<div class="exercise-card ${status}" onclick="openExerciseDetail(${idx})">
  <div class="exercise-card-top">
    <div class="exercise-card-info">
      <span class="exercise-card-name">${exercise.name}</span>
      <span class="exercise-card-equipment">${exercise.equipment || 'No equipment'}</span>
    </div>
    <div class="exercise-card-progress-ring">
      <!-- Small 36px SVG ring showing sets completed / total sets -->
      <svg width="36" height="36">
        <circle cx="18" cy="18" r="14" stroke="rgba(255,255,255,0.06)" stroke-width="3" fill="none"/>
        <circle cx="18" cy="18" r="14" stroke="${statusColor}" stroke-width="3" fill="none"
                stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                stroke-linecap="round" transform="rotate(-90 18 18)"/>
      </svg>
      <span class="ring-micro-text">${completedSets}/${totalSets}</span>
    </div>
  </div>

  <!-- Compact set summary (visible without opening modal) -->
  <div class="exercise-card-sets-preview">
    ${sets.map((s, i) => `
      <span class="set-chip ${s.completed ? 'done' : ''}">${s.weight}×${s.reps}</span>
    `).join('')}
  </div>
</div>
```

```css
.exercise-card-sets-preview {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.set-chip {
  font-size: var(--font-xs);
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}
.set-chip.done {
  background: rgba(29, 211, 176, 0.12);
  color: var(--primary);
}
```

This gives each exercise card:
- A colored left accent bar (grey → teal when in-progress → green when complete)
- A mini progress ring instead of a flat progress bar
- An inline preview of logged sets so users can see their numbers without opening the modal
- A clear active/completed visual state

### 7A.7 Stats page visual alignment

The stats page renders summary cards, charts, and exercise history lists — but none of these use the design system card patterns.

**Summary cards:**
```css
.stats-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--gap-items);
  margin-bottom: var(--gap-section);
}
.stats-summary-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: var(--pad-card-y) var(--pad-card-x);
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.03);
}
.stats-summary-card .stat-value {
  font-size: var(--font-2xl);
  font-weight: 700;
  color: var(--text-strong);
  display: block;
}
.stats-summary-card .stat-label {
  font-size: var(--font-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 4px;
}
```

**Chart container** (wrap Chart.js canvas in a proper card):
```css
.stats-chart-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--pad-card-y) var(--pad-card-x);
  margin-bottom: var(--gap-section);
  border: 1px solid rgba(255, 255, 255, 0.03);
}
.stats-chart-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.stats-chart-btn {
  font-size: var(--font-sm);
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  border: none;
  cursor: pointer;
  transition: all var(--anim-fast) ease;
}
.stats-chart-btn.active {
  background: var(--primary);
  color: #02100e;
  font-weight: 600;
}
```

**Category pills** (exercise filter):
```css
.category-pills {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding: 4px 0;
  margin-bottom: var(--gap-section);
  scrollbar-width: none; /* Hide scrollbar */
}
.category-pill {
  white-space: nowrap;
  font-size: var(--font-sm);
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--anim-fast) ease;
}
.category-pill.active {
  background: var(--primary);
  color: #02100e;
  font-weight: 600;
}
```

**Session history items** — use `.row-card`:
```html
<div class="row-card" onclick="viewSessionDetail('${sessionId}')">
  <div class="row-card__icon">
    <i class="fas fa-dumbbell"></i>
  </div>
  <div class="row-card__content">
    <span class="row-card__title">${exerciseName}</span>
    <span class="row-card__subtitle">${date} — ${sets} sets, best: ${bestWeight} ${unit}</span>
  </div>
  <div class="row-card__action">
    <i class="fas fa-chevron-right"></i>
  </div>
</div>
```

### 7A.8 Exercise library modal visual refresh

**Current state:** The exercise library modal uses `.exercise-card-new` cards with a plain "EDIT" text button. Category grid and filter pills lack dedicated CSS.

**Fix:**
- Exercise items use `.row-card` pattern (icon + name + equipment subtitle + edit icon)
- Category grid cards get proper styling:
```css
.exercise-category-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--gap-items);
  padding: var(--pad-page);
}
.exercise-category-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 20px 16px;
  text-align: center;
  cursor: pointer;
  transition: transform var(--anim-fast) ease;
  border: 1px solid rgba(255, 255, 255, 0.03);
}
.exercise-category-card:active {
  transform: scale(0.96);
}
.exercise-category-card .category-icon {
  font-size: 1.8rem;
  margin-bottom: 8px;
  display: block;
}
.exercise-category-card .category-name {
  font-size: var(--font-base);
  font-weight: 600;
  color: var(--text-strong);
}
.exercise-category-card .category-count {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: 4px;
}
```

- Search bar styling consistent with other search inputs:
```css
.exercise-search {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 16px 12px 40px;
  font-size: var(--font-md);
  color: var(--text-strong);
  width: 100%;
  transition: border-color var(--anim-normal) ease;
}
.exercise-search:focus {
  border-color: var(--primary);
  outline: none;
}
```

### 7A.9 Location management visual refresh

**Current state:** Location management items use `.location-management-item` with no CSS found in the design system.

**Fix:** Refactor to use `.row-card` with location-specific modifiers:
```html
<div class="row-card location-item">
  <div class="row-card__icon" style="background: rgba(29, 211, 176, 0.12)">
    <i class="fas fa-map-marker-alt"></i>
  </div>
  <div class="row-card__content">
    <div class="row-card__title">
      ${locationName}
      ${isCurrent ? '<span class="current-badge">Current</span>' : ''}
    </div>
    <div class="row-card__subtitle">${gpsInfo} • ${visitCount} visits</div>
  </div>
  <div class="row-card__actions">
    <button class="btn-text" onclick="editLocation('${id}')"><i class="fas fa-pen"></i></button>
    <button class="btn-text btn-text-danger" onclick="deleteLocation('${id}')"><i class="fas fa-trash"></i></button>
  </div>
</div>
```

```css
.current-badge {
  font-size: var(--font-xs);
  background: rgba(29, 211, 176, 0.15);
  color: var(--primary);
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  margin-left: 8px;
  font-weight: 600;
}
```

### 7A.10 Consistent micro-interactions and animations

Every interactive element should have the same tactile feedback. Define these once, apply everywhere:

```css
/* === Tap feedback === */
.tap-scale:active {
  transform: scale(0.97);
  transition: transform var(--anim-fast) ease;
}

/* === Card press === */
.hero-card:active,
.row-card:active,
.exercise-card:active,
.template-card:active {
  transform: scale(0.98);
  transition: transform var(--anim-fast) ease;
}

/* === Button press === */
.btn:active {
  transform: scale(0.96);
  transition: transform var(--anim-fast) ease;
}

/* === Modal entrance === */
.modal-enter {
  animation: modal-slide-up var(--anim-slow) ease forwards;
}
@keyframes modal-slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* === Bottom sheet entrance === */
.bottom-sheet-enter {
  animation: sheet-slide-up var(--anim-slow) ease forwards;
}
@keyframes sheet-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

/* === Page transitions === */
.section-enter {
  animation: fade-in var(--anim-normal) ease forwards;
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* === Success flash (for set completion, save, etc.) === */
.flash-success {
  animation: flash-green var(--anim-slow) ease;
}
@keyframes flash-green {
  0% { background-color: rgba(54, 196, 107, 0.2); }
  100% { background-color: transparent; }
}

/* === Loading shimmer (for skeleton screens) === */
.skeleton {
  background: linear-gradient(90deg,
    var(--bg-card) 25%,
    var(--bg-card-hi) 50%,
    var(--bg-card) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**Apply consistently:**
- All cards get `:active { transform: scale(0.98) }` — use the shared rule, remove duplicate `:active` definitions scattered through CSS
- All modals use `modal-enter` animation on open
- Bottom sheet (More menu) uses `sheet-slide-up`
- Page transitions use `fade-in` with `var(--anim-normal)` — update `navigation.js` to read duration from CSS instead of hardcoding `FADE_DURATION = 150`
- After saving a set, the row gets `flash-success` briefly
- While loading dashboard data, show `.skeleton` placeholders for each widget

### 7A.11 Workout history visual refresh

History items should use the same visual language as the rest of the app:

```css
.history-workout-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--pad-card-y) var(--pad-card-x);
  margin-bottom: var(--gap-items);
  border: 1px solid rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: transform var(--anim-fast) ease;
}
.history-workout-card:active {
  transform: scale(0.98);
}
.history-workout-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}
.history-workout-name {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-strong);
}
.history-workout-date {
  font-size: var(--font-sm);
  color: var(--text-muted);
}
.history-workout-stats {
  display: flex;
  gap: 16px;
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
.history-exercise-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.history-exercise-chip {
  font-size: var(--font-xs);
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}
```

**Calendar improvements** (beyond 5.9/5.10 functional fixes):
- Workout day cells get a subtle glow: `box-shadow: inset 0 0 0 2px var(--primary)` instead of just a background color
- Today's cell has a pulsing ring (same `pulse-dot` animation scaled to the cell)
- Multi-workout days show a small badge count

### 7A.12 Consistent empty states across all screens

Every screen should have a styled empty state instead of blank space or raw text. Use a single pattern:

```css
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-secondary);
}
.empty-state-icon {
  font-size: 3rem;
  margin-bottom: 16px;
  opacity: 0.2;
  color: var(--text-muted);
}
.empty-state h3 {
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 8px;
}
.empty-state p {
  font-size: var(--font-base);
  max-width: 260px;
  margin: 0 auto 20px;
  line-height: 1.5;
}
```

Screens needing empty states:
- Dashboard (no workouts this week)
- Workout history (no history)
- Stats (not enough data)
- Exercise library (no custom exercises)
- Locations (no saved locations)
- Templates (no custom templates — only show in "Custom" tab)

### 7A.13 Visual consistency checklist

After completing 7A.1 through 7A.12, verify:

- [ ] Every card in the app uses `.hero-card` or `.row-card` base (no one-off card classes)
- [ ] Every font-size references a `var(--font-*)` token (no bare `rem` values in CSS)
- [ ] Every border-radius references a `var(--radius-*)` token
- [ ] Every z-index references a `var(--z-*)` token
- [ ] Every animation uses `var(--anim-*)` for timing
- [ ] No inline `style=` in JS-generated HTML except dynamic values (width %, SVG coords)
- [ ] No hardcoded hex colors in CSS — all use `var(--*)` tokens
- [ ] Category color coding appears on: dashboard suggested workouts, template cards, active workout header, workout history cards, stats category pills
- [ ] All interactive elements have `:active { transform: scale() }` feedback
- [ ] All modals use the same entrance animation
- [ ] All screens have styled empty states with CTA buttons
- [ ] `style.css` has been split into organized modules (< 500 lines each)
- [ ] No duplicate CSS rules remain after consolidation
- [ ] App feels cohesive when navigating between all screens

---

## Phase 8: New Features

These are features not currently in the app that should be added for parity with professional workout apps.

### 8.1 Warmup set vs working set distinction

**Implementation:**
1. Add a `type` field to each set: `'warmup'` | `'working'` | `'dropset'` | `'failure'`
2. Default to `'working'`. Render a small toggle/dropdown on each set row:
```html
<select class="set-type-select" onchange="updateSetType(${exIdx}, ${setIdx}, this.value)">
  <option value="working">W</option>
  <option value="warmup">WU</option>
  <option value="dropset">D</option>
  <option value="failure">F</option>
</select>
```
3. Warmup sets display with a lighter/muted style
4. Warmup sets are excluded from PR calculations and volume stats
5. Update `pr-tracker.js` to filter out warmup sets when checking PRs

### 8.2 Data export

**Implementation:**
1. Add "Export Data" to settings/More menu
2. Create `exportWorkoutData()` function:
```javascript
async function exportWorkoutData() {
  const workouts = await loadAllWorkouts();
  const exportData = {
    exportDate: new Date().toISOString(),
    version: '3.0',
    workouts: workouts,
    templates: AppState.workoutPlans,
    exercises: AppState.exerciseDatabase
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bigsurf-export-${AppState.getTodayDateString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### 8.3 Settings page

**Current state:** Settings menu item exists in sidebar but no actual settings page. Many user-configurable values are hardcoded.

**Implementation:** Create `js/core/ui/settings-ui.js` with a proper settings page accessible from the More menu (bottom sheet from Phase 5.2).

#### Settings categories and items:

**Workout Preferences:**
- **Default weight unit** (lbs / kg) — currently only changeable per-exercise during a workout. This sets the global default for new exercises. Toggle switch.
- **Default rest timer duration** — currently hardcoded at 90s. Offer presets: 30s, 60s, 90s, 2 min, 3 min, 5 min, Custom. Most users want shorter rest for accessories and longer for compounds.
- **Per-exercise rest timer overrides** — let users set a default rest time for specific exercises (e.g., Squat = 3 min, Bicep Curl = 60s). These override the global default. Stored as a map in preferences: `{ "Bench Press": 120, "Squat": 180 }`. The exercise modal's rest timer uses this value when available.
- **Rest timer auto-start** (on / off) — toggle for automatically starting the timer after marking a set complete (Phase 2.4). Default: on.
- **Rest timer vibration** (on / off) — toggle for device vibration when timer expires. Default: on.
- **Rest timer sound** (on / off) — toggle for audible alert on timer expiry. Default: off (most people are in a gym with headphones).

**Goals & Tracking:**
- **Weekly workout goal** — currently hardcoded. Number picker: 1-7 days/week. Default: 5. Used by the dashboard weekly goal ring.
- **Track body weight** (on / off) — show/hide the body weight card on dashboard (Phase 12). Default: off until first weight is logged.
- **Body weight unit** — follows the global weight unit by default, but can be overridden (some people lift in lbs but track body weight in kg).

**Plate Calculator (Phase 11):**
- **Bar weight** — presets: 45 lbs / 35 lbs / 20 kg / 15 kg / Custom. Default based on unit preference.
- **Available plates** — checkboxes for standard plate sizes. Users uncheck plates their gym doesn't have.
  - lbs default: `[45, 35, 25, 10, 5, 2.5]`
  - kg default: `[20, 15, 10, 5, 2.5, 1.25]`

**AI Coach (Phase 17):**
- **Training insights on dashboard** (on / off) — show/hide the rules-engine insights card. Default: on.
- **Coach review cadence** — how often to surface the "Training review available" prompt: Every 1 week / 2 weeks / 3 weeks / Manual only. Default: 2 weeks.

**Notifications:**
- **Push notifications** (on / off) — master toggle for rest timer push notifications.
- **Workout reminders** (future) — day/time picker for recurring reminders. Placeholder for now.

**Data & Privacy:**
- **Export data** — button that triggers JSON export (Phase 8.2) or CSV export (Phase 13.1)
- **Import data** — button for JSON import (Phase 13.2)
- **Delete all data** — destructive action with double confirmation. Deletes all Firestore data for the user.
- **Feed privacy** (Phase 14) — Public / Friends only / Private. Default: Friends only.

**About:**
- App version number
- "Built by" credit
- Link to changelog or GitHub
- Link to report a bug (email or GitHub issues)

#### Data model:

Store all settings in Firestore: `users/{userId}/preferences/settings`

```javascript
// Default settings object (merged with user overrides on load)
const DEFAULT_SETTINGS = {
  // Workout
  weightUnit: 'lbs',
  restTimerDuration: 90,
  restTimerAutoStart: true,
  restTimerVibration: true,
  restTimerSound: false,
  exerciseRestOverrides: {},  // { "Bench Press": 120, "Squat": 180 }

  // Goals
  weeklyGoal: 5,
  trackBodyWeight: false,
  bodyWeightUnit: null,       // null = follow weightUnit

  // Plate calculator
  barWeight: 45,
  availablePlates: [45, 35, 25, 10, 5, 2.5],

  // AI Coach
  showTrainingInsights: true,
  coachReviewCadence: 14,     // days

  // Notifications
  pushNotifications: false,

  // Privacy
  feedPrivacy: 'friends',

  // Meta
  hasCompletedOnboarding: false,
};
```

#### Loading settings on app init:

In `app-initialization.js`, after auth completes:

```javascript
import { DEFAULT_SETTINGS } from './utils/config.js';

async function loadUserSettings(userId) {
  const settingsDoc = await getDoc(doc(db, 'users', userId, 'preferences', 'settings'));
  const userSettings = settingsDoc.exists() ? settingsDoc.data() : {};

  // Merge: user overrides take precedence, defaults fill gaps
  AppState.settings = { ...DEFAULT_SETTINGS, ...userSettings };

  // Apply settings to Config for runtime use
  Config.DEFAULT_REST_TIMER_SECONDS = AppState.settings.restTimerDuration;
  Config.WEEKLY_GOAL = AppState.settings.weeklyGoal;
  // etc.
}
```

#### Saving settings:

Each setting saves immediately on change (no "Save" button). Use a debounced write to avoid hammering Firestore:

```javascript
import { debouncedSaveWorkoutData } from '../data/data-manager.js';

const debouncedSaveSettings = debounce(async () => {
  const userId = AppState.currentUser.uid;
  await setDoc(doc(db, 'users', userId, 'preferences', 'settings'), AppState.settings);
}, 500);

export function updateSetting(key, value) {
  AppState.settings[key] = value;
  Config[mapSettingToConfig(key)] = value; // Update runtime config
  debouncedSaveSettings();
  showNotification('Setting saved', 'success', 1500);
}
```

#### UI layout:

The settings page should use a standard mobile settings pattern — grouped sections with labels and controls:

```html
<div class="settings-page">
  <div class="settings-group">
    <h3 class="settings-group-title">Workout</h3>

    <div class="settings-item">
      <div class="settings-label">
        <span class="settings-name">Weight Unit</span>
        <span class="settings-description">Default unit for new exercises</span>
      </div>
      <div class="settings-control">
        <select onchange="updateSetting('weightUnit', this.value)">
          <option value="lbs" ${selected}>lbs</option>
          <option value="kg" ${selected}>kg</option>
        </select>
      </div>
    </div>

    <div class="settings-item">
      <div class="settings-label">
        <span class="settings-name">Rest Timer</span>
        <span class="settings-description">Default duration between sets</span>
      </div>
      <div class="settings-control">
        <select onchange="updateSetting('restTimerDuration', parseInt(this.value))">
          <option value="30">30s</option>
          <option value="60">1 min</option>
          <option value="90" selected>1:30</option>
          <option value="120">2 min</option>
          <option value="180">3 min</option>
          <option value="300">5 min</option>
        </select>
      </div>
    </div>

    <div class="settings-item">
      <div class="settings-label">
        <span class="settings-name">Auto-start Timer</span>
        <span class="settings-description">Start rest timer after completing a set</span>
      </div>
      <div class="settings-control">
        <label class="toggle-switch">
          <input type="checkbox" checked onchange="updateSetting('restTimerAutoStart', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </div>

  <!-- More groups: Goals, Plate Calculator, AI Coach, Notifications, Data... -->
</div>
```

```css
.settings-page {
  padding: 16px;
}
.settings-group {
  margin-bottom: 24px;
}
.settings-group-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 8px;
  padding: 0 4px;
}
.settings-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.settings-name {
  font-size: 1rem;
  color: var(--text-primary);
}
.settings-description {
  font-size: 0.8rem;
  color: var(--text-muted);
  display: block;
  margin-top: 2px;
}
.toggle-switch input { display: none; }
.toggle-slider {
  width: 48px;
  height: 28px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  position: relative;
  display: inline-block;
  cursor: pointer;
  transition: background 0.2s;
}
.toggle-switch input:checked + .toggle-slider {
  background: var(--primary);
}
.toggle-slider::after {
  content: '';
  width: 22px;
  height: 22px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: transform 0.2s;
}
.toggle-switch input:checked + .toggle-slider::after {
  transform: translateX(20px);
}
```

#### Navigation integration:

1. Add "Settings" to the More menu (bottom sheet) with a gear icon
2. Wire it to `navigateTo('settings')` which renders the settings page as a full-page section
3. Add to `SECTION_IDS` in `navigation.js`
4. Add the `<section id="settings-section">` to `index.html`
5. Export `showSettings`, `updateSetting` from settings-ui.js → import in main.js → assign to window

#### What gets read from settings vs Config:

After settings load, the rest of the app should read from `AppState.settings` or the runtime `Config` object — never from hardcoded values. This is why Phase 0.2 (extract magic numbers into config module) must be done first. The flow is:

```
App init → Load user settings from Firestore → Merge with DEFAULT_SETTINGS
→ Write to AppState.settings → Override Config values → App uses Config everywhere
```

This means every hardcoded value extracted in Phase 0.2 becomes user-configurable once the settings page exists.

### 8.4 Onboarding flow for new users

**Implementation:**

On first login (check for existence of any workouts or a `hasCompletedOnboarding` flag):

1. Welcome screen: "Welcome to Big Surf! Let's set up your gym."
2. Unit preference: "Do you lift in lbs or kg?"
3. Weekly goal: "How many times per week do you want to work out?" (3-7 slider)
4. First workout prompt: "Ready to start your first workout?" → direct to template selection

Store `hasCompletedOnboarding: true` in user preferences after completion.

Keep it to 3-4 screens max. No registration walls — they're already signed in via Google.

---

## Phase 9: Performance & Quality

### 9.1 Cache exercise history for smart defaults

The `getLastSessionDefaults()` function from Phase 2.1 will be called for every exercise in every workout. Implement a session-level cache:

```javascript
const lastSessionCache = new Map();

export async function getLastSessionDefaults(exerciseName, equipment) {
  const cacheKey = `${exerciseName}::${equipment || 'none'}`;
  if (lastSessionCache.has(cacheKey)) {
    return lastSessionCache.get(cacheKey);
  }

  // ... Firebase query ...

  lastSessionCache.set(cacheKey, result);
  return result;
}

// Clear cache on workout complete or new workout start
export function clearLastSessionCache() {
  lastSessionCache.clear();
}
```

### 9.2 Batch Firebase reads

In `firebase-workout-manager.js`, the `getExerciseLibrary()` function makes 4 separate collection queries. Wrap them in `Promise.all()`:

```javascript
const [defaultExercises, customExercises, overrides, hidden] = await Promise.all([
  getDefaultExercises(),
  getCustomExercises(),
  getUserExerciseOverrides(),
  getHiddenExercises()
]);
```

Apply the same pattern to any sequential `await` chains that are independent.

### 9.3 Add basic accessibility

Minimum viable accessibility improvements:
1. Add `aria-label` to all icon-only buttons (many already have this — verify completeness)
2. Add `role="dialog"` and `aria-modal="true"` to all modal/dialog elements
3. Trap focus inside open modals (prevent tab from reaching elements behind modal)
4. Close modals on Escape key (verify this works for all modals)
5. Add `aria-live="polite"` to the rest timer display so screen readers announce changes

### 9.4 Improve error resilience

Add retry with exponential backoff for Firebase operations:

```javascript
async function withRetry(fn, maxRetries = 2) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}
```

Wrap critical save operations (`saveWorkoutData`, `completeWorkout`) with this retry logic.

---

## Phase 10: Superset & Circuit Support

Supersets (alternating between two exercises) and circuits (rotating through 3+) are extremely common training patterns. Every competitive app supports them. This is adapted from PLAN.md Phase 11.

### 10.1 Update the data model

Add a `group` field to exercises in both templates and workout documents:

```javascript
exercises: {
  exercise_0: { name: "Bench Press", group: "A", ... },
  exercise_1: { name: "Bent Over Row", group: "A", ... },  // Superset with Bench
  exercise_2: { name: "Lateral Raises", group: null, ... }, // Standalone
}
```

Exercises with the same `group` letter are done together. `null` = standalone.

**Migration:** Old workout documents without the `group` field should be treated as all-standalone (no errors). Add a check in schema-migration.js or handle gracefully with `exercise.group || null` wherever group is read.

### 10.2 Update the workout UI

When exercises share a group, visually connect them:

- Draw a colored accent bar or connecting line on the left side of grouped exercise cards
- Add a label: "Superset A", "Circuit B", etc.
- When the user completes a set on one exercise in the group, automatically highlight/scroll to the next exercise in the group
- Rest timer behavior: for supersets, the rest timer should NOT auto-start between exercises in the same group (you rest after completing the full superset round, not between exercises)

```css
.exercise-card[data-group="A"] {
  border-left: 3px solid var(--primary);
  margin-left: 8px;
}
.superset-label {
  font-size: 0.75rem;
  color: var(--primary);
  font-weight: 600;
  padding: 4px 8px;
  margin-bottom: -4px;
}
```

### 10.3 Add grouping controls to the template editor

In the template editor (builds on Phase 3 reorder work), add a way to group exercises:

- Select two or more exercises → "Group as Superset" button appears
- Grouped exercises get a visual indicator (colored bar on the left matching the workout UI)
- Tap the group indicator or use a menu option to ungroup

Implementation approach:
```javascript
function groupExercises(indices, exercises) {
  // Find next available group letter
  const usedGroups = new Set(exercises.filter(e => e.group).map(e => e.group));
  const nextGroup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(l => !usedGroups.has(l));
  indices.forEach(i => { exercises[i].group = nextGroup; });
  return exercises;
}

function ungroupExercise(index, exercises) {
  const group = exercises[index].group;
  exercises[index].group = null;
  // If only one exercise remains in the group, ungroup it too
  const remaining = exercises.filter(e => e.group === group);
  if (remaining.length === 1) remaining[0].group = null;
  return exercises;
}
```

### 10.4 Add ad-hoc grouping during an active workout

Let users create supersets on the fly (not just in templates):

- Add a "Superset with next" option in the exercise card overflow menu or the exercise detail modal
- Links the current exercise with the one below it
- This persists to the saved workout data (and can be saved to template via the "Save as Template" feature from Phase 6.3)

### 10.5 Tests to write

Add `tests/unit/exercise-grouping.test.js`:

- `groupExercises([0, 1], exercises)` → exercises 0 and 1 get `group: "A"`. Next group call assigns `"B"`.
- `getExerciseGroups(exercises)` → `{ A: [0, 1], B: [2, 3, 4] }`. Handle exercises with `group: null`.
- `getNextInGroup(currentIndex, exercises)` → returns next exercise index in same group, or wraps to first.
- `ungroupExercise(index, exercises)` → sets `group: null`. If only one remains in group, ungroup it too.
- Old workout documents without `group` field → treated as all-standalone (no errors).

---

## Phase 11: Plate Calculator

A built-in plate calculator saves users from doing mental math or opening a separate app. Small standalone feature, high daily utility. Adapted from PLAN.md Phase 12.

### 11.1 Create the calculator module

Create `js/core/features/plate-calculator.js`:

```javascript
/**
 * Given a target weight, bar weight, and available plates,
 * calculate the plates needed per side using a greedy algorithm.
 *
 * @param {number} targetWeight - Total weight including bar
 * @param {number} barWeight - Weight of the bar (default 45 lbs / 20 kg)
 * @param {number[]} availablePlates - Plate sizes available, descending order
 * @returns {{ plates: number[], remainder: number }}
 */
export function calculatePlates(targetWeight, barWeight = 45, availablePlates = [45, 35, 25, 10, 5, 2.5]) {
  let perSide = (targetWeight - barWeight) / 2;
  if (perSide < 0) return { plates: [], remainder: 0, error: 'Weight is less than bar' };
  if (perSide === 0) return { plates: [], remainder: 0 };

  const plates = [];
  const sorted = [...availablePlates].sort((a, b) => b - a);

  for (const plate of sorted) {
    while (perSide >= plate) {
      plates.push(plate);
      perSide -= plate;
    }
  }

  return {
    plates,
    remainder: Math.round(perSide * 100) / 100, // floating point cleanup
  };
}
```

### 11.2 Add plate calculator UI to weight inputs

During a workout, add a small calculator icon next to weight input fields in the exercise modal. When tapped, show a popover/bottom sheet:

```html
<div class="plate-calculator-result">
  <div class="barbell-diagram">
    <!-- Visual representation: bar + colored plate circles -->
    <div class="bar-center"></div>
    <div class="plate" style="width: 40px; background: blue;">45</div>
    <div class="plate" style="width: 30px; background: green;">25</div>
  </div>
  <p class="plate-text">Per side: 45 + 25</p>
  <p class="plate-total">Total: 185 lbs (45 lb bar)</p>
</div>
```

### 11.3 Add standalone plate calculator page

Accessible from the More menu / settings. Features:

- Target weight input
- Bar weight selector (45 lb / 35 lb / 20 kg / custom)
- Available plates checkboxes (user can uncheck plates their gym doesn't have)
- Visual barbell diagram showing the result
- Store plate preferences in user settings (Firestore `users/{userId}/preferences/settings`)

### 11.4 Kg support

The calculator should work in both lbs and kg:
- Default kg plates: `[20, 15, 10, 5, 2.5, 1.25]`
- Default kg bar: `20`
- Use `AppState.globalUnit` to determine which defaults to show

### 11.5 Tests to write

Add `tests/unit/plate-calculator.test.js`:

- `calculatePlates(225, 45)` → `{ plates: [45, 45], remainder: 0 }` per side
- `calculatePlates(185, 45)` → `{ plates: [45, 25], remainder: 0 }`
- `calculatePlates(183, 45)` → remainder indicates closest achievable vs actual
- `calculatePlates(255, 45, [45, 25, 10, 5, 2.5])` → `{ plates: [45, 45, 10, 5], remainder: 0 }` (no 35s)
- `calculatePlates(100, 20, [20, 15, 10, 5, 2.5, 1.25])` → kg mode, `{ plates: [20, 20], remainder: 0 }`
- `calculatePlates(45, 45)` → `{ plates: [], remainder: 0 }` (just the bar)
- `calculatePlates(30, 45)` → error indicating weight is less than bar

---

## Phase 12: Body Weight & Measurements Tracking

Users care about both strength progress and body composition. Tracking body weight alongside workout data gives the complete picture. Adapted from PLAN.md Phase 13.

### 12.1 Create Firestore collection

New collection: `users/{userId}/measurements/{docId}`

```javascript
{
  date: "2026-04-11",          // YYYY-MM-DD
  weight: 185,                  // number
  unit: "lbs",                  // "lbs" | "kg"
  bodyFat: null,                // optional percentage
  notes: "Post-workout weigh-in", // optional
  timestamp: "2026-04-11T08:30:00Z"
}
```

### 12.2 Dashboard body weight entry widget

A small card on the dashboard for quick weight logging:

```html
<div class="bodyweight-card">
  <div class="bodyweight-header">
    <h3>Body Weight</h3>
    <span class="bodyweight-trend ${trend}">
      ${trendArrow} ${trendValue} lbs this week
    </span>
  </div>
  <div class="bodyweight-current">
    <span class="bodyweight-value">${latestWeight}</span>
    <span class="bodyweight-unit">${unit}</span>
    <span class="bodyweight-date">${lastLoggedDate}</span>
  </div>
  <button class="btn btn-small" onclick="showWeightEntryModal()">
    <i class="fas fa-plus"></i> Log Weight
  </button>
</div>
```

The entry modal should be minimal — a number input, optional notes, and a Save button. One-tap daily logging.

### 12.3 Weight trend chart on Stats page

Add a section to the Stats page with a line chart (Chart.js) showing:

- Body weight data points over time
- 7-day moving average line (smooths daily fluctuations)
- Time range selector matching the existing progress charts (3M, 6M, 1Y, All)

```javascript
function calculate7DayAverage(entries) {
  return entries.map((entry, i) => {
    const window = entries.slice(Math.max(0, i - 6), i + 1);
    const avg = window.reduce((sum, e) => sum + e.weight, 0) / window.length;
    return { date: entry.date, weight: avg };
  });
}
```

### 12.4 Optional body measurements (stretch goal)

If time allows, add tracking for: neck, chest, waist, hips, biceps, thighs. Show progress over time in the Stats page. This is a nice-to-have — weight alone covers 80% of the use case.

### 12.5 Tests to write

Add `tests/unit/body-measurements.test.js`:

- `calculate7DayAverage(entries)` — given 7+ entries, return correct moving average at each point
- Test with fewer than 7 entries (should average available data)
- Test with gaps in dates (moving average should still work on available points)
- Unit conversion: `convertMeasurementUnit(entry, 'kg')` — convert stored lbs to kg without mutating original
- Reject duplicate entries for the same date (or overwrite with latest)

---

## Phase 13: Data Export — CSV & JSON Backup

Expand the JSON export from Phase 8.2 with CSV support and a JSON import/restore capability. Adapted from PLAN.md Phase 14.

### 13.1 CSV export for workout history

Add a CSV export option alongside the existing JSON export. Generate a CSV with columns:

```
Date, Workout Name, Exercise, Equipment, Set #, Set Type, Reps, Weight, Unit, Notes, Duration (min)
```

```javascript
function generateCSV(workouts) {
  const headers = ['Date', 'Workout Name', 'Exercise', 'Equipment', 'Set #', 'Set Type', 'Reps', 'Weight', 'Unit', 'Notes', 'Duration (min)'];
  const rows = [headers.join(',')];

  for (const workout of workouts) {
    for (const [key, exercise] of Object.entries(workout.exercises || {})) {
      for (let i = 0; i < (exercise.sets || []).length; i++) {
        const set = exercise.sets[i];
        rows.push([
          workout.date,
          escapeCSV(workout.workoutType),
          escapeCSV(exercise.name || exercise.machine),
          escapeCSV(exercise.equipment || ''),
          i + 1,
          set.type || 'working',
          set.reps || '',
          set.weight || '',
          set.originalUnit || 'lbs',
          escapeCSV(exercise.notes || ''),
          workout.totalDuration ? Math.round(workout.totalDuration / 60) : ''
        ].join(','));
      }
    }
  }
  return rows.join('\n');
}

function escapeCSV(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```

### 13.2 JSON import/restore

Add an import function that reads a previously exported JSON file and writes to Firestore:

```javascript
async function importWorkoutData(jsonString) {
  const data = JSON.parse(jsonString);

  // Validate structure
  if (!data.version || !data.workouts) {
    throw new Error('Invalid export file format');
  }

  // Confirm with user: "This will import X workouts. Existing data will not be overwritten."
  const confirmed = await showConfirmDialog(
    `Import ${data.workouts.length} workouts?`,
    'Existing workouts will not be affected. Duplicate dates will create additional entries.'
  );
  if (!confirmed) return;

  // Write workouts (skip duplicates by checking docId)
  let imported = 0;
  for (const workout of data.workouts) {
    // Check if workout already exists
    const exists = await checkWorkoutExists(workout.docId || workout.date);
    if (!exists) {
      await saveImportedWorkout(workout);
      imported++;
    }
  }

  showNotification(`Imported ${imported} workouts`, 'success');
}
```

### 13.3 Tests to write

Add `tests/unit/data-export.test.js`:

- `generateCSV(workouts)` — correct headers, one row per set, handles commas/quotes in names
- `generateCSV([])` — empty array produces just headers
- Mixed units (lbs/kg) in same export — each row shows its original unit
- JSON export round-trip: export → import → compare data integrity
- `validateImportJSON(json)` — reject malformed JSON, missing required fields

---

## Phase 14: Social Features

The biggest architectural addition. Requires new Firestore collections, Cloud Functions for feed aggregation, and a privacy model. Adapted from PLAN.md Phase 15.

### 14.1 Activity feed

Create a shared feed where users can see each other's workouts:

- New Firestore collection: `feed/{docId}` with `{ userId, userName, userPhoto, workoutType, date, highlights, timestamp, privacy }`
- Feed UI on the dashboard or a new "Social" tab in the bottom nav
- Feed items show: user avatar, workout name, date, key stats (duration, volume), PR callouts
- Pull-to-refresh and infinite scroll (paginated queries)

```javascript
// Generate feed item after workout completion
async function createFeedItem(workout, userId, userProfile) {
  const highlights = extractWorkoutHighlights(workout); // PRs, total volume, exercise count
  const feedItem = {
    userId,
    userName: userProfile.displayName,
    userPhoto: userProfile.photoURL,
    workoutType: workout.workoutType,
    date: workout.date,
    highlights,
    timestamp: new Date().toISOString(),
    privacy: userProfile.feedPrivacy || 'friends', // 'public' | 'friends' | 'private'
  };
  await addDoc(collection(db, 'feed'), feedItem);
}
```

### 14.2 Privacy controls

Let users choose visibility for their feed posts:

- **Public** — visible to all app users
- **Friends** — visible only to users in their following list
- **Private** — only visible to themselves (effectively disables social)

Default to `friends`. Setting lives in `users/{userId}/preferences/settings.feedPrivacy`.

Privacy filtering on feed queries:
```javascript
async function loadFeed(currentUserId, following) {
  // Get public items from everyone
  // Get friends items from people in following list
  // Get own private items
  // Merge and sort by timestamp desc
}
```

### 14.3 Friend/follow system

- New subcollection: `users/{userId}/following/{followedUserId}`
- New subcollection: `users/{userId}/followers/{followerUserId}`
- "Add Friend" flow: search by email or display name, send follow request
- Follow requests stored in `users/{userId}/followRequests/{requestId}`
- Accept/decline from a notifications or friends page

### 14.4 PR celebrations

When a user hits a PR, optionally post it to the feed with celebration treatment:

- Distinct card style in the feed (gold accent, trophy icon)
- Other users can react (fire emoji, fist bump, etc.)
- Reactions stored as a subcollection on the feed item: `feed/{docId}/reactions/{userId}`

### 14.5 Shared workout challenges

Let a user create a challenge and invite friends:

- Challenge types: "Most total volume this week", "Most workouts this month", "Heaviest bench press"
- New collection: `challenges/{challengeId}` with `{ creator, title, type, metric, startDate, endDate, participants: [] }`
- Leaderboard view showing participant rankings
- Push notification when someone takes the lead

### 14.6 Tests to write

Add `tests/unit/social-feed.test.js`:

- `createFeedItem(workout, userId)` → produces correct structure with highlights
- `extractWorkoutHighlights(workout)` → extracts PRs, volume, exercise count
- `filterFeedByPrivacy(feedItems, viewerRelationship)` → public visible to all, friends only to followers, private only to owner

---

## Phase 15: Equipment Library

A gym-centric equipment management page. The core idea: tap a gym → see everything there → manage exercise assignments, form videos, and notes for each piece of equipment. This replaces the scattered equipment editing currently buried inside the exercise manager modal.

### 15.1 Equipment library — top-level navigation

Create `js/core/ui/equipment-library-ui.js` as a full-page section accessible from the More menu (bottom sheet) and sidebar.

**Entry point — location picker:**

When the user opens the equipment library, they first see their gyms:

```html
<div class="equipment-library">
  <div class="section-header">
    <h2 class="section-header__title">Equipment Library</h2>
    <button class="btn btn-primary btn-small" onclick="showAddEquipmentFlow()">
      <i class="fas fa-plus"></i> Add
    </button>
  </div>

  <!-- Location tabs / pills -->
  <div class="location-pills">
    <button class="category-pill active" onclick="filterEquipmentByLocation('all')">All</button>
    ${locations.map(loc => `
      <button class="category-pill" onclick="filterEquipmentByLocation('${loc.name}')">
        ${loc.name}
        <span class="pill-count">${loc.equipmentCount}</span>
      </button>
    `).join('')}
  </div>

  <!-- Search -->
  <div class="equipment-search-wrap">
    <i class="fas fa-search"></i>
    <input type="text" class="exercise-search" placeholder="Search equipment..."
           oninput="filterEquipmentBySearch(this.value)">
  </div>

  <!-- Equipment list -->
  <div id="equipment-list" class="equipment-list">
    <!-- Grouped by equipment type: Machines, Barbells, Dumbbells, Cable, Benches, Other -->
  </div>
</div>
```

**Equipment list items** — use `.row-card` pattern with type icon + name + exercise count + chevron:

```html
<div class="row-card equipment-item" onclick="openEquipmentDetail('${equipmentId}')">
  <div class="row-card__icon" style="background: ${typeColor}20; color: ${typeColor}">
    <i class="fas ${typeIcon}"></i>
  </div>
  <div class="row-card__content">
    <span class="row-card__title">${equipmentName}</span>
    <span class="row-card__subtitle">
      ${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}
      ${locations.length > 1 ? ` · ${locations.length} locations` : ''}
    </span>
  </div>
  <div class="row-card__action">
    <i class="fas fa-chevron-right"></i>
  </div>
</div>
```

Equipment type icon mapping:
```javascript
const EQUIPMENT_TYPE_ICONS = {
  'Machine':    { icon: 'fa-cog',        color: '#4A90D9' },
  'Barbell':    { icon: 'fa-dumbbell',   color: '#D96A4A' },
  'Dumbbell':   { icon: 'fa-dumbbell',   color: '#D9A74A' },
  'Cable':      { icon: 'fa-link',       color: '#7B4AD9' },
  'Bench':      { icon: 'fa-couch',      color: '#4AD9A7' },
  'Rack':       { icon: 'fa-border-all', color: '#D94A7A' },
  'Bodyweight': { icon: 'fa-person',     color: '#4AD9D9' },
  'Other':      { icon: 'fa-wrench',     color: 'var(--text-muted)' },
};
```

### 15.2 Equipment detail view — the hub for managing one piece of equipment

Tapping an equipment item opens a detail view with everything about that equipment in one place:

```html
<div class="equipment-detail">
  <!-- Header -->
  <div class="equipment-detail-header">
    <button class="btn-icon" onclick="closeEquipmentDetail()">
      <i class="fas fa-arrow-left"></i>
    </button>
    <h3>${equipmentName}</h3>
    <button class="btn-icon" onclick="showEquipmentOptions('${equipmentId}')">
      <i class="fas fa-ellipsis-h"></i>
    </button>
  </div>

  <!-- Type + locations summary -->
  <div class="equipment-detail-meta">
    <span class="equipment-type-badge" style="background: ${typeColor}20; color: ${typeColor}">
      <i class="fas ${typeIcon}"></i> ${equipmentType}
    </span>
    <div class="equipment-locations-list">
      ${locations.map(loc => `
        <span class="location-chip">
          <i class="fas fa-map-marker-alt"></i> ${loc}
        </span>
      `).join('')}
      <button class="btn-text btn-small" onclick="editEquipmentLocations('${equipmentId}')">
        <i class="fas fa-plus"></i> Add location
      </button>
    </div>
  </div>

  <!-- === EXERCISES SECTION — the key feature === -->
  <div class="section-header">
    <h4 class="section-header__title">Exercises</h4>
    <button class="section-header__action" onclick="assignExerciseToEquipment('${equipmentId}')">
      + Assign Exercise
    </button>
  </div>

  <div class="equipment-exercises-list">
    ${exercises.map(ex => `
      <div class="row-card">
        <div class="row-card__content">
          <span class="row-card__title">${ex.name}</span>
          <span class="row-card__subtitle">
            ${ex.videoUrl ? '<i class="fas fa-play-circle text-primary"></i> Video set' : '<i class="fas fa-video-slash text-muted"></i> No video'}
            · Last used ${ex.lastUsed || 'never'}
            ${ex.prWeight ? ` · PR: ${ex.prWeight} ${ex.prUnit}` : ''}
          </span>
        </div>
        <div class="row-card__actions" style="display: flex; gap: 8px;">
          <button class="btn-text" onclick="editEquipmentExerciseVideo('${equipmentId}', '${ex.name}')"
                  title="Set form video">
            <i class="fas fa-video"></i>
          </button>
          <button class="btn-text btn-text-danger" onclick="unassignExercise('${equipmentId}', '${ex.name}')"
                  title="Remove exercise">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
    `).join('')}
  </div>

  <!-- === FORM VIDEOS SECTION === -->
  <div class="section-header">
    <h4 class="section-header__title">Form Videos</h4>
  </div>
  <p class="text-muted" style="font-size: var(--font-sm); padding: 0 2px;">
    Videos are per-exercise. When you view an exercise during a workout with this equipment, the equipment-specific video shows instead of the generic one.
  </p>

  <!-- === NOTES SECTION === -->
  <div class="section-header">
    <h4 class="section-header__title">Notes</h4>
  </div>
  <textarea class="form-input equipment-notes" placeholder="e.g., Cable machine: setting 5 for chest fly, setting 8 for tricep pushdown"
            oninput="debouncedSaveEquipmentNotes('${equipmentId}', this.value)">${notes}</textarea>

  <!-- === PR HISTORY for this equipment === -->
  <div class="section-header">
    <h4 class="section-header__title">Personal Records</h4>
  </div>
  <div class="equipment-pr-list">
    ${prs.map(pr => `
      <div class="row-card">
        <div class="row-card__icon row-card__icon--warning">
          <i class="fas fa-trophy"></i>
        </div>
        <div class="row-card__content">
          <span class="row-card__title">${pr.exerciseName}</span>
          <span class="row-card__subtitle">${pr.weight} ${pr.unit} × ${pr.reps} reps · ${pr.date}</span>
        </div>
      </div>
    `).join('')}
  </div>
</div>
```

### 15.3 Assign exercise to equipment (+ multi-assign)

The "Assign Exercise" button opens the exercise library picker. The user can select one or multiple exercises to link to this equipment:

```javascript
async function assignExerciseToEquipment(equipmentId) {
  // Open exercise library in "picker" mode
  // User can select multiple exercises (checkbox mode)
  // On confirm, update the equipment document's exerciseTypes array
  // Also update each selected exercise's equipment field if it doesn't have one

  const selectedExercises = await showExercisePickerMulti();
  if (!selectedExercises?.length) return;

  const userId = AppState.currentUser.uid;
  const equipRef = doc(db, 'users', userId, 'equipment', equipmentId);

  await updateDoc(equipRef, {
    exerciseTypes: arrayUnion(...selectedExercises.map(e => e.name))
  });

  showNotification(`Assigned ${selectedExercises.length} exercise${selectedExercises.length > 1 ? 's' : ''}`, 'success');
  renderEquipmentDetail(equipmentId); // Refresh the view
}
```

**Unassign** removes the exercise from `exerciseTypes` but does NOT delete historical workout data (the equipment name stays in past workout documents — it's just no longer linked going forward):

```javascript
async function unassignExercise(equipmentId, exerciseName) {
  // Confirm: "Remove Leg Curl from Atlantis Leg Curl? Past workout data won't be affected."
  if (!confirm(`Remove "${exerciseName}" from this equipment? Past workouts won't be affected.`)) return;

  const userId = AppState.currentUser.uid;
  const equipRef = doc(db, 'users', userId, 'equipment', equipmentId);

  await updateDoc(equipRef, {
    exerciseTypes: arrayRemove(exerciseName),
    [`exerciseVideos.${exerciseName}`]: deleteField()  // Also remove exercise-specific video
  });

  showNotification('Exercise removed', 'success');
  renderEquipmentDetail(equipmentId);
}
```

### 15.4 Reassignment from equipment detail

Integrate Phase 7.4's equipment reassignment directly into the equipment detail view. From the exercise row, add a "Move to..." action:

```html
<button class="btn-text" onclick="showReassignEquipment('${equipmentId}', '${equipmentName}', '${ex.name}')"
        title="Reassign to different exercise">
  <i class="fas fa-exchange-alt"></i>
</button>
```

This triggers the same reassignment flow from Phase 7.4 (preview → confirm → batch update historical data), but launched from within the equipment library context instead of the exercise manager.

### 15.5 Add equipment flow

"Add" button at the top of the library opens a quick-add flow:

```html
<div class="add-equipment-flow">
  <input class="form-input" id="new-equip-name" placeholder="Equipment name (e.g., Hammer Strength Flat Bench)">

  <div class="equipment-type-grid">
    ${Object.entries(EQUIPMENT_TYPE_ICONS).map(([type, {icon, color}]) => `
      <button class="equipment-type-chip ${selected === type ? 'active' : ''}"
              onclick="selectEquipmentType('${type}')"
              style="--chip-color: ${color}">
        <i class="fas ${icon}"></i>
        <span>${type}</span>
      </button>
    `).join('')}
  </div>

  <div class="form-group">
    <label>Location</label>
    <select class="form-input" id="new-equip-location">
      ${locations.map(l => `<option value="${l.name}">${l.name}</option>`).join('')}
    </select>
  </div>

  <div class="form-group">
    <label>Exercises (optional — you can assign later)</label>
    <button class="btn btn-secondary btn-full" onclick="pickExercisesForNewEquipment()">
      <i class="fas fa-plus"></i> Select Exercises
    </button>
    <div id="new-equip-exercises" class="selected-exercises-chips"></div>
  </div>

  <button class="btn btn-primary btn-full" onclick="saveNewEquipment()">
    <i class="fas fa-check"></i> Save Equipment
  </button>
</div>
```

### 15.6 Auto-discover equipment from workout history

On first visit to the equipment library (or via a "Scan History" button), offer to import equipment from past workouts:

```javascript
async function discoverEquipmentFromHistory() {
  const workouts = await loadAllWorkouts();
  const discovered = new Map(); // equipmentName → { exercises: Set, locations: Set }

  workouts.forEach(w => {
    if (!w.exercises) return;
    Object.values(w.exercises).forEach((ex, i) => {
      if (!ex.equipment) return;
      const orig = w.originalWorkout?.exercises?.[i];
      if (!discovered.has(ex.equipment)) {
        discovered.set(ex.equipment, { exercises: new Set(), locations: new Set() });
      }
      const entry = discovered.get(ex.equipment);
      if (orig?.machine) entry.exercises.add(orig.machine);
      if (ex.equipmentLocation) entry.locations.add(ex.equipmentLocation);
    });
  });

  // Compare with existing equipment records
  // Show "We found X equipment in your history that isn't in your library yet"
  // Let user confirm which to import
}
```

### 15.7 Sync with workout logging

When a workout is in progress and the user selects equipment for an exercise:
- If the equipment exists in the library, auto-link and show the equipment-specific form video (Phase 7.5)
- If the equipment is NEW (not in the library), show a subtle prompt after the workout: "You used 'Life Fitness Lat Pulldown' for the first time. Add to your equipment library?"
- Auto-associate the equipment with the current GPS-detected location

### 15.8 Navigation integration

- Add "Equipment" item to the More menu bottom sheet (with wrench icon)
- Add "Equipment" to the sidebar nav under the Settings section
- Export all functions and assign to `window` in `main.js`:
  - `openEquipmentLibrary`, `closeEquipmentDetail`, `filterEquipmentByLocation`, `filterEquipmentBySearch`
  - `openEquipmentDetail`, `assignExerciseToEquipment`, `unassignExercise`
  - `showAddEquipmentFlow`, `saveNewEquipment`, `discoverEquipmentFromHistory`
  - `editEquipmentExerciseVideo`, `editEquipmentLocations`, `showEquipmentOptions`

---

## Phase 16: Equipment-Based Plan Builder

Build workout plans based on available equipment at a specific location. Adapted from ENHANCEMENTS.md. Depends on Phase 15.

### 16.1 "What can I do today?" feature

Based on the user's current GPS location (or manually selected gym):

1. Look up equipment at that location from the equipment manager
2. Filter the exercise library to only exercises possible with available equipment
3. Suggest workout templates that can be fully completed with available equipment
4. Flag any template exercises that require equipment not at this location

### 16.2 Auto-suggest exercises

When building a template or adding exercises mid-workout:

- Show a "Suggested for this gym" section in the exercise picker
- Based on equipment at the current/selected location
- Rank by: exercises the user has done before > popular exercises > all available

### 16.3 Equipment availability awareness — SKIPPED

~~Optional stretch goal — skipped in favor of shipping 16.1 + 16.2.~~

---

## Phase 17: AI Training Coach

An intelligent training advisor that combines a lightweight rules engine (always running, free) with on-demand Claude API analysis (periodic, paid per call). The rules engine provides real-time dashboard insights. The AI coach provides deeper analysis on a natural training cadence — not every session, but when there's enough new data to matter.

### 17.1 Training analysis triggers

The AI coach should NOT run on every app load or every workout. It runs when:

1. **Periodic review (primary trigger):** After 6+ workouts over 14 days, automatically surface a "Training review available" card on the dashboard. This is the natural mesocycle cadence — enough data to spot trends, not so frequent it's noise.
2. **Plateau detection (rules engine trigger):** When the rules engine detects 3+ weeks of no progression on a key lift, nudge: "Your bench has stalled at 185 for 3 weeks. Want help breaking through?"
3. **After DEXA scan entry (Phase 18 trigger):** When new body composition data is entered, offer immediate analysis since the user just got new information.
4. **On demand:** User taps "Review my training" or "Plan my week" in the AI Coach section whenever they want.

Store the last analysis timestamp in `users/{userId}/preferences/settings.lastCoachAnalysis` to avoid re-triggering too soon.

### 17.2 Rules engine — real-time dashboard insights (no API cost)

Create `js/core/features/training-insights.js`. This runs on workout completion and dashboard load using local data only.

**Volume tracking per muscle group:**
```javascript
/**
 * Calculate weekly volume (sets) per muscle group from recent workouts.
 * Compare against evidence-based landmarks:
 * - Minimum Effective Volume (MEV): ~6-8 sets/muscle/week
 * - Maximum Recoverable Volume (MRV): ~15-25 sets/muscle/week (varies by muscle)
 * - Sweet spot for most: 10-20 sets/muscle/week
 */
export function analyzeWeeklyVolume(workouts, exerciseDatabase) {
  const volumeByPart = {};

  for (const workout of workouts) {
    for (const exercise of Object.values(workout.exercises || {})) {
      const bodyPart = exercise.bodyPart || getBodyPartForExercise(exercise.name, exerciseDatabase);
      if (!bodyPart) continue;

      const completedSets = (exercise.sets || []).filter(s =>
        s.completed && (s.type || 'working') !== 'warmup'
      ).length;

      volumeByPart[bodyPart] = (volumeByPart[bodyPart] || 0) + completedSets;
    }
  }

  return Object.entries(volumeByPart).map(([part, sets]) => ({
    bodyPart: part,
    weeklySets: sets,
    status: sets < 8 ? 'low' : sets > 22 ? 'high' : 'good',
    recommendation: sets < 8
      ? `Add ${8 - sets} more sets of ${part} this week`
      : sets > 22
        ? `Consider reducing ${part} volume to aid recovery`
        : null,
  }));
}
```

**Progressive overload detection:**
```javascript
/**
 * Detect exercises where the user has plateaued (no weight/rep increase
 * over the last N sessions).
 */
export function detectPlateaus(exerciseHistory, windowWeeks = 3) {
  const plateaus = [];

  for (const [exerciseName, sessions] of Object.entries(exerciseHistory)) {
    const recent = sessions.filter(s =>
      daysSince(s.date) <= windowWeeks * 7
    );
    if (recent.length < 3) continue;

    const maxWeights = recent.map(s => Math.max(...s.sets.map(set => set.weight || 0)));
    const isFlat = maxWeights.every(w => w === maxWeights[0]);

    if (isFlat) {
      plateaus.push({
        exercise: exerciseName,
        weight: maxWeights[0],
        weeks: windowWeeks,
        suggestion: `Try adding 5 lbs or an extra rep per set`,
      });
    }
  }

  return plateaus;
}
```

**Deload detection:**
```javascript
/**
 * If user has trained 5+ days/week for 4+ consecutive weeks,
 * suggest a deload week.
 */
export function checkDeloadNeeded(workoutDates) {
  // Count weeks with 5+ workout days in the last 6 weeks
  // If 4+ consecutive weeks at 5+ days, suggest deload
}
```

**Frequency analysis:**
```javascript
/**
 * Check how often each muscle group is trained per week.
 * Flag muscles hit <1x/week or >4x/week.
 */
export function analyzeFrequency(workouts, weeks = 4) {
  // Group workouts by week, count body part appearances per week
  // Return average frequency per body part
}
```

**Dashboard rendering:**

Add a "Training Insights" card to the dashboard (in `dashboard-ui.js`) that shows 1-3 of the most actionable insights:

```html
<div class="insights-card">
  <h3><i class="fas fa-brain"></i> Training Insights</h3>

  <!-- Volume insight -->
  <div class="insight-item insight-warning">
    <span class="insight-text">Chest volume is low this week (4 sets). Add 4-6 more sets.</span>
  </div>

  <!-- Plateau insight -->
  <div class="insight-item insight-info">
    <span class="insight-text">Bench Press has plateaued at 185 lbs for 3 weeks.</span>
    <button class="btn btn-small" onclick="showCoachAnalysis('plateau', 'Bench Press')">
      Get advice
    </button>
  </div>

  <!-- Positive reinforcement -->
  <div class="insight-item insight-success">
    <span class="insight-text">Squat is up 15 lbs over the last month. Keep it up!</span>
  </div>
</div>
```

Color coding: green for positive trends, yellow for low volume / plateau warnings, red for overtraining / deload needed.

### 17.3 Claude API coach — on-demand deep analysis

Create a Firebase Cloud Function `functions/ai-coach.js` that calls the Claude API.

**Cloud Function:**
```javascript
const { onCall } = require('firebase-functions/v2/https');
const Anthropic = require('@anthropic-ai/sdk');

const TRAINING_SCIENCE_PROMPT = `You are an expert strength and conditioning coach integrated into the Big Surf workout tracker app. You analyze training data and provide actionable recommendations.

Key principles you follow:
- Progressive overload is the primary driver of strength and hypertrophy
- Volume landmarks: MEV ~6-8 sets/muscle/week, MRV ~15-25 sets/muscle/week
- Most people grow optimally at 10-20 hard sets per muscle group per week
- Training frequency of 2-3x per muscle group per week is optimal for most
- Deload every 4-6 weeks of hard training (reduce volume 40-50%)
- Prioritize compound movements, supplement with isolation
- When plateau detected, suggest: increase reps, add a set, microload, change variation

When DEXA data is available:
- Identify bilateral imbalances (>5% difference = meaningful)
- Suggest unilateral work for weaker sides
- Correlate training volume with lean mass changes between scans
- Provide body composition context (body fat ranges, lean mass benchmarks)

Always be specific: name exercises, give exact set/rep/weight targets based on their recent numbers.
Keep recommendations concise and actionable — these are read on a phone at the gym.
Format as short bullet points, not paragraphs.`;

exports.getTrainingRecommendation = onCall(async (request) => {
  const userId = request.auth.uid;
  if (!userId) throw new Error('Authentication required');

  // Rate limiting: max 1 call per 24 hours per user (prevent abuse)
  const lastCall = await getLastCoachCallTimestamp(userId);
  if (lastCall && Date.now() - lastCall < 24 * 60 * 60 * 1000) {
    throw new Error('Coach is available once per day. Try again tomorrow.');
  }

  // Gather user data from Firestore
  const [workouts, prs, dexa, preferences] = await Promise.all([
    getRecentWorkouts(userId, 56), // last 8 weeks
    getPRHistory(userId),
    getLatestDEXA(userId),         // null if no DEXA data
    getUserPreferences(userId),
  ]);

  // Build structured training context (minimize tokens)
  const context = buildTrainingContext(workouts, prs, dexa, preferences);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',  // Sonnet for cost efficiency
    max_tokens: 1500,
    system: TRAINING_SCIENCE_PROMPT,
    messages: [{
      role: 'user',
      content: `Here is my training data from the last ${context.weeks} weeks:\n\n${context.summary}\n\n${request.data.question || 'Review my training and suggest what to focus on next week.'}`
    }],
  });

  // Save response and timestamp
  await saveCoachResponse(userId, {
    question: request.data.question,
    response: response.content[0].text,
    timestamp: new Date().toISOString(),
    dataContext: { weeks: context.weeks, workoutCount: workouts.length },
  });

  return {
    recommendation: response.content[0].text,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
});

/**
 * Build a token-efficient summary of training data.
 * Aim for ~1500-2000 tokens of context to keep API costs low.
 */
function buildTrainingContext(workouts, prs, dexa, preferences) {
  const weeks = Math.ceil((Date.now() - new Date(workouts[workouts.length - 1]?.date).getTime()) / (7 * 24 * 60 * 60 * 1000));

  let summary = '';

  // Volume by muscle group per week (compact table format)
  summary += 'Weekly volume (sets per muscle group, last 4 weeks):\n';
  summary += 'Week | Chest | Back | Shoulders | Arms | Legs | Core\n';
  // ... aggregate and format ...

  // Key lift progression (compact)
  summary += '\nKey lift trends (max weight per session):\n';
  // e.g., "Bench: 175→180→180→185 | Squat: 225→225→230→235"

  // Current PRs
  summary += '\nCurrent PRs:\n';
  // e.g., "Bench: 185x5 | Squat: 235x5 | Deadlift: 275x5"

  // Frequency
  summary += `\nAvg training days/week: ${(workouts.length / weeks).toFixed(1)}\n`;

  // DEXA if available
  if (dexa) {
    summary += `\nLatest DEXA (${dexa.date}):\n`;
    summary += `Body fat: ${dexa.totalBodyFat}% | Lean mass: L-arm ${dexa.leanMass.leftArm}lb, R-arm ${dexa.leanMass.rightArm}lb, L-leg ${dexa.leanMass.leftLeg}lb, R-leg ${dexa.leanMass.rightLeg}lb, Trunk ${dexa.leanMass.trunk}lb\n`;
  }

  // User preferences
  summary += `\nUnit: ${preferences.unit || 'lbs'} | Weekly goal: ${preferences.weeklyGoal || 5} days | Available equipment: ${preferences.equipment || 'full gym'}\n`;

  return { summary, weeks };
}
```

### 17.4 Client-side AI Coach UI

Create `js/core/features/ai-coach-ui.js` for the frontend:

```javascript
/**
 * Show the AI Coach modal with options for analysis type.
 */
export function showAICoach() {
  const modal = document.getElementById('ai-coach-modal');

  modal.querySelector('.coach-content').innerHTML = `
    <div class="coach-header">
      <i class="fas fa-brain"></i>
      <h2>AI Coach</h2>
      <p class="coach-subtitle">Powered by your last ${weeksOfData} weeks of training data</p>
    </div>

    <div class="coach-prompts">
      <button class="coach-prompt-card" onclick="askCoach('Review my training and suggest what to focus on next week.')">
        <i class="fas fa-calendar-week"></i>
        <span>Plan next week</span>
      </button>
      <button class="coach-prompt-card" onclick="askCoach('Analyze my volume distribution and identify any muscle groups I am neglecting or overtraining.')">
        <i class="fas fa-chart-pie"></i>
        <span>Volume check</span>
      </button>
      <button class="coach-prompt-card" onclick="askCoach('Identify exercises where I have plateaued and suggest strategies to break through.')">
        <i class="fas fa-arrow-trend-up"></i>
        <span>Break plateaus</span>
      </button>
      <button class="coach-prompt-card" onclick="showCoachFreeform()">
        <i class="fas fa-comment"></i>
        <span>Ask anything</span>
      </button>
    </div>

    <div id="coach-response" class="coach-response hidden">
      <!-- AI response renders here -->
    </div>

    <div id="coach-freeform" class="coach-freeform hidden">
      <textarea id="coach-question" placeholder="Ask your coach anything..." rows="3"></textarea>
      <button class="btn btn-primary" onclick="askCoach(document.getElementById('coach-question').value)">
        Ask
      </button>
    </div>
  `;

  openModal(modal);
}

/**
 * Call the Cloud Function and display the response.
 */
async function askCoach(question) {
  const responseDiv = document.getElementById('coach-response');
  responseDiv.classList.remove('hidden');
  responseDiv.innerHTML = '<div class="coach-loading"><i class="fas fa-spinner fa-spin"></i> Analyzing your training data...</div>';

  try {
    const { httpsCallable } = await import('firebase/functions');
    const fn = httpsCallable(functions, 'getTrainingRecommendation');
    const result = await fn({ question });

    responseDiv.innerHTML = `
      <div class="coach-recommendation">
        ${formatCoachResponse(result.data.recommendation)}
      </div>
      <div class="coach-meta">
        <span class="coach-timestamp">Analysis based on your data as of today</span>
      </div>
    `;
  } catch (error) {
    if (error.message.includes('once per day')) {
      responseDiv.innerHTML = `
        <div class="coach-rate-limit">
          <i class="fas fa-clock"></i>
          <p>Coach is available once per day. Check back tomorrow, or review your training insights on the dashboard.</p>
        </div>
      `;
    } else {
      responseDiv.innerHTML = `<div class="coach-error">Unable to reach coach. Check your connection and try again.</div>`;
    }
  }
}
```

### 17.5 Navigation and access points

Add the AI Coach to multiple access points:

1. **Dashboard insights card** (from 17.2) — "Get advice" button on plateau/volume warnings calls `showAICoach()` with pre-filled context
2. **More menu / bottom sheet** — "AI Coach" item with a brain icon
3. **After workout completion** (Phase 6.1 summary screen) — "Get coaching feedback on this workout" link
4. **Stats page** — "Analyze my progress" button next to the charts

### 17.6 Cost management and rate limiting

- Use Claude Sonnet (not Opus) for cost efficiency — training analysis doesn't need Opus-level reasoning
- Rate limit: 1 full analysis per 24 hours per user (stored in Firestore)
- Keep context compact: ~1500-2000 input tokens by summarizing data as tables, not raw JSON
- Estimated cost: ~$0.01-0.03 per analysis call
- Optional: show previous coach responses from `users/{userId}/coachHistory/{docId}` so users can review past advice without making a new API call
- Consider a monthly cap (e.g., 15 analyses/month) if costs need further control

### 17.7 Storing and reviewing past coaching sessions

Save each coach interaction for the user to review:

```javascript
// Firestore: users/{userId}/coachHistory/{docId}
{
  question: "Plan my next week",
  response: "Based on your data...",
  timestamp: "2026-04-11T10:30:00Z",
  dataSnapshot: {
    weeklyVolume: { Chest: 12, Back: 16, ... },
    recentPRs: ["Bench 185x5", "Squat 235x5"],
    workoutCount: 14,
    weeksAnalyzed: 4,
  }
}
```

Show a "Past Reviews" section in the AI Coach modal so users can see how recommendations evolved over time.

### 17.8 Dependencies and install

**New npm dependency for Cloud Functions:**
```bash
cd functions
npm install @anthropic-ai/sdk
```

**Environment variable:**
Store the Anthropic API key as a Firebase secret:
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

Access in the function:
```javascript
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```

### 17.9 Tests to write

Add `tests/unit/training-insights.test.js` (rules engine — pure functions, no API):

- `analyzeWeeklyVolume(workouts)` — correctly counts sets per body part, excludes warmup sets
- Volume status: 4 sets → 'low', 14 sets → 'good', 25 sets → 'high'
- `detectPlateaus(history, 3)` — detects flat weight over 3 sessions, ignores exercises with <3 sessions
- `checkDeloadNeeded(dates)` — 4 weeks at 5+ days → suggests deload, 3 weeks → no suggestion
- `analyzeFrequency(workouts, 4)` — correct average per body part per week
- `buildTrainingContext(workouts, prs, dexa, prefs)` — produces string under 2000 tokens, includes all sections

Add `tests/unit/ai-coach-integration.test.js` (mock the API call):

- `getTrainingRecommendation` returns structured response with recommendation text
- Rate limiting: second call within 24h throws error
- Missing auth throws error
- Empty workout history returns a useful message ("Not enough data yet")

---

## Phase 18: DEXA Integration

Integration with DEXA body composition scans using hybrid PDF upload + AI extraction. Works with any DEXA provider (Bodyspec, DexaFit, university labs, hospitals, etc.). Depends on Phase 12 (body measurements infrastructure) and Phase 17 (Cloud Functions + Claude API).

### 18.1 DEXA scan upload (hybrid approach)

**PDF upload with AI-powered extraction:**

1. User uploads DEXA scan report PDF (downloaded from their provider's patient portal)
2. PDF stored in Firebase Storage: `users/{userId}/dexa-reports/{scanId}.pdf`
3. Cloud Function sends PDF to Claude API for structured data extraction
4. Extracted values pre-fill the entry form for user review
5. User confirms/corrects values, then saves

**Extracted fields (pre-filled from PDF):**

- Scan date, provider name
- Total body fat %
- Regional body fat % (arms, legs, trunk)
- Lean mass by region: `{ leftArm, rightArm, leftLeg, rightLeg, trunk }` (lbs or kg)
- Fat mass by region (lbs or kg)
- Bone mineral density (BMD) T-score and Z-score
- Visceral adipose tissue (VAT) estimate
- Total body weight at time of scan

**Claude API extraction prompt strategy:**

- Send PDF as document input with structured extraction prompt
- Request JSON output matching the Firestore schema
- Include confidence scores per field so the UI can highlight low-confidence values for user attention
- Handle varied report formats (different providers use different layouts)

**Manual entry fallback:**

- Full form available if user prefers to type values directly
- Same form used for review/correction after AI extraction
- All fields optional except date and total body fat %

**Firestore schema:** `users/{userId}/dexa/{scanId}`

```javascript
{
  date: "2026-04-01",                    // Scan date (YYYY-MM-DD)
  provider: "Bodyspec",                  // Optional provider name
  totalBodyFat: 18.5,                    // Total body fat %
  regionFat: {                           // Regional body fat % (optional)
    leftArm: 16.2, rightArm: 15.8,
    leftLeg: 20.1, rightLeg: 19.7,
    trunk: 19.3
  },
  leanMass: {                            // Regional lean mass in lbs (optional)
    leftArm: 7.8, rightArm: 8.1,
    leftLeg: 20.3, rightLeg: 21.0,
    trunk: 62.5
  },
  fatMass: {                             // Regional fat mass in lbs (optional)
    leftArm: 1.5, rightArm: 1.5,
    leftLeg: 5.1, rightLeg: 4.9,
    trunk: 15.2
  },
  massUnit: "lbs",                       // Unit for mass values
  boneDensity: {                         // Optional
    tScore: 1.2,
    zScore: 1.5
  },
  vat: 0.8,                             // Visceral adipose tissue (lbs, optional)
  totalWeight: 185.3,                    // Body weight at scan time (optional)
  reportUrl: "dexa-reports/scan123.pdf", // Firebase Storage path
  notes: "First scan of 2026",
  extractionConfidence: {                // AI confidence per field (0-1)
    totalBodyFat: 0.98,
    leanMass: 0.92,
    boneDensity: 0.85
  },
  createdAt: "2026-04-01T10:00:00.000Z",
  version: "1.0"
}
```

### 18.2 Lagging muscle group detection

Compare lean mass distribution across body regions:

```javascript
function identifyLaggingGroups(dexaData) {
  const { leftArm, rightArm, leftLeg, rightLeg, trunk } = dexaData.leanMass;

  const imbalances = [];

  // Left-right comparison (>5% difference = imbalance)
  const armDiff = Math.abs(leftArm - rightArm) / Math.max(leftArm, rightArm);
  if (armDiff > 0.05) {
    imbalances.push({
      type: 'arm-imbalance',
      weaker: leftArm < rightArm ? 'left' : 'right',
      difference: (armDiff * 100).toFixed(1) + '%'
    });
  }

  // Similar for legs
  const legDiff = Math.abs(leftLeg - rightLeg) / Math.max(leftLeg, rightLeg);
  if (legDiff > 0.05) {
    imbalances.push({
      type: 'leg-imbalance',
      weaker: leftLeg < rightLeg ? 'left' : 'right',
      difference: (legDiff * 100).toFixed(1) + '%'
    });
  }

  // Trunk-to-limb ratio analysis
  // Compare to population norms if available

  return imbalances;
}
```

### 18.3 Workout recommendations

Based on identified imbalances:

- Suggest unilateral exercises for the weaker side
- Recommend volume adjustments (more sets for lagging groups)
- Track progress between DEXA scans (correlate workout history with composition changes)
- Show "Recommended focus areas" on the dashboard

### 18.4 Progress correlation

On the Stats page, add a section showing:

- DEXA scan timeline with body fat % and lean mass trends
- Overlay with workout volume by body part to show if training is addressing weak areas
- Before/after comparison between scans
- Lean mass change vs. training volume scatter plot

---

## Phase 19: Community Gym Equipment Database

Crowdsourced database of gym equipment configurations. Adapted from ENHANCEMENTS.md. Depends on Phase 15 (Equipment Manager) and requires significant backend infrastructure.

### 19.1 Gym profiles

New top-level Firestore collection: `gyms/{gymId}`

```javascript
{
  name: "Gold's Gym - Venice",
  address: "360 Hampton Dr, Venice, CA 90291",
  coordinates: { lat: 33.9925, lng: -118.4670 },
  equipment: [
    { name: "Flat Bench", type: "Bench", brand: "Hammer Strength", count: 4 },
    { name: "Power Rack", type: "Rack", brand: "Rogue", count: 6 },
    // ...
  ],
  contributors: ["userId1", "userId2"],
  lastUpdated: "2026-04-11",
  verificationCount: 12,
  rating: 4.5,
}
```

### 19.2 Contribution system

- Users can submit equipment lists for public gyms they visit
- Verification system: other users confirm or update submissions
- Reputation points for contributors
- Moderation: flag incorrect or spam entries

### 19.3 Gym search

- Search by name, address, or "near me" (GPS)
- Filter by equipment type ("gyms with a reverse hyper within 5 miles")
- Import gym equipment to personal equipment list with one tap

### 19.4 Privacy controls

- Personal/home gym setups remain private by default
- Users opt-in to contributing to public gym profiles
- No personal data attached to gym contributions (anonymous by default, optional attribution)

### 19.5 Backend requirements

This phase requires Cloud Functions infrastructure:

- Gym search indexing (consider Algolia or Firestore composite indexes)
- Contribution aggregation (merge multiple users' equipment submissions)
- Spam detection and moderation queue
- Rate limiting on submissions
- Consider using Firebase Extensions or a dedicated API service

---

## Implementation Order & Dependencies

```
Phase 0  (Tech Debt)          → No dependencies, do first
Phase 1  (CSS Fixes)          → No dependencies, can parallel with Phase 0
Phase 2  (Active Workout)     → Depends on Phase 0 (config module)
Phase 3  (Reorder)            → Depends on Phase 2 (exercise card changes)
Phase 4  (Templates)          → Depends on Phase 1 (layout fixes)
Phase 5  (Dashboard)          → Depends on Phase 1 (CSS) and Phase 4 (empty states)
Phase 6  (Completion)         → Depends on Phase 2 (set completion data)
Phase 7  (Polish)             → Depends on Phases 2-6 (builds on all UI changes)
Phase 7A (Design System)      → Depends on Phase 7 (polish done first), Phase 5 (dashboard redesign)
Phase 8  (New Features)       → Depends on Phase 7A (design tokens), Phase 2 (set types), Phase 5 (settings)
Phase 9  (Performance)        → Can run after Phase 2, parallel with later phases
Phase 10 (Supersets)          → Depends on Phase 3 (reorder/grouping UI) and Phase 2 (exercise cards)
Phase 11 (Plate Calculator)   → Depends on Phase 2 (exercise modal) and Phase 8.3 (settings for plate prefs)
Phase 12 (Body Weight)        → Depends on Phase 5 (dashboard layout) and Phase 8.3 (settings for unit prefs)
Phase 13 (Data Export)        → Depends on Phase 8.2 (JSON export foundation) and Phase 8.3 (More menu)
Phase 14 (Social)             → Depends on Phase 6 (completion summary for share hooks), Phase 9 (performance)
Phase 15 (Equipment Library)  → Depends on Phase 5 (More menu), Phase 7.4 (reassignment), Phase 7.5 (form videos), Phase 7A (design tokens). Moved to Sprint 3.
Phase 16 (Equipment Planner)  → Depends on Phase 15 (Equipment Manager)
Phase 17 (AI Coach)           → Rules engine: Depends on Phase 9 (perf). API: Depends on Cloud Functions setup.
Phase 18 (DEXA Integration)   → Depends on Phase 12 (body measurements), Phase 17 (AI Coach for interpretation)
Phase 19 (Community Gym DB)   → Depends on Phase 15 (Equipment Manager), requires backend infrastructure
```

**Suggested execution order:**

**Sprint 1 — Foundation & Core Workflow (highest impact):**
1. Phase 0 + Phase 1 (in parallel — cleanup + CSS fixes)
2. Phase 2 (core workout rework — biggest impact)
3. Phase 3 (reorder — builds on Phase 2 card changes)

**Sprint 2 — Dashboard, Templates & Completion:**
4. Phase 5 (dashboard fixes)
5. Phase 4 (template flow)
6. Phase 6 (completion screen)

**Sprint 3 — Polish, Design System, Equipment & Core New Features:**
7. Phase 7 (visual polish — icon fixes, badge fixes, calendar legend, equipment reassignment, form videos)
8. Phase 7A (design system & app-wide visual consistency — CSS split, token migration, per-screen redesigns)
9. Phase 15 (equipment library — gym-centric equipment management, exercise assignment, form videos per equipment)
10. Phase 8 (new features — settings, onboarding, set types, data export)
11. Phase 9 (performance — ongoing)

**Sprint 4 — Advanced Training Features:**
12. Phase 10 (superset & circuit support)
13. Phase 11 (plate calculator)

**Sprint 5 — Health & Data:**
14. Phase 12 (body weight & measurements)
15. Phase 13 (CSV export & JSON import)

**Sprint 6 — Intelligence & Social:**
16. Phase 17 (AI Coach — rules engine first, then Claude API integration)
17. Phase 14 (social features — activity feed, PR sharing, challenges)

**Sprint 7 — Equipment Planner & Ecosystem:**
18. Phase 16 (equipment-based plan builder — depends on Phase 15)

**Sprint 8 — Body Composition & Community (aspirational):**
19. Phase 18 (DEXA integration — powered by Phase 17 AI Coach)
20. Phase 19 (community gym equipment database)

---

## Testing Checklist

After each phase, verify on a 375px mobile viewport:

### Core Workflow (Phases 0-3)
- [ ] App loads without console errors
- [ ] No unused window exports causing errors
- [ ] Config values are imported from config.js, not hardcoded
- [ ] Can start a workout from dashboard in 2 taps
- [ ] Can start a workout from template selection in 3 taps
- [ ] Exercise cards are clearly tappable (chevron, hint text)
- [ ] Set logging works with correct defaults from last session (grey placeholder text)
- [ ] Per-set completion checkboxes toggle correctly
- [ ] Completing all sets auto-marks exercise complete
- [ ] Swipe-to-delete works on set rows
- [ ] Rest timer auto-starts after set completion
- [ ] Rest timer visible in workout header — compact/subtle, not oversized teal pill
- [ ] Header timer shows countdown, "GO!" on completion, vibrates
- [ ] Exercises can be reordered via drag-and-drop without losing data
- [ ] Exercise swap/replace filters by same muscle group
- [ ] Action button row compact: Finish hero button + icon row for Add/More/Cancel
- [ ] Completed exercises auto-sort to bottom with "Completed" separator
- [ ] Auto-scroll to next incomplete exercise after completing one
- [ ] kg values show as whole numbers or .5 increments (not decimals)
- [ ] Workout history shows weights in user's preferred unit (not mixed lbs/kg)
- [ ] Stats charts convert all data points to user's preferred display unit
- [ ] Exercise detail modal header is clean: name → equipment/location meta → action row
- [ ] "Finish" button doesn't show false "Operation failed" error
- [ ] "Finish" button disabled after first tap to prevent double submission

### Dashboard & Templates (Phases 4-5)
- [ ] No blank space issues on any screen
- [ ] Weekly goal card displays correctly (no clipping, bar at 0% when empty)
- [ ] In-progress banner appears when resuming app with active workout
- [ ] Calendar shows workout history without red X marks
- [ ] Calendar has legend explaining indicators
- [ ] Calendar dates with workouts are tappable → shows workout details
- [ ] More menu slides up as bottom sheet with drag handle
- [ ] "Workouts" vs "Tracked" labels are distinct and meaningful
- [ ] Locations section hidden when no locations saved
- [ ] Empty states appear with CTAs when no data exists
- [ ] Recent workout types shown at top of template selection
- [ ] Favorites section appears in exercise picker

### Completion & Polish (Phases 6-7)
- [ ] Workout completion shows summary modal (duration, volume, sets, exercises)
- [ ] PRs highlighted on completion summary
- [ ] Volume comparison to last session shown ("+X% vs last time")
- [ ] Workout-level notes field works on completion screen
- [ ] "Save as Template" is in overflow menu, not cluttering main workout view
- [ ] ABCDE badge shows "Note:" prefix
- [ ] Category icons are consistent across exercise library
- [ ] All modals close on backdrop tap and Escape key
- [ ] Equipment reassignment: can move equipment from wrong exercise to correct one
- [ ] Equipment reassignment: historical workouts updated with correct exercise name
- [ ] Equipment reassignment: templates updated with correct exercise name
- [ ] Equipment reassignment: equipment document `exerciseTypes` array updated
- [ ] Equipment reassignment: progress indicator shown during batch update
- [ ] Equipment reassignment: confirmation modal shows affected workout count before committing
- [ ] Form videos: equipment-specific video shows when available (priority 1)
- [ ] Form videos: exercise default video shows as fallback when no equipment video (priority 2)
- [ ] Form videos: "No video" state shows "Add form video" prompt (priority 3)
- [ ] Form videos: source label shows "Video for [equipment]" vs "Default [exercise] form"
- [ ] Form videos: per-exercise video URLs editable in equipment editor
- [ ] Form videos: quick "Add video" prompt during active workout (dismissible, once per combo per session)
- [ ] Form videos: YouTube URL conversion works for watch, shorts, and youtu.be formats
- [ ] Form videos: video badge icon appears on exercise cards that have a video available
- [ ] Form videos: hiding video stops iframe playback (src cleared)

### Design System & Visual Consistency (Phase 7A)
- [ ] All design tokens defined in `tokens.css` (font scale, radius scale, category colors, badge colors, animation durations, z-index)
- [ ] `style.css` split into modular files under `styles/` (each < 500 lines)
- [ ] No duplicate CSS rules remain after consolidation
- [ ] All cards use `.hero-card` or `.row-card` base pattern (no one-off card classes)
- [ ] No hardcoded hex colors in CSS — all reference `var(--*)` tokens
- [ ] No bare `rem` font sizes — all use `var(--font-*)` tokens
- [ ] No inline `style=` in JS-generated HTML except dynamic values (width %, SVG coords)
- [ ] Category color accent bars appear consistently: dashboard, templates, active workout, history
- [ ] Template selection shows flat list with filter pills, color-coded cards, last-used dates
- [ ] Active workout exercise cards show left accent bar (grey/teal/green by status) + mini progress ring + set chips preview
- [ ] Stats page summary cards, chart containers, and session items use design system patterns
- [ ] Exercise library modal uses `.row-card` for items and proper category grid styling
- [ ] Location management items use `.row-card` pattern
- [ ] All interactive elements have `:active` scale feedback
- [ ] All modals use consistent entrance animation
- [ ] All screens have styled empty states with CTA buttons
- [ ] Skeleton loading placeholders appear on dashboard during data fetch
- [ ] Page transition animation duration matches `var(--anim-normal)` (not hardcoded in JS)
- [ ] App feels visually cohesive navigating between all screens at 375px width

### New Features (Phase 8)
- [ ] Warmup/working/dropset/failure set types toggle on each set row
- [ ] Warmup sets display muted and excluded from PR calculations
- [ ] JSON export downloads complete data file
- [ ] Settings page accessible from More menu with gear icon
- [ ] Settings grouped into clear sections (Workout, Goals, Plate Calc, AI Coach, Data)
- [ ] Weight unit toggle in settings changes global default
- [ ] Rest timer duration selectable (30s to 5 min presets)
- [ ] Per-exercise rest timer overrides work (e.g., Squat = 3 min)
- [ ] Rest timer auto-start toggle respected during active workout
- [ ] Weekly goal picker updates dashboard progress ring
- [ ] All settings save immediately on change (debounced Firestore write)
- [ ] Settings persist across sessions and devices (stored in Firestore)
- [ ] Settings merge correctly with defaults (new settings added in future updates don't break)
- [ ] Onboarding flow shows on first login, sets initial settings, skips on subsequent logins

### Performance (Phase 9)
- [ ] Exercise history cache prevents redundant Firebase queries
- [ ] Firebase reads batched with Promise.all where independent
- [ ] All icon-only buttons have aria-labels
- [ ] Modals trap focus and close on Escape
- [ ] Firebase save operations retry on failure

### Advanced Features (Phases 10-13)
- [ ] Superset exercises display with visual grouping (bracket/bar)
- [ ] Rest timer skips between superset exercises, starts after full round
- [ ] Template editor supports grouping exercises into supersets
- [ ] Plate calculator shows correct breakdown for standard weights
- [ ] Plate calculator works in both lbs and kg
- [ ] Plate calculator accessible from weight inputs and standalone page
- [ ] Body weight can be logged from dashboard widget
- [ ] Body weight trend chart shows on Stats page with 7-day moving average
- [ ] CSV export produces valid spreadsheet with one row per set
- [ ] JSON import restores workouts without duplicating existing data

### AI Coach (Phase 17)
- [ ] Rules engine: volume-by-body-part card renders on dashboard with correct set counts
- [ ] Rules engine: plateau detection flags exercises with 3+ weeks of flat weight
- [ ] Rules engine: deload suggestion appears after 4+ weeks of high-frequency training
- [ ] Rules engine: insights update after each workout completion
- [ ] AI Coach modal accessible from dashboard, More menu, and post-workout summary
- [ ] Pre-built prompt cards work ("Plan next week", "Volume check", "Break plateaus")
- [ ] Free-form question input works
- [ ] Rate limiting: second call within 24 hours shows friendly message, not error
- [ ] Past coaching sessions viewable in AI Coach modal
- [ ] Cloud Function returns structured response with recommendation text

### Social, Equipment & Ecosystem (Phases 14-19)
- [ ] Activity feed shows own and friends' workouts
- [ ] Privacy controls work (public/friends/private)
- [ ] PR celebrations post to feed
- [ ] Equipment library accessible from More menu and sidebar
- [ ] Equipment library shows location filter pills with equipment counts per gym
- [ ] Equipment list grouped by type with correct icons (Machine, Barbell, Cable, etc.)
- [ ] Equipment search filters list in real-time
- [ ] Equipment detail view shows: exercises, form videos, notes, PRs for that equipment
- [ ] Can assign one or multiple exercises to equipment from the detail view
- [ ] Can unassign an exercise from equipment (historical data preserved)
- [ ] Can reassign equipment to different exercise from detail view (Phase 7.4 flow)
- [ ] Per-exercise form videos editable from equipment detail view
- [ ] Equipment notes save with debounce
- [ ] Add equipment flow: name, type, location, optional exercise assignment
- [ ] "Scan History" discovers equipment from past workouts not yet in library
- [ ] New equipment used during workout triggers "Add to library?" prompt after workout
- [ ] Equipment auto-associated with GPS-detected location during workout
- [ ] Equipment-based plan builder suggests exercises for current location
- [ ] DEXA scan data imports and identifies lagging muscle groups
- [ ] AI Coach interprets DEXA data with training-aware context
- [ ] Community gym database searchable by location
