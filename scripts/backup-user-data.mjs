// Offline Firestore backup for a single Big Surf user — a true "pull back".
//
// Dumps EVERY subcollection under users/{uid} (workouts, workoutTemplates,
// equipment, locations, stats/personalRecords, preferences, customExercises,
// exerciseOverrides, hiddenExercises, …) plus the user doc to a timestamped
// JSON file under ./backups/. Pair with restore-user-data.mjs to write it back.
//
// IMPORTANT: dev (bigsurf-dev) and prod share ONE Firestore (workout-tracker-b94b6),
// so this backs up the real database.
//
// Setup (one-time): download a service-account key from the Firebase console
//   (Project settings → Service accounts → Generate new private key), then:
//     export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json   # bash
//     $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"          # PowerShell
//
// Run:
//     node scripts/backup-user-data.mjs kevin.laperriere@gmail.com
//     node scripts/backup-user-data.mjs <uid>

import admin from 'firebase-admin';
import { writeFileSync, mkdirSync } from 'node:fs';

const PROJECT_ID = 'workout-tracker-b94b6';

const arg = process.argv[2];
if (!arg) {
    console.error('Usage: node scripts/backup-user-data.mjs <email-or-uid>');
    process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key path first (see header).');
    process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

const uid = arg.includes('@') ? (await admin.auth().getUserByEmail(arg)).uid : arg;
console.log(`Backing up users/${uid} on ${PROJECT_ID}…`);

const userRef = db.doc(`users/${uid}`);
const userSnap = await userRef.get();
const out = {
    meta: { projectId: PROJECT_ID, uid, exportedAt: new Date().toISOString(), schema: 1 },
    userDoc: userSnap.exists ? userSnap.data() : null,
    collections: {},
};

let totalDocs = 0;
for (const col of await userRef.listCollections()) {
    const snap = await col.get();
    out.collections[col.id] = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    totalDocs += snap.size;
    console.log(`  ${col.id}: ${snap.size} docs`);
}

mkdirSync('backups', { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const file = `backups/bigsurf-backup-${uid}-${ts}.json`;
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\n✅ Backed up ${totalDocs} docs → ${file}`);
process.exit(0);
