# Equipment Library UX — implementation handoff

Audience: Claude Code (or any dev) picking up a 4-phase usability pass on the equipment library.
Date started: 2026-05-31. All work is confined to two files:

- `js/core/ui/equipment-library-ui.js`
- `js/main.js` (only for `window.*` wiring of new inline-onclick functions)

Read `CLAUDE.md` first — the **User-Facing Copy Rules** (sentence case, contractions, no "please"/"successfully", `…` not `...`, `—` not `--`) and **Design System Rules** are binding. The **Deployment** section is binding: deploy to `hosting:dev` first, never straight to `hosting:prod`.

---

## ⚠️ Environment gotcha that blocked the original session

The session that wrote Phase 1 hit a filesystem desync: the bash shell mount served a **stale, truncated** copy of `equipment-library-ui.js` (cut off mid-function at ~line 2097), while the editor/file tools saw the real, complete file. Symptoms were a bogus `npm run lint` parse error at `2098:26 Unexpected token` and `git diff` showing a massive phantom deletion.

Before trusting any `git`/`npm`/`firebase` command, sanity-check that the shell sees the whole file:

```bash
wc -l js/core/ui/equipment-library-ui.js   # expect ~4140+, NOT ~2097
tail -3 js/core/ui/equipment-library-ui.js  # expect the KNOWN_BRANDS comment, not "const t = typ"
node --check <(cat js/core/ui/equipment-library-ui.js)  # or copy to a .mjs and --check
```

If the shell shows a truncated file, the mount is stale — re-sync the workspace (reopen/re-select the folder, or restart) before committing. Committing against the stale view would corrupt the repo.

Also note: `npm test` (vitest) may fail to start with `Cannot find native binding @rolldown/binding-linux-x64-gnu` if `node_modules` was installed on Windows. Run `npm install` (or `npm rebuild`) on the machine doing the work so the Linux/host binding is present. This is unrelated to any code change.

---

## Quality gate for every phase (from CLAUDE.md)

JS render/feature changes must pass before "done":

```bash
npm test
npm run lint            # baseline: 0 errors, ~127 warnings — don't make either worse
npm run audit:design    # must stay within budgets; --strict is the must-pass variant
```

Then `firebase deploy --only hosting:dev`, verify on dev, and only promote with `firebase deploy --only hosting:prod` after sign-off. Commit and deploy **one phase at a time**.

---

## Phase 1 — Fix Locations "+ Add" bug  ✅ CODE WRITTEN, NOT YET COMMITTED

### What the bug was
On the equipment **detail** page, the "+ Add" button under the **Locations** section called `assignExerciseToEquipment(equipmentId)` — the exact same handler as the "+ Assign" button under the **Used for** (exercises) section. Tapping it to add a gym opened an *exercise* picker. Result: no working way to tag equipment to a gym from the detail page. Pure copy-paste defect.

### What was changed (verify these are present)

1. **New functions** added in `equipment-library-ui.js`, immediately after `removeEquipmentLocation` (around line 4018):
   - `export function addEquipmentLocation(equipmentId)` — gathers known gyms from `allLocations` + every equipment's `locations[]`, drops gyms this equipment is already in, and opens the existing `openGymPickerSheet({...})`. If no gyms exist, it shows `Save a gym first (start a workout to stamp a location)`; if already in all of them, `Already at every gym`.
   - `async function commitEquipmentLocation(equipmentId, gymName)` — dedupes, appends `gymName` to the equipment doc's `locations[]` via `updateDoc(...)`, mutates the in-memory `eq.locations`, shows `Added to ${gymName}`, and re-renders via `openEquipmentDetail(equipmentId)`. Mirrors `removeEquipmentLocation` exactly.

2. **Button repointed** (the Locations section header, ~line 3036):
   ```diff
   - <button class="sec-head__action" onclick="assignExerciseToEquipment('${escapeAttr(equipmentId)}')">+ Add</button>
   + <button class="sec-head__action" onclick="addEquipmentLocation('${escapeAttr(equipmentId)}')">+ Add</button>
   ```

3. **`window` wiring** in `js/main.js`:
   - Added `addEquipmentLocation` to the import list from `equipment-library-ui.js`.
   - Added `window.addEquipmentLocation = addEquipmentLocation;` next to `window.removeEquipmentLocation`.

