// Tests for Training Insights rules engine (Phase 17)
// Re-implements pure functions for isolation (no Firebase/DOM dependencies)
// Same pattern as other unit tests in this project

import { describe, it, expect } from 'vitest';

// ===================================================================
// RE-IMPLEMENTED FUNCTIONS (from training-insights.js)
// ===================================================================

const Config = {
    VOLUME_MEV: 8,
    VOLUME_MRV: 22,
    PLATEAU_MIN_SESSIONS: 3,
    DELOAD_DAYS_PER_WEEK: 5,
    DELOAD_CONSECUTIVE_WEEKS: 4,
    INSIGHTS_MIN_WORKOUTS: 3,
};

function getBodyPartForExercise(exerciseName, exerciseDatabase) {
    if (!exerciseName) return null;

    if (exerciseDatabase && exerciseDatabase.length > 0) {
        const match = exerciseDatabase.find(
            ex => (ex.name || ex.machine || '').toLowerCase() === exerciseName.toLowerCase()
        );
        if (match && match.bodyPart) return match.bodyPart;
    }

    const name = exerciseName.toLowerCase();
    if (name.includes('bench') || name.includes('chest') || name.includes('fly') || name.includes('pec')) return 'Chest';
    if (name.includes('row') || name.includes('pull') || name.includes('lat') || name.includes('back')) return 'Back';
    if (name.includes('shoulder') || name.includes('press') || name.includes('delt') || name.includes('lateral raise')) return 'Shoulders';
    if (name.includes('squat') || name.includes('leg') || name.includes('lunge') || name.includes('hamstring') || name.includes('quad') || name.includes('calf')) return 'Legs';
    if (name.includes('bicep') || name.includes('curl') || name.includes('tricep') || name.includes('arm') || name.includes('extension')) return 'Arms';
    if (name.includes('core') || name.includes('ab') || name.includes('crunch') || name.includes('plank')) return 'Core';
    if (name.includes('deadlift')) return 'Back';
    if (name.includes('glute') || name.includes('hip thrust')) return 'Glutes';

    return null;
}

function analyzeWeeklyVolume(workouts, exerciseDatabase) {
    const volumeByPart = {};

    for (const workout of workouts) {
        if (!workout.exercises) continue;

        for (const exercise of Object.values(workout.exercises)) {
            const bodyPart = exercise.bodyPart || getBodyPartForExercise(exercise.name, exerciseDatabase);
            if (!bodyPart) continue;

            const completedSets = (exercise.sets || []).filter(s =>
                s.completed !== false && (s.type || 'working') !== 'warmup'
            ).length;

            volumeByPart[bodyPart] = (volumeByPart[bodyPart] || 0) + completedSets;
        }
    }

    return Object.entries(volumeByPart).map(([part, sets]) => ({
        bodyPart: part,
        weeklySets: sets,
        status: sets < Config.VOLUME_MEV ? 'low' : sets > Config.VOLUME_MRV ? 'high' : 'good',
        recommendation: sets < Config.VOLUME_MEV
            ? `Add ${Config.VOLUME_MEV - sets} more sets of ${part} this week`
            : sets > Config.VOLUME_MRV
                ? `Consider reducing ${part} volume to aid recovery`
                : null,
    }));
}

function detectPlateaus(workouts, minSessions = Config.PLATEAU_MIN_SESSIONS) {
    const exerciseHistory = {};

    for (const workout of workouts) {
        if (!workout.exercises || !workout.date) continue;

        for (const exercise of Object.values(workout.exercises)) {
            const name = exercise.name;
            if (!name) continue;

            const workingSets = (exercise.sets || []).filter(s =>
                s.completed !== false && s.weight && (s.type || 'working') !== 'warmup'
            );
            if (workingSets.length === 0) continue;

            if (!exerciseHistory[name]) exerciseHistory[name] = [];
            exerciseHistory[name].push({
                date: workout.date,
                maxWeight: Math.max(...workingSets.map(s => s.weight)),
                maxReps: Math.max(...workingSets.map(s => s.reps || 0)),
                equipment: exercise.equipment,
            });
        }
    }

    const plateaus = [];

    for (const [exerciseName, sessions] of Object.entries(exerciseHistory)) {
        sessions.sort((a, b) => b.date.localeCompare(a.date));

        if (sessions.length < minSessions) continue;

        const recent = sessions.slice(0, minSessions);
        const maxWeights = recent.map(s => s.maxWeight);
        const isFlat = maxWeights.every(w => w === maxWeights[0]);

        if (isFlat && maxWeights[0] > 0) {
            const maxReps = recent.map(s => s.maxReps);
            const repsIncreasing = maxReps[0] > maxReps[maxReps.length - 1];

            if (!repsIncreasing) {
                plateaus.push({
                    exercise: exerciseName,
                    weight: maxWeights[0],
                    sessions: minSessions,
                    equipment: recent[0].equipment,
                    suggestion: 'Try adding 5 lbs or an extra rep per set',
                });
            }
        }
    }

    return plateaus;
}

