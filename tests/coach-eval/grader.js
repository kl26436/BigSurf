// Coach eval rubric (AP-20e) — a second model grades what code can't:
// grounded in the user's numbers / one clear recommendation / explains why /
// consistent with the rules' verdict. 1–5 each. The checks (checks.js) stay
// the source of truth for anything certain; the grade is the trend line.

export const RUBRIC = ['grounded', 'oneRecommendation', 'explainsWhy', 'consistentWithVerdict'];

const GRADER_SYSTEM = `You grade a strength coach's reply for a workout-tracking app. You get the user's question, the facts the app computed (rules verdicts — authoritative), the tools the coach called, and its reply.

Score each 1–5 (5 = excellent):
- grounded: cites the user's actual numbers (weights, reps, dates, sets) rather than generic advice.
- oneRecommendation: gives one clear thing to do (or, for a plan request, one coherent plan) — not a menu of options.
- explainsWhy: says briefly why, in terms of the user's data.
- consistentWithVerdict: agrees with the rules verdicts, or explicitly says it is deviating and why. Score 5 if no verdict applies.

Return ONLY JSON: {"grounded":n,"oneRecommendation":n,"explainsWhy":n,"consistentWithVerdict":n,"note":"one sentence"}`;

/** The verdicts section of the context the coach saw (what "consistent" means). */
export function verdictsExcerpt(firstUserMessage, max = 2500) {
    const text = typeof firstUserMessage === 'string' ? firstUserMessage : '';
    const i = text.indexOf('Rules verdicts');
    if (i === -1) return '(no verdicts block — live mode or no history)';
    const end = text.indexOf('\n\n', text.indexOf('\n', i) + 1);
    return text.slice(i, end === -1 ? i + max : Math.min(end, i + max));
}

export function buildGraderRequest(scenario, run, { model }) {
    const tools = (run.toolCalls || []).map(c => `${c.name}(${JSON.stringify(c.input).slice(0, 200)})${c.isError ? ' → error' : ''}`).join('\n') || '(none)';
    const user = [
        `QUESTION: ${scenario.question}`,
        `MODE: ${scenario.mode}`,
        `FACTS (rules verdicts):\n${verdictsExcerpt(run.messages?.[0]?.content)}`,
        `TOOLS CALLED:\n${tools}`,
        `REPLY:\n${run.text || '(empty)'}`,
    ].join('\n\n');
    return { model, max_tokens: 400, system: GRADER_SYSTEM, messages: [{ role: 'user', content: user }] };
}

/** Parse the grader's JSON (tolerates fences / prose around it). */
export function parseGrade(text) {
    const m = String(text || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    let j;
    try { j = JSON.parse(m[0]); } catch { return null; }
    const out = { note: typeof j.note === 'string' ? j.note : '' };
    for (const k of RUBRIC) {
        const n = Number(j[k]);
        if (!(n >= 1 && n <= 5)) return null;
        out[k] = Math.round(n);
    }
    out.mean = Math.round((RUBRIC.reduce((s, k) => s + out[k], 0) / RUBRIC.length) * 100) / 100;
    return out;
}
