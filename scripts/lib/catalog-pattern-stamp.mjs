// Pure planner for scripts/stamp-catalog-patterns.mjs (LB-5). No I/O — the
// CLI reads js/core/data/equipment-catalog.js, this decides each machine's
// movement `pattern` and rewrites the source text, and tests exercise it
// directly.
//
// The classifier is injected (`inferPattern`, the body-part tables) so the
// CLI can hand it the functions/ CommonJS mirror and the tests the client
// module — byte-identical, enforced by movement-patterns-mirror.test.js.
//
// A machine gets a pattern only when its FUNCTION (the catalog machine name)
// names one movement. It stays without one — never a guess — when:
//   - nothing matches                               (reason 'no-match')
//   - it's a combo ("Leg Extension / Leg Curl", "Shrug/Deadlift", "… Combo")
//     whose parts don't all name the same movement  (reason 'combo')
//   - the catalog files it as Multi-Use / Full Body / Neck — a utility bench
//     or cable station trains many things           (reason 'multi-use')
//   - the movement contradicts the catalog's own body part ("Rowing Machine"
//     filed under Back is a seated row, not the cardio erg) ('body-part')
//   - a plain "Back Extension" that isn't on a weight stack — a 45° bench and
//     a lumbar machine share the name               (reason 'back-ext')
//   - a hand-checked decision says so               ('hand-checked')
// Brand and line words never reach the rules ("Hammer Strength" is not a curl,
// "Pendulum" not a squat).

/**
 * Hand-checked decisions for the hip / glute / back-extension family (the
 * entries HINGE_FAMILY_RE matches — `--family` prints all of them with the
 * decision). Keyed by catalog ref (brand/line/machine slugs). `null` =
 * deliberately no pattern. Every family entry NOT listed here was checked
 * and the rule output stands.
 */
export const HAND_CHECKED = {
    // "Gluteus" isn't the rules' word for glute; these are kickback /
    // standing hip-extension stations.
    'panatta/fit-evo/gluteus-machine': { pattern: 'hip-dominant', why: 'glute kickback station' },
    'panatta/fit-evo/master-gluteus-plus': { pattern: 'hip-dominant', why: 'standing hip extension' },
    'panatta/monolith/gluteus-machine': { pattern: 'hip-dominant', why: 'glute kickback station' },
    'panatta/monolith/master-gluteus-plus': { pattern: 'hip-dominant', why: 'standing hip extension' },
    'gym80/sygnum/radial-gluteus': { pattern: 'hip-dominant', why: 'same machine as 80Classics Radial Glutes' },
    // Hammer Strength Select "Hip and Glute" is the standing glute (rear
    // kick) machine; the combo split only sees "Hip" + "Glute".
    'hammer-strength/select/hip-and-glute': { pattern: 'hip-dominant', why: 'standing glute kickback' },
    // A horizontal / 45° hyperextension bench — "hip & back" is one movement.
    'gymleco/general/hip-back-extension': { pattern: 'hip-dominant', why: 'hyperextension bench' },
    // A glute-ham developer / 90° roman chair is two exercises on one bench:
    // the glute-ham raise (leg curl) and the back extension (hinge).
    'matrix/magnum/glute-ham-bench': { pattern: null, why: 'GHD — leg curl and hinge' },
    'newtech/functional/90-degree-roman-chair-ghd': { pattern: null, why: 'GHD — leg curl and hinge' },
    // A loading tool, not a station.
    'arsenal-strength/alpha/deadlift-jack': { pattern: null, why: 'plate-loading jack' },
    // gym80's glute machines (hip thrust / hip extension) — no rule word.
    'gym80/sygnum/bootymizer': { pattern: 'hip-dominant', why: 'hip thrust machine' },
    'gym80/pure-kraft/booty-booster-special': { pattern: 'hip-dominant', why: 'hip thrust machine' },
    // Outside the family, same idea: the rules have no "rower" / "erg" word.
    'concept2/cardio/model-d-rower': { pattern: 'cardio', why: 'rowing erg' },
    'concept2/cardio/model-e-rower': { pattern: 'cardio', why: 'rowing erg' },
    'concept2/cardio/bikeerg': { pattern: 'cardio', why: 'bike erg' },
    // Bent over, a lateral raise is rear-delt work.
    'gym80/80athletics/bent-over-lateral-raise': { pattern: 'rear-delt', why: 'bent-over = rear delt' },
};

// "Back Extension" with nothing else said. On a weight stack it is the seated
// lumbar machine (trunk-ext); anywhere else it could be the 45° bench.
const PLAIN_BACK_EXT_RE = /^(low(er)? )?back extension$/i;

/** Names the hand-check covers — what `--family` lists for review. */
export const HINGE_FAMILY_RE = /back ext|low(er)? back|lumbar|hyper|hip ext|reverse hyper|roman|\bghd\b|glute|\bham\b|hamstring|hip thrust|hip press|kickback|deadlift|\brdl\b|romanian|good morning|pull.?through|\bhip\b|bridge|booty|posterior/i;

// A combo machine names two stations. Split on "/", "&", "+", " and ".
const SPLIT_RE = /\s*(?:\/|&|\+|\band\b)\s*/i;
const COMBO_WORD_RE = /\b(combo|superset|2-in-1)\b/i;

function partsOf(name) {
    const parts = name.split(SPLIT_RE).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
    // "Biceps-Triceps Combo": a combo word with no separator — the hyphen is one.
    if (COMBO_WORD_RE.test(name)) {
        const hy = name.replace(COMBO_WORD_RE, '').split(/\s*-\s*/).map(s => s.trim()).filter(Boolean);
        if (hy.length > 1) return hy;
    }
    return [name];
}

