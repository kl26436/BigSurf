// In-memory Firestore mock factory — shared by data-layer tests.
// Same architecture as the inline mock in schema-migration.test.js (flat map of
// 'users/{uid}/{collection}/{id}' → data), extended with query/where/orderBy/limit
// support so modules that build Firestore queries run unmodified.
//
// Usage (vi.mock factories are hoisted, so the store must come from vi.hoisted):
//
//   const { store } = vi.hoisted(() => ({ store: new Map() }));
//   vi.mock('../../js/core/data/firebase-config.js', async () => {
//       const { createFirestoreMock } = await import('../fixtures/firestore-mock.js');
//       return createFirestoreMock(store);
//   });
//
// Offline simulation: pass a hoisted `control` object as the second argument.
// With `control.serverOffline = true`, getDocsFromServer rejects the way the
// real SDK does offline (code 'unavailable'); getDocs / getDocsFromCache keep
// answering from the store, which stands in for the device's local cache.

export function createFirestoreMock(store, control = {}) {
    const pathOf = (segments) => segments.join('/');

    // Deep-clone on write like real Firestore serialization — callers must not
    // be able to mutate stored docs through retained references.
    const clone = (data) => JSON.parse(JSON.stringify(data));

    const docsInCollection = (colPath) =>
        [...store.entries()]
            .filter(([path]) => {
                if (!path.startsWith(colPath + '/')) return false;
                return !path.slice(colPath.length + 1).includes('/');
            })
            .map(([path, data]) => ({
                id: path.slice(colPath.length + 1),
                data: () => data,
                ref: { __path: path },
            }));

    const matchesWhere = (value, op, target) => {
        switch (op) {
            case '==': return value === target;
            case '>=': return value >= target;
            case '<=': return value <= target;
            case '>': return value > target;
            case '<': return value < target;
            default: throw new Error(`Unsupported where op in mock: ${op}`);
        }
    };

    const offlineError = () => Object.assign(
        new Error('Failed to get documents from server. (However, these documents may exist in the local cache.)'),
        { code: 'unavailable' },
    );

    const runQuery = (refOrQuery) => {
        let docs = docsInCollection(refOrQuery.__path);
        for (const c of refOrQuery.__constraints || []) {
            if (c.__type === 'where') {
                docs = docs.filter((d) => matchesWhere(d.data()[c.field], c.op, c.value));
            } else if (c.__type === 'orderBy') {
                docs.sort((a, b) => {
                    const av = a.data()[c.field];
                    const bv = b.data()[c.field];
                    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
                    return c.dir === 'desc' ? -cmp : cmp;
                });
            } else if (c.__type === 'limit') {
                docs = docs.slice(0, c.n);
            }
        }
        return docs;
    };
    const snapshotOf = (docs, fromCache) => ({
        forEach: (cb) => docs.forEach(cb),
        docs,
        size: docs.length,
        empty: docs.length === 0,
        metadata: { fromCache },
    });

    return {
        db: {},
        doc: (_db, ...segments) => ({ __path: pathOf(segments), id: segments[segments.length - 1] }),
        collection: (_db, ...segments) => ({ __path: pathOf(segments) }),
        query: (ref, ...constraints) => ({
            __path: ref.__path,
            __constraints: [...(ref.__constraints || []), ...constraints],
        }),
        where: (field, op, value) => ({ __type: 'where', field, op, value }),
        orderBy: (field, dir = 'asc') => ({ __type: 'orderBy', field, dir }),
        limit: (n) => ({ __type: 'limit', n }),
        // Default-source reads behave like the real SDK: server when online,
        // the local cache (the store) when offline.
        getDocs: async (refOrQuery) => snapshotOf(runQuery(refOrQuery), !!control.serverOffline),
        getDocsFromServer: async (refOrQuery) => {
            if (control.serverOffline) throw offlineError();
            return snapshotOf(runQuery(refOrQuery), false);
        },
        getDocsFromCache: async (refOrQuery) => snapshotOf(runQuery(refOrQuery), true),
        getDoc: async (ref) => ({
            exists: () => store.has(ref.__path),
            data: () => store.get(ref.__path),
        }),
        getDocFromCache: async (ref) => {
            if (!store.has(ref.__path)) throw offlineError();
            return { exists: () => true, data: () => store.get(ref.__path) };
        },
        setDoc: async (ref, data) => { store.set(ref.__path, clone(data)); },
        updateDoc: async (ref, data) => {
            store.set(ref.__path, { ...(store.get(ref.__path) || {}), ...clone(data) });
        },
        deleteDoc: async (ref) => { store.delete(ref.__path); },
        writeBatch: () => {
            const ops = [];
            return {
                set: (ref, data) => ops.push(() => store.set(ref.__path, clone(data))),
                update: (ref, data) => ops.push(() => {
                    store.set(ref.__path, { ...(store.get(ref.__path) || {}), ...clone(data) });
                }),
                delete: (ref) => ops.push(() => store.delete(ref.__path)),
                commit: async () => ops.forEach((op) => op()),
            };
        },
    };
}
