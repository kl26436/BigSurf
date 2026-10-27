// Coach eval assertions (AP-20d) — the cheap, certain checks, in code.
//
// runChecks(scenario, run) → [{ id, pass, detail }]. `run` is what
// runner.js#runScenario returns: { text, toolCalls, proposals, writes, route,
// mode, ... }. Generic checks apply to every scenario; the rest come from
// scenario.expect (tests/fixtures/coach-scenarios/scenarios.js).

import { inferPattern } from '../../functions/movement-patterns.js';
import { weightIncrement } from '../../js/core/features/progression.js';
import { findJargon, jargonTermsIn } from '../../js/core/features/plain-language.js';
import { cardNumbers, numbersIn } from '../../js/core/features/report-card.js';
import { weekKindOf } from '../../js/core/features/plain-language.js';
import { isDeloadTarget } from '../../js/core/features/week-targets.js';

/** Tools that change the user's workouts, program or plan. */
export const WRITE_TOOLS = new Set([
    'create_workout_template', 'update_workout_template', 'replace_day', 'archive_template',
    'create_program', 'adjust_program', 'set_week_plan', 'set_primary_lifts',
    'set_goal', 'update_goal', 'add_event', // TP-1
    'update_plan', // TP-3
]);
// Bookkeeping writes a question may make: advice log, memory, override audit.
const BOOKKEEPING_PATH = /\/(coachAdvice|coachMemory|coachOverrides|coachTraces)\b|preferences\/coachMemory/;

