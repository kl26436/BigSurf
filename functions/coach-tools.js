/**
 * AI coach tools — definitions, pure validators, and Firestore executors.
 *
 * Split from index.js so the pure parts (input validation, template diffing)
 * are unit-testable from Vitest without firebase-admin. Executors take a
 * { db, userId } handle (dependency injection) and are always scoped to
 * users/{userId}/… — the model can never reach another user's data.
 */

// ── Tool definitions (Anthropic schema) ─────────────────────────────

const TOOL_DEFINITIONS = [
    {
        name: 'get_exercise_history',
        description: 'Full session history for ONE exercise: date, sets/reps/weights, equipment, notes. Use when discussing a specific lift in depth — the context summary only carries an 8-point max-weight trend.',
        input_schema: {
            type: 'object',
            properties: {
                exercise: { type: 'string', description: 'Exercise name as it appears in the training data' },
                limit: { type: 'number', description: 'Max sessions to return (default 8, cap 20)' },
            },
            required: ['exercise'],
        },
    },
    {
        name: 'list_templates',
        description: "The user's saved workout templates (id, name, category, exercises). Call before referencing or modifying a saved workout.",
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'get_prs',
        description: "The user's personal records store — best weight/reps/volume per exercise+equipment with dates.",
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'create_workout_template',
        description: 'Create a saved workout template in the app. Use this whenever the user asks you to build/make/plan a workout — never answer such requests with a text-only workout description. Weights should come from their history when known.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Short workout name by what it IS ("Pull day", "Legs — heavy") — NEVER a weekday' },
                category: { type: 'string', description: 'One of: Push, Pull, Legs, Core, Cardio, Arms, Shoulders, Other' },
                kind: { type: 'string', description: "'core' = recurring workout (default) · 'variation' = riff on an existing core workout (pass parentTemplateId) · 'oneOff' = single occasion (travel gym, test day — auto-archives after first use)" },
                parentTemplateId: { type: 'string', description: 'Required when kind=variation: the core template this varies' },
                exercises: {
                    type: 'array',
                    description: '5-8 exercises for a full workout (compound movements first); fewer only if the user asked for fewer',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            bodyPart: { type: 'string' },
                            equipmentType: { type: 'string' },
                            equipment: { type: 'string', description: "A machine from the user's equipment list when one fits" },
                            sets: { type: 'number' },
                            reps: { type: 'number' },
                            weight: { type: 'number', description: "Starting weight in the user's unit, from their history" },
                        },
                        required: ['name'],
                    },
                },
            },
            required: ['name', 'exercises'],
        },
    },
    {
        name: 'get_program',
        description: "The user's active multi-week program (goal, length, week targets, split) with the CURRENT week derived from its start date. Call before any programming/periodization discussion.",
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'create_program',
        description: 'Create a multi-week program (propose-only trust level: the program informs your advice and one-tap session cards — it never auto-writes workouts). ALSO sets the week plan to the split, so one consent covers both. Deactivates any prior program. Templates for the split must already exist (create them first).',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'e.g. "Strength block — 4 weeks"' },
                goal: { type: 'string', description: "'strength' | 'hypertrophy' | 'recomp' | 'general'" },
                weeks: { type: 'number', description: '1-16' },
                startDate: { type: 'string', description: 'YYYY-MM-DD, the Monday of week 1' },
                weekTargets: {
                    type: 'array',
                    description: 'One entry per week that differs from baseline',
                    items: {
                        type: 'object',
                        properties: {
                            week: { type: 'number' },
                            label: { type: 'string', description: 'e.g. "heavy", "deload"' },
                            weightPct: { type: 'number', description: 'vs baseline, e.g. -40 for deload' },
                            note: { type: 'string' },
                        },
                        required: ['week', 'label'],
                    },
                },
                split: {
                    type: 'object',
                    description: 'day → templateId | "rest" | null (same shape as set_week_plan)',
                },
            },
            required: ['name', 'goal', 'weeks', 'startDate', 'split'],
        },
    },
    {
        name: 'adjust_program',
        description: 'Adjust the active program: rename, change weeks/startDate/weekTargets, or reshape the split ("I can only train 3 days next week"). Split changes also update the week plan. Consent rule applies.',
        input_schema: {
            type: 'object',
            properties: {
                changes: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        weeks: { type: 'number' },
                        startDate: { type: 'string' },
                        weekTargets: { type: 'array', items: { type: 'object' } },
                        split: { type: 'object' },
                        trustLevel: { type: 'string', description: "'propose' (default — everything is a card) or 'auto_confirm' (the dashboard pre-builds each week's adjusted session; starting it is the confirmation). Switch ONLY on an explicit user request; always reversible." },
                    },
                },
            },
            required: ['changes'],
        },
    },
    {
        name: 'log_advice',
        description: 'Silently log a concrete, CHECKABLE recommendation you just gave (one call per recommendation) so future conversations can reference whether it worked. Not user-visible. Never log vague advice.',
        input_schema: {
            type: 'object',
            properties: {
                type: { type: 'string', description: "'weight_target' | 'deload' | 'volume_change' | 'exercise_swap' | 'technique'" },
                exercise: { type: 'string', description: 'Exercise it applies to, when specific' },
                detail: { type: 'string', description: 'One-line summary of the recommendation' },
                targetValue: { description: 'The checkable value: target weight (number) or swap-to exercise name (string)' },
            },
            required: ['type', 'detail'],
        },
    },
    {
        name: 'archive_template',
        description: "Archive a saved workout (non-destructive — hidden from the library's main list, the workout selector, and coach context; unarchivable in the app). Only when the user asks to clean up or approves a cleanup suggestion — never spontaneously.",
        input_schema: {
            type: 'object',
            properties: { templateId: { type: 'string' } },
            required: ['templateId'],
        },
    },
    {
        name: 'propose_session_adjustments',
        description: "Adjust an existing workout FOR ONE SESSION ONLY — deloads, make-up volume, time-crunched versions. Renders a card that starts the workout with the adjustments applied; the template itself is NEVER modified and no new template is created. This is the REQUIRED tool for deloads and one-off intensity changes.",
        input_schema: {
            type: 'object',
            properties: {
                templateId: { type: 'string' },
                label: { type: 'string', description: 'Short session label, e.g. "Deload", "Make-up legs"' },
                weightPct: { type: 'number', description: 'Global weight change in percent, e.g. -40 for a deload' },
                addExercises: { type: 'array', items: { type: 'object' }, description: 'Exercises added for this session only' },
                dropExercises: { type: 'array', items: { type: 'string' }, description: 'Exercise names skipped this session' },
                why: { type: 'string' },
            },
            required: ['templateId', 'label'],
        },
    },
    {
        name: 'get_week_plan',
        description: "The user's weekly schedule: which saved workout is planned for each day, plus rest days. Call before discussing scheduling or 'what should I do today/this week'.",
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'set_week_plan',
        description: 'Set or update the weekly schedule (partial updates fine — only days you pass change). Values: a templateId from list_templates, "rest", or null to clear. Requires explicit user consent like every write.',
        input_schema: {
            type: 'object',
            properties: {
                days: {
                    type: 'object',
                    description: 'e.g. {"mon":"push_day","tue":"rest","wed":null}',
                    properties: {
                        mon: { type: ['string', 'null'] }, tue: { type: ['string', 'null'] },
                        wed: { type: ['string', 'null'] }, thu: { type: ['string', 'null'] },
                        fri: { type: ['string', 'null'] }, sat: { type: ['string', 'null'] },
                        sun: { type: ['string', 'null'] },
                    },
                },
            },
            required: ['days'],
        },
    },
    {
        name: 'remember_fact',
        description: 'Store one short durable fact about the user (injury, goal, schedule, equipment quirk, preference) in coach memory. Never store measurements the app already tracks (weights, body weight, PRs).',
        input_schema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'One short sentence, e.g. "Left knee is sketchy on deep squats"' },
            },
            required: ['text'],
        },
    },
    {
        name: 'forget_fact',
        description: 'Delete one fact from coach memory by its id (ids are shown alongside remembered facts in your system prompt).',
        input_schema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
        },
    },
    {
        name: 'update_workout_template',
        description: 'Modify an existing saved workout template: rename, add/remove exercises, REORDER exercises, or change sets/reps/weight on an exercise. ALWAYS use this (not create_workout_template) when the user refers to a workout they already have. Call list_templates first if you do not know the templateId.',
        input_schema: {
            type: 'object',
            properties: {
                templateId: { type: 'string' },
                changes: {
                    type: 'object',
                    properties: {
                        rename: { type: 'string' },
                        addExercises: { type: 'array', items: { type: 'object' } },
                        removeExercises: { type: 'array', items: { type: 'string' }, description: 'Exercise names to remove' },
                        reorderExercises: { type: 'array', items: { type: 'string' }, description: 'The COMPLETE list of existing exercise names in the desired new order' },
                        setExercise: {
                            type: 'object',
                            description: 'Change sets/reps/weight on one exercise by name',
                            properties: {
                                name: { type: 'string' },
                                sets: { type: 'number' },
                                reps: { type: 'number' },
                                weight: { type: 'number' },
                            },
                            required: ['name'],
                        },
                    },
                },
            },
            required: ['templateId', 'changes'],
        },
    },
];

