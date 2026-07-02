// Tests for GPS location matching (Haversine distance + radius matching).
// Imports the real location-service module — ui-helpers is mocked because it
// touches the DOM at import time; the math under test is pure.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
}));

import { calculateDistance, findNearbyLocation } from '../../js/core/features/location-service.js';

// ~111,195 m per degree of latitude (2πR/360 with R = 6,371,000 m)
const METERS_PER_DEG_LAT = (Math.PI * 6371000) / 180;
const GYM = { latitude: 40.0, longitude: -75.0 };
const coordsAtDistance = (meters) => ({
    latitude: GYM.latitude + meters / METERS_PER_DEG_LAT,
    longitude: GYM.longitude,
});

describe('calculateDistance', () => {
    it('is zero for identical points', () => {
        expect(calculateDistance(40, -75, 40, -75)).toBe(0);
    });

    it('measures one degree of latitude as ~111.2 km', () => {
        const d = calculateDistance(40, -75, 41, -75);
        expect(d).toBeGreaterThan(111000);
        expect(d).toBeLessThan(111400);
    });

    it('is symmetric', () => {
        const ab = calculateDistance(40, -75, 40.5, -74.5);
        const ba = calculateDistance(40.5, -74.5, 40, -75);
        expect(ab).toBeCloseTo(ba, 6);
    });

    it('resolves small offsets accurately (500m target)', () => {
        const point = coordsAtDistance(500);
        const d = calculateDistance(GYM.latitude, GYM.longitude, point.latitude, point.longitude);
        expect(d).toBeGreaterThan(499);
        expect(d).toBeLessThan(501);
    });
});

describe('findNearbyLocation', () => {
    const downtownGym = { name: 'Downtown Gym', ...GYM };

    it('returns null for missing inputs', () => {
        expect(findNearbyLocation(null, coordsAtDistance(0))).toBeNull();
        expect(findNearbyLocation([downtownGym], null)).toBeNull();
        expect(findNearbyLocation([], coordsAtDistance(0))).toBeNull();
    });

    it('skips saved locations without coordinates', () => {
        const noGps = { name: 'No GPS Gym' };
        expect(findNearbyLocation([noGps], coordsAtDistance(0))).toBeNull();
    });

    it('matches inside the default 500m radius and rejects outside it', () => {
        expect(findNearbyLocation([downtownGym], coordsAtDistance(499))?.name).toBe('Downtown Gym');
        expect(findNearbyLocation([downtownGym], coordsAtDistance(505))).toBeNull();
    });

    it("honors a location's custom radius over the default", () => {
        const tightGym = { name: 'Tight Gym', ...GYM, radius: 100 };
        const wideGym = { name: 'Wide Gym', ...GYM, radius: 1000 };

        expect(findNearbyLocation([tightGym], coordsAtDistance(150))).toBeNull();
        expect(findNearbyLocation([wideGym], coordsAtDistance(800))?.name).toBe('Wide Gym');
    });

    it('widens the search with minRadius but never narrows a custom radius', () => {
        const tightGym = { name: 'Tight Gym', ...GYM, radius: 100 };
        const wideGym = { name: 'Wide Gym', ...GYM, radius: 1000 };

        expect(findNearbyLocation([tightGym], coordsAtDistance(300), 500)?.name).toBe('Tight Gym');
        expect(findNearbyLocation([wideGym], coordsAtDistance(800), 500)?.name).toBe('Wide Gym');
    });

    it('returns the first match in array order, not the nearest', () => {
        // Documents current behavior: with overlapping gyms the saved-list order
        // decides, even when a later entry is closer to the user.
        const fartherFirst = { name: 'Farther Gym', ...coordsAtDistance(400) };
        const closerSecond = { name: 'Closer Gym', ...coordsAtDistance(50) };
        const user = coordsAtDistance(0);

        const match = findNearbyLocation([fartherFirst, closerSecond], user);
        expect(match?.name).toBe('Farther Gym');
    });
});
