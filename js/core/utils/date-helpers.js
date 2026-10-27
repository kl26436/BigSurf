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
 * formatRelative's sentence form ("3 days ago", "last week"), else "MMM d".
 * @param {Date|string|number} dateLike
 * @param {{ daysAgo?: boolean, weeksAgo?: boolean }} [options]
 *   daysAgo: use "N days ago" for 2-6 days (default false)
 *   weeksAgo: use "N weeks ago" for 7-29 days (default false)
 */
export function formatRelativeDate(dateLike, { daysAgo = false, weeksAgo = false } = {}) {
    const date = toLocalDate(dateLike);
    if (!date || isNaN(date)) return '';

    // Local calendar days — getDateString is UTC, so after ~5 pm in the US
    // today's workout lost its "Today".
    const now = new Date();
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(now) - startOf(date)) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if ((daysAgo && days > 1 && days < 7) || (weeksAgo && days >= 7 && days < 30)) {
        return formatRelative(dateLike, { now });
    }

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}


/**
 * UD-4 — a duration as display copy: "42 min", "1 h 5 min". The one place a
 * workout length is spelled (C-8: spell units out in display copy).
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
    const mins = Math.max(0, Math.round((Number(seconds) || 0) / 60));
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * UD-4 — a date as display copy: "Tue, Oct 14" ("Tue, Oct 14, 2025" in
 * another year). The one short-date format for workouts and weigh-ins.
 * @param {Date|string|number} dateLike — Date, YYYY-MM-DD, ISO string or ms
 */
export function formatDateShort(dateLike, { now = new Date() } = {}) {
    const date = toLocalDate(dateLike);
    if (!date || isNaN(date)) return '';
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return date.toLocaleDateString('en-US', opts);
}

const RELATIVE = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
    ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    : null;

/**
 * UD-4 — THE relative time ("… ago"). Two forms, per C-8:
 *   dense    "just now" · "12m ago" · "3h ago" · "today" · "3d ago" · "2w ago" · "5mo ago" · "1y ago"
 *   sentence "just now" · "12 minutes ago" · "3 hours ago" · "today" · "yesterday" · "3 days ago" · "last week"…
 * A YYYY-MM-DD date counts calendar days (no clock time, so never "3h ago").
 * Sentence form uses Intl.RelativeTimeFormat so plurals come out right.
 * @param {Date|string|number} dateLike
 * @param {{dense?: boolean, now?: Date}} [opts]
 * @returns {string} '' when the date can't be read
 */
export function formatRelative(dateLike, { dense = false, now = new Date() } = {}) {
    const date = toLocalDate(dateLike);
    if (!date || isNaN(date)) return '';
    const dateOnly = typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike);
    const say = (n, unit, short) => (dense || !RELATIVE ? `${n}${short} ago` : RELATIVE.format(-n, unit));
    // Local calendar days (getDateString is UTC — wrong after ~5 pm in the US).
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    if (!dateOnly) {
        const mins = Math.floor((now - date) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return say(mins, 'minute', 'm');
        const hours = Math.floor(mins / 60);
        if (hours < 24 && startOf(date) === startOf(now)) return say(hours, 'hour', 'h');
    }
    const days = Math.round((startOf(now) - startOf(date)) / 86400000);
    if (days <= 0) return 'today';
    if (days < 7) return say(days, 'day', 'd');
    if (days < 30) return say(Math.floor(days / 7), 'week', 'w');
    if (days < 365) return say(Math.floor(days / 30), 'month', 'mo');
    return say(Math.floor(days / 365), 'year', 'y');
}
