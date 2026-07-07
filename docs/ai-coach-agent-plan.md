# AI Coach Agent Overhaul — Implementation Plan

Goal: evolve the AI Coach from a context-dump chatbot into an industry-leading agentic coach —
streaming responses, richer knowledge, the ability to take actions in the app (create/edit
workouts from chat), persistent memory, and proactive coaching.

Competitive framing: Fitbod/Juggernaut auto-adapt but can't converse; Whoop Coach converses but
can't act. The differentiator here is a coach that does both.

**Read CLAUDE.md first.** All repo conventions apply: user-facing copy rules (sentence case, no
"please"/"successfully", `confirmSheet()` not native dialogs), design tokens (no raw colors/font
sizes/radii, no inline styles), BEM-ish class naming, window-wiring for onclick handlers, Vitest
tests importing real modules, deploy `dev` before `prod`, and the quality-check matrix.

Key existing files:

- Client: `js/core/features/ai-coach-ui.js` (chat UI, `buildTrainingContext`, `buildHealthSummary`,
  workout builder preview, action cards, history)
- Server: `functions/index.js` (`getTrainingRecommendation`, `generateWorkoutTemplate`,
  `extractDexaData`, `enforceAiDailyLimit`, `TRAINING_SCIENCE_PROMPT`, `WORKOUT_BUILDER_PROMPT`)
- Styles: `styles/pages/ai-coach.css`

Phases are independently shippable and ordered by value-per-effort. Ship each phase to `dev`,
verify, then promote — don't batch phases into one deploy.

---

## Phase 1 — Streaming responses

The single biggest UX upgrade. Today the callable buffers the entire Opus response (up to 120s at
xhigh effort) while the user watches a spinner. Streaming shows the first words in ~2s.

### 1.1 Server: new v2 streaming endpoint

v1 callable functions buffer responses and cannot stream. Add a **2nd-gen** HTTPS function
alongside the existing v1 exports (mixing v1/v2 in one codebase is supported as long as function
names differ):

- New export `coachChatStream` using `require('firebase-functions/v2/https').onRequest` with
  `{ secrets: [anthropicApiKey], timeoutSeconds: 300, memory: '512MiB', maxInstances: 2, cors: true }`.
- Auth: no callable auth context, so verify manually — read `Authorization: Bearer <idToken>`,
  `admin.auth().verifyIdToken(token)`, 401 on failure. Reuse `enforceAiDailyLimit(userId, 'coach', 10)`.
- Request body: `{ messages: [{role, content}] }` (same thread shape the client already sends).
- Call the Anthropic API with `stream: true` (same model/thinking/effort config as the callable).
  Note: v2 functions have global `fetch` (Node 18+) — prefer `fetch` over the hand-rolled `https`
  helper for the streaming path; parse the SSE stream from the API and re-emit to the client.
- Response: SSE (`Content-Type: text/event-stream`, flush on write). Emit a small event protocol
  (this becomes the substrate for Phase 2 tool events):
  - `{"type":"status","text":"Thinking…"}` — while the model is in a thinking block
  - `{"type":"delta","text":"..."}` — visible text deltas
  - `{"type":"done","fullText":"...", "usage":{...}}` — terminal event
  - `{"type":"error","message":"..."}` — terminal error
- After `done`: save to `coachHistory` (same as callable does today).
- **Keep `getTrainingRecommendation` deployed unchanged** as the fallback path — prod has no
  build step and JS caching means old clients may call it for a while.

### 1.2 Server: prompt caching

The training context (the biggest token block) is re-sent verbatim every turn. Add
`cache_control: {type: 'ephemeral'}` to the system prompt block and to the first user message
(the one carrying the context). Applies to both the streaming endpoint and the legacy callable.
This meaningfully cuts cost and time-to-first-token on multi-turn chats.

### 1.3 Client: consume the stream

In `ai-coach-ui.js` `askCoach()`:

- Get an ID token: `AppState.currentUser.getIdToken()`.
- `fetch` the function URL (derive region/project the same way the Firebase SDK does, or hardcode
  the cloudfunctions.net URL in `config.js` as `Config.COACH_STREAM_URL`), `POST` the thread,
  read `response.body.getReader()`, parse SSE lines.
- Render: replace the loading bubble's content incrementally as `delta` events arrive; show the
  `status` text while thinking. Re-run `formatCoachResponse` on the accumulated text per chunk
  (cheap at this scale) or append raw and format once on `done` — measure, pick whichever doesn't
  flicker.
