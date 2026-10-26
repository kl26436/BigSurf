// TP-0 — plain-language.js: the glossary, the jargon finder, the formatters,
// and the model-facing strings that must speak them.

import { describe, it, expect } from 'vitest';
import {
    TERMS, BANNED_UI_TERMS, findJargon, jargonTermsIn, effortTag, describeEffort,
    weekKindOf, weekKindLabel, describeWeekKind, describeStuck, volumeStatus, describeVolume,
    describeVolumeLandmarks, pctChange, describeStrengthChange, ACTION_WORDS, describeAction,
} from '../../js/core/features/plain-language.js';
import { PROGRESSION_ACTIONS } from '../../js/core/features/progression.js';
import { verdictLine } from '../../js/core/features/coach-rules.js';
import prompts from '../../functions/coach-prompts.js';

describe('findJargon', () => {
    it('finds every banned term, whole-word, in order', () => {
        const hits = findJargon('Your e1RM is up; RPE 8 this deload week, MRV 22, MEV 8, rung 2, next block');
        expect(hits.map(h => h.term)).toEqual(['e1RM', 'RPE', 'deload', 'MRV', 'MEV', 'rung', 'block']);
    });

    it('is whole-word — blocked, blockade and lowercase rpe pass', () => {
        expect(findJargon('I blocked the door; the rpe field; a blockade')).toEqual([]);
        expect(findJargon('two rungs up').map(h => h.match)).toEqual(['rungs']);
    });

    it('catches inflections', () => {
        expect(jargonTermsIn('Deloading, accumulation and intensifying blocks; 1RMs')).toEqual(['deload', 'accumulate', 'intensify', 'block', 'e1RM']);
    });

    it('honours allow — the user asked about the term', () => {
        expect(findJargon('RPE means effort out of 10', { allow: ['RPE'] })).toEqual([]);
        expect(findJargon('RPE means effort; deload means lighter', { allow: jargonTermsIn('what is RPE?') }).map(h => h.term)).toEqual(['deload']);
    });

    it('the banned list matches the glossary', () => {
        expect(BANNED_UI_TERMS).toEqual(expect.arrayContaining(['e1RM', 'RPE', 'MEV', 'MRV', 'rung', 'deload', 'block', 'accumulate', 'intensify', 'primaries']));
        for (const t of Object.values(TERMS)) expect(findJargon(`${t.short}: ${t.long}`)).toEqual([]);
    });
});

