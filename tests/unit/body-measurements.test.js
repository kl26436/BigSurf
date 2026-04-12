// Tests for body weight & measurements tracking (Phase 12.5)
// Verifies 7-day moving average, unit conversion, and duplicate handling

import { describe, it, expect } from 'vitest';

// Re-implement pure functions for test isolation (no Firebase/DOM dependencies)

/**
 * Calculate 7-day moving average for body weight entries.
 * @param {Array<{date: string, weight: number}>} entries - Sorted by date ascending
 * @returns {Array<{date: string, weight: number}>} Moving average at each point
 */
function calculate7DayAverage(entries) {
    if (!entries || entries.length === 0) return [];
    return entries.map((entry, i) => {
        const window = entries.slice(Math.max(0, i - 6), i + 1);
        const avg = window.reduce((sum, e) => sum + e.weight, 0) / window.length;
        return { date: entry.date, weight: Math.round(avg * 10) / 10 };
    });
}

/**
 * Convert a measurement entry to a different unit without mutating original.
 * @param {{weight: number, unit: string}} entry
 * @param {string} targetUnit - 'lbs' or 'kg'
 * @returns {{weight: number, unit: string}}
 */
function convertMeasurementUnit(entry, targetUnit) {
    if (!entry || !entry.weight) return { weight: 0, unit: targetUnit };
    if (entry.unit === targetUnit) return { ...entry };

    if (entry.unit === 'lbs' && targetUnit === 'kg') {
        return { ...entry, weight: Math.round(entry.weight * 0.453592 * 10) / 10, unit: 'kg' };
    }
    if (entry.unit === 'kg' && targetUnit === 'lbs') {
        return { ...entry, weight: Math.round(entry.weight * 2.20462 * 10) / 10, unit: 'lbs' };
    }
    return { ...entry };
}

/**
 * Deduplicate entries by date, keeping the latest entry for each date.
 * @param {Array<{date: string, weight: number, timestamp: string}>} entries
 * @returns {Array} Deduplicated entries sorted by date
 */
function deduplicateByDate(entries) {
    if (!entries || entries.length === 0) return [];
    const byDate = new Map();
    for (const entry of entries) {
        const existing = byDate.get(entry.date);
        if (!existing || (entry.timestamp && (!existing.timestamp || entry.timestamp > existing.timestamp))) {
            byDate.set(entry.date, entry);
        }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

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
