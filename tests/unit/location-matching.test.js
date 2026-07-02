// Tests for GPS location matching (Haversine distance + radius matching).
// Imports the real location-service module — ui-helpers is mocked because it
// touches the DOM at import time; the math under test is pure.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
}));

import { calculateDistance, findNearbyLocation, findNearbyLocations } from '../../js/core/features/location-service.js';

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

    it('returns the nearest match when radii overlap, regardless of array order', () => {
        // Adjacent gyms (e.g. Bellagio vs Cosmopolitan, ~350m apart) sit inside
        // each other's 500m radius — the closer one must win, not the first saved.
        const fartherFirst = { name: 'Farther Gym', ...coordsAtDistance(400) };
        const closerSecond = { name: 'Closer Gym', ...coordsAtDistance(50) };
        const user = coordsAtDistance(0);

        expect(findNearbyLocation([fartherFirst, closerSecond], user)?.name).toBe('Closer Gym');
        expect(findNearbyLocation([closerSecond, fartherFirst], user)?.name).toBe('Closer Gym');
    });

    it('exposes ambiguity via findNearbyLocations — all overlapping gyms, nearest first, with distances', () => {
        const bellagio = { name: 'Bellagio Spa & Fitness', latitude: 36.1126, longitude: -115.1767 };
        const cosmopolitan = { name: 'Cosmopolitan Fitness Center', latitude: 36.1096, longitude: -115.1743 };
        const farAway = { name: 'Home Gym', latitude: 41.0, longitude: -80.0 };
        const userAtCosmo = { latitude: 36.1097, longitude: -115.1744 };

        const matches = findNearbyLocations([farAway, bellagio, cosmopolitan], userAtCosmo);

        expect(matches.map((m) => m.name)).toEqual(['Cosmopolitan Fitness Center', 'Bellagio Spa & Fitness']);
        expect(matches[0].distance).toBeLessThan(matches[1].distance);
        expect(matches.every((m) => typeof m.distance === 'number')).toBe(true);
    });

    it('findNearbyLocations returns empty for missing inputs and no matches', () => {
        expect(findNearbyLocations(null, coordsAtDistance(0))).toEqual([]);
        expect(findNearbyLocations([{ name: 'Gym', ...GYM }], null)).toEqual([]);
        expect(findNearbyLocations([{ name: 'Gym', ...GYM }], coordsAtDistance(5000))).toEqual([]);
    });

    it('picks the right casino gym on the Strip', () => {
        // Real coordinates: standing in the Cosmopolitan fitness center must not
        // tag the workout to Bellagio, whichever was saved first.
        const bellagio = { name: 'Bellagio Spa & Fitness', latitude: 36.1126, longitude: -115.1767 };
        const cosmopolitan = { name: 'Cosmopolitan Fitness Center', latitude: 36.1096, longitude: -115.1743 };
        const userAtCosmo = { latitude: 36.1097, longitude: -115.1744 };

        const match = findNearbyLocation([bellagio, cosmopolitan], userAtCosmo);
        expect(match?.name).toBe('Cosmopolitan Fitness Center');
    });
});
