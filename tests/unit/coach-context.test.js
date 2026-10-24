// Coach context builders — pure blocks that feed the AI coach's prompt.

import { describe, it, expect } from 'vitest';
import {
    buildProfileContext,
    buildPRContext,
    buildTemplatesContext,
    setTypeMarker,
    templatesChangedNote,
    deriveProgramWeek,
    buildProgramContext,
    buildSessionIntentContext,
    buildTodayContext,
    contextRefreshReason,
    contextTurn,
    visibleQuestion,
    CONTEXT_STALE_MS,
    firstSentence,
    buildRecentThreadsContext,
} from '../../js/core/features/coach-context.js';
import { deriveProgramWeek as deriveFromWeekTargets } from '../../js/core/features/week-targets.js';

describe('buildProfileContext', () => {
    it('includes goal, experience, injuries, notes, height, weekly goal', () => {
        const ctx = buildProfileContext({
            coachGoal: 'recomp',
            profileExperience: 'intermediate',
            coachInjuries: 'bad left shoulder',
            coachNotes: 'can only train 45 min at lunch',
            profileHeightCm: 180,
            weeklyGoal: 4,
        });
        expect(ctx).toContain('User profile:');
        expect(ctx).toContain('recomposition');
        expect(ctx).toContain('intermediate');
        expect(ctx).toContain('bad left shoulder');
        expect(ctx).toContain('45 min at lunch');
        expect(ctx).toContain('180 cm');
        expect(ctx).toContain('4 days');
    });

    it('empty settings → empty string (no noise block)', () => {
        expect(buildProfileContext({})).toBe('');
        expect(buildProfileContext()).toBe('');
    });

    it('unknown goal value is skipped, not echoed raw', () => {
        expect(buildProfileContext({ coachGoal: 'xyz' })).toBe('');
    });
});

describe('buildPRContext', () => {
    const pr = (exercise, equipment, weight, reps, date) => ({
        exercise, equipment, prs: { maxWeight: { weight, reps, date, unit: 'lbs' } },
    });

    it('renders exercise, equipment, weight×reps, date — most recent first, capped', () => {
        const list = [
            pr('Bench Press', 'Hammer Strength', 225, 5, '2026-06-01'),
            pr('Squat', 'Barbell', 315, 3, '2026-07-01'),
        ];
        const ctx = buildPRContext(list, { limit: 15 });
        expect(ctx.indexOf('Squat')).toBeLessThan(ctx.indexOf('Bench Press'));
        expect(ctx).toContain('Bench Press (Hammer Strength): 225×5 lbs on 2026-06-01');
    });

    it('caps at limit and skips entries with no maxWeight', () => {
        const list = [
            pr('A', null, 100, 5, '2026-01-03'),
            pr('B', null, 100, 5, '2026-01-02'),
            { exercise: 'C', equipment: null, prs: {} },
        ];
        const ctx = buildPRContext(list, { limit: 1 });
        expect(ctx).toContain('A');
        expect(ctx).not.toContain('B');
        expect(ctx).not.toContain('C');
    });

    it('hides the "Unknown Equipment" placeholder', () => {
        const ctx = buildPRContext([pr('Row', 'Unknown Equipment', 100, 8, '2026-01-01')]);
        expect(ctx).toContain('Row: 100×8');
        expect(ctx).not.toContain('Unknown Equipment');
    });

    it('empty → empty string', () => {
        expect(buildPRContext([])).toBe('');
    });
});

