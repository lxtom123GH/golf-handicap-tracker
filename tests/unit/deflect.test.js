// ==========================================================================
// deflect.test.js — S12 Part D2: the deflection marker's classification
// (pure — classifyCurve with deflectAt).
// ==========================================================================

import { describe, it, expect } from 'vitest';
import { classifyCurve } from '../../src/shot-shape.js';

// The spec's case: a shot that draws (bends left) for 30 m, then hits
// something and kicks 90° right to the true finish. The pre-kick arc is
// x(y) = 0.0444y² − 1.6y: through (0,0), bulging ~9.7 m left of its chord
// at (−14,15), ending at (−8,30) — inside classifyCurve's Draw band.
function drawThenKick() {
    const pts = [];
    for (let y = 0; y <= 30; y += 5) {
        pts.push([0.0444 * y * y - 1.6 * y, y]);
    }
    // The kick: due right from (−8,30) — the ball finishes at (18, 30).
    pts.push([18, 30]);
    return pts; // 8 points; the deflection point (−8,30) is index 6
}

describe('S12 D2: classifyCurve honours deflectAt', () => {
    it('a draw that kicks 90° right at k classifies as Draw, not Slice/Hook', () => {
        const pts = drawThenKick();
        const k = 6; // the deflection point (−8,30)
        const deflected = classifyCurve(pts, { deflectAt: k });
        expect(deflected.shape).toBe('Draw');
        expect(deflected.bendM).toBeLessThan(0); // left bend — the pre-kick flight

        // Sanity: the same curve WITHOUT the marker is dominated by the kick.
        const raw = classifyCurve(pts);
        expect(raw.shape).not.toBe('Draw');
    });

    it('carryM and finishOffset still use the true end', () => {
        const pts = drawThenKick();
        const k = 6;
        const deflected = classifyCurve(pts, {
            deflectAt: k,
            intended: [[0, 0], [0, 34]],
        });
        // True carry: chord (0,0)→(18,30) ≈ 34.99 → 35 m, not the 30 m flight.
        expect(deflected.carryM).toBe(35);
        // Offset vs the intended end (0,34): +18 right, −4 long.
        expect(deflected.finishOffset.rightM).toBeCloseTo(18);
        expect(deflected.finishOffset.longM).toBeCloseTo(-4);
    });

    it('an out-of-range deflectAt is ignored (classifies on the full curve)', () => {
        const pts = drawThenKick();
        const full = classifyCurve(pts);
        const ignored = classifyCurve(pts, { deflectAt: 999 });
        expect(ignored.shape).toBe(full.shape);
        const zero = classifyCurve(pts, { deflectAt: 0 });
        expect(zero.shape).toBe(full.shape);
    });
});
