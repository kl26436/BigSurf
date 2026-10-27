// Queue row 14 — every handler that creates or deletes something runs through
// busy.js `once()`, so a second tap during a slow (local-first) write is
// ignored. busy-and-goal-save.test.js covers once() itself; this pins which
// handlers use it so a refactor can't quietly drop the guard.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const GUARDED = {
    'js/core/workout/workout-management-ui.js': ['saveWorkoutAsTemplate', 'createNewTemplate'],
    'js/core/features/body-measurements-ui.js': ['saveBodyWeightEntry'],
    'js/core/features/location-ui.js': ['saveNewLocationFromModal', 'addNewLocationFromManagement'],
    'js/core/features/manual-workout.js': ['saveManualWorkout'],
    'js/core/ui/equipment-library-ui.js': ['addUnlinkedEquipment', 'addGymPrompt', 'confirmAddEquipment', 'deleteEquipmentFromLibrary'],
    'js/core/ui/block-ui.js': ['planEnable', 'planResume', 'planApplySwaps', 'planUndoRoll', 'savePlanSettings', 'rotateApply', 'rotateAlternate'],
    'js/core/ui/report-card-ui.js': ['reportCardApply'],
};

describe('write handlers are single-flight', () => {
    for (const [file, fns] of Object.entries(GUARDED)) {
        const src = readFileSync(file, 'utf8');
        for (const fn of fns) {
            it(`${fn} (${file.split('/').pop()}) runs through once()`, () => {
                const m = src.match(new RegExp(`export function ${fn}\\([^)]*\\) \\{\\s*return once\\(`));
                expect(m, `${fn} should be \`export function ${fn}(…) { return once(…) }\``).not.toBeNull();
            });
        }
    }
});
