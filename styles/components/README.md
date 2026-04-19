# Components Quick Reference

**Before writing new CSS**, check here to see if a pattern already exists. The rules this enforces are pinned in [CLAUDE.md § Design System Rules](../../CLAUDE.md).

## When you need…

| You need… | Use | File |
|---|---|---|
| A list item with `[icon][title/subtitle][trailing]` | `.row-card` (+ modifier) | [cards.css](cards.css) |
| A one-prominent-card-per-metric hero | `.hero-card` | [cards.css](cards.css) |
| A section header inside a full-page view (back arrow + title + action) | `.page-header` + `.page-header__back` / `__title` / `__save` | [page-header.css](page-header.css) |
| A legacy pinned header using `<h2 class="section-title">` | `.section-header-row` + `.section-title` | [page-header.css](page-header.css) |
| A section label between fields in a form | `.sec-head` (+ optional `.count` / `.sec-head__action`) | [page-header.css](page-header.css) |
| A horizontal chip/pill selector | `.chip` (+ `.chip.active`, `.chip.cat-push` / `.cat-pull` / …) | [chips.css](chips.css) |
| A search input with icon | `.field-search` (+ optional `.field-search--sticky` for modals) | [fields.css](fields.css) |
| A labeled form input | `.field` wrapping `.field-label` + `.field-input` | [fields.css](fields.css) |
| A `±` stepper for numeric input | `.stepper-card` + `.stepper-row` + `.stepper` | [fields.css](fields.css) |
| Primary solid-pill save button in page header | `.page-header__save` | [page-header.css](page-header.css) |
| Circular 36px back button in page header | `.page-header__back` | [page-header.css](page-header.css) |
| Full-width primary CTA (page footer) | `.btn-primary` (+ `.btn-full`, or inside `.page-footer`) | [buttons.css](buttons.css) |
| Compact secondary button | `.btn-secondary` + `.btn-sm` | [buttons.css](buttons.css) |
| Icon-only button (non-destructive) | `.btn-icon` (44px) or `.btn-icon-sm` (40px) | [buttons.css](buttons.css) |
| 2-4 option exclusive segmented toggle | `.segmented` with `<button>` children (add `.active`) | [segmented-control.css](segmented-control.css) |
| On/off toggle for a preference | `.toggle` with `.on` class for state | [fields.css](fields.css) |
| Grouped list of interactive rows (settings, detail pages) | `.group` + `.srow` (icon + info + optional right) | [grouped-rows.css](grouped-rows.css) |
| Settings-row with a wide control below the label | `.srow.srow--stacked` + `.srow-head` (wraps icon+info) | [grouped-rows.css](grouped-rows.css) |
| Empty state with CTA | `.empty-state` + `.empty-state__icon` / `__title` / `__desc` | [empty-states.css](empty-states.css) |
| Workout completion summary modal | `.completion-summary` + `.completion-stat` / `.completion-prs` | [completion-summary.css](completion-summary.css) |
| Floating "workout in progress" pill | `.active-pill` + `.active-pill-wrap` | [active-pill.css](active-pill.css) |
| Inline body-weight banner during a workout | `.bw-banner` (+ `.bw-banner--prompt` when unset) | [bodyweight.css](bodyweight.css) |

## Don't reinvent

These patterns have been consolidated — don't create new classes for them:

- **Rows**: not `.recent-workout-item`-style compound classes; use `.row-card` + modifier
- **Section headers**: not `.stats-section-header` / `.dash-section-head` / `.section-header` (all deleted); use the canonical patterns above
- **Search inputs**: not `.history-search-input-wrapper` / `.exercise-search-wrapper` / `.aw-sheet__search` (all migrated); use `.field-search`
- **Save button**: not `.btn-save` (migrated); use `.page-header__save`
- **Back button**: not `.btn-back` / `.back-btn` (migrated); use `.page-header__back`

## Naming

BEM-ish: `block__element--modifier`.

- **Block**: kebab-case, short prefix when screen-specific (`aw-pill`, `bp-card`, `dash-template-row`). Visual primitives unscoped (`.chip`, `.row-card`).
- **Element**: `block__element` (two underscores).
- **Modifier**: `block--modifier` (two hyphens).
- **Utility classes** (`.text-primary`, `.btn-block`, `.hidden`): exempt from BEM — they describe a property, not a component.

## Tokens (never hard-code)

All in [tokens.css](../tokens.css). A few you'll reach for:

| Category | Scale |
|---|---|
| Font size | `--font-2xs` · `--font-xs` · `--font-sm` · `--font-base` · `--font-md` · `--font-lg` · `--font-xl` · `--font-2xl` · `--font-3xl` |
| Radius | `--radius-xs` · `--radius-sm` · `--radius-md` · `--radius-lg` · `--radius-pill` |
| Space | `--space-2` … `--space-80` |
| Color | `--primary` / `-bg` / `-border` / `-dark`; `--success` / `--danger` / `--warning` (+ `-bg` / `-border` variants); `--text-strong` / `-main` / `-muted` / `-secondary` |
| Category tint | `--cat-push` / `-pull` / `-legs` / `-core` / `-cardio` / `-arms` / `-shoulders` (+ `-bg` variants) |
| State | `--state-current` / `-done` / `-incomplete` / `-cancelled` (+ `-bg` variants) |
| Animation | `--anim-fast` / `-normal` / `-slow`; `--ease-out-expo` / `-back` / `-spring` |
| Z-index | `--z-sticky` (10) · `--z-header` (100) · `--z-overlay` (350) · `--z-modal` (500) · `--z-toast` (700) |

If you want a value that doesn't exist, **add it to tokens.css** — don't inline the RGBA.

## Running the audit

```bash
node scripts/design-audit.js          # shows all metrics vs budget
node scripts/design-audit.js --list   # lists the actual offending lines
node scripts/design-audit.js --strict # exits 1 if any budget exceeded (for CI)
```

Baseline at end of Phase G (budgets — trend down as you ship):

| Metric | Current | Budget | Notes |
|---|---|---|---|
| Inline `style="..."` in JS | 161 | 170 | V2 files + specific-file extractions drove this from 333 |
| Raw `font-size` in `pages/` | 48 | 55 | V2 files are clean; legacy pages remain |
| Raw `border-radius: Xpx` in `pages/` | 6 | 10 | Mostly legacy workout.css |
| Raw `rgba()` in `pages/` | 20 | 25 | Rest-timer overlays + a few legacy tints |
| Raw `#hex` in `pages/` | 8 | 10 | Mostly dark gradients in map card / workout.css |
| Duplicate class defs (cross-file) | 27 | 30 | Falls to ~8 once deprecated workout.css is deleted |

When you beat a number, ratchet the budget in [scripts/design-audit.js](../../scripts/design-audit.js).

See [DESIGN-BACKLOG.md](../../DESIGN-BACKLOG.md) for the full refactor history + open items.
