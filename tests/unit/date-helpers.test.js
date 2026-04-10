// Tests for getDateString from date-helpers.js
import { describe, it, expect } from 'vitest';
import { getDateString } from '../../js/core/utils/date-helpers.js';

describe('getDateString', () => {
    it('extracts date from ISO string', () => {
        expect(getDateString('2025-06-15T10:30:00.000Z')).toBe('2025-06-15');
    });

    it('returns YYYY-MM-DD string as-is (idempotent)', () => {
        expect(getDateString('2025-06-15')).toBe('2025-06-15');
    });

    it('converts Date object to YYYY-MM-DD', () => {
        const date = new Date(2025, 5, 15); // June 15, 2025
        expect(getDateString(date)).toBe('2025-06-15');
    });

    it('returns empty string for null', () => {
        expect(getDateString(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
        expect(getDateString(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
        expect(getDateString('')).toBe('');
    });

    it('handles ISO string with timezone offset', () => {
        expect(getDateString('2025-12-31T23:59:59+05:00')).toBe('2025-12-31');
    });

    it('handles Firestore-style Timestamp object with toDate()', () => {
        const mockTimestamp = {
            toDate: () => new Date(2025, 0, 1), // Jan 1, 2025
        };
        expect(getDateString(mockTimestamp)).toBe('2025-01-01');
    });
});
