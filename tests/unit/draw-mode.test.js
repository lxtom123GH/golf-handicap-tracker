// ==========================================================================
// draw-mode.test.js — S12 Part B: fitBounds + nearEdge (pure)
// ==========================================================================

import { describe, it, expect } from 'vitest';
import { fitBounds, nearEdge } from '../../src/hole-overlay.js';

describe('S12 B2: fitBounds — the auto-extend target', () => {
    it('pads each axis by 15% of its own span', () => {
        const b = fitBounds([[0, 0], [100, 200]], 0.15);
        expect(b.minX).toBeCloseTo(-15);
        expect(b.maxX).toBeCloseTo(115);
        expect(b.minY).toBeCloseTo(-30);
        expect(b.maxY).toBeCloseTo(230);
    });
    it('widens a degenerate extent to a 40 m minimum', () => {
        const b = fitBounds([[50, 300]], 0.15);
        // A 40 m box centred on the point, then padded 15% each way.
        expect(b.maxX - b.minX).toBeCloseTo(40 * 1.3);
        expect(b.maxY - b.minY).toBeCloseTo(40 * 1.3);
        expect(b.minX).toBeCloseTo(50 - 20 * 1.3);
    });
    it('ignores junk and returns null for nothing', () => {
        expect(fitBounds([])).toBeNull();
        expect(fitBounds([[NaN, 5]])).toBeNull();
    });
});

describe('S12 B2: nearEdge — the re-frame trigger', () => {
    it('fires within 24 px of any edge', () => {
        expect(nearEdge(10, 300, 375, 500)).toBe(true);   // left
        expect(nearEdge(187, 8, 375, 500)).toBe(true);    // top
        expect(nearEdge(360, 300, 375, 500)).toBe(true);  // right
        expect(nearEdge(187, 490, 375, 500)).toBe(true);  // bottom
    });
    it('stays quiet in the middle', () => {
        expect(nearEdge(187, 250, 375, 500)).toBe(false);
        expect(nearEdge(25, 300, 375, 500)).toBe(false); // exactly past the margin
    });
    it('a pointer dragged outside the element counts as at the edge', () => {
        expect(nearEdge(-5, 300, 375, 500)).toBe(true);
        expect(nearEdge(187, 520, 375, 500)).toBe(true);
    });
});
