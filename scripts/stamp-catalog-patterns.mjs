#!/usr/bin/env node
// LB-5 — stamp a movement `pattern` on every catalog machine whose function
// names one (docs/exercise-labels-audit-2026-10.md §5). Deterministic and
// re-runnable: the decision is the shipped classifier (functions/ mirrors of
// movement-patterns.js + exercise-taxonomy.js) plus the hand-checked table in
// scripts/lib/catalog-pattern-stamp.mjs, so re-running after a rule or
// catalog change re-derives every line (adds, replaces or removes `pattern`).
//
//   node scripts/stamp-catalog-patterns.mjs            rewrite js/core/data/equipment-catalog.js
//   node scripts/stamp-catalog-patterns.mjs --check    exit 1 if the file is stale (no write)
//   node scripts/stamp-catalog-patterns.mjs --family   list the hip/glute/back-ext family for hand-checking
//   node scripts/stamp-catalog-patterns.mjs --nulls    list machines left without a pattern, with the reason
//
// The Firestore copy (`equipmentCatalog/`) only gets the field after a
// re-seed: node scripts/seed-equipment-catalog.mjs --merge-exercises

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { EQUIPMENT_CATALOG } from '../js/core/data/equipment-catalog.js';
import { slugify } from '../js/core/data/equipment-catalog-helpers.js';
import { planCatalogPatterns, stampCatalogSource, summarize, HINGE_FAMILY_RE } from './lib/catalog-pattern-stamp.mjs';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const { inferPattern } = require(join(REPO, 'functions/movement-patterns.js'));
const { PATTERN_BODY_PART, BODY_PART_PATTERNS, normalizeBodyPart } = require(join(REPO, 'functions/exercise-taxonomy.js'));

const args = process.argv.slice(2);
const FILE = join(REPO, 'js/core/data/equipment-catalog.js');

const plan = planCatalogPatterns(EQUIPMENT_CATALOG, { inferPattern, PATTERN_BODY_PART, BODY_PART_PATTERNS, normalizeBodyPart }, slugify);
const row = (r) => `  ${String(r.pattern || '—').padEnd(16)} ${String(r.reason).padEnd(12)} ${String(r.bodyPart || '').padEnd(10)} ${r.brand} — ${r.name}  [${r.ref}]`;

if (args.includes('--family')) {
    const fam = plan.filter(r => HINGE_FAMILY_RE.test(r.name));
    console.log(`Hip / glute / back-extension family: ${fam.length}`);
    for (const r of fam) console.log(row(r));
    process.exit(0);
}
if (args.includes('--nulls')) {
    const nulls = plan.filter(r => !r.pattern);
    console.log(`Machines left without a pattern: ${nulls.length}`);
    for (const r of nulls) console.log(row(r));
    process.exit(0);
}

const source = readFileSync(FILE, 'utf8');
const next = stampCatalogSource(source, plan);
const s = summarize(plan);
console.log(`${s.total} machines · ${s.stamped} stamped · ${s.total - s.stamped} left without a pattern`);
console.log('  by pattern:', JSON.stringify(s.byPattern));
console.log('  by reason: ', JSON.stringify(s.byReason));

if (args.includes('--check')) {
    if (next !== source) {
        console.error('✘ equipment-catalog.js is stale — run: node scripts/stamp-catalog-patterns.mjs');
        process.exit(1);
    }
    console.log('✓ equipment-catalog.js is up to date');
    process.exit(0);
}
if (next === source) {
    console.log('No change.');
} else {
    writeFileSync(FILE, next);
    console.log('Wrote js/core/data/equipment-catalog.js');
}
