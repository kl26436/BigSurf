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
- **CDN**: Firebase SDK 10.7.1, Font Awesome 6.0.0, Chart.js 4.4.1 (used ONLY by the body-weight chart in body-measurements-ui.js — all other charts are hand-rolled inline SVG in `js/core/features/charts/`), Leaflet 1.9.4

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
    │   ├── session-cache.js        # PF-2: makeSessionCache() — TTL + single-flight + generation guard for repeated reads
    │   ├── server-sync.js          # TP-6 j: listens to users/{uid}/meta/sync; refreshAfterServerWrite() after coach / Sunday-roll writes
    │   ├── data-export-import.js   # CSV export, JSON export/import
    │   ├── exercise-library.js     # Exercise database with favorites
    │   ├── equipment-catalog.js    # Equipment catalog seed data
    │   ├── equipment-catalog-firestore.js  # Catalog Firestore reads/writes
    │   ├── equipment-catalog-helpers.js    # Catalog lookup/normalization helpers
    │   ├── catalog-search.js       # Pure catalog free-text search + type inference (equipment pickers)
    │   ├── equipment-create.js     # AP-12: pure create planner — dedupe (exact vs similar), brand parse, type, unit, base weight
    │   ├── equipment-migration.js  # Legacy equipment → catalog migration
    │   ├── equipment-id-resolver.js    # Equipment name → stable doc id (exact/alias/fuzzy + confidence gate)
    │   ├── equipment-id-migration.js   # Pure planners: equipmentId backfill + PR re-key (field-wise merge)
    │   ├── equipment-id-migration-runner.js # ?debug console runner for the id backfills (dry-run default)
    │   ├── location-id-resolver.js     # Gym name → stable location doc id (exact; ambiguous/orphan aware)
    │   ├── location-id-migration.js    # Pure planners: locationIds[] backfill + orphan-gym detection
    │   └── schema-migration.js     # v2 to v3 migration
    ├── features/               # Feature modules
    │   ├── ai-coach-ui.js          # AI Coach modal, prompt cards, history
    │   ├── block-view.js           # AP-24: pure Block page model (week × day cells, targets via progressionTarget)
    │   ├── body-measurements.js    # Body weight/measurements data layer
    │   ├── body-measurements-ui.js # Weight entry page, Chart.js weight chart (the ONLY Chart.js usage)
    │   ├── bodyweight-prompt.js    # Prompt for bodyweight on BW exercises
    │   ├── charts/                 # Hand-rolled inline-SVG chart primitives (no library)
    │   │   ├── chart-line.js           # Line chart w/ optional goal line + gradient fill
    │   │   ├── chart-sparkline.js      # Mini line for metric cards
    │   │   ├── chart-combo-bars-line.js # Bars + line overlay for drill-down pages
    │   │   ├── chart-donut.js          # Multi-arc donut for body composition
    │   │   └── chart-area-stacked.js   # Stacked area, body-part volume over time
    │   ├── metrics/                # Aggregation layer for dashboard/drill-downs
    │   │   ├── aggregators.js          # Pure functions: volume, 1RM, body-part stats, hero lift
    │   │   ├── metric-card-base.js     # Shared render template for tappable metric cards
    │   │   └── range-filter.js         # Shared time-range state (W/M/3M/Y/All)
    │   ├── dexa-scan.js            # DEXA scan data import/analysis
    │   ├── dexa-scan-ui.js         # DEXA upload page, history, detail views
    │   ├── equipment-planner.js    # Equipment-based workout planning (Phase 16)
    │   ├── first-use-tips.js       # One-time feature tips
    │   ├── geocoding.js            # Reverse geocoding for locations
    │   ├── gym-session-context.js  # Session gym context (current-gym state helpers)
    │   ├── location-service.js     # GPS detection, location matching
    │   ├── location-ui.js          # Location management UI
    │   ├── machine-exercise-matcher.js # Machine → exercise fuzzy matcher
    │   ├── exercise-machine-matcher.js # Exercise → machine fuzzy matcher
    │   ├── manual-workout.js       # Manual workout entry
    │   ├── plate-calculator.js     # Plate breakdown algorithm + standalone page
    │   ├── pr-tracker.js           # Personal record detection (segmented per exercise+equipment)
    │   ├── progress-scoreboard.js  # AP-21: rolling 4-wk e1RM per main lift, rep PRs, pattern coverage (dashboard card + coach + weekly review)
    │   ├── coach-rules.js          # AP-16: computeVerdicts/formatVerdictsContext — the rules' answers handed to the coach as facts
    │   ├── coach-context-builder.js # AP-20c: PURE chat-context builder (buildChatContext) — ai-coach-ui + the eval build the same block
    │   ├── coach-live-context.js   # AP-20c: PURE live-workout snapshot (buildLiveWorkoutContext; re-exported by coach-live.js)
    │   ├── coach-guards.js         # AP-17/18: what the coach's write tools enforce (deload lock, stall/loadability, equipment, dedupe, program shape)
    │   ├── fuzzy-match.js          # Dice similarity (catalog/exercise/equipment matching) — mirrored for the coach's equipment check
    │   ├── plain-language.js       # TP-0: the user's words — TERMS, findJargon/BANNED_UI_TERMS, formatters (effort, week kind, stuck, volume) — mirrored
    │   ├── body-stats.js           # TP-1: 7-day bodyweight average (outlier-guarded), scan lean mass / body fat — mirrored
    │   ├── goal-progress.js        # TP-1: goal validation, baseline from the data, rate math, status + sentence, formatGoalsContext — mirrored
    │   ├── goals.js                # TP-1: goals/events Firestore data layer (createGoal captures the baseline)
    │   ├── report-card.js          # TP-2: reportWeek (local Mon–Sun), buildReportCard, options, reply parse — mirrored
    │   ├── plan-timeline.js        # TP-3: buildPlanTimeline (past/current/planned/projected weeks, events, markers), formatPlanContext — mirrored
    │   ├── plan-roller.js          # TP-3: rollWindow (is the next wave due?), draftNextWave (code-built), rollUndoable — mirrored
    │   ├── plan.js                 # TP-3: plan/current data layer; enable, apply waiting swaps, undo a roll
    │   ├── plan-sessions.js        # TP-4: plan-owned sessions — list split, this week's sessions, save-a-copy, archive rule — mirrored
    │   ├── training-rules.js       # Pure volume/deload rules + RULE_THRESHOLDS (Config spreads them); training-insights wraps these
    │   ├── progression.js          # Pure double-progression + stall ladder; takes the session intent (deload never bumps)
    │   ├── session-intent.js       # getSessionIntent(): deload / peak / build for TODAY (program week > manual > legacy label); stamped on savedData.sessionIntent at start/resume
    │   ├── stats-tracker.js        # Weekly stats (delegates streaks to streak-tracker)
    │   ├── streak-tracker.js       # Canonical streak calculation
    │   ├── superset-manager.js     # Exercise grouping for supersets/circuits
    │   ├── training-insights.js    # Rules engine for dashboard insights (no API)
    │   └── withings-integration.js # Withings OAuth + weight sync
    ├── ui/                     # UI components
    │   ├── block-ui.js             # TP-3: the Plan page (#block-section, route 'plan', alias 'block') — one continuous timeline;
    │   │                           #   TP-6: Plan settings sheet (gear), Rotate sheet (rules-only swaps + undo)
    │   ├── goals-ui.js             # TP-1: Goals page (#goals-section, route 'goals') + add-goal / add-date sheets
    │   ├── report-card-ui.js       # TP-2: Sunday report card page (#reportcard-section, route 'reportcard'), recompute on open, one-tap option
    │   ├── dashboard-ui.js         # Dashboard render + renderProgressPage (#progress-section)
    │   ├── muscle-group-detail-ui.js # Level-2 drill-down from dashboard body-part cards
    │   ├── exercise-detail-ui.js   # Level-3 drill-down from muscle-group exercise list
    │   ├── metric-detail-ui.js     # Drill-down for tappable metric cards (body weight, volume, strength)
    │   ├── composition-detail-ui.js # Drill-down from composition card
    │   ├── equipment-library-ui.js # Equipment library (My gyms / Library / Catalog tabs) + equipment detail
    │   ├── equipment-quick-edit.js # Quick-edit bottom sheet (name/brand/line/function, exercise + gym chips)
    │   ├── exercise-manager-ui.js  # Exercise library modal
    │   ├── error-log-ui.js         # Error log page (More menu)
    │   ├── navigation.js           # Bottom nav, routing, navStack (10 deep), enterSection, system-back guard wiring
    │   ├── back-guard.js           # SH-6: one history entry so Android back / iOS edge swipe does an in-app back
    │   ├── settings-ui.js          # Settings page, onboarding flow, profile detail
    │   ├── confirm-sheet.js        # confirmSheet()/promptSheet() — promise-based replacement for native confirm/prompt
    │   ├── busy.js                 # once(key, fn, {button, label}) — THE double-tap guard for any handler that writes
    │   ├── sheet.js                # openSheet() — THE bottom-sheet primitive; every sheet uses it (SH-3)
    │   ├── page-lock.js            # SH-2a: page scroll lock DERIVED from what's open (OVERLAY_SELECTOR) + explicit lockPage() holds
    │   ├── template-selection.js   # Workouts page — library + dedicated editor page (#workout-editor-section)
    │   ├── ui-helpers.js           # Notifications, conversions, modal helpers
    │   └── workout-history-ui.js   # History modal
    ├── utils/                  # Utilities
    │   ├── app-state.js            # Global state object
    │   ├── config.js               # Config constants, CATEGORY_ICONS/COLORS, debugLog
    │   ├── date-helpers.js         # Date parsing/formatting, getDayName()
    │   ├── equipment-name.js       # composeEquipmentName() — the SINGLE brand/line/function → name composer
    │   ├── debug-utilities.js      # Debug functions
    │   ├── shell-hud.js            # SH-0: ?debug viewport/keyboard/safe-area/lock HUD + shell_snapshot (lazy, debug only)
    │   ├── error-handler.js        # Error handling with severity levels
    │   ├── haptics.js              # Haptic feedback wrapper
    │   ├── capacitor-push.js       # Capacitor push bridge
    │   ├── push-notification-manager.js # Push notification scheduling
    │   ├── rest-display-manager.js # Rest timer display state
    │   ├── template-helpers.js     # Template normalization helpers
    │   ├── validation.js           # Input validation
    │   ├── weight-calculations.js  # Weight/1RM math helpers
    │   ├── workout-helpers.js      # Exercise/workout name helpers
    │   └── notification-helper.js  # UI notifications
    └── workout/                # Workout logic
        ├── exercise-ui.js          # Legacy v1 exercise cards (still used by some flows)
        ├── active-workout-ui.js    # V2 wizard-style active workout + bottom sheets (awAddExercise, awOpenEquipmentSheet, openSharedAddExerciseSheet, openSharedEquipmentSheet)
        ├── edit-history-inline.js  # Inline editing of historical workouts
        ├── rest-timer.js           # Rest timer (modal + header)
        ├── set-seeding.js          # Pure prefill rules: mergeSeededSets, seedSetsFromLastSession (bump/back-off/deload), same-machine check
        ├── workout-core.js         # Top-level lifecycle re-exports
        ├── workout-history.js      # Calendar, history data
        ├── workout-management-ui.js # Exercise-library → add-to-workout + create-exercise modal (template editor retired in Phase 9; the legacy equipment-picker modal retired in AP-13 — every equipment pick is openSharedEquipmentSheet / awOpenEquipmentSheet)
        └── workout-session.js      # Workout completion, summary modal
