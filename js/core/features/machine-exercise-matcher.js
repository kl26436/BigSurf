// Machine → Exercise Fuzzy Matcher - core/features/machine-exercise-matcher.js
//
// Pure module (no imports) that suggests which exercises a piece of equipment
// supports, from its machine name alone. Used when a catalog machine is
// promoted to an equipment doc (Tier 0.2 of the multi-gym assessment): catalog
// entries carry only bodyPart, so without this a quick-added "Iso-Lateral
// Bench Press" doesn't know it supports Bench Press — it won't appear under
// "Used before" in the workout picker and contributes nothing to planner
// compatibility.
//
// Matching is deliberately conservative: a wrong exercise link pollutes the
// picker's "For <exercise>" section, while a missed link self-heals the first
// time the user selects the equipment (awSelectEquipment auto-associates).

/**
 * Light stemmer: strips a trailing plural "s" so "Curls" matches "Curl".
 * Keeps "-ss" words ("Press") intact.
 */
function stem(word) {
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }
    return word;
}

function tokenize(name) {
    return (name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(stem);
}

/** True when `needle` appears as a contiguous token run inside `haystack`. */
function containsSeq(haystack, needle) {
    if (needle.length === 0 || needle.length > haystack.length) return false;
    outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (haystack[i + j] !== needle[j]) continue outer;
        }
        return true;
    }
    return false;
}

/**
 * Suggest exercises a machine supports, by name.
 *
 * Rules, strongest first:
 *  1. Exercise name appears as a contiguous phrase inside the machine name
 *     ("Bench Press" ⊂ "Iso-Lateral Bench Press").
 *  2. Same, comparing space/hyphen-collapsed forms ("Pulldown" vs "Pull-Down").
 *  3. Machine name appears inside the exercise name with at most one extra
 *     word ("Pec Deck" → "Pec Deck Fly") — machines are often named for the
 *     movement minus a qualifier.
 *
 * Overlapping suggestions collapse to the most specific ("Hack Squat" beats
 * "Squat"). Single-token exercises shorter than 4 letters ("Row") are skipped —
 * too generic to trust from a name alone.
 *
 * @param {string} machineName
 * @param {string[]} exerciseNames - candidate exercise names (e.g. the library)
 * @param {{max?: number}} [opts]
 * @returns {string[]} suggested exercise names, most specific first
 */
export function suggestExercisesForMachine(machineName, exerciseNames, { max = 2 } = {}) {
    const machineTokens = tokenize(machineName);
    if (machineTokens.length === 0) return [];
    const machineCompact = machineTokens.join('');

    const scored = [];
    for (const exName of exerciseNames || []) {
        const exTokens = tokenize(exName);
        if (exTokens.length === 0) continue;
        if (exTokens.length === 1 && exTokens[0].length < 4) continue;

        const joined = exTokens.join(' ');
        const exCompact = exTokens.join('');
        let score = 0;
        if (containsSeq(machineTokens, exTokens)) {
            score = 100 + joined.length;
        } else if (exCompact.length >= 6 && machineCompact.includes(exCompact)) {
            score = 95 + joined.length;
        } else if (
            containsSeq(exTokens, machineTokens) &&
            exTokens.length - machineTokens.length === 1
        ) {
            score = 50 + machineTokens.join(' ').length;
        }
        if (score > 0) scored.push({ name: exName, compact: exCompact, score });
    }

    scored.sort((a, b) => b.score - a.score);

    const out = [];
    for (const s of scored) {
        if (out.some((o) => o.compact.includes(s.compact) || s.compact.includes(o.compact))) {
            continue;
        }
        out.push(s);
        if (out.length >= max) break;
    }
    return out.map((s) => s.name);
}
