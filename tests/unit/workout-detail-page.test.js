// @vitest-environment jsdom
// UD-4 (docs/ux-deep-dive-2026-10.md) — a past workout is a routed page:
// title = the workout, subtitle = date · gym · duration, Repeat / Edit in the
// footer (Delete behind ⋯), sets written by formatSet, back = navigateBack.
// Real workout-history + navigation modules; Firebase mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {}, doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), collection: vi.fn(),
    query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), deleteDoc: vi.fn(),
}));
vi.mock('../../js/core/ui/dashboard-ui.js', () => ({ showDashboard: vi.fn(), renderProgressPage: vi.fn() }));
vi.mock('../../js/core/ui/template-selection.js', () => ({ flushPendingTemplateEdits: vi.fn() }));

const SECTIONS = ['dashboard', 'workout-history-section', 'workout-detail-section', 'exercise-detail-section'];

let wh, nav;
const visible = () => SECTIONS.filter((id) => !document.getElementById(id).classList.contains('hidden'));

const WORKOUT = {
    id: 'w1', docId: 'w1', date: '2026-10-13', workoutType: 'Push A', location: 'Love Field',
    totalDuration: 2520, completedAt: '2026-10-13T12:00:00Z',
    originalWorkout: { exercises: [{ name: 'Bench Press' }] },
    exercises: { exercise_0: { sets: [
        { reps: 6, weight: 185, originalUnit: 'lbs', rpe: 8, completed: true },
        { reps: 6, weight: 185, originalUnit: 'lbs', completed: true },
    ] } },
};

beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.innerHTML = `
        <header id="main-header"></header>
        <section id="dashboard"></section>
        <section id="workout-history-section" class="hidden"></section>
        <section id="exercise-detail-section" class="hidden"></section>
        <section id="workout-detail-section" class="full-page-section hidden">
            <div class="page-header__title" id="workout-detail-title">Workout</div>
            <div class="page-header__subtitle" id="workout-detail-subtitle"></div>
            <button id="workout-detail-more" class="hidden"></button>
            <div id="workout-detail-content"></div>
            <div class="wd-footer hidden" id="workout-detail-footer"></div>
        </section>`;
    const { AppState } = await import('../../js/core/utils/app-state.js');
    AppState.globalUnit = 'lbs';
    nav = await import('../../js/core/ui/navigation.js');
    const { getWorkoutHistory } = await import('../../js/core/workout/workout-history.js');
    wh = getWorkoutHistory(AppState);
    window.workoutHistory = wh;
    window.showWorkoutHistory = () => document.getElementById('workout-history-section').classList.remove('hidden');
});

afterEach(async () => {
    await vi.dynamicImportSettled();
    vi.useRealTimers();
});

describe('UD-4 — the past-workout page', () => {
    it('names the workout and says when, where and how long', () => {
        wh.showFixedWorkoutModal(WORKOUT, 0);
        expect(document.getElementById('workout-detail-title').textContent).toBe('Push A');
        expect(document.getElementById('workout-detail-subtitle').textContent).toMatch(/^Tue, Oct 13 · Love Field · 42 min$/);
    });

    it('writes sets reps-first in the user unit, effort in words', () => {
        wh.showFixedWorkoutModal(WORKOUT, 0);
        const badges = [...document.querySelectorAll('.set-badge')].map((b) => b.textContent);
        expect(badges).toEqual(['6 × 185 lb · effort 8/10', '6 × 185 lb']);
        expect(document.getElementById('workout-detail-content').textContent).not.toMatch(/RPE/);
    });

    it('footer is Edit + Repeat; Delete is not beside the primary', () => {
        wh.showFixedWorkoutModal(WORKOUT, 0);
        const footer = document.getElementById('workout-detail-footer');
        expect(footer.classList.contains('hidden')).toBe(false);
        const actions = [...footer.querySelectorAll('[data-action]')].map((b) => b.dataset.action);
        expect(actions).toEqual(['editWorkout', 'repeatWorkout']);
        expect(document.getElementById('workout-detail-more').classList.contains('hidden')).toBe(false);
    });

    it('is a page in the back stack: back returns to where it was opened (B5)', () => {
        nav.navigateTo('history');
        vi.runAllTimers();
        wh.showFixedWorkoutModal(WORKOUT, 0);
        expect(visible()).toEqual(['workout-detail-section']);
        wh.closeWorkoutDetailModal();
        vi.runAllTimers();
        expect(visible()).toEqual(['workout-history-section']);
    });

    it('a back onto the page from a lift re-shows it (route, not dashboard)', () => {
        wh.showFixedWorkoutModal(WORKOUT, 0);
        nav.navigateTo('exercise-detail-section');
        vi.runAllTimers();
        nav.navigateBack();
        vi.runAllTimers();
        expect(visible()).toEqual(['workout-detail-section']);
    });

    it('a calendar entry without its full doc renders on the same page (no #workoutModal)', () => {
        expect(() => wh.showFixedBasicModal('2026-10-13', { docId: 'w2', name: 'Pull B', status: 'completed' })).not.toThrow();
        expect(document.getElementById('workout-detail-title').textContent).toBe('Pull B');
    });
});
