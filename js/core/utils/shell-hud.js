// Shell HUD — core/utils/shell-hud.js (SH-0)
//
// `?debug` only (lazy-loaded from app-initialization). A one-line strip at the
// bottom-left showing the numbers the shell bugs depend on — viewport,
// keyboard inset, safe areas, scroll, page lock, what's open, what has focus —
// plus a "snap" button that logs one `shell_snapshot` to the Error Log page
// with the size and position of every visible back/close control. Agents
// can't see the Dynamic Island; this is how the phone reports it.
//
//   ih 844 · vv 500 @0 · kb 344 · sat 59 sab 34 · y 0 · lock 1 · aw-sheet · INPUT#aw-equip-search
//
// `?debug&snap` also snaps automatically ~0.7 s after the visible page or the
// set of open overlays changes — walk the app and every screen gets a record.

import { captureTrace } from './error-handler.js';
import { pageLockState } from '../ui/page-lock.js';

const CONTROL_SELECTOR = [
    '.page-header__back',
    '[class*="back"]:not([class*="backdrop"]):not([class*="background"])',
    '[class*="close"]',
    '[class*="dismiss"]',
    '[aria-label*="Back" i]',
    '[aria-label*="Close" i]',
].join(', ');
const CLICKABLE = 'button, a, [role="button"], [onclick]';
const OVERLAY_PROBE = '.aw-sheet, .sheet, [class*="overlay"], [class*="-sheet"]:not([class*="__"]), dialog[open]';
const MIN_TAP = 44;

/** One HUD line from a metrics object. Pure. */
export function formatHudLine(m) {
    const open = m.open.length ? m.open.join(',') : '—';
    return `ih ${m.ih} · vv ${m.vvH} @${m.vvTop} · kb ${m.kb} · sat ${m.sat} sab ${m.sab} · y ${m.scrollY}`
        + ` · lock ${m.lock} · ${m.section || '—'} · ${open} · ${m.focus || '—'}`;
}

/**
 * Flag back/close controls a thumb will miss. Pure.
 * @param {Array<{top,left,width,height,covered?}>} controls - measured rects (px)
 * @param {number} sat - safe-area-inset-top (px)
 */
export function controlDefects(controls, sat) {
    return controls.map((c) => {
        const defects = [];
        if (c.top < sat + 4) defects.push('under status bar');
        if (c.width < MIN_TAP || c.height < MIN_TAP) defects.push(`hit area ${c.width}×${c.height} < ${MIN_TAP}`);
        if (c.covered) defects.push('covered at its centre');
        return { ...c, defects };
    });
}

function px(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
}

let probe = null;
function safeAreas() {
    if (!probe) {
        probe = document.createElement('div');
        probe.className = 'shell-hud__probe';
        document.body.appendChild(probe);
    }
    const cs = getComputedStyle(probe);
    return { sat: px(cs.paddingTop), sab: px(cs.paddingBottom) };
}

function shown(el) {
    if (el.tagName === 'DIALOG') return el.open;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.closest('.hidden');
}

function rootClass(el) {
    return el.id ? `#${el.id}` : (String(el.className || '').split(/\s+/)[0] || el.tagName.toLowerCase());
}

function visibleSection() {
    const candidates = document.querySelectorAll('[id$="-section"], #active-workout, #workout-selector, #dashboard');
    for (const el of candidates) {
        if (el.classList.contains('hidden') || el.closest('.hidden')) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el.id;
    }
    return '';
}

function measure() {
    const vv = window.visualViewport;
    const { sat, sab } = safeAreas();
    const lock = pageLockState();
    const open = [...document.querySelectorAll(OVERLAY_PROBE)]
        .filter(el => !el.closest('.shell-hud') && shown(el))
        .map(rootClass);
    const a = document.activeElement;
    return {
        ih: window.innerHeight,
        vvH: vv ? Math.round(vv.height) : window.innerHeight,
        vvTop: vv ? Math.round(vv.offsetTop) : 0,
        kb: px(getComputedStyle(document.documentElement).getPropertyValue('--kb-inset')),
        sat, sab,
        scrollY: lock.locked ? `${Math.round(lock.savedY)}*` : Math.round(window.scrollY || 0),
        lock: lock.locked ? 1 + lock.manualDepth : 0,
        section: visibleSection(),
        open: [...new Set(open)].slice(0, 4),
        focus: a && a !== document.body ? `${a.tagName}${a.id ? `#${a.id}` : ''}` : '',
    };
}

function measureControls() {
    const out = [];
    for (const el of document.querySelectorAll(CONTROL_SELECTOR)) {
        if (!el.matches(CLICKABLE) || el.closest('.shell-hud')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        out.push({
            label: el.getAttribute('aria-label') || rootClass(el),
            top: Math.round(r.top), left: Math.round(r.left),
            width: Math.round(r.width), height: Math.round(r.height),
            covered: !!hit && hit !== el && !el.contains(hit),
        });
    }
    return out;
}

/** Log one shell_snapshot (Error Log page, session-only like autofill_trace). */
export function snapShell(reason = 'manual') {
    const m = measure();
    const controls = controlDefects(measureControls(), m.sat);
    const bad = controls.filter(c => c.defects.length);
    captureTrace(
        `shell_snapshot: ${m.section || '?'} · ${m.open.join(',') || 'no overlay'}${bad.length ? ` · ${bad.length} control defect${bad.length === 1 ? '' : 's'}` : ''}`,
        'shellHud',
        { reason, metrics: m, controls, userAgent: navigator.userAgent, standalone: !!window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches },
    );
    return { metrics: m, controls };
}

let installed = false;
export function installShellHud({ autoSnap = false } = {}) {
    if (installed || typeof document === 'undefined') return;
    installed = true;

    const hud = document.createElement('div');
    hud.className = 'shell-hud';
    hud.innerHTML = '<span class="shell-hud__line"></span><button type="button" class="shell-hud__snap" aria-label="Save shell snapshot">snap</button>';
    document.body.appendChild(hud);
    const line = hud.querySelector('.shell-hud__line');
    const btn = hud.querySelector('.shell-hud__snap');
    btn.addEventListener('click', () => {
        snapShell('manual');
        btn.textContent = 'saved';
        setTimeout(() => { btn.textContent = 'snap'; }, 900);
    });

    let lastKey = '';
    let autoTimer = null;
    const render = () => {
        let m;
        try { m = measure(); } catch { return; }
        line.textContent = formatHudLine(m);
        if (!autoSnap) return;
        const key = `${m.section}|${m.open.join(',')}`;
        if (key === lastKey) return;
        lastKey = key;
        clearTimeout(autoTimer);
        autoTimer = setTimeout(() => snapShell('auto'), 700);
    };

    const vv = window.visualViewport;
    vv?.addEventListener('resize', render);
    vv?.addEventListener('scroll', render);
    document.addEventListener('focusin', render);
    document.addEventListener('focusout', render);
    window.addEventListener('scroll', render, { passive: true });
    setInterval(render, 250);
    render();
}
