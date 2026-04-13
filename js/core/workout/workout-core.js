// Core Workout Management Module - core/workout-core.js
// Barrel re-export file: imports from focused sub-modules and re-exports everything
// for backward compatibility with existing imports.

// === Workout Session Lifecycle ===
export {
    startWorkout,
    pauseWorkout,
    completeWorkout,
    cancelWorkout,
    cancelCurrentWorkout,
    continueInProgressWorkout,
    discardInProgressWorkout,
    discardEditedWorkout,
    editHistoricalWorkout,
    showWorkoutSelector,
    startWorkoutTimer,
    displayStaticDuration,
    updateWorkoutDuration,
    changeWorkoutLocation,
    selectWorkoutLocationOption,
    closeWorkoutLocationSelector,
    confirmWorkoutLocationChange,
    saveActiveWorkoutAsTemplate,
    toggleWorkoutOverflowMenu,
    closeWorkoutOverflowMenu,
    showWorkoutSummary,
} from './workout-session.js';

// === Exercise UI: Rendering, Set Management, Equipment, Video, Units ===
export {
    renderExercises,
    updateExerciseCard,
    createExerciseCard,
    generateExerciseTable,
    loadExerciseHistory,
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
    changeExerciseEquipment,
    applyEquipmentChange,
    setGlobalUnit,
    setExerciseUnit,
    editExerciseDefaults,
    showExerciseVideo,
    hideExerciseVideo,
    showExerciseVideoAndToggleButton,
    hideExerciseVideoAndToggleButton,
    convertYouTubeUrl,
    loadLastWorkoutHint,
    toggleSetComplete,
    toggleReorderMode,
    supersetWithNext,
    ungroupExerciseFromWorkout,
    toggleExerciseExpansion,
    replaceExercise,
    updateCardioField,
} from './exercise-ui.js';

// === Rest Timer ===
export {
    toggleModalRestTimer,
    skipModalRestTimer,
    restoreModalRestTimer,
    saveActiveTimerState,
    restoreActiveTimerState,
    restoreTimerFromAppState,
    autoStartRestTimer,
    skipHeaderRestTimer,
} from './rest-timer.js';
