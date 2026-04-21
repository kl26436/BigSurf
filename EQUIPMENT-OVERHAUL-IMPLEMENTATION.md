# Equipment Overhaul — Implementation Guide

**Priority**: Medium (after Active Workout V2, before Dashboard V2)
**Scope**: Data model cleanup, Brand → Line → Machine hierarchy, deduplication migration, picker redesign, library UI rewrite
**Depends on**: Nothing — this is self-contained
**Mockup**: `mockups/equipment-overhaul.html` (7 screens — locked in)

---

## Problem Statement

The equipment system has three core problems:

1. **Duplicates**: The same physical machine can exist as multiple Firestore documents because `getOrCreateEquipment()` only matches by exact name (case-insensitive). Slight naming variations (e.g., "Hammer Strength Chest Press" vs "Hammer Strength — Chest Press") create separate records.

2. **No useful grouping**: Equipment is a flat list. The user thinks in terms of Brand → Product Line → Machine (e.g., Panatta → EvoFit → Leg Extension), but the data model has no concept of a "product line" and brand is just an optional string.

3. **Picker is exercise-scoped**: During a workout, `getEquipmentForExercise()` only shows equipment already tagged with that exact exercise name. Users should see smart suggestions first, then all equipment at their current gym.

---

## Data Model — Current vs. New

### Current Equipment Document

```
users/{userId}/equipment/{equipmentId}
{
  id: string
  name: string                    // Display name (auto-generated from brand+model+function)
  brand: string | null            // e.g., "Hammer Strength"
  model: string | null            // e.g., "Plate-Loaded" (inconsistently used)
  function: string | null         // e.g., "Incline Press" (inconsistently used)
  equipmentType: string           // Plate-Loaded | Selectorized | Barbell | Dumbbell | Cable | Bench | Rack | Bodyweight | Other
  baseWeight: number              // Bar/carriage weight (especially relevant for Plate-Loaded)
  baseWeightUnit: "lbs" | "kg"
  location: string | null         // LEGACY single location
  locations: string[]             // Current: array of gym names
  exerciseTypes: string[]         // Exercise names that use this equipment
  exerciseVideos: { [exerciseName]: url }
  notes: string
  video: string | null            // Legacy single video
  createdAt: ISO string
  lastUsed: ISO string
}
```

### New Equipment Document (v2)

The `model` field is renamed to `line` to match the user's mental model (product line). The `function` field is kept as-is (the machine's purpose). The display `name` is auto-generated from `brand + line + function`.

```
users/{userId}/equipment/{equipmentId}
{
  id: string
  name: string                    // Auto-generated: "Panatta EvoFit — Leg Extension"
  brand: string                   // REQUIRED. e.g., "Panatta"
  line: string | null             // Product line. e.g., "EvoFit", "Plate-Loaded"
  function: string                // REQUIRED. What it does. e.g., "Leg Extension"
  equipmentType: string           // Plate-Loaded | Selectorized | Barbell | Dumbbell | Cable | Bench | Rack | Bodyweight | Other
  baseWeight: number              // Bar/carriage weight — especially relevant for Plate-Loaded (0 if N/A)
  baseWeightUnit: "lbs" | "kg"
  locations: string[]             // Array of gym location names
  exerciseTypes: string[]         // Exercise names that use this equipment
  exerciseVideos: { [exerciseName]: url }
  notes: string
  createdAt: ISO string
  lastUsed: ISO string
  version: 2                      // Migration marker
}
```

**Key changes:**
- `brand` is now required (migration fills "Unknown" for blank brands)
- `model` renamed to `line` (migration copies `model` → `line`)
- `function` is now required (migration extracts from `name` if blank)
- `location` (legacy singular) is removed — merged into `locations[]`
- `video` (legacy singular) is removed — use `exerciseVideos` map
- `name` is always auto-generated from `brand + line + function`
- `version: 2` marks the record as migrated

### Name Generation Rule

```javascript
function generateEquipmentName(brand, line, func) {
    if (brand && line && func) return `${brand} ${line} — ${func}`;
    if (brand && func)         return `${brand} — ${func}`;
    if (brand && line)         return `${brand} ${line}`;
    if (func)                  return func;
    return brand || 'Unknown Equipment';
}
```

### Workout Documents (unchanged)

Equipment in workout documents is still stored as a name string:
```
exercises.exercise_0.equipment = "Panatta EvoFit — Leg Extension"
exercises.exercise_0.equipmentLocation = "Fit4Less Oshawa"
```

This stays as-is. The migration updates these strings to match the canonical `name` from the equipment document.

---

## Phase 1: Data Migration

Run once on app load, gated behind `equipmentMigrationV2` flag in user preferences.

### File: `js/core/data/equipment-migration.js` (NEW)

#### Migration steps:

1. **Load all equipment documents**
2. **Catalog matching** (NEW): Before any string parsing, try to match each record against the 625-machine equipment catalog. This runs in three tiers:
   - **Tier 1 — Full match**: Equipment name contains a known brand AND a known machine function → fill `brand`, `line`, `function`, `equipmentType` from catalog.
   - **Tier 2 — Brand + fuzzy function**: Equipment name contains a known brand but no exact machine match → fill `brand` from catalog, fuzzy-match remaining text against that brand's machines for `line` + `function`.
   - **Tier 3 — Brand detection only**: Equipment name contains a known brand name → fill `brand`, let string parsing handle the rest.
   - Records that match no catalog entry fall through to step 3 unchanged.
3. **Normalize fields** (fallback for non-catalog matches): Copy `model` → `line`. Extract `function` from `name` if blank. Fill `brand` with "Unknown" if blank. Clear legacy `location` → merge into `locations[]`. Clear legacy `video` → merge into `exerciseVideos`.
4. **Regenerate `name`** from `brand + line + function` using the name generation rule.
5. **Deduplicate**: Group by normalized name. For groups with >1 record, merge into the one with the most `exerciseTypes` and `locations`. Merge `exerciseVideos`, `notes`, `locations`, `exerciseTypes` from duplicates into the kept record.
6. **Update workout documents**: For any equipment whose `name` changed (due to regeneration or dedup merge), update all workout documents and templates that reference the old name.
7. **Delete duplicate documents**.
8. **Set `equipmentMigrationV2: true`** in user preferences.

#### Catalog-Assisted Matching

The migration imports the equipment catalog and builds a lookup index for fast matching. This replaces blind string parsing with intelligent matching against 625 known machines across 18 brands.

**How matching works:**

The catalog is flattened into a lookup-friendly structure at migration start. For each equipment record, we try three tiers of matching before falling back to string parsing:

