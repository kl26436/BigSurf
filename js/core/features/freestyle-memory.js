// Freestyle memory — pure helpers, no Firebase/DOM.
//
// The freestyler persona never uses templates: he shows up knowing "leg day,"
// adds exercises as machines free up, and repeats the pattern by feel. These
// helpers surface HIS OWN freestyle history back at him — "last Legs: leg
// press, hack squat…" in the quick-start sheet and a "Recent" section in the
// add-exercise sheet — so workout #10 feels smarter than workout #1 without
// ever pushing him toward template-world.

/**
 * Is this saved workout doc a freestyle session? Prefers the explicit flag
 * (stamped by startFreestyleWorkout since Phase 7); falls back to the
 * template-less "Freestyle…" label for older docs.
 */
export function isFreestyleWorkout(w) {
    if (!w) return false;
    if (w.isFreestyle) return true;
    return w.templateId == null && /^Freestyle\b/.test(w.workoutType || '');
}

/** "Freestyle — Legs" → "Legs"; "Freestyle" → null. */
export function freestyleFocusOf(w) {
    const m = /^Freestyle — (.+)$/.exec(w?.workoutType || '');
    return m ? m[1] : null;
}

// Completed, not cancelled, actually contains exercises.
function isUsableSession(w) {
    return isFreestyleWorkout(w)
        && !!w.completedAt
        && !w.cancelledAt
        && Array.isArray(w.originalWorkout?.exercises)
        && w.originalWorkout.exercises.length > 0;
}

// Most-recent-first by workout date (YYYY-MM-DD strings sort lexically),
// startedAt as the same-day tiebreaker.
function byRecency(a, b) {
    const d = (b.date || '').localeCompare(a.date || '');
    return d !== 0 ? d : (b.startedAt || '').localeCompare(a.startedAt || '');
}

/**
 * The most recent completed freestyle session, optionally restricted to a
 * focus ("Legs" matches only "Freestyle — Legs"; null matches ANY freestyle).
 * Returns { date, workoutType, focus, exercises } or null. `exercises` is the
 * template-shaped originalWorkout array — directly seedable into
 * startFreestyleWorkout(focus, exercises).
 */
export function getLastFreestyleSession(workouts = [], focus = null) {
    const candidates = (workouts || [])
        .filter(isUsableSession)
        .filter((w) => (focus == null ? true : freestyleFocusOf(w) === focus))
        .sort(byRecency);
    const w = candidates[0];
    if (!w) return null;
    return {
        date: w.date || null,
        workoutType: w.workoutType || 'Freestyle',
        focus: freestyleFocusOf(w),
        exercises: w.originalWorkout.exercises,
    };
}

/**
 * Distinct exercises the user has freestyled recently, most-recent-first —
 * the "Recent" section of the add-exercise sheet. Each entry carries enough
 * to filter by body-part bucket and to show a meta label:
 *   { name, bodyPart, equipment, equipmentId, lastDate, timesUsed }
 * Deduped case-insensitively by name (most recent occurrence wins its
 * equipment/bodyPart). Not focus-restricted — the sheet's body-part filter
 * does the narrowing, which also serves sessions where the chip was skipped.
 */
export function getRecentFreestyleExercises(workouts = [], { limit = 12 } = {}) {
    const sessions = (workouts || []).filter(isUsableSession).sort(byRecency);
    const byName = new Map(); // normalized name → entry
    for (const w of sessions) {
        for (const ex of w.originalWorkout.exercises) {
            const name = ex.machine || ex.name;
            if (!name) continue;
            const key = name.toLowerCase();
            const existing = byName.get(key);
            if (existing) {
                existing.timesUsed += 1;
            } else {
                byName.set(key, {
                    name,
                    bodyPart: ex.bodyPart || null,
                    equipment: ex.equipment || null,
                    equipmentId: ex.equipmentId || null,
                    lastDate: w.date || null,
                    timesUsed: 1,
                });
            }
        }
    }
    return [...byName.values()].slice(0, limit);
}

