// Read-only audit of exercise / equipment labels (LB-0 in docs/exercise-labels-audit-2026-10.md).
// Prints: built-in library (explicit vs name-inferred pattern), custom + override exercises,
// workout history by pattern, hinge candidates, template rows, equipment → patterns.
// Usage: node scripts/audit-exercise-labels.mjs backups/<backup>.json   (run from the repo root)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const REPO = resolve(process.argv[3] || new URL('..', import.meta.url).pathname);
import { createRequire } from 'node:module'; const mp = createRequire(import.meta.url)(REPO + '/functions/movement-patterns.js');
const { inferPattern, inferRole, patternsForEquipment, PATTERNS } = mp;
const seed = JSON.parse(readFileSync(REPO + '/data/exercises.json', 'utf8'));
const BACKUP = process.argv[2]; if (!BACKUP) { console.error('usage: node scripts/audit-exercise-labels.mjs <backups/bigsurf-backup-….json> [repoRoot]'); process.exit(1); }
const backup = JSON.parse(readFileSync(BACKUP, 'utf8')).collections;
const custom = backup.customExercises.map(d => d.data);
const overrides = backup.exerciseOverrides.map(d => d.data);
const equipment = backup.equipment.map(d => d.data);
const templates = backup.workoutTemplates.map(d => d.data);
const workouts = backup.workouts.map(d => d.data);

// copy of equipment-library-ui.js classifyExerciseBodyPart
function classifyBP(exerciseName) {
    const name = exerciseName.toLowerCase();
    if (/chest press|bench press|pec deck|pec fly|fly.*chest|incline press|decline press|push.?up|dips.*press|chest/.test(name)) return 'Chest';
    if (/row|lat pull|pull.?down|pull.?up|chin.?up|deadlift|back ext|reverse fly|shrug|face pull/.test(name)) return 'Back';
    if (/shoulder press|overhead press|military press|lateral raise|front raise|rear delt|arnold|upright row/.test(name)) return 'Shoulders';
    if (/curl|tricep|bicep|pushdown|skull crush|hammer curl|preacher|dip(?!.*press)|kickback|extension.*arm/.test(name)) return 'Arms';
    if (/squat|leg press|leg curl|leg ext|lunge|calf|glute|hip|hamstring|quad|romanian|hack squat|step.?up/.test(name)) return 'Legs';
    if (/ab|crunch|plank|sit.?up|core|oblique|wood.?chop|cable twist|russian twist|hanging leg/.test(name)) return 'Core';
    if (/treadmill|bike|elliptical|rower|run|sprint|stair|jump rope|cardio/.test(name)) return 'Cardio';
    return 'Multi-Use';
}
const pad = (s, n) => String(s ?? '').padEnd(n);
const section = (t) => console.log('\n' + '='.repeat(100) + '\n' + t + '\n' + '='.repeat(100));

section('1. SEED LIBRARY (data/exercises.json, 73) — explicit pattern vs name-only inference (what scoreboard/coach use) vs equip-lib bodyPart');
console.log(pad('name',36), pad('bodyPart',10), pad('explicit',16), pad('name-only',16), pad('equipLib BP',11), 'flag');
let mism = 0;
for (const e of seed) {
    const nameOnly = inferPattern({ name: e.name });
    const full = inferPattern(e);
    const bp = classifyBP(e.name);
    const flags = [];
    if (nameOnly !== e.pattern) { flags.push('NAME≠EXPLICIT'); mism++; }
    if (!nameOnly) flags.push('NULL-by-name');
    console.log(pad(e.name,36), pad(e.bodyPart,10), pad(e.pattern,16), pad(nameOnly,16), pad(bp,11), flags.join(','));
}
console.log('mismatches:', mism);

section('2. CUSTOM EXERCISES (21) + OVERRIDES (18) — no explicit pattern; inference from name+tags');
console.log(pad('name',36), pad('kind',9), pad('bodyPart',10), pad('tags',28), pad('inferred',16), pad('name-only',16), pad('equipLib BP',11), 'flag');
for (const e of [...custom.map(x=>({...x,_k:'custom'})), ...overrides.map(x=>({...x,_k:'override'}))]) {
    const inf = inferPattern(e); const nameOnly = inferPattern({ name: e.name });
    const flags = [];
    if (!inf) flags.push('NULL');
    if (e.pattern) flags.push('has pattern:'+e.pattern);
    if (inf !== nameOnly) flags.push('tags change it');
    console.log(pad(e.name,36), pad(e._k,9), pad(e.bodyPart,10), pad((e.tags||[]).join(','),28), pad(inf,16), pad(nameOnly,16), pad(classifyBP(e.name),11), flags.join(','));
}

