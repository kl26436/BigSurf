// LB-2 / LB-3 — the coach's list_exercises sees the labels the app sees:
// canonical body parts (no "Calves" group), the pattern each exercise
// trains, and an override with empty tags no longer erases the built-in's.

import { describe, it, expect } from 'vitest';
import { makeToolExecutors } from '../../functions/coach-tools.js';
import { fakeAdminDb } from '../fixtures/admin-db-mock.js';

const U = 'users/u1';

describe('list_exercises', () => {
    const db = () => fakeAdminDb({
        // The user's override of the built-in calf raise: legacy body part, empty tags.
        [`${U}/exerciseOverrides/calf`]: { originalName: 'Calf Raise Machine', name: 'Calf Raise Machine', bodyPart: 'Calves', tags: [] },
        [`${U}/customExercises/c1`]: { name: 'Laying Crunch', bodyPart: 'Abs', tags: [] },
        [`${U}/customExercises/c2`]: { name: 'Reverse Hip Station', bodyPart: 'Glutes', tags: [], pattern: 'hip-dominant' },
    });

    it('groups by the eight body parts and returns each exercise\'s pattern', async () => {
        const out = await makeToolExecutors({ db: db(), userId: 'u1' }).list_exercises({});
        expect(Object.keys(out.byBodyPart)).not.toContain('Calves');
        expect(Object.keys(out.byBodyPart)).not.toContain('Abs');
        const find = (part, name) => out.byBodyPart[part]?.find(e => e.name === name);
        const calf = find('Legs', 'Calf Raise Machine');
        expect(calf).toMatchObject({ pattern: 'calf' });
        expect(calf.tags).toEqual(['legs', 'calves', 'isolation']); // built-in tags survive the override
        expect(find('Core', 'Laying Crunch')).toMatchObject({ pattern: 'trunk-flex', custom: true });
        expect(find('Glutes', 'Reverse Hip Station')).toMatchObject({ pattern: 'hip-dominant' });
    });

    it('a "calves" filter still finds calf raises (now Legs + tag)', async () => {
        const out = await makeToolExecutors({ db: db(), userId: 'u1' }).list_exercises({ bodyPart: 'calves' });
        expect(out.byBodyPart.Legs.map(e => e.name)).toContain('Calf Raise Machine');
    });
});
