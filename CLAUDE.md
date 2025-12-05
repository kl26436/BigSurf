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
- **No build process**: Direct ES6 module imports in browser
- **CDN**: Firebase SDK 10.7.1, Font Awesome 6.0.0

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
    │   ├── data-manager.js         # Workout save/load operations
    │   ├── exercise-library.js     # Exercise database
    │   └── schema-migration.js     # v2 to v3 migration
    ├── features/               # Feature modules
    │   ├── location-service.js     # GPS detection, location matching
    │   ├── location-ui.js          # Location management UI
    │   ├── manual-workout.js       # Manual workout entry
    │   ├── pr-tracker.js           # Personal record detection
    │   ├── stats-tracker.js        # Weekly stats, progress
    │   └── streak-tracker.js       # Streak calculation
    ├── ui/                     # UI components
    │   ├── dashboard-ui.js         # Dashboard rendering
    │   ├── exercise-manager-ui.js  # Exercise library modal
    │   ├── navigation.js           # Bottom nav, routing
    │   ├── stats-ui.js             # Stats page
    │   ├── template-selection.js   # Workout picker
    │   ├── ui-helpers.js           # Notifications, conversions
    │   └── workout-history-ui.js   # History modal
    ├── utils/                  # Utilities
    │   ├── app-state.js            # Global state object
    │   ├── debug-utilities.js      # Debug functions
    │   ├── error-handler.js        # Error handling
    │   └── notification-helper.js  # UI notifications
    └── workout/                # Workout logic
        ├── workout-core.js         # Session execution
        ├── workout-history.js      # Calendar, history data
        └── workout-management-ui.js # Template editor
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
  ├── equipment/{equipmentId}  # Saved equipment with locations
  └── locations/{locationId}   # Saved gym locations with GPS
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
        { reps: 10, weight: 135, originalUnit: "lbs" },
        { reps: 8, weight: 145, originalUnit: "lbs" }
      ],
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
- `AppState.globalUnit` - Default unit for new exercises
- `AppState.exerciseUnits` - Map of exercise index to unit preference
- All weights stored in Firestore with `originalUnit` field
- Use `convertWeight()` from [ui-helpers.js](js/core/ui/ui-helpers.js) for conversions

### Equipment & Location Tracking

- Equipment can belong to multiple locations (array field)
- Location auto-detected via GPS on workout start (150m radius matching)
- Location locks after first set is logged
- Equipment auto-associated with location when first set logged

### Modal Management

All modals defined in [index.html](index.html) and toggled via CSS classes:
- Add/remove `hidden` class to show/hide
- Close on backdrop click and ESC key
- Modal functions: `show*Modal()`, `close*Modal()`
- Z-index scale: Sidebar 300, Modals 500, Exercise Library 550, Add Exercise 600

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
- `console.error()` with emoji prefixes (❌) for visibility
- Error handling: try/catch with `showNotification()` for user feedback
- Comments: Explain "why", not "what"

## Important Notes

- **No bundler/transpiler**: All code must be ES6 module compatible
- **Firebase SDK version**: Locked to 10.7.1
- **Authentication required**: Most features require signed-in user
- **Local storage not used**: All state in memory or Firebase
- **Mobile-first**: UI designed for phone use at the gym
- **Modal-based UI**: Features use integrated modals, not separate pages

## Key Technical Patterns

1. **Deep Clone for Templates**: Use `JSON.parse(JSON.stringify())` to prevent template mutation
2. **Cross-Module Callbacks**: Use `window` flags for modal communication
3. **Query by Date Field**: Use `date` not `completedAt` for workout queries (edited workouts update `completedAt`)
4. **Unique Day Counting**: Use Set to count workout days, not total workouts
5. **SVG Progress Rings**: stroke-dasharray/offset for circular progress indicators
