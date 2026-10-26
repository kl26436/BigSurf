// TP-3 — the plan timeline (one continuous plan) and the roller (the plan
// continues unless you stop it). Pure modules, imported real; the server roll
// and the plan tools run against the Admin-SDK fake.

import { describe, it, expect } from 'vitest';
import {
    buildPlanTimeline, projectKinds, cadenceKind, describeCadence, formatPlanContext, programRuns, mondayOf,
} from '../../js/core/features/plan-timeline.js';
import {
    rollWindow, draftNextWave, rollUndoable, cadenceFromProgram, rolledProgramDoc, defaultTarget,
} from '../../js/core/features/plan-roller.js';
import { normalizeWeekTarget, isDeloadTarget } from '../../js/core/features/week-targets.js';
import { findJargon } from '../../js/core/features/plain-language.js';
import { fakeAdminDb } from '../fixtures/admin-db-mock.js';
import planRoll from '../../functions/plan-roll.js';
import { makeToolExecutors } from '../../functions/coach-tools.js';

const set = (weight, reps) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true });
const wo = (date, type, name, w) => ({
    id: `w_${date}`, date, completedAt: `${date}T18:00:00Z`, workoutType: type,
    exerciseNames: { exercise_0: name }, exercises: { exercise_0: { sets: [set(w, 6)] } },
});
const push = { id: 'push', name: 'Push', exercises: [{ machine: 'Bench Press', role: 'primary', defaultReps: 6 }, { machine: 'Cable Fly' }] };
const legs = { id: 'legs', name: 'Legs', exercises: [{ machine: 'Hack Squat', role: 'primary', defaultReps: 8 }, { machine: 'Seated Leg Curl' }] };
const templates = [push, legs];
const weekPlan = { days: { mon: 'push', thu: 'legs' }, restDays: [] };
const wave1 = {
    id: 'p1', name: 'Strength', goal: 'strength', startDate: '2026-09-28', weeks: 4, active: true, state: 'active',
    split: { mon: 'push', thu: 'legs' }, trustLevel: 'propose',
    weekTargets: [{ week: 1, label: 'Build' }, { week: 2, label: 'Build', setDelta: 1 }, { week: 3, label: 'Push', rpeTarget: 8.5 }, { week: 4, label: 'Lighter week', weightPct: -35, setDelta: -1 }],
};
const history = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'].flatMap((m, k) => [
    wo(m, 'Push', 'Bench Press', 185 + 5 * k),
    wo(addDays(m, 3), 'Legs', 'Hack Squat', 250 + 10 * k),
]);
function addDays(d, n) { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
const PLAN = { name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true }, horizonWeeks: 12, rotationPolicy: 'ask' };

describe('cadence and projection', () => {
    it('build… (last one push), then lighter, repeating', () => {
        const c = { buildWeeks: 3, lighterWeek: true };
        expect([0, 1, 2, 3, 4].map(i => cadenceKind(i, c))).toEqual(['build', 'build', 'push', 'lighter', 'build']);
        expect([0, 1].map(i => cadenceKind(i, { buildWeeks: 1, lighterWeek: true }))).toEqual(['build', 'lighter']);
        expect(describeCadence(c)).toBe('three build weeks then a lighter one');
    });

    it('an event: peak weeks up to it, a lighter week before them, the pattern restarts after', () => {
        const kinds = projectKinds('2026-11-02', 10, { buildWeeks: 3, lighterWeek: true }, [{ name: 'Trip', date: '2026-12-19', peakWeeks: 2 }]);
        expect(kinds.map(k => `${k.weekStart.slice(5)} ${k.kind}`)).toEqual([
            '11-02 build', '11-09 build', '11-16 push', '11-23 lighter', '11-30 peak', '12-07 peak', '12-14 peak', '12-21 build', '12-28 build', '01-04 push',
        ]);
        const noLighter = projectKinds('2026-11-02', 5, { buildWeeks: 3, lighterWeek: true }, [{ name: 'Trip', date: '2026-12-19', peakWeeks: 2, lighterBefore: false }]);
        expect(noLighter[3].event).toBeNull(); // the cadence's own lighter week, not the event's
    });

    it('programRuns cuts a wave where the next one started', () => {
        const runs = programRuns([wave1, { ...wave1, id: 'p2', startDate: '2026-10-19', weeks: 4 }]);
        expect(runs.map(r => [r.program.id, r.start, r.end])).toEqual([['p1', '2026-09-28', '2026-10-18'], ['p2', '2026-10-19', '2026-11-15']]);
    });
});

