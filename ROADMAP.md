# Big Surf Workout Tracker — Roadmap

## Completed (2025–2026)

All original overhaul phases have shipped:

- **Phases 0–7**: Tech debt cleanup, CSS/layout fixes, active workout V2, exercise library, equipment tracking, workout completion, dashboard V2, history/stats
- **Phase 8**: Body measurements + DEXA scan import
- **Phase 9**: Template editor consolidation (retired standalone editor, unified into workout selector)
- **Phase 10**: Superset/circuit grouping
- **Phase 11**: Plate calculator
- **Phase 12**: Body measurements dashboard widget + 7-day average
- **Phase 13**: Data export/import (CSV + JSON)
- **Phase 15**: Location management + GPS detection
- **Phase 16**: Equipment planner (equipment-aware exercise ranking)
- **Phase 17**: Training insights (rules-based volume analysis, plateaus, deload suggestions)
- **Phase 18**: Manual workout entry

Library/editor consolidation (2026-04): Phases 0–9 all shipped — inline rename, rich exercise rows, shared add-exercise sheet, details accordion, last-session meta.

Performance: loadAllWorkouts 5-min TTL cache, aggregateBodyPartStats WeakMap memoization.

## On hold

- **Phase 14**: Social features (intentionally deferred)
- **Phase 19**: Community gym database (intentionally deferred — may be superseded by equipment system v2)

## Current / Next Up

### Equipment System v2

Evolve the static equipment catalog into a live, location-aware system.

**Spec:** `specs/equipment-system-v2.md`
**Design brief:** `specs/equipment-library-redesign-brief.md`

Key goals:
- Move catalog to Firestore (global read, admin write)
- Gym-first equipment library UX (replace current flat list)
- Rapid "walk around" inventorying (search-first, checkbox multi-select)
- Equipment ↔ exercise mapping
- Location-aware equipment picker during workouts (GPS auto-filters to current gym)
- History reconciliation with "link to existing" merge option

### Edit History Redesign

Inline editing in the workout detail modal instead of loading full active-workout UI.

**Spec:** `docs/edit-history-redesign.md`

### Ongoing Design Debt

Tracked in `DESIGN-BACKLOG.md` — covers remaining WCAG fixes, token compliance, and component consolidation.
