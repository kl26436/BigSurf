// Tests for CSV/JSON data export (Phase 13.3)
// Verifies CSV generation, escaping, and import validation

import { describe, it, expect } from 'vitest';

/**
 * Escape a string for CSV: wrap in quotes if it contains commas, quotes, or newlines.
 */
function escapeCSV(str) {
    if (!str) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Generate CSV from workout data. One row per set.
 */
function generateCSV(workouts) {
    const headers = ['Date', 'Workout Name', 'Exercise', 'Equipment', 'Set #', 'Set Type', 'Reps', 'Weight', 'Unit', 'Notes', 'Duration (min)'];
    const rows = [headers.join(',')];

    for (const workout of workouts) {
        for (const [key, exercise] of Object.entries(workout.exercises || {})) {
            for (let i = 0; i < (exercise.sets || []).length; i++) {
                const set = exercise.sets[i];
                rows.push([
                    workout.date,
                    escapeCSV(workout.workoutType),
                    escapeCSV(exercise.name || exercise.machine || ''),
                    escapeCSV(exercise.equipment || ''),
                    i + 1,
                    set.type || 'working',
                    set.reps || '',
                    set.weight || '',
                    set.originalUnit || 'lbs',
                    escapeCSV(exercise.notes || ''),
                    workout.totalDuration ? Math.round(workout.totalDuration / 60) : '',
                ].join(','));
            }
        }
    }
    return rows.join('\n');
}

/**
 * Validate JSON import structure.
 */
function validateImportJSON(data) {
    if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid data format' };
    if (!data.version) return { valid: false, error: 'Missing version field' };
    if (!data.workouts || !Array.isArray(data.workouts)) return { valid: false, error: 'Missing or invalid workouts array' };
    return { valid: true, error: null };
}

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
