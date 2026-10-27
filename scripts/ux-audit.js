#!/usr/bin/env node
/**
 * UX-consistency audit (UD-6, docs/ux-deep-dive-2026-10.md §5).
 *
 * design-audit guards tokens and shell-audit guards overlays/headers; nothing
 * guarded the layer above them — rows, section heads, backs, routes, the
 * formatters and the words. Each metric here is one of those prose rules,
 * counted; BUDGETS start at the count on the day they landed and only go down
 * as UD-1…UD-5 land. Rides `audit:design:strict` like the shell budgets.
 *
 *   node scripts/ux-audit.js           # counts + every hit
 *   node scripts/ux-audit.js --strict  # exit 1 when over budget
 */

const fs = require('fs');
const path = require('path');
const { stringLiterals, visibleFromLiteral, walk } = require('./jargon-audit.js');
const { htmlVisibleLines } = require('./copy-lint.js');

const ROOT = path.resolve(__dirname, '..');

const BUDGETS = {
    // Flex rows named -row / __row / -item / __item / -entry defined outside
    // components/cards.css. DS-1: a list item is a .row-card.
    rowClassesOutsideCardsCss: 50,
    // Classes that render a section head. Target: .dash-section-head + .sec-head
    // (titled heads) and .group-label (grouped settings).
    sectionHeadClasses: 9,
    // Distinct letter-spacing values on uppercase rules (the eyebrow).
    eyebrowLetterSpacingValues: 7,
    // Closers that hide a page section by hand instead of navigateBack().
    sectionHiddenByHand: 2,
    // Sections in navigation.js SECTION_IDS with no routeToView case.
    sectionsWithoutRoute: 0,
    // Places that compose "… ago" themselves. Target: one helper.
    relativeTimeImplementations: 12,
    // 'lb' / 'lbs' / 'kg' typed next to a value in visible text — use the unit helper.
    hardcodedUnitLiterals: 2,
    // Words the user never sees (UD-5 word table): location, orphan, mapped,
    // picker, program; and weight-first set notation ("185 lb × 6").
    uxWordHits: 90,
};

// A row is a component name for a list item — set rows and menu rows may
// keep component names; everything else moves to .row-card.
const ROW_NAME = /^[a-z][\w-]*(?:-row|__row|-item|__item|-entry)$/;
const HEAD_CLASSES = [
    'sec-head', 'group-label', 'dash-section-head', 'd-sec-head', 'section-title',
    'more-menu-section-title', 'equip-group-header', 'gym-detail__group-header',
    'template-editor__section-label', 'detail-breakdown-head',
];

const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
// Windows checkouts may carry CRLF in the working tree; the regexes expect \n.
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const stripCss = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');

function cssRules(text) {
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text))) out.push({ selector: m[1].trim(), body: m[2] });
    return out;
}

