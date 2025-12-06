// Debug Utilities Module - core/debug-utilities.js
// Contains debugging functions and temporary fixes - easy to remove when issues are resolved

import { AppState } from './app-state.js';
import { showNotification } from '../ui/ui-helpers.js';
import { loadExerciseHistory } from '../data/data-manager.js';

// ===================================================================
// DEBUG FUNCTIONS
// ===================================================================

export function debugManualWorkoutDate() {
    console.log('🔍 DEBUGGING MANUAL WORKOUT DATE ISSUE:');
    
    // Get current manual workout from the manual workout module
    const { getCurrentManualWorkout } = import('../features/manual-workout.js').then(module => {
        const currentManualWorkout = module.getCurrentManualWorkout();
        console.log('currentManualWorkout.date:', currentManualWorkout.date);
    });
    
    const dateInput = document.getElementById('manual-workout-date');
    console.log('Date input value:', dateInput?.value);
    
    const selectedDate = dateInput?.value;
    if (selectedDate) {
        console.log('Selected date string:', selectedDate);
        console.log('Date object from string:', new Date(selectedDate));
        console.log('ISO string:', new Date(selectedDate).toISOString());
        console.log('Local date string:', new Date(selectedDate).toLocaleDateString());
        
        // Check timezone offset
        const date = new Date(selectedDate);
        console.log('Timezone offset (minutes):', date.getTimezoneOffset());
        console.log('UTC date:', date.toUTCString());
    }
}

export async function debugFirebaseWorkoutDates() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return;
    }

    try {
        const { db, collection, getDocs } = await import('../data/firebase-config.js');

        const workoutsRef = collection(db, "users", AppState.currentUser.uid, "workouts");
        const querySnapshot = await getDocs(workoutsRef);

        console.log('🔍 FIREBASE WORKOUT DATES DEBUG:');
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log(`Document ID: ${doc.id}, Data date: ${data.date}, Workout: ${data.workoutType}`);
        });

    } catch (error) {
        console.error('Error debugging Firebase dates:', error);
    }
}

export async function debugWeeklyStats() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return;
    }

    try {
        const { db, collection, getDocs, query, where, orderBy } = await import('../data/firebase-config.js');

        const today = new Date();
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

        console.log('🔍 WEEKLY STATS DEBUG:');
        console.log('Today:', today.toISOString().split('T')[0], '(' + today.toLocaleDateString('en-US', {weekday: 'long'}) + ')');
        console.log('Start of week:', startOfWeekStr, '(' + startOfWeek.toLocaleDateString('en-US', {weekday: 'long'}) + ')');
        console.log('Query filter: date >=', startOfWeekStr);

        const workoutsRef = collection(db, 'users', AppState.currentUser.uid, 'workouts');
        // Query by date field (workout date), not completedAt
        const q = query(
            workoutsRef,
            where('date', '>=', startOfWeekStr),
            orderBy('date', 'desc')
        );

        const snapshot = await getDocs(q);
        const workoutDays = new Set();

        console.log('\n📋 Workouts found (date >= ' + startOfWeekStr + '):');
        snapshot.forEach(doc => {
            const data = doc.data();
            const completed = data.completedAt ? '✓' : '⏳ INCOMPLETE';
            const cancelled = data.cancelledAt ? ' ❌ CANCELLED' : '';
            console.log(`  ${completed}${cancelled} Date: ${data.date}, Type: ${data.workoutType}`);

            // Only count completed, non-cancelled workouts
            if (data.completedAt && !data.cancelledAt && data.date) {
                workoutDays.add(data.date);
            }
        });

        console.log('\n📊 Unique workout days:', Array.from(workoutDays).sort());
        console.log('Total unique days:', workoutDays.size);

    } catch (error) {
        console.error('Error debugging weekly stats:', error);
    }
}

export function forceCheckHistoryData() {
    console.log('🔍 Force checking history data...');
    console.log('window.workoutHistory:', window.workoutHistory);
    
    // Check both references
    if (window.workoutHistory) {
        console.log('window.workoutHistory.currentHistory:', window.workoutHistory.currentHistory?.length);
        console.log('window.workoutHistory.filteredHistory:', window.workoutHistory.filteredHistory?.length);
    }
    
    console.log('AppState.currentUser:', AppState.currentUser?.displayName);
    console.log('AppState.workoutPlans length:', AppState.workoutPlans?.length);
    console.log('AppState.exerciseDatabase length:', AppState.exerciseDatabase?.length);
}

export function testHistoryFilters() {
    console.log('🧪 Testing history filters...');
    
    // Find relevant elements
    const searchInput = document.getElementById('workout-search');
    const startDate = document.getElementById('history-start-date');
    const endDate = document.getElementById('history-end-date');
    const filterBtns = document.querySelectorAll('.history-filter-btn');
    
    console.log('Search input found:', !!searchInput);
    console.log('Date inputs found:', !!startDate, !!endDate);
    console.log('Filter buttons found:', filterBtns.length);
    console.log('Workout history object:', !!window.workoutHistory);
    
    if (window.workoutHistory && window.workoutHistory.currentHistory) {
        console.log('Current history length:', window.workoutHistory.currentHistory.length);
        console.log('Filtered history length:', window.workoutHistory.filteredHistory?.length || 'undefined');
    }
    
    // Test a filter
    if (filterBtns.length > 0) {
        console.log('Testing filter button click...');
        filterBtns[1]?.click(); // Click second filter button
    }
}

// ===================================================================
// EMERGENCY FIXES (TEMPORARY)
// ===================================================================

export function fixWorkoutHistoryReference() {
    console.log('🔧 Attempting to fix workout history reference...');
    
    // Check if the data loaded into the workout-history.js module internally
    if (window.workoutHistory && window.workoutHistory.currentHistory.length === 0) {
        console.log('🔄 Forcing history reload on the correct object...');
        
        // Force reload history on the window object
        window.workoutHistory.loadHistory().then(() => {
            console.log('✅ History reloaded on window object');
            console.log('Current history length:', window.workoutHistory.currentHistory.length);
        });
    }
}

export function emergencyFixFilters() {
    console.log('🚨 Emergency filter fix - checking all references...');
    
    // Force reload data into the right object
    if (window.workoutHistory && window.workoutHistory.loadHistory) {
        window.workoutHistory.loadHistory().then(() => {
            // Copy the data to window reference if needed
            if (window.workoutHistory && window.workoutHistory.currentHistory.length > 0) {
                console.log('✅ Emergency fix: Data properly loaded');
                console.log('History lengths:', window.workoutHistory.currentHistory.length);
            }
        });
    }
    
    // Also check if elements exist
    const historySection = document.getElementById('workout-history-section');
    const searchInput = document.getElementById('workout-search');
    
    console.log('History section exists:', !!historySection);
    console.log('Search input exists:', !!searchInput);
    
    if (!historySection) {
        console.warn('⚠️ History section not found - may need to create it');
    }
    
    if (!searchInput) {
        console.warn('⚠️ Search input not found - may need to create it');
    }
}

