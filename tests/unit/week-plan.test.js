// Week plan (Phase 5.5) — the deterministic reflow matrix. These rules run
// silently on the dashboard every day; they must be boring and predictable.

import { describe, it, expect } from 'vitest';
import {
    emptyWeekPlan, dayKeyOf, satisfiedDays, reflowWeek, todayCard,
    summarizeWeekPlan,
} from '../../js/core/features/week-plan.js';

// 2026-07-06 is a Monday.
const MON = new Date('2026-07-06T10:00:00');
const WED = new Date('2026-07-08T10:00:00');
const FRI = new Date('2026-07-10T10:00:00');
const SUN = new Date('2026-07-12T10:00:00');

const plan = (days, restDays = []) => ({ days: { ...emptyWeekPlan().days, ...days }, restDays });
const TEMPLATES = [
    { id: 'push', name: 'Push Day' },
    { id: 'pull', name: 'Pull Day' },
    { id: 'legs', name: 'Leg Day' },
];

describe('dayKeyOf', () => {
    it('maps JS days to mon-first keys', () => {
        expect(dayKeyOf(MON)).toBe('mon');
        expect(dayKeyOf(SUN)).toBe('sun');
    });
});

describe('satisfiedDays', () => {
    it('matches by templateId, then by workoutType name, regardless of day done', () => {
        const p = plan({ mon: 'push', wed: 'pull' });
        const done = [
            { date: '2026-07-07', templateId: 'push' },          // push done Tuesday — still counts
            { date: '2026-07-08', workoutType: 'Pull Day' },      // name match
        ];
        const s = satisfiedDays(p, done, TEMPLATES);
        expect(s.has('mon')).toBe(true);
        expect(s.has('wed')).toBe(true);
    });

    it('one workout satisfies at most one planned day', () => {
        const p = plan({ mon: 'push', fri: 'push' });
        const s = satisfiedDays(p, [{ date: '2026-07-06', templateId: 'push' }], TEMPLATES);
        expect(s.has('mon')).toBe(true);
        expect(s.has('fri')).toBe(false);
    });
});

describe('reflowWeek', () => {
    it('missed day shifts to the next open (unplanned, non-rest) day', () => {
        const p = plan({ mon: 'legs', fri: 'push' }, ['sun']);
        // It's Wednesday, Monday legs never happened.
        const { effective, dropped } = reflowWeek(p, new Set(), WED);
        expect(effective.wed).toBe('legs'); // Wed is open → legs lands today
        expect(effective.fri).toBe('push'); // planned Friday untouched
        expect(dropped).toEqual([]);
    });

    it('never double-books: missed workout skips planned days', () => {
        const p = plan({ mon: 'legs', wed: 'pull', thu: 'push' });
        const { effective } = reflowWeek(p, new Set(), WED);
        expect(effective.wed).toBe('pull');  // Wednesday keeps ITS plan
        expect(effective.thu).toBe('push');
        expect(effective.fri).toBe('legs');  // legs shifted past both
    });

    it('drops (never nags) when no open day remains', () => {
        const p = plan({ mon: 'legs', sat: 'push', sun: 'pull' }, []);
        // Sunday: Monday legs AND Saturday push both missed; Sunday has its
        // own plan — nowhere to shift either. Both drop, in day order.
        const { effective, dropped } = reflowWeek(p, new Set(), SUN);
        expect(effective.sun).toBe('pull');
        expect(dropped).toEqual(['legs', 'push']);
    });

    it('a missed workout already satisfied elsewhere does not reappear', () => {
        const p = plan({ mon: 'push', fri: 'push' });
        // Monday push missed as-planned but done Tuesday → satisfies mon.
        const s = satisfiedDays(p, [{ date: '2026-07-07', templateId: 'push' }], TEMPLATES);
        const { effective } = reflowWeek(p, s, WED);
        expect(effective.wed).toBeNull();     // nothing shifts in
        expect(effective.fri).toBe('push');   // Friday's own plan intact
    });

    it('rest days are never used for reflow', () => {
        const p = plan({ mon: 'legs' }, ['tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
        const { effective, dropped } = reflowWeek(p, new Set(), WED);
        expect(Object.values(effective).filter(Boolean)).toEqual([]);
        expect(dropped).toEqual(['legs']);
    });

    it('single-day plan and empty plan behave', () => {
        expect(reflowWeek(plan({ fri: 'push' }), new Set(), MON).effective.fri).toBe('push');
        const empty = reflowWeek(emptyWeekPlan(), new Set(), MON);
        expect(Object.values(empty.effective).filter(Boolean)).toEqual([]);
    });
});

describe('todayCard', () => {
    it('planned day → workout; rest day → rest; satisfied → done', () => {
        const p = plan({ mon: 'push' }, ['sun']);
        expect(todayCard(p, new Set(), MON)).toEqual({ kind: 'workout', templateId: 'push' });
        expect(todayCard(p, new Set(['mon']), MON)).toEqual({ kind: 'done' });
        expect(todayCard(p, new Set(), SUN)).toEqual({ kind: 'rest' });
    });

    it('open day with a missed earlier workout shows the shifted workout', () => {
        const p = plan({ mon: 'legs' });
        expect(todayCard(p, new Set(), WED)).toEqual({ kind: 'workout', templateId: 'legs' });
    });

    it('unplanned open day → open; no plan at all → none', () => {
        const p = plan({ mon: 'push' });
        expect(todayCard(p, new Set(['mon']), FRI).kind).toBe('open');
        expect(todayCard(emptyWeekPlan(), new Set(), MON).kind).toBe('none');
    });
});

describe('summarizeWeekPlan', () => {
    it('compact one-liner with names + rest days', () => {
        const s = summarizeWeekPlan(plan({ mon: 'push', wed: 'pull' }, ['sun']), TEMPLATES);
        expect(s).toBe('Mon Push Day · Wed Pull Day · rest Sun');
    });
});
