// CP-1 — functions/movement-patterns.js must be the generated CommonJS
// mirror of the client module. If this fails, run:
//   node scripts/sync-mirror.mjs js/core/features/movement-patterns.js functions/movement-patterns.js

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toCommonJs } from '../../scripts/mirror-transform.mjs';

const MIRRORS = [
    ['js/core/features/movement-patterns.js', 'functions/movement-patterns.js'],
    ['js/core/features/week-targets.js', 'functions/week-targets.js'],
    ['js/core/features/exercise-rotation.js', 'functions/exercise-rotation.js'],
    // AP-15c — was a hand-kept copy; now generated so the server's unit
    // converter and outcome math can't drift from the client's.
    ['js/core/features/coach-outcomes.js', 'functions/coach-outcomes.js'],
];

describe('functions/ mirrors of pure client modules', () => {
    for (const [client, server] of MIRRORS) {
        it(`${server} is the generated mirror of ${client}`, () => {
            // EOL-normalized: a Windows checkout (core.autocrlf) has CRLF
            // bodies while the generated header/footer are LF, so a raw
            // byte compare failed locally even when the committed (LF)
            // copies were in perfect parity.
            const lf = (s) => s.replace(/\r\n/g, '\n');
            const expected = lf(toCommonJs(readFileSync(client, 'utf8'), client));
            const actual = lf(readFileSync(server, 'utf8'));
            expect(actual).toBe(expected);
        });
    }
});
