// LB-3 / LB-4 — one body-part taxonomy, one classifier, one label table
// (js/core/features/exercise-taxonomy.js). Real modules throughout: the
// taxonomy itself, training-rules (the coach's weekly volume) and the
// dashboard aggregators.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    convertWeight: (w) => w,
    showNotification: vi.fn(),
}));

import {
    BODY_PARTS, BODY_PART_ALIASES, FOCUS_TAGS, MOVEMENT_LABELS, PATTERN_BODY_PART, DASHBOARD_BODY_PARTS,
    normalizeBodyPart, focusTagForBodyPart, canonicalBodyPart, volumeGroup, dashboardBodyPart,
    labelsFor, labelLine, mergeExerciseOverride, movementChoices, movementLabel, findInLibrary, bodyPartFromName,
} from '../../js/core/features/exercise-taxonomy.js';
import { PATTERNS } from '../../js/core/features/movement-patterns.js';
import { getBodyPartForExercise, analyzeWeeklyVolume } from '../../js/core/features/training-rules.js';
import { findJargon } from '../../js/core/features/plain-language.js';
import { AppState } from '../../js/core/utils/app-state.js';
import {
    aggregateVolumeByBodyPart, countSessionsAndSets, classifyBodyPart,
} from '../../js/core/features/metrics/aggregators.js';
import seed from '../../data/exercises.json';

describe('the vocabulary', () => {
    it('has eight body parts and every pattern maps to one of them', () => {
        expect(BODY_PARTS).toEqual(['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Cardio']);
        for (const p of PATTERNS) expect(BODY_PARTS).toContain(PATTERN_BODY_PART[p]);
    });

    it('labels every pattern in plain words, sentence case', () => {
        for (const p of PATTERNS) {
            const label = MOVEMENT_LABELS[p];
            expect(label, p).toBeTruthy();
            expect(label[0]).toBe(label[0].toUpperCase());
            expect(label.slice(1)).toBe(label.slice(1).toLowerCase());
            expect(findJargon(label)).toEqual([]);
        }
        expect(movementLabel('hip-dominant')).toBe('Hinge');
        expect(movementLabel('nope')).toBe('');
    });

    it('every alias resolves to one of the eight or to null', () => {
        for (const v of Object.values(BODY_PART_ALIASES)) {
            if (v !== null) expect(BODY_PARTS).toContain(v);
        }
    });
});

describe('normalizeBodyPart — every stored value found in the data round-trips', () => {
    it.each([
        ['Calves', 'Legs'], ['Abs', 'Core'], ['Lower Back', 'Back'], ['Glutes', 'Glutes'],
        ['General', null], ['Cardio', 'Cardio'], ['Biceps', 'Arms'], ['Triceps', 'Arms'],
        ['Multi-Use', null], ['Full Body', null], ['Neck', null],
        ['chest', 'Chest'], [' Legs ', 'Legs'], ['', null], [null, null],
    ])('%s → %s', (stored, canonical) => {
        expect(normalizeBodyPart(stored)).toBe(canonical);
    });

    it('every bodyPart in the built-in library is canonical or an alias', () => {
        for (const e of seed) expect(normalizeBodyPart(e.bodyPart), e.name).not.toBeNull();
    });

    it('legacy body parts that were really a focus become a tag', () => {
        expect(focusTagForBodyPart('Calves')).toBe('calves');
        expect(focusTagForBodyPart('Abs')).toBe('abs');
        expect(focusTagForBodyPart('Lower Back')).toBe('lower back');
        expect(focusTagForBodyPart('Legs')).toBeNull();
        for (const t of ['calves', 'abs', 'lower back']) expect(FOCUS_TAGS).toContain(t);
    });
});

