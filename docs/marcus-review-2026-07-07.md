# Marcus live re-review — 2026-07-07 (dev.bigsurf.fit)

> In-character LIVE BROWSER review by the `gym-bro-reviewer` agent ("Marcus"),
> walking https://dev.bigsurf.fit on the test account (`klaperriere87@gmail.com`
> — verified before anything else; safety gate passed). Phone-ish viewport
> (~344-390px). Re-review of [marcus-review-2026-07.md](marcus-review-2026-07.md)
> after the "Marcus re-review batch" in
> [ux-overhaul-plan-2026-07.md](ux-overhaul-plan-2026-07.md).
>
> **Live at review time:** editor-on-own-page list, shared range filter,
> freestyle Quick start, archive, equipment cleanup migration prompt, Phase 1
> equipment-on-PR-rows, Phase 2 dashboard V3 ("This week" card), onboarding.
>
> **What I actually did:** full onboarding → started "Test 56789" from the
> dashboard → logged sets (changed weight, empty-set test, equipment sheet,
> fast-path chips, added Lat Pulldown mid-workout) → finished → summary →
> Progress → muscle-group + exercise + metric drill-downs → History calendar →
> workout detail → Workouts list → editor page. Equipment cleanup migration was
> RUN on the test account (merged 0, renamed 1 reference). AI Coach, equipment
> library, settings, body measurements not deeply re-walked this round.
>
> **Review-environment caveats:** CDP mouse clicks broke mid-run (renderer input
> dispatch timeouts — not an app bug), so interactions were driven via JS;
> tap-target checks were done by measuring real rendered boxes
> (getBoundingClientRect), which is precise but means I didn't literally
> fat-finger anything today. Sparse test data (11 workouts, most from Nov/Dec)
> limited chart judgment — most charts had 1-2 points.
>
> **Verdict: 3/5 dumbbells** — the logging flow is the best it's ever been
> (prefill, +5 badge, stall hints — this is the app I wanted), but the numbers
> layer now tells me things that are flat-out wrong: my evening workout is
> "Yesterday", my leg day doesn't exist, and "this week" is computed over all
> time. Logging is a 4; trust-the-numbers is a 2.

---

# Big Surf live re-review — Marcus, Tuesday night, actually pressing the buttons

## Gut check

First the good news: I started a workout, and the set-logging loop is genuinely
great now. Last session's numbers pre-filled, I typed one weight, the +5 badge
popped when I beat it, and the app literally told me "Stalled at 10 lbs for 3
sessions — try 15 or a back-off set." That's the sentence I've been asking every
tracking app to say to me for years. Rest banner is one glanceable green line
with +30s/Skip. The finish confirm says "Keep lifting / Finish workout" instead
of OK/Cancel. Somebody read the copy rules.

Then I finished, looked at the dashboard, and the workout I completed **two
minutes ago** said **"Yesterday."** I checked History — same workout says
"Today." Then I opened Progress and my leg day — 3 sets of Leg Extension, just
logged — showed **"Legs · LOW · 0 SETS · 0 lbs · ⚠ Last trained 231 days
ago."** I trained legs *today*, twice this half-year, and the app is telling me
I haven't touched them since November. If I were a real user I'd stop trusting
every number on this screen, and the numbers are the reason I open the app
outside the gym.

Also, before ANY of that: cold start took about two minutes of splash screens
and the page reloading itself, with a "Equipment Cleanup Ready" wrench modal
as the first thing a user sees. More below — it's a version constant.

