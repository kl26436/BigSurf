// TP-4 — plan-owned sessions: the Workouts list keeps the user's own
// workouts, the plan group shows this week's sessions, "save to my workouts"
// copies one, and the roll archives sessions no week uses any more.

import { describe, it, expect } from 'vitest';
import {
    splitTemplatesForList, planWeekSessions, cloneForMyWorkouts, planTemplatesToArchive, formatPlanSessionsContext, isPlanOwned,
} from '../../js/core/features/plan-sessions.js';
import { buildTrainingContext } from '../../js/core/features/coach-context-builder.js';
import { fakeAdminDb } from '../fixtures/admin-db-mock.js';
import { makeToolExecutors } from '../../functions/coach-tools.js';
import planRoll from '../../functions/plan-roll.js';

const mine = { id: 'push', name: 'Push', exercises: [{ machine: 'Bench Press', sets: 3, defaultReps: 8 }] };
const planA = { id: 'push_a', name: 'Push A', planOwned: true, planId: 'current', kind: 'core', exercises: [{ machine: 'Incline Press', sets: 4, defaultReps: 8 }, { machine: 'Cable Fly', sets: 3 }], usageCount: 4 };
const planB = { id: 'legs_a', name: 'Legs A', planOwned: true, planId: 'current', exercises: [{ machine: 'Hack Squat', sets: 4 }] };
const old = { id: 'pull_old', name: 'Pull (old)', planOwned: true, planId: 'current', exercises: [{ machine: 'Row', sets: 3 }] };
const gone = { id: 'arch', name: 'Archived', archived: true };
const templates = [mine, planA, planB, old, gone];
const weekPlan = { days: { mon: 'push_a', wed: 'push', fri: 'legs_a' } };
const TODAY = '2026-10-28'; // Wed

describe('the Workouts list and the plan group', () => {
    it('plan-owned sessions leave the main list; archived ones stay apart', () => {
        const r = splitTemplatesForList(templates);
        expect(r.mine.map(t => t.id)).toEqual(['push']);
        expect(r.plan.map(t => t.id)).toEqual(['push_a', 'legs_a', 'pull_old']);
        expect(r.archived.map(t => t.id)).toEqual(['arch']);
        expect(isPlanOwned(planA)).toBe(true);
        expect(isPlanOwned(mine)).toBe(false);
    });

    it("this week's sessions from the week plan, in day order, with today and done", () => {
        const workouts = [{ date: '2026-10-26', completedAt: 'x', workoutType: 'Push A' }];
        const s = planWeekSessions({ weekPlan, templates, workouts, today: TODAY });
        expect(s.map(x => [x.dayLabel, x.template.id, x.date, x.isToday, x.done])).toEqual([
            ['Mon', 'push_a', '2026-10-26', false, true],
            ['Wed', 'push', '2026-10-28', true, false],
            ['Fri', 'legs_a', '2026-10-30', false, false],
        ]);
    });
});

describe('save to my workouts', () => {
    it('a copy in the user\'s list: core, not plan-owned, remembers where it came from; the original untouched', () => {
        const before = JSON.stringify(planA);
        const c = cloneForMyWorkouts(planA, { date: TODAY, stamp: 1700000000000 });
        expect(c).toMatchObject({
            name: 'Push A (saved)', kind: 'core', planOwned: false, createdVia: 'save-from-plan',
            savedFromPlan: { templateId: 'push_a', planId: 'current', date: TODAY },
        });
        expect(c.id).toMatch(/^push_a__saved__/);
        expect(c).not.toHaveProperty('planId');
        expect(c).not.toHaveProperty('usageCount');
        expect(c.exercises).toEqual(planA.exercises);
        expect(c.exercises[0]).not.toBe(planA.exercises[0]); // a copy — a later plan swap can't reach it
        expect(JSON.stringify(planA)).toBe(before);
        expect(cloneForMyWorkouts(planA, { name: '  My push  ', date: TODAY }).name).toBe('My push');
        expect(splitTemplatesForList([...templates, c]).mine.map(t => t.name)).toEqual(['Push', 'Push A (saved)']);
    });
});

describe('archiving sessions no week uses', () => {
    it('only plan-owned, only when no week plan day and no running wave uses them', () => {
        const programs = [
            { id: 'p1', startDate: '2026-09-28', weeks: 4, split: { tue: 'pull_old' } },      // ended
            { id: 'p2', startDate: '2026-10-26', weeks: 4, split: { mon: 'push_a', fri: 'legs_a' } },
        ];
        expect(planTemplatesToArchive({ templates, weekPlan, programs, today: TODAY })).toEqual(['pull_old']);
        const stillRunning = [{ id: 'p1', startDate: '2026-10-12', weeks: 4, split: { tue: 'pull_old' } }];
        expect(planTemplatesToArchive({ templates, weekPlan, programs: stillRunning, today: TODAY })).toEqual([]);
        expect(planTemplatesToArchive({ templates: [mine], weekPlan: { days: {} }, programs: [], today: TODAY })).toEqual([]);
    });
});

