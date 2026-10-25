// GENERATED MIRROR of js/core/features/movement-patterns.js — do not edit here.
// Edit the client module, then run: node scripts/sync-mirror.mjs js/core/features/movement-patterns.js <this file>

// Movement patterns (CP-1) — the rotation key for the periodization engine.
//
// Pure, no imports. A `pattern` names what a movement DOES mechanically
// (horizontal-push, hip-dominant…), so the variety engine can swap an
// accessory for another machine that trains the same thing. The 49-tag
// vocabulary in data/exercises.json mixes muscles with shapes and cannot do
// this job; this list is deliberately small and closed.
//
// MIRRORED: functions/movement-patterns.js is a byte-identical CommonJS copy
// (tests/unit/movement-patterns-mirror.test.js enforces it). Edit here, then
// copy — never let the two drift.

const PATTERNS = [
    'horizontal-push', 'vertical-push', 'horizontal-pull', 'vertical-pull',
    'knee-dominant', 'knee-flexion', 'hip-dominant', 'calf',
    'lateral-delt', 'rear-delt', 'elbow-flex', 'elbow-ext',
    'trunk-flex', 'trunk-ext', 'anti-rotation', 'anti-extension',
    'abduction', 'adduction', 'cardio',
];

const ROLES = ['primary', 'secondary', 'accessory', 'core'];
const PROGRESSIONS = ['double', 'load-only', 'rep-only', 'hold'];

// Patterns whose top slots are the progression spine of a day. A primary is
// never rotated — it is the thing progress is measured on.
const COMPOUND_PATTERNS = new Set([
    'horizontal-push', 'vertical-push', 'horizontal-pull', 'vertical-pull',
    'knee-dominant', 'hip-dominant',
]);
const CORE_PATTERNS = new Set(['trunk-flex', 'trunk-ext', 'anti-rotation', 'anti-extension']);
// Single-joint shapes that live inside a compound pattern (a pec-deck fly is
// horizontal-push but never a primary). Template rows carry no tags, so the
// name has to say it.
const ISOLATION_RE = /\b(fly|flye|flight|crossover|pec deck|peck back|raise|curl|extension|pushdown|kickback|pullover|face pull|shrug|abduct\w*|adduct\w*)\b/;

// Ordered keyword rules — first match wins, so the specific shapes
// ("leg curl", "rowing machine", "upright row") sit above the generic words
// they contain ("curl", "row"). Matched against name + tags, lowercased.
const RULES = [
    [/treadmill|stationary bike|elliptical|rowing machine|stair ?climber|jump rope|\bcardio\b|conditioning|\brun(ning)?\b|cycling|\bski ?erg|assault/, 'cardio'],
    [/leg curl|glute[- ]ham|hamstring curl|nordic/, 'knee-flexion'],
    // AU-13 — a 45° back extension / hip extension / reverse hyper is a hinge
    // (hips extend under load), not lumbar trunk work; only crunch-style
    // lower-back work stays trunk-ext.
    [/back extension|hyperextension|hip extension|reverse hyper|45.?(°|degree)?.?(back|hip)/, 'hip-dominant'],
    [/lower back|lumbar/, 'trunk-ext'],
    [/lateral raise|side raise|upright row|front raise|lateral delt|front delt|\bdelt machine/, 'lateral-delt'],
    [/rear delt|reverse (pec|fly|flye)|peck back|pec back|face pull/, 'rear-delt'],
    [/pullover|pulldown|pull-?up|chin-?up|lat machine|\blats?\b/, 'vertical-pull'],
    [/\brows?\b|rowing|t-bar|seal row/, 'horizontal-pull'],
    [/shoulder press|overhead press|military press|arnold|viking|press behind|\bohp\b/, 'vertical-push'],
    [/hip abduct|abduction|outer thigh/, 'abduction'],
    [/hip adduct|adduction|inner thigh/, 'adduction'],
    [/calf|calves|tibia/, 'calf'],
    // Triceps before hip: "kickback" belongs to both families, "tricep" decides.
    [/tricep|pushdown|skull|overhead extension|arm extension|dip machine(?!.*chest)/, 'elbow-ext'],
    // Knee before hip: a squat tagged "glutes" is still a squat.
    [/squat|leg press|hack|leg extension|lunge|pendulum|step-?up|quads?\b/, 'knee-dominant'],
    [/hip thrust|hip press|glute bridge|glute kick|kickback|\bglutes?\b|romanian|\brdl\b|deadlift|hinge|pull-?through|good morning/, 'hip-dominant'],
    [/bicep|curl|hammer|preacher|forearm|wrist|arm blaster|total arms/, 'elbow-flex'],
    [/chest|bench|\bpec\b|\bfly\b|flye|flight|crossover|dip|push-?up/, 'horizontal-push'],
    [/rotary|torso|twist|woodchop|oblique|side plank|rotation|pallof/, 'anti-rotation'],
    [/plank|ab wheel|rollout|dead bug|hollow/, 'anti-extension'],
    [/crunch|leg raise|knee tuck|knee raise|\babs?\b|abdominal|sit-?up|v-?up|hip flexor/, 'trunk-flex'],
];

/**
 * Infer the movement pattern of an exercise from its explicit `pattern`,
 * else its name + tags. Returns null when nothing matches — callers treat
 * null as "unrotatable, hold" (D0: enrichment, never a gate).
 * @param {{pattern?:string, name?:string, machine?:string, tags?:string[]}} exercise
 * @returns {string|null}
 */
