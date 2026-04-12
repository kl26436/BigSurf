// Simple main.js - Just fix the import paths and call startApplication

// ===================================================================
// FIXED IMPORTS - Your existing modules, correct paths
// ===================================================================

// Core modules
import { AppState } from './core/utils/app-state.js';
import { getCategoryIcon } from './core/utils/config.js';
import { startApplication } from './core/app-initialization.js';
import { updateSetting, onboardingNext, completeOnboarding, rebuildPRsFromSettings } from './core/ui/settings-ui.js';
import { exportWorkoutData } from './core/data/data-manager.js';
import {
    openEquipmentLibrary, openEquipmentDetail, backToEquipmentList,
    filterEquipmentByLocation, filterEquipmentBySearch,
    assignExerciseToEquipment, filterAssignList, confirmAssignExercise, unassignExercise,
    editEquipmentExerciseVideoFromLib, deleteEquipmentFromLibrary,
    saveEquipmentNotes, showAddEquipmentFlow,
} from './core/ui/equipment-library-ui.js';

// Authentication functions
import { signIn, signOutUser } from './core/app-initialization.js';

// Workout core functionality
import {
    startWorkout,
    completeWorkout,
    cancelWorkout,
    cancelCurrentWorkout,
    continueInProgressWorkout,
    discardInProgressWorkout,
    discardEditedWorkout,
    editHistoricalWorkout,
    saveActiveWorkoutAsTemplate,
    toggleWorkoutOverflowMenu,
    closeWorkoutOverflowMenu,
    focusExercise,
    updateSet,
    cycleSetType,
    addSet,
    deleteSet,
    addSetToExercise,
    removeSetFromExercise,
    saveExerciseNotes,
    markExerciseComplete,
    deleteExerciseFromWorkout,
    addExerciseToActiveWorkout,
    confirmExerciseAddToWorkout,
    toggleModalRestTimer,
    skipModalRestTimer,
    showExerciseVideo,
    hideExerciseVideo,
    showExerciseVideoAndToggleButton,
    hideExerciseVideoAndToggleButton,
    setGlobalUnit,
    setExerciseUnit,
    editExerciseDefaults,
    closeExerciseModal,
    loadExerciseHistory,
    autoStartRestTimer,
    toggleSetComplete,
    skipHeaderRestTimer,
    toggleReorderMode,
    supersetWithNext,
    ungroupExerciseFromWorkout,
    changeExerciseEquipment,
    applyEquipmentChange,
    changeWorkoutLocation,
    selectWorkoutLocationOption,
    closeWorkoutLocationSelector,
    confirmWorkoutLocationChange,
} from './core/workout/workout-core.js';

// Template selection functionality
import {
    showTemplateSelection,
    closeTemplateSelection,
    showWorkoutSelector,
    useTemplate,
    useTemplateFromManagement,
    copyTemplateToCustom,
    deleteCustomTemplate,
} from './core/ui/template-selection.js';

// Workout history UI functionality
import {
    showWorkoutHistory,
    viewWorkout,
    resumeWorkout,
    resumeWorkoutById,
    repeatWorkout,
    deleteWorkout,
    retryWorkout,
    clearAllHistoryFilters,
} from './core/ui/workout-history-ui.js';

// Workout management UI
import {
    showWorkoutManagement,
    closeWorkoutManagement,
    createNewTemplate,
    saveWorkoutAsTemplate,
    closeTemplateEditor,
    saveCurrentTemplate,
    addExerciseToTemplate,
    editTemplateExercise,
    removeTemplateExercise,
    moveTemplateExercise,
    groupSelectedTemplateExercises,
    ungroupTemplateExercise,
    updateSupersetSelectionBar,
    openExerciseLibrary,
    closeExerciseLibrary,
    showCreateExerciseForm,
    closeCreateExerciseModal,
    createNewExercise,
    editTemplate,
    deleteTemplate,
    resetToDefault,
    closeEquipmentPicker,
    skipEquipmentSelection,
    confirmEquipmentSelection,
    addEquipmentFromPicker,
    closeTemplateExerciseEdit,
    saveTemplateExerciseEdit,
    saveInlineEdit,
    confirmInlineAdd,
    cancelInlineAdd,
    selectWorkoutCategory,
    showWorkoutCategoryView,
    handleWorkoutSearch,
} from './core/workout/workout-management-ui.js';

