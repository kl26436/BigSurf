// Superset & Circuit Grouping — core/features/superset-manager.js
// Manages exercise grouping for supersets (2 exercises) and circuits (3+).
// Exercises with the same `group` letter (A, B, C...) are done together.
// group: null means standalone.

/**
 * Assign exercises to a superset group.
 * @param {number[]} indices - Exercise indices to group
 * @param {Object} exercises - Exercises object keyed by exercise_N
 * @returns {string|null} The group letter assigned (A, B, C, ...) or null if exhausted
 */
export function groupExercises(indices, exercises) {
    const usedGroups = new Set();
    for (const key of Object.keys(exercises)) {
        if (exercises[key].group) usedGroups.add(exercises[key].group);
    }
    const nextGroup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(l => !usedGroups.has(l));
    if (!nextGroup) return null;
    for (const idx of indices) {
        const key = `exercise_${idx}`;
        if (exercises[key]) exercises[key].group = nextGroup;
    }
    return nextGroup;
}

/**
 * Get map of group letter → array of exercise indices.
 * Exercises with group: null/undefined are excluded.
 */
export function getExerciseGroups(exercises) {
    const groups = {};
    for (const key of Object.keys(exercises)) {
        const group = exercises[key].group;
        if (!group) continue;
        const idx = parseInt(key.split('_')[1]);
        if (!groups[group]) groups[group] = [];
        groups[group].push(idx);
    }
    return groups;
}

/**
 * Get the next exercise index in the same group (wraps around).
 * Returns null if exercise is not in a group.
 */
export function getNextInGroup(currentIndex, exercises) {
    const currentKey = `exercise_${currentIndex}`;
    const group = exercises[currentKey]?.group;
    if (!group) return null;

    const groupIndices = [];
    for (const key of Object.keys(exercises)) {
        if (exercises[key].group === group) {
            groupIndices.push(parseInt(key.split('_')[1]));
        }
    }
    groupIndices.sort((a, b) => a - b);

    const pos = groupIndices.indexOf(currentIndex);
    return groupIndices[(pos + 1) % groupIndices.length];
}

/**
 * Remove an exercise from its group. If only one remains, ungroup it too.
 */
export function ungroupExercise(index, exercises) {
    const key = `exercise_${index}`;
    const group = exercises[key]?.group;
    if (!group) return;

    exercises[key].group = null;

    // Check remaining members
    const remaining = Object.keys(exercises).filter(k => exercises[k].group === group);
    if (remaining.length === 1) {
        exercises[remaining[0]].group = null;
    }
}

/**
 * Check if the current exercise is the last in its group's current round.
 * A "round" is complete when all group members have completed the same set index.
 * Returns true when rest timer should fire (end of full superset round).
 *
 * @param {number} currentIndex - Current exercise index
 * @param {number} setIndex - The set that was just completed
 * @param {Object[]} workoutExercises - Array of workout exercise objects
 * @param {Object} savedData - AppState.savedData with exercises keyed by exercise_N
 * @returns {boolean}
 */
export function isLastInGroupRound(currentIndex, setIndex, workoutExercises, savedData) {
    const exercises = savedData.exercises || {};
    const currentKey = `exercise_${currentIndex}`;
    const group = exercises[currentKey]?.group;
    if (!group) return true; // standalone exercise always fires rest timer

    // Find all indices in this group
    const groupIndices = [];
    for (const key of Object.keys(exercises)) {
        if (exercises[key].group === group) {
            groupIndices.push(parseInt(key.split('_')[1]));
        }
    }
    groupIndices.sort((a, b) => a - b);

    // Check if current exercise is the last in the group order
    const isLast = groupIndices[groupIndices.length - 1] === currentIndex;
    if (!isLast) return false;

    // Check if all group members have completed this set index
    for (const idx of groupIndices) {
        const exKey = `exercise_${idx}`;
        const set = exercises[exKey]?.sets?.[setIndex];
        if (!set || !(set.completed || (set.reps && set.weight))) {
            return false;
        }
    }

    return true;
}
