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

// --- mirror of nextTargetFor (active-workout-ui.js) — B2 overload nudge ---
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

// --- mirror of computeOverloadNudge (active-workout-ui.js) — smart B2 coach ---
function computeOverloadNudge(sessions, displayUnit, repTarget) {
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    const cur = sessions[0];
    const W = cur.topWeight;
    if (!W) return null;
    const inc = displayUnit === 'kg' ? 2.5 : 5;
    const next = Math.round((W + inc) * 10) / 10;
    const rt = repTarget && repTarget > 0 ? repTarget : null;
    const R = cur.topReps || cur.maxReps || 0;
    if (sessions.length >= 3 && sessions[1].topWeight === W && sessions[2].topWeight === W) {
        const repsClimbing = (sessions[0].maxReps || 0) > (sessions[2].maxReps || 0);
        return repsClimbing
            ? `3 sessions at ${W} ${displayUnit} — reps are climbing, go ${next} next`
            : `Stalled at ${W} ${displayUnit} for 3 sessions — try ${next} or a back-off set`;
    }
    if (rt && R >= rt) return `${R} reps at ${W} ${displayUnit} — bump to ${next}`;
    if (sessions.length >= 2 && W > sessions[1].topWeight) {
        return `Up from ${sessions[1].topWeight} — own ${W} ${displayUnit} for ${rt || R || 'your'} reps`;
    }
    if (rt && R > 0 && R < rt) return `Add a rep — aim ${R + 1}×${W} ${displayUnit} toward ${rt}`;
    return `Beat it — try ${next} ${displayUnit}`;
}

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

// --- mirror of buildExerciseSessions (active-workout-ui.js) ---
function buildExerciseSessions(allWorkouts, exName, displayUnit) {
    if (!Array.isArray(allWorkouts) || !exName) return [];
    const sessions = [];
    for (const w of allWorkouts) {
        if (!w || !w.exercises || !w.date || !w.completedAt || w.cancelledAt) continue;
        for (const [k, ex] of Object.entries(w.exercises)) {
            const name = w.exerciseNames?.[k] || ex?.name || ex?.machine;
            if (name !== exName) continue;
            const working = (ex.sets || []).filter(s =>
                s && s.completed !== false && s.weight && (s.type || 'working') !== 'warmup');
            if (working.length === 0) break;
            let topWeight = 0;
            for (const s of working) topWeight = Math.max(topWeight, convertWeight(s.weight, s.originalUnit || 'lbs', displayUnit));
            topWeight = Math.round(topWeight * 10) / 10;
            let topReps = 0, maxReps = 0;
            for (const s of working) {
                maxReps = Math.max(maxReps, s.reps || 0);
                const w2 = Math.round(convertWeight(s.weight, s.originalUnit || 'lbs', displayUnit) * 10) / 10;
                if (w2 === topWeight) topReps = Math.max(topReps, s.reps || 0);
            }
            sessions.push({ date: w.date, topWeight, topReps, maxReps });
            break;
        }
    }
    sessions.sort((a, b) => b.date.localeCompare(a.date));
    return sessions;
}

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
