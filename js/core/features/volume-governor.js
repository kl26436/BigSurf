// Volume governor (CP-3) — the MRV landmark stops being a dashboard string.
//
// A program week's setDelta is applied per exercise, but a +2 ramp on a
// muscle already at its maximum recoverable volume this week is junk
// volume, not progress. governSetDelta clamps each exercise's extra sets to
// what the muscle can still absorb (MRV − sets already done this week −
// this session's baseline sets). Negative deltas are never clamped: a deload
// is always allowed. Pure — inputs injected.

import { Config } from '../utils/config.js';
import { getBodyPartForExercise } from './training-insights.js';

/**
 * @param {object} args
 * @param {number} args.setDelta - the week's per-exercise set change
 * @param {Array} args.exercises - today's session exercises ({machine|name, sets, bodyPart?})
 * @param {Array} [args.weeklyVolume] - analyzeWeeklyVolume() output for THIS week so far
 * @param {Array} [args.exerciseDatabase] - for body-part lookup when the row has none
 * @param {number} [args.mrv] - sets/muscle/week ceiling (Config.VOLUME_MRV)
 * @returns {{deltas:number[], clamped:Array<{index:number,name:string,bodyPart:string,weeklySets:number}>}}
 */
export function governSetDelta({ setDelta, exercises = [], weeklyVolume = [], exerciseDatabase = [], mrv = Config.VOLUME_MRV }) {
    const deltas = exercises.map(() => setDelta || 0);
    const clamped = [];
    if (!setDelta || setDelta <= 0) return { deltas, clamped };

    const done = {};
    for (const v of weeklyVolume || []) {
        if (v?.bodyPart) done[v.bodyPart] = (done[v.bodyPart] || 0) + (Number(v.weeklySets) || 0);
    }
    const partOf = (ex) => ex?.bodyPart || getBodyPartForExercise(ex?.machine || ex?.name, exerciseDatabase) || null;

    // Baseline sets this session already commits per muscle.
    const base = {};
    const parts = exercises.map(partOf);
    exercises.forEach((ex, i) => {
        const p = parts[i];
        if (!p) return;
        base[p] = (base[p] || 0) + (Number(ex.sets) || 3);
    });
    const allowance = {};
    for (const p of Object.keys(base)) allowance[p] = Math.max(0, mrv - (done[p] || 0) - base[p]);

    exercises.forEach((ex, i) => {
        const p = parts[i];
        if (!p) return; // unknown muscle: no landmark to govern against
        const give = Math.max(0, Math.min(setDelta, allowance[p]));
        deltas[i] = give;
        allowance[p] -= give;
        if (give < setDelta) clamped.push({ index: i, name: ex.machine || ex.name || '', bodyPart: p, weeklySets: done[p] || 0 });
    });
    return { deltas, clamped };
}
