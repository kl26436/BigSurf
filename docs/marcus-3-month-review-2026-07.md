# Marcus 3-month coach-program review — 2026-07-07

> In-character longitudinal UX review by the `gym-bro-reviewer` agent ("Marcus",
> a daily lifter who lives in his tracking app), simulating his first three
> months living with the coach "trust mode" program system — checkpoint diaries
> at day 1, week 1, month 1, month 2, and month 3, each with a dev-ready punch
> list.
>
> **Context reviewed (all live on dev at review time):**
> - `docs/coach-program-design.md` — canonical Phase 9 design (rungs 1+2 shipped 2026-07-07)
> - Client program layer: `program-session.js`, `coach-context.js`, `ai-coach-ui.js`
> - Server tools: `functions/coach-tools.js`, `functions/index.js` (create/adjust_program, weekly review)
> - Dashboard Today-card path (`dashboard-ui.js`), week-plan reflow (`week-plan.js`),
>   outcome scoring (`coach-outcomes.js`), settings surface (`settings-ui.js`)
>
> **Verdict: 3/5 dumbbells** — rung 2's dashboard integration is the real thing
> (one-tap, glanceable, correctly quiet on baseline weeks). But rung 1 is
> functionally invisible to a habit-driven user, program-end and outcome payoffs
> never surface without being asked, and the weekly review doesn't know the
> program exists.

---

# Marcus's 3-month diary — Big Surf coach programs

## Day 1 — I ask for a program, it builds one, and nobody asks me twice

**What happened.** AI Coach is a real bottom-nav tab, good, not buried in More. Empty state is clean — "Ask anything," four starter cards (plateau, volume, deload, split). None of them say "program." Nobody told me that word exists, so I only find this because I already know to type "give me a 4-week strength program." I type it as a flat command, not a question.

The spinner flips from "Analyzing your training data…" to "Building your program…" — that live status swap (`ai-coach-ui.js` streams `ev.type === 'status'` text mid-response) is a genuinely nice touch, I can tell it's actually doing something instead of staring at a dead spinner for 6 seconds. It creates a few templates first, then drops a card: "Program: Strength block — 4 weeks · 4 weeks · strength · Mon: Push, Tue: Pull, Wed: Legs…" I tap it, it opens the week-plan sheet with my days already filled in. I can edit it right there and hit Save.

**What hit.** The card→sheet handoff is smooth, and because the sheet is editable I get a real "wait, that's wrong, fix it" moment even if it's after the fact. Also: because I gave a direct command ("give me a program"), the consent rule in `functions/index.js` treats that as consent already — it didn't stall on "are you sure?" It just built it. For a guy who hates being asked "are you sure" three times, that's correct.

**What pissed me off.** Here's the thing nobody told me: by the time I see that card, my week plan has ALREADY been rewritten. `create_program` in `functions/coach-tools.js` (line 527) writes the Firestore doc and calls `set_week_plan` *before* it returns the card — the card is a receipt, not a proposal. Compare that to the deload card I get later in the month (`renderSessionAdjustmentCard`, `ai-coach-ui.js` line 625) which has actual **Start session / Dismiss** buttons and does nothing until I tap. Same visual widget (`.coach-action-card`), two completely different contracts. I tapped the program card expecting to review-then-accept, and instead I opened a sheet showing me stuff that already happened. First trust test of the whole feature and it's a bait-and-switch on my mental model of what a "card" means in this app.

Also: I just committed to a month of programming and got… nothing. No confirmation screen, no "You're locked in through August," no hype at all. This app celebrates PRs. It should celebrate "I just planned my whole month" too. It doesn't.

**Punch list — Day 1**
1. `[High]` `functions/coach-tools.js` `create_program`/`adjust_program` — give the program card the same tap-to-apply contract as `renderSessionAdjustmentCard`, OR if it has to stay write-then-receipt (fine, keep the copy-rule "no are-you-sure" spirit), make the card visually distinct from the session-adjustment card so I don't learn the wrong lesson about what tapping a coach card does.
2. `[Med]` `js/core/features/ai-coach-ui.js` `handleCoachActionCard()` (line 546) — the `program_set` card has no Dismiss/Undo. If I hate the split it just built, my only recovery is manually re-editing the week-plan sheet or asking the coach again — add an obvious "Undo" the same session, since it's a low-stakes action but I shouldn't have to know that.
3. `[Low]` `getContextualPrompts()` (`ai-coach-ui.js` line 58) — add one program-shaped starter card ("Plan a 4-week strength block"). Right now this feature only exists for people who already know the magic word.
4. `[Low]` Give program creation a one-line landing moment — even just "Program set. 4 weeks. Deload lands week 4." rendered bigger than a normal chat card. It's the biggest commitment in this whole feature and it currently reads exactly like every other chat reply.