describe('buildPlanTimeline', () => {
    const tl = (over = {}) => buildPlanTimeline({ plan: PLAN, weekPlan, programs: [wave1], templates, workouts: history, today: '2026-10-08', ...over });

    it('past / current / planned weeks from the wave, projected weeks after it to the horizon', () => {
        const t = tl();
        const wave = t.weeks.filter(w => w.programId === 'p1');
        expect(wave.map(w => w.state)).toEqual(['past', 'current', 'planned', 'planned']);
        expect(wave.map(w => w.kind)).toEqual(['build', 'build', 'push', 'lighter']);
        const projected = t.weeks.filter(w => w.projected);
        expect(projected[0].weekStart).toBe('2026-10-26');
        expect(projected.slice(0, 4).map(w => w.kind)).toEqual(['build', 'build', 'push', 'lighter']);
        expect(t.weeks[t.weeks.length - 1].weekEnd <= t.horizonEnd).toBe(true);
    });

    it('planned cells carry targets; projected cells carry none', () => {
        const t = tl();
        const planned = t.weeks.find(w => w.state === 'planned');
        expect(planned.days[0].primary.target).toMatchObject({ weight: expect.any(Number) });
        const projected = t.weeks.find(w => w.projected);
        expect(projected.days.map(d => [d.dayLabel, d.name, d.status, d.primary])).toEqual([['Mon', 'Push', 'projected', null], ['Thu', 'Legs', 'projected', null]]);
    });

    it('header: this week by kind and run ("Build week 2"), the next lighter week, never "week 2 of 4"', () => {
        const h = tl().header;
        expect(h.thisWeek).toBe('Build week 2');
        expect(h.nextLighter).toBe('2026-10-19');
        expect(h.cadenceText).toBe('three build weeks then a lighter one');
        expect(JSON.stringify(h)).not.toMatch(/of 4/);
    });

    it('goal and event markers land on their weeks', () => {
        const goals = [{ id: 'g1', type: 'consistency', metric: 'daysPerWeek', unit: 'days/week', direction: 'up', target: 2, by: '2026-11-20', status: 'active', baseline: { value: 1, date: '2026-09-01' } }];
        const events = [{ id: 'e1', name: 'Trip', date: '2026-12-19', peakWeeks: 2 }];
        const t = tl({ goals, events });
        expect(t.weeks.find(w => w.weekStart === '2026-11-16').markers[0]).toMatchObject({ type: 'goal', label: '2 days a week by Nov 20' });
        expect(t.weeks.find(w => w.weekStart === '2026-12-14').markers[0]).toEqual({ type: 'event', label: 'Trip · Dec 19' });
        expect(t.weeks.find(w => w.weekStart === '2026-11-23').kind).toBe('lighter');
        expect(t.weeks.find(w => w.weekStart === '2026-11-30').kind).toBe('peak');
        expect(t.goalsStrip).toEqual([{ id: 'g1', name: '2 days a week', status: 'behind', statusLabel: 'Behind' }]); // 4 days in the 4 weeks to Oct 8
    });

    it('no program: every week projected from the split, this week current with what was done', () => {
        const t = buildPlanTimeline({ plan: PLAN, weekPlan, programs: [], templates, workouts: history, today: '2026-10-21' });
        expect(t.weeks[0]).toMatchObject({ weekStart: '2026-10-19', state: 'current', projected: true });
        expect(t.weeks[0].days.map(d => d.status)).toEqual(['done', 'projected']); // Thu is still ahead on Wed
        expect(t.weeks).toHaveLength(12);
    });

    it('a paused plan stops projecting', () => {
        const t = buildPlanTimeline({ plan: { ...PLAN, paused: true }, weekPlan, programs: [wave1], templates, workouts: history, today: '2026-10-08' });
        expect(t.weeks.some(w => w.projected)).toBe(false);
        expect(t.header.paused).toBe(true);
    });

    it('the coach line: the split, the cadence, this week, the next lighter week — no jargon', () => {
        const t = tl();
        const line = formatPlanContext({ plan: PLAN, weekPlan, templates, timeline: t, goalsRows: [{ status: 'behind' }], events: [{ name: 'Trip', date: '2026-12-19' }], today: '2026-10-08' });
        expect(line).toBe('Your plan: 2 days (Mon Push · Thu Legs) · three build weeks then a lighter one · through Dec · this week: Build week 2 · lighter week starts Oct 19 · 1 goal (1 behind) · 1 event\n');
        expect(findJargon(line)).toEqual([]);
        expect(formatPlanContext({ today: '2026-10-08' })).toBe('');
        expect(mondayOf('2026-10-08')).toBe('2026-10-05');
    });
});

