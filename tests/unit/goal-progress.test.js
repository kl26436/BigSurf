// TP-1 — goals: validation, baselines from the data, rate math, status and
// the plain sentence. Pure modules, imported real.

import { describe, it, expect } from 'vitest';
import {
    normalizeGoal, normalizeEvent, measureGoal, captureBaseline, goalStatus, goalName, goalsWithStatus,
    formatGoalsContext, daysPerWeek, shortDate, weeksUntil,
} from '../../js/core/features/goal-progress.js';
import { weightAverage, dailyWeights, scanLeanMass, calculate7DayAverage } from '../../js/core/features/body-stats.js';
import { epley1RM } from '../../js/core/features/progress-scoreboard.js';
import { findJargon } from '../../js/core/features/plain-language.js';

const TODAY = '2026-10-25';
const set = (weight, reps) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true });
const wo = (date, name, sets, extra = {}) => ({
    date, completedAt: `${date}T18:00:00Z`, workoutType: 'Day',
    exerciseNames: { exercise_0: name }, exercises: { exercise_0: { sets } }, ...extra,
});
const weigh = (date, weight, unit = 'lbs') => ({ date, weight, unit, timestamp: `${date}T07:00:00Z` });
const lift = (over = {}) => ({
    id: 'g1', type: 'lift', metric: 'estimatedMax', key: { exercise: 'Bench Press' }, unit: 'lbs', direction: 'up',
    target: 225, by: '2027-02-14', status: 'active', ...over,
});

describe('normalizeGoal — reject, don\'t coerce', () => {
    it('validates type, metric, target and date', () => {
        expect(normalizeGoal({ type: 'speed', target: 1 }, { today: TODAY })).toMatchObject({ ok: false });
        expect(normalizeGoal({ type: 'lift', target: -5, key: { exercise: 'Bench' } }, { today: TODAY }).error).toMatch(/positive/);
        expect(normalizeGoal({ type: 'lift', target: 225, key: { exercise: 'Bench' }, by: '2026-10-01' }, { today: TODAY }).error).toMatch(/after today/);
        expect(normalizeGoal({ type: 'composition', metric: 'vat', target: 1 }, { today: TODAY }).error).toMatch(/leanMass, bodyFatPct/);
        expect(normalizeGoal({ type: 'consistency', target: 9 }, { today: TODAY }).error).toMatch(/1–7/);
        expect(normalizeGoal({ type: 'balance', target: 8, key: { pattern: 'jogging' } }, { today: TODAY }).error).toMatch(/hip-dominant/);
    });

    it('a lift must be a main lift when main lifts are set, and the error names them', () => {
        const r = normalizeGoal({ type: 'lift', target: 225, key: { exercise: 'Cable Fly' } }, { today: TODAY, mainLifts: ['Bench Press', 'Hack Squat'] });
        expect(r.ok).toBe(false);
        expect(r.hint).toContain('Bench Press, Hack Squat');
        const ok = normalizeGoal({ type: 'lift', target: 225, key: { exercise: 'bench press' } }, { today: TODAY, mainLifts: ['Bench Press'] });
        expect(ok.goal.key.exercise).toBe('Bench Press');
    });

    it('normalizes units and directions', () => {
        expect(normalizeGoal({ type: 'bodyweight', target: 82, unit: 'kg' }, { today: TODAY }).goal).toMatchObject({ unit: 'kg', direction: null, metric: 'weight' });
        expect(normalizeGoal({ type: 'composition', metric: 'bodyFatPct', target: 16 }, { today: TODAY }).goal).toMatchObject({ unit: '%', direction: 'down' });
        expect(normalizeGoal({ type: 'consistency', target: 4 }, { today: TODAY }).goal).toMatchObject({ unit: 'days/week', direction: 'up' });
    });

    it('events: name, future date, kind, peak window', () => {
        expect(normalizeEvent({ name: 'Beach trip', date: '2027-06-06', kind: 'look' }, { today: TODAY }).event)
            .toEqual({ name: 'Beach trip', date: '2027-06-06', kind: 'look', note: null, peakWeeks: 2, lighterBefore: true });
        expect(normalizeEvent({ name: 'x', date: '2026-01-01' }, { today: TODAY }).ok).toBe(false);
        expect(normalizeEvent({ name: 'x', date: '2027-01-01', kind: 'party' }, { today: TODAY }).error).toMatch(/look, perform, other/);
    });
});

