// GENERATED MIRROR of js/core/features/block-view.js — do not edit here.
// Edit the client module, then run: node scripts/sync-mirror.mjs js/core/features/block-view.js <this file>

// Block view model (AP-24) — the whole program as data: week × training day,
// past cells with what was logged against the target, future cells with the
// targets the rules will seed, the planning rationale, and any week override.
//
// Pure — the Block page renders it; nothing here touches AppState or the DOM.
// Targets come from progressionTarget() with the intent for THAT week, the
// same call the active-workout seeder makes, so the page and the set rows
// can't disagree.

const { getSessionIntent, isManualDeloadActive, manualDeloadEnd } = require('./session-intent');
const { buildExerciseSessions, progressionTarget, weightIncrement } = require('./progression');
const { deriveProgramWeek, describeWeekTarget, isDeloadTarget } = require('./week-targets');
const { weekKindLabel } = require('./plain-language');
const { inferRole } = require('./movement-patterns');
const { convertToUnit } = require('./coach-outcomes');

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const norm = (s) => String(s || '').trim().toLowerCase();

function addDays(dateStr, n) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayIndex(dateStr) {
    return (new Date(`${dateStr}T12:00:00`).getDay() + 6) % 7; // mon = 0
}

/** The lift a workout's progress is measured on: explicit primary, else the first inferred one. */
function primaryOf(template) {
    const list = Array.isArray(template?.exercises) ? template.exercises : [];
    const explicit = list.find(e => e?.role === 'primary');
    if (explicit) return explicit;
    return list.find((e, i) => inferRole(e, i) === 'primary') || list[0] || null;
}

const nameOf = (ex) => ex?.machine || ex?.name || null;

/** Heaviest completed working set of `exName` in one workout, in `unit`. */
function topSetIn(workout, exName, unit) {
    const key = norm(exName);
    for (const [k, ex] of Object.entries(workout?.exercises || {})) {
        const n = workout.exerciseNames?.[k] || ex?.name || ex?.machine;
        if (norm(n) !== key) continue;
        let best = null;
        for (const s of ex.sets || []) {
            if (!s || s.completed === false || (s.type || 'working') === 'warmup' || !(s.weight > 0)) continue;
            // The plate number on base-weight gear — what the target talks in.
            const raw = typeof s._plateWeight === 'number' && s._equipBaseWeight > 0 ? s._plateWeight : s.weight;
            const w = convertToUnit(raw, s.originalUnit || 'lbs', unit);
            if (!best || w > best.weight || (w === best.weight && (s.reps || 0) > best.reps)) best = { weight: w, reps: s.reps || 0 };
        }
        return best;
    }
    return null;
}

/** The target for `ex` on `date`, from history strictly before `date`. */
function targetFor({ ex, date, workouts, program, override, unit, inc }) {
    const name = nameOf(ex);
    if (!name) return null;
    const before = (workouts || []).filter(w => w?.date && w.date < date);
    const machine = ex.equipment || ex.equipmentId ? { name: ex.equipment, id: ex.equipmentId } : null;
    const spelling = spellingIn(before, name) || name;
    let sessions = buildExerciseSessions(before, spelling, unit, { machine });
    if (machine && !sessions.length) sessions = buildExerciseSessions(before, spelling, unit); // AU-12 fallback
    const intent = getSessionIntent({ program, today: date, manualDeload: override });
    // AU-11 — the cell's date: a lift untouched for 6+ weeks restarts there.
    const t = progressionTarget(sessions, unit, Number(ex.defaultReps || ex.reps) || null, inc, intent, date);
    return t ? { weight: t.weight, reps: t.reps, action: t.action } : null;
}

function spellingIn(workouts, name) {
    const key = norm(name);
    for (const w of workouts || []) {
        for (const [k, ex] of Object.entries(w.exercises || {})) {
            const n = w.exerciseNames?.[k] || ex?.name || ex?.machine;
            if (n && norm(n) === key) return n;
        }
    }
    return null;
}

/**
 * @param {object} args
 * @param {object|null} args.program - active program doc
 * @param {Array} args.templates - workout templates (split ids resolve here)
 * @param {Array} args.workouts - completed history, any order
 * @param {string} args.today - YYYY-MM-DD
 * @param {'lbs'|'kg'} [args.unit]
 * @param {number[]} [args.plates]
 * @param {object|null} [args.override] - settings week override (weekOverrideOf)
 * @param {object|null} [args.scoreboard] - buildScoreboard() output, for the header line
 * @returns {object|null} null without a program
 */
