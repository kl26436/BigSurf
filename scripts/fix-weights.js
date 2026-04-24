#!/usr/bin/env node
/**
 * Fix mis-tagged kg sets → flip originalUnit from 'kg' to 'lbs' (value unchanged)
 * on exercises where the kg tag is known to be wrong.
 *
 * The list of "confident-to-auto-fix" exercises is below. Exercises where the
 * kg tag might be legitimate (Panatta leg curl/extension, gym80 curl, Arsenal
 * lat raise) are intentionally excluded — those need a manual review.
 *
 * Usage:
 *   node scripts/fix-weights.js                 # DRY RUN — show proposed changes
 *   node scripts/fix-weights.js --apply         # actually write to Firestore
 *   node scripts/fix-weights.js --user <uid>    # single user
 *   node scripts/fix-weights.js --also <name>   # add an exercise to the fix list
 *
 * Auth: Firebase CLI stored credentials.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'workout-tracker-b94b6';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// Exercises where every kg-tagged set is known-bad (kg tag was the bug, value
// is actually lb). Based on the audit: each of these has a large lb-tagged
// progression and only a handful of kg-tagged sets clustered in Aug–Sep 2025.
const AUTO_FIX_EXERCISES = new Set([
    'Reverse Pec Deck',
    'Seated Chest Press',
    'Shoulder Press Machine',
    'Machine Crunch',
    'Hanging Leg Raise',
    'Seated Row Machine',
    'Hip Abduction Machine',
    'Calf Raise Machine',
    'Seated Leg Curl Machine',
]);

async function getAccessToken() {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    let refreshToken;
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        refreshToken = config.tokens?.refresh_token;
    } catch (_) {}
    if (!refreshToken) {
        console.error('No Firebase CLI credentials found. Run: npx firebase login');
        process.exit(1);
    }
    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
    });
    const data = await resp.json();
    if (data.error) { console.error('Auth failed:', data.error_description || data.error); process.exit(1); }
    return data.access_token;
}

function parseValue(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return parseInt(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) {
        const obj = {};
        for (const [k, val] of Object.entries(v.mapValue.fields || {})) obj[k] = parseValue(val);
        return obj;
    }
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseValue);
    return null;
}
function parseDoc(doc) { const o = {}; for (const [k, v] of Object.entries(doc.fields || {})) o[k] = parseValue(v); return o; }

async function listUserIds(token) {
    const resp = await fetch(`${BASE_URL}:runQuery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: 'errorLogs' }],
                orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
                limit: 500,
            },
        }),
    });
    const results = await resp.json();
    if (results.error) throw new Error(results.error.message);
    const seen = new Map();
    for (const r of results) {
        if (!r.document) continue;
        const f = parseDoc(r.document);
        if (f.userId && !seen.has(f.userId)) seen.set(f.userId, f.userEmail || '(unknown)');
    }
    return [...seen.entries()].map(([uid, email]) => ({ uid, email }));
}

async function listWorkouts(token, uid) {
    const resp = await fetch(`${BASE_URL}/users/${uid}:runQuery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: 'workouts' }],
                orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }],
            },
        }),
    });
    const results = await resp.json();
    if (results.error) throw new Error(results.error.message);
    return results.filter(r => r.document).map(r => ({
        docPath: r.document.name,
        docId: r.document.name.split('/').pop(),
        raw: r.document,
        ...parseDoc(r.document),
    }));
}

// Convert a JS value back to Firestore Value JSON.
function toFS(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
        if (Number.isInteger(v)) return { integerValue: String(v) };
        return { doubleValue: v };
    }
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFS) } };
    if (typeof v === 'object') {
        const fields = {};
        for (const [k, val] of Object.entries(v)) fields[k] = toFS(val);
        return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
}

function planFixes(workouts, targetExercises) {
    const plan = [];
    for (const w of workouts) {
        if (!w.exercises || typeof w.exercises !== 'object') continue;
        const entries = Object.entries(w.exercises);
        let docChanged = false;
        const updatedExercises = { ...w.exercises };
        const changesInDoc = [];

        for (const [exKey, ex] of entries) {
            if (!ex || !Array.isArray(ex.sets)) continue;
            const exName = w.exerciseNames?.[exKey] || ex.machine || ex.name || exKey;
            if (!targetExercises.has(exName)) continue;

            let exChanged = false;
            const newSets = ex.sets.map((set, setIdx) => {
                if (!set || set.originalUnit !== 'kg' || set.isBodyweight) return set;
                exChanged = true;
                docChanged = true;
                changesInDoc.push({ exercise: exName, setIdx, weight: set.weight, reps: set.reps });
                return { ...set, originalUnit: 'lbs' };
            });
            if (exChanged) {
                updatedExercises[exKey] = { ...ex, sets: newSets };
            }
        }

        if (docChanged) {
            plan.push({
                docId: w.docId,
                docPath: w.docPath,
                date: w.date || '',
                workoutType: w.workoutType || '',
                changes: changesInDoc,
                updatedExercises,
            });
        }
    }
    return plan;
}

async function applyUpdate(token, docPath, updatedExercises) {
    // PATCH the exercises field only. updateMask=exercises
    const body = {
        fields: { exercises: toFS(updatedExercises) },
    };
    const url = `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=exercises`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(`Update failed: ${resp.status} ${err.error?.message || ''}`);
    }
}

// CLI
const args = process.argv.slice(2);
function getArg(name) {
    const i = args.indexOf(name);
    if (i >= 0 && i + 1 < args.length && !args[i + 1].startsWith('--')) return args[i + 1];
    return null;
}

(async () => {
    try {
        const apply = args.includes('--apply');
        const uidArg = getArg('--user');
        const alsoArg = getArg('--also');

        const targetExercises = new Set(AUTO_FIX_EXERCISES);
        if (alsoArg) targetExercises.add(alsoArg);

        const token = await getAccessToken();
        const users = uidArg ? [{ uid: uidArg, email: '(specified)' }] : await listUserIds(token);
        if (users.length === 0) { console.log('No users found.'); return; }

        console.log(`\n${'='.repeat(80)}`);
        console.log(`  Weight corrector — ${apply ? 'APPLY MODE' : 'DRY RUN (pass --apply to write)'}`);
        console.log(`  Target exercises: ${[...targetExercises].join(', ')}`);
        console.log(`${'='.repeat(80)}\n`);

        for (const u of users) {
            console.log(`\n--- ${u.email} (${u.uid}) ---`);
            const workouts = await listWorkouts(token, u.uid);
            const plan = planFixes(workouts, targetExercises);

            if (plan.length === 0) { console.log('  No fixes needed.'); continue; }

            let totalSets = 0;
            for (const p of plan) {
                console.log(`\n  [${p.date}] ${p.workoutType} — ${p.changes.length} sets`);
                for (const c of p.changes) {
                    console.log(`    ${c.exercise} set ${c.setIdx + 1}:  ${c.weight} kg  →  ${c.weight} lb  (${c.reps ?? '?'} reps)`);
                }
                totalSets += p.changes.length;
            }
            console.log(`\n  ${plan.length} docs, ${totalSets} sets to fix.`);

            if (apply) {
                console.log('\n  Applying...');
                for (const p of plan) {
                    await applyUpdate(token, p.docPath, p.updatedExercises);
                    process.stdout.write('.');
                }
                console.log(' done.');
            }
        }
        console.log();
    } catch (err) {
        console.error('Error:', err.message || err);
        process.exit(1);
    }
})();
