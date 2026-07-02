// Static wiring test for the window-export pattern (CLAUDE.md §Function
// Exposure Pattern). Inline onclick handlers — in index.html and in JS
// template strings — resolve at window scope, so every handler name must be
// assigned to window somewhere in js/. A renamed or deleted export otherwise
// fails silently at tap time. This test parses source text; nothing executes,
// so no Firebase/DOM mocking is needed.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full));
        else if (full.endsWith('.js')) out.push(full);
    }
    return out;
}

const jsFiles = walk(path.join(ROOT, 'js'));
const jsText = jsFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const htmlText = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Every name assigned to window anywhere in js/ (main.js exports plus
// module-scope hooks like window._bsPickDetectedGym).
function collectWindowAssignments(text) {
    const names = new Set();
    const re = /window\.([A-Za-z_$][\w$]*)\s*=/g;
    let m;
    while ((m = re.exec(text)) !== null) names.add(m[1]);
    return names;
}

// Handler names referenced from inline on* attributes. Only simple
// `name(...)` calls count — expressions, method calls (dots), and dynamic
// template interpolation are skipped as unverifiable statically.
function collectHandlerRefs(text, { skipInterpolated } = {}) {
    const refs = new Map(); // name -> first snippet, for the failure message
    const attrRe = /\bon(?:click|change|input|submit|blur|focus|keydown|keyup|touchstart|touchend)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = attrRe.exec(text)) !== null) {
        const body = m[1];
        if (skipInterpolated && body.includes('${')) continue;
        const callRe = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
        let c;
        while ((c = callRe.exec(body)) !== null) {
            const name = c[1];
            if (KEYWORDS.has(name)) continue;
            if (!refs.has(name)) refs.set(name, body.slice(0, 80));
        }
    }
    return refs;
}

const KEYWORDS = new Set([
    'if', 'for', 'while', 'switch', 'return', 'function', 'typeof', 'catch',
    // browser globals legitimately callable from handlers
    'alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'String', 'Number',
    'Boolean', 'requestAnimationFrame', 'setTimeout', 'clearTimeout',
]);

const assigned = collectWindowAssignments(jsText);

describe('window-export wiring', () => {
    it('has window assignments to check against', () => {
        // Sanity floor — main.js alone assigns hundreds; a broken walk or
        // regex would silently pass the tests below.
        expect(assigned.size).toBeGreaterThan(300);
    });

    it('every inline handler in index.html resolves to a window assignment', () => {
        const refs = collectHandlerRefs(htmlText, { skipInterpolated: false });
        const missing = [...refs].filter(([name]) => !assigned.has(name));
        expect(
            missing.map(([name, snippet]) => `${name}  (in: ${snippet})`),
        ).toEqual([]);
    });

    it('every inline handler in JS template strings resolves to a window assignment', () => {
        const refs = collectHandlerRefs(jsText, { skipInterpolated: true });
        const missing = [...refs].filter(([name]) => !assigned.has(name));
        expect(
            missing.map(([name, snippet]) => `${name}  (in: ${snippet})`),
        ).toEqual([]);
    });
});
