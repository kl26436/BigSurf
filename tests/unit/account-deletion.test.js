// Account deletion (launch blocker 11b) — functions/account-deletion.js run
// against the Admin-SDK fake, with fake Auth + Storage that record call order,
// plus a static check that the deleteAccount callable only ever acts on the
// caller's own uid (index.js can't be loaded here: firebase-functions isn't a
// root dependency).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fakeAdminDb } from '../fixtures/admin-db-mock.js';
import { deleteUserAccount, deleteUserData, USER_KEYED_COLLECTIONS } from '../../functions/account-deletion.js';

const ME = 'user_me';
const OTHER = 'user_other';

function seed() {
    const docs = {};
    for (const uid of [ME, OTHER]) {
        Object.assign(docs, {
            [`users/${uid}`]: { createdAt: '2026-01-01' },
            [`users/${uid}/workouts/w1`]: { date: '2026-10-01' },
            [`users/${uid}/workoutTemplates/t1`]: { name: 'Push' },
            [`users/${uid}/templates/legacy1`]: { name: 'Old push' },
            [`users/${uid}/programs/p1`]: { active: true },
            [`users/${uid}/coachAdvice/a1`]: { text: 'x' },
            [`users/${uid}/coachHistory/h1`]: { question: 'q' },
            [`users/${uid}/stats/personalRecords`]: { exercisePRs: {} },
            [`users/${uid}/preferences/settings`]: { weightUnit: 'lbs' },
            [`users/${uid}/preferences/coachMemory`]: { facts: [] },
            [`users/${uid}/integrations/withings`]: { accessToken: 'secret' },
            [`users/${uid}/device_tokens/current`]: { token: 'tok' },
            [`users/${uid}/push_subscriptions/current`]: { endpoint: 'https://push' },
            // nested deeper than one level, and a subcollection nothing names
            [`users/${uid}/equipment/e1/history/h1`]: { n: 1 },
            [`users/${uid}/someFutureCollection/z1`]: { n: 1 },
            [`scheduled_notifications/n_${uid}`]: { userId: uid, sendAt: 1 },
            [`coachTraces/tr_${uid}`]: { userId: uid, messages: [] },
            [`errorLogs/err_${uid}`]: { userId: uid, userEmail: `${uid}@example.com` },
        });
    }
    // Global data that is nobody's to delete.
    docs['equipmentCatalog/hammer'] = { lines: [] };
    docs['exercises/bench'] = { name: 'Bench press' };
    return docs;
}

/** Shared call log so the test can assert ordering across Firestore/Storage/Auth. */
function fakes(db, { files = [`users/${ME}/dexa-reports/r1.pdf`, `users/${OTHER}/dexa-reports/r2.pdf`] } = {}) {
    const log = [];
    const objects = new Set(files);
    const origRecursive = db.recursiveDelete;
    db.recursiveDelete = async (ref) => { log.push(`firestore:recursive:${ref.path}`); return origRecursive(ref); };
    const bucket = {
        getFiles: async ({ prefix }) => [[...objects].filter(f => f.startsWith(prefix)).map(name => ({ name }))],
        deleteFiles: async ({ prefix }) => {
            log.push(`storage:${prefix}`);
            for (const f of [...objects]) if (f.startsWith(prefix)) objects.delete(f);
        },
    };
    const users = new Set([ME, OTHER]);
    const auth = {
        deleteUser: async (uid) => {
            log.push(`auth:${uid}`);
            if (!users.has(uid)) {
                const e = new Error('no user');
                e.code = 'auth/user-not-found';
                throw e;
            }
            users.delete(uid);
        },
    };
    return { log, objects, bucket, users, auth };
}

const keysOf = (db, prefix) => [...db._docs.keys()].filter(k => k === prefix || k.startsWith(`${prefix}/`));

