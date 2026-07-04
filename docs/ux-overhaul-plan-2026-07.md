# UX Overhaul Implementation Plan — July 2026

Source: [UX-AUDIT-2026-07.md](../UX-AUDIT-2026-07.md) + mockups (`mockups/dashboard-v3.html`, `equipment-detail-redesign.html`, `exercise-detail-v2.html`, `workout-editor-ergonomics.html`) + supplemental sweep of AI Coach / DEXA / manual workout / plate calc / body measurements / locations / exercise library / onboarding / error log.

Phases are independently shippable, ordered by value-per-effort. Each ends with the standard gate: `npm test` + `npm run lint` + `npm run audit:design` + deploy to **dev** and verify on device before prod.

Legend: `[ ]` open · sizes S (<½ day), M (~1 day), L (multi-day)

---

## Do next — quick-win batch — SHIPPED 2026-07-03

Three independent, low-risk fixes pulled forward from Phases 2/5.

- [x] **Fix "Last done NaNd ago"** — `formatLastDoneMeta`: `if (!Number.isFinite(days)) return ''` + `debugLog` the bad `rec.date`. (`renderLastSessionLine` already parses via `formatRelativeDate`, so it needed no guard.) **(994b73e)**
- [x] **Kill the duplicate insight** — `renderProgressLinkRow` takes `showInsight`; skips the `topInsight.message` fallback when the insight card is already visible. Copy fix landed in `training-insights.js` (where the string is generated). **(994b73e)**
- [x] **Add Progress to the More menu** — Tracking group, `fa-chart-line` → `showProgressPage()`; dashboard link row kept. **(b82683e)**

---

## Marcus re-review batch (from docs/marcus-review-2026-07.md, S/M — one session)

Post-implementation review findings, 2026-07-03. Theme: the range plumbing got unified but not the widgets — the consistency contract applies to UI, not just state.

- [x] **[P1] Point exercise-detail + muscle-group-detail at the shared `renderRangeFilter()`** — both now render `<div class="d-range">${renderRangeFilter(range, 'set{Exercise,Muscle}Range')}</div>`; local `renderRangePills` + the `.range-pills` CSS deleted. The shared widget is `min-height: var(--tap-sm)`; `.d-range` only insets it to the 14px gutter. **(this batch)**
- [x] **[P1] Progress page range mismatch** — carried 'W' into the destination: `showMuscleGroupDetail()` sets `AppState.dashboardRange = 'W'` before navigating (body-part cards are a weekly view — "Volume · wk", sets/wk vs target — so the drill-down opens on the same week; not persisted, so an explicit range pick in the drill-down still sticks). Left the cards themselves weekly by design. **(this batch)**
- [x] **[P2] Seed cardio exercises** — treadmill, stationary bike, rowing machine, elliptical, stair climber, jump rope added to `data/exercises.json` (`bodyPart: "Cardio"`). ⚠️ Signed-in users read defaults from the Firestore `exercises` collection, not this JSON, so the same 6 rows still need adding there for the Cardio chip to populate for real users — flagged, not done unprompted (prod data write). **(this batch)**
- [x] **[P2] Port the empty-range CTA to metric-detail** — `renderVolumeBodyPartDetail` (0-total) / `renderStrengthDetail` now use a shared `mdEmptyRange()` with a "View all time" button. **(762c513)**
- [ ] **[P2] Cardio's home on Progress — DECISION (recommended): no Cardio body-part card** (weight-volume is meaningless for cardio); instead a small "Conditioning" line on Progress: sessions + minutes this week. *(OPEN — depends on a duration-based cardio log model; the seeded cardio exercises still log as sets/reps/weight, so there are no "minutes" to sum yet. Real feature, not drift — deferred out of the consistency gate.)*
- [x] **[P3] `.te-row__remove` 28px → `--tap-sm`** — now 36px, flex-centered. **(this batch)**
- [x] **[P3] Replace the regex handler-rewire** — `renderRangeFilter(activeRange, handler = 'setDashboardRange')` takes a handler-name param; metric-detail passes `'setDetailRange'` directly, no more `.replace()`. **(this batch)**
- [x] ~~Dead chevron CSS from Phase 3b~~ — already tracked under the dead-code follow-up.