describe('formatters', () => {
    it('effort', () => {
        expect(effortTag(8)).toBe('effort 8/10');
        expect(effortTag(null)).toBe('');
        expect(describeEffort(9.5)).toBe('effort 9.5 of 10');
        expect(describeEffort('')).toBe('');
    });

    it('week kinds follow the levers for lighter, the label for peak / push', () => {
        expect(weekKindOf(null)).toBe('build');
        expect(weekKindOf({ label: 'accumulate', setDelta: 1 })).toBe('build');
        expect(weekKindOf({ label: 'intensify', repRange: [6, 8] })).toBe('push');
        expect(weekKindOf({ label: 'v', rpeTarget: 9 })).toBe('push');
        expect(weekKindOf({ label: 'Peak', weightPct: 5 })).toBe('peak');
        expect(weekKindOf({ label: 'Deload', weightPct: -35 })).toBe('lighter');
        expect(weekKindOf({ label: 'Back-off', setDelta: -2 })).toBe('lighter');
        // A "Deload" label with build levers reads as the levers do — the set rows build.
        expect(weekKindOf({ label: 'Deload', setDelta: 1 })).toBe('build');
        expect(weekKindLabel({ label: 'intensify', rpeTarget: 8.5 })).toBe('Push week');
        expect(describeWeekKind({ label: 'Deload', weightPct: -35 })).toBe('Lighter week (−35%)');
        expect(describeWeekKind({ label: 'Deload', setDelta: -2 })).toBe('Lighter week');
        expect(describeWeekKind({ label: 'Volume', setDelta: 1 })).toBe('Build week');
    });

    it('stuck — rung 0 says nothing', () => {
        expect(describeStuck({ rung: 0 })).toBe('');
        expect(describeStuck({ rung: 1, stallRun: 3, weight: 185, unit: 'lbs' })).toBe('stuck at 185 lbs for 3 sessions — chase one more rep');
        expect(describeStuck({ rung: 2, stallRun: 4 })).toBe('stuck for 4 sessions — backing off to reset');
        expect(describeStuck({ rung: 3, stallRun: 6, weight: 80, unit: 'kg' })).toBe('stuck at 80 kg for 6 sessions — time to rotate this exercise');
    });

    it('volume against the landmarks', () => {
        expect(volumeStatus(4, { mev: 8, mrv: 22 })).toBe('under');
        expect(volumeStatus(22, { mev: 8, mrv: 22 })).toBe('enough');
        expect(volumeStatus(23, { mev: 8, mrv: 22 })).toBe('over');
        expect(describeVolume({ muscle: 'Chest', sets: 12, mev: 8, mrv: 22 })).toBe('Chest: 12 sets this week — enough');
        expect(describeVolume({ muscle: 'Hamstrings', sets: 1, mev: 8, mrv: 22 })).toBe('Hamstrings: 1 set this week — under what it needs');
        expect(describeVolume({ muscle: 'Back', sets: 26, mev: 8, mrv: 22 })).toBe('Back: 26 sets this week — more than it can use');
        expect(findJargon(describeVolumeLandmarks({ mev: 8, mrv: 22 }))).toEqual([]);
    });

    it('strength change rounds to whole percent and keeps the unit', () => {
        expect(pctChange(213, 205)).toBe(4);
        expect(pctChange(100, 0)).toBeNull();
        expect(describeStrengthChange({ name: 'Bench press', machine: 'Smith', now: 213, prev: 205 }))
            .toBe('Bench press (Smith): estimated max 213 lbs, up 4% from a month ago');
        expect(describeStrengthChange({ name: 'Squat', now: 140, prev: 144, unit: 'kg' })).toBe('Squat: estimated max 140 kg, down 3% from a month ago');
        expect(describeStrengthChange({ name: 'Row', now: 200, prev: 200.4 })).toBe('Row: estimated max 200 lbs, about the same as a month ago');
        expect(describeStrengthChange({ name: 'Curl', now: null })).toBe('Curl: no recent sets');
    });

    it('every progression action has words, and none are jargon', () => {
        expect(Object.keys(ACTION_WORDS).sort()).toEqual([...PROGRESSION_ACTIONS].sort());
        for (const a of PROGRESSION_ACTIONS) expect(findJargon(describeAction(a))).toEqual([]);
    });
});

describe('model-facing strings speak the same words (A1, A7)', () => {
    it('no verdict line uses jargon', () => {
        const base = { weight: 185, reps: 8, last: { weight: 180, reps: 8, date: '2026-10-20' }, stallRun: 4, staleDays: 50 };
        for (const action of [...PROGRESSION_ACTIONS, 'none']) {
            for (const extra of [{}, { rung: 1 }, { early: true }, { fatigue: 'x' }]) {
                expect(findJargon(verdictLine({ ...base, ...extra, action }, 'lbs'))).toEqual([]);
            }
        }
    });

    it('the answer contracts and the rule line are jargon-free (the rule itself names the terms it bans)', () => {
        const contracts = prompts.TRAINING_SCIENCE_PROMPT.split('HOW TO ANSWER')[1];
        const withoutRule = contracts.split(prompts.PLAIN_WORDS_RULE).join('');
        expect(findJargon(withoutRule)).toEqual([]);
        expect(prompts.TRAINING_SCIENCE_PROMPT).toContain(prompts.PLAIN_WORDS_RULE);
        expect(prompts.LIVE_SYSTEM_PROMPT).toContain(prompts.PLAIN_WORDS_RULE);
        expect(prompts.WEEKLY_REVIEW_SYSTEM).toContain(prompts.PLAIN_WORDS_RULE);
    });

    it('the verdict glossary uses the new words', () => {
        const line = prompts.TRAINING_SCIENCE_PROMPT.split('\n').find(l => l.startsWith('- Verdict actions:'));
        expect(findJargon(line)).toEqual([]);
    });
});
