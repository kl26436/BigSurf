// Page lock — core/ui/page-lock.js (SH-2a)
//
// While any sheet / overlay / modal is open, the page behind it must not
// scroll — not from a swipe on the sheet's header, not from its search field,
// not from running off the end of a short list. iOS ignores
// `body { overflow: hidden }` for touch scrolling, so the lock pins the body
// with `position: fixed` (offset by the saved scroll so nothing jumps) and
// freezes the scroll container of any visible full-page section.
//
// The lock is DERIVED FROM THE DOM rather than counted from open/close calls:
// ~12 overlay implementations open and close sheets their own way (and
// navigateTo() force-removes sheets), so a counter would leak the first time
// a close path skipped it. Here "locked" = an overlay matching
// OVERLAY_SELECTOR is showing, OR something holds an explicit lockPage().
// A new overlay root only needs adding to OVERLAY_SELECTOR (the sheet
// primitive's .sheet-backdrop already is).

const OVERLAY_SELECTOR = [
    '.sheet-backdrop',                 // js/core/ui/sheet.js (SH-2b)
    '.aw-sheet-backdrop.visible',      // aw-sheet family: workout, quick-add, quick-edit, plate calc, block…
    '.more-menu-overlay.visible',
    '.bw-prompt-overlay',
    '.dash-todays-prs-overlay',
    '.onboarding-overlay',
    '.aw-form-video-overlay',
    'dialog.modal[open]',
    'dialog.confirm-sheet[open]',      // confirmSheet() / promptSheet() — top layer, still scroll-chains on iOS
    '.modal:not(dialog):not(.hidden)',
].join(', ');

const FROZEN_CLASS = 'page-lock-frozen';

let manualDepth = 0;
let locked = false;
let savedY = 0;
let frozen = [];
let scheduled = false;
let installed = false;

function isShown(el) {
    if (el.tagName === 'DIALOG') return el.open;
    if (el.classList.contains('hidden')) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
}

/** True when any known overlay root is showing. */
export function overlayOpen(root = document) {
    for (const el of root.querySelectorAll(OVERLAY_SELECTOR)) {
        if (isShown(el)) return true;
    }
    return false;
}

/** The scroll containers inside visible full-page sections (inner page scroll). */
function sectionScrollers() {
    const out = [];
    for (const section of document.querySelectorAll('.full-page-section:not(.hidden)')) {
        for (const el of [section, ...section.querySelectorAll('*')]) {
            if (el.scrollHeight <= el.clientHeight) continue;
            const oy = getComputedStyle(el).overflowY;
            if (oy === 'auto' || oy === 'scroll') out.push(el);
        }
    }
    return out;
}

function apply() {
    const body = document.body;
    savedY = window.scrollY || window.pageYOffset || 0;
    body.style.setProperty('--page-lock-top', `-${savedY}px`);
    body.classList.add('page-locked');
    frozen = sectionScrollers();
    for (const el of frozen) el.classList.add(FROZEN_CLASS);
    locked = true;
}

function release() {
    const body = document.body;
    body.classList.remove('page-locked');
    body.style.removeProperty('--page-lock-top');
    for (const el of frozen) el.classList.remove(FROZEN_CLASS);
    frozen = [];
    locked = false;
    window.scrollTo(0, savedY);
}

/** Recompute now (tests, and explicit lock/unlock). */
export function syncPageLock() {
    scheduled = false;
    if (typeof document === 'undefined' || !document.body || typeof document.querySelectorAll !== 'function') return false;
    const want = manualDepth > 0 || overlayOpen();
    if (want && !locked) apply();
    else if (!want && locked) release();
    return locked;
}

function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncPageLock);
}

/** Explicit hold, for an overlay the selector can't see. Pair with unlockPage(). */
export function lockPage() {
    manualDepth++;
    return syncPageLock();
}

export function unlockPage() {
    if (manualDepth > 0) manualDepth--;
    return syncPageLock();
}

/** Drop every explicit hold (navigation teardown); DOM-derived locks re-evaluate. */
export function resetPageLock() {
    manualDepth = 0;
    return syncPageLock();
}

/** For the ?debug HUD: explicit holds, and whether the page is locked. */
export function pageLockState() {
    return { locked, manualDepth, savedY };
}

/**
 * Watch the DOM and keep the lock in step with what's open. Idempotent.
 * Replaces initModalScrollLock's body.style.overflow toggle (which iOS
 * ignores for touch, and which only knew about .modal).
 */
export function installPageLock() {
    if (installed || typeof MutationObserver === 'undefined') return;
    installed = true;
    new MutationObserver(scheduleSync).observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open'],
    });
    syncPageLock();
}
