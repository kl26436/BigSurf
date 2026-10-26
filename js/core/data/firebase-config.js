import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    memoryLocalCache,
    doc,
    setDoc as sdkSetDoc,
    getDoc,
    getDocFromCache,
    updateDoc as sdkUpdateDoc,
    deleteDoc as sdkDeleteDoc,
    collection,
    query,
    where,
    getDocs,
    getDocsFromServer,
    getDocsFromCache,
    orderBy,
    limit,
    onSnapshot,
    writeBatch as sdkWriteBatch,
    arrayUnion,
    arrayRemove,
    deleteField,
    runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    setPersistence,
    browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
// Firebase Messaging SDK removed - using Web Push API directly instead
// See push-notification-manager.js for Web Push implementation
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { commitWrite } from './offline.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: 'AIzaSyAbzL4bGY026Z-oWiWcYLfDgkmmgAfUY3k',
    authDomain: 'workout-tracker-b94b6.firebaseapp.com',
    projectId: 'workout-tracker-b94b6',
    storageBucket: 'workout-tracker-b94b6.appspot.com',
    messagingSenderId: '111958991290',
    appId: '1:111958991290:web:23e1014ab2ba27df6ebd83',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

/**
 * Firestore with a persistent local cache (IndexedDB) so the app keeps
 * working at a gym with no signal: reads come from the device, writes queue
 * and sync when the connection is back — across reloads, not just while the
 * tab stays open. The multi-tab manager lets two open tabs share the cache.
 *
 * No IndexedDB (some private modes) → memory cache, the pre-offline
 * behaviour. If IndexedDB exists but fails to open, the SDK itself falls back
 * to memory with a console warning, so this never blocks startup.
 */
function initDb(firebaseApp) {
    let hasIndexedDb = false;
    try {
        hasIndexedDb = !!globalThis.indexedDB;
    } catch {
        // Some browsers throw on the bare `indexedDB` access when storage is blocked.
    }
    if (hasIndexedDb) {
        try {
            return {
                db: initializeFirestore(firebaseApp, {
                    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
                }),
                cacheMode: 'persistent',
            };
        } catch (error) {
            console.warn('⚠️ Persistent Firestore cache unavailable — using memory cache:', error);
        }
    }
    try {
        return { db: initializeFirestore(firebaseApp, { localCache: memoryLocalCache() }), cacheMode: 'memory' };
    } catch {
        // Already initialized (shouldn't happen) — use whatever instance exists.
        return { db: getFirestore(firebaseApp), cacheMode: 'default' };
    }
}

const firestoreInit = initDb(app);
export const db = firestoreInit.db;
/** 'persistent' | 'memory' | 'default' — what was requested at startup (debug aid). */
export const firestoreCacheMode = firestoreInit.cacheMode;
export const auth = getAuth(app);
export const functions = getFunctions(app);

// Firebase Messaging is no longer used - we use Web Push API directly
// See push-notification-manager.js for the implementation
export const messaging = null;

// Set auth persistence to LOCAL (survives browser restarts and redirects)
setPersistence(auth, browserLocalPersistence)
    .then(() => {})
    .catch((error) => {
        console.error('❌ Error setting auth persistence:', error);
    });

export const provider = new GoogleAuthProvider();

// ===================================================================
// LOCAL-FIRST WRITES
//
// The SDK's write promises resolve only when the SERVER acknowledges the
// write — offline that's never, although the write is already in the local
// cache and queued to sync. Every write in the app goes through these
// wrappers, so `await setDoc(...)` means "saved on this device": it resolves
// at once offline, or after a few seconds with no ack on bad signal, and
// still rejects for real refusals (bad data, permission-denied). See
// offline.js#commitWrite. Same call signatures as the SDK.
// ===================================================================

const setDoc = (...args) => commitWrite(sdkSetDoc(...args));
const updateDoc = (...args) => commitWrite(sdkUpdateDoc(...args));
const deleteDoc = (...args) => commitWrite(sdkDeleteDoc(...args));

function writeBatch(firestore) {
    const batch = sdkWriteBatch(firestore);
    const commit = batch.commit.bind(batch);
    batch.commit = () => commitWrite(commit());
    return batch;
}

// Note: 'select_account' prompt can cause redirect loops on production
// Removed for stability - users can sign out and use different account

// Re-export Firebase functions for easy importing
export {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    getDocsFromServer,
    getDocsFromCache,
    getDocFromCache,
    orderBy,
    limit,
    onSnapshot,
    writeBatch,
    arrayUnion,
    arrayRemove,
    deleteField,
    runTransaction,
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    setPersistence,
    browserLocalPersistence,
    httpsCallable,
};
