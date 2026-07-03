# UX Overhaul Implementation Plan — July 2026

Source: [UX-AUDIT-2026-07.md](../UX-AUDIT-2026-07.md) + mockups (`mockups/dashboard-v3.html`, `equipment-detail-redesign.html`, `exercise-detail-v2.html`, `workout-editor-ergonomics.html`) + supplemental sweep of AI Coach / DEXA / manual workout / plate calc / body measurements / locations / exercise library / onboarding / error log.

Phases are independently shippable, ordered by value-per-effort. Each ends with the standard gate: `npm test` + `npm run lint` + `npm run audit:design` + deploy to **dev** and verify on device before prod.

Legend: `[ ]` open · sizes S (<½ day), M (~1 day), L (multi-day)

---

## The consistency contract

Explicit goal: **one system, not a hodgepodge of add-on fixes.** Every phase below must conform to these canonical patterns — and when a phase touches a screen, it migrates that screen's legacy variants to the canonical pattern as part of the same PR (the CLAUDE.md Rule 9 "rename when doing neighboring work" clause, made mandatory for this overhaul). No phase introduces a new one-off.

| Concern | The ONE pattern | Kills |
|---|---|---|
| Blocking overlay | `--overlay-heavy` + `var(--backdrop-blur)` (Phase 0) | 11 divergent backdrops, medium/heavy coin-flip |
| Editing a field | Read-first card/row → tap → `aw-sheet` (or `confirmSheet` for confirm) → section-scoped re-render | Always-open inputs, 5 edit idioms on equipment detail, full-page re-renders |
| Interactive chip/day/toggle | `<button>` ≥ `--tap-sm`, `aria-pressed`, shared `:active` scale | `<span>` chips, glyph-sized day circles, feedback-less taps |
| List row | `.row-card` | `.equip-row`, `.equip-detail-ex-row`, per-page row inventions |
| Back button | One 44px `.page-header__back` | `.d-back` 32px, `.detail-page-header__back` 36px |
| Search | `.field-search` | `.equip-lib-search` |
| Filter pills | `.chip` | `.filter-pill` |
| Chart | SVG primitives w/ axis labels + `aria-label` (Phase 1) | Axis-less one-offs |
| Time-range state | One shared range-filter (options + persisted pick) | 3 divergent defaults/option sets |
| Element visibility check | `!classList.contains('hidden')` helper | `.open` checks on non-`<dialog>` sections (2 latent bugs found) |
| Copy | CLAUDE.md copy rules, §11 lint greps run per PR | Title-case drift, `!`, `...`, "template" exposed |

Enforcement: after Phase 0 and Phase 5, ratchet `scripts/design-audit.js` budgets down to the new baseline (duplicate classes, inline styles, raw literals) and add a grep-based check for `backdrop-filter` presence on backdrop selectors + `\.open\b` on non-dialog ids, so drift fails CI instead of accumulating again.

---

## Phase 0 — Backdrop unification: the "focus blur" system (S)

The blur treatment already exists in exactly one place — `confirm-sheet.css:25-31` (`backdrop-filter: blur(4px)`, with a comment explaining the rationale). Every other overlay is a plain dim, split inconsistently between `--overlay-medium` (0.5) and `--overlay-heavy` (0.7) with no rule for which gets which. Standardize.

- [ ] Add tokens to `tokens.css`:
  ```css
  --backdrop-blur: blur(4px);
  /* rule: sheets & dialogs over a page → overlay-heavy + blur;
     transient popovers (non-blocking) → overlay-medium, no blur */
  ```
- [ ] Apply `backdrop-filter: var(--backdrop-blur)` + `-webkit-` prefix to all blocking backdrops:
  `dialog[open]::backdrop` (utilities.css:57), `dialog.modal::backdrop` (modals.css:316), `.modal-overlay` (modals.css:4), `.modal` (modals.css:276), `.aw-sheet-backdrop` (active-workout-v2.css:764), `.aw-form-video-overlay`, `.dash-todays-prs-overlay` (dashboard-v2.css:485), `.bw-prompt-overlay` (bodyweight.css:11), `.exercise-modal` (nav.css:70), `.more-menu-overlay` (nav.css:196), `.picker-overlay` (settings.css:70)
- [ ] Normalize darkness: all of the above → `--overlay-heavy`. Retire the medium/heavy split for backdrops (keep `--overlay-medium` for non-backdrop scrims).
- [ ] Plate-calc popover has **no backdrop at all** and no outside-tap-close (plate-calculator.js:363-415) — give it the standard backdrop + tap-to-dismiss, matching the aw-sheet pattern.
- [ ] Perf guard: transition `opacity` only (never animate the blur), keep blur ≤4px. 🧪 Verify on-device that sheet open/close stays smooth — `backdrop-filter` is GPU-composited but can jank on older Android if animated.
- [ ] Gate: `npm run audit:design` + visual pass over every sheet/modal on dev.

