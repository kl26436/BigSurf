# Active Workout Deep Critique + System-Wide Consistency Rules

**Reviewed:**
- `js/core/workout/active-workout-ui.js` (1,830 LOC)
- `styles/pages/active-workout-v2.css` (~26 KB)
- All `styles/components/*.css` and `styles/pages/*.css` (14,380 LOC across 32 files)
- `js/core/**/*.js` for inline-style usage and class-naming patterns

---

# Part 1 — Active Workout: Deep Critique

## Anatomy

The wizard renders top-to-bottom:
1. **Header** (`.aw-header`) — back, title (workout name + location), exercise N of M + elapsed, kebab
2. **Progress pills row** (`.aw-pills`) — horizontally scrollable per-exercise chips (current / done / superset)
3. **Rest timer banner** (`.aw-rest-timer`) — full-bleed gradient with `+30s` / `Skip`, progress bar
4. **Exercise hero** (`.aw-hero`) — tinted icon + title + sub + kebab
5. **Context banner** — equipment line OR bodyweight banner
6. **Last-session card** (`.aw-last`) — historical reference
7. **Set table** — column headers (#, Reps, Weight unit, ✓ + unit toggle) → set rows (autofill | done | current states) → "Add set" dashed button
8. **Notes** textarea
9. **Footer** (`.aw-footer`) — "All" jump-sheet button + "Next exercise" / "Finish workout"
10. **Bottom sheets** — Jump, Equipment, New Equipment, Add Exercise, Superset Link

## Overall Impression

This is the strongest screen in the app. The wizard pattern is the right call for the gym — minimal scrolling, thumb-reachable controls, clear "what's next." Every state has been considered (autofill, bodyweight, plate equipment, supersets, mid-workout cancel). The **biggest opportunities** are:

1. **Three semantic green states** in the set table (current border / done input color / done row background) confuse the eye.
2. **Equipment sheet has tiny inline-styled icons and meta** that bypass the design system.
3. **Sheets reinvent fields** (`.aw-sheet__search`, `.aw-sheet__chip`, `.field`, `.field-input`) instead of reusing the components in `forms.css` and `chips.css`.
4. **The "New equipment" sub-sheet renders fields with 100% inline styles** — a maintenance hazard.

## Usability — additional findings beyond the prior critique

| Finding | Severity | Recommendation |
|---|---|---|
| **Equipment sheet section emptiness is inconsistent.** "For [exercise]" shows an empty-state line ("No equipment assigned…"); "At [gym]" and "Other equipment" return empty string. Users who search and get 0 hits in two of three sections see a single line — looks like a partial search bug. | 🟡 Moderate | Either show all section headers with empty messages, or hide all empty sections when searching. |
| **Add-exercise sheet caps results at 50** with no pagination, "load more," or hint that results are truncated. A user looking for "Press" might silently get cut off. | 🟡 Moderate | Show "Showing 50 of 312 — refine your search" footer when truncated. |
| **"New equipment" form pre-selects "Machine" chip** but doesn't read the chip's category from the exercise being added. If the user is adding equipment for a barbell exercise, they have to switch chips. | 🟡 Moderate | Default the chip from the exercise's category (e.g., `Bench Press` → Barbell). |
| **Superset link sheet checkboxes show only when *not* selected** — selected rows show a `__checkbox.checked` filled box. But disabled completed exercises show a green check icon, which can be mistaken for "selected." | 🟡 Moderate | Use a distinct affordance for "completed/disabled" — e.g., a struck-through row and a small "Done" pill instead of a green check. |
| **Notes auto-grow is missing.** `<textarea rows="1">` with no `oninput` height adjustment. Long notes are confined to a 1-row scrolling box. | 🟡 Moderate | Add `onInput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"` or use a `contenteditable` div with min-height. |
| **`awUpdateSet` only stores `originalUnit` from `globalUnit`**, not from `exerciseUnits[idx]`. So a user who toggles to kg on a single exercise could have set values stored with the wrong `originalUnit`. | 🟡 Moderate | Mirror `awToggleSet`'s logic: `set.originalUnit = AppState.exerciseUnits?.[exerciseIdx] || AppState.globalUnit || 'lbs'`. |
| **Unit toggle in column header re-renders the whole UI each time** — there's no preserved focus or scroll. If a user is mid-typing, focus is lost. | 🟢 Minor | Toggle by mutating the CSS class on `.aw-sets-header__unit` and the column label; only re-render set rows if values need conversion. |
| **`.input-error` flash on missing equipment name** is 600 ms. Without an inline error message, the user sees a quick red pulse and may not understand why submit failed. | 🟢 Minor | Add `<div class="field__error">Name required</div>` below the input alongside the pulse. |
| **Equipment "auto-associate" silently writes back to Firestore** when a user picks an equipment for the first time at a new location. There's no toast or confirmation. | 🟢 Minor | Show a one-time tip: *"Added Hammer Strength to Downtown Gym."* |
| **Sheet backdrop is `rgba(0,0,0,0.6)` literal** while modals.css uses `var(--overlay-medium)` (0.5). Two different darkening levels for the same UX moment. | 🟢 Minor | Use `var(--overlay-medium)` consistently. |

## Visual Hierarchy — deeper read

- **Set table is the page's center of gravity.** Good. Inputs are the primary-weight elements (font-md, weight 800), the check button is large (38 px). Labels above are tertiary. Hierarchy is correct.
- **But the row's `current` state stacks three signals**: primary-color border, primary-color box-shadow, and (if autofill) dashed input borders. That's **3 visual treatments for "this is your active set"** — over-specified. One signal is enough; two reads as noise.
- **Header meta competes with title** in low-contrast users. `.aw-title__name` is `font-sm` weight-700; `.aw-title__meta` is `font-2xs` muted. The actual workout-elapsed time should be more prominent than "exercise N of M" — it's the user's session timer.
- **The kebab in the hero (.aw-hero__more) is a 34-px outlined circle**; the kebab in the header (.aw-menu) is 32-px transparent. Same icon, two visual treatments, two scopes. Nondiscoverable.

## Consistency — additional findings

| Element | Issue | Recommendation |
|---|---|---|
| **`.aw-bw-banner` vs `.bw-banner`** | JS renders `.bw-banner` (lines 384-413 of active-workout-ui.js) but CSS only declares `.aw-bw-banner` (lines 264-289 of active-workout-v2.css). The banner is currently unstyled; it falls back to default flex behavior. | Confirmed bug — rename one to match the other. |
| **`aw-equip-section` empty-state line uses inline style** | `<div style="padding:8px 4px;font-size:var(--font-xs);color:var(--text-muted);">…</div>` | Add `.aw-equip-section__empty` class. |
| **Equipment row icon styled inline** | `<div class="js-row__icon" style="background:var(--bg-card-hi);color:var(--text-muted);">` — the icon variant is hard-coded into JS. Same with the location icon `style="font-size:0.5rem;"`. | Add `.js-row__icon--equip` and `.js-row__loc-icon` classes. |
| **"None" equipment row uses inline `style="opacity:0.6;"`** | Visual state encoded in JS. | Add `.js-row--none` class. |
| **New equipment form is 100% inline-styled** | 7 separate `style="..."` attributes on field labels, inputs, base-weight wrapper, info banner. | Use existing `.field`, `.field__label`, `.field__hint` from `components/fields.css` (already exists at 185 LOC). |
| **`aw-sheet__chip` vs `chips.css` chips** | Sheet chips re-implement what's in `components/chips.css` (94 LOC). Two chip systems, two visual styles. | Either align `.aw-sheet__chip` to the chips.css API, or fold into the global system. |
| **`aw-sheet__search` vs `forms.css` search inputs** | Sheet search is a custom positioned input + icon. `forms.css` has its own search style, and so does `.history-search-input-wrapper` and `.exercise-search-wrapper`. **Four different search-input styles.** | Define one `.field-search` pattern in `components/fields.css` and use it everywhere. |
| **Hard-coded RGBA tints in `.aw-set-row.done`** | `rgba(54, 196, 107, 0.08)` and `0.2` — should be `--success-bg-subtle` and `--success-border`. | Add `--success-bg-subtle` token (already `--success-bg` and `--success-border` exist but neither matches 0.08). |
| **Hero icon tints use literal RGBA** for push/pull/legs/cardio/core (5 lines, lines 200-204 of active-workout-v2.css). Bypasses the existing `--cat-*-bg` tokens that already define these exact colors. | High duplication risk. | Replace with `var(--cat-push-bg)`, `var(--cat-pull-bg)`, etc. |
| **`var(--anim-fast)` on `transition: all`** | "all" is expensive on mobile and triggers layout/paint on every property. | Specify properties explicitly. |
| **Border radii on this page**: `4px` (no, just `--radius-xs`), `8px`, `10px`, `12px`, `var(--radius-md)`, `var(--radius-pill)`, `50%`, `20px 20px 0 0` (sheet). **8 different radii** in one screen. | Fragmented. | Standardize to `--radius-xs / sm / md / lg / pill`. The sheet's `20px 20px 0 0` is `--radius-lg --radius-lg 0 0`. |

---

# Part 2 — System-Wide Consistency Analysis

## The Quantitative Picture

| Metric | Value | Implication |
|---|---|---|
| Total CSS LOC | **14,380** | Large for a ~30-screen mobile app |
| LOC in `pages/*.css` | 10,234 (71%) | Most styling lives in page files — opposite of a mature design system |
| LOC in `components/*.css` | 3,102 (22%) | Components exist but aren't pulling weight |
| Distinct CSS class declarations | 1,472 | High |
| Unique class names | 1,400 | Lots of one-off classes |
| Class names defined in 2+ files | ~70 | Duplicate declarations cause subtle override bugs |
| Inline `style="…"` in JS | **333 across 25 files** | Direct violation of CLAUDE.md rule |
| Raw `rgba(…)` in CSS (excl. tokens) | ~78 | Bypasses color tokens |
| Raw hex `#…` in CSS (excl. tokens) | ~17 | Same |
| Raw `font-size: Xrem/px` (excl. reset) | ~138 | Bypasses font-size tokens |
| Raw `border-radius: Xpx` | 25 | Bypasses radius tokens |
| Distinct `.btn-*` classes | **44** | The "system" of 8 has 36 ad-hoc additions |

## The Pattern Problem: Concept Inflation

The same conceptual pattern is implemented many times under different names. Counts below come from grepping CSS class declarations.

### "Card" patterns (≥19 distinct classes for one concept)
`hero-card`, `row-card`, `exercise-card`, `bp-card`, `bc-card`, `bw-card`, `bw-hero-card`, `in-progress-card`, `badges-section-card`, `suggested-card`, `prs-card-new`, `pr-achievement-card`, `template-row-card`, `bodyweight-card`, `insights-card`, `prompt-card`, `coach-action-card`, `preview-exercise-card`, `history-card`

### "Row" patterns (≥20)
`recent-workout-item`, `rw-row`, `aw-set-row`, `ex-row`, `pr-row`, `js-row`, `meas-row`, `template-row`, `exercise-row`, `template-exercise-item`, `weight-history-item`, `measurement-row`, `bw-hero-input-row`, `quick-sets-row`, `cardio-input-row`, `inline-equipment-row`, `inline-edit-row`, `detail-row`, `add-ex-row`, `set-row-completed`

### "Item" patterns (≥14)
`workout-overflow-item`, `exercise-overflow-item`, `template-overflow-item`, `pr-item-new`, `badge-preview-item`, `badge-full-item`, `pr-equipment-item`, `pr-exercise-item`, `recent-workout-item`, `weight-history-item`, `legend-item`, `completion-pr-item`, `insight-item`

### "Banner" patterns (≥7)
`resume-banner`, `bw-banner`, `aw-bw-banner` (orphaned), `aw-superset-banner`, `aw-rest-timer`, `save-template-banner`, `all-completed-banner`

### "Pill / chip" patterns (≥9)
`aw-pill`, `filter-pill`, `category-pill`, `set-chip`, `recent-template-chip`, `quick-add-chip`, `aw-sheet__chip`, `onb-chip`, `preview-alt-chip`

### "Search input" patterns (≥4)
`history-search-input-wrapper`, `exercise-search-wrapper`, `aw-sheet__search`, plus the generic `forms.css` search style

### "Section header" patterns (≥4)
`section-header`, `section-header-row`, `dash-section-head`, `stats-section-header`

### Confirmed duplicate declarations
`recent-workout-item` (4 declarations across `dashboard.css` + `history.css`), `recent-workout-name` (3), `quick-add-chip` (3), `month-navigation` (3), `modal-rest-display` (3), `exercise-unit-toggle` (3), `exercise-card-meta` (3), `btn-save` (3), `skeleton` (3).

The cost: every visual change has to be made in 2-4 places, and inconsistencies creep in (e.g., the History critique found three different `.recent-workout-item` declarations stacking overrides on each other).

---

## The Naming Problem

The codebase mixes three naming systems:

1. **BEM-ish with double underscore + double dash** — `aw-pill__icon`, `bp-card__chev`, `js-row__name` (used in V2 modules)
2. **Hyphen-only** — `recent-workout-item`, `exercise-card-header`, `template-row-card` (used in V1/legacy)
3. **Compound words** — `bodyweight-card`, `prs-card-new` (mixed)

Compound prefixes (`aw-`, `bp-`, `bc-`, `bw-`, `dash-`, `ic-`, `js-`, `rw-`, `cat-`, `onb-`) are inconsistent in meaning:
- `aw-` = active workout (clear)
- `bp-` = body part (less obvious)
- `bc-` = body composition (only obvious in context)
- `bw-` = body weight (collides with `bw-banner` rendered in active workout)
- `dash-` = dashboard (clear)
- `ic-` = icon-color (used only in `dashboard-v2.css` for muscle tints)
- `js-` = jump sheet (could be misread as JavaScript)
- `rw-` = recent / recommended workout (ambiguous — see History critique)
- `onb-` = onboarding (clear)

### The result
A new contributor reading `.bp-card__chev` reused inside a `.bw-card-head` (real example, dashboard-v2.css) cannot reason about which selector belongs where.

---

## The Token Problem: Tokens Exist, Tokens Are Bypassed

**Strong:** `tokens.css` is a well-designed 238-line foundation — semantic colors, primary/success/warning/danger states with `-bg`/`-border`/`-subtle` variants, full font scale, full radius scale, full spacing scale, animation curves.

**Weak:** Pages bypass tokens routinely. Examples:

- `dashboard-v2.css` uses `0.56rem`, `0.58rem`, `0.62rem`, `0.74rem`, `0.82rem`, `0.95rem`, `1.25rem`, `0.9rem` — **eight raw font sizes** when `--font-2xs/xs/sm/base/md/lg` exist.
- `active-workout-v2.css` mixes `8px / 10px / 12px / 20px / var(--radius-md) / var(--radius-pill) / 50%` for radii — **8 radii** when 5 tokens exist.
- The `.hero-chip--streak` warm gradient uses literal `rgba(247, 168, 101, 0.15)` × 2 even though `--highlight-warm-bg` and `--highlight-warm-bg-gradient-start/end` are defined in tokens.
- The `.aw-hero__icon.tint-push/pull/legs/cardio/core` rules use literal RGBA when `--cat-push-bg` etc. exist (defined for `cat-push/pull/legs/cardio/core/arms/shoulders`).
- The `.aw-set-row.done` rule uses literal `rgba(54, 196, 107, 0.08/0.2)` when `--success-bg` and `--success-border` exist (close enough — needs `--success-bg-subtle` for the 0.08 variant).

The system is *almost* tokenized; pages just don't ask for them.

---

## Concrete Rules to Adopt

These are the rules I'd pin to `CLAUDE.md` (some already exist but aren't enforced).

