// Tests for the fuzzy-match helpers (dice bigram similarity + best-match).
import { describe, it, expect } from 'vitest';
import { diceSimilarity, findBestMatch } from '../../js/core/data/fuzzy-match.js';

describe('diceSimilarity', () => {
    it('returns 1 for identical strings', () => {
        expect(diceSimilarity('Cable Crossover', 'Cable Crossover')).toBe(1);
    });

    it('returns 1 for identical after normalization (case + punctuation)', () => {
        expect(diceSimilarity('Cable Crossover', 'cable-crossover')).toBe(1);
        expect(diceSimilarity('Iso-Lateral Bench', 'iso lateral bench')).toBe(1);
    });

    it('returns 0 for completely different strings', () => {
        expect(diceSimilarity('Treadmill', 'Hack Squat')).toBeLessThan(0.1);
    });

    it('returns 0 for empty inputs', () => {
        expect(diceSimilarity('', 'something')).toBe(0);
        expect(diceSimilarity('something', '')).toBe(0);
        expect(diceSimilarity('', '')).toBe(0);
        expect(diceSimilarity(null, 'something')).toBe(0);
    });

    it('scores typos as high-similarity', () => {
        // common typos & singular/plural — should still match
        expect(diceSimilarity('Flat Bench Press', 'Flat Bench Pres')).toBeGreaterThan(0.85);
        expect(diceSimilarity('Lat Pulldown', 'Lat Pull Down')).toBeGreaterThan(0.85);
    });

    it('scores partial matches in the moderate range', () => {
        // an orphan name that is a SUBSET of the canonical name
        const s = diceSimilarity('Flat Bench', 'Hammer Strength Flat Bench Press');
        expect(s).toBeGreaterThan(0.4);
        expect(s).toBeLessThan(0.85);
    });

    it('is symmetric', () => {
        const a = 'Newtech Chest Press';
        const b = 'Chest Press by Newtech';
        expect(diceSimilarity(a, b)).toBeCloseTo(diceSimilarity(b, a), 6);
    });

    it('rejects single-character strings cleanly', () => {
        expect(diceSimilarity('a', 'b')).toBe(0);
        expect(diceSimilarity('a', 'a')).toBe(1);
    });
});

describe('findBestMatch', () => {
    const equipmentNames = [
        'Hammer Strength Flat Bench Press',
        'Cable Crossover',
        'Leg Press',
        'Lat Pulldown',
        'Pec Dec Fly',
    ];

    it('finds the best match above threshold', () => {
        const result = findBestMatch('flat bench', equipmentNames, 0.4);
        expect(result).not.toBeNull();
        expect(result.candidate).toBe('Hammer Strength Flat Bench Press');
    });

    it('returns null when no candidate meets the threshold', () => {
        expect(findBestMatch('treadmill', equipmentNames, 0.6)).toBeNull();
    });

    it('returns null for empty inputs', () => {
        expect(findBestMatch('', equipmentNames, 0.6)).toBeNull();
        expect(findBestMatch('foo', [], 0.6)).toBeNull();
        expect(findBestMatch('foo', null, 0.6)).toBeNull();
    });

    it('accepts objects with a name property', () => {
        const candidates = [
            { id: '1', name: 'Cable Crossover' },
            { id: '2', name: 'Hack Squat' },
        ];
        const result = findBestMatch('cable cross', candidates, 0.4);
        expect(result).not.toBeNull();
        expect(result.candidate.id).toBe('1');
        expect(result.score).toBeGreaterThan(0.4);
    });

    it('returns the highest-scoring match when multiple pass threshold', () => {
        const candidates = ['Flat Bench', 'Flat Bench Press', 'Decline Bench Press'];
        const result = findBestMatch('Flat Bench Press', candidates, 0.5);
        expect(result.candidate).toBe('Flat Bench Press'); // exact match wins
        expect(result.score).toBe(1);
    });

    it('defaults threshold to 0.6 when not provided', () => {
        // Treadmill vs Leg Press should be well below 0.6, returns null
        expect(findBestMatch('Treadmill', ['Leg Press'])).toBeNull();
    });
});
