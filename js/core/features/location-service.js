// Location Service Module
// Handles GPS location detection and gym location management

import { AppState } from '../utils/app-state.js';
import { showNotification, openModal, closeModal } from '../ui/ui-helpers.js';
import { Config, debugLog } from '../utils/config.js';

// Default radius in meters for location matching
// 500m accounts for GPS inaccuracy indoors, parking lot distance, and multi-building facilities
const DEFAULT_LOCATION_RADIUS = Config.GPS_MATCH_RADIUS_METERS;

// Current session location state
let currentLocation = null;
let currentLocationName = null;
let locationLocked = false;

/**
 * Get current GPS coordinates
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
export function getCurrentPosition() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.error('❌ Geolocation not supported');
            resolve(null);
            return;
        }

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
            (error) => {
                console.error('❌ Geolocation error:', error.message);
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
export function findNearbyLocation(savedLocations, coords, minRadius = null) {
    if (!savedLocations || !coords) return null;

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

        if (isMatch) {
            return location;
        }
    }

    return null;
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
        return { location: null, isNew: false, coords: null };
    }

    const matchedLocation = findNearbyLocation(savedLocations, coords);

    if (matchedLocation) {
        currentLocationName = matchedLocation.name;
        return {
            location: matchedLocation,
            isNew: false,
            coords,
        };
    }

    // At a new location
    return {
        location: null,
        isNew: true,
        coords,
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
 * Lock the location (called when first set is logged)
 */
export function lockLocation() {
    locationLocked = true;
}

/**
 * Check if location is locked
 * @returns {boolean}
 */
export function isLocationLocked() {
    return locationLocked;
}

/**
 * Reset location state (called when workout ends)
 */
export function resetLocationState() {
    currentLocation = null;
    currentLocationName = null;
    locationLocked = false;
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
 * @param {boolean} locked
 */
export function updateLocationIndicator(locationName, locked = false) {
    const indicator = document.getElementById('workout-location-indicator');
    const nameSpan = document.getElementById('workout-location-name');
    const lockIcon = document.getElementById('workout-location-lock');

    if (!indicator) return;

    // Always show the indicator (user can tap to set/change location)
    indicator.classList.remove('hidden');

    if (locationName) {
        if (nameSpan) nameSpan.textContent = locationName;
    } else {
        if (nameSpan) nameSpan.textContent = 'Tap to set location';
    }
    // Hide lock icon — adds visual noise without value
    if (lockIcon) lockIcon.style.display = 'none';
}

// Export for use in other modules
export default {
    getCurrentPosition,
    calculateDistance,
    findNearbyLocation,
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
