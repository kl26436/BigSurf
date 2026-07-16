// Tests for Track B progress signals:
//  - beatBadgeFor: "beat last time" set-row badge (active-workout-ui.js)
//  - countLastWeekTrainingDaysThroughToday: dashboard week-over-week pace
// Both are pure functions re-implemented here for isolation (no DOM/Firebase),
// mirroring the shipped logic.
//
// NOT converted to real-source imports: the mirrored functions live un-exported
// in active-workout-ui.js and dashboard-ui.js — both deliberately self-contained
// (prod pins JS for a year; no new cross-module exports) and with import graphs
// (data-manager, navigation, exercise-ui, push-notification-manager, …) that
// would need a fragile mock tower. Per-function MIRRORS notes below — keep in
// sync manually when the source changes.

import { describe, it, expect, vi } from 'vitest';

// progression.js imports convertWeight from ui-helpers (DOM-heavy at import) —
// mock it with the real math so we can import the REAL progression module
// instead of mirroring it (Phase 5.7.3 extraction).
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    convertWeight: (weight, fromUnit, toUnit) => {
        if (!weight || isNaN(weight) || weight <= 0 || weight > 1000) return 0;
        if (fromUnit === toUnit) return Math.round(weight * 10) / 10;
        if (fromUnit === 'lbs' && toUnit === 'kg') return Math.round(weight * 0.453592 * 10) / 10;
        if (fromUnit === 'kg' && toUnit === 'lbs') return Math.round(weight * 2.20462 * 10) / 10;
        return Math.round(weight * 10) / 10;
    },
}));

import {
    computeOverloadNudge as realComputeOverloadNudge,
    buildExerciseSessions as realBuildExerciseSessions,
    progressionTarget,
} from '../../js/core/features/progression.js';

// MIRRORS: js/core/ui/ui-helpers.js#convertWeight (lines 67-86) — simplified:
// exact math with no 1-decimal rounding, no >1000 guard. The source functions
// mirrored below call the real (rounding) convertWeight.
const LB_PER_KG = 2.20462;
function convertWeight(w, from, to) {
    if (from === to) return w;
    if (from === 'kg' && to === 'lbs') return w * LB_PER_KG;
    if (from === 'lbs' && to === 'kg') return w / LB_PER_KG;
    return w;
}

// MIRRORS: js/core/workout/active-workout-ui.js#beatBadgeFor (lines 852-871)
// — keep in sync manually
function beatBadgeFor(set, lastSet, displayUnit) {
    if (!set || !lastSet) return null;
    const curW = set.weight, curR = set.reps;
    const lastW = lastSet.weight, lastR = lastSet.reps;
    if (!curW || !curR || !lastW || !lastR) return null;
    const cw = convertWeight(curW, set.originalUnit || 'lbs', 'lbs');
    const lw = convertWeight(lastW, lastSet.originalUnit || 'lbs', 'lbs');
    const EPS = 0.6;
    if (cw > lw + EPS) {
        const now = convertWeight(curW, set.originalUnit || 'lbs', displayUnit);
        const then = convertWeight(lastW, lastSet.originalUnit || 'lbs', displayUnit);
        const dw = Math.round((now - then) * 10) / 10;
        return { label: `▲ +${dw}` };
    }
    if (Math.abs(cw - lw) <= EPS && curR > lastR) {
        const dr = curR - lastR;
        return { label: `▲ +${dr} rep${dr > 1 ? 's' : ''}` };
    }
    return null;
}

