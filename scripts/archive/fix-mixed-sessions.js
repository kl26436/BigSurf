#!/usr/bin/env node
/**
 * One-off corrector for sessions where the kg/lb tag was mixed within a single
 * exercise. Two kinds of changes:
 *   1. Re-flip — sets I previously reverted from lb→kg that should have stayed lb
 *      (66 kg in an otherwise lb progression).
 *   2. Value-convert — lb-tagged sets in a kg-dominant session, where the lb value
 *      is the unit-converted equivalent of the kg the user actually typed.
 *      e.g. {165, lb} on a Panatta day where the rest of the session is kg →
 *      convert in-place to {75, kg} (since 165 lb = 75 kg).
 *
 * Writes changelog so revertable. Uses partial-revert format compatible with
 * fix-weights.js --revert.
 *
 * Usage:
 *   node scripts/fix-mixed-sessions.js           # DRY RUN
 *   node scripts/fix-mixed-sessions.js --apply
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'workout-tracker-b94b6';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// Hard-coded fix list. Each entry identifies a doc + exercise + setIdx and the
// intended (newWeight, newUnit). The before-state is captured at apply time so
// the changelog can drive a revert.
const FIXES = [
    // Re-flip: kg → lb, value unchanged (my earlier revert was wrong)
    { date: '2025-10-21', exercise: 'Leg Extension',     setIdx: 0, newWeight: 66,  newUnit: 'lbs', why: 'Re-flip: 30→35→40 kg progression in lb numbers. Set 1 should be 66 lb.' },
    { date: '2025-08-05', exercise: 'Leg Extension',     setIdx: 1, newWeight: 66,  newUnit: 'lbs', why: 'Re-flip: 77→66→66 lb session.' },
    { date: '2025-08-05', exercise: 'Leg Extension',     setIdx: 2, newWeight: 66,  newUnit: 'lbs', why: 'Re-flip: 77→66→66 lb session.' },
    // Value-convert: lb → kg with value conversion (kg-dominant session)
    { date: '2026-04-13', exercise: 'Leg Extension',     setIdx: 2, newWeight: 75,  newUnit: 'kg',  why: 'Kg session: 65→70→75 kg. Set 3 stored as {165, lb} = 75 kg.' },
    { date: '2025-11-04', exercise: 'Leg Curl Machine',  setIdx: 3, newWeight: 40,  newUnit: 'kg',  why: 'Kg session: 40 kg ×4. Set 4 stored as {88, lb} = 40 kg.' },
    { date: '2025-09-16', exercise: 'Leg Curl Machine',  setIdx: 1, newWeight: 40,  newUnit: 'kg',  why: 'Kg session: 40 kg ×4 (88 lb = 40 kg).' },
    { date: '2025-09-16', exercise: 'Leg Curl Machine',  setIdx: 2, newWeight: 40,  newUnit: 'kg',  why: 'Kg session: 40 kg ×4 (88 lb = 40 kg).' },
    { date: '2025-09-16', exercise: 'Leg Curl Machine',  setIdx: 3, newWeight: 40,  newUnit: 'kg',  why: 'Kg session: 40 kg ×4 (88 lb = 40 kg).' },
    { date: '2025-09-02', exercise: 'Leg Extension',     setIdx: 2, newWeight: 50,  newUnit: 'kg',  why: 'Kg session: 40→45→50 kg (110 lb = 50 kg).' },
];

const USER_UID = 'YpB4kgun28TD3eSBAR8QYfkK4a13';

async function getAccessToken() {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
    const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${cfg.tokens.refresh_token}&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
    });
    return (await r.json()).access_token;
}

function pv(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return parseInt(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = pv(x); return o; }
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(pv);
    return null;
}
function pd(d) { const o = {}; for (const [k, v] of Object.entries(d.fields || {})) o[k] = pv(v); return o; }

function toFS(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFS) } };
    if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFS(x); return { mapValue: { fields: f } }; }
    return { stringValue: String(v) };
}

(async () => {
    const apply = process.argv.includes('--apply');
    const token = await getAccessToken();

    // Pull all workouts for the user
    const r = await fetch(`${BASE_URL}/users/${USER_UID}:runQuery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: 'workouts' }],
                orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }],
            },
        }),
    });
    const docs = (await r.json()).filter(x => x.document).map(x => ({ docPath: x.document.name, ...pd(x.document) }));

    console.log(`\n${'='.repeat(80)}`);
    console.log(`  Mixed-session corrector — ${apply ? 'APPLY' : 'DRY RUN'}`);
    console.log(`${'='.repeat(80)}\n`);

    const changelog = { timestamp: new Date().toISOString(), user: { uid: USER_UID }, docs: [] };
    const docsByPath = new Map();
    let totalApplied = 0;

    for (const fix of FIXES) {
        const w = docs.find(d => d.date === fix.date);
        if (!w) { console.log(`  ✗ ${fix.date} — workout doc not found`); continue; }

        // Find the exercise key by resolved name
        let exKey = null;
        for (const [k, ex] of Object.entries(w.exercises || {})) {
            const name = w.exerciseNames?.[k] || ex?.machine || ex?.name || k;
            if (name === fix.exercise) { exKey = k; break; }
        }
        if (!exKey) { console.log(`  ✗ ${fix.date} ${fix.exercise} — exercise not found`); continue; }

        const ex = w.exercises[exKey];
        const set = ex?.sets?.[fix.setIdx];
        if (!set) { console.log(`  ✗ ${fix.date} ${fix.exercise} set ${fix.setIdx + 1} — set not found`); continue; }

        const before = { weight: set.weight, originalUnit: set.originalUnit || 'lbs' };
        if (before.weight === fix.newWeight && before.originalUnit === fix.newUnit) {
            console.log(`  • ${fix.date} ${fix.exercise} set ${fix.setIdx + 1} — already at target ${fix.newWeight} ${fix.newUnit}`);
            continue;
        }

        console.log(`  → ${fix.date} ${fix.exercise} set ${fix.setIdx + 1}: ${before.weight} ${before.originalUnit} → ${fix.newWeight} ${fix.newUnit}`);
        console.log(`      reason: ${fix.why}`);

        // Build/update the in-memory doc to apply
        if (!docsByPath.has(w.docPath)) docsByPath.set(w.docPath, JSON.parse(JSON.stringify(w)));
        const dCopy = docsByPath.get(w.docPath);
        dCopy.exercises[exKey].sets[fix.setIdx] = { ...set, weight: fix.newWeight, originalUnit: fix.newUnit };

        // Add to changelog (revert info)
        let docLog = changelog.docs.find(d => d.docPath === w.docPath);
        if (!docLog) {
            docLog = { docPath: w.docPath, date: w.date, workoutType: w.workoutType || '', changes: [] };
            changelog.docs.push(docLog);
        }
        docLog.changes.push({
            exerciseKey: exKey,
            exercise: fix.exercise,
            setIdx: fix.setIdx,
            // Revert payload: store BEFORE state so a revert can restore exactly.
            before,
            after: { weight: fix.newWeight, originalUnit: fix.newUnit },
        });
        totalApplied++;
    }

    console.log(`\n  ${totalApplied} sets ${apply ? 'will be' : 'would be'} fixed.`);

    if (!apply) {
        console.log('\n  Dry run only. Pass --apply to write.\n');
        return;
    }

    // Write each modified doc back via PATCH
    for (const [docPath, dCopy] of docsByPath) {
        const url = `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=exercises`;
        const body = JSON.stringify({ fields: { exercises: toFS(dCopy.exercises) } });
        const resp = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            console.error(`  ✗ ${dCopy.date}: ${resp.status} ${err.error?.message || ''}`);
            continue;
        }
        console.log(`  ✓ wrote ${dCopy.date}`);
    }

    changelog.totalDocs = changelog.docs.length;
    changelog.totalSets = totalApplied;
    const cdir = path.join(__dirname, 'changelogs');
    if (!fs.existsSync(cdir)) fs.mkdirSync(cdir);
    const out = path.join(cdir, `mixed-session-fix-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(out, JSON.stringify(changelog, null, 2));
    console.log(`\n  Changelog: ${out}`);
    console.log(`  (Manual revert: each entry has \`before\` + \`after\` so values can be restored.)\n`);
})().catch(err => { console.error('Error:', err.message || err); process.exit(1); });