### Rule 1 — One row pattern, one card pattern
- Every list item that has `[icon] [title + subtitle] [trailing]` must use `.row-card` (or extend it). No new `*-row`, `*-item`, `*-card-list` classes for this shape.
- Every "section hero" (one prominent card per metric) must use `.hero-card` plus a modifier (`-warm`, `-success`, `-flat`).
- **Migration target:** absorb `recent-workout-item`, `rw-row`, `pr-row`, `bp-card`, `bc-card`, `template-row`, `exercise-card`, `js-row`, `recent-template-chip`, `meas-row`, `weight-history-item`, `detail-row`, `coach-action-card`, `preview-exercise-card`, `history-card` into `.row-card` (with `-modifier` variants where needed).

### Rule 2 — One section header pattern
- All section headers (`<h3>` + optional action link) use `.section-header` from `components/cards.css`.
- Page-level pinned headers (back arrow + title + action) use `.section-header-row` from `pages/workout.css` — **but move it to `components/page-header.css`** where it conceptually belongs.
- Delete `.dash-section-head` and `.stats-section-header`.

### Rule 3 — One chip / pill pattern
- One chip system in `components/chips.css`. Variants: `.chip`, `.chip--filter`, `.chip--category`, `.chip--cat-push|pull|legs|…`, `.chip--active`, `.chip--small`.
- Replace `aw-pill`, `aw-sheet__chip`, `category-pill`, `filter-pill`, `quick-add-chip`, `set-chip`, `recent-template-chip`, `onb-chip`.

