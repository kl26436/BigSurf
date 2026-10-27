// TP-7 — any gym, any machine. The plan is made of movements; a machine is a
// per-gym detail. Unmapped gear is never a reason to refuse an exercise; a
// trip keeps the plan's sessions and stays out of the main lifts' trends.

import { describe, it, expect } from 'vitest';
import { gymLevel, genericFallbacks, usualGym, travelOn, FULL_GYM_MIN_MACHINES } from '../../js/core/features/gym-profile.js';
import { rankRotationCandidates, fillAlternates } from '../../js/core/features/exercise-rotation.js';
import { normalizeEvent } from '../../js/core/features/goal-progress.js';
import { projectKinds, buildPlanTimeline } from '../../js/core/features/plan-timeline.js';
import { buildExerciseSessions } from '../../js/core/features/progression.js';
import { fakeAdminDb } from '../fixtures/admin-db-mock.js';
import { makeToolExecutors } from '../../functions/coach-tools.js';

const HOME = 'Absolute Recomp';
const eq = (name, exerciseTypes, locations, lastUsed = null) => ({ name, exerciseTypes, locations, lastUsed });

describe('gym profiles', () => {
    it('the level is what the user set, else "big gym" once enough is mapped, else unknown', () => {
        expect(gymLevel({ equipmentLevel: 'hotel' }, 40)).toBe('hotel');
        expect(gymLevel({}, FULL_GYM_MIN_MACHINES)).toBe('full');
        expect(gymLevel({}, 3)).toBeNull();
    });

    it('generic movements per level — a hotel has dumbbells and a cable, no barbell', () => {
        expect(genericFallbacks('hip-dominant', 'hotel').map(f => f.implement)).toEqual(['dumbbell', 'cable', 'machine', 'bodyweight']);
        expect(genericFallbacks('hip-dominant', 'home').map(f => f.name)).toEqual(['Dumbbell Romanian Deadlift', 'Single-Leg Glute Bridge']);
        expect(genericFallbacks('rear-delt', 'full', { exclude: ['Dumbbell Rear Delt Fly'] })[0].name).toBe('Cable Rear Delt Fly');
    });

    it('the usual gym is the most-trained one lately', () => {
        const w = (date, location) => ({ date, completedAt: 'x', location });
        expect(usualGym([w('2026-10-01', 'Hurst'), w('2026-10-10', HOME), w('2026-10-12', HOME)], { today: '2026-10-26' })).toBe(HOME);
        expect(usualGym([], { today: '2026-10-26' })).toBeNull();
    });
});

describe('candidates beyond the library (b)', () => {
    const equipment = [
        eq('Basic Trainer Cable', ['Rope Face Pulls'], [HOME], '2026-10-20'),
        eq('Peck Back Machine', ['Reverse Pec Deck'], ['Hurst'], '2026-06-01'),
    ];

    it('this gym first, then what you used elsewhere, then the movement on the gear this gym has — none refused', () => {
        const r = rankRotationCandidates({ exercise: 'Rope Face Pulls', equipment, location: HOME, widen: true, level: 'full', limit: 4 });
        expect(r.candidates.map(c => [c.name, c.tier])).toEqual([
            ['Reverse Pec Deck', 2], ['Dumbbell Rear Delt Fly', 3], ['Cable Rear Delt Fly', 3],
        ]);
        expect(r.candidates[0]).toMatchObject({ equipment: null, seenOn: 'Peck Back Machine' });
        expect(r.candidates[1]).toMatchObject({ equipment: null, unmapped: true, reason: 'dumbbells — pick the machine when you get there' });
    });

    it('without widen nothing changes (the engine that writes machines stays at this gym)', () => {
        const r = rankRotationCandidates({ exercise: 'Rope Face Pulls', equipment, location: HOME });
        expect(r.candidates).toEqual([]);
    });

    it('alternates plan the movement when this gym has no other machine for it', () => {
        const { filled } = fillAlternates([{ machine: 'Rope Face Pulls', equipment: 'Basic Trainer Cable' }], { equipment, location: HOME, widen: true, level: 'standard' });
        expect(filled[0].alternate).toEqual({ name: 'Reverse Pec Deck' });
    });
});