// ── Pure validation / transformation ────────────────────────────────

function intIn(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < min || n > max) return fallback;
    return n;
}

/**
 * Validate + normalize one exercise entry. Returns null when unusable.
 * Normalized shape matches what the client's template editor expects:
 * `machine` is the display name key used across templates.
 */
function normalizeExercise(ex) {
    if (!ex || typeof ex !== 'object') return null;
    const name = typeof ex.name === 'string' ? ex.name.trim() : '';
    if (!name || name.length > 80) return null;
    const out = {
        machine: name,
        sets: intIn(ex.sets, 1, 10, 3),
        reps: intIn(ex.reps, 1, 50, 10),
    };
    if (typeof ex.weight === 'number' && ex.weight >= 0 && ex.weight < 2000) out.weight = ex.weight;
    if (typeof ex.bodyPart === 'string' && ex.bodyPart.trim()) out.bodyPart = ex.bodyPart.trim();
    if (typeof ex.equipmentType === 'string' && ex.equipmentType.trim()) out.equipmentType = ex.equipmentType.trim();
    if (typeof ex.equipment === 'string' && ex.equipment.trim()) out.equipment = ex.equipment.trim();
    return out;
}

/**
 * Validate create_workout_template input.
 * @returns {{ok:true, normalized:{name,category,exercises}} | {ok:false, error:string}}
 */
