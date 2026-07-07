// Machine photo ID (Phase 8) — camera as input.
//
// Photograph a machine at an unfamiliar gym → the vision callable identifies
// it → fuzzy-match against what the user already owns → one-tap "Add to
// <current gym>" that writes a proper equipment doc through the existing
// saveEquipment path (locations[]/locationIds[] dual-write included).
// Blurry/ambiguous photos surface the model's honest second guess — never a
// junk write.

import { AppState } from '../utils/app-state.js';
import { Config, debugLog } from '../utils/config.js';
import { showNotification, escapeHtml } from '../ui/ui-helpers.js';
import { findBestMatch } from '../data/fuzzy-match.js';
import { composeEquipmentName } from '../utils/equipment-name.js';
import { getSessionGym } from './gym-session-context.js';

let _lastIdentified = null; // {identified, displayName, photoDataUrl}

export function openMachineIdCamera() {
    if (!Config.MACHINE_ID_ENABLED) return;
    if (!AppState.currentUser) {
        showNotification('Sign in first', 'info');
        return;
    }
    // A fresh input each time — iOS Safari won't refire change on the same file.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.className = 'hidden';
    input.onchange = () => {
        const file = input.files?.[0];
        input.remove();
        if (file) identifyFromFile(file);
    };
    document.body.appendChild(input);
    input.click();
}

/** Downscale to ≤1024px JPEG — vision doesn't need more, mobile upload does. */
async function downscaleImage(file, maxDim = 1024) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.85);
}

async function identifyFromFile(file) {
    openMachineIdSheet(`
        <div class="coach-loading machine-id__progress">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Reading the machine…</span>
        </div>
    `);
    try {
        const dataUrl = await downscaleImage(file);
        const imageBase64 = dataUrl.split(',')[1];

        const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
        const identify = httpsCallable(getFunctions(), 'identifyMachine');
        const result = await identify({ imageBase64, mediaType: 'image/jpeg' });
        const identified = result.data?.identified;
        if (!identified?.name) throw new Error('empty result');

        _lastIdentified = {
            identified,
            displayName: composeEquipmentName({ brand: identified.brand, function: identified.machineFunction })
                || identified.name,
            photoDataUrl: dataUrl,
        };
        renderMachineIdResult();
    } catch (e) {
        debugLog('machine id failed:', e);
        const msg = (e?.message || '').includes('resource-exhausted')
            ? 'Daily photo-ID limit reached — try again tomorrow.'
            : (e?.message && !e.message.includes('internal') ? e.message : "Couldn't identify the machine — try a clearer, wider shot.");
        setMachineIdBody(`
            <div class="machine-id__error">
                <i class="fas fa-camera"></i>
                <p>${escapeHtml(msg)}</p>
            </div>
        `);
    }
}

function renderMachineIdResult(useAlt = false) {
    const { identified, photoDataUrl } = _lastIdentified;
    const pick = useAlt && identified.altGuess ? identified.altGuess : identified;
    const displayName = useAlt
        ? (composeEquipmentName({ brand: pick.brand, function: identified.machineFunction }) || pick.name)
        : _lastIdentified.displayName;

    // Already own it? (dice-similarity match against the user's equipment)
    const owned = (AppState._cachedEquipment || []).map(e => e.name).filter(Boolean);
    const match = findBestMatch(pick.name, owned, 0.75) || findBestMatch(displayName, owned, 0.75);
    const gym = getSessionGym() || null;
    const lowConfidence = !useAlt && (identified.confidence ?? 1) < 0.55 && identified.altGuess;

    const exercises = (identified.exercises || []).slice(0, 6);
    setMachineIdBody(`
        <img src="${photoDataUrl}" alt="" class="machine-id__photo">
        <div class="machine-id__name">${escapeHtml(pick.name)}</div>
        ${pick.brand ? `<div class="machine-id__brand">${escapeHtml(pick.brand)}</div>` : ''}
        ${identified.notes ? `<div class="machine-id__notes">${escapeHtml(identified.notes)}</div>` : ''}
        ${exercises.length ? `
        <div class="machine-id__exercises">
            ${exercises.map(x => `<span class="chip chip--sm">${escapeHtml(x)}</span>`).join('')}
        </div>` : ''}
        ${match ? `
        <div class="machine-id__owned">
            <i class="fas fa-check-circle"></i> Looks like your ${escapeHtml(match.match)}
        </div>` : ''}
        ${lowConfidence ? `
        <div class="machine-id__alt">
            Not sure — could also be <button class="btn-text" onclick="useMachineIdAltGuess()">${escapeHtml(identified.altGuess.name)}</button>
        </div>` : ''}
        <div class="aw-sheet__actions machine-id__actions">
            <button class="aw-sheet__action" onclick="closeMachineIdSheet()">Close</button>
            ${!match ? `
            <button class="aw-sheet__action primary" onclick="addIdentifiedMachine(${useAlt ? 'true' : 'false'})">
                ${gym ? `Add to ${escapeHtml(gym)}` : 'Add to equipment'}
            </button>` : ''}
        </div>
    `);
}

