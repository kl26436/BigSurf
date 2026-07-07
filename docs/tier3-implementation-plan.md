# Tier 3 implementation plan — planner UI, first-visit flow, settings memory

*2026-07-02. Build instructions for Claude Code sessions. Read [traveler-flow.md](traveler-flow.md) first — it holds the design decisions (D0–D9) and first-visit features (F1–F5) referenced throughout. Screens: [mockups/traveler-journey.html](../mockups/traveler-journey.html). Prior context: [multigym-assessment.md](multigym-assessment.md) Tier 3.*

## How to run this plan

One phase per session/PR. Suggested prompt per phase:

> Read docs/traveler-flow.md and docs/tier3-implementation-plan.md, then implement Phase N exactly as specced. Follow CLAUDE.md conventions throughout. Run the quality gates before declaring done. Deploy to dev only.

Phases 1→5 are ordered by dependency; 6 and 7 are independent and can go anytime after 1. Do NOT combine phases 1 and 2 into one PR — phase 1 alone is already the largest diff.

## Non-negotiable invariants (apply to every phase)

- **D0 guard:** if the user has zero equipment docs (`AppState._cachedEquipment` empty after load), every feature in this plan is invisible — no gym chip, no badges, no banners, no settings chips. Implement as an early return in each entry point, not scattered conditionals.
- **D6:** never render a hard "Not possible here". Zero-match = neutral `Not mapped here yet`. Positive counts only.
- **D9:** wherever a missing exercise is actionable, `Pick machine` precedes `Swap`.
- **D10:** never ask twice. Skip-equipment is permanent per exercise (with undo toast); substitution-sheet choices are remembered per gym and pre-filled. No availability surface may re-raise a question the user already answered.
- **Never block:** badges are advisory; every workout stays startable; every sheet has an escape.
- Copy follows CLAUDE.md User-Facing Copy Rules (sentence case, `…` not `...`, no "please", action-first buttons).
- CSS: tokens only (no raw colors/font sizes/radii); new classes BEM-ish; no inline styles in JS templates.
- New handlers rendered from template strings get window-assigned at the bottom of their own module (cache-skew rule), and window-wiring.test.js must pass.
- Quality gates per phase: `npm test` + `npm run lint` (max 24 warnings) + `npm run audit:design --strict`. Deploy `firebase deploy --only hosting:dev` only.

---

## Phase 1 — Gym context + compatibility badges + F1 unknown state (3.1 core)

**Outcome:** Workouts page shows a gym context chip and evidence-based badges per workout card. Mockup frames: "Step 3 — Badges", "Next month — visit 2", "0a — Unknown, not wrong".

1. **New module `js/core/features/gym-session-context.js`** (pure-ish, small):
   - `resolveSessionGym()` — runs existing `detectLocation`/nearest-saved-gym matching from location-service.js on Workouts-page entry; caches result module-privately per app session; manual override setter `setSessionGym(name|null)`; `getSessionGym()`.
   - Reuse, don't duplicate, location-service internals — export what's needed from there rather than copying matching logic.
2. **Badge computation** — new pure function in equipment-planner.js (it already owns `categorizeTemplates`):
   - `badgeForTemplate(compatibility, gymEquipmentCount)` → `{ state: 'full'|'partial'|'unmapped', label }`. `unmapped` when `compatibility.available === 0` (D6). Add unit tests in `tests/unit/equipment-planner-badges.test.js` importing the real module.
   - D2 suppression: if every visible template is `full`, render no badges. If `gymEquipmentCount === 0`, render the F1 banner instead of any badges.
3. **Render** in template-selection.js selector rows: badge chip under `.tpl-meta`; gym chip above the list; `Possible here` filter pill alongside category pills; F1 banner (`New gym — start a workout and it'll get mapped as you go`), dismissible, once per gym (persist dismissal in preferences/settings).
4. **CSS:** new `styles/components/compat-badge.css` (badge states via `--success*`/`--highlight-warm*`/`--muted-bg` tokens) + gym-chip styles in templates.css. Add the @import to styles/index.css.
5. **D0 guard** at the top of the badge/chip render path.

**Verify:** badges correct for a stocked gym, a half-stocked gym (visit-2 scenario: legs mapped, chest workout shows `Not mapped here yet` — NOT "not possible"), an empty gym (banner only), and a user with zero equipment (nothing renders). Template selector still works with no gym set.

## Phase 2 — F2: exercise-matched suggestions + fast paths in the equipment picker

**Outcome:** Empty/thin picker suggests instead of shrugging. Mockup frame: "0b — Suggest, don't shrug".