## Gap scorecard (vs marcus-review-2026-07.md fix-first list)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | [P1] Detail-page range pills ~22px, hand-rolled | **CLOSED** | Both detail pages now render the shared widget — `renderRangeFilter(range, 'setExerciseRange')` at [exercise-detail-ui.js:96](../js/core/ui/exercise-detail-ui.js), `'setMuscleRange'` at [muscle-group-detail-ui.js:61](../js/core/ui/muscle-group-detail-ui.js). Measured live: 40×36px per pill. |
| 2 | [P1] Progress cards hardcode 'W', drill-down opens on M | **CLOSED** | Verified live: `AppState.dashboardRange` was 'M', tapped a Progress body-part card, drill-down opened with range 'W' and header "past week". Numbers no longer jump between tap and landing. |
| 3 | [P2] Cardio chip returns zero results | **OPEN** | Live: Cardio chip in the add-exercise sheet → "No exercises found", every time. The six cardio rows went into `data/exercises.json`, but signed-in users read defaults from the Firestore `exercises` collection — exactly the ⚠ flagged in ux-overhaul-plan-2026-07.md. The seed never shipped to where users read from. Week-one dead end, still live. |
| 4 | [P2] Metric-detail empty-range CTA | **PARTIAL** | Volume-by-body-part: works (`total > 0` gate, [metric-detail-ui.js:243](../js/core/ui/metric-detail-ui.js)). Strength · Top Lifts: **dead code** — `breakdown: liftRows \|\| mdEmptyRange(...)` at :303, but `liftRows` maps over a constant 4-lift array and is never falsy. Live on W with zero data: hero "0lb combined" + four 0-rows, no "View all time" button. The gate should be `totalCurrent > 0 ? liftRows : mdEmptyRange(...)`. |
| 5 | [P2] Cardio's home on Progress | **OPEN (acknowledged)** | Plan defers it to a duration-based cardio model; `BODY_PARTS` in dashboard-ui.js unchanged. Fair, but items 3+5 together mean "cardio" is a chip that lies and a bucket that doesn't exist. |
| 6 | [P3] `.te-row__remove` 28px | **CLOSED** | Measured live in the editor page: 36×36. |
| 7 | [P3] Dead chevron CSS from 3b | **OPEN (tracked)** | Still parked under the dead-code follow-up; didn't re-audit CSS this round. |
| 8 | [P3] Regex handler rewire on range pills | **CLOSED** | `renderRangeFilter(range, handler)` param exists; metric-detail passes `'setDetailRange'` directly ([metric-detail-ui.js:138](../js/core/ui/metric-detail-ui.js)). No `.replace()` remains. |

**Score: 4 closed, 1 partial, 3 open.** The widget-level promises were kept —
the pills, the range handoff, the remove button are all genuinely fixed. What's
still open is the data half: cardio rows that never reached Firestore, and an
empty-state gate that can't fire.

## What I'd love (specific, keep these)

