// Back guard — core/ui/back-guard.js (SH-6)
//
// The browser's back (Android back button, iOS edge swipe, a desktop Back
// key) used to leave the app from anywhere, because nothing ever pushed a
// history entry. This keeps ONE guard entry on the history stack whenever
// there is somewhere to go back to INSIDE the app (an open sheet or dialog, a
// drill-down, a page other than the dashboard). A popstate then means "back"
// in app terms — close the top layer or go back a page — and the guard is
// re-armed. At the root (dashboard, nothing open) there is no guard, so back
// leaves the app as users expect.
//
// One guard rather than mirroring the whole navStack into history: the app's
// navigation (navigation.js navStack, sheets, dialogs) stays the single
// source of truth, and history can never drift out of step with it.
//
// Dependencies are injected so the logic is testable without the router.

/**
 * @param {object} deps
 * @param {History} deps.history
 * @param {() => boolean} deps.canGoBack - is there anything to go back to in-app?
 * @param {() => void} deps.goBack - do one in-app "back" step
 * @returns {{ sync: () => void, onPopState: () => void, state: () => object }}
 */
export function createBackGuard({ history, canGoBack, goBack }) {
    let armed = false;
    let ignoreNextPop = false;

    /** Bring the guard in line with whether in-app back has anywhere to go. */
    function sync() {
        const want = !!canGoBack();
        if (want && !armed) {
            history.pushState({ bigsurfBackGuard: true }, '');
            armed = true;
        } else if (!want && armed) {
            // Consume the guard we no longer need, so the next system back
            // leaves the app instead of doing nothing.
            armed = false;
            ignoreNextPop = true;
            history.back();
        }
    }

    function onPopState() {
        if (ignoreNextPop) { ignoreNextPop = false; return; }
        armed = false; // the guard entry was just popped
        if (!canGoBack()) return; // at the root: let the browser leave
        goBack();
        sync();
    }

    return { sync, onPopState, state: () => ({ armed, ignoreNextPop }) };
}
