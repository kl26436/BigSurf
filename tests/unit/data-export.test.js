// Tests for CSV/JSON data export (Phase 13.3)
// Imports the REAL functions from data-export-import.js. That module statically
// imports firebase-config (CDN URLs) and ui-helpers (DOM at import time), so
// both are mocked — the functions under test are pure.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {},
    doc: vi.fn(),
    setDoc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    collection: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
}));

vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    escapeHtml: (s) => s,
    openModal: vi.fn(),
    closeModal: vi.fn(),
}));

import {
    escapeCSV,
    generateCSV,
    validateImportJSON,
    serializeFirestoreValue,
    serializeExportDoc,
    buildExportDocument,
    detectExportVersion,
    normalizeImportData,
    EXPORT_COLLECTIONS,
    EXPORT_VERSION,
    REDACTED_PLACEHOLDER,
    NOT_INCLUDED,
} from '../../js/core/data/data-export-import.js';

// Minimal stand-ins for the Firestore SDK classes (duck-typed by the serializer).
class FakeTimestamp {
    constructor(ms) { this.seconds = Math.floor(ms / 1000); this.nanoseconds = (ms % 1000) * 1e6; this._ms = ms; }
    toDate() { return new Date(this._ms); }
}
class FakeGeoPoint {
    constructor(lat, lng) { this._lat = lat; this._lng = lng; }
    get latitude() { return this._lat; }
    get longitude() { return this._lng; }
    isEqual() { return false; }
}
class FakeDocRef {
    constructor(path) { this.type = 'document'; this.path = path; this.id = path.split('/').pop(); this.firestore = {}; }
}
class FakeBytes {
    constructor(b64) { this._b64 = b64; }
    toBase64() { return this._b64; }
}

// A v1 file exactly as the pre-2026-10 exportWorkoutData (data-manager.js) wrote it.
const V1_FIXTURE = {
    exportDate: '2026-04-01T12:00:00.000Z',
    version: '3.0',
    userId: 'u1',
    workouts: [
        { id: '2026-03-30_1711800000000_ab12', date: '2026-03-30', workoutType: 'Push', exercises: { exercise_0: { name: 'Bench', sets: [{ reps: 8, weight: 135 }] } } },
        { date: '2026-03-31', workoutType: 'Pull' }, // no id: the importer generates one
    ],
    templates: [{ id: 'push_day', name: 'Push day', exercises: [] }],
    equipment: [{ id: 'equipment_1', name: 'Hammer Strength Flat', locations: ['Downtown'] }],
};

// ===================================================================
// TESTS
// ===================================================================

