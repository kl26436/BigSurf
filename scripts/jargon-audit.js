#!/usr/bin/env node
/**
 * Jargon in user-visible strings (TP-0b) — the `jargonInUiStrings` budget in
 * design-audit.js.
 *
 * A plain literal scan counts ~270 lines, nearly all identifiers
 * (`intent === 'deload'`, `display: block`, class names), so this reads
 * VISIBLE TEXT only:
 *   - in a string that contains HTML: the text nodes, plus aria-label /
 *     placeholder / title / alt values;
 *   - in any other string: only when it reads as prose (two+ words, and a
 *     capital start, sentence punctuation or a common English word) — so
 *     'block-ui hidden' and 'deload' don't count, 'Deload session' does;
 *   - index.html: text nodes and the same attributes.
 * Skipped: comments, console / debugLog lines, debug-only modules, and any
 * line carrying `// copy-ok: <reason>`.
 *
 * The word list is plain-language.js's (via its functions/ mirror, which is CJS).
 *
 *   node scripts/jargon-audit.js          # count + every hit
 */

const fs = require('fs');
const path = require('path');
const { findJargon } = require('../functions/plain-language.js');

const ROOT = path.resolve(__dirname, '..');
const SKIP_FILES = new Set([
    'js/core/utils/debug-utilities.js',
    'js/core/utils/shell-hud.js',
    // Tool errors returned to the MODEL (it reads weekTarget / setDelta words
    // to fix its call); the coach's answer to the user is checked by the eval.
    'js/core/features/coach-guards.js',
]);

// ── A small JS tokenizer: string literals with their line, nothing else ──

const REGEX_PREV = /[(,=:[!&|?{};+\-*%<>~^]$/;
const REGEX_KEYWORD = /\b(return|typeof|case|in|of|delete|void|throw|new|yield|await)$/;

/**
 * Every string literal in `src`: { text, line, template }. Template literals
 * report their static text with each `${…}` replaced by a space; strings
 * inside the expressions are reported as their own literals.
 */
function stringLiterals(src) {
    const out = [];
    let i = 0;
    let line = 1;
    let lastSig = '';           // last significant code character (for regex detection)
    let lastWord = '';
    const n = src.length;

    const advance = (ch) => { if (ch === '\n') line++; };

    function readQuoted(q) {
        const startLine = line;
        let text = '';
        i++;
        while (i < n && src[i] !== q) {
            if (src[i] === '\\') { text += src[i + 1] === 'n' ? ' ' : (src[i + 1] || ''); i += 2; continue; }
            if (src[i] === '\n') break; // unterminated — bail at end of line
            text += src[i++];
        }
        i++;
        out.push({ text, line: startLine, template: false });
    }

    function readTemplate() {
        const startLine = line;
        let text = '';
        i++;
        while (i < n && src[i] !== '`') {
            if (src[i] === '\\') { text += src[i + 1] || ''; i += 2; continue; }
            if (src[i] === '$' && src[i + 1] === '{') {
                i += 2;
                text += ' ';
                readCode(1);
                continue;
            }
            advance(src[i]);
            text += src[i++];
        }
        i++;
        out.push({ text, line: startLine, template: true });
    }

    function readRegex() {
        i++;
        let inClass = false;
        while (i < n) {
            const c = src[i];
            if (c === '\\') { i += 2; continue; }
            if (c === '\n') break;
            if (c === '[') inClass = true;
            else if (c === ']') inClass = false;
            else if (c === '/' && !inClass) { i++; break; }
            i++;
        }
        while (i < n && /[a-z]/i.test(src[i])) i++;
    }

    /** Code until the brace depth returns to 0 (depth 0 = top level: until EOF). */
    function readCode(depth) {
        while (i < n) {
            const c = src[i];
            const d = src[i + 1];
            if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
            if (c === '/' && d === '*') {
                i += 2;
                while (i < n && !(src[i] === '*' && src[i + 1] === '/')) advance(src[i++]);
                i += 2;
                continue;
            }
            if (c === '\'' || c === '"') { readQuoted(c); lastSig = 'x'; lastWord = ''; continue; }
            if (c === '`') { readTemplate(); lastSig = 'x'; lastWord = ''; continue; }
            if (c === '/' && (lastSig === '' || REGEX_PREV.test(lastSig) || REGEX_KEYWORD.test(lastWord))) {
                readRegex(); lastSig = 'x'; lastWord = ''; continue;
            }
            if (depth > 0) {
                if (c === '{') depth++;
                else if (c === '}') { depth--; if (depth === 0) { i++; return; } }
            }
            advance(c);
            if (!/\s/.test(c)) {
                lastSig = c;
                lastWord = /[\w$]/.test(c) ? (lastWord + c) : '';
            }
            i++;
        }
    }

    readCode(0);
    return out;
}

// ── Visible text ─────────────────────────────────────────────────────

const VISIBLE_ATTRS = /\b(?:aria-label|placeholder|title|alt)\s*=\s*"([^"]*)"/gi;
const STOPWORDS = /\b(the|a|an|to|of|your|you|this|that|in|is|for|on|and|or|it|be|next|last|week|set|sets|reps|weight|session|workout)\b/i;

