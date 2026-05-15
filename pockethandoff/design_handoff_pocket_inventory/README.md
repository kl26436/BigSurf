# Handoff: Pocket Inventory — Equipment + Exercise Library Redesign

## Overview

This package is the design spec for **Pocket Inventory**, a dense, power-user-oriented redesign of the Equipment Library and a matching refresh of the Exercise Library so both screens read as the same app. The redesign addresses the brief in `uploads/equipment-library-redesign-brief.md` (gym-first navigation, rapid inventorying, equipment↔exercise mapping, history reconciliation, and global catalog browsing) and aligns the Exercise Library to the same visual + interaction vocabulary.

The current shipped Equipment Library is a flat list with a `By Brand / By Body Part` toggle and location filter pills. Pocket Inventory replaces it with a three-tab IA (My gyms / Library / Catalog), gym cards with at-a-glance type-mix bars, a body-part-grouped dense list, a search-first quick-add sheet, a dedicated machine-detail page, and a three-action history reconciliation flow (Add / Link / Skip). The Exercise Library gets a parallel four-tab layout (All / Favorites / Recent / Custom), equipment-type icons on every exercise row, and a detail page that mirrors the machine detail.

## About the Design Files

The files in this bundle (`*.html`, `*.jsx`) are **design references created in HTML/JSX as a clickable prototype** — not production code to copy directly. They are designed to be **recreated in the existing Big Surf codebase** (vanilla JS + Firebase, render-functions returning innerHTML strings, design tokens in `styles/tokens.css`) using the established patterns:

- Render functions like `renderDashboard()`, `renderForToday()` in `js/core/ui/*-ui.js` that build innerHTML strings against existing CSS classes
- CSS classes already defined in `styles/pages/equipment-library.css`, `styles/components/chips.css`, `styles/components/grouped-rows.css`, etc.
- Design tokens already defined in `styles/tokens.css`

Do **not** introduce React, JSX, or any new framework. Do **not** copy CSS from the prototype — every color, spacing, and radius in the prototype already exists as a token in `tokens.css`; map prototype hex values back to the corresponding `--` variable and reuse the existing CSS classes wherever they already exist.

## Fidelity

**High-fidelity.** Every color, font size, spacing value, radius, and shadow in the prototype is sourced from the existing `styles/tokens.css`. Layouts are pixel-precise within a 375 × 812 (iPhone 14) viewport. Implement these designs pixel-perfectly using the existing token system and component CSS — the prototype is the source of truth for visual treatment, but the **code primitives** are the existing CSS classes and render-function patterns in `BigSurf-B/`.

## Information Architecture

### Equipment Library — three tabs

| Tab | Purpose |
|-----|---------|
| **My gyms** (default) | Gym cards with machine count + equipment-type breakdown bar. Tap a gym → Gym detail. |
| **Library** | All equipment grouped by body part, the existing personal library view, restyled for density. |
| **Catalog** | Global catalog grid: brand tiles + a "Popular at <current gym>" preview list. |

Tab control: matches the existing `.equip-view-toggle` segmented control pattern but extended to three segments. Use a row of underlined tab links with a small count chip per tab (see Components → CompactTabs).

### Exercise Library — four tabs

| Tab | Purpose |
|-----|---------|
| **All** | Everything in the user's exercise database. |
| **Favorites** | `ex.fav === true`. |
| **Recent** | High-use threshold (suggest `uses >= 24` or top-quartile). |
| **Custom** | User-created exercises. |

### Library toggle (shared header)

Both libraries render a pill segmented control at the top: **Exercises | Equipment**. Tapping flips between the two libraries while preserving filter state where it makes sense (body part). This makes them feel like one section.

## Screens

### 1. Equipment Landing (My gyms)

**Purpose:** Pick a gym to inventory, see overall scope (4 gyms, 89 machines, 14 brands, N orphans), and surface the history-reconciliation banner.

**Layout (top to bottom):**
1. **Header row** — title "Library" (22px / 800 / `--text-strong`), two circular 34×34 buttons on the right (search, sort).
2. **Library toggle** — pill segmented control "Exercises | Equipment". 4px padding, `--bg-surface` background, 999px radius, 1px border `--border`. Active segment uses `--primary-bg-strong` background, `--primary` text.
3. **Compact tabs** — "Gyms 4 | Library 89 | Catalog 1.3k". Each tab is text + a small count chip (10px font, 999px radius, `--primary-bg` for active else `--muted-bg`). Active tab gets a 2px `--primary` bottom border.
4. **History orphan banner** (conditional on `orphans.length > 0`) — full-width row, `--warning-bg` background, `--warning-border` 1px border, 10px radius. Warning icon (color `--warning`) + sentence + "Review →" link. Tap → History reconciliation screen. **Tap target the entire row, not just the link.**
5. **Stat strip** — four small cards in a `1fr 1fr 1fr 1fr` grid: Gyms, Machines, Brands, Orphans. The Orphans card uses warning colors when count > 0. Each card: value (16px / 800 / tabular-nums) over label (9px / 700 / uppercase / `--text-very-muted` / 0.05em tracking).
6. **Gym cards** — one per saved gym (see Components → GymCard).

**Bottom nav:** standard 5-item nav, no FAB action on this screen (the gym + Add CTA is on the detail page).

### 2. Gym Detail

**Purpose:** Browse equipment at one gym, filtered by body part. Add more via the quick-add sheet.

**Layout:**
1. **Header row** — 30×30 back button + gym name + meta ("47 machines · 12 brands · 2 days ago") + a small pill "+ Add" button (`--primary` background, `#04201a` text, 11.5px font, 999px radius). Tapping "+ Add" opens the Quick-add sheet.
2. **Body part chip strip** — horizontal scrollable `.chip`s with count badges. Active chip: `--primary-bg-strong` background, `--primary` text. Inactive: `--bg-surface` background, `--text-muted` text. Sticky directly under the header.
3. **Grouped equipment list** — items grouped by body part. Each group has a sticky **GroupHeader** (see Components) and dense **EquipmentRow** entries.

**Important:** Reuse the existing `.equip-row` CSS class. The tweaks are: tighter padding (8px vertical instead of 12px), smaller 28×28 icon (instead of `--icon-md` 40px), and a right-aligned `lastUsed` timestamp.

### 3. Quick-add Sheet

**Purpose:** Rapid bulk-tagging while walking the gym floor. **3 seconds per machine** is the bar.

