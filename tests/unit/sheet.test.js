// @vitest-environment jsdom
// SH-2b — the sheet primitive: lock + inert while open, focus in/out,
// Escape and stacking, pinned search, setBody. Real module, jsdom DOM.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openSheet, closeSheet, closeTopSheet, closeAllSheets, sheetDepth } from '../../js/core/ui/sheet.js';
import { syncPageLock, resetPageLock } from '../../js/core/ui/page-lock.js';

const key = (el, k, extra = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));

describe('openSheet', () => {
    beforeEach(() => {
        closeAllSheets();
        vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        document.body.innerHTML = '<div class="app-container"><button id="opener">Open</button></div><nav class="bottom-nav"></nav>';
        resetPageLock();
    });

    it('locks the page and makes everything behind it inert; closing restores both and focus', () => {
        const opener = document.getElementById('opener');
        opener.focus();
        const s = openSheet({ id: 'gym-sheet', title: 'Pick a gym', bodyHTML: '<button class="row">Downtown</button>' });
        expect(sheetDepth()).toBe(1);
        expect(s.el.getAttribute('role')).toBe('dialog');
        expect(s.el.getAttribute('aria-labelledby')).toBe(document.querySelector('.sheet__title').id);
        expect(document.querySelector('.app-container').inert).toBe(true);
        expect(document.querySelector('.bottom-nav').inert).toBe(true);
        expect(s.el.inert).toBeFalsy();
        expect(syncPageLock()).toBe(true);

        s.close();
        expect(sheetDepth()).toBe(0);
        expect(document.querySelector('.app-container').inert).toBe(false);
        expect(document.activeElement).toBe(opener);
        closeAllSheets(); // flush the timed DOM removal
    });

    it('pins the search field outside the body and focuses it in the same tap', () => {
        const onInput = vi.fn();
        const s = openSheet({ id: 's', title: 'Add machine', search: { placeholder: 'Search machines…', onInput } });
        expect(s.search.closest('.sheet__body')).toBeNull();
        expect(s.search.closest('.sheet__search').classList.contains('field-search')).toBe(true);
        expect(document.activeElement).toBe(s.search);
        s.search.value = 'leg';
        s.search.dispatchEvent(new Event('input'));
        expect(onInput).toHaveBeenCalledWith('leg', s);
    });

    it('setBody replaces only the body; an empty footer stays hidden', () => {
        const s = openSheet({ title: 'T', bodyHTML: '<p>one</p>' });
        const header = s.el.querySelector('.sheet__header');
        s.setBody('<p>two</p>');
        expect(s.body.innerHTML).toBe('<p>two</p>');
        expect(s.el.querySelector('.sheet__header')).toBe(header);
        expect(s.el.querySelector('.sheet__footer').hidden).toBe(true);
        s.setFooter('<button>Done</button>');
        expect(s.el.querySelector('.sheet__footer').hidden).toBe(false);
    });

    it('stacks: Escape closes only the top sheet; inert lifts when the last closes', () => {
        const onClose = vi.fn();
        const a = openSheet({ id: 'a', title: 'A', onClose });
        const b = openSheet({ id: 'b', title: 'B' });
        expect(sheetDepth()).toBe(2);
        expect(b.el.style.getPropertyValue('--sheet-depth')).toBe('2');
        expect(document.querySelectorAll('.sheet-backdrop--stacked')).toHaveLength(1);
        key(b.el, 'Escape');
        expect(sheetDepth()).toBe(1);
        expect(onClose).not.toHaveBeenCalled();
        expect(document.querySelector('.app-container').inert).toBe(true);
        key(a.el, 'Escape');
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.app-container').inert).toBe(false);
    });

    it('a sheet re-opened in place (re-render by id) still releases inert when it closes', () => {
        // The bug: the silent close emptied the stack, the new open re-captured
        // an empty list (everything was already inert), the last close freed
        // nothing — every tap on the page was ignored until a reload.
        openSheet({ id: 'r', title: 'Step 1' });
        openSheet({ id: 'r', title: 'Step 2' });
        openSheet({ id: 'r', title: 'Step 3' });
        expect(sheetDepth()).toBe(1);
        expect(document.querySelector('.app-container').inert).toBe(true);
        closeSheet('r', { immediate: true });
        expect(document.querySelector('.app-container').inert).toBe(false);
        expect(document.querySelector('.bottom-nav').inert).toBe(false);
        expect(document.querySelectorAll('[data-sheet-inert]')).toHaveLength(0);
        // and a stack opened over a re-rendered one, closed all at once
        openSheet({ id: 'r', title: 'A' });
        openSheet({ id: 'r', title: 'A again' });
        openSheet({ id: 'top', title: 'Confirm' });
        closeAllSheets();
        expect(document.querySelector('.app-container').inert).toBe(false);
    });

    it('never un-inerts what the sheet layer didn\'t make inert', () => {
        const nav = document.querySelector('.bottom-nav');
        nav.inert = true; // someone else's
        openSheet({ id: 'x', title: 'X' });
        closeSheet('x', { immediate: true });
        expect(nav.inert).toBe(true);
        nav.inert = false;
    });

    it('non-dismissible sheets ignore Escape and the backdrop; closeTopSheet still works', () => {
        const s = openSheet({ title: 'Saving', dismissible: false });
        key(s.el, 'Escape');
        document.querySelector('.sheet-backdrop').click();
        expect(sheetDepth()).toBe(1);
        expect(closeTopSheet()).toBe(true);
        expect(sheetDepth()).toBe(0);
    });

    it('ignores a backdrop tap in the first 300 ms (iOS phantom click), then dismisses', () => {
        const t0 = performance.now();
        const now = vi.spyOn(performance, 'now').mockReturnValue(t0);
        openSheet({ title: 'PRs' });
        now.mockReturnValue(t0 + 100);
        document.querySelector('.sheet-backdrop').click();
        expect(sheetDepth()).toBe(1);
        now.mockReturnValue(t0 + 400);
        document.querySelector('.sheet-backdrop').click();
        expect(sheetDepth()).toBe(0);
        now.mockRestore();
    });

    it('a closing sheet stops taking taps while it slides out', () => {
        const s = openSheet({ title: 'Gym' });
        s.close();
        expect(s.el.classList.contains('sheet--closing')).toBe(true);
        expect(document.querySelector('.sheet-backdrop').classList.contains('sheet-backdrop--closing')).toBe(true);
    });

    it('system back (closeTopSheet dismissOnly) leaves a non-dismissible sheet up', () => {
        openSheet({ title: 'Body weight', dismissible: false });
        expect(closeTopSheet({ dismissOnly: true })).toBe(false);
        expect(sheetDepth()).toBe(1);
        closeTopSheet();
        openSheet({ title: 'Gym' });
        expect(closeTopSheet({ dismissOnly: true })).toBe(true);
        expect(sheetDepth()).toBe(0);
    });

    it('closeAllSheets (navigation) removes every sheet immediately', () => {
        openSheet({ id: 'x', title: 'X' });
        openSheet({ id: 'y', title: 'Y' });
        closeAllSheets();
        expect(document.querySelectorAll('.sheet, .sheet-backdrop')).toHaveLength(0);
        expect(syncPageLock()).toBe(false);
    });

    it('escapes the title and search placeholder', () => {
        openSheet({ title: '<img src=x onerror=1>', search: { placeholder: '"x"' } });
        expect(document.querySelector('.sheet__title').innerHTML).toBe('&lt;img src=x onerror=1&gt;');
        expect(document.querySelector('.sheet__search input').getAttribute('placeholder')).toBe('"x"');
    });
});
