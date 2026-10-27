# Bug log

One entry per thing that looked wrong at the gym, newest first. The point is
that every report arrives with data: which build, which path, and the trace
the app already recorded. See `docs/action-plan-2026-10.md` §5.

**Where the data comes from**

- **Prefill / history card:** open the app with `?debug`, screenshot the overlay
  line on the last-session card, then copy the `autofill_trace` /
  `autofill_mismatch` entries from More → Error log (session-only — copy them
  before reloading).
- **Coach:** the turn is in the `coachTraces` collection (admin-only read;
  Firebase console → Firestore → `coachTraces`, filter by `userId` and
  `createdAt`). Paste the doc id.
- **Session intent:** every workout doc carries `sessionIntent` (deload / peak
  / build and why) — note it for progression reports.

**Weekly habit (10 min):** skim the Error log's `autofill_*` entries and the
week's `coachTraces`; move anything surprising in here.

## Template

```
### YYYY-MM-DD · <area: prefill | equipment | progression | coach> · <one-line symptom>
- Build: <SW version / commit>   Path: <hero | workouts tab | history repeat | resume | mid-session replace/add/equip>
- Expected / Saw:
- Trace: <autofill_trace / autofill_mismatch / coachTraces id>
- Screenshot of ?debug overlay (if prefill)
- Status: open | fixed in <commit> | not a bug
```

## Entries

### 2026-10-25 · equipment · No visible way to add a machine mid-workout
- Build: 8844b94…f9b3a60   Path: mid-session equip
- Expected / Saw: a one-tap "add new machine" (shipped 9ec3198) / nothing until you type a name — the AP-11 rewrite removed the always-visible "New machine" footer entry and showed the Add row only for a 2+ character query.
- Status: fixed in bf9877a ("Add a new machine at <gym>" row with an empty search; opens the in-place form, keyboard up)

### 2026-10-25 · shell · Keyboard up → only ~two exercises visible in the add-exercise sheet
- Build: up to 9f1bf6b   Path: mid-session add exercise
- Expected / Saw: a list to scroll / ~2 rows — sheet capped at 85dvh minus the keyboard, and header + search + chips + Cancel bar took the rest.
- Status: fixed in bf9877a (while a search field has focus the sheet uses the whole area above the keyboard; action bar, subtitle and handle hide). Confirm on the phone with ?debug (kb, vv on the HUD).

### 2026-10-26 · shell · Big gap above every subpage header (Plan page, exercise detail) — status-bar inset paid twice
- Build: 96a0a79 (CSS from ≥ dc54d24)   Path: Home → My plan; Home → main lift → exercise detail (any drill-down reached without a `setHeaderMode(false)`)
- Expected / Saw: one top bar / the logo header (`.header`, `utilities.css:231-245`, carries `--safe-top`) still showing on drill-downs, and under it the `.page-header--detail`, which SH-4 (dc54d24) also gave `--safe-top` (`page-header.css:27-34`). ≈59 px of dead space on an Island phone, ~145 px of logo bar above it. SH-4's premise ("`.d-header` had NO inset, so the back button sat under the Island") was only true on pages where the logo was hidden; on drill-downs the logo was paying the inset.
- Root cause: `navigateTo()` has no default header mode — `setHeaderMode(false)` is called in 7 individual cases (`navigation.js:271,279,393,522,532,542`) and `setHeaderMode(true)` only in `showDashboard` (`dashboard-ui.js:80`), so any view entered from the dashboard that isn't in the list (plan/block, exercise-detail, metric-detail, muscle-group, goals…) inherits the dashboard's logo. The doc comment on `setHeaderMode` already states the intended rule: logo on dashboard/history, hidden everywhere else.
- Fix: one line at the top of `navigateTo()`: `setHeaderMode(view === 'dashboard' || view === 'history')`; delete the 7 per-case calls. Keep the inset on `.page-header` — with the logo hidden it IS the top bar, and it has to clear the Island when it sticks. Do not remove the inset from `.page-header--detail` to "fix" the gap; that reintroduces the 9/10 report.
- Test: `tests/unit/nav-header-mode.test.js` — after `navigateTo('plan')` / `('exercise-detail')` / `('equipment')` / `('settings')` `#main-header` is hidden; after `('dashboard')` / `('history')` shown; `enterSection` applies the same rule; only `true` shows it.
- Status: fixed (uncommitted, 10/26) — `LOGO_VIEWS` + `applyHeaderMode()` in `navigation.js`, called from `routeToView` and `enterSection`; the 7 per-case calls removed; `setHeaderMode('equipment')`-style string calls (which were truthy → logo shown over Equipment, Settings, Plate calculator) can't happen anymore. Suite green apart from the mirror/fixture tests that need `functions/`, which weren't in the run.

### 2026-10-26 · design-system · Main-lifts card: movement-pattern pills render as bare text
- Build: 96a0a79 JS + pre-96a0a79 CSS   Path: Home → Main lifts card, bottom strip
- Expected / Saw: six small pills (Squat 3 · Hinge 3 …, `.vol-badge--muted/good/low`) / unstyled 22 px white text. The markup is right (`dashboard-ui.js:1210-1212` emits `.vol-badge`, CSS at `dashboard-v2.css:691-706`); the phone had the previous `dashboard-v2.css`, which only knows `.vol-chip` (renamed by DS-4 in 96a0a79).
- Root cause: version skew by design in the service worker. `.js` → network-first (`service-worker.js:201-204`, always fresh); `.css` → cache-first with background refresh (`:207-218`), so **the first launch after every deploy runs new JS against the previous CSS**, and the SW cache name (`big-surf-v8.15-offline`, last bumped 6f8b66b) wasn't bumped for DS-1…5 / TP-6 / PF-0…4 either. Any class rename across JS and CSS shows up broken for one launch — exactly the DS-4 rename.
- Fix: route same-origin `.css` through `networkFirst(request, request, 'text/css')` like `.js` — Firebase already serves both `no-cache`, so the cost is one conditional GET per file, and the two can never skew. Keep cache-first for images. Then the CACHE_NAME bump only matters for the offline precache list, not for correctness.
- Guardrail: `scripts/sw-check.mjs` in `npm run check` — fail when a path in `STATIC_ASSETS` changed in the diff but `CACHE_NAME` didn't; and the DS-5 lint's class-rename rule: a CSS class removed in `styles/` must have zero remaining references in `js/` in the same commit (already true here — the skew was the SW, not the rename).
- Status: open · hard-refresh / relaunch the PWA once and the pills come back on this build
