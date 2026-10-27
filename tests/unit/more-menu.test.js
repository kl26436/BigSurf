// @vitest-environment jsdom
// UD-1 (docs/ux-deep-dive-2026-10.md) — the More menu is an openSheet rendered
// from one model: the map of the app. Real module, real sheet primitive.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../../js/core/data/firebase-config.js', () => ({ db: {} }));

const { AppState } = await import('../../js/core/utils/app-state.js');
const more = await import('../../js/core/ui/more-menu.js');
const { sheetById, closeAllSheets } = await import('../../js/core/ui/sheet.js');

const ids = (groups) => groups.flatMap((g) => g.rows.map((r) => r.id));

beforeEach(() => {
    closeAllSheets();
    document.body.innerHTML = '<nav><button data-tab="more"></button></nav>';
    AppState._cachedLocations = [];
    AppState._lastBodyWeight = null;
    AppState.currentUser = null;
});

describe('More menu model', () => {
    it('has a door to every newer page (plan, goals, report card, log weight, gyms)', () => {
        const all = ids(more.moreMenuGroups());
        for (const id of ['plan', 'goals', 'reportcard', 'progress', 'log-weight', 'body', 'exercises', 'equipment', 'gyms', 'plate-calculator', 'settings']) {
            expect(all, id).toContain(id);
        }
    });

    it("doesn't repeat the tab bar or Settings (coach, workouts, sign out, error log)", () => {
        const all = ids(more.moreMenuGroups());
        for (const id of ['ai-coach', 'templates', 'workouts', 'sign-out', 'error-log']) expect(all).not.toContain(id);
    });

    it('shows Gyms with zero gyms and says how to start (B15)', () => {
        const gyms = more.moreMenuGroups({ gymCount: 0 }).flatMap((g) => g.rows).find((r) => r.id === 'gyms');
        expect(gyms.status).toBe('Add your first');
        const two = more.moreMenuGroups({ gymCount: 2 }).flatMap((g) => g.rows).find((r) => r.id === 'gyms');
        expect(two.status).toBe('2 gyms');
    });

    it('carries the last weigh-in as a quiet status', () => {
        const row = more.moreMenuGroups({ lastWeight: { weight: 184, unit: 'lbs' } })
            .flatMap((g) => g.rows).find((r) => r.id === 'log-weight');
        expect(row.status).toBe('Last: 184 lb');
    });

    it('every row opens something', () => {
        const src = fs.readFileSync(path.resolve(__dirname, '../../js/core/ui/more-menu.js'), 'utf8');
        for (const id of ids(more.moreMenuGroups())) {
            expect(src, id).toMatch(new RegExp(`['"]?${id}['"]?:\\s*\\(\\)\\s*=>`));
        }
    });
});

describe('More menu sheet', () => {
    it('toggles an openSheet and marks the tab expanded', () => {
        more.toggleMoreMenu();
        const sheet = document.getElementById(more.MORE_MENU_ID);
        expect(sheet).not.toBeNull();
        expect(sheet.classList.contains('sheet')).toBe(true);
        expect(sheet.querySelectorAll('button.srow').length).toBe(ids(more.moreMenuGroups()).length);
        expect(document.querySelector('[data-tab="more"]').getAttribute('aria-expanded')).toBe('true');
        more.toggleMoreMenu();
        expect(sheetById(more.MORE_MENU_ID)).toBeNull();
    });

    it('a row closes the menu, then opens its page', () => {
        window.navigateTo = vi.fn();
        more.toggleMoreMenu();
        more.moreMenuGo('goals');
        expect(sheetById(more.MORE_MENU_ID)).toBeNull();
        expect(window.navigateTo).toHaveBeenCalledWith('goals');
    });

    it('the static #more-menu and its CSS are gone', () => {
        const root = path.resolve(__dirname, '../..');
        expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).not.toMatch(/id="more-menu/);
        expect(fs.readFileSync(path.join(root, 'styles/components/nav.css'), 'utf8')).not.toMatch(/\.more-menu/);
    });
});
