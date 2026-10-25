#!/usr/bin/env node
// One-off data fix (action plan §8.1): label a range of completed workouts as
// a deload so the rules engine excludes them from progression (AU-10 will make
// this automatic by reading notes/load; until then, labels are the only signal).
//
//   node scripts/relabel-deload-week.mjs kevin.laperriere@gmail.com 2026-10-19 2026-10-24 [--apply]
//
// Without --apply it only prints what it WOULD change. Needs the same key as
// backup-user-data.mjs ($env:GOOGLE_APPLICATION_CREDENTIALS). Workout docs live
// at users/{uid}/workouts/{id} with a `date` field; only completed, non-cancelled docs in the
// range that have no sessionLabel yet are touched. Reversible: --undo clears
// the label on docs this script set (it stamps `sessionLabelSetBy`).

import admin from 'firebase-admin';

const PROJECT_ID = 'workout-tracker-b94b6';
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const [arg, from, to] = args.filter(a => !a.startsWith('--'));
if (!arg || !from || !to) {
    console.error('usage: node scripts/relabel-deload-week.mjs <email|uid> <from YYYY-MM-DD> <to YYYY-MM-DD> [--apply] [--undo]');
    process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key path first.');
    process.exit(1);
}
const apply = flags.has('--apply');
const undo = flags.has('--undo');
const LABEL = 'Deload';

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const uid = arg.includes('@') ? (await admin.auth().getUserByEmail(arg)).uid : arg;

const snap = await db.collection('users').doc(uid).collection('workouts')
    .where('date', '>=', from).where('date', '<=', to).orderBy('date').get();

let changed = 0;
for (const doc of snap.docs) {
    const w = doc.data();
    // Exercise names live in the slot-keyed `exerciseNames` map, not on the exercise objects.
    const slots = Object.keys(w.exercises || {});
    const names = slots.map(k => w.exerciseNames?.[k] || w.exercises[k]?.name || w.exercises[k]?.machine).filter(Boolean);
    const notes = [w.workoutNotes, ...slots.map(k => w.exercises[k]?.notes)].filter(Boolean);
    const line = `${w.date} · ${w.workoutType || 'Workout'} · ${names.length} exercises${notes.length ? ` · notes: ${notes.map(n => JSON.stringify(n)).join(', ')}` : ''}`;

    if (!w.completedAt || w.cancelledAt) { console.log(`skip (not completed)  ${line}`); continue; }

    if (undo) {
        if (w.sessionLabelSetBy !== 'relabel-deload-week') { console.log(`skip (not ours)       ${line}`); continue; }
        console.log(`${apply ? 'UNDO ' : 'would undo '}        ${line}`);
        if (apply) await doc.ref.update({ sessionLabel: admin.firestore.FieldValue.delete(), sessionLabelSetBy: admin.firestore.FieldValue.delete() });
        changed++;
        continue;
    }

    if (w.sessionLabel) { console.log(`skip (has label "${w.sessionLabel}") ${line}`); continue; }
    console.log(`${apply ? 'LABEL ' : 'would label '}       ${line}`);
    if (apply) await doc.ref.update({ sessionLabel: LABEL, sessionLabelSetBy: 'relabel-deload-week' });
    changed++;
}
console.log(`\n${apply ? 'Changed' : 'Would change'} ${changed} of ${snap.size} workout(s) in ${from}…${to}.${apply ? '' : ' Re-run with --apply to write.'}`);
