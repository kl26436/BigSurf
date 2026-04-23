// Body Weight & Measurements Tracking — Phase 12
// Firestore CRUD, moving average, unit conversion, deduplication

import {
    db,
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    collection,
    query,
    orderBy,
    where,
    limit,
} from '../data/firebase-config.js';
import { AppState } from '../utils/app-state.js';
import { showNotification } from '../ui/ui-helpers.js';
import { debugLog } from '../utils/config.js';
import { getDateString } from '../utils/date-helpers.js';

// ===================================================================
// PURE FUNCTIONS (also used by tests)
// ===================================================================

/**
 * Calculate 7-day moving average for body weight entries.
 * @param {Array<{date: string, weight: number}>} entries - Sorted by date ascending
 * @returns {Array<{date: string, weight: number}>} Moving average at each point
 */
export function calculate7DayAverage(entries) {
    if (!entries || entries.length === 0) return [];
    return entries.map((entry, i) => {
        const window = entries.slice(Math.max(0, i - 6), i + 1);
        const avg = window.reduce((sum, e) => sum + e.weight, 0) / window.length;
        return { date: entry.date, weight: Math.round(avg * 10) / 10 };
    });
}

/**
 * Convert a measurement entry to a different unit without mutating original.
 * @param {{weight: number, unit: string}} entry
 * @param {string} targetUnit - 'lbs' or 'kg'
 * @returns {{weight: number, unit: string}}
 */
export function convertMeasurementUnit(entry, targetUnit) {
    if (!entry || !entry.weight) return { weight: 0, unit: targetUnit };
    if (entry.unit === targetUnit) return { ...entry };

    if (entry.unit === 'lbs' && targetUnit === 'kg') {
        return { ...entry, weight: Math.round(entry.weight * 0.453592 * 10) / 10, unit: 'kg' };
    }
    if (entry.unit === 'kg' && targetUnit === 'lbs') {
        return { ...entry, weight: Math.round(entry.weight * 2.20462 * 10) / 10, unit: 'lbs' };
    }
    return { ...entry };
}

/**
 * Deduplicate entries by date, keeping the latest entry for each date.
 * @param {Array<{date: string, weight: number, timestamp: string}>} entries
 * @returns {Array} Deduplicated entries sorted by date
 */
