// @vitest-environment jsdom
// SH-3b — the equipment library's sheets (quick-add, manual link, gym picker,
// the detail sheets incl. "+ Assign exercise") and the quick-edit sheet render
// through the sheet primitive: same ids, pinned search, and every dismiss
// runs the old close's cleanup exactly once.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = {};
vi.mock('../../js/core/data/firebase-config.js', async () => {
    const { createFirestoreMock } = await import('../fixtures/firestore-mock.js');
    return {
        ...createFirestoreMock(store),
        arrayUnion: (...v) => ({ __arrayUnion: v }),
        arrayRemove: (...v) => ({ __arrayRemove: v }),
        deleteField: () => ({ __delete: true }),
    };
});
vi.mock('../../js/core/ui/ui-helpers.js', () => ({
    showNotification: vi.fn(),
    escapeHtml: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    escapeAttr: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    escapeJsArg: (s) => (s == null ? '' : String(s)).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    displayWeight: (w) => ({ value: w, label: 'lbs' }),
    convertWeight: (w) => w,
}));

const { AppState } = await import('../../js/core/utils/app-state.js');
const lib = await import('../../js/core/ui/equipment-library-ui.js');
const qe = await import('../../js/core/ui/equipment-quick-edit.js');
const { closeAllSheets, sheetDepth } = await import('../../js/core/ui/sheet.js');

const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
const sheet = (id) => document.getElementById(id);

beforeEach(() => {
    closeAllSheets();
    document.body.innerHTML = '<div class="app-container"></div>';
    AppState.currentUser = { uid: 'u1' };
    AppState.exerciseDatabase = [
        { name: 'Chest Press', bodyPart: 'Chest' },
        { name: 'Leg Press', bodyPart: 'Legs' },
    ];
});

describe('gym picker (gp-sheet)', () => {
    it('opens through the primitive and hands the pick to onSelect once', () => {
        const onSelect = vi.fn();
        lib.openGymPickerSheet({ title: 'Which gym?', gyms: ['B', 'A'], currentGym: 'B', onSelect });
        const el = sheet('gp-sheet');
        expect(el.classList.contains('sheet')).toBe(true);
        expect(el.querySelector('.aw-sheet__action')).toBeNull();
        expect([...el.querySelectorAll('.sheet__action')].map(b => b.textContent)).toEqual(['Close']);
        lib.commitGymPick('A');
        expect(onSelect).toHaveBeenCalledWith('A');
        expect(sheetDepth()).toBe(0);
        lib.commitGymPick('A'); // callback cleared by the close
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('Escape clears the callback like the old close', () => {
        const onSelect = vi.fn();
        lib.openGymPickerSheet({ gyms: ['A'], onSelect });
        key(sheet('gp-sheet'), 'Escape');
        lib.commitGymPick('A');
        expect(onSelect).not.toHaveBeenCalled();
    });
});

describe('quick-add (qa-sheet)', () => {
    it('keeps its ids, pins the search with the initial text, and filters the body on input', async () => {
        await lib.openQuickAddSheet('Downtown', { initialSearch: 'zzzz-no-match' });
        const el = sheet('qa-sheet');
        expect(el.classList.contains('sheet')).toBe(true);
        expect(document.getElementById('qa-sheet-body').classList.contains('sheet__body')).toBe(true);
        const input = el.querySelector('.sheet__search input');
        expect(input.value).toBe('zzzz-no-match');
        expect(document.getElementById('qa-sheet-body').querySelector('input#qa-search-input')).toBeNull();
        expect(el.querySelector('.qa-sheet__empty')).not.toBeNull();
        input.value = '';
        input.dispatchEvent(new Event('input'));
        expect(el.querySelector('.qa-sheet__empty')).toBeNull();
        expect(document.getElementById('qa-add-btn').disabled).toBe(true);
        expect(el.querySelector('#qa-add-btn').classList.contains('sheet__action--primary')).toBe(true);
    });

    it('a backdrop tap ends the session (rows stop toggling)', async () => {
        await lib.openQuickAddSheet('Downtown');
        const row = sheet('qa-sheet').querySelector('.qa-row[onclick]');
        const ref = row.getAttribute('onclick').match(/'([^']+)'/)[1];
        // Past the primitive's 300 ms open-time backdrop guard (iOS phantom click).
        const later = performance.now() + 1000;
        const now = vi.spyOn(performance, 'now').mockReturnValue(later);
        document.querySelector('.sheet-backdrop').click();
        now.mockRestore();
        expect(sheetDepth()).toBe(0);
        lib.toggleQuickAddRow(ref); // no state → no-op, no throw
        expect(document.getElementById('qa-counter')?.textContent ?? '0').toBe('0');
    });
});

describe('equipment detail sheets', () => {
    it('"+ Assign exercise" is a sheet with a pinned search that hides non-matching rows and empty groups', () => {
        lib.assignExerciseToEquipment('eq1');
        const el = sheet('equip-assign-sheet');
        expect(el.classList.contains('sheet')).toBe(true);
        const list = document.getElementById('assign-exercise-list');
        expect(list.querySelectorAll('.equip-detail-ex-row')).toHaveLength(2);
        const input = el.querySelector('.sheet__search input');
        input.value = 'leg';
        input.dispatchEvent(new Event('input'));
        const groups = [...list.querySelectorAll('.equip-assign-group')];
        expect(groups.map(g => g.hidden)).toEqual([true, false]);
        expect(list.querySelector('.equip-assign-empty').hidden).toBe(true);
        input.value = 'nothing';
        input.dispatchEvent(new Event('input'));
        expect(list.querySelector('.equip-assign-empty').hidden).toBe(false);
        lib.closeAssignExerciseSheet();
        expect(sheetDepth()).toBe(0);
    });

    it('opening one detail sheet replaces another — never two stacked', () => {
        lib.assignExerciseToEquipment('eq1');
        lib.assignExerciseToEquipment('eq1');
        expect(sheetDepth()).toBe(1);
        expect(document.querySelectorAll('#equip-assign-sheet')).toHaveLength(1);
    });
});

describe('quick-edit (qe-sheet)', () => {
    it('renders through the primitive and every dismiss clears its state', async () => {
        AppState._cachedEquipment = [{ id: 'e1', name: 'Hammer Press', exerciseTypes: [], locations: [] }];
        await qe.openEquipmentQuickEdit('Hammer Press');
        const el = sheet('qe-sheet');
        expect(el.classList.contains('sheet')).toBe(true);
        expect(document.getElementById('qe-sheet-body')).not.toBeNull();
        expect([...el.querySelectorAll('.sheet__action')].map(b => b.textContent)).toEqual(['Full details', 'Save']);
        key(el, 'Escape');
        expect(sheetDepth()).toBe(0);
        window.qeAddGym('Downtown'); // state cleared → no-op, no throw, no re-open
        expect(sheet('qe-sheet')?.classList.contains('visible')).toBeFalsy();
    });
});
