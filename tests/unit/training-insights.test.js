// Tests for training insights / rules engine (Phase 17.9)
// Verifies volume analysis, plateau detection, deload suggestions, and context building

import { describe, it, expect } from 'vitest';

/**
 * Analyze weekly volume by body part (set counts, not weight×reps).
 * Excludes warmup sets.
 * @param {Array} workouts - Recent workouts with exercises
 * @param {Object} bodyPartMap - exercise name (lowercase) → body part
 * @returns {Object} { bodyPart: { sets: number, status: 'low'|'good'|'high' } }
 */
function analyzeWeeklyVolume(workouts, bodyPartMap = {}) {
    if (!workouts || workouts.length === 0) return {};

    const volume = {};

    for (const workout of workouts) {
        for (const key of Object.keys(workout.exercises || {})) {
            const ex = workout.exercises[key];
            if (!ex || !ex.sets) continue;

            const name = (ex.name || '').toLowerCase();
            const bodyPart = bodyPartMap[name] || 'Other';

            if (!volume[bodyPart]) volume[bodyPart] = { sets: 0 };

            for (const set of ex.sets) {
                // Exclude warmup sets
                if (set.type === 'warmup') continue;
                volume[bodyPart].sets++;
            }
        }
    }

    // Classify volume status
    for (const part of Object.keys(volume)) {
        const sets = volume[part].sets;
        if (sets <= 6) volume[part].status = 'low';
        else if (sets <= 20) volume[part].status = 'good';
        else volume[part].status = 'high';
    }

    return volume;
}

/**
 * Detect exercises where weight has plateaued over N sessions.
 * @param {Object} history - { exerciseName: [{date, maxWeight}] }
 * @param {number} minSessions - Minimum sessions to check (default 3)
 * @returns {Array<{exercise: string, weight: number, sessions: number}>}
 */
function detectPlateaus(history, minSessions = 3) {
    if (!history) return [];
    const plateaus = [];

    for (const [exercise, sessions] of Object.entries(history)) {
        if (sessions.length < minSessions) continue;

        const recent = sessions.slice(-minSessions);
        const weights = recent.map(s => s.maxWeight);

        // Check if all weights are the same (flat)
        if (weights.every(w => w === weights[0])) {
            plateaus.push({
                exercise,
                weight: weights[0],
                sessions: recent.length,
            });
        }
    }

    return plateaus;
}

/**
 * Check if a deload week is recommended based on training frequency.
 * Suggests deload after 4+ weeks of 5+ training days per week.
 * @param {Array<string>} dates - Workout dates (YYYY-MM-DD), sorted ascending
 * @returns {{ needed: boolean, consecutiveWeeks: number }}
 */
function checkDeloadNeeded(dates) {
    if (!dates || dates.length === 0) return { needed: false, consecutiveWeeks: 0 };

    // Group dates by ISO week
    function getWeekKey(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7);
        return `${d.getFullYear()}-W${weekNum}`;
    }

    const weekCounts = {};
    for (const date of dates) {
        const week = getWeekKey(date);
        if (!weekCounts[week]) weekCounts[week] = new Set();
        weekCounts[week].add(date);
    }

    // Count consecutive high-frequency weeks (5+ days)
    const weeks = Object.keys(weekCounts).sort();
    let consecutive = 0;
    let maxConsecutive = 0;

    for (const week of weeks) {
        if (weekCounts[week].size >= 5) {
            consecutive++;
            maxConsecutive = Math.max(maxConsecutive, consecutive);
        } else {
            consecutive = 0;
        }
    }

    return {
        needed: maxConsecutive >= 4,
        consecutiveWeeks: maxConsecutive,
    };
}

/**
 * Analyze training frequency: average sessions per body part per week.
 */
function analyzeFrequency(workouts, bodyPartMap = {}, weeks = 4) {
    if (!workouts || workouts.length === 0 || weeks <= 0) return {};

    const counts = {};
    for (const workout of workouts) {
        const bodyParts = new Set();
        for (const key of Object.keys(workout.exercises || {})) {
            const name = (workout.exercises[key]?.name || '').toLowerCase();
            const part = bodyPartMap[name] || 'Other';
            bodyParts.add(part);
        }
        for (const part of bodyParts) {
            counts[part] = (counts[part] || 0) + 1;
        }
    }

    const frequency = {};
    for (const [part, count] of Object.entries(counts)) {
        frequency[part] = Math.round((count / weeks) * 10) / 10;
    }
    return frequency;
}

/**
 * Build training context string for AI coach prompt.
 */
function buildTrainingContext(workouts, prs, preferences) {
    const sections = [];

    if (workouts && workouts.length > 0) {
        sections.push(`Recent workouts: ${workouts.length} sessions`);
    }

    if (prs && prs.length > 0) {
        sections.push(`Recent PRs: ${prs.map(p => `${p.exercise} ${p.weight}${p.unit}`).join(', ')}`);
    }

    if (preferences) {
        if (preferences.goal) sections.push(`Goal: ${preferences.goal}`);
        if (preferences.experience) sections.push(`Experience: ${preferences.experience}`);
    }

    return sections.join('\n');
}

// ===================================================================
// TESTS
// ===================================================================

