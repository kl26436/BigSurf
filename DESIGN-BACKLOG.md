# Design & Cleanup Backlog

**Single source of truth.** Every design / cleanup / implementation item from the source docs below is captured here. Once all items are closed, the source docs can be archived (see Phase E).

## Source coverage map

| Source doc | Captured in | Status |
|---|---|---|
| `design-critique-system.md` (Active Workout + system-wide) | Phase A / B / C / D / G | ✅ fully mapped |
| `design-critique-dashboard.md` (Dashboard + Active Workout Part 2) | Phase A / B / C | ✅ fully mapped |
| `design-critique-history.md` | Phase A / B / C | ✅ fully mapped |
| `CODE-AUDIT.md` | Phase D / E, plus shipped items | ✅ fully mapped |
| `PAGES-REDESIGN-IMPLEMENTATION.md` | Phase D (alignment) + Phase F (page builds) | ✅ fully mapped |
| `DASHBOARD-V2-IMPLEMENTATION.md` | Phase H (V2 validation) | ✅ fully mapped; infrastructure mostly shipped |
| `ACTIVE-WORKOUT-V2-IMPLEMENTATION.md` | Phase H (V2 validation) | ✅ fully mapped; infrastructure mostly shipped |

Ordered by severity (🔴 = user-facing breakage, 🟡 = moderate UX drag, 🟢 = polish).

Legend: `[ ]` open · `[x]` done · `[~]` partially done · `[?]` needs verification

---

## ✅ Already shipped (Sprints 0–7 + follow-ups)

- [x] Fixed `originalUnit` bug in `awUpdateSet` — per-exercise kg/lbs now respected
- [x] Deleted `styles/pages/dashboard.css` (1,196 LOC) — extracted live classes first
- [x] Tokenized raw font-sizes / radii / RGBAs in dashboard-v2.css and active-workout-v2.css
- [x] Added tokens: `--success-bg-subtle`, `--state-*`, `--space-36`
- [x] Consolidated duplicate `.stats-section-header` + `.section-header` in modals.css
- [x] Created unified `.field-search` component; migrated 4 callsites
- [x] Collapsed 3 conflicting `.recent-workout-item` declarations into one
- [x] Extracted 25 simple inline color styles → `.text-primary`/`.text-success`/etc. utilities
- [x] Consolidated 3 conflicting `.btn-save` declarations into `components/page-header.css`
- [x] Extracted `.completion-*` classes to new `components/completion-summary.css` (completion modal is now properly styled again)
- [x] Moved `.section-title`/`.section-link` to `page-header.css`
- [x] Moved `.dashboard*` / `.dash-greeting*` to `dashboard-v2.css`
- [x] Bumped service-worker cache version to `v5.1-css-cleanup`
- [x] CODE-AUDIT #1 (`toggleRestTimer` crash) — already fixed; HTML uses correct `toggleHeaderRestTimer`/`skipHeaderRestTimer`
- [x] CODE-AUDIT #4 (hardcoded `#04201a`) — already centralized as `--text-on-accent` token
- [x] Orphaned `.aw-bw-banner` removed; JS renders `.bw-banner` styled in `bodyweight.css`
- [x] **Stats tab deletion** (DASHBOARD-V2 implementation-order step 1): `stats-ui.js`, `styles/pages/stats.css`, `exercise-progress.js` all deleted; `"stats"` case removed from nav routing
- [x] **DASHBOARD-V2 prereq tokens**: `--cat-shoulders` / `--cat-shoulders-bg` / `--cat-arms-bg` added
- [x] **DASHBOARD-V2 prereq functions**: `aggregators.js` + 5 chart primitives exist in `js/core/features/metrics/` + `js/core/features/charts/`
- [x] **ACTIVE-WORKOUT-V2 markup + CSS shipped**: header, pills, rest timer (teal), hero, equipment line, last-session card, jump sheet, equipment change sheet, superset link, add-exercise sheet, finish-summary

---

## 🔴 Phase A — Critical bugs ✅ COMPLETE

**All 6 critical bugs fixed.** Phase A shipped in one session — see [Phase A follow-up item in Phase B] for the optional BW-delta goal-setting feature.

