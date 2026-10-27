// TP-8 — variety inside the plan: an accessory slot carries an alternate and
// the plan switches between them (every 2 weeks by default). Main lifts never
// vary; every surface asks variantForWeek, so they agree.

import { describe, it, expect } from 'vitest';
import {
    variantForWeek, resolveWeekExercises, nextSwitchWeek, fillAlternates,
} from '../../js/core/features/exercise-rotation.js';
import { buildBlockSession } from '../../js/core/features/block-view.js';
import { fakeAdminDb } from '../fixtures/admin-db-mock.js';
import { makeToolExecutors } from '../../functions/coach-tools.js';

const GYM = 'Absolute Recomp';
const pull = [
    { machine: 'Lat Pulldown', role: 'primary', sets: 3 },
    { machine: 'Rope Face Pulls', equipment: 'Basic Trainer Cable', sets: 3, weight: 40, alternates: [{ name: 'Reverse Pec Deck', equipment: 'Peck Back Machine' }] },
];

describe('variantForWeek', () => {
    it('every 2 weeks by default: A, A, B, B, A…', () => {
        const names = [1, 2, 3, 4, 5].map(w => variantForWeek(pull[1], w, undefined, 1).name);
        expect(names).toEqual(['Rope Face Pulls', 'Rope Face Pulls', 'Reverse Pec Deck', 'Reverse Pec Deck', 'Rope Face Pulls']);
    });

    it('weekly alternates every week; "wave" never switches inside the weeks', () => {
        expect([1, 2, 3].map(w => variantForWeek(pull[1], w, 'weekly', 1).name)).toEqual(['Rope Face Pulls', 'Reverse Pec Deck', 'Rope Face Pulls']);
        expect([1, 2, 3].map(w => variantForWeek(pull[1], w, 'wave', 1).variantIndex)).toEqual([0, 0, 0]);
    });

    it('main lifts never vary; no alternates or no week → the row as written', () => {
        const main = { ...pull[0], alternates: [{ name: 'Pull-Up' }] };
        expect(variantForWeek(main, 3, 'weekly', 0).name).toBe('Lat Pulldown');
        expect(variantForWeek({ machine: 'Cable Fly' }, 3).name).toBe('Cable Fly');
        expect(variantForWeek(pull[1], null, 'weekly', 1).name).toBe('Rope Face Pulls');
    });

    it('resolveWeekExercises: the alternate takes the slot with its own machine and no carried weight', () => {
        const wk3 = resolveWeekExercises(pull, 3);
        expect(wk3[0]).toBe(pull[0]);
        expect(wk3[1]).toMatchObject({ machine: 'Reverse Pec Deck', equipment: 'Peck Back Machine', variantOf: 'Rope Face Pulls', sets: 3 });
        expect(wk3[1].weight).toBeUndefined();
        expect(wk3[1].alternates).toBeUndefined();
        expect(pull[1].machine).toBe('Rope Face Pulls'); // the template isn't touched
    });

    it('nextSwitchWeek names the next version and its week', () => {
        expect(nextSwitchWeek(pull[1], 1, 'biweekly', 1)).toEqual({ week: 3, name: 'Reverse Pec Deck' });
        expect(nextSwitchWeek(pull[0], 1, 'biweekly', 0)).toBeNull();
    });
});

describe('fillAlternates', () => {
    const eq = (name, exerciseTypes, lastUsed = null) => ({ name, exerciseTypes, lastUsed, locations: [GYM] });
    const floor = [
        eq('Basic Trainer Cable', ['Rope Face Pulls'], '2026-10-20'),
        eq('Peck Back Machine', ['Reverse Pec Deck'], '2026-07-01'),
        eq('Rear Delt Cable', ['Cable Rear Delt Fly'], null),
    ];

    it('gives an accessory slot a same-movement alternate on another machine; main lifts untouched', () => {
        const rows = [{ machine: 'Lat Pulldown', role: 'primary' }, { machine: 'Rope Face Pulls', equipment: 'Basic Trainer Cable' }];
        const { exercises, filled } = fillAlternates(rows, { equipment: floor, location: GYM, today: '2026-10-26' });
        expect(exercises[0]).toBe(rows[0]);
        expect(filled).toEqual([{ index: 1, name: 'Rope Face Pulls', alternate: { name: 'Cable Rear Delt Fly', equipment: 'Rear Delt Cable' } }]);
        expect(exercises[1].alternates).toEqual([{ name: 'Cable Rear Delt Fly', equipment: 'Rear Delt Cable' }]);
    });

    it('never pairs a slot with what it just moved off, and leaves existing alternates alone', () => {
        const rows = [{ machine: 'Rope Face Pulls', equipment: 'Basic Trainer Cable', rotatedFrom: 'Cable Rear Delt Fly', rotatedAt: '2026-10-01' }];
        const { filled } = fillAlternates(rows, { equipment: floor, location: GYM, today: '2026-10-26' });
        expect(filled[0].alternate.name).toBe('Reverse Pec Deck');
        expect(fillAlternates(pull, { equipment: floor, location: GYM }).filled).toEqual([]);
    });
});

