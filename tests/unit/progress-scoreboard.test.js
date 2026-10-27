// AP-21 — progress scoreboard: rolling 4-week e1RM per main lift, rep PRs,
// movement-pattern coverage, headline precedence. Pure module, imported real.

import { describe, it, expect } from 'vitest';
import {
    epley1RM, pickPrimaries, buildScoreboard, formatScoreboardContext, applyPrimaryChoice,
} from '../../js/core/features/progress-scoreboard.js';
import { convertToUnit } from '../../js/core/features/coach-outcomes.js';

const TODAY = '2026-10-24'; // windows: now 09-27…10-24 · prev 08-30…09-26 · prev2 08-02…08-29

const set = (weight, reps, extra = {}) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true, ...extra });
function wo(date, exercises, extra = {}) {
    return {
        date,
        completedAt: `${date}T18:00:00Z`,
        workoutType: 'Day',
        exerciseNames: Object.fromEntries(exercises.map((e, i) => [`exercise_${i}`, e.name])),
        exercises: Object.fromEntries(exercises.map((e, i) => [`exercise_${i}`, { sets: e.sets }])),
        ...extra,
    };
}
const bench = (date, sets, extra) => wo(date, [{ name: 'Bench Press', sets }], extra);
const tagged = (...names) => [{ id: 't1', name: 'Push', exercises: names.map(n => ({ machine: n, role: 'primary' })) }];
const primaryOf = (sb, name) => sb.primaries.find(p => p.name === name);

describe('epley1RM', () => {
    it('is w × (1 + r/30) on 1–12 reps', () => {
        expect(epley1RM(100, 10)).toBe(133.3);
        expect(epley1RM(200, 1)).toBe(206.7);
    });
    it('ignores high-rep sets and missing loads', () => {
        expect(epley1RM(100, 13)).toBe(0);
        expect(epley1RM(0, 5)).toBe(0);
        expect(epley1RM(100, 0)).toBe(0);
    });
});

describe('buildScoreboard — e1RM windows', () => {
    it('normalizes a kg set into the display unit', () => {
        const sb = buildScoreboard({
            workouts: [bench('2026-10-20', [set(100, 5, { originalUnit: 'kg' })])],
            templates: tagged('Bench Press'), unit: 'lbs', today: TODAY,
        });
        expect(primaryOf(sb, 'Bench Press').e1rmNow).toBe(epley1RM(convertToUnit(100, 'kg', 'lbs'), 5));
    });

    it('uses the TOTAL load on a base-weight machine, not the typed plates', () => {
        const sb = buildScoreboard({
            workouts: [bench('2026-10-20', [set(270, 5, { _plateWeight: 180, _equipBaseWeight: 90 })])],
            templates: tagged('Bench Press'), unit: 'lbs', today: TODAY,
        });
        expect(primaryOf(sb, 'Bench Press').e1rmNow).toBe(epley1RM(270, 5));
    });

    it('skips warmups and >12-rep sets', () => {
        const sb = buildScoreboard({
            workouts: [bench('2026-10-20', [set(300, 3, { type: 'warmup' }), set(100, 15), set(185, 8)])],
            templates: tagged('Bench Press'), unit: 'lbs', today: TODAY,
        });
        expect(primaryOf(sb, 'Bench Press').e1rmNow).toBe(epley1RM(185, 8));
    });

    it('excludes recovery sessions from both windows — a deload is never a down trend', () => {
        const workouts = [
            bench('2026-09-10', [set(200, 5)]),
            bench('2026-10-01', [set(200, 5)]),
            bench('2026-10-20', [set(130, 12)], { sessionLabel: 'Deload' }),
            bench('2026-10-22', [set(130, 12)], { sessionIntent: { mode: 'deload' } }),
        ];
        const p = primaryOf(buildScoreboard({ workouts, templates: tagged('Bench Press'), today: TODAY }), 'Bench Press');
        expect(p.e1rmNow).toBe(epley1RM(200, 5));
        expect(p.trend).toBe('flat');
    });

    it('a window holding only deload sessions reads idle, not down', () => {
        const workouts = [
            bench('2026-09-10', [set(200, 5)]),
            bench('2026-10-20', [set(130, 12)], { sessionLabel: 'Deload' }),
        ];
        const p = primaryOf(buildScoreboard({ workouts, templates: tagged('Bench Press'), today: TODAY }), 'Bench Press');
        expect(p.trend).toBe('idle');
    });

    it('flat band is ±2.5% or one jump, whichever is larger', () => {
        const flat = buildScoreboard({
            workouts: [bench('2026-09-10', [set(200, 5)]), bench('2026-10-10', [set(203, 5)])],
            templates: tagged('Bench Press'), today: TODAY,
        });
        expect(primaryOf(flat, 'Bench Press').trend).toBe('flat');
        const up = buildScoreboard({
            workouts: [bench('2026-09-10', [set(200, 5)]), bench('2026-10-10', [set(210, 5)])],
            templates: tagged('Bench Press'), today: TODAY,
        });
        const p = primaryOf(up, 'Bench Press');
        expect(p.trend).toBe('up');
        expect(p.delta).toBeCloseTo(epley1RM(210, 5) - epley1RM(200, 5), 1);
        // A 10 lb gym jump widens the band past a 5 lb move.
        const bigJump = buildScoreboard({
            workouts: [bench('2026-09-10', [set(200, 5)]), bench('2026-10-10', [set(205, 5)])],
            templates: tagged('Bench Press'), today: TODAY, config: { increment: 10 },
        });
        expect(primaryOf(bigJump, 'Bench Press').trend).toBe('flat');
    });

    it('marks "new" when only this window has data', () => {
        const sb = buildScoreboard({ workouts: [bench('2026-10-10', [set(200, 5)])], templates: tagged('Bench Press'), today: TODAY });
        expect(primaryOf(sb, 'Bench Press').trend).toBe('new');
    });
});

