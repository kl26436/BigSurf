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

/**
 * Debug-gated console.log — only outputs when ?debug is in URL.
 * Use for development/diagnostic messages. Keep console.error for real errors.
 */
export function debugLog(...args) {
    if (Config.DEBUG_MODE) console.log(...args);
}
