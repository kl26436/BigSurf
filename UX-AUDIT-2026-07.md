# UX Audit — July 2026

Full-app design/UX deep dive (excluding active workout, which gets minor-polish items only). Complements [DESIGN-BACKLOG.md](DESIGN-BACKLOG.md) — nothing here duplicates a shipped item there. All findings verified against source with file:line evidence.

Severity: 🔴 misleading data or blocked/broken interaction · 🟡 real UX drag · 🟢 polish

---

## 0. Housekeeping: the docs describe a deleted stats system

CLAUDE.md and README still reference `stats-ui.js`, `exercise-progress.js`, `styles/pages/stats.css`, and "Chart.js 4.4.1" — all deleted in the Dashboard V2 rewrite (commit `5b4b128`). Charts today are hand-rolled inline SVG primitives in `js/core/features/charts/`. Chart.js is not used anywhere.

- [ ] 🟡 Update CLAUDE.md + README to the drill-down architecture (`aggregators.js`, `metric-detail-ui.js`, `muscle-group-detail-ui.js`, `exercise-detail-ui.js`, chart primitives); drop the Chart.js claim.

---

## 1. The two root causes of "why do I care"

Everything else in this audit is polish compared to these two.

### 1a. 🔴 Exercise trends mix equipment — the numbers can't be trusted

