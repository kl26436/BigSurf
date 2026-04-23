# Equipment Overhaul — Remaining Implementation Spec

**Date:** 2026-04-21  
**Context:** V3 migration logic, catalog (731 machines), and alias/matching code are complete. This spec covers the remaining gaps: renaming `function` → `machine`, the catalog-powered machine picker, delete from active workout, and missing exported functions.

---

## Change 1: Rename `function` → `machine` Across the Data Model

### Why
The field `function` is misleading — it sounds like what the machine does, not what the machine *is*. The catalog already stores machine names like "Vertical Chest Press", "ISO Flat Press", "Lever Row". These are the identity of the equipment piece. The hierarchy is **Brand > Line > Machine**, and `machine` should be the field name.

### Firestore Equipment Doc Schema (after rename)

```javascript
{
  id: "equipment_1234...",
  name: "Arsenal Strength Reloaded — Vertical Chest Press",  // generated display name
  brand: "Arsenal Strength",
  line: "Reloaded",
  machine: "Vertical Chest Press",       // ← was `function`
  equipmentType: "Plate-Loaded",
  baseWeight: 0,
  baseWeightUnit: "lbs",
  locations: ["Downtown Gym"],
  exerciseTypes: ["Chest Press"],         // exercises assigned to this machine
  exerciseVideos: { "Chest Press": "https://..." },
  notes: "",
  createdAt: "...",
  lastUsed: "..."
}
```

### Files to Update

**`firebase-workout-manager.js`** (data layer)
- `saveEquipment()` (~line 1029): rename `function: equipmentData.function` → `machine: equipmentData.machine`
- `getOrCreateEquipment()`: same rename
- Read paths: anywhere `.function` is accessed on equipment docs

**`equipment-migration.js`** (migration)
- All references to `eq.function` → `eq.machine`
- `normalizeEquipmentDoc()`: write `machine` field instead of `function`
- `matchAgainstCatalog()`: the catalog `machine.name` maps to the `machine` field
- `generateEquipmentName(brand, line, machine)`: rename the third param from `func` → `machine` (behavior unchanged)
- The migration should also handle existing Firestore docs that have `function` set — copy `function` → `machine`, delete `function`

**`equipment-library-ui.js`** (UI)
- Equipment detail view (~line 790): `equipment.function` → `equipment.machine`
- Hero display (~line 804): `heroFunction` → `heroMachine`
- Field label (~line 842): change "Function" label to "Machine"
- Field input: `saveEquipmentField(..., 'function', ...)` → `saveEquipmentField(..., 'machine', ...)`
- Datalist: `getDetailFunctionSuggestions` → `getDetailMachineSuggestions`
- Brand view list (~line 525): `equip.function || equip.name` → `equip.machine || equip.name`

**`active-workout-ui.js`** (active workout)
- Any reference to `.function` on equipment objects → `.machine`

**`equipment-planner.js`** (planner feature)
- Check for `.function` references → `.machine`

**`exercise-ui.js`** / `exercise-manager-ui.js`
- Check for `.function` references → `.machine`

**Search pattern:** `grep -rn '\.function' js/core/ --include="*.js"` — review every hit on equipment objects. Many `.function` references will be on non-equipment objects (normal JS), so check context.

### Migration Backward Compatibility
The V3 migration should handle the rename:
- If a doc has `function` but no `machine`, copy `function` → `machine`
- Write `machine` to the doc, set `function` to `null` (or delete it)
- This way old docs get migrated and new docs only use `machine`

---

## Change 2: Catalog-Powered Machine Picker

### Problem
When editing equipment (from the library detail view, active workout, or anywhere equipment appears), the Brand, Line, and Machine fields use `<datalist>` suggestions. But the suggestion functions (`getDetailBrandSuggestions`, `getDetailLineSuggestions`, `getDetailFunctionSuggestions`) are **called but never defined** in `equipment-library-ui.js`. The same cascading picker pattern is needed for the Add Equipment flow.

### How It Works

The picker is a cascading datalist/autocomplete driven by `EQUIPMENT_CATALOG`:

1. **Brand field** — suggestions from all catalog brands + user's existing brands from their equipment docs  
2. **Line field** — filtered to lines within the selected brand; re-renders when brand changes (already wired: `onchange` calls `openEquipmentDetail()` to re-render)  
3. **Machine field** — filtered to machines within the selected brand + line; this is the new name for the old "Function" field

When the user picks a machine from the catalog, the `equipmentType` should auto-populate from the catalog's `line.type` (or `machine.type` override if present). The `bodyPart` hint from the catalog can pre-suggest an exercise for `exerciseTypes` but doesn't auto-assign.

### Implementation

#### Suggestion Functions (in `equipment-library-ui.js`)

These need to be defined. They read from `EQUIPMENT_CATALOG` (import it) and merge with the user's existing equipment data:

```javascript
import { EQUIPMENT_CATALOG } from '../data/equipment-catalog.js';
```

**`getDetailBrandSuggestions()`**
- Collect all `brand` values from `EQUIPMENT_CATALOG`
- Collect all unique `brand` values from `allEquipment` (user's saved equipment)
- Merge, dedupe, sort alphabetically
- Return string array for datalist

**`getDetailLineSuggestions(brand)`**
- If brand matches a catalog entry, collect its `lines[].name` values
- Filter out "General" from display (or show it as empty/skip)
- Also collect unique `line` values from user's equipment where `brand` matches
- Merge, dedupe, sort
- Return string array

**`getDetailMachineSuggestions(brand, line)`** (was `getDetailFunctionSuggestions`)
- If brand + line match a catalog entry, return that line's `machines[].name` values
- If only brand matches, return ALL machines across all lines for that brand
- Also collect unique `machine` values from user's equipment where brand+line match
- Merge, dedupe, sort
- Return string array

#### Auto-Populate Type on Machine Select

When the user changes the Machine field and the selected value matches a catalog machine:
- Look up the machine in the catalog
- If found, auto-set `equipmentType` to the catalog's `line.type` (or `machine.type` override)
- Re-render the detail view to reflect the updated type chip

This should be wired in the `onchange` handler for the Machine field — after saving the field, also check catalog and update type if applicable.

#### Where the Picker Appears

Per Kevin's request: **everywhere equipment appears**. The same cascading Brand → Line → Machine datalist pattern should work in:
- Equipment Library detail view (already has the field inputs, just needs the suggestion functions)
- Active workout quick-add flow (`awQuickAddEquipment` in `active-workout-ui.js`)
- Active workout equipment edit (when changing equipment on an exercise)
- Exercise editor (in `exercise-manager-ui.js`)
- Template editor (in `workout-management-ui.js`)

The suggestion functions are pure lookups against the catalog + cached equipment, so they can be exported from `equipment-library-ui.js` and imported anywhere needed, or moved to a shared utility.

---

## Change 3: Add Equipment Stepped Flow

### Problem
`main.js` imports the following functions from `equipment-library-ui.js`, but **none of them are defined**:

```
showAddEquipmentFlow, confirmAddEquipment,
addFlowBack, addFlowSelectBrand, addFlowShowNewBrand,
addFlowSelectLine, addFlowShowNewLine, addFlowSkipLine,
addFlowSetFunction, addFlowSetType
```

### Rename
`addFlowSetFunction` → `addFlowSetMachine` (in both `main.js` import and the implementation)

### Intended Behavior

A stepped wizard using `EQUIPMENT_CATALOG` to guide adding new equipment:

1. **Select Brand** — scrollable list of all catalog brands + "Add custom brand" option at the bottom
2. **Select Line** — lines for chosen brand; auto-skip if brand has only a "General" line (go straight to machine); "Add custom line" + "Skip (no line)" options
3. **Select Machine** — list of machines from the matched brand+line in the catalog; free-text input for custom machine name not in catalog
4. **Set Type** — auto-populated from catalog if machine matched; otherwise chip picker (Plate-Loaded, Selectorized, Cable, Barbell, Dumbbell, Bench, Rack, Cardio, Bodyweight, Other)
5. **Save** — generate display name via `generateEquipmentName(brand, line, machine)`, save to Firestore, add to `AppState._cachedEquipment`

Each step should be a panel/screen within the equipment library section, with a back button to go to the previous step. The `addFlowBack` function navigates backward through the steps.

---

## Change 4: Delete Equipment from Active Workout Picker

### Current State
Delete button HTML **already exists** in `active-workout-ui.js` in both `renderRow` functions (~line 1129 and ~line 1215). Both call `awDeleteEquipment(equipId, exerciseIdx)` which does not exist.

### Implementation

#### `awDeleteEquipment(equipId, exerciseIdx)` in `active-workout-ui.js`

Add as exported async function after `awSaveNewEquipment`, before the "ADD EXERCISE SHEET" comment.

1. Look up equipment name from `AppState._cachedEquipment` by `equipId`
2. `confirm(`Delete "${eqName}"? This removes it from your equipment library.`)`
3. If cancelled, return
4. Dynamic import `FirebaseWorkoutManager`, call `mgr.deleteEquipment(equipId)` (exists at `firebase-workout-manager.js:1129`)
5. Filter out from `AppState._cachedEquipment`
6. If current exercise's equipment matches deleted name → clear it on `AppState.savedData.exercises` and `AppState.currentWorkout.exercises`
7. `showNotification(`${eqName} deleted`, 'success')`
8. Re-render picker via `awOpenEquipmentSheet(exerciseIdx)`
9. Wrap in try/catch with error notification

#### CSS `.js-row__delete` in `styles/pages/active-workout-v2.css`

Add before `.js-row__checkbox`:

```css
.js-row__delete {
    flex-shrink: 0;
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    border: none; background: none;
    color: var(--text-muted);
    font-size: var(--font-sm);
    border-radius: var(--radius-xs);
    cursor: pointer;
    transition: color var(--anim-fast), background var(--anim-fast);
    -webkit-tap-highlight-color: transparent;
}
.js-row__delete:active {
    color: var(--danger, #ef4444);
    background: var(--danger-bg, rgba(239,68,68,0.1));
}
```

#### Wire to window

- `workout-core.js`: add `awDeleteEquipment` to re-export from `active-workout-ui.js`
- `main.js`: add import + `window.awDeleteEquipment = awDeleteEquipment`

---

## Change 5: Missing Exported Functions in `equipment-library-ui.js`

These are imported in `main.js` (lines 14-26) but do not exist in `equipment-library-ui.js`. They will cause runtime errors when triggered.

### Functions that need to be implemented

**Detail view editing** (used on the equipment detail page):
- `backToEquipmentList()` — navigate from detail back to equipment list
- `saveEquipmentField(equipmentId, fieldName, value)` — generic field saver, calls `workoutManager.updateEquipment()`
- `saveEquipmentNotes(equipmentId, value)` — save notes field
- `saveEquipmentBaseWeight(equipmentId, value)` — save base weight
- `setEquipmentBaseWeightUnit(equipmentId, unit, buttonEl)` — toggle lb/kg
- `removeEquipmentLocation(equipmentId, locationName)` — remove a location chip
- `deleteEquipmentFromLibrary(equipmentId)` — delete with confirm, refresh list

**Exercise assignment** (managing which exercises use a piece of equipment):
- `assignExerciseToEquipment(equipmentId)` — open exercise picker to assign
- `filterAssignList(query)` — filter the assign picker
- `confirmAssignExercise(equipmentId, exerciseName)` — add exercise to `exerciseTypes[]`
- `unassignExercise(equipmentId, exerciseName)` — remove exercise from `exerciseTypes[]`
- `saveEquipmentExerciseVideoFromLib(equipmentId, exerciseName, url)` — save per-exercise video URL

**Suggestion functions** (catalog-powered, see Change 2):
- `getDetailBrandSuggestions()` — brand datalist options
- `getDetailLineSuggestions(brand)` — line datalist options
- `getDetailMachineSuggestions(brand, line)` — machine datalist options (was Function)

---

## Change 6: V3 Migration — Field Rename Addition

The existing V3 migration needs one addition for the `function` → `machine` rename:

In `normalizeEquipmentDoc()`:
- If the source doc has `function` and no `machine`, copy `function` → `machine`
- Always write the `machine` field in the normalized output
- Set `function: null` (or use `deleteField()`) in the batch write to clean up old field
- Update `generateEquipmentName()` param name from `func` → `machine` (cosmetic)

The migration already extracts the function from the equipment name and stores it — just need to target `machine` as the field name instead of `function`.

### Testing
- `debug-equipment-migration.js` in BigSurf-B root: `window.debugEquipmentMigration()`
- `equipment-migration-preview.html` in BigSurf-B root: visual 45-record preview
- Sign in to trigger auto dry-run via `checkEquipmentMigrationV3()` in `app-initialization.js`

---

## File Reference

| File | Changes Needed |
|------|---------------|
| `js/core/data/firebase-workout-manager.js` | Rename `function` → `machine` in `saveEquipment()`, `getOrCreateEquipment()` |
| `js/core/data/equipment-migration.js` | Rename `function` → `machine` throughout; add `function` → `machine` field copy for existing docs |
| `js/core/data/equipment-catalog.js` | No changes — `machine.name` is already correct |
| `js/core/ui/equipment-library-ui.js` | Rename field refs; implement ~18 missing exported functions; implement suggestion functions; implement Add Equipment flow |
| `js/core/workout/active-workout-ui.js` | Implement `awDeleteEquipment()`; rename `.function` → `.machine` refs |
| `js/core/workout/workout-core.js` | Add `awDeleteEquipment` to re-export block |
| `js/main.js` | Add `awDeleteEquipment` import + window; rename `addFlowSetFunction` → `addFlowSetMachine` |
| `styles/pages/active-workout-v2.css` | Add `.js-row__delete` CSS |
| `js/core/app-initialization.js` | No changes needed (V3 hooks already complete) |
| `js/core/ui/exercise-manager-ui.js` | Rename `.function` → `.machine` refs on equipment objects |
| `js/core/features/equipment-planner.js` | Rename `.function` → `.machine` refs |
| `js/core/workout/exercise-ui.js` | Check for `.function` refs → `.machine` |

### Implementation Order

0. **Use Equipment Editor** (`equipment-editor.html`) — review & map all records first
1. **Rename `function` → `machine`** (Change 1) — foundational, affects everything else
2. **Suggestion functions** (Change 2) — needed by both the detail view and add flow
3. **Missing exported functions** (Change 5) — unblocks the detail view from working
4. **Add Equipment flow** (Change 3) — builds on suggestion functions
5. **Delete from active workout** (Change 4) — independent, can be done anytime
6. **Migration field rename** (Change 6) — should be done alongside or after Change 1

---

## Tool: Equipment Editor (`equipment-editor.html`)

Standalone HTML page in the project root. Open locally in a browser (must be served, not file://, for ES module imports to work).

### How to use
1. Open `equipment-editor.html` (serve via `npx serve .` or similar from BigSurf-B root)
2. Sign in with Google — reads live Firebase data (equipment, workouts, templates)
3. Review each record: see catalog match tier, brand/line/machine fields, workout refs
4. Edit fields inline, map to catalog via Brand > Line > Machine picker, merge duplicates, delete junk
5. Export → generates a JSON migration script with updates, deletes, and a nameMapping for rewriting workout/template history refs
6. Apply the exported JSON via a console script or integrate into the V3 migration runner

### Features
- **Catalog Picker**: drill-down Brand → Line → Machine or search across all 731 machines
- **Inline editing**: brand, line, machine, type fields editable per record
- **Name preview**: shows what the generated name will be after edits
- **Merge**: checkbox-select multiple records, merge into the one with most data
- **Delete**: mark records for deletion, restore if needed
- **Workout refs**: see every workout and template that references each equipment name
- **Orphan detection**: summary shows equipment names in workouts with no matching equipment doc
- **Export**: JSON with `updates[]`, `deletes[]`, and `nameMapping{}` for history rewriting
- **No writes**: page is read-only against Firebase — all changes are local until exported