describe('body-stats', () => {
    it('the moved 7-entry average (body-measurements re-exports it)', () => {
        expect(calculate7DayAverage([{ date: 'a', weight: 100 }, { date: 'b', weight: 102 }])).toEqual([{ date: 'a', weight: 100 }, { date: 'b', weight: 101 }]);
    });

    it('7-day average is calendar days, converts units, keeps the latest reading per day', () => {
        const e = [weigh('2026-10-10', 200), weigh('2026-10-20', 186), weigh('2026-10-24', 84.5, 'kg'), { ...weigh('2026-10-24', 186.4), timestamp: '2026-10-24T08:00:00Z' }];
        expect(dailyWeights(e, 'lbs').map(x => x.weight)).toEqual([200, 186, 186.4]);
        expect(weightAverage(e, { asOf: TODAY, unit: 'lbs' })).toMatchObject({ value: 186.2, readings: 2 });
    });

    it('a single outlier weigh-in is dropped (4+ readings)', () => {
        const e = ['19', '20', '21', '22', '23'].map(d => weigh(`2026-10-${d}`, 186));
        e.push(weigh('2026-10-24', 196)); // shoes on, after dinner
        expect(weightAverage(e, { asOf: TODAY }).value).toBe(186);
        expect(weightAverage([weigh('2026-10-24', 196), weigh('2026-10-23', 186)], { asOf: TODAY }).value).toBe(191); // too few to judge
    });

    it('lean mass converts from the scan\'s unit', () => {
        expect(scanLeanMass({ totalLeanMass: 69, massUnit: 'kg' }, 'lbs')).toBe(152.1);
        expect(scanLeanMass({}, 'lbs')).toBeNull();
    });
});

describe('measureGoal + captureBaseline — from the data, never typed', () => {
    const benchAt = (date, w) => wo(date, 'Bench Press', [set(w, 5)]);

    it('lift: best estimated max in the last 4 weeks', () => {
        const workouts = [benchAt('2026-09-01', 225), benchAt('2026-10-20', 185), benchAt('2026-10-13', 190)];
        expect(measureGoal(lift(), { workouts, today: TODAY }).now).toBe(Math.round(epley1RM(190, 5) * 10) / 10);
        const { baseline } = captureBaseline(lift(), { workouts, today: TODAY });
        expect(baseline).toEqual({ value: Math.round(epley1RM(190, 5) * 10) / 10, date: TODAY });
    });

    it('bodyweight: direction comes from the baseline', () => {
        const measurements = ['20', '21', '22', '23', '24'].map(d => weigh(`2026-10-${d}`, 186.4));
        const g = normalizeGoal({ type: 'bodyweight', target: 182 }, { today: TODAY }).goal;
        expect(captureBaseline(g, { measurements, today: TODAY })).toEqual({ baseline: { value: 186.4, date: TODAY }, direction: 'down' });
    });

    it('consistency: distinct days a week over 4 weeks', () => {
        const ws = [];
        for (let i = 0; i < 16; i++) ws.push(benchAt(`2026-10-${String(25 - Math.floor(i * 1.7)).padStart(2, '0')}`, 135));
        expect(daysPerWeek(ws, TODAY)).toBeGreaterThan(3);
        expect(daysPerWeek([benchAt('2026-10-24', 1), benchAt('2026-10-24', 2)], TODAY)).toBe(0.3); // one day, not two
    });

    it('no data → null baseline and a sentence that says how to fill it', () => {
        const r = goalStatus({ ...lift(), baseline: null }, measureGoal(lift(), { workouts: [], today: TODAY }), TODAY);
        expect(r.status).toBe('no-data');
        expect(r.sentence).toBe('Bench Press 225 lbs: no data yet — log a session of it and this fills in.');
    });
});

