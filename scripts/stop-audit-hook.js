#!/usr/bin/env node
/**
 * Stop hook — runs design-audit in strict mode. On failure emits JSON that
 * blocks the stop and surfaces the audit output to Claude so it can fix
 * violations before the turn ends. On success, exits silently.
 *
 * Wired via .claude/settings.json hooks.Stop.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const auditPath = path.join(__dirname, 'design-audit.js');
const result = spawnSync(process.execPath, [auditPath, '--strict'], {
    encoding: 'utf8',
});

if (result.status === 0) {
    process.exit(0); // Silent success — audit under budget
}

const reason =
    ((result.stdout || '') + (result.stderr || '')).trim() ||
    'Design audit failed (no output)';

process.stdout.write(
    JSON.stringify({
        decision: 'block',
        reason: `Design-system audit exceeded budget — fix before ending the turn:\n\n${reason}`,
    })
);
process.exit(0);