**Behavior:**
- Opens as a bottom sheet covering ~85% of the viewport (top: 90px from device top), 20px radius on top corners.
- Existing pattern: extend `openSheet()` from the modal helpers.
- Auto-focus the search input on open. Keyboard rises immediately.
- Search input is the hero: `--primary-border` 1px, `--bg-card` background, 10px radius. Filter results live as user types.
- A live result count appears on the right of the input ("14 results").
- Body-part filter chips below search (horizontally scrollable, single-select).
- Results are **grouped by body part** with the same `GroupHeader` as the gym-detail page (NOT by brand). This is the major IA change from the brief — brand is shown inline on each row as metadata, but body-part is the dominant axis because the user is filtering by what they can SEE (a chest machine), not by who made it.
- Each row is a multi-select **CheckRow**: 20×20 checkbox + type icon + name + brand·line metadata + type pill. Already-tagged rows show as checked-and-disabled with "Already at this gym" subtext at 50% opacity. Checked-by-user rows get a `rgba(29,211,176,0.05)` row background.
- Sticky bottom action bar: a single full-width button reading **`[N] Add to gym →`** where `[N]` is a black pill counter overlaid on the button at left, count updates live as rows toggle. Counter pill: `#04201a` background, `--primary` text. Disabled when N=0.
- Cancel link in the header dismisses without saving. Closing via Add fires a toast: "Added N machines to <Gym>".

### 4. Machine Detail

**Purpose:** Everything about one machine — what exercises it supports, which gyms have it, recent PRs, notes.

