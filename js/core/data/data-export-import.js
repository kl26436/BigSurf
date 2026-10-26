// Data Export & Import — Phase 13, full export (launch blocker 11c)
// CSV export, full JSON export ("download my data"), JSON import/restore

import {
    db,
    doc,
    setDoc,
    getDoc,
    getDocs,
    getDocsFromServer,
    collection,
    query,
    orderBy,
} from './firebase-config.js';
import { showNotification, escapeHtml } from '../ui/ui-helpers.js';
import { openModal, closeModal } from '../ui/ui-helpers.js';
import { getDateString } from '../utils/date-helpers.js';
import { AppState } from '../utils/app-state.js';
import { debugLog } from '../utils/config.js';
import { isOnline } from './offline.js';

// ===================================================================
// FULL EXPORT — WHAT'S IN IT
// ===================================================================

export const EXPORT_VERSION = 2;

/**
 * Every subcollection under users/{uid} the app (client or Cloud Functions)
 * writes. Firestore's client SDK can't list subcollections, so this list is
 * the inventory — a new subcollection must be added here or it silently
 * drops out of "download my data". data-export.test.js scans js/ and
 * functions/ for users/{uid} subcollection names and fails on a miss.
 *
 * Whole collections are read (not known doc names) so `preferences` and
 * `stats` pick up every doc in them: settings, favorites, coachMemory,
 * weekPlan, aiRateLimits / personalRecords + its migration backups.
 */
export const EXPORT_COLLECTIONS = [
    'workouts',
    'workoutTemplates',
    'templates',            // legacy pre-v3 templates (read by equipment-migration)
    'programs',
    'equipment',
    'locations',
    'customExercises',
    'exerciseOverrides',
    'hiddenExercises',
    'measurements',
    'dexa',
    'goals',                // TP-1
    'events',               // TP-1
    'reportCards',          // TP-2 — the Sunday report cards
    'stats',
    'preferences',
    'coachHistory',
    'coachAdvice',
    'coachOverrides',
    'integrations',
    'push_subscriptions',
    'device_tokens',
];

/**
 * Fields replaced with a placeholder because they're credentials, not the
 * user's data: anyone holding the file could use them (Withings OAuth tokens,
 * push endpoint keys). The doc itself — connected date, platform — still ships.
 */
export const REDACTED_FIELDS = {
    integrations: ['accessToken', 'refreshToken'],
    push_subscriptions: ['subscription'],
    device_tokens: ['token'],
};
export const REDACTED_PLACEHOLDER = '[redacted]';

/**
 * Data tied to this user that the export can't (or shouldn't) include —
 * written into the file so it's honest about its own gaps.
 */
export const NOT_INCLUDED = [
    { name: 'coachTraces', reason: 'Per-turn AI coach diagnostics. Admin-only in Firestore rules; the app can\'t read them.' },
    { name: 'errorLogs', reason: 'App error reports. Write-only from the app; admin-only reads.' },
    { name: 'scheduled_notifications', reason: 'Pending rest-timer pushes. Server-only, deleted once sent.' },
    { name: 'dexa report files', reason: 'Older DEXA scans may reference an uploaded PDF in Cloud Storage (reportUrl). The scan values are in "dexa"; the PDF file isn\'t.' },
];

// ===================================================================
// PURE FUNCTIONS (also used by tests)
// ===================================================================

/**
 * Escape a string for CSV: wrap in quotes if it contains commas, quotes, or newlines.
 */
