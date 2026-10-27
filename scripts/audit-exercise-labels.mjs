// Read-only audit of exercise / equipment labels (LB-0 in docs/exercise-labels-audit-2026-10.md).
//
// Reads a user backup (node scripts/backup-user-data.mjs) and prints, for the
// CURRENT code's classifiers (the functions/ mirrors, so it runs without a
// bundler and always matches what the app and the coach do):
//   1. built-in library — stored bodyPart / pattern vs canonical body part and
//      name-only inference
//   2. custom exercises + overrides — stored labels, the merged (effective)
//      labels, legacy body parts that now fold (Calves → Legs + calves)
//   3. workout history per exercise + machine — sets, pattern with and
//      without the equipment, canonical body part, dashboard card,
//      Equipment Library bucket; sets by pattern; hinge candidates;
//      null-pattern exercises
//   4. templates — rows, stored vs inferred pattern/role, spine coverage
//   5. equipment — patterns per machine, unmapped machines, machines whose
//      linked exercises span ≥3 patterns (the mis-link smell)
//   6. duplicate / near-duplicate exercise names (case, typos)
//
// Usage (repo root):
//   npm run audit:labels                         # newest backups/bigsurf-backup-*.json
//   node scripts/audit-exercise-labels.mjs <backup.json>
// Re-run after each LB phase and after a fresh backup. Never writes anything.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const { inferPattern, inferRole, patternsForEquipment } = require(join(REPO, 'functions/movement-patterns.js'));
const {
    canonicalBodyPart, normalizeBodyPart, dashboardBodyPart, focusTagForBodyPart,
    movementLabel, mergeExerciseOverride, findInLibrary,
} = require(join(REPO, 'functions/exercise-taxonomy.js'));
const { diceSimilarity } = require(join(REPO, 'functions/fuzzy-match.js'));

function newestBackup() {
    const dir = join(REPO, 'backups');
    let files = [];
    try { files = readdirSync(dir).filter(f => /^bigsurf-backup-.*\.json$/.test(f)); } catch { /* no dir */ }
    files.sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);
    return files.length ? join(dir, files[0]) : null;
}

const BACKUP = process.argv[2] || newestBackup();
if (!BACKUP) {
    console.error('usage: node scripts/audit-exercise-labels.mjs <backups/bigsurf-backup-….json>\n'
        + '  (no argument = the newest backups/bigsurf-backup-*.json; make one with node scripts/backup-user-data.mjs)');
    process.exit(1);
}

const seed = JSON.parse(readFileSync(join(REPO, 'data/exercises.json'), 'utf8'));
const backup = JSON.parse(readFileSync(BACKUP, 'utf8')).collections || {};
const docs = (name) => (backup[name] || []).map(d => ({ id: d.id, ...d.data }));
const custom = docs('customExercises');
const overrides = docs('exerciseOverrides');
const equipment = docs('equipment');
const templates = docs('workoutTemplates');
const workouts = docs('workouts');

// The library the app builds: built-ins with overrides applied (LB-2 merge), then custom.
const overrideByName = new Map(overrides.filter(o => o.originalName).map(o => [o.originalName.toLowerCase(), o]));
const library = [
    ...seed.map(e => mergeExerciseOverride(e, overrideByName.get((e.name || '').toLowerCase()))),
    ...custom,
];

const pad = (s, n) => String(s ?? '').padEnd(n);
const section = (t) => console.log('\n' + '='.repeat(110) + '\n' + t + '\n' + '='.repeat(110));
const libBucket = (name) => canonicalBodyPart(name, { library }) || 'Multi-Use';

console.log(`Backup: ${BACKUP}`);
console.log(`Built-in ${seed.length} · custom ${custom.length} · overrides ${overrides.length} · equipment ${equipment.length} · templates ${templates.length} · workouts ${workouts.length}`);

section('1. BUILT-IN LIBRARY (data/exercises.json) — stored labels vs the one classifier');
console.log(pad('name', 38), pad('stored BP', 11), pad('canonical', 10), pad('stored pattern', 16), pad('name-only', 16), 'flags');
let nameMismatch = 0;
for (const e of seed) {
    const nameOnly = inferPattern({ name: e.name });
    const flags = [];
    if (nameOnly !== e.pattern) { flags.push('NAME≠STORED'); nameMismatch++; }
    if (!nameOnly) flags.push('NULL-by-name');
    if (normalizeBodyPart(e.bodyPart) !== e.bodyPart) flags.push(`BP folds → ${normalizeBodyPart(e.bodyPart)}`);
    console.log(pad(e.name, 38), pad(e.bodyPart, 11), pad(canonicalBodyPart(e), 10), pad(e.pattern, 16), pad(nameOnly, 16), flags.join(', '));
}
console.log(`name-only inference ≠ stored pattern: ${nameMismatch}`);

