// Location UI Module - core/location-ui.js
// Handles location management UI - uses Firebase locations

import { showNotification, escapeHtml, escapeAttr, openModal, closeModal } from '../ui/ui-helpers.js';
import { AppState } from '../utils/app-state.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { getSessionLocation, setSessionLocation, getCurrentPosition, findNearbyLocation } from './location-service.js';
import { functions, httpsCallable } from '../data/firebase-config.js';

let workoutManager = null;
let cachedLocations = [];
let currentLocationName = null;

/**
 * Fetch city/state from coordinates via Cloud Function
 * Results are saved to Firebase so we only call once per location
 */
async function reverseGeocode(latitude, longitude) {
    try {
        const reverseGeocodeFunc = httpsCallable(functions, 'reverseGeocode');
        const result = await reverseGeocodeFunc({ latitude, longitude });
        return result.data;
    } catch (error) {
        console.error('❌ Error reverse geocoding:', error);
        return { city: null, state: null, formatted: null };
    }
}

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
    allSections.forEach((section) => section.classList.add('hidden'));

    // Show location management section
    const section = document.getElementById('location-management-section');
    if (section) {
        section.classList.remove('hidden');

        // Restore the canonical .page-header for the list view (in case we're
        // returning from a detail view that mutated it).
        const staticHeader = section.querySelector('.page-header');
        if (staticHeader) {
            staticHeader.innerHTML = `
                <div class="page-header__left">
                    <button class="page-header__back" onclick="navigateBack()" aria-label="Back">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <div class="page-header__title">Locations</div>
                </div>
                <button class="page-header__save" onclick="detectAndAddLocation()">
                    <i class="fas fa-plus"></i> New
                </button>
            `;
        }
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
            // Use a larger effective radius if GPS accuracy is poor (cap at 5km for reasonable matching)
            const effectiveRadius = Math.min(Math.max(coords.accuracy || 500, 500), 5000);
            const matchedLocation = findNearbyLocation(cachedLocations, coords, effectiveRadius);

            if (matchedLocation) {
                // Auto-set as current location based on GPS match
                currentLocationName = matchedLocation.name;
                setSessionLocation(matchedLocation.name);
                updateCurrentLocationDisplay();
                renderLocationManagementList(); // Re-render to show CURRENT badge
            }
        }
    } catch (error) {
        console.error('❌ Error auto-detecting GPS:', error);
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
        // Hide map placeholder when no locations exist
        const mapContainer = document.getElementById('location-map-container');
        if (mapContainer) mapContainer.classList.add('hidden');

        container.innerHTML = `
            <div class="location-empty-state">
                <i class="fas fa-map-marker-alt"></i>
                <p>No saved locations yet</p>
                <p class="loc-empty-subtitle">Add your gym locations below</p>
            </div>
        `;
        return;
    }

    // Show map container when locations exist
    const mapContainer = document.getElementById('location-map-container');
    if (mapContainer) mapContainer.classList.remove('hidden');

    container.innerHTML = cachedLocations
        .map((location) => {
            const isCurrent = location.name === currentLocationName;
            const lastVisit = formatLocationDate(location.lastVisit);
            const hasGPS = location.latitude && location.longitude;

            // Show city/state if available, otherwise GPS status
            let gpsDisplay;
            if (hasGPS && location.cityState) {
                // Has GPS and city/state - show the city/state
                gpsDisplay = `<span class="location-city-state"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(location.cityState)}</span>`;
            } else if (hasGPS) {
                // Has GPS but no city/state yet - show "GPS Saved" and fetch city/state
                gpsDisplay = `<span class="location-gps-info" id="gps-info-${location.id}"><i class="fas fa-check-circle"></i> GPS Saved</span>`;
                // Fetch city/state in background and save it
                fetchAndSaveCityState(location);
            } else {
                // No GPS
                gpsDisplay = '<span class="location-no-gps"><i class="fas fa-map-marker-alt"></i> No GPS</span>';
            }

            return `
            <div class="location-management-item ${isCurrent ? 'active' : ''}">
                <div class="location-item-info" data-action="showLocationOnMap" data-location-id="${escapeAttr(location.id)}">
                    <div class="location-item-icon">
                        <i class="fas fa-map-marker-alt"></i>
                    </div>
                    <div class="location-item-details">
                        <div class="location-item-name">
                            ${escapeHtml(location.name)}
                            ${isCurrent ? '<span class="current-badge">CURRENT</span>' : ''}
                        </div>
                        <div class="location-item-address">
                            ${gpsDisplay}
                        </div>
                        <div class="location-item-meta">
                            ${location.visitCount || 0} workout${(location.visitCount || 0) !== 1 ? 's' : ''} • Last: ${lastVisit}
                        </div>
                    </div>
                </div>
                <div class="location-item-actions">
                    <button data-action="editLocationName" data-location-id="${escapeAttr(location.id)}" title="Rename">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="delete-btn" data-action="deleteLocation" data-location-id="${escapeAttr(location.id)}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        })
        .join('');

    // Event delegation for location actions
    container.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        const locationId = target.dataset.locationId;
        if (action === 'showLocationOnMap' && window.showLocationOnMapById) window.showLocationOnMapById(locationId);
        else if (action === 'editLocationName' && window.editLocationName) window.editLocationName(locationId);
        else if (action === 'deleteLocation' && window.deleteLocation) window.deleteLocation(locationId);
    });
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
 * Fetch city/state from coordinates and save to Firebase
 * Called once per location, then cached in Firebase
 */
async function fetchAndSaveCityState(location) {
    if (!location.latitude || !location.longitude || location.cityState) return;

    try {
        const geoData = await reverseGeocode(location.latitude, location.longitude);
        if (geoData.formatted) {
            const manager = getWorkoutManager();
            await manager.updateLocation(location.id, { cityState: geoData.formatted });
            // Update cache
            location.cityState = geoData.formatted;
            // Re-render to show updated city/state
            renderLocationManagementList();
        }
    } catch (error) {
        console.error('❌ Error fetching city/state:', error);
    }
}

/**
 * Show a location on the map without changing current session location
 * Used when user taps a location just to see it on the map
 */
export function showLocationOnMapById(locationId) {
    const location = cachedLocations.find((loc) => loc.id === locationId);
    if (!location) return;

    if (location.latitude && location.longitude) {
        showLocationOnMap(location.latitude, location.longitude, location.name);
    } else {
        showNotification('No GPS saved for this location', 'info');
    }
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
    const location = cachedLocations.find((loc) => loc.name === locationName);

    if (location) {
        // If location has saved GPS coords, show them on the map
        if (location.latitude && location.longitude) {
            showLocationOnMap(location.latitude, location.longitude, location.name);
        }
        // If location has NO GPS coords but we have current GPS, silently update
        else if (window.currentGPSCoords) {
            try {
                const manager = getWorkoutManager();
                await manager.updateLocation(location.id, {
                    latitude: window.currentGPSCoords.latitude,
                    longitude: window.currentGPSCoords.longitude,
                });
                // Update cache
                location.latitude = window.currentGPSCoords.latitude;
                location.longitude = window.currentGPSCoords.longitude;
                showLocationOnMap(location.latitude, location.longitude, location.name);
            } catch (error) {
                console.error('Error updating location GPS coords:', error);
            }
        }
    }

    renderLocationManagementList();
    updateCurrentLocationDisplay();
}

/**
 * Update GPS for an existing location (re-save current position)
 */
export async function updateLocationGPS(locationId) {
    const location = cachedLocations.find((loc) => loc.id === locationId);
    if (!location) return;

    if (!window.currentGPSCoords) {
        showNotification('Getting GPS…', 'info');
        const coords = await getCurrentPosition();
        if (!coords) {
            showNotification("Couldn't get GPS location", 'error');
            return;
        }
        window.currentGPSCoords = coords;
    }

    try {
        const manager = getWorkoutManager();
        await manager.updateLocation(locationId, {
            latitude: window.currentGPSCoords.latitude,
            longitude: window.currentGPSCoords.longitude,
            radius: null, // Reset to use default radius
        });

        // Update cache
        location.latitude = window.currentGPSCoords.latitude;
        location.longitude = window.currentGPSCoords.longitude;
        location.radius = null;

        showNotification(`GPS updated for ${location.name}`, 'success');
        renderLocationManagementList();
        updateLocationMap();
    } catch (error) {
        console.error('Error updating location GPS:', error);
        showNotification('Error updating GPS', 'error');
    }
}

/**
 * Show a specific location on the map
 */
function showLocationOnMap(lat, lon, name) {
    const container = document.getElementById('location-map-container');
    if (!container) return;

    container.innerHTML = `
        <iframe
            src="https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01}%2C${lat - 0.01}%2C${lon + 0.01}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lon}"
            class="loc-map-iframe">
        </iframe>
        <div class="map-location-label">${escapeHtml(name)}</div>
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
        showNotification('Add a location name', 'warning');
        return;
    }

    // Check if location already exists
    if (cachedLocations.some((loc) => loc.name.toLowerCase() === locationName.toLowerCase())) {
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
            longitude: coords?.longitude || null,
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

// State for add location modal
let selectedLocationCoords = null;
let currentLocationMethod = 'gps';
let addLocationMap = null;
let addLocationMarker = null;

/**
 * Open the Add Location modal
 */
export function detectAndAddLocation() {
    const modal = document.getElementById('add-location-modal');
    const input = document.getElementById('add-location-name-input');

    if (modal) {
        openModal(modal);
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 100);
        }

        // Reset state
        selectedLocationCoords = null;
        currentLocationMethod = 'gps';

        // Reset method tabs
        switchLocationMethod('gps');

        // Start GPS detection
        detectGPSForModal();
    }
}

