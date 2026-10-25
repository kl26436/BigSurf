// AP-24 — the Block page model: week × day cells, past results vs targets,
// future targets from the same math the set rows use, override badges.
// Pure module, imported real.

import { describe, it, expect } from 'vitest';
import { buildBlockModel, buildBlockSession, primaryOf, targetFor } from '../../js/core/features/block-view.js';
import { buildExerciseSessions, progressionTarget, scaleLoadableWeight } from '../../js/core/features/progression.js';

// Block starts Monday 2026-10-05: week 1 = Oct 5–11 … week 4 = Oct 26–Nov 1 (deload).
const TODAY = '2026-10-21'; // Wednesday of week 3
const program = {
    name: 'Strength block', goal: 'strength', weeks: 4, startDate: '2026-10-05', active: true,
    split: { mon: 'push', wed: 'pull', fri: 'rest' },
    weekTargets: [{ week: 3, label: 'intensify', repRange: [6, 8] }, { week: 4, label: 'deload', weightPct: -35 }],
    rationale: { block: 'Strength, 4 weeks, deload week 4', fixed: [{ name: 'Bench Press', why: 'main lift' }] },
};
const templates = [
    { id: 'push', name: 'Push day', exercises: [{ machine: 'Bench Press', sets: 3, defaultReps: 8, role: 'primary' }, { machine: 'Cable Fly', sets: 3, defaultReps: 12 }] },
    { id: 'pull', name: 'Pull day', exercises: [{ machine: 'Seated Row', sets: 3, defaultReps: 10 }] },
];
const set = (weight, reps) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true });
const wo = (id, date, workoutType, name, sets) => ({
    id, date, workoutType, completedAt: `${date}T18:00:00Z`,
    exerciseNames: { exercise_0: name }, exercises: { exercise_0: { sets } },
});
const workouts = [
    wo('a', '2026-10-05', 'Push day', 'Bench Press', [set(180, 8)]),
    wo('b', '2026-10-07', 'Pull day', 'Seated Row', [set(150, 10)]),
    wo('c', '2026-10-12', 'Push day', 'Bench Press', [set(185, 8)]),
    // Week 2's pull missed; week 3's push done a day late (Tuesday).
    wo('d', '2026-10-20', 'Push day', 'Bench Press', [set(190, 6)]),
];
const model = (extra = {}) => buildBlockModel({ program, templates, workouts, today: TODAY, ...extra });

describe('buildBlockModel', () => {
    it('no program → null (the page shows its empty state)', () => {
        expect(buildBlockModel({ program: null, today: TODAY })).toBeNull();
    });

    it('header: current week, its label, days trained vs planned', () => {
        expect(model().header).toMatchObject({
            name: 'Strength block', week: 3, weeks: 4, weekLabel: 'intensify', finished: false,
            endDate: '2026-11-01', daysTrained: 4, daysPlanned: 6,
        });
        expect(model().rationale.block).toBe('Strength, 4 weeks, deload week 4');
    });

    it('one row per split training day (rest days excluded), dated within each week', () => {
        const w1 = model().weeks[0];
        expect(w1.cells.map(c => [c.dayLabel, c.name, c.date])).toEqual([['Mon', 'Push day', '2026-10-05'], ['Wed', 'Pull day', '2026-10-07']]);
    });

    it('done / missed / today / upcoming — a session done on another day of the week still counts', () => {
        const m = model();
        expect(m.weeks[0].cells.map(c => c.status)).toEqual(['done', 'done']);
        expect(m.weeks[1].cells.map(c => c.status)).toEqual(['done', 'missed']);
        expect(m.weeks[2].cells.map(c => c.status)).toEqual(['done', 'today']);
        expect(m.weeks[2].cells[0]).toMatchObject({ doneOn: '2026-10-20', workoutId: 'd' });
        expect(m.weeks[3].cells.map(c => c.status)).toEqual(['upcoming', 'upcoming']);
        expect(m.weeks[2].current).toBe(true);
        expect(m.weeks[1].past).toBe(true);
    });

    it('a past cell shows the logged top set against the target from the history before it', () => {
        const c = model().weeks[1].cells[0];
        expect(c.primary).toMatchObject({ name: 'Bench Press', logged: { weight: 185, reps: 8 } });
        expect(c.primary.target).toMatchObject({ weight: 185, action: 'bump' });
        expect(c.primary.result).toBe('hit');
        expect(model().weeks[2].cells[0].primary.result).toBe('below'); // 190×6 vs a 190×8 target
    });

    it('the deload week shows the deload target — the same call the set rows make', () => {
        const future = model().weeks[3].cells[0].primary.target;
        const sessions = buildExerciseSessions(workouts, 'Bench Press', 'lbs');
        const expected = progressionTarget(sessions, 'lbs', 8, 5, { mode: 'deload', weightPct: -35, source: 'program' });
        expect(future).toMatchObject({ weight: expected.weight, action: 'deload' });
        expect(future.weight).toBe(scaleLoadableWeight(190, 0.65, 5));
        expect(model().weeks[3]).toMatchObject({ isDeload: true, levers: '-35% weight' });
    });

    it('a week override shows as a badge on the weeks it covers', () => {
        const m = model({ override: { from: '2026-10-19', weeks: 1, weightPct: -10, label: 'Lighter week', reason: 'last week was hard' } });
        expect(m.weeks[2].override).toEqual({ label: 'Lighter week', levers: '-10% weight', through: '2026-10-25', reason: 'last week was hard' });
        expect(m.weeks[1].override).toBeNull();
    });

    it('"Plan next block" shows from the last (deload) week on', () => {
        expect(model().planNextVisible).toBe(false);
        expect(model({ today: '2026-10-27' }).planNextVisible).toBe(true);
        expect(model({ today: '2026-11-10' }).header.finished).toBe(true);
    });
});

describe('primaryOf / buildBlockSession', () => {
    it('an explicit primary wins; else the first inferred one', () => {
        expect(primaryOf(templates[0]).machine).toBe('Bench Press');
        expect(primaryOf({ exercises: [{ machine: 'Cable Fly' }, { machine: 'Squat' }] }).machine).toBe('Squat');
    });

    it('a cell in full: every exercise with that week\'s target and what was logged', () => {
        const cell = model().weeks[2].cells[0];
        const rows = buildBlockSession({ cell, template: templates[0], workouts, program });
        expect(rows[0]).toMatchObject({ name: 'Bench Press', primary: true, sets: 3, logged: { weight: 190, reps: 6 } });
        expect(rows[1]).toMatchObject({ name: 'Cable Fly', primary: false, target: null, logged: null });
    });

    it('targetFor uses only history before the date', () => {
        const t = targetFor({ ex: templates[0].exercises[0], date: '2026-10-12', workouts, program, unit: 'lbs', inc: 5 });
        expect(t).toMatchObject({ weight: 185, action: 'bump' }); // off the 10/05 session only
    });
});
