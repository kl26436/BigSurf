// AP-20b–e without the API: the scenario fixtures produce the rules state
// they claim (so a failing eval means the coach, not the fixture), the runner
// drives the production loop/tools against the in-memory DB with a scripted
// model, and the checks/grader/report behave.

import { describe, it, expect } from 'vitest';
import { buildScenarios } from '../fixtures/coach-scenarios/scenarios.js';
import { runScenario } from '../coach-eval/runner.js';
import { runChecks, weightsInText, isLoadable, wordCount, verdictQuoted } from '../coach-eval/checks.js';
import { parseGrade, verdictsExcerpt } from '../coach-eval/grader.js';
import { toRecord, compareToBaseline, formatReport } from '../coach-eval/report.js';

const SCENARIOS = buildScenarios();
const byId = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));

/** A fake model: each round returns the next scripted reply. */
function scripted(...rounds) {
    let i = 0;
    const bodies = [];
    const callRound = async (body) => {
        bodies.push(body);
        const r = rounds[Math.min(i++, rounds.length - 1)];
        return { blocks: r, stopReason: r.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn', usage: { inputTokens: 10, outputTokens: 5 } };
    };
    return { callRound, bodies };
}
const tool = (name, input = {}, id = `tu_${name}`) => ({ type: 'tool_use', id, name, input });
const say = (text) => ({ type: 'text', text });
const contextOf = async (id) => (await runScenario(byId[id], { callRound: scripted([say('ok')]).callRound })).messages[0].content;

describe('scenario fixtures (AP-20b)', () => {
    it('has the planned coverage', () => {
        expect(SCENARIOS.length).toBeGreaterThanOrEqual(14);
        expect(new Set(SCENARIOS.map(s => s.id)).size).toBe(SCENARIOS.length);
        expect(SCENARIOS.filter(s => s.mode === 'live').length).toBeGreaterThanOrEqual(2);
    });

    it('the stall ladder fixtures land on rungs 1, 2 and 3', () => {
        expect(byId['stall-rung-1'].expect.verdictRule).toMatchObject({ action: 'chase-rep', rung: 1, weight: 185 });
        expect(byId['stall-rung-2'].expect.verdictRule).toMatchObject({ action: 'back-off', rung: 2 });
        expect(byId['stall-rung-3'].expect.verdictRule).toMatchObject({ action: 'rotate', rung: 3 });
    });

    it('the chat context carries what each scenario is about', async () => {
        expect(await contextOf('stall-rung-1')).toMatch(/Flat Barbell Bench Press.*stuck at/);
        expect(await contextOf('deload-go-heavier')).toMatch(/LIGHTER WEEK/);
        expect(await contextOf('rest-day')).toMatch(/rest/i);
        expect(await contextOf('fatigue-rpe')).toContain('fatigue: effort 7.5→8.5→9 of 10 at 185 over 3 sessions');
        expect(await contextOf('injury-push-day')).toContain('Injuries / limitations: Left shoulder impingement');
        const kg = await contextOf('kg-user');
        expect(kg).toContain('Unit: kg');
        expect(kg).not.toMatch(/\d lbs\b/);
    });

    it('live scenarios send the live snapshot with the rules verdict per exercise', async () => {
        const run = await runScenario(byId['live-machine-taken'], { callRound: scripted([say('Use the hack squat.')]).callRound });
        expect(run.route.tier).toBe('live');
        expect(run.messages[0].content).toMatch(/^Live workout state:\nWorkout: Leg day/);
        expect(run.messages[0].content).toMatch(/→ Leg Press \[Hammer Strength Leg Press\]: 0\/3 sets.*rule: /);
    });

    it('the PR lookup takes the quick route; the rest of chat stays deep', async () => {
        const quick = await runScenario(byId['pr-lookup'], { callRound: scripted([say('225.')]).callRound });
        expect(quick).toMatchObject({ route: { tier: 'quick' }, model: 'claude-sonnet-5' });
        const deep = await runScenario(byId['stall-rung-1'], { callRound: scripted([say('Hold.')]).callRound });
        expect(deep.route.tier).toBe('deep');
    });
});

describe('runner (AP-20c) — production loop + tools against the seeded DB', () => {
    it('runs real read tools and returns their output to the model', async () => {
        const { callRound, bodies } = scripted(
            [tool('get_verdicts')],
            [say('**Verdict:** hold 185 and chase 7 reps.'), tool('log_advice', { type: 'progression', exercise: 'Flat Barbell Bench Press', detail: 'Hold 185, chase 7' })],
            [say('Done.')],
        );
        const run = await runScenario(byId['stall-rung-1'], { callRound });
        expect(run.error).toBeNull();
        expect(run.toolCalls.map(c => c.name)).toEqual(['get_verdicts', 'log_advice']);
        expect(run.toolCalls[0].isError).toBe(false);
        expect(JSON.stringify(run.toolCalls[0].output)).toContain('chase-rep');
        // The tool result went back to the model on the next round.
        expect(JSON.stringify(bodies[1].messages.at(-1).content)).toContain('tool_result');
        expect(run.writes.every(w => /coachAdvice/.test(w.path))).toBe(true);
        expect(runChecks(byId['stall-rung-1'], run).filter(c => !c.pass)).toEqual([]);
    });

    it('a proposal goes through validate + checkProposal and is recorded', async () => {
        const run = await runScenario(byId['hard-week'], {
            callRound: scripted([tool('propose_week_adjustment', { weightPct: -10, why: 'last week was hard' })], [say('Lighter week queued — tap to apply.')]).callRound,
        });
        expect(run.proposals).toHaveLength(1);
        expect(run.proposals[0]).toMatchObject({ kind: 'week_adjustment', weightPct: -10, label: 'Lighter week' });
        expect(runChecks(byId['hard-week'], run).find(c => c.id === 'must-call').pass).toBe(true);
    });

    it('a write on a question fails the no-writes check (tool and DB both)', async () => {
        const run = await runScenario(byId['week-check-in'], {
            callRound: scripted([tool('archive_template', { templateId: 'pull' })], [say('Archived pull day.')]).callRound,
        });
        expect(run.writes.some(w => w.path.endsWith('workoutTemplates/pull'))).toBe(true);
        expect(runChecks(byId['week-check-in'], run).find(c => c.id === 'no-writes-on-question')).toMatchObject({ pass: false });
    });

    it('an API failure is reported, not thrown', async () => {
        const run = await runScenario(byId['rest-day'], { callRound: async () => { throw new Error('Claude API 529'); } });
        expect(run.error).toBe('Claude API 529');
    });
});

describe('checks (AP-20d)', () => {
    it('finds weights, ignores sets×reps', () => {
        expect(weightsInText('Do 3×8 at 185×6, then 165 lbs; 82.5 kg later').map(w => w.weight)).toEqual([185, 165, 82.5]);
    });

    it('loadable = on the plate grid or the grid of a lifted weight', () => {
        expect(isLoadable(185, { inc: 10, logged: [185] })).toBe(true);
        expect(isLoadable(120, { inc: 10, logged: [185] })).toBe(true);
        expect(isLoadable(187.5, { inc: 10, logged: [185] })).toBe(false); // no 2.5s
    });

    it('scenario expectations fail when the answer misses them', () => {
        const run = { mode: 'chat', route: { tier: 'deep' }, text: 'Go up to 195×8 on bench next time.', toolCalls: [], writes: [] };
        const failed = runChecks(byId['stall-rung-1'], run).filter(c => !c.pass).map(c => c.id);
        expect(failed).toEqual(expect.arrayContaining(['mentions:185', 'no-bump', 'log-advice']));
    });

    it('respects the injury: an overhead press in a written template fails', () => {
        const run = {
            mode: 'chat', route: { tier: 'deep' }, text: 'Built it.', writes: [],
            toolCalls: [{ name: 'create_workout_template', input: { name: 'Push', exercises: [{ machine: 'Dumbbell Shoulder Press', equipment: 'Dumbbells' }] }, isError: false }],
        };
        expect(runChecks(byId['injury-push-day'], run).find(c => c.id === 'respects-injury')).toMatchObject({ pass: false, detail: 'Dumbbell Shoulder Press' });
    });

    it('a machine that is not at the gym fails equipment-exists', () => {
        const run = {
            mode: 'live', route: { tier: 'live' }, text: 'Swap to hack squat.', writes: [],
            toolCalls: [{ name: 'propose_swap', input: { fromExercise: 'Leg Press', toExercise: 'Hack Squat', equipment: 'Cybex Hack Squat' } }],
        };
        expect(runChecks(byId['live-machine-taken'], run).find(c => c.id === 'equipment-exists')).toMatchObject({ pass: false });
        expect(wordCount('**Verdict:** hold — 185×6.')).toBe(3);
    });
});

describe('grader + report (AP-20e)', () => {
    it('parses the rubric JSON, rejects out-of-range scores', () => {
        expect(parseGrade('```json\n{"grounded":5,"oneRecommendation":4,"explainsWhy":4,"consistentWithVerdict":5,"note":"good"}\n```'))
            .toMatchObject({ grounded: 5, mean: 4.5, note: 'good' });
        expect(parseGrade('{"grounded":7,"oneRecommendation":4,"explainsWhy":4,"consistentWithVerdict":5}')).toBeNull();
        expect(parseGrade('no json')).toBeNull();
        // AU-7 — low scores need evidence, else they're flagged.
        expect(parseGrade('{"grounded":2,"oneRecommendation":4,"explainsWhy":4,"consistentWithVerdict":5}').unsupported).toEqual(['grounded']);
        expect(parseGrade('{"grounded":2,"oneRecommendation":4,"explainsWhy":4,"consistentWithVerdict":5,"evidence":{"grounded":"absent: no numbers"}}').unsupported).toEqual([]);
        expect(verdictsExcerpt('Today: x\n\nRules verdicts (computed):\n- Bench: hold\n\nTraining')).toMatch(/^Rules verdicts[\s\S]*Bench: hold$/);
    });

    it('a regression is a check that newly fails or a grade that drops a point', () => {
        const base = { scenarios: [{ id: 'a', failed: [], grade: { mean: 4.5 } }, { id: 'b', failed: ['length'], grade: null }] };
        const now = {
            at: 't', scenarios: [
                { id: 'a', failed: ['no-bump'], grade: { mean: 3.25 }, passed: 5, total: 6, words: 80, tools: [], rounds: 1, ms: 1000 },
                { id: 'b', failed: [], grade: null, passed: 6, total: 6, words: 90, tools: ['get_verdicts'], rounds: 2, ms: 2000 },
            ],
        };
        const diff = compareToBaseline(base, now);
        expect(diff.regressions).toEqual(['a: no-bump now fails', 'a: grade 4.5 → 3.25']);
        expect(diff.improvements).toEqual(['b: length now passes']);
        expect(formatReport(now, diff)).toContain('Checks: 11/12');
        const rec = toRecord(byId['rest-day'], { model: 'm', route: { tier: 'deep' }, text: 'Rest today.', toolCalls: [], rounds: 1, usage: {}, ms: 5 }, [{ id: 'x', pass: true }], null);
        expect(rec).toMatchObject({ id: 'rest-day', passed: 1, total: 1, failed: [], words: 2 });
    });
});

describe('audit additions (AU-2, AU-4)', () => {
    it('AU-2: rising RPE on a rising load is still a bump', () => {
        expect(byId['fatigue-rising-load'].expect.verdictRule).toMatchObject({ action: 'bump', weight: 195 });
        expect(byId['fatigue-rising-load'].expect.verdictRule.fatigued).toBeUndefined();
    });

    it("the specimen: last block week is a deload, and today's push is in the context", async () => {
        const ctx = await contextOf('specimen-session-review');
        expect(ctx).toMatch(/LIGHTER WEEK/);
        expect(ctx).toMatch(/2026-10-23 · Push day[\s\S]*Flat Barbell Bench Press \[Flat Bench\]: 3×185/);
    });

    it('swap-via-rotation: the engine offers the never-used standing curl', async () => {
        const run = await runScenario(byId['swap-via-rotation'], {
            callRound: scripted([tool('get_rotation_candidates', { exercise: 'Seated Leg Curl Machine' })], [say('Swap in the Standing Leg Curl Machine — never used.')]).callRound,
        });
        expect(JSON.stringify(run.toolCalls[0].output)).toContain('Standing Leg Curl');
        expect(runChecks(byId['swap-via-rotation'], run).filter(c => !c.pass)).toEqual([]);
    });

    it('live-knee-pain: skip + remember passes; a swap without remembering fails', async () => {
        const good = await runScenario(byId['live-knee-pain'], {
            callRound: scripted([tool('propose_skip_exercise', { exercise: 'Leg Press', why: 'left knee pain' }), tool('remember_fact', { text: 'Left knee pain on leg press (2026-10-23)' }, 'tu_mem')], [say('Skip leg press today — noted the knee.')]).callRound,
        });
        expect(good.proposals[0]).toMatchObject({ kind: 'skip_exercise', exercise: 'Leg Press' });
        expect(runChecks(byId['live-knee-pain'], good).filter(c => !c.pass)).toEqual([]);
        const bad = { mode: 'live', route: { tier: 'live' }, text: 'Push through it.', writes: [], toolCalls: [] };
        expect(runChecks(byId['live-knee-pain'], bad).filter(c => !c.pass).map(c => c.id))
            .toEqual(expect.arrayContaining(['must-call', 'must-call:remember_fact', 'not-mentions:push (through|it)']));
    });

    it('weekly-review: the production request, built from the seeded data', async () => {
        const run = await runScenario(byId['weekly-review'], { callRound: scripted([say('- Bench held 185.')]).callRound });
        expect(run.error).toBeNull();
        expect(run.model).toBe('claude-sonnet-5');
        expect(run.messages[0].content).toMatch(/^User profile: goal: strength/);
        expect(run.messages[0].content).toContain("This week's training log (weights in lbs)");
        expect(run.messages[0].content).toContain('Rules verdicts');
        expect(run.writes).toEqual([]);
        expect(run.text).toBe('- Bench held 185.');
    });

    it('verdict-quoted: weight and action, both', () => {
        expect(verdictQuoted('Hold 185 and chase a 7th rep.', { action: 'chase-rep', weight: 185 }).pass).toBe(true);
        expect(verdictQuoted('Hold steady and chase a rep.', { action: 'chase-rep', weight: 185 }).pass).toBe(false);
        expect(verdictQuoted('Go up to 195 next time.', { action: 'bump', weight: 195 }).pass).toBe(true);
        expect(verdictQuoted('Swap it for the T-bar row.', { action: 'rotate', weight: 185 }).pass).toBe(true);
    });
});

describe('TP-0 — the no-jargon checks', () => {
    it('every scenario context is jargon-free as built (a leak is fixed at its source)', async () => {
        for (const s of SCENARIOS.filter(x => x.mode !== 'weekly')) {
            const run = await runScenario(s, { callRound: scripted([say('Hold 185 for 8 — chase a rep.')]).callRound });
            const c = runChecks(s, run).find(x => x.id === 'no-jargon-context');
            expect(c, s.id).toMatchObject({ pass: true });
        }
    });

    it('flags jargon in the answer, unless the user used the term first', async () => {
        const s = byId['stall-rung-1'];
        const run = await runScenario(s, { callRound: scripted([say('Your e1RM is flat — deload next week.')]).callRound });
        expect(runChecks(s, run).find(c => c.id === 'no-jargon')).toMatchObject({ pass: false, detail: 'e1RM, deload' });
        const asked = { ...s, question: 'What does e1RM mean?' };
        const run2 = await runScenario(asked, { callRound: scripted([say('e1RM is your estimated max — what you could lift once.')]).callRound });
        expect(runChecks(asked, run2).find(c => c.id === 'no-jargon')).toMatchObject({ pass: true });
    });
});

describe('TP-2 / A6 — the report card eval mode', () => {
    it('each report-card fixture offers the option its scenario expects (a failure is the model, not the fixture)', async () => {
        for (const id of ['reportcard-good-week', 'reportcard-effort-creeping', 'reportcard-wave-ending']) {
            const s = byId[id];
            const run = await runScenario(s, { callRound: scripted([say(`{"headline":"A week.","choice":"${s.expect.choice}","why":"The card says so."}`)]).callRound });
            expect(run.error, id).toBeNull();
            expect(run.card.options.map(o => o.kind), id).toContain(s.expect.choice);
            const checks = runChecks(s, run);
            expect(checks.filter(c => !c.pass).map(c => c.id), id).toEqual([]);
        }
    });

    it('flags an invented number and an option the card never offered', async () => {
        const s = byId['reportcard-good-week'];
        const run = await runScenario(s, { callRound: scripted([say('{"headline":"Bench is up 1234 lbs this week.","choice":"next-wave","why":"x"}')]).callRound });
        const failed = runChecks(s, run).filter(c => !c.pass).map(c => c.id);
        expect(failed).toEqual(expect.arrayContaining(['chosen-option-valid', 'numbers-match-card']));
        // A valid but wrong pick: the tired week must not "stay".
        const t = byId['reportcard-effort-creeping'];
        const run2 = await runScenario(t, { callRound: scripted([say('{"headline":"A week.","choice":"stay","why":"Fine."}')]).callRound });
        expect(runChecks(t, run2).find(c => c.id === 'chosen-option-expected')).toMatchObject({ pass: false });
    });
});
