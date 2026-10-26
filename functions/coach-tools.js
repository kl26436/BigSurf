/**
 * AI coach tools — definitions, pure validators, and Firestore executors.
 *
 * Split from index.js so the pure parts (input validation, template diffing)
 * are unit-testable from Vitest without firebase-admin. Executors take a
 * { db, userId } handle (dependency injection) and are always scoped to
 * users/{userId}/… — the model can never reach another user's data.
 */

const {
    applyPrescriptionFields, prescriptionFieldErrors, ROLES, PATTERNS, PROGRESSIONS,
} = require('./movement-patterns');
// (inferRole is required below with the AP-23 helpers.)
const { normalizeWeekTarget, isDeloadTarget } = require('./week-targets');
const { selectRotation, applyRotation } = require('./exercise-rotation');
const { convertToUnit } = require('./coach-outcomes');
const { computeVerdicts, buildBlockRetrospective } = require('./coach-rules');
const { getSessionIntent, weekOverrideOf } = require('./session-intent');
const { rankRotationCandidates } = require('./exercise-rotation');
const { applyPrimaryChoice, pickPrimaries } = require('./progress-scoreboard');
// TP-3 — the plan: timeline, roller, the same data load the Sunday roll uses.
const { buildPlanTimeline, describeCadence, cadenceOf } = require('./plan-timeline');
const { draftNextWave, rollWindow, cadenceFromProgram, ROTATION_POLICIES } = require('./plan-roller');
// TP-1 — goals: the same validation, baseline and status math as the Goals page.
const { normalizeGoal, normalizeEvent, captureBaseline, goalsWithStatus, goalName, GOAL_TYPES, GOAL_STATUSES, EVENT_KINDS } = require('./goal-progress');
const { inferRole } = require('./movement-patterns');
const { diceSimilarity } = require('./fuzzy-match');
const {
    toolError, errorText, canonicalEnum, deloadLock, progressionGuard, loadabilityGuard,
    resolveEquipment, findNearDuplicate, programShapeIssues,
    TEMPLATE_CATEGORIES, TEMPLATE_KINDS, PROGRAM_GOALS, ADVICE_TYPES,
} = require('./coach-guards');

// Shared schema for a program week target (CP-3). A week can move load,
// set counts, rep bands and effort — not just a percentage.
const WEEK_TARGET_ITEM = {
    type: 'object',
    properties: {
        week: { type: 'number' },
        label: { type: 'string', description: 'e.g. "accumulate", "intensify", "deload"' },
        weightPct: { type: 'number', description: 'vs baseline, e.g. -35 for a deload' },
        setDelta: { type: 'number', description: 'Sets added (+) or removed (−) per exercise, −3…+3. The app caps additions at each muscle\'s MRV.' },
        repRange: { type: 'array', items: { type: 'number' }, description: '[low, high] rep band for the week, e.g. [8, 12]' },
        rpeTarget: { type: 'number', description: 'Effort target on the 6–10 RPE scale' },
        note: { type: 'string' },
    },
    required: ['week', 'label'],
};

// Shared schema for the CP-1 prescription fields on a template exercise.
const PRESCRIPTION_PROPS = {
    repRange: { type: 'array', items: { type: 'number' }, description: 'Optional [low, high] rep band the block waves within, e.g. [8, 12]' },
    rpeTarget: { type: 'number', description: 'Optional effort target on the 6–10 RPE scale (RIR = 10 − RPE)' },
    role: { type: 'string', enum: ROLES, description: "primary = the lift progress is measured on (never rotated) · secondary = other compound · accessory = isolation (rotates freely) · core" },
    pattern: { type: 'string', enum: PATTERNS, description: 'What the movement does mechanically' },
    progression: { type: 'string', enum: PROGRESSIONS, description: 'double (reps then load, default) · load-only · rep-only · hold' },
};

// AP-18 — one exercise schema for every tool that writes exercises. Out of
// range values are REJECTED by the executor (not clamped to 3×10), and the
// error says what's allowed.
const EXERCISE_ITEM = {
    type: 'object',
    properties: {
        name: { type: 'string', description: 'Exercise name (≤80 chars)' },
        bodyPart: { type: 'string' },
        equipmentType: { type: 'string' },
        equipment: { type: 'string', description: "A machine from the user's equipment library (list_equipment) — unknown names are rejected with the nearest matches" },
        sets: { type: 'integer', minimum: 1, maximum: 10, description: 'Default 3 when omitted' },
        reps: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 10 when omitted' },
        weight: { type: 'number', minimum: 0, description: "In the user's unit, from their history; must be loadable (whole smallest-jumps from a weight they've lifted) and never above a stalled lift's rule target" },
        ...PRESCRIPTION_PROPS,
    },
    required: ['name'],
};

// day → templateId | "rest" | null — the set_week_plan shape.
const SPLIT_SCHEMA = {
    type: 'object',
    description: 'day → templateId (from list_templates) | "rest" | null',
    properties: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
        .map(d => [d, { type: ['string', 'null'] }])),
    additionalProperties: false,
};

// AP-17 — template writes are locked in a program's deload week.
const OVERRIDE_PROPS = {
    override: { type: 'boolean', description: "Deload-lock override. ONLY when the user explicitly insists on editing this workout during a deload week; requires overrideReason. Logged." },
    overrideReason: { type: 'string', description: 'Why the deload lock is being overridden (the user\'s words)' },
};

// ── Tool definitions (Anthropic schema) ─────────────────────────────