// ===================================================================
// EXERCISE HISTORY DEBUGGING
// ===================================================================

export async function debugExerciseHistory(exerciseName) {
    console.log(`🔍 Debugging exercise history for: ${exerciseName}`);
    
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return;
    }
    
    try {
        await loadExerciseHistory(exerciseName, 0, AppState);
        console.log('✅ Exercise history loaded successfully');
    } catch (error) {
        console.error('❌ Error loading exercise history:', error);
        showNotification('Error loading exercise history', 'error');
    }
}

export function debugAppState() {
    console.log('🔍 DEBUGGING APP STATE:');
    console.log('Current User:', AppState.currentUser?.displayName || 'Not signed in');
    console.log('Current Workout:', AppState.currentWorkout?.day || 'None');
    console.log('Workout Plans:', AppState.workoutPlans?.length || 0);
    console.log('Exercise Database:', AppState.exerciseDatabase?.length || 0);
    console.log('Global Unit:', AppState.globalUnit);
    console.log('Exercise Units:', AppState.exerciseUnits);
    console.log('Saved Data:', Object.keys(AppState.savedData || {}).length, 'keys');
    console.log('Focused Exercise Index:', AppState.focusedExerciseIndex);
    
    // Check timers
    console.log('Global Rest Timer:', !!AppState.globalRestTimer);
    console.log('Workout Duration Timer:', !!AppState.workoutDurationTimer);
    
    // Check workout progress
    if (AppState.currentWorkout) {
        console.log('Workout Start Time:', AppState.workoutStartTime);
        console.log('Has Progress:', AppState.hasWorkoutProgress());
    }
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// ===================================================================
// PERFORMANCE DEBUGGING
// ===================================================================

export function measurePerformance(name, func) {
    return async function(...args) {
        const start = performance.now();
        const result = await func.apply(this, args);
        const end = performance.now();
        console.log(`⏱️ ${name} took ${(end - start).toFixed(2)}ms`);
        return result;
    };
}

export function logMemoryUsage() {
    if (performance.memory) {
        console.log('💾 Memory Usage:');
        console.log(`Used: ${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Total: ${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Limit: ${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`);
    } else {
        console.log('💾 Memory usage not available in this browser');
    }
}

// ===================================================================
// FIREBASE DEBUGGING
// ===================================================================

export async function debugFirebaseConnection() {
    console.log('🔍 Testing Firebase connection...');
    
    try {
        const { db, doc, getDoc } = await import('../data/firebase-config.js');
        
        // Try to read a test document
        const testDoc = doc(db, 'test', 'connection');
        const docSnap = await getDoc(testDoc);
        
        console.log('✅ Firebase connection successful');
        console.log('Test doc exists:', docSnap.exists());
        
    } catch (error) {
        console.error('❌ Firebase connection failed:', error);
        showNotification('Firebase connection issue detected', 'warning');
    }
}

export async function debugUserPermissions() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in for permissions check');
        return;
    }
    
    console.log('🔍 Testing user permissions...');
    
    try {
        const { db, doc, setDoc, getDoc } = await import('../data/firebase-config.js');
        
        // Test write permission
        const testDoc = doc(db, "users", AppState.currentUser.uid, "test", "permissions");
        await setDoc(testDoc, { test: true, timestamp: new Date().toISOString() });
        
        // Test read permission
        const docSnap = await getDoc(testDoc);
        
        if (docSnap.exists()) {
            console.log('✅ User permissions working correctly');
            showNotification('Firebase permissions OK', 'success');
        } else {
            console.log('❌ Document not found after write');
            showNotification('Permission test failed', 'error');
        }
        
    } catch (error) {
        console.error('❌ Permission test failed:', error);
        showNotification('User permission issue detected', 'warning');
    }
}

// ===================================================================
// LOCAL STORAGE DEBUGGING
// ===================================================================

export function debugLocalStorage() {
    console.log('🔍 Debugging local storage...');
    
    try {
        // Check local storage availability
        const testKey = 'big-surf-test';
        localStorage.setItem(testKey, 'test-value');
        const testValue = localStorage.getItem(testKey);
        localStorage.removeItem(testKey);
        
        if (testValue === 'test-value') {
            console.log('✅ Local storage working correctly');
        } else {
            console.log('❌ Local storage test failed');
        }
        
        // Check current storage usage
        let totalSize = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage[key].length + key.length;
            }
        }
        
        console.log(`📦 Local storage usage: ${(totalSize / 1024).toFixed(2)} KB`);
        console.log(`📦 Items in storage: ${localStorage.length}`);
        
    } catch (error) {
        console.error('❌ Local storage error:', error);
    }
}

// ===================================================================
// NETWORK DEBUGGING
// ===================================================================

export async function debugNetworkConnectivity() {
    console.log('🔍 Testing network connectivity...');
    
    try {
        // Test basic internet connectivity
        const response = await fetch('https://www.google.com/favicon.ico', { 
            method: 'HEAD',
            mode: 'no-cors'
        });
        
        console.log('✅ Basic internet connectivity: OK');
        
        // Test Firebase hosting connectivity
        try {
            const firebaseTest = await fetch('./data/exercises.json');
            if (firebaseTest.ok) {
                console.log('✅ Firebase hosting connectivity: OK');
            } else {
                console.log('❌ Firebase hosting connectivity: Failed');
            }
        } catch (firebaseError) {
            console.log('❌ Firebase hosting connectivity: Error', firebaseError);
        }
        
    } catch (error) {
        console.error('❌ Network connectivity test failed:', error);
        showNotification('Network connectivity issues detected', 'warning');
    }
}

// ===================================================================
// ERROR LOGGING AND REPORTING
// ===================================================================

export function setupErrorLogging() {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
        console.error('🚨 Unhandled Error:', {
            message: event.message,
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
            error: event.error
        });
        
        // Show user-friendly message for critical errors
        if (event.message.includes('Firebase') || event.message.includes('auth')) {
            showNotification('Connection issue detected. Please refresh the page.', 'error');
        }
    });
    
    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        console.error('🚨 Unhandled Promise Rejection:', event.reason);
        
        // Show user-friendly message
        if (event.reason?.message?.includes('Firebase')) {
            showNotification('Database connection issue. Please try again.', 'error');
        }
    });
    
    console.log('✅ Error logging setup complete');
}