### Rule 4 — One search field
- One `.field-search` in `components/fields.css` (icon + input + clear button + optional filter select).
- Replace `history-search-input-wrapper`, `exercise-search-wrapper`, `aw-sheet__search`, and any future inline search styles.

### Rule 5 — No raw color literals in page CSS
- `pages/*.css` and `components/*.css` (other than `tokens.css`) must use `var(--*)` for color.
- For tints not in tokens, add a token to `tokens.css`. Suggested additions:
  - `--success-bg-subtle: rgba(54, 196, 107, 0.08)`
  - `--rest-timer-overlay: rgba(4, 32, 26, 0.18)` (or use `color-mix`)
  - `--cat-chest-bg / --cat-back-bg / --cat-legs-bg` (already exist, just use them in `.ic-*`)

### Rule 6 — No raw font sizes
- `font-size:` values in pages/components use the `--font-*` scale only.
- If a page needs `0.95rem`, add `--font-md-sm` (or pick the nearest existing token).

### Rule 7 — No raw radii
- `border-radius:` uses `--radius-xs/sm/md/lg/pill`. The full-width sheet's top corners are `var(--radius-lg) var(--radius-lg) 0 0`, not `20px 20px 0 0`.

### Rule 8 — No inline styles in JS (already in CLAUDE.md — needs enforcement)
- 333 violations today. Strategy: add an ESLint rule (`no-inline-style` for JSX-like template strings is harder; consider a custom regex check in CI).
- Truly dynamic values (width %, transform translate, SVG coordinates) — use `element.style.setProperty('--var-name', value)` and reference the var in CSS.

