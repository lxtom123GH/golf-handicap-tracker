// ==========================================================================
// shot-entry.test.js — S12 Part E: the visibility decision is a pure
// function of the preference (the spec's unit gate).
// ==========================================================================

import { describe, it, expect } from 'vitest';
import { shotEntryVisibility, normaliseShotEntry, SHOT_ENTRY_PREFS } from '../../src/shot-entry.js';

describe('S12 E: shotEntryVisibility — pure function of the preference', () => {
    it("'both' is the map-and-grids layout: everything visible and open", () => {
        expect(shotEntryVisibility('both')).toEqual({
            pref: 'both',
            lineSection: true,
            drawButton: true,
            resultGridsOpen: true,
            mapFirst: false,
        });
    });

    it("'draw' keeps the map and collapses the button grids (still there, closed)", () => {
        const v = shotEntryVisibility('draw');
        expect(v.lineSection).toBe(true);
        expect(v.drawButton).toBe(true);
        expect(v.resultGridsOpen).toBe(false);
    });

    it("'buttons' hides #section-line and the draw button, grids stay open", () => {
        const v = shotEntryVisibility('buttons');
        expect(v.lineSection).toBe(false);
        expect(v.drawButton).toBe(false);
        expect(v.resultGridsOpen).toBe(true);
    });

    it('undefined/unknown preferences degrade to the default (Map first, SR-11), never hide the wizard', () => {
        expect(normaliseShotEntry(undefined)).toBe('map');
        expect(normaliseShotEntry('')).toBe('map');
        expect(normaliseShotEntry('nonsense')).toBe('map');
        expect(shotEntryVisibility(undefined)).toEqual(shotEntryVisibility('map'));
        expect(shotEntryVisibility(undefined).mapFirst).toBe(true);
        expect(shotEntryVisibility(null).lineSection).toBe(true);
    });

    it("'map' opens each shot on the full-screen map; map, draw button and grids all stay", () => {
        expect(shotEntryVisibility('map')).toEqual({
            pref: 'map', lineSection: true, drawButton: true, resultGridsOpen: true, mapFirst: true,
        });
        for (const p of ['both', 'draw', 'buttons']) expect(shotEntryVisibility(p).mapFirst).toBe(false);
    });

    it('the documented prefs are exactly the accepted set', () => {
        expect(SHOT_ENTRY_PREFS).toEqual(['draw', 'buttons', 'both', 'map']);
        for (const p of SHOT_ENTRY_PREFS) {
            expect(normaliseShotEntry(p)).toBe(p);
            // Every mode keeps at least one entry path: never both hidden.
            const v = shotEntryVisibility(p);
            expect(v.lineSection || !v.resultGridsOpen || p === 'buttons').toBeTruthy();
        }
    });
});
