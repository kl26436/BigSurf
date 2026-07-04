// Equipment display-name composition — the single source of truth used by the
// add flow, the identity picker, and the quick-edit sheet so `name` never goes
// stale after a brand/line/function edit.

import { describe, it, expect } from 'vitest';
import { composeEquipmentName } from '../../js/core/utils/equipment-name.js';

describe('composeEquipmentName', () => {
    it('brand + line + function → "Brand Line — Function"', () => {
        expect(composeEquipmentName({ brand: 'Hammer Strength', line: 'Fit Evo', function: 'Chest Press' }))
            .toBe('Hammer Strength Fit Evo — Chest Press');
    });

    it('brand + function (no line) → "Brand — Function"', () => {
        expect(composeEquipmentName({ brand: 'Panatta', function: 'Adductor' }))
            .toBe('Panatta — Adductor');
    });

    it('brand + line (no function) → "Brand Line"', () => {
        expect(composeEquipmentName({ brand: 'Matrix', line: 'Ultra' }))
            .toBe('Matrix Ultra');
    });

    it('function only → "Function"', () => {
        expect(composeEquipmentName({ function: 'Leg Press' })).toBe('Leg Press');
    });

    it('brand only → "Brand"', () => {
        expect(composeEquipmentName({ brand: 'Life Fitness' })).toBe('Life Fitness');
    });

    it('treats "Unknown" brand as no brand', () => {
        expect(composeEquipmentName({ brand: 'Unknown', function: 'Cable Row' })).toBe('Cable Row');
        expect(composeEquipmentName({ brand: 'Unknown', line: 'X', function: 'Row' })).toBe('Row');
    });

    it('trims whitespace and ignores empty/missing fields', () => {
        expect(composeEquipmentName({ brand: '  Rogue  ', function: '  Squat  ' })).toBe('Rogue — Squat');
        expect(composeEquipmentName({})).toBe('');
        expect(composeEquipmentName()).toBe('');
        expect(composeEquipmentName({ brand: '', line: '', function: '' })).toBe('');
    });
});
