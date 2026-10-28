// Library switcher (Pocket Inventory "Landing v2" §1) — the Equipment and
// Exercises pages are one place with two libraries: the page title is a
// button ("Equipment ▾") that drops a two-row menu. Picking the other library
// REPLACES the page in the back stack, so Back from either leaves both.

const LIBRARIES = [
    { view: 'equipment', label: 'Equipment', icon: 'fa-dumbbell' },
    { view: 'exercises', label: 'Exercises', icon: 'fa-person-running' },
];

let openMenu = null; // { el, button, onDoc }

/** The title button markup — `current` is 'equipment' | 'exercises'. */
export function librarySwitcherHTML(current) {
    const lib = LIBRARIES.find((l) => l.view === current) || LIBRARIES[0];
    return `
        <button class="lib-switch" onclick="toggleLibrarySwitcher(event, '${lib.view}')"
                aria-haspopup="menu" aria-expanded="false" aria-label="${lib.label} — switch library">
            <span class="page-header__title lib-switch__title">${lib.label}</span>
            <i class="fas fa-chevron-down lib-switch__chev" aria-hidden="true"></i>
        </button>`;
}

export function closeLibrarySwitcher() {
    if (!openMenu) return;
    openMenu.el.remove();
    openMenu.button.setAttribute('aria-expanded', 'false');
    openMenu.button.classList.remove('is-open');
    document.removeEventListener('pointerdown', openMenu.onDoc, true);
    openMenu = null;
}

export function toggleLibrarySwitcher(event, current) {
    event?.stopPropagation?.();
    const button = event?.currentTarget || event?.target?.closest?.('.lib-switch');
    if (openMenu) { closeLibrarySwitcher(); return; }
    const header = button?.closest('.page-header');
    if (!button || !header) return;

    const el = document.createElement('div');
    el.className = 'lib-menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = LIBRARIES.map((l) => `
        <button class="lib-menu__opt${l.view === current ? ' is-active' : ''}" role="menuitemradio"
                aria-checked="${l.view === current}" onclick="pickLibrary('${l.view}', '${current}')">
            <i class="fas ${l.icon} lib-menu__icon" aria-hidden="true"></i>${l.label}
            ${l.view === current ? '<i class="fas fa-check lib-menu__check" aria-hidden="true"></i>' : ''}
        </button>`).join('');
    header.appendChild(el);
    button.setAttribute('aria-expanded', 'true');
    button.classList.add('is-open');

    // A tap anywhere else closes it (capture, so it beats the tapped thing's own handler).
    const onDoc = (e) => {
        if (el.contains(e.target) || button.contains(e.target)) return;
        closeLibrarySwitcher();
    };
    document.addEventListener('pointerdown', onDoc, true);
    openMenu = { el, button, onDoc };
    el.querySelector('.lib-menu__opt.is-active')?.focus();
}

export function pickLibrary(view, current) {
    closeLibrarySwitcher();
    if (view === current) return;
    window.navigateTo?.(view, { replace: true });
}

/**
 * Landing v2 §5 — the title collapses as the page scrolls: --collapse goes
 * 0 → 1 over the first 70px of the body's scroll, read by .lib-switch__title.
 */
function wireCollapsingTitles() {
    document.querySelectorAll('.lib-switch').forEach((button) => {
        const section = button.closest('section');
        const body = section?.querySelector('.content-section-body');
        if (!body || body.dataset.collapseWired) return;
        body.dataset.collapseWired = '1';
        let raf = 0;
        body.addEventListener('scroll', () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                section.style.setProperty('--collapse', Math.min(1, body.scrollTop / 70).toFixed(3));
            });
        }, { passive: true });
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireCollapsingTitles);
    else wireCollapsingTitles();
}

if (typeof window !== 'undefined') {
    window.toggleLibrarySwitcher = toggleLibrarySwitcher;
    window.pickLibrary = pickLibrary;
    window.closeLibrarySwitcher = closeLibrarySwitcher;
}
