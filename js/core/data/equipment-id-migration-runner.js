// Phase 8b runner — inspect + apply the equipmentId backfill against the LIVE
// (single, shared) Firestore, with a dry-run default and full reversibility.
//
// Console usage (signed in, on the app):
//   await runEquipmentIdBackfill()               // DRY RUN — plans everything, writes nothing
//   await runEquipmentIdBackfill({ apply: true }) // writes the additive equipmentId backfill
//   await undoEquipmentIdBackfill()               // strips every equipmentId we added
//   await snapshotPersonalRecords()               // copy the PR doc to a timestamped backup
//
// SAFETY MODEL:
//  - The apply is ADDITIVE only: it writes exercises[…].equipmentId next to the
//    existing equipment NAME (never touches or removes the name). Undo = strip
//    the field. So this step is fully reversible on its own.
//  - It does NOT re-key the PR store. Re-keying PRs is a LATER step (after
//    readers flip to id-first) and would break name-based PR reads if done now;
//    here we only PREVIEW the PR re-key plan so you can see it's lossless.
//  - snapshotPersonalRecords() exists for that later step.

import { AppState } from '../utils/app-state.js';
import { planEquipmentIdBackfill, rekeyExercisePRsByEquipmentId } from './equipment-id-migration.js';
import { planLocationIdBackfill, planOrphanGymDocs } from './location-id-migration.js';

async function loadContext() {
    const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
    const mgr = new FirebaseWorkoutManager(AppState);
    const [equipment, workouts, templates] = await Promise.all([
        mgr.getUserEquipment(),
        mgr.getUserWorkouts(),
        mgr.getUserWorkoutTemplates(),
    ]);
    const { db, doc, getDoc } = await import('./firebase-config.js');
    const prRef = doc(db, 'users', AppState.currentUser.uid, 'stats', 'personalRecords');
    const prSnap = await getDoc(prRef);
    const exercisePRs = prSnap.exists() ? (prSnap.data().exercisePRs || {}) : {};
    return { equipment, workouts, templates, exercisePRs };
}

/** Copy stats/personalRecords → stats/personalRecords__backup_<ISO> so a later
 *  PR re-key is instantly revertible. Returns the backup doc id. */