// Manual workout functionality
import {
    showAddManualWorkoutModal,
    closeAddManualWorkoutModal,
    toggleManualWorkoutSource,
    selectWorkoutForManual,
    startCustomManualWorkout,
    backToManualStep1,
    updateManualSet,
    addManualSet,
    removeManualSet,
    removeManualExercise,
    openExercisePickerForManual,
    addExerciseToManualWorkout,
    addToManualWorkoutFromLibrary,
    saveManualWorkout,
    openEquipmentPickerForManual,
    selectEquipmentForManual,
    closeEquipmentPickerForManual,
    // Legacy exports for backwards compatibility
    proceedToExerciseSelection,
    backToBasicInfo,
    finishManualWorkout,
    editManualExercise,
    markManualExerciseComplete,
    closeManualExerciseEntry,
} from './core/features/manual-workout.js';

// Exercise manager functionality
import {
    openExerciseManager,
    closeExerciseManager,
    filterExerciseLibrary,
    showAddExerciseModal,
    closeAddExerciseModal,
    editExercise,
    saveExercise,
    deleteExercise,
    clearSelectedEquipment,
    addEquipmentToList,
    openEditExerciseSection,
    closeEditExerciseSection,
    saveExerciseFromSection,
    deleteExerciseFromSection,
    openEquipmentEditor,
    closeEquipmentEditor,
    addLocationToEquipmentEditor,
    removeLocationFromEquipmentEditor,
    saveEquipmentFromEditor,
    deleteEquipmentFromEditor,
    showReassignEquipment,
    confirmReassignmentTarget,
    commitReassignment,
    closeReassignModal,
    editEquipmentExerciseVideo,
    // New category grid functions
    showCategoryView,
    selectBodyPartCategory,
    filterByEquipment,
    handleExerciseSearch,
    handleExerciseCardClick,
} from './core/ui/exercise-manager-ui.js';

// Location selector functionality
import {
    showLocationSelector,
    closeLocationSelector,
    selectSavedLocation,
    selectNewLocation,
    skipLocationSelection,
    showLocationManagement,
    setLocationAsCurrent,
    addNewLocationFromManagement,
    detectAndAddLocation,
    closeAddLocationModal,
    saveNewLocationFromModal,
    editLocationName,
    deleteLocation,
    showLocationOnMapById,
    switchLocationMethod,
    searchLocationAddress,
    selectAddressResult,
    applyManualCoords,
} from './core/features/location-ui.js';

// Location service (GPS-based location detection)
import { getSessionLocation } from './core/features/location-service.js';

// Body measurements (Phase 12)
import {
    showWeightEntryModal,
    closeWeightEntryModal,
    saveBodyWeightEntry,
    showMeasurementsModal,
    closeMeasurementsModal,
    saveMeasurementsEntry,
    showWeightHistory,
    closeWeightHistory,
    deleteWeightEntry,
    setBodyWeightTimeRange,
} from './core/features/body-measurements-ui.js';

// Data export/import (Phase 13)
import {
    exportWorkoutDataAsCSV,
    showImportModal,
    closeImportModal,
    handleImportFileSelect,
    confirmImport,
} from './core/data/data-export-import.js';

// UI helpers
import { setHeaderMode, escapeHtml, escapeAttr, openModal, closeModal } from './core/ui/ui-helpers.js';