export function escapeCSV(str) {
    if (!str) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Generate CSV from workout data. One row per set.
 */
export function generateCSV(workouts) {
    const headers = ['Date', 'Workout Name', 'Exercise', 'Equipment', 'Set #', 'Set Type', 'Reps', 'Weight', 'Unit', 'Notes', 'Duration (min)'];
    const rows = [headers.join(',')];

    for (const workout of workouts) {
        for (const exercise of Object.values(workout.exercises || {})) {
            for (let i = 0; i < (exercise.sets || []).length; i++) {
                const set = exercise.sets[i];
                rows.push([
                    workout.date,
                    escapeCSV(workout.workoutType),
                    escapeCSV(exercise.name || exercise.machine || ''),
                    escapeCSV(exercise.equipment || ''),
                    i + 1,
                    set.type || 'working',
                    set.reps || '',
                    set.weight || '',
                    set.originalUnit || 'lbs',
                    escapeCSV(exercise.notes || ''),
                    workout.totalDuration ? Math.round(workout.totalDuration / 60) : '',
                ].join(','));
            }
        }
    }
    return rows.join('\n');
}

function isPlainObject(v) {
    if (v === null || typeof v !== 'object') return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
}

/**
 * Turn one Firestore field value into plain JSON. Duck-typed so it works on
 * the real SDK classes and on test fakes without importing Firebase:
 * - Timestamp (toDate + seconds) and Date → ISO string
 * - GeoPoint → { latitude, longitude }
 * - DocumentReference → its path string
 * - Bytes → base64 string
 * - arrays / maps → recursed; undefined → null
 */
export function serializeFirestoreValue(value) {
    if (value === undefined || value === null) return null;
    const t = typeof value;
    if (t === 'number') return Number.isFinite(value) ? value : null;
    if (t === 'string' || t === 'boolean') return value;
    if (t === 'bigint') return value.toString();
    if (t !== 'object') return null; // functions, symbols — not storable data

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value.toDate === 'function' && typeof value.seconds === 'number') {
        const d = value.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    }
    if (Array.isArray(value)) {
        return value.map(serializeFirestoreValue);
    }
    if (!isPlainObject(value)) {
        if (value.type === 'document' && typeof value.path === 'string') return value.path;
        if (typeof value.toBase64 === 'function') return value.toBase64();
    }
    if (!isPlainObject(value) && typeof value.latitude === 'number' && typeof value.longitude === 'number') {
        return { latitude: value.latitude, longitude: value.longitude };
    }

    const out = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = serializeFirestoreValue(v);
    }
    return out;
}

/**
 * One exported doc: `{ id, data }`. The doc id sits beside the data instead
 * of being spread into it, so a doc that has its own `id` field (some
 * templates do) round-trips without one clobbering the other.
 */
export function serializeExportDoc(id, data, redactFields = []) {
    const serialized = serializeFirestoreValue(data || {});
    for (const field of redactFields) {
        if (Object.prototype.hasOwnProperty.call(serialized, field)) {
            serialized[field] = REDACTED_PLACEHOLDER;
        }
    }
    return { id: String(id), data: serialized };
}

/**
 * Build the versioned export document.
 *
 * @param {Object} args
 * @param {Object<string, Array<{id: string, data: Object}>>} args.snapshotsByCollection
 *        raw docs per collection name (Firestore values, not yet serialized)
 * @param {{uid: string, email?: string}} args.user
 * @param {string} args.exportedAt ISO timestamp
 * @param {Object|null} [args.rootDoc] users/{uid} itself, if it has data
 * @param {Array<{collection: string, error: string}>} [args.errors] collections that failed to read
 * @param {string[]} [args.collections] which collections to emit (default EXPORT_COLLECTIONS)
 */
export function buildExportDocument({
    snapshotsByCollection = {},
    user = {},
    exportedAt,
    rootDoc = null,
    errors = [],
    collections = EXPORT_COLLECTIONS,
} = {}) {
    const out = {};
    const counts = {};
    for (const name of collections) {
        const docs = Array.isArray(snapshotsByCollection[name]) ? snapshotsByCollection[name] : [];
        out[name] = docs.map(d => serializeExportDoc(d.id, d.data, REDACTED_FIELDS[name] || []));
        counts[name] = out[name].length;
    }

    const userOut = { uid: user.uid || null };
    if (user.email) userOut.email = user.email;
    if (rootDoc && typeof rootDoc === 'object' && Object.keys(rootDoc).length > 0) {
        userOut.profile = serializeFirestoreValue(rootDoc);
    }

    const document = {
        exportVersion: EXPORT_VERSION,
        exportedAt: exportedAt || new Date().toISOString(),
        app: 'Big Surf',
        user: userOut,
        counts,
        collections: out,
        notIncluded: NOT_INCLUDED,
    };
    if (errors.length > 0) {
        document.incomplete = errors.map(e => ({ collection: e.collection, error: String(e.error) }));
    }
    return document;
}

/**
 * Which export format a parsed file is: 2 (full export), 1 (legacy
 * `{ version: '3.0', workouts, templates, equipment }`), or null.
 */
export function detectExportVersion(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.exportVersion !== undefined) return Number(data.exportVersion);
    if (data.version) return 1;
    return null;
}

/**
 * Validate JSON import structure. Accepts v1 and v2 exports.
 */
