// @vitest-environment jsdom
// TP-3 — the Plan page renders the timeline: notices (turn on / continues /
// paused), goals strip, past weeks folded, projected weeks marked, no
// "block" and no "week N of M" anywhere on it.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    plan: null,
    programs: [],
    saved: [],
    promptSheet: vi.fn(),
    refresh: vi.fn(),
    savePlan: vi.fn(async () => true),
    swapInTemplate: vi.fn(async () => ({ prior: [], entry: { at: 'x' } })),
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
vi.mock('../../js/core/ui/sheet.js', () => ({
    openSheet: vi.fn((o) => {
        let el = document.getElementById(o.id);
        if (!el) { el = document.createElement('div'); el.id = o.id; document.body.appendChild(el); }
        el.innerHTML = o.bodyHTML || '';
        return { el };
    }),
    closeSheet: vi.fn((id) => document.getElementById(id)?.remove()),
}));
vi.mock('../../js/core/ui/confirm-sheet.js', () => ({ confirmSheet: vi.fn(), promptSheet: h.promptSheet }));
vi.mock('../../js/core/data/firebase-workout-manager.js', () => ({ FirebaseWorkoutManager: class { async saveWorkoutTemplate(t) { h.saved.push(t); } } }));
vi.mock('../../js/core/ui/template-selection.js', () => ({ acceptCoachTemplateRefresh: h.refresh }));
vi.mock('../../js/core/features/plan.js', () => ({
    loadPlan: async () => h.plan,
    loadPrograms: async () => h.programs,
    savePlan: h.savePlan,
    swapInTemplate: h.swapInTemplate,
    undoSwapInTemplate: vi.fn(async () => true),
}));
const set = (weight, reps) => ({ weight, reps, originalUnit: 'lbs', type: 'working', completed: true });
const push = { id: 'push', name: 'Push', exercises: [{ machine: 'Bench Press', role: 'primary', defaultReps: 6 }, { machine: 'Cable Fly', defaultReps: 12, rotatedFrom: 'Pec Deck', rotatedAt: '2026-09-15' }] };
const legs = { id: 'legs', name: 'Legs', exercises: [{ machine: 'Hack Squat', role: 'primary', defaultReps: 8 }] };
vi.mock('../../js/core/features/goals.js', () => ({
    loadGoalData: async () => ({
        templates: [push, legs], unit: 'lbs', today: h.AppState.getTodayDateString(), measurements: [], dexa: [],
        workouts: [{ id: 'w1', date: '2026-09-28', completedAt: '2026-09-28T18:00:00Z', workoutType: 'Push', exerciseNames: { exercise_0: 'Bench Press' }, exercises: { exercise_0: { sets: [set(185, 6)] } } }],
    }),
    loadGoals: async () => [{ id: 'g1', type: 'consistency', metric: 'daysPerWeek', unit: 'days/week', direction: 'up', target: 2, status: 'active', baseline: { value: 1, date: '2026-09-01' } }],
    loadEvents: async () => [{ id: 'e1', name: 'Trip', date: '2026-12-19', peakWeeks: 2 }],
}));

const { renderBlockPage, saveSessionToMyWorkouts, openPlanSettings, planSettingPick, savePlanSettings, openRotateSheet, rotatePick, rotateApply } = await import('../../js/core/ui/block-ui.js');
const { showNotification } = await import('../../js/core/ui/ui-helpers.js');

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

    it('save to my workouts: one copy in the list, named as typed; the plan session untouched', async () => {
        const planA = { id: 'push_a', name: 'Push A', planOwned: true, planId: 'current', exercises: [{ machine: 'Incline Press', sets: 4 }] };
        h.AppState.workoutPlans = [planA];
        h.saved.length = 0;
        h.promptSheet.mockResolvedValueOnce('My push');
        await saveSessionToMyWorkouts('push_a');
        expect(h.saved).toHaveLength(1);
        expect(h.saved[0]).toMatchObject({ name: 'My push', kind: 'core', planOwned: false, savedFromPlan: { templateId: 'push_a', planId: 'current' } });
        expect(h.AppState.workoutPlans.map(t => t.name)).toEqual(['Push A', 'My push']);
        expect(planA.planOwned).toBe(true);
        expect(h.refresh).toHaveBeenCalled();
        h.promptSheet.mockResolvedValueOnce(null); // cancelled
        await saveSessionToMyWorkouts('push_a');
        expect(h.saved).toHaveLength(1);
    });

    it('TP-6 d: this week comes first, earlier weeks fold below, three actions, settings behind the gear', async () => {
        await renderBlockPage();
        const root = document.getElementById('block-content');
        const firstWeek = root.querySelector('.block-week');
        const past = root.querySelector('.plan-past');
        expect(firstWeek.compareDocumentPosition(past) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(root.querySelector('[onclick="openPlanSettings()"]')).not.toBeNull();
        expect([...root.querySelectorAll('.block-actions .chip')].map(b => b.textContent.trim())).toEqual(['Lighter week', 'Rotate an exercise', 'Change my plan']);
        expect(text()).not.toMatch(/\bwaves?\b/i);
        expect(text()).toContain('Why this plan');
    });

    it('TP-6 a: the swap choice is a setting with a date, not a button that does nothing', async () => {
        await renderBlockPage();
        openPlanSettings();
        const sheet = document.getElementById('plan-settings-sheet');
        expect(sheet.textContent).toContain('Ask me first');
        expect(sheet.textContent).toContain('Main lifts never swap');
        planSettingPick('rotationPolicy', 'auto', null);
        h.savePlan.mockClear();
        showNotification.mockClear();
        await savePlanSettings();
        expect(h.savePlan).toHaveBeenCalledWith({ rotationPolicy: 'auto' });
        expect(showNotification.mock.calls[0][0]).toMatch(/^Got it — swaps happen when the next weeks are set up on /);
    });

    it('TP-6 b: rotate in a few taps — main lifts locked, candidates from the gear, the swap written once', async () => {
        h.AppState._cachedEquipment = [{ name: 'Pec Deck Machine', exerciseTypes: ['Pec Deck'], locations: [], lastUsed: null }, { name: 'Cable Crossover Station', exerciseTypes: ['Cable Crossover'], locations: [], lastUsed: null }];
        h.AppState.workoutPlans = [push, legs];
        await renderBlockPage();
        await openRotateSheet();
        const sheet = () => document.getElementById('plan-rotate-sheet').textContent.replace(/\s+/g, ' ');
        expect(sheet()).toContain('Bench Press');
        expect(sheet()).toContain('Stays — your strength numbers depend on it');
        expect(sheet()).toContain('Cable Fly');
        await rotatePick('push', 1);
        // Pec Deck is what this slot just moved off — never offered back
        expect(sheet()).toContain('Cable Crossover');
        expect(sheet()).not.toMatch(/Pec Deck Machine ·/);
        expect(sheet()).toContain('Left out: Pec Deck');
        h.swapInTemplate.mockClear();
        await rotateApply(0);
        expect(h.swapInTemplate).toHaveBeenCalledTimes(1);
        expect(h.swapInTemplate.mock.calls[0][0]).toBe('push');
        expect(h.swapInTemplate.mock.calls[0][1]).toMatchObject({ index: 1, from: 'Cable Fly', to: 'Cable Crossover' });
        expect(showNotification.mock.calls.at(-1)[3]?.label).toBe('Undo');
    });
});
