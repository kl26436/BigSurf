// CP-1 — movement-pattern vocabulary, inference, and prescription fields.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    PATTERNS, ROLES, PROGRESSIONS,
    inferPattern, inferRole, patternsForEquipment,
    normalizeRepRange, normalizeRpeTarget, applyPrescriptionFields,
} from '../../js/core/features/movement-patterns.js';

const library = JSON.parse(readFileSync('data/exercises.json', 'utf8'));

describe('built-in library patterns', () => {
    it('every exercise carries a pattern from the closed vocabulary', () => {
        for (const ex of library) {
            expect(PATTERNS, `${ex.name} pattern "${ex.pattern}"`).toContain(ex.pattern);
        }
    });

    it('name + tag inference agrees with every hand-stamped pattern (keeps the rules honest)', () => {
        const disagreements = library
            .map(ex => ({ name: ex.name, stamped: ex.pattern, inferred: inferPattern({ name: ex.name, tags: ex.tags }) }))
            .filter(r => r.stamped !== r.inferred);
        expect(disagreements).toEqual([]);
    });

    it('name alone agrees too (LB-1) — custom rows and workout records carry no tags', () => {
        const disagreements = library
            .map(ex => ({ name: ex.name, stamped: ex.pattern, inferred: inferPattern({ name: ex.name }) }))
            .filter(r => r.stamped !== r.inferred);
        expect(disagreements).toEqual([]);
    });
});

describe('inferPattern — LB-1 equipment-aware + the null rules', () => {
    it('the 45° bench makes Back Extension Machine a hinge; a seated lumbar machine keeps it trunk-ext', () => {
        expect(inferPattern({ name: 'Back Extension Machine' }, { equipment: 'Arsenal Strength Alpha — 45 Degree Back Extension' })).toBe('hip-dominant');
        expect(inferPattern({ name: 'Back Extension Machine' }, { equipment: 'Nautilus Lower Back' })).toBe('trunk-ext');
        // An equipment doc works as the hint too (function + name).
        expect(inferPattern({ name: 'Back Extension' }, { equipment: { name: 'Roman chair', function: '' } })).toBe('hip-dominant');
        expect(inferPattern({ name: 'Back Extension' }, { equipment: { name: 'Nautilus Nitro', function: 'Lumbar Extension' } })).toBe('trunk-ext');
        // No equipment: AU-13's default (and the library stamp) — a hinge.
        expect(inferPattern({ name: 'Back Extension Machine' })).toBe('hip-dominant');
    });

    it('equipment never relabels a name that already decides', () => {
        // Explicitly hinge-named stays hinge on any machine.
        expect(inferPattern({ name: '45° Back Extension' }, { equipment: 'Nautilus Lower Back' })).toBe('hip-dominant');
        // A mis-linked machine can't turn a row into a hinge.
        expect(inferPattern({ name: 'Seated Row Machine' }, { equipment: '45 Degree Back Extension' })).toBe('horizontal-pull');
        // Brand words don't go through the rules ("Hammer" is a curl keyword).
        expect(inferPattern({ name: 'Bench Press' }, { equipment: 'Hammer Strength Flat' })).toBe('horizontal-push');
        // An explicit pattern still wins over everything.
        expect(inferPattern({ name: 'Back Extension Machine', pattern: 'trunk-ext' }, { equipment: '45 Degree Back Extension' })).toBe('trunk-ext');
    });

    it('a name no rule knows defers to hinge / lumbar equipment, and stays null otherwise', () => {
        expect(inferPattern({ name: 'Superman' }, { equipment: 'GHD' })).toBe('hip-dominant');
        expect(inferPattern({ name: 'Mystery Machine 3000' }, { equipment: 'Hammer Strength Flat' })).toBeNull();
    });

    it('shrugs are their own pattern, above the pulls, and not spine', () => {
        expect(PATTERNS).toContain('shrug');
        expect(inferPattern({ name: 'Shoulder Shrug' })).toBe('shrug');
        expect(inferPattern({ name: 'Barbell Shrug' })).toBe('shrug');
        expect(inferPattern({ name: 'Row Machine Shrug' })).toBe('shrug');
        expect(inferRole({ name: 'Shoulder Shrug' }, 0)).toBe('accessory');
    });

    it('adductor / abductor machines resolve', () => {
        expect(inferPattern({ name: 'Adductor Machine' })).toBe('adduction');
        expect(inferPattern({ name: 'Abductor Machine' })).toBe('abduction');
        expect(inferPattern({ name: 'Hip Abduction Machine' })).toBe('abduction');
        expect(inferPattern({ name: 'Inner Thigh' })).toBe('adduction');
    });

    it('incline / decline / dumbbell presses are horizontal push; shoulder presses stay vertical; angle words need "press"', () => {
        expect(inferPattern({ name: 'Incline Dumbbell Press' })).toBe('horizontal-push');
        expect(inferPattern({ name: 'Decline Dumbbell Press' })).toBe('horizontal-push');
        expect(inferPattern({ name: 'DB Press' })).toBe('horizontal-push');
        expect(inferPattern({ name: 'Shoulder Press' })).toBe('vertical-push');
        expect(inferPattern({ name: 'Incline Shoulder Press' })).toBe('vertical-push');
        expect(inferPattern({ name: 'Incline Dumbbell Curl' })).toBe('elbow-flex');
        expect(inferPattern({ name: 'Decline Crunch' })).toBe('trunk-flex');
        expect(inferPattern({ name: 'Incline Leg Press' })).toBe('knee-dominant');
    });
});

