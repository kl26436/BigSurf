// AP-17 / AP-18 — guards the coach's write tools enforce. Pure module
// (mirrored to functions/coach-guards.js; parity in movement-patterns-mirror).

import { describe, it, expect } from 'vitest';
import {
    toolError, errorText, canonicalEnum, deloadLock, progressionGuard, loadabilityGuard,
    resolveEquipment, jaccard, findNearDuplicate, programShapeIssues,
} from '../../js/core/features/coach-guards.js';

const set = (weight, reps) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true });
const wo = (date, name, sets, extra = {}) => ({
    date, completedAt: `${date}T18:00:00Z`,
    exerciseNames: { exercise_0: name }, exercises: { exercise_0: { sets } }, ...extra,
});
const flat = ['2026-10-07', '2026-10-14', '2026-10-21'].map(d => wo(d, 'Bench Press', [set(200, 7)]));

describe('toolError / errorText / canonicalEnum', () => {
    it('builds the structured shape and reads either shape back', () => {
        expect(toolError('locked', 'No.', 'Do this.')).toEqual({ error: { code: 'locked', message: 'No.', hint: 'Do this.' } });
        expect(toolError('not_found', 'Gone.')).toEqual({ error: { code: 'not_found', message: 'Gone.' } });
        expect(errorText('plain')).toBe('plain');
        expect(errorText({ code: 'x', message: 'structured' })).toBe('structured');
        expect(canonicalEnum('PUSH', ['Push', 'Pull'])).toBe('Push');
        expect(canonicalEnum('chest', ['Push', 'Pull'])).toBeNull();
    });
});

describe('deloadLock', () => {
    const program = { startDate: '2026-10-19', weeks: 4, active: true, weekTargets: [{ week: 1, label: 'Deload', setDelta: -2 }] };
    it("locks in a program's deload week (volume-only deloads count)", () => {
        expect(deloadLock(program, '2026-10-24')).toEqual({ week: 1, label: 'Deload' });
    });
    it('is open in a build week, a finished block, or with no program', () => {
        expect(deloadLock(program, '2026-10-27')).toBeNull();
        expect(deloadLock(program, '2026-12-01')).toBeNull();
        expect(deloadLock(null, '2026-10-24')).toBeNull();
        expect(deloadLock({ ...program, active: false }, '2026-10-24')).toBeNull();
    });
});

