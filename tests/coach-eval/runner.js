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
import { buildWeeklyReviewRequest } from '../../functions/weekly-review.js';
import reportCardRequest from '../../functions/report-card-request.js';
import { parseReportCardReply } from '../../functions/report-card.js';
import planRoll from '../../functions/plan-roll.js';

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
    if (scenario.mode === 'weekly') return runWeeklyReview(scenario, { callRound, model });
    if (scenario.mode === 'reportcard') return runReportCard(scenario, { callRound, model });
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

/**
 * TP-2 / A6 — the Sunday report card: the production request builder over the
 * seeded data (clock = the scenario's Sunday 19:30 Chicago), one API round,
 * the reply parsed the way the job parses it. `text` is the narrative + why
 * (what the user reads from the model); `card` / `chosen` feed the checks.
 */
async function runReportCard(scenario, { callRound, model = null }) {
    const { user } = scenario;
    const db = fakeAdminDb(seedDocs(user));
    const t0 = Date.now();
    const now = new Date(`${user.today}T19:30:00-05:00`);
    // TP-3 — the Sunday job rolls the plan before it builds the card.
    await planRoll.rollPlanForUser(db.collection('users').doc(UID), { now });
    const built = await reportCardRequest.buildReportCardRequest(db.collection('users').doc(UID), { force: true, now });
    // The roll is the job's write, not the model's: count only what follows.
    const writesBefore = db.writes.length;
    const base = { id: scenario.id, mode: 'reportcard', route: { tier: 'reportcard', reason: 'Sunday report card' }, toolCalls: [], proposals: [], actionCards: [], events: [], rounds: 0 };
    if (built.status) return { ...base, model: null, messages: [{ role: 'user', content: '' }], contextChars: 0, text: '', writes: db.writes, usage: {}, ms: 0, error: `card skipped: ${built.status}` };
    const request = model ? { ...built.request, model } : built.request;
    let raw = '';
    let usage = {};
    let error = null;
    try {
        const round = await callRound(request);
        raw = (round.blocks || []).filter(b => b.type === 'text').map(b => b.text).join('');
        usage = round.usage;
    } catch (e) {
        error = e.message || String(e);
    }
    const reply = parseReportCardReply(raw, built.card);
    return {
        ...base, model: request.model, messages: request.messages, contextChars: request.messages[0].content.length,
        text: [reply.narrative, reply.why].filter(Boolean).join(' '), raw, card: built.card, chosen: reply.chosen, fallback: reply.fallback,
        writes: db.writes.slice(writesBefore), rounds: 1, stopReason: null, usage, ms: Date.now() - t0, error,
    };
}

/**
 * AU-4 — the weekly review: built by functions/weekly-review.js from the
 * seeded data (clock pinned to the scenario's today), one API round, no tools.
 */
async function runWeeklyReview(scenario, { callRound, model = null }) {
    const { user } = scenario;
    const db = fakeAdminDb(seedDocs(user));
    const t0 = Date.now();
    const built = await buildWeeklyReviewRequest(db.collection('users').doc(UID), {
        db, force: true, now: new Date(`${user.today}T18:00:00Z`),
    });
    const base = { id: scenario.id, mode: 'weekly', route: { tier: 'weekly', reason: 'weekly review' }, toolCalls: [], proposals: [], actionCards: [], events: [], rounds: 0 };
    if (built.status) return { ...base, model: null, messages: [{ role: 'user', content: '' }], contextChars: 0, text: '', writes: db.writes, usage: {}, ms: 0, error: `review skipped: ${built.status}` };
    const request = model ? { ...built.request, model } : built.request;
    let text = '';
    let usage = {};
    let error = null;
    try {
        const round = await callRound(request);
        text = (round.blocks || []).filter(b => b.type === 'text').map(b => b.text).join('');
        usage = round.usage;
    } catch (e) {
        error = e.message || String(e);
    }
    return {
        ...base, model: request.model, messages: request.messages, contextChars: request.messages[0].content.length,
        text, writes: db.writes, rounds: 1, stopReason: null, usage, ms: Date.now() - t0, error,
    };
}