describe('beatBadgeFor', () => {
    const L = (reps, weight, unit = 'lbs') => ({ reps, weight, originalUnit: unit });

    it('flags a heavier set with the weight delta', () => {
        expect(beatBadgeFor(L(8, 140), L(8, 135), 'lbs')).toEqual({ label: '▲ +5' });
    });

    it('flags same weight for more reps', () => {
        expect(beatBadgeFor(L(10, 135), L(8, 135), 'lbs')).toEqual({ label: '▲ +2 reps' });
    });

    it('singularizes a one-rep gain', () => {
        expect(beatBadgeFor(L(9, 135), L(8, 135), 'lbs')).toEqual({ label: '▲ +1 rep' });
    });

    it('returns null for a matched set', () => {
        expect(beatBadgeFor(L(8, 135), L(8, 135), 'lbs')).toBeNull();
    });

    it('returns null when below last time (no shaming)', () => {
        expect(beatBadgeFor(L(6, 135), L(8, 135), 'lbs')).toBeNull();
        expect(beatBadgeFor(L(8, 125), L(8, 135), 'lbs')).toBeNull();
    });

    it('returns null when either set lacks reps or weight', () => {
        expect(beatBadgeFor(L(0, 135), L(8, 135), 'lbs')).toBeNull();
        expect(beatBadgeFor(L(8, 135), null, 'lbs')).toBeNull();
        expect(beatBadgeFor(L(8, 0), L(8, 135), 'lbs')).toBeNull();
    });

    it('normalizes units: 61 kg beats a 130 lb last session', () => {
        // 61 kg ~= 134.5 lb > 130 lb -> beat. Delta reported in display unit (kg).
        const res = beatBadgeFor(L(8, 61, 'kg'), L(8, 130, 'lbs'), 'kg');
        expect(res).not.toBeNull();
        expect(res.label.startsWith('▲ +')).toBe(true);
    });

    it('treats a sub-half-kg wobble as matched, not beaten', () => {
        // 135.3 vs 135 lb is within EPS -> not a weight beat; equal reps -> null.
        expect(beatBadgeFor(L(8, 135.3), L(8, 135), 'lbs')).toBeNull();
    });
});

// MIRRORS: js/core/workout/active-workout-ui.js#nextTargetFor (lines 595-609)
// — B2 overload nudge; keep in sync manually
function nextTargetFor(lastSets, displayUnit) {
    if (!Array.isArray(lastSets) || lastSets.length === 0) return null;
    let topLbs = 0, topSet = null;
    for (const s of lastSets) {
        if (!s || !s.weight || !s.reps) continue;
        if ((s.type || 'working') === 'warmup') continue;
        const lbs = convertWeight(s.weight, s.originalUnit || 'lbs', 'lbs');
        if (lbs > topLbs) { topLbs = lbs; topSet = s; }
    }
    if (!topSet) return null;
    const inc = displayUnit === 'kg' ? 2.5 : 5;
    const topDisplay = convertWeight(topSet.weight, topSet.originalUnit || 'lbs', displayUnit);
    const next = Math.round((topDisplay + inc) * 10) / 10;
    return `Beat it — try ${next} ${displayUnit}`;
}

describe('nextTargetFor (overload nudge)', () => {
    const S = (reps, weight, unit = 'lbs', type = 'working') => ({ reps, weight, originalUnit: unit, type });

    it('suggests +5 lb over the heaviest working set', () => {
        expect(nextTargetFor([S(10, 135), S(8, 135)], 'lbs')).toBe('Beat it — try 140 lbs');
    });

    it('suggests +2.5 kg in kg mode', () => {
        expect(nextTargetFor([S(5, 100, 'kg')], 'kg')).toBe('Beat it — try 102.5 kg');
    });

    it('picks the heaviest set, not the last', () => {
        expect(nextTargetFor([S(5, 185), S(10, 135)], 'lbs')).toBe('Beat it — try 190 lbs');
    });

    it('ignores warmup sets', () => {
        expect(nextTargetFor([S(5, 225, 'lbs', 'warmup'), S(8, 135)], 'lbs')).toBe('Beat it — try 140 lbs');
    });

    it('returns null when there is no usable weight', () => {
        expect(nextTargetFor([], 'lbs')).toBeNull();
        expect(nextTargetFor([S(10, 0)], 'lbs')).toBeNull();
        expect(nextTargetFor(null, 'lbs')).toBeNull();
    });
});

// Real source now (Phase 5.7.3): imported from js/core/features/progression.js.
const computeOverloadNudge = realComputeOverloadNudge;

