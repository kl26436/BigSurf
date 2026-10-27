#!/usr/bin/env node
/**
 * Copy lint (DS-5) — CLAUDE.md "User-Facing Copy Rules", made executable.
 *
 * Replaces copy-lint.sh, whose greps matched code (every spread operator,
 * every PascalCase identifier) and printed hundreds of lines nobody read —
 * which is how the rules drifted. This reads VISIBLE TEXT only, with the same
 * extractor as jargon-audit.js (text nodes, aria-label / placeholder / title /
 * alt, prose-looking strings), and checks:
 *
 *   title-case      two capitalised words in a row ("Swap Exercise") — sentence
 *                   case; brands, categories, weekdays, months, acronyms and
 *                   exercise names exempt
 *   please          "Please …"
 *   ellipsis        "..." (use …)
 *   cannot          "cannot" (use can't)
 *   are-you-sure    "Are you sure"
 *   successfully    "successfully"
 *   success-bang    a success toast ending in "!"
 *   cancel-ok       a button labelled Cancel / OK / Submit (name the action)
 *   template        "template(s)" in user copy (it's "workout")
 *   native-dialog   window.confirm / alert / prompt (use confirmSheet / promptSheet / showNotification)
 *   icon-button     an icon-only <button> without aria-label
 *
 * Skipped: comments, console / debugLog / thrown-error lines, debug-only and
 * data modules (exercise / equipment names are names, not copy), the coach's
 * context builders (text for the model), and any line carrying
 * `// copy-ok: <reason>` (or `<!-- copy-ok -->` in index.html).
 *
 *   node scripts/copy-lint.js            # every hit + counts
 *   node scripts/copy-lint.js --strict   # exit 1 on any hit
 */

const fs = require('fs');
const path = require('path');
const { stringLiterals, visibleFromLiteral, walk } = require('./jargon-audit.js');

const ROOT = path.resolve(__dirname, '..');
const EXPR = '⁣'; // what jargon-audit puts where a `${…}` was

// Data, debug and model-context modules: their strings are names, developer
// text or text for the coach — not copy.
const SKIP_FILES = new Set([
    'js/core/utils/debug-utilities.js',
    'js/core/utils/shell-hud.js',
    'js/core/data/equipment-catalog.js',
    'js/core/data/equipment-catalog-helpers.js',
    'js/core/data/equipment-migration.js',
    'js/core/data/equipment-id-migration-runner.js',
    'js/core/features/gym-profile.js',
    'js/core/features/coach-guards.js',
    'js/core/features/coach-context.js',
    'js/core/features/coach-context-builder.js',
    'js/core/features/coach-live-context.js',
]);

// C-1 exceptions: brands, named categories, days, months, acronyms, gym names.
const EXEMPT = new Set(`
Big Surf Withings DEXA Google Firebase Apple Android iOS iPhone Chrome Safari Leaflet OpenStreetMap Claude Anthropic YouTube
Push Pull Legs Core Cardio Arms Shoulders Chest Back Glutes Calves Abs Biceps Triceps Quads Hamstrings Other
Monday Tuesday Wednesday Thursday Friday Saturday Sunday Mon Tue Wed Thu Fri Sat Sun
January February March April May June July August September October November December Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec
AI PR PRs GPS BW URL RPE CSV JSON ID OK
Hammer Strength Life Fitness Cybex Matrix Precor Technogym Nautilus Panatta Arsenal Rogers Newtech Prime Hoist Atlantis
Superset Bellagio Absolute Recomp Downtown Uptown Hurst
`.split(/\s+/).filter(Boolean));
// Exercise names are names ("e.g. Bench Press") — a pair of exercise words is exempt.
const EXERCISE_WORDS = new Set(`
Bench Press Incline Decline Dumbbell Barbell Cable Machine Overhead Leg Extension Curl Row Squat Deadlift Fly Flye
Raise Lateral Pulldown Pec Deck Smith Hack Goblet Romanian Hip Thrust Calf Seated Standing Lying Chest Shoulder
Triceps Biceps Pushdown Crunch Plank Lunge Split Pull Up Push Dip Face Rear Delt Shrug Preacher Hammer Lat Bulgarian
`.split(/\s+/).filter(Boolean));
// Proper names that happen to be two capitalised words.
const EXEMPT_PAIRS = new Set(['Home Screen', 'Cloud Storage', 'Workout Tracker', 'Fit Evo', 'Full Body', 'Upper Body', 'Lower Body']);

