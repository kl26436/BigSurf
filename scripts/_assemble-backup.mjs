// Assemble a restorable Big Surf user backup from raw Firebase-MCP output.
//
// Reads every *.json file in backups/_raw/ (each is a raw
// firestore_list_documents response: { documents: [{ name, fields, ... }] }),
// converts the Firestore REST value encoding to plain JSON, and writes a single
// backup file in the shape scripts/restore-user-data.mjs expects:
//   { meta: { projectId, uid, exportedAt, schema, source },
//     collections: { <name>: [ { id, data }, ... ] } }
//
// Collection name is derived from the filename with any trailing `_page<n>`
// suffix stripped, so multi-page collections (workouts_page1 + workouts_page2)
// merge back into one collection. Pages are concatenated in filename order.
//
// Run: node scripts/_assemble-backup.mjs

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'workout-tracker-b94b6';
const UID = 'YpB4kgun28TD3eSBAR8QYfkK4a13';
const RAW_DIR = 'backups/_raw';

// The 15 subcollections we expect to have captured.
const EXPECTED = [
    'coachHistory', 'customExercises', 'dexa', 'equipment', 'exerciseOverrides',
    'integrations', 'locations', 'measurements', 'migration', 'overrides',
    'preferences', 'push_subscriptions', 'stats', 'workoutTemplates', 'workouts',
];

// Convert a single Firestore REST Value to a plain JS value.
function convertValue(v) {
    if (v == null || typeof v !== 'object') return v;
    if ('stringValue' in v) return v.stringValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;      // keep ISO string
    if ('referenceValue' in v) return v.referenceValue;      // keep path string
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('bytesValue' in v) return v.bytesValue;              // base64 string, preserve
    if ('geoPointValue' in v) return v.geoPointValue;
    if ('mapValue' in v) return convertFields(v.mapValue && v.mapValue.fields);
    if ('arrayValue' in v) return (v.arrayValue && v.arrayValue.values ? v.arrayValue.values : []).map(convertValue);
    throw new Error('Unknown Firestore value type: ' + JSON.stringify(v).slice(0, 120));
}

// Convert a Firestore `fields` object to a plain JS object.
function convertFields(fields) {
    const out = {};
    if (!fields) return out;
    for (const [k, v] of Object.entries(fields)) out[k] = convertValue(v);
    return out;
}

function docId(name) {
    return name.split('/').pop();
}

function collectionNameForFile(file) {
    const base = file.replace(/\.json$/i, '');
    return base.replace(/_page\d+$/i, '');
}

// Gather raw files grouped by collection, preserving filename sort order for pages.
const files = readdirSync(RAW_DIR).filter((f) => f.toLowerCase().endsWith('.json')).sort();
const byCollection = {};
for (const file of files) {
    const col = collectionNameForFile(file);
    (byCollection[col] ||= []).push(file);
}

const collections = {};
let totalDocs = 0;
for (const col of Object.keys(byCollection).sort()) {
    const docs = [];
    const seen = new Set();
    for (const file of byCollection[col]) {
        const raw = JSON.parse(readFileSync(path.join(RAW_DIR, file), 'utf8'));
        for (const d of raw.documents || []) {
            const id = docId(d.name);
            if (seen.has(id)) { console.warn(`  ! duplicate id ${col}/${id} — skipping`); continue; }
            seen.add(id);
            docs.push({ id, data: convertFields(d.fields) });
        }
    }
    collections[col] = docs;
    totalDocs += docs.length;
}

// Sanity: warn on unexpected / missing collections (does not abort).
const got = new Set(Object.keys(collections));
for (const c of EXPECTED) if (!got.has(c)) console.warn(`  ! MISSING expected collection: ${c}`);
for (const c of got) if (!EXPECTED.includes(c)) console.warn(`  ! UNEXPECTED collection: ${c}`);

const out = {
    meta: {
        projectId: PROJECT_ID,
        uid: UID,
        exportedAt: new Date().toISOString(),
        schema: 2,
        source: 'firebase-mcp',
    },
    collections,
};

const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
const outFile = `backups/bigsurf-backup-${UID}-${ts}.json`;
writeFileSync(outFile, JSON.stringify(out, null, 2));

console.log('Collections:');
for (const c of Object.keys(collections).sort()) console.log(`  ${c}: ${collections[c].length}`);
console.log(`Total docs: ${totalDocs}`);
console.log(`Wrote: ${outFile} (${(statSync(outFile).size / 1048576).toFixed(2)} MB)`);
