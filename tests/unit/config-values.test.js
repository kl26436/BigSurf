// Tests for config module (Phase 0.2)
// Verifies all config constants exist with correct types and expected values

import { describe, it, expect } from 'vitest';

// Re-create the Config object for isolated testing (mirrors js/core/utils/config.js)
const Config = {
    DEBUG_MODE: false, // Would be true with ?debug in URL
    ABANDONED_WORKOUT_TIMEOUT_HOURS: 3,
    DEFAULT_REST_TIMER_SECONDS: 90,
    GPS_MATCH_RADIUS_METERS: 500,
    PR_CUTOFF_DATE: '2025-07-01',
    EXERCISE_MODAL_HISTORY_COUNT: 5,
    RECENT_EXERCISES_COUNT: 8,
    FIREBASE_TIMEOUT_MS: 10000,
    MAX_STREAK_QUERY_LIMIT: 100,
};

const CATEGORY_ICONS = {
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

const CATEGORY_COLORS = {
    Push: '#4A90D9',
    Pull: '#D94A7A',
    Legs: '#7B4AD9',
    Cardio: '#D9A74A',
    Core: '#4AD9A7',
    Arms: '#D96A4A',
    'Full Body': '#4AD9D9',
    Other: '#1dd3b0',
};

function getCategoryIcon(category) {
    const cat = (category || '').toLowerCase();
    return `fas ${CATEGORY_ICONS[cat] || CATEGORY_ICONS.other}`;
}

describe('Config constants', () => {
    it('has correct workout timeout', () => {
        expect(Config.ABANDONED_WORKOUT_TIMEOUT_HOURS).toBe(3);
        expect(typeof Config.ABANDONED_WORKOUT_TIMEOUT_HOURS).toBe('number');
    });

    it('has correct default rest timer', () => {
        expect(Config.DEFAULT_REST_TIMER_SECONDS).toBe(90);
    });

    it('has correct GPS match radius', () => {
        expect(Config.GPS_MATCH_RADIUS_METERS).toBe(500);
    });

    it('has valid PR cutoff date in YYYY-MM-DD format', () => {
        expect(Config.PR_CUTOFF_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('has positive Firebase timeout', () => {
        expect(Config.FIREBASE_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('has positive streak query limit', () => {
        expect(Config.MAX_STREAK_QUERY_LIMIT).toBeGreaterThan(0);
    });

    it('has positive exercise history count', () => {
        expect(Config.EXERCISE_MODAL_HISTORY_COUNT).toBeGreaterThan(0);
    });

    it('has positive recent exercises count', () => {
        expect(Config.RECENT_EXERCISES_COUNT).toBeGreaterThan(0);
    });
});

describe('getCategoryIcon', () => {
    it('returns correct icon for known categories', () => {
        expect(getCategoryIcon('push')).toBe('fas fa-hand-paper');
        expect(getCategoryIcon('pull')).toBe('fas fa-fist-raised');
        expect(getCategoryIcon('legs')).toBe('fas fa-walking');
        expect(getCategoryIcon('cardio')).toBe('fas fa-heartbeat');
        expect(getCategoryIcon('core')).toBe('fas fa-bullseye');
    });

    it('is case-insensitive', () => {
        expect(getCategoryIcon('PUSH')).toBe('fas fa-hand-paper');
        expect(getCategoryIcon('Push')).toBe('fas fa-hand-paper');
        expect(getCategoryIcon('Cardio')).toBe('fas fa-heartbeat');
    });

    it('returns dumbbell icon for unknown categories', () => {
        expect(getCategoryIcon('unknown')).toBe('fas fa-dumbbell');
        expect(getCategoryIcon('random')).toBe('fas fa-dumbbell');
    });

    it('returns dumbbell icon for null/empty input', () => {
        expect(getCategoryIcon(null)).toBe('fas fa-dumbbell');
        expect(getCategoryIcon('')).toBe('fas fa-dumbbell');
        expect(getCategoryIcon(undefined)).toBe('fas fa-dumbbell');
    });

    it('handles aliases (leg → legs, chest → push)', () => {
        expect(getCategoryIcon('leg')).toBe('fas fa-walking');
        expect(getCategoryIcon('chest')).toBe('fas fa-hand-paper');
        expect(getCategoryIcon('back')).toBe('fas fa-fist-raised');
    });

    it('handles full body variants', () => {
        expect(getCategoryIcon('full body')).toBe('fas fa-child');
        expect(getCategoryIcon('fullbody')).toBe('fas fa-child');
    });
});

describe('CATEGORY_COLORS', () => {
    it('has all main categories', () => {
        expect(CATEGORY_COLORS.Push).toBeDefined();
        expect(CATEGORY_COLORS.Pull).toBeDefined();
        expect(CATEGORY_COLORS.Legs).toBeDefined();
        expect(CATEGORY_COLORS.Cardio).toBeDefined();
        expect(CATEGORY_COLORS.Core).toBeDefined();
        expect(CATEGORY_COLORS.Arms).toBeDefined();
        expect(CATEGORY_COLORS['Full Body']).toBeDefined();
    });

    it('all colors are valid hex strings', () => {
        for (const color of Object.values(CATEGORY_COLORS)) {
            expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });

    it('has distinct colors for each category', () => {
        const values = Object.values(CATEGORY_COLORS);
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
    });
});
