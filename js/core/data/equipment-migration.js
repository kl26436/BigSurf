// Equipment Migration v3 — js/core/data/equipment-migration.js
//
// Catalog-assisted migration that:
//   1. Matches each equipment record against the 731-machine catalog using
//      alias/typo correction, brand→line restructuring, and fuzzy matching.
//   2. Normalizes legacy fields (model → line, singular location → locations[],
//      singular video → exerciseVideos map, fills missing brand + function).
//   3. Strips brand/line names from function fields (e.g., "M-Torture Plated" → null).
//   4. Regenerates canonical display name from brand + line + function,
//      skipping "General" lines (type-only lines like MegaMass, Gymleco).
//   5. Reclassifies equipmentType from catalog (Machine/Other → Plate-Loaded/Selectorized).
//   6. Deduplicates equipment docs that collapse to the same normalized name,
//      merging locations / exerciseTypes / exerciseVideos / notes into the keeper.
//   7. Fixes malformed locations (comma-separated strings → separate entries).
//   8. Rewrites equipment-name references in workout docs (including
//      originalWorkout.exercises[]) and template docs to match canonical names.
//
// Always supports a dryRun mode that performs the full analysis without writing
// anything to Firestore, returning a preview the caller can show to the user
// before committing.
//
// Re-runnable: checks `equipmentMigrationV3` flag (not V2).

import {
    db,
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    getDocs,
    writeBatch,
} from './firebase-config.js';
import { debugLog } from '../utils/config.js';
import { EQUIPMENT_CATALOG } from './equipment-catalog.js';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeName(name) {
    return (name || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[—–-]+/g, '-');
}

function generateEquipmentName(brand, line, func) {
    // Skip "General" lines — these are type-only placeholders (MegaMass, Gymleco)
    const displayLine = (line && line !== 'General') ? line : null;
    if (brand && displayLine && func) return `${brand} ${displayLine} — ${func}`;
    if (brand && func)                return `${brand} — ${func}`;
    if (brand && displayLine)         return `${brand} ${displayLine}`;
    if (func)                         return func;
    return brand || 'Unknown Equipment';
}

function extractFunctionFromName(name, brand, line) {
    let remaining = (name || '').trim();
    if (brand) {
        remaining = remaining.replace(new RegExp('^' + escapeRegex(brand) + '\\s*', 'i'), '');
    }
    if (line) {
        remaining = remaining.replace(new RegExp('^' + escapeRegex(line) + '\\s*', 'i'), '');
    }
    remaining = remaining.replace(/^[—–\-·:]\s*/, '').trim();
    return remaining || null;
}

// ---------------------------------------------------------------------------
// Alias/typo map — corrects known misspellings & brand↔line confusion.
// Checked BEFORE catalog brand detection so typos get resolved first.
// ---------------------------------------------------------------------------

const ALIAS_MAP = [
    { patterns: ['hamemr strength'], brand: 'Hammer Strength', line: null, note: 'Typo corrected' },
    { patterns: ['arsenal cable'], brand: 'Arsenal Strength', line: null, note: 'Brand detected from name' },
    { patterns: ["roger\u2019s athletic", "roger's athletic", 'rogers athletic'], brand: 'Rogers Athletic', line: 'Pendulum', note: 'Brand corrected' },
    { patterns: ['rouge'], brand: 'Rogue', line: null, note: 'Typo corrected' },
    { patterns: ['m-torture', 'm torture'], brand: 'Newtech', line: 'M-Torture', note: 'Line→Brand restructured' },
    { patterns: ['pendulum'], brand: 'Rogers Athletic', line: 'Pendulum', note: 'Line→Brand restructured' },
    { patterns: ['edition 80'], brand: 'gym80', line: null, note: 'Brand alias' },
    { patterns: ['gymleco'], brand: 'Gymleco', line: null, note: 'Brand detected' },
    { patterns: ['mega mass', 'megamass'], brand: 'MegaMass', line: null, note: 'Brand detected' },
    { patterns: ['atlantis'], brand: 'Atlantis Strength', line: null, note: 'Brand alias' },
    { patterns: ['magnum'], brand: 'Matrix', line: 'Magnum', note: 'Brand→Line restructured' },
    { patterns: ['ultra'], brand: 'Matrix', line: 'Ultra', note: 'Brand→Line restructured' },
];

