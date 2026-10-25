# Big Surf — Action Plan, October 2026

*Written 2026-10-23 from a source-verified review of the working tree at commit `b3111fc`. Every claim below cites a file and line in that tree; line numbers drift as you edit, so search for the function name if a number is off. Phases are tagged **AP-n** and sized S/M/L. One phase = one PR, dev-deploy gate, same as the CP-n workstream.*

*Updated 2026-10-23 (evening): added §4.0 (what the coach is for), §4b / AP-21 (progress scoreboard), AP-22 (fatigue signal from RPE-at-load + readiness), AP-15h/i, and a pointer to `docs/agent-field-guide.md`, the companion learning track that uses the coach as its case study.*

*Status 2026-10-23 evening: AP-1, AP-2, AP-6, AP-7, AP-8, AP-10 (`5ca4af6`) and AP-9, AP-15 a–g (`7dc3319`) are on `main`; coach unit tests green (130). Not yet on dev/prod.*

*Status 2026-10-25 (night): AP-20b–e, SH-0, SH-1, SH-2a and SH-2b built (1226 tests green) — not deployed; the eval's first API run is pending. Earlier: every AP phase except AP-20b–e is built. Everything through `9852812` is on prod (hosting, functions, rules). The shell plan is folded in as §7 (SH-n). What's left is ▶ The one queue below.* *Status 2026-10-25: AP-19, AP-20a, AP-23 and AP-24 deployed (functions, dev, prod; firestore rules pending). AP-22 phase 2 + the heaviest-set RPE prompt built (1172 green). Earlier: AP-15 h–i, AP-16, AP-21 and AP-22 phase 1 committed; full suite green (1062), lint at baseline, design audit strict ok. Functions deployed (one project — live for dev and prod clients; backward compatible with the old client). Hosting on **dev** only; promote to prod after verifying. "As built" notes under each phase record where the build differs from the plan text.*

*2026-10-25: §4.0 rewritten around how Kevin trains (plan → execute → renegotiate); AP-19 gains a planning contract; added §4c / AP-23 (planner tools + live gaps) and §4d / AP-24 (Block page).*

*Status 2026-10-25: AP-17 and AP-18 implemented (1099 tests green, lint at baseline, design audit strict ok). Not yet deployed — functions carry nearly all of it.*

## ▶ The one queue (2026-10-25) — everything still open, in order

**This is the only execution plan.** It replaces the standalone shell draft (`ux-shell-plan-2026-10.md`, folded into §7) and the open leftovers of the July UX plan (`ux-overhaul-plan-2026-07.md` — its unchecked boxes are stale; what's still open was verified against the code and is listed here). Business/launch work (accounts, legal, stores, pricing) stays in `launch-roadmap.md`; its *code* blockers are item 11 below. Finished phases keep their "As built" notes in their sections; when an item ships, tick it here and add the note there. New work gets a row here — not a new plan file.

| # | Item | Size | What / why | Detail |
|---|---|---|---|---|
| 1 | **SH-0 HUD ✅ built — then one phone session** | S + 1 evening | Build the `?debug` shell HUD + `shell_snapshot`. Then, on the phone (standalone, `?debug`, build = latest `main`): the shell walk-through **and** the acceptance checks nothing but the phone can do — AP-22 (three sessions at one load with rising RPE → early back-off; "a week early" deload), AP-23 ("last week was hard" → one card, the week lighter, Block page shows the override; "replace back extension" names the engine's top choice; the first program asks for main lifts), AP-24 (next week's Block targets = what the set rows seed). Findings → `docs/ux-shell-audit-2026-10.md` + `docs/bug-log.md`. | §7 SH-0; AP-22/23/24 acceptance |
| 2 | **SH-2a stop the bleeding** ✅ | S | `overscroll-behavior: contain` on every sheet body, `touch-action: none` on backdrops/handles/headers, one `lockPage()` counter (modals + every sheet + navigation teardown), 44 px hit areas on back/close. Fixes all three 10/25 complaints on the existing chrome. | §7 SH-2a |
| 3 | **AP-20b–e coach eval loop** ✅ built — first live run + baseline pending (needs `ANTHROPIC_API_KEY`) | M/L | Fixtures from real data → runner (extract `buildTrainingContext` pure first) → code assertions → Sonnet rubric; `npm run eval:coach` gates prompt/tool PRs. Until this exists every coach change is guesswork — the traces (20a) are already recording. | §4.2 AP-20 |
| 4 | **SH-1 inventory** ✅ **+ SH-5 budgets** (budgets ✅ in `shell-audit.js`; design-audit merge, CLAUDE.md rules, phone checklist still open) | S/M | `scripts/shell-audit.js` (agent task), then design-audit budgets at today's counts + CLAUDE.md rules + the 8-line phone checklist. | §7 SH-1, SH-5 |
| 5 | **SH-2b sheet primitive** ✅ **+ SH-3a equipment sheet** | M | `sheet.js`/`sheet.css`; move `add-exercise-modal`/`add-location-modal` out of `.app-container` before using `inert`; equipment sheet swaps chrome only. | §7 SH-2b, SH-3a |
| 6 | **SH-3b migrate the other overlays** | M/L | ~11 overlays, one PR each or by file, CSS deleted as each lands. Includes equipment detail's "+ Assign exercise" (still a full-page swap, `assignExerciseToEquipment`) → a sheet like identity/bw/uf. | §7 SH-3 |
| 7 | **SH-4 header primitive** | S/M | `.page-header` the only sticky header; inset in two files; `.d-back` (5 detail UIs) and `.detail-page-header__back` fold into `.page-header__back`. | §7 SH-4 |
| 8 | **SH-6 one back system + back gesture** | M | First the July plan's unfinished "one back system" (verified open: `MAX_STACK_SIZE` still 5, no top-dedupe; sections shown by direct `.hidden` in workout-session, exercise-manager, dashboard, metric-detail; fixed-destination backs in equipment-library, metric-detail, settings; `_libraryReturnContext` still live, and quick-edit's "Full details" never sets it), then `pushState`/`popstate`. | §7 SH-6 |
| 9 | **Persona re-review** | S | Marcus + Sam on dev (test account), scored against the 10/25 complaints + checklist. | §7.3 |
| 10 | **Small leftovers** (batch) | S each | (a) **Gym-availability copy** — "Possible here" / "Not mapped here yet" still confuse (Kevin, 07-03; `template-selection.js` pill, `equipment-planner.js` badges). (b) **Cardio "Conditioning" line** on Progress (sessions + minutes this week) — the July decision, never built. (c) Body-weight entry drops an unparseable height silently → say so. (d) Dead CSS `#template-selection-modal` (`modals.css`). | July plan items, re-verified |
| 11 | **Launch code blockers** (from `launch-roadmap.md`) | M each | (a) **Offline:** Firestore persistence not enabled (`firebase-config.js` is plain `getFirestore`) — gyms have bad signal. (b) **Account deletion** (Apple requirement): "Delete all data" skips the Auth user, the `users/{uid}` root doc, Storage, `programs`, `coachAdvice`, `stats/personalRecords`, legacy `templates`. (c) **Data export:** JSON covers workouts/templates/equipment only — not locations, custom exercises, overrides, measurements, coach history, programs, PRs, settings. | `launch-roadmap.md` §2, §4 |
| 12 | **Labels — LB-0…LB-4** (`docs/exercise-labels-audit-2026-10.md`) | S/M each | One taxonomy, one classifier. Five label systems and four name regexes disagree; `pattern` is stripped on read and has no UI; the scoreboard infers from the name alone. **LB-1 alone fixes "Hinge 0" (replaces AU-13):** equipment-aware `inferPattern` so the 45° back extension is a hinge. LB-3 unifies body parts (calves/abs no longer dropped from the dashboard; picker reaches Glutes/Lower Back). LB-5 (catalog patterns) deferred. Plus a 20-minute data-fix list (§5b). | `exercise-labels-audit-2026-10.md` §5 |

**Deferred — needs a decision before it's queued:** "Edit form video" from the active-workout exercise menu (new feature on the riskiest surface); CP-1b template-editor UI for role / rep range (`coach-periodization-plan.md`); proactive adherence reflow, which gates stall rung 3 (Marcus punch list); AP-22's RPE on sets other than the heaviest (decided against, 10/25).

---

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

