// DEXA Scan Data — Phase 18
// Firebase Storage upload, Cloud Function extraction, Firestore CRUD, imbalance analysis

import {
    db,
    functions,
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    collection,
    query,
    orderBy,
    limit,
    httpsCallable,
} from '../data/firebase-config.js';
import { AppState } from '../utils/app-state.js';
import { showNotification } from '../ui/ui-helpers.js';
import { debugLog } from '../utils/config.js';

// ===================================================================
// PURE FUNCTIONS (imbalance analysis, scan comparison)
// ===================================================================

/**
 * Analyze lean mass imbalances between left/right sides.
 * @param {Object} scan - DEXA scan document with leanMass field
 * @returns {Array<{region: string, weaker: string, percentDiff: number, severity: string}>}
 */
export function analyzeImbalances(scan) {
    if (!scan?.leanMass) return [];

    const imbalances = [];
    const { leftArm, rightArm, leftLeg, rightLeg } = scan.leanMass;

    // Arm comparison
    if (leftArm != null && rightArm != null && leftArm > 0 && rightArm > 0) {
        const diff = Math.abs(leftArm - rightArm) / Math.max(leftArm, rightArm);
        if (diff > 0.05) {
            imbalances.push({
                region: 'Arms',
                weaker: leftArm < rightArm ? 'Left' : 'Right',
                percentDiff: Math.round(diff * 1000) / 10,
                severity: diff > 0.15 ? 'significant' : diff > 0.08 ? 'moderate' : 'mild',
            });
        }
    }

    // Leg comparison
    if (leftLeg != null && rightLeg != null && leftLeg > 0 && rightLeg > 0) {
        const diff = Math.abs(leftLeg - rightLeg) / Math.max(leftLeg, rightLeg);
        if (diff > 0.05) {
            imbalances.push({
                region: 'Legs',
                weaker: leftLeg < rightLeg ? 'Left' : 'Right',
                percentDiff: Math.round(diff * 1000) / 10,
                severity: diff > 0.15 ? 'significant' : diff > 0.08 ? 'moderate' : 'mild',
            });
        }
    }

    return imbalances;
}

/**
 * Compare two DEXA scans and compute deltas.
 * @param {Object} older - Earlier scan
 * @param {Object} newer - More recent scan
 * @returns {Object} Deltas for key fields
 */
export function compareDexaScans(older, newer) {
    if (!older || !newer) return null;

    const delta = {};

    if (older.totalBodyFat != null && newer.totalBodyFat != null) {
        delta.totalBodyFat = Math.round((newer.totalBodyFat - older.totalBodyFat) * 10) / 10;
    }
    if (older.totalWeight != null && newer.totalWeight != null) {
        delta.totalWeight = Math.round((newer.totalWeight - older.totalWeight) * 10) / 10;
    }
    if (older.totalLeanMass != null && newer.totalLeanMass != null) {
        delta.totalLeanMass = Math.round((newer.totalLeanMass - older.totalLeanMass) * 10) / 10;
    }
    if (older.totalFatMass != null && newer.totalFatMass != null) {
        delta.totalFatMass = Math.round((newer.totalFatMass - older.totalFatMass) * 10) / 10;
    }

    // Regional lean mass deltas
    if (older.leanMass && newer.leanMass) {
        delta.leanMass = {};
        for (const key of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'trunk']) {
            if (older.leanMass[key] != null && newer.leanMass[key] != null) {
                delta.leanMass[key] = Math.round((newer.leanMass[key] - older.leanMass[key]) * 10) / 10;
            }
        }
    }

    delta.daysBetween = Math.round(
        (new Date(newer.date) - new Date(older.date)) / (1000 * 60 * 60 * 24)
    );

    return delta;
}

// ===================================================================
// FIREBASE STORAGE (lazy-loaded)
// ===================================================================

let _storageModule = null;

async function getStorageModule() {
    if (!_storageModule) {
        _storageModule = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
    }
    return _storageModule;
}

/**
 * Read a DEXA PDF as base64 for AI extraction.
 * Storage upload is skipped — PDF is sent directly to the Cloud Function.
 * @param {File} file - PDF file from file input
 * @returns {Promise<{scanId: string, storagePath: string, base64: string}>}
 */