// Terms that are NOT real machine functions — they're brand/line names or generic modifiers
const BRANDISH_TERMS = new Set([
    'hammer strength', 'arsenal strength', 'matrix', 'life fitness', 'precor', 'hoist',
    'panatta', 'newtech', 'm-torture', 'pendulum', 'gymleco', 'mega mass', 'megamass',
    'atlantis', 'magnum', 'ultra', 'edition 80', "roger's athletic", 'rogers athletic',
    'rouge', 'rogue', 'cybex', 'dumbell', 'dumbbell',
    'm1', 'evo fit', 'cable', 'plated', 'selectorized',
]);

/** Is this function field just a brand/line name rather than a real machine function? */
function isBrandishFunction(fn) {
    if (!fn) return true;
    const f = fn.toLowerCase().trim();
    if (f === '') return true;
    if (BRANDISH_TERMS.has(f)) return true;
    // Multi-word: "M-Torture Plated", "Atlantis Plated", "Arsenal Cable" etc.
    const words = f.split(/[\s-]+/);
    return words.every(w => BRANDISH_TERMS.has(w));
}

// ---------------------------------------------------------------------------
// Equipment catalog matching
//
// Matches each record against the 731-machine catalog. Steps:
//   1. Resolve aliases/typos (brand corrections, line restructuring)
//   2. Strip brand/line names from function field to get clean function
//   3. Try exact match (brand + line + function all match catalog)
//   4. Try fuzzy match (brand matches, function words overlap ≥50%)
//      — only if there's a meaningful function, not just a brand name
//   5. Fall back to brand-only detection (tier 3)
// ---------------------------------------------------------------------------

function buildCatalogIndex() {
    const machines = [];
    const brandNames = [];

    for (const brandEntry of EQUIPMENT_CATALOG) {
        brandNames.push(brandEntry.brand);
        for (const line of brandEntry.lines) {
            for (const machine of line.machines) {
                machines.push({
                    brand: brandEntry.brand,
                    lineName: line.name,
                    machineName: machine.name,
                    type: machine.type || line.type,
                    bodyPart: machine.bodyPart,
                });
            }
        }
    }

    // Longest-first so "Arsenal Strength" matches before "Arsenal", etc.
    brandNames.sort((a, b) => b.length - a.length);
    return { machines, brandNames };
}

/**
 * Resolve aliases/typos and clean the function field.
 * Returns { brand, line, cleanFn, aliasNote } — the resolved identity fields
 * ready for catalog matching.
 */
function resolveAliases(eq) {
    const name = (eq.name || '').trim();
    const fn = (eq.function || '').trim();
    const brand = (eq.brand || '').trim();
    const line = (eq.line || '').trim();
    const searchText = `${name} ${fn} ${brand} ${line}`.toLowerCase();

    let resolvedBrand = brand;
    let resolvedLine = line;
    let aliasNote = null;

    // Check alias map
    for (const alias of ALIAS_MAP) {
        for (const pat of alias.patterns) {
            if (searchText.includes(pat)) {
                if (resolvedBrand === 'Unknown' || !resolvedBrand ||
                    searchText.includes(resolvedBrand.toLowerCase()) ||
                    pat.includes(resolvedBrand.toLowerCase())) {
                    resolvedBrand = alias.brand;
                }
                if (alias.line && !resolvedLine) {
                    resolvedLine = alias.line;
                }
                aliasNote = alias.note;
                break;
            }
        }
        if (aliasNote) break;
    }

    // Clean function field: strip brand/line names and alias patterns
    let cleanFn = fn;
    if (cleanFn) {
        const stripWords = [resolvedBrand, resolvedLine, brand, line, 'plated', 'cable', 'selectorized']
            .filter(Boolean);
        // Also strip matched alias patterns
        for (const alias of ALIAS_MAP) {
            for (const pat of alias.patterns) {
                if (searchText.includes(pat)) {
                    stripWords.push(pat);
                    break;
                }
            }
        }
        stripWords.sort((a, b) => b.length - a.length);
        for (const sw of stripWords) {
            cleanFn = cleanFn.replace(new RegExp(escapeRegex(sw), 'gi'), '').trim();
        }
        cleanFn = cleanFn.replace(/^[\s\-—]+|[\s\-—]+$/g, '').trim();
    }

    const hasMeaningfulFunction = cleanFn && !isBrandishFunction(fn);

    return { brand: resolvedBrand, line: resolvedLine, cleanFn: hasMeaningfulFunction ? cleanFn : null, aliasNote };
}