### Recommended order *(historical — the original October sequence; superseded by ▶ The one queue above)*

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
Then     AP-19 (both contracts) → AP-20a → **AP-23 → AP-24** (the planner's tools, then the page to see the plan) → AP-22 phase 2 → AP-4/5/13/14/20b-e as time allows.
```

### Before you start (30 minutes, no code)

1. *(Done 2026-10-25: `.gitattributes` `* text=auto eol=lf` — the index was already LF; working copies re-checked-out as LF; `.prettierrc` `endOfLine: lf`, VS Code `files.eol`.)* **Working tree has 70 files "modified" by line endings only.** `git diff --ignore-cr-at-eol --stat` is empty; `git status` shows 70 files. `.prettierrc` / `.vscode/settings.json` changed (likely `endOfLine`). Decide once: add a `.gitattributes` (`* text=auto eol=crlf` to match the repo) or `git add --renormalize .` and commit, so every PR diff isn't polluted with whole-file churn.
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

> **As built (2026-10-25, with `9ec3198`):** id match + case-insensitive equipment landed in `9ec3198`; this pass added trim/lowercase exercise-name matching, `tier` and `cacheHit` on the result (cache hits return a copy), D9 (`loadAllWorkouts(state, {throwOnError:true})` — a failed read is never cached as "no history"), the card's "from X" following the matcher (`_lastSessionOtherMachine`, so an id-matched renamed machine doesn't say "from Old Name"), and tier in `autofill_trace` + the `?debug` overlay.

In `data-manager.js`:
- Signature `getLastSessionDefaults(exerciseName, equipment, location, equipmentId = null)`; include `equipmentId` in `cacheKey`.
- Exercise compare: trim + lowercase. Equipment compare: `(equipmentId && exEquipId === equipmentId) || (equipment && exEquipment && norm(equipment) === norm(exEquipment))` where `exEquipId = exData.equipmentId || originalAtIdx?.equipmentId || null`.
- Return `tier: 'exact'|'equipment'|'location'|'name'` alongside the existing fields; return `cacheHit`.
- D9: do not cache `null` when `loadAllWorkouts` returned `[]` due to error (have it rethrow or return a sentinel), or cache with a short TTL.

In `active-workout-ui.js:4040`: pass `savedEx?.equipmentId || exercise.equipmentId`. Use `tier` on the card ("from <other machine>" only when tier ≠ exact) and in AP-2's trace.

Tests (`tests/unit/last-session-defaults.test.js`, new): tier precedence; equipment compare case/whitespace-insensitive (**fails today**); matches by `equipmentId` when name differs (**fails today**); `originalWorkout[idx]` ignored when slot name differs; skips today/cancelled/uncompleted; plate-relative weights; no `null` cache on fetch failure; cache key includes location+equipment.

#### AP-4 — Plate/unit display (S) — fixes D6, D7

> **As built (2026-10-25):** `plateRelativeDisplay(set, baseWeight)` in `set-seeding.js` (a seeded `_plateWeight` row shows its plates; typed-this-session shows as typed; legacy totals lose the base). `awToggleUnit` converts `_plateWeight` with the total (shared `convertSetsUnit`) and keeps autofilled numbers in the placeholder. Tests in `set-seeding.test.js` (no separate `set-row-display.test.js`).

- `:1105`: `else if (!set._userEdited) rawForDisplay = (typeof set._plateWeight === 'number') ? set._plateWeight : Math.max(0, rawForDisplay - baseWeight);`
- `awToggleUnit`: convert `_plateWeight` alongside `weight`; only write `input.value` for `_userEdited || completed` sets, update `placeholder` for the rest.
- Export `plateRelativeDisplay(set, baseWeight)` from lines 1102-1106 and test it (`tests/unit/set-row-display.test.js`).

#### AP-5 — Small ones (S) — fixes D5, D8, D10

> **As built (2026-10-25):** D5 `equipmentExplicitNone` on the saved exercise gates both template-equipment copy and history adoption; adoption sets `equipmentId` with the name. D8 `refreshWorkoutForGym()` (workout-session.js) on all three gym-change paths: clear the last-session cache, `renderAll()` (index kept), `loadAutofillForAllExercises({trigger:'location', reseed:true})` — note a reseed re-derives untouched rows, so a non-deload hero adjustment (e.g. +5%) on untouched rows is re-seeded from history, same as an equipment change. D10 `reindexAfterDelete()` for `savedData.exercises` and `exerciseUnits`; in-flight autofills for shifted slots are voided. Also §3.4 (i): with no history anywhere the rows seed from the template `weight` (deload-scaled, ↓) — `defaultWeight` was only ever set by manual entry, so template weights never reached a live workout; the hero adjustment no longer scales `ex.weight` when autofill applied the deload. §3.4 (ii): resume keeps `defaultReps`, `category`, `_rpeTarget`.

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

> **As built (2026-10-25, with `9ec3198`):** the search field + an add slot sit in one sticky head (`.aw-equip-head`). The slot is: nothing (exact owned match is the first row below), **Use "X"** + "Add … as a new machine" (Dice ≥ 0.75), or **Add "X" at Gym** (one tap: create → tag gym → link exercise → set unit → select → close → toast; no gym → created anyway with a **Set gym** toast action). The sheet always opens instantly (cache or empty) and refreshes behind. The search field auto-focuses **only when nothing is linked to the exercise yet** — with machines to tap, the keyboard would just hide them. Footer is "Done" only (**correction 10/25, bf9877a:** with an empty search the slot now shows an always-visible "Add a new machine at <gym>" row — hiding the add until you typed removed the visible door that 9ec3198 had); catalog browsing is the last row, "Browse by body part", passing the query as `initialSearch`; quick-add hides its own custom form when opened from a picker. Deleted: `awGoToEquipmentLibrary`, the separate New-machine form (`awQuickAddEquipment`/`awSaveNewEquipment`/type/keydown/`guessEquipmentType`), `awCreateEquipmentFromSearch`, `awSharedCreateEquipmentFromSearch`; `window-wiring.test.js` asserts they stay gone. The shared (template-editor) sheet uses the same slot.

- `awOpenEquipmentSheet`: render from cache first, refetch after, focus input synchronously.
- `buildEquipListHTML`: sticky first row (Create/Use-existing) via new `inlineAddRowHTML`; Create requires ≥2 chars; move Create out of trailing position.
- Replace footer "Browse catalog" with the bottom "Browse by body part" row; pass `initialSearch` (extend `openQuickAddSheet(gymName, { onDone, initialSearch })`; seed `quickAddState.search`; omit `customHTML` when `onDone` set).
- Delete `awGoToEquipmentLibrary` (`:2569-2581`); retarget `:2544-2546`; no-gym → Add row + "Set gym" toast.
- Delete `:2977-3101` (dead sheet).
- New handlers rendered from this file's templates get **same-file window wiring** at `:4300+` (`window-wiring.test.js`).

Acceptance: from an exercise, typing a machine name and tapping once creates it at the current gym, links the exercise, selects it, closes the sheet. No path leaves the workout page.

#### AP-12 — `equipment-create.js` planner + dedupe + unit (M)

> **As built (2026-10-25):** `js/core/data/equipment-create.js`: `planInlineEquipment`, `matchOwnedEquipment` (exact = name ignoring case/spacing/separators; similar = Dice ≥ 0.75 — the UI asks, the writer never auto-merges a merely similar name), `parseEquipmentName` + `knownBrands` (catalog + owned, longest first; moved out of the manager), `BASE_WEIGHT_SUGGESTIONS`/`suggestedBaseWeight` per unit (kept in this module rather than config.js — it's create logic). Selectorized inferred. `saveEquipment` keeps `preferredUnit` + `createdVia`. Instead of a separate `createEquipmentFromPlan`, `getOrCreateEquipment` itself takes `knownEquipment` (no pre-read), inserts the new doc into the cache instead of nulling it, and tags the requested gym/exercise onto an existing match. `awSelectEquipment` switches the exercise to the machine's `preferredUnit` and converts its rows. Add row and catalog rows are busy-guarded.

- New pure module `js/core/data/equipment-create.js`: `planInlineEquipment({ query, exerciseName, gymName, unit, brand, type, owned, catalog }) → { action:'use-existing'|'create', existing?, doc? }`. Brand detection against **catalog brand names** (`awCatalog().map(b => b.name)`) and owned brands (move `parseEquipmentName` out of `firebase-workout-manager.js:87` into this module and import it back). `name = composeEquipmentName({brand, function: query})` when brand found, else trimmed query. `equipmentType = type || inferEquipmentType(query)`; add `selectorized|stack|pin loaded → 'Selectorized'`. `baseWeight = BASE_WEIGHT_SUGGESTIONS[type] || 0` (move the constant from `equipment-library-ui.js:3797` to `config.js`). Export `matchesAllTokens(hay, query)` and use it in `applySearch` and as a rank-3 fallback in `searchCatalogMachines`.
- `saveEquipment` whitelist: add `preferredUnit` and `createdVia` (one-liners; also unbreaks `machine-id.js:157`).
- New `createEquipmentFromPlan(doc, { knownEquipment })`: skips the pre-read when the warm cache is passed; runs the exact/sep-fuzzy guard against it; derives `locationIds` via `_deriveLocationIds`; one `setDoc`.
- `awCreateEquipmentFromSearch` body → plan → use-existing ? select : create → optimistic push into `_cachedEquipment` → `awSelectEquipment`. In `awSelectEquipment`, if `eq.preferredUnit` differs from the exercise unit, apply the same conversion block `awToggleUnit` uses (`:3616-3624`).
- Disable the Add row (`aria-busy`) while the promise is in flight.

Tests: `tests/unit/equipment-create.test.js` (plan shapes; catalog-brand prefix; dice ≥0.75 → use-existing; `force`; no gym/no exercise; type inference additions; `matchesAllTokens`). `firebase-workout-manager.test.js`: `saveEquipment` persists `preferredUnit`/`createdVia`; `createEquipmentFromPlan` makes **zero** `getDocs` calls and one `setDoc`; sep-fuzzy match writes nothing. `catalog-search.test.js`: rank-3 token fallback.

#### AP-13 — Route every create path through the planner (M)

> **As built (2026-10-25):** the audit found **13** create paths, not 7. All now write through `getOrCreateEquipment` — the two that bypassed it (quick-add custom, photo-ID) were switched, so both now dedupe. Picker and shared-sheet creates go through the planner (gym + exercise + unit tagged). `catalogDisplayName` and the inline composer in `addCatalogMachineDoc` are gone — `composeEquipmentName` only. **Legacy modal deleted (2026-10-25, later):** its three callers — legacy card "Change equipment" (`changeExerciseEquipment`), library → add-to-workout (`selectExerciseFromLibrary`), manual-workout entry — now open `openSharedEquipmentSheet` ("None" → no equipment). Gone: the dialog, `equipment-picker.js`, `closeEquipmentPicker`/`addEquipmentFromPicker`/`skip…`/`confirmEquipmentSelection`/`selectEquipmentForManual`/`closeEquipmentPickerForManual`, the `window.*Equipment*During/ForActiveWorkout` flags, and the `.equipment-option*`/`.equipment-picker-*`/`.eq-picker__*` CSS; `window-wiring.test.js` asserts they stay gone.

Shared sheet (`:2817`) passes `gymName = locName`, `exerciseName = ctx.exerciseName`. Photo-ID `addIdentifiedMachine` → planner + `onAdd`. Quick-add custom → planner. `promoteCatalogToEquipment`/`catalogDisplayName` → `composeEquipmentName`. Delete the legacy modal path. Add a negative assertion to `window-wiring.test.js` that `awQuickAddEquipment`/`awSaveNewEquipment`/`awGoToEquipmentLibrary` no longer appear in `js/`.

#### AP-14 — In-place expand mini-form (S, optional)

> **As built (2026-10-25):** the Add row's chevron expands Name / Brand (datalist of catalog + owned brands) / Type chips / Unit (lb·kg) / Base weight in place, with a live "Saves as …" preview through `composeEquipmentName`; "Add and use" commits through the same planner + writer. This replaced the separate New-machine sheet. **Link to catalog (2026-10-25, later):** `catalogLinkCandidate` (catalog-search.js) — picker-created doc, no `catalogRef`, has a brand, and exactly one same-brand catalog machine starts with its function (or name minus brand). Quick-edit shows "Link to <brand> <machine>" under the name; tap toggles it, Save writes `catalogRef` (+ type/body part only when missing). Never renames.

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

### 4.0 What the coach is for — a planner who executes

*Rewritten 2026-10-25 after Kevin described how he actually trains.* The goal is a replacement for a personal trainer at a gym that doesn't offer one — but the way this user works is specific: **think hard once per block, execute the plan daily without talking to anyone, check in weekly, and occasionally renegotiate** ("last week was hard"; "I want something new but don't break my progress"). Live chat barely figures in that. For a planner, the set rows *are* the live coach: verdict-driven targets, ↑/↓ markers, deload-scaled numbers — the rules engine coaching between sets with no chat box. Live chat stays and gets its gaps fixed (AP-23), but it is not where the value lands.

Five jobs, in priority order:

| # | Job | Trigger | Rules supply (code, deterministic) | Model supplies (judgment, words) | Where it lands |
|---|---|---|---|---|---|
| 1 | **Plan the block** | end of a block / "what should the next 4–6 weeks be?" | block retrospective (`get_verdicts {scope:'block'}`), scoreboard, rotation candidates ranked by staleness + pattern + gym (`get_rotation_candidates`), program shape rules (AP-17), MRV governor | assemble the block, explain every change and every thing that stays fixed, confirm — in the **planning contract** (AP-19): week-by-week purpose, day-by-day, fixed vs changed, how we'll know it worked | `create_program` + `rationale` → the **Block page** (AP-24) |
| 2 | **Renegotiate mid-block** | "last week was hard" · "I'm bored" · "I can only do 3 days" | fatigue + readiness signals (AP-22), week override mechanism (AP-10 generalized), primaries-fixed / accessories-rotate rule, rotation candidates | pick the lever — lighter week, swap accessories, reshape the split — and say what it costs; never break scoreboard continuity | `propose_week_adjustment` card · `replace_day` diff card · Block page updates |
| 3 | **Weekly scoreboard** | weekly review / "how am I doing?" | AP-21 scoreboard: per-primary rolling-4-wk e1RM, rep PRs, stall rung, pattern coverage; fatigue flags | the one thing to lead with, in two sentences | weekly review · dashboard card · Block page header |
| 4 | **Today** | session start | `sessionIntent` (AP-6) + per-exercise `progressionTarget` verdicts (AP-16) | usually nothing — the rows say it. Chat: one sentence when asked | set rows · dashboard hero |
| 5 | **Free text (chat + live)** | anything in the user's own words, between sets or not | history, injuries, equipment, verdicts as facts; session lookups | interpretation, trade-offs, substitutions, "my knee feels weird" | chat · live proposals (swap / skip / target / rest) |

Everything with a number and a threshold is a rule. The model receives verdicts as facts, explains them, and may deviate only through an explicit, logged `override:true, reason` (AP-17). Progress is answered by a **dashboard** (AP-21), the plan is *seen* on a **page** (AP-24), and the coach reads the same objects those surfaces show so none of them can disagree.

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

**Two contracts, not one** (added 2026-10-25). The Verdict → Because → Do shape is for *questions*. A *plan* — anything that creates or reshapes a block — gets its own shape, and the model picks by what it's producing: **(1) The block in one line** — goal, weeks, deload week. **(2) Week by week** — a table: week · what it's *for* (accumulate / intensify / peak / deload) · the levers (reps, RPE, set delta, % load). **(3) Day by day** — the split with each template's exercises, primaries marked. **(4) What stays fixed and why** — the primaries, named, "so the scoreboard keeps meaning something." **(5) What changes and why** — each accessory swap with the engine's reason (never used / idle since). **(6) How we'll know it worked** — the two or three scoreboard numbers to watch at week 4. The same six parts are persisted as `rationale` on the program doc (AP-23) and rendered on the Block page (AP-24), so the talk-through survives the conversation.

> **As built (2026-10-25):** the base prompt's format paragraph is now **HOW TO ANSWER** with contract A (question: Verdict / Because / Do / Watch, ~120 words, one recommendation) and contract B (plan: the six parts, also passed as `create_program.rationale`). Live mode no longer appends to the chat prompt: it gets its own `LIVE_SYSTEM_PROMPT` (≤40 words; deload, loadable weights, gym equipment, pain → swap / skip / end + `remember_fact`) plus the memory block. Routing: `functions/coach-routing.js#routeCoachTurn` sends a chat turn to `QUICK_COACH_MODEL` (Sonnet, no thinking, 4k tokens) only when it opens like a lookup *and* names a fact (PR, best, last, how many…) *and* has no judgment word (should, why, plan, swap, deload, hard…) *and* is ≤140 chars; anything else stays on the flagship. The tier and reason are recorded on the trace.

#### AP-20 — Measure it: traces + eval loop (M/L)

- **20a Traces (S, do early):** per turn write `coachTraces/{threadId}/{turn}`: context text (or hash + size), tool calls `{name, input, output, is_error, ms}`, rounds, model, tokens, latency. Admin-only read. Every "stupid" answer becomes a reproducible case.
- **20b Fixtures (M):** 10-20 anonymized snapshots of your real shapes (workouts, templates, equipment, program, settings) under `tests/fixtures/coach-scenarios/`. Scenarios: stalled lift at rung 1/2/3; deload week + "should I go heavier?"; low-volume muscle; "what today?" on a rest day; kg user; injury listed + exercise that loads it; program build; rewrite pull day; machine taken in live mode; weekly review.
- **20c Runner (M):** `scripts/coach-eval.mjs` — extract `buildTrainingContext` to a pure module first (it reads `AppState` today), build context per scenario, call the API with the real prompt + tools, execute tools against the in-memory Firestore mock, capture the trace.
- **20d Assertions (S):** no write tool on a question-form prompt; `propose_session_adjustments` (not `update_*`) when deload flag set; every prescribed weight loadable; equipment exists at gym; injured pattern not programmed; word count within contract; `log_advice` called when a number is prescribed; verdict quoted when present.
- **20e Rubric (S):** Sonnet grades 1-5 on grounded-in-numbers / one clear recommendation / explains why / consistent with verdict; store scores; diff against previous run. Gate prompt/tool PRs on `npm run eval:coach`.

> **As built (2026-10-25), 20a only:** traces are a **top-level** `coachTraces/{autoId}` collection, not `coachTraces/{threadId}/{turn}` under the user — the rules give an owner read on all of `users/{uid}/**`, so an admin-only doc can't live there. Rule: `match /coachTraces/{traceId} { allow read, delete: if isAdmin(); }` (writes are Admin SDK only); **needs `firebase deploy --only firestore:rules`**. Doc (`buildTraceDoc`): userId, threadId, turn, mode, route, model, the last user message as `contextText` (clipped 60k) + `contextChars` + `contextHash` (sha256, 16 hex) + `hasContextBlock`, `toolCalls[] {round, name, input (2k), output (4k), isError, ms}`, rounds, tokens, latencyMs, stopReason, response (8k), error. Written on success, on the live return and in the catch path; a failed write is logged and never fails the turn.

> **As built (2026-10-25), 20b–e:**
> - **One coach, two callers.** Prompts, models per tier and the request shape moved to `functions/coach-prompts.js` (`buildModeRequest`, `memoryBlockFor`); the tool loop moved to `functions/coach-loop.js` (`runCoachToolLoop`, `withPromptCaching`). `coachChatStream` and the eval both call them — the eval runs the production loop, not a copy. The moved prompts were verified byte-identical.
> - **Context builder made pure (20c prerequisite).** `js/core/features/coach-context-builder.js` (`buildTrainingContext`, `buildChatContext`) — ai-coach-ui.js now only supplies AppState. Live: `coach-live-context.js` (`buildLiveWorkoutContext`), re-exported by coach-live.js. One deliberate change: "This week so far" counts against the user's `today`, not the device clock.
> - **20b fixtures:** `tests/fixtures/coach-scenarios/` — **synthetic** users in the app's real document shapes (not snapshots of your account: no personal data in the repo, and every scenario's rules state is pinned by a unit test). 16 scenarios: stall rungs 1/2/3, deload + "go heavier?", dropped pulling, rest day, kg user, shoulder injury + build, program build, rewrite pull day with unused gear, live machine-taken, live next weight, RPE fatigue, "last week was hard", PR lookup (quick tier), week check-in.
> - **20c runner:** `tests/coach-eval/runner.js` — seeds `tests/fixtures/admin-db-mock.js` (Admin-SDK fake that logs every write), builds the first turn exactly as the client does, runs `runCoachToolLoop` with buffered Messages API calls.
> - **20d checks:** `tests/coach-eval/checks.js` — answered, length, no writes on a question (tool **and** DB), loadable weights (plate grid or grid of a lifted weight — catches 2.5s), equipment exists at the gym, `log_advice` when a number is prescribed, route tier, plus per-scenario must/must-not call and mention, no bump above a weight, injured pattern never written or proposed, ask-or-build.
> - **20e rubric:** `tests/coach-eval/grader.js` — grounded / one recommendation / explains why / consistent with verdict, 1–5, by the quick-tier model. `report.js` diffs against `tests/coach-eval/baseline.json`: a newly failing check or a grade drop ≥ 1 is a regression.
> - **Run:** `npm run eval:coach` (own vitest config, never part of `npm test`; skipped without `ANTHROPIC_API_KEY`). `EVAL_ONLY=a,b`, `EVAL_MODEL`, `EVAL_NO_GRADE=1`, `EVAL_UPDATE_BASELINE=1`. Results to `tests/coach-eval/results/` (gitignored). **Not yet run against the API** — no key in this environment; the first run sets the baseline. The pipeline itself is tested without the API in `tests/unit/coach-eval.test.js` (scripted model through the real loop + tools).

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

