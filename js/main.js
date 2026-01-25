// Simple main.js - Just fix the import paths and call startApplication

// ===================================================================
// FIXED IMPORTS - Your existing modules, correct paths
// ===================================================================

// Core modules
import { AppState } from './core/utils/app-state.js';
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
    continueInProgressWorkout, discardInProgressWorkout, discardEditedWorkout, editHistoricalWorkout,
    renderExercises, createExerciseCard, focusExercise,
    updateSet, addSet, deleteSet, addSetToExercise, removeSetFromExercise,
    saveExerciseNotes, markExerciseComplete,
    deleteExerciseFromWorkout, addExerciseToActiveWorkout, confirmExerciseAddToWorkout,
    toggleModalRestTimer, skipModalRestTimer,
    updateWorkoutDuration, startWorkoutTimer,
    showExerciseVideo, hideExerciseVideo, showExerciseVideoAndToggleButton, hideExerciseVideoAndToggleButton, convertYouTubeUrl,
    setGlobalUnit, setExerciseUnit, editExerciseDefaults,
    closeExerciseModal, loadExerciseHistory, loadLastWorkoutHint, autoStartRestTimer,
    changeExerciseEquipment, applyEquipmentChange,
    changeWorkoutLocation, selectWorkoutLocationOption, closeWorkoutLocationSelector, confirmWorkoutLocationChange
} from './core/workout/workout-core.js';

// Template selection functionality
import {
    showTemplateSelection, closeTemplateSelection, selectTemplate,
    showWorkoutSelector, switchTemplateCategory, loadTemplatesByCategory,
    useTemplate, useTemplateFromManagement, copyTemplateToCustom, deleteCustomTemplate,
    renderTemplateCards, createTemplateCard, filterTemplates, searchTemplates,
    getWorkoutCategory
} from './core/ui/template-selection.js';

// Workout history UI functionality
import {
    showWorkoutHistory, viewWorkout, resumeWorkout, resumeWorkoutById, repeatWorkout,
    deleteWorkout, retryWorkout, clearAllHistoryFilters
} from './core/ui/workout-history-ui.js';

// Workout management UI
import {
    initializeWorkoutManagement, showWorkoutManagement, closeWorkoutManagement, hideWorkoutManagement,
    createNewTemplate, closeTemplateEditor, saveCurrentTemplate,
    addExerciseToTemplate, editTemplateExercise, removeTemplateExercise,
    openExerciseLibrary, closeExerciseLibrary,
    showCreateExerciseForm, closeCreateExerciseModal, createNewExercise,
    returnToWorkoutsFromManagement, editTemplate, deleteTemplate, resetToDefault,
    closeEquipmentPicker, skipEquipmentSelection, confirmEquipmentSelection, addEquipmentFromPicker,
    closeTemplateExerciseEdit, saveTemplateExerciseEdit,
    selectWorkoutCategory, showWorkoutCategoryView, handleWorkoutSearch
} from './core/workout/workout-management-ui.js';

// Manual workout functionality
import {
    showAddManualWorkoutModal, closeAddManualWorkoutModal,
    toggleManualWorkoutSource, selectWorkoutForManual, startCustomManualWorkout,
    backToManualStep1, updateManualSet, addManualSet, removeManualSet,
    removeManualExercise, openExercisePickerForManual, addExerciseToManualWorkout,
    addToManualWorkoutFromLibrary, saveManualWorkout,
    openEquipmentPickerForManual, selectEquipmentForManual, closeEquipmentPickerForManual,
    // Legacy exports for backwards compatibility
    proceedToExerciseSelection, backToBasicInfo, finishManualWorkout,
    editManualExercise, markManualExerciseComplete, closeManualExerciseEntry
} from './core/features/manual-workout.js';

// Exercise manager functionality
import {
    openExerciseManager, closeExerciseManager,
    filterExerciseLibrary, clearExerciseFilters, refreshExerciseLibrary,
    showAddExerciseModal, closeAddExerciseModal,
    editExercise, saveExercise, deleteExercise, toggleExerciseGroup,
    clearSelectedEquipment, addEquipmentToList,
    openEditExerciseSection, closeEditExerciseSection, saveExerciseFromSection,
    deleteExerciseFromSection,
    openEquipmentEditor, closeEquipmentEditor, addLocationToEquipmentEditor,
    removeLocationFromEquipmentEditor, saveEquipmentFromEditor, deleteEquipmentFromEditor,
    // New category grid functions
    showCategoryView, selectBodyPartCategory, filterByEquipment,
    handleExerciseSearch, toggleExerciseListSearch, handleExerciseCardClick
} from './core/ui/exercise-manager-ui.js';

