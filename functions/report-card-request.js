// Sunday report card request — functions/report-card-request.js (TP-2)
//
// Server-only (not mirrored). Loads what report-card.js needs from the
// user's Firestore data with an injectable clock, builds the card (code),
// and the one cheap model request over it (two sentences + one choice).
// index.js (generateReportCardForUser) sends it, saves reportCards/{weekKey}
// and pushes; the eval runner builds the same request from fixtures.

const { buildReportCard, reportWeek, cardForModel, parseReportCardReply, DEFAULT_TIME_ZONE } = require('./report-card');
const { DIGEST_MODEL, REPORT_CARD_SYSTEM } = require('./coach-prompts');

const gymOf = (w) => (typeof w?.location === 'object' ? w.location?.name : w?.location) || null;

/**
 * @param {object} userRef - Admin SDK doc ref for users/{uid}
 * @param {object} opts
 * @param {boolean} [opts.force] - manual request: skip the flag, opt-out and once-a-week guards
 * @param {Date} [opts.now]
 * @returns {Promise<{status: string}|{card: object, week: object, request: object}>}
 */
async function buildReportCardRequest(userRef, { force = false, now = new Date() } = {}) {
    const settingsSnap = await userRef.collection('preferences').doc('settings').get();
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
    // Rollout flag: the Sunday card replaces the Monday review only for users
    // who have it (the client page ships to prod hosting after dev).
    if (!force && settings.reportCard !== true) return { status: 'not_enabled' };
    if (!force && settings.weeklyCoachReview === false) return { status: 'opted_out' };
    const unit = settings.weightUnit === 'kg' ? 'kg' : 'lbs';
    const week = reportWeek(now, settings.timeZone || DEFAULT_TIME_ZONE);

    if (!force) {
        const existing = await userRef.collection('reportCards').doc(week.weekKey).get();
        if (existing.exists) return { status: 'already_built' };
    }

    const [woSnap, tSnap, planSnap, progSnap, mSnap, dSnap, gSnap, eSnap, eqSnap, customSnap] = await Promise.all([
        userRef.collection('workouts').orderBy('date', 'desc').limit(250).get(),
        userRef.collection('workoutTemplates').get(),
        userRef.collection('preferences').doc('weekPlan').get(),
        userRef.collection('programs').where('active', '==', true).limit(1).get(),
        userRef.collection('measurements').orderBy('date', 'desc').limit(120).get(),
        userRef.collection('dexa').orderBy('date', 'desc').limit(10).get(),
        userRef.collection('goals').get(),
        userRef.collection('events').get(),
        userRef.collection('equipment').get(),
        userRef.collection('customExercises').get(),
    ]);
    const workouts = woSnap.docs.map(d => d.data()).filter(w => w.completedAt && !w.cancelledAt);
    const inWeek = workouts.filter(w => w.date >= week.from && w.date <= week.to);
    if (!force && inWeek.length === 0) return { status: 'no_workouts' };

    const byName = new Map([...require('./data/exercises.json'), ...customSnap.docs.map(d => d.data())]
        .filter(e => e?.name).map(e => [e.name.toLowerCase(), e]));
    const card = buildReportCard({
        workouts,
        templates: tSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        weekPlan: planSnap.exists ? (planSnap.data() || null) : null,
        program: progSnap.empty ? null : progSnap.docs[0].data(),
        measurements: mSnap.docs.map(d => d.data()),
        dexa: dSnap.docs.map(d => d.data()),
        goals: gSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        events: eSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        settings, unit, week, today: week.today,
        rotation: {
            equipment: eqSnap.docs.map(d => d.data()).filter(e => e?.name),
            location: gymOf(workouts.find(w => gymOf(w))),
            lookup: (n) => byName.get(String(n || '').toLowerCase()),
        },
        builtAt: now.toISOString(),
    });
    return {
        card, week,
        request: {
            model: DIGEST_MODEL,
            max_tokens: 400,
            system: REPORT_CARD_SYSTEM,
            messages: [{ role: 'user', content: JSON.stringify(cardForModel(card)) }],
        },
    };
}

/** The reportCards/{weekKey} doc from the card and the model's reply text. */
function reportCardDoc(card, replyText, { model = null, usage = null } = {}) {
    const reply = parseReportCardReply(replyText, card);
    return {
        weekKey: card.weekKey, card, builtAt: card.builtAt,
        narrative: reply.narrative,
        chosenOption: { ...reply.chosen, why: reply.why },
        fallback: reply.fallback,
        model, tokens: usage ? { input: usage.input_tokens || 0, output: usage.output_tokens || 0 } : null,
        createdAt: new Date().toISOString(),
        applied: null,
    };
}

module.exports = { buildReportCardRequest, reportCardDoc };
