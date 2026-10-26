// @vitest-environment jsdom
// SH-6 — pages a flow paints itself (workout start, the exercise library's
// edit page and equipment hand-offs) go through enterSection: the back stack
// and the system-back guard see them exactly like navigateTo pages.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const SECTIONS = [
    'dashboard', 'active-workout', 'exercise-manager-section',
    'edit-exercise-section', 'equipment-editor-section', 'equipment-library-section',
];

let nav;

beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = SECTIONS
        .map(id => `<section id="${id}" class="${id === 'dashboard' ? '' : 'hidden'}"></section>`)
        .join('');
    nav = await import('../../js/core/ui/navigation.js');
});

const visible = () => SECTIONS.filter(id => !document.getElementById(id).classList.contains('hidden'));

describe('enterSection (SH-6)', () => {
    it('starting a workout from the dashboard records it and arms the system-back guard', () => {
        const push = vi.spyOn(window.history, 'pushState');
        nav.enterSection('active-workout');
        expect(visible()).toEqual(['active-workout']);
        expect(nav.navStackSnapshot()).toEqual(['dashboard']);
        expect(push).toHaveBeenCalledTimes(1); // a system back now stays in the app
        push.mockRestore();
    });

    it('"edit exercise" from the live workout passes through the library without leaving it in the back path', () => {
        nav.enterSection('active-workout');
        nav.enterSection('exercise-manager-section');
        nav.enterSection('edit-exercise-section', { replace: true });
        expect(visible()).toEqual(['edit-exercise-section']);
        // Back from the edit page lands on the workout, not the library.
        expect(nav.navStackSnapshot()).toEqual(['dashboard', 'active-workout']);
    });

    it('the edit page → equipment library → back path stacks like any drill-down', () => {
        nav.enterSection('exercise-manager-section');
        nav.enterSection('edit-exercise-section');
        nav.enterSection('equipment-library-section');
        expect(nav.navStackSnapshot()).toEqual(['dashboard', 'exercise-manager-section', 'edit-exercise-section']);
    });

    it('going "forward" to the page below is going back — no ping-pong in the stack', () => {
        nav.enterSection('edit-exercise-section');
        nav.enterSection('equipment-editor-section');
        nav.enterSection('edit-exercise-section');
        expect(nav.navStackSnapshot()).toEqual(['dashboard']);
        expect(visible()).toEqual(['edit-exercise-section']);
    });

    it('entering the page that is already showing changes nothing', () => {
        nav.enterSection('dashboard');
        expect(nav.navStackSnapshot()).toEqual([]);
        expect(visible()).toEqual(['dashboard']);
    });
});