/**
 * Switch between location input methods
 */
export function switchLocationMethod(method) {
    currentLocationMethod = method;

    // Update tab states
    document.querySelectorAll('.method-tab').forEach((tab) => tab.classList.remove('active'));
    const activeTab = document.getElementById(`method-${method}-tab`);
    if (activeTab) activeTab.classList.add('active');

    // Show/hide content
    document.querySelectorAll('.location-method-content').forEach((el) => el.classList.add('hidden'));
    const content = document.getElementById(`location-method-${method}`);
    if (content) content.classList.remove('hidden');

    // Initialize map if switching to map method
    if (method === 'map') {
        initAddLocationMap();
    }

    // Clear address results when switching
    if (method !== 'address') {
        const results = document.getElementById('address-search-results');
        if (results) results.innerHTML = '';
    }
}

/**
 * Detect GPS for the add location modal
 */
async function detectGPSForModal() {
    const statusBox = document.getElementById('add-location-gps-status');
    if (!statusBox) return;

    statusBox.className = 'gps-status-box';
    statusBox.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Detecting your location...</span>';

    try {
        const coords = await getCurrentPosition();
        if (coords) {
            selectedLocationCoords = coords;
            statusBox.className = 'gps-status-box success';
            statusBox.innerHTML = `<i class="fas fa-check-circle"></i><span>Location detected! (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})</span>`;
            updateSelectedCoordsDisplay();
        } else {
            statusBox.className = 'gps-status-box error';
            statusBox.innerHTML =
                '<i class="fas fa-exclamation-circle"></i><span>Could not detect location. Try another method.</span>';
        }
    } catch (error) {
        statusBox.className = 'gps-status-box error';
        statusBox.innerHTML =
            '<i class="fas fa-exclamation-circle"></i><span>Location access denied. Try another method.</span>';
    }
}

