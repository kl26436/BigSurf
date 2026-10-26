// @vitest-environment jsdom
// TP-3 — the Plan page renders the timeline: notices (turn on / continues /
// paused), goals strip, past weeks folded, projected weeks marked, no
// "block" and no "week N of M" anywhere on it.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    plan: null,
    programs: [],
    AppState: {
        settings: {}, globalUnit: 'lbs', _weekPlan: { days: { mon: 'push', thu: 'legs' } },
        getTodayDateString: () => '2026-10-08',
        currentUser: { uid: 'u1' },
    },
}));

vi.mock('../../js/core/utils/app-state.js', () => ({ AppState: h.AppState }));
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    escapeHtml: (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    escapeAttr: (s) => String(s ?? '').replace(/"/g, '&quot;'),
    showNotification: vi.fn(),
}));
vi.mock('../../js/core/ui/navigation.js', () => ({ navigateTo: vi.fn() }));
vi.mock('../../js/core/ui/sheet.js', () => ({ openSheet: vi.fn(), closeSheet: vi.fn() }));
vi.mock('../../js/core/ui/confirm-sheet.js', () => ({ confirmSheet: vi.fn() }));
vi.mock('../../js/core/features/plan.js', () => ({
    loadPlan: async () => h.plan,
    loadPrograms: async () => h.programs,
}));
const set = (weight, reps) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true });
const push = { id: 'push', name: 'Push', exercises: [{ machine: 'Bench Press', role: 'primary', defaultReps: 6 }] };
const legs = { id: 'legs', name: 'Legs', exercises: [{ machine: 'Hack Squat', role: 'primary', defaultReps: 8 }] };
vi.mock('../../js/core/features/goals.js', () => ({
    loadGoalData: async () => ({
        templates: [push, legs], unit: 'lbs', today: h.AppState.getTodayDateString(), measurements: [], dexa: [],
        workouts: [{ id: 'w1', date: '2026-09-28', completedAt: '2026-09-28T18:00:00Z', workoutType: 'Push', exerciseNames: { exercise_0: 'Bench Press' }, exercises: { exercise_0: { sets: [set(185, 6)] } } }],
    }),
    loadGoals: async () => [{ id: 'g1', type: 'consistency', metric: 'daysPerWeek', unit: 'days/week', direction: 'up', target: 2, status: 'active', baseline: { value: 1, date: '2026-09-01' } }],
    loadEvents: async () => [{ id: 'e1', name: 'Trip', date: '2026-12-19', peakWeeks: 2 }],
}));

const { renderBlockPage } = await import('../../js/core/ui/block-ui.js');

const wave = {
    id: 'p1', name: 'Strength block III', startDate: '2026-09-28', weeks: 4, active: true, split: { mon: 'push', thu: 'legs' },
    weekTargets: [{ week: 3, label: 'Push', rpeTarget: 8.5 }, { week: 4, label: 'Lighter week', weightPct: -35 }],
    rationale: { block: 'Three build weeks then a lighter one', fixed: [{ name: 'Bench Press', why: 'so your strength numbers stay comparable' }] },
};

beforeEach(() => {
    document.body.innerHTML = '<div id="block-content"></div>';
    h.plan = { name: 'My plan', cadence: { buildWeeks: 3, lighterWeek: true }, rotationPolicy: 'ask' };
    h.programs = [wave];
});

const text = () => document.getElementById('block-content').textContent.replace(/\s+/g, ' ');

describe('Plan page', () => {
    it('renders the timeline: this week by kind, goals, events, projected weeks', async () => {
        await renderBlockPage();
        const t = text();
        expect(t).toContain('My plan');
        expect(t).toContain('This week: Build week 2');
        expect(t).toContain('Three build weeks then a lighter one, through Dec');
        expect(t).toContain('Trip in 10 weeks');
        expect(t).toContain('2 days a week');
        expect(t).toContain('Earlier weeks (1)');
        expect(t).toContain('projected');
        expect(t).toContain('What stays the same and why');
        expect(document.querySelectorAll('.plan-week--projected').length).toBeGreaterThan(4);
        // Plan page copy: no "block" (a user-named wave title is the only exception and isn't shown), no "week 2 of 4".
        expect(t).not.toMatch(/\bblock\b/i);
        expect(t).not.toMatch(/week \d+ of \d+/i);
    });

    it('no plan doc but a wave: offers to keep it going', async () => {
        h.plan = null;
        await renderBlockPage();
        expect(text()).toContain('Keep it going');
        expect(document.querySelector('[onclick="planEnable()"]')).not.toBeNull();
    });

    it('a rolled wave: the notice, the waiting swaps, and undo before anything is logged', async () => {
        h.programs = [
            { ...wave, active: false, state: 'finished' },
            {
                ...wave, id: 'p2', startDate: '2026-10-26', active: true, createdVia: 'auto-roll', rolledAt: '2026-10-26T00:30:00Z', rolledFrom: 'p1',
                pendingRotations: [{ templateId: 'legs', name: 'Legs', swaps: [{ index: 1, from: 'Seated Leg Curl', to: 'Lying Leg Curl', reason: 'never used' }] }],
            },
        ];
        h.AppState.getTodayDateString = () => '2026-10-27';
        await renderBlockPage();
        const t = text();
        expect(t).toContain('Your plan continues');
        expect(t).toContain('Seated Leg Curl → Lying Leg Curl');
        expect(document.querySelector('[onclick="planApplySwaps()"]')).not.toBeNull();
        expect(document.querySelector('[onclick="planUndoRoll()"]')).not.toBeNull();
        h.AppState.getTodayDateString = () => '2026-10-08';
    });

    it('paused: says so, offers resume, projects nothing', async () => {
        h.plan = { ...h.plan, paused: true };
        await renderBlockPage();
        expect(text()).toContain('Your plan is paused');
        expect(document.querySelectorAll('.plan-week--projected').length).toBe(0);
    });
});
