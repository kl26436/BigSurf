#!/usr/bin/env node
/**
 * One-shot: scan the user's workouts + templates for name/day/workoutType
 * fields that literally equal the string "undefined". User reported the
 * dashboard rendering `"undefined"` as a workout name — since escapeHtml()
 * of the JS undefined would render '', the source is likely a stored
 * literal from an interpolation-as-string bug at save time.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'workout-tracker-b94b6';
const UID = 'YpB4kgun28TD3eSBAR8QYfkK4a13';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

async function getAccessToken() {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const refreshToken = config.tokens?.refresh_token;
    if (!refreshToken) { console.error('No Firebase CLI credentials. Run: firebase login'); process.exit(1); }
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

async function listCollection(token, colPath) {
    const all = [];
    let pageToken;
    do {
        const url = `${BASE_URL}/${colPath}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await resp.json();
        if (json.documents) {
            for (const doc of json.documents) {
                const obj = { _path: doc.name };
                for (const [k, v] of Object.entries(doc.fields || {})) obj[k] = parseFirestoreValue(v);
                all.push(obj);
            }
        } else if (json.error) { console.error(`[${colPath}]`, json.error.message); return []; }
        pageToken = json.nextPageToken;
    } while (pageToken);
    return all;
}

const NAMEISH = ['name', 'day', 'workoutType', 'title'];
const isUndef = (v) => v === 'undefined' || v === 'null' || v === '' || v == null;
const isLiteralUndef = (v) => v === 'undefined' || v === 'null';

(async () => {
    const token = await getAccessToken();
    const collections = [
        { label: 'workouts',          path: `users/${UID}/workouts` },
        { label: 'workoutTemplates',  path: `users/${UID}/workoutTemplates` },
    ];

    for (const col of collections) {
        const records = await listCollection(token, col.path);
        const hits = records.filter(r => NAMEISH.some(k => isLiteralUndef(r[k])));
        const missing = records.filter(r => !hits.includes(r) && NAMEISH.every(k => !r[k] || r[k] === ''));

        console.log(`\n${'='.repeat(80)}`);
        console.log(`  ${col.label} — ${records.length} total`);
        console.log(`  ${hits.length} with literal "undefined"/"null" in name/day/workoutType/title`);
        console.log(`  ${missing.length} with ALL name/day/workoutType/title missing`);
        console.log(`${'='.repeat(80)}\n`);

        for (const r of hits) {
            const id = r._path.split('/').pop();
            console.log(`• ${col.label}/${id}`);
            for (const k of NAMEISH) if (r[k] != null) console.log(`  ${k}: ${JSON.stringify(r[k])}`);
            if (r.date) console.log(`  date: ${r.date}`);
            if (r.completedAt) console.log(`  completedAt: ${r.completedAt}`);
            console.log();
        }
        for (const r of missing.slice(0, 5)) {
            const id = r._path.split('/').pop();
            console.log(`• ${col.label}/${id}  (ALL name fields empty/missing)`);
            for (const k of NAMEISH) console.log(`  ${k}: ${JSON.stringify(r[k] ?? '(missing)')}`);
            if (r.date) console.log(`  date: ${r.date}`);
            console.log();
        }
        if (missing.length > 5) console.log(`  … +${missing.length - 5} more with all-missing name fields`);
    }
})().catch(err => { console.error('Error:', err.message || err); process.exit(1); });
