// Workout display helpers - core/utils/workout-helpers.js
// Centralized display name logic to reduce duplication

/**
 * Get display name for an exercise, with fallback chain
 */
export function getExerciseName(exercise) {
    if (!exercise) return 'Unknown Exercise';
    return exercise.name || exercise.machine || exercise.exercise || 'Unknown Exercise';
}

/**
 * Get display name for a workout/template
 */
export function getWorkoutDisplayName(workout) {
    if (!workout) return 'Unnamed';
    return workout.name || workout.day || workout.workoutType || 'Unnamed';
}
