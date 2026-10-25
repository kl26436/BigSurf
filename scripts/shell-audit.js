#!/usr/bin/env node
/**
 * Shell audit (SH-1, docs/action-plan-2026-10.md §7) — a STATIC inventory of
 * the app shell: overlay roots, sticky headers, back/close controls, search
 * inputs, and hand-copied safe-area-inset-top rules.
 *
 * Run locally: node scripts/shell-audit.js            (markdown report to stdout)
 *              node scripts/shell-audit.js --write    (also rewrites the block between
 *                                                     the shell-audit markers in
 *                                                     docs/ux-shell-audit-2026-10.md)
 *              node scripts/shell-audit.js --json     (counts as JSON)
 * Run in CI:   node scripts/shell-audit.js --strict   (exits 1 if any budget exceeded)
 *
 * Everything here is regex/heuristic over source text — no browser, no DOM.
 * The phone walk-through (SH-0) is the ground truth; this finds candidates.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');
const STYLES_ROOT = path.join(ROOT, 'styles');
const INDEX_HTML = path.join(ROOT, 'index.html');
const TOKENS_CSS = path.join(STYLES_ROOT, 'tokens.css');
const AUDIT_DOC = path.join(ROOT, 'docs', 'ux-shell-audit-2026-10.md');

const MARKER_START = '<!-- shell-audit:start -->';
const MARKER_END = '<!-- shell-audit:end -->';

// Budgets = the counts on 2026-10-25 with SH-2a in the tree (SH-1 baseline;
// at f9b3a60, before SH-2a, backCloseControlsUnderTap was 7 and
// bodyOverflowWrites 1), so --strict passes today and fails the moment anyone
// adds one. SH-3 (overlay migration) and SH-4 (one header primitive) ratchet
// these to 0 — lower the number when you beat it, never raise it. SH-5 moves
// them into CI.
const BUDGETS = {
    overlayRootsOutsideSheetCss: 13,
    safeAreaTopRulesOutsidePrimitives: 8,
    backCloseControlsUnderTap: 4,
    searchInputsOutsideFieldSearch: 8,
    bodyOverflowWrites: 0,
};

// Overlay roots the inventory skips by construction (SH-1 spec).
// .shell-hud is the SH-0 ?debug strip (pointer-events: none), not an overlay.
const OVERLAY_EXCLUDE = [/^bottom-nav$/, /^toast/, /^app-toast/, /^aw-footer$/, /^shell-hud/];
// Opaque full-page containers that match the overlay shape (fixed + inset 0)
// but are pages, not sheets: listed in the report, NOT counted against
// overlayRootsOutsideSheetCss — they never move into sheet.css.
const PAGE_SHELL_ROOTS = new Set(['full-page-section', 'app-section', 'content-section', 'loading-screen']);
// The primitives that are ALLOWED to carry the status-bar inset (SH-4 target),
// plus the SH-0 HUD's hidden probe, which reads env() back to measure it.
const INSET_PRIMITIVE_FILES = new Set(['page-header.css', 'sheet.css', 'tokens.css', 'shell-hud.css']);
// Lines around each JS/HTML reference to an overlay class that the boolean
// checks (lock, focus trap, Escape, backdrop tap, role) look at.
const REF_WINDOW = 40;
const TAP_PX = 44;

// --- Generic helpers -----------------------------------------------------------

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

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const lineAt = (text, index) => text.slice(0, index).split('\n').length;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace comments with whitespace of the same shape so line numbers survive. */
function stripCssComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
}

/**
 * Flat rule list: [{ selector, body, line }]. Nested at-rules (@media) are
 * handled by only ever matching innermost `selector { decls }` blocks.
 */
function parseCssRules(text) {
    const clean = stripCssComments(text);
    const rules = [];
    const blockRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = blockRe.exec(clean)) !== null) {
        let raw = m[1];
        // Drop anything before the last `;` (e.g. an @import line above the rule).
        const semi = raw.lastIndexOf(';');
        let offset = m.index;
        if (semi !== -1) { offset += semi + 1; raw = raw.slice(semi + 1); }
        const lead = raw.length - raw.trimStart().length;
        const selector = raw.trim();
        if (!selector || selector.startsWith('@')) continue;
        rules.push({ selector, body: m[2], line: lineAt(clean, offset + lead) });
    }
    return rules;
}

