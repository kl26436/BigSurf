// @vitest-environment jsdom
// UD-2 (docs/ux-deep-dive-2026-10.md) — the lift screen: one door per action.
// Imports the REAL active-workout module and renders it into jsdom.
//   - no "+" pill and no "Remove" button; the unit toggle is a lb | kg segment
//   - a set is removed by swiping its row (awRemoveSet(ex, set)), with Undo
//   - Finish runs once per tap (B1)
//   - one sentence for what cancelling does (one site in js/)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const { store } = vi.hoisted(() => ({ store: new Map() }));
vi.mock('../../js/core/data/firebase-config.js', async () => {
    const { createFirestoreMock } = await import('../fixtures/firestore-mock.js');
    return createFirestoreMock(store);
});

const { notify } = vi.hoisted(() => ({ notify: [] }));
vi.mock('../../js/core/ui/ui-helpers.js', async (orig) => {
    const real = await orig();
    return {
        ...real,
        showNotification: (msg, type, _d, action) => notify.push({ msg, type, action }),
    };
});

const { AppState } = await import('../../js/core/utils/app-state.js');
const aw = await import('../../js/core/workout/active-workout-ui.js');

function setUpWorkout(sets) {
    AppState.currentWorkout = {
        name: 'Push A',
        exercises: [{ name: 'Bench Press', sets: sets.length, reps: 8, weight: 135, equipment: null }],
    };
    AppState.savedData = {
        workoutType: 'Push A',
        exercises: { exercise_0: { sets: sets.map((s) => ({ ...s })) } },
    };
    AppState.exerciseUnits = {};
    AppState.globalUnit = 'lbs';
    AppState.workoutStartTime = new Date();
    AppState.currentSessionBodyWeightLbs = 180;
}

// jsdom has no layout: the render's rAF scrolls the current pill into view.
Element.prototype.scrollIntoView = () => {};

beforeEach(() => {
    notify.length = 0;
    document.body.innerHTML = '<div id="active-workout"></div>';
});

describe('UD-2 — the lift screen renders one door per action', () => {
    it('has no "+" pill, no Remove button, and a lb | kg segmented unit control', () => {
        setUpWorkout([{ reps: 8, weight: 135, originalUnit: 'lbs', completed: false }]);
        aw.renderAll();
        const root = document.getElementById('active-workout');
        expect(root.querySelector('.aw-pill--add')).toBeNull();
        expect(root.querySelector('.aw-remove-set')).toBeNull();
        const seg = root.querySelector('.aw-unit-seg');
        expect(seg).not.toBeNull();
        expect(seg.querySelector('span.on').textContent).toBe('lb');
        expect(seg.getAttribute('aria-label')).toMatch(/switch to kg/);
        // Every set row says which exercise it belongs to (the swipe reads it).
        expect(root.querySelector('.aw-set-row').dataset.exIdx).toBe('0');
    });
});

describe('UD-2 — removing a set', () => {
    const three = () => [
        { reps: 8, weight: 135, originalUnit: 'lbs', completed: true },
        { reps: 7, weight: 140, originalUnit: 'lbs', completed: true },
        { reps: 6, weight: 145, originalUnit: 'lbs', completed: false },
    ];

    it('removes THAT set (not the last) and Undo puts it back in place', () => {
        setUpWorkout(three());
        aw.awRemoveSet(0, 1);
        const sets = () => AppState.savedData.exercises.exercise_0.sets;
        expect(sets().map((s) => s.weight)).toEqual([135, 145]);
        expect(AppState.currentWorkout.exercises[0].sets).toBe(2);
        const toast = notify.at(-1);
        expect(toast.msg).toBe('Set 2 removed');
        expect(toast.action.label).toBe('Undo');
        toast.action.onClick();
        expect(sets().map((s) => s.weight)).toEqual([135, 140, 145]);
        expect(AppState.currentWorkout.exercises[0].sets).toBe(3);
    });

    it('with no set index, removes the last set', () => {
        setUpWorkout(three());
        aw.awRemoveSet(0);
        expect(AppState.savedData.exercises.exercise_0.sets.map((s) => s.weight)).toEqual([135, 140]);
    });

    it('keeps at least one set', () => {
        setUpWorkout([{ reps: 8, weight: 135, originalUnit: 'lbs', completed: false }]);
        aw.awRemoveSet(0, 0);
        expect(AppState.savedData.exercises.exercise_0.sets).toHaveLength(1);
        expect(notify.at(-1).msg).toMatch(/at least one set/);
    });
});

