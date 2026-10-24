// AP-2 — captureTrace lands on the session error log without touching the
// unread badge or the persisted store (a per-exercise autofill_trace must
// not evict real errors or light the badge on every workout start).

import { describe, it, expect, vi } from 'vitest';

const { setDoc } = vi.hoisted(() => ({ setDoc: vi.fn(async () => {}) }));
vi.mock('../../js/core/data/firebase-config.js', () => ({
    db: {}, doc: vi.fn(() => ({})), setDoc,
    collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), getDocs: vi.fn(async () => ({ size: 0, docs: [] })), deleteDoc: vi.fn(),
}));
vi.mock('../../js/core/ui/ui-helpers.js', () => ({ showNotification: vi.fn() }));
// logError reads the visible section / open modal for context — no DOM in the
// node test env, so stub just those lookups.
vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });

import { captureTrace, captureWarning, getErrorLog, getUnreadErrorCount } from '../../js/core/utils/error-handler.js';
import { AppState } from '../../js/core/utils/app-state.js';

describe('captureTrace', () => {
    it('logs an info entry quietly and never persists it', async () => {
        AppState.currentUser = { uid: 'u1' };
        const unreadBefore = getUnreadErrorCount();
        captureTrace('autofill_trace: Bench Press · start', 'loadAutofillForExercise', { exerciseIdx: 0 });
        await new Promise(r => setTimeout(r, 0));
        const last = getErrorLog().at(-1);
        expect(last).toMatchObject({ severity: 'info', message: 'autofill_trace: Bench Press · start' });
        expect(last.context.exerciseIdx).toBe(0);
        expect(getUnreadErrorCount()).toBe(unreadBefore);
        expect(setDoc).not.toHaveBeenCalled();
    });

    it('warnings still bump the badge and persist', async () => {
        const unreadBefore = getUnreadErrorCount();
        captureWarning('autofill_mismatch: Bench Press', 'renderExerciseView', {});
        await new Promise(r => setTimeout(r, 0));
        expect(getUnreadErrorCount()).toBe(unreadBefore + 1);
        expect(setDoc).toHaveBeenCalledTimes(1);
    });
});
