// js/core/utils/config.js
export const Config = {
    // Debug
    DEBUG_MODE: typeof window !== 'undefined' && new URL(window.location).searchParams.has('debug'),

    // Workout session
    ABANDONED_WORKOUT_TIMEOUT_HOURS: 3,
    DEFAULT_REST_TIMER_SECONDS: 90,

    // Location
    GPS_MATCH_RADIUS_METERS: 500,

    // PR tracking
    PR_CUTOFF_DATE: '2025-07-01',

    // UI
    EXERCISE_MODAL_HISTORY_COUNT: 5,
    RECENT_EXERCISES_COUNT: 8,

    // Firebase
    FIREBASE_TIMEOUT_MS: 10000,
    MAX_STREAK_QUERY_LIMIT: 100,
};

// Consistent category icons used across all screens (FA 6.0.0 compatible)
export const CATEGORY_ICONS = {
    push: 'fa-hand-paper',
    pull: 'fa-fist-raised',
    legs: 'fa-walking',
    leg: 'fa-walking',
    cardio: 'fa-heartbeat',
    core: 'fa-bullseye',
    arms: 'fa-hand-rock',
    shoulders: 'fa-arrows-alt-v',
    chest: 'fa-hand-paper',
    back: 'fa-fist-raised',
    upper: 'fa-hand-paper',
    lower: 'fa-walking',
    'full body': 'fa-child',
    fullbody: 'fa-child',
    glutes: 'fa-fire',
    other: 'fa-dumbbell',
};

// Consistent category colors used across all screens
export const CATEGORY_COLORS = {
    Push: '#4A90D9',
    Pull: '#D94A7A',
    Legs: '#7B4AD9',
    Cardio: '#D9A74A',
    Core: '#4AD9A7',
    Arms: '#D96A4A',
    'Full Body': '#4AD9D9',
    Other: '#1dd3b0',
};

/**
 * Get the Font Awesome icon class for a workout category.
 * Returns full class string like 'fas fa-dumbbell'.
 * @param {string} category
 * @returns {string}
 */
export function getCategoryIcon(category) {
    const cat = (category || '').toLowerCase();
    return `fas ${CATEGORY_ICONS[cat] || CATEGORY_ICONS.other}`;
}

/**
 * Debug-gated console.log — only outputs when ?debug is in URL.
 * Use for development/diagnostic messages. Keep console.error for real errors.
 */
export function debugLog(...args) {
    if (Config.DEBUG_MODE) console.log(...args);
}
