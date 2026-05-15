// Fuzzy string matching — pure helpers (no Firebase imports).
//
// Used by the history reconciliation flow in equipment-library-ui.js to score
// the similarity between an orphan equipment-name from workout history and
// candidate equipment names from the user's library. Extracted so unit tests
// can verify the scoring without bootstrapping Firebase.

/**
 * Dice-coefficient bigram similarity. Range 0..1. Stable for short strings,
 * tolerant of typos, word reorderings, and casing / whitespace differences.
 *
 *   diceSimilarity("Hammer Strength Iso Row", "Iso Row Hammer Strength") ≈ 1.0
 *   diceSimilarity("Cable Crossover", "Crossover Cable")                 ≈ 0.9
 *   diceSimilarity("Flat Bench", "Hammer Strength Flat Bench")           ≈ 0.55
 *   diceSimilarity("Treadmill", "Leg Press")                             ≈ 0
 */
export function diceSimilarity(a, b) {
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const A = norm(a);
    const B = norm(b);
    if (!A || !B) return 0;
    if (A === B) return 1;
    if (A.length < 2 || B.length < 2) return A === B ? 1 : 0;

    const bigrams = (s) => {
        const out = new Map();
        for (let i = 0; i < s.length - 1; i += 1) {
            const bg = s.slice(i, i + 2);
            out.set(bg, (out.get(bg) || 0) + 1);
        }
        return out;
    };

    const bgA = bigrams(A);
    const bgB = bigrams(B);
    let intersection = 0;
    for (const [bg, ca] of bgA) {
        const cb = bgB.get(bg);
        if (cb) intersection += Math.min(ca, cb);
    }
    const sumA = [...bgA.values()].reduce((s, n) => s + n, 0);
    const sumB = [...bgB.values()].reduce((s, n) => s + n, 0);
    return (2 * intersection) / (sumA + sumB);
}

/**
 * Find the best match among `candidates` for `target`. `candidates` is an
 * array of either strings or `{name, ...}` objects. Returns `{candidate, score}`
 * or null if no candidate reaches `threshold`.
 */
export function findBestMatch(target, candidates, threshold = 0.6) {
    if (!target || !Array.isArray(candidates) || candidates.length === 0) return null;
    let best = null;
    for (const c of candidates) {
        const name = typeof c === 'string' ? c : (c?.name || '');
        const score = diceSimilarity(target, name);
        if (score >= threshold && (!best || score > best.score)) {
            best = { candidate: c, score };
        }
    }
    return best;
}
