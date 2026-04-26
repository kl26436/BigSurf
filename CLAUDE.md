# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Big Surf Workout Tracker** is a mobile-first web application for tracking gym workouts with Firebase backend. Key features:
- Firebase authentication (Google sign-in)
- Real-time workout tracking with sets, reps, and weights
- Multiple workouts per day support (Schema v3.0)
- Equipment and location tracking per exercise
- Exercise library management with custom exercises
- Workout history with calendar view
- Template-based workout planning
- Weekly progress tracking with goals and streaks

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend**: Firebase (Firestore for data, Firebase Auth for authentication)
- **Testing**: Vitest (`npm test` to run, `npm run test:watch` for watch mode)
- **No build process**: Direct ES6 module imports in browser
- **CDN**: Firebase SDK 10.7.1, Font Awesome 6.0.0, Chart.js 4.4.1, Leaflet 1.9.4

## Application Architecture

### Core State Management

The application uses a centralized state object (`AppState`) located in [js/core/utils/app-state.js](js/core/utils/app-state.js):
- All global state lives in `AppState` object
- No external state management library
- Direct property mutation pattern
- State is exported and imported where needed

### Module Structure

The codebase is organized into functional modules under `js/core/`:

```
js/
├── main.js                     # Entry point, window exports, init
└── core/
    ├── app-initialization.js   # App startup, auth, event listeners
    ├── data/                   # Data layer
    │   ├── firebase-config.js      # Firebase SDK init
    │   ├── firebase-workout-manager.js  # Templates, exercises, equipment, locations
    │   ├── data-manager.js         # Workout save/load, export, equipment reassignment
    │   ├── data-export-import.js   # CSV export, JSON export/import
    │   ├── exercise-library.js     # Exercise database with favorites
    │   └── schema-migration.js     # v2 to v3 migration
    ├── features/               # Feature modules
    │   ├── ai-coach-ui.js          # AI Coach modal, prompt cards, history
    │   ├── body-measurements.js    # Body weight/measurements data layer
    │   ├── body-measurements-ui.js # Dashboard widget, weight chart, measurements modal
    │   ├── dexa-scan.js            # DEXA scan data import/analysis
    │   ├── dexa-scan-ui.js         # DEXA upload modal, history, detail views
    │   ├── equipment-planner.js    # Equipment-based workout planning (Phase 16)
    │   ├── exercise-progress.js    # Exercise progress charts
    │   ├── location-service.js     # GPS detection, location matching
    │   ├── location-ui.js          # Location management UI
    │   ├── manual-workout.js       # Manual workout entry
    │   ├── plate-calculator.js     # Plate breakdown algorithm + standalone page
    │   ├── pr-tracker.js           # Personal record detection
    │   ├── stats-tracker.js        # Weekly stats (delegates streaks to streak-tracker)
    │   ├── streak-tracker.js       # Canonical streak calculation
    │   ├── superset-manager.js     # Exercise grouping for supersets/circuits
    │   └── training-insights.js    # Rules engine for dashboard insights (no API)
    ├── ui/                     # UI components
    │   ├── dashboard-ui.js         # Dashboard rendering — body-part cards, recent PRs, insights
    │   ├── equipment-library-ui.js # Equipment library page
    │   ├── exercise-manager-ui.js  # Exercise library modal
    │   ├── navigation.js           # Bottom nav, routing
    │   ├── settings-ui.js          # Settings page, onboarding flow
    │   ├── stats-ui.js             # Stats page
    │   ├── sheet.js                # Bottom-sheet primitive (openSheet / awCloseSheet / closeSheetImmediate)
    │   ├── add-exercise-sheet.js   # Shared add-exercise sheet (used by active workout AND template editor — Phase 4)
    │   ├── equipment-picker.js     # Equipment picker render helper (categorized: For exercise / At gym / Other)
    │   ├── template-selection.js   # Workouts page — unified library + inline editor (Phases 1-7)
    │   ├── ui-helpers.js           # Notifications, conversions, modal helpers
    │   └── workout-history-ui.js   # History modal
    ├── utils/                  # Utilities
    │   ├── app-state.js            # Global state object
    │   ├── config.js               # Config constants, CATEGORY_ICONS/COLORS, debugLog
    │   ├── debug-utilities.js      # Debug functions
    │   ├── error-handler.js        # Error handling with severity levels
    │   └── notification-helper.js  # UI notifications
    └── workout/                # Workout logic
        ├── exercise-ui.js          # Legacy v1 exercise cards (still used by some flows)
        ├── active-workout-ui.js    # V2 wizard-style active workout + bottom sheets (awAddExercise, awOpenEquipmentSheet, openSharedAddExerciseSheet, openSharedEquipmentSheet)
        ├── rest-timer.js           # Rest timer (modal + header)
        ├── workout-core.js         # Top-level lifecycle re-exports
        ├── workout-history.js      # Calendar, history data
        ├── workout-management-ui.js # Equipment picker + create-exercise modal (template editor was retired in Phase 9; editTemplate / createNewTemplate now route to the workout-selector)
        └── workout-session.js      # Workout completion, summary modal
```

