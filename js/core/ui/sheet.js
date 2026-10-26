// Sheet primitive — core/ui/sheet.js (SH-2b)
//
// The one bottom sheet. Everything the ~12 hand-built sheets each decided on
// their own (or didn't) lives here exactly once:
//   - layout above the keyboard (--kb-inset) and the home indicator
//   - a pinned search field OUTSIDE the scrolling body (so results scroll, the
//     field doesn't, and the page behind never does)
//   - page lock — derived by page-lock.js from `.sheet-backdrop`
//   - everything behind the sheet `inert` (no taps, no focus)
//   - focus trap, focus restore, Escape, backdrop tap, swipe-down on the handle
//   - stacking (a sheet over a sheet)
//
//   const s = openSheet({ id: 'gym-picker', title: 'Pick a gym', bodyHTML,
//                         search: { placeholder: 'Search gyms…', onInput: q => s.setBody(rows(q)) } });
//
// Migration of the existing aw-sheet / qa-sheet / … overlays onto this is
// SH-3 (docs/action-plan-2026-10.md §7); until then they keep their own chrome
// but share the page lock.

const stack = [];          // open sheets, bottom → top
let inerted = [];          // body children made inert while any sheet is open
const KEEP_LIVE = '.sheet, .sheet-backdrop, dialog, .shell-hud, .app-toast, [class*="toast"], script, style, link';
const SWIPE_CLOSE_PX = 60;
const CLOSE_MS = 250;
const BACKDROP_GUARD_MS = 300;

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setInert(on) {
    if (on) {
        inerted = [...document.body.children].filter(el => !el.matches(KEEP_LIVE) && !el.inert);
        for (const el of inerted) el.inert = true;
    } else {
        for (const el of inerted) el.inert = false;
        inerted = [];
    }
}

function focusables(root) {
    return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.disabled && el.offsetParent !== null);
}

/**
 * Open a bottom sheet. Call from the tap handler itself when `search.autofocus`
 * is on — iOS raises the keyboard only inside a user gesture.
 * @returns {{el: HTMLElement, body: HTMLElement, search: HTMLInputElement|null,
 *            close: Function, setBody: Function, setFooter: Function}}
 */
export function openSheet({
    id, title = '', titleHTML = '', titleColor = null, subtitle = '', bodyHTML = '', footerHTML = '', actions = null,
    search = null, size = 'auto', dismissible = true, onClose = null,
    className = '', bodyId = '', bodyClass = '', keepFooter = false,
} = {}) {
    // Re-opening an id that's already up (a sheet re-rendering itself, as
    // the aw-sheets do) replaces it in place: no second stack entry, no
    // slide-in, focus and inert untouched.
    const prior = id ? stack.find(e => e.el.id === id && !e.closed) : null;
    if (prior) closeEntry(prior, { immediate: true, silent: true });
    else if (id) document.getElementById(id)?.remove();
    const depth = stack.length + 1;
    const titleId = `${id || 'sheet'}-title-${depth}`;

    const backdrop = document.createElement('div');
    backdrop.className = `sheet-backdrop${depth > 1 ? ' sheet-backdrop--stacked' : ''}`;
    const el = document.createElement('div');
    // keepFooter: a multi-select sheet whose footer button carries the
    // selection (quick-add) stays reachable while its search has focus.
    el.className = `sheet sheet--${size}${keepFooter ? ' sheet--keep-footer' : ''}${className ? ` ${className}` : ''}`;
    el.tabIndex = -1;
    if (id) el.id = id;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    if (title || titleHTML) el.setAttribute('aria-labelledby', titleId);
    if (titleColor) el.style.setProperty('--sheet-title-color', titleColor);
    el.style.setProperty('--sheet-depth', String(depth));
    backdrop.style.setProperty('--sheet-depth', String(depth));
    el.innerHTML = `
        <div class="sheet__handle" aria-hidden="true"></div>
        ${title || titleHTML || subtitle ? `<div class="sheet__header">
            ${title || titleHTML ? `<div class="sheet__title" id="${titleId}">${titleHTML || esc(title)}</div>` : ''}
            ${subtitle ? `<div class="sheet__subtitle">${esc(subtitle)}</div>` : ''}
        </div>` : ''}
        ${search ? `<div class="sheet__search field-search">
            <i class="fas fa-search" aria-hidden="true"></i>
            <input type="search" class="field-search__input" placeholder="${esc(search.placeholder || 'Search…')}"
                   value="${esc(search.value || '')}" aria-label="${esc(search.placeholder || 'Search')}" autocomplete="off">
        </div>` : ''}
        <div class="sheet__body${bodyClass ? ` ${bodyClass}` : ''}"${bodyId ? ` id="${esc(bodyId)}"` : ''}></div>
        <div class="sheet__footer"></div>
    `;
    const body = el.querySelector('.sheet__body');
    const footer = el.querySelector('.sheet__footer');
    const input = el.querySelector('.sheet__search input');
    body.innerHTML = bodyHTML;
    const foot = footerHTML || actionsHTML(actions);
    footer.innerHTML = foot;
    footer.hidden = !foot;

    const entry = { el, backdrop, onClose, dismissible, previousFocus: document.activeElement, closed: false };
    const handle = {
        el, body, search: input,
        close: () => closeEntry(entry),
        setBody: (html) => { body.innerHTML = html; },
        setFooter: (html) => { footer.innerHTML = html; footer.hidden = !html; },
    };
    entry.handle = handle;

    // iOS can fire a synthetic click on a freshly added fullscreen element
    // under the finger that opened it, so the opening tap would dismiss the
    // sheet in the same frame. Backdrop taps in the first 300 ms are ignored.
    const openedAt = performance.now();
    if (dismissible) backdrop.addEventListener('click', () => {
        if (performance.now() - openedAt < BACKDROP_GUARD_MS) return;
        closeEntry(entry);
    });
    if (input && typeof search.onInput === 'function') {
        input.addEventListener('input', () => search.onInput(input.value, handle));
    }
    el.addEventListener('keydown', (e) => onKeydown(e, entry));
    if (dismissible) wireSwipe(el, entry);

    if (stack.length === 0) setInert(true);
    document.body.appendChild(backdrop);
    document.body.appendChild(el);
    stack.push(entry);

    // Synchronous focus keeps the opening gesture, so iOS raises the keyboard.
    // Without a pinned search the SHEET takes focus, not its first input —
    // a focused field pops the keyboard (AP-11: the equipment search
    // auto-focuses only when nothing is linked yet; the caller decides).
    if (input && search.autofocus !== false) input.focus();
    else if (!prior) el.focus?.({ preventScroll: true });

    if (prior) {
        backdrop.classList.add('visible');
        el.classList.add('visible');
    } else {
        requestAnimationFrame(() => {
            backdrop.classList.add('visible');
            el.classList.add('visible');
        });
    }
    announceLayer();
    return handle;
}

