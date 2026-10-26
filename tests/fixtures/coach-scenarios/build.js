// Coach eval scenario builders (AP-20b).
//
// Synthetic, anonymized users with the SAME document shapes the app writes
// (workouts with exerciseNames maps, templates with role/pattern, equipment
// with locations[] + exerciseTypes[], preferences/settings, weekPlan,
// programs, stats/personalRecords). A scenario = base history + overrides +
// a question. `seedDocs` turns a user into Firestore docs for the server
// tools; `chatMessages` / `liveMessages` build the first turn exactly the way
// the client does (coach-context-builder.js / coach-live.js), so the model
// sees what production would show it for this user.

import { buildChatContext } from '../../../js/core/features/coach-context-builder.js';
import { contextTurn } from '../../../js/core/features/coach-context.js';
import { buildLiveWorkoutContext } from '../../../js/core/features/coach-live-context.js';
import { buildExerciseSessions, progressionTarget, weightIncrement } from '../../../js/core/features/progression.js';
import { getSessionIntent, weekOverrideOf } from '../../../js/core/features/session-intent.js';
import { formatGoalsContext } from '../../../js/core/features/goal-progress.js';
import { buildPlanTimeline, formatPlanContext } from '../../../js/core/features/plan-timeline.js';
import EXERCISES from '../../../functions/data/exercises.json';

export const UID = 'u_eval';
export const GYM = 'Downtown Gym';
export const OTHER_GYM = 'Hotel Gym';

const DAY_INDEX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

export function addDays(date, n) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday on or before `date`. */
export function mondayOf(date) {
    const d = new Date(`${date}T12:00:00`);
    return addDays(date, -((d.getDay() + 6) % 7));
}

export function set(weight, reps, extra = {}) {
    return { weight, reps, originalUnit: 'lbs', type: 'working', completed: true, ...extra };
}

// ── Templates (ids double as week-plan values) ───────────────────────
export const TEMPLATES = {
    push: {
        id: 'push', name: 'Push day', category: 'Push', usageCount: 6,
        exercises: [
            { machine: 'Flat Barbell Bench Press', equipment: 'Flat Bench', sets: 3, defaultReps: 8, role: 'primary' },
            { machine: 'Incline Dumbbell Press', equipment: 'Dumbbells', sets: 3, defaultReps: 10 },
            { machine: 'Shoulder Press Machine', equipment: 'Hammer Strength Shoulder Press', sets: 3, defaultReps: 10 },
            { machine: 'Lateral Raise Machine', equipment: 'Life Fitness Lateral Raise', sets: 3, defaultReps: 12 },
            { machine: 'Triceps Pushdown', equipment: 'Cable Stack', sets: 3, defaultReps: 12 },
        ],
    },
    pull: {
        id: 'pull', name: 'Pull day', category: 'Pull', usageCount: 6,
        exercises: [
            { machine: 'Lat Pulldown', equipment: 'Life Fitness Lat Pulldown', sets: 3, defaultReps: 10, role: 'primary' },
            { machine: 'Seated Row Machine', equipment: 'Hammer Strength Seated Row', sets: 3, defaultReps: 10 },
            { machine: 'Barbell Bent-Over Row', equipment: 'Olympic Bar', sets: 3, defaultReps: 8 },
            { machine: 'Rope Face Pulls', equipment: 'Cable Stack', sets: 3, defaultReps: 15 },
            { machine: 'Barbell Curl', equipment: 'EZ Bar', sets: 3, defaultReps: 10 },
        ],
    },
    legs: {
        id: 'legs', name: 'Leg day', category: 'Legs', usageCount: 6,
        exercises: [
            { machine: 'Smith Machine Squat', equipment: 'Smith Machine', sets: 3, defaultReps: 8, role: 'primary' },
            { machine: 'Leg Press', equipment: 'Hammer Strength Leg Press', sets: 3, defaultReps: 10 },
            { machine: 'Seated Leg Curl Machine', equipment: 'Life Fitness Seated Leg Curl', sets: 3, defaultReps: 12 },
            { machine: 'Leg Extension', equipment: 'Life Fitness Leg Extension', sets: 3, defaultReps: 12 },
            { machine: 'Back Extension Machine', equipment: 'Back Extension Bench', sets: 3, defaultReps: 12 },
        ],
    },
};

