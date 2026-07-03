#!/usr/bin/env node
/**
 * Design-system audit — tracks drift away from the rules in CLAUDE.md.
 *
 * Run locally: node scripts/design-audit.js
 * Run in CI:   node scripts/design-audit.js --strict  (exits 1 if any budget exceeded)
 *
 * Metrics + budgets tuned to the baseline at end of Phase H.
 * Tighten them as the codebase improves.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');
const PAGES_DIR = path.join(ROOT, 'styles', 'pages');
const COMPONENTS_DIR = path.join(ROOT, 'styles', 'components');
const STYLES_ROOT = path.join(ROOT, 'styles');

// Budgets ratcheted after composition-detail / metric-detail / settings-ui
// inline-style sweeps + pages font-size tokenization (Apr 2026). Remaining
// raw font-sizes are a handful of intentional one-offs (hero stat sizes,
// calendar glyph px). Trend these down with each PR — re-ratchet when you
// beat a number.
const BUDGETS = {
    inlineStylesInJs: 15,
    rawFontSizeInPages: 12,
    rawRadiusPxInPages: 0,
    rawRgbaInPages: 2,
    rawHexInPages: 0,
    rawRgbaInComponents: 0,
    rawHexNamedInComponents: 0,
    duplicateClassDefs: 5,
    bareBackdrops: 0,
};

const STRICT = process.argv.includes('--strict');

function walk(dir, predicate) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full, predicate));
        else if (predicate(full)) out.push(full);
    }
    return out;
}

function countMatches(files, regex) {
    let total = 0;
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        const matches = text.match(regex);
        if (matches) total += matches.length;
    }
    return total;
}

function listMatches(files, regex) {
    const hits = [];
    for (const file of files) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
            if (regex.test(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1}`);
        });
    }
    return hits;
}

// --- Metrics -----------------------------------------------------------------

const jsFiles = walk(JS_DIR, (f) => f.endsWith('.js') && !f.includes('node_modules'));
const pagesCss = walk(PAGES_DIR, (f) => f.endsWith('.css'));
const componentsCss = walk(COMPONENTS_DIR, (f) => f.endsWith('.css'));
const utilitiesCss = [path.join(STYLES_ROOT, 'utilities.css')].filter((f) => fs.existsSync(f));
const compAndUtilCss = [...componentsCss, ...utilitiesCss];
const allCss = walk(STYLES_ROOT, (f) => f.endsWith('.css') && !path.basename(f).startsWith('tokens'));

const metrics = {
    inlineStylesInJs: countMatches(jsFiles, /\sstyle="/g),
    rawFontSizeInPages: countMatches(pagesCss, /font-size:\s*\d+\.?\d*(rem|px)\b/g),
    rawRadiusPxInPages: countMatches(pagesCss, /border-radius:\s*\d+px/g),
    rawRgbaInPages: countMatches(pagesCss, /\brgba?\s*\(/g),
    rawHexInPages: countMatches(pagesCss, /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g),
    // Components + utilities: rgba with a NUMERIC first arg (rgba(var(--x-rgb), a)
    // is token-derived and allowed) and hex/named colors inside declarations
    // (property-line match so #id selectors don't count).
    rawRgbaInComponents: countMatches(compAndUtilCss, /\brgba?\(\s*\d/g),
    rawHexNamedInComponents:
        countMatches(compAndUtilCss, /^\s*[-a-z]+[-a-z ]*:\s*[^;{}]*#[0-9a-fA-F]{3,8}\b/gim) +
        countMatches(compAndUtilCss, /^\s*[-a-z]+[-a-z ]*:\s*white\b/gim),
};

// --- Bare blocking backdrops (UX overhaul Phase 0 contract) -------------------
// A blocking backdrop = position:fixed + inset:0 + overlay-token background
// (or a ::backdrop pseudo). Every one must carry the focus blur
// (backdrop-filter: var(--backdrop-blur)). Non-blocking scrims aren't
// fixed+inset:0 backdrops and are exempt by construction.
const bareBackdrops = [];
for (const file of allCss) {
    const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rel = path.relative(ROOT, file);
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = blockRe.exec(text)) !== null) {
        const selector = m[1].trim().split('\n').pop().trim();
        const body = m[2];
        const isBackdropShape =
            (/position:\s*fixed/.test(body) && /inset:\s*0/.test(body) && /background:[^;]*var\(--overlay-/.test(body)) ||
            (/::backdrop/.test(selector) && /background:[^;]*var\(--overlay-/.test(body));
        if (isBackdropShape && !/backdrop-filter/.test(body)) {
            bareBackdrops.push(`${rel} → ${selector}`);
        }
    }
}
metrics.bareBackdrops = bareBackdrops.length;

// --- Duplicate class definitions --------------------------------------------
// A class is "duplicate" when the same `.foo {` top-level rule appears in two+ files.
const classByFile = new Map();
for (const file of allCss) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    const re = /^\.([a-zA-Z_][\w-]*)\s*\{/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
        const cls = m[1];
        if (!classByFile.has(cls)) classByFile.set(cls, new Set());
        classByFile.get(cls).add(rel);
    }
}
const duplicates = [];
for (const [cls, files] of classByFile) {
    if (files.size > 1) duplicates.push({ cls, files: [...files] });
}
metrics.duplicateClassDefs = duplicates.length;

// --- Report ------------------------------------------------------------------

function row(label, value, budget) {
    const over = value > budget;
    const marker = over ? ' OVER' : '  ok';
    const line = `  ${label.padEnd(38)} ${String(value).padStart(5)}  / budget ${String(budget).padStart(5)}  ${marker}`;
    return { line, over };
}

const rows = [
    row('Inline style="" in js/',            metrics.inlineStylesInJs,     BUDGETS.inlineStylesInJs),
    row('Raw font-size rem/px in pages/',    metrics.rawFontSizeInPages,   BUDGETS.rawFontSizeInPages),
    row('Raw border-radius px in pages/',    metrics.rawRadiusPxInPages,   BUDGETS.rawRadiusPxInPages),
    row('Raw rgba() in pages/',              metrics.rawRgbaInPages,       BUDGETS.rawRgbaInPages),
    row('Raw hex #xxx in pages/',            metrics.rawHexInPages,        BUDGETS.rawHexInPages),
    row('Raw rgba() in components/+util',    metrics.rawRgbaInComponents,  BUDGETS.rawRgbaInComponents),
    row('Raw hex/named in components/+util', metrics.rawHexNamedInComponents, BUDGETS.rawHexNamedInComponents),
    row('Duplicate class defs (cross-file)', metrics.duplicateClassDefs,   BUDGETS.duplicateClassDefs),
    row('Blocking backdrops missing blur',   metrics.bareBackdrops,        BUDGETS.bareBackdrops),
];

console.log('\n  ── Big Surf design-system audit ───────────────────────────');
rows.forEach((r) => console.log(r.line));
console.log('  ───────────────────────────────────────────────────────────\n');

if (bareBackdrops.length > 0) {
    console.log('  Blocking backdrops missing backdrop-filter:');
    bareBackdrops.forEach((b) => console.log(`    ${b}`));
    console.log('');
}

if (duplicates.length > 0 && duplicates.length <= 30) {
    console.log('  Duplicate class definitions:');
    duplicates
        .sort((a, b) => b.files.length - a.files.length || a.cls.localeCompare(b.cls))
        .forEach(({ cls, files }) => {
            console.log(`    .${cls}  →  ${files.join(', ')}`);
        });
    console.log('');
}

if (process.argv.includes('--list')) {
    const kinds = {
        'Inline styles': listMatches(jsFiles, /\sstyle="/),
        'Raw font-size': listMatches(pagesCss, /font-size:\s*\d+\.?\d*(rem|px)\b/),
        'Raw border-radius px': listMatches(pagesCss, /border-radius:\s*\d+px/),
    };
    for (const [label, hits] of Object.entries(kinds)) {
        if (hits.length === 0) continue;
        console.log(`  ${label} (${hits.length}):`);
        hits.slice(0, 40).forEach((h) => console.log(`    ${h}`));
        if (hits.length > 40) console.log(`    ... (${hits.length - 40} more; pass --list=all to see)`);
        console.log('');
    }
}

const anyOver = rows.some((r) => r.over);
if (STRICT && anyOver) {
    console.error('  ✘ One or more budgets exceeded.\n');
    process.exit(1);
}
if (anyOver) {
    console.log('  ⚠ Over budget — no --strict flag so exiting 0, but fix before the next release.\n');
}
