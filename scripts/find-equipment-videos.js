#!/usr/bin/env node
/**
 * One-shot: scan every place a form-video URL could live for
 * kevin.laperriere@gmail.com:
 *   - users/{uid}/equipment/{id}            — .video, .exerciseVideos, .videoUrl, .formVideo
 *   - users/{uid}/customExercises/{id}      — .video, .videoUrl
 *   - users/{uid}/exercises/{id}            — legacy collection
 *   - users/{uid}/workoutTemplates/{id}     — embedded exercise[].video
 *
 * Catches both current and legacy field names so nothing's invisible.
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
    if (!refreshToken) {
        console.error('No Firebase CLI credentials. Run: firebase login');
        process.exit(1);
    }
    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
    });
    const data = await resp.json();
    if (data.error) {
        console.error('Auth failed:', data.error_description || data.error);
        process.exit(1);
    }
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

async function listCollection(token, collectionPath) {
    const all = [];
    let pageToken;
    do {
        const url = `${BASE_URL}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await resp.json();
        if (json.documents) {
            for (const doc of json.documents) {
                const obj = { _path: doc.name };
                for (const [k, v] of Object.entries(doc.fields || {})) obj[k] = parseFirestoreValue(v);
                all.push(obj);
            }
        } else if (json.error) {
            console.error(`[${collectionPath}] ${json.error.message}`);
            return [];
        }
        pageToken = json.nextPageToken;
    } while (pageToken);
    return all;
}

const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;

function extractVideos(record) {
    const found = [];
    const candidateScalars = ['video', 'videoUrl', 'formVideo', 'video_url'];
    for (const k of candidateScalars) {
        if (isNonEmptyStr(record[k])) found.push({ field: k, value: record[k] });
    }
    if (record.exerciseVideos && typeof record.exerciseVideos === 'object') {
        for (const [exName, url] of Object.entries(record.exerciseVideos)) {
            if (isNonEmptyStr(url)) found.push({ field: `exerciseVideos.${exName}`, value: url });
        }
    }
    return found;
}

function nameFor(record) {
    return record.name || record.machine || record.exerciseName || record.title || '(no name)';
}

(async () => {
    const token = await getAccessToken();

    const collections = [
        { label: 'equipment',        path: `users/${UID}/equipment` },
        { label: 'customExercises',  path: `users/${UID}/customExercises` },
        { label: 'exercises',        path: `users/${UID}/exercises` },
    ];

    const grandTotal = { with: 0, total: 0 };

    for (const col of collections) {
        const records = await listCollection(token, col.path);
        const matching = records
            .map(r => ({ rec: r, videos: extractVideos(r) }))
            .filter(x => x.videos.length > 0);

        console.log(`\n${'='.repeat(80)}`);
        console.log(`  ${col.label} — ${matching.length} of ${records.length} have videos`);
        console.log(`${'='.repeat(80)}\n`);

        for (const { rec, videos } of matching) {
            const id = rec._path.split('/').pop();
            console.log(`• ${nameFor(rec)}`);
            console.log(`  id: ${id}`);
            for (const v of videos) {
                console.log(`  ${v.field}: ${v.value}`);
            }
            if (Array.isArray(rec.locations) && rec.locations.length > 0) {
                console.log(`  gyms: ${rec.locations.join(', ')}`);
            }
            console.log();
        }

        grandTotal.with += matching.length;
        grandTotal.total += records.length;
    }

    // Also scan workoutTemplates for embedded video URLs on exercises[]
    const templates = await listCollection(token, `users/${UID}/workoutTemplates`);
    let templateHits = 0;
    const templateMatches = [];
    for (const t of templates) {
        if (!Array.isArray(t.exercises)) continue;
        const exWithVideo = t.exercises.filter(ex =>
            ex && (isNonEmptyStr(ex.video) || isNonEmptyStr(ex.videoUrl) || isNonEmptyStr(ex.formVideo))
        );
        if (exWithVideo.length > 0) {
            templateMatches.push({ template: t, hits: exWithVideo });
            templateHits += exWithVideo.length;
        }
    }
    console.log(`\n${'='.repeat(80)}`);
    console.log(`  workoutTemplates — ${templateMatches.length} templates carry ${templateHits} exercise videos`);
    console.log(`${'='.repeat(80)}\n`);
    for (const { template, hits } of templateMatches) {
        console.log(`• template: ${template.name || template._path.split('/').pop()}`);
        for (const ex of hits) {
            const url = ex.video || ex.videoUrl || ex.formVideo;
            console.log(`  ${nameFor(ex)} → ${url}`);
        }
        console.log();
    }

    console.log(`\nGrand total across user equipment/exercises: ${grandTotal.with} of ${grandTotal.total}`);
})().catch(err => {
    console.error('Error:', err.message || err);
    process.exit(1);
});
