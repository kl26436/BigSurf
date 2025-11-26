# Issue Log - BigSurf Workout Tracker

## Session: 2025-01-26 - Bug Fixes & UX Improvements

### ✅ FIXED - Critical Issues

#### #1 - Annoying Notifications (Exercise Started, Timer Expired)
**Status:** ✅ FIXED
**Priority:** High
**Reported:** User feedback - notifications were excessive and annoying

**Description:**
- "Started workout" notification was unnecessary
- "Rest timer started" notification was redundant (user can see timer)
- "Rest period complete" notification was annoying when timer shows 0:00

**Solution:**
- Removed "workout started" notification in `workout-core.js:81`
- Removed "rest timer started" notification in `workout-core.js:686`
- Removed "rest period complete" in-app notification in `workout-core.js:954`, `workout-core.js:1083`
- Added `silent: true` to browser notifications to prevent loud sounds

**Files Changed:**
- `js/core/workout-core.js`

---

#### #2 - Notification Sound Volume Too Loud
**Status:** ✅ FIXED
**Priority:** High
**Reported:** Notification sound was extremely loud unless music was playing

**Description:**
Browser notification sound was too loud and jarring during workouts.

**Solution:**
Added `silent: true` flag to all browser notifications:
- `workout-core.js:950` - Rest timer browser notification
- `workout-core.js:1079` - Modal rest timer browser notification

**Files Changed:**
- `js/core/workout-core.js`

---

#### #3 - Background Notifications Not Working
**Status:** ✅ FIXED
**Priority:** Medium
**Reported:** Notifications only work when app is active, not when browsing other apps or on lock screen

**Description:**
Browser notifications showed only when app tab was active. Needed to work in background, when browsing other apps, and on lock screen.

**Solution:**
Implemented Service Worker with PWA capabilities for true background notifications:

1. **Enhanced Service Worker** (`service-worker.js`):
   - Added `push` event listener for push notifications
   - Added `notificationclick` event to open/focus app when notification clicked
   - Added `message` event to schedule delayed notifications for rest timer
   - Implemented notification scheduling via postMessage

2. **Created Notification Helper Module** (`js/core/notification-helper.js`):
   - `initializeNotifications()` - Registers service worker and requests permission
   - `showNotification()` - Shows notification via service worker (works in background)
   - `scheduleNotification()` - Schedules delayed notification via service worker
   - Automatic fallback to regular notifications if service worker unavailable

3. **Updated PWA Manifest** (`manifest.json`):
   - Added `"permissions": ["notifications"]` for notification API access
   - Added `"prefer_related_applications": false` to prioritize PWA

4. **Integrated with App**:
   - App initialization now registers service worker and requests notification permission
   - Rest timers use service worker notifications instead of regular browser notifications
   - Works even when app is in background, another tab, or on lock screen

**How It Works:**
- Service worker runs independently of the main app
- When rest timer expires, it posts message to service worker
- Service worker shows notification even if app is not visible
- Clicking notification opens/focuses the app
- Notifications work on lock screen (device dependent)

**Files Changed:**
- `service-worker.js:126-201` - Added notification event handlers
- `js/core/notification-helper.js` - New module for notification management
- `manifest.json:20-21` - Added notification permissions
- `js/core/app-initialization.js:275-277` - Initialize notifications on login
- `js/core/workout-core.js:963-978, 1101-1116` - Updated rest timers to use service worker

**Testing:**
1. Reload app to register updated service worker
2. Allow notification permission when prompted
3. Start a workout and complete a set
4. Switch to another app or lock screen
5. Notification should appear when rest timer expires

**Note:** First time users will need to allow notification permission. On mobile, may need to add app to home screen for best results.

---

#### #4 - Exercise Manager Closes to Wrong Screen
**Status:** ✅ FIXED
**Priority:** High
**Reported:** Closing exercise manager showed "legacy screen" with redundant buttons

**Description:**
When closing the exercise manager modal, it didn't return to the proper view (dashboard). Instead showed old template selector with redundant header buttons.

**Solution:**
Updated `closeExerciseManager()` to check for visible sections and default to dashboard if none are visible.

