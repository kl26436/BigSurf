// AU-14 — seeded coach prompts PREFILL the input; they never send on their
// own. Static check over the sources (like window-wiring.test.js), because the
// call sites live in modules whose import graphs pull Firebase. The only
// auto-asks allowed are the ones whose question IS the feature: the
// post-workout session review and the plateau chip (showAICoach's legacy
// { question } / exercise-name forms).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.resolve(__dirname, '../../js/core', f), 'utf8');

describe('seeded coach prompts (AU-14)', () => {
    it('block and program actions prefill — no delayed window.askCoach sends', () => {
        for (const f of ['ui/block-ui.js', 'features/program-session.js']) {
            const src = read(f);
            expect(src, f).not.toMatch(/window\.askCoach\?\.\(/);
            expect(src, f).not.toMatch(/showAICoach\(\{\s*question/);
        }
        expect(read('ui/block-ui.js')).toMatch(/showAICoach\(\{ prefill: question \}\)/);
        expect(read('features/program-session.js').match(/showAICoach\(\{ prefill:/g)).toHaveLength(4);
    });

    it('the program starter prefills; only the session review still auto-asks with { question }', () => {
        const src = read('features/ai-coach-ui.js');
        expect(src).toMatch(/showAICoach\(\{ prefill: PROGRAM_STARTER_PROMPT \}\)/);
        expect(src).not.toMatch(/askCoach\(PROGRAM_STARTER_PROMPT\)/);
        const autoAsks = src.match(/showAICoach\(\{\s*question:/g) || [];
        expect(autoAsks).toHaveLength(1); // reviewSessionWithCoach
        expect(src).toMatch(/export function prefillCoachInput\(text\)/);
    });
});
