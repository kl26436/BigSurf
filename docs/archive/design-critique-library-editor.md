# Design Critique: Workout Library + Editor

**Scope:** `workout-management-section` (library) and `template-editor-section` (editor)
**Reviewed:**
- `js/core/workout/workout-management-ui.js` (2,116 LOC)
- `js/core/ui/template-selection.js` (1,549 LOC)
- `styles/pages/templates.css` (1,167 LOC)
- `index.html` §`workout-management-section`, §`template-editor-section`, §`exercise-library-section`

Your instinct is right — this is the part of the app where the gap between old patterns and the V2 ones you've shipped is biggest. The library has two screens doing one job, and the editor has three different ways to edit an exercise that all predate the rich equipment/bodyweight/superset work you did for the active workout.

---

## Part 1 — Workout Library (`workout-management-section`)

### What exists today

**Two-screen library.** Tapping the Workouts tab lands on a 6-card category grid (Push / Pull / Legs / Cardio / Other / All) above a search field. Picking a category hides that grid and reveals a filtered list with its own sub-header and back arrow. Every visit to the library is a tap away from seeing a single template.

**Row pattern:** `.workout-list-item` — custom CSS pattern (icon tile + name + "N exercises" + truncated exercise names + an EDIT button at the right edge). The whole card is tappable to start; the EDIT button is a secondary tap target that diverges the flow.

### Key problems

| Finding | Severity | Why it matters |
|---|---|---|
| **The category grid is a tax, not a tool.** Most users have 5–15 templates total. Forcing a category-select step to see any of them is an extra tap for zero information gain. Contrast with History, where you filter-in-place. | 🔴 Critical | Power users hit "Workouts" multiple times per week. Single biggest friction source in this flow. |
| **Two tap behaviors on the same card**: body tap = start workout, EDIT button = edit. `"Tap a row to edit, play to start"` subtitle on `workout-selector` says the opposite. Two surfaces for template rows, two conventions. | 🟡 Moderate | Users don't know which one starts a workout until they've tapped both. The hesitation compounds. |
| **"EDIT" button is block-caps text**, which is visually louder than the more-common action (use / start) and violates the app's sentence-case convention elsewhere. | 🟡 Moderate | Inverts emphasis. The common action should be more prominent, not less. |
| **Search and category live at the top of two different screens.** Typing in search *from the category screen* fires `selectWorkoutCategory('')` → `renderFilteredWorkouts` via `setTimeout`, which is a back-channel into the list view. | 🟡 Moderate | Fragile glue code for a single-screen problem. |
| **Dashboard already shows "For Tuesday" recommendations** based on `getTemplatesForDayOfWeek`. The library ignores day-of-week smarts entirely. | 🟡 Moderate | The insights you've built on the dashboard should carry into the library — it's the same recommendation engine. |
| **Row metadata is duplicated text**: "6 exercises" + "Bench Press, Incline DB, Cable Fly, Lat Pulldown +2 more". The truncated names barely fit on a phone and don't scan well. | 🟡 Moderate | Muscle-group summary ("Chest · Triceps") would be more useful at a glance. |
| **No usage signal** on cards — no "Last done 3 days ago", no frequency, no est. duration. These come free from data you already have in `allWorkouts`. | 🟢 Minor | Each card is currently un-personalized. |
| **"All" and "Other" both exist as category cards.** "All" is a UI state, not a category. "Other" is a catch-all bucket. They visually occupy the same rank. | 🟢 Minor | Taxonomy leak into navigation. |
| **`.workout-list-item`, `.workout-item-icon`, `.workout-item-content`, etc.** — yet another custom row pattern instead of `.row-card`. | 🟢 Minor | Design-system violation (see the system-wide critique). |

### Recommendations — Library

1. **Collapse to a single filterable list.** Remove the category entry screen entirely. Replace it with a category pill row above the list (same pattern History uses). One screen, one scroll, one mental model.
2. **One action per row = start workout.** Move Edit, Duplicate, Delete, Reset-to-default into a kebab menu at the row's right edge (the same kebab pattern the active workout uses). Remove the block-caps EDIT button.
3. **Enrich the row** with the stats you already have:
   - Muscle groups as text ("Chest · Shoulders · Triceps") instead of a truncated exercise name list.
   - Last-done timestamp ("Last done 3 days ago") or frequency ("Usually Tuesdays") — pulled from `getTemplatesForDayOfWeek` / workout history.
   - Est. duration — estimated from avg-per-template.