/**
 * Body-part bucket for one exercise — the same seven-bucket taxonomy the
 * add-exercise sheet filters on (mirrors awExerciseBucket in
 * active-workout-ui.js; keep the keyword lists in sync).
 */
export function bodyPartBucket(ex) {
    const bp = (ex?.bodyPart || ex?.category || '').toLowerCase();
    if (bp.includes('chest') || bp.includes('pec')) return 'Chest';
    if (bp.includes('back') || bp.includes('lat') || bp.includes('trap')) return 'Back';
    if (bp.includes('leg') || bp.includes('glute') || bp.includes('quad') ||
        bp.includes('hamstring') || bp.includes('calf') || bp.includes('calve')) return 'Legs';
    if (bp.includes('shoulder') || bp.includes('delt')) return 'Shoulders';
    if (bp.includes('arm') || bp.includes('bicep') || bp.includes('tricep') ||
        bp.includes('forearm')) return 'Arms';
    if (bp.includes('core') || bp.startsWith('ab') || bp.includes('oblique')) return 'Core';
    if (bp.includes('cardio')) return 'Cardio';
    return 'Other';
}

/**
 * What was this freestyle session ABOUT, for like-for-like comparison?
 *   1. The declared focus when the chip was tapped ("Freestyle — Legs" → "Legs").
 *   2. Else the DERIVED dominant body-part bucket — strict majority (>50%) of
 *      the session's bucketable exercises. This is what lets a leg day where
 *      he skipped the chip still compare against last week's labeled one.
 *   3. Else null — a mixed session with no majority isn't comparable to
 *      anything in particular, and a volume % against an unlike session is
 *      noise, not signal.
 */
export function freestyleComparisonKey(w) {
    const declared = freestyleFocusOf(w);
    if (declared) return declared;
    const exercises = w?.originalWorkout?.exercises;
    if (!Array.isArray(exercises) || exercises.length === 0) return null;
    const counts = new Map();
    let bucketable = 0;
    for (const ex of exercises) {
        const b = bodyPartBucket(ex);
        if (b === 'Other') continue;
        bucketable += 1;
        counts.set(b, (counts.get(b) || 0) + 1);
    }
    if (bucketable === 0) return null;
    let best = null;
    for (const [bucket, n] of counts) {
        if (!best || n > best.n) best = { bucket, n };
    }
    return best && best.n * 2 > bucketable ? best.bucket : null;
}

/**
 * The most recent OTHER freestyle session comparable to `current` — same
 * declared-or-derived key. Used by the completion "+X% volume vs. last…"
 * line, which previously matched the exact workoutType string and silently
 * lost the comparison whenever the focus chip was skipped one of the weeks.
 * Returns { workout, key } or null.
 */
export function findPriorComparableFreestyle(workouts = [], current) {
    const key = freestyleComparisonKey(current);
    if (!key) return null;
    const prior = (workouts || [])
        .filter((w) => w !== current
            && (w.id == null || current?.workoutId == null || w.id !== current.workoutId)
            && isFreestyleWorkout(w)
            && !!w.completedAt && !w.cancelledAt
            && freestyleComparisonKey(w) === key)
        .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))[0];
    return prior ? { workout: prior, key } : null;
}

/**
 * Short relative label for a workout date string: "today", "yesterday",
 * "5d ago", "3w ago", "2mo ago". `now` injectable for tests.
 */
export function relativeDaysLabel(dateStr, now = new Date()) {
    if (!dateStr) return '';
    const then = new Date(`${dateStr}T12:00:00`);
    if (isNaN(then.getTime())) return '';
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const today = new Date(`${todayStr}T12:00:00`);
    const days = Math.round((today - then) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days}d ago`;
    if (days < 60) return `${Math.round(days / 7)}w ago`;
    return `${Math.round(days / 30)}mo ago`;
}