/** SH-6 — tell the back guard a layer opened or closed. */
function announceLayer() {
    try { document.dispatchEvent(new CustomEvent('bigsurf:layer')); } catch { /* no DOM */ }
}

/** Footer buttons from `actions: [{ label (HTML), onClick (handler string), primary, warm, danger, disabled }]`. */
function actionsHTML(actions) {
    if (!Array.isArray(actions) || !actions.length) return '';
    return actions.map((a) => {
        const mods = ['primary', 'warm', 'danger'].filter(m => a[m]).map(m => ` sheet__action--${m}`).join('');
        return `<button type="button" class="sheet__action${mods}"${a.disabled ? ' disabled' : ''}${a.onClick ? ` onclick="${a.onClick}"` : ''}>${a.label}</button>`;
    }).join('');
}

function onKeydown(e, entry) {
    if (stack[stack.length - 1] !== entry) return;
    if (e.key === 'Escape' && entry.dismissible) {
        e.preventDefault();
        closeEntry(entry);
        return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables(entry.el);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function wireSwipe(el, entry) {
    const grip = el.querySelector('.sheet__handle');
    const header = el.querySelector('.sheet__header');
    let startY = null;
    const down = (e) => { startY = e.clientY; el.classList.add('sheet--dragging'); };
    const move = (e) => {
        if (startY == null) return;
        el.style.setProperty('--sheet-drag', `${Math.max(0, e.clientY - startY)}px`);
    };
    const up = (e) => {
        if (startY == null) return;
        const dy = e.clientY - startY;
        startY = null;
        el.classList.remove('sheet--dragging');
        el.style.removeProperty('--sheet-drag');
        if (dy > SWIPE_CLOSE_PX) closeEntry(entry);
    };
    for (const target of [grip, header].filter(Boolean)) target.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    entry.unwire = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
    };
}

function closeEntry(entry, { immediate = false, silent = false } = {}) {
    if (entry.closed) return;
    entry.closed = true;
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    entry.unwire?.();
    entry.el.classList.remove('visible');
    entry.backdrop.classList.remove('visible');
    // A second tap on a sheet that's sliding out must not reach handlers its
    // onClose has already torn down.
    entry.el.classList.add('sheet--closing');
    entry.backdrop.classList.add('sheet-backdrop--closing');
    const remove = () => { entry.el.remove(); entry.backdrop.remove(); };
    if (immediate) remove();
    else setTimeout(remove, CLOSE_MS);
    if (silent) return; // replaced in place by openSheet — the new entry takes over
    if (stack.length === 0) setInert(false);
    const prev = entry.previousFocus;
    if (prev && document.contains(prev) && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
    announceLayer();
    if (typeof entry.onClose === 'function') {
        try { entry.onClose(); } catch (e) { console.error('❌ sheet onClose threw:', e); }
    }
}

/** Close the open sheet with this id (the legacy close functions call this). */
export function closeSheet(id, { immediate = false } = {}) {
    const e = stack.find(x => x.el.id === id && !x.closed);
    if (e) closeEntry(e, { immediate });
    return !!e;
}

/** The handle of the open sheet with this id, or null. */
export function sheetById(id) {
    return stack.find(x => x.el.id === id && !x.closed)?.handle || null;
}

/** Close the topmost sheet (Escape, back gesture). */
export function closeTopSheet() {
    const top = stack[stack.length - 1];
    if (top) closeEntry(top);
    return !!top;
}

/** Close every sheet now — navigation teardown. */
export function closeAllSheets({ immediate = true } = {}) {
    while (stack.length) closeEntry(stack[stack.length - 1], { immediate });
}

export function sheetDepth() {
    return stack.length;
}