`aggregators.js` contains **zero** references to `equipment` (verified by grep). `withResolvedNames()` ([aggregators.js:18-37](js/core/features/metrics/aggregators.js#L18)) resolves exercises by name only, and every downstream aggregator (`aggregateExerciseStats`, `aggregate1RMSeries`, `getPRsForBodyPart`, trend/1RM/volume math) filters solely on `e.name === exerciseName` ([aggregators.js:658](js/core/features/metrics/aggregators.js#L658)). Leg Press on a Cybex sled and a Hammer Strength unit — different, unpublished starting resistances — feed the same trend line, max, and est. 1RM. A "PR" or "up trend" can just be a machine swap.

The fix is cheap because the model already exists: `pr-tracker.js` segments PRs by `(exercise, equipment)` ([pr-tracker.js:20-32](js/core/features/pr-tracker.js#L20)) — but even it gets flattened at render time: PR rows never show `pr.equipment` ([dashboard-ui.js:962-982](js/core/ui/dashboard-ui.js#L962)), and Exercise Detail session rows don't show which machine each session used ([exercise-detail-ui.js:146-160](js/core/ui/exercise-detail-ui.js#L146)).

- [ ] 🔴 Add optional `equipment` filter to `aggregateExerciseStats` + a machine picker on Exercise Detail ("All machines / Barbell / Hammer Strength…"), mirroring the PRTracker model.
- [ ] 🔴 Show equipment on every session row and PR row ("225 lb × 5 · Hammer Strength · 3d ago").
- [ ] 🟡 When a selected range mixes 2+ machines for one exercise, badge the chart ("Mixed equipment") so the trend is honestly framed.
- [ ] Preserve the unit-conversion handling at [aggregators.js:644-651](js/core/features/metrics/aggregators.js#L644) — it's correct and guards a real prior bug. Don't regress it while adding equipment filtering.

### 1b. 🔴 Dashboard and Progress page answer questions you're not asking

The dashboard is retrospective stats; your actual question when opening the app is "what am I doing today, tap to start." That block ("For Today", [dashboard-ui.js:498-592](js/core/ui/dashboard-ui.js#L498)) renders 4th–6th, at/below the fold on a 390px phone. Meanwhile the Progress page is a strict superset of the dashboard — it literally reuses `renderBodyPartCard` ([dashboard-ui.js:1028](js/core/ui/dashboard-ui.js#L1028)) — so neither page has a distinct job. That's why neither earns attention.

Proposed dashboard order — lead with forward-looking, push retrospective down or out:

1. **For Today** first (already built) — one tap from open → start.
2. **Last session one-liner** ("Push day · 3d ago · 5,200 lbs") — data already loaded (`allWorkouts`, `lastDoneByType` at [dashboard-ui.js:521-527](js/core/ui/dashboard-ui.js#L521)).
3. **PR proximity hook** — `PRTracker.getExercisePRs()` already knows the number to beat; cross-reference today's template: "2 lbs off your Bench PR — today's the day." Currently PRs are only celebrated after the fact ([dashboard-ui.js:797-822](js/core/ui/dashboard-ui.js#L797)).
4. Hero chips, composition, recent PRs after that. Body-part cards move to Progress only.

Give Progress a distinct job: longer-range analysis (4–8 week body-part balance via the already-coded-but-unused `chart-area-stacked.js`, full PR table, plateau list).

- [ ] 🔴 Reorder dashboard: For Today first; add last-session line; add PR-proximity card.
- [ ] 🔴 De-duplicate: body-part cards live on Progress only; dashboard links to it.
- [ ] 🟡 Today's-PR banner and Recent PRs can show the same PR twice on one load (both read `getRecentPRs(3)`, [dashboard-ui.js:98](js/core/ui/dashboard-ui.js#L98)) — exclude banner PRs from the list.

---

## 2. Charts (all surfaces)

No chart anywhere has an axis, tick label, tooltip, or accessible label. All context lives in sibling HTML text. Zero `<text>` axis elements in `chart-line.js` / `chart-combo-bars-line.js` / `chart-sparkline.js`; zero `aria-label`/`role="img"` across the three drill-down UIs (verified by grep).

- [ ] 🔴 Add min/max Y labels + start/end X date labels to `chartLine` and `chartComboBarsLine` (small `<text>` elements, no library needed). Sparklines stay bare by design.
- [ ] 🟡 Tap-to-reveal point tooltip (SVG `<title>` is a zero-JS start) showing date + value.
- [ ] 🟡 Body-weight card: sparkline plots 90 days ([dashboard-ui.js:202](js/core/ui/dashboard-ui.js#L202)) but the delta caption says "30 days" — align the windows or caption the spark.
- [ ] 🟡 Range state is three independent variables with three different defaults and option sets (`dashboardRange` 'W', `muscleDetailRange` 'M', `exerciseDetailRange` '6M'; Exercise Detail drops 'W', adds '6M') — unify options and persist the pick across drill-down levels.
- [ ] 🟡 Zero-data ranges silently omit sections (`if (s.sessions.length > 0)`, [exercise-detail-ui.js:92-116](js/core/ui/exercise-detail-ui.js#L92)) — render "No data in this range — try All time" instead.
- [ ] 🟡 "Top Lifts" depends on exact-name match against `BIG_LIFTS` ([aggregators.js:194](js/core/features/metrics/aggregators.js#L194)) — "Barbell Bench Press" silently drops out. Fuzzy/contains match or user-pickable lifts.
- [ ] 🟢 `aria-label` on chart SVGs.

### Body-part cards specifically

- [ ] 🔴 "[Hero lift] Max" is one exercise's single best set presented under a body-part header — the selection heuristic ([aggregators.js:340-393](js/core/features/metrics/aggregators.js#L340)) is invisible. Either promote the exercise name to equal visual weight or replace with a true body-part stat (weekly sets).
- [ ] 🟡 `analyzeWeeklyVolume` already computes MEV/MRV status ([training-insights.js:93-121](js/core/features/training-insights.js#L93)) but it only surfaces as an occasional dismissible insight. Pipe a "Low / Good / High volume" chip onto each body-part card — that's the "should I care" answer the card is missing.
- [ ] 🟢 Two disagreeing deload detectors: `checkDeloadNeeded` (4 hard weeks) vs `detectDeloadWeek` (3, [dashboard-ui.js:386-411](js/core/ui/dashboard-ui.js#L386)). Consolidate to one.
- [ ] 🟢 Insight copy: "trend"/"volume-low" restate a number; only "plateau" prescribes an action. End every insight in an instruction.
- [ ] 🟢 Delete dead `renderBodyWeightCard()` ([body-measurements-ui.js:28-91](js/core/features/body-measurements-ui.js#L28)) — zero call sites.

---

## 3. Equipment detail page

Why it feels bad: `openEquipmentDetail()` ([equipment-library-ui.js:3488-3744](js/core/ui/equipment-library-ui.js#L3488)) renders **13 flat, always-open sections** — identity fields, base weight, locations, N per-exercise video-URL mini-forms, notes, delete — with no grouping, five different interaction idioms across six fields, type displayed three times, and CSS scattered across six files (including `bodyweight.css`).

Redesign sketch (reuses existing primitives):

1. Hero card: icon + name + brand·line + type chip → tap opens one "Identity" sheet (name/brand/line/function/type). Replaces 5 always-open editors.
2. Stat strip (Sessions / PR / Last) — keep, it's the best part.
3. "Setup": base weight as one row-card → tap-to-edit sheet.
4. "Locations (N)": chip row, unchanged — but route legacy `equipment.locations[]` and catalog `location.equipment[]` writes through ONE shared path (today two different UIs edit the same relationship, with `healDuplicateLocationEquipment` papering over the drift, [equipment-library-ui.js:1216-1284](js/core/ui/equipment-library-ui.js#L1216)). *— Resolved 2026-07-04 (8b step 4): the dual model + healing were deleted; equipment collection is the sole source.*
5. "Used for (N)": compact row-cards (name + chevron) → per-exercise sheet with Remove / Edit form video. Kills the always-open URL input per row ([:3699-3726](js/core/ui/equipment-library-ui.js#L3699)).
6. Notes.
7. Danger zone in its own bordered card — today Delete sits directly under the Notes textarea in the same scroll ([:3735-3739](js/core/ui/equipment-library-ui.js#L3735)).

- [ ] 🔴 Restructure per sketch above.
- [ ] 🔴 Fix full-page re-render on every row action — removing exercise #8 of 10 kicks you to the top ([:3560](js/core/ui/equipment-library-ui.js#L3560)). Patch the affected section or restore scroll.
- [ ] 🔴 Dead button: "View all N →" on location detail has no onclick ([location-ui.js:915](js/core/features/location-ui.js#L915)). Wire or remove.
- [ ] 🔴 Library-tab search is only reachable when `locations.length > 0` ([:2847-2851](js/core/ui/equipment-library-ui.js#L2847)) — users with no saved gyms can't search their equipment at all. Decouple.
- [ ] 🟡 Duplicate `.sec-head` defined twice in page-header.css (:176 tokenized, :221 raw values) — delete the second; violates Rules 6/10.
- [ ] 🟡 Migrate `.equip-lib-search` → `.field-search` and `.filter-pill` → `.chip` (Rules 3/4 stragglers).
- [ ] 🟡 No exercise-side entry point to edit a form video — only discoverable by navigating Equipment → machine → scroll to Used for. Add "Edit form video" to the exercise menu in the workout flow.
- [ ] 🟢 Delete dead brand-view render path (`currentView === 'brand'`, [:50-54](js/core/ui/equipment-library-ui.js#L50)).

---

## 4. Workouts page (day chips + editor)

### Day-of-week chips — confirmed broken sizing

`.day-chip` ([templates.css:755-768](styles/pages/templates.css#L755)) has **no width, min-height, or padding** — `aspect-ratio: 1` on a single glyph at `--font-sm` yields ~20px circles with 6px gaps. That's under even WCAG's reduced 24px minimum (guideline is 44px; `--tap: 44px` already exists in tokens.css). They're also `<span>`s (no keyboard access, no `aria-pressed`) and the **only** interactive control on the page with no `:active` feedback — so even a successful tap gives no confirmation. This is exactly the "odd shaped and hard to press" complaint.

- [ ] 🔴 `.day-chip { width: var(--tap); height: var(--tap); }`, convert to `<button>`, add `:active { transform: scale(0.9) }` + `aria-pressed`. Seven 44px circles + gaps ≈ 344px — fits 390px; tighten gap or wrap if needed.
- [ ] 🟡 Category chips beside them: same `<span>`/no-`:active` gaps, ~32px tall. Convert + bump toward `--tap-sm`.

### Editor + list

- [ ] 🔴 Reorder arrows are 24×20px with 2px between up/down ([templates.css:397-409](styles/pages/templates.css#L397)) — near-impossible to hit the right one with a thumb. Bump to `--tap-sm` (36px) each, or drag handle.
- [ ] 🟡 Sets/reps/weight "steppers" are bare number inputs with native spinners disabled — no tap-to-increment at all. Add real +/− buttons (pattern exists in active workout).
- [ ] 🟡 Notes textarea is `rows="1"` + `resize: none` — multi-line notes invisible. Reuse the `awAutoGrowNotes` pattern.
- [ ] 🟡 No expand affordance on template rows — no chevron; the only hint is subtitle copy, and the row body (expand) sits next to a play button (start) with no visual separation. Add a rotating chevron (pattern exists: `.te-details__chev`).
- [ ] 🟡 No "suggested for today" on the selector — `deriveUsuallyDays` data exists but is buried in the closed accordion; list sorts by recency only. Pin/badge today's usual workout (dashboard's `getTemplatesForDayOfWeek` already computes it).
- [ ] 🟢 chips.css raw font-sizes (0.8/0.85/0.72/0.74rem) and raw px padding — tokenize (Rule 6).

---

## 5. History, settings, navigation

- [ ] 🟡 Two parallel workout-detail modals with different info and actions — `showWorkoutDetailModal` ([workout-history-ui.js:254-354](js/core/ui/workout-history-ui.js#L254), Resume/Repeat/Delete only) vs the richer `generateWorkoutDetailHTML` ([workout-history.js:825-1021](js/core/workout/workout-history.js#L825), + Edit, Save as template). Which one you see depends on tap path. Consolidate on the richer one.
- [ ] 🟡 Empty calendar days are inert — only `.has-workout` cells get listeners ([workout-history.js:1070-1111](js/core/workout/workout-history.js#L1070)); logging a missed session requires spotting the small header "+". Make empty days open add-workout prefilled with that date.
- [ ] 🟡 Calendar day cells are 38px vs the app's own `--tap: 44px` ([history.css:409-413](styles/pages/history.css#L409)).
- [ ] 🟡 Settings never links to Locations or Equipment — both referenced in Settings copy (GPS toggle, delete-all warning) but only reachable via More. Add rows.
- [ ] 🟡 Two export actions ("Export workouts" vs "Export for ChatGPT") with a meaningful scope difference (body weight/DEXA) buried in one caption — merge into one flow with a scope picker, or state the difference plainly.
- [ ] 🟢 "Rebuild PRs" sits in Danger zone but is non-destructive — move to a Maintenance group.
- [ ] 🟢 Onboarding pre-selects "Intermediate" experience with no skip, inconsistent with weight-goal's explicit neutral path ([settings-ui.js:486](js/core/ui/settings-ui.js#L486)).
- [ ] 🟢 "Re-run onboarding" filed under Preferences — move near Profile.
- [ ] 🟢 Back buttons: `.d-back` 32px vs `.detail-page-header__back` 36px — two sizes, both under 44. One 44px component.
- [ ] 🟢 Range pills `padding: 5px 0`, no min-height ([detail-pages.css:70-80](styles/pages/detail-pages.css#L70)) — the only chart control; give it `min-height: 44px`.

## 6. Active workout — minor only (per your call)

- [ ] 🟢 "Rest done" + "Ready for your next set" say the same thing on two lines — one line.
- [ ] 🟢 Rest-timer +30s/Skip have `aria-label` but no `title`, unlike sibling icon buttons — add for consistency.
- [ ] 🟢 `.aw-notes__textarea` at `--font-xs` is the smallest text field in the flow — consider `--font-sm`.

---

## Prioritized plan

**P1 — trust the numbers, make the app open to the right place** (this is the "why do I care" fix)
1. Equipment-aware exercise trends + machine picker; equipment shown on session/PR rows (§1a)
2. Dashboard reorder: For Today first, last-session line, PR-proximity card; body-part cards → Progress only (§1b)
3. Axis labels on line/combo charts (§2)
4. Day-chip sizing/semantics fix (§4) — smallest fix, biggest daily annoyance

**P2 — unblock and de-confuse**
5. Equipment detail restructure + scroll-position fix + dead View-all + search gating (§3)
6. MEV/MRV volume chip on body-part cards; hero-lift labeling (§2)
7. Consolidate history detail modals; tappable empty calendar days (§5)
8. Editor ergonomics: reorder arrows, steppers, notes auto-grow, row chevron (§4)

**P3 — polish sweep**
9. Range-state unification, empty-range messaging, Top Lifts matching (§2)
10. Settings/nav items, back-button standardization, chips.css tokenization, dead code deletion (§5, §3)
11. Docs update (§0) + active-workout micro-items (§6)
