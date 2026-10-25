// Scenario 22 at the rules level (AU-15, action plan §8.2): the unlabeled
// light week. Written BEFORE the fixes and expected to fail; each `it.fails`
// below becomes a plain `it` when the fix that flips it lands — the record of
// which fix did what. Real modules, synthetic fixture.

import { describe, it, expect } from 'vitest';
import { lightWeekUser, fourWeekBest } from '../fixtures/coach-scenarios/light-week.js';
import { computeVerdicts, formatVerdictsContext } from '../../js/core/features/coach-rules.js';
import { buildScoreboard } from '../../js/core/features/progress-scoreboard.js';

const user = lightWeekUser();
const best = fourWeekBest();
const verdicts = () => computeVerdicts({
    workouts: user.workouts, templates: user.templates, weekPlan: user.weekPlan, program: user.program,
    today: user.today, unit: 'lbs', plates: user.settings.plateLbs,
});
const PRIMARIES = ['Smith Machine Bench Press', 'Shoulder Press Machine', 'Lat Pulldown', 'Hack Squat'];

describe('scenario 22 — unlabeled light week (rules level)', () => {
    it('the fixture reproduces the trace: week 5 ran at ~−35% with one "Dead load week" note per session, no label', () => {
        const wk5 = user.workouts.filter(w => w.date >= '2026-10-19');
        expect(wk5).toHaveLength(2);
        expect(wk5.every(w => !w.sessionLabel)).toBe(true);
        expect(wk5.map(w => Object.values(w.exercises).filter(e => e.notes).length)).toEqual([1, 1]);
    });

    it.fails('no main-lift target sits below 85% of its 4-week best (flips on: —)', () => {
        const v = verdicts();
        for (const name of PRIMARIES) {
            const e = v.exercises.find(x => x.name === name);
            expect(e.weight, `${name}: ${e.action} ${e.weight}`).toBeGreaterThanOrEqual(best[name] * 0.85);
        }
    });

    it.fails('the Lat Pulldown verdict is the High Row series, not the Panatta (flips on: —)', () => {
        const e = verdicts().exercises.find(x => x.name === 'Lat Pulldown');
        expect(e.weight).toBeGreaterThanOrEqual(300);
    });

    it.fails('the 45° hip extension counts as hinge in pattern coverage (flips on: —)', () => {
        const sb = buildScoreboard({ workouts: user.workouts, templates: user.templates, today: user.today });
        const hinge = sb.patterns.find(p => p.pattern === 'hip-dominant');
        expect(hinge.setsThisWeek).toBeGreaterThan(0);
    });

    it('today the verdicts read the light week as the baseline (the bug, pinned)', () => {
        const text = formatVerdictsContext(verdicts());
        expect(text).toMatch(/Smith Machine Bench Press .*bump → 100×6/);
    });
});
