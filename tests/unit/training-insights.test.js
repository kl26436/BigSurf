// Tests for Training Insights rules engine (Phase 17)
// Imports the REAL module — training-insights.js is node-safe (AppState/Config/
// workout-helpers are pure; firebase-config is only loaded via dynamic import
// inside loadInsightsData, which these tests don't touch).

import { describe, it, expect } from 'vitest';
import {
    getBodyPartForExercise,
    analyzeWeeklyVolume,
    averageWeeklyVolume,
    detectPlateaus,
    getISOWeekKey,
    checkDeloadNeeded,
    analyzeFrequency,
    detectPositiveTrends,
    getTopInsights,
} from '../../js/core/features/training-insights.js';

// ===================================================================
// MOCK DATA HELPERS
// ===================================================================

const exerciseDb = [
    { name: 'Bench Press', bodyPart: 'Chest' },
    { name: 'Incline Dumbbell Press', bodyPart: 'Chest' },
    { name: 'Barbell Row', bodyPart: 'Back' },
    { name: 'Lat Pulldown', bodyPart: 'Back' },
    { name: 'Squat', bodyPart: 'Legs' },
    { name: 'Leg Press', bodyPart: 'Legs' },
    { name: 'Bicep Curl', bodyPart: 'Arms' },
    { name: 'Tricep Extension', bodyPart: 'Arms' },
    { name: 'Shoulder Press', bodyPart: 'Shoulders' },
    { name: 'Plank', bodyPart: 'Core' },
];

function makeWorkout(date, exercises) {
    return {
        date,
        completedAt: date + 'T12:00:00Z',
        exercises: Object.fromEntries(exercises.map((ex, i) => [`exercise_${i}`, ex])),
    };
}

function makeExercise(name, sets) {
    return {
        name,
        sets: sets.map(([reps, weight]) => ({
            reps,
            weight,
            completed: true,
            type: 'working',
        })),
    };
}

// ===================================================================
// TESTS
// ===================================================================

describe('getBodyPartForExercise', () => {
    it('finds body part from exercise database', () => {
        expect(getBodyPartForExercise('Bench Press', exerciseDb)).toBe('Chest');
        expect(getBodyPartForExercise('Barbell Row', exerciseDb)).toBe('Back');
    });

    it('falls back to keyword matching', () => {
        expect(getBodyPartForExercise('Chest Fly Machine', [])).toBe('Chest');
        expect(getBodyPartForExercise('Cable Row', [])).toBe('Back');
        expect(getBodyPartForExercise('Leg Extension', [])).toBe('Legs');
        expect(getBodyPartForExercise('Deadlift', [])).toBe('Back');
        // Keyword order: legs before the bare "press", lateral raise before "lat".
        expect(getBodyPartForExercise('Leg Press', [])).toBe('Legs');
        expect(getBodyPartForExercise('Lateral Raise Machine', [])).toBe('Shoulders');
        expect(getBodyPartForExercise('Overhead Press', [])).toBe('Shoulders');
    });

    it('returns null for unknown exercises', () => {
        expect(getBodyPartForExercise('Mystery Machine', [])).toBe(null);
        expect(getBodyPartForExercise(null, [])).toBe(null);
    });

    it('is case insensitive for database lookup', () => {
        expect(getBodyPartForExercise('bench press', exerciseDb)).toBe('Chest');
        expect(getBodyPartForExercise('BENCH PRESS', exerciseDb)).toBe('Chest');
    });
});

