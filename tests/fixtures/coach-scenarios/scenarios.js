// Coach eval scenarios (AP-20b). Each one is a user state + a question + what
// a good answer must and must not do. The `expect` fields are read by
// tests/coach-eval/checks.js (AP-20d); everything else about answer quality
// is the grader's job (AP-20e).
//
// expect:
//   kind         'question' (no template/program/plan writes allowed) | 'action'
//   maxWords     answer length cap (contract A ≈120 chat, ≈40 live — with slack)
//   route        expected AP-19 tier ('quick' | 'deep' | 'live')
//   mustCallAny  at least one of these tools is called
//   mustNotCall  none of these tools is called
//   mustMention  every regex matches the answer
//   mustNotMention  no regex matches the answer
//   maxWeight    { exercise, max } — no weight above `max` is named for it (no bump)
//   injuredPatterns  no written/proposed exercise has one of these movement patterns
//   askOrBuild   either asks the user something or the named tool's input passes `check`
//   mustCall     every one of these tools is called
//   verdictRule  progressionTarget() for the lift asked about — the answer must state its
//                weight and action (checks.js#verdict-quoted)
//   golden       optional reference answer, handed to the grader (AU-4)
//   minWeight    [{ exercise, min }] — no weight below `min` is named for that lift (AU-15)

import {
    baseUser, pplHistory, set, workoutDoc, liveSession, addDays, mondayOf, TEMPLATES, GYM,
} from './build.js';
import { buildExerciseSessions, progressionTarget, weightIncrement } from '../../../js/core/features/progression.js';
import { lightWeekUser, fourWeekBest } from './light-week.js';

const FRI = '2026-10-23'; // a legs day (Mon push / Wed pull / Fri legs)
const THU = '2026-10-22'; // a rest day
const INC = weightIncrement('lbs', [45, 35, 25, 10, 5]);

/** Bench sessions: progressive until `flatFrom`, then 185×`reps` (RPE optional). */
const benchFlat = (flatFrom, reps = 6, rpe = null) => (i) => (i < flatFrom
    ? [set(165 + i * 5, 8), set(165 + i * 5, 8)]
    : [set(185, reps, rpe ? { rpe: rpe(i) } : {}), set(185, reps)]);

function targetFor(user, exercise, repTarget) {
    return progressionTarget(buildExerciseSessions(user.workouts, exercise, user.unit), user.unit, repTarget, INC);
}

function toKg(workouts) {
    const kg = (w) => Math.round(w / 2.20462 / 2.5) * 2.5;
    return workouts.map(w => ({
        ...w,
        exercises: Object.fromEntries(Object.entries(w.exercises).map(([k, ex]) => [k, {
            ...ex, sets: ex.sets.map(s => ({ ...s, weight: kg(s.weight), originalUnit: 'kg' })),
        }])),
    }));
}

function programOn(today, { weeks = 4, deloadWeek = 4 } = {}) {
    return {
        id: 'program_eval', name: 'Strength block', goal: 'strength', active: true, state: 'active',
        weeks, startDate: addDays(mondayOf(today), -7 * (deloadWeek - 1)),
        split: { mon: 'push', wed: 'pull', fri: 'legs' },
        weekTargets: [{ week: 3, label: 'intensify', repRange: [6, 8] }, { week: deloadWeek, label: 'deload', weightPct: -35 }],
        trustLevel: 'propose', createdAt: '2026-09-28',
        rationale: { block: 'Strength, 4 weeks, deload in week 4' },
    };
}

const QUESTION = { kind: 'question', maxWords: 170 };
const LIVE = { kind: 'question', maxWords: 60, route: 'live' };

