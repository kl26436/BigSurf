// Weekly review request — functions/weekly-review.js (AP-20, AU-4)
//
// Server-only (not mirrored). Everything the weekly review sends the model,
// built from the user's Firestore data with an injectable clock, so the eval
// runner can grade the review the way it grades chat turns. index.js
// (generateWeeklyReviewForUser) sends the request, saves the review and
// pushes the notification; nothing here calls the API.

const { computeUserVerdicts } = require('./coach-tools');
const { buildOutcomesContext, convertToUnit } = require('./coach-outcomes');
const { formatVerdictsContext } = require('./coach-rules');
const { describeWeekTarget, isDeloadTarget } = require('./week-targets');
const { effortTag, weekKindLabel } = require('./plain-language');
const { DIGEST_MODEL, WEEKLY_REVIEW_SYSTEM } = require('./coach-prompts');

/**
 * @param {object} userRef - Admin SDK doc ref for users/{uid}
 * @param {object} opts
 * @param {object} opts.db - Admin Firestore (computeUserVerdicts reads through it)
 * @param {boolean} [opts.force] - manual request: skip opt-out + once-a-week guard
 * @param {Date} [opts.now]
 * @returns {Promise<{status: string}|{request: object, workouts: Array}>}
 */
async function buildWeeklyReviewRequest(userRef, { db, force = false, now = new Date() } = {}) {
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const weekKey = new Date(now).toISOString().slice(0, 10);

    // Settings: opt-out (default on — a manual request is explicit consent,
    // so it skips the check) plus the profile + unit the review must speak
    // in (AP-15f: it used to print bare numbers with no unit and knew
    // nothing about injuries).
    let settings = {};
    try {
        const settingsSnap = await userRef.collection('preferences').doc('settings').get();
        settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
    } catch (settingsErr) {
        if (!force) throw settingsErr;
        console.log(`weeklyCoachReview settings read skipped for ${userRef.id}:`, settingsErr.message);
    }
    if (!force && settings.weeklyCoachReview === false) return { status: 'opted_out' };
    // TP-2 — Sunday report card users get the card instead of the Monday review.
    if (!force && settings.reportCard === true) return { status: 'report_card_user' };
    const unit = settings.weightUnit === 'kg' ? 'kg' : 'lbs';
    const profileParts = [];
    if (settings.coachGoal) profileParts.push(`goal: ${settings.coachGoal}`);
    if (settings.profileExperience) profileParts.push(`experience: ${settings.profileExperience}`);
    if (settings.coachInjuries) profileParts.push(`injuries / limitations: ${settings.coachInjuries}`);
    if (settings.coachNotes) profileParts.push(`notes: ${settings.coachNotes}`);
    const profileLine = `User profile: ${profileParts.length ? profileParts.join(' · ') : 'none given'} · unit: ${unit}\n\n`;

    // Active this week?
    const workoutsSnap = await userRef.collection('workouts')
        .where('date', '>=', weekAgo).orderBy('date', 'desc').limit(15).get();
    const workouts = workoutsSnap.docs.map(d => d.data())
        .filter(w => w.completedAt && !w.cancelledAt);
    if (workouts.length === 0) return { status: 'no_workouts' };

    // Once per week, retry-safe. Manual requests rate-limit separately
    // (per-day, in the callable) so they never consume the Monday slot.
    if (!force) {
        const limitRef = userRef.collection('preferences').doc('aiRateLimits');
        const limitSnap = await limitRef.get();
        if (limitSnap.exists && limitSnap.data().weeklyReview?.weekKey === weekKey) return { status: 'already_reviewed' };
        await limitRef.set({ weeklyReview: { weekKey } }, { merge: true });
    }

    // Week plan (5.5) — anchor the review to planned-vs-done, with an
    // explicit adherence line (minimal adherence awareness: the review
    // is the checkpoint that notices a broken week, not the user).
    let planLine = '';
    let adherenceLine = '';
    try {
        const planSnap = await userRef.collection('preferences').doc('weekPlan').get();
        if (planSnap.exists) {
            const { days = {}, restDays = [] } = planSnap.data();
            const tSnap = await userRef.collection('workoutTemplates').get();
            const names = new Map(tSnap.docs.map(d => [d.id, d.data().name || d.id]));
            const parts = Object.entries(days)
                .filter(([, tid]) => tid)
                .map(([d, tid]) => `${d} ${names.get(tid) || tid}`);
            if (restDays.length) parts.push(`rest ${restDays.join('/')}`);
            if (parts.length) planLine = `Week plan: ${parts.join(' · ')}\n\n`;
            // days values are templateId | 'rest' | null — only real
            // workouts count as planned training days.
            const plannedCount = Object.values(days).filter(tid => tid && tid !== 'rest').length;
            if (plannedCount > 0) {
                const trainedDays = new Set(workouts.map(w => w.date)).size;
                adherenceLine = `Adherence: trained ${trainedDays} of ${plannedCount} planned days this week.\n\n`;
            }
        }
    } catch (planErr) {
        console.log(`weeklyCoachReview plan read skipped for ${userRef.id}:`, planErr.message);
    }

    // Active program (Phase 9) — the review must know the block it's
    // reviewing. Week derived from startDate, never stored.
    let programLine = '';
    try {
        const progSnap = await userRef.collection('programs')
            .where('active', '==', true).limit(1).get();
        if (!progSnap.empty) {
            const prog = progSnap.docs[0].data();
            const week = Math.floor(Math.round((new Date(now) - new Date(`${prog.startDate}T12:00:00`)) / 86400000) / 7) + 1;
            if (week > (prog.weeks || 1)) {
                programLine = `Program: "${prog.name}" (${prog.weeks} weeks, ${prog.goal}) FINISHED — acknowledge those weeks are done and invite planning the next few.\n\n`;
            } else if (week >= 1) {
                const target = (prog.weekTargets || []).find(t => t.week === week);
                const next = (prog.weekTargets || []).find(t => t.week === week + 1);
                const desc = target ? describeWeekTarget(target) : '';
                programLine = `Program: "${prog.name}" (${prog.goal}) — week ${week} of ${prog.weeks}`
                    + (target ? ` — this week: ${weekKindLabel(target)}${desc ? ` (${desc})` : ''}` : '')
                    + (next ? `; next week: ${weekKindLabel(next)}` : '')
                    + '.\n'
                    + (target && isDeloadTarget(target) ? 'DELOAD WEEK: lighter numbers this week are the plan, not a regression; do not push weight.\n' : '')
                    + '\n';
            }
        }
    } catch (progErr) {
        console.log(`weeklyCoachReview program read skipped for ${userRef.id}:`, progErr.message);
    }

    // Past advice outcomes (Phase 7) — the one proactive push should
    // know whether earlier calls worked. Outcome windows need up to
    // ~10 weeks of history; only read it when there's advice to score.
    let outcomesBlock = '';
    try {
        const advSnap = await userRef.collection('coachAdvice')
            .orderBy('date', 'desc').limit(15).get();
        const advice = advSnap.docs.map(d => d.data());
        if (advice.length) {
            const historyStart = new Date(now.getTime() - 70 * 86400000).toISOString().slice(0, 10);
            const histSnap = await userRef.collection('workouts')
                .where('date', '>=', historyStart).orderBy('date', 'desc').limit(120).get();
            const history = histSnap.docs.map(d => d.data()).filter(w => w.completedAt && !w.cancelledAt);
            const scored = buildOutcomesContext(advice, history, weekKey, { limit: 5, unit });
            if (scored) outcomesBlock = `${scored}\n`;
        }
    } catch (outErr) {
        console.log(`weeklyCoachReview outcomes skipped for ${userRef.id}:`, outErr.message);
    }

    // Staleness check (owner ask): the same day run identically for weeks is
    // the top "coach feels dumb" complaint. Detect it server-side and hand
    // the model the facts plus never-used equipment for ONE concrete swap.
    let stalenessBlock = '';
    try {
        const histStart = new Date(now.getTime() - 56 * 86400000).toISOString().slice(0, 10);
        const staleSnap = await userRef.collection('workouts')
            .where('date', '>=', histStart).orderBy('date', 'desc').limit(60).get();
        const hist = staleSnap.docs.map(d => d.data()).filter(w => w.completedAt && !w.cancelledAt);
        const byType = new Map();
        for (const w of hist) {
            if (!w.workoutType) continue;
            const names = Object.values(w.exerciseNames || {}).map(n => String(n).toLowerCase());
            if (!names.length) continue;
            if (!byType.has(w.workoutType)) byType.set(w.workoutType, []);
            byType.get(w.workoutType).push(new Set(names));
        }
        const staleLines = [];
        for (const [type, sessions] of byType) {
            if (sessions.length < 4) continue;
            const first = sessions[0];
            const identical = sessions.every(s => s.size === first.size && [...s].every(n => first.has(n)));
            if (identical) staleLines.push(`"${type}" has run the identical ${first.size} exercises for its last ${sessions.length} sessions`);
        }
        if (staleLines.length) {
            let unusedLine = '';
            try {
                const eqSnap = await userRef.collection('equipment').limit(300).get();
                const unused = eqSnap.docs.map(d => d.data())
                    .filter(e => !e.lastUsed).map(e => e.name).filter(Boolean).slice(0, 12);
                if (unused.length) unusedLine = ` Never-used equipment available: ${unused.join(', ')}.`;
            } catch (eqErr) {
                console.log(`weeklyCoachReview equipment read skipped for ${userRef.id}:`, eqErr.message);
            }
            stalenessBlock = `Staleness: ${staleLines.join('; ')}.${unusedLine}\n\n`;
        }
    } catch (staleErr) {
        console.log(`weeklyCoachReview staleness skipped for ${userRef.id}:`, staleErr.message);
    }

    // Rules verdicts + progress scoreboard (AP-16 / AP-21) — the SAME object
    // the dashboard card and the chat coach read, so the review quotes the
    // numbers the user sees instead of re-deriving trends from one week.
    let verdictsBlock = '';
    try {
        const verdicts = await computeUserVerdicts({ db, userId: userRef.id, today: weekKey, unit });
        const text = formatVerdictsContext(verdicts);
        if (text) verdictsBlock = `${text}\n`;
    } catch (vErr) {
        console.log(`weeklyCoachReview verdicts skipped for ${userRef.id}:`, vErr.message);
    }

    // Compact summary — dates, types, top sets, readiness, notes.
    const lines = [];
    for (const w of workouts) {
        const names = w.exerciseNames || {};
        const ready = w.readiness?.score ? ` · felt ${w.readiness.score}/5` : '';
        const label = w.sessionLabel ? ` · ${w.sessionLabel}` : '';
        lines.push(`${w.date} — ${w.workoutType || 'Workout'}${label}${ready}`);
        for (const [key, ex] of Object.entries(w.exercises || {})) {
            const name = names[key];
            if (!name || !ex.sets?.length) continue;
            const sets = ex.sets
                .filter(s => s.type !== 'warmup' && (s.reps || s.weight))
                .map(s => `${s.reps || '?'}×${s.weight ? convertToUnit(s.weight, s.originalUnit === 'kg' ? 'kg' : 'lbs', unit) : 'BW'}${s.rpe ? ` (${effortTag(s.rpe)})` : ''}`).join(', ');
            if (sets) lines.push(`  ${name}${ex.equipment ? ` [${ex.equipment}]` : ''}: ${sets} ${unit}${ex.notes ? ` — "${ex.notes}"` : ''}`);
        }
    }

    return {
        workouts,
        request: {
            model: DIGEST_MODEL,
            max_tokens: 1500,
            system: WEEKLY_REVIEW_SYSTEM,
            messages: [{ role: 'user', content: `${profileLine}${programLine}${verdictsBlock}${adherenceLine}${planLine}${stalenessBlock}${outcomesBlock}This week's training log (weights in ${unit}):\n\n${lines.join('\n')}` }],
        },
    };
}

module.exports = { buildWeeklyReviewRequest };