- Auto-scroll the chat area on each chunk, but only if the user is already near the bottom
  (don't fight manual scroll-up).
- On any fetch/stream failure, **fall back to the existing callable path** so the coach never
  gets less reliable than today.

### 1.4 Fixes to fold in (small, same PR)

- `ai-coach-ui.js` error copy still says "once per day" — the limit is 10/day. Reword:
  `Daily coach limit reached — try again tomorrow.`
- Remove the vestigial `coachRateLimit` timestamp write in `getTrainingRecommendation`
  (superseded by `enforceAiDailyLimit`).
- `formatCoachResponse` only handles bold + bullets. Extend to: `###`/`##` headers → `<h4>`/`<h3>`
  (styled small in ai-coach.css), numbered lists, inline code. Keep it dependency-free. Extract to
  an exported pure function and add a Vitest file (`tests/unit/coach-markdown.test.js`).

### Acceptance

- Ask a question → first visible text within a few seconds, streams to completion.
- Kill the network mid-stream → clean error bubble, no stuck spinner.
- Old callable path still works (test with the fallback forced).
- `npm test`, `npm run lint`, `npm run audit:design` pass.

---

## Phase 2 — Richer knowledge (context upgrades)

All client-side in `buildTrainingContext` / new helpers in `ai-coach-ui.js`, plus one settings
surface. Extract new context builders as exported pure functions so they're unit-testable.

### 2.1 Coach profile

- New fields in `preferences/settings` (merge into `DEFAULT_SETTINGS` in settings-ui.js):
  `coachGoal` ('cut' | 'bulk' | 'recomp' | 'strength' | 'general'), `coachExperience`
  ('beginner' | 'intermediate' | 'advanced'), `coachInjuries` (free text),
  `coachNotes` (free text — schedule constraints, preferences).
- Settings UI: new grouped section "AI coach profile" on the settings page (use existing
  grouped-rows pattern). Each field saves via the existing debounced write.
- Context: prepend a `User profile:` block (goal, experience, injuries, notes, height from
  `profileHeightCm`, weekly goal). Injuries are safety-critical — also add one line to
  `TRAINING_SCIENCE_PROMPT`: *"If the profile lists injuries, never program exercises that load
  the injured area without flagging it; suggest substitutions."*

### 2.2 PRs in context

- Read `stats/personalRecords` (see `pr-tracker.js` for the store shape: `exercisePRs` keyed
  exercise → equipment key, entries carry denormalized `equipmentName`).
- Add a `Personal records:` section — top ~15 by recency: exercise, equipment name, weight×reps,
  date. Now the coach can say "that's 95% of your all-time best".

### 2.3 Set-type awareness

- `liftTrends` currently includes warmup sets, so a 45 lb warmup pollutes max-weight trends.
  Filter `set.type === 'warmup'` out of trend math.
- In the recent-workout detail lines, annotate non-working sets: `10×135 (warmup)`, `8×145 (failure)`.

### 2.4 Existing workouts (templates) in context

- Add a `User's saved workouts:` section from `AppState.workoutPlans`: template name, category,
  exercise list with sets×reps (cap ~10 templates, truncate long exercise lists). "Plan my week"
  answers can then reference and adjust what already exists instead of reinventing.

### 2.5 Context freshness

- Today the context is only attached to the first user turn; a long conversation never refreshes
  it (e.g. after saving a template mid-chat). Cheap fix: when `_coachConversation` already exists
  and `AppState.workoutPlans` changed since the thread started, append a one-line system-ish note
  to the next user turn: `(Update: workouts list changed — <names>)`. Don't resend the full context.

### Acceptance

- New context builders have Vitest coverage (pure functions, mock AppState inputs).
- Manual: ask "what's my bench PR?" → correct number; ask about an exercise with warmup sets →
  trend excludes them; profile injury ("bad left shoulder") → overhead pressing answers flag it.

---

## Phase 3 — Agentic tool use (the coach can act)

The headline feature: chat that does things. "Build me a pull day for Crunch" → the coach creates
the template and an action card appears in chat. This builds on the Phase 1 streaming endpoint.

### 3.1 Server: tool loop in `coachChatStream`

Define Anthropic tools and run the standard tool-use loop (call API → if `stop_reason:
'tool_use'`, execute tool server-side with the Admin SDK scoped to `users/{uid}/…`, append
`tool_result`, call again — cap at 6 iterations). Stream text deltas throughout; emit
`{"type":"status","text":"Creating your workout…"}` while a tool runs.

Read tools (no side effects):

- `get_exercise_history({exercise, limit})` — sessions for one exercise: date, sets/reps/weights,
  equipment, notes. Lets the model drill into the one lift being discussed instead of relying on
  the 8-point trend summary.
- `list_templates()` — the user's saved workout templates (id, name, category, exercises).
- `get_prs()` — the personal-records store.

Write tools (side effects, each streams an event the client renders):

- `create_workout_template({name, category, exercises:[{name, bodyPart, equipmentType, sets, reps, weight}]})`
  — validate against the same schema rules as `WORKOUT_BUILDER_PROMPT` (5–8 exercises, compound
  first), write via the same shape `saveWorkoutTemplate` produces, return `{templateId}`. Stream
  `{"type":"action_card","card":{kind:"template_created", templateId, name, category, exerciseCount}}`.
- `update_workout_template({templateId, changes})` — supported changes: rename, add/remove
  exercise, change sets/reps/weight on an exercise. Fetch → apply → write. Stream an
  `action_card` with `kind:"template_updated"` and a human-readable diff summary
  (`"Bench press 145 → 155 lbs"`).

Policy: creates/updates execute directly (they're non-destructive and visible as action cards).
**No delete tool** in this phase — deleting a workout stays a manual UI action.

System-prompt addition: describe the tools, and instruct the model to use `create_workout_template`
whenever the user asks it to build/make/plan a workout — never to answer such requests with
text-only workout descriptions.

### 3.2 Client: render tool events

- `action_card` events → render with the existing `renderActionCard()` (reuse
  `coach-action-card` styles; add a `template_updated` variant with the diff line as the desc).
- After any write-tool event: refresh `AppState.workoutPlans` via
  `FirebaseWorkoutManager.getUserWorkoutTemplates()` so the Workouts tab is correct without reload.
- Tapping the card routes through the existing `openCoachTemplate(templateId)`.

### 3.3 Retire the button-driven builder (follow-up, optional)

Once tool use is solid, `showWorkoutBuilder`'s focus-picker flow becomes redundant — the chat
handles "build me a workout" natively. Keep the entry button but have it just send that message
into the chat. Delete `generateWorkoutTemplate` (client + server) only after verifying no other
call sites. Prefer a separate PR.

### Acceptance

- "Make me a chest and triceps day I can do at <gym>" → streamed reasoning → action card →
  template exists in Workouts tab with sensible weights drawn from history.
- "Change my push day bench to 155" → updated template + diff card.
- "How has my squat progressed?" → model calls `get_exercise_history` and cites real sessions.
- Tool loop hard-capped (iterations + `enforceAiDailyLimit`); a failing tool produces a graceful
  in-chat apology, not a dead stream.
- Unit tests for tool executor validation (bad schema rejected, unknown templateId → tool error).

---

## Phase 4 — Coach memory + restored conversations

### 4.1 Persistent coach memory

- New doc `users/{uid}/preferences/coachMemory`: `{ facts: [{id, text, createdAt, source: 'chat'}] }`.
- New tools in the Phase 3 loop: `remember_fact({text})` and `forget_fact({id})`. System prompt:
  *"When the user shares durable information — injuries, goals, schedule, equipment quirks,
  preferences — call remember_fact. Keep facts short. Never store measurements already tracked
  by the app."*
- Server injects current facts into the system prompt each call (`What you remember about this
  user:` + bulleted facts, cap ~30).
- Settings UI: "What your coach remembers" row → simple list page with per-fact delete
  (use `confirmSheet` for delete confirmation). Transparency matters — users must be able to see
  and remove memory.

### 4.2 Full-thread history

- Today `coachHistory` stores single Q/A pairs and `showPastCoachSession` renders old bubbles
  without restoring `_coachConversation` — replying to an old session starts from zero context.
- Change: store the full `messages` array per session doc (one doc per thread, updated as the
  thread grows; add `threadId` to dedupe). On `showPastCoachSession`, rebuild `_coachConversation`
  from the stored thread so the user can continue where they left off.
- Migration: old single-pair docs still render read-only (they lack a thread) — handle both shapes.

### Acceptance

- Say "my left knee is sketchy on deep squats" → memory fact appears in settings; a week later
  (new thread) leg-day advice accounts for it unprompted.
- Open a past conversation, ask a follow-up → the coach remembers the earlier turns.

---

## Phase 5 — Readiness + proactive coaching

### 5.1 Readiness check-in

- On workout start (active-workout entry), show a one-tap sheet: "How are you feeling?" 1–5 scale
  + optional note (aw-sheet pattern; skippable, never blocking). Store as `readiness: {score, note}`
  on the workout doc (schema addition — bump doc `version` handling per CLAUDE.md).
- Context: include recent readiness scores alongside recent workouts; system prompt gains
  auto-regulation guidance (low readiness → suggest reduced load/volume that day).

### 5.2 Weekly review (proactive)

- New v1 scheduled function `weeklyCoachReview` (`functions.pubsub.schedule('every monday 14:00')`,
  runs with `anthropicApiKey`): for each user active in the last 7 days, build a compact
  server-side summary (reuse context-builder logic — port the minimal pieces to the function or
  accept a client-built summary stored weekly), one Claude call (Sonnet, low effort — this is a
  digest, not deep analysis), save to `coachHistory` as `{type: 'weekly_review'}`, send a push via
  the existing web-push infrastructure ("Your weekly training review is ready").
- Client: weekly reviews surface at the top of the coach's "Past reviews" list with a distinct
  icon; opening one seeds the thread so the user can ask follow-ups.
- Spend guardrails: per-user cap 1/week (reuse `enforceAiDailyLimit` pattern with a `weekKey`),
  global `maxInstances: 1`, skip users with zero workouts in the window.
- Opt-out toggle in settings ("Weekly coach review" on/off, default on).

### Acceptance

- Readiness sheet appears once per workout start, skippable, saved on the doc.
- Monday: active users get one push + one review doc; inactive users get nothing.
- Asking a follow-up on a weekly review works as a normal thread.

---

## Phase 5.5 — Week plan (scheduling + program direction)

The app has templates but no concept of a week: nothing models "Tuesday is pull day", so there is
no plan to be on or off track against. This phase adds the lightest possible scheduling layer. It
is the highest direction-per-effort item in the plan, it anchors the Phase 5 weekly review to
something concrete, and it becomes the skeleton Phase 9 later fills with real periodization.

### 5.5.1 Data model

- New doc `users/{uid}/preferences/weekPlan`:
  `{ days: { mon: templateId|null, tue: …, sun: null }, restDays: ['sun'], updatedAt }`.
  One template per day, rest days explicit. No multi-week calendar, no dates — a repeating weekly
  shape. (Phase 9 replaces this with dated mesocycles; keep the shape dumb on purpose.)
- Seed intelligently: on first open, pre-fill from the day chips templates already carry plus the
  "Usually Tue, Fri" frequency derivation that exists in the template details work (Phase 6 of the
  2026-04 consolidation, template-selection.js) — the user confirms rather than builds from zero.

### 5.5.2 Dashboard "Today" card

- New card at the top of the dashboard (dashboard-ui.js): `Today: Pull day` + exercise-count
  subtitle + tap-to-start (routes through the same start path as the workout library — per
  CLAUDE.md, no new workout-start path). Rest day → `Rest day` card, no CTA. No plan set →
  a one-time quiet setup card, dismissible forever.
- Behind and slightly ahead states are shown factually, never as guilt: missed yesterday →
  today's card just shows today. The plan reflows silently (see 5.5.4). No streak-shaming copy.

### 5.5.3 Coach integration

- Context: `Week plan:` section (day → workout name, plus "completed/planned so far this week").
- New tools in the Phase 3 loop:
  - `get_week_plan()` — read.
  - `set_week_plan({days})` — full or partial update; emits an action card summarizing the new
    week ("Mon push · Wed pull · Fri legs · rest Tue/Thu/Sat/Sun").
  So "I can only train Mon/Wed/Fri next week" actually reshuffles the week, and "build me a
  program" can end with the coach both creating templates AND slotting them into days.
- Weekly review (Phase 5) anchors to the plan: "planned 4, completed 3 — legs got skipped;
  here's this week with legs moved to Wednesday" + a set_week_plan proposal the user can apply
  from the review thread.

### 5.5.4 Reflow rules (deterministic, client-side — no AI call)

Keep the automatic part boring and predictable; the coach only gets involved when asked:

- Missed a planned day → that workout shifts to the next open day this week if one exists;
  otherwise it drops (the weekly review mentions it once). Never double-books a day.
- Completing an unplanned workout counts toward the week (matched by template/category);
  the plan doesn't nag about "wrong day".
- Pure function in a new `js/core/features/week-plan.js` — unit-test the reflow logic hard
  (missed days, holiday weeks, single-day plans, empty plan).

### 5.5.5 Design decision: days live in the plan, never in template names (2026-07-06)

Templates are named by what they ARE ("Push day", "Legs — heavy"), never by when they happen
("Monday push"). The week plan is the ONLY place a workout is bound to a day. Consequences:

- **Swapping days is a pointer swap.** "Next week legs on Monday, chest on Tuesday" →
  `set_week_plan` updates two day→templateId pointers. No template is edited, renamed, or
  duplicated — the plan is the calendar, the template is the recipe.
- **Day-named templates are a smell the coach fixes.** The cleanup pass (5.6.2) and the
  migration review propose renames like "Monday push" → "Push day" — rename only, same
  templateId, so history/PRs stay attached. The coach never renames spontaneously.
- **Existing day chips demote to seed data.** They pre-fill the initial week plan (user
  confirms), then the plan is the single source of truth; de-emphasize chips in the editor
  rather than removing them (they still feed the "Usually Tue, Fri" meta).
- Tools prompt rule: when creating templates, never put a weekday in the name; schedule via
  set_week_plan instead.

### Acceptance

- Set a plan via settings/coach → dashboard shows the right card every day, tap starts the workout.
- "Move legs to Friday" in the coach → action card → dashboard reflects it.
- Miss a day → next open day picks it up, nothing notifies.
- Weekly review references planned-vs-done and proposes a concrete next week.
- `week-plan.test.js` covers the reflow matrix; `npm test` + lint + audit pass.

---

## Phase 5.6 — Template hygiene: variations without sprawl

Real usage pattern (from the app's owner): a stable core of a few templates used over and over,
plus a steady drip of one-offs — deload versions, make-up days after a miss, "push Saturday
harder" sessions. Without this phase, the coach makes sprawl WORSE: every variation becomes a
permanent template. The missing concept is that most of these aren't new workouts — they're
**one-session variations of an existing workout**.

### 5.6.0 Classify at creation (the root fix)

Sprawl is a classification failure at birth, not a cleanup problem. Every template gets a
`kind` at creation:

- `kind: 'core'` — a recurring workout (the stable few). Default for user-created templates.
- `kind: 'variation'` — a riff on a core workout; carries `parentTemplateId`. The library nests
  variations under their parent (collapsed), so 4 push variants read as ONE row, not four.
- `kind: 'oneOff'` — built for a single occasion (travel gym, test day). Auto-archives after
  its first completed workout — used once, then out of the way. Unarchive brings it back as
  a variation.

Sources of classification:
- **Coach-created:** the tool call declares kind + parent (`create_workout_template` gains both
  fields; the tools prompt explains the taxonomy). "Build me a deload push day" → it should be a
  session adjustment (5.6.1); if a template is truly warranted → `variation` of the push day;
  "make me a workout for my hotel gym this weekend" → `oneOff`.
- **User-created:** `createNewTemplate` defaults to core; `saveWorkoutAsTemplate` (from a finished
  workout) asks one chip question — "Keep as: Regular workout / Variation of <best-match> /
  Just this once" — with the best match pre-selected via the same similarity check as the
  dedupe guard.
- **Migration:** existing templates classify heuristically once — used ≥3 times in 90 days →
  core; ≥70% exercise overlap with a more-used template → variation of it; used ≤1 time and
  >60 days old → oneOff (archived). Show the result as a one-time review screen the user can
  correct before it applies — never silently reclassify.

Coach context then carries core templates (+ active variations) only, which also shrinks the
prompt. The week plan (5.5) slots core templates; variations inherit the parent's slot.

### 5.6.1 Session adjustments (the deload fix)

- New coach tool `propose_session_adjustments({templateId, adjustments, label, why})` —
  `adjustments`: global (`weightPct: -40`) and/or per-exercise overrides (add/drop an exercise,
  change sets/reps for today only).
- Renders a proposal card: `Start push day — deload (-40%)` with Apply. Apply starts the workout
  from the EXISTING template with the overrides applied to the session (same mechanism as
  starting normally + pre-filled adjusted targets). **The template is never modified and no new
  template is created.** The workout doc records `basedOn: templateId, sessionLabel: 'Deload'`
  so history/weekly review can tell a deload week from a regression.
- System prompt rule: *"Deloads, make-up sessions, and one-off intensity changes are session
  adjustments to an existing template — NEVER create a new template for them.
  create_workout_template is only for genuinely new recurring workouts."*
- This also handles "I missed legs — add some leg volume to tomorrow's push day" (per-exercise
  add for one session) without polluting the push template.

### 5.6.2 Library hygiene

- `usageCount` + `lastUsedDate` denormalized onto template docs (bump on workout start —
  cheap merge write). Workout library sorts by last-used; the stable core floats to the top.
- `archived: true` flag: archived templates hidden behind a collapsed "Archived" group in the
  library, excluded from coach context and the workout selector. Archive/unarchive via a row
  action (confirmSheet, non-destructive — never auto-delete).
- Coach tool `archive_template({templateId})` — but per pull-not-push, the coach only suggests
  archiving inside a weekly review or when directly asked to clean up ("you have 9 templates
  unused for 60+ days — archive them?" → one action card, one tap). Never spontaneously.
- The same cleanup pass proposes day-name renames per 5.5.5 ("Monday push" → "Push day") —
  `update_workout_template` rename, same id, history/PRs untouched.
- Dedupe guard in the tools prompt: before create_workout_template, call list_templates; if an
  existing template covers ≥70% of the same exercises, propose updating or varying it instead.

### 5.6.3 Coaching honesty about make-up volume

The make-up pattern (cramming missed volume into Saturday or spreading it across the week) is
exactly what the coach should manage, not what the user should guess at. Add to
`TRAINING_SCIENCE_PROMPT`: *"When the user misses a session, prefer redistributing a PORTION of
the missed volume across remaining days over doubling one day; if the week is nearly over, let
it go — one missed session costs almost nothing, but a crammed 2-hour make-up session raises
injury risk and wrecks the next week. Say this plainly when relevant."* The Phase 5.5 reflow +
weekly review make this concrete (move the day, or drop it and note it).

### Acceptance

- "Plan me a deload week" → session-adjustment proposals against EXISTING templates; template
  count unchanged after the whole week.
- "Make up for missed legs" → one-session additions or a moved day — no new template.
- Library shows most-used first; archiving works and archived templates vanish from coach
  context; nothing is ever auto-deleted.
- Unit tests: session-adjustment application (pure), dedupe similarity check, usage-sort.

---

## Cross-cutting notes

**Model routing.** Keep Opus 4.8 + adaptive thinking/xhigh for coach chat (quality is the product).
Weekly reviews and any future high-volume path use Sonnet. Centralize model IDs as constants at the
top of `functions/index.js` so switching is one line.

**Spend protection.** Every new Anthropic-calling function goes through `enforceAiDailyLimit` and
sets `maxInstances`. Tool loops count as one 'coach' unit per user message (not per API round-trip),
but cap loop iterations at 6.

**Security chore (do in Phase 1 PR).** The VAPID private key is hardcoded in `functions/index.js`.
Move it to a secret (`firebase functions:secrets:set VAPID_PRIVATE_KEY`) and add
`defineSecret`/`runWith` to the push functions. Unrelated to the coach but it's committed to the repo.

**Testing.** New pure logic (context builders, markdown formatter, tool-input validation) gets
Vitest files under `tests/unit/` importing real modules per the repo's conventions. UI-only changes:
manual smoke + `npm run audit:design`. Remember `window-wiring.test.js` will fail any rendered
onclick without a `window.*` assignment — self-wire handlers referenced only from this module's own
templates at the bottom of `ai-coach-ui.js` (the existing pattern there).

**Deploy.** Each phase: `firebase deploy --only functions` (functions changes) and
`firebase deploy --only hosting:dev` → verify on dev → `firebase deploy --only hosting:prod`.
Never bare `firebase deploy`.

---

---

# Part II — The next level (added 2026-07-06)

Phases 1–5 brought the coach to market parity-plus: streaming, grounded knowledge, in-app
actions, memory, proactive reviews. Part II is what no competitor has: the coach inside the
workout itself, learning from its own results, and using the camera. Build order: 6 → 7 → 8;
9–10 are design-gated until 6 and 7 have real usage.

---

## Phase 6 — In-workout live coaching

The coach today lives in its own tab, blind to the workout in progress. This phase puts it under
the bar: it sees the set you just logged and answers in seconds — "that was 8×145, take 155 next",
"machine's taken → swap to incline dumbbell", "shoulder tweak → here's how to finish the session
without pressing".

### 6.1 Architecture: proposal pattern, NOT server-side writes

**Critical constraint:** the active workout is client-owned state in `AppState`, auto-saved via
`debouncedSaveWorkoutData` (see active-workout-ui.js). A server-side tool writing the workout doc
would race the client's debounced saves and lose data. So in-workout write-tools do NOT touch
Firestore. Instead they return **proposals** the client renders with a one-tap Apply button:

- Server tool executes instantly (validates input, echoes a structured proposal, no I/O).
- Stream emits `{"type":"proposal","proposal":{kind, …}}`.
- Client renders a proposal card in the chat sheet; tapping **Apply** routes through the EXISTING
  client mutation functions (equipment swap → `openSharedEquipmentSheet` machinery / the same
  handlers `awOpenEquipmentSheet` uses; add exercise → same path as `awAddExercise`;
  set targets → write to the pending set row's fields). The normal auto-save then persists it.
- This is also the right UX: mid-set, the agent must never mutate your session unprompted.

Per CLAUDE.md's active-workout safety rule: do NOT refactor `awAddExercise` /
`awOpenEquipmentSheet` — add parallel apply-functions and verify change-equipment,
replace-exercise, add-exercise, and complete-workout flows after.

### 6.2 Server: live mode on `coachChatStream`

- Request gains `mode: 'live'` + `liveContext` (string, client-built).
- Live mode swaps the knobs — speed is the feature:
  - `LIVE_COACH_MODEL` constant (Sonnet, not Opus), default effort, `max_tokens: 1500`.
  - System prompt: `TRAINING_SCIENCE_PROMPT` + a live addendum — *"You are mid-workout with the
    user. Answer in 1–3 short sentences. One concrete prescription beats three options. Never
    coach through pain: pain → propose swaps or stopping, not pushing."*
  - Tools: read tools from Phase 3 (`get_exercise_history`, `get_prs`) plus new proposal tools:
    - `propose_next_target({exercise, weight, reps, why})`
    - `propose_swap({fromExercise, toExercise, equipment, why})` — must pick equipment available
      at the current gym (it's in the live context)
    - `propose_add_exercise({exercise, sets, reps, weight, why})`
    - `propose_rest({seconds, why})`
  - NO template write-tools in live mode (create/update template stays in the coach tab).
- Rate limit: new kind `'coachLive'`, 30/day (cheap model, short answers — the cap is generous
  on purpose; a set-by-set conversation is many small turns).

### 6.3 Client: `buildLiveWorkoutContext()` + chat sheet

New module `js/core/features/coach-live.js` (keep ai-coach-ui.js from growing):

- `buildLiveWorkoutContext()` — compact (~500 tokens, NOT the full training context):
  current gym + available equipment there (from `gym-session-context` + cached equipment),
  workout name + elapsed time, per-exercise state (done sets with weights/reps/type, remaining
  planned sets), current exercise + rest timer state, last session + PR for the CURRENT exercise
  (`getLastSessionDefaults` cache + PR store), today's readiness score if Phase 5 shipped.
- Entry point: a coach button in the active-workout header (next to the rest timer). Opens an
  `aw-sheet`-pattern bottom sheet (unique ids — `navigateTo()` force-removes `#aw-sheet`) with a
  mini chat: input bar, last few bubbles, proposal cards. The workout stays visible behind it;
  closing the sheet never touches workout state.
- Quick-prompt chips above the input, computed from live state: "What weight next?", "Machine's
  taken", "Something hurts", "Cut this short — 20 min left".
- Proposal cards: title, why-line, **Apply** / **Dismiss**. Apply routes to the client mutation
  (6.1) and confirms in-chat (`Applied — bench 155 next set.`). Dismiss sends nothing; the
  conversation continues.
- Live thread is separate from the coach-tab thread and is NOT saved to coachHistory (it's
  ephemeral session talk); a one-line summary MAY be appended to the workout notes on completion.

### Acceptance

- Mid-workout question → first token < ~3s; answers are 1–3 sentences.
- "What should I do next set?" → `propose_next_target` grounded in the sets just logged.
- "The row machine is taken" → swap proposal using equipment that exists at the current gym.
- Apply → the active workout actually changes, auto-save fires (verify `debouncedSaveWorkoutData`),
  and complete-workout still works end-to-end.
- Mentioning pain → the coach proposes swaps/stopping, never "push through".
- Unit tests: `buildLiveWorkoutContext` (pure, mocked AppState), proposal-tool validators.

---

## Phase 7 — Closed-loop learning (the coach learns what works)

Today the coach advises and never finds out what happened. Close the loop and it becomes a coach
that knows what works *for this user* — the retention moat.

### 7.1 Structured advice log

- New tool `log_advice({exercise, type, detail, targetValue})` with
  `type: 'weight_target' | 'deload' | 'volume_change' | 'exercise_swap' | 'technique'`.
  System prompt: whenever you give a concrete, checkable recommendation, log it (one call per
  recommendation, silent — no user-visible card).
- Writes to `users/{uid}/coachAdvice/{id}`: `{date, exercise, type, detail, targetValue, source:
  'chat'|'live'|'weekly_review'}`.

### 7.2 Outcome computation

- Client-side helper (new: `js/core/features/coach-outcomes.js`, pure + unit-tested) — for each
  advice doc 2–6 weeks old, compute the outcome from workout history: weight_target → was the
  target hit, and lift trend ±4 weeks around it; deload → volume actually dropped? then did the
  stalled lift move?; exercise_swap → is the new exercise still being done?
- Context gets a `Your past recommendations and what happened:` section (cap ~10, newest first):
  `2026-06-12 — suggested deload for bench; volume -42% that week; bench 185→195 in the 3 weeks
  after.` Present raw numbers — the prompt already forbids overclaiming; correlation ≠ causation.

### 7.3 Explicit feedback

- Thumbs up/down on every coach bubble (small, right-aligned, after streaming completes).
  Stores `feedback: 'up'|'down'` on the coachHistory doc/turn.
- Context line: `Feedback: user thumbed down 2 of your last 10 answers (both long generic ones).`
  Cheap signal, keeps the coach honest about style too.

### Acceptance

- Give advice → advice doc appears; 2+ weeks of subsequent workouts → outcome line shows up in
  context and the coach references its own track record when relevant.
- Outcome math fully unit-tested against fixture workout histories (this is pure-function
  territory — no Firebase in tests, per tests/fixtures conventions).

---

## Phase 8 — Machine photo ID (camera as input)

Walk into an unfamiliar gym, photograph a machine, and the coach knows what it is, what it works,
and adds it to your equipment at that gym. Directly feeds the multi-gym wedge — this is the
traveling-lifter feature.

- **Client:** camera/file input (`accept="image/*" capture="environment"`) from the coach tab and
  from the equipment library's add flow. Downscale client-side to ≤1024px JPEG (canvas) before
  upload — vision doesn't need more and mobile upload speed matters.
- **Server:** new callable `identifyMachine` (v1, same shape as `extractDexaData` — that's the
  template for an image→JSON extraction function). Vision-capable cheap model (Haiku/Sonnet).
  Returns `{brand, name, machineFunction, confidence, exercises: [..], notes}` as strict JSON.
  Rate limit kind `'vision'`, 10/day.
- **Matching:** resolve the guess against the equipment catalog + the user's own equipment using
  the existing machinery (`fuzzy-match.js`, `equipment-catalog-helpers.js`,
  `machine-exercise-matcher.js`, and `composeEquipmentName()` for the display name). Prefer an
  existing catalog/user entry over creating a duplicate — same confidence-gate philosophy as
  `equipment-id-resolver.js`.
- **UI:** result card in chat — photo thumbnail, resolved name, matched exercises, and one action:
  `Add to <current gym>` (creates/links the equipment doc via existing helpers, dual-writing
  locations[]/locationIds[] like the rest of the app). Low confidence → show the top-2 guesses
  and let the user pick.

### Acceptance

- Photo of a common machine → correct identification + sensible exercise mapping; add-to-gym
  creates a proper equipment doc visible in the equipment library at that location.
- Blurry/ambiguous photo → graceful "couldn't tell — closest guesses:" card, never a junk write.

---

## Phase 9 — Autonomous programming ("trust mode") — design first, then build

The coach owns a rolling program: each morning it generates today's session from the mesocycle
plan + readiness + last performance. The user just shows up. This is Fitbod's engine plus
explanation and negotiation — do NOT start it until Phases 6–7 have usage data (closed-loop
outcomes are the input that makes generated programming defensible).

Sketch (write a full design doc before implementing):

- `users/{uid}/programs/{id}`: goal, split, weeks, per-week volume/intensity targets, state.
- Tools: `get_program`, `create_program`, `adjust_program` — created and renegotiated entirely
  through chat ("I can only train 3 days next week" → program reflows).
- Morning generation: scheduled function (or on-open) builds today's session as a **dated
  instance** the user starts like any other workout — NOT a library template. Templates are
  recipes; trust-mode sessions are tonight's dinner. A year of trust mode adds zero templates.
  (Implementation can reuse the template shape internally with `kind: 'oneOff'` + auto-archive,
  or a session doc — decide in the design doc; the invariant is the library never grows.)
- Trust levels: propose-only (default) → auto-generate but confirm → full auto. Users earn their
  own comfort level.

---

## Phase 10 — Voice + real readiness data (further out)

- **Voice:** Web Speech API prototype first — mic button on the coach/live input (dictation), and
  optional TTS ("read answers aloud" toggle in live mode: hands are chalky, phone's on the floor).
  If it earns usage, upgrade to Capacitor-native speech plugins for reliability in noisy gyms.
- **HealthKit readiness:** the app already ships in Capacitor — a health plugin gives sleep
  duration and HRV. Feed both into the Phase 5 readiness context (manual 1–5 check-in stays as
  the fallback). This upgrades auto-regulation from "how do you feel?" to physiology, matching
  SensAI/Whoop on their home turf while keeping the act-in-app advantage.

---

## Design principle: pull, not push (non-negotiable)

The coach must be **crazy useful when invited, invisible when not**. Every Part II feature obeys
these rules — reject any implementation that violates them:

1. **The coach never initiates conversation.** No popups, no unprompted chat bubbles, no
   "have you considered…" interruptions — mid-workout or anywhere else. The live coach sheet
   exists only after the user taps the coach button.
2. **One notification, ever, and it's opt-outable:** the Monday weekly review push (Phase 5).
   Nothing else notifies. New insights elsewhere surface as a passive badge/card the user can
   ignore forever, not as interruptions.
3. **Nothing changes without a tap.** Proposals require Apply; templates the coach creates are
   additions, never silent replacements; "trust mode" (Phase 9) is explicitly opted into and
   reversible.
4. **Dismissal is silent and final.** Dismissing a proposal or ignoring a card never triggers a
   follow-up ("are you sure?"). No streak-guilt, no re-asking.
5. **Fast to enter, faster to leave.** The live sheet closes with one swipe and never blocks
   logging a set. If the coach is mid-answer when the sheet closes, it just stops — no "wait!".
6. **Quiet by default in copy.** Per CLAUDE.md copy rules — no exclamation marks outside real
   milestones, no cheerleading filler. The coach talks like a good trainer: brief, specific,
   then out of the way.

## Part II cross-cutting

- **Cost posture:** live mode + vision use cheap models by design; Opus stays exclusive to the
  coach tab's deep analysis. Every new Anthropic call site gets its own `enforceAiDailyLimit`
  kind and `maxInstances` cap. Centralize `LIVE_COACH_MODEL` / `VISION_MODEL` next to
  `COACH_MODEL`.
- **Kill switches:** each Part II feature ships behind a Config flag (`Config.LIVE_COACH_ENABLED`,
  `Config.MACHINE_ID_ENABLED`) so a misbehaving feature can be disabled by deploy without
  reverting code.
- **No delete, ever:** the coach has no delete tool in ANY phase or trust level — archive
  only, always reversible, and template edits always announce themselves with a diff card.
  Auto-archive exists (one-offs after use); auto-delete does not.
- **Safety line (applies everywhere):** the coach never encourages training through pain, never
  gives medical advice beyond "see a professional", and injury facts in memory/profile override
  any programming logic.

## Appendix — UI crispness punch list (added 2026-07-06, from the cowork design review)

Not coach work, but folded in here because this doc is the active queue. All findings verified
against source with file:line. Context: the dashboard V3 redesign, equipment-detail redesign,
exercise-editor cleanup, and composition-detail reorder (weight first, DEXA second) are ALREADY
SHIPPED in the working tree — don't redo them. These five remain, ordered by value:

1. **Hardcoded "lb" in metric drill-downs (data honesty).** `js/core/ui/metric-detail-ui.js`
   lines ~217 (body-part volume rows), ~269-270 (strength rows), ~291 (big-4 1RM insight) render
   raw " lb" while the body-weight path in the same file converts via `displayWeight()` +
   `AppState.globalUnit`. kg users see wrong labels. Convert all three sites the same way.

2. **Workout library row: competing tap intents.** `js/core/ui/template-selection.js` ~833-846 —
   row tap opens the editor, the inline 40px play button starts a workout, no visual separation
   (`templates.css` ~196-243). A missed edit-tap STARTS A WORKOUT. Give the play button clear
   bordered separation at the row's right edge (same treatment as the dashboard hero CTAs), or
   move start behind an explicit labeled button. Keep row tap = open editor, consistently.

3. **Locations tap-target/token sweep.** `styles/pages/locations.css` `.loc-map-card__use-current`
   has raw `padding: 6px 12px` (~30px tall — under --tap, and raw px violates token rules);
   `styles/components/grouped-rows.css` `.link-row-action` is raw `font-size: 0.76rem` with no
   min-height; rename/delete icon buttons on location list rows are --tap-sm (36px). Fix:
   `min-height: var(--tap)`, tokenized font sizes/padding.

4. **Nav polish.** Bottom-nav labels are `--font-2xs` (0.65rem ≈ 10px) on the app's most-used
   control — bump to `--font-xs`. Align More-menu labels with the page titles they open:
   "Exercise library" → page says "Exercises"; "Equipment library" → "Equipment"; "Your workouts"
   opens a page with no title. Pick one name per destination and use it in both places.

5. **Range-filter unification (July audit carry-over).** Three drill-down levels keep three
   independent range states with different defaults/option sets (`dashboardRange` 'W',
   `muscleDetailRange` 'M', `exerciseDetailRange` '6M'). Unify options and persist one pick
   across levels (`js/core/features/metrics/range-filter.js` is the shared home).

Verification per CLAUDE.md: `npm test` + `npm run lint` + `npm run audit:design` after each item;
item 2 also needs the active-workout safety checks (start-from-library flow).
