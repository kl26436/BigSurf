// Tests for Equipment Planner (Phase 16)
// Pure functions — can import directly (no Firebase/DOM dependencies)

import { describe, it, expect } from 'vitest';
import {
    getEquipmentAtLocation,
    getExercisesAtLocation,
    checkTemplateCompatibility,
    categorizeTemplates,
    rankExercisesForLocation,
} from '../../js/core/features/equipment-planner.js';

// ===================================================================
// TEST DATA
// ===================================================================

const mockEquipment = [
    {
        id: 'eq1',
        name: 'Flat Bench',
        locations: ['Downtown Gym', 'Home Gym'],
        exerciseTypes: ['Bench Press', 'Dumbbell Fly'],
    },
    {
        id: 'eq2',
        name: 'Lat Pulldown Machine',
        locations: ['Downtown Gym'],
        exerciseTypes: ['Lat Pulldown', 'Straight Arm Pulldown'],
    },
    {
        id: 'eq3',
        name: 'Squat Rack',
        locations: ['Home Gym'],
        exerciseTypes: ['Squat', 'Overhead Press'],
    },
    {
        // Legacy format — single location field
        id: 'eq4',
        name: 'Cable Machine',
        location: 'Downtown Gym',
        exerciseTypes: ['Cable Curl', 'Tricep Pushdown'],
    },
    {
        id: 'eq5',
        name: 'Dumbbells',
        locations: ['Downtown Gym', 'Home Gym'],
        exerciseTypes: ['Dumbbell Curl', 'Lateral Raise'],
    },
    {
        // Equipment with no exerciseTypes
        id: 'eq6',
        name: 'Foam Roller',
        locations: ['Downtown Gym'],
    },
];

const mockExerciseLibrary = [
    { name: 'Bench Press', bodyPart: 'Chest', equipmentType: 'Barbell' },
    { name: 'Dumbbell Fly', bodyPart: 'Chest', equipmentType: 'Dumbbell' },
    { name: 'Lat Pulldown', bodyPart: 'Back', equipmentType: 'Cable' },
    { name: 'Straight Arm Pulldown', bodyPart: 'Back', equipmentType: 'Cable' },
    { name: 'Squat', bodyPart: 'Legs', equipmentType: 'Barbell' },
    { name: 'Overhead Press', bodyPart: 'Shoulders', equipmentType: 'Barbell' },
    { name: 'Cable Curl', bodyPart: 'Arms', equipmentType: 'Cable' },
    { name: 'Tricep Pushdown', bodyPart: 'Arms', equipmentType: 'Cable' },
    { name: 'Dumbbell Curl', bodyPart: 'Arms', equipmentType: 'Dumbbell' },
    { name: 'Lateral Raise', bodyPart: 'Shoulders', equipmentType: 'Dumbbell' },
    { name: 'Push-Up', bodyPart: 'Chest', equipmentType: 'Bodyweight' },
    { name: 'Pull-Up', bodyPart: 'Back', equipmentType: 'Bodyweight' },
];

// ===================================================================
// getEquipmentAtLocation
// ===================================================================

describe('getEquipmentAtLocation', () => {
    it('returns equipment matching the location name via locations array', () => {
        const result = getEquipmentAtLocation(mockEquipment, 'Downtown Gym');
        const names = result.map(eq => eq.name);
        expect(names).toContain('Flat Bench');
        expect(names).toContain('Lat Pulldown Machine');
        expect(names).toContain('Dumbbells');
        expect(names).toContain('Foam Roller');
    });

    it('handles legacy location field', () => {
        const result = getEquipmentAtLocation(mockEquipment, 'Downtown Gym');
        const names = result.map(eq => eq.name);
        expect(names).toContain('Cable Machine');
    });

    it('filters to correct location', () => {
        const result = getEquipmentAtLocation(mockEquipment, 'Home Gym');
        const names = result.map(eq => eq.name);
        expect(names).toContain('Flat Bench');
        expect(names).toContain('Squat Rack');
        expect(names).toContain('Dumbbells');
        expect(names).not.toContain('Lat Pulldown Machine');
        expect(names).not.toContain('Cable Machine');
    });

    it('returns empty array when no equipment at location', () => {
        const result = getEquipmentAtLocation(mockEquipment, 'Unknown Gym');
        expect(result).toEqual([]);
    });

    it('returns empty array for null/undefined inputs', () => {
        expect(getEquipmentAtLocation(null, 'Downtown Gym')).toEqual([]);
        expect(getEquipmentAtLocation(mockEquipment, null)).toEqual([]);
        expect(getEquipmentAtLocation(null, null)).toEqual([]);
    });
});

// ===================================================================
// getExercisesAtLocation
// ===================================================================

