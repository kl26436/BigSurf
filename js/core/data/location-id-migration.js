// Location-id migration — pure planners (no Firebase, no writes).
//
// Phase 8b step 4: turn `equipment.locations[]` (gym NAME strings) into
// `equipment.locationIds[]` (stable location-doc ids), so the equipment↔gym
// relationship is keyed by id and the render-time "healing jobs" bridging the
// two representations can be retired. These functions PLAN the change so it can
// be tested and inspected before it touches real data.

import { resolveLocationId, normalizeLocationName } from './location-id-resolver.js';

function sameSet(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const sa = new Set(a);
    return b.every((x) => sa.has(x));
}

/**
 * Plan the `locationIds[]` backfill for equipment docs. Nothing is mutated.
 *
 * @param {Array<{id:string, locations?:string[], locationIds?:string[]}>} equipment
 * @param {Array<{id:string, name:string}>} locations
 * @returns {{writes:Array<{equipmentId:string, locationIds:string[]}>,
 *            orphanGymNames:string[], review:Array, stats:Object}}
 *   - writes: docs whose locationIds would change (idempotent — no-op if already correct)
 *   - orphanGymNames: gym names present on equipment with NO location doc (must be
 *     created before the collapse, else those associations would be dropped)
 *   - review: names that map to 2+ location docs (ambiguous — don't guess)
 */
export function planLocationIdBackfill(equipment = [], locations = []) {
    const writes = [];
    const orphanGymNames = new Set();
    const review = [];
    let totalNames = 0;
    let resolved = 0;

    for (const eq of equipment || []) {
        const names = Array.isArray(eq.locations) ? eq.locations.filter(Boolean) : [];
        if (names.length === 0) continue;

        const ids = [];
        for (const name of names) {
            totalNames++;
            const r = resolveLocationId(name, locations);
            if (r.id) {
                ids.push(r.id);
                resolved++;
            } else if (r.method === 'ambiguous') {
                review.push({ equipmentId: eq.id, name, candidates: r.candidates || [] });
            } else {
                orphanGymNames.add(name);
            }
        }

        const uniqueIds = [...new Set(ids)];
        const existing = Array.isArray(eq.locationIds) ? eq.locationIds : null;
        // Idempotent: only write when the resulting id set differs from what's there.
        if (uniqueIds.length && !sameSet(existing, uniqueIds)) {
            writes.push({ equipmentId: eq.id, locationIds: uniqueIds });
        }
    }

    return {
        writes,
        orphanGymNames: [...orphanGymNames],
        review,
        stats: {
            totalNames,
            resolved,
            orphans: orphanGymNames.size,
            review: review.length,
            docsToWrite: writes.length,
        },
    };
}

/**
 * Distinct gym names that appear on equipment but have no location doc. These
 * are the docs the migration must CREATE (so every gym has a stable id) before
 * `locationIds[]` can fully replace `locations[]`.
 *
 * @returns {string[]} distinct orphan gym names (original casing of first sighting)
 */
export function planOrphanGymDocs(equipment = [], locations = []) {
    const haveDoc = new Set((locations || []).map((l) => normalizeLocationName(l.name)));
    const orphans = new Map(); // normalized → original casing
    for (const eq of equipment || []) {
        const names = Array.isArray(eq.locations) ? eq.locations.filter(Boolean) : [];
        for (const name of names) {
            const norm = normalizeLocationName(name);
            if (norm && !haveDoc.has(norm) && !orphans.has(norm)) {
                orphans.set(norm, name);
            }
        }
    }
    return [...orphans.values()];
}