export function buildScenarios() {
    const list = [];

    // 1-3 — the stall ladder on bench.
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI, lifts: { 'Flat Barbell Bench Press': benchFlat(4) } });
        list.push({
            id: 'stall-rung-1', title: 'Bench flat 3 sessions — chase a rep, no bump',
            mode: 'chat', question: 'Should I go heavier on bench next time?', user,
            expect: { ...QUESTION, route: 'deep', mustMention: ['185'], maxWeight: { exercise: 'bench', max: 185 }, verdictRule: targetFor(user, 'Flat Barbell Bench Press', 8) },
        });
    }
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI, lifts: { 'Flat Barbell Bench Press': benchFlat(1) } });
        const t = targetFor(user, 'Flat Barbell Bench Press', 8);
        list.push({
            id: 'stall-rung-2', title: 'Bench flat 6 sessions — back off',
            mode: 'chat', question: "My bench has been stuck at 185 for weeks. What now?", user,
            expect: { ...QUESTION, mustMention: [String(t.weight)], maxWeight: { exercise: 'bench', max: 185 }, verdictRule: t },
        });
    }
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI, weeks: 9, lifts: { 'Flat Barbell Bench Press': benchFlat(0) } });
        list.push({
            id: 'stall-rung-3', title: 'Bench flat 9+ sessions — rotate the movement',
            mode: 'chat', question: "Bench hasn't moved in two months. What should I do about it?", user,
            expect: { ...QUESTION, mustMention: ['(swap|rotat|switch|replace|variation|change)'], maxWeight: { exercise: 'bench', max: 185 }, verdictRule: targetFor(user, 'Flat Barbell Bench Press', 8) },
        });
    }

    // 4 — deload week: "should I go heavier?" must not bump.
    {
        const user = baseUser({ today: FRI, program: programOn(FRI) });
        user.workouts = pplHistory({ today: FRI });
        const lastSquat = buildExerciseSessions(user.workouts, 'Smith Machine Squat', 'lbs')[0].topWeight;
        list.push({
            id: 'deload-go-heavier', title: 'Deload week + "should I go heavier?"',
            mode: 'chat', question: 'I feel great today — should I go heavier on squats?', user,
            expect: {
                ...QUESTION, mustMention: ['deload'], maxWeight: { exercise: 'squat', max: lastSquat },
                mustNotCall: ['update_workout_template', 'replace_day', 'adjust_program'],
            },
        });
    }

    // 5 — a pattern that's been dropped: no pulling for four weeks.
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI, lifts: Object.fromEntries(TEMPLATES.pull.exercises.map(e => [e.machine, (i) => (i < 3 ? [set(120, 10), set(120, 10)] : null)])) })
            .filter(w => w.workoutType !== 'Pull day' || Object.keys(w.exercises).length);
        list.push({
            id: 'low-volume', title: 'Pulling dropped for weeks — call it out',
            mode: 'chat', question: "Is there anything I'm neglecting?", user,
            expect: { ...QUESTION, mustMention: ['(back|pull|row|lat)'] },
        });
    }

    // 6 — rest day.
    {
        const user = baseUser({ today: THU });
        user.workouts = pplHistory({ today: THU });
        list.push({
            id: 'rest-day', title: '"What today?" on a planned rest day',
            mode: 'chat', question: 'What should I do today?', user,
            expect: { ...QUESTION, mustMention: ['(rest|recover|off day|day off)'] },
        });
    }

    // 7 — kg user: every number in kg.
    {
        const user = baseUser({ today: FRI, unit: 'kg' });
        user.workouts = toKg(pplHistory({ today: FRI }));
        list.push({
            id: 'kg-user', title: 'kg user — answers in kg',
            mode: 'chat', question: "How's my squat progressing?", user,
            expect: { ...QUESTION, mustMention: ['kg'], mustNotMention: ['\\blbs?\\b', '\\bpounds?\\b'] },
        });
    }

    // 8 — injury on record + a build request.
    {
        const user = baseUser({ today: FRI, settings: { coachInjuries: 'Left shoulder impingement — no overhead pressing' } });
        user.workouts = pplHistory({ today: FRI });
        list.push({
            id: 'injury-push-day', title: 'Shoulder injury + "build me a push day"',
            mode: 'chat', question: 'Build me a new push day I can run this week.', user,
            expect: { kind: 'action', maxWords: 400, injuredPatterns: ['vertical-push'] },
        });
    }

    // 9 — program build.
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI });
        list.push({
            id: 'program-build', title: 'Plan the next block',
            mode: 'chat', question: 'Plan my next 6-week block.', user,
            expect: {
                kind: 'action', maxWords: 700,
                askOrBuild: { tool: 'create_program', check: (input) => !!input?.rationale && Array.isArray(input?.weekTargets) },
            },
        });
    }

    // 10 — rewrite a day with gear that's never been used.
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI });
        list.push({
            id: 'rewrite-pull-day', title: 'Swap the barbell row for unused gear',
            mode: 'chat', question: "Rewrite my pull day — swap the barbell row for something I haven't used yet.", user,
            expect: {
                kind: 'action', maxWords: 300,
                mustCallAny: ['get_rotation_candidates', 'list_equipment'],
                mustMention: ['(T-Bar|Chest-Supported|Assisted Pull-Up)'],
            },
        });
    }

    // 11-12 — live mode.
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI });
        const live = liveSession(user, { templateId: 'legs', current: 1 });
        list.push({
            id: 'live-machine-taken', title: 'Live: leg press is taken',
            mode: 'live', question: 'Leg press is taken.', user, live,
            expect: { ...LIVE, mustCallAny: ['propose_swap', 'propose_skip_exercise'] },
        });
    }
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI });
        const live = liveSession(user, { templateId: 'legs', current: 0, doneSets: { 0: [set(215, 8)] } });
        list.push({
            id: 'live-next-weight', title: 'Live: what weight next?',
            mode: 'live', question: 'What weight next?', user, live,
            expect: { ...LIVE, mustCallAny: ['propose_next_target'] },
        });
    }

    // 13 — fatigue: same load, RPE climbing (AP-22).
    {
        const user = baseUser({ today: FRI, settings: { trackRpe: true } });
        const rpe = (i) => [null, null, null, null, 7.5, 8.5, 9][i];
        user.workouts = pplHistory({ today: FRI, lifts: { 'Flat Barbell Bench Press': benchFlat(4, 8, rpe) } });
        list.push({
            id: 'fatigue-rpe', title: 'RPE 7.5 → 8.5 → 9 at 185 — hold or back off',
            mode: 'chat', question: 'Should I go heavier on bench?', user,
            expect: { ...QUESTION, mustMention: ['(RPE|effort|fatigu|tired|harder)'], maxWeight: { exercise: 'bench', max: 185 } },
        });
    }

    // 14 — "last week was hard" → one week-adjustment card (AP-23b).
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI });
        list.push({
            id: 'hard-week', title: '"Last week was brutal" → propose a lighter week',
            mode: 'chat', question: "Last week was brutal and I'm wiped. Can we ease off this week?", user,
            expect: { ...QUESTION, mustCallAny: ['propose_week_adjustment'] },
        });
    }

    // 15 — a fact lookup takes the quick route (AP-19).
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI });
        const best = Math.max(...user.workouts.flatMap(w => Object.entries(w.exercises)
            .filter(([k]) => w.exerciseNames[k] === 'Flat Barbell Bench Press')
            .flatMap(([, ex]) => ex.sets.map(s => s.weight))));
        list.push({
            id: 'pr-lookup', title: '"What\'s my bench PR?" — quick tier, right number',
            mode: 'chat', question: "What's my bench PR?", user,
            expect: { kind: 'question', maxWords: 90, route: 'quick', mustMention: [String(best)] },
        });
    }

    // 17 — AU-2: effort rising WITH the load is progress, not fatigue — the
    // rule must not hold or back off, and neither should the coach.
    {
        const user = baseUser({ today: FRI, settings: { trackRpe: true } });
        // 10 lb a session: the last three span 20 lb, more than fatigueState's
        // one-increment "same load" window.
        const loads = [125, 135, 145, 155, 165, 175, 185];
        const rpes = [null, null, null, null, 7, 8, 9];
        user.workouts = pplHistory({
            today: FRI, lifts: { 'Flat Barbell Bench Press': (i) => [set(loads[i], 8, rpes[i] ? { rpe: rpes[i] } : {}), set(loads[i], 8)] },
        });
        const t = targetFor(user, 'Flat Barbell Bench Press', 8);
        list.push({
            id: 'fatigue-rising-load', title: 'RPE 7 → 8 → 9 while the load climbs — still a bump',
            mode: 'chat', question: 'Should I go heavier on bench?', user,
            expect: { ...QUESTION, verdictRule: t, mustMention: [String(t.weight)] },
        });
    }

    // 18 — AU-4: the specimen (agent field guide 1.4b): last week of the block,
    // a heavy push session today with bench 185×6 → 185×3. The rules' answer:
    // one sub-target session is rung 0 — no machine change; the deload is next.
    {
        const SPEC_TODAY = '2026-10-23';
        const program = { ...programOn(SPEC_TODAY, { weeks: 6, deloadWeek: 6 }),
            weekTargets: [{ week: 5, label: 'peak', weightPct: 5 }, { week: 6, label: 'deload', weightPct: -35 }] };
        const user = baseUser({ today: SPEC_TODAY, program });
        const history = pplHistory({ today: SPEC_TODAY, lifts: { 'Flat Barbell Bench Press': (i) => [set(Math.min(185, 160 + i * 5), 6), set(Math.min(185, 160 + i * 5), 6)] } });
        const todayPush = workoutDoc({
            date: SPEC_TODAY, template: 'Push day',
            exercises: [
                { name: 'Flat Barbell Bench Press', equipment: 'Flat Bench', sets: [set(185, 3), set(165, 6)] },
                { name: 'Incline Dumbbell Press', equipment: 'Dumbbells', sets: [set(65, 10), set(65, 9)] },
                { name: 'Triceps Pushdown', equipment: 'Cable Stack', sets: [set(70, 12), set(70, 12)] },
            ],
        });
        user.workouts = [...history, todayPush];
        list.push({
            id: 'specimen-session-review', title: 'Specimen: review today\'s push (185×6 → 185×3, last block week)',
            mode: 'chat',
            question: 'Review my Push day session from today — how did it go compared to recent sessions, and what should I change next time?',
            user,
            expect: {
                ...QUESTION, mustMention: ['185', 'deload'], maxWeight: { exercise: 'bench', max: 185 },
                mustNotCall: ['get_rotation_candidates', 'replace_day', 'update_workout_template'],
                golden: null, // Kevin's in-contract answer (field guide 4.6 step 3) goes here
            },
        });
    }

    // 19 — AU-4: a swap goes through the rotation engine (AP-23a).
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI });
        list.push({
            id: 'swap-via-rotation', title: 'Swap the seated leg curl → get_rotation_candidates',
            mode: 'chat', question: 'Swap the seated leg curl on leg day for something different.', user,
            expect: { kind: 'action', maxWords: 250, mustCall: ['get_rotation_candidates'], mustMention: ['Standing Leg Curl'] },
        });
    }

    // 20 — AU-4: pain mid-set → skip or swap, and remember it.
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI });
        const live = liveSession(user, { templateId: 'legs', current: 1, doneSets: { 1: [set(310, 10)] } });
        list.push({
            id: 'live-knee-pain', title: 'Live: knee hurts on leg press → skip/swap + remember',
            mode: 'live', question: 'My left knee hurts on these leg presses.', user, live,
            expect: { ...LIVE, mustCallAny: ['propose_skip_exercise', 'propose_swap'], mustCall: ['remember_fact'], mustNotMention: ['push (through|it)'] },
        });
    }

    // 21 — AU-4: the weekly review (its own request, not a chat turn).
    {
        const user = baseUser({ today: '2026-10-26' });
        user.workouts = pplHistory({ today: '2026-10-26', lifts: { 'Flat Barbell Bench Press': benchFlat(4) } });
        list.push({
            id: 'weekly-review', title: 'Monday weekly review',
            mode: 'weekly', question: 'Weekly review', user,
            expect: { kind: 'question', maxWords: 220, mustMention: ['185'], mustNotMention: ['\\bkg\\b'] },
        });
    }

    // 22 — AU-15: the unlabeled light week (action plan §8.2). Expected to
    // FAIL until AU-10(a) / AU-11 / AU-12 land — that's the point.
    {
        const user = lightWeekUser();
        const best = fourWeekBest();
        const floor = (name, key) => ({ exercise: key, min: Math.round(best[name] * 0.85) });
        list.push({
            id: 'light-week', title: 'Unlabeled light week — "I thought this was the deload"',
            mode: 'chat', question: 'I messed up and thought this week was a deload week — where do we go from here?', user,
            expect: {
                ...QUESTION, maxWords: 220,
                mustMention: ['(light|deload|dead load|easy)', 'High Row'],
                minWeight: [
                    floor('Smith Machine Bench Press', 'bench'), floor('Shoulder Press Machine', 'shoulder press'),
                    floor('Lat Pulldown', 'pulldown'), floor('Hack Squat', 'hack squat'),
                ],
                golden: 'No damage — you banked the deload a week early. Run week 6 as the peak on week 4\'s numbers (Shoulder Press 160×10, Hack Squat 115×6, Lat Pulldown on the High Row 320×5), hold Smith bench at 140 and chase 6, then Block IV with a planned deload.',
            },
        });
    }

    // 16 — open-ended week check-in.
    {
        const user = baseUser({ today: FRI });
        user.workouts = pplHistory({ today: FRI });
        list.push({
            id: 'week-check-in', title: '"How did my week go?"',
            mode: 'chat', question: 'How did my week go?', user,
            expect: { ...QUESTION },
        });
    }

    // 23 / 24 — TP-2 / A6: the Sunday report card (its own request; the model
    // writes two sentences and picks one of the card's options).
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        list.push({
            id: 'reportcard-good-week', title: 'Sunday card — a clean three-for-three week → stay',
            mode: 'reportcard', question: 'Sunday report card', user,
            expect: { kind: 'question', maxWords: 90, choice: 'stay' },
        });
    }
    {
        const user = baseUser({ today: '2026-10-25', settings: { trackRpe: true } });
        const rpe = (i) => [null, null, null, null, 7.5, 8.5, 9.5][i];
        user.workouts = pplHistory({
            today: '2026-10-25',
            lifts: { 'Flat Barbell Bench Press': benchFlat(4, 8, rpe) },
            extra: (date) => (date >= '2026-10-12' ? { readiness: { score: 2 } } : {}),
        });
        list.push({
            id: 'reportcard-effort-creeping', title: 'Sunday card — effort climbing, readiness low → lighter week',
            mode: 'reportcard', question: 'Sunday report card', user,
            expect: { kind: 'question', maxWords: 90, choice: 'lighter-week' },
        });
    }

    // 25 — TP-3: the wave ends tonight; the plan rolls the next weeks and the
    // card offers the accessory swaps it has waiting (rotationPolicy 'ask').
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        user.program = programOn('2026-10-25', { weeks: 4, deloadWeek: 4 });
        user.plan = { name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true }, horizonWeeks: 12, rotationPolicy: 'ask' };
        list.push({
            id: 'reportcard-wave-ending', title: 'Sunday card — the wave ends, the plan rolls, swaps are waiting',
            mode: 'reportcard', question: 'Sunday report card', user,
            expect: { kind: 'question', maxWords: 90, choice: 'rotate-accessories' },
        });
    }

    // 26–29 — TP-5: the planning conversation.
    const benchGoal = (over = {}) => ({
        id: 'goal_bench', type: 'lift', metric: 'estimatedMax', key: { exercise: 'Flat Barbell Bench Press' },
        unit: 'lbs', direction: 'up', target: 225, by: '2027-02-14', status: 'active',
        baseline: { value: 200, date: '2026-09-27' }, createdAt: '2026-09-27T12:00:00Z', ...over,
    });

    // 26 — the first plan, every intake answer in the message → build it, with the six parts.
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        user.goals = [benchGoal()];
        list.push({
            id: 'plan-first-goals', title: 'First plan: four days, 60 minutes, bench Monday, bench goal → build it',
            mode: 'chat', user,
            question: 'Build my plan: four days a week — Monday, Tuesday, Thursday, Saturday — about 60 minutes each. I always bench on Monday. Bench 225 by February is the goal.',
            expect: {
                kind: 'action', maxWords: 650, mustCall: ['create_program'], programRationale: true,
                mustMention: ['(build|lighter) week', '225'],
            },
        });
    }

    // 27 — peaking for a date six weeks out: peak weeks last, a lighter week before them.
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        user.events = [{ id: 'event_wedding', name: 'Wedding', date: '2026-12-05', kind: 'look', peakWeeks: 2, lighterBefore: true }];
        user.plan = { name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true }, horizonWeeks: 12, rotationPolicy: 'ask' };
        list.push({
            id: 'plan-event-peak', title: 'Wedding in six weeks → plan the six weeks to peak for it',
            mode: 'chat', user,
            question: 'Plan the next six weeks so I peak for the wedding — set it up.',
            expect: { kind: 'action', maxWords: 650, mustCall: ['create_program'], programShape: { peakLast: 2, lighterBefore: true }, programRationale: true },
        });
    }

    // 28 — the Sunday card with a goal behind: quote the goal, pick one valid option, write nothing.
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        user.goals = [benchGoal({ target: 400, by: '2026-12-31' })];
        list.push({
            id: 'reportcard-goal-behind', title: 'Sunday card — the bench goal is behind',
            mode: 'reportcard', question: 'Sunday report card', user,
            expect: { kind: 'question', maxWords: 90, mustMention: ['(bench|400)'] },
        });
    }

    // 29 — "I don't think in blocks": the answer describes one continuous plan and never says the word.
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        user.program = programOn('2026-10-25', { weeks: 4, deloadWeek: 4 });
        user.plan = { name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true }, horizonWeeks: 12, rotationPolicy: 'ask' };
        list.push({
            id: 'plan-no-blocks', title: '"I don\'t think in blocks" → one continuous plan, never the word',
            mode: 'chat', user,
            question: "Every few weeks it feels like we start over. I don't think in blocks — what's my plan from here?",
            expect: {
                ...QUESTION, maxWords: 220,
                mustNotMention: ['\\bblocks?\\b'],
                mustMention: ['(continu|next few weeks|keeps going|on its own|through)'],
            },
        });
    }

    // 30 — TP-6 f/g: "apply those recommendations" → the swaps are written
    // with the plan, and the answer only calls done what was applied.
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        user.program = programOn('2026-10-25', { weeks: 4, deloadWeek: 4 });
        user.plan = { name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true }, horizonWeeks: 12, rotationPolicy: 'ask' };
        list.push({
            id: 'plan-apply-swaps', title: 'Set up the next weeks with fresh accessories → swaps written, none claimed falsely',
            mode: 'chat', user,
            question: 'Set up my next few weeks — same sessions, but swap in fresh accessories where it makes sense. Go ahead and apply it.',
            expect: { kind: 'action', maxWords: 650, mustCall: ['create_program'], swapsTruthful: true },
        });
    }

    // 31 — TP-6 k: "it's not showing" → look it up before apologizing.
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        list.push({
            id: 'change-not-showing', title: '"The change isn\'t showing" → check with a look-up, don\'t confess',
            mode: 'chat', user,
            question: "You said you added Back Extension Machine to Leg day but I don't see it on my phone.",
            expect: {
                kind: 'question', maxWords: 160,
                mustCallAny: ['list_templates', 'get_plan'],
                mustMention: ['Back Extension'],
                mustNotMention: ["(I never|I didn't (actually )?(write|add|save|make)|that's on me)"],
            },
        });
    }

    // 32 — TP-8: "same exercises every week" → alternates inside the plan,
    // main lifts unchanged, the switch weeks named.
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        user.program = programOn('2026-10-25', { weeks: 4, deloadWeek: 4 });
        user.plan = { name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true }, horizonWeeks: 12, rotationPolicy: 'ask' };
        list.push({
            id: 'plan-variety', title: 'Same accessories every week → alternates inside the plan, main lifts kept',
            mode: 'chat', user,
            question: 'The same exercises show up every single week. Set up my next few weeks so a few accessories change up every couple of weeks but still hit the same muscles — keep my main lifts. Go ahead.',
            expect: {
                kind: 'action', maxWords: 650, mustCall: ['create_program'], alternates: true,
                mustMention: ['(every (2|two) weeks|every other week|weeks? \\d)'],
            },
        });
    }

    // 33 — TP-7: a gym with more than the app knows → candidates beyond the
    // library, the implement named, nothing refused for being unmapped.
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        list.push({
            id: 'richer-gym', title: 'A gym with more than the app knows → suggest beyond the mapped machines',
            mode: 'chat', user,
            question: "My gym has way more cables and machines than what's in the app. Give me a different face pull option for pull day — don't limit it to what I've mapped.",
            expect: {
                kind: 'question', maxWords: 220,
                mustCall: ['get_rotation_candidates'],
                mustNotMention: ["(isn't|not) (mapped|available|in your (library|equipment))", "can't (do|find) (that|it) (here|there)"],
            },
        });
    }

    // 34 — TP-7 c: a hotel weekend → a trip on the plan, the sessions kept, no workout rewritten.
    {
        const user = baseUser({ today: '2026-10-25' });
        user.workouts = pplHistory({ today: '2026-10-25' });
        user.plan = { name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true }, horizonWeeks: 12, rotationPolicy: 'ask' };
        list.push({
            id: 'hotel-weekend', title: 'Hotel gym this weekend → a trip on the plan, sessions kept, nothing rewritten',
            mode: 'chat', user,
            question: "I'm at the Bellagio next Saturday and Sunday (Oct 31 – Nov 1), just the hotel gym. Keep my plan going and put the trip on it.",
            expect: {
                kind: 'action', maxWords: 350, travelEvent: true,
                mustNotCall: ['create_workout_template', 'update_workout_template', 'replace_day', 'create_program'],
            },
        });
    }

    return list;
}

export { GYM, workoutDoc };
