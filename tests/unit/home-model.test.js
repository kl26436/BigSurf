import { describe, it, expect } from 'vitest';
import { buildWeekStrip, splitWorkoutTitle, heroStats, liftBadge, weeklyE1rmSeries } from '../../js/core/features/home-model.js';

const done = (date, extra = {}) => ({ date, completedAt: `${date}T11:00:00Z`, ...extra });

describe('buildWeekStrip', () => {
    // 2026-10-27 is a Tuesday; the week runs Sun 10-25 … Sat 10-31.
    const today = '2026-10-27';

    it('is Sunday-first with done / today / planned / rest', () => {
        const days = buildWeekStrip({
            today,
            workouts: [done('2026-10-25'), done('2026-10-26'), { date: '2026-10-24', completedAt: 'x' }],
            weekPlan: { days: { mon: 't1', tue: 't2', thu: 't3', fri: 't1' }, restDays: ['sat'] },
        });
        expect(days.map(d => d.letter).join('')).toBe('SMTWTFS');
        expect(days.map(d => d.state)).toEqual(['done', 'done', 'today', 'rest', 'plan', 'plan', 'rest']);
        expect(days[2]).toMatchObject({ isToday: true, date: '2026-10-27', dayName: 'Tuesday' });
    });

    it('today done reads done (still marked today)', () => {
        const days = buildWeekStrip({ today, workouts: [done('2026-10-27')] });
        expect(days[2]).toMatchObject({ state: 'done', isToday: true });
    });

    it('cancelled and unfinished sessions are not done', () => {
        const days = buildWeekStrip({
            today,
            workouts: [done('2026-10-26', { cancelledAt: 'x' }), { date: '2026-10-25' }],
        });
        expect(days[0].state).toBe('rest');
        expect(days[1].state).toBe('rest');
    });

    it('a planned day that went by stays planned, never missed', () => {
        const days = buildWeekStrip({ today, weekPlan: { days: { mon: 't1' }, restDays: [] } });
        expect(days[1].state).toBe('plan');
    });

    it("without a week plan, a workout's usual days are the plan (archived ignored)", () => {
        const days = buildWeekStrip({
            today,
            templates: [{ suggestedDays: ['thursday'] }, { suggestedDays: ['friday'], archived: true }],
        });
        expect(days[4].state).toBe('plan');
        expect(days[5].state).toBe('rest');
    });
});

describe('splitWorkoutTitle', () => {
    it('splits on the dash and turns parentheses into · parts', () => {
        expect(splitWorkoutTitle('Leg Day — Strength (knee-smart)')).toEqual({ title: 'Leg Day', sub: 'Strength · knee-smart' });
    });
    it('no dash → whole name, no subtitle', () => {
        expect(splitWorkoutTitle('Core Focus')).toEqual({ title: 'Core Focus', sub: '' });
        expect(splitWorkoutTitle('Pull-ups')).toEqual({ title: 'Pull-ups', sub: '' });
    });
    it('handles an en dash or hyphen with spaces', () => {
        expect(splitWorkoutTitle('Push – Heavy').sub).toBe('Heavy');
        expect(splitWorkoutTitle('Push - Heavy (bench)').sub).toBe('Heavy · bench');
    });
});

describe('heroStats', () => {
    const exercises = [{ sets: 3 }, { sets: 4 }, { sets: 3 }, {}];
    it('minutes, exercises, and the plan week rep range + effort', () => {
        expect(heroStats({ exercises, lastDuration: 2100, target: { repRange: [8, 12], rpeTarget: 7 } })).toEqual([
            { value: '~35', label: 'min' },
            { value: '4', label: 'exercises' },
            { value: '8–12', label: 'reps · 7/10' },
        ]);
    });
    it('a load-only week shows the change', () => {
        expect(heroStats({ exercises, target: { weightPct: -35 } }).at(-1)).toEqual({ value: '−35%', label: 'weight' });
        expect(heroStats({ exercises, target: { setDelta: 1 } }).at(-1)).toEqual({ value: '+1', label: 'set' });
    });
    it('no plan week → planned sets; never-timed → no minutes tile', () => {
        const tiles = heroStats({ exercises });
        expect(tiles).toEqual([{ value: '4', label: 'exercises' }, { value: '10', label: 'sets' }]);
    });
});

describe('liftBadge', () => {
    it('stuck beats the delta', () => {
        expect(liftBadge({ rung: 1, trend: 'up', delta: 10 })).toEqual({ text: 'Stuck', tone: 'stuck' });
    });
    it('signed deltas and the rest', () => {
        expect(liftBadge({ rung: 0, trend: 'up', delta: 35 }).text).toBe('+35');
        expect(liftBadge({ rung: 0, trend: 'down', delta: -5 }).text).toBe('−5');
        expect(liftBadge({ rung: 0, trend: 'flat', delta: 0 }).text).toBe('±0');
        expect(liftBadge({ rung: 0, trend: 'new' }).tone).toBe('new');
        expect(liftBadge({ rung: 0, trend: 'idle' }).text).toBe('Not trained');
    });
});

describe('weeklyE1rmSeries', () => {
    const w = (date, weight, reps = 5) => ({
        date, completedAt: `${date}T11:00:00Z`,
        exercises: { exercise_0: { name: 'Bench Press', sets: [{ reps, weight, originalUnit: 'lbs', completed: true }] } },
    });
    it('one point per week with a session, oldest first, skipping empty weeks', () => {
        const today = '2026-10-27';
        const workouts = [w('2026-10-26', 200), w('2026-10-12', 190), w('2026-09-25', 180)];
        const series = weeklyE1rmSeries(workouts, { name: 'Bench Press' }, 'lbs', today, 6);
        expect(series).toHaveLength(3);
        expect(series[0]).toBeLessThan(series[1]);
        expect(series[1]).toBeLessThan(series[2]);
    });
});
