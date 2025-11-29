# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Big Surf Workout Tracker** is a client-side web application for tracking gym workouts with Firebase backend. The app features:
- Firebase authentication (Google sign-in)
- Real-time workout tracking with sets, reps, and weights
- Exercise library management with custom exercises
- Workout history with calendar view
- Template-based workout planning
- Manual workout entry for past workouts

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend**: Firebase (Firestore for data, Firebase Auth for authentication)
- **No build process**: Direct ES6 module imports in browser
- **CDN**: Firebase SDK loaded via CDN (10.7.1), Font Awesome 6.0.0

## Application Architecture

### Core State Management

The application uses a centralized state object (`AppState`) located in [js/core/app-state.js](js/core/app-state.js):
- All global state lives in `AppState` object
- No external state management library
- Direct property mutation pattern
- State is exported and imported where needed

### Module Structure

The codebase is organized into functional modules under `js/core/`:

**Initialization & Auth:**
- [app-initialization.js](js/core/app-initialization.js) - Application startup, authentication setup, global event listeners
- [firebase-config.js](js/core/firebase-config.js) - Firebase SDK initialization and configuration

**Core Workout Logic:**
- [workout-core.js](js/core/workout-core.js) - Workout session execution (start, pause, complete, cancel), exercise management, rest timers, set tracking
- [data-manager.js](js/core/data-manager.js) - All Firestore data operations (save/load workouts, exercise history)
- [firebase-workout-manager.js](js/core/firebase-workout-manager.js) - Advanced Firebase operations (templates, custom exercises, user overrides)

**UI Modules:**
- [template-selection.js](js/core/template-selection.js) - Workout template selection UI and filtering
- [workout-history-ui.js](js/core/workout-history-ui.js) - Calendar view and workout history display
- [workout/workout-management-ui.js](js/core/workout/workout-management-ui.js) - Template editor and workout management (modal)
- [exercise-manager-ui.js](js/core/exercise-manager-ui.js) - Exercise library manager UI (integrated modal, search, filter, CRUD operations)
- [manual-workout.js](js/core/manual-workout.js) - Manual workout entry form for adding past workouts
- [ui-helpers.js](js/core/ui-helpers.js) - Shared UI utilities (notifications, weight conversions, progress updates)

**Data:**
- [exercise-library.js](js/core/exercise-library.js) - Exercise database management and search
- [workout-history.js](js/core/workout-history.js) - Workout history data operations

**Entry Point:**
- [main.js](js/main.js) - Imports all modules, assigns functions to `window` object for HTML onclick handlers, initializes app on DOMContentLoaded

### Function Exposure Pattern

Since the app uses inline `onclick` handlers in HTML, all interactive functions are assigned to the `window` object in [main.js](js/main.js):

```javascript
// Example pattern in main.js
import { startWorkout } from './core/workout-core.js';
window.startWorkout = startWorkout;
```

When adding new UI functions that are called from HTML, you must:
1. Export the function from its module
2. Import it in [main.js](js/main.js)
3. Assign it to `window` object

## Firebase Data Model

### Collections Structure

```
users/{userId}/
  ├── workouts/{date}          # Workout sessions (date as document ID: "YYYY-MM-DD")
  ├── templates/{templateId}   # Custom workout templates
  ├── exercises/{exerciseId}   # Custom exercises created by user
  └── exercise_overrides/      # User modifications to default exercises
```

### Workout Document Structure

```javascript
{
  workoutType: "Chest – Push",           // Template name
  date: "2025-01-15",                    // YYYY-MM-DD format
  startedAt: "2025-01-15T10:30:00.000Z", // ISO timestamp
  completedAt: "2025-01-15T11:45:00.000Z", // ISO timestamp (null if incomplete)
  cancelledAt: null,                     // ISO timestamp if cancelled
  totalDuration: 4500,                   // seconds
  exercises: {
    exercise_0: {
      sets: [
        { reps: 10, weight: 135, originalUnit: "lbs" },
        { reps: 8, weight: 145, originalUnit: "lbs" }
      ],
      notes: "Felt strong today",
      completed: true
    }
  },
  exerciseNames: {
    exercise_0: "Bench Press"
  },
  exerciseUnits: {
    0: "lbs"
  },
  originalWorkout: {
    day: "Chest – Push",
    exercises: [/* original template data */]
  },
  version: "2.0",
  lastUpdated: "2025-01-15T11:45:00.000Z"
}
```

### Date Handling

**Critical**: The app has strict date handling requirements to prevent timezone bugs:
- All workout dates stored as `YYYY-MM-DD` strings (no timestamps)
- Use `AppState.getTodayDateString()` to get current date in local timezone
- Firestore document IDs use date strings, not timestamps
- See [data-manager.js](js/core/data-manager.js) lines 8-30 for date validation logic

