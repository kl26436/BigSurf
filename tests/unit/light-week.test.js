// Scenario 22 at the rules level (AU-15, action plan §8.2): the unlabeled
// light week. Written BEFORE the fixes and expected to fail; each `it.fails`
// below becomes a plain `it` when the fix that flips it lands — the record of
// which fix did what. Real modules, synthetic fixture.

import { describe, it, expect } from 'vitest';
import { lightWeekUser, fourWeekBest, machineSwitchUser } from '../fixtures/coach-scenarios/light-week.js';
import { computeVerdicts, formatVerdictsContext } from '../../js/core/features/coach-rules.js';
import { buildScoreboard } from '../../js/core/features/progress-scoreboard.js';

const user = lightWeekUser();
const best = fourWeekBest();
const verdicts = (u = user) => computeVerdicts({
    workouts: u.workouts, templates: u.templates, weekPlan: u.weekPlan, program: u.program,
    today: u.today, unit: 'lbs', plates: u.settings.plateLbs,
});
const PRIMARIES = ['Smith Machine Bench Press', 'Shoulder Press Machine', 'Lat Pulldown', 'Hack Squat'];

describe('scenario 22 — unlabeled light week (rules level)', () => {
    it('the fixture reproduces the trace: week 5 ran at ~−35% with one "Dead load week" note per session, no label', () => {
        const wk5 = user.workouts.filter(w => w.date >= '2026-10-19');
        expect(wk5).toHaveLength(2);
        expect(wk5.every(w => !w.sessionLabel)).toBe(true);
        expect(wk5.map(w => Object.values(w.exercises).filter(e => e.notes).length)).toEqual([1, 1]);
    });

    it('no main-lift target sits below 85% of its 4-week best (flipped by AU-10(a) — notes + load)', () => {
        const v = verdicts();
        for (const name of PRIMARIES) {
            const e = v.exercises.find(x => x.name === name);
            expect(e.weight, `${name}: ${e.action} ${e.weight}`).toBeGreaterThanOrEqual(best[name] * 0.85);
        }
    });

    // AU-10(a) also drops the Panatta session here (it's light), so this
    // variant isolates AU-12: a normal week, no notes, only the machine moved.
    it.fails('a machine switch alone: the Lat Pulldown verdict stays on the High Row series (flips on: —)', () => {
        const e = verdicts(machineSwitchUser()).exercises.find(x => x.name === 'Lat Pulldown');
        expect(e.weight).toBeGreaterThanOrEqual(300);
    });

    it('the 45° hip extension counts as hinge in pattern coverage (flipped by AU-13 — library + regex)', () => {
        const sb = buildScoreboard({ workouts: user.workouts, templates: user.templates, today: user.today });
        const hinge = sb.patterns.find(p => p.pattern === 'hip-dominant');
        expect(hinge.setsThisWeek).toBeGreaterThan(0);
    });

    it('after AU-10(a): the light week is skipped and the calls match the golden answer', () => {
        const text = formatVerdictsContext(verdicts());
        expect(text).toMatch(/Smith Machine Bench Press .*hold 140 lbs, chase 6 reps/);
        expect(text).toMatch(/Shoulder Press Machine .*last 160×10 lbs on 2026-10-12/);
        expect(text).toMatch(/Lat Pulldown .*last 320×5 lbs on 2026-10-12/);
    });
});