/**
 * Search for an address using geocoding
 */
export async function searchLocationAddress() {
    const input = document.getElementById('location-address-search');
    const resultsContainer = document.getElementById('address-search-results');
    const query = input?.value?.trim();

    if (!query) {
        showNotification('Enter an address to search', 'warning');
        return;
    }

    resultsContainer.innerHTML =
        '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

    try {
        // Use Firebase Cloud Function to bypass CORS restrictions
        const geocodeFunc = httpsCallable(functions, 'geocodeAddress');
        const response = await geocodeFunc({ query: query });
        const results = response.data.results || [];

        if (!Array.isArray(results) || results.length === 0) {
            resultsContainer.innerHTML =
                '<div class="empty-state"><div class="empty-state-description">No results found. Try a different search.</div></div>';
            return;
        }

        resultsContainer.innerHTML = results
            .map(
                (result, idx) => `
            <div class="address-result-item" data-action="selectAddress" data-idx="${idx}" data-lat="${result.lat}" data-lon="${result.lon}" data-display-name="${escapeAttr(result.display_name)}">
                <div class="address-result-name">${escapeHtml(result.display_name.split(',')[0])}</div>
                <div class="address-result-address">${escapeHtml(result.display_name)}</div>
            </div>
        `
            )
            .join('');

        // Event delegation for address results
        resultsContainer.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action="selectAddress"]');
            if (!item) return;
            const { idx: i, lat, lon, displayName } = item.dataset;
            selectAddressResult(parseInt(i), parseFloat(lat), parseFloat(lon), displayName);
        });
    } catch (error) {
        console.error('Address search error:', error);
        resultsContainer.innerHTML = `<div class="loc-search-error">
            <p>Search failed — try again.</p>
            <p class="loc-search-error__hint">Tip: Try a more specific address or city name</p>
        </div>`;
    }
}

