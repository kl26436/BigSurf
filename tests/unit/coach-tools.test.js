// AI coach tool validation — the pure halves of functions/coach-tools.js.
// (Executors are Firestore-touching and covered by manual acceptance; these
// tests lock the validation/diff logic that guards every write.)

import { describe, it, expect } from 'vitest';
import {
    validateCreateTemplateInput,
    applyTemplateChanges,
    normalizeExercise,
    TOOL_DEFINITIONS,
} from '../../functions/coach-tools.js';

describe('validateCreateTemplateInput', () => {
    it('accepts a sane workout and normalizes exercises', () => {
        const v = validateCreateTemplateInput({
            name: 'Pull day — Crunch',
            category: 'Pull',
            exercises: [
                { name: 'Deadlift', sets: 4, reps: 6, weight: 275, bodyPart: 'Back' },
                { name: 'Lat Pulldown', equipment: 'Cable Station' },
            ],
        });
        expect(v.ok).toBe(true);
        expect(v.normalized.exercises[0]).toMatchObject({ machine: 'Deadlift', sets: 4, reps: 6, weight: 275 });
        expect(v.normalized.exercises[1]).toMatchObject({ machine: 'Lat Pulldown', sets: 3, reps: 10, equipment: 'Cable Station' });
    });

    it('rejects missing name, empty exercises, too many exercises', () => {
        expect(validateCreateTemplateInput({ exercises: [{ name: 'X' }] }).ok).toBe(false);
        expect(validateCreateTemplateInput({ name: 'A', exercises: [] }).ok).toBe(false);
        const tooMany = Array.from({ length: 13 }, (_, i) => ({ name: `Ex${i}` }));
        expect(validateCreateTemplateInput({ name: 'A', exercises: tooMany }).ok).toBe(false);
    });

    it('rejects when every exercise is invalid; drops only the bad ones otherwise', () => {
        expect(validateCreateTemplateInput({ name: 'A', exercises: [{}, { sets: 3 }] }).ok).toBe(false);
        const v = validateCreateTemplateInput({ name: 'A', exercises: [{ name: 'Good' }, {}] });
        expect(v.ok).toBe(true);
        expect(v.normalized.exercises).toHaveLength(1);
    });

    it('clamps garbage sets/reps to defaults and ignores absurd weights', () => {
        const ex = normalizeExercise({ name: 'Squat', sets: 99, reps: -5, weight: 99999 });
        expect(ex).toMatchObject({ machine: 'Squat', sets: 3, reps: 10 });
        expect(ex.weight).toBeUndefined();
    });
});

describe('applyTemplateChanges', () => {
    const template = () => ({
        id: 'push_day', name: 'Push Day', category: 'Push',
        exercises: [
            { machine: 'Bench Press', sets: 4, reps: 8, weight: 145 },
            { machine: 'OHP', sets: 3, reps: 10, weight: 95 },
        ],
    });

    it('changes weight and reports a human-readable diff', () => {
        const r = applyTemplateChanges(template(), { setExercise: { name: 'Bench Press', weight: 155 } });
        expect(r.ok).toBe(true);
        expect(r.updated.exercises[0].weight).toBe(155);
        expect(r.diffSummary).toContain('Bench Press 145 → 155');
    });

    it('renames, adds, and removes with diffs', () => {
        const r = applyTemplateChanges(template(), {
            rename: 'Push Day A',
            addExercises: [{ name: 'Dips', sets: 3, reps: 12 }],
            removeExercises: ['OHP'],
        });
        expect(r.ok).toBe(true);
        expect(r.updated.name).toBe('Push Day A');
        expect(r.updated.exercises.map(e => e.machine)).toEqual(['Bench Press', 'Dips']);
        expect(r.diffSummary).toContain('Renamed');
        expect(r.diffSummary).toContain('Added Dips 3×12');
        expect(r.diffSummary).toContain('Removed OHP');
    });

    it('reorders exercises by name and reports the new order', () => {
        const r = applyTemplateChanges(template(), { reorderExercises: ['OHP', 'Bench Press'] });
        expect(r.ok).toBe(true);
        expect(r.updated.exercises.map(e => e.machine)).toEqual(['OHP', 'Bench Press']);
        expect(r.diffSummary).toContain('Reordered: OHP → Bench Press');
    });

    it('reorder must list ALL exercises, no unknowns, no dupes', () => {
        expect(applyTemplateChanges(template(), { reorderExercises: ['OHP'] }).ok).toBe(false);
        expect(applyTemplateChanges(template(), { reorderExercises: ['OHP', 'Curlz'] }).ok).toBe(false);
        expect(applyTemplateChanges(template(), { reorderExercises: ['OHP', 'OHP'] }).ok).toBe(false);
    });

    it('unknown exercise name → tool error, template untouched', () => {
        const r = applyTemplateChanges(template(), { setExercise: { name: 'Curlz', weight: 50 } });
        expect(r.ok).toBe(false);
        expect(r.error).toContain('Curlz');
    });

    it('no-op change set → error (never a silent empty write)', () => {
        expect(applyTemplateChanges(template(), {}).ok).toBe(false);
    });

    it('missing template → error', () => {
        expect(applyTemplateChanges(null, { rename: 'X' }).ok).toBe(false);
    });

    it('invalid weight/sets/reps values rejected', () => {
        expect(applyTemplateChanges(template(), { setExercise: { name: 'OHP', weight: -1 } }).ok).toBe(false);
        expect(applyTemplateChanges(template(), { setExercise: { name: 'OHP', sets: 0 } }).ok).toBe(false);
        expect(applyTemplateChanges(template(), { setExercise: { name: 'OHP', reps: 999 } }).ok).toBe(false);
    });
});

describe('TOOL_DEFINITIONS', () => {
    it('exposes exactly the phase-3 + phase-4 tools with valid schemas', () => {
        const names = TOOL_DEFINITIONS.map(t => t.name).sort();
        expect(names).toEqual([
            'create_workout_template', 'forget_fact', 'get_exercise_history',
            'get_prs', 'list_templates', 'remember_fact', 'update_workout_template',
        ]);
        for (const t of TOOL_DEFINITIONS) {
            expect(t.description.length).toBeGreaterThan(20);
            expect(t.input_schema.type).toBe('object');
        }
    });
});
