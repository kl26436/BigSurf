// AU-13 — the planner behind scripts/fix-exercise-patterns.mjs, and the drift
// check that matters: the two bundled exercise libraries must stay identical.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { planPatternFixes } from '../../scripts/lib/pattern-fix-plan.mjs';

const lib = JSON.parse(fs.readFileSync('data/exercises.json', 'utf8'));
const serverLib = JSON.parse(fs.readFileSync('functions/data/exercises.json', 'utf8'));

describe('exercise library patterns (AU-13)', () => {
    it('data/exercises.json and functions/data/exercises.json are identical', () => {
        expect(JSON.stringify(serverLib)).toBe(JSON.stringify(lib));
    });

    it('Back Extension Machine is a hinge in the bundled library', () => {
        expect(lib.find(e => e.name === 'Back Extension Machine')).toMatchObject({ pattern: 'hip-dominant', bodyPart: 'Lower Back' });
    });

    it('plans the live library, overrides and stale template rows — printing what it would touch', () => {
        const plan = planPatternFixes({
            clientLib: lib, serverLib,
            defaults: [{ id: 'd1', name: 'Back Extension Machine', pattern: 'trunk-ext', bodyPart: 'Lower Back' }, { id: 'd2', name: 'Leg Press', pattern: 'knee-dominant' }],
            overrides: [{ id: 'o1', name: 'back extension machine', pattern: 'trunk-ext' }],
            templates: [{ id: 't1', name: 'Lower', exercises: [{ machine: 'Leg Press' }, { machine: 'Back Extension Machine', pattern: 'trunk-ext' }] }],
        });
        expect(plan.refused).toBeNull();
        expect(plan.defaults).toEqual([{ id: 'd1', name: 'Back Extension Machine', from: 'trunk-ext', to: 'hip-dominant', bodyPart: 'Lower Back' }]);
        expect(plan.overrides).toHaveLength(1);
        expect(plan.templates).toEqual([{ templateId: 't1', template: 'Lower', idx: 1, name: 'Back Extension Machine', from: 'trunk-ext', to: 'hip-dominant' }]);
    });

    it('refuses when the two bundled libraries disagree', () => {
        const drifted = lib.map(e => (e.name === 'Leg Press' ? { ...e, pattern: 'hip-dominant' } : e));
        const plan = planPatternFixes({ clientLib: lib, serverLib: drifted, defaults: [{ id: 'd1', name: 'Back Extension Machine', pattern: 'trunk-ext' }] });
        expect(plan.refused).toMatch(/differ \(Leg Press\)/);
        expect(plan.defaults).toEqual([]);
    });
});

import { inferPattern } from '../../js/core/features/movement-patterns.js';

describe('name inference agrees with the library (AU-13)', () => {
    it('back extension / hip extension / reverse hyper infer hinge; lumbar crunch work stays trunk-ext', () => {
        for (const name of ['Back extension', '45° Back Extension', 'DUAL 45 HIP EXTENSION', 'Hyperextension', 'Reverse Hyper']) {
            expect(inferPattern({ name }), name).toBe('hip-dominant');
        }
        expect(inferPattern({ name: 'Lower back machine' })).toBe('trunk-ext');
    });
});