## Phase 1 — Trust the numbers: equipment-aware trends + chart axes (M)

Audit §1a/§2. Mockup: `exercise-detail-v2.html`.

- [ ] `aggregators.js`: add optional `equipment` param to `aggregateExerciseStats` (one extra `.filter()` after name match); expose per-equipment session counts for pill labels. **Do not touch** the display-unit conversion at :644-651.
- [ ] Exercise detail: machine-picker pill row (All / per-equipment, with counts); "Mixed equipment" badge + machine-change dots on the combined chart; "Same machine" badge when filtered.
- [ ] Equipment on every session row and best-set row (data already in workout docs); gym name on best sets.
- [ ] PR rows (dashboard + progress) render `pr.equipment` — PRTracker already returns it, the templates just drop it.
- [ ] Chart primitives (`chart-line.js`, `chart-combo-bars-line.js`): Y min/max + X start/end date `<text>` labels; `aria-label` on the SVG. Sparklines stay bare.
- [ ] Tests: extend `progress-calculations.test.js` — same-name/different-equipment fixtures assert filtered vs combined stats; axis-label output snapshot for chartLine.

## Phase 2 — Dashboard reorder + Progress gets a job (M)

Audit §1b. Mockup: `dashboard-v3.html`.

- [ ] Reorder `renderDashboard()`: Greeting → active pill → **For Today** (hero treatment, one-tap start) → last-session one-liner (new; from already-loaded `allWorkouts`/`lastDoneByType`) → hero chips → composition → recent PRs → Progress link.
- [ ] PR-proximity hook inside the For Today hero: cross-reference today's template exercises against `PRTracker.getExercisePRs()` — "2.5 lb off your Bench PR". Fires only when within a threshold (e.g. ≤5% of PR weight seen in last 2 sessions).
- [ ] Move the 6 body-part cards off the dashboard → Progress only; dashboard gets a single Progress link row carrying the top headline (e.g. "shoulders are low").
- [ ] Body-part cards gain a Low/On target/High **sets-per-week chip** from `analyzeWeeklyVolume` (MEV/MRV logic already computes it); demote hero-lift to the meta line with the lift named.
- [ ] De-dupe: today's-PR banner excludes PRs already in Recent PRs; align body-weight sparkline window with its "30 days" caption.
- [ ] Tests: `weekly-goal.test.js` untouched; add fixture test for PR-proximity threshold logic (export it pure).

## Phase 3 — Day chips + editor ergonomics (S)

Audit §4. Mockup: `workout-editor-ergonomics.html`. Smallest diff, highest daily-annoyance relief — can ship before Phases 1-2 if preferred.

- [ ] `.day-chip`: `width/height: var(--tap)` (44px), `<span>` → `<button type="button">`, `aria-pressed`, `:active { transform: scale(0.9) }`. 7×44 + 6×5px gap = 338px — fits 340px content width.
- [ ] Category chips beside them: `<button>`, shared `:active`, padding toward `--tap-sm`.
- [ ] Chevron on collapsed template rows (rotate on expand) — separates "open" from the adjacent play button.
- [ ] Steppers: real +/− buttons around the value (`--tap-sm` height), tap value for keyboard entry.
- [ ] Reorder arrows → `--tap-sm` each with 6px gap (drag handle is the stretch goal, not required).
- [ ] Notes textarea: reuse `awAutoGrowNotes` pattern.
- [ ] "Suggested for [day]" banner on the selector via `getTemplatesForDayOfWeek` (already built for the dashboard).
- [ ] Tests: `window-wiring.test.js` will catch handler wiring; add tap-target lint note to DESIGN-BACKLOG.

## Phase 4 — Equipment detail restructure (L) — SHIPPED 2026-07-03

Audit §3. Mockup: `equipment-detail-redesign.html`.

