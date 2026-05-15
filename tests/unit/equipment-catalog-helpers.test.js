// Tests for equipment-catalog-helpers — pure functions for slug generation,
// catalog shape augmentation, and catalog-ref resolution.
import { describe, it, expect } from 'vitest';
import {
    slugify,
    augmentStaticCatalog,
    normalizeFirestoreBrand,
    isValidCatalogRef,
    resolveCatalogRef,
    buildCatalogRef,
} from '../../js/core/data/equipment-catalog-helpers.js';

describe('slugify', () => {
    it('lowercases and hyphenates simple multi-word strings', () => {
        expect(slugify('Hammer Strength')).toBe('hammer-strength');
    });

    it('strips parentheses and special chars', () => {
        expect(slugify('M-Torture (Plate-Loaded)')).toBe('m-torture-plate-loaded');
    });

    it('collapses multiple separators', () => {
        expect(slugify('Iso___Lateral   Bench  Press')).toBe('iso-lateral-bench-press');
    });

    it('trims leading and trailing hyphens', () => {
        expect(slugify('-foo bar-')).toBe('foo-bar');
        expect(slugify('   ')).toBe('unknown');
    });

    it('handles empty / null / undefined', () => {
        expect(slugify('')).toBe('unknown');
        expect(slugify(null)).toBe('unknown');
        expect(slugify(undefined)).toBe('unknown');
    });

    it('produces stable output for already-slugged input', () => {
        expect(slugify('hammer-strength')).toBe('hammer-strength');
        expect(slugify(slugify('Hammer Strength'))).toBe('hammer-strength');
    });
});

describe('augmentStaticCatalog', () => {
    const sample = [{
        brand: 'Hammer Strength',
        lines: [{
            name: 'Plate-Loaded',
            type: 'Plate-Loaded',
            machines: [
                { name: 'Iso-Lateral Bench Press', bodyPart: 'Chest' },
                { name: 'Iso-Lateral Row', bodyPart: 'Back' },
            ],
        }],
    }];

    it('adds slug + name aliasing on brand level', () => {
        const result = augmentStaticCatalog(sample);
        expect(result[0].slug).toBe('hammer-strength');
        expect(result[0].name).toBe('Hammer Strength');
        expect(result[0].brand).toBe('Hammer Strength'); // legacy alias preserved
    });

    it('adds slug on line level and preserves type', () => {
        const result = augmentStaticCatalog(sample);
        expect(result[0].lines[0].slug).toBe('plate-loaded');
        expect(result[0].lines[0].type).toBe('Plate-Loaded');
    });

    it('builds machine ids as brand/line/machine slugs', () => {
        const result = augmentStaticCatalog(sample);
        expect(result[0].lines[0].machines[0].id).toBe('hammer-strength/plate-loaded/iso-lateral-bench-press');
        expect(result[0].lines[0].machines[1].id).toBe('hammer-strength/plate-loaded/iso-lateral-row');
    });

    it('inherits line type onto machine when absent', () => {
        const result = augmentStaticCatalog(sample);
        expect(result[0].lines[0].machines[0].type).toBe('Plate-Loaded');
    });

    it('seeds empty exercises mapping when absent', () => {
        const result = augmentStaticCatalog(sample);
        expect(result[0].lines[0].machines[0].exercises).toEqual({ primary: [], secondary: [] });
    });

    it('preserves existing exercises mapping if present', () => {
        const withMap = [{
            brand: 'Foo',
            lines: [{
                name: 'Bar',
                type: 'Machine',
                machines: [
                    { name: 'Baz', bodyPart: 'Chest', exercises: { primary: ['bench-press'], secondary: [] } },
                ],
            }],
        }];
        const result = augmentStaticCatalog(withMap);
        expect(result[0].lines[0].machines[0].exercises.primary).toEqual(['bench-press']);
    });

    it('returns empty array for non-array input', () => {
        expect(augmentStaticCatalog(null)).toEqual([]);
        expect(augmentStaticCatalog(undefined)).toEqual([]);
        expect(augmentStaticCatalog('not an array')).toEqual([]);
    });
});

describe('normalizeFirestoreBrand', () => {
    it('inherits line type onto machines without explicit type', () => {
        const doc = {
            slug: 'foo',
            name: 'Foo',
            lines: [{
                slug: 'bar',
                name: 'Bar',
                type: 'Cable',
                machines: [
                    { id: 'foo/bar/baz', slug: 'baz', name: 'Baz', bodyPart: 'Chest' },
                ],
            }],
        };
        const result = normalizeFirestoreBrand(doc);
        expect(result.lines[0].machines[0].type).toBe('Cable');
    });

    it('preserves machine-level type when set', () => {
        const doc = {
            slug: 'foo',
            name: 'Foo',
            lines: [{
                slug: 'bar', name: 'Bar', type: 'Cable',
                machines: [{ id: 'foo/bar/baz', slug: 'baz', name: 'Baz', type: 'Selectorized', bodyPart: 'Chest' }],
            }],
        };
        const result = normalizeFirestoreBrand(doc);
        expect(result.lines[0].machines[0].type).toBe('Selectorized');
    });

    it('returns null for null input', () => {
        expect(normalizeFirestoreBrand(null)).toBeNull();
    });
});

