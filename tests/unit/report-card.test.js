// TP-2 — the Sunday report card: the week it covers, every section from
// code, the pre-validated options, the grade, the model-reply parse, and
// the server request builder (Admin-SDK fake).

import { describe, it, expect } from 'vitest';
import {
    reportWeek, localDate, dayIndex, buildReportCard, parseReportCardReply, optionStillValid,
    cardForModel, cardJargon, numbersIn,
} from '../../js/core/features/report-card.js';
import { buildScoreboard } from '../../js/core/features/progress-scoreboard.js';
import { fakeAdminDb } from '../fixtures/admin-db-mock.js';
import reqMod from '../../functions/report-card-request.js';

const { buildReportCardRequest, reportCardDoc } = reqMod;
const WEEK = { weekKey: '2026-10-19', from: '2026-10-19', to: '2026-10-25' };
const TODAY = '2026-10-25';

const set = (weight, reps, rpe = null) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true, ...(rpe != null ? { rpe } : {}) });
const wo = (date, type, exercises, extra = {}) => ({
    date, completedAt: `${date}T18:00:00Z`, workoutType: type,
    exerciseNames: Object.fromEntries(exercises.map((e, i) => [`exercise_${i}`, e.name])),
    exercises: Object.fromEntries(exercises.map((e, i) => [`exercise_${i}`, { sets: e.sets, ...(e.equipment ? { equipment: e.equipment } : {}) }])),
    ...extra,
});
const push = { id: 'push', name: 'Push', exercises: [{ machine: 'Bench Press', role: 'primary' }, { machine: 'Cable Fly' }] };
const legs = { id: 'legs', name: 'Legs', exercises: [{ machine: 'Hack Squat', role: 'primary' }, { machine: 'Seated Leg Curl' }] };
const weekPlan = { days: { mon: 'push', tue: 'legs', thu: 'push', sat: 'legs' }, restDays: [] };

