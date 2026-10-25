// Admin-SDK-shaped in-memory Firestore for server code (functions/*.js) —
// collection/doc/get/set(merge)/add, where(== != >= <= > < in)/orderBy/limit, snapshot
// .ref/.size/.empty. Docs are keyed by full path ('users/u1/workouts/w1').
// Every write is recorded in `writes` so a test can assert "this turn wrote
// nothing" independently of which tools were called (AP-20d).

const OPS = {
    '==': (a, b) => a === b,
    '!=': (a, b) => a !== b,
    '>=': (a, b) => a != null && a >= b,
    '<=': (a, b) => a != null && a <= b,
    '>': (a, b) => a != null && a > b,
    '<': (a, b) => a != null && a < b,
    in: (a, b) => Array.isArray(b) && b.includes(a),
};

export function fakeAdminDb(seed = {}) {
    const docs = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
    const writes = [];
    let autoId = 0;

    const snapOf = (path) => ({
        id: path.split('/').pop(),
        exists: docs.has(path),
        data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
        ref: docRef(path),
    });

    function collectionRef(path, { order = null, max = Infinity, filters = [] } = {}) {
        return {
            id: path.split('/').pop(),
            doc: (id) => docRef(`${path}/${id ?? `auto_${++autoId}`}`),
            where: (field, op, value) => {
                if (!OPS[op]) throw new Error(`fakeAdminDb: where op ${op} not supported`);
                return collectionRef(path, { order, max, filters: [...filters, { field, op, value }] });
            },
            orderBy: (field, dir = 'asc') => collectionRef(path, { order: { field, dir }, max, filters }),
            limit: (n) => collectionRef(path, { order, max: n, filters }),
            add: async (data) => {
                const id = `auto_${++autoId}`;
                docs.set(`${path}/${id}`, structuredClone(data));
                writes.push({ op: 'add', path: `${path}/${id}`, data });
                return docRef(`${path}/${id}`);
            },
            get: async () => {
                let list = [...docs.keys()]
                    .filter(k => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
                    .map(snapOf)
                    .filter(s => filters.every(f => OPS[f.op](s.data()[f.field], f.value)));
                if (order) {
                    list.sort((a, b) => String(a.data()[order.field] ?? '').localeCompare(String(b.data()[order.field] ?? '')));
                    if (order.dir === 'desc') list.reverse();
                }
                list = list.slice(0, max);
                return { docs: list, empty: list.length === 0, size: list.length, forEach: (fn) => list.forEach(fn) };
            },
        };
    }

    function docRef(path) {
        return {
            id: path.split('/').pop(),
            path,
            collection: (name) => collectionRef(`${path}/${name}`),
            get: async () => snapOf(path),
            set: async (data, opts = {}) => {
                const next = opts.merge && docs.has(path) ? { ...docs.get(path), ...structuredClone(data) } : structuredClone(data);
                docs.set(path, next);
                writes.push({ op: opts.merge ? 'merge' : 'set', path, data });
            },
            update: async (data) => {
                if (!docs.has(path)) throw new Error(`fakeAdminDb: update on missing doc ${path}`);
                docs.set(path, { ...docs.get(path), ...structuredClone(data) });
                writes.push({ op: 'update', path, data });
            },
            delete: async () => {
                docs.delete(path);
                writes.push({ op: 'delete', path });
            },
        };
    }

    return { collection: (name) => collectionRef(name), _docs: docs, writes };
}
