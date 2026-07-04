#!/usr/bin/env node
/**
 * One-shot: dump the full context object for detector-source warnings so we
 * can see which sheet/input triggered them. errorLogs list output truncates
 * the context; this pulls the full doc.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'workout-tracker-b94b6';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

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
    const detectorSources = new Set([
        'installKeyboardAwareFocusHandler',
        'loadAutofillForExercise',
        'toggleMoreMenu',
        'gatherGymEquipment',
    ]);
    let pageToken;
    do {
        const url = `${BASE_URL}/errorLogs?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await resp.json();
        if (json.documents) {
            for (const d of json.documents) {
                const obj = {};
                for (const [k, v] of Object.entries(d.fields || {})) obj[k] = parseFirestoreValue(v);
                if (!detectorSources.has(obj.source)) continue;
                console.log('\n===', obj.timestamp || d.name.split('/').pop(), '===');
                console.log('source:  ', obj.source);
                console.log('message: ', obj.message);
                console.log('context: ', JSON.stringify(obj.context, null, 2));
            }
        }
        pageToken = json.nextPageToken;
    } while (pageToken);
})().catch(err => { console.error(err); process.exit(1); });
