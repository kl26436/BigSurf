#!/usr/bin/env node
/**
 * Coach eval gate (AU-1) — fails when the coach changed after the last eval
 * baseline, so a prompt/tool/loop/context change can't ship unmeasured.
 *
 *   npm run eval:coach:check        exit 1 = run `npm run eval:coach` with
 *                                   EVAL_UPDATE_BASELINE=1 and commit the baseline
 *
 * Cheap on purpose (git only, no API): the expensive eval runs when this says
 * so, not on every push. Wired as a pre-push hook by `npm run hooks:install`.
 *
 * "Changed" = a commit touching a coach file is newer than the last commit of
 * tests/coach-eval/baseline.json, or a coach file has uncommitted edits.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = 'tests/coach-eval/baseline.json';
// Everything that changes what the coach is told or can do.
const COACH_FILES = [
    'functions/coach-prompts.js', 'functions/coach-loop.js', 'functions/coach-tools.js',
    'functions/coach-routing.js', 'functions/coach-guards.js', 'functions/coach-rules.js',
    'functions/weekly-review.js', 'functions/report-card-request.js', 'js/core/features/report-card.js',
    'functions/plan-roll.js', 'js/core/features/plan-timeline.js', 'js/core/features/plan-roller.js', 'js/core/features/plan-sessions.js',
    'js/core/features/coach-context-builder.js', 'js/core/features/coach-context.js',
    'js/core/features/coach-live-context.js', 'js/core/features/coach-rules.js',
    'js/core/features/plain-language.js', 'js/core/features/goal-progress.js', 'js/core/features/body-stats.js',
];

const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).trim();

function lastCommitTime(files) {
    const out = git(`log -1 --format=%ct -- ${files.join(' ')}`);
    return out ? Number(out) : 0;
}

function main() {
    if (!fs.existsSync(path.join(ROOT, BASELINE))) {
        console.error('✘ Coach eval: no baseline yet. Run once with your key:\n'
            + '    ANTHROPIC_API_KEY=… EVAL_UPDATE_BASELINE=1 npm run eval:coach\n'
            + `  then commit ${BASELINE}.`);
        return 1;
    }
    const baselineAt = lastCommitTime([BASELINE]);
    const dirty = git(`status --porcelain -- ${COACH_FILES.join(' ')}`).split('\n').filter(Boolean);
    const newer = COACH_FILES.filter(f => lastCommitTime([f]) > baselineAt);
    if (!dirty.length && !newer.length) {
        console.log('✔ Coach eval baseline is newer than every coach change.');
        return 0;
    }
    console.error('✘ The coach changed since the eval baseline:');
    for (const f of newer) console.error(`    committed: ${f}`);
    for (const d of dirty) console.error(`    uncommitted: ${d.slice(3)}`);
    console.error('  Run `npm run eval:coach` (EVAL_ONLY=… to iterate), check for regressions,\n'
        + `  then EVAL_UPDATE_BASELINE=1 and commit ${BASELINE}.`);
    return 1;
}

if (require.main === module) process.exit(main());
module.exports = { COACH_FILES, main };
