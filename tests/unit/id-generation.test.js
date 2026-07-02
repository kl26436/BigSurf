// Tests for generateWorkoutId (data-manager.js) and isOldSchemaDoc
// (schema-migration.js). Imports the REAL functions — both modules statically
// import firebase-config (CDN URLs), and data-manager also imports ui-helpers
// (DOM at import time), so those two are mocked. The functions under test are
// pure.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {},
    doc: vi.fn(),
    setDoc: vi.fn(),
    getDoc: vi.fn(),
    collection: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    getDocs: vi.fn(),
    where: vi.fn(),
    deleteDoc: vi.fn(),
    writeBatch: vi.fn(),
    updateDoc: vi.fn(),
}));

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    convertWeight: vi.fn(),
    escapeHtml: (s) => s,
}));

import { generateWorkoutId } from '../../js/core/data/data-manager.js';
import { isOldSchemaDoc } from '../../js/core/data/schema-migration.js';

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