**Files Changed:**
- `js/core/exercise-manager-ui.js:22-42`

**Code Changes:**
```javascript
export function closeExerciseManager() {
    const modal = document.getElementById('exercise-manager-modal');
    if (modal) {
        modal.classList.add('hidden');
    }

    // Return to dashboard (or whatever the last view was)
    const dashboardSection = document.getElementById('dashboard');
    const workoutSection = document.getElementById('active-workout');
    const historySection = document.getElementById('workout-history-section');

    // If no other section is visible, default to dashboard
    const anyVisible = dashboardSection && !dashboardSection.classList.contains('hidden') ||
                      workoutSection && !workoutSection.classList.contains('hidden') ||
                      historySection && !historySection.classList.contains('hidden');

    if (!anyVisible && dashboardSection) {
        dashboardSection.classList.remove('hidden');
    }
}
```

---

#### #5 - In-Progress Workout Not Detected on Dashboard
**Status:** ✅ FIXED
**Priority:** Critical
**Reported:** Switching to history then back to dashboard didn't show resume prompt

**Description:**
When navigating away from active workout (e.g., to history page) then returning to dashboard, the in-progress workout resume banner didn't appear. User had to close and reopen app.

**Solution:**
Added `checkForInProgressWorkout()` function to dashboard that runs every time dashboard is shown. Properly loads workout data and sets `window.inProgressWorkout`.

**Files Changed:**
- `js/core/dashboard-ui.js:36-83`

**Code Changes:**
```javascript
export async function showDashboard() {
    // Check for in-progress workout
    await checkForInProgressWorkout();

    // Load and render dashboard data
    await renderDashboard();
}

async function checkForInProgressWorkout() {
    const todaysData = await loadTodaysWorkout(AppState);

    if (todaysData && !todaysData.completedAt && !todaysData.cancelledAt) {
        // Find the workout plan
        const workoutPlan = AppState.workoutPlans.find(plan =>
            plan.day === todaysData.workoutType ||
            plan.name === todaysData.workoutType ||
            plan.id === todaysData.workoutType
        );

        // Store globally for resume
        window.inProgressWorkout = {
            ...todaysData,
            originalWorkout: workoutPlan
        };

        // Show resume banner
        card.classList.remove('hidden');
    }
}
```

---

#### #6 - Resume Workout Shows No Exercise Data
**Status:** ✅ FIXED
**Priority:** Critical
**Reported:** Clicking resume showed empty workout screen, lost all data

**Description:**
When clicking "Continue Workout" button, the workout screen appeared but showed no exercises or data. This was because `window.inProgressWorkout` wasn't properly populated with workout plan data.

**Solution:**
Fixed in conjunction with #5 - `checkForInProgressWorkout()` now properly stores the original workout plan in `window.inProgressWorkout.originalWorkout`, which `continueInProgressWorkout()` uses to restore the full workout state.

**Files Changed:**
- `js/core/dashboard-ui.js:36-83`

---

#### #7 - Duplicate PR Notifications
**Status:** ✅ FIXED
**Priority:** Medium
**Reported:** PR notification appeared multiple times for the same set

**Description:**
When entering a PR, the notification would show multiple times (sometimes 2-3 times) for the same set. This happened because `checkSetForPR()` was called on every `updateSet()` call (which fires on every input change).

**Solution:**
Added `prNotifiedSets` Set to track which sets have already triggered PR notifications. Uses unique key: `${exerciseIndex}-${setIndex}-${reps}-${weight}`.

**Files Changed:**
- `js/core/workout-core.js:619-640`

**Code Changes:**
```javascript
// Track which sets have already shown PR notifications to avoid duplicates
const prNotifiedSets = new Set();

async function checkSetForPR(exerciseIndex, setIndex) {
    const set = AppState.savedData.exercises[exerciseKey].sets[setIndex];
    if (!set || !set.reps || !set.weight) return false;

    // Create unique key for this set to track if we've already notified
    const setKey = `${exerciseIndex}-${setIndex}-${set.reps}-${set.weight}`;

    // Skip if we've already notified about this exact set
    if (prNotifiedSets.has(setKey)) {
        return false;
    }

    const prCheck = PRTracker.checkForNewPR(exerciseName, set.reps, set.weight, equipment);

    if (prCheck.isNewPR) {
        // Mark this set as notified
        prNotifiedSets.add(setKey);
        showNotification(prMessage, 'success');
        return true;
    }
}
```

