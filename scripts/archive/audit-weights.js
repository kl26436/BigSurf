#!/usr/bin/env node
/**
 * Scan workouts for sets whose weight + originalUnit likely got out of sync
 * due to the pre-fix unit-toggle bug.
 *
 * Usage:
 *   node scripts/audit-weights.js                # last 30 days
 *   node scripts/audit-weights.js --days 90      # adjust window
 *   node scripts/audit-weights.js --all          # all time
 *   node scripts/audit-weights.js --user <uid>   # single user (skip listing)
 *   node scripts/audit-weights.js --json         # machine-readable output
 *
 * Auth: Firebase CLI stored credentials (npx firebase login).
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

function parseDoc(doc) {
    const out = {};
    for (const [k, v] of Object.entries(doc.fields || {})) out[k] = parseValue(v);
    return out;
}

// Users docs aren't created in Firestore (only their subcollections), so
// GET /users returns empty. Discover UIDs from errorLogs, which records
// userId + userEmail on every entry.
async function listUsers(token) {
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
        const fields = parseDoc(r.document);
        const uid = fields.userId;
        if (uid && !seen.has(uid)) seen.set(uid, fields.userEmail || '(unknown)');
    }
    return [...seen.entries()].map(([uid, email]) => ({ uid, email }));
}

async function listWorkouts(token, uid, { sinceDate, untilDate } = {}) {
    const filters = [];
    if (sinceDate) filters.push({ fieldFilter: { field: { fieldPath: 'date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: sinceDate } } });
    if (untilDate) filters.push({ fieldFilter: { field: { fieldPath: 'date' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: untilDate } } });

    const structuredQuery = {
        from: [{ collectionId: 'workouts' }],
        orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }],
    };
    if (filters.length === 1) structuredQuery.where = filters[0];
    if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters } };

    const resp = await fetch(`${BASE_URL}/users/${uid}:runQuery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery }),
    });
    const results = await resp.json();
    if (results.error) throw new Error(results.error.message);
    return results
        .filter(r => r.document)
        .map(r => ({ docId: r.document.name.split('/').pop(), ...parseDoc(r.document) }));
}

// Detection heuristics for suspect weights.
// The pre-fix bug stored a kg-converted value (e.g. 154.3) with
// originalUnit='kg', which history then re-converted to 339 lbs. Signals:
//   - A non-round decimal whose × 2.20462 back-convert is a clean round number
//     (e.g. 68.1 → 150.1; 31.8 → 70.1) is probably a converted value mis-tagged
//   - A value ≥ 200 with originalUnit='kg' is very heavy — flag for review
//   - A fractional .3 / .7 / .9 weight is often a conversion artifact
function classify(set) {
    if (!set || typeof set.weight !== 'number' || set.weight <= 0) return null;
    // Bodyweight exercises store total = bodyweight + added. Bodyweight is
    // typically a converted kg→lb value (e.g. 73 kg → 162.3 lb), so the
    // fractional decimal is expected — not a bug signal.
    if (set.isBodyweight) return null;

    const w = set.weight;
    const unit = set.originalUnit || 'lbs';

    const reasons = [];
    const forwardKgToLb = Math.round(w * 2.20462 * 10) / 10;
    const forwardLbToKg = Math.round(w * 0.453592 * 10) / 10;

    // Fractional decimals that almost always come from unit conversion (users
    // don't type .3 or .7). .5 is excluded because that's a legit plate increment.
    const decimals = Math.round((w - Math.floor(w)) * 10);
    const looksLikeConversion = decimals === 3 || decimals === 7 || decimals === 4 || decimals === 6;

    // Integer kg values above 100 are worth eyeballing. Most gym exercises
    // (isolation, cable, single-arm) rarely exceed 100 kg; compound lifts
    // (squat, deadlift) can — but it's still worth showing them so the user
    // can confirm they actually lifted that much.
    if (unit === 'kg' && w >= 100) {
        reasons.push(`kg ≥ 100 (displays as ${forwardKgToLb} lb) — confirm this is correct`);
    }
    if (unit === 'kg' && looksLikeConversion && w > 40) {
        // kg values users type are almost always integers or .5. A .3/.7 decimal
        // strongly suggests the value is actually lbs that got mis-tagged as kg.
        reasons.push(`kg value ending .${decimals} — likely lb mis-tagged as kg (true lb: ${w}, ≈${forwardLbToKg} kg)`);
    }
    if (unit === 'lbs' && w > 0 && w < 10 && !Number.isInteger(w) && decimals !== 5) {
        reasons.push(`very light lb with fractional — possibly kg value mis-tagged (true kg: ${w})`);
    }
    if (looksLikeConversion && w > 20 && unit === 'lbs') {
        // A .3/.7 decimal in lbs is less damning on its own (could be bodyweight
        // residue, cable fractional, etc.) but still worth a look.
        reasons.push(`fractional .${decimals} in lb is typical of a conversion artifact`);
    }
    return reasons.length ? { weight: w, unit, reps: set.reps, reasons } : null;
}

function fmtWorkout(w) {
    const date = w.date || w.startedAt?.slice(0, 10) || '?';
    const name = w.workoutType || 'Workout';
    return `${date} — ${name}`;
}

async function audit(token, uid, { days, all }) {
    let sinceDate;
    if (!all) {
        const d = new Date();
        d.setDate(d.getDate() - (days ?? 30));
        sinceDate = d.toISOString().slice(0, 10);
    }
    const workouts = await listWorkouts(token, uid, { sinceDate });

    const flagged = [];
    const perExercise = new Map();
    for (const w of workouts) {
        if (!w.exercises) continue;
        const exercises = typeof w.exercises === 'object' ? w.exercises : {};
        for (const [exKey, ex] of Object.entries(exercises)) {
            if (!ex || !Array.isArray(ex.sets)) continue;
            const exName = w.exerciseNames?.[exKey] || ex.machine || ex.name || exKey;
            ex.sets.forEach((set, setIdx) => {
                if (!set || set.isBodyweight || typeof set.weight !== 'number' || set.weight <= 0) return;

                const entry = {
                    date: w.date || '',
                    workout: w.workoutType || '',
                    exercise: exName,
                    setIdx,
                    weight: set.weight,
                    unit: set.originalUnit || 'lbs',
                    reps: set.reps,
                    docId: w.docId,
                };
                if (!perExercise.has(exName)) perExercise.set(exName, []);
                perExercise.get(exName).push(entry);

                const r = classify(set);
                if (r) flagged.push({ ...entry, ...r });
            });
        }
    }
    return { totalWorkouts: workouts.length, flagged, perExercise };
}

const args = process.argv.slice(2);
function getArg(name) {
    const i = args.indexOf(name);
    if (i >= 0 && i + 1 < args.length && !args[i + 1].startsWith('--')) return args[i + 1];
    return null;
}

(async () => {
    try {
        const token = await getAccessToken();
        const asJson = args.includes('--json');
        const all = args.includes('--all');
        const daysArg = getArg('--days');
        const days = daysArg ? parseInt(daysArg, 10) : 30;
        const userArg = getArg('--user');

        let users;
        if (userArg) {
            users = [{ uid: userArg, email: '(specified)' }];
        } else {
            users = await listUsers(token);
            if (users.length === 0) {
                console.log('No users found.');
                return;
            }
        }

        const allReports = [];
        for (const u of users) {
            const r = await audit(token, u.uid, { days, all });
            allReports.push({ user: u, ...r });
        }

        if (asJson) {
            console.log(JSON.stringify(allReports, null, 2));
            return;
        }

        const scope = all ? 'all time' : `last ${days} days`;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`  Weight audit — ${scope}`);
        console.log(`${'='.repeat(80)}\n`);

        const showAll = args.includes('--by-exercise');
        const summary = args.includes('--summary');

        if (summary) {
            for (const report of allReports) {
                const tag = `${report.user.email} (${report.user.uid})`;
                console.log(`\n--- ${tag} ---`);
                console.log(`  ${report.totalWorkouts} workouts scanned\n`);

                const kgOnly = [];
                const lbOnly = [];
                const mixed = [];
                for (const [name, entries] of report.perExercise) {
                    const units = new Set(entries.map(e => e.unit));
                    const kgCount = entries.filter(e => e.unit === 'kg').length;
                    const lbCount = entries.filter(e => e.unit === 'lbs').length;
                    const kgDates = entries.filter(e => e.unit === 'kg').map(e => e.date);
                    const firstKg = kgDates.sort()[0];
                    const lastKg = kgDates.sort().slice(-1)[0];
                    const info = { name, kgCount, lbCount, firstKg, lastKg };
                    if (units.has('kg') && units.has('lbs')) mixed.push(info);
                    else if (units.has('kg')) kgOnly.push(info);
                    else lbOnly.push(info);
                }

                console.log(`  MIXED (kg and lb tags) — most likely corrupted:\n`);
                mixed.sort((a, b) => b.kgCount - a.kgCount).forEach(e => {
                    console.log(`    ${e.name.padEnd(40)}  ${String(e.kgCount).padStart(3)} kg / ${String(e.lbCount).padStart(3)} lb  (kg span: ${e.firstKg} → ${e.lastKg})`);
                });

                console.log(`\n  KG-ONLY — confirm these are real kg lifts:\n`);
                kgOnly.sort((a, b) => b.kgCount - a.kgCount).forEach(e => {
                    console.log(`    ${e.name.padEnd(40)}  ${String(e.kgCount).padStart(3)} kg  (${e.firstKg} → ${e.lastKg})`);
                });

                console.log(`\n  LB-ONLY — likely fine (${lbOnly.length} exercises, not listed)`);
            }
            console.log();
            return;
        }

        for (const report of allReports) {
            const tag = `${report.user.email} (${report.user.uid})`;
            console.log(`\n--- ${tag} ---`);
            console.log(`  ${report.totalWorkouts} workouts scanned`);

            if (showAll) {
                // Progression view: per-exercise, sorted by date, showing both
                // unit interpretations. User can eyeball which ones are wrong.
                const names = [...report.perExercise.keys()].sort();
                for (const name of names) {
                    const entries = report.perExercise.get(name)
                        .slice()
                        .sort((a, b) => a.date.localeCompare(b.date));
                    const hasKg = entries.some(e => e.unit === 'kg');
                    if (!hasKg) continue; // only show exercises with kg-tagged data

                    console.log(`\n  === ${name} ===`);
                    for (const e of entries) {
                        const kg = e.unit === 'kg' ? e.weight : Math.round(e.weight * 0.453592 * 10) / 10;
                        const lb = e.unit === 'lbs' ? e.weight : Math.round(e.weight * 2.20462 * 10) / 10;
                        const storedTag = e.unit === 'kg' ? '⚠️ kg' : 'lb';
                        console.log(`    ${e.date} set ${e.setIdx + 1}: stored ${e.weight} ${storedTag}  →  ${kg} kg / ${lb} lb${e.reps ? ` × ${e.reps}` : ''}`);
                    }
                }
                continue;
            }

            console.log(`  ${report.flagged.length} flagged sets (run with --by-exercise for full progression)`);
            if (report.flagged.length === 0) continue;
            for (const f of report.flagged) {
                console.log(`\n  [${f.date}] ${f.exercise}  (set ${f.setIdx + 1})`);
                console.log(`    stored: ${f.weight} ${f.unit}${f.reps ? ` × ${f.reps} reps` : ''}`);
                for (const reason of f.reasons) console.log(`    • ${reason}`);
                console.log(`    doc:  users/${report.user.uid}/workouts/${f.docId}`);
            }
        }
        console.log();
    } catch (err) {
        console.error('Error:', err.message || err);
        process.exit(1);
    }
})();