describe('buildScoreboard — rep PRs and stall rung', () => {
    it('flags a rep record only at a weight used before', () => {
        const sb = buildScoreboard({
            workouts: [bench('2026-10-01', [set(185, 8)]), bench('2026-10-20', [set(185, 9), set(190, 6)])],
            templates: tagged('Bench Press'), today: TODAY,
        });
        expect(primaryOf(sb, 'Bench Press').repPR).toEqual({ weight: 185, reps: 9, prevReps: 8, date: '2026-10-20' });

        const fresh = buildScoreboard({
            workouts: [bench('2026-10-01', [set(185, 8)]), bench('2026-10-20', [set(190, 9)])],
            templates: tagged('Bench Press'), today: TODAY,
        });
        expect(primaryOf(fresh, 'Bench Press').repPR).toBeNull();
    });

    it('carries the stall rung from the progression ladder', () => {
        const flat = ['2026-10-01', '2026-10-08', '2026-10-15'].map(d => bench(d, [set(200, 8)]));
        const sb = buildScoreboard({ workouts: flat, templates: tagged('Bench Press'), today: TODAY });
        expect(primaryOf(sb, 'Bench Press').rung).toBe(1);
    });
});

describe('pickPrimaries', () => {
    const names = [
        ['Bench Press', 4], ['Chest Fly', 6], ['Squat', 4], ['Romanian Deadlift', 3],
        ['Shoulder Press', 3], ['Seated Row', 3], ['Lat Pulldown', 3], ['Leg Curl', 5],
    ];
    const history = [wo('2026-10-20', names.map(([n, k]) => ({ name: n, sets: Array.from({ length: k }, () => set(100, 8)) })))];

    it('fallback: the most-trained compound per spine pattern, one each, isolation excluded', () => {
        const picked = pickPrimaries({ workouts: history, today: TODAY });
        expect(picked.map(p => p.name).sort()).toEqual(
            ['Bench Press', 'Lat Pulldown', 'Romanian Deadlift', 'Seated Row', 'Shoulder Press', 'Squat']);
        expect(new Set(picked.map(p => p.pattern)).size).toBe(6);
        expect(picked.every(p => p.source === 'auto')).toBe(true);
    });

    it('explicit role:"primary" rows win over the fallback; archived templates ignored', () => {
        const templates = [
            { id: 'a', exercises: [{ machine: 'Leg Press', role: 'primary' }, { machine: 'Bench Press' }] },
            { id: 'b', archived: true, exercises: [{ machine: 'Squat', role: 'primary' }] },
        ];
        expect(pickPrimaries({ templates, workouts: history, today: TODAY }))
            .toEqual([{ name: 'Leg Press', pattern: 'knee-dominant', source: 'tagged' }]);
    });

    it('ignores recovery sessions and history older than 8 weeks', () => {
        const old = [wo('2026-08-01', [{ name: 'Squat', sets: [set(200, 5)] }])];
        const deload = [wo('2026-10-20', [{ name: 'Squat', sets: [set(130, 12)] }], { sessionLabel: 'Deload' })];
        expect(pickPrimaries({ workouts: [...old, ...deload], today: TODAY })).toEqual([]);
    });
});

