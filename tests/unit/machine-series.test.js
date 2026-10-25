// AU-12 — one lift on two machines is two series. Shared same-machine rule
// (progression.js#sameMachine, also prefill's), machine-keyed verdicts and
// scoreboard primaries, and the "mixed machines" note when keying can't apply.

import { describe, it, expect } from 'vitest';
import { buildExerciseSessions, sameMachine, machineKey } from '../../js/core/features/progression.js';
import { computeVerdicts, formatVerdictsContext } from '../../js/core/features/coach-rules.js';
import { buildScoreboard } from '../../js/core/features/progress-scoreboard.js';
import { machineSwitchUser } from '../fixtures/coach-scenarios/light-week.js';

const set = (weight, reps) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true });
const wo = (date, equipment, equipmentId, weight, reps) => ({
    date, completedAt: `${date}T18:00:00Z`, workoutType: 'Upper',
    exerciseNames: { exercise_0: 'Lat Pulldown' },
    exercises: { exercise_0: { equipment, ...(equipmentId ? { equipmentId } : {}), sets: [set(weight, reps)] } },
});
const log = [
    wo('2026-10-05', 'Newtech High Row', 'eq_hr', 310, 5),
    wo('2026-10-12', 'Newtech High Row', 'eq_hr', 320, 5),
    wo('2026-10-19', 'Panatta Convergent Lat Pulldown', 'eq_pa', 90, 10),
];

describe('same machine (one rule)', () => {
    it('id first, then the name key; unknown matches anything', () => {
        expect(sameMachine('High Row', 'eq_hr', { equipment: 'Renamed', equipmentId: 'eq_hr' })).toBe(true);
        expect(sameMachine('Newtech  High-Row', null, { equipment: 'newtech high row' })).toBe(true);
        expect(sameMachine('High Row', null, { equipment: 'Panatta' })).toBe(false);
        expect(sameMachine(null, null, { equipment: 'Panatta' })).toBe(true);
        expect(sameMachine('High Row', null, { equipment: null })).toBe(true);
        expect(machineKey('Hammer-Strength  Row')).toBe('hammer strength row');
    });
});

describe('machine-keyed series (AU-12)', () => {
    it('two machines → two series; unfiltered is flagged mixed', () => {
        const hr = buildExerciseSessions(log, 'Lat Pulldown', 'lbs', { machine: { name: 'Newtech High Row', id: 'eq_hr' } });
        expect(hr.map(s => s.topWeight)).toEqual([320, 310]);
        const pa = buildExerciseSessions(log, 'Lat Pulldown', 'lbs', { machine: { name: 'Panatta Convergent Lat Pulldown' } });
        expect(pa.map(s => s.topWeight)).toEqual([90]);
        const all = buildExerciseSessions(log, 'Lat Pulldown', 'lbs');
        expect(all).toHaveLength(3);
        expect(all.mixedEquipment).toBe(true);
        expect(hr.mixedEquipment).toBeUndefined();
    });

    it('verdicts run on the template row\'s machine and name it', () => {
        const u = machineSwitchUser();
        const v = computeVerdicts({ workouts: u.workouts, templates: u.templates, weekPlan: u.weekPlan, program: u.program, today: u.today, unit: 'lbs', plates: u.settings.plateLbs });
        const lat = v.exercises.find(e => e.name === 'Lat Pulldown');
        expect(lat).toMatchObject({ equipment: 'Newtech High Row', weight: 330, last: { weight: 320 } });
        expect(lat.machineNote).toBeUndefined();
        expect(formatVerdictsContext(v)).toContain('- Lat Pulldown on Newtech High Row (Upper — strength): bump → 330×5 lbs');
    });

    it('a row whose machine has no history falls back to the name — and says so', () => {
        const templates = [{ id: 't', name: 'Upper', exercises: [{ machine: 'Lat Pulldown', equipment: 'Brand New Machine', defaultReps: 5 }] }];
        const v = computeVerdicts({ workouts: log, templates, today: '2026-10-25', unit: 'lbs' });
        expect(v.exercises[0].machineNote).toBe('mixed');
        expect(formatVerdictsContext(v)).toContain('history spans more than one machine');
    });

    it('scoreboard primaries carry their machine', () => {
        const u = machineSwitchUser();
        const sb = buildScoreboard({ workouts: u.workouts, templates: u.templates, today: u.today });
        const lat = sb.primaries.find(p => p.name === 'Lat Pulldown');
        expect(lat).toMatchObject({ equipment: 'Newtech High Row', e1rmNow: expect.any(Number) });
        expect(lat.e1rmNow).toBeGreaterThan(350); // the High Row, not the Panatta's 90×10
    });
});
