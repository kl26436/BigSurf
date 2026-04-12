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
    │   ├── dashboard-ui.js         # Dashboard rendering
    │   ├── equipment-library-ui.js # Equipment library page
    │   ├── exercise-manager-ui.js  # Exercise library modal
    │   ├── navigation.js           # Bottom nav, routing
    │   ├── settings-ui.js          # Settings page, onboarding flow
    │   ├── stats-ui.js             # Stats page
    │   ├── template-selection.js   # Workout picker
    │   ├── ui-helpers.js           # Notifications, conversions, modal helpers
    │   └── workout-history-ui.js   # History modal
    ├── utils/                  # Utilities
    │   ├── app-state.js            # Global state object
    │   ├── config.js               # Config constants, CATEGORY_ICONS/COLORS, debugLog
    │   ├── debug-utilities.js      # Debug functions
    │   ├── error-handler.js        # Error handling with severity levels
    │   └── notification-helper.js  # UI notifications
    └── workout/                # Workout logic
        ├── exercise-ui.js          # Exercise cards, modal, set logging
        ├── rest-timer.js           # Rest timer (modal + header)
        ├── workout-core.js         # Session execution
        ├── workout-history.js      # Calendar, history data
        ├── workout-management-ui.js # Template editor
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

### Adding a New Exercise Field

1. Update exercise objects in `AppState.exerciseDatabase`
2. Modify save logic in [data-manager.js](js/core/data/data-manager.js)
3. Update UI in [workout-core.js](js/core/workout/workout-core.js)
4. Update manual workout form in [manual-workout.js](js/core/features/manual-workout.js)

### Adding a New Workout Section

1. Add HTML section to [index.html](index.html)
2. Create show/hide functions in appropriate module
3. Export and assign to `window` in [main.js](js/main.js)
4. Add navigation button handlers

### Modifying Firebase Schema

1. Update save functions in [data-manager.js](js/core/data/data-manager.js)
2. Increment `version` field in workout documents
3. Add migration logic in [schema-migration.js](js/core/data/schema-migration.js)

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
- **No inline styles in JS**: Use CSS classes instead of `element.style.*` or `style="..."` attributes. Only exception: truly dynamic values (width %, SVG coordinates)
- **CSS tokens**: Use `var(--font-*)`, `var(--radius-*)`, `var(--cat-*)` etc. from tokens.css — never hardcode hex colors or rem values
- **Card patterns**: Use `.hero-card` for dashboard widgets or `.row-card` for list items — don't create one-off card classes

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

See [roadmap.md](roadmap.md) for the full overhaul plan. Current status:
- **Sprints 1-7 (Phases 0-13, 15-18)**: Complete
- **Phase 14 (Social features)**: Intentionally on hold
- **Phase 19 (Community gym DB)**: Intentionally on hold
