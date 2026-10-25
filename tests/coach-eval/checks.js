// Coach eval assertions (AP-20d) — the cheap, certain checks, in code.
//
// runChecks(scenario, run) → [{ id, pass, detail }]. `run` is what
// runner.js#runScenario returns: { text, toolCalls, proposals, writes, route,
// mode, ... }. Generic checks apply to every scenario; the rest come from
// scenario.expect (tests/fixtures/coach-scenarios/scenarios.js).

import { inferPattern } from '../../functions/movement-patterns.js';
import { weightIncrement } from '../../js/core/features/progression.js';

/** Tools that change the user's workouts, program or plan. */
export const WRITE_TOOLS = new Set([
    'create_workout_template', 'update_workout_template', 'replace_day', 'archive_template',
    'create_program', 'adjust_program', 'set_week_plan', 'set_primary_lifts',
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

/** One line per scenario for the report. */
export function summarize(results) {
    const passed = results.filter(r => r.pass).length;
    return { passed, total: results.length, failed: results.filter(r => !r.pass).map(r => `${r.id}${r.detail ? ` (${r.detail})` : ''}`) };
}
