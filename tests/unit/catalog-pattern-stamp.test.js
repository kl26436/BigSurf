// LB-5 — catalog machines carry a movement pattern. The stamping planner
// (scripts/lib/catalog-pattern-stamp.mjs) over the REAL classifier and the
// REAL catalog; patternsForEquipment's precedence (doc → catalog →
// exerciseTypes → function text); the rotation engine offering a stamped
// machine.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
    machinePattern, planCatalogPatterns, stampCatalogSource, summarize, HAND_CHECKED, HINGE_FAMILY_RE,
} from '../../scripts/lib/catalog-pattern-stamp.mjs';
import { inferPattern, patternsForEquipment, equipmentPattern, PATTERNS } from '../../js/core/features/movement-patterns.js';
import { PATTERN_BODY_PART, BODY_PART_PATTERNS, normalizeBodyPart } from '../../js/core/features/exercise-taxonomy.js';
import { EQUIPMENT_CATALOG } from '../../js/core/data/equipment-catalog.js';
import {
    slugify, augmentStaticCatalog, resolveCatalogRef, catalogPatternFor,
} from '../../js/core/data/equipment-catalog-helpers.js';
import { rankRotationCandidates } from '../../js/core/features/exercise-rotation.js';

const deps = { inferPattern, PATTERN_BODY_PART, BODY_PART_PATTERNS, normalizeBodyPart };
const decide = (name, bodyPart, type = 'Selectorized', ref = null) => machinePattern({ name, bodyPart, type }, deps, ref);
const augmented = augmentStaticCatalog(EQUIPMENT_CATALOG);
const ARSENAL_45 = 'arsenal-strength/alpha/45-degree-back-extension';

describe('machinePattern — one movement, or none (never a guess)', () => {
    it('a function that names one movement is stamped', () => {
        expect(decide('Iso-Lateral Row', 'Back', 'Plate-Loaded')).toEqual({ pattern: 'horizontal-pull', reason: 'rule' });
        expect(decide('45 Degree Back Extension', 'Back', 'Rack')).toEqual({ pattern: 'hip-dominant', reason: 'rule' });
        expect(decide('Hip Thrust', 'Legs', 'Plate-Loaded').pattern).toBe('hip-dominant');
    });

    it('a combo is stamped only when every station is the same movement', () => {
        expect(decide('Leg Extension / Leg Curl', 'Legs')).toEqual({ pattern: null, reason: 'combo' });
        expect(decide('Shrug/Deadlift', 'Back', 'Plate-Loaded')).toEqual({ pattern: null, reason: 'combo' });
        expect(decide('Biceps-Triceps Combo', 'Arms')).toEqual({ pattern: null, reason: 'combo' });
        expect(decide('Dual Adductor Abductor Machine', 'Legs')).toEqual({ pattern: null, reason: 'combo' });
        expect(decide('Decline Chest Press & Pec Dec Superset', 'Chest', 'Plate-Loaded').pattern).toBe('horizontal-push');
    });

    it('Multi-Use / Full Body stations and body-part contradictions stay null', () => {
        expect(decide('Flat Utility Bench', 'Multi-Use', 'Bench')).toEqual({ pattern: null, reason: 'multi-use' });
        expect(decide('Cable Crossover', 'Full Body', 'Cable')).toEqual({ pattern: null, reason: 'multi-use' });
        // A strength-line "Rowing Machine" filed under Back is not the cardio erg.
        expect(decide('Rowing Machine', 'Back')).toEqual({ pattern: null, reason: 'body-part' });
        expect(decide('Gripper', 'Arms', 'Plate-Loaded')).toEqual({ pattern: null, reason: 'no-match' });
    });

    it('a plain "Back Extension" is lumbar on a weight stack, unknown anywhere else', () => {
        expect(decide('Back Extension', 'Back', 'Selectorized')).toEqual({ pattern: 'trunk-ext', reason: 'back-ext' });
        expect(decide('Low Back Extension', 'Back', 'Selectorized').pattern).toBe('trunk-ext');
        expect(decide('Back Extension', 'Back', 'Plate-Loaded')).toEqual({ pattern: null, reason: 'back-ext' });
        // Anything that says 45° / hyper / bench is not "plain".
        expect(decide('Back Extension Bench', 'Back', 'Plate-Loaded').pattern).toBe('hip-dominant');
    });

    it('the hand-checked table overrides the rules, and every entry is a real catalog machine', () => {
        for (const [ref, { pattern }] of Object.entries(HAND_CHECKED)) {
            expect(resolveCatalogRef(ref, augmented), ref).not.toBeNull();
            expect(pattern === null || PATTERNS.includes(pattern), ref).toBe(true);
        }
        expect(decide('Glute/Ham Developer', 'Legs', 'Rack', 'matrix/magnum/glute-ham-bench'))
            .toEqual({ pattern: null, reason: 'hand-checked' });
        expect(decide('Gluteus Machine', 'Legs', 'Selectorized', 'panatta/fit-evo/gluteus-machine'))
            .toEqual({ pattern: 'hip-dominant', reason: 'hand-checked' });
    });
});

