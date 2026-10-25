// Scenario 22 fixture (AU-15): the unlabeled light week. Synthetic, with the
// SHAPE of the 2026-10-25 trace (thread_1792962847643_4ezvg8): a 6-week
// program with no week targets, weeks 1–4 at normal load, week 5 trained at
// ~−35% because the user believed it was the deload — "Dead load week" in ONE
// exercise note per session, no sessionLabel — and the Lat Pulldown moved from
// a High Row (~320) to a Convergent machine (~90) in the same week, so AU-12's
// mixed-machine series is in here too. Today = the Sunday of week 5.

import { baseUser, set, workoutDoc, addDays, GYM } from './build.js';

export const LIGHT_TODAY = '2026-10-25';          // Sunday of week 5
export const LIGHT_START = '2026-09-21';          // Monday of week 1

const EQ = {
    smith: { id: 'eq_lw_smith', name: 'Smith Machine' },
    press: { id: 'eq_lw_press', name: 'Hammer Strength Shoulder Press' },
    highRow: { id: 'eq_lw_highrow', name: 'Newtech High Row' },
    panatta: { id: 'eq_lw_panatta', name: 'Panatta Convergent Lat Pulldown' },
    hack: { id: 'eq_lw_hack', name: 'Hack Squat' },
    curl: { id: 'eq_lw_curl', name: 'Life Fitness Seated Leg Curl' },
    hipExt: { id: 'eq_lw_hipext', name: 'DUAL 45 HIP EXTENSION' },
};

export const LIGHT_TEMPLATES = [
    {
        id: 'lw_upper', name: 'Upper — strength', category: 'Push',
        exercises: [
            { machine: 'Smith Machine Bench Press', equipment: EQ.smith.name, sets: 3, defaultReps: 6, role: 'primary' },
            { machine: 'Shoulder Press Machine', equipment: EQ.press.name, sets: 3, defaultReps: 10, role: 'primary' },
            { machine: 'Lat Pulldown', equipment: EQ.highRow.name, sets: 3, defaultReps: 5, role: 'primary' },
        ],
    },
    {
        id: 'lw_lower', name: 'Lower — strength', category: 'Legs',
        exercises: [
            { machine: 'Hack Squat', equipment: EQ.hack.name, sets: 3, defaultReps: 6, role: 'primary' },
            { machine: 'Seated Leg Curl Machine', equipment: EQ.curl.name, sets: 3, defaultReps: 10, role: 'primary' },
            { machine: 'Back Extension Machine', equipment: EQ.hipExt.name, sets: 3, defaultReps: 12, role: 'primary' },
        ],
    },
];

// Weeks 1–4 build; week 5 is the "dead load" week (≈ −35%, Panatta for lats).
const WEEKS = {
    'Smith Machine Bench Press': [[130, 6], [135, 6], [140, 5], [140, 5], [90, 6]],
    'Shoulder Press Machine': [[140, 10], [150, 10], [155, 10], [160, 10], [105, 10]],
    'Lat Pulldown': [[300, 5], [310, 5], [315, 5], [320, 5], [90, 10]],
    'Hack Squat': [[100, 6], [105, 6], [110, 6], [115, 6], [75, 6]],
    'Seated Leg Curl Machine': [[100, 10], [105, 10], [110, 10], [115, 10], [75, 10]],
    'Back Extension Machine': [[45, 12], [45, 12], [50, 12], [50, 12], [25, 12]],
};
const MACHINE = {
    'Smith Machine Bench Press': () => EQ.smith, 'Shoulder Press Machine': () => EQ.press,
    'Lat Pulldown': (week) => (week === 5 ? EQ.panatta : EQ.highRow),
    'Hack Squat': () => EQ.hack, 'Seated Leg Curl Machine': () => EQ.curl, 'Back Extension Machine': () => EQ.hipExt,
};
// One note per session, on the first exercise — as in the real log.
const NOTE = { lw_upper: 'Dead load week', lw_lower: 'Dead load week — going easy' };

export function lightWeekUser() {
    const workouts = [];
    for (let week = 1; week <= 5; week++) {
        for (const [tpl, dayOffset] of [[LIGHT_TEMPLATES[0], 0], [LIGHT_TEMPLATES[1], 3]]) {
            const date = addDays(LIGHT_START, 7 * (week - 1) + dayOffset);
            const exercises = tpl.exercises.map((ex, i) => {
                const [w, r] = WEEKS[ex.machine][week - 1];
                const m = MACHINE[ex.machine](week);
                return {
                    name: ex.machine, equipment: m.name, equipmentId: m.id,
                    sets: [set(w, r), set(w, r), set(w, Math.max(1, r - 1))],
                    ...(week === 5 && i === 0 ? { notes: NOTE[tpl.id] } : {}),
                };
            });
            const doc = workoutDoc({ date, template: tpl.name, exercises });
            // workoutDoc drops equipmentId; keep it, as the app writes it.
            exercises.forEach((ex, i) => { doc.exercises[`exercise_${i}`].equipmentId = ex.equipmentId; });
            workouts.push(doc);
        }
    }
    const user = baseUser({
        today: LIGHT_TODAY,
        program: {
            id: 'program_lw', name: 'Strength block III', goal: 'strength', active: true, state: 'active',
            weeks: 6, startDate: LIGHT_START, split: { mon: 'lw_upper', thu: 'lw_lower' },
            weekTargets: [], trustLevel: 'propose', createdAt: '2026-09-20',
        },
        templates: LIGHT_TEMPLATES,
        weekPlan: { days: { mon: 'lw_upper', thu: 'lw_lower' }, restDays: ['tue', 'wed', 'fri', 'sat', 'sun'] },
        equipment: Object.values(EQ).map(e => ({ ...e, exerciseTypes: [], locations: [GYM], lastUsed: '2026-10-23T18:00:00.000Z' })),
    });
    user.workouts = workouts;
    return user;
}

/** Each primary's best top weight over the 4 weeks before the light week, on its usual machine. */
export function fourWeekBest() {
    return Object.fromEntries(Object.entries(WEEKS).map(([name, rows]) => [name, Math.max(...rows.slice(0, 4).map(r => r[0]))]));
}
