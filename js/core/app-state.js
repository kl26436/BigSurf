export const AppState = {
  // User & Auth
  currentUser: null,
  
  // Workout Data
  currentWorkout: null,
  savedData: {},
  workoutPlans: [],
  exerciseDatabase: [],
  workoutStartTime: null,
  workoutDurationTimer: null,
  
  // UI State
  globalUnit: 'lbs',
  exerciseUnits: {},
  focusedExerciseIndex: null,
  
  // Timers
  globalRestTimer: null,
  
  // Getters
   getTodayDateString() {
  // Create a date object for right now
  const now = new Date();
  
  // Get local date components (not UTC)
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  const dateString = `${year}-${month}-${day}`;
  
  return dateString;
},
  
  hasWorkoutProgress() {
    return Object.keys(this.savedData.exercises || {}).some(key => {
      const exercise = this.savedData.exercises[key];
      return exercise.sets && exercise.sets.some(set => set.reps || set.weight);
    });
  },
  
  // State update helpers
  reset() {
    // Clear workout data
    this.currentWorkout = null;
    this.savedData = {};
    this.workoutStartTime = null;
    this.exerciseUnits = {};
    this.focusedExerciseIndex = null;
    
    // Clear timers
    this.clearTimers();
    
    // Additional cleanup for Bug 20 fix
    this.workoutInProgress = false;
    this.addingExerciseToWorkout = false;
    this.insertAfterIndex = null;
  }, // ← ADD THIS COMMA!
  
  clearTimers() {
    // Clear global rest timer
    if (this.globalRestTimer) {
      clearInterval(this.globalRestTimer.interval);
      this.globalRestTimer = null;
    }
    
    // Clear workout duration timer  
    if (this.workoutDurationTimer) {
      clearInterval(this.workoutDurationTimer);
      this.workoutDurationTimer = null;
    }
    
    // Clear any other workout-related timers
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }
};