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

export const PATTERNS = [
    'horizontal-push', 'vertical-push', 'horizontal-pull', 'vertical-pull',
    'knee-dominant', 'knee-flexion', 'hip-dominant', 'calf',
    'lateral-delt', 'rear-delt', 'elbow-flex', 'elbow-ext',
    'trunk-flex', 'trunk-ext', 'anti-rotation', 'anti-extension',
    'abduction', 'adduction', 'cardio',
    // LB-1 — a real shape (traps) that was an invisible null. Never spine.
    'shrug',
];

export const ROLES = ['primary', 'secondary', 'accessory', 'core'];
export const PROGRESSIONS = ['double', 'load-only', 'rep-only', 'hold'];

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
    // AU-13 — a 45° back extension / hip extension / reverse hyper is a hinge
    // (hips extend under load), not lumbar trunk work; only crunch-style
    // lower-back work stays trunk-ext. A plain "back extension" is ambiguous
    // and the equipment can overrule this (LB-1, see inferPattern). Above
    // knee-flexion so a REVERSE glute-ham (a hip extension) isn't a leg curl.
    [/back extension|hyper ?extension|hip extension|reverse hyper|reverse glute[- ]ham|45.?(°|degree)?.?(back|hip)/, 'hip-dominant'],
    [/leg curl|glute[- ]ham|hamstring curl|nordic/, 'knee-flexion'],
    [/lower back|lumbar/, 'trunk-ext'],
    [/lateral raise|side raise|upright row|front raise|lateral delt|front delt|\bdelt machine/, 'lateral-delt'],
    [/rear delt|reverse (pec|fly|flye)|peck back|pec back|face pull/, 'rear-delt'],
    // LB-1 — above the pulls: a shrug is its own shape, never a row.
    [/shrug/, 'shrug'],
    [/pullover|pulldown|pull-?up|chin-?up|lat machine|\blats?\b/, 'vertical-pull'],
    [/\brows?\b|rowing|t-bar|seal row/, 'horizontal-pull'],
    [/shoulder press|overhead press|military press|arnold|viking|press behind|\bohp\b/, 'vertical-push'],
    [/abductor|abduction|outer thigh/, 'abduction'],
    [/adductor|adduction|inner thigh/, 'adduction'],
    [/calf|calves|tibia/, 'calf'],
    // Triceps before hip: "kickback" belongs to both families, "tricep" decides.
    [/tricep|pushdown|skull|overhead extension|arm extension|dip machine(?!.*chest)/, 'elbow-ext'],
    // Knee before hip: a squat tagged "glutes" is still a squat.
    [/squat|leg press|hack|leg extension|lunge|pendulum|step-?up|quads?\b/, 'knee-dominant'],
    [/hip thrust|hip press|glute bridge|glute kick|kickback|\bglutes?\b|romanian|\brdl\b|deadlift|hinge|pull-?through|good morning/, 'hip-dominant'],
    [/bicep|curl|hammer|preacher|forearm|wrist|arm blaster|total arms/, 'elbow-flex'],
    // LB-1 — "Incline Dumbbell Press" names no chest. The angle words need
    // "press" (an incline curl or decline crunch isn't a push), and this sits
    // after vertical-push so "Incline Shoulder Press" stays vertical.
    [/chest|bench|\bpec\b|\bfly\b|flye|flight|crossover|dip|push-?up|\b(incline|decline|flat)\b.*\bpress\b|\b(dumbbell|db) press\b/, 'horizontal-push'],
    [/rotary|torso|twist|woodchop|oblique|side plank|rotation|pallof/, 'anti-rotation'],
    [/plank|ab wheel|rollout|dead bug|hollow/, 'anti-extension'],
    [/crunch|leg raise|knee tuck|knee raise|\babs?\b|abdominal|sit-?up|v-?up|hip flexor/, 'trunk-flex'],
];

// LB-1 — "Back Extension" names two machines: a 45° bench / GHD / roman chair
// (the hips extend — a hinge) and a seated lower-back machine (lumbar —
// trunk-ext). The name can't tell them apart; the equipment can.
const HINGE_EQUIPMENT_RE = /45[ -]?(deg|degree|°)?.*(back|hip) ext|hip ext|hyper ?ext|reverse hyper|glute[- ]ham|\bghd\b|roman chair/;
const LUMBAR_EQUIPMENT_RE = /lower back|lumbar/;
// Names the equipment gets to decide. Checked against the NAME only — a
// deadlift tagged "lower back" is not ambiguous.
const AMBIGUOUS_BACK_RE = /back extension|lower back|lumbar/;

function equipmentText(equipment) {
    if (!equipment) return '';
    if (typeof equipment === 'string') return equipment.toLowerCase();
    return [equipment.function, equipment.name].filter(Boolean).join(' ').toLowerCase();
}

