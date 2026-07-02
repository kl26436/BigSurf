// Equipment Catalog (Firestore) — js/core/data/equipment-catalog-firestore.js
//
// Reads the global equipment catalog from Firestore (`equipmentCatalog/{brandSlug}`)
// with a fall-back to the static `EQUIPMENT_CATALOG` if Firestore is unreachable.
//
// The Firestore-backed shape is a superset of the static shape:
//   - Static machine: { name, bodyPart }
//   - Firestore machine: { id, slug, name, bodyPart, type, variants, imageUrl, exercises: { primary, secondary } }
//
// Existing consumers that destructure `{ name, bodyPart, type }` keep working
// because the augmented shape preserves those fields. New consumers can use
// `id` (catalog ref) and `exercises` (machine→exercise mapping).
//
// Seeding the Firestore catalog: see `scripts/seed-equipment-catalog.js`.
// Pure helpers (slugify / augment / resolve): see `equipment-catalog-helpers.js`.

import {
    db,
    collection,
    getDocs,
} from './firebase-config.js';
import { EQUIPMENT_CATALOG as STATIC_CATALOG } from './equipment-catalog.js';
import {
    augmentStaticCatalog,
    normalizeFirestoreBrand,
} from './equipment-catalog-helpers.js';
import { debugLog } from '../utils/config.js';

let cachedCatalog = null;
let inflight = null;

/**
 * Load the equipment catalog from Firestore, falling back to the static catalog
 * if Firestore is empty or unreachable. Caches in module memory after first call.
 */
export async function loadEquipmentCatalog({ forceReload = false } = {}) {
    if (cachedCatalog && !forceReload) return cachedCatalog;
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const snap = await getDocs(collection(db, 'equipmentCatalog'));
            if (snap.empty) {
                debugLog('📦 equipmentCatalog/ empty; using static catalog fallback');
                cachedCatalog = augmentStaticCatalog(STATIC_CATALOG);
                return cachedCatalog;
            }

            const brands = [];
            snap.forEach((d) => brands.push(normalizeFirestoreBrand({ slug: d.id, ...d.data() })));
            brands.sort((a, b) => a.name.localeCompare(b.name));

            debugLog(`📦 Loaded ${brands.length} brands from equipmentCatalog/`);
            cachedCatalog = brands;
            return cachedCatalog;
        } catch (err) {
            // Serve the static fallback but DON'T cache it — a transient network
            // error shouldn't pin degraded catalog data for the whole session.
            // The next loadEquipmentCatalog() call retries Firestore.
            console.error('❌ Failed to load equipmentCatalog from Firestore, using static fallback:', err);
            return augmentStaticCatalog(STATIC_CATALOG);
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

/**
 * Clear cache — test hook only. Deliberately not wired to any runtime path:
 * the catalog is a global admin-seeded collection that clients never write,
 * so the cache lives for the page session and a reload picks up admin changes.
 */
export function clearCatalogCache() {
    cachedCatalog = null;
    inflight = null;
}

// Re-export helpers so consumers can import from a single module.
export {
    slugify,
    augmentStaticCatalog,
    normalizeFirestoreBrand,
    isValidCatalogRef,
    resolveCatalogRef,
    buildCatalogRef,
} from './equipment-catalog-helpers.js';
