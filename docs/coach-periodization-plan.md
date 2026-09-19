# Coach periodization + variety engine — design (Workstream CP)

Status: **built — all eight phases (CP-0…CP-7) on dev as of 2026-09-18**, one
commit per phase (d7b30f5 → CP-7), functions deployed after CP-5/CP-1/CP-3/CP-4.
Not yet promoted to prod: verify on dev first (see §10 gates). Written
2026-09-18, revised same day after a source review caught five wrong claims in
the first draft. Phase numbers 0–19
are all taken (ROADMAP.md, ai-coach-agent-plan.md), so this workstream uses the
`CP-n` prefix, matching the `UX-n` / `T3-n` convention in
`launch-roadmap.md` §4.

Extends Phase 9 (`coach-program-design.md`) — the program doc, trust ladder and
visibility layer survive unchanged. What changes is what a program is allowed
to *say*.

Analysis basis: the 2026-07-04 backup (276 completed workouts,
2025-07-28 → 2026-07-03). **Live Firestore was not readable** from this
session; see §7.

---

## 1. The complaint

> "I've stalled and the coach just repeats the same workouts — nothing changes
> in the program every 6 weeks or anything."

The stall is **stimulus, not strength**.

### Load — mostly climbing

Unit-normalized (the log mixes lbs and kg — 148 kg-logged sets in 2026 — and an
un-normalized read invents 50% crashes that never happened), split by location:

```
Seated Chest Press     200 -> 290  (+45%)     Machine Crunch      121 -> 176  (+46%)
Seated Row Machine     120 -> 220  (+83%)     Overhead Tri Ext    110 -> 190  (+73%)
45 Degree Linear Row    80 -> 180 (+125%)     Shoulder Shrug       70 -> 140 (+100%)
Lat Pulldown           180 -> 230  (+28%)     Hip Abduction       121 -> 226  (+87%)

Genuinely flat (last 6 sessions within 3%):
  Hanging Leg Raise      160 -> 163   (n=41)
  Back Extension Machine 160 -> 163   (n=22)
```

Two flat movements out of 27 tracked. Not a strength plateau.

### Variety — the actual finding

| Metric | Value |
|---|---|
| Distinct exercises used, last 6 months | **34** |
| Distinct machine *functions* mapped at Absolute Recomp | **75** |
| Total exercise-slots trained, last 6 months | 598 |
| Share of those slots taken by the top 10 exercises | **47%** |
| Sessions at Absolute Recomp / total | 140 / 143 |

Half the mapped library idle while a third of the training repeats. The gym
floor holds ~150 machines (more than are entered); other branches carry 450+.
Five equipment docs have no `exerciseTypes` mapping (two have no name at all) —
invisible to every picker.

### What the frequency data does and does not show

Training frequency was unbroken for twelve months at ~24 sessions/month. That
says nothing about whether **load** was ever pulled back — a deload trained at
6 sessions and −35% is invisible to a session-count read. The first draft of
this document claimed "no deload in twelve months" from exactly that flawed
read, which is the same blind spot as Bug 1 below. Kevin reports the week of
2026-09-15 *is* a deload.

---

## 2. Root cause

**No layer can express "this week differs from last week" beyond a load
multiplier, and nothing ever reconsiders exercise selection.**

| Layer | Can vary | Cannot |
|---|---|---|
| Template exercise | `sets`, `reps`, `weight` — scalars | rep *range*, effort target, role, progression scheme |
| Program `weekTargets` | `weightPct`, `label`, `note` — and the server validator drops everything else | set counts, rep ranges, exercise selection |
| `week-plan` | which template on which day | anything inside a template |
| `progression.js` | next load for one exercise, 3-session window | anything across exercises, or a stall *response* |

So "nothing changes every 6 weeks" is designed behavior. A program is a
percentage sign attached to a frozen recipe.

### 2a. The stall bug is in the advisory string, not the target

`progressionTarget()` behaves correctly at a plateau — `progression.js:154`
returns the **held** weight with `action:'stalled'`. The defect is narrower:

- `computeOverloadNudge()` renders *"Stalled at 385 — try 390 or a back-off
  set"* — offering added load at the moment load should come off.
- Neither function has a **second or third** stall response. There is no
  deload-and-rebuild, and no rotate. `stalled` is a terminal boolean.

### 2b. Four things blind the chat coach

1. **The doctrine exists and nothing enforces it.** `functions/index.js:969-1082`
   already carries MEV/MRV landmarks, *"keep core lifts stable so progression is
   trackable, but rotate accessory/isolation work between blocks — the user's
   unused equipment is a menu for this, not clutter"*, a plateau ladder, A/B
   variant guidance, and an explicit **ROTATION CADENCE** rule: *"repeating a
   day identically for 6+ weeks is staleness… proactively offer ONE swap… pull
   the replacement from list_equipment (prefer never-used machines)."*

   That is precisely the user's request, written into the system prompt, and it
   has not happened. **This is the argument for the whole workstream**: a
   sentence in a prompt is a suggestion the model may or may not act on. Rules
   in code fire every time. Everything below converts advisory prose into
   deterministic behavior — which is the "rules drive, AI explains"
   architecture Kevin asked for.

