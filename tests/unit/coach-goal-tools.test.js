// TP-1 — the coach's goal tools: list_goals / set_goal / update_goal /
// add_event through the real executors against the shared Admin-SDK fake.

import { describe, it, expect } from 'vitest';
import { fakeAdminDb } from '../fixtures/admin-db-mock.js';
import { makeToolExecutors, TOOL_DEFINITIONS } from '../../functions/coach-tools.js';

const U = 'users/u1';
const TODAY = '2026-10-25';
const set = (weight, reps) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true });
const wo = (date, name, sets) => ({
    date, completedAt: `${date}T18:00:00Z`, exerciseNames: { exercise_0: name }, exercises: { exercise_0: { sets } },
});

function seed(extra = {}) {
    return {
        [`${U}/preferences/settings`]: { weightUnit: 'lbs', coachGoal: 'strength' },
        [`${U}/workoutTemplates/push`]: { name: 'Push', exercises: [{ machine: 'Bench Press', role: 'primary' }, { machine: 'Shoulder Press', role: 'primary' }, { machine: 'Hack Squat', role: 'primary' }, { machine: 'Cable Fly' }] },
        [`${U}/workouts/w1`]: wo('2026-10-20', 'Bench Press', [set(185, 5)]),
        [`${U}/workouts/w2`]: wo('2026-10-13', 'Bench Press', [set(180, 5)]),
        [`${U}/measurements/m1`]: { date: '2026-10-24', weight: 186.4, unit: 'lbs' },
        [`${U}/measurements/m2`]: { date: '2026-10-23', weight: 186.6, unit: 'lbs' },
        ...extra,
    };
}

const exec = (db) => makeToolExecutors({ db, userId: 'u1', unit: 'lbs', today: TODAY });

describe('goal tool definitions', () => {
    it('are registered with real schemas', () => {
        const names = TOOL_DEFINITIONS.map(t => t.name);
        for (const n of ['list_goals', 'set_goal', 'update_goal', 'add_event']) expect(names).toContain(n);
        const setGoal = TOOL_DEFINITIONS.find(t => t.name === 'set_goal');
        expect(setGoal.input_schema.properties.type.enum).toEqual(['lift', 'bodyweight', 'composition', 'consistency', 'balance']);
    });

    it('remember_fact no longer owns goals (A5)', () => {
        const rf = TOOL_DEFINITIONS.find(t => t.name === 'remember_fact');
        expect(rf.description).toMatch(/Goals and dated events are NOT facts/);
    });
});

describe('set_goal', () => {
    it('measures the baseline from the data and writes the goal', async () => {
        const db = fakeAdminDb(seed());
        const r = await exec(db).set_goal({ type: 'lift', exercise: 'bench press', target: 225, by: '2027-02-14' });
        expect(r.error).toBeUndefined();
        expect(r.result.baseline).toEqual({ value: 215.8, date: TODAY });
        expect(r.result.sentence).toMatch(/^Bench Press: estimated max 215.8 lbs, need 225 lbs by Feb 14/);
        expect(r.actionCard).toMatchObject({ kind: 'goal_set', name: 'Bench Press 225 lbs' });
        const w = db.writes.find(x => x.path.startsWith(`${U}/goals/`));
        expect(w.data).toMatchObject({ type: 'lift', key: { exercise: 'Bench Press' }, target: 225, direction: 'up', status: 'active', source: 'chat' });
    });

    it('rejects a lift that isn\'t a main lift, and names the main lifts', async () => {
        const r = await exec(fakeAdminDb(seed())).set_goal({ type: 'lift', exercise: 'Cable Fly', target: 100 });
        expect(r.error.code).toBe('invalid_input');
        expect(r.error.hint).toMatch(/Bench Press/);
    });

    it('bodyweight direction comes from the measured start', async () => {
        const db = fakeAdminDb(seed());
        const r = await exec(db).set_goal({ type: 'bodyweight', target: 182 });
        expect(r.result.baseline.value).toBe(186.5);
        expect(db.writes.find(x => x.path.startsWith(`${U}/goals/`)).data.direction).toBe('down');
    });

    it('refuses a duplicate active goal and points at update_goal', async () => {
        const db = fakeAdminDb(seed({ [`${U}/goals/g1`]: { type: 'consistency', metric: 'daysPerWeek', key: null, target: 4, status: 'active', unit: 'days/week', direction: 'up' } }));
        const r = await exec(db).set_goal({ type: 'consistency', target: 5 });
        expect(r.error.code).toBe('near_duplicate');
        expect(r.error.hint).toMatch(/update_goal/);
    });

    it('validates the date and the type', async () => {
        const e = exec(fakeAdminDb(seed()));
        expect((await e.set_goal({ type: 'lift', exercise: 'Bench Press', target: 225, by: '2026-01-01' })).error.message).toMatch(/after today/);
        expect((await e.set_goal({ type: 'speed', target: 1 })).error.code).toBe('invalid_input');
    });
});