### Rule 9 — One namespacing convention
- Pick BEM-ish (`block__element--modifier`) and apply across new CSS.
- Page-prefix scoped classes (`aw-`, `dash-`) only when necessary for layout-specific rules; visual primitives go unscoped.

### Rule 10 — No duplicate class declarations across files
- A class is defined in **exactly one** file. Period.
- Today: `.recent-workout-item` is defined 4 times across 2 files (dashboard.css and history.css).

---

## Concrete Opportunities, Ranked by ROI

### Opportunity 1 — Delete `dashboard.css` (V1) [High ROI]
~30 KB / 1,000 LOC of likely-dead CSS. Confirmed unused selectors based on the V2 dashboard render: `.streak-box`, `.in-progress-card`, `.suggested-card`, `.suggested-completed`, `.all-completed-banner`, `.badges-section-card`, `.badges-row-preview`, `.badge-preview-item`, `.badge-full-item`, `.pr-item-new`, `.prs-card-new`, `.pr-achievement-card`, `.completion-pr-item`, etc.

**Action:** Audit each top-level class in `dashboard.css` for usage in JS render functions. Delete unused. Move shared bits (`.dash-greeting` styles if any) into `dashboard-v2.css`. **Estimated CSS reduction: 25-30 KB (≈8%).**