```

### Stats / drill-down architecture (Dashboard V2)

There is no Stats tab — `stats-ui.js`, `exercise-progress.js`, and `styles/pages/stats.css` were **deleted** in the Dashboard V2 rewrite (the bottom-nav slot became AI Coach). Stats live in a 3-level drill-down instead:

1. **Dashboard** (`dashboard-ui.js`) — body-part cards, metric chips, composition → tap through to
2. **Muscle group detail** (`muscle-group-detail-ui.js`) → tap an exercise to
3. **Exercise detail** (`exercise-detail-ui.js`)

Plus `metric-detail-ui.js` / `composition-detail-ui.js` for metric-card drill-downs and `renderProgressPage()` (in dashboard-ui.js, `#progress-section`) as a consolidated view. All math comes from `js/core/features/metrics/aggregators.js`; all charts are the SVG primitives in `js/core/features/charts/` — NOT Chart.js (only the body-weight chart in body-measurements-ui.js uses Chart.js). Back navigation uses the navStack in navigation.js.

### CSS Architecture

CSS is split into modular files under `styles/`:

```
styles/
├── index.css              # @import all modules (load order matters)
├── tokens.css             # :root design tokens (colors, fonts, radius, z-index, animations)
├── reset.css              # Reset & base styles
├── components/            # See styles/components/README.md for "when you need X, use Y"
│   ├── cards.css          # .hero-card, .row-card base patterns
│   ├── buttons.css        # .btn-* system
│   ├── chips.css          # .chip / .chip--sm / category variants
│   ├── fields.css         # .field-search, .field-label, form fields
│   ├── forms.css          # Inputs, selects, toggles
│   ├── modals.css         # Modal overlay, content, animations
│   ├── nav.css            # Bottom nav (5-tab), More menu (bottom sheet with grouped sections)
│   ├── page-header.css    # .section-header-row, .page-header__*, .sec-head
│   ├── empty-states.css   # Empty state patterns
│   ├── charts.css         # Chart container/legend chrome for the SVG chart primitives
│   ├── metric-card.css    # Tappable dashboard metric cards
│   ├── range-filter.css   # W/M/3M/Y/All range pills
│   ├── segmented-control.css # Segmented toggles
│   ├── grouped-rows.css   # Settings-style grouped row lists
│   ├── gym-card.css       # Gym cards, stat grid/tag row (also used on equipment detail)
│   ├── library-tabs.css   # Equipment library compact tabs
│   ├── completion-summary.css # Workout completion modal
│   ├── confirm-sheet.css  # confirmSheet()/promptSheet() bottom sheets
│   ├── sheet.css          # openSheet() primitive (SH-2b)
│   ├── shell-hud.css      # ?debug shell HUD (SH-0)
│   ├── quick-add-sheet.css # Quick-add bottom sheet
│   ├── active-pill.css    # Floating workout-in-progress pill
│   ├── bodyweight.css     # BW banner + base-weight rows
│   └── toast.css          # Toast notifications
├── pages/
│   ├── app-shell.css      # App container, full-page overlay sections
│   ├── dashboard-v2.css   # Dashboard widgets, hero chips, body-part cards, PRs
│   ├── block.css          # Block page (AP-24)
│   ├── goals.css          # Goals page (TP-1)
│   ├── report-card.css    # Report card page (TP-2)
│   ├── detail-pages.css   # Muscle-group / exercise / progress drill-down pages
│   ├── metric-detail.css  # Metric-card drill-down pages
│   ├── active-workout-v2.css # Active workout, set rows, rest timer, sheet body content (chrome is sheet.css)
│   ├── templates.css      # Template selection, workout selector, inline editor (.te-row)
│   ├── history.css        # Calendar, workout history
│   ├── edit-history.css   # Historical workout inline editing
│   ├── exercise-lib.css   # Exercise library
│   ├── equipment-library.css # Equipment library + equipment detail
│   ├── locations.css      # Location management + detail
│   ├── settings.css       # Settings page, onboarding, profile
│   ├── manual-workout.css # Manual workout entry
│   ├── plate-calculator.css # Plate calculator page + popover
│   ├── body-measurements.css # Body weight entry page, chart, measurements
│   ├── ai-coach.css       # AI Coach chat, prompt cards
│   ├── dexa.css           # DEXA scan upload, history, detail views
│   └── error-log.css      # Error log page
└── utilities.css          # .hidden, animations, responsive, misc utilities
```