/** Declarations → { prop: value } (last declaration wins, !important dropped). */
function parseDecls(body) {
    const decls = {};
    for (const part of body.split(';')) {
        const i = part.indexOf(':');
        if (i === -1) continue;
        const prop = part.slice(0, i).trim().toLowerCase();
        const value = part.slice(i + 1).replace(/!important/i, '').trim();
        if (prop) decls[prop] = value;
    }
    return decls;
}

/** Custom properties declared anywhere in tokens.css (first declaration wins = :root). */
function parseTokens(text) {
    const tokens = {};
    const re = /(--[\w-]+)\s*:\s*([^;{}]+);/g;
    let m;
    const clean = stripCssComments(text);
    while ((m = re.exec(clean)) !== null) {
        if (!(m[1] in tokens)) tokens[m[1]] = m[2].trim();
    }
    return tokens;
}

/**
 * A CSS length → px, resolving var(--x[, fallback]) through tokens and simple
 * `calc(a + b - c)` sums. null if unknown (%, vw, env(), nested calc…).
 */
function resolveLength(value, tokens = {}, depth = 0) {
    if (value == null || depth > 8) return null;
    const v = String(value).trim();
    const calc = v.match(/^calc\((.*)\)$/);
    if (calc) {
        const terms = calc[1].trim().split(/\s+([+-])\s+/);
        let total = resolveLength(terms[0], tokens, depth + 1);
        for (let i = 1; i < terms.length && total != null; i += 2) {
            const n = resolveLength(terms[i + 1], tokens, depth + 1);
            total = n == null ? null : (terms[i] === '+' ? total + n : total - n);
        }
        return total;
    }
    let m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
    if (m) {
        if (m[1] in tokens) return resolveLength(tokens[m[1]], tokens, depth + 1);
        return m[2] ? resolveLength(m[2], tokens, depth + 1) : null;
    }
    m = v.match(/^(-?\d*\.?\d+)(px|rem|em)?$/);
    if (m) {
        const n = parseFloat(m[1]);
        if (!m[2]) return n === 0 ? 0 : null;
        return m[2] === 'px' ? n : n * 16;
    }
    return null;
}

/** Split a selector list on top-level commas. */
function splitSelectors(selector) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of selector) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/** The last compound of a complex selector (the element the rule styles). */
function subjectCompound(sel) {
    const parts = sel.replace(/\s*([>+~])\s*/g, ' ').trim().split(/\s+/);
    return parts[parts.length - 1] || '';
}

/** Class tokens in a compound, ignoring anything inside :not()/:has()/etc. */
function compoundClasses(compound) {
    const noFns = compound.replace(/\([^)]*\)/g, '');
    return [...noFns.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
}

/** First class of the subject compound — `dialog.modal[open]` → `modal`. */
function rootClass(sel) {
    return compoundClasses(subjectCompound(sel))[0] || null;
}

/** Does `selectorText` mention `cls` itself or a BEM child (`cls__x`, `cls--x`)? */
function selectorTouchesClass(selectorText, cls) {
    return new RegExp(`\\.${escapeRe(cls)}(?:__[\\w-]+|--[\\w-]+)?(?![\\w-])`).test(selectorText);
}