describe('canonicalBodyPart — the one classifier', () => {
    it.each([
        ['Leg Press', 'Legs'],              // the old bare-"press" rule said Shoulders
        ['Lateral Raise', 'Shoulders'],     // not Back via "lat"
        ['Cable Crossover', 'Chest'],       // not Core via "ab" in "cable"
        ['Leg Curl', 'Legs'],               // not Arms via "curl"
        ['Glute Kickback Machine', 'Glutes'], // not Arms via "kickback"
        ['Reverse Pec Deck', 'Shoulders'],  // not Chest via "pec deck"
        ['Shoulder Shrug', 'Back'],
        ['Adductor Machine', 'Legs'],
        ['Incline Dumbbell Press', 'Chest'],
        ['Deadlift', 'Back'],
        ['Romanian Deadlift', 'Glutes'],
        ['Calf Raise', 'Legs'],
        ['Rowing Machine', 'Cardio'],
        ['Mystery Machine', null],
    ])('%s → %s (name only)', (name, part) => {
        expect(canonicalBodyPart(name)).toBe(part);
    });

    it('the stored label wins, through the alias map', () => {
        expect(canonicalBodyPart({ name: 'Leg Curl', bodyPart: 'Calves' })).toBe('Legs');
        expect(canonicalBodyPart({ name: 'Hip Thrust Machine', bodyPart: 'Core' })).toBe('Core');
        // "General" defers to the next step instead of being a body part.
        expect(canonicalBodyPart({ name: 'Cable Crunch', bodyPart: 'General' })).toBe('Core');
    });

    it('reads the library entry for a bare name', () => {
        const library = [{ name: 'Back Extension Machine', bodyPart: 'Lower Back' }, { name: 'Laying Crunch', bodyPart: 'Abs' }];
        expect(canonicalBodyPart('back extension machine', { library })).toBe('Back');
        expect(canonicalBodyPart('Laying Crunch', { library })).toBe('Core');
        expect(findInLibrary('LAYING CRUNCH', library)?.name).toBe('Laying Crunch');
    });

    it('the name regex is the last resort and has no "ab"-in-"cable" bug', () => {
        expect(bodyPartFromName('Cable Thing')).toBeNull();
        expect(bodyPartFromName('Ab Thing')).toBe('Core');
    });

    it('every built-in keeps its stored body part (folded)', () => {
        for (const e of seed) expect(canonicalBodyPart(e)).toBe(normalizeBodyPart(e.bodyPart));
    });
});

describe('volume groups and dashboard cards', () => {
    it('Glutes counts with Legs; the six cards are the taxonomy minus Cardio, Glutes folded', () => {
        expect(volumeGroup('Glutes')).toBe('Legs');
        expect(volumeGroup('Core')).toBe('Core');
        expect(dashboardBodyPart('Glutes')).toBe('legs');
        expect(dashboardBodyPart(null)).toBe('other');
        const folded = new Set(BODY_PARTS.filter(b => b !== 'Cardio').map(dashboardBodyPart));
        expect([...folded].sort()).toEqual([...DASHBOARD_BODY_PARTS].sort());
    });

    it('getBodyPartForExercise is a thin wrapper — no Calves, Abs or Glutes groups', () => {
        const db = [{ name: 'Calf Raise Machine', bodyPart: 'Calves' }, { name: 'Laying Crunch', bodyPart: 'Abs' }, { name: 'Hip Thrust Machine', bodyPart: 'Glutes' }];
        expect(getBodyPartForExercise('Calf Raise Machine', db)).toBe('Legs');
        expect(getBodyPartForExercise('Laying Crunch', db)).toBe('Core');
        expect(getBodyPartForExercise('Hip Thrust Machine', db)).toBe('Legs');
        // A row's own stored label is read first, through the alias map.
        expect(getBodyPartForExercise({ name: 'Whatever', bodyPart: 'Calves' }, [])).toBe('Legs');
    });

    it('the coach\'s weekly volume has no phantom Calves / Abs rows', () => {
        const db = [
            { name: 'Calf Raise Machine', bodyPart: 'Calves' },
            { name: 'Laying Crunch', bodyPart: 'Abs' },
            { name: 'Leg Press', bodyPart: 'Legs' },
            { name: 'Cable Crunch', bodyPart: 'Core' },
        ];
        const sets = (n) => Array.from({ length: n }, () => ({ reps: 10, weight: 100, completed: true }));
        const workouts = [{
            date: '2026-10-20', completedAt: 'x',
            exercises: { exercise_0: { sets: sets(3) }, exercise_1: { sets: sets(3) }, exercise_2: { sets: sets(4) }, exercise_3: { sets: sets(2) } },
            exerciseNames: { exercise_0: 'Calf Raise Machine', exercise_1: 'Laying Crunch', exercise_2: 'Leg Press', exercise_3: 'Cable Crunch' },
        }];
        const parts = Object.fromEntries(analyzeWeeklyVolume(workouts, db).map(v => [v.bodyPart, v.totalSets]));
        expect(parts).toEqual({ Legs: 7, Core: 5 });
    });
});

