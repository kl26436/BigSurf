// Coach context builder — core/features/coach-context-builder.js (AP-20c)
//
// The chat coach's first-turn context block, as a PURE function of its
// inputs. It used to live inside ai-coach-ui.js reading AppState directly, so
// the only way to see what the model saw was to open the app. Now the coach
// tab (ai-coach-ui.js) and the eval runner (tests/coach-eval) build the
// identical block from the same data — a scenario fixture produces exactly
// what production would send for that user.

import { RULE_THRESHOLDS, averageWeeklyVolume } from './training-rules.js';
import { weightIncrement } from './progression.js';
import { convertWeight } from '../ui/ui-helpers.js';
import {
    buildProfileContext, buildPRContext, buildTemplatesContext, setTypeMarker,
    buildProgramContext, buildSessionIntentContext, buildTodayContext,
} from './coach-context.js';
import { summarizeWeekPlan, satisfiedDays, weekDates, DAY_KEYS } from './week-plan.js';
import { computeVerdicts, formatVerdictsContext } from './coach-rules.js';

/**
 * Exercises with `name` resolved from the workout-level `exerciseNames` map
 * (persisted exercises carry no inline name). Keep in sync with the copies in
 * aggregators.js / training-insights.js (cache-skew rule: no cross-imports).
 */
function withResolvedNames(workout) {
    const exercises = workout?.exercises || {};
    return Object.entries(exercises).map(([key, ex]) => ({
        ...ex,
        name: ex?.name || ex?.machine || workout?.exerciseNames?.[key] || null,
    }));
}

/** Number of weeks spanned by a workout list (min 1 when non-empty). */
export function getWeeksSpan(workouts) {
    if (!workouts?.length) return 0;
    const dates = workouts.map(w => w.date).filter(Boolean).sort();
    const first = new Date(dates[0]);
    const last = new Date(dates[dates.length - 1]);
    return Math.max(1, Math.ceil((last - first) / (7 * 24 * 60 * 60 * 1000)));
}

/**
 * The "training" section: profile, weekly volume, lift trends, PRs, saved
 * workouts, plates, week plan + adherence, frequency, recent sessions,
 * equipment by gym, body composition.
 * @param {object} args
 * @param {Array} args.workouts - full history (any order)
 * @param {object} [args.settings] - preferences/settings (profile, plates, weeklyGoal)
 * @param {'lbs'|'kg'} [args.unit]
 * @param {string} args.today - YYYY-MM-DD (the user's local date)
 */