---

## Equipment editor flow bugs (Kevin report 2026-07-03, traced to root cause — P1 batch)

Reported: "Full details opens the whole library; brand buttons don't work; catalog machine only offers add-to-gym, not edit."

- [x] **[P1] Race: "Full details" gets stomped by the library list.** Was: `qeOpenFullDetails` used a hardcoded `setTimeout(200)` to call `openEquipmentDetail` after `navigateTo('equipment-library')`, but the library's async Firestore reads repaint the LIST into the same node — >~150ms and the list painted over the detail. **Fixed (7bd7be7)** with a handoff instead of a timing guess: `setPendingEquipmentDetail(id)` makes the library's OWN async paint render that detail. Race-free by construction (same async path, flag set before navigation) — no timing dependency. The "dead brand buttons" symptom was downstream of this race; handlers were always correctly wired.
- [x] **[P1] Catalog tap is add-only — no edit path for owned machines.** **Fixed (this batch):** catalog browse + search rows now check ownership via `findOwnedForCatalogMachine` (reuses commitCatalogAdd's catalogRef/name/function predicate — not a third copy). Owned machines → `openEquipmentDetail(ownedId)` (the editable detail) with a pen icon + "In your equipment"; unowned → `openCatalogMachineAddToGym` with the plus. No more "go back to the gym page" workaround.
- [ ] **[P2] Return context never set/honored on this trip.** `qeOpenFullDetails` never calls `setLibraryReturnContext`; `commitCatalogAdd` neither reads nor clears `_libraryReturnContext` and strands the user on the catalog after adding. *(DEFERRED to the Phase 2b on-device back-nav session — this is interim back-navigation and the plan already notes it's superseded by 2b's stack unification. Back-nav correctness needs device verification, so it pairs with 2b rather than being guessed at blind.)*
- [ ] **[P3] Pre-existing dead handlers found by the wiring test during this trace** (unrelated to equipment): `awSettingsAdd`, `awSharedOpenCatalogQuickAdd`, `_bsSubStart`. Clean up separately.

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

## Phase 0 — Backdrop unification: the "focus blur" system (S) — ✅ SHIPPED as UX-0 (2026-07-02)

`--backdrop-blur` token + `backdrop-filter` applied across all blocking backdrops; design-audit gate (0 missing) enforces it. Tracked in launch-roadmap.md §4.

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

## Phase 1 — Trust the numbers: equipment-aware trends + chart axes (M) — ✅ SHIPPED as UX-1 (4c6a41f)

Audit §1a/§2. Mockup: `exercise-detail-v2.html`.

- [ ] `aggregators.js`: add optional `equipment` param to `aggregateExerciseStats` (one extra `.filter()` after name match); expose per-equipment session counts for pill labels. **Do not touch** the display-unit conversion at :644-651.
- [ ] Exercise detail: machine-picker pill row (All / per-equipment, with counts); "Mixed equipment" badge + machine-change dots on the combined chart; "Same machine" badge when filtered.
- [ ] Equipment on every session row and best-set row (data already in workout docs); gym name on best sets.
- [ ] PR rows (dashboard + progress) render `pr.equipment` — PRTracker already returns it, the templates just drop it.
- [ ] Chart primitives (`chart-line.js`, `chart-combo-bars-line.js`): Y min/max + X start/end date `<text>` labels; `aria-label` on the SVG. Sparklines stay bare.
- [ ] Tests: extend `progress-calculations.test.js` — same-name/different-equipment fixtures assert filtered vs combined stats; axis-label output snapshot for chartLine.

## Phase 2 — Dashboard reorder + Progress gets a job (M) — ✅ SHIPPED as UX-2 (b222edc)

Audit §1b. Mockup: `dashboard-v3.html`.

- [ ] Reorder `renderDashboard()`: Greeting → active pill → **For Today** (hero treatment, one-tap start) → last-session one-liner (new; from already-loaded `allWorkouts`/`lastDoneByType`) → hero chips → composition → recent PRs → Progress link.
- [ ] PR-proximity hook inside the For Today hero: cross-reference today's template exercises against `PRTracker.getExercisePRs()` — "2.5 lb off your Bench PR". Fires only when within a threshold (e.g. ≤5% of PR weight seen in last 2 sessions).
- [ ] Move the 6 body-part cards off the dashboard → Progress only; dashboard gets a single Progress link row carrying the top headline (e.g. "shoulders are low").
- [ ] Body-part cards gain a Low/On target/High **sets-per-week chip** from `analyzeWeeklyVolume` (MEV/MRV logic already computes it); demote hero-lift to the meta line with the lift named.
- [ ] De-dupe: today's-PR banner excludes PRs already in Recent PRs; align body-weight sparkline window with its "30 days" caption.
- [ ] Tests: `weekly-goal.test.js` untouched; add fixture test for PR-proximity threshold logic (export it pure).

### Phase 2 follow-ups (from the live build, screenshots 2026-07-03) — SHIPPED

- [x] 🔴 "Last done NaNd ago" — finite guard + debugLog in `formatLastDoneMeta`. **(994b73e)**
- [x] 🟡 Same insight rendered twice — `showInsight` threaded into `renderProgressLinkRow`. **(994b73e)**
- [x] 🟡 PR rows show the full derived equipment name — `equipShortName` keeps just the brand/line prefix before the em dash (dashboard + Progress via shared `prMetaLine`). **(f498c9c)**
- [x] 🟡 Insight copy "this week" twice — fixed in `training-insights.js` → "Back volume is low — 4 sets. Add 4 more this week." (Capital "Back" kept: it's a proper-noun category per CLAUDE.md §1.) **(994b73e)**
- [x] 🟡 Header logo block ~113px — logo 80→48px + tighter padding (~69px) so For Today clears the fold. **(52e1676)**

## Phase 2b — Navigation: back means back (S/M)

User-reported: back buttons sometimes land on the dashboard instead of the prior page. Root causes in navigation.js: `navigateBack()` pops a 5-entry `navStack` and falls back to dashboard when empty (navigation.js:41-51) — but the stack only gets entries when pages are shown via `navigateTo`; several surfaces show sections by toggling `.hidden` directly or use fixed-destination back handlers (`backToEquipmentList`, `_libraryReturnContext.returnTo`, `closeProfile`, etc.), so the stack is empty or stale exactly when deep-linked flows need it.

- [ ] Route every full-page section show through `navigateTo` (no direct `.hidden` toggles for sections in SECTION_IDS).
- [ ] Every back button calls `navigateBack()` — retire fixed-destination backs and the `_libraryReturnContext` callback pattern.
- [ ] Raise MAX_STACK_SIZE (5 → 10) and skip pushing a view onto the stack when it equals the top (dedupe re-renders).
- [ ] Add to the consistency contract: one back system. Test: from dashboard → Progress → muscle group → exercise → equipment detail → back ×4 lands you exactly where you came from.

## Phase 3 — Day chips + editor ergonomics (S) — ✅ SHIPPED as UX-3 (2026-07-02)

Audit §4. Mockup: `workout-editor-ergonomics.html`. Smallest diff, highest daily-annoyance relief — can ship before Phases 1-2 if preferred.

- [ ] `.day-chip`: `width/height: var(--tap)` (44px), `<span>` → `<button type="button">`, `aria-pressed`, `:active { transform: scale(0.9) }`. 7×44 + 6×5px gap = 338px — fits 340px content width.
- [ ] Category chips beside them: `<button>`, shared `:active`, padding toward `--tap-sm`.
- [ ] Chevron on collapsed template rows (rotate on expand) — separates "open" from the adjacent play button.
- [ ] Steppers: real +/− buttons around the value (`--tap-sm` height), tap value for keyboard entry.
- [ ] Reorder arrows → `--tap-sm` each with 6px gap (drag handle is the stretch goal, not required).
- [ ] Notes textarea: reuse `awAutoGrowNotes` pattern.
- [ ] "Suggested for [day]" banner on the selector via `getTemplatesForDayOfWeek` (already built for the dashboard).
- [ ] Tests: `window-wiring.test.js` will catch handler wiring; add tap-target lint note to DESIGN-BACKLOG.

## Phase 3b — Workout library revamp (L)

Design review verdict: REVAMP. The inline editor-in-list is the wrong container: a 7-exercise template's expanded editor is ~550-615px inside a ~650px usable viewport, living inside a scrolling sibling list with no scroll-into-view. Editor internals (steppers, debounced autosave, reorder, last-session hydration) are good — they move, unchanged, to a new container.

- [x] Move the expanded-template editor off the list flow: tap row → dedicated editor page (`#workout-editor-section`, pinned-header full-height flex — header pins top, exercise list scrolls, Start bar pins bottom). Registered in navigation.js (`showWorkoutEditorView` route + section id); `showWorkoutEditor`/`closeWorkoutEditor` drive it; `renderActiveWorkoutEditor` is self-sufficient (loads gym context + history + rebuilds `loadedTemplates`) so list-tap and deep-link (editTemplate / createNewTemplate / duplicate / AI-coach) both land on it. The collapsed list is now read-first (no inline expand); scroll never gets disturbed.
- [x] Collapsed-row information scent: rows now carry the category chip + "Usually [day]" + exercise count + ~duration (line 1, via `renderTemplateSummary`) and last-done (line 2). Chevron opens the editor; play starts.
- [ ] Delete ~40% dead code in template-selection.js: `createTemplateCard`/`renderTemplateCards`, `createWorkoutCard`/`renderWorkoutCards`, the basic-template-editor modal, category-tab switchers — all target DOM ids that no longer exist (`#template-selection-modal`, `#template-cards-container`, `#default-templates`, `#basic-template-editor-modal`). *(OPEN — split into its own follow-up commit; safer to isolate the ~1k-line deletion from the editor refactor. Already killed here: the inline `.template-editor`/`renderTemplateDetailsAccordion`/`detailsOpenForTemplate`/`expandedTemplateId` accordion path.)*
- [x] `.template-search-bar` → `.field-search` (index.html).
- [x] Mockup first: `mockups/workout-library-v2.html` (list + detail page) — **built + APPROVED by Kevin 2026-07-03. Cleared to implement.** Key decisions in it: suggested-for-today becomes a highlighted row (banner component merges away); day chips + category move from the accordion onto the detail page; Start is a sticky footer; exercise rows show sets×reps·weight summary + last-session meta collapsed.
- [x] Preserve through restructure: `schedulePendingTemplateEdit` autosave, optimistic `AppState.workoutPlans` patch, Phase 3 ergonomics — all reused unchanged; only the render container moved.

**Exercise library — verdict REFRESH, no structural rebuild.** Folded into Phase 5:

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
- [x] 🟡 Body measurements: height write-through moved to after the entry saves — no more half-committed height on a failed save. **(1f90953)**
- [x] 🟡 AI Coach Regenerate now confirms before discarding an edited preview. **(dbe9f9b)**
- [x] 🟡 Error log empty bug-report submit now shows "Add a description". **(26710c4)**
- [x] 🟡 History: calendar cells 38→44px + month-nav 36→44px, empty days now open add-workout prefilled. **(1f90953)** Two workout-detail modals consolidated onto the richer `showFixedWorkoutModal` — `viewWorkout` (dashboard last-session / recent list) now routes there instead of the simpler Resume/Repeat/Delete-only modal, which was deleted. *(drill-down/modal pass)*
- [x] 🟡 Settings: added Manage group (Locations + Equipment rows); Rebuild PRs moved out of Danger zone. **(a8e98b1)** *(Two export actions left as-is — they're genuinely distinct: raw CSV/JSON vs AI-formatted JSON.)*
- [x] 🟡 Add "Progress" to the More menu (Tracking group) — shipped with the quick-win batch. **(b82683e)**

**Copy sweep (one PR, run the CLAUDE.md §11 lint greps)**
- [x] Sentence-cased CTAs/titles/labels (exercise-manager, DEXA labels, body-measurements, manual-workout, error-log), terminology fixes (template→workout in AI Coach/history/selector), proper `…` ellipses, dropped success-toast exclamation. **(04c8026)** *(Left AI Coach split buttons — coupled to logic keys, read as named categories.)*
- [ ] **Gym-availability copy (Kevin feedback 2026-07-03: "Possible here" is confusing — nothing says gym or equipment).**
  - Filter pill (template-selection.js ~:541): `Possible here` → the gym name, `At ${gymContext.gym}` (truncate long names), icon `fa-check-circle` → `fa-location-dot` (check reads as "completed"). The tap already opens the gym switcher, so the label doubles as the current-gym indicator. Style distinct from category pills (outline variant) so it doesn't read as a workout category sibling of Push/Pull/Legs.
  - Badges (equipment-planner.js:125-149): `full` "Possible here" → `All equipment here`; `partial` "N of M here" stays as-is; `unmapped` "Not mapped here yet" → `No equipment matched yet` ("mapped" is internal vocabulary; preserves the D6 never-a-hard-negative rule).
  - Rationale: the feature answers "which workouts can I do at this gym?" — the label should contain the gym. Once the pill names it, "4 of 6 here" gains its antecedent.

**Exercise library refresh (design review 2026-07)**
- [x] 🔴 Unify the two exercise pickers on the body-part taxonomy. Both active-workout add-exercise sheets (`awAddExercise`/`renderAddExerciseSheet` from the exercise menu, and the callback-driven `openSharedAddExerciseSheet`) now browse by BODY PART — `All / Chest / Back / Legs / Shoulders / Arms / Core / Cardio` — matching the exercise library and dashboard drill-downs. One shared local helper (`AW_EX_CATEGORIES` + `awExerciseBucket`, folding Lower Back→Back, Glutes/Calves→Legs, Biceps/Triceps→Arms, Abs→Core) drives all three filter/label sites. **This also fixed a live bug:** the old chips filtered on `ex.category`, a field library exercises don't carry (they have `bodyPart`), so every non-"All" chip returned an empty list. Row labels now show `bodyPart` instead of the always-empty category; mid-workout "Create" defaults land in a real body part.
  **Taxonomy decision (APPROVED by Kevin 2026-07-03):** exercises browse by BODY PART — Chest / Back / Legs / Shoulders / Arms / Core / Cardio, matching `BODY_PARTS` in aggregators.js and `classifyBodyPart`; merge Biceps/Triceps into Arms. Push/Pull stays a WORKOUT-category concept (template categories) only.
  **Not done — full renderer extraction (deliberate):** the library is a management grid (badges, usage counts, tap-to-edit) and the sheet is a compact quick-add list; forcing one markup regresses one surface, the "exercise library = visual-refresh-only, no file split" scope holds, and a new cross-module renderer export risks the prod 1-yr-cache version-skew crash. Unification is taxonomy + one shared in-file helper, not one shared cross-module renderer.
- [x] 🟡 Default / Custom / Edited badge on exercise rows. **(10f4305)**
- [x] 🟡 Card tap and Edit button were the identical action — dropped the button; whole card opens the editor, chevron affordance. **(10f4305)**
- [x] 🟡 Reset scroll on filter/search re-render. **(10f4305)**
- [x] 🟢 Removed vestigial `window.selectExerciseCallback` branch. **(10f4305)**

**Consistency**
- [x] Unify range-state defaults/options across drill-down levels; persist pick. One `RANGES = [W,M,3M,6M,Y,All]` + `DEFAULT_RANGE = 'M'` in range-filter.js; exercise/muscle/metric drill-downs all read/write the shared `AppState.dashboardRange` (dropped `exerciseDetailRange`/`muscleDetailRange`); pick persists to `settings.dashboardRange` and reloads on login.
- [x] Empty-range messaging in drill-downs ("No data in this range — try All time"). Exercise + muscle-group drill-downs show a `.empty-state` with a "View all time" CTA when the range has zero sessions; metric-detail already labels per-section empties "…in this range."
- [~] Back-button tap targets: `.d-back` 32→44 and `.detail-page-header__back` 36→44 (var(--tap)). **(837194a)** Full consolidation to one `.page-header__back` class is folded into Phase 2b.
- [x] Range pills → var(--tap-sm), `.btn-icon-sm` 40→44px. **(604060d)** chips.css tokenization deferred (14px/5px/0.85rem have no exact tokens; snapping risks tiny shifts on a ubiquitous component for zero audit pressure).
- [x] Delete dead code: `renderBodyWeightCard` (26710c4), manual-workout no-op stubs (837194a), brand-view path (f054fc6).
- [ ] Consolidate the two deload detectors — **won't-do**: they answer different questions (`detectDeloadWeek` = "am I deloading now?" rolling windows; `checkDeloadNeeded` = "should I deload?" ISO weeks). Merging would lose meaning. Insights already end in an instruction.

## Phase 7 — Two user types: freestyle mode + template scale (M)

User-test feedback (2026-07, first outside user): the app is built for the routine lifter (same day, same order, same machines — the owner). An improviser — knows it's leg day, picks machines as he feels — hit two walls, both code-verified:

**Consistency gate for this phase (lesson from the Marcus re-review):** the range-unification session unified state but left hand-rolled widgets behind — don't repeat that here. Before starting Phase 7, clear the Marcus re-review batch (above) so no known shared-component drift is live. Then, for every UI this phase builds: Quick start's focus picker uses the shared body-part taxonomy + `.chip` (not a new pill variant); the visible add-exercise entry opens `openSharedAddExerciseSheet` / `awAddExercise` (no third picker); the "Save as workout" completion offer goes through `confirmSheet`/existing completion-summary patterns; the archive group in the list reuses Phase 3b's `.row-card` list markup (no new collapsed-group component). Definition of done for every item: the shared component is used AND any local variant it replaces is deleted in the same PR. Run `npm run audit:design -- --list` before and after — the duplicate-class and inline-style counts must not rise.

**Freestyle path (the improviser)** — SHIPPED **(c773a35)**
- [x] 🔴 Quick start — `startFreestyleWorkout(focus)` (workout-session.js, parallel to startWorkout per the safety rule; today's-workout guard duplicated). A "Quick start" CTA at the top of the workouts list + an optional focus picker sheet (Push/Pull/Legs/Core/Cardio, shared `.chip`) → active workout opens with zero exercises and the add-exercise sheet already open. `workoutType: 'Freestyle — Legs'`, `isFreestyle: true`, normal save path. renderAll() gained a 0-exercise empty state (was a blank screen).
- [x] 🔴 Visible mid-workout add — persistent "+" pill at the end of the progress-pill row (`.aw-pill--add`). Additive; the kebab menu item stays.
- [x] 🟡 Graduation path — a freestyle completion (no `templateId`) shows a "Save as workout" banner in the completion summary; names + saves a reusable template in place (no nav away).
- [x] 🟡 Workouts-page empty state — new user (zero workouts) gets both doors: "Quick start" + "Plan a workout".
- [x] 🟢 Dashboard entry (follow-up): the routine user gets one-tap starts on the dashboard's "For Today", but the improviser had to detour to the Workouts tab. Added a "Quick start" link in the For Today header + a Quick start card that replaces the empty For Today (rest day / new user) so the dashboard always has a "train now" door. Both reuse `openQuickStartSheet()`.

**Template scale (the routine user, years of accumulation)** — SHIPPED **(archive/for-today chunk)**
- [x] 🟡 Archive: `archived` flag round-trips via saveTemplateInline; archived workouts drop out of the selector list, For Today ranking (dashboard-ui.js), and the workout-selector's category pills. History untouched. "Archived (N)" collapsed group at the list bottom (reuses `.row-card`) with per-row Restore; archive/restore from the editor page actions. Archive suggestion on the editor page when a workout is 60+ days unused.
- [x] 🟡 For Today diet: hero + 2 compact rows max (`.slice(0, 3)`); anything further behind "All →".
- [x] 🟢 Phase 3b list note: with archive shipped, the v2 list's read-first rows + category pills handle 20-30 active templates; revisit grouping only if archive isn't enough. *(No code — validated.)*

## Phase 6 — Docs + active-workout micro-polish (S) — ✅ SHIPPED 2026-07-03

- [x] README: removed deleted-file references (exercise-progress.js, stats-ui.js, sheet.js, add-exercise-sheet.js). **(65605aa)**
- [x] Active workout: rest-done banner to one line; `title` on +30s/Skip/Dismiss; notes textarea → --font-sm. **(40f54d2)**
- [x] DESIGN-BACKLOG.md points to this plan as the successor; overlapping items marked superseded. **(40f54d2)**

---

## Phase 8 — Equipment domain overhaul (see docs/equipment-deep-dive-2026-07.md)

Full data-model + surface map in the deep-dive doc. Root disease: equipment identity is a mutable name string used as the foreign key across workouts/templates/PRs; the equipment↔gym relationship lives in two disagreeing models bridged by healing jobs; six add flows and ~8 row renderings grew around that core. Ship the P1 editor-flow bug batch (above) first — it's independent and fixes the immediate pain.

### 8a — Surface consolidation (M, consistency-contract work)
- [ ] One add primitive: catalog quick-add sheet with contextual params (gymName, exerciseName, onDone); retire `awQuickAddEquipment`'s bare form and `addEquipmentFromPicker`. *(Interim win shipped: `awSaveNewEquipment` now routes through `getOrCreateEquipment` + idempotent `addLocationToEquipment` instead of writing `saveEquipment` directly — the duplication vector is closed even though the form itself isn't retired yet.)*
- [ ] One selection primitive: replace the isolated equipment-picker modal (equipment-picker.js, workout-management-ui.js:494) with `openSharedEquipmentSheet`.
- [ ] Quick-edit sheet gains Brand/Line/Function rows (reuse the field-picker modal) — covers its stated "80% of edits" case.
- [ ] "+ Add a gym" on the My-gyms tab (name + optional current location) — closes the chicken-and-egg gap (spec'd in equipment-library-redesign-brief.md:110-115, never built).
- [ ] Convert "+ Assign exercise" from legacy full-page markup to a `mountEquipSheet` sheet like the other detail-page edits.
- [ ] Delete orphaned `renderCatalogMachineDetail` path (or make it the universal catalog-row target per the P1 fix); unify catalog brand-drill vs search tap behavior.

### 8b — Identity migration: equipmentId as the only FK (L, staged + additive-first)

**Foundation built + tested (7bd7be7):** `js/core/data/equipment-id-resolver.js` (`resolveEquipmentId` — exact/alias/fuzzy on the app's `diceSimilarity`, with a confidence gate so a confidently-WRONG match is never auto-written — ambiguous → `needsReview`) and `equipment-id-migration.js` (`planEquipmentIdBackfill` = plan-don't-apply, idempotent, skips bodyweight; `rekeyExercisePRsByEquipmentId` = re-key with a hard "never lose a PR" guarantee — unresolved kept under name, id collisions merged by better-PR, count conserved). 22 tests in `equipment-id-{resolution,migration}.test.js`. **Pure — nothing is run against real data yet.**

1. [x] Dual-write `equipmentId` alongside the name string. Done at the two SAVE chokepoints rather than per-picker (covers active / manual / template / edit paths in one place, and — per the active-workout safety rule — touches no active-workout render/pick code): `saveWorkoutData` stamps `exercises[key].equipmentId`, `saveWorkoutTemplate` stamps `exercises[].equipmentId`, both via `confidentEquipmentId` (confident exact/alias only, never a guess) against the warm equipment cache. Additive — the name stays the source of truth; readers ignore the id for now. Survives `validateWorkoutData` (shallow-spread). **(this batch)**
2. [x] Backfill **APPLIED 2026-07-04** to live data (via Firebase MCP, admin-level). Full backup pulled first (`backups/bigsurf-backup-…json`, 1030 docs). Result: **321/321 workouts + 12/12 templates** stamped with `equipmentId` (1196 workout + 43 template exercise writes) — confident (exact/alias) matches only; 126 workout + 15 template review items correctly left name-only. Field-masked additive writes (workouts) / read-modify-write preserving all fields (templates); verified across first/mid/tail/last docs that `equipmentId` landed alongside intact `equipment` name + `sets`. **PR doc (`stats/personalRecords`) untouched** (updateTime pre-run) — PR re-key is a separate later step. Undo available (`undoEquipmentIdBackfill()`) + full backup. Runner + safety net (below) from prior batch.

   Foundation (prior batch): `js/core/data/equipment-id-migration-runner.js` — `runEquipmentIdBackfill()` (dry-run: plans workouts+templates+PR-preview, writes nothing), `{apply:true}` (writes the ADDITIVE equipmentId to workouts+templates only — does NOT re-key PRs; that's step 3), `undoEquipmentIdBackfill()` (strips every added id — clean revert), `snapshotPersonalRecords()` (PR-doc backup for the step-3 re-key). Console-only, gated behind `?debug`. Offline "pull back": `scripts/backup-user-data.mjs` / `restore-user-data.mjs` (firebase-admin, full `users/{uid}` dump/restore). ⚠️ **dev + prod share ONE Firestore (`workout-tracker-b94b6`) — no isolated dev DB**, so a full backup before apply is mandatory. Next: back up → dry-run → inspect → apply.
3. **Flip consumers ID-first, name-fallback retained** — split into the code flip (done) and the live PR data re-key (deferred to step 5):
   - [x] **3a — equipment-doc resolvers (689ced5).** `getEquipmentDoc` (active-workout base-weight / equip line / settings sheet / set-complete / unit-change) and plate-calc's `resolveEquipmentDoc` (base/peg lookup) now resolve by `equipmentId` first, then name — so a renamed machine still resolves for old workouts. Both `isBodyweightExercise` copies (active-workout + legacy exercise-ui) flipped too. Additive: every name-only path is unchanged when no id is present. equipment-planner keys off *exercise-name* availability (not a doc lookup) and aggregators use the equipment *name as a display/grouping label* — neither breaks on rename, so both left as-is.
   - [x] **3b (code) — PR store id-aware (aca22af).** pr-tracker reads resolve id-key then name-key (`resolvePrEquipKey`); `checkForNewPR`/`getExercisePRs`/`recordPR`/`processWorkoutForPRs`/`rebuildPRsFromHistory` all thread `equipmentId`. Writes deliberately stay **name-keyed** — `getAllPRs`/`getPRsByBodyPart`/`getRecentPRs` surface the store KEY as the equipment label, so raw id keys can't be introduced until the name is denormalized onto each entry (step 5). +6 tests (id lookup when name differs, no false-first, no id-key split on new/updated writes).
   - [ ] **3b (data) — the actual name→id re-key.** Bundle with step 5: add `equipmentName` denormalization to each PR entry + update the 3 display functions to read it, THEN rebuild-to-id (or the tested `rekeyExercisePRsByEquipmentId` planner) — snapshot first. ⚠️ Must land on **prod** before the live re-key (shared Firestore: an un-updated client's name-only reader would mis-detect PRs against an id-keyed store).
4. [ ] Collapse the location dual-model → `equipment.locationIds[]`; delete `promoteCatalogToEquipment` / `healDuplicateLocationEquipment` / `migrateLocationCatalogRefs` / `syncCatalogRefOnLocation` / `untagGymFromPromotedDocs`.
5. [ ] One identity-edit function regenerating `name` from brand/line/machine (bundle the `function`→`machine` rename here; careful — the CATALOG schema legitimately uses `machine` for a different object). **Bundle here too:** (a) the quick-edit brand/line/function rows (deferred from Phase 8a — a brand/line typo in quick-edit must regenerate the composed name, else it leaves a stale display name; do it once the regeneration fn exists so both the identity sheet and quick-edit share it); (b) the PR `equipmentName` denormalization + name→id re-key (step 3b-data) — a rename can then call the PR migration so PRs follow the machine.
6. [ ] Retire `aliases[]` + the deprecated `Machine` type bucket last, after telemetry shows no fresh drift.

---

## Suggested order

**3 → 0 → 1 → 2 → 4 → 3b → 7 → 5 → 6.** (Phase 7's freestyle mode is also the most sensible thing to ship before showing the app to more outside users — it's the first wall every non-routine person hits.) Phase 3 first: smallest diff, felt every day (and its ergonomics survive the 3b restructure — same components, new container). Phase 0 next: pure CSS, instantly makes the whole app feel like the mockups. Then the two data/dashboard phases that fix "why do I care" (1 before 2). Equipment detail (4) before workout library (3b) — 4 establishes the tap-row→sheet detail-page pattern that 3b then reuses. The fit-and-finish sweep (5) can be interleaved anytime as filler work.

Every phase: dev deploy first, on-device check (375px), then prod — per the deployment rules in CLAUDE.md.