// ===================================================================
// CLEANUP UTILITIES
// ===================================================================

export function cleanupTempData() {
    console.log('🧹 Cleaning up temporary data...');
    
    // Clear any temporary global variables
    if (window.showingProgressPrompt) {
        window.showingProgressPrompt = false;
    }
    
    // Clear any debug intervals or timeouts
    // (This would clear any debug timers that might be running)
    
    console.log('✅ Temporary data cleanup complete');
}

export function resetAppState() {
    console.log('🔄 Resetting application state...');
    
    AppState.reset();
    
    // Clear any global state
    window.inProgressWorkout = null;
    window.showingProgressPrompt = false;
    
    // Reset UI to initial state
    const sections = ['workout-selector', 'active-workout', 'workout-management', 'workout-history-section'];
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            section.classList.add('hidden');
        }
    });
    
    // Show workout selector
    const workoutSelector = document.getElementById('workout-selector');
    if (workoutSelector) {
        workoutSelector.classList.remove('hidden');
    }
    
    console.log('✅ Application state reset complete');
}

// ===================================================================
// EXPORT ALL DEBUG FUNCTIONS FOR EASY REMOVAL
// ===================================================================

// This makes it easy to see all debug functions at a glance
export const DEBUG_FUNCTIONS = {
    // Core debug functions
    debugManualWorkoutDate,
    debugFirebaseWorkoutDates,
    forceCheckHistoryData,
    testHistoryFilters,
    debugAppState,
    debugExerciseHistory,
    
    // Emergency fixes
    fixWorkoutHistoryReference,
    emergencyFixFilters,
    
    // Utilities
    debounce,
    throttle,
    measurePerformance,
    logMemoryUsage,
    
    // Firebase debugging
    debugFirebaseConnection,
    debugUserPermissions,
    
    // System debugging
    debugLocalStorage,
    debugNetworkConnectivity,
    
    // Error handling
    setupErrorLogging,
    
    // Cleanup
    cleanupTempData,
    resetAppState
};

// ===================================================================
// QUICK DEBUG RUNNER
// ===================================================================

export function runAllDebugChecks() {
    console.log('🔍 Running comprehensive debug checks...');

    debugAppState();
    debugLocalStorage();
    forceCheckHistoryData();
    logMemoryUsage();

    if (AppState.currentUser) {
        debugFirebaseConnection();
        debugUserPermissions();
    }

    console.log('✅ Debug checks complete - see above for results');
}

// ===================================================================
// DUPLICATE EXERCISE CLEANUP
// ===================================================================

/**
 * Scan for duplicate exercises and show what would be affected
 * Does NOT delete anything - just reports
 */
export async function scanDuplicateExercises() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return;
    }

    console.log('🔍 Scanning for duplicate exercises...\n');

    try {
        const { db, collection, getDocs } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        // Collect exercises from all sources
        const allExercises = [];

        // 1. Custom exercises
        const customRef = collection(db, "users", uid, "customExercises");
        const customSnapshot = await getDocs(customRef);
        customSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allExercises.push({
                id: docSnap.id,
                name: data.name || '',
                collection: 'customExercises',
                data: data
            });
        });

        // 2. Exercise overrides
        const overridesRef = collection(db, "users", uid, "exerciseOverrides");
        const overridesSnapshot = await getDocs(overridesRef);
        overridesSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allExercises.push({
                id: docSnap.id,
                name: data.name || data.originalName || '',
                collection: 'exerciseOverrides',
                data: data
            });
        });

        // 3. Default exercises
        const defaultRef = collection(db, "exercises");
        const defaultSnapshot = await getDocs(defaultRef);
        defaultSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.name) {
                allExercises.push({
                    id: docSnap.id,
                    name: data.name,
                    collection: 'exercises (default)',
                    data: data
                });
            }
        });

        // Group by name (case-insensitive)
        const exercisesByName = {};
        allExercises.forEach(ex => {
            const name = (ex.name || '').toLowerCase();
            if (!name) return;
            if (!exercisesByName[name]) {
                exercisesByName[name] = [];
            }
            exercisesByName[name].push(ex);
        });

        // Find duplicates
        const duplicates = [];
        for (const [name, exercises] of Object.entries(exercisesByName)) {
            if (exercises.length > 1) {
                duplicates.push({ name, exercises });
            }
        }

        if (duplicates.length === 0) {
            console.log('✅ No duplicates found!');
            return { duplicates: [] };
        }

        console.log(`Found ${duplicates.length} exercise(s) with duplicates:\n`);
        duplicates.forEach(({ name, exercises }) => {
            console.log(`📋 "${name}" has ${exercises.length} entries:`);
            exercises.forEach(ex => {
                console.log(`   - ID: ${ex.id}`);
                console.log(`     Collection: ${ex.collection}`);
                console.log(`     Equipment: ${ex.data.equipment || 'none'}`);
                console.log('');
            });
        });

        console.log('\n💡 To merge duplicates safely, run: mergeDuplicateExercises()');
        return { duplicates };

    } catch (error) {
        console.error('❌ Error scanning:', error);
        throw error;
    }
}

/**
 * Merge duplicate exercises - updates all workout history to use one ID, then removes duplicates
 */