---

## Week 1 — baseline week, and I learn a bad lesson fast

**What happened.** Week 1 of my block is `weightPct: 0` — a normal week by design (canonical design doc's own example). I open the coach a couple times mid-workout and ask "what's today?" out of curiosity. I get a paragraph back — accurate, references the program, no card because there's nothing to adjust. Takes: open coach tab, type, wait 4-8 seconds for the round trip, read.

**What hit.** The coach correctly does NOT force a card onto a baseline week. It doesn't nag me with a pointless "Start — Baseline (+0%)" button either — `programSessionForToday()` (`program-session.js` line 58) explicitly returns null when `weightPct` is 0/null, so the hero renders like any normal day. That restraint is right — it would've felt like noise otherwise.

**What pissed me off.** I just proved to myself, three times, that asking the coach "what's today" is *strictly worse* than just looking at the Dashboard, which already answers that in zero taps. So by day 4 I stop asking. There is no reason for me to keep the "check the coach before starting" habit alive during three baseline weeks out of four — and that's exactly the habit I'd need to have already built by the time week 4's deload shows up. `programSessionForToday()` only fires the program-adjusted hero when `trustLevel === 'auto_confirm'` — which I haven't turned on yet — so during propose-only, the ONLY door into the program is a chat message I have zero incentive to send on 75% of days. The value (the one week that matters) is rare; the habit needed to catch it has to run every day. That's backwards.

**Punch list — Week 1**
5. `[High]` `js/core/ui/dashboard-ui.js` `renderForTodayHero()` (line 650) — even in propose-only trust, put a quiet one-line signal on the Today hero when the program has a nonbaseline target coming ("Program: heavy week starts Friday" or similar), so I don't need to remember to ask. Doesn't have to auto-apply anything — just don't make the ONLY signal path be "type a question and wait for an LLM."
6. `[Med]` If that's out of scope, at minimum surface it as a badge/dot on the coach tab icon itself on adjustment days, so the "ask the coach" habit has a reason to exist without me proactively wondering.

---

## Month 1 — the deload week, and program-end goes out with a whisper

**What happened.** Week 4 rolls around — deload, −40%. Two ways this goes, and I lived both in my head because the code makes both equally likely:

*If I remember to ask the coach:* I get a real `propose_session_adjustments` card — "Start Push day — Deload · −40% weight · today only, workout unchanged" — tap Start session, and my working sets are pre-filled lighter, correctly plate-rounded. This is good. The "today only, workout unchanged" line is exactly the reassurance I need — I don't think it nuked my template.

*If I don't (the realistic case per Week 1):* I open Dashboard like always, tap Start workout, and get my normal weights. Nothing warns me. No banner says "hey, this is deload week." I grind a full week at last week's numbers on what was supposed to be a recovery week, and only find out later — if I ever ask — that the app "had a plan" I never saw.

Then week 4 ends. Program is now "FINISHED." I check — dashboard shows nothing different, no banner, no "your block is done," and definitely no confetti. `buildProgramContext()` (`coach-context.js` line 116) puts that "FINISHED — only propose next if asked" line into the LLM's context, but literally nowhere in the app does a human read it unless they open the coach and ask.

**What hit.** The math when it DOES land (scenario one) is legit — real plate-rounded numbers, no half-baked weights, and the "workout unchanged" copy genuinely defuses the "did it break my template" anxiety I'd have.

**What pissed me off.** I just finished a real commitment — 4 weeks, including a deload I may or may not have gotten — and the app said nothing. Nothing when it ended, nothing suggesting the next block, nothing that felt earned. That's the exact opposite of the "PRs and streaks feel earned" thing this app is supposed to be good at. And because "the coach proposes the next block only when asked" is a hard design rule (docs/coach-program-design.md, "why no scheduled generation" section), if I don't re-open the coach on my own, the program concept just quietly stops existing. Nobody — not me, not the dev's usage data — gets a signal that it ended.

**Punch list — Month 1**
7. `[High]` The default "Start workout" tap during propose-only trust NEVER applies the program adjustment (`programSessionForToday()` gates on `trustLevel === 'auto_confirm'`, `program-session.js` line 53). At minimum, on a week with a nonzero target, the plain Start button should show a one-line prompt or badge ("Deload week — ask the coach for adjusted weights") so my default habit doesn't blow past the one week the whole program exists for.
8. `[High]` Add a program-completion moment — dashboard card, notification, anything — the day `finished` flips true. Even a plain "Your 4-week block is done. Start another?" one-tap prompt would close the loop and match how the rest of the app treats milestones.
9. `[Med]` `js/core/workout/workout-session.js` / history detail — `sessionLabel`/`basedOn` are written to the workout doc (`program-session.js` line 95-97) but never rendered anywhere I found (grep across `js/core/workout` and `js/core/ui` turned up zero renders). Show "Deload · week 4 of your program" on the completed-workout card and in history — otherwise even the one week that worked leaves no trace I can point at later.

---

## Month 2 — auto mode, and this is where the good design finally pays off (mostly)

**What happened.** I tell the coach "turn on auto mode." It confirms via `adjust_program` and a card. From here on, adjustment weeks show up right on the Dashboard hero: "Start — Heavy (+5%)" with the meta line reading "Heavy · +5% weight · week 3 of your program" right under the workout name. Baseline weeks still render like normal days — no chrome, no nagging (`programSessionForToday` intentionally returns null for `weightPct: 0`). Tap Start, weights are already bumped and plate-rounded before I even see the set rows.

**What hit.** This is the app I wanted from Day 1. Zero extra taps — the exact same "Start workout" gesture I'd do anyway, and it just already knows. The restraint on baseline weeks means it never feels like a nag, and the meta line answering "why is it heavier today" right on the card (not buried a tap away) is exactly the "glance across the rack" ethos this app is supposed to have everywhere. This is where the "thin layer, no cron, derive-don't-store" architecture stops being invisible plumbing and becomes a felt good decision — the button I already tap just got smarter, instead of a new button I have to learn.

**What pissed me off.** Two things, both real:

1. I go on a work trip — 3 days trained instead of 6. The program's week counter doesn't care. `deriveProgramWeek()` (`coach-context.js` line 100) is pure calendar math off `startDate` — no adherence signal at all. So when my "deload" week lands two weeks later, it's landing against a week I barely trained, and the app never asked "hey, you missed days, want me to shift things?" I'd have to think to say that myself. Nothing proactively checks in. The one moment coaching should shine — life getting messy — is exactly where this system goes quiet.
2. I noticed my dips didn't get heavier on a "+5%" week. Turns out `startProgramSession()` (`program-session.js` line 89) only scales exercises with a real numeric weight > 0 — bodyweight/zero-weight entries are skipped, correctly, but the CTA just says "Heavy +5%" with no asterisk. Small, but I noticed, and for half a second I thought the feature was broken.
3. There's no way anywhere — not Settings, not the dashboard — to check "am I even in auto mode right now." `settings-ui.js` has a coach-goal segmented control, injuries, notes, memory sheet, weekly-review toggle — nothing about trust level. If I forget I turned it on, or wonder if it silently got flipped back, my only recourse is to ask the coach in chat and hope it tells me straight.

**Punch list — Month 2**
10. `[High]` `adjust_program` / `deriveProgramWeek` — give the program some adherence awareness. At minimum, when the weekly review or the coach detects a low-completion week, proactively surface "you trained 3 of 6 planned days last week — want me to reflow the program?" instead of waiting for me to notice and ask.
11. `[Med]` Add a visible trust-level indicator somewhere passive — a small tag on the week-plan sheet or a settings row ("Auto mode: on") — so I can self-audit without a round trip through chat.
12. `[Low]` Footnote the CTA when not every exercise scales ("+5% weight — bodyweight moves unchanged") so I don't second-guess the math.
13. `[Low]` Good thing, keep it: baseline weeks staying silent under auto mode is the right call — don't let a future "let's add more visibility" pass turn this into a banner on every session.

---

## Month 3 — the payoff loop exists, but only if I go looking for it

**What happened.** Advice is aged 2+ weeks now. I ask the coach directly, "did the deload actually work?" It answers with real numbers — "suggested deload for Bench Press; volume −38% that week; Bench Press 185→190 in the 4 weeks after" (`coach-outcomes.js` `computeAdviceOutcome`). That's genuinely satisfying — it's not just vibes, it's my own numbers reflected back with an honest "correlation, not causation" framing.

I also get the Monday weekly-review push most weeks (`functions/index.js` `weeklyCoachReview`) — "Your weekly training review is ready." Decent proactive touchpoint.

**What hit.** The outcome math is real and it's checkable, not hand-wavy. That's the right instinct — a coach that can say "here's what happened after I told you X" instead of just "trust me" is the whole differentiator over a plain notes app.

**What pissed me off.** This payoff is 100% reactive. Nothing surfaces it unless I specifically ask. There's no dashboard badge, no "your deload paid off" moment, nothing tying it to the PR I actually hit. And the one thing that DOES push to me weekly — the review — doesn't even use this data. I checked `functions/index.js`'s weekly-review prompt (~line 1737): it's a fresh Claude call over just that week's raw log and the week plan. It never touches `buildOutcomesContext` or `buildProgramContext`. So the one proactive, recurring thing this app already does never once says "remember that deload three weeks ago — it worked." Two systems that should be the same story are strangers to each other.

Honest answer on rung 3: no, not yet, and not because I'm scared of AI — because rung 2 already showed me a real gap (the travel-week problem from Month 2). Full auto without an adherence check would just automate that same blind spot with no human glance in between. Fix the "does the program know if I actually trained" problem first; then we can talk about rung 3.

Would I still be here at month 4? Mostly yes — the daily loop (log a set, see last week, hit Start) never depended on any of this, and rung 2 earned a permanent spot on my dashboard. But the "program" as its own thing probably quietly died after month 1 and never got restarted, exactly like the design doc predicted, because nobody ever asked me if I wanted another one.

**Punch list — Month 3**
14. `[High]` `functions/index.js` `weeklyCoachReview` — pull in `buildOutcomesContext`/`buildProgramContext` so the one proactive push actually references the program and past advice outcomes. Right now it's amnesia by design.
15. `[Med]` Surface at least one outcome fact proactively somewhere passive — even a single line on the coach landing screen ("Your last deload: Bench 185→190 after") — so the payoff loop doesn't require me to remember to interrogate it.
16. `[Low]` Rung 3 stays gated — agreed, correctly — but gate it explicitly on "adherence-aware reflow shipped," not just "outcome data exists," since Month 2 proved the missing adherence signal is the scarier gap, not the missing outcome data.

---

## Overall verdict — top 5 punch-list items by churn risk

1. `[High]` **`js/core/features/program-session.js` `programSessionForToday()` + `js/core/ui/dashboard-ui.js` — the default Start-workout tap never applies the program during propose-only trust.** This is the headline risk. For a guy who lives on autopilot taps, the mechanism to receive the program's whole value (the rare adjustment week) requires a habit (proactively asking the coach) that has no reason to form on the 75% of days it does nothing. The program can functionally do nothing for an entire month and nobody would know.

2. `[High]` **No program-completion signal, anywhere.** `buildProgramContext()`'s "FINISHED" branch is LLM-only text — no dashboard card, no push, no celebration. This is the exact moment a progress-chaser persona should get a hit of "you did the thing" and a nudge toward block #2, and it's silence instead. Directly costs re-engagement.

3. `[High]` **`deriveProgramWeek()` has zero adherence awareness.** Travel, sickness, a bad week — the program marches on by calendar date regardless of what actually got trained. The one moment real coaching should earn trust (life getting messy) is where this system is most naive, and it doesn't even proactively check in when it should suspect something's off.

4. `[Med]` **Action-card contract is inconsistent** — `program_set`/`week_plan_set` cards (already-written receipts, no undo) look and feel identical to `session_adjustments` cards (genuine tap-to-apply, has Dismiss) — first collision happens Day 1, when trust is most fragile.

5. `[Med]` **Trust level and program-adjusted history are invisible outside chat.** No Settings row for auto mode, no `sessionLabel`/`basedOn` rendered anywhere a completed workout is shown. Any "why did this feel off" question always routes back through opening the coach and typing — which is exactly the tax this app is supposed to eliminate everywhere else.

**Would Marcus still be here at month 4?** Yeah — but only because the app's actual daily bones (log-a-set, last-week-prefilled, one-tap Start) never depend on any of this, and rung 2's dashboard integration is genuinely the correct fix for everything rung 1 gets wrong. The "program" feature specifically, though, is on track to be a thing I used once, liked, and let quietly expire — not because the architecture is bad (derive-don't-store, no cron, pull-not-push is the right call and it shows the moment rung 2 puts it on the dashboard where my thumb already is) but because nothing in this app ever re-invites me back into it, checks whether it's actually working for me unprompted, or tells me when it stopped mattering. A coach that never checks in isn't a coach, it's a vending machine that only dispenses when I remember the password.

**5 dumbbells: 3/5.** Rung 2's dashboard integration is the real thing — one-tap, glanceable, correctly quiet on baseline weeks. But rung 1 is functionally invisible to a habit-driven user, program-end and outcome payoffs never surface without being asked, and the one proactive touchpoint that exists (weekly review) doesn't even know the program exists.