describe('progressionGuard', () => {
    it('rejects a load above a stalled lift\'s rule target, naming the rung', () => {
        const msg = progressionGuard({ workouts: flat, exercise: 'bench press', weight: 205, repTarget: 8 });
        expect(msg).toBe("bench press is on stall rung 1 (3 sessions flat at 200 lbs); the rule's target is 200 lbs×8 (chase-rep) — 205 contradicts it.");
        expect(progressionGuard({ workouts: flat, exercise: 'Bench Press', weight: 200, repTarget: 8 })).toBeNull();
    });
    it('rejects above the deload target in a deload session', () => {
        const intent = { mode: 'deload', weightPct: -30 };
        const ok = [wo('2026-10-21', 'Bench Press', [set(200, 8)])];
        expect(progressionGuard({ workouts: ok, exercise: 'Bench Press', weight: 200, intent })).toMatch(/^Deload: Bench Press's target this session is 140 lbs/);
        expect(progressionGuard({ workouts: ok, exercise: 'Bench Press', weight: 140, intent })).toBeNull();
    });
    it('leaves a progressing lift (and unknown lifts) alone', () => {
        const climbing = [wo('2026-10-14', 'Bench Press', [set(190, 8)]), wo('2026-10-21', 'Bench Press', [set(200, 8)])];
        expect(progressionGuard({ workouts: climbing, exercise: 'Bench Press', weight: 205, repTarget: 8 })).toBeNull();
        expect(progressionGuard({ workouts: [], exercise: 'New Machine', weight: 500 })).toBeNull();
    });
});

describe('loadabilityGuard', () => {
    const hist = [wo('2026-10-21', 'Squat', [set(225, 5)])];
    it('accepts whole jumps from a lifted weight', () => {
        expect(loadabilityGuard({ workouts: hist, exercise: 'Squat', weight: 235 })).toBeNull();
        expect(loadabilityGuard({ workouts: hist, exercise: 'Squat', weight: 215 })).toBeNull();
    });
    it('rejects an off-grid weight with the two nearest real ones', () => {
        expect(loadabilityGuard({ workouts: hist, exercise: 'Squat', weight: 232.5 }))
            .toBe("232.5 lbs isn't loadable for Squat: move in 5 lbs steps from a weight already lifted (last 225) — e.g. 230 or 235.");
    });
    it('uses the gym\'s real jump: no 2.5 plates → 10 lb steps', () => {
        expect(loadabilityGuard({ workouts: hist, exercise: 'Squat', weight: 230, plates: [45, 25, 10, 5] })).toMatch(/e\.g\. 225 or 235/);
    });
    it('no history → nothing to anchor to → allowed', () => {
        expect(loadabilityGuard({ workouts: [], exercise: 'Squat', weight: 137.3 })).toBeNull();
    });
});

describe('resolveEquipment', () => {
    const lib = ['Hammer Strength Chest Press', 'Life Fitness Leg Press', 'Cable Station'];
    it('exact match is case-insensitive and canonicalizes', () => {
        expect(resolveEquipment('cable station', lib)).toEqual({ ok: true, name: 'Cable Station', exact: true });
    });
    it('a close typo (Dice ≥ 0.85) resolves to the library name', () => {
        expect(resolveEquipment('Hammer Strength Chest Pres', lib)).toMatchObject({ ok: true, name: 'Hammer Strength Chest Press', exact: false });
    });
    it('anything else fails with the three nearest', () => {
        const r = resolveEquipment('Smith Machine', lib);
        expect(r.ok).toBe(false);
        expect(r.nearest).toHaveLength(3);
    });
});

describe('near-duplicate detection', () => {
    it('jaccard on exercise names, case-insensitive', () => {
        expect(jaccard(['A', 'b', 'C'], ['a', 'B', 'D'])).toBe(0.5);
        expect(jaccard([], ['a'])).toBe(0);
    });
    it('finds the best active template at ≥ 0.7, ignoring archived ones', () => {
        const templates = [
            { id: 'push', name: 'Push day', exercises: ['Bench', 'Incline', 'Fly', 'Dips'].map(machine => ({ machine })) },
            { id: 'old', name: 'Old push', archived: true, exercises: ['Bench', 'Incline', 'Fly'].map(machine => ({ machine })) },
        ];
        const mine = ['Bench', 'Incline', 'Fly', 'Dips', 'Pushdown'].map(name => ({ machine: name }));
        expect(findNearDuplicate(mine, templates)).toEqual({ templateId: 'push', name: 'Push day', overlap: 0.8 });
        expect(findNearDuplicate([{ machine: 'Squat' }], templates)).toBeNull();
    });
});

describe('programShapeIssues', () => {
    const t = (id, names) => ({ id, exercises: names.map(n => ({ machine: n })) });
    it('frequency: a major muscle hit once a week is a warning', () => {
        const templates = [t('push', ['Bench Press', 'Shoulder Press']), t('pull', ['Seated Row']), t('legs', ['Leg Press'])];
        const r = programShapeIssues({ weeks: 0, split: { mon: 'push', wed: 'pull', fri: 'legs', sat: 'push' }, templates });
        expect(r.error).toBeNull();
        expect(r.warnings).toEqual([
            { code: 'frequency', message: 'Back is trained 1× a week in this split — most muscles grow best at 2×.' },
            { code: 'frequency', message: 'Legs is trained 1× a week in this split — most muscles grow best at 2×.' },
        ]);
    });
    it('a shaped block with a deload is clean', () => {
        const r = programShapeIssues({
            weeks: 4,
            weekTargets: [{ week: 2, label: 'more', setDelta: 1 }, { week: 3, label: 'heavy', repRange: [6, 8] }, { week: 4, label: 'deload', weightPct: -35 }],
        });
        expect(r).toEqual({ error: null, warnings: [] });
    });
});