2. **No goal.** `buildProfileContext()` reads `coachGoal`, `profileExperience`,
   `coachInjuries`, `coachNotes` — in the backup, **all unset**. The profile
   block is height and "6 days/week". It is programming for an anonymous
   person. See §8.

3. **Equipment is in context, but truncated and unranked.**
   `ai-coach-ui.js:1190-1211` already injects an equipment block grouped by gym
   with `[unused]` markers and a deliberate used/unused budget split. The
   remaining gaps are narrow: the per-location cap is **60** against 99 pieces
   at Absolute Recomp, so truncation is real; and nothing conveys *headroom*
   (how much of the library is idle) or staleness ordering.

4. **`update_workout_template` cannot express a day rewrite.** `setExercise`
   changes one exercise by name. Restructuring a day is 6+ sequential calls and
   6 separate action cards to tap. This is why editing a day mid-block feels
   broken.

---

## 3. The design — five layers

Order follows the Helms pyramid: adherence, volume, progression, selection.

### Layer 1 — Template exercises become prescriptions

Additive; absent means today's behavior, so no forced migration.

```js
{
  name: 'Seated Chest Press',
  sets: 4, reps: 10,              // existing — the resolved values
  repRange: [8, 12],              // NEW  the band the block waves within
  rpeTarget: 8,                   // NEW  see note below
  role: 'primary',                // NEW  primary | secondary | accessory | core
  pattern: 'horizontal-push',     // NEW  rotation key
  progression: 'double',          // NEW  double | load-only | rep-only | hold
}
```

**Effort is expressed as RPE, not RIR.** The app already logs `set.rpe` on a
**6–10 scale** when `settings.trackRpe` is on (`active-workout-ui.js:1067`,
`settings-ui.js:21`). Introducing a parallel RIR field would fork the concept.
Where this document discusses reps-in-reserve, the mapping is `RIR = 10 − RPE`.
Note `trackRpe` is currently **off**, so these targets are prescriptive-only
until it is enabled.

`role` is load-bearing: **primaries never rotate, accessories rotate freely.**
Exercise selection sits low on the pyramid, so rotating accessories costs
nothing — but rotating the movement you measure progress on destroys the
progression signal.

`pattern` needs a real vocabulary. The `tags` in `data/exercises.json` will not
serve — the 49-tag vocabulary mixes `compound`/`isolation` with muscle names
and one-off shapes (`fly`, `pushdown`, `kickback`). Seed instead from the
equipment library's `function` field (75 distinct values, describing what the
gym physically has):

```
horizontal-push  vertical-push   horizontal-pull  vertical-pull
knee-dominant    hip-dominant    calf             lateral-delt
rear-delt        elbow-flex      elbow-ext        trunk-flex
trunk-ext        anti-rotation   abduction        adduction
```

### Layer 2 — `weekTargets` carries real periodization

```js
weekTargets: [
  { week:1, label:'accumulate', setDelta:0,  repRange:[10,12], rpeTarget:7 },
  { week:2, label:'accumulate', setDelta:+1, repRange:[10,12], rpeTarget:8 },
  { week:3, label:'accumulate', setDelta:+1, repRange:[8,10],  rpeTarget:8 },
  { week:4, label:'intensify',  setDelta:+2, repRange:[8,10],  rpeTarget:9 },
  { week:5, label:'intensify',  setDelta:+2, repRange:[6,8],   rpeTarget:9 },
  { week:6, label:'deload',     setDelta:-2, repRange:[12,15], rpeTarget:6, weightPct:-35 },
]
```

**⚠ Blocker — the server validator silently drops all of this.**
`validateProgramInput()` at `functions/coach-tools.js:410-419` builds each
entry from a whitelist of exactly `week`, `label`, `weightPct`, `note`. Any
`setDelta` / `repRange` / `rpeTarget` sent through `create_program` *or*
`adjust_program` (both route through this validator, lines 573 and 651-659) is
discarded without error. **Widening this validator is the first task of CP-3,
not an afterthought.**

Related: `coach-tools.js:613` derives the program's deload week from
`weightPct < 0`. A volume-only deload (`setDelta` negative, load unchanged)
would not register as a deload anywhere. That derivation needs to widen too.

**`setDelta` is governed, not free.** Applied per muscle group and capped by
`TrainingInsights.analyzeWeeklyVolume()`'s existing MRV landmark. This is the
loop-closing move in the document: the volume analyzer stops being a dashboard
string and becomes the thing that decides whether the ramp may continue.

Everything is derived at render time from `startDate`, per Phase 9's
derived-week rule. No cron, no stored week state.

### Layer 3 — A stall ladder in `progression.js`

Replace the terminal `stalled` boolean with a counted response. The count
derives from history (consecutive flat-weight sessions ÷ 3), so nothing new is
stored.

| Stall | Action | What the user sees |
|---|---|---|
| 1st | `chase-rep` — hold load, add a rep, tighten rest | "Third session at 190 — hold it and chase 9" |
| 2nd | `back-off` — −10%, rebuild over 2 sessions | "Dropping to 170 for two sessions, then back at it" |
| 3rd | `rotate` — retire for this block, draw a same-`pattern` replacement | "Swapping to Incline Press — 190 has had its run" |

