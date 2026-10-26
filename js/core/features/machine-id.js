// Machine photo ID (Phase 8) — camera as input.
//
// Photograph a machine at an unfamiliar gym → the vision callable identifies
// it → fuzzy-match against what the user already owns → one-tap "Add to
// <current gym>" that writes a proper equipment doc through the existing
// saveEquipment path (locations[]/locationIds[] dual-write included).
// Blurry/ambiguous photos surface the model's honest second guess — never a
// junk write.

import { AppState } from '../utils/app-state.js';
import { Config } from '../utils/config.js';
import { showNotification, escapeHtml } from '../ui/ui-helpers.js';
import { findBestMatch } from './fuzzy-match.js';
import { composeEquipmentName } from '../utils/equipment-name.js';
import { getSessionGym } from './gym-session-context.js';
import { openSheet, closeSheet, sheetById } from '../ui/sheet.js';

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
        // Raw backend text never reaches the screen (copy rule) — log it,
        // show plain English.
        console.error('❌ Machine ID failed:', e);
        const msg = (e?.message || '').includes('resource-exhausted')
            ? 'Daily photo-ID limit reached — try again tomorrow.'
            : "Couldn't identify the machine — try a clearer, wider shot.";
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
    `);
    setMachineIdActions([
        { label: 'Close', onClick: 'closeMachineIdSheet()' },
        ...(!match ? [{
            label: gym ? `Add to ${escapeHtml(gym)}` : 'Add to equipment',
            onClick: `addIdentifiedMachine(${useAlt ? 'true' : 'false'})`,
            primary: true,
        }] : []),
    ]);
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
        const unit = AppState.globalUnit === 'kg' ? 'kg' : 'lbs';
        // Through the one equipment writer (AP-13): this called saveEquipment
        // directly, so a machine you already owned was added a second time,
        // and createdVia was dropped by the old whitelist. The writer dedupes,
        // tags gym + exercises onto an existing match, derives locationIds
        // and keeps the cache current.
        const saved = await wm.getOrCreateEquipment(pick.name, {
            brand: pick.brand || null,
            function: data.identified.machineFunction || null,
            equipmentType: data.identified.equipmentType || 'Machine',
            exerciseTypes: (data.identified.exercises || []).slice(0, 6),
            locations: gym ? [gym] : [],
            baseWeightUnit: unit,
            preferredUnit: unit,
            createdVia: 'photo-id',
            knownEquipment: AppState._cachedEquipment || [],
        });
        if (!saved) throw new Error('equipment write failed');
        closeMachineIdSheet();
        showNotification(gym ? `${saved.name} added to ${gym}` : `${saved.name} added`, 'success');
    } catch (e) {
        console.error('❌ Add identified machine failed:', e);
        showNotification("Couldn't save — try again", 'error');
    }
}

// ── Sheet chrome ────────────────────────────────────────────────────
// SH-3b — rendered through the sheet primitive (keyboard inset, page lock,
// focus, Escape, swipe-down). Re-opening replaces in place; the body and
// footer update by id as the photo is read.

const MACHINE_ID_SHEET_ID = 'machine-id-sheet';

function openMachineIdSheet(bodyHtml) {
    openSheet({
        id: MACHINE_ID_SHEET_ID,
        title: 'Identify machine',
        bodyId: 'machine-id-body',
        bodyHTML: bodyHtml,
    });
}

function setMachineIdBody(html) {
    const body = document.getElementById('machine-id-body');
    if (body) body.innerHTML = html;
}

function setMachineIdActions(actions) {
    const footer = actions.map((a) => {
        const mods = a.primary ? ' sheet__action--primary' : '';
        return `<button type="button" class="sheet__action${mods}" onclick="${a.onClick}">${a.label}</button>`;
    }).join('');
    sheetById(MACHINE_ID_SHEET_ID)?.setFooter(footer);
}

export function closeMachineIdSheet(immediate = false) {
    closeSheet(MACHINE_ID_SHEET_ID, { immediate: immediate === true });
}

// Self-wire handlers rendered from this module's own template strings.
// (openMachineIdCamera renders in equipment-library-ui → wired via main.js.)
if (typeof window !== 'undefined') {
    window.useMachineIdAltGuess = useMachineIdAltGuess;
    window.addIdentifiedMachine = addIdentifiedMachine;
    window.closeMachineIdSheet = closeMachineIdSheet;
}