describe('rollWindow — when the next wave is due', () => {
    it('due the Sunday the wave ends; not before; covered mid-wave; idempotent after', () => {
        expect(rollWindow({ plan: PLAN, programs: [wave1], today: '2026-10-25' })).toMatchObject({ due: true, start: '2026-10-26' });
        expect(rollWindow({ plan: PLAN, programs: [wave1], today: '2026-10-18' }).reason).toBe('not_yet'); // next Sunday's job
        const rolled = { ...wave1, id: 'p2', startDate: '2026-10-26' };
        expect(rollWindow({ plan: PLAN, programs: [wave1, rolled], today: '2026-10-25' }).due).toBe(false); // the rolled wave covers next week
        expect(rollWindow({ plan: { ...PLAN, paused: true }, programs: [wave1], today: '2026-10-25' }).reason).toBe('paused');
        expect(rollWindow({ plan: null, programs: [wave1], today: '2026-10-25' }).reason).toBe('no_plan');
    });

    it('a wave that ended weeks ago restarts next Monday; one that ends mid-week chains', () => {
        expect(rollWindow({ plan: PLAN, programs: [wave1], today: '2026-11-11' })).toMatchObject({ due: true, start: '2026-11-16' });
        const midweek = { ...wave1, startDate: '2026-10-01' }; // ends Wed 10-28
        expect(rollWindow({ plan: PLAN, programs: [midweek], today: '2026-10-25' })).toMatchObject({ due: false, reason: 'not_yet', start: '2026-10-29' });
        expect(rollWindow({ plan: PLAN, programs: [midweek], today: '2026-10-27' })).toMatchObject({ due: true, start: '2026-10-29' });
    });
});

