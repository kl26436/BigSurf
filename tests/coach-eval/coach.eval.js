// Coach eval (AP-20c–e): `npm run eval:coach`.
//
// Runs every scenario through the production coach against the real API,
// checks each answer in code (checks.js), grades it (grader.js), writes
// tests/coach-eval/results/<timestamp>.json and prints a report with the
// regressions against tests/coach-eval/baseline.json.
//
// Env:
//   ANTHROPIC_API_KEY      required (the suite is skipped without it)
//   EVAL_ONLY=id1,id2      run a subset
//   EVAL_MODEL=…           override every tier's model (cheaper iteration;
//                          the baseline is only meaningful at the default)
//   EVAL_GRADER_MODEL=…    rubric model (default: the coach's quick-tier model)
//   EVAL_NO_GRADE=1        skip the rubric
//   EVAL_UPDATE_BASELINE=1 write this run as the new baseline
//
// Cost: the default chat tier is the flagship at xhigh effort — expect a few
// dollars and several minutes for the full set. Use EVAL_ONLY while iterating.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildScenarios } from '../fixtures/coach-scenarios/scenarios.js';
import { runScenario, gradeRun, anthropicRound } from './runner.js';
import { runChecks } from './checks.js';
import { toRecord, compareToBaseline, formatReport } from './report.js';
import { QUICK_COACH_MODEL } from '../../functions/coach-prompts.js';

const KEY = process.env.ANTHROPIC_API_KEY;
const ONLY = (process.env.EVAL_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const DIR = path.resolve(__dirname);
const scenarios = buildScenarios().filter(s => !ONLY.length || ONLY.includes(s.id));
const records = [];

describe.skipIf(!KEY)('coach eval', () => {
    for (const scenario of scenarios) {
        it(`${scenario.id} — ${scenario.title}`, async () => {
            const run = await runScenario(scenario, { callRound: anthropicRound(KEY), model: process.env.EVAL_MODEL || null });
            const checks = runChecks(scenario, run);
            let grade = null;
            if (!process.env.EVAL_NO_GRADE && !run.error) {
                try {
                    grade = await gradeRun(scenario, run, { apiKey: KEY, model: process.env.EVAL_GRADER_MODEL || QUICK_COACH_MODEL });
                } catch (e) {
                    grade = null;
                    console.warn(`grader failed for ${scenario.id}: ${e.message}`);
                }
            }
            records.push(toRecord(scenario, run, checks, grade));
            expect(run.error).toBeNull();
            // Check failures are reported in the summary, not thrown — one
            // bad answer shouldn't hide the rest of the run.
        });
    }

    afterAll(() => {
        if (!records.length) return;
        const current = { at: new Date().toISOString(), model: process.env.EVAL_MODEL || 'production', scenarios: records };
        fs.mkdirSync(path.join(DIR, 'results'), { recursive: true });
        const file = path.join(DIR, 'results', `${current.at.replace(/[:.]/g, '-')}.json`);
        fs.writeFileSync(file, JSON.stringify(current, null, 2));
        const baselinePath = path.join(DIR, 'baseline.json');
        const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null;
        const diff = baseline ? compareToBaseline(baseline, current) : null;
        console.log(`\n${formatReport(current, diff)}\n\nFull run: ${path.relative(process.cwd(), file)}`);
        if (process.env.EVAL_UPDATE_BASELINE && !ONLY.length) {
            fs.writeFileSync(baselinePath, JSON.stringify({ ...current, scenarios: records.map(({ text, ...r }) => r) }, null, 2));
            console.log('Baseline updated.');
        }
    });
});

describe.runIf(!KEY)('coach eval (skipped)', () => {
    it('needs ANTHROPIC_API_KEY', () => {
        console.log('Set ANTHROPIC_API_KEY to run the coach eval (see tests/coach-eval/coach.eval.js).');
    });
});
