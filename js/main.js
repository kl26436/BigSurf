// Simple main.js - Just fix the import paths and call startApplication

// ===================================================================
// FIXED IMPORTS - Your existing modules, correct paths
// ===================================================================

// Core modules
import { AppState } from './core/utils/app-state.js';
import { getCategoryIcon } from './core/utils/config.js';
import { startApplication } from './core/app-initialization.js';
import { updateSetting, onboardingNext, onboardingBack, onboardingSkipWeightGoal, completeOnboarding, restartOnboarding, rebuildPRsFromSettings, confirmDeleteAllData, openProfile, editProfileName, editProfileHeight, editProfileBirthday, editProfileExperience, selectProfileExperience, closeProfileExperiencePicker, closeProfile, editBodyWeightGoal } from './core/ui/settings-ui.js';
import { exportWorkoutData } from './core/data/data-manager.js';
import { dismissFirstUseTip } from './core/features/first-use-tips.js';
import {
    openEquipmentLibrary, openEquipmentDetail, backToEquipmentList,
    filterEquipmentByLocation, filterEquipmentBySearch,
    toggleEquipmentSearch, toggleEquipmentExercise,
    assignExerciseToEquipment, filterAssignList, confirmAssignExercise, unassignExercise,
    saveEquipmentExerciseVideoFromLib, deleteEquipmentFromLibrary,
    saveEquipmentNotes, showAddEquipmentFlow,
    selectEquipType, updateEquipNamePreview, confirmAddEquipment,
    saveEquipmentBaseWeight, setEquipmentBaseWeightUnit, saveEquipmentField, removeEquipmentLocation,
    setEquipmentView, toggleBrandSection,
} from './core/ui/equipment-library-ui.js';

// Authentication functions
import { signIn, signOutUser, executeEquipmentMigration, dismissEquipmentMigration, downloadEquipmentMigrationBackup } from './core/app-initialization.js';

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
    toggleWorkoutOverflow,
    closeWorkoutOverflow,
    updateWorkoutProgress,
    showMidWorkoutSummary,
    updateSet,
    addSet,
    deleteSet,
    addSetToExercise,
    removeSetFromExercise,
    saveExerciseNotes,
    updateCardioField,
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
    loadExerciseHistory,
    autoStartRestTimer,
    toggleSetComplete,
    toggleHeaderRestTimer,
    skipHeaderRestTimer,
    toggleReorderMode,
    toggleExerciseOverflow,
    supersetWithNext,
    ungroupExerciseFromWorkout,
    toggleExerciseExpansion,
    replaceExercise,
    changeExerciseEquipment,
    applyEquipmentChange,
    changeWorkoutLocation,
    selectWorkoutLocationOption,
    closeWorkoutLocationSelector,
    confirmWorkoutLocationChange,
    updateBodyweightSet,
    // Active Workout V2
    renderActiveWorkout,
    loadAutofillForAllExercises,
    awJumpTo,
    awNextExercise,
    awToggleSet,
    awUpdateSet,
    awAddSet,
    awRemoveSet,
    awSaveNotes,
    awAutoGrowNotes,
    awToggleExerciseMenu,
    awToggleWorkoutMenu,
    awCloseMenus,
    awDeleteExercise,
    awReplaceExercise,
    awConfirmExit,
    awCancelWorkout,
    awFinishWorkout,
    awUnlinkSuperset,
    awUnlinkSupersetGroup,
    awOpenJumpSheet,
    awOpenSupersetSheet,
    awToggleSupersetSelect,
    awConfirmSupersetLink,
    awOpenEquipmentSheet,
    awSelectEquipment,
    awAddExercise,
    awSetAddFilter,
    awSetAddSearch,
    awInsertExercise,
    awCloseSheet,
    awRestAdd30,
    awRestSkip,
    awEditRestDuration,
    awToggleUnit,
    awToggleReorder,
    awMoveExercise,
    awEndReorder,
    awEquipSearch,
    awQuickAddEquipment,
    awSaveNewEquipment,
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
    toggleEquipmentFilter,
    clearEquipmentFilterCache,
    clearSelectorCache,
    toggleTemplateEdit,
    searchWorkoutTemplates,
    moveTemplateExerciseInline,
    removeTemplateExerciseInline,
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
    toggleTemplateExerciseMenu,
    selectTemplateCategory,
    toggleTemplateDay,
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
    quickAddRecentExercise,
    manualConfirmAutofill,
    saveManualWorkout,
    editManualDate,
    editManualDuration,
    applyManualDate,
    adjustManualDuration,
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
    setExerciseBodyPart,
    setExerciseEquipmentType,
    adjustExerciseStepper,
    toggleEditExerciseMore,
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
    showLocationDetail,
    updateLocationRadius,
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
    showWeightHistory,
    closeWeightHistory,
    deleteWeightEntry,
    setBodyWeightTimeRange,
} from './core/features/body-measurements-ui.js';

