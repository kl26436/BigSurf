// Equipment Planner Module - core/features/equipment-planner.js
// Pure logic for equipment-based workout planning (Phase 16)
// No DOM or Firebase dependencies — receives data, returns results.

/**
 * Get all equipment available at a specific location.
 * Handles both the current `locations` array and legacy `location` string field.
 *
 * @param {Array} allEquipment - All user equipment documents
 * @param {string} locationName - Name of the gym/location
 * @returns {Array} Equipment items at this location
 */
export function getEquipmentAtLocation(allEquipment, locationName) {
    if (!allEquipment || !locationName) return [];

    return allEquipment.filter(eq => {
        if (eq.locations && Array.isArray(eq.locations)) {
            return eq.locations.includes(locationName);
        }
        if (eq.location) {
            return eq.location === locationName;
        }
        return false;
    });
}

/**
 * Get unique exercise names available from a set of equipment.
 *
 * @param {Array} locationEquipment - Equipment at a location (from getEquipmentAtLocation)
 * @returns {Set<string>} Unique exercise names
 */
export function getExercisesAtLocation(locationEquipment) {
    if (!locationEquipment || locationEquipment.length === 0) return new Set();

    const exercises = new Set();
    for (const eq of locationEquipment) {
        if (eq.exerciseTypes && Array.isArray(eq.exerciseTypes)) {
            for (const name of eq.exerciseTypes) {
                exercises.add(name);
            }
        }
    }
    return exercises;
}

/**
 * Check whether a template's exercises can be done with available equipment.
 *
 * Exercises with no `equipment` field are always considered available (bodyweight, etc.).
 * Exercises with equipment are checked against the available exercise names set.
 *
 * @param {Object} template - Template document with exercises array
 * @param {Set<string>} availableExerciseNames - Exercise names available at the location
 * @returns {{ compatible: boolean, total: number, available: number, missing: number, exercises: Array }}
 */
export function checkTemplateCompatibility(template, availableExerciseNames) {
    const exercises = template.exercises || [];
    if (exercises.length === 0) {
        return { compatible: true, total: 0, available: 0, missing: 0, exercises: [] };
    }

    const result = [];
    let availableCount = 0;
    let missingCount = 0;

    for (const exercise of exercises) {
        const name = exercise.name || exercise.machine;
        const hasEquipment = !!exercise.equipment;

        if (!hasEquipment) {
            // No equipment required — always available
            result.push({ name, available: true, equipment: null });
            availableCount++;
        } else if (availableExerciseNames.has(name)) {
            result.push({ name, available: true, equipment: exercise.equipment });
            availableCount++;
        } else {
            result.push({ name, available: false, equipment: exercise.equipment });
            missingCount++;
        }
    }

    return {
        compatible: missingCount === 0,
        total: exercises.length,
        available: availableCount,
        missing: missingCount,
        exercises: result,
    };
}

/**
 * Categorize templates into fully compatible, partially compatible, and incompatible
 * based on available equipment at a location.
 *
 * @param {Array} templates - All user templates
 * @param {Set<string>} availableExerciseNames - Exercise names available at the location
 * @returns {{ fullyCompatible: Array, partiallyCompatible: Array, incompatible: Array }}
 */
export function categorizeTemplates(templates, availableExerciseNames) {
    const fullyCompatible = [];
    const partiallyCompatible = [];
    const incompatible = [];

    for (const template of templates) {
        if (template.isHidden || template.deleted) continue;

        const compatibility = checkTemplateCompatibility(template, availableExerciseNames);
        const entry = { ...template, compatibility };

        if (compatibility.compatible) {
            fullyCompatible.push(entry);
        } else if (compatibility.available > 0) {
            partiallyCompatible.push(entry);
        } else if (compatibility.total > 0) {
            incompatible.push(entry);
        }
        // Templates with 0 exercises are silently excluded
    }

    return { fullyCompatible, partiallyCompatible, incompatible };
}

/**
 * Rank exercises available at a location for the "Suggested for this gym" section.
 * Previously-used exercises appear first, then remaining available exercises alphabetically.
 *
 * @param {Set<string>} availableExerciseNames - Exercise names available at the location
 * @param {Array} recentExercises - User's recently/most-used exercises (objects with `name`)
 * @param {Array} exerciseLibrary - Full exercise library (objects with `name`, `bodyPart`, etc.)
 * @returns {Array} Ranked exercise objects with `usedBefore` flag
 */
export function rankExercisesForLocation(availableExerciseNames, recentExercises, exerciseLibrary) {
    if (!availableExerciseNames || availableExerciseNames.size === 0) return [];

    const recentNames = new Set(
        (recentExercises || []).map(ex => ex.name || ex.machine)
    );

    // Build lookup from exercise library
    const libraryByName = new Map();
    for (const ex of (exerciseLibrary || [])) {
        const name = ex.name || ex.machine;
        if (name && availableExerciseNames.has(name)) {
            libraryByName.set(name, ex);
        }
    }

    const used = [];
    const notUsed = [];

    for (const [name, exercise] of libraryByName) {
        if (recentNames.has(name)) {
            used.push({ ...exercise, usedBefore: true });
        } else {
            notUsed.push({ ...exercise, usedBefore: false });
        }
    }

    // Sort each group alphabetically by name
    const byName = (a, b) => (a.name || a.machine || '').localeCompare(b.name || b.machine || '');
    used.sort(byName);
    notUsed.sort(byName);

    return [...used, ...notUsed];
}