### Opportunity 2 — Tokenize the 8 raw font sizes in `dashboard-v2.css` [Quick win]
Single-file sweep. Map `0.56rem → --font-2xs`, `0.58 → --font-2xs`, `0.62 → --font-xs`, `0.74 → --font-xs`, `0.82 → --font-sm`, `0.95 → --font-base`, `1.25 → --font-lg`. **Removes 29 raw font-size declarations** in one file.

### Opportunity 3 — Extract `.field-search` and replace 4 search variants [Medium ROI]
~200 LOC saved across history.css, exercise-lib.css, active-workout-v2.css, and forms.css. Plus a more consistent UX across the app (today the search inputs visually drift).

### Opportunity 4 — Consolidate the 4 "section header" patterns [Medium ROI]
Pick one. The `.section-header-row` from `workout.css` is the most complete (handles back arrow + title + safe-area-inset). Move to `components/page-header.css`, replace `.dash-section-head`, `.stats-section-header`, `.section-header` (the simpler one in `cards.css`). ~80 LOC saved + naming clarity.

### Opportunity 5 — Replace the 19 "card" classes with `.hero-card` + `.row-card` modifiers [High ROI, multi-PR]
The biggest structural improvement. Audit each card class, classify as hero vs row, write modifiers (`.row-card--pr`, `.row-card--equipment`, `.hero-card--workout-recap`). **Estimated savings: 600-1,000 LOC + dramatically improved consistency.**

