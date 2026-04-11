// Pure helper functions for template management
// Extracted for testability (no DOM or Firebase dependencies)

/**
 * Reorder an exercise in a template's exercise array.
 * Returns a new array with the exercise moved.
 * @param {Array} exercises - array of exercise objects
 * @param {number} fromIndex - index of the exercise to move
 * @param {'up'|'down'} direction - direction to move
 * @returns {Array} new array with reordered exercises, or same array if move is invalid
 */
export function reorderTemplateExercise(exercises, fromIndex, direction) {
    if (!Array.isArray(exercises) || exercises.length < 2) return exercises;

    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;

    if (fromIndex < 0 || fromIndex >= exercises.length) return exercises;
    if (toIndex < 0 || toIndex >= exercises.length) return exercises;

    const result = [...exercises];
    const temp = result[fromIndex];
    result[fromIndex] = result[toIndex];
    result[toIndex] = temp;
    return result;
}

/**
 * Normalize exercises from object format to array format.
 * Handles both array format: [{...}, {...}]
 * and object format: {exercise_0: {...}, exercise_1: {...}}
 * Also merges exerciseNames map into exercise objects if present.
 * @param {Array|Object} exercises
 * @param {Object} [exerciseNames] - optional map of {exercise_0: "Bench Press", ...}
 * @returns {Array}
 */
export function normalizeExercisesToArray(exercises, exerciseNames = null) {
    if (!exercises) return [];

    let result;

    if (Array.isArray(exercises)) {
        result = exercises;
    } else if (typeof exercises === 'object') {
        const keys = Object.keys(exercises).sort();
        result = keys.map((key) => {
            const ex = exercises[key];
            if (!ex) return null;
            // Merge name from exerciseNames map if the exercise doesn't have one
            if (exerciseNames && exerciseNames[key] && !ex.name) {
                return { ...ex, name: exerciseNames[key] };
            }
            return ex;
        }).filter(Boolean);
    } else {
        return [];
    }

    return result;
}

/**
 * Convert a completed workout's data into template format.
 * Workouts store exercises as {exercise_0: {sets: [...], ...}} objects,
 * templates store them as [{name, sets, reps, weight, ...}] arrays.
 * @param {Object} workoutData - saved workout document from Firestore
 * @returns {Object} template-shaped object ready for the template editor
 */
export function normalizeWorkoutToTemplate(workoutData) {
    if (!workoutData) return null;

    const template = {
        name: '',
        category: guessCategory(workoutData.workoutType || ''),
        exercises: [],
    };

    // Use originalWorkout if available (it has the template structure)
    if (workoutData.originalWorkout && workoutData.originalWorkout.exercises) {
        const origExercises = Array.isArray(workoutData.originalWorkout.exercises)
            ? workoutData.originalWorkout.exercises
            : normalizeExercisesToArray(workoutData.originalWorkout.exercises);

        // Merge actual performance data from the workout into the template defaults
        const exerciseNames = workoutData.exerciseNames || {};
        const exerciseData = workoutData.exercises || {};

        template.exercises = origExercises.map((origEx, i) => {
            const key = `exercise_${i}`;
            const actual = exerciseData[key];
            const name = origEx.name || origEx.machine || exerciseNames[key] || 'Unknown';

            // Use the actual sets/reps/weight from the workout if available
            let sets = origEx.sets || 3;
            let reps = origEx.reps || 10;
            let weight = origEx.weight || 0;

            if (actual && actual.sets && actual.sets.length > 0) {
                sets = actual.sets.length;
                // Use the last set's reps/weight as the default
                const lastSet = actual.sets[actual.sets.length - 1];
                reps = lastSet.reps || reps;
                weight = lastSet.weight || weight;
            }

            return {
                name,
                machine: origEx.machine || name,
                bodyPart: origEx.bodyPart || '',
                equipmentType: origEx.equipmentType || '',
                equipment: actual?.equipment || origEx.equipment || '',
                equipmentLocation: origEx.equipmentLocation || '',
                sets,
                reps,
                weight,
                video: origEx.video || '',
            };
        });

        return template;
    }

    // Fallback: build from workout exercises directly (no originalWorkout)
    const exerciseNames = workoutData.exerciseNames || {};
    const exercises = workoutData.exercises || {};
    const keys = Object.keys(exercises).sort();

    template.exercises = keys.map((key) => {
        const ex = exercises[key];
        if (!ex) return null;

        const name = exerciseNames[key] || ex.name || 'Unknown';
        let sets = 3;
        let reps = 10;
        let weight = 0;

        if (ex.sets && ex.sets.length > 0) {
            sets = ex.sets.length;
            const lastSet = ex.sets[ex.sets.length - 1];
            reps = lastSet.reps || reps;
            weight = lastSet.weight || weight;
        }

        return {
            name,
            machine: name,
            bodyPart: '',
            equipmentType: '',
            equipment: ex.equipment || '',
            equipmentLocation: '',
            sets,
            reps,
            weight,
            video: '',
        };
    }).filter(Boolean);

    return template;
}

/**
 * Validate template data before saving.
 * @param {Object} template
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateTemplate(template) {
    if (!template) return { valid: false, error: 'Template is required' };
    if (!template.name || !template.name.trim()) return { valid: false, error: 'Template name is required' };
    if (!template.exercises || template.exercises.length === 0) return { valid: false, error: 'At least one exercise is required' };
    return { valid: true, error: null };
}

/**
 * Guess workout category from template/workout name.
 */
function guessCategory(name) {
    const lower = (name || '').toLowerCase();
    if (lower.includes('push') || lower.includes('chest')) return 'push';
    if (lower.includes('pull') || lower.includes('back')) return 'pull';
    if (lower.includes('leg') || lower.includes('squat')) return 'legs';
    if (lower.includes('cardio') || lower.includes('run')) return 'cardio';
    return 'other';
}