export function deduplicateByDate(entries) {
    if (!entries || entries.length === 0) return [];
    const byDate = new Map();
    for (const entry of entries) {
        const existing = byDate.get(entry.date);
        if (!existing || (entry.timestamp && (!existing.timestamp || entry.timestamp > existing.timestamp))) {
            byDate.set(entry.date, entry);
        }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate weight trend (change over last 7 days).
 * @param {Array<{date: string, weight: number}>} entries - Sorted by date ascending
 * @returns {{direction: string, value: number}|null}
 */
export function calculateWeightTrend(entries) {
    if (!entries || entries.length < 2) return null;

    const recent = entries[entries.length - 1];
    // Find earliest entry within ~7 days
    const sevenDaysAgo = new Date(recent.date);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = getDateString(sevenDaysAgo);

    let compareEntry = null;
    for (const entry of entries) {
        if (entry.date >= sevenDaysAgoStr) {
            compareEntry = entry;
            break;
        }
    }

    if (!compareEntry || compareEntry === recent) {
        // Fall back to comparing with previous entry
        compareEntry = entries[entries.length - 2];
    }

    const diff = Math.round((recent.weight - compareEntry.weight) * 10) / 10;
    return {
        direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
        value: Math.abs(diff),
    };
}

// ===================================================================
// BODY MEASUREMENTS — Extended tracking (Phase 12.4)
// ===================================================================

/** Measurement types with display names */
export const MEASUREMENT_TYPES = {
    neck: 'Neck',
    chest: 'Chest',
    waist: 'Waist',
    hips: 'Hips',
    bicepLeft: 'Bicep (L)',
    bicepRight: 'Bicep (R)',
    thighLeft: 'Thigh (L)',
    thighRight: 'Thigh (R)',
};

// ===================================================================
// FIRESTORE CRUD
// ===================================================================

/**
 * Save a body weight entry to Firestore.
 * @param {number} weight
 * @param {string} unit - 'lbs' or 'kg'
 * @param {Object} options - { bodyFat, notes, measurements }
 */
export async function saveBodyWeight(weight, unit, options = {}) {
    if (!AppState.currentUser) {
        showNotification('Sign in to log weight', 'warning');
        return null;
    }

    const date = AppState.getTodayDateString();
    const timestamp = new Date().toISOString();
    const docId = `${date}_${Date.now()}`;

    const data = {
        date,
        weight: Number(weight),
        unit: unit || AppState.globalUnit,
        bodyFat: options.bodyFat || null,
        notes: options.notes || '',
        measurements: options.measurements || null,
        timestamp,
    };

    try {
        const userId = AppState.currentUser.uid;
        await setDoc(doc(db, 'users', userId, 'measurements', docId), data);
        debugLog('Body weight saved:', data);
        showNotification('Weight logged', 'success', 1500);
        return { id: docId, ...data };
    } catch (error) {
        console.error('❌ Failed to save body weight:', error);
        showNotification('Failed to save weight', 'error');
        return null;
    }
}

/**
 * Load body weight history from Firestore.
 * @param {number} [maxEntries=365] - Maximum entries to load
 * @returns {Array} Deduplicated entries sorted by date ascending
 */
export async function loadBodyWeightHistory(maxEntries = 365) {
    if (!AppState.currentUser) return [];

    try {
        const userId = AppState.currentUser.uid;
        const ref = collection(db, 'users', userId, 'measurements');
        const q = query(ref, orderBy('date', 'desc'), limit(maxEntries));
        const snapshot = await getDocs(q);

        const entries = [];
        snapshot.forEach(d => entries.push({ id: d.id, ...d.data() }));

        // Deduplicate and sort ascending
        return deduplicateByDate(entries);
    } catch (error) {
        console.error('❌ Failed to load body weight history:', error);
        return [];
    }
}

/**
 * Get the latest body weight entry.
 * @returns {Object|null}
 */
export async function getLatestBodyWeight() {
    if (!AppState.currentUser) return null;

    try {
        const userId = AppState.currentUser.uid;
        const ref = collection(db, 'users', userId, 'measurements');
        const q = query(ref, orderBy('timestamp', 'desc'), limit(1));
        const snapshot = await getDocs(q);

        if (snapshot.empty) return null;
        const d = snapshot.docs[0];
        return { id: d.id, ...d.data() };
    } catch (error) {
        console.error('❌ Failed to get latest body weight:', error);
        return null;
    }
}

/**
 * Delete a body weight entry.
 * @param {string} docId
 */
export async function deleteBodyWeight(docId) {
    if (!AppState.currentUser) return;

    try {
        const userId = AppState.currentUser.uid;
        await deleteDoc(doc(db, 'users', userId, 'measurements', docId));
        showNotification('Entry deleted', 'success', 1500);
    } catch (error) {
        console.error('❌ Failed to delete body weight entry:', error);
        showNotification('Failed to delete entry', 'error');
    }
}

/**
 * Get entries filtered by date range (for chart time ranges).
 * @param {string} startDate - YYYY-MM-DD
 * @returns {Array}
 */
export async function getBodyWeightSince(startDate) {
    if (!AppState.currentUser) return [];

    try {
        const userId = AppState.currentUser.uid;
        const ref = collection(db, 'users', userId, 'measurements');
        const q = query(ref, where('date', '>=', startDate), orderBy('date', 'asc'));
        const snapshot = await getDocs(q);

        const entries = [];
        snapshot.forEach(d => entries.push({ id: d.id, ...d.data() }));

        return deduplicateByDate(entries);
    } catch (error) {
        console.error('❌ Failed to load body weight data:', error);
        return [];
    }
}
