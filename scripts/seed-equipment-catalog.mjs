#!/usr/bin/env node
/**
 * Seed the global equipment catalog (`equipmentCatalog/{brandSlug}`) from the
 * static `js/core/data/equipment-catalog.js` source.
 *
 * Auth: reuses the Firebase CLI's OAuth refresh token (already on disk after
 * `firebase login`) — no service account JSON or gcloud install required.
 * Same pattern as `scripts/archive/audit-weights.js`.
 *
 * Each brand becomes one Firestore document. Brand doc shape:
 *   {
 *     name:         "Hammer Strength",
 *     slug:         "hammer-strength",
 *     lines:        [{ name, slug, type, machines: [{ id, slug, name, bodyPart, variants, imageUrl, exercises: { primary, secondary } }] }],
 *     machineCount: 24,
 *     version:      1,
 *     updatedAt:    <serverTimestamp>
 *   }
 *
 * Usage:
 *   node scripts/seed-equipment-catalog.mjs --dry-run     # validate, no writes
 *   node scripts/seed-equipment-catalog.mjs               # write all 21 brands
 *   node scripts/seed-equipment-catalog.mjs --merge-exercises   # preserve curated mappings
 *
 * Idempotent — deterministic doc IDs from brand slugs. Re-running overwrites.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { EQUIPMENT_CATALOG } from '../js/core/data/equipment-catalog.js';
import { slugify, buildCatalogRef } from '../js/core/data/equipment-catalog-helpers.js';

const PROJECT_ID = 'workout-tracker-b94b6';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Firebase CLI OAuth client (public — same values the firebase-tools binary uses)
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const MERGE_EXERCISES = argv.includes('--merge-exercises');

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function getAccessToken() {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    let refreshToken;
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        refreshToken = config.tokens?.refresh_token;
    } catch {
        // fall through
    }
    if (!refreshToken) {
        console.error('❌ No Firebase CLI credentials found. Run: npx firebase login');
        process.exit(1);
    }
    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
    });
    const data = await resp.json();
    if (data.error) {
        console.error('❌ Auth failed:', data.error_description || data.error);
        process.exit(1);
    }
    return data.access_token;
}

// ---------------------------------------------------------------------------
// Firestore REST value encoding (https://firebase.google.com/docs/firestore/reference/rest/v1/Value)
// ---------------------------------------------------------------------------
function encodeValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
        return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    }
    if (Array.isArray(v)) {
        return { arrayValue: { values: v.map(encodeValue) } };
    }
    if (typeof v === 'object') {
        const fields = {};
        for (const [k, val] of Object.entries(v)) fields[k] = encodeValue(val);
        return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
}

function encodeDocument(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) fields[k] = encodeValue(v);
    return { fields };
}

function parseValue(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return parseInt(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) {
        const obj = {};
        for (const [k, val] of Object.entries(v.mapValue.fields || {})) obj[k] = parseValue(val);
        return obj;
    }
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseValue);
    return null;
}

function parseDoc(doc) {
    const out = {};
    for (const [k, v] of Object.entries(doc.fields || {})) out[k] = parseValue(v);
    return out;
}

// ---------------------------------------------------------------------------
// Doc builders
// ---------------------------------------------------------------------------
function buildMachineDoc(brandSlug, lineSlug, machine) {
    const machineSlug = slugify(machine.name);
    return {
        id: `${brandSlug}/${lineSlug}/${machineSlug}`,
        slug: machineSlug,
        name: machine.name,
        bodyPart: machine.bodyPart || null,
        variants: Array.isArray(machine.variants) ? machine.variants : [],
        imageUrl: machine.imageUrl || null,
        exercises: machine.exercises || { primary: [], secondary: [] },
    };
}

function buildBrandDoc(brand) {
    const brandSlug = slugify(brand.brand);
    let machineCount = 0;
    const lines = (brand.lines || []).map((line) => {
        const lineSlug = slugify(line.name);
        const machines = (line.machines || []).map((m) => {
            machineCount += 1;
            return buildMachineDoc(brandSlug, lineSlug, m);
        });
        return {
            name: line.name,
            slug: lineSlug,
            type: line.type || null,
            machines,
        };
    });
    return {
        slug: brandSlug,
        name: brand.brand,
        lines,
        machineCount,
        version: 1,
        updatedAt: new Date().toISOString(),
    };
}

function mergeMachineExercises(existingMachines, freshMachines) {
    if (!Array.isArray(existingMachines) || existingMachines.length === 0) return freshMachines;
    const existingById = new Map(existingMachines.map((m) => [m.id, m]));
    return freshMachines.map((m) => {
        const prior = existingById.get(m.id);
        if (!prior || !prior.exercises) return m;
        const pe = prior.exercises;
        const hasPrior =
            (Array.isArray(pe.primary) && pe.primary.length > 0) ||
            (Array.isArray(pe.secondary) && pe.secondary.length > 0);
        return hasPrior ? { ...m, exercises: pe } : m;
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    if (!Array.isArray(EQUIPMENT_CATALOG)) {
        throw new Error('EQUIPMENT_CATALOG export not found or not an array');
    }

    const brandDocs = EQUIPMENT_CATALOG.map(buildBrandDoc);
    const totalMachines = brandDocs.reduce((sum, b) => sum + b.machineCount, 0);

    console.log(`📊 Parsed ${brandDocs.length} brands · ${totalMachines} machines`);
    console.log(`   Brands: ${brandDocs.map((b) => `${b.name} (${b.machineCount})`).join(', ')}`);

    // Validate that machine ids round-trip through buildCatalogRef
    let badRefs = 0;
    for (const brand of brandDocs) {
        for (const line of brand.lines) {
            for (const m of line.machines) {
                const expected = buildCatalogRef(brand.name, line.name, m.name);
                if (m.id !== expected) {
                    badRefs += 1;
                    console.warn(`⚠️  Ref mismatch: ${m.id} vs ${expected}`);
                }
            }
        }
    }
    if (badRefs > 0) throw new Error(`${badRefs} machine ids do not match their canonical catalog ref`);

    if (DRY_RUN) {
        console.log('\n🔍 Dry run — no writes performed.');
        const sample = brandDocs[0];
        console.log(`   Sample brand: ${sample.name} (${sample.lines.length} lines, ${sample.machineCount} machines)`);
        console.log(`   First machine: ${JSON.stringify(sample.lines[0].machines[0])}`);
        return;
    }

    console.log('🔑 Authenticating via Firebase CLI token…');
    const token = await getAccessToken();
    console.log('✅ Authenticated.');

    let priorByBrand = new Map();
    if (MERGE_EXERCISES) {
        console.log('🔄 Reading existing equipmentCatalog/ to preserve curated exercise mappings…');
        const resp = await fetch(`${BASE_URL}/equipmentCatalog`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json();
        if (data.error) throw new Error(`Read failed: ${data.error.message}`);
        for (const d of data.documents || []) {
            const name = d.name.split('/').pop();
            priorByBrand.set(name, parseDoc(d));
        }
        console.log(`   Found ${priorByBrand.size} existing brand docs`);
    }

    // PATCH each brand doc. Sequential because the REST API doesn't have a
    // simple "write many docs to same collection" endpoint without going to
    // batchWrite (which works but per-write requires building a request envelope).
    // 21 brands × ~50-200ms latency ≈ 5-10s total. Acceptable for one-shot seed.
    let written = 0;
    for (const brand of brandDocs) {
        let payload = brand;
        if (MERGE_EXERCISES && priorByBrand.has(brand.slug)) {
            const prior = priorByBrand.get(brand.slug);
            const priorLinesBySlug = new Map((prior.lines || []).map((l) => [l.slug, l]));
            payload = {
                ...brand,
                lines: brand.lines.map((line) => {
                    const priorLine = priorLinesBySlug.get(line.slug);
                    if (!priorLine) return line;
                    return { ...line, machines: mergeMachineExercises(priorLine.machines, line.machines) };
                }),
            };
        }

        const url = `${BASE_URL}/equipmentCatalog/${encodeURIComponent(brand.slug)}`;
        const resp = await fetch(url, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(encodeDocument(payload)),
        });
        const result = await resp.json();
        if (result.error) {
            console.error(`❌ Failed to write ${brand.slug}: ${result.error.message}`);
            throw new Error(result.error.message);
        }
        written += 1;
        process.stdout.write(`   ✓ ${brand.name}${written < brandDocs.length ? '\n' : '\n'}`);
    }

    console.log(`\n✅ Seed complete — ${written} brand docs written.`);
}

main().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