describe('inferPattern', () => {
    it('resolves the machines on Kevin\'s floor that are not in the built-in library', () => {
        const cases = {
            'Panatta Super Lower Chest Flight': 'horizontal-push',
            'Newtech Incline Chest Press 2': 'horizontal-push',
            'Dips Press Machine': 'horizontal-push',
            'Standing Lateral Raise': 'lateral-delt',
            'Peck Back': 'rear-delt',
            'Panatta Super Pullover': 'vertical-pull',
            'Arsenal ISO Multi Row': 'horizontal-pull',
            '45 Degree Linear Row': 'horizontal-pull',
            'Arsenal Strength Pivot Leg Press': 'knee-dominant',
            'Rogers Power Squat Pro': 'knee-dominant',
            'Hack Squat': 'knee-dominant',
            'Kneeling Leg Curl': 'knee-flexion',
            // LB-1 — the Rogers reverse glute-ham is a hip extension (hinge);
            // a plain glute-ham raise stays a leg curl.
            'Reverse Glute-Ham': 'hip-dominant',
            'Glute Ham Raise': 'knee-flexion',
            'Rogers Hip Press': 'hip-dominant',
            'Hip Thrust': 'hip-dominant',
            'gym80 Abdominal Flexor': 'trunk-flex',
            'Max Lower Abs': 'trunk-flex',
            'Rotary Torso': 'anti-rotation',
            'Standing Total Arms': 'elbow-flex',
            'Gymleco Forearm Machine': 'elbow-flex',
            'Overhead Triceps Extension': 'elbow-ext',
            'Rowing Machine': 'cardio',
        };
        for (const [name, want] of Object.entries(cases)) {
            expect(inferPattern({ name }), name).toBe(want);
        }
    });

    it('honours an explicit valid pattern and ignores an invalid one', () => {
        expect(inferPattern({ name: 'Leg Press', pattern: 'hip-dominant' })).toBe('hip-dominant');
        expect(inferPattern({ name: 'Leg Press', pattern: 'nonsense' })).toBe('knee-dominant');
    });

    it('returns null when nothing matches (D0: unrotatable, never a gate)', () => {
        expect(inferPattern({ name: 'Mystery Machine 3000' })).toBeNull();
        expect(inferPattern(null)).toBeNull();
        expect(inferPattern({})).toBeNull();
    });
});

