# Big Surf Workout Tracker

A mobile-first workout tracking web application with Firebase backend. Track your gym sessions, manage exercises and equipment, monitor progress with an intuitive interface designed for use at the gym.

**[https://bigsurf.fit](https://bigsurf.fit)** - Try it now with your Google account

## Features

- **Google Authentication** - Secure sign-in with Google accounts
- **Real-time Workout Tracking** - Track sets, reps, and weights as you work out
- **Multiple Workouts Per Day** - Log morning cardio and evening lifting separately
- **Exercise Library** - 79+ pre-loaded exercises with form videos
- **Custom Exercises** - Create and manage your own exercises
- **Equipment Tracking** - Track which machine/equipment you used for accurate progress comparisons
- **Location Management** - GPS-based gym detection, auto-associate equipment with locations
- **Workout History** - Calendar view with detailed workout logs
- **Progress Tracking** - View exercise history and personal records
- **Template-Based Workouts** - Pre-built workout templates for different muscle groups
- **Manual Entry** - Add past workouts retroactively
- **Unit Toggle** - Switch between lbs/kg per exercise
- **Rest Timers** - Automatic rest timer between sets
- **Weekly Goals** - Visual progress ring showing workout frequency
- **Streak Tracking** - Track consecutive workout days
- **Mobile-First Design** - Optimized for gym use on your phone

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

4. **Serve the app**
   ```bash
   # Using Python
   python -m http.server 8000

   # Or using Node.js
   npx serve
   ```

5. **Open in browser**
   ```
   http://localhost:8000
   ```

## Project Structure

```
BigSurf/
├── index.html                    # Main application page
├── style.css                     # Global styles
├── service-worker.js             # PWA service worker
├── CLAUDE.md                     # Development guidelines
├── data/
│   ├── exercises.json            # Default exercise database
│   └── workouts.json             # Default workout templates
├── docs/
│   ├── DEPLOYMENT.md             # Firebase deployment guide
│   └── MOBILE_TESTING.md         # Mobile & PWA testing guide
└── js/
    ├── main.js                   # Entry point & window exports
    └── core/
        ├── app-initialization.js # App startup & auth
        ├── data/                 # Data layer
        │   ├── firebase-config.js
        │   ├── firebase-workout-manager.js
        │   ├── data-manager.js
        │   ├── exercise-library.js
        │   └── schema-migration.js
        ├── features/             # Feature modules
        │   ├── location-service.js
        │   ├── location-ui.js
        │   ├── manual-workout.js
        │   ├── pr-tracker.js
        │   ├── stats-tracker.js
        │   └── streak-tracker.js
        ├── ui/                   # UI components
        │   ├── dashboard-ui.js
        │   ├── exercise-manager-ui.js
        │   ├── navigation.js
        │   ├── stats-ui.js
        │   ├── template-selection.js
        │   ├── ui-helpers.js
        │   └── workout-history-ui.js
        ├── utils/                # Utilities
        │   ├── app-state.js
        │   ├── debug-utilities.js
        │   ├── error-handler.js
        │   └── notification-helper.js
        └── workout/              # Workout logic
            ├── workout-core.js
            ├── workout-history.js
            └── workout-management-ui.js
```

## Usage

### Starting a Workout

1. Sign in with your Google account
2. Select a workout template from the dashboard or Start Workout page
3. Track your sets, reps, and weights in real-time
4. Complete the workout to save to history

### Managing Equipment

1. When starting an exercise, you can select equipment/machine used
2. Equipment is associated with your gym location automatically
3. View and manage equipment from the Exercise Manager

### Viewing History

1. Tap "History" in the bottom navigation
2. Browse calendar view - dates with workouts are highlighted
3. Tap any date to view workout details
4. Multiple workouts per day are supported with a picker modal

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 Modules), HTML5, CSS3
- **Backend**: Firebase (Firestore + Authentication)
- **No Build Process**: Direct ES6 module imports
- **CDN**: Firebase SDK 10.7.1, Font Awesome 6.0.0

## Data Model

### Firestore Collections

- `users/{userId}/workouts/{docId}` - Workout sessions (Schema v3.0)
- `users/{userId}/templates/{templateId}` - Custom workout templates
- `users/{userId}/exercises/{exerciseId}` - User-created exercises
- `users/{userId}/equipment` - Saved equipment with locations
- `users/{userId}/locations` - Saved gym locations with GPS
- `exercises/{exerciseId}` - Global exercise library (read-only)
- `workouts/{workoutId}` - Global workout templates (read-only)

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
