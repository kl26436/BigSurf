// Tests for plate calculator (Phase 11.5)
// Verifies greedy plate breakdown algorithm for lbs and kg

import { describe, it, expect } from 'vitest';
import { calculatePlates } from '../../js/core/features/plate-calculator.js';

describe('calculatePlates', () => {
    describe('standard lbs plates', () => {
        it('calculates 225 lbs (two 45s per side)', () => {
            const result = calculatePlates(225, 45);
            expect(result.plates).toEqual([45, 45]);
            expect(result.remainder).toBe(0);
        });

        it('calculates 185 lbs (45 + 25 per side)', () => {
            const result = calculatePlates(185, 45);
            expect(result.plates).toEqual([45, 25]);
            expect(result.remainder).toBe(0);
        });

        it('calculates 135 lbs (one 45 per side)', () => {
            const result = calculatePlates(135, 45);
            expect(result.plates).toEqual([45]);
            expect(result.remainder).toBe(0);
        });

        it('calculates 315 lbs (three 45s per side)', () => {
            const result = calculatePlates(315, 45);
            expect(result.plates).toEqual([45, 45, 45]);
            expect(result.remainder).toBe(0);
        });

        it('calculates 155 lbs (45 + 10 per side)', () => {
            const result = calculatePlates(155, 45);
            expect(result.plates).toEqual([45, 10]);
            expect(result.remainder).toBe(0);
        });
    });

    describe('edge cases', () => {
        it('returns empty plates for just the bar (45 lbs)', () => {
            const result = calculatePlates(45, 45);
            expect(result.plates).toEqual([]);
            expect(result.remainder).toBe(0);
            expect(result.error).toBeUndefined();
        });

        it('returns error when weight is less than bar', () => {
            const result = calculatePlates(30, 45);
            expect(result.error).toBe('Weight is less than bar');
            expect(result.plates).toEqual([]);
        });

        it('handles remainder when exact weight not achievable', () => {
            // 183 lbs: per side = (183-45)/2 = 69 lbs
            // Best with standard plates: 45+25 = 70, but 69: 45+10+10+2.5 = 67.5, remainder 1.5
            const result = calculatePlates(183, 45);
            expect(result.remainder).toBeGreaterThan(0);
        });
    });

    describe('custom plate sets', () => {
        it('works without 35 lb plates', () => {
            const result = calculatePlates(255, 45, [45, 25, 10, 5, 2.5]);
            // per side = (255-45)/2 = 105 = 45+45+10+5
            expect(result.plates).toEqual([45, 45, 10, 5]);
            expect(result.remainder).toBe(0);
        });

        it('works with minimal plate set', () => {
            const result = calculatePlates(95, 45, [25]);
            // per side = 25
            expect(result.plates).toEqual([25]);
            expect(result.remainder).toBe(0);
        });
    });

    describe('kg mode', () => {
        it('calculates 100 kg with standard kg plates', () => {
            // per side = (100-20)/2 = 40 = 20+20
            const result = calculatePlates(100, 20, [20, 15, 10, 5, 2.5, 1.25]);
            expect(result.plates).toEqual([20, 20]);
            expect(result.remainder).toBe(0);
        });

        it('calculates 60 kg with standard kg plates', () => {
            // per side = (60-20)/2 = 20 = 20
            const result = calculatePlates(60, 20, [20, 15, 10, 5, 2.5, 1.25]);
            expect(result.plates).toEqual([20]);
            expect(result.remainder).toBe(0);
        });

        it('calculates 72.5 kg (uses 1.25 plates)', () => {
            // per side = (72.5-20)/2 = 26.25 = 20+5+1.25
            const result = calculatePlates(72.5, 20, [20, 15, 10, 5, 2.5, 1.25]);
            expect(result.plates).toEqual([20, 5, 1.25]);
            expect(result.remainder).toBe(0);
        });

        it('returns error for weight less than kg bar', () => {
            const result = calculatePlates(15, 20, [20, 15, 10, 5, 2.5, 1.25]);
            expect(result.error).toBe('Weight is less than bar');
        });

        it('handles just the bar (20 kg)', () => {
            const result = calculatePlates(20, 20, [20, 15, 10, 5, 2.5, 1.25]);
            expect(result.plates).toEqual([]);
            expect(result.remainder).toBe(0);
        });
    });

    describe('35 lb bar', () => {
        it('calculates correctly with 35 lb bar', () => {
            // per side = (125-35)/2 = 45
            const result = calculatePlates(125, 35);
            expect(result.plates).toEqual([45]);
            expect(result.remainder).toBe(0);
        });
    });
});
