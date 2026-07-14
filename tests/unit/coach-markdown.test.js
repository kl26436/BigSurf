// Coach markdown formatter — the pure module behind chat-bubble rendering.

import { describe, it, expect } from 'vitest';
import { formatCoachResponse } from '../../js/core/features/coach-markdown.js';

describe('formatCoachResponse', () => {
    it('empty/null → empty string', () => {
        expect(formatCoachResponse('')).toBe('');
        expect(formatCoachResponse(null)).toBe('');
    });

    it('bold', () => {
        expect(formatCoachResponse('go **heavy** today')).toContain('<strong>heavy</strong>');
    });

    it('bullets wrap into a single <ul>', () => {
        const html = formatCoachResponse('- squat\n- bench\n- row');
        expect(html).toContain('<ul><li>squat</li>');
        expect(html).toContain('<li>row</li></ul>');
        expect((html.match(/<ul>/g) || []).length).toBe(1);
    });

    it('numbered lists wrap into <ol> and never leak into <ul>', () => {
        const html = formatCoachResponse('1. warm up\n2. top set\n3. back-offs');
        expect(html).toContain('<ol><li>warm up</li>');
        expect(html).toContain('<li>back-offs</li></ol>');
        expect(html).not.toContain('<ul>');
        expect(html).not.toContain('data-n');
    });

    it('mixed bullets and numbers keep their own list types', () => {
        const html = formatCoachResponse('1. first\n2. second\n\nNotes:\n- one\n- two');
        expect(html).toContain('<ol><li>first</li>');
        expect(html).toContain('<ul><li>one</li>');
    });

    it('### → h4, ## → h3', () => {
        const html = formatCoachResponse('## Plan\nlift\n### Details\nmore');
        expect(html).toContain('<h3>Plan</h3>');
        expect(html).toContain('<h4>Details</h4>');
    });

    it('inline code', () => {
        expect(formatCoachResponse('log it as `3×5 @ 185`')).toContain('<code>3×5 @ 185</code>');
    });

    it('paragraph + line-break behavior preserved from the original formatter', () => {
        const html = formatCoachResponse('first line\nsecond line\n\nnew para');
        expect(html.startsWith('<p>')).toBe(true);
        expect(html).toContain('first line<br>second line');
        expect(html).toContain('</p><p>new para');
    });

    it('bold inside a bullet inside a header-led section', () => {
        const html = formatCoachResponse('## Focus\n- **Squat**: add 5 lbs');
        expect(html).toContain('<h3>Focus</h3>');
        expect(html).toContain('<li><strong>Squat</strong>: add 5 lbs</li>');
    });

    it('escapes HTML echoed from user-stored strings (XSS)', () => {
        const html = formatCoachResponse('Your "<img src=x onerror=alert(1)>" workout looks good');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('escapes script tags and preserves ampersands', () => {
        const html = formatCoachResponse('<script>steal()</script> push & pull');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('push &amp; pull');
    });

    it('escaped content still formats: bold and code around angle brackets', () => {
        const html = formatCoachResponse('**5x5 <185 lbs** then `a<b`');
        expect(html).toContain('<strong>5x5 &lt;185 lbs</strong>');
        expect(html).toContain('<code>a&lt;b</code>');
    });
});
