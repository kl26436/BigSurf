// @vitest-environment jsdom
// 10/26 bug-log: the logo bar (#main-header) stayed up on the Plan page and
// every drill-down, so the status-bar inset was paid twice (logo bar +
// .page-header). One rule now decides it on every route change: the logo
// bar belongs to views that have no .page-header of their own.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The route handlers lazy-import the page modules; the header rule runs
// before any of them. Firebase is mocked the way every other UI test does it,
// and the page renderers are stubbed so no page actually boots.
vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {}, auth: {}, doc: vi.fn(), setDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
    deleteDoc: vi.fn(), collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(),
    where: vi.fn(), limit: vi.fn(), onSnapshot: vi.fn(), serverTimestamp: vi.fn(),
}));
vi.mock('../../js/core/ui/dashboard-ui.js', () => ({ showDashboard: vi.fn(), renderProgressPage: vi.fn() }));
vi.mock('../../js/core/ui/block-ui.js', () => ({ renderBlockPage: vi.fn() }));
vi.mock('../../js/core/ui/exercise-detail-ui.js', () => ({ renderExerciseDetail: vi.fn() }));
vi.mock('../../js/core/ui/equipment-library-ui.js', () => ({ openEquipmentLibrary: vi.fn() }));
vi.mock('../../js/core/ui/settings-ui.js', () => ({ renderSettings: vi.fn() }));
vi.mock('../../js/core/ui/template-selection.js', () => ({ flushPendingTemplateEdits: vi.fn() }));
vi.mock('../../js/core/ui/exercise-manager-ui.js', () => ({ resumeEditExerciseSection: vi.fn() }));
vi.mock('../../js/core/features/plate-calculator.js', () => ({ initPlateCalculatorPage: vi.fn() }));
vi.mock('../../js/core/features/ai-coach-ui.js', () => ({ renderAICoachSection: vi.fn() }));
vi.mock('../../js/core/workout/active-workout-ui.js', () => ({ resumeRestTimerIfActive: vi.fn() }));

const SECTIONS = [
    'dashboard', 'active-workout', 'block-section', 'exercise-detail-section',
    'equipment-library-section', 'settings-section', 'exercise-manager-section',
    'history-section',
];

let nav;
const logo = () => document.getElementById('main-header').style.display;
const go = (view) => { nav.navigateTo(view); vi.runAllTimers(); };

beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers(); // navigateTo fades the visible section out on a timer
    document.body.innerHTML =
        '<header id="main-header" class="header"></header>' +
        SECTIONS.map(id => `<section id="${id}" class="${id === 'dashboard' ? '' : 'hidden'}"></section>`).join('');
    const helpers = await import('../../js/core/ui/ui-helpers.js');
    window.setHeaderMode = helpers.setHeaderMode;
    nav = await import('../../js/core/ui/navigation.js');
});

afterEach(async () => {
    // Let the route handlers' lazy imports settle before jsdom is torn down.
    await vi.dynamicImportSettled();
    vi.useRealTimers();
});

describe('logo bar visibility (one rule in navigation)', () => {
    it('hides the logo on every view that has its own page header', () => {
        for (const view of ['plan', 'block', 'exercise-detail', 'equipment', 'settings', 'plate-calculator', 'ai-coach']) {
            go('dashboard');
            expect(logo()).toBe('flex');
            go(view);
            expect(logo(), view).toBe('none');
        }
    });

    it('shows the logo again on dashboard and history', () => {
        go('plan');
        expect(logo()).toBe('none');
        go('history');
        expect(logo()).toBe('flex');
        go('plan');
        go('dashboard');
        expect(logo()).toBe('flex');
    });

    it('enterSection applies the same rule (flows that paint their own page)', () => {
        nav.enterSection('exercise-manager-section');
        expect(logo()).toBe('none');
        nav.enterSection('active-workout');
        expect(logo()).toBe('none');
    });

    it('only `true` shows the logo — a truthy string does not', () => {
        window.setHeaderMode('equipment');
        expect(logo()).toBe('none');
        window.setHeaderMode(true);
        expect(logo()).toBe('flex');
    });
});