describe('the stamped catalog (js/core/data/equipment-catalog.js)', () => {
    const plan = planCatalogPatterns(EQUIPMENT_CATALOG, deps, slugify);

    it('the plan covers every machine, in source order, with refs the app resolves', () => {
        const machines = EQUIPMENT_CATALOG.flatMap(b => b.lines.flatMap(l => l.machines));
        expect(plan).toHaveLength(machines.length);
        expect(plan.map(r => r.name)).toEqual(machines.map(m => m.name));
        for (const r of plan.slice(0, 50)) expect(resolveCatalogRef(r.ref, augmented)).not.toBeNull();
        for (const r of plan) {
            expect(Object.keys(r).sort()).toEqual(['bodyPart', 'brand', 'line', 'name', 'pattern', 'reason', 'ref']);
            expect(r.pattern === null || PATTERNS.includes(r.pattern)).toBe(true);
        }
    });

    it('the file is up to date with the script (re-run: node scripts/stamp-catalog-patterns.mjs)', () => {
        const source = readFileSync('js/core/data/equipment-catalog.js', 'utf8');
        expect(stampCatalogSource(source, plan)).toBe(source);
        const machines = EQUIPMENT_CATALOG.flatMap(b => b.lines.flatMap(l => l.machines));
        expect(machines.map(m => m.pattern || null)).toEqual(plan.map(r => r.pattern));
    });

    it('most machines are stamped; every null has a reason', () => {
        const s = summarize(plan);
        expect(s.stamped / s.total).toBeGreaterThan(0.7);
        expect(plan.filter(r => !r.pattern).every(r => ['no-match', 'combo', 'multi-use', 'body-part', 'back-ext', 'hand-checked'].includes(r.reason))).toBe(true);
    });

    it('the hinge family the hand-check covers resolves the way the audit wants', () => {
        const by = (ref) => plan.find(r => r.ref === ref)?.pattern;
        expect(by(ARSENAL_45)).toBe('hip-dominant');
        expect(by('gym80/sygnum/45-back-extension')).toBe('hip-dominant');
        expect(by('panatta/freeweight-special/reverse-hyperextension')).toBe('hip-dominant');
        expect(by('panatta/fit-evo/lower-back')).toBe('trunk-ext');
        expect(by('nautilus/inspiration/back-extension')).toBe('trunk-ext');
        expect(by('arsenal-strength/alpha/glute-ham-developer')).toBeNull();
        expect(plan.filter(r => HINGE_FAMILY_RE.test(r.name)).length).toBeGreaterThan(100);
    });
});

describe('stampCatalogSource', () => {
    const src = [
        'export const EQUIPMENT_CATALOG = [',
        "    { name: 'Lat Pulldown', bodyPart: 'Back' },",
        "    { name: 'Leg Extension / Leg Curl', bodyPart: 'Legs', pattern: 'knee-flexion' },",
        "    { name: 'Olympic Flat Bench', bodyPart: 'Chest', type: 'Bench', pattern: 'vertical-pull' },",
        '];',
    ].join('\n');
    const plan = [
        { name: 'Lat Pulldown', pattern: 'vertical-pull' },
        { name: 'Leg Extension / Leg Curl', pattern: null },
        { name: 'Olympic Flat Bench', pattern: 'horizontal-push' },
    ];

    it('adds, replaces and removes the field; idempotent', () => {
        const out = stampCatalogSource(src, plan);
        expect(out.split('\n').slice(1, 4)).toEqual([
            "    { name: 'Lat Pulldown', bodyPart: 'Back', pattern: 'vertical-pull' },",
            "    { name: 'Leg Extension / Leg Curl', bodyPart: 'Legs' },",
            "    { name: 'Olympic Flat Bench', bodyPart: 'Chest', type: 'Bench', pattern: 'horizontal-push' },",
        ]);
        expect(stampCatalogSource(out, plan)).toBe(out);
    });

    it('refuses to write when the source and the plan disagree', () => {
        expect(() => stampCatalogSource(src, plan.slice(0, 2))).toThrow(/source shape changed/);
        expect(() => stampCatalogSource(src, [...plan, { name: 'Extra', pattern: null }])).toThrow(/machine lines/);
        expect(() => stampCatalogSource(src, [plan[1], plan[0], plan[2]])).toThrow(/source shape changed/);
    });
});

