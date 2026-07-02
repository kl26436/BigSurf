// Tests for displayWeight from ui-helpers.js
// 1 decimal everywhere so dashboard and detail pages agree on displayed values.
// Imports the REAL function — ui-helpers has no import-time DOM/Firebase
// dependencies, so it loads cleanly in node (same pattern as config-values.test.js).

import { describe, it, expect } from 'vitest';

import { displayWeight } from '../../js/core/ui/ui-helpers.js';

describe('displayWeight', () => {
    describe('same unit passthrough', () => {
        it('returns weight unchanged when stored and display units match (lbs)', () => {
            expect(displayWeight(135, 'lbs', 'lbs')).toEqual({ value: 135, label: 'lbs' });
        });

        it('returns weight unchanged when stored and display units match (kg)', () => {
            expect(displayWeight(60, 'kg', 'kg')).toEqual({ value: 60, label: 'kg' });
        });

        it('preserves 1 decimal for same-unit lbs', () => {
            expect(displayWeight(135.7, 'lbs', 'lbs')).toEqual({ value: 135.7, label: 'lbs' });
        });

        it('rounds second decimal away (lbs)', () => {
            expect(displayWeight(135.72, 'lbs', 'lbs')).toEqual({ value: 135.7, label: 'lbs' });
        });
    });

    describe('lbs to kg conversion', () => {
        it('converts 135 lbs to 61.2 kg (1 decimal)', () => {
            // 135 * 0.453592 = 61.235 → 61.2
            const result = displayWeight(135, 'lbs', 'kg');
            expect(result.label).toBe('kg');
            expect(result.value).toBe(61.2);
        });

        it('converts 225 lbs to kg (1 decimal)', () => {
            // 225 * 0.453592 = 102.058 → 102.1
            const result = displayWeight(225, 'lbs', 'kg');
            expect(result.label).toBe('kg');
            expect(result.value).toBe(102.1);
        });

        it('converts 45 lbs to kg (1 decimal)', () => {
            // 45 * 0.453592 = 20.41 → 20.4
            const result = displayWeight(45, 'lbs', 'kg');
            expect(result.label).toBe('kg');
            expect(result.value).toBe(20.4);
        });

        it('never produces values with more than one decimal place', () => {
            const weights = [5, 10, 25, 35, 45, 95, 135, 185, 225, 315, 405];
            for (const w of weights) {
                const result = displayWeight(w, 'lbs', 'kg');
                const decimalStr = String(result.value);
                const decimalPart = decimalStr.includes('.') ? decimalStr.split('.')[1] : '';
                expect(decimalPart.length).toBeLessThanOrEqual(1);
            }
        });
    });

    describe('kg to lbs conversion', () => {
        it('converts 60 kg to 132.3 lbs (1 decimal)', () => {
            // 60 * 2.20462 = 132.277 → 132.3
            expect(displayWeight(60, 'kg', 'lbs')).toEqual({ value: 132.3, label: 'lbs' });
        });

        it('converts 100 kg to 220.5 lbs (1 decimal)', () => {
            // 100 * 2.20462 = 220.462 → 220.5
            expect(displayWeight(100, 'kg', 'lbs')).toEqual({ value: 220.5, label: 'lbs' });
        });
    });

    describe('edge cases', () => {
        it('returns 0 for null weight', () => {
            expect(displayWeight(null, 'lbs', 'kg')).toEqual({ value: 0, label: 'kg' });
        });

        it('returns 0 for undefined weight', () => {
            expect(displayWeight(undefined, 'lbs', 'kg')).toEqual({ value: 0, label: 'kg' });
        });

        it('returns 0 for zero weight', () => {
            expect(displayWeight(0, 'lbs', 'kg')).toEqual({ value: 0, label: 'kg' });
        });

        it('returns 0 for NaN weight', () => {
            expect(displayWeight(NaN, 'lbs', 'kg')).toEqual({ value: 0, label: 'kg' });
        });

        it('defaults storedUnit to lbs when missing', () => {
            expect(displayWeight(100, null, 'lbs')).toEqual({ value: 100, label: 'lbs' });
        });

        it('defaults displayUnit to lbs when missing', () => {
            expect(displayWeight(100, 'lbs', null)).toEqual({ value: 100, label: 'lbs' });
        });
    });
});
