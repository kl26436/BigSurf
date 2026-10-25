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

import {
    baseUser, pplHistory, set, workoutDoc, liveSession, addDays, mondayOf, TEMPLATES, GYM,
} from './build.js';
import { buildExerciseSessions, progressionTarget, weightIncrement } from '../../../js/core/features/progression.js';

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

    return list;
}

export { GYM, workoutDoc };