describe('buildScoreboard — patterns and headline', () => {
    it('counts sets per spine pattern over the last 7 days, recovery excluded', () => {
        const sb = buildScoreboard({
            workouts: [
                wo('2026-10-22', [{ name: 'Squat', sets: [set(200, 5), set(200, 5)] }]),
                wo('2026-10-23', [{ name: 'Leg Press', sets: [set(300, 10)] }], { sessionLabel: 'Deload' }),
            ],
            today: TODAY,
        });
        const squat = sb.patterns.find(p => p.pattern === 'knee-dominant');
        expect(squat.setsThisWeek).toBe(2);
        expect(squat.status).toBe('recovery'); // a deload is in the window
        expect(squat.lastTrained).toBe('2026-10-23');
    });

    it('LB-1: Back Extension Machine on the 45° bench counts toward Hinge; on a lumbar machine it does not; shrugs are never spine', () => {
        const onMachine = (date, name, equipment, n) => {
            const w = wo(date, [{ name, sets: Array.from({ length: n }, () => set(45, 12)) }]);
            w.exercises.exercise_0.equipment = equipment;
            return w;
        };
        const sb = buildScoreboard({
            workouts: [
                onMachine('2026-10-23', 'Back Extension Machine', 'Arsenal Strength Alpha — 45 Degree Back Extension', 3),
                onMachine('2026-10-23', 'Shoulder Shrug', 'Arsenal Reloaded — Multi Flex', 4),
            ],
            today: TODAY,
        });
        const hinge = sb.patterns.find(p => p.pattern === 'hip-dominant');
        expect(hinge).toMatchObject({ label: 'Hinge', setsThisWeek: 3, status: 'under' });
        expect(sb.patterns.map(p => p.pattern)).not.toContain('shrug');

        const lumbar = buildScoreboard({
            workouts: [onMachine('2026-10-23', 'Back Extension Machine', 'Nautilus Lower Back', 3)],
            today: TODAY,
        });
        expect(lumbar.patterns.find(p => p.pattern === 'hip-dominant').setsThisWeek).toBe(0);
    });

    it('LB-4: a Movement set on the library entry decides the pattern strip', () => {
        const workouts = [wo('2026-10-23', [{ name: 'Reverse Hip Station', sets: [set(90, 10), set(90, 10)] }])];
        const hingeSets = (sb) => sb.patterns.find(p => p.pattern === 'hip-dominant').setsThisWeek;
        // The name alone says nothing…
        expect(hingeSets(buildScoreboard({ workouts, today: TODAY }))).toBe(0);
        // …the user's label in the library does.
        const library = [{ name: 'Reverse Hip Station', bodyPart: 'Glutes', pattern: 'hip-dominant' }];
        expect(hingeSets(buildScoreboard({ workouts, today: TODAY, library }))).toBe(2);
    });

    it('two-weeks-under needs history that reaches back two weeks', () => {
        const newAccount = buildScoreboard({ workouts: [wo('2026-10-22', [{ name: 'Squat', sets: [set(200, 5)] }])], today: TODAY });
        expect(newAccount.patterns.find(p => p.pattern === 'hip-dominant').weeksUnder).toBe(1);
        expect(newAccount.headlineKind).not.toBe('under');
    });

    it('precedence: a lift down two windows running beats a pattern gap', () => {
        const workouts = [
            bench('2026-08-10', [set(200, 5)]),
            bench('2026-09-10', [set(190, 5)]),
            bench('2026-10-10', [set(180, 5)]),
        ];
        const sb = buildScoreboard({ workouts, templates: tagged('Bench Press'), today: TODAY });
        expect(sb.headlineKind).toBe('down');
        expect(sb.headline).toMatch(/^Bench Press is down two 4-week windows running/);
    });

    it('precedence: a pattern under MEV for 2 weeks beats the up-count', () => {
        const workouts = [
            bench('2026-09-10', [set(200, 5)]),
            bench('2026-10-10', [set(215, 5)]),
            bench('2026-10-20', [set(215, 5)]),
        ];
        const sb = buildScoreboard({ workouts, templates: tagged('Bench Press'), today: TODAY });
        expect(sb.headlineKind).toBe('under');
        expect(sb.headline).toMatch(/under 8 sets a week for 2 weeks/);
    });

    it('otherwise the up-count of main lifts', () => {
        const workouts = [
            wo('2026-09-10', [{ name: 'Bench Press', sets: [set(200, 5)] }, { name: 'Squat', sets: [set(300, 5)] }]),
            wo('2026-10-10', [{ name: 'Bench Press', sets: [set(215, 5)] }, { name: 'Squat', sets: [set(300, 5)] }]),
        ];
        const sb = buildScoreboard({
            workouts, templates: tagged('Bench Press', 'Squat'), today: TODAY, config: { patternTarget: 0 },
        });
        expect(sb.headline).toBe('1 of 2 main lifts up over 4 weeks');
        expect(sb.counts).toEqual({ up: 1, flat: 1, down: 0 });
    });

    it('empty history → no primaries, no throw, empty context', () => {
        const sb = buildScoreboard({ workouts: [], today: TODAY });
        expect(sb.primaries).toEqual([]);
        expect(sb.headlineKind).toBe('none');
        expect(formatScoreboardContext(sb)).toBe('');
    });

    it('formats the same numbers the card shows', () => {
        const sb = buildScoreboard({
            workouts: [bench('2026-09-10', [set(200, 5)]), bench('2026-10-10', [set(215, 5)])],
            templates: tagged('Bench Press'), today: TODAY,
        });
        const text = formatScoreboardContext(sb);
        expect(text).toContain(`Bench Press: estimated max ${epley1RM(215, 5)} lbs, up`);
        expect(text).toMatch(/Movement patterns, sets in the last 7 days \(target 8; more than 22 is more than it can use\)/);
    });
});

describe('applyPrimaryChoice', () => {
    it('tags picked rows primary and demotes an un-picked primary', () => {
        const rows = [
            { machine: 'Bench Press', role: 'primary' },
            { machine: 'Incline Press' },
            { machine: 'Cable Fly', role: 'primary' },
        ];
        const out = applyPrimaryChoice(rows, new Set(['incline press']));
        // Bench is a compound in slot 0 — inference would call it primary
        // again, so it is pinned secondary; the fly simply loses the tag.
        expect(out).toEqual([
            { machine: 'Bench Press', role: 'secondary' },
            { machine: 'Incline Press', role: 'primary' },
            { machine: 'Cable Fly' },
        ]);
    });

    it('returns null when nothing changes', () => {
        expect(applyPrimaryChoice([{ machine: 'Squat', role: 'primary' }], new Set(['squat']))).toBeNull();
    });
});