describe('computeOverloadNudge (smart coach)', () => {
    const SS = (topWeight, topReps, maxReps = topReps) => ({ topWeight, topReps, maxReps });

    it('flags a plateau (3 sessions same weight, reps flat)', () => {
        const s = [SS(135, 8), SS(135, 8), SS(135, 8)];
        expect(computeOverloadNudge(s, 'lbs', 10))
            .toBe('Stalled at 135 lbs for 3 sessions — try 140 or a back-off set');
    });

    it('recognizes a plateau where reps are climbing', () => {
        const s = [SS(135, 10, 10), SS(135, 9, 9), SS(135, 8, 8)];
        expect(computeOverloadNudge(s, 'lbs', 12))
            .toBe('3 sessions at 135 lbs — reps are climbing, go 140 next');
    });

    it('double progression: hit the rep target → add weight', () => {
        expect(computeOverloadNudge([SS(135, 10, 10)], 'lbs', 10))
            .toBe('10 reps at 135 lbs — bump to 140');
    });

    it('consolidates after a recent weight increase', () => {
        const s = [SS(140, 6, 6), SS(135, 8, 8)];
        expect(computeOverloadNudge(s, 'lbs', 10))
            .toBe('Up from 135 — own 140 lbs for 10 reps');
    });

    it('below the rep target → chase a rep first', () => {
        const s = [SS(135, 8, 8), SS(135, 8, 8)];
        expect(computeOverloadNudge(s, 'lbs', 10))
            .toBe('Add a rep — aim 9×135 lbs toward 10');
    });

    it('falls back to a simple step with thin signal', () => {
        expect(computeOverloadNudge([SS(135, 8, 8)], 'lbs', null))
            .toBe('Beat it — try 140 lbs');
    });

    it('uses 2.5 kg increments in kg mode', () => {
        expect(computeOverloadNudge([SS(100, 5, 5)], 'kg', null))
            .toBe('Beat it — try 102.5 kg');
    });

    it('returns null for empty/no-weight history', () => {
        expect(computeOverloadNudge([], 'lbs', 10)).toBeNull();
        expect(computeOverloadNudge([SS(0, 0, 0)], 'lbs', 10)).toBeNull();
        expect(computeOverloadNudge(null, 'lbs', 10)).toBeNull();
    });
});

// Real source now (Phase 5.7.3): imported from js/core/features/progression.js.
const buildExerciseSessions = realBuildExerciseSessions;

describe('progressionTarget (5.7.3 structured recommendation)', () => {
    const SS = (topWeight, topReps, maxReps = topReps) => ({ topWeight, topReps, maxReps });

    it('bumps weight (↑) after hitting the rep target', () => {
        expect(progressionTarget([SS(135, 10, 10)], 'lbs', 10))
            .toMatchObject({ weight: 140, bumped: true, stalled: false, action: 'bump' });
    });

    it('flags a true stall — 3 flat sessions, reps not climbing', () => {
        const s = [SS(135, 8), SS(135, 8), SS(135, 8)];
        expect(progressionTarget(s, 'lbs', 10))
            .toMatchObject({ weight: 135, bumped: false, stalled: true, action: 'stalled' });
    });

    it('a plateau with climbing reps is a bump, not a stall', () => {
        const s = [SS(135, 10, 10), SS(135, 9, 9), SS(135, 8, 8)];
        expect(progressionTarget(s, 'lbs', 12))
            .toMatchObject({ weight: 140, bumped: true, stalled: false });
    });

    it('holds weight to consolidate after a recent increase', () => {
        expect(progressionTarget([SS(140, 6, 6), SS(135, 8, 8)], 'lbs', 10))
            .toMatchObject({ weight: 140, bumped: false, action: 'consolidate' });
    });

    it('chases a rep when below target', () => {
        expect(progressionTarget([SS(135, 8, 8), SS(135, 8, 8)], 'lbs', 10))
            .toMatchObject({ weight: 135, reps: 9, action: 'chase-rep' });
    });

    it('null on empty / no-weight history', () => {
        expect(progressionTarget([], 'lbs', 10)).toBeNull();
        expect(progressionTarget([SS(0, 0, 0)], 'lbs', 10)).toBeNull();
    });
});

