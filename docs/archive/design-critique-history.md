# Design Critique: Workout History

**Stage:** Final polish &nbsp;·&nbsp; **Focus:** Usability & flow, visual hierarchy, consistency
**Reviewed:** `index.html` §`workout-history-section`, `styles/pages/history.css`, `js/core/workout/workout-history.js` (renderCalendar / renderRecentWorkoutsList)

---

## Overall Impression

The screen has a clear job and gets close to it: pinned header, month nav, compact calendar, list below. The biggest opportunity is **rebalancing emphasis** — the primary "+ Add Missing" button currently outranks the content the user came here to browse, and workout-day cells are too quiet to function as the page's primary visual signal. The CSS also shows the typical late-stage drift (sequential override blocks, two competing row patterns) that's worth collapsing before handoff.

---

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| **"+ Add Missing" is the only filled CTA in the header.** It's a recovery action, but it visually dominates every visit — even when the user just wants to browse history. | 🔴 Critical | Demote to an icon button (`fa-plus`) next to the search icon, or move into an overflow menu. Reserve `.btn-primary` for the page's primary intent. |
| **Calendar day cells don't look tappable.** The compact override removed the `.has-workout` background — only a 9 px icon distinguishes a workout day from a rest day. Tappability is discovered by trial. | 🔴 Critical | Restore a subtle fill on `.has-workout` (`--primary-bg-subtle` or a token tint per category), and add a faint hover/active border so the cell reads as a control, not decoration. |
| **Calendar and list aren't linked.** Tapping a calendar day jumps straight into the workout, but never highlights or scrolls the matching list row, and selecting a list item doesn't reflect back on the calendar. Two parallel paths, no shared state. | 🟡 Moderate | On day-tap, scroll the matching list item into view and apply a brief `.is-selected` highlight. Consider a "Selected: April 12" mini-header on the list when filtered. |
| **Month nav is not sticky.** Once the user scrolls into the list, they lose context for which month they're seeing and have to scroll back up to switch. | 🟡 Moderate | Pin the month nav (or a compact summary "April 2026 · 12 workouts") to the top of `.content-section-body` on scroll. |
| **Search + category filter stack vertically when expanded**, pushing the calendar below the fold the moment the user opens search. | 🟡 Moderate | Inline them as `1fr auto` (input flexes, select hugs content) at ≥360 px. Saves a row. |
| **Status pill semantics are vague.** Yellow "minus" for *incomplete* reads neutral rather than "unfinished"; red "X" for *cancelled* feels error-coded for a user choice. | 🟡 Moderate | Use `fa-circle-half-stroke` for incomplete, and a muted gray pill for cancelled (it's not an error). |
| Truncated exercise list (`max-width: 60vw`, ellipsis) gives no inline expansion. | 🟢 Minor | Acceptable for a list; the drill-in covers it. |

---

## Visual Hierarchy

- **What draws the eye first:** The green primary button in the top-right. **Wrong target** — it's a recovery action, not the user's primary goal.
- **What *should* draw the eye first:** The current month + calendar grid. Today's user goal is "find a past workout." Make the calendar the hero.
- **Reading flow:** Header → CTA → search affordance → month → calendar → legend → list heading → rows. The legend interrupts the calendar→list flow and dilutes the grid's footprint when 5–7 categories appear.
- **Emphasis problems inside the row:**
  - The 28 px status pill at the row's right edge is the brightest, highest-contrast element — but workout *name* is the most important info. Reduce the pill to 20 px (or to a 6 px left-edge accent stripe — you already have that pattern in `.history-card::before`).
  - The category icon tile (`workout-picker-icon`, ~40 px) and the status pill compete on opposite sides of the row. Pick one as the primary indicator.
- **Calendar weight inversion:** Weekday labels read louder than workout markers because the markers are 9 px and on a transparent background. Workout data should be the strongest mark on the grid.
- **Legend cost:** Up to 7 category chips + "Today" can wrap to two lines on narrow screens. The icons themselves are familiar (dumbbell, fist, running) — consider hiding the legend behind a small "What do these mean?" link, or show it only when ≥4 distinct categories appear.

---

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| `.recent-workout-item` | Defined twice (lines 415-440 and 666-679) with section 8d/8e overrides re-defining border, padding, background. | Collapse into a single canonical block. The override pattern was useful while iterating; not in a final-polish state. |
| `.calendar-container` | `--radius-lg` in §22, `--radius-md` in §8e; padding redefined twice. | One declaration, one radius token. |
| `.calendar-day.today` | §22 gives it `1px solid var(--primary)` + `--primary-bg`; §8e drops the border. | Pick one. The border helps separate "today" from "has-workout" tints — restore it. |
| `.history-card` (lines 86-149) | Appears unused (replaced by `.recent-workout-item`). | Verify and delete. |
| Card patterns | Both `.workout-picker-item` (rounded, hover, border) and `.recent-workout-item` (borderless rows) describe similar data. Per CLAUDE.md both should derive from `.row-card`. | Reuse `.row-card` or document the deliberate distinction. |
| Cancelled-state language | List uses `--danger` color; calendar uses `opacity: 0.25` (no color). Same state, two different signals. | Use the same muted gray + reduced opacity in both places. |
| `Load More` button | `style="width: 100%; margin-top: 0.75rem;"` — violates the "No inline styles in JS" rule in CLAUDE.md. | Add a `.btn-block` utility (or `.recent-workouts-load-more`) and drop the inline style. |
| `.btn-icon-sm` | 36 × 36; the rest of the app uses `--tap` (44). | Bump to 40 px or align with `--tap`. Also helps a11y (you're focusing on hierarchy, but worth flagging). |
| Workout category derivation | `renderRecentWorkoutsList` infers category from `workoutType` substring matching ("push", "chest", "shoulder"…). The calendar uses `workout.category`. | Use one source. The list should consume the canonical `category` field, not re-infer. |

---

## What Works Well

- **Empty state copy** is friendly and concrete: *"Complete a workout and it will show up here."* Good final-polish detail.
- **Borderless row list with subtle dividers** is a clean, modern pattern — matches contemporary mobile apps.
- **Per-workout meta line uses `·` separators** consistently (`relative date · 42m · 18 sets`).
- **Calendar respects `firstWorkoutDate`** — no leading empty pre-history months.
- **Pinned header honors `safe-area-inset-top`** — small but real iOS polish.
- **Dynamic legend** built from categories actually used this month avoids stale chips for categories the user doesn't train.
- **Token discipline is mostly excellent** — `var(--space-*)`, `var(--font-*)`, `var(--cat-*)` used consistently.
- **Category icons reused from `CATEGORY_ICONS`** — single source of truth for visual identity.

---

## Priority Recommendations

1. **Rebalance the header CTA.** Demote "+ Add Missing" to an icon button (or overflow menu). Browsing is the primary goal — let the content lead. (Highest-impact, low-effort.)
2. **Make workout-days unmistakably tappable.** Restore a subtle `--primary-bg-subtle` (or category-tinted) fill on `.has-workout`, bump icons from 9 px to ~12 px, give the cell a 1 px subtle hover border. The calendar exists to invite taps — make that obvious.
3. **Reweight the list row.** Reduce the status pill to a 20 px chip or a left-edge stripe; let the workout name be the loudest element. Soften the cancelled "X" to muted gray.
4. **Pin the month nav** so context survives scrolling. Adds spatial confidence in long months.
5. **Consolidate the override stack.** Merge §22 and §8a–8e into one canonical declaration per element, delete `.history-card` if unused, fix the inline `Load More` style, and align `.btn-icon-sm` with `--tap`. This is the right pre-handoff hygiene pass.
6. **Single source for category** — feed the list's row from `workout.category`, not substring inference on `workoutType`. One fewer place for the visual language to drift.
