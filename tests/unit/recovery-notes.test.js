// AU-10(a) — a light session is read from notes, with the load as the
// tie-breaker: one "deload" note alone never drops a normal-load session.

import { describe, it, expect } from 'vitest';
import { isRecoveryWorkout, recoveryNotes, RECOVERY_NOTE } from '../../js/core/features/session-intent.js';
import { buildExerciseSessions } from '../../js/core/features/progression.js';

const set = (weight, reps) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true });
const wo = (date, weight, reps, { note, workoutNotes, extraNotes = 0 } = {}) => ({
    date, completedAt: `${date}T18:00:00Z`,
    exerciseNames: { exercise_0: 'Bench', exercise_1: 'Row', exercise_2: 'Curl' },
    exercises: {
        exercise_0: { sets: [set(weight, reps)], ...(note ? { notes: note } : {}) },
        exercise_1: { sets: [set(100, 10)], ...(extraNotes > 0 ? { notes: 'deload' } : {}) },
        exercise_2: { sets: [set(40, 10)] },
    },
    ...(workoutNotes ? { workoutNotes } : {}),
});
const history = [wo('2026-10-05', 185, 8), wo('2026-10-12', 185, 8)];

describe('recovery from notes (AU-10(a))', () => {
    it('matches the ways people write it, not ordinary words', () => {
        for (const t of ['Dead load week', 'deload', 'de-load day', 'recovery session', 'light week', 'Light day today']) expect(RECOVERY_NOTE.test(t), t).toBe(true);
        for (const t of ['felt light', 'loaded the bar', 'recovered fine between sets']) expect(RECOVERY_NOTE.test(t), t).toBe(false);
    });

    it('the workout note, or two exercise notes, make the whole workout a recovery session', () => {
        expect(isRecoveryWorkout(wo('2026-10-19', 185, 8, { workoutNotes: 'Deload week — easy' }))).toBe(true);
        expect(isRecoveryWorkout(wo('2026-10-19', 185, 8, { note: 'dead load week', extraNotes: 1 }))).toBe(true);
        expect(isRecoveryWorkout(wo('2026-10-19', 185, 8, { note: 'dead load week' }))).toBe(false);
        expect(recoveryNotes(wo('2026-10-19', 185, 8, { note: 'dead load week' }))).toEqual({ workout: false, exercises: 1, any: true });
    });

    it('one note + a light top set (< 85% of the 4-week best) → dropped for that lift, and reported', () => {
        const s = buildExerciseSessions([...history, wo('2026-10-19', 120, 8, { note: 'Dead load week' })], 'Bench', 'lbs');
        expect(s.map(x => x.date)).toEqual(['2026-10-12', '2026-10-05']);
        expect(s.lightSkipped).toEqual([{ date: '2026-10-19', reason: 'notes + load' }]);
    });

    it('one note on a normal-load day ("next week is deload") moves nothing', () => {
        const s = buildExerciseSessions([...history, wo('2026-10-19', 185, 8, { note: 'next week is deload' })], 'Bench', 'lbs');
        expect(s[0]).toMatchObject({ date: '2026-10-19', topWeight: 185 });
        expect(s.lightSkipped).toBeUndefined();
    });

    it('a −10% noted session stays (a bad day, not a deload)', () => {
        const s = buildExerciseSessions([...history, wo('2026-10-19', 165, 8, { note: 'light day' })], 'Bench', 'lbs');
        expect(s[0].date).toBe('2026-10-19');
    });

    it('excludeRecovery:false keeps everything', () => {
        const s = buildExerciseSessions([...history, wo('2026-10-19', 120, 8, { note: 'deload' })], 'Bench', 'lbs', { excludeRecovery: false });
        expect(s).toHaveLength(3);
    });
});
