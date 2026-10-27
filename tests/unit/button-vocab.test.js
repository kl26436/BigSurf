// DS-3 — one button vocabulary. Every `btn*` class in markup is one of the
// vocabulary's, a size/color modifier sits on a `.btn`, and every `.btn*`
// rule lives in styles/components/buttons.css. A component that needs its own
// button shape names it after the component (.tpl-start, .exlib-add-btn).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const VOCAB = new Set([
    'btn', 'btn-primary', 'btn-secondary', 'btn-ghost', 'btn-success', 'btn-danger',
    'btn-text', 'btn-text-small', 'btn-icon', 'btn-icon--filled',
    'btn-sm', 'btn-small', 'btn-lg', 'btn-block', 'btn-full',
]);
// These modify a .btn; on their own they render without its size and spacing.
const NEEDS_BASE = new Set(['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-success', 'btn-danger', 'btn-sm', 'btn-small', 'btn-lg']);

const walk = (dir, ext) => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name), ext) : e.name.endsWith(ext) ? [join(dir, e.name)] : []);

const classLists = () => [...walk('js', '.js'), 'index.html'].flatMap((f) => {
    const src = readFileSync(f, 'utf8');
    return [...src.matchAll(/class="([^"]*)"/g)].map(m => ({ file: f, tokens: m[1].split(/\s+/).filter(Boolean) }));
});

describe('button vocabulary (DS-3)', () => {
    it('every btn* class in markup is in the vocabulary', () => {
        const stray = classLists().flatMap(({ file, tokens }) => tokens.filter(t => /^btn/.test(t) && !VOCAB.has(t)).map(t => `${file}: ${t}`));
        expect(stray).toEqual([]);
    });

    it('size / color modifiers sit on a .btn', () => {
        const bare = classLists().filter(({ tokens }) => tokens.some(t => NEEDS_BASE.has(t)) && !tokens.includes('btn'))
            .map(({ file, tokens }) => `${file}: ${tokens.join(' ')}`);
        expect(bare).toEqual([]);
    });

    it('every .btn* rule is defined in buttons.css', () => {
        const outside = walk('styles', '.css')
            .filter(f => !/[\\/]components[\\/]buttons\.css$/.test(f) && !/[\\/]reset\.css$/.test(f))
            .flatMap(f => readFileSync(f, 'utf8').split('\n')
                .map((ln, i) => (/^\s*\.btn[\w-]*\s*[,{:]/.test(ln) ? `${f}:${i + 1} ${ln.trim()}` : null)).filter(Boolean));
        expect(outside).toEqual([]);
    });
});