describe('dashboard aggregators (classifyBodyPart through the taxonomy)', () => {
    const sets = (n) => Array.from({ length: n }, () => ({ reps: 10, weight: 50, completed: true }));
    const workout = (date, rows) => ({
        date, completedAt: `${date}T12:00:00Z`,
        exercises: Object.fromEntries(rows.map(([, n], i) => [`exercise_${i}`, { sets: sets(n) }])),
        exerciseNames: Object.fromEntries(rows.map(([name], i) => [`exercise_${i}`, name])),
    });

    beforeEach(() => {
        AppState.exerciseDatabase = [
            { name: 'Calf Raise Machine', bodyPart: 'Calves' },
            { name: 'Laying Crunch', bodyPart: 'Abs' },
            { name: 'Back Extension Machine', bodyPart: 'Lower Back' },
            { name: 'Hip Thrust Machine', bodyPart: 'Glutes' },
            { name: 'Leg Curl Machine', bodyPart: 'Legs' },
            { name: 'Pec Deck', bodyPart: 'Chest' },
            { name: 'Treadmill', bodyPart: 'Cardio' },
        ];
    });

    it('calves, glutes, abs and lower back land on a card (legs / core / back)', () => {
        expect(classifyBodyPart('Calf Raise Machine')).toBe('legs');
        expect(classifyBodyPart('Hip Thrust Machine')).toBe('legs');
        expect(classifyBodyPart('Laying Crunch')).toBe('core');
        expect(classifyBodyPart('Back Extension Machine')).toBe('back');
        expect(classifyBodyPart('Treadmill')).toBe('cardio');
    });

    it('the six cards add up to every non-cardio working set — nothing dropped', () => {
        const rows = [
            ['Calf Raise Machine', 4], ['Laying Crunch', 3], ['Back Extension Machine', 3],
            ['Hip Thrust Machine', 3], ['Leg Curl Machine', 4], ['Pec Deck', 3], ['Cable Crossover', 2],
            ['Treadmill', 1],
        ];
        const workouts = [workout('2026-10-20', rows)];
        const range = { start: new Date(2026, 9, 19), end: new Date(2026, 9, 25, 23, 59) };
        const total = rows.filter(([n]) => n !== 'Treadmill').reduce((s, [, n]) => s + n, 0);
        const cardSets = DASHBOARD_BODY_PARTS.reduce((s, bp) => s + countSessionsAndSets(workouts, bp, range).sets, 0);
        expect(cardSets).toBe(total);
        const vol = aggregateVolumeByBodyPart(workouts, range);
        expect(Object.keys(vol).filter(k => !DASHBOARD_BODY_PARTS.includes(k))).toEqual(['cardio']);
        expect(vol.legs).toBe((4 + 3 + 4) * 500);
    });
});

describe('labels for display', () => {
    it('labelsFor / labelLine read the library and let the machine decide a back extension', () => {
        const library = [{ name: 'Back Extension Machine', bodyPart: 'Lower Back', tags: ['lower back'] }];
        expect(labelsFor('Back Extension Machine', { library, equipment: 'Arsenal Strength Alpha — 45 Degree Back Extension' }))
            .toEqual({ bodyPart: 'Back', pattern: 'hip-dominant', movement: 'Hinge' });
        expect(labelLine('Back Extension Machine', { library, equipment: { function: 'Lower Back', name: 'Nautilus Lower Back' } }))
            .toBe('Back · Lower back');
        expect(labelLine('Leg Press')).toBe('Legs · Squat');
        expect(labelLine('Treadmill')).toBe('Cardio'); // never "Cardio · Cardio"
        expect(labelLine('Mystery Machine')).toBe('');
    });

    it('an explicit pattern on the exercise wins over the name', () => {
        expect(labelsFor({ name: 'Weird Station', pattern: 'hip-dominant' }).movement).toBe('Hinge');
    });

    it('movementChoices offers the body part\'s usual movements, plus the current one, or all', () => {
        expect(movementChoices('Legs')).toContain('hip-dominant');
        expect(movementChoices('Legs')).toContain('calf');
        expect(movementChoices('Core', 'hip-dominant')).toContain('hip-dominant');
        expect(movementChoices('Chest', null, { all: true })).toEqual(PATTERNS);
    });
});

describe('mergeExerciseOverride (LB-2)', () => {
    const builtIn = { name: 'Hip Thrust Machine', bodyPart: 'Glutes', tags: ['glutes', 'hamstrings'], pattern: 'hip-dominant' };

    it('an override with empty tags keeps the built-in tags and pattern', () => {
        const m = mergeExerciseOverride(builtIn, { name: 'Hip Thrust Machine', bodyPart: 'Core', tags: [] });
        expect(m.bodyPart).toBe('Core');
        expect(m.tags).toEqual(['glutes', 'hamstrings']);
        expect(m.pattern).toBe('hip-dominant');
    });

    it('an override with its own tags / pattern wins', () => {
        const m = mergeExerciseOverride(builtIn, { tags: ['glutes'], pattern: 'abduction' });
        expect(m.tags).toEqual(['glutes']);
        expect(m.pattern).toBe('abduction');
    });

    it('an invalid override pattern never replaces a valid one; no override = unchanged', () => {
        expect(mergeExerciseOverride(builtIn, { pattern: 'bogus' }).pattern).toBe('hip-dominant');
        expect(mergeExerciseOverride(builtIn, null)).toBe(builtIn);
    });
});
