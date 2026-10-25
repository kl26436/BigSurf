import { defineConfig } from 'vitest/config';

// AP-20 — the coach eval: real API calls, so it never runs with `npm test`.
// `npm run eval:coach` (see tests/coach-eval/coach.eval.js for env knobs).
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/coach-eval/**/*.eval.js'],
        globals: true,
        testTimeout: 600000,
        hookTimeout: 60000,
        fileParallelism: false,
    },
});