export async function uploadDexaPdf(file) {
    if (!AppState.currentUser) throw new Error('Not authenticated');

    const date = AppState.getTodayDateString();
    const scanId = `${date}_${Date.now()}`;

    // Read file as base64 for AI extraction
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Strip data URL prefix to get raw base64
            const result = reader.result.split(',')[1];
            resolve(result);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });

    debugLog('DEXA PDF read as base64, size:', Math.round(base64.length / 1024), 'KB');
    return { scanId, storagePath: null, base64 };
}

// ===================================================================
// CLOUD FUNCTION — AI EXTRACTION
// ===================================================================

/**
 * Send PDF base64 to Cloud Function for AI-powered data extraction.
 * @param {string} base64 - Raw base64 encoded PDF
 * @param {string} fileName - Original file name
 * @returns {Promise<Object>} Extracted DEXA data with confidence scores
 */
export async function extractDexaFromPdf(base64, fileName) {
    const extractFn = httpsCallable(functions, 'extractDexaData');

    const result = await extractFn({
        pdfBase64: base64,
        fileName: fileName || 'dexa-scan.pdf',
    });

    return result.data;
}

// ===================================================================
// FIRESTORE CRUD
// ===================================================================

/**
 * Save a confirmed DEXA scan to Firestore.
 * @param {string} scanId - Document ID
 * @param {Object} data - Confirmed scan data
 */
export async function saveDexaScan(scanId, data) {
    if (!AppState.currentUser) {
        showNotification('Sign in to save scan', 'warning');
        return null;
    }

    const userId = AppState.currentUser.uid;
    const document = {
        ...data,
        createdAt: new Date().toISOString(),
        version: '1.0',
    };

    try {
        await setDoc(doc(db, 'users', userId, 'dexa', scanId), document);
        debugLog('DEXA scan saved:', scanId);
        return { id: scanId, ...document };
    } catch (error) {
        console.error('❌ Failed to save DEXA scan:', error);
        showNotification("Couldn't save scan", 'error');
        return null;
    }
}

/**
 * Load DEXA scan history ordered by date descending.
 * @param {number} [maxEntries=50]
 * @returns {Array}
 */
export async function loadDexaHistory(maxEntries = 50) {
    if (!AppState.currentUser) return [];

    try {
        const userId = AppState.currentUser.uid;
        const ref = collection(db, 'users', userId, 'dexa');
        const q = query(ref, orderBy('date', 'desc'), limit(maxEntries));
        const snapshot = await getDocs(q);

        const scans = [];
        snapshot.forEach(d => scans.push({ id: d.id, ...d.data() }));
        return scans;
    } catch (error) {
        console.error('❌ Failed to load DEXA history:', error);
        return [];
    }
}

/**
 * Get the most recent DEXA scan.
 * @returns {Object|null}
 */
export async function getLatestDexaScan() {
    if (!AppState.currentUser) return null;

    try {
        const userId = AppState.currentUser.uid;
        const ref = collection(db, 'users', userId, 'dexa');
        const q = query(ref, orderBy('date', 'desc'), limit(1));
        const snapshot = await getDocs(q);

        if (snapshot.empty) return null;
        const d = snapshot.docs[0];
        return { id: d.id, ...d.data() };
    } catch (error) {
        console.error('❌ Failed to get latest DEXA scan:', error);
        return null;
    }
}

/**
 * Delete a DEXA scan and its PDF from Storage.
 * @param {string} scanId
 */
export async function deleteDexaScan(scanId) {
    if (!AppState.currentUser) return;

    const userId = AppState.currentUser.uid;

    try {
        // Delete Firestore document
        const scanDoc = await getDoc(doc(db, 'users', userId, 'dexa', scanId));
        await deleteDoc(doc(db, 'users', userId, 'dexa', scanId));

        // Delete PDF from Storage if it exists
        if (scanDoc.exists() && scanDoc.data().reportUrl) {
            try {
                const { getStorage, ref, deleteObject } = await getStorageModule();
                const storage = getStorage();
                const fileRef = ref(storage, scanDoc.data().reportUrl);
                await deleteObject(fileRef);
            } catch (storageErr) {
                // PDF may not exist (manual entry) — non-critical
                debugLog('Storage delete skipped:', storageErr.message);
            }
        }

        showNotification('Scan deleted', 'success', 1500);
    } catch (error) {
        console.error('❌ Failed to delete DEXA scan:', error);
        showNotification("Couldn't delete scan", 'error');
    }
}
