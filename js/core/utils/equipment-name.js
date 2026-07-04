// Equipment display-name composition — pure, dependency-free leaf util.
//
// The equipment identity model has three semantic fields — brand, line, and
// function (the machine's job, e.g. "Chest Press") — plus a legacy `name`
// string that historically acted as the display label AND the mutable FK.
// Phase 8b makes `equipmentId` the FK; `name` becomes a derived display
// fallback. This composer is the single source of truth for turning the three
// identity fields into that `name`, so the add flow, the identity picker, and
// the quick-edit sheet all regenerate it the same way (no stale composed names).

/**
 * Compose the display name from identity fields.
 *   brand + line + function → "Brand Line — Function"
 *   brand + function        → "Brand — Function"
 *   brand + line            → "Brand Line"
 *   function only           → "Function"
 *   brand only              → "Brand"
 * "Unknown" brand is treated as no brand. Returns '' when nothing is set.
 *
 * @param {{brand?:string, line?:string, function?:string}} fields
 * @returns {string}
 */
export function composeEquipmentName({ brand, line, function: func } = {}) {
    brand = (brand && brand.trim() !== '' && brand !== 'Unknown') ? brand.trim() : '';
    line = (line || '').trim();
    func = (func || '').trim();

    if (brand && line && func) return `${brand} ${line} — ${func}`;
    if (brand && func) return `${brand} — ${func}`;
    if (brand && line) return `${brand} ${line}`;
    if (func) return func;
    return brand || '';
}