### CSS Architecture

CSS is split into modular files under `styles/`:

```
styles/
├── index.css              # @import all modules (load order matters)
├── tokens.css             # :root design tokens (colors, fonts, radius, z-index, animations)
├── reset.css              # Reset & base styles
├── components/
│   ├── cards.css          # .hero-card, .row-card base patterns
│   ├── buttons.css        # .btn-* system
│   ├── forms.css          # Inputs, selects, toggles
│   ├── modals.css         # Modal overlay, content, animations
│   ├── nav.css            # Bottom nav (5-tab), More menu (bottom sheet with grouped sections)
│   └── empty-states.css   # Empty state patterns
├── pages/
│   ├── app-shell.css      # App container, full-page overlay sections
│   ├── dashboard.css      # Dashboard widgets, streaks, PRs
│   ├── workout.css        # Active workout, exercise cards, rest timer
│   ├── templates.css      # Template selection, workout selector
│   ├── stats.css          # Stats page, progress charts
│   ├── history.css        # Calendar, workout history
│   ├── exercise-lib.css   # Exercise library, equipment editor
│   ├── settings.css       # Settings page, onboarding
│   ├── plate-calculator.css # Plate calculator page + popover
│   ├── body-measurements.css # Body weight widget, chart, measurements modal
│   ├── ai-coach.css       # AI Coach modal, prompt cards, response display
│   └── dexa.css           # DEXA scan upload, history, detail views
└── utilities.css          # .hidden, animations, responsive, misc utilities
```

### Test Structure

Tests use Vitest and re-implement pure functions for isolation (no Firebase/DOM dependencies):

```
tests/
├── fixtures/              # Mock data for tests
│   ├── mock-pr-data.js
│   └── mock-workouts.js
└── unit/                  # Unit tests (run with `npm test`)
    ├── config-values.test.js       # Config constants, category icons/colors
    ├── date-helpers.test.js        # Date parsing, formatting
    ├── display-weight.test.js      # Unit conversion with 0.5kg rounding
    ├── exercise-completion.test.js # Set completion, exercise ordering
    ├── exercise-grouping.test.js   # Superset grouping (Phase 10)
    ├── id-generation.test.js       # Workout ID generation
    ├── body-measurements.test.js   # 7-day average, unit conversion (Phase 12)
    ├── data-export.test.js         # CSV generation, JSON import validation (Phase 13)
    ├── plate-calculator.test.js    # Plate breakdown algorithm (Phase 11)
    ├── pr-detection.test.js        # PR detection logic
    ├── progress-calculations.test.js # 1RM, volume, trends
    ├── social-feed.test.js         # Feed items, privacy filtering (Phase 14 stubs)
    ├── streak-calculation.test.js  # Streak calculation
    ├── template-management.test.js # Template operations
    ├── training-insights.test.js   # Volume analysis, plateaus, deload (Phase 17)
    ├── validation.test.js          # Input validation
    ├── weekly-goal.test.js         # Goal percentage, progress ring
    ├── weight-conversion.test.js   # Weight unit conversion
    ├── workout-completion.test.js  # Completion summary stats
    └── workout-helpers.test.js     # Exercise/workout name helpers
```