function inferPattern(exercise) {
    if (!exercise) return null;
    if (exercise.pattern && PATTERNS.includes(exercise.pattern)) return exercise.pattern;
    const text = [exercise.name || exercise.machine || '', ...(Array.isArray(exercise.tags) ? exercise.tags : [])]
        .join(' ').toLowerCase();
    if (!text.trim()) return null;
    for (const [re, pattern] of RULES) {
        if (re.test(text)) return pattern;
    }
    return null;
}

/**
 * Role of an exercise inside a template that predates the field. The first
 * two compound slots carry the progression signal; core work is core; every
 * other compound is secondary; isolation is accessory.
 * @param {object} exercise - template row (may carry `role` already)
 * @param {number} index - position in the template
 * @returns {'primary'|'secondary'|'accessory'|'core'}
 */
function inferRole(exercise, index = 0) {
    if (exercise?.role && ROLES.includes(exercise.role)) return exercise.role;
    const pattern = inferPattern(exercise);
    if (CORE_PATTERNS.has(pattern)) return 'core';
    const tags = Array.isArray(exercise?.tags) ? exercise.tags : [];
    const name = (exercise?.name || exercise?.machine || '').toLowerCase();
    const isolation = tags.includes('isolation') || ISOLATION_RE.test(name);
    const compound = !isolation && (COMPOUND_PATTERNS.has(pattern) || tags.includes('compound'));
    if (compound && index < 2) return 'primary';
    if (compound) return 'secondary';
    return 'accessory';
}

/**
 * Patterns a piece of equipment can train. `exerciseTypes` holds exercise
 * NAMES the user mapped to the machine; each resolves through the library
 * lookup first (explicit pattern on the exercise) and falls back to name
 * inference. When nothing is mapped, the machine's own function/name text
 * is the last resort.
 * @param {{exerciseTypes?:string[], function?:string, name?:string}} doc
 * @param {(name:string)=>object|undefined} [lookup] - exercise-by-name resolver
 * @returns {string[]} unique patterns, possibly empty
 */
function patternsForEquipment(doc, lookup) {
    const out = new Set();
    for (const name of doc?.exerciseTypes || []) {
        const ex = (lookup && lookup(name)) || { name };
        const p = inferPattern(ex);
        if (p) out.add(p);
    }
    if (out.size === 0) {
        const p = inferPattern({ name: [doc?.function, doc?.name].filter(Boolean).join(' ') });
        if (p) out.add(p);
    }
    return [...out];
}

/** Validate an optional [lo, hi] rep range. Returns the pair or null. */
function normalizeRepRange(v) {
    if (!Array.isArray(v) || v.length !== 2) return null;
    const lo = parseInt(v[0], 10);
    const hi = parseInt(v[1], 10);
    if (isNaN(lo) || isNaN(hi) || lo < 1 || hi > 50 || lo > hi) return null;
    return [lo, hi];
}

/** Validate an optional RPE target on the app's 6–10 scale. */
function normalizeRpeTarget(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 6 || n > 10) return null;
    return Math.round(n * 2) / 2;
}

/**
 * AP-18 — what's wrong with the CP-1 prescription fields on `src`, one
 * message per bad field listing the allowed values. Present-but-invalid is
 * an error (the coach tools reject it); absent is fine.
 * @returns {string[]}
 */
function prescriptionFieldErrors(src) {
    if (!src || typeof src !== 'object') return [];
    const errs = [];
    const has = (k) => src[k] !== undefined && src[k] !== null;
    if (has('repRange') && !normalizeRepRange(src.repRange)) errs.push(`repRange must be [low, high] with 1 ≤ low ≤ high ≤ 50 (got ${JSON.stringify(src.repRange)})`);
    if (has('rpeTarget') && normalizeRpeTarget(src.rpeTarget) == null) errs.push(`rpeTarget must be 6-10 (got ${JSON.stringify(src.rpeTarget)})`);
    if (has('role') && !ROLES.includes(src.role)) errs.push(`role must be one of ${ROLES.join(', ')} (got ${JSON.stringify(src.role)})`);
    if (has('pattern') && !PATTERNS.includes(src.pattern)) errs.push(`pattern must be one of ${PATTERNS.join(', ')} (got ${JSON.stringify(src.pattern)})`);
    if (has('progression') && !PROGRESSIONS.includes(src.progression)) errs.push(`progression must be one of ${PROGRESSIONS.join(', ')} (got ${JSON.stringify(src.progression)})`);
    return errs;
}

/**
 * Copy the CP-1 prescription fields from `src` onto `out` when valid. Shared
 * by the server normalizer and the client validator so both sides accept
 * exactly the same shape.
 */
function applyPrescriptionFields(out, src) {
    if (!src || typeof src !== 'object') return out;
    const repRange = normalizeRepRange(src.repRange);
    if (repRange) out.repRange = repRange;
    const rpe = normalizeRpeTarget(src.rpeTarget);
    if (rpe != null) out.rpeTarget = rpe;
    if (ROLES.includes(src.role)) out.role = src.role;
    if (PATTERNS.includes(src.pattern)) out.pattern = src.pattern;
    if (PROGRESSIONS.includes(src.progression)) out.progression = src.progression;
    return out;
}

module.exports = { PATTERNS, ROLES, PROGRESSIONS, inferPattern, inferRole, patternsForEquipment, normalizeRepRange, normalizeRpeTarget, prescriptionFieldErrors, applyPrescriptionFields };
