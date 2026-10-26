// TP-6 f–l — the plan says only what's true: swaps a planning conversation
// agreed to are written with the plan, the engine never rotates a slot
// straight back, "this week" restarts with a new wave, "a lighter week now"
// means this week, and the result tells the model applied vs not.

import { describe, it, expect } from 'vitest';
import {
    selectRotation, rankRotationCandidates, rotatedOutOf, rotationHistory, resolveSwaps, waitingSwaps, applyRotation,
} from '../../js/core/features/exercise-rotation.js';
import { buildPlanTimeline } from '../../js/core/features/plan-timeline.js';
import { checkDeloadNeeded } from '../../js/core/features/training-rules.js';
import { formatVerdictsContext } from '../../js/core/features/coach-rules.js';
import { fakeAdminDb } from '../fixtures/admin-db-mock.js';
import { makeToolExecutors } from '../../functions/coach-tools.js';

const GYM = 'Absolute Recomp';
const eq = (name, exerciseTypes, lastUsed = null) => ({ name, exerciseTypes, lastUsed, locations: [GYM] });
const floor = [
    eq('Basic Trainer Cable', ['Rope Face Pulls'], '2026-10-20'),
    eq('Peck Back Machine', ['Reverse Pec Deck'], '2026-07-01'),
    eq('Rear Delt Cable', ['Cable Rear Delt Fly'], null),
    eq('Seated Leg Curl', ['Seated Leg Curl Machine'], '2026-10-20'),
    eq('Standing Leg Curl', ['Standing Leg Curl Machine'], null),
];
const pull = [
    { machine: 'Lat Pulldown', role: 'primary', sets: 3 },
    { machine: 'Seated Row Machine', role: 'primary', sets: 3 },
    { machine: 'Rope Face Pulls', equipment: 'Basic Trainer Cable', sets: 3, rotatedFrom: 'Reverse Pec Deck', rotatedAt: '2026-09-15' },
];

describe('the engine never rotates a slot straight back (l)', () => {
    it('rotatedFrom and the swap history name what the slot moved off', () => {
        expect(rotatedOutOf(pull[2], { today: '2026-10-26' }).map(x => x.name)).toEqual(['Reverse Pec Deck']);
        // outside the memory window it's fair game again
        expect(rotatedOutOf(pull[2], { today: '2027-03-01' })).toEqual([]);
        const history = rotationHistory([{ startDate: '2026-08-10', rotationsApplied: [{ templateId: 'pull', swaps: [{ from: 'Cable Rear Delt Fly', to: 'Reverse Pec Deck' }] }] }]);
        expect(rotatedOutOf(pull[2], { history, today: '2026-10-26' }).map(x => x.name).sort()).toEqual(['Cable Rear Delt Fly', 'Reverse Pec Deck']);
    });

    it('selectRotation skips the round trip and takes the next stalest', () => {
        const { swaps } = selectRotation({ exercises: pull, equipment: floor, location: GYM, today: '2026-10-26' });
        expect(swaps).toHaveLength(1);
        expect(swaps[0]).toMatchObject({ from: 'Rope Face Pulls', to: 'Cable Rear Delt Fly' });
    });

    it('rankRotationCandidates says what it left out and why', () => {
        const r = rankRotationCandidates({ exercise: 'Rope Face Pulls', slot: pull[2], equipment: floor, location: GYM, today: '2026-10-26' });
        expect(r.candidates.map(c => c.name)).not.toContain('Reverse Pec Deck');
        expect(r.excluded).toEqual([{ name: 'Reverse Pec Deck', reason: 'swapped out 2026-09' }]);
    });
});