const TOOL_DEFINITIONS = [
    {
        name: 'get_exercise_history',
        description: "Full session history for ONE exercise: date, sets/reps/weights (already in the user's display unit), RPE when logged, equipment, notes, and the session label (e.g. 'Deload' — a planned light session, not a regression). Use when discussing a specific lift in depth — the context summary only carries an 8-point max-weight trend.",
        input_schema: {
            type: 'object',
            properties: {
                exercise: { type: 'string', description: 'Exercise name as it appears in the training data' },
                limit: { type: 'number', description: 'Max sessions to return (default 8, cap 20)' },
            },
            required: ['exercise'],
        },
    },
    {
        name: 'list_templates',
        description: "The user's saved workout templates (id, name, category, exercises). Call before referencing or modifying a saved workout.",
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'get_prs',
        description: "The user's personal records store — best weight/reps/volume per exercise+equipment with dates, in the user's display unit.",
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'list_equipment',
        description: "The user's full equipment library grouped by gym, INCLUDING pieces never used in a logged workout (lastUsed: null). Call before picking exercises or equipment for a template or program — the first-message summary is truncated, this is the complete inventory, and never-used machines are prime variety material.",
        input_schema: {
            type: 'object',
            properties: {
                location: { type: 'string', description: 'Optional gym-name filter (substring match)' },
            },
        },
    },
    {
        name: 'create_workout_template',
        description: 'Create a saved workout template in the app. Use this whenever the user asks you to build/make/plan a workout — never answer such requests with a text-only workout description. Weights should come from their history when known.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Short workout name by what it IS ("Pull day", "Legs — heavy") — NEVER a weekday' },
                category: { type: 'string', enum: TEMPLATE_CATEGORIES },
                kind: { type: 'string', enum: TEMPLATE_KINDS, description: "'core' = recurring workout (default) · 'variation' = riff on an existing core workout (pass parentTemplateId) · 'oneOff' = single occasion (travel gym, test day — auto-archives after first use). A new core/oneOff template that overlaps an existing one ≥70% is rejected as a near-duplicate — update or vary that one instead." },
                parentTemplateId: { type: 'string', description: 'Required when kind=variation: the core template this varies' },
                forPlan: { type: 'boolean', description: "true when building a session FOR the user's plan in a planning conversation — it lives with the plan (the Workouts tab's \"Your plan\" group), not in their own list; they can save a copy. Default false (a workout they asked to keep)." },
                exercises: {
                    type: 'array',
                    description: '5-8 exercises for a full workout (compound movements first); fewer only if the user asked for fewer',
                    minItems: 1,
                    maxItems: 12,
                    items: EXERCISE_ITEM,
                },
                ...OVERRIDE_PROPS,
            },
            required: ['name', 'exercises'],
        },
    },
    {
        name: 'create_program',
        description: 'Create a multi-week program (propose-only trust level: the program informs your advice and one-tap session cards — it never auto-writes workouts). ALSO sets the week plan to the split, so one consent covers both. Deactivates any prior program. Templates for the split must already exist (create them first).',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'e.g. "Strength block — 4 weeks"' },
                goal: { type: 'string', enum: PROGRAM_GOALS },
                weeks: { type: 'integer', minimum: 1, maximum: 16, description: '4+ weeks must include a deload week' },
                startDate: { type: 'string', description: 'YYYY-MM-DD, the Monday of week 1' },
                weekTargets: {
                    type: 'array',
                    description: 'One entry per week that differs from baseline. Give the block a SHAPE: volume ramps (setDelta), reps descend (repRange), effort tightens (rpeTarget), then a deload (negative setDelta and/or weightPct).',
                    items: WEEK_TARGET_ITEM,
                },
                split: SPLIT_SCHEMA,
                rationale: {
                    type: 'object',
                    description: "REQUIRED for 4+ weeks — the planning talk-through, saved on the program and shown on the Block page: block = the block in one line; weeks = what each week is FOR; fixed = the primaries kept and why; changed = each swap and why; watch = the scoreboard numbers to check at week 4.",
                    properties: {
                        block: { type: 'string' },
                        weeks: { type: 'array', items: { type: 'object', properties: { week: { type: 'integer' }, why: { type: 'string' } }, required: ['week', 'why'] } },
                        fixed: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, why: { type: 'string' } }, required: ['name', 'why'] } },
                        changed: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, why: { type: 'string' } }, required: ['to', 'why'] } },
                        watch: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['block'],
                },
                rotateAccessories: {
                    type: 'boolean',
                    description: "true = rotate every ACCESSORY exercise on the split's templates to the stalest same-pattern machine at the user's current gym (never-used first). Primaries and secondaries are never touched. Use when the user wants variety or a fresh block; the card lists every swap and undo restores the templates.",
                },
            },
            required: ['name', 'goal', 'weeks', 'startDate', 'split'],
        },
    },
    {
        name: 'adjust_program',
        description: 'Adjust the active program: rename, change weeks/startDate/weekTargets, or reshape the split ("I can only train 3 days next week"). Split changes also update the week plan. Consent rule applies.',
        input_schema: {
            type: 'object',
            properties: {
                changes: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        weeks: { type: 'integer', minimum: 1, maximum: 16 },
                        startDate: { type: 'string' },
                        weekTargets: { type: 'array', items: WEEK_TARGET_ITEM, description: 'Replaces the whole weekTargets list' },
                        split: SPLIT_SCHEMA,
                        rationale: { type: 'object', description: 'Replaces the saved planning rationale (same shape as create_program.rationale)' },
                        trustLevel: { type: 'string', enum: ['propose', 'auto_confirm'], description: "'propose' (default — everything is a card) or 'auto_confirm' (the dashboard pre-builds each week's adjusted session; starting it is the confirmation). Switch ONLY on an explicit user request; always reversible." },
                    },
                },
            },
            required: ['changes'],
        },
    },
    {
        name: 'log_advice',
        description: 'Silently log a concrete, CHECKABLE recommendation you just gave (one call per recommendation) so future conversations can reference whether it worked. Not user-visible. Never log vague advice.',
        input_schema: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ADVICE_TYPES },
                exercise: { type: 'string', description: 'Exercise it applies to, when specific' },
                detail: { type: 'string', description: 'One-line summary of the recommendation' },
                targetValue: { description: 'The checkable value: target weight (number) or swap-to exercise name (string)' },
            },
            required: ['type', 'detail'],
        },
    },
    {
        name: 'archive_template',
        description: "Archive a saved workout (non-destructive — hidden from the library's main list, the workout selector, and coach context; unarchivable in the app). Only when the user asks to clean up or approves a cleanup suggestion — never spontaneously.",
        input_schema: {
            type: 'object',
            properties: { templateId: { type: 'string' } },
            required: ['templateId'],
        },
    },
    {
        name: 'propose_session_adjustments',
        description: "Adjust an existing workout FOR ONE SESSION ONLY — deloads, make-up volume, time-crunched versions. Renders a card that starts the workout with the adjustments applied; the template itself is NEVER modified and no new template is created. This is the REQUIRED tool for deloads and one-off intensity changes.",
        input_schema: {
            type: 'object',
            properties: {
                templateId: { type: 'string' },
                label: { type: 'string', description: 'Short session label, e.g. "Deload", "Make-up legs"' },
                weightPct: { type: 'number', minimum: -90, maximum: 100, description: 'Global weight change in percent, e.g. -40 for a deload' },
                addExercises: { type: 'array', items: EXERCISE_ITEM, maxItems: 5, description: 'Exercises added for this session only' },
                dropExercises: { type: 'array', items: { type: 'string' }, description: 'Exercise names skipped this session' },
                why: { type: 'string' },
            },
            required: ['templateId', 'label'],
        },
    },
    {
        name: 'get_verdicts',
        description: "The app's rules-engine verdicts, computed fresh with the SAME rules as the set rows and the dashboard: today's session intent (deload / peak / build), a progression target per exercise for today's and this week's planned workouts (action bump / consolidate / chase-rep / back-off / rotate / deload, weight × reps in the user's unit, stall rung), whether a deload is due, this week's sets per muscle vs MRV, and the progress scoreboard (best estimated 1RM per 4-week window per main lift, rep PRs, movement-pattern coverage). Authoritative: explain these, don't override them. The first message's Rules verdicts block is this same data — call this when that block is missing, from an earlier day, or the user just logged a session.",
        input_schema: {
            type: 'object',
            properties: {
                scope: { type: 'string', enum: ['week', 'block'], description: "'week' (default) = today's targets + scoreboard. 'block' = how the active (or just-finished) program went: e1RM start → end per main lift, days trained per week, fatigue flags and under-trained patterns by week, accessories never used — call this to open any 'what's next?' conversation." },
            },
        },
    },
    {
        name: 'get_rotation_candidates',
        description: "Ranked replacements for ONE exercise (or a movement pattern) from the user's equipment at a gym — same-pattern machines, never-used first, then longest idle, each with its reason — plus the primaries held fixed. Nothing is written. Call this for ANY swap or rotation question and present its top choice with its reason; hand-pick only when it returns nothing.",
        input_schema: {
            type: 'object',
            properties: {
                exercise: { type: 'string', description: 'The exercise to replace' },
                pattern: { type: 'string', enum: PATTERNS, description: 'Or a movement pattern to fill' },
                location: { type: 'string', description: "Gym name (default: where they're training / last trained)" },
                limit: { type: 'integer', minimum: 1, maximum: 10 },
            },
        },
    },
    {
        name: 'set_primary_lifts',
        description: "Set the main lifts (3–8) the progress scoreboard tracks and the variety engine never rotates: writes role:'primary' on those exercises in the user's saved workouts and clears it elsewhere. Names must exist in their workouts. Do this WITH the user in the first planning conversation — ask which lifts they care about; consent rule applies.",
        input_schema: {
            type: 'object',
            properties: { exercises: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8 } },
            required: ['exercises'],
        },
    },
    {
        name: 'list_goals',
        description: "The user's goals (lift, body weight, composition, days a week, a movement) with each one's measured status sentence, plus their dated events. The Goals lines in the first message carry the same sentences — call this to drill in or to get ids for update_goal.",
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'set_goal',
        description: "Create one measurable goal. The app measures the starting point from the data — never ask the user where they are. Lift goals must name a main lift (the error lists them). Consent rule applies. Not for vague intentions — those stay in conversation.",
        input_schema: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['lift', 'bodyweight', 'composition', 'consistency', 'balance'] },
                metric: { type: 'string', enum: ['estimatedMax', 'weight', 'leanMass', 'bodyFatPct', 'daysPerWeek', 'patternSets'], description: 'Only needed for composition (leanMass | bodyFatPct); the rest follow the type.' },
                exercise: { type: 'string', description: 'lift goals: the main lift' },
                pattern: { type: 'string', enum: PATTERNS, description: 'balance goals: the movement pattern' },
                target: { type: 'number', description: "Estimated max / weight / lean mass in the user's unit; body fat in %; days a week 1–7; weekly sets 1–40" },
                by: { type: ['string', 'null'], description: 'YYYY-MM-DD, after today; null = open-ended' },
                eventId: { type: 'string', description: 'The event this goal is for (from list_goals / add_event)' },
                name: { type: 'string', description: 'Optional short label' },
            },
            required: ['type', 'target'],
        },
    },
    {
        name: 'update_goal',
        description: "Change one goal's target, date, label or status (active | paused | met | missed). Get the id from list_goals or the Goals lines. Consent rule applies.",
        input_schema: {
            type: 'object',
            properties: {
                goalId: { type: 'string' },
                target: { type: 'number' },
                by: { type: ['string', 'null'] },
                status: { type: 'string', enum: ['active', 'paused', 'met', 'missed'] },
                name: { type: 'string' },
            },
            required: ['goalId'],
        },
    },
    {
        name: 'get_report_card',
        description: "A Sunday report card (the week in one page: showed up, strength, body, goals, recovery, balance, next week) and the one change it proposed. Default: the latest. Quote its sentences — they're computed by the app.",
        input_schema: { type: 'object', properties: { weekKey: { type: 'string', description: "The week's Monday, YYYY-MM-DD" } } },
    },
    {
        name: 'add_event',
        description: "Add a date the user is training toward (wedding, trip, meet). The plan lightens the week before and holds steady through it. Consent rule applies.",
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                date: { type: 'string', description: 'YYYY-MM-DD, after today' },
                kind: { type: 'string', enum: ['look', 'perform', 'other'] },
            },
            required: ['name', 'date'],
        },
    },
    {
        name: 'get_workouts',
        description: "Whole logged sessions by date: one day ({date}) or a range ({from, to}), newest first, max 14 — exercises with every set (weights in the user's unit, RPE), session label, gym, readiness and notes. Use for 'what did I do last Tuesday?' or comparing to the same week last block; the context only carries the last 12 sessions.",
        input_schema: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'YYYY-MM-DD' },
                from: { type: 'string', description: 'YYYY-MM-DD' },
                to: { type: 'string', description: 'YYYY-MM-DD' },
            },
        },
    },
    {
        name: 'propose_week_adjustment',
        description: "Change the load/volume of every session for a week (or a few) — 'last week was hard', 'I'm beat, go lighter', 'add a set this week'. Renders a card listing the affected sessions; on the user's tap it sets the week override (it beats the program's week for its window) and, with extendBlock, pushes the program's remaining weeks back so nothing is skipped. Nothing applies without the tap. Use instead of editing workouts or the program for a temporary change.",
        input_schema: {
            type: 'object',
            properties: {
                weightPct: { type: 'number', minimum: -50, maximum: 10, description: 'e.g. -10 for a lighter week, -35 for a full deload' },
                setDelta: { type: 'integer', minimum: -3, maximum: 3 },
                label: { type: 'string', description: "Short, e.g. 'Lighter week', 'Deload'" },
                weeks: { type: 'integer', minimum: 1, maximum: 4 },
                from: { type: 'string', description: 'YYYY-MM-DD, default today' },
                extendBlock: { type: 'boolean', description: 'Push the active program back by the same number of weeks' },
                why: { type: 'string' },
            },
        },
    },
    {
        name: 'get_plan',
        description: "The user's plan: the split by day, the cadence (build weeks then a lighter one), this week's kind, the next lighter week, the next 6 weeks' kinds, goals with status, events, the current wave's dates and any accessory swaps waiting, plus today/tomorrow's planned session. Call before answering \"what should I do today / this week / next few weeks\".",
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'update_plan',
        description: "Change the plan's standing shape — cadence ({buildWeeks 1-8, lighterWeek}), how far ahead it fills in (horizonWeeks 4-26), minutes per session, rotationPolicy ('ask' = offer accessory swaps on the Sunday card · 'auto' = apply them when the next weeks roll), paused (true stops it continuing on its own), the plan's name, or the split (day → saved workout id | 'rest' | null; same rules as set_week_plan). Consent rule applies.",
        input_schema: {
            type: 'object',
            properties: {
                cadence: { type: 'object', properties: { buildWeeks: { type: 'integer', minimum: 1, maximum: 8 }, lighterWeek: { type: 'boolean' } } },
                horizonWeeks: { type: 'integer', minimum: 4, maximum: 26 },
                sessionMinutes: { type: 'integer', minimum: 15, maximum: 180 },
                rotationPolicy: { type: 'string', enum: ['ask', 'auto'] },
                paused: { type: 'boolean' },
                name: { type: 'string' },
                split: SPLIT_SCHEMA,
            },
        },
    },
    {
        name: 'draft_next_wave',
        description: "Look-up: the next few weeks exactly as the app would roll them (same sessions, week kinds with events applied, levers, the accessory swaps the engine suggests, a plain-words rationale). Edit it with overrides, then pass the result to create_program (name, weeks, startDate, weekTargets, split, rationale) when the user agrees — never compose a program from scratch when this draft fits.",
        input_schema: {
            type: 'object',
            properties: {
                startDate: { type: 'string', description: 'YYYY-MM-DD; default = when the next wave is due' },
                buildWeeks: { type: 'integer', minimum: 1, maximum: 8 },
                lighterWeek: { type: 'boolean' },
                rotate: { type: 'boolean', description: 'false = no accessory swaps' },
                skipSwaps: { type: 'array', items: { type: 'string' }, description: 'Exercises to keep (no swap)' },
            },
        },
    },
    {
        name: 'set_week_plan',
        description: 'Set or update the weekly schedule (partial updates fine — only days you pass change). Values: a templateId from list_templates, "rest", or null to clear. Requires explicit user consent like every write.',
        input_schema: {
            type: 'object',
            properties: {
                days: {
                    type: 'object',
                    description: 'e.g. {"mon":"push_day","tue":"rest","wed":null}',
                    properties: {
                        mon: { type: ['string', 'null'] }, tue: { type: ['string', 'null'] },
                        wed: { type: ['string', 'null'] }, thu: { type: ['string', 'null'] },
                        fri: { type: ['string', 'null'] }, sat: { type: ['string', 'null'] },
                        sun: { type: ['string', 'null'] },
                    },
                },
            },
            required: ['days'],
        },
    },
    {
        name: 'remember_fact',
        description: 'Store one short durable fact about the user (injury, schedule quirk, equipment quirk, preference) in coach memory. Goals and dated events are NOT facts — they go through set_goal / add_event. Never store measurements the app already tracks (weights, body weight, PRs).',
        input_schema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'One short sentence, e.g. "Left knee is sketchy on deep squats"' },
            },
            required: ['text'],
        },
    },
    {
        name: 'forget_fact',
        description: 'Delete one fact from coach memory by its id (ids are shown alongside remembered facts in your system prompt).',
        input_schema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
        },
    },
    {
        name: 'update_workout_template',
        description: 'Modify an existing saved workout template: rename, add/remove exercises, REORDER exercises, or change sets/reps/weight on an exercise. ALWAYS use this (not create_workout_template) when the user refers to a workout they already have. Call list_templates first if you do not know the templateId.',
        input_schema: {
            type: 'object',
            properties: {
                templateId: { type: 'string' },
                changes: {
                    type: 'object',
                    properties: {
                        rename: { type: 'string' },
                        addExercises: { type: 'array', items: EXERCISE_ITEM },
                        removeExercises: { type: 'array', items: { type: 'string' }, description: 'Exercise names to remove' },
                        reorderExercises: { type: 'array', items: { type: 'string' }, description: 'The COMPLETE list of existing exercise names in the desired new order' },
                        setExercise: {
                            type: 'object',
                            description: 'Change sets/reps/weight on one exercise by name',
                            properties: {
                                name: { type: 'string' },
                                sets: { type: 'integer', minimum: 1, maximum: 10 },
                                reps: { type: 'integer', minimum: 1, maximum: 50 },
                                weight: { type: 'number', minimum: 0 },
                            },
                            required: ['name'],
                        },
                    },
                },
                ...OVERRIDE_PROPS,
            },
            required: ['templateId', 'changes'],
        },
    },
    {
        name: 'replace_day',
        description: 'Rewrite a saved workout in ONE step: pass the COMPLETE new exercise list (kept + changed + added; anything omitted is removed). Use this instead of update_workout_template whenever a request changes more than one exercise on a day — rotating accessories, restructuring a day, re-waving sets/reps across the board. Renders one diff card; the user can undo it. Call list_templates first for the templateId, and list_exercises / list_equipment for replacements.',
        input_schema: {
            type: 'object',
            properties: {
                templateId: { type: 'string' },
                exercises: {
                    type: 'array',
                    description: 'The full new exercise list, in order.',
                    minItems: 1,
                    maxItems: 20,
                    items: EXERCISE_ITEM,
                },
                rename: { type: 'string', description: 'Optional new name for the workout' },
                why: { type: 'string', description: 'One line on what changed and why — shown on the card' },
                ...OVERRIDE_PROPS,
            },
            required: ['templateId', 'exercises'],
        },
    },
    {
        name: 'list_exercises',
        description: "The user's full exercise library (built-in + custom, minus hidden), each with body part, equipment type, tags and lastUsed (null = never logged). Call before suggesting or swapping exercises — the first-message summary only shows what is already in their templates. Filter by bodyPart, or unusedOnly for variety material.",
        input_schema: {
            type: 'object',
            properties: {
                bodyPart: { type: 'string', description: 'Optional body-part filter (substring, case-insensitive)' },
                unusedOnly: { type: 'boolean', description: 'Only exercises never logged in a workout' },
            },
        },
    },
];

// ── Pure validation / transformation ────────────────────────────────

function intIn(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < min || n > max) return fallback;
    return n;
}

/**
 * Validate + normalize one exercise entry. Normalized shape matches what the
 * client's template editor expects: `machine` is the display name key.
 *
 * AP-18 — REJECT, don't coerce. A value outside its range used to become a
 * silent default (sets 12 → 3, reps 99 → 10, role 'chief' dropped): the tool
 * reported success, the model told the user "12 sets", the template said 3.
 * Absent fields still get defaults (3×10); present-but-invalid is an error.
 * @returns {object} the exercise, or `{error: string}` naming the field and
 *   what's allowed
 */
function normalizeExercise(ex) {
    if (!ex || typeof ex !== 'object') return { error: 'each exercise must be an object with a name' };
    const name = typeof ex.name === 'string' ? ex.name.trim() : '';
    if (!name) return { error: 'each exercise needs a name' };
    if (name.length > 80) return { error: `exercise name too long (max 80 chars): "${name.slice(0, 40)}…"` };
    const has = (k) => ex[k] !== undefined && ex[k] !== null;
    const sets = has('sets') ? intIn(ex.sets, 1, 10, null) : 3;
    if (sets == null || (has('sets') && Number(ex.sets) !== sets)) return { error: `${name}: sets must be a whole number 1-10 (got ${JSON.stringify(ex.sets)})` };
    const reps = has('reps') ? intIn(ex.reps, 1, 50, null) : 10;
    if (reps == null || (has('reps') && Number(ex.reps) !== reps)) return { error: `${name}: reps must be a whole number 1-50 (got ${JSON.stringify(ex.reps)})` };
    const out = { machine: name, sets, reps };
    if (has('weight')) {
        if (typeof ex.weight !== 'number' || !(ex.weight >= 0) || ex.weight >= 2000) {
            return { error: `${name}: weight must be a number 0-2000 in the user's unit (got ${JSON.stringify(ex.weight)})` };
        }
        out.weight = ex.weight;
    }
    const bad = prescriptionFieldErrors(ex);
    if (bad.length) return { error: `${name}: ${bad.join('; ')}` };
    if (typeof ex.bodyPart === 'string' && ex.bodyPart.trim()) out.bodyPart = ex.bodyPart.trim();
    if (typeof ex.equipmentType === 'string' && ex.equipmentType.trim()) out.equipmentType = ex.equipmentType.trim();
    if (typeof ex.equipment === 'string' && ex.equipment.trim()) out.equipment = ex.equipment.trim();
    // CP-1 prescription fields (repRange, rpeTarget, role, pattern,
    // progression) — this whitelist used to drop them silently (Bug 7).
    applyPrescriptionFields(out, ex);
    return out;
}

/**
 * Validate create_workout_template input.
 * @returns {{ok:true, normalized:{name,category,exercises}} | {ok:false, error:string}}
 */
function validateCreateTemplateInput(input) {
    if (!input || typeof input !== 'object') return { ok: false, error: 'Missing input' };
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return { ok: false, error: 'Template name is required' };
    if (name.length > 60) return { ok: false, error: 'Template name too long (max 60 chars)' };
    if (!Array.isArray(input.exercises) || input.exercises.length === 0) {
        return { ok: false, error: 'At least one exercise is required' };
    }
    if (input.exercises.length > 12) {
        return { ok: false, error: 'Too many exercises (max 12)' };
    }
    const exercises = [];
    for (const raw of input.exercises) {
        const ex = normalizeExercise(raw);
        if (ex.error) return { ok: false, error: ex.error };
        exercises.push(ex);
    }
    let category = 'Other';
    if (input.category != null && input.category !== '') {
        category = canonicalEnum(input.category, TEMPLATE_CATEGORIES);
        if (!category) return { ok: false, error: `category must be one of ${TEMPLATE_CATEGORIES.join(', ')} (got ${JSON.stringify(input.category)})` };
    }
    return { ok: true, normalized: { name, category, exercises } };
}

/**
 * Apply update_workout_template changes to a template doc (pure — no I/O).
 * @returns {{ok:true, updated:object, diffSummary:string} | {ok:false, error:string}}
 */
