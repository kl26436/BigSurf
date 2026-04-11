// Equipment Picker Module - core/ui/equipment-picker.js
// Shared equipment picker logic used by exercise-ui.js and workout-management-ui.js

import { AppState } from '../utils/app-state.js';
import { escapeAttr } from './ui-helpers.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';

/**
 * Populate and show the equipment picker modal.
 *
 * @param {Object} options
 * @param {string} options.exerciseName - Display name of the exercise
 * @param {string|null} options.currentEquipment - Currently assigned equipment name (for pre-selection)
 * @param {string|null} options.currentLocation - Currently assigned equipment location
 * @param {string|null} options.sessionLocation - GPS-detected location for the current session
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
    if (newNameInput) newNameInput.value = currentEquipment || '';
    if (newLocationInput) newLocationInput.value = currentLocation || sessionLocation || '';

    try {
        const workoutManager = new FirebaseWorkoutManager(AppState);
        const exerciseEquipment = await workoutManager.getEquipmentForExercise(exerciseName);
        const allEquipment = await workoutManager.getUserEquipment();

        // Render equipment options
        if (listEl) {
            if (exerciseEquipment.length > 0) {
                listEl.textContent = '';
                exerciseEquipment.forEach((eq) => {
                    const option = document.createElement('div');
                    option.className = 'equipment-option' + (eq.name === currentEquipment ? ' selected' : '');
                    option.dataset.equipmentId = eq.id;
                    option.dataset.equipmentName = eq.name;
                    option.dataset.equipmentLocation = eq.location || '';

                    const radio = document.createElement('div');
                    radio.className = 'equipment-option-radio';
                    option.appendChild(radio);

                    const details = document.createElement('div');
                    details.className = 'equipment-option-details';
                    const nameDiv = document.createElement('div');
                    nameDiv.className = 'equipment-option-name';
                    nameDiv.textContent = eq.name;
                    details.appendChild(nameDiv);
                    if (eq.location) {
                        const locDiv = document.createElement('div');
                        locDiv.className = 'equipment-option-location';
                        locDiv.textContent = eq.location;
                        details.appendChild(locDiv);
                    }
                    option.appendChild(details);

                    option.addEventListener('click', () => {
                        listEl.querySelectorAll('.equipment-option').forEach((o) => o.classList.remove('selected'));
                        option.classList.add('selected');
                        if (newNameInput) newNameInput.value = '';
                        if (newLocationInput) newLocationInput.value = '';
                    });

                    listEl.appendChild(option);
                });
            } else {
                listEl.innerHTML = `<div class="equipment-picker-empty">No equipment saved for this exercise yet</div>`;
            }
        }

        // Populate suggestions datalists
        const equipmentDatalist = document.getElementById('equipment-picker-suggestions');
        const locationDatalist = document.getElementById('equipment-picker-location-suggestions');

        if (equipmentDatalist) {
            const equipmentNames = [...new Set(allEquipment.map((eq) => eq.name))];
            equipmentDatalist.innerHTML = equipmentNames.map((name) => `<option value="${escapeAttr(name)}">`).join('');
        }

        if (locationDatalist) {
            const equipmentLocations = allEquipment.filter((eq) => eq.location).map((eq) => eq.location);
            let savedGymLocations = [];
            try {
                savedGymLocations = await workoutManager.getUserLocations();
                savedGymLocations = savedGymLocations.map((loc) => loc.name);
            } catch (e) {
                // Ignore errors fetching gym locations
            }
            const allLocations = [...new Set([...equipmentLocations, ...savedGymLocations])];
            locationDatalist.innerHTML = allLocations.map((loc) => `<option value="${escapeAttr(loc)}">`).join('');
        }
    } catch (error) {
        console.error('❌ Error loading equipment:', error);
        if (listEl) {
            listEl.innerHTML = `<div class="equipment-picker-empty">Error loading equipment</div>`;
        }
    }
}