describe('escapeCSV', () => {
    it('returns plain string unchanged', () => {
        expect(escapeCSV('hello')).toBe('hello');
    });

    it('wraps strings with commas in quotes', () => {
        expect(escapeCSV('Bench Press, Flat')).toBe('"Bench Press, Flat"');
    });

    it('escapes internal quotes by doubling them', () => {
        expect(escapeCSV('6" grip')).toBe('"6"" grip"');
    });

    it('wraps strings with newlines in quotes', () => {
        expect(escapeCSV('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
    });

    it('handles empty string', () => {
        expect(escapeCSV('')).toBe('');
    });

    it('handles null/undefined', () => {
        expect(escapeCSV(null)).toBe('');
        expect(escapeCSV(undefined)).toBe('');
    });
});

describe('generateCSV', () => {
    it('produces correct headers as first row', () => {
        const csv = generateCSV([]);
        const firstLine = csv.split('\n')[0];
        expect(firstLine).toBe('Date,Workout Name,Exercise,Equipment,Set #,Set Type,Reps,Weight,Unit,Notes,Duration (min)');
    });

    it('produces one row per set', () => {
        const workouts = [{
            date: '2026-04-01',
            workoutType: 'Push Day',
            totalDuration: 3600,
            exercises: {
                exercise_0: {
                    name: 'Bench Press',
                    equipment: 'Barbell',
                    sets: [
                        { weight: 135, reps: 10, originalUnit: 'lbs', type: 'working' },
                        { weight: 155, reps: 8, originalUnit: 'lbs', type: 'working' },
                    ],
                },
            },
        }];
        const csv = generateCSV(workouts);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(3); // header + 2 sets
        expect(lines[1]).toContain('Bench Press');
        expect(lines[1]).toContain('135');
        expect(lines[2]).toContain('155');
    });

    it('handles commas and quotes in exercise names', () => {
        const workouts = [{
            date: '2026-04-01',
            workoutType: 'Pull',
            exercises: {
                exercise_0: {
                    name: 'Lat Pulldown, Wide Grip',
                    equipment: '6" Handle',
                    sets: [{ weight: 100, reps: 12, originalUnit: 'lbs' }],
                },
            },
        }];
        const csv = generateCSV(workouts);
        expect(csv).toContain('"Lat Pulldown, Wide Grip"');
        expect(csv).toContain('"6"" Handle"');
    });

    it('handles mixed units (lbs/kg) preserving original unit per row', () => {
        const workouts = [{
            date: '2026-04-01',
            workoutType: 'Legs',
            exercises: {
                exercise_0: {
                    name: 'Squat',
                    sets: [
                        { weight: 225, reps: 5, originalUnit: 'lbs' },
                        { weight: 100, reps: 5, originalUnit: 'kg' },
                    ],
                },
            },
        }];
        const csv = generateCSV(workouts);
        const lines = csv.split('\n');
        expect(lines[1]).toContain('lbs');
        expect(lines[2]).toContain('kg');
    });

    it('returns only headers for empty workouts array', () => {
        const csv = generateCSV([]);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(1);
    });

    it('calculates duration in minutes', () => {
        const workouts = [{
            date: '2026-04-01',
            workoutType: 'Push',
            totalDuration: 5400, // 90 minutes
            exercises: {
                exercise_0: { name: 'Bench', sets: [{ weight: 135, reps: 10 }] },
            },
        }];
        const csv = generateCSV(workouts);
        expect(csv).toContain('90');
    });
});

describe('validateImportJSON', () => {
    it('accepts valid export data', () => {
        const data = { version: '3.0', workouts: [{ date: '2026-04-01' }] };
        expect(validateImportJSON(data)).toEqual({ valid: true, error: null });
    });

    it('rejects null/undefined', () => {
        expect(validateImportJSON(null).valid).toBe(false);
        expect(validateImportJSON(undefined).valid).toBe(false);
    });

    it('rejects missing version', () => {
        expect(validateImportJSON({ workouts: [] }).valid).toBe(false);
        expect(validateImportJSON({ workouts: [] }).error).toContain('version');
    });

    it('rejects missing workouts array', () => {
        expect(validateImportJSON({ version: '3.0' }).valid).toBe(false);
        expect(validateImportJSON({ version: '3.0' }).error).toContain('workouts');
    });

    it('rejects non-array workouts', () => {
        expect(validateImportJSON({ version: '3.0', workouts: 'not an array' }).valid).toBe(false);
    });

    it('rejects non-object data', () => {
        expect(validateImportJSON('string').valid).toBe(false);
        expect(validateImportJSON(42).valid).toBe(false);
    });
});

// ===================================================================
// FULL EXPORT (v2): serializer + builder
// ===================================================================

describe('serializeFirestoreValue', () => {
    it('converts a Firestore Timestamp to an ISO string', () => {
        const ms = Date.UTC(2026, 9, 25, 14, 30, 0, 250);
        expect(serializeFirestoreValue(new FakeTimestamp(ms))).toBe('2026-10-25T14:30:00.250Z');
    });

    it('converts a Date to an ISO string and an invalid Date to null', () => {
        expect(serializeFirestoreValue(new Date(Date.UTC(2026, 0, 2)))).toBe('2026-01-02T00:00:00.000Z');
        expect(serializeFirestoreValue(new Date('nope'))).toBeNull();
    });

    it('recurses through nested maps and arrays', () => {
        const ts = new FakeTimestamp(Date.UTC(2026, 4, 1));
        const iso = '2026-05-01T00:00:00.000Z';
        const out = serializeFirestoreValue({
            a: { b: { c: ts, d: [1, 'two', { e: ts }, [ts]] } },
            empty: {},
            list: [],
        });
        expect(out).toEqual({
            a: { b: { c: iso, d: [1, 'two', { e: iso }, [iso]] } },
            empty: {},
            list: [],
        });
    });

    it('handles GeoPoint, DocumentReference and Bytes', () => {
        expect(serializeFirestoreValue(new FakeGeoPoint(36.6, -121.9))).toEqual({ latitude: 36.6, longitude: -121.9 });
        expect(serializeFirestoreValue(new FakeDocRef('users/u1/equipment/eq1'))).toBe('users/u1/equipment/eq1');
        expect(serializeFirestoreValue(new FakeBytes('AAEC'))).toBe('AAEC');
    });

    it('keeps primitives and maps undefined / non-finite numbers to null', () => {
        expect(serializeFirestoreValue('x')).toBe('x');
        expect(serializeFirestoreValue(0)).toBe(0);
        expect(serializeFirestoreValue(false)).toBe(false);
        expect(serializeFirestoreValue(null)).toBeNull();
        expect(serializeFirestoreValue(undefined)).toBeNull();
        expect(serializeFirestoreValue(NaN)).toBeNull();
        expect(serializeFirestoreValue([undefined, 1])).toEqual([null, 1]);
    });

    it('leaves a plain map that merely has latitude/longitude or type/path fields as a map', () => {
        expect(serializeFirestoreValue({ latitude: 1, longitude: 2, name: 'Gym' })).toEqual({ latitude: 1, longitude: 2, name: 'Gym' });
        expect(serializeFirestoreValue({ type: 'document', path: 'x' })).toEqual({ type: 'document', path: 'x' });
    });

    it('produces output that survives a JSON round trip unchanged', () => {
        const out = serializeFirestoreValue({ t: new FakeTimestamp(1e12), g: new FakeGeoPoint(1, 2), n: [1, { x: null }] });
        expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    });
});

describe('serializeExportDoc', () => {
    it('keeps the doc id beside the data, never clobbering a data `id` field', () => {
        expect(serializeExportDoc('doc_1', { id: 'legacy', name: 'Push' })).toEqual({
            id: 'doc_1',
            data: { id: 'legacy', name: 'Push' },
        });
    });

    it('redacts only the named fields that exist', () => {
        const out = serializeExportDoc('withings', { accessToken: 'secret', connectedAt: new FakeTimestamp(0) }, ['accessToken', 'refreshToken']);
        expect(out.data).toEqual({ accessToken: REDACTED_PLACEHOLDER, connectedAt: '1970-01-01T00:00:00.000Z' });
    });
});

describe('buildExportDocument', () => {
    const base = { user: { uid: 'u1', email: 'a@b.c' }, exportedAt: '2026-10-25T00:00:00.000Z' };

    it('has the versioned top-level shape', () => {
        const d = buildExportDocument(base);
        expect(d.exportVersion).toBe(2);
        expect(EXPORT_VERSION).toBe(2);
        expect(d.exportedAt).toBe('2026-10-25T00:00:00.000Z');
        expect(d.app).toBe('Big Surf');
        expect(d.user).toEqual({ uid: 'u1', email: 'a@b.c' });
        expect(d.notIncluded).toBe(NOT_INCLUDED);
        expect(d.incomplete).toBeUndefined();
    });

    it('emits every collection, an empty one as []', () => {
        const d = buildExportDocument(base);
        expect(Object.keys(d.collections)).toEqual(EXPORT_COLLECTIONS);
        for (const name of EXPORT_COLLECTIONS) {
            expect(d.collections[name]).toEqual([]);
            expect(d.counts[name]).toBe(0);
        }
    });

    it('covers the launch-blocker 11(c) list', () => {
        for (const name of [
            'workouts', 'workoutTemplates', 'equipment', 'locations', 'customExercises',
            'exerciseOverrides', 'hiddenExercises', 'measurements', 'dexa', 'coachHistory',
            'coachAdvice', 'programs', 'stats', 'preferences',
        ]) {
            expect(EXPORT_COLLECTIONS).toContain(name);
        }
    });

    it('includes doc ids, serializes values, and counts docs', () => {
        const d = buildExportDocument({
            ...base,
            snapshotsByCollection: {
                workouts: [{ id: 'w1', data: { date: '2026-10-01', completedAt: new FakeTimestamp(Date.UTC(2026, 9, 1)) } }],
                preferences: [
                    { id: 'settings', data: { weightUnit: 'lbs' } },
                    { id: 'favorites', data: { exercises: ['Bench'] } },
                ],
                stats: [{ id: 'personalRecords', data: { exercisePRs: { Bench: { eq1: { weight: 225 } } } } }],
            },
        });
        expect(d.collections.workouts).toEqual([{ id: 'w1', data: { date: '2026-10-01', completedAt: '2026-10-01T00:00:00.000Z' } }]);
        expect(d.collections.preferences.map(p => p.id)).toEqual(['settings', 'favorites']);
        expect(d.collections.stats[0].data.exercisePRs.Bench.eq1.weight).toBe(225);
        expect(d.counts.workouts).toBe(1);
        expect(d.counts.preferences).toBe(2);
        expect(d.counts.locations).toBe(0);
    });

    it('redacts credentials in integrations / push docs', () => {
        const d = buildExportDocument({
            ...base,
            snapshotsByCollection: {
                integrations: [{ id: 'withings', data: { accessToken: 'a', refreshToken: 'r', withingsUserId: 7 } }],
                push_subscriptions: [{ id: 'current', data: { subscription: { endpoint: 'x', keys: {} }, platform: 'web' } }],
                device_tokens: [{ id: 'current', data: { token: 'apns', platform: 'ios' } }],
            },
        });
        expect(d.collections.integrations[0].data).toEqual({ accessToken: REDACTED_PLACEHOLDER, refreshToken: REDACTED_PLACEHOLDER, withingsUserId: 7 });
        expect(d.collections.push_subscriptions[0].data).toEqual({ subscription: REDACTED_PLACEHOLDER, platform: 'web' });
        expect(d.collections.device_tokens[0].data).toEqual({ token: REDACTED_PLACEHOLDER, platform: 'ios' });
    });

    it('lists collections that failed to read under `incomplete`', () => {
        const d = buildExportDocument({ ...base, errors: [{ collection: 'dexa', error: 'permission-denied' }] });
        expect(d.incomplete).toEqual([{ collection: 'dexa', error: 'permission-denied' }]);
        expect(d.collections.dexa).toEqual([]);
    });

    it('adds the users/{uid} root doc as user.profile only when it has data', () => {
        expect(buildExportDocument({ ...base, rootDoc: {} }).user.profile).toBeUndefined();
        expect(buildExportDocument({ ...base, rootDoc: { createdAt: new FakeTimestamp(0) } }).user.profile)
            .toEqual({ createdAt: '1970-01-01T00:00:00.000Z' });
    });

    it('omits email when the auth user has none', () => {
        expect(buildExportDocument({ user: { uid: 'u1' }, exportedAt: 'x' }).user).toEqual({ uid: 'u1' });
    });

    it('exports every users/{uid} subcollection the code reads or writes', () => {
        // The client SDK can't list subcollections, so EXPORT_COLLECTIONS is a
        // hand-kept inventory. This scans the source so a new subcollection
        // can't silently drop out of "download my data".
        const root = fileURLToPath(new URL('../../', import.meta.url));
        const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap(e => {
            const rel = `${dir}/${e.name}`;
            if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel);
            return e.name.endsWith('.js') ? [rel] : [];
        });
        const found = new Set();
        // Client: collection(db, 'users', uid, 'name') / doc(this.db, 'users', uid, 'name', …)
        const clientRe = /\b(?:collection|doc)\(\s*(?:this\.)?db\s*,\s*'users'\s*,\s*[^,()]+(?:\([^)]*\))?[^,()]*,\s*'([A-Za-z_]+)'/g;
        for (const f of walk('js')) {
            for (const m of readFileSync(join(root, f), 'utf8').matchAll(clientRe)) found.add(m[1]);
        }
        // Server (Admin SDK): every .collection('name') that isn't a top-level collection.
        const TOP_LEVEL = new Set(['users', 'scheduled_notifications', 'coachTraces', 'errorLogs', 'exercises', 'equipmentCatalog']);
        for (const f of readdirSync(join(root, 'functions')).filter(n => n.endsWith('.js'))) {
            for (const m of readFileSync(join(root, 'functions', f), 'utf8').matchAll(/\.collection\('([A-Za-z_]+)'\)/g)) {
                if (!TOP_LEVEL.has(m[1])) found.add(m[1]);
            }
        }
        // 'test' is debug-utilities' permission probe, not user data.
        found.delete('test');
        expect(found.size).toBeGreaterThan(10);
        expect([...found].filter(n => !EXPORT_COLLECTIONS.includes(n))).toEqual([]);
    });
});

// ===================================================================
// IMPORT: v1 back-compat + v2
// ===================================================================

describe('detectExportVersion', () => {
    it('tells v1 from v2', () => {
        expect(detectExportVersion(V1_FIXTURE)).toBe(1);
        expect(detectExportVersion(buildExportDocument({ user: { uid: 'u' } }))).toBe(2);
        expect(detectExportVersion({})).toBeNull();
        expect(detectExportVersion(null)).toBeNull();
        expect(detectExportVersion([])).toBeNull();
    });
});

describe('validateImportJSON (v1 and v2)', () => {
    it('accepts the v1 fixture', () => {
        expect(validateImportJSON(V1_FIXTURE)).toEqual({ valid: true, error: null });
    });

    it('accepts a freshly built v2 export, even one with no workouts', () => {
        expect(validateImportJSON(buildExportDocument({ user: { uid: 'u' } }))).toEqual({ valid: true, error: null });
    });

    it('accepts a v2 export after a JSON round trip', () => {
        const d = JSON.parse(JSON.stringify(buildExportDocument({
            user: { uid: 'u' },
            snapshotsByCollection: { workouts: [{ id: 'w1', data: { date: '2026-10-01' } }] },
        })));
        expect(validateImportJSON(d).valid).toBe(true);
    });

    it('rejects v2 without collections or with a non-array list', () => {
        expect(validateImportJSON({ exportVersion: 2 }).valid).toBe(false);
        expect(validateImportJSON({ exportVersion: 2, collections: { workouts: {} } }).valid).toBe(false);
        expect(validateImportJSON({ exportVersion: 2, collections: { workouts: [], equipment: 'x' } }).valid).toBe(false);
    });

    it('rejects a newer export version with a clear reason', () => {
        const r = validateImportJSON({ exportVersion: 3, collections: { workouts: [] } });
        expect(r.valid).toBe(false);
        expect(r.error).toContain('newer');
    });
});

describe('normalizeImportData', () => {
    it('maps the v1 fixture to { docId, data } lists, stripping id from data', () => {
        const n = normalizeImportData(V1_FIXTURE);
        expect(n.version).toBe(1);
        expect(n.workouts).toHaveLength(2);
        expect(n.workouts[0].docId).toBe('2026-03-30_1711800000000_ab12');
        expect(n.workouts[0].data).not.toHaveProperty('id');
        expect(n.workouts[0].data.workoutType).toBe('Push');
        expect(n.workouts[1].docId).toBeNull();
        expect(n.templates).toEqual([{ docId: 'push_day', data: { name: 'Push day', exercises: [] } }]);
        expect(n.equipment).toEqual([{ docId: 'equipment_1', data: { name: 'Hammer Strength Flat', locations: ['Downtown'] } }]);
    });

    it('treats missing v1 templates/equipment as empty', () => {
        expect(normalizeImportData({ version: '3.0', workouts: [] }))
            .toEqual({ version: 1, workouts: [], templates: [], equipment: [] });
    });

    it('maps v2 workouts / workoutTemplates / equipment and nothing else', () => {
        const exp = JSON.parse(JSON.stringify(buildExportDocument({
            user: { uid: 'u' },
            snapshotsByCollection: {
                workouts: [{ id: 'w1', data: { date: '2026-10-01' } }],
                workoutTemplates: [{ id: 't1', data: { id: 'legacy-id', name: 'Pull' } }],
                equipment: [{ id: 'eq1', data: { name: 'Rack' } }],
                preferences: [{ id: 'settings', data: { weightUnit: 'kg' } }],
                stats: [{ id: 'personalRecords', data: {} }],
            },
        })));
        const n = normalizeImportData(exp);
        expect(n.version).toBe(2);
        expect(n.workouts).toEqual([{ docId: 'w1', data: { date: '2026-10-01' } }]);
        // The doc id is the write target; the data's own id field survives.
        expect(n.templates).toEqual([{ docId: 't1', data: { id: 'legacy-id', name: 'Pull' } }]);
        expect(n.equipment).toEqual([{ docId: 'eq1', data: { name: 'Rack' } }]);
        expect(Object.keys(n).sort()).toEqual(['equipment', 'templates', 'version', 'workouts']);
    });
});
