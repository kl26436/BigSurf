// Tests for validation utilities
import { describe, it, expect } from 'vitest';
import { sanitizeString, validateExerciseData, validateEquipmentData } from '../../js/core/utils/validation.js';

describe('sanitizeString', () => {
    it('trims whitespace', () => {
        expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('strips HTML tags', () => {
        expect(sanitizeString('<script>alert("xss")</script>Hello')).toBe('alert("xss")Hello');
    });

    it('enforces max length', () => {
        const longString = 'a'.repeat(300);
        expect(sanitizeString(longString, 200).length).toBe(200);
    });

    it('returns empty string for null', () => {
        expect(sanitizeString(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
        expect(sanitizeString(undefined)).toBe('');
    });

    it('returns empty string for non-string', () => {
        expect(sanitizeString(123)).toBe('');
    });

    it('handles normal string without changes', () => {
        expect(sanitizeString('Bench Press')).toBe('Bench Press');
    });

    it('strips nested HTML tags', () => {
        expect(sanitizeString('<img src=x onerror=alert(1)>')).toBe('');
    });
});

describe('validateExerciseData', () => {
    it('sanitizes exercise name', () => {
        const result = validateExerciseData({ name: '  <b>Bench Press</b>  ' });
        expect(result.name).toBe('Bench Press');
    });

    it('returns null for null input', () => {
        expect(validateExerciseData(null)).toBeNull();
    });

    it('truncates long names', () => {
        const result = validateExerciseData({ name: 'a'.repeat(300) });
        expect(result.name.length).toBe(200);
    });

    it('preserves other fields', () => {
        const result = validateExerciseData({ name: 'Test', bodyPart: 'Chest', sets: 3 });
        expect(result.sets).toBe(3);
        expect(result.bodyPart).toBe('Chest');
    });
});

describe('validateEquipmentData', () => {
    it('sanitizes equipment name', () => {
        const result = validateEquipmentData({ name: '<b>Barbell</b>' });
        expect(result.name).toBe('Barbell');
    });

    it('sanitizes location', () => {
        const result = validateEquipmentData({ name: 'Bar', location: '  Gym A  ' });
        expect(result.location).toBe('Gym A');
    });

    it('sanitizes locations array', () => {
        const result = validateEquipmentData({
            name: 'Bar',
            locations: ['  Gym A  ', '<b>Gym B</b>'],
        });
        expect(result.locations).toEqual(['Gym A', 'Gym B']);
    });

    it('returns null for null input', () => {
        expect(validateEquipmentData(null)).toBeNull();
    });
});
