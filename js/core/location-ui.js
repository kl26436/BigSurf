// Location UI Module - core/location-ui.js
// Handles location management UI - uses Firebase locations

import { showNotification } from './ui-helpers.js';
import { AppState } from './app-state.js';
import { FirebaseWorkoutManager } from './firebase-workout-manager.js';
import { getSessionLocation, setSessionLocation, getCurrentPosition, findNearbyLocation } from './location-service.js';

let workoutManager = null;
let cachedLocations = [];
let currentLocationName = null;

// Initialize workout manager
function getWorkoutManager() {
    if (!workoutManager) {
        workoutManager = new FirebaseWorkoutManager(AppState);
    }
    return workoutManager;
}

// ===================================================================
// LOCATION MANAGEMENT PAGE
// ===================================================================

/**
 * Show the location management page
 */
export async function showLocationManagement() {
    // Hide all sections
    const allSections = document.querySelectorAll('.content-section');
    allSections.forEach(section => section.classList.add('hidden'));

    // Show location management section
    const section = document.getElementById('location-management-section');
    if (section) {
        section.classList.remove('hidden');
    }

    // Clear stale GPS coords first
    window.currentGPSCoords = null;

    // Show loading state
    const container = document.getElementById('location-management-list');
    if (container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    }

    // Load locations from Firebase
    await loadLocations();

    // Render the UI
    renderLocationManagementList();
    updateCurrentLocationDisplay();
    updateLocationMap(); // Shows placeholder initially

    // Auto-detect current GPS location and match to saved locations
    try {
        const coords = await getCurrentPosition();
        if (coords) {
            window.currentGPSCoords = coords;
            updateLocationMap(); // Update map with current location

            // Try to match GPS to a saved location
            const matchedLocation = findNearbyLocation(cachedLocations, coords);
            if (matchedLocation && !currentLocationName) {
                // Auto-set as current location if not already set
                currentLocationName = matchedLocation.name;
                setSessionLocation(matchedLocation.name);
                updateCurrentLocationDisplay();
                renderLocationManagementList(); // Re-render to show CURRENT badge
            }
        }
    } catch (error) {
        console.error('Error auto-detecting GPS:', error);
    }
}

/**
 * Load locations from Firebase
 */
async function loadLocations() {
    try {
        const manager = getWorkoutManager();
        cachedLocations = await manager.getUserLocations();
        // Get current session location
        currentLocationName = getSessionLocation();
    } catch (error) {
        console.error('Error loading locations:', error);
        cachedLocations = [];
    }
}

/**
 * Close location management and return to dashboard
 */
export function closeLocationManagement() {
    const section = document.getElementById('location-management-section');
    if (section) {
        section.classList.add('hidden');
    }

    // Show dashboard
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        dashboard.classList.remove('hidden');
    }
}

/**
 * Update the current location display at top of page
 */
function updateCurrentLocationDisplay() {
    const nameSpan = document.getElementById('current-location-name');
    if (nameSpan) {
        nameSpan.textContent = currentLocationName || 'Not Set';
    }
}

/**
 * Render the locations list for management
 */
