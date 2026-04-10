// Tests for generateWorkoutId and isOldSchemaDoc from data-manager.js
// These are internal (non-exported) functions, so we re-implement them here
// to test the logic in isolation (same pattern as weight-conversion.test.js)

import { describe, it, expect } from 'vitest';

// Node 24+ already has globalThis.crypto (Web Crypto API) — no polyfill needed

// Re-implemented from data-manager.js
function generateWorkoutId(date) {
    const timestamp = Date.now();
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    const random = Array.from(arr, (b) => b.toString(36).padStart(2, '0'))
        .join('')
        .substring(0, 12);
    return `${date}_${timestamp}_${random}`;
}

// Re-implemented from data-manager.js
function isOldSchemaDoc(docId) {
    return /^\d{4}-\d{2}-\d{2}$/.test(docId);
}

describe('generateWorkoutId', () => {
    it('produces ID matching expected pattern', () => {
        const id = generateWorkoutId('2025-06-15');
        // Pattern: date_timestamp_12-char-random
        const pattern = /^2025-06-15_\d+_.{12}$/;
        expect(id).toMatch(pattern);
    });

    it('starts with the provided date', () => {
        const id = generateWorkoutId('2025-12-31');
        expect(id.startsWith('2025-12-31_')).toBe(true);
    });

    it('two calls produce different IDs', () => {
        const id1 = generateWorkoutId('2025-06-15');
        const id2 = generateWorkoutId('2025-06-15');
        expect(id1).not.toBe(id2);
    });

    it('contains a numeric timestamp in the middle segment', () => {
        const id = generateWorkoutId('2025-06-15');
        const parts = id.split('_');
        // parts[0] = date, parts[1] = timestamp, rest = random
        expect(Number(parts[1])).toBeGreaterThan(0);
        expect(Number.isInteger(Number(parts[1]))).toBe(true);
    });

    it('random segment is exactly 12 characters', () => {
        const id = generateWorkoutId('2025-06-15');
        // Split on first two underscores: date_timestamp_random
        const parts = id.split('_');
        // Random portion is everything after date and timestamp
        const random = parts.slice(2).join('_');
        expect(random.length).toBe(12);
    });
});

describe('isOldSchemaDoc', () => {
    it('returns true for old schema date ID', () => {
        expect(isOldSchemaDoc('2025-06-15')).toBe(true);
    });

    it('returns false for new schema unique ID', () => {
        expect(isOldSchemaDoc('2025-06-15_1234567890_abc123')).toBe(false);
    });

    it('returns false for empty string', () => {
        expect(isOldSchemaDoc('')).toBe(false);
    });

    it('returns false for non-date string', () => {
        expect(isOldSchemaDoc('not-a-date')).toBe(false);
    });

    it('returns true for invalid date ranges (known limitation - regex only)', () => {
        // The regex only checks format \d{4}-\d{2}-\d{2}, not valid ranges
        expect(isOldSchemaDoc('2025-13-45')).toBe(true);
    });

    it('returns false for date with extra characters', () => {
        expect(isOldSchemaDoc('2025-06-15T00:00')).toBe(false);
    });

    it('returns false for partial date', () => {
        expect(isOldSchemaDoc('2025-06')).toBe(false);
    });
});