- [x] Restructure `openEquipmentDetail()` into 7 groups: hero card (tap → identity sheet: name/brand/line/function/type) · stat strip (keep) · Setup row-card (base weight → sheet) · Locations chips (keep inline) · Used-for compact row-cards (tap → sheet: Remove / edit form video / open video) · Notes · danger card with honest consequence copy. **(4de2c52)**
- [x] Scroll restore — capture/restore scrollTop across every in-place re-render, killing the full-page reset that scrolled to top on every row action. **(4de2c52)**
- [x] One shared write path for equipment↔gym links — already unified via `syncCatalogRefOnLocation` (Tier 0.1); every mutation site (add/remove location, delete equipment, quick-add) routes through it.
- [x] Fix: dead "View all →" (8467c0a); search no longer gated behind `locations.length > 0` (8467c0a); duplicate `.sec-head` in page-header.css (8467c0a); dead "By Brand" view path deleted (f054fc6). *(Deferred: `.equip-lib-search`→`.field-search` and `.filter-pill`→`.chip` — cosmetic list-view class renames, no behavior change.)*
- [ ] "Edit form video" entry point from the workout-flow exercise menu — **deferred**: a new active-workout feature (highest-risk surface) needing a cross-module equipment-by-name→id lookup + on-device verification of change-equipment/replace/add/complete flows. Form-video editing already ships in the used-for sheet.
- [ ] Tests: shared location-write helper coverage — deferred with the form-video entry.

## Phase 4 remaining is optional polish; the substance shipped.

## Phase 5 — Fit & finish sweep (M, parallelizable)

Audit §5-§6 + supplemental sweep findings.

**Bugs/dead-ends**
- [x] 🔴 Onboarding "Skip for now" — reachable on every step, sets `hasCompletedOnboarding`. **(26710c4)**
- [x] 🔴 Body-weight trend color — the up=red/down=green hardcode lived only inside dead `renderBodyWeightCard`; deleted the function + its `.bodyweight-*` CSS at the source. **(26710c4)**
- [x] 🔴 DEXA stale history after delete — `historyModal?.open` was always undefined (it's a `<section>`); check `.hidden` instead. App-wide `.open` audit found the exercise-manager sites were already hardened. **(26710c4)**
- [x] 🟡 DEXA unit switch now converts entered mass values through `convertWeight` (%, BMC, bone density left unit-independent). **(dbe9f9b)**
- [ ] 🟡 Body measurements: height writes to profile before the form validates/saves — half-submitted form commits one field. *(Remaining — plan's line refs were stale; needs re-locating the height-save flow.)*
- [x] 🟡 AI Coach Regenerate now confirms before discarding an edited preview. **(dbe9f9b)**
- [x] 🟡 Error log empty bug-report submit now shows "Add a description". **(26710c4)**
- [ ] 🟡 History: consolidate the two workout-detail modals; empty calendar days open add-workout prefilled; calendar cells 38→44px. *(Remaining.)*
- [ ] 🟡 Settings: add Locations + Equipment rows; merge/clarify the two export actions; Rebuild PRs out of Danger zone. *(Remaining.)*

**Copy sweep (one PR, run the CLAUDE.md §11 lint greps)**
- [x] Sentence-cased CTAs/titles/labels (exercise-manager, DEXA labels, body-measurements, manual-workout, error-log), terminology fixes (template→workout in AI Coach/history/selector), proper `…` ellipses, dropped success-toast exclamation. **(04c8026)** *(Left AI Coach split buttons — coupled to logic keys, read as named categories.)*

**Consistency**
- [ ] Unify range-state defaults/options across drill-down levels; persist pick.
- [ ] Empty-range messaging in drill-downs ("No data in this range — try All time").
- [ ] One 44px back-button component (`.d-back` 32px / `.detail-page-header__back` 36px today).
- [ ] Range pills + `.btn-icon-sm` to 44px; chips.css tokenization.
- [ ] Delete dead code: `renderBodyWeightCard`, manual-workout no-op exports, brand-view render path.
- [ ] Consolidate the two deload detectors; insights end in an instruction.

## Phase 6 — Docs + active-workout micro-polish (S)

- [ ] README: remove deleted-file references (~lines 147, 162, 218), match the updated CLAUDE.md.
- [ ] Active workout (minor only): merge "Rest done / Ready for your next set" to one line; `title` on +30s/Skip; consider `--font-sm` notes textarea.
- [ ] Update DESIGN-BACKLOG.md: link this plan as the successor backlog; mark superseded items.

---

## Suggested order

**3 → 0 → 1 → 2 → 4 → 5 → 6.** Phase 3 first: smallest diff, felt every day. Phase 0 next: pure CSS, instantly makes the whole app feel like the mockups. Then the two data/dashboard phases that fix "why do I care" (1 before 2 — the dashboard's PR-proximity card depends on nothing from Phase 1, but equipment-aware numbers make every surface more trustworthy first). Equipment detail (4) is the biggest lift; the fit-and-finish sweep (5) can be interleaved anytime as filler work.

Every phase: dev deploy first, on-device check (375px), then prod — per the deployment rules in CLAUDE.md.