function matchAgainstCatalog(eq, catalogIndex) {
    const { machines, brandNames } = catalogIndex;
    const { brand: resolvedBrand, line: resolvedLine, cleanFn, aliasNote } = resolveAliases(eq);

    // Detect brand from catalog if alias didn't resolve it
    let detectedBrand = resolvedBrand;
    if (!detectedBrand || detectedBrand === 'Unknown') {
        const searchText = `${eq.name} ${eq.function} ${eq.brand}`.toLowerCase();
        for (const bn of brandNames) {
            if (searchText.includes(bn.toLowerCase())) {
                detectedBrand = bn;
                break;
            }
        }
    }

    if (!detectedBrand || detectedBrand === 'Unknown') {
        return null; // No brand found — fall through to string parsing
    }

    // --- Tier 1: Exact match (brand + line + function all match catalog) ---
    if (cleanFn) {
        const brandMachines = machines.filter(m => m.brand.toLowerCase() === detectedBrand.toLowerCase());
        for (const cm of brandMachines) {
            // Match with explicit line
            if (resolvedLine && resolvedLine.toLowerCase() === cm.lineName.toLowerCase() &&
                cleanFn.toLowerCase() === cm.machineName.toLowerCase()) {
                return {
                    brand: cm.brand, line: cm.lineName, function: cm.machineName,
                    equipmentType: cm.type, matchTier: 1, aliasNote,
                };
            }
            // Match without line (function matches any line under the brand)
            if (!resolvedLine && cleanFn.toLowerCase() === cm.machineName.toLowerCase()) {
                return {
                    brand: cm.brand, line: cm.lineName, function: cm.machineName,
                    equipmentType: cm.type, matchTier: 1, aliasNote,
                };
            }
        }

        // --- Tier 2: Fuzzy match within the brand (function words overlap ≥50%) ---
        const stopWords = new Set(['the', 'and', 'for', 'machine', 'strength', 'fitness']);
        const fnWords = cleanFn.toLowerCase().split(/[\s-]+/).filter(w => w.length > 2 && !stopWords.has(w));

        if (fnWords.length > 0) {
            const brandMachinesForFuzzy = machines.filter(m => m.brand.toLowerCase() === detectedBrand.toLowerCase());
            let best = null;
            let bestScore = 0;

            for (const cm of brandMachinesForFuzzy) {
                const catalogWords = `${cm.lineName} ${cm.machineName}`.toLowerCase()
                    .split(/[\s-]+/).filter(w => w.length > 2 && !stopWords.has(w));
                let overlapCount = 0;
                for (const fw of fnWords) {
                    for (const cw of catalogWords) {
                        if (cw.includes(fw) || fw.includes(cw)) { overlapCount++; break; }
                    }
                }
                const score = overlapCount / fnWords.length;
                if (score > bestScore && score >= 0.5) {
                    bestScore = score;
                    best = cm;
                }
            }

            if (best) {
                return {
                    brand: best.brand, line: best.lineName, function: best.machineName,
                    equipmentType: best.type, matchTier: 2, aliasNote,
                };
            }
        }
    }

    // --- Tier 3: Brand detected only (no specific machine match) ---
    return {
        brand: detectedBrand,
        line: resolvedLine || null,
        function: cleanFn || null,
        equipmentType: null,
        matchTier: 3,
        aliasNote,
    };
}

// ---------------------------------------------------------------------------
// Analysis — pure, no Firestore writes
// ---------------------------------------------------------------------------

/**
 * Transform an equipment doc into its v3 shape in memory.
 *
 * V3 always trusts catalog over existing data (since v2 migration may have
 * stored incorrect values). Order of operations:
 *   1. Match against catalog (with alias/typo resolution).
 *      - Tiers 1–2: catalog OVERRIDES brand, line, function, and equipmentType.
 *      - Tier 3: catalog sets brand + line (if alias provided one), clears
 *        brandish function fields.
 *      - No match: preserve existing data, fill blanks.
 *   2. Migrate legacy fields (model → line, location → locations[], video → exerciseVideos).
 *   3. Fix malformed locations (comma-separated strings → split entries).
 *   4. Regenerate canonical name from brand + line + function (skip "General" lines).
 */