function applyTemplateChanges(template, changes) {
    if (!template || typeof template !== 'object') return { ok: false, error: 'Template not found' };
    if (!changes || typeof changes !== 'object') return { ok: false, error: 'Missing changes' };

    const updated = { ...template, exercises: Array.isArray(template.exercises) ? template.exercises.map(e => ({ ...e })) : [] };
    const diffs = [];
    const exName = (e) => e.machine || e.name || '';

    if (typeof changes.rename === 'string' && changes.rename.trim()) {
        const next = changes.rename.trim().slice(0, 60);
        if (next !== updated.name) {
            diffs.push(`Renamed "${updated.name}" → "${next}"`);
            updated.name = next;
        }
    }

    if (Array.isArray(changes.removeExercises)) {
        for (const raw of changes.removeExercises) {
            const target = String(raw || '').trim().toLowerCase();
            if (!target) continue;
            const idx = updated.exercises.findIndex(e => exName(e).toLowerCase() === target);
            if (idx === -1) return { ok: false, error: `No exercise named "${raw}" in this workout` };
            diffs.push(`Removed ${exName(updated.exercises[idx])}`);
            updated.exercises.splice(idx, 1);
        }
    }

    if (Array.isArray(changes.addExercises)) {
        for (const raw of changes.addExercises) {
            const ex = normalizeExercise(raw);
            if (ex.error) return { ok: false, error: `addExercises: ${ex.error}` };
            if (updated.exercises.length >= 20) return { ok: false, error: 'Workout is full (max 20 exercises)' };
            updated.exercises.push(ex);
            diffs.push(`Added ${ex.machine} ${ex.sets}×${ex.reps}`);
        }
    }

    if (Array.isArray(changes.reorderExercises) && changes.reorderExercises.length > 0) {
        const want = changes.reorderExercises.map(n => String(n || '').trim().toLowerCase());
        if (want.length !== updated.exercises.length) {
            return { ok: false, error: `reorderExercises must list ALL ${updated.exercises.length} exercises (got ${want.length})` };
        }
        const byName = new Map(updated.exercises.map(e => [exName(e).toLowerCase(), e]));
        if (byName.size !== updated.exercises.length) {
            return { ok: false, error: 'Workout has duplicate exercise names — reorder not supported here' };
        }
        const reordered = [];
        for (const n of want) {
            const ex = byName.get(n);
            if (!ex) return { ok: false, error: `No exercise named "${n}" in this workout` };
            if (reordered.includes(ex)) return { ok: false, error: `"${n}" listed twice in reorderExercises` };
            reordered.push(ex);
        }
        const changed = reordered.some((e, i) => e !== updated.exercises[i]);
        if (changed) {
            updated.exercises = reordered;
            diffs.push(`Reordered: ${reordered.map(exName).join(' → ')}`);
        }
    }

    if (changes.setExercise && typeof changes.setExercise === 'object') {
        const target = String(changes.setExercise.name || '').trim().toLowerCase();
        const ex = updated.exercises.find(e => exName(e).toLowerCase() === target);
        if (!ex) return { ok: false, error: `No exercise named "${changes.setExercise.name}" in this workout` };
        const c = changes.setExercise;
        if (c.weight != null) {
            const w = Number(c.weight);
            if (isNaN(w) || w < 0 || w >= 2000) return { ok: false, error: 'Invalid weight' };
            diffs.push(`${exName(ex)} ${ex.weight ?? '—'} → ${w}`);
            ex.weight = w;
        }
        if (c.sets != null) {
            const s = intIn(c.sets, 1, 10, null);
            if (s == null) return { ok: false, error: 'Invalid sets (1-10)' };
            if (s !== ex.sets) { diffs.push(`${exName(ex)} sets ${ex.sets ?? '—'} → ${s}`); ex.sets = s; }
        }
        if (c.reps != null) {
            const r = intIn(c.reps, 1, 50, null);
            if (r == null) return { ok: false, error: 'Invalid reps (1-50)' };
            const cur = ex.defaultReps ?? ex.reps;
            if (r !== cur) { diffs.push(`${exName(ex)} reps ${cur ?? '—'} → ${r}`); ex.reps = r; if ('defaultReps' in ex) ex.defaultReps = r; }
        }
    }

    if (diffs.length === 0) return { ok: false, error: 'No supported changes provided (rename, addExercises, removeExercises, reorderExercises, setExercise)' };
    return { ok: true, updated, diffSummary: diffs.join('; ') };
}

/**
 * AP-23e — the planning rationale saved on the program (the Block page
 * renders it). Required for 4+ week blocks; shapes are clipped, not guessed.
 * @returns {{ok:true, rationale:object|null} | {ok:false, error:string}}
 */
function normalizeRationale(r, weeks, { required = false } = {}) {
    if (r == null) {
        return required
            ? { ok: false, error: `A ${weeks}-week program needs a rationale: {block, weeks:[{week, why}], fixed:[{name, why}], changed:[{from, to, why}], watch:[...]} — the talk-through the Block page shows.` }
            : { ok: true, rationale: null };
    }
    if (typeof r !== 'object') return { ok: false, error: 'rationale must be an object' };
    const block = clip(r.block, 240);
    if (!block) return { ok: false, error: 'rationale.block (the block in one line) is required' };
    const arr = (v) => (Array.isArray(v) ? v : []);
    const out = {
        block,
        weeks: arr(r.weeks).map(x => ({ week: intIn(x?.week, 1, weeks, null), why: clip(x?.why, 200) }))
            .filter(x => x.week && x.why).slice(0, 16),
        fixed: arr(r.fixed).map(x => ({ name: clip(x?.name, 80), why: clip(x?.why, 200) })).filter(x => x.name).slice(0, 10),
        changed: arr(r.changed).map(x => ({ from: clip(x?.from, 80) || null, to: clip(x?.to, 80), why: clip(x?.why, 200) }))
            .filter(x => x.to).slice(0, 16),
        watch: arr(r.watch).map(x => clip(x, 160)).filter(Boolean).slice(0, 6),
    };
    return { ok: true, rationale: out };
}

/**
 * Validate create_program input (Phase 9, pure).
 * @returns {{ok:true, normalized:object} | {ok:false, error:string}}
 */
function validateProgramInput(input) {
    if (!input || typeof input !== 'object') return { ok: false, error: 'Missing input' };
    const name = clip(input.name, 60);
    if (!name) return { ok: false, error: 'name is required' };
    let goal = 'general';
    if (input.goal != null && input.goal !== '') {
        goal = canonicalEnum(input.goal, PROGRAM_GOALS);
        if (!goal) return { ok: false, error: `goal must be one of ${PROGRAM_GOALS.join(', ')} (got ${JSON.stringify(input.goal)})` };
    }
    const weeks = intIn(input.weeks, 1, 16, null);
    if (weeks == null) return { ok: false, error: `weeks must be a whole number 1-16 (got ${JSON.stringify(input.weeks)})` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate || '')) {
        return { ok: false, error: 'startDate must be YYYY-MM-DD' };
    }
    // CP-3: the whitelist here used to keep only week/label/weightPct/note,
    // silently discarding every richer lever (Bug 3). normalizeWeekTarget is
    // the single rule set, shared with the client via functions/week-targets.js.
    const weekTargets = [];
    for (const t of (Array.isArray(input.weekTargets) ? input.weekTargets : [])) {
        const n = normalizeWeekTarget(t, weeks);
        if (!n.ok) return { ok: false, error: n.error };
        weekTargets.push(n.target);
    }
    if (!input.split || typeof input.split !== 'object') return { ok: false, error: 'split is required' };
    // AP-17 — program shape: a 4+ week block needs a deload (error);
    // frequency / identical-week problems come back as warnings.
    const shape = programShapeIssues({ weeks, weekTargets });
    if (shape.error) return { ok: false, error: shape.error };
    const rat = normalizeRationale(input.rationale, weeks, { required: weeks >= 4 && !input._skipRationale });
    if (!rat.ok) return { ok: false, error: rat.error };
    return {
        ok: true,
        normalized: { name, goal, weeks, startDate: input.startDate, weekTargets, split: input.split, rationale: rat.rationale },
        warnings: shape.warnings,
    };
}

/**
 * replace_day (CP-5): swap a template's whole exercise list in one write and
 * describe the change as a structured diff (pure — no I/O). Exercises are
 * matched by name; a kept exercise with different sets/reps/weight is
 * "changed", not removed+added, so the card reads like an edit.
 * @returns {{ok:true, updated:object, diff:{kept:string[],changed:string[],added:string[],removed:string[]}, diffSummary:string} | {ok:false, error:string}}
 */
function replaceTemplateExercises(template, input) {
    if (!template || typeof template !== 'object') return { ok: false, error: 'Template not found' };
    if (!Array.isArray(input?.exercises) || input.exercises.length === 0) {
        return { ok: false, error: 'exercises must be the complete new list (at least one)' };
    }
    if (input.exercises.length > 20) return { ok: false, error: 'Too many exercises (max 20)' };
    const next = [];
    for (const raw of input.exercises) {
        const ex = normalizeExercise(raw);
        if (ex.error) return { ok: false, error: ex.error };
        next.push(ex);
    }

    const exName = (e) => e.machine || e.name || '';
    const key = (e) => exName(e).trim().toLowerCase();
    const prior = Array.isArray(template.exercises) ? template.exercises : [];
    const priorByKey = new Map(prior.map(e => [key(e), e]));
    const nextKeys = new Set(next.map(key));
    if (nextKeys.size !== next.length) return { ok: false, error: 'Duplicate exercise names in the new list' };

    const diff = { kept: [], changed: [], added: [], removed: [] };
    for (const e of next) {
        const old = priorByKey.get(key(e));
        if (!old) { diff.added.push(`${exName(e)} ${e.sets}×${e.reps}`); continue; }
        // Carry forward fields the model does not resend (notes, group,
        // equipmentId…) so a rewrite never silently strips them.
        const oldReps = old.defaultReps ?? old.reps;
        const same = old.sets === e.sets && oldReps === e.reps
            && (e.weight == null || old.weight === e.weight)
            && (!e.equipment || old.equipment === e.equipment);
        Object.assign(e, { ...old, ...e });
        if ('defaultReps' in old) e.defaultReps = e.reps;
        if (same) diff.kept.push(exName(e));
        else diff.changed.push(`${exName(e)} ${old.sets ?? '—'}×${oldReps ?? '—'} → ${e.sets}×${e.reps}`);
    }
    for (const old of prior) {
        if (!nextKeys.has(key(old))) diff.removed.push(exName(old));
    }

    const updated = { ...template, exercises: next };
    const rename = typeof input.rename === 'string' ? input.rename.trim().slice(0, 60) : '';
    let renamed = '';
    if (rename && rename !== template.name) { updated.name = rename; renamed = `Renamed "${template.name}" → "${rename}"`; }

    if (!diff.changed.length && !diff.added.length && !diff.removed.length && !renamed) {
        return { ok: false, error: 'New list is identical to the current workout — nothing to change' };
    }
    const parts = [];
    if (renamed) parts.push(renamed);
    if (diff.added.length) parts.push(`Added ${diff.added.join(', ')}`);
    if (diff.removed.length) parts.push(`Removed ${diff.removed.join(', ')}`);
    if (diff.changed.length) parts.push(`Changed ${diff.changed.join(', ')}`);
    if (diff.kept.length) parts.push(`Kept ${diff.kept.length}`);
    return { ok: true, updated, diff, diffSummary: parts.join('; ') };
}

// ── Unit + date helpers for executors (AP-15b/c) ────────────────────

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

/** 'lbs' | 'kg' — anything else is lbs (the app default). */
function normalizeUnit(unit) {
    return unit === 'kg' ? 'kg' : 'lbs';
}

/**
 * Today's date + weekday. `today` comes from the client (the user's local
 * date); the server clock is UTC, so a 9pm Pacific question would otherwise
 * be answered as tomorrow.
 */
function todayInfo(today) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(today || '')) ? today : new Date().toISOString().slice(0, 10);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sun
    const day = WEEK_DAYS[(dow + 6) % 7];
    return { date, day, weekday: WEEKDAY_NAMES[day] };
}

/**
 * What the week plan says for today: a workout (with its name), a rest
 * day, or open. Plan values are templateId | null; rest days live in
 * restDays (older docs may carry 'rest' as a value).
 */
function plannedForDay(plan, day, templateNames = new Map()) {
    const tid = plan?.days?.[day];
    if (tid && tid !== 'rest') return { kind: 'workout', templateId: tid, name: templateNames.get(tid) || tid };
    if (tid === 'rest' || (plan?.restDays || []).includes(day)) return { kind: 'rest' };
    return { kind: 'open' };
}

/** A PR record ({weight, reps, volume?, unit}) converted to `unit`. */
function prRecordInUnit(rec, unit) {
    if (!rec || typeof rec !== 'object') return null;
    const from = normalizeUnit(rec.unit);
    const out = { ...rec, unit };
    if (rec.weight != null) out.weight = convertToUnit(rec.weight, from, unit);
    if (rec.volume != null) out.volume = convertToUnit(rec.volume, from, unit);
    return out;
}

/**
 * One get_exercise_history session from a workout doc's exercise, weights
 * in `unit`. `label` is the session label ('Deload', …) so a planned −35%
 * session reads as a deload, not a strength crash (AP-9).
 */
function exerciseHistorySession(w, ex, unit) {
    return {
        date: w.date,
        workout: w.workoutType || '',
        label: w.sessionLabel || null,
        equipment: ex.equipment || null,
        sets: (ex.sets || []).map(s => ({
            reps: s.reps,
            weight: s.weight ? convertToUnit(s.weight, normalizeUnit(s.originalUnit), unit) : s.weight,
            unit,
            type: s.type || 'working',
            ...(s.rpe ? { rpe: s.rpe } : {}),
        })),
        notes: ex.notes || null,
    };
}

// ── Template usage (AP-18: reads must not write) ────────────────────

/**
 * usageCount / lastUsedDate per template, derived from completed workouts
 * by workoutType name. list_templates REPORTS this for templates that lack
 * the denormalized count; the daily backfillTemplateUsage job WRITES it —
 * a read tool used to write as a side effect.
 * @returns {Map<string, {usageCount:number, lastUsedDate:string|null}>} keyed by template id
 */
function deriveTemplateUsage(templates, workouts) {
    const byName = new Map();
    for (const w of workouts || []) {
        if (!w?.completedAt || w.cancelledAt || !w.workoutType) continue;
        const key = w.workoutType.toLowerCase();
        const cur = byName.get(key) || { usageCount: 0, lastUsedDate: null };
        cur.usageCount += 1;
        if (!cur.lastUsedDate || w.date > cur.lastUsedDate) cur.lastUsedDate = w.date;
        byName.set(key, cur);
    }
    const out = new Map();
    for (const t of templates || []) {
        const u = byName.get(String(t.name || t.id || '').toLowerCase());
        if (u) out.set(t.id, u);
    }
    return out;
}

// ── AP-23 helpers ───────────────────────────────────────────────────

/** Minutes a session took: totalDuration (s), else completedAt − startedAt. */
function sessionMinutes(w) {
    const s = Number(w?.totalDuration) > 0 ? Number(w.totalDuration)
        : (w?.startedAt && w?.completedAt ? (Date.parse(w.completedAt) - Date.parse(w.startedAt)) / 1000 : 0);
    const m = s / 60;
    return m >= 5 && m <= 240 ? m : null;
}

/**
 * AP-23i — average minutes over a template's last 5 completions (by
 * workoutType name), so "I've got 40 minutes" is a computed cut.
 * @returns {Map<string, number>} keyed by lowercased template name
 */
function averageDurations(workouts) {
    const byName = new Map();
    const sorted = [...(workouts || [])].filter(w => w?.completedAt && !w.cancelledAt && w.workoutType)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    for (const w of sorted) {
        const key = w.workoutType.toLowerCase();
        const list = byName.get(key) || [];
        if (list.length >= 5) continue;
        const m = sessionMinutes(w);
        if (m != null) list.push(m);
        byName.set(key, list);
    }
    const out = new Map();
    for (const [k, list] of byName) if (list.length) out.set(k, Math.round(list.reduce((a, b) => a + b, 0) / list.length));
    return out;
}

