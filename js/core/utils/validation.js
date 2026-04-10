// Input validation utilities - core/utils/validation.js
// Sanitize and validate user input before Firestore writes

/**
 * Sanitize a string: trim, enforce max length, strip HTML tags
 */
export function sanitizeString(str, maxLength = 200) {
    if (!str || typeof str !== 'string') return '';
    return str
        .trim()
        .replace(/<[^>]*>/g, '')
        .substring(0, maxLength);
}

/**
 * Validate and sanitize workout data before saving
 */
export function validateWorkoutData(data) {
    if (!data || typeof data !== 'object') return null;

    const clean = { ...data };

    if (clean.workoutType) {
        clean.workoutType = sanitizeString(clean.workoutType, 200);
    }

    if (clean.location) {
        clean.location = sanitizeString(clean.location, 200);
    }

    if (clean.exercises && typeof clean.exercises === 'object') {
        for (const key of Object.keys(clean.exercises)) {
            const ex = clean.exercises[key];
            if (ex.name) ex.name = sanitizeString(ex.name, 200);
            if (ex.equipment) ex.equipment = sanitizeString(ex.equipment, 200);
            if (ex.notes) ex.notes = sanitizeString(ex.notes, 1000);

            if (ex.sets && Array.isArray(ex.sets)) {
                ex.sets = ex.sets.map((set) => ({
                    reps: Math.max(0, Math.min(999, Number(set.reps) || 0)),
                    weight: Math.max(0, Math.min(9999, Number(set.weight) || 0)),
                    originalUnit: set.originalUnit === 'kg' ? 'kg' : 'lbs',
                }));
            }
        }
    }

    return clean;
}

/**
 * Validate exercise data (for exercise library saves)
 */
export function validateExerciseData(data) {
    if (!data || typeof data !== 'object') return null;

    return {
        ...data,
        name: sanitizeString(data.name, 200),
        bodyPart: sanitizeString(data.bodyPart || '', 100),
        category: sanitizeString(data.category || '', 100),
        video: sanitizeString(data.video || '', 500),
        notes: sanitizeString(data.notes || '', 1000),
    };
}

/**
 * Validate template data (for template saves)
 */
export function validateTemplateData(data) {
    if (!data || typeof data !== 'object') return null;
    const clean = { ...data };
    if (clean.name) clean.name = sanitizeString(clean.name, 200);
    if (clean.category) clean.category = sanitizeString(clean.category, 100);
    if (clean.exercises && Array.isArray(clean.exercises)) {
        clean.exercises = clean.exercises.map((ex) => ({
            ...ex,
            name: sanitizeString(ex.name || '', 200),
            equipment: sanitizeString(ex.equipment || '', 200),
            notes: sanitizeString(ex.notes || '', 1000),
        }));
    }
    return clean;
}

/**
 * Validate location data (for location saves)
 */
export function validateLocationData(data) {
    if (!data || typeof data !== 'object') return null;
    return {
        ...data,
        name: sanitizeString(data.name, 200),
        address: data.address ? sanitizeString(data.address, 500) : undefined,
        notes: data.notes ? sanitizeString(data.notes, 1000) : undefined,
    };
}

/**
 * Validate equipment data
 */
export function validateEquipmentData(data) {
    if (!data || typeof data !== 'object') return null;

    return {
        ...data,
        name: sanitizeString(data.name, 200),
        location: data.location ? sanitizeString(data.location, 200) : undefined,
        locations: Array.isArray(data.locations) ? data.locations.map((l) => sanitizeString(l, 200)) : undefined,
    };
}
