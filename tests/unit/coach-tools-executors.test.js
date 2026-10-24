// AI coach read-tool executors (AP-9 / AP-15b-c) — run against a tiny
// in-memory stand-in for the Admin SDK (collection/doc/get/orderBy/limit/
// add/set), so the unit, label and "today" contracts are checked through the
// real makeToolExecutors code path, not a re-implementation.

import { describe, it, expect } from 'vitest';
import {
    makeToolExecutors, todayInfo, plannedForDay, prRecordInUnit, normalizeUnit,
} from '../../functions/coach-tools.js';

/** Admin-SDK-shaped fake: docs keyed by full path ('users/u1/workouts/w1'). */
function fakeAdminDb(seed = {}) {
    const docs = new Map(Object.entries(seed));
    let autoId = 0;
    const snapOf = (path) => ({
        id: path.split('/').pop(),
        exists: docs.has(path),
        data: () => docs.get(path),
    });
    const collectionRef = (path, order = null, max = Infinity) => ({
        doc: (id) => docRef(`${path}/${id}`),
        orderBy: (field, dir = 'asc') => collectionRef(path, { field, dir }, max),
        limit: (n) => collectionRef(path, order, n),
        add: async (data) => { docs.set(`${path}/auto_${++autoId}`, data); return { id: `auto_${autoId}` }; },
        get: async () => {
            let list = [...docs.keys()]
                .filter(k => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
                .map(snapOf);
            if (order) {
                list.sort((a, b) => String(a.data()[order.field]).localeCompare(String(b.data()[order.field])));
                if (order.dir === 'desc') list.reverse();
            }
            list = list.slice(0, max);
            return { docs: list, empty: list.length === 0 };
        },
    });
    const docRef = (path) => ({
        collection: (name) => collectionRef(`${path}/${name}`),
        get: async () => snapOf(path),
        set: async (data) => { docs.set(path, data); },
    });
    return { collection: (name) => collectionRef(name), _docs: docs };
}

const U = 'users/u1';
const workout = (date, sets, extra = {}) => ({
    date,
    completedAt: `${date}T18:00:00Z`,
    workoutType: 'Push Day',
    exerciseNames: { exercise_0: 'Bench Press' },
    exercises: { exercise_0: { equipment: 'Flat Bench', sets } },
    ...extra,
});

describe('get_exercise_history', () => {
    const db = () => fakeAdminDb({
        [`${U}/workouts/a`]: workout('2026-07-01', [{ reps: 8, weight: 100, originalUnit: 'kg', type: 'working', rpe: 8 }]),
        [`${U}/workouts/b`]: workout('2026-07-08', [{ reps: 12, weight: 145, originalUnit: 'lbs' }], { sessionLabel: 'Deload' }),
    });

    it('AP-9: each session carries its label (null when unlabelled)', async () => {
        const ex = makeToolExecutors({ db: db(), userId: 'u1' });
        const out = await ex.get_exercise_history({ exercise: 'bench press' });
        expect(out.found).toBe(2);
        expect(out.sessions[0]).toMatchObject({ date: '2026-07-08', label: 'Deload' });
        expect(out.sessions[1].label).toBeNull();
    });

    it('AP-15c: weights come back in the display unit, labelled with it', async () => {
        const lbs = await makeToolExecutors({ db: db(), userId: 'u1', unit: 'lbs' }).get_exercise_history({ exercise: 'Bench Press' });
        expect(lbs.unit).toBe('lbs');
        expect(lbs.sessions[1].sets[0]).toMatchObject({ weight: 220.5, unit: 'lbs', rpe: 8 });
        expect(lbs.sessions[0].sets[0]).toMatchObject({ weight: 145, unit: 'lbs' });

        const kg = await makeToolExecutors({ db: db(), userId: 'u1', unit: 'kg' }).get_exercise_history({ exercise: 'Bench Press' });
        expect(kg.sessions[0].sets[0]).toMatchObject({ weight: 65.8, unit: 'kg' });
        expect(kg.sessions[1].sets[0]).toMatchObject({ weight: 100, unit: 'kg' });
    });
});

describe('get_prs (AP-15c)', () => {
    it('converts maxWeight / maxReps / maxVolume to the display unit', async () => {
        const db = fakeAdminDb({
            [`${U}/stats/personalRecords`]: {
                exercisePRs: {
                    'Bench Press': {
                        'Flat Bench': {
                            maxWeight: { weight: 100, reps: 5, date: '2026-07-01', unit: 'kg' },
                            maxReps: { weight: 135, reps: 15, date: '2026-06-01', unit: 'lbs' },
                            maxVolume: { weight: 100, reps: 8, volume: 800, date: '2026-07-01', unit: 'kg' },
                        },
                    },
                },
            },
        });
        const out = await makeToolExecutors({ db, userId: 'u1', unit: 'lbs' }).get_prs();
        expect(out.unit).toBe('lbs');
        expect(out.prs[0].maxWeight).toMatchObject({ weight: 220.5, reps: 5, unit: 'lbs' });
        expect(out.prs[0].maxReps).toMatchObject({ weight: 135, unit: 'lbs' });
        expect(out.prs[0].maxVolume).toMatchObject({ weight: 220.5, volume: 1763.7, unit: 'lbs' });
    });

    it('prRecordInUnit: null-safe, missing unit = lbs', () => {
        expect(prRecordInUnit(null, 'kg')).toBeNull();
        expect(prRecordInUnit({ weight: 225, reps: 1 }, 'kg')).toMatchObject({ weight: 102.1, unit: 'kg' });
        expect(normalizeUnit('kg')).toBe('kg');
        expect(normalizeUnit('stone')).toBe('lbs');
    });
});

describe('get_week_plan today fields (AP-15b)', () => {
    const plan = { days: { mon: 'push', tue: null, wed: 'pull', thu: null, fri: null, sat: null, sun: null }, restDays: ['sun'] };

    it("returns today (the client's local date) + todayPlanned with the template name", async () => {
        const db = fakeAdminDb({
            [`${U}/preferences/weekPlan`]: plan,
            [`${U}/workoutTemplates/pull`]: { name: 'Pull Day' },
        });
        const out = await makeToolExecutors({ db, userId: 'u1', today: '2026-07-08' }).get_week_plan();
        expect(out.today).toEqual({ date: '2026-07-08', day: 'wed', weekday: 'Wednesday' });
        expect(out.todayPlanned).toEqual({ kind: 'workout', templateId: 'pull', name: 'Pull Day' });
        expect(out.days).toEqual(plan.days);
    });

    it('rest and open days; no plan still says what today is', async () => {
        const db = fakeAdminDb({ [`${U}/preferences/weekPlan`]: plan });
        const sun = await makeToolExecutors({ db, userId: 'u1', today: '2026-07-12' }).get_week_plan();
        expect(sun.todayPlanned).toEqual({ kind: 'rest' });
        const tue = await makeToolExecutors({ db, userId: 'u1', today: '2026-07-07' }).get_week_plan();
        expect(tue.todayPlanned).toEqual({ kind: 'open' });
        const none = await makeToolExecutors({ db: fakeAdminDb(), userId: 'u1', today: '2026-07-07' }).get_week_plan();
        expect(none).toMatchObject({ plan: null, today: { day: 'tue' }, todayPlanned: null });
    });

    it('todayInfo falls back to the server date on a missing/garbage today', () => {
        expect(todayInfo('2026-07-06')).toEqual({ date: '2026-07-06', day: 'mon', weekday: 'Monday' });
        expect(todayInfo('July 6').date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(plannedForDay({ days: { fri: 'rest' } }, 'fri')).toEqual({ kind: 'rest' });
    });
});

describe('log_advice (AP-15c)', () => {
    it('stamps the unit on a numeric target so outcomes compare like with like', async () => {
        const db = fakeAdminDb();
        const ex = makeToolExecutors({ db, userId: 'u1', unit: 'kg' });
        await ex.log_advice({ type: 'weight_target', detail: 'Bench 102.5 next', exercise: 'Bench Press', targetValue: 102.5 });
        await ex.log_advice({ type: 'exercise_swap', detail: 'Try DB press', targetValue: 'DB Press' });
        const saved = [...db._docs.values()];
        expect(saved[0]).toMatchObject({ targetValue: 102.5, unit: 'kg' });
        expect(saved[1].unit).toBeUndefined();
    });
});
