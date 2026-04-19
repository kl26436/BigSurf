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
 * Return a weekday name for a given date.
 * @param {Date|string|undefined} date — Date object, YYYY-MM-DD string, or omitted (= today)
 * @param {'long'|'short'} format — 'long' (Tuesday) or 'short' (Tue)
 */
export function getDayName(date, format = 'long') {
    let d;
    if (date instanceof Date) d = date;
    else if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [y, m, day] = date.split('-').map(Number);
        d = new Date(y, m - 1, day);
    } else if (typeof date === 'string') {
        d = new Date(date);
    } else {
        d = new Date();
    }
    const names = format === 'short' ? DAY_NAMES_SHORT : DAY_NAMES_LONG;
    return names[d.getDay()];
}
