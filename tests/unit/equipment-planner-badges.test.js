// Tests for compatibility badges (Tier 3 Phase 1 / traveler-flow D6)
import { describe, it, expect } from 'vitest';
import {
    badgeForTemplate,
    checkTemplateCompatibility,
} from '../../js/core/features/equipment-planner.js';

const AVAILABLE = new Set(['Leg Press', 'Leg Curl', 'Lat Pulldown']);

const legTemplate = {
    exercises: [
        { name: 'Leg Press', equipment: 'Leg Press Machine' },
        { name: 'Leg Curl', equipment: 'Leg Curl Machine' },
    ],
};
const mixedTemplate = {
    exercises: [
        { name: 'Leg Press', equipment: 'Leg Press Machine' },
        { name: 'Bench Press', equipment: 'Flat Bench' },
        { name: 'Chest Fly', equipment: 'Pec Deck' },
    ],
};
const chestTemplate = {
    exercises: [
        { name: 'Bench Press', equipment: 'Flat Bench' },
        { name: 'Chest Fly', equipment: 'Pec Deck' },
    ],
};

describe('badgeForTemplate', () => {
    it('returns full when every exercise is available', () => {
        const compat = checkTemplateCompatibility(legTemplate, AVAILABLE);
        expect(badgeForTemplate(compat, 8)).toEqual({ state: 'full', label: 'Possible here' });
    });

    it('returns partial with positive counts only', () => {
        const compat = checkTemplateCompatibility(mixedTemplate, AVAILABLE);
        expect(badgeForTemplate(compat, 8)).toEqual({ state: 'partial', label: '1 of 3 here' });
    });

    it('never claims impossibility — zero matches reads unmapped (D6)', () => {
        const compat = checkTemplateCompatibility(chestTemplate, AVAILABLE);
        const badge = badgeForTemplate(compat, 8);
        expect(badge.state).toBe('unmapped');
        expect(badge.label).toBe('Not mapped here yet');
        expect(badge.label).not.toMatch(/not possible/i);
    });

    it('returns null (F1 banner territory) when the gym has zero equipment', () => {
        const compat = checkTemplateCompatibility(legTemplate, new Set());
        expect(badgeForTemplate(compat, 0)).toBeNull();
    });

    it('returns null for empty templates and missing compatibility', () => {
        expect(badgeForTemplate(checkTemplateCompatibility({ exercises: [] }, AVAILABLE), 8)).toBeNull();
        expect(badgeForTemplate(null, 8)).toBeNull();
    });

    it('equipment-less exercises count as available (skip-equipment stays quiet, D10)', () => {
        const bodyweight = {
            exercises: [{ name: 'Push-Up' }, { name: 'Plank' }],
        };
        const compat = checkTemplateCompatibility(bodyweight, new Set());
        expect(badgeForTemplate(compat, 5)).toEqual({ state: 'full', label: 'Possible here' });
    });
});
