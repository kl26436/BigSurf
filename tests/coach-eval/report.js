// Coach eval report + regression diff (AP-20e). Pure.

/** Per-scenario record stored in results/*.json and baseline.json. */
export function toRecord(scenario, run, checks, grade) {
    return {
        id: scenario.id,
        title: scenario.title,
        model: run.model,
        route: run.route?.tier || null,
        passed: checks.filter(c => c.pass).length,
        total: checks.length,
        failed: checks.filter(c => !c.pass).map(c => c.id),
        grade: grade || null,
        words: (run.text || '').split(/\s+/).filter(Boolean).length,
        tools: (run.toolCalls || []).map(c => c.name),
        rounds: run.rounds,
        tokens: run.usage || {},
        ms: run.ms,
        error: run.error || null,
        text: run.text || '',
    };
}

/**
 * What got worse since the baseline: a check that passed now fails, a
 * scenario that ran now errors, or the grade mean dropped by ≥ 1.
 */
export function compareToBaseline(baseline, current) {
    const before = new Map((baseline?.scenarios || []).map(s => [s.id, s]));
    const regressions = [];
    const improvements = [];
    for (const s of current.scenarios) {
        const b = before.get(s.id);
        if (!b) continue;
        for (const id of s.failed) if (!b.failed.includes(id)) regressions.push(`${s.id}: ${id} now fails`);
        for (const id of b.failed) if (!s.failed.includes(id)) improvements.push(`${s.id}: ${id} now passes`);
        if (s.error && !b.error) regressions.push(`${s.id}: errored (${s.error.slice(0, 80)})`);
        // AU-7 — a grade whose low scores carry no evidence isn't trusted for the diff.
        const trusted = (g) => g?.mean != null && !(g.unsupported || []).length;
        if (trusted(b.grade) && trusted(s.grade)) {
            const d = Math.round((s.grade.mean - b.grade.mean) * 100) / 100;
            if (d <= -1) regressions.push(`${s.id}: grade ${b.grade.mean} → ${s.grade.mean}`);
            else if (d >= 1) improvements.push(`${s.id}: grade ${b.grade.mean} → ${s.grade.mean}`);
        }
    }
    return { regressions, improvements };
}

export function formatReport(current, diff) {
    const lines = [
        `Coach eval — ${current.at} — ${current.scenarios.length} scenarios`,
        '',
        '| scenario | checks | grade | words | tools | rounds | s |',
        '|---|---:|---:|---:|---|---:|---:|',
    ];
    for (const s of current.scenarios) {
        lines.push(`| ${s.id} | ${s.passed}/${s.total}${s.failed.length ? ` ✗ ${s.failed.join(', ')}` : ''} | ${s.grade?.mean ?? '—'} | ${s.words} | ${s.tools.join(' ') || '—'} | ${s.rounds} | ${Math.round((s.ms || 0) / 1000)} |`);
    }
    const passed = current.scenarios.reduce((n, s) => n + s.passed, 0);
    const total = current.scenarios.reduce((n, s) => n + s.total, 0);
    const graded = current.scenarios.filter(s => s.grade?.mean != null);
    lines.push('', `Checks: ${passed}/${total}${graded.length ? ` · mean grade ${Math.round(graded.reduce((n, s) => n + s.grade.mean, 0) / graded.length * 100) / 100}` : ''}`);
    if (diff) {
        lines.push(diff.regressions.length ? `Regressions vs baseline:\n- ${diff.regressions.join('\n- ')}` : 'No regressions vs baseline.');
        if (diff.improvements.length) lines.push(`Improvements:\n- ${diff.improvements.join('\n- ')}`);
    }
    return lines.join('\n');
}
