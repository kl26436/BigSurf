// Export an apply-ready equipmentId backfill plan from a backup file, using the
// tested planners. Output is grouped per doc so the applier makes one write per
// document. No writes here — just the plan.
//
//   node scripts/export-backfill-plan.mjs backups/bigsurf-backup-<uid>-<ts>.json

import { readFileSync, writeFileSync } from 'node:fs';
import { planEquipmentIdBackfill } from '../js/core/data/equipment-id-migration.js';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/export-backfill-plan.mjs <backup.json>'); process.exit(1); }

const backup = JSON.parse(readFileSync(file, 'utf8'));
const flatten = (docs) => (docs || []).map((d) => ({ id: d.id, ...d.data }));
const equipment = flatten(backup.collections.equipment);
const workouts = flatten(backup.collections.workouts);
const templates = flatten(backup.collections.workoutTemplates);

const wPlan = planEquipmentIdBackfill(workouts, equipment);
const tPlan = planEquipmentIdBackfill(templates, equipment);

const groupByDoc = (writes) => {
    const by = {};
    for (const w of writes) (by[w.docId] ||= {})[w.exerciseKey] = w.equipmentId;
    return Object.entries(by).map(([docId, writes]) => ({ docId, writes }));
};

const plan = {
    uid: backup.meta.uid,
    project: backup.meta.projectId,
    generatedFrom: file,
    workouts: groupByDoc(wPlan.writes),      // [{ docId, writes: { exercise_0: eqId, … } }]
    templates: groupByDoc(tPlan.writes),     // [{ docId, writes: { "0": eqId, … } }]  (keys are array indices)
    counts: {
        workoutDocs: 0, workoutWrites: wPlan.writes.length,
        templateDocs: 0, templateWrites: tPlan.writes.length,
    },
};
plan.counts.workoutDocs = plan.workouts.length;
plan.counts.templateDocs = plan.templates.length;

writeFileSync('backups/_backfill-plan.json', JSON.stringify(plan, null, 2));
console.log('Plan written → backups/_backfill-plan.json');
console.log(plan.counts);
