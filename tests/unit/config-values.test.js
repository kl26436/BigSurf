// Tests for config module (Phase 0.2)
// Verifies all config constants exist with correct types and expected values.
// Imports the real module (config.js is pure — its only window reference is
// guarded), so constant changes in source can't drift past these tests.

import { describe, it, expect } from 'vitest';
import { Config, CATEGORY_ICONS, CATEGORY_COLORS, getCategoryIcon } from '../../js/core/utils/config.js';

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

describe('Config training insights constants (Phase 17)', () => {
    it('has volume landmarks with MEV below MRV', () => {
        expect(Config.VOLUME_MEV).toBe(8);
        expect(Config.VOLUME_MRV).toBe(22);
        expect(Config.VOLUME_MEV).toBeLessThan(Config.VOLUME_MRV);
    });

    it('has plateau detection threshold', () => {
        expect(Config.PLATEAU_MIN_SESSIONS).toBe(3);
    });

    it('has deload detection thresholds', () => {
        expect(Config.DELOAD_DAYS_PER_WEEK).toBe(5);
        expect(Config.DELOAD_DAYS_PER_WEEK).toBeLessThanOrEqual(7);
        expect(Config.DELOAD_CONSECUTIVE_WEEKS).toBe(4);
    });

    it('has minimum workouts gate for insights', () => {
        expect(Config.INSIGHTS_MIN_WORKOUTS).toBe(3);
    });

    it('has AI coach rate limit in hours', () => {
        expect(Config.COACH_RATE_LIMIT_HOURS).toBe(24);
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

describe('CATEGORY_ICONS', () => {
    it('has a fallback icon', () => {
        expect(CATEGORY_ICONS.other).toBe('fa-dumbbell');
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
