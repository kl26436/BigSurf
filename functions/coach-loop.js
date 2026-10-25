// Coach tool loop — functions/coach-loop.js
//
// Server-only (not mirrored). The one implementation of "call the model; when
// it stops for tool_use, run the tools, append the results, call again",
// shared by coachChatStream (index.js) and the AP-20 eval runner, so the eval
// exercises the production loop rather than a copy of it. The caller supplies
// `callRound` (streaming in production, buffered in the eval) and the
// executors (Admin SDK in production, the in-memory Firestore stand-in in the
// eval).

const { validateProposal, TOOL_STATUS } = require('./coach-tools');

const MAX_TOOL_ROUNDS = 12;

/**
 * Prompt caching for chat threads: the FIRST user turn carries the big
 * training-context block and is resent verbatim every turn — mark it as a
 * cache breakpoint so the API caches everything up to and including it.
 * String content becomes a single text block; already-structured content is
 * passed through untouched.
 */
function withPromptCaching(messages) {
    return (messages || []).map((m, i) => {
        if (i === 0 && m.role === 'user' && typeof m.content === 'string') {
            return {
                role: 'user',
                content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }],
            };
        }
        return m;
    });
}

/**
 * Run one coach turn to completion.
 * @param {object} args
 * @param {(body: object, emittedTextBefore: boolean) => Promise<{blocks, stopReason, usage}>} args.callRound
 * @param {object} args.modeRequest - model/max_tokens/system/tools (coach-prompts.buildModeRequest)
 * @param {Array} args.messages - API messages (caching already applied)
 * @param {object} args.executors - makeToolExecutors(...) (incl. checkProposal)
 * @param {(ev: object) => void} [args.send] - client events: status / proposal / action_card / delta
 * @param {object} [args.trace] - mutated as the turn runs (rounds, stopReason, toolCalls) so a
 *   failure mid-turn still leaves a partial trace (AP-20a)
 * @returns {Promise<{fullText, usage, actionCards, proposals, rounds, stopReason, toolCalls}>}
 */
async function runCoachToolLoop({ callRound, modeRequest, messages, executors, send = () => {}, trace = {}, maxRounds = MAX_TOOL_ROUNDS }) {
    trace.toolCalls = trace.toolCalls || [];
    let msgs = messages;
    let fullText = '';
    const usage = { inputTokens: 0, outputTokens: 0 };
    const actionCards = [];
    const proposals = [];

    for (let round = 0; round < maxRounds; round++) {
        const roundResult = await callRound({ ...modeRequest, messages: msgs }, fullText.length > 0);

        const { blocks, stopReason } = roundResult;
        trace.rounds = round + 1;
        trace.stopReason = stopReason;
        usage.inputTokens += roundResult.usage?.inputTokens || 0;
        usage.outputTokens += roundResult.usage?.outputTokens || 0;
        const roundText = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
        if (roundText) fullText += (fullText ? '\n\n' : '') + roundText;

        if (stopReason !== 'tool_use') break;

        // Cap exhausted mid-task: say so instead of truncating silently
        // (live-tested failure: a batch archive died half-done, mutely).
        if (round === maxRounds - 1) {
            const note = '\n\n(I hit my action limit before finishing — say "continue" and I\'ll pick up where I left off.)';
            send({ type: 'delta', text: note });
            fullText += note;
            break;
        }

        const toolUses = blocks.filter(b => b.type === 'tool_use');
        if (toolUses.length === 0) break; // defensive — shouldn't happen
        const resultBlocks = [];
        for (const tu of toolUses) {
            // log_advice is deliberately silent — no status flicker.
            if (tu.name !== 'log_advice') send({ type: 'status', text: TOOL_STATUS[tu.name] || 'Working…' });
            let out;
            const t0 = Date.now();
            try {
                if (tu.name.startsWith('propose_')) {
                    // Proposals: validate + echo, ZERO I/O — the client
                    // applies them only on a user tap (the active workout
                    // is client-owned state; a server write would race
                    // the debounced auto-save).
                    // AP-18 — shape (pure) then data checks: the template
                    // exists, the load obeys the rules, the swap's
                    // equipment is at this gym. Nothing is echoed to the
                    // client unless both pass.
                    const v = validateProposal(tu.name, tu.input);
                    const checked = v.ok ? await executors.checkProposal(tu.name, v.proposal) : v;
                    if (v.ok && !checked.error) {
                        send({ type: 'proposal', proposal: checked.proposal });
                        proposals.push(checked.proposal);
                        out = { result: { proposed: true, proposal: checked.proposal } };
                    } else {
                        out = { error: checked.error };
                    }
                } else {
                    out = executors[tu.name]
                        ? await executors[tu.name](tu.input)
                        : { error: `Unknown tool: ${tu.name}` };
                }
            } catch (e) {
                // Real exception to the logs, a safe summary to the model.
                console.error(`❌ coach tool ${tu.name} failed:`, e);
                out = { error: { code: 'internal', message: 'The tool hit an internal error.', hint: 'Tell the user the action could not be completed; do not retry.' } };
            }
            // Every error reaches the model in ONE shape (AP-18).
            if (out.error && typeof out.error === 'string') out = { ...out, error: { code: 'invalid_input', message: out.error } };
            trace.toolCalls.push({
                round: trace.rounds, name: tu.name, input: tu.input,
                output: out.error ? { error: out.error } : (out.result ?? out),
                isError: !!out.error, ms: Date.now() - t0,
            });
            if (out.actionCard) {
                send({ type: 'action_card', card: out.actionCard });
                actionCards.push(out.actionCard);
            }
            const payload = out.error ? { error: out.error } : (out.result ?? out);
            resultBlocks.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: JSON.stringify(payload),
                is_error: !!out.error,
            });
        }
        // Pass the assistant turn back VERBATIM (incl. thinking blocks with
        // signatures — required when extended thinking is enabled).
        msgs = [...msgs, { role: 'assistant', content: blocks }, { role: 'user', content: resultBlocks }];
    }

    return { fullText, usage, actionCards, proposals, rounds: trace.rounds || 0, stopReason: trace.stopReason || null, toolCalls: trace.toolCalls };
}

module.exports = { withPromptCaching, runCoachToolLoop, MAX_TOOL_ROUNDS };
