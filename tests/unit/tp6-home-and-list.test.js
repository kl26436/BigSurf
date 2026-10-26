// TP-6 c / n — Home's "Your plan" line reads the same header the Plan page
// shows; the Workouts list doesn't repeat the plan's sessions and folds old ones.

import { describe, it, expect } from 'vitest';
import { buildPlanTimeline, planSummaryLine } from '../../js/core/features/plan-timeline.js';
import { groupMyWorkouts } from '../../js/core/features/plan-sessions.js';
import { findJargon } from '../../js/core/features/plain-language.js';

const push = { id: 'push', name: 'Push', exercises: [{ machine: 'Bench Press', role: 'primary' }] };
const program = {
    id: 'p1', name: 'Strength', startDate: '2026-10-05', weeks: 4, split: { mon: 'push' },
    weekTargets: [{ week: 4, label: 'Lighter week', weightPct: -35 }],
};

describe("Home's plan line (c)", () => {
    const tl = (plan) => buildPlanTimeline({
        plan, weekPlan: { days: { mon: 'push' } }, programs: [program], templates: [push],
        events: [{ id: 'e', name: 'Trip', date: '2026-12-19' }], today: '2026-10-21',
    });

    it('says what the Plan page header says — week kind, lighter week, the date — never "week N of M"', () => {
        const t = tl({ name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true } });
        const line = planSummaryLine(t.header, { waiting: 2 });
        expect(line.title).toBe(`My plan · ${t.header.thisWeek}`);
        expect(line.title).toBe('My plan · Build week 3');
        expect(line.meta).toBe('lighter week starts Oct 26 · Trip in 8 weeks · 2 swaps waiting');
        expect(`${line.title} ${line.meta}`).not.toMatch(/week \d+ of \d+/);
        expect(findJargon(`${line.title} ${line.meta}`)).toEqual([]);
    });

    it('no plan doc: says how to keep it going', () => {
        const line = planSummaryLine(tl(null).header, { hasPlan: false });
        expect(line.meta).toContain('turn it on to keep it going');
    });

    it('the header knows when the next weeks get set up (the Sunday before)', () => {
        const h = tl({ name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true } }).header;
        expect(h.nextWeeksFrom).toBe('2026-11-02');
        expect(h.nextRoll).toBe('2026-11-01');
    });
});

describe('the Workouts list (n)', () => {
    it('drops what the plan group already shows; recent vs older by last use', () => {
        const ts = [{ id: 'push' }, { id: 'a' }, { id: 'b' }, { id: 'c' }];
        const used = { a: '2026-10-01', b: '2026-05-01', c: null };
        const g = groupMyWorkouts(ts, { splitIds: ['push'], lastUsed: t => used[t.id], today: '2026-10-26' });
        expect(g.recent.map(t => t.id)).toEqual(['a']);
        expect(g.older.map(t => t.id)).toEqual(['b', 'c']);
    });
});
