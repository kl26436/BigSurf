# Big Surf — App upgrade plan (design + user synthesis)

_Synthesizes three independent reviews of the **live code**:_
1. **Senior design-agent survey** — systematic, code-fresh: tap targets, a11y, copy, tokens, equipment library, patterns.
2. **Marcus (mockup review)** — [docs/marcus-first-impression-review.md](marcus-first-impression-review.md) — at-the-rack feel; partly stale (graded mockups).
3. **Marcus (code review)** — [docs/marcus-code-review.md](marcus-code-review.md) — the authoritative user view: "the app records progress but doesn't coach it."

## The thesis

The **design system is already healthy** — `npm run audit:design` is green, DESIGN-BACKLOG is ~176/176 done, logging mechanics (autofill, auto-rest-timer, readable inputs) impress the target user. So "upgrade" is **not** a restyle. Both lenses point at the same shape once you strip the noise:

- The **design lens** finds a thin layer of real-but-cheap polish (a few sub-44px targets, missing aria-labels, a couple of copy nits).
- The **user lens** finds the one thing that makes or breaks retention: **the app shows last session's numbers and does nothing with them.** It records progress instead of coaching it.

The data to close that loop **already exists** (`getLastSessionDefaults`, `checkForNewPR`, `getExercisePRs`, `getRecentPRs`, the `training-insights.js` engine, and a plate-calc popover). So the headline upgrade is **wiring + UI**, not new infrastructure — which makes it far more achievable than it sounds.

**Guiding principle:** put the smarts *where the user acts* — at the rack, on the set row — not buried on the dashboard or in stats.

---

## Tracks (ordered by impact-per-effort)

Each item: **[source]** · severity · files · acceptance test. Sources: `D` = design agent, `M` = Marcus, `D+M` = both converge.

### Track A — Polish & correctness (fast, safe, do first)

Low-risk, high-confidence, ships in one commit. Clears the convergent findings and buys goodwill before the bigger work.

