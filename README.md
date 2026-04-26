# Big Surf Workout Tracker

A mobile-first workout tracking web application with Firebase backend. Track your gym sessions, manage exercises and equipment, monitor progress with an intuitive interface designed for use at the gym.

**[https://bigsurf.fit](https://bigsurf.fit)** - Try it now with your Google account

## Features

- **Google Authentication** - Secure sign-in with Google accounts
- **Active Workout V2** - Wizard-style one-exercise-at-a-time UI with bottom sheets for add/replace/equipment
- **Unified Workouts page** - Single "Workouts" surface that's both the picker and the inline editor (rename, sets/reps/weight steppers, equipment picker, notes — all on one tap-to-expand row)
- **Real-time tracking** - Sets, reps, and weights logged as you work out; per-exercise unit toggle
- **Multiple workouts per day** - Log morning cardio and evening lifting separately (Schema v3.0)
- **Exercise library** - Pre-loaded exercises with form videos + custom exercises
- **Equipment tracking** - Track which machine/equipment you used for accurate progress comparisons; per-equipment base weight (e.g. dumbbells, fixed-weight cable stacks)
- **Location management** - GPS-based gym detection (500 m radius); equipment auto-associates with the gym you're at
- **Workout history** - Calendar view with detailed workout logs
- **Progress tracking** - Body-part dashboard cards with weekly volume + sparklines; personal records per exercise/equipment
- **Last-session meta** - Every exercise row shows "Last: 10×135 · 8×135 · 3d ago" pulled from your history
- **Manual entry** - Add past workouts retroactively
- **Rest timers** - Automatic rest timer between sets, with optional push notification on lock screen
- **Body measurements** - Body weight tracking with 7-day average chart; DEXA scan import
- **Weekly goals + streaks** - Visual progress ring + consecutive-day streak counter
- **AI Coach** - Rules-based training insights (no API), plus optional LLM-backed coach
- **Mobile-first design** - Optimized for gym use on your phone

## Quick Start

### Prerequisites

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Firebase account (for backend)
- Google account (for authentication)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/kl26436/BigSurf-B.git
   cd BigSurf-B
   ```

2. **Configure Firebase**
   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Google Authentication
   - Create a Firestore database
   - Copy your Firebase config to `js/core/data/firebase-config.js`

3. **Set up Firestore Security Rules**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
       match /exercises/{exerciseId} {
         allow read: if request.auth != null;
         allow write: if false;
       }
       match /workouts/{workoutId} {
         allow read: if request.auth != null;
         allow write: if false;
       }
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```

4. **Install dev dependencies** (for tests and lint only — the app itself has no build step)
   ```bash
   npm install
   ```

5. **Serve the app**
   ```bash
   # Using Python
   python -m http.server 8000

   # Or using Node.js
   npx serve
   ```

6. **Open in browser**
   ```
   http://localhost:8000
   ```

## Development scripts

```bash
npm test                # Vitest unit tests (357+ tests, ~1.5s)
npm run test:watch      # Watch mode
npm run lint            # ESLint (0 errors, ~127 warnings — mostly unused-vars)
npm run lint:fix        # Auto-fix simple issues
npm run format          # Prettier write
npm run audit:design    # Design-system budget audit (font-size literals, raw colors, etc.)
```

## Project structure

```
BigSurf/
├── index.html                       # Main application shell — all sections + dialogs live here
├── service-worker.js                # PWA service worker
├── manifest.json                    # PWA manifest
├── CLAUDE.md                        # Project guidance for Claude Code (architecture, conventions)
├── README.md                        # This file
├── ROADMAP.md, DESIGN-BACKLOG.md    # Long-running roadmap + cleanup tracker
├── firebase.json, firestore.rules   # Firebase deploy config
├── styles/
│   ├── index.css                    # @imports all modules in load order
│   ├── tokens.css                   # Design tokens (colors, fonts, radius, z-index)
│   ├── reset.css                    # Reset + base styles
│   ├── components/                  # cards, buttons, modals, nav, chips, fields, etc.
│   ├── pages/                       # Per-page styles (dashboard, workout, templates, history, …)
│   └── utilities.css                # .hidden, .text-primary, layout helpers
├── docs/
│   ├── DEPLOYMENT.md                # Firebase deployment guide
│   ├── MOBILE_TESTING.md            # Mobile & PWA testing guide
│   ├── implementation-plan.md       # The plan that drove the most recent overhaul
│   └── archive/                     # Shipped implementation guides + old design critiques
├── functions/                       # Firebase Cloud Functions (push notifications, geocoding, Withings)
├── mockups/                         # Reference HTML mockups still in use
├── scripts/                         # Tooling (design-audit, copy-lint, pre-commit hook, archive of one-offs)
├── tests/
│   ├── fixtures/                    # Mock workouts/PRs for tests
│   └── unit/                        # 20+ Vitest test files (no Firebase/DOM)
└── js/
    ├── main.js                      # Entry point — imports + window assignments for inline onclicks
    └── core/
        ├── app-initialization.js    # App startup, auth listener, keyboard-aware focus handler
        ├── data/                    # Data layer
        │   ├── firebase-config.js          # SDK init
        │   ├── firebase-workout-manager.js # Templates, exercises, equipment, locations
        │   ├── data-manager.js             # Save/load workouts, loadAllWorkouts cache, getLastSessionDefaults
        │   ├── data-export-import.js       # CSV / JSON export + import
        │   ├── exercise-library.js         # Favorites
        │   └── schema-migration.js         # v2→v3 migration
        ├── features/                # Feature modules
        │   ├── ai-coach-ui.js              # AI Coach modal
        │   ├── body-measurements{,.ui}.js  # Weight tracking + dashboard widget + entry modal
        │   ├── dexa-scan{,-ui}.js          # DEXA scan import + history views
        │   ├── equipment-planner.js        # Equipment-aware exercise ranking ("at this gym")
        │   ├── exercise-progress.js        # Per-exercise charts
        │   ├── location-{service,ui}.js    # GPS detection + locations UI
        │   ├── manual-workout.js           # Manual workout entry (full-page two-step)
        │   ├── plate-calculator.js         # Plate breakdown
        │   ├── pr-tracker.js               # PR detection + reassignment migration
        │   ├── stats-tracker.js            # Weekly stats (delegates streaks to streak-tracker)
        │   ├── streak-tracker.js           # Canonical streak calculation
        │   ├── superset-manager.js         # Exercise grouping
        │   └── training-insights.js        # Rules engine for dashboard insights
        ├── ui/                      # UI surfaces
        │   ├── dashboard-ui.js             # Dashboard render — body-part cards, recent PRs, insights
        │   ├── equipment-library-ui.js     # Equipment library page
        │   ├── exercise-manager-ui.js      # Exercise library + create-exercise modal host
        │   ├── navigation.js               # Bottom nav + section routing
        │   ├── settings-ui.js              # Settings page + onboarding flow
        │   ├── stats-ui.js                 # Stats page
        │   ├── sheet.js                    # Bottom-sheet primitive (openSheet/awCloseSheet)
        │   ├── add-exercise-sheet.js       # Shared add-exercise sheet (active workout + template editor)
        │   ├── equipment-picker.js         # Equipment picker render helper
        │   ├── template-selection.js       # Workouts page — unified library + inline editor
        │   ├── ui-helpers.js               # Notifications, conversions, modal helpers
        │   └── workout-history-ui.js       # History modal
        ├── utils/                   # Utilities (config, app-state, error handler, etc.)
        └── workout/                 # Workout logic
            ├── exercise-ui.js              # Legacy v1 exercise cards (still used in places)
            ├── active-workout-ui.js        # V2 wizard-style active workout + bottom sheets
            ├── rest-timer.js               # Rest timer (header + modal)
            ├── workout-core.js             # Top-level workout lifecycle re-exports
            ├── workout-history.js          # Calendar + history data
            ├── workout-management-ui.js    # Equipment picker + create-exercise modal (template editor retired in Phase 9)
            └── workout-session.js          # Workout completion, summary modal
```

## Usage

### Starting a workout

1. Sign in with your Google account
2. Tap the green "Workouts" button in the bottom nav
3. Tap the play button on any row to start it (or tap the row body to expand the inline editor first)
4. Track your sets, reps, and weights in real-time
5. Complete the workout to save to history

### Editing a workout (template)

The Workouts page is also the editor — there's no separate "manage templates" surface.

1. Tap a workout row to expand it
2. Edit the title inline, change category + schedule via the Details accordion, or tap an exercise to expand its sets/reps/weight steppers + equipment pill + notes
3. Use the "+" next to EXERCISES to add via the same shared add-exercise sheet the active workout uses
4. Saves are automatic on blur — no Save button

### Managing equipment

1. When picking equipment for any exercise (active workout or template), the picker opens a categorized sheet: For this exercise / At this gym / Other
2. Equipment auto-associates with your current gym location once you log a set
3. View and manage equipment from More → Equipment library

### Viewing history

1. Tap "History" in the bottom navigation
2. Browse calendar view — dates with workouts are highlighted
3. Tap any date to view workout details
4. Multiple workouts per day are supported with a picker modal

## Tech stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend**: Firebase (Firestore + Authentication + Cloud Functions for push notifications & geocoding)
- **No build process**: Direct ES6 module imports in the browser
- **Tests**: Vitest (no Firebase / DOM dependencies — pure-function isolation)
- **CDN**: Firebase SDK 10.7.1, Font Awesome 6.0.0, Chart.js 4.4.1, Leaflet 1.9.4

## Data model

### Firestore collections

```
users/{userId}/
  ├── workouts/{docId}            # Workout sessions — Schema v3.0, doc ID = {date}_{ts}_{rand}
  ├── workoutTemplates/{id}       # Custom workout templates (also stores hidden-default markers)
  ├── exercises/{id}              # User-created exercises (overrides + customs)
  ├── equipment/{id}              # Equipment with locations[], exerciseTypes[], exerciseVideos{}
  ├── locations/{id}              # Saved gym locations with GPS
  ├── stats/personalRecords       # PR records keyed by exercise → equipment → metric
  └── preferences/
      ├── settings                # Global settings (units, rest timer, weekly goal, …)
      └── favorites               # Favorite exercise names
exercises/{id}                    # Global exercise library (read-only)
workouts/{id}                     # Global workout templates (read-only)
```

See [CLAUDE.md](CLAUDE.md) for full document shapes and date-handling rules.

## Debug Tools

Access via browser console:
```javascript
// Run all health checks
window.runAllDebugChecks()

// Debug weekly stats
window.debugWeeklyStats()

// View app state
console.log(window.AppState)
```

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Version 1.0.0** - Initial public release