### Function Exposure Pattern

Since the app uses inline `onclick` handlers in HTML, all interactive functions are assigned to the `window` object in [main.js](js/main.js):

```javascript
// Example pattern in main.js
import { startWorkout } from './core/workout/workout-core.js';
window.startWorkout = startWorkout;
```

When adding new UI functions that are called from HTML:
1. Export the function from its module
2. Import it in [main.js](js/main.js)
3. Assign it to `window` object

## Firebase Data Model

### Collections Structure (Schema v3.0)

```
users/{userId}/
  ├── workouts/{docId}         # Workout sessions (unique ID per workout)
  ├── templates/{templateId}   # Custom workout templates
  ├── exercises/{exerciseId}   # Custom exercises created by user
  ├── equipment/{equipmentId}  # Saved equipment with locations + exerciseVideos map
  ├── locations/{locationId}   # Saved gym locations with GPS
  └── preferences/
      ├── settings             # User settings (weight unit, rest timer, weekly goal, etc.)
      └── favorites            # Favorite exercises array
```

### Workout Document Structure

```javascript
{
  workoutType: "Chest – Push",           // Template name
  date: "2025-01-15",                    // YYYY-MM-DD format
  startedAt: "2025-01-15T10:30:00.000Z", // ISO timestamp
  completedAt: "2025-01-15T11:45:00.000Z", // null if incomplete
  cancelledAt: null,                     // ISO timestamp if cancelled
  totalDuration: 4500,                   // seconds
  location: "Downtown Gym",              // GPS-detected location
  exercises: {
    exercise_0: {
      name: "Bench Press",
      equipment: "Hammer Strength Flat",
      sets: [
        { reps: 10, weight: 135, originalUnit: "lbs", type: "working", completed: true },
        { reps: 8, weight: 145, originalUnit: "lbs", type: "working", completed: true }
      ],  // set.type: "working" | "warmup" | "dropset" | "failure"
      notes: "Felt strong today",
      completed: true
    }
  },
  version: "3.0",
  lastUpdated: "2025-01-15T11:45:00.000Z"
}
```

### Date Handling

**Critical**: The app has strict date handling requirements to prevent timezone bugs:
- All workout dates stored as `YYYY-MM-DD` strings (no timestamps)
- Use `AppState.getTodayDateString()` to get current date in local timezone
- Document IDs use unique format: `{date}_{timestamp}_{random}`
- Query by `date` field, not `completedAt` (which changes on edit)

## Key Development Patterns

### Weight Unit System

The app supports both lbs and kg with per-exercise unit tracking:
- `AppState.globalUnit` - Default unit for new exercises (configurable in Settings)
- `AppState.exerciseUnits` - Map of exercise index to unit preference
- All weights stored in Firestore with `originalUnit` field
- Use `displayWeight(weight, storedUnit, displayUnit)` from [ui-helpers.js](js/core/ui/ui-helpers.js) for display conversion — rounds kg to nearest 0.5
- Use `convertWeight()` for raw conversion
- History views and charts always convert to user's preferred unit via `displayWeight()`

### Equipment & Location Tracking

- Equipment can belong to multiple locations (array field)
- Location auto-detected via GPS on workout start (500m radius matching)
- Location locks after first set is logged
- Equipment auto-associated with location when first set logged

### Modal Management

All modals defined in [index.html](index.html) and managed via `openModal()`/`closeModal()` in [ui-helpers.js](js/core/ui/ui-helpers.js):
- Accepts element reference or ID string: `openModal('workout-completion-modal')`
- Handles both `<dialog>` and `<div class="modal">` elements
- Built-in focus trapping (Tab cycles within modal)
- Escape key closes modal
- Restores focus to previously focused element on close
- Z-index scale defined as CSS tokens: `--z-sticky` (10) through `--z-toast` (700) in [tokens.css](styles/tokens.css)

