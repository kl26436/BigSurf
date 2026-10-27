# Big Surf — Training Plan, Goals & Report Card: Design, October 2026

*Written 2026-10-25 from a design conversation with Kevin and a read of the working tree after `9f1bf6b`. Companion to `docs/action-plan-2026-10.md` (AP-n / SH-n). Phases here are tagged **TP-n**, sized S/M/L, one phase = one PR, dev-deploy gate, same conventions. Line numbers drift; search the function name if one is off.*

*Revised 2026-10-25 (night) after a review against the tree: the plan doc points at `preferences/weekPlan` instead of copying the split; `settings.coachGoal` stays as the qualitative direction above structured goals; the report-card week is local Mon–Sun keyed by its Monday; the jargon check reads visible text only; mirror prerequisites (`body-stats.js`, `block-view.js`) are listed; TP-0 and TP-2 are split so a Sunday card ships before goals and the Plan page (order in §3). Then decided: the plan **auto-rolls** its next wave (structure always, rotations by `rotationPolicy`, undo until the first logged session — TP-3), and the shorthand toggle is cut. The phases are rows in ▶ The one queue (`action-plan-2026-10.md`); this doc is the detail.*

*This is a product workstream, not an agent lesson. The coach is one surface in it. Lessons learned building it belong in `docs/agent-field-guide.md`, not here.*

---

## 0. What Kevin asked for, in his words, and what it means

> "I don't think in 6-week blocks. For me it's a continuous effort driven by my goals."

> "I want to see my strength going up. Also weight, DEXA progress. Or planning to be in peak condition for a wedding or a beach trip. The report card should track all of the above."

> "Templates should be centric to the training plan, but if I like a rotation, let me save it to my workout list. Don't overwhelm that list."

> "Every Sunday night."

> "Numbers are fine — acronyms and jargon are hard to follow."

Five decisions fall out of that, and they govern every phase below:

| # | Decision | Consequence |
|---|---|---|
| D1 | **The user never sees a "block."** The plan is one continuous timeline anchored by goals and dated events. | The engine keeps its waves (build weeks + a lighter week — that is what makes progression and deload timing work), but they are invisible scaffolding. `program` docs stay as the engine's unit; a `plan` doc sits above them and the UI stitches programs into one timeline. The word *block* is banned from user-facing copy. |
| D2 | **Goals and events are first-class.** Strength, bodyweight, composition (DEXA), consistency, and "peak for *date*." | New `goals` and `events` collections; a pure `goal-progress.js` that says *on track / behind / ahead* with the rate math behind it. The plan shapes itself toward events (lighter week before, no new exercises in the last two weeks). |
| D3 | **Plan-owned sessions stay with the plan.** "Save to my workouts" promotes one. | Template docs get `planOwned`; the green-button list hides them; the Plan page shows them. |
| D4 | **Sunday night is the check-in.** | The existing weekly-review job moves to Sunday 19:30 local and produces a **report card** object (code) + two sentences and one proposed change (model) + a push. One tap applies the change. |
| D5 | **Numbers stay; jargon goes.** | A `plain-language.js` glossary every surface and the coach read from. e1RM, RPE, MEV/MRV, rung, deload, block, accumulate/intensify never reach the screen. |

The architectural rule is the same one the agent track settled on: **rules compute, the model talks.** Goal progress, the report card, the timeline, the plain phrases are code and unit-testable. The coach is the conversation over them — intake, assembling the plan, explaining, renegotiating.

---

## 1. The concept model

### 1.1 Words the user sees

| User sees | Means | Replaces |
|---|---|---|
| **Plan** | Your continuous training timeline: what you do each day for the next 8–12 weeks, and how it moves toward your goals | "program", "block" |
| **Goal** | A target: a lift, a bodyweight, a composition number, days per week — with or without a date | — (new) |
| **Event** | A date to be ready for (wedding, trip, meet) | — (new) |
| **Report card** | Sunday's one-page summary: showed up · strength · body · goals · recovery · balance · next week's one change | "weekly review" |
| **Lighter week** | A planned week at reduced load | "deload" |
| **Build week / Push week** | The two kinds of normal week | "accumulate" / "intensify" |
| **Main lifts** | The 3–8 exercises the plan tracks strength on | "primaries" (already changed in AP-21) |
| **Estimated max** | What you could probably lift once, from your sets | "e1RM" |
| **Effort (out of 10)** | How hard a set felt | "RPE" |
| **Stuck** | Three sessions without progress at a weight | "stall", "rung" |
| **Enough / too much work** | Weekly sets for a muscle vs the landmarks | "MEV / MRV" |
| **Rotation** | Swapping an accessory exercise for a fresh one | — (fine as is) |

### 1.2 Objects

```
users/{uid}/plan/current           one per user; only what has no home today
  goalIds[], eventIds[]
  cadence { buildWeeks: 3, lighterWeek: true }      how often a lighter week comes
  horizonWeeks: 12                 how far ahead the Plan page fills in
  sessionMinutes                   from intake; the roller caps exercises per session with it
  rotationPolicy: 'ask' | 'auto'   default 'ask'; accessories only — main lifts never rotate (CP-1).
                                   Feeds each wave's trustLevel (TP-3 auto-roll)
  mainLifts[]                      { name, machineId }   (AU-12: exercise + machine)
  fixed                            { mon: { mustInclude: ['Smith Machine Bench Press'] } }
  — the split is NOT here: it stays in users/{uid}/preferences/weekPlan (week-plan.js —
    satisfiedDays / reflowWeek / todayCard / the Settings editor already read it). One
    source of truth for "what's Monday"; the plan, the timeline and the block read it there.

users/{uid}/preferences/settings.coachGoal   unchanged — the one-line qualitative direction
  ("strength — top-line lift numbers"). Not every intention is a number; structured goals
  are the measurable layer beneath it (TP-1).

users/{uid}/goals/{id}
  type        'lift' | 'bodyweight' | 'composition' | 'consistency' | 'balance'
  metric      e.g. 'estimatedMax' | 'weight' | 'leanMass' | 'bodyFatPct' | 'daysPerWeek' | 'patternSets'
  key         lift: { exercise, machineId }   composition: 'totalLeanMass' | 'bodyFatPct'   balance: pattern
  target, unit, direction ('up'|'down')
  by          ISO date or null (open-ended)
  baseline    { value, date }      captured at creation from the data, never typed
  eventId     optional — this goal exists for that event
  status      'active' | 'met' | 'missed' | 'paused'
  note

users/{uid}/events/{id}
  name, date, kind ('look' | 'perform' | 'other'), note
  peakWeeks   default 2 — no new exercises, no lighter week, inside this window
  lighterBefore  default true — the lighter week lands the week before peakWeeks

users/{uid}/reportCards/{weekKey}      written Sunday by the job; read by the page and the coach
  (shape in §4)

users/{uid}/programs/{id}             unchanged — the engine's wave. Never shown by name.
users/{uid}/workoutTemplates/{id}     + planOwned: true, planId, rotatedFrom (exists), savedFromPlan
```

### 1.3 How the pieces move

```
Goals + Events ──► plan/current ──► the planner materializes the next wave (a program doc)
                                    when the active one enters its last week
                                          │
             set rows / dashboard hero ◄──┤  (sessionIntent, progressionTarget — unchanged)
             Plan page timeline        ◄──┤  past programs ∪ active ∪ projected waves to the horizon
                                          │
Sunday 19:30 ──► report-card.js (code) ──► model: 2 sentences + ONE proposal ──► push ──► page ──► tap
                      ▲
   scoreboard · goal-progress · measurements · dexa · adherence · fatigue · pattern coverage
```

---

## 2. What already exists, and what this builds on