export async function mergeDuplicateExercises() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return;
    }

    console.log('🔄 Merging duplicate exercises...\n');

    try {
        const { db, collection, getDocs, deleteDoc, doc, updateDoc } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        // First, get all exercises grouped by name
        const allExercises = [];

        // Custom exercises
        const customRef = collection(db, "users", uid, "customExercises");
        const customSnapshot = await getDocs(customRef);
        customSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allExercises.push({
                id: docSnap.id,
                name: data.name || '',
                collection: 'customExercises',
                data: data,
                lastUpdated: data.lastUpdated || data.createdAt || '1970-01-01'
            });
        });

        // Exercise overrides
        const overridesRef = collection(db, "users", uid, "exerciseOverrides");
        const overridesSnapshot = await getDocs(overridesRef);
        overridesSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allExercises.push({
                id: docSnap.id,
                name: data.name || data.originalName || '',
                collection: 'exerciseOverrides',
                data: data,
                lastUpdated: data.lastUpdated || data.overrideCreated || '1970-01-01'
            });
        });

        // Group by name
        const exercisesByName = {};
        allExercises.forEach(ex => {
            const name = (ex.name || '').toLowerCase();
            if (!name) return;
            if (!exercisesByName[name]) {
                exercisesByName[name] = [];
            }
            exercisesByName[name].push(ex);
        });

        // Get all workouts to update references
        const workoutsRef = collection(db, "users", uid, "workouts");
        const workoutsSnapshot = await getDocs(workoutsRef);

        let mergeCount = 0;
        let workoutsUpdated = 0;

        for (const [name, exercises] of Object.entries(exercisesByName)) {
            if (exercises.length <= 1) continue;

            console.log(`\n📋 Merging "${name}" (${exercises.length} entries)...`);

            // Sort by lastUpdated - keep the newest
            exercises.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
            const keepExercise = exercises[0];
            const duplicatesToRemove = exercises.slice(1);

            console.log(`   ✓ Keeping: ${keepExercise.id} (${keepExercise.collection})`);

            // Update workout history references
            for (const duplicate of duplicatesToRemove) {
                console.log(`   🔄 Merging: ${duplicate.id} into ${keepExercise.id}`);

                // Check each workout for references to this duplicate
                for (const workoutDoc of workoutsSnapshot.docs) {
                    const workoutData = workoutDoc.data();
                    let needsUpdate = false;
                    const updates = {};

                    // Check exerciseNames
                    if (workoutData.exerciseNames) {
                        for (const [key, exName] of Object.entries(workoutData.exerciseNames)) {
                            if (exName?.toLowerCase() === name) {
                                // This workout uses this exercise - no ID update needed
                                // but good to know it exists
                            }
                        }
                    }

                    // Check originalWorkout.exercises for equipment references
                    if (workoutData.originalWorkout?.exercises) {
                        const updatedExercises = workoutData.originalWorkout.exercises.map(ex => {
                            // If this exercise matches the duplicate, merge equipment settings from keepExercise
                            if (ex.machine?.toLowerCase() === name) {
                                // Keep the workout's existing data, it's fine
                            }
                            return ex;
                        });
                    }
                }

                // Delete the duplicate
                const docRef = doc(db, "users", uid, duplicate.collection, duplicate.id);
                await deleteDoc(docRef);
                console.log(`   🗑️ Removed duplicate: ${duplicate.id}`);
                mergeCount++;
            }
        }

        if (mergeCount === 0) {
            console.log('\n✅ No duplicates to merge');
            showNotification('No duplicates found', 'info');
        } else {
            console.log(`\n✅ Merged ${mergeCount} duplicate(s)`);
            showNotification(`Merged ${mergeCount} duplicate exercise(s)`, 'success');
        }

        return { merged: mergeCount };

    } catch (error) {
        console.error('❌ Error merging:', error);
        showNotification('Error merging duplicates', 'error');
        throw error;
    }
}

/**
 * Find and remove duplicate exercises across ALL collections
 * Checks: customExercises, exerciseOverrides, and default exercises
 * Keeps the most recently updated version
 */
export async function cleanupDuplicateExercises() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return;
    }

    console.log('🧹 Scanning for duplicate exercises across all collections...');

    try {
        const { db, collection, getDocs, deleteDoc, doc } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        // Collect exercises from all sources
        const allExercises = [];

        // 1. Custom exercises
        const customRef = collection(db, "users", uid, "customExercises");
        const customSnapshot = await getDocs(customRef);
        customSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allExercises.push({
                id: docSnap.id,
                name: data.name || '',
                collection: 'customExercises',
                data: data,
                lastUpdated: data.lastUpdated || data.createdAt || '1970-01-01'
            });
        });
        console.log(`  📦 Found ${customSnapshot.size} custom exercises`);

        // 2. Exercise overrides
        const overridesRef = collection(db, "users", uid, "exerciseOverrides");
        const overridesSnapshot = await getDocs(overridesRef);
        overridesSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allExercises.push({
                id: docSnap.id,
                name: data.name || data.originalName || '',
                collection: 'exerciseOverrides',
                data: data,
                lastUpdated: data.lastUpdated || data.overrideCreated || '1970-01-01'
            });
        });
        console.log(`  📦 Found ${overridesSnapshot.size} exercise overrides`);

        // 3. Default exercises (global) - just for reference, we won't delete these
        const defaultRef = collection(db, "exercises");
        const defaultSnapshot = await getDocs(defaultRef);
        const defaultNames = new Set();
        defaultSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.name) {
                defaultNames.add(data.name.toLowerCase());
            }
        });
        console.log(`  📦 Found ${defaultSnapshot.size} default exercises`);

        // Group by name (case-insensitive)
        const exercisesByName = {};
        allExercises.forEach(ex => {
            const name = (ex.name || '').toLowerCase();
            if (!name) return;
            if (!exercisesByName[name]) {
                exercisesByName[name] = [];
            }
            exercisesByName[name].push(ex);
        });

        // Find and resolve duplicates
        let duplicatesFound = 0;
        let duplicatesRemoved = 0;

        for (const [name, exercises] of Object.entries(exercisesByName)) {
            // Check if this name exists in defaults
            const hasDefault = defaultNames.has(name);

            if (exercises.length > 1 || (exercises.length === 1 && hasDefault)) {
                // Multiple user entries OR user entry duplicating a default
                console.log(`\n📋 "${name}": ${exercises.length} user entries${hasDefault ? ' + 1 default' : ''}`);

                if (hasDefault && exercises.length >= 1) {
                    // If there's a default, user entries might be overrides or duplicates
                    // Keep the override if it exists, remove plain custom duplicates
                    const overrides = exercises.filter(e => e.collection === 'exerciseOverrides');
                    const customs = exercises.filter(e => e.collection === 'customExercises');

                    if (overrides.length > 0 && customs.length > 0) {
                        // Have both override and custom - remove the custom duplicates
                        console.log(`  ⚠️ Has override AND custom entries - removing customs`);
                        for (const custom of customs) {
                            console.log(`  🗑️ Removing custom duplicate: ${custom.id}`);
                            const docRef = doc(db, "users", uid, "customExercises", custom.id);
                            await deleteDoc(docRef);
                            duplicatesRemoved++;
                            duplicatesFound++;
                        }
                    }

                    // Handle multiple overrides
                    if (overrides.length > 1) {
                        overrides.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
                        for (let i = 1; i < overrides.length; i++) {
                            console.log(`  🗑️ Removing duplicate override: ${overrides[i].id}`);
                            const docRef = doc(db, "users", uid, "exerciseOverrides", overrides[i].id);
                            await deleteDoc(docRef);
                            duplicatesRemoved++;
                            duplicatesFound++;
                        }
                    }

                    // Handle multiple customs (no override)
                    if (overrides.length === 0 && customs.length > 1) {
                        customs.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
                        for (let i = 1; i < customs.length; i++) {
                            console.log(`  🗑️ Removing duplicate custom: ${customs[i].id}`);
                            const docRef = doc(db, "users", uid, "customExercises", customs[i].id);
                            await deleteDoc(docRef);
                            duplicatesRemoved++;
                            duplicatesFound++;
                        }
                    }
                } else {
                    // No default - just handle duplicates within user collections
                    exercises.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));

                    for (let i = 1; i < exercises.length; i++) {
                        const ex = exercises[i];
                        console.log(`  🗑️ Removing duplicate from ${ex.collection}: ${ex.id}`);
                        const docRef = doc(db, "users", uid, ex.collection, ex.id);
                        await deleteDoc(docRef);
                        duplicatesRemoved++;
                        duplicatesFound++;
                    }
                }
            }
        }

        if (duplicatesFound === 0) {
            console.log('\n✅ No duplicates found');
            showNotification('No duplicate exercises found', 'info');
        } else {
            console.log(`\n✅ Removed ${duplicatesRemoved} duplicate(s)`);
            showNotification(`Removed ${duplicatesRemoved} duplicate exercise(s)`, 'success');
        }

        return { found: duplicatesFound, removed: duplicatesRemoved };

    } catch (error) {
        console.error('❌ Error cleaning up duplicates:', error);
        showNotification('Error cleaning up duplicates', 'error');
        throw error;
    }
}