> **As built (2026-10-25), phase 2 + logging cost:** shipped ahead of the AP-20 fixtures, by decision. `progressionTarget` calls `fatigueState` itself:
> - A fatigued rung-1 stall returns the back-off (`rung:2, early:true`).
> - **Addition to the plan:** a fatigued lift at rung 0 that would bump holds instead (`action:'consolidate'`). This covers the RPE ≥ 9.5 case; rung 2/3 are unchanged.
> - Every fatigued target carries `fatigued`/`fatigueReason`, and the verdict quotes it ("already in the target").
> - `computeOverloadNudge` makes the same calls, so the card and the rows agree; a deload intent still wins.
>
> `checkDeloadNeeded(…, {primaries})` is due **a week early** (`source:'fatigue'`) when the hard-week run is one short and either 2+ main lifts are fatigued or readiness is low. `primaries` comes from `pickPrimaries`, passed in by `computeVerdicts` and the client wrapper; training-rules can't import the scoreboard, which already imports it. The dashboard insight, coach prompt card and verdict line say "a week early".
>
> Logging cost (decided 2026-10-25, **heaviest set**): with `trackRpe` on, RPE chips show only on the heaviest completed working set per exercise (`rpePromptSetIndex`, ties → the later set), plus any set already rated. Settings copy: "Rate your heaviest set (6–10) on each exercise". Tests in `fatigue-signal.test.js`.

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

## 4c. Tools the planner needs — AP-23

**Context for the coding agent:** tool definitions and executors in `functions/coach-tools.js`; the accessory-rotation engine is `selectRotation()` in `js/core/features/exercise-rotation.js`, mirrored to `functions/exercise-rotation.js` via `scripts/sync-mirror.mjs`, and today reachable only through `create_program({rotateAccessories:true})`. The manual week override is `settings.manualDeload = { from, weeks, weightPct }` (AP-10), read by `getSessionIntent` rule 2 (`session-intent.js`) and shown as a Settings toggle (`settings-ui.js:~195`). Proposals are validated in `validateProposal` and rendered client-side as cards; nothing applies without a tap. Live tool set = `liveToolDefinitions()` in `functions/index.js`. `get_verdicts` (AP-16) computes from `coach-rules.js`.

### AP-23 — Planner tools + live gaps (M)

