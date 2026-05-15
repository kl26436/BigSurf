// Reverse Geocoding — js/core/features/geocoding.js
//
// Converts latitude/longitude into a human-readable "City, State" string via
// OpenStreetMap's Nominatim service. Free, no API key, but rate-limited:
// "No heavy uses... max 1 request per second" per their usage policy.
// We respect this by enforcing a serial queue with a 1s gap between calls.
//
// Results are cached in memory by `${lat.toFixed(4)},${lng.toFixed(4)}` so
// re-rendering doesn't re-fetch. Persistence to Firestore happens at the
// caller's discretion via `updateLocation`.

const cache = new Map(); // key: "lat,lng" → { displayString, city, state, country } | null
const queue = [];
let processing = false;
let lastCallAt = 0;
const MIN_GAP_MS = 1000;

/**
 * Reverse-geocode a coordinate pair. Returns { displayString, city, state,
 * country } on success, null on any failure (network, no result, etc.).
 * Results are cached so subsequent calls with the same coords are free.
 */
export async function reverseGeocode(lat, lng) {
    if (lat == null || lng == null) return null;
    const key = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
    if (cache.has(key)) return cache.get(key);

    return new Promise((resolve) => {
        queue.push({ lat, lng, key, resolve });
        processQueue();
    });
}

async function processQueue() {
    if (processing) return;
    processing = true;
    while (queue.length > 0) {
        const { lat, lng, key, resolve } = queue.shift();
        const sinceLast = Date.now() - lastCallAt;
        if (sinceLast < MIN_GAP_MS) {
            await new Promise((r) => setTimeout(r, MIN_GAP_MS - sinceLast));
        }
        lastCallAt = Date.now();
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json&zoom=14&addressdetails=1`;
            const resp = await fetch(url, {
                headers: {
                    // Nominatim's policy asks for a UA. They throttle anonymous heavy users.
                    'Accept-Language': navigator.language || 'en',
                },
            });
            if (!resp.ok) {
                cache.set(key, null);
                resolve(null);
                continue;
            }
            const data = await resp.json();
            const result = extractCityState(data);
            cache.set(key, result);
            resolve(result);
        } catch (err) {
            console.warn('Reverse geocode failed:', err);
            cache.set(key, null);
            resolve(null);
        }
    }
    processing = false;
}

/**
 * Extract a clean "City, State" (and country if non-local) from a Nominatim
 * response. Nominatim's `address` object varies by location, so we look at
 * several keys in priority order.
 */
function extractCityState(data) {
    if (!data || !data.address) return null;
    const a = data.address;

    // City equivalents in order of specificity
    const city =
        a.city ||
        a.town ||
        a.village ||
        a.hamlet ||
        a.municipality ||
        a.county ||
        null;

    // State / region
    const state = a.state || a.region || a.province || null;

    const country = a.country || null;
    const countryCode = (a.country_code || '').toUpperCase();

    // Build the display string. US: "Austin, TX". Non-US: "Vancouver, BC, Canada".
    let displayString;
    if (countryCode === 'US' && city && state) {
        // Prefer state abbreviation when we have it (US ISO codes from a.ISO3166-2-lvl4)
        const stateAbbr = (a['ISO3166-2-lvl4'] || '').replace('US-', '') || state;
        displayString = `${city}, ${stateAbbr}`;
    } else if (city && state) {
        displayString = country ? `${city}, ${state}, ${country}` : `${city}, ${state}`;
    } else if (city) {
        displayString = country ? `${city}, ${country}` : city;
    } else if (state) {
        displayString = country ? `${state}, ${country}` : state;
    } else if (country) {
        displayString = country;
    } else {
        return null;
    }

    return { displayString, city, state, country };
}

/**
 * Test hook — clears the in-memory cache and queue (no actual Firestore impact).
 */
export function __resetGeocodingCache() {
    cache.clear();
    queue.length = 0;
    processing = false;
    lastCallAt = 0;
}