function solidHistory() {
    const out = [];
    // 4 weeks back to this week: push Mon/Thu, legs Tue/Sat, bench creeping up.
    const mondays = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
    mondays.forEach((m, k) => {
        const d = (n) => { const x = new Date(`${m}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
        out.push(wo(d(0), 'Push', [{ name: 'Bench Press', sets: [set(175 + k * 5, 6)] }, { name: 'Cable Fly', sets: [set(40, 12)] }]));
        out.push(wo(d(1), 'Legs', [{ name: 'Hack Squat', sets: [set(250 + k * 10, 8)] }, { name: 'Seated Leg Curl', sets: [set(115, 10)] }]));
        out.push(wo(d(3), 'Push', [{ name: 'Bench Press', sets: [set(175 + k * 5, 6)] }]));
        out.push(wo(d(5), 'Legs', [{ name: 'Hack Squat', sets: [set(250 + k * 10, 8)] }]));
    });
    return out;
}

const card = (over = {}) => buildReportCard({
    workouts: solidHistory(), templates: [push, legs], weekPlan, week: WEEK, today: TODAY, unit: 'lbs', ...over,
});

describe('reportWeek — local Monday–Sunday, keyed by its Monday', () => {
    it('a Sunday 19:30 Chicago run is that week, in CDT and CST (both Monday in UTC)', () => {
        expect(reportWeek(new Date('2026-10-26T00:30:00Z'))).toEqual({ ...WEEK, today: '2026-10-25' }); // CDT
        expect(reportWeek(new Date('2026-11-09T01:30:00Z'))).toMatchObject({ weekKey: '2026-11-02', to: '2026-11-08', today: '2026-11-08' }); // CST
    });

    it('a Monday run covers the week that just ended; mid-week covers this week', () => {
        expect(reportWeek(new Date('2026-10-26T15:00:00Z')).weekKey).toBe('2026-10-19');
        expect(reportWeek(new Date('2026-10-22T15:00:00Z')).weekKey).toBe('2026-10-19');
    });

    it('the zone decides the day, not UTC', () => {
        expect(localDate(new Date('2026-10-26T03:00:00Z'), 'America/Los_Angeles')).toBe('2026-10-25');
        expect(localDate(new Date('2026-10-26T03:00:00Z'), 'Europe/London')).toBe('2026-10-26');
        expect(localDate(new Date('2026-10-26T03:00:00Z'), 'Not/AZone')).toBe('2026-10-25'); // falls back to Chicago
        expect(dayIndex('2026-10-25')).toBe(6);
        expect(dayIndex('2026-10-19')).toBe(0);
    });
});

describe('sections', () => {
    it('showed up: planned days from the week plan, the days done, the streak', () => {
        const c = card();
        expect(c.showedUp).toMatchObject({ planned: 4, done: 4, missed: 0, streakWeeks: 4 });
        expect(c.showedUp.days.map(d => d.day)).toEqual(['Mon', 'Tue', 'Thu', 'Sat']);
        expect(c.showedUp.sentence).toBe('You showed up 4 of 4 days — four weeks running.');
        const short = card({ workouts: solidHistory().filter(w => w.date !== '2026-10-24') });
        expect(short.showedUp).toMatchObject({ done: 3, missed: 1, streakWeeks: 0 });
    });

    it('strength rows match the scoreboard for the same data', () => {
        // An earlier 4-week window to compare against.
        const workouts = solidHistory().concat(['2026-09-07', '2026-09-14'].map(d => wo(d, 'Push', [{ name: 'Bench Press', sets: [set(170, 6)] }])));
        const c = card({ workouts });
        const sb = buildScoreboard({ workouts, templates: [push, legs], unit: 'lbs', today: TODAY });
        expect(c.strength.map(r => [r.name, r.estMaxNow, r.estMaxPrev])).toEqual(sb.primaries.map(p => [p.name, p.e1rmNow, p.e1rmPrev]));
        expect(c.strength.find(r => r.name === 'Bench Press').sentence).toMatch(/^Bench Press: estimated max \d+(\.\d)? lbs, up \d+% from the 4 weeks before/);
    });

    it('body: 7-day average vs a month ago, and the last scan when there is one', () => {
        const measurements = [{ date: '2026-10-24', weight: 186.4, unit: 'lbs' }, { date: '2026-10-25', weight: 186.4, unit: 'lbs' }, { date: '2026-09-27', weight: 187.5, unit: 'lbs' }];
        expect(card({ measurements }).body.sentence).toBe('186.4 lbs (7-day average), down 1.1 lbs vs a month ago.');
        const dexa = [{ date: '2026-09-30', totalLeanMass: 152.3, totalBodyFat: 18.9, massUnit: 'lbs' }, { date: '2026-06-30', totalLeanMass: 151.5, totalBodyFat: 19.5, massUnit: 'lbs' }];
        expect(card({ measurements, dexa }).body.sentence).toBe('186.4 lbs (7-day average), down 1.1 lbs vs a month ago. Last scan Sep 30: lean mass 152.3 lbs (+0.8) · body fat 18.9% (-0.6).');
        expect(card().body.sentence).toMatch(/No weigh-ins/);
    });

    it('goals come from goal-progress with the same sentence', () => {
        const goals = [{ id: 'g1', type: 'consistency', metric: 'daysPerWeek', unit: 'days/week', direction: 'up', target: 4, status: 'active', baseline: { value: 3, date: '2026-09-01' } }];
        expect(card({ goals }).goals).toEqual([{ id: 'g1', status: 'met', sentence: '4 days a week over the last 4 weeks — goal 4. Met.' }]);
    });

    it('balance names the patterns under target', () => {
        expect(card().balance.sentence).toMatch(/under what it needs/);
    });

    it('no banned terms anywhere on the card', () => {
        expect(cardJargon(card())).toEqual([]);
        expect(cardJargon(buildReportCard({ week: WEEK, today: TODAY }))).toEqual([]);
    });
});

describe('options — built by code, already valid', () => {
    it('stay is always first; a good week offers nothing else', () => {
        const c = card();
        expect(c.options.map(o => o.kind)).toEqual(['stay']);
        expect(c.grade).toBe('good');
    });

    it('effort creeping on two main lifts offers a lighter week starting next Monday', () => {
        const creeping = solidHistory().map((w) => {
            if (w.date < '2026-10-06') return w;
            const rpe = w.date < '2026-10-13' ? 7.5 : w.date < '2026-10-20' ? 8.5 : 9.5;
            const ex = Object.fromEntries(Object.entries(w.exercises).map(([k, e]) => [k, { ...e, sets: e.sets.map(s => ({ ...s, weight: k === 'exercise_0' ? (w.workoutType === 'Push' ? 185 : 270) : s.weight, rpe })) }]));
            return { ...w, exercises: ex };
        });
        const c = card({ workouts: creeping });
        const o = c.options.find(x => x.kind === 'lighter-week');
        expect(c.recovery.effortCreeping.length).toBeGreaterThanOrEqual(2);
        expect(o).toMatchObject({ label: 'Make next week lighter', payload: { from: '2026-10-26', weeks: 1, label: 'Lighter week' } });
        expect(c.recovery.sentence).toMatch(/^Effort is creeping on/);
    });

    it('low readiness offers a lighter week too; not when next week is already lighter', () => {
        const tired = solidHistory().map(w => (w.date >= '2026-10-12' ? { ...w, readiness: { score: 2 } } : w));
        expect(card({ workouts: tired }).options.map(o => o.kind)).toContain('lighter-week');
        const settings = { weekOverride: { from: '2026-10-26', weeks: 1, weightPct: -10, label: 'Lighter week' } };
        const c = card({ workouts: tired, settings });
        expect(c.upcoming.nextWeekKind).toBe('Lighter week');
        expect(c.options.map(o => o.kind)).toEqual(['stay']);
    });

    it('a rung-3 accessory with a replacement at the gym offers a swap', () => {
        const flat = solidHistory().concat(['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'].map(d => wo(d, 'Legs', [{ name: 'Seated Leg Curl', sets: [set(115, 10)] }])));
        const lookup = (n) => ({ 'seated leg curl': { name: 'Seated Leg Curl', pattern: 'knee-flexion' }, 'lying leg curl': { name: 'Lying Leg Curl', pattern: 'knee-flexion' } })[String(n).toLowerCase()];
        const equipment = [{ name: 'Prone Curl Machine', exerciseTypes: ['Lying Leg Curl'], locations: ['Gym'], lastUsed: null }];
        const c = card({ workouts: flat, rotation: { equipment, location: 'Gym', lookup } });
        const o = c.options.find(x => x.kind === 'swap');
        expect(o).toMatchObject({ label: 'Rotate Seated Leg Curl', payload: { templateId: 'legs', index: 1, from: 'Seated Leg Curl', to: 'Lying Leg Curl', equipment: 'Prone Curl Machine' } });
        expect(o.payload.reason).toMatch(/^stuck for \d+ sessions; /);
    });

    it('peak only when the lighter week before an event is next week', () => {
        const events = [{ id: 'e1', name: 'Beach trip', date: '2026-11-21', kind: 'look', peakWeeks: 2, lighterBefore: true }];
        // event week Mon 11-16; peak 11-02..11-15; lighter week 10-26 = next Monday
        const c = card({ events });
        expect(c.options.find(o => o.kind === 'peak')).toMatchObject({ label: 'Take the lighter week before Beach trip', payload: { from: '2026-10-26', weightPct: -35, eventId: 'e1' } });
        expect(c.upcoming.event).toMatchObject({ name: 'Beach trip', weeks: 3 });
        const later = card({ events: [{ ...events[0], date: '2026-12-19' }] });
        expect(later.options.map(o => o.kind)).not.toContain('peak');
    });
});

describe('grade', () => {
    it('good ≥ 80% and nothing behind; rough < 50% or 2+ goals behind; else solid', () => {
        expect(card().grade).toBe('good');
        const three = solidHistory().filter(w => w.date !== '2026-10-24');
        expect(card({ workouts: three }).grade).toBe('solid');
        const one = solidHistory().filter(w => w.date < '2026-10-19' || w.date === '2026-10-19');
        expect(card({ workouts: one }).grade).toBe('rough');
        const behind = (id) => ({ id, type: 'lift', metric: 'estimatedMax', key: { exercise: 'Bench Press' }, unit: 'lbs', direction: 'up', target: 400, by: '2026-12-31', status: 'active', baseline: { value: 205, date: '2026-09-27' } });
        expect(card({ goals: [behind('a'), behind('b')] }).grade).toBe('rough');
    });
});

describe('the model\'s reply', () => {
    it('parses headline + one known choice', () => {
        const c = card();
        const r = parseReportCardReply('```json\n{"headline":"Four for four. Bench is climbing.","choice":"stay","why":"Everything is moving."}\n```', c);
        expect(r).toMatchObject({ narrative: 'Four for four. Bench is climbing.', chosen: { kind: 'stay' }, why: 'Everything is moving.', fallback: null });
    });

    it('an unknown choice or a broken reply falls back to stay and the computed headline', () => {
        const c = card();
        expect(parseReportCardReply('{"headline":"Fine week.","choice":"next-wave"}', c)).toMatchObject({ chosen: { kind: 'stay' }, fallback: 'unknown choice "next-wave"' });
        expect(parseReportCardReply('Great week!', c)).toMatchObject({ narrative: c.headline, chosen: { kind: 'stay' }, fallback: 'unparsed' });
    });

    it('optionStillValid: same kind, and the same swap', () => {
        const c = { options: [{ kind: 'stay' }, { kind: 'swap', payload: { from: 'A', to: 'B' } }] };
        expect(optionStillValid({ kind: 'swap', payload: { from: 'A', to: 'B' } }, c)).toBe(true);
        expect(optionStillValid({ kind: 'swap', payload: { from: 'A', to: 'C' } }, c)).toBe(false);
        expect(optionStillValid({ kind: 'lighter-week' }, c)).toBe(false);
    });

    it('the model sees sentences and option kinds, not payload internals', () => {
        const m = cardForModel(card());
        expect(Object.keys(m)).toEqual(['week', 'grade', 'headline', 'showedUp', 'strength', 'body', 'goals', 'recovery', 'balance', 'nextWeek', 'options']);
        expect(m.options).toEqual([{ kind: 'stay', label: 'Keep going as planned' }]);
        expect(numbersIn('4 of 4, up 2.5%')).toEqual([4, 4, 2.5]);
    });
});

describe('server request builder', () => {
    const U = 'users/u1';
    const seed = (settings = { reportCard: true, weightUnit: 'lbs' }) => {
        const docs = { [`${U}/preferences/settings`]: settings, [`${U}/preferences/weekPlan`]: weekPlan, [`${U}/workoutTemplates/push`]: push, [`${U}/workoutTemplates/legs`]: legs };
        solidHistory().forEach((w, i) => { docs[`${U}/workouts/w${i}`] = w; });
        return docs;
    };
    const NOW = new Date('2026-10-26T00:30:00Z');

    it('only for flagged users (unless forced); skips weeks already built', async () => {
        const db = fakeAdminDb(seed({ weightUnit: 'lbs' }));
        expect(await buildReportCardRequest(db.collection('users').doc('u1'), { now: NOW })).toEqual({ status: 'not_enabled' });
        const db2 = fakeAdminDb({ ...seed(), [`${U}/reportCards/2026-10-19`]: { weekKey: '2026-10-19' } });
        expect(await buildReportCardRequest(db2.collection('users').doc('u1'), { now: NOW })).toEqual({ status: 'already_built' });
    });

    it('builds the card and one cheap request over it', async () => {
        const db = fakeAdminDb(seed());
        const r = await buildReportCardRequest(db.collection('users').doc('u1'), { now: NOW });
        expect(r.week.weekKey).toBe('2026-10-19');
        expect(r.card.showedUp).toMatchObject({ planned: 4, done: 4 });
        expect(r.request.max_tokens).toBe(400);
        expect(r.request.system).toMatch(/ONLY a JSON object/);
        expect(JSON.parse(r.request.messages[0].content).showedUp).toBe(r.card.showedUp.sentence);
        const docData = reportCardDoc(r.card, '{"headline":"Good week.","choice":"stay","why":"All moving."}', { model: 'm', usage: { input_tokens: 10, output_tokens: 5 } });
        expect(docData).toMatchObject({ weekKey: '2026-10-19', narrative: 'Good week.', chosenOption: { kind: 'stay', why: 'All moving.' }, tokens: { input: 10, output: 5 }, applied: null });
    });

    it('no workouts in the week → skipped', async () => {
        const docs = seed();
        for (const k of Object.keys(docs)) if (k.includes('/workouts/') && docs[k].date >= '2026-10-19') delete docs[k];
        const db = fakeAdminDb(docs);
        expect(await buildReportCardRequest(db.collection('users').doc('u1'), { now: NOW })).toEqual({ status: 'no_workouts' });
    });
});