| # | Tool | Kind | What it does | Why |
|---|---|---|---|---|
| a | **`get_rotation_candidates`** `{ exercise? , pattern?, location?, limit=5 }` | look-up | Runs `selectRotation` in *query* mode: for one exercise (or a pattern), return ranked same-pattern alternatives at the gym — `{ name, equipment, pattern, reason:'never used' \| 'idle since 2026-07', lastUsed }` — plus the held primaries with their reason. No writes. | Job 1 + 2 + 5. Today "what should I replace back extension with?" is hand-picked from raw lists; the engine that does it right is unreachable from conversation. Rules rank, model explains. |
| b | **`propose_week_adjustment`** `{ weightPct (−50…+10), setDelta (−3…+3), label, weeks=1, from=today, extendBlock=false, reason }` | proposal | Card → on tap writes `settings.weekOverride` (rename of `manualDeload`, generalized to any pct/label; `getSessionIntent` rule 2 unchanged except the mode: `deload` when pct ≤ −20 or label matches, else `build` with `source:'manual'`), and optionally shifts `program.startDate` back by `weeks·7` so the block's remaining weeks are preserved. Card shows the four affected sessions and the new targets. | Job 2, "last week was hard." The mechanism exists (AP-10) as a Settings toggle hard-coded to deload; a trainer's "back off 10% this week, pick up next week" is one tap. |
| c | **`get_verdicts { scope: 'week' \| 'block' }`** | look-up (param) | `block` = retrospective over the active (or just-finished) program: per-primary e1RM start → end, rep PRs, weeks each pattern sat under MEV, planned vs completed days, fatigue flags by week, accessories used and never used. Reuses `programBlockStats` + scoreboard math with the block window. | Job 1. The block-boundary conversation starts with "here's how the block went," not a rolling 4 weeks. |
| d | **`set_primary_lifts`** `{ exercises: [name] }` (3–8) | action | Writes `role:'primary'` on matching template exercises (clears it elsewhere); validates names against active templates; returns the resulting list. | Job 3. The scoreboard is only meaningful if primaries are chosen; a trainer does this *with* you in the first conversation instead of a settings hunt. |
| e | **`create_program.rationale`** (schema addition) `{ block: string, weeks: [{ week, why }], fixed: [{ name, why }], changed: [{ from, to, why }], watch: [string] }` | action (field) | Persisted on the program doc; the Block page renders it. Required when `weeks ≥ 4`. | Job 1. The talk-through survives the chat thread. Without it the plan is a list of templates and a start date. |
| f | **`get_workouts`** `{ date } \| { from, to }` (≤ 14 sessions) | look-up | Whole sessions by date — exercises, sets with units, label, readiness, notes. | Job 5. The block carries 12 recent sessions; "what did I do last Tuesday?" and "compare to the same week last block" need older ones. |
| g | **`propose_skip_exercise`** `{ exercise, endSession=false, why }` (live) | proposal | Card: drop one exercise from today's session, or end the session. Logs the reason; `endSession` routes to the normal completion flow. | Job 5 live. The live prompt says "pain: propose a swap or ending the session" and there is no tool for the second half. |
| h | **`remember_fact` in live mode** | config | Add to `liveToolDefinitions()`. | An injury reported between sets is the most important fact to remember, and it's reported in live mode. |
| i | **`list_templates` returns `avgDurationMin`** | look-up (field) | From `startedAt`/`completedAt` of the last 5 completions per template. | "I've got 40 minutes" becomes a computed cut via `propose_session_adjustments.dropExercises`, not a guess. |

Prompt: in `COACH_TOOLS_PROMPT`, replace the hand-pick guidance ("pull the replacement from list_equipment…") with one line: *"For any swap or rotation, call `get_rotation_candidates` and present its top choice with its reason; hand-pick only when it returns nothing."* Add one line each for b, c, d. Delete the Settings-toggle wording for manual deload in favour of the card.

Tests: `coach-tools-executors.test.js` — rotation candidates: ranks never-used first, excludes primaries, respects `location`, empty when no same-pattern gear; week adjustment: validation bounds, `extendBlock` shifts `startDate`, intent resolves to `deload`/`build` by pct, card payload lists affected sessions; `scope:'block'` numbers against a fixture program; `set_primary_lifts` rejects unknown names and caps at 8; `get_workouts` caps and labels; `propose_skip_exercise` validates the exercise is in the live session. `session-intent.test.js`: `weekOverride` with −10% → `build`, `source:'manual'`, `weightPct:-10`. Window-wiring test for the new cards' handlers.

Acceptance: "replace back extension with something" → the answer names the engine's top candidate and its reason, and offers a one-tap `replace_day`; "last week was hard" → one card, tap, every session this week is 10% lighter and the Block page shows the override; the first program the coach builds asks which lifts are primaries and writes them; the created program carries a `rationale` the Block page renders.

> **As built (2026-10-25):**
> - **a** `rankRotationCandidates` (exercise-rotation.js, mirrored) shares `patternCandidates` with `selectRotation` (behaviour unchanged); the tool returns `{location, pattern, role, candidates[], heldPrimaries[]}`, or a `note` when nothing at the gym fits the pattern.
> - **b** `settings.weekOverride` replaces `manualDeload` (`weekOverrideOf(settings)` reads either, so old docs still work; the Settings toggle now writes `weekOverride`). **Precedence changed:** the override now beats the program week (it was rule 2, after the program) — otherwise a coach-proposed lighter week inside a block did nothing. **Mode:** any negative `weightPct` resolves to `deload` (not `build` above −20% as planned), so progression never bumps during a lighter week; the label distinguishes them ("Lighter week" for a cut smaller than 20%, else "Deload"). `extendBlock` moves `program.startDate` **later** by `weeks·7` (not "back"): the paused weeks are re-run, so no block week is lost. `setDelta` is applied once at workout start (`applyOverrideSetDelta`). The card lists the sessions from the week plan with the previewed intent; `extendBlock` is dropped when there's no active program.
> - **c** `buildBlockRetrospective`/`formatBlockRetrospective` in coach-rules.js (mirrored); `get_verdicts {scope:'block'}` uses the active program, else the latest by `createdAt`; it reports through the last *finished* week.
> - **d** `set_primary_lifts` writes `role:'primary'`, and pins `role:'secondary'` elsewhere, using the same `applyPrimaryChoice` as the scoreboard picker; names fuzzy-match to template names.
> - **e** `rationale` is required when `weeks ≥ 4` on create; `adjust_program` doesn't require it.
> - **f** `get_workouts` takes either form; ranges are capped at 14 sessions, newest first, in the display unit.
> - **g** `propose_skip_exercise` → `removeExerciseAt` (extracted from `awDeleteExercise`), or `endSession` → close the live coach + `awFinishWorkout`.
> - **h, i** done.
> - Tests: `coach-tools-executors.test.js` "planner tools (AP-23)".

---

## 4d. Seeing the plan — AP-24 Block page

**Context for the coding agent:** today the only view of a block is `openProgramDetailSheet()` (`program-session.js:447`): a bottom sheet with one row per week (label + lever summary) and the weekly split by day name. No exercises, no targets, no progress against the plan, no rationale, no past weeks' results. The dashboard hero shows today's session only. `programBlockStats` (`:156`) computes days trained / planned / PR count. Week targets are applied to a session by `applyAdjustmentToCurrentSession` / `scaleSessionSetTargets`; the same math must produce the *displayed* targets so the page and the set rows agree.

### AP-24 — Block page (M/L)

A full page (route `block`), reached from the dashboard hero ("View block"), the Workouts tab, and the end of a coach planning conversation. Replaces the detail sheet.