describe('swaps a conversation agreed to (f)', () => {
    const templates = [{ id: 'pull', name: 'Pull day', exercises: pull }, { id: 'legs', name: 'Leg day', exercises: [{ machine: 'Squat', role: 'primary' }, { machine: 'Seated Leg Curl Machine', equipment: 'Seated Leg Curl' }] }];

    it('resolves onto the right workout; main lifts stay; unknown rows are reported', () => {
        const r = resolveSwaps({
            templates, equipment: floor, location: GYM,
            swaps: [
                { workout: 'Leg day', from: 'Seated Leg Curl Machine', to: 'Standing Leg Curl Machine' },
                { from: 'Lat Pulldown', to: 'Assisted Pull-Up' },
                { from: 'Barbell Curl', to: 'Dumbbell Curl' },
            ],
        });
        expect(r.rotations).toEqual([{ templateId: 'legs', name: 'Leg day', swaps: [{ index: 1, from: 'Seated Leg Curl Machine', to: 'Standing Leg Curl Machine', equipment: 'Standing Leg Curl', reason: 'agreed in the plan' }] }]);
        expect(r.unresolved.map(u => u.from)).toEqual(['Lat Pulldown', 'Barbell Curl']);
        expect(r.unresolved[0].reason).toMatch(/main lift/);
    });

    it('a swap with no known machine plans the movement and leaves the machine to the gym', () => {
        const out = applyRotation(templates[1].exercises, [{ index: 1, from: 'Seated Leg Curl Machine', to: 'Nordic Curl', equipment: null }]);
        expect(out[1]).toMatchObject({ machine: 'Nordic Curl', rotatedFrom: 'Seated Leg Curl Machine' });
        expect(out[1].equipment).toBeUndefined();
    });

    it('waitingSwaps: what the plan lists but the workouts lack — pending rotations and unwritten "what\'s new"', () => {
        const program = {
            split: { mon: 'pull', thu: 'legs' },
            pendingRotations: [{ templateId: 'pull', name: 'Pull day', swaps: [{ from: 'Rope Face Pulls', to: 'Cable Rear Delt Fly' }] }],
            rationale: { block: 'x', changed: [
                { from: 'Seated Leg Curl Machine', to: 'Standing Leg Curl Machine', why: 'never used' },
                { from: 'Squat', to: 'Squat', why: 'already there' },
                { from: 'Lat Pulldown', to: 'Pull-Up', why: 'x', state: 'not-applied' },
            ] },
        };
        expect(waitingSwaps(program, templates).map(w => `${w.from} → ${w.to}`)).toEqual([
            'Rope Face Pulls → Cable Rear Delt Fly', 'Seated Leg Curl Machine → Standing Leg Curl Machine',
        ]);
    });
});

describe('create_program writes what the plan says (f, g)', () => {
    const U = 'users/u1';
    const seed = () => fakeAdminDb({
        [`${U}/workoutTemplates/pull`]: { name: 'Pull day', exercises: pull },
        [`${U}/workoutTemplates/legs`]: { name: 'Leg day', exercises: [{ machine: 'Squat', role: 'primary' }, { machine: 'Seated Leg Curl Machine', equipment: 'Seated Leg Curl' }] },
        ...Object.fromEntries(floor.map((e, i) => [`${U}/equipment/e${i}`, e])),
        [`${U}/workouts/w1`]: { date: '2026-10-20', completedAt: '2026-10-20T18:00:00Z', location: GYM, exercises: {} },
    });
    const ex = (db) => makeToolExecutors({ db, userId: 'u1', unit: 'lbs', today: '2026-10-26' });

    it('applies the agreed swaps, reports a main-lift swap as not applied, and the program remembers', async () => {
        const db = seed();
        const out = await ex(db).create_program({
            name: 'Next weeks', goal: 'strength', weeks: 3, startDate: '2026-10-26', split: { mon: 'pull', thu: 'legs' },
            rationale: { block: 'Three build weeks', changed: [
                { from: 'Seated Leg Curl Machine', to: 'Standing Leg Curl Machine', why: 'never used' },
                { from: 'Lat Pulldown', to: 'Assisted Pull-Up', why: 'variety' },
            ] },
        });
        expect(out.error).toBeUndefined();
        expect(out.result.rotations.applied).toEqual([{ workout: 'Leg day', from: 'Seated Leg Curl Machine', to: 'Standing Leg Curl Machine', equipment: 'Standing Leg Curl' }]);
        expect(out.result.rotations.notApplied.map(x => x.from)).toEqual(['Lat Pulldown']);
        const legs = db._docs.get(`${U}/workoutTemplates/legs`);
        expect(legs.exercises[1].machine).toBe('Standing Leg Curl Machine');
        expect(db._docs.get(`${U}/workoutTemplates/pull`).exercises[0].machine).toBe('Lat Pulldown');
        const prog = db._docs.get(`${U}/programs/${out.result.programId}`);
        expect(prog.rotationsApplied[0].swaps[0]).toMatchObject({ from: 'Seated Leg Curl Machine', to: 'Standing Leg Curl Machine' });
        expect(prog.rationale.changed.map(c => c.state)).toEqual(['applied', 'not-applied']);
        expect(prog.active).toBe(true);
    });

    it('explicit swaps (from draft_next_wave) are applied as named', async () => {
        const db = seed();
        const out = await ex(db).create_program({
            name: 'Next weeks', goal: 'strength', weeks: 3, startDate: '2026-10-26', split: { mon: 'pull', thu: 'legs' },
            swaps: [{ workout: 'Pull day', from: 'Rope Face Pulls', to: 'Cable Rear Delt Fly', equipment: 'Rear Delt Cable' }],
            rationale: { block: 'Three build weeks' },
        });
        expect(out.result.rotations.applied.map(x => x.to)).toEqual(['Cable Rear Delt Fly']);
        expect(db._docs.get(`${U}/workoutTemplates/pull`).exercises[2]).toMatchObject({ machine: 'Cable Rear Delt Fly', equipment: 'Rear Delt Cable', rotatedFrom: 'Rope Face Pulls' });
    });

    it('get_rotation_candidates never offers the round trip and says so', async () => {
        const db = seed();
        await db.collection('users').doc('u1').collection('workoutTemplates').doc('pull').set({ name: 'Pull day', exercises: pull });
        const out = await ex(db).get_rotation_candidates({ exercise: 'Rope Face Pulls' });
        const r = out.result || out;
        expect(r.candidates.map(c => c.name)).not.toContain('Reverse Pec Deck');
        expect(r.excluded[0].name).toBe('Reverse Pec Deck');
    });
});