// Bodyweight exercise prompt
import { ensureFreshBodyWeight, editBodyWeight } from './core/features/bodyweight-prompt.js';

// Data export/import (Phase 13)
import {
    exportWorkoutDataAsCSV,
    showImportModal,
    closeImportModal,
    handleImportFileSelect,
    confirmImport,
} from './core/data/data-export-import.js';

// Withings integration
import {
    connectWithings,
    syncWithingsWeight,
    getWithingsStatus,
    disconnectWithings,
    handleWithingsCallback,
    processPendingWithingsCallback,
} from './core/features/withings-integration.js';

// AI Coach (Phase 17)
import {
    showAICoach,
    closeAICoach,
    openCoachHistory,
    openCoachTemplate,
    sendCoachMessage,
    askCoach,
    resetCoachUI,
    showPastCoachSession,
    showWorkoutBuilder,
    generateWorkoutTemplate,
    removePreviewExercise,
    saveGeneratedTemplate,
} from './core/features/ai-coach-ui.js';

// DEXA Scan Integration (Phase 18)
import {
    renderDexaCard,
    showDexaUploadModal,
    closeDexaUploadModal,
    handleDexaFileSelect,
    clearDexaFile,
    handleDexaUpload,
    handleDexaContinue,
    selectDexaUnit,
    showDexaManualEntry,
    showDexaReviewForm,
    toggleDexaSection,
    confirmDexaSave,
    showDexaHistory,
    closeDexaHistory,
    showDexaDetail,
    closeDexaDetail,
    deleteDexaEntry,
} from './core/features/dexa-scan-ui.js';

// Error Log UI
import {
    initErrorBadge,
    showErrorLog,
    closeErrorLog,
    toggleErrorLogSource,
    clearAllErrors,
    copyErrorLog,
    exportErrorLog,
    toggleErrorDetail,
    showBugReport,
} from './core/ui/error-log-ui.js';

// Error handler — public capture APIs
import { captureError, captureWarning, getErrorLog, loadPersistedErrors } from './core/utils/error-handler.js';

// UI helpers
import { setHeaderMode, escapeHtml, escapeAttr, openModal, closeModal } from './core/ui/ui-helpers.js';

// Navigation functionality
import {
    navigateTo,
    navigateBack,
    bottomNavTo,
    toggleMoreMenu,
    closeMoreMenu,
    setWorkoutActiveState,
    showMuscleGroupDetail,
    showExerciseDetail,
    showCompositionDetail,
} from './core/ui/navigation.js';

// Dashboard functionality
import {
    startWorkoutFromHistory,
    dismissInsight,
    openWorkoutSelectorForDay,
    resumeActiveWorkout,
    confirmCancelActiveWorkout,
} from './core/ui/dashboard-ui.js';

// Metric detail (drill-down from dashboard cards)
import { openMetricDetail, closeMetricDetail, setDetailRange, deleteBodyWeightEntry } from './core/ui/metric-detail-ui.js';

// Range filter
import { setRange } from './core/features/metrics/range-filter.js';
import { showDashboard } from './core/ui/dashboard-ui.js';

