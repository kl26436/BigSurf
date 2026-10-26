// SH-4 — one header: every page header is a .page-header (modifiers for the
// workout, editor, detail and bleed layouts), so the status-bar inset comes
// from one rule. Static scan over the rendered markup.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
function files(dir, ext) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...files(p, ext));
        else if (p.endsWith(ext)) out.push(p);
    }
    return out;
}
const sources = [...files(path.join(ROOT, 'js'), '.js'), path.join(ROOT, 'index.html')]
    .map(f => ({ f: path.relative(ROOT, f), s: fs.readFileSync(f, 'utf8') }));

describe('one page header (SH-4)', () => {
    it('no markup uses the retired header classes', () => {
        const retired = /class="(d-header|aw-header|we-header|edit-exercise-header|detail-page-header|equip-lib-header)"|class="(d-back|detail-page-header__back)"/;
        const hits = sources.filter(({ s }) => retired.test(s)).map(({ f }) => f);
        expect(hits).toEqual([]);
    });

    it('every .page-header block has at most one back/close control and no inline padding-top', () => {
        for (const { f, s } of sources) {
            const re = /<(div|header)[^>]*class="page-header[^"]*"[^>]*>/g;
            let m;
            while ((m = re.exec(s))) {
                expect(m[0], `${f}: inline style on a page header`).not.toMatch(/style="[^"]*padding-top/);
                const block = s.slice(m.index, s.indexOf(`</${m[1]}>`, m.index) + 6);
                const controls = block.match(/class="page-header__(back|close)"/g) || [];
                expect(controls.length, `${f}: ${controls.length} back/close in one header`).toBeLessThanOrEqual(1);
            }
        }
    });

    it('the status-bar inset is written only in the primitives', () => {
        const cssFiles = files(path.join(ROOT, 'styles'), '.css').map(f => path.relative(ROOT, f).split(path.sep).join('/'));
        const allowed = ['styles/components/page-header.css', 'styles/components/sheet.css', 'styles/tokens.css', 'styles/components/shell-hud.css'];
        const offenders = cssFiles.filter(f => !allowed.includes(f))
            .filter(f => /env\(safe-area-inset-top/.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
        expect(offenders).toEqual([]);
    });
});
