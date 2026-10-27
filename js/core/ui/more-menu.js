// More menu — core/ui/more-menu.js
//
// UD-1 (docs/ux-deep-dive-2026-10.md §2): the More tab opens an openSheet()
// rendered from one model, so it gets what every sheet gets (Escape, system
// back, swipe-down, focus, page lock, stacking under toasts) and the static
// #more-menu with its own drag handler and z-index above the toasts is gone.
// It's the map of the app: every page a user can want is a row here or a tab.
// Nothing here duplicates the tab bar (Coach, Workouts) or Settings' rows.

import { AppState } from '../utils/app-state.js';
import { escapeHtml } from './ui-helpers.js';
import { openSheet, closeSheet, sheetById } from './sheet.js';

export const MORE_MENU_ID = 'more-menu';

// What each row opens. Handlers are window functions (main.js / page modules)
// so this module stays free of page imports.
const ROW_ACTIONS = {
    plan: () => window.navigateTo?.('plan'),
    goals: () => window.navigateTo?.('goals'),
    reportcard: () => window.navigateTo?.('reportcard'),
    progress: () => window.showProgressPage?.(),
    'log-weight': () => window.showWeightEntryModal?.(),
    body: () => window.showCompositionDetail?.(),
    exercises: () => window.navigateTo?.('exercises'),
    equipment: () => window.navigateTo?.('equipment'),
    gyms: () => window.navigateTo?.('location'),
    'plate-calculator': () => window.navigateTo?.('plate-calculator'),
    settings: () => window.navigateTo?.('settings'),
};

/**
 * The menu as data: groups of rows. Pure — the status lines come from what
 * the caller already knows (nothing here reads Firestore).
 * @param {{gymCount?: number|null, lastWeight?: {weight:number, unit:string}|null, email?: string}} facts
 */
export function moreMenuGroups({ gymCount = null, lastWeight = null, email = '' } = {}) {
    const gymsStatus = gymCount === 0 ? 'Add your first'
        : gymCount > 0 ? `${gymCount} gym${gymCount === 1 ? '' : 's'}` : '';
    const weightStatus = lastWeight?.weight != null
        ? `Last: ${lastWeight.weight} ${lastWeight.unit === 'kg' ? 'kg' : 'lb'}`
        : '';
    return [
        {
            label: 'Your training',
            rows: [
                { id: 'plan', icon: 'fa-calendar-week', tint: 'ic-primary', title: 'Your plan' },
                { id: 'goals', icon: 'fa-bullseye', tint: 'ic-warm', title: 'Goals' },
                { id: 'reportcard', icon: 'fa-clipboard-check', tint: 'ic-primary', title: 'Report card' },
                { id: 'progress', icon: 'fa-chart-line', tint: 'ic-blue', title: 'Progress' },
            ],
        },
        {
            label: 'Your body',
            rows: [
                { id: 'log-weight', icon: 'fa-weight-scale', tint: 'ic-purple', title: 'Log weight', status: weightStatus },
                { id: 'body', icon: 'fa-person', tint: 'ic-purple', title: 'Body & scans' },
            ],
        },
        {
            label: 'Your gym',
            rows: [
                { id: 'exercises', icon: 'fa-list', tint: 'ic-muted', title: 'Exercises' },
                { id: 'equipment', icon: 'fa-wrench', tint: 'ic-muted', title: 'Equipment' },
                { id: 'gyms', icon: 'fa-location-dot', tint: 'ic-muted', title: 'Gyms', status: gymsStatus },
                { id: 'plate-calculator', icon: 'fa-calculator', tint: 'ic-muted', title: 'Plate calculator' },
            ],
        },
        {
            label: 'Account',
            rows: [
                // Sign out and the error log live in Settings.
                { id: 'settings', icon: 'fa-gear', tint: 'ic-muted', title: 'Settings', status: email },
            ],
        },
    ];
}

function rowHtml(row) {
    return `
        <button type="button" class="srow srow--clickable srow--button" onclick="moreMenuGo('${row.id}')">
            <span class="srow-icon ${row.tint}"><i class="fas ${row.icon}" aria-hidden="true"></i></span>
            <span class="srow-info">
                <span class="srow-name">${escapeHtml(row.title)}</span>
                ${row.status ? `<span class="srow-desc">${escapeHtml(row.status)}</span>` : ''}
            </span>
            <i class="fas fa-chevron-right srow-chev" aria-hidden="true"></i>
        </button>`;
}

export function renderMoreMenu(groups) {
    return groups.map((g) => `
        <div class="group-label">${escapeHtml(g.label)}</div>
        <div class="group">${g.rows.map(rowHtml).join('')}</div>
    `).join('');
}

function moreTab() {
    return document.querySelector('[data-tab="more"]');
}

export function openMoreMenu() {
    const gyms = AppState._cachedLocations;
    const groups = moreMenuGroups({
        gymCount: Array.isArray(gyms) ? gyms.length : null,
        lastWeight: AppState._lastBodyWeight || null,
        email: AppState.currentUser?.email || '',
    });
    openSheet({
        id: MORE_MENU_ID,
        title: 'More',
        bodyHTML: renderMoreMenu(groups),
        bodyClass: 'more-sheet',
        onClose: () => moreTab()?.setAttribute('aria-expanded', 'false'),
    });
    moreTab()?.setAttribute('aria-expanded', 'true');

    // Gyms' status is the one fact that may not be loaded yet; fill it in
    // place when it lands (PF-2: read once per session, never on Home's path).
    if (!Array.isArray(gyms) && AppState.currentUser) {
        import('../data/firebase-workout-manager.js')
            .then(({ FirebaseWorkoutManager }) => new FirebaseWorkoutManager(AppState).getUserLocations())
            .then((locations) => {
                AppState._cachedLocations = locations || [];
                const sheet = sheetById(MORE_MENU_ID);
                if (!sheet) return;
                sheet.setBody(renderMoreMenu(moreMenuGroups({
                    gymCount: AppState._cachedLocations.length,
                    lastWeight: AppState._lastBodyWeight || null,
                    email: AppState.currentUser?.email || '',
                })));
            })
            .catch(() => { /* status line is a bonus */ });
    }
}

export function closeMoreMenu() {
    if (sheetById(MORE_MENU_ID)) closeSheet(MORE_MENU_ID);
}

export function toggleMoreMenu() {
    if (sheetById(MORE_MENU_ID)) closeMoreMenu();
    else openMoreMenu();
}

/** Row tap: close the menu, then open the page. */
export function moreMenuGo(id) {
    closeMoreMenu();
    ROW_ACTIONS[id]?.();
}

if (typeof window !== 'undefined') {
    window.moreMenuGo = moreMenuGo;
}