4. **Adopt `.row-card`** with modifiers (`.row-card--template`) so this row is the same visual primitive as PR rows, history rows, exercise rows.
5. **Move "+ New" to a FAB** (floating action button) at the bottom-right, not the header. It's an infrequent action; don't let it steal header real estate every visit.
6. **Sort default: "Most recently used first"** with a secondary sort control ("Alphabetical", "Most used", "By category").

---

## Part 2 — Workout Editor (`template-editor-section`)

### What exists today

Full-page section rendered by `showTemplateEditor()`. Top-down:

1. Header: back + "Edit Workout" + green "Save" text button
2. Name field
3. Category chips — 6 options (Push/Pull/Legs/Core/Cardio/Mixed)
4. Schedule chips — 7 day-of-week chips (optional "suggestedDays")
5. "Exercises (N)" section header
6. Est-stats row (estimated duration/volume)
7. Exercise list — each row has:
   - Drag handle (grip icon, likely not wired to actual DnD)
   - Group badge (for superset letter)
   - Exercise name
   - Meta chip: `3 × 10 @ 135 lb`
   - Optional equipment line with cog icon
   - Kebab menu: Edit details / Move up / Move down / Remove
   - Hidden inline-edit panel with Sets/Reps/Weight/Equipment/Notes inputs + Done
8. Superset action bar (appears when ≥2 `superset-select-checkbox`es checked — not visible in the default rendering)
9. Quick-add chip row (top 6 most-used exercises not already in this template)
10. Inline search input with dropdown results
11. Hidden "Open full library" path (`openExerciseLibrary('template')`) with its own filters

### The big picture

The editor predates your V2 active-workout work. That's where the visible drift is. Specifically:

- The active workout has a **real equipment picker** (categorized sheet: For this exercise / At this gym / Other) with auto-associate. The editor has a **raw text input** for equipment.
- The active workout has **bodyweight awareness** (BW banner, per-set total computation). The editor treats all exercises the same.
- The active workout has **per-exercise unit toggle**. The editor only respects `globalUnit`.
- The active workout has **a superset linking sheet** with a checkbox selection UX. The editor has an ad-hoc checkbox-select-mode + action bar pattern that isn't visually consistent.
- The active workout has **a "last session" card** showing `135×10 · 145×8`. The editor doesn't surface this while you're editing — even though it's the most useful thing to know when adjusting target sets/reps.

### Key problems

| Finding | Severity | Why it matters |
|---|---|---|
| **Three ways to edit an exercise row.** Tap the row body (expands inline edit panel). Tap the kebab → "Edit details" (opens the same inline panel). Call `saveTemplateExerciseEdit` — there's a *different* modal that uses `template-exercise-name` / `template-exercise-sets` inputs too. At least two code paths for the same operation. | 🔴 Critical | Source of confusion and maintenance burden. Pick one. |
| **Equipment is a free-text input** in the editor, not a picker. The active workout has the real picker. So a template can say `Hammer Strength Flat` but the active workout won't auto-associate it correctly if the user wrote `hammer strength flat bench` instead. | 🔴 Critical | Data-quality issue that cascades into analytics. |
| **No bodyweight flag at template level.** Pull-ups are defined with `sets/reps/weight` but can't express "bodyweight + added." The BW handling is only in session state. | 🔴 Critical | Templates drift from what users actually do in sessions. |
| **Move up / Move down live in the kebab** alongside Edit / Remove — three separate taps to move an exercise two positions. Drag handle is visible but may not be wired. | 🟡 Moderate | Kebab overload. If drag works, delete Move up/down. If it doesn't, wire it. |
| **No "last session" or historical stat** on exercise rows in the editor. When you're setting target reps, you don't see what you actually did last time. | 🟡 Moderate | The data exists (`getLastSessionDefaults`); the editor just doesn't ask for it. |
| **Category + Schedule chips stack two rows** of chips at the top of every edit session. Category is almost always set once. Schedule is frequently blank. Both eat fold space. | 🟡 Moderate | The primary editing intent is the exercise list. Chips dilute focus. |
| **"Suggested Days" chip row is manual** while the Dashboard derives day-of-week from actual history. Two sources of truth for the same concept. | 🟡 Moderate | Either the user edits this and ignores history, or history is ignored and "Most used on Tuesdays" drifts. Pick one. |
| **Superset in template vs. superset in workout** use different UIs (template: checkbox multi-select mode; active workout: sheet with checkbox list). Same mental model, two implementations. | 🟡 Moderate | Consistency + developer cost. Use the active workout's sheet pattern. |
| **Quick-add chips + inline search + full library** — three add surfaces. The full library (a whole other full-page section) has its own search and filters that duplicate the inline one. | 🟡 Moderate | Overlapping entry points. Fold "open library" into a sheet launched from the inline search. |
| **Duplicate class declarations**: `.template-exercise-item`, `.inline-edit-row`, `.inline-equipment-row`, `.exercise-row` — all distinct classes for things that should be one pattern. | 🟢 Minor | Part of the `.row-card` migration noted in the system critique. |
| **`editTemplateExercise` refocuses a `setsInput` on expand** — good, but the panel's layout has Sets/Reps/Weight in a 3-col row at narrow widths which hands three 60 px-ish inputs. | 🟢 Minor | Rep stepper + big typeable fields would be friendlier. |