/**
 * Select an address from search results
 */
export function selectAddressResult(idx, lat, lon, displayName) {
    selectedLocationCoords = { latitude: parseFloat(lat), longitude: parseFloat(lon) };

    // Update visual selection
    document.querySelectorAll('.address-result-item').forEach((el, i) => {
        el.classList.toggle('selected', i === idx);
    });

    updateSelectedCoordsDisplay();
}

/**
 * Initialize the map for pin drop
 */
function initAddLocationMap() {
    const container = document.getElementById('add-location-map-container');
    if (!container) return;

    // Use Leaflet if available, otherwise show a simpler interface
    if (typeof L !== 'undefined') {
        // Initialize Leaflet map
        if (addLocationMap) {
            addLocationMap.remove();
        }

        // Default to user's GPS or a default location
        const defaultLat = selectedLocationCoords?.latitude || window.currentGPSCoords?.latitude || 34.0522;
        const defaultLon = selectedLocationCoords?.longitude || window.currentGPSCoords?.longitude || -118.2437;

        container.innerHTML = '';
        addLocationMap = L.map(container).setView([defaultLat, defaultLon], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
        }).addTo(addLocationMap);

        // Add draggable marker
        addLocationMarker = L.marker([defaultLat, defaultLon], { draggable: true }).addTo(addLocationMap);

        addLocationMarker.on('dragend', function (e) {
            const pos = e.target.getLatLng();
            selectedLocationCoords = { latitude: pos.lat, longitude: pos.lng };
            updateSelectedCoordsDisplay();
            updatePinCoords(pos.lat, pos.lng);
        });

        // Click on map to move marker
        addLocationMap.on('click', function (e) {
            addLocationMarker.setLatLng(e.latlng);
            selectedLocationCoords = { latitude: e.latlng.lat, longitude: e.latlng.lng };
            updateSelectedCoordsDisplay();
            updatePinCoords(e.latlng.lat, e.latlng.lng);
        });

        updatePinCoords(defaultLat, defaultLon);
        if (!selectedLocationCoords) {
            selectedLocationCoords = { latitude: defaultLat, longitude: defaultLon };
            updateSelectedCoordsDisplay();
        }
    } else {
        // Fallback: Show coordinate input fields
        container.innerHTML = `
            <div class="loc-manual-coords">
                <p class="loc-manual-coords__prompt">Enter coordinates manually:</p>
                <div class="loc-manual-coords__inputs">
                    <input type="number" id="manual-lat" placeholder="Latitude" step="0.00001" inputmode="decimal" class="loc-manual-coords__input">
                    <input type="number" id="manual-lon" placeholder="Longitude" step="0.00001" inputmode="decimal" class="loc-manual-coords__input">
                    <button onclick="applyManualCoords()" class="btn btn-secondary loc-manual-coords__btn">Set</button>
                </div>
            </div>
        `;
    }
}

/**
 * Apply manually entered coordinates
 */
export function applyManualCoords() {
    const lat = parseFloat(document.getElementById('manual-lat')?.value);
    const lon = parseFloat(document.getElementById('manual-lon')?.value);

    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        selectedLocationCoords = { latitude: lat, longitude: lon };
        updateSelectedCoordsDisplay();
        showNotification('Coordinates set!', 'success');
    } else {
        showNotification('Invalid coordinates', 'warning');
    }
}

/**
 * Update pin coordinates display
 */
function updatePinCoords(lat, lon) {
    const el = document.getElementById('pin-coordinates');
    if (el) {
        el.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }
}

/**
 * Update the selected coordinates display
 */
function updateSelectedCoordsDisplay() {
    const display = document.getElementById('selected-coords-display');
    const text = document.getElementById('selected-coords-text');

    if (display && text && selectedLocationCoords) {
        display.classList.remove('hidden');
        text.textContent = `${selectedLocationCoords.latitude.toFixed(5)}, ${selectedLocationCoords.longitude.toFixed(5)}`;
    }
}

/**
 * Close the Add Location modal
 */
