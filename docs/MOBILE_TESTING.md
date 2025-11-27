# 📱 Mobile Testing Checklist

Use this checklist to test Big Surf Workout Tracker on your mobile device before releasing.

## 🔧 Prerequisites

- [ ] Deployed to Firebase Hosting (https://bigsurf.fit)
- [ ] Test on actual phone (not just browser DevTools)
- [ ] Clear browser cache before testing (hard refresh)
- [ ] Current version: v3.20-notification-cleanup

## 📋 Core Functionality Tests

### Authentication & Sign-In
- [ ] Google sign-in works smoothly
- [ ] Welcome notification appears after sign-in
- [ ] User info displays correctly in header
- [ ] Sign-out works and shows correct UI state (sign-in button appears)
- [ ] Account selection prompt appears after sign-out
- [ ] Persists login after closing browser
- [ ] Works in incognito mode

### Starting a Workout from Template
- [ ] Can view default workout templates
- [ ] Can switch between default/custom template categories
- [ ] Can select workout template
- [ ] Workout starts without errors
- [ ] All exercises load correctly
- [ ] Can see exercise details (sets, reps, weights)
- [ ] Form videos play (if using YouTube links)
- [ ] No "Unsupported field value" errors for custom workouts

### Starting a Custom Workout
- [ ] Can create new custom workout from Workout Management
- [ ] Custom workout starts successfully
- [ ] Custom workout saves with correct name (not "undefined")
- [ ] Custom workout appears in history with correct title

### During Workout Execution
- [ ] Can enter sets, reps, and weights
- [ ] Number keyboard appears for number inputs
- [ ] Can switch between lbs/kg per exercise
- [ ] Rest timer works and displays correctly
- [ ] Can add sets (+ button)
- [ ] Can delete sets (- button)
- [ ] Can add notes to exercises
- [ ] Progress indicator updates correctly
- [ ] Can pause and resume workout
- [ ] Can delete exercises from workout
- [ ] NO success notifications when adding/removing sets
- [ ] NO notifications when marking exercises complete
- [ ] Exercise history loads and displays previous performance

### Completing & Canceling Workouts
- [ ] Complete button works
- [ ] Workout saves to Firebase
- [ ] Appears in workout history immediately
- [ ] Duration calculated correctly
- [ ] All data persisted (sets, reps, weights, notes, units)
- [ ] Can cancel workout mid-session
- [ ] Cancelled workouts don't appear in history

### In-Progress Workout Detection
- [ ] Starting a workout then refreshing shows resume card
- [ ] Resume card shows correct workout name and time
- [ ] Can resume workout and continue where left off
- [ ] Can discard in-progress workout

### Workout History
- [ ] Calendar loads with current month
- [ ] Can navigate months (prev/next)
- [ ] Past workouts display with correct dates
- [ ] Workout cards show: name, date, duration, exercise count
- [ ] Can view workout details (expandable)
- [ ] Can **repeat** past workouts (starts new workout with same template)
- [ ] Can **resume** incomplete workouts (continues in-progress workout)
- [ ] Can **retry** cancelled workouts (starts new workout)
- [ ] Can delete workouts (with confirmation)
- [ ] Workout deletion shows confirmation notification
- [ ] Search/filter works
- [ ] Clear filters button works

### Manual Workout Entry
- [ ] "Add Manual Workout" button opens modal
- [ ] Can select past date
- [ ] Can enter workout name
- [ ] Can add exercises from library
- [ ] Can **load template** using numbered selection
- [ ] Template loads all exercises with correct sets/reps/weights
- [ ] Can manually add sets to exercises
- [ ] Can remove sets
- [ ] Can add notes
- [ ] Can mark exercises as completed
- [ ] Can remove exercises
- [ ] Save button works
- [ ] Manual workout appears in history on correct date
- [ ] NO notifications when adding/removing exercises or sets
- [ ] NO notification when saving manual workout (just closes modal)

### Workout Management (Templates)
- [ ] "Manage Workouts" button opens modal
- [ ] Can switch between default/custom templates
- [ ] Can create new template
- [ ] Can **edit template** (opens editor)
- [ ] Can edit template name
- [ ] Can add exercises to template
- [ ] Can **edit template exercise** (sets, reps, weight, name via prompts)
- [ ] Can delete exercises from template
- [ ] Can reorder exercises (if implemented)
- [ ] Can save template changes
- [ ] Can **delete template** (with confirmation, switches to custom category)
- [ ] Can **use template** (starts workout immediately)
- [ ] NO notifications when saving/updating/deleting templates
- [ ] Templates sync across devices

### Exercise Library
- [ ] Library modal opens (integrated, not popup window)
- [ ] All 79+ exercises load
- [ ] Search works (name, body part, equipment)
- [ ] Body part filter works
- [ ] Equipment filter works
- [ ] Can select exercise in different contexts:
  - [ ] Add to manual workout
  - [ ] Add to template
  - [ ] Add to active workout
- [ ] NO notification when selecting exercise from library
- [ ] Modal closes after selection

### Exercise Manager
- [ ] "Manage Exercises" section loads
- [ ] All exercises display (default + custom)
- [ ] Search works
- [ ] Body part filter works
- [ ] Equipment filter works
- [ ] Can create custom exercise
- [ ] Custom exercise **saves to Firebase** successfully
- [ ] Can edit exercises
- [ ] Can **delete custom exercises** (removes from Firebase)
- [ ] Can **delete exercise overrides** (reverts to default)
- [ ] Can **hide default exercises** (hides from library)
- [ ] NO notifications when saving/deleting exercises
- [ ] Changes reflect immediately in exercise library

### Location Management
- [ ] Can set location for new workouts
- [ ] Location notification DOES appear (user requested to keep these)
- [ ] Location persists in workout data
- [ ] Can change location
- [ ] Suggested location works

## 🎨 UI/UX Tests

### Visual
- [ ] Logo displays correctly
- [ ] No layout breaks or overlaps
- [ ] Text is readable (not too small)
- [ ] Buttons are thumb-friendly (big enough to tap)
- [ ] Colors/contrast looks good
- [ ] Dark theme is comfortable
- [ ] Loading states show appropriately
- [ ] Modals display correctly (centered, proper size)

### Responsive Design
- [ ] Works in portrait orientation
- [ ] Works in landscape orientation
- [ ] Handles small screens (iPhone SE)
- [ ] Handles large screens (iPhone Pro Max)
- [ ] Works on Android phones
- [ ] Works on tablets

### Touch Interactions
- [ ] Buttons respond to tap immediately
- [ ] No accidental double-taps
- [ ] Scroll works smoothly
- [ ] Modals can be dismissed (X button, backdrop click, ESC key)
- [ ] No stuck loading states
- [ ] Keyboard doesn't cover inputs
- [ ] Input focus works correctly

### Notification System
- [ ] Notifications appear in correct position
- [ ] Auto-dismiss after timeout
- [ ] Can manually dismiss notifications
- [ ] Error notifications (red) show for failures
- [ ] Warning notifications (yellow) show for warnings
- [ ] Info notifications (blue) show for important state changes only
- [ ] Success notifications (green) show only for critical actions
- [ ] NO spam notifications during normal operations

## 📶 Network Tests

### Online Behavior
- [ ] Data loads quickly
- [ ] Firebase queries complete successfully
- [ ] Images load
- [ ] No console errors (except expected warnings)
- [ ] Service worker installs (check DevTools > Application)

### Offline Behavior
- [ ] App loads from cache when offline
- [ ] Can view cached data
- [ ] Shows appropriate error messages for Firebase operations
- [ ] Reconnects gracefully when online
- [ ] Service worker updates on new deployment

## 🚀 PWA Tests

### Installation
- [ ] "Add to Home Screen" prompt appears (after criteria met)
- [ ] Can install to home screen
- [ ] App icon appears correctly
- [ ] App name displays correctly ("Big Surf Workout Tracker")
- [ ] Opens in standalone mode (no browser chrome)

### Installed App
- [ ] Splash screen shows (if configured)
- [ ] Theme color matches app
- [ ] Status bar color correct
- [ ] App behaves same as browser version
- [ ] Updates automatically on new deployment

## ⚡ Performance Tests

### Load Time
- [ ] Initial load < 3 seconds on mobile data
- [ ] Subsequent loads < 1 second (cached)
- [ ] No flash of unstyled content
- [ ] No layout shifts during load

### Runtime Performance
- [ ] Smooth scrolling (60fps)
- [ ] No lag when entering data
- [ ] Firebase queries complete quickly
- [ ] No memory leaks (use for 30+ min)
- [ ] Modal transitions are smooth

## 🐛 Edge Cases

### Data
- [ ] Handles very long workout names
- [ ] Handles many exercises in one workout (10+)
- [ ] Handles very heavy weights (1000+ lbs)
- [ ] Handles many sets (10+)
- [ ] Handles special characters in notes
- [ ] Handles empty workouts (no exercises)

### User Flow
- [ ] Handles incomplete workouts (cancel/abandon)
- [ ] Handles app closure mid-workout (resume on return)
- [ ] Handles rapid button tapping (no duplicate actions)
- [ ] Handles back button on Android
- [ ] Handles app switching
- [ ] Handles phone calls mid-workout

### Error Handling
- [ ] Shows error if Firebase is down
- [ ] Shows error if not signed in when required
- [ ] Shows error if network disconnects mid-operation
- [ ] All errors display user-friendly messages (not raw stack traces)

## 🔒 Security Tests

### Firebase Rules
- [ ] Can only see own workouts
- [ ] Cannot access other users' data
- [ ] Can create/edit custom exercises
- [ ] Can create/edit custom templates
- [ ] Sign-out clears session properly
- [ ] No sensitive data in console logs

## ♿ Accessibility

- [ ] Buttons have clear labels
- [ ] Sufficient color contrast
- [ ] Touch targets are 44x44px minimum
- [ ] Works with text zoom
- [ ] Form inputs have proper labels

## 📝 Browser Compatibility

Test on:
- [ ] Chrome (Android)
- [ ] Safari (iOS)
- [ ] Firefox (Mobile)
- [ ] Edge (Mobile)
- [ ] Samsung Internet

## ✅ Pre-Release Checklist

Before announcing to users:
- [ ] All critical tests pass
- [ ] No console errors (except expected)
- [ ] No "coming soon" messages visible
- [ ] Firebase rules are secure
- [ ] Backup data exported
- [ ] README is up to date
- [ ] Version number updated (v3.20)

## 🚨 Recent Changes to Test (v3.16-v3.20)

### v3.16: Custom Workout Fix
- [ ] Custom workouts start without "undefined field" error
- [ ] Custom workouts save with correct name

### v3.17: Missing Features Implementation
- [ ] Delete template works
- [ ] Edit template exercise works (prompt-based editing)
- [ ] Repeat workout works
- [ ] Add exercise to manual workout works

### v3.18: Additional Features
- [ ] Use template from management works
- [ ] Delete workout from history works

### v3.19: Complete Remaining Features
- [ ] Exercise manager save works (Firebase integration)
- [ ] Exercise manager delete works (custom, override, hide)
- [ ] Load template in manual workout works (numbered selection)
- [ ] Resume workout works
- [ ] Retry workout works
- [ ] Clear history filters works

### v3.20: Notification Cleanup
- [ ] NO notifications for routine manual workout operations
- [ ] NO notifications for exercise library selection
- [ ] NO notifications for template save/update/delete
- [ ] NO notifications for exercise CRUD operations
- [ ] Location notifications STILL appear (user requested)
- [ ] Error/warning notifications STILL appear (critical feedback)
- [ ] Workout deletion confirmation STILL appears

## 🔍 Console Check

Open browser DevTools and check for:
- [ ] No errors in Console tab
- [ ] No 404 errors in Network tab
- [ ] Service worker registered in Application tab
- [ ] Firebase initialized successfully
- [ ] All modules loaded without errors

## 📊 Testing Record

| Date | Tester | Device | OS | Browser | Version | Result | Notes |
|------|--------|--------|----|---------|---------| -------| ------|
| | | | | | v3.20 | ✅/❌ | |

## 🛠️ If Something Breaks

1. Check browser console for errors
2. Note the exact steps to reproduce
3. Check if error persists after hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. Try incognito mode
5. Check Firebase console for quota/errors
6. Verify network connectivity
7. Report with: device, browser, OS, steps to reproduce, console errors

---

**Testing Strategy**: Go through each section systematically. Mark items as you test them. Note any issues immediately. Test critical user flows first (auth, workout execution, history).

**Pro Tip**: Test during an actual gym session to catch real-world issues!
