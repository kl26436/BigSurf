// Equipment identity migration — pure planners (no Firebase, no writes).
//
// Phase 8b turns the mutable equipment NAME string into a stable equipmentId
// foreign key. These functions PLAN that change (which IDs to write, which
// entries to route to human review) without mutating anything, so the plan can
// be tested and inspected before it ever touches real workout/PR data. The
// thin "apply" wrappers that actually write live elsewhere and consume a plan.

import { resolveEquipmentId } from './equipment-id-resolver.js';

/**
 * Plan the equipmentId backfill for workout / template docs. Nothing is
 * mutated — returns the writes to make and the entries needing review.
 *
 * @param {Array<{id:string, exercises:Object|Array}>} docs
 * @param {Array} equipment
 * @param {object} [opts] - forwarded to resolveEquipmentId
 * @returns {{writes:Array, review:Array, stats:Object}}
 */
export function planEquipmentIdBackfill(docs = [], equipment = [], opts = {}) {
    const writes = [];
    const review = [];
    let total = 0;
    let skippedNoEquipment = 0;
    let alreadyDone = 0;

    for (const doc of docs || []) {
        const exObj = doc?.exercises;
        if (!exObj) continue;
        // Support the map shape ({exercise_0:{…}}) and the array shape ([{…}]).
        const entries = Array.isArray(exObj)
            ? exObj.map((ex, i) => [String(i), ex])
            : Object.entries(exObj);

        for (const [key, ex] of entries) {
            const name = ex?.equipment;
            if (!name) { skippedNoEquipment++; continue; }   // bodyweight / unassigned
            if (ex.equipmentId) { alreadyDone++; continue; } // idempotent re-run
            total++;
            const r = resolveEquipmentId(name, equipment, opts);
            if (r.needsReview || !r.id) {
                review.push({
                    docId: doc.id, exerciseKey: key, name,
                    method: r.method, confidence: r.confidence, candidates: r.candidates || [],
                });
            } else {
                writes.push({
                    docId: doc.id, exerciseKey: key, name,
                    equipmentId: r.id, confidence: r.confidence, method: r.method,
                });
            }
        }
    }

    return {
        writes,
        review,
        stats: { total, resolved: writes.length, needsReview: review.length, skippedNoEquipment, alreadyDone },
    };
}

/**
 * Re-key a PR store from equipment-NAME keys to equipment-ID keys WITHOUT ever
 * losing a PR. Guarantees:
 *   - an unresolved / ambiguous name keeps its original name key (never dropped);
 *   - two names resolving to the SAME id are MERGED via `betterPr` (default:
 *     higher weight wins), never silently overwritten;
 *   - collisions and unresolved names are reported for review.
 *
 * @param {Object} exercisePRs - { [exerciseName]: { [equipmentName]: pr } }
 * @param {Array} equipment
 * @param {{betterPr?:Function, fuzzyThreshold?:number, ambiguityBand?:number}} [opts]
 * @returns {{rekeyed:Object, review:Array, stats:Object}}
 */
export function rekeyExercisePRsByEquipmentId(exercisePRs = {}, equipment = [], opts = {}) {
    const betterPr = opts.betterPr || ((a, b) => ((b?.weight || 0) > (a?.weight || 0) ? b : a));
    const rekeyed = {};
    const review = [];
    let prCount = 0;
    let resolved = 0;
    let keptUnderName = 0;
    let merges = 0;

    for (const [exName, byEquip] of Object.entries(exercisePRs || {})) {
        if (!byEquip || typeof byEquip !== 'object') { rekeyed[exName] = byEquip; continue; }
        const out = {};
        for (const [equipName, pr] of Object.entries(byEquip)) {
            prCount++;
            const r = resolveEquipmentId(equipName, equipment, opts);
            if (r.needsReview || !r.id) {
                out[equipName] = pr;               // preserve — nothing is ever lost
                keptUnderName++;
                review.push({ exercise: exName, equipmentName: equipName, method: r.method, candidates: r.candidates || [] });
            } else if (Object.prototype.hasOwnProperty.call(out, r.id)) {
                out[r.id] = betterPr(out[r.id], pr); // collision → keep the better PR
                merges++;
                resolved++;
            } else {
                out[r.id] = pr;
                resolved++;
            }
        }
        rekeyed[exName] = out;
    }

    return { rekeyed, review, stats: { prCount, resolved, keptUnderName, merges } };
}