describe('goalStatus — rates, bands, met, open-ended, too early', () => {
    const g = lift({ baseline: { value: 200, date: '2026-09-27' }, by: '2027-02-14' }); // 20 weeks total, 4 elapsed
    const at = (now) => goalStatus(g, { now, nowDate: TODAY }, TODAY);

    it('required vs actual rate per week, projected at the date', () => {
        const r = at(207.2); // +7.2 in 4 weeks = 1.8/wk; need 25/20 = 1.25
        expect(r.requiredRate).toBe(1.25);
        expect(r.actualRate).toBe(1.8);
        expect(r.weeksLeft).toBe(16);
        expect(r.projected).toBe(236);
        expect(r.status).toBe('ahead');
    });

    it('on track inside the band, behind outside it — lift up', () => {
        expect(at(205).status).toBe('on-track');     // 1.25/wk → projected 225
        expect(at(201).status).toBe('behind');       // 0.25/wk → 205
        expect(at(201).sentence).toBe('Bench Press: estimated max 201 lbs, need 225 lbs by Feb 14 — gaining 0.3 lbs/week, need 1.3. Behind.');
        expect(at(204).status).toBe('on-track'); // projects 220 — inside the band
        expect(at(203).slightly).toBe(true);    // projects 215
        expect(at(203).sentence).toMatch(/Slightly behind\.$/);
    });

    it('bodyweight down: losing toward the target is progress, gaining is the wrong way', () => {
        const bw = { id: 'g2', type: 'bodyweight', metric: 'weight', unit: 'lbs', direction: 'down', target: 182, by: '2027-06-06', status: 'active', baseline: { value: 186.8, date: '2026-09-27' } };
        const r = goalStatus(bw, { now: 186.4, nowDate: TODAY }, TODAY); // -0.1/wk, need -0.13
        expect(r.status).toBe('on-track');
        expect(r.sentence).toBe('Body weight 186.4 lbs (7-day average), need 182 lbs by Jun 6 — losing 0.1 lbs/week, need 0.1. On track.');
        expect(goalStatus(bw, { now: 185.6, nowDate: TODAY }, TODAY).status).toBe('ahead'); // -0.3/wk
        expect(goalStatus(bw, { now: 189, nowDate: TODAY }, TODAY).sentence).toMatch(/moving the wrong way \(gaining 0.6 lbs\/week\)/);
    });

    it('met when now crosses the target in the goal\'s direction; missed after the date', () => {
        expect(at(226).status).toBe('met');
        expect(goalStatus(g, { now: 210, nowDate: '2027-03-01' }, '2027-03-01').status).toBe('missed');
    });

    it('open-ended goals report the rate and progress, status no-date', () => {
        const r = goalStatus({ ...g, by: null }, { now: 207.2, nowDate: TODAY }, TODAY);
        expect(r).toMatchObject({ status: 'no-date', actualRate: 1.8, pct: 29 });
        expect(r.sentence).toBe('Bench Press: estimated max 207.2 lbs, goal 225 lbs — gaining 1.8 lbs/week since you set it.');
    });

    it('too early under a week', () => {
        const fresh = lift({ baseline: { value: 200, date: '2026-10-22' } });
        expect(goalStatus(fresh, { now: 201, nowDate: TODAY }, TODAY)).toMatchObject({ status: 'too-early', actualRate: null });
    });

    it('composition between scans uses bodyweight as the proxy', () => {
        const comp = { id: 'g3', type: 'composition', metric: 'leanMass', key: 'totalLeanMass', unit: 'lbs', direction: 'up', target: 155, by: '2027-03-01', status: 'active', baseline: { value: 151.5, date: '2026-08-30' } };
        const dexa = [{ date: '2026-09-30', totalLeanMass: 152.3, totalBodyFat: 18.9, massUnit: 'lbs' }];
        const measurements = [weigh('2026-09-28', 188), weigh('2026-09-29', 187.6), weigh('2026-09-30', 187.6), weigh('2026-10-24', 186.4), weigh('2026-10-25', 186.4)];
        const m = measureGoal(comp, { dexa, measurements, today: TODAY });
        expect(m).toMatchObject({ now: 152.3, nowDate: '2026-09-30', sinceScan: -1.3 });
        expect(goalStatus(comp, m, TODAY).sentence).toMatch(/at the Sep 30 scan, need 155 lbs by Mar 1 — .*Next scan will tell; body weight is down 1\.3 lbs since then\./);
    });

    it('rolling goals: days a week and weekly sets are a standing bar', () => {
        const c = { type: 'consistency', metric: 'daysPerWeek', unit: 'days/week', direction: 'up', target: 4, status: 'active', baseline: { value: 3.5, date: '2026-10-01' } };
        expect(goalStatus(c, { now: 4, nowDate: TODAY }, TODAY)).toMatchObject({ status: 'met', sentence: '4 days a week over the last 4 weeks — goal 4. Met.' });
        expect(goalStatus(c, { now: 3.8, nowDate: TODAY }, TODAY).status).toBe('on-track');
        expect(goalStatus(c, { now: 3, nowDate: TODAY }, TODAY).status).toBe('behind');
    });

    it('paused goals say so; every sentence is jargon-free', () => {
        expect(goalStatus({ ...g, status: 'paused' }, { now: 205, nowDate: TODAY }, TODAY).status).toBe('paused');
        for (const now of [null, 199, 201, 205, 207.2, 226]) expect(findJargon(at(now).sentence)).toEqual([]);
    });
});

