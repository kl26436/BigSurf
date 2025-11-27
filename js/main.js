// Simple main.js - Just fix the import paths and call startApplication

// ===================================================================
// FIXED IMPORTS - Your existing modules, correct paths
// ===================================================================

// Core modules
import { AppState } from './core/app-state.js';
import { startApplication } from './core/app-initialization.js';

// Authentication functions
import {
    signIn, signOutUser, showUserInfo, hideUserInfo,
    setupEventListeners, setupKeyboardShortcuts,
    showLoadingScreen, updateLoadingMessage, showSignInPrompt, hideLoadingScreen
} from './core/app-initialization.js';

// Workout core functionality
import {
    startWorkout, pauseWorkout, completeWorkout, cancelWorkout, cancelCurrentWorkout,
    continueInProgressWorkout, discardInProgressWorkout,
    renderExercises, createExerciseCard, focusExercise,
    updateSet, addSet, deleteSet, saveExerciseNotes, markExerciseComplete,
    deleteExerciseFromWorkout, addExerciseToActiveWorkout, confirmExerciseAddToWorkout,
    toggleModalRestTimer, skipModalRestTimer,
    updateWorkoutDuration, startWorkoutTimer,
    showExerciseVideo, hideExerciseVideo, convertYouTubeUrl,
    setGlobalUnit, setExerciseUnit,
    closeExerciseModal, loadExerciseHistory, loadLastWorkoutHint, autoStartRestTimer
} from './core/workout-core.js';

// Template selection functionality
import {
    showTemplateSelection, closeTemplateSelection, selectTemplate,
    showWorkoutSelector, switchTemplateCategory, loadTemplatesByCategory,
    useTemplate, useTemplateFromManagement, copyTemplateToCustom, deleteCustomTemplate,
    renderTemplateCards, createTemplateCard, filterTemplates, searchTemplates,
    getWorkoutCategory
} from './core/template-selection.js';

// Workout history UI functionality
import {
    showWorkoutHistory, viewWorkout, resumeWorkout, repeatWorkout,
    deleteWorkout, retryWorkout, clearAllHistoryFilters
} from './core/workout-history-ui.js';

// Workout management UI
import {
    initializeWorkoutManagement, showWorkoutManagement, closeWorkoutManagement, hideWorkoutManagement,
    createNewTemplate, closeTemplateEditor, saveCurrentTemplate,
    addExerciseToTemplate, editTemplateExercise, removeTemplateExercise,
    openExerciseLibrary, closeExerciseLibrary,
    showCreateExerciseForm, closeCreateExerciseModal, createNewExercise,
    returnToWorkoutsFromManagement, editTemplate
} from './core/workout/workout-management-ui.js';

// Manual workout functionality
import {
    showAddManualWorkoutModal, closeAddManualWorkoutModal,
    proceedToExerciseSelection, backToBasicInfo,
    submitManualWorkout, finishManualWorkout, loadWorkoutTemplate,
    addExerciseToManualWorkout, editManualExercise, removeManualExercise,
    closeManualExerciseEntry, addToManualWorkoutFromLibrary,
    updateManualSet, updateManualExerciseNotes,
    addSetToManualExercise, removeSetFromManualExercise, markManualExerciseComplete,
    renderManualExerciseList, createManualExerciseCard
} from './core/manual-workout.js';

// Exercise manager functionality
import {
    openExerciseManager, closeExerciseManager,
    filterExerciseLibrary, clearExerciseFilters, refreshExerciseLibrary,
    showAddExerciseModal, closeAddExerciseModal,
    editExercise, saveExercise, deleteExercise, toggleExerciseGroup
} from './core/exercise-manager-ui.js';

// Location selector functionality
import {
    showLocationSelector, closeLocationSelector,
    selectSavedLocation, selectNewLocation, skipLocationSelection,
    changeLocation
} from './core/location-ui.js';

// Navigation functionality
import {
    openSidebar, closeSidebar, navigateTo
} from './core/navigation.js';

// Dashboard functionality
import {
    showDashboard, repeatLastWorkout
} from './core/dashboard-ui.js';

// Stats functionality
import {
    showStats, filterPRs, clearPRFilters
} from './core/stats-ui.js';