describe('buildTemplatesContext', () => {
    it('lists name, category, exercises with sets×reps, capped', () => {
        const plans = [{
            name: 'Push Day', category: 'Push',
            exercises: [
                { machine: 'Bench Press', sets: 4, defaultReps: 8 },
                { name: 'OHP', sets: 3, reps: 10 },
            ],
        }];
        const ctx = buildTemplatesContext(plans);
        expect(ctx).toContain('Push Day [Push]: Bench Press 4×8, OHP 3×10');
    });

    it('truncates long exercise lists with +N more and caps template count', () => {
        const manyEx = Array.from({ length: 15 }, (_, i) => ({ name: `Ex${i}`, sets: 3, reps: 10 }));
        const plans = Array.from({ length: 12 }, (_, i) => ({ name: `T${i}`, exercises: manyEx }));
        const ctx = buildTemplatesContext(plans, { capTemplates: 10, capExercises: 12 });
        expect(ctx).toContain('+3 more');
        expect(ctx).toContain('T9');
        expect(ctx).not.toContain('T10');
    });

    it('empty → empty string', () => {
        expect(buildTemplatesContext([])).toBe('');
    });

    // CP-6 — the cap used to bite in array order, silently hiding whichever
    // templates happened to be last; "edit my Thursday pull day" could name a
    // template the model had never seen.
    it('on-plan templates come first with a day tag, the rest by lastUpdated desc', () => {
        const plans = [
            { id: 'old', name: 'Old Push', lastUpdated: '2026-01-01', exercises: [] },
            { id: 'pull', name: 'Thursday Pull', lastUpdated: '2026-02-01', exercises: [] },
            { id: 'new', name: 'New Legs', lastUpdated: '2026-09-01', exercises: [] },
        ];
        const ctx = buildTemplatesContext(plans, { weekPlan: { days: { thu: 'pull', fri: 'rest' } } });
        const lines = ctx.split('\n').filter(l => l.startsWith('- '));
        expect(lines[0]).toContain('Thursday Pull [Thu]');
        expect(lines[1]).toContain('New Legs');
        expect(lines[2]).toContain('Old Push');
        expect(ctx).not.toContain('…+');
    });

    it('caps at 20 by default and names the tool that has the rest', () => {
        const plans = Array.from({ length: 23 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, lastUpdated: `2026-01-${String(i + 1).padStart(2, '0')}`, exercises: [] }));
        const ctx = buildTemplatesContext(plans);
        expect(ctx).toContain('…+3 more (list_templates has all)');
        expect(ctx).toContain('T22'); // newest survives
        expect(ctx).not.toContain('- T0:'); // oldest is what gets cut
    });

    it('an on-plan template survives the cap even when it is the stalest', () => {
        const plans = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, lastUpdated: `2026-01-${String(i + 1).padStart(2, '0')}`, exercises: [] }));
        const ctx = buildTemplatesContext(plans, { capTemplates: 3, weekPlan: { days: { mon: 't0' } } });
        expect(ctx).toContain('T0 [Mon]');
        expect(ctx).toContain('T11');
        expect(ctx).toContain('T10');
        expect(ctx).not.toContain('- T9:');
    });
});

describe('setTypeMarker', () => {
    it('annotates non-working sets only', () => {
        expect(setTypeMarker({ type: 'warmup' })).toBe(' (warmup)');
        expect(setTypeMarker({ type: 'failure' })).toBe(' (failure)');
        expect(setTypeMarker({ type: 'working' })).toBe('');
        expect(setTypeMarker({})).toBe('');
    });
});

describe('templatesChangedNote', () => {
    it('empty when unchanged (order-insensitive)', () => {
        expect(templatesChangedNote(['A', 'B'], ['B', 'A'])).toBe('');
    });

    it('one-line note listing current names when changed', () => {
        const note = templatesChangedNote(['A'], ['A', 'New Pull Day']);
        expect(note).toContain('saved workouts changed');
        expect(note).toContain('New Pull Day');
        expect(note.endsWith('\n\n')).toBe(true);
    });
});