### Config & Magic Numbers

All hardcoded values centralized in [config.js](js/core/utils/config.js):
- `Config.ABANDONED_WORKOUT_TIMEOUT_HOURS`, `Config.DEFAULT_REST_TIMER_SECONDS`, `Config.GPS_MATCH_RADIUS_METERS`, etc.
- `CATEGORY_ICONS` and `CATEGORY_COLORS` for consistent styling across screens
- `getCategoryIcon(category)` — case-insensitive icon lookup with fallback
- `debugLog()` — console.log gated behind `?debug` URL param
- User-configurable values (rest timer, weekly goal, weight unit) load from Firestore via `loadUserSettings()` in [settings-ui.js](js/core/ui/settings-ui.js) and override Config at runtime

### Settings & User Preferences

Settings stored in Firestore: `users/{userId}/preferences/settings`
- Loaded on auth with `loadUserSettings()`, merged with `DEFAULT_SETTINGS`
- Each setting saves immediately via debounced Firestore write
- Onboarding flow runs on first login (checks `hasCompletedOnboarding` flag)

### In-Progress Workout Detection

On app load, checks for incomplete workouts:
- 3-hour timeout: Resume banner only shows for workouts < 3 hours old
- Auto-complete: Workouts > 3h with exercises done are auto-completed
- Auto-delete: Workouts > 3h with no exercises are deleted

## Common Development Tasks

### Adding a new exercise field

