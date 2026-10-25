# Big Surf — Action Plan, October 2026

*Written 2026-10-23 from a source-verified review of the working tree at commit `b3111fc`. Every claim below cites a file and line in that tree; line numbers drift as you edit, so search for the function name if a number is off. Phases are tagged **AP-n** and sized S/M/L. One phase = one PR, dev-deploy gate, same as the CP-n workstream.*

*Updated 2026-10-23 (evening): added §4.0 (what the coach is for), §4b / AP-21 (progress scoreboard), AP-22 (fatigue signal from RPE-at-load + readiness), AP-15h/i, and a pointer to `docs/agent-field-guide.md`, the companion learning track that uses the coach as its case study.*

*Status 2026-10-23 evening: AP-1, AP-2, AP-6, AP-7, AP-8, AP-10 (`5ca4af6`) and AP-9, AP-15 a–g (`7dc3319`) are on `main`; coach unit tests green (130). Not yet on dev/prod.*

*Status 2026-10-24: AP-15 h–i, AP-16, AP-21 and AP-22 phase 1 committed; full suite green (1062), lint at baseline, design audit strict ok. Functions deployed (one project — live for dev and prod clients; backward compatible with the old client). Hosting on **dev** only; promote to prod after verifying. "As built" notes under each phase record where the build differs from the plan text.*

*Status 2026-10-25: AP-17 and AP-18 implemented (1099 tests green, lint at baseline, design audit strict ok). Not yet deployed — functions carry nearly all of it.*

**How to use this doc in VS Code:** each AP-n block is written so you can paste it (with the "Context" paragraph at the top of its issue section) straight into Claude Code / Copilot as the task. The "Acceptance" lines are what to check before merging. Run `npm test` before and after every phase.

---

## 0. Executive summary

Four complaints, three root causes, one missing habit.

| # | Complaint | Root cause (one line) | Why it keeps regressing |
|---|---|---|---|
| 1 | History card and prefilled rows don't match / rows stay empty, especially after switching equipment or exercise | **Render runs before autofill, and autofill refuses to seed rows that already exist.** `ensurePersistentSets` pads blank rows on every render (`active-workout-ui.js:998-1009`); `loadAutofillForExercise` only seeds when `sets.length === 0` (`:4135`, `:4193`). Workout start awaits autofill first, so it works there; every mid-workout path renders first, so it never seeds. | No instrumentation sees the skip. `maybeLogEquipmentLeak` only fires on one symptom (surfaced equipment missing from library); it runs *before* the seed decision and never records which match tier hit or whether rows were seeded. Fixes land blind. |
| 2 | Adding a machine mid-workout means jumping through hoops | **The fast path exists but is hidden; the visible button is the slow path.** `Create "<query>"` is a 3-tap flow (`awCreateEquipmentFromSearch`, `active-workout-ui.js:2497`) but only appears while typing and renders *last* in the list. The only button on the empty sheet is "Browse catalog" (`:2443`), which opens a second sheet with checkboxes or — when no gym is stamped — **navigates away to the Library** (`awGoToEquipmentLibrary`, `:2569`), tears down the workout, and creates a doc with no gym tag. Seven create-equipment code paths write seven different document shapes. | Each fix added a path instead of consolidating to one door. |
| 3 | In a deload week the last-session card still says "go heavier" | **Deload is a side effect of one button, not a property of the session.** `progressionTarget()` / `computeOverloadNudge()` (`progression.js:125-223`) are pure functions of exercise history with no intent input. The −35% is applied once, after autofill, only when the workout is started from the dashboard program hero (`program-session.js:336-351`). Start from the Workouts tab, repeat from history, resume, add/replace an exercise mid-session, or a base-weight machine (`nextTargetFor`, `active-workout-ui.js:823-838`) and nothing knows it's a deload. | Rules engine, dashboard insights, live coach and chat coach each read *history*, not *intent*. There is no single object that says "this session is a deload." |
| 4 | The AI coach is stupid | **It never receives the rules engine's verdicts and is asked to re-derive them from 30 raw workouts with wrong inputs.** Chat context omits `progressionTarget`, `checkDeloadNeeded`, stall rung, MRV headroom, today's date, today's planned session, and current gym (`ai-coach-ui.js:1156-1329`). Weekly volume is a 4-week *sum* labelled as a weekly average (`:1168-1180`) — ~4× inflated. Validators coerce/drop instead of rejecting (`coach-tools.js:331-348`). ~3,700 tokens of doctrine are advisory. | Nothing is measured: no tool-call trace, no fixtures, no eval. "Stupid" is unfalsifiable. |

**Cross-cutting theme:** the app computes the right answers in code (`progressionTarget`, `checkDeloadNeeded`, `getLastSessionDefaults`) and then each surface ignores or re-derives them. The plan below makes **one source of truth per decision** and **instruments every decision** so the next bug report arrives with data.

### Recommended order

```
Week 1   AP-1 + AP-2   prefill merge-seed + autofill_trace        (ship together — the trace proves the fix)
         AP-6 + AP-7   sessionIntent + progression consumes it     (kills the deload contradiction everywhere in-workout)
Week 2   AP-11         equipment picker: one door, no navigate-away
         AP-3          id-aware last-session lookup + tier
         AP-9          coach learns the deload (cheap, high value)
Week 3   AP-15         coach data fixes (volume math, Today line, units)
         AP-21         progress scoreboard (rolling 4-week e1RM on primaries) — the week-to-week "am I progressing?" answer
         AP-20a        coach traces (log what the model saw/called)
         AP-12         equipment-create planner + dedupe + unit
Then     AP-4/5/8/10/13/14/16-19/20b as time allows, in the order listed; AP-22 (fatigue signal) right after AP-21 + AP-16 land.
```

### Before you start (30 minutes, no code)