// 10/27 bug log: "Can't delete / remove a set from active workout" — the same
// evening's guard refused any swipe that STARTED on an input or the ✓, which
// on a phone is nearly the whole row.
describe('swipe to remove a set', () => {
    const three = () => [
        { reps: 8, weight: 135, originalUnit: 'lbs', completed: true },
        { reps: 7, weight: 140, originalUnit: 'lbs', completed: true },
        { reps: 6, weight: 145, originalUnit: 'lbs', completed: false },
    ];
    const touch = (target, type, x, y = 100) => {
        const ev = new Event(type, { bubbles: true });
        const point = { clientX: x, clientY: y, target };
        Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [point] });
        target.dispatchEvent(ev);
    };
    const swipe = (target, dx) => {
        touch(target, 'touchstart', 300);
        touch(target, 'touchmove', 300 - 10);   // locks the direction: sideways
        touch(target, 'touchmove', 300 + dx);
        touch(target, 'touchend', 300 + dx);
    };
    const weights = () => AppState.savedData.exercises.exercise_0.sets.map((s) => s.weight);
    const row = (i) => document.querySelectorAll('#active-workout .aw-set-row')[i];

    it('removes the set when the swipe starts on the weight field', () => {
        setUpWorkout(three());
        aw.renderAll();
        swipe(row(1).querySelector('input'), -130);
        expect(weights()).toEqual([135, 145]);
    });

    it('removes the set when the swipe starts on the ✓', () => {
        setUpWorkout(three());
        aw.renderAll();
        swipe(row(1).querySelector('button, .aw-set-row__check'), -130);
        expect(weights()).toEqual([135, 145]);
    });

    it('a short slide that starts on a field does not remove (needs the longer pull)', () => {
        setUpWorkout(three());
        aw.renderAll();
        swipe(row(1).querySelector('input'), -85);
        expect(weights()).toEqual([135, 140, 145]);
    });

    it('the row surface keeps the shorter pull', () => {
        setUpWorkout(three());
        aw.renderAll();
        swipe(row(1).querySelector('.aw-set-row__num'), -85);
        expect(weights()).toEqual([135, 145]);
    });

    it('a vertical drag never removes', () => {
        setUpWorkout(three());
        aw.renderAll();
        const t = row(1).querySelector('input');
        touch(t, 'touchstart', 300, 100);
        touch(t, 'touchmove', 302, 140);
        touch(t, 'touchmove', 200, 260);
        touch(t, 'touchend', 200, 260);
        expect(weights()).toEqual([135, 140, 145]);
    });

    it('a one-set exercise says it keeps one set instead of ignoring the swipe', () => {
        setUpWorkout([{ reps: 8, weight: 135, originalUnit: 'lbs', completed: false }]);
        aw.renderAll();
        swipe(row(0).querySelector('.aw-set-row__num'), -130);
        expect(weights()).toEqual([135]);
        expect(notify.at(-1).msg).toMatch(/at least one set/);
    });

    it('setSwipeThreshold: typing in the row blocks; a control needs the longer pull', () => {
        expect(aw.setSwipeThreshold({ typingInRow: true })).toBeNull();
        expect(aw.setSwipeThreshold({ onControl: true })).toBeGreaterThan(aw.setSwipeThreshold({}));
    });
});

describe('B1 — Finish runs once per tap', () => {
    it('a second tap while the first finish is still running is ignored', async () => {
        setUpWorkout([{ reps: 8, weight: 135, originalUnit: 'lbs', completed: true }]);
        let release;
        const completeWorkout = vi.fn(() => new Promise((r) => { release = r; }));
        window.completeWorkout = completeWorkout;
        const first = aw.awFinishWorkout();
        const second = aw.awFinishWorkout();
        await Promise.resolve();
        await Promise.resolve();
        expect(completeWorkout).toHaveBeenCalledTimes(1);
        release();
        await first;
        await second;
        // Once it's done, the next tap works again.
        setUpWorkout([{ reps: 8, weight: 135, originalUnit: 'lbs', completed: true }]);
        const third = aw.awFinishWorkout();
        await Promise.resolve();
        await Promise.resolve();
        release();
        await third;
        expect(completeWorkout).toHaveBeenCalledTimes(2);
    });
});

describe('UD-2 — one sentence for cancelling a workout', () => {
    it('the cancel copy lives in exactly one place in js/', () => {
        const root = path.resolve(__dirname, '../../js');
        const files = [];
        const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
            const f = path.join(d, e.name);
            if (e.isDirectory()) walk(f); else if (f.endsWith('.js')) files.push(f);
        });
        walk(root);
        const hits = files.filter((f) => /cancelled session|unsaved progress|incomplete entry/.test(
            fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')));
        expect(hits.map((f) => path.relative(root, f).replace(/\\/g, '/'))).toEqual(['core/workout/workout-session.js']);
    });
});