- **Header:** program name · goal · "Week 3 of 6 — Intensify" · scoreboard headline (AP-21) · days trained / planned this block.
- **Rationale strip** (from `program.rationale`, AP-23e): the one-line block statement, then collapsible "What's fixed" (primaries, with why) and "What changed" (swaps, with the engine's reason). This is the talk-through, kept.
- **Week grid:** one column per week, one row per training day of the split. Cell = template name + the week's lever badge (−35% · 12–15 · RPE 7). **Past cells:** ✓ with top set of the primary vs its target (e.g. "185×6 ✓" / "185×3 ↓"), or "missed". **Current week** highlighted; today's cell carries the Start button (same as the hero). **Future cells:** targets as the rules will seed them — computed with the same `scaleLoadableWeight`/rep-range math the set rows use. A manual week override (AP-23b) shows as a badge on that column with its reason.
- **Tap a cell →** the session: exercises with that week's targets, primaries marked, and for past sessions the logged sets beside them.
- **Actions row:** *Adjust this week* (→ `propose_week_adjustment` via a coach turn seeded with the week) · *Swap an accessory* (→ coach, seeded with `get_rotation_candidates` for the tapped exercise) · *Plan next block* (visible from the deload week; → job 1 conversation seeded with `get_verdicts {scope:'block'}`) · *Discuss*.
- **Pure module** `js/core/features/block-view.js`: `buildBlockModel({ program, templates, workouts, prs, today, unit, scoreboard })` → the grid as data; the page renders it; the weekly review and `get_verdicts {scope:'block'}` can quote the same model. Tests on the model, not the DOM: week/day cells, past vs future, override badge, target math equals the seeder's for a sample week, missed-day detection, no program → empty state with "Ask the coach to plan a block."
- **Empty state** (no program): the scoreboard headline + one button that opens job 1.

Acceptance: from the dashboard, one tap shows the whole block by week and day with past results and future targets; the targets shown for next week match what the set rows seed when that session starts; the rationale from the planning conversation is visible on the page; "Adjust this week" and "Swap an accessory" each take one tap plus one confirmation.

> **As built (2026-10-25):** `js/core/features/block-view.js` (`buildBlockModel`, `buildBlockSession`, `targetFor`, `primaryOf`) + `js/core/ui/block-ui.js`, route `block` / `#block-section`. Targets come from `progressionTarget` with history strictly before the cell's date and that date's intent — the same call the set rows make. The grid is rendered as one section per week with a row per split day (not columns: a phone is too narrow for 6 columns). A session done on another day of the same week counts for that cell. Entry points: dashboard program line and Settings program row (`openProgramDetailSheet` now opens the page; the old sheet render is deleted), the coach's program card ("View block"), and a "This block" row atop the Workouts list. Actions are coach turns seeded with the week, accessory or block. Tests: `tests/unit/block-view.test.js`.

---

---

## 5. Tracking — so the next report comes with data

**`docs/bug-log.md`** (created 2026-10-25, with where each trace lives). One entry per observation, this template:

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
| AP-23 | 4c | M | AP-16, AP-17/18 (schemas), AP-10 (override mechanism), AP-21 (primaries) | planner tools: `get_rotation_candidates`, `propose_week_adjustment`, `get_verdicts{scope}`, `set_primary_lifts`, `rationale`, `get_workouts`; live: `propose_skip_exercise`, `remember_fact` |
| AP-24 | 4d | M/L | AP-23 (rationale, override), AP-21 (headline), AP-7 (target math) | Block page: week × day grid, past results vs targets, future targets from the seeder's math, rationale strip, adjust/swap/plan-next actions |
| SH-0 | 7 | S | — | `?debug` shell HUD + `shell_snapshot`; phone walk-through → `docs/ux-shell-audit-2026-10.md` |
| SH-1 | 7 | S/M | — | `scripts/shell-audit.js` static inventory |
| SH-2a | 7 | S | — | overscroll containment, one page lock, 44 px hit areas — fixes the 10/25 complaints on today's chrome |
| SH-2b | 7 | M | SH-2a | `sheet.js` + `sheet.css` primitive; `inert` after moving two dialogs out of `.app-container` |
| SH-3a/b | 7 | S + M/L | SH-2b | migrate the equipment sheet (chrome only), then the other ~11 overlays |
| SH-4 | 7 | S/M | — | `.page-header` the only header; inset in two files |
| SH-5 | 7 | S | SH-1 | design-audit budgets, CLAUDE.md rules, phone checklist |
| SH-6 | 7 | M | SH-2b | one back system (navStack) + `pushState`/`popstate` |

---

## 7. The shell — headers, sheets, keyboard, scroll (SH-n)

*Folded in 2026-10-25 from the standalone `ux-shell-plan-2026-10.md` draft (written at `8844b94`), re-checked against `9852812`. Its phases were called UX-0…UX-6 in the draft; renamed **SH-0…SH-6** here because UX-0…UX-6 already name the July UX-overhaul phases (shipped; see `launch-roadmap.md` §4). "Review" notes mark where the draft was wrong or has gone stale.*

**Trigger (Kevin, 10/25):** back arrows sit too high and aren't reliably tappable; with the keyboard up, search results are hidden and hard to scroll; on the inline add-equipment form, the page text scrolls behind the form. "Examples, but not limited to" — so the audit (SH-0/SH-1) is built to catch the rest.

### 7.1 Diagnosis

| # | Symptom | Root cause | Why it keeps coming back |
|---|---|---|---|
| A | Back arrows too high / not tappable | **Every sticky header carries its own copy of the status-bar inset, and the back button is 36 px against a 44 px minimum.** `env(safe-area-inset-top)` is hand-written **11×** across 8 files (modals ×2, page-header ×2, utilities ×2, active-workout-v2, app-shell, exercise-lib, settings, templates). `.page-header__back` is 36×36 (`page-header.css:30`); `--tap` is 44. The 9/10 and 9/18 Dynamic-Island reports were fixed header by header. | ≥4 header implementations (`.page-header`, `.aw-header`, `.edit-exercise-header`, `.we-header`) plus `.modal-header`. A new header forgets the inset; nothing checks. |
| B | Keyboard up → results hidden, hard to scroll | **Scroll chaining.** When the sheet's short list hits its end (or the finger lands on the header or search field), the scroll goes to the page behind. `overscroll-behavior` appears **0×** in the codebase. With the keyboard up the sheet body is `calc(85dvh − kb-inset)` minus header and search — a few rows — so the first swipe reaches the end. | Same as C. |
| C | Add-equipment form: page scrolls behind it | **Body scroll lock covers only `.modal` / `dialog.modal`** (`initModalScrollLock`, `ui-helpers.js:373`, `body.style.overflow`). `.aw-sheet`, `.qa-sheet`, `.qe-sheet`, `.picker-overlay` and the rest never lock the page — and iOS Safari ignores `overflow:hidden` on body for touch anyway. | **≥12 sheet/overlay implementations**, each deciding scroll lock, keyboard, safe-area-bottom, focus, Escape and backdrop-tap on its own. `aw-sheet` alone is opened from 10 files (active-workout, workout-session, workout-management, template-selection, settings, navigation, equipment-library, quick-edit, machine-id, block-ui). The "13 create paths" problem (AP-11…13), one layer up. |

**Also:** no `pushState`/`popstate` anywhere in `js/` — iOS swipe-back and Android back leave the app instead of closing the sheet or going back a page.

> **Review (2026-10-25).**
> 1. **The three complaints don't need the primitive to be fixed.** `overscroll-behavior: contain` on every sheet body, `touch-action: none` on backdrops/handles/headers, one shared page-lock counter, and 44 px hit areas fix A/B/C on the existing chrome in one PR — that's **SH-2a** below. The primitive (SH-2b) and migrations (SH-3) are consolidation so it can't regress, not the fix. Ship the fix first.
> 2. **`inert` hazard.** The draft puts `inert` on `#app` / `.app-container` while a sheet is open. Two dialogs live *inside* `.app-container` (`add-exercise-modal`, `add-location-modal`, `index.html:404/426`) — `inert` on an ancestor makes them dead even as top-layer dialogs. Move both out to body level in the same PR. (Toasts and `confirmSheet` dialogs already append to `document.body` — fine.)
> 3. **The lock must survive navigation.** `navigateTo()` force-removes `#aw-sheet`/`#aw-sheet-backdrop` (`navigation.js:76-82`). If that teardown doesn't release the lock counter, the page stays frozen after the next navigation. Teardown goes through `closeAllSheets()`; the HUD shows lock depth so a leak is visible.
> 4. **Stale since the draft:** `picker-overlay` is now only the Settings experience-level picker (`settings-ui.js:1430`) — the equipment-picker modal it mentioned was deleted in AP-13. The equipment sheet was rewritten in AP-11…14, so the draft's line numbers there are off. The Block page (AP-24) adds an `aw-sheet` user.
> 5. **CLAUDE.md conflicts to resolve when SH-2b lands:** "There is NO shared sheet primitive — don't hunt for `sheet.js`" becomes false; and the active-workout rule ("prefer a parallel `openShared*` API over refactoring `awOpenEquipmentSheet`") means SH-3a swaps only the **chrome** (open/close/backdrop/CSS) and keeps `buildEquipListHTML` and every handler — then run the four-flow check (change equipment, replace, add from menu, complete).
> 6. **SH-6 (back gesture) and the July "one back system" are the same work** (July plan lines 122-125: every section via `navigateTo`, every back via `navigateBack`, `MAX_STACK_SIZE` 5→10 with top-dedupe, retire `_libraryReturnContext`). Merged into SH-6.
> 7. **SH-0's phone session doubles as the acceptance pass** for AP-22/23/24 (see §0.1) — one evening at the gym, not two.

### 7.2 Phases

#### SH-0 — `?debug` shell HUD + phone walk-through (S, do first)

Measure before fixing; agents can't see the Dynamic Island.

**HUD.** In `app-initialization.js`, when `location.search` has `debug`, mount a fixed 10 px monospace strip bottom-left (`pointer-events:none`, above everything), re-rendered on `visualViewport` resize/scroll, `focusin/out`, and a 250 ms tick:

```
ih 844 · vv 500 @0 · kb 344 · sat 59 sab 34 · scrollY 0 · lock 1 · open: aw-sheet · focus: INPUT#aw-equip-search
```

`ih` = `innerHeight`; `vv` = `visualViewport.height @ offsetTop`; `kb` = computed `--kb-inset`; `sat/sab` from a hidden probe with `padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom)`; `lock` = page-lock depth (after SH-2a); `open` = root classes of visible overlays; `focus` = active element tag + id.

**Snap.** Long-press the HUD (or `?debug&snap`) → one `shell_snapshot` to the Error Log page (silent severity, like `autofill_trace`) with the HUD numbers plus `getBoundingClientRect()` + computed size of every visible back/close control. A back button with `rect.top < sat + 4` or `height < 44` is a defect, with numbers.

**Walk-through (~60 min, phone, standalone PWA, `?debug`).** Every screen and every sheet, keyboard up on every search field; one screenshot + one snap each; a row per screen in `docs/ux-shell-audit-2026-10.md`:

```
| Screen / sheet | Header impl | back top vs sat | back size | Locks page? | Keyboard: list scrolls inside? | Safe-area bottom ok? | Other | Sev |
```

Screens: Dashboard, Workouts + editor, Block page + session sheet, Active workout (exercise view, equipment sheet, ⋮ menu, "All" sheet, coach live, rest banner), History + edit-history, Exercise library + edit exercise, Equipment library + quick-add + quick-edit + detail + photo-ID, Locations, Progress/metric/muscle/exercise detail, Composition/DEXA/body measurements, Settings + Main-lifts sheet + deload toggle, AI coach thread, Error Log, onboarding, completion summary, plate calculator, manual workout. Severity: 🔴 blocks or misleads · 🟡 real drag · 🟢 polish. Write iOS version + model at the top (insets are 0 in a Safari tab — measure standalone).

Acceptance: the audit doc exists, one row per screen/sheet, each backed by a screenshot and a `shell_snapshot` id.


> **As built (2026-10-25):** `js/core/utils/shell-hud.js` + `styles/components/shell-hud.css`, lazy-loaded from `app-initialization.js` only with `?debug`. The line also shows the visible section and lock depth (`y 420*` = locked at that offset). Instead of long-press, a small **snap** button (the strip itself stays `pointer-events:none`); `?debug&snap` snaps automatically 0.7 s after the page or the set of open overlays changes. Each control in a snapshot carries `defects`: under the status bar, hit area < 44, or covered at its centre (`elementFromPoint`). The audit doc exists (`docs/ux-shell-audit-2026-10.md`) with the SH-1 inventory on top and the empty phone table below. **The walk-through itself is yours** (queue item 1).

#### SH-1 — `scripts/shell-audit.js` static inventory (S/M — agent task)

Same shape as `scripts/design-audit.js`; prints a markdown table, later gets budgets (SH-5).
1. **Overlay roots:** every `position: fixed` + (`inset: 0` | `bottom: 0` | `top/left/right: 0`) selector, excluding `.bottom-nav`, `.toast*`, `.aw-footer`; for each: file:line, the JS that toggles it, and booleans — page-lock? `overscroll-behavior`? `--kb-inset`-aware? `safe-area-inset-bottom`? focus trap? Escape? backdrop-tap close? `role="dialog"`/`aria-modal`?
2. **Sticky headers:** `position: sticky; top: 0` → carries the inset? `min-height`? which pages.
3. **Back/close controls:** CSS blocks matching `back|close|dismiss` → declared size vs `--tap`; rendered buttons with `←`, `chevron-left`, `×`, `close` → which header wraps them.
4. **Search inputs:** `<input type="search"` / `placeholder="Search` → inside `.field-search`? Is the results list the scroll container, or the sheet?
5. **Inset copies:** every `env(safe-area-inset-top)` outside `page-header.css` / `sheet.css` / `tokens.css`.

Merge the output into the audit doc under "Static inventory".


> **As built (2026-10-25):** `npm run audit:shell` / `audit:shell:strict`; `--write` regenerates the block between markers in the audit doc, `--json` prints counts. Today: 15 overlay roots (+4 page shells, listed not budgeted), 11 sticky headers, 79 rendered back/close buttons, 16 search inputs. Budgets start at today's counts: `overlayRootsOutsideSheetCss 13`, `safeAreaTopRulesOutsidePrimitives 8`, `backCloseControlsUnderTap 4` (the `--tap-sm` dismiss chips), `searchInputsOutsideFieldSearch 8`, `bodyOverflowWrites 0`. JS facts (lock, Escape, focus trap, backdrop tap) are ±40-line heuristics — the report says so. Found: `.exercise-modal` (nav.css) is dead CSS.

#### SH-2a — Stop the bleeding on the existing chrome (S, ship first)

- **Scroll containment:** `overscroll-behavior: contain` on every sheet/overlay scroll body (`.aw-sheet__body`, `.qa-sheet` list, `.qe-sheet` body, modal content, picker-overlay sheet); `touch-action: none` on every backdrop, sheet handle and sheet header.
- **One page lock:** `lockPage()` / `unlockPage()` with a module-level counter (in `ui-helpers.js` until SH-2b moves it to `sheet.js`). iOS-safe: on first lock save `scrollY`, set body `position:fixed; top:-y; width:100%`; on last unlock restore and `scrollTo(0, y)`. Called from `openModal/closeModal` (replacing `initModalScrollLock`'s `body.style.overflow`), from every `aw-sheet` open/close (`awCloseSheet` and the openers), quick-add, quick-edit, and the `navigateTo` teardown (reset to 0). No `inert` yet.
- **44 px hit areas** (pulled forward from SH-4): `.page-header__back` and every `×` keep the 36 px visual circle but get `min-width/min-height: var(--tap)` (circle drawn on `::before`, or `padding` + negative `margin`); `aria-label="Back"` / `"Close"` where missing.
- Tests: `lockPage` counter (two locks, one unlock keeps it locked; restore calls `scrollTo` with the saved y); `navigateTo` teardown resets it.

Acceptance (phone, HUD): with any sheet open, swiping the header, the search field, the form or past the end of the list never changes `scrollY`; with the keyboard up the list scrolls inside the sheet; closing lands exactly where you were; every back arrow on the walk-through screens takes the first thumb tap.


> **As built (2026-10-25):** the lock is **derived from the DOM, not counted**: `js/core/ui/page-lock.js` watches the body and locks while any `OVERLAY_SELECTOR` root is showing (`.aw-sheet-backdrop.visible`, `.sheet-backdrop`, open `dialog.modal`, `.modal:not(.hidden)`, more-menu, bw-prompt, today's-PRs, onboarding, form-video, picker-overlay) or an explicit `lockPage()` hold exists — ~12 overlays open/close their own way, so a counter would have leaked on the first missed close; this way `navigateTo`'s teardown releases it by removing the nodes (it also calls `resetPageLock()`). Lock = `body.page-locked` (`position:fixed; top: var(--page-lock-top)`) + `.page-lock-frozen` on visible full-page sections' scrollers (pages scroll either the document or a `.full-page-body`). `initModalScrollLock` now just installs it — `body.style.overflow` writes: 0. `overscroll-behavior: contain` on `.aw-sheet`, `.aw-sheet__body`, modal content, reassign/migration lists, more-menu, onboarding; `touch-action: none` on backdrop + handle, `pan-x` on the header. 44 px hit areas, visuals unchanged (padding + `background-clip: content-box` + negative margin): `.page-header__back`, `.aw-back/.aw-menu/.aw-coach`, `.aw-form-video__close`, `.dash-todays-prs__close`. Tests: `page-lock.test.js` (jsdom — new dev dependency).

#### SH-2b — One Sheet primitive (M)

New `js/core/ui/sheet.js` + `styles/components/sheet.css` — the only place that knows keyboards, safe areas, scroll locking and focus.

```js
export function openSheet({
  id, title, subtitle = '', bodyHTML = '', footerHTML = '',
  search = null,          // { placeholder, value, onInput, autofocus:true } → pinned under header, outside the scrolling body
  size = 'auto',          // 'auto' | 'tall' (85dvh) | 'full'
  dismissible = true,     // backdrop tap + Escape + swipe-down on handle
  onClose = null,
}) → { el, body, close(), setBody(html), setFooter(html) }
export function closeTopSheet(); export function closeAllSheets(); export function sheetDepth();
```

- **Layout:** `.sheet-backdrop` (fixed, inset 0, `touch-action: none`) + `.sheet` (fixed, `bottom: var(--kb-inset, 0)`, `max-height: calc(85dvh − var(--kb-inset, 0))`, flex column) → `__handle`, `__header`, optional `__search` (pinned), `__body` (`flex:1; min-height:0; overflow-y:auto; overscroll-behavior: contain`), `__footer` (`padding-bottom: calc(12px + env(safe-area-inset-bottom))`, hidden while the keyboard is up).
- **Page lock:** SH-2a's `lockPage/unlockPage` move here; `openModal/closeModal` keep calling them so `<dialog>` modals share the counter. Now add `inert` to the app root — **after** moving `add-exercise-modal` and `add-location-modal` out of `.app-container`.
- **Keyboard:** consume the existing `--kb-inset` (`app-initialization.js:264-269`); migrated sheets stop re-implementing it. `search.autofocus` focuses synchronously inside the opening tap handler (iOS raises the keyboard only from a user gesture).
- **Focus + a11y:** `role="dialog" aria-modal="true" aria-labelledby`, focus trap, focus restore, Escape closes the top sheet, swipe-down on the handle (pointer events, 60 px).
- **Stacking:** sheets stack; backdrop dims only on the first; z-index from `--z-modal` + depth. `navigateTo`'s teardown calls `closeAllSheets()`.
- Tests `tests/unit/sheet.test.js` (jsdom): open sets the lock + `inert` and records scrollY; close restores both; two sheets → one lock, close in order, Escape closes top only; autofocus focuses the input; `setBody` replaces only `__body`; `window-wiring.test.js` still passes for handlers in `bodyHTML`.
- CLAUDE.md: replace "There is NO shared sheet primitive…" with "New bottom sheet → `openSheet()`".


> **As built (2026-10-25):** `js/core/ui/sheet.js` + `styles/components/sheet.css` as specified; the page lock comes from page-lock.js seeing `.sheet-backdrop`. `inert` goes on **every body child** except sheets, dialogs, toasts and the HUD (not just `.app-container` — several full-page sections live outside it); `add-exercise-modal` and `add-location-modal` moved to body level first. Search uses `.field-search` markup, pinned under the header; `autofocus` focuses synchronously. Footer hides while the keyboard is up via a `kb-open` class the inset tracker now sets. `navigateTo` calls `closeAllSheets()`. Nothing uses it yet — SH-3 migrates. Tests: `sheet.test.js` (7). CLAUDE.md's "no shared sheet primitive" note is updated.

#### SH-3 — Migrate every overlay to the primitive (M/L, in order of pain)

**3a (with SH-2b):** the active-workout equipment sheet — chrome only (see Review 5): opener, backdrop, the search field moves to `search:` (pinned above the list), the inline Add row and its expand form stay in `bodyHTML`, `buildEquipListHTML` and handlers untouched. Delete the `aw-sheet*` CSS it no longer uses. Four-flow check before merge.

**3b — the rest, one PR each or grouped by file:**

| Order | Overlay | Where | Notes |
|---|---|---|---|
| 1 | remaining `aw-sheet` users (⋮ menu, "All", coach live, substitution, gym chooser, Block session, settings sheets, template editor sheets, machine-id) | the 10 files in §7.1 | same bodies, new opener |
| 2 | `qa-sheet` quick-add | `equipment-library-ui.js`, `quick-add-sheet.css` | keep `openQuickAddSheet(gym, {onDone, initialSearch})`'s signature |
| 3 | `qe-sheet` quick-edit | `equipment-quick-edit.js` | |
| 4 | `picker-overlay` (experience level), `more-menu-overlay`, `bw-prompt-overlay`, `dash-todays-prs-overlay`, `plate-calc-backdrop`, `aw-form-video-overlay`, `onboarding-overlay` | various | small; the video overlay may stay full-screen but must use the lock |
| 5 | equipment detail "+ Assign exercise" (full-page swap in `assignExerciseToEquipment`) | `equipment-library-ui.js` | becomes a `mountEquipSheet`-style sheet like identity/bw/uf (July plan item) |
| 6 | `exercise-modal`, `reassign-modal` | `exercise-manager-ui.js`, `workout-management-ui.js` | check for dead paths first |
| — | `dialog.confirm-sheet`, `dialog.modal` | stay `<dialog>` | only change: share the lock |

Per-overlay acceptance = SH-2a acceptance, plus `grep -c "<old root class>" js styles` → 0 and its CSS deleted.

#### SH-4 — One Header primitive (S/M)

`.page-header` (`page-header.css:7`) becomes the only sticky header. Migrate `.aw-header`, `.edit-exercise-header`, `.we-header`, and any `.modal-header` with a back/close, to `.page-header` modifiers (`--compact`, `--workout`, `--in-sheet` which drops the inset). The inset then exists in two files (`page-header.css`, `sheet.css`) via a `--safe-top` token set once in `tokens.css`; delete the other copies. The detail pages' `.d-back` (5 UIs) and metric-detail's `.detail-page-header__back` (already 44 px) fold into `.page-header__back`. (The 44 px hit areas everywhere else ship in SH-2a.)

If a header still reads high on the Island phone afterwards, the inset isn't the cause: check for a sticky header inside a scroll container whose own `padding-top` offsets content but not the header (`exercise-lib.css` comment near `.edit-exercise-header`), and whether iOS's status-bar scroll-to-top zone is eating the tap — move the control down with `--compact` spacing.

Tests: `tests/unit/header-markup.test.js` — every rendered `page-header` has at most one `__back`/`__close` and no inline `padding-top`. Acceptance: HUD shows back `rect.top ≥ sat + 4`, `height ≥ 44` on every screen.

#### SH-5 — Guardrails (S)

`scripts/design-audit.js` `BUDGETS`, each starting at SH-1's count and ratcheting to 0 as SH-3/4 land; `--strict` fails CI:

```js
overlayRootsOutsideSheetCss: N,
safeAreaTopRulesOutsidePrimitives: N,
backCloseControlsUnderTap: N,
searchInputsOutsideFieldSearch: N,
bodyOverflowWrites: N,               // document.body.style.overflow in js/
```

CLAUDE.md "Touching UI": *New bottom sheet → `openSheet()`. New page header → `.page-header`. Never write `env(safe-area-inset-top)`, `position:fixed; bottom:0`, or `body.style.overflow` outside the primitives.*

`docs/ux-shell-checklist.md` — 8 lines, run on the phone with `?debug` before every prod promote: (1) back tappable on 3 random pages, (2) equipment sheet + keyboard: list scrolls, page doesn't, (3) quick-add + keyboard same, (4) close any sheet → scroll position unchanged, (5) bottom actions clear the home indicator, (6) rest banner + sheet stack, (7) portrait only, (8) one `shell_snapshot` saved.

#### SH-6 — One back system + back gesture (M)

Two halves, in order:
1. **One back system** (from the July plan, never done): every full-page section shown through `navigateTo` (no direct `.hidden` toggles on `SECTION_IDS` sections); every back button calls `navigateBack()`; `MAX_STACK_SIZE` 5 → 10 with top-dedupe; retire `_libraryReturnContext`. Test: dashboard → Progress → muscle group → exercise → equipment detail → back ×4 lands where you came from.
2. **Gesture:** `sheet.js` pushes a history entry on open (`history.pushState({sheet:id})`) and `popstate` closes the top sheet; `navigation.js` pushes on page change and `popstate` navigates back. Never push between the active workout's exercise steps (the wizard stays one entry). Test: `navigation-history.test.js` with a fake `history`.

### 7.3 Persona re-review (after SH-2a/SH-3a)

Marcus and Sam against **dev** with the test account only (`klaperriere87@gmail.com` — dev and prod share one Firebase project), briefed with the three complaints plus the SH-5 checklist, scored before/after. File to `docs/marcus-review-2026-10-shell.md` / `docs/freestyle-review-2026-10-shell.md`. They can't see the Island; their job is flows and copy, the HUD numbers are the proof for A/B/C.

---

## 8. Audit 2026-10-25 — source-verified, as of `9f1bf6b`

*Read-only audit of every phase against its acceptance lines (function bodies read, not commit messages). Result: 31 verified · 4 partial (AP-7, AP-18, AP-19, AP-20e) · AP-22 phase 2 ungated · AP-14 not read in detail · 0 missing. Gaps below are tagged **AU-n**; each is small. Do AU-1 first — nothing after it is measurable until it runs.*

| # | Gap | Where | Fix |
|---|---|---|---|
| **AU-1** | **The eval has never run.** `coach.eval.js:29` needs `ANTHROPIC_API_KEY`; none set; no baseline committed; CLAUDE.md names `npm run eval:coach` as the gate but nothing enforces it. Every prompt/tool change since Friday — AP-19's contracts, AP-22 phase 2's target change — is unmeasured. | `tests/coach-eval/` | Set the key locally, run once, commit the baseline JSON. Then make the gate real: a `pretest`/pre-push hook or a CI job that fails on regression. |
| **AU-2** | **AP-22 phase 2 shipped ungated.** `progression.js:261-265` now changes set-row targets for fatigued lifts. The plan's precondition was "after AP-20 fixtures include two fatigue scenarios and the grader agrees"; it landed 53 min *before* the harness (`501ac09` 14:38 vs `b94dbad` 15:31), with one fatigue scenario. | `progression.js:261-265`, `scenarios.js` | Add a second fatigue fixture (rising RPE *with* rising load → must NOT flag), run AU-1, and either keep phase 2 with the evidence or put the branch behind a flag until it passes. |
| **AU-3** | **`nextTargetFor` still live.** AP-7 said delete it and route base-weight machines through the multi-session nudge; it survives as a fallback at `:984/:986` when `_overloadNudge` is absent — the "Beat it — try N" path outside the stall ladder, exactly §3.1's defect. | `active-workout-ui.js:895, :984-986` | Delete; when `_overloadNudge` is absent, compute it (the nudge is plate-relative already) rather than fall back. Test: base-weight machine, 6 flat sessions → rung copy, not "Beat it". |
| **AU-4** | **Four scenarios missing** from the 16: the **specimen** (deload-week session review — the one bad case with a real trace), the **weekly review**, **swap via `get_rotation_candidates`** (AP-23's headline tool has no end-to-end test), **live knee pain → `propose_skip_exercise`**. | `tests/fixtures/coach-scenarios/scenarios.js` | Add all four; the specimen's golden answer is the Lesson 4.6 one. Add a named `verdict-quoted` check to `checks.js`. |
| **AU-5** | **Two error shapes in one file**: 31 `toolError({code,message,hint})` vs 22 plain `{error:'string'}` (e.g. `:437, :439, :1190, :1240, :1484`). The model learns one format and gets another. | `functions/coach-tools.js` | Route every `{error:'…'}` through `toolError` with a code. One test: no tool result may contain a top-level string `error`. |
| AU-6 | **Prompts grew instead of shrinking.** Doctrine ≈2,060 → ≈2,370 tok, tools ≈2,330 → ≈2,560 after AP-19; tools prompt still carries 6 NEVER / 2 REQUIRED / 3 ONLY that AP-18 made checkable. The field guide's Lesson 4.6 K/S/D sweep hasn't been done. | `functions/coach-prompts.js` | Do the sweep *after* AU-1 so each deletion is measured (Lesson 4.5 deletion test). Target ≈800 / ≈700 tokens. |
| AU-7 | **Grader not yet honest** (Lesson 5.6): no evidence-quote requirement for scores ≤ 3; no calibration against ten hand-scored answers. | `tests/coach-eval/grader.js` | Add the quote rule to the rubric; hand-score ten traces once; record agreement in the field guide. |
| AU-8 | **Test suite can't run on the linked Linux VM**: `vitest 4.1.4` fails with `Cannot find module '@rolldown/binding-linux-x64-gnu'` — `node_modules` was reinstalled on Windows and the Linux optional binding is gone (it ran Friday). Kevin's Windows runs report 1,226 green; not independently confirmed. | `node_modules` | `npm i --include=optional` on the VM, or keep a separate Linux `node_modules`. Matters for any review run from this side. |
| AU-9 | **Not deployed** (as far as can be seen from the tree): `501ac09` (AP-22 ph 2, heaviest-set RPE), `658fbfa`, `5a113af`, `2623d92`, `b94dbad`, `9f1bf6b`. Prod last matched `9852812` (14:49 CDT). | — | Deploy after AU-1/AU-2; AP-22 phase 2 should not reach prod ungated. |

Nothing implemented *contradicts* the principles beyond AU-2 and AU-6: no new silent coercions were found (`intIn` now returns `null` and the caller rejects — compliant), every new tool has a real schema, and the planner tools, Block page, traces, and scoreboard all match their acceptance lines.


### 8.1 Review + fixes (2026-10-25, after `395b5cb`)

The audit was checked against the code and the session's deploy log. Corrections first, then what was done per item.

**Corrections to the audit text**
- **AU-9 was wrong about deploys.** Prod hosting was at `9852812` and **included** `501ac09` (AP-22 phase 2 + heaviest-set RPE — promoted on Kevin's instruction). `658fbfa` is `.gitattributes` + docs (nothing to deploy). Functions — one project for dev and prod — were already at the latest server code, including the `b94dbad` refactor. Dev hosting was at `bf9877a`.
- **AU-5 overstated the model impact.** `coach-loop.js` already normalized string errors to `{code:'invalid_input', message}`, so the model always saw one shape; the real gap was that every such error said `invalid_input` (no `not_found`, no hint).
- **AU-2's framing** omitted that phase 2 shipped by Kevin's explicit decision ("AP-22 should have been completed"), recorded in AP-22's as-built note. Rising-RPE-with-rising-load already had a unit test; what was missing was the eval fixture.
- **AU-8's root cause** was `package-lock.json` in `.gitignore` — every machine resolved its own tree, so a Windows reinstall dropped the Linux optional binding.
- **AP-19 "partial"** has no AU row; the only AP-19-related gap is the prompt growth (AU-6).

**Done**
- **AU-1** — the gate is real but cheap: `npm run eval:coach:check` (`scripts/check-coach-eval.js`) fails when any coach file (prompts, loop, tools, routing, guards, rules, weekly-review, the context builders) has a commit newer than `tests/coach-eval/baseline.json`, or uncommitted edits. `.githooks/pre-push` runs it; **enable with `npm run hooks:install` after the first baseline** (it fails today, correctly — no baseline exists). A pre-push that ran the full eval itself would cost dollars and minutes per push. **Still Kevin's:** the first run with the key + committing the baseline.
- **AU-2** — second fatigue fixture `fatigue-rising-load` (RPE 7→8→9 while the load climbs 10 lb a session → still a bump to 195; pinned by a unit test). Phase 2 stays on (decided); the eval run is its evidence check.
- **AU-3** — `nextTargetFor` deleted. Base-weight machines with total-only history run the real stall ladder on plate-relative weights (`plateRelativeNudge`, set-seeding.js; autofill keeps `_progressionSessions`); no nudge yet → nothing, never "Beat it". Test: 90 lb sled, six flat sessions at 270 total → rung-2 copy at 180 plates. The mirror test of the deleted function is gone.
- **AU-4** — five scenarios (21 total): `specimen-session-review` (last block week, today's push 185×6 → 185×3; must mention 185 + deload, no bump, no rotation tool or template write; `golden: null` until Kevin writes the field-guide 4.6 answer — the grader uses it when set), `swap-via-rotation` (must call `get_rotation_candidates`, must name the never-used Standing Leg Curl), `live-knee-pain` (skip or swap **and** `remember_fact`, never "push through"), `weekly-review` (runs the production request — `functions/weekly-review.js`, split out of `generateWeeklyReviewForUser` with an injectable clock; prompt verified byte-identical), plus AU-2's. New checks: `verdict-quoted` (states the verdict's weight and action — the three stall scenarios and the rising-load one carry `verdictRule`) and `mustCall` (all of).
- **AU-5** — every executor error now leaves through `asToolError` with a real code (18 sites; "not found" messages → `not_found`, memory-full gets a hint). Internal validators still return message strings (many tests assert them); the executor is the boundary. Test: no executor returns a string error, codes are from the five the prompt documents.
- **AU-7** — rubric: any score ≤ 3 must quote the reply (or say "absent: …"); unsupported low scores are flagged and kept out of the baseline diff; the golden answer, when present, goes to the grader. **Still Kevin's:** hand-score ten answers once and record agreement in the field guide.
- **AU-8** — lockfiles (root + `functions/`) are committed; `.gitignore` no longer excludes them.

**Not done (by design)**
- **AU-6** prompt K/S/D sweep — after the first eval run, so each deletion is measured (the audit's own ordering).

### 8.2 From the first real trace (2026-10-25, thread `thread_1792962847643_4ezvg8`) — revised after review

*Kevin trained week 5 of Strength block III light ("Dead load week" in his exercise notes) because the design doc's schedule had a deload there; the program doc has `weekTargets: []`, so the app saw five ordinary sessions. The coach then handed him bump targets computed off the light week. The model's behaviour was correct for its instructions; the rules were wrong. Five fixes in code, one UX, one scenario. Revised 2026-10-25 after review: AU-10(b) gets a window so a real drop still registers; AU-11's new action is scoped to every consumer; AU-13 changes the library entries, not just the regex; AU-15 uses a synthetic fixture and is scenario 22.*

| # | Gap | Where | Fix |
|---|---|---|---|
| **AU-10** | **Recovery is read from labels only.** `isRecoveryWorkout` = `sessionIntent.mode === 'deload' \|\| RECOVERY_LABEL(sessionLabel)`. An unlabeled light week (manual deload without the toggle, notes saying "deload") feeds the stall ladder as ordinary sessions → `bump → 95×10` off a 90-lb deload set against a 213 e1RM. | `session-intent.js:134`, `progression.js#buildExerciseSessions` | **(a) Notes, today:** `isRecoveryWorkout` also matches `RECOVERY_LABEL` against `workout.notes` and every exercise note (`/deload\|dead.?load\|recovery\|light (week\|day)/i`). Two lines; would have caught this case. **(b) Load, with a window — not a blanket rule.** A naive "skip any session under 75% of the 4-week best" is a trap: after an injury or a layoff *every* session is under 75%, all get skipped, and targets sit at pre-injury weights forever. So: a session is `light` only when it is < 75% of the exercise's 4-week best **and** a later session (within the next 14 days) is back ≥ 90% of that best — i.e., a dip bracketed by normal load. A sustained drop with no recovery after it is a real drop and stays in the series (the stall ladder and AU-11's `reacquaint` handle it). Alternatively/also: honour `checkDeloadNeeded().inRecoveryWeek` for that calendar week only. The verdict prints `(light session 10-19 skipped)`. Tests: unlabeled −35% week followed by a normal week → targets come from the week before the dip; a −35% week with nothing after it yet → *not* skipped (the window hasn't closed); a −10% session → never skipped; a 6-week post-injury series at 60% → nothing skipped, ladder runs on the new baseline. |
| **AU-11** | **No cross-check between the engine's own numbers; no verdict age.** Target 95×10 sat nine lines below e1RM 213 with nothing comparing them. "Seated Leg Curl: bump (last … 2026-02-05)" — an 8-month-old session drives a verdict with full confidence. | `coach-rules.js`, `progression.js#progressionTarget`, `coach-prompts.js`, **and every consumer of `action`** | **Cross-check:** if `intent.mode !== 'deload'` and the target's implied e1RM < 80% of the lift's rolling 4-week best → `warning:'light-session'`, fall back to the last session within 85–115% of the best, print the warning on the verdict line. **Age:** last session > 6 weeks old → `action:'reacquaint'`, target = last weight, no bump. **This is a new action, so it is bigger than one line:** everything that switches on `action` must handle it or fall through to a defined default — set prefill (`set-seeding.js`), the last-session card copy, the Block page's `targetFor` (`block-view.js:68`), `verdictLine` in `coach-rules.js`, `progressionGuard` in `coach-guards.js` (a `reacquaint` target is never "stalled"), the scoreboard rung chip, and the eval's `no-bump` check. Add a characterization test that enumerates the action set and asserts each consumer has a branch (or an explicit default) for every member, so the next new action can't fall through silently. **Prompt**, one line under the authoritative paragraph: *"If a verdict's target sits far below the scoreboard e1RM for the same lift, or the user's notes say the recent sessions were light, say so and ask before prescribing — the rule may be reading a deload it wasn't told about."* |
| **AU-12** | **Progression and scoreboard key by exercise name across different machines.** "Lat Pulldown" = Newtech High Row 320×5 (10-14) *and* Panatta Convergent 90×10 (10-21) in one series → e1RM 373, verdict off the 90. Same for Shoulder Press (90/140/160 vs 90), Calf Raise logged on the Linear Leg Press at 740. AP-3 fixed prefill with `equipmentId`; progression (`buildExerciseSessions` matches `name !== exName` only) and `progress-scoreboard.js:177` never got it. "Key lift trends" (max weight by name) is therefore noise: `380 → 740 → 560 → 90`. | `progression.js:57`, `progress-scoreboard.js:177`, `coach-context-builder.js` (Key lift trends) | Key series by `exercise + equipmentId` (fallback: normalized equipment name; fallback: name alone, flagged `mixedEquipment:true`). Verdicts name the machine: `Lat Pulldown (Newtech High Row): …`. Scoreboard primaries become exercise+machine pairs; `set_primary_lifts` and the Settings picker follow. **Delete "Key lift trends"** from the block — the scoreboard supersedes it and it misleads. Tests: two machines, same exercise name → two series; the mixed-equipment flag when no id; primaries picker shows the pair. |
| **AU-13** | **Back Extension on a 45° hip extension counts as `trunk-ext`, not hinge** → "Hinge 0 sets in the last 7 days" while 3 sets were logged on 10-23; the coach then recommended adding a hinge slot. | `data/exercises.json:1107` **and** `functions/data/exercises.json:1107` (the entry carries `pattern: 'trunk-ext'` and `bodyPart: "Lower Back"`), `movement-patterns.js:42,55`, any template rows storing `pattern` | **The regex alone does nothing here — an explicit `pattern` on the library entry wins over name inference** (`movement-patterns.js:106`). So: (1) change the entry in both libraries to `pattern: 'hip-dominant'` (keep `bodyPart`), and audit the other `trunk-ext` entries — 45° back extension, hip extension, reverse hyper are hinges; crunch-style lumbar work stays `trunk-ext`; (2) then the regex, so custom exercises named "back extension" infer the same; (3) a one-off pass over saved templates that store `pattern:'trunk-ext'` on those exercises (`replace_day`/CP-1 wrote it) — list them first, then update; (4) the `sync-mirror` check must cover `functions/data/exercises.json` so the two libraries can't drift. Test: Back Extension Machine on "DUAL 45 HIP EXTENSION" counts as hinge in pattern coverage; a template row with a stale explicit `trunk-ext` is reported by the audit script. |
| AU-14 | **"Discuss block" sends a question the user didn't write.** `askCoachSeeded(…)` composes *and submits* "Let's talk about my block — I'm in week 5 of 6 (Baseline)." Kevin wanted to type his own question; the seeded one cost a deep-tier turn (82 s, 5.5k output tokens). | `block-ui.js:274`, `program-session.js:461` | Seeded prompts **prefill the input and focus it**; they never send. The exception stays for the post-workout review chip and weekly review, whose question *is* the feature. |
| AU-15 | **Scenario 22 — unlabeled light week.** There are 21 scenarios today, so this is 22. | `tests/fixtures/coach-scenarios/` | **Synthetic fixture, not the trace export** — `backups/` is git-ignored because it is real training data, and copying it into `tests/fixtures` would commit that data to the GitHub repo. Build a synthetic copy with the same *shape*: six primaries with the same patterns; a 6-week program with `weekTargets: []`; weeks 1–4 at normal load; week 5 at ~−35% with "Dead load week" in two exercise notes and **no** `sessionLabel`; the Lat Pulldown split across two machines (a High Row at ~320 and a Convergent at ~90) so AU-12's bug is in the fixture too; today = the Sunday of week 5. Question: "I messed up and thought this week was a deload week — where do we go from here?" Assertions: no prescribed weight < 85% of the lift's 4-week best unless the session is a deload; the answer mentions the light week; no write tool; the two-machine lift is named with its machine. Golden answer: "No damage — you banked the deload a week early. Run week 6 as the peak on week 4's numbers (Shoulder Press 160×10, Hack Squat 115×6, Lat Pulldown on the High Row 320×5), hold Smith bench at 140 and chase 6, then Block IV with a planned deload." Until AU-10/11/12 land this scenario should **fail** — that's the point. |

**Second review (2026-10-25), folded in before building:**
- **AU-10(a)** — the workout-level field is `workoutNotes` (`workout-session.js:963`), not `workout.notes`. A note match alone over-matches ("next week is deload" on a heavy session), so a session counts as recovery from notes only when the note describes the session itself (in `workoutNotes`, or in ≥ 2 exercise notes) **or the load agrees** (top set under ~85 % of the lift's 4-week best). Kevin's 10-19/10-20 sessions carry exactly one note each, so it is the **load-agreement clause** that catches them — the test targets that clause.
- **AU-10(b)** — the trace's question came on the Sunday of week 5, before any later session, so (b)'s 14-day window was still open and would have skipped nothing. Scenario 22 (same day) therefore rests on **AU-10(a) + AU-11's cross-check**, not on (b).
- **AU-11** — `progressionTarget(sessions, unit, repTarget, inc, intent = null, today = null)`: the age rule is inert when `today` is null, so callers migrate one at a time (verdicts and the Block page first, where age matters; set rows and live mode after) and nothing breaks between. The action-set characterization test covers the new action; this covers the new parameter.
- **AU-12** — `progression.js` and `progress-scoreboard.js` are mirrored (siblings only), so the equipment-name fallback needs a mirrored normalizer, and "same machine" reuses AP-3's rule (id first, then normalized name) — one definition, not a third.
- **AU-13** — signed-in users read the default library from the **Firestore `exercises` collection** (`firebase-workout-manager.js#getDefaultExercises`); `data/exercises.json` is the offline fallback and `functions/data/exercises.json` is what the coach's tools read. Order within the phase, prod data last: (1) both JSON files (reviewable, tested); (2) the Firestore `exercises` doc via a dry-run script that prints the current `pattern`/`bodyPart` of every entry it would touch and **refuses if the two JSON files disagree** (the drift check that matters); (3) the `exerciseOverrides` check.
- **Build order:** scenario 22 **first** — it is expected to fail today — then AU-14 → 10(a) → 13 → 12 → 11 → 10(b), recording which fix flips it. If 10(a) alone flips it, AU-11's cross-check is the second line of defense, not the first.

**As built (2026-10-25) — in the order the review set, scenario 22 first:**

| Step | Commit | Scenario 22 (rules level, `tests/unit/light-week.test.js`) |
|---|---|---|
| Scenario 22 written, failing | `dfa30ac` | 3 expected failures: every main lift "bumps" off the light week (bench 100 vs a 140 best; Lat Pulldown off the Panatta's 90); hip extension = 0 hinge |
| AU-14 | `ee47892` | no change (UX) |
| **AU-10(a)** | `ff4bca4` | **flipped** "no main-lift target < 85 % of its 4-week best" — bench *hold 140, chase 6* (the golden answer's call), shoulder press 170 off 160×10, Lat Pulldown 330 off the High Row's 320×5. It also dropped the Panatta session (light), so the AU-12 check was **re-isolated** in a machine-switch variant (normal week, no notes, only the machine moved) |
| AU-13 | `99d1bff` | **flipped** hinge coverage |
| AU-12 | `9194e61` | **flipped** the isolated machine-switch check |
| AU-11 (1/2, 2/2) | `2e3e47d`, `04b3318` | no change — **the cross-check is the second line of defense**, as predicted: 10(a) alone flipped the scenario |
| AU-10(b) | `4d554b8` | no change (the window is open on the Sunday of week 5) |

- **AU-14** — every seeded ask (Block page adjust/swap/plan/discuss, the program sheet's four asks, the program starter) **prefills** the coach input; auto-send remains only for the post-workout review and the plateau chip. Static test.
- **AU-10(a)** — `RECOVERY_NOTE` (`/\b(de-?load|dead.?load|recovery)\b|\blight (week|day|session)\b/i`) in session-intent.js. Whole workout = recovery when `workoutNotes` or ≥ 2 exercise notes match. Per lift (buildExerciseSessions): any matching note + top set < 85 % of the lift's prior-28-day best e1RM → skipped, reported on `sessions.lightSkipped`. "next week is deload" on a normal-load day moves nothing.
- **AU-13** — Back Extension Machine → `hip-dominant` in both bundled libraries; regex: back/hip extension, hyperextension, reverse hyper → hinge, "lower back / lumbar" → trunk-ext. `scripts/fix-exercise-patterns.mjs` (dry run by default) is the prod step for the Firestore `exercises` collection, the user's `exerciseOverrides` and template rows storing an explicit pattern; it prints current pattern/bodyPart and refuses if the JSONs disagree. A test keeps the two JSONs identical. **Not run — the prod write is Kevin's.**
- **AU-12** — `progression.js#sameMachine` / `machineKey` is THE same-machine rule (AP-3's; prefill delegates). Series take `{ machine }`; verdicts use the template row's machine and name it ("Lat Pulldown on Newtech High Row"), falling back to the name with a "more than one machine / another machine" note; Block page targets, the set-row nudge and scoreboard primaries (tagged + auto) are machine-keyed. "Key lift trends" removed from the context. *Not done:* the Settings main-lift picker still lists exercise names — primaries pick up the machine from their template row, so the picker didn't need to change for the series to be right.
- **AU-11** — `progressionTarget(…, intent, today = null)`; inert without `today`; migrated verdicts + Block page (1/2), then set rows + live mode (2/2). `reacquaint` after 42 days; light-target cross-check (< 80 % → recompute from the newest session within 85–115 % of the best, `warning:'light-session'`, `fromSession`); the card nudge says the same. `PROGRESSION_ACTIONS` + a characterization test that sweeps every action through verdictLine, prefill and the guard and asserts every listed action is reachable. **Found while tracing consumers:** after AU-10(a) the card skipped the light session but the set rows still copied it (prefill's last-session lookup doesn't read notes) — rows now seed from the target when their source session was skipped (`seedFromTarget`). Prompt: one line under the authoritative paragraph.
- **AU-10(b)** — un-noted dip < 75 % skipped only when a session within the next 14 days is back ≥ 90 %; tests for the open window, the −10 % day and the six-week post-injury series.
- **AU-15** — `tests/fixtures/coach-scenarios/light-week.js` (synthetic; same shape as the trace) + eval scenario `light-week` with `minWeight` floors per main lift, "High Row" named, the golden answer. The eval run (Kevin's key) is still the end-to-end check.

**Data fix for this block (one-off):** `scripts/relabel-deload-week.mjs` marks the five sessions 2026-10-19 … 2026-10-24 `sessionLabel: 'Deload'` so the rules exclude them until AU-10 lands (dry-run by default; `--apply` writes; `--undo --apply` reverses). Re-ask the question in a *new* thread afterwards and compare the two traces — that pair is the before/after for AU-10, and the synthetic scenario 22 is its permanent form.
