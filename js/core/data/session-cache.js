// Session cache (PF-2) — the loadAllWorkouts pattern, once, for every
// read the dashboard repeats: a module-private { uid, fetchedAt, data } per
// key with a TTL, callers at the same moment share ONE in-flight request,
// and a generation counter so a read that started before an invalidation
// can't re-store stale data (AP-15i). A loader that throws caches nothing
// (a failed read is never remembered as "no data").

export const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * @param {{ttlMs?: number, now?: () => number}} [opts]
 */
export function makeSessionCache({ ttlMs = SESSION_CACHE_TTL_MS, now = () => Date.now() } = {}) {
    const entries = new Map();   // key → { uid, fetchedAt, data }
    const inflight = new Map();  // key → { uid, gen, promise }
    let gen = 0;
    return {
        /**
         * @template T
         * @param {string} key
         * @param {string} uid
         * @param {() => Promise<T>} loader
         * @returns {Promise<T>}
         */
        async get(key, uid, loader) {
            const e = entries.get(key);
            if (e && e.uid === uid && now() - e.fetchedAt < ttlMs) return e.data;
            const f = inflight.get(key);
            if (f && f.uid === uid && f.gen === gen) return f.promise;
            const g = gen;
            const promise = (async () => {
                try {
                    const data = await loader();
                    if (g === gen) entries.set(key, { uid, fetchedAt: now(), data });
                    return data;
                } finally {
                    if (inflight.get(key)?.promise === promise) inflight.delete(key);
                }
            })();
            inflight.set(key, { uid, gen: g, promise });
            return promise;
        },
        /** Store a value directly (a background refresh landed). */
        set(key, uid, data) {
            entries.set(key, { uid, fetchedAt: now(), data });
        },
        peek(key, uid) {
            const e = entries.get(key);
            return e && e.uid === uid ? e.data : undefined;
        },
        clear() {
            entries.clear();
            inflight.clear();
            gen += 1;
        },
        get generation() { return gen; },
    };
}