describe('analyzeWeeklyVolume', () => {
    it('counts working sets per body part', () => {
        const workouts = [
            makeWorkout('2026-04-07', [
                makeExercise('Bench Press', [[10, 135], [8, 155], [6, 175]]),
                makeExercise('Incline Dumbbell Press', [[12, 50], [10, 55]]),
            ]),
            makeWorkout('2026-04-09', [
                makeExercise('Bench Press', [[10, 135], [8, 155]]),
            ]),
        ];

        const result = analyzeWeeklyVolume(workouts, exerciseDb);
        const chest = result.find(r => r.bodyPart === 'Chest');

        expect(chest).toBeDefined();
        expect(chest.weeklySets).toBe(7);
        expect(chest.status).toBe('low');
    });

    it('excludes warmup sets from volume count', () => {
        const workouts = [
            makeWorkout('2026-04-07', [{
                name: 'Bench Press',
                sets: [
                    { reps: 10, weight: 95, type: 'warmup', completed: true },
                    { reps: 10, weight: 135, type: 'working', completed: true },
                    { reps: 8, weight: 155, type: 'working', completed: true },
                ],
            }]),
        ];

        const result = analyzeWeeklyVolume(workouts, exerciseDb);
        const chest = result.find(r => r.bodyPart === 'Chest');
        expect(chest.weeklySets).toBe(2);
    });

    it('marks high volume correctly', () => {
        const sets = Array(25).fill([10, 135]);
        const workouts = [makeWorkout('2026-04-07', [makeExercise('Bench Press', sets)])];

        const result = analyzeWeeklyVolume(workouts, exerciseDb);
        const chest = result.find(r => r.bodyPart === 'Chest');

        expect(chest.status).toBe('high');
        expect(chest.recommendation).toContain('reducing');
    });

    it('marks good volume correctly', () => {
        const sets = Array(12).fill([10, 135]);
        const workouts = [makeWorkout('2026-04-07', [makeExercise('Bench Press', sets)])];

        const result = analyzeWeeklyVolume(workouts, exerciseDb);
        const chest = result.find(r => r.bodyPart === 'Chest');

        expect(chest.status).toBe('good');
        expect(chest.recommendation).toBeNull();
    });

    it('returns empty array for empty workouts', () => {
        expect(analyzeWeeklyVolume([], exerciseDb)).toEqual([]);
    });
});

describe('AP-15a — weekly volume is a true per-week average', () => {
    // 12 chest sets every week for 4 weeks: the coach used to see the 4-week
    // SUM (48 → "high" vs MRV 22) labelled "weekly".
    const fourWeeks = ['2026-03-17', '2026-03-24', '2026-03-31', '2026-04-07'].map(d =>
        makeWorkout(d, [makeExercise('Bench Press', Array(12).fill([10, 135]))]));

    it('analyzeWeeklyVolume divides by weeks and keeps the total', () => {
        const chest = analyzeWeeklyVolume(fourWeeks, exerciseDb, { weeks: 4 }).find(r => r.bodyPart === 'Chest');
        expect(chest).toMatchObject({ totalSets: 48, weeks: 4, avgWeeklySets: 12, weeklySets: 12, status: 'good' });
    });

    it('default weeks = 1 keeps the one-week callers (dashboard, governor) unchanged', () => {
        const chest = analyzeWeeklyVolume(fourWeeks.slice(-1), exerciseDb).find(r => r.bodyPart === 'Chest');
        expect(chest).toMatchObject({ totalSets: 12, weeks: 1, weeklySets: 12 });
    });

    it('status + recommendation are judged on the average (fractional rounds to 0.1)', () => {
        const thin = [makeWorkout('2026-04-07', [makeExercise('Bench Press', Array(10).fill([10, 135]))])];
        const chest = analyzeWeeklyVolume(thin, exerciseDb, { weeks: 4 }).find(r => r.bodyPart === 'Chest');
        expect(chest.avgWeeklySets).toBe(2.5);
        expect(chest.status).toBe('low');
        expect(chest.recommendation).toBe('Add 6 more this week');
    });

    it('averageWeeklyVolume: last 28 days ÷ 4 when history predates the window', () => {
        const old = makeWorkout('2026-01-05', [makeExercise('Bench Press', Array(30).fill([10, 135]))]);
        const { weeks, volume } = averageWeeklyVolume([old, ...fourWeeks], exerciseDb, { today: '2026-04-10' });
        expect(weeks).toBe(4);
        expect(volume.find(r => r.bodyPart === 'Chest').avgWeeklySets).toBe(12); // January excluded
    });

    it('averageWeeklyVolume: a newer account divides by the weeks it actually has', () => {
        const recent = fourWeeks.slice(-2); // 03-31 and 04-07 only
        const { weeks, volume } = averageWeeklyVolume(recent, exerciseDb, { today: '2026-04-10' });
        expect(weeks).toBe(2); // 11 days covered → ceil(11/7)
        expect(volume.find(r => r.bodyPart === 'Chest').avgWeeklySets).toBe(12);
    });

    it('averageWeeklyVolume skips cancelled and future-dated workouts; empty → no rows', () => {
        const cancelled = { ...fourWeeks[3], cancelledAt: '2026-04-07T13:00:00Z' };
        const { volume } = averageWeeklyVolume([...fourWeeks.slice(0, 3), cancelled], exerciseDb, { today: '2026-04-10' });
        expect(volume.find(r => r.bodyPart === 'Chest').totalSets).toBe(36); // 3 kept × 12
        expect(averageWeeklyVolume([], exerciseDb, { today: '2026-04-10' }).volume).toEqual([]);
    });
});