export function wordCount(text) {
    return (text || '')
        .replace(/[*_#>`|]/g, ' ')
        .split(/\s+/)
        .filter(w => /[A-Za-z0-9]/.test(w)).length;
}

/**
 * Weights named in the answer: "185×6", "185 x 6", "185 lb(s)", "82.5 kg".
 * Numbers under 20 are sets/reps ("3×8"), not loads.
 */
export function weightsInText(text) {
    const out = [];
    const re = /(\d{2,4}(?:\.\d{1,2})?)\s*(?:(?:×|x)\s*\d{1,2}\b|(?:lbs?|kg|pounds?)\b)/gi;
    let m;
    while ((m = re.exec(text || ''))) {
        const w = Number(m[1]);
        if (w >= 20) out.push({ weight: w, at: m.index, match: m[0] });
    }
    return out;
}

/** Loadable = a multiple of the smallest jump, or on the grid of a weight already lifted. */
export function isLoadable(weight, { inc, logged = [] }) {
    const on = (x) => Math.abs(x / inc - Math.round(x / inc)) < 0.01;
    return on(weight) || logged.some(l => on(weight - l));
}

function loggedWeights(user) {
    const set = new Set();
    for (const w of user.workouts || []) {
        for (const ex of Object.values(w.exercises || {})) for (const s of ex.sets || []) if (s.weight) set.add(s.weight);
    }
    return [...set];
}

/** Exercise names a tool call writes or proposes (template rows, swaps, adds). */
function exercisesIn(call) {
    const i = call.input || {};
    const names = [];
    const rows = [...(i.exercises || []), ...(i.addExercises || []), ...(i.days ? Object.values(i.days).flat() : [])];
    for (const r of rows) if (r && (r.machine || r.name || r.exercise)) names.push({ name: r.machine || r.name || r.exercise, equipment: r.equipment, pattern: r.pattern });
    if (call.name === 'propose_swap' && i.toExercise) names.push({ name: i.toExercise, equipment: i.equipment });
    if (call.name === 'propose_add_exercise' && i.exercise) names.push({ name: i.exercise, equipment: i.equipment });
    return names;
}

const FREE = /^(none|bodyweight|body weight|dumbbells?|barbell|cable|bench)$/i;

/** Text window around a mention, to attribute a weight to an exercise. */
function nearby(text, at, span = 80) {
    return text.slice(Math.max(0, at - span), at + span).toLowerCase();
}

export function runChecks(scenario, run) {
    const { expect = {}, user } = scenario;
    const text = run.text || '';
    const calls = run.toolCalls || [];
    const called = new Set(calls.map(c => c.name));
    const results = [];
    const check = (id, pass, detail = '') => results.push({ id, pass: !!pass, detail });

    // ── generic ──────────────────────────────────────────────────────
    check('answered', text.trim().length > 0 || (run.proposals || []).length > 0, text ? '' : 'empty answer');

    if (expect.maxWords) {
        const n = wordCount(text);
        check('length', n <= expect.maxWords, `${n} words (cap ${expect.maxWords})`);
    }

    if (expect.kind === 'question') {
        const writes = calls.filter(c => WRITE_TOOLS.has(c.name) && !c.isError).map(c => c.name);
        const dbWrites = (run.writes || []).filter(w => !BOOKKEEPING_PATH.test(w.path)).map(w => `${w.op} ${w.path}`);
        check('no-writes-on-question', !writes.length && !dbWrites.length,
            [...writes, ...dbWrites].join(', ') || 'none');
    }

    const inc = weightIncrement(user.unit, user.unit === 'kg' ? user.settings.plateKg : user.settings.plateLbs);
    const logged = loggedWeights(user);
    const unloadable = weightsInText(text).filter(w => !isLoadable(w.weight, { inc, logged }));
    const proposalWeights = calls.filter(c => c.name.startsWith('propose_') && typeof c.input?.weight === 'number')
        .map(c => c.input.weight).filter(w => !isLoadable(w, { inc, logged }));
    check('loadable-weights', !unloadable.length && !proposalWeights.length,
        [...unloadable.map(w => w.match), ...proposalWeights.map(String)].join(', ') || `grid ${inc} ${user.unit}`);

    // Every machine named in a write or proposal exists at the gym.
    const gymNames = new Set((user.equipment || []).map(e => e.name.toLowerCase()));
    const unknownGear = calls.flatMap(exercisesIn)
        .map(x => x.equipment).filter(Boolean)
        .filter(e => !FREE.test(e) && !gymNames.has(String(e).toLowerCase()));
    check('equipment-exists', !unknownGear.length, unknownGear.join(', ') || 'ok');

    // A prescribed number is logged for the outcome loop (chat only; live
    // proposals are their own record).
    if (run.mode === 'chat' && expect.kind === 'question') {
        const prescribes = /\bDo\b[^\n]{0,120}\d/.test(text) || weightsInText(text).length > 0;
        if (prescribes) check('log-advice', called.has('log_advice'), called.has('log_advice') ? '' : 'prescribed a number without log_advice');
    }

    // TP-0 — the user's words, not ours. A term the user's own message used
    // may come back (with an explanation); the context the model was handed
    // gets no exemption — a leak there is fixed at its source, not in the answer.
    const said = findJargon(text, { allow: jargonTermsIn(scenario.question || '') });
    check('no-jargon', !said.length, said.map(j => j.match).join(', ') || 'ok');
    // Quoted spans are names the user chose ("Strength block III") — theirs, not ours.
    const ctx = contextTextOf(run, scenario.question).replace(/"[^"\n]{1,80}"/g, '""');
    if (ctx) {
        const leaked = findJargon(ctx);
        check('no-jargon-context', !leaked.length, leaked.map(j => `${j.match} (…${ctx.slice(Math.max(0, j.index - 30), j.index + 20).replace(/\s+/g, ' ')}…)`).slice(0, 5).join('; ') || 'ok');
    }

    // TP-2 / A6 — the report card: the model picks, it doesn't compose.
    if (run.mode === 'reportcard' && run.card) {
        const kinds = run.card.options.map(o => o.kind);
        check('chosen-option-valid', !run.fallback && kinds.includes(run.chosen?.kind), run.fallback || `${run.chosen?.kind} of ${kinds.join('/')}`);
        if (expect.choice) check('chosen-option-expected', run.chosen?.kind === expect.choice, `${run.chosen?.kind} (want ${expect.choice})`);
        const known = cardNumbers(run.card);
        const invented = numbersIn(text).filter(n => !known.has(n) && !(Number.isInteger(n) && n <= 10));
        check('numbers-match-card', !invented.length, invented.join(', ') || 'ok');
    }

    // ── scenario-specific ────────────────────────────────────────────
    if (expect.route) check('route', run.route?.tier === expect.route, `tier ${run.route?.tier}`);

    if (expect.mustCallAny) {
        const hit = expect.mustCallAny.filter(n => called.has(n));
        check('must-call', hit.length > 0, hit.length ? hit.join(', ') : `none of ${expect.mustCallAny.join(', ')}`);
    }
    for (const n of expect.mustNotCall || []) check(`must-not-call:${n}`, !called.has(n));
    for (const n of expect.mustCall || []) check(`must-call:${n}`, called.has(n));
    if (expect.verdictRule) {
        const v = verdictQuoted(text, expect.verdictRule);
        check('verdict-quoted', v.pass, v.detail);
    }

    for (const pat of expect.mustMention || []) {
        check(`mentions:${pat}`, new RegExp(pat, 'i').test(text));
    }
    for (const pat of expect.mustNotMention || []) {
        const m = text.match(new RegExp(pat, 'i'));
        check(`not-mentions:${pat}`, !m, m ? `"${m[0]}"` : '');
    }

    if (expect.maxWeight) {
        const { exercise, max } = expect.maxWeight;
        const over = weightsInText(text).filter(w => w.weight > max && nearby(text, w.at).includes(exercise.toLowerCase()));
        const overProp = calls.filter(c => c.name === 'propose_next_target' && c.input?.weight > max).map(c => c.input.weight);
        check('no-bump', !over.length && !overProp.length, [...over.map(w => w.match), ...overProp].join(', ') || `≤ ${max}`);
    }

    for (const { exercise, min } of expect.minWeight || []) {
        const under = weightsInText(text).filter(w => w.weight < min && nearby(text, w.at, 60).includes(exercise.toLowerCase()));
        check(`min-weight:${exercise}`, !under.length, under.map(w => w.match).join(', ') || `≥ ${min}`);
    }

    if (expect.injuredPatterns) {
        const bad = calls.flatMap(exercisesIn)
            .filter(x => expect.injuredPatterns.includes(x.pattern || inferPattern({ name: x.name })))
            .map(x => x.name);
        check('respects-injury', !bad.length, bad.join(', ') || 'ok');
    }

    // TP-5 — a plan carries its six-part rationale.
    if (expect.programRationale) {
        const c = calls.find(x => x.name === 'create_program' && !x.isError);
        const r = c?.input?.rationale;
        check('program-rationale', !!(r?.block && (r.weeks || []).length && (r.fixed || []).length), c ? (r?.block ? `${(r.weeks || []).length} weeks · ${(r.fixed || []).length} fixed` : 'no rationale') : 'no create_program');
    }

    // TP-5 — peaking for a date: the last weeks before it are peak, a lighter
    // week just before them, and no new exercises (no rotateAccessories).
    if (expect.programShape) {
        const c = calls.find(x => x.name === 'create_program' && !x.isError);
        const detail = [];
        let pass = !!c;
        if (c) {
            const weeks = Number(c.input?.weeks) || 0;
            const kindOf = (w) => {
                const t = (c.input.weekTargets || []).find(x => x.week === w) || null;
                return isDeloadTarget(t) ? 'lighter' : weekKindOf(t);
            };
            const kinds = Array.from({ length: weeks }, (_, i) => kindOf(i + 1));
            const { peakLast = 0, lighterBefore = false } = expect.programShape;
            const tail = kinds.slice(-peakLast);
            if (peakLast && !(tail.length === peakLast && tail.every(k => k === 'peak'))) { pass = false; detail.push(`last ${peakLast} not peak: ${kinds.join('/')}`); }
            if (lighterBefore && kinds[weeks - peakLast - 1] !== 'lighter') { pass = false; detail.push(`no lighter week before the peak: ${kinds.join('/')}`); }
            if (c.input?.rotateAccessories === true) { pass = false; detail.push('rotated accessories into a peak'); }
            if (!detail.length) detail.push(kinds.join('/'));
        } else detail.push('no create_program');
        check('program-shape', pass, detail.join('; '));
    }

    // TP-6 g — a swap is done only when create_program applied it: every
    // "what's new" swap is applied or reported not-applied, and the answer
    // never calls a not-applied swap done.
    if (expect.swapsTruthful) {
        const c = calls.find(x => x.name === 'create_program' && !x.isError);
        const rot = c?.output?.rotations || { applied: [], notApplied: [] };
        const lc = (x) => String(x || '').toLowerCase();
        const accounted = new Set([...(rot.applied || []), ...(rot.notApplied || [])].map(x => `${lc(x.from)}|${lc(x.to)}`));
        const listed = (c?.input?.rationale?.changed || []).filter(x => x?.from);
        const lost = listed.filter(x => !accounted.has(`${lc(x.from)}|${lc(x.to)}`)).map(x => `${x.from} → ${x.to}`);
        const claimed = (rot.notApplied || []).filter(x => {
            const i = lc(text).indexOf(lc(x.to));
            if (i < 0) return false;
            const near = lc(text).slice(Math.max(0, i - 80), i + 80);
            return /\b(swapped|switched|replaced|done|applied|made)\b/.test(near) && !/(not|n't|waiting|couldn)/.test(near);
        }).map(x => x.to);
        check('swaps-truthful', !!c && !lost.length && !claimed.length,
            !c ? 'no create_program' : [lost.length ? `lost: ${lost.join(', ')}` : '', claimed.length ? `called done: ${claimed.join(', ')}` : ''].filter(Boolean).join('; ') || `${(rot.applied || []).length} applied`);
    }

    // TP-7 c — a trip goes on the plan as a travel event (dates + the gym's size).
    if (expect.travelEvent) {
        const c = calls.find(x => x.name === 'add_event' && !x.isError);
        check('travel-event', c?.input?.kind === 'travel', c ? `kind ${c.input?.kind}` : 'no add_event');
    }

    // TP-8 — variety is alternation inside the plan: create_program set up
    // alternates (not a replacement list) and the main lifts kept their slots.
    if (expect.alternates) {
        const c = calls.find(x => x.name === 'create_program' && !x.isError);
        const pairs = c?.output?.alternates || [];
        check('alternates-set', !!c && c.input?.alternateAccessories === true && pairs.length > 0,
            !c ? 'no create_program' : c.input?.alternateAccessories !== true ? 'alternateAccessories not set' : `${pairs.length} pairs`);
    }

        if (expect.askOrBuild) {
        const { tool, check: ok } = expect.askOrBuild;
        const c = calls.find(x => x.name === tool && !x.isError);
        check('asks-or-builds', c ? ok(c.input) : /\?/.test(text), c ? `${tool} input ${ok(c.input) ? 'ok' : 'incomplete'}` : 'asked a question');
    }

    return results;
}

/**
 * AU-4 — the answer states the rules' verdict for the lift: its weight and
 * the action in words (hold/chase, back off, rotate, bump, deload).
 */
export function verdictQuoted(text, rule) {
    if (!rule?.action) return { pass: true, detail: 'no verdict' };
    const t = text || '';
    const words = {
        'chase-rep': /\b(rep|hold|stay)\b/i, consolidate: /\b(hold|stay|own|repeat)\b/i,
        'back-off': /\b(back off|drop|lighter|reset|deload)\b/i, rotate: /\b(swap|rotat|switch|replace|variation|change)/i,
        bump: /\b(bump|add|go (up|to)|increase|heavier|move up)\b/i, deload: /\b(deload|light|easy)\b/i, start: /\w/,
    };
    const weightOk = rule.action === 'rotate' || rule.weight == null || new RegExp(`\\b${rule.weight}\\b`).test(t);
    const actionOk = (words[rule.action] || /\w/).test(t);
    return { pass: weightOk && actionOk, detail: `${rule.action} ${rule.weight ?? ''}`.trim() + (weightOk ? '' : ' — weight not stated') + (actionOk ? '' : ' — action not stated') };
}

/**
 * The training context the model was handed on the first turn, minus the
 * user's own question (their words are theirs to choose).
 */
export function contextTextOf(run, question = '') {
    const first = run?.messages?.[0]?.content;
    const text = typeof first === 'string' ? first
        : Array.isArray(first) ? first.map(b => b?.text || '').join('\n') : '';
    return question ? text.split(question).join('') : text;
}

/** One line per scenario for the report. */
export function summarize(results) {
    const passed = results.filter(r => r.pass).length;
    return { passed, total: results.length, failed: results.filter(r => !r.pass).map(r => `${r.id}${r.detail ? ` (${r.detail})` : ''}`) };
}