```javascript
// Tier 1: Does the name contain a known brand AND a known machine function?
//   "Panatta EvoFit Leg Extension" → brand: Panatta, line: EvoFit, function: Leg Extension ✓
//   "Hammer Strength Iso-Lateral Bench Press" → brand: Hammer Strength, line: Plate-Loaded, function: Iso-Lateral Bench Press ✓

// Tier 2: Known brand but no exact machine match — fuzzy match remaining text
//   "Arsenal Strength Reloaded Pendulum" → brand: Arsenal Strength, fuzzy "Pendulum" → Pendulum Squat in Reloaded line ✓

// Tier 3: Just a brand name detected — fill brand, let string parsing handle rest
//   "Rogue something custom" → brand: Rogue, line/function from string parsing

// No match: fall through to legacy string parsing (brand = "Unknown" if blank)
```

**Why this matters for dedup:**

Two records named "Panatta Leg Extension" and "Panatta EvoFit — Leg Extension" would currently survive as separate records because their normalized names differ. With catalog matching, both resolve to `{ brand: 'Panatta', line: 'EvoFit', function: 'Leg Extension' }` and generate the same canonical name — so they get merged.

#### Extracting `function` from existing `name` (fallback)

For equipment records that don't match anything in the catalog (custom/unknown brands), fall back to string parsing:

```javascript
function extractFunctionFromName(name, brand, line) {
    let remaining = name;
    // Strip brand from the front
    if (brand) {
        remaining = remaining.replace(new RegExp('^' + escapeRegex(brand) + '\\s*', 'i'), '');
    }
    // Strip line from the front
    if (line) {
        remaining = remaining.replace(new RegExp('^' + escapeRegex(line) + '\\s*', 'i'), '');
    }
    // Strip leading separators
    remaining = remaining.replace(/^[—–\-·:]\s*/, '').trim();
    return remaining || null;
}
```

#### Full migration code

