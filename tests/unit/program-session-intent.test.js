// AP-7 — the dashboard hero's program start must not scale a deload twice.
// Autofill already seeds the week's −35% from savedData.sessionIntent; the
// hero's applyAdjustmentToCurrentSession keeps the set delta / reps / RPE but
// skips its own weight scaling. Real program-session.js; edges mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../js/core/data/data-manager.js', () => ({
    debouncedSaveWorkoutData: vi.fn(),
    loadAllWorkouts: vi.fn(async () => []),
}));
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    escapeHtml: (s) => s,
    convertWeight: (w) => w,
}));
vi.mock('../../js/core/workout/workout-core.js', () => ({
    renderActiveWorkout: vi.fn(),
}));

// program-session self-wires handlers onto window and the start path calls
// window.startWorkout — a bare object is all the node env needs.
vi.stubGlobal('window', {});

import { applyProgramWeekAndStart } from '../../js/core/features/program-session.js';
import { AppState } from '../../js/core/utils/app-state.js';

const program = {
    id: 'program_1', name: 'Fall block', weeks: 6, startDate: '2026-09-21', trustLevel: 'propose',
    weekTargets: [{ week: 6, label: 'Deload', weightPct: -35, repRange: [12, 15] }],
    split: {},
};

function fakeStart(intent) {
    return async () => {
        AppState.currentWorkout = { exercises: [{ machine: 'Bench Press', sets: 2, reps: 10, weight: 0 }] };
        AppState.savedData = {
            date: '2026-10-26',
            sessionIntent: intent,
            exercises: { exercise_0: { sets: [
                { weight: 125, reps: 12, completed: false, originalUnit: 'lbs', _adjusted: 'deload' },
                { weight: 125, reps: 12, completed: false, originalUnit: 'lbs', _adjusted: 'deload' },
            ] } },
        };
    };
}

beforeEach(() => {
    AppState.globalUnit = 'lbs';
    AppState.settings = { plateLbs: [45, 25, 10, 5] };
    AppState.getTodayDateString = () => '2026-10-26';
    AppState._activeProgram = program;
});

describe('hero start in a deload week', () => {
    it('does not re-scale rows the seeder already deloaded', async () => {
        window.startWorkout = fakeStart({ mode: 'deload', weightPct: -35, repRange: [12, 15], source: 'program' });
        await applyProgramWeekAndStart('Push');
        const rows = AppState.savedData.exercises.exercise_0.sets;
        expect(rows.map(r => r.weight)).toEqual([125, 125]);
        expect(AppState.savedData.sessionLabel).toBe('Deload');
    });

    it('still scales when the session has no deload intent (legacy path)', async () => {
        window.startWorkout = fakeStart(null);
        await applyProgramWeekAndStart('Push');
        const rows = AppState.savedData.exercises.exercise_0.sets;
        expect(rows[0].weight).toBeLessThan(125);
    });
});