describe('buildExerciseSessions', () => {
    const wk = (date, sets) => ({
        date, completedAt: `${date}T11:00:00Z`, cancelledAt: null,
        exercises: { exercise_0: { name: 'Bench Press', sets } },
    });
    const set = (reps, weight, type = 'working') => ({ reps, weight, originalUnit: 'lbs', type, completed: true });

    it('takes the heaviest working set per session, most-recent-first', () => {
        const workouts = [
            wk('2026-06-20', [set(10, 135), set(5, 155)]),
            wk('2026-06-27', [set(8, 145), set(3, 165)]),
        ];
        const s = buildExerciseSessions(workouts, 'Bench Press', 'lbs');
        expect(s.map(x => x.topWeight)).toEqual([165, 155]); // newest first
    });

    it('captures max reps at the top weight', () => {
        const workouts = [wk('2026-06-27', [set(3, 165), set(6, 165), set(10, 135)])];
        expect(buildExerciseSessions(workouts, 'Bench Press', 'lbs')[0]).toMatchObject({ topWeight: 165, topReps: 6, maxReps: 10 });
    });

    it('ignores warmups, other exercises, and incomplete workouts', () => {
        const workouts = [
            wk('2026-06-27', [set(5, 225, 'warmup'), set(8, 145)]),
            { date: '2026-06-26', completedAt: null, cancelledAt: null, exercises: { exercise_0: { name: 'Bench Press', sets: [set(8, 200)] } } },
            wk('2026-06-25', [set(10, 95)]),
        ];
        const filtered = { ...wk('2026-06-24', [set(8, 999)]) };
        filtered.exercises = { exercise_0: { name: 'Squat', sets: [set(8, 999)] } };
        const s = buildExerciseSessions([...workouts, filtered], 'Bench Press', 'lbs');
        expect(s.map(x => x.topWeight)).toEqual([145, 95]); // warmup 225 ignored; incomplete + Squat excluded
    });
});

// MIRRORS: js/core/ui/dashboard-ui.js#computeWeekPace (lines 330-367) — the
// lastWeekDays day-counting portion only, with an injectable `now` (the source
// reads new Date() and also accumulates volume). Keep in sync manually.
function getDateString(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function countLastWeekTrainingDaysThroughToday(allWorkouts, now) {
    if (!Array.isArray(allWorkouts)) return 0;
    const today = new Date(now);
    const dayOfWeek = today.getDay();
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - dayOfWeek);
    startOfThisWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);
    const cutoff = new Date(startOfLastWeek);
    cutoff.setDate(startOfLastWeek.getDate() + dayOfWeek);
    const startStr = getDateString(startOfLastWeek);
    const endStr = getDateString(cutoff);
    const days = new Set();
    for (const w of allWorkouts) {
        if (!w || !w.date || !w.completedAt || w.cancelledAt) continue;
        if (w.date >= startStr && w.date <= endStr) days.add(w.date);
    }
    return days.size;
}

describe('countLastWeekTrainingDaysThroughToday', () => {
    // Reference "today" = Wednesday 2026-07-01 (getDay() === 3).
    // This week starts Sun 2026-06-28. Last week: Sun 2026-06-21 .. through the
    // same weekday (Wed 2026-06-24).
    const now = '2026-07-01T10:00:00';
    const done = (date) => ({ date, completedAt: `${date}T11:00:00Z`, cancelledAt: null });

    it('counts unique completed training days in last week through today\'s weekday', () => {
        const workouts = [
            done('2026-06-21'), // last Sun — in window
            done('2026-06-24'), // last Wed — in window (cutoff day)
        ];
        expect(countLastWeekTrainingDaysThroughToday(workouts, now)).toBe(2);
    });

    it('dedups multiple workouts on the same day', () => {
        const workouts = [done('2026-06-22'), done('2026-06-22'), done('2026-06-23')];
        expect(countLastWeekTrainingDaysThroughToday(workouts, now)).toBe(2);
    });

    it('excludes days after the same weekday last week (fair partial comparison)', () => {
        const workouts = [done('2026-06-24'), done('2026-06-26')]; // Wed in, Fri out
        expect(countLastWeekTrainingDaysThroughToday(workouts, now)).toBe(1);
    });

    it('excludes this week and anything older than last week', () => {
        const workouts = [done('2026-06-29'), done('2026-06-14')]; // this week, two weeks ago
        expect(countLastWeekTrainingDaysThroughToday(workouts, now)).toBe(0);
    });

    it('ignores incomplete and cancelled workouts', () => {
        const workouts = [
            { date: '2026-06-22', completedAt: null, cancelledAt: null },
            { date: '2026-06-23', completedAt: '2026-06-23T11:00:00Z', cancelledAt: '2026-06-23T12:00:00Z' },
            done('2026-06-24'),
        ];
        expect(countLastWeekTrainingDaysThroughToday(workouts, now)).toBe(1);
    });
});

