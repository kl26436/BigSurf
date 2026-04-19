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

// Label maps + formatters. Internal enums are stored lowercase
// (e.g. 'completed', 'push', 'chest'); these convert them to the
// Title-Case form shown to the user.

export const STATUS_LABELS = {
    completed: 'Completed',
    cancelled: 'Cancelled',
    incomplete: 'Incomplete',
    partial: 'Partial',
    unknown: 'Unknown',
};

export const CATEGORY_LABELS = {
    push: 'Push',
    pull: 'Pull',
    legs: 'Legs',
    core: 'Core',
    cardio: 'Cardio',
    arms: 'Arms',
    chest: 'Chest',
    back: 'Back',
    shoulders: 'Shoulders',
    other: 'Other',
};

export const BODY_PART_LABELS = {
    chest: 'Chest',
    back: 'Back',
    shoulders: 'Shoulders',
    arms: 'Arms',
    biceps: 'Biceps',
    triceps: 'Triceps',
    legs: 'Legs',
    quads: 'Quads',
    hamstrings: 'Hamstrings',
    glutes: 'Glutes',
    calves: 'Calves',
    core: 'Core',
    abs: 'Abs',
    cardio: 'Cardio',
    'full body': 'Full Body',
    other: 'Other',
};

function titleCase(s) {
    if (!s) return '';
    return String(s)
        .replace(/[_-]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

export function formatStatus(status) {
    if (!status) return '';
    const key = String(status).toLowerCase();
    return STATUS_LABELS[key] || titleCase(status);
}

export function formatCategory(category) {
    if (!category) return '';
    const key = String(category).toLowerCase();
    return CATEGORY_LABELS[key] || titleCase(category);
}

export function formatBodyPart(bodyPart) {
    if (!bodyPart) return '';
    const key = String(bodyPart).toLowerCase();
    return BODY_PART_LABELS[key] || titleCase(bodyPart);
}
