// Equipment Catalog — pure helpers (no Firebase imports).
//
// Split out of equipment-catalog-firestore.js so unit tests can import these
// without bootstrapping Firebase. The Firestore I/O module wraps these.

/**
 * Convert any string into a stable, URL-safe slug.
 * "Hammer Strength" → "hammer-strength"
 * "M-Torture (Plate-Loaded)" → "m-torture-plate-loaded"
 */
export function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'unknown';
}

/**
 * Augment the static catalog with stable ids + empty exercise mappings so the
 * fallback shape matches the Firestore shape exactly. Consumers don't need to
 * branch on the data source.
 */
export function augmentStaticCatalog(rawCatalog) {
    if (!Array.isArray(rawCatalog)) return [];
    return rawCatalog.map((brand) => {
        const brandSlug = slugify(brand.brand);
        return {
            slug: brandSlug,
            name: brand.brand,
            brand: brand.brand, // legacy alias
            lines: (brand.lines || []).map((line) => {
                const lineSlug = slugify(line.name);
                return {
                    name: line.name,
                    slug: lineSlug,
                    type: line.type || null,
                    machines: (line.machines || []).map((m) => {
                        const machineSlug = slugify(m.name);
                        return {
                            id: `${brandSlug}/${lineSlug}/${machineSlug}`,
                            slug: machineSlug,
                            name: m.name,
                            bodyPart: m.bodyPart || null,
                            type: m.type || line.type || null,
                            variants: m.variants || [],
                            imageUrl: m.imageUrl || null,
                            exercises: m.exercises || { primary: [], secondary: [] },
                        };
                    }),
                };
            }),
        };
    });
}

/**
 * Normalize a Firestore brand doc to the canonical augmented shape. Adds back
 * the `brand` field for legacy consumers that use it instead of `name`, and
 * inherits `type` from the line if the machine doesn't set one explicitly.
 */
export function normalizeFirestoreBrand(doc) {
    if (!doc) return null;
    return {
        slug: doc.slug,
        name: doc.name,
        brand: doc.name,
        lines: (doc.lines || []).map((line) => ({
            name: line.name,
            slug: line.slug,
            type: line.type,
            machines: (line.machines || []).map((m) => ({
                ...m,
                type: m.type || line.type || null,
            })),
        })),
    };
}

/**
 * Validate that a string is a well-formed catalog ref: "brand/line/machine".
 * All three segments must be non-empty after slugify normalization.
 */
export function isValidCatalogRef(ref) {
    if (typeof ref !== 'string' || !ref) return false;
    const parts = ref.split('/');
    if (parts.length !== 3) return false;
    return parts.every((p) => p && p.length > 0 && p === slugify(p));
}

/**
 * Resolve a catalog ref ("brand-slug/line-slug/machine-slug") against a
 * catalog (augmented or Firestore-normalized — both have the same shape).
 * Returns { brand, line, machine } or null.
 */
export function resolveCatalogRef(ref, catalog) {
    if (!isValidCatalogRef(ref) || !Array.isArray(catalog)) return null;
    const [brandSlug, lineSlug, machineSlug] = ref.split('/');

    const brand = catalog.find((b) => b.slug === brandSlug);
    if (!brand) return null;
    const line = brand.lines.find((l) => l.slug === lineSlug);
    if (!line) return null;
    const machine = line.machines.find((m) => m.slug === machineSlug);
    if (!machine) return null;
    return { brand, line, machine };
}

/**
 * Build a catalog ref from name strings (brand, line, machine). Returns null
 * if any name is empty.
 */
export function buildCatalogRef(brandName, lineName, machineName) {
    if (!brandName || !lineName || !machineName) return null;
    return `${slugify(brandName)}/${slugify(lineName)}/${slugify(machineName)}`;
}