describe('catalogPatternFor', () => {
    it('reads the first catalog that has the field — a Firestore copy seeded before LB-5 falls through', () => {
        const firestoreOld = augmented.map(b => ({
            ...b, lines: b.lines.map(l => ({ ...l, machines: l.machines.map(({ pattern: _p, ...m }) => m) })),
        }));
        expect(catalogPatternFor(ARSENAL_45, firestoreOld)).toBeNull();
        expect(catalogPatternFor(ARSENAL_45, firestoreOld, augmented)).toBe('hip-dominant');
        expect(catalogPatternFor(ARSENAL_45, null, augmented)).toBe('hip-dominant');
        expect(catalogPatternFor('nope/nope/nope', augmented)).toBeNull();
    });
});

describe('patternsForEquipment — doc → catalog → exerciseTypes → function text', () => {
    const catalogPattern = (ref) => catalogPatternFor(ref, augmented);

    it('acceptance: Arsenal Strength Alpha — 45 Degree Back Extension from the catalog, no exerciseTypes at all → hinge', () => {
        // Nothing but the catalog link — no name, no function, no exercises.
        expect(patternsForEquipment({ catalogRef: ARSENAL_45, exerciseTypes: [] }, undefined, { catalogPattern }))
            .toEqual(['hip-dominant']);
        // …and without the catalog there is nothing to go on.
        expect(patternsForEquipment({ catalogRef: ARSENAL_45, exerciseTypes: [] })).toEqual([]);
    });

    it('1. the doc\'s own pattern wins over everything, mis-links included', () => {
        const doc = { pattern: 'knee-flexion', catalogRef: ARSENAL_45, exerciseTypes: ['Seated Row Machine', 'Hip Thrust Machine'], function: 'Seated Leg Curling' };
        expect(patternsForEquipment(doc, undefined, { catalogPattern })).toEqual(['knee-flexion']);
    });

    it('2. then the catalog entry\'s pattern', () => {
        const doc = { catalogRef: ARSENAL_45, exerciseTypes: ['Seated Row Machine'], function: 'Lat Pulldown' };
        expect(patternsForEquipment(doc, undefined, { catalogPattern })).toEqual(['hip-dominant']);
    });

    it('3. then the linked exercises (an unknown stored pattern is ignored)', () => {
        const doc = { pattern: 'not-a-pattern', exerciseTypes: ['Seated Row Machine', 'Lat Pulldown'], function: 'Leg Curl' };
        expect(patternsForEquipment(doc).sort()).toEqual(['horizontal-pull', 'vertical-pull']);
    });

    it('4. the function text last', () => {
        expect(patternsForEquipment({ exerciseTypes: [], function: 'Seated Leg Curl', name: 'Hammer Strength — Seated Leg Curl' }))
            .toEqual(['knee-flexion']);
    });

    it('equipmentPattern validates both sources', () => {
        expect(equipmentPattern({ pattern: 'hip-dominant' })).toBe('hip-dominant');
        expect(equipmentPattern({ catalogRef: 'x/y/z' }, { catalogPattern: () => 'bogus' })).toBeNull();
        expect(equipmentPattern(null)).toBeNull();
    });
});

describe('rotation offers a stamped machine even when its links don\'t say so', () => {
    it('a hinge-stamped machine with no exerciseTypes is a hip-dominant candidate under its own name', () => {
        const doc = { name: 'Arsenal Strength Alpha — 45 Degree Back Extension', pattern: 'hip-dominant', exerciseTypes: [], locations: ['Gym'], lastUsed: null };
        const out = rankRotationCandidates({ pattern: 'hip-dominant', equipment: [doc], location: 'Gym' });
        expect(out.candidates).toHaveLength(1);
        expect(out.candidates[0]).toMatchObject({ equipment: doc.name, name: doc.name, pattern: 'hip-dominant' });
    });

    it('a stamped leg curl mis-linked to "Seated Row Machine" is no longer a row candidate', () => {
        const doc = { name: 'Panatta — Seated Leg Curling', pattern: 'knee-flexion', exerciseTypes: ['Seated Row Machine', 'Seated Leg Curl Machine'], locations: ['Gym'] };
        expect(rankRotationCandidates({ pattern: 'horizontal-pull', equipment: [doc], location: 'Gym' }).candidates).toEqual([]);
        expect(rankRotationCandidates({ pattern: 'knee-flexion', equipment: [doc], location: 'Gym' }).candidates[0])
            .toMatchObject({ name: 'Seated Leg Curl Machine' });
    });
});
