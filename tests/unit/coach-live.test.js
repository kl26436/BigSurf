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
    escapeJsArg: (s) => (s == null ? '' : String(s)).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
}));

import { buildLiveWorkoutContext, buildLiveSessionLine, applyNextTarget } from '../../js/core/features/coach-live.js';
import { AppState } from '../../js/core/utils/app-state.js';
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

    // AP-9 — the live coach must know a deload session from a build session.
    const deloadIntent = {
        mode: 'deload', weightPct: -35, setDelta: null, repRange: [12, 15], rpeTarget: null,
        label: 'Deload', week: 6, weeks: 6, source: 'program', reason: 'program week 6',
    };

    it('AP-9: a deload intent adds ONE Session line with the levers and the cap', () => {
        const ctx = buildLiveWorkoutContext({ ...state(), sessionIntent: deloadIntent });
        expect(ctx).toContain('Session: Lighter week, week 6 of 6 (-35% weight · 12–15 reps) — propose_next_target must not exceed the targets already on the set rows.');
        expect((ctx.match(/^Session:/gm) || []).length).toBe(1);
    });

    it('AP-9: a manual deload reads as a session, peak gets its own line, build gets none', () => {
        expect(buildLiveSessionLine({ ...deloadIntent, source: 'manual', week: null, weeks: null, repRange: null, weightPct: -30 }))
            .toBe('Session: Lighter session (-30% weight) — propose_next_target must not exceed the targets already on the set rows.');
        expect(buildLiveSessionLine({ mode: 'peak', weightPct: 5, rpeTarget: 9, week: 5, weeks: 6, source: 'program' }))
            .toContain('Session: Peak week, week 5 of 6 (+5% weight · effort 9/10)');
        expect(buildLiveSessionLine({ mode: 'build', source: 'none' })).toBe('');
        expect(buildLiveWorkoutContext(state())).not.toContain('Session:');
    });

    it('AP-15d: session label, injuries, RPE, last-session top set and the rule verdict', () => {
        const s = state();
        s.savedData.sessionLabel = 'Deload';
        s.savedData.exercises.exercise_0.sets[1].rpe = 9;
        s.currentWorkout.exercises[0]._lastSessionSets = [
            { reps: 10, weight: 95, type: 'warmup', originalUnit: 'lbs' },
            { reps: 8, weight: 225, originalUnit: 'lbs' },
            { reps: 6, weight: 100, originalUnit: 'kg' }, // 220.5 lbs — 225 stays the top
        ];
        s.currentWorkout.exercises[0]._lastSessionDaysAgo = 3;
        s.currentWorkout.exercises[0]._progression = { weight: 145, reps: 9, action: 'chase-rep', stalled: true, rung: 1 };
        const ctx = buildLiveWorkoutContext({ ...s, injuries: 'left shoulder' });
        expect(ctx).toContain('Workout: Push Day · Deload · 23 min elapsed');
        expect(ctx).toContain('Injuries / limitations: left shoulder');
        expect(ctx).toContain('8×145 (effort 9/10)');
        expect(ctx).toContain('last: 8×225 (3d ago)');
        expect(ctx).toContain('rule: chase a rep (stuck) → 145×9 lbs');
    });
});

describe('applyNextTarget (AP-9)', () => {
    it("drops the app's _suggested marker instead of carrying it through the spread", () => {
        AppState.globalUnit = 'lbs';
        AppState.currentWorkout = { exercises: [{ machine: 'Bench Press', sets: 3 }] };
        AppState.savedData = {
            exercises: {
                exercise_0: { sets: [
                    { reps: 8, weight: 145, completed: true },
                    { reps: 8, weight: 155, _suggested: true, completed: false },
                ] },
            },
        };
        const msg = applyNextTarget({ exercise: 'Bench Press', weight: 150, reps: 8 });
        expect(msg).toContain('Bench Press next set: 150 lbs × 8 reps');
        const set = AppState.savedData.exercises.exercise_0.sets[1];
        expect(set).toMatchObject({ weight: 150, reps: 8, completed: false });
        expect(set._suggested).toBeUndefined();
    });

    it('keeps a deload _adjusted flag when only reps change; drops it with a new weight', () => {
        AppState.currentWorkout = { exercises: [{ machine: 'Row', sets: 2 }] };
        AppState.savedData = { exercises: { exercise_0: { sets: [{ reps: 12, weight: 90, _adjusted: 'deload', completed: false }] } } };
        applyNextTarget({ exercise: 'Row', reps: 13 });
        expect(AppState.savedData.exercises.exercise_0.sets[0]._adjusted).toBe('deload');
        applyNextTarget({ exercise: 'Row', weight: 95 });
        expect(AppState.savedData.exercises.exercise_0.sets[0]._adjusted).toBeUndefined();
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

    it('add_exercise rejects out-of-range sets/reps instead of clamping (AP-18); absent → 3×10', () => {
        expect(validateProposal('propose_add_exercise', { exercise: 'Face Pull', sets: 99 }))
            .toEqual({ ok: false, error: 'Face Pull: sets must be a whole number 1-10 (got 99)' });
        const v = validateProposal('propose_add_exercise', { exercise: 'Face Pull' });
        expect(v.proposal).toMatchObject({ kind: 'add_exercise', sets: 3, reps: 10, weight: null });
    });

    it('next_target and session adjustments reject bad values (AP-18)', () => {
        expect(validateProposal('propose_next_target', { exercise: 'Bench', reps: 0 }).error).toMatch(/reps must be 1-50/);
        expect(validateProposal('propose_session_adjustments', { templateId: 't', label: 'Deload', weightPct: -95 }).error)
            .toMatch(/weightPct must be a number from -90 to 100/);
        expect(validateProposal('propose_session_adjustments', { templateId: 't', label: 'X', addExercises: [{ name: 'Dips', reps: 80 }] }).error)
            .toBe('addExercises: Dips: reps must be a whole number 1-50 (got 80)');
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
    it('reads + proposals + remember_fact (AP-23h) — NO template writes mid-set', () => {
        const names = liveToolDefinitions().map(t => t.name).sort();
        expect(names).toEqual([
            'get_exercise_history', 'get_prs', 'log_advice',
            'propose_add_exercise', 'propose_next_target', 'propose_rest', 'propose_skip_exercise', 'propose_swap',
            'remember_fact',
        ]);
    });
});
