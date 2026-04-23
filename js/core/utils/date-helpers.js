// Date helpers - core/utils/date-helpers.js
// Unified date string extraction to prevent timezone bugs

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

    if (value instanceof Date) {
        return value.toISOString().split('T')[0];
    }

    // Firestore Timestamp
    if (value.toDate) {
        return value.toDate().toISOString().split('T')[0];
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

