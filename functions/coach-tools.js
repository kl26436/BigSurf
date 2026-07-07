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
                name: { type: 'string', description: 'Short workout name, e.g. "Pull day — Crunch"' },
                category: { type: 'string', description: 'One of: Push, Pull, Legs, Core, Cardio, Arms, Shoulders, Other' },
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
        name: 'update_workout_template',
        description: 'Modify an existing saved workout template: rename, add/remove exercises, or change sets/reps/weight on an exercise. Call list_templates first if you do not know the templateId.',
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

    if (diffs.length === 0) return { ok: false, error: 'No supported changes provided (rename, addExercises, removeExercises, setExercise)' };
    return { ok: true, updated, diffSummary: diffs.join('; ') };
}

// ── Firestore executors (Admin SDK, scoped to users/{userId}) ───────

function makeToolExecutors({ db, userId }) {
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
            const templates = snap.docs.slice(0, 20).map(d => {
                const t = d.data();
                return {
                    templateId: d.id,
                    name: t.name || d.id,
                    category: t.category || null,
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

// Human-readable status line shown in chat while each tool runs.
const TOOL_STATUS = {
    get_exercise_history: 'Reading your history…',
    list_templates: 'Checking your workouts…',
    get_prs: 'Checking your records…',
    create_workout_template: 'Creating your workout…',
    update_workout_template: 'Updating your workout…',
};

module.exports = {
    TOOL_DEFINITIONS,
    TOOL_STATUS,
    validateCreateTemplateInput,
    applyTemplateChanges,
    normalizeExercise,
    makeToolExecutors,
};
