// SH-1 — scripts/shell-audit.js parsers, on small inline CSS/JS strings.
// The script is CommonJS; its CLI is guarded by require.main, so importing it
// runs nothing.
import {
    parseCssRules,
    parseDecls,
    parseTokens,
    resolveLength,
    rootClass,
    isOverlayRootDecls,
    isStickyTopDecls,
    isBackCloseClass,
    findOverlayRoots,
    findLockedClasses,
    overlayFlags,
    findStickyHeaders,
    findBackCloseControls,
    findRenderedBackCloseButtons,
    findSearchInputs,
    findInsetCopies,
    findBodyOverflowWrites,
    replaceBetweenMarkers,
    newAuditDoc,
} from '../../scripts/shell-audit.js';

const tokens = parseTokens(':root {\n  --tap: 44px;\n  --tap-sm: 36px;\n  --alias: var(--tap);\n}');
const css = (rel, text) => ({ rel, text });

describe('CSS parsing', () => {
    it('keeps line numbers through comments and nested @media', () => {
        const rules = parseCssRules('/* a\n b */\n.x { color: red; }\n@media (min-width: 1px) {\n  .y { top: 0; }\n}');
        expect(rules.map((r) => [r.selector, r.line])).toEqual([['.x', 3], ['.y', 5]]);
    });

    it('rootClass takes the first class of the subject compound', () => {
        expect(rootClass('dialog.modal[open]')).toBe('modal');
        expect(rootClass('body.locked .aw-sheet.visible')).toBe('aw-sheet');
        expect(rootClass('.modal:not(.hidden)')).toBe('modal');
    });
});

describe('token resolution', () => {
    it('var(--tap) resolves to 44 and --tap-sm to 36', () => {
        expect(resolveLength('var(--tap)', tokens)).toBe(44);
        expect(resolveLength('var(--tap-sm)', tokens)).toBe(36);
        expect(resolveLength('var(--alias)', tokens)).toBe(44);
    });

    it('handles px, rem, fallbacks and simple calc sums', () => {
        expect(resolveLength('36px', tokens)).toBe(36);
        expect(resolveLength('2.75rem', tokens)).toBe(44);
        expect(resolveLength('var(--missing, 40px)', tokens)).toBe(40);
        expect(resolveLength('calc(var(--tap) + 12px)', tokens)).toBe(56);
        expect(resolveLength('50%', tokens)).toBeNull();
    });
});

describe('overlay roots', () => {
    it('fixed + inset:0 is an overlay root; fixed + bottom:80px is not', () => {
        expect(isOverlayRootDecls(parseDecls('position: fixed; inset: 0;'))).toBe(true);
        expect(isOverlayRootDecls(parseDecls('position: fixed; bottom: var(--kb-inset, 0px); left: 0;'))).toBe(true);
        expect(isOverlayRootDecls(parseDecls('position: fixed; top: 0; left: 0; right: 0;'))).toBe(true);
        expect(isOverlayRootDecls(parseDecls('position: fixed; top: 0; left: 50%;'))).toBe(false);
        expect(isOverlayRootDecls(parseDecls('position: fixed; bottom: 80px; left: 50%;'))).toBe(false);
        expect(isOverlayRootDecls(parseDecls('position: absolute; inset: 0;'))).toBe(false);
    });

    it('dedupes to the root class and skips the excluded chrome', () => {
        const roots = findOverlayRoots([
            css('styles/a.css', '.my-sheet { position: fixed; inset: 0; }\ndialog.my-sheet { position: fixed; inset: 0; }'),
            css('styles/b.css', '.bottom-nav { position: fixed; bottom: 0; }\n.app-toast { position: fixed; inset: 0; }\n.aw-footer { position: fixed; bottom: 0; }'),
        ]);
        expect(roots.map((r) => r.cls)).toEqual(['my-sheet']);
        expect(roots[0].locs).toEqual(['styles/a.css:1', 'styles/a.css:2']);
    });

    it('flags: CSS facts from the class + BEM children, JS facts from nearby code', () => {
        const cssFiles = [css('styles/s.css', [
            '.my-sheet { position: fixed; bottom: var(--kb-inset, 0px); left: 0; right: 0; }',
            '.my-sheet__body { overflow-y: auto; overscroll-behavior: contain; }',
        ].join('\n'))];
        const srcFiles = [{
            rel: 'js/x.js',
            text: [
                'export function openIt() {',
                "    const el = document.createElement('div');",
                "    el.className = 'my-sheet';",
                "    el.setAttribute('role', 'dialog');",
                "    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });",
                '}',
            ].join('\n'),
        }];
        const [root] = findOverlayRoots(cssFiles);
        const f = overlayFlags(root, cssFiles, srcFiles, new Set());
        expect(f).toMatchObject({
            jsFiles: ['js/x.js'], lock: false, overscroll: true, kbInset: true,
            safeBottom: false, escape: true, role: true, focusTrap: false,
        });
    });

    it('lock comes from page-lock OVERLAY_SELECTOR (incl. the -backdrop sibling)', () => {
        const srcFiles = [{
            rel: 'js/core/ui/page-lock.js',
            text: "const OVERLAY_SELECTOR = [\n    '.my-sheet-backdrop.visible',\n    'dialog.modal[open]',\n].join(', ');",
        }];
        const locked = findLockedClasses(srcFiles);
        expect([...locked].sort()).toEqual(['modal', 'my-sheet-backdrop']);
        const cssFiles = [css('styles/s.css', '.my-sheet { position: fixed; inset: 0; }')];
        const [root] = findOverlayRoots(cssFiles);
        expect(overlayFlags(root, cssFiles, srcFiles, locked).lock).toBe(true);
    });
});