**Layout:**
1. **Page header** — back button + machine name + "brand · line" subtitle + an "Edit" link in `--primary` on the right.
2. **Stat grid** — three cards in a `1fr 1fr 1fr` grid: Sessions, PR, Last. Each card: `--bg-card` background, `--border-subtle` 1px border, 10px radius. Label: 9px / 700 / uppercase / `--text-very-muted`. Value: 18px / 800 / tabular-nums / `--text-strong`. Sub: 9.5px / `--text-very-muted`.
3. **Tag row** — TypePill + bodypart chip + locations count chip. Horizontal flex, 6px gap, wraps.
4. **Section: Exercises (N)** — list of exercises this machine supports. Each row: an icon tile (28×28, `--warm-bg` background + `--warm` icon if this is the user's PR exercise, else `--bg-card-hi` + `--text-muted`), name, meta (e.g. "PR 225 ×5 · 3d"). Tap → exercise detail.
5. **Section: At these gyms (N)** — list of gyms where this machine lives. The current gym (from GPS) gets a `--primary` tinted icon and a "HERE" badge.
6. **Section: Notes** — free-text note from the user. Plain card, `--bg-card` background.

### 5. History Reconciliation

**Purpose:** Map historical equipment names (from before the library existed, or imported from old workouts) to canonical library entries.

**Layout:**
1. **Page header** — back button + title "Reconcile history" + subtitle "5 orphan names · 49 sessions affected" + an "Auto-link all" pill button on the right (small, `--primary-bg` background, `--primary` text, `--primary-border` 1px).
2. **Orphan rows** — one per unmapped name. Each row:
    - Title: `"<old name>"` in 13px / 700, with the original quotation marks.
    - Meta: original context ("Bench Press · 14 sessions").
    - **Action button on the right**: this is the key UX choice. When we have a confident suggestion, the right-side action is `Link` (`--primary` background, `#04201a` text). Otherwise it's `Add new` (`--bg-card-hi` background, neutral border).
    - **Suggestion preview row** (if `suggestion` exists): inline below the title, `rgba(29,211,176,0.06)` background, `--primary-border` 1px, 8px radius. Pattern: `→ <suggestion name>` with small edit/dismiss icons on the right. Tapping the row commits the link.
3. The **three actions per row** are: Add (new entry), Link (map to existing), Skip (ignore this session). When a suggestion exists, "Link" defaults to the suggestion; tapping "Other" opens a library picker.

### 6. Browse Catalog

**Purpose:** Discover machines you haven't added yet. Browse by brand or by type.

**Layout:**
1. Same header + Library toggle as the landing screen.
2. Compact tabs with "Catalog" active.
3. **Section: Brands · 21** — a 3-column grid of brand tiles. Each tile: 10px padding, `--bg-card` background, `--border-subtle` 1px border, 10px radius. Brand name (11px / 800 / `--text-strong`) on top, "N lines" (9px / `--text-very-muted` / tabular-nums) below.
4. **Section: Popular at <current gym>** — a vertical list of the user's most-used machines at the current gym, in the same dense row format. Tap → Machine detail.
5. Tapping a brand tile drills into a brand detail (out of scope for this handoff — pattern reuses the existing `.brand-header` / `.line-header` / `.equip-row` blocks already in `equipment-library.css`).

### 7. Exercise Library (main)

**Purpose:** Browse all exercises in your library, grouped by body part. Tap to view detail or add to active workout.

**Layout:**
1. **Header** — title "Exercises" + count + a "+ Add custom" circular button.
2. **Library toggle** (same as Equipment Library) — flips to Equipment.
3. **Four-tab strip** — All / Favorites / Recent / Custom with count chips.
4. **Search row** — same dense style as the equipment library search.
5. **Body-part chip strip** — same component as the equipment library.
6. **Suggested chips** — header reading `<location pin> For <gym name>`, then a row of pill-style chips. Each chip has a small 16×16 equipment-type icon followed by the exercise name. Tap → ExerciseDetail. Source: existing `gymSuggestedExercises` array already produced by `rankExercisesForLocation()` in `equipment-planner.js`.
7. **Grouped exercise list** — `D2GroupHeader` per body part, then dense `ExerciseRow`s:
    - 28×28 equipment-type icon (tinted by the exercise's primary equipment)
    - Exercise name + a small gold star if `fav`
    - Subtitle: equipment name ("Cable Crossover" etc.) at 9.5px / `--text-very-muted`
    - Right-aligned PR (12px / 700 / tabular-nums) with "PR" label below
    - Far-right last-used pill ("3d", "Mon", "2 wk")

### 8. Exercise Detail

**Purpose:** Full picture for one exercise: recent sessions, where it's done, what equipment supports it.

**Layout:**
1. **Page header** — back + exercise name + equipment subtitle + a star toggle on the right (gold if `fav`).
2. **Stat grid** — same 3-card stat grid as Machine Detail (Sessions / PR / Last).
3. **Tag row** — body-part chip + TypePill.
4. **Section: Recent sessions** — one row per session. Date + sets summary + total volume. The most recent session if it's a PR gets a `--warm-bg` flame icon; others get a neutral dumbbell.
5. **Section: Used at** — list of gyms where this exercise has been performed, with session counts. Current gym shows a "HERE" badge.
6. **Section: Equipment that does this** — list of machines from the user's library that support this exercise (the inverse mapping). Tap → Machine detail. This is the **equipment ↔ exercise mapping** the brief calls out.
7. **Sticky bottom action**: full-width primary "+ Add to workout" + secondary 48×48 chart icon button. Same pattern as the existing active-workout add-exercise primary action.

## Components

These are the new/modified visual primitives. Most map to existing CSS classes — the prototype names are React function names, the production CSS class names are listed.

### CompactTabs
- Three-tab strip with active underline + count chips
- Current CSS: extend `.equip-view-toggle` or create a new `.compact-tabs` block in a shared component CSS file
- Padding: `4px 16px 10px`. Border-bottom: `1px solid var(--border-subtle)`.
- Each tab: 8px / 0 / 6px padding, font 13px / 700, border-bottom 2px (`--primary` if active else transparent).
- Count chip: padding `1px 6px`, radius 999px, font 10px / 700 / tabular-nums.

### LibraryToggle
- Pill segmented control "Exercises | Equipment"
- Reuse `.equip-view-toggle` exactly. Same dimensions, same active state colors.

### GymCard (D2GymCard)
- `padding: 10px 12px`, `background: var(--bg-card)`, `border: 1px solid var(--border-subtle)`, `border-radius: 12px`, `margin-bottom: 8px`
- Optional `border-left: 3px solid var(--primary)` when this is the current GPS-detected gym (else `3px solid transparent` to keep alignment).
- Layout: flex row with name+meta on the left, big count number (18px / 800 / tabular-nums) and chevron on the right.
- **Type-mix bar**: a 6px-tall horizontal stripe below the header showing equipment-type proportions (Plate-Loaded, Selectorized, Cable, Rack, etc.). Each segment uses the corresponding `--equip-*` token color. Already-defined tokens: `--equip-plate-loaded`, `--equip-selectorized`, `--equip-machine`, `--equip-cable`, `--equip-rack`, `--equip-bench`, `--equip-cardio`, `--equip-other`.
- **Type legend**: below the bar, four small `<dot> <type label> <count>` items. Dot is a 6×6 square with 2px radius. Label is 9.5px / 600 / `--text-muted`. Count is 9.5px / 600 / `--text-very-muted` / tabular-nums.
- "HERE" badge: 1px 5px padding, 4px radius, `--primary` background, `#04201a` text, 8.5px / 800 / uppercase / 0.04em letter-spacing.

### StatStrip
- Small stat card: `8px 6px` padding, `--bg-card` background, `--border-subtle` 1px, 10px radius, center-aligned.
- Warning variant: `--warning-bg` background, `--warning-border`, `--warning` value color. Use when an actionable count is > 0 (e.g. orphans).

### EquipmentRow (D2Row)
- Reuse `.equip-row` but in a `compact` modifier:
  - Padding `8px 14px` (instead of `12px var(--pad-page)`)
  - Icon size 28px (instead of `--icon-md` 40px), 7px radius
  - Name font size 12.5px / 600
  - Meta font size 9.5px / `--text-very-muted`
  - Grid columns: `auto 1fr auto auto` (icon · info · type-pill · last-used)
- Right-aligned last-used timestamp at 9.5px / 600 / `--text-very-muted`, min-width 28px.

### GroupHeader (D2GroupHeader)
- Body-part section divider, sticky.
- `padding: 8px 14px`, `background: var(--bg-surface)`, top + bottom 1px `--border-subtle`.
- 4×11 colored bar (using `--cat-*` body-part colors) + uppercase body-part name (11px / 700 / `--text-muted`) + count (10px / 600 / tabular-nums / `--text-very-muted`).
- Right side: chevron-down icon at 9px / `--text-very-muted` to indicate the group is collapsible.

### TypeIcon
- Colored icon tile for an equipment type. 28–40px depending on context.
- Background: `var(--equip-<type>-bg)`, color: `var(--equip-<type>)`, border-radius 7–12px.
- Icon glyph: FontAwesome. Suggested mapping:
  - Plate-Loaded → `fa-cog`
  - Selectorized → `fa-th-list`
  - Machine (generic) → `fa-cogs`
  - Cable → `fa-link`
  - Bench → `fa-couch`
  - Rack → `fa-archway`
  - Barbell → `fa-grip-lines`
  - Dumbbell → `fa-dumbbell`
  - Cardio → `fa-heart-pulse`
  - Bodyweight → `fa-child-reaching`

### TypePill
- Small inline pill labeling an equipment type. Use the existing `.equip-row__type-pill` class with type modifier (`.equip-row__type-pill--plate-loaded`, etc.). The modifier classes already exist in `equipment-library.css`. Add `--cardio` and `--bodyweight` modifiers if missing.

### CheckRow (D2CheckRow)
- Multi-select row for the quick-add sheet.
- Grid columns: `auto auto 1fr auto` (checkbox · icon · info · type-pill).
- Checkbox: 20×20, 5px radius, 1.5px border. Unchecked: transparent fill, `--border-light` border. Checked: `--primary` fill, `--primary` border, `#04201a` check glyph.
- Checked row gets `background: rgba(29,211,176,0.05)`.
- Disabled (already-tagged) row: 50% opacity, checkbox shows muted check.

### OrphanRow
- See History Reconciliation screen above.
- Suggestion preview is a callout with `rgba(29,211,176,0.06)` background, `--primary-border` border, 8px radius, magic-wand icon in `--primary`.

### ExerciseRow + ExerciseDetail
- ExerciseRow: same grid structure as EquipmentRow but trailing cell is `PR / lastUsed` instead of `type-pill / lastUsed`.
- ExerciseDetail: same stat grid + section card pattern as MachineDetail. The "Equipment that does this" section is the inverse mapping — query the equipment library for items whose `exercises` array includes this exercise name.

## Interactions & Behavior

### Navigation flows

| From → To | Trigger |
|-----------|---------|
| Landing → Gym Detail | Tap any gym card |
| Landing → History | Tap the amber orphan banner (entire row, not just "Review →") |
| Gym Detail → Quick-add sheet | Tap "+ Add" in header |
| Gym Detail → Machine Detail | Tap any equipment row |
| Quick-add sheet → close | Tap "Cancel", or tap "[N] Add to gym" (commits + toast) |
| Machine Detail → back | Tap back button (browser back stack or `popstate`) |
| Browse → Brand Detail | Tap brand tile (out of scope) |
| Browse → Machine Detail | Tap a row in "Popular at <gym>" |
| Library toggle (any screen) → Exercise Library | Tap "Exercises" segment |
| Exercise Library → Exercise Detail | Tap any exercise row or suggested chip |
| Exercise Detail → Machine Detail | Tap a row in "Equipment that does this" |
| Exercise Detail → Active workout add | Tap "+ Add to workout" |

### Quick-add multi-select

- State: `Set<equipmentId>` of newly-checked items.
- Tapping a row toggles its presence in the set. Counter on the Add button updates live.
- Already-tagged rows are not toggleable.
- Confirming Add: bulk-write all new items to the current gym's inventory in one transaction. Show toast on success: `Added N machines to <gym>`.

### History reconciliation actions

- **Link** (suggestion): writes a `nameAlias` mapping (`oldName → libraryItemId`) and rewrites all historical references. Existing logic likely lives in `js/core/data/data-manager.js` or `js/core/features/equipment-planner.js`.
- **Add**: creates a new equipment entry from the orphan name. Open the existing add-equipment stepped form, prefilled with the orphan name.
- **Skip**: marks as `ignored: true` so it doesn't show up in the banner again this session (but remains for future review).
- **Auto-link all**: writes every suggestion-bearing orphan as a Link in one transaction. Show confirmation modal first.

### Bottom-anchored CTAs

Wherever a primary action exists (Gym Detail + Add, Exercise Detail + Add to workout, Quick-add + Add to gym), it lives in a sticky bottom bar with `padding: 10px 14px 14px`, `background: rgba(13,18,24,0.96)` (semi-transparent `--bg-surface`), top border `1px solid var(--border-subtle)`. Primary button uses the existing `.btn-primary` pattern: `--primary` background, `#04201a` text, 999px radius, 13.5px / 800 / `--font` text. Add an 8px / 24px primary shadow: `box-shadow: 0 8px 24px rgba(29,211,176,0.30)`.

### Animations

- Sheet open/close: 280ms cubic-bezier(0.32, 0.72, 0, 1) translateY. Match existing `openSheet()` behavior.
- Toast: 280ms ease-out fade + 8px translate from below. Auto-dismiss at 1800ms.
- Tab/chip toggles: 100ms color transition (use `--anim-fast` already in tokens).
- Row press: existing `.equip-row:active { background: var(--bg-card-hover) }` is fine.

### Empty states

- No gyms yet → CTA "Add your first gym" using the same dashed dotted style as the prototype's "+ Add a gym" button.
- No equipment in a gym → CTA "Start adding equipment" linking directly into the quick-add sheet.
- Library tab with zero results from a filter → existing `.empty-state` pattern from `styles/components/empty-states.css`.

## State Management

This integrates with the existing `AppState` (vanilla JS object) and Firestore. Key state additions:

- `AppState.equipmentLibrary.activeTab` — `'gyms' | 'library' | 'catalog'`
- `AppState.equipmentLibrary.activeGymId` — currently-detailed gym
- `AppState.equipmentLibrary.bpFilter` — currently-selected body part chip
- `AppState.equipmentLibrary.orphans` — array fetched from the existing scan logic
- `AppState.equipmentLibrary.quickAddSelection` — `Set<equipmentId>` of in-progress quick-adds
- `AppState.exerciseLibrary.activeTab` — `'all' | 'favs' | 'recent' | 'custom'`

Data already exists:
- Equipment items: existing `getUserEquipment()` from `firebase-workout-manager.js`
- Exercises: existing `getExerciseLibrary()` from `firebase-workout-manager.js`
- Gym suggestions: existing `rankExercisesForLocation()` from `equipment-planner.js`
- Current gym: existing GPS location stamping (already used for workout history)

Render functions to add/refactor (mirror existing `dashboard-ui.js` style):
- `renderEquipmentLanding()` → `js/core/ui/equipment-library-ui.js`
- `renderGymDetail(gymId)` → same file
- `renderQuickAddSheet(gymId)` → same file
- `renderMachineDetail(itemId)` → same file
- `renderHistoryReconciliation()` → same file
- `renderBrowseCatalog()` → same file
- `renderExerciseLibrary()` → already exists in `js/core/workout/workout-management-ui.js` line 335 — heavily refactor
- `renderExerciseDetail(exId)` → new, in `js/core/ui/exercise-library-ui.js` (split out of workout-management-ui.js)

## Design Tokens

**All tokens already exist in `styles/tokens.css`.** Map prototype hex codes to tokens:

### Surfaces
- `#05070b` → `--bg-app`
- `#0d1218` → `--bg-surface`
- `#111820` → `--bg-card`
- `#172030` → `--bg-card-hi`
- `#1a2028` → `--bg-tertiary`

### Text
- `#f6f9ff` → `--text-strong`
- `#c4cad4` → `--text-main` / `--text-primary`
- `#b0b8c1` → `--text-muted`
- `#9aa3ad` → `--text-secondary`
- `#6b7785` → introduce as `--text-very-muted` (used in prototype; doesn't exist yet — add as a new token rather than hardcoding)

### Primary + state
- `#1dd3b0` → `--primary`
- `#0fa48a` → `--primary-dark`
- `rgba(29,211,176,*)` → `--primary-bg-*` family (already defined for 0.05/0.12/0.20/0.30/0.25/0.45/0.70)
- `#f7a865` → `--highlight-warm`
- `#f0c24b` → `--warning`
- `#36c46b` → `--success`
- `#e35d6a` → `--danger`
- `#ffd700` → `--badge-gold`

### Equipment-type colors
All already exist in `tokens.css`: `--equip-plate-loaded`, `--equip-selectorized`, `--equip-machine`, `--equip-cable`, `--equip-bench`, `--equip-rack`, `--equip-cardio`, `--equip-bodyweight`, `--equip-barbell`, `--equip-dumbbell`, `--equip-other`. All have matching `-bg` variants at 15% alpha.

### Body-part colors
Already defined: `--cat-push` `--cat-pull` `--cat-legs` `--cat-shoulders` `--cat-arms` `--cat-core` `--cat-cardio`. In the prototype these are referenced as `chest/back/legs/...`; map them to push/pull/legs/shoulders/arms/core/cardio respectively (chest≈push for the strip color, back≈pull).

### Spacing
All from `--space-2` through `--space-80` already exist. The prototype uses:
- Card padding: `--space-12` x / `--space-10` y (compact rows) or `--pad-card-x` / `--pad-card-y` (regular)
- Page padding: `--pad-page` (18px) — but Pocket Inventory deliberately overrides to 14px for the dense list. Either add a new `--pad-page-compact: 14px` or use `var(--space-12)` directly.

### Radii
All exist: `--radius-2xs` 2px, `--radius-xs` 4px, `--radius-sm` 12px, `--radius-md` 16px, `--radius-lg` 20px, `--radius-pill` 999px. **Note** that the prototype uses 7–14px radii for some cards/rows — these are between `--radius-xs` and `--radius-sm` in the existing scale. Suggest adding `--radius-8: 8px`, `--radius-10: 10px`, `--radius-14: 14px` to the scale, or rounding to `--radius-sm` (12px) where feasible.

### Typography
All from `--font-2xs` (0.65rem) through `--font-3xl` (2.5rem). The prototype uses px values in the 9–22px range; map to the existing rem-based tokens. Headings use `--font-display-sm` (1.4rem) and `--font-display` (2rem) with `--font-display-weight` (800).

## Files in This Package

The HTML/JSX files in this bundle are **reference implementations** of the designs, not production code.

| File | Description |
|------|-------------|
| `Pocket Inventory Prototype.html` | The clickable entry point. Open this in a browser. |
| `Equipment Library Explorations.html` | Side-by-side comparison of 5 design directions (Tag & Go, Pocket Inventory, Color Atlas, Body Map, Floorwalker) — included for context on the alternatives considered. |
| `equipment/shared.jsx` | Shared phone frame, tokens (mirror of `tokens.css`), and primitives: `PageHeader`, `Chip`, `TypeIcon`, `TypePill`, `BPDot`, `BottomNav`, `ScrollArea`, `SheetHandle`. |
| `equipment/data.jsx` | Mock data: gyms, brands, items, orphans, body parts. **Not part of production data; for visual reference only.** |
| `equipment/dir2-pocket-inventory.jsx` | All six Equipment Library screens (Landing, GymDetail, QuickAdd, MachineDetail, History, Browse). |
| `equipment/exercise-lib.jsx` | Exercise Library + Exercise Detail. |
| `equipment/prototype.jsx` | Prototype shell: screen stack + nav handlers + toast. |
| `tweaks-panel.jsx` | The in-prototype tweaks panel (not production). |

## Implementation Order Suggestion

1. **Token / class audit.** Add `--text-very-muted`, `--pad-page-compact`, and any intermediate radii. Add `--equip-*` modifier classes to `.equip-row__type-pill` for cardio + bodyweight if missing.
2. **Library toggle + Compact tabs** as shared components (`styles/components/library-tabs.css`).
3. **Refactor `renderEquipmentLibrary()`** to emit the three-tab IA. Wire `My gyms` first; reuse existing equipment row rendering for `Library` and reuse the existing brand-section rendering for `Catalog`.
4. **Gym detail page** as a new render function. Reuse `.equip-row` with the compact modifier.
5. **Quick-add sheet** as the next milestone — extend `openSheet()`. Wire `Add` to a Firestore batch write.
6. **Machine detail page** — already partially exists; restyle stat grid and add the Notes section.
7. **History reconciliation page** — refactor the existing `scan-banner` + `scan-review` blocks (already in `equipment-library.css`) to support the Add / Link / Skip three-action pattern.
8. **Browse catalog** — mostly reuses existing brand-section / line-header / equip-row infrastructure.
9. **Exercise Library refactor** — split `renderExerciseLibrary()` out of `workout-management-ui.js` into a new `exercise-library-ui.js`. Add the four-tab strip, the library toggle, the equipment-type icon on each row, and the suggested-chips section.
10. **Exercise Detail page** — new. Mirror Machine Detail's stat grid + section card pattern.

## Open Questions for Implementation

These didn't get resolved in design and are worth a quick conversation before implementation:

1. **Gym detail page navigation** — design assumes drill-down to a new screen. Confirm vs the alternative (bottom sheet) given existing navigation patterns.
2. **Catalog tab — brand detail destination.** The design shows a tappable brand tile but doesn't spec the brand detail screen. Reuse `.brand-header` / `.line-header` / `.equip-row` exactly as the current "By Brand" view does.
3. **Equipment-type taxonomy.** The brief mentions Plate-Loaded vs Selectorized vs Cable etc. as a primary axis. Confirm the `type` field is already present on every equipment record, or whether a backfill migration is needed.
4. **Quick-add transaction size.** Batch-add of 10–30 machines should be one Firestore write. Confirm against the equipment collection's existing write patterns.
5. **Orphan auto-link confidence threshold.** "Auto-link all" should only fire for suggestions above some confidence — pick a threshold (suggest 0.85) and surface it in the confirm modal ("Auto-link N suggestions ≥85% confident — 2 lower-confidence skipped").

---

**Questions about the design?** The prototype is the source of truth — open `Pocket Inventory Prototype.html` in a browser and tap through the flows. Every screen renders inside a real phone-sized frame (375 × 812) with the same dark theme + token mapping as the production app.

---

# Appendix A — Real Data Shapes

These are the actual Firestore shapes returned by the existing data layer. **Use these field names exactly.** Do not invent new fields.

## Equipment record

Source: `BigSurf-B/js/core/data/firebase-workout-manager.js:1024` (`saveEquipment`).

```ts
{
  id: string,                              // e.g. "equipment_1714073921_abc12"
  name: string,                            // e.g. "Incline Chest Press 2"
  brand: string | null,                    // e.g. "Newtech" or "Unknown"
  line: string | null,                     // e.g. "Origin" or null
  function: string | null,                 // canonical function (display fallback for name)
  equipmentType: 'Plate-Loaded' | 'Selectorized' | 'Machine' | 'Cable' | 'Barbell'
               | 'Dumbbell' | 'Bench' | 'Rack' | 'Cardio' | 'Bodyweight' | 'Other',
  baseWeight: number,                      // e.g. 45 (lbs for bench bar)
  baseWeightUnit: 'lbs' | 'kg',
  locations: string[],                     // gym names — multi-gym aware
  exerciseTypes: string[],                 // e.g. ["Bench Press", "Incline Press"]
  exerciseVideos: { [exerciseName: string]: string }, // per-exercise form video URL
  notes: string,
  createdAt: string,                       // ISO timestamp
  lastUsed: string,                        // ISO timestamp, sorted desc by getUserEquipment()
  version: 2,
}
```

**Field-to-design mapping:**

| Design term | Field |
|-------------|-------|
| Machine name | `name`, falling back to `function` if you want the canonical label (existing rendering uses `function \|\| name`) |
| "Brand · line" subtitle | `brand` + `line`, both nullable |
| Type pill | `equipmentType` — maps to `--equip-{lowercased-hyphenated}` token |
| "At these gyms" list | `locations[]` — array of gym names. **Note:** these are plain strings today, not document references. The "gym" concept in the design uses these strings; no separate gym collection exists yet (see Open Question #6 below). |
| Exercises this machine supports | `exerciseTypes[]` |
| Form video link | `exerciseVideos[exerciseName]` |
| Notes section | `notes` |
| Last-used timestamp | `lastUsed` (ISO) — convert to relative ("3d", "Mon", "2 wk") at render time |
| Sessions count | **Does not exist on the equipment record.** Compute from `getUserWorkouts()` by counting workouts whose `exercises[*].equipment === eq.name`. Memoize per render. |
| PR | Also computed — read `PRTracker.loadPRData()` then filter to PRs whose exercise is in `eq.exerciseTypes`. |

## Exercise record

Source: `BigSurf-B/js/core/data/firebase-workout-manager.js:494` (`saveExercise`), also lines 181/418.

```ts
{
  id: string,
  name: string,                            // "Bench Press"
  bodyPart: 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Core' | 'Cardio' | 'Multi-Use',
  equipmentType: <same enum as above>,     // primary equipment type
  isCustom?: boolean,                      // true if user-created
  isFavorite?: boolean,
  tags?: string[],                         // ["chest", "barbell"]
  notes?: string,
}
```

**Field-to-design mapping:**

| Design term | Field |
|-------------|-------|
| Body-part chip | `bodyPart` |
| Equipment-type icon on row | `equipmentType` |
| Star (favorite) | `isFavorite` |
| Equipment subtitle on row | Computed: `await wm.getEquipmentForExercise(ex.name)` returns the equipment records whose `exerciseTypes[]` includes this exercise. Use the first or join names with `·`. Cache per session. |
| PR | From `PRTracker.getPRsForExercise(ex.name)` |
| Last-used | From last workout containing this exercise; computed across `AppState.workouts`. |

## "Orphan" record (history reconciliation)

Source: `BigSurf-B/js/core/ui/equipment-library-ui.js:184` (`scanForUnlinkedEquipment`).

```ts
{
  name: string,                            // the raw string from workout history
  exercises: Set<string>,                  // exercise names this orphan was used with
  locations: Set<string>,                  // gyms where it was used
  count: number,                           // total sessions
}
```

There is **no `suggestion` field** in the production data today — that's a design addition. To populate it, run a fuzzy match against `allEquipment.map(e => e.name)` and keep the top candidate if its Levenshtein/Dice score exceeds a threshold (suggest 0.6). Store the suggestion in a derived map; don't persist it.

## Gym / location

**There is no `gyms` collection.** The "gym" concept on screen is currently just the `locations[]` array of strings on each equipment record, cross-referenced against `eq.location` on workouts. The new design assumes a richer gym entity (name, city, machine count, lastVisit, isCurrent). **You have two options:**

1. **Cheap path:** keep gym strings as the source of truth. Compute the gym list by `Set(allEquipment.flatMap(e => e.locations))`. Compute counts by `allEquipment.filter(e => e.locations.includes(gymName)).length`. Compute lastVisit from `getUserWorkouts()`. Compute `isCurrent` from existing GPS logic. **No schema change required.** This is the recommended path for v1.
2. **Future:** introduce a proper `users/{uid}/gyms` subcollection with `{ name, address, lat, lng, createdAt }`. Out of scope for this redesign.

# Appendix B — Render Template Examples

Existing pattern: render functions return innerHTML strings, are called from a switch in `equipment-library-ui.js` or `dashboard-ui.js`, and rely on event delegation or inline `onclick=` handlers (matching the codebase style — do not introduce React).

## Gym Card

```js
function renderGymCard(gym) {
  // gym = { name, city, lastVisit, count, isCurrent, typeMix: [{ type, count }, ...] }
  const mixBar = gym.typeMix.map(m =>
    `<div class="gym-card__mix-seg gym-card__mix-seg--${slugType(m.type)}" style="flex:${m.count}"></div>`
  ).join('');

  const legend = gym.typeMix.slice(0, 4).map(m => `
    <span class="gym-card__legend-item">
      <span class="gym-card__legend-dot gym-card__legend-dot--${slugType(m.type)}"></span>
      <span class="gym-card__legend-label">${escapeHtml(typeShortLabel(m.type))}</span>
      <span class="gym-card__legend-count">${m.count}</span>
    </span>
  `).join('');

  return `
    <button class="gym-card${gym.isCurrent ? ' is-here' : ''}"
            onclick="openGymDetail('${escapeAttr(gym.name)}')"
            aria-label="${escapeAttr(gym.name)}, ${gym.count} machines">
      <div class="gym-card__head">
        <div class="gym-card__info">
          <span class="gym-card__name">${escapeHtml(gym.name)}</span>
          ${gym.isCurrent ? '<span class="gym-card__here-pill">HERE</span>' : ''}
          <span class="gym-card__meta">${escapeHtml(gym.city || 'No location')} · ${escapeHtml(gym.lastVisit)}</span>
        </div>
        <span class="gym-card__count">${gym.count}</span>
        <i class="fas fa-chevron-right gym-card__chev"></i>
      </div>
      <div class="gym-card__mix" aria-hidden="true">${mixBar}</div>
      <div class="gym-card__legend">${legend}</div>
    </button>
  `;
}
```

Companion CSS (new file: `styles/components/gym-card.css`):

```css
.gym-card {
  appearance: none;
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid transparent;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
}
.gym-card.is-here { border-left-color: var(--primary); }
.gym-card:active { background: var(--bg-card-hover); }
.gym-card__head { display: flex; align-items: center; gap: 10px; }
.gym-card__info { flex: 1; min-width: 0; }
.gym-card__name { font-size: var(--font-sm); font-weight: 700; color: var(--text-strong); }
.gym-card__here-pill {
  display: inline-block; margin-left: 6px;
  padding: 1px 5px; border-radius: 4px;
  background: var(--primary); color: var(--text-on-accent);
  font-size: 8.5px; font-weight: 800; letter-spacing: 0.04em;
}
.gym-card__meta { display: block; font-size: var(--font-2xs); color: var(--text-very-muted); margin-top: 2px; }
.gym-card__count {
  font-size: 18px; font-weight: 800;
  color: var(--text-strong);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.gym-card__chev { font-size: 10px; color: var(--text-very-muted); margin-left: 4px; }

.gym-card__mix {
  display: flex; height: 6px; border-radius: 4px;
  overflow: hidden; margin-top: 8px;
}
.gym-card__mix-seg { opacity: 0.85; }
.gym-card__mix-seg--plate-loaded  { background: var(--equip-plate-loaded); }
.gym-card__mix-seg--selectorized  { background: var(--equip-selectorized); }
.gym-card__mix-seg--cable         { background: var(--equip-cable); }
.gym-card__mix-seg--rack          { background: var(--equip-rack); }
.gym-card__mix-seg--bench         { background: var(--equip-bench); }
.gym-card__mix-seg--cardio        { background: var(--equip-cardio); }
.gym-card__mix-seg--other         { background: var(--equip-other); }
/* (plus barbell / dumbbell / bodyweight / machine) */

.gym-card__legend { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
.gym-card__legend-item { display: inline-flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 600; }
.gym-card__legend-dot { width: 6px; height: 6px; border-radius: 2px; }
.gym-card__legend-dot--plate-loaded { background: var(--equip-plate-loaded); }
.gym-card__legend-dot--selectorized { background: var(--equip-selectorized); }
/* ... repeat for each type */
.gym-card__legend-label { color: var(--text-muted); }
.gym-card__legend-count { color: var(--text-very-muted); font-variant-numeric: tabular-nums; }
```

## Compact Tabs

```js
function renderCompactTabs(active, counts) {
  // counts = { gyms: 4, library: 89, catalog: '1.3k' }
  const tabs = [
    { id: 'gyms',    label: 'Gyms' },
    { id: 'library', label: 'Library' },
    { id: 'catalog', label: 'Catalog' },
  ];
  return `
    <div class="compact-tabs" role="tablist">
      ${tabs.map(t => `
        <button class="compact-tabs__tab${active === t.id ? ' is-active' : ''}"
                role="tab" aria-selected="${active === t.id}"
                onclick="setEquipmentTab('${t.id}')">
          ${t.label}
          <span class="compact-tabs__count">${counts[t.id] ?? 0}</span>
        </button>
      `).join('')}
    </div>
  `;
}
```

CSS (`styles/components/compact-tabs.css`):

```css
.compact-tabs {
  display: flex; gap: 16px;
  padding: 4px 16px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.compact-tabs__tab {
  appearance: none; background: transparent; border: 0;
  padding: 8px 0 6px;
  color: var(--text-very-muted);
  font-size: 13px; font-weight: 700; font-family: inherit;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  display: flex; align-items: center; gap: 5px;
}
.compact-tabs__tab.is-active {
  color: var(--text-strong);
  border-bottom-color: var(--primary);
}
.compact-tabs__count {
  font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums;
  padding: 1px 6px; border-radius: var(--radius-pill);
  background: var(--muted-bg);
  color: var(--text-very-muted);
}
.compact-tabs__tab.is-active .compact-tabs__count {
  background: var(--primary-bg);
  color: var(--primary);
}
```

## Library Toggle

```js
function renderLibraryToggle(current) {
  return `
    <div class="lib-toggle" role="tablist">
      <button class="lib-toggle__seg${current === 'exercises' ? ' is-active' : ''}"
              role="tab" aria-selected="${current === 'exercises'}"
              onclick="navigateTo('exercise-library')">Exercises</button>
      <button class="lib-toggle__seg${current === 'equipment' ? ' is-active' : ''}"
              role="tab" aria-selected="${current === 'equipment'}"
              onclick="navigateTo('equipment-library')">Equipment</button>
    </div>
  `;
}
```

Reuses `.equip-view-toggle` shape from existing `equipment-library.css`. Rename to `.lib-toggle` so both libraries can use it.

## Compact Equipment Row (modifier on `.equip-row`)

Reuse the existing `.equip-row` template (`equipment-library-ui.js:583–600`). Add a `.equip-row--compact` modifier:

```css
.equip-row--compact {
  padding: 8px 14px;
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 10px;
}
.equip-row--compact .equip-row__icon {
  width: 28px; height: 28px;
  border-radius: var(--radius-xs);   /* 4 → bump to 7 with new --radius-7 token if added */
  font-size: 12px;
}
.equip-row--compact .equip-row__name { font-size: 12.5px; font-weight: 600; }
.equip-row--compact .equip-row__meta { font-size: 9.5px; }
.equip-row--compact .equip-row__last { font-size: 9.5px; color: var(--text-very-muted); font-weight: 600; min-width: 28px; text-align: right; }
```

# Appendix C — Accessibility

The current app is mobile-only with thumb interactions. Audit each new component against:

| Requirement | Spec |
|-------------|------|
| **Touch target size** | ≥ 44 × 44 CSS px for any tappable element (Apple HIG). Compact rows are 38px tall — pad the surrounding `<button>` to 44px minimum with internal flex centering, OR add 6px transparent padding inside the button without inflating visual height. |
| **Text contrast** | Body text on `--bg-card`: `--text-main` (#c4cad4) gives 11.3:1 (✓). Muted text on `--bg-card`: `--text-very-muted` (#6b7785) gives 4.8:1 (✓ AA only). Do **not** use very-muted for anything <11px. |
| **Color isn't the only signal** | Type pills carry the equipment type by both color AND label text. ✓. Body-part dots in dense rows are also labeled in the group header. ✓. Type-mix bars on gym cards have a labeled legend below ✓. The "HERE" badge for current gym uses both color + the literal text "HERE" ✓. |
| **Focus state** | Tab/keyboard nav isn't a v1 concern (mobile-only), but for any element that uses `<button>`, the default browser focus ring should not be removed. Add `:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }` where the default is suppressed. |
| **Semantic markup** | Use `<button>` for any tappable row. Tabs need `role="tab"` + `aria-selected`. Chips that toggle filters need `aria-pressed`. The bottom-sheet root needs `role="dialog"` + `aria-modal="true"` + `aria-labelledby`. |
| **Screen reader labels** | The gym card mix-bar + legend is decorative for SR users; mark the bar with `aria-hidden="true"`. The button itself gets an `aria-label` summarizing the card ("Absolute Recomp, 47 machines, you are here"). |
| **Reduced motion** | Wrap sheet open/close + toast transitions in `@media (prefers-reduced-motion: no-preference)` so the system honors the user setting. |

# Appendix D — Migration / Cleanup

This redesign is the right moment to delete code identified as dead by the existing `design-critique-system.md` audit:

1. **Delete `styles/pages/dashboard.css` V1 dead selectors** (`.streak-box`, `.in-progress-card`, `.suggested-card`, `.pr-item-new`, etc.) — ~25 KB CSS reduction. Per the audit, these are no longer rendered by V2 dashboard render functions.
2. **Tokenize raw font sizes in `dashboard-v2.css`** — eight raw `rem` values (0.56, 0.58, 0.62, 0.74, 0.82, 0.95, 1.25, 0.9) replaced with `--font-*` tokens. New tokens may be needed: `--font-3xs` (0.56rem) and `--font-md-plus` (0.95rem).
3. **Add new tokens** to `tokens.css`:
   - `--text-very-muted: #6b7785;` (in use throughout the new design)
   - `--radius-8: 8px;`, `--radius-10: 10px;`, `--radius-14: 14px;` (intermediate values for the new components)
   - `--pad-page-compact: 14px;` (for the dense rows)
4. **Add `.equip-row__type-pill--cardio` and `--bodyweight` modifiers** to `equipment-library.css` if missing.
5. **Split `js/core/workout/workout-management-ui.js`** — extract `renderExerciseLibrary()` / `openExerciseLibrary()` / `filterExerciseLibrary()` / `closeExerciseLibrary()` into a new `js/core/ui/exercise-library-ui.js`. The current location couples library rendering to workout management, which makes the redesign awkward.
6. **Remove inline-style violations in `dashboard-ui.js`** (~13 per the critique). Same pass should land on `equipment-library-ui.js` (some inline styles in the function picker + add-flow).

# Appendix E — Acceptance Criteria (per screen)

Use these as PR review checklists / QA scripts.

### Equipment Landing
- [ ] Title "Library" at 22px / 800 / `--text-strong`.
- [ ] Library toggle pill segments are full-width (50/50 split).
- [ ] Compact tabs row shows `Gyms · Library · Catalog` with live count chips.
- [ ] When orphans > 0, amber banner appears between tabs and stat strip. **Entire row tappable**, not just "Review →".
- [ ] Stat strip cards are equal-width via `1fr 1fr 1fr 1fr` grid. Orphans card uses warning bg when count > 0.
- [ ] Gym cards: current GPS gym gets `border-left: 3px solid var(--primary)` and a "HERE" pill in the title row.
- [ ] Mix bar segments render in a stable order (Plate-Loaded → Selectorized → Cable → Rack → Bench → Cardio → Other); a gym with only one type still gets a single full-width segment.
- [ ] Mix bar **legend always labels each colored dot** with its type name (the bug we caught in design review).
- [ ] Tapping a gym card navigates to Gym Detail.
- [ ] No empty state needed in v1 unless `gyms.length === 0` — then show "Add your first gym".

### Gym Detail
- [ ] Header back button is 30×30, returns to landing.
- [ ] Title (gym name) wraps to one line with ellipsis on overflow.
- [ ] Meta line reads `N machines · M brands · {relative lastVisit}`.
- [ ] "+ Add" pill in the header opens the Quick-add sheet bound to this gym.
- [ ] Body-part chip strip scrolls horizontally; first chip is "All" and is active by default. Each chip shows a count.
- [ ] Equipment list groups by body-part with the colored bar in each group header.
- [ ] Selecting a body-part chip filters the list AND scrolls to top.
- [ ] Each equipment row is tappable (entire row), navigates to Machine Detail.
- [ ] Right edge of row shows `lastUsed` relative timestamp (e.g. "3d", "Mon", "2 wk").
- [ ] Empty state when filter returns 0 results: show existing `.empty-state` block.

### Quick-add Sheet
- [ ] Sheet opens from bottom, animated 280ms cubic-bezier(0.32, 0.72, 0, 1).
- [ ] Search input auto-focuses on open (keyboard rises within ~100ms).
- [ ] Sheet root has `role="dialog" aria-modal="true"`.
- [ ] "Cancel" link dismisses without writes; back-gesture also dismisses.
- [ ] Result count to the right of search input updates as user types.
- [ ] Tapping a row toggles its presence in the selection set; visual: `background: rgba(29,211,176,0.05)` on selected rows.
- [ ] Already-tagged rows are non-toggleable, 50% opacity, subtitle reads "Already at this gym".
- [ ] "Add to gym" button shows live count in a black pill on the left. Disabled when count = 0.
- [ ] Tapping Add writes all new rows in a **single Firestore batch** to `users/{uid}/equipment/*`. On error, toast "Couldn't save — try again"; preserve selection state.
- [ ] On success: dismiss sheet, navigate back to gym detail, fire toast "Added N machines to {gym}".
- [ ] Search input + chip filters are AND'd together (typing "incline" with "Chest" active narrows to chest machines matching "incline").

### Machine Detail
- [ ] Stat grid shows Sessions / PR / Last (3-up).
- [ ] Sessions count comes from real workout history (see Appendix A note).
- [ ] PR card reads from `PRTracker` data.
- [ ] Tag row contains TypePill + body-part chip + "N locations" muted chip.
- [ ] Exercises section: each row tappable → exercise detail.
- [ ] At-these-gyms section: current gym gets `--primary` icon tint + "HERE" badge.
- [ ] Notes section is editable in place (existing `saveEquipmentNotes` handler).
- [ ] Edit button in header opens the existing edit-equipment flow.

### History Reconciliation
- [ ] Page header: back + title + subtitle + "Auto-link all" pill in `--primary-bg` / `--primary`.
- [ ] Each orphan row displays the name in quotes + context line ("Bench Press · 14 sessions").
- [ ] When `suggestion` exists: inline preview row in `rgba(29,211,176,0.06)` background showing `→ <suggestion>`.
- [ ] Right-side primary action is `Link` (when suggestion exists) or `Add new` (when not).
- [ ] Tapping Link writes a name alias and refreshes the orphan list (the just-linked row animates out).
- [ ] Tapping Add opens the existing add-equipment flow with `name` prefilled.
- [ ] Skip dismisses the row for this session only (in-memory `dismissedUnlinked` Set — already exists).
- [ ] Auto-link all triggers a confirm modal: "Auto-link N suggestions ≥85% confident — M skipped".
- [ ] Empty state when no orphans: page is unreachable (banner shouldn't appear on landing either).

### Browse Catalog
- [ ] Tabs row shows "Catalog" active.
- [ ] Brand grid is a 3-column grid of tiles.
- [ ] Each brand tile shows brand name + "N lines · {country}".
- [ ] Tapping a tile drills into the existing brand-section view (reuses `.brand-header` / `.line-header` / `.equip-row`).
- [ ] "Popular at {current gym}" section lists 6–8 top-used machines at the GPS-detected gym. Tap → Machine Detail.

### Exercise Library
- [ ] Library toggle present, segments labeled "Exercises | Equipment". "Exercises" is active.
- [ ] Four-tab strip: All / Favorites / Recent / Custom with count chips.
- [ ] Body-part chip strip below search; same component as Equipment.
- [ ] Suggested chips row shows the location pin + gym name in the header.
- [ ] Each exercise row: 28×28 equipment-type icon (tinted by exercise's primary equipment), name + optional star, equipment subtitle, right-aligned PR + last-used.
- [ ] Tapping a row → Exercise Detail.
- [ ] Search filters by name AND equipment-type string.
- [ ] Empty state in any tab uses the existing `.empty-state` block.

### Exercise Detail
- [ ] Page header: back + name + equipment subtitle + star toggle button.
- [ ] Star toggle is gold when favorited; tapping calls existing `toggleFavorite()` (or equivalent).
- [ ] Stat grid: Sessions / PR / Last. Same shape as Machine Detail.
- [ ] Recent sessions: 3 most-recent workouts that include this exercise. PR session gets `--warm-bg` flame icon.
- [ ] Used at: gyms where exercise has been performed, with session count. Current gym gets HERE badge.
- [ ] Equipment that does this: list of equipment whose `exerciseTypes[]` includes this exercise name. Tap → Machine Detail.
- [ ] Bottom action bar: "+ Add to workout" primary + 48×48 chart-line button (opens existing stats view).

# Appendix F — Updated Open Questions

Now consolidated from earlier and Appendix A:

1. **Gym entity model** (Appendix A — Gym section). Confirm cheap path (derive from `locations[]` strings) for v1.
2. **Sessions / PR fields on equipment.** Currently computed at render. Performance test against a power user (e.g. 500+ workouts × 50 machines). If slow, memoize per render or add a `_computedAt` cache key invalidated on workout save.
3. **Brand-detail screen.** Reuses existing `.brand-header` / `.line-header` / `.equip-row` patterns. Confirm no redesign needed there.
4. **`equipmentType` taxonomy gaps.** Audit existing data: which `equipmentType` values appear in production? The enum in `EQUIPMENT_TYPE_ICONS` (equipment-library-ui.js:39) has 11 entries; the older `EQUIPMENT_TYPES` const in `exercise-manager-ui.js:39` only has 5 (`Machine, Cable, Dumbbell, Barbell, Bodyweight`). Confirm whether existing custom exercises stored under the older taxonomy need a migration.
5. **Orphan auto-link confidence threshold.** Suggest 0.85 (Levenshtein normalized). Surface the threshold in the confirm modal so QA can verify behavior at the boundary.
6. **Quick-add row data source.** Where does the catalog come from? Currently the "By Brand" view in `equipment-library-ui.js` only shows equipment the user has already saved. The brief calls for browsing **1,300+ machines they haven't added yet**. A global catalog dataset must exist somewhere — confirm location (`data/equipment-catalog.json`?) and load path.
7. **Tab persistence.** Should `equipmentLibrary.activeTab` persist across navigation? Current dashboard tabs reset on app reopen — match that behavior.