/** Match a typed exercise name to one of `names` (exact, else Dice ≥ min). */
function matchName(typed, names, min = 0.75) {
    const t = String(typed || '').trim().toLowerCase();
    const exact = names.find(n => n.toLowerCase() === t);
    if (exact) return { name: exact };
    const scored = names.map(n => ({ n, s: diceSimilarity(typed, n) })).sort((a, b) => b.s - a.s);
    if (scored[0] && scored[0].s >= min) return { name: scored[0].n };
    return { name: null, nearest: scored.slice(0, 3).map(x => x.n) };
}

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function addDays(dateStr, n) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** A whole session for get_workouts, weights in `unit`. */
function workoutSummary(w, unit) {
    const names = w.exerciseNames || {};
    return {
        date: w.date,
        workout: w.workoutType || '',
        label: w.sessionLabel || null,
        location: (typeof w.location === 'object' ? w.location?.name : w.location) || null,
        readiness: w.readiness?.score ? { score: w.readiness.score, note: w.readiness.note || null } : null,
        minutes: sessionMinutes(w) != null ? Math.round(sessionMinutes(w)) : null,
        exercises: Object.entries(w.exercises || {}).map(([k, ex]) => ({
            name: names[k] || ex?.name || ex?.machine || k,
            ...exerciseHistorySession(w, ex || {}, unit),
            date: undefined, workout: undefined, label: undefined,
        })).map(({ date: _d, workout: _w, label: _l, ...rest }) => rest),
    };
}

// ── Rules verdicts (AP-16) ──────────────────────────────────────────

/**
 * The server's run of the client's rules — functions/coach-rules.js is the
 * generated mirror of js/core/features/coach-rules.js. Reads the same inputs
 * the client's context block reads, so `get_verdicts`, the weekly review and
 * the chat's Rules verdicts block can't say different things.
 *
 * @param {object} args
 * @param {object} args.db - Admin Firestore
 * @param {string} args.userId
 * @param {string} [args.today] - user's local YYYY-MM-DD
 * @param {string|null} [args.unit] - display unit; defaults to the settings unit
 */
async function computeUserVerdicts({ db, userId, today = null, unit = null, scope = 'week' }) {
    const userDoc = db.collection('users').doc(userId);
    const date = todayInfo(today).date;
    const [woSnap, tSnap, planSnap, progSnap, settingsSnap, customSnap] = await Promise.all([
        // 250 docs ≈ a year at 5/week — the scoreboard needs 12 weeks, the
        // stall ladder a run of sessions per lift.
        userDoc.collection('workouts').orderBy('date', 'desc').limit(250).get(),
        userDoc.collection('workoutTemplates').get(),
        userDoc.collection('preferences').doc('weekPlan').get(),
        userDoc.collection('programs').where('active', '==', true).limit(1).get(),
        userDoc.collection('preferences').doc('settings').get(),
        userDoc.collection('customExercises').get(),
    ]);
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
    const u = normalizeUnit(unit || settings.weightUnit);
    const all = woSnap.docs.map(d => d.data());
    // An in-progress session today carries its own intent (manual deload,
    // legacy label) — the same precedence the client uses.
    const live = all.find(w => w.date === date && !w.completedAt && !w.cancelledAt && w.sessionIntent);
    const plan = planSnap.exists ? (planSnap.data() || null) : null;
    if (scope === 'block') {
        // The active block, or the one that just ended.
        let program = progSnap.empty ? null : progSnap.docs[0].data();
        if (!program) {
            const last = await userDoc.collection('programs').orderBy('createdAt', 'desc').limit(1).get();
            program = last.empty ? null : last.docs[0].data();
        }
        if (!program) return { scope: 'block', program: null, note: 'No program yet — nothing to look back on.' };
        return buildBlockRetrospective({
            program,
            workouts: all.filter(w => w.completedAt && !w.cancelledAt),
            templates: tSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            unit: u, today: date,
            plates: u === 'kg' ? settings.plateKg : settings.plateLbs,
        });
    }
    return computeVerdicts({
        workouts: all.filter(w => w.completedAt && !w.cancelledAt),
        templates: tSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        weekPlan: plan ? { days: plan.days || {}, restDays: plan.restDays || [] } : null,
        program: progSnap.empty ? null : progSnap.docs[0].data(),
        manualDeload: weekOverrideOf(settings),
        intent: live?.sessionIntent || null,
        unit: u,
        plates: u === 'kg' ? settings.plateKg : settings.plateLbs,
        today: date,
        exerciseDatabase: [...require('./data/exercises.json'), ...customSnap.docs.map(d => d.data())],
    });
}

// ── Firestore executors (Admin SDK, scoped to users/{userId}) ───────

/**
 * @param {object} args
 * @param {object} args.db - Admin Firestore
 * @param {string} args.userId
 * @param {'chat'|'live'} [args.source]
 * @param {string} [args.unit] - user's display unit; every weight a read tool
 *   returns is converted to it (AP-15c — mixed-unit logs read raw used to
 *   look like "225 → 100 → 225")
 * @param {string} [args.today] - user's local YYYY-MM-DD (AP-15b)
 */
/**
 * AU-5 — every executor error leaves in ONE shape, {error:{code, message,
 * hint?}}, with a real code (the internal validators keep returning plain
 * message strings; this is the boundary). "not found" messages get
 * not_found so the model looks the id up instead of re-sending the input.
 */
function asToolError(err, code = null, hint = null) {
    if (err && typeof err === 'object') return { error: err };
    const message = String(err || 'Invalid input');
    const c = code || (/not found|^No (exercise|fact|template|workout)\b|^No exercise named/i.test(message) ? 'not_found' : 'invalid_input');
    return toolError(c, message, hint);
}

