// Workout display helpers - core/utils/workout-helpers.js
// Centralized display name logic to reduce duplication

/**
 * Get display name for an exercise, with fallback chain
 */
export function getExerciseName(exercise) {
    if (!exercise) return 'Unknown Exercise';  // copy-ok: stored fallback key — matched against saved data
    return exercise.name || exercise.machine || exercise.exercise || 'Unknown Exercise';  // copy-ok: stored fallback key — matched against saved data
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

/**
 * Loose exercise-name search: every word the user typed has to appear in the
 * name, in any order, with a trailing "s" forgiven on both sides — "Overhead
 * Triceps Extensions" finds "Overhead Triceps Extension", and "tricep
 * overhead" finds it too. A plain substring test failed the moment the query
 * was one letter longer than the library name (9/29 "can't find it").
 * Accepts a name string or an exercise record; an empty query matches all.
 */
export function exerciseNameMatches(nameOrExercise, query) {
    const name = typeof nameOrExercise === 'string'
        ? nameOrExercise
        : (nameOrExercise?.name || nameOrExercise?.machine || '');
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const singular = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
    const q = norm(query);
    if (!q) return true;
    const hay = norm(name);
    const hayWords = hay.split(' ').map(singular);
    return q.split(' ').filter(Boolean).every((tok) => {
        const t = singular(tok);
        return hay.includes(t) || hayWords.some((w) => w.startsWith(t));
    });
}
