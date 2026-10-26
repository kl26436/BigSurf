// SH-6 — the back guard: one history entry while there's somewhere to go
// back to in-app; a popstate does one in-app back step; at the root the
// browser's back leaves the app. Pure module, fake history.

import { describe, it, expect } from 'vitest';
import { createBackGuard } from '../../js/core/ui/back-guard.js';

function fakeHistory() {
    const h = { entries: 1, pushes: 0, backs: 0 };
    h.pushState = () => { h.entries++; h.pushes++; };
    h.back = () => { h.entries--; h.backs++; };
    return h;
}

describe('back guard (SH-6)', () => {
    it('arms one entry when there is somewhere to go back to — and never stacks a second', () => {
        const history = fakeHistory();
        let depth = 1; // e.g. a drill-down open
        const g = createBackGuard({ history, canGoBack: () => depth > 0, goBack: () => { depth--; } });
        g.sync(); g.sync();
        expect(history.pushes).toBe(1);
        expect(g.state().armed).toBe(true);
    });

    it('a system back does one in-app step and re-arms while there is more to go back to', () => {
        const history = fakeHistory();
        let depth = 2; // sheet over a detail page
        const steps = [];
        const g = createBackGuard({ history, canGoBack: () => depth > 0, goBack: () => { steps.push(depth); depth--; } });
        g.sync();
        history.entries--; g.onPopState(); // the browser popped the guard
        expect(steps).toEqual([2]);
        expect(history.pushes).toBe(2);     // re-armed: one more level to go
        history.entries--; g.onPopState();
        expect(steps).toEqual([2, 1]);
        expect(g.state().armed).toBe(false); // at the root now: no guard
        expect(history.pushes).toBe(2);
    });

    it('at the root a system back is left to the browser (leaves the app)', () => {
        const history = fakeHistory();
        let calls = 0;
        const g = createBackGuard({ history, canGoBack: () => false, goBack: () => { calls++; } });
        g.onPopState();
        expect(calls).toBe(0);
        expect(history.pushes).toBe(0);
    });

    it('an in-app back to the root consumes the spare guard, ignoring its own popstate', () => {
        const history = fakeHistory();
        let depth = 1;
        let calls = 0;
        const g = createBackGuard({ history, canGoBack: () => depth > 0, goBack: () => { calls++; depth--; } });
        g.sync();
        depth = 0;           // the user tapped the on-screen back arrow
        g.sync();            // guard no longer needed → history.back()
        expect(history.backs).toBe(1);
        g.onPopState();      // …whose popstate must not trigger another step
        expect(calls).toBe(0);
        expect(g.state()).toEqual({ armed: false, ignoreNextPop: false });
    });
});