// ===================================================================
// WORKOUT HISTORY EDITOR
// ===================================================================

/**
 * Get all workouts with equipment/location data for editing
 * Returns array of workout summaries with editable fields
 */
export async function getWorkoutHistoryForEditing() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return [];
    }

    console.log('📋 Loading workout history for editing...\n');

    try {
        const { db, collection, getDocs, query, orderBy } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        const workoutsRef = collection(db, "users", uid, "workouts");
        const q = query(workoutsRef, orderBy("date", "desc"));
        const snapshot = await getDocs(q);

        const workouts = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const exercises = [];

            // Extract exercise data
            if (data.exercises) {
                Object.entries(data.exercises).forEach(([key, ex]) => {
                    exercises.push({
                        key,
                        name: ex.name || 'Unknown',
                        equipment: ex.equipment || null,
                        equipmentLocation: ex.equipmentLocation || null,
                        sets: ex.sets?.length || 0
                    });
                });
            }

            // Also check originalWorkout.exercises for equipment
            if (data.originalWorkout?.exercises) {
                data.originalWorkout.exercises.forEach((ex, idx) => {
                    const key = `exercise_${idx}`;
                    const existing = exercises.find(e => e.key === key);
                    if (existing) {
                        // Merge equipment from originalWorkout if not already set
                        if (!existing.equipment && ex.equipment) {
                            existing.equipment = ex.equipment;
                        }
                        if (!existing.equipmentLocation && ex.equipmentLocation) {
                            existing.equipmentLocation = ex.equipmentLocation;
                        }
                    }
                });
            }

            workouts.push({
                docId: docSnap.id,
                date: data.date,
                workoutType: data.workoutType,
                location: data.location || null,
                exercises,
                status: data.completedAt ? 'completed' : (data.cancelledAt ? 'cancelled' : 'in-progress')
            });
        });

        console.log(`Found ${workouts.length} workouts\n`);

        // Display summary
        workouts.slice(0, 10).forEach((w, i) => {
            console.log(`${i + 1}. [${w.date}] ${w.workoutType}`);
            console.log(`   Location: ${w.location || '(none)'}`);
            w.exercises.forEach(ex => {
                console.log(`   - ${ex.name}: ${ex.equipment || '(no equipment)'} @ ${ex.equipmentLocation || '(no location)'}`);
            });
            console.log('');
        });

        if (workouts.length > 10) {
            console.log(`... and ${workouts.length - 10} more workouts`);
        }

        console.log('\n💡 Use updateWorkoutLocation(docId, location) to update workout location');
        console.log('💡 Use updateExerciseEquipment(docId, exerciseKey, equipment, location) to update exercise equipment');
        console.log('💡 Use bulkUpdateEquipment(exerciseName, oldEquipment, newEquipment, newLocation) for bulk updates');

        // Store for easy access
        window._workoutHistory = workouts;
        return workouts;

    } catch (error) {
        console.error('❌ Error loading history:', error);
        throw error;
    }
}

/**
 * Update workout location
 */
export async function updateWorkoutLocation(docId, newLocation) {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return false;
    }

    try {
        const { db, doc, updateDoc } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        const docRef = doc(db, "users", uid, "workouts", docId);
        await updateDoc(docRef, { location: newLocation });

        console.log(`✅ Updated workout ${docId} location to: ${newLocation}`);
        return true;

    } catch (error) {
        console.error('❌ Error updating location:', error);
        return false;
    }
}

/**
 * Update exercise equipment in a specific workout
 */
export async function updateExerciseEquipment(docId, exerciseKey, newEquipment, newLocation = null) {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return false;
    }

    try {
        const { db, doc, getDoc, updateDoc } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        const docRef = doc(db, "users", uid, "workouts", docId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            console.log('❌ Workout not found');
            return false;
        }

        const data = docSnap.data();
        const updates = {};

        // Update in exercises object
        if (data.exercises?.[exerciseKey]) {
            updates[`exercises.${exerciseKey}.equipment`] = newEquipment;
            if (newLocation) {
                updates[`exercises.${exerciseKey}.equipmentLocation`] = newLocation;
            }
        }

        // Also update in originalWorkout.exercises if it exists
        if (data.originalWorkout?.exercises) {
            const idx = parseInt(exerciseKey.replace('exercise_', ''));
            if (data.originalWorkout.exercises[idx]) {
                const updatedOriginal = [...data.originalWorkout.exercises];
                updatedOriginal[idx] = {
                    ...updatedOriginal[idx],
                    equipment: newEquipment,
                    ...(newLocation && { equipmentLocation: newLocation })
                };
                updates['originalWorkout.exercises'] = updatedOriginal;
            }
        }

        await updateDoc(docRef, updates);

        console.log(`✅ Updated ${exerciseKey} in workout ${docId}`);
        console.log(`   Equipment: ${newEquipment}`);
        if (newLocation) console.log(`   Location: ${newLocation}`);

        return true;

    } catch (error) {
        console.error('❌ Error updating equipment:', error);
        return false;
    }
}

/**
 * Bulk update equipment across all workouts
 * Finds all exercises matching exerciseName with oldEquipment and updates to newEquipment
 */