```javascript
import { db, doc, getDoc, setDoc, deleteDoc, collection, query, getDocs } from './firebase-config.js';
import { writeBatch } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { debugLog } from '../utils/config.js';
import { EQUIPMENT_CATALOG } from './equipment-catalog.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeName(name) {
    return (name || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[—–\-]+/g, '-');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    if (brand) remaining = remaining.replace(new RegExp('^' + escapeRegex(brand) + '\\s*', 'i'), '');
    if (line) remaining = remaining.replace(new RegExp('^' + escapeRegex(line) + '\\s*', 'i'), '');
    remaining = remaining.replace(/^[—–\-·:]\s*/, '').trim();
    return remaining || null;
}

// ---------------------------------------------------------------------------
// Catalog index — built once, used for every record
// ---------------------------------------------------------------------------

function buildCatalogIndex() {
    // Flat list of every machine with its brand/line context
    const machines = [];    // { brand, line, lineName, machineName, type, bodyPart }
    const brandNames = [];  // sorted longest-first so "Arsenal Strength" matches before "Arsenal"

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

    // Sort brand names longest-first for greedy matching
    brandNames.sort((a, b) => b.length - a.length);

    return { machines, brandNames };
}

/**
 * Try to match an equipment record against the catalog.
 * Returns { brand, line, function, equipmentType, matchTier } or null.
 */
function matchAgainstCatalog(eq, catalogIndex) {
    const { machines, brandNames } = catalogIndex;
    const nameLC = (eq.name || '').toLowerCase();
    const existingBrand = eq.brand?.toLowerCase();

    // --- Detect brand from name or existing field ---
    let detectedBrand = null;
    for (const bn of brandNames) {
        if (nameLC.includes(bn.toLowerCase()) || existingBrand === bn.toLowerCase()) {
            detectedBrand = bn;
            break;
        }
    }

    if (!detectedBrand) return null; // No catalog brand found — fall through to string parsing

    // Get all machines for this brand
    const brandMachines = machines.filter(m => m.brand === detectedBrand);

    // --- Tier 1: Exact machine function match ---
    // Sort by machine name length (longest first) so "Iso-Lateral Bench Press" matches before "Bench Press"
    const sortedByLength = [...brandMachines].sort((a, b) => b.machineName.length - a.machineName.length);

    for (const cm of sortedByLength) {
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

    // --- Tier 2: Fuzzy function match ---
    // Strip brand (and line if present in name) from the name, then match remaining text
    let remaining = nameLC;
    remaining = remaining.replace(detectedBrand.toLowerCase(), '').trim();
    remaining = remaining.replace(/^[—–\-·:\s]+/, '').trim();

    // Also strip any line name that appears
    for (const cm of brandMachines) {
        if (remaining.includes(cm.lineName.toLowerCase())) {
            remaining = remaining.replace(cm.lineName.toLowerCase(), '').trim();
            remaining = remaining.replace(/^[��–\-·:\s]+/, '').trim();
            break;
        }
    }

    if (remaining.length >= 3) {
        // Score each machine by word overlap with remaining text
        let bestMatch = null;
        let bestScore = 0;

        for (const cm of brandMachines) {
            const machineWords = cm.machineName.toLowerCase().split(/\s+/);
            const remainingWords = remaining.split(/\s+/);
            const overlap = machineWords.filter(w => remainingWords.some(rw => rw.includes(w) || w.includes(rw)));
            const score = overlap.length / machineWords.length;

            if (score > bestScore && score >= 0.5) { // At least half the words match
                bestScore = score;
                bestMatch = cm;
            }
        }

        if (bestMatch) {
            return {
                brand: bestMatch.brand,
                line: bestMatch.lineName,
                function: bestMatch.machineName,
                equipmentType: bestMatch.type,
                matchTier: 2,
            };
        }
    }

    // --- Tier 3: Brand detection only ---
    return {
        brand: detectedBrand,
        line: null,
        function: null,
        equipmentType: null,
        matchTier: 3,
    };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export async function runEquipmentMigrationV2(userId, { dryRun = false } = {}) {
    const prefsRef = doc(db, 'users', userId, 'preferences', 'settings');
    const prefsSnap = await getDoc(prefsRef);
    if (prefsSnap.data()?.equipmentMigrationV2) {
        debugLog('Equipment migration v2 already complete');
        return { migrated: false };
    }

    debugLog('Running equipment migration v2...');

    // 1. Load all equipment
    const equipRef = collection(db, 'users', userId, 'equipment');
    const equipSnap = await getDocs(query(equipRef));
    const allEquipment = [];
    equipSnap.forEach(d => allEquipment.push({ id: d.id, ...d.data() }));

    if (allEquipment.length === 0) {
        if (!dryRun) await setDoc(prefsRef, { equipmentMigrationV2: true }, { merge: true });
        return { migrated: !dryRun, merged: 0, catalogMatches: 0 };
    }

    // 2. Build catalog index once
    const catalogIndex = buildCatalogIndex();

    // 3. Match + normalize fields on every record
    const nameMapping = new Map(); // oldName → newName
    let catalogMatches = { tier1: 0, tier2: 0, tier3: 0, unmatched: 0 };
    
    for (const eq of allEquipment) {
        const oldName = eq.name;
        eq._oldName = oldName; // Stash for dry-run preview
        
        // --- Step A: Try catalog match FIRST ---
        const catalogMatch = matchAgainstCatalog(eq, catalogIndex);
        
        if (catalogMatch && catalogMatch.matchTier <= 2) {
            // Tier 1 or 2: catalog gave us brand + line + function
            eq.brand = catalogMatch.brand;
            eq.line = catalogMatch.line || eq.line || eq.model || null;
            eq.function = catalogMatch.function || eq.function || null;
            if (catalogMatch.equipmentType && (!eq.equipmentType || eq.equipmentType === 'Other')) {
                eq.equipmentType = catalogMatch.equipmentType;
            }
            eq._catalogMatch = catalogMatch.matchTier;
            catalogMatches[`tier${catalogMatch.matchTier}`]++;
        } else if (catalogMatch && catalogMatch.matchTier === 3) {
            // Tier 3: catalog identified brand only
            eq.brand = catalogMatch.brand;
            // Still need string parsing for line + function
            if (!eq.line && eq.model) eq.line = eq.model;
            if (!eq.function) {
                eq.function = extractFunctionFromName(eq.name, eq.brand, eq.line);
            }
            eq._catalogMatch = 3;
            catalogMatches.tier3++;
        } else {
            // --- Step B: No catalog match — legacy string parsing ---
            if (!eq.line && eq.model) eq.line = eq.model;
            if (!eq.brand) eq.brand = 'Unknown';
            if (!eq.function) {
                eq.function = extractFunctionFromName(eq.name, eq.brand === 'Unknown' ? null : eq.brand, eq.line);
            }
            eq._catalogMatch = 0;
            catalogMatches.unmatched++;
        }
        
        // --- Step C: Legacy field migrations (always run) ---
        
        // Migrate location → locations
        const locations = new Set(eq.locations || []);
        if (eq.location) locations.add(eq.location);
        eq.locations = [...locations];
        eq.location = null;
        
        // Migrate video → exerciseVideos
        if (eq.video && !eq.exerciseVideos) {
            eq.exerciseVideos = {};
            if (eq.exerciseTypes?.[0]) {
                eq.exerciseVideos[eq.exerciseTypes[0]] = eq.video;
            }
        }
        eq.video = null;
        
        // Regenerate name from structured fields
        eq.name = generateEquipmentName(
            eq.brand === 'Unknown' ? null : eq.brand,
            eq.line,
            eq.function
        );
        
        if (oldName && oldName !== eq.name) {
            nameMapping.set(oldName, eq.name);
        }
        
        eq.version = 2;
    }

    // 3. Deduplicate — group by normalized new name
    const groups = new Map();
    for (const eq of allEquipment) {
        const key = normalizeName(eq.name);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(eq);
    }

    const toDelete = []; // equipment IDs to remove
    
    for (const [, group] of groups) {
        if (group.length <= 1) continue;

        // Keep the record with the most exerciseTypes, then most locations, then oldest
        group.sort((a, b) => {
            const aScore = (a.exerciseTypes?.length || 0) + (a.locations?.length || 0);
            const bScore = (b.exerciseTypes?.length || 0) + (b.locations?.length || 0);
            if (bScore !== aScore) return bScore - aScore;
            return (a.createdAt || '').localeCompare(b.createdAt || '');
        });

        const keep = group[0];
        const dupes = group.slice(1);

        // Merge data from duplicates into keeper
        const mergedExerciseTypes = new Set(keep.exerciseTypes || []);
        const mergedLocations = new Set(keep.locations || []);
        const mergedVideos = { ...(keep.exerciseVideos || {}) };
        let mergedNotes = keep.notes || '';

        for (const dup of dupes) {
            (dup.exerciseTypes || []).forEach(t => mergedExerciseTypes.add(t));
            (dup.locations || []).forEach(l => mergedLocations.add(l));
            for (const [ex, url] of Object.entries(dup.exerciseVideos || {})) {
                if (!mergedVideos[ex]) mergedVideos[ex] = url;
            }
            if (dup.notes && dup.notes !== mergedNotes) {
                mergedNotes = mergedNotes ? `${mergedNotes}\n${dup.notes}` : dup.notes;
            }
            // Map duplicate old names to the keeper's name
            if (dup.name !== keep.name) {
                nameMapping.set(dup.name, keep.name);
            }
            toDelete.push(dup.id);
        }

        keep.exerciseTypes = [...mergedExerciseTypes];
        keep.locations = [...mergedLocations];
        keep.exerciseVideos = mergedVideos;
        keep.notes = mergedNotes;
    }

    // --- Dry-run: count affected workouts/templates without writing ---
    let affectedWorkoutCount = 0;
    let affectedTemplateCount = 0;

    if (nameMapping.size > 0) {
        const workoutsRef = collection(db, 'users', userId, 'workouts');
        const workoutsSnap = await getDocs(query(workoutsRef));
        for (const wDoc of workoutsSnap.docs) {
            const data = wDoc.data();
            for (const key of Object.keys(data.exercises || {})) {
                if (nameMapping.has(data.exercises[key]?.equipment)) {
                    affectedWorkoutCount++;
                    break;
                }
            }
        }
        const templatesRef = collection(db, 'users', userId, 'templates');
        const templatesSnap = await getDocs(query(templatesRef));
        for (const tDoc of templatesSnap.docs) {
            for (const ex of (tDoc.data().exercises || [])) {
                if (nameMapping.has(ex?.equipment)) {
                    affectedTemplateCount++;
                    break;
                }
            }
        }
    }

    // --- Dry-run return ---
    if (dryRun) {
        return {
            migrated: false,
            dryRun: true,
            preview: {
                totalRecords: allEquipment.length,
                duplicatesToMerge: toDelete.length,
                renames: [...nameMapping.entries()].map(([old, newName]) => ({ old, new: newName })),
                fieldsNormalized: allEquipment.filter(eq => eq.version === 2).length,
                workoutsAffected: affectedWorkoutCount,
                templatesAffected: affectedTemplateCount,
                catalogMatches,   // { tier1, tier2, tier3, unmatched }
                // Per-record detail for the preview UI
                records: allEquipment.map(eq => ({
                    oldName: eq._oldName || eq.name,
                    newName: eq.name,
                    brand: eq.brand,
                    line: eq.line,
                    function: eq.function,
                    matchTier: eq._catalogMatch, // 0=unmatched, 1=exact, 2=fuzzy, 3=brand-only
                    isDuplicate: toDelete.includes(eq.id),
                })),
            },
        };
    }

    // --- Write updates in batches (Firestore limit: 500 ops per batch) ---
    const BATCH_LIMIT = 450;
    let batch = writeBatch(db);
    let opCount = 0;

    async function flushBatch() {
        if (opCount > 0) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
        }
    }

    // Update all equipment documents
    const keepIds = new Set(toDelete);
    for (const eq of allEquipment) {
        if (keepIds.has(eq.id)) continue; // Will be deleted
        const eqRef = doc(db, 'users', userId, 'equipment', eq.id);
        batch.set(eqRef, {
            id: eq.id,
            name: eq.name,
            brand: eq.brand,
            line: eq.line || null,
            function: eq.function || null,
            equipmentType: eq.equipmentType || 'Other',
            baseWeight: eq.baseWeight || 0,
            baseWeightUnit: eq.baseWeightUnit || 'lbs',
            locations: eq.locations,
            exerciseTypes: eq.exerciseTypes || [],
            exerciseVideos: eq.exerciseVideos || {},
            notes: eq.notes || '',
            createdAt: eq.createdAt || new Date().toISOString(),
            lastUsed: eq.lastUsed || new Date().toISOString(),
            version: 2,
        });
        opCount++;
        if (opCount >= BATCH_LIMIT) await flushBatch();
    }

    // Delete duplicates
    for (const dupId of toDelete) {
        batch.delete(doc(db, 'users', userId, 'equipment', dupId));
        opCount++;
        if (opCount >= BATCH_LIMIT) await flushBatch();
    }

    // Update workout documents with name remapping
    if (nameMapping.size > 0) {
        const workoutsRef = collection(db, 'users', userId, 'workouts');
        const workoutsSnap = await getDocs(query(workoutsRef));

        for (const wDoc of workoutsSnap.docs) {
            const data = wDoc.data();
            let changed = false;

            for (const key of Object.keys(data.exercises || {})) {
                const ex = data.exercises[key];
                if (ex.equipment && nameMapping.has(ex.equipment)) {
                    ex.equipment = nameMapping.get(ex.equipment);
                    changed = true;
                }
            }

            if (data.originalWorkout?.exercises) {
                for (const ex of data.originalWorkout.exercises) {
                    if (ex.equipment && nameMapping.has(ex.equipment)) {
                        ex.equipment = nameMapping.get(ex.equipment);
                        changed = true;
                    }
                }
            }

            if (changed) {
                batch.update(wDoc.ref, {
                    exercises: data.exercises,
                    originalWorkout: data.originalWorkout || null,
                });
                opCount++;
                if (opCount >= BATCH_LIMIT) await flushBatch();
            }
        }

        // Update templates too
        const templatesRef = collection(db, 'users', userId, 'templates');
        const templatesSnap = await getDocs(query(templatesRef));

        for (const tDoc of templatesSnap.docs) {
            const data = tDoc.data();
            let changed = false;
            for (const ex of (data.exercises || [])) {
                if (ex.equipment && nameMapping.has(ex.equipment)) {
                    ex.equipment = nameMapping.get(ex.equipment);
                    changed = true;
                }
            }
            if (changed) {
                batch.update(tDoc.ref, { exercises: data.exercises });
                opCount++;
                if (opCount >= BATCH_LIMIT) await flushBatch();
            }
        }
    }

    // Set migration flag
    batch.update(prefsRef, { equipmentMigrationV2: true });
    opCount++;
    await flushBatch();

    debugLog(`Equipment migration v2 complete: merged ${toDelete.length} duplicates, renamed ${nameMapping.size} references, catalog matches: ${JSON.stringify(catalogMatches)}`);
    return { migrated: true, merged: toDelete.length, renamed: nameMapping.size, catalogMatches };
}
```