(`dashboard.css`, `workout.css`, and `stats.css` no longer exist — deleted during the V2 cleanups. Don't recreate them.)

### Test Structure

Tests use Vitest and IMPORT THE REAL SOURCE MODULES — do not re-implement logic in tests. Conventions (2026-07 conversion):
- Pure modules (config.js, streak-tracker, training-insights, ui-helpers math) import directly.
- Modules whose import graph pulls Firebase use `vi.mock('../../js/core/data/firebase-config.js', ...)` backed by the shared in-memory factory in [tests/fixtures/firestore-mock.js](tests/fixtures/firestore-mock.js) (supports doc/collection/getDocs/setDoc/query/where/orderBy). Mock `ui-helpers.js` when the graph touches the DOM at import time.
- Server code (`functions/*.js`) gets [tests/fixtures/admin-db-mock.js](tests/fixtures/admin-db-mock.js) — an Admin-SDK fake (set/merge, where `== != >= <= > < in`, orderBy, limit, `snap.ref`) that records every write in `db.writes`.
- Coach executors return errors via `asToolError` / `toolError` only — `{error:{code, message, hint?}}`, never a bare string (tested).
- DOM tests opt into jsdom per file with a first-line `// @vitest-environment jsdom` (see page-lock / sheet tests); the default environment stays node.
- A few tests still mirror logic that only exists inline in render functions (or in deliberately-unexported active-workout functions). Those carry a `// MIRRORS: <file>#<function> (lines N-M)` header — keep them in sync when touching the source, or better, extract+export the function and convert the test.
- Adding `export` to an existing internal function purely for testability is allowed (zero runtime impact — nothing in the app imports it).
- [window-wiring.test.js](tests/unit/window-wiring.test.js) statically verifies every inline `onclick` handler (index.html + JS template strings) resolves to a `window.*` assignment — it will fail your PR if you render a handler without wiring it.
- `npm run test:coverage` reports real coverage over js/core/** (baseline 2026-07: ~5% statements — UI render code dominates the denominator; data/feature modules are the tested surface).

```
tests/
├── fixtures/              # Mock data (mock-pr-data.js, mock-workouts.js, firestore-mock.js)
└── unit/                  # 40+ Vitest files (run with `npm test`) — one per module/concern.
                           # Don't trust any hardcoded list here; `ls tests/unit` is the truth.
                           # Highlights beyond the obvious 1:1 module tests:
                           #   pr-detection.test.js            — PR logic incl. id-aware equipment keys
                           #   equipment-id-{resolution,migration}.test.js — 8b migration planners
                           #   location-id-migration.test.js   — locationIds backfill planners
                           #   equipment-name.test.js          — composeEquipmentName
                           #   window-wiring.test.js           — every rendered onclick resolves to window.*
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

Exception: handlers referenced only from a module's OWN template strings should be window-assigned at the bottom of that module instead (`window.myHandler = myHandler;`) — prod caches JS for a year, and a same-file assignment can't be version-skewed away from its template the way main.js wiring can. Either way, [window-wiring.test.js](tests/unit/window-wiring.test.js) fails if a rendered handler resolves to nothing.

## Firebase Data Model

### Collections Structure (Schema v3.0)

```
users/{userId}/
  ├── workouts/{docId}         # Workout sessions (unique ID per workout)
  ├── workoutTemplates/{templateId} # Custom workout templates (NOT "templates")
  ├── customExercises/{id}     # Custom exercises created by user
  ├── exerciseOverrides/{id}   # Per-user edits to global-library exercises
  ├── hiddenExercises/{id}     # Global-library exercises the user hid
  ├── equipment/{equipmentId}  # Saved equipment: locations[] (gym names) + locationIds[]
  │                            #   (stable location ids, dual-written) + exerciseVideos map
  ├── locations/{locationId}   # Saved gym locations with GPS (id = location_<ts>_<rand>)
  ├── stats/
  │   └── personalRecords      # PR store: exercisePRs keyed exercise → equipment KEY
  │                            #   (mixed: equipment doc id OR legacy name; entries carry
  │                            #   denormalized equipmentName — see pr-tracker.js)
  ├── goals/{id}               # TP-1: type/metric/key/target/unit/direction/by/eventId/status + baseline {value,date}
  │                            #   (measured at creation, never typed) — goal-progress.js#normalizeGoal is the shape
  ├── events/{id}              # TP-1: name, date, kind (look|perform|other), peakWeeks, lighterBefore
  ├── reportCards/{weekKey}    # TP-2: weekKey = the covered week's Monday; { card, narrative, chosenOption, applied }
  ├── meta/sync                # TP-6 j: { serverWriteAt, serverWriteBy } — stamped after any server write the phone must re-read
  ├── plan/current             # TP-3: cadence {buildWeeks, lighterWeek}, horizonWeeks, sessionMinutes, rotationPolicy
  │                            #   ('ask'|'auto'), paused, name — NOT the split (that stays in preferences/weekPlan)
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
      equipmentId: "equipment_1765..._abc",  // stable equipment doc id — dual-written at save
                                             // (confident matches only; may be absent — name is the fallback)
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
- Location stays editable all workout; the first-set stamp only gates the once-per-workout equipment↔gym auto-association
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

Phase 3b (2026-07): the editor lives on its **own page** (`#workout-editor-section`), not inline in the list. The workout-selector list is read-first — tapping a row opens the editor page. All flows route through `showWorkoutEditor(templateId)` (template-selection.js), which sets `activeEditorTemplateId` and `navigateTo('workout-editor')`; `renderActiveWorkoutEditor()` is self-sufficient (loads gym context + history + rebuilds `loadedTemplates`).
- `editTemplate(templateId)` → `expandTemplateInSelector(templateId)` → `showWorkoutEditor(templateId)` (opens the editor page)
- `createNewTemplate()` → prompts for name → saves blank template to Firestore → refreshes `AppState.workoutPlans` → opens the editor page on the new id
- `saveWorkoutAsTemplate(workoutData)` → prompts for name → converts via `normalizeWorkoutToTemplate` → saves → opens the editor page

The editor page (in `template-selection.js`: `renderWorkoutEditorPage`) reuses the same machinery as before — rename, sets/reps/weight steppers, equipment picker, notes, reorder arrows, day/category chips, last-session meta, `schedulePendingTemplateEdit` autosave. Only the container moved; edit handlers re-render via `refreshEditorOrList()` (editor page if open, else the list). The old inline-accordion path (`.template-editor`, `renderTemplateDetailsAccordion`, `detailsOpenForTemplate`, `expandedTemplateId`) was removed. Back button = `closeWorkoutEditor()` (flushes pending edits, then `navigateBack`). Don't reintroduce inline-in-list expansion.

### Modifying Firebase schema

1. Update save functions in [data-manager.js](js/core/data/data-manager.js)
2. Increment `version` field in workout documents
3. Add migration logic in [schema-migration.js](js/core/data/schema-migration.js)
4. If adding a new collection or invalidation surface, also update `clearAllWorkoutsCache()` callers (workout complete, delete, etc.)

### Adding a bottom sheet

**Every sheet uses the primitive** (SH-3 migrated them all, 2026-10; the legacy `aw-sheet` chrome is deleted — don't rebuild it): `openSheet({ id, title | titleHTML, titleColor, subtitle, bodyHTML, footerHTML | actions, search, size, dismissible, onClose, className, bodyId, bodyClass, keepFooter })` from [sheet.js](js/core/ui/sheet.js) → `{ el, body, search, close, setBody, setFooter }`; also `closeSheet(id)`, `sheetById(id)`. It owns keyboard inset, safe areas, the pinned search field, page lock, `inert` behind, focus, Escape, swipe-down, stacking, the open-time backdrop guard (iOS phantom click) and the system-back step — don't re-implement any of those.

```js
openSheet({
    id: 'my-sheet',
    title: 'Which gym?',                      // escaped; titleHTML for markup
    bodyHTML: rows,                           // list rows use the .js-row pattern
    actions: [                                // labels are HTML — escape user text
        { label: 'Close', onClick: 'closeMySheet()' },
        { label: 'Save gym', onClick: 'saveMySheet()', primary: true },
    ],
    onClose: () => { /* runs once on EVERY dismissal — put the outcome/cleanup here */ },
});
```

- Re-opening the same `id` replaces the sheet in place (silently — no `onClose`), so re-render by calling `openSheet` again or `setBody`. (Until 2026-10-26 that path leaked `inert`: after the last close the whole app ignored taps until a reload — sheet.test.js now covers it; don't hand-roll `inert` anywhere else.)
- Footer labels name the action (`Close`, `Keep current`, `Start workout`), never `Cancel`; dismiss buttons stay neutral (no `danger`).
- `navigateTo()` closes every open sheet (`closeAllSheets`), firing each `onClose`.
- The page lock ([page-lock.js](js/core/ui/page-lock.js)) is derived from the DOM: a new overlay root that isn't a `.sheet`/`dialog` must be added to its `OVERLAY_SELECTOR`, and never write `body.style.overflow`.

**Pages, not sheets:** show a full-page section with `navigateTo(view)`; a flow that paints a page itself and must keep its sheets open uses `enterSection(view)` (navigation.js) so the back stack and the system-back guard see it. Backs call `navigateBack()` — never a fixed destination, never a direct `.hidden` toggle on a `SECTION_IDS` section.

For add-exercise / equipment / similar shared flows, prefer the parameterized helpers (`openSharedAddExerciseSheet`, `openSharedEquipmentSheet` in [active-workout-ui.js](js/core/workout/active-workout-ui.js)) — they take an `onSelect` callback so the same sheet works from any context.

### Handlers that write: one run per tap

Writes are local-first and can take up to 5 s to resolve on bad signal (`commitWrite`), so a second tap during the wait runs the handler again — that's how the Goals page added a goal twice. Any handler that writes (save, create, add, apply, delete) runs through `once(key, fn, { button, label: 'Saving…' })` from [busy.js](js/core/ui/busy.js): re-entry while `key` runs is ignored, the button is disabled and says what's happening, and it's restored even on error. After a save, repaint from the state you already hold instead of reloading every collection. Older handlers with ad-hoc flags (`inFlight`, `saving`, `btn.disabled`) migrate to it as they're touched — queue row 14.

### Server writes the phone must see (TP-6 j)

The coach's tools and the Sunday roll write through the Admin SDK, so the phone's cached workouts / week plan / program don't know. Any new server-side write path the user should see must stamp `users/{uid}/meta/sync` (`serverWriteAt`, `serverWriteBy`); the client's `server-sync.js` re-reads. A client re-read after a server write uses `refreshAfterServerWrite()` — never a bare `getUserWorkoutTemplates()` (a cache fallback there is the stale copy; `lastTemplatesFromServer` / `AppState._templatesStale` track it).

**Home and the Plan page read one header (TP-6 c).** Home's plan line is `planSummaryLine(buildPlanTimeline(...).header)` over `loadPlanSummary()` (plan.js, session-cached; `clearPlanCache()` after any plan write). Never render "week N of M" — say the week's kind.

**Swaps are written, not described (TP-6 f/l).** A plan's "what's new" must match the workouts: `create_program` applies `swaps` + `rationale.changed` via `resolveSwaps`; the rotation engine never proposes what a slot just moved off (`rotatedOutOf`, `ROTATION_MEMORY_DAYS`).

### Mirrored rule modules (client ↔ functions/)

Server-only (not mirrored): `functions/coach-routing.js` — model routing per turn + `coachTraces` doc builder (top-level collection, admin-only read); `functions/coach-prompts.js` — system prompts, model per tier, `buildModeRequest`; `functions/coach-loop.js` — `runCoachToolLoop`, THE tool loop (coachChatStream and the AP-20 eval both call it — change the loop there, never inline). `functions/weekly-review.js` — `buildWeeklyReviewRequest` (the review's prompt + data; index.js only sends/saves/pushes). `functions/plan-roll.js` — `loadPlanData` / `rollPlanForUser` (the Sunday job rolls the next wave before the card; the plan tools read the same load). `functions/report-card-request.js` — `buildReportCardRequest` / `reportCardDoc` (the Sunday card's data load + the one cheap model turn; index.js `sundayReportCard` / `requestReportCard` send, save, push).

`functions/` deploys standalone and can't import `js/`, so pure rule modules are COPIED: session-intent, progression, training-rules, progress-scoreboard, coach-rules, coach-guards, fuzzy-match, coach-outcomes, week-targets, movement-patterns, exercise-rotation, plain-language, body-stats, goal-progress, report-card, block-view, plan-timeline, plan-roller, plan-sessions. Edit the client file, then `node scripts/sync-mirror.mjs js/core/features/<m>.js functions/<m>.js`; `movement-patterns-mirror.test.js` fails on drift. A mirrored module may import ONLY other mirrored siblings (`import { a } from './x.js'`) — never ui-helpers, Config, AppState or Firebase.

### Touching active-workout code

Active workout is the most user-critical surface. Two safety patterns:
- When changing the equipment picker or add-exercise sheet, prefer adding a parallel `openShared*` API rather than refactoring `awOpenEquipmentSheet` / `awAddExercise` directly. Yes, this means some duplication — it's a deliberate tradeoff.
- Every equipment doc is written by `FirebaseWorkoutManager#getOrCreateEquipment` (pass `knownEquipment` = the warm cache); typed names go through `planInlineEquipment` first. Don't add a create path that calls `saveEquipment` directly.
- After any change, verify: change-equipment, replace-exercise, add-exercise from menu, and complete-workout flows. The auto-save path is `debouncedSaveWorkoutData` — confirm it still fires.
- Render pads blank rows before autofill lands. Any path that changes what an exercise slot IS (exercise, equipment, intent) must call `loadAutofillForExercise(idx, { reseed: true, trigger })` so untouched rows refill (`mergeSeededSets`); start/resume use fill-only-if-blank so program adjustments aren't undone. Every autofill emits a quiet `autofill_trace` (Error Log page, session-only); `?debug` adds an overlay line on the last-session card and an `autofill_mismatch` warning when untouched rows don't match the card.
- **One lift on two machines is two series** (AU-12): pass `{ machine: { name, id } }` to `buildExerciseSessions` / scoreboard series; "same machine" is `progression.js#sameMachine` (id, then `machineKey` name) — never write another definition.
- **Light sessions** (AU-10): `isRecoveryWorkout` reads label, intent and notes (`workoutNotes` or 2+ exercise notes); `buildExerciseSessions` also skips a noted session under 85 % of the lift's 4-week best, and an un-noted dip under 75 % that is followed within 14 days by a return to ≥ 90 %. Skips are on `sessions.lightSkipped`.
- **`progressionTarget(…, intent, today)`** (AU-11): pass `today` (stale → `reacquaint`); every action is in `PROGRESSION_ACTIONS` — a new action must be handled by every consumer (the characterization test in progression-crosscheck.test.js enforces it).
- Today's deload/peak/build lives on `savedData.sessionIntent` (session-intent.js). A week override (`settings.weekOverride`, legacy `manualDeload` — read both via `weekOverrideOf`) beats the program week. Progression, seeding, the card nudge and dashboard insights read it — don't re-derive "is this a deload" from labels or the program elsewhere; use `isRecoveryWorkout(w)` for completed docs.

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

