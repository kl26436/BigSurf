#!/usr/bin/env node
// AU-13 prod data step (action plan §8.2): bring the LIVE exercise library —
// the Firestore `exercises` collection signed-in users actually read — and one
// user's exerciseOverrides + saved workout rows in line with the bundled
// library's movement patterns (e.g. Back Extension Machine → hip-dominant).
//
//   node scripts/fix-exercise-patterns.mjs kevin.laperriere@gmail.com           # dry run
//   node scripts/fix-exercise-patterns.mjs kevin.laperriere@gmail.com --apply   # write
//
// Dry run prints the current pattern / bodyPart of every entry it would touch.
// Refuses to plan anything if data/exercises.json and functions/data/
// exercises.json disagree. Only `pattern` is written (on library docs,
// overrides, and template rows that store an explicit pattern). Needs the
// same key as backup-user-data.mjs ($env:GOOGLE_APPLICATION_CREDENTIALS).

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { planPatternFixes } from './lib/pattern-fix-plan.mjs';

const PROJECT_ID = 'workout-tracker-b94b6';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const who = args.find(a => !a.startsWith('--'));
if (!who) { console.error('usage: node scripts/fix-exercise-patterns.mjs <email|uid> [--apply]'); process.exit(1); }
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key path first.');
    process.exit(1);
}

const clientLib = JSON.parse(readFileSync('data/exercises.json', 'utf8'));
const serverLib = JSON.parse(readFileSync('functions/data/exercises.json', 'utf8'));

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const uid = who.includes('@') ? (await admin.auth().getUserByEmail(who)).uid : who;
const user = db.collection('users').doc(uid);

const docs = (snap) => snap.docs.filter(d => d.id !== 'default').map(d => ({ id: d.id, ...d.data() }));
const [defaults, overrides, templates] = await Promise.all([
    db.collection('exercises').get().then(docs),
    user.collection('exerciseOverrides').get().then(docs),
    user.collection('workoutTemplates').get().then(docs),
]);

const plan = planPatternFixes({ clientLib, serverLib, defaults, overrides, templates });
if (plan.refused) { console.error(`✘ ${plan.refused}`); process.exit(1); }

const show = (label, rows) => {
    console.log(`\n${label}: ${rows.length}`);
    for (const r of rows) console.log(`  ${r.name} — pattern ${r.from ?? '(none)'} → ${r.to}${'bodyPart' in r ? ` · bodyPart ${r.bodyPart ?? '(none)'}` : ''}${r.template ? ` · in "${r.template}" row ${r.idx}` : ''}`);
};
show('Library (exercises collection)', plan.defaults);
show(`Overrides (users/${uid}/exerciseOverrides)`, plan.overrides);
show(`Saved workout rows with an explicit pattern (users/${uid}/workoutTemplates)`, plan.templates);

if (!apply) { console.log('\nDry run — nothing written. Re-run with --apply to write.'); process.exit(0); }

for (const r of plan.defaults) await db.collection('exercises').doc(r.id).set({ pattern: r.to }, { merge: true });
for (const r of plan.overrides) await user.collection('exerciseOverrides').doc(r.id).set({ pattern: r.to }, { merge: true });
const byTemplate = new Map();
for (const r of plan.templates) (byTemplate.get(r.templateId) || byTemplate.set(r.templateId, []).get(r.templateId)).push(r);
for (const [id, rows] of byTemplate) {
    const t = templates.find(x => x.id === id);
    const exercises = t.exercises.map((row, idx) => {
        const r = rows.find(x => x.idx === idx);
        return r ? { ...row, pattern: r.to } : row;
    });
    await user.collection('workoutTemplates').doc(id).set({ exercises, lastUpdated: new Date().toISOString() }, { merge: true });
}
console.log(`\nWrote ${plan.defaults.length} library, ${plan.overrides.length} override, ${plan.templates.length} template-row pattern(s).`);