describe('isValidCatalogRef', () => {
    it('accepts well-formed slug/slug/slug', () => {
        expect(isValidCatalogRef('hammer-strength/plate-loaded/iso-lateral-bench-press')).toBe(true);
        expect(isValidCatalogRef('newtech/m-torture/chest-press')).toBe(true);
    });

    it('rejects refs with wrong segment count', () => {
        expect(isValidCatalogRef('hammer-strength')).toBe(false);
        expect(isValidCatalogRef('hammer-strength/plate-loaded')).toBe(false);
        expect(isValidCatalogRef('hammer-strength/plate-loaded/iso/bench')).toBe(false);
    });

    it('rejects refs with empty segments', () => {
        expect(isValidCatalogRef('//')).toBe(false);
        expect(isValidCatalogRef('foo//bar')).toBe(false);
        expect(isValidCatalogRef('foo/bar/')).toBe(false);
    });

    it('rejects refs containing un-slugged segments', () => {
        expect(isValidCatalogRef('Hammer Strength/plate-loaded/bench-press')).toBe(false);
        expect(isValidCatalogRef('foo/Plate Loaded/bench')).toBe(false);
    });

    it('rejects non-string input', () => {
        expect(isValidCatalogRef(null)).toBe(false);
        expect(isValidCatalogRef(undefined)).toBe(false);
        expect(isValidCatalogRef(123)).toBe(false);
        expect(isValidCatalogRef('')).toBe(false);
    });
});

describe('resolveCatalogRef', () => {
    const catalog = augmentStaticCatalog([{
        brand: 'Hammer Strength',
        lines: [{
            name: 'Plate-Loaded',
            type: 'Plate-Loaded',
            machines: [
                { name: 'Iso-Lateral Bench Press', bodyPart: 'Chest' },
            ],
        }],
    }]);

    it('returns brand/line/machine when ref resolves', () => {
        const result = resolveCatalogRef('hammer-strength/plate-loaded/iso-lateral-bench-press', catalog);
        expect(result).not.toBeNull();
        expect(result.brand.name).toBe('Hammer Strength');
        expect(result.line.name).toBe('Plate-Loaded');
        expect(result.machine.name).toBe('Iso-Lateral Bench Press');
    });

    it('returns null when brand does not exist', () => {
        expect(resolveCatalogRef('unknown-brand/plate-loaded/iso-lateral-bench-press', catalog)).toBeNull();
    });

    it('returns null when line does not exist', () => {
        expect(resolveCatalogRef('hammer-strength/unknown-line/iso-lateral-bench-press', catalog)).toBeNull();
    });

    it('returns null when machine does not exist', () => {
        expect(resolveCatalogRef('hammer-strength/plate-loaded/unknown-machine', catalog)).toBeNull();
    });

    it('returns null for malformed ref', () => {
        expect(resolveCatalogRef('not-a-ref', catalog)).toBeNull();
        expect(resolveCatalogRef('', catalog)).toBeNull();
        expect(resolveCatalogRef(null, catalog)).toBeNull();
    });

    it('returns null when catalog is missing', () => {
        expect(resolveCatalogRef('hammer-strength/plate-loaded/iso-lateral-bench-press', null)).toBeNull();
        expect(resolveCatalogRef('hammer-strength/plate-loaded/iso-lateral-bench-press', undefined)).toBeNull();
    });
});

describe('buildCatalogRef', () => {
    it('builds a ref from three name strings', () => {
        expect(buildCatalogRef('Hammer Strength', 'Plate-Loaded', 'Iso-Lateral Bench Press'))
            .toBe('hammer-strength/plate-loaded/iso-lateral-bench-press');
    });

    it('returns null if any argument is missing', () => {
        expect(buildCatalogRef('', 'Plate-Loaded', 'Bench')).toBeNull();
        expect(buildCatalogRef('Hammer', null, 'Bench')).toBeNull();
        expect(buildCatalogRef('Hammer', 'Plate', undefined)).toBeNull();
    });

    it('produces refs that round-trip through resolveCatalogRef', () => {
        const catalog = augmentStaticCatalog([{
            brand: 'Test Brand',
            lines: [{ name: 'Test Line', type: 'Machine', machines: [{ name: 'Test Machine', bodyPart: 'Chest' }] }],
        }]);
        const ref = buildCatalogRef('Test Brand', 'Test Line', 'Test Machine');
        const resolved = resolveCatalogRef(ref, catalog);
        expect(resolved.machine.name).toBe('Test Machine');
    });
});