const isZero = (v) => v != null && /^0(px|rem|%)?$/.test(v.trim());
/** bottom: 0, or bottom: var(--kb-inset, 0px) — zero whenever the keyboard is down. */
const isBottomAnchored = (v) => isZero(v) || /^var\(\s*--kb-inset\b/.test((v || '').trim());

/**
 * Overlay-root shape: position:fixed plus inset:0 | bottom:0 | top:0 with
 * left:0 and right:0 (inset shorthand, or the long-hands).
 */
function isOverlayRootDecls(decls) {
    if (!/^fixed$/.test(decls.position || '')) return false;
    if (decls.inset != null && /^0(px)?(\s+0(px)?)*$/.test(decls.inset.trim())) return true;
    if (isBottomAnchored(decls.bottom)) return true;
    if (isZero(decls.top) && isZero(decls.left) && isZero(decls.right)) return true;
    return false;
}

/** top: 0, or a var()/calc()/env() that starts at 0 (e.g. calc(0px + env(...))). */
function isTopZeroValue(v) {
    if (v == null) return false;
    const t = v.trim();
    if (isZero(t)) return true;
    if (/^env\(\s*safe-area-inset-top/.test(t)) return true;
    if (/^var\(\s*--safe-top/.test(t)) return true;
    const calc = t.match(/^calc\(\s*(.+)\)$/);
    if (calc) {
        const first = calc[1].split(/\s[+-]\s/)[0].trim();
        return isZero(first) || /^env\(\s*safe-area-inset-top/.test(first) || /^var\(\s*--safe-top/.test(first);
    }
    return false;
}

function isStickyTopDecls(decls) {
    return /^sticky$/.test(decls.position || '') && isTopZeroValue(decls.top);
}

/** A class whose -/_ segments include back, close or dismiss (not backdrop/background). */
function isBackCloseClass(cls) {
    return cls.split(/[-_]+/).some((seg) => seg === 'back' || seg === 'close' || seg === 'dismiss');
}

/** Is index `idx` of `line` inside a ' " or ` string literal (single-line count)? */
function inStringLiteral(line, idx) {
    const before = line.slice(0, idx);
    return ['\'', '"', '`'].some((q) => (before.split(q).length - 1) % 2 === 1);
}

/** Lines in source files that reference `cls` inside a string (class=, querySelector, classList). */
function findClassRefs(srcFiles, cls) {
    const re = new RegExp(`(?<![\\w-])${escapeRe(cls)}(?![\\w-])`, 'g');
    const refs = [];
    for (const f of srcFiles) {
        const lines = f.text.split('\n');
        lines.forEach((line, i) => {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(line)) !== null) {
                if (inStringLiteral(line, m.index)) { refs.push({ rel: f.rel, line: i + 1 }); break; }
            }
        });
    }
    return refs;
}

// --- Section 1: overlay roots ---------------------------------------------------

const FLAG_RES = {
    lock: /\blockPage\s*\(|body\.style\.overflow/,
    focusTrap: /_trapHandler|\binert\b|showModal\s*\(|\bopenModal\s*\(/,
    escape: /['"]Escape['"]|['"]Esc['"]|showModal\s*\(|\bopenModal\s*\(/,
    backdropTap: /\b\w*backdrop\w*\.(onclick|addEventListener\(\s*['"]click)|(?:e|ev|evt|event)\.target\s*===|===\s*(?:e|ev|evt|event)\.target\b|class="[^"]*(backdrop|overlay)[^"]*"[^>]*onclick=/i,
    role: /role=["']dialog["']|['"]role['"]\s*,\s*['"]dialog['"]|aria-modal|<dialog\b/,
};

function findOverlayRoots(cssFiles) {
    const byClass = new Map();
    for (const f of cssFiles) {
        for (const rule of parseCssRules(f.text)) {
            if (!isOverlayRootDecls(parseDecls(rule.body))) continue;
            for (const sel of splitSelectors(rule.selector)) {
                const cls = rootClass(sel);
                if (!cls || OVERLAY_EXCLUDE.some((re) => re.test(cls))) continue;
                if (!byClass.has(cls)) byClass.set(cls, { cls, locs: [], selectors: [], files: new Set() });
                const e = byClass.get(cls);
                e.locs.push(`${f.rel}:${rule.line}`);
                e.selectors.push(sel);
                e.files.add(path.posix.basename(f.rel));
            }
        }
    }
    return [...byClass.values()];
}

/**
 * Classes the page lock covers by selector, independent of call sites:
 * page-lock.js's OVERLAY_SELECTOR list (SH-2a), plus `.modal` while the legacy
 * initModalScrollLock body.style.overflow toggle still exists.
 */
function findLockedClasses(srcFiles) {
    const out = new Set();
    for (const f of srcFiles) {
        const m = f.text.match(/OVERLAY_SELECTOR\s*=\s*\[([\s\S]*?)\]\s*(?:\.join|;)/);
        if (m) {
            for (const s of m[1].matchAll(/['"`]([^'"`]+)['"`]/g)) {
                for (const sel of splitSelectors(s[1])) {
                    const cls = rootClass(sel);
                    if (cls) out.add(cls);
                }
            }
        }
        if (/function initModalScrollLock[\s\S]{0,600}body\.style\.overflow/.test(f.text)) out.add('modal');
    }
    return out;
}

/** Booleans for one overlay root (CSS facts are exact-ish; JS facts are windowed heuristics). */
function overlayFlags(root, cssFiles, srcFiles, lockedClasses = findLockedClasses(srcFiles)) {
    const cls = root.cls;
    const touching = [];
    for (const f of cssFiles) {
        for (const rule of parseCssRules(f.text)) {
            if (selectorTouchesClass(rule.selector, cls)) touching.push(rule.body);
        }
    }
    const css = touching.join('\n');
    const refs = findClassRefs(srcFiles, cls);
    const windows = [];
    for (const ref of refs) {
        const f = srcFiles.find((s) => s.rel === ref.rel);
        // The page-lock module names every overlay it covers; that's handled
        // exactly by lockedClasses — don't let its lockPage() leak into windows.
        if (/OVERLAY_SELECTOR\s*=/.test(f.text)) continue;
        const lines = f.text.split('\n');
        windows.push(lines.slice(Math.max(0, ref.line - 1 - REF_WINDOW), ref.line + REF_WINDOW).join('\n'));
    }
    const js = windows.join('\n');
    // Covered by selector: the class itself, its `-backdrop` / `-overlay` sibling
    // (aw-sheet ↔ aw-sheet-backdrop, more-menu ↔ more-menu-overlay), or a locked
    // class sharing a class="" / className = '' with it.
    const clsRe = new RegExp(`(?<![\\w-])${escapeRe(cls)}(?![\\w-])`);
    const coClassed = srcFiles.some((f) => [...f.text.matchAll(/\bclass(?:Name)?\s*=\s*["'`]([^"'`]*)["'`]/g)]
        .some((a) => clsRe.test(a[1]) && a[1].split(/\s+/).some((c) => lockedClasses.has(c))));
    const selectorCovered = lockedClasses.has(cls) || lockedClasses.has(`${cls}-backdrop`) ||
        lockedClasses.has(`${cls}-overlay`) || coClassed;
    return {
        jsFiles: [...new Set(refs.map((r) => r.rel))].sort(),
        lock: selectorCovered || FLAG_RES.lock.test(js),
        overscroll: /overscroll-behavior/.test(css),
        kbInset: /--kb-inset/.test(css),
        safeBottom: /safe-area-inset-bottom/.test(css),
        focusTrap: FLAG_RES.focusTrap.test(js),
        escape: FLAG_RES.escape.test(js),
        backdropTap: FLAG_RES.backdropTap.test(js),
        role: FLAG_RES.role.test(js) || root.selectors.some((s) => /^dialog\b/.test(subjectCompound(s))),
    };
}

// --- Section 2: sticky headers ----------------------------------------------------

function findStickyHeaders(cssFiles, srcFiles) {
    const out = [];
    const allRules = cssFiles.flatMap((f) => parseCssRules(f.text).map((r) => ({ ...r, rel: f.rel })));
    for (const rule of allRules) {
        if (!isStickyTopDecls(parseDecls(rule.body))) continue;
        for (const sel of splitSelectors(rule.selector)) {
            const cls = rootClass(sel);
            if (!cls) continue;
            // Merge every rule whose subject is this class (same-class variants, media queries).
            const merged = allRules
                .filter((r) => splitSelectors(r.selector).some((s) => rootClass(s) === cls && compoundClasses(subjectCompound(s))[0] === cls))
                .map((r) => r.body).join(';');
            out.push({
                cls,
                loc: `${rule.rel}:${rule.line}`,
                selector: sel,
                inset: /safe-area-inset-top|--safe-top/.test(merged),
                minHeight: /(^|;|\s)min-height\s*:/.test(merged),
                usedIn: [...new Set(findClassRefs(srcFiles, cls).map((r) => r.rel))].sort(),
            });
        }
    }
    return out;
}

// --- Section 3: back / close controls ---------------------------------------------

function findBackCloseControls(cssFiles, tokens) {
    const byClass = new Map();
    for (const f of cssFiles) {
        for (const rule of parseCssRules(f.text)) {
            for (const sel of splitSelectors(rule.selector)) {
                const subject = subjectCompound(sel);
                // ::before/::after carry the visual circle, not the hit area.
                if (/::?(before|after)\b/.test(subject)) continue;
                const subjectClasses = compoundClasses(subject);
                const cls = subjectClasses.find(isBackCloseClass);
                if (!cls) continue;
                if (!byClass.has(cls)) byClass.set(cls, { cls, loc: `${f.rel}:${rule.line}`, decls: {} });
                const d = parseDecls(rule.body);
                const e = byClass.get(cls);
                for (const p of ['width', 'height', 'min-width', 'min-height']) if (d[p] != null) e.decls[p] = d[p];
            }
        }
    }
    return [...byClass.values()].map((e) => {
        const w = resolveLength(e.decls.width, tokens);
        const h = resolveLength(e.decls.height, tokens);
        const mw = resolveLength(e.decls['min-width'], tokens);
        const mh = resolveLength(e.decls['min-height'], tokens);
        const hitW = (w == null && mw == null) ? null : Math.max(w || 0, mw || 0);
        const hitH = (h == null && mh == null) ? null : Math.max(h || 0, mh || 0);
        const known = [hitW, hitH].filter((n) => n != null);
        return {
            cls: e.cls,
            loc: e.loc,
            declared: e.decls,
            hitW,
            hitH,
            unknown: known.length === 0,
            underTap: known.some((n) => n < TAP_PX),
        };
    }).sort((a, b) => a.loc.localeCompare(b.loc, 'en', { numeric: true }));
}

const BACK_CLOSE_MARKUP = /fa-arrow-left|fa-chevron-left|fa-times\b|fa-xmark|×|&times;|aria-label=["'](Back|Close)["']/;

/** <button …>…</button> elements in JS template strings / index.html with a back/close glyph. */
function findRenderedBackCloseButtons(srcFiles) {
    const out = [];
    for (const f of srcFiles) {
        const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
        let m;
        while ((m = re.exec(f.text)) !== null) {
            if (!BACK_CLOSE_MARKUP.test(m[0])) continue;
            const own = (m[1].match(/class=["']([^"']*)["']/) || [])[1] || '';
            // Best effort: nearest preceding class attribute that looks like a header/wrapper.
            const before = f.text.slice(Math.max(0, m.index - 1500), m.index);
            const wrappers = [...before.matchAll(/class=["']([^"'$]*)["']/g)].map((x) => x[1]);
            const wrapper = [...wrappers].reverse().find((c) => /header|head\b|__head|__top|toolbar|nav\b|title-row|topbar/.test(c)) || '';
            out.push({ loc: `${f.rel}:${lineAt(f.text, m.index)}`, cls: own.trim(), wrapper: wrapper.trim() });
        }
    }
    return out;
}

// --- Section 4: search inputs ------------------------------------------------------

const VOID_TAGS = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'wbr']);

/** class="" of the still-open ancestor tags at the end of an HTML fragment (innermost first). */
function enclosingClasses(fragment) {
    const tags = [...fragment.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g)];
    const out = [];
    let depth = 0;
    for (let i = tags.length - 1; i >= 0; i--) {
        const [, closing, name, attrs] = tags[i];
        if (VOID_TAGS.has(name.toLowerCase()) || /\/\s*$/.test(attrs)) continue;
        if (closing) { depth++; continue; }
        if (depth > 0) { depth--; continue; }
        out.push((attrs.match(/class=["']([^"']*)["']/) || [])[1] || '');
    }
    return out;
}

function findSearchInputs(srcFiles) {
    const out = [];
    for (const f of srcFiles) {
        const lines = f.text.split('\n');
        const re = /<input\b[^>]*>/g;
        let m;
        while ((m = re.exec(f.text)) !== null) {
            const tag = m[0];
            if (!/type=["']search["']|placeholder=["']Search/.test(tag)) continue;
            const line = lineAt(f.text, m.index);
            const startOfWindow = lines.slice(0, Math.max(0, line - 6)).join('\n').length;
            const ctx = f.text.slice(startOfWindow, m.index);
            const id = (tag.match(/\bid=["']([^"']*)["']/) || [])[1] || '';
            const inFieldSearch = /field-search/.test(tag) || enclosingClasses(ctx).some((c) => /field-search/.test(c));
            out.push({ loc: `${f.rel}:${line}`, id, inFieldSearch });
        }
    }
    return out;
}

// --- Section 5: inset copies + body overflow writes --------------------------------

function findInsetCopies(cssFiles) {
    const out = [];
    for (const f of cssFiles) {
        if (INSET_PRIMITIVE_FILES.has(path.posix.basename(f.rel))) continue;
        stripCssComments(f.text).split('\n').forEach((line, i) => {
            const n = (line.match(/env\(\s*safe-area-inset-top/g) || []).length;
            for (let k = 0; k < n; k++) out.push({ loc: `${f.rel}:${i + 1}`, text: line.trim() });
        });
    }
    return out;
}

function findBodyOverflowWrites(jsFiles) {
    const out = [];
    for (const f of jsFiles) {
        f.text.split('\n').forEach((line, i) => {
            if (/document\.body\.style\.overflow\s*=(?!=)/.test(line)) out.push(`${f.rel}:${i + 1}`);
        });
    }
    return out;
}

// --- Inventory + report --------------------------------------------------------------

function buildInventory({ cssFiles, srcFiles, jsFiles, tokens }) {
    const lockedClasses = findLockedClasses(srcFiles);
    const overlays = findOverlayRoots(cssFiles)
        .map((r) => ({ ...r, pageShell: PAGE_SHELL_ROOTS.has(r.cls), ...overlayFlags(r, cssFiles, srcFiles, lockedClasses) }))
        .sort((a, b) => a.locs[0].localeCompare(b.locs[0], 'en', { numeric: true }));
    const sticky = findStickyHeaders(cssFiles, srcFiles);
    const controls = findBackCloseControls(cssFiles, tokens);
    const buttons = findRenderedBackCloseButtons(srcFiles);
    const searches = findSearchInputs(srcFiles);
    const insets = findInsetCopies(cssFiles);
    const overflowWrites = findBodyOverflowWrites(jsFiles);
    const counts = {
        overlayRootsOutsideSheetCss: overlays.filter((o) => !o.pageShell && ![...o.files].every((b) => b === 'sheet.css')).length,
        safeAreaTopRulesOutsidePrimitives: insets.length,
        backCloseControlsUnderTap: controls.filter((c) => c.underTap).length,
        searchInputsOutsideFieldSearch: searches.filter((s) => !s.inFieldSearch).length,
        bodyOverflowWrites: overflowWrites.length,
    };
    return { overlays, sticky, controls, buttons, searches, insets, overflowWrites, counts, tapSm: resolveLength('var(--tap-sm)', tokens) };
}

const yn = (b) => (b ? 'yes' : '**no**');
const px = (n) => (n == null ? '?' : `${n}`);
const cell = (s) => String(s || '—').replace(/\|/g, '\\|');

function renderMarkdown(inv) {
    const L = [];
    const c = inv.counts;
    L.push('## Static inventory (SH-1)');
    L.push('');
    L.push('Generated by `node scripts/shell-audit.js --write` — do not edit between the markers. ' +
        '**Heuristic:** regex over source text. CSS facts (position, inset, sizes) are parsed per rule; ' +
        `JS facts (page lock, focus trap, Escape, backdrop tap, role) are "does the code within ±${REF_WINDOW} lines of a ` +
        'string reference to the class mention it", so a yes can be borrowed from a neighbouring overlay and a no can hide ' +
        'a lock done elsewhere. Confirm on the phone (SH-0).');
    L.push('');
    L.push('| Budget (SH-5) | Count | Budget |');
    L.push('|---|---:|---:|');
    for (const [k, v] of Object.entries(c)) L.push(`| \`${k}\` | ${v} | ${BUDGETS[k]} |`);
    L.push('');
    L.push(`Also: ${inv.overlays.filter((o) => !o.pageShell).length} overlay roots (+${inv.overlays.filter((o) => o.pageShell).length} page shells) · ${inv.sticky.length} sticky headers · ${inv.controls.length} back/close CSS classes ` +
        `(${inv.controls.filter((x) => x.unknown).length} with no declared size) · ${inv.buttons.length} rendered back/close buttons · ` +
        `${inv.searches.length} search inputs. \`--tap\` = ${TAP_PX}px, \`--tap-sm\` = ${px(inv.tapSm)}px.`);
    L.push('');

    L.push('### 1. Overlay roots');
    L.push('');
    L.push('`position: fixed` + (`inset: 0` | `bottom: 0` / `bottom: var(--kb-inset…)` | `top/left/right: 0`), deduped to the root class; ' +
        '`.bottom-nav`, toasts and `.aw-footer` excluded. Overscroll / kb-inset / safe-bottom look at the class and its BEM children (`__x`, `--x`). ' +
        'Lock = the class (or its `-backdrop` sibling, or a class sharing its `class=""`) is in page-lock.js `OVERLAY_SELECTOR` / is a `.modal` under ' +
        'the legacy `initModalScrollLock`, or `lockPage()` / `body.style.overflow` appears near a reference.');
    L.push('');
    const overlayTable = (list) => {
        L.push('| Root | Defined at | JS that references it | Lock | Overscroll | kb-inset | Safe bottom | Focus trap | Escape | Backdrop tap | role/aria-modal |');
        L.push('|---|---|---|---|---|---|---|---|---|---|---|');
        for (const o of list) {
            L.push(`| \`.${o.cls}\` | ${o.locs.join('<br>')} | ${cell(o.jsFiles.join('<br>'))} | ${yn(o.lock)} | ${yn(o.overscroll)} | ${yn(o.kbInset)} | ${yn(o.safeBottom)} | ${yn(o.focusTrap)} | ${yn(o.escape)} | ${yn(o.backdropTap)} | ${yn(o.role)} |`);
        }
        L.push('');
    };
    overlayTable(inv.overlays.filter((o) => !o.pageShell));
    L.push(`Full-page shells with the same shape (pages, not sheets — listed, not budgeted): ${inv.overlays.filter((o) => o.pageShell).map((o) => `\`.${o.cls}\` (${o.locs.join(', ')})`).join(' · ') || 'none'}.`);
    L.push('');

    L.push('### 2. Sticky headers');
    L.push('');
    L.push('`position: sticky` with `top: 0` (or a calc/env/var starting at 0). Inset = any rule on the class carries `safe-area-inset-top`.');
    L.push('');
    L.push('| Selector | Defined at | Carries inset | min-height | Used in |');
    L.push('|---|---|---|---|---|');
    for (const s of inv.sticky) {
        L.push(`| \`${cell(s.selector)}\` | ${s.loc} | ${yn(s.inset)} | ${yn(s.minHeight)} | ${cell(s.usedIn.join('<br>'))} |`);
    }
    L.push('');

    L.push('### 3. Back / close controls');
    L.push('');
    L.push(`CSS classes with a \`back\` / \`close\` / \`dismiss\` segment as the rule subject. Hit = max(width, min-width) × max(height, min-height) after resolving tokens; under = either side < ${TAP_PX}px. "?" = not declared (sized by padding/content — check on the phone).`);
    L.push('');
    L.push('| Class | First rule | Declared | Hit (px) | Under tap |');
    L.push('|---|---|---|---|---|');
    for (const x of inv.controls) {
        const declared = Object.entries(x.declared).map(([k, v]) => `${k}: ${v}`).join('; ');
        L.push(`| \`.${x.cls}\` | ${x.loc} | ${cell(declared)} | ${px(x.hitW)} × ${px(x.hitH)} | ${x.underTap ? '**yes**' : (x.unknown ? '?' : 'no')} |`);
    }
    L.push('');
    L.push(`Rendered \`<button>\`s with \`fa-arrow-left\` / \`fa-chevron-left\` / \`fa-times\` / \`fa-xmark\` / \`×\` / \`aria-label="Back|Close"\` (${inv.buttons.length}). Wrapper = nearest preceding header-ish class (best effort).`);
    L.push('');
    L.push('| Where | Button class | Wrapper |');
    L.push('|---|---|---|');
    for (const b of inv.buttons) L.push(`| ${b.loc} | ${cell(b.cls)} | ${cell(b.wrapper)} |`);
    L.push('');

    L.push('### 4. Search inputs');
    L.push('');
    L.push('`<input type="search">` or `placeholder="Search…"` in js/ + index.html; "in .field-search" = `field-search` on the tag or on a still-open ancestor tag in the 5 lines above. Whether the results list or the sheet is the scroll container is left to SH-0.');
    L.push('');
    L.push('| Where | id | In .field-search |');
    L.push('|---|---|---|');
    for (const s of inv.searches) L.push(`| ${s.loc} | ${cell(s.id)} | ${yn(s.inFieldSearch)} |`);
    L.push('');

    L.push('### 5. Inset copies');
    L.push('');
    L.push('`env(safe-area-inset-top)` in styles/ outside `page-header.css`, `sheet.css`, `tokens.css` (and the SH-0 HUD probe in `shell-hud.css`); comments ignored.');
    L.push('');
    L.push('| Where | Rule |');
    L.push('|---|---|');
    for (const i of inv.insets) L.push(`| ${i.loc} | \`${cell(i.text)}\` |`);
    L.push('');
    L.push(`\`document.body.style.overflow\` writes in js/: ${inv.overflowWrites.length ? inv.overflowWrites.join(', ') : 'none'}.`);
    return L.join('\n');
}

function replaceBetweenMarkers(doc, content) {
    const s = doc.indexOf(MARKER_START);
    const e = doc.indexOf(MARKER_END);
    if (s === -1 || e === -1 || e < s) return null;
    return `${doc.slice(0, s + MARKER_START.length)}\n${content}\n${doc.slice(e)}`;
}

function newAuditDoc(content) {
    return [
        '# UX shell audit — 2026-10',
        '',
        'Static inventory is generated by `node scripts/shell-audit.js --write`; the phone walk-through table (SH-0) is filled by hand below it.',
        '',
        MARKER_START,
        content,
        MARKER_END,
        '',
        '## Phone walk-through (SH-0)',
        '',
        '| Screen / sheet | Header impl | back top vs sat | back size | Locks page? | Keyboard: list scrolls inside? | Safe-area bottom ok? | Other | Sev |',
        '|---|---|---|---|---|---|---|---|---|',
        '',
    ].join('\n');
}

function loadRepo() {
    const read = (f) => ({ rel: rel(f), text: fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') });
    const cssFiles = walk(STYLES_ROOT, (f) => f.endsWith('.css')).sort().map(read);
    const jsFiles = walk(JS_DIR, (f) => f.endsWith('.js') && !f.includes('node_modules')).sort().map(read);
    const srcFiles = [...jsFiles, ...(fs.existsSync(INDEX_HTML) ? [read(INDEX_HTML)] : [])];
    const tokens = fs.existsSync(TOKENS_CSS) ? parseTokens(fs.readFileSync(TOKENS_CSS, 'utf8')) : {};
    return { cssFiles, jsFiles, srcFiles, tokens };
}

function main(argv) {
    const inv = buildInventory(loadRepo());
    if (argv.includes('--json')) {
        console.log(JSON.stringify(inv.counts, null, 2));
    } else {
        console.log(renderMarkdown(inv));
    }
    if (argv.includes('--write')) {
        const md = renderMarkdown(inv);
        const existing = fs.existsSync(AUDIT_DOC) ? fs.readFileSync(AUDIT_DOC, 'utf8').replace(/\r\n/g, '\n') : null;
        const next = existing == null ? newAuditDoc(md) : replaceBetweenMarkers(existing, md);
        if (next == null) {
            console.error(`  ✘ ${rel(AUDIT_DOC)} has no ${MARKER_START} … ${MARKER_END} block.`);
            process.exit(1);
        }
        fs.writeFileSync(AUDIT_DOC, next);
        console.error(`  wrote ${rel(AUDIT_DOC)}`);
    }
    const over = Object.entries(inv.counts).filter(([k, v]) => v > BUDGETS[k]);
    if (over.length) {
        const msg = over.map(([k, v]) => `${k} ${v} > ${BUDGETS[k]}`).join(', ');
        if (argv.includes('--strict')) {
            console.error(`  ✘ Shell budgets exceeded: ${msg}`);
            process.exit(1);
        }
        console.error(`  ⚠ Over budget: ${msg} (no --strict, exiting 0)`);
    }
}

module.exports = {
    BUDGETS,
    stripCssComments,
    parseCssRules,
    parseDecls,
    parseTokens,
    resolveLength,
    splitSelectors,
    subjectCompound,
    rootClass,
    isOverlayRootDecls,
    isStickyTopDecls,
    isTopZeroValue,
    isBackCloseClass,
    inStringLiteral,
    findClassRefs,
    findLockedClasses,
    findOverlayRoots,
    overlayFlags,
    findStickyHeaders,
    findBackCloseControls,
    findRenderedBackCloseButtons,
    findSearchInputs,
    findInsetCopies,
    findBodyOverflowWrites,
    buildInventory,
    renderMarkdown,
    replaceBetweenMarkers,
    newAuditDoc,
};

if (require.main === module) main(process.argv.slice(2));
