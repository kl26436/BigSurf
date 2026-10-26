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
    // AP-18 — an invalid one is now an ERROR listing the allowed values.
    it('keeps valid prescription fields and rejects invalid ones with the allowed values', () => {
        const good = normalizeExercise({
            name: 'Seated Chest Press', sets: 4, reps: 10,
            repRange: [8, 12], rpeTarget: 8, role: 'primary', pattern: 'horizontal-push', progression: 'double',
        });
        expect(good).toMatchObject({ repRange: [8, 12], rpeTarget: 8, role: 'primary', pattern: 'horizontal-push', progression: 'double' });
        expect(normalizeExercise({ name: 'X', role: 'chief' }).error)
            .toBe('X: role must be one of primary, secondary, accessory, core (got "chief")');
        expect(normalizeExercise({ name: 'X', pattern: 'fly' }).error).toMatch(/pattern must be one of horizontal-push, /);
        expect(normalizeExercise({ name: 'X', progression: 'never' }).error).toMatch(/progression must be one of double, load-only, rep-only, hold/);
        expect(normalizeExercise({ name: 'X', repRange: [12, 8] }).error).toMatch(/repRange must be \[low, high\]/);
        expect(normalizeExercise({ name: 'X', rpeTarget: 2 }).error).toMatch(/rpeTarget must be 6-10/);
    });

    it('rejects missing name, empty exercises, too many exercises', () => {
        expect(validateCreateTemplateInput({ exercises: [{ name: 'X' }] }).ok).toBe(false);
        expect(validateCreateTemplateInput({ name: 'A', exercises: [] }).ok).toBe(false);
        const tooMany = Array.from({ length: 13 }, (_, i) => ({ name: `Ex${i}` }));
        expect(validateCreateTemplateInput({ name: 'A', exercises: tooMany }).ok).toBe(false);
    });

    it('one bad exercise rejects the whole call — nothing is silently dropped (AP-18)', () => {
        expect(validateCreateTemplateInput({ name: 'A', exercises: [{}, { sets: 3 }] }).ok).toBe(false);
        const v = validateCreateTemplateInput({ name: 'A', exercises: [{ name: 'Good' }, {}] });
        expect(v).toEqual({ ok: false, error: 'each exercise needs a name' });
    });

    it('rejects out-of-range sets/reps/weight instead of clamping to 3×10 (AP-18)', () => {
        expect(normalizeExercise({ name: 'Squat', sets: 12 }).error).toBe('Squat: sets must be a whole number 1-10 (got 12)');
        expect(normalizeExercise({ name: 'Squat', sets: 3.5 }).error).toMatch(/sets must be a whole number/);
        expect(normalizeExercise({ name: 'Squat', reps: -5 }).error).toBe('Squat: reps must be a whole number 1-50 (got -5)');
        expect(normalizeExercise({ name: 'Squat', weight: 99999 }).error).toMatch(/weight must be a number 0-2000/);
        // Absent is not invalid: defaults still apply.
        expect(normalizeExercise({ name: 'Squat' })).toEqual({ machine: 'Squat', sets: 3, reps: 10 });
    });

    it('category is an enum, matched case-insensitively', () => {
        expect(validateCreateTemplateInput({ name: 'A', category: 'push', exercises: [{ name: 'X' }] }).normalized.category).toBe('Push');
        expect(validateCreateTemplateInput({ name: 'A', exercises: [{ name: 'X' }] }).normalized.category).toBe('Other');
        expect(validateCreateTemplateInput({ name: 'A', category: 'Chest day', exercises: [{ name: 'X' }] }).error)
            .toMatch(/^category must be one of Push, Pull, Legs, Core, Cardio, Arms, Shoulders, Other/);
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
            'add_event', 'adjust_program', 'archive_template', 'create_program',
            'create_workout_template', 'forget_fact', 'get_exercise_history',
            'get_program', 'get_prs', 'get_report_card', 'get_rotation_candidates', 'get_verdicts', 'get_week_plan', 'get_workouts', 'list_equipment', 'list_exercises', 'list_goals', 'list_templates',
            'log_advice', 'propose_session_adjustments', 'propose_week_adjustment', 'remember_fact', 'replace_day',
            'set_goal', 'set_primary_lifts', 'set_week_plan', 'update_goal', 'update_workout_template',
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
        rationale: { block: 'Strength, 4 weeks, deload week 4' },
    });

    it('AP-23e: a 4+ week program needs a rationale; it is normalized and kept', () => {
        const { rationale: _r, ...noRationale } = good();
        expect(validateProgramInput(noRationale).error).toMatch(/^A 4-week program needs a rationale/);
        const v = validateProgramInput({
            ...good(),
            rationale: {
                block: 'Strength, 4 weeks', weeks: [{ week: 1, why: 'accumulate' }, { week: 9, why: 'out of range' }],
                fixed: [{ name: 'Bench Press', why: 'main lift' }], changed: [{ from: 'Fly', to: 'Pec deck', why: 'never used' }],
                watch: ['Bench e1RM'],
            },
        });
        expect(v.normalized.rationale).toEqual({
            block: 'Strength, 4 weeks', weeks: [{ week: 1, why: 'accumulate' }],
            fixed: [{ name: 'Bench Press', why: 'main lift' }], changed: [{ from: 'Fly', to: 'Pec deck', why: 'never used' }],
            watch: ['Bench e1RM'],
        });
        // Shorter blocks don't need one.
        expect(validateProgramInput({ ...noRationale, weeks: 3, weekTargets: [] }).ok).toBe(true);
    });

    it('accepts a sane program and normalizes targets', () => {
        const v = validateProgramInput(good());
        expect(v.ok).toBe(true);
        expect(v.normalized.weekTargets[0]).toMatchObject({ week: 4, label: 'deload', weightPct: -40 });
    });

    // CP-3 / Bug 3 — the validator used to keep only week/label/weightPct/note.
    it('keeps setDelta / repRange / rpeTarget and REJECTS out-of-range values (AP-18)', () => {
        const v = validateProgramInput({
            ...good(),
            weekTargets: [
                { week: 2, label: 'accumulate', setDelta: 1, repRange: [10, 12], rpeTarget: 7.5 },
                { week: 4, label: 'deload', setDelta: -2, weightPct: -35 },
            ],
        });
        expect(v.ok).toBe(true);
        expect(v.normalized.weekTargets[0]).toEqual({ week: 2, label: 'accumulate', setDelta: 1, repRange: [10, 12], rpeTarget: 7.5 });
        expect(v.normalized.weekTargets[1]).toEqual({ week: 4, label: 'deload', setDelta: -2, weightPct: -35 });
        const sloppy = validateProgramInput({ ...good(), weekTargets: [{ week: 3, label: 'sloppy', setDelta: 9 }, { week: 4, label: 'deload', weightPct: -35 }] });
        expect(sloppy).toEqual({ ok: false, error: 'week 3: setDelta must be a whole number from -3 to +3 (got 9)' });
    });

    it('goal is an enum (AP-18)', () => {
        expect(validateProgramInput({ ...good(), goal: 'Strength' }).normalized.goal).toBe('strength');
        expect(validateProgramInput({ ...good(), goal: 'get huge' }).error).toMatch(/^goal must be one of strength, hypertrophy, recomp, general/);
    });

    it('a 4+ week block without a deload is rejected; identical weeks warn (AP-17)', () => {
        const noDeload = validateProgramInput({ ...good(), weeks: 6, weekTargets: [{ week: 2, label: 'heavy', weightPct: 5 }] });
        expect(noDeload.ok).toBe(false);
        expect(noDeload.error).toMatch(/^A 6-week block needs a deload week/);
        const flat = validateProgramInput({ ...good(), weeks: 4, weekTargets: [{ week: 4, label: 'deload', weightPct: -35 }] });
        expect(flat.ok).toBe(true);
        expect(flat.warnings.map(w => w.code)).toEqual(['identical_weeks']);
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