### Opportunity 6 — Sweep the 333 inline `style="…"` declarations [High ROI, multi-PR]
Strategy:
1. **Static colors** (`style="color:var(--primary);"`) → utility class (`.text-primary`, `.text-warm`, `.text-success`).
2. **Static spacing** (`style="margin-top:12px;"`) → utility class or component-internal class.
3. **Static layout** (`style="display:flex;gap:8px;"`) → component-internal class.
4. **Truly dynamic** (`style="width:${pct}%;"`) → CSS custom property pattern: `style.setProperty('--progress', pct + '%')` and `width: var(--progress)` in CSS.

Add a CI check to prevent regressions: `git grep "style=\"" js/ | wc -l` should drop to ≤ ~20 (only truly-dynamic cases).

### Opportunity 7 — Audit and prune `.btn-*` variants [Medium ROI]
44 button classes. Likely 10-15 are page-specific one-offs that should fold into the system. Specifically: `.btn-add-equipment`, `.btn-add-exercise-bottom`, `.btn-back-category`, `.btn-delete-exercise`, `.btn-finish-footer`, `.btn-redesign`, `.btn-set-control`, `.btn-start-small`. Most can be `.btn .btn-primary .btn-sm` + a feature-specific position class.

### Opportunity 8 — Add a "states" section to tokens.css [Low effort, high impact]
Today, "incomplete," "cancelled," "stale," "current," "done," "in-progress" all use ad-hoc colors and opacities. Define semantic state tokens:

```css
--state-incomplete: var(--warning);
--state-incomplete-bg: var(--warning-bg);
--state-cancelled: var(--text-muted);
--state-cancelled-bg: rgba(255,255,255,0.04);
--state-stale: var(--text-muted);
--state-stale-opacity: 0.8;        /* not 0.55 */
--state-current: var(--primary);
--state-current-bg: var(--primary-bg);
--state-done: var(--success);
--state-done-bg: var(--success-bg);
```

Pages then reference state semantics, not raw colors. Future state changes (e.g., changing "cancelled" from gray to muted-red) become one-line edits.

### Opportunity 9 — Document the system in `components/README.md` [Documentation gap]
A 1-page reference: "When you need a list item with [icon][title/subtitle][trailing], use `.row-card`. When you need a section hero, use `.hero-card`. Search field? `.field-search`." Make it the first thing a contributor reads.

### Opportunity 10 — Add a "design system audit" script [Sustaining]
Single Node script that runs in CI:
```
- Count inline styles in JS                 → fail if > 30
- Count raw font-sizes in pages/*.css       → fail if > 20
- Count raw radii in pages/*.css            → fail if > 10
- Count raw rgba()/hex in pages/*.css       → fail if > 10
- Find duplicate class definitions          → list them
```
Doesn't have to block CI day one. Start by tracking the trend.

---

## A Suggested Migration Order (low-risk → high-impact)

1. **Token sweep** — replace raw font-sizes/radii/colors in `dashboard-v2.css` and `active-workout-v2.css` with tokens. (1 PR, no behavior change.)
2. **Add missing tokens** — `--success-bg-subtle`, state tokens, missing `--cat-*-bg`. (1 PR.)
3. **Delete dead `dashboard.css` selectors.** (1 PR, sized to a quiet day.)
4. **Add `.field-search` and migrate 4 callsites.** (1 PR.)
5. **Consolidate section headers** — promote `.section-header-row` to `components/page-header.css`. (1 PR.)
6. **Remove duplicate `.recent-workout-item`** declarations; pick one definition. (1 PR.)
7. **Inline-style sweep, page by page**, starting with `dashboard-ui.js` (~13 violations) → `active-workout-ui.js` (~26) → larger files. (Iterative PRs.)
8. **`.row-card` migration**, page by page. The biggest project — multi-week. Each page's `.recent-workout-item`/`.rw-row`/`.pr-row` collapses into `.row-card` with modifiers.
9. **CI audit script**, once the numbers are reasonable. Lock in the gains.

---

## What's Already World-Class

To be clear about what *not* to change:

- **`tokens.css`** — semantic, well-categorized, complete. The foundation is right.
- **`.row-card` and `.hero-card` patterns** in `components/cards.css` — they exist and they're well-designed; they're just under-used.
- **`forms.css`, `chips.css`, `fields.css`, `nav.css`** — all sensibly sized, clearly purposed.
- **`utilities.css`** properly placed last in the import order.
- **The active-workout wizard pattern** — the one-exercise-at-a-time flow with sticky header/footer + auto-scrolling pills is a strong UX pattern.
- **`AppState` centralization, `Config` constants, `getCategoryIcon` helper, `displayWeight` rounding** — these are the kind of shared primitives that make consistency *possible*.

The system has the right bones. The path forward is enforcement, not redesign.

---

## TL;DR

1. **Active workout** has one likely bug (`.bw-banner` may be unstyled), three signals competing for "current" set, and inline-style violations everywhere in the equipment/new-equipment sheets.
2. **System-wide**: the design system *exists* (great tokens, real card/row patterns) but is bypassed at every page. 19 card classes, 20 row classes, 4 search styles, 4 section headers, 333 inline styles, 138 raw font sizes — pick any one of these and a sweep would meaningfully improve consistency.
3. **Highest ROI moves**: delete dead `dashboard.css` (~25 KB), tokenize fonts/radii in V2 files (one-day sweep), introduce `.field-search` (replaces 4 implementations), then start the multi-PR migration to `.row-card`.
4. **Process**: pin 10 rules to CLAUDE.md, add a tiny audit script in CI, and the system stops drifting.
