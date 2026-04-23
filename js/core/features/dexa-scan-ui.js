// DEXA Scan UI — Phase 18
// Upload modal, AI review form, dashboard card, history, detail views

import { AppState } from '../utils/app-state.js';
import { escapeHtml, escapeAttr, showNotification, openModal, closeModal } from '../ui/ui-helpers.js';
import { formatRelativeDate } from '../utils/date-helpers.js';
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
// UPLOAD SECTION (Full-Page)
// ===================================================================

let _selectedFile = null;

/**
 * Show the DEXA scan upload as a full-page section.
 */
export function showDexaUploadModal() {
    const section = document.getElementById('dexa-upload-section');
    if (!section) return;

    _selectedFile = null;

    const body = document.getElementById('dexa-upload-content');
    if (!body) return;

    const unit = AppState.globalUnit || 'lbs';
    const isLbs = unit === 'lbs';

    body.innerHTML = `
        <div class="dexa-upload-form">
            <!-- Drop zone (spec §7: .dexa-drop family) -->
            <label class="dexa-drop" for="dexa-file-input">
                <div class="dexa-drop__icon"><i class="fas fa-file-upload"></i></div>
                <div class="dexa-drop__title">Upload scan results</div>
                <div class="dexa-drop__desc">PDF or CSV from your DEXA facility</div>
                <span class="btn-primary dexa-drop__btn">Choose file</span>
            </label>
            <input type="file" id="dexa-file-input" class="hidden"
                   accept=".pdf,.csv,.xlsx" onchange="handleDexaFileSelect()">

            <div id="dexa-file-selected" class="dexa-file-selected hidden">
                <i class="fas fa-file-pdf"></i>
                <span id="dexa-file-name"></span>
                <button class="btn-icon" onclick="clearDexaFile()" title="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- File format pills (spec §7: .dexa-supports family) -->
            <div class="dexa-supports">
                <div class="dexa-supports__pill"><i class="fas fa-file-pdf"></i> Supports PDF</div>
                <div class="dexa-supports__pill"><i class="fas fa-file-csv"></i> CSV / Excel</div>
            </div>

            <!-- Manual entry section -->
            <div class="sec-head"><h3>Or enter manually</h3></div>

            <div class="form-group">
                <label class="form-label">Scan date</label>
                <input type="date" id="dexa-date" class="form-input" value="${AppState.getTodayDateString()}">
            </div>

            <div class="form-group">
                <label class="form-label">Facility <span class="optional-label">(optional)</span></label>
                <input type="text" id="dexa-provider" class="form-input"
                       placeholder="e.g. DexaFit Boston" value="">
            </div>

            <div class="form-group">
                <label class="form-label">Units</label>
                <div class="chips">
                    <button class="chip ${isLbs ? 'active' : ''}" onclick="selectDexaUnit('lbs')" id="dexa-unit-lbs">
                        ${isLbs ? '<i class="fas fa-check"></i> ' : ''}lb / inches
                    </button>
                    <button class="chip ${!isLbs ? 'active' : ''}" onclick="selectDexaUnit('kg')" id="dexa-unit-kg">
                        ${!isLbs ? '<i class="fas fa-check"></i> ' : ''}kg / cm
                    </button>
                </div>
                <input type="hidden" id="dexa-unit" value="${unit}">
            </div>
        </div>

        <!-- Footer button -->
        <div class="dexa-upload-footer">
            <button class="btn btn-primary btn-block" id="dexa-continue-btn" onclick="handleDexaContinue()">
                <i class="fas fa-arrow-right"></i> Continue to results
            </button>
        </div>
    `;

    // Reset save button state
    const saveBtn = document.getElementById('dexa-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    section.classList.remove('hidden');
}

/**
 * Handle unit chip selection.
 */
export function selectDexaUnit(unit) {
    const hiddenInput = document.getElementById('dexa-unit');
    if (hiddenInput) hiddenInput.value = unit;

    const lbsChip = document.getElementById('dexa-unit-lbs');
    const kgChip = document.getElementById('dexa-unit-kg');

    if (lbsChip) {
        lbsChip.classList.toggle('active', unit === 'lbs');
        lbsChip.innerHTML = unit === 'lbs' ? '<i class="fas fa-check"></i> lb / inches' : 'lb / inches';
    }
    if (kgChip) {
        kgChip.classList.toggle('active', unit === 'kg');
        kgChip.innerHTML = unit === 'kg' ? '<i class="fas fa-check"></i> kg / cm' : 'kg / cm';
    }
}

/**
 * Close the upload section.
 */
export function closeDexaUploadModal() {
    _selectedFile = null;
    const section = document.getElementById('dexa-upload-section');
    if (section) section.classList.add('hidden');
}

/**
 * Handle file selection from the input.
 */
export function handleDexaFileSelect() {
    const input = document.getElementById('dexa-file-input');
    if (!input?.files?.length) return;

    const file = input.files[0];

    // Validate file type
    const validTypes = ['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const validExts = ['.pdf', '.csv', '.xlsx'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
        showNotification('Please select a PDF, CSV, or Excel file', 'warning');
        input.value = '';
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showNotification('File too large (max 10 MB)', 'warning');
        input.value = '';
        return;
    }

    _selectedFile = file;

    // Show file name, hide drop zone
    const selectedDiv = document.getElementById('dexa-file-selected');
    const nameSpan = document.getElementById('dexa-file-name');
    const dropZone = document.querySelector('.drop-zone');

    if (nameSpan) nameSpan.textContent = file.name;
    if (selectedDiv) selectedDiv.classList.remove('hidden');
    if (dropZone) dropZone.classList.add('hidden');
}

/**
 * Clear the selected file.
 */
export function clearDexaFile() {
    _selectedFile = null;
    const input = document.getElementById('dexa-file-input');
    if (input) input.value = '';

    const selectedDiv = document.getElementById('dexa-file-selected');
    const dropZone = document.querySelector('.drop-zone');

    if (selectedDiv) selectedDiv.classList.add('hidden');
    if (dropZone) dropZone.classList.remove('hidden');
}

/**
 * Handle "Continue to results" — either upload+extract or go to manual form.
 */
export async function handleDexaContinue() {
    if (_selectedFile) {
        await handleDexaUpload();
    } else {
        // Manual entry — go directly to review form
        showDexaManualEntry();
    }
}

/**
 * Orchestrate the upload + extraction flow.
 */
export async function handleDexaUpload() {
    if (!_selectedFile) {
        showNotification('Select a file first', 'warning');
        return;
    }

    const body = document.getElementById('dexa-upload-content');
    if (!body) return;

    // Show loading state
    body.innerHTML = `
        <div class="dexa-analyzing">
            <div class="dexa-analyzing-spinner"></div>
            <p class="dexa-analyzing-status" id="dexa-status">Uploading file...</p>
            <p class="dexa-analyzing-hint">This may take 15-30 seconds</p>
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

        body.innerHTML = `
            <div class="dexa-error">
                <i class="fas fa-exclamation-circle"></i>
                <p>${isRateLimit ? 'Daily extraction limit reached. You can still enter data manually.' : 'Could not extract data from this PDF. Try entering manually.'}</p>
                <button class="btn btn-primary btn-block" onclick="showDexaManualEntry()">
                    <i class="fas fa-keyboard"></i> Enter Manually
                </button>
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
    const body = document.getElementById('dexa-upload-content');
    if (!body) return;

    const data = prefillData;
    const confidence = data.confidence || {};
    // Use the unit from the hidden field if already set (manual flow), else from data
    const existingUnit = document.getElementById('dexa-unit')?.value;
    const unit = existingUnit || data.massUnit || AppState.globalUnit || 'lbs';

    // Generate a new scanId for manual entry if needed
    if (isManual && !scanId) {
        const date = document.getElementById('dexa-date')?.value || AppState.getTodayDateString();
        scanId = `${date}_${Date.now()}`;
    }

    // Carry over date/provider from the upload form if present
    const dateVal = data.date || document.getElementById('dexa-date')?.value || AppState.getTodayDateString();
    const providerVal = data.provider || document.getElementById('dexa-provider')?.value || '';

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

    body.innerHTML = `
        <div class="dexa-review-form">
            ${!isManual ? '<p class="dexa-review-hint">AI extracted these values. Review and correct any highlighted fields.</p>' : ''}

            <div class="form-group ${lowConf('totalBodyFat')}">
                <label>Total Body Fat % ${reviewBadge('totalBodyFat')}</label>
                <input type="number" id="dexa-total-bf" class="form-input"
                       placeholder="e.g. 18.5" step="0.1" min="0" max="100" inputmode="decimal"
                       value="${data.totalBodyFat ?? ''}">
            </div>

            <div class="dexa-form-row">
                <div class="form-group ${lowConf('totalWeight')}">
                    <label>Total Weight (${unit}) ${reviewBadge('totalWeight')}</label>
                    <input type="number" id="dexa-total-weight" class="form-input"
                           placeholder="0" step="0.1" min="0" max="999" inputmode="decimal"
                           value="${data.totalWeight ?? ''}">
                </div>
                <div class="form-group">
                    <label>Lean Mass (${unit})</label>
                    <input type="number" id="dexa-total-lean" class="form-input"
                           placeholder="0" step="0.1" min="0" max="999" inputmode="decimal"
                           value="${data.totalLeanMass ?? ''}">
                </div>
            </div>

            <div class="dexa-form-row">
                <div class="form-group">
                    <label>Fat Mass (${unit})</label>
                    <input type="number" id="dexa-total-fat" class="form-input"
                           placeholder="0" step="0.1" min="0" max="999" inputmode="decimal"
                           value="${data.totalFatMass ?? ''}">
                </div>
                <div class="form-group">
                    <label>Bone Mass (${unit})</label>
                    <input type="number" id="dexa-bone-mass" class="form-input"
                           placeholder="0" step="0.1" min="0" max="99" inputmode="decimal"
                           value="${data.boneMass ?? ''}">
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
            <input type="hidden" id="dexa-date" value="${escapeAttr(dateVal)}">
            <input type="hidden" id="dexa-provider" value="${escapeAttr(providerVal)}">
            <input type="hidden" id="dexa-unit" value="${escapeAttr(unit)}">
            <input type="hidden" id="dexa-report-url" value="${escapeAttr(data.reportUrl || '')}">
            <input type="hidden" id="dexa-confidence" value='${JSON.stringify(confidence)}'>
        </div>
    `;

    // Enable the Save button in the header
    const saveBtn = document.getElementById('dexa-save-btn');
    if (saveBtn) saveBtn.disabled = false;

    // Ensure section is visible
    const section = document.getElementById('dexa-upload-section');
    if (section) section.classList.remove('hidden');
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
        boneMass: parseFloatOrNull('dexa-bone-mass'),
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
    const modal = document.getElementById('dexa-history-section');
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

    // Populate the full-page body content
    const body = document.getElementById('dexa-history-content') || modal.querySelector('.full-page-body');
    if (body) {
        body.innerHTML = historyHTML;
    }

    // Show as full-page section
    modal.classList.remove('hidden');
}

/**
 * Close the history section.
 */
export function closeDexaHistory() {
    const modal = document.getElementById('dexa-history-section');
    if (modal) modal.classList.add('hidden');
}

// ===================================================================
// DETAIL MODAL
// ===================================================================

/**
 * Show full detail for a single DEXA scan.
 * @param {string} scanId
 */
export async function showDexaDetail(scanId) {
    const section = document.getElementById('dexa-detail-section');
    if (!section) return;

    const scans = await loadDexaHistory();
    const scan = scans.find(s => s.id === scanId);
    if (!scan) {
        showNotification('Scan not found', 'warning');
        return;
    }

    const unit = scan.massUnit || 'lbs';
    const imbalances = analyzeImbalances(scan);

    // Update page title with short date
    const titleEl = document.getElementById('dexa-detail-title');
    const shortDate = formatShortMonthDay(scan.date);
    if (titleEl) titleEl.textContent = `DEXA \u00B7 ${shortDate}`;

    // Overflow menu handler
    const overflowBtn = document.getElementById('dexa-detail-overflow');
    if (overflowBtn) {
        overflowBtn.onclick = () => {
            if (confirm('Delete this scan?')) {
                deleteDexaEntry(scan.id);
            }
        };
    }

    // Find previous scan for comparison
    const scanIndex = scans.indexOf(scan);
    const prevScan = scans[scanIndex + 1];
    const delta = prevScan ? compareDexaScans(prevScan, scan) : null;

    // Summary — 2x2 stat card grid
    const statCards = [
        { label: 'Body fat', val: scan.totalBodyFat, unitStr: '%', delta: delta?.totalBodyFat, deltaUnit: '%', invertColor: true },
        { label: 'Lean mass', val: scan.totalLeanMass, unitStr: unit, delta: delta?.totalLeanMass, deltaUnit: ` ${unit}`, invertColor: false },
        { label: 'Fat mass', val: scan.totalFatMass, unitStr: unit, delta: delta?.totalFatMass, deltaUnit: ` ${unit}`, invertColor: true },
        { label: 'Bone', val: scan.boneMass ?? scan.boneDensity?.tScore, unitStr: scan.boneMass != null ? unit : '', delta: null, deltaUnit: '', invertColor: false },
    ];

    const summaryHTML = `
        <div class="sec-head">
            <h3>Summary</h3>
            ${delta ? `<span class="sec-head-sub">vs ${formatShortMonthDay(prevScan.date)}</span>` : ''}
        </div>
        <div class="dexa-stat-grid">
            ${statCards.map(s => renderStatCard(s)).join('')}
        </div>
    `;

    // Insight card — contextual text based on data
    let insightHTML = '';
    if (delta) {
        const insightText = generateInsight(scan, delta, unit);
        if (insightText) {
            insightHTML = `
                <div class="dexa-insight-card">
                    <i class="fas fa-lightbulb"></i>
                    <div>${insightText}</div>
                </div>
            `;
        }
    }

    // Regional lean mass — horizontal bar chart rows
    let regionalHTML = '';
    if (scan.leanMass) {
        const trunk = scan.leanMass.trunk ?? 0;
        const arms = (scan.leanMass.leftArm ?? 0) + (scan.leanMass.rightArm ?? 0);
        const legs = (scan.leanMass.leftLeg ?? 0) + (scan.leanMass.rightLeg ?? 0);
        const maxVal = Math.max(trunk, arms, legs, 1);

        // L/R balance
        const leftTotal = (scan.leanMass.leftArm ?? 0) + (scan.leanMass.leftLeg ?? 0);
        const rightTotal = (scan.leanMass.rightArm ?? 0) + (scan.leanMass.rightLeg ?? 0);
        const balancePct = leftTotal + rightTotal > 0
            ? Math.abs((leftTotal - rightTotal) / ((leftTotal + rightTotal) / 2) * 100).toFixed(1)
            : 0;
        const isBalanced = balancePct < 3;

        const barRows = [
            { label: 'Trunk', value: trunk, pct: (trunk / maxVal * 100).toFixed(0), color: 'var(--cat-push)' },
            { label: 'Arms', value: arms, pct: (arms / maxVal * 100).toFixed(0), color: 'var(--cat-arms)' },
            { label: 'Legs', value: legs, pct: (legs / maxVal * 100).toFixed(0), color: 'var(--cat-legs)' },
        ];

        regionalHTML = `
            <div class="sec-head"><h3>Regional lean mass</h3></div>
            <div class="stat-card">
                <div class="regional-bars">
                    ${barRows.map(r => `
                        <div class="regional-bar-row">
                            <div class="regional-bar-label">${r.label}</div>
                            <div class="regional-bar-track">
                                <div class="regional-bar-fill" style="--bar-width:${r.pct}%;--bar-color:${r.color};"></div>
                            </div>
                            <div class="regional-bar-value">${r.value.toFixed(1)} ${unit}</div>
                        </div>
                    `).join('')}
                    <div class="regional-bar-row">
                        <div class="regional-bar-label">L/R bal.</div>
                        <div class="regional-balance-status ${isBalanced ? 'balanced' : 'imbalanced'}">
                            ${isBalanced ? 'Balanced' : 'Imbalanced'}
                        </div>
                        <div class="regional-bar-value ${isBalanced ? 'balanced' : 'imbalanced'}">${balancePct}%</div>
                    </div>
                </div>
            </div>
        `;
    }

    // Imbalance detail (if any significant)
    let imbalanceHTML = '';
    if (imbalances.length > 0) {
        imbalanceHTML = imbalances.map(imb => `
            <div class="dexa-insight-card dexa-insight-card--warn">
                <i class="fas ${imb.severity === 'significant' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
                <div><strong>${imb.region}</strong>: ${imb.weaker} side is ${imb.percentDiff}% weaker</div>
            </div>
        `).join('');
    }

    // Visceral fat section
    let vatHTML = '';
    if (scan.vat != null) {
        const vatLevel = scan.vat < 1.5 ? 'Low' : scan.vat < 3 ? 'Moderate' : 'High';
        const vatStatus = scan.vat < 1.5 ? 'healthy range' : scan.vat < 3 ? 'monitor' : 'elevated';
        const vatModifier = scan.vat < 1.5 ? 'good' : scan.vat < 3 ? 'warn' : 'bad';
        const vatColor = scan.vat < 1.5 ? 'var(--success)' : scan.vat < 3 ? 'var(--warning)' : 'var(--danger)';

        vatHTML = `
            <div class="sec-head"><h3>Visceral fat</h3></div>
            <div class="stat-card">
                <div class="vat-row">
                    <div class="vat-info">
                        <div class="stat-val vat-val">${scan.vat}<span class="stat-unit">${unit}</span></div>
                        <div class="vat-status vat-status--${vatModifier}">${vatLevel} \u00B7 ${vatStatus}</div>
                    </div>
                    <svg class="vat-sparkline" width="80" height="40" viewBox="0 0 80 40">
                        <path d="M0,30 L15,28 L30,24 L45,20 L60,14 L80,8" fill="none" stroke="${vatColor}" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
            </div>
        `;
    }

    // Notes
    let notesHTML = '';
    if (scan.notes) {
        notesHTML = `<div class="dexa-detail-notes"><strong>Notes:</strong> ${escapeHtml(scan.notes)}</div>`;
    }

    // Populate body
    const body = document.getElementById('dexa-detail-content') || section.querySelector('.full-page-body');
    if (body) {
        body.innerHTML = `
            ${summaryHTML}
            ${insightHTML}
            ${regionalHTML}
            ${imbalanceHTML}
            ${vatHTML}
            ${notesHTML}
        `;
    }

    section.classList.remove('hidden');
}

/**
 * Close the detail section.
 */
export function closeDexaDetail() {
    const modal = document.getElementById('dexa-detail-section');
    if (modal) modal.classList.add('hidden');
}

/**
 * Delete a scan from the detail view.
 */
export async function deleteDexaEntry(scanId) {
    await deleteDexaScan(scanId);
    closeDexaDetail();
    // Refresh history if it's open
    const historyModal = document.getElementById('dexa-history-section');
    if (historyModal?.open) await showDexaHistory();
}

// ===================================================================
// HELPERS
// ===================================================================

/**
 * Render a single stat card for the 2x2 grid.
 */
function renderStatCard({ label, val, unitStr, delta, deltaUnit, invertColor }) {
    if (val == null) {
        return `
            <div class="stat-card">
                <div class="stat-label">${label}</div>
                <div class="stat-val">\u2014</div>
            </div>
        `;
    }

    let deltaHTML = '';
    if (delta != null && delta !== 0) {
        // For body fat / fat mass, decrease is good; for lean / bone, increase is good
        const isGood = invertColor ? delta < 0 : delta > 0;
        const arrow = delta > 0 ? '\u2191' : '\u2193';
        const cls = isGood ? 'down' : 'up'; // "down" = green (good), "up" = red (bad) per mockup convention
        // Actually: mockup uses "down" class with down arrow for BF decrease (green) and "up" for lean increase (green)
        // So: .stat-delta.up = green (positive change), .stat-delta.down = green (decrease that's good)
        const deltaClass = isGood ? (delta < 0 ? 'down' : 'up') : (delta < 0 ? 'up' : 'down');
        deltaHTML = `<div class="stat-delta ${deltaClass}">${arrow} ${Math.abs(delta)}${deltaUnit}</div>`;
    }

    return `
        <div class="stat-card">
            <div class="stat-label">${label}</div>
            <div class="stat-val">${val}<span class="stat-unit">${unitStr}</span></div>
            ${deltaHTML}
        </div>
    `;
}

/**
 * Generate a contextual insight string from scan data and deltas.
 */
function generateInsight(scan, delta, unit) {
    const parts = [];
    if (delta.totalLeanMass != null && delta.totalLeanMass > 0) {
        parts.push(`added <strong>${delta.totalLeanMass} ${unit} of lean mass</strong>`);
    }
    if (delta.totalFatMass != null && delta.totalFatMass < 0) {
        parts.push(`lost <strong>${Math.abs(delta.totalFatMass)} ${unit} of fat</strong>`);
    }

    if (parts.length === 2) {
        const months = Math.round(delta.daysBetween / 30);
        const timeStr = months > 0 ? `${months} month${months > 1 ? 's' : ''}` : `${delta.daysBetween} days`;
        return `Strong recomp trend: you ${parts[0]} while ${parts[1].replace('lost', 'losing')} in ${timeStr}.`;
    }
    if (parts.length === 1) {
        return `You ${parts[0]} since your last scan.`;
    }

    // Fallback: body fat change
    if (delta.totalBodyFat != null && delta.totalBodyFat !== 0) {
        const dir = delta.totalBodyFat < 0 ? 'dropped' : 'increased';
        return `Body fat ${dir} by ${Math.abs(delta.totalBodyFat)}% since your last scan.`;
    }

    return null;
}

/**
 * Format date as "Apr 3" style.
 */
function formatShortMonthDay(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

