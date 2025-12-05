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