const TITLE_PAIR = /\b([A-Z][a-z]+)[ \t]+([A-Z][a-z]+)\b/g;

function titleCaseHits(text) {
    const hits = [];
    // Each sentence / fragment separately: "Done. Next" is two sentences.
    for (const frag of text.split(/[.!?:;·•—\n|()"“”]+/)) {
        TITLE_PAIR.lastIndex = 0;
        let m;
        while ((m = TITLE_PAIR.exec(frag))) {
            if (EXEMPT.has(m[1]) || EXEMPT.has(m[2]) || EXEMPT_PAIRS.has(m[0])) continue;
            if (EXERCISE_WORDS.has(m[1]) && EXERCISE_WORDS.has(m[2])) continue;
            hits.push(m[0]);
        }
    }
    return hits;
}

const TEXT_RULES = [
    ['please', /\bplease\b/i],
    ['ellipsis', /\.\.\./],
    ['cannot', /\bcannot\b/i],
    ['are-you-sure', /\bare you sure\b/i],
    ['successfully', /\bsuccessfully\b/i],
    ['template', /\btemplates?\b/i],
];

const ICON_BUTTON = /<button\b(?![^>]*\baria-label=)[^>]*>\s*<i\b[^>]*>\s*<\/i>\s*<\/button>/g;
const CANCEL_TEXT = /^(Cancel|OK|Ok|Submit)$/;
const VISIBLE_ATTRS = /\b(?:aria-label|placeholder|title|alt)\s*=\s*"([^"]*)"/gi;

function scanVisible(visible, push) {
    for (const seg of visible.split('\n')) {
        const t = seg.replace(new RegExp(EXPR, 'g'), ' ').trim();
        if (!t) continue;
        // URLs and example links aren't prose ("https://youtube.com/watch?v=...").
        const prose = t.replace(/\bhttps?:\/\/\S+/g, ' ');
        if (CANCEL_TEXT.test(t)) push('cancel-ok', t);
        for (const [rule, re] of TEXT_RULES) if (re.test(prose)) push(rule, t);
        for (const pair of titleCaseHits(prose)) push('title-case', pair);
    }
}

/**
 * index.html as visible text per line: tags (even ones spanning lines) become
 * their visible attributes, comments and scripts disappear, line numbers stay.
 */
function htmlVisibleLines(src) {
    const keepLines = (m) => m.replace(/[^\n]/g, ' ');
    const body = src
        .replace(/<script[\s\S]*?<\/script>/gi, keepLines)
        .replace(/<style[\s\S]*?<\/style>/gi, keepLines)
        .replace(/<!--[\s\S]*?-->/g, keepLines)
        .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, (tag) => {
            const attrs = [];
            let m;
            VISIBLE_ATTRS.lastIndex = 0;
            while ((m = VISIBLE_ATTRS.exec(tag))) attrs.push(m[1]);
            const nl = (tag.match(/\n/g) || []).length;
            // Attributes as separate segments (split again below); the tag's
            // own newlines are kept so line numbers stay right.
            return ` ${attrs.join('   ')} ${'\n'.repeat(nl)}`;
        });
    return body.split('\n').map(l => l.split(' ').join('\n'));
}

/**
 * Copy-rule hits in one source.
 * @returns {{file: string, line: number, rule: string, text: string}[]}
 */
