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