Note: The `dryRun` flag is built into the main function (not a separate function). The analysis logic runs identically for both modes — the only difference is whether the write/delete/update batches execute.

### Integration: `js/core/app-initialization.js`

After auth and `loadUserSettings()`, run a dry-run first. If there are changes to make, show a confirmation UI. Only execute if the user approves.

```javascript
import { runEquipmentMigrationV2 } from './data/equipment-migration.js';

// In post-auth init, after loadUserSettings():
try {
    const prefsRef = doc(db, 'users', AppState.currentUser.uid, 'preferences', 'settings');
    const prefs = (await getDoc(prefsRef)).data();
    
    if (!prefs?.equipmentMigrationV2) {
        // Step 1: Dry run to preview
        const preview = await runEquipmentMigrationV2(AppState.currentUser.uid, { dryRun: true });
        
        if (preview.preview.duplicatesToMerge > 0 || preview.preview.renames.length > 0) {
            // Show confirmation UI — user reviews before committing
            showEquipmentMigrationPrompt(preview.preview);
        } else if (preview.preview.fieldsNormalized > 0) {
            // Only field normalization (non-destructive) — run silently
            await runEquipmentMigrationV2(AppState.currentUser.uid, { dryRun: false });
        } else {
            // Nothing to do — just set the flag
            await setDoc(prefsRef, { equipmentMigrationV2: true }, { merge: true });
        }
    }
} catch (err) {
    console.error('❌ Equipment migration check failed (non-fatal):', err);
}
```

### Migration Confirmation UI

When the dry-run detects duplicates or name changes, show a modal/banner:

```javascript
function tierLabel(tier) {
    if (tier === 1) return 'catalog match';
    if (tier === 2) return 'fuzzy match';
    if (tier === 3) return 'brand detected';
    return 'string parsed';
}

function showEquipmentMigrationPrompt(preview) {
    const modal = document.getElementById('equipment-migration-modal');
    const { catalogMatches: cm } = preview;
    const catalogTotal = cm.tier1 + cm.tier2 + cm.tier3;
    
    const summaryHTML = `
        <div class="migration-prompt">
            <div class="migration-prompt__icon"><i class="fas fa-wrench"></i></div>
            <h3>Equipment Cleanup Ready</h3>
            <ul class="migration-prompt__summary">
                ${catalogTotal > 0 ? `<li><strong>${catalogTotal}</strong> of ${preview.totalRecords} matched against equipment catalog</li>` : ''}
                ${preview.duplicatesToMerge > 0 ? `<li><strong>${preview.duplicatesToMerge}</strong> duplicate${preview.duplicatesToMerge !== 1 ? 's' : ''} will be merged</li>` : ''}
                ${preview.fieldsNormalized > 0 ? `<li><strong>${preview.fieldsNormalized}</strong> record${preview.fieldsNormalized !== 1 ? 's' : ''} will get brand/line filled in</li>` : ''}
                ${preview.workoutsAffected > 0 ? `<li><strong>${preview.workoutsAffected}</strong> workout${preview.workoutsAffected !== 1 ? 's' : ''} will be updated</li>` : ''}
                ${cm.unmatched > 0 ? `<li class="text-muted">${cm.unmatched} unrecognized (will use string parsing)</li>` : ''}
            </ul>
            ${preview.renames.length > 0 ? `
                <details class="migration-prompt__details">
                    <summary>Preview name changes (${preview.renames.length})</summary>
                    <div class="migration-prompt__rename-list">
                        ${preview.renames.map(r => {
                            // Find the record to show match tier
                            const rec = preview.records?.find(rec => rec.oldName === r.old);
                            const badge = rec ? `<span class="migration-tier-badge migration-tier-badge--${rec.matchTier}">${tierLabel(rec.matchTier)}</span>` : '';
                            return `
                            <div class="migration-rename-row">
                                <span class="migration-rename-old">${escapeHtml(r.old)}</span>
                                <i class="fas fa-arrow-right" style="font-size:10px; color:var(--text-muted)"></i>
                                <span class="migration-rename-new">${escapeHtml(r.new)}</span>
                                ${badge}
                            </div>`;
                        }).join('')}
                    </div>
                </details>
            ` : ''}
            <div class="migration-prompt__actions">
                <button class="btn-primary" onclick="executeEquipmentMigration()">Run Cleanup</button>
                <button class="btn-text" onclick="dismissEquipmentMigration()">Not Now</button>
            </div>
        </div>
    `;
    
    openModal(modal);
    modal.querySelector('.modal-content').innerHTML = summaryHTML;
}

async function executeEquipmentMigration() {
    closeModal(document.getElementById('equipment-migration-modal'));
    showNotification('Cleaning up equipment...', 'info', 2000);
    
    const result = await runEquipmentMigrationV2(AppState.currentUser.uid, { dryRun: false });
    const msg = result.catalogMatches
        ? `Done! Matched ${result.catalogMatches.tier1 + result.catalogMatches.tier2} from catalog, merged ${result.merged} duplicates`
        : `Done! Merged ${result.merged} duplicates`;
    showNotification(msg, 'success', 3000);
}

function dismissEquipmentMigration() {
    closeModal(document.getElementById('equipment-migration-modal'));
}
```

#### Tier badge CSS (add to migration modal styles):

```css
.migration-tier-badge {
    display: inline-block;
    font-size: var(--font-2xs);
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    margin-left: 6px;
    vertical-align: middle;
}
.migration-tier-badge--1 { background: var(--color-success-bg); color: var(--color-success); }
.migration-tier-badge--2 { background: var(--color-warning-bg); color: var(--color-warning); }
.migration-tier-badge--3 { background: var(--color-surface-2);  color: var(--text-muted); }
.migration-tier-badge--0 { background: var(--color-surface-2);  color: var(--text-muted); }
```

### Safety

- **Catalog-first matching** — 625 known machines across 18 brands are checked before falling back to string parsing, dramatically reducing "Unknown" and misidentified records
- **Dry-run by default** — nothing is written until the user taps "Run Cleanup"
- **Batch writes are atomic** — if a batch fails, nothing from that batch is committed
- **Non-destructive for simple cases** — if there are no duplicates and no renames (just field normalization like adding `line`), it runs silently without asking
- **Match tier visibility** — the preview shows a colored badge on each rename so the user can see which matches came from the catalog (green), fuzzy matching (yellow), or string parsing (gray) before approving
- **Dismiss = ask again later** — the flag isn't set until the migration actually runs, so dismissing just defers it to next session
- **No data deletion** — workout and template data is only *updated* (equipment names changed to canonical form), never deleted. The only Firestore deletes are the duplicate equipment *documents* whose data has been merged into the keeper.

---

## Phase 2: Equipment Library — Brand View (Primary)

**Mockup**: Screens 1, 3 (equipment-overhaul.html)
**File**: `js/core/ui/equipment-library-ui.js` (REWRITE)

### 2a. View Toggle

The library page has a segmented control at the top: **"By Brand"** (default) | **"By Body Part"**. Store the current view in a module-scoped variable `currentView = 'brand'`.

### 2b. Brand → Line → Machine Hierarchy Builder

Replace `buildEquipmentHierarchy()` with two functions:

```javascript
/**
 * Build Brand → Line → Equipment[] hierarchy for the brand view.
 */
function buildBrandHierarchy(equipment) {
    const brands = new Map(); // brandName → Map<lineName, equipment[]>

    for (const eq of equipment) {
        const brand = eq.brand || 'Unknown';
        if (!brands.has(brand)) brands.set(brand, new Map());
        const lines = brands.get(brand);

        const line = eq.line || '(No line)';
        if (!lines.has(line)) lines.set(line, []);
        lines.get(line).push(eq);
    }

    // Sort brands alphabetically, lines alphabetically within brand,
    // equipment alphabetically within line
    const sorted = new Map([...brands.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    for (const [brand, lines] of sorted) {
        const sortedLines = new Map([...lines.entries()].sort((a, b) => a[0].localeCompare(b[0])));
        for (const [line, equips] of sortedLines) {
            equips.sort((a, b) => (a.function || a.name).localeCompare(b.function || b.name));
        }
        sorted.set(brand, sortedLines);
    }

    return sorted;
}
```

### 2c. Rendering — Brand View

Each brand is a collapsible section header showing brand name + total machine count. Under each brand, product lines appear as sub-headers (indented, lighter text). Under each line, individual equipment rows show:

- Type icon + color (from `EQUIPMENT_TYPE_ICONS`)
- Machine function as the primary name (e.g., "Leg Extension")
- Type badge pill + location(s) + base weight as meta line

