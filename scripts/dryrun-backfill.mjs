// Offline dry-run of the equipmentId backfill against a backup file — runs the
// SAME tested planners the in-app runner uses, so you can inspect exactly what
// the migration would do without opening the app or writing anything.
//
//   node scripts/dryrun-backfill.mjs backups/bigsurf-backup-<uid>-<ts>.json

import { readFileSync } from 'node:fs';
import { planEquipmentIdBackfill, rekeyExercisePRsByEquipmentId } from '../js/core/data/equipment-id-migration.js';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/dryrun-backfill.mjs <backup.json>'); process.exit(1); }

const backup = JSON.parse(readFileSync(file, 'utf8'));
const col = (name) => (backup.collections?.[name] || []);
const flatten = (docs) => docs.map((d) => ({ id: d.id, ...d.data }));

const equipment = flatten(col('equipment'));
const workouts = flatten(col('workouts'));
const templates = flatten(col('workoutTemplates'));
const prDoc = col('stats').find((d) => d.id === 'personalRecords');
const exercisePRs = prDoc?.data?.exercisePRs || {};

const wPlan = planEquipmentIdBackfill(workouts, equipment);
const tPlan = planEquipmentIdBackfill(templates, equipment);
const prPlan = rekeyExercisePRsByEquipmentId(exercisePRs, equipment);

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

console.log(`\n=== equipmentId backfill — DRY RUN (from ${file}) ===`);
console.log(`equipment docs: ${equipment.length}\n`);

console.log(`WORKOUTS (${workouts.length} docs)`);
console.log(`  exercises with equipment:  ${wPlan.stats.total}`);
console.log(`  would resolve → write id:  ${wPlan.stats.resolved} (${pct(wPlan.stats.resolved, wPlan.stats.total)}%)`);
console.log(`  need review (not written): ${wPlan.stats.needsReview}`);
console.log(`  bodyweight/no-equipment:   ${wPlan.stats.skippedNoEquipment}`);

console.log(`\nTEMPLATES (${templates.length} docs)`);
console.log(`  exercises with equipment:  ${tPlan.stats.total}`);
console.log(`  would resolve → write id:  ${tPlan.stats.resolved} (${pct(tPlan.stats.resolved, tPlan.stats.total)}%)`);
console.log(`  need review (not written): ${tPlan.stats.needsReview}`);

console.log(`\nPR RE-KEY PREVIEW (not applied — later step)`);
console.log(`  total PR entries:          ${prPlan.stats.prCount}`);
console.log(`  would re-key → id:         ${prPlan.stats.resolved}`);
console.log(`  kept under name (review):  ${prPlan.stats.keptUnderName}`);
console.log(`  id collisions merged:      ${prPlan.stats.merges}`);
console.log(`  (conservation check: ${prPlan.stats.resolved + prPlan.stats.keptUnderName} == ${prPlan.stats.prCount} → ${prPlan.stats.resolved + prPlan.stats.keptUnderName === prPlan.stats.prCount ? 'OK, no PR lost' : 'MISMATCH!'})`);

// Sample the names that would go to review, so you can eyeball them.
const reviewNames = [...new Set([...wPlan.review, ...tPlan.review].map((r) => r.name))];
if (reviewNames.length) {
    console.log(`\nDistinct equipment names that need review (${reviewNames.length}):`);
    reviewNames.slice(0, 40).forEach((n) => console.log(`  - ${n}`));
    if (reviewNames.length > 40) console.log(`  … and ${reviewNames.length - 40} more`);
}
const prReviewNames = [...new Set(prPlan.review.map((r) => r.equipmentName))];
if (prReviewNames.length) {
    console.log(`\nPR equipment keys that need review (${prReviewNames.length}):`);
    prReviewNames.slice(0, 40).forEach((n) => console.log(`  - ${n}`));
    if (prReviewNames.length > 40) console.log(`  … and ${prReviewNames.length - 40} more`);
}
console.log('');
