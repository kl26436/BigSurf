// Date helpers - core/utils/date-helpers.js
// Unified date string extraction to prevent timezone bugs

/**
 * Safe replacement for `new Date(x).toISOString()`. Native toISOString throws
 * RangeError: Invalid time value when the constructor produced an Invalid Date
 * (e.g., NaN input, malformed string). We were seeing this class of error
 * bubble up as unhandledrejection because AI Coach + a few other paths
 * called toISOString on arithmetic that could NaN-out silently.
 *
 * Returns the ISO string when valid, otherwise the fallback (null by default).
 */
export function safeToISOString(input, fallback = null) {
    try {
        const d = input instanceof Date ? input : new Date(input);
        const ms = d.getTime();
        if (!Number.isFinite(ms)) return fallback;
        return d.toISOString();
    } catch {
        return fallback;
    }
}

/**
 * Extract a YYYY-MM-DD date string from any date-like value.
 * Handles ISO strings, Date objects, and plain YYYY-MM-DD strings.
 */
export function getDateString(value) {
    if (!value) return '';

    if (typeof value === 'string') {
        // Already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        // ISO string — extract date part
        if (value.includes('T')) return value.split('T')[0];
        return value;
    }

    // Guard against Invalid Date. Callers that construct with a garbage
    // input (e.g., `new Date('')`, `new Date(NaN)`) used to explode here on
    // toISOString, throwing RangeError up through their caller chain and
    // producing unhandled-rejection log spam. Returning '' matches the
    // "no value" branch above and keeps failures local.
    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) return '';
        return value.toISOString().split('T')[0];
    }

    // Firestore Timestamp
    if (value.toDate) {
        try {
            const d = value.toDate();
            if (!Number.isFinite(d.getTime())) return '';
            return d.toISOString().split('T')[0];
        } catch { return ''; }
    }

    return String(value);
}

const DAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Coerce a date-like value (Date, YYYY-MM-DD, ISO, or ms timestamp) to a
 * local Date object. Returns null on garbage input.
 */
function toLocalDate(value) {
    if (value == null) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [y, m, d] = value.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        const parsed = new Date(value);
        return isNaN(parsed) ? null : parsed;
    }
    if (value.toDate) return value.toDate();
    return null;
}

/**
 * Return a weekday name for a given date.
 * @param {Date|string|undefined} date — Date object, YYYY-MM-DD string, or omitted (= today)
 * @param {'long'|'short'} format — 'long' (Tuesday) or 'short' (Tue)
 */
export function getDayName(date, format = 'long') {
    const d = toLocalDate(date) || new Date();
    const names = format === 'short' ? DAY_NAMES_SHORT : DAY_NAMES_LONG;
    return names[d.getDay()];
}

/**
 * Format a date as a relative label: "Today", "Yesterday", optionally
 * "N days ago" / "N weeks ago", else "MMM d".
 * @param {Date|string|number} dateLike
 * @param {{ daysAgo?: boolean, weeksAgo?: boolean }} [options]
 *   daysAgo: use "N days ago" for 2-6 days (default false)
 *   weeksAgo: use "N weeks ago" for 7-29 days (default false)
 */
export function formatRelativeDate(dateLike, { daysAgo = false, weeksAgo = false } = {}) {
    const date = toLocalDate(dateLike);
    if (!date) return '';

    const todayStr = getDateString(new Date());
    const dateStr = getDateString(date);
    if (dateStr === todayStr) return 'Today';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === getDateString(yesterday)) return 'Yesterday';

    const now = new Date();
    const diffDays = Math.floor((now - date) / 86400000);
    if (daysAgo && diffDays > 0 && diffDays < 7) return `${diffDays} days ago`;
    if (weeksAgo && diffDays >= 7 && diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

