# Marcus re-review — 2026-07-03 (post gap-closing session)

> In-character UX review by the `gym-bro-reviewer` agent ("Marcus", a daily lifter
> who lives in his tracking app), re-running his first-month-or-two new-user
> experience to judge how well this session's work closed earlier gaps.
>
> **Context reviewed (all live on dev at review time):**
> - Drill-down consistency — unified range state + empty-range CTAs (`d983e4e`)
> - Exercise picker unification on body-part taxonomy (`41883bf`)
> - Phase 3b — workout editor on its own page; read-first list (`b2ed64f`)
> - Earlier session work: exercise-library refresh, calendar tap-to-log, one
>   workout-detail modal, active-workout polish, settings reorg.
>
> **Verdict: 3/5 dumbbells** — real progress; the editor-page rebuild is the
> standout. "One shared range" unified the state but not the on-screen widgets.

---

# Big Surf re-review — Marcus, month two, gym floor, phone at 40% battery

## Gut check

Alright, I went back through this like I actually would — open the app between sets, check if last night's "fix the picker" and "fix the editor" stuff actually holds up. Short version: two of these three are genuinely closed, and closed *well* — not just patched, actually fixed. The third one (range consistency) is where I can tell someone said "let's unify this" and then only did half the job — the plumbing got unified, the actual buttons on screen didn't.

## In-character walkthrough

I open Workouts. This is the one that actually feels different. Before, tapping a workout name blew up an accordion mid-list and I'd lose my scroll position hunting for the Start button under a pile of steppers. Now the list is just... a list. Category dot, "Usually Fri," exercise count, ~duration, last-done — I can tell what I'm looking at without opening anything. Tap the row, get a real page: title I can rename inline, exercises collapsed to a one-line summary (3×12·55) with last-session baked right in, Start pinned at the bottom where my thumb already is. That's the app I wanted six months ago. Good.

Mid-workout, I go to swap an exercise. Add-exercise sheet now filters by body part like the library does — Chest, Back, Legs, Shoulders, Arms, Core, Cardio. I tap "Legs" and actually get leg exercises now, which sounds like a low bar except last week every non-"All" chip returned nothing because it was filtering on a field that didn't exist. That's a real bug, really dead, good riddance. Then out of curiosity I tap "Cardio" — empty. Every time. Not a bug in this session's diff, but if you're going to put a Cardio chip in front of me, put something behind it.

Then I go check progress, because that's the whole reason I open this app outside of workout hours. Dashboard → Progress → tap Chest. Card said something about my week. Detail page opens on Month by default. Numbers jump. I didn't touch anything and the window changed under me. Then I go to change the range on this page — the pills are so small I miss on the first tap almost every time, phone chalked up, one thumb. That's not a vibe thing, that's a "I fat-fingered 3M instead of 6M and now I'm reading the wrong chart" thing.

## Gap scorecard

**1. Drill-down consistency (range-filter.js, exercise/muscle/metric detail)** — **Partially closed.** The *state* is genuinely unified — one `RANGES` array, one persisted `AppState.dashboardRange`, survives reload. But the *UI* isn't: exercise-detail and muscle-group-detail still hand-roll their own `.range-pills` widget instead of calling the `renderRangeFilter()` helper that was built specifically for this, and that widget has no `min-height` at all — it renders at roughly half the app's own 36px minimum. Metric-detail also never got the "View all time" empty-state treatment that exercise/muscle-group got — it's still bare zeros with no button. And the Progress page (the actual entry point into all this) hardcodes `'W'` and has no range picker of its own, so the number you tap from and the number you land on can already disagree.

**2. Exercise picker unification (active-workout-ui.js)** — **Mostly closed.** The real bug — every non-"All" chip returning empty because it filtered on a field the library never had — is fixed, verified, and it's a genuinely good fix (one shared bucket helper, three call sites). The one gap: the new "Cardio" chip is a guaranteed dead end because `data/exercises.json` ships zero exercises tagged `bodyPart: 'Cardio'`. Taxonomy is unified; the data behind one bucket of it isn't there.