export async function bulkUpdateEquipment(exerciseName, oldEquipment, newEquipment, newLocation = null) {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return { updated: 0 };
    }

    const confirm = window.confirm(
        `This will update all "${exerciseName}" exercises\n` +
        `FROM: ${oldEquipment || '(any)'}\n` +
        `TO: ${newEquipment}${newLocation ? ` @ ${newLocation}` : ''}\n\n` +
        `Continue?`
    );

    if (!confirm) {
        console.log('Cancelled');
        return { updated: 0 };
    }

    console.log(`🔄 Bulk updating "${exerciseName}" equipment...\n`);

    try {
        const { db, collection, getDocs, doc, getDoc, updateDoc } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        const workoutsRef = collection(db, "users", uid, "workouts");
        const snapshot = await getDocs(workoutsRef);

        let updateCount = 0;
        const exerciseNameLower = exerciseName.toLowerCase();

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            let needsUpdate = false;
            const updates = {};

            // Check exercises object
            if (data.exercises) {
                for (const [key, ex] of Object.entries(data.exercises)) {
                    const exName = (ex.name || '').toLowerCase();
                    const exEquip = ex.equipment || null;

                    if (exName === exerciseNameLower && (!oldEquipment || exEquip === oldEquipment)) {
                        updates[`exercises.${key}.equipment`] = newEquipment;
                        if (newLocation) {
                            updates[`exercises.${key}.equipmentLocation`] = newLocation;
                        }
                        needsUpdate = true;
                    }
                }
            }

            // Check originalWorkout.exercises
            if (data.originalWorkout?.exercises) {
                const updatedOriginal = data.originalWorkout.exercises.map((ex, idx) => {
                    const exName = (ex.machine || ex.name || '').toLowerCase();
                    const exEquip = ex.equipment || null;

                    if (exName === exerciseNameLower && (!oldEquipment || exEquip === oldEquipment)) {
                        needsUpdate = true;
                        return {
                            ...ex,
                            equipment: newEquipment,
                            ...(newLocation && { equipmentLocation: newLocation })
                        };
                    }
                    return ex;
                });

                if (needsUpdate) {
                    updates['originalWorkout.exercises'] = updatedOriginal;
                }
            }

            if (needsUpdate) {
                const docRef = doc(db, "users", uid, "workouts", docSnap.id);
                await updateDoc(docRef, updates);
                updateCount++;
                console.log(`  ✓ Updated workout ${data.date} - ${data.workoutType}`);
            }
        }

        console.log(`\n✅ Updated ${updateCount} workout(s)`);
        showNotification(`Updated ${updateCount} workout(s)`, 'success');

        return { updated: updateCount };

    } catch (error) {
        console.error('❌ Error in bulk update:', error);
        showNotification('Error updating workouts', 'error');
        throw error;
    }
}

/**
 * List all unique equipment names used across workouts
 */
export async function listAllEquipment() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return {};
    }

    console.log('📋 Scanning all equipment in workout history...\n');

    try {
        const { db, collection, getDocs } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        const workoutsRef = collection(db, "users", uid, "workouts");
        const snapshot = await getDocs(workoutsRef);

        // Map: exerciseName -> Set of equipment names
        const equipmentByExercise = {};
        // Map: location -> count
        const locationCounts = {};

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();

            // Track workout location
            if (data.location) {
                locationCounts[data.location] = (locationCounts[data.location] || 0) + 1;
            }

            // Check exercises
            if (data.exercises) {
                Object.values(data.exercises).forEach(ex => {
                    const name = ex.name || 'Unknown';
                    if (!equipmentByExercise[name]) {
                        equipmentByExercise[name] = new Set();
                    }
                    if (ex.equipment) {
                        equipmentByExercise[name].add(ex.equipment);
                    }
                });
            }

            // Check originalWorkout.exercises
            if (data.originalWorkout?.exercises) {
                data.originalWorkout.exercises.forEach(ex => {
                    const name = ex.machine || ex.name || 'Unknown';
                    if (!equipmentByExercise[name]) {
                        equipmentByExercise[name] = new Set();
                    }
                    if (ex.equipment) {
                        equipmentByExercise[name].add(ex.equipment);
                    }
                });
            }
        });

        // Convert Sets to Arrays and sort
        const result = {};
        Object.keys(equipmentByExercise).sort().forEach(exercise => {
            const equipment = [...equipmentByExercise[exercise]].sort();
            if (equipment.length > 0) {
                result[exercise] = equipment;
            }
        });

        console.log('=== Equipment by Exercise ===\n');
        Object.entries(result).forEach(([exercise, equipment]) => {
            console.log(`${exercise}:`);
            equipment.forEach(eq => console.log(`  - ${eq}`));
        });

        console.log('\n=== Workout Locations ===\n');
        Object.entries(locationCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([location, count]) => {
                console.log(`${location}: ${count} workouts`);
            });

        return { equipmentByExercise: result, locationCounts };

    } catch (error) {
        console.error('❌ Error listing equipment:', error);
        throw error;
    }
}

/**
 * Find workouts missing equipment or location data
 */
export async function findIncompleteWorkouts() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return [];
    }

    console.log('🔍 Finding workouts with missing equipment/location...\n');

    try {
        const { db, collection, getDocs, query, orderBy } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        const workoutsRef = collection(db, "users", uid, "workouts");
        const q = query(workoutsRef, orderBy("date", "desc"));
        const snapshot = await getDocs(q);

        const incomplete = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const issues = [];

            // Check workout location
            if (!data.location) {
                issues.push('Missing workout location');
            }

            // Check exercises for missing equipment
            const missingEquipment = [];
            if (data.exercises) {
                Object.entries(data.exercises).forEach(([key, ex]) => {
                    if (!ex.equipment && ex.sets?.length > 0) {
                        missingEquipment.push(ex.name || key);
                    }
                });
            }

            if (missingEquipment.length > 0) {
                issues.push(`Missing equipment: ${missingEquipment.join(', ')}`);
            }

            if (issues.length > 0) {
                incomplete.push({
                    docId: docSnap.id,
                    date: data.date,
                    workoutType: data.workoutType,
                    issues
                });
            }
        });

        console.log(`Found ${incomplete.length} incomplete workout(s)\n`);

        incomplete.slice(0, 20).forEach((w, i) => {
            console.log(`${i + 1}. [${w.date}] ${w.workoutType} (${w.docId})`);
            w.issues.forEach(issue => console.log(`   ⚠️ ${issue}`));
        });

        if (incomplete.length > 20) {
            console.log(`\n... and ${incomplete.length - 20} more`);
        }

        return incomplete;

    } catch (error) {
        console.error('❌ Error finding incomplete workouts:', error);
        throw error;
    }
}