/**
 * The movement one catalog machine trains, or null with a reason.
 * @param {{name:string, bodyPart?:string, type?:string}} machine - catalog machine
 *   (name = its function; type = the machine's or its line's)
 * @param {object} deps
 * @param {Function} deps.inferPattern - movement-patterns.js#inferPattern
 * @param {object} deps.PATTERN_BODY_PART - exercise-taxonomy.js
 * @param {object} deps.BODY_PART_PATTERNS - exercise-taxonomy.js
 * @param {Function} deps.normalizeBodyPart - exercise-taxonomy.js
 * @param {string} [ref] - catalog ref, for the hand-checked table
 * @returns {{pattern:string|null, reason:string}}
 */
export function machinePattern(machine, deps, ref = null) {
    const { inferPattern, PATTERN_BODY_PART, BODY_PART_PATTERNS, normalizeBodyPart } = deps;
    if (ref && Object.hasOwn(HAND_CHECKED, ref)) {
        return { pattern: HAND_CHECKED[ref].pattern, reason: 'hand-checked' };
    }
    const name = String(machine?.name || '').trim();
    if (!name) return { pattern: null, reason: 'no-match' };
    // The catalog's own "this does many things".
    const stored = String(machine.bodyPart || '').trim();
    const part = normalizeBodyPart(stored);
    if (stored && !part) return { pattern: null, reason: 'multi-use' };
    if (PLAIN_BACK_EXT_RE.test(name)) {
        return machine.type === 'Selectorized'
            ? { pattern: 'trunk-ext', reason: 'back-ext' }
            : { pattern: null, reason: 'back-ext' };
    }
    // Equipment-aware: the function is both the name and the machine hint,
    // so "45 Degree Back Extension" lands on the hinge rule (LB-1).
    const infer = (text) => inferPattern({ name: text }, { equipment: text });
    // "Dual Adductor Abductor Machine" — two stations, no separator.
    if (/abduct/i.test(name) && /adduct/i.test(name)) return { pattern: null, reason: 'combo' };
    const parts = partsOf(name);
    let pattern;
    if (parts.length > 1) {
        const each = parts.map(infer);
        if (each.some(p => !p) || new Set(each).size > 1) return { pattern: null, reason: 'combo' };
        pattern = each[0];
    } else {
        pattern = infer(name);
    }
    if (!pattern) return { pattern: null, reason: 'no-match' };
    if (part && PATTERN_BODY_PART[pattern] !== part && !(BODY_PART_PATTERNS[part] || []).includes(pattern)) {
        return { pattern: null, reason: 'body-part' };
    }
    return { pattern, reason: 'rule' };
}

/**
 * Every machine in the static catalog with its decision, in source order.
 * @param {Array} catalog - EQUIPMENT_CATALOG (brand → lines → machines)
 * @param {object} deps - see machinePattern
 * @param {Function} slugify - equipment-catalog-helpers.js#slugify
 * @returns {Array<{ref, brand, line, name, bodyPart, pattern, reason}>}
 */
export function planCatalogPatterns(catalog, deps, slugify) {
    const out = [];
    for (const brand of catalog || []) {
        for (const line of brand.lines || []) {
            for (const m of line.machines || []) {
                const ref = `${slugify(brand.brand)}/${slugify(line.name)}/${slugify(m.name)}`;
                const { pattern, reason } = machinePattern({ ...m, type: m.type || line.type || null }, deps, ref);
                out.push({ ref, brand: brand.brand, line: line.name, name: m.name, bodyPart: m.bodyPart || null, pattern, reason });
            }
        }
    }
    return out;
}

/** Counts by pattern ('(none)' for null) and by reason. */
export function summarize(plan) {
    const byPattern = {};
    const byReason = {};
    for (const r of plan) {
        const k = r.pattern || '(none)';
        byPattern[k] = (byPattern[k] || 0) + 1;
        byReason[r.reason] = (byReason[r.reason] || 0) + 1;
    }
    return { total: plan.length, stamped: plan.filter(r => r.pattern).length, byPattern, byReason };
}

// One machine literal per line: `{ name: '…', bodyPart: '…'[, type: '…'][, pattern: '…'] },`
const MACHINE_LINE_RE = /^(\s*)\{ name: '((?:[^'\\]|\\.)*)'(.*?)\s*\},(\s*)$/;
const PATTERN_FIELD_RE = /,\s*pattern:\s*'[^']*'/;

/**
 * Rewrite the catalog source so each machine line carries exactly the
 * planned `pattern` (added, replaced or removed). Idempotent. Throws when the
 * source's machine lines don't line up one-to-one with the plan — the file
 * shape changed and a blind rewrite would mislabel machines.
 * @param {string} source - equipment-catalog.js text
 * @param {Array} plan - planCatalogPatterns output (source order)
 * @returns {string}
 */
export function stampCatalogSource(source, plan) {
    const lines = source.split('\n');
    let i = 0;
    const out = lines.map((text) => {
        const m = MACHINE_LINE_RE.exec(text.replace(/\r$/, ''));
        if (!m) return text;
        const row = plan[i];
        const name = m[2].replace(/\\(.)/g, '$1');
        if (!row || row.name !== name) {
            throw new Error(`catalog line ${i + 1} is "${name}" but the plan has "${row ? row.name : '(nothing)'}" — source shape changed`);
        }
        i += 1;
        const cr = text.endsWith('\r') ? '\r' : '';
        const rest = m[3].replace(PATTERN_FIELD_RE, '');
        const field = row.pattern ? `, pattern: '${row.pattern}'` : '';
        return `${m[1]}{ name: '${m[2]}'${rest}${field} },${m[4]}${cr}`;
    });
    if (i !== plan.length) throw new Error(`catalog has ${i} machine lines, plan has ${plan.length}`);
    return out.join('\n');
}
