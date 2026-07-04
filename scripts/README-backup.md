# User data backup / restore (the "pull back")

`dev` (bigsurf-dev) and `prod` (workout-tracker-b94b6) share **one** Firestore, so
these operate on the real database. Use before any data migration.

## One-time setup
1. Firebase console → Project settings → **Service accounts** → **Generate new private key** → save the JSON.
2. Point the admin SDK at it:
   - bash: `export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/serviceAccount.json`
   - PowerShell: `$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\serviceAccount.json"`

`firebase-admin` is already a root dependency, so run from the repo root.

## Back up
```
node scripts/backup-user-data.mjs kevin.laperriere@gmail.com
```
Writes `backups/bigsurf-backup-<uid>-<timestamp>.json` — every subcollection under
`users/{uid}` (workouts, workoutTemplates, equipment, locations, stats/personalRecords,
preferences, …) plus the user doc.

## Restore (pull back)
```
node scripts/restore-user-data.mjs backups/bigsurf-backup-<uid>-<ts>.json          # dry run
node scripts/restore-user-data.mjs backups/bigsurf-backup-<uid>-<ts>.json --apply  # write
```
Overwrites each backed-up doc to its snapshot state. Docs created *after* the
backup are left as-is (a migration rollback only reverts what it changed).

## In-app migration tools (console, `?debug` in URL, signed in)
- `await runEquipmentIdBackfill()` — dry run: plans the equipmentId backfill, writes nothing.
- `await runEquipmentIdBackfill({ apply: true })` — writes the **additive** backfill (equipmentId next to the name).
- `await undoEquipmentIdBackfill()` — strips every equipmentId we added (names untouched).
- `await snapshotPersonalRecords()` — copies the PR doc to `stats/personalRecords__backup_<ts>` (for the later PR re-key step).
