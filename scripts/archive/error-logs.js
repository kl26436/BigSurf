#!/usr/bin/env node
/**
 * CLI tool to pull and manage error logs from Firestore.
 *
 * Usage:
 *   node scripts/error-logs.js              # List recent errors
 *   node scripts/error-logs.js --all        # List all errors
 *   node scripts/error-logs.js --bugs       # Show only user bug reports
 *   node scripts/error-logs.js --clear      # Delete all error logs
 *   node scripts/error-logs.js --clear-old  # Delete errors older than 7 days
 *
 * Auth: uses Firebase CLI stored credentials automatically (npx firebase login)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ID = 'workout-tracker-b94b6';
const COLLECTION = 'errorLogs';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Firebase CLI OAuth client credentials (public, same as firebase-tools uses)
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

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
        for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
            obj[k] = parseFirestoreValue(v);
        }
        return obj;
    }
    if ('arrayValue' in val) {
        return (val.arrayValue.values || []).map(parseFirestoreValue);
    }
    return String(Object.values(val)[0]);
}

function parseDoc(doc) {
    const fields = doc.fields || {};
    const obj = {};
    for (const [k, v] of Object.entries(fields)) {
        obj[k] = parseFirestoreValue(v);
    }
    obj._docPath = doc.name;
    return obj;
}

async function runQuery(token, { bugsOnly = false, limitCount = 50, all = false } = {}) {
    const structuredQuery = {
        from: [{ collectionId: COLLECTION }],
        orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
    };
    if (!all) {
        structuredQuery.limit = limitCount;
    }

    const resp = await fetch(`${BASE_URL}:runQuery`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ structuredQuery }),
    });
    const results = await resp.json();
    if (results.error) {
        throw new Error(results.error.message);
    }

    return results
        .filter(r => r.document)
        .map(r => parseDoc(r.document));
}

async function deleteDocument(token, docPath) {
    await fetch(`https://firestore.googleapis.com/v1/${docPath}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
    });
}

async function listErrors(token, { all = false, bugsOnly = false } = {}) {
    const docs = await runQuery(token, { all, bugsOnly });

    const filtered = bugsOnly
        ? docs.filter(e => e.source === 'user-bug-report')
        : docs;

    if (filtered.length === 0) {
        console.log('No error logs found.');
        return;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`  ${filtered.length} error log(s)`);
    console.log(`${'='.repeat(80)}\n`);

    for (const e of filtered) {
        const isBug = e.source === 'user-bug-report';
        const severity = (e.severity || 'error').toUpperCase();
        const time = e.timestamp || 'unknown';
        const user = e.userEmail || e.userId || 'unknown';
        const ctx = e.context || {};
        const page = ctx.activePage || '';
        const desc = ctx.description || '';

        console.log(`[${severity}] ${time}`);
        if (isBug) {
            console.log(`  BUG REPORT: ${desc || e.message}`);
        } else {
            console.log(`  ${e.message}`);
        }
        console.log(`  User: ${user} | Page: ${page} | Source: ${e.source || 'unknown'}`);
        if (ctx.workoutType) {
            console.log(`  Workout: ${ctx.workoutType} (${ctx.completedSets || 0} sets done)`);
        }
        if (e.stack && !isBug) {
            console.log(`  Stack: ${e.stack.split('\n')[0]}`);
        }
        console.log();
    }
}

async function clearErrors(token, { olderThanDays = null } = {}) {
    const docs = await runQuery(token, { all: true });

    let toDelete = docs;
    if (olderThanDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - olderThanDays);
        toDelete = docs.filter(e => new Date(e.timestamp) < cutoff);
    }

    if (toDelete.length === 0) {
        console.log('No errors to delete.');
        return;
    }

    for (const doc of toDelete) {
        await deleteDocument(token, doc._docPath);
    }
    console.log(`Deleted ${toDelete.length} error log(s).`);
}

// Parse CLI args and run
const args = process.argv.slice(2);
const flags = new Set(args);

(async () => {
    try {
        const token = await getAccessToken();

        if (flags.has('--clear')) {
            await clearErrors(token);
        } else if (flags.has('--clear-old')) {
            await clearErrors(token, { olderThanDays: 7 });
        } else {
            await listErrors(token, {
                all: flags.has('--all'),
                bugsOnly: flags.has('--bugs'),
            });
        }
    } catch (err) {
        console.error('Error:', err.message || err);
    }
    process.exit(0);
})();