1. **New pure module `js/core/features/exercise-machine-matcher.js`:** reverse of machine-exercise-matcher.js — `suggestMachinesForExercise(exerciseName, catalog)` → ranked catalog entries. Same conservative contiguous-phrase matching; share stemming helpers with the forward matcher (extract shared bits into fuzzy-match.js if needed). Unit tests required (mirror the forward matcher's test style).
2. **Picker changes** in active-workout-ui.js — extend the SHARED sheet renderers (`awOpenEquipmentSheet` + `openSharedEquipmentSheet`; per CLAUDE.md prefer parameterizing over forking):
   - Fast-path row at the TOP of the sheet body (before search): `Skip equipment` · `Free weights` · `Cable machine` (per F2's "three levels of caring").
   - `Skip equipment`: permanent per exercise (D10). Clear the equipment expectation on the template exercise (`checkTemplateCompatibility` already treats equipment-less exercises as always-available, so all badges/sheets go quiet for it automatically). Show `showNotification` toast `Won't ask about equipment for [exercise] again` with an undo action that restores the field. Creates nothing. Re-engagement: the user picking equipment for that exercise in any later session restores tracking (write the equipment back to the template exercise on the existing auto-associate path).
   - `Free weights`: reveals a two-chip follow-up `Dumbbells` / `Barbell` (split preserves PR segmentation per exercise+equipment); selection creates/reuses a generic gym-tagged doc of that type.
   - `Cable machine`: creates/reuses a generic gym-tagged doc `{name: 'Cable machine', equipmentType: 'Cable'}`, no catalogRef, exercise-linked via the normal auto-associate path. "Reuses" matters — check for an existing generic doc of the same type at this gym before creating, or every fast-path tap spawns a duplicate.
   - When the "For exercise" section is empty: render "Matches for [exercise]" section from `suggestMachinesForExercise`, rows one-tap through the existing `openQuickAddSheet` commit pipeline (created → gym-tagged → linked → selected).
3. All new writes end in `refreshEquipmentCaches()` (Tier 0.1 invariant).

**Verify (active-workout safety list from CLAUDE.md):** change-equipment, replace-exercise, add-exercise from menu, complete-workout, and `debouncedSaveWorkoutData` still fire. Fast paths work with GPS off and with no session gym (generic docs save without a gym tag). Tapping `Cable machine` twice at the same gym reuses one doc, not two.

## Phase 3 — F3: gym-aware replace + D9 everywhere missing exercises appear

**Outcome:** Replace leads with what the gym can do; expanded workout cards show per-exercise availability with Pick machine / Swap. Mockup frames: "0c", "Step 3b".

1. **Replace:** rewire `awReplaceExercise` (active-workout-ui.js:1432) away from `window.replaceExercise`/full library → `openSharedAddExerciseSheet` with a new leading section "Possible at [gym]" fed by `rankExercisesForLocation` (equipment-planner.js), same body part first; full library below (D8: one extra section renderer, not a new picker). Keep `replaceExercise` in exercise-ui.js untouched for legacy flows.
2. **Expanded selector card** (template-selection.js): per-exercise availability is **status-only** when a session gym is set — available rows normal; unmapped rows slightly dimmed with a trailing `Not mapped` label; one footer line when partial (`2 not mapped — pick machines or swaps when you start. Asked once, remembered.`). NO buttons, NO handlers on these rows (D10/Kevin: the card informs, it never solicits — resolution happens only in the Phase 4 sheet and the Phase 2 picker). Skipped-equipment exercises (D10) count as available and render normally here.

**Verify:** replacing an exercise mid-workout at a mapped gym shows gym section first; at an unmapped gym falls back gracefully to the full library. Expanded-card availability rows render no interactive handlers (window-wiring test should find nothing new there); skipped-equipment exercises show as available, not unmapped.

## Phase 4 — Substitution sheet on start

**Outcome:** Starting a workout with unmapped exercises raises the Machine / Swap / Skip sheet. Mockup frame: "Step 4 — Start".

1. New `aw-sheet`-pattern sheet (unique ids, cleanup on close, per CLAUDE.md bottom-sheet guide) triggered in the start-workout path when a session gym is set and `compatibility.missing > 0`.
2. Per-exercise segmented choice: `Keep` (default — decided 2026-07-02; badge might be wrong per D3, nothing is silently dropped) / `Machine` (opens Phase 2 picker; resolves the row) / `Swap` (Phase 3 sheet; session-only) / `Skip` (session-only). Footer: primary `Start workout` (enabled immediately — Keep-all is a valid answer); the separate `Keep them anyway` link is redundant with Keep-as-default and can be dropped.
3. Session substitutions/skips live on the in-flight workout object only (D5) — never write to the template doc. Machine links persist (D9).
4. **D10 memory:** store the sheet's per-exercise resolutions keyed by `templateId + exerciseName + gymName` (a small map under `users/{uid}/preferences` or on the location doc — pick whichever is cheaper to read at start time and document the choice). Next visit: machine-resolved exercises don't appear at all; swap/skip choices render pre-selected so `Start workout` is one tap. A changed choice overwrites the memory.
5. D3: sheet never appears when badge data says full/unmapped-only… only for `partial` with explicit missing rows.

**Verify:** template doc byte-identical after a session with swaps+skips; completed workout doc records what was actually done.

## Phase 5 — F4: completion payoff

**Outcome:** Completion summary counts newly mapped machines. Mockup frame: "0d — The payoff".

1. Track equipment docs created/gym-tagged during the session (a simple counter/set on AppState scoped to the active workout, reset on start/complete).
2. One card in the completion summary (workout-session.js): `You mapped 5 machines at Marriott Austin — next time you'll see what's possible before you start.` Returning visit variant: `You mapped 4 more machines at Marriott Austin — 12 total.` Render only when count > 0 (D0: silent otherwise).

## Phase 6 — 3.2: machine settings memory (independent; anytime after Phase 1)

**Outcome:** Settings chips at set time + edit sheet. Mockup frames: "Step 5", "Step 5b".

1. **Data:** `exerciseSettings` map on equipment docs — `{ [exerciseName]: [{label, value}] }` (D4). Save/load in firebase-workout-manager.js; writes end in `refreshEquipmentCaches()`. This is a schema addition to equipment docs only — no workout-doc version bump needed.
2. **Display:** chip row under `.aw-equip-line` in active-workout-ui.js — saved pairs as chips, pencil chip to edit, ghost `+ Note settings` when empty. Read-only at set time, one tap to open the sheet. Also a compact sub-line in picker rows (`Seat 4 · Pin 13`).
3. **Edit sheet:** `aw-sheet` pattern; label+value rows with remove; suggested-label chips (`Seat`, `Pad`, `Pin`, `Grip`, `Handles`, `Custom…`); `Cancel` / `Save settings`.
4. **CSS:** extend bodyweight.css-style component file or new `styles/components/settings-chips.css` (+ index.css import).
5. Zero prompts anywhere (D0): the ghost chip is the only affordance.

**Verify:** settings persist per equipment+exercise; same exercise on different equipment (home vs travel gym) shows different settings; no chips for users who never saved any.

## Phase 7 — F5: equipment quick-edit sheet (independent) — **SHIPPED 2026-07-02**

> Build steps below reference `syncCatalogRefOnLocation` / `location.equipment[]` mirroring — that whole mechanism was removed in 8b step 4 (equipment collection is the sole source now). Historical; don't re-run.

**Outcome:** Rename / exercise links / gym tags without the full-page form. Mockup frame: "F5 — Quick edit".

1. `aw-sheet`-pattern sheet: name field, exercise-link chips (remove ×, add via exercise search; suggested chip for the exercise in context), gym-tag chips (remove, add from saved gyms), `Full details` (routes to existing equipment detail page) / `Save`.
2. Entry points (start with two, add more later per open question 8): ⋯ on picker rows (Phase 2's sheet) and the active-workout equipment line long-press or ⋯.
3. All writes through existing firebase-workout-manager paths (`saveEquipmentField`, location add/remove helpers) so Tier 0/1 mirroring (`syncCatalogRefOnLocation`, rename cascade) keeps working. End in `refreshEquipmentCaches()`.
4. Natural seam extraction (per multigym-assessment tech-debt note): if this forces pieces out of equipment-library-ui.js, extract just the quick-edit module in the same PR — no broader split.

**Verify:** removing a gym tag from the sheet mirrors `location.equipment[]` (Tier 0.1 behavior); rename shows everywhere immediately; window-wiring test passes for all sheet handlers.

---

## Rollout order & risk notes

- Ship 1 → 2 → 3 → 4 → 5 in sequence; 6 and 7 slot anywhere after 1. Phases 1+2 together deliver the visible "wow" and the new-user activation path — prioritize getting both onto dev and living with them before 3–5.
- **Phase 1 must never ship without its F1/unmapped state** — badges with hard negatives at unexplored gyms would be the worst possible first impression (traveler-flow.md D6).
- Highest-risk surface is Phases 2–4 touching active-workout-ui.js: per CLAUDE.md, prefer parallel/parameterized APIs over refactoring `awOpenEquipmentSheet`/`awAddExercise`, and re-verify the four safety flows after every change.
- Prod promotion only after each phase has been exercised on dev at a real gym session (Kevin's device) — this feature area is exactly where silent data corruption erodes trust.