function renderLocationManagementList() {
    const container = document.getElementById('location-management-list');
    const countSpan = document.getElementById('location-count');

    if (!container) return;

    // Update count
    if (countSpan) {
        countSpan.textContent = `${cachedLocations.length} location${cachedLocations.length !== 1 ? 's' : ''}`;
    }

    if (cachedLocations.length === 0) {
        container.innerHTML = `
            <div class="location-empty-state">
                <i class="fas fa-map-marker-alt"></i>
                <p>No saved locations yet</p>
                <p style="font-size: 0.8rem; margin-top: 0.5rem;">Add your gym locations below</p>
            </div>
        `;
        return;
    }

    container.innerHTML = cachedLocations.map(location => {
        const isCurrent = location.name === currentLocationName;
        const lastVisit = formatLocationDate(location.lastVisit);

        return `
            <div class="location-management-item ${isCurrent ? 'active' : ''}">
                <div class="location-item-info" onclick="setLocationAsCurrent('${escapeHtml(location.name)}')">
                    <div class="location-item-icon">
                        <i class="fas fa-map-marker-alt"></i>
                    </div>
                    <div class="location-item-details">
                        <div class="location-item-name">
                            ${escapeHtml(location.name)}
                            ${isCurrent ? '<span class="current-badge">CURRENT</span>' : ''}
                        </div>
                        <div class="location-item-meta">
                            ${location.visitCount || 0} workout${(location.visitCount || 0) !== 1 ? 's' : ''} • Last: ${lastVisit}
                        </div>
                    </div>
                </div>
                <div class="location-item-actions">
                    <button onclick="editLocationName('${escapeHtml(location.id)}')" title="Rename">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="delete-btn" onclick="deleteLocation('${escapeHtml(location.id)}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Format date for location display
 */
function formatLocationDate(isoString) {
    if (!isoString) return 'Never';

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
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Set a location as current (session location)
 * Shows the saved location on the map if it has GPS coords
 * Only updates GPS coords if the location doesn't have them yet
 */
export async function setLocationAsCurrent(locationName) {
    setSessionLocation(locationName);
    currentLocationName = locationName;

    // Find the location in cache
    const location = cachedLocations.find(loc => loc.name === locationName);

    if (location) {
        // If location has saved GPS coords, show them on the map
        if (location.latitude && location.longitude) {
            showLocationOnMap(location.latitude, location.longitude, location.name);
        }
        // If location has NO GPS coords but we have current GPS, offer to update
        else if (window.currentGPSCoords) {
            try {
                const manager = getWorkoutManager();
                await manager.updateLocation(location.id, {
                    latitude: window.currentGPSCoords.latitude,
                    longitude: window.currentGPSCoords.longitude
                });
                // Update cache
                location.latitude = window.currentGPSCoords.latitude;
                location.longitude = window.currentGPSCoords.longitude;
                showLocationOnMap(location.latitude, location.longitude, location.name);
                showNotification(`GPS saved for ${locationName}`, 'success');
            } catch (error) {
                console.error('Error updating location GPS coords:', error);
            }
        }
    }

    showNotification(`Location set to ${locationName}`, 'success');
    renderLocationManagementList();
    updateCurrentLocationDisplay();
}

/**
 * Show a specific location on the map
 */
function showLocationOnMap(lat, lon, name) {
    const container = document.getElementById('location-map-container');
    if (!container) return;

    container.innerHTML = `
        <iframe
            src="https://www.openstreetmap.org/export/embed.html?bbox=${lon-0.01}%2C${lat-0.01}%2C${lon+0.01}%2C${lat+0.01}&layer=mapnik&marker=${lat}%2C${lon}"
            style="width: 100%; height: 100%; border: none;">
        </iframe>
        <div class="map-location-label">${name}</div>
    `;
}

/**
 * Add a new location from the management page
 */
export async function addNewLocationFromManagement() {
    const input = document.getElementById('new-location-name-input');
    if (!input) return;

    const locationName = input.value.trim();

    if (!locationName) {
        showNotification('Please enter a location name', 'warning');
        return;
    }

    // Check if location already exists
    if (cachedLocations.some(loc => loc.name.toLowerCase() === locationName.toLowerCase())) {
        showNotification('Location already exists', 'warning');
        return;
    }

    try {
        const manager = getWorkoutManager();
        const coords = window.currentGPSCoords;

        // Save to Firebase with GPS coords if available
        await manager.saveLocation({
            name: locationName,
            latitude: coords?.latitude || null,
            longitude: coords?.longitude || null
        });

        // Set as current location
        setSessionLocation(locationName);
        currentLocationName = locationName;

        input.value = '';
        showNotification(`Added ${locationName}`, 'success');

        // Reload and re-render
        await loadLocations();
        renderLocationManagementList();
        updateCurrentLocationDisplay();
    } catch (error) {
        console.error('Error adding location:', error);
        showNotification('Error adding location', 'error');
    }
}

/**
 * Detect GPS location and show on map
 */
export async function detectAndAddLocation() {
    showNotification('Detecting location...', 'info');

    try {
        const coords = await getCurrentPosition();

        if (!coords) {
            showNotification('Could not get GPS location', 'error');
            return;
        }

        // Store coords for map display
        window.currentGPSCoords = coords;
        updateLocationMap();

        // Focus the input for user to enter name
        const input = document.getElementById('new-location-name-input');
        if (input) {
            input.focus();
            showNotification('GPS detected! Enter a name for this location.', 'success');
        }
    } catch (error) {
        console.error('Error detecting location:', error);
        showNotification('Error detecting location', 'error');
    }
}

/**
 * Edit a location name
 */
export async function editLocationName(locationId) {
    const location = cachedLocations.find(loc => loc.id === locationId);
    if (!location) return;

    const newName = prompt(`Rename "${location.name}" to:`, location.name);

    if (!newName || newName.trim() === '' || newName.trim() === location.name) {
        return;
    }

    // Check if new name already exists
    if (cachedLocations.some(loc => loc.name.toLowerCase() === newName.trim().toLowerCase() && loc.id !== locationId)) {
        showNotification('A location with that name already exists', 'warning');
        return;
    }

    try {
        const manager = getWorkoutManager();
        await manager.updateLocation(locationId, { name: newName.trim() });

        // Update current location name if this was the current one
        if (currentLocationName === location.name) {
            setSessionLocation(newName.trim());
            currentLocationName = newName.trim();
        }

        showNotification(`Renamed to ${newName.trim()}`, 'success');

        // Reload and re-render
        await loadLocations();
        renderLocationManagementList();
        updateCurrentLocationDisplay();
    } catch (error) {
        console.error('Error renaming location:', error);
        showNotification('Error renaming location', 'error');
    }
}

/**
 * Delete a location
 */
export async function deleteLocation(locationId) {
    const location = cachedLocations.find(loc => loc.id === locationId);
    if (!location) return;

    if (location.name === currentLocationName) {
        showNotification('Cannot delete current location. Select another first.', 'warning');
        return;
    }

    if (!confirm(`Delete "${location.name}"? This won't affect your workout history.`)) {
        return;
    }

    try {
        const manager = getWorkoutManager();
        await manager.deleteLocation(locationId);

        showNotification(`Deleted ${location.name}`, 'success');

        // Reload and re-render
        await loadLocations();
        renderLocationManagementList();
    } catch (error) {
        console.error('Error deleting location:', error);
        showNotification('Error deleting location', 'error');
    }
}

/**
 * Update the map display
 */
function updateLocationMap() {
    const container = document.getElementById('location-map-container');
    if (!container) return;

    const coords = window.currentGPSCoords;

    if (coords && coords.latitude && coords.longitude) {
        const lat = coords.latitude;
        const lon = coords.longitude;

        container.innerHTML = `
            <iframe
                src="https://www.openstreetmap.org/export/embed.html?bbox=${lon-0.01}%2C${lat-0.01}%2C${lon+0.01}%2C${lat+0.01}&layer=mapnik&marker=${lat}%2C${lon}"
                style="width: 100%; height: 100%; border: none;">
            </iframe>
        `;
    } else {
        container.innerHTML = `
            <div class="location-map-placeholder">
                <i class="fas fa-map-marked-alt"></i>
                <p>Location map</p>
                <p class="map-hint">Tap "Use Current GPS Location" to show map</p>
            </div>
        `;
    }
}

// ===================================================================
// LEGACY EXPORTS (for compatibility)
// ===================================================================

export function showLocationSelector(onLocationSelected = null) {
    // Skip location selector - just proceed with callback
    if (onLocationSelected) onLocationSelected();
}

export function closeLocationSelector() {
    // No-op for compatibility
}

export function selectSavedLocation() {
    // No-op for compatibility - replaced by setLocationAsCurrent
}

export function selectNewLocation() {
    // No-op for compatibility - replaced by addNewLocationFromManagement
}

export function skipLocationSelection() {
    // No-op for compatibility
}

export function changeLocation() {
    showLocationManagement();
}

export function displayCurrentLocation() {
    const location = getSessionLocation();
    if (!location) return null;
    return `
        <div style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: rgba(64, 224, 208, 0.1); border-radius: 6px; margin: 0.5rem 0;">
            <i class="fas fa-map-marker-alt" style="color: var(--primary);"></i>
            <span style="color: var(--text-primary);">${location}</span>
        </div>
    `;
}
