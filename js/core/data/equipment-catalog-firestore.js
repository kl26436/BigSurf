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
            console.error('❌ Failed to load equipmentCatalog from Firestore, using static fallback:', err);
            cachedCatalog = augmentStaticCatalog(STATIC_CATALOG);
            return cachedCatalog;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

/**
 * Synchronous accessor for code paths that already have the catalog loaded.
 * Returns null if not yet loaded — callers should `await loadEquipmentCatalog()` first.
 */
export function getCachedCatalog() {
    return cachedCatalog;
}

/**
 * Clear cache — test hook and force-reload after admin updates.
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