describe('getExercisesAtLocation', () => {
    it('flattens exerciseTypes from multiple equipment items', () => {
        const equipment = getEquipmentAtLocation(mockEquipment, 'Downtown Gym');
        const exercises = getExercisesAtLocation(equipment);
        expect(exercises.has('Bench Press')).toBe(true);
        expect(exercises.has('Lat Pulldown')).toBe(true);
        expect(exercises.has('Cable Curl')).toBe(true);
        expect(exercises.has('Dumbbell Curl')).toBe(true);
    });

    it('deduplicates exercise names', () => {
        const duped = [
            { exerciseTypes: ['Bench Press', 'Squat'] },
            { exerciseTypes: ['Bench Press', 'Deadlift'] },
        ];
        const exercises = getExercisesAtLocation(duped);
        expect(exercises.size).toBe(3);
    });

    it('handles equipment with no exerciseTypes', () => {
        const equipment = [{ name: 'Foam Roller' }];
        const exercises = getExercisesAtLocation(equipment);
        expect(exercises.size).toBe(0);
    });

    it('returns empty set for empty/null input', () => {
        expect(getExercisesAtLocation([])).toEqual(new Set());
        expect(getExercisesAtLocation(null)).toEqual(new Set());
    });
});

// ===================================================================
// checkTemplateCompatibility
// ===================================================================

describe('checkTemplateCompatibility', () => {
    const availableExercises = new Set(['Bench Press', 'Dumbbell Fly', 'Lat Pulldown', 'Cable Curl']);

    it('returns compatible when all exercises are available', () => {
        const template = {
            name: 'Upper Body',
            exercises: [
                { name: 'Bench Press', equipment: 'Flat Bench' },
                { name: 'Lat Pulldown', equipment: 'Lat Pulldown Machine' },
            ],
        };
        const result = checkTemplateCompatibility(template, availableExercises);
        expect(result.compatible).toBe(true);
        expect(result.total).toBe(2);
        expect(result.available).toBe(2);
        expect(result.missing).toBe(0);
    });

    it('returns incompatible when exercises are missing', () => {
        const template = {
            name: 'Leg Day',
            exercises: [
                { name: 'Squat', equipment: 'Squat Rack' },
                { name: 'Bench Press', equipment: 'Flat Bench' },
            ],
        };
        const result = checkTemplateCompatibility(template, availableExercises);
        expect(result.compatible).toBe(false);
        expect(result.available).toBe(1);
        expect(result.missing).toBe(1);
        expect(result.exercises[0].available).toBe(false); // Squat
        expect(result.exercises[1].available).toBe(true);  // Bench Press
    });

    it('treats exercises without equipment field as always available', () => {
        const template = {
            name: 'Bodyweight',
            exercises: [
                { name: 'Push-Up' },
                { name: 'Pull-Up' },
            ],
        };
        const result = checkTemplateCompatibility(template, availableExercises);
        expect(result.compatible).toBe(true);
        expect(result.available).toBe(2);
    });

    it('handles mixed equipment and bodyweight exercises', () => {
        const template = {
            name: 'Mixed',
            exercises: [
                { name: 'Push-Up' },
                { name: 'Bench Press', equipment: 'Flat Bench' },
                { name: 'Squat', equipment: 'Squat Rack' },
            ],
        };
        const result = checkTemplateCompatibility(template, availableExercises);
        expect(result.compatible).toBe(false);
        expect(result.available).toBe(2);
        expect(result.missing).toBe(1);
    });

    it('handles empty template', () => {
        const template = { name: 'Empty', exercises: [] };
        const result = checkTemplateCompatibility(template, availableExercises);
        expect(result.compatible).toBe(true);
        expect(result.total).toBe(0);
    });

    it('handles template with no exercises property', () => {
        const template = { name: 'No exercises' };
        const result = checkTemplateCompatibility(template, availableExercises);
        expect(result.compatible).toBe(true);
        expect(result.total).toBe(0);
    });

    it('uses machine field as fallback for exercise name', () => {
        const template = {
            name: 'Machine workout',
            exercises: [
                { machine: 'Bench Press', equipment: 'Flat Bench' },
            ],
        };
        const result = checkTemplateCompatibility(template, availableExercises);
        expect(result.compatible).toBe(true);
    });
});

// ===================================================================
// categorizeTemplates
// ===================================================================