// Navigation functionality
import {
    openSidebar,
    closeSidebar,
    navigateTo,
    bottomNavTo,
    toggleMoreMenu,
    closeMoreMenu,
} from './core/ui/navigation.js';

// Dashboard functionality
import {
    repeatLastWorkout,
    startSuggestedWorkout,
    toggleDashboardSection,
    toggleDashboardPRBodyPart,
} from './core/ui/dashboard-ui.js';

// Stats functionality
import {
    closeStats,
    toggleStatsSection,
    togglePRBodyPart,
    filterPRs,
    clearPRFilters,
    selectProgressExercise,
    setProgressTimeRange,
    setProgressChartType,
    selectProgressCategory,
    selectProgressExerciseName,
} from './core/ui/stats-ui.js';

// Debug utilities — loaded on demand with ?debug URL param

// ===================================================================
// CALENDAR NAVIGATION FUNCTIONS (Add to window assignments)
// ===================================================================

// Calendar navigation
window.previousMonth = function () {
    if (window.workoutHistory && typeof window.workoutHistory.previousMonth === 'function') {
        window.workoutHistory.previousMonth();
    }
};

window.nextMonth = function () {
    if (window.workoutHistory && typeof window.workoutHistory.nextMonth === 'function') {
        window.workoutHistory.nextMonth();
    }
};

// Workout detail functions
window.viewWorkout = function (workoutId) {
    if (window.workoutHistory && typeof window.workoutHistory.showWorkoutDetail === 'function') {
        window.workoutHistory.showWorkoutDetail(workoutId);
    }
};

// Add workout function
window.addWorkout = function () {
    if (typeof window.showAddManualWorkoutModal === 'function') {
        window.showAddManualWorkoutModal();
    }
};

// ===================================================================
// ASSIGN ALL FUNCTIONS TO WINDOW (your existing assignments)
// ===================================================================

// Core Workout Functions
window.startWorkout = startWorkout;
window.completeWorkout = completeWorkout;
window.cancelWorkout = cancelWorkout;
window.cancelCurrentWorkout = cancelCurrentWorkout;
window.continueInProgressWorkout = continueInProgressWorkout;
window.discardInProgressWorkout = discardInProgressWorkout;
window.discardEditedWorkout = discardEditedWorkout;
window.editHistoricalWorkout = editHistoricalWorkout;
window.saveActiveWorkoutAsTemplate = saveActiveWorkoutAsTemplate;
window.toggleWorkoutOverflowMenu = toggleWorkoutOverflowMenu;
window.closeWorkoutOverflowMenu = closeWorkoutOverflowMenu;
window.startWorkoutFromModal = function (workoutName) {
    // Close the modal (hide it, don't remove it from DOM)
    const modal = document.getElementById('template-selection-modal');
    if (modal) {
        closeModal(modal);
    }

    // Try different ways to call startWorkout
    if (window.startWorkout) {
        window.startWorkout(workoutName);
    } else if (typeof startWorkout === 'function') {
        startWorkout(workoutName);
    } else {
        // Import and call the function dynamically
        import('./core/workout/workout-core.js').then((module) => {
            if (module.startWorkout) {
                module.startWorkout(workoutName);
            }
        });
    }
};

