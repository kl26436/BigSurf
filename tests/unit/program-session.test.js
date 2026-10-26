// Program sessions (Phase 9, trust rung 2) — the pure selector that decides
// whether today's dashboard hero pre-builds a program-adjusted session.

import { describe, it, expect, vi } from 'vitest';

// program-session.js pulls data-manager/ui-helpers (Firebase/DOM at import) —
// mock the edges per repo convention; the selector under test is pure.
vi.mock('../../js/core/data/data-manager.js', () => ({
    debouncedSaveWorkoutData: vi.fn(),
    loadAllWorkouts: vi.fn(async () => []),
}));
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
}));

import {
    programSessionForToday, programSessionMeta,
    programNoticeForToday, programCompletionForToday,
    programHeartbeat, programBlockStats, trailingWeekLight,
    applySetDeltaToExercise, clampRepsToRange,
} from '../../js/core/features/program-session.js';

describe('CP-3 — week targets beyond weightPct', () => {
    const richProgram = (trustLevel = 'auto_confirm') => ({
        id: 'program_2', name: 'Shaped block', goal: 'hypertrophy', weeks: 6, startDate: '2026-09-21',
        trustLevel,
        weekTargets: [
            { week: 2, label: 'accumulate', setDelta: 1 },
            { week: 3, label: 'accumulate', repRange: [8, 10], rpeTarget: 8 },
            { week: 6, label: 'deload', setDelta: -2, repRange: [12, 15], rpeTarget: 6, weightPct: -35 },
        ],
    });

    it('a volume-only week pre-builds in auto-confirm and notices in propose (Bug 8)', () => {
        expect(programSessionForToday(richProgram(), '2026-09-29')).toMatchObject({ label: 'Build week', setDelta: 1, weightPct: null, week: 2 });
        expect(programNoticeForToday(richProgram('propose'), '2026-09-29')).toMatchObject({ label: 'Build week', setDelta: 1, week: 2, weeks: 6 });
        expect(programSessionForToday(richProgram(), '2026-10-06')).toMatchObject({ repRange: [8, 10], rpeTarget: 8, week: 3 });
    });

    it('meta line describes every lever in one honest string', () => {
        const s = programSessionForToday(richProgram(), '2026-10-26');
        expect(programSessionMeta(s)).toBe('Lighter week · -35% weight · -2 sets · 12–15 reps · effort 6/10 · week 6 of your plan');
        expect(programSessionMeta(programSessionForToday(richProgram(), '2026-09-29'))).toBe('Build week · +1 set · week 2 of your plan');
    });

    it('applySetDeltaToExercise adds copies of the last row and trims uncompleted rows from the end', () => {
        const ex = { machine: 'Leg Press', sets: 3 };
        const saved = { sets: [
            { weight: 400, reps: 10, completed: true, originalUnit: 'lbs' },
            { weight: 420, reps: 8, completed: false, originalUnit: 'lbs' },
        ] };
        applySetDeltaToExercise(ex, saved, 2);
        expect(ex.sets).toBe(5);
        expect(saved.sets).toHaveLength(4);
        expect(saved.sets[3]).toMatchObject({ weight: 420, reps: 8, completed: false, originalUnit: 'lbs' });

        applySetDeltaToExercise(ex, saved, -3);
        expect(ex.sets).toBe(2);
        // Completed row is never removed; floor is one row.
        expect(saved.sets).toEqual([{ weight: 400, reps: 10, completed: true, originalUnit: 'lbs' }]);
    });

    it('clampRepsToRange moves template defaults and open rows into the band, leaves done/edited rows alone', () => {
        const ex = { machine: 'Pec Deck', defaultReps: 15 };
        const saved = { sets: [
            { reps: 15, completed: true },
            { reps: 15, _userEdited: true },
            { reps: 15 },
            { reps: 5 },
        ] };
        clampRepsToRange(ex, saved, [8, 12]);
        expect(ex.defaultReps).toBe(12);
        expect(saved.sets.map(s => s.reps)).toEqual([15, 15, 12, 8]);
    });
});

const program = (overrides = {}) => ({
    id: 'program_1', name: 'Strength block', goal: 'strength',
    weeks: 4, startDate: '2026-06-29', // Monday of week 1
    trustLevel: 'auto_confirm',
    weekTargets: [
        { week: 2, label: 'Heavy', weightPct: 5 },
        { week: 3, label: 'Volume', weightPct: 0, note: 'extra set everywhere' },
        { week: 4, label: 'Deload', weightPct: -40 },
    ],
    ...overrides,
});