```javascript
function renderBrandView(filtered) {
    const hierarchy = buildBrandHierarchy(filtered);
    let html = '';

    for (const [brand, lines] of hierarchy) {
        const totalMachines = [...lines.values()].reduce((sum, arr) => sum + arr.length, 0);
        const brandId = brand.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

        // Brand header (collapsible)
        html += `
            <div class="brand-header" onclick="toggleBrandSection('${brandId}')">
                <div class="brand-header__name">
                    ${escapeHtml(brand)}
                    <span class="brand-header__count">${totalMachines} machine${totalMachines !== 1 ? 's' : ''}</span>
                </div>
                <i class="fas fa-chevron-down brand-header__chevron" id="brand-chevron-${brandId}"></i>
            </div>
            <div class="brand-section" id="brand-section-${brandId}">
        `;

        for (const [line, equips] of lines) {
            // Only show line sub-header if the brand has multiple lines or line isn't "(No line)"
            if (lines.size > 1 || line !== '(No line)') {
                html += `
                    <div class="line-header">
                        <div class="line-header__name">
                            <i class="fas fa-layer-group"></i>
                            ${escapeHtml(line === '(No line)' ? 'Other' : line)}
                        </div>
                        <div class="line-header__count">${equips.length} machine${equips.length !== 1 ? 's' : ''}</div>
                    </div>
                `;
            }

            for (const equip of equips) {
                const typeInfo = EQUIPMENT_TYPE_ICONS[equip.equipmentType] || EQUIPMENT_TYPE_ICONS.Other;
                const locationStr = (equip.locations || []).join(', ');
                const baseStr = equip.baseWeight ? `${equip.baseWeight} ${equip.baseWeightUnit || 'lbs'} base` : '';
                const metaParts = [baseStr, locationStr].filter(Boolean).join(' · ');

                html += `
                    <div class="equip-row" onclick="openEquipmentDetail('${escapeAttr(equip.id)}')">
                        <div class="equip-row__icon" style="background:${typeInfo.color}15; color:${typeInfo.color}">
                            <i class="fas ${typeInfo.icon}"></i>
                        </div>
                        <div class="equip-row__info">
                            <div class="equip-row__name">${escapeHtml(equip.function || equip.name)}</div>
                            <div class="equip-row__meta">
                                <span class="equip-row__type-pill" style="background:${typeInfo.color}15; color:${typeInfo.color}">${equip.equipmentType || 'Other'}</span>
                                ${metaParts ? `<span>${escapeHtml(metaParts)}</span>` : ''}
                            </div>
                        </div>
                        <i class="fas fa-chevron-right equip-row__chevron"></i>
                    </div>
                `;
            }
        }

        html += `</div>`; // close brand-section
    }

    return html;
}
```

### 2d. Body Part View

Keep the existing `buildEquipmentHierarchy()` logic (Body Part → Exercise → Equipment). It already works — just needs the view toggle to swap between them.

### 2e. Detail View Update

Update `openEquipmentDetail()` to show the new fields:
- Hero: Icon + function name + "Brand · Line" subtitle + type badge
- Grouped field rows (iOS Settings style): Brand, Line, Type, Base Weight, Last Used
- Brand and Line fields are editable (tap to edit inline)
- Rest of the detail view stays the same (locations, exercises, notes, delete)

---

## Phase 3: Add Equipment — Stepped Flow

**Mockup**: Screens 4, 6, 7 (equipment-overhaul.html)

### Flow: 3 steps with progress bar

**Step 1: Pick Brand** → **Step 2: Pick Line** → **Step 3: Name + Type**

Each step shows a progress indicator (3 segments) and breadcrumb chips for completed steps.

### Step 1: Pick Brand

- Show existing brands as a 2-column grid of tappable cards (brand name + machine count)
- "+ New Brand" card (dashed border, primary color)
- If "New Brand" tapped → show inline text input
- "Next: Pick Line →" button

### Step 2: Pick Line

- Breadcrumb chip showing selected brand
- Show existing lines for that brand as a 2-column grid
- "+ New Line" card
- "Skip — no product line" secondary button (sets `line` to null)
- "Next: Name Machine →" button

### Step 3: Name + Type

- Breadcrumb chips showing brand + line
- "Machine Function" text input with hint "e.g., Leg Press, Chest Fly"
- Type chip row (Machine, Barbell, Cable, Bench, Rack, Other)
- Live preview: "Panatta EvoFit — Seated Calf Raise"
- "Add Equipment" primary button
- "Add Another to [Line] Line" secondary button (stays on step 3 with same brand/line, clears function)

### File: `js/core/ui/equipment-library-ui.js`

Replace `showAddEquipmentFlow()` with a state machine:

```javascript
const addFlowState = {
    step: 1,        // 1, 2, or 3
    brand: null,
    line: null,
    func: null,
    type: 'Machine',
};

export function showAddEquipmentFlow() {
    addFlowState.step = 1;
    addFlowState.brand = null;
    addFlowState.line = null;
    addFlowState.func = null;
    addFlowState.type = 'Machine';
    renderAddStep();
}

function renderAddStep() {
    const container = document.getElementById('equipment-library-content');
    if (!container) return;

    // Update page header
    const section = document.getElementById('equipment-library-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="${addFlowState.step === 1 ? 'backToEquipmentList()' : 'addFlowBack()'}" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">Add Equipment</div>
            </div>
        `;
    }

    // Progress bar
    const progressHTML = `
        <div class="add-progress">
            <div class="add-progress__step ${addFlowState.step >= 1 ? (addFlowState.step > 1 ? 'done' : 'active') : ''}"></div>
            <div class="add-progress__step ${addFlowState.step >= 2 ? (addFlowState.step > 2 ? 'done' : 'active') : ''}"></div>
            <div class="add-progress__step ${addFlowState.step >= 3 ? 'active' : ''}"></div>
        </div>
    `;

    switch (addFlowState.step) {
        case 1: container.innerHTML = progressHTML + renderBrandPickStep(); break;
        case 2: container.innerHTML = progressHTML + renderLinePickStep(); break;
        case 3: container.innerHTML = progressHTML + renderNameStep(); break;
    }
}

export function addFlowBack() {
    if (addFlowState.step > 1) {
        addFlowState.step--;
        renderAddStep();
    }
}

export function addFlowSelectBrand(brand) {
    addFlowState.brand = brand;
    addFlowState.step = 2;
    renderAddStep();
}

export function addFlowSelectLine(line) {
    addFlowState.line = line;
    addFlowState.step = 3;
    renderAddStep();
}