// ── Plate-aware progression (2026-07-15: "gym has no 2.5s" fix) ─────────────

describe('weightIncrement', () => {
    it('defaults to the classic jump without plate data', async () => {
        const { weightIncrement } = await import('../../js/core/features/progression.js');
        expect(weightIncrement('lbs', null)).toBe(5);
        expect(weightIncrement('lbs', [])).toBe(5);
        expect(weightIncrement('kg', undefined)).toBe(2.5);
    });

    it('derives 2× the smallest plate — no 2.5s means 10 lb jumps', async () => {
        const { weightIncrement } = await import('../../js/core/features/progression.js');
        expect(weightIncrement('lbs', [45, 35, 25, 10, 5])).toBe(10);
        expect(weightIncrement('lbs', [45, 35, 25, 10, 5, 2.5])).toBe(5);
        expect(weightIncrement('kg', [20, 15, 10, 5, 2.5])).toBe(5);
    });

    it('never shrinks below the classic jump (microplates)', async () => {
        const { weightIncrement } = await import('../../js/core/features/progression.js');
        expect(weightIncrement('lbs', [45, 25, 10, 5, 2.5, 1.25])).toBe(5);
        expect(weightIncrement('kg', [20, 10, 5, 2.5, 1.25, 0.5])).toBe(2.5);
    });
});

describe('scaleLoadableWeight', () => {
    it('snaps the CHANGE to whole steps so results stay bar-loadable', async () => {
        const { scaleLoadableWeight } = await import('../../js/core/features/progression.js');
        // 135 deloaded -40% with 10 lb jumps: 81 → snap change to -50 → 85
        // (85 = 135 - 5×10, same ladder the bar was on; 80 would NOT be).
        expect(scaleLoadableWeight(135, 0.6, 10)).toBe(85);
        // Heavy +5% on 225 with 10 lb jumps: 236.25 → +10 → 235.
        expect(scaleLoadableWeight(225, 1.05, 10)).toBe(235);
    });

    it('keeps the weight when the scaled change rounds to zero or below zero', async () => {
        const { scaleLoadableWeight } = await import('../../js/core/features/progression.js');
        expect(scaleLoadableWeight(5, 0.6, 10)).toBe(5);   // -2 rounds to 0 steps
        expect(scaleLoadableWeight(15, 0.1, 100)).toBe(15); // absurd step → no change below zero guard
    });
});

describe('plate-aware increments flow through the nudge and target', () => {
    const ramp = [
        { date: '2026-07-10', topWeight: 175, topReps: 10, maxReps: 10 },
        { date: '2026-07-07', topWeight: 175, topReps: 8, maxReps: 8 },
    ];

    it('computeOverloadNudge suggests +10 when passed the coarser increment', async () => {
        const { computeOverloadNudge } = await import('../../js/core/features/progression.js');
        expect(computeOverloadNudge(ramp, 'lbs', 10, 10)).toContain('185');
        expect(computeOverloadNudge(ramp, 'lbs', 10)).toContain('180'); // default 5 unchanged
    });

    it('progressionTarget bumps by the passed increment', async () => {
        const { progressionTarget } = await import('../../js/core/features/progression.js');
        expect(progressionTarget(ramp, 'lbs', 10, 10)).toMatchObject({ weight: 185, bumped: true });
        expect(progressionTarget(ramp, 'lbs', 10)).toMatchObject({ weight: 180, bumped: true });
    });
});