describe('programSessionForToday', () => {
    it('pre-builds only in auto_confirm weeks that change the session', () => {
        // Week 2 (heavy, +5%) → session.
        expect(programSessionForToday(program(), '2026-07-07'))
            .toMatchObject({ label: 'Push week', weightPct: 5, week: 2 });
        // Week 4 (deload) → session.
        expect(programSessionForToday(program(), '2026-07-21'))
            .toMatchObject({ label: 'Lighter week', weightPct: -40, week: 4 });
    });

    it('propose-only trust never pre-builds — cards stay the only path', () => {
        expect(programSessionForToday(program({ trustLevel: 'propose' }), '2026-07-07')).toBeNull();
        expect(programSessionForToday(program({ trustLevel: undefined }), '2026-07-07')).toBeNull();
    });

    it('baseline weeks (no target / 0% target) start like any normal day', () => {
        expect(programSessionForToday(program(), '2026-06-30')).toBeNull();   // week 1: no target
        expect(programSessionForToday(program(), '2026-07-14')).toBeNull();   // week 3: weightPct 0
    });

    it('finished or not-started programs never pre-build', () => {
        expect(programSessionForToday(program(), '2026-08-04')).toBeNull();   // past week 4
        expect(programSessionForToday(program({ startDate: '2026-08-10' }), '2026-07-07')).toBeNull();
        expect(programSessionForToday(null, '2026-07-07')).toBeNull();
    });
});

describe('programSessionMeta', () => {
    it('reads as one honest meta line', () => {
        const meta = programSessionMeta({ label: 'Lighter week', weightPct: -40, week: 4 });
        expect(meta).toBe('Lighter week · -40% weight · week 4 of your plan');
        expect(programSessionMeta(null)).toBe('');
    });
});

describe('programNoticeForToday', () => {
    it('surfaces adjustment weeks regardless of trust level', () => {
        // The whole point: propose-only users get the notice auto_confirm
        // users get as a pre-built session.
        expect(programNoticeForToday(program({ trustLevel: 'propose' }), '2026-07-21'))
            .toMatchObject({ label: 'Lighter week', weightPct: -40, week: 4, weeks: 4 });
        expect(programNoticeForToday(program(), '2026-07-07'))
            .toMatchObject({ label: 'Push week', weightPct: 5, week: 2 });
    });

    it('stays silent on baseline weeks and outside the program', () => {
        expect(programNoticeForToday(program({ trustLevel: 'propose' }), '2026-06-30')).toBeNull(); // week 1: no target
        expect(programNoticeForToday(program({ trustLevel: 'propose' }), '2026-07-14')).toBeNull(); // week 3: 0%
        expect(programNoticeForToday(program({ trustLevel: 'propose' }), '2026-08-04')).toBeNull(); // finished
        expect(programNoticeForToday(null, '2026-07-07')).toBeNull();
    });
});

describe('programCompletionForToday', () => {
    it('signals an active program past its last week', () => {
        expect(programCompletionForToday(program(), '2026-07-27'))
            .toMatchObject({ id: 'program_1', name: 'Strength block', weeks: 4 });
    });

    it('never signals mid-program, pre-start, or already-retired programs', () => {
        expect(programCompletionForToday(program(), '2026-07-21')).toBeNull();  // week 4: still running
        // startDate in the future → week < 1: "not started", not "done".
        expect(programCompletionForToday(program({ startDate: '2026-08-10' }), '2026-07-07')).toBeNull();
        expect(programCompletionForToday(program({ active: false }), '2026-07-27')).toBeNull();
        expect(programCompletionForToday(null, '2026-07-27')).toBeNull();
    });
});

describe('programHeartbeat', () => {
    it('beats on every ongoing week, baseline included', () => {
        expect(programHeartbeat(program(), '2026-06-30'))   // week 1 (baseline)
            .toMatchObject({ name: 'Strength block', week: 1, weeks: 4 });
        expect(programHeartbeat(program(), '2026-07-21'))   // week 4 (deload)
            .toMatchObject({ week: 4, weeks: 4 });
    });

    it('goes quiet once finished, before start, or retired', () => {
        expect(programHeartbeat(program(), '2026-08-04')).toBeNull();                       // past week 4
        expect(programHeartbeat(program({ startDate: '2026-08-10' }), '2026-07-07')).toBeNull(); // not started
        expect(programHeartbeat(program({ active: false }), '2026-07-07')).toBeNull();
        expect(programHeartbeat(null, '2026-07-07')).toBeNull();
    });

    it('never emits NaN when today is unparseable (renders "week NaN" otherwise)', () => {
        // getDateString() with no arg returns '' → deriveProgramWeek → NaN.
        // The guard must hide the chip, not surface "week NaN of N".
        expect(programHeartbeat(program(), '')).toBeNull();
        expect(programHeartbeat(program(), undefined)).toBeNull();
    });
});