- **The logging loop.** Prefill from last session, tap check, done. The **▲ +5
  badge** when I beat last time, and the **stall insight** ("Stalled at 10 lbs
  for 3 sessions — try 15 or a back-off set") on the exercise card — this is
  the coaching moment every competitor buries in a paywall. Protect it.
- **Set-row ergonomics.** 44×44 check circles, 40px inputs, 67px rows —
  measured, not vibes. Chalk-hand approved.
- **Rest banner.** One line, huge numbers, +30s/Skip, then a single "READY FOR
  YOUR NEXT SET · Dismiss" line. Glanceable from the rack.
- **Finish confirm.** "Finish workout with 4 incomplete sets?" + "Keep lifting"
  / "Finish workout". Best dialog in the app.
- **The editor page + read-first list** held up: category chips 39px, day chips
  38×44 buttons, last-session meta under each exercise row, Start pinned.
- **Equipment fast-path chips** (Skip equipment / Dumbbells / Barbell / Cable
  machine) — picked "Barbell" in two taps, and a plate-calculator button
  appeared on the exercise header because it knew I was on a barbell. Slick.
- **Onboarding**: 5 short steps, skip on every one, sentence case, "All set".
- **PR rows carry equipment** now (Barbell Curl PR shows "· Barbell)". Phase 1
  promise kept.

## What'd make me put my phone down (worst first)

1. **My finished workout says "Yesterday" on the dashboard.** History says
   "Today" for the same doc, Workouts list says "Last done today". Three
   screens, two answers. Root cause: `getDateString(Date)` runs
   `value.toISOString()` — **UTC** — at [date-helpers.js:44-47](../js/core/utils/date-helpers.js),
   so `todayStr` inside `formatRelativeDate` ([date-helpers.js:107](../js/core/utils/date-helpers.js))
   flips to tomorrow at 7pm CDT. Every workout an evening user logs will read
   "Yesterday" on the dashboard's This-week row ([dashboard-ui.js:753](../js/core/ui/dashboard-ui.js)).
   Verified live: doc `date: "2026-07-07"`, local time 22:04 July 7, row says
   "Yesterday". This is the CLAUDE.md timezone rule violated inside the date
   helper itself — any consumer that passes a `Date` gets a UTC date string.

2. **Leg day doesn't exist.** Logged 3 sets of Leg Extension; Progress says
   "Legs · LOW · 0 SETS", volume 0, "⚠ Last trained 231 days ago"; Legs
   drill-down on All time lists only Hip Thrust + Seated Leg Curl. Cause:
   `BP_MAP` at [aggregators.js:44-47](../js/core/features/metrics/aggregators.js)
   folds ONLY `glutes` → legs. Any library exercise with a granular bodyPart —
   Quads, Hamstrings, Calves, Biceps, Triceps, Abs, Lower Back — returns that
   raw string from `classifyBodyPart` (:57 `return BP_MAP[bp] || bp`) and lands
   in a bucket no screen renders. Proof on one screen: Volume-by-body-part hero
   says **2,240 lb** for the week, the six breakdown rows sum to **1,990** —
   the missing 250 is my quads, invisible. All-time: hero 19.4k, rows 9.9k —
   half the volume unclassified. Meanwhile the add-exercise sheet's
   `awExerciseBucket` ([active-workout-ui.js:2842-2854](../js/core/workout/active-workout-ui.js))
   folds all of these correctly, and training-insights uses raw granular parts
   (hence the dashboard saying "**Lower Back** is low" — a body part that
   isn't in the approved taxonomy). Three taxonomies, one approved list. Move
   one fold helper to a shared module and use it in all three places.

3. **"This week" is computed over all time.** The dashboard's third This-week
   row said "Lower Back is low this week — 3 sets" when the account had ZERO
   workouts in the past week (those 3 sets are from November). Cause:
   [dashboard-ui.js:794](../js/core/ui/dashboard-ui.js) —
   `new Date(getDateString())`: `getDateString()` with no arg returns `''`,
   `new Date('')` is Invalid Date, `weekStartStr` becomes `''`, and the filter
   `w.date >= ''` passes **every workout ever**. The headline the dashboard
   leads with is built on a broken week filter.

4. **Cold start is ~2 minutes of the app fighting itself.** Every single load:
   "Clearing outdated service worker cache… Deleted big-surf-v8.13… reloading".
   The gate at [index.html:1373](../index.html) requires `'v4.55'` in cache
   names; the service worker ([service-worker.js:4](../service-worker.js))
   creates `big-surf-v8.13-catalog-search-geocode`. They can never agree — so
   every visit deletes the cache, unregisters the SW, reloads, and then boot
   re-registers the same SW ([notification-helper.js:19](../js/core/utils/notification-helper.js))
   for the next visit to nuke again. I watched the page self-reload twice
   before the dashboard appeared. This also permanently defeats offline
   caching. One constant fixes it.
   Related latent hang: `await initializeNotifications()` sits in the boot
   chain BEFORE `hideLoadingScreen()`
   ([app-initialization.js:546](../js/core/app-initialization.js)), and inside
   it `await Notification.requestPermission()`
   ([notification-helper.js:26](../js/core/utils/notification-helper.js))
   blocks until the user answers the prompt — ignore it and you stare at the
   splash forever. Notification permission has no business gating first paint.

5. **The first thing a new-ish user sees is a data-migration wizard.** Boot →
   splash → "Equipment Cleanup Ready" with "Run Cleanup / Download Backup /
   Not Now" ([app-initialization.js:765-777](../js/core/app-initialization.js)).
   I get why it exists, but it's Title Case, it leads with backup anxiety
   ("if anything looks wrong…"), it comes back every boot until you run it,
   and it fires before I've seen my own dashboard. Move it to a Settings
   badge / dashboard banner, and sentence-case it ("Equipment cleanup ready",
   "Run cleanup", "Not now").

6. **An empty set completes as 0×0.** Tapped the check on a blank row: "Set 3
   done", `0 reps × 0 lbs` stored. Nothing warns me. Then the numbers disagree
   everywhere: completion summary "5 SETS", History row "6 sets", detail modal
   shows 5. [active-workout-ui.js:1377-1390](../js/core/workout/active-workout-ui.js)
   (`awToggleSet`) falls back to `|| 0` for both fields and completes
   unconditionally. Either prefill the target and complete honestly, or refuse
   with "Add reps first".

7. **PR celebration double-counts.** Summary said "4 new PRs" including Leg
   Extension **10 lbs × 10** AND **15 lbs × 10** — two PRs for one exercise in
   one session (each set beat the store at the moment it was logged). The
   dashboard banner says "3 new PRs today!" because `getRecentPRs` dedupes by
   key. [workout-session.js:516-520, 748-752](../js/core/workout/workout-session.js)
   should collapse to best-per-exercise+equipment before rendering. Also: the
   10×10@10lbs "PR" was literally identical to the last session 214 days ago —
   equal-to-old-numbers becoming a "PR" because the equipment key changed
   (old session had equipment, mine was blank) is celebration inflation.

## Missing for a guy like me

- **Target-based prefill when there's no history.** Barbell Curl had "12 reps
  target" in its own subtitle and rendered six empty boxes. Strong/Hevy
  prefill the target; here I type reps AND weight for every set of any new
  exercise, mid-workout. Same for set 3 of Leg Extension (last session only
  had 2 sets — the 3rd row should inherit the target and previous weight).
- **"+1020% volume vs. last Test 56789 · 200 lbs"** ([workout-session.js:658](../js/core/workout/workout-session.js))
  — a four-digit percent against a 200-lb baseline is noise wearing a stat's
  clothes. Suppress or reword the compare when the prior session is tiny.
- **Cardio, still.** The chip is there, the bucket isn't (scorecard #3/#5).
  Either ship the Firestore rows + a Conditioning line, or pull the chip until
  it has something behind it.
- **A "workout done" state on the For Today hero.** I finished Test 56789 and
  the hero still says "Up today: Test 56789 · Start workout" like nothing
  happened. Strong shows a checkmark; give me the dopamine.

## Fix-first list

1. **[P1] date-helpers.js — `getDateString(Date)` must use local components,
   not `toISOString()`** ([date-helpers.js:44-47](../js/core/utils/date-helpers.js)).
   Every evening workout reads "Yesterday" on the dashboard for any user west
   of UTC; any Date-arg caller gets UTC-skewed strings. One function, app-wide
   blast radius — fix + unit test with a fake 10pm CDT clock.

2. **[P1] aggregators.js — fold granular body parts into the 6 buckets**
   ([aggregators.js:44-47, 57](../js/core/features/metrics/aggregators.js)).
   Quads/Hamstrings/Calves/Biceps/Triceps/Abs/Lower Back currently vanish from
   training balance, drill-downs, and volume breakdowns (leg day = 0 sets).
   Reuse/extract `awExerciseBucket` ([active-workout-ui.js:2842](../js/core/workout/active-workout-ui.js))
   as the ONE shared classifier and point training-insights' display labels at
   the same taxonomy ("Lower Back is low" is not an approved body part).
   Regression test: an exercise tagged each granular part lands in a visible
   bucket; breakdown rows sum to the hero total.

3. **[P1] dashboard-ui.js — fix the broken week filter**
   ([dashboard-ui.js:794](../js/core/ui/dashboard-ui.js)):
   `new Date(getDateString())` is Invalid Date → "this week" headline analyzes
   all history. `const weekStart = new Date(); weekStart.setDate(…)` like the
   sibling code at :900 — or better, a shared `startOfWeek()` helper.

4. **[P1] index.html / service-worker.js — reconcile the SW version gate**
   ([index.html:1373](../index.html) `'v4.55'` vs
   [service-worker.js:4](../service-worker.js) `big-surf-v8.13…`). Every load
   self-nukes and reloads; cold start ~2 min; offline cache permanently
   defeated. Derive one constant from the other (or have the gate read the SW's
   actual version via message) so this can't drift again. While in there: move
   `Notification.requestPermission()` out of the awaited boot path
   ([app-initialization.js:546](../js/core/app-initialization.js),
   [notification-helper.js:26](../js/core/utils/notification-helper.js)).

5. **[P2] active-workout-ui.js — don't complete empty sets as 0×0**
   ([active-workout-ui.js:1377-1390](../js/core/workout/active-workout-ui.js)).
   Prefill target reps + last/current weight on check, or block with "Add reps
   first". Also reconciles the 5-vs-6 set-count disagreement between summary,
   history row, and detail modal.

6. **[P2] workout-session.js — dedupe the summary PR list to
   best-per-exercise+equipment** ([workout-session.js:516-520, 748](../js/core/workout/workout-session.js))
   so the summary and the dashboard banner agree, and a same-numbers-as-last-time
   set can't be a "PR" just because the equipment key went blank.

7. **[P2] metric-detail-ui.js — make the strength empty-CTA reachable**
   ([metric-detail-ui.js:303](../js/core/ui/metric-detail-ui.js)):
   `totalCurrent > 0 ? liftRows : mdEmptyRange('No compound lift data in this
   range.', range)`. Finishes scorecard item 4. And sentence-case the titles
   while there: "Volume by body part" (:235), "Strength · top lifts" (:295).

8. **[P2] Seed the 6 cardio exercises into the Firestore `exercises`
   collection** (owner action — prod data write, agents shouldn't). Until
   then the Cardio chip is a guaranteed dead end for every real user. Add a
   "Create exercise" CTA to the sheet's "No exercises found" state too.

9. **[P2] Completion compare — suppress/reword the percent when the baseline
   is tiny** ([workout-session.js:658](../js/core/workout/workout-session.js)).
   "+1020%" is not information.

10. **[P2] index.html:899 + start-workout flow — "New Location Detected"**:
    sentence case, drop the exclamation ("New location — what gym is this?"),
    and consider deferring the prompt until after the first set instead of
    between me and my warm-up. Buttons: "Save location" / "Skip".

11. **[P3] muscle-group-detail-ui.js:152 — PR rows render raw ISO dates**
    ("2026-07-07 · 10 reps"). Use `formatRelativeDate` like every sibling row
    (after fix #1 lands, or it'll say Yesterday).

12. **[P3] Pluralization sweep on drill-downs**: "1 sessions · past week"
    ([muscle-group-detail-ui.js:56, 136](../js/core/ui/muscle-group-detail-ui.js)),
    "${sessions} sessions · ${sets} sets" ([metric-detail-ui.js:224](../js/core/ui/metric-detail-ui.js)),
    plus "past all time" → "all time". The correct `session${n !== 1 ? 's' : ''}`
    pattern already lives in equipment-library-ui.js:376 — copy it.

13. **[P3] active-workout-ui.js:231 — "Save as template" → "Save as workout"**
    (CLAUDE.md terminology table; the completion summary already says "Save as
    workout" — the kebab menu disagrees with its own sibling).

14. **[P3] workout-session.js:43-46 — "1 exercise(s) added, 1 exercise(s)
    swapped"**: real plurals, and "swapped" fired when I only changed
    equipment + added one exercise — check the change classifier.

15. **[P3] dashboard-ui.js:868 — "⚠ Last trained — days ago"** on never-trained
    body parts → "Not trained yet".

16. **[P3] Equipment line label** ([active-workout-ui.js:587-589 + 1367](../js/core/workout/active-workout-ui.js))
    falls back through `exercise.machine`, so a machine-named exercise shows
    "⚙ Leg Extension" as if equipment were chosen and "Choose equipment" never
    appears. Show "Choose equipment" (or "Leg Extension · pick one") until a
    real equipment doc/fast-path is picked.

17. **[P3] Search placeholder drift**: "Search workouts & exercises" /
    "Search exercises or workouts…" / "Search exercises" (no ellipsis) — one
    canonical phrasing per the copy rules.

18. **[P3] History month rows list exercises out of workout order**
    ("Barbell Curl, Lat Pulldown, Leg Extension" for a Leg-Extension-first
    session) — preserve exercises order.

## Verdict

The lifting half of this app is now genuinely good — prefill, +5 badges, stall
hints, a rest banner I can read from the rack, and the editor page held every
promise from last time (4 of 8 gaps closed clean, scorecard above). But the
half that's supposed to tell me the truth about my training told me three lies
in ten minutes: today is yesterday, leg day never happened, and "this week"
means "since forever". Those are one-line fixes sitting in load-bearing
helpers — which is exactly why they're scary.

**3/5 dumbbells.** Same score, different reason: last time the widgets didn't
match; this time the widgets are great and the *data under them* is wrong.
Fix the four P1s and this is a 4 the day they ship.
