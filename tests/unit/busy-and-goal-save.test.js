// @vitest-environment jsdom
// The "goal added twice, then the page froze" bug (2026-10-26):
//   - busy.js: one run per tap, however slow the write;
//   - the Goals page saves once on a double tap and repaints from what it has
//     (no second load of a year of weigh-ins);
//   - findSameGoal: one goal per thing, the app and the coach agree.
// The freeze itself was the sheet primitive's inert leak — sheet.test.js.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    createGoal: vi.fn(),
    loadGoalsWithStatus: vi.fn(),
    AppState: { settings: {}, getTodayDateString: () => '2026-10-26', currentUser: { uid: 'u1' } },
}));

vi.mock('../../js/core/utils/app-state.js', () => ({ AppState: h.AppState }));
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    escapeHtml: (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    escapeAttr: (s) => String(s ?? '').replace(/"/g, '&quot;'),
    escapeJsArg: (s) => (s == null ? '' : String(s)).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    showNotification: vi.fn(),
}));
vi.mock('../../js/core/ui/navigation.js', () => ({ navigateTo: vi.fn() }));
vi.mock('../../js/core/ui/confirm-sheet.js', () => ({ confirmSheet: vi.fn() }));
vi.mock('../../js/core/features/goals.js', () => ({
    loadGoalsWithStatus: h.loadGoalsWithStatus,
    createGoal: h.createGoal,
    updateGoal: vi.fn(), deleteGoal: vi.fn(), createEvent: vi.fn(), deleteEvent: vi.fn(),
    mainLiftNames: () => [],
}));

const { once, isBusy } = await import('../../js/core/ui/busy.js');
const goalsUi = await import('../../js/core/ui/goals-ui.js');
const { findSameGoal } = await import('../../js/core/features/goal-progress.js');

describe('once (busy.js)', () => {
    it('ignores a second run while the first is going; frees the key after', async () => {
        let release;
        const fn = vi.fn(() => new Promise(r => { release = r; }));
        const a = once('k', fn);
        const b = once('k', fn);
        expect(isBusy('k')).toBe(true);
        expect(await b).toBeUndefined();
        release('done');
        expect(await a).toBe('done');
        expect(fn).toHaveBeenCalledTimes(1);
        expect(isBusy('k')).toBe(false);
        await once('k', async () => 'again');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('disables the button and says so; restores it, even when the action throws', async () => {
        document.body.innerHTML = '<button id="b">Save goal</button>';
        const btn = document.getElementById('b');
        let seen;
        await expect(once('t', async () => { seen = [btn.disabled, btn.textContent]; throw new Error('x'); }, { button: btn, label: 'Saving…' })).rejects.toThrow('x');
        expect(seen).toEqual([true, 'Saving…']);
        expect([btn.disabled, btn.textContent, btn.hasAttribute('aria-busy')]).toEqual([false, 'Save goal', false]);
        expect(isBusy('t')).toBe(false);
    });
});

describe('the Goals page save', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div class="app-container"><div id="goals-content"></div></div>';
        h.createGoal.mockReset();
        h.loadGoalsWithStatus.mockReset();
        h.loadGoalsWithStatus.mockResolvedValue({
            goals: [], events: [], rows: [],
            data: { workouts: [], templates: [], measurements: [], dexa: [], today: '2026-10-26', unit: 'lbs' },
        });
    });

    it('a double tap during a slow save writes ONE goal; the page repaints without reloading', async () => {
        await goalsUi.renderGoalsPage();
        expect(h.loadGoalsWithStatus).toHaveBeenCalledTimes(1);
        goalsUi.openAddGoalSheet();
        goalsUi.goalPickType('consistency');
        goalsUi.goalDraftTarget('4');
        let release;
        h.createGoal.mockImplementation(() => new Promise(r => { release = r; }));
        const first = goalsUi.goalSave();
        const second = goalsUi.goalSave(); // the impatient second tap
        await second;
        const btn = document.querySelector('#goal-add-sheet .sheet__footer .btn-primary');
        expect(btn.disabled).toBe(true);
        expect(btn.textContent).toBe('Saving…');
        release({ ok: true, goal: { id: 'g1', type: 'consistency', metric: 'daysPerWeek', unit: 'days/week', direction: 'up', target: 4, status: 'active', baseline: { value: 3, date: '2026-10-26' } } });
        await first;
        expect(h.createGoal).toHaveBeenCalledTimes(1);
        expect(h.loadGoalsWithStatus).toHaveBeenCalledTimes(1); // repainted, not reloaded
        expect(document.getElementById('goals-content').textContent).toContain('4 days a week');
        // the page answers taps again: nothing left inert
        await new Promise(r => setTimeout(r, 300));
        expect(document.querySelector('.app-container').inert).toBe(false);
    });

    it('passes the goals it has, so the save can refuse a duplicate', async () => {
        await goalsUi.renderGoalsPage();
        goalsUi.goalPickType('consistency');
        goalsUi.goalDraftTarget('4');
        h.createGoal.mockResolvedValue({ ok: false, error: 'You already have this goal' });
        await goalsUi.goalSave();
        expect(h.createGoal.mock.calls[0][2]).toMatchObject({ goals: [] });
    });
});

describe('findSameGoal — one goal per thing', () => {
    const lift = (over) => ({ type: 'lift', metric: 'estimatedMax', key: { exercise: 'Bench Press' }, status: 'active', ...over });
    it('same lift (any case) is the same goal; another lift, a paused one, or another metric is not', () => {
        expect(findSameGoal(lift({ key: { exercise: 'bench press' } }), [lift({ id: 'a' })])).toMatchObject({ id: 'a' });
        expect(findSameGoal(lift({ key: { exercise: 'Squat' } }), [lift({ id: 'a' })])).toBeNull();
        expect(findSameGoal(lift(), [lift({ id: 'a', status: 'paused' })])).toBeNull();
        const days = { type: 'consistency', metric: 'daysPerWeek', key: null };
        expect(findSameGoal(days, [{ ...days, id: 'd', status: 'active' }])).toMatchObject({ id: 'd' });
        const bf = { type: 'composition', metric: 'bodyFatPct', key: 'bodyFatPct' };
        expect(findSameGoal(bf, [{ type: 'composition', metric: 'leanMass', key: 'totalLeanMass', status: 'active' }])).toBeNull();
    });
});