| # | Item | Src | Sev | Files | Done when |
|---|---|---|---|---|---|
| A1 | Set-complete check 38→44px (use `--tap`) | D+M* | High | [active-workout-v2.css:552](../styles/pages/active-workout-v2.css#L552) | Check button ≥44px; grid col matches; audit green |
| A2 | Dashboard start/play button 30→44px | D | Med | [dashboard-v2.css:429](../styles/pages/dashboard-v2.css#L429) | Primary CTA ≥44px |
| A3 | Missing `aria-label`s (rest +30s/Skip, unit toggle, equip catalog +/chevron) | D | Med | active-workout-ui.js, equipment-library-ui.js | Every icon-only button has sentence-case aria-label |
| A4 | Equipment "Change" text-link → real `--tap` chip; drop redundant menu dup | D+M | Med | [active-workout-ui.js:485](../js/core/workout/active-workout-ui.js#L485), [:749](../js/core/workout/active-workout-ui.js#L749), [active-workout-v2.css:356](../styles/pages/active-workout-v2.css#L356) | One obvious tappable chip; no duplicate menu entry |
| A5 | Copy: `Nothing for X yet`→`No equipment for X yet`; `All set!`→`All set`; empty states get "how to start" line | D+M | Low | equipment-library-ui.js, settings-ui.js:524 | No title-case / stray `!`; empties have next-step |
| A6 | Token hygiene: `font-size:0.5rem`→`var(--font-3xs)` | D | Low | [active-workout-v2.css:69](../styles/pages/active-workout-v2.css#L69) | No raw font literal |

_*A1: Marcus's code review called 38px "fine," but his mockup review and the design agent both flag it under the 44px floor — the measurement wins. Cheap + correct → keep._

**Verify:** `npm test` + `npm run audit:design`; deploy `hosting:dev`, eyeball, then `hosting:prod`.

### Track B — "Am I beating last week?" (the real upgrade)

**Status: all four shipped to dev (2026-07, soak-testing).** B1+B4 in commit `015be78`; B2+B3 in the follow-up. **B2 upgraded from a simple +step heuristic to the full smart coach** — plateau detection (3+ sessions flat), double-progression (add reps → then weight), and post-increase consolidation, driven by multi-session history (same grouping the dashboard plateau engine uses). Data already existed — UI + wiring, no new cross-module exports.

Marcus's #1, #2, #3 code-review fixes. This is the retention lever. Data already exists — this is UI + wiring.

- **B1 — Set-row "beat last time" signal** `[M-High]`. On each working set, compare the entered `weight×reps` against the same set index from `getLastSessionDefaults`. When it meets/beats last time, tint the row/check `--success`; show a compact `▲` delta. Where: `buildSetRows` render + `awToggleSet` ([active-workout-ui.js:698](../js/core/workout/active-workout-ui.js#L698), [:970](../js/core/workout/active-workout-ui.js#L970)); style in active-workout-v2.css. **Done when:** logging a set that beats the prior session visibly reads as a win without leaving the screen. _Competes with Hevy/Boostcamp's green-set._
- **B2 — Overload nudge at the rack** `[M-High]`. Surface a one-line suggestion on the `.aw-last` card ("try 140 — hit 3×10 at 135 twice") sourced from the existing plateau/trend logic in `training-insights.js`, which today only feeds the dashboard. Where: `.aw-last` render ([active-workout-ui.js:560](../js/core/workout/active-workout-ui.js#L560)). **Done when:** a stalled lift shows a concrete next-step where the user lifts. Keep it to one line — no paragraphs mid-workout.
- **B3 — Live PR moment** `[M-Med]`. Call `checkForNewPR()` inside `awToggleSet`; on a true PR fire an immediate, sparing celebration (haptic + toast/badge) instead of only the post-workout `.aw-summary-pr`. Where: [active-workout-ui.js:970](../js/core/workout/active-workout-ui.js#L970), pr-tracker.js:273. **Done when:** hitting a PR set pops the instant it's logged. Respect the copy rule — `!` is allowed here (genuine celebration).
- **B4 — Dashboard this-week-vs-last-week** `[M-High]`. The "This week" hero-chip shows a bare `done/goal`; add a this-week-vs-last-week delta with an up/down arrow, mirroring the body-weight delta treatment beside it. Where: [dashboard-ui.js:328](../js/core/ui/dashboard-ui.js#L328)–334. Needs a small week-over-week aggregation over `loadAllWorkouts` (cached). **Done when:** home screen answers "am I training more than last week?" at a glance.

**Verify:** unit tests for the compare/aggregation logic (mirror the pure-function test pattern in `tests/unit/`); manual at-the-rack walk on dev.

### Track C — At-the-rack mechanics (both lenses) — ✅ shipped to dev (2026-07)

Tighten the physical logging experience.

- **C1 — Set-row input width** `[M-mockup-High]`. Grid is `28px 1fr 1fr 38px` w/ 8px gaps → ~110px fields on a phone ([active-workout-v2.css:459](../styles/pages/active-workout-v2.css#L459),[:495](../styles/pages/active-workout-v2.css#L495)). Widen columns / bump gap so one-handed weight edits are reliable. **Done when:** editing 185→190 one-thumbed doesn't mis-tap. _(Note: less urgent than the mockup review implied — code review found inputs "readable"; treat as tuning, not rescue.)_
- **C2 — Header hierarchy** `[M-Low]`. Lift name (`--font-xs`/muted, css:40) is quieter than elapsed time (`--font-md`/800, css:49). Promote the name, calm the clock. **Done when:** the lift you're on is the loudest thing in the header.
- **C3 — Footer finish affordance** `[M-Med]`. "Finish workout" only appears when *every* set is done ([active-workout-ui.js:823](../js/core/workout/active-workout-ui.js#L823)); a skipped warmup traps you tapping "Next." Offer an always-available finish once main sets are logged. **Done when:** you can end a session without completing every last placeholder set.

### Track D — Feature completeness / competitive parity — ✅ shipped to dev (2026-07)

Bigger, optional, each its own effort. Sequence after B lands.

**Status:** D1 (plate calc on the hero, gated to plate-loaded/barbell equipment by type OR base weight), D2 (opt-in RPE per set behind `trackRpe`), D3 (richer zero-history empty state), D4 (est-1RM climbing delta on the exercise detail) all on dev. RPE history-display deferred as an optional follow-up.

- **D1 — Plate math on the set row** `[M-Med]`. Reuse the existing plate-calc popover (`closePlateCalcPopover`, `calculatePlates` in plate-calculator.js) as a one-tap breakdown off the weight input, using the exercise's known bar weight. **Done when:** "135 = 45+45/side" is one tap from the input, no page change.
- **D2 — RPE/RIR per set** `[Low]`. Optional per-set field ("left 2 in the tank"); schema already has `set.type`. Additive; gate behind a setting so casual users aren't taxed.
- **D3 — Zero-history dashboard empty state** `[M-Low]`. Design + verify the true day-one view (no streak/PRs/history) — the coaching value must land before data exists. **Done when:** a brand-new account sees a purposeful first screen, not empty widgets.
- **D4 — e1RM trend per lift** `[Low]`. Surface estimated-1RM climbing per lift (data in progress-calculations). Parity with Boostcamp's headline number.

### Track E — Equipment library finish (design agent + redesign brief) — ✅ shipped to dev (2026-07)

**Status:** E1 (inline "Can't find it? Add custom equipment" form in the quick-add sheet — saves a standalone equipment doc tagged to the gym via `locations[]`, so it shows in the gym detail) shipped. E2 (empty-state parity) verified already-compliant — the equipment/gym empties carry what-this-is + how-to-start lines, and the custom-add button now gives "No matches in the catalog" a next step.

- **E1 — Quick-add "Can't find it? → create custom equipment"** `[D-Med]`. Real gap vs. [specs/equipment-library-redesign-brief.md](../specs/equipment-library-redesign-brief.md): the quick-add sheet has no custom-equipment fallback. Add an inline create form at the sheet bottom. **Done when:** a user can add equipment the catalog doesn't have without leaving the sheet.
- **E2 — Equipment empty-state parity** `[D-Low]`. A couple of equipment empties lack the "how to start" line; align to the empty-state rule.

_Explicitly NOT doing (per CLAUDE.md): opportunistic group-header/class consolidation sweeps, raw-spacing-literal churn (audit is at budget), and any restyle of the already-healthy design system._

---

## Already fixed — do not re-do (Marcus mockup review was stale)

- Body-weight delta color is already **goal-aware + neutral default** (`getBwDeltaDirectionClass`, dashboard-ui.js:342).
- The two `⋮` menus are already **differentiated** (header `fa-ellipsis-v` vs hero `fa-cog` "Edit exercise").
- Onboarding "Get started" is already **sentence case** (settings-ui.js:452). _(Only `All set!`'s `!` remains — see A5.)_

---

## Recommended sequence

1. **Track A** (one commit, ~½ day) → deploy dev→prod. Fast wins, clears convergent findings.
2. **Track B** (the upgrade, ~2–3 focused sessions) → the retention lever; ship B1+B4 first (most visible), then B2+B3.
3. **Track C** (~½ day) folded in alongside B where files overlap (active-workout-ui.js).
4. **Track D / E** — scope individually as follow-ups; none block the above.

**Discipline every track:** `npm test` + `npm run lint` + `npm run audit:design` → `firebase deploy --only hosting:dev` → verify → `hosting:prod`. Never bare `firebase deploy`. Active-workout is the most critical surface — after any change there, re-verify change-equipment, replace-exercise, add-exercise, and complete-workout, and confirm `debouncedSaveWorkoutData` still fires (per CLAUDE.md).