describe('the coach sees plan sessions through the plan', () => {
    it('a Plan sessions line; the saved-workouts block lists only the user\'s own', () => {
        expect(formatPlanSessionsContext({ templates, weekPlan, today: TODAY })).toBe(
            'Plan sessions (built for the plan; the user\'s own list stays separate — "save to my workouts" copies one there): Push A, Legs A, Pull (old) (not on this week)\n',
        );
        const workouts = [{ date: '2026-10-26', completedAt: '2026-10-26T18:00:00Z', workoutType: 'Push A', exerciseNames: { exercise_0: 'Incline Press' }, exercises: { exercise_0: { sets: [{ weight: 135, reps: 8, originalUnit: 'lbs', completed: true }] } } }];
        const ctx = buildTrainingContext({ workouts, templates, weekPlan, today: TODAY });
        const saved = ctx.split('User\'s saved workouts')[1] || '';
        expect(saved).toContain('Push');
        expect(saved.split('Plan sessions')[0]).not.toContain('Push A');
        expect(ctx).toContain('Plan sessions (built for the plan');
    });
});

describe('server: forPlan, list_templates, the roll archives', () => {
    const U = 'users/u1';
    const ex = (db) => makeToolExecutors({ db, userId: 'u1', unit: 'lbs', today: TODAY });

    it('create_workout_template forPlan → plan-owned, only when a plan exists', async () => {
        const withPlan = fakeAdminDb({ [`${U}/plan/current`]: { name: 'My plan' } });
        const r = await ex(withPlan).create_workout_template({ name: 'Pull A', exercises: [{ name: 'Lat Pulldown', sets: 3, reps: 10 }], forPlan: true });
        expect(r.result).toMatchObject({ templateId: 'pull_a', planOwned: true });
        expect(withPlan.writes.find(w => w.path === `${U}/workoutTemplates/pull_a`).data).toMatchObject({ planOwned: true, planId: 'current' });
        const noPlan = fakeAdminDb({});
        const r2 = await ex(noPlan).create_workout_template({ name: 'Pull A', exercises: [{ name: 'Lat Pulldown', sets: 3, reps: 10 }], forPlan: true });
        expect(r2.result.note).toMatch(/own list/);
        expect(noPlan.writes.find(w => w.path === `${U}/workoutTemplates/pull_a`).data.planOwned).toBeUndefined();
    });

    it('list_templates says which are plan-owned', async () => {
        const db = fakeAdminDb({ [`${U}/workoutTemplates/push`]: mine, [`${U}/workoutTemplates/push_a`]: planA });
        const r = await ex(db).list_templates();
        const byId = Object.fromEntries(r.templates.map(t => [t.templateId, t.planOwned]));
        expect(byId).toEqual({ push: false, push_a: true });
    });

    it('the Sunday roll archives plan sessions the new weeks don\'t use', async () => {
        const db = fakeAdminDb({
            [`${U}/preferences/settings`]: {},
            [`${U}/preferences/weekPlan`]: { days: { mon: 'push_a', fri: 'legs_a' } },
            [`${U}/plan/current`]: { cadence: { buildWeeks: 3, lighterWeek: true } },
            [`${U}/programs/p1`]: { id: 'p1', startDate: '2026-09-28', weeks: 4, active: true, split: { mon: 'push_a', tue: 'pull_old', fri: 'legs_a' }, weekTargets: [{ week: 4, label: 'Lighter week', weightPct: -35 }] },
            [`${U}/workoutTemplates/push_a`]: planA, [`${U}/workoutTemplates/legs_a`]: planB, [`${U}/workoutTemplates/pull_old`]: old, [`${U}/workoutTemplates/push`]: mine,
        });
        const r = await planRoll.rollPlanForUser(db.collection('users').doc('u1'), { now: new Date('2026-10-26T00:30:00Z') });
        expect(r).toMatchObject({ status: 'rolled', archived: ['pull_old'] });
        expect(db.writes.find(w => w.path === `${U}/workoutTemplates/pull_old`).data).toMatchObject({ archived: true, archivedBy: 'plan-roll' });
        expect(db.writes.some(w => w.path === `${U}/workoutTemplates/push`)).toBe(false); // the user's own: never
    });
});