describe('deriveProgramWeek / buildProgramContext (Phase 9)', () => {
    const program = {
        name: 'Strength block', goal: 'strength', weeks: 4, startDate: '2026-06-29',
        weekTargets: [
            { week: 2, label: 'heavy', weightPct: 5 },
            { week: 4, label: 'deload', weightPct: -40, note: 'easy week' },
        ],
    };

    it('derives the week from startDate — never stored', () => {
        expect(deriveProgramWeek(program, '2026-06-29').week).toBe(1);
        expect(deriveProgramWeek(program, '2026-07-07').week).toBe(2);
        expect(deriveProgramWeek(program, '2026-07-20')).toMatchObject({ week: 4, finished: false });
        expect(deriveProgramWeek(program, '2026-08-03').finished).toBe(true);
    });

    it('picks the matching week target (null when baseline)', () => {
        expect(deriveProgramWeek(program, '2026-07-07').target).toMatchObject({ label: 'heavy', weightPct: 5 });
        expect(deriveProgramWeek(program, '2026-06-30').target).toBeNull();
    });

    it('context line carries week-of + target; finished programs say so', () => {
        const ctx = buildProgramContext(program, '2026-07-07');
        expect(ctx).toContain('week 2 of 4');
        expect(ctx).toContain('heavy (+5% weight)');
        expect(buildProgramContext(program, '2026-08-10')).toContain('FINISHED');
        expect(buildProgramContext(null, '2026-07-07')).toBe('');
    });

    it('CP-3: the context line carries set / rep / RPE levers, not just weightPct', () => {
        const shaped = { ...program, weekTargets: [{ week: 2, label: 'intensify', setDelta: 2, repRange: [6, 8], rpeTarget: 9 }] };
        expect(buildProgramContext(shaped, '2026-07-07')).toContain('intensify (+2 sets · 6–8 reps · RPE 9)');
    });
});

describe('AP-9 — the coach learns the deload', () => {
    const program = {
        name: 'Hypertrophy block', goal: 'hypertrophy', weeks: 6, startDate: '2026-06-29',
        weekTargets: [
            { week: 2, label: 'Volume', setDelta: 1 },
            { week: 6, label: 'Deload', weightPct: -35, setDelta: -2, repRange: [12, 15] },
        ],
    };

    it('buildProgramContext emits the DELOAD WEEK directive in a deload week', () => {
        const ctx = buildProgramContext(program, '2026-08-05'); // week 6
        expect(ctx).toContain('week 6 of 6');
        expect(ctx).toContain('DELOAD WEEK: do NOT prescribe heavier loads this week; hold or reduce. Session targets are already set by the app.');
    });

    it('a volume-only deload (negative setDelta) counts too', () => {
        const volOnly = { ...program, weekTargets: [{ week: 6, label: 'Back-off', setDelta: -2 }] };
        expect(buildProgramContext(volOnly, '2026-08-05')).toContain('DELOAD WEEK');
    });

    it('no directive in a build week or a baseline week', () => {
        expect(buildProgramContext(program, '2026-07-07')).not.toContain('DELOAD'); // week 2, +1 set
        expect(buildProgramContext(program, '2026-07-14')).not.toContain('DELOAD'); // week 3, baseline
    });

    it('buildSessionIntentContext: one line for a deload intent from any source', () => {
        const manual = buildSessionIntentContext({ mode: 'deload', weightPct: -30, setDelta: null, repRange: null, rpeTarget: null, source: 'manual' });
        expect(manual).toBe('Current session: DELOAD (manual deload · -30% weight) — do NOT prescribe heavier loads for this session; hold or reduce. Session targets are already set by the app.\n');
        const prog = buildSessionIntentContext({ mode: 'deload', weightPct: -35, repRange: [12, 15], week: 6, weeks: 6, source: 'program' });
        expect(prog).toContain('program week 6 of 6 · -35% weight · 12–15 reps');
        const label = buildSessionIntentContext({ mode: 'deload', weightPct: null, source: 'label' });
        expect(label).toContain('Current session: DELOAD (labelled deload)');
    });

    it("buildSessionIntentContext: '' for build / peak / freestyle / missing", () => {
        expect(buildSessionIntentContext({ mode: 'build', source: 'none' })).toBe('');
        expect(buildSessionIntentContext({ mode: 'peak', weightPct: 5, source: 'program' })).toBe('');
        expect(buildSessionIntentContext({ mode: 'freestyle', source: 'none' })).toBe('');
        expect(buildSessionIntentContext(null)).toBe('');
    });
});