// Location selector functionality
import {
    showLocationSelector, closeLocationSelector,
    selectSavedLocation, selectNewLocation, skipLocationSelection,
    changeLocation,
    showLocationManagement, closeLocationManagement,
    setLocationAsCurrent, addNewLocationFromManagement, detectAndAddLocation,
    closeAddLocationModal, saveNewLocationFromModal,
    editLocationName, deleteLocation, showLocationOnMapById,
    switchLocationMethod, searchLocationAddress, selectAddressResult, applyManualCoords
} from './core/features/location-ui.js';

// Location service (GPS-based location detection)
import { getSessionLocation } from './core/features/location-service.js';

// UI helpers
import { setHeaderMode } from './core/ui/ui-helpers.js';

// Navigation functionality
import {
    openSidebar, closeSidebar, navigateTo,
    bottomNavTo, toggleMoreMenu, closeMoreMenu, setBottomNavVisible, updateBottomNavActive
} from './core/ui/navigation.js';

// Dashboard functionality
import {
    showDashboard, repeatLastWorkout, startSuggestedWorkout,
    toggleDashboardSection, toggleDashboardPRBodyPart
} from './core/ui/dashboard-ui.js';

// Stats functionality
import {
    showStats, closeStats, toggleStatsSection, togglePRBodyPart,
    filterPRs, clearPRFilters, selectProgressExercise, setProgressTimeRange,
    selectProgressCategory, selectProgressExerciseName
} from './core/ui/stats-ui.js';

// PR Migration (one-time utility)
import { migrateOldWorkoutsToPRs } from './core/features/pr-migration.js';

// Debug utilities
import {
    debugManualWorkoutDate, debugFirebaseWorkoutDates, debugWeeklyStats,
    forceCheckHistoryData, testHistoryFilters,
    fixWorkoutHistoryReference, emergencyFixFilters,
    debounce, setupErrorLogging, runAllDebugChecks,
    cleanupDuplicateExercises, scanDuplicateExercises, mergeDuplicateExercises,
    getWorkoutHistoryForEditing, updateWorkoutLocation, updateExerciseEquipment,
    bulkUpdateEquipment, listAllEquipment, findIncompleteWorkouts, migrateEquipmentToExercises,
    recalculateStreaks, rebuildAllPRs, recalculateAllStats, showPRSummary, renameExercise
} from './core/utils/debug-utilities.js';

// Firebase Workout Manager (for exercise-manager.html)
import { FirebaseWorkoutManager } from './core/data/firebase-workout-manager.js';

// Push notification manager for iOS background notifications
import {
    initializeFCM, sendTestNotification, isFCMAvailable
} from './core/utils/push-notification-manager.js';

// ===================================================================
// CALENDAR NAVIGATION FUNCTIONS (Add to window assignments)
// ===================================================================

// Calendar navigation
window.previousMonth = function() {
    if (window.workoutHistory && typeof window.workoutHistory.previousMonth === 'function') {
        window.workoutHistory.previousMonth();
    }
};

window.nextMonth = function() {
    if (window.workoutHistory && typeof window.workoutHistory.nextMonth === 'function') {
        window.workoutHistory.nextMonth();
    }
};

// Workout detail functions
window.viewWorkout = function(workoutId) {
    if (window.workoutHistory && typeof window.workoutHistory.showWorkoutDetail === 'function') {
        window.workoutHistory.showWorkoutDetail(workoutId);
    }
};

