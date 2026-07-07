# Coach programs — "trust mode" design (Phase 9)

Status: **rungs 1 (propose-only) AND 2 (auto-generate + confirm) shipped**
2026-07-07 — the owner greenlit rung 2 early (single-owner app: the owner
trying it IS the usage data; it's opt-in via adjust_program trustLevel and
reversible). Rung 3 stays gated on Phase 7 outcome data existing (advice must
age 2+ weeks before the outcome engine scores it — nothing to learn from yet).

## What a program is

A **program** is a multi-week commitment with a direction: "4 weeks of strength
focus, deload in week 4." It answers the question the week plan can't: *why*
this week looks the way it does, and *what changes next week*.

The core design decision: **a program is a thin layer over primitives that
already exist** — it owns direction, not mechanics.

| Concern | Owned by | Phase |
|---|---|---|
| Which workout on which day | Week plan (`preferences/weekPlan`) | 5.5 |
| What a workout contains | Templates (the recipes) | — |
| Week-to-week intensity (deload −40%, heavy +5%) | Session adjustments at start time | 5.6.1 |
| Direction, duration, weekly targets | **Program doc (this phase)** | 9 |

Nothing here invents a new workout-start path, a new scheduler, or a second
source of day→workout truth. "Generate today's session" = the week plan names
the template, the program's current-week modifier rides in as a session
adjustment proposal.

## Data model

`users/{uid}/programs/{programId}`:

```js
{
  id, name,                    // "Strength block — summer"
  goal: 'strength' | 'hypertrophy' | 'recomp' | 'general',
  weeks: 4,                    // total length
  startDate: 'YYYY-MM-DD',     // Monday of week 1
  weekTargets: [               // one entry per week
    { week: 1, label: 'moderate', weightPct: 0,   note: 'baseline volume' },
    { week: 4, label: 'deload',   weightPct: -40, note: 'half volume, easy' },
  ],
  split: { mon: templateId|null, …, sun: null }, // snapshot; the LIVE copy is the week plan
  active: true,                // at most one active program (enforced on create)
  trustLevel: 'propose',       // v1: always 'propose'
  createdVia: 'coach',
  createdAt, lastUpdated,
}
```

**Current week is DERIVED, never stored**: `week = floor(days(startDate → today) / 7) + 1`.
No cron advances state; nothing rots. Past `weeks` → program is over (context
says so; the coach proposes the next block only when asked).

## Tools (coach tab only — not live mode)

- `get_program()` — the active program + derived current week/target.
- `create_program({name, goal, weeks, weekTargets, split})` — validates
  template ids, writes the doc (deactivating any prior active program), and
  **sets the week plan** to the split (one consent covers both — creating a
  program that doesn't schedule itself would be a lie). Action card.
- `adjust_program({changes})` — reflow weeks/targets/split ("I can only train
  3 days next week"); split changes re-write the week plan. Consent rule
  applies. Action card with a diff.

## How "today's session" gets generated (propose-only)

1. Context always carries: `Active program: Strength block — week 3 of 4
   (heavy, +5%)` + the week plan already in context.
2. User asks anything session-shaped ("what's today?", "start me off") → the
   coach answers from plan+program and, on request, emits a
   `propose_session_adjustments` card — "Start Push day — Heavy (+5%)" — the
   5.6.1 machinery applies it. Template count never changes; deload weeks
   never edit templates.

## Trust levels (the ladder — only rung 1 ships now)

1. **propose-only (v1, default, shipped)** — everything above. Zero writes
   without a tap; the program is knowledge + one-tap cards.
2. **auto-generate + confirm (SHIPPED, opt-in)** — with
   `trustLevel: 'auto_confirm'`, the dashboard Today card pre-builds the
   program-adjusted session ("Deload · −40% weight · week 4 of your program")
   and START is the acceptance (program-session.js). Baseline weeks render as
   normal days. Opt-in/out through the coach: "turn on auto mode" →
   adjust_program — consent rule guards it. No push notifications.
3. **full auto (gated, explicit opt-in)** — sessions regenerate from outcomes
   without confirmation; weekly review doubles as the audit log. Requires
   level 2 usage + demonstrated outcome quality.

Levels 2–3 are design-gated on real usage of level 1 + Phase 7 outcomes, per
the plan. `trustLevel` is stored so the upgrade is a data migration, not a
schema change.

## Why no scheduled generation function

Deriving the week from `startDate` and generating at ask-time means: no new
cron, no drift between a generated doc and reality, no cost when the user
doesn't train, and the pull-not-push principle holds. A morning-generation
function only earns its keep at trust level 2.
