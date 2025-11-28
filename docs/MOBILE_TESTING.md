# 📱 Mobile Testing Checklist

Use this checklist to test Big Surf Workout Tracker on your mobile device before releasing.

## 🔧 Prerequisites

- [ ] Deployed to Firebase Hosting (https://bigsurf.fit)
- [ ] Test on actual phone (not just browser DevTools)
- [ ] Clear browser cache before testing (hard refresh)
- [ ] Current version: v3.20-notification-cleanup

## 📋 Core Functionality Tests

### Authentication & Sign-In
- [x] Google sign-in works smoothly ✅ TESTED 2025-11-27
- [x] Welcome notification appears after sign-in ✅ TESTED 2025-11-27
- [x] User info displays correctly in header ✅ TESTED 2025-11-27
- [x] Sign-out works and shows correct UI state (sign-in button appears) ✅ TESTED 2025-11-27
- [x] Account selection prompt appears after sign-out ✅ TESTED 2025-11-27
- [x] Persists login after closing browser ✅ TESTED 2025-11-27
- [x] Works in incognito mode ✅ TESTED 2025-11-27

### Starting a Workout from Template
- [x] Can view default workout templates ✅ TESTED 2025-11-28
- [x] Can switch between default/custom template categories ✅ TESTED 2025-11-28
- [x] Can select workout template ✅ TESTED 2025-11-28
- [x] Workout starts without errors ✅ TESTED 2025-11-28
- [x] All exercises load correctly ✅ TESTED 2025-11-28
- [x] Can see exercise details (sets, reps, weights) ✅ TESTED 2025-11-28
- [x] Form videos play (if using YouTube links) ✅ TESTED 2025-11-28
- [x] No "Unsupported field value" errors for custom workouts ✅ TESTED 2025-11-28

### Starting a Custom Workout
- [x] Can create new custom workout from Workout Management ✅ TESTED 2025-11-28 (v4.11)
- [x] Custom workout starts successfully ✅ TESTED 2025-11-28 (v4.9+)
- [x] Custom workout saves with correct name (not "undefined") ✅ TESTED 2025-11-28 (v4.10+)
- [x] Custom workout appears in history with correct title ✅ TESTED 2025-11-28

### During Workout Execution
- [x] Can enter sets, reps, and weights ✅ TESTED 2025-11-27
- [x] Number keyboard appears for number inputs ✅ TESTED 2025-11-27
- [x] Can switch between lbs/kg per exercise ✅ TESTED 2025-11-27
- [x] Rest timer works and displays correctly ✅ TESTED 2025-11-27
- [x] Can add sets (+ button) ✅ TESTED 2025-11-27
- [x] Can delete sets (- button) ✅ TESTED 2025-11-27
- [x] Can add notes to exercises ✅ TESTED 2025-11-27
- [x] Progress indicator updates correctly ✅ TESTED 2025-11-27
- [x] Can pause and resume workout ✅ TESTED 2025-11-27
- [x] Can delete exercises from workout ✅ TESTED 2025-11-27
- [x] NO success notifications when adding/removing sets ✅ TESTED 2025-11-27
- [x] NO notifications when marking exercises complete ✅ TESTED 2025-11-27
- [x] Exercise history loads and displays previous performance ✅ TESTED 2025-11-27

### Completing & Canceling Workouts
- [x] Complete button works ✅ TESTED 2025-11-27
- [x] Workout saves to Firebase ✅ TESTED 2025-11-27
- [x] Appears in workout history immediately ✅ TESTED 2025-11-27
- [x] Duration calculated correctly ✅ TESTED 2025-11-27
- [x] All data persisted (sets, reps, weights, notes, units) ✅ TESTED 2025-11-27
- [x] Can cancel workout mid-session ✅ TESTED 2025-11-27
- [x] Cancelled workouts don't appear in history ✅ TESTED 2025-11-27 (v4.2+)

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
- [x] Can **copy default template to custom** (makes editable copy) ✅ TESTED 2025-11-28 (v4.12+)
- [x] Copied template appears in custom templates immediately ✅ TESTED 2025-11-28 (v4.12+)
- [x] Copied template exercises are editable (deep clone) ✅ TESTED 2025-11-28 (v4.13)
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
- [ ] Version number updated (v4.13)

## 🚨 Recent Changes to Test (v4.2-v4.19)

### v4.2: Cancel Workflow Fix
- [x] Cancel workout shows confirmation dialog ✅ TESTED 2025-11-27
- [x] Cancelled workouts don't appear in history ✅ TESTED 2025-11-27

### v4.3: Calendar Status Colors
- [x] Completed workouts show as green icons ✅ TESTED 2025-11-27
- [x] In-progress workouts show as orange icons ✅ TESTED 2025-11-27
- [ ] Cancelled workouts show as red (filtered out)
- [x] No text labels on calendar (just colored icons) ✅ TESTED 2025-11-27
- [ ] Red X for missed workout days

### v4.4: Resume & Template Fixes
- [x] Resume workout button works (not throwing error) ✅ TESTED 2025-11-27
- [x] Repeat workout uses template (not previous saved data) ✅ TESTED 2025-11-27
- [x] Deleting sets during workout doesn't affect template ✅ TESTED 2025-11-27
- [x] Next workout of same type has correct number of sets ✅ TESTED 2025-11-27

### v4.5-v4.6: Midnight & Abandoned Workout Handling
- [x] Resume banner shows for workouts started yesterday ✅ TESTED 2025-11-27
- [x] Workouts > 3 hours old auto-complete if exercises done ✅ TESTED 2025-11-28
- [ ] Workouts > 3 hours old auto-delete if empty (NEEDS TESTING)
- [x] Resume banner doesn't show for workouts > 3h old ✅ TESTED 2025-11-28

### v4.7: Resume Banner Stats
- [x] Resume banner shows actual sets completed (not 0/0) ✅ TESTED 2025-11-27
- [x] Resume banner shows time ago (minutes/hours) ✅ TESTED 2025-11-27

### v4.8: Sets Counter Accuracy
- [x] Resume banner shows "X/Y" where Y is template total (not saved total) ✅ TESTED 2025-11-28
- [x] Example: "8/24 sets" not "8/8 sets" ✅ TESTED 2025-11-28

### v4.9-v4.11: Custom Template Fixes
- [x] Custom templates load immediately after save (no refresh needed) ✅ TESTED 2025-11-28 (v4.9)
- [x] Custom workout can be started immediately ✅ TESTED 2025-11-28 (v4.9)
- [x] Exercise names display correctly (not "undefined") ✅ TESTED 2025-11-28 (v4.10)
- [x] Template selector UI refreshes after creating template ✅ TESTED 2025-11-28 (v4.11)

### v4.12-v4.13: Copy to Custom Feature
- [x] Copy to Custom saves template to Firebase ✅ TESTED 2025-11-28 (v4.12)
- [x] Copied template appears in custom templates immediately ✅ TESTED 2025-11-28 (v4.12)
- [x] Auto-switches to custom tab after copy ✅ TESTED 2025-11-28 (v4.12)
- [x] Copied exercises are fully editable (deep clone) ✅ TESTED 2025-11-28 (v4.13)

### v4.15-v4.19: UX Improvements & Template Overrides (2025-11-28)

**v4.15: In-Progress Workout Warning**
- [ ] Starting new workout when one is in progress shows confirmation dialog
- [ ] Dialog warns that current workout will be cancelled
- [ ] Choosing "Cancel" keeps current workout, doesn't start new one
- [ ] Choosing "OK" cancels old workout and starts new one
- [ ] Cancelled workout is marked as cancelled in Firebase

**v4.15: Exercise Library Button Removal**
- [ ] Exercise Library button removed from Workout Management modal
- [ ] Exercise Library still accessible from hamburger menu
- [ ] Exercise Library still accessible from template editor when adding exercises

**v4.15: Full Exercise Lists in Template Cards**
- [ ] Template cards show ALL exercises (no "and X more...")
- [ ] Exercise list is scrollable if > 5-6 exercises
- [ ] Each exercise appears as a separate line item
- [ ] Hover effect on exercise items

**v4.16: Day Selector for Templates**
- [ ] Template editor shows "Suggested Days" checkbox section
- [ ] Can select multiple days (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- [ ] Selected days highlighted with teal color
- [ ] Days save with template to Firebase
- [ ] Dashboard shows "Suggested for [Day]" section
- [ ] Only templates assigned to current day appear in suggestions
- [ ] Clicking suggested workout starts it immediately
- [ ] If no templates for today, section doesn't appear

**v4.17: Multi-Day Selector**
- [ ] Can select multiple days for same template (e.g., Tue + Fri)
- [ ] Template appears in suggestions on ALL selected days
- [ ] Example: "Legs" with Tue + Fri shows on both Tuesday and Friday

**v4.18: Suggested Title Alignment**
- [ ] "Suggested for [Day]" title is left-aligned
- [ ] Title matches alignment of other dashboard sections

**v4.19: Template Override System** (CRITICAL - NEW BEHAVIOR)
- [ ] ALL templates show Edit button (including defaults)
- [ ] Default templates show "Hide" button (eye-slash icon)
- [ ] Custom templates show "Delete" button (trash icon)
- [ ] Editing default template creates override
- [ ] Edited default disappears from defaults, appears in custom
- [ ] Original default is hidden from view
- [ ] Overridden templates show "Reset" button
- [ ] Clicking "Reset" restores original default template
- [ ] Hiding default template removes it from view
- [ ] Hidden templates can be restored with "Reset"
- [ ] Deleting custom template removes it permanently
- [ ] No more "Copy to Custom" button (replaced by Edit)

## 🧪 How to Test Template Override System (v4.19)

This is a major change - test carefully!

### Test 1: Edit Default Template
1. Go to Workout Management
2. Find a default template (e.g., "Monday - Push")
3. Click "Edit"
4. Change name to "Push Day" (remove "Monday -")
5. Add suggested days: Mon + Thu
6. Save
7. **Expected**:
   - Template disappears from defaults
   - Appears as custom template with new name
   - Shows "Reset" button
   - Original "Monday - Push" is hidden

### Test 2: Hide Default Template
1. Find a default template you don't use
2. Click "Hide" button
3. Confirm
4. **Expected**:
   - Template disappears from list
   - Can be restored later

### Test 3: Reset to Default
1. Find an edited default (has "Reset" button)
2. Click "Reset"
3. Confirm
4. **Expected**:
   - Your changes are lost
   - Original default template reappears
   - Template moves back to defaults section

### Test 4: Full Exercise List Display
1. View any template card with 5+ exercises
2. **Expected**:
   - All exercises shown (not truncated)
   - List is scrollable if long
   - No "and X more..." text

### Test 5: Multi-Day Suggestions
1. Create/edit template
2. Select Tue + Fri for suggested days
3. Save
4. Navigate to dashboard on Tuesday
5. **Expected**: Template appears in "Suggested for Tuesday"
6. Navigate to dashboard on Friday
7. **Expected**: Same template appears in "Suggested for Friday"

### Test 6: In-Progress Workout Warning
1. Start a workout
2. Try to start a different workout (don't complete first one)
3. **Expected**: Confirmation dialog appears
4. Click "Cancel"
5. **Expected**: Stays on current workout
6. Try again, click "OK"
7. **Expected**: Old workout cancelled, new workout starts

## 🧪 How to Test Auto-Delete (Empty Workout > 3h)

To test the auto-delete feature for empty abandoned workouts:

1. **Create test workout** (via Firebase Console or app):
   - Start a workout but don't add any sets
   - Set `startedAt` to 4+ hours ago
   - Make sure `completedAt` and `cancelledAt` are null/undefined
   - Make sure `exercises` object is empty or has no sets with data

2. **Expected behavior**:
   - Refresh the app
   - Resume banner should NOT appear
   - Workout should be automatically deleted from Firebase
   - Check Firebase Console - document should be gone
   - Console should log: "🗑️ Deleted abandoned empty workout: [name]"

3. **Verification**:
   - Check Firebase Console to confirm deletion
   - Check browser console for deletion log
   - Workout should not appear in history/calendar

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
