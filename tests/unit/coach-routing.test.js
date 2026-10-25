// AP-19 routing + AP-20a trace documents (functions/coach-routing.js, pure).

import { describe, it, expect } from 'vitest';
import { routeCoachTurn, buildTraceDoc, lastUserText } from '../../functions/coach-routing.js';

describe('routeCoachTurn (AP-19)', () => {
    it('fact lookups go to the fast model', () => {
        for (const q of ["What's my bench PR?", 'How many times did I train legs last month', 'When did I last do squats', 'show me my best deadlift']) {
            expect(routeCoachTurn({ question: q })).toEqual({ tier: 'quick', reason: 'fact lookup' });
        }
    });
    it('judgment, plans and changes stay on the flagship', () => {
        for (const q of ['Should I go heavier on bench?', "What's my bench PR and should I deload?", 'Build me a program',
            'Why is my squat stalling', 'what is my next block', 'Swap my leg curl']) {
            expect(routeCoachTurn({ question: q }).tier).toBe('deep');
        }
    });
    it('when unsure, flagship; live mode is its own tier', () => {
        expect(routeCoachTurn({ question: 'Thoughts on my week?' }).tier).toBe('deep');
        expect(routeCoachTurn({ question: '' }).tier).toBe('deep');
        expect(routeCoachTurn({ question: `What's my bench PR ${'x'.repeat(200)}` }).reason).toBe('long question');
        expect(routeCoachTurn({ question: 'anything', isLive: true })).toEqual({ tier: 'live', reason: 'live mode' });
    });
});

describe('buildTraceDoc (AP-20a)', () => {
    const messages = [
        { role: 'user', content: 'Here is my recent training data:\n\nCTX BLOCK\n\nQuestion: How is my bench?' },
        { role: 'assistant', content: 'Fine.' },
        { role: 'user', content: 'And squat?' },
    ];
    it('records what the model saw, every tool call, rounds, tokens and latency', () => {
        const doc = buildTraceDoc({
            userId: 'u1', threadId: 'thread_1', mode: 'chat', route: { tier: 'deep', reason: 'default' }, model: 'm',
            messages, question: 'And squat?',
            toolCalls: [{ round: 1, name: 'get_verdicts', input: {}, output: { ok: true }, isError: false, ms: 42 }],
            rounds: 2, usage: { inputTokens: 900, outputTokens: 120 }, latencyMs: 3100, stopReason: 'end_turn',
            responseText: 'Squat is up.', now: new Date('2026-10-25T12:00:00Z'),
        });
        expect(doc).toMatchObject({
            userId: 'u1', threadId: 'thread_1', turn: 2, mode: 'chat', model: 'm',
            contextText: 'And squat?', contextChars: 10, hasContextBlock: false,
            rounds: 2, tokens: { input: 900, output: 120 }, latencyMs: 3100, stopReason: 'end_turn',
            responseChars: 12, createdAt: '2026-10-25T12:00:00.000Z',
        });
        expect(doc.toolCalls).toEqual([{ round: 1, name: 'get_verdicts', input: '{}', output: '{"ok":true}', isError: false, ms: 42 }]);
        expect(doc.contextHash).toMatch(/^[0-9a-f]{16}$/);
        expect(doc.error).toBeUndefined();
    });
    it('flags a turn that carried a context block, and clips big payloads', () => {
        const doc = buildTraceDoc({ userId: 'u', mode: 'chat', messages: messages.slice(0, 1), toolCalls: [{ name: 't', input: 'x'.repeat(5000), output: 'y' }], error: 'boom' });
        expect(doc.hasContextBlock).toBe(true);
        expect(doc.toolCalls[0].input.length).toBeLessThan(2100);
        expect(doc.error).toBe('boom');
    });
    it('lastUserText reads string or block content', () => {
        expect(lastUserText([{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'tool_result' }] }])).toBe('a\n');
        expect(lastUserText([])).toBe('');
    });
});
