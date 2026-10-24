// Tests for js/core/features/session-intent.js (AP-6) — the single answer to
// "what is today's session for?" that seeds, nudges and insights all read.
// Real (pure) module.

import { describe, it, expect } from 'vitest';
import {
    getSessionIntent,
    isRecoveryWorkout,
    describeIntent,
    isManualDeloadActive,
    manualDeloadEnd,
    sessionOnlyDeloadIntent,
    MANUAL_DELOAD_WEIGHT_PCT,
} from '../../js/core/features/session-intent.js';

// Shaped like Kevin's real block (coach-periodization-plan Appendix A):
// starts Mon 2026-09-21, week 5 intensify, week 6 deload (10/26 → 11/1).
const program = {
    id: 'program_1', name: 'Fall block', goal: 'hypertrophy', weeks: 6, startDate: '2026-09-21',
    weekTargets: [
        { week: 2, label: 'accumulate', setDelta: 1 },
        { week: 4, label: 'baseline-ish', note: 'no levers' },
        { week: 5, label: 'Heavy', weightPct: 5, rpeTarget: 9 },
        { week: 6, label: 'Deload', setDelta: -2, repRange: [12, 15], rpeTarget: 6, weightPct: -35 },
    ],
};

describe('getSessionIntent — program', () => {
    it('a deload week is a deload, with every lever', () => {
        const i = getSessionIntent({ program, today: '2026-10-26' });
        expect(i).toMatchObject({
            mode: 'deload', weightPct: -35, setDelta: -2, repRange: [12, 15], rpeTarget: 6,
            label: 'Deload', week: 6, weeks: 6, source: 'program',
        });
        expect(i.reason).toContain('Week 6');
    });

    it('a +% / RPE 9 week is a peak', () => {
        expect(getSessionIntent({ program, today: '2026-10-23' })).toMatchObject({ mode: 'peak', weightPct: 5, source: 'program' });
    });

    it('a volume-only week is still a build week from the program', () => {
        expect(getSessionIntent({ program, today: '2026-09-29' })).toMatchObject({ mode: 'build', setDelta: 1, source: 'program' });
    });

    it('a week with no levers, no target, or a finished block is plain build', () => {
        expect(getSessionIntent({ program, today: '2026-10-13' })).toMatchObject({ mode: 'build', source: 'none' });
        expect(getSessionIntent({ program, today: '2026-10-06' })).toMatchObject({ mode: 'build', source: 'none' });
        expect(getSessionIntent({ program, today: '2026-11-03' })).toMatchObject({ mode: 'build', source: 'none' });
        expect(getSessionIntent({ program: { ...program, active: false }, today: '2026-10-26' }).mode).toBe('build');
    });

    it('knows the week at every trust level', () => {
        expect(getSessionIntent({ program: { ...program, trustLevel: 'propose' }, today: '2026-10-26' }).mode).toBe('deload');
    });
});

describe('getSessionIntent — manual and legacy', () => {
    const manual = { from: '2026-10-20', weeks: 1, weightPct: -30 };

    it('a manual window deloads inside it and expires after', () => {
        expect(getSessionIntent({ today: '2026-10-20', manualDeload: manual })).toMatchObject({ mode: 'deload', weightPct: -30, source: 'manual' });
        expect(getSessionIntent({ today: '2026-10-26', manualDeload: manual }).mode).toBe('deload');
        expect(getSessionIntent({ today: '2026-10-27', manualDeload: manual }).mode).toBe('build');
        expect(getSessionIntent({ today: '2026-10-19', manualDeload: manual }).mode).toBe('build');
    });

    it('defaults the manual cut when none is stored', () => {
        expect(getSessionIntent({ today: '2026-10-20', manualDeload: { from: '2026-10-20', weeks: 1 } }).weightPct).toBe(MANUAL_DELOAD_WEIGHT_PCT);
    });

    it('precedence: a program week that changes the session beats a manual window', () => {
        const i = getSessionIntent({ program, today: '2026-10-23', manualDeload: manual });
        expect(i).toMatchObject({ mode: 'peak', source: 'program' });
        // A baseline program week lets the manual deload through.
        expect(getSessionIntent({ program, today: '2026-10-14', manualDeload: { from: '2026-10-12', weeks: 1 } }))
            .toMatchObject({ mode: 'deload', source: 'manual' });
    });

    it('a legacy deload label is a deload that scales nothing again', () => {
        expect(getSessionIntent({ today: '2026-10-23', sessionLabel: 'deload' })).toMatchObject({ mode: 'deload', weightPct: null, source: 'label' });
    });

    it('freestyle when nothing else applies', () => {
        expect(getSessionIntent({ today: '2026-10-23', freestyle: true })).toMatchObject({ mode: 'freestyle', source: 'none' });
        expect(getSessionIntent({ today: '2026-10-23' }).mode).toBe('build');
    });

    it('manual window helpers', () => {
        expect(manualDeloadEnd({ from: '2026-10-20', weeks: 1 })).toBe('2026-10-26');
        expect(manualDeloadEnd({ from: '2026-10-20', weeks: 2 })).toBe('2026-11-02');
        expect(manualDeloadEnd(null)).toBeNull();
        expect(isManualDeloadActive(null, '2026-10-20')).toBe(false);
    });
});

describe('isRecoveryWorkout / describeIntent / sessionOnlyDeloadIntent', () => {
    it('recognises intent and legacy labels', () => {
        expect(isRecoveryWorkout({ sessionIntent: { mode: 'deload' } })).toBe(true);
        expect(isRecoveryWorkout({ sessionLabel: 'Recovery week' })).toBe(true);
        expect(isRecoveryWorkout({ sessionLabel: 'Heavy' })).toBe(false);
        expect(isRecoveryWorkout(null)).toBe(false);
    });

    it('describes only non-build sessions', () => {
        expect(describeIntent(getSessionIntent({ program, today: '2026-10-26' }))).toBe('Deload · -35% weight · -2 sets · 12–15 reps · RPE 6');
        expect(describeIntent(getSessionIntent({ today: '2026-10-23' }))).toBe('');
    });

    it('session-only deload is a manual deload at the default cut', () => {
        expect(sessionOnlyDeloadIntent()).toMatchObject({ mode: 'deload', source: 'manual', weightPct: MANUAL_DELOAD_WEIGHT_PCT, label: 'Deload' });
    });
});
