// DEXA Scan UI — Phase 18
// Upload modal, AI review form, dashboard card, history, detail views

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification, openModal, closeModal } from '../ui/ui-helpers.js';
import {
    uploadDexaPdf,
    extractDexaFromPdf,
    saveDexaScan,
    loadDexaHistory,
    getLatestDexaScan,
    deleteDexaScan,
    analyzeImbalances,
    compareDexaScans,
} from './dexa-scan.js';

// ===================================================================
// DASHBOARD CARD
// ===================================================================

/**
 * Render the DEXA scan dashboard card.
 * @returns {string} HTML string
 */
export async function renderDexaCard() {
    const emptyCard = `
        <div class="hero-card dexa-card">
            <div class="dexa-card-header">
                <h3><i class="fas fa-x-ray"></i> DEXA Scan</h3>
            </div>
            <div class="dexa-card-empty">
                <p>Upload a DEXA scan to track body composition over time.</p>
                <button class="btn btn-primary btn-sm" onclick="showDexaUploadModal()">
                    <i class="fas fa-upload"></i> Upload Scan
                </button>
            </div>
        </div>
    `;

    try {
        const latest = await getLatestDexaScan();
        if (!latest) return emptyCard;

        const dateStr = formatRelativeDate(latest.date);
        const unit = latest.massUnit || 'lbs';

        let summaryItems = '';
        if (latest.totalBodyFat != null) {
            summaryItems += `
                <div class="dexa-stat">
                    <span class="dexa-stat-value">${latest.totalBodyFat}%</span>
                    <span class="dexa-stat-label">Body Fat</span>
                </div>
            `;
        }
        if (latest.totalLeanMass != null) {
            summaryItems += `
                <div class="dexa-stat">
                    <span class="dexa-stat-value">${latest.totalLeanMass}</span>
                    <span class="dexa-stat-label">Lean ${unit}</span>
                </div>
            `;
        }
        if (latest.totalWeight != null) {
            summaryItems += `
                <div class="dexa-stat">
                    <span class="dexa-stat-value">${latest.totalWeight}</span>
                    <span class="dexa-stat-label">Total ${unit}</span>
                </div>
            `;
        }

        // Check for imbalances
        const imbalances = analyzeImbalances(latest);
        let imbalanceHint = '';
        if (imbalances.length > 0) {
            const worst = imbalances[0];
            imbalanceHint = `
                <div class="dexa-imbalance-hint">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${worst.region}: ${worst.weaker} side ${worst.percentDiff}% weaker
                </div>
            `;
        }

        return `
            <div class="hero-card dexa-card">
                <div class="dexa-card-header">
                    <h3><i class="fas fa-x-ray"></i> DEXA Scan</h3>
                    <span class="dexa-card-date">${escapeHtml(dateStr)}</span>
                </div>
                <div class="dexa-card-stats" onclick="showDexaDetail('${escapeAttr(latest.id)}')">
                    ${summaryItems}
                </div>
                ${imbalanceHint}
                <div class="dexa-card-actions">
                    <button class="btn btn-primary btn-sm" onclick="showDexaUploadModal()">
                        <i class="fas fa-upload"></i> New Scan
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="showDexaHistory()">
                        <i class="fas fa-list"></i> History
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('❌ Error rendering DEXA card:', error);
        return emptyCard;
    }
}

// ===================================================================
// UPLOAD MODAL
// ===================================================================

let _selectedFile = null;

/**
 * Show the DEXA scan upload modal.
 */
export function showDexaUploadModal() {
    const modal = document.getElementById('dexa-upload-modal');
    if (!modal) return;

    _selectedFile = null;

    modal.querySelector('.modal-content').innerHTML = `
        <div class="modal-header">
            <h3>Upload DEXA Scan</h3>
            <button class="modal-close-btn" onclick="closeDexaUploadModal()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <div class="dexa-upload-form">
                <label class="dexa-upload-zone" for="dexa-file-input">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <span class="dexa-upload-text">Tap to select your DEXA scan PDF</span>
                    <span class="dexa-upload-hint">Works with any provider (Bodyspec, DexaFit, etc.)</span>
                </label>
                <input type="file" id="dexa-file-input" class="hidden"
                       accept=".pdf" onchange="handleDexaFileSelect()">

                <div id="dexa-file-selected" class="dexa-file-selected hidden">
                    <i class="fas fa-file-pdf"></i>
                    <span id="dexa-file-name"></span>
                    <button class="btn-icon" onclick="clearDexaFile()" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <button id="dexa-upload-btn" class="btn btn-primary btn-block hidden" onclick="handleDexaUpload()">
                    <i class="fas fa-magic"></i> Extract Data with AI
                </button>

                <div class="dexa-upload-divider">
                    <span>or</span>
                </div>

                <button class="btn btn-outline btn-block" onclick="showDexaManualEntry()">
                    <i class="fas fa-keyboard"></i> Enter Manually
                </button>
            </div>
        </div>
    `;

    openModal(modal);
}

/**
 * Close the upload modal.
 */
export function closeDexaUploadModal() {
    _selectedFile = null;
    const modal = document.getElementById('dexa-upload-modal');
    if (modal) closeModal(modal);
}

/**
 * Handle file selection from the input.
 */
export function handleDexaFileSelect() {
    const input = document.getElementById('dexa-file-input');
    if (!input?.files?.length) return;

    const file = input.files[0];

    // Validate file
    if (file.type !== 'application/pdf') {
        showNotification('Please select a PDF file', 'warning');
        input.value = '';
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showNotification('File too large (max 10 MB)', 'warning');
        input.value = '';
        return;
    }

    _selectedFile = file;

    // Show file name and upload button
    const selectedDiv = document.getElementById('dexa-file-selected');
    const nameSpan = document.getElementById('dexa-file-name');
    const uploadBtn = document.getElementById('dexa-upload-btn');
    const uploadZone = document.querySelector('.dexa-upload-zone');

    if (nameSpan) nameSpan.textContent = file.name;
    if (selectedDiv) selectedDiv.classList.remove('hidden');
    if (uploadBtn) uploadBtn.classList.remove('hidden');
    if (uploadZone) uploadZone.classList.add('hidden');
}

/**
 * Clear the selected file.
 */
export function clearDexaFile() {
    _selectedFile = null;
    const input = document.getElementById('dexa-file-input');
    if (input) input.value = '';

    const selectedDiv = document.getElementById('dexa-file-selected');
    const uploadBtn = document.getElementById('dexa-upload-btn');
    const uploadZone = document.querySelector('.dexa-upload-zone');

    if (selectedDiv) selectedDiv.classList.add('hidden');
    if (uploadBtn) uploadBtn.classList.add('hidden');
    if (uploadZone) uploadZone.classList.remove('hidden');
}

/**
 * Orchestrate the upload + extraction flow.
 */
export async function handleDexaUpload() {
    if (!_selectedFile) {
        showNotification('Select a file first', 'warning');
        return;
    }

    const modal = document.getElementById('dexa-upload-modal');
    if (!modal) return;

    // Show loading state
    modal.querySelector('.modal-content').innerHTML = `
        <div class="modal-header">
            <h3>Analyzing Scan</h3>
        </div>
        <div class="modal-body">
            <div class="dexa-analyzing">
                <div class="dexa-analyzing-spinner"></div>
                <p class="dexa-analyzing-status" id="dexa-status">Uploading PDF...</p>
                <p class="dexa-analyzing-hint">This may take 15-30 seconds</p>
            </div>
        </div>
    `;

    try {
        // Step 1: Upload to Storage and get base64
        const { scanId, storagePath, base64 } = await uploadDexaPdf(_selectedFile);

        // Step 2: Extract with AI
        const statusEl = document.getElementById('dexa-status');
        if (statusEl) statusEl.textContent = 'Extracting data with AI...';

        const { extractedData } = await extractDexaFromPdf(base64, _selectedFile.name);

        // Attach storage path to the extracted data
        extractedData.reportUrl = storagePath;

        // Step 3: Show review form
        showDexaReviewForm(scanId, extractedData, false);

    } catch (error) {
        console.error('❌ DEXA upload/extraction failed:', error);

        const errorMsg = error?.message || error?.details || 'Extraction failed';
        const isRateLimit = errorMsg.includes('limit reached') || errorMsg.includes('resource-exhausted');

        modal.querySelector('.modal-content').innerHTML = `
            <div class="modal-header">
                <h3>Extraction Failed</h3>
                <button class="modal-close-btn" onclick="closeDexaUploadModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="dexa-error">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>${isRateLimit ? 'Daily extraction limit reached. You can still enter data manually.' : 'Could not extract data from this PDF. Try entering manually.'}</p>
                    <button class="btn btn-primary btn-block" onclick="showDexaManualEntry()">
                        <i class="fas fa-keyboard"></i> Enter Manually
                    </button>
                </div>
            </div>
        `;
    }
}

// ===================================================================
// REVIEW / MANUAL ENTRY FORM
// ===================================================================

/**
 * Show the review form with pre-filled (or empty) data.
 * @param {string} scanId - Document ID for saving
 * @param {Object} prefillData - AI-extracted data or empty object
 * @param {boolean} isManual - true if user chose manual entry
 */
export function showDexaReviewForm(scanId, prefillData = {}, isManual = false) {
    const modal = document.getElementById('dexa-upload-modal');
    if (!modal) return;

    const data = prefillData;
    const confidence = data.confidence || {};
    const unit = data.massUnit || AppState.globalUnit || 'lbs';

    // Generate a new scanId for manual entry if needed
    if (isManual && !scanId) {
        const date = AppState.getTodayDateString();
        scanId = `${date}_${Date.now()}`;
    }

    const lowConf = (field) => {
        const score = confidence[field];
        if (score == null || score >= 0.85) return '';
        return 'low-confidence';
    };

    const reviewBadge = (field) => {
        const score = confidence[field];
        if (score == null || score >= 0.85) return '';
        return '<span class="confidence-badge">Review</span>';
    };

    modal.querySelector('.modal-content').innerHTML = `
        <div class="modal-header">
            <h3>${isManual ? 'Enter DEXA Data' : 'Review Extracted Data'}</h3>
            <button class="modal-close-btn" onclick="closeDexaUploadModal()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body dexa-review-form">
            ${!isManual ? '<p class="dexa-review-hint">AI extracted these values from your scan. Review and correct any highlighted fields.</p>' : ''}

            <div class="form-group">
                <label>Scan Date</label>
                <input type="date" id="dexa-date" class="form-input" value="${data.date || AppState.getTodayDateString()}">
            </div>

            <div class="form-group">
                <label>Provider <span class="optional-label">(optional)</span></label>
                <input type="text" id="dexa-provider" class="form-input"
                       placeholder="e.g. Bodyspec, DexaFit" value="${escapeAttr(data.provider || '')}">
            </div>

            <div class="form-group ${lowConf('totalBodyFat')}">
                <label>Total Body Fat % ${reviewBadge('totalBodyFat')}</label>
                <input type="number" id="dexa-total-bf" class="form-input"
                       placeholder="e.g. 18.5" step="0.1" min="0" max="100" inputmode="decimal"
                       value="${data.totalBodyFat ?? ''}">
            </div>

            <div class="dexa-form-row">
                <div class="form-group ${lowConf('totalWeight')}">
                    <label>Total Weight ${reviewBadge('totalWeight')}</label>
                    <input type="number" id="dexa-total-weight" class="form-input"
                           placeholder="0" step="0.1" min="0" max="999" inputmode="decimal"
                           value="${data.totalWeight ?? ''}">
                </div>
                <div class="form-group">
                    <label>Unit</label>
                    <select id="dexa-unit" class="form-input">
                        <option value="lbs" ${unit === 'lbs' ? 'selected' : ''}>lbs</option>
                        <option value="kg" ${unit === 'kg' ? 'selected' : ''}>kg</option>
                    </select>
                </div>
            </div>

            <div class="dexa-form-row">
                <div class="form-group">
                    <label>Total Lean Mass</label>
                    <input type="number" id="dexa-total-lean" class="form-input"
                           placeholder="0" step="0.1" min="0" max="999" inputmode="decimal"
                           value="${data.totalLeanMass ?? ''}">
                </div>
                <div class="form-group">
                    <label>Total Fat Mass</label>
                    <input type="number" id="dexa-total-fat" class="form-input"
                           placeholder="0" step="0.1" min="0" max="999" inputmode="decimal"
                           value="${data.totalFatMass ?? ''}">
                </div>
            </div>

            <!-- Regional Data (collapsible) -->
            <div class="dexa-field-group">
                <button class="dexa-field-group-toggle" onclick="toggleDexaSection('dexa-regional')">
                    <span>Regional Breakdown</span>
                    <i class="fas fa-chevron-down" id="dexa-regional-chevron"></i>
                </button>
                <div id="dexa-regional" class="dexa-field-group-content hidden">
                    ${renderRegionalFields('leanMass', 'Lean Mass', data.leanMass, lowConf('leanMass'))}
                    ${renderRegionalFields('fatMass', 'Fat Mass', data.fatMass, lowConf('fatMass'))}
                    ${renderRegionalFields('regionFat', 'Body Fat %', data.regionFat, lowConf('regionFat'))}
                </div>
            </div>

            <!-- Bone Density (collapsible) -->
            <div class="dexa-field-group">
                <button class="dexa-field-group-toggle" onclick="toggleDexaSection('dexa-bone')">
                    <span>Bone Density</span>
                    <i class="fas fa-chevron-down" id="dexa-bone-chevron"></i>
                </button>
                <div id="dexa-bone" class="dexa-field-group-content hidden">
                    <div class="dexa-form-row ${lowConf('boneDensity')}">
                        <div class="form-group">
                            <label>T-Score ${reviewBadge('boneDensity')}</label>
                            <input type="number" id="dexa-t-score" class="form-input"
                                   placeholder="e.g. 1.2" step="0.1" min="-5" max="5" inputmode="decimal"
                                   value="${data.boneDensity?.tScore ?? ''}">
                        </div>
                        <div class="form-group">
                            <label>Z-Score</label>
                            <input type="number" id="dexa-z-score" class="form-input"
                                   placeholder="e.g. 1.5" step="0.1" min="-5" max="5" inputmode="decimal"
                                   value="${data.boneDensity?.zScore ?? ''}">
                        </div>
                    </div>
                </div>
            </div>

            <!-- VAT -->
            <div class="form-group ${lowConf('vat')}">
                <label>Visceral Adipose Tissue ${reviewBadge('vat')} <span class="optional-label">(optional)</span></label>
                <input type="number" id="dexa-vat" class="form-input"
                       placeholder="e.g. 0.8" step="0.1" min="0" max="50" inputmode="decimal"
                       value="${data.vat ?? ''}">
            </div>

            <div class="form-group">
                <label>Notes <span class="optional-label">(optional)</span></label>
                <input type="text" id="dexa-notes" class="form-input"
                       placeholder="e.g. Post-bulk, morning scan" value="${escapeAttr(data.notes || '')}">
            </div>

            <input type="hidden" id="dexa-scan-id" value="${escapeAttr(scanId)}">
            <input type="hidden" id="dexa-report-url" value="${escapeAttr(data.reportUrl || '')}">
            <input type="hidden" id="dexa-confidence" value='${JSON.stringify(confidence)}'>

            <button class="btn btn-primary btn-block" onclick="confirmDexaSave()">
                <i class="fas fa-check"></i> Save Scan
            </button>
        </div>
    `;

    // Open modal if not already open (manual entry flow)
    if (!modal.open) openModal(modal);
}

/**
 * Render regional breakdown fields for a given data category.
 */
function renderRegionalFields(prefix, label, data, lowConfClass) {
    const d = data || {};
    const regions = [
        ['leftArm', 'L Arm'], ['rightArm', 'R Arm'],
        ['leftLeg', 'L Leg'], ['rightLeg', 'R Leg'],
        ['trunk', 'Trunk'],
    ];

    return `
        <div class="dexa-regional-section ${lowConfClass}">
            <h4 class="dexa-regional-label">${label}</h4>
            <div class="dexa-regional-grid">
                ${regions.map(([key, name]) => `
                    <div class="dexa-regional-item">
                        <label>${name}</label>
                        <input type="number" id="dexa-${prefix}-${key}" class="form-input"
                               placeholder="—" step="0.1" min="0" max="999" inputmode="decimal"
                               value="${d[key] ?? ''}">
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Show manual entry (empty review form).
 */
export function showDexaManualEntry() {
    const date = AppState.getTodayDateString();
    const scanId = `${date}_${Date.now()}`;
    showDexaReviewForm(scanId, {}, true);
}

/**
 * Toggle a collapsible section in the review form.
 */
export function toggleDexaSection(sectionId) {
    const section = document.getElementById(sectionId);
    const chevron = document.getElementById(`${sectionId}-chevron`);
    if (section) {
        section.classList.toggle('hidden');
        if (chevron) chevron.classList.toggle('fa-chevron-up');
    }
}

/**
 * Read form values and save the DEXA scan.
 */
export async function confirmDexaSave() {
    const scanId = document.getElementById('dexa-scan-id')?.value;
    if (!scanId) return;

    const date = document.getElementById('dexa-date')?.value;
    if (!date) {
        showNotification('Enter a scan date', 'warning');
        return;
    }

    const totalBodyFat = parseFloatOrNull('dexa-total-bf');
    if (totalBodyFat === null) {
        showNotification('Enter total body fat %', 'warning');
        return;
    }

    const readRegional = (prefix) => {
        const obj = {};
        let hasAny = false;
        for (const key of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'trunk']) {
            const val = parseFloatOrNull(`dexa-${prefix}-${key}`);
            obj[key] = val;
            if (val != null) hasAny = true;
        }
        return hasAny ? obj : null;
    };

    const tScore = parseFloatOrNull('dexa-t-score');
    const zScore = parseFloatOrNull('dexa-z-score');

    const data = {
        date,
        provider: document.getElementById('dexa-provider')?.value?.trim() || null,
        totalBodyFat,
        totalWeight: parseFloatOrNull('dexa-total-weight'),
        totalLeanMass: parseFloatOrNull('dexa-total-lean'),
        totalFatMass: parseFloatOrNull('dexa-total-fat'),
        massUnit: document.getElementById('dexa-unit')?.value || 'lbs',
        leanMass: readRegional('leanMass'),
        fatMass: readRegional('fatMass'),
        regionFat: readRegional('regionFat'),
        boneDensity: (tScore != null || zScore != null) ? { tScore, zScore } : null,
        vat: parseFloatOrNull('dexa-vat'),
        notes: document.getElementById('dexa-notes')?.value?.trim() || '',
        reportUrl: document.getElementById('dexa-report-url')?.value || null,
        extractionConfidence: tryParseJson(document.getElementById('dexa-confidence')?.value),
    };

    const result = await saveDexaScan(scanId, data);
    if (result) {
        closeDexaUploadModal();
        showNotification('DEXA scan saved', 'success', 1500);
    }
}

// ===================================================================
// HISTORY MODAL
// ===================================================================

/**
 * Show DEXA scan history as a timeline.
 */
export async function showDexaHistory() {
    const modal = document.getElementById('dexa-history-modal');
    if (!modal) return;

    const scans = await loadDexaHistory();

    let historyHTML;
    if (scans.length === 0) {
        historyHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-x-ray"></i></div>
                <div class="empty-state-title">No scans yet</div>
                <div class="empty-state-description">Upload your first DEXA scan to start tracking body composition.</div>
                <button class="btn btn-primary btn-sm" onclick="closeDexaHistory(); showDexaUploadModal();">
                    <i class="fas fa-upload"></i> Upload Scan
                </button>
            </div>
        `;
    } else {
        historyHTML = scans.map((scan, i) => {
            const dateStr = formatRelativeDate(scan.date);
            const prev = scans[i + 1]; // Next older scan
            let deltaStr = '';
            if (prev) {
                const delta = compareDexaScans(prev, scan);
                if (delta?.totalBodyFat != null) {
                    const sign = delta.totalBodyFat > 0 ? '+' : '';
                    const cls = delta.totalBodyFat < 0 ? 'delta-positive' : delta.totalBodyFat > 0 ? 'delta-negative' : '';
                    deltaStr = `<span class="dexa-delta ${cls}">${sign}${delta.totalBodyFat}% BF</span>`;
                }
            }

            return `
                <div class="row-card dexa-history-item" onclick="showDexaDetail('${escapeAttr(scan.id)}')">
                    <div class="dexa-history-info">
                        <span class="dexa-history-date">${escapeHtml(dateStr)}</span>
                        <span class="dexa-history-bf">${scan.totalBodyFat != null ? scan.totalBodyFat + '% body fat' : 'No body fat data'}</span>
                        ${scan.provider ? `<span class="dexa-history-provider">${escapeHtml(scan.provider)}</span>` : ''}
                    </div>
                    <div class="dexa-history-right">
                        ${deltaStr}
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
            `;
        }).join('');
    }

    modal.querySelector('.modal-content').innerHTML = `
        <div class="modal-header">
            <h3>DEXA Scan History</h3>
            <button class="modal-close-btn" onclick="closeDexaHistory()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            ${historyHTML}
        </div>
    `;

    openModal(modal);
}

/**
 * Close the history modal.
 */
export function closeDexaHistory() {
    const modal = document.getElementById('dexa-history-modal');
    if (modal) closeModal(modal);
}

// ===================================================================
// DETAIL MODAL
// ===================================================================

/**
 * Show full detail for a single DEXA scan.
 * @param {string} scanId
 */
export async function showDexaDetail(scanId) {
    const modal = document.getElementById('dexa-detail-modal');
    if (!modal) return;

    const scans = await loadDexaHistory();
    const scan = scans.find(s => s.id === scanId);
    if (!scan) {
        showNotification('Scan not found', 'warning');
        return;
    }

    const unit = scan.massUnit || 'lbs';
    const dateStr = formatDateFull(scan.date);
    const imbalances = analyzeImbalances(scan);

    // Find previous scan for comparison
    const scanIndex = scans.indexOf(scan);
    const prevScan = scans[scanIndex + 1];
    const delta = prevScan ? compareDexaScans(prevScan, scan) : null;

    // Summary section
    let summaryHTML = '<div class="dexa-detail-summary">';
    summaryHTML += renderDetailRow('Body Fat', scan.totalBodyFat != null ? `${scan.totalBodyFat}%` : '—', delta?.totalBodyFat, '%');
    summaryHTML += renderDetailRow('Total Weight', scan.totalWeight != null ? `${scan.totalWeight} ${unit}` : '—', delta?.totalWeight, ` ${unit}`);
    summaryHTML += renderDetailRow('Lean Mass', scan.totalLeanMass != null ? `${scan.totalLeanMass} ${unit}` : '—', delta?.totalLeanMass, ` ${unit}`);
    summaryHTML += renderDetailRow('Fat Mass', scan.totalFatMass != null ? `${scan.totalFatMass} ${unit}` : '—', delta?.totalFatMass, ` ${unit}`, true);
    if (scan.vat != null) summaryHTML += renderDetailRow('VAT', `${scan.vat} ${unit}`, null, '');
    if (scan.boneDensity?.tScore != null) summaryHTML += renderDetailRow('Bone T-Score', `${scan.boneDensity.tScore}`, null, '');
    summaryHTML += '</div>';

    // Imbalance section
    let imbalanceHTML = '';
    if (imbalances.length > 0) {
        imbalanceHTML = `
            <div class="dexa-detail-section">
                <h4>Imbalance Analysis</h4>
                ${imbalances.map(imb => `
                    <div class="dexa-imbalance-item dexa-imbalance-${imb.severity}">
                        <i class="fas ${imb.severity === 'significant' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
                        <div>
                            <strong>${imb.region}</strong>: ${imb.weaker} side is ${imb.percentDiff}% weaker
                            <span class="dexa-imbalance-severity">${imb.severity}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Regional breakdown
    let regionalHTML = '';
    if (scan.leanMass) {
        regionalHTML = `
            <div class="dexa-detail-section">
                <h4>Regional Lean Mass (${unit})</h4>
                <div class="dexa-regional-detail">
                    ${renderRegionalDetail(scan.leanMass, delta?.leanMass, unit)}
                </div>
            </div>
        `;
    }

    modal.querySelector('.modal-content').innerHTML = `
        <div class="modal-header">
            <h3>DEXA Scan</h3>
            <button class="modal-close-btn" onclick="closeDexaDetail()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <div class="dexa-detail-date">
                ${escapeHtml(dateStr)}
                ${scan.provider ? ` — ${escapeHtml(scan.provider)}` : ''}
            </div>
            ${delta ? `<p class="dexa-detail-comparison">Compared to previous scan (${delta.daysBetween} days ago)</p>` : ''}
            ${summaryHTML}
            ${imbalanceHTML}
            ${regionalHTML}
            ${scan.notes ? `<div class="dexa-detail-notes"><strong>Notes:</strong> ${escapeHtml(scan.notes)}</div>` : ''}
            <div class="dexa-detail-actions">
                <button class="btn btn-sm btn-danger" onclick="deleteDexaEntry('${escapeAttr(scan.id)}')">
                    <i class="fas fa-trash"></i> Delete Scan
                </button>
            </div>
        </div>
    `;

    openModal(modal);
}

/**
 * Close the detail modal.
 */
export function closeDexaDetail() {
    const modal = document.getElementById('dexa-detail-modal');
    if (modal) closeModal(modal);
}

/**
 * Delete a scan from the detail view.
 */
export async function deleteDexaEntry(scanId) {
    await deleteDexaScan(scanId);
    closeDexaDetail();
    // Refresh history if it's open
    const historyModal = document.getElementById('dexa-history-modal');
    if (historyModal?.open) await showDexaHistory();
}

// ===================================================================
// HELPERS
// ===================================================================

function renderDetailRow(label, value, delta, deltaUnit, invertColor = false) {
    let deltaHTML = '';
    if (delta != null) {
        const sign = delta > 0 ? '+' : '';
        // For fat mass, increase is negative (bad); for lean mass, increase is positive (good)
        let cls = '';
        if (delta !== 0) {
            const isGood = invertColor ? delta < 0 : delta > 0;
            cls = isGood ? 'delta-positive' : 'delta-negative';
        }
        deltaHTML = `<span class="dexa-delta ${cls}">${sign}${delta}${deltaUnit}</span>`;
    }

    return `
        <div class="dexa-detail-row">
            <span class="dexa-detail-label">${label}</span>
            <span class="dexa-detail-value">${value} ${deltaHTML}</span>
        </div>
    `;
}

function renderRegionalDetail(leanMass, deltas, unit) {
    const regions = [
        ['leftArm', 'L Arm'], ['rightArm', 'R Arm'],
        ['leftLeg', 'L Leg'], ['rightLeg', 'R Leg'],
        ['trunk', 'Trunk'],
    ];

    return regions.map(([key, name]) => {
        const val = leanMass[key];
        if (val == null) return '';
        const delta = deltas?.[key];
        let deltaHTML = '';
        if (delta != null) {
            const sign = delta > 0 ? '+' : '';
            const cls = delta > 0 ? 'delta-positive' : delta < 0 ? 'delta-negative' : '';
            deltaHTML = `<span class="dexa-delta ${cls}">${sign}${delta}</span>`;
        }
        return `
            <div class="dexa-regional-detail-item">
                <span class="dexa-regional-detail-label">${name}</span>
                <span class="dexa-regional-detail-value">${val} ${unit} ${deltaHTML}</span>
            </div>
        `;
    }).join('');
}

function parseFloatOrNull(elementId) {
    const el = document.getElementById(elementId);
    if (!el || el.value === '') return null;
    const val = parseFloat(el.value);
    return isNaN(val) ? null : val;
}

function tryParseJson(str) {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
}

function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    const today = AppState.getTodayDateString();
    if (dateStr === today) return 'Today';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (dateStr === yesterdayStr) return 'Yesterday';

    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}
