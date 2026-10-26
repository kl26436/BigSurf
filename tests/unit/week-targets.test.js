// CP-3 — week targets: normalization, effects, deload detection, description.

import { describe, it, expect } from 'vitest';
import {
    normalizeWeekTarget, weekTargetEffects, isDeloadTarget, describeWeekTarget,
} from '../../js/core/features/week-targets.js';

describe('normalizeWeekTarget', () => {
    it('requires week within the program and a label', () => {
        expect(normalizeWeekTarget({ week: 7, label: 'x' }, 6).ok).toBe(false);
        expect(normalizeWeekTarget({ week: 2 }, 6).ok).toBe(false);
        expect(normalizeWeekTarget({ week: 2, label: 'accumulate' }, 6)).toEqual({ ok: true, target: { week: 2, label: 'accumulate' } });
    });

    it('keeps every valid lever; an out-of-range lever is an error, never silently dropped (AP-18)', () => {
        const { target } = normalizeWeekTarget({
            week: 6, label: 'deload', weightPct: -35.4, setDelta: '-2', repRange: ['12', 15], rpeTarget: 6.2, note: 'easy', bogus: 1,
        }, 6);
        expect(target).toEqual({ week: 6, label: 'deload', weightPct: -35, setDelta: -2, repRange: [12, 15], rpeTarget: 6, note: 'easy' });
        expect(normalizeWeekTarget({ week: 1, label: 'x', setDelta: 4 }, 6).error).toBe('week 1: setDelta must be a whole number from -3 to +3 (got 4)');
        expect(normalizeWeekTarget({ week: 1, label: 'x', repRange: [12, 8] }, 6).error).toMatch(/^week 1: repRange must be \[low, high\]/);
        expect(normalizeWeekTarget({ week: 1, label: 'x', rpeTarget: 11 }, 6).error).toBe('week 1: rpeTarget must be 6-10 (got 11)');
        expect(normalizeWeekTarget({ week: 1, label: 'x', weightPct: -95 }, 6).error).toBe('week 1: weightPct must be a number from -90 to 100 (got -95)');
        expect(normalizeWeekTarget({ week: 9, label: 'x' }, 6).error).toMatch(/needs week \(1-6\)/);
    });

    it('a zero setDelta is a no-op, not a lever', () => {
        expect(normalizeWeekTarget({ week: 1, label: 'x', setDelta: 0 }, 6).target).toEqual({ week: 1, label: 'x' });
    });
});

describe('weekTargetEffects / isDeloadTarget', () => {
    it('changesSession is true for any non-zero lever', () => {
        expect(weekTargetEffects({ week: 1, label: 'base' }).changesSession).toBe(false);
        expect(weekTargetEffects({ week: 1, label: 'base', weightPct: 0 }).changesSession).toBe(false);
        expect(weekTargetEffects({ week: 1, label: 'v', setDelta: 1 }).changesSession).toBe(true);
        expect(weekTargetEffects({ week: 1, label: 'v', repRange: [8, 10] }).changesSession).toBe(true);
        expect(weekTargetEffects({ week: 1, label: 'v', rpeTarget: 8 }).changesSession).toBe(true);
        expect(weekTargetEffects(null).changesSession).toBe(false);
    });

    it('a volume-only pull-back is a deload (Bug 4)', () => {
        expect(isDeloadTarget({ week: 6, label: 'deload', setDelta: -2 })).toBe(true);
        expect(isDeloadTarget({ week: 6, label: 'deload', weightPct: -35 })).toBe(true);
        expect(isDeloadTarget({ week: 2, label: 'accumulate', setDelta: 1 })).toBe(false);
        expect(isDeloadTarget({ week: 2, label: 'heavy', weightPct: 5 })).toBe(false);
    });
});

describe('describeWeekTarget', () => {
    it('renders every lever in a fixed order and nothing for a baseline week', () => {
        expect(describeWeekTarget({ week: 6, label: 'deload', weightPct: -35, setDelta: -2, repRange: [12, 15], rpeTarget: 6 }))
            .toBe('-35% weight · -2 sets · 12–15 reps · effort 6/10');
        expect(describeWeekTarget({ week: 2, label: 'heavy', weightPct: 5 })).toBe('+5% weight');
        expect(describeWeekTarget({ week: 2, label: 'v', setDelta: 1 })).toBe('+1 set');
        expect(describeWeekTarget({ week: 1, label: 'base' })).toBe('');
    });
});