export function addFlowSkipLine() {
    addFlowState.line = null;
    addFlowState.step = 3;
    renderAddStep();
}
```

**Step 1 render** — `renderBrandPickStep()` builds the grid from existing brands:
```javascript
function renderBrandPickStep() {
    const brandCounts = new Map();
    for (const eq of allEquipment) {
        const b = eq.brand || 'Unknown';
        brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
    }

    const brands = [...brandCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    return `<div class="add-step">
        <div class="add-step__label">Select Brand</div>
        <div class="add-step__hint">Pick a brand you already have, or add a new one</div>
        <div class="add-grid">
            ${brands.map(([name, count]) => `
                <div class="add-option" onclick="addFlowSelectBrand('${escapeAttr(name)}')">
                    <div style="font-size:18px; color:var(--text-secondary)"><i class="fas fa-industry"></i></div>
                    <div class="add-option__name">${escapeHtml(name)}</div>
                    <div class="add-option__count">${count} machine${count !== 1 ? 's' : ''}</div>
                </div>
            `).join('')}
            <div class="add-option add-option--new" onclick="showNewBrandInput()">
                <div style="font-size:18px; color:var(--primary)"><i class="fas fa-plus-circle"></i></div>
                <div class="add-option__name">New Brand</div>
            </div>
        </div>
        <div id="new-brand-input" class="hidden add-input-row" style="margin-top:12px">
            <label>Brand Name</label>
            <input type="text" id="add-brand-name" placeholder="e.g., Life Fitness, Cybex"
                   onkeydown="if(event.key==='Enter') addFlowSelectBrand(this.value.trim())">
            <button class="add-btn add-btn--primary" style="margin-top:8px"
                    onclick="addFlowSelectBrand(document.getElementById('add-brand-name').value.trim())">
                Next: Pick Line →
            </button>
        </div>
    </div>`;
}
```

**Step 2** and **Step 3** follow the same pattern per the mockup.

---

## Phase 4: Equipment Picker — Smart Suggestions

**Mockup**: Screen 5 (equipment-overhaul.html)
**File**: `js/core/ui/equipment-picker.js` (REWRITE)

### Picker layout (bottom sheet)

```
┌──────────────────────────────────┐
│         ═══ (drag handle)        │
│      Select Equipment            │
│      for Bench Press             │
│                                  │
│  🔍 Search equipment...         │
│                                  │
│  ── USED BEFORE ──               │
│  ● Panatta Freeweight Flat  ✓   │
│  ○ Rogue Ohio Power Bar         │
│                                  │
│  ── AT FIT4LESS OSHAWA ──       │
│  ○ Hammer Strength Incline      │
│  ○ Panatta Freeweight Incline   │
│                                  │
│  ── OR ADD NEW ──                │
│  [ Equipment name...    ] [Add]  │
│                                  │
│  [ ══ Confirm ══ ] [ None ]      │
└──────────────────────────────────┘
```

### Section logic

1. **"Used before"** — Equipment where `exerciseTypes` includes this exercise name. Sorted by `lastUsed` desc. Pre-select the last-used one, or the one matching `currentEquipment`.

2. **"At [gym name]"** — Equipment at the current GPS-detected location that is NOT already in "Used before". Only shown when `sessionLocation` is set.

3. **"All equipment"** — Everything else not already shown. Only visible when user scrolls or if sections 1+2 are empty.

4. **"Or add new"** — Inline text input + "Add" button. On submit, calls `getOrCreateEquipment()` with exercise pre-linked. For a quick add during a workout, the user just types a name — full brand/line/function can be edited later in the library.

### Key changes

```javascript
export async function populateEquipmentPicker({
    exerciseName,
    currentEquipment = null,
    currentLocation = null,
    sessionLocation = null,
}) {
    const workoutManager = new FirebaseWorkoutManager(AppState);
    const allEquipment = await workoutManager.getUserEquipment();

    // Partition into sections
    const usedBefore = allEquipment
        .filter(eq => (eq.exerciseTypes || []).includes(exerciseName))
        .sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || ''));

    const usedIds = new Set(usedBefore.map(e => e.id));
    const activeLocation = sessionLocation || currentLocation;

    const atThisGym = activeLocation
        ? allEquipment.filter(eq => !usedIds.has(eq.id) && (eq.locations || []).includes(activeLocation))
        : [];

    const atGymIds = new Set(atThisGym.map(e => e.id));
    const allOther = allEquipment.filter(eq => !usedIds.has(eq.id) && !atGymIds.has(eq.id));

    // Pre-selection: current equipment, or last-used, or nothing
    let preSelected = null;
    if (currentEquipment) {
        preSelected = allEquipment.find(eq => eq.name === currentEquipment)?.id;
    }
    if (!preSelected && usedBefore.length > 0) {
        preSelected = usedBefore[0].id;
    }

    // Render all sections
    renderPickerSections({
        exerciseName,
        usedBefore,
        atThisGym,
        allOther,
        activeLocation,
        preSelected,
    });
}
```

### Footer buttons

- **Confirm** — applies the selected equipment to the exercise
- **None** — clears equipment from the exercise (calls `applyEquipmentChange(null, null)`)

---

## Phase 5: `getOrCreateEquipment()` Hardening

**File**: `js/core/data/firebase-workout-manager.js`

### Fuzzy matching to prevent future duplicates

```javascript
function fuzzyEquipmentMatch(existing, newName) {
    const a = normalizeName(existing);
    const b = normalizeName(newName);
    if (a === b) return true;
    // Strip separators and compare
    const strip = s => s.replace(/[—–\-_·]/g, ' ').replace(/\s+/g, ' ').trim();
    if (strip(a) === strip(b)) return true;
    return false;
}

function normalizeName(name) {
    return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}
