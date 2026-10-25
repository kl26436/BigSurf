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

_None yet._
