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
 * Requires: npm install firebase-admin (one-time setup)
 */

const admin = require('firebase-admin');

// Initialize with application default credentials (uses gcloud auth)
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'workout-tracker-b94b6',
    });
}

const db = admin.firestore();
const COLLECTION = 'errorLogs';

async function listErrors({ all = false, bugsOnly = false } = {}) {
    let q = db.collection(COLLECTION).orderBy('timestamp', 'desc');
    if (!all) q = q.limit(50);

    const snapshot = await q.get();
    if (snapshot.empty) {
        console.log('No error logs found.');
        return;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`  ${snapshot.size} error log(s) found`);
    console.log(`${'='.repeat(80)}\n`);

    for (const doc of snapshot.docs) {
        const e = doc.data();

        if (bugsOnly && e.source !== 'user-bug-report') continue;

        const isBug = e.source === 'user-bug-report';
        const severity = (e.severity || 'error').toUpperCase();
        const time = e.timestamp || 'unknown';
        const user = e.userEmail || e.userId || 'unknown';
        const page = e.context?.activePage || '';
        const desc = e.context?.description || '';

        console.log(`[${severity}] ${time}`);
        if (isBug) {
            console.log(`  BUG REPORT: ${desc || e.message}`);
        } else {
            console.log(`  ${e.message}`);
        }
        console.log(`  User: ${user} | Page: ${page} | Source: ${e.source || 'unknown'}`);

        if (e.context?.workoutType) {
            console.log(`  Workout: ${e.context.workoutType} (${e.context.completedSets || 0} sets done)`);
        }
        if (e.stack && !isBug) {
            console.log(`  Stack: ${e.stack.split('\n')[0]}`);
        }
        console.log();
    }
}

async function clearErrors({ olderThanDays = null } = {}) {
    let q = db.collection(COLLECTION);

    if (olderThanDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - olderThanDays);
        q = q.where('timestamp', '<', cutoff.toISOString());
    }

    const snapshot = await q.get();
    if (snapshot.empty) {
        console.log('No errors to delete.');
        return;
    }

    const batch = db.batch();
    let count = 0;
    for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        count++;
        // Firestore batches are limited to 500
        if (count % 500 === 0) {
            await batch.commit();
        }
    }
    await batch.commit();
    console.log(`Deleted ${count} error log(s).`);
}

// Parse CLI args
const args = process.argv.slice(2);
const flags = new Set(args);

(async () => {
    try {
        if (flags.has('--clear')) {
            await clearErrors();
        } else if (flags.has('--clear-old')) {
            await clearErrors({ olderThanDays: 7 });
        } else {
            await listErrors({
                all: flags.has('--all'),
                bugsOnly: flags.has('--bugs'),
            });
        }
    } catch (err) {
        console.error('Error:', err.message);
        if (err.message.includes('Could not load the default credentials')) {
            console.error('\nRun: gcloud auth application-default login');
        }
    }
    process.exit(0);
})();