describe('draftNextWave — code composes, the model never does', () => {
    const base = { plan: PLAN, weekPlan, programs: [wave1], templates, workouts: history, today: '2026-10-25', start: '2026-10-26' };

    it('same sessions, kinds from the cadence, valid shaped targets with a lighter week', () => {
        const d = draftNextWave(base);
        expect(d).toMatchObject({ weeks: 4, startDate: '2026-10-26', endDate: '2026-11-22', kinds: ['build', 'build', 'push', 'lighter'], trustLevel: 'propose', rolledFrom: 'p1' });
        expect(d.split).toEqual({ mon: 'push', tue: null, wed: null, thu: 'legs', fri: null, sat: null, sun: null });
        for (const t of d.weekTargets) expect(normalizeWeekTarget(t, 4).ok).toBe(true);
        expect(isDeloadTarget(d.weekTargets[3])).toBe(true);
        // A previous wave of the same shape keeps its levers.
        expect(d.weekTargets).toEqual(wave1.weekTargets);
    });

    it('a different shape falls back to the defaults', () => {
        const d = draftNextWave({ ...base, plan: { ...PLAN, cadence: { buildWeeks: 2, lighterWeek: true } } });
        expect(d.kinds).toEqual(['build', 'push', 'lighter']);
        expect(d.weekTargets).toEqual([defaultTarget('build', 1, 1), defaultTarget('push', 2), defaultTarget('lighter', 3)]);
    });

    it('rotations: accessories only, from the engine; none inside a peak window', () => {
        const lookup = (n) => ({ 'seated leg curl': { name: 'Seated Leg Curl', pattern: 'knee-flexion' }, 'lying leg curl': { name: 'Lying Leg Curl', pattern: 'knee-flexion' }, 'hack squat': { name: 'Hack Squat', pattern: 'knee-dominant' }, 'leg press': { name: 'Leg Press', pattern: 'knee-dominant' } })[String(n).toLowerCase()];
        const equipment = [
            { name: 'Prone Curl Machine', exerciseTypes: ['Lying Leg Curl'], locations: ['Gym'], lastUsed: null },
            { name: 'Leg Press Sled', exerciseTypes: ['Leg Press'], locations: ['Gym'], lastUsed: null },
        ];
        const d = draftNextWave({ ...base, rotation: { equipment, location: 'Gym', lookup } });
        expect(d.rotations).toEqual([{ templateId: 'legs', name: 'Legs', swaps: [expect.objectContaining({ index: 1, from: 'Seated Leg Curl', to: 'Lying Leg Curl', equipment: 'Prone Curl Machine' })] }]);
        expect(d.applyRotations).toBe(false); // 'ask'
        expect(d.rationale.changed).toEqual([]);
        const auto = draftNextWave({ ...base, plan: { ...PLAN, rotationPolicy: 'auto' }, rotation: { equipment, location: 'Gym', lookup } });
        expect(auto.applyRotations).toBe(true);
        expect(auto.rationale.changed[0]).toMatchObject({ from: 'Seated Leg Curl', to: 'Lying Leg Curl' });
        const peak = draftNextWave({ ...base, events: [{ name: 'Meet', date: '2026-11-21', peakWeeks: 2 }], rotation: { equipment, location: 'Gym', lookup } });
        expect(peak.kinds).toContain('peak');
        expect(peak.rotations).toEqual([]);
    });

    it('the rationale is built in code, in plain words', () => {
        const goals = [{ id: 'g', type: 'consistency', metric: 'daysPerWeek', unit: 'days/week', direction: 'up', target: 2, status: 'active', baseline: { value: 1, date: '2026-09-01' } }];
        const d = draftNextWave({ ...base, goals });
        expect(d.rationale.block).toBe('Three build weeks then a lighter one, Oct 26 to Nov 22. Same sessions as before.');
        expect(d.rationale.fixed).toEqual([
            { name: 'Bench Press', why: 'so your strength numbers stay comparable' },
            { name: 'Hack Squat', why: 'so your strength numbers stay comparable' },
        ]);
        expect(d.rationale.watch[0]).toMatch(/days a week/);
        const r = d.rationale;
        expect(findJargon([r.block, ...r.weeks.map(x => x.why), ...r.fixed.map(x => x.why), ...r.watch].join(' / '))).toEqual([]);
    });

    it('no split → nothing to continue', () => {
        expect(draftNextWave({ ...base, weekPlan: { days: {} }, programs: [] })).toBeNull();
    });
});

describe('undo and the rolled doc', () => {
    it('undo is clean until a workout is dated inside the wave', () => {
        const rolled = { startDate: '2026-10-26', weeks: 4 };
        expect(rollUndoable(rolled, history)).toBe(true);
        expect(rollUndoable(rolled, [...history, wo('2026-10-27', 'Push', 'Bench Press', 200)])).toBe(false);
    });

    it('cadence from a program; the rolled doc records what it did', () => {
        expect(cadenceFromProgram(wave1)).toEqual({ buildWeeks: 3, lighterWeek: true });
        expect(cadenceFromProgram({ weeks: 3, weekTargets: [] })).toEqual({ buildWeeks: 3, lighterWeek: false });
        const draft = draftNextWave({ plan: PLAN, weekPlan, programs: [wave1], templates, workouts: history, today: '2026-10-25', start: '2026-10-26' });
        const doc = rolledProgramDoc({ ...draft, rotations: [{ templateId: 'legs', swaps: [{ from: 'A', to: 'B' }] }] }, { id: 'p2', nowIso: '2026-10-26T00:30:00Z' });
        expect(doc).toMatchObject({ id: 'p2', createdVia: 'auto-roll', rolledBy: 'auto', rolledFrom: 'p1', active: true, rotationsApplied: [], pendingRotations: [{ templateId: 'legs' }] });
    });
});

