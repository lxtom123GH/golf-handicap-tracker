import { describe, it, expect } from 'vitest';
import { classifyCurve, missPatternFrom, SHAPE_THRESHOLDS } from '../../src/shot-shape.js';

// Curves are metres in the hole frame: x right, y toward the hole.
const straight = (n = 11) => Array.from({ length: n }, (_, i) => [0, i * 10]);
const bowed = (bend, n = 11) => Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    // sine bow peaking at `bend` metres at mid-carry
    return [bend * Math.sin(Math.PI * t), t * 80];
});

describe('classifyCurve', () => {
    it('straight up the axis: Straight / Straight / carry, On Target vs same intended', () => {
        const c = classifyCurve(straight(), { intended: straight() });
        expect(c.startLine).toBe('Straight');
        expect(c.shape).toBe('Straight');
        expect(c.carryM).toBe(100);
        expect(c.startAngleDeg).toBe(0);
        expect(c.bendM).toBe(0);
        expect(c.finishOffset).toEqual({ longM: 0, rightM: 0 });
        expect(missPatternFrom(c.finishOffset)).toBe('On Target');
    });

    it('accepts {x,y} objects and [[x,y]] pairs alike', () => {
        const obj = straight().map(([x, y]) => ({ x, y }));
        expect(classifyCurve(obj).carryM).toBe(100);
        expect(classifyCurve(straight()).carryM).toBe(100);
    });

    it('6 m right bow → Fade, positive bend', () => {
        const c = classifyCurve(bowed(6));
        expect(c.shape).toBe('Fade');
        expect(c.bendM).toBeGreaterThan(0);
        expect(c.bendM).toBeCloseTo(6, 1);
    });

    it('14 m left bow → Hook, negative bend', () => {
        const c = classifyCurve(bowed(-14));
        expect(c.shape).toBe('Hook');
        expect(c.bendM).toBeLessThan(0);
        expect(c.bendM).toBeCloseTo(-14, 1);
    });

    it('start 8° left → Left start line, negative angle', () => {
        const a = 8 * Math.PI / 180;
        const pts = [[0, 0], [-10 * Math.tan(a), 10], [-20 * Math.tan(a), 20], [-30 * Math.tan(a), 30], [0, 100]];
        const c = classifyCurve(pts);
        expect(c.startAngleDeg).toBeLessThan(-SHAPE_THRESHOLDS.startAngleDeg);
        expect(c.startAngleDeg).toBeCloseTo(-8, 0);
        expect(c.startLine).toBe('Left');
    });

    it('fewer than 2 points → all null', () => {
        expect(classifyCurve([])).toEqual({
            startLine: null, shape: null, carryM: null, startAngleDeg: null, bendM: null, finishOffset: null,
        });
        expect(classifyCurve([[5, 5]])).toEqual({
            startLine: null, shape: null, carryM: null, startAngleDeg: null, bendM: null, finishOffset: null,
        });
    });

    it('chord under 15 m → all null even with an intended curve', () => {
        const c = classifyCurve([[0, 0], [1, 5], [0, 10]], { intended: straight() });
        expect(c.startLine).toBeNull();
        expect(c.shape).toBeNull();
        expect(c.carryM).toBeNull();
        expect(c.finishOffset).toBeNull();
    });

    it('finish 25 m long and 12 m right → Long Right', () => {
        const intended = straight();
        const actual = straight().map(([x, y]) => [x + 12, y + 25]);
        const c = classifyCurve(actual, { intended });
        expect(c.finishOffset).toEqual({ longM: 25, rightM: 12 });
        expect(missPatternFrom(c.finishOffset)).toBe('Long Right');
    });

    it('finishOffset is null when intended has fewer than 2 points', () => {
        const c = classifyCurve(straight(), { intended: [[0, 0]] });
        expect(c.carryM).toBe(100);
        expect(c.finishOffset).toBeNull();
        expect(missPatternFrom(null)).toBeNull();
    });

    it('bend boundary ±0.1: 3 m is Straight, 3.1 Fade; -3 Straight, -3.1 Draw', () => {
        expect(classifyCurve(bowed(3)).shape).toBe('Straight');
        expect(classifyCurve(bowed(3.1)).shape).toBe('Fade');
        expect(classifyCurve(bowed(-3)).shape).toBe('Straight');
        expect(classifyCurve(bowed(-3.1)).shape).toBe('Draw');
    });

    it('bend boundary ±0.1: 10 m Fade, 10.1 Slice; -10 Draw, -10.1 Hook', () => {
        expect(classifyCurve(bowed(10)).shape).toBe('Fade');
        expect(classifyCurve(bowed(10.1)).shape).toBe('Slice');
        expect(classifyCurve(bowed(-10)).shape).toBe('Draw');
        expect(classifyCurve(bowed(-10.1)).shape).toBe('Hook');
    });

    it('start-angle boundary ±0.1: -4.1° Left, -3.9° Straight, +4.1° Right', () => {
        const curve = (deg) => {
            const a = Math.abs(deg) * Math.PI / 180;
            const sign = deg < 0 ? -1 : 1;
            return [[0, 0], [sign * 20 * Math.sin(a), 20 * Math.cos(a)],
                [sign * 40 * Math.sin(a), 40 * Math.cos(a)], [0, 100]];
        };
        expect(classifyCurve(curve(-4.1)).startLine).toBe('Left');
        expect(classifyCurve(curve(-3.9)).startLine).toBe('Straight');
        expect(classifyCurve(curve(4.1)).startLine).toBe('Right');
    });

    it('miss boundary ±0.1: 10.1 long is Long, 9.9 On Target; lateral composes', () => {
        expect(missPatternFrom({ longM: 10.1, rightM: 0 })).toBe('Long');
        expect(missPatternFrom({ longM: 9.9, rightM: 0 })).toBe('On Target');
        expect(missPatternFrom({ longM: -10.1, rightM: 0 })).toBe('Short');
        expect(missPatternFrom({ longM: 0, rightM: 10.1 })).toBe('Right');
        expect(missPatternFrom({ longM: 0, rightM: -10.1 })).toBe('Left');
        expect(missPatternFrom({ longM: -12, rightM: -12 })).toBe('Short Left');
        expect(missPatternFrom({ longM: 12, rightM: 12 })).toBe('Long Right');
    });
});