export function closeAddLocationModal() {
    const modal = document.getElementById('add-location-modal');
    if (modal) {
        closeModal(modal);
    }

    // Clean up map
    if (addLocationMap) {
        addLocationMap.remove();
        addLocationMap = null;
        addLocationMarker = null;
    }

    selectedLocationCoords = null;
}

/**
 * Save new location from modal
 */
export async function saveNewLocationFromModal() {
    const input = document.getElementById('add-location-name-input');
    const locationName = input?.value?.trim();

    if (!locationName) {
        showNotification('Add a location name', 'warning');
        return;
    }

    // Check if name already exists
    if (cachedLocations.some((loc) => loc.name.toLowerCase() === locationName.toLowerCase())) {
        showNotification('A location with that name already exists', 'warning');
        return;
    }

    // Use selected coords from any method, or try GPS as fallback
    let coords = selectedLocationCoords;
    if (!coords && currentLocationMethod === 'gps') {
        coords = await getCurrentPosition();
    }

    try {
        // Save location with or without GPS
        const manager = getWorkoutManager();
        await manager.saveLocation({
            name: locationName,
            latitude: coords?.latitude || null,
            longitude: coords?.longitude || null,
            radius: 150,
            visitCount: 0,
        });

        // Close modal and refresh list
        closeAddLocationModal();
        await loadLocations();
        renderLocationManagementList();

        showNotification(`Added ${locationName}`, 'success');
    } catch (error) {
        console.error('Error adding location:', error);
        showNotification('Error adding location', 'error');
    }
}

/**
 * Edit a location name
 */
/**
 * Show a single-location detail/edit view (mockup-style).
 * Replaces the list view with name field, map, radius chips, equipment list.
 */
export function showLocationDetail(locationId) {
    const location = cachedLocations.find(loc => loc.id === locationId);
    if (!location) return;

    const container = document.getElementById('location-management-list');
    const mapContainer = document.getElementById('location-map-container');
    if (mapContainer) mapContainer.classList.add('hidden');

    // Update the canonical .page-header for the detail view. Title truncates
    // automatically via .page-header__title ellipsis styling.
    const section = document.getElementById('location-management-section');
    const staticHeader = section?.querySelector('.page-header');
    if (staticHeader) {
        staticHeader.innerHTML = `
            <div class="page-header__left">
                <button class="page-header__back" onclick="showLocationManagement()" aria-label="Back">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="page-header__title">${escapeHtml(location.name)}</div>
            </div>
            <button class="page-header__save" onclick="showLocationManagement()">Done</button>
        `;
    }

    const hasGPS = location.latitude && location.longitude;
    const address = location.cityState || (hasGPS ? `${location.latitude.toFixed(4)}° N, ${location.longitude.toFixed(4)}° W` : 'No GPS data');
    const radius = location.radius || 500;

    // Find equipment at this location
    const allEquip = AppState._cachedEquipment || [];
    const locationEquip = allEquip.filter(e =>
        (e.locations || []).some(l => l.toLowerCase() === location.name.toLowerCase()) ||
        (e.location && e.location.toLowerCase() === location.name.toLowerCase())
    );

    container.innerHTML = `
        <!-- Name -->
        <div class="field">
            <div class="field-label">Name</div>
            <input class="field-input" id="loc-detail-name" value="${escapeAttr(location.name)}">
        </div>

        <!-- Map card -->
        <div class="loc-map-card">
            <div class="loc-map-card__canvas">
                <i class="fas fa-map-marker-alt loc-map-card__pin"></i>
            </div>
            <div class="loc-map-card__info-row">
                <div>
                    <div class="loc-map-card__address">${escapeHtml(address)}</div>
                    ${hasGPS ? `<div class="loc-map-card__coords">${location.latitude.toFixed(4)}° N, ${location.longitude.toFixed(4)}° W</div>` : ''}
                </div>
                <button class="loc-map-card__use-current" onclick="detectAndAddLocation()">
                    <i class="fas fa-crosshairs"></i> Use current
                </button>
            </div>
        </div>

        <!-- Match radius -->
        <div class="field">
            <div class="field-label">Match radius</div>
            <div class="loc-radius-chips">
                <div class="chip ${radius <= 200 ? 'active' : ''}" onclick="updateLocationRadius('${escapeAttr(locationId)}', 100)">100m</div>
                <div class="chip ${radius > 200 && radius <= 700 ? 'active' : ''}" onclick="updateLocationRadius('${escapeAttr(locationId)}', 500)">500m</div>
                <div class="chip ${radius > 700 ? 'active' : ''}" onclick="updateLocationRadius('${escapeAttr(locationId)}', 1000)">1 km</div>
            </div>
        </div>

        <!-- Equipment at this location -->
        <div class="sec-head"><h4>Equipment here <span class="count">${locationEquip.length} items</span></h4></div>
        ${locationEquip.slice(0, 5).map(eq => `
            <div class="link-row">
                <div class="srow-icon ic-muted"><i class="fas fa-dumbbell"></i></div>
                <div class="link-row-info">${escapeHtml(eq.name)}</div>
                <button class="link-row-action" onclick="openEquipmentDetail('${escapeAttr(eq.id)}')">View</button>
            </div>
        `).join('')}
        ${locationEquip.length > 5 ? `<div class="loc-equip-view-all-row"><button class="loc-equip-view-all-btn">View all ${locationEquip.length} →</button></div>` : ''}
        ${locationEquip.length === 0 ? '<div class="loc-equip-empty">No equipment linked to this location</div>' : ''}

        <!-- Delete -->
        <div class="danger-action-row">
            <button class="danger-action-btn" onclick="deleteLocation('${escapeAttr(locationId)}')">
                <i class="fas fa-trash"></i> Delete location
            </button>
        </div>
    `;

    // Save name on change
    const nameInput = document.getElementById('loc-detail-name');
    if (nameInput) {
        nameInput.addEventListener('change', async () => {
            const newName = nameInput.value.trim();
            if (newName && newName !== location.name) {
                try {
                    const manager = getWorkoutManager();
                    await manager.updateLocation(locationId, { name: newName });
                    if (currentLocationName === location.name) {
                        setSessionLocation(newName);
                        currentLocationName = newName;
                    }
                    await loadLocations();
                    showNotification(`Renamed to ${newName}`, 'success', 1500);
                } catch (e) {
                    console.error('Error renaming location:', e);
                }
            }
        });
    }

    // Initialise a non-interactive Leaflet mini-map over the .loc-map-card__canvas
    // placeholder. Non-interactive = no drag/zoom/scroll — matches the spec's
    // "mini map card" intent (preview only; 'Use current' is the edit path).
    if (hasGPS) {
        setTimeout(() => initLocationDetailMiniMap(location.latitude, location.longitude), 0);
    }
}