describe('the Sunday roll (server) and the plan tools', () => {
    const U = 'users/u1';
    const seed = (over = {}) => {
        const docs = {
            [`${U}/preferences/settings`]: { weightUnit: 'lbs' },
            [`${U}/preferences/weekPlan`]: weekPlan,
            [`${U}/plan/current`]: PLAN,
            [`${U}/programs/p1`]: wave1,
            [`${U}/workoutTemplates/push`]: push,
            [`${U}/workoutTemplates/legs`]: legs,
            ...over,
        };
        history.forEach((w) => { docs[`${U}/workouts/${w.id}`] = w; });
        return docs;
    };
    const SUNDAY = new Date('2026-10-26T00:30:00Z'); // Sun 19:30 Chicago

    it('rolls once: the new wave written, the old one finished; a retry does nothing', async () => {
        const db = fakeAdminDb(seed());
        const ref = db.collection('users').doc('u1');
        const r = await planRoll.rollPlanForUser(ref, { now: SUNDAY });
        expect(r).toMatchObject({ status: 'rolled', start: '2026-10-26' });
        const created = db.writes.find(w => w.path === `${U}/programs/${r.programId}`);
        expect(created.data).toMatchObject({ startDate: '2026-10-26', weeks: 4, createdVia: 'auto-roll', active: true, rolledFrom: 'p1' });
        expect(db.writes.find(w => w.path === `${U}/programs/p1`).data).toMatchObject({ active: false, state: 'finished' });
        expect((await planRoll.rollPlanForUser(ref, { now: SUNDAY })).status).not.toBe('rolled');
    });

    it('no plan doc → no roll (the cadence is the consent)', async () => {
        const docs = seed();
        delete docs[`${U}/plan/current`];
        expect(await planRoll.rollPlanForUser(fakeAdminDb(docs).collection('users').doc('u1'), { now: SUNDAY })).toEqual({ status: 'no_plan' });
    });

    it('get_plan / update_plan / draft_next_wave', async () => {
        const db = fakeAdminDb(seed());
        const ex = makeToolExecutors({ db, userId: 'u1', unit: 'lbs', today: '2026-10-21' });
        const g = await ex.get_plan();
        expect(g.result).toMatchObject({ exists: true, cadenceText: 'three build weeks then a lighter one', thisWeek: 'Lighter week', rotationPolicy: 'ask' });
        expect((await ex.update_plan({ cadence: { buildWeeks: 9 } })).error.code).toBe('invalid_input');
        expect((await ex.update_plan({})).error.message).toMatch(/Nothing to change/);
        const u = await ex.update_plan({ rotationPolicy: 'auto', cadence: { buildWeeks: 4 } });
        expect(u.actionCard).toMatchObject({ kind: 'plan_set' });
        expect(db.writes.filter(w => w.path === `${U}/plan/current`).at(-1).data).toMatchObject({ rotationPolicy: 'auto', cadence: { buildWeeks: 4, lighterWeek: true } });
        const d = await ex.draft_next_wave({});
        expect(d.result.draft).toMatchObject({ startDate: '2026-10-26', weeks: 5 });
        expect(d.result.note).toMatch(/create_program/);
    });

    it('create_program creates the plan doc from the program\'s shape', async () => {
        const docs = seed();
        delete docs[`${U}/plan/current`];
        const db = fakeAdminDb(docs);
        const ex = makeToolExecutors({ db, userId: 'u1', unit: 'lbs', today: '2026-10-21' });
        const r = await ex.create_program({
            name: 'Next', goal: 'strength', weeks: 4, startDate: '2026-10-26', split: { mon: 'push', thu: 'legs' },
            weekTargets: wave1.weekTargets, rationale: { block: 'Three build weeks then a lighter one' },
        });
        expect(r.error).toBeUndefined();
        expect(db.writes.find(w => w.path === `${U}/plan/current`).data).toMatchObject({ cadence: { buildWeeks: 3, lighterWeek: true }, rotationPolicy: 'ask', paused: false });
    });
});