// ── Equipment at the gym (used + never-used, like a real catalog) ─────
export const EQUIPMENT = [
    ['Flat Bench', 'Bench', ['Flat Barbell Bench Press'], true],
    ['Dumbbells', 'Free Weight', ['Incline Dumbbell Press', 'Dumbbell Shoulder Press'], true],
    ['Hammer Strength Shoulder Press', 'Plate-Loaded', ['Shoulder Press Machine'], true],
    ['Life Fitness Lateral Raise', 'Selectorized', ['Lateral Raise Machine'], true],
    ['Cable Stack', 'Cable', ['Triceps Pushdown', 'Rope Face Pulls', 'Cable Chest Fly'], true],
    ['Life Fitness Lat Pulldown', 'Selectorized', ['Lat Pulldown'], true],
    ['Hammer Strength Seated Row', 'Plate-Loaded', ['Seated Row Machine'], true],
    ['Olympic Bar', 'Barbell', ['Barbell Bent-Over Row', 'Barbell Romanian Deadlift'], true],
    ['EZ Bar', 'Barbell', ['Barbell Curl'], true],
    ['Smith Machine', 'Machine', ['Smith Machine Squat'], true],
    ['Hammer Strength Leg Press', 'Plate-Loaded', ['Leg Press'], true],
    ['Life Fitness Seated Leg Curl', 'Selectorized', ['Seated Leg Curl Machine'], true],
    ['Life Fitness Leg Extension', 'Selectorized', ['Leg Extension'], true],
    ['Back Extension Bench', 'Bench', ['Back Extension Machine'], true],
    // Never used — what a rotation should reach for.
    ['Chest-Supported T-Bar Row', 'Plate-Loaded', ['Chest-Supported T-Bar Row'], false],
    ['Assisted Pull-Up Machine', 'Selectorized', ['Assisted Pull-Up Machine'], false],
    ['Hip Thrust Machine', 'Plate-Loaded', ['Hip Thrust Machine'], false],
    ['Life Fitness Standing Leg Curl', 'Selectorized', ['Standing Leg Curl Machine'], false],
    ['Converging Chest Press', 'Plate-Loaded', ['Converging Chest Press'], false],
].map(([name, equipmentType, exerciseTypes, used], i) => ({
    id: `equipment_eval_${i}`, name, equipmentType, exerciseTypes,
    locations: [GYM], lastUsed: used ? '2026-10-20T18:00:00.000Z' : null,
}));

// Default load progression: base, +inc every 2 sessions, reps at target.
const BASE = {
    'Flat Barbell Bench Press': [165, 8, 5], 'Incline Dumbbell Press': [50, 10, 5],
    'Shoulder Press Machine': [90, 10, 10], 'Lateral Raise Machine': [50, 12, 10], 'Triceps Pushdown': [50, 12, 5],
    'Lat Pulldown': [130, 10, 10], 'Seated Row Machine': [140, 10, 10], 'Barbell Bent-Over Row': [135, 8, 10],
    'Rope Face Pulls': [40, 15, 5], 'Barbell Curl': [60, 10, 5],
    'Smith Machine Squat': [185, 8, 10], 'Leg Press': [270, 10, 20], 'Seated Leg Curl Machine': [90, 12, 10],
    'Leg Extension': [100, 12, 10], 'Back Extension Machine': [45, 12, 10],
};

function defaultSets(name, i) {
    const [w, r, inc] = BASE[name] || [50, 10, 5];
    const weight = w + Math.floor(i / 2) * inc;
    return [set(weight, r), set(weight, r), set(weight, Math.max(1, r - 1))];
}

/**
 * Mon/Wed/Fri push/pull/legs for `weeks` weeks ending before `today`.
 * `lifts[name](i, date)` overrides one exercise's sets on its i-th session
 * (0 = oldest); return null to skip the exercise that day.
 */
export function pplHistory({ today, weeks = 6, plan = { mon: 'push', wed: 'pull', fri: 'legs' }, lifts = {}, extra = () => ({}) }) {
    const start = addDays(mondayOf(today), -7 * weeks);
    const out = [];
    const count = {};
    for (let w = 0; w <= weeks; w++) {
        for (const [day, tid] of Object.entries(plan)) {
            const date = addDays(start, 7 * w + DAY_INDEX[day]);
            if (date >= today) continue;
            const tpl = TEMPLATES[tid];
            const exercises = [];
            for (const ex of tpl.exercises) {
                const i = count[ex.machine] = (count[ex.machine] ?? -1) + 1;
                const sets = lifts[ex.machine] ? lifts[ex.machine](i, date) : defaultSets(ex.machine, i);
                if (sets) exercises.push({ name: ex.machine, equipment: ex.equipment, sets });
            }
            out.push(workoutDoc({ date, template: tpl.name, exercises, ...extra(date, tid) }));
        }
    }
    return out;
}

