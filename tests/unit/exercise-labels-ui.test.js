// @vitest-environment jsdom
// LB-3 / LB-4 — the exercise library and editor show and set the labels:
// the picker filters through the one classifier (Glutes and Lower Back are
// reachable, stored "Calves" shows under Legs), a Movement strip filters by
// pattern, the card reads "Legs · Hinge · Machine", and the editor's
// Movement / Focus chips save `pattern` and tags.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map() }));

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
    setHeaderMode: vi.fn(),
    escapeHtml: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    escapeAttr: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    escapeJsArg: (s) => (s == null ? '' : String(s)).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    displayWeight: (w) => ({ value: w, label: 'lbs' }),
    convertWeight: (w) => w,
}));

const { AppState } = await import('../../js/core/utils/app-state.js');
const ui = await import('../../js/core/ui/exercise-manager-ui.js');

const LIBRARY = [
    { id: 'hip', name: 'Hip Thrust Machine', bodyPart: 'Glutes', equipmentType: 'Machine', tags: ['glutes'], pattern: 'hip-dominant', isDefault: true },
    { id: 'bx', name: 'Back Extension Machine', bodyPart: 'Lower Back', equipmentType: 'Machine', tags: ['lower back'], isDefault: true },
    { id: 'calf', name: 'Calf Raise Machine', bodyPart: 'Calves', equipmentType: 'Machine', tags: [], isOverride: true },
    { id: 'lp', name: 'Leg Press', bodyPart: 'Legs', equipmentType: 'Machine', tags: ['legs'], isDefault: true },
    { id: 'rdl', name: 'Barbell Romanian Deadlift', bodyPart: 'Legs', equipmentType: 'Barbell', tags: ['hinge'], isDefault: true },
    { id: 'curl', name: 'Barbell Curl', bodyPart: 'Arms', equipmentType: 'Barbell', tags: ['biceps'], isDefault: true },
];
const rows = () => LIBRARY.map(ui.toLibraryRow);
const names = (list) => list.map(r => r.name).sort();

beforeEach(() => {
    store.clear();
    AppState.currentUser = { uid: 'u1' };
    AppState.exerciseDatabase = LIBRARY;
    document.body.innerHTML = '<div class="app-container"><section id="edit-exercise-section" class="hidden"></section></div>';
});

describe('library rows and the picker filter (LB-3)', () => {
    it('rows carry tags and pattern (an override never re-saves tags: [])', () => {
        const hip = ui.toLibraryRow(LIBRARY[0]);
        expect(hip.tags).toEqual(['glutes']);
        expect(hip.pattern).toBe('hip-dominant');
        expect(hip._view).toEqual({ bodyPart: 'Glutes', pattern: 'hip-dominant', movement: 'Hinge' });
    });

    it('body-part cards filter through the one classifier', () => {
        expect(names(ui.filterLibraryExercises(rows(), { bodyPart: 'Glutes' }))).toEqual(['Hip Thrust Machine']);
        expect(names(ui.filterLibraryExercises(rows(), { bodyPart: 'Back' }))).toEqual(['Back Extension Machine']);
        expect(names(ui.filterLibraryExercises(rows(), { bodyPart: 'Legs' })))
            .toEqual(['Barbell Romanian Deadlift', 'Calf Raise Machine', 'Leg Press']);
    });

    it('the Movement strip offers what is present and filters by pattern', () => {
        const legs = ui.filterLibraryExercises(rows(), { bodyPart: 'Legs' });
        expect(ui.movementsPresent(legs)).toEqual(['knee-dominant', 'hip-dominant', 'calf']);
        expect(names(ui.filterLibraryExercises(legs, { pattern: 'hip-dominant' }))).toEqual(['Barbell Romanian Deadlift']);
        // Search finds by movement word too.
        expect(names(ui.filterLibraryExercises(rows(), { search: 'hinge' }))).toContain('Hip Thrust Machine');
    });

    it('the card meta reads body part · movement · equipment type', () => {
        expect(ui.libraryCardMeta(ui.toLibraryRow(LIBRARY[0]))).toBe('Glutes · Hinge · Machine');
        expect(ui.libraryCardMeta(ui.toLibraryRow(LIBRARY[2]))).toBe('Legs · Calf · Machine');
    });
});

describe('the editor sets the labels (LB-4)', () => {
    it('opens a legacy "Calves" exercise as Legs + the calves focus tag, Movement suggested', () => {
        ui.openEditExerciseSection(ui.toLibraryRow(LIBRARY[2]));
        const active = (id) => [...document.querySelectorAll(`#${id} .chip.active`)].map(c => c.textContent.trim());
        expect(active('edit-ex-bp-row')).toEqual(['Legs']);
        expect(active('edit-ex-focus-row')).toEqual(['Calves']);
        expect(active('edit-ex-move-row')).toEqual(['Calf']);
        expect(document.getElementById('edit-ex-move-hint').textContent).toMatch(/suggested/i);
        // No Calves / Abs body-part chips any more; Glutes and Cardio are there.
        const bp = [...document.querySelectorAll('#edit-ex-bp-row .chip')].map(c => c.textContent.trim());
        expect(bp).toEqual(['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Cardio']);
    });

    it('a Movement tap is an explicit pick; tapping it again goes back to the suggestion', () => {
        ui.openEditExerciseSection(ui.toLibraryRow(LIBRARY[1])); // Back Extension Machine, no stored pattern
        ui.setExerciseMovement('trunk-ext');
        const active = () => [...document.querySelectorAll('#edit-ex-move-row .chip.active')].map(c => c.dataset.move);
        expect(active()).toEqual(['trunk-ext']);
        ui.setExerciseMovement('trunk-ext');
        expect(active()).toEqual(['hip-dominant']); // the suggestion from the name
    });

    it('"More…" shows every movement', () => {
        ui.openEditExerciseSection(ui.toLibraryRow(LIBRARY[5]));
        expect(document.querySelectorAll('#edit-ex-move-row [data-move]').length).toBe(2);
        ui.showAllExerciseMovements();
        expect(document.querySelectorAll('#edit-ex-move-row [data-move]').length).toBe(20);
    });

    it('saving writes the picked pattern, the eight-part body part and the tags', async () => {
        ui.openEditExerciseSection(ui.toLibraryRow(LIBRARY[1]));
        ui.setExerciseBodyPart('Glutes');
        ui.setExerciseMovement('hip-dominant');
        await ui.saveExerciseFromSection();
        const [path, doc] = [...store.entries()].find(([p]) => p.startsWith('users/u1/exerciseOverrides/'));
        expect(path).toBeTruthy();
        expect(doc.bodyPart).toBe('Glutes');
        expect(doc.pattern).toBe('hip-dominant');
        expect(doc.tags).toEqual(['lower back']);
        expect(doc).not.toHaveProperty('_view');
    });

    it('labelFieldsForSave: no pick saves pattern null (inferred later), legacy parts fold', () => {
        expect(ui.labelFieldsForSave({ bodyPart: 'Calves', tags: ['Calves'], pattern: null }))
            .toEqual({ bodyPart: 'Legs', tags: ['calves'], pattern: null });
        expect(ui.labelFieldsForSave({ bodyPart: 'Core', tags: [], pattern: 'nope' }).pattern).toBeNull();
    });

    it('the new chip handlers are wired on window', () => {
        for (const h of ['filterByMovement', 'toggleExerciseFocusTag', 'setExerciseMovement', 'showAllExerciseMovements']) {
            expect(typeof window[h], h).toBe('function');
        }
    });
});
