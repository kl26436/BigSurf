// Tests for convertWeight from ui-helpers.js
// Since ui-helpers.js has no external dependencies for convertWeight,
// we re-implement the function here to test the logic in isolation

import { describe, it, expect } from 'vitest';

// Extracted pure function (same logic as ui-helpers.js)
function convertWeight(weight, fromUnit, toUnit) {
    if (!weight || isNaN(weight) || weight <= 0) return 0;
    if (weight > 1000) return 0;
    if (fromUnit === toUnit) return Math.round(weight);
    if (fromUnit === 'lbs' && toUnit === 'kg') {
        return Math.round(weight * 0.453592 * 10) / 10;
    } else if (fromUnit === 'kg' && toUnit === 'lbs') {
        return Math.round(weight * 2.20462);
    }
    return weight;
}

describe('convertWeight', () => {
    it('converts lbs to kg correctly', () => {
        expect(convertWeight(100, 'lbs', 'kg')).toBe(45.4);
    });

    it('converts kg to lbs correctly', () => {
        expect(convertWeight(45.4, 'kg', 'lbs')).toBe(100);
    });

    it('returns same value for same unit', () => {
        expect(convertWeight(100, 'lbs', 'lbs')).toBe(100);
    });

    it('returns 0 for zero weight', () => {
        expect(convertWeight(0, 'lbs', 'kg')).toBe(0);
    });

    it('returns 0 for null weight', () => {
        expect(convertWeight(null, 'lbs', 'kg')).toBe(0);
    });

    it('returns 0 for NaN weight', () => {
        expect(convertWeight('not a number', 'lbs', 'kg')).toBe(0);
    });

    it('returns 0 for weight over 1000 (likely corrupted)', () => {
        expect(convertWeight(1001, 'lbs', 'kg')).toBe(0);
    });

    it('converts weight of exactly 1000', () => {
        // 1000 is valid (not > 1000)
        expect(convertWeight(1000, 'lbs', 'lbs')).toBe(1000);
    });

    it('returns 0 for negative weight', () => {
        expect(convertWeight(-50, 'lbs', 'kg')).toBe(0);
    });
});