// PR Migration (one-time utility)
import { migrateOldWorkoutsToPRs } from './core/pr-migration.js';

// Debug utilities
import {
    debugManualWorkoutDate, debugFirebaseWorkoutDates,
    forceCheckHistoryData, testHistoryFilters,
    fixWorkoutHistoryReference, emergencyFixFilters,
    debounce, setupErrorLogging, runAllDebugChecks
} from './core/debug-utilities.js';

// Firebase Workout Manager (for exercise-manager.html)
import { FirebaseWorkoutManager } from './core/firebase-workout-manager.js';

// ===================================================================
// CALENDAR NAVIGATION FUNCTIONS (Add to window assignments)
// ===================================================================

// Calendar navigation
window.previousMonth = function() {
    console.log(' Previous Month clicked');
    if (window.workoutHistory && typeof window.workoutHistory.previousMonth === 'function') {
        window.workoutHistory.previousMonth();
    } else {
        console.warn(' workoutHistory.previousMonth not available');
    }
};

window.nextMonth = function() {
    console.log(' Next Month clicked');
    if (window.workoutHistory && typeof window.workoutHistory.nextMonth === 'function') {
        window.workoutHistory.nextMonth();
    } else {
        console.warn(' workoutHistory.nextMonth not available');
    }
};

// Workout detail functions
window.viewWorkout = function(workoutId) {
    console.log(' View Workout:', workoutId);
    if (window.workoutHistory && typeof window.workoutHistory.showWorkoutDetail === 'function') {
        window.workoutHistory.showWorkoutDetail(workoutId);
    } else {
        console.warn(' workoutHistory.showWorkoutDetail not available');
    }
};



// Add workout function
window.addWorkout = function() {
    console.log(' Add Workout clicked');
    if (typeof window.showAddManualWorkoutModal === 'function') {
        window.showAddManualWorkoutModal();
    } else {
        console.warn(' showAddManualWorkoutModal not available');
        alert('Add workout functionality coming soon');
    }
};

console.log(' Calendar navigation functions added to window');

// ===================================================================
// ASSIGN ALL FUNCTIONS TO WINDOW (your existing assignments)
// ===================================================================

// Core Workout Functions
window.startWorkout = startWorkout;
window.pauseWorkout = pauseWorkout;
window.completeWorkout = completeWorkout;
window.cancelWorkout = cancelWorkout;
window.cancelCurrentWorkout = cancelCurrentWorkout;
window.continueInProgressWorkout = continueInProgressWorkout;
window.discardInProgressWorkout = discardInProgressWorkout;
window.startWorkoutFromModal = function(workoutName) {
    // Close the modal
    const modal = document.getElementById('template-selection-modal');
    if (modal) {
        modal.remove();
    }
    
    // Try different ways to call startWorkout
    if (window.startWorkout) {
        window.startWorkout(workoutName);
    } else if (typeof startWorkout === 'function') {
        startWorkout(workoutName);
    } else {
        // Import and call the function dynamically
        import('./core/workout-core.js').then(module => {
            if (module.startWorkout) {
                module.startWorkout(workoutName);
            }
        });
    }
};

// Exercise Management
window.focusExercise = focusExercise;
window.updateSet = updateSet;
window.addSet = addSet;
window.deleteSet = deleteSet;
window.saveExerciseNotes = saveExerciseNotes;
window.markExerciseComplete = markExerciseComplete;
window.deleteExerciseFromWorkout = deleteExerciseFromWorkout;
window.addExerciseToActiveWorkout = addExerciseToActiveWorkout;
window.confirmExerciseAddToWorkout = confirmExerciseAddToWorkout;
window.closeExerciseModal = closeExerciseModal;
window.loadExerciseHistory = function(exerciseName, exerciseIndex) {
    loadExerciseHistory(exerciseName, exerciseIndex, AppState);
};

// Timer Functions
window.toggleModalRestTimer = toggleModalRestTimer;
window.skipModalRestTimer = skipModalRestTimer;
window.autoStartRestTimer = autoStartRestTimer;

// Video Functions
window.showExerciseVideo = showExerciseVideo;
window.hideExerciseVideo = hideExerciseVideo;

// Unit Management
window.setGlobalUnit = setGlobalUnit;
window.setExerciseUnit = setExerciseUnit;