4b. **One shell (SH-5).** New bottom sheet → `openSheet()` ([sheet.js](js/core/ui/sheet.js)). New page header → `.page-header`. Never write `env(safe-area-inset-top)` (use `var(--safe-top)`), a new `position: fixed; bottom: 0` overlay root, or `body.style.overflow` outside the primitives (`sheet.css`, `page-header.css`, `tokens.css`, `page-lock.js`). `npm run audit:design:strict` now includes the shell budgets from [shell-audit.js](scripts/shell-audit.js); they only go down. Before a prod promote, run [docs/ux-shell-checklist.md](docs/ux-shell-checklist.md) on the phone.

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
- **Buttons name the actions.** `Delete workout` / `Keep workout`, not `OK` / `Cancel`.
- **Use the in-app primitive, never native dialogs.** `confirmSheet()` / `promptSheet()` from [confirm-sheet.js](js/core/ui/confirm-sheet.js) — promise-based bottom sheets rendered as top-layer `<dialog>`s (they stack above any open modal). `confirmLabel` is required and must name the action; pass `destructive: true` for delete/discard. Native `confirm()`/`alert()`/`prompt()` were fully migrated in 2026-07 — don't reintroduce them (`alert` → `showNotification`).
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

### 8b. Plain words, not jargon (TP-0)