section('2. CUSTOM EXERCISES + OVERRIDES — stored vs effective labels');
console.log(pad('name', 36), pad('kind', 9), pad('stored BP', 11), pad('canonical', 10), pad('stored tags', 26), pad('effective pattern', 18), 'flags');
for (const e of [...custom.map(x => ({ ...x, _k: 'custom' })), ...overrides.map(x => ({ ...x, _k: 'override' }))]) {
    const eff = e._k === 'override'
        ? mergeExerciseOverride(seed.find(s => s.name.toLowerCase() === String(e.originalName || e.name).toLowerCase()) || {}, e)
        : e;
    const pattern = inferPattern(eff);
    const flags = [];
    if (!pattern) flags.push('NULL pattern');
    if (e.pattern) flags.push(`stored pattern ${e.pattern}`);
    if (e._k === 'override' && Array.isArray(e.tags) && !e.tags.length) flags.push('empty tags (built-in tags kept)');
    const focus = focusTagForBodyPart(e.bodyPart);
    if (focus) flags.push(`legacy BP → ${normalizeBodyPart(e.bodyPart)} + tag "${focus}"`);
    if (!normalizeBodyPart(e.bodyPart)) flags.push('no body part stored');
    console.log(pad(e.name, 36), pad(e._k, 9), pad(e.bodyPart, 11), pad(canonicalBodyPart(eff), 10),
        pad((e.tags || []).join(','), 26), pad(pattern, 18), flags.join(', '));
}

section('3. WORKOUT HISTORY — per exercise + machine (all time): sets, pattern (name / with machine), body part, buckets');
const rows = new Map();
for (const w of workouts) {
    if (!w.exercises || w.cancelledAt) continue;
    for (const [k, ex] of Object.entries(w.exercises)) {
        const name = w.exerciseNames?.[k] || ex?.name || ex?.machine;
        if (!name) continue;
        const gear = ex.equipment || '';
        const key = `${name.toLowerCase()}|${gear.toLowerCase()}`;
        const n = (ex.sets || []).filter(s => s && s.completed !== false && (s.type || 'working') !== 'warmup').length;
        const r = rows.get(key) || { name, gear, sets: 0, first: '9999', last: '' };
        r.sets += n;
        if (w.date > r.last) r.last = w.date;
        if (w.date < r.first) r.first = w.date;
        rows.set(key, r);
    }
}
const hist = [...rows.values()].sort((a, b) => b.sets - a.sets);
const byPattern = {};
console.log(pad('name', 34), pad('machine', 40), pad('sets', 5), pad('last', 11), pad('name-only', 15), pad('with machine', 15), pad('body part', 10), pad('dash', 9), 'equip-lib');
for (const r of hist) {
    const entry = findInLibrary(r.name, library);
    const nameOnly = inferPattern({ name: r.name });
    const full = inferPattern(entry ? { ...entry, name: r.name } : { name: r.name }, { equipment: r.gear || null });
    r.pattern = full;
    byPattern[full || 'NULL'] = (byPattern[full || 'NULL'] || 0) + r.sets;
    const bp = canonicalBodyPart(r.name, { library, equipment: r.gear || null });
    console.log(pad(r.name, 34), pad(r.gear.slice(0, 39), 40), pad(r.sets, 5), pad(r.last, 11), pad(nameOnly, 15),
        pad(full + (full !== nameOnly ? ' *' : ''), 15), pad(bp, 10), pad(dashboardBodyPart(bp), 9), libBucket(r.name));
}
console.log('\n(* = the machine or the library entry changed the pattern)');
console.log('\nSets by pattern (all time, machine-aware):');
for (const [p, n] of Object.entries(byPattern).sort((a, b) => b[1] - a[1])) console.log('  ' + pad(p, 18), pad(n, 6), movementLabel(p));