export function buildTrainingContext({
    workouts, settings = {}, unit = 'lbs', exerciseDatabase = [], today,
    templates = [], weekPlan = null, equipment = [], prList = [], healthSummary = '',
    thresholds = RULE_THRESHOLDS,
} = {}) {
    if (!workouts || workouts.length === 0) return 'No workout data available.';
    const t = { ...RULE_THRESHOLDS, ...(thresholds || {}) };

    const weeks = getWeeksSpan(workouts);

    // Who the coach is talking to comes first — goal/experience/injuries
    // reframe everything below it.
    let summary = buildProfileContext(settings || {});
    if (summary) summary += '\n';

    // Volume by muscle group — a TRUE per-week average over the last 4 weeks
    // (AP-15a: this used to be the 4-week sum labelled "weekly avg", ~4×
    // inflated against MEV/MRV → phantom overtraining calls).
    const { volume, weeks: volWeeks } = averageWeeklyVolume(workouts, exerciseDatabase, {
        today, days: 28, mev: t.VOLUME_MEV, mrv: t.VOLUME_MRV,
    });
    if (volume.length > 0) {
        summary += `Weekly volume (avg working sets/muscle/week over the last ${volWeeks} week${volWeeks === 1 ? '' : 's'}; MEV ${t.VOLUME_MEV}, MRV ${t.VOLUME_MRV}):\n`;
        volume.forEach(v => {
            summary += `${v.bodyPart}: ${v.avgWeeklySets} sets/week (${v.status})\n`;
        });
    }

    // Key lift trends (max weight per exercise, last sessions), normalized to
    // the display unit so a mixed-unit log doesn't read as "225 -> 100 -> 225".
    const liftTrends = {};
    for (const workout of workouts) {
        if (!workout.exercises) continue;
        for (const ex of withResolvedNames(workout)) {
            if (!ex.name || !ex.sets) continue;
            const normalized = ex.sets
                // Warmups out — a 45 lb warmup polluting a max-weight trend
                // reads as a strength crash that never happened.
                .filter(s => s.weight && s.type !== 'warmup')
                .map(s => convertWeight(s.weight, s.originalUnit || 'lbs', unit));
            const maxW = Math.max(...normalized, 0);
            if (maxW === 0) continue;
            if (!liftTrends[ex.name]) liftTrends[ex.name] = [];
            liftTrends[ex.name].push(maxW);
        }
    }
    // Top 12 most-trained exercises, up to 8 recent max-weight points each.
    const topLifts = Object.entries(liftTrends)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 12);
    if (topLifts.length > 0) {
        summary += `\nKey lift trends (max weight in ${unit}, recent sessions, newest first):\n`;
        topLifts.forEach(([name, weights]) => {
            summary += `${name}: ${weights.slice(0, 8).join(' -> ')} ${unit}\n`;
        });
    }

    // Personal records — lets the coach anchor advice to all-time bests.
    const prBlock = buildPRContext(prList);
    if (prBlock) summary += `\n${prBlock}`;

    // Saved workouts — "plan my week" should adjust what exists, not reinvent.
    const templatesBlock = buildTemplatesContext(templates || [], { weekPlan });
    if (templatesBlock) summary += `\n${templatesBlock}`;

    // Plate inventory — the coach must never prescribe a load the gym can't build.
    const plates = unit === 'kg' ? settings?.plateKg : settings?.plateLbs;
    if (Array.isArray(plates) && plates.length) {
        summary += `\nPlates available (per side): ${[...plates].sort((a, b) => b - a).join(', ')} ${unit} — smallest real weight jump is ${weightIncrement(unit, plates)} ${unit}.\n`;
    }

    // Week plan + adherence so far this week.
    if (weekPlan) {
        summary += `\nWeek plan: ${summarizeWeekPlan(weekPlan, templates || [])}\n`;
        try {
            const plannedTotal = DAY_KEYS.filter(d => weekPlan.days?.[d]).length;
            if (plannedTotal > 0) {
                const dates = weekDates(today ? new Date(`${today}T12:00:00`) : new Date());
                const weekWorkouts = workouts.filter(w => w.completedAt && w.date >= dates.mon && (!today || w.date <= today));
                const done = satisfiedDays(weekPlan, weekWorkouts, templates || []);
                summary += `This week so far: ${done.size} of ${plannedTotal} planned days done.\n`;
            }
        } catch { /* adherence line is best-effort */ }
    }

    // Training frequency
    const avgDaysPerWeek = weeks > 0 ? (workouts.length / weeks).toFixed(1) : workouts.length;
    summary += `\nAvg training days/week: ${avgDaysPerWeek}\n`;
    summary += `Total workouts analyzed: ${workouts.length} over ${weeks} weeks\n`;
    summary += `\nUnit: ${unit} | Weekly goal: ${settings?.weeklyGoal || 5} days\n`;

    // Recent sessions with sets, notes and readiness. AP-16: the verdicts
    // block carries the computed answers and get_exercise_history serves
    // depth, so 12 sessions is enough evidence.
    const RECENT_DETAIL_CAP = 12;
    const recent = [...workouts]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, RECENT_DETAIL_CAP);
    if (recent.length > 0) {
        summary += `\nRecent workouts (most recent first):\n`;
        for (const w of recent) {
            const wName = w.workoutType || 'Workout';
            const loc = w.location || '';
            const ready = w.readiness?.score
                ? ` · felt ${w.readiness.score}/5${w.readiness.note ? ` ("${w.readiness.note}")` : ''}`
                : '';
            // Session label (AP-9): a planned −35% "Deload" must not read as a crash.
            const label = w.sessionLabel ? ` · ${w.sessionLabel}` : '';
            summary += `\n${w.date} · ${wName}${loc ? ` @ ${typeof loc === 'object' ? (loc.name || '') : loc}` : ''}${label}${ready}\n`;
            for (const ex of withResolvedNames(w)) {
                if (!ex.name) continue;
                const equip = ex.equipment ? ` [${ex.equipment}]` : '';
                const sets = (ex.sets || [])
                    .filter(s => s.completed !== false && (s.reps || s.weight))
                    .map(s => {
                        const wt = s.weight ? convertWeight(s.weight, s.originalUnit || unit, unit) : 0;
                        return `${s.reps || '?'}×${wt || 'BW'}${s.rpe ? ` @RPE ${s.rpe}` : ''}${setTypeMarker(s)}`;
                    })
                    .join(', ');
                const notes = ex.notes ? ` — note: "${ex.notes}"` : '';
                summary += `  • ${ex.name}${equip}: ${sets || '(no sets)'}${notes}\n`;
            }
        }
    }

    // Equipment by gym — staples and never-used gear both survive the cap.
    if (equipment?.length > 0) {
        summary += `\nAvailable equipment (${equipment.length} pieces; [unused] = never in a logged workout — good variety material; full inventory via list_equipment):\n`;
        const byLocation = {};
        for (const eq of equipment) {
            const locs = (eq.locations && eq.locations.length > 0) ? eq.locations : ['Unspecified'];
            const label = `${eq.name}${eq.equipmentType ? ` (${eq.equipmentType})` : ''}${eq.lastUsed ? '' : ' [unused]'}`;
            for (const l of locs) {
                if (!byLocation[l]) byLocation[l] = { used: [], unused: [] };
                byLocation[l][eq.lastUsed ? 'used' : 'unused'].push(label);
            }
        }
        const CAP = 60;
        for (const [l, g] of Object.entries(byLocation)) {
            const total = g.used.length + g.unused.length;
            const unusedTake = Math.min(g.unused.length, Math.max(CAP - g.used.length, Math.floor(CAP / 2)));
            const items = [...g.used.slice(0, CAP - unusedTake), ...g.unused.slice(0, unusedTake)];
            summary += `  @ ${l}: ${items.join(', ')}${total > items.length ? `, …+${total - items.length} more (list_equipment has all)` : ''}\n`;
        }
    }

    if (healthSummary) summary += healthSummary;
    return summary;
}

