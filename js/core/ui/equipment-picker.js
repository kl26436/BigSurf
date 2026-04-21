// Equipment Picker Module - core/ui/equipment-picker.js
//
// Section-based picker (Phase 4) used during workouts and template editing.
// The DOM shell in index.html provides #equipment-picker-list (where sections
// render) plus an "Or add new" form and Confirm/Skip footer. Confirm reads the
// .equipment-option.selected element's data-* attrs, so that contract is
// preserved — callers don't need updating.

import { AppState } from '../utils/app-state.js';
import { escapeAttr, escapeHtml } from './ui-helpers.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';

/**
 * Populate and show the equipment picker modal.
 *
 * Sections rendered in #equipment-picker-list:
 *   - "Used before"       — equipment tagged with this exercise (sorted by lastUsed)
 *   - "At <gym>"          — equipment at the active session location, not shown above
 *   - "All equipment"     — everything else
 *
 * Pre-selection precedence: currentEquipment > last-used for this exercise > none.
 *
 * @param {Object} options
 * @param {string} options.exerciseName
 * @param {string|null} options.currentEquipment
 * @param {string|null} options.currentLocation
 * @param {string|null} options.sessionLocation
 */
export async function populateEquipmentPicker({
    exerciseName,
    currentEquipment = null,
    currentLocation = null,
    sessionLocation = null,
}) {
    const titleEl = document.getElementById('equipment-picker-exercise-name');
    const listEl = document.getElementById('equipment-picker-list');
    const newNameInput = document.getElementById('equipment-picker-new-name');
    const newLocationInput = document.getElementById('equipment-picker-new-location');

    if (titleEl) titleEl.textContent = `for "${exerciseName}"`;
    if (newNameInput) newNameInput.value = '';
    if (newLocationInput) newLocationInput.value = currentLocation || sessionLocation || '';

    if (!listEl) return;

    try {
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const allEquipment = await workoutManager.getUserEquipment();

        const activeLocation = sessionLocation || currentLocation;

        // --- Partition into sections (each equipment item appears in at most one section) ---
        const usedBefore = allEquipment
            .filter((eq) => (eq.exerciseTypes || []).includes(exerciseName))
            .sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || ''));

        const usedIds = new Set(usedBefore.map((e) => e.id));
        const atThisGym = activeLocation
            ? allEquipment.filter(
                  (eq) =>
                      !usedIds.has(eq.id) &&
                      ((eq.locations || []).includes(activeLocation) || eq.location === activeLocation)
              )
            : [];

        const atGymIds = new Set(atThisGym.map((e) => e.id));
        const allOther = allEquipment.filter((eq) => !usedIds.has(eq.id) && !atGymIds.has(eq.id));

        // --- Pre-selection: currentEquipment wins, else last-used ---
        let preSelectedId = null;
        if (currentEquipment) {
            const match = allEquipment.find(
                (eq) => eq.name?.toLowerCase() === currentEquipment.toLowerCase()
            );
            if (match) preSelectedId = match.id;
        }
        if (!preSelectedId && usedBefore.length > 0) {
            preSelectedId = usedBefore[0].id;
        }

        // --- Render sections ---
        listEl.innerHTML = '';

        const renderSection = (title, items) => {
            if (items.length === 0) return;
            const header = document.createElement('div');
            header.className = 'eq-picker__section-header';
            header.textContent = title;
            listEl.appendChild(header);
            for (const eq of items) {
                listEl.appendChild(buildOption(eq, preSelectedId));
            }
        };

        renderSection('Used before', usedBefore);
        if (activeLocation) {
            renderSection(`At ${activeLocation}`, atThisGym);
        }
        renderSection(
            activeLocation || usedBefore.length > 0 ? 'All equipment' : 'Your equipment',
            allOther
        );

        if (allEquipment.length === 0) {
            listEl.innerHTML = `
                <div class="equipment-picker-empty">
                    No saved equipment yet — add new below
                </div>
            `;
        }

        // --- Populate autocomplete datalists (for the "Or add new" form) ---
        const equipmentDatalist = document.getElementById('equipment-picker-suggestions');
        const locationDatalist = document.getElementById('equipment-picker-location-suggestions');

        if (equipmentDatalist) {
            const equipmentNames = [...new Set(allEquipment.map((eq) => eq.name))];
            equipmentDatalist.innerHTML = equipmentNames
                .map((name) => `<option value="${escapeAttr(name)}">`)
                .join('');
        }
        if (locationDatalist) {
            const fromEquipment = allEquipment.flatMap((eq) => eq.locations || [])
                .concat(allEquipment.map((eq) => eq.location).filter(Boolean));
            let savedGymLocations = [];
            try {
                savedGymLocations = (await workoutManager.getUserLocations()).map((l) => l.name);
            } catch {
                // getUserLocations may fail before sign-in — silent fallback
            }
            const allLocations = [...new Set([...fromEquipment, ...savedGymLocations])];
            locationDatalist.innerHTML = allLocations
                .map((loc) => `<option value="${escapeAttr(loc)}">`)
                .join('');
        }
    } catch (error) {
        console.error('❌ Error loading equipment:', error);
        listEl.innerHTML = `<div class="equipment-picker-empty">Error loading equipment</div>`;
    }
}

/**
 * Build one radio-style option row. Preserves the .equipment-option data-*
 * contract that the confirm handler in exercise-ui.js / workout-management-ui.js
 * reads when the user taps "Select Equipment".
 */
function buildOption(eq, preSelectedId) {
    const option = document.createElement('div');
    option.className = 'equipment-option eq-picker__option' + (eq.id === preSelectedId ? ' selected' : '');
    option.dataset.equipmentId = eq.id;
    option.dataset.equipmentName = eq.name;
    option.dataset.equipmentLocation = (eq.locations && eq.locations[0]) || eq.location || '';

    const radio = document.createElement('div');
    radio.className = 'equipment-option-radio';
    option.appendChild(radio);

    const details = document.createElement('div');
    details.className = 'equipment-option-details';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'equipment-option-name';
    nameDiv.textContent = eq.function || eq.name;
    details.appendChild(nameDiv);

    // Subtitle line — "Brand · Line · Location" when we have those fields
    const subtitleParts = [
        eq.brand && eq.brand !== 'Unknown' ? eq.brand : null,
        eq.line || null,
        (eq.locations && eq.locations.join(', ')) || eq.location || null,
    ].filter(Boolean);
    if (subtitleParts.length > 0) {
        const sub = document.createElement('div');
        sub.className = 'equipment-option-location';
        sub.textContent = subtitleParts.join(' · ');
        details.appendChild(sub);
    }

    option.appendChild(details);

    option.addEventListener('click', () => {
        document
            .querySelectorAll('#equipment-picker-list .equipment-option')
            .forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');
        // Typing into the "add new" form deselects the list — but clicking a
        // list item should also clear the add-new form to avoid ambiguity.
        const newNameInput = document.getElementById('equipment-picker-new-name');
        if (newNameInput) newNameInput.value = '';
    });

    return option;
}
