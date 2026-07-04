// Phase 8b step 4 — location-id migration planners.
// Load-bearing properties: never guess an ambiguous gym, never silently drop a
// gym association (orphan names are surfaced for doc-creation, not dropped), and
// the backfill is idempotent.

import { describe, it, expect } from 'vitest';
import { resolveLocationId, normalizeLocationName } from '../../js/core/data/location-id-resolver.js';
import { planLocationIdBackfill, planOrphanGymDocs } from '../../js/core/data/location-id-migration.js';

const LOCS = [
    { id: 'location_1', name: 'Downtown Gym' },
    { id: 'location_2', name: 'Home Gym' },
];

describe('resolveLocationId', () => {
    it('resolves an exact (normalized) name to its id', () => {
        expect(resolveLocationId('Downtown Gym', LOCS)).toMatchObject({ id: 'location_1', method: 'exact' });
        expect(resolveLocationId('  downtown   gym ', LOCS)).toMatchObject({ id: 'location_1', method: 'exact' });
    });

    it('returns NONE (no review) for a gym with no doc — an orphan to create', () => {
        expect(resolveLocationId('Planet Fitness', LOCS)).toMatchObject({ id: null, method: 'none', needsReview: false });
    });

    it('flags AMBIGUOUS when two docs share a name — never guesses', () => {
        const dupes = [{ id: 'a', name: 'Gym' }, { id: 'b', name: 'Gym' }];
        const r = resolveLocationId('Gym', dupes);
        expect(r.id).toBeNull();
        expect(r.method).toBe('ambiguous');
        expect(r.needsReview).toBe(true);
        expect(r.candidates).toEqual(['a', 'b']);
    });

    it('empty/blank name → NONE', () => {
        expect(resolveLocationId('', LOCS).method).toBe('none');
        expect(resolveLocationId(null, LOCS).method).toBe('none');
    });
});

describe('planLocationIdBackfill', () => {
    it('maps equipment gym names to location ids', () => {
        const equipment = [
            { id: 'e1', locations: ['Downtown Gym', 'Home Gym'] },
            { id: 'e2', locations: ['Home Gym'] },
        ];
        const { writes, stats } = planLocationIdBackfill(equipment, LOCS);
        expect(writes).toContainEqual({ equipmentId: 'e1', locationIds: ['location_1', 'location_2'] });
        expect(writes).toContainEqual({ equipmentId: 'e2', locationIds: ['location_2'] });
        expect(stats.resolved).toBe(3);
        expect(stats.orphans).toBe(0);
    });

    it('surfaces orphan gym names (no doc) instead of dropping them', () => {
        const equipment = [{ id: 'e1', locations: ['Downtown Gym', 'Planet Fitness'] }];
        const { writes, orphanGymNames } = planLocationIdBackfill(equipment, LOCS);
        // The resolvable one is still written…
        expect(writes).toContainEqual({ equipmentId: 'e1', locationIds: ['location_1'] });
        // …and the orphan is surfaced for doc-creation, not silently lost.
        expect(orphanGymNames).toContain('Planet Fitness');
    });

    it('is idempotent — no write when locationIds already correct', () => {
        const equipment = [{ id: 'e1', locations: ['Home Gym'], locationIds: ['location_2'] }];
        const { writes } = planLocationIdBackfill(equipment, LOCS);
        expect(writes).toHaveLength(0);
    });

    it('dedupes when two names resolve to the same id', () => {
        const dupeLocs = [{ id: 'location_1', name: 'Downtown Gym' }, { id: 'location_1b', name: 'Home Gym' }];
        const equipment = [{ id: 'e1', locations: ['Downtown Gym', 'downtown gym'] }];
        const { writes } = planLocationIdBackfill(equipment, dupeLocs);
        expect(writes).toContainEqual({ equipmentId: 'e1', locationIds: ['location_1'] });
    });

    it('skips equipment with no gym names', () => {
        const { writes, stats } = planLocationIdBackfill([{ id: 'e1', locations: [] }, { id: 'e2' }], LOCS);
        expect(writes).toHaveLength(0);
        expect(stats.totalNames).toBe(0);
    });

    it('flags ambiguous names for review without writing them', () => {
        const dupes = [{ id: 'a', name: 'Gym' }, { id: 'b', name: 'Gym' }];
        const { writes, review } = planLocationIdBackfill([{ id: 'e1', locations: ['Gym'] }], dupes);
        expect(writes).toHaveLength(0);
        expect(review).toHaveLength(1);
        expect(review[0]).toMatchObject({ equipmentId: 'e1', name: 'Gym' });
    });
});

describe('planOrphanGymDocs', () => {
    it('lists distinct gym names on equipment that have no location doc', () => {
        const equipment = [
            { id: 'e1', locations: ['Downtown Gym', 'Planet Fitness'] },
            { id: 'e2', locations: ['planet fitness', 'Gold’s Gym'] },
        ];
        const orphans = planOrphanGymDocs(equipment, LOCS);
        expect(orphans).toContain('Planet Fitness');
        expect(orphans).toContain('Gold’s Gym');
        expect(orphans).not.toContain('Downtown Gym'); // has a doc
        // "planet fitness" and "Planet Fitness" collapse to one orphan
        expect(orphans.filter((n) => normalizeLocationName(n) === 'planet fitness')).toHaveLength(1);
    });
});
