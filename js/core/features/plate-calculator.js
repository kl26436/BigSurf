// Plate Calculator — core/features/plate-calculator.js
// Greedy algorithm for calculating plates per side of a barbell.

export const LBS_PLATES = [45, 35, 25, 10, 5, 2.5];
export const KG_PLATES = [20, 15, 10, 5, 2.5, 1.25];
export const LBS_BAR = 45;
export const KG_BAR = 20;

/**
 * Calculate plates needed per side given a target weight and bar weight.
 * Uses a greedy algorithm with available plate sizes.
 *
 * @param {number} targetWeight - Total weight including bar
 * @param {number} barWeight - Weight of the bar (default 45 lbs)
 * @param {number[]} availablePlates - Plate sizes available, descending order
 * @returns {{ plates: number[], remainder: number, error?: string }}
 */
export function calculatePlates(targetWeight, barWeight = LBS_BAR, availablePlates = LBS_PLATES) {
    let perSide = (targetWeight - barWeight) / 2;
    if (perSide < 0) return { plates: [], remainder: 0, error: 'Weight is less than bar' };
    if (perSide === 0) return { plates: [], remainder: 0 };

    const plates = [];
    const sorted = [...availablePlates].sort((a, b) => b - a);

    for (const plate of sorted) {
        while (perSide >= plate) {
            plates.push(plate);
            perSide -= plate;
        }
    }

    return {
        plates,
        remainder: Math.round(perSide * 100) / 100,
    };
}