export function validateImportJSON(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { valid: false, error: 'Invalid data format' };

    const version = detectExportVersion(data);
    if (version === null) return { valid: false, error: 'Missing version field' };

    if (version === 1) {
        if (!data.workouts || !Array.isArray(data.workouts)) return { valid: false, error: 'Missing or invalid workouts array' };
        return { valid: true, error: null };
    }

    if (version === EXPORT_VERSION) {
        const c = data.collections;
        if (!c || typeof c !== 'object' || Array.isArray(c)) return { valid: false, error: 'Missing collections' };
        for (const name of ['workouts', 'workoutTemplates', 'equipment']) {
            if (c[name] !== undefined && !Array.isArray(c[name])) {
                return { valid: false, error: `Invalid ${name} list` };
            }
        }
        if (!Array.isArray(c.workouts)) return { valid: false, error: 'Missing or invalid workouts array' };
        return { valid: true, error: null };
    }

    if (Number.isFinite(version) && version > EXPORT_VERSION) {
        return { valid: false, error: 'This file is from a newer version of Big Surf' };
    }
    return { valid: false, error: 'Unknown export version' };
}

function v1Entry(item) {
    if (!item || typeof item !== 'object') return null;
    const { id, ...data } = item;
    return { docId: id ? String(id) : null, data };
}

function v2Entry(item) {
    if (!item || typeof item !== 'object') return null;
    const data = item.data && typeof item.data === 'object' ? item.data : {};
    return { docId: item.id ? String(item.id) : null, data };
}

/**
 * Normalize a validated v1 or v2 file into what import restores:
 * `{ version, workouts, templates, equipment }`, each a list of
 * `{ docId|null, data }`. Import deliberately restores only these three —
 * the other v2 collections (settings, PRs, programs, coach…) are export-only;
 * writing them back over live data isn't safe to do blindly.
 */
export function normalizeImportData(data) {
    const version = detectExportVersion(data);
    if (version === EXPORT_VERSION) {
        const c = data.collections || {};
        const list = (arr) => (Array.isArray(arr) ? arr.map(v2Entry).filter(Boolean) : []);
        return {
            version,
            workouts: list(c.workouts),
            templates: list(c.workoutTemplates),
            equipment: list(c.equipment),
        };
    }
    const list = (arr) => (Array.isArray(arr) ? arr.map(v1Entry).filter(Boolean) : []);
    return {
        version: 1,
        workouts: list(data?.workouts),
        templates: list(data?.templates),
        equipment: list(data?.equipment),
    };
}

// ===================================================================
// DOWNLOAD HELPER
// ===================================================================