/**
 * Infer the movement pattern of an exercise from its explicit `pattern`,
 * else its name + tags, with the equipment it ran on deciding the one case
 * the name can't (a back extension: hinge on a 45° bench, trunk-ext on a
 * seated lumbar machine — LB-1). Returns null when nothing matches — callers
 * treat null as "unrotatable, hold" (D0: enrichment, never a gate).
 *
 * The equipment text never goes through the general rules: brand and line
 * words would misfire ("Hammer Strength" is a curl, "Pendulum" a squat), and
 * a mis-linked machine must not relabel the exercise done on it.
 * @param {{pattern?:string, name?:string, machine?:string, tags?:string[]}} exercise
 * @param {{equipment?: string|{function?:string, name?:string}|null}} [opts]
 *   the machine — a name string (workout record `ex.equipment`, template row)
 *   or an equipment doc (its `function` + `name`)
 * @returns {string|null}
 */
export function inferPattern(exercise, { equipment = null } = {}) {
    if (!exercise) return null;
    if (exercise.pattern && PATTERNS.includes(exercise.pattern)) return exercise.pattern;
    const name = String(exercise.name || exercise.machine || '').toLowerCase();
    const text = [name, ...(Array.isArray(exercise.tags) ? exercise.tags : [])]
        .join(' ').toLowerCase();
    let byName = null;
    if (text.trim()) {
        for (const [re, pattern] of RULES) {
            if (re.test(text)) { byName = pattern; break; }
        }
    }
    const gear = equipmentText(equipment);
    // A name that already says 45° / hyperextension / reverse hyper is
    // explicit; only an unmatched or plain back-extension name defers.
    const nameDefers = byName === null || (AMBIGUOUS_BACK_RE.test(name) && !HINGE_EQUIPMENT_RE.test(name));
    if (gear && nameDefers) {
        if (HINGE_EQUIPMENT_RE.test(gear)) return 'hip-dominant';
        if (LUMBAR_EQUIPMENT_RE.test(gear)) return 'trunk-ext';
    }
    return byName;
}

/**
 * Role of an exercise inside a template that predates the field. The first
 * two compound slots carry the progression signal; core work is core; every
 * other compound is secondary; isolation is accessory.
 * @param {object} exercise - template row (may carry `role` already)
 * @param {number} index - position in the template
 * @returns {'primary'|'secondary'|'accessory'|'core'}
 */
export function inferRole(exercise, index = 0) {
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
 * LB-5 — the movement a machine itself declares: its own `pattern` (copied
 * from the catalog when it was added), else its catalog entry's (resolved by
 * the caller — this module can't import the catalog). Null when neither says.
 * @param {{pattern?:string, catalogRef?:string}} doc
 * @param {{catalogPattern?: (ref:string)=>string|null}} [opts]
 * @returns {string|null}
 */
export function equipmentPattern(doc, { catalogPattern = null } = {}) {
    if (!doc) return null;
    if (doc.pattern && PATTERNS.includes(doc.pattern)) return doc.pattern;
    if (doc.catalogRef && typeof catalogPattern === 'function') {
        const p = catalogPattern(doc.catalogRef);
        if (p && PATTERNS.includes(p)) return p;
    }
    return null;
}

/**
 * Patterns a piece of equipment can train, first answer wins:
 *   1. the machine's own pattern — `doc.pattern`, else its catalog entry's
 *      (LB-5). One machine, one movement: a stamped leg curl is a leg curl
 *      even when a mis-link says "Seated Row".
 *   2. `exerciseTypes` — exercise NAMES the user mapped to the machine; each
 *      resolves through the library lookup first (explicit pattern on the
 *      exercise) and falls back to name inference, with the doc as the
 *      equipment hint (LB-1), so "Back Extension Machine" on a 45° bench is a
 *      hinge and on a seated lumbar machine stays trunk-ext.
 *   3. the machine's own function/name text.
 * @param {{pattern?:string, catalogRef?:string, exerciseTypes?:string[], function?:string, name?:string}} doc
 * @param {(name:string)=>object|undefined} [lookup] - exercise-by-name resolver
 * @param {{catalogPattern?: (ref:string)=>string|null}} [opts] - catalog ref → pattern
 * @returns {string[]} unique patterns, possibly empty
 */
export function patternsForEquipment(doc, lookup, { catalogPattern = null } = {}) {
    const own = equipmentPattern(doc, { catalogPattern });
    if (own) return [own];
    const out = new Set();
    for (const name of doc?.exerciseTypes || []) {
        const ex = (lookup && lookup(name)) || { name };
        const p = inferPattern(ex, { equipment: doc });
        if (p) out.add(p);
    }
    if (out.size === 0) {
        const p = inferPattern({ name: [doc?.function, doc?.name].filter(Boolean).join(' ') });
        if (p) out.add(p);
    }
    return [...out];
}

/** Validate an optional [lo, hi] rep range. Returns the pair or null. */
export function normalizeRepRange(v) {
    if (!Array.isArray(v) || v.length !== 2) return null;
    const lo = parseInt(v[0], 10);
    const hi = parseInt(v[1], 10);
    if (isNaN(lo) || isNaN(hi) || lo < 1 || hi > 50 || lo > hi) return null;
    return [lo, hi];
}

/** Validate an optional RPE target on the app's 6–10 scale. */
export function normalizeRpeTarget(v) {
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
export function prescriptionFieldErrors(src) {
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
export function applyPrescriptionFields(out, src) {
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
