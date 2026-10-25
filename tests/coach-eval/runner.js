// Coach eval runner (AP-20c): one scenario through the PRODUCTION coach —
// same prompts and model per tier (functions/coach-prompts.js), same tool
// loop (functions/coach-loop.js), same executors (functions/coach-tools.js) —
// against the in-memory Firestore stand-in seeded from the scenario. Only
// the transport differs: buffered Messages API calls instead of SSE.

import { fakeAdminDb } from '../fixtures/admin-db-mock.js';
import { seedDocs, chatMessages, liveMessages, UID } from '../fixtures/coach-scenarios/build.js';
import { makeToolExecutors } from '../../functions/coach-tools.js';
import { buildModeRequest, memoryBlockFor } from '../../functions/coach-prompts.js';
import { runCoachToolLoop, withPromptCaching } from '../../functions/coach-loop.js';
import { routeCoachTurn } from '../../functions/coach-routing.js';
import { buildGraderRequest, parseGrade } from './grader.js';

const API = 'https://api.anthropic.com/v1/messages';

/** A buffered Messages API round in the shape the loop expects. */
export function anthropicRound(apiKey) {
    return async (body) => {
        const r = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`);
        const j = await r.json();
        return {
            blocks: j.content || [],
            stopReason: j.stop_reason,
            usage: { inputTokens: j.usage?.input_tokens || 0, outputTokens: j.usage?.output_tokens || 0 },
        };
    };
}

/**
 * @param {object} scenario - from buildScenarios()
 * @param {object} opts
 * @param {Function} opts.callRound - (body) => {blocks, stopReason, usage}; anthropicRound(key) or a fake
 * @param {string} [opts.model] - override the tier's model (cheap runs)
 */
export async function runScenario(scenario, { callRound, model = null } = {}) {
    const { user, mode, question } = scenario;
    const isLive = mode === 'live';
    const db = fakeAdminDb(seedDocs(user, { live: scenario.live }));
    const executors = makeToolExecutors({ db, userId: UID, source: isLive ? 'live' : 'chat', unit: user.unit, today: user.today });
    const messages = isLive ? liveMessages(user, scenario.live, question) : chatMessages(user, question);
    const route = routeCoachTurn({ question, isLive });
    const modeRequest = buildModeRequest({ isLive, route, memoryBlock: memoryBlockFor(user.coachMemory || []) });
    if (model) modeRequest.model = model;

    const events = [];
    const trace = {};
    const t0 = Date.now();
    let error = null;
    let result = { fullText: '', usage: {}, actionCards: [], proposals: [], toolCalls: [] };
    try {
        result = await runCoachToolLoop({
            callRound, modeRequest, messages: withPromptCaching(messages), executors,
            send: (ev) => events.push(ev), trace,
        });
    } catch (e) {
        error = e.message || String(e);
    }
    return {
        id: scenario.id, mode, route, model: modeRequest.model,
        messages, contextChars: messages[0].content.length,
        text: result.fullText, toolCalls: trace.toolCalls || [], proposals: result.proposals || [],
        actionCards: result.actionCards || [], writes: db.writes, events,
        rounds: trace.rounds || 0, stopReason: trace.stopReason || null,
        usage: result.usage, ms: Date.now() - t0, error,
    };
}

/** Grade one run with the rubric model; null when the grader's reply won't parse. */
export async function gradeRun(scenario, run, { apiKey, model }) {
    const body = buildGraderRequest(scenario, run, { model });
    const round = await anthropicRound(apiKey)(body);
    return parseGrade(round.blocks.filter(b => b.type === 'text').map(b => b.text).join(''));
}
