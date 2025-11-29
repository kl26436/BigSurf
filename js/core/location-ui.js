// Location UI Module - core/location-ui.js
// Handles location selector modal and UI interactions

import { PRTracker } from './pr-tracker.js';
import { showNotification } from './ui-helpers.js';

// ===================================================================
// LOCATION SELECTOR MODAL
// ===================================================================

let pendingWorkoutCallback = null;

/**
 * Show location selector modal before starting workout
 * @param {Function} onLocationSelected - Callback function to execute after location is selected
 */
export function showLocationSelector(onLocationSelected = null) {
    const modal = document.getElementById('location-selector-modal');
    console.log('📍 showLocationSelector - modal found:', !!modal);
    if (!modal) {
        console.error('❌ Location selector modal not found in DOM!');
        // If modal not found, skip location selection and proceed with workout
        if (onLocationSelected) onLocationSelected();
        return;
    }

    // Hide any other modals that might be showing (category selector, etc)
    const categoryModal = document.getElementById('category-workout-modal');
    if (categoryModal) {
        categoryModal.style.display = 'none';
    }

    pendingWorkoutCallback = onLocationSelected;

    // Load and display saved locations
    renderSavedLocations();

    modal.classList.remove('hidden');
    console.log('📍 Location selector modal should now be visible');
}

/**
 * Close location selector modal
 */
export function closeLocationSelector() {
    const modal = document.getElementById('location-selector-modal');
    if (modal) {
        modal.classList.add('hidden');
    }

    // Clear input
    const input = document.getElementById('new-location-input');
    if (input) {
        input.value = '';
    }

    pendingWorkoutCallback = null;
}

/**
 * Render saved locations list
 */
function renderSavedLocations() {
    const container = document.getElementById('saved-locations-list');
    if (!container) return;

    const locations = PRTracker.getLocations();
    const currentLocation = PRTracker.getCurrentLocation();

    if (locations.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <i class="fas fa-map-marker-alt" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                <p>No saved locations yet</p>
                <p style="font-size: 0.875rem;">Enter a location below to get started</p>
            </div>
        `;
        return;
    }

    container.innerHTML = locations.map(location => `
        <div class="location-option ${location.name === currentLocation ? 'active' : ''}"
             onclick="selectSavedLocation('${location.name}')">
            <div class="location-info">
                <div class="location-name">
                    <i class="fas fa-map-marker-alt location-icon"></i>
                    ${location.name}
                    ${location.name === currentLocation ? '<i class="fas fa-check" style="color: var(--primary); margin-left: 0.5rem;"></i>' : ''}
                </div>
                <div class="location-meta">
                    ${location.visitCount} workout${location.visitCount > 1 ? 's' : ''} • Last visit: ${formatDate(location.lastVisit)}
                </div>
            </div>
            ${location.name === currentLocation ? '<i class="fas fa-check-circle" style="color: var(--primary); font-size: 1.5rem;"></i>' : ''}
        </div>
    `).join('');
}

/**
 * Format date for display
 */
function formatDate(isoString) {
    const date = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

/**
 * Select a saved location
 */
export async function selectSavedLocation(locationName) {
    await PRTracker.setCurrentLocation(locationName);
    showNotification(`Location set to ${locationName}`, 'success');
    closeLocationSelector();

    if (pendingWorkoutCallback) {
        pendingWorkoutCallback();
    }
}

/**
 * Select and add a new location
 */
export async function selectNewLocation() {
    const input = document.getElementById('new-location-input');
    if (!input) return;

    const locationName = input.value.trim();

    if (!locationName) {
        showNotification('Please enter a location name', 'warning');
        return;
    }

    await PRTracker.setCurrentLocation(locationName);
    showNotification(`Location set to ${locationName}`, 'success');
    closeLocationSelector();

    if (pendingWorkoutCallback) {
        pendingWorkoutCallback();
    }
}

/**
 * Skip location selection
 */
export function skipLocationSelection() {
    const suggestedLocation = PRTracker.suggestLocation();

    if (suggestedLocation) {
        PRTracker.setCurrentLocation(suggestedLocation);
        showNotification(`Using ${suggestedLocation}`, 'info');
    }

    closeLocationSelector();

    if (pendingWorkoutCallback) {
        pendingWorkoutCallback();
    }
}

// ===================================================================
// LOCATION DISPLAY
// ===================================================================

/**
 * Show current location in the header or workout area
 */
export function displayCurrentLocation() {
    const location = PRTracker.getCurrentLocation();

    if (!location) return null;

    return `
        <div style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: rgba(64, 224, 208, 0.1); border-radius: 6px; margin: 0.5rem 0;">
            <i class="fas fa-map-marker-alt" style="color: var(--primary);"></i>
            <span style="color: var(--text-primary);">${location}</span>
            <button class="btn btn-secondary btn-small" onclick="changeLocation()" style="margin-left: 0.5rem;">
                <i class="fas fa-edit"></i>
            </button>
        </div>
    `;
}

/**
 * Change location (opens selector)
 */
export function changeLocation() {
    showLocationSelector();
}
