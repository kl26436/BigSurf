// Data Export & Import — Phase 13
// CSV export, JSON import/restore

import {
    db,
    doc,
    setDoc,
    getDoc,
    getDocs,
    collection,
    query,
    orderBy,
} from './firebase-config.js';
import { showNotification, escapeHtml } from '../ui/ui-helpers.js';
import { openModal, closeModal } from '../ui/ui-helpers.js';
import { getDateString } from '../utils/date-helpers.js';
import { AppState } from '../utils/app-state.js';
import { debugLog } from '../utils/config.js';

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
        for (const [key, exercise] of Object.entries(workout.exercises || {})) {
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

/**
 * Validate JSON import structure.
 */
export function validateImportJSON(data) {
    if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid data format' };
    if (!data.version) return { valid: false, error: 'Missing version field' };
    if (!data.workouts || !Array.isArray(data.workouts)) return { valid: false, error: 'Missing or invalid workouts array' };
    return { valid: true, error: null };
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
        showNotification('Preparing CSV export...', 'info', 2000);

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
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const today = getDateString(new Date());
        a.download = `bigsurf-workouts-${today}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

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
            <h3>Import Workout Data</h3>
            <button class="modal-close-btn" onclick="closeImportModal()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <p class="import-description">
                Import a previously exported Big Surf JSON file. Existing workouts will not be overwritten.
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

// Temporary storage for file data pending import
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

            // Show preview
            const workoutCount = data.workouts?.length || 0;
            const templateCount = data.templates?.length || 0;
            const equipmentCount = data.equipment?.length || 0;

            preview.classList.remove('hidden');
            preview.innerHTML = `
                <div class="import-preview-stats">
                    <div class="import-stat">
                        <span class="import-stat-value">${workoutCount}</span>
                        <span class="import-stat-label">Workouts</span>
                    </div>
                    <div class="import-stat">
                        <span class="import-stat-value">${templateCount}</span>
                        <span class="import-stat-label">Templates</span>
                    </div>
                    <div class="import-stat">
                        <span class="import-stat-value">${equipmentCount}</span>
                        <span class="import-stat-label">Equipment</span>
                    </div>
                </div>
                <p class="import-note">
                    <i class="fas fa-info-circle"></i>
                    Duplicate workouts (same ID) will be skipped.
                </p>
            `;

            // Store data and show import button
            pendingImportData = data;
            actions.classList.remove('hidden');
        } catch (err) {
            preview.classList.remove('hidden');
            preview.innerHTML = `
                <div class="import-error">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>Could not parse JSON file</span>
                </div>
            `;
            actions.classList.add('hidden');
        }
    };

    reader.readAsText(file);
}

/**
 * Confirm and execute the import.
 */
export async function confirmImport() {
    if (!pendingImportData || !AppState.currentUser) return;

    const btn = document.getElementById('import-confirm-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
    }

    try {
        const userId = AppState.currentUser.uid;
        const data = pendingImportData;
        let imported = 0;
        let skipped = 0;

        // Import workouts
        for (const workout of (data.workouts || [])) {
            const docId = workout.id || `${workout.date}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

            // Check if already exists
            const existing = await getDoc(doc(db, 'users', userId, 'workouts', docId));
            if (existing.exists()) {
                skipped++;
                continue;
            }

            // Remove the 'id' field before saving (it's the doc ID, not a data field)
            const { id, ...workoutData } = workout;
            await setDoc(doc(db, 'users', userId, 'workouts', docId), workoutData);
            imported++;
        }

        // Import templates
        let templatesImported = 0;
        for (const template of (data.templates || [])) {
            const templateId = template.id || template.name?.replace(/[^a-zA-Z0-9]/g, '_') || `template_${Date.now()}`;
            const existing = await getDoc(doc(db, 'users', userId, 'workoutTemplates', templateId));
            if (!existing.exists()) {
                const { id, ...templateData } = template;
                await setDoc(doc(db, 'users', userId, 'workoutTemplates', templateId), templateData);
                templatesImported++;
            }
        }

        // Import equipment
        let equipmentImported = 0;
        for (const equip of (data.equipment || [])) {
            const equipId = equip.id || equip.name?.replace(/[^a-zA-Z0-9]/g, '_') || `equip_${Date.now()}`;
            const existing = await getDoc(doc(db, 'users', userId, 'equipment', equipId));
            if (!existing.exists()) {
                const { id, ...equipData } = equip;
                await setDoc(doc(db, 'users', userId, 'equipment', equipId), equipData);
                equipmentImported++;
            }
        }

        const parts = [];
        if (imported > 0) parts.push(`${imported} workouts`);
        if (templatesImported > 0) parts.push(`${templatesImported} templates`);
        if (equipmentImported > 0) parts.push(`${equipmentImported} equipment`);
        if (skipped > 0) parts.push(`${skipped} skipped`);

        const message = parts.length > 0 ? `Imported: ${parts.join(', ')}` : 'No new data to import';
        showNotification(message, 'success', 3000);

        closeImportModal();
        debugLog('Import complete:', { imported, templatesImported, equipmentImported, skipped });
    } catch (error) {
        console.error('❌ Import failed:', error);
        showNotification('Import failed: ' + error.message, 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download"></i> Import';
        }
    }
}
