// Pull-to-refresh (from the owner's gym bug log: coach-made changes need a
// hard refresh to show on the workout list).
//
// Hand-rolled overscroll gesture for standalone-PWA pages that live on the
// natural document scroll: pull down from the very top past a threshold,
// release, the page's refresh callback runs. One document-level listener set
// serves every registered page — eligibility is checked per gesture, so
// there's no per-page listener churn and no interference with normal scroll
// (listeners are passive; we never block the rubber-band).

const THRESHOLD_PX = 72;
const registrations = []; // {isEligible, onRefresh}
let installed = false;
let startY = null;
let active = null;   // the registration for the in-flight gesture
let armed = false;
let refreshing = false;

function indicator() {
    let el = document.getElementById('ptr-pill');
    if (!el) {
        el = document.createElement('div');
        el.id = 'ptr-pill';
        el.className = 'ptr-pill';
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);
    }
    return el;
}

function hideIndicator() {
    document.getElementById('ptr-pill')?.remove();
}

function onTouchStart(e) {
    if (refreshing || window.scrollY > 0) return;
    active = registrations.find(r => {
        try { return r.isEligible(); } catch { return false; }
    }) || null;
    if (!active) return;
    startY = e.touches[0].clientY;
    armed = false;
}

function onTouchMove(e) {
    if (startY == null || !active) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < 24 || window.scrollY > 0) {
        if (!armed) hideIndicator();
        return;
    }
    armed = dy >= THRESHOLD_PX;
    const el = indicator();
    el.classList.toggle('ptr-pill--armed', armed);
    el.innerHTML = armed
        ? '<i class="fas fa-arrow-rotate-right"></i> Release to refresh'
        : '<i class="fas fa-arrow-down"></i> Pull to refresh';
}

async function onTouchEnd() {
    const reg = active;
    const go = armed && reg && !refreshing;
    startY = null;
    active = null;
    armed = false;
    if (!go) { hideIndicator(); return; }

    refreshing = true;
    const el = indicator();
    el.classList.add('ptr-pill--armed');
    el.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing…';
    try {
        await reg.onRefresh();
    } catch (e) {
        console.error('❌ Pull-to-refresh failed:', e);
    } finally {
        refreshing = false;
        hideIndicator();
    }
}

/**
 * Register a page for pull-to-refresh.
 * @param {() => boolean} isEligible - true when this page is the visible one
 * @param {() => Promise<void>} onRefresh - re-fetch + re-render
 */
export function registerPullToRefresh(isEligible, onRefresh) {
    registrations.push({ isEligible, onRefresh });
    if (installed || typeof document === 'undefined') return;
    installed = true;
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
}
