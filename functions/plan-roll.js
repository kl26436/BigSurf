// Plan auto-roll — functions/plan-roll.js (TP-3)
//
// Server-only (not mirrored). The Sunday job calls rollPlanForUser before the
// report card: when the plan's current wave ends and nothing covers the coming
// week, it writes the next wave plan-roller.js drafted — same sessions, the
// lighter week in place — and, under rotationPolicy 'auto', applies the
// accessory rotations (the prior exercise lists are kept for undo). Under
// 'ask' the rotations ride on the program as pendingRotations and the card
// offers them. Idempotent: a retry finds the wave already rolled.

const { rollWindow, draftNextWave, rolledProgramDoc } = require('./plan-roller');
const { applyRotation } = require('./exercise-rotation');
const { reportWeek, DEFAULT_TIME_ZONE } = require('./report-card');
const { planTemplatesToArchive } = require('./plan-sessions');

const gymOf = (w) => (typeof w?.location === 'object' ? w.location?.name : w?.location) || null;

/** Everything the roller (and get_plan / draft_next_wave) read, for one user. */
async function loadPlanData(userRef, { today }) {
    const [planSnap, weekPlanSnap, progSnap, tSnap, woSnap, gSnap, eSnap, mSnap, dSnap, eqSnap, customSnap, settingsSnap] = await Promise.all([
        userRef.collection('plan').doc('current').get(),
        userRef.collection('preferences').doc('weekPlan').get(),
        userRef.collection('programs').get(),
        userRef.collection('workoutTemplates').get(),
        userRef.collection('workouts').orderBy('date', 'desc').limit(250).get(),
        userRef.collection('goals').get(),
        userRef.collection('events').get(),
        userRef.collection('measurements').orderBy('date', 'desc').limit(120).get(),
        userRef.collection('dexa').orderBy('date', 'desc').limit(10).get(),
        userRef.collection('equipment').get(),
        userRef.collection('customExercises').get(),
        userRef.collection('preferences').doc('settings').get(),
    ]);
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
    const workouts = woSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(w => w.completedAt && !w.cancelledAt);
    const byName = new Map([...require('./data/exercises.json'), ...customSnap.docs.map(d => d.data())]
        .filter(e => e?.name).map(e => [e.name.toLowerCase(), e]));
    const unit = settings.weightUnit === 'kg' ? 'kg' : 'lbs';
    return {
        plan: planSnap.exists ? (planSnap.data() || null) : null,
        weekPlan: weekPlanSnap.exists ? (weekPlanSnap.data() || null) : null,
        programs: progSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        templates: tSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        workouts,
        goals: gSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        events: eSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        measurements: mSnap.docs.map(d => d.data()),
        dexa: dSnap.docs.map(d => d.data()),
        settings, unit, today,
        plates: unit === 'kg' ? settings.plateKg : settings.plateLbs,
        rotation: {
            equipment: eqSnap.docs.map(d => d.data()).filter(e => e?.name),
            location: gymOf(workouts.find(w => gymOf(w))),
            lookup: (n) => byName.get(String(n || '').toLowerCase()),
        },
    };
}

/**
 * @returns {Promise<{status: string, programId?: string, start?: string, rotated?: number, pending?: number}>}
 */
async function rollPlanForUser(userRef, { now = new Date() } = {}) {
    const settingsSnap = await userRef.collection('preferences').doc('settings').get();
    const tz = (settingsSnap.exists && settingsSnap.data()?.timeZone) || DEFAULT_TIME_ZONE;
    const today = reportWeek(now, tz).today;
    const planSnap = await userRef.collection('plan').doc('current').get();
    if (!planSnap.exists) return { status: 'no_plan' };
    const data = await loadPlanData(userRef, { today });
    const w = rollWindow({ plan: data.plan, programs: data.programs, today });
    if (!w.due) return { status: w.reason };
    const draft = draftNextWave({ ...data, start: w.start });
    if (!draft) return { status: 'no_split' };

    const nowIso = now.toISOString();
    const priorTemplates = [];
    if (draft.applyRotations) {
        for (const r of draft.rotations) {
            const ref = userRef.collection('workoutTemplates').doc(r.templateId);
            const snap = await ref.get();
            if (!snap.exists) continue;
            const exercises = Array.isArray(snap.data().exercises) ? snap.data().exercises : [];
            priorTemplates.push({ templateId: r.templateId, exercises });
            await ref.set({ exercises: applyRotation(exercises, r.swaps, { lookup: data.rotation.lookup, today }), lastUpdated: nowIso }, { merge: true });
        }
    }
    // One active program at a time; the finished wave stays as history.
    for (const p of data.programs.filter(x => x.active === true)) {
        await userRef.collection('programs').doc(p.id).set({ active: false, state: 'finished', lastUpdated: nowIso }, { merge: true });
    }
    const id = `program_${now.getTime()}`;
    await userRef.collection('programs').doc(id).set(rolledProgramDoc(draft, { id, nowIso, priorTemplates }));
    await userRef.collection('plan').doc('current').set({ lastRolledFor: draft.startDate, lastRolledAt: nowIso }, { merge: true });
    // TP-4 — plan sessions no week uses any more stay for history, archived.
    const archived = planTemplatesToArchive({
        // From the new wave's first day: the old wave ends tonight, so it no longer counts.
        templates: data.templates, weekPlan: data.weekPlan, today: draft.startDate,
        programs: [...data.programs.map(p => (p.active === true ? { ...p, state: 'finished' } : p)), { ...draft, id }],
    });
    for (const tid of archived) {
        await userRef.collection('workoutTemplates').doc(tid).set({ archived: true, archivedAt: nowIso, archivedBy: 'plan-roll', lastUpdated: nowIso }, { merge: true });
    }
    return {
        status: 'rolled', programId: id, start: draft.startDate, archived,
        rotated: draft.applyRotations ? draft.rotations.reduce((n, r) => n + r.swaps.length, 0) : 0,
        pending: draft.applyRotations ? 0 : draft.rotations.reduce((n, r) => n + r.swaps.length, 0),
    };
}

module.exports = { loadPlanData, rollPlanForUser };