function validateCreateTemplateInput(input) {
    if (!input || typeof input !== 'object') return { ok: false, error: 'Missing input' };
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return { ok: false, error: 'Template name is required' };
    if (name.length > 60) return { ok: false, error: 'Template name too long (max 60 chars)' };
    if (!Array.isArray(input.exercises) || input.exercises.length === 0) {
        return { ok: false, error: 'At least one exercise is required' };
    }
    if (input.exercises.length > 12) {
        return { ok: false, error: 'Too many exercises (max 12)' };
    }
    const exercises = input.exercises.map(normalizeExercise).filter(Boolean);
    if (exercises.length === 0) {
        return { ok: false, error: 'No valid exercises (each needs a name)' };
    }
    const category = typeof input.category === 'string' && input.category.trim()
        ? input.category.trim() : 'Other';
    return { ok: true, normalized: { name, category, exercises } };
}

/**
 * Apply update_workout_template changes to a template doc (pure — no I/O).
 * @returns {{ok:true, updated:object, diffSummary:string} | {ok:false, error:string}}
 */
function applyTemplateChanges(template, changes) {
    if (!template || typeof template !== 'object') return { ok: false, error: 'Template not found' };
    if (!changes || typeof changes !== 'object') return { ok: false, error: 'Missing changes' };

    const updated = { ...template, exercises: Array.isArray(template.exercises) ? template.exercises.map(e => ({ ...e })) : [] };
    const diffs = [];
    const exName = (e) => e.machine || e.name || '';

    if (typeof changes.rename === 'string' && changes.rename.trim()) {
        const next = changes.rename.trim().slice(0, 60);
        if (next !== updated.name) {
            diffs.push(`Renamed "${updated.name}" → "${next}"`);
            updated.name = next;
        }
    }

    if (Array.isArray(changes.removeExercises)) {
        for (const raw of changes.removeExercises) {
            const target = String(raw || '').trim().toLowerCase();
            if (!target) continue;
            const idx = updated.exercises.findIndex(e => exName(e).toLowerCase() === target);
            if (idx === -1) return { ok: false, error: `No exercise named "${raw}" in this workout` };
            diffs.push(`Removed ${exName(updated.exercises[idx])}`);
            updated.exercises.splice(idx, 1);
        }
    }

    if (Array.isArray(changes.addExercises)) {
        for (const raw of changes.addExercises) {
            const ex = normalizeExercise(raw);
            if (!ex) return { ok: false, error: 'Added exercise is missing a name' };
            if (updated.exercises.length >= 20) return { ok: false, error: 'Workout is full (max 20 exercises)' };
            updated.exercises.push(ex);
            diffs.push(`Added ${ex.machine} ${ex.sets}×${ex.reps}`);
        }
    }

    if (Array.isArray(changes.reorderExercises) && changes.reorderExercises.length > 0) {
        const want = changes.reorderExercises.map(n => String(n || '').trim().toLowerCase());
        if (want.length !== updated.exercises.length) {
            return { ok: false, error: `reorderExercises must list ALL ${updated.exercises.length} exercises (got ${want.length})` };
        }
        const byName = new Map(updated.exercises.map(e => [exName(e).toLowerCase(), e]));
        if (byName.size !== updated.exercises.length) {
            return { ok: false, error: 'Workout has duplicate exercise names — reorder not supported here' };
        }
        const reordered = [];
        for (const n of want) {
            const ex = byName.get(n);
            if (!ex) return { ok: false, error: `No exercise named "${n}" in this workout` };
            if (reordered.includes(ex)) return { ok: false, error: `"${n}" listed twice in reorderExercises` };
            reordered.push(ex);
        }
        const changed = reordered.some((e, i) => e !== updated.exercises[i]);
        if (changed) {
            updated.exercises = reordered;
            diffs.push(`Reordered: ${reordered.map(exName).join(' → ')}`);
        }
    }

    if (changes.setExercise && typeof changes.setExercise === 'object') {
        const target = String(changes.setExercise.name || '').trim().toLowerCase();
        const ex = updated.exercises.find(e => exName(e).toLowerCase() === target);
        if (!ex) return { ok: false, error: `No exercise named "${changes.setExercise.name}" in this workout` };
        const c = changes.setExercise;
        if (c.weight != null) {
            const w = Number(c.weight);
            if (isNaN(w) || w < 0 || w >= 2000) return { ok: false, error: 'Invalid weight' };
            diffs.push(`${exName(ex)} ${ex.weight ?? '—'} → ${w}`);
            ex.weight = w;
        }
        if (c.sets != null) {
            const s = intIn(c.sets, 1, 10, null);
            if (s == null) return { ok: false, error: 'Invalid sets (1-10)' };
            if (s !== ex.sets) { diffs.push(`${exName(ex)} sets ${ex.sets ?? '—'} → ${s}`); ex.sets = s; }
        }
        if (c.reps != null) {
            const r = intIn(c.reps, 1, 50, null);
            if (r == null) return { ok: false, error: 'Invalid reps (1-50)' };
            const cur = ex.defaultReps ?? ex.reps;
            if (r !== cur) { diffs.push(`${exName(ex)} reps ${cur ?? '—'} → ${r}`); ex.reps = r; if ('defaultReps' in ex) ex.defaultReps = r; }
        }
    }

    if (diffs.length === 0) return { ok: false, error: 'No supported changes provided (rename, addExercises, removeExercises, reorderExercises, setExercise)' };
    return { ok: true, updated, diffSummary: diffs.join('; ') };
}

