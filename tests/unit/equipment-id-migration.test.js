// Phase 8b migration safety — backfill + PR re-key planners.
// Imports the REAL planners. Load-bearing properties: the backfill never writes
// an ambiguous ID, and the PR re-key never loses a PR (the scariest failure —
// a silently-vanished personal record).

import { describe, it, expect } from 'vitest';
import {
    planEquipmentIdBackfill,
    rekeyExercisePRsByEquipmentId,
} from '../../js/core/data/equipment-id-migration.js';

const EQUIP = [
    { id: 'e_bench', name: 'Flat Bench Press' },
    { id: 'e_lat', name: 'Lat Pulldown' },
    { id: 'e_leg', name: 'Leg Press' },
];

describe('planEquipmentIdBackfill', () => {
    it('resolves exact-name equipment to writes, leaves unknowns for review', () => {
        const docs = [{
            id: 'w1',
            exercises: {
                exercise_0: { name: 'Bench', equipment: 'Flat Bench Press' },
                exercise_1: { name: 'Row', equipment: 'Some Machine I Never Saved' },
            },
        }];
        const { writes, review, stats } = planEquipmentIdBackfill(docs, EQUIP);
        expect(writes).toEqual([
            expect.objectContaining({ docId: 'w1', exerciseKey: 'exercise_0', equipmentId: 'e_bench' }),
        ]);
        expect(review).toHaveLength(1);
        expect(review[0]).toMatchObject({ docId: 'w1', exerciseKey: 'exercise_1' });
        expect(stats.total).toBe(2);
        expect(stats.resolved).toBe(1);
        expect(stats.needsReview).toBe(1);
    });

    it('skips bodyweight / no-equipment exercises', () => {
        const docs = [{ id: 'w1', exercises: { exercise_0: { name: 'Pushup' } } }];
        const { writes, review, stats } = planEquipmentIdBackfill(docs, EQUIP);
        expect(writes).toHaveLength(0);
        expect(review).toHaveLength(0);
        expect(stats.skippedNoEquipment).toBe(1);
    });

    it('is idempotent — already-backfilled entries are left alone', () => {
        const docs = [{
            id: 'w1',
            exercises: { exercise_0: { equipment: 'Flat Bench Press', equipmentId: 'e_bench' } },
        }];
        const { writes, stats } = planEquipmentIdBackfill(docs, EQUIP);
        expect(writes).toHaveLength(0);
        expect(stats.alreadyDone).toBe(1);
    });

    it('handles the array exercise shape too', () => {
        const docs = [{ id: 't1', exercises: [{ equipment: 'Leg Press' }] }];
        const { writes } = planEquipmentIdBackfill(docs, EQUIP);
        expect(writes[0]).toMatchObject({ docId: 't1', exerciseKey: '0', equipmentId: 'e_leg' });
    });

    it('never writes an ambiguous match', () => {
        const dupes = [{ id: 'a', name: 'Machine' }, { id: 'b', name: 'Machine' }];
        const docs = [{ id: 'w1', exercises: { exercise_0: { equipment: 'Machine' } } }];
        const { writes, review } = planEquipmentIdBackfill(docs, dupes);
        expect(writes).toHaveLength(0);
        expect(review).toHaveLength(1);
    });
});

describe('rekeyExercisePRsByEquipmentId — never loses a PR', () => {
    const countPRs = (store) =>
        Object.values(store).reduce((n, byKey) => n + Object.keys(byKey).length, 0);

    it('re-keys resolved names to ids and preserves the PR payload', () => {
        const prs = { 'Bench Press': { 'Flat Bench Press': { weight: 225, reps: 5 } } };
        const { rekeyed } = rekeyExercisePRsByEquipmentId(prs, EQUIP);
        expect(rekeyed['Bench Press']).toEqual({ e_bench: { weight: 225, reps: 5 } });
    });

    it('keeps unresolved names under their original key (nothing dropped)', () => {
        const prs = { 'Bench Press': {
            'Flat Bench Press': { weight: 225 },
            'Mystery Machine': { weight: 100 },
        } };
        const { rekeyed, review, stats } = rekeyExercisePRsByEquipmentId(prs, EQUIP);
        expect(rekeyed['Bench Press'].e_bench).toEqual({ weight: 225 });
        expect(rekeyed['Bench Press']['Mystery Machine']).toEqual({ weight: 100 });
        expect(countPRs(rekeyed)).toBe(countPRs(prs)); // conservation
        expect(stats.keptUnderName).toBe(1);
        expect(review).toHaveLength(1);
    });

    it('merges two names that resolve to one id, keeping the heavier PR', () => {
        const equip = [{ id: 'e_bench', name: 'Bench Press', aliases: ['Barbell Bench'] }];
        const prs = { 'Bench': {
            'Bench Press': { weight: 200, reps: 5 },
            'Barbell Bench': { weight: 245, reps: 3 },  // alias → same id
        } };
        const { rekeyed, stats } = rekeyExercisePRsByEquipmentId(prs, equip);
        // One merged key, and it kept the heavier lift — the PR did NOT vanish.
        expect(Object.keys(rekeyed['Bench'])).toEqual(['e_bench']);
        expect(rekeyed['Bench'].e_bench.weight).toBe(245);
        expect(stats.merges).toBe(1);
    });

    it('a custom betterPr comparator (e.g. e1RM) is honored on merge', () => {
        const equip = [{ id: 'x', name: 'Row', aliases: ['Cable Row'] }];
        const prs = { 'Row': {
            'Row': { weight: 100, e1rm: 130 },
            'Cable Row': { weight: 120, e1rm: 125 },
        } };
        const byE1rm = (a, b) => ((b?.e1rm || 0) > (a?.e1rm || 0) ? b : a);
        const { rekeyed } = rekeyExercisePRsByEquipmentId(prs, equip, { betterPr: byE1rm });
        expect(rekeyed['Row'].x.e1rm).toBe(130); // kept the higher e1RM, not the heavier weight
    });

    it('total PR count is conserved across every scenario', () => {
        const prs = {
            'Bench': { 'Flat Bench Press': { weight: 225 }, 'Junk': { weight: 1 } },
            'Pulldown': { 'Lat Pulldown': { weight: 140 } },
            'Legs': { 'Leg Press': { weight: 400 }, 'Leg Press': { weight: 400 } },
        };
        const { rekeyed, stats } = rekeyExercisePRsByEquipmentId(prs, EQUIP);
        expect(countPRs(rekeyed)).toBe(countPRs(prs));
        expect(stats.resolved + stats.keptUnderName).toBe(stats.prCount);
    });
});
