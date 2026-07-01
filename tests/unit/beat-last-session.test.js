// Tests for Track B progress signals:
//  - beatBadgeFor: "beat last time" set-row badge (active-workout-ui.js)
//  - countLastWeekTrainingDaysThroughToday: dashboard week-over-week pace
// Both are pure functions re-implemented here for isolation (no DOM/Firebase),
// mirroring the shipped logic.

import { describe, it, expect } from 'vitest';

// --- mirror of convertWeight (ui-helpers.js) for lbs<->kg ---
const LB_PER_KG = 2.20462;
function convertWeight(w, from, to) {
    if (from === to) return w;
    if (from === 'kg' && to === 'lbs') return w * LB_PER_KG;
    if (from === 'lbs' && to === 'kg') return w / LB_PER_KG;
    return w;
}

// --- mirror of beatBadgeFor (active-workout-ui.js) ---
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

// --- mirror of countLastWeekTrainingDaysThroughToday (dashboard-ui.js) ---
// with an injectable `now` so the window math is deterministic in tests.
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