section('3b. HINGE CANDIDATES in history');
for (const r of hist) {
    if (r.pattern === 'hip-dominant' || /deadlift|rdl|romanian|good morning|hip thrust|glute|back ext|hyperext|pull.?through|swing|hinge/i.test(r.name)) {
        console.log(pad(r.name, 34), pad(r.gear.slice(0, 39), 40), pad(r.sets, 5), pad(r.last, 11), r.pattern);
    }
}

section('3c. NULL-PATTERN exercises in history (count toward no movement)');
const nulls = hist.filter(r => !r.pattern);
if (!nulls.length) console.log('none');
for (const r of nulls) console.log(pad(r.name, 34), pad(r.gear.slice(0, 39), 40), pad(r.sets, 5), r.last);

section('4. TEMPLATES — rows, stored pattern/role, inferred, spine coverage');
const SPINE = ['knee-dominant', 'hip-dominant', 'horizontal-push', 'vertical-push', 'horizontal-pull', 'vertical-pull'];
for (const t of templates) {
    if (t.archived || t.isHidden) continue;
    console.log('\n## ' + (t.name || t.id) + '  [' + (t.category || '') + ']' + (t.programId ? ' program:' + t.programId : ''));
    const cov = new Set();
    (t.exercises || []).forEach((ex, i) => {
        const name = ex.machine || ex.name;
        const entry = findInLibrary(name, library);
        const p = inferPattern({ ...(entry || {}), ...ex, name }, { equipment: ex.equipment || null });
        const r = inferRole({ ...ex, name }, i);
        cov.add(p);
        console.log('  ' + pad(name, 38), pad('pat:' + (ex.pattern || '-'), 22), pad('role:' + (ex.role || '-'), 16), '→', pad(p, 16), pad(r, 10), ex.equipment ? 'eq: ' + ex.equipment : '');
    });
    console.log('  spine missing: ' + (SPINE.filter(p => !cov.has(p)).map(movementLabel).join(', ') || 'none'));
}

section('5. EQUIPMENT — patternsForEquipment(), unmapped, mis-link smell');
const lookup = (n) => findInLibrary(n, library);
const eqCount = {};
const unmapped = [];
const smelly = [];
console.log(pad('name', 52), pad('type', 13), pad('function', 28), pad('exerciseTypes', 44), 'patterns');
for (const eq of [...equipment].sort((a, b) => (a.name || '').localeCompare(b.name || ''))) {
    const ps = patternsForEquipment(eq, lookup);
    for (const p of ps) eqCount[p] = (eqCount[p] || 0) + 1;
    if (!ps.length) eqCount.NULL = (eqCount.NULL || 0) + 1;
    if (!(eq.exerciseTypes || []).length) unmapped.push(eq);
    if (ps.length >= 3) smelly.push({ eq, ps });
    console.log(pad(eq.name, 52), pad(eq.equipmentType, 13), pad(eq.function, 28), pad((eq.exerciseTypes || []).join('|').slice(0, 43), 44), ps.join(',') || 'NULL');
}
console.log('\nEquipment by pattern:');
for (const [p, n] of Object.entries(eqCount).sort((a, b) => b[1] - a[1])) console.log('  ' + pad(p, 18), n);
console.log(`\nUnmapped (no exerciseTypes — invisible to pickers and rotation): ${unmapped.length}`);
for (const eq of unmapped) console.log('  ' + eq.name);
console.log(`\nLinked exercises span ≥3 patterns (check for wrong links): ${smelly.length}`);
for (const { eq, ps } of smelly) console.log('  ' + pad(eq.name, 52), ps.join(', '), '←', (eq.exerciseTypes || []).join(' | '));

section('6. DUPLICATE / NEAR-DUPLICATE EXERCISE NAMES (library + history)');
const names = new Map(); // lower → Set of spellings
for (const n of [...library.map(e => e.name), ...hist.map(r => r.name)]) {
    if (!n) continue;
    const k = n.toLowerCase().trim();
    if (!names.has(k)) names.set(k, new Set());
    names.get(k).add(n);
}
let dupes = 0;
for (const spellings of names.values()) {
    if (spellings.size > 1) { dupes++; console.log('  case: ' + [...spellings].join(' | ')); }
}
const keys = [...names.keys()];
for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
        const s = diceSimilarity(keys[i], keys[j]);
        if (s >= 0.85) { dupes++; console.log(`  near (${s.toFixed(2)}): ${[...names.get(keys[i])][0]} | ${[...names.get(keys[j])][0]}`); }
    }
}
if (!dupes) console.log('none');
