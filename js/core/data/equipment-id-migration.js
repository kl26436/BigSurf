// Equipment identity migration — pure planners (no Firebase, no writes).
//
// Phase 8b turns the mutable equipment NAME string into a stable equipmentId
// foreign key. These functions PLAN that change (which IDs to write, which
// entries to route to human review) without mutating anything, so the plan can
// be tested and inspected before it ever touches real workout/PR data. The
// thin "apply" wrappers that actually write live elsewhere and consume a plan.

import { resolveEquipmentId } from './equipment-id-resolver.js';

/**
 * Field-wise merge of two PR entries when two equipment names resolve to the
 * same id. Keeps the best `maxWeight` (by weight), `maxReps` (by reps), and
 * `maxVolume` (by volume) INDEPENDENTLY — because for one physical machine
 * logged under two names, the heaviest single and the biggest volume can live on
 * different names, so a whole-entry pick would silently drop one PR. Mirrors
 * recordPR's per-category max semantics. Non-max fields take `b` then `a`.
 */
export function mergePrEntries(a, b) {
    if (!a || typeof a !== 'object') return b;
    if (!b || typeof b !== 'object') return a;
    const higher = (x, y, field) => {
        if (!x) return y;
        if (!y) return x;
        return (Number(y[field]) || 0) > (Number(x[field]) || 0) ? y : x;
    };
    const merged = { ...a, ...b };
    if (a.maxWeight || b.maxWeight) merged.maxWeight = higher(a.maxWeight, b.maxWeight, 'weight');
    if (a.maxReps || b.maxReps)     merged.maxReps   = higher(a.maxReps, b.maxReps, 'reps');
    if (a.maxVolume || b.maxVolume) merged.maxVolume = higher(a.maxVolume, b.maxVolume, 'volume');
    return merged;
}

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
    // Default merge is the FIELD-WISE PR merge (never drops a per-category max).
    // Callers doing the live re-key should also pass opts.fuzzyThreshold high
    // (e.g. 2) so ONLY exact/alias names merge — fuzzy could combine two
    // genuinely-different machines' PRs.
    const betterPr = opts.betterPr || mergePrEntries;
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
            // `bodyPart` is a sibling label on the exercise, not an equipment
            // entry — preserve it untouched and don't count it as a PR.
            if (equipName === 'bodyPart') { out[equipName] = pr; continue; }
            prCount++;
            // Denormalize the human name onto the entry so the id-keyed store
            // still renders a label (getAllPRs/getRecentPRs read equipmentName).
            const stamped = (pr && typeof pr === 'object') ? { ...pr, equipmentName: equipName } : pr;
            const r = resolveEquipmentId(equipName, equipment, opts);
            if (r.needsReview || !r.id) {
                out[equipName] = stamped;          // preserve — nothing is ever lost
                keptUnderName++;
                review.push({ exercise: exName, equipmentName: equipName, method: r.method, candidates: r.candidates || [] });
            } else if (Object.prototype.hasOwnProperty.call(out, r.id)) {
                out[r.id] = betterPr(out[r.id], stamped); // collision → keep the better PR
                merges++;
                resolved++;
            } else {
                out[r.id] = stamped;
                resolved++;
            }
        }
        rekeyed[exName] = out;
    }

    return { rekeyed, review, stats: { prCount, resolved, keptUnderName, merges } };
}