describe('sticky headers', () => {
    it('sticky + top:0 (or calc starting at 0) is a sticky header; inset + min-height reported', () => {
        expect(isStickyTopDecls(parseDecls('position: sticky; top: 0;'))).toBe(true);
        expect(isStickyTopDecls(parseDecls('position: sticky; top: calc(0px + env(safe-area-inset-top));'))).toBe(true);
        expect(isStickyTopDecls(parseDecls('position: sticky; top: 56px;'))).toBe(false);
        const [h] = findStickyHeaders(
            [css('styles/h.css', '.my-head { position: sticky; top: 0; min-height: 56px; padding-top: env(safe-area-inset-top); }')],
            [{ rel: 'index.html', text: '<header class="my-head"></header>' }],
        );
        expect(h).toMatchObject({ cls: 'my-head', inset: true, minHeight: true, usedIn: ['index.html'] });
    });
});

describe('back / close controls', () => {
    it('matches back/close/dismiss segments, not backdrop/background/feedback', () => {
        expect(isBackCloseClass('page-header__back')).toBe(true);
        expect(isBackCloseClass('modal-fallback-close')).toBe(true);
        expect(isBackCloseClass('chip__dismiss')).toBe(true);
        expect(isBackCloseClass('aw-sheet-backdrop')).toBe(false);
        expect(isBackCloseClass('feedback-row')).toBe(false);
    });

    it('a 36px back button is under tap; var(--tap) is not; ::before is ignored', () => {
        const controls = findBackCloseControls([css('styles/b.css', [
            '.x-back { width: 36px; height: 36px; }',
            '.y-close { width: var(--tap); height: var(--tap); }',
            '.y-close::before { width: 30px; height: 30px; }',
            '.z-dismiss { width: 20px; min-width: var(--tap); min-height: var(--tap-sm); }',
            '.q-back i { width: 10px; }',
        ].join('\n'))], tokens);
        const by = Object.fromEntries(controls.map((c) => [c.cls, c]));
        expect(by['x-back']).toMatchObject({ hitW: 36, hitH: 36, underTap: true });
        expect(by['y-close']).toMatchObject({ hitW: 44, hitH: 44, underTap: false });
        expect(by['z-dismiss']).toMatchObject({ hitW: 44, hitH: 36, underTap: true });
        expect(by['q-back']).toBeUndefined();
    });

    it('finds rendered back/close buttons and their header wrapper', () => {
        const [b] = findRenderedBackCloseButtons([{
            rel: 'js/p.js',
            text: '`<div class="page-header">\n  <button class="page-header__back" aria-label="Back"><i class="fas fa-arrow-left"></i></button>\n</div>`',
        }]);
        expect(b).toEqual({ loc: 'js/p.js:2', cls: 'page-header__back', wrapper: 'page-header' });
    });
});

describe('search inputs', () => {
    it('reports whether a search input sits in a .field-search wrapper', () => {
        const hits = findSearchInputs([{
            rel: 'index.html',
            text: [
                '<div class="field-search">',
                '  <input type="search" id="a">',
                '</div>',
                '<div class="other">',
                '  <input type="text" placeholder="Search equipment…" id="b">',
                '</div>',
                '<input type="text" placeholder="Name">',
            ].join('\n'),
        }]);
        expect(hits).toEqual([
            { loc: 'index.html:2', id: 'a', inFieldSearch: true },
            { loc: 'index.html:5', id: 'b', inFieldSearch: false },
        ]);
    });
});

describe('inset copies + body overflow writes', () => {
    it('counts env(safe-area-inset-top) outside the primitives, ignoring comments', () => {
        const insets = findInsetCopies([
            css('styles/pages/x.css', '/* env(safe-area-inset-top) */\n.a { padding-top: env(safe-area-inset-top, 0px); }'),
            css('styles/components/page-header.css', '.b { padding-top: env(safe-area-inset-top); }'),
            css('styles/tokens.css', ':root { --safe-top: env(safe-area-inset-top); }'),
        ]);
        expect(insets.map((i) => i.loc)).toEqual(['styles/pages/x.css:2']);
    });

    it('counts document.body.style.overflow writes, not reads', () => {
        const hits = findBodyOverflowWrites([{
            rel: 'js/a.js',
            text: "document.body.style.overflow = 'hidden';\nif (document.body.style.overflow === 'hidden') {}",
        }]);
        expect(hits).toEqual(['js/a.js:1']);
    });
});

describe('audit doc', () => {
    it('replaces only the marker block', () => {
        const doc = newAuditDoc('old');
        const next = replaceBetweenMarkers(doc, 'new');
        expect(next).toContain('<!-- shell-audit:start -->\nnew\n<!-- shell-audit:end -->');
        expect(next).toContain('## Phone walk-through (SH-0)');
        expect(next).not.toContain('\nold\n');
        expect(replaceBetweenMarkers('# no markers', 'x')).toBeNull();
    });
});
