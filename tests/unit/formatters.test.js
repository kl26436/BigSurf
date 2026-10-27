// UD-4 (docs/ux-deep-dive-2026-10.md) — the formatter table: one way to write
// a set, a short date, a relative time and a duration. Real modules.

import { describe, it, expect } from 'vitest';
import { formatRelative, formatDateShort, formatDuration } from '../../js/core/utils/date-helpers.js';
import { formatSet, unitLabel } from '../../js/core/ui/ui-helpers.js';

const now = new Date(2026, 9, 27, 12, 0); // Tue, Oct 27 2026, noon local

describe('formatRelative', () => {
    it('counts calendar days for a YYYY-MM-DD date', () => {
        expect(formatRelative('2026-10-27', { now })).toBe('today');
        expect(formatRelative('2026-10-26', { now })).toBe('yesterday');
        expect(formatRelative('2026-10-24', { now })).toBe('3 days ago');
        expect(formatRelative('2026-10-13', { now })).toBe('2 weeks ago');
        expect(formatRelative('2026-08-01', { now })).toBe('2 months ago');
        expect(formatRelative('2025-09-01', { now })).toBe('last year');
    });

    it('dense form for data rows', () => {
        expect(formatRelative('2026-10-24', { now, dense: true })).toBe('3d ago');
        expect(formatRelative('2026-10-13', { now, dense: true })).toBe('2w ago');
        expect(formatRelative('2026-08-01', { now, dense: true })).toBe('2mo ago');
        expect(formatRelative('2026-10-27', { now, dense: true })).toBe('today');
    });

    it('uses the clock for timestamps from today', () => {
        expect(formatRelative(new Date(2026, 9, 27, 11, 59, 40), { now })).toBe('just now');
        expect(formatRelative(new Date(2026, 9, 27, 11, 48), { now })).toBe('12 minutes ago');
        expect(formatRelative(new Date(2026, 9, 27, 9, 0), { now, dense: true })).toBe('3h ago');
        // Last night is "yesterday", never "14h ago".
        expect(formatRelative(new Date(2026, 9, 26, 22, 0), { now })).toBe('yesterday');
    });

    it('is empty for an unreadable date', () => {
        expect(formatRelative(null, { now })).toBe('');
        expect(formatRelative('not a date', { now })).toBe('');
    });
});

describe('formatDateShort', () => {
    it('reads "Tue, Oct 14" this year and adds the year otherwise', () => {
        expect(formatDateShort('2026-10-13', { now })).toBe('Tue, Oct 13');
        expect(formatDateShort('2025-10-14', { now })).toBe('Tue, Oct 14, 2025');
    });
});

describe('formatDuration', () => {
    it('spells minutes and hours out', () => {
        expect(formatDuration(2520)).toBe('42 min');
        expect(formatDuration(3900)).toBe('1 h 5 min');
        expect(formatDuration(7200)).toBe('2 h');
        expect(formatDuration(null)).toBe('0 min');
    });
});

describe('formatSet', () => {
    it('is reps first, then the load in the user unit', () => {
        expect(formatSet({ reps: 6, weight: 185, originalUnit: 'lbs' }, 'lbs')).toBe('6 × 185 lb');
        expect(formatSet({ reps: 6, weight: 100, originalUnit: 'kg' }, 'kg')).toBe('6 × 100 kg');
        expect(formatSet({ reps: 6, weight: 100, originalUnit: 'kg' }, 'lbs')).toBe('6 × 220.5 lb');
    });

    it('adds effort in plain words, and can leave it off', () => {
        expect(formatSet({ reps: 6, weight: 185, rpe: 8 }, 'lbs')).toBe('6 × 185 lb · effort 8/10');
        expect(formatSet({ reps: 6, weight: 185, rpe: 8 }, 'lbs', { effort: false })).toBe('6 × 185 lb');
    });

    it('a set without load is reps', () => {
        expect(formatSet({ reps: 12, weight: 0 }, 'lbs')).toBe('12 reps');
        expect(formatSet({ reps: 1 }, 'lbs')).toBe('1 rep');
    });

    it('unitLabel says lb, never lbs', () => {
        expect(unitLabel('lbs')).toBe('lb');
        expect(unitLabel('kg')).toBe('kg');
    });
});
