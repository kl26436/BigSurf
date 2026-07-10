// Location Service Module
// Handles GPS location detection and gym location management

import { showNotification, openModal, closeModal } from '../ui/ui-helpers.js';
import { Config, debugLog } from '../utils/config.js';

// Default radius in meters for location matching
// 500m accounts for GPS inaccuracy indoors, parking lot distance, and multi-building facilities
const DEFAULT_LOCATION_RADIUS = Config.GPS_MATCH_RADIUS_METERS;

// Current session location state
let currentLocation = null;
let currentLocationName = null;

/**
 * Get current GPS coordinates
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
// Codes: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
const GEO_ERROR_LABEL = { 1: 'permission-denied', 2: 'position-unavailable', 3: 'timeout' };

// Cache the last error so the UI can surface a specific reason ("permission
// denied" vs "timeout") when the "GPS isn't working" complaint comes in —
// resolve(null) alone hid the cause.
let _lastGeoError = null;
export function getLastGeoError() { return _lastGeoError; }

// Rate-limit the captureWarning to once per 5 minutes per error label. A rapid
// retry loop (22 fires in 7s on 2026-07-09 after the first fix rolled out) would
// otherwise pile up Firestore writes for the same permission-denied answer.
const _lastGeoWarn = {};

export function getCurrentPosition() {
    _lastGeoError = null;
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            _lastGeoError = { code: 0, label: 'unsupported', message: 'Geolocation not supported' };
            console.error('❌ Geolocation not supported');
            resolve(null);
            return;
        }

        // iOS Safari can return silently after enableHighAccuracy times out —
        // surface the failure mode (permission denied vs timeout vs unavailable)
        // to errorLogs so the "GPS isn't working" reports have a diagnostic
        // trail, and cache it so the UI can show a specific reason.
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                };
                currentLocation = coords;
                resolve(coords);
            },
            async (error) => {
                _lastGeoError = {
                    code: error.code,
                    label: GEO_ERROR_LABEL[error.code] || 'unknown',
                    message: error.message || '',
                };
                console.error('❌ Geolocation error:', _lastGeoError);
                const now = Date.now();
                const last = _lastGeoWarn[_lastGeoError.label] || 0;
                if (now - last > 5 * 60 * 1000) {
                    _lastGeoWarn[_lastGeoError.label] = now;
                    try {
                        const { captureWarning } = await import('../utils/error-handler.js');
                        captureWarning(
                            `Geolocation failed — ${_lastGeoError.label}`,
                            'getCurrentPosition',
                            {
                                code: error.code,
                                label: _lastGeoError.label,
                                message: error.message || null,
                                userAgent: navigator.userAgent || null,
                            }
                        );
                    } catch { /* diagnostic must not break flow */ }
                }
                resolve(null);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000, // Cache for 1 minute
            }
        );
    });
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Find a saved location that matches current GPS coordinates
 * @param {Array} savedLocations - Array of saved location objects
 * @param {{latitude: number, longitude: number}} coords - Current coordinates
 * @returns {Object | null} Matching location or null
 */
/**
 * Find ALL saved locations within radius of the given coordinates, sorted
 * nearest-first. Each match carries a `distance` field (meters). Callers can
 * detect ambiguity (adjacent gyms whose radii overlap) via matches.length > 1.
 */
export function findNearbyLocations(savedLocations, coords, minRadius = null) {
    if (!savedLocations || !coords) return [];

    const matches = [];

    for (const location of savedLocations) {
        if (!location.latitude || !location.longitude) continue;

        const distance = calculateDistance(coords.latitude, coords.longitude, location.latitude, location.longitude);

        // Use the larger of: location's saved radius, default radius, or provided minimum radius
        const locationRadius = location.radius || DEFAULT_LOCATION_RADIUS;
        const radius = minRadius ? Math.max(locationRadius, minRadius) : locationRadius;
        const isMatch = distance <= radius;

        debugLog(
            `📍 ${location.name}: ${Math.round(distance)}m away (radius: ${radius}m) - ${isMatch ? 'MATCH' : 'too far'}`
        );

        if (isMatch) matches.push({ ...location, distance });
    }

    matches.sort((a, b) => a.distance - b.distance);
    return matches;
}

export function findNearbyLocation(savedLocations, coords, minRadius = null) {
    // Nearest match wins, not first match — adjacent gyms (think Bellagio vs
    // Cosmopolitan on the Strip) sit within each other's 500m radius, and GPS
    // is noisy indoors, so array order must not decide which gym gets tagged.
    return findNearbyLocations(savedLocations, coords, minRadius)[0] || null;
}

/**
 * Initialize location detection for a workout session
 * Checks GPS and matches against saved locations
 * @param {Array} savedLocations - User's saved gym locations
 * @returns {Promise<{location: Object | null, isNew: boolean, coords: Object | null}>}
 */