describe('detectPlateaus', () => {
    it('detects flat weight across sessions', () => {
        const workouts = [
            makeWorkout('2026-04-01', [makeExercise('Bench Press', [[10, 185]])]),
            makeWorkout('2026-04-04', [makeExercise('Bench Press', [[10, 185]])]),
            makeWorkout('2026-04-07', [makeExercise('Bench Press', [[10, 185]])]),
        ];

        const result = detectPlateaus(workouts);
        expect(result).toHaveLength(1);
        expect(result[0].exercise).toBe('Bench Press');
        expect(result[0].weight).toBe(185);
    });

    it('does not flag exercise with increasing weight', () => {
        const workouts = [
            makeWorkout('2026-04-01', [makeExercise('Bench Press', [[10, 175]])]),
            makeWorkout('2026-04-04', [makeExercise('Bench Press', [[10, 180]])]),
            makeWorkout('2026-04-07', [makeExercise('Bench Press', [[10, 185]])]),
        ];

        expect(detectPlateaus(workouts)).toHaveLength(0);
    });

    it('does not flag exercise with increasing reps at same weight', () => {
        const workouts = [
            makeWorkout('2026-04-01', [makeExercise('Bench Press', [[8, 185]])]),
            makeWorkout('2026-04-04', [makeExercise('Bench Press', [[9, 185]])]),
            makeWorkout('2026-04-07', [makeExercise('Bench Press', [[10, 185]])]),
        ];

        expect(detectPlateaus(workouts)).toHaveLength(0);
    });

    it('requires minimum sessions to detect plateau', () => {
        const workouts = [
            makeWorkout('2026-04-01', [makeExercise('Bench Press', [[10, 185]])]),
            makeWorkout('2026-04-04', [makeExercise('Bench Press', [[10, 185]])]),
        ];

        expect(detectPlateaus(workouts)).toHaveLength(0);
    });

    it('ignores warmup sets for max weight', () => {
        const workouts = [
            makeWorkout('2026-04-01', [{
                name: 'Bench Press',
                sets: [
                    { reps: 10, weight: 95, type: 'warmup' },
                    { reps: 10, weight: 185, type: 'working' },
                ],
            }]),
            makeWorkout('2026-04-04', [{
                name: 'Bench Press',
                sets: [
                    { reps: 10, weight: 95, type: 'warmup' },
                    { reps: 10, weight: 185, type: 'working' },
                ],
            }]),
            makeWorkout('2026-04-07', [{
                name: 'Bench Press',
                sets: [
                    { reps: 10, weight: 95, type: 'warmup' },
                    { reps: 10, weight: 185, type: 'working' },
                ],
            }]),
        ];

        const result = detectPlateaus(workouts);
        expect(result).toHaveLength(1);
        expect(result[0].weight).toBe(185);
    });
});

