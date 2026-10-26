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
            label: 'Lighter week', programLabel: 'Deload', week: 6, weeks: 6, source: 'program',
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

    it('precedence (AP-23b): an explicit week override beats the program week for its window', () => {
        expect(getSessionIntent({ program, today: '2026-10-23', manualDeload: manual }))
            .toMatchObject({ mode: 'deload', source: 'manual' });
        // Outside the window the program's week is back in charge.
        expect(getSessionIntent({ program, today: '2026-10-23', manualDeload: { from: '2026-09-01', weeks: 1 } }))
            .toMatchObject({ mode: 'peak', source: 'program' });
    });

    it('week overrides (AP-23b): a small cut is a lighter week through the deload engine; volume-only is build', () => {
        const lighter = getSessionIntent({ today: '2026-10-23', manualDeload: { from: '2026-10-20', weeks: 1, weightPct: -10, reason: 'last week was hard' } });
        expect(lighter).toMatchObject({ mode: 'deload', weightPct: -10, label: 'Lighter week', source: 'manual' });
        expect(lighter.reason).toBe('Lighter week through 2026-10-26 — last week was hard');
        expect(getSessionIntent({ today: '2026-10-23', manualDeload: { from: '2026-10-20', weeks: 1, setDelta: 1 } }))
            .toMatchObject({ mode: 'build', setDelta: 1, weightPct: null, label: 'Adjusted week' });
        expect(getSessionIntent({ today: '2026-10-23', manualDeload: { from: '2026-10-20', weeks: 1, weightPct: -30 } }).label).toBe('Lighter week');
    });

    it('weekOverrideOf reads the new field, falling back to the AP-10 one', async () => {
        const { weekOverrideOf } = await import('../../js/core/features/session-intent.js');
        expect(weekOverrideOf({ weekOverride: { from: 'a' }, manualDeload: { from: 'b' } })).toEqual({ from: 'a' });
        expect(weekOverrideOf({ manualDeload: { from: 'b' } })).toEqual({ from: 'b' });
        expect(weekOverrideOf(null)).toBeNull();
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
        expect(describeIntent(getSessionIntent({ program, today: '2026-10-26' }))).toBe('Lighter week · -35% weight · -2 sets · 12–15 reps · effort 6/10');
        expect(describeIntent(getSessionIntent({ today: '2026-10-23' }))).toBe('');
    });

    it('session-only deload is a manual deload at the default cut', () => {
        expect(sessionOnlyDeloadIntent()).toMatchObject({ mode: 'deload', source: 'manual', weightPct: MANUAL_DELOAD_WEIGHT_PCT, label: 'Lighter session' });
    });
});