function downloadFile(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ===================================================================
// FULL JSON EXPORT (launch blocker 11c)
// ===================================================================

/**
 * Read every exportable collection for this user. One failed collection
 * doesn't sink the export — it's listed under `incomplete` instead.
 */
async function readAllUserCollections(uid) {
    // From the SERVER: with the offline cache on, getDocs on one bar of
    // signal quietly returns whatever the device has — a partial file that
    // looks complete. A server-only read fails instead, and the collection
    // is listed under `incomplete`.
    const results = await Promise.allSettled(
        EXPORT_COLLECTIONS.map(name => getDocsFromServer(collection(db, 'users', uid, name)))
    );
    const snapshotsByCollection = {};
    const errors = [];
    results.forEach((r, i) => {
        const name = EXPORT_COLLECTIONS[i];
        if (r.status === 'fulfilled') {
            const docs = [];
            r.value.forEach(d => docs.push({ id: d.id, data: d.data() }));
            snapshotsByCollection[name] = docs;
        } else {
            console.error(`❌ Export couldn't read ${name}:`, r.reason);
            errors.push({ collection: name, error: r.reason?.code || r.reason?.message || 'read failed' });
        }
    });

    let rootDoc = null;
    try {
        const rootSnap = await getDoc(doc(db, 'users', uid));
        if (rootSnap.exists()) rootDoc = rootSnap.data();
    } catch (err) {
        debugLog('Export: root user doc unreadable', err?.message);
    }
    return { snapshotsByCollection, errors, rootDoc };
}

/**
 * Download everything this user has as one versioned JSON document.
 */
export async function exportAllUserData(state = AppState) {
    const user = state?.currentUser;
    if (!user) {
        showNotification('Sign in to export data', 'warning');
        return null;
    }

    // Offline, every read would come from this device's cache — a partial
    // file that looks complete. Ask for a connection instead.
    if (!isOnline()) {
        showNotification("You're offline — connect to export all your data", 'warning');
        return null;
    }

    try {
        showNotification('Preparing export…', 'info', 2000);

        const { snapshotsByCollection, errors, rootDoc } = await readAllUserCollections(user.uid);
        const exportDoc = buildExportDocument({
            snapshotsByCollection,
            user: { uid: user.uid, email: user.email },
            exportedAt: new Date().toISOString(),
            rootDoc,
            errors,
        });

        downloadFile(
            JSON.stringify(exportDoc, null, 2),
            'application/json',
            `bigsurf-export-${getDateString(new Date())}.json`
        );

        if (errors.length > 0) {
            showNotification(`Exported, but couldn't read: ${errors.map(e => e.collection).join(', ')}`, 'warning', 5000);
        } else {
            const n = exportDoc.counts.workouts;
            showNotification(`All data exported — ${n} workout${n === 1 ? '' : 's'}`, 'success', 2500);
        }
        return exportDoc;
    } catch (error) {
        console.error('❌ Export failed:', error);
        showNotification("Couldn't export — try again", 'error');
        return null;
    }
}

// ===================================================================
// CSV EXPORT (Phase 13.1)
// ===================================================================

/**
 * Export workout data as CSV file download.
 */
export async function exportWorkoutDataAsCSV() {
    if (!AppState.currentUser) {
        showNotification('Sign in to export data', 'warning');
        return;
    }

    try {
        showNotification('Preparing CSV export…', 'info', 2000);

        const userId = AppState.currentUser.uid;
        const workoutsRef = collection(db, 'users', userId, 'workouts');
        const q = query(workoutsRef, orderBy('date', 'desc'));
        const snapshot = await getDocs(q);

        const workouts = [];
        snapshot.forEach(d => workouts.push({ id: d.id, ...d.data() }));

        if (workouts.length === 0) {
            showNotification('No workouts to export', 'warning');
            return;
        }

        const csv = generateCSV(workouts);
        downloadFile(csv, 'text/csv;charset=utf-8;', `bigsurf-workouts-${getDateString(new Date())}.csv`);

        showNotification(`Exported ${workouts.length} workouts as CSV`, 'success', 2000);
    } catch (error) {
        console.error('❌ CSV export failed:', error);
        showNotification('CSV export failed', 'error');
    }
}

// ===================================================================
// JSON IMPORT (Phase 13.2)
// ===================================================================

/**
 * Show the import modal with file picker.
 */
export function showImportModal() {
    const modal = document.getElementById('import-data-modal');
    if (!modal) return;

    modal.querySelector('.modal-content').innerHTML = `
        <div class="modal-header">
            <h3>Import workout data</h3>
            <button class="modal-close-btn" onclick="closeImportModal()" aria-label="Close">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <p class="import-description">
                Import a Big Surf JSON export. Restores workouts, saved workouts and equipment — nothing you already have is overwritten.
            </p>
            <div class="import-file-area" id="import-file-area">
                <input type="file" id="import-file-input" accept=".json" class="hidden"
                       onchange="handleImportFileSelect(event)">
                <label for="import-file-input" class="import-file-label">
                    <i class="fas fa-file-upload"></i>
                    <span>Choose JSON file</span>
                </label>
                <div id="import-file-info" class="hidden"></div>
            </div>
            <div id="import-preview" class="hidden"></div>
            <div id="import-actions" class="hidden">
                <button class="btn btn-primary btn-block" id="import-confirm-btn" onclick="confirmImport()">
                    <i class="fas fa-download"></i> Import
                </button>
            </div>
        </div>
    `;

    openModal(modal);
}

/**
 * Close import modal.
 */
export function closeImportModal() {
    const modal = document.getElementById('import-data-modal');
    if (modal) closeModal(modal);
    // Clear any cached data
    pendingImportData = null;
}

// Normalized file data pending import ({ version, workouts, templates, equipment })
let pendingImportData = null;

/**
 * Handle file selection for import.
 */
export function handleImportFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileInfo = document.getElementById('import-file-info');
    const preview = document.getElementById('import-preview');
    const actions = document.getElementById('import-actions');

    // Show file info
    fileInfo.classList.remove('hidden');
    fileInfo.innerHTML = `
        <div class="import-file-selected">
            <i class="fas fa-file-code"></i>
            <span>${escapeHtml(file.name)}</span>
            <span class="import-file-size">(${(file.size / 1024).toFixed(1)} KB)</span>
        </div>
    `;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const validation = validateImportJSON(data);

            if (!validation.valid) {
                preview.classList.remove('hidden');
                preview.innerHTML = `
                    <div class="import-error">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>Invalid file: ${escapeHtml(validation.error)}</span>
                    </div>
                `;
                actions.classList.add('hidden');
                return;
            }

            const normalized = normalizeImportData(data);
            const exportOnlyNote = normalized.version === EXPORT_VERSION
                ? ' Settings, PRs, programs, body data and coach history in this file stay export-only.'
                : '';

            preview.classList.remove('hidden');
            preview.innerHTML = `
                <div class="import-preview-stats">
                    <div class="import-stat">
                        <span class="import-stat-value">${normalized.workouts.length}</span>
                        <span class="import-stat-label">Workouts</span>
                    </div>
                    <div class="import-stat">
                        <span class="import-stat-value">${normalized.templates.length}</span>
                        <span class="import-stat-label">Saved workouts</span>
                    </div>
                    <div class="import-stat">
                        <span class="import-stat-value">${normalized.equipment.length}</span>
                        <span class="import-stat-label">Equipment</span>
                    </div>
                </div>
                <p class="import-note">
                    <i class="fas fa-info-circle"></i>
                    Anything you already have (same ID) is skipped.${exportOnlyNote}
                </p>
            `;

            // Store data and show import button
            pendingImportData = normalized;
            actions.classList.remove('hidden');
        } catch {
            preview.classList.remove('hidden');
            preview.innerHTML = `
                <div class="import-error">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>Couldn't read this JSON file</span>
                </div>
            `;
            actions.classList.add('hidden');
        }
    };

    reader.readAsText(file);
}

