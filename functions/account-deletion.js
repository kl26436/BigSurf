// Account deletion — functions/account-deletion.js (launch blocker 11b)
//
// Server-only (not mirrored). Apple requires in-app account deletion, and the
// privacy policy promises it deletes everything. The client can't do this:
// it can't list subcollections (so anything it doesn't name survives), can't
// touch the uid-keyed docs in admin-only top-level collections, and can't
// delete its own Auth user without a fresh sign-in. The Admin SDK can.
//
// Every step is idempotent, so a retry after a partial failure (timeout,
// dropped connection) finishes the job instead of erroring on what's gone.
// The Auth user goes LAST: until it's deleted the person can still sign in
// and retry, so a failure part-way never strands data behind a dead login.
//
// index.js wires this to the `deleteAccount` callable (uid comes from
// context.auth, never from the request) and to the Auth onDelete trigger
// (deletions done from the Firebase console get the same wipe).

// Top-level collections that hold docs about a user outside users/{uid}.
// Each is written by the server or the client with a `userId` field:
//   scheduled_notifications — rest-timer pushes (index.js schedule*Notification)
//   coachTraces             — one doc per coach turn, incl. the context the
//                             model saw (index.js writeCoachTrace)
//   errorLogs               — client error reports, incl. userEmail
//                             (js/core/utils/error-handler.js)
// A new top-level collection keyed by uid must be added here.
const USER_KEYED_COLLECTIONS = [
    { name: 'scheduled_notifications', field: 'userId' },
    { name: 'coachTraces', field: 'userId' },
    { name: 'errorLogs', field: 'userId' },
];

// Storage prefixes owned by the user (storage.rules: users/{uid}/dexa-reports).
// The whole users/{uid}/ prefix goes, so a future upload path is covered too.
const storagePrefixFor = (uid) => `users/${uid}/`;

const PAGE_SIZE = 300;

function assertUid(uid) {
    // uid becomes a document path and a Storage prefix — refuse anything that
    // could widen either (an empty string or a slash would).
    if (typeof uid !== 'string' || !uid.trim() || uid.includes('/')) {
        throw new Error('deleteUserData: invalid uid');
    }
}

/** Delete every doc in `collectionName` whose `field` == uid. Returns the count. */
async function deleteWhere(db, collectionName, field, uid) {
    let deleted = 0;
    for (;;) {
        const snap = await db.collection(collectionName).where(field, '==', uid).limit(PAGE_SIZE).get();
        if (snap.empty) return deleted;
        await Promise.all(snap.docs.map(d => d.ref.delete()));
        deleted += snap.size;
        if (snap.size < PAGE_SIZE) return deleted;
    }
}

/** Delete every object under the user's prefix. Returns the count. */
async function deleteStoragePrefix(bucket, uid) {
    if (!bucket) return 0;
    const prefix = storagePrefixFor(uid);
    try {
        const [files] = await bucket.getFiles({ prefix });
        if (!files.length) return 0;
        await bucket.deleteFiles({ prefix, force: true });
        return files.length;
    } catch (e) {
        // 404 = the bucket itself doesn't exist (Storage never set up): nothing to delete.
        if (e?.code === 404) return 0;
        throw e;
    }
}

/**
 * Delete all of a user's data — everything except the Auth user.
 * Safe to re-run; a second run finds nothing and returns zeros.
 *
 * @param {string} uid
 * @param {object} deps
 * @param {object} deps.db      Admin Firestore
 * @param {object} [deps.bucket] Admin Storage bucket (default bucket)
 * @returns {Promise<{ topLevelDocs: object, storageFiles: number }>}
 */
async function deleteUserData(uid, { db, bucket } = {}) {
    assertUid(uid);

    // users/{uid} — the root doc and EVERY subcollection under it, including
    // ones the client never names (programs, coachAdvice, stats, legacy
    // templates, integrations/withings tokens, device_tokens,
    // push_subscriptions, preferences/*, coachOverrides, hiddenExercises…).
    await db.recursiveDelete(db.doc(`users/${uid}`));

    const topLevelDocs = {};
    for (const { name, field } of USER_KEYED_COLLECTIONS) {
        topLevelDocs[name] = await deleteWhere(db, name, field, uid);
    }

    const storageFiles = await deleteStoragePrefix(bucket, uid);

    return { topLevelDocs, storageFiles };
}

/**
 * Delete the account: all data, then the Auth user.
 *
 * @param {string} uid - the CALLER's uid (context.auth.uid), never a request field
 * @param {object} deps
 * @param {object} deps.db
 * @param {object} deps.auth    Admin Auth
 * @param {object} [deps.bucket]
 * @returns {Promise<{ topLevelDocs: object, storageFiles: number, authUserDeleted: boolean }>}
 */
async function deleteUserAccount(uid, { db, auth, bucket } = {}) {
    const result = await deleteUserData(uid, { db, bucket });

    let authUserDeleted = true;
    try {
        await auth.deleteUser(uid);
    } catch (e) {
        // Already gone (a re-run after a success, or deleted from the console).
        if (e?.code !== 'auth/user-not-found') throw e;
        authUserDeleted = false;
    }

    return { ...result, authUserDeleted };
}

module.exports = {
    deleteUserAccount,
    deleteUserData,
    USER_KEYED_COLLECTIONS,
    storagePrefixFor,
};