/**
 * Validate create_program input (Phase 9, pure).
 * @returns {{ok:true, normalized:object} | {ok:false, error:string}}
 */
function validateProgramInput(input) {
    if (!input || typeof input !== 'object') return { ok: false, error: 'Missing input' };
    const name = clip(input.name, 60);
    if (!name) return { ok: false, error: 'name is required' };
    const goal = clip(input.goal, 20) || 'general';
    const weeks = intIn(input.weeks, 1, 16, null);
    if (weeks == null) return { ok: false, error: 'weeks must be 1-16' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate || '')) {
        return { ok: false, error: 'startDate must be YYYY-MM-DD' };
    }
    const weekTargets = [];
    for (const t of (Array.isArray(input.weekTargets) ? input.weekTargets : [])) {
        const week = intIn(t?.week, 1, weeks, null);
        const label = clip(t?.label, 20);
        if (week == null || !label) return { ok: false, error: 'each weekTarget needs week (within program) + label' };
        const entry = { week, label };
        if (typeof t.weightPct === 'number' && t.weightPct >= -90 && t.weightPct <= 100) entry.weightPct = Math.round(t.weightPct);
        if (t.note) entry.note = clip(t.note, 80);
        weekTargets.push(entry);
    }
    if (!input.split || typeof input.split !== 'object') return { ok: false, error: 'split is required' };
    return { ok: true, normalized: { name, goal, weeks, startDate: input.startDate, weekTargets, split: input.split } };
}

// ── Firestore executors (Admin SDK, scoped to users/{userId}) ───────

