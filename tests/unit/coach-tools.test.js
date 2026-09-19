// AI coach tool validation — the pure halves of functions/coach-tools.js.
// (Executors are Firestore-touching and covered by manual acceptance; these
// tests lock the validation/diff logic that guards every write.)

import { describe, it, expect } from 'vitest';
import {
    validateCreateTemplateInput,
    applyTemplateChanges,
    replaceTemplateExercises,
    normalizeExercise,
    validateProgramInput,
    TOOL_DEFINITIONS,
} from '../../functions/coach-tools.js';

describe('replaceTemplateExercises (CP-5 replace_day)', () => {
    const template = {
        name: 'Pull day', category: 'Pull',
        exercises: [
            { machine: 'Lat Pulldown', sets: 4, reps: 10, weight: 230, notes: 'wide grip', equipmentId: 'eq_1' },
            { machine: 'Seated Row Machine', sets: 3, defaultReps: 12, weight: 220 },
            { machine: 'Reverse Pec Deck', sets: 3, reps: 15, weight: 90 },
        ],
    };

    it('classifies kept / changed / added / removed by name and writes the full new list', () => {
        const r = replaceTemplateExercises(template, {
            exercises: [
                { name: 'Lat Pulldown', sets: 4, reps: 10, weight: 230 },
                { name: 'Seated Row Machine', sets: 4, reps: 8 },
                { name: 'Peck Back', sets: 3, reps: 12 },
            ],
        });
        expect(r.ok).toBe(true);
        expect(r.diff.kept).toEqual(['Lat Pulldown']);
        expect(r.diff.changed).toEqual(['Seated Row Machine 3×12 → 4×8']);
        expect(r.diff.added).toEqual(['Peck Back 3×12']);
        expect(r.diff.removed).toEqual(['Reverse Pec Deck']);
        expect(r.updated.exercises.map(e => e.machine)).toEqual(['Lat Pulldown', 'Seated Row Machine', 'Peck Back']);
        expect(r.diffSummary).toContain('Added Peck Back');
    });

    it('carries forward fields the model does not resend (notes, equipmentId, defaultReps)', () => {
        const r = replaceTemplateExercises(template, {
            exercises: [
                { name: 'Lat Pulldown', sets: 4, reps: 10 },
                { name: 'Seated Row Machine', sets: 3, reps: 12, weight: 220 },
            ],
        });
        expect(r.ok).toBe(true);
        const [lat, row] = r.updated.exercises;
        expect(lat.notes).toBe('wide grip');
        expect(lat.equipmentId).toBe('eq_1');
        expect(lat.weight).toBe(230);
        expect(row.defaultReps).toBe(12);
        expect(r.diff.kept).toEqual(['Lat Pulldown', 'Seated Row Machine']);
        expect(r.diff.removed).toEqual(['Reverse Pec Deck']);
    });

    it('optionally renames and preserves untouched template fields', () => {
        const r = replaceTemplateExercises({ ...template, kind: 'core', usageCount: 40 }, {
            rename: 'Pull day — rotated',
            exercises: [{ name: 'Lat Pulldown', sets: 4, reps: 10 }],
        });
        expect(r.ok).toBe(true);
        expect(r.updated.name).toBe('Pull day — rotated');
        expect(r.updated.kind).toBe('core');
        expect(r.updated.usageCount).toBe(40);
        expect(r.diffSummary).toMatch(/^Renamed/);
    });

    it('rejects an empty list, duplicates, nameless entries, and a no-op rewrite', () => {
        expect(replaceTemplateExercises(template, { exercises: [] }).ok).toBe(false);
        expect(replaceTemplateExercises(template, { exercises: [{ name: 'A', sets: 3, reps: 10 }, { name: 'a', sets: 3, reps: 10 }] }).ok).toBe(false);
        expect(replaceTemplateExercises(template, { exercises: [{ sets: 3, reps: 10 }] }).ok).toBe(false);
        const same = replaceTemplateExercises(template, {
            exercises: [
                { name: 'Lat Pulldown', sets: 4, reps: 10, weight: 230 },
                { name: 'Seated Row Machine', sets: 3, reps: 12, weight: 220 },
                { name: 'Reverse Pec Deck', sets: 3, reps: 15, weight: 90 },
            ],
        });
        expect(same.ok).toBe(false);
        expect(same.error).toMatch(/identical/);
    });
});

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

    // CP-1 / Bug 7 — the whitelist used to drop these silently, so a
    // coach-written template lost every prescription field on the way in.
    it('keeps valid prescription fields and drops invalid ones', () => {
        const good = normalizeExercise({
            name: 'Seated Chest Press', sets: 4, reps: 10,
            repRange: [8, 12], rpeTarget: 8, role: 'primary', pattern: 'horizontal-push', progression: 'double',
        });
        expect(good).toMatchObject({ repRange: [8, 12], rpeTarget: 8, role: 'primary', pattern: 'horizontal-push', progression: 'double' });
        const bad = normalizeExercise({ name: 'X', repRange: [12, 8], rpeTarget: 2, role: 'chief', pattern: 'fly', progression: 'never' });
        expect(bad).toEqual({ machine: 'X', sets: 3, reps: 10 });
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
    it('exposes exactly the coach-tab tool set with valid schemas', () => {
        const names = TOOL_DEFINITIONS.map(t => t.name).sort();
        expect(names).toEqual([
            'adjust_program', 'archive_template', 'create_program',
            'create_workout_template', 'forget_fact', 'get_exercise_history',
            'get_program', 'get_prs', 'get_week_plan', 'list_equipment', 'list_exercises', 'list_templates',
            'log_advice', 'propose_session_adjustments', 'remember_fact', 'replace_day',
            'set_week_plan', 'update_workout_template',
        ]);
        for (const t of TOOL_DEFINITIONS) {
            expect(t.description.length).toBeGreaterThan(20);
            expect(t.input_schema.type).toBe('object');
        }
    });
});

describe('validateProgramInput (Phase 9)', () => {
    const good = () => ({
        name: 'Strength block', goal: 'strength', weeks: 4, startDate: '2026-07-06',
        weekTargets: [{ week: 4, label: 'deload', weightPct: -40 }],
        split: { mon: 'push_day' },
    });

    it('accepts a sane program and normalizes targets', () => {
        const v = validateProgramInput(good());
        expect(v.ok).toBe(true);
        expect(v.normalized.weekTargets[0]).toMatchObject({ week: 4, label: 'deload', weightPct: -40 });
    });

    it('rejects missing name/split, bad weeks, bad dates, out-of-range targets', () => {
        expect(validateProgramInput({ ...good(), name: '' }).ok).toBe(false);
        expect(validateProgramInput({ ...good(), split: null }).ok).toBe(false);
        expect(validateProgramInput({ ...good(), weeks: 0 }).ok).toBe(false);
        expect(validateProgramInput({ ...good(), weeks: 99 }).ok).toBe(false);
        expect(validateProgramInput({ ...good(), startDate: 'next monday' }).ok).toBe(false);
        expect(validateProgramInput({ ...good(), weekTargets: [{ week: 9, label: 'x' }] }).ok).toBe(false);
    });
});