function lintSource(src, { html = false, file = '' } = {}) {
    const lines = src.split('\n');
    const optedOut = (ln) => /\/\/\s*copy-ok\b|<!--\s*copy-ok\b/.test(lines[ln - 1] || '');
    const hits = [];
    const add = (line, rule, text) => hits.push({ file, line, rule, text: String(text).replace(/\s+/g, ' ').replace(new RegExp(EXPR, 'g'), '…').slice(0, 100) });
    if (html) {
        htmlVisibleLines(src).forEach((visible, idx) => {
            if (optedOut(idx + 1)) return;
            scanVisible(visible, (rule, text) => add(idx + 1, rule, text));
        });
        // Icon-only buttons in the markup (tags may span lines).
        ICON_BUTTON.lastIndex = 0;
        let m;
        while ((m = ICON_BUTTON.exec(src))) {
            const line = src.slice(0, m.index).split('\n').length;
            if (!optedOut(line)) add(line, 'icon-button', m[0]);
        }
    } else {
        for (const lit of stringLiterals(src)) {
            // Developer text: logs, thrown errors, captured warnings — on the
            // literal's line or the call just above it.
            const ln = `${lines[lit.line - 2] || ''}\n${lines[lit.line - 1] || ''}`;
            if (optedOut(lit.line) || /\bconsole\.\w+\(|\bdebugLog\(|\bnew Error\(|\bthrow\b|\bcaptureWarning\(/.test(ln)) continue;
            const push = (rule, text) => add(lit.line, rule, text);
            const visible = visibleFromLiteral(lit);
            if (visible) scanVisible(visible, push);
            // Icon-only buttons need a name (C-10) — anywhere in an HTML string.
            if (/<button/.test(lit.text)) {
                ICON_BUTTON.lastIndex = 0;
                let m;
                while ((m = ICON_BUTTON.exec(lit.text))) {
                    const line = lit.line + (lit.text.slice(0, m.index).match(/\n/g) || []).length;
                    if (!optedOut(line)) add(line, 'icon-button', m[0]);
                }
            }
        }
        // Code-level rules (outside strings and comments).
        let inBlock = false;
        lines.forEach((ln, idx) => {
            const trimmed = ln.trim();
            if (inBlock) { if (trimmed.includes('*/')) inBlock = false; return; }
            if (trimmed.startsWith('/*')) { if (!trimmed.includes('*/')) inBlock = true; return; }
            if (trimmed.startsWith('*') || trimmed.startsWith('//') || optedOut(idx + 1)) return;
            const code = ln.replace(/\/\/.*$/, '');
            if (/(^|[^\w.$])(window\.)?(confirm|alert|prompt)\(/.test(code) && !/function\s+(confirm|alert|prompt)\b/.test(code)) {
                add(idx + 1, 'native-dialog', trimmed);
            }
            if (/showNotification\(\s*[`'"][^`'"]*!\s*[`'"]\s*,\s*'success'/.test(code)) add(idx + 1, 'success-bang', trimmed);
            if (/\b(?:label|cancelLabel|confirmLabel)\s*:\s*'(Cancel|OK|Ok|Submit)'/.test(code)) add(idx + 1, 'cancel-ok', trimmed);
        });
    }
    // A confirm / prompt sheet without its own cancelLabel shows the default
    // "Cancel" — name the action ("Keep workout", "Keep editing").
    if (!html) {
        // promptSheet's default is "Close" (a text field you can just leave);
        // a confirm needs the action named.
        const call = /\b(confirmSheet)\(\{/g;
        let m;
        while ((m = call.exec(src))) {
            // The options object, braces balanced (titles hold `${f({ … })}`).
            let depth = 0;
            let end = m.index + m[0].length - 1;
            for (; end < src.length; end++) {
                if (src[end] === '{') depth++;
                else if (src[end] === '}' && --depth === 0) break;
            }
            const body = src.slice(m.index, end);
            const line = src.slice(0, m.index).split('\n').length;
            if (!/\bcancelLabel\b/.test(body) && !optedOut(line)) add(line, 'cancel-ok', `${m[1]} without cancelLabel`);
        }
    }
    // One hit per (line, rule, text).
    const seen = new Set();
    return hits.filter(h => { const k = `${h.line}|${h.rule}|${h.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function lintRepo(root = ROOT) {
    const hits = [];
    for (const f of walk(path.join(root, 'js'))) {
        const rel = path.relative(root, f).replace(/\\/g, '/');
        if (SKIP_FILES.has(rel)) continue;
        hits.push(...lintSource(fs.readFileSync(f, 'utf8'), { file: rel }));
    }
    const indexPath = path.join(root, 'index.html');
    if (fs.existsSync(indexPath)) hits.push(...lintSource(fs.readFileSync(indexPath, 'utf8'), { html: true, file: 'index.html' }));
    return hits;
}

module.exports = { lintSource, lintRepo, titleCaseHits, htmlVisibleLines };

if (require.main === module) {
    const hits = lintRepo();
    const byRule = {};
    for (const h of hits) {
        console.log(`${h.file}:${h.line}  [${h.rule}]  ${h.text}`);
        byRule[h.rule] = (byRule[h.rule] || 0) + 1;
    }
    console.log(`\n${hits.length} copy-rule hit(s)${hits.length ? ` — ${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(', ')}` : ''}`);
    if (process.argv.includes('--strict') && hits.length) process.exit(1);
}