export function workoutDoc({ date, template, exercises, location = GYM, sessionLabel = null, readiness = null, minutes = 55, completed = true }) {
    const exerciseNames = {};
    const exMap = {};
    exercises.forEach((ex, i) => {
        exerciseNames[`exercise_${i}`] = ex.name;
        exMap[`exercise_${i}`] = { equipment: ex.equipment || null, sets: ex.sets, ...(ex.notes ? { notes: ex.notes } : {}), completed: completed };
    });
    const startedAt = `${date}T17:00:00.000Z`;
    return {
        id: `${date}_eval_${template.replace(/\W+/g, '').toLowerCase()}`,
        workoutType: template, date, location,
        startedAt,
        completedAt: completed ? new Date(Date.parse(startedAt) + minutes * 60000).toISOString() : null,
        cancelledAt: null,
        totalDuration: minutes * 60,
        exerciseNames, exercises: exMap,
        ...(sessionLabel ? { sessionLabel } : {}),
        ...(readiness ? { readiness } : {}),
        version: '3.0',
    };
}

export const DEFAULT_SETTINGS = {
    weightUnit: 'lbs', weeklyGoal: 3, coachGoal: 'strength', profileExperience: 'intermediate',
    plateLbs: [45, 35, 25, 10, 5], plateKg: [20, 15, 10, 5, 2.5, 1.25], trackRpe: false,
};

/** A user = settings + history + templates + equipment + plan (+ program, memory). */
export function baseUser({ today, unit = 'lbs', settings = {}, ...rest }) {
    return {
        today,
        unit,
        settings: { ...DEFAULT_SETTINGS, weightUnit: unit, ...settings },
        templates: Object.values(TEMPLATES),
        equipment: EQUIPMENT,
        weekPlan: { days: { mon: 'push', wed: 'pull', fri: 'legs' }, restDays: ['tue', 'thu', 'sat', 'sun'] },
        locations: [{ id: 'location_eval_1', name: GYM, latitude: 40.7, longitude: -74.0 }],
        program: null,
        coachMemory: [],
        workouts: [],
        ...rest,
    };
}

/** Firestore docs for the server tools (users/{UID}/…). */
export function seedDocs(user, { live = null } = {}) {
    const U = `users/${UID}`;
    const docs = {
        [`${U}/preferences/settings`]: user.settings,
        [`${U}/preferences/weekPlan`]: user.weekPlan || { days: {}, restDays: [] },
        [`${U}/preferences/coachMemory`]: { facts: user.coachMemory || [] },
        [`${U}/stats/personalRecords`]: { exercisePRs: prsFrom(user.workouts) },
    };
    for (const t of user.templates) docs[`${U}/workoutTemplates/${t.id}`] = { ...t };
    for (const e of user.equipment) docs[`${U}/equipment/${e.id}`] = { ...e };
    for (const l of user.locations) docs[`${U}/locations/${l.id}`] = { ...l };
    for (const w of user.workouts) docs[`${U}/workouts/${w.id}`] = { ...w };
    if (user.program) docs[`${U}/programs/${user.program.id || 'program_eval'}`] = { ...user.program };
    // TP-1 — goals, events, weigh-ins and scans when a scenario has them.
    for (const g of user.goals || []) docs[`${U}/goals/${g.id}`] = { ...g };
    if (user.plan) docs[`${U}/plan/current`] = { ...user.plan };
    for (const e of user.events || []) docs[`${U}/events/${e.id}`] = { ...e };
    for (const m of user.measurements || []) docs[`${U}/measurements/${m.id || `${m.date}_m`}`] = { ...m };
    for (const d of user.dexa || []) docs[`${U}/dexa/${d.id || `scan_${d.date}`}`] = { ...d };
    if (live) docs[`${U}/workouts/${live.doc.id}`] = live.doc;
    return docs;
}

/** PR store in the shape pr-tracker writes: exercise → equipment → maxWeight. */
function prsFrom(workouts) {
    const out = {};
    for (const w of workouts) {
        for (const [key, ex] of Object.entries(w.exercises || {})) {
            const name = w.exerciseNames?.[key];
            if (!name) continue;
            for (const s of ex.sets || []) {
                if (!s.weight || s.type === 'warmup') continue;
                const equip = ex.equipment || 'Unknown Equipment';
                const cur = out[name]?.[equip]?.maxWeight;
                if (!cur || s.weight > cur.weight) {
                    out[name] = out[name] || {};
                    out[name][equip] = { equipmentName: equip, maxWeight: { weight: s.weight, reps: s.reps, date: w.date, unit: s.originalUnit || 'lbs' } };
                }
            }
        }
    }
    return out;
}

/** PR rows for the context block (pr-tracker getAllPRs shape). */
function prList(user) {
    const rows = [];
    for (const [exercise, byEquip] of Object.entries(prsFrom(user.workouts))) {
        for (const [equipment, prs] of Object.entries(byEquip)) rows.push({ exercise, equipment, prs });
    }
    return rows;
}