// Manual Workout Functions
window.showAddManualWorkoutModal = showAddManualWorkoutModal;
window.closeAddManualWorkoutModal = closeAddManualWorkoutModal;
window.proceedToExerciseSelection = proceedToExerciseSelection;
window.backToBasicInfo = backToBasicInfo;
window.submitManualWorkout = submitManualWorkout;
window.finishManualWorkout = finishManualWorkout;
window.loadWorkoutTemplate = loadWorkoutTemplate;
window.addExerciseToManualWorkout = addExerciseToManualWorkout;
window.editManualExercise = editManualExercise;
window.removeManualExercise = removeManualExercise;
window.closeManualExerciseEntry = closeManualExerciseEntry;
window.addToManualWorkoutFromLibrary = addToManualWorkoutFromLibrary;
window.updateManualSet = updateManualSet;
window.updateManualExerciseNotes = updateManualExerciseNotes;
window.addSetToManualExercise = addSetToManualExercise;
window.removeSetFromManualExercise = removeSetFromManualExercise;
window.markManualExerciseComplete = markManualExerciseComplete;

// Exercise Manager Functions
window.openExerciseManager = openExerciseManager;
window.closeExerciseManager = closeExerciseManager;
window.filterExerciseLibrary = filterExerciseLibrary;
window.clearExerciseFilters = clearExerciseFilters;
window.refreshExerciseLibrary = refreshExerciseLibrary;
window.showAddExerciseModal = showAddExerciseModal;
window.closeAddExerciseModal = closeAddExerciseModal;
window.editExercise = editExercise;
window.saveExercise = saveExercise;
window.deleteExercise = deleteExercise;
window.toggleExerciseGroup = toggleExerciseGroup;

// Location Selector Functions
window.showLocationSelector = showLocationSelector;
window.closeLocationSelector = closeLocationSelector;
window.selectSavedLocation = selectSavedLocation;
window.selectNewLocation = selectNewLocation;
window.skipLocationSelection = skipLocationSelection;
window.changeLocation = changeLocation;

// Navigation Functions
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.navigateTo = navigateTo;

// Dashboard Functions
window.showDashboard = showDashboard;
window.repeatLastWorkout = repeatLastWorkout;

// Stats Functions
window.showStats = showStats;
window.filterPRs = filterPRs;
window.clearPRFilters = clearPRFilters;