// Stats tab removed — drill-downs now live in dashboard v2

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
window.toggleWorkoutOverflow = toggleWorkoutOverflow;
window.closeWorkoutOverflow = closeWorkoutOverflow;
window.updateWorkoutProgress = updateWorkoutProgress;
window.showMidWorkoutSummary = showMidWorkoutSummary;
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
window.toggleExerciseExpansion = toggleExerciseExpansion;
window.replaceExercise = replaceExercise;
window.updateSet = updateSet;
// cycleSetType removed — set types not used in UI
window.addSet = addSet;
window.deleteSet = deleteSet;
window.addSetToExercise = addSetToExercise;
window.removeSetFromExercise = removeSetFromExercise;
window.saveExerciseNotes = saveExerciseNotes;
window.updateCardioField = updateCardioField;
window.markExerciseComplete = markExerciseComplete;
window.toggleSetComplete = toggleSetComplete;
window.deleteExerciseFromWorkout = deleteExerciseFromWorkout;
window.editExerciseDefaults = editExerciseDefaults;
window.addExerciseToActiveWorkout = addExerciseToActiveWorkout;
window.confirmExerciseAddToWorkout = confirmExerciseAddToWorkout;
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
window.toggleHeaderRestTimer = toggleHeaderRestTimer;
window.skipHeaderRestTimer = skipHeaderRestTimer;
window.toggleReorderMode = toggleReorderMode;
window.toggleExerciseOverflow = toggleExerciseOverflow;
window.supersetWithNext = supersetWithNext;
window.ungroupExerciseFromWorkout = ungroupExerciseFromWorkout;

// Active Workout V2 — wizard UI
window.renderActiveWorkout = renderActiveWorkout;
window.loadAutofillForAllExercises = loadAutofillForAllExercises;
window.awJumpTo = awJumpTo;
window.awNextExercise = awNextExercise;
window.awToggleSet = awToggleSet;
window.awUpdateSet = awUpdateSet;
window.awAddSet = awAddSet;
window.awRemoveSet = awRemoveSet;
window.awSaveNotes = awSaveNotes;
window.awAutoGrowNotes = awAutoGrowNotes;
window.awToggleExerciseMenu = awToggleExerciseMenu;
window.awToggleWorkoutMenu = awToggleWorkoutMenu;
window.awCloseMenus = awCloseMenus;
window.awDeleteExercise = awDeleteExercise;
window.awReplaceExercise = awReplaceExercise;
window.awConfirmExit = awConfirmExit;
window.awCancelWorkout = awCancelWorkout;
window.awFinishWorkout = awFinishWorkout;
window.awUnlinkSuperset = awUnlinkSuperset;
window.awUnlinkSupersetGroup = awUnlinkSupersetGroup;
window.awOpenJumpSheet = awOpenJumpSheet;
window.awOpenSupersetSheet = awOpenSupersetSheet;
window.awToggleSupersetSelect = awToggleSupersetSelect;
window.awConfirmSupersetLink = awConfirmSupersetLink;
window.awOpenEquipmentSheet = awOpenEquipmentSheet;
window.awSelectEquipment = awSelectEquipment;
window.awAddExercise = awAddExercise;
window.awSetAddFilter = awSetAddFilter;
window.awSetAddSearch = awSetAddSearch;
window.awInsertExercise = awInsertExercise;
window.awCloseSheet = awCloseSheet;
window.awRestAdd30 = awRestAdd30;
window.awRestSkip = awRestSkip;
window.awEditRestDuration = awEditRestDuration;
window.awToggleUnit = awToggleUnit;
window.awToggleReorder = awToggleReorder;
window.awMoveExercise = awMoveExercise;
window.awEndReorder = awEndReorder;
window.awEquipSearch = awEquipSearch;
window.awQuickAddEquipment = awQuickAddEquipment;
window.awSaveNewEquipment = awSaveNewEquipment;

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
window.quickAddRecentExercise = quickAddRecentExercise;
window.manualConfirmAutofill = manualConfirmAutofill;
window.saveManualWorkout = saveManualWorkout;
window.editManualDate = editManualDate;
window.editManualDuration = editManualDuration;
window.applyManualDate = applyManualDate;
window.adjustManualDuration = adjustManualDuration;
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
window.setExerciseBodyPart = setExerciseBodyPart;
window.setExerciseEquipmentType = setExerciseEquipmentType;
window.adjustExerciseStepper = adjustExerciseStepper;
window.toggleEditExerciseMore = toggleEditExerciseMore;
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
window.showLocationDetail = showLocationDetail;
window.updateLocationRadius = updateLocationRadius;
window.switchLocationMethod = switchLocationMethod;
window.searchLocationAddress = searchLocationAddress;
window.selectAddressResult = selectAddressResult;
window.applyManualCoords = applyManualCoords;