/** The chat coach's first turn, exactly as ai-coach-ui sends it. */
export function chatMessages(user, question) {
    const intent = getSessionIntent({ program: user.program, today: user.today, manualDeload: weekOverrideOf(user.settings) });
    const { context } = buildChatContext({
        today: user.today, workouts: user.workouts, templates: user.templates, weekPlan: user.weekPlan,
        program: user.program, intent, currentLocation: GYM, settings: user.settings, unit: user.unit,
        exerciseDatabase: EXERCISES, manualDeload: weekOverrideOf(user.settings), prList: prList(user),
        equipment: user.equipment,
        planBlock: user.plan ? formatPlanContext({
            plan: user.plan, weekPlan: user.weekPlan, templates: user.templates, today: user.today, events: user.events || [],
            timeline: buildPlanTimeline({ plan: user.plan, weekPlan: user.weekPlan, programs: user.program ? [user.program] : [], templates: user.templates, workouts: user.workouts, today: user.today, unit: user.unit }),
        }) : '',
        goalsBlock: formatGoalsContext({
            goals: user.goals || [], events: user.events || [],
            data: { workouts: user.workouts, templates: user.templates, measurements: user.measurements || [], dexa: user.dexa || [], today: user.today },
        }),
    });
    return [{ role: 'user', content: contextTurn(context, question, 'first') }];
}

/**
 * An in-progress session for live mode: the template's exercises with the
 * first `doneThrough` sets logged, plus the per-exercise verdict the client
 * attaches (`_progression`, `_lastSessionSets`). Returns the workout doc the
 * server tools see and the client-side state the live context is built from.
 */
export function liveSession(user, { templateId, current = 0, doneSets = {}, minutes = 20 }) {
    const tpl = TEMPLATES[templateId];
    const intent = getSessionIntent({ program: user.program, today: user.today, manualDeload: weekOverrideOf(user.settings) });
    const inc = weightIncrement(user.unit, user.unit === 'kg' ? user.settings.plateKg : user.settings.plateLbs);
    const exercises = tpl.exercises.map((ex, idx) => {
        const sessions = buildExerciseSessions(user.workouts, ex.machine, user.unit);
        const last = [...user.workouts].reverse().find(w => Object.values(w.exerciseNames || {}).includes(ex.machine));
        const lastKey = last && Object.keys(last.exerciseNames).find(k => last.exerciseNames[k] === ex.machine);
        return {
            ...ex, name: ex.machine,
            _progression: progressionTarget(sessions, user.unit, ex.defaultReps, inc, intent),
            _lastSessionSets: lastKey ? last.exercises[lastKey].sets : [],
            _lastSessionDaysAgo: last ? Math.round((Date.parse(user.today) - Date.parse(last.date)) / 86400000) : null,
            idx,
        };
    });
    const saved = {};
    exercises.forEach((ex, idx) => {
        // Exercises before `current` are finished (all planned sets logged).
        const sets = doneSets[idx] || (idx < current
            ? Array.from({ length: ex.sets || 3 }, () => set(ex._progression?.weight || 50, ex.defaultReps))
            : []);
        saved[`exercise_${idx}`] = { equipment: ex.equipment, sets };
    });
    const doc = {
        id: `${user.today}_eval_live`, workoutType: tpl.name, date: user.today, location: GYM,
        startedAt: `${user.today}T17:00:00.000Z`, completedAt: null, cancelledAt: null,
        exerciseNames: Object.fromEntries(exercises.map((ex, i) => [`exercise_${i}`, ex.machine])),
        exercises: saved, sessionIntent: intent, version: '3.0',
    };
    return {
        doc,
        currentWorkout: { name: tpl.name, exercises },
        savedData: { workoutType: tpl.name, location: GYM, exercises: saved, sessionIntent: intent },
        elapsedMinutes: minutes,
        intent,
    };
}

/** The live coach's first turn, exactly as coach-live.js sends it. */
export function liveMessages(user, live, question) {
    const ctx = buildLiveWorkoutContext({
        currentWorkout: live.currentWorkout,
        savedData: live.savedData,
        globalUnit: user.unit,
        equipment: user.equipment,
        elapsedMinutes: live.elapsedMinutes,
        plates: (user.unit === 'kg' ? user.settings.plateKg : user.settings.plateLbs) || null,
        sessionIntent: live.intent,
        injuries: user.settings.coachInjuries || '',
        exerciseUnits: {},
    });
    return [{ role: 'user', content: `Live workout state:\n${ctx}\n\nQuestion: ${question}` }];
}