describe('checkDeloadNeeded', () => {
    it('suggests deload after 4+ consecutive hard weeks', () => {
        const workouts = [];
        const startDate = new Date('2026-03-09'); // Monday

        for (let week = 0; week < 4; week++) {
            for (let day = 0; day < 5; day++) {
                const d = new Date(startDate);
                d.setDate(d.getDate() + week * 7 + day);
                const dateStr = d.toISOString().slice(0, 10);
                workouts.push({ date: dateStr });
            }
        }

        const result = checkDeloadNeeded(workouts);
        expect(result.needed).toBe(true);
        expect(result.consecutiveHardWeeks).toBeGreaterThanOrEqual(4);
    });

    it('does not suggest deload for light training', () => {
        const workouts = [];
        const startDate = new Date('2026-03-09');

        for (let week = 0; week < 4; week++) {
            for (let day = 0; day < 3; day++) {
                const d = new Date(startDate);
                d.setDate(d.getDate() + week * 7 + day);
                workouts.push({ date: d.toISOString().slice(0, 10) });
            }
        }

        const result = checkDeloadNeeded(workouts);
        expect(result.needed).toBe(false);
        expect(result.consecutiveHardWeeks).toBe(0);
    });

    it('returns null for empty input', () => {
        expect(checkDeloadNeeded([])).toBeNull();
        expect(checkDeloadNeeded(null)).toBeNull();
    });

    // CP-0 — recovery detection. Build N weeks of 5-day training with a
    // per-week tonnage scale so load can be pulled back without changing
    // frequency (the exact case the day-count rule was blind to).
    function weeksOfTraining(scales, { labelWeek = null, label = 'Deload' } = {}) {
        const workouts = [];
        const startDate = new Date('2026-03-09T12:00:00'); // Monday
        scales.forEach((scale, week) => {
            for (let day = 0; day < 5; day++) {
                const d = new Date(startDate);
                d.setDate(d.getDate() + week * 7 + day);
                const w = makeWorkout(d.toISOString().slice(0, 10), [
                    makeExercise('Bench Press', [[10, 200 * scale], [10, 200 * scale], [10, 200 * scale]]),
                    makeExercise('Squat', [[8, 300 * scale], [8, 300 * scale]]),
                ]);
                if (labelWeek === week) w.sessionLabel = label;
                workouts.push(w);
            }
        });
        return workouts;
    }

    it('a labelled deload week at full frequency resets the counter', () => {
        const result = checkDeloadNeeded(weeksOfTraining([1, 1, 1, 1, 1], { labelWeek: 4 }));
        expect(result.needed).toBe(false);
        expect(result.consecutiveHardWeeks).toBe(0);
        expect(result.inRecoveryWeek).toBe(true);
    });

    it('a full-frequency week 35% lighter than the trailing mean is a recovery week', () => {
        const result = checkDeloadNeeded(weeksOfTraining([1, 1, 1, 1, 0.65]));
        expect(result.needed).toBe(false);
        expect(result.inRecoveryWeek).toBe(true);
    });

    it('five equal hard weeks still fire the deload insight', () => {
        const result = checkDeloadNeeded(weeksOfTraining([1, 1, 1, 1, 1]));
        expect(result.needed).toBe(true);
        expect(result.consecutiveHardWeeks).toBe(5);
        expect(result.inRecoveryWeek).toBe(false);
    });

    it('an older recovery week only counts the hard weeks after it', () => {
        const result = checkDeloadNeeded(weeksOfTraining([1, 1, 1, 1, 1, 1], { labelWeek: 3, label: 'Recovery week' }));
        expect(result.consecutiveHardWeeks).toBe(2);
        expect(result.needed).toBe(false);
        expect(result.inRecoveryWeek).toBe(false);
    });

    it('a normal progression week (slightly heavier) is never mistaken for recovery', () => {
        const result = checkDeloadNeeded(weeksOfTraining([1, 1.02, 1.04, 1.06, 1.08]));
        expect(result.needed).toBe(true);
        expect(result.inRecoveryWeek).toBe(false);
    });

    it('kg-logged sessions are normalized before the tonnage comparison', () => {
        const workouts = weeksOfTraining([1, 1, 1, 1, 1]);
        // Re-log the final week in kg at the same real load (200 lbs ≈ 90.7 kg).
        for (const w of workouts.slice(-5)) {
            for (const ex of Object.values(w.exercises)) {
                for (const s of ex.sets) { s.weight = Math.round(s.weight * 0.453592 * 10) / 10; s.originalUnit = 'kg'; }
            }
        }
        const result = checkDeloadNeeded(workouts);
        expect(result.inRecoveryWeek).toBe(false);
        expect(result.consecutiveHardWeeks).toBe(5);
    });
});