describe('classifyCurve — endpointOnly (S9: flight unseen)', () => {
    const straight = [[0, 0], [0, 30], [0, 60]];
    const intended = [[0, 0], [0, 60]];

    it('returns nulls for shape/startLine but keeps carryM and finishOffset', () => {
        const d = classifyCurve([[0, 0], [6, 30], [6, 60]], { intended, endpointOnly: true });
        expect(d.startLine).toBeNull();
        expect(d.shape).toBeNull();
        expect(d.startAngleDeg).toBeNull();
        expect(d.bendM).toBeNull();
        expect(d.carryM).toBe(60);
        expect(d.finishOffset).toEqual({ longM: 0, rightM: 6 });
    });

    it('the same curve WITHOUT the flag still classifies fully (no behaviour change)', () => {
        const d = classifyCurve([[0, 0], [6, 30], [6, 60]], { intended });
        expect(d.startLine).not.toBeNull();
        expect(d.shape).not.toBeNull();
        expect(d.carryM).toBe(60);
    });

    it('missPatternFrom still prefills from an endpoint-only finish offset', () => {
        const d = classifyCurve([[0, 0], [0, 40]], { intended: [[0, 0], [0, 60]], endpointOnly: true });
        expect(d.carryM).toBe(40);
        expect(missPatternFrom(d.finishOffset)).toBe('Short');
    });

    it('a too-short endpoint pair still returns nulls (min-chord guard holds)', () => {
        const d = classifyCurve([[0, 0], [2, 5]], { intended, endpointOnly: true });
        expect(d.carryM).toBeNull();
        expect(d.finishOffset).toBeNull();
    });
});
