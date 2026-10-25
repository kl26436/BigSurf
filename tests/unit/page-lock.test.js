// @vitest-environment jsdom
// SH-2a — the page lock is derived from what's open in the DOM (plus explicit
// holds), so no open/close path can leak it. Real module, jsdom DOM.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { overlayOpen, syncPageLock, lockPage, unlockPage, resetPageLock, pageLockState } from '../../js/core/ui/page-lock.js';

const add = (html) => {
    document.body.insertAdjacentHTML('beforeend', html);
    return document.body.lastElementChild;
};

describe('page lock', () => {
    let scrollTo;
    beforeEach(() => {
        scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        document.body.innerHTML = '<div class="app-container"></div>';
        resetPageLock();
        scrollTo.mockClear();
    });

    it('locks while an aw-sheet backdrop is visible, and restores the scroll on release', () => {
        Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
        const backdrop = add('<div class="aw-sheet-backdrop"></div>');
        expect(syncPageLock()).toBe(false);           // not .visible yet
        backdrop.classList.add('visible');
        expect(syncPageLock()).toBe(true);
        expect(document.body.classList.contains('page-locked')).toBe(true);
        expect(document.body.style.getPropertyValue('--page-lock-top')).toBe('-420px');
        backdrop.remove();                            // e.g. navigateTo's teardown
        expect(syncPageLock()).toBe(false);
        expect(document.body.classList.contains('page-locked')).toBe(false);
        expect(scrollTo).toHaveBeenCalledWith(0, 420);
    });

    it('knows dialogs, div modals and the named overlays', () => {
        const dlg = add('<dialog class="modal"></dialog>');
        expect(overlayOpen()).toBe(false);
        dlg.setAttribute('open', '');
        expect(overlayOpen()).toBe(true);
        dlg.remove();
        const modal = add('<div class="modal hidden"></div>');
        expect(overlayOpen()).toBe(false);
        modal.classList.remove('hidden');
        expect(overlayOpen()).toBe(true);
        modal.remove();
        add('<div class="more-menu-overlay"></div>');
        expect(overlayOpen()).toBe(false);
        document.querySelector('.more-menu-overlay').classList.add('visible');
        expect(overlayOpen()).toBe(true);
    });

    it('explicit holds stack, and navigation drops them', () => {
        lockPage(); lockPage();
        expect(unlockPage()).toBe(true);              // one hold left
        expect(pageLockState().manualDepth).toBe(1);
        expect(resetPageLock()).toBe(false);
        expect(pageLockState()).toMatchObject({ locked: false, manualDepth: 0 });
    });

    it('two overlays, one lock: closing one keeps the page locked', () => {
        const a = add('<div class="aw-sheet-backdrop visible"></div>');
        add('<div class="sheet-backdrop"></div>');
        expect(syncPageLock()).toBe(true);
        a.remove();
        expect(syncPageLock()).toBe(true);
        expect(scrollTo).not.toHaveBeenCalled();
    });
});
