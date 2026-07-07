// Coach context builders — pure, no Firebase/DOM. Each returns a compact
// text block for the AI coach's training context (or '' when there's nothing
// to say — callers just concatenate). Kept out of ai-coach-ui.js so they're
// unit-testable without mocking the UI import graph.

/**
 * `User profile:` block — goal, experience, injuries, notes, height, weekly
 * goal. Injuries are safety-critical: the server-side system prompt instructs
 * the model to flag/substitute around anything listed here.
 *
 * @param {object} settings - AppState.settings (coachGoal, coachInjuries,
 *   coachNotes, profileExperience, profileHeightCm, weeklyGoal)
 */
export function buildProfileContext(settings = {}) {
    const lines = [];
    const goalLabels = {
        cut: 'cut (lose fat, keep muscle)',
        bulk: 'bulk (build muscle)',
        recomp: 'recomposition (build muscle + lose fat)',
        strength: 'strength (top-line lift numbers)',
        general: 'general fitness',
    };
    if (settings.coachGoal && goalLabels[settings.coachGoal]) {
        lines.push(`Goal: ${goalLabels[settings.coachGoal]}`);
    }
    if (settings.profileExperience) {
        lines.push(`Experience: ${settings.profileExperience}`);
    }
    if (settings.coachInjuries) {
        lines.push(`Injuries / limitations: ${settings.coachInjuries}`);
    }
    if (settings.coachNotes) {
        lines.push(`Notes: ${settings.coachNotes}`);
    }
    if (settings.profileHeightCm) {
        lines.push(`Height: ${settings.profileHeightCm} cm`);
    }
    if (settings.weeklyGoal) {
        lines.push(`Weekly training goal: ${settings.weeklyGoal} days`);
    }
    return lines.length ? `User profile:\n${lines.join('\n')}\n` : '';
}

/**
 * `Personal records:` block — top entries by recency of the max-weight PR.
 * Input is pr-tracker getAllPRs() shape:
 *   [{ exercise, equipment, prs: { maxWeight: {weight, reps, date, unit} } }]
 */
export function buildPRContext(prList = [], { limit = 15 } = {}) {
    const rows = (prList || [])
        .filter((p) => p?.prs?.maxWeight?.weight)
        .sort((a, b) => (b.prs.maxWeight.date || '').localeCompare(a.prs.maxWeight.date || ''))
        .slice(0, limit)
        .map((p) => {
            const mw = p.prs.maxWeight;
            const equip = p.equipment && p.equipment !== 'Unknown Equipment' ? ` (${p.equipment})` : '';
            const unit = mw.unit || 'lbs';
            return `${p.exercise}${equip}: ${mw.weight}×${mw.reps} ${unit}${mw.date ? ` on ${mw.date}` : ''}`;
        });
    return rows.length ? `Personal records (best sets, most recent first):\n${rows.join('\n')}\n` : '';
}

/**
 * `User's saved workouts:` block from AppState.workoutPlans — so "plan my
 * week" answers reference what already exists instead of reinventing it.
 * Template shape: { name|day, category, exercises: [{machine|name, sets, reps|defaultReps}] }
 */
export function buildTemplatesContext(plans = [], { capTemplates = 10, capExercises = 12 } = {}) {
    const rows = (plans || []).slice(0, capTemplates).map((t) => {
        const name = t.name || t.day || 'Workout';
        const cat = t.category ? ` [${t.category}]` : '';
        const exercises = Array.isArray(t.exercises) ? t.exercises : [];
        const exList = exercises.slice(0, capExercises).map((e) => {
            const exName = e.machine || e.name || '?';
            const sets = e.sets || '?';
            const reps = e.defaultReps || e.reps || '?';
            return `${exName} ${sets}×${reps}`;
        }).join(', ');
        const more = exercises.length > capExercises ? ` +${exercises.length - capExercises} more` : '';
        return `- ${name}${cat}: ${exList}${more}`;
    });
    return rows.length ? `User's saved workouts (templates they can start with one tap):\n${rows.join('\n')}\n` : '';
}

/**
 * Suffix marker for non-working sets in recent-workout detail lines —
 * `10×135 (warmup)` — so a 45 lb warmup never reads as a strength crash.
 */
export function setTypeMarker(set) {
    const t = set?.type;
    if (!t || t === 'working') return '';
    return ` (${t})`;
}

/**
 * Program week derivation (Phase 9) — NEVER stored, always derived from
 * startDate so nothing rots and no cron advances state.
 * @returns {{week:number, target:object|null, finished:boolean}}
 */
export function deriveProgramWeek(program, today) {
    const start = new Date(`${program.startDate}T12:00:00`);
    const now = new Date(`${today}T12:00:00`);
    const week = Math.floor(Math.round((now - start) / 86400000) / 7) + 1;
    const finished = week > (program.weeks || 1) || week < 1;
    const target = (program.weekTargets || []).find(t => t.week === week) || null;
    return { week, target, finished };
}

/**
 * `Active program:` context line (Phase 9, propose-only trust level).
 * @returns {string} '' when no active program.
 */
export function buildProgramContext(program, today) {
    if (!program?.startDate) return '';
    const { week, target, finished } = deriveProgramWeek(program, today);
    if (finished) {
        return `Program: "${program.name}" (${program.weeks} weeks, ${program.goal}) FINISHED — only propose a next block if the user asks.\n`;
    }
    const targetStr = target
        ? ` — this week: ${target.label}${target.weightPct ? ` (${target.weightPct > 0 ? '+' : ''}${target.weightPct}% weight)` : ''}${target.note ? `, ${target.note}` : ''}`
        : '';
    return `Active program: "${program.name}" (${program.goal}) — week ${week} of ${program.weeks}${targetStr}. Session-shaped asks should honor this via propose_session_adjustments; trust level is propose-only (cards, never silent writes).\n`;
}

/**
 * Freshness note (context is only attached to the FIRST turn of a thread):
 * when the template list changed mid-conversation, prepend one line to the
 * next user turn instead of resending the whole context.
 * @returns {string} '' when unchanged
 */
export function templatesChangedNote(namesAtThreadStart = [], namesNow = []) {
    const a = [...(namesAtThreadStart || [])].sort().join('|');
    const b = [...(namesNow || [])].sort().join('|');
    if (a === b) return '';
    const list = (namesNow || []).slice(0, 10).join(', ') || 'none';
    return `(Update: my saved workouts changed since this conversation started — now: ${list})\n\n`;
}
