// Exercise → Machine Reverse Matcher - core/features/exercise-machine-matcher.js
//
// Reverse of machine-exercise-matcher.js: given an exercise name, suggest
// catalog machines that likely support it (traveler-flow F2 / D7). Used when
// the mid-workout equipment picker has nothing mapped for an exercise —
// suggest, don't shrug. Same conservative contiguous-phrase posture as the
// forward matcher: suggestions are ranked candidates the user confirms with a
// tap, never auto-added. (Stemming helpers deliberately duplicated from the
// forward matcher — self-contained beats a cross-module export under prod's
// 1-year JS cache.)

/** Light stemmer: strips a trailing plural "s"; keeps "-ss" ("Press"). */
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
 * Suggest catalog machines for an exercise.
 *
 * Rules, strongest first:
 *  1. Exercise name appears as a contiguous phrase inside the machine name
 *     ("Bench Press" → "Iso-Lateral Bench Press").
 *  2. Same on space/hyphen-collapsed forms ("Pull Down" → "Lat Pulldown").
 *  3. Machine name appears inside the exercise name with at most one extra
 *     word (machine "Pec Deck" for exercise "Pec Deck Fly").
 *
 * @param {string} exerciseName
 * @param {Array} catalog - EQUIPMENT_CATALOG shape: [{name, slug, lines: [{name, machines: [{id, name, type, bodyPart}]}]}]
 * @param {{max?: number}} [opts]
 * @returns {Array<{catalogRef, name, brandName, lineName, type, bodyPart}>} ranked
 */
export function suggestMachinesForExercise(exerciseName, catalog, { max = 4 } = {}) {
    const exTokens = tokenize(exerciseName);
    if (exTokens.length === 0) return [];
    if (exTokens.length === 1 && exTokens[0].length < 4) return [];
    const exCompact = exTokens.join('');

    const scored = [];
    for (const brand of catalog || []) {
        for (const line of brand.lines || []) {
            for (const machine of line.machines || []) {
                const mTokens = tokenize(machine.name);
                if (mTokens.length === 0) continue;
                const mCompact = mTokens.join('');

                let score = 0;
                if (containsSeq(mTokens, exTokens)) {
                    // Exact-length match beats a qualified variant slightly.
                    score = 100 + exCompact.length - (mTokens.length - exTokens.length);
                } else if (mCompact.includes(exCompact) && exCompact.length >= 6) {
                    score = 95;
                } else if (
                    containsSeq(exTokens, mTokens) &&
                    exTokens.length - mTokens.length === 1
                ) {
                    score = 50;
                }
                if (score > 0) {
                    scored.push({
                        catalogRef: machine.id,
                        name: machine.name,
                        brandName: brand.name,
                        lineName: line.name,
                        type: machine.type || line.type || 'Other',
                        bodyPart: machine.bodyPart || 'Multi-Use',
                        score,
                    });
                }
            }
        }
    }

    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored.slice(0, max).map(({ score: _score, ...rest }) => rest);
}