// Template Selection Functions
window.showTemplateSelection = showTemplateSelection;
window.closeTemplateSelection = closeTemplateSelection;
window.selectTemplate = selectTemplate;
window.showWorkoutSelector = showWorkoutSelector;
window.switchTemplateCategory = switchTemplateCategory;
window.loadTemplatesByCategory = loadTemplatesByCategory;
window.useTemplate = useTemplate;
window.useTemplateFromManagement = useTemplateFromManagement;
window.copyTemplateToCustom = copyTemplateToCustom;
window.deleteCustomTemplate = deleteCustomTemplate;
window.showTemplatesByCategory = function(category) {
    // Fix: Match on workout.type OR workout.category
    const filteredWorkouts = window.AppState.workoutPlans.filter(workout => {
        const workoutCategory = (workout.category || workout.type || '').toLowerCase();
        return workoutCategory === category.toLowerCase();
    });

    console.log(`Found ${filteredWorkouts.length} workouts for category "${category}"`, filteredWorkouts);

    // Remove any existing modal first
    const existingModal = document.getElementById('template-selection-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create completely new modal
    const modal = document.createElement('div');
    modal.id = 'template-selection-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: #161b22;
        border-radius: 16px;
        padding: 2rem;
        max-width: 90vw;
        max-height: 90vh;
        overflow-y: auto;
        border: 1px solid #30363d;
    `;

    // Create header - capitalize first letter properly
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;';
    const categoryDisplay = category.charAt(0).toUpperCase() + category.slice(1);
    header.innerHTML = `
        <h3 style="margin: 0; color: #c9d1d9;">${categoryDisplay} Workouts</h3>
        <button onclick="closeTemplateModal()" style="background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer;">×</button>
    `;
    
    // Create cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;';
    
    // Add workout cards
    filteredWorkouts.forEach(workout => {
        const card = document.createElement('div');
        card.style.cssText = `
            background: #21262d;
            border: 1px solid #30363d;
            border-radius: 12px;
            padding: 1.5rem;
            transition: all 0.3s ease;
        `;
        
        card.innerHTML = `
            <h4 style="margin: 0 0 1rem 0; color: #c9d1d9;">${workout.day}</h4>
            <p style="margin: 0 0 1rem 0; color: #8b949e;">${workout.exercises?.length || 0} exercises</p>
            <button onclick="startWorkoutFromModal('${workout.day}')" style="
                background: #40e0d0;
                color: #0d1117;
                border: none;
                padding: 0.75rem 1.5rem;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                width: 100%;
            ">Start Workout</button>
        `;
        
        cardsContainer.appendChild(card);
    });
    
    // Assemble modal
    content.appendChild(header);
    content.appendChild(cardsContainer);
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    console.log('Modal created and should be visible');
    };
    window.closeTemplateModal = function() {
        const modal = document.getElementById('template-selection-modal');
        if (modal) {
            modal.remove();
        }
    };

// Workout History Functions
window.showWorkoutHistory = showWorkoutHistory;
window.viewWorkout = viewWorkout;
window.resumeWorkout = resumeWorkout;
window.repeatWorkout = repeatWorkout;
window.deleteWorkout = deleteWorkout;
window.retryWorkout = retryWorkout;
window.clearAllHistoryFilters = clearAllHistoryFilters;
window.closeWorkoutDetailModal = function() {
    const modal = document.getElementById('workout-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

// Workout Management Functions
window.showWorkoutManagement = showWorkoutManagement;
window.closeWorkoutManagement = closeWorkoutManagement;
window.hideWorkoutManagement = hideWorkoutManagement;
window.createNewTemplate = createNewTemplate;
window.closeTemplateEditor = closeTemplateEditor;
window.saveCurrentTemplate = saveCurrentTemplate;
window.addExerciseToTemplate = addExerciseToTemplate;
window.editTemplateExercise = editTemplateExercise;
window.removeTemplateExercise = removeTemplateExercise;
window.openExerciseLibrary = openExerciseLibrary;
window.closeExerciseLibrary = closeExerciseLibrary;
window.showCreateExerciseForm = showCreateExerciseForm;
window.closeCreateExerciseModal = closeCreateExerciseModal;
window.createNewExercise = createNewExercise;
window.returnToWorkoutsFromManagement = returnToWorkoutsFromManagement;
window.editTemplate = editTemplate;

// Authentication Functions
window.signIn = signIn;
window.signOutUser = signOutUser;

// Loading Screen Functions
window.showLoadingScreen = showLoadingScreen;
window.updateLoadingMessage = updateLoadingMessage;
window.showSignInPrompt = showSignInPrompt;
window.hideLoadingScreen = hideLoadingScreen;

// Debug Functions
window.debugManualWorkoutDate = debugManualWorkoutDate;
window.debugFirebaseWorkoutDates = debugFirebaseWorkoutDates;
window.forceCheckHistoryData = forceCheckHistoryData;
window.testHistoryFilters = testHistoryFilters;
window.fixWorkoutHistoryReference = fixWorkoutHistoryReference;
window.emergencyFixFilters = emergencyFixFilters;
window.runAllDebugChecks = runAllDebugChecks;

// State access (for debugging)
window.AppState = AppState;

// Firebase Workout Manager (for exercise-manager.html)
window.FirebaseWorkoutManager = FirebaseWorkoutManager;

// ===================================================================
// SIMPLE INITIALIZATION - Just call your existing startApplication
// ===================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log(' Starting Big Surf Workout Tracker...');
    
    try {
        // Call your existing startApplication function - that's it!
        await startApplication();
        
        console.log(' Application started successfully');
        
    } catch (error) {
        console.error(' Application startup failed:', error);
        
        // Show error to user
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: #dc3545; color: white; padding: 1rem 2rem;
            border-radius: 8px; z-index: 10000; font-weight: bold;
        `;
        errorDiv.textContent = 'App failed to start. Check console for details.';
        document.body.appendChild(errorDiv);
    }
});

console.log(' Main.js loaded - ready to start app');