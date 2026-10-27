// CP-1 — functions/movement-patterns.js must be the generated CommonJS
// mirror of the client module. If this fails, run:
//   node scripts/sync-mirror.mjs js/core/features/movement-patterns.js functions/movement-patterns.js

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toCommonJs } from '../../scripts/mirror-transform.mjs';

const MIRRORS = [
    ['js/core/features/movement-patterns.js', 'functions/movement-patterns.js'],
    // LB-3 — one body-part taxonomy; training-rules imports it, list_exercises reads it.
    ['js/core/features/exercise-taxonomy.js', 'functions/exercise-taxonomy.js'],
    ['js/core/features/week-targets.js', 'functions/week-targets.js'],
    ['js/core/features/exercise-rotation.js', 'functions/exercise-rotation.js'],
    // AP-15c — was a hand-kept copy; now generated so the server's unit
    // converter and outcome math can't drift from the client's.
    ['js/core/features/coach-outcomes.js', 'functions/coach-outcomes.js'],
    // AP-16 / AP-21 — the rules the server's get_verdicts tool and weekly
    // review run must be the client's rules, byte for byte.
    ['js/core/features/session-intent.js', 'functions/session-intent.js'],
    ['js/core/features/progression.js', 'functions/progression.js'],
    ['js/core/features/training-rules.js', 'functions/training-rules.js'],
    ['js/core/features/progress-scoreboard.js', 'functions/progress-scoreboard.js'],
    ['js/core/features/coach-rules.js', 'functions/coach-rules.js'],
    // AP-17 / AP-18 — the guards the write tools enforce.
    ['js/core/features/fuzzy-match.js', 'functions/fuzzy-match.js'],
    ['js/core/features/coach-guards.js', 'functions/coach-guards.js'],
    // TP-0 — the plain-language glossary every context line and the report card use.
    ['js/core/features/plain-language.js', 'functions/plain-language.js'],
    // TP-1 — goals: bodyweight math + goal progress, server-side for set_goal / list_goals / the report card.
    ['js/core/features/body-stats.js', 'functions/body-stats.js'],
    ['js/core/features/goal-progress.js', 'functions/goal-progress.js'],
    // TP-2 — the Sunday report card: built server-side, recomputed on the page.
    ['js/core/features/report-card.js', 'functions/report-card.js'],
    // TP-3 — the plan timeline and the roller run server-side (Sunday auto-roll, plan tools).
    ['js/core/features/block-view.js', 'functions/block-view.js'],
    ['js/core/features/plan-timeline.js', 'functions/plan-timeline.js'],
    ['js/core/features/plan-roller.js', 'functions/plan-roller.js'],
    // TP-4 — plan-owned sessions (the roll archives the unused ones server-side).
    ['js/core/features/plan-sessions.js', 'functions/plan-sessions.js'],
    // TP-7 — gym levels and generic movements: the coach's candidates and the Plan page's.
    ['js/core/features/gym-profile.js', 'functions/gym-profile.js'],
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