function buildBlockModel({
    program, templates = [], workouts = [], today, unit = 'lbs', plates = null, override = null, scoreboard = null,
} = {}) {
    if (!program?.startDate || !today) return null;
    const u = unit === 'kg' ? 'kg' : 'lbs';
    const inc = weightIncrement(u, plates);
    const weeks = Math.max(1, Number(program.weeks) || 1);
    const start = program.startDate;
    const endDate = addDays(start, weeks * 7 - 1);
    const { week: rawWeek } = deriveProgramWeek(program, today);
    const finished = today > endDate;
    const currentWeek = finished ? weeks : Math.min(weeks, Math.max(1, rawWeek));
    const byId = new Map((templates || []).map(t => [t.id, t]));
    const done = (workouts || []).filter(w => w?.date && w.completedAt && !w.cancelledAt);

    const split = program.split || {};
    const splitDays = DAY_KEYS
        .filter(d => split[d] && split[d] !== 'rest')
        .map(d => ({ day: d, label: DAY_LABELS[d], templateId: split[d], name: byId.get(split[d])?.name || split[d] }));
    const startIdx = dayIndex(start);

    const weekRows = [];
    for (let w = 1; w <= weeks; w++) {
        const wStart = addDays(start, (w - 1) * 7);
        const wEnd = addDays(wStart, 6);
        const target = (program.weekTargets || []).find(t => t.week === w) || null;
        const inWeek = done.filter(x => x.date >= wStart && x.date <= wEnd)
            .sort((a, b) => a.date.localeCompare(b.date));
        const used = new Set();
        const cells = splitDays.map((sd) => {
            const date = addDays(wStart, (DAY_KEYS.indexOf(sd.day) - startIdx + 7) % 7);
            const tpl = byId.get(sd.templateId);
            // The planned workout counts wherever in the week it was done —
            // the week plan reflows missed days; the grid follows the work.
            const match = inWeek.find(x => !used.has(x) && x.date === date && norm(x.workoutType) === norm(sd.name))
                || inWeek.find(x => !used.has(x) && (norm(x.workoutType) === norm(sd.name) || x.basedOn === sd.templateId));
            if (match) used.add(match);
            let status = 'upcoming';
            if (match) status = 'done';
            else if (date < today) status = 'missed';
            else if (date === today) status = 'today';
            const pEx = primaryOf(tpl);
            let primary = null;
            if (pEx && nameOf(pEx)) {
                const tgt = targetFor({ ex: pEx, date: match ? match.date : date, workouts: done, program, override, unit: u, inc });
                const logged = match ? topSetIn(match, nameOf(pEx), u) : null;
                let result = null;
                if (logged && tgt) {
                    result = logged.weight + 0.01 >= tgt.weight && (!tgt.reps || logged.reps >= tgt.reps) ? 'hit' : 'below';
                }
                primary = { name: nameOf(pEx), target: tgt, logged, result };
            }
            return {
                day: sd.day, dayLabel: sd.label, date, templateId: sd.templateId, name: sd.name,
                status, workoutId: match?.id || null, doneOn: match?.date || null, primary,
            };
        });
        const ovActive = override && [0, 1, 2, 3, 4, 5, 6].some(i => isManualDeloadActive(override, addDays(wStart, i)));
        weekRows.push({
            week: w,
            label: weekKindLabel(target),
            levers: target ? describeWeekTarget(target) : '',
            isDeload: !!(target && isDeloadTarget(target)),
            start: wStart,
            end: wEnd,
            current: !finished && w === currentWeek,
            past: wEnd < today,
            override: ovActive ? {
                label: override.label || 'Adjusted week',
                levers: describeWeekTarget({ weightPct: override.weightPct, setDelta: override.setDelta }),
                through: manualDeloadEnd(override),
                reason: override.reason || null,
            } : null,
            cells,
        });
    }

    const blockDone = done.filter(x => x.date >= start && x.date <= (finished ? endDate : today));
    const cur = weekRows[currentWeek - 1];
    return {
        header: {
            name: program.name || 'Program',
            goal: program.goal || null,
            week: currentWeek,
            weeks,
            weekLabel: weekKindLabel(cur),
            finished,
            startDate: start,
            endDate,
            headline: scoreboard?.headline || null,
            daysTrained: new Set(blockDone.map(x => x.date)).size,
            daysPlanned: splitDays.length * (finished ? weeks : currentWeek),
        },
        rationale: program.rationale || null,
        splitDays,
        weeks: weekRows,
        // "Plan next block" belongs on the deload week and after the end.
        planNextVisible: finished || !!cur?.isDeload || currentWeek === weeks,
    };
}

/**
 * One cell's session in full: every exercise of the workout with that
 * week's target, and — for a done cell — what was logged.
 */
function buildBlockSession({ cell, template, workouts = [], program, override = null, unit = 'lbs', plates = null }) {
    const u = unit === 'kg' ? 'kg' : 'lbs';
    const inc = weightIncrement(u, plates);
    const done = (workouts || []).filter(w => w?.date && w.completedAt && !w.cancelledAt);
    const logged = cell?.workoutId ? done.find(w => w.id === cell.workoutId) : null;
    const date = cell?.doneOn || cell?.date;
    const primaryName = norm(primaryOf(template) ? nameOf(primaryOf(template)) : '');
    return (template?.exercises || []).map((ex) => {
        const name = nameOf(ex);
        return {
            name,
            primary: norm(name) === primaryName,
            sets: Number(ex.sets) || 3,
            target: targetFor({ ex, date, workouts: done, program, override, unit: u, inc }),
            logged: logged ? topSetIn(logged, name, u) : null,
        };
    }).filter(r => r.name);
}

module.exports = { addDays, primaryOf, targetFor, buildBlockModel, buildBlockSession };