describe('analyzeFrequency', () => {
    it('calculates average frequency per body part', () => {
        const workouts = [
            makeWorkout('2026-04-01', [makeExercise('Bench Press', [[10, 135]])]),
            makeWorkout('2026-04-03', [makeExercise('Bench Press', [[10, 135]])]),
            makeWorkout('2026-04-08', [makeExercise('Bench Press', [[10, 135]])]),
            makeWorkout('2026-04-10', [makeExercise('Bench Press', [[10, 135]])]),
        ];

        const result = analyzeFrequency(workouts, exerciseDb, 2);
        const chest = result.find(r => r.bodyPart === 'Chest');

        expect(chest).toBeDefined();
        expect(chest.avgPerWeek).toBe(2);
        expect(chest.status).toBe('good');
    });

    it('flags low frequency', () => {
        const workouts = [
            makeWorkout('2026-04-01', [makeExercise('Bench Press', [[10, 135]])]),
        ];

        const result = analyzeFrequency(workouts, exerciseDb, 4);
        const chest = result.find(r => r.bodyPart === 'Chest');

        expect(chest.avgPerWeek).toBe(0.3);
        expect(chest.status).toBe('low');
    });
});

describe('detectPositiveTrends', () => {
    it('detects exercises with weight increases', () => {
        const workouts = [
            makeWorkout('2026-03-01', [makeExercise('Bench Press', [[10, 155]])]),
            makeWorkout('2026-03-08', [makeExercise('Bench Press', [[10, 165]])]),
            makeWorkout('2026-03-15', [makeExercise('Bench Press', [[10, 175]])]),
        ];

        const result = detectPositiveTrends(workouts);
        expect(result).toHaveLength(1);
        expect(result[0].exercise).toBe('Bench Press');
        expect(result[0].gain).toBe(20);
    });

    it('does not flag exercises with no gain', () => {
        const workouts = [
            makeWorkout('2026-03-01', [makeExercise('Bench Press', [[10, 185]])]),
            makeWorkout('2026-03-08', [makeExercise('Bench Press', [[10, 185]])]),
            makeWorkout('2026-03-15', [makeExercise('Bench Press', [[10, 185]])]),
        ];

        expect(detectPositiveTrends(workouts)).toHaveLength(0);
    });

    it('requires at least 3 sessions', () => {
        const workouts = [
            makeWorkout('2026-03-01', [makeExercise('Bench Press', [[10, 155]])]),
            makeWorkout('2026-03-08', [makeExercise('Bench Press', [[10, 175]])]),
        ];

        expect(detectPositiveTrends(workouts)).toHaveLength(0);
    });

    it('returns top 3 sorted by gain', () => {
        const workouts = [
            makeWorkout('2026-03-01', [
                makeExercise('Bench Press', [[10, 135]]),
                makeExercise('Squat', [[10, 200]]),
                makeExercise('Barbell Row', [[10, 100]]),
                makeExercise('Shoulder Press', [[10, 80]]),
            ]),
            makeWorkout('2026-03-08', [
                makeExercise('Bench Press', [[10, 145]]),
                makeExercise('Squat', [[10, 230]]),
                makeExercise('Barbell Row', [[10, 120]]),
                makeExercise('Shoulder Press', [[10, 85]]),
            ]),
            makeWorkout('2026-03-15', [
                makeExercise('Bench Press', [[10, 155]]),
                makeExercise('Squat', [[10, 260]]),
                makeExercise('Barbell Row', [[10, 140]]),
                makeExercise('Shoulder Press', [[10, 90]]),
            ]),
        ];

        const result = detectPositiveTrends(workouts);
        expect(result).toHaveLength(3);
        expect(result[0].exercise).toBe('Squat');    // +60
        expect(result[1].exercise).toBe('Barbell Row'); // +40
        expect(result[2].exercise).toBe('Bench Press'); // +20
    });
});