describe('AP-15b — buildTodayContext', () => {
    // 2026-07-08 is a Wednesday.
    const templates = [{ id: 'push', name: 'Push Day' }, { id: 'pull', name: 'Pull Day' }];
    const plan = { days: { mon: 'push', tue: null, wed: 'pull', thu: null, fri: null, sat: null, sun: null }, restDays: ['sun'] };
    const done = (date, templateId, location) => ({ date, templateId, workoutType: templateId, completedAt: `${date}T18:00:00Z`, location });

    it("date, weekday, planned template, and the last workout's gym", () => {
        const line = buildTodayContext({
            today: '2026-07-08', weekPlan: plan, templates,
            workouts: [done('2026-07-06', 'push', 'Iron Temple'), done('2026-06-30', 'pull', 'Home')],
        });
        expect(line).toBe('Today: Wednesday 2026-07-08 · planned: Pull Day · gym: Iron Temple\n');
    });

    it('rest day, already-done day, and no plan', () => {
        expect(buildTodayContext({ today: '2026-07-12', weekPlan: plan, templates })).toContain('planned: rest day');
        expect(buildTodayContext({ today: '2026-07-08', weekPlan: plan, templates, workouts: [done('2026-07-06', 'push'), done('2026-07-08', 'pull')] }))
            .toContain('planned: Pull Day (already done)');
        expect(buildTodayContext({ today: '2026-07-08' })).toBe('Today: Wednesday 2026-07-08 · no week plan\n');
    });

    it('a missed day reflows onto today (the dashboard Today card rules)', () => {
        // Monday's push was missed and Tuesday is open → it reflows to Tuesday.
        expect(buildTodayContext({ today: '2026-07-07', weekPlan: plan, templates })).toContain('planned: Push Day');
    });

    it('program week + target + DELOAD flag', () => {
        const program = {
            name: 'Block', goal: 'strength', weeks: 4, startDate: '2026-06-15',
            weekTargets: [{ week: 4, label: 'Deload', weightPct: -35 }],
        };
        const line = buildTodayContext({ today: '2026-07-08', weekPlan: plan, templates, program });
        expect(line).toContain('program week 4 of 4 — Deload (-35% weight)');
        expect(line).toContain('· DELOAD');
        const baseline = buildTodayContext({ today: '2026-06-16', program });
        expect(baseline).toContain('program week 1 of 4 — baseline');
        expect(baseline).not.toContain('DELOAD');
    });

    it('an in-progress deload intent flags DELOAD with no program; current location wins', () => {
        const line = buildTodayContext({
            today: '2026-07-08', intent: { mode: 'deload', source: 'manual' },
            currentLocation: { name: 'Hotel Gym' }, workouts: [done('2026-07-06', 'push', 'Iron Temple')],
        });
        expect(line).toContain('DELOAD');
        expect(line).toContain('gym: Hotel Gym');
        expect(line).not.toContain('Iron Temple');
    });

    it("bad or missing date → ''", () => {
        expect(buildTodayContext({})).toBe('');
        expect(buildTodayContext({ today: 'nope' })).toBe('');
    });
});

describe('AP-15e — context freshness', () => {
    const now = Date.parse('2026-07-08T12:00:00Z');

    it('first turn and context-less threads (review seeds) attach a block', () => {
        expect(contextRefreshReason({ turns: 0, contextAt: 0, now })).toBe('first');
        expect(contextRefreshReason({ turns: 2, contextAt: 0, now })).toBe('missing');
    });

    it('a write since the last block, or a block >24 h old, re-sends it', () => {
        expect(contextRefreshReason({ turns: 2, contextAt: now - 60000, wroteSinceContext: true, now })).toBe('write');
        expect(contextRefreshReason({ turns: 4, contextAt: now - CONTEXT_STALE_MS - 1, now })).toBe('stale');
    });

    it('a fresh block with no writes → no block this turn', () => {
        expect(contextRefreshReason({ turns: 2, contextAt: now - 3600000, now })).toBeNull();
    });

    it('every context turn strips back to the typed question', () => {
        for (const reason of ['first', 'missing', 'write', 'stale']) {
            const turn = contextTurn('Today: Wednesday 2026-07-08\nUnit: lbs', 'What today?', reason);
            expect(turn).toContain('Unit: lbs');
            expect(visibleQuestion(turn)).toBe('What today?');
        }
        expect(contextTurn('X', 'Q', 'stale')).toContain('over a day old');
        expect(visibleQuestion('plain follow-up')).toBe('plain follow-up');
    });
});

describe('deriveProgramWeek moved to week-targets.js', () => {
    it('coach-context re-exports the same function', () => {
        expect(deriveProgramWeek).toBe(deriveFromWeekTargets);
    });
});

