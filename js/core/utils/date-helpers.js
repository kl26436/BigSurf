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