describe('programBlockStats', () => {
    const split = { mon: 't1', tue: null, wed: 't2', thu: null, fri: 't3', sat: 'rest', sun: null };
    const workouts = [
        { date: '2026-06-30', completedAt: 'x' },
        { date: '2026-07-03', completedAt: 'x' },
        { date: '2026-07-03', completedAt: 'x' },   // same day → one training day
        { date: '2026-07-20', completedAt: 'x' },
        { date: '2026-07-10', completedAt: 'x', cancelledAt: 'x' }, // cancelled → skip
        { date: '2026-08-15', completedAt: 'x' },   // after block → skip
    ];
    const prs = [{ date: '2026-07-01' }, { date: '2026-05-01' }]; // one inside the block

    it('counts unique training days, planned days from the split, and in-block PRs', () => {
        // Block window 2026-06-29 .. 2026-07-26; per-week planned = 3 (t1/t2/t3), × 4 weeks.
        expect(programBlockStats(program({ split }), workouts, prs, '2026-07-27'))
            .toEqual({ daysTrained: 3, planned: 12, prCount: 1, weeks: 4 });
    });

    it('never counts the future when the block is still running', () => {
        // today mid-block → cap at today, so 2026-07-20 hasn't happened yet.
        expect(programBlockStats(program({ split }), workouts, prs, '2026-07-05').daysTrained).toBe(2);
    });

    it('returns null without a start date', () => {
        expect(programBlockStats(null, workouts, prs, '2026-07-27')).toBeNull();
    });
});

describe('trailingWeekLight', () => {
    const plan = { days: { mon: 't1', tue: 't2', wed: 't3', thu: 't4', fri: 't5', sat: 't6', sun: null } };
    const only3 = [
        { date: '2026-07-02', completedAt: 'x' },
        { date: '2026-07-04', completedAt: 'x' },
        { date: '2026-07-06', completedAt: 'x' },
        { date: '2026-06-20', completedAt: 'x' }, // outside trailing 7 days
    ];

    it('flags a light week (2+ planned days missed)', () => {
        // 6 planned, trained 3 in the trailing 7 days → 3 missed → light.
        expect(trailingWeekLight(plan, only3, '2026-07-07'))
            .toEqual({ planned: 6, trained: 3, light: true });
    });

    it('does not flag a nearly-complete week', () => {
        const five = ['2026-07-01', '2026-07-02', '2026-07-04', '2026-07-05', '2026-07-06']
            .map(date => ({ date, completedAt: 'x' }));
        expect(trailingWeekLight(plan, five, '2026-07-07')).toEqual({ planned: 6, trained: 5, light: false });
    });

    it('returns null when nothing is planned', () => {
        expect(trailingWeekLight({ days: {} }, only3, '2026-07-07')).toBeNull();
    });
});

describe('scaleSessionSetTargets', () => {
    // Mutates AppState.savedData — import the real singleton and stage it.
    const stage = async (exercises) => {
        const { AppState } = await import('../../js/core/utils/app-state.js');
        AppState.globalUnit = 'lbs';
        AppState.savedData = { exercises };
        return AppState;
    };

    it('scales uncompleted autofilled targets, plate-rounded, and drops the ↑ hint', async () => {
        const { scaleSessionSetTargets } = await import('../../js/core/features/program-session.js');
        const app = await stage({
            exercise_0: { sets: [
                { weight: 135, reps: 10, completed: false, originalUnit: 'lbs', _suggested: true },
                { weight: 145, reps: 8, completed: false, originalUnit: 'lbs' },
            ] },
        });
        scaleSessionSetTargets(0.6); // deload -40%
        const sets = app.savedData.exercises.exercise_0.sets;
        expect(sets[0].weight).toBe(80);  // 81 → nearest 5
        expect(sets[0]._suggested).toBeUndefined();
        expect(sets[1].weight).toBe(85);  // 87 → nearest 5
    });

    it('never touches completed or user-edited sets, and floors at one plate step', async () => {
        const { scaleSessionSetTargets } = await import('../../js/core/features/program-session.js');
        const app = await stage({
            exercise_0: { sets: [
                { weight: 225, reps: 5, completed: true, originalUnit: 'lbs' },
                { weight: 200, reps: 5, completed: false, originalUnit: 'lbs', _userEdited: true },
                { weight: 5, reps: 12, completed: false, originalUnit: 'lbs' },
                { weight: null, reps: 12, completed: false },
            ] },
        });
        scaleSessionSetTargets(0.6);
        const sets = app.savedData.exercises.exercise_0.sets;
        expect(sets[0].weight).toBe(225); // completed — untouched
        expect(sets[1].weight).toBe(200); // user-edited — untouched
        expect(sets[2].weight).toBe(5);   // floors at the plate step, never 0
        expect(sets[3].weight).toBeNull();
    });

    it('rounds kg sets on the 2.5 kg ladder by their own unit', async () => {
        const { scaleSessionSetTargets } = await import('../../js/core/features/program-session.js');
        const app = await stage({
            exercise_0: { sets: [{ weight: 60, reps: 8, completed: false, originalUnit: 'kg' }] },
        });
        scaleSessionSetTargets(0.6); // 36 → 35 on the 2.5 ladder? 36/2.5=14.4 → 14 → 35
        expect(app.savedData.exercises.exercise_0.sets[0].weight).toBe(35);
    });
});