## Key Development Patterns

### Weight Unit System

The app supports both lbs and kg with per-exercise unit tracking:
- `AppState.globalUnit` - Default unit for new exercises
- `AppState.exerciseUnits` - Map of exercise index to unit preference
- All weights stored in Firestore with `originalUnit` field
- Use `convertWeight()` from [ui-helpers.js](js/core/ui-helpers.js) for conversions

### Exercise History Lookup

Exercise history uses fuzzy matching across workouts:
- Searches by exercise name across all workout templates
- See [data-manager.js:loadExerciseHistory](js/core/data-manager.js#L192) for implementation
- Handles renamed/moved exercises between templates

### Modal Management

All modals are defined in [index.html](index.html) and toggled via CSS classes:
- Add/remove `hidden` class to show/hide
- Close on backdrop click and ESC key (handled in [app-initialization.js](js/core/app-initialization.js))
- Modal functions named with pattern: `show*Modal()`, `close*Modal()`

### In-Progress Workout Detection

On app load, the system checks for incomplete workouts:
- See [app-initialization.js:checkForInProgressWorkoutEnhanced](js/core/app-initialization.js#L232)
- Shows resume card if workout exists for today without `completedAt` or `cancelledAt`
- User can continue or discard

## Common Development Tasks

### Adding a New Exercise Field

1. Update exercise objects in `AppState.exerciseDatabase`
2. Modify Firestore save logic in [data-manager.js:saveWorkoutData](js/core/data-manager.js#L5)
3. Update UI rendering in [workout-core.js:createExerciseCard](js/core/workout-core.js)
4. Update manual workout form in [manual-workout.js](js/core/manual-workout.js)

### Adding a New Workout Section

1. Add HTML section to [index.html](index.html)
2. Create show/hide functions in appropriate module
3. Export and assign to `window` in [main.js](js/main.js)
4. Add navigation button handlers

### Modifying Firebase Schema

1. Update save functions in [data-manager.js](js/core/data-manager.js)
2. Increment `version` field in workout documents
3. Add migration logic in `migrateWorkoutData()` if needed
4. Update TypeScript-style JSDoc comments for data structures

## Debugging

Debug utilities available in [debug-utilities.js](js/core/debug-utilities.js):
- `window.runAllDebugChecks()` - Run comprehensive health check
- `window.debugFirebaseWorkoutDates()` - Check workout date consistency
- `window.AppState` - Access full application state in console

Enable Firebase debug logging:
```javascript
// In browser console
localStorage.setItem('debug', 'firebase:*');
```

## Code Style Guidelines

- Use ES6+ features (arrow functions, destructuring, async/await)
- All async functions use `async/await`, not raw Promises
- Console logging with emoji prefixes for visual scanning (🚀 ✅ ❌ ⚠️ 📊)
- Error handling: try/catch with user-facing notifications via `showNotification()`
- Comments: Explain "why", not "what" - code should be self-documenting

## Important Notes

- **No bundler/transpiler**: All code must be ES6 module compatible
- **Firebase SDK version**: Locked to 10.7.1 (CDN import in [firebase-config.js](js/core/firebase-config.js))
- **Authentication required**: Most features require user to be signed in
- **Local storage not used**: All state in memory or Firebase
- **Mobile-first**: UI designed for mobile gym use, responsive design
- **Modal-based UI**: All major features (workout management, exercise library, manual entry) use integrated modals instead of separate pages
- **No popup windows**: Exercise manager integrated as modal (exercise-manager.html is legacy, not used in production)

## Recent Improvements (v4.2-v4.7, November 2025)

### v4.7: Resume Banner Stats
- Resume banner now shows actual sets completed (e.g., "12/15 sets") instead of "0/0"
- Shows time elapsed since workout started (minutes if < 1h, hours otherwise)
- **File**: [dashboard-ui.js:133-158](js/core/dashboard-ui.js#L133-L158)

### v4.5-v4.6: Smart Abandoned Workout Handling
- **3-hour timeout**: Resume banner only shows for workouts < 3 hours old
- **Auto-complete**: Workouts > 3h with exercises done are auto-completed (preserves on original date)
- **Auto-delete**: Workouts > 3h with no exercises are deleted automatically
- **Midnight boundary**: Checks both today and yesterday for incomplete workouts
- **Files**: [dashboard-ui.js:45-142](js/core/dashboard-ui.js#L45-L142)

### v4.4: Template Deep Clone Fix
- **Critical bug**: Shallow copy `{...workout}` was causing template mutations
- **Issue**: Deleting sets during workout modified the template itself
- **Fix**: Deep clone with `JSON.parse(JSON.stringify(workout))` ensures template independence
- **File**: [workout-core.js:44](js/core/workout-core.js#L44)

### v4.3: Calendar Status Colors
- **Visual improvement**: Calendar uses color-coded icons instead of text labels
- **Green**: Completed workouts
- **Orange**: In-progress workouts
- **Red X**: Missed workout days
- **Files**: [workout-history.js:165-167,314,346](js/core/workout-history.js), [style.css:3970-3989](style.css#L3970-L3989)

### v4.2: Cancel Workflow Improvements
- **Confirmation dialog**: Added before cancelling workouts
- **History filter**: Cancelled workouts no longer appear in history/calendar
- **Files**: [workout-core.js:133-152](js/core/workout-core.js#L133-L152), [firebase-workout-manager.js:783](js/core/firebase-workout-manager.js#L783)

## Recent Improvements (v4.20-v4.21, November 2025)

### v4.20: Workout Library UI Overhaul
- **Unified List**: Removed default/custom template tabs - single unified workout list
- **Terminology**: Changed "Manage Templates" to "Workout Library", "Template" to "Workout" throughout UI
- **Simplified Cards**: Removed category tags from template cards
- **Assign Days**: Renamed "Suggested Days" to "Assign Days" and removed helper text
- **Files**: [index.html:458-463](index.html#L458-L463), [workout-management-ui.js:107-145](js/core/workout/workout-management-ui.js#L107-L145)

### v4.21: Critical Bug Fixes
- **Delete Button Fix**: Default templates now deleteable (passes `isDefault` parameter correctly)
  - **File**: [workout-management-ui.js:155-170](js/core/workout/workout-management-ui.js#L155-L170)
- **Navigation Fix**: Cancel dialog now navigates to dashboard instead of blank page
  - **File**: [workout-core.js:33-39](js/core/workout-core.js#L33-L39)
- **Workout Override Fix**: Fixed error when starting new workout with active one (OK button)
  - **File**: [workout-core.js:44-49](js/core/workout-core.js#L44-L49)
- **Duplicate Prevention**: Prevents adding same exercise twice to workout
  - **File**: [workout-management-ui.js:702-710](js/core/workout/workout-management-ui.js#L702-L710)
- **Auto-Refresh**: Workout library refreshes immediately after creating/editing
  - **File**: [workout-management-ui.js:477-479](js/core/workout/workout-management-ui.js#L477-L479)
- **Firebase Undefined Fix**: Removes undefined fields before saving to Firebase
  - **File**: [firebase-workout-manager.js:714-719](js/core/firebase-workout-manager.js#L714-L719)
- **Notification Fix**: Silent notifications no longer try to vibrate (fixes browser error)
  - **File**: [notification-helper.js:45-61](js/core/notification-helper.js#L45-L61)

### v4.22: UI Improvements
- **Full Exercise Lists**: Template cards show all exercises with sets/reps/weight details
  - **File**: [workout-management-ui.js:155-172](js/core/workout/workout-management-ui.js#L155-L172)
- **Resume Banner Fix**: Resume banner now hidden when starting a workout (was showing for cancelled workout)
  - **File**: [workout-core.js:54-58,119-121](js/core/workout-core.js#L54-L58)

### v4.23: Resume Card Improvements
- **Workout Name Display**: Resume card now shows actual workout name instead of "Current Workout"
  - **File**: [workout-core.js:248-252](js/core/workout-core.js#L248-L252)
- **Button Rename**: "Start Fresh" renamed to "Cancel Workout" for clarity
  - **File**: [index.html:183-185](index.html#L183-L185)

### v4.24: Workout Page UI Overhaul
- **No More Collapse**: Completed exercises show full content with green border instead of collapsing
  - **File**: [workout-core.js:431-434](js/core/workout-core.js#L431-L434), [style.css:1224-1232](style.css#L1224-L1232)
- **Add Exercise Relocated**: Button moved from bottom of exercise list to header (next to Cancel/Finish)
  - **File**: [index.html:264-266](index.html#L264-L266), [workout-core.js:353-364](js/core/workout-core.js#L353-L364)
- **Resume Fix**: Resume button now uses `continueInProgressWorkout()` instead of `startWorkout()` to properly continue workouts
  - **File**: [workout-history-ui.js:140-165](js/core/workout-history-ui.js#L140-L165)
- **Modal Close Fix**: Delete/Repeat buttons now properly close modal after confirmation
  - **File**: [workout-history.js:542-553](js/core/workout-history.js#L542-L553)

### Key Technical Learnings

1. **Deep vs Shallow Copy**: Always use deep clone for nested objects when modifications should not affect source
2. **Abandoned Workout Detection**: Use `startedAt` timestamp comparison for time-based logic
3. **Workout Status States**: `completed`, `incomplete`, `cancelled`, `partial` - must check `completedAt` and `cancelledAt` fields
4. **Calendar Rendering**: Status-based CSS classes enable color coding without text labels