function normalizeEquipmentDoc(raw, catalogIndex) {
    const eq = { ...raw };
    let changed = false;
    let matchTier = 0;
    let aliasNote = null;

    // --- Step 1: catalog match (always overrides existing data) ---
    const catalogMatch = catalogIndex ? matchAgainstCatalog(eq, catalogIndex) : null;

    if (catalogMatch && catalogMatch.matchTier <= 2) {
        // Tier 1 or 2: catalog gives us everything — ALWAYS trust it
        if (eq.brand !== catalogMatch.brand) { eq.brand = catalogMatch.brand; changed = true; }
        const displayLine = (catalogMatch.line && catalogMatch.line !== 'General') ? catalogMatch.line : null;
        if (eq.line !== displayLine) { eq.line = displayLine; changed = true; }
        if (eq.function !== catalogMatch.function) { eq.function = catalogMatch.function; changed = true; }
        if (catalogMatch.equipmentType && eq.equipmentType !== catalogMatch.equipmentType) {
            eq.equipmentType = catalogMatch.equipmentType;
            changed = true;
        }
        matchTier = catalogMatch.matchTier;
        aliasNote = catalogMatch.aliasNote;
    } else if (catalogMatch && catalogMatch.matchTier === 3) {
        // Tier 3: brand (and maybe line) detected, function needs manual assignment
        if (eq.brand !== catalogMatch.brand) { eq.brand = catalogMatch.brand; changed = true; }
        if (catalogMatch.line) {
            const displayLine = catalogMatch.line !== 'General' ? catalogMatch.line : null;
            if (eq.line !== displayLine) { eq.line = displayLine; changed = true; }
        }
        // If the function was brandish (just a brand/line name), clear it
        if (catalogMatch.function) {
            if (eq.function !== catalogMatch.function) { eq.function = catalogMatch.function; changed = true; }
        } else if (isBrandishFunction(eq.function)) {
            if (eq.function) { eq.function = null; changed = true; }
        }
        matchTier = 3;
        aliasNote = catalogMatch.aliasNote;
    }

    // --- Step 2: legacy field migrations (for records that haven't been through v2 yet) ---

    // model → line
    if (!eq.line && eq.model) {
        eq.line = eq.model;
        changed = true;
    }

    // Fill brand when still missing
    if (!eq.brand) {
        eq.brand = 'Unknown';
        changed = true;
    }

    // Extract function from name when still missing (and not brandish)
    if (!eq.function) {
        const extracted = extractFunctionFromName(
            raw.name, // Use original name, not mutated
            eq.brand === 'Unknown' ? null : eq.brand,
            eq.line
        );
        if (extracted && !isBrandishFunction(extracted)) {
            eq.function = extracted;
            changed = true;
        }
    }

    // Legacy singular location → locations[]
    const locs = new Set();
    for (const l of (eq.locations || [])) {
        // Fix comma-separated location strings (e.g., "Absolute Recomp, Planet Fitness")
        if (l && l.includes(',')) {
            for (const part of l.split(',')) {
                const trimmed = part.trim();
                if (trimmed) locs.add(trimmed);
            }
            changed = true;
        } else if (l) {
            locs.add(l);
        }
    }
    if (eq.location) {
        locs.add(eq.location);
        changed = true;
    }
    eq.locations = [...locs];
    eq.location = null;

    // Legacy singular video → exerciseVideos map
    if (eq.video) {
        if (!eq.exerciseVideos) eq.exerciseVideos = {};
        const firstExercise = eq.exerciseTypes?.[0];
        if (firstExercise && !eq.exerciseVideos[firstExercise]) {
            eq.exerciseVideos[firstExercise] = eq.video;
        }
        changed = true;
    }
    eq.video = null;

    // --- Step 3: regenerate canonical name ---
    const newName = generateEquipmentName(
        eq.brand === 'Unknown' ? null : eq.brand,
        eq.line,
        eq.function
    );
    if (newName !== eq.name) {
        eq.name = newName;
    }

    return { eq, changed, matchTier, aliasNote };
}