| Need | Exists (as of `9f1bf6b`) | Gap this plan closes |
|---|---|---|
| Day-by-day view with past results and future targets | Block page — `block-view.js#buildBlockModel`, `block-ui.js`, route `block`; entry rows in `template-selection.js:388` (`renderBlockLink`) and the dashboard | Shows one program. Needs: continuous timeline across programs, goal/event markers, projected weeks to the horizon, no "block" copy |
| Strength trend on main lifts | `progress-scoreboard.js` (`buildScoreboard`, `pickPrimaries`, `bestE1rmBetween`, `describePrimary`) | Describes trend, not progress toward a target |
| Weekly review | `functions/weekly-review.js` + `weeklyCoachReview` (`functions/index.js:1657`, Monday 14:00 UTC); push via `admin.messaging().send` (`:426`); opt-out `settings.weeklyCoachReview` | Free-text answer. Needs: a structured card computed in code, Sunday schedule, one actionable proposal |
| "Last week was hard" → lighter week | `propose_week_adjustment` → `settings.weekOverride` (AP-23b) | Reachable only by asking. The report card should offer it |
| Next-wave planning with reasons | `create_program` + `rationale`, `get_verdicts {scope:'block'}`, `get_rotation_candidates` (AP-23) | Triggered by conversation only. The planner should propose it on the Sunday card when the wave is ending |
| Bodyweight, DEXA | `body-measurements.js` (`users/{uid}/measurements`), `dexa-scan.js` (`users/{uid}/dexa`, `totalLeanMass` deltas) | Not in any review or coach context; no goals against them |
| Template list hygiene | `template-selection.js:344` filters `!t.archived`; `kind: core|variation|oneOff` (AP-18) | No notion of plan ownership |
| Plain copy | "main lifts" (AP-21), "Lighter week" label (AP-23b) | Everything else still says e1RM, RPE, deload, block, rung |
| The weekly split | `preferences/weekPlan` (`week-plan.js`), edited in Settings | Nothing — the plan reads it, never copies it |
| "What you're training for" | `settings.coachGoal` free text (three readers incl. `weekly-review.js`) | Nothing measurable. Stays as the direction line; structured goals sit beneath it |
| 7-day bodyweight average | inside `body-measurements.js` (imports Firebase / AppState — can't be mirrored) | Pull it out into a pure, mirrored `body-stats.js` (TP-1 prerequisite) |
| Report-card week | `weekly-review.js:25` keys the review by the **UTC** date at run time over a rolling 7 days | A Sunday 19:30 Chicago run is Monday in UTC → wrong key, drifting window. Local Mon–Sun, keyed by that Monday (TP-2a) |

Nothing in the rules engine changes. `sessionIntent`, `progressionTarget`, `weekTargets`, the stall ladder, the fatigue signal, the override — all untouched. This workstream is a layer over them.

---

## 3. Phases

**Order and why (revised):** the Sunday card is the loop Kevin feels each week, and its first version needs neither goals nor the Plan page. Showed up, strength, body, recovery, balance, next week and the stay / lighter-week / swap options all exist in code today. So the card ships second, without its goals row, and the Plan page gets built against two or three real cards' worth of feedback.

```
AU-1   eval baseline              —     first live run + baseline.json; gates every coach PR below
LB-1   equipment-aware patterns   S     before any card prints "Balance" (the AU-13 lesson: "Hinge 0" on the first Sunday burns trust)
TP-0a  plain language, minimal    S     glossary + formatters, the block's strings (A1, A7), the card's sentences, model-side jargon checks
TP-2a  Sunday report card v1      M     report-card.js without goals, Sunday job + push, page, stay / lighter-week / swap, eval mode (A6)
TP-1   goals + events             M     body-stats.js, data, progress math, Goals page, coach tools, coachGoal kept (A4, A5)
TP-2b  report card: goals row     S     goals section + peak option
TP-0b  plain language, UI sweep   S/M   the remaining screens + visible-text jargonInUiStrings budget (before TP-3 ships)
TP-3   Plan page + horizon        M/L   plan doc, block-view.js mirrored, timeline, roller + auto-roll, rotate-accessories option, plan tools (A2, A3)
TP-4   plan-owned sessions        M     planOwned, hidden from list, Save to my workouts
TP-5   planning conversation      M     intake, contract rewrite, eval scenarios
```

Does not block the SH shell work and should not be interleaved with it (different files). Deploy gates as usual: functions changes go to the one project, so AU-9's not-yet-deployed commits land first.

---

### TP-0 — Plain language: one glossary, every surface (TP-0a S, TP-0b S/M)

**Split:** **TP-0a** = the module, the model-side strings (block lines, `verdictLine`, prompt, A1 + A7), the sentences the report card will use, and the model-side checks — what TP-2a needs. **TP-0b** = the screen sweep and the visible-text audit budget, any time before TP-3 ships (TP-3 renames the Block page anyway).

**Context for the coding agent:** user-facing strings live in UI modules (`dashboard-ui.js`, `block-ui.js`, `settings-ui.js`, `active-workout-ui.js`, `progress-scoreboard.js#describePrimary`, `progression.js#computeOverloadNudge`, `coach-rules.js#verdictLine` for the coach's copy) and in `functions/coach-prompts.js`. `scripts/design-audit.js` has a `BUDGETS` pattern with `--strict` (SH-5). Pure modules are mirrored to `functions/` by `scripts/sync-mirror.mjs`.

- New pure, mirrored module `js/core/features/plain-language.js`:
  - `TERMS`: the table in §1.1 as `{ key: { short, long } }`, e.g. `estimatedMax: { short: 'estimated max', long: 'what you could probably lift once, worked out from your sets' }`.
  - Formatters that take numbers and return sentences: `describeStrengthChange({ name, machine, now, prev, unit })` → "Bench press (Smith): estimated max 213 lb, up 4% from a month ago"; `describeEffort(rpe)` → "effort 9 of 10"; `describeStuck(rung, weight, unit)` → rung 1 "stuck at 185 for three sessions — chase one more rep", rung 2 "… backing off 10% to reset", rung 3 "… time to rotate this exercise"; `describeWeekKind(target)` → "Build week" / "Push week" / "Lighter week (−35%)"; `describeVolume(sets, mev, mrv, muscle)` → "Chest: 12 sets this week — enough" / "4 sets — under what it needs" / "26 — more than it can use".
  - `BANNED_UI_TERMS = ['e1RM','RPE','MEV','MRV','rung','deload','block','accumulate','intensify','hypertrophy','periodization','primaries']` (whole-word, case-sensitive where it matters; "block" matches only in strings, not identifiers).
- **TP-0a — model side.** Every line the coach is told to quote goes through `plain-language.js`: `coach-rules.js#verdictLine`, the Today line, the program/intent lines, the scoreboard header, the volume-landmarks line (`js/core/features/coach-context.js`, `js/core/features/coach-context-builder.js`), and the live block (`js/core/features/coach-live.js`) — see A1. `coach-prompts.js` HOW TO ANSWER gains one line — *"Use the user's words: estimated max, effort out of 10, lighter week, build/push week, stuck, main lifts. Never e1RM, RPE, deload, block, rung, MEV/MRV."* — and the verdict glossary moves to the new words (A7). Two checks cover the model side:
  - `no-jargon` in `tests/coach-eval/checks.js`, over the response **and over `contextText` in the trace** — the block's jargon is the model's input, so a leak is traced to its source, not patched in the answer.
  - a snapshot test over `coach-prompts.js`'s user-facing instructions with the same word list.
  - **Exemption:** the `no-jargon` response check skips a term the user's own message contains. "What does e1RM mean?" must be answerable with the word, so the scenario passes when the answer uses the term the user asked about and explains it. `contextText` gets no exemption.
- **TP-0b — screens.** Scoreboard card, dashboard insights, Block page cells and header, last-session card nudge copy, Settings copy (the "Rate your heaviest set" line keeps "6–10" but says "effort"), the week-override card. Internal identifiers (`isDeloadTarget`, `rung`, `intent === 'deload'`, the `block` route) are **not** renamed — churn with no user value.
- **TP-0b — audit.** `design-audit.js` budget `jargonInUiStrings` over **visible text only**, not string literals. A literal scan counts ~270 lines on today's tree, mostly identifiers: `'deload'` intent values, `display: block`, class names. Extract the text from (a) template literals with tags, attributes and `${…}` stripped, and (b) the string arguments of `showNotification`, `confirmSheet` / `promptSheet` and `textContent =` assignments, then match `BANNED_UI_TERMS` whole-word. Opt-out: a trailing `// copy-ok: <reason>` on the line. Start at the real count, ratchet to 0 within TP-0b.
- *Cut:* a "Show the shorthand" toggle (§5). Curious users ask the coach, and the eval exemption above allows that.

Tests (`tests/unit/plain-language.test.js`): each formatter on fixed inputs; rounding (4% not 3.8%); unit passthrough (kg stays kg); rung 0 → empty string; the banned list is whole-word (`blocked` doesn't match `block`). `design-audit` tests (TP-0b): `<div class="block">Lighter week</div>` counts 0; `<span>RPE ${x}</span>` counts 1; `showNotification('Deload set')` counts 1; a `// copy-ok` line counts 0.

Acceptance — TP-0a: the coach block for Kevin's account (`?debug` trace) and a coach answer contain none of the banned terms; `npm run eval:coach` shows no regressions vs the AU-1 baseline. TP-0b: `npm run audit:design:strict` passes with `jargonInUiStrings: 0`; the dashboard, Block page and Settings on dev contain none of them.

---

### TP-1 — Goals and events (M)

**Context for the coding agent:** scoreboard math in `progress-scoreboard.js` (`bestE1rmBetween(workouts, name, unit, from, to, machine)`); bodyweight docs in `users/{uid}/measurements` (`body-measurements.js:157`, fields `weight`, `bodyFat`, `date`); DEXA in `users/{uid}/dexa` (`dexa-scan.js:212`, `totalLeanMass`, regional `leanMass`); pattern sets in `progress-scoreboard.js` patterns; adherence from `week-plan.js#satisfiedDays`. Coach tools and schemas in `functions/coach-tools.js` (AP-18 conventions: enums, `toolError`, reject-don't-coerce). Settings rows in `settings-ui.js`.

**Prerequisite (first commit of the PR):** move the 7-day bodyweight average out of `body-measurements.js` (it imports Firebase, AppState and ui-helpers, so it can't be mirrored) into a pure **`js/core/features/body-stats.js`**, add it to the mirror list, and have `body-measurements.js` re-export it. `goal-progress.js` imports only mirrored siblings (`body-stats`, `progress-scoreboard`, `plain-language`); "mirrored modules import only mirrored modules" fails at deploy time, not in tests, so the mirror test must cover the new files.

**`coachGoal` stays.** It's the qualitative direction ("strength — top-line lift numbers"), and not every intention is a number. Structured goals are the measurable layer beneath it. The block prints it as `Training for: …` above the `Goals:` lines, and the Goals page shows it as an editable one-liner at the top. Migration: the first time the Goals page opens, if `coachGoal` contains a number, offer once to turn it into a goal ("Make '225 bench' a goal?"). Never auto-convert, and never clear `coachGoal`.

**Data:** `goals` and `events` collections as in §1.2. Firestore rules: owner read/write under `users/{uid}/**` (already the pattern). Baseline is **computed at creation** from the relevant source (best estimated max in the last 28 days; 7-day average bodyweight; latest DEXA value; average days/week over 4 weeks) and stored — a goal never asks the user to type where they are.

**Pure module** `js/core/features/goal-progress.js` (mirrored):

```js
export function measureGoal(goal, { workouts, measurements, dexa, plan, today, unit })
// → { now, nowDate, source }         current value by goal type, same rules as the scoreboard
export function goalStatus(goal, now, today)
// → { status: 'ahead'|'on-track'|'behind'|'met'|'no-date', pct, requiredRate, actualRate, projected, weeksLeft, sentence }
```

- Rates are per week. `requiredRate = (target − baseline) / weeksTotal`; `actualRate = (now − baseline) / weeksElapsed` (min 1 week elapsed, else `null` → "too early to say"); `projected = now + actualRate × weeksLeft`. `on-track` = projected within ±2.5% of target (or one `weightIncrement` for lifts); `ahead`/`behind` outside that; `met` when `now` crosses target in the goal's direction. Open-ended goals report `actualRate` and `pct` of a default 12-week horizon with `status:'no-date'`.
- Composition goals are measured only at scan points; between scans `now` is the last scan and the sentence says "next scan will tell — weight trend is {down 1.2 lb} since then" using bodyweight as the proxy.
- Bodyweight uses a **7-day rolling average** (daily weigh-ins are noise), never a single reading.
- `sentence` is built with `plain-language.js`: "Bench: estimated max 213, need 225 by Feb 14 — gaining 1.8 lb/week, need 2.1. Slightly behind." Numbers stay; no jargon.

**UI:** a **Goals** page (route `goals`, reached from Progress and Settings; later the Plan page header). Rows: name · now → target · by date · status pill (ahead / on track / behind / met) · one-line sentence. Add-goal sheet: pick type → pick the thing (lift from main lifts; body metric; days/week; a pattern) → target → date (optional) → optional "for event…". Add-event sheet: name · date · kind (look / perform / other). Baseline is shown, not asked. Pause/complete/delete.

**Coach tools** (`coach-tools.js`, with real schemas): `list_goals` (look-up, includes measured status), `set_goal` (action — same validation as the sheet; rejects a lift not in main lifts with the list), `update_goal` (target/date/status), `add_event`. One line each in the tools prompt. The block gains a `Goals:` section right after the verdicts: one line per active goal with its status sentence — these are facts the model quotes, same rule as verdicts.

Tests (`goal-progress.test.js`): required vs actual rate; on-track band in both directions (bodyweight down, lift up); `met`; open-ended; too-early (`< 1 week`); composition between scans uses the proxy sentence; 7-day bodyweight average ignores a single outlier; baseline computed from fixtures, never from input. `body-stats.test.js`: the extracted average matches the old function on the existing fixtures. Goals page: the `coachGoal` offer appears only when the text has a number, and declining leaves both untouched. `coach-tools-executors.test.js`: `set_goal` rejects an unknown lift and names the main lifts; `list_goals` carries status.

Acceptance: Kevin sets three real goals (a lift, a bodyweight, days/week) and an event on dev; the Goals page shows baseline, now, status and a plain sentence for each; the coach, asked "how are my goals?", quotes the same sentences.

---

### TP-2 — The Sunday report card (TP-2a M, TP-2b S)

**Split:** **TP-2a** ships everything below except the `goals` section, the `peak` / `rotate-accessories` options and `rolled`. `goals: []` is omitted from the page, and options are `stay` / `lighter-week` / `swap`, all buildable from today's code. It also carries the `reportcard` eval mode (A6). **TP-2b** (after TP-1) adds the goals section and `peak`. **`rolled` and `rotate-accessories`** arrive with TP-3, when `plan-roller.js` exists (auto-roll, TP-3).

**Context for the coding agent:** `functions/weekly-review.js` is the production weekly review with an injectable clock (AP-20 split); `weeklyCoachReview` schedules it (`index.js:1657`, Monday 14:00 UTC, `maxInstances 1`, per-user `weekKey` dedupe, opt-out `settings.weeklyCoachReview`); push through `admin.messaging().send` (`index.js:426`, VAPID secret). `coach-rules.js` has `computeVerdicts`, `buildBlockRetrospective`, and the scoreboard mirror. Fatigue/readiness: `fatigueState`, `readinessState`, `checkDeloadNeeded(...).reasons/fatigue/readinessLow`. Week override proposal: `propose_week_adjustment` (AP-23b). This is a **workflow**, not an agent (field guide 7.4): code gathers and grades; the model writes two sentences and picks one proposal from a short list.

**Pure module** `js/core/features/report-card.js` (mirrored):

```js
export function buildReportCard({ workouts, templates, measurements, dexa, goals, events, plan, program, settings, unit, today })
→ {
  weekKey, from, to,
  headline,                              // one computed sentence; the model may rewrite, never contradict
  showedUp: { planned, done, missed: [day], streakWeeks },
  strength: [{ name, machine, estMaxNow, estMaxPrev, deltaPct, trend, repBest, stuck, sentence }],   // main lifts
  body: { weightAvg7, weightPrev4w, deltaLb, lastScan: { date, leanMass, bodyFatPct, deltaFromPrev } | null, sentence },
  goals: [{ id, name, status, sentence }],                       // from goal-progress
  recovery: { effortCreeping: [lift], readinessLow, sentence },  // from fatigueState / readinessState
  balance: [{ pattern, sets, status, sentence }],                // under / enough / more than it can use
  upcoming: { nextWeekKind, eventInWeeks: { name, weeks } | null, waveEndsThisWeek },
  rolled: { programId, rotated: [{ from, to, reason }], undoable } | null,   // TP-3: the auto-roll that ran tonight
  options: [ /* the proposals the model may choose from, pre-validated */
    { kind: 'stay',          label: 'Keep going as planned' },
    { kind: 'lighter-week',  label: 'Take a lighter week', payload: { weightPct: -10|-35, weeks: 1, reason } },
    { kind: 'swap',          label: 'Rotate {exercise}',    payload: { from, to, reason } },   // from get_rotation_candidates
    { kind: 'rotate-accessories', label: 'Rotate {n} accessories', payload: { rotations } },  // TP-3: wave rolled under rotationPolicy 'ask'
    { kind: 'peak',          label: 'Start the peak for {event}', payload: {...} }             // event within peakWeeks+1
  ],
  grade: 'good' | 'solid' | 'rough'     // adherence ≥ 80% and no goal behind → good; adherence < 50% or 2+ behind → rough
}
```

Every sentence comes from `plain-language.js`. `options` are built by code and already valid (the lighter-week payload is what `propose_week_adjustment` would validate; the swap and the rotate-accessories picks come from the rotation engine with the retrospective) — the model **chooses**, it does not **compose**.

**Job:** `weeklyCoachReview` → rename `sundayReportCard` (keep the export name if deploy history matters). Schedule `.schedule('every sunday 19:30').timeZone('America/Chicago')` now; per-user time zone later (`settings.timeZone`, default Chicago). Per user: `buildReportCard` → model call with the card as JSON and a ~200-token system prompt: *"Write the headline in two sentences in the user's words. Pick exactly one option by `kind` and say why in one sentence. Never contradict a number on the card."* → write `reportCards/{weekKey}` with `{ card, builtAt, narrative, chosenOption, model, tokens }` → push "Your week's report card is ready" with a deep link to `#reportcard/{weekKey}`. The spend guards stay (skip zero-workout weeks, per-user dedupe, `maxInstances 1`).

**The week, defined.** A report card covers the **local Monday–Sunday week** in the user's zone (`settings.timeZone`, default `America/Chicago`), and `weekKey` is that Monday as `YYYY-MM-DD`. Today's `weekly-review.js:25` keys by the UTC date at run time over a rolling 7 days, and a Sunday 19:30 Chicago run is already Monday in UTC. That gives the wrong key and a window that drifts with the schedule. `from`/`to` and the dedupe key both come from one pure helper (`reportWeek(now, timeZone) → { weekKey, from, to }`, in `report-card.js`), tested across the CDT/CST change and with a run that crosses UTC midnight.

**A Sunday session logged after 19:30.** The job builds and pushes at 19:30 and does not wait. On open, the page compares the newest in-week workout against `card.builtAt`. If one is newer, it **recomputes the code part of the card** (`buildReportCard` on the client — cheap, no model call) and keeps the stored narrative. The exception is when the stored `chosenOption` is no longer valid under the recomputed `options`: then it falls back to *Keep going as planned* with one line saying why ("Your Sunday session changed the picture — keeping next week as planned"). There's never a second model turn.

The old weekly-review thread seeding is kept as "Discuss this week" on the page (prefill, don't send — AU-14).

**Page:** route `reportcard`, reached from the push, the dashboard (card under For Today on Sunday/Monday: headline + grade), and Progress. Sections in the order above, each with its sentence and a small number row; the goals section links to the Goals page; strength rows to exercise detail. When `rolled` is set (TP-3), a *Your plan continues* section sits above the proposal: next wave's dates and lighter week, plus, under `'auto'`, "Here's what changed" with each swap and its reason, and Undo while `undoable`. At the bottom: the **one proposal as a card** with the model's sentence and a single button ("Make next week lighter" / "Rotate hamstring curl" / "Rotate 3 accessories" / "Keep going"). Tap → the existing executor paths (`settings.weekOverride`, `replace_day`) — the same code the coach's cards use. Past report cards listed below (one line each: date · grade · headline).

**Coach:** the block's `Recent conversations` section gains the last report card's headline and chosen option; `get_report_card { weekKey? }` look-up tool.

Tests (`report-card.test.js`): adherence from a fixture week plan; strength rows match `buildScoreboard` for the same fixture; body sentence with and without a scan; `options` always includes `stay`; `lighter-week` offered only when fatigue/readiness/behind-on-recovery says so; `rotate-accessories` only when a wave rolled under `'ask'` with candidates, never under `'auto'`; `peak` only inside `peakWeeks + 1` of an event; `grade` thresholds; no banned terms in any sentence; `reportWeek` for a Sunday 19:30 Chicago run returns that week's Monday in both CDT and CST; recompute-on-open keeps the narrative when the option is still valid and falls back to `stay` when it isn't. `coach-eval`: scenario "Sunday card — good week" (must choose `stay`), "Sunday card — effort creeping on two lifts" (must choose `lighter-week`), "Sunday card — wave ending, rotationPolicy ask" (must choose `rotate-accessories`; **TP-3**). Window-wiring test for the page's handlers.

Acceptance — TP-2a: Sunday 19:30 on dev, the push arrives; the page shows the week in plain sentences with real numbers; balance shows the hinge sets Kevin logged (LB-1 landed); the proposal is one of the pre-built options; one tap applies it and Monday's session reflects it. TP-2b: the goals section quotes the same sentences as the Goals page.

---

### TP-3 — The Plan page and the rolling horizon (M/L)

**Context for the coding agent:** `block-view.js#buildBlockModel({ program, templates, workouts, prs, today, unit, scoreboard })` builds one program's grid; `targetFor` computes future targets with the seeder's math; `block-ui.js` renders one section per week; entries at `template-selection.js:388`, the dashboard program line, Settings, and the coach's program card. `deriveProgramWeek` / `weekTargetEffects` / `isDeloadTarget` in `week-targets.js`. `create_program` (coach-tools.js) validates shape (AP-17: ≥ 4 weeks needs a lighter week) and requires `rationale` at ≥ 4 weeks.

**Prerequisite (first commit of the PR):** add **`block-view.js`** to the mirror list. Its imports (`session-intent`, `progression`, `week-targets`, `movement-patterns`, `coach-outcomes`) are already mirrored, so this is a sync and a mirror-test entry, not a refactor. `plan-timeline.js` is mirrored too. `functions/plan-roller.js` (server-only, like `weekly-review.js`) needs the timeline's event-adjusted week kinds to draft the next wave, and a server module that requires an un-mirrored client file fails at deploy, not in tests.

**The split comes from `preferences/weekPlan`**, never from the plan doc (§1.2). `buildPlanTimeline` takes `weekPlan` as an input, and the roller reads it the same way. `update_plan`'s split edits write `weekPlan` (A3).

**The plan doc** (`plan/current`, §1.2). Created the first time a program is created or by TP-5's intake; `cadence` defaults `{ buildWeeks: 3, lighterWeek: true }`; `horizonWeeks: 12`. Engine mapping: one wave = `cadence.buildWeeks` build/push weeks + 1 lighter week = one `program` doc with `weekTargets` the way they exist today.

**Pure module** `js/core/features/plan-timeline.js` (extends, does not replace, `block-view.js`):

```js
export function buildPlanTimeline({ plan, weekPlan, programs, templates, workouts, goals, events, override, today, unit, inc })
→ { weeks: [{ weekStart, kind: 'build'|'push'|'lighter'|'peak', state: 'past'|'current'|'planned'|'projected',
              programId|null, days: [cell], markers: [{ type:'goal'|'event'|'lighter'|'wave-end', label }] }],
    goalsStrip: [...], horizonEnd }
```

- `past` and `current` weeks come from real programs and real workouts (`buildBlockModel` cells, reused). `planned` weeks are the active program's future weeks (targets from `targetFor`). `projected` weeks run from the end of the active program to `horizonEnd` using `cadence`: same split, week kind from the pattern, **no numbers** — a projected cell shows the session name and "build" / "lighter", because loads that far out would be invented. Events override the pattern: `peak` weeks inside `event.peakWeeks`, a `lighter` week placed just before them, and the pattern re-aligns after.
- Markers: each goal's `by` date and each event's date on its week; the override's label; where one wave ends and the next begins is **not** marked — it is scaffolding.

**The planner** (code, not the model): `functions/plan-roller.js`, called by the Sunday job. When no active program covers the coming week (the active one ends this Sunday, or none is active and a plan exists), build the **next wave**: split from `weekPlan`, length from `cadence`, week kinds from the pattern adjusted for events, main lifts held, accessories rotated by `selectRotation` with the previous wave's retrospective (`buildBlockRetrospective`), levers from the same defaults `create_program` uses today, `rationale` assembled from code (fixed: main lifts with "so your strength numbers stay comparable"; changed: each rotation with the engine's reason; watch: the goals' sentences).

**Auto-roll: the plan continues unless you stop it** (decided 10/25; was §5's open question). Setting a cadence ("three build weeks, then a lighter one") is the standing instruction. It works the way a recurring calendar event is consent for every occurrence, so materializing the next wave applies a decision already made, not a new one. The alternative breaks D1 in the worst way: silently. The ladder keeps progressing so nothing looks wrong, no lighter week ever comes, and weeks later the fatigue signal starts nagging. The roll is split by what it changes:
- **Structure rolls unconditionally.** Weeks, week kinds, the lighter week, events' peak/lighter placement, the **same sessions** (same plan-owned templates, no new ones). The roller calls the same executor path `create_program` uses, with the code-built draft. This is pure continuation.
- **Rotations follow `plan.rotationPolicy`** (accessories only; main lifts never rotate — CP-1).
  - `'ask'` (default): the roll carries no rotations. If the engine has candidates, the card's option is **`rotate-accessories`** ("Rotate 3 accessories", payload = the `selectRotation` picks with reasons). A tap applies them through `replace_day` on the new wave's plan-owned templates.
  - `'auto'` (once the user says so, in Settings or to the coach via `update_plan`): the roll applies the rotations, and the card shows a **"Here's what changed"** section (each swap and its reason) with undo instead of offering them.
- **One trust setting, not two.** `rotationPolicy` is where the existing program `trustLevel: 'propose' | 'auto_confirm'` (`program-session.js:63`, `dashboard-ui.js:673`, the Settings toggle at `settings-ui.js:245`) goes to live. The roller stamps each new wave's `trustLevel` from it (`'ask'` → `'propose'`, `'auto'` → `'auto_confirm'`), and the Settings toggle edits `plan.rotationPolicy`. *Verify when building:* `auto_confirm` today also means "the dashboard pre-builds the full session." If that turns out not to be what `'auto'` should mean, keep the two fields, but the user still sees one toggle.
- **Undo, and when it stops being undo.** The roll writes `rolledAt`, `rolledBy: 'auto'` and the applied rotations onto the new program doc. While **no completed workout is dated inside the new wave**, undo is clean: delete the program doc, reverse any applied rotations, and the Plan page shows projected weeks again. Once a session is logged under it, undo becomes *Change my plan* (→ coach, prefilled, never sent). The notice says which one applies:
  - before the first logged session: "Your plan continues — the next 4 weeks are set: same sessions, lighter week Nov 23. Undo"
  - after it: "… Change my plan"
- **Shaping the next wave in conversation** still goes through `draft_next_wave` (A3). Auto-roll only changes the default from "the plan stops" to "the plan continues." A user who reshapes it in chat replaces the rolled wave (allowed only before its first logged session — the same rule as undo).

The model's share of all this is the card's sentence about it. Nothing here waits on a model turn.

**Page:** route `plan` (alias `block` kept for existing links for one release). Header: plan name (user-named; default "My plan") · the goals strip (each goal: name · status pill) · next event countdown · "this week: Build week 2" (never "week 2 of 4"). Then the timeline: past weeks collapsed (tap to expand), current week open with today's Start button, planned weeks with targets, projected weeks dimmed with a thin "projected" label. Day cells as today (session name · week kind badge · past: top set vs target ✓/↓ · missed). Tap a cell → session sheet (`buildBlockSession`, unchanged). Actions: *Make this week lighter* · *Rotate an exercise* · *Change my plan* (→ coach, prefilled with the plan summary; never sent) · *Goals*.

Copy sweep: `renderBlockLink` → "Your plan"; dashboard line → "Plan · Build week 2 · next lighter week Nov 16"; coach card "View block" → "View plan". `rationale` headings on the page: "What stays the same and why" / "What's new and why" / "What we're watching".

Tests (`plan-timeline.test.js`): past/current/planned/projected classification against a fixture; projected weeks follow cadence and have no targets; an event inserts peak weeks and a lighter week before them and the pattern re-aligns; goal and event markers land on the right weeks; no active program + plan → all weeks projected from the split; `plan-roller.test.js`: draft respects main lifts, rotates only accessories, carries a code-built `rationale`, rolls only when no program covers the coming week (never twice for one week — idempotent on the job's retry), reads the split from `weekPlan`, caps exercises per session from `sessionMinutes`. Auto-roll: `'ask'` rolls structure with zero rotations and the card offers `rotate-accessories`; `'auto'` applies them and the card lists them; undo deletes the doc and reverses rotations when no workout is dated inside the wave, and is refused (→ *Change my plan*) after one is; the new wave's `trustLevel` matches `rotationPolicy`. Mirror parity test includes `block-view.js`, `plan-timeline.js` and `body-stats.js`. The card's `rotate-accessories` option and the "wave ending" eval scenario land here (TP-2 split).

Acceptance: the Plan page shows roughly three months in one scroll — what was done, this week, the planned weeks with numbers, projected weeks without, with Kevin's goals and his event on the timeline; the word "block" appears nowhere; when a wave ends, the next one is there Monday morning without a tap — same sessions, lighter week in place — with a notice and undo, and Sunday's card offers the rotations (`'ask'`) or lists them (`'auto'`).

---

### TP-4 — Plan-owned sessions and "Save to my workouts" (M)

**Context for the coding agent:** `template-selection.js:344` (`activeTemplates = allTemplates.filter(t => !t.archived)`), the archived group render (`:371`, `:514`); template `kind` enum and the near-duplicate guard (Jaccard ≥ 0.7, `coach-tools.js` ~`:1677`) from AP-18; `create_program` creates/links templates; `replace_day` edits a template in place; `js/core/features/coach-context.js` `capTemplates`. Templates live in `users/{uid}/workoutTemplates`.

- Templates created by `create_program` / the planner get `planOwned: true, planId`. `replace_day` on a plan-owned template keeps it plan-owned. The main Workouts list filters `!t.archived && !t.planOwned`; a **"Your plan"** group sits at the top of the Workouts tab (replacing `renderBlockLink`'s single row) listing this week's plan sessions with the Start affordance — so the green button still reaches today's session in one tap.
- **Save to my workouts** (session sheet on the Plan page, and the ⋮ menu of a plan-owned template): clones the template as `kind: 'core', savedFromPlan: { templateId, planId, date }`, `planOwned: false`, name editable (default "{name} (saved)"). The clone bypasses the near-duplicate guard (`savedFromPlan` is the explicit intent). Future rotations touch the plan's copy only.
- When the planner rotates an exercise out, the old plan-owned template stays for history (workout docs reference it) but is `archived: true` once no planned week uses it; the archived group already hides it.
- Coach context: plan sessions are listed through the plan (`Plan sessions: Push A, Pull A, Legs A (this week)`), not counted against `capTemplates`; user templates keep the cap. `list_templates` returns `planOwned` so the model can tell them apart; `create_workout_template` from a planning conversation sets `planOwned: true` when a plan exists and the model says `forPlan: true` (schema field, default false).
- Manual start from a plan-owned template (Workouts tab "Your plan" group) gets the week's `sessionIntent` like the hero does — it already does via `getSessionIntent` at start (AP-6); verify, don't rebuild.

Tests (`template-selection` unit test or a new `template-list.test.js`): plan-owned excluded from the main list, present in the plan group; save-from-plan clone shape, guard bypassed, original untouched; rotated-out template archived only when unused by planned weeks. `coach-tools-executors.test.js`: `list_templates` carries `planOwned`; `forPlan` sets ownership.

Acceptance: after a planning conversation creates six sessions, the green-button list shows only Kevin's hand-built workouts plus a "Your plan" group with this week's sessions; "Save to my workouts" on one of them adds exactly one row to his list; rotating it next wave does not change the saved copy.

---

### TP-5 — The planning conversation (M)

**Context for the coding agent:** coach job 1 and the Plan contract (AP-19 contract B, `functions/coach-prompts.js`); seeded entry points `askCoachSeeded` (`block-ui.js:274`, `program-session.js:461`) — AU-14 says prefill, never send; planner tools (AP-23); eval runner and scenarios (`tests/fixtures/coach-scenarios/`, `tests/coach-eval/`).

- **Intake** (first plan, or "Change my plan"): the coach asks at most four things it cannot compute — days per week and which days; minutes per session; anything fixed ("I always want to bench Monday"); the goals and events, pulled from TP-1 or set via `set_goal` / `add_event` in the conversation. Everything else (main lifts, rotation candidates, baselines, equipment at the gym) is computed and stated, not asked.
- **Contract B rewritten without "block":** (1) *Your plan in one line* — goals, event, cadence ("three build weeks then a lighter one, through February"); (2) *A typical week* — the split, each session's exercises, main lifts marked; (3) *How the weeks differ* — build / push / lighter, with the levers in plain words ("add a set", "a little heavier, two reps in the tank", "35% lighter"); (4) *What stays the same and why*; (5) *What's new and why*; (6) *What we're watching* — the goal sentences. The same six parts go to `create_program.rationale` and render on the Plan page. Keep the worked example in the prompt (field guide 4.4).
- **Renegotiation** stays as built (`propose_week_adjustment`, `replace_day` via `get_rotation_candidates`), plus the goal tools: "I want to drop to 185 by the wedding" → `set_goal` with the event, and the plan's projected weeks re-shape on the next render.
- **Entry points** prefill the coach input with a visible, editable seed and focus it — from the Plan page ("Change my plan"), the report card ("Discuss this week"), the Goals page ("Plan around this goal"), and the empty Plan page ("Build my plan"). Fix AU-14 here if it hasn't landed.
- **Eval scenarios** (`scenarios.js`): *goal-driven first plan* (must call `list_goals`, `set_primary_lifts`, `create_program` with `rationale`; four days; no jargon; cadence stated); *event peaking* (event in 6 weeks → the plan's last two weeks are peak, lighter week before, no new exercises in peak); *behind on a goal at the Sunday card* (quotes the goal sentence; picks one lever; no template write); *"I don't think in blocks"* — a user who says the plan feels like restarts must get an answer that never uses the word and describes the timeline instead.

Tests: `coach-eval` scenarios above; prompt snapshot test that the banned terms are absent from `coach-prompts.js` user-facing instructions; `window-wiring` for the new entry points.

Acceptance: from an empty Plan page, one conversation of ≤ 6 turns produces a plan Kevin would follow, with his goals on the timeline and his sessions under "Your plan"; the conversation never says block, deload, e1RM or RPE; the Plan page shows the six-part rationale under the plain headings.

---

## 3b. As built — LB-1, TP-0, TP-1, TP-2 (2026-10-26)

*Branch `training-plan-tp0-tp2` (merged with `launch-leftovers`). 1474 tests green, lint at the 17 baseline, design / shell / jargon audits pass. `npm run eval:coach` not run — no API key in the session and no baseline (AU-1 is still first).*

- **LB-1** — the machine only decides hinge vs lumbar for a back extension (feeding equipment text into every rule mislabels: "Hammer Strength Flat" made bench a curl). A plain "Back Extension" keeps AU-13's library stamp (hip-dominant).
- **TP-0** — `plain-language.js`; context lines, prompt contracts, verdict glossary and screens in plain words. Program weeks read as their **kind** everywhere (`weekKindLabel` — "lighter" follows the levers, the model's label only separates peak / push / build); `sessionIntent.label` is the kind, `programLabel` keeps the model's. The jargon budget scans visible text only (`scripts/jargon-audit.js`): 0. The shorthand toggle was cut.
- **TP-1** — `settings.coachGoal` turned out to be an **enum** (cut / bulk / recomp / strength / general), not free text, so the "turn it into a goal if it has a number" offer had nothing to act on. It stays the direction: the profile line now reads `Training for:` and the Goals page shows it as the same segmented control. The offer moved to coach memory (prompt: a remembered goal with a number → offer `set_goal` once, then `forget_fact`). Tools: `list_goals`, `set_goal` (rejects non-main lifts, naming them; refuses a duplicate active goal → `update_goal`), `update_goal`, `add_event`. A4's tool retirement (`get_program` / `get_week_plan` → `get_plan`) waits for TP-3; chat tools are 28.
- **TP-2** — built as 2a + 2b together (goals section and the `peak` option included). `swap` comes from the card itself: the accessory stuck longest at rung 3 (nine flat sessions) on the week plan, replaced by `rankRotationCandidates`. `peak` = "take the lighter week before {event}" when that week is next week. A swap is applied on the client (`applyRotation` on the plan's workout); lighter / peak write `settings.weekOverride` exactly as the coach's card does. Rollout: `settings.reportCard` (off by default; the page has "Turn on" and Settings a row) — the Monday review skips card users. `requestReportCard` builds the current week on demand (1/day, admin exempt) so dev can be checked without waiting for Sunday. The model reply is JSON `{headline, choice, why}`; an unknown choice or unparsable reply saves the card with its computed headline and `stay`.

## 3c. As built — TP-3 (2026-10-26)

- **Modules:** `plan-timeline.js` + `plan-roller.js` (pure, mirrored, with `block-view.js`); `functions/plan-roll.js` (server-only load + roll); `plan.js` (client data). The Sunday job rolls the plan **before** it builds the card, for every user with `plan/current`, independent of the report-card flag.
- **The plan doc** is created by `create_program` (its shape becomes the cadence — `cadenceFromProgram`), by `update_plan`, or by "Turn it on" on the Plan page for a program made before TP-3. No plan doc → no roll: the cadence is the consent.
- **Roll timing:** the next wave starts the day after the last one when that day hasn't passed (an unbroken chain), else next Monday; the job only rolls the coming week, and a retry finds it covered. The previous wave is set `active:false, state:'finished'`.
- **Levers:** a previous wave of the same shape keeps its week targets; otherwise defaults per kind (build / build +1 set / push effort 8.5 / lighter −35 % −1 set / peak effort 9).
- **Events:** the peak window is the `peakWeeks` weeks before the event's week plus that week; the lighter week is the week before it (the same rule the card's `peak` option uses). No rotations in a wave that contains a peak week.
- **Rotations:** `'ask'` → `pendingRotations` on the program; the card's `rotate-accessories` option and the Plan page's "Rotate them" apply them (rows that changed since are skipped). `'auto'` → applied with the roll, prior exercise lists kept for undo. The Plan page has the Ask me / Do it switch.
- **Undo** (Plan page) while no workout is dated in the wave: restore swapped workouts, delete the wave, reactivate the previous one, **pause the plan** (or next Sunday would roll it again). After a logged session it's *Change my plan* (coach, prefilled).
- **Not done here:** `trustLevel` is carried from the previous wave, not tied to `rotationPolicy` — `auto_confirm` also means "the dashboard pre-builds the session", a different decision; the Settings toggle still edits the program. `sessionMinutes` is stored and shown to the coach but caps nothing yet — TP-3 never composes sessions (the roll reuses them); it matters for TP-4/5.
- **Coach:** `get_plan`, `update_plan`, `draft_next_wave`; `get_program` / `get_week_plan` retired from the tool list (A3) — 29 chat tools. The `Your plan:` line (A2) sits after the Today line. Eval: `reportcard-wave-ending` (the runner rolls first, as the job does).

## 3d. As built — TP-4 (2026-10-26)

- `plan-sessions.js` (pure, mirrored): `splitTemplatesForList`, `planWeekSessions`, `cloneForMyWorkouts`, `planTemplatesToArchive`, `formatPlanSessionsContext`.
- **Ownership only comes from building for the plan.** `create_program` links whatever is on the split — today that's Kevin's hand-built workouts — so it does NOT mark templates plan-owned (that would hide his own workouts from his list). `create_workout_template { forPlan: true }` does, when `plan/current` exists (`planId: 'current'`). `replace_day` writes `{ ...template, exercises }`, so ownership survives a rewrite. The near-duplicate guard still applies to plan sessions (the coach reuses an existing workout rather than cloning it); only "save to my workouts" bypasses it.
- **Workouts tab:** the list is the user's own workouts; the "Your plan" group on top replaces the single plan row — the row that opens the Plan page, then this week's sessions from the week plan (whoever owns them) with Start, today highlighted, and a save button on plan-built ones. The session sheet on the Plan page has *Save to my workouts* too. The copy is `kind: 'core'`, `planOwned: false`, `savedFromPlan: { templateId, planId, date }`, name editable (default "{name} (saved)").
- **Archiving:** the Sunday roll archives plan-owned sessions that neither the week plan nor any wave still running from the new wave's first day uses (they stay for history). The user's own workouts are never archived by it.
- **Coach:** plan sessions leave the capped "User's saved workouts" block and get a `Plan sessions:` line; `list_templates` returns `planOwned`.
- **Verified, not rebuilt:** a session started from the Workouts tab gets the week's intent at start (`stampSessionIntent` reads the active program whoever owns the template).

## 3e. As built — TP-5 (2026-10-26)

- **Intake** lives in the PLAN contract: at most four questions in one message (days, minutes, anything fixed, goals / dates), skipped when the message, the Goals lines or memory already answer them; answers are stored (minutes + fixed → `update_plan`, goals → `set_goal`, dates → `add_event`); main lifts are proposed from history, not asked for.
- **Contract B** in the spec's order (plan in one line · a typical week · how the weeks differ · stays the same · what's new · what we're watching), with the worked example; the same parts go to `create_program.rationale`. With a plan in place the coach starts from `draft_next_wave`. Peaking before a date: label the weeks Peak, effort 9, no rotation, a lighter week before them.
- `update_plan { fixed }` (day → `mustInclude`), shown on the `Your plan:` line. The roller doesn't enforce it — it reuses sessions; it's a constraint for the coach when it composes.
- **Entry points** already prefill (AU-14): Plan page *Change my plan* / *Build my plan*, report card *Discuss this week*, Goals *Plan around my goals*; the starter text now invites the intake.
- **Eval:** `plan-first-goals`, `plan-event-peak` (new `program-shape` check: peak weeks last, a lighter week before them, no rotation), `reportcard-goal-behind`, `plan-no-blocks` (the word banned even though the user said it); `program-rationale` check. 30 scenarios — none run against the API yet.

## 4. Report card — the Sunday page, as the user reads it

```
Week of Oct 19 – 25                                            Solid week

You showed up 4 of 4 days — three weeks running.
Strength is moving on three of five main lifts; hamstrings are the one to watch.

SHOWED UP        Mon Push ✓ · Tue Pull ✓ · Thu Legs ✓ · Sat Upper ✓

STRENGTH         Bench press (Smith)      est. max 213 lb   ▲ 4% vs a month ago
                 Hack squat                est. max 290 lb   ▲ 2%
                 High row (Newtech)        est. max 373 lb   ● about the same
                 Shoulder press            est. max 190 lb   ▲ 3%   new rep best 160×10
                 Seated leg curl           est. max 142 lb   ▼ 3%   stuck at 115 three sessions

BODY             186.4 lb (7-day avg) · down 1.1 lb vs a month ago
                 Last scan Sep 30: lean mass 152.3 lb (+0.8) · body fat 18.9% (−0.6)

GOALS            Bench 225 by Feb 14        slightly behind — gaining 1.8 lb/wk, need 2.1
                 182 lb by the trip (Jun 6) on track — losing 0.3 lb/wk, need 0.2
                 4 days a week              met — 4.0 over the last 4 weeks

RECOVERY         Effort is creeping on leg curl (8 → 9 → 9.5 at 115). Readiness fine.

BALANCE          Hamstrings 4 sets this week — under what they need, second week running.

NEXT WEEK        Build week 3 · lighter week starts Nov 2 · beach trip in 32 weeks

┌──────────────────────────────────────────────────────────────────────┐
│ Rotate seated leg curl → standing leg curl (never used at your gym)  │
│ You're stuck and effort is climbing; a fresh angle on the same       │
│ muscle keeps hamstrings moving without touching your main lifts.     │
│                                                   [ Rotate it ]      │
└──────────────────────────────────────────────────────────────────────┘
                                          Discuss this week · Past report cards
```

Everything above the box is code. The two sentences under the date and the three in the box are the model's — chosen from options the code built.

---

## 5. Open questions (decide as they come up, not now)

- **Grades.** `good / solid / rough` is the proposal. Letter grades (A–F) are more "report card" and more motivating for some, more punishing for others. Try the three words first; swap is one table.
- **Time zone.** Hard-coded Chicago for the schedule until there is a second user; `settings.timeZone` is the field when needed.
- ~~**Projected weeks and the engine.**~~ **Decided 10/25: auto-roll** — structure always, rotations by `rotationPolicy` (`'ask'` default), undo until the first logged session. See TP-3 *Auto-roll*.
- ~~**"Show the shorthand" toggle.**~~ **Cut 10/25.** It would double every formatter's output for a feature no one asked for. The learning case is covered by asking the coach ("what does estimated max mean?"), which the `no-jargon` check allows (TP-0a). If a second user asks for it, the `TERMS` table makes it a day's work then.
- **Multiple plans** (a travel plan, an injury plan). Out of scope; `plan/current` is deliberately singular.
- **Monetization.** The report card is one model turn per user per week — the cheapest high-value surface in the app (field guide 7.5). Likely the paid tier's anchor; nothing here depends on that.

## 6. Phase index

| Phase | Size | Depends on | One-line |
|---|---|---|---|
| TP-0a | S | AU-1 (baseline) | `plain-language.js` glossary + formatters (mirrored); the block's strings, `verdictLine`, prompt line + verdict glossary (A1, A7); `no-jargon` eval check over response + `contextText`; prompt snapshot test |
| TP-2a | M | TP-0a, LB-1, AP-22, AP-23b, AU-1 | `report-card.js` without goals; local Mon–Sun `reportWeek`; Sunday 19:30 job + push; page with recompute-on-open; stay / lighter-week / swap; `reportcard` eval mode (A6) |
| TP-1 | M | AP-21 (main lifts), TP-0a | `body-stats.js` (mirrored) first; `goals` / `events`, `goal-progress.js`, Goals page with `coachGoal` on top, `list_goals` / `set_goal` / `update_goal` / `add_event`, Goals section in the block (A4, A5) |
| TP-2b | S | TP-1, TP-2a | Goals section on the card, `peak` option, coach reads it |
| TP-0b | S/M | TP-0a | Screen sweep, visible-text `jargonInUiStrings` budget with `// copy-ok` opt-out |
| TP-3 | M/L | AP-24, AP-23, TP-1, TP-0b | `block-view.js` mirrored first; `plan/current` (split stays in `weekPlan`), `plan-timeline.js`, `plan-roller.js` with auto-roll (structure always, rotations by `rotationPolicy`, undo until first logged session), Plan page, `rotate-accessories` option, plan tools (A2, A3) |
| TP-4 | M | TP-3 | `planOwned`, "Your plan" group on Workouts, Save to my workouts, coach context via the plan |
| TP-5 | M | TP-1…4, AP-19 | intake, contract B without "block", prefilled entry points, four eval scenarios |

---

## 7. What changes in the agent — review against the field guide (2026-10-25)

*The design keeps the architecture the agent track settled on: rules compute, the model talks; the report card is a workflow, the planner is code. Seven things on the agent side are missing or half-said. Each is assigned to the TP phase that should carry it.*

| # | Change | Why | Phase |
|---|---|---|---|
| A1 | **The block must be plain-language too, not just the screens.** Today the block says `program week 5 of 6 — baseline`, `Deload check: in a recovery week now`, `stall rung 1 (4 sessions at 140)`, `MEV 8 · MRV 22`, `best estimated 1RM` (`js/core/features/coach-context.js:150-220`, `js/core/features/coach-context-builder.js`, `js/core/features/coach-rules.js#verdictLine`, `js/core/features/coach-live.js:455`). The prompt tells the model to *quote* these lines ("quote them, don't re-derive"), so a prompt rule saying "never say deload" fights the block's own text — and loses often enough to fail the eval. | TP-0's sweep lists `verdictLine` but not the Today line, the program/intent lines, the scoreboard header, the volume-landmarks line, or the live block. All of them are rendered through `plain-language.js`. The `no-jargon` eval check runs over **`contextText` in the trace as well as the response**, so a leak is traced to its source, not patched in the answer. | TP-0a |
| A2 | **A `Your plan:` line replaces the `Active program:` line, and the Today line speaks in week kinds.** Today: `Tue 2026-10-27 · planned: Push · program week 5 of 6 — baseline · gym: …`. After: `Tue Oct 27 · planned: Push · Build week 2 · lighter week starts Nov 16 · beach trip in 32 weeks · gym: …`, then `Your plan: 4 days (Mon Push · Tue Legs · Thu Pull · Sat Upper) · three build weeks then a lighter one · through Feb · 3 goals (1 behind) · 1 event`. The wave/program is never named in the block, same as on screen. The days in that line come from `preferences/weekPlan`, and the cadence, goals and events from `plan/current`. `coachGoal` sits above it as `Training for: …`. | The model can only describe the plan in the user's words if the block hands it those words. This is also what makes D1 hold in conversation, not just on the page. | TP-3 (line), TP-0a (words) |
| A3 | **Plan tools: `get_plan` (look-up), `update_plan` (action), `draft_next_wave` (look-up).** `get_plan` returns `plan/current` + goals with status + events + the current week kind + the next lighter week, and **retires `get_program` and `get_week_plan`** (their decisive parts are in the block; the rest is in `get_plan`). `update_plan` edits cadence, split (written to `preferences/weekPlan`, its one home), horizon, `sessionMinutes`, fixed constraints (`{ "mon": { "mustInclude": ["Smith Machine Bench Press"] } }`), with AP-18 conventions. `draft_next_wave { overrides? }` runs `plan-roller.js` on demand and returns the same draft the auto-roll would materialize (before the wave's first logged session, the edited draft replaces the rolled wave). | TP-5 as written has the model composing programs in conversation (`create_program` with exercises) while TP-2/TP-3 have **code** composing them (`plan-roller.js`). Two composers drift. With `draft_next_wave`, the conversation *edits a draft* (days, minutes, a fixed lift, a rotation the user dislikes) and `create_program` receives the adjusted draft — model chooses, code composes, one path for both the card and the chat. Also: intake asks "minutes per session" and nothing stores or uses it; `plan.sessionMinutes` + `avgDurationMin` (AP-23i) let the roller cap exercises per session. | TP-3 (tools), TP-5 (use) |
| A4 | **Tool count and overlap.** 28 tools today; TP-1/2/3 add ~8. Retire two (A3), and settle the AP-18 open question — fold `update_workout_template` into `replace_day` — in the same PR, so the count stays near 30 and no two labels overlap. Goals in the block, like verdicts, are facts the model quotes; `list_goals` is for drilling in, not for every turn. | Every tool is label tokens on every round and one more coin flip when labels overlap (field guide 3.2, 3.8). | TP-1 |
| A5 | **`remember_fact` must stop owning goals.** Its label and the prompt line both say "injuries, **goals**, schedule…" (`coach-tools.js:333`, `coach-prompts.js:126`). After TP-1 a goal is a document with a baseline, a target and a status — a sentence in `coachMemory` is the wrong drawer (field guide 6.4) and will disagree with the Goals page. Same for events. | Change both labels to "injuries, schedule quirks, equipment quirks, preferences — goals and events go through `set_goal` / `add_event`". Add a one-off migration note: existing goal-shaped facts in `coachMemory` are offered as goals once ("You told me you wanted 225 on bench — make it a goal?") and then removed. | TP-1 |
| A6 | **The Sunday card is a workflow; give it its own eval mode and two more checks.** `tests/coach-eval/runner.js` already has `scenario.mode === 'weekly'` (`runWeeklyReview`); extend it to `'reportcard'`: input = a `buildReportCard` fixture, output = `{ narrative, chosenOption }`. Checks: `chosen-option-valid` (`chosenOption.kind` ∈ `card.options`), `chosen-option-expected` (per scenario), `numbers-match-card` (every number in the narrative appears in the card), `no-jargon`. The three TP-2 scenarios run in this mode. | TP-2 lets the model "rewrite the headline, never contradict" — rewriting a computed sentence is exactly where numbers drift. Assert it instead of hoping. | TP-2a |
| A7 | **The verdict glossary in the prompt, the plan's §4.0 job table, and the field guide's job names move to the new words.** Prompt (`coach-prompts.js` "Verdict actions: bump = … · stall rung 1/2/3 = …") becomes "stuck — first chase a rep, then back off, then rotate"; the prompt snapshot test (TP-5) covers it. The action plan's §4.0 jobs read "Plan the block" / "Weekly scoreboard" — rename to "Plan" and "Sunday report card (workflow)". The field guide gets a short note under 7.4 naming the report card as the house example of a workflow. | One vocabulary everywhere the model reads, or the eval's `no-jargon` check becomes whack-a-mole. | TP-0a |

**Not changing, and shouldn't:** `sessionIntent`, `progressionTarget`, the ladder, the fatigue signal, the override mechanism; the live tools; the authoritative-verdicts rule (goals and the report card join it as things the model quotes); the eval gate. The report card at one model turn per user per week is the cheapest high-value surface in the app — keep the model's share of it to two sentences and one choice.

**Order within the TP work, agent-side:** A1 + A7 with TP-0a (so every later surface and the block speak the same words) → A6 with TP-2a → A4 + A5 with TP-1 → A2 + A3 with TP-3 → TP-5 uses `draft_next_wave`. Scenario 22 (the unlabeled light week) stays in the chat eval; the three Sunday scenarios plus the four TP-5 scenarios bring the set to ~29.

---

## 8. TP-6 — Plan page & dashboard UX pass (M) — added 2026-10-26

**Trigger (Kevin, 10/26, first morning on the built Plan page):** "It gives me a toggle to rotate exercises myself or 'Do it', and when I click Do it nothing seems to happen. I guess I'm still in the old block system. UI integration from the main dashboard, and the UX around this feature, needs to evolve."

**Context for the coding agent:** Plan page is `js/core/ui/block-ui.js` (`planHTML` ~`:170-200`, `noticeHTML` ~`:100-145`, `planSetRotationPolicy` `:360`, `blockSwapAccessory` `:315` → `askCoachSeeded`); timeline model `plan-timeline.js`; plan doc + `savePlan`/`applyRotation` in `plan.js`; rotation ranking `rankRotationCandidates` (`exercise-rotation.js`, mirrored, used by the report card's `swap` option); dashboard program surfaces in `dashboard-ui.js` (`dash-program-line` `:596`, `dash-program-done` `:545-580`, report-card entry `:1716`); jargon list `plain-language.js:34`.

### 8.1 Diagnosis

| # | What Kevin saw | What the code does | Why it reads wrong |
|---|---|---|---|
| 1 | "Do it" does nothing | `planSetRotationPolicy('auto')` saves `plan.rotationPolicy` and re-highlights the button. That's all it is meant to do: the policy applies **when the Sunday job rolls the next weeks** (`plan-roller.js:128-148`). | A **setting** labelled with an **action verb**, placed in the actions row under a chip that says "Rotate an exercise", with no toast, no date, no sentence saying when it takes effect. The field label says "Between waves" — *wave* is *block* with a new name, exactly the concept Kevin said he doesn't think in, and the jargon audit doesn't ban it. |
| 2 | "Rotate an exercise" doesn't rotate anything | `blockSwapAccessory()` prefills a coach message and focuses the input (AU-14: never sends). | The user wanted an action and got a chat box. The engine that ranks candidates is already on the client (`rankRotationCandidates`) and the writer exists (`applyRotation`, used by the report card's `swap`); a conversation is the slow path for a one-tap job. |
| 3 | "Still in the old block system" | The dashboard never got the TP-0/TP-3 sweep: `dash-program-line` reads "**week N of M**" and opens the old detail-sheet entry; `dash-program-done` celebrates "finishing a block" and offers `planNextBlock()` — but with a plan doc the next weeks roll on their own, so that landing is now wrong; the Sunday card only reaches Home when `settings.reportCard` is on (off by default). | Home is the first screen every day and it still describes the old model. The plan page can be right and the product still feels like blocks. |
| 4 | "UX needs to evolve" | `planHTML` renders, before the first week: hero meta → goals strip → notice card → rationale (3 `<details>`) → **five** chips → policy switch → earlier weeks → weeks. | The mockup (A) had header → goals → this week → next weeks → two actions. The page front-loads controls and explanations ahead of the thing the user came to see — this week. |

### 8.2 Changes

**a. Rotation policy becomes a plan setting, with feedback (S).**
- Remove `.plan-policy` from the page body. Add a gear in the Plan page header → **Plan settings** sheet (`openSheet`, SH-2b): name · training days (the week plan, moved here from the chip) · minutes per session · lighter week every N weeks · how far ahead to fill in · **"When the next weeks are set up, accessory swaps:" Ask me first / Swap them for me** · Pause. Everything `update_plan` accepts, so the user has a non-coach path to every plan field (today only the coach can change cadence/horizon/minutes).
- Saving the swap choice shows a toast with the date: "Got it — swaps will be offered on your Sunday card" / "Got it — swaps happen when the next weeks are set up on Nov 9" (`plan-timeline.js` header → next roll date; add `nextRollDate` to the header model if missing).
- Under the control, one line in the sheet: "Main lifts never swap. Accessories swap when you've been on one a long time."

**b. "Rotate an exercise" becomes a one-tap sheet, rules only (M).**
- `openRotateSheet({ templateId?, exercise? })`: lists this week's sessions and their exercises. Main lifts show a lock and "stays — your strength numbers depend on it". Each accessory shows how long it's been in rotation ("since Aug 4 · 14 sessions") from `buildExerciseSessions`.
- Tap an accessory → top 3 from `rankRotationCandidates` at the current gym with the engine's reason ("never used", "idle since Jul"), machine named (AU-12). Tap one → `applyRotation` on the plan's workout (the same writer the report card uses) → undo toast (5 s) → page re-renders with the "swapped in" chip the roll already draws.
- Bottom link: "Ask the coach instead" → the existing prefill. Entry points: the Plan page chip, the session sheet's exercise rows, the report card's swap option ("Pick a different one").
- No model call anywhere in this path.

**c. Home speaks the plan (M).**
- Replace `dash-program-line` with the **Your plan** card from mockup E: plan name · "Build week 3" (week kind, never "N of M") · "lighter week starts Nov 2" · next event in N weeks · pending swaps count when any. Tap → Plan page. Same `plan-timeline.js` header the Plan page uses, so the two can't disagree.
- `dash-program-done`: with a plan doc, never show it — the roll already happened (or is scheduled); the Your plan card says "next weeks set up Nov 9". Without a plan doc, replace the copy with "These weeks are done. Turn on your plan so the next ones roll on their own" → `planEnable()` (the same button the Plan page notice has). Delete `planNextBlock` naming (keep the handler as `planNextWeeks` if anything else calls it).
- Report card on Home (Sun/Mon) regardless of where the flag lives: the entry at `:1716` renders when `settings.reportCard` is on; add the Settings nudge inside the Your plan card the first Sunday after a plan exists ("Want your week on one page Sunday night? Turn on the report card") — once, dismissible.
- Jargon: add `wave`/`waves` and `block`/`blocks` to `BANNED` for visible text; fix the hits (`"Between waves"`, `"finishing a block"`, `"week N of M"`).

**d. Plan page hierarchy (S/M).** Order becomes: header (name · "This week: Build week 3" · goals strip) → **notice only when there is something to act on** (pending swaps, undoable roll, paused, not-yet-enabled) → this week → next weeks → projected → *Earlier weeks* collapsed → footer: "Why this plan" (the rationale, one collapsed row) and the action chips, reduced to three: *Lighter week* · *Rotate an exercise* · *Change my plan*. Goals via the strip; week plan and swap policy via the gear.

**e. The "Turn it on" notice** (plan missing for a pre-TP-3 program): keep, but say what it does in the user's terms: "Keep this going: when these weeks end, the next ones are set up for you — same sessions, a lighter week every fourth. You can undo any week until you log a workout in it."

**Leftovers built 2026-10-27:** the Sunday card's swap has *Pick a different one* (opens the Plan page's rotate sheet on that exercise, `openRotateFromCard`); Home shows a one-time, dismissible "Want your week on one page Sunday night?" row Sun/Mon while a plan runs and the report card is off (`reportCardNudgeDismissed`).

**Built 2026-10-26 (8.2 a–e, m, n):**
- **a** — gear in the Plan page header → *Plan settings* sheet (`openPlanSettings`): name, training days (→ week plan sheet), minutes, lighter week (every 3rd/4th/5th/never), how far ahead, swaps *Ask me first / Swap them for me* with the main-lifts line, keep going / paused. Saving the swap choice toasts the date (`header.nextRoll`). The inline switch is gone.
- **b** — *Rotate an exercise* opens a rules-only sheet (`openRotateSheet`): this week's sessions, main lifts locked, accessories with "since … · N sessions"; tap → top 3 from `rankRotationCandidates` (with the "left out: you just moved off it" line) → `swapInTemplate` (plan.js; recorded on the program's `rotationsApplied`) → undo toast. Also from a swap button on each accessory in the session sheet. "Ask the coach instead" keeps the prefill path. *Not yet:* the report card's "Pick a different one" entry.
- **c** — Home's program line is now the plan line: `planSummaryLine(header)` (plan-timeline.js, the Plan page's own header) — "My plan · Build week 3 / lighter week starts Nov 2 · Trip in 5 weeks · 2 swaps waiting · next weeks set up …", tap → Plan page; read through a session-cached `loadPlanSummary()` cleared by every plan write and server write. The "these weeks are done" banner never shows with a plan; without one it offers *Keep my plan going*. The active workout's header says the week's kind, not "week N of M". `wave` is banned. *Not yet:* the one-time report-card nudge.
- **d/e** — page order: header → notice only when there's something to do (turn on, paused, swaps waiting, an undoable roll) → this week → next → projected → *Earlier weeks* folded → *Why this plan* → three actions (Lighter week · Rotate an exercise · Change my plan). New "Keep it going" / "Turn on your plan" copy.
- **m** — the editor's chip reads "was Pec Deck · Sep 15" and disappears after `ROTATION_MEMORY_DAYS`.
- **n** — Workouts tab: workouts on the split appear only in the plan group; the rest split into recent (used or made in 90 days) and a folded *Older (n)* (`groupMyWorkouts`); *One-off* / *From your plan* chips; the history-based "Suggested for Monday" row hides when the plan already has today's session.

### 8.3 Tests & acceptance

- `block-view`/`plan-timeline` tests: `nextRollDate` in the header; Home card text == Plan page header text for the same fixture.
- `rotate-sheet.test.js` (model only): main lifts excluded and marked; staleness from sessions; candidates filtered to the gym; apply writes once and is undoable; no network call to `functions/`.
- `jargon-audit` strict passes with `wave`/`block` banned.
- Window-wiring for the new sheet handlers; `page-lock` test unaffected.
- **Acceptance (phone):** tapping "Swap them for me" produces a toast with a date; "Rotate an exercise" replaces an accessory in ≤ 3 taps with no coach turn and an undo; Home shows "Your plan · Build week 3 · lighter week Nov 2" and no "week N of M" anywhere; the first thing under the Plan page header is this week.

### 8.4 What to do today, before TP-6 lands

- The Ask me / Do it switch is fine as data: *Ask me* = swaps arrive as the Sunday card's option; *Do it* = they're applied when the next weeks are set up. Nothing is supposed to happen on tap.
- To rotate something now: *Rotate an exercise* → the prefilled coach message → send. The coach calls `get_rotation_candidates` and offers one `replace_day`.
- Turn the report card on (Settings → Report card, or the page's "Turn on") — it's off by default, and without it there is no Sunday card and no swap offer.

### 8.5 Found 2026-10-26 from the first real planning thread (`thread_1792962847643_4ezvg8`, turns 3–4)

Kevin planned a new wave with the coach, said "let's apply those recommendations", and the Pull day card still shows Rope Face Pulls although the coach had described swapping it for Reverse Pec Deck. The traces show why; three defects, one is the same shape as Lesson 3.5 of the field guide.

**Built 2026-10-26 (f–l), with the diagnoses the code actually showed:**
- **f** — `create_program` never produced `pendingRotations`; it applied swaps only with `rotateAccessories:true`, by re-running the engine, so "what's new" could name swaps nothing wrote. Now it applies (1) `swaps` (draft_next_wave's `draft.swaps`, passed through) and (2) every swap in `rationale.changed` — the plan the user talked through is the consent — via `resolveSwaps` (exercise-rotation.js; main lifts never move), then the engine for any other slot when `rotateAccessories` is set. The program stores `rotationsApplied`, and `rationale.changed` rows carry `state: applied | not-applied`. The Plan page shows a "N swaps waiting · Make these swaps" notice for ANY program (`waitingSwaps`: pending rotations + "what's new" rows the workouts don't have — this also rescues plans made before the fix), and `applyPendingRotations` writes both kinds.
- **g** — the result is `rotations: { applied, notApplied }`; prompt (plan contract): pass the kept swaps; a swap is done only when it's in `applied`. Eval `plan-apply-swaps` + check `swaps-truthful`.
- **h** — not two programs: the header's "Build week N" counted consecutive build weeks across the wave boundary (old weeks 1–5 + new week 1 = 6). The run now restarts with each wave (`plan-timeline.js`).
- **i** — `checkDeloadNeeded` took the newest week *with workouts* as "now"; on a Monday that's last week. `inRecoveryWeek` now requires this ISO week; `justHadLighterWeek` → verdict "not due — last week was lighter".
- **j** — the action card's re-read could fall back to the stale device cache on gym signal and was accepted as fresh. Now: the server stamps `users/{uid}/meta/sync` after any coach turn that wrote and after a Sunday roll; `js/core/data/server-sync.js` listens (started after first paint), drops the cached week plan / program, re-reads templates from the server, and leaves `AppState._templatesStale` set when the read came from cache so the Workouts tab and Plan page ask again. Every action card goes through the same `refreshAfterServerWrite`.
- **k** — prompt line under HOW TO ANSWER; eval `change-not-showing`.
- **l** — `rotatedOutOf` (row `rotatedFrom` + program `rotationsApplied` history, 84-day memory) excluded in `selectRotation`, `rankRotationCandidates` (returns `excluded` with "swapped out YYYY-MM") and the roller; `rotationHistory(programs)`.
- **m** — "what's new" rows show *waiting* / *not made* chips; the editor's chip is dated and hides after `ROTATION_MEMORY_DAYS` (UX pass, §8.2). **n** — done in the UX pass.

| # | Defect | Evidence | Fix |
|---|---|---|---|
| f | **Pending rotations from a coach-created program are stranded.** `create_program { rotateAccessories:true }` under `rotationPolicy:'ask'` leaves the swaps as `pendingRotations`; the Plan page's *Rotate them* button renders only for `createdVia === 'auto-roll'` (`block-ui.js:139`); no coach tool applies pending rotations. | Turn 4's context block, rebuilt after the write, still lists Pull day with Rope Face Pulls; turn 4's only writes were two `addExercises`. | A plan the user just talked through with the coach **is** consent: `create_program` applies its rotations when the conversation produced them (the model names each swap in the Plan contract's "what's new" part). Keep `pendingRotations` only for the Sunday roll. Either way the notice card shows pending swaps for *any* program, not just auto-rolled ones. |
| g | **The tool result let the model say "done" for something that hadn't happened.** `create_program`'s output lists `rotation: [{swaps…}]` with no `applied`/`pending` state, so the model reported the swaps as part of the new plan. | Turn 3 response describes the swaps as made; nothing wrote them. | Result carries `rotations: { applied: [...], pending: [...] }`; prompt line: *"pending swaps are not done — say they're waiting for a tap on the Plan page."* Eval check: no "done/applied" wording for a swap that is pending in the tool output. |
| h | **Two programs read as current.** The block's `Your plan:` line says "this week: Build week 6" (old *Strength block III*, ends 11-01) while the `Today:` line says "plan week 1 of 6" (the new wave). | Turn 4 context block lines 2–3. | *Verified 10/26:* `create_program` already retires the old program (`active:false, state:'superseded'`, coach-tools.js). The bug is `plan-timeline.js` (`runs` ~`:107`): it windows **every** program by date and never skips `superseded`, so the old one still "contains today". Fix there: a superseded program's window ends the day before its successor starts (or at its `lastUpdated` date), and the Today line and the plan line read the same pick. Test: superseded program overlapping a new one → one "this week", the new one's. |
| i | **"In a lighter week now" on Build week 1.** `checkDeloadNeeded().inRecoveryWeek` counts the sessions relabelled *Deload* on 10-19…10-24 inside its 7-day window. | Verdicts block, turn 4. | `inRecoveryWeek` should be false once a program week with a non-lighter intent has started; i.e. intent wins over the label window (same precedence as `sessionIntent`). Test: deload-labelled sessions last week + Build week 1 today → not in a lighter week. |
| j | **Coach writes don't reach the phone.** Turn 5 of the same thread: the coach's live `list_templates` shows Back Extension on Friday and Seated Row on Saturday — the turn-4 writes landed server-side — while the Workouts tab, the Plan page cards and the session sheet still showed the old rows. The client caches templates (`template-selection.js` refetches only when its copy is older than 30 s; PF-0…PF-4.1 added launch caching on top) and a coach write goes through the Admin SDK, so nothing on the client drops its copy. The action card says "updated"; the cache disagrees. | Trace turn 5 output vs the phone. | Every write-tool action card (`template_created`, `template_updated`, `template_replaced`, `program_set`, `week_plan_set`, `primaries_set`, plan changes) invalidates the template, program and plan caches when it renders, and the Plan page / Workouts tab re-render on return. Belt and braces: a `lastWriteAt` on `users/{uid}` set by the executors, compared on app resume. Test: render a `template_updated` card → the next `loadTemplates()` hits the network. |
| k | **The coach conceded before checking.** Turn 5 opens "I never actually wrote them — that's on me," then calls `list_templates` and finds it had. | Trace turn 5 response. | Prompt, one line under HOW TO ANSWER: *"If the user says a change isn't showing, check with a look-up before apologizing; a successful tool result is the truth until a look-up contradicts it."* Eval scenario `change-not-showing`: must call `list_templates` first; must not say "I didn't write" when the fixture shows the write. |
| l | **The rotation engine proposes round trips.** The new wave's "What's new" lists Rope Face Pulls → Reverse Pec Deck, MaxPump Lateral Raise → Lateral Raise Machine, Barbell Curl → Dumbbell Curls — each the exercise Kevin rotated *away from* earlier this year. `rankRotationCandidates` ranks by "idle since", and the thing you rotated out is always the longest-idle same-pattern candidate. | Rationale strip 10/26 vs template `rotatedFrom` chips showing the earlier swaps. | Rank: never used → idle longest, **excluding** anything rotated out of that slot in the last 2 waves (read `rotatedFrom` on the row and `rotationsApplied` on past programs) and never proposing a `to` equal to the row's `rotatedFrom`. Return `excluded: [{name, reason:'rotated out Jul'}]` so the coach can say so. Test: a row with `rotatedFrom: X` never gets X back within the window. |
| m | **Two surfaces, two sources, no dates.** The template editor's "was Pec Deck" chip (`rotatedFrom`, stamped at the earlier rotation, never cleared) reads as current; the rationale's "What's new" reads as applied; neither is. | Screenshot of the Push editor + rationale strip. | `rotatedFrom` gains `rotatedAt` and the chip reads "was Pec Deck · Sep 15"; it clears when the wave that made it ends. Rationale "what's new" rows carry state from the program doc — *applied* / *waiting for your tap* / *already in your plan* — and render as "Reverse Pec Deck (in place of Rope Face Pulls) · waiting". Both read `program.rotationsApplied` / `pendingRotations`; the editor chip reads the same. |
| n | **Workouts tab is doubled and ungrouped.** Plan sessions are Kevin's own templates (TP-4 chose not to mark them plan-owned), so each appears under "Your plan" *and* under "My workouts"; 19 templates below with no grouping. | Kevin, 10/26 afternoon. | "My workouts" excludes anything on the split (dedupe by id; it's already up top); the remainder groups into *Recent* (used in 90 days) and a collapsed *Older (n)*; `oneOff` and `savedFromPlan` get their chips. The green button's first row is today's plan session. Test: a template on the split renders once. |

---

## 9. Backlog — TP-7 "Any gym, any machine": planning around gyms, travel, and unmapped equipment — added 2026-10-26

**Trigger (Kevin, 10/26):** "Absolute Recomp has way more stuff — cables, racks, machines not listed — so I'd like to use what I already have in the app but not limit myself just because. And at the Bellagio this weekend there's other stuff I can do besides what's been done in the past. The whole *What's possible here* stuff is annoying and not helpful, because I can do the exercises, just on different machines."

**Where it rubs against what exists:** the Tier-3 traveler principles already say the right thing — D0 equipment is opt-in enrichment, never a gate; D6 badges claim only positive evidence (no hard "not possible"); D9 fix the map before changing the plan; D10 never ask twice. But three newer pieces quietly re-introduced the gate: `rankRotationCandidates` filters to the user's library at the current gym (AP-23a), the report card's `swap` option and the roller's rotations use that same list (TP-2/TP-3), and the "Possible here / Not mapped here yet" copy is still on the template pill and the planner badges (action-plan queue item 10a — open since July). Net effect: at a gym with *more* equipment than the library knows, the plan rotates among *less*.

**Built 2026-10-27:**
- **a** — the copy was already gone. Still open from this item: the active workout's machine prefill "from Absolute Recomp" label when a machine comes from another gym (the riskiest surface; queued separately).
- **b** — `gym-profile.js` (mirrored): `EQUIPMENT_LEVELS` full / standard / hotel / home, `LEVEL_IMPLEMENTS`, `GENERIC_EXERCISES` (one plain movement per movement × implement), `gymLevel(location, mappedCount)` (set → it; ≥ 15 mapped → full; else unknown = regular), `usualGym(workouts)`. `rankRotationCandidates({ widen, level })` adds tier 2 (used at another gym — equipment null, "pick the machine here") and tier 3 (the movement on a generic implement the level has, `unmapped:true`) after the gym's own machines; without `widen` it's unchanged, so the engine that writes machines stays at the gym. Gym detail page: *Size of this gym* chips + a *What's here* note (`equipmentLevel`, `equipmentNote`). Per Kevin's decision, tiers 2–3 show by default. *Not built:* the one-time "what kind of gym is this?" ask on a first visit.
- **c** — events `kind: 'travel'` with `endDate` (≤ 4 weeks), `level` (default hotel), `place`; never shapes week kinds; a plane marker with the dates; Plan page cells on a trip say so and the session sheet gives each exercise's fallback for that gym. A session started on a trip stamps `sessionIntent.travel`; `buildExerciseSessions` leaves it out of a lift's series unless it was the same machine. Add a date → *Travel* (dates + gym size).
- **d** — `get_rotation_candidates` widens with the gym's level (returns `gymSize`, `gymNote`); `list_equipment` returns each gym's size and note; `add_event` takes trips; prompt line; eval `richer-gym`, `hotel-weekend` (+ `travel-event` check).

### 9.1 Principle

**The plan is made of movements; the machine is a per-gym detail.** An exercise is possible wherever its pattern can be loaded. Equipment exists for two reasons only: to remember settings/loads at that gym, and to keep strength series comparable (AU-12 keys main lifts by exercise + machine). Neither is a reason to hide or forbid an exercise. "What's possible here" should never be computed from the library; the library only says what has been *remembered* here.

### 9.2 Changes (size when queued — roughly M overall, in four pieces)

**a. Retire the gate; keep the memory (S).** *(Copy half done 10/25: "Possible here / Not mapped here yet" is gone from the UI — only a comment in `equipment-planner.js` remains. What's left is the gate in the ranking — b below.)* In their place, positive-evidence only: "last time here: Newtech High Row" when a machine is linked at this gym, nothing otherwise. A session at any gym starts with every exercise *open*; the equipment line in the workout is the existing picker (AP-11: skip / generic bucket / exact machine), prefilled from this gym's memory when there is one, from the exercise's last machine anywhere otherwise (labelled "from Absolute Recomp" so the user knows the load may not transfer). D10 holds: a choice made here is remembered here.

**b. Gym profiles instead of gym inventories (S/M).** A location gets an `equipmentLevel`: `full` (big commercial — assume racks, cables, dumbbells, the common selectorized machines), `standard`, `hotel` (dumbbells, a cable stack, a couple of machines), `home`, plus an optional free-text "what's here" note the coach reads. Default `full` for any gym with ≥ 15 mapped machines, otherwise ask once on first visit (one segmented control, in the same sheet as the gym name). The *generic implements* — barbell/rack, dumbbell, cable, bodyweight, Smith — are considered present per level and never need mapping. `rankRotationCandidates { location, level }` ranks: (1) library machines mapped here, (2) library machines mapped at *any* gym whose pattern is loadable here on a generic implement ("same movement, on cable here"), (3) catalog machines plausible at this level, flagged `unmapped:true` with "pick the machine when you get there". The engine stops being limited by what was logged; the user still gets the remembered machine first.

**c. Travel as a plan event (M).** `events.kind: 'travel'` with dates and either a known location or a level (`hotel`). For those dates the Plan page renders the planned sessions as-is but marks them *travel*, and the session sheet shows each exercise with its generic-implement fallback ("Seated leg curl → lying leg curl or dumbbell RDL, hotel gym"). Sessions logged in a travel window get `sessionIntent.travel:true`: the stall ladder, fatigue signal and scoreboard exclude them from main-lift series (same mechanism as recovery exclusion) unless the same machine was used, so a hotel-gym week never reads as a strength drop; the report card's "showed up" still counts them. `kind:'oneOff'` templates (AP-18) already auto-archive — a travel session that had to be composed from scratch uses that. The Bellagio case is: add the event, the weekend's sessions stay on the plan, the exercises are open, and nothing says "not possible".

**d. Coach and prompt (S).** `get_rotation_candidates` and `propose_swap` accept `level` and return the three tiers with their flags; `list_equipment` returns the gym's level and note. One prompt line replaces the equipment caveats: *"An unmapped machine is never a reason to drop or change an exercise. Prefer the remembered machine; otherwise name the movement and the implement (cable, dumbbell, rack) and let the user pick the machine there."* Eval scenarios: *richer gym* (Absolute Recomp, 40 catalog machines, 12 mapped → a rotation candidate from tier 2/3 is offered, nothing refused), *hotel gym weekend* (travel event → sessions kept, fallbacks named, no template write, scoreboard unchanged after the weekend).

### 9.3 Acceptance
No surface shows "possible" or "not mapped" wording; at a gym with more equipment than the library knows, "Rotate an exercise" offers candidates beyond the library with the implement named; a travel weekend shows the planned sessions with fallbacks and leaves the main-lift trends untouched; an exercise never had to be mapped to be started.

### 9.4 Open
- ~~Whether tier 3 appears by default~~ **Decided (Kevin, 10/26):** plan from what's known at the gym he usually trains at first (tier 1). When a better exercise or a kind of equipment isn't mapped there, **suggest it and plan it anyway** — by default, not behind "show more" — named by movement + implement, with "pick the machine when you get there". If the equipment turns out not to be there, he adjusts at the gym (the existing picker / replace). Ranking order stays tier 1 → 2 → 3; tier 2/3 rows carry `unmapped:true` and that line, never a warning.
- `equipmentLevel` vs the Tier-3 planner's per-gym libraries (`docs/multigym-assessment.md`): the level is a coarse default *over* the library, not a replacement; copy-from-gym and the shared picker stay as planned.

---

## 10. TP-8 — Variety inside the plan: accessory slots that alternate (M/L) — added 2026-10-26

**Trigger (Kevin, 10/26):** "The same exercises persist week after week after week in the plan. I was expecting the plan to offer up: the next few Mondays, a few of these are staying consistent and a few of these are going to change up to give more variety but still hit the same muscle groups." This is the "see the rotations of exercises planned" ask from the very first conversation; TP-3 only varies at wave boundaries (every `buildWeeks + 1` weeks), so inside a wave every Monday is identical.

**Context for the coding agent:** session composition is a template's `exercises[]` (`role`, `pattern`, `rotatedFrom`); the Plan page cell is `buildBlockSession` (`block-view.js`); workout start seeds rows from `getLastSessionDefaults(exName, equipment, location, equipmentId)` (AP-3) and `progressionTarget` keyed by exercise + machine (AU-12); rotation candidates from `rankRotationCandidates`; the plan doc is `plan/current`; week index from `deriveProgramWeek`.

**Built 2026-10-27** (default cadence biweekly, per Kevin): `variantForWeek` / `resolveWeekExercises` / `nextSwitchWeek` / `fillAlternates` in `exercise-rotation.js` (mirrored); `plan.varietyCadence` (`biweekly` default · `weekly` · `wave`). Every surface asks `variantForWeek`: `startWorkout` loads the week's version (`resolveForPlanWeek` — the template is untouched; each version keeps its own history), the Plan page session sheet ("in place of X", "Y from Nov 9") and an *Accessories switch* chip on the weeks that change, `get_plan.variety`. Rotate sheet: *Alternate* next to *Replace* (`setAlternate`, undo). Editor: "alternates with X ×" chip. Plan settings: *Accessories with an alternate switch*. Coach: `create_program { alternateAccessories }`, `update_plan { varietyCadence }`, prompt line, eval `plan-variety` (+ `alternates-set`). The Sunday roll fills alternates only under "Swap them for me". Also fixed: "Update workout" at completion rebuilt rows from scratch (dropping role, pattern, rotation history — and with variants it would have written this week's alternate over the slot); it now keeps the stored row. *Not built:* the active workout's "use the other version today" menu item (riskiest surface — the existing replace-exercise covers it).

### 10.1 Model

- A template exercise with `role !== 'primary'` may carry **`alternates: [{ name, equipment, equipmentId }]`** (0–2 entries; same `pattern`). The row itself is variant A; alternates are B (and C).
- `plan.varietyCadence`: `'weekly'` (A, B, A, B…), `'biweekly'`, or `'wave'` (switch at the lighter week — today's behaviour). Default `'biweekly'` (Kevin, 10/26: two weeks on a variant, then switch — double progression gets two shots at a weight). Main lifts never vary — that rule stays in code.
- **Pure function** `variantForWeek(exercise, weekIndex, cadence) → { name, equipment, equipmentId, variantIndex }` — the single place that decides which variant a week gets. `buildBlockSession`, `startWorkout` (template → savedData), the dashboard hero's exercise preview, and the coach's `Plan sessions:` line all call it. The Plan page cell lists the week's resolved accessories; a week whose variants differ from last week's marks them with a small ↻.
- History stays per machine: Reverse Pec Deck on the Peck Back and Rope Face Pulls on the Basic Trainer keep separate series; the set rows seed from the variant's own last session. The scoreboard is untouched (main lifts don't vary).
- **Filling alternates:** the rotation engine (with TP-6 l's exclusions) supplies them — `fillAlternates(template, { location, history })` picks, per accessory slot, the best candidate of the same pattern on a *different* machine. Runs when a wave is created (coach or roll) and from the Plan page's *Rotate an exercise* sheet (TP-6 b), which gains "alternate weekly with…" next to "replace with…".
- Templates do not multiply: one session, slots that alternate. The Workouts list is unaffected.

### 10.2 Surfaces

- **Plan page:** each week's cell shows the resolved exercises; variant rows carry "this week: Reverse Pec Deck · next week: Rope Face Pulls". The rationale's "what's new" becomes "how the accessories rotate": one line per slot, A/B named, cadence stated.
- **Template editor:** an accessory row shows its alternates as chips under the name ("alternates weekly with Rope Face Pulls"); tap to edit/remove; the "was X" chip (TP-6 m) is replaced by this for rows that alternate.
- **Workout start:** the week's variant is what loads; the ⋮ menu offers "use the other variant today" (no template write; logs under the variant's own name/machine).
- **Coach:** `create_program`/`draft_next_wave` fill alternates when `rotateAccessories` is set; the Plan contract's part 5 describes the alternation; `get_plan` returns the resolved sessions for this week and next; `update_plan { varietyCadence }`. Prompt: *"Variety is alternation inside the plan, not a replacement list — say which weeks get which."* Eval: `plan-variety` (two Mondays in the plan differ on accessories and match on main lifts; the Plan contract names both variants).

### 10.3 Tests & acceptance

`variant-for-week.test.js`: cadence math for weekly/biweekly/wave; primaries never vary; missing alternates → A every week; week index from the program, not the calendar. `fill-alternates.test.js`: different machine than A, same pattern, TP-6 l exclusions respected, nothing for primaries. Block-view tests: the cell for week N+1 shows the other variant; the start path seeds from that variant's history. **Acceptance:** on the Plan page, the Push two weeks out differs from this week's on 2–3 accessories and matches on the main lifts, and the set rows on each Monday load that day's variant with its own last numbers.

### 10.4 Open
- ~~Default cadence~~ **Decided (Kevin, 10/26): biweekly** — A, A, B, B… `'weekly'` stays available via `update_plan { varietyCadence }`.
- Whether three variants (A/B/C) is worth the editor complexity. Start with two.