- [x] **Unit-toggle button now shows the *active* unit** at [active-workout-ui.js:354](js/core/workout/active-workout-ui.js#L354). Also bumped font from 0.55rem → `--font-2xs` and added `--primary-bg` fill + primary border to look like an affordance (closes a Phase B WCAG item too).
- [x] **Insight card no longer dismisses on tap-anywhere.** Explicit `.dash-insight__close` button added to [dashboard-ui.js:342](js/core/ui/dashboard-ui.js#L342) with 32px tap target; card-level handler removed.
- [x] **Body-weight delta neutralized** — `.hero-chip__delta.up/.down` now use `--text-muted` in [dashboard-v2.css:96](styles/pages/dashboard-v2.css#L96). Gain/loss color-coding removed so the app doesn't assume a goal direction.
- [x] **Done vs Current pill differentiated** — `.aw-pill.done` is now a check-outline (transparent bg, success border/text); `.aw-pill.current` stays solid primary. Preserves `--highlight-warm` exclusively for superset context.
- [x] **History: "+ Add Missing" demoted** to a `.btn-icon-sm` (`fa-plus` only) at [index.html:262](index.html#L262). Primary CTA is now reserved for browsing intent.
- [x] **History: Calendar day cells tappable again.** Removed the §8e override that stripped `.has-workout` to transparent. Base rule (`--primary-bg-subtle` fill + cursor:pointer + `scale(0.95)` active) now applies. Today still gets primary border.

### Follow-ups (moved to Phase B)

- [x] **BW delta goal-setting** (deferred from Phase A #3). `weightGoal: 'lose' | 'gain' | 'maintain' | null` stored in `preferences/settings`. Off/Lose/Keep/Gain segmented control in the "Goals" section of Settings. New optional onboarding step 3 (5 total steps) with Lose/Maintain/Gain chips + explicit **Skip** button that clears the value — skipping keeps deltas color-neutral. Dashboard `getBwDeltaDirectionClass` applies `.hero-chip__delta--good` / `--bad` only when goal is set and direction matches; `maintain` and `null` stay neutral. Exported `onboardingSkipWeightGoal` via window.

---

## 🟡 Phase B — High-impact usability ✅ COMPLETE (+ BW delta goal-setting follow-up shipped)

### Active Workout ✅

- [x] **Two kebab menus differentiated** — workout-scope uses `fa-ellipsis-v`; exercise-hero now uses `fa-cog` with `aria-label="Edit exercise"` ([active-workout-ui.js:344](js/core/workout/active-workout-ui.js#L344)).
- [x] **Back button** switched from `fa-chevron-left` → `fa-times` with `aria-label="Exit workout"`.
- [x] **Autofill hint gated** to once per workout session — `AppState._autofillHintShown` flag reset in [workout-session.js:1086](js/core/workout/workout-session.js#L1086) on each workout start.
- [x] **BW banner tokenized + `.bw-banner__chev` class** replaces inline chevron style. Base state uses `--cat-shoulders-bg` token.
- [x] **Equipment sheet empty states consistent** — all three sections now render placeholder text when empty (non-search); empties hidden during search. Inline-style offenders removed via new classes: `.aw-equip-section__empty`, `.js-row__icon--equip`, `.js-row__loc-icon`, `.js-row--none`.
- [x] **Add-exercise truncation hint** — "Showing 50 of N — refine your search" footer when results exceed cap.
- [x] **New-equipment chip default is category-aware** — new `guessEquipmentType()` helper maps exercise name/category to likely type (Bench Press → Barbell, Plank → Bodyweight, etc.).
- [x] **Superset completed-exercise affordance** redesigned — `.js-row--done` shows strike-through name + `.js-row__done-pill` ("Done") instead of a green check (which read as "selected").
- [x] **Notes textarea auto-grows** via new `awAutoGrowNotes()` handler; auto-sizes on initial render too.
- [x] **Unit-toggle WCAG fix** — shipped in Phase A (font bumped to `--font-2xs`).
- [x] **Inline `position: relative` on `.aw-body`** moved to CSS; added a pill-color-semantics doc comment at the top of `active-workout-v2.css`.

### Dashboard ✅

- [x] **Avatar shows first-initial** of user's displayName (or email) — no more empty placeholder circle.
- [x] **Stale muscle opacity** eased from `0.55` → `0.85`. `.stale-warn` text + sort order carries the signal.
- [x] **Composition label unified** — always reads "Composition" (was flipping between "Body"/"Composition").
- [x] **`.bp-card__icon` bumped** 26px → 32px with `--font-sm` (was `--font-xs`).
- [x] **Weekday derivation centralized** — new `getDayName(date, format)` helper in [date-helpers.js](js/core/utils/date-helpers.js); dashboard `renderForToday` uses it.

### History ✅

- [x] **Calendar ↔ list linkage** — calendar day tap now also scrolls the matching list row into view and flashes `.is-selected` for 1.5s (`flashListRowForDate`).
- [x] **Month nav sticky** with bg-app background; month context survives scroll.
- [x] **Search + filter inline** — grid `1fr auto` layout; filter select hugs content.
- [x] **Status pill semantics** — incomplete now uses `fa-circle-half-stroke`; cancelled is muted gray (`--bg-card-hi` + `--text-muted`), no longer error-coded red.
- [x] **List row status pill reduced** 28px → 20px; font `--font-xs` → `--font-2xs`.
- [x] **Cancelled-state unified across calendar + list** — both use muted gray; calendar `.cal-icon--cancelled` uses `--text-muted` + `0.6` opacity (was `0.25`).

### Follow-up shipped

- [x] **BW delta goal-setting** — `weightGoal: 'lose' | 'maintain' | 'gain' | null` added to `DEFAULT_SETTINGS`; Settings page has a segmented control to pick it ("Off / Lose / Maintain / Gain"); dashboard `.hero-chip__delta` tints `--good` / `--bad` via `getBwDeltaDirectionClass()` only when a goal is set. Default stays neutral.

---

## 🟢 Phase C — Visual hierarchy / minor polish ✅

### Active Workout ✅

- [x] **Current-set single signal** — `.aw-set-row.current` keeps primary border only; removed the competing `box-shadow: 0 0 0 3px var(--primary-bg)` (three-signal overload) and bumped border-width to 1.5px so it still pops.
- [x] **Elapsed time promoted** — new `.aw-title__elapsed` with `--font-xs` + weight 700 leading the meta row ("22:14 · Exercise 3/7"). Timer tick updates surgically.
- [x] **Unit toggle without full re-render** — `awToggleUnit()` mutates DOM in place (unit button, weight column label, weight inputs — skipping the input that has focus). Added `data-set-idx` / `data-field` attrs to set rows for targeted selection.
- [x] **`.input-error` inline message** — `.field__error` class added to fields.css; new-equipment form appends "Name required" below the input on empty-name submit + focuses the input.
- [x] **Equipment auto-associate toast** — `showNotification` after successful Firestore write: *"Added {equipName} to {locName}"* (silent, 2.5s).
- [x] **Pill row scroll fade** — `mask-image: linear-gradient(...)` on `.aw-pills` fades edges 14px to hint scrollability.
- [x] **Footer "All" lifted** — `.aw-footer__list-btn` bg `--bg-card` → `--bg-card-hi`; text `--text-main` → `--text-strong`.
- [x] **`transition: all` sweep** — shipped in Phase D for `.aw-set-row` (and 6 other hot-path rules).
- [x] **Rest-timer overlay tokens** — added `--rest-timer-overlay` + `--rest-timer-overlay-strong` to tokens.css; 3 raw rgba literals in active-workout-v2.css replaced.
- [x] **"Add set" toned down** — `.aw-add-set` padding 10px → 8px, font-size `--font-sm` → `--font-xs`, font-weight 600 → 500.
- [x] **BW banner chevron class** — shipped in Phase B (`.bw-banner__chev`).
- [x] **Pill color doc comment** — shipped in Phase D at the top of active-workout-v2.css.

### Dashboard ✅

- [x] **Label sizes** — `.bp-cell__label` and `.hero-chip__label` already use `--font-2xs` (shipped in Sprint 2).
- [x] **"Most used" threshold** — changed from `count > 3` → `isMostUsed && count >= 1` so the top template always carries the badge.
- [x] **Insight dismissed by content-hash** — added `hashInsight()` helper (stable DJB2-ish). `dismissInsight()` stores `insightDismissedHash` of the dismissed content; render checks `hash !== dismissedHash` (replaces the day-based check). A new insight tomorrow with different content resurfaces automatically.
- [x] **"For day → All →" plumbing** — `openWorkoutSelectorForDay(dayName)` exported + window-bound; sets `AppState._workoutSelectorDayFilter` before navigating. Selector consumption of the flag (sort by that day's frequency) is a follow-up if the UX wants it.
- [x] **`.bp-card__chev` → `.dash-chev`** renamed across JS + CSS (truthfully describes its role: a shared dashboard-row chevron).
- [x] **`.rw-*` → `.dash-template-*`** renamed — `.rw-row` / `.rw-icon` / `.rw-info` / `.rw-name` / `.rw-meta` / `.rw-count` / `.rw-play` all migrated across dashboard-ui.js, composition-detail-ui.js, and dashboard-v2.css.
- [~] **`.bp-card__icon` at 32px** — critique suggested 44px (parity with `.aw-hero__icon`). Kept at 32px because 6 stacked body-part cards would add ~100px of scroll. Revisit if the dashboard ever collapses to 3–4 cards.
- [~] **`.aw-sets-header__unit` min-height 24px** — critique suggested 32px for a11y. Accepted as-is because this is a label-style segmented toggle inside the header, not a primary tap target. Revisit if an a11y audit flags it.
- [ ] **Header-meta elapsed-time promotion (future polish)** — critique suggested making workout duration the header hero (larger type, "Exercise 3/7" smaller below). Currently same-size as meta. Tracked for a future readability pass; not a bug.

### History ✅

- [x] **Legend conditional display** — hidden entirely when fewer than 4 distinct categories this month (icons are self-explanatory for small sets).
- [x] **`.btn-icon-sm` bumped** 36px → 40px (closer to `--tap` 44px for a11y).
- [x] **`.history-card` family deleted** — no JS/HTML references; ~65 LOC removed from history.css.
- [x] **Category derivation unified** — `formatWorkoutForCalendar` now prefers canonical `workout.category` field, falls back to substring inference only for legacy entries without one.
- [x] **`.calendar-container` radius drift** — resolved in Phase D via the same-file dedup pass.
- [x] **`.calendar-day.today` border drift** — resolved in Phase A's calendar-tappability fix.
- [x] **Row icon vs status pill competition** — reduced status pill 28px → 20px in Phase B; further "pick one" consolidation left as an explicit design decision (both are useful; not a bug).
- [x] **Load More inline style** — shipped in Phase B (`.btn-block` utility + `.recent-workouts-load-more` class).
- [~] **`.workout-picker-item` vs `.recent-workout-item`** — deliberate distinction documented: `.recent-workout-item` is the borderless list row under the calendar; `.workout-picker-item` is the bordered row inside the day-picker modal when a single date has multiple workouts. Different contexts, both needed.
- [~] **`.cal-icon` font-size 9px** — intentional exception to token scale. Kept dense so the 7-column grid stays compact. One of the ~10 raw font-sizes tracked by the design audit. Revisit if users report workout markers are hard to read on the calendar.
- [~] **`.btn-icon-sm` at 40px** — below the `--tap: 44px` spec. Accepted as good-enough during Phase B; revisit if an a11y audit flags it. If bumped to 44px, the history-header row height will need a corresponding tweak.

---

## 🧹 Phase D — Cleanup ✅ (most items shipped; long-tail deferred)

### Shipped

- [x] **PAGES-REDESIGN alignment** — all 3 conflict resolutions:
  - forms.css disposition: existing file retained; spec doc updated with status note (§0 points to the actual component files).
  - `.btn-save` → `.page-header__save` BEM rename + solid-pill visual per spec. Atomic migration across all 6 callsites (index.html, equipment-library-ui, workout-management-ui, location-ui). `.btn-back` / `.back-btn` → `.page-header__back` (circular). `.header-left` → `.page-header__left`. `.page-title` → `.page-header__title` where nested in page-header.
  - `.field-label` adopts uppercase + `0.06em` letter-spacing per spec; added `.field-label__hint` and `.field-helper` helpers.
- [x] **workout.css audit** — `.section-header-row` family migrated to [page-header.css](styles/components/page-header.css). File marked DEPRECATED with a header comment listing remaining classes to migrate (exercise-card, exercise-list, exercise-overflow-item, modal-rest-*, cardio-*, notes-area, compact-hero). File is not imported in `index.css`; remaining classes currently render unstyled. Full deletion deferred to a future sprint.
- [x] **"New equipment" form inline styles** — 7 inline `style=` attrs replaced with `.field-label` + new `.aw-new-equip__base-row` / `__base-input` / `__base-unit` / `__location-hint` classes in [active-workout-v2.css](styles/pages/active-workout-v2.css).
- [x] **`transition: all` sweep** — 7 occurrences in active-workout-v2.css replaced with explicit property lists (hot-path only; workout.css occurrences left alone since the file is deprecated).
- [x] **Same-file duplicate classes consolidated** — `.month-navigation` (3→1 in history.css), `.recent-workout-name` (2→1), `.quick-add-chip` (2→1 in exercise-lib), `.exercise-card-meta` (2→1), `.skeleton` (removed dupes from nav.css + utilities.css, kept canonical in empty-states.css).
- [x] **Detail-page CSS gaps** — cross-referenced `dashboard-final-v2.html` against live files. Added preemptive `.sec-head` pattern to [page-header.css](styles/components/page-header.css) so Phase F pages can use it. Other "gaps" are naming-only (mockup uses `.greeting`, live uses `.dash-greeting` — same thing).
- [x] **Inline-style sweep pass** — `workout-history.js` detail modal: extracted the ~70-line inline-styled exercise card/table/notes/placeholder into a new `.wh-detail-*` family in [history.css](styles/pages/history.css). `style="` occurrences in workout-history.js: 59 (start) → 34 (Sprint 6) → **16** (now).
- [x] **Bug fix: SyntaxError on `awAutoGrowNotes` import** — Phase B added the export but missed re-exporting from [workout-core.js](js/core/workout/workout-core.js) (the main.js import shim). Fixed.

### Deferred / cross-file follow-ups

- [x] **Cross-file duplicate classes (tractable ones)** — `.exercise-unit-toggle` consolidated into modals.css (deleted from nav.css). `.quick-add-chip` templates.css declaration deleted (cascade-loser; exercise-lib.css is canonical). Remaining `.modal-rest-display` / `.exercise-card-meta` duplicates live in deprecated workout.css only — self-resolve when workout.css ships.
- [x] **workout.css deleted** — all 94 top-level classes gone. Of the ~65 live-referenced ones, the ones with canonical homes (`.section-header-row` → page-header.css, `.modal-rest-*` / `.unit-*` / `.exercise-unit-toggle` → modals.css, `.exercise-card` family → exercise-lib.css, `.btn-reorder` → templates.css, `.exercise-table` → bodyweight.css) keep working. The ~50 workout-only classes (`.exercise-card-status`, `.inline-progress*`, `.cardio-*`, `.btn-set-control*`, `.reorder-*`, `.notes-area`, etc.) were **already rendering unstyled** since the file wasn't imported — deleting the file is net-neutral visually and removes 1,100 LOC of confusion. Audit impact: duplicate class defs 27 → 12, raw rgba 20 → 9, raw radius px 6 → 4. Service-worker cache manifest updated.
- [x] **Chip/pill audit (findings documented)** — 15 variants counted. Dead classes removed: `.location-chip` (modals.css), `.recent-template-chip` family (templates.css). Undefined-but-referenced fixed: `.pill-btn` added to body-measurements.css (was unstyled in bodyweight chart time-range buttons). Remaining chips stay as-is: each has context-specific sizing/behavior (`aw-pill` is the wizard progress pill; `hero-chip` is a metric chip on the dashboard; `active-pill` is a workout-in-progress floating pill — all distinct). Consolidation into `chips.css` modifiers would require UX-level unification decisions and is **not recommended** as a mechanical refactor.
- [x] **Button variant audit (findings documented)** — 28 variants counted. Dead classes removed: `.btn-text-danger`, `.btn-save`/`.btn-back` (Phase D rename), plus earlier Sprint 7 deletions. Live but rarely-used (≤2 JS callsites): `.btn-start-small`, `.btn-reorder`, `.btn-dismiss`, `.btn-clear`, `.btn-add-equipment`, `.btn-delete-exercise`. These are context-specific — recommend evaluating each callsite's need for the custom styling before merging into the canonical 8 (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon`, `.btn-sm`/`.btn-small`, `.btn-danger`, `.btn-success`, `.btn-text`). No mechanical consolidation without product review.
- [x] **Inline-style sweep long-tail progress** — `workout-management-ui.js`: 35 → **0** (extracted template editor body, day-chip row, exercise-row + overflow menu, estimate stats, create-ex empty state into [templates.css](styles/pages/templates.css)). `location-ui.js`: 28 → **0** (extracted location-detail map card, match-radius chips, manual-coords fallback, address-search error, danger-action-row, current-location chip into new [pages/locations.css](styles/pages/locations.css), imported in index.css). Remaining offenders: `composition-detail-ui.js` (~29), `equipment-library-ui.js` (~27), `metric-detail-ui.js` (~24), `ai-coach-ui.js`, `exercise-ui.js`, `app-initialization.js`, `data-manager.js`. Each file should follow the workout-history / workout-management / location-ui pattern: create a dedicated CSS block with `.file-prefix__element` BEM names and replace inline styles wholesale.

---

## 🎨 Phase F — PAGES-REDESIGN page-by-page builds ✅ (S/M items shipped; L items' structural rewrites deferred)

**Prerequisite (shipped):** Phase D alignment — `.btn-save` → `.page-header__save`, `.field-label` uppercase per spec, forms.css disposition noted, §0 shared patterns confirmed across existing component files.

**Already shipped from PAGES-REDESIGN-IMPLEMENTATION.md:** §1 Create Exercise (in `workout-management-ui.js` under repo-native names), §4 Settings (with debounced auto-save), §6 Onboarding (4 steps with `.onb-chip` family).

- [x] **§9a Equipment Edit polish** (S) — [equipment-library-ui.js](js/core/ui/equipment-library-ui.js#L371) rewrite: notes textarea swapped `form-input` → `field-input`; location chips now use `.chip.active` + `.chip-remove` (not hand-rolled HTML); type chips wrapped in `.chips`; `field-label__hint` used for the inline "(empty machine / bar)" helper text; delete button moved into `.danger-action-row` + `.danger-action-btn`. New CSS classes added to modals.css: `.equip-detail-title`, `.equip-detail-body`, `.equip-locations-chips`, `.equip-locations-empty`, `.eq-location-chip`, `.equip-notes`.
- [x] **§5 Profile detail page** (M) — new `#profile-section` added to [index.html](index.html), registered in [navigation.js](js/core/ui/navigation.js). Settings profile-card now opens profile detail via `openProfile()`. New `renderProfileDetail()` in [settings-ui.js](js/core/ui/settings-ui.js) with profile-hero block (avatar with first-initial fallback + name + email) + two `.group` rows (Display / Body data) covering Name / Height / Birthday / Experience. `prompt()`-based editors with validation (birthday YYYY-MM-DD, experience enum). Settings schema extended: `profileName`, `profileHeightCm`, `profileBirthday`, `profileExperience`. CSS in [settings.css](styles/pages/settings.css). Window-bindings: `openProfile`, `editProfileName`, `editProfileHeight`, `editProfileBirthday`, `editProfileExperience`, `closeProfile`. Also added `.header-spacer` utility for section-header-row layouts.
- [x] **§2 Body Measurements entry rewrite** (M) — **full-page conversion complete**. Modal replaced with new `#body-measurements-entry-section` (registered in navigation.js + index.html). `showWeightEntryModal()` now navigates to the section and renders spec-compliant UI: `.page-header` with back + save, `.bm-weight-card` (tinted gradient hero with big number + unit + last-value + segmented lb/kg), `.bm-row` per-metric rows (Body fat, Muscle mass, Chest, Waist, Arm avg), `.group` of import sources (Withings, DEXA), `.page-footer` sticky primary CTA. All spec classes added to [body-measurements.css](styles/pages/body-measurements.css). Save logic extended to persist `muscleMass`, circumference `measurements` object, user-picked `date`.
- [x] **§3 Manual Workout restyle** (M) — **spec-compliant page header shipped**. Step 2 header rebuilt with `.page-header` + `.page-header__eyebrow` ("Past Workout") + `.page-header__title` + `.page-header__save`. Below: new `.manual-meta-chips` row with editable date and duration chips. `.page-header__eyebrow` added to components/page-header.css. `editManualDate()` + `editManualDuration()` helpers window-bound. Per-exercise cards use new `.manual-exercise-card` / `.manual-ex-*` / `.manual-sets-table__*` family from [pages/manual-workout.css](styles/pages/manual-workout.css). Spec's "import renderExerciseCard from active-workout" is infeasible (Active Workout V2's `renderExerciseView` is private and state-bound); manual workout retains bespoke rendering matching the visual DNA. `isManual: true` persistence untouched.
- [x] **§9b Location Edit build** (M) — Location detail page uses `.page-header` (section-header-row), `.loc-map-card__*`, `.loc-radius-chips`, `.link-row`, `.danger-action-row` + `.danger-action-btn`.
- [x] **§7 DEXA upload + detail** (L) — **spec-compliant classes shipped**. Upload view uses `.dexa-drop` / `.dexa-drop__icon/__title/__desc/__btn` (replaces legacy `.drop-zone` / `.drop-icon` etc.) and `.dexa-supports` / `.dexa-supports__pill` (replaces `.dexa-file-pills` / `.file-pill`) in [pages/dexa.css](styles/pages/dexa.css). Detail view's 2×2 grid renamed `.stat-card-grid` → `.dexa-stat-grid` per spec. `.stat-card` family + `.dexa-insight-card` already existed. Legacy class rules deleted from dexa.css. No structural modal→page change was needed — upload is already a full-page section.
- [x] **§8 AI Coach chat rewrite** (L) — **BEM migration complete**. [ai-coach-ui.js](js/core/features/ai-coach-ui.js) rewrites: `.coach-hero-icon` → `.coach-hero__icon`, `.coach-hero-title` → `.coach-hero__title`, `.coach-hero-sub` → `.coach-hero__desc`, `.prompt-card` → `.coach-prompt-card`, `.prompt-icon` → `.coach-prompt-card__icon` (with `--warning`/`--warm`/`--core` modifiers), `.prompt-txt` → `.coach-prompt-card__text`, `.chat-wrap` → `.coach-chat`, `.chat-msg.user/.bot` → `.coach-msg--user/--bot`, `.chat-input` → `.coach-input-bar`, `.chat-send` → `.coach-input-bar__send`. Matching CSS rewrite in [pages/ai-coach.css](styles/pages/ai-coach.css) — all legacy selectors removed. Firestore session persistence untouched.
- [x] **§10 Final validation pass** — metrics at session close:
  - **Inline styles in JS**: 333 → **160** (52% reduction). Top remaining: composition-detail-ui (29), metric-detail-ui (24), settings-ui (19), workout-history (16).
  - **Raw `font-size: Xrem/px` in pages/**: **0** ✅
  - **Raw `border-radius: Xpx` in pages/**: **0** ✅
  - **Tests**: 354/354 pass.
  - Sticky headers use `var(--z-header)` + `safe-area-inset-top` ✓
  - `.page-header__save` disabled state uses `--bg-card-hi` + `--text-muted` (not opacity) ✓
  - Destructive actions use `.danger-action-*` pattern with confirmation ✓

- [x] **§14 Raw-literal elimination (Apr 2026)** — cleared the remaining literal color / radius values in pages/:
  - Raw rgba in pages: **8 → 1** (the one remaining is inside a `var(..., fallback)` — intentional token fallback).
  - Raw hex in pages: **7 → 0**. `#fff` callers now use new `--text-on-color` token; `#1a2838` / `#0d1218` (map placeholder) moved to `--map-placeholder-start/end`.
  - Raw border-radius px in pages: **4 → 0**. Added `--radius-2xs` (2px) and `--radius-xl` (24px) to the scale; migrated `.onb-dot`, `.onb-icon-hero`, `.d-header-icon`, `.coach-msg`.
  - Final 5 leaf inline styles also swept: `.text-badge-gold` + `.icon-leading` utilities; `.modal-actions--end` modifier; `.metric-card__label i` reads `--icon-color`.
  - Audit budgets floor-set to current baseline: `rawRadiusPxInPages 0`, `rawHexInPages 0`, `rawRgbaInPages 2`, `inlineStylesInJs 15`. Strict audit treats any new raw radius / hex as a regression.
  - **Tests**: 354/354 pass.

- [x] **§13 Long-tail follow-up wave 3 (Apr 2026)** — inline-style sweep continued deep into leaf files:
  - `data-manager.js`: 11 → **0**. Added `.exercise-history-content__*` family (match/pr/pr-icon/pr-label/last/sets/set-chip/notes) + `.exercise-history-placeholder` / `--error` in [components/modals.css](styles/components/modals.css).
  - `workout-session.js`: 4 → **0**. New `.completion-prs__trophy`, `.completion-header__icon`, `.completion-hero__chart`, `.completion-template-saved` in [components/completion-summary.css](styles/components/completion-summary.css).
  - `exercise-manager-ui.js`: 6 → **0**. `.reassign-source-btn`, `.reassign-preview__title`, `.reassign-preview__arrow`, `.reassign-impact__hint`, `.reassign-loading`. Progress bar now uses `--progress` CSS var (also updated `commitReassignment` callback to use `setProperty('--progress', ...)`).
  - `exercise-ui.js`: 4 → **1** (only `--bar-height` CSS var for dynamic bar chart). New `.inline-progress*` block in [components/charts.css](styles/components/charts.css) covering title/chart/bar-col/label/bar/date/summary + `--up/--down/--flat` trend modifiers. Plus `.pr-trophy-inline` and `.last-workout-date` utilities in [utilities.css](styles/utilities.css).
  - `active-workout-ui.js`: 6 → **2** (CSS vars for `--rest-pct` and `--title-color`). Rest-timer fill reads `--rest-pct`; used existing `.js-row__icon--equip`; added `.js-row__meta-pin`, `.aw-sheet__empty` / `--large`.
  - `equipment-library-ui.js`: already at 0 (prior wave).
  - `plate-calculator.js`: 3 → **1** (CSS vars `--plate-h`/`--plate-color` for per-plate sizing). Moved `width:50px` + `width:70px` into CSS. Replaced literal `rgba(29, 211, 176, 0.1)` with `var(--primary-bg)`.
  - `main.js`: 2 → **0** — Withings status icons use `.text-success` / `.text-primary` utilities.
  - `template-selection.js`: 2 → **2** (CSS vars for per-category `--pill-color` and `--dot-color`).
  - `dexa-scan-ui.js`: 2 → **2** (CSS vars — regional bars and VAT status color). Added `.vat-status--good/warn/bad` modifier classes (still used for typography; `<path>` stroke remains dynamic inline).
  - Audit budgets ratcheted: `inlineStylesInJs 55→20`, `rawRgbaInPages 12→10`.
  - **Tests**: 354/354 pass.

- [x] **§12 Long-tail follow-up wave 2 (Apr 2026)** — inline-style sweep continued:
  - `workout-history.js`: 16 → **1** (only CSS custom property `--progress` on progress bar fill). New `.wh-detail-manual-notes`, `.wh-detail-actions`, `.wh-detail-meta`, `.wh-detail-meta__grid`, `.wh-detail-status--{completed,cancelled,partial}`, `.wh-detail-duration`, `.wh-detail-progress-bar`, `.wh-detail-exercises`, `.wh-detail-limited` in [history.css](styles/pages/history.css).
  - `dashboard-ui.js`: 13 → **1** (per-segment dot color). New `.hero-chip__icon--warm/--primary/--shoulders`, `.dash-skel--hero/--strip/--row`, `.dash-section-head__meta`, `.dash-section-head--tight`, `.bp-cell__icon--gold`, `.bc-card--composition`, `.bw-card-head__icon--primary` in [dashboard-v2.css](styles/pages/dashboard-v2.css).
  - `equipment-library-ui.js`: 14 → **0**. Replaced `style="display:none"` with `.hidden` + classList toggle. Added `.equip-exercise-chevron--open`, `.equip-add` + `.equip-add__header/__title/__group/__optional/__type-row/__preview/__preview-label/__preview-val/__submit` in [components/modals.css](styles/components/modals.css).
  - Audit budgets ratcheted: `inlineStylesInJs 95→55`, `rawRadiusPxInPages 5→4`.
  - **Tests**: 354/354 pass.

- [x] **§11 Long-tail follow-up (Apr 2026)** — inline-style sweep + font-size tokenization wave:
  - `composition-detail-ui.js`: 29 → **2** (only CSS custom properties for per-item colors / widths). New `.comp-*` CSS block in [detail-pages.css](styles/pages/detail-pages.css) covering donut row, stats grid, visceral-fat color states, body-weight empty state, DEXA empty state, action list, `.dash-template-icon--*` tints.
  - `metric-detail-ui.js`: 24 → **1** (per-segment dot color via `--dot-color`). New `.md-*` CSS block in detail-pages.css: `.md-body`, `.md-placeholder`, `.md-skel-tall`, `.md-error`, `.md-hero-meta`, `.md-chart-placeholder`, `.md-empty`, `.md-empty-line`, `.md-goal-strong`, `.md-bc-row`, `.md-bc-legend`. `.dash-bc-dot` now reads `var(--dot-color, var(--text-muted))`.
  - `settings-ui.js`: 19 → **0**. New `.srow-connect`, `.srow-name--danger`, `.settings-footer`, `.onb-welcome-body`, `.onb-welcome-logo`, `.onb-btn-full`, `.onb-btn-wide`, `.onb-unit-group`, `.onb-segmented` in [settings.css](styles/pages/settings.css).
  - **Raw `font-size: Xrem/px` in pages/**: 48 → **10** (hero display values + tiny pixel-perfect calendar glyphs only). Tokenized detail-pages.css, body-measurements.css, settings.css, active-workout-v2.css to `--font-2xs/xs/sm/base/md/2xl/3xl`.
  - Audit budgets ratcheted: `inlineStylesInJs 170→95`, `rawFontSizeInPages 55→12`, `duplicateClassDefs 15→5`.
  - **Tests**: 354/354 pass.

---

## 📐 Phase G — Meta / system documentation

**Sustaining work that prevents regression. Low code-risk, high long-term value.**

- [x] **Pinned the 10 design-system rules to [CLAUDE.md](CLAUDE.md)** under a new "Design System Rules" section (replaces the 3 terse bullets that were in Code Style Guidelines). Organized into Pattern rules (1-4), Token rules (5-8), Structural rules (9-10) with links to the canonical component files.
- [x] **BEM-ish naming convention adopted** (Rule 9). Decision documented in CLAUDE.md:
  - Block: kebab-case with optional short prefix (`aw-pill`, `bp-card`, `dash-insight`); visual primitives unscoped (`.chip`, `.row-card`)
  - Element: `block__element` (two underscores)
  - Modifier: `block--modifier` (two hyphens)
  - Legacy hyphen-only classes acceptable where they exist — rename when doing neighboring work
  - Utility classes (`.text-primary`, `.btn-block`, `.hidden`) are exempt — BEM applies to components, not utilities
- [x] **[styles/components/README.md](styles/components/README.md) written** — "When you need X, use Y" quick-reference table covering row/hero cards, section headers, chips, field-search, field+stepper, primary/secondary/icon buttons, segmented/toggle, grouped rows (stacked variant included), empty states, completion summary, active pill, BW banner. Plus a "don't reinvent" list of consolidated class names, BEM naming rules, token scale reference, and audit usage.
- [x] **Design-system audit script shipped** at [scripts/design-audit.js](scripts/design-audit.js). Counts 6 metrics (inline styles, raw font-size, raw border-radius px, raw rgba, raw hex, cross-file duplicate class defs). Budgets calibrated to the current baseline so CI catches *regressions*, not the pre-existing debt. Three npm scripts:
  - `npm run audit:design` — print metrics table
  - `npm run audit:design -- --list` — list offending file:line locations
  - `npm run audit:design:strict` — exit 1 if any budget exceeded (CI mode)
  Baseline recorded in the README. Ratchet the budget in `scripts/design-audit.js` whenever you beat a number.

---

## ✅ Phase H — V2 validation checklists ✅ (code-verified)

Code-audit completed against both V2 implementation specs. Items marked `[x]` are verified by inspection; items marked `[🧪]` need a manual device walkthrough (e.g., auto-scroll-into-view, haptics, animation feel).

### Dashboard V2 validation (from `DASHBOARD-V2-IMPLEMENTATION.md`)

**Prereq functions** — all in `js/core/features/metrics/aggregators.js` and `js/core/features/charts/chart-combo-bars-line.js`:
- [x] `aggregateSessionsPerDayOfWeek()` exported (line 366)
- [x] `getTemplatesForDayOfWeek()` exported (line 382)
- [x] `getLastTrainedDate()` returns `{date, daysAgo}` (line 392)
- [x] `aggregateBodyPartStats()` bundles hero-lift heaviest, volume/delta, session count, staleness (line 460)
- [x] `aggregateExerciseStats()` returns max, 1RM, trend, top 4 sets (line 569)
- [x] `chartComboBarsLine()` exists (charts/chart-combo-bars-line.js:14)
- [🧪] Gold PR dots appear on line overlay where `p.pr === true` — verify visually on Chest/Legs detail
- [x] `--cat-shoulders` / `--cat-arms` + `-bg` variants in [tokens.css](styles/tokens.css) (109, 110, 155, 156)

**Dashboard render**:
- [x] Section order confirmed at [dashboard-ui.js:142-149](js/core/ui/dashboard-ui.js#L142): Greeting → Active pill → Hero chips → Insight → For today → Training → Composition → Recent PRs
- [x] `renderHeroChipRow(streak, weekDone, weekGoal, bwData)` covers Streak / Week / Body weight delta
- [x] `renderForToday()` uses `getDayName()` + `getTemplatesForDayOfWeek()` — correct day-of-week ordering
- [x] "Most used" chip: `isMostUsed && count > 3` (dashboard-ui.js:403) — matches spec; Phase C tracks a polish item to consider lower threshold
- [x] `BODY_PARTS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core']` (dashboard-ui.js:30) — 6 cards in spec order
- [x] Stale sort: `stats.sort(a.isStale ? 1 : -1)` pushes stale to bottom (dashboard-ui.js:421-423). Opacity is 0.85 per Phase B polish
- [🧪] Sparkline hides when stale, warning shows — verify on a stale muscle group
- [x] `renderCompositionCard()` falls back to `renderConnectPrompt()` when `!hasDexa && !hasBw`
- [x] Recent PRs shows `.slice(0, 3)` top 3

**Drill-down navigation**:
- [x] Body-part card `onclick="showMuscleGroupDetail('${s.bodyPart}')"` wired (dashboard-ui.js:441)
- [x] `showMuscleGroupDetail()` exported from navigation.js:488; section registered at 15
- [x] Hero-lift heaviest set as primary stat in [muscle-group-detail-ui.js:39](js/core/ui/muscle-group-detail-ui.js#L39)
- [x] Exercise detail section registered (`exercise-detail-section` in navigation.js SECTIONS + routeToView)
- [x] `navigateBack()` with 5-entry navStack handles back button at every level

**Consolidation audit**:
- [x] `stats-ui.js`, `styles/pages/stats.css`, `exercise-progress.js` all deleted (confirmed via ls; no files found)
- [x] No `case 'stats'` in navigation routing
- [x] No `renderHeroWorkoutCard` / `.hero-workout-card` / `.btn-hero-start` anywhere in src
- [x] Body-weight dashboard widget rolled into Composition card (one `renderCompositionCard()`)

### Active Workout V2 validation (from `ACTIVE-WORKOUT-V2-IMPLEMENTATION.md`)

**Visual**:
- [x] Header 48px min-height ([active-workout-v2.css:22](styles/pages/active-workout-v2.css#L22))
- [x] Progress pills scroll horizontal; `.aw-pill.current` = solid `--primary`; `.aw-pill.done` = transparent outline (Phase A disambiguation); `.aw-pill.superset` = warm border
- [x] Rest timer teal gradient (`linear-gradient(135deg, --primary-dark, --primary)` at line 110); `+30s` / `Skip` buttons present
- [x] Equipment is inline `.aw-equip-line` (not a card) — see `renderEquipLine()`
- [🧪] Last session card compact single line ("135×10 · 185×8 · ...") — verify formatting with real data
- [x] Autofill hint "Pre-filled from last session · tap ✓ to confirm or edit values" (Phase B: gated to once per session via `AppState._autofillHintShown`)
- [x] Autofill inputs use `.aw-set-row__input.autofill` with `border-style: dashed` + muted color; bright on focus
- [x] Set row check: `.aw-set-row__check` is 38×38 circle; 50% border-radius (line 413-415)
- [x] `.aw-set-row.current` has primary border + `box-shadow: 0 0 0 3px var(--primary-bg)` — Phase C polish item filed to simplify 3 competing signals

**Behavior**:
- [x] `awJumpTo(idx)` exported (active-workout-ui.js:633)
- [x] Jump sheet with per-exercise rows — `renderJumpSheetContent()`
- [x] Superset select-mode — `awToggleSupersetSelect()` + `renderSupersetSheet()`; Link N button enabled when `selectedForSuperset.size > 0`
- [x] Superset banner renders via `.aw-superset-banner` for linked exercises
- [x] `awQuickAddEquipment()` opens equipment sheet with type-aware default (Phase B: `guessEquipmentType()`)
- [🧪] Rest timer auto-starts on set ✓ and auto-dismisses at 0:00 — verify haptic + flash
- [x] Finish button swaps label on last-exercise-complete (see `.aw-footer__next.finish`)
- [x] Finish flow → `renderCompletionSummary()` with stats + PRs via completion-summary.css

**Data integrity**:
- [x] Set writes `originalUnit` with per-exercise fallback (`AppState.exerciseUnits?.[idx] || globalUnit`) at lines 695 + 769 — matches Sprint 0 bug fix
- [x] BW sets write `isBodyweight`, `bodyWeight`, `bodyWeightUnit`, `addedWeight` (lines 702-704)
- [x] Autofill uses `getLastSessionDefaults()` with session cache (`clearLastSessionCache()` on workout start/complete)
- [x] `supersetId` persisted via `saveWorkoutData()` into Firestore exercise document
- [x] Equipment change mutates `savedEx.equipment` for current exercise only (not template-wide)

### Manual test pass (🧪 items)
Walk on 375px viewport after next dev deploy:
1. Open a Chest drill-down → confirm gold PR dots on line overlay
2. Open a muscle group that's >5 days stale → confirm sparkline hides, stale-warn shows
3. Log a set in active workout → confirm rest timer auto-starts with haptic + slide-in
4. Last-session card on an exercise with history → confirm `135×10 · 185×8 · ...` compact line renders

---

## 📦 Phase E — Housekeeping (safe anytime)

### Delete obsolete mockups [CODE-AUDIT.md #9]
- [x] `mockups/dashboard-final.html` — already gone
- [x] `mockups/dashboard-options.html` — already gone
- [x] `mockups/dashboard-health-style.html` — already gone
- [x] `mockups/dashboard-active-workout.html` — already gone
- [x] `mockups/active-workout-locked.html` — already gone
- [x] `mockups/stats-redesign.html` — already gone

**Kept (active reference)**: `active-workout-v2.html`, `dashboard-final-v2.html`, `forms-redesign.html`, `settings-onboarding-redesign.html`, `features-redesign.html`, `create-workout-redesign.html`, `workout-page-flow.html`, `exercise-equipment-library-redesign.html`, `history-redesign.html`, `workout-selector-redesign.html`

### Delete obsolete implementation MDs [CODE-AUDIT.md #8]
- [ ] `UX-IMPLEMENTATION-GUIDE.md` (superseded by Master)
- [ ] `DASHBOARD-IMPLEMENTATION.md` (Phase 1 shipped)
- [ ] `EQUIPMENT-WEIGHT-IMPLEMENTATION.md` (shipped)
- [ ] Review and likely delete: `PLAN.md`, `workout-app-backlog.md`, `ENHANCEMENTS.md`
- [ ] Review: `UX-VISUAL-POLISH-GUIDE.md`, `UX-WORLD-CLASS-GUIDE.md`

### Archive source docs (this file is the single source of truth)
All items from the docs below are now captured in this backlog. Archive once confident nothing is missed:
- [ ] `design-critique-system.md` → archive (all items in Phase A/B/C/D/G)
- [x] `design-critique-dashboard.md` → archived to `docs/archive/` (audit 2026-04-19: 33/35 shipped, 2 intentional trade-offs + 1 future polish item captured in Phase C Dashboard)
- [x] `design-critique-history.md` → archived to `docs/archive/` (audit 2026-04-19: 17/19 shipped, 2 intentional exceptions captured in Phase C History section)
- [ ] `CODE-AUDIT.md` → archive (all open items in Phase D/E; closed items in shipped list)
- [ ] `DASHBOARD-V2-IMPLEMENTATION.md` → keep until Phase H Dashboard checklist is signed off; then archive
- [ ] `ACTIVE-WORKOUT-V2-IMPLEMENTATION.md` → keep until Phase H Active Workout checklist is signed off; then archive
- [ ] `PAGES-REDESIGN-IMPLEMENTATION.md` → keep until Phase F is complete; then archive
- [ ] Move archived docs to `docs/archive/` instead of deleting — preserves history

---

## Suggested execution order

1. **Phase A** (critical bugs) — single session, ~2-3 hours. Ships real user-facing fixes.
2. **Phase G items 1-2 (rules + naming decision)** — gates all later CSS work. 30 minutes of doc-writing.
3. **Phase D (workout.css audit + inline style follow-ups + PAGES-REDESIGN alignment)** — repeats the dashboard.css cleanup playbook; resolves the `.btn-save` / `.field-label` / forms.css conflicts before Phase F.
4. **Phase B Active Workout** — biggest UX payoff area (users spend most time here).
5. **Phase B History** — calendar ↔ list linkage + header rebalance.
6. **Phase B Dashboard** — avatar, stale signal, labels.
7. **Phase F (page redesigns)** — order: §5 Profile → §2 Body Measurements → §3 Manual Workout → §7 DEXA → §8 AI Coach → §9 Equipment/Location → §10 validation. Each item is mostly independent; do on a `pages-redesign` feature branch and merge per-page.
8. **Phase H** — V2 validation checklists. Can run in parallel with Phase F work — these are "does it work end-to-end" tests on already-shipped code.
9. **Phase C** — polish sweeps, grouped by file.
10. **Phase G items 3-4 (README + audit script)** — best done after the big sweeps so the docs reflect the stabilized state.
11. **Phase E** — housekeeping; easy to slip in between larger items. Archive source docs once their phases close.
