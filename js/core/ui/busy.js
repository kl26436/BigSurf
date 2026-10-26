// Single-flight for tap handlers — one save per tap, however slow the write.
//
// Writes are local-first (offline.js#commitWrite): on gym signal a save can
// wait up to 5 s for the server's ack. Without a guard, a second tap during
// that wait runs the whole handler again — the Goals page added the same goal
// twice. `once(key, fn)` ignores re-entry while `key` is running, and can
// disable the tapped button and say what's happening meanwhile.

const running = new Set();

/**
 * @template T
 * @param {string} key - one per action ("goal-save", "plan-undo"…)
 * @param {() => Promise<T>} fn
 * @param {{button?: HTMLElement|null, label?: string}} [opts]
 * @returns {Promise<T|undefined>} undefined when the action was already running
 */
export async function once(key, fn, { button = null, label = '' } = {}) {
    if (running.has(key)) return undefined;
    running.add(key);
    const prev = button ? { disabled: button.disabled, html: button.innerHTML } : null;
    if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        if (label) button.textContent = label;
    }
    try {
        return await fn();
    } finally {
        running.delete(key);
        if (button && button.isConnected) {
            button.disabled = prev.disabled;
            button.innerHTML = prev.html;
            button.removeAttribute('aria-busy');
        }
    }
}

export const isBusy = (key) => running.has(key);