describe('names, lists and the coach lines', () => {
    it('goal names read like the Goals page', () => {
        expect(goalName(lift())).toBe('Bench Press 225 lbs');
        expect(goalName({ type: 'bodyweight', target: 182, unit: 'lbs', eventId: 'e1' }, { events: [{ id: 'e1', name: 'the trip' }] })).toBe('Body weight 182 lbs for the trip');
        expect(goalName({ type: 'balance', key: { pattern: 'hip-dominant' }, target: 8 })).toBe('Hinge 8 sets a week');
        expect(shortDate('2027-02-14')).toBe('Feb 14');
        expect(weeksUntil('2027-06-06', TODAY)).toBe(32);
    });

    it('formatGoalsContext: one sentence per goal, upcoming events', () => {
        const text = formatGoalsContext({
            goals: [lift({ baseline: { value: 200, date: '2026-09-27' } }), { ...lift({ id: 'old' }), status: 'met' }],
            events: [{ id: 'e1', name: 'Beach trip', date: '2027-06-06' }, { id: 'e0', name: 'Past', date: '2026-01-01' }],
            data: { workouts: [wo('2026-10-20', 'Bench Press', [set(185, 5)])], today: TODAY },
        });
        expect(text).toContain('- [g1] Bench Press: estimated max 215.8 lbs, need 225 lbs by Feb 14');
        expect(text).not.toContain('[old]');
        expect(text).toContain('Events: [e1] Beach trip on Jun 6 (32 weeks)');
        expect(text).not.toContain('Past');
        expect(findJargon(text)).toEqual([]);
        expect(formatGoalsContext({})).toBe('');
    });

    it('goalsWithStatus keeps met / missed goals as stored', () => {
        const rows = goalsWithStatus([{ ...lift(), status: 'met' }], { today: TODAY });
        expect(rows[0]).toMatchObject({ status: 'met', sentence: 'Bench Press 225 lbs: met.' });
    });

});
