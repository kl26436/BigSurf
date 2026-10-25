// SH-0 — the ?debug shell HUD's pure parts: the HUD line and the back/close
// defect rules (under the status bar, under 44 px, covered).

import { describe, it, expect } from 'vitest';
import { formatHudLine, controlDefects } from '../../js/core/utils/shell-hud.js';

describe('shell HUD', () => {
    it('formats one line with every number the shell bugs depend on', () => {
        const line = formatHudLine({
            ih: 844, vvH: 500, vvTop: 0, kb: 344, sat: 59, sab: 34, scrollY: '420*', lock: 1,
            section: 'active-workout', open: ['#aw-sheet'], focus: 'INPUT#aw-equip-search',
        });
        expect(line).toBe('ih 844 · vv 500 @0 · kb 344 · sat 59 sab 34 · y 420* · lock 1 · active-workout · #aw-sheet · INPUT#aw-equip-search');
        expect(formatHudLine({ ih: 1, vvH: 1, vvTop: 0, kb: 0, sat: 0, sab: 0, scrollY: 0, lock: 0, section: '', open: [], focus: '' }))
            .toContain('lock 0 · — · — · —');
    });

    it('flags a back button under the status bar, under 44 px, or covered', () => {
        const [high, small, fine, covered] = controlDefects([
            { label: 'Back', top: 50, left: 8, width: 44, height: 44 },
            { label: 'Close', top: 120, left: 300, width: 36, height: 36 },
            { label: 'Back', top: 70, left: 8, width: 44, height: 44 },
            { label: 'Back', top: 70, left: 8, width: 44, height: 44, covered: true },
        ], 59);
        expect(high.defects).toEqual(['under status bar']);
        expect(small.defects).toEqual(['hit area 36×36 < 44']);
        expect(fine.defects).toEqual([]);
        expect(covered.defects).toEqual(['covered at its centre']);
    });
});