Numbers stay; jargon goes. Say **estimated max**, **effort (out of 10)**, **lighter week**, **build week / push week**, **stuck**, **main lifts**, **plan** — never e1RM, RPE, deload, block, rung, MEV/MRV, accumulate/intensify, primaries. Use the formatters in [plain-language.js](js/core/features/plain-language.js) (`effortTag`, `weekKindLabel`, `describeStuck`, `describeStrengthChange`…). Identifiers keep their names (`isDeloadTarget`, `intent.mode === 'deload'`). `npm run audit:design:strict` fails on any banned word in visible text (budget `jargonInUiStrings: 0`, [scripts/jargon-audit.js](scripts/jargon-audit.js)); a deliberate exception carries `// copy-ok: <reason>`. The same words govern every context line the coach is told to quote — the eval's `no-jargon` checks cover the answer and the context.

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

## Deployment

The app has two Firebase Hosting targets:

- `dev` → `bigsurf-dev` — no-cache headers, used for verification before prod
- `prod` → `workout-tracker-b94b6` — **`no-cache` on JS/CSS + `index.html`** (changed 2026-07 from 1-year `max-age`). With no build step / content-hashed filenames, the old 1-year cache pinned stale modules on users' devices after every deploy (each module caches independently; only `index.html` was fresh), so a shipped fix could silently not reach users until a hard-refresh. `no-cache` means "revalidate before use" — the browser sends a conditional request and gets a cheap `304` when unchanged, so deploys propagate immediately at the cost of a small revalidation round-trip per file per cold load.

