# Exercise & Equipment Labels — Deep Dive (2026-10-25)

*Source-verified against the working tree at `73396cc`. Data claims come from the last full backup (`backups/bigsurf-backup-…-2026-07-04`, 396 workouts, 99 equipment docs, 21 custom exercises, 18 overrides) plus the bundled library (`data/exercises.json`, 73). The backup is 3½ months old, so the per-exercise lists below are a floor, not the current state — re-run the audit against a fresh backup before doing the data fixes in §5. Phases are tagged **LB-n** (labels), sized S/M, one PR each, same conventions as `action-plan-2026-10.md`. Supersedes **AU-13** there, which named one symptom of this.*

## 0. The one-paragraph diagnosis

"I have no hinge exercises" is true in two different ways, and the app can't tell them apart. **(a) Labeling:** every hinge set you've logged since April is the 45° back extension, and the pattern engine files that as `trunk-ext` (lumbar), not `hip-dominant` (hinge) — so Hinge reads **0** on the scoreboard and the coach proposes adding a hinge slot you already have. **(b) Reality:** even filed correctly, that's 3 sets per session, 1–2×/week — 3–6 sets against a target of 8, so Hinge would read *under*, not green. The hip-thrust, glute-kickback and hip-press machines that *would* count haven't been logged since Jan/Apr/Nov. Fix (a) so the number is honest; (b) is a programming decision the coach should be making from the honest number.

Underneath (a) is the structural problem: the app has **five independent labeling systems** — `bodyPart` on the exercise, `tags`, `pattern`, a body-part regex in the Equipment Library, and the equipment `function` string — and **four separate keyword classifiers** that re-derive labels from the exercise *name* because the stored labels never reach them. The only one that carries a hinge concept (`pattern`) is stamped on the 73 built-in exercises in JSON, **stripped on the way out of Firestore** (`getDefaultExercises` whitelist), absent on all 39 custom/override exercises, has **no UI to set it**, and the scoreboard ignores it anyway (`inferPattern({ name })`). So in practice, "what movement is this?" is answered everywhere by a regex over the name string.

---

## 1. The five label systems, and who reads which

| # | Label | Where it lives | Vocabulary | Who reads it | Who can set it |
|---|---|---|---|---|---|
| 1 | **`bodyPart`** | exercise doc (built-in, custom, override) | free string. Built-ins use 9 values (`Chest Back Legs Shoulders Arms Core Glutes "Lower Back" Cardio`); the edit form offers **8 chips** (`Chest Back Legs Shoulders Arms Core Calves Abs` — no Glutes, no Cardio); the library picker's category grid has **8 cards** (`Chest Back Legs Shoulders Biceps Triceps Core Cardio`); the dashboard shows **6** (`chest back legs shoulders arms core`); the catalog uses **10** (`+ Multi-Use, Full Body, Neck`) | exercise picker filter (`exercise-manager-ui.js:226-238`, **exact string match**), dashboard body-part cards via `aggregators.js#classifyBodyPart` (`BP_MAP` folds `glutes→legs` only), weekly-volume MEV/MRV via `training-rules.js#getBodyPartForExercise` (returns the raw string), coach `list_exercises` | the edit form chips |
| 2 | **`tags`** | exercise doc | 49 free-form tags mixing muscles (`glutes`), shapes (`fly`, `hinge`), gear (`cable`) and roles (`compound`) | `inferPattern` (name + tags), `inferRole` (`isolation`/`compound`) | nothing in the UI; overrides save `tags: []`, which **clobbers the built-in's tags** in `mergeExercisesWithOverrides` (`{...exercise, ...override}`) — all 18 of yours do |
| 3 | **`pattern`** | `data/exercises.json` (73/73 stamped, CP-1); template rows (coach-written) | 19 closed values (`movement-patterns.js#PATTERNS`) | `inferPattern` — **when present**. Server rotation engine (bundled JSON, so it sees them). Client: **never** — `getDefaultExercises` (`firebase-workout-manager.js:394-406`) copies name/machine/bodyPart/equipmentType/sets/reps/weight/video/tags and drops `pattern`; custom/override docs never had one | nothing. No chip, no field. Only the coach's template tools (`EXERCISE_ITEM` enum) can write one, and only onto template rows |
| 4 | **Equipment Library "Library" tab grouping** | computed at render | `Chest Back Shoulders Arms Legs Core Cardio Multi-Use` | `equipment-library-ui.js#classifyExerciseBodyPart` (`:130`) — a **third** body-part regex, independent of #1 and of `aggregators`/`training-rules` | — |
| 5 | **Equipment `function`** (+ catalog `bodyPart`) | equipment doc; catalog | free string from the catalog (`"45 Degree Back Extension"`, `"Master Gluteus Plus"`) | `patternsForEquipment` falls back to `function + name` **only when `exerciseTypes` is empty**; discovery `owns()`; search | quick-edit / pickers |