function htmlVisibleText(html) {
    const parts = [];
    let m;
    VISIBLE_ATTRS.lastIndex = 0;
    while ((m = VISIBLE_ATTRS.exec(html))) parts.push(m[1]);
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        // Quote-aware: an attribute like onfocus="… => …" must not end the tag.
        .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, '\n');
    parts.push(text);
    return parts.join('\n');
}

function looksLikeProse(s) {
    const t = s.trim();
    if (!t || !/\s/.test(t)) return false;
    if (/^[\w-]+\s*:\s*[^\s]/.test(t) && /;/.test(t)) return false; // inline CSS
    if (/^[a-z0-9_\- .#:[\]>=*()]+$/.test(t) && !STOPWORDS.test(t)) return false; // class lists, selectors
    return /^[A-Z]/.test(t) || /[—.,?!’']/.test(t) || STOPWORDS.test(t);
}

function visibleFromLiteral(lit) {
    if (/<[a-zA-Z/!]/.test(lit.text)) return htmlVisibleText(lit.text);
    return looksLikeProse(lit.text) ? lit.text : '';
}

/**
 * Jargon hits in one source file.
 * @param {string} src
 * @param {{html?: boolean, file?: string}} [opts]
 * @returns {{file: string, line: number, term: string, match: string, text: string}[]}
 */
function scanSource(src, { html = false, file = '' } = {}) {
    const lines = src.split('\n');
    const optedOut = (ln) => /\/\/\s*copy-ok\b|<!--\s*copy-ok\b/.test(lines[ln - 1] || '');
    const hits = [];
    if (html) {
        // Line-aware: scan each line's visible text so hits keep a line number.
        const body = src.replace(/<script[\s\S]*?<\/script>/gi, (m) => m.replace(/[^\n]/g, ' '))
            .replace(/<style[\s\S]*?<\/style>/gi, (m) => m.replace(/[^\n]/g, ' '));
        body.split('\n').forEach((ln, idx) => {
            if (optedOut(idx + 1)) return;
            for (const j of findJargon(htmlVisibleText(ln))) hits.push({ file, line: idx + 1, term: j.term, match: j.match, text: ln.trim().slice(0, 120) });
        });
        return hits;
    }
    for (const lit of stringLiterals(src)) {
        const ln = lines[lit.line - 1] || '';
        if (optedOut(lit.line) || /\bconsole\.\w+\(|\bdebugLog\(/.test(ln)) continue;
        const visible = visibleFromLiteral(lit);
        if (!visible) continue;
        for (const j of findJargon(visible)) hits.push({ file, line: lit.line, term: j.term, match: j.match, text: lit.text.replace(/\s+/g, ' ').trim().slice(0, 120) });
    }
    return hits;
}

function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full));
        else if (e.name.endsWith('.js')) out.push(full);
    }
    return out;
}

/** Every hit across js/ and index.html. */
function scanRepo(root = ROOT) {
    const hits = [];
    for (const f of walk(path.join(root, 'js'))) {
        const rel = path.relative(root, f).replace(/\\/g, '/');
        if (SKIP_FILES.has(rel)) continue;
        hits.push(...scanSource(fs.readFileSync(f, 'utf8'), { file: rel }));
    }
    const indexPath = path.join(root, 'index.html');
    if (fs.existsSync(indexPath)) hits.push(...scanSource(fs.readFileSync(indexPath, 'utf8'), { html: true, file: 'index.html' }));
    return hits;
}

module.exports = { stringLiterals, scanSource, scanRepo, looksLikeProse };

if (require.main === module) {
    const hits = scanRepo();
    for (const h of hits) console.log(`${h.file}:${h.line}  ${h.match}  — ${h.text}`);
    console.log(`\n${hits.length} jargon hit(s) in user-visible strings`);
}
