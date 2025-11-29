# 📱 Mobile Testing Checklist

Use this checklist to test Big Surf Workout Tracker on your mobile device before releasing.

## 🔧 Prerequisites

- [ ] Deployed to Firebase Hosting (https://bigsurf.fit)
- [ ] Test on actual phone (not just browser DevTools)
- [ ] Clear browser cache before testing (hard refresh)
- [ ] Current version: v4.37-timer-fix

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
- [x] Starting a workout then refreshing shows resume card ✅ TESTED 2025-11-28
- [x] Resume card shows correct workout name and time ✅ TESTED 2025-11-28 (v4.23)
- [x] Can resume workout and continue where left off ✅ TESTED 2025-11-28
- [x] Can cancel in-progress workout ✅ TESTED 2025-11-28 (renamed from "discard")

### Workout History
- [x] Calendar loads with current month ✅ TESTED 2025-11-28
- [x] Can navigate months (prev/next) ✅ TESTED 2025-11-28
- [x] Past workouts display with correct dates ✅ TESTED 2025-11-28
- [x] Workout cards show: name, date, duration, exercise count ✅ TESTED 2025-11-28
- [x] Can view workout details (expandable) ✅ TESTED 2025-11-28
- [x] Can **repeat** past workouts (starts new workout with same template) ✅ TESTED 2025-11-29 (v4.24)
- [x] Can **resume** incomplete workouts (continues in-progress workout) ✅ TESTED 2025-11-29 (v4.24)
- [x] Can delete workouts (with confirmation) ✅ TESTED 2025-11-28
- [x] Delete closes modal and returns to calendar ✅ TESTED 2025-11-29 (v4.24)
- [ ] Search/filter works - NOT IMPLEMENTED (future enhancement)
- [ ] Clear filters button works - NOT IMPLEMENTED (future enhancement)

### Manual Workout Entry
- [x] "Add Manual Workout" button opens modal ✅ Built-in
- [x] Can select past date ✅ Built-in
- [x] Can enter workout name ✅ Built-in
- [x] Can add exercises from library ✅ Built-in
- [x] Can **load template** using numbered selection ✅ Built-in
- [x] Template loads all exercises with correct sets/reps/weights ✅ Built-in
- [x] Can manually add sets to exercises ✅ Built-in
- [x] Can remove sets ✅ Built-in
- [x] Can add notes ✅ Built-in
- [x] Can mark exercises as completed ✅ Built-in
- [x] Can remove exercises ✅ Built-in
- [x] Save button works ✅ Built-in
- [x] Manual workout appears in history on correct date ✅ Built-in
- [x] Offers to save as template for custom workouts ✅ Built-in

### Workout Management (Workout Library)
- [x] "Workout Library" button opens modal ✅ v4.20 (renamed from "Manage Templates")
- [x] Unified workout list (no more default/custom tabs) ✅ v4.20
- [x] Can **copy default template to custom** (makes editable copy) ✅ TESTED 2025-11-28 (v4.12+)
- [x] Copied template appears in custom templates immediately ✅ TESTED 2025-11-28 (v4.12+)
- [x] Copied template exercises are editable (deep clone) ✅ v4.4, TESTED 2025-11-28
- [x] Can create new template ✅ v4.20
- [x] Can **edit template** (opens editor) ✅ v4.20
- [x] Can edit template name ✅ v4.20
- [x] Can add exercises to template ✅ v4.20
- [x] Can **edit template exercise** (sets, reps, weight) ✅ v4.20
- [x] Can delete exercises from template ✅ v4.20
- [ ] Can reorder exercises - NOT IMPLEMENTED
- [x] Can save template changes ✅ v4.20
- [x] Can **delete template** (with confirmation) ✅ v4.21 (delete button fix)
- [x] Can **use template** (starts workout immediately) ✅ v4.20
- [x] Duplicate exercise prevention ✅ v4.21
- [x] Auto-refresh after creating/editing ✅ v4.21
- [x] Template cards show full exercise lists ✅ v4.22
- [x] Templates sync across devices ✅ Firebase

### Exercise Library
- [x] Library modal opens (integrated, not popup window) ✅ v4.35 TESTED 2025-11-29
- [ ] All 79+ exercises load - NEEDS TESTING (v4.35 code fix)
- [ ] Search works (name, body part, equipment) - NEEDS TESTING (v4.35 code fix)
- [ ] Body part filter works - NEEDS TESTING (v4.35 code fix)
- [ ] Equipment filter works - NEEDS TESTING (v4.35 code fix)
- [x] Can select exercise in different contexts:
  - [ ] Add to manual workout - NEEDS TESTING (v4.35 code fix)
  - [ ] Add to template - NEEDS TESTING (v4.35 code fix)
  - [x] Add to active workout ✅ v4.36 TESTED 2025-11-29
- [ ] Modal closes after selection - NEEDS TESTING (v4.35 code fix)
- [ ] Create New Exercise button works from library modal - NEEDS TESTING (v4.35 code fix)

### Exercise Manager
- [ ] "Manage Exercises" section loads - NEEDS TESTING (v4.34 code fix)
- [ ] All exercises display (default + custom) - NEEDS TESTING (v4.34 code fix)
- [ ] Search works - NEEDS TESTING (v4.34 code fix)
- [ ] Body part filter works - NEEDS TESTING (v4.34 code fix)
- [ ] Equipment filter works - NEEDS TESTING (v4.34 code fix)
- [ ] Can create custom exercise - NEEDS TESTING (v4.34 code fix)
- [ ] Custom exercise **saves to Firebase** successfully - NEEDS TESTING (v4.34 code fix)
- [ ] Can edit exercises - NEEDS TESTING (v4.34 code fix)
- [ ] Can **delete custom exercises** (removes from Firebase) - NEEDS TESTING (v4.34 code fix)
- [ ] Can **delete exercise overrides** (reverts to default) - NEEDS TESTING (v4.34 code fix)
- [ ] Can **hide default exercises** (hides from library) - NEEDS TESTING (v4.34 code fix)
- [ ] Changes reflect immediately in exercise library - NEEDS TESTING (v4.34 code fix)

### Location Management
- [ ] Location selector - DISABLED (modal visibility issues, will fix later) - v4.25

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
- [x] Starting new workout when one is in progress shows confirmation dialog ✅ TESTED 2025-11-28
- [x] Dialog warns that current workout will be cancelled ✅ TESTED 2025-11-28
- [x] Choosing "Cancel" keeps current workout, doesn't start new one ✅ TESTED 2025-11-28
- [x] Choosing "OK" cancels old workout and starts new one ✅ TESTED 2025-11-28
- [x] Cancelled workout is marked as cancelled in Firebase ✅ TESTED 2025-11-28

**v4.15: Exercise Library Button Removal**
- [x] Exercise Library button removed from Workout Management modal ✅ TESTED 2025-11-28
- [x] Exercise Library still accessible from hamburger menu ✅ TESTED 2025-11-28
- [x] Exercise Library still accessible from template editor when adding exercises ✅ TESTED 2025-11-28

**v4.15: Full Exercise Lists in Template Cards**
- [x] Template cards show ALL exercises (no "and X more...") ✅ TESTED 2025-11-28
- [x] Exercise list is scrollable if > 5-6 exercises ✅ TESTED 2025-11-28
- [x] Each exercise appears as a separate line item ✅ TESTED 2025-11-28
- [x] Hover effect on exercise items ✅ TESTED 2025-11-28

**v4.16: Day Selector for Templates**
- [x] Template editor shows "Assign Days" checkbox section ✅ TESTED 2025-11-28
- [x] Can select multiple days (Mon, Tue, Wed, Thu, Fri, Sat, Sun) ✅ TESTED 2025-11-28
- [x] Selected days highlighted with teal color ✅ TESTED 2025-11-28
- [x] Days save with template to Firebase ✅ TESTED 2025-11-28
- [x] Dashboard shows "Suggested for [Day]" section ✅ TESTED 2025-11-28
- [x] Only templates assigned to current day appear in suggestions ✅ TESTED 2025-11-28
- [x] Clicking suggested workout starts it immediately ✅ TESTED 2025-11-28
- [x] If no templates for today, section doesn't appear ✅ TESTED 2025-11-28

**v4.17: Multi-Day Selector**
- [x] Can select multiple days for same template (e.g., Tue + Fri) ✅ TESTED 2025-11-28
- [x] Template appears in suggestions on ALL selected days ✅ TESTED 2025-11-28
- [x] Example: "Legs" with Tue + Fri shows on both Tuesday and Friday ✅ TESTED 2025-11-28

**v4.18: Suggested Title Alignment**
- [x] "Suggested for [Day]" title is left-aligned ✅ TESTED 2025-11-28
- [x] Title matches alignment of other dashboard sections ✅ TESTED 2025-11-28

**v4.19-v4.20: Template Override System** (Updated in v4.20)
- [x] ALL templates show Edit button (including defaults) ✅ TESTED 2025-11-28
- [x] ALL templates show Delete button (unified in v4.20) ✅ TESTED 2025-11-28
- [x] Deleting default template hides it from view ✅ TESTED 2025-11-28
- [x] Deleting custom template removes it permanently ✅ TESTED 2025-11-28
- [x] Editing default template creates override ✅ TESTED 2025-11-28
- [x] No more "Copy to Custom" button (replaced by Edit) ✅ TESTED 2025-11-28

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

## 🎯 v4.20-v4.21: Workout Library Improvements (2025-11-28)

### Test 1: Unified Workout Library
1. Navigate to "Workout Library" in sidebar (renamed from "Manage Templates")
2. **Expected**: See one unified list with ALL workouts (default + custom)
3. **Expected**: No "Default Templates" / "My Templates" tabs
4. **Expected**: No category tag (Custom/Push/Pull) displayed on cards

### Test 2: Delete Button Works on All Templates
1. Click "Delete" on any default template (e.g., "Chest - Push")
2. **Expected**: Confirmation dialog: "Delete this template? This cannot be undone."
3. Confirm deletion
4. **Expected**: Template disappears from list immediately
5. Click "Delete" on a custom template
6. **Expected**: Same behavior - deletes immediately with confirmation

### Test 3: Cancel Dialog Navigation
1. Start a workout
2. Try to start a different workout
3. Click "Cancel" on the warning dialog
4. **Expected**: Navigate back to dashboard (NOT blank page)

### Test 4: Confirm New Workout with Active One
1. Start a workout, add at least one set
2. Try to start a different workout
3. Click "OK" on the warning dialog
4. **Expected**: No errors in console
5. **Expected**: Old workout cancelled, new workout starts successfully

### Test 5: Assign Days Label
1. Create or edit a workout
2. **Expected**: Label says "Assign Days" (not "Suggested Days")
3. **Expected**: No helper text below day selector buttons

### Test 6: Duplicate Exercise Prevention
1. Create a new workout
2. Add an exercise (e.g., "Bench Press")
3. Try to add the same exercise again
4. **Expected**: Warning notification: "[Exercise] is already in this workout"
5. **Expected**: Exercise not added twice

### Test 7: Auto-Refresh After Save
1. Create a new workout with exercises
2. Click "Save"
3. **Expected**: Workout list refreshes immediately (no manual refresh needed)
4. **Expected**: New workout appears in the list

### Test 8: Edit Custom Workout with Days
1. Edit an existing custom workout
2. Change the assigned days (check/uncheck boxes)
3. Click "Save"
4. **Expected**: No Firebase errors in console
5. **Expected**: Days saved correctly

### Test 9: Silent Notification Fix
1. During workout, complete a set to trigger PR notification
2. Check browser console
3. **Expected**: No "Silent notifications must not specify vibration patterns" error

## 🎯 v4.23-v4.24: Resume & UI Improvements (2025-11-29)

### v4.23: Resume Card Fixes
- [x] Resume card shows correct workout name (not "Current Workout") ✅ TESTED 2025-11-29
- [x] "Start Fresh" renamed to "Cancel Workout" ✅ TESTED 2025-11-29

### v4.24: Workout Page UI Improvements
- [x] Completed exercises show green border (not collapsed) ✅ TESTED 2025-11-29
- [x] Completed exercises show full content (sets, reps, buttons visible) ✅ TESTED 2025-11-29
- [x] "Add Exercise" button moved to header (next to Cancel/Finish) ✅ TESTED 2025-11-29
- [x] Resume button properly resumes workout (doesn't cancel it) ✅ TESTED 2025-11-29
- [x] Delete/Repeat buttons close modal after confirmation ✅ TESTED 2025-11-29

### Test 1: Completed Exercise Display
1. Start a workout
2. Complete all sets for one exercise
3. **Expected**: Exercise card has green border
4. **Expected**: Exercise card shows full content (not collapsed)
5. **Expected**: Edit/Delete buttons still visible

### Test 2: Add Exercise Button Location
1. Start a workout
2. **Expected**: "Add Exercise" button visible in header with Cancel/Finish
3. Click "Add Exercise"
4. **Expected**: Exercise library opens

### Test 3: Resume Today's Workout
1. Start a workout, complete some sets
2. Go to Workout History calendar
3. Click on today's workout
4. Click "Resume"
5. **Expected**: Workout resumes with your sets preserved (no cancel prompt)

### Test 4: Modal Close After Actions
1. Go to Workout History
2. Click on any workout
3. Click "Delete" → Confirm
4. **Expected**: Modal closes, returns to calendar
5. Click another workout → Click "Repeat" → Confirm
6. **Expected**: Modal closes, starts new workout

## 🎯 v4.25: Bug Fixes (2025-11-29)

### v4.25: Template and Startup Fixes
- [x] Suggested workouts filter out hidden/deleted templates ✅ TESTED 2025-11-29
- [x] Workout not found error shows user-friendly notification ✅ TESTED 2025-11-29
- [ ] Location selector - DISABLED (modal visibility issues, will fix later)

## 🎯 v4.33: Console Log Cleanup (2025-11-29)

### v4.33: Code Cleanup
- [x] Browser console shows only errors (no verbose logs) ✅ TESTED 2025-11-29
- [x] All functionality still works after log removal ✅ TESTED 2025-11-29
- [x] Error messages still show with ❌ emoji prefix ✅ TESTED 2025-11-29

### Test 1: Clean Console
1. Open browser DevTools console
2. Navigate through app (dashboard, start workout, history)
3. **Expected**: Console shows only errors, no verbose "Starting workout...", "Loading..." logs
4. **Expected**: Error messages still appear when things fail

## 🎯 v4.34-v4.37: Exercise Manager & CSS Fixes (2025-11-29)

### v4.34: Exercise Manager CRUD Operations Fixed (CODE CHANGES - NEEDS TESTING)
- [ ] saveExercise correctly handles editing vs creating - CODE FIX
- [ ] deleteExercise uses correct Firebase method - CODE FIX
- [ ] Custom exercises save to Firebase successfully - CODE FIX
- [ ] Edit exercises works properly - CODE FIX
- [ ] Delete custom exercises works - CODE FIX
- [ ] Hide default exercises works - CODE FIX
- [ ] Revert overrides to default works - CODE FIX

### v4.35: Exercise Library Modal Fixes (CODE CHANGES - NEEDS TESTING)
- [x] Library modal opens correctly from all contexts ✅ TESTED 2025-11-29
- [ ] Create New Exercise button reuses add-exercise-modal - CODE FIX
- [ ] Modal z-index layering fixed (library z-500, add-exercise z-600) - CODE FIX
- [ ] Exercise selection works for template editing - CODE FIX

### v4.36: CSS Reorganization & Z-Index Standardization (CODE CHANGES)
- [x] CSS backup saved to style.css.backup ✅ DONE
- [x] Z-index scale standardized (0-900 range) ✅ CODE FIX
- [x] Removed ~50 unnecessary !important declarations ✅ CODE FIX
- [ ] Modal stacking context fixed - NEEDS VISUAL TESTING
- [x] Add exercise from active workout works ✅ TESTED 2025-11-29

### v4.37: Timer Duplicate Bug Fix
- [x] Starting new workout after cancel no longer has timer flickering ✅ TESTED 2025-11-29
- [x] clearInterval called before new setInterval ✅ CODE FIX
- [x] Timer shows correct elapsed time ✅ TESTED 2025-11-29

### Known Issues Remaining
- [ ] Exercise Manager/Library UI needs visual polish
- [ ] Filters need testing
- [ ] Edit functionality needs testing

### Test 1: Exercise Manager CRUD
1. Open "Manage Exercises" from hamburger menu
2. Click "Add New Exercise"
3. Fill form and save
4. **Expected**: Exercise appears in list, saved to Firebase
5. Click edit on the new exercise
6. Change name, save
7. **Expected**: Name updates immediately
8. Click delete
9. **Expected**: Exercise removed from list and Firebase

### Test 2: Add Exercise to Active Workout
1. Start a workout
2. Click "Add Exercise" button in header
3. **Expected**: Exercise library opens
4. Select an exercise
5. **Expected**: Exercise added to workout, library closes

### Test 3: Create Exercise from Library Modal
1. Start a workout
2. Click "Add Exercise"
3. Click "Create New Exercise"
4. **Expected**: Add exercise modal appears over library
5. Fill form and save
6. **Expected**: New exercise created, modal closes

### Test 4: Timer Stability
1. Start a workout, wait 2 minutes
2. Cancel workout (confirm)
3. Start a new workout
4. **Expected**: Timer starts from 0:00, no flickering between old/new values

## 🎯 v4.38-v4.39: iOS Background Push Notifications (2025-11-29)

### Status: NOT WORKING - iOS Platform Limitation

**What Was Attempted:**
- Firebase Cloud Functions for server-side push notifications
- Web Push API with VAPID keys (more reliable than FCM on iOS Safari)
- Service worker consolidation (removed duplicate `firebase-messaging-sw.js`)

**Current Behavior:**
- Notifications only appear when returning to the app (foreground)
- Background/lock screen notifications do NOT work on iOS PWA

**Why It Doesn't Work (iOS Limitations):**
- iOS does not support reliable background push for PWAs
- Push subscriptions can get "lost" on iOS 17+ after some time
- iOS aggressively suspends PWAs when backgrounded
- This is an Apple platform limitation, not a code bug

**Infrastructure Still In Place:**
- [x] Firebase Blaze plan enabled
- [x] Cloud Functions deployed (`scheduleRestNotification`, `sendDueNotifications`)
- [x] VAPID keys configured (Web Push API)
- [x] Service worker handles push events
- [x] Scheduled function runs every minute

**If Apple Improves PWA Push Support:**
The server-side infrastructure is ready - it should start working automatically.

**For True Background Notifications:**
Would require a native iOS app (Swift/React Native/Capacitor)

### Cost Estimate (Blaze Plan)
For a personal workout app with ~5 workouts/week:
- **Cloud Functions**: ~150 invocations/month (FREE tier: 2M/month)
- **Firestore**: ~500 reads/month (FREE tier: 50K/day)
- **Estimated monthly cost: $0.00** (stays within free tier)

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
