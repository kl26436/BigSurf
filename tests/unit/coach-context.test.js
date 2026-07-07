// Coach context builders — pure blocks that feed the AI coach's prompt.

import { describe, it, expect } from 'vitest';
import {
    buildProfileContext,
    buildPRContext,
    buildTemplatesContext,
    setTypeMarker,
    templatesChangedNote,
    deriveProgramWeek,
    buildProgramContext,
} from '../../js/core/features/coach-context.js';

describe('buildProfileContext', () => {
    it('includes goal, experience, injuries, notes, height, weekly goal', () => {
        const ctx = buildProfileContext({
            coachGoal: 'recomp',
            profileExperience: 'intermediate',
            coachInjuries: 'bad left shoulder',
            coachNotes: 'can only train 45 min at lunch',
            profileHeightCm: 180,
            weeklyGoal: 4,
        });
        expect(ctx).toContain('User profile:');
        expect(ctx).toContain('recomposition');
        expect(ctx).toContain('intermediate');
        expect(ctx).toContain('bad left shoulder');
        expect(ctx).toContain('45 min at lunch');
        expect(ctx).toContain('180 cm');
        expect(ctx).toContain('4 days');
    });

    it('empty settings → empty string (no noise block)', () => {
        expect(buildProfileContext({})).toBe('');
        expect(buildProfileContext()).toBe('');
    });

    it('unknown goal value is skipped, not echoed raw', () => {
        expect(buildProfileContext({ coachGoal: 'xyz' })).toBe('');
    });
});

describe('buildPRContext', () => {
    const pr = (exercise, equipment, weight, reps, date) => ({
        exercise, equipment, prs: { maxWeight: { weight, reps, date, unit: 'lbs' } },
    });

    it('renders exercise, equipment, weight×reps, date — most recent first, capped', () => {
        const list = [
            pr('Bench Press', 'Hammer Strength', 225, 5, '2026-06-01'),
            pr('Squat', 'Barbell', 315, 3, '2026-07-01'),
        ];
        const ctx = buildPRContext(list, { limit: 15 });
        expect(ctx.indexOf('Squat')).toBeLessThan(ctx.indexOf('Bench Press'));
        expect(ctx).toContain('Bench Press (Hammer Strength): 225×5 lbs on 2026-06-01');
    });

    it('caps at limit and skips entries with no maxWeight', () => {
        const list = [
            pr('A', null, 100, 5, '2026-01-03'),
            pr('B', null, 100, 5, '2026-01-02'),
            { exercise: 'C', equipment: null, prs: {} },
        ];
        const ctx = buildPRContext(list, { limit: 1 });
        expect(ctx).toContain('A');
        expect(ctx).not.toContain('B');
        expect(ctx).not.toContain('C');
    });

    it('hides the "Unknown Equipment" placeholder', () => {
        const ctx = buildPRContext([pr('Row', 'Unknown Equipment', 100, 8, '2026-01-01')]);
        expect(ctx).toContain('Row: 100×8');
        expect(ctx).not.toContain('Unknown Equipment');
    });

    it('empty → empty string', () => {
        expect(buildPRContext([])).toBe('');
    });
});

describe('buildTemplatesContext', () => {
    it('lists name, category, exercises with sets×reps, capped', () => {
        const plans = [{
            name: 'Push Day', category: 'Push',
            exercises: [
                { machine: 'Bench Press', sets: 4, defaultReps: 8 },
                { name: 'OHP', sets: 3, reps: 10 },
            ],
        }];
        const ctx = buildTemplatesContext(plans);
        expect(ctx).toContain('Push Day [Push]: Bench Press 4×8, OHP 3×10');
    });

    it('truncates long exercise lists with +N more and caps template count', () => {
        const manyEx = Array.from({ length: 15 }, (_, i) => ({ name: `Ex${i}`, sets: 3, reps: 10 }));
        const plans = Array.from({ length: 12 }, (_, i) => ({ name: `T${i}`, exercises: manyEx }));
        const ctx = buildTemplatesContext(plans, { capTemplates: 10, capExercises: 12 });
        expect(ctx).toContain('+3 more');
        expect(ctx).toContain('T9');
        expect(ctx).not.toContain('T10');
    });

    it('empty → empty string', () => {
        expect(buildTemplatesContext([])).toBe('');
    });
});

describe('setTypeMarker', () => {
    it('annotates non-working sets only', () => {
        expect(setTypeMarker({ type: 'warmup' })).toBe(' (warmup)');
        expect(setTypeMarker({ type: 'failure' })).toBe(' (failure)');
        expect(setTypeMarker({ type: 'working' })).toBe('');
        expect(setTypeMarker({})).toBe('');
    });
});

describe('templatesChangedNote', () => {
    it('empty when unchanged (order-insensitive)', () => {
        expect(templatesChangedNote(['A', 'B'], ['B', 'A'])).toBe('');
    });

    it('one-line note listing current names when changed', () => {
        const note = templatesChangedNote(['A'], ['A', 'New Pull Day']);
        expect(note).toContain('saved workouts changed');
        expect(note).toContain('New Pull Day');
        expect(note.endsWith('\n\n')).toBe(true);
    });
});

describe('deriveProgramWeek / buildProgramContext (Phase 9)', () => {
    const program = {
        name: 'Strength block', goal: 'strength', weeks: 4, startDate: '2026-06-29',
        weekTargets: [
            { week: 2, label: 'heavy', weightPct: 5 },
            { week: 4, label: 'deload', weightPct: -40, note: 'easy week' },
        ],
    };

    it('derives the week from startDate — never stored', () => {
        expect(deriveProgramWeek(program, '2026-06-29').week).toBe(1);
        expect(deriveProgramWeek(program, '2026-07-07').week).toBe(2);
        expect(deriveProgramWeek(program, '2026-07-20')).toMatchObject({ week: 4, finished: false });
        expect(deriveProgramWeek(program, '2026-08-03').finished).toBe(true);
    });

    it('picks the matching week target (null when baseline)', () => {
        expect(deriveProgramWeek(program, '2026-07-07').target).toMatchObject({ label: 'heavy', weightPct: 5 });
        expect(deriveProgramWeek(program, '2026-06-30').target).toBeNull();
    });

    it('context line carries week-of + target; finished programs say so', () => {
        const ctx = buildProgramContext(program, '2026-07-07');
        expect(ctx).toContain('week 2 of 4');
        expect(ctx).toContain('heavy (+5% weight)');
        expect(buildProgramContext(program, '2026-08-10')).toContain('FINISHED');
        expect(buildProgramContext(null, '2026-07-07')).toBe('');
    });
});
