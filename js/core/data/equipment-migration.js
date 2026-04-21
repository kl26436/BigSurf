// Equipment Migration v2 — js/core/data/equipment-migration.js
//
// One-time migration that:
//   1. Normalizes legacy fields (model → line, singular location → locations[],
//      singular video → exerciseVideos map, fills missing brand + function).
//   2. Regenerates canonical display name from brand + line + function.
//   3. Deduplicates equipment docs that collapse to the same normalized name,
//      merging locations / exerciseTypes / exerciseVideos / notes into the keeper.
//   4. Rewrites equipment-name references in workout docs (including
//      originalWorkout.exercises[]) and template docs to match canonical names.
//
// Always supports a dryRun mode that performs the full analysis without writing
// anything to Firestore, returning a preview the caller can show to the user
// before committing.

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
        .replace(/[—–\-]+/g, '-');
}

function generateEquipmentName(brand, line, func) {
    if (brand && line && func) return `${brand} ${line} — ${func}`;
    if (brand && func)         return `${brand} — ${func}`;
    if (brand && line)         return `${brand} ${line}`;
    if (func)                  return func;
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
// Equipment catalog matching
//
// Before falling back to blind string parsing, try to identify each record
// against the 625-machine catalog in equipment-catalog.js. Returns a tier:
//   1 = full brand + machine match
//   2 = brand + fuzzy function match (shared words across machine name)
//   3 = brand detected only (line/function still need parsing)
//   0 = no catalog match (caller falls back to string parsing)
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

function matchAgainstCatalog(eq, catalogIndex) {
    const { machines, brandNames } = catalogIndex;
    const nameLC = (eq.name || '').toLowerCase();
    const existingBrand = eq.brand ? eq.brand.toLowerCase() : null;

    let detectedBrand = null;
    for (const bn of brandNames) {
        const bnLC = bn.toLowerCase();
        if (nameLC.includes(bnLC) || existingBrand === bnLC) {
            detectedBrand = bn;
            break;
        }
    }
    if (!detectedBrand) return null;

    const brandMachines = machines.filter((m) => m.brand === detectedBrand);

    // Tier 1: longest-first so "Iso-Lateral Bench Press" matches before "Bench Press"
    const byLength = [...brandMachines].sort(
        (a, b) => b.machineName.length - a.machineName.length
    );
    for (const cm of byLength) {
        if (nameLC.includes(cm.machineName.toLowerCase())) {
            return {
                brand: cm.brand,
                line: cm.lineName,
                function: cm.machineName,
                equipmentType: cm.type,
                matchTier: 1,
            };
        }
    }

    // Tier 2: strip brand (+ any line name that appears) and word-overlap against machines
    let remaining = nameLC.replace(detectedBrand.toLowerCase(), '').trim();
    remaining = remaining.replace(/^[—–\-·:\s]+/, '').trim();
    for (const cm of brandMachines) {
        const lineLC = cm.lineName.toLowerCase();
        if (remaining.includes(lineLC)) {
            remaining = remaining.replace(lineLC, '').trim();
            remaining = remaining.replace(/^[—–\-·:\s]+/, '').trim();
            break;
        }
    }

    if (remaining.length >= 3) {
        let best = null;
        let bestScore = 0;
        const remainingWords = remaining.split(/\s+/).filter(Boolean);

        for (const cm of brandMachines) {
            const machineWords = cm.machineName.toLowerCase().split(/\s+/).filter(Boolean);
            if (machineWords.length === 0) continue;
            const overlap = machineWords.filter((w) =>
                remainingWords.some((rw) => rw.includes(w) || w.includes(rw))
            );
            const score = overlap.length / machineWords.length;
            if (score > bestScore && score >= 0.5) {
                bestScore = score;
                best = cm;
            }
        }

        if (best) {
            return {
                brand: best.brand,
                line: best.lineName,
                function: best.machineName,
                equipmentType: best.type,
                matchTier: 2,
            };
        }
    }

    // Tier 3: brand only
    return {
        brand: detectedBrand,
        line: null,
        function: null,
        equipmentType: null,
        matchTier: 3,
    };
}

// ---------------------------------------------------------------------------
// Analysis — pure, no Firestore writes
// ---------------------------------------------------------------------------

/**
 * Transform a raw equipment doc into its v2 shape in memory.
 *
 * Order of operations:
 *   1. Try to identify the record against the catalog (EQUIPMENT_CATALOG).
 *      - Tiers 1–2 fill brand + line + function + equipmentType directly.
 *      - Tier 3 fills brand only, then we fall through to string parsing for
 *        line/function.
 *      - No match: pure string parsing + brand = "Unknown".
 *   2. Migrate legacy fields (model → line, location → locations[], video → exerciseVideos).
 *   3. Regenerate the canonical name from brand + line + function.
 *
 * Returns { eq, changed, matchTier }.
 *   `changed` is true if any legacy field was migrated or a catalog match
 *     backfilled a missing brand/line/function — this is what the preview
 *     counts as "normalized".
 *   `matchTier` is 0/1/2/3 for catalog-matches reporting.
 */
function normalizeEquipmentDoc(raw, catalogIndex) {
    const eq = { ...raw };
    let changed = false;
    let matchTier = 0;

    // --- Step 1: catalog match (catalogIndex is optional for test isolation) ---
    const catalogMatch = catalogIndex ? matchAgainstCatalog(eq, catalogIndex) : null;

    if (catalogMatch && catalogMatch.matchTier <= 2) {
        if (eq.brand !== catalogMatch.brand) { eq.brand = catalogMatch.brand; changed = true; }
        if (!eq.line && catalogMatch.line) { eq.line = catalogMatch.line; changed = true; }
        if (!eq.function && catalogMatch.function) { eq.function = catalogMatch.function; changed = true; }
        if (catalogMatch.equipmentType &&
            (!eq.equipmentType || eq.equipmentType === 'Other')) {
            eq.equipmentType = catalogMatch.equipmentType;
            changed = true;
        }
        matchTier = catalogMatch.matchTier;
    } else if (catalogMatch && catalogMatch.matchTier === 3) {
        if (eq.brand !== catalogMatch.brand) { eq.brand = catalogMatch.brand; changed = true; }
        matchTier = 3;
    }

    // --- Step 2: legacy field migrations + string-parsing fallback ---

    // model → line (works regardless of catalog match — catalog's line wins
    // if it was set above, otherwise legacy model backfills)
    if (!eq.line && eq.model) {
        eq.line = eq.model;
        changed = true;
    }

    // Fill brand when still missing (no catalog match + nothing stored)
    if (!eq.brand) {
        eq.brand = 'Unknown';
        changed = true;
    }

    // Extract function from name when still missing
    if (!eq.function) {
        eq.function = extractFunctionFromName(
            eq.name,
            eq.brand === 'Unknown' ? null : eq.brand,
            eq.line
        );
        changed = true;
    }

    // Legacy singular location → locations[]
    const locs = new Set(eq.locations || []);
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
        // Note: name changes are tracked via nameMapping/renames, not `changed`.
    }

    return { eq, changed, matchTier };
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
        const { eq, changed, matchTier } = normalizeEquipmentDoc(raw, catalogIndex);
        if (changed) normalizedCount++;

        eq._matchTier = matchTier;
        if (matchTier === 1) catalogMatches.tier1++;
        else if (matchTier === 2) catalogMatches.tier2++;
        else if (matchTier === 3) catalogMatches.tier3++;
        else catalogMatches.unmatched++;

        if (oldName && oldName !== eq.name) {
            nameMapping.set(oldName, eq.name);
            renames.push({ old: oldName, new: eq.name, tier: matchTier });
        }
        eq.version = 2;
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
                // Tier reflects the *keeper's* identification quality — that's
                // where the data lands after the merge.
                renames.push({ old: dup.name, new: keep.name, tier: keep._matchTier });
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
 * Run (or preview) equipment migration v2 for a user.
 *
 * @param {string} userId
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {Promise<object>}
 *   - If the migration flag is already set: { migrated: false, alreadyDone: true }
 *   - If dryRun: { migrated: false, dryRun: true, preview: {...} }
 *   - If real run: { migrated: true, merged, renamed, workoutsUpdated, templatesUpdated, catalogMatches }
 */
export async function runEquipmentMigrationV2(userId, { dryRun = false } = {}) {
    if (!userId) {
        return { migrated: false, error: 'No user ID' };
    }

    const prefsRef = doc(db, 'users', userId, 'preferences', 'settings');
    const prefsSnap = await getDoc(prefsRef);
    if (prefsSnap.data()?.equipmentMigrationV2) {
        return { migrated: false, alreadyDone: true };
    }

    debugLog(dryRun ? 'Equipment migration v2: dry run' : 'Equipment migration v2: running');

    // Load all equipment
    const equipRef = collection(db, 'users', userId, 'equipment');
    const equipSnap = await getDocs(query(equipRef));
    const allEquipment = [];
    equipSnap.forEach((d) => allEquipment.push({ id: d.id, ...d.data() }));

    if (allEquipment.length === 0) {
        // Nothing to migrate — just set the flag (even in dryRun we skip prompt).
        if (!dryRun) {
            await setDoc(prefsRef, { equipmentMigrationV2: true }, { merge: true });
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

    // 1) Write keeper equipment docs (canonical v2 shape)
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
            version: 2,
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
    batch.set(prefsRef, { equipmentMigrationV2: true }, { merge: true });
    opCount++;

    // Final commit
    if (opCount > 0) {
        await batch.commit();
    }

    debugLog(
        `Equipment migration v2 complete: merged ${toDelete.length} duplicates, ` +
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
        schema: 'bigsurf-equipment-migration-v2-backup',
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