describe('getTopInsights', () => {
    it('returns empty array when not enough workouts', () => {
        const result = getTopInsights([{ date: '2026-04-01' }], [], exerciseDb);
        expect(result).toEqual([]);
    });

    it('returns empty array for null input', () => {
        expect(getTopInsights(null, [], exerciseDb)).toEqual([]);
    });

    it('produces insights from sufficient data', () => {
        const recentWorkouts = [
            makeWorkout('2026-04-07', [makeExercise('Bench Press', [[10, 185]])]),
            makeWorkout('2026-04-08', [makeExercise('Squat', [[10, 225]])]),
            makeWorkout('2026-04-09', [makeExercise('Barbell Row', [[10, 135]])]),
        ];

        const allWorkouts = [...recentWorkouts,
            makeWorkout('2026-03-25', [makeExercise('Bench Press', [[10, 175]])]),
            makeWorkout('2026-03-18', [makeExercise('Bench Press', [[10, 165]])]),
        ];

        const result = getTopInsights(recentWorkouts, allWorkouts, exerciseDb);
        expect(result.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThanOrEqual(3);
    });

    it('prioritizes warnings over info over success', () => {
        const recentWorkouts = [
            makeWorkout('2026-04-07', [makeExercise('Bench Press', [[10, 185]])]),
            makeWorkout('2026-04-08', [makeExercise('Bench Press', [[10, 185]])]),
            makeWorkout('2026-04-09', [makeExercise('Bench Press', [[10, 185]])]),
        ];

        const result = getTopInsights(recentWorkouts, recentWorkouts, exerciseDb);

        for (let i = 1; i < result.length; i++) {
            const order = { warning: 0, info: 1, success: 2 };
            expect(order[result[i].severity]).toBeGreaterThanOrEqual(order[result[i - 1].severity]);
        }
    });

    it('caps at 3 insights', () => {
        const recentWorkouts = [
            makeWorkout('2026-04-07', [
                makeExercise('Bench Press', [[10, 185]]),
                makeExercise('Squat', [[10, 225]]),
                makeExercise('Barbell Row', [[10, 135]]),
                makeExercise('Shoulder Press', [[10, 100]]),
                makeExercise('Bicep Curl', [[10, 40]]),
            ]),
            makeWorkout('2026-04-08', [
                makeExercise('Bench Press', [[10, 185]]),
                makeExercise('Squat', [[10, 225]]),
            ]),
            makeWorkout('2026-04-09', [
                makeExercise('Bench Press', [[10, 185]]),
                makeExercise('Barbell Row', [[10, 145]]),
            ]),
        ];

        const result = getTopInsights(recentWorkouts, recentWorkouts, exerciseDb);
        expect(result.length).toBeLessThanOrEqual(3);
    });
});

describe('getISOWeekKey', () => {
    it('produces consistent week keys for same week', () => {
        const monday = getISOWeekKey('2026-04-06');
        const friday = getISOWeekKey('2026-04-10');
        const sunday = getISOWeekKey('2026-04-12');

        expect(monday).toBe(friday);
        expect(monday).toBe(sunday);
    });

    it('distinguishes different weeks', () => {
        const week1 = getISOWeekKey('2026-04-06');
        const week2 = getISOWeekKey('2026-04-13');

        expect(week1).not.toBe(week2);
    });
});

// AP-8 — one plateau definition (progression.js stall ladder) and no
// "add weight" insights in a deload.
describe('AP-8 — plateau = stall ladder', () => {
    const flat = (label) => [
        makeWorkout('2026-04-01', [makeExercise('Bench Press', [[8, 185]])]),
        makeWorkout('2026-04-04', [makeExercise('Bench Press', [[8, 185]])]),
        makeWorkout('2026-04-07', [makeExercise('Bench Press', [[8, 185]])]),
        ...(label ? [{ ...makeWorkout('2026-04-10', [makeExercise('Bench Press', [[8, 120]])]), sessionLabel: label }] : []),
    ];

    it('rung 1 advice holds the weight — never "add 5 lbs"', () => {
        const [p] = detectPlateaus(flat());
        expect(p).toMatchObject({ exercise: 'Bench Press', weight: 185, sessions: 3, rung: 1 });
        expect(p.suggestion).toMatch(/^Hold 185 lbs and chase 9 reps$/);
        expect(p.suggestion).not.toMatch(/add/i);
    });

    it('a deload session does not break or extend the run', () => {
        expect(detectPlateaus(flat('Deload'))[0]).toMatchObject({ weight: 185, sessions: 3 });
    });

    it('getTopInsights drops plateau and deload-needed insights during a deload', async () => {
        const { getTopInsights } = await import('../../js/core/features/training-insights.js');
        const workouts = flat();
        const plain = getTopInsights(workouts, workouts, []);
        expect(plain.some(i => i.type === 'plateau')).toBe(true);
        const muted = getTopInsights(workouts, workouts, [], { intent: { mode: 'deload' } });
        expect(muted.some(i => i.type === 'plateau' || i.type === 'deload')).toBe(false);
    });
});