1. **Working tree has 70 files "modified" by line endings only.** `git diff --ignore-cr-at-eol --stat` is empty; `git status` shows 70 files. `.prettierrc` / `.vscode/settings.json` changed (likely `endOfLine`). Decide once: add a `.gitattributes` (`* text=auto eol=crlf` to match the repo) or `git add --renormalize .` and commit, so every PR diff isn't polluted with whole-file churn.
2. **Confirm what build your phone is running.** Hard-refresh prod (or check the SW version) and verify the `Create "<query>"` row appears when you type in the equipment sheet. If it doesn't, you're on a cached build and part of #2 is a deploy problem, not a code problem.
3. **Confirm the app actually thinks it's a deload week.** In `?debug`, log `AppState._activeProgram.startDate` and `weekTargets`. Per `docs/coach-periodization-plan.md` Appendix A (block start 2026-09-21), 2026-10-23 is **week 5 "intensify"**; deload is week 6 (10-26 → 11-01). If your program doc says the same, the hero path didn't misfire — the structural problem (#3) still stands, but the repro changes.
4. **Confirm CP-0…CP-7 are on prod.** `launch-roadmap.md` §4 says "on dev 2026-09-18, awaiting dev verification → prod." If prod is pre-CP, some of what you see is pre-CP behaviour.
5. `npm test` — get a green baseline. The suite takes >3 minutes; run it in a terminal, not through a tool with a timeout.

---

## 1. Prefill / history mismatch

**Context for the coding agent:** Big Surf is vanilla ES-module JS + Firebase, no build step. The active workout is a wizard in `js/core/workout/active-workout-ui.js`. Per-exercise live state is `AppState.savedData.exercises['exercise_<idx>']` (`sets[]`, `equipment`, `equipmentId`). History lookup is `getLastSessionDefaults(exName, equipName, locName)` in `js/core/data/data-manager.js:255-332`. Autofill entry is `loadAutofillForExercise(idx)` (`active-workout-ui.js:3987`). Tests: Vitest in `tests/unit`, import real modules, Firebase mocked via `tests/fixtures/firestore-mock.js`; adding `export` to an internal function for testability is allowed. `window-wiring.test.js` fails if a rendered `onclick` doesn't resolve to a `window.*` assignment.

### 1.1 What's actually going on — ranked defects

| # | Defect | Evidence | Repro |
|---|---|---|---|
| D1 | **Render pads blank rows before autofill; autofill won't seed non-empty arrays.** | `ensurePersistentSets` `:998-1009` called from `buildSetRows` `:1046-1049`; guard `if (!sx.sets \|\| sx.sets.length === 0)` at `:4135` and `:4193`; autofill always suspends first (`await import` `:4032`, `await getLastSessionDefaults` `:4040`) | Mid-workout: ⋮ → Replace → pick an exercise you have history for. Card shows "Last: …"; rows show only placeholders. Same for Add exercise. |
| | Call sites that render first: `commitReplaceExercise` `:1752-1775` (deletes savedData, `renderAll()` at 1772, autofill at 1773); `awInsertExercise` `:3326-3350` (autofill 3342 suspends, `awJumpTo`→`renderAll` 3348); `awSelectEquipment` `:2896-2975` (never touches `sets`; `renderAll()` 2968; autofill 2974). Only `startWorkout`/`startFreestyleWorkout` (`workout-session.js:258`, `:398`) await autofill before first render — which is why it "sometimes works." | | |
| D2 | **Equipment switch never re-seeds rows** even if D1 were fixed — guard is all-or-nothing on array length; no notion of "untouched autofill row." Sets already carry `completed` and `_userEdited` (`:1422`, `:1518`) and un-edited rows are already identified for styling at `:1059`. | | Switch machine A→B on an exercise with seeded rows: card = B's history, rows = A's numbers. |
| D3 | **Concurrent autofills for the same idx have no sequencing.** Entry deletes `_lastSessionSets` (`:4020-4024`) then awaits; two in-flight calls interleave; last resolver owns the card, first seeder owns rows. Coach `applySwap` calls `awInsertExercise` then `awSelectEquipment` back-to-back (`coach-live.js:500-502`). | | Tap A→B→C quickly on a slow connection. |
| D4 | **Lookup matches equipment by exact name string only; ignores `equipmentId`.** Ladder exact→equipment→location→name (`data-manager.js:255-332`); exercise compare case-sensitive, no trim (`:284`); equipment compare `===` (`:300`); location compare is case-insensitive (`:273-274`) — inconsistent. `equipmentId` is dual-written on workout docs (`:118-145`) and available at the call site (`savedEx.equipmentId`, `active-workout-ui.js:3998`) but never passed. Renaming via quick-edit regenerates `name` without touching history (`equipment-quick-edit.js:285-302`). | | Rename a machine (brand/line/function) → next session the equipment tier misses, location tier picks the most recent *other* machine for that exercise at that gym. |
| D5 | **"None" equipment is silently undone.** None row → `awSelectEquipment(idx, '')` (`:2328`) → `sx.equipment = null` → autofill adopts `lastSession.equipment` when `!sx.equipment` (`:4129-4132`), `equipmentId` left stale. | | |
| D6 | **Plate-relative seeds display base-subtracted twice.** `getLastSessionDefaults` returns plates when `_plateWeight` recorded (`data-manager.js:309-311`); seeder stamps `_plateWeight` (`:4172-4179`); card handles it (`:877-878`); rows do `rawForDisplay = weight - baseWeight` regardless (`:1103-1105`). Completion is correct (`awToggleSet` keys on `_plateWeight`, `:1452`), so user sees 180, logs 270 — "form doesn't match history." | | 90 lb base machine, last time typed 270 plates. Card 270, row placeholder 180. |
| D7 | **Unit toggle writes autofill values as real input values and leaves `_plateWeight` unconverted.** `awToggleUnit` converts `set.weight` only (`:3619-3625`); then `input.value = set.weight` for every set (`:3650-3655`) including placeholder-only rows (`:1108`) → next `awToggleSet` reads it as user-typed (`:1410-1414`) → logs total+base. | | |
| D8 | **Gym change mid-workout never re-runs autofill and resets wizard to exercise 0.** Three paths set `savedData.location` and call `renderActiveWorkout()` (`workout-session.js:2003-2006`, `:2374-2377`, `:2680-2685`), which resets `currentExerciseIdx = 0` (`active-workout-ui.js:105`). | | |
| D9 | **Transient read failure caches `null` for the whole workout.** `loadAllWorkouts` returns `[]` on error (`data-manager.js:897-899`); `getLastSessionDefaults` caches `null` (`:333`); cache only cleared at start/complete (`:221-225`). | | One bad fetch at start → blank rows + no card for every exercise, no retry. |
| D10 | **`awDeleteExercise` re-keys `savedData` but not `AppState.exerciseUnits`** (`:1621-1633`); `awMoveExercise` does both (`:3699-3706`). | | Delete exercise 1 → exercise 2's kg flag applies to whatever slid into slot 2. |

Lower-confidence, check once against data: `getExerciseName` is `name \|\| machine` (`workout-helpers.js:9`) while history is keyed `machine \|\| name` (`data-manager.js:88`). If any exercise doc has `name ≠ machine`, that exercise never finds its own history.

Checked and fine: cache invalidation after completion (`completeWorkout` prunes unlogged sets, `saveWorkoutData` clears cache after write); `freestyle-memory.js` can't disagree with rows (passes name only).

### 1.2 Phases

#### AP-1 — Merge-seed + generation guard (S/M) — fixes D1, D2, D3

In `active-workout-ui.js`:

- Add `const isUntouched = s => !s || (!s.completed && !s._userEdited);`
- Add and **export** `mergeSeed(existing, seeded)`: for `i < max(len)`, keep `existing[i]` if touched, else `seeded[i] || existing[i] || {reps:null, weight:null, completed:false}`.
- In `loadAutofillForExercise`, both branches (`:4135` history, `:4193` template defaults): replace the length guard with `sx.sets = mergeSeed(sx.sets || [], seeded)` where `seeded` is the existing mapper output (`:4156-4181`) or the template-defaults array.
- Generation guard: module-level `const _autofillGen = new Map()`. At entry: `const gen = (_autofillGen.get(idx) || 0) + 1; _autofillGen.set(idx, gen);`. After **every** `await`: `if (_autofillGen.get(idx) !== gen) return;`.
- Add a second parameter `trigger` (`'start'|'resume'|'equipment'|'replace'|'insert'|'location'|'coach'`) and pass it from each call site (needed by AP-2).
- Optional: move `ensurePersistentSets` padding out of `buildSetRows` so render is pure. The merge alone is sufficient; do this only if cheap.

Tests (`tests/unit/autofill-seed.test.js`, new): seeds into 3 blank `{null,null,false}` sets (the `ensurePersistentSets` shape — **fails today**); preserves `completed` and `_userEdited`; replaces only untouched; bump/back-off only on weighted non-warmup; `_suggested` flag; plate-known source → `_plateWeight === weight`. `tests/unit/autofill-generation.test.js`: two overlapping calls with a delayed mock `getLastSessionDefaults` — the earlier one must not write `_lastSessionSets` or seed after the later started.

Acceptance: Replace-exercise, Add-exercise, and change-equipment mid-workout all show seeded rows matching the card; a completed row survives an equipment switch.

#### AP-2 — `autofill_trace` instrumentation + `?debug` overlay (S) — ship with AP-1

- At the **end** of `loadAutofillForExercise` (after the seed decision, inside try/catch), emit one structured event via the same dynamic `import('../utils/error-handler.js')` pattern as `maybeLogEquipmentLeak` (`:3952-3981`). Use a silent/info severity so it lands on the Error Log page without a toast (add one to `error-handler.js` if none exists).
- Fields: `exerciseIdx, exerciseName, trigger, gen, superseded (bool), queryEquipment, queryEquipmentId, queryLocation (+ typeof of savedData.location), resolved:{found, tier, equipment, equipmentId, location, date, setsCount, cacheHit}, seed:{attempted, setsBefore, untouchedBefore, setsSeeded, reasonNotSeeded}, unit:{exerciseUnit, globalUnit, sourceUnits[]}, plate:{baseWeight, platesKnownCount}, cache:{allWorkoutsCount, lastSessionCacheHit}, durationMs`. `tier`/`cacheHit` come from AP-3's return value; until then emit `null`.
- Card/rows consistency assertion (dev-only, `?debug`) in `renderExerciseView`: if `_lastSessionSets` exists and every row is untouched but `sets[i].weight` ≠ seeded-from-card value, emit `autofill_mismatch` with both arrays.
- `?debug` overlay: in `renderLastSessionCard`, when `new URLSearchParams(location.search).has('debug')`, append a muted monospace line: `tier · query=<equip> · from=<equip> · seeded=N/M · gen=G · trigger`.

Acceptance: every prefill produces exactly one `autofill_trace` on the Error Log page; a forced mismatch produces `autofill_mismatch`.

#### AP-3 — Id-aware, case-insensitive last-session lookup with tier (M) — fixes D4

In `data-manager.js`:
- Signature `getLastSessionDefaults(exerciseName, equipment, location, equipmentId = null)`; include `equipmentId` in `cacheKey`.
- Exercise compare: trim + lowercase. Equipment compare: `(equipmentId && exEquipId === equipmentId) || (equipment && exEquipment && norm(equipment) === norm(exEquipment))` where `exEquipId = exData.equipmentId || originalAtIdx?.equipmentId || null`.
- Return `tier: 'exact'|'equipment'|'location'|'name'` alongside the existing fields; return `cacheHit`.
- D9: do not cache `null` when `loadAllWorkouts` returned `[]` due to error (have it rethrow or return a sentinel), or cache with a short TTL.

In `active-workout-ui.js:4040`: pass `savedEx?.equipmentId || exercise.equipmentId`. Use `tier` on the card ("from <other machine>" only when tier ≠ exact) and in AP-2's trace.

Tests (`tests/unit/last-session-defaults.test.js`, new): tier precedence; equipment compare case/whitespace-insensitive (**fails today**); matches by `equipmentId` when name differs (**fails today**); `originalWorkout[idx]` ignored when slot name differs; skips today/cancelled/uncompleted; plate-relative weights; no `null` cache on fetch failure; cache key includes location+equipment.

#### AP-4 — Plate/unit display (S) — fixes D6, D7

- `:1105`: `else if (!set._userEdited) rawForDisplay = (typeof set._plateWeight === 'number') ? set._plateWeight : Math.max(0, rawForDisplay - baseWeight);`
- `awToggleUnit`: convert `_plateWeight` alongside `weight`; only write `input.value` for `_userEdited || completed` sets, update `placeholder` for the rest.
- Export `plateRelativeDisplay(set, baseWeight)` from lines 1102-1106 and test it (`tests/unit/set-row-display.test.js`).

#### AP-5 — Small ones (S) — fixes D5, D8, D10

- D5: `awSelectEquipment` with empty name sets `sx.equipmentExplicitNone = true`; gate the adoption block at `:4129` on `!sx.equipmentExplicitNone`; when adopting, also set `sx.equipmentId = getEquipmentDoc(...)?.id || null`.
- D8: after each `savedData.location = …` in `workout-session.js`, call `clearLastSessionCache()` then `loadAutofillForAllExercises().then(renderAll)` instead of `renderActiveWorkout()`; with AP-1 this re-seeds only untouched rows and keeps the wizard index.
- D10: `awDeleteExercise` rebuilds `AppState.exerciseUnits` with the same shift as `newExercises`. Test in `tests/unit/active-workout-index-rekey.test.js`.

### 1.3 Tracking going forward

Add a one-line rule to CLAUDE.md under "Touching active-workout code": **never call `renderAll()` before `loadAutofillForExercise()` on a path that may change the exercise/equipment; after AP-1 it's harmless, but the rule prevents the next regression.** When you see a mismatch on the phone: open with `?debug`, screenshot the overlay line, and copy the `autofill_trace`/`autofill_mismatch` entries from the Error Log page into `docs/bug-log.md` (template in §5).

---

## 2. Adding equipment mid-workout

**Context for the coding agent:** equipment docs are `users/{uid}/equipment/{id}` with `name` (composed by `composeEquipmentName()` in `js/core/utils/equipment-name.js` from brand/line/function), `equipmentType`, `locations[]` (gym names), `locationIds[]`, `baseWeight`, `baseWeightUnit`, `preferredUnit`, `catalogRef`, `exerciseTypes[]`. The active-workout equipment sheet is `awOpenEquipmentSheet` (`active-workout-ui.js:2174`) rendering `buildEquipListHTML` (`:2255`); selection is `awSelectEquipment` (`:2896`); creation from search is `awCreateEquipmentFromSearch` (`:2497`) → `getOrCreateEquipment` (`firebase-workout-manager.js:1330`) → `saveEquipment` whitelist (`:1067-1093`). Catalog search is `searchCatalogMachines` / `inferEquipmentType` in `js/core/data/catalog-search.js`. Dice-similarity fuzzy match exists in `js/core/data/fuzzy-match.js#findBestMatch` (used by `machine-id.js:101`). Product rule: **one canonical door per action; never leave the workout page; fewest taps.**

### 2.1 Current path, tap by tap

**Fast path (exists today, hidden):** tap equipment line (sheet blocks on a Firestore read with no spinner, `:2184-2191`) → tap search field (not auto-focused) → type ≥2 chars → tap `Add from catalog` row (`:2220`) or `Create "<query>"` row (`:2234`, rendered **last**, `:2409`, suppressed only on exact normalized name hit `:2392`, no minimum length `:2263`). **3 taps + typing, 0 forced fields.** Created doc: name = typed string, brand only if an already-owned brand prefixes it (`firebase-workout-manager.js:87-103`), `equipmentType` guessed, **no `preferredUnit`** (whitelist drops it), `baseWeight: 0`, gym + exercise tagged (9/29 change, `:1397-1399`).

**The hoops path (what the visible button does):** "Browse catalog" (`:2443`) → with a gym: Library quick-add sheet (`equipment-library-ui.js:1395`), retype name, check row, "Add to <gym>" — **~5 taps + retyping, 2 sheets**; if not in catalog → "Can't find it? Add custom" → name → type chip → Add — **~7 taps**. Without a gym stamped (common at a *new* gym — exactly when you add machines): `awGoToEquipmentLibrary` (`:2569-2581`) → `navigateTo('equipment-library')` **tears down the workout** → `showAddEquipmentFlow()` after a 200 ms timeout → Brand → Line → Function pickers → type chip → Add → lands on equipment **detail page**, doc has **no gym tag** (`confirmAddEquipment` never passes `locations`, `:4455-4466`) → bottom nav back → equipment line → new doc hidden under "Other equipment" behind "Show all" (`:2342-2351`) → tap. **≈10-12 taps, 3 screens.** This is the complaint verbatim.

### 2.2 Friction inventory

1. Heavy door is the visible one; fast rows only exist while typing.
2. Navigate-away fallback when `savedData.location` is null.
3. Search is contiguous-substring only (`:2287`, `catalog-search.js:64-69`): "hammer chest" matches neither "Hammer Strength — Chest Press" nor catalog "Chest Press" → only `Create` is left → duplicate.
4. Dedupe is weak: exact normalized key for the row (`:2392`); separator-stripping only in `getOrCreateEquipment` (`firebase-workout-manager.js:70-77`). `findBestMatch` dice similarity exists and isn't used here.
5. `Create "h"` after one keystroke.
6. Create row last; scrolls off below 6 catalog hits.
7. **Seven create paths, seven doc shapes:** `awCreateEquipmentFromSearch`, `awAddCatalogMachine` (`:2478`), quick-add custom (`equipment-library-ui.js:1733`, no dedupe, `locationIds` → `[]`), Library add flow (`:4434`, no gym), `awSaveNewEquipment` (`:3036`, **dead code**, writes `baseWeightUnit:'lb'` vs `'lbs'` everywhere else), Photo-ID (`machine-id.js:137`, uses `getSessionGym()` — a different gym source than `savedData.location`; `createdVia` dropped by whitelist), legacy modal (`workout-management-ui.js:609/718`, unreachable since V2). Three name composers despite CLAUDE.md naming `composeEquipmentName` as the single one (`catalogDisplayName` `equipment-library-ui.js:1161`, inline in `addCatalogMachineDoc` `:2458-2460`).
8. Unit never set at create; `awSelectEquipment` only adopts `preferredUnit` if `exerciseUnits[idx]` is unset (`:519-523`).
9. Brand only recognised if already owned → `brand:null` disables line-gap discovery (`equipment-discovery.js:52+`).
10. Sheet open blocks on network; create does a redundant pre-read (`getOrCreateEquipment` → `getUserEquipment`, `:1345`) even though the cache is warm.
11. Photo-ID not reachable from the picker; doesn't select or link.
12. Shared sheet (template editor / substitution) create never gym-tags (`:2729` passes `null` though `locName` is computed at `:2640`) nor exercise-links (`:2824`).
13. `inferEquipmentType` defaults to `'Machine'` (`catalog-search.js:111`); `'Selectorized'` is never inferred.

### 2.3 Target design — one door: the search field

- **Open instantly** from `AppState._cachedEquipment`; refetch in background; auto-focus the input synchronously in the click handler (before any `await`, so iOS raises the keyboard).
- **While typing (≥2 chars)** the first row is **sticky, directly under the field**, one of:
  - `Use "<existing>"` when `findBestMatch(query, ownedNames, 0.75)` hits → selects it. Secondary link "Add as new anyway".
  - `➕ Add "<query>" at <gym>` · meta `<inferred type> · [lbs|kg]` with a tappable unit pill (default = this exercise's unit). Tap row = create → tag gym → link exercise → select → close → toast. **Zero forced fields.**
  - No gym stamped: row reads `➕ Add "<query>"`; toast carries a **"Set gym"** action → `changeWorkoutLocation()` (`:255`). **Never navigate away.**
- Then owned matches (token matching), then `Add from catalog` rows.
- Optional chevron on the Add row expands **in place** into Name (prefilled) / Brand (`<datalist>` of catalog + owned brands; typing a brand recomposes Name via `composeEquipmentName`) / Type chips / Unit segmented. The only mid-workout form.
- Remove: footer "Browse catalog" as primary (keep a "Browse by body part" row at the bottom of the un-searched list that passes `initialSearch` into `openQuickAddSheet`); `awGoToEquipmentLibrary`; dead `awQuickAddEquipment`/`awSaveNewEquipment`/`guessEquipmentType` (`:2977-3101`); quick-add's custom form when opened with `onDone` (`equipment-library-ui.js:1609-1632`); legacy `#equipment-picker-modal` path after confirming dead against `index.html`/`main.js`.
- Photo-ID: camera icon inside the search field → `openMachineIdCamera({ onAdd })`; `addIdentifiedMachine` routes through the planner and `onAdd` selects it.

### 2.4 Phases

#### AP-11 — Discoverability + never leave the workout (M)

- `awOpenEquipmentSheet`: render from cache first, refetch after, focus input synchronously.
- `buildEquipListHTML`: sticky first row (Create/Use-existing) via new `inlineAddRowHTML`; Create requires ≥2 chars; move Create out of trailing position.
- Replace footer "Browse catalog" with the bottom "Browse by body part" row; pass `initialSearch` (extend `openQuickAddSheet(gymName, { onDone, initialSearch })`; seed `quickAddState.search`; omit `customHTML` when `onDone` set).
- Delete `awGoToEquipmentLibrary` (`:2569-2581`); retarget `:2544-2546`; no-gym → Add row + "Set gym" toast.
- Delete `:2977-3101` (dead sheet).
- New handlers rendered from this file's templates get **same-file window wiring** at `:4300+` (`window-wiring.test.js`).

Acceptance: from an exercise, typing a machine name and tapping once creates it at the current gym, links the exercise, selects it, closes the sheet. No path leaves the workout page.

#### AP-12 — `equipment-create.js` planner + dedupe + unit (M)

- New pure module `js/core/data/equipment-create.js`: `planInlineEquipment({ query, exerciseName, gymName, unit, brand, type, owned, catalog }) → { action:'use-existing'|'create', existing?, doc? }`. Brand detection against **catalog brand names** (`awCatalog().map(b => b.name)`) and owned brands (move `parseEquipmentName` out of `firebase-workout-manager.js:87` into this module and import it back). `name = composeEquipmentName({brand, function: query})` when brand found, else trimmed query. `equipmentType = type || inferEquipmentType(query)`; add `selectorized|stack|pin loaded → 'Selectorized'`. `baseWeight = BASE_WEIGHT_SUGGESTIONS[type] || 0` (move the constant from `equipment-library-ui.js:3797` to `config.js`). Export `matchesAllTokens(hay, query)` and use it in `applySearch` and as a rank-3 fallback in `searchCatalogMachines`.
- `saveEquipment` whitelist: add `preferredUnit` and `createdVia` (one-liners; also unbreaks `machine-id.js:157`).
- New `createEquipmentFromPlan(doc, { knownEquipment })`: skips the pre-read when the warm cache is passed; runs the exact/sep-fuzzy guard against it; derives `locationIds` via `_deriveLocationIds`; one `setDoc`.
- `awCreateEquipmentFromSearch` body → plan → use-existing ? select : create → optimistic push into `_cachedEquipment` → `awSelectEquipment`. In `awSelectEquipment`, if `eq.preferredUnit` differs from the exercise unit, apply the same conversion block `awToggleUnit` uses (`:3616-3624`).
- Disable the Add row (`aria-busy`) while the promise is in flight.

Tests: `tests/unit/equipment-create.test.js` (plan shapes; catalog-brand prefix; dice ≥0.75 → use-existing; `force`; no gym/no exercise; type inference additions; `matchesAllTokens`). `firebase-workout-manager.test.js`: `saveEquipment` persists `preferredUnit`/`createdVia`; `createEquipmentFromPlan` makes **zero** `getDocs` calls and one `setDoc`; sep-fuzzy match writes nothing. `catalog-search.test.js`: rank-3 token fallback.

#### AP-13 — Route every create path through the planner (M)

Shared sheet (`:2817`) passes `gymName = locName`, `exerciseName = ctx.exerciseName`. Photo-ID `addIdentifiedMachine` → planner + `onAdd`. Quick-add custom → planner. `promoteCatalogToEquipment`/`catalogDisplayName` → `composeEquipmentName`. Delete the legacy modal path. Add a negative assertion to `window-wiring.test.js` that `awQuickAddEquipment`/`awSaveNewEquipment`/`awGoToEquipmentLibrary` no longer appear in `js/`.

#### AP-14 — In-place expand mini-form (S, optional)

Brand/Type/Unit expansion on the Add row; "Link to catalog" chip in quick-edit for `createdVia:'picker'` docs when exactly one rank-0 catalog hit matches `doc.brand` (never auto-rename).

Edge cases to honour in all three: near-duplicate → `Use "…"` + "Add as new anyway"; kg machine at an lbs gym → per-doc `preferredUnit` (gym-level unit is deliberately not modelled); no gym → create anyway, back-fill on next selection via `:2928-2934`; offline → optimistic insert, keep selection by name on rejection, never block sheet open on network.

---

## 3. Suggestions ignore the deload week

**Context for the coding agent:** progression rules live in `js/core/features/progression.js` (`buildExerciseSessions :51-84`, `computeOverloadNudge :125-161`, `progressionTarget :186-223`, stall ladder). Program week is derived by `deriveProgramWeek(program, today)` in `coach-context.js:121-135` from `AppState._activeProgram` (`startDate`, `weekTargets[]`); `weekTargetEffects`/`isDeloadTarget` in `week-targets.js`. Program adjustments are applied in `program-session.js` (`applyAdjustmentToCurrentSession :272-311`, `startWithAdjustment :336-351`), reachable only from the dashboard hero (`startProgramSession`, `:357-381`). `checkDeloadNeeded` is `training-insights.js:239-293` (reads `sessionLabel` on completed docs). Workout start is `workout-session.js:startWorkout` (savedData built `:197-206`, `await loadAutofillForAllExercises()` `:258`, save `:269`).

### 3.1 Every surface that can say "go heavier"

| Surface | Says "heavier"? | Knows program week / deload? | Reads |
|---|---|---|---|
| `computeOverloadNudge` `progression.js:125-161` | yes (`bump to`, `go N next`, `Beat it — try`) | **no** — no intent parameter | history only, deload sessions included |
| `progressionTarget` `:186-223` | yes (`bumped:true`) | **no** | history |
| Set seeder `active-workout-ui.js:4143-4181` | yes (`lastW + bumpInc`, `_suggested`) | **no** | `_progression` |
| Card nudge `renderLastSessionCard :898-905` | yes | **partially** — nulls nudge if `savedData.sessionLabel` truthy; label only written by hero start (`program-session.js:308`) and coach Apply (`ai-coach-ui.js:1103`) | a string |
| `nextTargetFor` `:823-838` (used when `base > 0`, `:900-901`) | **always** "Beat it — try N" | **no**; also bypasses the CP-2 stall ladder entirely on base-weight machines | last session only |
| ↑ marker on rows `:1114-1117` | yes | **no** (not gated by `sessionLabel`, unlike the card on the same screen) | `_suggested` |
| Header "week N of M" `:218-222` | — | yes | `_activeProgram` → header can say "week 6 of 6" while the card says "bump to 230" |
| `program-session.js` adjustment | no (scales down, deletes `_suggested`) | **yes — the only place** | one-shot, hero-only |
| `detectPlateaus` + dashboard insight `training-insights.js:135-198, 483-494, 535` | yes ("Try adding 5 lbs", "Add weight to X") | **no** | its own 3-session plateau model, parallel to and contradicting `stallState` |
| Chat coach context `coach-context.js:137-148` | model decides | week line only ("this week: deload (-35%)"), no "do not add load" directive; recent-workout lines omit `sessionLabel`, so a −35% session reads as a strength crash | program doc + raw history |
| Live coach `coach-live.js:44-86` | model decides ("What weight next?" chip) | **no** — no program, label, intent or `_progression` | current sets only |
| Server prompt `functions/index.js:998-1002` | "PUSH weight when … don't wait" | **no deload exception** (same in `LIVE_COACH_PROMPT` `:1089-1099`) | — |
| `get_exercise_history` tool `coach-tools.js:650-685` | — | returns no `sessionLabel` | — |
| `week-plan.js` | no | no deload concept | weekday→template map |

### 3.2 Root cause

Deload status is not a property of the session; it's a side effect of one start button. The progression functions are pure functions of exercise history with no intent input, so they compute an earned bump regardless of week; the seeder trusts them; the program's −35% is applied afterwards as a one-shot mutation that only runs from the hero. Start from the Workouts tab (`template-selection.js:79`), repeat from history (`workout-history.js:1496`), resume, add/replace mid-session, a base-weight machine, or a deload without a program — and nothing downstream knows. Rules and coach each see "hit reps last time → add weight."

Also: the week **after** a deload is broken too — `buildExerciseSessions` includes the deload session, so `sessions[0]` is the −35% session and the bump rule fires off it (seeds `0.65·W + 5`).

### 3.3 Phases

#### AP-6 — `sessionIntent`: compute once, store on the workout (S/M)

New pure module `js/core/features/session-intent.js`:

```js
export function getSessionIntent({ program = null, today, manualDeload = null, sessionLabel = null, freestyle = false } = {})
// → { mode:'build'|'deload'|'peak'|'freestyle', weightPct, setDelta, repRange, rpeTarget,
//     label, week, weeks, source:'program'|'manual'|'label'|'none', reason }
```
Precedence: (1) `program.startDate` + `deriveProgramWeek` not finished + target → `weekTargetEffects(target)`; `mode = isDeloadTarget(target) ? 'deload' : (weightPct > 0 || rpeTarget >= 9 ? 'peak' : 'build')`. Intent is computed for **every** trust level — trust gates *applying* set/rep deltas, not *knowing* the week. (2) `manualDeload` window `[from, from + 7·weeks)` → deload, `source:'manual'`. (3) `/deload|recovery/i.test(sessionLabel)` → deload, `source:'label'` (legacy docs on resume). (4) `freestyle ? 'freestyle' : 'build'`, `source:'none'`. Also export `isRecoveryWorkout(w)` (= `w.sessionIntent?.mode === 'deload' || RECOVERY_LABEL.test(w.sessionLabel || '')`) and `describeIntent(intent)` (reuse `describeWeekTarget`).

Compute and store:
- `workout-session.js:startWorkout` after savedData is built (`:197-206`) and **before** `await loadAutofillForAllExercises()` (`:258`): `AppState.savedData.sessionIntent = getSessionIntent({ program: AppState._activeProgram, today, manualDeload: AppState.settings?.manualDeload })`; if `mode === 'deload'` also set `savedData.sessionLabel = intent.label` so `checkDeloadNeeded`, the history chip (`workout-history.js:1326`) and completion chip (`workout-session.js:784`) keep working. If `_activeProgram === undefined` (not hydrated), `await loadActiveProgram()` first (`program-session.js:37`).
- `startFreestyleWorkout` (~`:398`) same with `freestyle: true`.
- `continueInProgressWorkout` (`:1440-1507`): after `savedData = window.inProgressWorkout` (`:1451`), `savedData.sessionIntent ??= getSessionIntent({ program, today: savedData.date, sessionLabel: savedData.sessionLabel })` — before autofill at `:1495`.
- Persistence is free: `saveWorkoutData` deep-clones savedData (`data-manager.js:116`).

Tests `tests/unit/session-intent.test.js`: program deload → deload; +5%/RPE 9 → peak; baseline → build; manual window in/out; precedence program > manual > label; legacy label → `source:'label'`; freestyle.

#### AP-7 — Progression consumes intent; one seeder; no double-scaling (M)

`progression.js`:
- Add 5th optional param `intent = null` to `progressionTarget` and `computeOverloadNudge`. When `intent?.mode === 'deload'`: `progressionTarget` returns `{ weight: intent.weightPct ? scaleLoadableWeight(W, 1 + weightPct/100, inc) : W, reps: intent.repRange?.[0] ?? (rt || R), bumped:false, stalled:false, action:'deload', deload:true }` — stall ladder skipped. `computeOverloadNudge` returns deload copy: with pct `Deload week — ${W2} ${unit} for ${reps}, two reps in the tank`; without pct `Deload week — hold ${W} ${unit}, stop two reps short`. `peak` leaves the matrix as is.
- `buildExerciseSessions(allWorkouts, exName, displayUnit, { excludeRecovery = true } = {})` skipping `isRecoveryWorkout(w)` at `:55` so post-deload progression continues from the last build session.
- Extract and **export** `seedSetsFromLastSession(lastSets, prog, intent, unit, inc)` from `active-workout-ui.js:4156-4181`; add the deload branch: weighted sets → `scaleLoadableWeight(lastW, 1 + weightPct/100, inc)` (unchanged when pct null), reps clamped to `repRange`, flagged `_adjusted:'deload'` — never `_suggested`.

`active-workout-ui.js`:
- Pass `AppState.savedData?.sessionIntent` at `:4083` and `:4087`; call the extracted seeder.
- Row marker (`:1114-1117`): `_suggested` → ↑; `_adjusted === 'deload'` → ↓ with `aria-label="Deload — lighter than last time"`.
- `renderLastSessionCard` (`:898-902`): always use `_overloadNudge` (it now carries deload copy); **delete `nextTargetFor`** and route the `base > 0` case through the same multi-session nudge (`buildExerciseSessions` is already plate-relative, `progression.js:63-66`; the comment at `:896-897` is stale). Keep bodyweight suppression.

`program-session.js`: `applyAdjustmentToCurrentSession` (`:272-311`) must **stop** calling `scaleSessionSetTargets`/`clampRepsToRange` when `savedData.sessionIntent?.source === 'program'` (autofill now applies weight/rep levers; otherwise −35% is applied twice). It keeps `setDelta` (MRV governor), `_rpeTarget`, `basedOn`. The hero's Start can call plain `startWorkout`; `startWithAdjustment` remains for setDelta + confirmation toast. Mid-session `awInsertExercise`/`commitReplaceExercise` get the deload for free via autofill.

Tests: `progression.test.js` — first **characterize** the current five nudge branches and all `progressionTarget` actions plus the "string and target never disagree on `next`" invariant; pin that `buildExerciseSessions` currently *includes* a `sessionLabel:'Deload'` workout (documents the bug); then: deload intent → `bumped:false`, `action:'deload'`, weight = `scaleLoadableWeight(W, 0.65, inc)`, no stall rung on a 6-flat run; `excludeRecovery` drops labelled sessions; `seedSetsFromLastSession` deload → `_adjusted`, no `_suggested`, ramp shape preserved. `program-session.test.js` — with `sessionIntent.source === 'program'`, set weights untouched (no double scale), governed `setDelta` still applied.

Acceptance: in a deload week, every entry path (hero, Workouts tab, history repeat, resume, add/replace mid-session, base-weight machine) shows deload copy and ↓ rows; the week after a deload progresses from the last build session.

#### AP-8 — One plateau definition; gate dashboard insights (S/M)

`training-insights.js`: `getTopInsights(recent, all, db, { intent = null } = {})` — when `intent?.mode === 'deload'` or `checkDeloadNeeded(all)?.inRecoveryWeek`, drop the `plateau` insight and the "Add weight to …" copy (`:491`, `:535`). Have `detectPlateaus` use `stallState` from `progression.js` and its rung copy so there is **one** plateau engine. Replace inline `RECOVERY_LABEL.test(workout.sessionLabel)` at `:252` with `isRecoveryWorkout(workout)`. Dashboard caller passes `getSessionIntent(...)`. Note `checkDeloadNeeded`'s tonnage rule needs ≥5 training days (`:266`, `Config.DELOAD_DAYS_PER_WEEK`) — a 4-day unlabelled deload never counts; AP-6's label write fixes the common case. Tests in `training-insights.test.js`.

#### AP-9 — The coach learns the deload (S)

- `coach-context.js:buildProgramContext`: when `isDeloadTarget(target)` append `DELOAD WEEK: do NOT prescribe heavier loads this week; hold or reduce. Session targets are already set by the app.` Add `buildSessionIntentContext(intent)` for the manual case.
- `ai-coach-ui.js:1279`: append ` · ${w.sessionLabel}` to each recent-workout header line.
- `coach-live.js:buildLiveWorkoutContext({ …, sessionIntent })`: one `Session:` line (e.g. `Deload week (−35% weight · 12–15 reps) — propose_next_target must not exceed the targets already on the set rows.`); pass `savedData.sessionIntent` at `:292-299`. Also `applyNextTarget` (`:463-488`) should not keep `_suggested` via the `...existing` spread (`:482`).
- `functions/coach-tools.js:get_exercise_history` (`:670-680`): add `label: w.sessionLabel || null` per session.
- `functions/index.js:998`: `PUSH weight when … — EXCEPT when the context says the current week or session is a deload: then HOLD or reduce, no exceptions.` Mirror in `LIVE_COACH_PROMPT`.
- Tests: `coach-context.test.js` emits the DELOAD directive for a deload week; `coach-live.test.js` includes the Session line when intent passed.

#### AP-10 — Manual deload, no program (S)

Settings row "Deload mode" + workout ⋮ item "Make this a deload session" → `preferences/settings.manualDeload = { from: today, weeks: 1, weightPct: -30 }` (or `null`) via the existing debounced settings save. `getSessionIntent` rule 2 picks it up; start writes `sessionLabel:'Deload'`; expires by date window — no cron. Program intent wins if both exist.

### 3.4 Other inconsistencies found while tracing (fix opportunistically)

- Comments at `progression.js:172-174` and `active-workout-ui.js:4086` say the coach reads `_progression.stalled`/rung; nothing does. CP-2 step 6 ("coach's stall line in context gains the rung") never shipped — AP-16 covers it.
- `startWorkout` persists the doc with bumped `_suggested` sets and no `sessionLabel` (`:269`), adjustment lands later and is only debounce-saved (`:343`); an app kill in that window resumes a bumped, unlabelled session. AP-6 fixes by computing intent before autofill.
- `applyAdjustmentToCurrentSession` scales `ex.weight` (`:281-283`) but the no-history seeder reads `exercise.defaultWeight` (`:4196`), which nothing sets → program pct never reaches a no-history exercise. (Likely; `template-helpers.js` not re-read.)
- Resume drops `defaultReps`, `category`, `_rpeTarget` from `originalWorkout` (`data-manager.js:93-109`), so `repTarget` falls back to `ex.reps` and the RPE "aim" disappears.

---

## 4. The AI coach

**Context for the coding agent:** the coach is Firebase Cloud Functions in `functions/index.js` calling the Anthropic API with tool use. System prompt = `TRAINING_SCIENCE_PROMPT + COACH_TOOLS_PROMPT + memoryBlock` (`:950-1086`, ~3.7k tokens). Chat model `claude-opus-4-8`, adaptive thinking, effort xhigh, max_tokens 16000 (`:34`, `:1466-1473`); live model `claude-sonnet-5` max 1500 (`:1459-1465`). Loop `coachChatStream` `:1475-1544`, ≤12 rounds, SSE streaming. 18 chat tools + 4 live proposals in `functions/coach-tools.js:41-316, 1190-1246`. Client context assembly `ai-coach-ui.js:1156-1329` (`buildTrainingContext`), `coach-context.js`, live `coach-live.js:44-86`. Pure rules modules are mirrored client↔server (`week-targets.js`, `exercise-rotation.js`, `movement-patterns.js`) via a sync script; `functions/` cannot import `js/`.

### 4.0 What the coach is for — four jobs, and the line between rules and judgment

The goal is a replacement for a personal trainer at a gym that doesn't offer one: *what should my plan be, am I stalling, what do I do today, am I making progress.* Most of that is arithmetic over a rich history, and the app already computes it. The coach's job is the part that isn't arithmetic. Four conversations, in priority order:

| # | Job | Trigger | Rules supply (code, deterministic) | Model supplies (judgment, words) |
|---|---|---|---|---|
| 1 | **Weekly scoreboard** | weekly review / "how am I doing?" | AP-21 scoreboard: per-primary rolling-4-wk e1RM trend, rep PRs, stall rung, per-pattern volume vs MEV/MRV | pick the one thing to lead with; say it in two sentences |
| 2 | **Block boundary** | last week of a block / "what's next?" | candidate accessories ranked by staleness + pattern coverage + equipment at the gym; rep-range emphasis for the next block; MRV governor | assemble the block, explain why each change, confirm with the user |
| 3 | **Today** | session start / "what do I do today?" | `sessionIntent` (AP-6) + per-exercise `progressionTarget` verdicts (AP-16) | one sentence: "Pull day, week 5 intensify — go for rep PRs on row, hold the rest." |
| 4 | **Free text** | anything typed in the user's own words | history, injuries, equipment, verdicts as facts | interpretation, trade-offs, substitutions, "my knee feels weird" |

Everything with a number and a threshold is a rule. The model receives verdicts as facts, explains them, and may deviate only through an explicit, logged `override:true, reason` (AP-17). The progress question — *am I getting stronger week to week?* — is answered by a **dashboard** (AP-21), not by chat; the coach reads the same object the dashboard shows so the two can never disagree.

### 4.1 Diagnosis — why it feels stupid, in order

1. **The rules engine's verdicts never reach the model.** `progressionTarget()`, `stallState()`, `checkDeloadNeeded()`, `detectPlateaus()`, MRV headroom — none are in the chat or live context. `buildTrainingContext` sends `analyzeWeeklyVolume` + raw history and asks the model to re-derive what the app already computed. The "PUSH/HOLD/ADD/REMOVE" matrix in the prompt (`index.js:997-1002`) is a prose description of `progressionTarget()` — the model is asked to simulate the function instead of being handed its output. The live coach's `propose_next_target` and the set-row nudge are two independent sources of truth on the same screen.
2. **The data it gets is partly wrong.** Weekly volume is ~4× inflated (`analyzeWeeklyVolume` sums every set in the window; chat passes 28 days and labels it "last 4 weeks avg", `ai-coach-ui.js:1168-1180`; prompt cards use `slice(0,20)`, `:86`). 12 real chest sets/week shows as "Chest: 48 sets (high)" against `VOLUME_MRV: 22` → phantom overtraining diagnoses. No "today" (date, weekday, planned template) anywhere — `get_week_plan` returns `{days, restDays}` with no today marker (`coach-tools.js:1080-1085`). No current gym. Units inconsistent: chat normalizes, `get_exercise_history`/`get_prs` return raw, weekly review prints weights with **no unit** (`index.js:1861`), `coach-outcomes#maxWeightIn` compares raw across units (`:19-36`). No RPE, no injuries in digest/live. Context is attached only to turn 1 and replayed on reopen (`ai-coach-ui.js:516-527`, `:1536-1564`) — a thread continued two weeks later reasons from two-week-old data.
3. **~3,700 tokens of advisory doctrine that contradicts the code.** Prompt MEV/MRV 6-8/15-25 vs `config.js` 8/22; prompt plateau advice vs the 3-rung ladder; `detectPlateaus` still says "Try adding 5 lbs" (`training-insights.js:191`) — the opposite of rung 1. "Call list_templates before creating", "check get_week_plan before answering today", "deload = propose_session_adjustments, never edit templates" are requests, not constraints.
4. **Validators coerce or drop instead of rejecting, and some failures report success.** `normalizeExercise` (`coach-tools.js:331-348`): sets outside 1-10 → silently **3**, reps outside 1-50 → **10**; `equipment` never checked against the library; `category` enum only in the description. `applyPrescriptionFields` drops any `role/pattern/progression` not exactly matching (`movement-patterns.js:148-158`). `normalizeWeekTarget` drops out-of-range levers. `propose_session_adjustments` returns `{proposed:true}` for a nonexistent `templateId` (`index.js:1513-1516`) while the client drops the card — the "coach gave me a workout card but it never showed up" bug. `propose_swap` says "MUST pick equipment at the current gym" but `validateProposal` never checks (`coach-tools.js:1207`, `:1265-1270`). Executor exceptions → generic `'Tool failed'` (`index.js:1525-1528`). `create_workout_template` dedupes by slug suffix (`push_day_2`) — creates the near-duplicate the prompt warns about. `update_workout_template.addExercises` and `create_program.split` have no inner schema (`:254`, `:126-129`).
5. **Nothing is measured.** `coachHistory` stores question/response/usage/cards (`index.js:1565-1583`); thumbs stored. Not logged: the context block the model saw, tool inputs/outputs/errors, round count, latency. No eval harness, fixtures, or golden transcripts.

### 4.2 Phases

#### AP-15 — Give it the right data (S each; do all)

| | Change | Where |
|---|---|---|
| a | Weekly volume: divide by weeks in window (or pass one ISO week); rename `avgWeeklySets` | `ai-coach-ui.js:1168-1180`, `training-insights.js:93-121`, prompt cards `:86`, dashboard `:459` |
| b | `Today:` header line — date, weekday, planned template or rest, program week + target, deload flag, current gym (last workout location). `get_week_plan` returns `today` + `todayPlanned` | `buildTrainingContext` top; `coach-tools.js:1080-1085` |
| c | Normalize units in every server path; pass display unit into `makeToolExecutors({unit})` | `coach-tools.js:674, 1017`; `index.js:1861`; `coach-outcomes.js:19-36` |
| d | Live context: `_progression` verdict per exercise, program week/deload, `sessionLabel`, last-session top set | `coach-live.js:44-86` (overlaps AP-9) |
| e | Re-attach a fresh context block when a thread is reopened >24 h later or after a write that turn | `ai-coach-ui.js:1536-1564`, `:516-527` |
| f | Weekly review + review-seeded threads get profile/injuries/unit | `index.js:1877`; `ai-coach-ui.js:1567-1583` |
| g | Emit `set.rpe` when present | `ai-coach-ui.js:1283-1289` |
| h | **Shipped 2026-10-24** (`buildRecentThreadsContext` + `firstSentence` in `coach-context.js`; uses the first answer of each thread, includes weekly reviews, excludes the thread being continued, ~1600-char cap). **Recent conversations** (added 2026-10-23): a "what did we say last time" section with the last 5 thread questions, dates, and the first sentence of each answer, so follow-ups and recurring concerns carry across threads — a trainer remembers you asked about bench three weeks running. `coachHistory` is already fetched in the assembly path (`:508`); format one line per thread, cap ~400 tokens. | `ai-coach-ui.js` context assembly; `coach-context.js#buildRecentThreadsContext` (new, pure, tested) |
| i | **Root cause found and fixed 2026-10-24:** `completeWorkout` fires its save without awaiting; the summary modal's `hydratePriorComparison` → `loadAllWorkouts` started while the save was in flight and resolved *after* the save's `clearAllWorkoutsCache()`, re-pinning pre-workout history for 5 minutes — so the review answered from stale data. Fix: a generation counter in `data-manager.js` (a load that started before an invalidation never stores its result) + `settleWorkoutSaves()`, awaited by `askCoach` before reading history. Test: `workout-cache-race.test.js`. Original note follows. **Investigate** (bug-log): the post-workout "Review this session" chip may build context before the just-completed session is readable — specimen thread `thread_1789446779692_zyyck8` (2026-09-15) answered "No Push session shows as logged today." `clearAllWorkoutsCache()` does run on completion (`data-manager.js:189`), so suspect a save/chip race in `reviewSessionWithCoach` (`ai-coach-ui.js:353`) or a session never completed. An AP-20a trace of the context block settles it; until then, `await` the completion save before opening the coach. | `ai-coach-ui.js:353`, `workout-session.js` completion path |

#### AP-16 — Rules are the authority: verdicts block + `get_verdicts` (M)

> **As built (2026-10-24):** the verdicts live in a new pure module `js/core/features/coach-rules.js` (`computeVerdicts`, `formatVerdictsContext`) rather than in `coach-context.js`, because the server needs the same code. To mirror it, the rules it depends on had to become mirrorable too: `progression.js` and `session-intent.js` now import only mirrored siblings (`deriveProgramWeek` moved to `week-targets.js`, re-exported from `coach-context.js`), and the volume/deload rules moved from `training-insights.js` into `training-rules.js` (thresholds in `RULE_THRESHOLDS`, spread into `Config` — one copy). Six mirrors in `functions/` now: session-intent, progression, training-rules, progress-scoreboard, coach-rules (+ week-targets regenerated); parity enforced by `movement-patterns-mirror.test.js`. Server: `computeUserVerdicts` + tool `get_verdicts` in `coach-tools.js`; weekly review prepends the verdicts block. Prompt: the PUSH/HOLD/ADD/REMOVE matrix is replaced by the verdict contract (MEV/MRV prose untouched — AP-17). Verdicts cover today's planned workout, then the rest of the week plan (no plan → the three most recently used templates), max 18 exercises. Block size before/after: not measured yet — `?debug` now logs it per section (see field guide 2.8).

- Client: `coach-context.js#buildVerdictsContext` — for each exercise in today's/top templates: `progressionTarget()` → `action, rung, weight, reps`; `checkDeloadNeeded()`; `stallState` runs; per-muscle MRV headroom this week. Call from `ai-coach-ui.js:506`.
- Server: `functions/coach-rules.js` mirroring `progression.js` (same `sync-mirror` pattern as `coach-outcomes.js`), `computeVerdicts(userId)` → structured JSON; expose as tool **`get_verdicts`**; weekly review reads the same verdicts.
- Prompt: replace the PUSH/HOLD matrix with *"A `Rules verdicts` block is authoritative. Explain it; do not override it. If you believe a deviation is warranted, say 'The rule says X; I'd deviate because Y' explicitly."*
- While here (found reviewing the shipped AP-15 block — see field guide Lesson 2.4): concatenate `programBlock` + `intentBlock` directly after `todayLine` so the DELOAD instruction sits under the Today line, not below 30 workouts; and once verdicts are in the block, cut `RECENT_DETAIL_CAP` from 30 to 10–12 (`get_exercise_history` serves depth). Measure block size before/after and record it in the field guide.

#### AP-17 — Guards in code, not prose (M)

> **As built (2026-10-25):** guards are a new pure, mirrored module `js/core/features/coach-guards.js` (`deloadLock`, `progressionGuard`, `loadabilityGuard`, `programShapeIssues`, plus AP-18's `resolveEquipment`/`findNearDuplicate`/`toolError`); the executors in `coach-tools.js` load data once per turn (`loadCtx`) and call in. **Deload lock** on `update_workout_template`/`replace_day`/`create_workout_template` → `{error:{code:'locked'}}`; `override:true` requires `overrideReason` and writes a `coachOverrides` doc. **Progression guard** on template weights (setExercise, added exercises, replace_day/create inputs — only values the model sent, never carried-forward ones) and on `propose_next_target` (which also enforces the live deload target). **Loadability**: on-grid from any previously lifted top weight in `weightIncrement` steps; no history = allowed. **Program shape**: 4+ weeks without a deload is an error in `validateProgramInput` (create + adjust incl. a `weeks` change); identical training weeks and <2×/week for Chest/Back/Legs/Shoulders come back as `warnings[]` on the result. **Thresholds**: the prompt's MEV/MRV and "10–20 sets" lines are gone; the verdicts block states `Volume landmarks: MEV · MRV` from `RULE_THRESHOLDS`. `detectPlateaus`/dashboard already used the stall ladder since AP-8 — nothing left there. Found while testing: the body-part keyword fallback filed **Leg Press under Shoulders** and **Lateral raise under Back**; fixed by keyword order in `training-rules.js`.

- **Deload lock:** when the active program's current week `isDeloadTarget`, `update_workout_template`/`replace_day`/`create_workout_template` return `{error:{code:'locked', message:'Deload week — template edits are locked; use propose_session_adjustments', hint}}` unless `override:true` with a logged reason.
- **Progression guard:** `propose_next_target` and template `weight` reject a load above `progressionTarget().weight` when `stalled` (error names the rung and rule-derived target).
- **Loadability guard:** reject weights not reachable by `weightIncrement` steps (server mirror of `scaleLoadableWeight`).
- **Program shape check** in `validateProgramInput`: ≥4 weeks requires a deload target (error); split covering a muscle <2×/week or identical weeks → structured `warnings[]`.
- **Align thresholds:** delete MEV/MRV numbers from the prompt, inject `Config.VOLUME_MEV/MRV` into the context header; `detectPlateaus` (`:191`) and dashboard (`:491`) call `progressionTarget`.

#### AP-18 — Tool hygiene (M)

> **As built (2026-10-25):** `normalizeExercise` returns the exercise or `{error}` naming the field and the allowed range — absent fields still default (3×10), present-but-invalid is rejected; one bad exercise rejects the whole call. `normalizeWeekTarget` and the new `prescriptionFieldErrors` (movement-patterns) reject the same way. Schemas: one `EXERCISE_ITEM` (integer min/max, enums for role/pattern/progression) for create/replace/update.addExercises/session-adjustments, `SPLIT_SCHEMA` for create/adjust_program, enums for category/kind/goal/trustLevel/log_advice.type. Equipment: exact or Dice ≥ 0.85 → canonical library name, else error with the 3 nearest (`fuzzy-match.js` moved `data/` → `features/` and is mirrored); `propose_swap` checks against the **current gym's** equipment. `checkProposal` (executor) runs after `validateProposal`: session adjustments need a real, unarchived template (`not_found` instead of `{proposed:true}`). Structured errors: executors use `toolError`; the tool loop normalizes any string error to `invalid_input` and turns exceptions into `internal` (logged server-side). Near-duplicate: Jaccard ≥ 0.7 vs active templates → `near_duplicate` with `existing`, unless `kind:'variation'`. `list_templates` no longer writes; new scheduled `backfillTemplateUsage` (daily 09:00) persists the counts. The prompt gained one paragraph on what each error code means.

- **Reject, don't coerce:** `normalizeExercise`, `normalizeWeekTarget`, `applyPrescriptionFields` return `{error}` listing allowed values. The model learns the schema from the error and retries; nothing silently becomes 3×10.
- Real inner schemas for `addExercises` (both tools) and `split`; `enum` arrays for `category`, `goal`, `kind`, `role`, `pattern`, `progression`, `log_advice.type`.
- Validate `equipment` against the user's library (fuzzy ≥0.85 → canonical; else error with 3 nearest) in `normalizeExercise` and `propose_swap`.
- Verify `templateId` in `propose_session_adjustments` server-side; return error instead of `{proposed:true}`.
- Structured errors everywhere: `{error:{code:'not_found'|'invalid_input'|'locked'|'internal', message, hint}}`; real exception to logs, safe summary to the model.
- Dedupe guard in `create_workout_template`: Jaccard ≥0.7 on exercise sets vs active templates → `{error:'near_duplicate', existing:{templateId, name, overlap}}` unless `kind:'variation'`.
- Reads must not write: move `list_templates`' usageCount backfill (`coach-tools.js:727-753`) to a scheduled job.
- Tests: extend `coach-tools.test.js` with one rejection case per validator and the lock/guard paths.

#### AP-19 — Output contract (S)

Replace the format paragraph (`index.js:1004-1006`) with: **Verdict** (one line; rule-derived when a verdict exists) → **Because** (≤2 bullets citing the user's numbers) → **Do** (exact weight×reps or one action) → optional **Watch**. Cap ~120 words chat / ~40 live. One recommendation unless a plan is asked for. Give live mode its own ~300-token system prompt (the base prompt's "THE DATA YOU RECEIVE INCLUDES…" list is false in live mode, `:952-963`, `:1463`). Speculative but likely cheap win: route obvious lookups ("what's my bench PR") to Sonnet; xhigh Opus on every turn is where latency/cost go.

#### AP-20 — Measure it: traces + eval loop (M/L)

- **20a Traces (S, do early):** per turn write `coachTraces/{threadId}/{turn}`: context text (or hash + size), tool calls `{name, input, output, is_error, ms}`, rounds, model, tokens, latency. Admin-only read. Every "stupid" answer becomes a reproducible case.
- **20b Fixtures (M):** 10-20 anonymized snapshots of your real shapes (workouts, templates, equipment, program, settings) under `tests/fixtures/coach-scenarios/`. Scenarios: stalled lift at rung 1/2/3; deload week + "should I go heavier?"; low-volume muscle; "what today?" on a rest day; kg user; injury listed + exercise that loads it; program build; rewrite pull day; machine taken in live mode; weekly review.
- **20c Runner (M):** `scripts/coach-eval.mjs` — extract `buildTrainingContext` to a pure module first (it reads `AppState` today), build context per scenario, call the API with the real prompt + tools, execute tools against the in-memory Firestore mock, capture the trace.
- **20d Assertions (S):** no write tool on a question-form prompt; `propose_session_adjustments` (not `update_*`) when deload flag set; every prescribed weight loadable; equipment exists at gym; injured pattern not programmed; word count within contract; `log_advice` called when a number is prescribed; verdict quoted when present.
- **20e Rubric (S):** Sonnet grades 1-5 on grounded-in-numbers / one clear recommendation / explains why / consistent with verdict; store scores; diff against previous run. Gate prompt/tool PRs on `npm run eval:coach`.

### 4.3 How agents actually work — a primer against this codebase

**The loop is the whole thing.** `coachChatStream` does: assemble context → call model → if `stop_reason === 'tool_use'`, run the tool, append `tool_result`, call again → repeat ≤12 → stream text. The model has no memory between calls; each round it sees *everything again* — system prompt, your turn-1 context, every prior tool call and result. Quality is bounded by what's in that message array. There is nothing else.

**Context beats prose.** The model can only reason about data it's given. Your prompt tells it to "HOLD when reps dropped" — to apply that it must find the exercise in 30 workouts, filter warmups, normalize units, compare three sessions, and remember the rule. Your code already did that in `progressionTarget()` and produced `{action:'chase-rep', rung:1, weight:190, reps:9}`. Hand the model that object and 1,600 tokens of doctrine shrink to one line: *"Explain the verdict; don't override it."* Every rule you can compute is a rule you should compute and inject. The prompt should carry only what you can't code: tone, how to handle ambiguity, what to ask the user.

**Tools are an API contract, and the model is a client that reads the docs once.** `description` and `input_schema` are the only things the model knows about `create_program`. If `split` is `{type:'object'}` with no properties, it guesses. If the schema says `category: string` and the description says "One of: Push, Pull…", the API won't enforce it — an `enum` would. Read tools let the model look before acting; write tools should *refuse* when preconditions fail. The best tool you have is `set_week_plan` (`coach-tools.js:1087-1125`): it validates against real data and returns a specific error the model can act on. Make every write tool look like that.

**Validation must reject, never drop.** `normalizeExercise` turning `sets: 12` into `sets: 3` tells the model "success." The model tells the user "I set 12 sets"; the template says 3. Every silent coercion is a lie the model repeats confidently. `{error:'sets must be 1-10 (got 12)'}` costs one extra round and produces a correct template. Same for dropped `role`/`rpeTarget`/`setDelta` — the model designed a six-week wave, your validator kept one percentage, nobody was told.

**Draw the rules/judgment line explicitly.** Rules: anything with a number and a threshold — progression, deload timing, MRV, loadable weights, equipment existence, injury→pattern exclusion, dedupe. These run in code, identically, for free, and are unit-testable. Model: interpreting the user's words, choosing *which* verdict to lead with, explaining trade-offs, writing the sentence, handling "my knee feels weird." The model should receive verdicts as facts and should not be *able* to write a template during a deload — not be *asked* not to. When you want it to be able to deviate, make deviation an explicit, logged tool argument (`override:true, reason`) so it's visible and gradable.

**Evaluate like software.** Right now you can't tell whether a bad answer came from bad data (the 4× volume bug), a missing fact (no "today"), a tool failure the model never saw, or the model itself. Log the trace. Build 15 scenarios from your real data. Run the real loop against them on every prompt or tool change. Assert the cheap things in code; let a grader model score the rest. "The coach feels stupid" becomes "scenario 7 regressed on assertion 3 in commit X." That is the only way prompt work stops being guesswork.

**What *not* to do:** don't add more doctrine to the prompt; don't add a tool for every edge case (three "change this week" tools already need 300 words of prose to disambiguate — the boundary belongs in the tool, not the prompt); don't tune temperature or effort before fixing the inputs.

**Companion:** `docs/agent-field-guide.md` turns this section into a lesson-by-lesson track — each lesson maps to the AP phases above, traces a real turn through the loop, and ends with a check you can run.

---

## 4b. Knowing you're progressing — the scoreboard

**Context for the coding agent:** PR logic lives in `js/core/features/pr-tracker.js`; dashboard metric cards in `js/core/features/metrics/aggregators.js` and `js/core/ui/dashboard-ui.js`; unit helpers in `js/core/utils/weight-calculations.js`; template prescription fields (`role`, `pattern`, `repRange`) from CP-1 in `js/core/features/movement-patterns.js`; recovery-session test `isRecoveryWorkout()` from AP-6; stall ladder `stallState()`/`progressionTarget()` in `progression.js`. Weekly review runs server-side (`functions/index.js` ~`:1861`) and must be able to compute the same object — follow the `sync-mirror` pattern used for `coach-outcomes.js`.

### 4b.1 Why this exists

Week-to-week strength is noisy (sleep, order of exercises, which pin). Judging progress by "did the number on machine X go up this week" either fixates training on a few machines or reads normal noise as failure. The unit of progress for muscle + strength is ~4 weeks, on a small set of primary lifts, measured as estimated 1RM. The September data analysis showed exactly this: unit-normalized loads were climbing on most lifts while two posterior-chain movements were flat and four hip-dominant machines sat unused — invisible when you watch individual machine weights.

### 4b.2 Definition

- **Primaries:** exercises with `role:'primary'` in active templates; fallback when none are tagged: top exercise by sets per movement pattern (squat, hinge, horizontal push, vertical push, horizontal pull, vertical pull), max 6.
- **e1RM:** reuse the existing helper if `pr-tracker.js`/`weight-calculations.js` has one; otherwise Epley `w × (1 + r/30)` on working sets with `reps ≤ 12`, unit-normalized to the display unit, plate-relative weights resolved to total load, warmups and `isRecoveryWorkout()` sessions excluded.
- **Trend per primary:** `now = best e1RM in the last 28 days`, `prev = best e1RM in the 28 days before that` → `delta`, `trend: 'up' | 'flat' | 'down'` (`flat` = within ±2.5% or one increment, whichever is larger). Also `repPR: {weight, reps, date}` when the most recent session set a rep record at a previously used weight, and `rung` from `stallState()`.
- **Patterns:** sets this ISO week per pattern (not per muscle — the app already has per-muscle volume) vs `Config.VOLUME_MEV/MRV`, status `under | in-range | over`, plus `lastTrained` date.
- **Headline:** one generated string chosen by precedence: any primary `down` 2 windows running → that; else any pattern `under` for 2+ weeks → that; else count of primaries `up` ("4 of 6 primaries up over 4 weeks").

### 4b.3 AP-21 — Progress scoreboard (M)

> **As built (2026-10-24):** `progress-scoreboard.js` per the definition, with these deliberate differences — (1) the card sits **under For Today**, not at the top: the For-Today hero stays the page's one primary action (one-tap start); (2) user-facing copy says **"main lifts"**, not "primaries" (Settings row + sheet "Main lifts", also reachable from the card's *Edit* link); (3) `trend` adds `new` (this window only) and `idle` (not trained this window) so missing data never reads as `down`; (4) pattern sets use **rolling 7-day windows**, not the ISO week, so Monday doesn't show every pattern `under`, and a window containing a deload session reads `recovery` and never counts toward "under for 2 weeks"; "under for 2 weeks" also requires history that reaches back two weeks; (5) e1RM uses `set.weight` (already the total load on base-weight machines), working + failure sets only, 1–12 reps. The picker writes `role:'primary'`; un-picking a compound in slot 0–1 pins `role:'secondary'` (inference would call it primary again). Pattern threshold is its own knob, `RULE_THRESHOLDS.PATTERN_TARGET_SETS` (8, decided 2026-10-24 — kept at 8 rather than raised, since a higher floor flags *more* gaps), separate from per-muscle `VOLUME_MEV`.

- New pure module `js/core/features/progress-scoreboard.js`: `buildScoreboard({ workouts, templates, unit, today, config }) → { primaries:[{ name, pattern, e1rmNow, e1rmPrev, delta, trend, repPR, rung }], patterns:[{ pattern, setsThisWeek, mev, mrv, status, lastTrained }], headline, window:{ from, to } }`. No `AppState` reads — the function takes data in so the server mirror and the eval runner (AP-20c) can call it.
- Dashboard: new card at the **top** — headline line, then one row per primary (`name · e1RM now · ▲/●/▼ delta · rep PR chip · rung chip when > 0`), then a compact pattern strip. Tap a primary → existing exercise detail. `?debug` appends the window dates.
- Weekly review: the server mirror computes the same object and the review *quotes it* instead of re-deriving from raw sessions.
- Coach: `buildVerdictsContext` (AP-16) includes `scoreboard.headline` and the per-primary rows; the prompt rule is the same as for verdicts — explain, don't override.
- Settings: "Primary lifts" picker (multi-select from exercises in active templates) writing `role:'primary'` on the template exercise, so the fallback heuristic is a default, not the only path.

Tests (`tests/unit/progress-scoreboard.test.js`, new): Epley on a known set; kg/lbs mix normalizes; plate-relative resolves to total; recovery sessions excluded from both windows; `flat` band; `repPR` only when weight was previously used; fallback primary selection covers each pattern once; headline precedence; empty history → `primaries: []`, no throw.

Acceptance: the dashboard answers "am I progressing?" in one glance without opening a single exercise; the weekly review and the coach quote the same numbers the card shows; a deload week does not register as a `down` trend.

### 4b.4 AP-22 — Fatigue signal: RPE-at-load and readiness (S/M)

> **As built (2026-10-24), phase 1 only:** `buildExerciseSessions` carries `topRpe`/`rpeLogged`; `fatigueState` in `progression.js` exactly as specified (null under `minSessions` rated sessions). `readinessState` and `fatigueSignals` live in `training-rules.js` (workout-level, mirrored); `checkDeloadNeeded` now returns `reasons[]`, `fatigue[]`, `readinessLow` — `needed` is unchanged. Reported in: the verdict line (`· fatigue: RPE 7.5→8.5→9 at 185 over 3 sessions — target unchanged…`), the deload-check line ("early fatigue signs"), a new readiness line, the scoreboard (`primary.fatigue` → dashboard "Effort ↑" chip), and a dashboard insight that outranks the low-volume headline. Prompt: one line telling the model to quote the signal and hold / pull the deload forward. Tests: `tests/unit/fatigue-signal.test.js`. **Not done:** the logging-cost UX decision (RPE prompt only on the heaviest set or only on primaries) — still every set when `trackRpe` is on; phase 2 (changing targets) stays gated on AP-20 fixtures.

**Why:** every rule today is a *lagging* indicator — it fires after the weight or reps drop. You log two *leading* indicators, `set.rpe` (6–10, opt-in via `settings.trackRpe`, off by default) and `workout.readiness.score` (1–5), and neither feeds any rule; only the prompt mentions them (`index.js` "Auto-regulate on readiness…"). The question "when should I back down?" is best answered by *same load, effort climbing* — three sessions at 185 where the top set went RPE 7.5 → 8.5 → 9 is fatigue a week before 185×6 becomes 185×3. The specimen thread (field guide 1.4b) is exactly that case, caught late.

**Context for the coding agent:** `buildExerciseSessions` (`progression.js:57`) returns `{ date, topWeight, topReps, maxReps }` per session; it does not carry RPE. `stallState`/`progressionTarget` are pure and already take an `intent`. Readiness lives on the workout doc (`w.readiness.score`, `.note`). `Config.PLATEAU_MIN_SESSIONS = 3`. The verdicts block is AP-16; the scoreboard is AP-21; the live context already prints a per-exercise verdict line (`coach-live.js#progressionVerdict`).

- **Data:** extend `buildExerciseSessions` output with `topRpe` (max `rpe` among working sets at `topWeight`, `null` when none logged) and `rpeLogged` (bool). No behaviour change for existing callers.
- **New pure function** in `progression.js`: `fatigueState(sessions, { minSessions = Config.PLATEAU_MIN_SESSIONS, rpeRise = 1, inc })` → `null` when fewer than `minSessions` recent sessions have `topRpe` (the rule is inert until RPE is logged — never a false signal); else `{ fatigued, load, rpeTrend:[…oldest→newest], repsTrend, reason }`. `fatigued = true` when the last `minSessions` sessions sit at the same top load (within one `inc`) with same-or-fewer `topReps` and `topRpe` rose by ≥ `rpeRise` end to end, or when the latest `topRpe ≥ 9.5` at a load previously done at ≤ 8.
- **Readiness:** `readinessState(workouts, { days = 10 })` → `{ low: count of sessions with score ≤ 2, of: n, avg }`. `low ≥ 3` in the window = `readinessLow`.
- **Advisory first, then promote.** Phase 1: `fatigued`/`readinessLow` are *reported* — in the verdict line (`fatigue: RPE 7.5→9 at 185 over 3 sessions`), on the scoreboard rung chip (AP-21), in the dashboard insight ("Effort creeping on Smith bench at 185 — consider pulling the deload forward"), and in `checkDeloadNeeded`'s reasons. They do **not** change `progressionTarget` output yet. Phase 2 (after AP-20 fixtures include two fatigue scenarios and the grader agrees): when `fatigued && rung ≥ 1`, `progressionTarget` skips to the back-off rung early; when `fatigued` on ≥ 2 primaries or `readinessLow`, `checkDeloadNeeded` recommends the deload a week early with `source:'fatigue'`.
- **Logging cost:** the rule needs RPE on the top set of primaries, not every set. UX option (decide once): when `trackRpe` is on, prompt RPE only on the heaviest completed working set per exercise, or only on `role:'primary'` exercises. Either keeps logging to one tap per lift.
- **Server mirror:** `fatigueState` joins `coach-rules.js` (AP-16's mirror) so the weekly review and `get_verdicts` report it.

Tests (`progression.test.js`): `topRpe` picks the max at top load and is `null` when no RPE; `fatigueState` returns `null` under `minSessions`; rising RPE at constant load → `fatigued`; rising RPE with rising load → not fatigued (that's progress); falling reps at rising RPE → fatigued; a deload session in the window is excluded (via `buildExerciseSessions`); `readinessState` counts ≤ 2 only. `training-insights.test.js`: `checkDeloadNeeded` lists the fatigue reason and does not auto-recommend in phase 1.

Acceptance (phase 1): with `trackRpe` on and three sessions at the same load with RPE 7.5/8.5/9 on dev, the verdict line, scoreboard chip, and dashboard insight all show the fatigue signal, the set-row target is unchanged, and the coach — asked "should I go heavier?" — quotes the signal and recommends holding or pulling the deload forward.

---

## 5. Tracking — so the next report comes with data

**`docs/bug-log.md`** (create). One entry per observation, this template:

```
### YYYY-MM-DD · <area: prefill | equipment | progression | coach> · <one-line symptom>
- Build: <SW version / commit>   Path: <hero | workouts tab | history repeat | resume | mid-session replace/add/equip>
- Expected / Saw:
- Trace: <paste autofill_trace / autofill_mismatch / coachTraces id from the Error Log page>
- Screenshot of ?debug overlay (if prefill)
- Status: open | fixed in <commit> | not a bug
```

**Instrumentation delivered by the phases above:** `autofill_trace` + `autofill_mismatch` + `?debug` overlay (AP-2); `tier` on the last-session card (AP-3); `sessionIntent` on every workout doc (AP-6) — the history view can show it; `coachTraces` (AP-20a).

**Weekly habit (10 min):** open the Error Log page, skim `autofill_*` and `coachTraces` for the week, move anything surprising into `bug-log.md`. This is what makes the fixes stick.

---

## 6. Phase index

| Phase | Issue | Size | Depends on | One-line |
|---|---|---|---|---|
| AP-1 | 1 | S/M | — | merge-seed + generation guard + trigger param |
| AP-2 | 1 | S | AP-1 | `autofill_trace`, `autofill_mismatch`, `?debug` overlay |
| AP-3 | 1 | M | — | id-aware, case-insensitive lookup returning `tier`; no null cache |
| AP-4 | 1 | S | — | plate display + unit toggle fixes |
| AP-5 | 1 | S | AP-1 | explicit None, gym-change re-autofill, `exerciseUnits` rekey |
| AP-6 | 3 | S/M | — | `session-intent.js`, computed at start/resume/freestyle, stored on savedData |
| AP-7 | 3 | M | AP-6, AP-1 | progression + seeder consume intent; drop `nextTargetFor`; no double-scale |
| AP-8 | 3 | S/M | AP-6 | one plateau engine; gate dashboard insights |
| AP-9 | 3/4 | S | AP-6 | coach context/live/prompt/tool know the deload |
| AP-10 | 3 | S | AP-6 | manual deload toggle |
| AP-11 | 2 | M | — | picker: sticky Add row first, cache-first open, no navigate-away, delete dead sheet |
| AP-12 | 2 | M | AP-11 | `equipment-create.js` planner, dice dedupe, token search, unit at create, whitelist fix |
| AP-13 | 2 | M | AP-12 | all create paths through the planner; one name composer |
| AP-14 | 2 | S | AP-12 | optional in-place brand/type/unit expand; catalog link chip |
| AP-15 | 4 | S | — | volume math, Today line, units, live context, fresh context on reopen, RPE |
| AP-16 | 4 | M | AP-6 | verdicts block + server `get_verdicts` |
| AP-17 | 4 | M | AP-16 | deload lock, progression/loadability guards, program shape check, thresholds |
| AP-18 | 4 | M | — | reject-not-coerce, enums/inner schemas, equipment validation, structured errors, dedupe |
| AP-19 | 4 | S | — | output contract; live-specific prompt; cheap-question routing |
| AP-20 | 4 | M/L | AP-15 | traces (a), fixtures (b), runner (c), assertions (d), rubric (e) |
| AP-21 | 4b | M | AP-6 (recovery exclusion); pairs with AP-16 | `progress-scoreboard.js`: rolling 4-wk e1RM per primary, rep PRs, pattern coverage; dashboard card; weekly review + coach quote it |
| AP-22 | 4b | S/M | AP-21 (primaries, rung chip), AP-16 (verdict line); phase 2 gated on AP-20 fixtures | `fatigueState` (RPE-at-load) + `readinessState`: leading fatigue indicators reported in verdicts, scoreboard, dashboard, `checkDeloadNeeded`; promoted to change targets only after eval |
