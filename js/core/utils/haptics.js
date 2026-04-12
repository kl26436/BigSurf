// haptics.js — Haptic feedback for mobile
// Enhancement only — silently fails if navigator.vibrate is unavailable

const PATTERNS = {
    tap:        [10],                       // light tap
    success:    [20, 40, 20],               // buzz-pause-buzz
    complete:   [30, 50, 30, 50, 30],       // triple buzz (exercise complete)
    warning:    [100, 80, 100],             // strong double
    countdown:  [50, 50, 50],              // urgent triple
    pr:         [20, 30, 20, 30, 20, 30, 20], // celebration ripple
};

export function haptic(type = 'tap') {
    if (!navigator.vibrate) return;
    // Respect reduced motion preference
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    try {
        navigator.vibrate(PATTERNS[type] || PATTERNS.tap);
    } catch {
        // Silently fail — haptics are enhancement only
    }
}