/**
 * The whole first-turn context block, in priority order: what day it is and
 * what this week IS sit at the top, then the rules' verdicts, then evidence
 * (AP-16 — the DELOAD line used to sit below thirty workouts).
 * @returns {{context: string, sections: Object<string,string>}}
 */
export function buildChatContext({
    today, workouts = [], templates = [], weekPlan = null, program = null, intent = null,
    currentLocation = null, settings = {}, unit = 'lbs', exerciseDatabase = [], thresholds = RULE_THRESHOLDS,
    manualDeload = null, prList = [], equipment = [], healthSummary = '',
    outcomesBlock = '', threadsBlock = '', feedbackBlock = '',
} = {}) {
    const programBlock = program ? buildProgramContext(program, today) : '';
    const todayLine = buildTodayContext({ today, weekPlan, templates, workouts, program, intent, currentLocation });
    const intentBlock = programBlock.includes('DELOAD WEEK') ? '' : buildSessionIntentContext(intent);

    let verdictsBlock = '';
    try {
        verdictsBlock = formatVerdictsContext(computeVerdicts({
            workouts, templates, weekPlan, program, manualDeload, intent, unit,
            plates: unit === 'kg' ? settings?.plateKg : settings?.plateLbs,
            today, exerciseDatabase, thresholds,
        }));
    } catch { /* verdicts are best-effort; the rest of the block still helps */ }

    const sections = {
        today: todayLine,
        program: programBlock,
        intent: intentBlock,
        verdicts: verdictsBlock,
        training: buildTrainingContext({
            workouts, settings, unit, exerciseDatabase, today, templates, weekPlan,
            equipment, prList, healthSummary, thresholds,
        }),
        outcomes: outcomesBlock,
        threads: threadsBlock,
        feedback: feedbackBlock,
    };
    const context = Object.values(sections).filter(Boolean)
        .map((block, i) => (i === 0 ? block : `\n${block}`)).join('');
    return { context, sections };
}
