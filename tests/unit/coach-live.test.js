// Live in-workout coach (Phase 6) — the pure halves: the live context builder
// (client) and the proposal validators (server, functions/coach-tools.js).

import { describe, it, expect, vi } from 'vitest';

// coach-live.js imports the workout barrel + data-manager whose graphs touch
// Firebase/DOM at import time — mock those edges (repo test convention).
vi.mock('../../js/core/workout/workout-core.js', () => ({
    renderActiveWorkout: vi.fn(),
    awInsertExercise: vi.fn(),
    awSelectEquipment: vi.fn(),
}));
vi.mock('../../js/core/data/data-manager.js', () => ({
    debouncedSaveWorkoutData: vi.fn(),
}));
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    escapeHtml: (s) => String(s ?? ''),
    escapeAttr: (s) => String(s ?? ''),
}));

import { buildLiveWorkoutContext } from '../../js/core/features/coach-live.js';
import { validateProposal, liveToolDefinitions } from '../../functions/coach-tools.js';

describe('buildLiveWorkoutContext', () => {
    const state = () => ({
        currentWorkout: {
            name: 'Push Day',
            exercises: [
                { machine: 'Bench Press', sets: 4, equipment: 'Flat Bench' },
                { machine: 'OHP', sets: 3 },
            ],
        },
        savedData: {
            workoutType: 'Push Day',
            location: 'Iron Temple',
            readiness: { score: 2, note: 'slept badly' },
            exercises: {
                exercise_0: {
                    equipment: 'Flat Bench',
                    sets: [
                        { reps: 8, weight: 145, completed: true },
                        { reps: 8, weight: 145, completed: true, type: 'working' },
                    ],
                },
            },
        },
        globalUnit: 'lbs',
        equipment: [
            { name: 'Flat Bench', locations: ['Iron Temple'] },
            { name: 'Incline DB Bench', locations: ['Iron Temple'] },
            { name: 'Home Rack', locations: ['Home'] },
        ],
        elapsedMinutes: 23,
    });

    it('carries workout, gym, elapsed, readiness, and unit', () => {
        const ctx = buildLiveWorkoutContext(state());
        expect(ctx).toContain('Push Day · 23 min elapsed · at Iron Temple');
        expect(ctx).toContain('Readiness today: 2/5 ("slept badly")');
        expect(ctx).toContain('Unit: lbs');
    });

    it('shows per-exercise done/planned sets and marks the current exercise', () => {
        const ctx = buildLiveWorkoutContext(state());
        expect(ctx).toContain('→ Bench Press [Flat Bench]: 2/4 sets — 8×145, 8×145');
        expect(ctx).toContain('OHP: 0/3 sets');
        // Only ONE current marker.
        expect((ctx.match(/→ /g) || []).length).toBe(1);
    });

    it('lists only equipment at the current gym', () => {
        const ctx = buildLiveWorkoutContext(state());
        expect(ctx).toContain('Incline DB Bench');
        expect(ctx).not.toContain('Home Rack');
    });

    it('no workout → honest fallback', () => {
        expect(buildLiveWorkoutContext({})).toBe('No workout in progress.');
    });
});

describe('validateProposal', () => {
    it('next_target requires exercise + at least weight or reps', () => {
        expect(validateProposal('propose_next_target', { exercise: 'Bench Press', weight: 155 }).ok).toBe(true);
        expect(validateProposal('propose_next_target', { exercise: 'Bench Press' }).ok).toBe(false);
        expect(validateProposal('propose_next_target', { weight: 155 }).ok).toBe(false);
    });

    it('swap requires both exercises; equipment optional', () => {
        const v = validateProposal('propose_swap', { fromExercise: 'Row Machine', toExercise: 'DB Row', equipment: 'Dumbbells', why: 'taken' });
        expect(v.ok).toBe(true);
        expect(v.proposal).toMatchObject({ kind: 'swap', fromExercise: 'Row Machine', toExercise: 'DB Row', equipment: 'Dumbbells' });
        expect(validateProposal('propose_swap', { fromExercise: 'Row Machine' }).ok).toBe(false);
    });

    it('add_exercise clamps sets/reps to sane defaults', () => {
        const v = validateProposal('propose_add_exercise', { exercise: 'Face Pull', sets: 99, reps: -3 });
        expect(v.ok).toBe(true);
        expect(v.proposal).toMatchObject({ kind: 'add_exercise', sets: 3, reps: 10 });
    });

    it('rest bounds 15-600 seconds', () => {
        expect(validateProposal('propose_rest', { seconds: 180 }).ok).toBe(true);
        expect(validateProposal('propose_rest', { seconds: 5 }).ok).toBe(false);
        expect(validateProposal('propose_rest', { seconds: 9999 }).ok).toBe(false);
    });

    it('why is clipped, unknown tools rejected', () => {
        const v = validateProposal('propose_rest', { seconds: 120, why: 'x'.repeat(500) });
        expect(v.proposal.why.length).toBeLessThanOrEqual(140);
        expect(validateProposal('propose_teleport', {}).ok).toBe(false);
    });

    it('session_adjustments (5.6.1): requires templateId+label+one change; validates bounds', () => {
        const ok = validateProposal('propose_session_adjustments', {
            templateId: 'push_day', label: 'Deload', weightPct: -40,
            dropExercises: ['Dips'], addExercises: [{ name: 'Face Pull', sets: 3, reps: 15 }],
        });
        expect(ok.ok).toBe(true);
        expect(ok.proposal).toMatchObject({ kind: 'session_adjustments', weightPct: -40, dropExercises: ['Dips'] });
        expect(ok.proposal.addExercises[0]).toMatchObject({ machine: 'Face Pull', sets: 3, reps: 15 });

        expect(validateProposal('propose_session_adjustments', { templateId: 'x', label: 'Deload' }).ok).toBe(false); // no change
        expect(validateProposal('propose_session_adjustments', { label: 'Deload', weightPct: -40 }).ok).toBe(false);  // no template
        expect(validateProposal('propose_session_adjustments', { templateId: 'x', label: 'L', weightPct: -99 }).ok).toBe(false); // out of bounds
    });
});

describe('liveToolDefinitions', () => {
    it('reads + proposals only — NO template or memory writes mid-set', () => {
        const names = liveToolDefinitions().map(t => t.name).sort();
        expect(names).toEqual([
            'get_exercise_history', 'get_prs', 'log_advice',
            'propose_add_exercise', 'propose_next_target', 'propose_rest', 'propose_swap',
        ]);
    });
});
