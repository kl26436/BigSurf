// UX-2: PR-proximity nudge threshold logic (pure).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    convertWeight: vi.fn((w) => w),
    showNotification: vi.fn(),
    escapeHtml: vi.fn((s) => s),
}));

import { findPRProximity } from '../../js/core/features/metrics/aggregators.js';

describe('findPRProximity', () => {
    it('flags an exercise within the threshold, below the PR', () => {
        const best = findPRProximity([
            { exercise: 'Bench Press', prWeight: 205, recentBest: 202.5, unit: 'lbs' },
        ]);
        expect(best).toMatchObject({ exercise: 'Bench Press', gap: 2.5 });
        expect(best.pct).toBeCloseTo(1.22, 1);
    });

    it('ignores exercises already at or over the PR', () => {
        expect(findPRProximity([
            { exercise: 'Squat', prWeight: 300, recentBest: 300, unit: 'lbs' },
            { exercise: 'Deadlift', prWeight: 400, recentBest: 410, unit: 'lbs' },
        ])).toBeNull();
    });

    it('ignores exercises further than the threshold from the PR', () => {
        // 180 vs 205 PR = 12% gap, beyond the default 5%.
        expect(findPRProximity([
            { exercise: 'Bench Press', prWeight: 205, recentBest: 180, unit: 'lbs' },
        ])).toBeNull();
    });

    it('picks the closest candidate when several qualify', () => {
        const best = findPRProximity([
            { exercise: 'Bench Press', prWeight: 205, recentBest: 200, unit: 'lbs' }, // gap 5
            { exercise: 'OHP', prWeight: 135, recentBest: 133, unit: 'lbs' },          // gap 2
        ]);
        expect(best.exercise).toBe('OHP');
    });

    it('respects a custom threshold', () => {
        const candidates = [{ exercise: 'Row', prWeight: 200, recentBest: 185, unit: 'lbs' }]; // 7.5%
        expect(findPRProximity(candidates)).toBeNull();                       // default 5%
        expect(findPRProximity(candidates, { thresholdPct: 10 })).toBeTruthy(); // widened
    });

    it('skips malformed candidates and empty input', () => {
        expect(findPRProximity([])).toBeNull();
        expect(findPRProximity(null)).toBeNull();
        expect(findPRProximity([{ exercise: 'X', prWeight: 0, recentBest: 0 }])).toBeNull();
    });
});
