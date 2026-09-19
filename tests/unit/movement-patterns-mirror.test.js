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
];

describe('functions/ mirrors of pure client modules', () => {
    for (const [client, server] of MIRRORS) {
        it(`${server} is the generated mirror of ${client}`, () => {
            const expected = toCommonJs(readFileSync(client, 'utf8'), client);
            const actual = readFileSync(server, 'utf8');
            expect(actual).toBe(expected);
        });
    }
});
