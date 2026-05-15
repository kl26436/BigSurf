# Equipment Library Redesign — Design Brief

## Context

This is for **Big Surf**, a mobile-first gym workout tracker (dark theme, teal #2dd4a8 accent, orange #e8723a secondary). The app runs on phones at the gym. All UI decisions should optimize for one-handed use, speed, and glanceability.

**Current state:** The equipment library is a flat list of user-saved equipment with "By Brand" / "By Body Part" toggle and location filter pills. It only shows equipment you've already logged in a workout — there's no discovery, no inventory management, no clear gym-centric entry point.

**Tech stack:** Vanilla JS, Firebase/Firestore, no framework. CSS uses design tokens (custom properties). Mobile-first, bottom-sheet based interactions.

---

## Goals

1. **Gym-first navigation** — The primary question is "what's at this gym?" not "show me all my equipment alphabetically"
2. **Rapid inventorying** — Walk around a gym and tag machines in bulk (checkbox multi-select, batch save)
3. **Equipment → exercise mapping** — Show what exercises a machine supports, and which machines work for an exercise
4. **History reconciliation** — When old workout data has equipment names that don't match the library, let users MAP them to the right machine (not just "add as new" or "dismiss")
5. **Global catalog browsing** — Browse all known equipment (1,300+ machines across 21 brands) even if you haven't used it yet

---

## Information Architecture

### Three tabs/modes:

| Tab | Purpose | Content |
|-----|---------|---------|
| **My gyms** (default) | Location-centric view | List of saved locations → tap to see equipment at that gym |
| **All equipment** | Personal library (current view, improved) | Everything you've saved, grouped by brand or body part |
| **Browse catalog** | Discovery | Full global catalog — browse by brand → line → machine, even for machines you haven't added yet |

### Gym detail view (inside "My gyms"):
- Header: Gym name + count + last updated
- Body part filter chips (All, Chest, Back, Legs, etc.)
- Equipment list grouped by body part section headers
- Each row: machine name, brand · line · type metadata
- [+ Add] button → opens quick-add sheet

### Quick-add sheet (the "walk around" flow):
- Full-screen bottom sheet
- **Search bar is the hero** — auto-focused, keyboard up immediately. You read the machine nameplate, type it, tap the checkbox, done. 3 seconds per machine.
- **Body part chips below search** — secondary filter for when you DON'T know the name but can tell it targets chest/back/etc. Tapping a chip filters the catalog list below.
- Results grouped by Brand › Line
- Checkbox multi-select — tap to toggle
- Already-added items shown as checked + grayed ("Already at this gym")
- "Done (N new)" sticky button at bottom
- "Can't find it?" → create custom equipment form at bottom

**Three speeds of adding:**
1. **Fastest (know the name):** Type "hack squat" → see it → tap checkbox → keep walking
2. **Medium (know the brand):** Type "newtech" → see all their machines → check a few
3. **Browsing (know the body part):** Tap "Legs" chip → scan all leg machines in catalog → find it

### Downstream payoff — location-aware equipment picker:
During an active workout, when you tap "change equipment" or add an exercise:
- GPS detects your gym automatically (already works today for location stamping)
- **Equipment picker defaults to machines at your current gym** — only shows what's actually there
- Filtered further by exercise mapping: "chest machines at Absolute Recomp" when doing chest
- **"Show all equipment"** toggle at bottom for rare cases (untagged machine, want to reference something from another gym)
- When traveling: GPS detects you're at the Vegas gym → Vegas inventory kicks in automatically

**The key behavior shift:** Today the picker shows everything you've ever used anywhere. With gym inventory, it shows only what's at your current location — unless you ask for more. This means:
- No clutter from other gyms
- The more you inventory, the smarter it gets
- Zero config when traveling — GPS handles the switch
- If a machine isn't tagged yet, the "show all" fallback + "add to this gym" prompt keeps it seamless

### History reconciliation (improved):
Current: banner says "X machines found in history, not in library" → Add | Dismiss
**New: three options per item:**
1. **Add** — create new equipment entry (same as now)
2. **Link** — map this old name to an existing machine in your library (picks from a list, then all historical references update)
3. **Dismiss** — ignore for this session

The "Link" flow opens a picker showing your equipment library, with search. Once linked, the old name becomes an alias — future loads show the canonical name.

---

## Key Screens to Mock Up

1. **Equipment landing** — Three-tab top nav (My gyms / All equipment / Browse catalog), gym cards with machine counts
2. **Gym detail** — Inside a specific gym, body-part grouped list of equipment with type icons
3. **Quick-add sheet** — Search + checkbox catalog browser for rapid inventorying
4. **Machine detail** — Tapping a machine shows: brand/line/type, exercises it supports, locations it's at, last workout using it, form video link
5. **History reconciliation** — Improved review screen with Add / Link / Dismiss per row
6. **Browse catalog** — Brand cards → expand to lines → expand to machines (accordion or drill-down)

---

## Design Constraints

- **Dark theme**: Background #0f1923, card surfaces #1a2a38, text #f0f0f0 / #8899aa
- **Accent**: Teal #2dd4a8 (primary actions, active states), Orange #e8723a (secondary/category)
- **Mobile only**: 390px viewport, bottom-sheet interactions, thumb-reachable CTAs
- **Existing patterns to reuse**:
  - `.row-card` — list items with icon + title/subtitle + trailing action
  - `.chip` — filter pills (category, body part)
  - Bottom sheets via `openSheet()` — title, subtitle, body, action buttons
  - Page sections with `.page-header` (back + title + optional action)
- **Font sizes**: Use the app's token scale (--font-2xs through --font-3xl)
- **Border radius**: Cards use --radius-md (8px), sheets use --radius-lg (16px) on top corners
- **Touch targets**: Minimum 44px height for tappable rows
- **Equipment type icons**: Plate-Loaded (cog), Selectorized (th-list), Cable (link), Bench (couch), Bodyweight (child), Barbell/Dumbbell (dumbbell)

---

## User Flows to Design

### Flow 1: "I just joined a new gym"
1. Open Equipment → My gyms tab
2. Tap "Add a gym" → name + optional GPS
3. Land on empty gym detail → "Start adding equipment"
4. Quick-add sheet opens → search "newtech" → check machines → Done
5. Back to gym detail, now populated

### Flow 2a: "I see a machine, what is it?"
1. Open Equipment → tap my gym → tap [+ Add]
2. Quick-add sheet → tap "Chest" body part chip (I can tell it's a chest machine)
3. See all chest machines in the catalog grouped by brand
4. Recognize "Incline Chest Press 2" — tap checkbox
5. Keep walking, tap "Back" chip, check a few more
6. Done → all added in one batch

### Flow 2b: "I know what this is, tag it"
1. Open Equipment → tap my gym → tap [+ Add]
2. Quick-add sheet → type "newtech" in search
3. See all Newtech machines grouped by line
4. Check the ones I see → Done

### Flow 3: "What can I do on this machine?"
1. Gym detail → tap a machine row
2. Machine detail shows: "Exercises: Bench Press, Incline Press, Close-grip Press"
3. Tap an exercise → goes to exercise detail/progress

### Flow 4: "Fix my old workout data"
1. Banner appears: "5 machines from your history aren't in your library"
2. Tap Review → see list of orphaned names with context (exercises used with, location, session count)
3. For "Flat Bench" → tap Link → search library → pick "Hammer Strength Flat Bench" → mapped
4. For "Mystery Machine" → tap Dismiss
5. For "New Cable Thing" → tap Add → creates entry

### Flow 5: "What equipment does my gym have for back?"
1. Gym detail → tap "Back" chip
2. Filtered list: all back-targeting machines at this gym
3. Each row shows the specific exercises supported

---

## Open Questions for Design Exploration

1. Should the gym detail be a drill-down page or a bottom sheet that slides up?
2. Should "Browse catalog" be a separate tab, or accessible only through the quick-add flow?
3. How to handle the machine detail view — expand in-place (accordion) or navigate to a detail page?
4. Should there be a "map view" showing equipment layout within a gym? (probably overkill for v1)
5. How does this integrate with the active workout flow? When you're mid-workout and pick equipment, should it be aware of gym inventory?

---

## What Success Looks Like

- Kevin can inventory a new gym section in under 3 minutes
- Users can answer "what chest equipment does my gym have?" in one tap
- Old workout history data gets properly reconciled without creating duplicates
- The equipment → exercise link makes it easy to discover new exercises for machines you have access to