describe('categorizeTemplates', () => {
    const availableExercises = new Set(['Bench Press', 'Dumbbell Fly', 'Lat Pulldown']);

    const templates = [
        {
            name: 'Chest Day',
            exercises: [
                { name: 'Bench Press', equipment: 'Flat Bench' },
                { name: 'Dumbbell Fly', equipment: 'Dumbbells' },
            ],
        },
        {
            name: 'Upper Body',
            exercises: [
                { name: 'Bench Press', equipment: 'Flat Bench' },
                { name: 'Squat', equipment: 'Squat Rack' },
            ],
        },
        {
            name: 'Leg Day',
            exercises: [
                { name: 'Squat', equipment: 'Squat Rack' },
                { name: 'Leg Press', equipment: 'Leg Press Machine' },
            ],
        },
        {
            name: 'Bodyweight',
            exercises: [
                { name: 'Push-Up' },
            ],
        },
    ];

    it('correctly separates fully, partially, and incompatible templates', () => {
        const result = categorizeTemplates(templates, availableExercises);
        expect(result.fullyCompatible.map(t => t.name)).toEqual(['Chest Day', 'Bodyweight']);
        expect(result.partiallyCompatible.map(t => t.name)).toEqual(['Upper Body']);
        expect(result.incompatible.map(t => t.name)).toEqual(['Leg Day']);
    });

    it('includes compatibility details on each entry', () => {
        const result = categorizeTemplates(templates, availableExercises);
        expect(result.partiallyCompatible[0].compatibility.missing).toBe(1);
        expect(result.partiallyCompatible[0].compatibility.available).toBe(1);
    });

    it('skips hidden and deleted templates', () => {
        const withHidden = [
            ...templates,
            { name: 'Hidden', isHidden: true, exercises: [{ name: 'Bench Press', equipment: 'X' }] },
            { name: 'Deleted', deleted: true, exercises: [{ name: 'Bench Press', equipment: 'X' }] },
        ];
        const result = categorizeTemplates(withHidden, availableExercises);
        const allNames = [
            ...result.fullyCompatible,
            ...result.partiallyCompatible,
            ...result.incompatible,
        ].map(t => t.name);
        expect(allNames).not.toContain('Hidden');
        expect(allNames).not.toContain('Deleted');
    });

    it('handles empty template list', () => {
        const result = categorizeTemplates([], availableExercises);
        expect(result.fullyCompatible).toEqual([]);
        expect(result.partiallyCompatible).toEqual([]);
        expect(result.incompatible).toEqual([]);
    });
});

// ===================================================================
// rankExercisesForLocation
// ===================================================================

describe('rankExercisesForLocation', () => {
    const available = new Set(['Bench Press', 'Lat Pulldown', 'Cable Curl', 'Dumbbell Curl']);

    it('ranks previously-used exercises first', () => {
        const recent = [{ name: 'Cable Curl' }, { name: 'Lat Pulldown' }];
        const result = rankExercisesForLocation(available, recent, mockExerciseLibrary);

        // First two should be the used ones
        const usedNames = result.filter(r => r.usedBefore).map(r => r.name);
        const notUsedNames = result.filter(r => !r.usedBefore).map(r => r.name);
        expect(usedNames).toContain('Cable Curl');
        expect(usedNames).toContain('Lat Pulldown');
        expect(notUsedNames).toContain('Bench Press');
        expect(notUsedNames).toContain('Dumbbell Curl');

        // Used exercises come before unused
        const firstUnusedIndex = result.findIndex(r => !r.usedBefore);
        const lastUsedIndex = result.length - 1 - [...result].reverse().findIndex(r => r.usedBefore);
        if (firstUnusedIndex >= 0 && lastUsedIndex >= 0) {
            expect(lastUsedIndex).toBeLessThan(firstUnusedIndex);
        }
    });

    it('excludes exercises not available at location', () => {
        const result = rankExercisesForLocation(available, [], mockExerciseLibrary);
        const names = result.map(r => r.name);
        expect(names).not.toContain('Squat');
        expect(names).not.toContain('Push-Up');
        expect(names).not.toContain('Pull-Up');
    });

    it('handles empty recent exercises list', () => {
        const result = rankExercisesForLocation(available, [], mockExerciseLibrary);
        expect(result.every(r => !r.usedBefore)).toBe(true);
        expect(result.length).toBe(4);
    });

    it('handles empty available exercises', () => {
        const result = rankExercisesForLocation(new Set(), [{ name: 'Bench Press' }], mockExerciseLibrary);
        expect(result).toEqual([]);
    });

    it('handles null/undefined inputs gracefully', () => {
        expect(rankExercisesForLocation(null, [], mockExerciseLibrary)).toEqual([]);
        expect(rankExercisesForLocation(available, null, mockExerciseLibrary).length).toBe(4);
    });

    it('sorts each group alphabetically', () => {
        const result = rankExercisesForLocation(available, [], mockExerciseLibrary);
        const names = result.map(r => r.name);
        const sorted = [...names].sort();
        expect(names).toEqual(sorted);
    });
});
