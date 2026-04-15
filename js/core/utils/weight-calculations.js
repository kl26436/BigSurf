// Weight Calculation Helpers — core/utils/weight-calculations.js
// Unified total-weight and volume calculations that account for:
//   1. Equipment base weight (bar / carriage / cable starting weight)
//   2. Bodyweight exercises (BW + added weight)
//
// All other modules (PR tracker, exercise-progress, stats, CSV export)
// should use these helpers instead of raw `set.weight`.

import { convertWeight } from '../ui/ui-helpers.js';

/**
 * Bodyweight staleness threshold (days).
 * If the user's most recent body-weight entry is older than this,
 * the app prompts for an update before logging bodyweight exercises.
 */
export const BW_STALENESS_DAYS = 14;

/**
 * Get the total weight per rep for a single set, including equipment
 * base weight or bodyweight as appropriate.
 *
 * - **Bodyweight set** (`set.isBodyweight === true`):
 *   Total = bodyWeight + addedWeight
 *
 * - **Plated / machine set** (default):
 *   Total = set.weight + equipment.baseWeight (converted to set's unit)
 *
 * The set's `weight` field is always the user-entered plate/stack weight.
 * Base weight is added at read time so editing equipment later doesn't
 * require rewriting every historical set.
 *
 * @param {Object} set - A set object from savedData.exercises[key].sets[]
 * @param {Object|null} equipment - Equipment doc (needs baseWeight, baseWeightUnit)
 * @returns {number} Total weight per rep (in the set's originalUnit, or lbs)
 */
export function getSetTotalWeight(set, equipment = null) {
    if (!set) return 0;

    // Bodyweight exercise
    if (set.isBodyweight) {
        return (Number(set.bodyWeight) || 0) + (Number(set.addedWeight) || 0);
    }

    // Standard plated/machine exercise
    const plateWeight = Number(set.weight) || 0;
    if (!equipment || !equipment.baseWeight) return plateWeight;

    const baseUnit = equipment.baseWeightUnit || 'lbs';
    const setUnit = set.originalUnit || 'lbs';
    const baseInSetUnit = convertWeight(equipment.baseWeight, baseUnit, setUnit);

    return plateWeight + baseInSetUnit;
}

/**
 * Get volume for a single set (total weight × reps).
 *
 * @param {Object} set
 * @param {Object|null} equipment
 * @returns {number}
 */
export function getSetVolume(set, equipment = null) {
    return getSetTotalWeight(set, equipment) * (Number(set.reps) || 0);
}

/**
 * Check freshness of a body-weight entry.
 *
 * @param {Object|null} entry - Latest body measurement { date, weight, unit }
 * @returns {{ weight: number, unit: string, ageInDays: number }|null}
 */
export function checkBodyWeightFreshness(entry) {
    if (!entry || entry.weight == null) return null;

    const ageMs = Date.now() - new Date(entry.date + 'T00:00:00').getTime();
    return {
        weight: entry.weight,
        unit: entry.unit || 'lbs',
        ageInDays: Math.max(0, Math.floor(ageMs / 86400000)),
    };
}
