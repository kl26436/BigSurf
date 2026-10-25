// Equipment create planner (AP-12) — what a typed machine name BECOMES.
//
// Thirteen code paths created equipment docs, each in its own shape: some
// deduped, some didn't; some tagged the gym, some didn't; one wrote
// 'lb' where everything else wrote 'lbs'; none set the unit. This module is
// the one set of rules they share, and FirebaseWorkoutManager#
// getOrCreateEquipment is the one writer (AP-13).
//
// Pure — no Firebase, no DOM. Callers pass the owned list and the catalog.

import { composeEquipmentName } from '../utils/equipment-name.js';
import { equipNameKey, inferEquipmentType } from './catalog-search.js';
import { diceSimilarity } from '../features/fuzzy-match.js';

/** A typed name this close to one you own is probably that machine. */
export const SIMILAR_EQUIPMENT_THRESHOLD = 0.75;

/** Empty-bar / starting-stack weights worth pre-filling, per type. */
export const BASE_WEIGHT_SUGGESTIONS = {
    Barbell: { lbs: 45, kg: 20 },
    Cable: { lbs: 5, kg: 2.5 },
};

export function suggestedBaseWeight(type, unit = 'lbs') {
    const row = BASE_WEIGHT_SUGGESTIONS[type];
    return row ? (row[unit === 'kg' ? 'kg' : 'lbs'] || 0) : 0;
}

/**
 * Brand names to recognise at the front of a typed name: the catalog's and
 * the ones the user already owns. Longest first, so "Hammer Strength Pro"
 * beats "Hammer Strength".
 * @param {Array} owned - equipment docs
 * @param {Array} catalog - augmented catalog brands ({name})
 */
export function knownBrands(owned = [], catalog = []) {
    const names = new Set();
    for (const e of owned || []) if (e?.brand && e.brand !== 'Unknown') names.add(e.brand.trim());
    for (const b of catalog || []) if (b?.name) names.add(b.name.trim());
    return [...names].filter(Boolean).sort((a, b) => b.length - a.length);
}

/**
 * Split a typed name into {brand, function} when it starts with a known
 * brand ("hammer strength incline press" → Hammer Strength / Incline press).
 * Brand matching ignores case and separators; the brand comes back in its
 * canonical spelling. {brand:null, function:null} when nothing matches.
 * @param {string} rawName
 * @param {string[]} brands - from knownBrands()
 */
export function parseEquipmentName(rawName, brands = []) {
    const raw = String(rawName || '').trim();
    if (!raw) return { brand: null, function: null };
    const key = equipNameKey(raw);
    for (const brand of brands || []) {
        const bk = equipNameKey(brand);
        if (!bk || !(key === bk || key.startsWith(`${bk} `))) continue;
        // Cut the same number of words off the raw text, keeping its casing.
        const words = raw.split(/\s+/);
        const brandWords = bk.split(' ').length;
        let taken = 0;
        let i = 0;
        while (i < words.length && taken < brandWords) {
            if (equipNameKey(words[i])) taken += 1;
            i += 1;
        }
        const rest = words.slice(i).join(' ').replace(/^[—–\-·:]\s*/, '').trim();
        return { brand, function: rest || null };
    }
    return { brand: null, function: null };
}

/**
 * The owned machine a name refers to, if any.
 *   'exact'     — same name ignoring case/spacing/separators (always the same machine)
 *   'similar'   — Dice ≥ threshold (probably the same; the UI asks)
 * @returns {{equipment:object, how:'exact'|'similar', score:number}|null}
 */
export function matchOwnedEquipment(name, owned = [], { threshold = SIMILAR_EQUIPMENT_THRESHOLD } = {}) {
    const key = equipNameKey(name);
    if (!key) return null;
    const list = (owned || []).filter(e => e?.name);
    const exact = list.find(e => equipNameKey(e.name) === key);
    if (exact) return { equipment: exact, how: 'exact', score: 1 };
    let best = null;
    for (const e of list) {
        const score = diceSimilarity(name, e.name);
        if (score >= threshold && (!best || score > best.score)) best = { equipment: e, how: 'similar', score };
    }
    return best;
}

/**
 * Plan what a typed machine name should do.
 * @param {object} args
 * @param {string} args.query - what was typed
 * @param {string|null} [args.exerciseName] - exercise it's for (linked at create)
 * @param {string|null} [args.gymName] - session gym (tagged at create)
 * @param {'lbs'|'kg'} [args.unit] - the exercise's unit → preferredUnit
 * @param {string|null} [args.brand] - explicit brand (mini-form)
 * @param {string|null} [args.type] - explicit type (mini-form)
 * @param {number|null} [args.baseWeight] - explicit base weight (mini-form)
 * @param {Array} [args.owned] - the user's equipment docs
 * @param {Array} [args.catalog] - augmented catalog brands
 * @param {boolean} [args.force] - create even when a similar machine exists
 * @param {string} [args.createdVia]
 * @returns {{action:'invalid', error:string}
 *   | {action:'use-existing', existing:object, how:string, score:number}
 *   | {action:'create', doc:object, similar:object|null}}
 */
export function planInlineEquipment({
    query, exerciseName = null, gymName = null, unit = 'lbs', brand = null, type = null,
    baseWeight = null, owned = [], catalog = [], force = false, createdVia = 'picker',
} = {}) {
    const typed = String(query || '').trim().replace(/\s+/g, ' ');
    if (typed.length < 2) return { action: 'invalid', error: 'Type at least 2 characters' };

    const match = matchOwnedEquipment(typed, owned);
    if (match && (match.how === 'exact' || !force)) {
        return { action: 'use-existing', existing: match.equipment, how: match.how, score: match.score };
    }

    let parsed;
    if (brand && brand.trim()) {
        const b = brand.trim();
        // The typed text may already start with the brand — don't say it twice.
        const again = parseEquipmentName(typed, [b]);
        parsed = { brand: b, function: again.brand ? again.function : typed };
    } else {
        parsed = parseEquipmentName(typed, knownBrands(owned, catalog));
    }
    const name = parsed.brand ? composeEquipmentName({ brand: parsed.brand, function: parsed.function }) : typed;
    const equipmentType = type || inferEquipmentType(typed);
    const u = unit === 'kg' ? 'kg' : 'lbs';
    const base = typeof baseWeight === 'number' && baseWeight >= 0 ? baseWeight : suggestedBaseWeight(equipmentType, u);

    return {
        action: 'create',
        similar: match || null,
        doc: {
            name,
            brand: parsed.brand || null,
            function: parsed.brand ? (parsed.function || null) : null,
            equipmentType,
            baseWeight: base,
            baseWeightUnit: u,
            preferredUnit: u,
            locations: gymName ? [gymName] : [],
            exerciseTypes: exerciseName ? [exerciseName] : [],
            createdVia,
        },
    };
}