**Always deploy to `dev` first, never directly to `prod`.** Note: switching to `no-cache` only affects *future* fetches — files a user already has under the old 1-year `max-age` stay pinned until that entry expires or they hard-refresh once.

```bash
# Regenerate the modulepreload block first (a test fails if it's stale)
npm run build:preload

# Verify a change
firebase deploy --only hosting:dev

# Promote to prod ONLY after verifying on dev
firebase deploy --only hosting:prod
```

Bare `firebase deploy` or `firebase deploy --only hosting` deploys BOTH targets — don't use those forms.

## Quality Checks Before Declaring Work Done

After meaningful changes, run the relevant subset before saying a task is complete:

| Change type | Run |
|-------------|-----|
| JS render-function / feature / data-layer | `npm test` + `npm run lint` + `npm run audit:design` |
| Pure data file (catalog seed, fixtures) | Verify data loads; skip Vitest/lint |
| CSS-only (tokens, components, restyle) | `npm run audit:design` (catches raw colors, untokenized font sizes, duplicate classes) |
| HTML structure | `npm run audit:design` + manual smoke test |
| Sheets, overlays, headers, back/close buttons | `npm run audit:shell:strict` (budgets in scripts/shell-audit.js only go down) |
| Coach prompt, tool, context or loop change | `npm run eval:coach` (needs `ANTHROPIC_API_KEY`; `EVAL_ONLY=id1,id2` to iterate) — no new regressions vs tests/coach-eval/baseline.json; then `EVAL_UPDATE_BASELINE=1` and commit the baseline. `npm run eval:coach:check` (also the pre-push hook — `npm run hooks:install`) fails while the coach is newer than the baseline |

