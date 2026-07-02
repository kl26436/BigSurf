# Multi-gym / location / equipment assessment

*2026-07-02 — code-level audit of the app's differentiating feature area, prioritized for "make it solid, then make it the reason people pay."*

Scope: location-service.js, location-ui.js, equipment-planner.js, equipment-library-ui.js, equipment-picker.js, firebase-workout-manager.js, active-workout-ui.js, workout-management-ui.js.

Verdict: the architecture is sound (GPS nearest-match handles overlapping gyms, orphan reconciliation is sophisticated, equipment-planner logic is clean and tested). The problems are data-consistency holes that will corrupt user trust silently, plus a blank-slate first-run experience — the exact moment a new user decides whether the multi-gym feature is magic or homework.

---

## Tier 0 — The two-universe split (the root cause of "equipment feels weird")

Quick-add and the rest of the app disagree about what "equipment" is:

- **Quick-add from the catalog** (`commitQuickAdd` → `addLocationEquipment`, firebase-workout-manager.js:1474) writes `{catalogRef, nickname, notes}` entries onto the **location doc's `equipment[]` array only**. No equipment doc is created.
- **Everything else** — the mid-workout equipment sheet (active-workout-ui.js:1622), the equipment-picker modal (equipment-picker.js:48), and equipment-planner — reads **only `users/{uid}/equipment` docs** via `getUserEquipment()` (:1060), which never merges the location arrays.

**Net effect — the exact travel scenario, broken end-to-end:** land at a new gym, quick-add 8 machines from the catalog (a nice flow!), start a workout, open the equipment picker for bench press → none of the 8 machines are there. They only exist inside the Equipment Library's gym-detail view. The feature *looks* like it worked and then silently doesn't.

Compounding issues in the same area:

- **The catalog has no machine→exercise mapping.** Catalog entries carry only `bodyPart` (equipment-catalog.js — 1,366 bodyPart fields, zero exercise fields). So even after unifying storage, a quick-added "Iso-Lateral Bench Press" doesn't know it supports Bench Press: it won't appear under "Used before" in the picker and contributes nothing to planner compatibility. Custom quick-adds have the same hole (`commitQuickAddCustom` saves with no `exerciseTypes`).
- **Mid-workout add is the worst add experience at the best moment.** Standing in front of a machine mid-set is the most natural time to add equipment, and that flow is a bare name+location text form (workout-management-ui.js:500) with no catalog search, while the nice searchable catalog sheet exists only in the Equipment Library.
- **Two parallel picker UIs** for the same job: the `equipment-picker.js` modal (used by exercise-ui / template editor) and the `aw-sheet` picker in active-workout-ui. Different look, different interaction, same purpose.
- **No search in the workout pickers** — section headers only; with 40+ equipment items "All equipment" is a blind scroll.

**Fix direction (order matters):**

1. **One source of truth: equipment docs.** ✅ *Shipped 2026-07-02 (pending deploy).* Quick-add and the catalog toggle now promote synchronously via `promoteCatalogToEquipment` (was lazy/racy — only fired on gym-view render), removals are mirrored both ways (`untagGymFromPromotedDocs` / `syncCatalogRefOnLocation`), and every write path ends in `refreshEquipmentCaches()` so the workout picker's `AppState._cachedEquipment` is never stale. The lazy `migrateLocationCatalogRefs` pass stays as the safety net for pre-existing location-array data. Long-term end state is still to drop `location.equipment[]` and derive gym membership from docs — do that when the shared picker work touches these views anyway.
2. **Give catalog adds an exercise mapping.** ✅ *Shipped 2026-07-02.* `promoteCatalogToEquipment` and custom quick-add now infer `exerciseTypes` from the machine name via the pure matcher in `machine-exercise-matcher.js` (conservative: contiguous-phrase match with light stemming; wrong links pollute the picker, missed links self-heal via `awSelectEquipment` auto-associate). Still open long-term: populate `exercises: []` on catalog entries, and a "What do you use this for?" suggestion tap for unmatched machines.
3. **One shared picker sheet with catalog access.** ✅ *Shipped 2026-07-02.* Both workout and template flows already shared the searchable aw-sheet picker; "Add from catalog" now opens the quick-add sheet inline, parameterized with the session gym (`openQuickAddSheet(gym, {onDone})`), and a single added machine is auto-selected for the exercise — created, gym-tagged, exercise-linked, selected. The legacy `equipment-picker.js` modal survives only behind the old exercise-library add flow; retire it when that flow is next touched.

## Tier 1 — Data integrity (fix before anything else)

These silently corrupt the equipment↔gym mapping. A user who hits one concludes "the gym feature is buggy" without knowing why.

### 1.1 Location rename doesn't cascade
✅ *Shipped 2026-07-02.* `updateLocation()` now cascades name changes via `renameLocationOnEquipment` — batch-updates every equipment doc's `locations[]` (case-insensitive match), cascade-first so a failure leaves both sides consistent, and nulls `AppState._cachedEquipment`. Migrating to location IDs instead of names remains the long-term direction.

### 1.2 Dual location formats (legacy `location` string vs `locations[]` array)
✅ *Shipped 2026-07-02.* `getUserEquipment()` normalizes the legacy field in-memory on every read and fires a one-time background write sweep (`location: deleteField()`). All read-time dual-format branches removed (equipment-picker, equipment-planner, exercise-manager-ui, manual-workout, location-ui, equipment-library-ui, workout-management-ui). Write-time folding in `saveEquipment`/`addLocationToEquipment` kept as input normalization.

### 1.3 No duplicate-location guard
✅ *Shipped 2026-07-02.* Both add flows already had case-insensitive name checks; they now also run `findNearbyLocation` against saved-gym radii and offer "Use \<gym\> instead?" via confirmSheet before creating a same-spot duplicate. (Auto-save paths on workout start already matched by radius before saving.)