function makeToolExecutors({ db, userId, source = 'chat', unit: rawUnit = 'lbs', today = null }) {
    const userDoc = () => db.collection('users').doc(userId);
    const unit = normalizeUnit(rawUnit);
    const date = todayInfo(today).date;

    // Data the guards need, read once per turn (memoized promise).
    let ctxPromise = null;
    const loadCtx = () => {
        if (!ctxPromise) {
            ctxPromise = (async () => {
                const [woSnap, progSnap, settingsSnap, equipSnap, tSnap, planSnap] = await Promise.all([
                    userDoc().collection('workouts').orderBy('date', 'desc').limit(250).get(),
                    userDoc().collection('programs').where('active', '==', true).limit(1).get(),
                    userDoc().collection('preferences').doc('settings').get(),
                    userDoc().collection('equipment').get(),
                    userDoc().collection('workoutTemplates').get(),
                    userDoc().collection('preferences').doc('weekPlan').get(),
                ]);
                const all = woSnap.docs.map(d => d.data());
                const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
                const program = progSnap.empty ? null : progSnap.docs[0].data();
                const live = all.find(w => w.date === date && !w.completedAt && !w.cancelledAt);
                const intent = live?.sessionIntent || getSessionIntent({ program, today: date, manualDeload: weekOverrideOf(settings) });
                const equipment = equipSnap.docs.map(d => d.data()).filter(e => e && e.name);
                // Current gym: the in-progress session's, else where they last trained.
                const gymOf = (w) => (typeof w?.location === 'object' ? w.location?.name : w?.location) || null;
                const gym = gymOf(live) || gymOf(all.find(w => w.completedAt && gymOf(w)));
                return {
                    workouts: all.filter(w => w.completedAt && !w.cancelledAt),
                    live: live || null,
                    weekPlan: planSnap.exists ? (planSnap.data() || null) : null,
                    programId: progSnap.empty ? null : progSnap.docs[0].id,
                    settings, program, intent, equipment, gym,
                    plates: unit === 'kg' ? settings.plateKg : settings.plateLbs,
                    templates: tSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                };
            })();
        }
        return ctxPromise;
    };

    // TP-3 — what the plan tools read (the Sunday roll's own loader).
    let planPromise = null;
    const loadPlanCtx = () => {
        if (!planPromise) planPromise = require('./plan-roll').loadPlanData(userDoc(), { today: date });
        return planPromise;
    };

    // TP-1 — what goal math reads: the guard context plus goals, events,
    // weigh-ins and scans (read once per turn).
    let goalPromise = null;
    const loadGoalCtx = () => {
        if (!goalPromise) {
            goalPromise = (async () => {
                const ctx = await loadCtx();
                const [gSnap, eSnap, mSnap, dSnap] = await Promise.all([
                    userDoc().collection('goals').get(),
                    userDoc().collection('events').get(),
                    userDoc().collection('measurements').orderBy('date', 'desc').limit(365).get(),
                    userDoc().collection('dexa').orderBy('date', 'desc').limit(50).get(),
                ]);
                const goals = gSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const events = eSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
                const data = {
                    workouts: ctx.workouts, templates: ctx.templates,
                    measurements: mSnap.docs.map(d => d.data()), dexa: dSnap.docs.map(d => d.data()),
                    today: date, plates: ctx.plates,
                };
                const mainLifts = pickPrimaries({ templates: ctx.templates.filter(t => !t.archived), workouts: ctx.workouts, today: date }).map(p => p.name);
                return { goals, events, data, mainLifts, settings: ctx.settings, rows: goalsWithStatus(goals, { ...data, events }) };
            })();
        }
        return goalPromise;
    };

    /**
     * AP-17 deload lock. Template writes in a program's deload week are
     * refused unless the model passes override:true + overrideReason (the
     * user insisted) — the override is logged to coachOverrides.
     */
    const checkDeloadLock = async (tool, input) => {
        const { program } = await loadCtx();
        const lock = deloadLock(program, date);
        if (!lock) return null;
        if (input?.override === true) {
            const reason = clip(input.overrideReason, 200);
            if (!reason) return toolError('invalid_input', 'override:true needs overrideReason — the user\'s own words for why the deload week\'s workout must change.');
            await userDoc().collection('coachOverrides').add({
                tool, reason, rule: 'deload_lock', week: lock.week, date, createdAt: new Date().toISOString(),
            });
            return null;
        }
        return toolError('locked',
            `Week ${lock.week} of the program is a deload (${lock.label}) — template edits are locked.`,
            'Use propose_session_adjustments for this week\'s sessions. Only if the user explicitly insists on changing the workout itself, retry with override:true and overrideReason.');
    };

    /**
     * AP-17/18 per-exercise guards for template writes: equipment must
     * exist in the library (canonicalized), a weight must be loadable and
     * must not exceed a stalled lift's rule target. Mutates `exercises`
     * (canonical equipment names). Returns a tool error or null.
     */
    const checkExercises = async (exercises) => {
        const withEquip = exercises.filter(e => e.equipment);
        const withWeight = exercises.filter(e => typeof e.weight === 'number' && e.weight > 0);
        if (!withEquip.length && !withWeight.length) return null;
        const ctx = await loadCtx();
        const library = ctx.equipment.map(e => e.name);
        for (const e of withEquip) {
            const r = resolveEquipment(e.equipment, library);
            if (!r.ok) {
                return toolError('invalid_input',
                    `${e.machine}: equipment "${e.equipment}" isn't in the user's library.`,
                    r.nearest.length ? `Nearest: ${r.nearest.join(', ')} — use one of these, omit equipment, or call list_equipment.` : 'Call list_equipment, or omit equipment.');
            }
            e.equipment = r.name;
        }
        for (const e of withWeight) {
            const args = { workouts: ctx.workouts, exercise: e.machine, weight: e.weight, unit, plates: ctx.plates };
            const stall = progressionGuard({ ...args, repTarget: e.reps });
            if (stall) return toolError('invalid_input', stall, 'Use the rule\'s target weight, or explain the deviation to the user without writing it.');
            const load = loadabilityGuard(args);
            if (load) return toolError('invalid_input', load);
        }
        return null;
    };

    return {
        /**
         * Server-side checks on a live/coach proposal (validateProposal does
         * the shape): template exists (session adjustments), the load obeys
         * the rules (next target / add exercise), and a swap's equipment is
         * at the current gym. Returns {proposal} (possibly canonicalized) or
         * a tool error.
         */
        async checkProposal(toolName, proposal) {
            const ctx = await loadCtx();
            if (toolName === 'propose_session_adjustments') {
                if (!ctx.templates.some(t => t.id === proposal.templateId && !t.archived)) {
                    return toolError('not_found', `No saved workout with templateId "${proposal.templateId}".`, 'Call list_templates for valid ids.');
                }
                const bad = await checkExercises(proposal.addExercises || []);
                if (bad) return bad;
            }
            if ((toolName === 'propose_next_target' || toolName === 'propose_add_exercise') && proposal.weight != null) {
                const args = { workouts: ctx.workouts, exercise: proposal.exercise, weight: proposal.weight, unit, plates: ctx.plates };
                const rule = toolName === 'propose_next_target'
                    ? progressionGuard({ ...args, repTarget: proposal.reps, intent: ctx.intent }) : null;
                if (rule) return toolError('invalid_input', rule, 'Propose the rule\'s target, or hold the weight.');
                const load = loadabilityGuard(args);
                if (load) return toolError('invalid_input', load);
            }
            if (toolName === 'propose_week_adjustment') {
                // The card lists the sessions the window covers and what the
                // week becomes — the same intent the app will compute.
                const from = proposal.from || date;
                const weeks = proposal.weeks || 1;
                const names = new Map(ctx.templates.map(t => [t.id, t.name || t.id]));
                const days = ctx.weekPlan?.days || {};
                const sessions = [];
                for (let i = 0; i < weeks * 7; i++) {
                    const d = addDays(from, i);
                    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
                    const tid = days[DAY_ORDER[(dow + 6) % 7]];
                    if (tid && tid !== 'rest') sessions.push({ date: d, name: names.get(tid) || tid });
                }
                const preview = getSessionIntent({ today: from, manualDeload: { from, weeks, weightPct: proposal.weightPct, setDelta: proposal.setDelta, label: proposal.label } });
                return {
                    proposal: {
                        ...proposal, from, weeks,
                        label: proposal.label || preview.label,
                        mode: preview.mode,
                        sessions,
                        extendBlock: !!(proposal.extendBlock && ctx.program),
                        programId: proposal.extendBlock && ctx.program ? ctx.programId : null,
                    },
                };
            }
            if (toolName === 'propose_skip_exercise') {
                if (!ctx.live) return toolError('not_found', 'No workout in progress today.', 'Skips are for a live session.');
                if (proposal.endSession) return { proposal };
                const names = Object.values(ctx.live.exerciseNames || {}).filter(Boolean);
                const m = matchName(proposal.exercise, names);
                if (!m.name) {
                    return toolError('not_found', `"${proposal.exercise}" isn't in today's session.`,
                        names.length ? `Today's exercises: ${names.slice(0, 10).join(', ')}.` : 'The session has no exercises yet.');
                }
                return { proposal: { ...proposal, exercise: m.name } };
            }
            if (toolName === 'propose_swap' && proposal.equipment) {
                const atGym = ctx.gym
                    ? ctx.equipment.filter(e => (e.locations || [e.location]).some(l => String(l || '').toLowerCase() === ctx.gym.toLowerCase()))
                    : [];
                const pool = (atGym.length ? atGym : ctx.equipment).map(e => e.name);
                const r = resolveEquipment(proposal.equipment, pool);
                if (!r.ok) {
                    return toolError('invalid_input',
                        `"${proposal.equipment}" isn't ${atGym.length ? `at ${ctx.gym}` : "in the user's equipment library"}.`,
                        r.nearest.length ? `Equipment there: ${r.nearest.join(', ')}.` : 'Swap to a bodyweight or dumbbell move, or omit equipment.');
                }
                return { proposal: { ...proposal, equipment: r.name } };
            }
            return { proposal };
        },

        // CP-5 — the chat coach previously had NO path to the exercise
        // library (the client's buildExerciseLibraryContext only feeds the
        // template generator), so it could only suggest what was already in
        // the templates. The built-in library is a static JSON on the client;
        // functions/data/exercises.json mirrors it (parity-tested).
        async list_exercises(input) {
            const builtIn = require('./data/exercises.json');
            const [customSnap, overrideSnap, hiddenSnap, woSnap] = await Promise.all([
                userDoc().collection('customExercises').get(),
                userDoc().collection('exerciseOverrides').get(),
                userDoc().collection('hiddenExercises').get(),
                userDoc().collection('workouts').orderBy('date', 'desc').limit(300).get(),
            ]);
            const overrides = new Map();
            for (const d of overrideSnap.docs) {
                const o = d.data();
                if (o.originalName) overrides.set(o.originalName.toLowerCase(), o);
            }
            const hidden = new Set();
            for (const d of hiddenSnap.docs) {
                const h = d.data();
                if (h.originalName) hidden.add(h.originalName.toLowerCase());
            }
            const lastUsed = new Map();
            for (const d of woSnap.docs) {
                const w = d.data();
                if (!w.completedAt || w.cancelledAt || !w.exercises) continue;
                const names = w.exerciseNames || {};
                for (const k of Object.keys(w.exercises)) {
                    const n = (names[k] || w.exercises[k]?.name || w.exercises[k]?.machine || '').toLowerCase();
                    if (n && !lastUsed.has(n)) lastUsed.set(n, w.date);
                }
            }
            const merged = [
                ...builtIn.map(e => ({ ...e, ...(overrides.get((e.name || '').toLowerCase()) || {}) })),
                ...customSnap.docs.map(d => ({ ...d.data(), isCustom: true })),
            ].filter(e => e.name && !hidden.has(e.name.toLowerCase()));

            const partFilter = String(input?.bodyPart || '').trim().toLowerCase();
            const unusedOnly = !!input?.unusedOnly;
            const byPart = {};
            let total = 0;
            for (const e of merged) {
                const part = e.bodyPart || 'Other';
                if (partFilter && !part.toLowerCase().includes(partFilter)) continue;
                const used = lastUsed.get(e.name.toLowerCase()) || null;
                if (unusedOnly && used) continue;
                if (!byPart[part]) byPart[part] = [];
                byPart[part].push({
                    name: e.name,
                    equipmentType: e.equipmentType || null,
                    tags: Array.isArray(e.tags) ? e.tags : [],
                    lastUsed: used,
                    ...(e.isCustom ? { custom: true } : {}),
                });
                total += 1;
            }
            for (const part of Object.keys(byPart)) {
                // Never-used first, then stalest — the order a rotation wants.
                byPart[part].sort((a, b) => (a.lastUsed || '').localeCompare(b.lastUsed || '') || a.name.localeCompare(b.name));
            }
            return { total, unused: merged.filter(e => !lastUsed.has(e.name.toLowerCase())).length, byBodyPart: byPart };
        },

        async replace_day(input) {
            const templateId = String(input?.templateId || '').trim();
            if (!templateId) return asToolError('templateId is required');
            const ref = userDoc().collection('workoutTemplates').doc(templateId);
            const snap = await ref.get();
            if (!snap.exists) return toolError('not_found', `Template not found: ${templateId}.`, 'Call list_templates for valid ids.');
            const current = snap.data();
            const locked = await checkDeloadLock('replace_day', input);
            if (locked) return locked;
            const applied = replaceTemplateExercises(current, input);
            if (!applied.ok) return asToolError(applied.error);
            // Guard only what the model sent: carried-forward fields (an old
            // equipment name, last block's weight) aren't this call's claim.
            const byName = new Map(applied.updated.exercises.map(e => [String(e.machine).toLowerCase(), e]));
            const fresh = (input.exercises || [])
                .filter(raw => raw && (raw.equipment || typeof raw.weight === 'number'))
                .map((raw) => {
                    const ref = byName.get(String(raw.name || '').trim().toLowerCase());
                    return ref ? {
                        ref,
                        check: {
                            machine: ref.machine, reps: ref.reps,
                            ...(raw.equipment ? { equipment: String(raw.equipment).trim() } : {}),
                            ...(typeof raw.weight === 'number' ? { weight: raw.weight } : {}),
                        },
                    } : null;
                })
                .filter(Boolean);
            const bad = await checkExercises(fresh.map(f => f.check));
            if (bad) return bad;
            for (const f of fresh) if (f.check.equipment) f.ref.equipment = f.check.equipment;

            applied.updated.lastUpdated = new Date().toISOString();
            await ref.set(applied.updated);
            return {
                result: { templateId, diff: applied.diffSummary },
                actionCard: {
                    kind: 'template_replaced',
                    templateId,
                    name: applied.updated.name,
                    category: applied.updated.category || null,
                    exerciseCount: applied.updated.exercises.length,
                    diff: applied.diff,
                    diffSummary: applied.diffSummary,
                    why: clip(input?.why, 140) || null,
                    undo: { priorExercises: current.exercises || [], priorName: current.name || null },
                },
            };
        },

        async get_exercise_history(input) {
            const target = String(input?.exercise || '').trim().toLowerCase();
            if (!target) return asToolError('exercise is required');
            const limit = intIn(input?.limit, 1, 20, 8);
            const snap = await userDoc().collection('workouts')
                .orderBy('date', 'desc').limit(80).get();
            const sessions = [];
            for (const doc of snap.docs) {
                if (sessions.length >= limit) break;
                const w = doc.data();
                if (!w.completedAt || w.cancelledAt || !w.exercises) continue;
                const names = w.exerciseNames || {};
                for (const key of Object.keys(w.exercises)) {
                    const name = names[key];
                    if (!name) continue;
                    const lower = name.toLowerCase();
                    // Exact first, then containment either way — the model says
                    // "Chest Press" where the log says "Seated Chest Press".
                    if (lower !== target && !lower.includes(target) && !target.includes(lower)) continue;
                    sessions.push(exerciseHistorySession(w, w.exercises[key], unit));
                    break;
                }
            }
            return { exercise: input.exercise, unit, sessions, found: sessions.length };
        },

        async list_equipment(input) {
            const snap = await userDoc().collection('equipment').get();
            const locFilter = String(input?.location || '').trim().toLowerCase();
            const byLocation = {};
            let total = 0;
            for (const doc of snap.docs) {
                const eq = doc.data();
                const locs = (Array.isArray(eq.locations) && eq.locations.length > 0)
                    ? eq.locations
                    : (eq.location ? [eq.location] : ['Unspecified']);
                if (locFilter && !locs.some(l => String(l).toLowerCase().includes(locFilter))) continue;
                total++;
                const item = {
                    name: eq.name || doc.id,
                    type: eq.equipmentType || null,
                    // Date only — enough to spot staples vs never-touched.
                    lastUsed: eq.lastUsed ? String(eq.lastUsed).slice(0, 10) : null,
                };
                for (const loc of locs) {
                    if (locFilter && !String(loc).toLowerCase().includes(locFilter)) continue;
                    (byLocation[loc] = byLocation[loc] || []).push(item);
                }
            }
            // Never-used first within each gym — that's the inventory the user
            // catalogued by hand and the part the coach otherwise never sees.
            for (const items of Object.values(byLocation)) {
                items.sort((a, b) => ((a.lastUsed ? 1 : 0) - (b.lastUsed ? 1 : 0)) || a.name.localeCompare(b.name));
            }
            return { totalPieces: total, byLocation };
        },

        async list_templates() {
            const snap = await userDoc().collection('workoutTemplates').get();
            // Archived templates are out of the coach's world (5.6.2).
            const activeDocs = snap.docs.filter(d => !d.data().archived);

            // Usage honesty: denormalized usageCount only began 2026-07-07 —
            // without it the coach reads long-used staples as 'never used'
            // and proposes archiving them (live bug). Derive it for the
            // answer; the backfill WRITE lives in the daily
            // backfillTemplateUsage job (AP-18: a read tool must not write).
            const needsUsage = activeDocs.some(d => d.data().usageCount == null);
            let derived = new Map();
            if (needsUsage) {
                const woSnap = await userDoc().collection('workouts')
                    .orderBy('date', 'desc').limit(200).get();
                derived = deriveTemplateUsage(activeDocs.map(d => ({ id: d.id, ...d.data() })), woSnap.docs.map(d => d.data()));
            }

            let usageIncomplete = false;
            // AP-23i — how long each workout actually takes.
            const durations = averageDurations((await loadCtx()).workouts);
            const templates = activeDocs.slice(0, 20).map(d => {
                const t = d.data();
                let usageCount = t.usageCount;
                let lastUsedDate = t.lastUsedDate || null;
                if (usageCount == null) {
                    const u = derived.get(d.id);
                    usageCount = u ? u.usageCount : 0;
                    lastUsedDate = lastUsedDate || (u ? u.lastUsedDate : null);
                    if (!u) usageIncomplete = true; // renamed templates lose name lineage
                }
                return {
                    templateId: d.id,
                    name: t.name || d.id,
                    category: t.category || null,
                    kind: t.kind || 'core',
                    ...(t.parentTemplateId ? { parentTemplateId: t.parentTemplateId } : {}),
                    // TP-4 — built for the plan (shown in its "Your plan" group, not the user's list).
                    planOwned: !!t.planOwned,
                    usageCount,
                    lastUsedDate,
                    avgDurationMin: durations.get(String(t.name || d.id).toLowerCase()) ?? null,
                    exercises: (t.exercises || []).slice(0, 15).map(e => ({
                        name: e.machine || e.name,
                        sets: e.sets, reps: e.defaultReps || e.reps,
                        weight: e.weight ?? null,
                        equipment: e.equipment || null,
                    })),
                };
            });
            return {
                templates,
                count: templates.length,
                ...(usageIncomplete ? { note: 'Some usage counts may undercount: workouts logged under a template’s OLD name (before a rename) are not attributed. Never call a template unused from usageCount alone — cross-check the recent-workouts context.' } : {}),
            };
        },

        async get_program() {
            const snap = await userDoc().collection('programs')
                .where('active', '==', true).limit(1).get();
            if (snap.empty) return { program: null, note: 'No active program.' };
            const program = snap.docs[0].data();
            // Derived, never stored (see docs/coach-program-design.md).
            const week = Math.floor(Math.round((new Date() - new Date(`${program.startDate}T12:00:00`)) / 86400000) / 7) + 1;
            // `weeks || 1` guards legacy docs without the field — `week >
            // undefined` is false, which would report a finished block active.
            return { program, currentWeek: week, finished: week > (program.weeks || 1) || week < 1 };
        },

        async create_program(input) {
            const v = validateProgramInput(input);
            if (!v.ok) return asToolError(v.error);
            const { name, goal, weeks, startDate, weekTargets, split, rationale } = v.normalized;
            // AP-17 — split-level shape warnings need the templates.
            const ctxForShape = await loadCtx();
            const warnings = [
                ...v.warnings,
                ...programShapeIssues({ weeks: 0, split, templates: ctxForShape.templates, exerciseDatabase: require('./data/exercises.json') }).warnings,
            ];

            // Snapshot prior state BEFORE any write — the card renders after
            // the write (the ask was the consent), so a real undo needs to
            // know what to restore.
            let priorPlan = null;
            try {
                const priorSnap = await userDoc().collection('preferences').doc('weekPlan').get();
                if (priorSnap.exists) {
                    const p = priorSnap.data();
                    priorPlan = { days: p.days || {}, restDays: p.restDays || [] };
                }
            } catch { /* undo degrades to program-only */ }

            // Apply the split through the SAME validated path as set_week_plan —
            // one consent covers program + schedule.
            const planOut = await this.set_week_plan({ days: split });
            if (planOut.error) return toolError('invalid_input', `split: ${errorText(planOut.error)}`);

            // One active program at a time.
            const actives = await userDoc().collection('programs').where('active', '==', true).get();
            const priorProgramId = actives.docs.length ? actives.docs[0].id : null;
            for (const d of actives.docs) {
                await d.ref.set({ active: false, state: 'superseded', lastUpdated: new Date().toISOString() }, { merge: true });
            }

            const id = `program_${Date.now()}`;
            const nowIso = new Date().toISOString();
            await userDoc().collection('programs').doc(id).set({
                id, name, goal, weeks, startDate, weekTargets,
                ...(rationale ? { rationale } : {}),
                split: planOut.result.plan.days,
                active: true,
                trustLevel: 'propose',
                state: 'active',
                createdVia: 'coach',
                createdAt: nowIso,
                lastUpdated: nowIso,
            });
            // TP-3 — the plan doc: this program's shape is the standing cadence,
            // so the plan continues after it ends (auto-roll). Never fatal.
            try {
                const planRef = userDoc().collection('plan').doc('current');
                const planSnap = await planRef.get();
                await planRef.set({
                    ...(planSnap.exists ? {} : { name: 'My plan', horizonWeeks: 12, rotationPolicy: 'ask', createdAt: nowIso, createdVia: 'create_program' }),
                    cadence: cadenceFromProgram({ weeks, weekTargets }), paused: false, lastUpdated: nowIso,
                }, { merge: true });
            } catch (planErr) {
                console.error('❌ plan doc upsert failed (program still created):', planErr);
            }
            // CP-4 — variety engine: rotate the accessories on the split's
            // templates at block creation. Runs AFTER the program write so a
            // rotation failure never costs the program; the card and the undo
            // payload carry every swap so one consent still covers the block.
            let rotation = null;
            const priorTemplates = [];
            if (input.rotateAccessories === true) {
                try {
                    const [equipSnap, customSnap, woSnap] = await Promise.all([
                        userDoc().collection('equipment').get(),
                        userDoc().collection('customExercises').get(),
                        userDoc().collection('workouts').orderBy('date', 'desc').limit(30).get(),
                    ]);
                    const equipment = equipSnap.docs.map(d => d.data()).filter(e => e && e.name);
                    const byName = new Map(
                        [...require('./data/exercises.json'), ...customSnap.docs.map(d => d.data())]
                            .filter(e => e?.name).map(e => [e.name.toLowerCase(), e]));
                    const lookup = (n) => byName.get(String(n || '').toLowerCase());
                    // A template has no gym of its own: "current gym" is where
                    // the user last trained.
                    let location = null;
                    for (const d of woSnap.docs) {
                        const w = d.data();
                        const loc = typeof w.location === 'object' ? w.location?.name : w.location;
                        if (loc) { location = loc; break; }
                    }
                    const today = nowIso.slice(0, 10);
                    const templateIds = [...new Set(Object.values(planOut.result.plan.days || {}).filter(v => v && v !== 'rest'))];
                    rotation = [];
                    for (const tid of templateIds) {
                        const tref = userDoc().collection('workoutTemplates').doc(tid);
                        const tsnap = await tref.get();
                        if (!tsnap.exists) continue;
                        const t = tsnap.data();
                        const exercises = Array.isArray(t.exercises) ? t.exercises : [];
                        const { swaps } = selectRotation({ exercises, equipment, location, lookup });
                        if (!swaps.length) continue;
                        priorTemplates.push({ templateId: tid, exercises });
                        await tref.set({ exercises: applyRotation(exercises, swaps, { lookup, today }), lastUpdated: nowIso }, { merge: true });
                        rotation.push({
                            templateId: tid, name: t.name || tid,
                            swaps: swaps.map(s => ({ from: s.from, to: s.to, equipment: s.equipment, reason: s.reason })),
                        });
                    }
                } catch (e) {
                    console.error('❌ accessory rotation failed (program still created):', e);
                    rotation = null;
                }
            }
            const rotatedCount = (rotation || []).reduce((n, r) => n + r.swaps.length, 0);

            // Deload callout for the card's landing moment — the week the
            // whole program exists for should be visible at creation.
            // A volume-only deload (negative setDelta, load unchanged) counts too (Bug 4).
            const deloadWeek = (weekTargets.find(isDeloadTarget) || {}).week || null;
            return {
                result: {
                    programId: id, name, weeks, weekPlan: planOut.result.summary,
                    ...(rotation ? { rotation, rotatedCount } : {}),
                    ...(input.rotateAccessories === true && !rotation ? { rotation: 'failed — templates unchanged' } : {}),
                    ...(warnings.length ? { warnings } : {}),
                },
                actionCard: {
                    kind: 'program_set',
                    name: `Program: ${name}`,
                    summary: `${weeks} weeks · ${goal} · ${planOut.result.summary}${rotatedCount ? ` · ${rotatedCount} accessor${rotatedCount === 1 ? 'y' : 'ies'} rotated` : ''}`,
                    program: { programId: id, name, goal, weeks, startDate, deloadWeek, ...(rotation ? { rotation } : {}) },
                    undo: { newProgramId: id, priorProgramId, priorPlan, ...(priorTemplates.length ? { priorTemplates } : {}) },
                },
            };
        },

        async adjust_program(input) {
            const changes = input?.changes;
            if (!changes || typeof changes !== 'object') return asToolError('changes is required');
            const snap = await userDoc().collection('programs').where('active', '==', true).limit(1).get();
            if (snap.empty) return toolError('not_found', 'No active program.', 'create_program first.');
            const ref = snap.docs[0].ref;
            const current = snap.docs[0].data();

            const updated = {};
            const diffs = [];
            const shapeWarnings = [];
            if (changes.weeks != null && !Array.isArray(changes.weekTargets)) {
                // A longer block must still end in a deload.
                const w = intIn(changes.weeks, 1, 16, null);
                if (w != null) {
                    const shape = programShapeIssues({ weeks: w, weekTargets: current.weekTargets || [] });
                    if (shape.error) return toolError('invalid_input', shape.error);
                }
            }
            if (changes.name && clip(changes.name, 60) !== current.name) {
                updated.name = clip(changes.name, 60);
                diffs.push(`renamed to "${updated.name}"`);
            }
            if (changes.weeks != null) {
                const w = intIn(changes.weeks, 1, 16, null);
                if (w == null) return asToolError('weeks must be 1-16');
                updated.weeks = w;
                diffs.push(`${w} weeks`);
            }
            if (changes.startDate) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(changes.startDate)) return asToolError('startDate must be YYYY-MM-DD');
                updated.startDate = changes.startDate;
                diffs.push(`starts ${changes.startDate}`);
            }
            if (Array.isArray(changes.weekTargets)) {
                const check = validateProgramInput({
                    name: current.name, goal: current.goal,
                    weeks: updated.weeks || current.weeks,
                    startDate: updated.startDate || current.startDate,
                    weekTargets: changes.weekTargets, split: current.split || {},
                    _skipRationale: true,
                });
                if (!check.ok) return asToolError(check.error);
                updated.weekTargets = check.normalized.weekTargets;
                diffs.push('week targets updated');
                shapeWarnings.push(...check.warnings);
            }
            if (changes.split && typeof changes.split === 'object') {
                const planOut = await this.set_week_plan({ days: changes.split });
                if (planOut.error) return toolError('invalid_input', `split: ${errorText(planOut.error)}`);
                updated.split = planOut.result.plan.days;
                diffs.push(`schedule: ${planOut.result.summary}`);
            }
            if (changes.rationale != null) {
                const rat = normalizeRationale(changes.rationale, updated.weeks || current.weeks || 1);
                if (!rat.ok) return toolError('invalid_input', rat.error);
                updated.rationale = rat.rationale;
                diffs.push('rationale updated');
            }
            if (changes.trustLevel != null) {
                if (!['propose', 'auto_confirm'].includes(changes.trustLevel)) {
                    return asToolError("trustLevel must be 'propose' or 'auto_confirm'");
                }
                if (changes.trustLevel !== (current.trustLevel || 'propose')) {
                    updated.trustLevel = changes.trustLevel;
                    diffs.push(changes.trustLevel === 'auto_confirm'
                        ? "auto mode ON — the dashboard pre-builds each week's session; starting it confirms"
                        : 'back to propose-only');
                }
            }
            if (!diffs.length) return asToolError('No supported changes (name, weeks, startDate, weekTargets, split)');

            updated.lastUpdated = new Date().toISOString();
            await ref.set(updated, { merge: true });
            return {
                result: { programId: current.id, diff: diffs.join('; '), ...(shapeWarnings.length ? { warnings: shapeWarnings } : {}) },
                actionCard: {
                    kind: 'program_set',
                    name: `Program: ${updated.name || current.name}`,
                    summary: diffs.join(' · '),
                },
            };
        },

        async log_advice(input) {
            const type = String(input?.type || '').trim();
            const detail = clip(input?.detail, 200);
            if (!ADVICE_TYPES.includes(type)) return toolError('invalid_input', `type must be one of: ${ADVICE_TYPES.join(', ')} (got ${JSON.stringify(input?.type)})`);
            if (!detail) return asToolError('detail is required');
            const doc = {
                date: new Date().toISOString().slice(0, 10),
                type,
                detail,
                source,
                createdAt: new Date().toISOString(),
            };
            if (typeof input?.exercise === 'string' && input.exercise.trim()) doc.exercise = clip(input.exercise, 80);
            if (typeof input?.targetValue === 'number' || (typeof input?.targetValue === 'string' && input.targetValue.trim())) {
                doc.targetValue = typeof input.targetValue === 'number' ? input.targetValue : clip(input.targetValue, 80);
            }
            // A numeric target is in the user's unit at the time — stamp it so
            // the outcome check compares like with like after a unit switch.
            if (typeof doc.targetValue === 'number') doc.unit = unit;
            await userDoc().collection('coachAdvice').add(doc);
            return { result: { logged: true } };
        },

        async archive_template(input) {
            const templateId = String(input?.templateId || '').trim();
            if (!templateId) return asToolError('templateId is required');
            const ref = userDoc().collection('workoutTemplates').doc(templateId);
            const snap = await ref.get();
            if (!snap.exists) return toolError('not_found', `Template not found: ${templateId}`, 'Call list_templates for valid ids.');
            await ref.set({ archived: true, lastUpdated: new Date().toISOString() }, { merge: true });
            return {
                result: { archived: templateId },
                actionCard: {
                    kind: 'template_updated',
                    templateId,
                    name: snap.data().name || templateId,
                    category: snap.data().category || null,
                    exerciseCount: (snap.data().exercises || []).length,
                    diffSummary: 'Archived — restore anytime from the library',
                },
            };
        },

        async get_prs() {
            const snap = await userDoc().collection('stats').doc('personalRecords').get();
            const exercisePRs = snap.exists ? (snap.data().exercisePRs || {}) : {};
            const entries = [];
            for (const [exercise, byEquip] of Object.entries(exercisePRs)) {
                for (const [key, prs] of Object.entries(byEquip)) {
                    if (key === 'bodyPart' || !prs || typeof prs !== 'object') continue;
                    entries.push({
                        exercise,
                        equipment: prs.equipmentName || (key.startsWith('equipment_') ? 'Unknown equipment' : key),
                        maxWeight: prRecordInUnit(prs.maxWeight, unit),
                        maxReps: prRecordInUnit(prs.maxReps, unit),
                        maxVolume: prRecordInUnit(prs.maxVolume, unit),
                    });
                }
            }
            entries.sort((a, b) => ((b.maxWeight?.date || '')).localeCompare(a.maxWeight?.date || ''));
            return { unit, prs: entries.slice(0, 50), count: entries.length };
        },

        async create_workout_template(input) {
            const v = validateCreateTemplateInput(input);
            if (!v.ok) return asToolError(v.error);
            const { name, category, exercises } = v.normalized;

            // 5.6.0 — classify at birth. Variations must point at a real parent.
            let kind = 'core';
            if (input.kind != null && input.kind !== '') {
                kind = canonicalEnum(input.kind, TEMPLATE_KINDS);
                if (!kind) return toolError('invalid_input', `kind must be one of ${TEMPLATE_KINDS.join(', ')} (got ${JSON.stringify(input.kind)})`);
            }
            let parentTemplateId = null;
            if (kind === 'variation') {
                const pid = String(input.parentTemplateId || '').trim();
                if (!pid) return toolError('invalid_input', 'kind=variation requires parentTemplateId', 'Get it from list_templates.');
                const parent = await userDoc().collection('workoutTemplates').doc(pid).get();
                if (!parent.exists) return toolError('not_found', `parentTemplateId not found: ${pid}`, 'Call list_templates for valid ids.');
                parentTemplateId = pid;
            }

            const locked = await checkDeloadLock('create_workout_template', input);
            if (locked) return locked;
            const bad = await checkExercises(exercises);
            if (bad) return bad;

            // AP-18 dedupe — a "new" workout that is mostly an existing one
            // clutters the library and splits its history. Variations are the
            // deliberate exception.
            if (kind !== 'variation') {
                const dup = findNearDuplicate(exercises, (await loadCtx()).templates);
                if (dup) {
                    return {
                        error: {
                            code: 'near_duplicate',
                            message: `"${name}" overlaps "${dup.name}" by ${Math.round(dup.overlap * 100)}% of exercises.`,
                            hint: `Update ${dup.templateId} (update_workout_template / replace_day), or pass kind:'variation' with parentTemplateId:'${dup.templateId}' if it's a deliberate variant.`,
                            existing: dup,
                        },
                    };
                }
            }

            // Same slug scheme the client uses, with collision suffixing so the
            // coach can't silently overwrite an existing workout.
            let base = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            let templateId = base;
            for (let i = 2; i <= 9; i++) {
                const existing = await userDoc().collection('workoutTemplates').doc(templateId).get();
                if (!existing.exists) break;
                templateId = `${base}_${i}`;
            }

            const nowIso = new Date().toISOString();
            // TP-4 — a session built for the plan lives with the plan (only when one exists).
            let planOwned = false;
            if (input.forPlan === true) {
                const planSnap = await userDoc().collection('plan').doc('current').get();
                planOwned = planSnap.exists;
            }
            await userDoc().collection('workoutTemplates').doc(templateId).set({
                id: templateId,
                name,
                category,
                exercises,
                kind,
                ...(parentTemplateId ? { parentTemplateId } : {}),
                ...(planOwned ? { planOwned: true, planId: 'current' } : {}),
                lastUpdated: nowIso,
                createdBy: userId,
                isCustom: true,
                isDefault: false,
                createdVia: 'coach',
            });
            return {
                result: {
                    templateId, name, exerciseCount: exercises.length,
                    ...(planOwned ? { planOwned: true } : {}),
                    ...(input.forPlan === true && !planOwned ? { note: "No plan yet, so it's in the user's own list." } : {}),
                },
                actionCard: {
                    kind: 'template_created',
                    templateId, name, category,
                    exerciseCount: exercises.length,
                },
            };
        },

        async get_verdicts(input) {
            const scope = input?.scope == null ? 'week' : input.scope;
            if (scope !== 'week' && scope !== 'block') return toolError('invalid_input', `scope must be 'week' or 'block' (got ${JSON.stringify(input.scope)})`);
            return computeUserVerdicts({ db, userId, today, unit, scope });
        },

        async get_rotation_candidates(input) {
            if (!input?.exercise && !input?.pattern) return toolError('invalid_input', 'Pass exercise (to replace) or pattern (to fill).');
            if (input.pattern && !PATTERNS.includes(input.pattern)) {
                return toolError('invalid_input', `pattern must be one of ${PATTERNS.join(', ')} (got ${JSON.stringify(input.pattern)})`);
            }
            const ctx = await loadCtx();
            const customSnap = await userDoc().collection('customExercises').get();
            const byName = new Map([...require('./data/exercises.json'), ...customSnap.docs.map(d => d.data())]
                .filter(e => e?.name).map(e => [e.name.toLowerCase(), e]));
            const lookup = (n) => byName.get(String(n || '').toLowerCase());
            const location = clip(input.location, 80) || ctx.gym || null;
            const active = ctx.templates.filter(t => !t.archived && !t.isHidden && Array.isArray(t.exercises));
            // Don't offer what's already on the same workout(s) as the exercise.
            const exKey = String(input.exercise || '').trim().toLowerCase();
            const sameDay = active.filter(t => t.exercises.some(e => String(e.machine || e.name || '').toLowerCase() === exKey));
            const exclude = sameDay.flatMap(t => t.exercises.map(e => e.machine || e.name)).filter(Boolean);
            const ranked = rankRotationCandidates({
                exercise: input.exercise || null, pattern: input.pattern || null,
                equipment: ctx.equipment, location, lookup, exclude, limit: intIn(input.limit, 1, 10, 5),
            });
            const held = [];
            const seen = new Set();
            for (const t of active) {
                t.exercises.forEach((e, i) => {
                    const n = e.machine || e.name;
                    if (!n || seen.has(n.toLowerCase()) || inferRole(e, i) !== 'primary') return;
                    seen.add(n.toLowerCase());
                    held.push({ name: n, reason: 'primary — kept fixed so the scoreboard keeps meaning something' });
                });
            }
            return {
                exercise: input.exercise || null,
                location,
                pattern: ranked.pattern,
                ...(ranked.role === 'primary' && input.exercise ? { warning: `${input.exercise} reads as a primary — rotating it resets its scoreboard trend.` } : {}),
                candidates: ranked.candidates,
                heldPrimaries: held.slice(0, 8),
                ...(ranked.candidates.length ? {} : { note: location ? `No other ${ranked.pattern || 'same-pattern'} machine at ${location}.` : 'No same-pattern alternative in the library.' }),
            };
        },

        async set_primary_lifts(input) {
            const list = Array.isArray(input?.exercises) ? input.exercises.map(x => clip(x, 80)).filter(Boolean) : [];
            if (list.length < 3 || list.length > 8) return toolError('invalid_input', `Pick 3–8 main lifts (got ${list.length}).`);
            const ctx = await loadCtx();
            const active = ctx.templates.filter(t => !t.archived && !t.isHidden && Array.isArray(t.exercises));
            const known = [...new Set(active.flatMap(t => t.exercises.map(e => e.machine || e.name)).filter(Boolean))];
            const chosen = [];
            for (const typed of list) {
                const m = matchName(typed, known, 0.85);
                if (!m.name) {
                    return toolError('invalid_input', `"${typed}" isn't in any saved workout.`,
                        m.nearest?.length ? `Nearest: ${m.nearest.join(', ')}.` : 'Call list_templates.');
                }
                if (!chosen.includes(m.name)) chosen.push(m.name);
            }
            const set = new Set(chosen.map(n => n.toLowerCase()));
            const updatedNames = [];
            const nowIso = new Date().toISOString();
            for (const t of active) {
                const next = applyPrimaryChoice(t.exercises, set);
                if (!next) continue;
                await userDoc().collection('workoutTemplates').doc(t.id).set({ exercises: next, lastUpdated: nowIso }, { merge: true });
                t.exercises = next;
                updatedNames.push(t.name || t.id);
            }
            return {
                result: { primaries: chosen, workoutsUpdated: updatedNames },
                actionCard: { kind: 'primaries_set', name: 'Main lifts set', summary: chosen.join(' · ') },
            };
        },

        // ── TP-3: the plan ─────────────────────────────────────────────
        async get_plan() {
            const d = await loadPlanCtx();
            const tl = buildPlanTimeline({ ...d, override: weekOverrideOf(d.settings) });
            const active = tl.activeProgram;
            const wp = await this.get_week_plan();
            return {
                result: {
                    exists: !!d.plan,
                    name: d.plan?.name || null,
                    cadence: cadenceOf(d.plan), cadenceText: describeCadence(cadenceOf(d.plan)),
                    paused: d.plan?.paused === true, rotationPolicy: d.plan?.rotationPolicy || 'ask',
                    horizonWeeks: d.plan?.horizonWeeks || 12, sessionMinutes: d.plan?.sessionMinutes || null,
                    split: wp.days || null, restDays: wp.restDays || [], today: wp.today || null, todayPlanned: wp.todayPlanned || null,
                    thisWeek: tl.header.thisWeek, nextLighterWeek: tl.header.nextLighter,
                    next6Weeks: tl.weeks.filter(w => w.weekStart > date).slice(0, 6).map(w => ({ weekStart: w.weekStart, kind: w.label, projected: !!w.projected, markers: w.markers.map(m => m.label) })),
                    goals: tl.goalsStrip, events: d.events.filter(e => e.date > date).map(e => ({ id: e.id, name: e.name, date: e.date })),
                    currentWave: active ? {
                        startDate: active.startDate, weeks: active.weeks, rolled: active.createdVia === 'auto-roll',
                        pendingSwaps: (active.pendingRotations || []).flatMap(r => r.swaps.map(x => `${x.from} → ${x.to} (${r.name})`)),
                    } : null,
                    ...(d.plan ? {} : { note: 'No plan doc yet — it is created with the first program (create_program) or update_plan.' }),
                },
            };
        },

        async update_plan(input) {
            const patch = {};
            const i = input || {};
            if (i.cadence !== undefined) {
                const b = i.cadence?.buildWeeks;
                if (b !== undefined && !(Number.isInteger(b) && b >= 1 && b <= 8)) return toolError('invalid_input', `cadence.buildWeeks is a whole number 1-8 (got ${JSON.stringify(b)})`);
                const d0 = await loadPlanCtx();
                patch.cadence = { ...cadenceOf(d0.plan), ...(b !== undefined ? { buildWeeks: b } : {}), ...(typeof i.cadence?.lighterWeek === 'boolean' ? { lighterWeek: i.cadence.lighterWeek } : {}) };
            }
            if (i.horizonWeeks !== undefined) {
                if (!(Number.isInteger(i.horizonWeeks) && i.horizonWeeks >= 4 && i.horizonWeeks <= 26)) return toolError('invalid_input', `horizonWeeks is 4-26 (got ${JSON.stringify(i.horizonWeeks)})`);
                patch.horizonWeeks = i.horizonWeeks;
            }
            if (i.sessionMinutes !== undefined) {
                if (!(Number.isInteger(i.sessionMinutes) && i.sessionMinutes >= 15 && i.sessionMinutes <= 180)) return toolError('invalid_input', `sessionMinutes is 15-180 (got ${JSON.stringify(i.sessionMinutes)})`);
                patch.sessionMinutes = i.sessionMinutes;
            }
            if (i.rotationPolicy !== undefined) {
                if (!ROTATION_POLICIES.includes(i.rotationPolicy)) return toolError('invalid_input', `rotationPolicy must be one of ${ROTATION_POLICIES.join(', ')}`);
                patch.rotationPolicy = i.rotationPolicy;
            }
            if (i.paused !== undefined) {
                if (typeof i.paused !== 'boolean') return toolError('invalid_input', 'paused must be true or false');
                patch.paused = i.paused;
            }
            if (i.name !== undefined) patch.name = clip(i.name, 40) || 'My plan';
            let splitSummary = null;
            if (i.split !== undefined) {
                const out = await this.set_week_plan({ days: i.split });
                if (out.error) return toolError('invalid_input', `split: ${errorText(out.error)}`);
                splitSummary = out.result.summary;
            }
            if (!Object.keys(patch).length && !splitSummary) return toolError('invalid_input', 'Nothing to change — pass cadence, horizonWeeks, sessionMinutes, rotationPolicy, paused, name or split.');
            const nowIso = new Date().toISOString();
            if (Object.keys(patch).length) {
                const ref = userDoc().collection('plan').doc('current');
                const snap = await ref.get();
                await ref.set({ ...(snap.exists ? {} : { name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true }, horizonWeeks: 12, rotationPolicy: 'ask', createdAt: nowIso, createdVia: 'coach' }), ...patch, lastUpdated: nowIso }, { merge: true });
            }
            planPromise = null;
            const d = await loadPlanCtx();
            const summary = [describeCadence(cadenceOf(d.plan)), d.plan?.paused ? 'paused' : null, d.plan?.rotationPolicy === 'auto' ? 'swaps applied automatically' : null, splitSummary].filter(Boolean).join(' · ');
            return {
                result: { changed: [...Object.keys(patch), ...(splitSummary ? ['split'] : [])], plan: { cadence: cadenceOf(d.plan), paused: d.plan?.paused === true, rotationPolicy: d.plan?.rotationPolicy || 'ask' } },
                actionCard: { kind: 'plan_set', name: 'Plan updated', summary },
            };
        },

        async draft_next_wave(input) {
            const d = await loadPlanCtx();
            const i = input || {};
            if (i.startDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(i.startDate))) return toolError('invalid_input', `startDate must be YYYY-MM-DD (got ${JSON.stringify(i.startDate)})`);
            const w = rollWindow({ plan: d.plan || {}, programs: d.programs, today: date });
            const start = i.startDate || w.start;
            const draft = draftNextWave({
                ...d, start, plan: d.plan || {},
                overrides: {
                    cadence: { ...(i.buildWeeks !== undefined ? { buildWeeks: i.buildWeeks } : {}), ...(typeof i.lighterWeek === 'boolean' ? { lighterWeek: i.lighterWeek } : {}) },
                    rotate: i.rotate, skipSwaps: Array.isArray(i.skipSwaps) ? i.skipSwaps : [],
                },
            });
            if (!draft) return toolError('not_found', 'No split to continue — the week plan has no sessions.', 'Set the week plan first (update_plan with split).');
            return {
                result: {
                    due: w.due, dueReason: w.reason,
                    draft: {
                        name: draft.name, weeks: draft.weeks, startDate: draft.startDate, endDate: draft.endDate,
                        weekTargets: draft.weekTargets, split: draft.split, rationale: draft.rationale,
                        swaps: draft.rotations.flatMap(r => r.swaps.map(x => ({ workout: r.name, from: x.from, to: x.to, equipment: x.equipment, reason: x.reason }))),
                    },
                    note: 'To apply: create_program with name, weeks, startDate, weekTargets, split, rationale (add rotateAccessories:true to apply the swaps).',
                },
            };
        },

        // ── TP-1: goals + events ──────────────────────────────────────
        async list_goals() {
            const g = await loadGoalCtx();
            return {
                result: {
                    trainingFor: g.settings.coachGoal || null,
                    goals: g.rows.map(r => ({
                        id: r.goal.id, name: goalName(r.goal, { events: g.events }), type: r.goal.type, target: r.goal.target, unit: r.goal.unit,
                        by: r.goal.by || null, storedStatus: r.goal.status, status: r.status, now: r.now ?? null,
                        baseline: r.goal.baseline || null, eventId: r.goal.eventId || null, sentence: r.sentence,
                    })),
                    events: g.events.map(e => ({ id: e.id, name: e.name, date: e.date, kind: e.kind, past: e.date <= date })),
                    mainLifts: g.mainLifts,
                },
            };
        },

        async set_goal(input) {
            const g = await loadGoalCtx();
            const draft = {
                type: input?.type, metric: input?.metric, target: input?.target, by: input?.by ?? null,
                eventId: input?.eventId || null, name: input?.name, unit,
                key: input?.type === 'lift' ? { exercise: input?.exercise } : input?.type === 'balance' ? { pattern: input?.pattern } : undefined,
            };
            if (draft.type === 'lift' && !g.mainLifts.length) {
                return toolError('invalid_input', 'No main lifts are set yet — lift goals track main lifts.', 'Ask which lifts they care about and set_primary_lifts first.');
            }
            const v = normalizeGoal(draft, { today: date, mainLifts: g.mainLifts, eventIds: g.events.map(e => e.id), unit });
            if (!v.ok) return toolError('invalid_input', v.error, v.hint || null);
            const same = g.goals.find(x => x.status === 'active' && x.type === v.goal.type && x.metric === v.goal.metric
                && JSON.stringify(x.key || null) === JSON.stringify(v.goal.key || null));
            if (same) {
                return toolError('near_duplicate', `An active goal already covers this: "${goalName(same, { events: g.events })}" (${same.id}).`, 'Use update_goal on it to change the target or date.');
            }
            const { baseline, direction } = captureBaseline(v.goal, g.data);
            const goal = { ...v.goal, direction, baseline, createdAt: new Date().toISOString(), source: source === 'live' ? 'live' : 'chat' };
            const id = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await userDoc().collection('goals').doc(id).set(goal);
            const [row] = goalsWithStatus([{ id, ...goal }], { ...g.data, events: g.events });
            return {
                result: { goalId: id, name: goalName(goal, { events: g.events }), baseline, status: row.status, sentence: row.sentence },
                actionCard: { kind: 'goal_set', name: goalName(goal, { events: g.events }), summary: row.sentence },
            };
        },

        async update_goal(input) {
            const id = String(input?.goalId || '').trim();
            if (!id) return toolError('invalid_input', 'goalId is required', 'Call list_goals for the ids.');
            const g = await loadGoalCtx();
            const cur = g.goals.find(x => x.id === id);
            if (!cur) return toolError('not_found', `No goal ${id}.`, 'Call list_goals for the ids.');
            const patch = {};
            if (input.target !== undefined) {
                const t = Number(input.target);
                if (!Number.isFinite(t) || t <= 0) return toolError('invalid_input', `target must be a positive number (got ${JSON.stringify(input.target)})`);
                patch.target = Math.round(t * 100) / 100;
            }
            if (input.by !== undefined) {
                if (input.by !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(input.by))) return toolError('invalid_input', `by must be YYYY-MM-DD or null (got ${JSON.stringify(input.by)})`);
                if (input.by && input.by <= date) return toolError('invalid_input', `by must be after today (${date})`);
                patch.by = input.by || null;
            }
            if (input.status !== undefined) {
                if (!GOAL_STATUSES.includes(input.status)) return toolError('invalid_input', `status must be one of ${GOAL_STATUSES.join(', ')}`);
                patch.status = input.status;
            }
            if (input.name !== undefined) patch.name = clip(input.name, 60) || null;
            if (!Object.keys(patch).length) return toolError('invalid_input', 'Nothing to change — pass target, by, status or name.');
            patch.updatedAt = new Date().toISOString();
            await userDoc().collection('goals').doc(id).set(patch, { merge: true });
            const next = { ...cur, ...patch };
            const [row] = goalsWithStatus([next], { ...g.data, events: g.events });
            return {
                result: { goalId: id, changed: Object.keys(patch).filter(k => k !== 'updatedAt'), status: row.status, sentence: row.sentence },
                actionCard: { kind: 'goal_set', name: `${goalName(next, { events: g.events })} — updated`, summary: row.sentence },
            };
        },

        async get_report_card(input) {
            const key = input?.weekKey ? String(input.weekKey) : null;
            if (key && !/^\d{4}-\d{2}-\d{2}$/.test(key)) return toolError('invalid_input', `weekKey must be YYYY-MM-DD (got ${JSON.stringify(input.weekKey)})`);
            let snap;
            if (key) {
                const d = await userDoc().collection('reportCards').doc(key).get();
                snap = d.exists ? d : null;
            } else {
                const q = await userDoc().collection('reportCards').orderBy('weekKey', 'desc').limit(1).get();
                snap = q.empty ? null : q.docs[0];
            }
            if (!snap) return toolError('not_found', key ? `No report card for the week of ${key}.` : 'No report cards yet.', 'The first one arrives Sunday night once the user turns it on.');
            const r = snap.data();
            const c = r.card || {};
            return {
                result: {
                    weekKey: r.weekKey || c.weekKey, grade: c.gradeLabel || null, narrative: r.narrative || c.headline || null,
                    showedUp: c.showedUp?.sentence || null, strength: (c.strength || []).map(x => x.sentence), body: c.body?.sentence || null,
                    goals: (c.goals || []).map(g => g.sentence), recovery: c.recovery?.sentence || null, balance: c.balance?.sentence || null,
                    nextWeek: c.upcoming?.sentence || null,
                    proposed: r.chosenOption ? { kind: r.chosenOption.kind, label: r.chosenOption.label, why: r.chosenOption.why || null } : null,
                    applied: r.applied?.kind || null,
                },
            };
        },

        async add_event(input) {
            const v = normalizeEvent(input || {}, { today: date });
            if (!v.ok) return toolError('invalid_input', v.error);
            const g = await loadGoalCtx();
            const dup = g.events.find(e => e.date === v.event.date && e.name.toLowerCase() === v.event.name.toLowerCase());
            if (dup) return toolError('near_duplicate', `${dup.name} on ${dup.date} is already there (${dup.id}).`);
            const id = `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await userDoc().collection('events').doc(id).set({ ...v.event, createdAt: new Date().toISOString(), source: 'chat' });
            return {
                result: { eventId: id, ...v.event },
                actionCard: { kind: 'event_added', name: v.event.name, summary: `${v.event.date} · ${v.event.kind === 'look' ? 'look my best' : v.event.kind}` },
            };
        },

        async get_workouts(input) {
            const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
            let from = input?.from;
            let to = input?.to;
            if (input?.date != null) {
                if (!ok(input.date)) return toolError('invalid_input', `date must be YYYY-MM-DD (got ${JSON.stringify(input.date)})`);
                from = input.date;
                to = input.date;
            }
            if (!ok(from) || !ok(to)) return toolError('invalid_input', 'Pass {date} or {from, to}, each YYYY-MM-DD.');
            if (from > to) [from, to] = [to, from];
            const ctx = await loadCtx();
            const hits = ctx.workouts.filter(w => w.date >= from && w.date <= to)
                .sort((a, b) => b.date.localeCompare(a.date));
            return {
                unit, from, to,
                sessions: hits.slice(0, 14).map(w => workoutSummary(w, unit)),
                found: hits.length,
                ...(hits.length > 14 ? { note: `${hits.length} sessions in range — showing the newest 14; narrow the range for the rest.` } : {}),
            };
        },

        async get_week_plan() {
            const t = todayInfo(today);
            const snap = await userDoc().collection('preferences').doc('weekPlan').get();
            if (!snap.exists) return { plan: null, note: 'No week plan set yet.', today: t, todayPlanned: null };
            const { days = {}, restDays = [] } = snap.data();
            let names = new Map();
            if (days[t.day] && days[t.day] !== 'rest') {
                try {
                    const tSnap = await userDoc().collection('workoutTemplates').doc(days[t.day]).get();
                    if (tSnap.exists) names = new Map([[days[t.day], tSnap.data().name || days[t.day]]]);
                } catch { /* id stands in for the name */ }
            }
            return { days, restDays, today: t, todayPlanned: plannedForDay({ days, restDays }, t.day, names) };
        },

        async set_week_plan(input) {
            const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
            const incoming = input?.days;
            if (!incoming || typeof incoming !== 'object') return asToolError('days is required');

            const ref = userDoc().collection('preferences').doc('weekPlan');
            const snap = await ref.get();
            const current = snap.exists ? snap.data() : { days: {}, restDays: [] };
            const days = { ...current.days };
            const restDays = new Set(current.restDays || []);

            // Validate template ids against the real library.
            const tSnap = await userDoc().collection('workoutTemplates').get();
            const templateNames = new Map(tSnap.docs.map(d => [d.id, d.data().name || d.id]));

            for (const [day, val] of Object.entries(incoming)) {
                if (!DAYS.includes(day)) return asToolError(`Invalid day key: ${day} (use mon…sun)`);
                if (val === 'rest') { days[day] = null; restDays.add(day); }
                else if (val == null || val === '') { days[day] = null; restDays.delete(day); }
                else {
                    if (!templateNames.has(val)) return toolError('not_found', `Unknown templateId "${val}" for ${day}.`, 'Call list_templates for valid ids.');
                    days[day] = val;
                    restDays.delete(day);
                }
            }
            for (const d of DAYS) if (!(d in days)) days[d] = null;

            const plan = { days, restDays: [...restDays], updatedAt: new Date().toISOString() };
            await ref.set(plan);

            const summary = DAYS
                .filter(d => days[d])
                .map(d => `${d[0].toUpperCase()}${d.slice(1)} ${templateNames.get(days[d])}`)
                .join(' · ') + ([...restDays].length ? ` · rest ${[...restDays].join('/')}` : '');
            return {
                result: { plan, summary },
                actionCard: { kind: 'week_plan_set', name: 'Week plan updated', summary: summary || 'All days open' },
            };
        },

        async remember_fact(input) {
            const text = String(input?.text || '').trim().slice(0, 200);
            if (!text) return asToolError('text is required');
            const ref = userDoc().collection('preferences').doc('coachMemory');
            const snap = await ref.get();
            const facts = snap.exists ? (snap.data().facts || []) : [];
            if (facts.length >= 40) {
                return asToolError('Memory is full (40 facts)', 'invalid_input', 'forget_fact an outdated one first, or ask the user to prune memory in Settings');
            }
            const fact = {
                id: `fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                text,
                createdAt: new Date().toISOString(),
                source: 'chat',
            };
            await ref.set({ facts: [...facts, fact] }, { merge: true });
            return { result: { remembered: text, id: fact.id } };
        },

        async forget_fact(input) {
            const id = String(input?.id || '').trim();
            if (!id) return asToolError('id is required');
            const ref = userDoc().collection('preferences').doc('coachMemory');
            const snap = await ref.get();
            const facts = snap.exists ? (snap.data().facts || []) : [];
            const next = facts.filter(f => f.id !== id);
            if (next.length === facts.length) return asToolError(`No fact with id ${id}`);
            await ref.set({ facts: next }, { merge: true });
            return { result: { forgotten: id } };
        },

        async update_workout_template(input) {
            const templateId = String(input?.templateId || '').trim();
            if (!templateId) return asToolError('templateId is required');
            const ref = userDoc().collection('workoutTemplates').doc(templateId);
            const snap = await ref.get();
            if (!snap.exists) return toolError('not_found', `Template not found: ${templateId}.`, 'Call list_templates for valid ids.');
            const locked = await checkDeloadLock('update_workout_template', input);
            if (locked) return locked;

            const applied = applyTemplateChanges(snap.data(), input.changes);
            if (!applied.ok) return asToolError(applied.error);
            // Guard the exercises this call adds and the weight it sets.
            const priorNames = new Set((snap.data().exercises || []).map(e => String(e.machine || e.name || '').toLowerCase()));
            const added = applied.updated.exercises.filter(e => !priorNames.has(String(e.machine || e.name || '').toLowerCase()));
            const checks = added.map(e => ({ ref: e, check: { machine: e.machine, reps: e.reps, equipment: e.equipment, weight: e.weight } }));
            const setEx = input.changes?.setExercise;
            if (setEx && typeof setEx.weight === 'number') {
                const ref = applied.updated.exercises.find(e => String(e.machine || e.name || '').toLowerCase() === String(setEx.name || '').trim().toLowerCase());
                if (ref) checks.push({ ref, check: { machine: ref.machine || ref.name, reps: ref.defaultReps ?? ref.reps, weight: setEx.weight } });
            }
            const bad = await checkExercises(checks.map(c => c.check));
            if (bad) return bad;
            for (const c of checks) if (c.check.equipment) c.ref.equipment = c.check.equipment;

            applied.updated.lastUpdated = new Date().toISOString();
            await ref.set(applied.updated);
            return {
                result: { templateId, diff: applied.diffSummary },
                actionCard: {
                    kind: 'template_updated',
                    templateId,
                    name: applied.updated.name,
                    category: applied.updated.category || null,
                    exerciseCount: (applied.updated.exercises || []).length,
                    diffSummary: applied.diffSummary,
                },
            };
        },
    };
}

