# 💪 Workout App — Backlog & To-Do Tracker

> Track enhancements, ideas, and improvements as you build.  
> Add new items anytime — sort by priority or area.

---

## 🗂️ Backlog

| # | Item | Area | Priority | Status | Notes |
|---|------|------|----------|--------|-------|
| 1 | Rest timer pill is too large and visually dominant — needs to be smaller/subtler | Active Workout | 🔴 High | 🔲 Todo | Big teal pill competes with set/exercise counts; should feel secondary not primary |
| 2 | Rethink action button row — Cancel, Add, More take up too much space | Active Workout | 🔴 High | 🔲 Todo | Consider icon-only buttons, collapsing secondary actions behind a menu, or FAB pattern |
| 3 | Push completed exercises to bottom / de-emphasize when done | Active Workout | 🟡 Medium | 🔲 Todo | Auto-scroll to next exercise, collapse completed cards, or reduce opacity when all sets done |
| 4 | lb/kg toggle in active exercise doesn't update prior workout history or charts | Active Workout / History | 🔴 High | 🔲 Todo | Toggle is per-exercise but values in history/charts don't convert. Mixed-unit gym makes this a daily issue |
| 5 | Exercise detail page UI clutter — header area too busy | Exercise Detail | 🟡 Medium | 🔲 Todo | Edit/swap/close icons + gym name + sync icon all competing for space; simplify header hierarchy |
| 6 | "Operation failed" error on Finish but workout actually saves correctly | Active Workout | 🔴 High | 🔲 Todo | Error popup shows and stays on page, but data is saved — navigating to dashboard confirms completion. Likely a response handling issue, not a save failure |
| 7 | "Operation failed" error when switching filters on History / Stats page | History / Stats | 🔴 High | 🔲 Todo | Happens when cycling through different filter options; may be a failed re-fetch or query issue |
| 8 | PR badge still shows old name after fixing a typo on an exercise | Exercise / PRs | 🟡 Medium | 🔲 Todo | Renaming an exercise doesn't update the PR badge label — likely PR record still references the old name string |


---

## ✅ Completed

| # | Item | Area | Completed | Notes |
|---|------|------|-----------|-------|
| — | _(Nothing completed yet)_ | | | |

---

## 📌 Areas
- **Active Workout** — rest timer, set/exercise tracking, progress bar
- **Exercise Library** — exercise cards, editions, tags
- **Dashboard** — overview, stats, quick actions
- **History** — past workouts, trends
- **Workout Builder** — creating/editing workout plans
- **Auth / Settings** — login, profile, preferences
- **Performance / Bug Fixes** — general

---

## 🔖 Priority Key
| Label | Meaning |
|-------|---------|
| 🔴 High | Core functionality or blocking |
| 🟡 Medium | Nice to have soon |
| 🟢 Low | Future idea |

---

## 📝 Notes & Context
- App built with Claude Code / Cowork
- Active Workout screen: rest timer, 1/6 sets, 0/2 exercises, Cancel / Add / More / Finish actions
- Exercise cards show edition tag, progress bar (e.g. 1/3 sets), delete option
- Bottom nav: Dashboard · Workout · History · More

---

*Last updated: April 11, 2026*