describe('a trip (c)', () => {
    it('travel events: dates, the gym size; never more than four weeks', () => {
        const ok = normalizeEvent({ name: 'Bellagio', date: '2026-10-31', endDate: '2026-11-01', kind: 'travel' }, { today: '2026-10-26' });
        expect(ok.event).toMatchObject({ kind: 'travel', endDate: '2026-11-01', level: 'hotel', peakWeeks: 0, lighterBefore: false });
        expect(normalizeEvent({ name: 'x', date: '2026-10-31', endDate: '2026-10-30', kind: 'travel' }, { today: '2026-10-26' }).ok).toBe(false);
        expect(normalizeEvent({ name: 'x', date: '2026-10-31', endDate: '2026-12-31', kind: 'travel' }, { today: '2026-10-26' }).ok).toBe(false);
        expect(normalizeEvent({ name: 'x', date: '2026-10-26', kind: 'travel' }, { today: '2026-10-26' }).ok).toBe(true);
    });

    it('a trip never turns weeks into peak or lighter weeks; it shows on its week with its dates', () => {
        const trip = { name: 'Bellagio', date: '2026-11-07', endDate: '2026-11-08', kind: 'travel' };
        const kinds = projectKinds('2026-10-26', 4, { buildWeeks: 3, lighterWeek: true }, [trip]).map(k => k.kind);
        expect(kinds).toEqual(['build', 'build', 'push', 'lighter']);
        const tl = buildPlanTimeline({ plan: { cadence: { buildWeeks: 3, lighterWeek: true } }, weekPlan: { days: { mon: 'p' } }, templates: [{ id: 'p', name: 'Push', exercises: [] }], events: [trip], today: '2026-10-26' });
        expect(tl.weeks.find(w => w.weekStart === '2026-11-02').markers).toEqual([{ type: 'travel', label: 'Bellagio · Nov 7–Nov 8' }]);
        expect(travelOn('2026-11-08', [trip])?.name).toBe('Bellagio');
        expect(travelOn('2026-11-09', [trip])).toBeNull();
    });

    it("a hotel-gym session isn't the lift's history — unless it was the same machine", () => {
        const set = (weight) => ({ reps: 8, weight, originalUnit: 'lbs', completed: true });
        const w = (date, weight, extra = {}) => ({ date, completedAt: 'x', exerciseNames: { exercise_0: 'Bench Press' }, exercises: { exercise_0: { sets: [set(weight)], equipment: 'Flat Bench' } }, ...extra });
        const history = [w('2026-10-01', 200), w('2026-10-08', 205), w('2026-10-31', 60, { sessionIntent: { travel: { name: 'Bellagio' } } })];
        expect(buildExerciseSessions(history, 'Bench Press', 'lbs').map(s => s.date).sort()).toEqual(['2026-10-01', '2026-10-08']);
        expect(buildExerciseSessions(history, 'Bench Press', 'lbs', { machine: { name: 'Flat Bench' } }).map(s => s.date).sort()).toEqual(['2026-10-01', '2026-10-08', '2026-10-31']);
    });
});

describe('the coach (d)', () => {
    const U = 'users/u1';
    const seed = () => fakeAdminDb({
        [`${U}/workoutTemplates/pull`]: { name: 'Pull day', exercises: [{ machine: 'Lat Pulldown', role: 'primary' }, { machine: 'Rope Face Pulls', equipment: 'Basic Trainer Cable' }] },
        [`${U}/equipment/e1`]: { name: 'Basic Trainer Cable', exerciseTypes: ['Rope Face Pulls'], lastUsed: '2026-10-20', locations: [HOME] },
        [`${U}/locations/l1`]: { name: HOME, equipmentLevel: 'full', equipmentNote: 'two cable stacks' },
        [`${U}/workouts/w1`]: { date: '2026-10-20', completedAt: '2026-10-20T18:00:00Z', location: HOME, exercises: {} },
    });
    const ex = (db) => makeToolExecutors({ db, userId: 'u1', unit: 'lbs', today: '2026-10-26' });

    it('get_rotation_candidates offers beyond what\'s mapped and says the gym size', async () => {
        const out = await ex(seed()).get_rotation_candidates({ exercise: 'Rope Face Pulls' });
        const r = out.result || out;
        expect(r.gymSize).toBe('big gym');
        expect(r.gymNote).toBe('two cable stacks');
        expect(r.candidates.length).toBeGreaterThan(0);
        expect(r.candidates.every(c => c.tier === 3 && c.unmapped)).toBe(true);
    });

    it('list_equipment says each gym\'s size; add_event takes a trip', async () => {
        const db = seed();
        const eqOut = await ex(db).list_equipment({});
        expect((eqOut.result || eqOut).gyms[HOME]).toEqual({ size: 'big gym', note: 'two cable stacks' });
        const ev = await ex(db).add_event({ name: 'Bellagio', date: '2026-10-31', endDate: '2026-11-01', kind: 'travel', level: 'hotel' });
        expect(ev.result).toMatchObject({ kind: 'travel', endDate: '2026-11-01', level: 'hotel' });
        expect(ev.actionCard.summary).toBe('2026-10-31 to 2026-11-01 · trip · hotel gym');
    });
});