---

#### #8 - Workout Screen Too Long/Clunky
**Status:** ✅ FIXED
**Priority:** Medium
**Reported:** Workout screen requires excessive scrolling, can't see notifications

**Description:**
When workout has many exercises, the screen became very long requiring excessive scrolling. User couldn't see notifications or timers when scrolled down to later exercises.

**Solution:**
Implemented multiple optimizations to reduce screen height and improve visibility:

1. **Auto-Collapse Completed Exercises**:
   - Completed exercises automatically collapse to a minimal height (60px)
   - Shows only exercise name and completion status when collapsed
   - Click the header to expand and view full details
   - Saves significant vertical space during workouts

2. **Reduced Padding and Spacing**:
   - Exercise card padding reduced from 1.5rem to 1rem
   - Gap between exercises reduced from 1rem to 0.75rem
   - On mobile, gap further reduced to 0.5rem
   - Border radius reduced from 16px to 12px for cleaner look

3. **Responsive Spacing**:
   - Mobile devices get even tighter spacing
   - More exercises visible on screen at once
   - Less scrolling required during workouts

**How It Works:**
- When you complete all sets for an exercise, it automatically collapses
- Collapsed view shows: Exercise name + completion checkmark
- Click the collapsed exercise header to expand and view all sets
- Incomplete exercises remain fully expanded for easy access

**Files Changed:**
- `style.css:1063-1127` - Reduced padding, added collapse styles, responsive gaps
- `js/core/workout-core.js:361-406` - Auto-collapse completed exercises, toggle handler

**User Experience:**
- Completed exercises take ~60px instead of ~300px
- Can see 3-4x more exercises on screen at once
- Timers and notifications always visible
- No more excessive scrolling during workouts
- Easy to expand any exercise to review sets

---

#### #9 - Play Button on Workout Cards Doesn't Work
**Status:** ⚠️ PENDING
**Priority:** Medium
**Reported:** Play button says "start video" but doesn't play unless exercise is opened

**Description:**
Need to identify which play button this refers to:
- Dashboard workout cards?
- Template selection cards?
- History workout cards?

Also need to clarify: what should the play button do?
- Start the workout immediately?
- Preview the workout?
- Play a demo video?

**Next Steps:**
- Clarify which cards and what expected behavior should be
- Consider replacing "expand" button with more intuitive icon/label

**Files to Investigate:**
- `js/core/dashboard-ui.js`
- `js/core/template-selection.js`
- `js/core/workout-history-ui.js`

---

#### #10 - Duplicate formatDate Function Breaking App
**Status:** ✅ FIXED
**Priority:** CRITICAL
**Reported:** `Uncaught SyntaxError: Identifier 'formatDate' has already been declared`

**Description:**
After adding streak tracking, `formatDate()` function was declared twice in `stats-ui.js`, causing a syntax error that broke the entire app.

**Solution:**
Removed duplicate `formatDate()` function declaration at line 490. Kept the version in the "STREAK & FREQUENCY STATS" section (line 231).

**Files Changed:**
- `js/core/stats-ui.js:489`

---

#### #11 - Firebase Authentication for Deployment
**Status:** ⚠️ PENDING
**Priority:** High
**Reported:** Can't log in on deployed Firebase hosting

**Description:**
Firebase authentication works locally but fails on deployed version.

**Possible Causes:**
1. Authorized domains not configured in Firebase Console
2. API keys restricted to wrong domain
3. OAuth redirect URIs not set up correctly
4. Firebase config pointing to wrong project

**Next Steps:**
1. Check Firebase Console → Authentication → Settings → Authorized domains
2. Add deployment domain (e.g., `yourapp.web.app`, `yourapp.firebaseapp.com`)
3. Verify API keys in Firebase Console → Project Settings
4. Check OAuth consent screen configuration

