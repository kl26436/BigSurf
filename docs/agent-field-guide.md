# Agent Field Guide — learning to build agents, with the Big Surf coach as the case study

*Started 2026-10-23. A living document: one lesson per concept, each tied to the AP-n phases in `docs/action-plan-2026-10.md` so learning and shipping happen together. Lesson 1 is written out; the rest are outlines to be filled in as each phase lands. Written for an engineer who is not a developer — the code is the evidence, not the point.*

**How to use it:** read a lesson, then do its *Check* before implementing the mapped phase. The check is always something you can observe in your own app, not a quiz. When the phase ships, come back and write two lines under *What changed* — what you expected, what actually happened. That log is how you build taste.

---

## Lesson 0 — Vocabulary (five minutes, then never think about it again)

| Word | What it means in your app |
|---|---|
| **Model** | The thing you call over HTTPS. Opus for chat, Sonnet for live mode (`functions/index.js:34`). It has no state. Every call starts from zero. |
| **Message array** | The list of `{role, content}` turns you send on every call. This *is* the model's memory. If it isn't in the array, the model doesn't know it. |
| **System prompt** | The first block, your standing instructions. `TRAINING_SCIENCE_PROMPT + COACH_TOOLS_PROMPT + memoryBlock` (`index.js:950-1086`). |
| **Context** | Everything in the array that isn't the user's question — your data dump, prior tool results, memory. "Context engineering" = deciding what goes in. |
| **Token** | ~¾ of a word. You pay per token in, per token out, every round. Your system prompt is ~3,700 tokens before the user says a word. |
| **Tool** | A function you expose to the model with a name, a `description`, and an `input_schema`. 18 chat tools + 4 live proposals in `functions/coach-tools.js`. |
| **tool_use / tool_result** | The model says "call `get_exercise_history` with `{exercise:'Chest Press'}`" (`tool_use`). Your code runs it and appends the output (`tool_result`). The model reads it next round. |
| **Turn** | One exchange with *you*: you send a question, the coach sends an answer. A conversation thread is a list of turns. |
| **Round** | One call to the model *inside* a turn. If the model answers straight away, the turn took one round. If it asks for a tool, your code runs it and calls the model again — that's round two. A turn can take several rounds; yours is capped at 12 (`index.js:1475`). You never see rounds; you only see the turn's final answer. |
| **The block** | The long piece of plain text the app pastes in front of your question on the first turn of a thread — profile, volume, lift trends, recent workouts, equipment… It is the `content` of `messages[0]` in a `coachHistory` doc. Lesson 2 is entirely about what this text should say. |
| **stop_reason** | Why the model stopped: `tool_use` (it wants a tool), `end_turn` (it's done), `max_tokens` (it ran out). Your loop keys on this (`:1489`). |
| **Agent** | Model + tools + a loop that keeps calling until `stop_reason !== 'tool_use'`. That's `coachChatStream`. Nothing more exotic. |
| **Workflow** | Code decides the steps; the model fills in one or two. Your weekly review is close to this. Cheaper and more predictable than an agent; use it whenever the steps are known in advance. |
| **Eval** | A fixed set of scenarios you run the real loop against, with assertions. The unit test of agents. You don't have one yet (AP-20). |
| **Trace** | A record of one turn: what the model saw, what it called, what came back, what it said. Without traces, "it's stupid" is unfalsifiable. |

---

## Lesson 1 — Anatomy of the coach, and why it felt stupid

**Maps to:** nothing to ship yet — this is the diagnosis. Read before AP-15.

### 1.1 The loop is the whole thing

Open `functions/index.js` at `coachChatStream` (~`:1475`). Strip the streaming and error handling and it reads:

```
msgs = [ system prompt ] + [ your context block + the user's question ]
repeat up to 12 times:
    reply = call model(msgs)
    if reply.stop_reason != 'tool_use': break        ← it answered; stream the text
    for each tool_use in reply:
        out = run the tool
        append tool_result(out)
    msgs = msgs + [reply] + [tool_results]            ← the array grows; the model re-reads ALL of it next round
```

Three facts fall out of this, and everything else in the guide is a consequence of them:

1. **The model's intelligence on a turn is bounded by the array.** It cannot look anything up that isn't in the array or reachable through a tool. It cannot remember last Tuesday's conversation unless you put it back in.
2. **Every round re-reads everything.** Round 6 pays for the system prompt, your context dump, and five rounds of tool traffic again. Long context isn't free, and stale context never expires on its own.
3. **Tools are the only way the model touches the world.** What the model can *do* is exactly the tool list. What it *knows about doing* is exactly the `description` + `input_schema` text. There is no other channel.

### 1.2 Trace one real turn

Scenario: it's Tuesday 2026-10-27, week 6 of your block — the deload week. You open the coach from the dashboard and type: **"Should I go heavier on chest press today?"**

**Step 1 — the client builds the context** (`js/core/features/ai-coach-ui.js:buildTrainingContext`, `:1156-1329`). It assembles a text block: profile, PRs, your templates (capped at 10), weekly volume by muscle, key lift trends, the last ~30 workouts in detail, equipment by gym, body composition, and a program line.

What's *in* it that's wrong: weekly volume is a 28-day **sum** labelled "last 4 weeks avg" (`:1168-1180`). 12 real chest sets/week arrives as **"Chest: 48 sets (high)"** against an MRV of 22.

What's *missing*: today's date. The weekday. That today's planned session is chest. That this week is a deload — the program line says "this week: deload (−35%)" but nothing says *do not add load*, and the recent-workout lines carry no `sessionLabel`, so last week's −35% session looks like a strength crash. Current gym. And the verdict your own code would give: `progressionTarget()` → `{action, weight, reps, stalled, rung}` is never computed for the coach at all.

This block is attached to **turn 1 only** and replayed verbatim if you reopen the thread later (`:516-527`, `:1536-1564`). Ask a follow-up in two weeks and the model is reasoning from today's snapshot.

**Step 2 — the server assembles the system prompt** (`index.js:950-1086`). ~3,700 tokens. Read `:997-1002` — the PUSH / HOLD / ADD / REMOVE matrix. That paragraph is a prose description of `progressionTarget()`. The model is being asked to *simulate your function* from raw data instead of being handed its output. The prompt also says MEV 6–8 / MRV 15–25; `config.js` says 8 / 22. Two sources of truth before the model has read the question.

**Step 3 — the model reads, thinks (xhigh), and decides.** To answer well it would have to: find "chest press" across 30 workouts, handle that some are logged in kg and some in lbs, drop warmups, decide whether last session "hit target reps cleanly," notice the deload line and connect it to *this* exercise, and remember the matrix. Each of those is a place to go wrong, and all of them are things your code already does deterministically.

Likely paths from here, all observed or predictable:

- It calls `get_exercise_history` (`coach-tools.js:650-685`). The result has raw weights with **no unit** and **no session label**. It sees 230 → 230 → 150 and concludes you crashed last week → "HOLD at 150, something's off." The 150 was the deload.
- It latches onto "Chest: 48 sets (high)" → "You're well over MRV, I'd cut chest volume this week." Phantom overtraining.
- It follows PUSH ("last session hit reps cleanly") and says "go to 235" — in a deload week — while the set-row nudge on the same screen, computed by `computeOverloadNudge()` with no intent input, also says bump. Two sources of truth, both wrong, agreeing by accident.
- It answers in 200 words of bullets, three of which are hedges, because the format paragraph asks for bullets and "concreteness beats brevity."

**Step 4 — nothing is recorded.** `coachHistory` stores question, answer, usage, cards (`index.js:1565-1583`). Not the context block. Not the tool inputs/outputs. Not which round went wrong. You experience "the coach is stupid." You cannot tell whether it was the 4× volume bug, the missing deload label, a tool error the model never saw, or the model itself.

**What the right answer was:** `sessionIntent.mode === 'deload'` → hold or reduce. `progressionTarget(..., intent)` → `{action:'deload', weight: 150, reps: 12}`. One line: *"Deload week — 150 × 12–15, two reps in the tank. Chest press moves again next Monday."* Computable in under a millisecond with zero model involvement. The model's job was to say it kindly and answer the follow-up.

### 1.3 Why you were unhappy — five causes, in order of leverage

1. **Wrong data in.** The 4× volume inflation (AP-15a). Garbage in is the whole story for some fraction of bad answers, and no prompt fixes it.
2. **Missing facts.** No today, no deload flag on sessions, no gym, no verdicts (AP-15b, AP-9, AP-16). The model can't reason about what it wasn't told; it fills gaps with plausible-sounding generalities, which reads as "stupid."
3. **Simulating code instead of reading its output.** The PUSH/HOLD matrix, MEV/MRV numbers, plateau advice — 1,600 tokens asking the model to recompute what `progression.js` already knows (AP-16, AP-17). Slower, costlier, and the only path by which the chat and the set rows can disagree.
4. **Validators that lie.** `normalizeExercise` (`coach-tools.js:331-348`) turns `sets: 12` into `sets: 3` and reports success. The model tells you "I set 12 sets." The template says 3. Every silent coercion is a confident lie the model repeats (AP-18).
5. **No measurement.** No traces, no fixtures, no eval. Every prompt change was a guess graded by vibe (AP-20).

Notice what is *not* on the list: the model, the temperature, the thinking effort, the prompt's wording. Those are where people instinctively go first, and they're the last thing to touch.

### 1.4 The principle

> **Rules decide. The model explains.** Anything with a number and a threshold runs in code, identically, for free, and is unit-testable. The model receives verdicts as facts, chooses which to lead with, writes the sentence, and handles what you can't code — the user's words, trade-offs, "my knee feels weird." When you want the model to be able to deviate, make deviation an explicit, logged tool argument so it's visible and gradable.

A prompt *advises*. Code *enforces*. You already learned this once with the periodization work: the rotation doctrine was in the prompt the whole time and was ignored. Same lesson, bigger scope.

### 1.4b A real specimen (added 2026-10-23)

Thread `thread_1789446779692_zyyck8`, 2026-09-15, question seeded by the post-workout "Review this session" chip: *"Review my Push — Strength (heavy top set) session from today — how did it go compared to recent sessions, and what should I change next time?"* Usage: **6,165 input tokens** (block ≈ 5.5k + question), **6,843 output tokens** (mostly xhigh thinking).

What it got right: bench 185×6 → 185×3 in week 6 of 6 = end-of-block fatigue → deload this week as planned → retest fresh; pec deck and triceps progressed; skipping laterals is fine. That is the trainer's answer. The model's *knowledge* was never the problem.

What went wrong, by cause:

| Cause | In the specimen |
|---|---|
| 1 Wrong data | "Chest (28), Shoulders (30) — both high, stacking fatigue." 28-day sums. Real: chest ≈ 7/wk (*under* MEV), shoulders ≈ 7.5, legs ≈ 12. The fatigue-from-volume story was backwards; it reached the right prescription only because the program line also said deload. Right answer, wrong reason — the dangerous kind. |
| 2 Missing facts | No "today" → "No Push session shows as logged today… reviewing 09-07" and a hedge. No gym in the decision. No verdict for Smith bench. No memory of what the user asked in earlier threads. |
| 3 Simulating code | The whole "How 09-07 went vs recent" section is `buildExerciseSessions` + `computeOverloadNudge` done by hand in prose, per exercise. That is why it reads as "a lot about numbers." |
| 5 No measurement | The "today" miss is either a race between the completion save and the chip, or a session that was never completed in-app. The cache *is* cleared on completion (`data-manager.js:189`). Without the context block we cannot tell. → bug-log; AP-20a settles it. |

What it failed to *close*: "should I try a different machine?" The rules' answer was **no** — one sub-target session in peak week is rung 0, not a stall; rotation is rung 3 or a block boundary. One verdict line would have said so in twelve words. The model didn't say it because nothing told it bench was rung 0; it narrated instead.

**The lesson the specimen teaches that the trace in 1.2 can't:** the model already knows what a trainer knows — it recognized end-of-block fatigue, prescribed a deload, applied double progression — without any textbook in a tool. What it lacks is *your* doctrine (your ladder, your thresholds, your block length), *your* numbers computed correctly, and *your* history across threads. Doctrine with a number goes in code and arrives as a verdict; doctrine without a number is one line in the prompt, often citable by name ("RP-style landmarks"); documents in a retrieval tool are for knowledge the model can't have — your catalog, your bug log, other users' data, anything post-training (Lesson 6).

### 1.5 Check (before AP-15)

1. Open Firestore → `coachHistory`. Find three answers you remember being bad. For each, write one line: which of the five causes most likely produced it. You will not be sure — that's the point; AP-20a makes you sure.
2. Add a temporary `console.log(contextText.length, contextText.slice(0, 2000))` at the top of `buildTrainingContext`'s return, open the coach, and read what the model actually sees. Look for the volume line. Look for anything that says what day it is.
3. Count the system prompt: paste `TRAINING_SCIENCE_PROMPT` into a token counter. Then highlight every sentence that describes a rule your code already computes. That highlighted fraction is what AP-16/17 deletes.

### What changed
*(fill in after AP-15 and AP-20a)*

---

## Lesson 2 — The block: what the model is actually told

**Maps to:** AP-15 (shipped 2026-10-23, `7dc3319`), AP-9 (same commit), AP-15h, AP-16, AP-21. Rewritten 2026-10-23 in plain language after the first version lost its reader.

### 2.1 What the block is

Open any `coachHistory` doc. `messages[0].content` starts like this:

```
Here is my recent training data:
User profile: Goal: strength (top-line lift numbers) Injuries / limitations: Knees hurt when I squat really low...
Weekly volume (sets/muscle, last 4 weeks avg): Arms: 21 sets (good) Chest: 28 sets (high) Shoulders: 30 sets (high) ...
Key lift trends (max weight in lbs, recent sessions, newest first): Hammer Strength Chest Press: 230 -> 230 -> 225 ...
   ... several thousand more words: PRs, templates, plates, thirty recent workouts set by set, equipment by gym ...
Review my Push — Strength (heavy top set) session from today — how did it go compared to recent sessions, and what should I change next time?
```

That is the whole thing. The model received **one message** that said "here is my training data: [everything], now review my push session." It has no database, no memory of other threads, and no access to the app. It reads that text once, top to bottom, finds your question at the very end, and answers.

The app builds this text in `buildTrainingContext` (`ai-coach-ui.js:1212`) and the assembly code just above it (~`:500-560`). Every line of the block is a line of code that decided to include it. So the only question in this lesson is: **what should that text say, and in what order?**

### 2.2 Turns and rounds — the two clocks

You need these two words apart before anything else makes sense.

A **turn** is one exchange with you. You type a question, the coach answers. A thread is a list of turns.

A **round** is one call to the model inside a turn. Most turns are one round: the model reads, answers, done. But if the model decides it needs a tool — say `get_exercise_history` for Smith bench — the turn goes like this:

```
Round 1:  model reads [block + your question]           → "I need get_exercise_history('Smith Bench')"
          your code runs the tool, appends the result
Round 2:  model reads [block + question + tool call + tool result]   → "I need get_prs"
          your code runs it, appends the result
Round 3:  model reads [all of the above + PR result]    → writes the answer you see
```

Three rounds, one turn. You see one answer. Two things follow:

- **The block is re-read on every round.** A 5,000-word block on a 3-round turn is read three times. Nothing is remembered between rounds except what's in the text.
- **Your question is the last thing before the model starts, but the block is the first.** On a long block the model has read a lot of reference material before it reaches "so what did you want?"

(Across turns: the block rides on turn 1 of a thread. Later turns in the same thread carry just your new question — the model still sees the earlier turns, so it still sees the block — until the thread is old or something changed, when the app sends a fresh block. That's 2.6.)

### 2.3 The briefing page — five questions a trainer asks before answering

Picture handing a new trainer one page before your session. A good page answers five questions, in this order:

```
WHERE ARE WE?
  Today: Tue Oct 27 · planned: Push · week 6 of 6 — Deload · gym: Planet Fitness

WHAT DO THE NUMBERS SAY?  (the decisions the app's rules already made)
  Smith Bench: hold at 185 — one weak session in peak week, not a stall
  Pec Deck: bump to 140 — 130×10 was clean
  Hamstrings: 4 sets this week, under minimum two weeks running

WHAT CAN'T I DO?
  Knees hurt in deep squats.  Plates: 45/25/10/5/2.5 per side, smallest jump 5 lb.
  Deload this week — do not add load.

WHAT'S THE EVIDENCE?  (only if the trainer wants to dig)
  09-07 Push: Smith Bench 155×6, 175×6, 185×3, 155×6 · Pec Deck 110×10, 120×10, 130×10 ...
  Templates: Push — Strength (6 exercises), Pull — Width, Legs — Heavy ...
  Equipment at Planet Fitness: Hammer Strength Chest Press, Smith Machine, ... (4 never used)

WHAT DID WE SAY LAST TIME?
  3 weeks ago you asked about bench stalling; I said hold and chase reps. Result: 185×6 → 185×3.
```

A trainer holding that page answers "should I go heavier on bench?" in one sentence, because the decision is already on the page. They only read the evidence section if you push back.

That's the whole idea. The five questions are what I called "layers" before — forget the word. **Where are we · what do the numbers say · what can't I do · what's the evidence · what did we say last time.** Decisive stuff first, evidence last, so a model that reads top-to-bottom hits the answer before the noise.

### 2.4 Your block, held up against the page

| Question | Your block in September (the specimen) | Your block now (after AP-15 / AP-9) | Still to do |
|---|---|---|---|
| Where are we? | **Missing.** No date, no "today is Push," no gym → "No Push session shows as logged today" | ✅ `Today:` line, first line of the block — date, planned session, program week, DELOAD flag, gym | — |
| What do the numbers say? | **Missing entirely.** So the model worked through four bench sessions out loud to decide for itself — that's the "lot about numbers" | ❌ still missing in chat (the live coach has it since AP-15d) | **AP-16** verdict lines; **AP-21** the "4 of 6 primaries up" headline |
| What can't I do? | Injuries ✅ · plates ✅ · volume numbers **wrong** (28 = a 4-week sum; real ≈ 7) · "deload" mentioned but no instruction | Volume fixed ✅ · `DELOAD WEEK: do not prescribe heavier` ✅ — but pasted at the *bottom*, after thirty workouts | move the deload instruction up under Today (one line of code, noted in AP-16) |
| What's the evidence? | 30 workouts set-by-set, PRs, templates, equipment — most of the text | same, now with labels and units on everything ✅ | shrink to ~10 workouts once the numbers-say lines exist — the model won't need to hunt |
| What did we say last time? | Past *advice* ✅ (outcomes block) · past *questions* **missing** → no memory you'd asked about bench before | same | **AP-15h** last five thread questions |

Read the September column top to bottom and you can see the specimen's answer being produced: no "where are we" → hedge about today; no "numbers say" → narrate the arithmetic; wrong constraint → backwards fatigue story; no "last time" → no continuity.

### 2.5 Why size matters (in plain terms)

The block is re-read every round. The September block was about 5,500 tokens (~4,000 words) — we know because the turn's `usage.inputTokens` was 6,165. On a three-round turn that's 16,000+ tokens read before the answer starts, and your 12-word question is the last thing on the page every time.

Two habits:

- **Put the decisive lines first and cut from the bottom.** The first three questions take maybe 20 lines. The evidence section is where the bulk is, and it's the part you can shrink.
- **One computed line beats many raw ones.** `Smith Bench: hold at 185 — one weak session, not a stall` replaces eight trend numbers *and* the paragraph of rules the model would apply to them. Doing the math in code is fewer words and a better answer at the same time — that's the single most useful thing in this whole guide.

### 2.6 When the block gets rebuilt

The block is a snapshot of your data at the moment the thread started. Until today, reopening a two-week-old thread and asking "what should I do today?" got an answer built from two-week-old data, with no way for the model to know it was stale.

What AP-15e does now (`contextRefreshReason`): the block rides on the first turn; later turns carry only your question; the app sends a **fresh** block when the thread is older than 24 hours or when the coach changed something (built a template, set the week plan). And because the Today line opens the block, every block visibly says what day it was built — the model can tell.

The rule for any new write tool you add: it must flip `_coachWroteSinceContext`, or the next turn reasons from pre-write data.

### 2.7 Where does a fact go?

Four places a fact can live. Pick by how often the model needs it:

| If it's… | Put it… | Examples |
|---|---|---|
| needed on almost every turn | in the **block** | today, deload, verdicts, injuries, unit, gym |
| needed sometimes, or too big to carry | behind a **tool**, with a line in the block saying so ("full inventory via `list_equipment`") | full history of one lift, the whole equipment list |
| a rule with a number in it | in **code**, shown in the block as a verdict | progression, stall rungs, deload timing, MRV, loadable weights |
| about *how to talk* — tone, length, what to do when unsure | in the **system prompt** | "Verdict → Because → Do, under 120 words" |

Test case: `get_program` and `get_week_plan` were tools. Their decision-relevant part is now in the Today line, so the model should rarely need them. If the traces (AP-20a) show it still calling them on "what today?" questions, something is missing from the Today line.

### 2.8 Check (fifteen minutes)

1. **Find your current block.** Open the coach on dev, ask anything, then open the new `coachHistory` doc and read `messages[0].content` top to bottom. First line should be `Today:`. Find `DELOAD WEEK` (if you're in one) and notice how far down it is.
2. **Grade it against the five questions.** For each: is it answered, and in the first screen or the fifth? Write the five yes/no's in *What changed* below.
3. **Answer the specimen question yourself from the block.** "Should I go heavier on Smith bench?" Notice where your eye found the answer and what you skipped. Whatever you skipped is evidence-section material to trim.
4. **After AP-16 lands:** repeat 1–3. The "numbers say" lines should exist, the deload line should sit under Today, and the block should be shorter.

### What changed
- 2026-09-15 specimen (Lesson 1.4b): 6,165 input tokens for a session-review turn — the pre-AP-15 block was ≈5.5k tokens; 6,843 output, mostly thinking. First real measurement; compare after AP-16/21 and the evidence trim.
- 2026-10-23: AP-15 a–g and AP-9 shipped (`7dc3319`, 130 coach tests passing). Lesson written against the shipped block. Remaining: verdict lines (AP-16), scoreboard headline (AP-21), deload line placement, evidence-section size, prompt MEV/MRV prose (AP-17), recent-questions line (AP-15h).
- 2026-10-24: AP-16, AP-21, AP-15h/i landed (uncommitted at time of writing; not yet on dev). The block now runs Today → program/deload directive → **Rules verdicts** (per-exercise target + stall rung, deload check, sets vs MRV, progress scoreboard) → evidence → past advice → **Recent conversations** → feedback. `RECENT_DETAIL_CAP` 30 → 12. Block size before/after is **not measured yet** — open the coach with `?debug` on dev and the console logs `coach context: N chars (~T tokens)` plus a per-section size map; paste one before (prod) and one after (dev) here.
- *(five yes/no's against 2.3, after a real dev turn)*

## Lesson 3 — Tools: what the coach is allowed to do

**Maps to:** AP-17, AP-18, and which tools should exist at all (AP-15b, AP-16). Rewritten 2026-10-25 in plain language. State of the code at writing: 23 tools in `functions/coach-tools.js` (`get_verdicts` arrived with AP-16 on 10-24); no `enum`s yet; validators still coerce. AP-17/18 not started.

### 3.1 What a tool is

A tool is a function in your code that the model is allowed to ask for. The model never sees the function. It sees a **label** and a **form** — this is exactly what it's shown for one of yours:

```json
{
  "name": "get_exercise_history",
  "description": "Full session history for ONE exercise: date, sets/reps/weights, equipment, notes.
                  Use when discussing a specific lift in depth — the context summary only carries
                  an 8-point max-weight trend.",
  "input_schema": {
    "type": "object",
    "properties": {
      "exercise": { "type": "string", "description": "Exercise name as it appears in the training data" },
      "limit":    { "type": "number", "description": "Max sessions to return (default 8, cap 20)" }
    },
    "required": ["exercise"]
  }
}
```

The `description` is the label: what it does and when to reach for it. The `input_schema` is the form: which fields exist, their types, which are required. All 23 of these blocks are pasted into every call, right after the system prompt. That's the model's entire knowledge of what it can do.

### 3.2 How a tool call happens

Lesson 2.2 said a turn can take several rounds. A tool is what causes the extra rounds:

```
Round 1   the model reads the block + your question
          and instead of answering, writes:
            { "name": "get_exercise_history", "input": { "exercise": "Smith Bench", "limit": 6 } }

          your code (index.js ~:1510) runs the real function, gets JSON back, and appends it:
            { "exercise": "Smith Bench", "unit": "lbs", "sessions": [ {date:"2026-09-07", sets:[...]} ... ] }

Round 2   the model reads everything again — block, question, its own request, the JSON —
          and either asks for another tool or writes the answer you see
```

Three things to hold onto:

- **The model fills in the form by reading the form.** If the form says `exercise: string`, it types a string. If it says nothing about valid values, it guesses.
- **Whatever your code returns is read as plain truth.** JSON that says `{ "proposed": true }` means "done" to the model, even if nothing happened.
- **An error message is just more text — and the most useful text you can send.** `Unknown templateId "push" — call list_templates for valid ids` tells the model exactly what to do in the next round. `Tool failed` tells it nothing.

### 3.3 Three kinds of tools

Sort your 23 into three piles and most design questions answer themselves.

| Kind | What it does | Yours | Risk if the model gets it wrong |
|---|---|---|---|
| **Look-ups** | Read data, change nothing | `get_exercise_history`, `list_templates`, `get_prs`, `list_equipment`, `list_exercises`, `get_program`, `get_week_plan`, `get_verdicts` | low — a wrong look-up wastes a round |
| **Actions** | Change your data directly | `create_workout_template`, `update_workout_template`, `replace_day`, `archive_template`, `create_program`, `adjust_program`, `set_week_plan`, `remember_fact`, `forget_fact`, `log_advice` | high — a wrong action edits your real library |
| **Proposals** | Prepare a change and show you a card; nothing happens until you tap | `propose_session_adjustments`, `propose_next_target`, `propose_swap`, `propose_add_exercise`, `propose_rest` | low — a wrong proposal is one dismissed card |

Proposals are the safest design you have, and you invented them for live mode. Look-ups should be generous and cheap. Actions are where every rule in this lesson matters most.

### 3.4 The label and the form — what each is for

**The label (`description`)** is guidance the model reads once per turn. Your labels are already good; they follow a formula worth making explicit for the next tool you write:

1. What it does — *"Full session history for ONE exercise"*
2. When to use it, and when not — *"Use when discussing a specific lift in depth — the summary only carries an 8-point trend"*
3. What to call first — *"Call `list_templates` for the templateId"*
4. What happens after — *"Renders a diff card; the user can undo"*

**The form (`input_schema`)** is the part the API actually enforces. Three features you're barely using:

- **A dropdown instead of a text box.** `category: { type: 'string', description: 'One of: Push, Pull, Legs…' }` is a text box with a hint; the model can type anything. `category: { type: 'string', enum: ['Push','Pull','Legs','Core','Cardio','Arms','Shoulders','Other'] }` is a dropdown; the API rejects anything else before your code runs. You have zero dropdowns today and at least six places that want one (`category`, `kind`, `goal`, `trustLevel`, `log_advice.type`, `role`/`pattern`).
- **Limits on numbers.** `weeks: { type: 'number', description: '1-16' }` is a hint. `weeks: { type: 'number', minimum: 1, maximum: 16 }` is enforced. Same for `sets`, `reps`, `seconds`, `limit`.
- **A shape for nested things.** `addExercises: { type: 'array', items: { type: 'object' } }` says "a list of… somethings." The model invents the fields every time. Four places in your tools do this (`addExercises` ×2, `split` ×2). `replace_day` shows the fix — its `items` lists every field.

Rule of thumb: **rules go in the form, guidance goes in the label, and nothing about a tool goes in the system prompt.** If you find yourself writing ALWAYS or NEVER in capitals about a tool, that's a rule that escaped from the form.

### 3.5 When the model fills in the form wrong

Your code has two choices, and today it mostly makes the wrong one.

**Refuse, with directions.** `set_week_plan` does this: it checks each template id against your real library and returns `Unknown templateId "x" for mon — call list_templates for valid ids`. One extra round, correct result. This is the template for every action tool.

**Quietly fix it.** `normalizeExercise` (`coach-tools.js:344`) does this: `sets: 12` becomes `sets: 3`, `reps: 60` becomes `reps: 10`, and the tool reports success. The model then tells you "I set 12 sets." Your template says 3. Nobody was told. Every silent fix is a lie the model will repeat with full confidence — because from where it sits, the tool said everything worked.

Other places the same thing happens: `normalizeWeekTarget` drops out-of-range levers; `applyPrescriptionFields` drops a `role` that isn't spelled exactly right; `propose_session_adjustments` says `proposed: true` for a template that doesn't exist (the client then drops the card — the "it said it made a card but nothing showed up" bug); `propose_swap` says "MUST pick equipment at the current gym" and nothing checks. AP-18 is the sweep that turns every one of these into a refusal with directions.

### 3.6 Five questions to ask of any tool

1. **Should it exist?** Could code put this in the block before the model is called (Lesson 2.7)? Is it a near-duplicate of another tool?
2. **Is it clear which tool to pick, with the system prompt covered up?** If two labels overlap, the choice is a coin flip.
3. **Is the form tight?** Dropdowns for fixed choices, limits on numbers, a shape for every nested thing, `required` matching what the code actually needs.
4. **Does bad input get refused with directions, or quietly fixed?**
5. **Does the result give the model what it needs for its *next* step?** Ids it will have to pass to an action tool, a unit on every number, a label on every session — and nothing it won't use.

### 3.7 Your tools, graded

| Tool | Kind | What's good | What to fix | Phase |
|---|---|---|---|---|
| `get_verdicts` *(new)* | look-up | label says what it returns, that it's authoritative, and exactly when to call it | — | ✅ AP-16 |
| `get_exercise_history` | look-up | label; unit now on output (AP-15c) | exact-name match — a typo returns nothing; fuzzy-match and say what matched. `limit` cap only in words | AP-18 |
| `list_templates` | look-up | — | **a look-up that writes** (`usageCount` backfill `:727`) — move to a scheduled job | AP-18 |
| `get_prs` / `list_equipment` / `list_exercises` | look-up | fine | — | — |
| `get_program` / `get_week_plan` | look-up | — | mostly redundant now — the Today line and verdicts block carry their decisive part. Keep for drilling in; expect few calls | watch via AP-20a |
| `create_workout_template` | action | label; real shape for `exercises` | `category`, `kind` need dropdowns; `sets`/`reps` need limits; **quiet-fix** on sets/reps; `equipment` never checked against your library; dedupe is slug-suffix only | AP-18 |
| `update_workout_template` | action | — | `addExercises` has no shape; overlaps `replace_day` (see 3.8); quiet-fix path | AP-18 (merge candidate) |
| `replace_day` | action | the model tool for shape — every field listed; diff card with undo | quiet-fix path | AP-18 |
| `create_program` | action | label; `weekTargets` has a real shape | `goal` dropdown; `weeks` limits; **`split` has no shape** ("same as set_week_plan" — reuse that object); `normalizeWeekTarget` quiet-drops; no "≥4 weeks needs a deload" check | AP-17/18 |
| `adjust_program` | action | — | `split` no shape; `trustLevel` dropdown | AP-18 |
| `set_week_plan` | action | **the one to copy** — tight form, checks ids against real data, error names the fix, returns a summary + card | — | — |
| `archive_template` | action | fine | — | — |
| `log_advice` | action | keeps a record of what the coach prescribed — the model as its own note-taker | `type` dropdown | AP-18 |
| `remember_fact` / `forget_fact` | action | fine, clipped to 200 chars | — | — |
| `propose_session_adjustments` | proposal | the right pattern for one-off changes | `addExercises` no shape; **says `proposed:true` for a nonexistent template** | AP-18; deload lock AP-17 |
| `propose_next_target` | proposal | — | `weight` and `reps` optional — a target without them is useless; no check that it's loadable or ≤ the rule's target | AP-17 |
| `propose_swap` | proposal | — | "MUST be at the current gym" is words; nothing checks. Validate and name the 3 nearest | AP-18 |
| `propose_add_exercise` / `propose_rest` | proposal | fine | limits on `sets`/`reps`/`seconds` | AP-18 |

### 3.8 Two patterns worth seeing

**Three tools held apart by capital letters.** `update_workout_template` (one field), `replace_day` (many exercises), `propose_session_adjustments` (one session only). The difference between them is *scope*, and scope is enforced by about 400 words of ALWAYS / NEVER / REQUIRED in the tools prompt. Every one of those words is a coin flip the model has to win. Two honest fixes: fold `update_workout_template` into `replace_day` (one way to change a template — the model sends the full list, which it's already good at), or make the scope an explicit field on one tool and let your code route it. Either way the prompt shrinks and the coin flip disappears.

**Proposals are a safety pattern, not a live-mode quirk.** The consent rule — "never edit the user's library unless they clearly asked" — can't be made structural; intent lives in the user's words. But you already bounded the damage for live mode: every proposal needs a tap. The question to sit with: *should template actions be proposals too?* If `create_workout_template` rendered a card you approve, a wrong call would cost one dismissed card instead of a damaged library, and 200 words of consent prose would become one line. When a rule can't be enforced, shrink what a mistake can cost.

### 3.9 Which tools should exist — work back from the jobs

§4.0 of the plan gives the coach four jobs. Each one needs a specific, small set of tools:

| Job | Look-ups | Actions / proposals |
|---|---|---|
| 1 Weekly scoreboard | `get_verdicts` | `log_advice` |
| 2 Block boundary | `list_exercises`, `list_equipment`, `get_exercise_history`, `get_verdicts` | `create_program`, `replace_day`, `create_workout_template` |
| 3 Today | **none** — if the model needs a tool to answer "what today?", the block is missing something | `propose_session_adjustments` |
| 4 Free text | `get_exercise_history`, `list_*` | `remember_fact`, the live proposals |

Everything on the list serves a job. Two look-ups (`get_program`, `get_week_plan`) are now mostly covered by the block, one action pair (`update`/`replace`) could be one tool. The count is less important than the fact that every tool has a clear reason and no two overlap.

### 3.10 Check (fifteen minutes, before AP-18)

1. **Cover the prompt.** Read only the three "change a workout" labels in `coach-tools.js`. Decide which you'd call for "make my pull day harder." If you hesitated, the model does too.
2. **Watch a quiet fix.** In a test file or Node REPL: `normalizeExercise({ name: 'Chest Press', sets: 12, reps: 10 })` → look at `sets`. Now imagine the model just told you "done, 12 sets."
3. **Count the capitals.** In `COACH_TOOLS_PROMPT`, count ALWAYS, NEVER, REQUIRED, MUST. Each is a rule trying to be a dropdown, a limit, a check, or a card. That number is your AP-17/18 backlog.

### What changed
- 2026-10-24: `get_verdicts` added (AP-16) — 23 tools; its label is a good example of the formula in 3.4. AP-17/18 not started: still zero dropdowns, still quiet fixes.
- *(after AP-18: capitals count before/after; the normalizeExercise result)*

## Lesson 4 — The system prompt: only what you can't code

**Maps to:** AP-19, the deletions in AP-17.

Outline:
- What belongs: identity and tone; the output contract; how to handle ambiguity and when to ask; what the authoritative blocks mean ("explain the verdict, don't override it"); safety lines (injuries).
- What doesn't: numbers, thresholds, formulas, anything already in a verdict or a guard.
- **Output contract** (AP-19): Verdict → Because (≤2 bullets with the user's numbers) → Do (exact weight × reps or one action) → optional Watch. ~120 words chat, ~40 live. One recommendation unless a plan is asked for.
- Live mode gets its own ~300-token prompt; the chat prompt's data list is false there.
- Model routing: Sonnet for lookups, Opus for program design. Effort is the last dial, not the first.
- Check: token count before/after; the prompt should roughly halve.

## Lesson 5 — Evaluation: making "stupid" falsifiable

**Maps to:** AP-20a–e.

Outline:
- **Traces first** (20a): per turn, store the context (or hash + size), every tool call with input/output/error/ms, rounds, tokens, latency. From now on every bad answer is a reproducible case.
- **Fixtures** (20b): 10–20 anonymized snapshots of your real data shapes. Scenarios: stalled lift at rung 1/2/3; deload week + "go heavier?"; low-volume pattern; rest day; kg user; injury + loading exercise; program build; rewrite pull day; machine taken (live); weekly review.
- **Runner** (20c): `scripts/coach-eval.mjs` — pure context builder, real prompt + tools, in-memory Firestore mock, captured trace. Requires extracting `buildTrainingContext` from `AppState` first.
- **Assertions** (20d): cheap, code-checkable, non-negotiable — no write tool on a question; propose-not-update during deload; every weight loadable; equipment exists at gym; injured pattern absent; word count in contract; verdict quoted when present.
- **Rubric** (20e): a grader model scores 1–5 on grounded / one clear recommendation / explains why / consistent with verdict. Calibrate the grader against 10 answers you score by hand first. Gate prompt/tool PRs on `npm run eval:coach`.
- Check: break something on purpose (reintroduce the 4× volume bug on a branch) and confirm the eval catches it.

## Lesson 6 — Memory and multi-turn

**Maps to:** AP-15e; `remember_fact` / `forget_fact`; the thread replay logic.

Outline:
- Three kinds of memory and they're all just context: the message array (this turn), the thread (replayed turns), and durable facts (`memoryBlock`). None of it is "learning."
- Durable facts should be few, user-visible, and editable. Let the model propose; let the user confirm.
- Threads age. A thread reopened later needs a fresh briefing and a note that earlier turns were against older data.
- Check: open a two-week-old thread, ask "what should I do today?", confirm the answer uses today's data.

## Lesson 7 — Cost, latency, and when not to use an agent

Outline:
- Per-turn cost = (system + context + accumulated tool traffic) × rounds. Long context and many rounds multiply.
- The decision tree: known steps → workflow. One judgment step → workflow with one model call. Open-ended input + bounded tools → agent. Numbers and thresholds → plain code, always.
- Route by difficulty (AP-19). Cache what doesn't change. Prefer one good tool call over three exploratory ones — which means better tool descriptions, not a smarter model.
- Monetization lens: the coach is a per-user cost center; proactive surfaces (scoreboard, weekly review, live nudge) deliver most of the trainer value at a fraction of the cost because the rules do the work.

---

## After the coach — candidate agents 2, 3, 4

Pick based on what you want to learn next. Each teaches something the coach doesn't.

| Candidate | What it does | What it teaches | Agent or workflow? |
|---|---|---|---|
| **Block Planner** (Big Surf) | At the last week of a block: reads the scoreboard + stale patterns + equipment at your gym, proposes the next block, you approve with one tap | Structured output, human-in-the-loop approval, workflow-with-one-judgment-step | Mostly workflow — the model picks and explains; code generates candidates and validates |
| **Coach Grader** (dev side) | The AP-20e rubric agent: reads a trace, scores it, explains the score, diffs against last run | LLM-as-judge, rubric design, calibrating a grader against your own labels | Workflow |
| **Photo Machine ID → equipment** (Big Surf) | Camera → identify machine → match catalog → route through the AP-12 planner → select it in the workout | Multimodal input, tool chaining, confidence thresholds, "ask vs act" | Small agent (2–3 tools) |
| **Something outside Big Surf** | e.g. a weekly FRC scouting digest, or a fantasy lineup assistant with a tool that reads your league | Building from zero with the Agent SDK; what a minimal viable loop looks like without an existing codebase | Your choice — good for seeing the skeleton without the history |

Suggested order: Coach Grader (you need it for AP-20 anyway and it's the fastest to build), then Block Planner (it's the trainer feature you actually want), then whichever of the other two appeals.

---

## Ten rules on a card

1. The message array is the model's entire world. Engineer it.
2. Rules decide; the model explains. Anything with a threshold is code.
3. Fix inputs before prompts. Fix prompts before models. Touch effort last.
4. A tool's description and schema are its only documentation. Use enums.
5. Write tools refuse; they never coerce. Every silent fix is a lie the model will repeat.
6. Guards in code, not prose. The model shouldn't be *able* to break the rule.
7. Deviation is a logged argument, not a vibe.
8. Context is a snapshot. Date it; refresh it.
9. Trace every turn. Without traces, "it's stupid" is unfalsifiable.
10. Build the eval before the next prompt change. Then every change is a measurement.