describe('"this week" restarts with a new wave (h)', () => {
    it('six build weeks across two waves read "Build week 1" on the new one', () => {
        const old = { id: 'old', name: 'Old', startDate: '2026-09-21', weeks: 6, split: { mon: 'push' }, weekTargets: [] };
        const fresh = { id: 'new', name: 'New', startDate: '2026-10-26', weeks: 4, split: { mon: 'push' }, weekTargets: [{ week: 4, label: 'Lighter week', weightPct: -35 }] };
        const tl = buildPlanTimeline({
            plan: { cadence: { buildWeeks: 3, lighterWeek: true }, horizonWeeks: 8 },
            weekPlan: { days: { mon: 'push' } }, programs: [old, { ...fresh }],
            templates: [{ id: 'push', name: 'Push', exercises: [{ machine: 'Bench Press', role: 'primary' }] }],
            today: '2026-10-26',
        });
        expect(tl.activeProgram.id).toBe('new');
        expect(tl.header.thisWeek).toBe('Build week 1');
    });
});

describe('"a lighter week now" means this week (i)', () => {
    const wk = (monday, label) => Array.from({ length: 4 }, (_, d) => {
        const x = new Date(`${monday}T12:00:00`); x.setDate(x.getDate() + d);
        const date = x.toISOString().slice(0, 10);
        return {
            date, completedAt: `${date}T18:00:00Z`, ...(label ? { sessionLabel: label } : {}),
            exerciseNames: { exercise_0: 'Bench Press' },
            exercises: { exercise_0: { sets: [{ reps: 8, weight: 200, originalUnit: 'lbs', completed: true }] } },
        };
    });
    const history = [...wk('2026-09-28'), ...wk('2026-10-05'), ...wk('2026-10-12'), ...wk('2026-10-19', 'Deload')];

    it('Monday after a lighter week, nothing logged yet: not in one — just had one', () => {
        const d = checkDeloadNeeded(history, undefined, { today: '2026-10-26' });
        expect(d.inRecoveryWeek).toBe(false);
        expect(d.justHadLighterWeek).toBe(true);
        expect(formatVerdictsContext({ deload: d })).toMatch(/not due — last week was lighter/);
    });

    it('inside the lighter week it still says so', () => {
        const d = checkDeloadNeeded(history, undefined, { today: '2026-10-23' });
        expect(d.inRecoveryWeek).toBe(true);
    });
});