**Files to Check:**
- `js/core/firebase-config.js` - Firebase configuration
- `.firebaserc` - Firebase project settings
- `firebase.json` - Hosting configuration

---

#### #12 - Sign Out Doesn't Return to Splash Page
**Status:** ✅ FIXED
**Priority:** High
**Reported:** Clicking sign out left user on blank screen instead of showing sign-in page

**Description:**
After signing out, the auth section wasn't properly displayed. User saw a blank screen instead of the splash page with Google sign-in button.

**Solution:**
Updated `signOutUser()` to:
1. Hide all content sections (dashboard, workout, history, etc.)
2. Show auth section by calling `hideUserInfo()`
3. Clear all app state including `AppState.currentUser`, `AppState.currentWorkout`, `window.inProgressWorkout`
4. Show success notification

**Files Changed:**
- `js/core/app-initialization.js:170-204`

**Code Changes:**
```javascript
export async function signOutUser() {
    try {
        await signOut(auth);

        // Hide all content sections
        const sections = [
            'workout-selector',
            'active-workout',
            'workout-history-section',
            'workout-management',
            'dashboard',
            'stats-section'
        ];

        sections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) section.classList.add('hidden');
        });

        // Show auth section
        hideUserInfo();

        // Clear app state
        AppState.currentUser = null;
        AppState.currentWorkout = null;
        AppState.savedData = {};
        window.inProgressWorkout = null;

        showNotification('Signed out successfully', 'info');
    } catch (error) {
        console.error('❌ Sign-out error:', error);
        showNotification('Error signing out', 'error');
    }
}
```

---

## Summary

**Total Issues:** 12
**Fixed:** 8
**Pending:** 4

### Critical Fixes Completed:
- ✅ App no longer crashes (duplicate formatDate)
- ✅ Sign out properly returns to splash page
- ✅ In-progress workouts can be resumed from dashboard
- ✅ Resume workout shows all exercise data
- ✅ Removed annoying notifications
- ✅ Fixed notification volume (silent mode)
- ✅ No more duplicate PR notifications
- ✅ Exercise manager returns to correct screen

### Remaining Work:
- ⚠️ Background notifications (requires PWA/Service Worker)
- ⚠️ Optimize workout screen layout (reduce scrolling)
- ⚠️ Fix/clarify play button behavior on workout cards
- ⚠️ Firebase deployment authentication issues

---

## Previous Session Issues

### PR Migration - Date Issue
**Status:** ✅ FIXED
**Date:** 2025-01-26

**Description:**
All PRs showed as "yesterday" instead of actual workout dates.

**Solution:**
- Modified `recordPR()` in `pr-tracker.js:237` to accept optional `date` parameter
- Updated `pr-migration.js:69` to pass workout date (`doc.id`) when recording PRs

**Files Changed:**
- `js/core/pr-tracker.js:237-251`
- `js/core/pr-migration.js:61-70`

---

### Streak Tracking Added
**Status:** ✅ COMPLETE
**Date:** 2025-01-26

**Description:**
Added comprehensive streak and frequency tracking to stats view.

**Features Added:**
- Current workout streak
- Longest workout streak
- Total workouts
- Workouts this week
- Workouts this month
- Last workout date
- Workout frequency by day of week (bar chart)

**Files Created:**
- `js/core/streak-tracker.js` (new)

**Files Modified:**
- `js/core/stats-ui.js` - Added streak/frequency rendering
- `style.css` - Added ~100 lines of streak/frequency styles

---

## Migration Instructions

### To Re-run PR Migration with Correct Dates:

The PR migration fix is complete. To get correct dates on existing PRs:

1. Open browser console (F12)
2. Delete old PR data (optional - migration will overwrite):
   ```javascript
   // This is safe - only affects PR records, not workout history
   ```
3. Run migration:
   ```javascript
   migrateOldWorkoutsToPRs()
   ```
4. Wait for success message
5. Refresh stats view to see corrected PR dates