1. Update exercise objects in `AppState.exerciseDatabase`
2. Modify save logic in [data-manager.js](js/core/data/data-manager.js) (look at `saveWorkoutData`'s normalizedData mapping)
3. Update UI in [active-workout-ui.js](js/core/workout/active-workout-ui.js) (V2 wizard) and/or [exercise-ui.js](js/core/workout/exercise-ui.js) (legacy cards)
4. Update template-editor row in [template-selection.js](js/core/ui/template-selection.js) (`renderTemplateExerciseRow`)
5. Update manual workout form in [manual-workout.js](js/core/features/manual-workout.js)

### Adding a new top-level page / section

1. Add HTML section to [index.html](index.html) with a unique `id` ending in `-section`
2. Add the id to the `SECTION_IDS` array in [navigation.js](js/core/ui/navigation.js) (controls hide/show on `navigateTo`)
3. Add a `case` to `routeToView()` in navigation.js that un-hides the section + sets bottom-nav state
4. If using inline `onclick`, export functions from your module → import in [main.js](js/main.js) → assign to `window`

### Editing a template / creating a new workout

There is no longer a standalone template editor. Both flows route through the workout-selector:
- `editTemplate(templateId)` → calls `expandTemplateInSelector(templateId)` from template-selection.js → navigates to `workout-selector` and pre-expands the row
- `createNewTemplate()` → prompts for name → saves blank template to Firestore → expands the new row in the selector
- `saveWorkoutAsTemplate(workoutData)` → prompts for name → converts workout to template via `normalizeWorkoutToTemplate` → saves → expands

The inline editor (in `template-selection.js`) handles rename, sets/reps/weight steppers, equipment picker, notes, reorder arrows, details accordion, last-session meta. Don't reintroduce a separate editor section.

### Modifying Firebase schema

1. Update save functions in [data-manager.js](js/core/data/data-manager.js)
2. Increment `version` field in workout documents
3. Add migration logic in [schema-migration.js](js/core/data/schema-migration.js)
4. If adding a new collection or invalidation surface, also update `clearAllWorkoutsCache()` callers (workout complete, delete, etc.)

### Adding a bottom sheet

Use the shared primitive — don't reinvent.

```js
import { openSheet, awCloseSheet } from '../ui/sheet.js';
openSheet({
  title: 'Title',
  subtitle: 'optional',
  body: '<div>...</div>',
  actions: [
    { label: 'Cancel', onClick: 'awCloseSheet()' },
    { label: 'Confirm', onClick: 'myConfirmHandler()', primary: true },
  ],
});
```

For add-exercise / equipment / similar shared flows, prefer the parameterized helpers (`openSharedAddExerciseSheet`, `openSharedEquipmentSheet` in [active-workout-ui.js](js/core/workout/active-workout-ui.js)) — they take an `onSelect` callback so the same sheet works from any context.

### Touching active-workout code

Active workout is the most user-critical surface. Two safety patterns:
- When changing the equipment picker or add-exercise sheet, prefer adding a parallel `openShared*` API rather than refactoring `awOpenEquipmentSheet` / `awAddExercise` directly. Yes, this means some duplication — it's a deliberate tradeoff.
- After any change, verify: change-equipment, replace-exercise, add-exercise from menu, and complete-workout flows. The auto-save path is `debouncedSaveWorkoutData` — confirm it still fires.

## Debugging

Debug utilities in [debug-utilities.js](js/core/utils/debug-utilities.js):
```javascript
window.runAllDebugChecks()    // Comprehensive health check
window.debugWeeklyStats()     // Check weekly workout counting
window.debugFirebaseWorkoutDates()  // Workout date consistency
console.log(window.AppState)  // Full app state
```

## Code Style Guidelines

- Use ES6+ features (arrow functions, destructuring, async/await)
- All async functions use `async/await`, not raw Promises
- Use `debugLog()` from config.js instead of bare `console.log()` — only outputs with `?debug` URL param
- Keep `console.error()` with emoji prefixes (❌) for actual errors
- Error handling: try/catch with `showNotification()` for user feedback; use severity levels ('silent', 'warn', 'error')
- Comments: Explain "why", not "what"

## Design System Rules

These rules are canonical for all new CSS and JS that renders markup. When in doubt, consult [DESIGN-BACKLOG.md](DESIGN-BACKLOG.md). Rules are the output of the `design-critique-system.md` audit — follow them so drift doesn't reappear.

### Pattern rules (what to reach for)

1. **One row pattern, one card pattern.** Every list item with `[icon][title/subtitle][trailing]` uses `.row-card` (or a modifier like `.row-card--pr`). Every "section hero" card uses `.hero-card`. Don't create new `*-row` / `*-item` / `*-card-list` classes for the same shape. Canonical patterns live in [styles/components/cards.css](styles/components/cards.css).
2. **One section header pattern.** `.section-header-row` (in [components/page-header.css](styles/components/page-header.css)) is the pinned page header (back arrow + title + optional action + safe-area-inset). Don't re-implement `.stats-section-header`, `.dash-section-head`, etc. — they've been consolidated.
3. **One chip/pill pattern.** Use `.chip` / `.chip--sm` / category variants in [components/chips.css](styles/components/chips.css). Don't create `aw-sheet__chip`, `filter-pill`, `onb-chip`, etc. for the same shape.
4. **One search field.** Use `.field-search` (optional `.field-search--sticky`) from [components/fields.css](styles/components/fields.css). The `history-search-input-wrapper` / `exercise-search-wrapper` / `aw-sheet__search` patterns have all been migrated.

### Token rules (what to never hard-code)

5. **No raw color literals in page/component CSS.** `pages/*.css` and `components/*.css` (other than `tokens.css`) must use `var(--*)` for color. For tints not in tokens, add a token to [styles/tokens.css](styles/tokens.css) — don't inline the RGBA.
6. **No raw font sizes.** `font-size:` values use the `--font-2xs` / `--font-xs` / `--font-sm` / `--font-base` / `--font-md` / `--font-lg` / `--font-xl` / `--font-2xl` / `--font-3xl` scale only. Snap to nearest; don't add `0.82rem` as a one-off.
7. **No raw radii.** `border-radius:` uses `--radius-xs` / `--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-pill`. The sheet's top corners are `var(--radius-lg) var(--radius-lg) 0 0`, not `20px 20px 0 0`.
8. **No inline styles in JS.** No `style="..."` in template strings; no `element.style.*` except for truly dynamic values (width %, transform translate, SVG coordinates) — and those should use CSS custom properties (`style.setProperty('--progress', pct + '%')` referenced by `width: var(--progress)` in CSS). For static colors/spacing/layout, create a utility class in [utilities.css](styles/utilities.css) (see `.text-primary`, `.text-muted`, `.btn-block`) or a component-internal class.

### Structural rules (what to keep clean)

9. **One namespacing convention: BEM-ish (`block__element--modifier`).** Decided convention for this codebase:
   - **Block**: kebab-case, scoped with a short prefix when tied to a specific screen (`aw-pill`, `bp-card`, `dash-insight`). Visual primitives (like `.chip`, `.row-card`) go unscoped.
   - **Element**: two underscores (`aw-pill__icon`, `dash-insight-text` where the hyphen is the block separator).
   - **Modifier**: two hyphens (`hero-chip--streak`, `row-card--pr`, `js-row--done`).
   - **Legacy hyphen-only classes** (`recent-workout-item`, `workout-picker-item`) are acceptable where they exist; rename them to BEM when doing neighboring work. Don't create new hyphen-only compound classes for new code.
   - **Single-word utility classes** (`.text-primary`, `.btn-block`, `.hidden`) are fine — BEM applies to components, not utilities.
10. **No duplicate class declarations across files.** A class is defined in **exactly one** file. If you find the same selector in two files, consolidate before adding new code. Ongoing offenders are tracked in DESIGN-BACKLOG.md Phase D.

## User-Facing Copy Rules

These rules govern every string that ships to the user — page titles, button labels, placeholders, empty states, notifications, confirmation dialogs, error messages, and tooltips. Source-code identifiers (function names, class names, Firestore field names) follow code conventions and are exempt.

### 1. Sentence case, always

All user-facing strings use sentence case. This is the single rule that resolves ~80% of drift in the codebase.

**Sentence case:** `Add exercise`, `Save as template`, `Workout details`, `Continue workout`, `Choose equipment`.

**Exceptions** (only these):
- **Brand names:** `Withings`, `DEXA`, `Big Surf`, `Google`, `Firebase`.
- **Acronyms:** `PR`, `GPS`, `BW`, `AI`, `URL`.
- **Proper-noun categories** when treated as named labels rather than verbs: `Push`, `Pull`, `Legs`, `Core`, `Cardio`, `Arms`, `Shoulders`. (When the same word is a verb in a sentence, lowercase: `Add to your push day`.)
- **User-entered content:** never re-case what the user typed.

**Anti-pattern lint:** `git grep -nE '[A-Z][a-z]+ [A-Z][a-z]+'` in `js/` and `index.html` surfaces almost all violations.

### 2. Talk like a person

- Use contractions: `can't` not `cannot`, `couldn't` not `could not`, `don't` not `do not`, `it's` not `it is`.
- Drop "please" from instructions. `Pick a date` not `Please pick a date`. Politeness ≠ tone.
- Drop "successfully" from success messages. `Workout deleted` not `Workout deleted successfully` — past tense IS the success.
- Drop "Are you sure" from confirms. `Delete this workout?` is enough. Put consequences on a second line.

### 3. Action-first labels

CTAs and confirm dialogs name the action, not the question.

- ✓ `Delete 3 files?` ✗ `Are you sure?`
- ✓ `Delete workout` (button) ✗ `OK`
- ✓ `Keep workout` (button) ✗ `Cancel`
- ✓ `Save changes` ✗ `Submit`
- ✓ `Add exercise` ✗ `+`

### 4. Punctuation

- **Ellipsis:** Always `…` (single character), never `...` (three dots). Loading states, placeholders, and truncation all use the proper character.
- **Em dash:** Always `—` for separating clauses, never `-` or `--`. Hyphens stay for compound words.
- **Exclamation marks:** Use sparingly, only for genuinely exciting moments (PR celebration, streak milestone). Success toasts do not get exclamations. `Workout saved` not `Workout saved!`.

### 5. Notifications (`showNotification`)

- **Success:** Past-tense statement, no exclamation. `Workout deleted`, `Withings connected`, `${name} created`.
- **Error:** Lead with what failed in plain language, then how to recover if known. `Couldn't save — try again`. Don't surface raw error messages.
- **Warning:** State the constraint, not the rejection. `Add at least one exercise` not `Cannot save: no exercises`.
- **No "please".** Verb-first instruction. `Pick a date`, not `Please select a date`.
- **No "successfully".** Past tense IS the success.
- **One canonical phrasing per concept.** Field-required = `Add a [thing]`. Pick = `Pick a [thing]`.

### 6. Confirmation dialogs

- **Question names the action and target.** `Delete workout from April 12?` not `Are you sure?`
- **Consequence on a second line, conversational.** `This can't be undone.` not `This action cannot be undone.`
- **Buttons name the actions.** `Delete workout` / `Keep workout`, not `OK` / `Cancel`. (Until in-app modals replace native `confirm()`, write the question so the OK action is obvious.)
- **Tell the truth about consequences.** Don't say `All progress will be lost` if the data is preserved.

### 7. Empty states

Three parts, in order:
1. **What this is.** `No workouts this month`.
2. **Why it's empty.** (Often implicit; skip if obvious.)
3. **How to start.** `Complete a workout and it will show up here.`

Never just say "Nothing here" or show an icon alone.

### 8. Time and relative dates

- **Verb form for workouts:** `Last done 3 days ago`.
- **Noun form for named events:** `Last DEXA: 3 weeks ago`.
- **Dense data rows:** `Last: 10×135 · 3d ago` — colon form, abbreviated.
- **Spell out units in display copy** when ambiguous: `42 min · 18 sets`, not `42m · 18 sets`. Abbreviations OK in dense data rows where context is clear.
- **Use `Intl.RelativeTimeFormat`** when generating relative dates in code, so localization gets correct plurals.

### 9. Terminology

The user thinks "workouts." Keep "template" as a code-side concept; never expose it.

| Code term | User-facing term |
|---|---|
| `template`, `workoutTemplate` | `workout` |
| `Workout Library` | `your workouts` |
| `superset group A/B/C` | `Superset A` |
| `defaultReps`, `defaultSets` | `Default reps`, `Default sets` |

### 10. Aria and accessibility copy

- **Every icon-only button needs `aria-label`.** Sentence case. `aria-label="Move up"`, not `aria-label="up"`.
- **Status pills** need `aria-label="Completed"` / `"Cancelled"` / `"Incomplete"`.
- **Live-region announcements** for autosave / reorder / delete with undo: `aria-live="polite"`, message form `${item} ${action}.`. Example: `Cable Fly removed.`

### 11. Lint pass before merging UI changes

Quick searches that catch most regressions:

```bash
# Title-case violations in source strings
grep -nE '[A-Z][a-z]+ [A-Z][a-z]+' index.html js/ | grep -v 'class=\|id=\|//\|test\|spec'

# "Please" in user-facing strings
grep -rn "Please " js/ index.html

# Three-dot ellipsis
grep -rn '\.\.\.' js/ index.html | grep -v '//\|spread'

# "Are you sure" anti-pattern
grep -rn 'Are you sure' js/

# "successfully" filler
grep -rn 'successfully' js/

# "cannot" instead of "can't"
grep -rn 'cannot' js/ | grep -v '//'
```

Address violations in the PR that introduces them; don't let them accumulate.

## Important Notes

- **No bundler/transpiler**: All code must be ES6 module compatible
- **Firebase SDK version**: Locked to 10.7.1
- **CSS uses native @import**: `styles/index.css` imports modular files — no CSS bundler needed
- **Authentication required**: Most features require signed-in user
- **Local storage not used**: All state in memory or Firebase
- **Mobile-first**: UI designed for phone use at the gym
- **Modal-based UI**: Features use integrated modals, not separate pages
- **Firebase operations use retry**: `withRetry()` in data-manager.js wraps critical saves with exponential backoff
- **Exercise history cached**: `getLastSessionDefaults()` uses session-level Map cache; cleared on workout start/complete

## Key Technical Patterns

1. **Deep Clone for Templates**: Use `JSON.parse(JSON.stringify())` to prevent template mutation
2. **Cross-Module Callbacks**: Use `window` flags for modal communication
3. **Query by Date Field**: Use `date` not `completedAt` for workout queries (edited workouts update `completedAt`)
4. **Unique Day Counting**: Use Set to count workout days, not total workouts
5. **SVG Progress Rings**: stroke-dasharray/offset for circular progress indicators
6. **Form Video Resolution**: 3-tier priority: equipment-specific video > equipment general > exercise default > null (see `resolveFormVideo()` in exercise-ui.js)
7. **Equipment Reassignment**: Batch updates across workouts + templates when moving equipment to a different exercise (see `reassignEquipment()` in data-manager.js)
8. **Streak Delegation**: `stats-tracker.js` delegates to `streak-tracker.js` as canonical implementation — don't reimplement streak logic

## Roadmap & Implementation Status

See [ROADMAP.md](ROADMAP.md) for the historical overhaul plan. Status:
- **Sprints 1-7 (Phases 0-13, 15-18)**: Complete
- **Phase 14 (Social features)**: Intentionally on hold
- **Phase 19 (Community gym DB)**: Intentionally on hold

### Library/editor consolidation overhaul (2026-04, see [docs/implementation-plan.md](docs/implementation-plan.md))

All shipped:
- **Phase 0** — keyboard fix: `interactive-widget=resizes-content` viewport meta + global focusin handler + vh→dvh sweep on sheets/modals
- **Phase 1** — workout-management-section retired; navigation routes 'templates'/'workout-management' to `workout-selector`
- **Phase 2** — inline rename in expanded selector row (title becomes editable input)
- **Phase 3** — `.te-row` rich exercise rows: ↑/↓ reorder arrows, category-tinted icon, inline sets/reps/weight steppers, equipment pill, notes textarea, × remove
- **Phase 4** — shared add-exercise sheet via `openSharedAddExerciseSheet({onSelect, onCreateRequested, alreadyAdded})` in active-workout-ui.js
- **Phase 5** — `showCreateExerciseForm`'s "Choose equipment" wired to `openSharedEquipmentSheet`; closes parent dialog before opening sheet (top-layer issue)
- **Phase 6** — Details accordion at top of expanded row: category chips + day chips with auto-derived "Usually Tue, Fri" from cachedWorkoutHistory
- **Phase 7** — last-session meta (`Last: 10×135 · 8×135 · 3d ago`) async-hydrated under each `.te-row__meta`
- **Phase 9** — deleted `#workout-management-section` + `#template-editor-section` HTML; trimmed workout-management-ui.js from ~2200 → ~1070 lines

### Performance work (2026-04)

- `loadAllWorkouts` has a 5-min TTL cache (module-private) keyed by uid. Invalidate via `clearAllWorkoutsCache()` from data-manager.js — wired into `completeWorkout` (workout-session.js) and `deleteWorkout` (workout-history.js).
- `aggregateBodyPartStats` is memoized via WeakMap keyed by the workouts array reference. Dashboard's training section calls it 6× with the same workouts arg → 5/6 calls are cache hits.
- The cache identity-stable contract: as long as `loadAllWorkouts` returns the same array reference, downstream memoization survives. When the cache TTL expires or invalidation fires, fresh array → WeakMap loses key → memos auto-clear.

### Ongoing tech-debt notes

- ESLint config has browser globals enabled now (Phase 9 cleanup); `npm run lint` reports 0 errors, ~127 warnings (mostly `no-unused-vars` on minor locals — non-blocking).
- workout-history.js's calendar uses in-memory month iteration over currentHistory (~1ms for 1000 workouts; not a real bottleneck).
- Recent workouts list in history is paginated but not virtual-scrolled. Becomes DOM-stress past ~500 visible items.
- `firebase-workout-manager.js#getUserWorkouts` uses `getDocsFromServer` deliberately (delete consistency); has its own un-shared cost.