describe('firstSentence (AP-15h)', () => {
    it('takes the first sentence, markdown stripped', () => {
        expect(firstSentence('**Hold 185 lbs.** Then chase a ninth rep.')).toBe('Hold 185 lbs.');
        expect(firstSentence('- Bump to 205 next time\n- Keep the ramp')).toBe('Bump to 205 next time');
        expect(firstSentence('## Verdict\nYour bench is up 6 lbs.')).toBe('Verdict');
    });
    it("doesn't split on decimals and clips long sentences", () => {
        expect(firstSentence('Go 102.5 kg for 5. Then rest.')).toBe('Go 102.5 kg for 5.');
        const long = firstSentence('x'.repeat(300), 50);
        expect(long).toHaveLength(50);
        expect(long.endsWith('…')).toBe(true);
    });
    it('is empty for empty input', () => {
        expect(firstSentence('')).toBe('');
        expect(firstSentence(null)).toBe('');
    });
});

describe('buildRecentThreadsContext (AP-15h)', () => {
    const thread = (id, ts, question, firstAnswer, extra = {}) => ({
        id, threadId: id, timestamp: ts, question,
        response: 'latest answer. more.',
        messages: [
            { role: 'user', content: `Here is my recent training data:\n\nCTX\n\nQuestion: ${question}` },
            { role: 'assistant', content: firstAnswer },
            { role: 'user', content: 'follow-up' },
            { role: 'assistant', content: 'latest answer. more.' },
        ],
        ...extra,
    });

    it('one line per thread: date, opening question, first sentence of the FIRST answer', () => {
        const ctx = buildRecentThreadsContext([
            thread('t2', '2026-10-20T18:00:00Z', 'Should I go heavier on bench?', '**Hold 185 and chase 9.** You have been flat.'),
            thread('t1', '2026-10-13T18:00:00Z', 'Is my bench stalling?', 'Yes — three sessions at 185. Hold it.'),
        ]);
        expect(ctx).toBe('Recent conversations (newest first — what the user asked and how you opened; build on it, don\'t repeat it):\n'
            + '- 2026-10-20 · "Should I go heavier on bench?" → "Hold 185 and chase 9."\n'
            + '- 2026-10-13 · "Is my bench stalling?" → "Yes — three sessions at 185."\n');
    });

    it("strips a context block left in an older doc's question", () => {
        const ctx = buildRecentThreadsContext([{
            timestamp: '2026-10-01T00:00:00Z',
            question: 'Here is my recent training data:\n\nLOTS\n\nQuestion: How is my squat?',
            response: 'Climbing.',
        }]);
        expect(ctx).toContain('"How is my squat?" → "Climbing."');
        expect(ctx).not.toContain('LOTS');
    });

    it('includes weekly reviews and skips the thread being continued', () => {
        const ctx = buildRecentThreadsContext([
            thread('current', '2026-10-23T00:00:00Z', 'This one', 'Answer.'),
            { id: 'r1', type: 'weekly_review', question: 'Weekly review', timestamp: '2026-10-20T14:00:00Z', response: '- Bench up 6 lbs over 4 weeks\n- Watch hinge volume' },
        ], { excludeThreadId: 'current' });
        expect(ctx).not.toContain('This one');
        expect(ctx).toContain('- 2026-10-20 · weekly review → "Bench up 6 lbs over 4 weeks"');
    });

    it('caps at the limit and the character budget', () => {
        const docs = Array.from({ length: 9 }, (_, i) => thread(`t${i}`, `2026-10-${10 + i}T00:00:00Z`, `Question ${i}`, 'Answer.'));
        expect(buildRecentThreadsContext(docs).match(/^- /gm)).toHaveLength(5);
        const long = Array.from({ length: 5 }, (_, i) => thread(`l${i}`, '2026-10-10T00:00:00Z', 'q'.repeat(400), 'a'.repeat(400)));
        expect(buildRecentThreadsContext(long).length).toBeLessThan(1800);
    });

    it('empty → empty string', () => {
        expect(buildRecentThreadsContext([])).toBe('');
        expect(buildRecentThreadsContext([{ question: '', response: '' }])).toBe('');
    });
});