**3. Workout editor gets its own page (template-selection.js, workout-editor-section)** — **Closed.** This is the standout of the session. Matches the approved mockup closely, list is genuinely read-first, editor owns the viewport, Start bar is always reachable, all the autosave/stepper/reorder machinery carried over intact. My only nitpicks are small (a 28px remove button, some now-dead CSS for a chevron-rotate that can't fire anymore) — nothing that changes the verdict.

## Fix-first list

1. **[P1] Exercise detail / Muscle-group detail — range pills are ~22px tall, under half the app's own 36px minimum.** `js/core/ui/exercise-detail-ui.js` (`renderRangePills`) and `js/core/ui/muscle-group-detail-ui.js` (`renderRangePills`) hand-roll a `.range-pills` widget (`styles/pages/detail-pages.css`, `padding: 5px 0`, `font-size: var(--font-2xs)`, no `min-height`) instead of using the shared `renderRangeFilter()` in `js/core/features/metrics/range-filter.js`, which is already correctly sized (`min-height: var(--tap-sm)`, `styles/components/range-filter.css`) and already used successfully by metric-detail. Six pills now (W/M/3M/6M/Y/All) makes this worse than before. This is the exact screen I check progress on every day — fix it by pointing both detail pages at `renderRangeFilter()` instead of their own markup, same pattern metric-detail already proves out.

2. **[P1] Progress page — body-part cards are hardcoded to `'W'` with no range picker, but the drill-downs they lead into default to Month.** `js/core/ui/dashboard-ui.js` `renderProgressPage()` calls `aggregateBodyPartStats(allWorkouts, bp, 'W')` unconditionally. Tap a card, land on `muscle-group-detail-ui.js` at whatever `AppState.dashboardRange` currently is (Month by default) — the numbers visibly change between the tap and the landing with no explanation. Either give the Progress page cards the same range control, or make the tap-through explicitly carry `'W'` into the destination so what I see matches what I tapped.

3. **[P2] Exercise/add-exercise sheets — "Cardio" chip returns zero results for every user.** `js/core/workout/active-workout-ui.js` (`AW_EX_CATEGORIES`) added a Cardio bucket, but `data/exercises.json` has no exercise tagged `bodyPart: "Cardio"` (verified: zero matches). Seed 5-8 real ones — treadmill, stationary bike, rowing machine, elliptical, stair climber, jump rope — so the chip isn't a dead end on day one.

4. **[P2] Metric-detail (Volume by body part, Strength · Top lifts) — no empty-range CTA.** `js/core/ui/metric-detail-ui.js` `renderVolumeBodyPartDetail` / `renderStrengthDetail` still show a bare "0 lb" hero or a plain "No compound lift data in this range" line with no way to widen the range, while exercise/muscle-group detail got a proper `.empty-state` + "View all time" button for the identical problem. Same fix, same file pattern (`renderEmptyRange` in exercise-detail-ui.js) — port it over.

5. **[P2] Progress page — Cardio has no home.** `BODY_PARTS` in `dashboard-ui.js` is `['chest','back','legs','shoulders','arms','core']` — no cardio bucket. You can now add a cardio exercise via the unified picker, but it'll never show up in "Training balance" or any body-part card. Either add a Cardio card or explicitly route cardio volume into a "Conditioning" summary somewhere on Progress.

6. **[P3] Workout editor — remove-exercise (×) button is 28×28px.** `styles/pages/templates.css` (`.te-row__remove`), used in the new editor page. Under the app's own 36px `--tap-sm` floor, let alone the 44px standard the rest of this session's polish work (back buttons, range pills, calendar cells) has been ratcheting toward. Small but it's a delete action — worth the extra 8-16px.

7. **[P3] Dead CSS from the Phase 3b refactor.** `.template-row__chev--open` (rotate-on-expand) and `.template-row.expanded` (`styles/pages/templates.css`) can no longer fire — there's no in-place expansion left to trigger them. Already flagged as open in `docs/ux-overhaul-plan-2026-07.md` under the tracked "~40% dead code" follow-up — just noting it's still there.

8. **[P3] Metric-detail's range pills are wired via a regex string-replace on rendered HTML.** `js/core/ui/metric-detail-ui.js`: `renderRangeFilter(range).replace(/setDashboardRange/g, 'setDetailRange')`. Works today, but it's a landmine — rename anything in `range-filter.js` and this silently breaks with no compile error. Give `renderRangeFilter()` a handler-name param instead.

## What's genuinely good now

- **The workout editor page is the real win of this session.** Read-first list (category, "Usually Fri," count, duration, last-done all visible without a tap) + a dedicated editor page that doesn't fight a scrolling sibling list anymore. Start button is always where my thumb is. This is exactly the ergonomic fix the app needed — protect this, don't let it regress back toward inline accordions.
- **The dead category-filter bug is actually dead.** Every add-exercise chip used to silently return nothing except "All." That's fixed, verified in the diff, and it's the kind of bug that quietly makes people think the app is broken rather than realize it's one bad filter.
- **One workout-detail modal instead of two competing ones.** `viewWorkout` now routes through `showFixedWorkoutModal` everywhere (Edit/Repeat/Save as workout/Delete) — I don't get a different, weaker popup depending on where I tapped from anymore.
- **Range picks now survive a reload.** Small thing, but not having to re-pick "Month" every time I reopen the app is the kind of detail that makes an app feel considered instead of assembled.
- **The empty-range state on exercise/muscle-group detail is done right.** Clear title, honest reason, one-tap "View all time" — no more staring at a screen of zeros wondering if the app is broken. I just want the other two screens (Progress, metric-detail) held to the same bar.

## Verdict

Closer, and the editor-page rebuild alone is worth the session — but "one shared range" is still two different widgets wearing the same name, and a Cardio chip that goes nowhere is the kind of thing a new user hits in week one and remembers. **3/5 dumbbells** — real progress, not yet the "one system" the commit messages claim.
