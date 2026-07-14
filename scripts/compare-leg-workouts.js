#!/usr/bin/env node
/**
 * Diagnostic: dump the user's leg-day workouts from 2026-06-29 through
 * 2026-07-08 and print exercise names + equipment side by side so we can
 * see why last week's numbers didn't autofill into last night's session.
 *
 * getLastSessionDefaults matches strictly on exerciseName (===) with a
 * limit(30) window, so we care about:
 *   - the exact exercise name string in each workout
 *   - the equipment string  (tiered fallback, but same-equipment is preferred)
 *   - the exerciseNames map (workout-level auth for name)
 *   - originalWorkout.exercises[idx].machine (fallback)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'workout-tracker-b94b6';
const UID = 'YpB4kgun28TD3eSBAR8QYfkK4a13';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const START_DATE = '2026-06-29';
const END_DATE   = '2026-07-08';

async function getAccessToken() {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const refreshToken = config.tokens?.refresh_token;
    if (!refreshToken) { console.error('No creds'); process.exit(1); }
    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
    });
    const data = await resp.json();
    if (data.error) { console.error('Auth failed:', data.error_description || data.error); process.exit(1); }
    return data.access_token;
}
function parseFirestoreValue(val) {
    if (!val) return null;
    if ('stringValue' in val) return val.stringValue;
    if ('integerValue' in val) return parseInt(val.integerValue);
    if ('doubleValue' in val) return val.doubleValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('nullValue' in val) return null;
    if ('mapValue' in val) {
        const obj = {};
        for (const [k, v] of Object.entries(val.mapValue.fields || {})) obj[k] = parseFirestoreValue(v);
        return obj;
    }
    if ('arrayValue' in val) return (val.arrayValue.values || []).map(parseFirestoreValue);
    return String(Object.values(val)[0]);
}

async function listWorkouts(token) {
    const all = [];
    let pageToken;
    do {
        const url = `${BASE_URL}/users/${UID}/workouts?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await resp.json();
        if (json.documents) {
            for (const d of json.documents) {
                const obj = { _id: d.name.split('/').pop() };
                for (const [k, v] of Object.entries(d.fields || {})) obj[k] = parseFirestoreValue(v);
                all.push(obj);
            }
        } else if (json.error) { console.error(json.error.message); return []; }
        pageToken = json.nextPageToken;
    } while (pageToken);
    return all;
}

function fmtStr(s) {
    if (s == null) return '<null>';
    return JSON.stringify(String(s));
}

(async () => {
    const token = await getAccessToken();
    const all = await listWorkouts(token);

    // Filter to the diagnostic window.
    const window = all
        .filter(w => w.date >= START_DATE && w.date <= END_DATE)
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.completedAt || '').localeCompare(b.completedAt || ''));

    console.log(`\nWorkouts ${START_DATE} → ${END_DATE}: ${window.length}\n`);

    for (const w of window) {
        console.log('='.repeat(80));
        console.log(`${w.date}  ·  ${w.workoutType || '(no workoutType)'}  ·  id=${w._id}`);
        console.log(`   completedAt: ${w.completedAt || '(none)'}${w.cancelledAt ? '  CANCELLED' : ''}`);
        console.log(`   location:    ${typeof w.location === 'object' ? w.location?.name : w.location || '(none)'}`);
        console.log(`   templateId:  ${w.templateId || '(none)'}`);
        console.log(`   version:     ${w.version || '?'}`);

        const exNames = w.exerciseNames || {};
        const exercises = w.exercises || {};
        const origEx = w.originalWorkout?.exercises || [];

        const keys = Object.keys(exercises).sort((a, b) => {
            const ai = parseInt(a.split('_')[1], 10);
            const bi = parseInt(b.split('_')[1], 10);
            return (isNaN(ai) ? 0 : ai) - (isNaN(bi) ? 0 : bi);
        });

        for (const key of keys) {
            const idx = parseInt(key.split('_')[1], 10);
            const ex = exercises[key] || {};
            const orig = origEx[idx] || {};

            // The three places exercise name can live — this matches the
            // resolution order in getLastSessionDefaults.
            const resolvedName = exNames[key] || orig.machine || ex.name || null;

            const sets = (ex.sets || []).filter(s => s && (s.reps || s.weight));
            const setSummary = sets.length === 0
                ? '(no sets)'
                : sets.slice(0, 4).map(s => `${s.reps || '?'}×${s.weight || '?'}${s.originalUnit ? ` ${s.originalUnit}` : ''}`).join(' · ')
                    + (sets.length > 4 ? ` … +${sets.length - 4}` : '');

            console.log(`   ${key}`);
            console.log(`     resolvedName:            ${fmtStr(resolvedName)}`);
            console.log(`     exerciseNames[${key}]:    ${fmtStr(exNames[key])}`);
            console.log(`     originalWorkout.machine: ${fmtStr(orig.machine)}`);
            console.log(`     originalWorkout.name:    ${fmtStr(orig.name)}`);
            console.log(`     ex.name / ex.machine:    ${fmtStr(ex.name)} / ${fmtStr(ex.machine)}`);
            console.log(`     equipment:               ${fmtStr(ex.equipment)}`);
            console.log(`     originalWorkout.equipment: ${fmtStr(orig.equipment)}`);
            console.log(`     sets:                    ${setSummary}`);
        }
        console.log();
    }

    // Second pass: build a "name → dates where it appeared" map so we can
    // see at-a-glance whether same-name matches would have hit.
    console.log('\n' + '='.repeat(80));
    console.log('Exercise-name reuse across window (from resolvedName)');
    console.log('='.repeat(80) + '\n');
    const nameMap = new Map();
    for (const w of window) {
        const exNames = w.exerciseNames || {};
        const exercises = w.exercises || {};
        const origEx = w.originalWorkout?.exercises || [];
        for (const key of Object.keys(exercises)) {
            const idx = parseInt(key.split('_')[1], 10);
            const orig = origEx[idx] || {};
            const ex = exercises[key] || {};
            const name = exNames[key] || orig.machine || ex.name || null;
            if (!name) continue;
            if (!nameMap.has(name)) nameMap.set(name, []);
            nameMap.get(name).push({ date: w.date, workoutType: w.workoutType, equipment: ex.equipment });
        }
    }
    const sorted = [...nameMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, uses] of sorted) {
        console.log(`${fmtStr(name)}`);
        for (const u of uses) {
            console.log(`   ${u.date}  ${u.workoutType || '(no type)'}  equip=${fmtStr(u.equipment)}`);
        }
    }
})().catch(err => { console.error(err); process.exit(1); });