// ── Live-mode proposal tools (Phase 6) ──────────────────────────────
// The active workout is CLIENT-owned state (auto-saved, debounced) — a server
// write would race it and lose data. So live write-tools produce PROPOSALS:
// validated, echoed to the stream, applied client-side only on a user tap.

const LIVE_PROPOSAL_TOOLS = [
    {
        name: 'propose_next_target',
        description: "Propose weight/reps for the user's next set of an exercise. Renders as a card with an Apply button — never applies itself.",
        input_schema: {
            type: 'object',
            properties: {
                exercise: { type: 'string' },
                weight: { type: 'number', description: "In the user's display unit" },
                reps: { type: 'number' },
                why: { type: 'string', description: 'One short clause, e.g. "last set was a clean 8 at 145"' },
            },
            required: ['exercise'],
        },
    },
    {
        name: 'propose_swap',
        description: 'Propose swapping an exercise for another (machine taken, pain, equipment missing). MUST pick equipment that exists at the current gym (it is in the live context).',
        input_schema: {
            type: 'object',
            properties: {
                fromExercise: { type: 'string' },
                toExercise: { type: 'string' },
                equipment: { type: 'string', description: 'Equipment name from the current gym list' },
                why: { type: 'string' },
            },
            required: ['fromExercise', 'toExercise'],
        },
    },
    {
        name: 'propose_add_exercise',
        description: 'Propose adding one exercise to the current session.',
        input_schema: {
            type: 'object',
            properties: {
                exercise: { type: 'string' },
                sets: { type: 'number' },
                reps: { type: 'number' },
                weight: { type: 'number' },
                why: { type: 'string' },
            },
            required: ['exercise'],
        },
    },
    {
        name: 'propose_skip_exercise',
        description: 'Propose dropping ONE exercise from today\'s session (pain, no machine, out of time) — or, with endSession:true, ending the session. Renders a card; nothing happens without the tap. The reason is logged on the workout.',
        input_schema: {
            type: 'object',
            properties: {
                exercise: { type: 'string', description: "An exercise in today's session (not needed with endSession)" },
                endSession: { type: 'boolean' },
                why: { type: 'string' },
            },
        },
    },
    {
        name: 'propose_rest',
        description: 'Propose a different rest duration before the next set (e.g. longer before a heavy top set).',
        input_schema: {
            type: 'object',
            properties: {
                seconds: { type: 'number' },
                why: { type: 'string' },
            },
            required: ['seconds'],
        },
    },
];

