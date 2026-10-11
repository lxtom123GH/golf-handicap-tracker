// ==========================================================================
// gestures.test.js — S12 Part C: viewTransform round-trip (pure)
// ==========================================================================

import { describe, it, expect } from 'vitest';
import { viewTransform, createGestureTracker, clampGestureZoom } from '../../src/gestures.js';

describe('S12 C: viewTransform round-trips a point', () => {
    it('rotate 90° then un-rotate returns the input', () => {
        const t = viewTransform({ scale: 2, rotateRad: Math.PI / 2, centre: [100, 50] });
        const p = [130, 62];
        const back = t.inv(t.fwd(p));
        expect(back[0]).toBeCloseTo(p[0]);
        expect(back[1]).toBeCloseTo(p[1]);
    });
    it('scale and rotation compose; the centre is the fixed point', () => {
        const t = viewTransform({ scale: 3, rotateRad: -1.2, centre: [40, -9] });
        expect(t.fwd([40, -9])[0]).toBeCloseTo(40);
        expect(t.fwd([40, -9])[1]).toBeCloseTo(-9);
        const back = t.inv(t.fwd([10, 22]));
        expect(back[0]).toBeCloseTo(10);
        expect(back[1]).toBeCloseTo(22);
    });
    it('identity transform is the identity', () => {
        const t = viewTransform();
        expect(t.fwd([7, -3])).toEqual([7, -3]);
        expect(t.inv([7, -3])).toEqual([7, -3]);
    });
});

describe('S12 C: the gesture tracker derives pinch/pan/rotate deltas', () => {
    it('two pointers: scale, rotation and pan relative to the gesture start', () => {
        const g = createGestureTracker();
        g.down('a', [100, 100]);
        g.down('b', [200, 100]);   // dist 100, angle 0, mid [150, 100]
        const d = g.move('b', [300, 100]); // dist 200 → scale 2; angle 0; mid [200,100]
        expect(d.scale).toBeCloseTo(2);
        expect(d.rotateRad).toBeCloseTo(0);
        expect(d.panPx[0]).toBeCloseTo(50);
        expect(d.panPx[1]).toBeCloseTo(0);
    });
    it('returns the RAW pinch ratio — clamping is a caller job (review B1)', () => {
        const g = createGestureTracker();
        g.down('a', [0, 0]);
        g.down('b', [50, 0]);
        expect(g.move('b', [500, 0]).scale).toBe(10); // raw 10x, NOT capped here
        expect(g.move('b', [10, 0]).scale).toBeCloseTo(0.2); // pinch-in: < 1 survives
    });

    it('clampGestureZoom clamps the PRODUCT of start zoom and ratio', () => {
        // Review B1 unit cases: start at zoom 3, pinch to half → 1.5.
        expect(clampGestureZoom(3, 0.5)).toBeCloseTo(1.5);
        // Pinch-out from 3 caps at 4.
        expect(clampGestureZoom(3, 10)).toBe(4);
        // The floor holds too: can never go below 1x overall.
        expect(clampGestureZoom(1, 0.1)).toBe(1);
    });
    it('the gesture ends when fewer than two pointers remain', () => {
        const g = createGestureTracker();
        g.down('a', [0, 0]);
        g.down('b', [50, 0]);
        g.move('b', [60, 0]);
        g.up('b');
        expect(g.move('a', [70, 0])).toBeNull();
        // A fresh second pointer starts a NEW gesture (snapshot from now).
        g.down('c', [90, 0]);
        const d = g.move('c', [190, 0]);
        expect(d.scale).toBeCloseTo(6); // raw ratio of the NEW gesture (120/20)
    });
});
