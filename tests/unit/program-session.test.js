// Program sessions (Phase 9, trust rung 2) — the pure selector that decides
// whether today's dashboard hero pre-builds a program-adjusted session.

import { describe, it, expect, vi } from 'vitest';

// program-session.js pulls data-manager/ui-helpers (Firebase/DOM at import) —
// mock the edges per repo convention; the selector under test is pure.
vi.mock('../../js/core/data/data-manager.js', () => ({
    debouncedSaveWorkoutData: vi.fn(),
}));
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
}));

import {
    programSessionForToday, programSessionMeta,
    programNoticeForToday, programCompletionForToday,
} from '../../js/core/features/program-session.js';

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
            .toMatchObject({ label: 'Heavy', weightPct: 5, week: 2 });
        // Week 4 (deload) → session.
        expect(programSessionForToday(program(), '2026-07-21'))
            .toMatchObject({ label: 'Deload', weightPct: -40, week: 4 });
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
        const meta = programSessionMeta({ label: 'Deload', weightPct: -40, week: 4 });
        expect(meta).toBe('Deload · -40% weight · week 4 of your program');
        expect(programSessionMeta(null)).toBe('');
    });
});

describe('programNoticeForToday', () => {
    it('surfaces adjustment weeks regardless of trust level', () => {
        // The whole point: propose-only users get the notice auto_confirm
        // users get as a pre-built session.
        expect(programNoticeForToday(program({ trustLevel: 'propose' }), '2026-07-21'))
            .toMatchObject({ label: 'Deload', weightPct: -40, week: 4, weeks: 4 });
        expect(programNoticeForToday(program(), '2026-07-07'))
            .toMatchObject({ label: 'Heavy', weightPct: 5, week: 2 });
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
