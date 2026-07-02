// Tests for CSV/JSON data export (Phase 13.3)
// Imports the REAL functions from data-export-import.js. That module statically
// imports firebase-config (CDN URLs) and ui-helpers (DOM at import time), so
// both are mocked — the functions under test are pure.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {},
    doc: vi.fn(),
    setDoc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    collection: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
}));

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    escapeHtml: (s) => s,
    openModal: vi.fn(),
    closeModal: vi.fn(),
}));

import { escapeCSV, generateCSV, validateImportJSON } from '../../js/core/data/data-export-import.js';

// ===================================================================
// TESTS
// ===================================================================

describe('escapeCSV', () => {
    it('returns plain string unchanged', () => {
        expect(escapeCSV('hello')).toBe('hello');
    });

    it('wraps strings with commas in quotes', () => {
        expect(escapeCSV('Bench Press, Flat')).toBe('"Bench Press, Flat"');
    });

    it('escapes internal quotes by doubling them', () => {
        expect(escapeCSV('6" grip')).toBe('"6"" grip"');
    });

    it('wraps strings with newlines in quotes', () => {
        expect(escapeCSV('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
    });

    it('handles empty string', () => {
        expect(escapeCSV('')).toBe('');
    });

    it('handles null/undefined', () => {
        expect(escapeCSV(null)).toBe('');
        expect(escapeCSV(undefined)).toBe('');
    });
});

describe('generateCSV', () => {
    it('produces correct headers as first row', () => {
        const csv = generateCSV([]);
        const firstLine = csv.split('\n')[0];
        expect(firstLine).toBe('Date,Workout Name,Exercise,Equipment,Set #,Set Type,Reps,Weight,Unit,Notes,Duration (min)');
    });

    it('produces one row per set', () => {
        const workouts = [{
            date: '2026-04-01',
            workoutType: 'Push Day',
            totalDuration: 3600,
            exercises: {
                exercise_0: {
                    name: 'Bench Press',
                    equipment: 'Barbell',
                    sets: [
                        { weight: 135, reps: 10, originalUnit: 'lbs', type: 'working' },
                        { weight: 155, reps: 8, originalUnit: 'lbs', type: 'working' },
                    ],
                },
            },
        }];
        const csv = generateCSV(workouts);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(3); // header + 2 sets
        expect(lines[1]).toContain('Bench Press');
        expect(lines[1]).toContain('135');
        expect(lines[2]).toContain('155');
    });

    it('handles commas and quotes in exercise names', () => {
        const workouts = [{
            date: '2026-04-01',
            workoutType: 'Pull',
            exercises: {
                exercise_0: {
                    name: 'Lat Pulldown, Wide Grip',
                    equipment: '6" Handle',
                    sets: [{ weight: 100, reps: 12, originalUnit: 'lbs' }],
                },
            },
        }];
        const csv = generateCSV(workouts);
        expect(csv).toContain('"Lat Pulldown, Wide Grip"');
        expect(csv).toContain('"6"" Handle"');
    });

    it('handles mixed units (lbs/kg) preserving original unit per row', () => {
        const workouts = [{
            date: '2026-04-01',
            workoutType: 'Legs',
            exercises: {
                exercise_0: {
                    name: 'Squat',
                    sets: [
                        { weight: 225, reps: 5, originalUnit: 'lbs' },
                        { weight: 100, reps: 5, originalUnit: 'kg' },
                    ],
                },
            },
        }];
        const csv = generateCSV(workouts);
        const lines = csv.split('\n');
        expect(lines[1]).toContain('lbs');
        expect(lines[2]).toContain('kg');
    });

    it('returns only headers for empty workouts array', () => {
        const csv = generateCSV([]);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(1);
    });

    it('calculates duration in minutes', () => {
        const workouts = [{
            date: '2026-04-01',
            workoutType: 'Push',
            totalDuration: 5400, // 90 minutes
            exercises: {
                exercise_0: { name: 'Bench', sets: [{ weight: 135, reps: 10 }] },
            },
        }];
        const csv = generateCSV(workouts);
        expect(csv).toContain('90');
    });
});

describe('validateImportJSON', () => {
    it('accepts valid export data', () => {
        const data = { version: '3.0', workouts: [{ date: '2026-04-01' }] };
        expect(validateImportJSON(data)).toEqual({ valid: true, error: null });
    });

    it('rejects null/undefined', () => {
        expect(validateImportJSON(null).valid).toBe(false);
        expect(validateImportJSON(undefined).valid).toBe(false);
    });

    it('rejects missing version', () => {
        expect(validateImportJSON({ workouts: [] }).valid).toBe(false);
        expect(validateImportJSON({ workouts: [] }).error).toContain('version');
    });

    it('rejects missing workouts array', () => {
        expect(validateImportJSON({ version: '3.0' }).valid).toBe(false);
        expect(validateImportJSON({ version: '3.0' }).error).toContain('workouts');
    });

    it('rejects non-array workouts', () => {
        expect(validateImportJSON({ version: '3.0', workouts: 'not an array' }).valid).toBe(false);
    });

    it('rejects non-object data', () => {
        expect(validateImportJSON('string').valid).toBe(false);
        expect(validateImportJSON(42).valid).toBe(false);
    });
});