describe('the Plan page session sheet shows the week\'s version', () => {
    it('week 3 lists the alternate and says what it stands in for; week 1 says when it switches', () => {
        const template = { id: 'pull', name: 'Pull', exercises: pull };
        const wk1 = buildBlockSession({ cell: { date: '2026-10-26' }, template, week: 1 });
        expect(wk1.map(r => r.name)).toEqual(['Lat Pulldown', 'Rope Face Pulls']);
        expect(wk1[1].next).toEqual({ week: 3, name: 'Reverse Pec Deck' });
        const wk3 = buildBlockSession({ cell: { date: '2026-11-09' }, template, week: 3 });
        expect(wk3[1]).toMatchObject({ name: 'Reverse Pec Deck', variantOf: 'Rope Face Pulls' });
    });
});

describe('the coach sets up and reads alternation', () => {
    const U = 'users/u1';
    const seed = () => fakeAdminDb({
        [`${U}/workoutTemplates/pull`]: { name: 'Pull day', exercises: [{ machine: 'Lat Pulldown', role: 'primary' }, { machine: 'Rope Face Pulls', equipment: 'Basic Trainer Cable' }] },
        [`${U}/equipment/e1`]: { name: 'Basic Trainer Cable', exerciseTypes: ['Rope Face Pulls'], lastUsed: '2026-10-20', locations: [GYM] },
        [`${U}/equipment/e2`]: { name: 'Rear Delt Cable', exerciseTypes: ['Cable Rear Delt Fly'], lastUsed: null, locations: [GYM] },
        [`${U}/workouts/w1`]: { date: '2026-10-20', completedAt: '2026-10-20T18:00:00Z', location: GYM, exercises: {} },
    });
    const ex = (db) => makeToolExecutors({ db, userId: 'u1', unit: 'lbs', today: '2026-10-26' });

    it('create_program alternateAccessories: pairs written, the main lift alone; get_plan says this week and the switch date', async () => {
        const db = seed();
        const out = await ex(db).create_program({
            name: 'Next weeks', goal: 'strength', weeks: 3, startDate: '2026-10-26', split: { mon: 'pull' },
            alternateAccessories: true, rationale: { block: 'Three build weeks' },
        });
        expect(out.error).toBeUndefined();
        expect(out.result.alternates).toEqual([{ workout: 'Pull day', exercise: 'Rope Face Pulls', alternate: 'Cable Rear Delt Fly', equipment: 'Rear Delt Cable' }]);
        const t = db._docs.get(`${U}/workoutTemplates/pull`);
        expect(t.exercises[0].alternates).toBeUndefined();
        expect(t.exercises[1].alternates).toEqual([{ name: 'Cable Rear Delt Fly', equipment: 'Rear Delt Cable' }]);

        const plan = await makeToolExecutors({ db, userId: 'u1', unit: 'lbs', today: '2026-10-27' }).get_plan();
        expect(plan.result.variety.cadence).toBe('biweekly');
        expect(plan.result.variety.slots).toEqual([{
            workout: 'Pull day', slot: 'Rope Face Pulls', alternates: ['Cable Rear Delt Fly'],
            thisWeek: 'Rope Face Pulls', switchesTo: 'Cable Rear Delt Fly', from: '2026-11-09',
        }]);
    });

    it('update_plan takes varietyCadence and refuses anything else', async () => {
        const db = seed();
        expect((await ex(db).update_plan({ varietyCadence: 'weekly' })).error).toBeUndefined();
        expect(db._docs.get(`${U}/plan/current`).varietyCadence).toBe('weekly');
        expect((await ex(db).update_plan({ varietyCadence: 'daily' })).error.code).toBe('invalid_input');
    });
});
