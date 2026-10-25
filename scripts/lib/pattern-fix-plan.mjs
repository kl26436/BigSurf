// Pure planner for scripts/fix-exercise-patterns.mjs (AU-13). No I/O — the
// CLI reads Firestore and the JSON files, this decides what would change, and
// tests exercise it directly.
//
// Source of truth = the two bundled libraries (data/exercises.json — the
// offline fallback — and functions/data/exercises.json — what the coach's
// tools read). They must be identical; if they aren't, nothing is planned.

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * @param {object} args
 * @param {Array} args.clientLib - data/exercises.json
 * @param {Array} args.serverLib - functions/data/exercises.json
 * @param {Array<{id, name, pattern, bodyPart}>} [args.defaults] - Firestore `exercises` docs
 * @param {Array<{id, name, pattern, bodyPart}>} [args.overrides] - users/{uid}/exerciseOverrides docs
 * @param {Array<{id, name, exercises}>} [args.templates] - users/{uid}/workoutTemplates docs
 * @returns {{refused: string|null, defaults: Array, overrides: Array, templates: Array}}
 */
export function planPatternFixes({ clientLib = [], serverLib = [], defaults = [], overrides = [], templates = [] } = {}) {
    const empty = { defaults: [], overrides: [], templates: [] };
    if (JSON.stringify(clientLib) !== JSON.stringify(serverLib)) {
        const a = new Map(clientLib.map(e => [norm(e.name), e]));
        const diff = serverLib.filter(e => JSON.stringify(a.get(norm(e.name))) !== JSON.stringify(e)).map(e => e.name);
        return { refused: `data/exercises.json and functions/data/exercises.json differ (${diff.slice(0, 5).join(', ') || 'entry count'}) — sync them first`, ...empty };
    }
    const want = new Map(clientLib.filter(e => e.pattern).map(e => [norm(e.name), e]));

    const plan = (docs) => docs
        .map((d) => ({ d, lib: want.get(norm(d.name)) }))
        .filter(({ d, lib }) => lib && d.pattern !== lib.pattern)
        .map(({ d, lib }) => ({ id: d.id, name: d.name, from: d.pattern ?? null, to: lib.pattern, bodyPart: d.bodyPart ?? null }));

    const templateRows = [];
    for (const t of templates) {
        (t.exercises || []).forEach((row, idx) => {
            const name = row?.machine || row?.name;
            const lib = want.get(norm(name));
            if (lib && row.pattern && row.pattern !== lib.pattern) {
                templateRows.push({ templateId: t.id, template: t.name || t.id, idx, name, from: row.pattern, to: lib.pattern });
            }
        });
    }
    return { refused: null, defaults: plan(defaults), overrides: plan(overrides), templates: templateRows };
}
