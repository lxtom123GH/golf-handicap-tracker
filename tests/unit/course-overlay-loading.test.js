import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

describe('course overlay coordinate boundary', () => {
    const valid = { tee: { lat: 0, lon: 0 }, green: { centre: { lat: 0.003, lon: 0 } } };

    it.each([
        {},
        { green: valid.green },
        { tee: valid.tee, green: {} },
        { tee: valid.tee, green: { centre: { lat: null, lon: 0 } } },
        { tee: { lat: '0', lon: 0 }, green: valid.green },
        { tee: { lat: 0, lon: Infinity }, green: valid.green },
    ])('treats an unusable hole as unmapped while retaining its valid neighbor: %j', async invalid => {
        vi.resetModules();
        const source = { holes: { 1: invalid, 2: valid }, attributions: ['Synthetic fixture'] };
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => source })));
        const { loadCourseOverlay } = await import('../../src/hole-overlay.js');

        const loaded = await loadCourseOverlay('ashgrove');
        expect(loaded).toEqual({ holes: { 2: valid }, attributions: ['Synthetic fixture'] });
        expect(source.holes[1]).toBe(invalid); // Filtering must not rewrite the source data.
        expect(await loadCourseOverlay('ashgrove')).toBe(loaded);
    });
});
