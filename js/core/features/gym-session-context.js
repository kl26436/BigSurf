// Gym Session Context - core/features/gym-session-context.js
//
// Resolves "which gym is the user at?" BEFORE a workout starts (traveler-flow
// D1): compatibility badges on the Workouts page need a location, but GPS
// detection historically ran only at workout start. This module runs the same
// nearest-saved-gym matching on page entry, caches the answer for the app
// session, and accepts a manual override from the gym context chip.
//
// Deliberately does NOT call detectLocation(): that function stamps
// location-service's session location as a side effect, which would make
// workout start skip its own detection/confirmation flow. We reuse the pure
// pieces (getCurrentPosition + findNearbyLocation) instead.

import { AppState } from '../utils/app-state.js';
import { getCurrentPosition, findNearbyLocation, getSessionLocation } from './location-service.js';
import { FirebaseWorkoutManager } from '../data/firebase-workout-manager.js';
import { Config, debugLog } from '../utils/config.js';

let resolved = false;
let sessionGym = null;   // string | null
let resolving = null;    // in-flight promise guard

/** The resolved gym name for this app session (null = unknown / cleared). */
export function getSessionGym() {
    return sessionGym;
}

/** Manual override from the gym context chip. Sticks for the session. */
export function setSessionGym(name) {
    sessionGym = name || null;
    resolved = true;
}

/**
 * Resolve the session gym once per app session: an active workout's location
 * wins; otherwise GPS → nearest saved gym within radius. Unusable accuracy
 * counts as no GPS (same gate as detectLocation). Never throws.
 */
export async function resolveSessionGym() {
    if (resolved) return sessionGym;
    if (resolving) return resolving;

    resolving = (async () => {
        try {
            // An in-flight workout already carries the authoritative location.
            const activeLoc = AppState.savedData?.location;
            const active = getSessionLocation()
                || (typeof activeLoc === 'object' ? activeLoc?.name : activeLoc);
            if (active) {
                sessionGym = active;
                return sessionGym;
            }

            const mgr = new FirebaseWorkoutManager(AppState);
            const saved = await mgr.getUserLocations();
            if (!Array.isArray(saved) || saved.length === 0) {
                sessionGym = null;
                return null;
            }

            const coords = await getCurrentPosition();
            const usable = coords
                && !(coords.accuracy && coords.accuracy > Config.GPS_UNUSABLE_ACCURACY_METERS);
            const match = usable ? findNearbyLocation(saved, coords) : null;
            sessionGym = match?.name || null;
            return sessionGym;
        } catch (e) {
            debugLog('resolveSessionGym failed:', e);
            sessionGym = null;
            return null;
        } finally {
            resolved = true;
            resolving = null;
        }
    })();

    return resolving;
}

/** Reset (e.g. after sign-out). Next resolve re-runs detection. */
export function resetSessionGym() {
    resolved = false;
    sessionGym = null;
    resolving = null;
}