`npm run audit:design --strict` is the must-pass variant. Lint baseline: 17 warnings, 0 errors — `npm run lint` enforces this with `--max-warnings 17` (ratchet: if you fix warnings, lower the number in package.json; never raise it). Pre-existing failures on `main` are noted but not fixed as part of unrelated work.

## Important Notes

- **No bundler/transpiler**: All code must be ES6 module compatible
- **Firebase SDK version**: Locked to 10.7.1
- **CSS uses native @import**: `styles/index.css` imports modular files — no CSS bundler needed
- **Authentication required**: Most features require signed-in user
- **Local storage not used**: All state in memory or Firebase (Firestore's own IndexedDB cache is the SDK's, not app state)
- **Mobile-first**: UI designed for phone use at the gym
- **Modal-based UI**: Features use integrated modals, not separate pages
- **Offline-first Firestore (11a)**: `firebase-config.js` turns on the persistent IndexedDB cache (memory fallback) and exports LOCAL-FIRST `setDoc`/`updateDoc`/`deleteDoc`/`writeBatch().commit` — they resolve once the write is on the device (`'synced'`, or `'queued'` offline / after 5 s with no ack; see [offline.js](js/core/data/offline.js) `commitWrite`) and still reject real refusals. Don't wrap writes in retry loops (the SDK retries queued writes itself) and don't import write functions from the SDK directly. Reads that must survive no signal use `readWithCacheFallback` (data-manager / firebase-workout-manager `readDocs`); `getDocsFromServer` throws offline, so never call it bare. Network-only features (coach, AI tools) check `isOnline()` / `isOfflineError()` and show `NEEDS_CONNECTION_COPY`
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