```

Update `getOrCreateEquipment()`:
```javascript
// After exact match fails, try fuzzy
if (!existing) {
    existing = allEquipment.find(eq => fuzzyEquipmentMatch(eq.name, equipmentName));
}
```

### Auto-fill brand/line/function on new equipment

When creating equipment during a workout (quick add from picker), the user only types a name. Try to parse brand/line/function from it:

```javascript
function parseEquipmentName(name) {
    // Check if the name starts with a known brand
    const brands = [...new Set(allEquipment.map(e => e.brand).filter(Boolean))];
    for (const brand of brands) {
        if (name.toLowerCase().startsWith(brand.toLowerCase())) {
            const rest = name.slice(brand.length).trim().replace(/^[—–\-·:]\s*/, '');
            return { brand, function: rest || name };
        }
    }
    return { brand: null, function: name };
}
```

---

## Phase 6: Scan History

**File**: `js/core/ui/equipment-library-ui.js`

Show a banner at the top of the equipment library when there are equipment name strings in workout history that don't match any equipment document. User can tap "Review" to see them and confirm/add each one.

```javascript
export async function checkForUnlinkedEquipment() {
    const manager = getManager();
    const allEquip = await manager.getUserEquipment();
    const knownNames = new Set(allEquip.map(e => normalizeName(e.name)));

    const workouts = await manager.getWorkoutHistory(500);
    const found = new Map(); // name → { exercises, locations, count }

    for (const w of workouts) {
        for (const key of Object.keys(w.exercises || {})) {
            const ex = w.exercises[key];
            if (!ex.equipment) continue;
            if (knownNames.has(normalizeName(ex.equipment))) continue;

            if (!found.has(ex.equipment)) {
                found.set(ex.equipment, { exercises: new Set(), locations: new Set(), count: 0 });
            }
            const entry = found.get(ex.equipment);
            entry.exercises.add(key);
            if (w.location) entry.locations.add(w.location);
            entry.count++;
        }
    }

    return found; // Caller renders the banner if found.size > 0
}
```

Banner HTML (rendered at top of library list when `found.size > 0`):
```html
<div class="scan-banner">
    <i class="fas fa-history"></i>
    <div class="scan-banner__text">
        <div class="scan-banner__title">${found.size} machines found in history</div>
        <div class="scan-banner__sub">Not yet in your library</div>
    </div>
    <button class="scan-banner__btn" onclick="reviewDiscoveredEquipment()">Review</button>
</div>
```

---

## Phase 7: CSS Extraction & Cleanup

### 7a. Create `styles/pages/equipment-library.css` (NEW)

Move ALL `.equip-*`, `.brand-*`, `.line-*`, `.add-*` (equipment-specific), `.scan-banner`, `.detail-*` (equipment detail) classes from `styles/components/modals.css` into the new file.

### 7b. Create `styles/components/equipment-picker.css` (NEW)

All `.picker-*`, `.eq-picker__*` classes for the workout picker bottom sheet.

### 7c. Update `styles/index.css`

Add both new imports:
```css
@import 'pages/equipment-library.css';
@import 'components/equipment-picker.css';
```

### 7d. Clean up `modals.css`

Remove all `.equip-*` rules (lines ~675–1000) that were moved. Leave a comment:
```css
/* Equipment library styles moved to pages/equipment-library.css */
```

---

## Implementation Order

1. **Phase 1** (migration) — Must be first. Normalizes data, deduplicates, adds `line` field.
2. **Phase 5** (getOrCreateEquipment hardening) — Prevents new duplicates immediately.
3. **Phase 2** (library brand view + toggle) — The main UI rewrite.
4. **Phase 3** (stepped add flow) — Brand → Line → Machine creation.
5. **Phase 4** (picker redesign) — Smart suggestions during workouts.
6. **Phase 7** (CSS cleanup) — Can be done alongside phases 2-4.
7. **Phase 6** (scan history) — Nice-to-have, ship after core is stable.

---

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `js/core/data/equipment-catalog.js` | EXISTS | Pre-populated brand/line/machine reference (625 machines, 18 brands) |
| `js/core/data/equipment-migration.js` | NEW | One-time v2 migration — imports catalog for intelligent matching |
| `js/core/app-initialization.js` | EDIT | Call migration after auth |
| `js/core/ui/equipment-library-ui.js` | REWRITE | Brand view, body part view, toggle, detail, add flow |
| `js/core/ui/equipment-picker.js` | REWRITE | Smart suggestions picker |
| `js/core/data/firebase-workout-manager.js` | EDIT | Fuzzy matching, `line` field support in saves |
| `js/core/workout/active-workout-ui.js` | EDIT | Wire new picker |
| `styles/pages/equipment-library.css` | NEW | Extract + new brand/line/row styles |
| `styles/components/equipment-picker.css` | NEW | Picker bottom sheet styles |
| `styles/components/modals.css` | EDIT | Remove migrated equipment styles |
| `styles/index.css` | EDIT | Add new CSS imports |

---

## Verification Checklist

### Migration
- [ ] Migration runs once, sets `equipmentMigrationV2` flag, doesn't run again
- [ ] Catalog index built from `equipment-catalog.js` (625 machines, 18 brands)
- [ ] Tier 1 (exact catalog match): brand + line + function + equipmentType all filled from catalog
- [ ] Tier 2 (fuzzy match): partial name matches resolved against catalog (>= 50% word overlap)
- [ ] Tier 3 (brand detection): brand filled from catalog, function extracted via string parsing
- [ ] Unmatched records: `brand` filled with "Unknown", `function` extracted from name
- [ ] `model` field copied to `line` on all equipment records
- [ ] Legacy `location` merged into `locations[]` and cleared
- [ ] Legacy `video` merged into `exerciseVideos` and cleared
- [ ] `name` regenerated from brand + line + function
- [ ] Dry-run preview shows match tier badges (green=catalog, yellow=fuzzy, gray=parsed)
- [ ] Duplicate equipment records merged (check Firebase console)
- [ ] Workout document equipment strings updated to match new canonical names
- [ ] Template document equipment strings updated

### Library
- [ ] View toggle switches between Brand and Body Part views
- [ ] Brand view groups by Brand → Line → Machine correctly
- [ ] Brands with a single line hide the "(No line)" sub-header
- [ ] Equipment rows show type badge, locations, base weight
- [ ] Search filters across name, brand, line, type, exerciseTypes
- [ ] Location pills filter equipment to selected gym
- [ ] Detail view shows hero with brand · line subtitle
- [ ] Detail fields are editable (brand, line, type, base weight)
- [ ] Locations, exercises, notes, delete all still work

### Add Flow
- [ ] Step 1 shows existing brands as grid + "New Brand"
- [ ] Step 2 shows lines for selected brand + "New Line" + "Skip"
- [ ] Step 3 shows function input + type chips + live preview
- [ ] "Add Another to [Line]" stays on step 3 with same brand/line
- [ ] Breadcrumb chips show completed steps
- [ ] Back button goes to previous step
- [ ] New equipment saved with all fields (brand, line, function, type)

### Picker
- [ ] "Used before" section shows equipment tagged with this exercise
- [ ] "At this gym" section shows location-filtered equipment
- [ ] "All equipment" section shows remaining equipment
- [ ] Last-used equipment pre-selected
- [ ] Search filters across all sections
- [ ] "Add new" inline form creates equipment and selects it
- [ ] "Confirm" applies selection, "None" clears equipment
- [ ] Picker triggers from active workout equipment line "Change" tap

### Scan History
- [ ] Banner shows when unrecognized equipment found in workout history
- [ ] Review flow lets user confirm/add each discovered equipment