function audit(root = ROOT) {
    const styles = walkCss(path.join(root, 'styles'));
    const jsFiles = walk(path.join(root, 'js')).filter((f) => f.endsWith('.js'));
    const indexHtml = read(path.join(root, 'index.html'));
    const hits = {};
    const add = (k, h) => (hits[k] = hits[k] || []).push(h);

    // --- rows, heads, eyebrows ------------------------------------------------
    const rowClasses = new Map();
    const definedHeads = new Set();
    const eyebrowSpacing = new Set();
    for (const f of styles) {
        const r = rel(f);
        for (const { selector, body } of cssRules(stripCss(read(f)))) {
            const last = selector.split(',').map((s) => s.trim());
            for (const sel of last) {
                const m = sel.match(/^\.([a-zA-Z][\w-]*)$/);
                if (!m) continue;
                const cls = m[1];
                if (HEAD_CLASSES.includes(cls)) definedHeads.add(cls);
                if (r !== 'styles/components/cards.css' && ROW_NAME.test(cls)
                    && /display:\s*flex/.test(body) && /align-items:\s*center/.test(body)) {
                    rowClasses.set(cls, r);
                }
            }
            if (/text-transform:\s*uppercase/.test(body)) {
                const ls = body.match(/letter-spacing:\s*([^;]+)/);
                if (ls) eyebrowSpacing.add(ls[1].trim());
            }
        }
    }
    for (const [cls, f] of rowClasses) add('rowClassesOutsideCardsCss', `.${cls}  (${f})`);
    for (const cls of definedHeads) add('sectionHeadClasses', `.${cls}`);
    for (const v of eyebrowSpacing) add('eyebrowLetterSpacingValues', v);

    // --- sections hidden by hand, sections without a route ------------------------
    const navSrc = read(path.join(root, 'js/core/ui/navigation.js'));
    const ids = (navSrc.match(/SECTION_IDS\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1]
        .match(/'([\w-]+)'/g)?.map((s) => s.slice(1, -1)) || [];
    const routeBody = (navSrc.match(/function routeToView\([\s\S]*?\n}\n/) || [''])[0];
    const cases = new Set([...routeBody.matchAll(/case '([\w-]+)'/g)].map((m) => m[1]));
    for (const id of ids) {
        const view = id.replace(/-section$/, '');
        if (!cases.has(view) && !cases.has(id)) add('sectionsWithoutRoute', id);
    }
    // A close*() that hides a *-section itself and never calls navigateBack().
    for (const f of jsFiles) {
        if (rel(f) === 'js/core/ui/navigation.js') continue;
        const src = read(f);
        for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(close\w*)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/gm)) {
            const body = m[2];
            const section = body.match(/getElementById\('([\w-]+-section)'\)/);
            if (section && /classList\.add\('hidden'\)/.test(body) && !/navigateBack\(/.test(body)) {
                const line = src.slice(0, m.index).split('\n').length;
                add('sectionHiddenByHand', `${rel(f)}:${line}  ${m[1]} → #${section[1]}`);
            }
        }
    }

    // --- formatters and words (visible text) ------------------------------------
    const UNIT = /(?:\d|⁣)\s?(?:lbs?|kg)\b/;
    const WORDS = /\b(locations?|orphans?|mapped|picker|programs?)\b/i;
    const WEIGHT_FIRST = /\b(?:lbs?|kg)\s*×/;
    // "location" is right for the phone's position (GPS, permission) — the
    // word table only bans it for the place you train.
    const DEVICE_LOCATION = /\b(your|GPS|current|device)\s+location|location\s+(access|permission|services)|detecting/gi;
    const scanVisible = (file, line, visible) => {
        for (const seg of visible.split('\n')) {
            const t = seg.trim();
            if (!t) continue;
            if (UNIT.test(t)) add('hardcodedUnitLiterals', `${file}:${line}  ${t.slice(0, 80)}`);
            if (WORDS.test(t.replace(DEVICE_LOCATION, ' '))) add('uxWordHits', `${file}:${line}  ${t.slice(0, 80)}`);
            if (WEIGHT_FIRST.test(t)) add('uxWordHits', `${file}:${line}  ${t.slice(0, 80)}  [weight-first]`);
        }
    };
    const SKIP = /equipment-catalog|debug-utilities|shell-hud|coach-context|coach-live-context|coach-guards|-migration|gym-profile|plain-language/;
    for (const f of jsFiles) {
        const r = rel(f);
        if (SKIP.test(r)) continue;
        const src = read(f);
        const lines = src.split('\n');
        // "… ago" composed in place: a literal ending/containing " ago" that
        // isn't inside the one helper.
        for (const lit of stringLiterals(src)) {
            const ln = lines[lit.line - 1] || '';
            if (/copy-ok|console\.|debugLog\(|new Error\(/.test(ln)) continue;
            if (/\bago\b/.test(lit.text) && !/^\s*\/\//.test(ln)) add('relativeTimeImplementations', `${r}:${lit.line}  ${lit.text.slice(0, 50)}`);
            const visible = visibleFromLiteral(lit);
            if (visible) scanVisible(r, lit.line, visible);
        }
    }
    // index.html visible text — copy-lint's reader (tags spanning lines,
    // comments and scripts dropped; aria-label / placeholder / title kept).
    const rawLines = indexHtml.split('\n');
    htmlVisibleLines(indexHtml).forEach((visible, i) => {
        if (/copy-ok/.test(rawLines[i] || '')) return;
        scanVisible('index.html', i + 1, visible.split('\n').join(' '));
    });
    // A relative-time helper counts once per file, not once per literal.
    const rtFiles = new Set((hits.relativeTimeImplementations || []).map((h) => h.split(':')[0]));
    const relCount = rtFiles.size;

    const counts = {};
    for (const k of Object.keys(BUDGETS)) counts[k] = (hits[k] || []).length;
    counts.relativeTimeImplementations = relCount;
    return { counts, hits };
}

function walkCss(dir) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walkCss(full));
        else if (e.name.endsWith('.css') && !e.name.startsWith('tokens')) out.push(full);
    }
    return out;
}

module.exports = { BUDGETS, audit };

if (require.main === module) {
    const { counts, hits } = audit();
    let over = false;
    console.log('\n  ── Big Surf UX-consistency audit (UD-6) ─────────────────');
    for (const [k, budget] of Object.entries(BUDGETS)) {
        const v = counts[k];
        if (v > budget) over = true;
        console.log(`  ${k.padEnd(32)} ${String(v).padStart(5)}  / budget ${String(budget).padStart(5)}  ${v > budget ? ' OVER' : '  ok'}`);
    }
    console.log('');
    for (const [k, list] of Object.entries(hits)) {
        console.log(`  ${k} (${list.length}):`);
        list.slice(0, process.argv.includes('--all') ? Infinity : 60).forEach((h) => console.log(`    ${h}`));
        console.log('');
    }
    if (process.argv.includes('--strict') && over) process.exit(1);
}