### 1.4 Stale `equipmentCatalog` refs on location docs
✅ *Shipped 2026-07-02.* `deleteEquipmentFromLibrary()` now strips the deleted doc's catalogRef from every tagged gym's `location.equipment[]` via `syncCatalogRefOnLocation`.

### 1.5 Orphan-link batch writes have no failure recovery
✅ *Shipped 2026-07-02.* `linkOrphanToSuggestion()` tracks per-batch commits; a mid-sequence failure reports "updated X of Y sessions — link again to finish" instead of a false success. Re-running is safe: rewritten workouts drop out of the affected filter, so a retry finishes only the remainder.

## Tier 2 — UX friction (the "clunky" you're feeling)

### 2.1 New gym = blank slate ← biggest single UX win
Add a gym, tap into it: empty grid, a quick-add button, zero guidance. This is the make-or-break moment for the whole feature. **Fix, in order of effort:**
1. Real empty state: "No equipment yet — add machines as you use them, or start from another gym."
2. **"Copy from another gym"** — one tap clones another location's equipment list (adds the new gym to each equipment doc's `locations[]`). Cheap to build, huge payoff for the hotel-gym/multi-gym user.
3. Starter packs: "Typical commercial gym" preset seeded from the catalog (barbell, dumbbells, cable stack, common selectorized machines).

### 2.2 Off-gym equipment selection has no cue
Mid-workout picker shows "All equipment" including machines at other gyms; picking one gives no signal. User wonders later why the leg press "moved." **Fix:** subtle tag on off-gym rows ("At Gold's Downtown") + on select, offer "Also at [current gym]? Add it here" — that's how equipment lists should grow organically.

### 2.3 Location lock is a ghost
Locking logic runs (location-service.js:183) but the lock icon is explicitly hidden (`:298`) and changes are allowed anyway. Dead concept. **Fix:** delete the lock state entirely; keep "location editable all workout." Less code, less confusion.

### 2.4 GPS failure paths dead-end
Denied permission or >5km accuracy silently falls into "new location" flow; reverse-geocode failures leave `cityState` blank forever (location-ui.js:303). **Fix:** explicit fallback UI — "Couldn't find you — pick your gym" with the saved-gym list one tap away. That list should arguably always be one tap from the workout header anyway.

### 2.5 Bulk equipment management missing
Moving several machines between gyms = one-at-a-time edits (equipment-library-ui.js:4417). **Fix:** multi-select in gym detail view with "Add to gym / Remove from gym" actions. (Largely subsumed by 2.1's copy-from-gym.)

## Tier 3 — Opportunities (the "crush it" list)

### 3.1 Surface equipment-planner as "What can I do here?" ← best effort-to-wow ratio
equipment-planner.js already computes template compatibility per gym (fully / partially / incompatible) with tests — **and has no UI**. Walk into a hotel gym, add 6 machines, and the app tells you which of your workouts you can actually run and what's missing. No mainstream tracker does this well. Build: compatibility badges on workout cards when a session location is set, plus a "possible here" filter.

### 3.2 Machine settings memory
Per-equipment, per-user settings (seat height 4, pin 3, handles narrow) shown at set time. Equipment docs already have `notes`; this needs structured per-exercise fields + display in the active-workout equipment row. Solves a real gym annoyance nobody solves; pairs perfectly with the per-gym identity of equipment.

### 3.3 Travel mode framing
2.1 + 3.1 together *are* a travel mode — market it as one: "Log a hotel gym in 2 minutes, keep your program on the road." That's the wedge audience (travelers, multi-gym members) the big apps ignore.

### 3.4 Community gym database (Phase 19 — keep on hold, but this is the moat)
Once gyms have stable identity (post 1.1/1.2), shared per-gym equipment lists ("3 users mapped this Gold's — import their list?") become network-effect defensibility. Requires moderation + privacy thinking; not now, but Tier 1 work is the prerequisite, which is another reason to do it first.

## Tech-debt note (do opportunistically, not as a project)

equipment-library-ui.js is 4,548 lines with ~5 sub-features in module-scoped state; active-workout-ui.js is 3,141. Split when touching them for the work above (gym-detail, catalog-browser, orphan-reconciliation are natural seams). Don't refactor for its own sake.

## Suggested sequence

Note on tech-debt Workstream 5 (the 4-way mechanical split of equipment-library-ui.js): **deferred, not a prerequisite.** The Tier 0 fixes live mostly in the data layer (firebase-workout-manager.js) and the quick-add commit path — the 4.5k-line file is unpleasant but not blocking, and a standalone mechanical-split deploy carries the atomic-deploy cache risk for maintainability-only payoff. If feature work below forces a natural seam out of that file (e.g., the quick-add sheet becoming shared), extract just that piece in the same PR. Revisit the full split only if the file keeps fighting back.

1. **Tier 0.1 — unify equipment storage** (data layer + quick-add commit path, plus one-time migration of `location.equipment[]` → docs)
2. **Tier 1.1–1.4** (integrity fixes — small, independently shippable)
3. **Tier 0.2 + 0.3 — exercise mapping + shared searchable picker with catalog access** (this is the "super intuitive travel flow" deliverable; likely extracts the quick-add sheet into its own module as a side effect)
4. **2.1 copy-from-gym + empty state**
5. **3.1 equipment-planner UI** (now fed by real data thanks to 0.1/0.2)
6. **2.2 off-gym cue → 2.4 GPS fallback → 2.3 delete lock → 3.2 settings memory**

Each step: `npm test` + `npm run lint` + `npm run audit:design`, deploy to dev target first.
