// Coach context builders — pure, no Firebase/DOM. Each returns a compact
// text block for the AI coach's training context (or '' when there's nothing
// to say — callers just concatenate). Kept out of ai-coach-ui.js so they're
// unit-testable without mocking the UI import graph.

import { describeWeekTarget, isDeloadTarget, deriveProgramWeek } from './week-targets.js';
import { DAY_KEYS, DAY_LABELS, satisfiedDays, todayCard } from './week-plan.js';

// deriveProgramWeek moved to week-targets.js (mirrored to functions/) —
// re-exported so existing importers keep working.
export { deriveProgramWeek };

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

const DAY_TAGS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/**
 * `User's saved workouts:` block from AppState.workoutPlans — so "plan my
 * week" answers reference what already exists instead of reinventing it.
 * Template shape: { name|day, category, exercises: [{machine|name, sets, reps|defaultReps}] }
 *
 * Ordering (CP-6): templates on the week plan first, tagged with their day,
 * then the rest by lastUpdated desc — so when the cap bites it drops the
 * stalest template, never the one the user calls "my Thursday pull day".
 * A truncation line names the tool that has the full list.
 */
export function buildTemplatesContext(plans = [], { capTemplates = 20, capExercises = 12, weekPlan = null } = {}) {
    const dayOf = {};
    for (const [day, id] of Object.entries(weekPlan?.days || {})) {
        if (id && id !== 'rest' && DAY_TAGS[day] && !dayOf[id]) dayOf[id] = DAY_TAGS[day];
    }
    const stamp = (t) => t.lastUpdated || t.updatedAt || t.createdAt || '';
    const ordered = [...(plans || [])].sort((a, b) => {
        const aOn = dayOf[a.id] ? 1 : 0;
        const bOn = dayOf[b.id] ? 1 : 0;
        if (aOn !== bOn) return bOn - aOn;
        return stamp(b).localeCompare(stamp(a));
    });
    const rows = ordered.slice(0, capTemplates).map((t) => {
        const name = t.name || t.day || 'Workout';
        const cat = t.category ? ` [${t.category}]` : '';
        const onPlan = dayOf[t.id] ? ` [${dayOf[t.id]}]` : '';
        const exercises = Array.isArray(t.exercises) ? t.exercises : [];
        const exList = exercises.slice(0, capExercises).map((e) => {
            const exName = e.machine || e.name || '?';
            const sets = e.sets || '?';
            const reps = e.defaultReps || e.reps || '?';
            return `${exName} ${sets}×${reps}`;
        }).join(', ');
        const more = exercises.length > capExercises ? ` +${exercises.length - capExercises} more` : '';
        return `- ${name}${cat}${onPlan}: ${exList}${more}`;
    });
    if (!rows.length) return '';
    const hidden = ordered.length - rows.length;
    const tail = hidden > 0 ? `…+${hidden} more (list_templates has all)\n` : '';
    return `User's saved workouts (templates they can start with one tap; [Mon] = on the week plan that day):\n${rows.join('\n')}\n${tail}`;
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
 * `Active program:` context line (Phase 9, propose-only trust level).
 * @returns {string} '' when no active program.
 */
export function buildProgramContext(program, today) {
    if (!program?.startDate) return '';
    const { week, target, finished } = deriveProgramWeek(program, today);
    if (finished) {
        return `Program: "${program.name}" (${program.weeks} weeks, ${program.goal}) FINISHED — only propose a next block if the user asks.\n`;
    }
    const desc = target ? describeWeekTarget(target) : '';
    const targetStr = target
        ? ` — this week: ${target.label}${desc ? ` (${desc})` : ''}${target.note ? `, ${target.note}` : ''}`
        : '';
    // AP-9 — the week line alone ("this week: deload (-35%)") read as
    // background; the model still applied the "hit reps → push weight"
    // doctrine. A deload week gets an explicit directive.
    const deload = target && isDeloadTarget(target)
        ? 'DELOAD WEEK: do NOT prescribe heavier loads this week; hold or reduce. Session targets are already set by the app.\n'
        : '';
    return `Active program: "${program.name}" (${program.goal}) — week ${week} of ${program.weeks}${targetStr}. Session-shaped asks should honor this via propose_session_adjustments; trust level is propose-only (cards, never silent writes).\n${deload}`;
}

/**
 * AP-9 — directive line for the session in progress when its stored
 * `sessionIntent` (AP-6) is a deload from ANY source: a program week, a
 * manual deload with no program, or a legacy "Deload" label on resume.
 * @param {object|null} intent - savedData.sessionIntent
 * @returns {string} '' unless intent.mode === 'deload'
 */
export function buildSessionIntentContext(intent) {
    if (intent?.mode !== 'deload') return '';
    const desc = describeWeekTarget(intent);
    let src = 'labelled deload';
    if (intent.source === 'program') src = intent.week ? `program week ${intent.week}${intent.weeks ? ` of ${intent.weeks}` : ''}` : 'program deload';
    else if (intent.source === 'manual') src = 'manual deload';
    return `Current session: DELOAD (${src}${desc ? ` · ${desc}` : ''}) — do NOT prescribe heavier loads for this session; hold or reduce. Session targets are already set by the app.\n`;
}

const gymName = (loc) => (loc && typeof loc === 'object' ? loc.name : loc) || '';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * AP-15b — the `Today:` header line. The coach had no idea what day it was,
 * what was planned, or where the user trains, so "what should I do today?"
 * was answered without the one fact it hinges on.
 *
 * @param {object} args
 * @param {string} args.today - YYYY-MM-DD (local)
 * @param {object|null} [args.weekPlan] - {days:{mon:templateId|null,…}, restDays}
 * @param {Array} [args.templates] - [{id, name}]
 * @param {Array} [args.workouts] - history (any order): this week's completed
 *   workouts mark planned days done; the newest with a location is the gym
 * @param {object|null} [args.program] - active program doc
 * @param {object|null} [args.intent] - in-progress savedData.sessionIntent
 * @param {object|string|null} [args.currentLocation] - in-progress workout's location
 * @returns {string} one line ending in a newline ('' without a valid date)
 */
export function buildTodayContext({
    today, weekPlan = null, templates = [], workouts = [], program = null,
    intent = null, currentLocation = null,
} = {}) {
    if (!today) return '';
    const date = new Date(`${today}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    const dayKey = DAY_KEYS[(date.getDay() + 6) % 7];
    const parts = [`${DAY_LABELS[dayKey]} ${today}`];

    const nameOf = (id) => (templates || []).find(t => t.id === id)?.name || id;
    if (weekPlan) {
        const monday = new Date(date);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        const mondayStr = ymd(monday);
        const weekDone = (workouts || []).filter(w => w?.completedAt && !w.cancelledAt && w.date >= mondayStr && w.date <= today);
        const card = todayCard(weekPlan, satisfiedDays(weekPlan, weekDone, templates || []), date);
        if (card.kind === 'workout') parts.push(`planned: ${nameOf(card.templateId)}`);
        else if (card.kind === 'rest') parts.push('planned: rest day');
        else if (card.kind === 'done') parts.push(`planned: ${nameOf(weekPlan.days?.[dayKey])} (already done)`);
        else if (card.kind === 'open') parts.push('planned: nothing (open day)');
        else parts.push('no week plan');
    } else {
        parts.push('no week plan');
    }

    let deload = intent?.mode === 'deload';
    if (program?.startDate) {
        const { week, target, finished } = deriveProgramWeek(program, today);
        if (finished) {
            parts.push(`program "${program.name}" finished`);
        } else {
            const desc = target ? describeWeekTarget(target) : '';
            parts.push(`program week ${week} of ${program.weeks}${target ? ` — ${target.label}${desc ? ` (${desc})` : ''}` : ' — baseline'}`);
            if (target && isDeloadTarget(target)) deload = true;
        }
    }
    if (deload) parts.push('DELOAD');

    let gym = gymName(currentLocation);
    if (!gym) {
        const newest = [...(workouts || [])]
            .filter(w => w?.date && gymName(w.location))
            .sort((a, b) => b.date.localeCompare(a.date))[0];
        gym = gymName(newest?.location);
    }
    if (gym) parts.push(`gym: ${gym}`);

    return `Today: ${parts.join(' · ')}\n`;
}

/** A thread's context block older than this is re-sent whole (AP-15e). */
export const CONTEXT_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * AP-15e — does this user turn carry a full training-context block?
 * Context used to ride only on turn 1 and be replayed on reopen, so a
 * thread continued two weeks later reasoned from two-week-old data, and a
 * turn after a coach write still saw the pre-write templates/plan.
 *
 * @param {object} args
 * @param {number} args.turns - messages already in the thread
 * @param {number|null} args.contextAt - ms epoch the last block was attached
 *   (null/0 = never, e.g. a review-seeded thread)
 * @param {boolean} [args.wroteSinceContext] - a coach write landed since then
 * @param {number} [args.now]
 * @returns {'first'|'missing'|'write'|'stale'|null} null = no block this turn
 *   ('missing' = the thread has turns but never carried a block, e.g. a
 *   weekly review seeded as a thread)
 */
export function contextRefreshReason({ turns, contextAt, wroteSinceContext = false, now = Date.now() }) {
    if (!turns) return 'first';
    if (!contextAt) return 'missing';
    if (wroteSinceContext) return 'write';
    if (now - contextAt > CONTEXT_STALE_MS) return 'stale';
    return null;
}

/**
 * The user-turn text carrying a context block. Every variant ends with
 * `\nQuestion: <q>` so history views (and the server's thread title) can
 * strip the block with one marker.
 */
export function contextTurn(context, question, reason = 'first') {
    let lead = 'Here is my recent training data:';
    if (reason === 'write') lead = '(Fresh training data — the app changed since the last block; use this one instead of any earlier block.)';
    else if (reason === 'stale') lead = '(Fresh training data — this conversation is over a day old; use this one instead of any earlier block.)';
    return `${lead}\n\n${context}\n\nQuestion: ${question}`;
}

/** The question the user typed, without any context block (history display). */
export function visibleQuestion(content) {
    const marker = '\nQuestion: ';
    const s = String(content || '');
    const i = s.lastIndexOf(marker);
    return i === -1 ? s : s.slice(i + marker.length);
}

/**
 * First sentence of a coach answer, markdown stripped, for one-line recall.
 * Ends at the first . ! ? followed by a space (or the end), or at a line
 * break, whichever comes first; long sentences are clipped with an ellipsis.
 */
export function firstSentence(text, max = 160) {
    const line = String(text || '')
        .split('\n')
        .map(l => l.replace(/^\s*(?:#+|[-*•]|\d+[.)])\s+/, '').replace(/\*\*|__|`/g, '').trim())
        .find(Boolean) || '';
    const m = line.match(/^.*?[.!?](?=\s|$)/);
    const s = (m ? m[0] : line).trim();
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** ~400 tokens — this is recall, not a transcript. */
const RECENT_THREADS_MAX_CHARS = 1600;

/**
 * AP-15h — `Recent conversations:` block. Each thread used to be a fresh
 * start: the coach had no idea you'd asked about bench three weeks running.
 * One line per recent thread: date, the question that opened it, and the
 * first sentence of how the coach answered.
 *
 * @param {Array} historyDocs - coachHistory docs, newest first:
 *   {question, response, timestamp, type?, threadId?, messages?[]}
 * @param {object} [opts]
 * @param {number} [opts.limit] - threads to include (default 5)
 * @param {string|null} [opts.excludeThreadId] - the thread being continued
 * @returns {string} '' when there's nothing to recall
 */
export function buildRecentThreadsContext(historyDocs = [], { limit = 5, excludeThreadId = null } = {}) {
    const lines = [];
    let chars = 0;
    for (const d of historyDocs || []) {
        if (lines.length >= limit) break;
        if (!d || (excludeThreadId && (d.threadId === excludeThreadId || d.id === excludeThreadId))) continue;
        const date = String(d.timestamp || '').slice(0, 10);
        const firstAnswer = Array.isArray(d.messages)
            ? d.messages.find(m => m?.role === 'assistant' && typeof m.content === 'string')?.content
            : null;
        const answer = firstSentence(firstAnswer || d.response);
        let line;
        if (d.type === 'weekly_review') {
            if (!answer) continue;
            line = `- ${date} · weekly review → "${answer}"`;
        } else {
            const q = visibleQuestion(d.question).replace(/\s+/g, ' ').trim();
            if (!q) continue;
            const qClip = q.length > 120 ? `${q.slice(0, 119).trimEnd()}…` : q;
            line = `- ${date} · "${qClip}"${answer ? ` → "${answer}"` : ''}`;
        }
        if (chars + line.length > RECENT_THREADS_MAX_CHARS) break;
        lines.push(line);
        chars += line.length;
    }
    if (!lines.length) return '';
    return `Recent conversations (newest first — what the user asked and how you opened; build on it, don't repeat it):\n${lines.join('\n')}\n`;
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
