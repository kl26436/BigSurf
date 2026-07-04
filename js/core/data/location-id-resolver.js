// Location identity resolution — pure, no Firebase.
//
// Phase 8b step 4 collapses the equipment↔gym dual model (`equipment.locations[]`
// of gym NAME strings + `location.equipment[]` of catalog refs, joined by name)
// onto a single `equipment.locationIds[]` of stable location-doc ids. This maps a
// gym NAME to its location doc id so the relationship can be keyed by id.
//
// Two outcomes that are NOT the same and must not be conflated:
//   - AMBIGUOUS: two location docs share the name → don't guess which owns it.
//   - NONE (orphan): the gym exists only as a name on equipment, with no location
//     doc at all (GPS-detected gyms are written name-only). These need a doc
//     CREATED before the id-collapse, not human review.

export function normalizeLocationName(name) {
    return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export const LOCATION_RESOLVE = {
    EXACT: 'exact',
    AMBIGUOUS: 'ambiguous',
    NONE: 'none',
};

/**
 * Resolve a gym NAME to its location doc id.
 * @param {string} name
 * @param {Array<{id:string, name:string}>} locations
 * @returns {{id:string|null, method:string, needsReview:boolean, candidates?:string[]}}
 *   - id set, EXACT           → a single matching location doc
 *   - id null, AMBIGUOUS      → 2+ docs share the name (needsReview:true)
 *   - id null, NONE           → no doc for this gym name (an orphan to create)
 */
export function resolveLocationId(name, locations = []) {
    const norm = normalizeLocationName(name);
    if (!norm) {
        return { id: null, method: LOCATION_RESOLVE.NONE, needsReview: false };
    }
    if (!Array.isArray(locations) || locations.length === 0) {
        return { id: null, method: LOCATION_RESOLVE.NONE, needsReview: false };
    }
    const hits = locations.filter((l) => normalizeLocationName(l.name) === norm);
    if (hits.length === 1) {
        return { id: hits[0].id, method: LOCATION_RESOLVE.EXACT, needsReview: false };
    }
    if (hits.length > 1) {
        return {
            id: null, method: LOCATION_RESOLVE.AMBIGUOUS,
            needsReview: true, candidates: hits.map((l) => l.id),
        };
    }
    return { id: null, method: LOCATION_RESOLVE.NONE, needsReview: false };
}