// Modal helpers (used by inline onclick in HTML)
window.openModal = openModal;
window.closeModal = closeModal;

// Navigation Functions
window.navigateTo = navigateTo;
window.navigateBack = navigateBack;
window.bottomNavTo = bottomNavTo;
window.toggleMoreMenu = toggleMoreMenu;
window.closeMoreMenu = closeMoreMenu;
window.setHeaderMode = setHeaderMode;

// Dashboard Functions
window.dismissInsight = dismissInsight;
window.openWorkoutSelectorForDay = openWorkoutSelectorForDay;
window.startWorkoutFromHistory = startWorkoutFromHistory;
window.resumeActiveWorkout = resumeActiveWorkout;
window.confirmCancelActiveWorkout = confirmCancelActiveWorkout;
window.setWorkoutActiveState = setWorkoutActiveState;
window.showMuscleGroupDetail = showMuscleGroupDetail;
window.showExerciseDetail = showExerciseDetail;
window.showCompositionDetail = showCompositionDetail;

// Muscle group + exercise detail range setters (lazy-loaded)
window.setMuscleRange = async function (range) {
    const { setMuscleRange } = await import('./core/ui/muscle-group-detail-ui.js');
    setMuscleRange(range);
};
window.setExerciseRange = async function (range) {
    const { setExerciseRange } = await import('./core/ui/exercise-detail-ui.js');
    setExerciseRange(range);
};

// Metric Detail Functions
window.openMetricDetail = openMetricDetail;
window.closeMetricDetail = closeMetricDetail;
window.setDetailRange = setDetailRange;
window.deleteBodyWeightEntry = deleteBodyWeightEntry;
window.setDashboardRange = (r) => { setRange(r); showDashboard(); };

// Stats tab removed — drill-downs now live in dashboard v2