section('3. WORKOUT HISTORY — distinct exercise names (all time), sets, name-only pattern (scoreboard logic)');
const counts = new Map();
for (const w of workouts) {
    if (!w.exercises || w.cancelledAt) continue;
    for (const [k, ex] of Object.entries(w.exercises)) {
        const name = w.exerciseNames?.[k] || ex?.name || ex?.machine; if (!name) continue;
        const n = (ex.sets||[]).filter(s=>s && s.completed!==false && (s.type||'working')!=='warmup').length;
        const c = counts.get(name) || { sets: 0, last: '', first: '9999' };
        c.sets += n; if (w.date > c.last) c.last = w.date; if (w.date < c.first) c.first = w.date;
        counts.set(name, c);
    }
}
const byPattern = {};
const rows = [...counts.entries()].sort((a,b)=>b[1].sets-a[1].sets);
console.log(pad('name',40), pad('sets',6), pad('first',11), pad('last',11), pad('pattern(name-only)',18), pad('role',10), 'equipLib BP');
for (const [name, c] of rows) {
    const p = inferPattern({ name }); const r = inferRole({ name }, 0);
    byPattern[p||'NULL'] = (byPattern[p||'NULL']||0) + c.sets;
    console.log(pad(name,40), pad(c.sets,6), pad(c.first,11), pad(c.last,11), pad(p,18), pad(r,10), classifyBP(name));
}
console.log('\nSets by pattern (all time):'); for (const [p,n] of Object.entries(byPattern).sort((a,b)=>b[1]-a[1])) console.log(pad(p,18), n);

section('3b. HINGE candidates in history (name contains deadlift/rdl/romanian/good morning/hip thrust/glute/back extension/pull-through/kettlebell swing)');
for (const [name,c] of rows) if (/deadlift|rdl|romanian|good morning|hip thrust|glute|back ext|hyperext|pull.?through|swing|hinge/i.test(name)) console.log(pad(name,40), pad(c.sets,6), pad(c.last,11), inferPattern({name}));

section('4. TEMPLATES — rows, explicit pattern/role fields, inferred pattern & role, spine coverage');
for (const t of templates) {
    if (t.archived || t.isHidden) continue;
    console.log('\n## ' + (t.name || t.id) + '  [' + (t.category||'') + ']' + (t.programId?' program:'+t.programId:''));
    const cov = new Set();
    (t.exercises||[]).forEach((ex, i) => {
        const name = ex.machine || ex.name;
        const p = inferPattern({ ...ex, name }); const r = inferRole({ ...ex, name }, i);
        cov.add(p);
        console.log('  ' + pad(name,38), pad('pat:'+(ex.pattern||'-'),22), pad('role:'+(ex.role||'-'),16), '→', pad(p,16), r, ex.equipment ? '  eq: '+ex.equipment : '');
    });
}

section('5. EQUIPMENT (99) — function, exerciseTypes, patternsForEquipment()');
const lookup = (n) => [...seed, ...custom, ...overrides].find(e => (e.name||'').toLowerCase() === String(n).toLowerCase());
const eqPat = {};
console.log(pad('name',50), pad('type',14), pad('function',28), pad('exerciseTypes',40), 'patterns');
for (const eq of equipment.sort((a,b)=>(a.name||'').localeCompare(b.name||''))) {
    const ps = patternsForEquipment(eq, lookup);
    for (const p of ps) eqPat[p] = (eqPat[p]||0)+1;
    if (!ps.length) eqPat['NULL'] = (eqPat['NULL']||0)+1;
    console.log(pad(eq.name,50), pad(eq.equipmentType,14), pad(eq.function,28), pad((eq.exerciseTypes||[]).join('|'),40), ps.join(',') || 'NULL', (eq.exerciseTypes||[]).length?'':'  <-- UNMAPPED');
}
console.log('\nEquipment count by pattern:'); for (const [p,n] of Object.entries(eqPat).sort((a,b)=>b[1]-a[1])) console.log(pad(p,18), n);
console.log('\nequipmentType values:', [...new Set(equipment.map(e=>e.equipmentType))]);
