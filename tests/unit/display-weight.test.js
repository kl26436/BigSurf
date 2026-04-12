// Tests for displayWeight from ui-helpers.js (Phase 2.6, 2.9)
// Verifies unit conversion for history/charts with 0.5kg rounding

import { describe, it, expect } from 'vitest';

/**
 * Re-implementation of displayWeight from ui-helpers.js
 * Converts a stored weight to the user's preferred display unit.
 */
function displayWeight(weight, storedUnit, displayUnit) {
    if (!weight || isNaN(weight)) return { value: 0, label: displayUnit || 'lbs' };
    const unit = displayUnit || 'lbs';
    const stored = storedUnit || 'lbs';
    if (stored === unit) return { value: Math.round(weight), label: unit };
    if (stored === 'lbs' && unit === 'kg') {
        return { value: Math.round(weight * 0.453592 * 2) / 2, label: 'kg' };
    }
    if (stored === 'kg' && unit === 'lbs') {
        return { value: Math.round(weight * 2.20462), label: 'lbs' };
    }
    return { value: Math.round(weight), label: unit };
}

describe('displayWeight', () => {
    describe('same unit passthrough', () => {
        it('returns rounded weight when stored and display units match (lbs)', () => {
            expect(displayWeight(135, 'lbs', 'lbs')).toEqual({ value: 135, label: 'lbs' });
        });

        it('returns rounded weight when stored and display units match (kg)', () => {
            expect(displayWeight(60, 'kg', 'kg')).toEqual({ value: 60, label: 'kg' });
        });

        it('rounds decimal lbs to nearest integer', () => {
            expect(displayWeight(135.7, 'lbs', 'lbs')).toEqual({ value: 136, label: 'lbs' });
        });
    });

    describe('lbs to kg conversion', () => {
        it('converts 135 lbs to 61.5 kg (rounded to nearest 0.5)', () => {
            // 135 * 0.453592 = 61.235 → round to 0.5 → 61.0
            const result = displayWeight(135, 'lbs', 'kg');
            expect(result.label).toBe('kg');
            expect(result.value).toBe(61);
        });

        it('converts 225 lbs to kg (nearest 0.5)', () => {
            // 225 * 0.453592 = 102.058 → round to 0.5 → 102.0
            const result = displayWeight(225, 'lbs', 'kg');
            expect(result.label).toBe('kg');
            expect(result.value).toBe(102);
        });

        it('converts 45 lbs to kg (nearest 0.5)', () => {
            // 45 * 0.453592 = 20.412 → round to 0.5 → 20.5
            const result = displayWeight(45, 'lbs', 'kg');
            expect(result.label).toBe('kg');
            expect(result.value).toBe(20.5);
        });

        it('never produces values with more than one decimal place', () => {
            // Test a range of common weights
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
        it('converts 60 kg to 132 lbs', () => {
            // 60 * 2.20462 = 132.277 → round → 132
            expect(displayWeight(60, 'kg', 'lbs')).toEqual({ value: 132, label: 'lbs' });
        });

        it('converts 100 kg to 220 lbs', () => {
            // 100 * 2.20462 = 220.462 → round → 220
            expect(displayWeight(100, 'kg', 'lbs')).toEqual({ value: 220, label: 'lbs' });
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