/**
 * Full analysis pass — normalizes + dedupes + computes the rename map.
 * No Firestore reads/writes here beyond what was already loaded.
 */
function analyzeEquipment(allEquipment) {
    const catalogIndex = buildCatalogIndex();
    const nameMapping = new Map(); // oldName → newName (for workout/template rewrite)
    const renames = [];            // [{old, new, tier}] — for the preview UI
    const catalogMatches = { tier1: 0, tier2: 0, tier3: 0, unmatched: 0 };
    let normalizedCount = 0;

    // Pass 1: normalize every doc in memory
    const normalized = allEquipment.map((raw) => {
        const oldName = raw.name;
        const { eq, changed, matchTier, aliasNote } = normalizeEquipmentDoc(raw, catalogIndex);
        if (changed) normalizedCount++;

        eq._matchTier = matchTier;
        if (matchTier === 1) catalogMatches.tier1++;
        else if (matchTier === 2) catalogMatches.tier2++;
        else if (matchTier === 3) catalogMatches.tier3++;
        else catalogMatches.unmatched++;

        eq._aliasNote = aliasNote || null; // stash for dedup-pass renames

        if (oldName && oldName !== eq.name) {
            nameMapping.set(oldName, eq.name);
            renames.push({ old: oldName, new: eq.name, tier: matchTier, note: aliasNote });
        }
        eq.version = 3;
        return eq;
    });

    // Pass 2: group by normalized name
    const groups = new Map();
    for (const eq of normalized) {
        const key = normalizeName(eq.name);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(eq);
    }

    const toDelete = []; // equipment IDs to remove
    const keepers = [];  // keeper docs, potentially with merged data from dupes

    for (const group of groups.values()) {
        if (group.length === 1) {
            keepers.push(group[0]);
            continue;
        }

        // Keep the record with the most data (exerciseTypes + locations),
        // break ties by oldest createdAt.
        group.sort((a, b) => {
            const aScore = (a.exerciseTypes?.length || 0) + (a.locations?.length || 0);
            const bScore = (b.exerciseTypes?.length || 0) + (b.locations?.length || 0);
            if (bScore !== aScore) return bScore - aScore;
            return (a.createdAt || '').localeCompare(b.createdAt || '');
        });

        const keep = group[0];
        const dupes = group.slice(1);

        const mergedExerciseTypes = new Set(keep.exerciseTypes || []);
        const mergedLocations = new Set(keep.locations || []);
        const mergedVideos = { ...(keep.exerciseVideos || {}) };
        let mergedNotes = keep.notes || '';

        for (const dup of dupes) {
            (dup.exerciseTypes || []).forEach((t) => mergedExerciseTypes.add(t));
            (dup.locations || []).forEach((l) => mergedLocations.add(l));
            for (const [ex, url] of Object.entries(dup.exerciseVideos || {})) {
                if (!mergedVideos[ex]) mergedVideos[ex] = url;
            }
            if (dup.notes && dup.notes !== mergedNotes) {
                mergedNotes = mergedNotes ? `${mergedNotes}\n${dup.notes}` : dup.notes;
            }
            if (dup.name !== keep.name) {
                nameMapping.set(dup.name, keep.name);
                // Tier and note reflect the *keeper's* identification quality —
                // that's where the data lands after the merge.
                renames.push({
                    old: dup.name,
                    new: keep.name,
                    tier: keep._matchTier,
                    note: keep._aliasNote || null,
                });
            }
            toDelete.push(dup.id);
        }

        keep.exerciseTypes = [...mergedExerciseTypes];
        keep.locations = [...mergedLocations];
        keep.exerciseVideos = mergedVideos;
        keep.notes = mergedNotes;
        keepers.push(keep);
    }

    return { keepers, toDelete, nameMapping, renames, normalizedCount, catalogMatches };
}

// ---------------------------------------------------------------------------
// Workout + template scanning
// ---------------------------------------------------------------------------

/**
 * Scan workouts + templates and collect the updates required by nameMapping.
 * Returns { workoutUpdates, templateUpdates } arrays — each entry is
 * { ref, update } so the write pass can just iterate. When nameMapping is
 * empty we return empty arrays without reading anything.
 */
