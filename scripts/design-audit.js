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
    // DS-5 (2026-10-27) — ratcheted to today's counts.
    inlineStylesInJs: 10,
    rawFontSizeInPages: 10,
    rawRadiusPxInPages: 0,
    rawRgbaInPages: 2,
    rawHexInPages: 0,
    rawRgbaInComponents: 0,
    rawHexNamedInComponents: 0,
    duplicateClassDefs: 0,
    bareBackdrops: 0,
    // TP-0b — jargon (e1RM, RPE, deload, block…) in user-visible strings
    // (scripts/jargon-audit.js reads visible text only). Stays at 0.
    jargonInUiStrings: 0,
    // DS-5 — the prose rules, executable:
    //   copy rules (CLAUDE.md "User-Facing Copy Rules") — scripts/copy-lint.js;
    copyRuleHits: 0,
    //   one button vocabulary: every .btn* rule in components/buttons.css;
    buttonRulesOutsideButtonsCss: 0,
    //   one chip pattern: chip-shaped classes (…chip / …pill, not containers or
    //   badges) defined outside components/chips.css. The rest are distinct
    //   shapes (the workout pill, day circles, set chips) — ratchet down only.
    chipClassesOutsideChipsCss: 27,
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

// --- Jargon in user-visible strings (TP-0b) ----------------------------------
const jargonHits = require('./jargon-audit.js').scanRepo(ROOT);
metrics.jargonInUiStrings = jargonHits.length;

// --- DS-5 — copy rules, button vocabulary, chip shapes -----------------------
const copyHits = require('./copy-lint.js').lintRepo(ROOT);
metrics.copyRuleHits = copyHits.length;

const styleFiles = walk(path.join(ROOT, 'styles'), (f) => f.endsWith('.css'));
const isFile = (f, rel) => path.relative(ROOT, f).replace(/\\/g, '/') === rel;
const buttonRulesOutside = [];
const chipClasses = new Map(); // class → file
for (const f of styleFiles) {
    const text = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (!isFile(f, 'styles/components/buttons.css') && !isFile(f, 'styles/reset.css')) {
        text.split('\n').forEach((ln, i) => { if (/^\s*\.btn[\w-]*\s*[,{:]/.test(ln)) buttonRulesOutside.push(`${rel}:${i + 1}`); });
    }
    if (isFile(f, 'styles/components/chips.css')) continue;
    for (const m of text.matchAll(/^\s*\.([a-zA-Z][\w-]*)/gm)) {
        const cls = m[1];
        if (!/(chip|pill)(--[\w-]+)?$/.test(cls) || /badge/.test(cls)) continue;
        chipClasses.set(cls.replace(/--[\w-]+$/, ''), rel);
    }
}
metrics.buttonRulesOutsideButtonsCss = buttonRulesOutside.length;
metrics.chipClassesOutsideChipsCss = chipClasses.size;

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
    row('Jargon in user-visible strings',    metrics.jargonInUiStrings,    BUDGETS.jargonInUiStrings),
    row('Copy-rule hits (copy-lint.js)',     metrics.copyRuleHits,         BUDGETS.copyRuleHits),
    row('.btn* rules outside buttons.css',   metrics.buttonRulesOutsideButtonsCss, BUDGETS.buttonRulesOutsideButtonsCss),
    row('Chip shapes outside chips.css',     metrics.chipClassesOutsideChipsCss, BUDGETS.chipClassesOutsideChipsCss),
];

// SH-5 — the shell budgets (scripts/shell-audit.js) ride the same gate, so
// `audit:design:strict` fails when anyone adds a second sheet/header/inset.
// Budgets live in shell-audit.js and only go down as SH-3/SH-4 land.
const shell = require('./shell-audit.js');
const shellCounts = shell.buildInventory(shell.loadRepo()).counts;
const SHELL_LABELS = {
    overlayRootsOutsideSheetCss: 'Shell: overlay roots outside sheet.css',
    safeAreaTopRulesOutsidePrimitives: 'Shell: safe-area-top copies',
    backCloseControlsUnderTap: 'Shell: back/close under 44px',
    searchInputsOutsideFieldSearch: 'Shell: search outside .field-search',
    bodyOverflowWrites: 'Shell: body.style.overflow writes',
};
for (const [key, label] of Object.entries(SHELL_LABELS)) {
    rows.push(row(label.padEnd(34), shellCounts[key], shell.BUDGETS[key]));
}

console.log('\n  ── Big Surf design-system audit ───────────────────────────');
rows.forEach((r) => console.log(r.line));
console.log('  ───────────────────────────────────────────────────────────\n');

if (jargonHits.length > 0) {
    console.log('  Jargon in user-visible strings (use plain-language.js words, or mark // copy-ok: <reason>):');
    jargonHits.forEach((h) => console.log(`    ${h.file}:${h.line}  ${h.match}`));
    console.log('');
}

if (copyHits.length > 0) {
    console.log('  Copy-rule hits (fix the copy, or mark // copy-ok: <reason>):');
    copyHits.forEach((h) => console.log(`    ${h.file}:${h.line}  [${h.rule}]  ${h.text}`));
    console.log('');
}
if (buttonRulesOutside.length > 0) {
    console.log('  .btn* rules outside components/buttons.css (move them, or name the component\'s own button):');
    buttonRulesOutside.forEach((b) => console.log(`    ${b}`));
    console.log('');
}
if (process.argv.includes('--chips')) {
    console.log('  Chip shapes outside chips.css:');
    [...chipClasses].sort().forEach(([c, f]) => console.log(`    .${c}  (${f})`));
    console.log('');
}

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
