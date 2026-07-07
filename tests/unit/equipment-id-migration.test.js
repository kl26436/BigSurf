// Phase 8b migration safety — backfill + PR re-key planners.
// Imports the REAL planners. Load-bearing properties: the backfill never writes
// an ambiguous ID, and the PR re-key never loses a PR (the scariest failure —
// a silently-vanished personal record).

import { describe, it, expect } from 'vitest';
import {
    planEquipmentIdBackfill,
    rekeyExercisePRsByEquipmentId,
    mergePrEntries,
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

    it('re-keys resolved names to ids and preserves the PR payload (+ denormalized name)', () => {
        const prs = { 'Bench Press': { 'Flat Bench Press': { weight: 225, reps: 5 } } };
        const { rekeyed } = rekeyExercisePRsByEquipmentId(prs, EQUIP);
        expect(rekeyed['Bench Press']).toEqual({ e_bench: { weight: 225, reps: 5, equipmentName: 'Flat Bench Press' } });
    });

    it('keeps unresolved names under their original key (nothing dropped)', () => {
        const prs = { 'Bench Press': {
            'Flat Bench Press': { weight: 225 },
            'Mystery Machine': { weight: 100 },
        } };
        const { rekeyed, review, stats } = rekeyExercisePRsByEquipmentId(prs, EQUIP);
        expect(rekeyed['Bench Press'].e_bench).toEqual({ weight: 225, equipmentName: 'Flat Bench Press' });
        expect(rekeyed['Bench Press']['Mystery Machine']).toEqual({ weight: 100, equipmentName: 'Mystery Machine' });
        expect(countPRs(rekeyed)).toBe(countPRs(prs)); // conservation
        expect(stats.keptUnderName).toBe(1);
        expect(review).toHaveLength(1);
    });

    it('preserves the bodyPart sibling label without counting it as a PR', () => {
        const prs = { 'Bench Press': {
            bodyPart: 'Chest',
            'Flat Bench Press': { weight: 225 },
        } };
        const { rekeyed, stats } = rekeyExercisePRsByEquipmentId(prs, EQUIP);
        expect(rekeyed['Bench Press'].bodyPart).toBe('Chest');
        expect(rekeyed['Bench Press'].e_bench).toMatchObject({ weight: 225, equipmentName: 'Flat Bench Press' });
        expect(stats.prCount).toBe(1); // bodyPart NOT counted
    });

    it('merges two names to one id FIELD-WISE — the heaviest single and the biggest volume can live on different names, and BOTH survive', () => {
        // Mirrors a real collision the dry-run caught: maxWeight on one name,
        // maxVolume on the other. A whole-entry pick would drop one PR.
        const equip = [{ id: 'e_row', name: 'Seated Row', aliases: ['Linear Row'] }];
        const prs = { 'Seated Row Machine': {
            'Seated Row':  { maxWeight: { weight: 140, reps: 12 }, maxReps: { weight: 100, reps: 15 }, maxVolume: { weight: 140, reps: 12, volume: 1680 } },
            'Linear Row':  { maxWeight: { weight: 220, reps: 6 },  maxReps: { weight: 90,  reps: 10 }, maxVolume: { weight: 200, reps: 5, volume: 1000 } },  // alias → same id
        } };
        const { rekeyed, stats } = rekeyExercisePRsByEquipmentId(prs, equip);
        expect(Object.keys(rekeyed['Seated Row Machine'])).toEqual(['e_row']);
        const merged = rekeyed['Seated Row Machine'].e_row;
        expect(merged.maxWeight.weight).toBe(220);   // heavier single survives
        expect(merged.maxVolume.volume).toBe(1680);  // bigger volume (from the OTHER name) survives
        expect(merged.maxReps.reps).toBe(15);        // most reps survives
        expect(stats.merges).toBe(1);
    });

    it('mergePrEntries keeps each per-category max independently', () => {
        const a = { maxWeight: { weight: 100 }, maxVolume: { volume: 900 } };
        const b = { maxWeight: { weight: 120 }, maxVolume: { volume: 500 } };
        const m = mergePrEntries(a, b);
        expect(m.maxWeight.weight).toBe(120);
        expect(m.maxVolume.volume).toBe(900);
    });

    it('a custom betterPr comparator is still honored on merge (injection point intact)', () => {
        const equip = [{ id: 'x', name: 'Row', aliases: ['Cable Row'] }];
        const prs = { 'Row': {
            'Row': { e1rm: 130 },
            'Cable Row': { e1rm: 125 },
        } };
        const byE1rm = (a, b) => ((b?.e1rm || 0) > (a?.e1rm || 0) ? b : a);
        const { rekeyed } = rekeyExercisePRsByEquipmentId(prs, equip, { betterPr: byE1rm });
        expect(rekeyed['Row'].x.e1rm).toBe(130);
    });

    it('total PR count is conserved across every scenario', () => {
        // (Previously this fixture had a duplicate 'Leg Press' key that JS
        // collapsed at parse time, silently testing one fewer entry.)
        const prs = {
            'Bench': { 'Flat Bench Press': { weight: 225 }, 'Junk': { weight: 1 } },
            'Pulldown': { 'Lat Pulldown': { weight: 140 } },
            'Legs': { 'Leg Press': { weight: 400 }, 'Hack Squat': { weight: 350 } },
        };
        const { rekeyed, stats } = rekeyExercisePRsByEquipmentId(prs, EQUIP);
        expect(countPRs(rekeyed)).toBe(countPRs(prs));
        expect(stats.resolved + stats.keptUnderName).toBe(stats.prCount);
    });
});