async function scanWorkoutAndTemplateReferences(userId, nameMapping) {
    if (nameMapping.size === 0) {
        return { workoutUpdates: [], templateUpdates: [] };
    }

    const workoutUpdates = [];
    const templateUpdates = [];

    const workoutsRef = collection(db, 'users', userId, 'workouts');
    const workoutsSnap = await getDocs(query(workoutsRef));

    for (const wDoc of workoutsSnap.docs) {
        const data = wDoc.data();
        let changed = false;

        // data.exercises is a map (exercise_0, exercise_1, ...)
        const exercises = data.exercises || {};
        for (const key of Object.keys(exercises)) {
            const ex = exercises[key];
            if (ex && ex.equipment && nameMapping.has(ex.equipment)) {
                ex.equipment = nameMapping.get(ex.equipment);
                changed = true;
            }
        }

        // data.originalWorkout.exercises is an array
        const originalExercises = data.originalWorkout?.exercises;
        if (Array.isArray(originalExercises)) {
            for (const ex of originalExercises) {
                if (ex && ex.equipment && nameMapping.has(ex.equipment)) {
                    ex.equipment = nameMapping.get(ex.equipment);
                    changed = true;
                }
            }
        }

        if (changed) {
            const update = { exercises };
            if (originalExercises) update.originalWorkout = data.originalWorkout;
            workoutUpdates.push({ ref: wDoc.ref, update });
        }
    }

    const templatesRef = collection(db, 'users', userId, 'templates');
    const templatesSnap = await getDocs(query(templatesRef));

    for (const tDoc of templatesSnap.docs) {
        const data = tDoc.data();
        let changed = false;

        // Templates may store exercises as an array or (legacy) object map.
        if (Array.isArray(data.exercises)) {
            for (const ex of data.exercises) {
                if (ex && ex.equipment && nameMapping.has(ex.equipment)) {
                    ex.equipment = nameMapping.get(ex.equipment);
                    changed = true;
                }
            }
        } else if (data.exercises && typeof data.exercises === 'object') {
            for (const key of Object.keys(data.exercises)) {
                const ex = data.exercises[key];
                if (ex && ex.equipment && nameMapping.has(ex.equipment)) {
                    ex.equipment = nameMapping.get(ex.equipment);
                    changed = true;
                }
            }
        }

        if (changed) {
            templateUpdates.push({ ref: tDoc.ref, update: { exercises: data.exercises } });
        }
    }

    return { workoutUpdates, templateUpdates };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Run (or preview) equipment migration v3 for a user.
 *
 * @param {string} userId
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {Promise<object>}
 *   - If the migration flag is already set: { migrated: false, alreadyDone: true }
 *   - If dryRun: { migrated: false, dryRun: true, preview: {...} }
 *   - If real run: { migrated: true, merged, renamed, workoutsUpdated, templatesUpdated, catalogMatches }
 */
export async function runEquipmentMigrationV3(userId, { dryRun = false } = {}) {
    if (!userId) {
        return { migrated: false, error: 'No user ID' };
    }

    const prefsRef = doc(db, 'users', userId, 'preferences', 'settings');
    const prefsSnap = await getDoc(prefsRef);
    if (prefsSnap.data()?.equipmentMigrationV3) {
        return { migrated: false, alreadyDone: true };
    }

    debugLog(dryRun ? 'Equipment migration v3: dry run' : 'Equipment migration v3: running');

    // Load all equipment
    const equipRef = collection(db, 'users', userId, 'equipment');
    const equipSnap = await getDocs(query(equipRef));
    const allEquipment = [];
    equipSnap.forEach((d) => allEquipment.push({ id: d.id, ...d.data() }));

    if (allEquipment.length === 0) {
        // Nothing to migrate — just set the flag (even in dryRun we skip prompt).
        if (!dryRun) {
            await setDoc(prefsRef, { equipmentMigrationV3: true }, { merge: true });
        }
        return {
            migrated: !dryRun,
            dryRun,
            preview: {
                totalRecords: 0,
                duplicatesToMerge: 0,
                renames: [],
                fieldsNormalized: 0,
                workoutsAffected: 0,
                templatesAffected: 0,
                catalogMatches: { tier1: 0, tier2: 0, tier3: 0, unmatched: 0 },
            },
        };
    }

    // Analysis (pure)
    const { keepers, toDelete, nameMapping, renames, normalizedCount, catalogMatches } =
        analyzeEquipment(allEquipment);

    // Scan workouts + templates for references that need rewriting
    const { workoutUpdates, templateUpdates } = await scanWorkoutAndTemplateReferences(
        userId,
        nameMapping
    );

    const preview = {
        totalRecords: allEquipment.length,
        duplicatesToMerge: toDelete.length,
        renames, // [{ old, new, tier }] — tier used for UI badge
        fieldsNormalized: normalizedCount,
        workoutsAffected: workoutUpdates.length,
        templatesAffected: templateUpdates.length,
        catalogMatches, // { tier1, tier2, tier3, unmatched }
    };

    if (dryRun) {
        return { migrated: false, dryRun: true, preview };
    }

    // ---- Real run: batch writes ----
    const BATCH_LIMIT = 450;
    let batch = writeBatch(db);
    let opCount = 0;

    async function flushIfFull() {
        if (opCount >= BATCH_LIMIT) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
        }
    }

    // 1) Write keeper equipment docs (canonical v3 shape)
    for (const eq of keepers) {
        const eqRef = doc(db, 'users', userId, 'equipment', eq.id);
        batch.set(eqRef, {
            id: eq.id,
            name: eq.name,
            brand: eq.brand || 'Unknown',
            line: eq.line || null,
            function: eq.function || null,
            equipmentType: eq.equipmentType || 'Other',
            baseWeight: typeof eq.baseWeight === 'number' ? eq.baseWeight : 0,
            baseWeightUnit: eq.baseWeightUnit || 'lbs',
            locations: eq.locations || [],
            exerciseTypes: eq.exerciseTypes || [],
            exerciseVideos: eq.exerciseVideos || {},
            notes: eq.notes || '',
            createdAt: eq.createdAt || new Date().toISOString(),
            lastUsed: eq.lastUsed || new Date().toISOString(),
            version: 3,
        });
        opCount++;
        await flushIfFull();
    }

    // 2) Delete duplicate equipment docs
    for (const dupId of toDelete) {
        batch.delete(doc(db, 'users', userId, 'equipment', dupId));
        opCount++;
        await flushIfFull();
    }

    // 3) Rewrite workout references
    for (const { ref, update } of workoutUpdates) {
        batch.update(ref, update);
        opCount++;
        await flushIfFull();
    }

    // 4) Rewrite template references
    for (const { ref, update } of templateUpdates) {
        batch.update(ref, update);
        opCount++;
        await flushIfFull();
    }

    // 5) Set the flag
    batch.set(prefsRef, { equipmentMigrationV3: true }, { merge: true });
    opCount++;

    // Final commit
    if (opCount > 0) {
        await batch.commit();
    }

    debugLog(
        `Equipment migration v3 complete: merged ${toDelete.length} duplicates, ` +
        `renamed ${nameMapping.size} references, ` +
        `updated ${workoutUpdates.length} workouts + ${templateUpdates.length} templates`
    );

    return {
        migrated: true,
        merged: toDelete.length,
        renamed: nameMapping.size,
        workoutsUpdated: workoutUpdates.length,
        templatesUpdated: templateUpdates.length,
        catalogMatches,
    };
}

/**
 * Build a pre-migration snapshot of everything the migration can touch:
 * equipment documents, workouts (equipment name references), and templates.
 * The returned object can be serialized to JSON and downloaded as a backup
 * the user can keep locally in case the migration produces an unexpected result.
 *
 * This does NOT write to Firestore.
 */
export async function exportPreMigrationSnapshot(userId) {
    if (!userId) {
        throw new Error('exportPreMigrationSnapshot: userId required');
    }

    const [equipSnap, workoutsSnap, templatesSnap] = await Promise.all([
        getDocs(query(collection(db, 'users', userId, 'equipment'))),
        getDocs(query(collection(db, 'users', userId, 'workouts'))),
        getDocs(query(collection(db, 'users', userId, 'templates'))),
    ]);

    return {
        schema: 'bigsurf-equipment-migration-v3-backup',
        exportedAt: new Date().toISOString(),
        userId,
        counts: {
            equipment: equipSnap.size,
            workouts: workoutsSnap.size,
            templates: templatesSnap.size,
        },
        equipment: equipSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        workouts: workoutsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        templates: templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
}