function getISOWeekKey(dateStr) {
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const temp = new Date(d.valueOf());
    const dayNum = (d.getDay() + 6) % 7;
    temp.setDate(temp.getDate() - dayNum + 3);
    const firstThursday = temp.valueOf();
    temp.setMonth(0, 1);
    if (temp.getDay() !== 4) {
        temp.setMonth(0, 1 + ((4 - temp.getDay()) + 7) % 7);
    }
    const weekNum = 1 + Math.ceil((firstThursday - temp) / 604800000);
    return `${temp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function checkDeloadNeeded(workouts) {
    if (!workouts || workouts.length === 0) return null;

    const weekMap = {};

    for (const workout of workouts) {
        if (!workout.date) continue;
        const weekKey = getISOWeekKey(workout.date);
        if (!weekMap[weekKey]) weekMap[weekKey] = new Set();
        weekMap[weekKey].add(workout.date);
    }

    const sortedWeeks = Object.entries(weekMap)
        .sort((a, b) => b[0].localeCompare(a[0]));

    let consecutiveHardWeeks = 0;
    for (const [, days] of sortedWeeks) {
        if (days.size >= Config.DELOAD_DAYS_PER_WEEK) {
            consecutiveHardWeeks++;
        } else {
            break;
        }
    }

    return {
        needed: consecutiveHardWeeks >= Config.DELOAD_CONSECUTIVE_WEEKS,
        consecutiveHardWeeks,
    };
}

function analyzeFrequency(workouts, exerciseDatabase, weeks = 4) {
    const bodyPartWeeks = {};

    for (const workout of workouts) {
        if (!workout.exercises || !workout.date) continue;
        const weekKey = getISOWeekKey(workout.date);

        for (const exercise of Object.values(workout.exercises)) {
            const bodyPart = exercise.bodyPart || getBodyPartForExercise(exercise.name, exerciseDatabase);
            if (!bodyPart) continue;

            if (!bodyPartWeeks[bodyPart]) bodyPartWeeks[bodyPart] = {};
            if (!bodyPartWeeks[bodyPart][weekKey]) bodyPartWeeks[bodyPart][weekKey] = 0;
            bodyPartWeeks[bodyPart][weekKey]++;
        }
    }

    return Object.entries(bodyPartWeeks).map(([part, weekData]) => {
        const totalSessions = Object.values(weekData).reduce((sum, c) => sum + c, 0);
        const avgPerWeek = weeks > 0 ? totalSessions / weeks : 0;

        return {
            bodyPart: part,
            avgPerWeek: Math.round(avgPerWeek * 10) / 10,
            status: avgPerWeek < 1 ? 'low' : avgPerWeek > 4 ? 'high' : 'good',
            recommendation: avgPerWeek < 1
                ? `Train ${part} at least 1-2x per week for growth`
                : avgPerWeek > 4
                    ? `${part} is being hit ${avgPerWeek.toFixed(1)}x/week — consider consolidating`
                    : null,
        };
    });
}

function detectPositiveTrends(workouts) {
    const exerciseHistory = {};

    for (const workout of workouts) {
        if (!workout.exercises || !workout.date) continue;

        for (const exercise of Object.values(workout.exercises)) {
            const name = exercise.name;
            if (!name) continue;

            const workingSets = (exercise.sets || []).filter(s =>
                s.completed !== false && s.weight && (s.type || 'working') !== 'warmup'
            );
            if (workingSets.length === 0) continue;

            if (!exerciseHistory[name]) exerciseHistory[name] = [];
            exerciseHistory[name].push({
                date: workout.date,
                maxWeight: Math.max(...workingSets.map(s => s.weight)),
            });
        }
    }

    const trends = [];

    for (const [exerciseName, sessions] of Object.entries(exerciseHistory)) {
        if (sessions.length < 3) continue;
        sessions.sort((a, b) => a.date.localeCompare(b.date));

        const oldest = sessions[0].maxWeight;
        const newest = sessions[sessions.length - 1].maxWeight;
        const gain = newest - oldest;

        if (gain > 0 && oldest > 0) {
            trends.push({
                exercise: exerciseName,
                gain,
                from: oldest,
                to: newest,
                sessions: sessions.length,
            });
        }
    }

    trends.sort((a, b) => b.gain - a.gain);
    return trends.slice(0, 3);
}

function getTopInsights(recentWorkouts, allWorkouts, exerciseDatabase) {
    const insights = [];

    if (!recentWorkouts || recentWorkouts.length < Config.INSIGHTS_MIN_WORKOUTS) {
        return insights;
    }

    const deload = checkDeloadNeeded(allWorkouts);
    if (deload && deload.needed) {
        insights.push({
            type: 'deload',
            severity: 'warning',
            icon: 'fa-bed',
            message: `You've trained hard for ${deload.consecutiveHardWeeks} weeks straight. Consider a deload week.`,
        });
    }

    const volume = analyzeWeeklyVolume(recentWorkouts, exerciseDatabase);
    const lowVolume = volume.filter(v => v.status === 'low');
    const highVolume = volume.filter(v => v.status === 'high');

    if (highVolume.length > 0) {
        insights.push({ type: 'volume-high', severity: 'warning', icon: 'fa-exclamation-triangle', message: 'Volume too high.' });
    }

    if (lowVolume.length > 0) {
        insights.push({ type: 'volume-low', severity: 'info', icon: 'fa-chart-bar', message: `${lowVolume[0].bodyPart} volume is low.` });
    }

    const plateaus = detectPlateaus(allWorkouts);
    if (plateaus.length > 0) {
        insights.push({ type: 'plateau', severity: 'info', icon: 'fa-equals', message: `${plateaus[0].exercise} plateaued.` });
    }

    const trends = detectPositiveTrends(allWorkouts);
    if (trends.length > 0) {
        insights.push({ type: 'trend', severity: 'success', icon: 'fa-arrow-trend-up', message: `${trends[0].exercise} is up.` });
    }

    const severityOrder = { warning: 0, info: 1, success: 2 };
    insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return insights.slice(0, 3);
}

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