describe('deleteUserAccount', () => {
    it('removes users/{uid}, every subcollection under it, and the root doc', async () => {
        const db = fakeAdminDb(seed());
        const { bucket, auth } = fakes(db);
        await deleteUserAccount(ME, { db, auth, bucket });
        expect(keysOf(db, `users/${ME}`)).toEqual([]);
    });

    it('removes the uid-keyed docs in the top-level collections', async () => {
        const db = fakeAdminDb(seed());
        const { bucket, auth } = fakes(db);
        const result = await deleteUserAccount(ME, { db, auth, bucket });
        for (const { name } of USER_KEYED_COLLECTIONS) {
            const mine = [...db._docs.entries()].filter(([k, v]) => k.startsWith(`${name}/`) && v.userId === ME);
            expect(mine).toEqual([]);
            expect(result.topLevelDocs[name]).toBe(1);
        }
    });

    it('removes the user\'s Storage prefix only', async () => {
        const db = fakeAdminDb(seed());
        const { bucket, auth, objects } = fakes(db);
        const result = await deleteUserAccount(ME, { db, auth, bucket });
        expect(result.storageFiles).toBe(1);
        expect([...objects]).toEqual([`users/${OTHER}/dexa-reports/r2.pdf`]);
    });

    it('leaves other users and global data untouched', async () => {
        const initial = seed();
        const db = fakeAdminDb(initial);
        const { bucket, auth, users } = fakes(db);
        await deleteUserAccount(ME, { db, auth, bucket });
        const othersBefore = Object.keys(initial).filter(k => !k.includes(ME)).sort();
        expect([...db._docs.keys()].sort()).toEqual(othersBefore);
        expect(db._docs.get(`users/${OTHER}/integrations/withings`)).toEqual({ accessToken: 'secret' });
        expect(users.has(OTHER)).toBe(true);
        // Nothing was written or deleted outside the caller's data.
        expect(db.writes.every(w => w.path.includes(ME))).toBe(true);
    });

    it('deletes the Auth user last, after every data step', async () => {
        const db = fakeAdminDb(seed());
        const { bucket, auth, log, users } = fakes(db);
        const result = await deleteUserAccount(ME, { db, auth, bucket });
        expect(log.at(-1)).toBe(`auth:${ME}`);
        expect(log.filter(l => l.startsWith('auth:'))).toEqual([`auth:${ME}`]);
        expect(log).toContain(`firestore:recursive:users/${ME}`);
        expect(log).toContain(`storage:users/${ME}/`);
        expect(users.has(ME)).toBe(false);
        expect(result.authUserDeleted).toBe(true);
    });

    it('is idempotent: a re-run finds nothing and still succeeds', async () => {
        const db = fakeAdminDb(seed());
        const f = fakes(db);
        await deleteUserAccount(ME, { db, auth: f.auth, bucket: f.bucket });
        const after = [...db._docs.keys()].sort();

        const second = await deleteUserAccount(ME, { db, auth: f.auth, bucket: f.bucket });
        expect(second).toEqual({
            topLevelDocs: Object.fromEntries(USER_KEYED_COLLECTIONS.map(c => [c.name, 0])),
            storageFiles: 0,
            authUserDeleted: false,
        });
        expect([...db._docs.keys()].sort()).toEqual(after);
    });

    it('keeps the Auth user when a data step fails, so the user can retry', async () => {
        const db = fakeAdminDb(seed());
        const f = fakes(db);
        f.bucket.getFiles = async () => { throw Object.assign(new Error('boom'), { code: 503 }); };
        await expect(deleteUserAccount(ME, { db, auth: f.auth, bucket: f.bucket })).rejects.toThrow('boom');
        expect(f.users.has(ME)).toBe(true);
        expect(f.log.some(l => l.startsWith('auth:'))).toBe(false);
    });

    it('treats a missing Storage bucket as nothing to delete', async () => {
        const db = fakeAdminDb(seed());
        const f = fakes(db);
        f.bucket.getFiles = async () => { throw Object.assign(new Error('bucket not found'), { code: 404 }); };
        const result = await deleteUserAccount(ME, { db, auth: f.auth, bucket: f.bucket });
        expect(result.storageFiles).toBe(0);
        expect(f.users.has(ME)).toBe(false);
    });

    it('pages through large top-level result sets', async () => {
        const docs = seed();
        for (let i = 0; i < 650; i++) docs[`coachTraces/bulk_${i}`] = { userId: ME };
        const db = fakeAdminDb(docs);
        const f = fakes(db);
        const result = await deleteUserAccount(ME, { db, auth: f.auth, bucket: f.bucket });
        expect(result.topLevelDocs.coachTraces).toBe(651);
        expect(keysOf(db, 'coachTraces').filter(k => db._docs.get(k).userId === ME)).toEqual([]);
    });

    it.each(['', '  ', 'a/b', null, undefined, 42])('refuses an unsafe uid (%j) before touching anything', async (bad) => {
        const db = fakeAdminDb(seed());
        const f = fakes(db);
        await expect(deleteUserAccount(bad, { db, auth: f.auth, bucket: f.bucket })).rejects.toThrow(/invalid uid/);
        expect(db.writes).toEqual([]);
        expect(f.log).toEqual([]);
    });
});

describe('deleteUserData (the Auth onDelete sweep)', () => {
    it('wipes the data without touching Auth', async () => {
        const db = fakeAdminDb(seed());
        const f = fakes(db);
        await deleteUserData(ME, { db, bucket: f.bucket });
        expect(keysOf(db, `users/${ME}`)).toEqual([]);
        expect(f.log.some(l => l.startsWith('auth:'))).toBe(false);
    });
});

describe('deleteAccount callable (functions/index.js)', () => {
    const src = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
    const start = src.indexOf('exports.deleteAccount');
    const body = src.slice(start, src.indexOf('exports.', start + 10));

    it('is exported, requires auth, and acts only on context.auth.uid', () => {
        expect(start).toBeGreaterThan(-1);
        expect(body).toMatch(/if \(!context\.auth\)/);
        expect(body).toMatch(/const uid = context\.auth\.uid;/);
        expect(body).toMatch(/deleteUserAccount\(uid,/);
        // never reads a uid (or anything else) from the request payload
        expect(body).not.toMatch(/data\??\./);
    });

    it('has an Auth onDelete trigger that sweeps the same data', () => {
        expect(src).toMatch(/exports\.onAuthUserDeleted = functions\.auth\.user\(\)\.onDelete/);
        expect(src).toMatch(/deleteUserData\(user\.uid,/);
    });
});
