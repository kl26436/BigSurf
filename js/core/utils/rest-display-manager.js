// Rest Display Manager - core/utils/rest-display-manager.js
// Single interval that drives all rest timer display updates across the app.
// Replaces separate setInterval calls in ui-helpers.js and dashboard-ui.js.

const updaters = new Map();
let intervalId = null;

function tick() {
    // Run all registered updaters
    for (const [key, fn] of updaters) {
        try {
            fn();
        } catch (e) {
            // Updater threw (element gone, etc.) — unregister it
            updaters.delete(key);
        }
    }

    // Auto-stop when no updaters remain
    if (updaters.size === 0) {
        stop();
    }
}

function ensureRunning() {
    if (!intervalId) {
        intervalId = setInterval(tick, 1000);
    }
}

function stop() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

/**
 * Register a display updater function under a unique key.
 * The function will be called once per second while any updaters are registered.
 * Calling register with the same key replaces the previous updater.
 */
export function registerRestDisplayUpdater(key, fn) {
    updaters.set(key, fn);
    fn(); // Run immediately on registration
    ensureRunning();
}

/**
 * Unregister a display updater by key and stop the interval if none remain.
 */
export function unregisterRestDisplayUpdater(key) {
    updaters.delete(key);
    if (updaters.size === 0) {
        stop();
    }
}
