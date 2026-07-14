#!/usr/bin/env node
/**
 * Pull recent errorLogs entries (default: past 24h) and print them
 * grouped by source, most recent first.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'workout-tracker-b94b6';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const HOURS_BACK = parseInt(process.argv[2] || '24', 10);
const SINCE = new Date(Date.now() - HOURS_BACK * 3600 * 1000).toISOString();

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

(async () => {
    const token = await getAccessToken();
    const all = [];
    let pageToken;
    do {
        const url = `${BASE_URL}/errorLogs?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await resp.json();
        if (json.documents) {
            for (const d of json.documents) {
                const obj = { _id: d.name.split('/').pop() };
                for (const [k, v] of Object.entries(d.fields || {})) obj[k] = parseFirestoreValue(v);
                all.push(obj);
            }
        } else if (json.error) { console.error(json.error.message); return; }
        pageToken = json.nextPageToken;
    } while (pageToken);

    const recent = all
        .filter(e => (e.timestamp || '') >= SINCE)
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    console.log(`\nerrorLogs since ${SINCE}: ${recent.length} entries (of ${all.length} total)\n`);

    // Group by source + message pattern
    const groups = new Map();
    for (const e of recent) {
        const key = `${e.source || '(no source)'} :: ${(e.message || '').slice(0, 120)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    }

    // Sort groups by most-recent timestamp desc
    const sorted = [...groups.entries()].sort((a, b) => {
        const at = a[1][0].timestamp || '';
        const bt = b[1][0].timestamp || '';
        return bt.localeCompare(at);
    });

    for (const [key, entries] of sorted) {
        console.log('='.repeat(80));
        console.log(`[${entries.length}x] ${key}`);
        console.log(`   latest:   ${entries[0].timestamp}`);
        console.log(`   earliest: ${entries[entries.length - 1].timestamp}`);
        console.log(`   severity: ${entries[0].severity || '(none)'}`);
        console.log(`   url:      ${entries[0].url || '(none)'}`);
        if (entries[0].stack) {
            console.log(`   stack:\n     ${(entries[0].stack || '').split('\n').slice(0, 6).join('\n     ')}`);
        }
        if (entries[0].context) {
            const ctxStr = JSON.stringify(entries[0].context, null, 2);
            console.log(`   context:\n     ${ctxStr.split('\n').join('\n     ')}`);
        }
        console.log();
    }
})().catch(err => { console.error(err); process.exit(1); });
