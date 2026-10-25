// Catalog search - core/data/catalog-search.js
//
// Free-text search over EQUIPMENT_CATALOG for the equipment pickers. Pulled
// out of active-workout-ui.js so it's a pure, directly-testable unit (that
// module's import graph needs a DOM to load at all).
//
// Why it exists: the pickers used to search only equipment you already own,
// so searching for the machine you're standing in front of dead-ended on
// "No matches" and the add path was a separate sheet with its own search box.
// One query now covers owned + addable.

/** Collapse a name to a comparable key (case, separators, spacing). */
export function equipNameKey(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Every word of the query appears somewhere in `hay`, in any order —
 * "hammer chest" finds "Hammer Strength — Chest Press". A contiguous-substring
 * miss here is how a machine you already own got created a second time.
 */
export function matchesAllTokens(hay, query) {
    const tokens = equipNameKey(query).split(' ').filter(Boolean);
    if (tokens.length === 0) return false;
    const h = equipNameKey(hay);
    return tokens.every((t) => h.includes(t));
}

/**
 * Keys for equipment the user already owns — catalogRefs plus normalized
 * name/function strings — so a machine already in the library never renders
 * again as an "add" row underneath itself.
 *
 * @param {Array} allEquipment - user equipment docs
 * @returns {{refs: Set<string>, names: Set<string>}}
 */
export function ownedEquipmentKeys(allEquipment) {
    const refs = new Set();
    const names = new Set();
    (allEquipment || []).forEach((eq) => {
        if (eq.catalogRef) refs.add(eq.catalogRef);
        const n = equipNameKey(eq.name);
        if (n) names.add(n);
        const f = equipNameKey(eq.function);
        if (f) names.add(f);
    });
    return { refs, names };
}

/**
 * Free-text search over the equipment catalog. Ranked machine-name prefix >
 * machine-name substring > brand/line/type match; owned machines are filtered
 * out (they already render in the picker's own sections).
 *
 * Two chars minimum — a single letter matches most of the catalog and would
 * bury the user's own equipment under add-rows.
 *
 * @param {string} query
 * @param {Array} catalog - the AUGMENTED catalog shape (augmentStaticCatalog /
 *   AppState.equipmentCatalog): [{name, lines: [{name, type, machines: [{id, name, type, bodyPart}]}]}].
 *   The raw EQUIPMENT_CATALOG export uses `brand:` and has no machine ids — passing
 *   it here yields undefined catalogRefs and brand names.
 * @param {{owned?: {refs: Set, names: Set}, max?: number}} [opts]
 * @returns {Array<{catalogRef, name, brandName, lineName, type, bodyPart}>}
 */
export function searchCatalogMachines(query, catalog, { owned = null, max = 6 } = {}) {
    const q = (query || '').toLowerCase().trim();
    if (q.length < 2) return [];
    const refs = owned?.refs || new Set();
    const names = owned?.names || new Set();
    const hits = [];
    for (const brand of catalog || []) {
        for (const line of brand.lines || []) {
            for (const m of line.machines || []) {
                if (refs.has(m.id) || names.has(equipNameKey(m.name))) continue;
                const mName = (m.name || '').toLowerCase();
                const ctx = `${brand.name || ''} ${line.name || ''} ${m.type || line.type || ''}`.toLowerCase();
                let rank;
                if (mName.startsWith(q)) rank = 0;
                else if (mName.includes(q)) rank = 1;
                else if (ctx.includes(q)) rank = 2;
                else if (matchesAllTokens(`${ctx} ${mName}`, q)) rank = 3;
                else continue;
                hits.push({
                    rank,
                    catalogRef: m.id,
                    name: m.name,
                    brandName: brand.name,
                    lineName: line.name,
                    type: m.type || line.type || 'Other',
                    bodyPart: m.bodyPart || 'Multi-Use',
                });
            }
        }
    }
    hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    return hits.slice(0, max).map((h) => ({
        catalogRef: h.catalogRef,
        name: h.name,
        brandName: h.brandName,
        lineName: h.lineName,
        type: h.type,
        bodyPart: h.bodyPart,
    }));
}

/**
 * Best-guess equipment type for a name the catalog doesn't have. A wrong
 * guess is one tap to fix in quick-edit; asking for the type up front while
 * someone is standing at the machine is the friction being removed.
 *
 * @param {string} name
 * @returns {string} one of the EQUIPMENT_TYPE_ICONS keys
 */
export function inferEquipmentType(name) {
    const n = ` ${equipNameKey(name)} `;
    if (/ (cable|pulley|crossover|pulldown|pushdown) /.test(n)) return 'Cable';
    if (/ (dumbbell|db) /.test(n)) return 'Dumbbell';
    if (/ (barbell|smith|ez bar) /.test(n)) return 'Barbell';
    if (/ (bench) /.test(n)) return 'Bench';
    if (/ (rack|rig) /.test(n)) return 'Rack';
    if (/ (treadmill|bike|rower|elliptical|stair) /.test(n)) return 'Cardio';
    if (/ (plate loaded|iso lateral|hammer) /.test(n)) return 'Plate-Loaded';
    // AP-12: a pin-and-stack machine was always guessed as plain 'Machine'.
    if (/ (selectorized|selector|stack|pin loaded|pin select) /.test(n)) return 'Selectorized';
    return 'Machine';
}

/**
 * AP-14 — the one catalog machine an inline-created doc can be linked to, or
 * null. Only for picker-created docs with no catalogRef and a brand; only when
 * EXACTLY one catalog machine of that brand starts with the doc's function
 * (or its name minus the brand). Linking sets catalogRef — it never renames.
 * @param {Object} equipment - the equipment doc
 * @param {Array} catalog - the augmented catalog (see searchCatalogMachines)
 * @returns {{catalogRef, name, brandName, lineName, type, bodyPart}|null}
 */
export function catalogLinkCandidate(equipment, catalog) {
    if (!equipment || equipment.catalogRef || equipment.createdVia !== 'picker') return null;
    const brand = (equipment.brand || '').trim();
    if (!brand || brand === 'Unknown') return null;
    let q = (equipment.function || '').trim();
    if (!q) {
        const name = (equipment.name || '').trim();
        q = name.toLowerCase().startsWith(brand.toLowerCase()) ? name.slice(brand.length).trim() : '';
    }
    q = q.toLowerCase();
    if (q.length < 2) return null;
    const hits = searchCatalogMachines(q, catalog, { max: 100 })
        .filter(h => (h.brandName || '').toLowerCase() === brand.toLowerCase()
            && (h.name || '').toLowerCase().startsWith(q));
    return hits.length === 1 ? hits[0] : null;
}