export function useMachineIdAltGuess() {
    if (_lastIdentified) renderMachineIdResult(true);
}

export async function addIdentifiedMachine(useAlt = false) {
    const data = _lastIdentified;
    if (!data) return;
    const pick = useAlt && data.identified.altGuess ? data.identified.altGuess : data.identified;
    const gym = getSessionGym() || null;
    try {
        const { FirebaseWorkoutManager } = await import('../data/firebase-workout-manager.js');
        const wm = new FirebaseWorkoutManager(AppState);
        const saved = await wm.saveEquipment({
            name: pick.name,
            brand: pick.brand || null,
            function: data.identified.machineFunction || null,
            equipmentType: data.identified.equipmentType || 'Machine',
            exerciseTypes: (data.identified.exercises || []).slice(0, 6),
            locations: gym ? [gym] : [],
            createdVia: 'photo-id',
        });
        // Keep the in-memory cache honest without a full refetch.
        if (Array.isArray(AppState._cachedEquipment)) {
            AppState._cachedEquipment.push({
                id: typeof saved === 'string' ? saved : saved?.id,
                name: pick.name,
                brand: pick.brand || null,
                equipmentType: data.identified.equipmentType || 'Machine',
                locations: gym ? [gym] : [],
            });
        }
        closeMachineIdSheet();
        showNotification(gym ? `${pick.name} added to ${gym}` : `${pick.name} added`, 'success');
    } catch (e) {
        console.error('❌ Add identified machine failed:', e);
        showNotification("Couldn't save — try again", 'error');
    }
}

// ── Sheet chrome ────────────────────────────────────────────────────

function openMachineIdSheet(bodyHtml) {
    closeMachineIdSheet(true);
    const backdrop = document.createElement('div');
    backdrop.className = 'aw-sheet-backdrop';
    backdrop.id = 'machine-id-backdrop';
    backdrop.onclick = () => closeMachineIdSheet();

    const sheet = document.createElement('div');
    sheet.className = 'aw-sheet';
    sheet.id = 'machine-id-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Identify machine');
    sheet.innerHTML = `
        <div class="aw-sheet__handle"></div>
        <div class="aw-sheet__header">
            <div class="aw-sheet__title">Identify machine</div>
        </div>
        <div class="aw-sheet__body" id="machine-id-body">${bodyHtml}</div>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => { backdrop.classList.add('visible'); sheet.classList.add('visible'); });
}

function setMachineIdBody(html) {
    const body = document.getElementById('machine-id-body');
    if (body) body.innerHTML = html;
}

export function closeMachineIdSheet(immediate = false) {
    const backdrop = document.getElementById('machine-id-backdrop');
    const sheet = document.getElementById('machine-id-sheet');
    if (immediate) { backdrop?.remove(); sheet?.remove(); return; }
    backdrop?.classList.remove('visible');
    sheet?.classList.remove('visible');
    setTimeout(() => { backdrop?.remove(); sheet?.remove(); }, 300);
}

// Self-wire handlers rendered from this module's own template strings.
// (openMachineIdCamera renders in equipment-library-ui → wired via main.js.)
if (typeof window !== 'undefined') {
    window.useMachineIdAltGuess = useMachineIdAltGuess;
    window.addIdentifiedMachine = addIdentifiedMachine;
    window.closeMachineIdSheet = closeMachineIdSheet;
}