/**
 * ONE-TIME MIGRATION: Copy equipment data from originalWorkout.exercises to exercises.exercise_X
 * This fixes the history editor filter not recognizing equipment that was stored in the wrong place
 */
export async function migrateEquipmentToExercises() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return { migrated: 0 };
    }

    console.log('🔄 Migrating equipment data to exercises object...\n');

    try {
        const { db, collection, getDocs, doc, updateDoc } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        const workoutsRef = collection(db, "users", uid, "workouts");
        const snapshot = await getDocs(workoutsRef);

        let migratedCount = 0;
        let exercisesMigrated = 0;

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const updates = {};
            let workoutNeedsUpdate = false;

            // Check if originalWorkout.exercises has equipment data
            if (data.originalWorkout?.exercises && data.exercises) {
                data.originalWorkout.exercises.forEach((origEx, idx) => {
                    const exerciseKey = `exercise_${idx}`;
                    const savedEx = data.exercises[exerciseKey];

                    // If originalWorkout has equipment but exercises doesn't, copy it over
                    if (savedEx) {
                        // Copy name if missing
                        if (!savedEx.name && (origEx.machine || origEx.name)) {
                            updates[`exercises.${exerciseKey}.name`] = origEx.machine || origEx.name;
                            workoutNeedsUpdate = true;
                        }

                        // Copy equipment if missing
                        if (!savedEx.equipment && origEx.equipment) {
                            updates[`exercises.${exerciseKey}.equipment`] = origEx.equipment;
                            workoutNeedsUpdate = true;
                            exercisesMigrated++;
                        }

                        // Copy equipmentLocation if missing
                        if (!savedEx.equipmentLocation && origEx.equipmentLocation) {
                            updates[`exercises.${exerciseKey}.equipmentLocation`] = origEx.equipmentLocation;
                            workoutNeedsUpdate = true;
                        }
                    }
                });
            }

            if (workoutNeedsUpdate) {
                const docRef = doc(db, "users", uid, "workouts", docSnap.id);
                await updateDoc(docRef, updates);
                migratedCount++;
                console.log(`  ✓ Migrated: ${data.date} - ${data.workoutType}`);
            }
        }

        console.log(`\n✅ Migration complete!`);
        console.log(`   Workouts updated: ${migratedCount}`);
        console.log(`   Exercises migrated: ${exercisesMigrated}`);

        if (migratedCount > 0) {
            showNotification(`Migrated ${exercisesMigrated} exercises in ${migratedCount} workouts`, 'success');
        } else {
            showNotification('No migration needed - data already current', 'info');
        }

        return { migrated: migratedCount, exercises: exercisesMigrated };

    } catch (error) {
        console.error('❌ Migration error:', error);
        showNotification('Migration failed', 'error');
        throw error;
    }
}

// ===================================================================
// RECALCULATE STREAKS AND PRs
// ===================================================================

/**
 * Recalculate streak stats from workout history
 * Displays current streak, longest streak, and workout counts
 */
export async function recalculateStreaks() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return null;
    }

    console.log('📊 Recalculating streak statistics...\n');

    try {
        const { StreakTracker } = await import('../features/streak-tracker.js');
        const stats = await StreakTracker.calculateStreaks();

        if (!stats) {
            console.log('❌ Failed to calculate streaks');
            return null;
        }

        console.log('=== STREAK STATISTICS ===\n');
        console.log(`🔥 Current Streak: ${stats.currentStreak} day(s)`);
        console.log(`🏆 Longest Streak: ${stats.longestStreak} day(s)`);
        console.log(`📅 Last Workout: ${stats.lastWorkoutDate || 'Never'}`);
        console.log(`\n📈 This Week: ${stats.workoutsThisWeek} workout(s)`);
        console.log(`📈 This Month: ${stats.workoutsThisMonth} workout(s)`);
        console.log(`📊 Total Workouts: ${stats.totalWorkouts}`);

        // Get frequency by day
        const dayFreq = await StreakTracker.getWorkoutFrequencyByDay();
        console.log('\n=== WORKOUTS BY DAY ===');
        dayFreq.forEach(d => {
            const bar = '█'.repeat(Math.min(d.count, 20));
            console.log(`${d.day.padEnd(10)} ${bar} ${d.count}`);
        });

        showNotification(`Current streak: ${stats.currentStreak} days`, 'success');
        return stats;

    } catch (error) {
        console.error('❌ Error calculating streaks:', error);
        showNotification('Error calculating streaks', 'error');
        throw error;
    }
}

/**
 * Rebuild all PRs from workout history
 * Clears existing PRs and reprocesses all workouts
 */
export async function rebuildAllPRs() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return null;
    }

    const confirm = window.confirm(
        'This will clear all existing PRs and rebuild them from workout history.\n\n' +
        'All workouts from July 2025 onwards will be included.\n\n' +
        'Continue?'
    );

    if (!confirm) {
        console.log('Cancelled');
        return null;
    }

    console.log('🏋️ Rebuilding all PRs from workout history...\n');

    try {
        const { PRTracker } = await import('../features/pr-tracker.js');

        // Load current PR data first
        await PRTracker.loadPRData();

        // Rebuild from history
        const result = await PRTracker.rebuildPRsFromHistory();

        if (result.success) {
            console.log('\n=== PR REBUILD COMPLETE ===');
            console.log(`✅ Workouts processed: ${result.workoutsProcessed}`);
            console.log(`✅ Sets analyzed: ${result.setsProcessed}`);

            // Show PR summary
            const allPRs = PRTracker.getAllPRs();
            console.log(`\n📊 Total exercises with PRs: ${allPRs.length}`);

            // Group by body part
            const prsByBodyPart = PRTracker.getPRsByBodyPart();
            console.log('\n=== PRs BY BODY PART ===');
            for (const [bodyPart, exercises] of Object.entries(prsByBodyPart)) {
                const count = Object.keys(exercises).length;
                console.log(`${bodyPart}: ${count} exercise(s)`);
            }

            // Show recent PRs
            const recentPRs = PRTracker.getRecentPRs(5);
            if (recentPRs.length > 0) {
                console.log('\n=== RECENT PRs ===');
                recentPRs.forEach(pr => {
                    console.log(`🏆 ${pr.exercise} (${pr.equipment}): ${pr.weight} lbs × ${pr.reps} on ${pr.date}`);
                });
            }

            showNotification(`Rebuilt ${allPRs.length} exercise PRs from ${result.workoutsProcessed} workouts`, 'success');
        } else {
            console.error('❌ PR rebuild failed:', result.error);
            showNotification('PR rebuild failed', 'error');
        }

        return result;

    } catch (error) {
        console.error('❌ Error rebuilding PRs:', error);
        showNotification('Error rebuilding PRs', 'error');
        throw error;
    }
}