### Launch + dashboard speed (PF, 2026-10)

- **Measure with `?debug`:** `perfMark('label')` (config.js) at each step; `perfReport()` (also `window.perfReport`) prints the timing table. Launch and `renderDashboard` are already marked.
- **Launch is one parallel batch** (`setupAuthenticationListener`): settings ∥ plans ∥ PR doc ∥ today's workout, with `loadAllWorkouts` warming the cache. Anything a user can't see (migrations, push registration) runs AFTER the dashboard paints; whole-collection migrations are flag-gated on settings (`schemaV3Checked`, `equipmentBaseWeightChecked`). Don't put a new await in front of `hideLoadingScreen()`.
- **Dashboard reads are one `Promise.all`**, each session-cached (`makeSessionCache` for weigh-ins, scans, the report-card row; `loadPRData()` returns the loaded doc — pass `{ force: true }` to re-read). Every write to a cached collection clears its cache (`clearBodyWeightCache`, `clearDexaCache`). The skeleton shows only before the first paint (`#dashboard-content[data-rendered]`).
- **`loadAllWorkouts` answers from the device first** (`getDocsFromCache`), then one single-flight server read refreshes it and dispatches `bigsurf:data-changed` (`{ what }`) when the fingerprint changed; the dashboard repaints on that event. `{ fresh: true }` waits for the server.
- **`modulepreload`:** `index.html` lists the static import graph between `<!-- modulepreload:start/end -->`. Adding or removing a static import changes it — run `npm run build:preload` (perf-launch.test.js fails while it's stale).

### Ongoing tech-debt notes

- ESLint config has browser globals enabled now (Phase 9 cleanup); `npm run lint` reports 0 errors, 17 warnings (2026-07 sweeps cut it from 131, 10/26 to 17; the rest are load-bearing destructuring omissions, unused function params, and no-useless-assignment cases needing per-site judgment). The `--max-warnings 17` ratchet in package.json blocks regressions.
- workout-history.js's calendar uses in-memory month iteration over currentHistory (~1ms for 1000 workouts; not a real bottleneck).
- Recent workouts list in history is paginated but not virtual-scrolled. Becomes DOM-stress past ~500 visible items.
- `firebase-workout-manager.js#getUserWorkouts` uses `getDocsFromServer` deliberately (delete consistency); has its own un-shared cost.