// Template Selection Functions
window.showTemplateSelection = showTemplateSelection;
window.closeTemplateSelection = closeTemplateSelection;
window.showWorkoutSelector = showWorkoutSelector;
window.useTemplate = useTemplate;
window.useTemplateFromManagement = useTemplateFromManagement;
window.copyTemplateToCustom = copyTemplateToCustom;
window.deleteCustomTemplate = deleteCustomTemplate;
window.toggleEquipmentFilter = toggleEquipmentFilter;
window.clearEquipmentFilterCache = clearEquipmentFilterCache;
window.clearSelectorCache = clearSelectorCache;
window.toggleTemplateEdit = toggleTemplateEdit;
window.searchWorkoutTemplates = searchWorkoutTemplates;
window.moveTemplateExerciseInline = moveTemplateExerciseInline;
window.removeTemplateExerciseInline = removeTemplateExerciseInline;

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
window.filterWorkoutHistory = function (query) {
    if (window.workoutHistory) window.workoutHistory.filterBySearch(query);
};
window.filterHistoryByCategory = function (category) {
    if (window.workoutHistory) window.workoutHistory.filterByCategory(category);
};
window.clearHistorySearch = function () {
    if (window.workoutHistory) window.workoutHistory.clearSearch();
};
window.toggleHistorySearch = function () {
    if (window.workoutHistory) window.workoutHistory.toggleHistorySearch();
};
window.closeWorkoutDetailModal = function () {
    const modal = document.getElementById('workout-detail-section');
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
window.selectTemplateCategory = selectTemplateCategory;
window.toggleTemplateDay = toggleTemplateDay;
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
window.toggleTemplateExerciseMenu = toggleTemplateExerciseMenu;

// Authentication Functions
window.signIn = signIn;
window.signOutUser = signOutUser;

// Equipment migration v2 prompt callbacks (invoked from inline onclick in the modal)
window.executeEquipmentMigration = executeEquipmentMigration;
window.dismissEquipmentMigration = dismissEquipmentMigration;
window.downloadEquipmentMigrationBackup = downloadEquipmentMigrationBackup;

// Settings
window.updateSetting = updateSetting;
window.onboardingNext = onboardingNext;
window.onboardingBack = onboardingBack;
window.onboardingSkipWeightGoal = onboardingSkipWeightGoal;
window.completeOnboarding = completeOnboarding;
window.restartOnboarding = restartOnboarding;
window.editBodyWeightGoal = editBodyWeightGoal;
window.exportWorkoutData = exportWorkoutData;
window.rebuildPRsFromSettings = rebuildPRsFromSettings;
window.confirmDeleteAllData = confirmDeleteAllData;
// Profile detail (§5)
window.openProfile = openProfile;
window.editProfileName = editProfileName;
window.editProfileHeight = editProfileHeight;
window.editProfileBirthday = editProfileBirthday;
window.editProfileExperience = editProfileExperience;
window.selectProfileExperience = selectProfileExperience;
window.closeProfileExperiencePicker = closeProfileExperiencePicker;
window.closeProfile = closeProfile;
window.dismissFirstUseTip = dismissFirstUseTip;

// Body Measurements (Phase 12)
window.showWeightEntryModal = showWeightEntryModal;
window.closeWeightEntryModal = closeWeightEntryModal;
window.saveBodyWeightEntry = saveBodyWeightEntry;
window.showWeightHistory = showWeightHistory;
window.closeWeightHistory = closeWeightHistory;
window.deleteWeightEntry = deleteWeightEntry;
window.setBodyWeightTimeRange = setBodyWeightTimeRange;

// Bodyweight Exercises + Equipment Base Weight
window.ensureFreshBodyWeight = ensureFreshBodyWeight;
window.editBodyWeight = editBodyWeight;
window.updateBodyweightSet = updateBodyweightSet;
window.saveEquipmentBaseWeight = saveEquipmentBaseWeight;
window.saveEquipmentField = saveEquipmentField;
window.setEquipmentBaseWeightUnit = setEquipmentBaseWeightUnit;

// Data Export/Import (Phase 13)
window.exportWorkoutDataAsCSV = exportWorkoutDataAsCSV;
window.showImportModal = showImportModal;
window.closeImportModal = closeImportModal;
window.handleImportFileSelect = handleImportFileSelect;
window.confirmImport = confirmImport;

// Withings Integration
window.connectWithings = connectWithings;
window.syncWithingsWeight = syncWithingsWeight;
window.disconnectWithings = disconnectWithings;

// AI Coach (Phase 17)
window.showAICoach = showAICoach;
window.closeAICoach = closeAICoach;
window.openCoachHistory = openCoachHistory;
window.openCoachTemplate = openCoachTemplate;
window.sendCoachMessage = sendCoachMessage;
window.askCoach = askCoach;
window.resetCoachUI = resetCoachUI;
window.showPastCoachSession = showPastCoachSession;
window.showWorkoutBuilder = showWorkoutBuilder;
window.generateWorkoutTemplate = generateWorkoutTemplate;
window.removePreviewExercise = removePreviewExercise;
window.saveGeneratedTemplate = saveGeneratedTemplate;

// DEXA Scan Integration (Phase 18)
window.renderDexaCard = renderDexaCard;
window.showDexaUploadModal = showDexaUploadModal;
window.closeDexaUploadModal = closeDexaUploadModal;
window.handleDexaFileSelect = handleDexaFileSelect;
window.clearDexaFile = clearDexaFile;
window.handleDexaUpload = handleDexaUpload;
window.handleDexaContinue = handleDexaContinue;
window.selectDexaUnit = selectDexaUnit;
window.showDexaManualEntry = showDexaManualEntry;
window.showDexaReviewForm = showDexaReviewForm;
window.toggleDexaSection = toggleDexaSection;
window.confirmDexaSave = confirmDexaSave;
window.showDexaHistory = showDexaHistory;
window.closeDexaHistory = closeDexaHistory;
window.showDexaDetail = showDexaDetail;
window.closeDexaDetail = closeDexaDetail;
window.deleteDexaEntry = deleteDexaEntry;

// Withings settings action — connects, syncs, or shows disconnect option
let _withingsConnected = false;
window.handleWithingsSettingsAction = async function () {
    if (_withingsConnected) {
        // Already connected — offer sync or disconnect
        const action = confirm('Withings is connected.\n\nOK = Sync now\nCancel = Disconnect');
        if (action) {
            await syncWithingsWeight();
        } else {
            if (confirm('Disconnect Withings?')) {
                await disconnectWithings();
                _withingsConnected = false;
                updateWithingsUI(false);
            }
        }
    } else {
        await connectWithings();
    }
};

function updateWithingsUI(connected, lastSync) {
    const statusText = document.getElementById('withings-status-text');
    const statusIcon = document.getElementById('withings-status-icon');
    if (statusText) {
        if (connected) {
            const syncInfo = lastSync ? `Last sync: ${new Date(lastSync).toLocaleDateString()}` : 'Connected — tap to sync';
            statusText.textContent = syncInfo;
        } else {
            statusText.textContent = 'Tap to connect your Withings scale';
        }
    }
    if (statusIcon) {
        statusIcon.innerHTML = connected
            ? '<i class="fas fa-check-circle text-success"></i>'
            : '<i class="fas fa-link text-primary"></i>';
    }
}

// Equipment Library
window.openEquipmentLibrary = openEquipmentLibrary;
window.openEquipmentDetail = openEquipmentDetail;
window.backToEquipmentList = backToEquipmentList;
window.filterEquipmentByLocation = filterEquipmentByLocation;
window.filterEquipmentBySearch = filterEquipmentBySearch;
window.toggleEquipmentSearch = toggleEquipmentSearch;
window.toggleEquipmentExercise = toggleEquipmentExercise;
window.assignExerciseToEquipment = assignExerciseToEquipment;
window.filterAssignList = filterAssignList;
window.confirmAssignExercise = confirmAssignExercise;
window.unassignExercise = unassignExercise;
window.saveEquipmentExerciseVideoFromLib = saveEquipmentExerciseVideoFromLib;
window.deleteEquipmentFromLibrary = deleteEquipmentFromLibrary;
window.saveEquipmentNotes = saveEquipmentNotes;
window.showAddEquipmentFlow = showAddEquipmentFlow;
window.selectEquipType = selectEquipType;
window.updateEquipNamePreview = updateEquipNamePreview;
window.confirmAddEquipment = confirmAddEquipment;
window.removeEquipmentLocation = removeEquipmentLocation;
window.setEquipmentView = setEquipmentView;
window.toggleBrandSection = toggleBrandSection;

// Error Log
window.showErrorLog = showErrorLog;
window.closeErrorLog = closeErrorLog;
window.toggleErrorLogSource = toggleErrorLogSource;
window.clearAllErrors = clearAllErrors;
window.copyErrorLog = copyErrorLog;
window.toggleErrorDetail = toggleErrorDetail;
window.showBugReport = showBugReport;
window.exportErrorLog = exportErrorLog;
window.captureError = captureError;
window.captureWarning = captureWarning;

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

        // Error log utilities for console debugging
        window.getErrorLog = getErrorLog;
        window.loadPersistedErrors = loadPersistedErrors;
        window.dumpErrors = async function () {
            console.log('=== In-Memory Errors (this session) ===');
            const memErrors = getErrorLog();
            if (memErrors.length === 0) {
                console.log('(none)');
            } else {
                console.table(memErrors.map(e => ({
                    time: new Date(e.timestamp).toLocaleTimeString(),
                    severity: e.severity,
                    message: e.message?.substring(0, 80),
                    source: e.source,
                    shown: e.shownToUser,
                })));
            }

            console.log('\n=== Persisted Errors (Firestore) ===');
            const persisted = await loadPersistedErrors();
            if (persisted.length === 0) {
                console.log('(none)');
            } else {
                console.table(persisted.map(e => ({
                    time: new Date(e.timestamp).toLocaleString(),
                    severity: e.severity,
                    message: e.message?.substring(0, 80),
                    source: e.source,
                })));
            }
            return { session: memErrors, persisted };
        };

        console.log('🔧 Debug utilities loaded');
    });
}

// ===================================================================
// SIMPLE INITIALIZATION - Just call your existing startApplication
// ===================================================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize error log badge listener early
        initErrorBadge();

        // Check for Withings OAuth callback before app starts
        // (cleans URL params so they don't interfere with routing)
        handleWithingsCallback();

        await startApplication();

        // Withings callback + status is now handled inside onAuthStateChanged
        // in app-initialization.js (after auth and data are fully loaded)
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