describe('list_goals / update_goal / add_event', () => {
    const withGoal = () => seed({
        [`${U}/goals/g1`]: { type: 'lift', metric: 'estimatedMax', key: { exercise: 'Bench Press' }, target: 225, unit: 'lbs', direction: 'up', by: '2027-02-14', status: 'active', baseline: { value: 205, date: '2026-09-27' } },
        [`${U}/events/e1`]: { name: 'Beach trip', date: '2027-06-06', kind: 'look', peakWeeks: 2, lighterBefore: true },
    });

    it('list_goals carries the measured status and the sentence', async () => {
        const r = await exec(fakeAdminDb(withGoal())).list_goals();
        expect(r.result.trainingFor).toBe('strength');
        expect(r.result.goals[0]).toMatchObject({ id: 'g1', storedStatus: 'active', now: 215.8 });
        expect(['ahead', 'on-track', 'behind']).toContain(r.result.goals[0].status);
        expect(r.result.goals[0].sentence).toMatch(/^Bench Press: estimated max 215.8 lbs/);
        expect(r.result.events).toEqual([{ id: 'e1', name: 'Beach trip', date: '2027-06-06', kind: 'look', past: false }]);
        expect(r.result.mainLifts).toContain('Bench Press');
    });

    it('update_goal patches only what was passed, and rejects bad values', async () => {
        const db = fakeAdminDb(withGoal());
        const r = await exec(db).update_goal({ goalId: 'g1', status: 'paused' });
        expect(r.result.changed).toEqual(['status']);
        expect(db.writes.find(x => x.path === `${U}/goals/g1`).data).toMatchObject({ status: 'paused' });
        expect((await exec(db).update_goal({ goalId: 'nope', target: 1 })).error.code).toBe('not_found');
        expect((await exec(db).update_goal({ goalId: 'g1', status: 'done' })).error.message).toMatch(/active, met, missed, paused/);
        expect((await exec(db).update_goal({ goalId: 'g1' })).error.message).toMatch(/Nothing to change/);
    });

    it('add_event writes a dated event and refuses the same one twice', async () => {
        const db = fakeAdminDb(withGoal());
        const r = await exec(db).add_event({ name: 'Wedding', date: '2027-05-01', kind: 'look' });
        expect(r.actionCard).toMatchObject({ kind: 'event_added', name: 'Wedding' });
        expect(db.writes.find(x => x.path.startsWith(`${U}/events/event_`)).data).toMatchObject({ name: 'Wedding', date: '2027-05-01', peakWeeks: 2 });
        expect((await exec(db).add_event({ name: 'beach trip', date: '2027-06-06' })).error.code).toBe('near_duplicate');
        expect((await exec(db).add_event({ name: 'x', date: '2020-01-01' })).error.message).toMatch(/after today/);
    });
});