const clip = (s, n) => String(s || '').trim().slice(0, n);

/**
 * Validate a live proposal's input. Pure. Returns
 * {ok:true, proposal:{kind,…}} or {ok:false, error}.
 */
function validateProposal(toolName, input) {
    const why = clip(input?.why, 140);
    switch (toolName) {
        case 'propose_next_target': {
            const exercise = clip(input?.exercise, 80);
            if (!exercise) return { ok: false, error: 'exercise is required' };
            if (input?.weight != null && !(typeof input.weight === 'number' && input.weight >= 0 && input.weight < 2000)) {
                return { ok: false, error: `weight must be a number 0-2000 (got ${JSON.stringify(input.weight)})` };
            }
            if (input?.reps != null && intIn(input.reps, 1, 50, null) == null) return { ok: false, error: `reps must be 1-50 (got ${JSON.stringify(input.reps)})` };
            const weight = input?.weight ?? null;
            const reps = input?.reps != null ? intIn(input.reps, 1, 50, null) : null;
            if (weight == null && reps == null) return { ok: false, error: 'weight or reps required' };
            return { ok: true, proposal: { kind: 'next_target', exercise, weight, reps, why } };
        }
        case 'propose_swap': {
            const fromExercise = clip(input?.fromExercise, 80);
            const toExercise = clip(input?.toExercise, 80);
            if (!fromExercise || !toExercise) return { ok: false, error: 'fromExercise and toExercise are required' };
            return { ok: true, proposal: { kind: 'swap', fromExercise, toExercise, equipment: clip(input?.equipment, 80) || null, why } };
        }
        case 'propose_add_exercise': {
            const ex = normalizeExercise({ name: input?.exercise, sets: input?.sets, reps: input?.reps, weight: input?.weight });
            if (ex.error) return { ok: false, error: ex.error };
            return {
                ok: true,
                proposal: {
                    kind: 'add_exercise', exercise: ex.machine,
                    sets: ex.sets, reps: ex.reps, weight: ex.weight ?? null, why,
                },
            };
        }
        case 'propose_week_adjustment': {
            const has = (k) => input?.[k] !== undefined && input?.[k] !== null;
            if (has('weightPct') && !(typeof input.weightPct === 'number' && input.weightPct >= -50 && input.weightPct <= 10)) {
                return { ok: false, error: `weightPct must be a number from -50 to 10 (got ${JSON.stringify(input.weightPct)})` };
            }
            const setDelta = has('setDelta') ? intIn(input.setDelta, -3, 3, null) : null;
            if (has('setDelta') && setDelta == null) return { ok: false, error: `setDelta must be a whole number from -3 to 3 (got ${JSON.stringify(input.setDelta)})` };
            const weightPct = has('weightPct') && input.weightPct !== 0 ? Math.round(input.weightPct) : null;
            if (weightPct == null && !setDelta) return { ok: false, error: 'Provide weightPct and/or setDelta' };
            const weeks = has('weeks') ? intIn(input.weeks, 1, 4, null) : 1;
            if (weeks == null) return { ok: false, error: `weeks must be 1-4 (got ${JSON.stringify(input.weeks)})` };
            if (has('from') && !/^\d{4}-\d{2}-\d{2}$/.test(String(input.from))) return { ok: false, error: 'from must be YYYY-MM-DD' };
            return {
                ok: true,
                proposal: {
                    kind: 'week_adjustment', weightPct, setDelta: setDelta || null,
                    label: clip(input?.label, 40) || null, weeks,
                    from: has('from') ? input.from : null,
                    extendBlock: input?.extendBlock === true, why,
                },
            };
        }
        case 'propose_skip_exercise': {
            const endSession = input?.endSession === true;
            const exercise = clip(input?.exercise, 80);
            if (!endSession && !exercise) return { ok: false, error: 'exercise is required (or endSession:true)' };
            return { ok: true, proposal: { kind: 'skip_exercise', exercise: exercise || null, endSession, why } };
        }
        case 'propose_rest': {
            const seconds = intIn(input?.seconds, 15, 600, null);
            if (seconds == null) return { ok: false, error: 'seconds must be 15-600' };
            return { ok: true, proposal: { kind: 'rest', seconds, why } };
        }
        case 'propose_session_adjustments': {
            // Coach-tab proposal (5.6.1): one-session riff on an existing
            // template. Shape here; template existence + exercise guards in
            // the executor's checkProposal (AP-18 — a missing template used
            // to return {proposed:true} while the client dropped the card).
            const templateId = clip(input?.templateId, 80);
            const label = clip(input?.label, 40);
            if (!templateId || !label) return { ok: false, error: 'templateId and label are required' };
            if (input?.weightPct != null && !(typeof input.weightPct === 'number' && input.weightPct >= -90 && input.weightPct <= 100)) {
                return { ok: false, error: `weightPct must be a number from -90 to 100 (got ${JSON.stringify(input.weightPct)})` };
            }
            const weightPct = input?.weightPct != null ? Math.round(input.weightPct) : null;
            if (Array.isArray(input?.addExercises) && input.addExercises.length > 5) return { ok: false, error: 'addExercises: at most 5 for one session' };
            const addExercises = [];
            for (const raw of (Array.isArray(input?.addExercises) ? input.addExercises : [])) {
                const ex = normalizeExercise(raw);
                if (ex.error) return { ok: false, error: `addExercises: ${ex.error}` };
                addExercises.push(ex);
            }
            const dropExercises = Array.isArray(input?.dropExercises)
                ? input.dropExercises.map(x => clip(x, 80)).filter(Boolean).slice(0, 10) : [];
            if (weightPct == null && !addExercises.length && !dropExercises.length) {
                return { ok: false, error: 'Provide weightPct, addExercises, or dropExercises' };
            }
            return { ok: true, proposal: { kind: 'session_adjustments', templateId, label, weightPct, addExercises, dropExercises, why } };
        }
        default:
            return { ok: false, error: `Unknown proposal tool: ${toolName}` };
    }
}

