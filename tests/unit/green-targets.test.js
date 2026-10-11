import { describe, it, expect } from 'vitest';
import { fromFrame, toFrame } from '../../src/geo.js';
import { greenTargetsFromPlayer } from '../../src/green-targets.js';

const centre = [-27.4, 152.9];
const frame = { origin: centre, bearing: 0 };
const ll = xy => fromFrame(frame, xy);
const fixed = { front: ll([0, -20]), back: ll([0, 20]) };
const polygon = (points = [[-10, -20], [10, -20], [10, 20], [-10, 20], [-10, -20]]) => ({
    type: 'FeatureCollection', features: [{ properties: { golf: 'green' },
        geometry: { type: 'Polygon', coordinates: [points.map(p => ll(p).reverse())] } }]
});
const targets = (xy, features = polygon(), c = centre) => greenTargetsFromPlayer(ll(xy), c, features, fixed);

describe('front/back along the player → centre ray', () => {
    it.each([
        ['6 o’clock', [0, -100], [0, -20], [0, 20]],
        ['4 o’clock', [80, -60], [10, -7.5], [-10, 7.5]],
        ['9 o’clock', [-100, 0], [-10, 0], [10, 0]],
    ])('%s intersects edges rather than fairway-axis landmarks', (_, player, front, back) => {
        const got = targets(player);
        expect(got.mode).toBe('from you');
        for (const [key, expected] of [['front', front], ['back', back]]) {
            const xy = toFrame(frame, got[key]);
            expect(xy[0]).toBeCloseTo(expected[0], 5);
            expect(xy[1]).toBeCloseTo(expected[1], 5);
        }
    });

    it('on the green gives front zero and back at the forward exit', () => {
        const player = ll([0, -5]);
        expect(targets([0, -5]).front).toEqual(player);
        expect(toFrame(frame, targets([0, -5]).back)[1]).toBeCloseTo(20, 5);
    });

    it('handles an edge, a vertex hit, repeated vertices and unclosed rings', () => {
        expect(toFrame(frame, targets([0, -20]).front)[1]).toBeCloseTo(-20, 5);
        expect(toFrame(frame, targets([50, -100]).back)[0]).toBeCloseTo(-10, 5);
        const ring = [[-10, -20], [10, -20], [10, -20], [10, 20], [-10, 20]];
        expect(targets([0, -100], polygon(ring)).mode).toBe('from you');
    });

    it.each([null, {}, { features: [] }, polygon([]), polygon([[0, 0], [0, 1], [0, 2]]),
        polygon([[0, 0], [10, 0], [NaN, 20]])])('falls back to the exact fixed point references for missing/degenerate polygons: %j', features => {
        const got = targets([0, -100], features);
        expect(got).toEqual({ ...fixed, mode: 'fixed' });
        expect(got.front).toBe(fixed.front);
        expect(got.back).toBe(fixed.back);
    });

    it('falls back when the ray is undefined, centre is outside, or coordinates are invalid', () => {
        for (const [player, c] of [[centre, centre], [ll([0, -100]), ll([100, 100])],
            [[NaN, 0], centre], [centre, [91, 0]], [null, centre]]) {
            expect(greenTargetsFromPlayer(player, c, polygon(), fixed)).toEqual({ ...fixed, mode: 'fixed' });
        }
        expect(greenTargetsFromPlayer(null, null, null, { front: null, back: null }))
            .toEqual({ front: null, back: null, mode: 'fixed' });
    });
});
