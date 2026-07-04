// Equipment identity resolution — pure, no Firebase.
//
// The core of the Phase 8b migration: map a workout/template/PR equipment NAME
// string to the owning equipment doc's stable ID. Built on the SAME matching
// the app already trusts (diceSimilarity + exact/alias), plus a confidence
// gate so a *confidently-wrong* match can never be written silently — anything
// ambiguous is flagged `needsReview` and routed to the scan-review UI instead
// of auto-writing a bad ID.

import { diceSimilarity } from './fuzzy-match.js';

/** Same normalization diceSimilarity uses internally, exposed for exact/alias
 *  equality checks: lowercase, non-alphanumerics → single space, trimmed. */
export function normalizeEquipName(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export const RESOLVE_METHOD = {
    EXACT: 'exact',
    ALIAS: 'alias',
    FUZZY: 'fuzzy',
    AMBIGUOUS: 'ambiguous',
    NONE: 'none',
};

const DEFAULTS = {
    // A fuzzy score below this is "not a match" (review). 0.72 is deliberately
    // stricter than the app's live 0.6 dedup threshold — a wrong write here is
    // permanent, so we'd rather send a borderline case to human review.
    fuzzyThreshold: 0.72,
    // The winner must beat the runner-up by at least this much, else it's a
    // coin-flip → review, not a silent guess.
    ambiguityBand: 0.05,
};

/**
 * Resolve one equipment NAME to an equipment doc ID.
 *
 * @param {string} name
 * @param {Array<{id:string, name:string, aliases?:string[]}>} equipment
 * @param {{fuzzyThreshold?:number, ambiguityBand?:number}} [opts]
 * @returns {{id:string|null, confidence:number, method:string,
 *            needsReview:boolean, candidates?:string[]}}
 *   `needsReview:true` means DO NOT auto-write — surface for confirmation.
 */
export function resolveEquipmentId(name, equipment = [], opts = {}) {
    const { fuzzyThreshold, ambiguityBand } = { ...DEFAULTS, ...opts };

    if (!name || !Array.isArray(equipment) || equipment.length === 0) {
        return { id: null, confidence: 0, method: RESOLVE_METHOD.NONE, needsReview: true };
    }

    const norm = normalizeEquipName(name);
    if (!norm) {
        return { id: null, confidence: 0, method: RESOLVE_METHOD.NONE, needsReview: true };
    }

    // 1) Exact normalized name match.
    const exact = equipment.filter(e => normalizeEquipName(e.name) === norm);
    if (exact.length === 1) {
        return { id: exact[0].id, confidence: 1, method: RESOLVE_METHOD.EXACT, needsReview: false };
    }
    if (exact.length > 1) {
        // Duplicate docs share this name — a real ambiguity (and a dedup bug);
        // don't guess which one owns the history.
        return {
            id: null, confidence: 1, method: RESOLVE_METHOD.AMBIGUOUS,
            needsReview: true, candidates: exact.map(e => e.id),
        };
    }

    // 2) Alias match — a name listed in aliases[] is a deliberate prior link.
    const aliasHits = equipment.filter(e =>
        Array.isArray(e.aliases) && e.aliases.some(a => normalizeEquipName(a) === norm));
    if (aliasHits.length === 1) {
        return { id: aliasHits[0].id, confidence: 0.95, method: RESOLVE_METHOD.ALIAS, needsReview: false };
    }
    if (aliasHits.length > 1) {
        return {
            id: null, confidence: 0.95, method: RESOLVE_METHOD.AMBIGUOUS,
            needsReview: true, candidates: aliasHits.map(e => e.id),
        };
    }

    // 3) Fuzzy — score all candidates, accept only a clear single winner.
    const scored = equipment
        .map(e => ({ id: e.id, score: diceSimilarity(name, e.name) }))
        .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const runnerUp = scored[1];

    if (!best || best.score < fuzzyThreshold) {
        return { id: null, confidence: best ? best.score : 0, method: RESOLVE_METHOD.NONE, needsReview: true };
    }
    if (runnerUp && (best.score - runnerUp.score) < ambiguityBand) {
        return {
            id: null, confidence: best.score, method: RESOLVE_METHOD.AMBIGUOUS,
            needsReview: true, candidates: [best.id, runnerUp.id],
        };
    }
    return { id: best.id, confidence: best.score, method: RESOLVE_METHOD.FUZZY, needsReview: false };
}