function makeToolExecutors({ db, userId, source = 'chat' }) {
    const userDoc = () => db.collection('users').doc(userId);

    return {
        async get_exercise_history(input) {
            const target = String(input?.exercise || '').trim().toLowerCase();
            if (!target) return { error: 'exercise is required' };
            const limit = intIn(input?.limit, 1, 20, 8);
            const snap = await userDoc().collection('workouts')
                .orderBy('date', 'desc').limit(80).get();
            const sessions = [];
            for (const doc of snap.docs) {
                if (sessions.length >= limit) break;
                const w = doc.data();
                if (!w.completedAt || w.cancelledAt || !w.exercises) continue;
                const names = w.exerciseNames || {};
                for (const key of Object.keys(w.exercises)) {
                    const name = names[key];
                    if (!name || name.toLowerCase() !== target) continue;
                    const ex = w.exercises[key];
                    sessions.push({
                        date: w.date,
                        workout: w.workoutType || '',
                        equipment: ex.equipment || null,
                        sets: (ex.sets || []).map(s => ({
                            reps: s.reps, weight: s.weight,
                            unit: s.originalUnit || 'lbs',
                            type: s.type || 'working',
                        })),
                        notes: ex.notes || null,
                    });
                    break;
                }
            }
            return { exercise: input.exercise, sessions, found: sessions.length };
        },

        async list_templates() {
            const snap = await userDoc().collection('workoutTemplates').get();
            // Archived templates are out of the coach's world (5.6.2).
            const templates = snap.docs.filter(d => !d.data().archived).slice(0, 20).map(d => {
                const t = d.data();
                return {
                    templateId: d.id,
                    name: t.name || d.id,
                    category: t.category || null,
                    kind: t.kind || 'core',
                    ...(t.parentTemplateId ? { parentTemplateId: t.parentTemplateId } : {}),
                    usageCount: t.usageCount || 0,
                    lastUsedDate: t.lastUsedDate || null,
                    exercises: (t.exercises || []).slice(0, 15).map(e => ({
                        name: e.machine || e.name,
                        sets: e.sets, reps: e.defaultReps || e.reps,
                        weight: e.weight ?? null,
                        equipment: e.equipment || null,
                    })),
                };
            });
            return { templates, count: templates.length };
        },

        async get_program() {
            const snap = await userDoc().collection('programs')
                .where('active', '==', true).limit(1).get();
            if (snap.empty) return { program: null, note: 'No active program.' };
            const program = snap.docs[0].data();
            // Derived, never stored (see docs/coach-program-design.md).
            const week = Math.floor(Math.round((new Date() - new Date(`${program.startDate}T12:00:00`)) / 86400000) / 7) + 1;
            return { program, currentWeek: week, finished: week > program.weeks || week < 1 };
        },

        async create_program(input) {
            const v = validateProgramInput(input);
            if (!v.ok) return { error: v.error };
            const { name, goal, weeks, startDate, weekTargets, split } = v.normalized;

            // Apply the split through the SAME validated path as set_week_plan —
            // one consent covers program + schedule.
            const planOut = await this.set_week_plan({ days: split });
            if (planOut.error) return { error: `split: ${planOut.error}` };

            // One active program at a time.
            const actives = await userDoc().collection('programs').where('active', '==', true).get();
            for (const d of actives.docs) {
                await d.ref.set({ active: false, state: 'superseded', lastUpdated: new Date().toISOString() }, { merge: true });
            }

            const id = `program_${Date.now()}`;
            const nowIso = new Date().toISOString();
            await userDoc().collection('programs').doc(id).set({
                id, name, goal, weeks, startDate, weekTargets,
                split: planOut.result.plan.days,
                active: true,
                trustLevel: 'propose',
                state: 'active',
                createdVia: 'coach',
                createdAt: nowIso,
                lastUpdated: nowIso,
            });
            return {
                result: { programId: id, name, weeks, weekPlan: planOut.result.summary },
                actionCard: {
                    kind: 'program_set',
                    name: `Program: ${name}`,
                    summary: `${weeks} weeks · ${goal} · ${planOut.result.summary}`,
                },
            };
        },

        async adjust_program(input) {
            const changes = input?.changes;
            if (!changes || typeof changes !== 'object') return { error: 'changes is required' };
            const snap = await userDoc().collection('programs').where('active', '==', true).limit(1).get();
            if (snap.empty) return { error: 'No active program — create one first.' };
            const ref = snap.docs[0].ref;
            const current = snap.docs[0].data();

            const updated = {};
            const diffs = [];
            if (changes.name && clip(changes.name, 60) !== current.name) {
                updated.name = clip(changes.name, 60);
                diffs.push(`renamed to "${updated.name}"`);
            }
            if (changes.weeks != null) {
                const w = intIn(changes.weeks, 1, 16, null);
                if (w == null) return { error: 'weeks must be 1-16' };
                updated.weeks = w;
                diffs.push(`${w} weeks`);
            }
            if (changes.startDate) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(changes.startDate)) return { error: 'startDate must be YYYY-MM-DD' };
                updated.startDate = changes.startDate;
                diffs.push(`starts ${changes.startDate}`);
            }
            if (Array.isArray(changes.weekTargets)) {
                const check = validateProgramInput({
                    name: current.name, goal: current.goal,
                    weeks: updated.weeks || current.weeks,
                    startDate: updated.startDate || current.startDate,
                    weekTargets: changes.weekTargets, split: current.split || {},
                });
                if (!check.ok) return { error: check.error };
                updated.weekTargets = check.normalized.weekTargets;
                diffs.push('week targets updated');
            }
            if (changes.split && typeof changes.split === 'object') {
                const planOut = await this.set_week_plan({ days: changes.split });
                if (planOut.error) return { error: `split: ${planOut.error}` };
                updated.split = planOut.result.plan.days;
                diffs.push(`schedule: ${planOut.result.summary}`);
            }
            if (changes.trustLevel != null) {
                if (!['propose', 'auto_confirm'].includes(changes.trustLevel)) {
                    return { error: "trustLevel must be 'propose' or 'auto_confirm'" };
                }
                if (changes.trustLevel !== (current.trustLevel || 'propose')) {
                    updated.trustLevel = changes.trustLevel;
                    diffs.push(changes.trustLevel === 'auto_confirm'
                        ? "auto mode ON — the dashboard pre-builds each week's session; starting it confirms"
                        : 'back to propose-only');
                }
            }
            if (!diffs.length) return { error: 'No supported changes (name, weeks, startDate, weekTargets, split)' };

            updated.lastUpdated = new Date().toISOString();
            await ref.set(updated, { merge: true });
            return {
                result: { programId: current.id, diff: diffs.join('; ') },
                actionCard: {
                    kind: 'program_set',
                    name: `Program: ${updated.name || current.name}`,
                    summary: diffs.join(' · '),
                },
            };
        },

        async log_advice(input) {
            const VALID_TYPES = ['weight_target', 'deload', 'volume_change', 'exercise_swap', 'technique'];
            const type = String(input?.type || '').trim();
            const detail = clip(input?.detail, 200);
            if (!VALID_TYPES.includes(type)) return { error: `type must be one of: ${VALID_TYPES.join(', ')}` };
            if (!detail) return { error: 'detail is required' };
            const doc = {
                date: new Date().toISOString().slice(0, 10),
                type,
                detail,
                source,
                createdAt: new Date().toISOString(),
            };
            if (typeof input?.exercise === 'string' && input.exercise.trim()) doc.exercise = clip(input.exercise, 80);
            if (typeof input?.targetValue === 'number' || (typeof input?.targetValue === 'string' && input.targetValue.trim())) {
                doc.targetValue = typeof input.targetValue === 'number' ? input.targetValue : clip(input.targetValue, 80);
            }
            await userDoc().collection('coachAdvice').add(doc);
            return { result: { logged: true } };
        },

        async archive_template(input) {
            const templateId = String(input?.templateId || '').trim();
            if (!templateId) return { error: 'templateId is required' };
            const ref = userDoc().collection('workoutTemplates').doc(templateId);
            const snap = await ref.get();
            if (!snap.exists) return { error: `Template not found: ${templateId}` };
            await ref.set({ archived: true, lastUpdated: new Date().toISOString() }, { merge: true });
            return {
                result: { archived: templateId },
                actionCard: {
                    kind: 'template_updated',
                    templateId,
                    name: snap.data().name || templateId,
                    category: snap.data().category || null,
                    exerciseCount: (snap.data().exercises || []).length,
                    diffSummary: 'Archived — restore anytime from the library',
                },
            };
        },

        async get_prs() {
            const snap = await userDoc().collection('stats').doc('personalRecords').get();
            const exercisePRs = snap.exists ? (snap.data().exercisePRs || {}) : {};
            const entries = [];
            for (const [exercise, byEquip] of Object.entries(exercisePRs)) {
                for (const [key, prs] of Object.entries(byEquip)) {
                    if (key === 'bodyPart' || !prs || typeof prs !== 'object') continue;
                    entries.push({
                        exercise,
                        equipment: prs.equipmentName || (key.startsWith('equipment_') ? 'Unknown equipment' : key),
                        maxWeight: prs.maxWeight || null,
                        maxReps: prs.maxReps || null,
                        maxVolume: prs.maxVolume || null,
                    });
                }
            }
            entries.sort((a, b) => ((b.maxWeight?.date || '')).localeCompare(a.maxWeight?.date || ''));
            return { prs: entries.slice(0, 50), count: entries.length };
        },

        async create_workout_template(input) {
            const v = validateCreateTemplateInput(input);
            if (!v.ok) return { error: v.error };
            const { name, category, exercises } = v.normalized;

            // 5.6.0 — classify at birth. Variations must point at a real parent.
            const kind = ['core', 'variation', 'oneOff'].includes(input.kind) ? input.kind : 'core';
            let parentTemplateId = null;
            if (kind === 'variation') {
                const pid = String(input.parentTemplateId || '').trim();
                if (!pid) return { error: 'kind=variation requires parentTemplateId (from list_templates)' };
                const parent = await userDoc().collection('workoutTemplates').doc(pid).get();
                if (!parent.exists) return { error: `parentTemplateId not found: ${pid}` };
                parentTemplateId = pid;
            }

            // Same slug scheme the client uses, with collision suffixing so the
            // coach can't silently overwrite an existing workout.
            let base = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            let templateId = base;
            for (let i = 2; i <= 9; i++) {
                const existing = await userDoc().collection('workoutTemplates').doc(templateId).get();
                if (!existing.exists) break;
                templateId = `${base}_${i}`;
            }

            const nowIso = new Date().toISOString();
            await userDoc().collection('workoutTemplates').doc(templateId).set({
                id: templateId,
                name,
                category,
                exercises,
                kind,
                ...(parentTemplateId ? { parentTemplateId } : {}),
                lastUpdated: nowIso,
                createdBy: userId,
                isCustom: true,
                isDefault: false,
                createdVia: 'coach',
            });
            return {
                result: { templateId, name, exerciseCount: exercises.length },
                actionCard: {
                    kind: 'template_created',
                    templateId, name, category,
                    exerciseCount: exercises.length,
                },
            };
        },

        async get_week_plan() {
            const snap = await userDoc().collection('preferences').doc('weekPlan').get();
            if (!snap.exists) return { plan: null, note: 'No week plan set yet.' };
            const { days = {}, restDays = [] } = snap.data();
            return { days, restDays };
        },

        async set_week_plan(input) {
            const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
            const incoming = input?.days;
            if (!incoming || typeof incoming !== 'object') return { error: 'days is required' };

            const ref = userDoc().collection('preferences').doc('weekPlan');
            const snap = await ref.get();
            const current = snap.exists ? snap.data() : { days: {}, restDays: [] };
            const days = { ...current.days };
            const restDays = new Set(current.restDays || []);

            // Validate template ids against the real library.
            const tSnap = await userDoc().collection('workoutTemplates').get();
            const templateNames = new Map(tSnap.docs.map(d => [d.id, d.data().name || d.id]));

            for (const [day, val] of Object.entries(incoming)) {
                if (!DAYS.includes(day)) return { error: `Invalid day key: ${day} (use mon…sun)` };
                if (val === 'rest') { days[day] = null; restDays.add(day); }
                else if (val == null || val === '') { days[day] = null; restDays.delete(day); }
                else {
                    if (!templateNames.has(val)) return { error: `Unknown templateId "${val}" for ${day} — call list_templates for valid ids.` };
                    days[day] = val;
                    restDays.delete(day);
                }
            }
            for (const d of DAYS) if (!(d in days)) days[d] = null;

            const plan = { days, restDays: [...restDays], updatedAt: new Date().toISOString() };
            await ref.set(plan);

            const summary = DAYS
                .filter(d => days[d])
                .map(d => `${d[0].toUpperCase()}${d.slice(1)} ${templateNames.get(days[d])}`)
                .join(' · ') + ([...restDays].length ? ` · rest ${[...restDays].join('/')}` : '');
            return {
                result: { plan, summary },
                actionCard: { kind: 'week_plan_set', name: 'Week plan updated', summary: summary || 'All days open' },
            };
        },

        async remember_fact(input) {
            const text = String(input?.text || '').trim().slice(0, 200);
            if (!text) return { error: 'text is required' };
            const ref = userDoc().collection('preferences').doc('coachMemory');
            const snap = await ref.get();
            const facts = snap.exists ? (snap.data().facts || []) : [];
            if (facts.length >= 40) {
                return { error: 'Memory is full (40 facts) — forget something first or ask the user to prune it in Settings.' };
            }
            const fact = {
                id: `fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                text,
                createdAt: new Date().toISOString(),
                source: 'chat',
            };
            await ref.set({ facts: [...facts, fact] }, { merge: true });
            return { result: { remembered: text, id: fact.id } };
        },

        async forget_fact(input) {
            const id = String(input?.id || '').trim();
            if (!id) return { error: 'id is required' };
            const ref = userDoc().collection('preferences').doc('coachMemory');
            const snap = await ref.get();
            const facts = snap.exists ? (snap.data().facts || []) : [];
            const next = facts.filter(f => f.id !== id);
            if (next.length === facts.length) return { error: `No fact with id ${id}` };
            await ref.set({ facts: next }, { merge: true });
            return { result: { forgotten: id } };
        },

        async update_workout_template(input) {
            const templateId = String(input?.templateId || '').trim();
            if (!templateId) return { error: 'templateId is required' };
            const ref = userDoc().collection('workoutTemplates').doc(templateId);
            const snap = await ref.get();
            if (!snap.exists) return { error: `Template not found: ${templateId}. Call list_templates for valid ids.` };

            const applied = applyTemplateChanges(snap.data(), input.changes);
            if (!applied.ok) return { error: applied.error };

            applied.updated.lastUpdated = new Date().toISOString();
            await ref.set(applied.updated);
            return {
                result: { templateId, diff: applied.diffSummary },
                actionCard: {
                    kind: 'template_updated',
                    templateId,
                    name: applied.updated.name,
                    category: applied.updated.category || null,
                    exerciseCount: (applied.updated.exercises || []).length,
                    diffSummary: applied.diffSummary,
                },
            };
        },
    };
}

// ── Live-mode proposal tools (Phase 6) ──────────────────────────────
// The active workout is CLIENT-owned state (auto-saved, debounced) — a server
// write would race it and lose data. So live write-tools produce PROPOSALS:
// validated, echoed to the stream, applied client-side only on a user tap.

const LIVE_PROPOSAL_TOOLS = [
    {
        name: 'propose_next_target',
        description: "Propose weight/reps for the user's next set of an exercise. Renders as a card with an Apply button — never applies itself.",
        input_schema: {
            type: 'object',
            properties: {
                exercise: { type: 'string' },
                weight: { type: 'number', description: "In the user's display unit" },
                reps: { type: 'number' },
                why: { type: 'string', description: 'One short clause, e.g. "last set was a clean 8 at 145"' },
            },
            required: ['exercise'],
        },
    },
    {
        name: 'propose_swap',
        description: 'Propose swapping an exercise for another (machine taken, pain, equipment missing). MUST pick equipment that exists at the current gym (it is in the live context).',
        input_schema: {
            type: 'object',
            properties: {
                fromExercise: { type: 'string' },
                toExercise: { type: 'string' },
                equipment: { type: 'string', description: 'Equipment name from the current gym list' },
                why: { type: 'string' },
            },
            required: ['fromExercise', 'toExercise'],
        },
    },
    {
        name: 'propose_add_exercise',
        description: 'Propose adding one exercise to the current session.',
        input_schema: {
            type: 'object',
            properties: {
                exercise: { type: 'string' },
                sets: { type: 'number' },
                reps: { type: 'number' },
                weight: { type: 'number' },
                why: { type: 'string' },
            },
            required: ['exercise'],
        },
    },
    {
        name: 'propose_rest',
        description: 'Propose a different rest duration before the next set (e.g. longer before a heavy top set).',
        input_schema: {
            type: 'object',
            properties: {
                seconds: { type: 'number' },
                why: { type: 'string' },
            },
            required: ['seconds'],
        },
    },
];

const clip = (s, n) => String(s || '').trim().slice(0, n);

/**
 * Validate a live proposal's input. Pure. Returns
 * {ok:true, proposal:{kind,…}} or {ok:false, error}.
 */
function validateProposal(toolName, input) {
    const why = clip(input?.why, 140);
    switch (toolName) {
        case 'propose_next_target': {
            const exercise = clip(input?.exercise, 80);
            if (!exercise) return { ok: false, error: 'exercise is required' };
            const weight = typeof input?.weight === 'number' && input.weight >= 0 && input.weight < 2000 ? input.weight : null;
            const reps = intIn(input?.reps, 1, 50, null);
            if (weight == null && reps == null) return { ok: false, error: 'weight or reps required' };
            return { ok: true, proposal: { kind: 'next_target', exercise, weight, reps, why } };
        }
        case 'propose_swap': {
            const fromExercise = clip(input?.fromExercise, 80);
            const toExercise = clip(input?.toExercise, 80);
            if (!fromExercise || !toExercise) return { ok: false, error: 'fromExercise and toExercise are required' };
            return { ok: true, proposal: { kind: 'swap', fromExercise, toExercise, equipment: clip(input?.equipment, 80) || null, why } };
        }
        case 'propose_add_exercise': {
            const exercise = clip(input?.exercise, 80);
            if (!exercise) return { ok: false, error: 'exercise is required' };
            const weight = typeof input?.weight === 'number' && input.weight >= 0 && input.weight < 2000 ? input.weight : null;
            return {
                ok: true,
                proposal: {
                    kind: 'add_exercise', exercise,
                    sets: intIn(input?.sets, 1, 10, 3),
                    reps: intIn(input?.reps, 1, 50, 10),
                    weight, why,
                },
            };
        }
        case 'propose_rest': {
            const seconds = intIn(input?.seconds, 15, 600, null);
            if (seconds == null) return { ok: false, error: 'seconds must be 15-600' };
            return { ok: true, proposal: { kind: 'rest', seconds, why } };
        }
        case 'propose_session_adjustments': {
            // Coach-tab proposal (5.6.1): one-session riff on an existing
            // template. Template existence is checked client-side at Apply
            // (the client owns the library cache) — validation here is shape.
            const templateId = clip(input?.templateId, 80);
            const label = clip(input?.label, 40);
            if (!templateId || !label) return { ok: false, error: 'templateId and label are required' };
            const weightPct = typeof input?.weightPct === 'number' && input.weightPct >= -90 && input.weightPct <= 100
                ? Math.round(input.weightPct) : null;
            const addExercises = Array.isArray(input?.addExercises)
                ? input.addExercises.map(normalizeExercise).filter(Boolean).slice(0, 5) : [];
            const dropExercises = Array.isArray(input?.dropExercises)
                ? input.dropExercises.map(x => clip(x, 80)).filter(Boolean).slice(0, 10) : [];
            if (weightPct == null && !addExercises.length && !dropExercises.length) {
                return { ok: false, error: 'Provide weightPct, addExercises, or dropExercises' };
            }
            return { ok: true, proposal: { kind: 'session_adjustments', templateId, label, weightPct, addExercises, dropExercises, why } };
        }
        default:
            return { ok: false, error: `Unknown proposal tool: ${toolName}` };
    }
}

// Tool set for live mode: fast reads + proposals (+ silent advice logging).
// NO template writes and no memory writes — those belong to the coach tab.
const LIVE_TOOL_NAMES = ['get_exercise_history', 'get_prs', 'log_advice'];
function liveToolDefinitions() {
    return [
        ...TOOL_DEFINITIONS.filter(t => LIVE_TOOL_NAMES.includes(t.name)),
        ...LIVE_PROPOSAL_TOOLS,
    ];
}

// Human-readable status line shown in chat while each tool runs.
const TOOL_STATUS = {
    get_exercise_history: 'Reading your history…',
    list_templates: 'Checking your workouts…',
    get_prs: 'Checking your records…',
    create_workout_template: 'Creating your workout…',
    update_workout_template: 'Updating your workout…',
    remember_fact: 'Noting that…',
    forget_fact: 'Forgetting that…',
    get_week_plan: 'Checking your week…',
    set_week_plan: 'Updating your week…',
    archive_template: 'Archiving…',
    propose_session_adjustments: 'Building your session…',
    get_program: 'Checking your program…',
    create_program: 'Building your program…',
    adjust_program: 'Adjusting your program…',
};

module.exports = {
    TOOL_DEFINITIONS,
    TOOL_STATUS,
    validateCreateTemplateInput,
    applyTemplateChanges,
    normalizeExercise,
    makeToolExecutors,
    validateProposal,
    liveToolDefinitions,
    LIVE_PROPOSAL_TOOLS,
    validateProgramInput,
};
