// TP-0b — the visible-text jargon scanner behind design-audit's
// `jargonInUiStrings` budget. Identifiers and class names never count;
// text a user can read always does.

import { describe, it, expect } from 'vitest';
import audit from '../../scripts/jargon-audit.js';

const { scanSource, stringLiterals } = audit;
const count = (src, opts) => scanSource(src, opts).length;

describe('jargon-audit scanSource', () => {
    it('counts text nodes, not class names or attributes', () => {
        expect(count('el.innerHTML = `<div class="block">Lighter week</div>`;')).toBe(0);
        expect(count('el.innerHTML = `<span>RPE ${x}</span>`;')).toBe(1);
        expect(count('el.innerHTML = `<button aria-label="Deload week" class="x"></button>`;')).toBe(1);
    });

    it('counts prose strings handed to the user, not identifiers', () => {
        expect(count("showNotification('Deload set');")).toBe(1);
        expect(count("if (intent.mode === 'deload') return;")).toBe(0);
        expect(count("el.style.display = 'block';")).toBe(0);
        expect(count("const cls = 'block-page hidden';")).toBe(0);
    });

    it('a quote-aware tag: an arrow function in an attribute does not leak', () => {
        expect(count('h = `<input onfocus="setTimeout(() => this.scrollIntoView({ block: \'start\' }), 200)">`;')).toBe(0);
    });

    it('skips comments, regex literals, console lines and // copy-ok', () => {
        expect(count("// Deload week text\nconst re = /deload|recovery/i;")).toBe(0);
        expect(count("console.log('Deload week for user');")).toBe(0);
        expect(count("showNotification('Deload set'); // copy-ok: test")).toBe(0);
    });

    it('template expressions are scanned as their own literals', () => {
        const lits = stringLiterals('x = `a ${cond ? `<b>Deload week</b>` : \'\'} c`;').map(l => l.text);
        expect(lits).toContain('<b>Deload week</b>');
        expect(count('x = `a ${cond ? `<b>Deload week</b>` : \'\'} c`;')).toBe(1);
    });

    it('index.html: text nodes and visible attributes, not scripts', () => {
        expect(count('<div>Your block</div>\n<script>const deload = "Deload week";</script>', { html: true })).toBe(1);
        expect(count('<input placeholder="RPE">', { html: true })).toBe(1);
    });

    it('the repo is at zero', () => {
        expect(audit.scanRepo()).toEqual([]);
    });
});