**Four name classifiers, four answers.** For the same exercise name the app runs up to four different regexes and they disagree:

| Exercise (yours) | `inferPattern` (scoreboard, coach, rotation) | Equipment Library tab (#4) | `aggregators` fallback (dashboard) | `training-rules` fallback (MEV/MRV) |
|---|---|---|---|---|
| Leg Curl Machine (181 sets) | knee-flexion ✓ | **Arms** (`curl`) | legs | Legs |
| Glute Kickback Machine | hip-dominant ✓ | **Arms** (`kickback`) | legs | Glutes |
| Reverse Pec Deck | rear-delt ✓ | **Chest** (`pec deck`) | chest | Chest |
| Cable Crossover | horizontal-push ✓ | **Core** (`ab` matches "c**ab**le") | chest | Chest |
| Back Extension Machine (118 sets) | **trunk-ext** (should be hinge on your 45°) | Back | back | Lower Back (built-in bodyPart) / Core (your override) |
| Shoulder Shrug (44 sets) | **null** — no shrug rule | Back | shoulders | Shoulders |
| Adductor Machine (17 sets) | **null** — rule wants "adduction"/"hip adduct" | Multi-Use | other | Legs |
| Incline/Decline Dumbbell Press (built-ins) | **null by name** (no "chest"/"bench"); JSON says horizontal-push but the client never sees it | Multi-Use | — | Shoulders (`press`) |
| Rowing Machine (cardio) | cardio ✓ | **Back** (`row`) | back | Back |

The fallbacks in `aggregators.js` and `training-rules.js` only fire when the exercise isn't in the library, so they bite custom-named workout entries and renamed exercises; the Equipment Library regex fires on **every** mapped exercise, always.

---

## 2. What this does to each surface today

**Scoreboard pattern strip + coach "pattern coverage"** (`progress-scoreboard.js:256`, `pickPrimaries :116`): `inferPattern({ name })` — name only. No library lookup, no tags, no explicit pattern, no equipment. So: Hinge = 0 (45° back extension → trunk-ext); 61 sets in history have **no pattern at all** (Shoulder Shrug 44, Adductor Machine 17) and count toward nothing; `pickPrimaries`' auto fallback can only choose exercises whose *name* hits a spine rule.

**Coach rotation / `get_rotation_candidates`** (`exercise-rotation.js:58-68`): `patternsForEquipment(doc)` → each name in `exerciseTypes` → `inferPattern`. Your Arsenal 45° Back Extension therefore trains `trunk-ext` and is never a hinge candidate; your Rogers Reverse Glute-Ham *is* a hip-dominant candidate only because its `exerciseTypes` says "Hip Thrust Machine". Six machines carry **wrong exercise links** that feed this directly (§5.2): Matrix Ultra Leg Extension → "Reverse Pec Deck"; Panatta Super Rowing → "Incline Chest Press"; Olympic Military Bench → "Lat Pulldown"; Hoist Chest Press → "Hanging Leg Raise"; Panatta Seated Leg Curling → six exercises incl. Seated Row, Hip Thrust, Lower Chest Flight; Panatta Hip Thrust → "+ Seated Row Machine". Seven docs have no exercise at all (invisible to every picker and to rotation): ISO Multi Row, Incline Chest Press 2, Newtech Flat Press, Super Horizontal Bench Press, Super Horizontal Multi Press, Seated Linear Row ×2.

**Exercise picker (library modal)**: the category cards filter on `exercise.bodyPart === 'Legs'` etc. — exact string. Built-in **Hip Thrust Machine** is `Glutes` and **Back Extension Machine** is `Lower Back` → unreachable from any card except "All" (you overrode both to `Core`, presumably because Glutes isn't a chip — so they now show under Core). Your **Calf Raise Machine** override is `Calves`, **Laying Crunch** is `Abs` → not under Legs/Core. **Lat Pullover** is `Shoulders`. The grid also has Biceps/Triceps cards but every arm exercise is `Arms`, so those cards rely on the name containing "bicep"/"tricep" (`:228-233`).

**Dashboard body-part cards + muscle-group drill-down**: six parts; `BP_MAP` folds only `glutes → legs`. `calves`, `abs`, `lower back`, `cardio`, `general` fall through and are **dropped from all six cards** — 150 calf-raise sets and your crunches/abs entries don't appear in Legs/Core volume.

**Weekly volume / MEV-MRV / coach volume lines**: `getBodyPartForExercise` returns the raw stored string, so "Calves", "Abs", "Core", "Lower Back" and "Glutes" are **five separate muscle groups** each held to MEV 8 — "Calves volume is low — 3 sets" is a phantom.

**Equipment Library → Library tab**: regex #4 files all three leg-curl machines and the glute kickback under **Arms**, the reverse pec deck under **Chest**, the rower under **Back**.

**Template rows**: none of your 15 templates carry `pattern` or `role` (every row `pat:- role:-`) — all inferred at read time; "Push Power"'s Incline Dumbbell Press is `accessory` with no pattern; "Back Extension Machine" is `core` in every leg template.

---

## 3. Why there is no hinge, specifically

Your hinge-pattern history (all time): Hip Thrust Machine 44 sets (last **2026-01-02**), Glute Kickback Machine 78 (last **2026-04-02**), Hip Press 8 (Nov 2025). Since mid-April the only posterior-chain work is **Back Extension Machine on "Arsenal Strength Alpha — 45 Degree Back Extension", 3 sets, 1–2×/week** (13 sessions Apr 25 → Jul 3 in the backup; the 10-23 session in AU-13 is the same movement). A 45° back extension is a hip hinge — the trunk stays rigid, the hips flex and extend. A *seated* lumbar-extension machine (the Nautilus-style "Back Extension") is `trunk-ext`. Both are named "Back Extension"; the name can't decide, **the equipment can** — and the workout record carries it (`exercises[k].equipment = "Arsenal Strength Alpha — 45 Degree Back Extension"`; `equipmentId` on newer docs).

Even classified correctly, 3–6 sets/week vs `PATTERN_TARGET_SETS: 8` reads *under*. That's the accurate answer, and it's what the coach should be planning against (hip thrust or RDL on the leg day you already have — `Tuesday Alternate` has 7 exercises and no hinge).

---

## 4. Target design — one taxonomy, one classifier, labels you can see and set

**Principle:** a label is stored once, in a closed vocabulary, on the exercise; every consumer reads the stored label through **one** module; name inference is the fallback for unlabeled rows, not the primary path; and the one place that can distinguish a hinge from a lumbar extension (the equipment) is an input.

1. **Two closed enums on every exercise.** `bodyPart ∈ { Chest, Back, Shoulders, Arms, Legs, Glutes, Core, Cardio }` (8 — Glutes split out because it's a real training target and already in the data; Calves/Abs/Lower Back become **tags** under Legs/Core/Back) and `pattern ∈ PATTERNS` (19, unchanged). Role stays inferred from pattern + slot (already the case).
2. **One module, `js/core/features/exercise-taxonomy.js`** (pure, mirrored like movement-patterns): `canonicalBodyPart(ex) → one of the 8`, `inferPattern(ex, { equipment })`, `labelsFor(name, { library, equipment })`. The three body-part regexes (`equipment-library-ui.js:130`, `aggregators.js:49`, `training-rules.js:104`) delete; they call this. `movement-patterns.js` keeps the PATTERNS/RULES and gains the equipment input.
3. **Labels flow through.** `getDefaultExercises` keeps `pattern`; the override merge keeps built-in `tags`/`pattern` when the override's are empty; `list_exercises` returns `pattern`.
4. **Labels are visible and settable.** Exercise edit form gets a **Movement** chip row with the human labels the scoreboard already uses (Squat · Hinge · Horizontal push · Vertical push · Horizontal pull · Vertical pull · Leg curl · Calf · Lateral raise · Rear delt · Curl · Triceps · Ab · Back extension · Rotation · Plank · Abduction · Adduction · Cardio) defaulting to the inferred one; the exercise card shows `Legs · Hinge`; the picker gets a "Hinge" chip under its Legs card.
5. **Equipment knows its patterns explicitly.** Catalog machines gain `pattern` (one bulk pass over 1,364 entries by function keyword, hand-checked for the ~120 hinge/hip/back-ext family); `patternsForEquipment` prefers the doc/catalog pattern over inferring from `exerciseTypes`.

Everything below is sequenced so each step is independently useful; LB-1 alone fixes the hinge number.

---

## 5. Phases

> **As built 2026-10-27** (LB-0, LB-2, LB-3, LB-4; LB-1 was b9aa366; LB-5 — see its own note below)
>
> - **LB-0** — `scripts/audit-exercise-labels.mjs` rewritten on the shipped classifiers (`functions/exercise-taxonomy.js`, `movement-patterns.js`, `fuzzy-match.js`) instead of a pasted copy of the Equipment-Library regex (now deleted). Adds: canonical body part, pattern with *and* without the machine (history is per exercise + machine), dashboard card, Equipment-Library bucket, null-pattern list, unmapped equipment, ≥3-pattern mis-link list, case/near-duplicate names. `npm run audit:labels` (no argument = newest `backups/bigsurf-backup-*.json`). *Doc was wrong:* the draft resolved the repo root to `C:\C:\…` on Windows unless a second argument was passed.
> - **LB-2** — `getDefaultExercises` keeps `pattern` (+ `role`/`progression`); one shared merge, `exercise-taxonomy.js#mergeExerciseOverride` (empty override tags / missing pattern keep the built-in's), used by `mergeExercisesWithOverrides` *and* the coach's `list_exercises`; `createUserOverride` / `saveCustomExercise` write `pattern`; `validateExerciseData` drops an unknown pattern (null = infer) and normalizes tags; `list_exercises` returns `pattern`, groups by the eight body parts, and a `calves` filter matches the tag. *Doc missed:* the root cause of `tags: []` on every override was the exercise manager's row mapping dropping `tags` before the save — fixed (`toLibraryRow`); the server's `list_exercises` had the same tag-clobbering merge.
> - **LB-3** — new mirrored `js/core/features/exercise-taxonomy.js`: `BODY_PARTS` (8), `BODY_PART_ALIASES`, `FOCUS_TAGS`, `canonicalBodyPart` (stored → library → pattern → one name regex), `volumeGroup`, `dashboardBodyPart`, `DASHBOARD_BODY_PARTS`. Deleted `equipment-library-ui.js#classifyExerciseBodyPart` (was `:140`, not `:130`) and the `aggregators.js` keyword fallback; `training-rules.js#getBodyPartForExercise` is a thin wrapper that also reads a row's own stored label, and its callers (`analyzeWeeklyVolume`, `analyzeFrequency`, volume-governor, coach-guards) no longer bypass it with `ex.bodyPart ||`. Picker: 9 cards (Chest, Back, Legs, Glutes, Shoulders, Arms, Core, Cardio, All) filtered by `canonicalBodyPart`; Biceps/Triceps cards became the Movement strip's Curl / Triceps. Editor: 8 body-part chips + optional **Focus** tag chips (calves, quads, hamstrings, abs, lower back, biceps, triceps); a legacy "Calves"/"Abs"/"Lower Back" opens as the part + its tag. *Decision (the doc left it open):* Glutes is a body part for labels and the picker, but **counts with Legs** for the dashboard cards *and* the weekly-volume/minimum lines (`volumeGroup`) — the library files most glute work (RDLs, kickbacks, abduction) under Legs, so a separate Glutes line would hold only hip thrusts to the weekly minimum, the same phantom as "Calves volume low". A conventional deadlift with no stored label is Back, not Glutes. *Not changed:* Cardio still gets a weekly-volume row when Cardio exercises are logged (pre-existing).
> - **LB-4** — one label table, `MOVEMENT_LABELS` (all 20 patterns); `progress-scoreboard.js#PATTERN_LABELS` points at it and `equipment-discovery.js#PATTERN_LABELS` is gone. *Labels differ from the list in §4:* `trunk-ext` is **"Lower back"** (not "Back extension" — since LB-1 a 45° back extension is a Hinge, and a chip called "Back extension" would be the wrong one to pick for it) and `trunk-flex` is **"Abs"**. Editor: optional **Movement** chips (the body part's usual movements + "More…"), default = the suggestion from the name, saved only when picked (null keeps the machine able to decide). Library card meta `Legs · Hinge · Machine`; equipment detail's "Used for" rows `Glutes · Hinge · Form video ready` (machine-aware); a Movement chip strip over the library list; search matches movement words. *Beyond the doc:* `buildScoreboard({ library })` (passed by the dashboard card and `computeVerdicts`) reads the library entry's labels, so a Movement set in the editor actually moves the pattern strip — before, the scoreboard was name + machine only.
> - Tests: `exercise-taxonomy.test.js`, `firebase-workout-manager.test.js`, `exercise-labels-ui.test.js` (jsdom), `list-exercises-labels.test.js`, one LB-4 case in `progress-scoreboard.test.js`; the taxonomy is in `movement-patterns-mirror.test.js`.

**Context for the coding agent:** pattern engine `js/core/features/movement-patterns.js` (mirrored byte-for-byte to `functions/` by `scripts/sync-mirror.mjs`; parity test `tests/unit/movement-patterns-mirror.test.js`); scoreboard `js/core/features/progress-scoreboard.js` (mirrored); rotation `js/core/features/exercise-rotation.js` (mirrored); library read/merge `js/core/data/firebase-workout-manager.js` (`getDefaultExercises :372`, `mergeExercisesWithOverrides :240`); exercise form + picker `js/core/ui/exercise-manager-ui.js` (`BODY_PARTS :29`, filter `:220-244`, form `:472-515`); body-part regexes at `js/core/ui/equipment-library-ui.js:130`, `js/core/features/metrics/aggregators.js:49`, `js/core/features/training-rules.js:104`; dashboard parts `js/core/ui/dashboard-ui.js:40`. Workout exercise records carry `equipment` (name) and, since AP-3, `equipmentId`. Tests: Vitest, `npm test` (>3 min, run in a terminal).

### LB-1 — Equipment-aware pattern inference; fix the null rules (S) — fixes the hinge number

`movement-patterns.js`:
- `inferPattern(exercise, { equipment = null } = {})`. Build `text` from name + tags **plus** `equipment` (a name string or a doc's `function`/`name`). Keep "explicit `pattern` wins".
- Add an **equipment-decided** rule ahead of the generic ones: `/45[ -]?(deg|degree|°)?.*(back|hip) ext|hip ext|hyper ?ext|reverse hyper|glute[- ]ham|ghd|roman chair/` → `hip-dominant`. Keep `trunk-ext` for `back extension|lower back` when no hinge equipment is present (seated lumbar machines).
- Shrugs: 44 sets with no pattern today. The vocabulary already holds non-spine shapes (`calf`, `lateral-delt`), so add `'shrug'` as a 20th value (one line in `PATTERNS`, mirrored) with rule `/shrug/ → 'shrug'` placed above the `vertical-pull`/`horizontal-pull` rules, label "Shrug". It never counts toward spine coverage; it stops being an invisible null.
- `/adductor|adduction|inner thigh/ → 'adduction'`, `/abductor|abduction|outer thigh/ → 'abduction'` (the current rules miss "Adductor Machine").
- `/incline|decline|flat|bench|chest|dumbbell press|db press/` → `horizontal-push` only after the vertical-push rule (so "Incline Dumbbell Press" resolves; "Shoulder Press" still vertical).
- Sync the mirror (`node scripts/sync-mirror.mjs js/core/features/movement-patterns.js functions/movement-patterns.js`).

`progress-scoreboard.js` (`:106`, `:116`, `:256`) and `exercise-rotation.js:67-68`: pass `{ equipment: ex.equipment || w.exerciseEquipment?.[k] }` — read the equipment off the workout exercise record, and in `pickPrimaries` off the template row. `patternsForEquipment(doc, lookup)`: pass the doc's `function` as the equipment hint for each `exerciseTypes` name, so "Back Extension Machine" on the 45° doc resolves to hinge while the same name on a seated lumbar machine stays trunk-ext.

Tests (`movement-patterns.test.js`): `Back Extension Machine` + equipment `Arsenal Strength Alpha — 45 Degree Back Extension` → `hip-dominant`; same name, equipment `Nautilus Lower Back` → `trunk-ext`; `Adductor Machine` → `adduction`; `Incline Dumbbell Press` → `horizontal-push`; the existing "keyword inference agrees with the hand-stamped JSON" test must still pass for all 73 (two of them currently don't, by name). `progress-scoreboard.test.js`: a week with 3 sets of Back Extension Machine on the 45° → Hinge `setsThisWeek: 3`, status `under` (not 0). `exercise-rotation.test.js`: the 45° doc is a `hip-dominant` candidate.

Acceptance: after one 45° back-extension session, the dashboard pattern strip shows Hinge with the real set count, and `get_rotation_candidates { pattern: 'hip-dominant' }` lists the 45° bench.

### LB-2 — Labels survive the round trip (S)

- `getDefaultExercises` (`firebase-workout-manager.js:394-406`): add `pattern: data.pattern || null` (and `role`/`progression` if present).
- `mergeExercisesWithOverrides` (`:240-272`): merge as `{ ...exercise, ...override, tags: override.tags?.length ? override.tags : exercise.tags, pattern: override.pattern || exercise.pattern }`. (Today an override with `tags: []` erases the built-in's tags; all 18 of yours do.)
- `saveUniversalExercise` / `validateExerciseData`: carry `pattern` through (validate with `PATTERNS.includes`; reject otherwise, same shape as `prescriptionFieldErrors`).
- Server `list_exercises`: include `pattern`.
- Tests: `firebase-workout-manager.test.js` — default read keeps `pattern`; override with empty tags keeps built-in tags; override with its own tags wins.

### LB-3 — One body-part taxonomy, one classifier (M)

New pure `js/core/features/exercise-taxonomy.js` (mirror it; `training-rules.js` is mirrored and will import it):
- `BODY_PARTS = ['Chest','Back','Shoulders','Arms','Legs','Glutes','Core','Cardio']`; `BODY_PART_ALIASES = { calves:'Legs', abs:'Core', 'lower back':'Back', biceps:'Arms', triceps:'Arms', quads:'Legs', hamstrings:'Legs', general:null, … }`.
- `canonicalBodyPart(exercise)` → stored `bodyPart` through the alias map; else the pattern's body part (`hip-dominant → Glutes`, `knee-flexion → Legs`, `trunk-ext → Back`, …); else one name regex (the `training-rules` one, with the AP-17 ordering fixes) — **the only regex left**.
- Delete `classifyExerciseBodyPart` (`equipment-library-ui.js:130`) and `classifyBodyPart` (`aggregators.js:49`); `getBodyPartForExercise` becomes a thin wrapper. `BODY_PART_CONFIG`/`BODY_PART_ORDER` in the Equipment Library and `BODY_PARTS` in `dashboard-ui.js` read from the module; the dashboard gains Glutes (or folds it into Legs for display — your call; the volume must land somewhere either way).
- Exercise form chips = `BODY_PARTS` (add Glutes and Cardio, drop Calves/Abs — those become tag chips: `calves`, `abs`, `lower back`, `biceps`, `triceps`, `quads`, `hamstrings`). Picker category grid: same 8; Biceps/Triceps cards become tag filters, not bodyPart filters.
- Picker filter: `canonicalBodyPart(ex) === filter` (never raw string equality).
- Tests: alias table round-trips every bodyPart value found in the data (`Calves`, `Abs`, `Lower Back`, `Glutes`, `General`, `Cardio`); Leg Press → Legs not Shoulders; Lateral Raise → Shoulders not Back; Cable Crossover → Chest not Core; Leg Curl → Legs not Arms; the dashboard's six/eight cards sum to the total working sets (nothing dropped).

Acceptance: Calf raises count in Legs on the dashboard; Hip Thrust Machine and Back Extension Machine appear under a card in the picker; the Equipment Library's Library tab files leg curls under Legs; the coach's volume lines have no "Calves" or "Abs" rows.

### LB-4 — Movement label in the UI (S/M)

- Exercise edit form: a **Movement** chip row (the `PATTERN_LABELS` from `progress-scoreboard.js`/`equipment-discovery.js`, unified into the taxonomy module — today there are two label tables that disagree: `'hip-dominant'` is "Hinge" in one and "hip hinge / thrust" in the other). Default = `inferPattern(...)`; saving writes `pattern`. Keep it one tap and optional.
- Exercise card meta: `${bodyPart} · ${patternLabel}`; equipment detail's exercise chips likewise.
- Picker: a pattern chip strip (Hinge, Squat, Push, Pull…) as a second filter; Hinge is the one you'll use.
- Tests: `window-wiring.test.js` for the new chip handler; form saves `pattern`; card renders the label.

### LB-5 — Catalog machines carry a pattern (M, optional)

Bulk-stamp `pattern` on `equipment-catalog.js` by function keyword through `inferPattern` (equipment-aware), then hand-check the output for the hip/glute/back-extension family (the ~120 entries listed by the audit script). `patternsForEquipment` returns `doc.pattern || catalogRef.pattern` first, `exerciseTypes` inference second, `function` text last. `promoteCatalogToEquipment`/the planner copy `pattern` onto the doc. Test: `Arsenal Strength Alpha — 45 Degree Back Extension` from the catalog → `['hip-dominant']` with no exerciseTypes at all.

> **As built 2026-10-27 — LB-5.** `node scripts/stamp-catalog-patterns.mjs` (planner `scripts/lib/catalog-pattern-stamp.mjs`; `--check` / `--family` / `--nulls`) stamps `equipment-catalog.js` from the shipped classifier, equipment-aware, plus a hand-checked table. **1,364 machines: 1,055 stamped** — horizontal-push 171, knee-dominant 176, horizontal-pull 116, vertical-pull 76, elbow-flex 74, hip-dominant 72, knee-flexion 72, vertical-push 56, elbow-ext 51, calf 45, trunk-flex 41, abduction 26, lateral-delt 25, trunk-ext 16, adduction 12, rear-delt 11, anti-rotation 10, cardio 4, shrug 1. **309 left null, never guessed:** 125 Multi-Use / Full Body / Neck stations (utility benches, cable stations, racks), 99 combos whose stations differ ("Leg Extension / Leg Curl", "Shrug/Deadlift", "Pec Fly / Rear Delt", "… Combo"), 52 no rule word ("Pectoral Machine", "Deltoid Press", "Multi Hip", "Total Hip"), 29 whose movement contradicts the catalog's own body part (strength-line "Rowing Machine" under Back, "Seated Dip" under Arms, "Pullover" under Chest), 1 plain plate-loaded "Back Extension", 3 hand-checked nulls (two glute-ham developers / 90° GHD — leg curl *and* hinge — and a deadlift jack). Hand-check covered the 137-entry hip/glute/back-ext family (`--family`): a **plain "Back Extension" on a weight stack is the seated lumbar machine → `trunk-ext`** (12 selectorized lines), elsewhere null; Panatta "Gluteus" / "Master Gluteus Plus", gym80 "Radial Gluteus" / "Bootymizer" / "Booty Booster", Hammer Strength "Hip and Glute", Gymleco "Hip & Back Extension" → hinge. `patternsForEquipment(doc, lookup, { catalogPattern })`: `doc.pattern` → catalog pattern (caller-supplied resolver; the mirrored module can't import the catalog) → `exerciseTypes` → function text; first answer wins, so a stamped leg curl mis-linked to "Seated Row" is no longer a row candidate (a stamped leg press no longer offers its linked calf raise — accepted). New `equipmentPattern(doc)`; rotation offers a stamped machine under its own name when no linked exercise names the pattern. *Doc was wrong:* the audit script lists no catalog entries (it reads a user backup) — the family list is the stamp script's `--family`; and the copy isn't in `promoteCatalogToEquipment` (a UI file) but in the one writer: `saveEquipment` resolves `catalogRef` → pattern (loaded Firestore catalog first, static seed second), so library promote, quick-add and the workout's catalog suggestions all carry it; `getOrCreateEquipment` stamps an already-owned same-name machine missing one, and `updateEquipment` re-derives it when `catalogRef` is linked or changed. `augmentStaticCatalog` keeps `pattern`; the seed script writes it. Docs promoted before LB-5 pick it up on their next catalog link (no backfill run). **Firestore `equipmentCatalog/` has no `pattern` until re-seeded** (`node scripts/seed-equipment-catalog.mjs --merge-exercises`); until then every lookup falls through to the static seed, so nothing waits on it. Not wired (UI file): the Equipment Library's discovery call `patternsForEquipment(doc)` could pass `{ catalogPattern }` for pre-LB-5 docs. Tests: `catalog-pattern-stamp.test.js`, `catalog-pattern-equipment.test.js`.

### LB-0 — Audit script (S, do first, keep forever)

`scripts/audit-exercise-labels.mjs <backup.json>` — read-only, prints the tables in §1–§3 for the *current* data: every exercise with stored `bodyPart`/`tags`/`pattern`, inferred pattern with and without equipment, canonical body part, and the Equipment-Library bucket; null-pattern exercises; equipment with no `exerciseTypes`; equipment whose `exerciseTypes` resolve to ≥3 different patterns (the mis-link smell); duplicate names (case/typo). Re-run it after each LB phase and after a fresh `node scripts/backup-user-data.mjs`. (A working draft is attached with this doc — `audit-exercise-labels.mjs` — it already produced every number above; it reads `functions/movement-patterns.js` so it runs without `"type":"module"`.)

---

## 5b. Data fixes — your library, in the app (no code; ~20 minutes)

Verified against the July backup; some may already be done. Re-run LB-0 on a fresh backup first.

**Equipment → exercise links (quick-edit):**
- Matrix Ultra — Leg Extension: remove "Reverse Pec Deck", add "Leg Extension".
- Panatta FreeWeight Special — Super Rowing: remove "Incline Chest Press (Machine)", add "Seated Row Machine".
- Arsenal Strength Alpha — Olympic Military Bench: remove "Lat Pulldown" (it's a bench — Flat Barbell Bench Press / Shoulder Press).
- Hoist ROC-IT — Chest Press: remove "Hanging Leg Raise / Cable Knee Tuck".
- Panatta FreeWeight Special — Seated Leg Curling: keep "Seated Leg Curl Machine" only (drop Hip Thrust Machine, Seated Row Machine, Hip Thrusts, Hip Thrust, Super Lower Chest Flight Machine).
- Panatta FreeWeight Special — Hip Thrust: drop "Seated Row Machine".
- Panatta Fit Evo — Lateral Deltoids: drop "Leg Extension".
- Arsenal Reloaded — Multi Flex: it's linked to Incline Chest Press + Shoulder Shrug — confirm that's what you do on it.
- Rogers Athletic Pendulum — Reverse Glute-Ham: linked to "Hip Thrust Machine"; consider a custom "Reverse Glute-Ham Raise" (hinge) so the scoreboard and PRs don't merge it with the Panatta hip thrust (AU-12 territory).
- Unmapped (invisible to rotation and pickers): ISO Multi Row, Newtech Incline Chest Press 2, Newtech Flat Press, Panatta Super Horizontal Bench Press, Panatta Super Horizontal Multi Press, Seated Linear Row ×2 (two bare docs with no brand/function — merge into "MegaMass — Seated Linear Row" via reassign, then delete).
- Duplicate: "gym80 80Classics BW — Abdominal Flexor" ×2 — merge.
- Typos in links: "Forearm Preaa" (Gymleco Forearm Machine), "Dumbell" (the Other-type doc).

**Exercises (edit form):**
- Custom "Machine Swuat" → rename or merge into "Machine Squat" (49 sets under the right name, 0 under the typo? check).
- "Cable Bicep Curls" vs built-in "Cable Bicep Curl"; "Dumbell Bicep Curls" vs "Dumbbell Bicep Curls"; "Hip Thrust" (custom, bodyPart Core) vs "Hip Thrust Machine"; "Back Extension" (custom) vs "Back Extension Machine" — pick one each, reassign history, hide the other.
- Body parts after LB-3 lands (or now, with the chips you have): Hip Thrust Machine → Glutes (not Core); Hip Abduction Machine → Glutes/Legs (not Core); Lat Pullover → Back (not Shoulders); Standing Multi Flight → Chest (not Back) if it's the pec-fly station; Calf Raise Machine → Legs + tag `calves`; Laying Crunch → Core + tag `abs`.

---

## 6. For the queue

Add to `action-plan-2026-10.md` ▶ The one queue as **item 12 — Labels (LB-0…LB-4)**, S/M each, "one taxonomy, one classifier; LB-1 alone fixes Hinge = 0 (replaces AU-13)". LB-5 shipped 2026-10-27 (see its as-built note).

| Phase | Size | Fixes | Depends on |
|---|---|---|---|
| LB-0 | S | the audit is repeatable | — |
| LB-1 | S | Hinge 0; null patterns for adductor/shrug/DB press; rotation sees the 45° bench | — |
| LB-2 | S | `pattern` lost on read; overrides erase tags | — |
| LB-3 | M | four body-part regexes; calves/abs dropped from the dashboard; picker can't reach Glutes/Lower Back; phantom "Calves volume low" | LB-2 |
| LB-4 | S/M | no way to see or set a movement label | LB-1, LB-3 |
| LB-5 | M | catalog machines have no pattern | LB-1 |
