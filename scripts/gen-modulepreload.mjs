#!/usr/bin/env node
// PF-4.1 — flatten the module waterfall without a bundler.
//
// Walks the STATIC import graph from js/main.js and writes one
// <link rel="modulepreload"> per module into index.html between
// <!-- modulepreload:start --> and <!-- modulepreload:end -->. The browser
// then fetches the whole static graph in parallel as soon as index.html
// lands, instead of discovering it one import level at a time. Dynamic
// import()s (drill-downs, sheets) stay lazy on purpose.
//
//   node scripts/gen-modulepreload.mjs          rewrite index.html
//   node scripts/gen-modulepreload.mjs --check  exit 1 if the block is stale
//
// Run `npm run build:preload` before every hosting deploy;
// tests/unit/modulepreload.test.js fails while the block is out of date.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'js/main.js';
const START = '<!-- modulepreload:start -->';
const END = '<!-- modulepreload:end -->';

// `import … from './x.js'`, `export … from './x.js'` (multi-line safe) and
// side-effect `import './x.js'`. Only relative specifiers — the CDN Firebase
// URLs are absolute and preloaded by the browser's own cache rules.
const FROM_RE = /\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const BARE_RE = /^\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm;

function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function staticImports(file) {
    const src = stripComments(readFileSync(join(ROOT, file), 'utf8'));
    const specs = [...src.matchAll(FROM_RE), ...src.matchAll(BARE_RE)].map(m => m[1]);
    return specs
        .map(s => relative(ROOT, resolve(ROOT, dirname(file), s)).split('\\').join('/'))
        .filter(p => existsSync(join(ROOT, p)));
}

/** Every module reachable through static imports, dependencies first. */
export function staticGraph(entry = ENTRY) {
    const seen = new Set();
    const order = [];
    const visit = (file) => {
        if (seen.has(file)) return;
        seen.add(file);
        for (const dep of staticImports(file)) visit(dep);
        order.push(file);
    };
    visit(entry);
    return order;
}

export function preloadBlock(entry = ENTRY, indent = '        ') {
    const links = staticGraph(entry).map(f => `${indent}<link rel="modulepreload" href="${f}">`);
    return `${START}\n${links.join('\n')}\n${indent}${END}`;
}

/** index.html with the marked region replaced (or null when markers are missing). */
export function rewriteIndex(html, entry = ENTRY) {
    const a = html.indexOf(START);
    const b = html.indexOf(END);
    if (a < 0 || b < a) return null;
    const lineStart = html.lastIndexOf('\n', a) + 1;
    const indent = html.slice(lineStart, a);
    return html.slice(0, a) + preloadBlock(entry, indent) + html.slice(b + END.length);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const path = join(ROOT, 'index.html');
    const html = readFileSync(path, 'utf8');
    const next = rewriteIndex(html);
    if (next === null) {
        console.error(`❌ index.html has no ${START} … ${END} region`);
        process.exit(1);
    }
    if (process.argv.includes('--check')) {
        if (next !== html) {
            console.error('❌ modulepreload block is stale — run `npm run build:preload`');
            process.exit(1);
        }
        console.log('modulepreload block is current');
    } else {
        if (next !== html) writeFileSync(path, next);
        console.log(`modulepreload: ${staticGraph().length} modules`);
    }
}