Rung 2 does not exist today and is the fix for the advisory-string bug in §2a.
Rung 3 is where progression hands off to the variety engine. Retired movements
stay in history and are eligible again next block — a rotation, not a deletion.

### Layer 4 — The variety engine (new code)

**This is not mostly-written.** `rankExercisesForLocation()`
(`equipment-planner.js:170-210`) splits available exercises into used /
never-used and sorts **each group alphabetically**. `recentExercises` is used
only as a membership Set — there is no staleness ordering, and its used-first
output order is the opposite of what a rotation engine wants. It supplies the
*eligibility filter* (what exists at this location) and nothing more.

**Where it runs.** `create_program` and `adjust_program` execute server-side
with the Admin SDK. The rotation selection is therefore a **pure function,
mirrored on both sides** — the same pattern the repo already uses for
`coach-outcomes.js` ("functions/coach-outcomes.js mirrors the client module —
keep in sync"):

- `js/core/features/exercise-rotation.js` — pure `selectRotation(slots, equipment, history, opts)`.
- `functions/exercise-rotation.js` — byte-identical mirror, imported by the
  program executors.

Rotated accessories become real template rows by the server calling the
existing `create_workout_template` / `update_workout_template` executors as
part of `create_program`, so one consent still covers the whole block — exactly
as Phase 9 already does for the week plan. The client module serves the preview
and diff card only.

**Selection**, for every `accessory` slot:

1. Filter equipment to the current location (this is what
   `rankExercisesForLocation` supplies).
2. Keep machines whose `exerciseTypes` map to the slot's `pattern`.
3. Rank by **staleness** — never-used first, then longest since `lastUsed`. **New.**
4. Fill. Primaries and secondaries hold.

**Discovery surfaces:**

- **Finish the map.** 5 equipment docs lack `exerciseTypes`; 2 lack names. A
  one-tap "map these 5" card turns dead rows into rotation material.
- **Line-gap suggestions.** The floor carries gym80, Panatta, Gymleco, Newtech,
  Arsenal Strength and Rogers Athletic lines. Lines ship as families, so missing
  members are predictable: *"You have four Panatta Fit Evo pieces — they usually
  ship with a Super Horizontal Row. Is it on the floor?"*
- **Branch scouting.** Other branches carry 450+. When a pattern is poorly
  served at the home gym, surface it: *"Hurst has three hip-dominant machines
  your main gym doesn't."*

Respects the Tier 3 principles: D0 (equipment is enrichment, never a gate), D6
(positive evidence only), D10 (never ask twice).

### Layer 5 — Make the chat coach worth talking to

1. **Enforce, don't instruct.** The doctrine in the prompt is good and is
   already ignored. Layers 1–4 move each rule it states into code that runs
   deterministically; the model's job narrows to *explaining* the resulting
   prescription. Prompt edits are then trimming, not authoring.
2. **Fill the profile** (§8). Four settings fields reframe every answer.
3. **Add a headroom line to the equipment block.** The block exists; what is
   missing is the summary — `Absolute Recomp: 75 machine functions mapped, 41
   unused in the last 6 months` — plus raising or budgeting the 60-piece cap so
   99 pieces are not truncated mid-list.
4. **Add `replace_day`.** A coach tool taking a templateId and a complete
   exercise array, rendering **one** diff card with **one** tap. Keep
   `update_workout_template` for single-field tweaks.
5. **Add `list_exercises`.** `buildExerciseLibraryContext()` is called exactly
   once (`ai-coach-ui.js:1668`) and passed only to `generateWorkoutTemplate`
   (`functions/index.js:2020`) — not into `buildTrainingContext()`. There is no
   `list_exercises` tool. In ordinary chat the coach has **no path to the
   exercise library at all**, which is the complete explanation for "it never
   suggests exercises from my library."
6. **Raise `capTemplates`.** `coach-context.js:68` caps at 10; there are 15
   saved templates, so 5 are absent from every conversation and which 5 depends
   on array order. Compounding it, the library has drifted into near-duplicates
   — `Thursday - Pull Day`, `Thursday - Upper Body Pull`, `Pull Workout`,
   `Pull Day - April 2026 Update`. Raise the cap (or sort by `lastUpdated` and
   mark which are on the week plan) **and** archive the dead ones via the
   existing `archive_template`. Cheap, and a precondition for everything else.

Trust rules unchanged: proposal cards, no silent writes, Phase 9 consent rule.

---

## 4. Phases — one per Claude Code session

| # | Phase | Touches | Gate |
|---|---|---|---|
| CP-0 | Deload detector reads `sessionLabel` + tonnage (Bug 1) | `training-insights.js`, `training-insights.test.js` | a labelled or −25% tonnage week resets the hard-week counter |
| CP-1 | Schema + pattern vocabulary | **`functions/coach-tools.js#normalizeExercise` first** (Bug 7), template writer/reader, `data/exercises.json`, equipment `function` → pattern map | all fields optional; existing templates load unchanged |
| CP-2 | Stall ladder | `progression.js`, **new `tests/unit/progression.test.js`** | see note below |
| CP-3 | `weekTargets` v2 + MRV governor | **`functions/coach-tools.js` validator first**, then `program-session.js` (`applyProgramAdjustment` **and the `weightPct` gates in `programSessionForToday` / `programNoticeForToday`**, Bug 8), `coach-context.js:105`, `functions/index.js:1774`, `training-insights.js` | deload week renders correctly at **both** `propose` and `auto_confirm` |
| CP-4 | Variety engine (new code) | new `js/core/features/exercise-rotation.js` + `functions/` mirror, `equipment-planner.js` | primaries provably never rotate; mirror parity test |
| CP-5 | `replace_day` + `list_exercises` tools | `functions/coach-tools.js`, `ai-coach-ui.js` | one card, one tap, full diff |
| CP-6 | Template cap + library cleanup | `coach-context.js:68`, `archive_template` | all live templates visible in context |
| CP-7 | Discovery surfaces | equipment UI | mockups first, then design-critique + a11y on dev |

**CP-2 note:** there is no `progression.test.js` today — only
`progress-calculations.test.js`, which covers different functions. The
"mirror-test parity" gate has nothing to mirror yet, so CP-2's first task is
writing the characterization tests for current `computeOverloadNudge` /
`progressionTarget` behavior, *then* changing it.

**CP-3 ordering matters.** The validator whitelist (§3 Layer 2) discards
unknown `weekTargets` fields silently. Widen it before touching anything
downstream, or every other change in the phase will appear to work in the
client and write nothing.

**CP-3 must cover `auto_confirm`, not just `propose`.** The auto-confirm rung
applies `weightPct` in `applyProgramAdjustment`
(`program-session.js:206-247`). Set and rep deltas have to land there too, or
auto mode silently keeps applying load-only weeks.

CP-0 is independent of everything and ships first. CP-1/CP-2 are independent of CP-3–CP-7. CP-5 and CP-6 are independently
shippable and have the fastest felt payoff.

Per house rule: **HTML mockups in `mockups/` before any UI work** (CP-4, CP-7).

**Queue placement:** add to `launch-roadmap.md` §4 unified execution queue so
this does not become a fourth parallel plan file. Suggested position — after
the in-progress UX-5/UX-6 row, before Offline support, since CP-5/CP-6 are
small and CP-3 gates the rest.

---

## 5. What can realistically ship before Monday

Nothing in §4 lands safely in a weekend. The block starting Monday should be
**authored by hand** against this spec — §6 is that block. Optional weekend
code, in value order:

1. Fill the four profile settings (§8 — minutes, no code).
2. CP-0 deload detector — smallest change, highest-severity bug, and it is
   firing wrongly during this exact deload week.
3. Archive the duplicate pull/push templates and raise `capTemplates` (CP-6).
4. CP-5 `replace_day` — self-contained, immediately useful.

---

## 6. Appendix A — the block starting Monday 2026-09-21

Hand-authored against the spec above. Six weeks, 2026-09-21 → 2026-11-01.

### Week shape

| Week | Label | Sets vs baseline | Rep range | RPE | Load |
|---|---|---|---|---|---|
| 1 | accumulate | baseline | 10–12 | 7 | 100% |
| 2 | accumulate | +1 | 10–12 | 8 | 100% |
| 3 | accumulate | +1 | 8–10 | 8 | 100% |
| 4 | intensify | +2 | 8–10 | 9 | 100% |
| 5 | intensify | +2 | 6–8 | 9 | 100% |
| 6 | deload | −2 | 12–15 | 6 | −35% |

**Week 1 is a working week, not a deload.** The first draft opened this block
with a −35% week, justified by "twelve months with no break" — a claim drawn
from session counts, which cannot see load. The week of 2026-09-15 is already a
deload. Stacking a second one would spend the recovery twice and delay the
block by a week for no reason. Come off the current deload into accumulation.

### Selection — primaries hold, accessories rotate

Every movement that is *climbing* stays, because it is the measurement. Every
rotation target is already on the Absolute Recomp floor and already in the
library, idle.

**Monday — Upper Push**

| Slot | Action |
|---|---|
| Seated Chest Press | **HOLD** — primary, 200→290 |
| Shoulder Press Machine | **HOLD** — primary, 100→140 |
| Overhead Triceps Extension | **HOLD** — +73% |
| Dips Press Machine | **HOLD** — +41% |
| Pec Deck *(25 sessions, +8%)* | → **Panatta Super Lower Chest Flight** *(idle since Apr)* |
| Incline Chest Press | → **Newtech Incline Chest Press 2** *(needs mapping)* |
| Lateral Raise Machine | → **Standing Lateral Raise** |

**Tuesday — Lower, quad-dominant**

| Slot | Action |
|---|---|
| Machine Squat (Rogers Power Squat Pro) | **HOLD** — primary |
| Leg Press | **HOLD** — primary, 360→450 |
| Leg Extension | **HOLD** — +13% |
| Hack Squat *(−20%, n=8)* | → **Arsenal Strength Pivot Leg Press** *(idle since Apr)* |
| Hip Abduction | **HOLD** — +87% |

**Thursday — Upper Pull**

| Slot | Action |
|---|---|
| Lat Pulldown | **HOLD** — primary; peak was 300 vs 230 now, so rebuild, don't rotate |
| Seated Row Machine | **HOLD** — +83% |
| 45 Degree Linear Row | **HOLD** — +125% |
| Reverse Pec Deck *(21 sessions)* | → **Peck Back** |
| — | **ADD: Panatta Super Pullover** *(idle since Dec 2025)* — a pattern currently untrained |
| — | **ADD: Arsenal ISO Multi Row** *(needs mapping)* |

**Friday — Lower posterior + core** — the day needing the most work

| Slot | Action |
|---|---|
| Back Extension Machine *(**FLAT**, 160→163 over 22 sessions)* | → **Reverse Glute-Ham** *(never used)* |
| Hanging Leg Raise *(**FLAT**, 160→163 over 41 sessions)* | → **gym80 Abdominal Flexor** + **Max Lower Abs** *(both idle)* |
| Leg Curl Machine | **HOLD**, alternating the three you own — **Kneeling / Seated / Lying Leg Curl** |
| — | **ADD: Hip Thrust** *(never used)* |
| — | **ADD: Rogers Hip Press** *(idle since Dec 2025)* |
| Calf Raise Machine | **HOLD** — +25% |

Both genuinely flat lifts are posterior-chain/trunk, and there are **four
unused hip-dominant machines on the floor**.

**Saturday — Light chest & arms + cardio** — purpose unchanged, rotate freely:
**Standing Total Arms**, **Gymleco Forearm Machine** *(idle since May)*.

**Core Focus (floating)** — Machine Crunch **holds** (+46%). Add **Rotary
Torso** *(never used)*: rotation/anti-rotation is absent from twelve months of
training and the machine has been there the whole time.

### Rotation tally

17 slots reviewed, **9 held, 8 rotated or added** — every replacement already
in the library. Nothing required buying, travelling, or discovering anything.
That is the argument for Layer 4 in one line.

---

## 7. Live data still needed

This analysis ran against the 2026-07-04 backup. `device_bash` has **no network
access**, and no service-account key is present in the working tree (correctly
gitignored), so live Firestore could not be read. To refresh, from a terminal
with network:

```
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"
node scripts/backup-user-data.mjs kevin.laperriere@gmail.com
```

That drops a fresh dump in `backups/`, readable from a Cowork session. Open
questions it would settle:

- Does the September deload carry a `sessionLabel`? (Bug 1's severity depends
  on whether the signal is being written at all.)
- What do the in-flight program's `weekTargets` actually contain?
- Did the last ten weeks change the §1 variety picture before Monday is locked?

The backup contains **no `programs` collection**, so the program now ending was
created after 2026-07-04 and none of its data informed this document.

---

## 8. Appendix B — four settings worth two minutes

`buildProfileContext()` reads these; in the 2026-07-04 backup all are empty.

| Setting | Current | Set it to |
|---|---|---|
| `coachGoal` | **unset** | the real one — `recomp` or `cut` fits `weightGoal: lose` |
| `profileExperience` | **unset** | advanced — 276 logged sessions over 12 months |
| `coachInjuries` | **unset** | anything real, or an explicit "none" |
| `trackRpe` | `false` | `true` **if** the Layer 1 `rpeTarget` fields should have real data |

Also five minutes: **five equipment docs have no `exerciseTypes`** (two have no
name). Two of them — Arsenal ISO Multi Row, Newtech Incline Chest Press 2 — are
in the Monday block above.

---

## 9. Bugs confirmed in source

| # | Bug | Location | Severity |
|---|---|---|---|
| 1 | `checkDeloadNeeded()` counts only unique training days — nothing about load or volume. A 6-session deload counts as a **hard week**; the counter only resets below 5 days. So mid-deload the dashboard says *"you've trained hard for N weeks straight, consider a deload."* `sessionLabel`/`basedOn` are persisted (`program-session.js:227`, `ai-coach-ui.js:994`) and never read. | `training-insights.js:228-236` | high |
| 2 | No `list_exercises` tool; `buildExerciseLibraryContext()` reaches only the generator path. The chat coach has no route to the exercise library. | `ai-coach-ui.js:1668`, `coach-tools.js` | high |
| 3 | `validateProgramInput()` whitelists `week`/`label`/`weightPct`/`note`; any richer `weekTargets` field is dropped silently. | `coach-tools.js:410-419` | blocks Layer 2 |
| 4 | Program deload week derived from `weightPct < 0` — a volume-only deload never registers. | `coach-tools.js:613` | medium |
| 5 | `capTemplates = 10` against 15 saved templates — 5 invisible per conversation. | `coach-context.js:68` | medium |
| 6 | `computeOverloadNudge()` offers added load at a detected plateau. (`progressionTarget()` correctly holds — the defect is the string and the missing ladder.) | `progression.js` | low |
| 7 | `normalizeExercise()` whitelists `machine`/`sets`/`reps`/`weight`/`bodyPart`/`equipmentType`/`equipment` — every coach-written template drops Layer 1's `repRange`/`rpeTarget`/`role`/`pattern`/`progression`. The client path (`normalizeExercisesToArray`) passes objects through, so editor-only testing hides it. | `coach-tools.js:264-278` | blocks Layer 1 |
| 8 | `programSessionForToday()` and `programNoticeForToday()` return null unless `weightPct` is nonzero — a volume-only week is invisible in auto-confirm and in the propose-mode hero notice, not just in the deload derivation. | `program-session.js:66,93` | extends Bug 4 |

### Corrections applied in the 2026-09-18 revision

The first draft asserted five things that source review disproved. Recorded so
the reasoning is not repeated:

1. ~~"No doctrine in the system prompt."~~ **False** — extensive doctrine at
   `functions/index.js:969-1082`, including a ROTATION CADENCE rule describing
   exactly the requested behavior. Reframed in §2b.1: the problem is that prose
   does not enforce.
2. ~~"Equipment sits behind an optional tool call."~~ **Half false** — already
   injected with `[unused]` markers at `ai-coach-ui.js:1190-1211`. Narrowed to
   the 60-piece cap and missing headroom summary.
3. ~~"`rankExercisesForLocation()` already ranks by recency."~~ **False** —
   used/never-used split, each sorted **alphabetically**
   (`equipment-planner.js:170-210`). Claim was inferred from the parameter name
   without reading the body. Layer 4 is new code, not plumbing.
4. ~~"`progressionTarget()` pushes into the wall."~~ **False** — it holds the
   weight (`progression.js:154`). Narrowed to the advisory string.
5. ~~"No deload in twelve months."~~ **Unsupported** — derived from session
   counts, which cannot see load. Retracted in §1; it drove the wrong Week 1 in
   Appendix A, now corrected.

The first draft also miscounted twice ("three specific ways" over four items;
"all three findings" over five) and put the tag vocabulary at 48 rather than 49.

---

## 10. Implementation plan (2026-09-18) — shipped to dev same day

What landed differs from the plan in four places, recorded so the doc stays
true: (1) CP-2 rung 3 hands off to CP-4 **client-side** in the active workout
(`selectRotation` over the cached equipment names the replacement in the
nudge) — no `propose_rotation` server tool was needed; (2) mirrors are
**generated** by `scripts/sync-mirror.mjs` (ESM → CommonJS, sibling imports
allowed) and parity-tested, rather than hand-copied; (3) the pattern
vocabulary is 19 values, not 16 — `knee-flexion`, `anti-extension` and
`cardio` were needed to classify the whole built-in library; (4) CP-1b (the
editor UI for role / rep range) was NOT built — rows accept the fields, the
coach writes them, the editor does not yet expose them.

One phase per Claude Code session, one PR each, dev-deploy gate before prod.
Quality bar per CLAUDE.md: `npm test` + `npm run lint` + `npm run audit:design`
on every phase that touches render code; functions phases also need
`firebase deploy --only functions` to dev before the client change that
depends on them.

### Sequence and why

```
CP-0 → CP-6 → CP-5 → CP-1 → CP-2 → CP-3 → CP-4 → CP-7
```

- **CP-0, CP-6, CP-5 first.** Each is a contained fix with a felt payoff and no
  dependency on the schema work. They also make the coach trustworthy enough to
  hand-run the Monday block through it.
- **CP-1 before CP-3.** CP-3's `repRange` / `rpeTarget` semantics are the same
  fields CP-1 defines on exercises, and both need the same two server
  validators widened. Do the vocabulary once.
- **CP-2 before CP-4.** The stall ladder's rung 3 is the mid-block entry point
  into the rotation engine. Ship the ladder with rung 3 rendering as a plain
  swap suggestion, then CP-4 upgrades it to a computed replacement.
- **CP-7 last.** Discovery surfaces are UI on top of CP-4's pattern map and
  need mockups and a design critique.

### Two validators gate everything

Both live in `functions/coach-tools.js` and both drop unknown fields silently:

| Validator | Line | Whitelist today | Widened in |
|---|---|---|---|
| `normalizeExercise()` | 264–278 | machine, sets, reps, weight, bodyPart, equipmentType, equipment | CP-1 |
| `validateProgramInput()` weekTargets loop | 410–419 | week, label, weightPct, note | CP-3 |

The client never strips (`normalizeExercisesToArray` passes objects through),
so a change tested only from the template editor will look fine and then lose
its fields the first time the coach writes the same template. Every phase that
adds a field ships the validator change **and a validator test** in the same
PR.

### CP-0 — Deload detector reads the deload signal (S)

Bug 1. Not in the original phase table; it is the highest-severity item and
the smallest.

1. `training-insights.js#checkDeloadNeeded`: per ISO week, alongside the
   unique-day count, compute `isRecovery`:
   - any workout that week has `sessionLabel` matching `/deload|recovery/i`, or
   - week tonnage (sum of weight × reps over completed working sets,
     unit-normalized the way `aggregators.js` already does it) is below 75% of
     the trailing three-week mean.
   A recovery week resets `consecutiveHardWeeks` (it is the `break`).
2. Return `{ needed, consecutiveHardWeeks, inRecoveryWeek }`; the dashboard
   insight at line 397 stays silent when `inRecoveryWeek` is true.
3. Tests in `training-insights.test.js`: six-session labelled deload resets the
   counter; tonnage-only deload resets it; five ordinary hard weeks still fire;
   a light week by day count still resets as before.

Gate: `npm test`; dashboard on dev during the current deload week shows no
"consider a deload" insight.

### CP-6 — Template cap + library cleanup (S)

1. `coach-context.js#buildTemplatesContext`: accept `{ weekPlan }` in opts.
   Sort on-plan templates first (tag them `[Mon]` / `[Thu]`), then the rest by
   `lastUpdated` desc. Raise `capTemplates` to 20 and emit a trailing
   `…+N more (list_templates has all)` line when truncated, matching the
   equipment block's convention.
2. `ai-coach-ui.js#buildTrainingContext`: pass the cached week plan through.
3. `coach-context.test.js`: on-plan first, cap honoured, truncation line.
4. Manual, in-app: archive the duplicate pull/push templates. No code.

Gate: with 15 templates all live ones appear in the first-turn context.

### CP-5 — `replace_day` + `list_exercises` tools (M)

Independent of the schema work; `replace_day` carries today's exercise fields
until CP-1 widens the normalizer.

1. **`list_exercises`** (`functions/coach-tools.js`): tool definition +
   executor. Source the library the same way the client does (global library
   with the user's `customExercises`, `exerciseOverrides`, `hiddenExercises`
   applied). Emit `name · bodyPart · equipmentType · tags · lastUsed`, grouped
   by body part, with an optional `bodyPart` filter. `lastUsed` comes from the
   workout scan `get_exercise_history` already performs. Cap the output.
2. **`replace_day`**: schema `{ templateId, exercises: [...], why }`, max 12
   exercises, each through `normalizeExercise`. Executor reads the template,
   computes a diff (`kept / changed / added / removed`), writes the full
   `exercises` array, returns `actionCard { kind: 'template_replaced', diff,
   undo: { priorExercises } }`.
3. `ai-coach-ui.js`: render `template_replaced` as one card with the diff list
   (extend the `template_updated` branch near line 765), wire the undo to
   restore `priorExercises`. New handlers get window-assigned at the bottom of
   the module (window-wiring test enforces this).
4. System prompt (`functions/index.js`, tool guidance near line 1073): when a
   request changes more than one exercise on a day, use `replace_day`;
   `update_workout_template` stays for single-field tweaks. Point exercise
   suggestions at `list_exercises` + `list_equipment`.
5. Tests: validator characterization for `replace_day` input; window-wiring
   passes.

Gate on dev: "rewrite my Thursday pull day" produces one card, one tap
rewrites the template, undo restores it, `list_exercises` shows up in the
tool trace.

### CP-1 — Schema + pattern vocabulary (M)

1. New pure module `js/core/features/movement-patterns.js` and a CommonJS
   mirror `functions/movement-patterns.js` (same `// MIRRORS:` header
   convention as `coach-outcomes.js`): the 16-value `PATTERNS` list,
   `inferPattern(exercise)` from name + tags, `patternForEquipment(doc)` from
   `function` and `exerciseTypes`, and `inferRole(exercise, index)` for
   templates that predate the field (compound at index 0–1 → primary,
   isolation → accessory, else secondary).
2. `data/exercises.json`: add `pattern` to all 73 entries by hand. A test
   asserts every entry resolves and every value is in `PATTERNS`.
3. Widen `normalizeExercise` (server): `repRange` two ints 1–50 with lo ≤ hi,
   `rpeTarget` 6–10, `role` / `pattern` / `progression` as enums. Widen
   `validateTemplate` in `template-helpers.js` to the same rules so the client
   editor rejects the same inputs.
4. Tool schemas for `create_workout_template` / `update_workout_template` /
   `replace_day`: document the new fields so the model uses them.
5. **Editor UI deferred to CP-1b** behind a mockup: role chip and rep-range
   field on `.te-row`. CP-1 ships schema, inference and validators only, so
   existing templates render unchanged.
6. Tests: `movement-patterns.test.js`, validator round-trip on the server
   normalizer, `template-helpers.test.js` for the widened validate.

Gate: existing templates load with no visual change; a coach-created template
round-trips `role` and `repRange` through Firestore.

### CP-2 — Stall ladder (M)

1. **Characterization first.** New `tests/unit/progression.test.js` pinning
   all five branches of `computeOverloadNudge` and `progressionTarget` against
   current behaviour, including that the two never disagree on the target.
2. `stallCount(sessions)`: consecutive newest-first sessions at the same top
   weight with `maxReps` not climbing, divided by 3, floored.
   `buildExerciseSessions` already returns the whole history, so no new data
   is needed.
3. `progressionTarget`: replace the single `stalled` branch with the ladder.
   Keep `stalled: true` on all three rungs (the coach context reads it) and
   add `rung: 1|2|3`.
   - rung 1 `chase-rep`: weight W, reps R+1.
   - rung 2 `back-off`: weight = plate-rounded 0.9 × W using the same rounding
     `scaleSessionSetTargets` uses (settings `plateLbs` / `plateKg`, never a
     hard-coded jump), reps = rep target.
   - rung 3 `rotate`: weight W, `rotate: true`.
4. `computeOverloadNudge`: one string per rung from §3 Layer 3; the "try
   `next`" wording disappears from the stall branch.
5. Consumers: `active-workout-ui.js:4026-4030` already seed set rows from
   `_progression.weight`, so rung 2 back-off flows through with no change.
   Rung 3 renders the string plus the existing substitution sheet (T3-4)
   entry point until CP-4 supplies a computed replacement.
6. The coach's stall line in context gains the rung so the model explains the
   right step.

Gate: tests; on device, a known stalled lift shows the rung-1 string and a
seeded rep target, not a heavier weight.

### CP-3 — `weekTargets` v2 + MRV governor (L)

Ordered strictly; step 1 before anything else or the rest writes nothing.

1. **Server validator** (`coach-tools.js:410-419`): accept `setDelta` int
   −3…+3, `repRange`, `rpeTarget` with the CP-1 rules. Replace the deload
   derivation at line 613 with `isDeloadTarget(t)` = `weightPct < 0 ||
   setDelta < 0`. Update the `create_program` tool schema (line 91) and the
   PROGRAMS paragraph in the system prompt to describe the richer shape.
   Deploy functions to dev.
2. **Shared effects helper** in `program-session.js`:
   `weekTargetEffects(target)` → `{ weightPct, setDelta, repRange, rpeTarget,
   changesSession }`. Replace the `weightPct == null || === 0` gates in
   `programSessionForToday` and `programNoticeForToday` with `changesSession`.
   `programSessionMeta` renders `+1 set · 8–10 reps · RPE 8 · −35% weight` from
   whichever effects are present.
3. **Apply path** `applyProgramAdjustment` (lines 206–247): after the
   existing weight scaling, apply `setDelta` (add or trim uncompleted set rows
   at the end, floor 1), clamp seeded reps into `repRange`, and stamp
   `_rpeTarget` on the exercise for the set row to show when `trackRpe` is on.
   Bodyweight exceptions stay as they are.
4. **MRV governor**, new pure `js/core/features/volume-governor.js`:
   `governSetDelta(setDelta, exercises, weeklyVolume)` clamps the delta to 0
   for any exercise whose body part would cross `Config.VOLUME_MRV` this week,
   using `analyzeWeeklyVolume(recentWorkouts, exerciseDatabase)`. Returns the
   clamped deltas plus a reason list so the session meta can say "chest at
   MRV — no extra set".
5. **Renderers**: `coach-context.js#buildProgramContext`, the weekly review at
   `functions/index.js:1774`, and the program detail sheet week rows
   (`program-session.js:349-365`) all render the full target shape.
6. Tests: `program-session.test.js` (volume-only week pre-builds in
   auto-confirm and notices in propose; set add/trim; rep clamp),
   `volume-governor.test.js`, `coach-context.test.js`, server validator test.

Gate on dev: a volume-only week and a deload week both surface at both trust
levels; the hero meta line reads correctly; the governor visibly clamps on a
muscle already at MRV.

### CP-4 — Variety engine (L)

Mockup first: the program-creation card with a "rotated this block" diff, and
the rotated chip on `.te-row`.

1. `js/core/features/exercise-rotation.js`, pure and deterministic:
   `selectRotation({ slots, equipment, location, patternOf, today })`. For
   each `accessory` slot: candidates are equipment at `location` whose
   `patternForEquipment` matches `slot.pattern`, excluding the slot's current
   equipment and anything a primary or secondary slot uses. Rank never-used
   first, then oldest `lastUsed`, then name for a stable tie-break. Returns
   `[{ slot, from, to, equipment, reason }]`. Primaries and secondaries are
   never in the output by construction.
2. `functions/exercise-rotation.js` mirror, plus
   `tests/unit/exercise-rotation-mirror.test.js` that reads both files and
   asserts the pure body is identical after stripping the module wrapper.
3. `create_program` gains `rotateAccessories: boolean`. When true the executor
   runs the rotation per template in the split, writes through the existing
   `update_workout_template` path, adds a rotation summary to the action card,
   and extends the undo payload with prior exercises per template. One consent
   still covers the block.
4. Rung 3 hand-off: a `propose_rotation` live proposal tool that returns the
   top candidate as a `swap` proposal, so CP-2's rotate rung gets a real
   replacement without a full block rebuild.
5. Tests: primaries never rotate (property-style over generated slot sets),
   staleness order, location filter, empty library degrades to a no-op (D0).

Gate: mirror parity test green; on dev, a program created with rotation shows
the diff card, undo restores every template, and every primary is untouched.

### CP-7 — Discovery surfaces (M)

Mockups, then design critique + a11y pass on dev.

1. **Finish the map** card in the equipment library: equipment docs with no
   `exerciseTypes` or no name, one tap into the existing quick-edit sheet.
2. **Line-gap suggestions**: `getCatalogLines(brand)` already lists a line's
   members; diff against owned equipment per line, surface missing members as
   a card with yes / no / not sure (D10 — record the answer, never ask again).
3. **Branch scouting**: for each pattern with fewer than two machines at the
   home gym, count machines at the user's other gyms and surface one line.
   Requires a second mapped gym; hidden otherwise (D6).

### Before Monday 2026-09-21

No code needed. In order:

1. Set `coachGoal`, `profileExperience`, `coachInjuries` in Settings (§8).
2. Archive the duplicate pull/push templates.
3. Map Arsenal ISO Multi Row and Newtech Incline Chest Press 2 (§8).
4. Refresh the backup (§7) and re-check the §1 variety table.
5. Create the Appendix A block through the coach. Until CP-3 ships, only
   week 6's `weightPct: -35` survives the validator; the set and rep shape of
   weeks 1–5 lives in the template rows, edited by hand or via `replace_day`
   once CP-5 lands.