describe('inferRole', () => {
    it('first two compound slots are primary, later compounds secondary, isolation accessory, trunk work core', () => {
        const day = [
            { name: 'Seated Chest Press', tags: ['compound'] },
            { name: 'Shoulder Press Machine', tags: ['compound'] },
            { name: 'Incline Chest Press (Machine)', tags: ['compound'] },
            { name: 'Pec Deck', tags: ['isolation'] },
            { name: 'Machine Crunch' },
        ];
        expect(day.map((e, i) => inferRole(e, i))).toEqual(['primary', 'primary', 'secondary', 'accessory', 'core']);
    });

    it('an explicit role wins', () => {
        expect(inferRole({ name: 'Pec Deck', role: 'primary' }, 5)).toBe('primary');
        expect(inferRole({ name: 'Pec Deck', role: 'bogus' }, 5)).toBe('accessory');
    });
});

describe('patternsForEquipment', () => {
    const lookup = (name) => library.find(e => e.name === name);

    it('resolves through mapped exerciseTypes first (library lookup, then name inference)', () => {
        expect(patternsForEquipment({ exerciseTypes: ['Lat Pulldown', 'Cable Straight Arm Pulldown'] }, lookup)).toEqual(['vertical-pull']);
        expect(patternsForEquipment({ exerciseTypes: ['Peck Back'] }, lookup)).toEqual(['rear-delt']);
    });

    it('the doc is the equipment hint for each mapped name (LB-1)', () => {
        const fortyFive = { name: 'Arsenal Strength Alpha — 45 Degree Back Extension', function: '45 Degree Back Extension', exerciseTypes: ['Back Extension'] };
        const lumbar = { name: 'Nautilus Lower Back', function: 'Lower Back', exerciseTypes: ['Back Extension'] };
        expect(patternsForEquipment(fortyFive)).toEqual(['hip-dominant']);
        expect(patternsForEquipment(lumbar)).toEqual(['trunk-ext']);
        // No mapping at all: the machine's own text says 45° back extension.
        expect(patternsForEquipment({ name: fortyFive.name, function: fortyFive.function })).toEqual(['hip-dominant']);
    });

    it('falls back to the machine function/name when nothing is mapped, and to [] when even that fails', () => {
        expect(patternsForEquipment({ name: 'Panatta Super Pullover', function: 'Pullover' })).toEqual(['vertical-pull']);
        expect(patternsForEquipment({ name: 'Unnamed thing' })).toEqual([]);
        expect(patternsForEquipment({})).toEqual([]);
    });
});

describe('prescription fields', () => {
    it('normalizeRepRange accepts [lo, hi] within 1–50 and rejects the rest', () => {
        expect(normalizeRepRange([8, 12])).toEqual([8, 12]);
        expect(normalizeRepRange(['6', '8'])).toEqual([6, 8]);
        expect(normalizeRepRange([12, 8])).toBeNull();
        expect(normalizeRepRange([0, 8])).toBeNull();
        expect(normalizeRepRange([8])).toBeNull();
        expect(normalizeRepRange('8-12')).toBeNull();
    });

    it('normalizeRpeTarget snaps to the 6–10 half-step scale', () => {
        expect(normalizeRpeTarget(8)).toBe(8);
        expect(normalizeRpeTarget(7.6)).toBe(7.5);
        expect(normalizeRpeTarget(5)).toBeNull();
        expect(normalizeRpeTarget('x')).toBeNull();
    });

    it('applyPrescriptionFields copies only valid fields and never invents them', () => {
        const out = applyPrescriptionFields({ machine: 'X' }, {
            repRange: [8, 12], rpeTarget: 8, role: 'accessory', pattern: 'horizontal-push', progression: 'double',
        });
        expect(out).toEqual({ machine: 'X', repRange: [8, 12], rpeTarget: 8, role: 'accessory', pattern: 'horizontal-push', progression: 'double' });
        const bad = applyPrescriptionFields({ machine: 'Y' }, { repRange: [12, 8], rpeTarget: 3, role: 'boss', pattern: 'fly', progression: 'yolo' });
        expect(bad).toEqual({ machine: 'Y' });
        expect(applyPrescriptionFields({ machine: 'Z' }, null)).toEqual({ machine: 'Z' });
    });

    it('vocabularies are closed lists', () => {
        expect(ROLES).toEqual(['primary', 'secondary', 'accessory', 'core']);
        expect(PROGRESSIONS).toEqual(['double', 'load-only', 'rep-only', 'hold']);
        expect(new Set(PATTERNS).size).toBe(PATTERNS.length);
    });
});
