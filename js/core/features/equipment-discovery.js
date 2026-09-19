// Equipment discovery (CP-7) — turn dead rows and predictable gaps into
// rotation material. Three pure finders, all injected, no I/O:
//
//   unmappedEquipment  — docs with no name or no exercise mapping (invisible to
//                        every picker and to the rotation engine)
//   lineGaps           — equipment lines ship as families; if the user owns
//                        several pieces of a line at one gym, the missing
//                        members are predictable. Answered gaps never come
//                        back (D10: never ask twice).
//   branchScouting     — patterns poorly served at the home gym that another
//                        mapped gym covers — a reason to visit (D6: claim only
//                        positive evidence, so it needs a second mapped gym).

const norm = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * @param {Array} equipment - equipment docs
 * @returns {Array<{id:string, name:string, reason:'no name'|'no exercises'}>}
 */
export function unmappedEquipment(equipment = []) {
    const out = [];
    for (const eq of equipment || []) {
        if (!eq) continue;
        const name = (eq.name || '').trim();
        if (!name) { out.push({ id: eq.id || '', name: '', reason: 'no name' }); continue; }
        if (!Array.isArray(eq.exerciseTypes) || eq.exerciseTypes.length === 0) {
            out.push({ id: eq.id || '', name, reason: 'no exercises' });
        }
    }
    return out.sort((a, b) => (a.reason === 'no name' ? 0 : 1) - (b.reason === 'no name' ? 0 : 1) || a.name.localeCompare(b.name));
}

/** Does an owned doc cover a catalog machine? Name or function containment either way. */
function owns(doc, machineName) {
    const m = norm(machineName);
    if (!m) return false;
    const f = norm(doc.function);
    const n = norm(doc.name);
    return (f && (f === m || f.includes(m) || m.includes(f))) || (n && (n === m || n.includes(m)));
}

/**
 * @param {Array} equipment - equipment docs ({ brand, line, function, name, locations[] })
 * @param {Array} catalog - augmented catalog: [{ name|brand, lines: [{ name, machines: [{ id, name, bodyPart }] }] }]
 * @param {object} [opts]
 * @param {string[]} [opts.answered] - keys already answered (`${gym}|${machineId}`)
 * @param {number} [opts.minOwned=2] - pieces of a line owned at a gym before it counts as "a line you own"
 * @param {number} [opts.maxLines=3]
 * @param {number} [opts.maxMissing=4]
 * @returns {Array<{gym:string, brand:string, line:string, owned:number, missing:Array<{id:string,name:string,bodyPart:string|null,key:string}>}>}
 */
export function lineGaps(equipment = [], catalog = [], { answered = [], minOwned = 2, maxLines = 3, maxMissing = 4 } = {}) {
    const answeredSet = new Set(answered || []);
    // (gym, brand, line) → owned docs
    const groups = new Map();
    for (const eq of equipment || []) {
        if (!eq?.brand || !eq?.line) continue;
        const locs = Array.isArray(eq.locations) && eq.locations.length ? eq.locations : [];
        for (const gym of locs) {
            const key = `${norm(gym)}|${norm(eq.brand)}|${norm(eq.line)}`;
            if (!groups.has(key)) groups.set(key, { gym, brand: eq.brand, line: eq.line, docs: [] });
            groups.get(key).docs.push(eq);
        }
    }
    const out = [];
    for (const g of groups.values()) {
        if (g.docs.length < minOwned) continue;
        const brandEntry = (catalog || []).find(b => norm(b.name || b.brand) === norm(g.brand));
        const lineEntry = brandEntry?.lines?.find(l => norm(l.name) === norm(g.line));
        if (!lineEntry) continue;
        const missing = [];
        for (const m of lineEntry.machines || []) {
            if (g.docs.some(d => owns(d, m.name))) continue;
            const key = `${g.gym}|${m.id}`;
            if (answeredSet.has(key)) continue;
            missing.push({ id: m.id, name: m.name, bodyPart: m.bodyPart || null, key });
        }
        if (!missing.length) continue;
        out.push({ gym: g.gym, brand: g.brand, line: g.line, owned: g.docs.length, missing: missing.slice(0, maxMissing) });
    }
    return out.sort((a, b) => b.owned - a.owned || a.brand.localeCompare(b.brand)).slice(0, maxLines);
}

/**
 * @param {Array} equipment - equipment docs with locations[]
 * @param {string|null} homeGym - the user's main gym (null → most-equipped gym)
 * @param {object} opts
 * @param {(doc:object)=>string[]} opts.patternsFor - movement patterns a doc trains
 * @param {number} [opts.minHome=2] - a pattern with fewer machines than this at home is "poorly served"
 * @param {number} [opts.max=3]
 * @returns {{ homeGym:string|null, gaps:Array<{pattern:string, home:number, gym:string, count:number}> }}
 */
export function branchScouting(equipment = [], homeGym = null, { patternsFor, minHome = 2, max = 3 } = {}) {
    if (typeof patternsFor !== 'function') return { homeGym: homeGym || null, gaps: [] };
    const perGym = new Map(); // gym → pattern → count
    const sizes = new Map();
    for (const eq of equipment || []) {
        const locs = Array.isArray(eq?.locations) ? eq.locations : [];
        if (!locs.length) continue;
        const patterns = patternsFor(eq);
        for (const gym of locs) {
            sizes.set(gym, (sizes.get(gym) || 0) + 1);
            if (!perGym.has(gym)) perGym.set(gym, new Map());
            const counts = perGym.get(gym);
            for (const p of patterns) counts.set(p, (counts.get(p) || 0) + 1);
        }
    }
    if (sizes.size < 2) return { homeGym: homeGym || null, gaps: [] };
    const home = homeGym && sizes.has(homeGym)
        ? homeGym
        : [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const homeCounts = perGym.get(home) || new Map();
    const gaps = [];
    for (const [gym, counts] of perGym) {
        if (gym === home) continue;
        for (const [pattern, count] of counts) {
            const atHome = homeCounts.get(pattern) || 0;
            if (atHome >= minHome || count <= atHome) continue;
            gaps.push({ pattern, home: atHome, gym, count });
        }
    }
    gaps.sort((a, b) => (b.count - b.home) - (a.count - a.home) || a.pattern.localeCompare(b.pattern) || a.gym.localeCompare(b.gym));
    return { homeGym: home, gaps: gaps.slice(0, max) };
}

/** "hip-dominant" → "hip-dominant" stays; "knee-flexion" → "leg curl" reads better for humans. */
export const PATTERN_LABELS = {
    'horizontal-push': 'chest press',
    'vertical-push': 'overhead press',
    'horizontal-pull': 'row',
    'vertical-pull': 'pulldown',
    'knee-dominant': 'squat / leg press',
    'knee-flexion': 'leg curl',
    'hip-dominant': 'hip hinge / thrust',
    'calf': 'calf',
    'lateral-delt': 'lateral raise',
    'rear-delt': 'rear delt',
    'elbow-flex': 'curl',
    'elbow-ext': 'triceps',
    'trunk-flex': 'ab',
    'trunk-ext': 'back extension',
    'anti-rotation': 'rotation / oblique',
    'anti-extension': 'plank / rollout',
    'abduction': 'hip abduction',
    'adduction': 'hip adduction',
    'cardio': 'cardio',
};
