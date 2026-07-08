// Coach outcomes (Phase 7.2) — did the advice work? Server-side copy.
//
// MIRRORS: js/core/features/coach-outcomes.js (computeAdviceOutcome +
// buildOutcomesContext). The client file is an ES module and functions/
// deploys standalone, so the pure logic is duplicated here — keep the two
// in sync when touching either. No Firebase, no DOM.

const DAY_MS = 86400000;

function toDate(s) {
    return new Date(`${s}T12:00:00`);
}

function daysBetween(a, b) {
    return Math.round((toDate(b) - toDate(a)) / DAY_MS);
}

/** Max completed working-set weight for an exercise in a date window. */
function maxWeightIn(workouts, exercise, from, to) {
    const target = exercise.toLowerCase();
    let max = 0;
    for (const w of workouts) {
        if (!w.date || w.date < from || w.date > to || !w.completedAt) continue;
        const names = w.exerciseNames || {};
        for (const [key, ex] of Object.entries(w.exercises || {})) {
            const name = (names[key] || ex.name || '').toLowerCase();
            if (name !== target) continue;
            for (const s of (ex.sets || [])) {
                if (s.weight && s.type !== 'warmup' && s.completed !== false) {
                    max = Math.max(max, s.weight);
                }
            }
        }
    }
    return max;
}

/** Total completed sets across all exercises in a date window. */
function totalSetsIn(workouts, from, to) {
    let sets = 0;
    for (const w of workouts) {
        if (!w.date || w.date < from || w.date > to || !w.completedAt) continue;
        for (const ex of Object.values(w.exercises || {})) {
            sets += (ex.sets || []).filter(s => s.completed !== false && (s.reps || s.weight)).length;
        }
    }
    return sets;
}

/** Was the exercise done at all in a date window? */
function exerciseDoneIn(workouts, exercise, from, to) {
    const target = exercise.toLowerCase();
    return workouts.some(w => {
        if (!w.date || w.date < from || w.date > to || !w.completedAt) return false;
        const names = w.exerciseNames || {};
        return Object.entries(w.exercises || {}).some(([key, ex]) =>
            (names[key] || ex.name || '').toLowerCase() === target && (ex.sets || []).length > 0);
    });
}

function shiftDate(dateStr, days) {
    const d = toDate(dateStr);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Compute one advice doc's outcome line, or null when it's not yet checkable
 * (too fresh, too old to matter, or a type with nothing to measure).
 */
function computeAdviceOutcome(advice, workouts, today) {
    if (!advice?.date || !advice.type) return null;
    const age = daysBetween(advice.date, today);
    // Under 2 weeks: not enough follow-up data. Over ~10 weeks: stale.
    if (age < 14 || age > 70) return null;

    const before4w = shiftDate(advice.date, -28);
    const after4wEnd = shiftDate(advice.date, 28);
    const when = advice.date;

    switch (advice.type) {
        case 'weight_target': {
            if (!advice.exercise || !advice.targetValue) return null;
            const bestAfter = maxWeightIn(workouts, advice.exercise, when, today);
            const bestBefore = maxWeightIn(workouts, advice.exercise, before4w, when);
            if (!bestAfter && !bestBefore) return null;
            const hit = bestAfter >= advice.targetValue;
            return `${when} — suggested ${advice.exercise} target ${advice.targetValue}; ${hit ? `hit (best since: ${bestAfter})` : `not hit yet (best since: ${bestAfter || 'none'})`}; was ${bestBefore || 'n/a'} in the 4 weeks before.`;
        }
        case 'deload': {
            const weekBefore = totalSetsIn(workouts, shiftDate(when, -7), when);
            const weekAfter = totalSetsIn(workouts, when, shiftDate(when, 7));
            if (!weekBefore) return null;
            const pct = Math.round(((weekAfter - weekBefore) / weekBefore) * 100);
            let liftLine = '';
            if (advice.exercise) {
                const before = maxWeightIn(workouts, advice.exercise, before4w, when);
                const after = maxWeightIn(workouts, advice.exercise, when, after4wEnd);
                if (before && after) liftLine = `; ${advice.exercise} ${before}→${after} in the 4 weeks after`;
            }
            return `${when} — suggested deload${advice.exercise ? ` for ${advice.exercise}` : ''}; volume ${pct >= 0 ? '+' : ''}${pct}% that week${liftLine}.`;
        }
        case 'exercise_swap': {
            const swapTo = advice.targetValue || advice.detail;
            if (!swapTo || typeof swapTo !== 'string') return null;
            const stillDoing = exerciseDoneIn(workouts, swapTo, shiftDate(today, -14), today);
            const everDid = exerciseDoneIn(workouts, swapTo, when, today);
            if (!everDid) return `${when} — suggested swapping to ${swapTo}; never tried it.`;
            return `${when} — suggested swapping to ${swapTo}; ${stillDoing ? 'still doing it' : 'tried it but dropped it'}.`;
        }
        case 'volume_change': {
            const weekBefore = totalSetsIn(workouts, shiftDate(when, -7), when);
            const weekAfter = totalSetsIn(workouts, when, shiftDate(when, 7));
            if (!weekBefore || !weekAfter) return null;
            const pct = Math.round(((weekAfter - weekBefore) / weekBefore) * 100);
            return `${when} — suggested volume change (${advice.detail || 'unspecified'}); weekly sets ${pct >= 0 ? '+' : ''}${pct}% the following week.`;
        }
        default:
            // 'technique' and unknown types aren't numerically checkable.
            return null;
    }
}

/**
 * The `Your past recommendations and what happened:` context block.
 * @returns {string} '' when nothing checkable yet.
 */
function buildOutcomesContext(adviceDocs = [], workouts = [], today, { limit = 10 } = {}) {
    const lines = (adviceDocs || [])
        .slice()
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map(a => computeAdviceOutcome(a, workouts, today))
        .filter(Boolean)
        .slice(0, limit);
    if (!lines.length) return '';
    return `Your past recommendations and what happened (correlation, not causation):\n${lines.join('\n')}\n`;
}

module.exports = { computeAdviceOutcome, buildOutcomesContext };