### How to verify Phase 1
- Confirm the two functions exist and `addEquipmentLocation` is exported + on `window`.
- Confirm the Locations "+ Add" onclick is `addEquipmentLocation`, and the Used-for "+ Assign" onclick is still `assignExerciseToEquipment` (don't change that one).
- Runtime: open an equipment detail page → tap "+ Add" under Locations → the **gym picker** sheet appears (not the exercise picker) → pick a gym → it's added to the Locations chips and persists on reload. The "×" on a location chip still removes it.
- Run the quality gate, commit, deploy to dev:
  ```
  git add js/core/ui/equipment-library-ui.js js/main.js
  git commit -m "Fix equipment detail Locations +Add: open gym picker, not exercise picker"
  firebase deploy --only hosting:dev
  ```

If the working tree already contains the Phase 1 edits (it should), just verify and commit. If a stale mount wiped them, re-apply from the spec above.

---

## Phase 2 — Disambiguate the two "Add" buttons  (copy-only, lowest risk)

Two buttons share the label "Add" and the plus icon but do different things, which confuses users:
- **Equipment library header** "+ Add" → opens the full brand→line→function **wizard** (`showAddEquipmentFlow`).
- **Gym detail header** "+ Add" → opens the **catalog quick-add** sheet (`openQuickAddSheet`), scoped to that gym.

### Changes

1. Equipment library header (`equipment-library-ui.js` ~line 886-888):
   ```diff
   - <button class="page-header__save" onclick="showAddEquipmentFlow()">
   -     <i class="fas fa-plus"></i> Add
   - </button>
   + <button class="page-header__save" onclick="showAddEquipmentFlow()" aria-label="Add equipment">
   +     <i class="fas fa-plus"></i> Add equipment
   + </button>
   ```

2. Gym detail header (`equipment-library-ui.js` ~line 923-925):
   ```diff
   - <button class="page-header__save" onclick="openQuickAddSheet('${escapeAttr(name)}')" aria-label="Add equipment">
   -     <i class="fas fa-plus"></i> Add
   - </button>
   + <button class="page-header__save" onclick="openQuickAddSheet('${escapeAttr(name)}')" aria-label="Add equipment from catalog">
   +     <i class="fas fa-plus"></i> Add from catalog
   + </button>
   ```

Sentence case per copy rules ("Add equipment", "Add from catalog"). If the labels overflow the header on narrow screens, prefer keeping the icon + shortening to "Add" with the distinguishing word in `aria-label` only — but try the full labels first; the header has room.

### Verify
Both headers render the new labels; both buttons still open their respective flows. Run the gate, commit (`"Equipment library: disambiguate Add vs Add-from-catalog labels"`), deploy to dev.

---

## Phase 3 — Add-wizard ergonomics  (editable generated name)

Context correction from the original audit: the wizard pickers (`openFieldPicker` → `renderFieldPicker`) **already have a working "×" close button** (line ~3638), and the add-flow page itself already has a back button (line ~3853). So a "back affordance" is **not** missing. The cascade-clear (changing brand nulls line+function; changing line nulls function) is intentional and must be preserved.

The real, worthwhile change is: **let the user edit the auto-generated equipment name before confirming.** Today `renderAddFlow` shows a read-only preview (`add-preview`, lines ~3911-3914) built by `addFlowGeneratedName()`, and `confirmAddEquipment` re-derives the name from `addFlowGeneratedName()`. A mistyped function means the whole name is wrong with no in-wizard fix.

### Changes (in `equipment-library-ui.js`)

1. Add a `name` field to `addFlowState` (reset it to `null`/`''` in `showAddEquipmentFlow`, alongside the existing `brand/line/func/type` resets ~line 3824-3827). Treat it as a user override: `null` means "use the generated name".

2. Replace the read-only `add-preview` block (~3911-3914) with an editable input pre-filled from `addFlowGeneratedName()`:
   - On `oninput`, store the trimmed value into `addFlowState.name` (empty string → revert to `null` so it falls back to generated).
   - Keep a small hint that it was auto-suggested, e.g. label "Name" with helper text "Auto-named from your picks — edit if needed".
   - Do **not** full-re-render `renderAddFlow()` on each keystroke (it would blow away the input and drop focus — same iOS-keyboard pitfall noted in `renderFieldPickerList`). Update state only; let the input hold its own value.
   - Important: when the user changes brand/line/function *after* editing the name, decide the rule. Recommended: if `addFlowState.name` is still `null` (untouched), the displayed value tracks the generated name; once the user types, stop auto-overwriting. To re-sync the input's displayed value after a cascade change while the field is untouched, you can re-render (the input is empty/untouched so no focus loss matters).

3. In `confirmAddEquipment` (~3936): use `const name = (addFlowState.name && addFlowState.name.trim()) || addFlowGeneratedName();`. Keep the existing empty-function guard. The `Add Another` path should reset `addFlowState.name = null` along with `func` so the next entry re-generates.

### Verify
- Open Add equipment, pick brand/line/function — the Name field shows the generated string.
- Edit the Name, confirm — the saved equipment uses the edited name (check Firestore/detail page).
- Leave Name untouched, confirm — uses the generated name (no regression).
- "Add Another" clears the function and the name override.
- Changing function still updates the generated name when the field is untouched.
Run the gate, commit (`"Add-equipment wizard: editable name field"`), deploy to dev.

---

## Phase 4 — Save feedback + polish  (independent paper-cuts; can cherry-pick)

Do a quick runtime sanity-check of items 2–3 before coding — they came from a static read.

### 4a. "Saved" feedback on silent auto-save fields
Most equipment-detail edits persist silently on a debounce with no confirmation (`saveEquipmentField` ~line 4075, `saveEquipmentBaseWeight`, `setEquipmentBaseWeightUnit`, `saveEquipmentNotes`), unlike exercise assignment which is explicit. Add a light, non-nagging confirmation after the debounced write resolves — e.g. a brief `showNotification('Saved', 'success', 900)` or a small inline "Saved" pill. Keep it subtle (short timeout, no exclamation per copy rules). Apply consistently to the debounced field/base-weight/notes saves; the unit toggle (`setEquipmentBaseWeightUnit`) writes immediately and can share the same confirmation.

### 4b. Clear (×) button on the Library tab search (parity with Catalog)
Catalog search has a clear ✕ (line ~2288); the Library search (`renderLibraryTab`, search markup ~2241-2251) does not. Add a clear button inside `.equip-lib-search` shown only when `currentSearchTerm` is non-empty, calling `filterEquipmentBySearch('')`. Match the Catalog markup/classes for consistency; sentence-case `aria-label="Clear search"`.

### 4c. Hide the all-zeros stat strip on the empty "My gyms" tab
When there are no gyms (`renderMyGymsTab`, the `if (stats.length === 0)` branch ~line 2013-2020), the return currently prepends `stripHTML` (a stat strip reading all zeros), which looks like a failed load. Drop `stripHTML` from the empty return so only the scan banner (if any) + empty state show:
```diff
- return stripHTML + scanBannerHTML + `
+ return scanBannerHTML + `
      <div class="empty-state-compact"> … </div>
  `;
```
Leave the non-empty path (which uses `stripHTML`) unchanged.

### 4d. Forward-looking empty-state copy
Both empty states are backward-looking ("…auto-saved when you use it in a workout") and don't tell a new user what to do now. Per CLAUDE.md empty-state rule (what it is → why empty → how to start), revise:
- My gyms empty (~2017-2018): keep "No gyms saved yet" but make the hint actionable, e.g. "Start a workout and your gym gets saved automatically." (sentence case, contraction-friendly, no "please").
- Library empty (~2256-2260): "No equipment yet" + hint like "Equipment gets saved as you use it in workouts — or add it from the Catalog." Reference the Catalog tab as the concrete next step.
Keep the existing search-result empty variants ("No matches found") intact.

### Verify
Each sub-item independently: trigger the empty/typed/saved state and confirm behavior + copy. Run the gate. Commit can be one bundle (`"Equipment library polish: save feedback, library search clear, empty-state fixes"`) or split per sub-item. Deploy to dev.

---

## Suggested order & commits
1. Phase 1 — verify + commit + deploy dev (already written).
2. Phase 2 — commit + deploy dev.
3. Phase 3 — commit + deploy dev.
4. Phase 4 — commit + deploy dev.

Promote each to prod only after dev verification and sign-off. Remember the 1-year prod cache on JS/CSS (CLAUDE.md Deployment) — a hard refresh is needed to see prod changes on a device that already cached the old bundle.