/**
 * Write each entry whose doc id doesn't exist yet. Never overwrites.
 * @returns {Promise<{written: number, skipped: number}>}
 */
async function restoreMissingDocs(userId, collectionName, entries, fallbackId) {
    let written = 0;
    let skipped = 0;
    for (const entry of entries) {
        const docId = entry.docId || fallbackId(entry.data);
        const ref = doc(db, 'users', userId, collectionName, docId);
        const existing = await getDoc(ref);
        if (existing.exists()) {
            skipped++;
            continue;
        }
        await setDoc(ref, entry.data);
        written++;
    }
    return { written, skipped };
}

/**
 * Confirm and execute the import.
 */
export async function confirmImport() {
    if (!pendingImportData || !AppState.currentUser) return;
    // Each restore checks the server for an existing doc — offline that read
    // throws on anything uncached and the import stops halfway.
    if (!isOnline()) {
        showNotification("You're offline — connect to import your data", 'warning');
        return;
    }

    const btn = document.getElementById('import-confirm-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing…';
    }

    try {
        const userId = AppState.currentUser.uid;
        const data = pendingImportData;
        const rand = () => Math.random().toString(36).substr(2, 4);

        const workouts = await restoreMissingDocs(userId, 'workouts', data.workouts,
            (w) => `${w.date}_${Date.now()}_${rand()}`);
        const templates = await restoreMissingDocs(userId, 'workoutTemplates', data.templates,
            (t) => t.name?.replace(/[^a-zA-Z0-9]/g, '_') || `template_${Date.now()}`);
        const equipment = await restoreMissingDocs(userId, 'equipment', data.equipment,
            (eq) => eq.name?.replace(/[^a-zA-Z0-9]/g, '_') || `equip_${Date.now()}`);

        // Only workout duplicates were ever reported as "skipped"; keep that.
        const skipped = workouts.skipped;
        const parts = [];
        if (workouts.written > 0) parts.push(`${workouts.written} workouts`);
        if (templates.written > 0) parts.push(`${templates.written} saved workouts`);
        if (equipment.written > 0) parts.push(`${equipment.written} equipment`);
        if (skipped > 0) parts.push(`${skipped} skipped`);

        const message = parts.length > 0 ? `Imported: ${parts.join(', ')}` : 'No new data to import';
        showNotification(message, 'success', 3000);

        closeImportModal();
        debugLog('Import complete:', { version: data.version, workouts, templates, equipment });
    } catch (error) {
        console.error('❌ Import failed:', error);
        showNotification("Couldn't import — try again", 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download"></i> Import';
        }
    }
}
