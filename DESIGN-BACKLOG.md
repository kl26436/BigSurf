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

- [ ] **BW delta goal-setting** (deferred from Phase A #3). Add `weightGoal: 'lose' | 'gain' | 'maintain'` to `preferences/settings`, wire into onboarding as an optional question, and re-enable colored `.up` / `.down` deltas based on goal. Default stays neutral.

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

## 🟢 Phase C — Visual hierarchy / minor polish

### Active Workout

- [ ] **Three signals for the "current" set** (primary border + primary box-shadow + dashed autofill input borders). Over-specified. Keep border, drop shadow (or vice versa).
- [ ] **Header meta ("Exercise 3 of 7 · 22:14") is tiny** — the elapsed time is the session heartbeat; promote it. Show duration large, "Exercise 3/7" smaller below.
- [ ] **Unit toggle re-renders whole UI, losing focus.** Mid-typing = lost position. Fix: toggle by mutating CSS class + unit label only.
- [ ] **`.input-error` flashes for 600ms with no inline message.** Add `<div class="field__error">Name required</div>` alongside the pulse.
- [ ] **Equipment auto-associate silently writes to Firestore** on first pick. One-time toast: *"Added Hammer Strength to Downtown Gym."*
- [ ] **Pill row scrolls horizontally without preview indicator.** Add left/right gradient fade on `.aw-pills`.
- [ ] **Footer "All" button is muted**, next to bright Next. Use `bg-card-hi` for a slight lift.
- [ ] **`transition: all var(--anim-fast)`** on `.aw-set-row` — expensive on mobile. Specify properties explicitly (`background`, `border-color`).
- [ ] **Rest-timer overlay RGBAs** `rgba(4,32,26,0.18/0.2/0.25)` are dark magic literals. Add a `--rest-timer-overlay` token (or `color-mix`).
- [ ] **"Add set" dashed button matches the column-label weight** — slight over-emphasis for a secondary action. Reduce its typographic weight or padding.
- [ ] **BW banner chevron uses inline `style="color:..."`** — violates no-inline-styles rule. Replace with `.bw-banner__chev` class.
- [ ] **Document pill color semantics** in a comment at the top of `active-workout-v2.css`: `--primary` green = current set/exercise; `--success` green = done; `--highlight-warm` orange = superset context. Prevents future dilution of the warm signal.

### Dashboard

- [ ] **`bp-cell__label` and `hero-chip__label` at 0.56-0.58rem (~9px)** — below practical readability threshold. Bump to `var(--font-2xs)` (0.65rem).
- [ ] **"Most used" badge threshold is `count > 3`.** User with 2 Tuesdays loses the badge. Show when `isMostUsed && count >= 1`, or use subtle gold dot.
- [ ] **Insight dismissed by day, not by content-hash.** A new insight tomorrow may still be suppressed. Track `insightDismissedKey` as a hash of content.
- [ ] **"For Tuesday → All →" loses the day filter.** Pass `?day=tuesday` so destination opens filtered.
- [ ] **`.bp-card__chev` is reused in `.bw-card-head` and `.bc-card`** — naming says "belongs to bp-card". Rename to `.dash-chev` or `.row-chev`.
- [ ] **`rw-` prefix is opaque.** Rename `.rw-row` → `.dash-template-row`, or migrate to the canonical `.row-card`.

### History

- [ ] **Legend up to 7 chips + "Today" wraps on narrow screens.** Hide behind "What do these mean?" link, or show only when ≥4 distinct categories.
- [ ] **`.btn-icon-sm` is 36px** but app uses `--tap` (44px). Bump to 40px or `--tap` for consistency (also a11y).
- [ ] **`history-card` (history.css lines 86-149) appears unused.** Verify and delete.
- [ ] **Row `.workout-picker-item` (bordered) and `.recent-workout-item` (borderless)** describe similar data. Collapse into `.row-card` per CLAUDE.md, or document the deliberate distinction.
- [ ] **Category derivation drift** — `renderRecentWorkoutsList` infers category from `workoutType` substring; calendar uses `workout.category`. Unify to the canonical `workout.category` field.
- [ ] **`.calendar-container` radius drift** — §22 uses `--radius-lg`, §8e uses `--radius-md`. Pick one.
- [ ] **`.calendar-day.today` border drift** — §22 adds `1px solid var(--primary)` + `--primary-bg`; §8e drops the border. Restore the border — it helps distinguish "today" from "has-workout" tints.
- [ ] **Row icons and status pill compete on opposite sides** — `.workout-picker-icon` (~40px) on the left and the status pill on the right are both bright. Pick one as the primary indicator.
- [ ] **`Load More` button inline `style="width:100%;margin-top:0.75rem;"`** at [workout-history.js:573](js/core/workout/workout-history.js#L573). Add `.btn-block` utility (or `.recent-workouts-load-more`) and drop the inline style.

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
- [ ] **workout.css full deletion** — not imported, but live-referenced by many JS render functions (exercise-list, exercise-overflow-item, modal-rest-*, cardio-*, notes-area, compact-hero etc.). Currently renders unstyled. Deferred: requires visual validation per class and a dedicated migration sprint. See DEPRECATED header inside the file for the migration checklist.
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
- [ ] **Write [styles/components/README.md](styles/components/README.md)** — one-page reference: "When you need a list item with [icon][title/subtitle][trailing] → `.row-card`. Section hero → `.hero-card`. Search field → `.field-search`. Action in page header → `.btn-save` (transparent) or `.btn-primary` (solid pill)." First thing a new contributor reads. (Opportunity 9 from design-critique-system.md)
- [ ] **Add a design-system audit script** (Opportunity 10 from design-critique-system.md). A Node script runnable in CI that counts:
  - Inline `style="` occurrences in JS (fail if > 30)
  - Raw `font-size: Xrem/px` in pages/*.css (fail if > 20)
  - Raw `border-radius: Xpx` in pages/*.css (fail if > 10)
  - Raw `rgba(...)` / hex in pages/*.css (fail if > 10)
  - Duplicate class definitions across files (report list)
  Doesn't have to block CI day one — start by tracking the trend.

---

## ✅ Phase H — V2 validation checklists

Infrastructure for Dashboard V2 and Active Workout V2 is shipped. These checklists come directly from the two implementation specs — walk through them on a 375px viewport before considering V2 "done."

### Dashboard V2 validation (from `DASHBOARD-V2-IMPLEMENTATION.md`)

**Prereq functions** (in `js/core/features/metrics/aggregators.js`):
- [ ] `aggregateSessionsPerDayOfWeek()` returns correct counts across 7 days
- [ ] `getLastTrainedDate()` returns `daysAgo` correctly for each body part
- [ ] `aggregateBodyPartStats()` returns hero-lift heaviest set, volume with delta, session count, staleness flag
- [ ] `aggregateExerciseStats()` returns max weight, heaviest set with reps, 1RM estimate, total volume, trend series, top 4 best sets
- [ ] `chartComboBarsLine()` renders correctly on Chest + Legs detail pages
- [ ] Gold PR dots appear on line overlay where `p.pr === true`
- [ ] `--cat-shoulders` / `--cat-arms` tokens used everywhere (no hardcoded hex)

**Dashboard render**:
- [ ] Section order: Greeting → Active pill → Hero chips → Insight → For today → Training → Composition → Recent PRs
- [ ] Hero chip row shows Streak, Weekly progress, Body weight delta
- [ ] "For [day]" shows today's day-of-week, templates ordered by frequency
- [ ] "Most used" chip only on top row when count ≥ 3 (see Phase C Dashboard for threshold reconsideration)
- [ ] Training section has 6 cards: chest/back/legs/shoulders/arms/core
- [ ] Stale cards (>5 days) render per Phase B Dashboard decision (opacity/sort)
- [ ] Sparkline hides when stale, warning shows instead
- [ ] Composition card shows donut from latest DEXA or empty state prompt
- [ ] Recent PRs shows top 3

**Drill-down navigation**:
- [ ] Tap body-part card → muscle group detail page
- [ ] Muscle group page shows heaviest heroLift set as primary stat
- [ ] Exercise rows on muscle-group page are tappable
- [ ] Tap exercise row → exercise detail page
- [ ] Back button at every level returns to previous
- [ ] Back from dashboard closes app / does nothing (iOS behavior)

**Consolidation audit** (may already be done):
- [ ] `renderHeroWorkoutCard()` deleted, all callers updated
- [ ] `.hero-workout-card` and `.btn-hero-start` CSS deleted
- [ ] Any standalone body-weight dashboard widget deleted (rolled into Composition)
- [ ] Any Phase-1 dashboard sections that don't fit the new structure removed

### Active Workout V2 validation (from `ACTIVE-WORKOUT-V2-IMPLEMENTATION.md`)

**Visual**:
- [ ] Header is 48px, minimal (back + title + meta + ⋮)
- [ ] Progress pills scroll horizontally; current = primary, done = green, superset = warm border (see Phase A: "done vs current" disambiguation)
- [ ] Rest timer is teal gradient (not yellow) with slide-in + `+30s` / `Skip`
- [ ] Equipment is a single inline line (icon + name · base weight · Change), NOT a card
- [ ] Last session card is a compact single line ("135×10 · 185×8 · 205×6 · 225×5 PR")
- [ ] Autofill hint says "Pre-filled · tap to edit" (see Phase B: persistent-hint suppression)
- [ ] Autofill cells dashed + muted; solid + bright when edited or focused
- [ ] Set row ✓ is a prominent 38px circle; grey → green on tap
- [ ] Current set row has primary border + box-shadow primary-bg (see Phase C: three-signal cleanup)

**Behavior**:
- [ ] Tap any progress pill → instantly switches exercise
- [ ] Tap "All" → drawer with every exercise, tap to jump
- [ ] Tap "Superset" in drawer → select-mode with checkboxes
- [ ] Select 2+ exercises → "Link N exercises" button enabled
- [ ] Confirm link → `supersetId` assigned, pills update, sheet closes
- [ ] On a superset exercise → superset banner + both exercises stacked
- [ ] Tap "Change" on equipment → equipment sheet opens with recent-used ordering
- [ ] Rest timer auto-starts on set ✓ and auto-dismisses at 0:00 with flash + haptic
- [ ] Next button becomes "Finish workout" on last exercise when all sets done
- [ ] Finish flow shows summary with PRs + stats + save

**Data integrity**:
- [ ] Set completion writes `{ weight, reps, completed: true, originalUnit, type }` plus `bodyWeight` / `addedWeight` / `isBodyweight` for BW exercises
- [ ] Autofill pulls from `getLastSessionForExercise(name)` — cached per session
- [ ] Superset group IDs persist in Firestore
- [ ] Equipment change updates set's `equipmentId` for the current exercise only

---

## 📦 Phase E — Housekeeping (safe anytime)

### Delete obsolete mockups [CODE-AUDIT.md #9]
- [ ] `mockups/dashboard-final.html` (superseded by v2)
- [ ] `mockups/dashboard-options.html`
- [ ] `mockups/dashboard-health-style.html`
- [ ] `mockups/dashboard-active-workout.html`
- [ ] `mockups/active-workout-locked.html`
- [ ] `mockups/stats-redesign.html`

**Keep**: `active-workout-v2.html`, `dashboard-final-v2.html`, `forms-redesign.html`, `settings-onboarding-redesign.html`, `features-redesign.html`, `create-workout-redesign.html`, `workout-page-flow.html`

### Delete obsolete implementation MDs [CODE-AUDIT.md #8]
- [ ] `UX-IMPLEMENTATION-GUIDE.md` (superseded by Master)
- [ ] `DASHBOARD-IMPLEMENTATION.md` (Phase 1 shipped)
- [ ] `EQUIPMENT-WEIGHT-IMPLEMENTATION.md` (shipped)
- [ ] Review and likely delete: `PLAN.md`, `workout-app-backlog.md`, `ENHANCEMENTS.md`
- [ ] Review: `UX-VISUAL-POLISH-GUIDE.md`, `UX-WORLD-CLASS-GUIDE.md`

### Archive source docs (this file is the single source of truth)
All items from the docs below are now captured in this backlog. Archive once confident nothing is missed:
- [ ] `design-critique-system.md` → archive (all items in Phase A/B/C/D/G)
- [ ] `design-critique-dashboard.md` → archive (all items in Phase A/B/C)
- [ ] `design-critique-history.md` → archive (all items in Phase A/B/C)
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