### Recommendations — Editor

1. **One row edit surface.** Expand-in-place inline panel, period. Remove the modal path. Tap = expand, kebab = Remove / Link as superset (no more Edit details / Move up / Move down).
2. **Reuse the active-workout equipment sheet.** The editor should launch the exact same sheet — categorized, searchable, base-weight aware — so templates are built from real equipment records.
3. **Add a bodyweight flag.** In the row's expanded edit, a single toggle: `◯ Bodyweight exercise` (defaults from the exercise library record when known). Sets/reps default to bodyweight semantics; the active workout reads this flag directly.
4. **Move category + schedule into a single "Details" accordion** at the top, collapsed by default showing `Push · Usually Tue, Thu` as a summary row. Expand to change.
5. **Auto-derive schedule by default.** When the user has logged this template on 3+ Tuesdays, the schedule row shows "Detected: Tuesdays" with an "Override" action. Manual chip selection is the override, not the default.
6. **Show last-session meta on each row.** `3 × 8 · Last: 10, 8, 6 @ 135 lb · 3 days ago`. Same card style as active workout's `.aw-last`.
7. **Drag-to-reorder works**, kebab menu is 2 items only (Link as superset, Remove).
8. **One add surface.** Inline search with quick-add chips above (which you have). Remove the separate exercise library section for the template-editing use case — it launches as a sheet from the search when the user taps "Browse all" at the bottom of the dropdown. Same UX you already built for active workout's Add Exercise sheet.
9. **Row pattern = `.row-card`.** Identical to library rows and active-workout rows. One primitive, three uses.
10. **Inline superset**: drag two exercises onto each other OR multi-select mode reached via kebab → Link as superset (uses the active-workout sheet). Remove the hidden checkboxes+bottom-bar pattern.

---

## Shared opportunity: collapse three "exercise library" surfaces into one

Today you have:

1. The editor's **inline search + quick-add chips** (in-flow).
2. The full-page **`exercise-library-section`** (with body-part + equipment dropdown filters).
3. The active-workout **`awAddExercise` sheet** (search + category chips, capped at 50).

All three search the same `exerciseDatabase` and produce the same thing (an exercise to add). Pick one surface — the sheet, which is the most recent design — and launch it from all three contexts. The library full-page section becomes a special view (e.g., "Browse all exercises") but isn't the primary add entry point.

Concretely: `openExerciseLibrary('template')` and `awAddExercise` should both open the same `<AddExerciseSheet>` with different targets. That alone collapses ~500 LOC of UI across these three places.

---

## Priority Recommendations (ranked)

1. **Single-list library.** Remove the category grid screen. Add a category pill row + FAB. Single biggest UX win. (Est: 1 PR, mostly HTML + CSS deletion.)
2. **Replace equipment text input with the active-workout equipment sheet.** Fixes data-quality, aligns with the app's modern pattern. (1–2 PRs.)
3. **Add bodyweight flag at template level.** Unblocks real bodyweight support end-to-end. (Small PR on the schema + form; larger on backfill.)
4. **Collapse row edit paths to one.** Delete the modal path; inline-panel only. (Small PR.)
5. **Show last-session stats in editor rows.** Reuses `getLastSessionDefaults`. (Small PR.)
6. **Collapse exercise library add surfaces into one sheet** used by all three contexts. (Medium PR.)
7. **Row pattern migration** — library rows and editor rows both become `.row-card`. (Design-system track.)
8. **Derive schedule from history, manual is an override.** (Small PR; mostly dashboard logic move.)

---

## Mockups

See the two interactive widgets in this chat:

- **Workout Library — before / after.** Current category-grid entry screen vs. a single filterable list with pills, richer rows, and a FAB.
- **Workout Editor — before / after.** Current dense chip-stack + flat rows vs. a cleaner header (collapsed details), richer rows with last-session meta, equipment pill, and a single edit/add surface.
