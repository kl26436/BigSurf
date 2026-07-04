// Restore a Big Surf user backup produced by backup-user-data.mjs — the
// "pull back". Overwrites each backed-up doc to its snapshot state.
//
// Dry-run by default (prints what it WOULD write); pass --apply to write.
// Note: this restores/overwrites the docs that were in the backup. Docs created
// AFTER the backup (e.g. new workouts) are left untouched — a migration
// rollback only needs to revert the docs the migration modified.
//
// Setup: same GOOGLE_APPLICATION_CREDENTIALS as backup-user-data.mjs.
// Run:
//     node scripts/restore-user-data.mjs backups/bigsurf-backup-<uid>-<ts>.json          # dry-run
//     node scripts/restore-user-data.mjs backups/bigsurf-backup-<uid>-<ts>.json --apply  # write

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

const PROJECT_ID = 'workout-tracker-b94b6';

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) {
    console.error('Usage: node scripts/restore-user-data.mjs <backup.json> [--apply]');
    process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key path first.');
    process.exit(1);
}

const backup = JSON.parse(readFileSync(file, 'utf8'));
const uid = backup?.meta?.uid;
if (!uid) { console.error('Backup file has no meta.uid — wrong file?'); process.exit(1); }

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

console.log(`Restore ${file}\n  → users/${uid} on ${PROJECT_ID}  [${apply ? 'APPLY — WILL WRITE' : 'DRY RUN'}]\n`);

let total = 0;
for (const [colName, docs] of Object.entries(backup.collections || {})) {
    console.log(`  ${colName}: ${docs.length} docs`);
    total += docs.length;
    if (apply) {
        // Chunk into batches (Firestore max 500 writes/batch).
        for (let i = 0; i < docs.length; i += 400) {
            const batch = db.batch();
            for (const { id, data } of docs.slice(i, i + 400)) {
                batch.set(db.doc(`users/${uid}/${colName}/${id}`), data);
            }
            await batch.commit();
        }
    }
}
if (backup.userDoc && apply) {
    await db.doc(`users/${uid}`).set(backup.userDoc);
}

console.log(`\n${apply ? '✅ Restored' : 'Would restore'} ${total} docs${apply ? '' : '  (re-run with --apply to write)'}.`);
process.exit(0);