// Tool set for live mode: fast reads + proposals (+ silent advice logging).
// NO template writes and no memory writes — those belong to the coach tab.
// remember_fact (AP-23h): an injury reported between sets is the most
// important thing to remember, and it's reported here.
const LIVE_TOOL_NAMES = ['get_exercise_history', 'get_prs', 'log_advice', 'remember_fact'];
function liveToolDefinitions() {
    return [
        ...TOOL_DEFINITIONS.filter(t => LIVE_TOOL_NAMES.includes(t.name)),
        ...LIVE_PROPOSAL_TOOLS,
    ];
}

// Human-readable status line shown in chat while each tool runs.
const TOOL_STATUS = {
    get_exercise_history: 'Reading your history…',
    list_templates: 'Checking your workouts…',
    get_prs: 'Checking your records…',
    list_equipment: 'Checking your gym…',
    create_workout_template: 'Creating your workout…',
    update_workout_template: 'Updating your workout…',
    replace_day: 'Rewriting your workout…',
    list_exercises: 'Checking your exercise library…',
    remember_fact: 'Noting that…',
    forget_fact: 'Forgetting that…',
    get_week_plan: 'Checking your week…',
    get_verdicts: 'Checking your numbers…',
    get_rotation_candidates: 'Finding alternatives…',
    set_primary_lifts: 'Setting your main lifts…',
    get_workouts: 'Reading those sessions…',
    set_week_plan: 'Updating your week…',
    archive_template: 'Archiving…',
    propose_session_adjustments: 'Building your session…',
    get_program: 'Checking your program…',
    create_program: 'Building your program…',
    adjust_program: 'Adjusting your program…',
};

module.exports = {
    TOOL_DEFINITIONS,
    TOOL_STATUS,
    validateCreateTemplateInput,
    applyTemplateChanges,
    replaceTemplateExercises,
    normalizeExercise,
    makeToolExecutors,
    computeUserVerdicts,
    deriveTemplateUsage,
    averageDurations,
    normalizeRationale,
    validateProposal,
    liveToolDefinitions,
    LIVE_PROPOSAL_TOOLS,
    validateProgramInput,
    normalizeUnit,
    todayInfo,
    plannedForDay,
    prRecordInUnit,
    exerciseHistorySession,
};
