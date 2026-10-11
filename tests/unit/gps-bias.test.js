// @vitest-environment node
//
// S5 Part A — the pure GPS bias + snap module, against Ashgrove hole 1's
// REAL course file (the polygons the overlay actually draws).
//
// The acceptance (issue #180 / the brief):
//   - estimateBias: 5 pairs offset by (+8 m, −3 m) plus noise → within 1 m;
//     1 pair → null; applyBias round-trips;
//   - snapToPlayable: inside → unchanged; 5 m outside the buffered edge →
//     snapped to it; 60 m outside → unchanged with snapped=false;
//   - the playable union built from Ashgrove hole 1's real file.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { estimateBias, applyBias, snapToPlayable, buildPlayable } from '../../src/gps-bias.js';
import { makeFrame, toFrame } from '../../src/geo.js';

const hole = JSON.parse(readFileSync(resolve('public/courses/ashgrove.json'), 'utf8')).holes['1'];
const frame = makeFrame([hole.tee.lat, hole.tee.lon], [hole.green.centre.lat, hole.green.centre.lon]);
const FRAME = (p) => toFrame(frame, [p.lat, p.lon]);

// Deterministic noise: no Math.random — the assertions need reproducibility.
const NOISE_M = [0.9, -0.6, 1.3, -1.1, 0.4];

function offsetFix(truth, northM, eastM) {
    // +north → +lat; +east → +lon at this latitude.
    const lat = truth.lat + northM / 111320;
    const lon = truth.lon + eastM / (111320 * Math.cos((truth.lat * Math.PI) / 180));
    return { lat, lon, accuracyM: 5 };
}

describe('estimateBias', () => {
    it('recovers a (+8 m, −3 m) offset from 5 noisy pairs to within 1 m', () => {
        const truth = hole.green.centre;
        // fix = truth + (+8 m north, −3 m east) + deterministic noise.
        const samples = NOISE_M.map((n, i) => ({
            fix: offsetFix(truth, 8 + n * Math.cos(i), -3 + n * Math.sin(i * 2)),
            truth,
        }));
        const bias = estimateBias(samples);
        expect(bias).not.toBeNull();
        expect(bias.n).toBe(5);
        const northM = bias.dLat * 111320;
        const eastM = -bias.dLon * 111320 * Math.cos((truth.lat * Math.PI) / 180);
        // The median kills the noise: the recovered offset is within 1 m
        // of the true (+8, −3).
        expect(Math.abs(northM - 8)).toBeLessThan(1);
        expect(Math.abs(eastM - 3)).toBeLessThan(1);
        // The spread AFTER correction is small (the noise, ~±1 m).
        expect(bias.rmsM).toBeLessThan(1.5);
    });

    it('returns null for a single pair (nothing to mediate)', () => {
        const truth = hole.green.centre;
        expect(estimateBias([{ fix: offsetFix(truth, 8, -3), truth }])).toBeNull();
    });

    it('returns null for garbage input', () => {
        expect(estimateBias([])).toBeNull();
        expect(estimateBias(undefined)).toBeNull();
    });

    it('uses only the LAST 5 pairs', () => {
        const truth = hole.green.centre;
        const samples = [];
        // Five junk pairs far off, then five consistent (+8, −3) pairs: the
        // estimate must reflect the last five.
        for (let i = 0; i < 5; i++) samples.push({ fix: offsetFix(truth, 80, -30), truth });
        for (let i = 0; i < 5; i++) samples.push({ fix: offsetFix(truth, 8, -3), truth });
        const bias = estimateBias(samples);
        expect(bias.n).toBe(5);
        const northM = bias.dLat * 111320;
        expect(Math.abs(northM - 8)).toBeLessThan(1);
    });
});