export async function detectLocation(savedLocations) {
    const coords = await getCurrentPosition();

    if (!coords) {
        return { location: null, isNew: false, coords: null, nearbyMatches: [] };
    }

    // A wildly inaccurate fix (cell-tower triangulation indoors) can't tell
    // gyms apart — treat it as no GPS so the caller falls back to the
    // pick-your-gym flow instead of saving garbage coordinates.
    if (coords.accuracy && coords.accuracy > Config.GPS_UNUSABLE_ACCURACY_METERS) {
        debugLog(`📍 GPS accuracy ${Math.round(coords.accuracy)}m — too coarse to use`);
        return { location: null, isNew: false, coords: null, nearbyMatches: [] };
    }

    const nearbyMatches = findNearbyLocations(savedLocations, coords);

    if (nearbyMatches.length > 0) {
        currentLocationName = nearbyMatches[0].name;
        return {
            location: nearbyMatches[0],
            isNew: false,
            coords,
            nearbyMatches,
        };
    }

    // At a new location
    return {
        location: null,
        isNew: true,
        coords,
        nearbyMatches: [],
    };
}

/**
 * Set the current session location
 * @param {string} locationName
 */
export function setSessionLocation(locationName) {
    currentLocationName = locationName;
}

/**
 * Get the current session location name
 * @returns {string | null}
 */
export function getSessionLocation() {
    return currentLocationName;
}

/**
 * Get the current GPS coordinates
 * @returns {Object | null}
 */
export function getCurrentCoords() {
    return currentLocation;
}

/**
 * DEPRECATED (Tier 2.3): the location "lock" never blocked anything — the
 * icon was hidden and changes stayed allowed all workout — so the state was
 * deleted. These stubs remain exported ONLY because prod caches JS for a
 * year: a stale cached module importing them from a fresh copy of this file
 * would otherwise crash. Don't call them from new code.
 */
export function lockLocation() {}
export function isLocationLocked() {
    return false;
}

/**
 * Reset location state (called when workout ends)
 */
export function resetLocationState() {
    currentLocation = null;
    currentLocationName = null;
}

/**
 * Show the location name prompt modal
 * @param {Function} onSave - Callback when location is saved
 * @param {Function} onSkip - Callback when user skips
 */
export function showLocationPrompt(onSave, onSkip) {
    const modal = document.getElementById('location-prompt-modal');
    const input = document.getElementById('new-location-name');
    const saveBtn = document.getElementById('save-location-btn');
    const skipBtn = document.getElementById('skip-location-btn');

    if (!modal) {
        console.error('❌ Location prompt modal not found');
        if (onSkip) onSkip();
        return;
    }

    // Clear previous input
    if (input) input.value = '';

    // Show modal
    openModal(modal);
    if (input) input.focus();

    // Handle save
    const handleSave = () => {
        const name = input?.value.trim();
        if (!name) {
            showNotification('Add a location name', 'warning');
            return;
        }
        closeModal(modal);
        cleanup();
        if (onSave) onSave(name);
    };

    // Handle skip
    const handleSkip = () => {
        closeModal(modal);
        cleanup();
        if (onSkip) onSkip();
    };

    // Handle enter key
    const handleKeydown = (e) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            handleSkip();
        }
    };

    // Cleanup listeners
    const cleanup = () => {
        saveBtn?.removeEventListener('click', handleSave);
        skipBtn?.removeEventListener('click', handleSkip);
        input?.removeEventListener('keydown', handleKeydown);
    };

    // Add listeners
    saveBtn?.addEventListener('click', handleSave);
    skipBtn?.addEventListener('click', handleSkip);
    input?.addEventListener('keydown', handleKeydown);
}

/**
 * Close the location prompt modal
 */
export function closeLocationPrompt() {
    const modal = document.getElementById('location-prompt-modal');
    closeModal(modal);
}

/**
 * Update the location indicator in the workout header
 * @param {string | null} locationName
 */
export function updateLocationIndicator(locationName) {
    const indicator = document.getElementById('workout-location-indicator');
    const nameSpan = document.getElementById('workout-location-name');

    if (!indicator) return;

    // Always show the indicator (user can tap to set/change location)
    indicator.classList.remove('hidden');

    if (locationName) {
        if (nameSpan) nameSpan.textContent = locationName;
    } else {
        if (nameSpan) nameSpan.textContent = 'Tap to set location';
    }
}

// Export for use in other modules
export default {
    getCurrentPosition,
    calculateDistance,
    findNearbyLocation,
    findNearbyLocations,
    detectLocation,
    setSessionLocation,
    getSessionLocation,
    getCurrentCoords,
    lockLocation,
    isLocationLocked,
    resetLocationState,
    showLocationPrompt,
    closeLocationPrompt,
    updateLocationIndicator,
};
