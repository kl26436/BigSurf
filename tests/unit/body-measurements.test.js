// Tests for body weight & measurements tracking (Phase 12.5)
// Verifies 7-day moving average, unit conversion, and duplicate handling
// Imports the REAL body-measurements module — firebase-config is mocked because
// the module's Firestore CRUD imports it, but the functions under test are pure.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {},
    doc: vi.fn(),
    setDoc: vi.fn(),
    getDocs: vi.fn(),
    deleteDoc: vi.fn(),
    collection: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
}));

import {
    calculate7DayAverage,
    convertMeasurementUnit,
    deduplicateByDate,
} from '../../js/core/features/body-measurements.js';

// ===================================================================
// TESTS
// ===================================================================

describe('calculate7DayAverage', () => {
    it('returns correct moving average for 7+ entries', () => {
        const entries = [
            { date: '2026-04-01', weight: 180 },
            { date: '2026-04-02', weight: 181 },
            { date: '2026-04-03', weight: 179 },
            { date: '2026-04-04', weight: 180 },
            { date: '2026-04-05', weight: 182 },
            { date: '2026-04-06', weight: 181 },
            { date: '2026-04-07', weight: 180 },
            { date: '2026-04-08', weight: 183 },
        ];
        const result = calculate7DayAverage(entries);
        expect(result).toHaveLength(8);
        // Last point averages entries 2-8 (indices 1-7)
        const last7 = entries.slice(1).map(e => e.weight);
        const expectedAvg = Math.round((last7.reduce((s, v) => s + v, 0) / 7) * 10) / 10;
        expect(result[7].weight).toBe(expectedAvg);
        expect(result[7].date).toBe('2026-04-08');
    });

    it('averages available data when fewer than 7 entries', () => {
        const entries = [
            { date: '2026-04-01', weight: 180 },
            { date: '2026-04-02', weight: 184 },
        ];
        const result = calculate7DayAverage(entries);
        expect(result[0].weight).toBe(180); // Only 1 entry in window
        expect(result[1].weight).toBe(182); // Average of 180, 184
    });

    it('handles single entry', () => {
        const entries = [{ date: '2026-04-01', weight: 185 }];
        const result = calculate7DayAverage(entries);
        expect(result).toHaveLength(1);
        expect(result[0].weight).toBe(185);
    });

    it('handles gaps in dates (still uses positional window)', () => {
        const entries = [
            { date: '2026-04-01', weight: 180 },
            { date: '2026-04-05', weight: 182 },  // 4-day gap
            { date: '2026-04-10', weight: 184 },  // 5-day gap
        ];
        const result = calculate7DayAverage(entries);
        expect(result).toHaveLength(3);
        expect(result[2].weight).toBe(182); // avg of 180, 182, 184
    });

    it('returns empty array for empty/null input', () => {
        expect(calculate7DayAverage([])).toEqual([]);
        expect(calculate7DayAverage(null)).toEqual([]);
    });
});

describe('convertMeasurementUnit', () => {
    it('converts lbs to kg', () => {
        const result = convertMeasurementUnit({ weight: 180, unit: 'lbs' }, 'kg');
        expect(result.unit).toBe('kg');
        expect(result.weight).toBeCloseTo(81.6, 1);
    });

    it('converts kg to lbs', () => {
        const result = convertMeasurementUnit({ weight: 80, unit: 'kg' }, 'lbs');
        expect(result.unit).toBe('lbs');
        expect(result.weight).toBeCloseTo(176.4, 1);
    });

    it('does not mutate original entry', () => {
        const original = { weight: 180, unit: 'lbs', date: '2026-04-01' };
        const result = convertMeasurementUnit(original, 'kg');
        expect(original.unit).toBe('lbs');
        expect(original.weight).toBe(180);
        expect(result).not.toBe(original);
    });

    it('returns same values when units match', () => {
        const entry = { weight: 180, unit: 'lbs' };
        const result = convertMeasurementUnit(entry, 'lbs');
        expect(result.weight).toBe(180);
        expect(result.unit).toBe('lbs');
    });

    it('handles null entry', () => {
        expect(convertMeasurementUnit(null, 'kg')).toEqual({ weight: 0, unit: 'kg' });
    });
});

describe('deduplicateByDate', () => {
    it('keeps latest entry when duplicates exist', () => {
        const entries = [
            { date: '2026-04-01', weight: 180, timestamp: '2026-04-01T08:00:00Z' },
            { date: '2026-04-01', weight: 179, timestamp: '2026-04-01T20:00:00Z' },
        ];
        const result = deduplicateByDate(entries);
        expect(result).toHaveLength(1);
        expect(result[0].weight).toBe(179); // Later timestamp wins
    });

    it('keeps all entries for different dates', () => {
        const entries = [
            { date: '2026-04-01', weight: 180 },
            { date: '2026-04-02', weight: 181 },
        ];
        const result = deduplicateByDate(entries);
        expect(result).toHaveLength(2);
    });

    it('returns sorted by date', () => {
        const entries = [
            { date: '2026-04-03', weight: 182 },
            { date: '2026-04-01', weight: 180 },
            { date: '2026-04-02', weight: 181 },
        ];
        const result = deduplicateByDate(entries);
        expect(result.map(e => e.date)).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
    });

    it('returns empty for empty/null', () => {
        expect(deduplicateByDate([])).toEqual([]);
        expect(deduplicateByDate(null)).toEqual([]);
    });
});
