// @vitest-environment jsdom
//
// 10/27 bug log: "Unexpected identifier 's'. Expected ')' to end an argument
// list." — the live coach's "Machine's taken" chip rendered as
// onclick="liveCoachChip('Machine&#39;s taken')", and the browser decodes
// &#39; back to ' before parsing the handler. escapeJsArg is the escaper for
// a quoted JS string inside an inline handler; this file proves the round
// trip through a real HTML parser and guards the source against the old
// pattern coming back.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { escapeJsArg } from '../../js/core/ui/ui-helpers.js';

/** Render a handler the way the app does, let the HTML parser decode it, run it. */
function roundTrip(value, quote = "'") {
    const host = document.createElement('div');
    const open = quote === "'" ? "'" : '&quot;';
    host.innerHTML = `<button onclick="got(${open}${escapeJsArg(value)}${open})">x</button>`;
    const code = host.firstElementChild.getAttribute('onclick'); // HTML-decoded
    let received;
    // eslint-disable-next-line no-new-func
    new Function('got', code)((v) => { received = v; });
    return received;
}

const TRICKY = [
    "Machine's taken",
    "Gold's Gym — Hammer Strength",
    'He said "go heavy"',
    'back\\slash and \\n literal',
    'line one\nline two',
    'tab\tand\r\nwindows',
    'a </button><script>x</script> b',
    '&amp; already an entity',
    'template `${x}` literal',
    "both ' and \" quotes",
    'line separator',
    '',
];

describe('escapeJsArg', () => {
    it.each(TRICKY)('round-trips %j through a single-quoted handler argument', (v) => {
        expect(roundTrip(v, "'")).toBe(v);
    });

    it.each(TRICKY)('round-trips %j through a &quot;-quoted handler argument', (v) => {
        expect(roundTrip(v, '"')).toBe(v);
    });

    it('stringifies numbers instead of dropping 0', () => {
        expect(escapeJsArg(0)).toBe('0');
        expect(escapeJsArg(null)).toBe('');
        expect(escapeJsArg(undefined)).toBe('');
    });

    it('the live coach chip parses', () => {
        expect(roundTrip("Machine's taken")).toBe("Machine's taken");
    });
});

// ---------------------------------------------------------------- source guard

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

/** [start,end) of every on<event>="…" value in a template, honoring ${…} nesting. */
function handlerSpans(src) {
    const spans = [];
    const re = /\son[a-z]+="/g;
    let m;
    while ((m = re.exec(src))) {
        const start = m.index + m[0].length;
        let i = start, depth = 0;
        for (; i < src.length && i - start < 4000; i++) {
            if (src.startsWith('${', i)) { depth++; i++; continue; }
            const ch = src[i];
            if (depth > 0) { if (ch === '{') depth++; else if (ch === '}') depth--; continue; }
            if (ch === '"' || ch === '`') break;
        }
        if (src[i] === '"') spans.push([start, i]);
    }
    return spans;
}

describe('no handler argument is escaped with escapeAttr / escapeHtml', () => {
    const root = path.resolve(__dirname, '../../js');
    const files = walk(root);

    it('inside on…="…" attributes', () => {
        const bad = [];
        for (const f of files) {
            const src = fs.readFileSync(f, 'utf8');
            for (const [a, b] of handlerSpans(src)) {
                const span = src.slice(a, b);
                if (/(escapeAttr|escapeHtml)\(/.test(span)) {
                    bad.push(`${path.relative(root, f)}:${src.slice(0, a).split('\n').length}`);
                }
            }
        }
        expect(bad).toEqual([]);
    });

    it('in handler strings built for onclick (call arguments)', () => {
        // `fn('${escapeAttr(x)}')`, `, '${escapeAttr(x)}'` and `'${escapeAttr(x)}'`
        // fragments are always JS — they end up in onclick="${…}" via
        // openSheet actions, row callbacks and the like.
        const bad = [];
        const re = /'\$\{(escapeAttr|escapeHtml)\(/g;
        for (const f of files) {
            const src = fs.readFileSync(f, 'utf8');
            let m;
            while ((m = re.exec(src))) {
                const before = src.slice(Math.max(0, m.index - 80), m.index);
                if (/[A-Za-z_$][\w$.]*\(\s*$/.test(before) || /,\s*$/.test(before) || /`$/.test(before)) {
                    bad.push(`${path.relative(root, f)}:${src.slice(0, m.index).split('\n').length}`);
                }
            }
        }
        expect(bad).toEqual([]);
    });
});