// Exercise Management
window.focusExercise = focusExercise;
window.updateSet = updateSet;
window.cycleSetType = cycleSetType;
window.addSet = addSet;
window.deleteSet = deleteSet;
window.addSetToExercise = addSetToExercise;
window.removeSetFromExercise = removeSetFromExercise;
window.saveExerciseNotes = saveExerciseNotes;
window.markExerciseComplete = markExerciseComplete;
window.toggleSetComplete = toggleSetComplete;
window.deleteExerciseFromWorkout = deleteExerciseFromWorkout;
window.editExerciseDefaults = editExerciseDefaults;
window.addExerciseToActiveWorkout = addExerciseToActiveWorkout;
window.confirmExerciseAddToWorkout = confirmExerciseAddToWorkout;
window.closeExerciseModal = closeExerciseModal;
window.loadExerciseHistory = function (exerciseName, exerciseIndex) {
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
window.skipHeaderRestTimer = skipHeaderRestTimer;
window.toggleReorderMode = toggleReorderMode;
window.supersetWithNext = supersetWithNext;
window.ungroupExerciseFromWorkout = ungroupExerciseFromWorkout;

// Plate Calculator (lazy-loaded)
window.openPlateCalcPopover = async function (exerciseIndex) {
    const { openPlateCalcPopover } = await import('./core/features/plate-calculator.js');
    openPlateCalcPopover(exerciseIndex);
};

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
window.showAddExerciseModal = showAddExerciseModal;
window.closeAddExerciseModal = closeAddExerciseModal;
window.editExercise = editExercise;
window.saveExercise = saveExercise;
window.deleteExercise = deleteExercise;
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
window.showReassignEquipment = showReassignEquipment;
window.confirmReassignmentTarget = confirmReassignmentTarget;
window.commitReassignment = commitReassignment;
window.closeReassignModal = closeReassignModal;
window.editEquipmentExerciseVideo = editEquipmentExerciseVideo;
// New category grid functions
window.showCategoryView = showCategoryView;
window.selectBodyPartCategory = selectBodyPartCategory;
window.filterByEquipment = filterByEquipment;
window.handleExerciseSearch = handleExerciseSearch;
window.handleExerciseCardClick = handleExerciseCardClick;

// Location Selector Functions
window.showLocationSelector = showLocationSelector;
window.closeLocationSelector = closeLocationSelector;
window.selectSavedLocation = selectSavedLocation;
window.selectNewLocation = selectNewLocation;
window.skipLocationSelection = skipLocationSelection;

// Location Management Functions
window.showLocationManagement = showLocationManagement;
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
window.setHeaderMode = setHeaderMode;

// Dashboard Functions
window.repeatLastWorkout = repeatLastWorkout;
window.startSuggestedWorkout = startSuggestedWorkout;
window.toggleDashboardSection = toggleDashboardSection;
window.toggleDashboardPRBodyPart = toggleDashboardPRBodyPart;

// Stats Functions
window.closeStats = closeStats;
window.toggleStatsSection = toggleStatsSection;
window.togglePRBodyPart = togglePRBodyPart;
window.filterPRs = filterPRs;
window.clearPRFilters = clearPRFilters;
window.selectProgressExercise = selectProgressExercise;
window.setProgressTimeRange = setProgressTimeRange;
window.setProgressChartType = setProgressChartType;
window.selectProgressCategory = selectProgressCategory;
window.selectProgressExerciseName = selectProgressExerciseName;

// Template Selection Functions
window.showTemplateSelection = showTemplateSelection;
window.closeTemplateSelection = closeTemplateSelection;
window.showWorkoutSelector = showWorkoutSelector;
window.useTemplate = useTemplate;
window.useTemplateFromManagement = useTemplateFromManagement;
window.copyTemplateToCustom = copyTemplateToCustom;
window.deleteCustomTemplate = deleteCustomTemplate;
window.showTemplatesByCategory = function (category) {
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
    const filteredWorkouts = window.AppState.workoutPlans.filter((workout) => {
        // Check explicit category field first, then derive from name
        const workoutCategory =
            workout.category?.toLowerCase() ||
            workout.type?.toLowerCase() ||
            getWorkoutCategory(workout.day || workout.name || '');
        return workoutCategory === category.toLowerCase();
    });

    const categoryIcon = getCategoryIcon(category);

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
        filteredWorkouts.forEach((workout) => {
            const workoutName = workout.name || workout.day || 'Unnamed Workout';

            // Normalize exercises to array format
            let exercisesArray = [];
            if (workout.exercises) {
                if (Array.isArray(workout.exercises)) {
                    exercisesArray = workout.exercises;
                } else if (typeof workout.exercises === 'object') {
                    const keys = Object.keys(workout.exercises).sort();
                    exercisesArray = keys.map((key) => workout.exercises[key]).filter((ex) => ex);
                }
            }
            const exerciseCount = exercisesArray.length;

            // Create exercise summary
            let exerciseSummary = 'No exercises';
            if (exerciseCount > 0) {
                const names = exercisesArray.slice(0, 3).map((ex) => ex.name || ex.machine);
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
                    <div class="workout-item-name">${escapeHtml(workoutName)}</div>
                    <div class="workout-item-meta">${exerciseCount} exercises</div>
                    <div class="workout-item-exercises">${escapeHtml(exerciseSummary)}</div>
                </div>
                <button class="btn btn-primary btn-sm start-workout-btn">
                    <i class="fas fa-play"></i> Start
                </button>
            `;

            card.addEventListener('click', () => {
                window.startWorkoutFromModal(workoutName);
            });

            gridEl.appendChild(card);
        });
    }

    // Show the modal
    openModal(modal);
};

window.closeTemplateModal = function () {
    const modal = document.getElementById('template-selection-modal');
    if (modal) {
        closeModal(modal);
    }
};

window.closeTemplateSelection = function () {
    window.closeTemplateModal();
};

// Workout History Functions
window.showWorkoutHistory = showWorkoutHistory;
window.viewWorkout = viewWorkout;
window.resumeWorkout = resumeWorkout;
window.resumeWorkoutById = resumeWorkoutById; // Schema v3.0: accepts docId
window.repeatWorkout = repeatWorkout;
window.deleteWorkout = deleteWorkout;
window.retryWorkout = retryWorkout;
window.clearAllHistoryFilters = clearAllHistoryFilters;
window.closeWorkoutDetailModal = function () {
    const modal = document.getElementById('workout-detail-modal');
    if (modal) {
        closeModal(modal);
    }
};

// Workout Management Functions
window.showWorkoutManagement = showWorkoutManagement;
window.closeWorkoutManagement = closeWorkoutManagement;
window.createNewTemplate = createNewTemplate;
window.saveWorkoutAsTemplate = saveWorkoutAsTemplate;
window.closeTemplateEditor = closeTemplateEditor;
window.saveCurrentTemplate = saveCurrentTemplate;
window.addExerciseToTemplate = addExerciseToTemplate;
window.editTemplateExercise = editTemplateExercise;
window.removeTemplateExercise = removeTemplateExercise;
window.moveTemplateExercise = moveTemplateExercise;
window.groupSelectedTemplateExercises = groupSelectedTemplateExercises;
window.ungroupTemplateExercise = ungroupTemplateExercise;
window.updateSupersetSelectionBar = updateSupersetSelectionBar;
window.openExerciseLibrary = openExerciseLibrary;
window.closeExerciseLibrary = closeExerciseLibrary;
window.showCreateExerciseForm = showCreateExerciseForm;
window.closeCreateExerciseModal = closeCreateExerciseModal;
window.createNewExercise = createNewExercise;
window.editTemplate = editTemplate;
window.deleteTemplate = deleteTemplate;
window.resetToDefault = resetToDefault;
window.closeEquipmentPicker = closeEquipmentPicker;
window.skipEquipmentSelection = skipEquipmentSelection;
window.confirmEquipmentSelection = confirmEquipmentSelection;
window.addEquipmentFromPicker = addEquipmentFromPicker;
window.closeTemplateExerciseEdit = closeTemplateExerciseEdit;
window.saveTemplateExerciseEdit = saveTemplateExerciseEdit;
window.saveInlineEdit = saveInlineEdit;
window.confirmInlineAdd = confirmInlineAdd;
window.cancelInlineAdd = cancelInlineAdd;
window.selectWorkoutCategory = selectWorkoutCategory;
window.showWorkoutCategoryView = showWorkoutCategoryView;
window.handleWorkoutSearch = handleWorkoutSearch;

// Authentication Functions
window.signIn = signIn;
window.signOutUser = signOutUser;

// Settings
window.updateSetting = updateSetting;
window.onboardingNext = onboardingNext;
window.completeOnboarding = completeOnboarding;
window.exportWorkoutData = exportWorkoutData;
window.rebuildPRsFromSettings = rebuildPRsFromSettings;

// Body Measurements (Phase 12)
window.showWeightEntryModal = showWeightEntryModal;
window.closeWeightEntryModal = closeWeightEntryModal;
window.saveBodyWeightEntry = saveBodyWeightEntry;
window.showMeasurementsModal = showMeasurementsModal;
window.closeMeasurementsModal = closeMeasurementsModal;
window.saveMeasurementsEntry = saveMeasurementsEntry;
window.showWeightHistory = showWeightHistory;
window.closeWeightHistory = closeWeightHistory;
window.deleteWeightEntry = deleteWeightEntry;
window.setBodyWeightTimeRange = setBodyWeightTimeRange;

// Data Export/Import (Phase 13)
window.exportWorkoutDataAsCSV = exportWorkoutDataAsCSV;
window.showImportModal = showImportModal;
window.closeImportModal = closeImportModal;
window.handleImportFileSelect = handleImportFileSelect;
window.confirmImport = confirmImport;

// Equipment Library
window.openEquipmentLibrary = openEquipmentLibrary;
window.openEquipmentDetail = openEquipmentDetail;
window.backToEquipmentList = backToEquipmentList;
window.filterEquipmentByLocation = filterEquipmentByLocation;
window.filterEquipmentBySearch = filterEquipmentBySearch;
window.assignExerciseToEquipment = assignExerciseToEquipment;
window.filterAssignList = filterAssignList;
window.confirmAssignExercise = confirmAssignExercise;
window.unassignExercise = unassignExercise;
window.editEquipmentExerciseVideoFromLib = editEquipmentExerciseVideoFromLib;
window.deleteEquipmentFromLibrary = deleteEquipmentFromLibrary;
window.saveEquipmentNotes = saveEquipmentNotes;
window.showAddEquipmentFlow = showAddEquipmentFlow;

// State access (for debugging — used by ui-helpers.js and error-handler.js in production)
window.AppState = AppState;

// Debug Functions — lazy-loaded only when ?debug is in URL
if (new URL(window.location).searchParams.has('debug')) {
    Promise.all([
        import('./core/utils/debug-utilities.js'),
        import('./core/data/firebase-workout-manager.js'),
        import('./core/utils/push-notification-manager.js'),
        import('./core/features/pr-tracker.js'),
    ]).then(([debugMod, fwmMod, pushMod, prMod]) => {
        Object.keys(debugMod).forEach((key) => {
            window[key] = debugMod[key];
        });

        // Firebase Workout Manager, push notifications, PR Tracker — console debugging only
        window.FirebaseWorkoutManager = fwmMod.FirebaseWorkoutManager;
        window.initializeFCM = pushMod.initializeFCM;
        window.sendTestNotification = pushMod.sendTestNotification;
        window.isFCMAvailable = pushMod.isFCMAvailable;
        window.PRTracker = prMod.PRTracker;

        window.rebuildPRs = async function () {
            console.log('Rebuilding PRs from workout history...');
            const result = await prMod.PRTracker.rebuildPRsFromHistory();
            if (result.success) {
                console.log(
                    `✅ Rebuilt PRs: ${result.workoutsProcessed} workouts, ${result.setsProcessed} sets processed`
                );
                console.log('Refresh the page to see updated PRs');
            } else {
                console.error('❌ Failed to rebuild PRs:', result.error);
            }
            return result;
        };

        console.log('🔧 Debug utilities loaded');
    });
}

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
