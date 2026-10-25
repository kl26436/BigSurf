#!/usr/bin/env node
// Export recent coach traces (AP-20a) for one user as readable files.
//
//   node scripts/export-traces.mjs kevin.laperriere@gmail.com [count=3] [threadId]
//
// Needs the same service-account key as backup-user-data.mjs:
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"   # PowerShell
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json    # bash
//
// Writes backups/traces/<createdAt>_<threadId>_t<turn>.json (the raw doc) and
// a .md next to it with the block, tool calls and answer laid out for reading
// — the Lesson 5.2 walk-through, one file per turn. Newest first.

import admin from 'firebase-admin';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ID = 'workout-tracker-b94b6';
const [arg, countArg = '3', threadFilter] = process.argv.slice(2);
if (!arg) { console.error('usage: node scripts/export-traces.mjs <email|uid> [count] [threadId]'); process.exit(1); }
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key path first (see header).');
    process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const uid = arg.includes('@') ? (await admin.auth().getUserByEmail(arg)).uid : arg;
const count = Math.max(1, Math.min(50, parseInt(countArg, 10) || 3));

// No composite index on (userId, createdAt) in firestore.indexes.json, so read the
// newest traces by createdAt alone (single-field index, automatic) and filter the
// user and thread in memory. SCAN caps how far back we look.
const SCAN = 400;
const all = await db.collection('coachTraces').orderBy('createdAt', 'desc').limit(SCAN).get();
const docs = all.docs
    .filter(d => d.get('userId') === uid && (!threadFilter || d.get('threadId') === threadFilter))
    .slice(0, count);
if (docs.length === 0) { console.log(`No traces for ${uid}${threadFilter ? ` in ${threadFilter}` : ''} in the newest ${SCAN}.`); process.exit(0); }
const snap = { docs, size: docs.length };

const outDir = join('backups', 'traces');
mkdirSync(outDir, { recursive: true });

const safe = (s) => String(s || '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60);
const fence = (s) => '```\n' + String(s ?? '').replace(/```/g, '` ` `') + '\n```';

for (const doc of snap.docs) {
    const t = doc.data();
    const stamp = String(t.createdAt || '').replace(/[:.]/g, '-').slice(0, 19);
    const base = `${stamp}_${safe(t.threadId || 'nothread')}_t${t.turn ?? 0}`;
    writeFileSync(join(outDir, `${base}.json`), JSON.stringify({ id: doc.id, ...t }, null, 2));

    const tools = (t.toolCalls || []).map((c, i) => [
        `### Tool call ${i + 1} — round ${c.round} · \`${c.name}\`${c.isError ? ' · **ERROR**' : ''} · ${c.ms ?? '?'} ms`,
        '**Input**', fence(c.input), '**Output**', fence(c.output),
    ].join('\n\n')).join('\n\n');

    const md = [
        `# Coach trace — ${t.createdAt}`,
        '',
        `| | |`, `|---|---|`,
        `| doc | \`${doc.id}\` |`,
        `| thread / turn | \`${t.threadId}\` / ${t.turn} |`,
        `| mode / route / model | ${t.mode} / ${t.route?.tier ?? t.route ?? '—'}${t.route?.reason ? ` (${t.route.reason})` : ''} / ${t.model} |`,
        `| rounds | ${t.rounds} |`,
        `| tokens in / out | ${t.tokens?.input} / ${t.tokens?.output} |`,
        `| latency | ${t.latencyMs} ms |`,
        `| block size | ${t.contextChars} chars (~${Math.round((t.contextChars || 0) / 4)} tokens) · hash \`${t.contextHash}\` · has block: ${t.hasContextBlock} |`,
        `| stop reason | ${t.stopReason} |`,
        t.error ? `| **error** | ${t.error} |` : '',
        '',
        '## Question', '', fence(t.question),
        '',
        `## Tool calls (${(t.toolCalls || []).length})`, '', tools || '_none — answered from the block alone_',
        '',
        '## Answer', '', fence(t.response),
        '',
        '## The block (what the model saw)', '', fence(t.contextText),
        '',
    ].filter(l => l !== null).join('\n');
    writeFileSync(join(outDir, `${base}.md`), md);
    console.log(`${base}.md  — ${t.mode} · ${t.rounds} round(s) · ${(t.toolCalls || []).length} tool call(s) · ${t.contextChars} chars`);
}
console.log(`\nWrote ${snap.size} trace(s) to ${outDir}/`);