/** One-shot init for the read-only Leaflet preview inside .loc-map-card__canvas. */
function initLocationDetailMiniMap(lat, lon) {
    if (typeof window.L === 'undefined') return; // Leaflet not yet loaded
    const canvas = document.querySelector('.loc-map-card__canvas');
    if (!canvas) return;

    // Clear the placeholder pin before mounting the Leaflet container so the
    // map renders into a clean node.
    canvas.innerHTML = '';

    const map = window.L.map(canvas, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
        attributionControl: false,
    }).setView([lat, lon], 15);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
    }).addTo(map);

    window.L.marker([lat, lon]).addTo(map);
}

/**
 * Update a location's match radius.
 */
export async function updateLocationRadius(locationId, radius) {
    try {
        const manager = getWorkoutManager();
        await manager.updateLocation(locationId, { radius });
        const loc = cachedLocations.find(l => l.id === locationId);
        if (loc) loc.radius = radius;
        showLocationDetail(locationId); // Re-render
    } catch (error) {
        console.error('Error updating radius:', error);
    }
}

export async function editLocationName(locationId) {
    const location = cachedLocations.find((loc) => loc.id === locationId);
    if (!location) return;

    const newName = prompt(`Rename "${location.name}" to:`, location.name);

    if (!newName || newName.trim() === '' || newName.trim() === location.name) {
        return;
    }

    // Check if new name already exists
    if (
        cachedLocations.some((loc) => loc.name.toLowerCase() === newName.trim().toLowerCase() && loc.id !== locationId)
    ) {
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
    const location = cachedLocations.find((loc) => loc.id === locationId);
    if (!location) return;

    if (location.name === currentLocationName) {
        showNotification('Pick another location first, then delete this one', 'warning');
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
                src="https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01}%2C${lat - 0.01}%2C${lon + 0.01}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lon}"
                class="loc-map-iframe">
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
        <div class="current-location-chip">
            <i class="fas fa-map-marker-alt text-primary"></i>
            <span>${location}</span>
        </div>
    `;
}