// Add workout function
window.addWorkout = function() {
    if (typeof window.showAddManualWorkoutModal === 'function') {
        window.showAddManualWorkoutModal();
    }
};

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
window.discardEditedWorkout = discardEditedWorkout;
window.editHistoricalWorkout = editHistoricalWorkout;
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
        import('./core/workout/workout-core.js').then(module => {
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
window.addSetToExercise = addSetToExercise;
window.removeSetFromExercise = removeSetFromExercise;
window.saveExerciseNotes = saveExerciseNotes;
window.markExerciseComplete = markExerciseComplete;
window.deleteExerciseFromWorkout = deleteExerciseFromWorkout;
window.editExerciseDefaults = editExerciseDefaults;
window.addExerciseToActiveWorkout = addExerciseToActiveWorkout;
window.confirmExerciseAddToWorkout = confirmExerciseAddToWorkout;
window.closeExerciseModal = closeExerciseModal;
window.loadExerciseHistory = function(exerciseName, exerciseIndex) {
    loadExerciseHistory(exerciseName, exerciseIndex, AppState);
};

// Equipment change during workout
window.changeExerciseEquipment = changeExerciseEquipment;
window.applyEquipmentChange = applyEquipmentChange;

// Location management during workout
window.changeWorkoutLocation = changeWorkoutLocation;
window.selectWorkoutLocationOption = selectWorkoutLocationOption;
window.closeWorkoutLocationSelector = closeWorkoutLocationSelector;
window.confirmWorkoutLocationChange = confirmWorkoutLocationChange;
window.getSessionLocation = getSessionLocation;

// Timer Functions
window.toggleModalRestTimer = toggleModalRestTimer;
window.skipModalRestTimer = skipModalRestTimer;
window.autoStartRestTimer = autoStartRestTimer;

// Video Functions
window.showExerciseVideo = showExerciseVideo;
window.hideExerciseVideo = hideExerciseVideo;
window.showExerciseVideoAndToggleButton = showExerciseVideoAndToggleButton;
window.hideExerciseVideoAndToggleButton = hideExerciseVideoAndToggleButton;

// Unit Management
window.setGlobalUnit = setGlobalUnit;
window.setExerciseUnit = setExerciseUnit;

// Manual Workout Functions
window.showAddManualWorkoutModal = showAddManualWorkoutModal;
window.closeAddManualWorkoutModal = closeAddManualWorkoutModal;
window.toggleManualWorkoutSource = toggleManualWorkoutSource;
window.selectWorkoutForManual = selectWorkoutForManual;
window.startCustomManualWorkout = startCustomManualWorkout;
window.backToManualStep1 = backToManualStep1;
window.updateManualSet = updateManualSet;
window.addManualSet = addManualSet;
window.removeManualSet = removeManualSet;
window.removeManualExercise = removeManualExercise;
window.openExercisePickerForManual = openExercisePickerForManual;
window.addExerciseToManualWorkout = addExerciseToManualWorkout;
window.addToManualWorkoutFromLibrary = addToManualWorkoutFromLibrary;
window.saveManualWorkout = saveManualWorkout;
window.openEquipmentPickerForManual = openEquipmentPickerForManual;
window.selectEquipmentForManual = selectEquipmentForManual;
window.closeEquipmentPickerForManual = closeEquipmentPickerForManual;
// Legacy stubs
window.proceedToExerciseSelection = proceedToExerciseSelection;
window.backToBasicInfo = backToBasicInfo;
window.finishManualWorkout = finishManualWorkout;
window.editManualExercise = editManualExercise;
window.markManualExerciseComplete = markManualExerciseComplete;
window.closeManualExerciseEntry = closeManualExerciseEntry;

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
window.clearSelectedEquipment = clearSelectedEquipment;
window.addEquipmentToList = addEquipmentToList;
window.openEditExerciseSection = openEditExerciseSection;
window.closeEditExerciseSection = closeEditExerciseSection;
window.saveExerciseFromSection = saveExerciseFromSection;
window.deleteExerciseFromSection = deleteExerciseFromSection;
window.openEquipmentEditor = openEquipmentEditor;
window.closeEquipmentEditor = closeEquipmentEditor;
window.addLocationToEquipmentEditor = addLocationToEquipmentEditor;
window.removeLocationFromEquipmentEditor = removeLocationFromEquipmentEditor;
window.saveEquipmentFromEditor = saveEquipmentFromEditor;
window.deleteEquipmentFromEditor = deleteEquipmentFromEditor;
// New category grid functions
window.showCategoryView = showCategoryView;
window.selectBodyPartCategory = selectBodyPartCategory;
window.filterByEquipment = filterByEquipment;
window.handleExerciseSearch = handleExerciseSearch;
window.toggleExerciseListSearch = toggleExerciseListSearch;
window.handleExerciseCardClick = handleExerciseCardClick;

// Location Selector Functions
window.showLocationSelector = showLocationSelector;
window.closeLocationSelector = closeLocationSelector;
window.selectSavedLocation = selectSavedLocation;
window.selectNewLocation = selectNewLocation;
window.skipLocationSelection = skipLocationSelection;
window.changeLocation = changeLocation;

// Location Management Functions
window.showLocationManagement = showLocationManagement;
window.closeLocationManagement = closeLocationManagement;
window.setLocationAsCurrent = setLocationAsCurrent;
window.showLocationOnMapById = showLocationOnMapById;
window.addNewLocationFromManagement = addNewLocationFromManagement;
window.detectAndAddLocation = detectAndAddLocation;
window.closeAddLocationModal = closeAddLocationModal;
window.saveNewLocationFromModal = saveNewLocationFromModal;
window.editLocationName = editLocationName;
window.deleteLocation = deleteLocation;
window.switchLocationMethod = switchLocationMethod;
window.searchLocationAddress = searchLocationAddress;
window.selectAddressResult = selectAddressResult;
window.applyManualCoords = applyManualCoords;

// Navigation Functions
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.navigateTo = navigateTo;
window.bottomNavTo = bottomNavTo;
window.toggleMoreMenu = toggleMoreMenu;
window.closeMoreMenu = closeMoreMenu;
window.setBottomNavVisible = setBottomNavVisible;
window.updateBottomNavActive = updateBottomNavActive;
window.setHeaderMode = setHeaderMode;

// Dashboard Functions
window.showDashboard = showDashboard;
window.repeatLastWorkout = repeatLastWorkout;
window.startSuggestedWorkout = startSuggestedWorkout;
window.toggleDashboardSection = toggleDashboardSection;
window.toggleDashboardPRBodyPart = toggleDashboardPRBodyPart;

// Stats Functions
window.showStats = showStats;
window.closeStats = closeStats;
window.toggleStatsSection = toggleStatsSection;
window.togglePRBodyPart = togglePRBodyPart;
window.filterPRs = filterPRs;
window.clearPRFilters = clearPRFilters;
window.selectProgressExercise = selectProgressExercise;
window.setProgressTimeRange = setProgressTimeRange;
window.selectProgressCategory = selectProgressCategory;
window.selectProgressExerciseName = selectProgressExerciseName;

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
    // Helper to derive category from workout name
    function getWorkoutCategory(dayName) {
        if (!dayName) return 'other';
        const dayLower = dayName.toLowerCase();
        if (dayLower.includes('push') || dayLower.includes('chest')) return 'push';
        if (dayLower.includes('pull') || dayLower.includes('back')) return 'pull';
        if (dayLower.includes('leg') || dayLower.includes('lower')) return 'legs';
        if (dayLower.includes('cardio') || dayLower.includes('core')) return 'cardio';
        return 'other';
    }

    // Filter workouts by category
    const filteredWorkouts = window.AppState.workoutPlans.filter(workout => {
        // Check explicit category field first, then derive from name
        const workoutCategory = workout.category?.toLowerCase() ||
            workout.type?.toLowerCase() ||
            getWorkoutCategory(workout.day || workout.name || '');
        return workoutCategory === category.toLowerCase();
    });

    // Get category icon
    const categoryIcons = {
        'push': 'fas fa-hand-paper',
        'pull': 'fas fa-fist-raised',
        'legs': 'fas fa-running',
        'cardio': 'fas fa-heartbeat',
        'other': 'fas fa-dumbbell'
    };
    const categoryIcon = categoryIcons[category.toLowerCase()] || 'fas fa-dumbbell';

    // Use the existing modal in HTML
    const modal = document.getElementById('template-selection-modal');
    const titleEl = document.getElementById('template-modal-title');
    const gridEl = document.getElementById('template-selection-grid');

    if (!modal || !gridEl) return;

    // Update title
    const categoryDisplay = category.charAt(0).toUpperCase() + category.slice(1);
    if (titleEl) {
        titleEl.textContent = `${categoryDisplay} Workouts`;
    }

    // Clear and populate grid with workout-list-item style cards
    gridEl.innerHTML = '';
    gridEl.className = 'workout-list-container';

    if (filteredWorkouts.length === 0) {
        gridEl.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-dumbbell"></i>
                <h3>No ${categoryDisplay} Workouts</h3>
                <p>Create a workout to get started.</p>
            </div>
        `;
    } else {
        filteredWorkouts.forEach(workout => {
            const workoutName = workout.name || workout.day || 'Unnamed Workout';
            const exerciseCount = workout.exercises?.length || 0;

            // Create exercise summary
            let exerciseSummary = 'No exercises';
            if (exerciseCount > 0) {
                const names = workout.exercises.slice(0, 3).map(ex => ex.name || ex.machine);
                exerciseSummary = names.join(', ');
                if (exerciseCount > 3) {
                    exerciseSummary += ` +${exerciseCount - 3} more`;
                }
            }

            const card = document.createElement('div');
            card.className = 'workout-list-item';
            card.innerHTML = `
                <div class="workout-item-icon">
                    <i class="${categoryIcon}"></i>
                </div>
                <div class="workout-item-content">
                    <div class="workout-item-name">${workoutName}</div>
                    <div class="workout-item-meta">${exerciseCount} exercises</div>
                    <div class="workout-item-exercises">${exerciseSummary}</div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); startWorkoutFromModal('${workoutName.replace(/'/g, "\\'")}')">
                    <i class="fas fa-play"></i> Start
                </button>
            `;

            card.addEventListener('click', () => {
                startWorkoutFromModal(workoutName);
            });

            gridEl.appendChild(card);
        });
    }

    // Show the modal
    modal.classList.remove('hidden');
};

window.closeTemplateModal = function() {
    const modal = document.getElementById('template-selection-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
};

window.closeTemplateSelection = function() {
    closeTemplateModal();
};

// Workout History Functions
window.showWorkoutHistory = showWorkoutHistory;
window.viewWorkout = viewWorkout;
window.resumeWorkout = resumeWorkout;
window.resumeWorkoutById = resumeWorkoutById;  // Schema v3.0: accepts docId
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
window.deleteTemplate = deleteTemplate;
window.resetToDefault = resetToDefault;
window.closeEquipmentPicker = closeEquipmentPicker;
window.skipEquipmentSelection = skipEquipmentSelection;
window.confirmEquipmentSelection = confirmEquipmentSelection;
window.addEquipmentFromPicker = addEquipmentFromPicker;
window.closeTemplateExerciseEdit = closeTemplateExerciseEdit;
window.saveTemplateExerciseEdit = saveTemplateExerciseEdit;
window.selectWorkoutCategory = selectWorkoutCategory;
window.showWorkoutCategoryView = showWorkoutCategoryView;
window.handleWorkoutSearch = handleWorkoutSearch;

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
window.debugWeeklyStats = debugWeeklyStats;
window.forceCheckHistoryData = forceCheckHistoryData;
window.testHistoryFilters = testHistoryFilters;
window.fixWorkoutHistoryReference = fixWorkoutHistoryReference;
window.emergencyFixFilters = emergencyFixFilters;
window.runAllDebugChecks = runAllDebugChecks;
window.cleanupDuplicateExercises = cleanupDuplicateExercises;
window.scanDuplicateExercises = scanDuplicateExercises;
window.mergeDuplicateExercises = mergeDuplicateExercises;

// Workout history editor utilities
window.getWorkoutHistoryForEditing = getWorkoutHistoryForEditing;
window.updateWorkoutLocation = updateWorkoutLocation;
window.updateExerciseEquipment = updateExerciseEquipment;
window.bulkUpdateEquipment = bulkUpdateEquipment;
window.listAllEquipment = listAllEquipment;
window.findIncompleteWorkouts = findIncompleteWorkouts;
window.migrateEquipmentToExercises = migrateEquipmentToExercises;

// Streak and PR recalculation utilities
window.recalculateStreaks = recalculateStreaks;
window.rebuildAllPRs = rebuildAllPRs;
window.recalculateAllStats = recalculateAllStats;
window.showPRSummary = showPRSummary;
window.renameExercise = renameExercise;

// State access (for debugging)
window.AppState = AppState;

// Firebase Workout Manager (for exercise-manager.html)
window.FirebaseWorkoutManager = FirebaseWorkoutManager;

// Push notification functions (for iOS background notifications)
window.initializeFCM = initializeFCM;
window.sendTestNotification = sendTestNotification;
window.isFCMAvailable = isFCMAvailable;

// PR Tracker - expose for debugging and rebuilding
import { PRTracker } from './core/features/pr-tracker.js';
window.PRTracker = PRTracker;

// Debug utility to rebuild PRs from workout history
window.rebuildPRs = async function() {
    console.log('Rebuilding PRs from workout history...');
    const result = await PRTracker.rebuildPRsFromHistory();
    if (result.success) {
        console.log(`✅ Rebuilt PRs: ${result.workoutsProcessed} workouts, ${result.setsProcessed} sets processed`);
        console.log('Refresh the page to see updated PRs');
    } else {
        console.error('❌ Failed to rebuild PRs:', result.error);
    }
    return result;
};

// ===================================================================
// ===================================================================
// ONE-TIME FIX UTILITY
// ===================================================================

// Import and expose the template fix utility
import { fixTemplateExercises } from './core/utils/fix-template-exercises.js';
window.fixTemplateExercises = fixTemplateExercises;

console.log('🔧 Template fix utility loaded. Run window.fixTemplateExercises() to normalize template exercises.');

// ===================================================================
// SIMPLE INITIALIZATION - Just call your existing startApplication
// ===================================================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await startApplication();
    } catch (error) {
        console.error('Application startup failed:', error);

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