/**
 * Recalculate ALL stats - streaks and PRs
 * Use this after equipment/location updates are complete
 */
export async function recalculateAllStats() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return null;
    }

    console.log('🔄 RECALCULATING ALL STATISTICS\n');
    console.log('='.repeat(50));

    try {
        // Step 1: Recalculate streaks
        console.log('\n📊 Step 1: Recalculating streaks...');
        const streakStats = await recalculateStreaks();

        // Step 2: Rebuild PRs
        console.log('\n🏋️ Step 2: Rebuilding PRs...');
        const prResult = await rebuildAllPRs();

        console.log('\n' + '='.repeat(50));
        console.log('✅ ALL STATS RECALCULATED');
        console.log('='.repeat(50));

        return {
            streaks: streakStats,
            prs: prResult
        };

    } catch (error) {
        console.error('❌ Error recalculating stats:', error);
        throw error;
    }
}

/**
 * Show current PR summary without rebuilding
 */
export async function showPRSummary() {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return null;
    }

    console.log('📊 Loading PR summary...\n');

    try {
        const { PRTracker } = await import('../features/pr-tracker.js');
        await PRTracker.loadPRData();

        const allPRs = PRTracker.getAllPRs();
        const prsByBodyPart = PRTracker.getPRsByBodyPart();
        const cutoffDate = PRTracker.getPRCutoffDate();

        console.log('=== PR SUMMARY ===');
        console.log(`Cutoff date: ${cutoffDate} (PRs before this are ignored)\n`);

        console.log(`Total exercises with PRs: ${allPRs.length}\n`);

        // Show by body part
        console.log('=== BY BODY PART ===');
        for (const [bodyPart, exercises] of Object.entries(prsByBodyPart)) {
            console.log(`\n📋 ${bodyPart.toUpperCase()}`);
            for (const [exerciseName, equipmentData] of Object.entries(exercises)) {
                for (const [equipment, prs] of Object.entries(equipmentData)) {
                    if (prs.maxWeight) {
                        console.log(`   ${exerciseName} (${equipment}): ${prs.maxWeight.weight} lbs × ${prs.maxWeight.reps}`);
                    }
                }
            }
        }

        // Show recent PRs
        const recentPRs = PRTracker.getRecentPRs(10);
        if (recentPRs.length > 0) {
            console.log('\n=== 10 MOST RECENT PRs ===');
            recentPRs.forEach((pr, i) => {
                console.log(`${i + 1}. ${pr.date} - ${pr.exercise} (${pr.equipment}): ${pr.weight} lbs × ${pr.reps}`);
            });
        }

        return { total: allPRs.length, byBodyPart: prsByBodyPart, recent: recentPRs };

    } catch (error) {
        console.error('❌ Error loading PR summary:', error);
        throw error;
    }
}

/**
 * Rename an exercise across all workout history
 * Updates exerciseNames, exercises.exercise_X.name, and originalWorkout.exercises[].machine
 */
export async function renameExercise(oldName, newName) {
    if (!AppState.currentUser) {
        console.log('❌ No user signed in');
        return { updated: 0 };
    }

    const confirm = window.confirm(
        `This will rename all instances of:\n\n` +
        `"${oldName}"\n\nto:\n\n"${newName}"\n\n` +
        `across all workout history.\n\nContinue?`
    );

    if (!confirm) {
        console.log('Cancelled');
        return { updated: 0 };
    }

    console.log(`🔄 Renaming "${oldName}" to "${newName}"...\n`);

    try {
        const { db, collection, getDocs, doc, updateDoc } = await import('../data/firebase-config.js');
        const uid = AppState.currentUser.uid;

        const workoutsRef = collection(db, "users", uid, "workouts");
        const snapshot = await getDocs(workoutsRef);

        let updateCount = 0;
        let exerciseCount = 0;
        const oldNameLower = oldName.toLowerCase();

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            let needsUpdate = false;
            const updates = {};

            // Check exerciseNames object
            if (data.exerciseNames) {
                for (const [key, exName] of Object.entries(data.exerciseNames)) {
                    if (exName?.toLowerCase() === oldNameLower) {
                        updates[`exerciseNames.${key}`] = newName;
                        needsUpdate = true;
                        exerciseCount++;
                    }
                }
            }

            // Check exercises object (where sets are stored)
            if (data.exercises) {
                for (const [key, ex] of Object.entries(data.exercises)) {
                    if (ex.name?.toLowerCase() === oldNameLower) {
                        updates[`exercises.${key}.name`] = newName;
                        needsUpdate = true;
                    }
                }
            }

            // Check originalWorkout.exercises (template data)
            if (data.originalWorkout?.exercises) {
                let originalNeedsUpdate = false;
                const updatedExercises = data.originalWorkout.exercises.map(ex => {
                    if (!ex) return ex; // Skip null/undefined entries
                    const machineMatch = ex.machine && ex.machine.toLowerCase() === oldNameLower;
                    const nameMatch = ex.name && ex.name.toLowerCase() === oldNameLower;
                    if (machineMatch || nameMatch) {
                        originalNeedsUpdate = true;
                        needsUpdate = true;
                        const updated = { ...ex };
                        if (machineMatch) updated.machine = newName;
                        if (nameMatch) updated.name = newName;
                        return updated;
                    }
                    return ex;
                });

                if (originalNeedsUpdate) {
                    updates['originalWorkout.exercises'] = updatedExercises;
                }
            }

            if (needsUpdate) {
                const docRef = doc(db, "users", uid, "workouts", docSnap.id);
                await updateDoc(docRef, updates);
                updateCount++;
                console.log(`  ✓ Updated: ${data.date} - ${data.workoutType}`);
            }
        }

        console.log(`\n✅ Rename complete!`);
        console.log(`   Workouts updated: ${updateCount}`);
        console.log(`   Exercise instances renamed: ${exerciseCount}`);

        if (updateCount > 0) {
            showNotification(`Renamed ${exerciseCount} exercises in ${updateCount} workouts`, 'success');
        } else {
            showNotification(`No exercises found matching "${oldName}"`, 'info');
        }

        return { updated: updateCount, exercises: exerciseCount };

    } catch (error) {
        console.error('❌ Error renaming exercise:', error);
        showNotification('Error renaming exercise', 'error');
        throw error;
    }
}