export async function snapshotPersonalRecords() {
    if (!AppState.currentUser) { console.error('Sign in first.'); return null; }
    const { db, doc, getDoc, setDoc } = await import('./firebase-config.js');
    const uid = AppState.currentUser.uid;
    const prSnap = await getDoc(doc(db, 'users', uid, 'stats', 'personalRecords'));
    const data = prSnap.exists() ? prSnap.data() : { exercisePRs: {} };
    const backupId = `personalRecords__backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await setDoc(doc(db, 'users', uid, 'stats', backupId), { ...data, backedUpAt: new Date().toISOString() });
    console.log(`✅ PR doc snapshot → stats/${backupId}`);
    return backupId;
}

export async function runEquipmentIdBackfill({ apply = false } = {}) {
    if (!AppState.currentUser) { console.error('Sign in first.'); return null; }
    const { equipment, workouts, templates, exercisePRs } = await loadContext();

    const wPlan = planEquipmentIdBackfill(workouts, equipment);
    const tPlan = planEquipmentIdBackfill(templates, equipment);
    const prPreview = rekeyExercisePRsByEquipmentId(exercisePRs, equipment);

    console.group(`%cEquipment ID backfill — ${apply ? 'APPLY' : 'DRY RUN'}`, 'font-weight:bold');
    console.log('equipment docs:', equipment.length);
    console.log('workouts:', wPlan.stats);
    if (wPlan.review.length) console.log('  workout review (not written):', wPlan.review);
    console.log('templates:', tPlan.stats);
    if (tPlan.review.length) console.log('  template review (not written):', tPlan.review);
    console.log('PR re-key PREVIEW (not applied here):', prPreview.stats);
    if (prPreview.review.length) console.log('  PR review:', prPreview.review);
    console.groupEnd();

    if (!apply) {
        console.log('%cDRY RUN — nothing written. Re-run with runEquipmentIdBackfill({ apply: true }).', 'color:#1dd3b0');
        return { wPlan, tPlan, prPreview };
    }

    const { db, doc, updateDoc } = await import('./firebase-config.js');
    const uid = AppState.currentUser.uid;

    // Workouts: exercises is a MAP → dotted field paths, batched per doc.
    const byWorkout = new Map();
    for (const w of wPlan.writes) {
        if (!byWorkout.has(w.docId)) byWorkout.set(w.docId, {});
        byWorkout.get(w.docId)[`exercises.${w.exerciseKey}.equipmentId`] = w.equipmentId;
    }
    for (const [docId, fields] of byWorkout) {
        await updateDoc(doc(db, 'users', uid, 'workouts', docId), fields);
    }

    // Templates: exercises is an ARRAY → rebuild + write the whole array.
    const tByDoc = new Map();
    for (const t of tPlan.writes) {
        if (!tByDoc.has(t.docId)) tByDoc.set(t.docId, []);
        tByDoc.get(t.docId).push(t);
    }
    for (const [docId, writes] of tByDoc) {
        const tpl = templates.find((x) => (x.id || x.day) === docId);
        if (!tpl || !Array.isArray(tpl.exercises)) continue;
        const exercises = tpl.exercises.map((ex) => ({ ...ex }));
        for (const w of writes) exercises[parseInt(w.exerciseKey, 10)].equipmentId = w.equipmentId;
        await updateDoc(doc(db, 'users', uid, 'workoutTemplates', docId), { exercises });
    }

    console.log(`%c✅ Applied: ${byWorkout.size} workouts + ${tByDoc.size} templates stamped. PR store untouched (re-key is a later step).`, 'color:#36c46b');
    console.log('Undo any time with undoEquipmentIdBackfill().');
    return { wPlan, tPlan, prPreview };
}

/** Revert the additive backfill: strip equipmentId from every workout + template
 *  exercise. The equipment NAME is untouched, so this is a clean full revert. */
export async function undoEquipmentIdBackfill() {
    if (!AppState.currentUser) { console.error('Sign in first.'); return; }
    const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
    const mgr = new FirebaseWorkoutManager(AppState);
    const [workouts, templates] = await Promise.all([mgr.getUserWorkouts(), mgr.getUserWorkoutTemplates()]);
    const { db, doc, updateDoc, deleteField } = await import('./firebase-config.js');
    const uid = AppState.currentUser.uid;

    let wCount = 0;
    for (const w of workouts) {
        const ex = w.exercises || {};
        const fields = {};
        for (const key of Object.keys(ex)) {
            if (ex[key] && ex[key].equipmentId !== undefined) fields[`exercises.${key}.equipmentId`] = deleteField();
        }
        if (Object.keys(fields).length) { await updateDoc(doc(db, 'users', uid, 'workouts', w.id), fields); wCount++; }
    }

    let tCount = 0;
    for (const t of templates) {
        if (!Array.isArray(t.exercises) || !t.exercises.some((e) => e && e.equipmentId !== undefined)) continue;
        const exercises = t.exercises.map(({ equipmentId, ...rest }) => rest); // eslint-disable-line no-unused-vars
        await updateDoc(doc(db, 'users', uid, 'workoutTemplates', t.id || t.day), { exercises });
        tCount++;
    }

    console.log(`%c✅ Reverted: cleared equipmentId on ${wCount} workouts + ${tCount} templates. Names untouched.`, 'color:#f0c24b');
}

// ===================================================================
// Phase 8b step 4 — location-id backfill (equipment.locationIds[])
// ===================================================================
//
// Console usage (signed in, on the app):
//   await runLocationIdBackfill()                // DRY RUN — plans, writes nothing
//   await runLocationIdBackfill({ apply: true }) // stamps locationIds[] on equipment
//   await undoLocationIdBackfill()               // strips locationIds[] we added
//
// ADDITIVE + reversible: it only adds equipment.locationIds[] next to the
// existing locations[] NAMES (never touches the names). Undo = strip the field.
// Orphan gym names (gyms present on equipment with no location doc) are reported,
// not created — they keep working via the name fallback until they get a doc.

export async function runLocationIdBackfill({ apply = false } = {}) {
    if (!AppState.currentUser) { console.error('Sign in first.'); return null; }
    const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
    const mgr = new FirebaseWorkoutManager(AppState);
    const [equipment, locations] = await Promise.all([mgr.getUserEquipment(), mgr.getUserLocations()]);

    const plan = planLocationIdBackfill(equipment, locations);
    const orphans = planOrphanGymDocs(equipment, locations);

    console.group(`%cLocation ID backfill — ${apply ? 'APPLY' : 'DRY RUN'}`, 'font-weight:bold');
    console.log('equipment docs:', equipment.length, '· location docs:', locations.length);
    console.log('stats:', plan.stats);
    console.log('equipment docs to stamp:', plan.writes.length);
    if (orphans.length) console.log(`orphan gym names (no doc — stay name-only until named):`, orphans);
    if (plan.review.length) console.log('ambiguous names (2+ docs share a name — not written):', plan.review);
    console.groupEnd();

    if (!apply) {
        console.log('%cDRY RUN — nothing written. Re-run with runLocationIdBackfill({ apply: true }).', 'color:#1dd3b0');
        return { plan, orphans };
    }

    const { db, doc, writeBatch } = await import('./firebase-config.js');
    const uid = AppState.currentUser.uid;
    // writeBatch caps at 500 ops; chunk to be safe.
    for (let i = 0; i < plan.writes.length; i += 400) {
        const batch = writeBatch(db);
        for (const w of plan.writes.slice(i, i + 400)) {
            batch.update(doc(db, 'users', uid, 'equipment', w.equipmentId), { locationIds: w.locationIds });
        }
        await batch.commit();
    }
    AppState._cachedEquipment = null;
    console.log(`%c✅ Applied: ${plan.writes.length} equipment docs stamped with locationIds[]. Names untouched.`, 'color:#36c46b');
    if (orphans.length) console.log(`${orphans.length} orphan gym(s) left name-only (create docs for them to fully collapse):`, orphans);
    console.log('Undo any time with undoLocationIdBackfill().');
    return { plan, orphans };
}

/** Revert: strip locationIds[] from every equipment doc. Names untouched. */
export async function undoLocationIdBackfill() {
    if (!AppState.currentUser) { console.error('Sign in first.'); return; }
    const { FirebaseWorkoutManager } = await import('./firebase-workout-manager.js');
    const mgr = new FirebaseWorkoutManager(AppState);
    const equipment = await mgr.getUserEquipment();
    const { db, doc, updateDoc, deleteField } = await import('./firebase-config.js');
    const uid = AppState.currentUser.uid;
    let n = 0;
    for (const eq of equipment) {
        if (eq.locationIds !== undefined) {
            await updateDoc(doc(db, 'users', uid, 'equipment', eq.id), { locationIds: deleteField() });
            n++;
        }
    }
    AppState._cachedEquipment = null;
    console.log(`%c✅ Reverted: cleared locationIds[] on ${n} equipment docs. Names untouched.`, 'color:#f0c24b');
}

// Debug/admin tools — expose on window so they can be run from the console.
if (typeof window !== 'undefined') {
    window.runEquipmentIdBackfill = runEquipmentIdBackfill;
    window.undoEquipmentIdBackfill = undoEquipmentIdBackfill;
    window.snapshotPersonalRecords = snapshotPersonalRecords;
    window.runLocationIdBackfill = runLocationIdBackfill;
    window.undoLocationIdBackfill = undoLocationIdBackfill;
}