describe('applyBias', () => {
    it('round-trips: correcting an offset fix lands back on the truth', () => {
        const truth = hole.green.centre;
        const fix = offsetFix(truth, 8, -3);
        const bias = { dLat: fix.lat - truth.lat, dLon: fix.lon - truth.lon };
        const corrected = applyBias(fix, bias);
        expect(Math.abs((corrected.lat - truth.lat) * 111320)).toBeLessThan(0.001);
        expect(Math.abs((corrected.lon - truth.lon) * 111320 * Math.cos((truth.lat * Math.PI) / 180))).toBeLessThan(0.001);
    });

    it('passes through safely without a bias', () => {
        const fix = { lat: -27.4, lon: 152.9 };
        expect(applyBias(fix, null)).toEqual({ lat: -27.4, lon: 152.9 });
        expect(applyBias(null, { dLat: 1, dLon: 1 })).toBeNull();
    });
});

describe('snapToPlayable (Ashgrove hole 1 real geometry)', () => {
    const playable = buildPlayable(hole);
    expect(playable.polys.length).toBeGreaterThan(0); // fairway + green + tees exist

    it('a fix inside the green is unchanged', () => {
        const xy = FRAME(hole.green.centre);
        const r = snapToPlayable(xy, hole);
        expect(r.snapped).toBe(false);
        expect(r.distM).toBe(0);
        expect(r.xy[0]).toBeCloseTo(xy[0], 6);
        expect(r.xy[1]).toBeCloseTo(xy[1], 6);
    });

    it('a fix 5 m outside the buffered edge snaps to it (~5 m move)', () => {
        // Take a green-polygon vertex, walk OUTWARD 13 m: 5 m beyond the
        // 8 m buffer. The snap should move it ~5 m back to the edge.
        const green = playable.polys.find((ring) => {
            // identify the green ring: contains the green centre
            const c = FRAME(hole.green.centre);
            return Math.min(...ring.map((pt) => Math.hypot(pt[0] - c[0], pt[1] - c[1]))) < 10;
        });
        expect(green).toBeTruthy();
        const v = green[0];
        const next = green[1];
        // Edge normal (outward = away from the ring's centroid).
        const cx = green.reduce((a, p) => a + p[0], 0) / green.length;
        const cy = green.reduce((a, p) => a + p[1], 0) / green.length;
        let ex = next[0] - v[0], ey = next[1] - v[1];
        const el = Math.hypot(ex, ey);
        ex /= el; ey /= el;
        let nx = -ey, ny = ex;
        if ((v[0] + nx) - cx < 0) { nx = -nx; ny = -ny; } // point away from centroid
        const FAR = 13;
        const outside = [v[0] + nx * FAR, v[1] + ny * FAR];
        const r = snapToPlayable(outside, hole);
        expect(r.snapped).toBe(true);
        expect(r.distM).toBeGreaterThan(3);
        expect(r.distM).toBeLessThan(7); // ~5 m back to the buffered edge
        // The snapped point sits ON the buffered edge: ~8 m from the raw edge.
        const backToEdge = Math.hypot(r.xy[0] - v[0], r.xy[1] - v[1]);
        expect(Math.abs(backToEdge - 8)).toBeLessThan(2.5);
    });

    it('a fix 60 m outside is left alone (snapped=false, do not lie)', () => {
        // Deep in the trees: 60 m right of the fairway's mid-point.
        const mid = hole.line[Math.floor(hole.line.length / 2)];
        const midXY = FRAME(mid);
        const outside = [midXY[0] + 60, midXY[1]];
        const r = snapToPlayable(outside, hole);
        expect(r.snapped).toBe(false);
        expect(r.xy[0]).toBeCloseTo(outside[0], 6);
        expect(r.distM).toBeGreaterThan(40);
    });

    it('a fix just inside the buffer stays unchanged with a boundary distance', () => {
        const mid = hole.line[Math.floor(hole.line.length / 2)];
        const midXY = FRAME(mid);
        const r = snapToPlayable([midXY[0], midXY[1]], hole); // on the centreline: inside
        expect(r.snapped).toBe(false);
        expect(r.distM).toBe(0);
    });
});