describe('analyzeWeeklyVolume', () => {
    const bodyPartMap = { 'bench press': 'Chest', 'squat': 'Legs', 'curl': 'Arms' };

    it('correctly counts sets per body part, excludes warmup', () => {
        const workouts = [{
            exercises: {
                exercise_0: {
                    name: 'Bench Press',
                    sets: [
                        { weight: 45, reps: 10, type: 'warmup' },
                        { weight: 135, reps: 10 },
                        { weight: 155, reps: 8 },
                    ],
                },
            },
        }];
        const result = analyzeWeeklyVolume(workouts, bodyPartMap);
        expect(result.Chest.sets).toBe(2); // warmup excluded
    });

    it('classifies volume status correctly', () => {
        // 4 sets → low
        const low = [{ exercises: { e0: { name: 'Bench Press', sets: [{}, {}, {}, {}] } } }];
        expect(analyzeWeeklyVolume(low, bodyPartMap).Chest.status).toBe('low');

        // 14 sets → good
        const good = [{ exercises: { e0: { name: 'Bench Press', sets: Array(14).fill({}) } } }];
        expect(analyzeWeeklyVolume(good, bodyPartMap).Chest.status).toBe('good');

        // 25 sets → high
        const high = [{ exercises: { e0: { name: 'Bench Press', sets: Array(25).fill({}) } } }];
        expect(analyzeWeeklyVolume(high, bodyPartMap).Chest.status).toBe('high');
    });

    it('returns empty for no workouts', () => {
        expect(analyzeWeeklyVolume([])).toEqual({});
        expect(analyzeWeeklyVolume(null)).toEqual({});
    });
});

describe('detectPlateaus', () => {
    it('detects flat weight over 3 sessions', () => {
        const history = {
            'Bench Press': [
                { date: '2026-03-01', maxWeight: 185 },
                { date: '2026-03-08', maxWeight: 185 },
                { date: '2026-03-15', maxWeight: 185 },
            ],
        };
        const result = detectPlateaus(history, 3);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ exercise: 'Bench Press', weight: 185, sessions: 3 });
    });

    it('ignores exercises with fewer than minSessions', () => {
        const history = {
            'Squat': [
                { date: '2026-03-01', maxWeight: 225 },
                { date: '2026-03-08', maxWeight: 225 },
            ],
        };
        expect(detectPlateaus(history, 3)).toEqual([]);
    });

    it('does not flag exercises with weight changes', () => {
        const history = {
            'Deadlift': [
                { date: '2026-03-01', maxWeight: 315 },
                { date: '2026-03-08', maxWeight: 325 },
                { date: '2026-03-15', maxWeight: 335 },
            ],
        };
        expect(detectPlateaus(history, 3)).toEqual([]);
    });

    it('handles null input', () => {
        expect(detectPlateaus(null)).toEqual([]);
    });
});

describe('checkDeloadNeeded', () => {
    it('suggests deload after 4 weeks at 5+ days', () => {
        // 4 weeks of daily training (Mon-Fri each week)
        const dates = [];
        for (let week = 0; week < 4; week++) {
            for (let day = 0; day < 5; day++) {
                const d = new Date(2026, 2, 2 + week * 7 + day); // March 2026
                dates.push(d.toISOString().split('T')[0]);
            }
        }
        const result = checkDeloadNeeded(dates);
        expect(result.needed).toBe(true);
        expect(result.consecutiveWeeks).toBeGreaterThanOrEqual(4);
    });

    it('does not suggest deload for 3 weeks', () => {
        const dates = [];
        for (let week = 0; week < 3; week++) {
            for (let day = 0; day < 5; day++) {
                const d = new Date(2026, 2, 2 + week * 7 + day);
                dates.push(d.toISOString().split('T')[0]);
            }
        }
        const result = checkDeloadNeeded(dates);
        expect(result.needed).toBe(false);
    });

    it('handles empty/null input', () => {
        expect(checkDeloadNeeded([])).toEqual({ needed: false, consecutiveWeeks: 0 });
        expect(checkDeloadNeeded(null)).toEqual({ needed: false, consecutiveWeeks: 0 });
    });
});

describe('analyzeFrequency', () => {
    const bodyPartMap = { 'bench press': 'Chest', 'squat': 'Legs' };

    it('calculates correct average per body part per week', () => {
        const workouts = [
            { exercises: { e0: { name: 'Bench Press', sets: [] } } },
            { exercises: { e0: { name: 'Bench Press', sets: [] } } },
            { exercises: { e0: { name: 'Squat', sets: [] } } },
            { exercises: { e0: { name: 'Squat', sets: [] } } },
        ];
        const freq = analyzeFrequency(workouts, bodyPartMap, 4);
        expect(freq.Chest).toBe(0.5); // 2 sessions / 4 weeks
        expect(freq.Legs).toBe(0.5);
    });

    it('returns empty for no workouts', () => {
        expect(analyzeFrequency([], {}, 4)).toEqual({});
    });
});

describe('buildTrainingContext', () => {
    it('produces string with all sections', () => {
        const workouts = Array(10).fill({});
        const prs = [{ exercise: 'Bench', weight: 225, unit: 'lbs' }];
        const prefs = { goal: 'Hypertrophy', experience: 'Intermediate' };
        const context = buildTrainingContext(workouts, prs, prefs);
        expect(context).toContain('10 sessions');
        expect(context).toContain('Bench 225lbs');
        expect(context).toContain('Hypertrophy');
        expect(context).toContain('Intermediate');
    });

    it('handles empty workout history', () => {
        const context = buildTrainingContext([], [], null);
        expect(context).toBe('');
    });

    it('handles missing sections gracefully', () => {
        const context = buildTrainingContext([{}], null, { goal: 'Strength' });
        expect(context).toContain('1 sessions');
        expect(context).toContain('Strength');
        expect(context).not.toContain('PRs');
    });
});
