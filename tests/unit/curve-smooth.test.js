// ==========================================================================
// curve-smooth.test.js — S12 Part D1: 5-sample moving average, Chaikin
// subdivision, and the smoothed storage pipeline (pure, no canvas).
// ==========================================================================

import { describe, it, expect } from 'vitest';
import { movingAverage5, chaikinSubdivide, smoothStoredCurve } from '../../src/hole-overlay.js';

// A jittery straight line: 40 samples along +y with ±0.3 m lateral noise,
// deterministic (a fixed seed-ish pattern, not Math.random).
function jitteryStraight(n = 40, span = 60) {
    const jitter = [0.3, -0.3, 0.15, -0.15, 0.25, -0.25, 0.1, -0.1, 0.3, -0.3];
    const pts = [];
    for (let i = 0; i < n; i++) {
        const y = (span * i) / (n - 1);
        pts.push([jitter[i % jitter.length], y]);
    }
    return pts;
}

// An S-curve: out to the right, back through the middle, out to the left —
// two real bends with small noise.
function sCurve(n = 50, span = 60, amp = 8) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const y = span * t;
        const x = amp * Math.sin(2 * Math.PI * t);
        pts.push([x + 0.05 * Math.sin(i * 7), y]);
    }
    return pts;
}

describe('S12 D1: movingAverage5 keeps endpoints, smooths the interior', () => {
    it('keeps the first and last samples exactly', () => {
        const raw = jitteryStraight();
        const out = movingAverage5(raw);
        expect(out[0]).toEqual(raw[0]);
        expect(out[out.length - 1]).toEqual(raw[raw.length - 1]);
        expect(out.length).toBe(raw.length);
    });
    it('flattens interior lateral jitter (endpoints kept by design)', () => {
        const raw = jitteryStraight();
        const smooth = movingAverage5(raw);
        // Interior only — the endpoints are deliberate placements, kept exact.
        const rawMax = Math.max(...raw.slice(1, -1).map(([x]) => Math.abs(x)));
        const smoothMax = Math.max(...smooth.slice(1, -1).map(([x]) => Math.abs(x)));
        expect(smoothMax).toBeLessThan(rawMax);
    });
});

describe('S12 D1: chaikinSubdivide smooths corners, keeps endpoints', () => {
    it('doubles interior points per round and keeps the endpoints', () => {
        const pts = [[0, 0], [10, 0], [10, 10]];
        const one = chaikinSubdivide(pts, 1);
        expect(one[0]).toEqual([0, 0]);
        expect(one[one.length - 1]).toEqual([10, 10]);
        expect(one.length).toBe(6); // (n-1) segments × 2 cut points + 2 endpoints
        const two = chaikinSubdivide(pts, 2);
        expect(two[0]).toEqual([0, 0]);
        expect(two[two.length - 1]).toEqual([10, 10]);
        expect(two.length).toBe(12);
    });
    it('is idempotent on a straight line (stays collinear)', () => {
        const line = [[0, 0], [5, 5]];
        const out = chaikinSubdivide(line, 2);
        for (const [x, y] of out) expect(x).toBeCloseTo(y);
    });
});

describe('S12 D1: the stored pipeline (ma5 → RDP → chaikin×2 → re-simplify → cap 48)', () => {
    it('a jittery straight line stores ≤ 4 points with max lateral deviation under 1 m', () => {
        const raw = jitteryStraight();
        const out = smoothStoredCurve(raw, 4 /* epsM like a 390px canvas */);
        expect(out.length).toBeLessThanOrEqual(4);
        // Deviation of every stored point from the true centre line (x=0):
        for (const [x] of out) expect(Math.abs(x)).toBeLessThan(1);
        // And the ends survive: start and finish y preserved.
        expect(out[0][1]).toBeCloseTo(0);
        expect(out[out.length - 1][1]).toBeCloseTo(60);
    });
    it('an S-curve keeps both bends', () => {
        const raw = sCurve();
        const out = smoothStoredCurve(raw, 4);
        expect(out.length).toBeGreaterThanOrEqual(6);
        // Both lobes present: a stored point near +amp and one near −amp.
        const xs = out.map(([x]) => x);
        expect(Math.max(...xs)).toBeGreaterThan(5);
        expect(Math.min(...xs)).toBeLessThan(-5);
    });
    it('caps at 48 points on a wild input', () => {
        const wild = [];
        for (let i = 0; i < 300; i++) wild.push([Math.sin(i * 1.7) * 20, i * 0.4]);
        const out = smoothStoredCurve(wild, 4);
        expect(out.length).toBeLessThanOrEqual(48);
    });
});
