/**
 * Coach turn routing (AP-19) and per-turn traces (AP-20a) — pure, server-only.
 *
 * Routing: every chat turn ran the flagship model at xhigh effort, including
 * "what's my bench PR". A lookup is a tool call and one sentence; it goes to
 * the fast model. Anything that asks for judgment, a plan or a change stays
 * on the flagship. When unsure → flagship (a slow good answer beats a fast
 * wrong one).
 *
 * Traces: every turn writes what the model saw, every tool call with its
 * input, output, error flag and time, the rounds, model, tokens and latency
 * — so "the coach said something stupid" becomes a reproducible case.
 */

const crypto = require('crypto');

/** Questions that only fetch a fact. */
const LOOKUP_RE = /^(what('|’)?s|what (is|was|were|are|did)|show( me)?|list|how (many|much|long|often)|when (did|was|is)|did i|have i|which|tell me (my|what))\b/i;
const FACT_RE = /\b(pr|prs|personal record|best|max|last|last time|last session|history|how long|how many|total)\b/i;
/** Anything asking for judgment, a plan or a change. */
const JUDGMENT_RE = /\b(build|create|make|plan|program|block|change|update|edit|rewrite|swap|replace|rotate|add|remove|drop|schedule|move|archive|deload|adjust|fix|should|why|help|recommend|suggest|advice|lighter|heavier|hard|tired|sore|pain|hurt|injur|stall|plateau|progress|better|improve|next)\b/i;

/**
 * @param {object} args
 * @param {string} args.question - the user's typed question (no context block)
 * @param {boolean} [args.isLive]
 * @returns {{tier:'quick'|'deep'|'live', reason:string}}
 */
function routeCoachTurn({ question, isLive = false } = {}) {
    if (isLive) return { tier: 'live', reason: 'live mode' };
    const q = String(question || '').trim();
    if (!q) return { tier: 'deep', reason: 'no question text' };
    if (q.length > 140) return { tier: 'deep', reason: 'long question' };
    if (JUDGMENT_RE.test(q)) return { tier: 'deep', reason: 'asks for judgment or a change' };
    if (LOOKUP_RE.test(q) && FACT_RE.test(q)) return { tier: 'quick', reason: 'fact lookup' };
    return { tier: 'deep', reason: 'default' };
}

function clipText(v, n) {
    const s = typeof v === 'string' ? v : JSON.stringify(v ?? null);
    return s.length > n ? `${s.slice(0, n)}…[+${s.length - n}]` : s;
}

/** Text of the turn's last user message (where a context block rides). */
function lastUserText(messages) {
    const m = [...(messages || [])].reverse().find(x => x?.role === 'user');
    if (!m) return '';
    if (typeof m.content === 'string') return m.content;
    return (m.content || []).map(b => (typeof b?.text === 'string' ? b.text : '')).join('\n');
}

/**
 * The trace document for one turn (written to coachTraces, admin-read only).
 * Context text is kept whole up to 60k chars — the point is reproducing what
 * the model saw — with its size and a hash so identical blocks group.
 */
function buildTraceDoc({
    userId, threadId = null, mode, route, model, messages = [], question = '',
    toolCalls = [], rounds = 0, usage = {}, latencyMs = 0, stopReason = null,
    responseText = '', error = null, now = new Date(),
}) {
    const contextText = lastUserText(messages);
    const turn = (messages || []).filter(m => m?.role === 'user').length;
    return {
        userId,
        threadId: threadId || null,
        turn,
        mode,
        route: route || null,
        model,
        question: clipText(String(question || ''), 2000),
        contextChars: contextText.length,
        contextHash: crypto.createHash('sha256').update(contextText).digest('hex').slice(0, 16),
        contextText: clipText(contextText, 60000),
        hasContextBlock: /\nQuestion: /.test(contextText),
        toolCalls: (toolCalls || []).slice(0, 60).map(c => ({
            round: c.round,
            name: c.name,
            input: clipText(c.input, 2000),
            output: clipText(c.output, 4000),
            isError: !!c.isError,
            ms: c.ms,
        })),
        rounds,
        tokens: { input: usage.inputTokens || 0, output: usage.outputTokens || 0 },
        latencyMs,
        stopReason,
        responseChars: String(responseText || '').length,
        response: clipText(String(responseText || ''), 8000),
        ...(error ? { error: clipText(String(error), 1000) } : {}),
        createdAt: now.toISOString(),
    };
}

module.exports = { routeCoachTurn, buildTraceDoc, lastUserText };
