// ==========================================================================
// hole-overlay.test.js — the hole frame, feature assignment and curve storage
// ==========================================================================
//
// Pure geometry (src/geo.js) plus the parts of src/hole-overlay.js that do
// not need a canvas. The Ashgrove hole 1 numbers come from OSM via
// scripts/fetch-osm-holes.mjs (public/courses/ashgrove.json).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    distanceM, bearingDeg, makeFrame, toFrame, fromFrame, pointInRing,
    distanceToLineM, assignFeaturesToHole, greenFrontBack, bboxWGS84,
} from '../../src/geo.js';
import { resample, curveCarryM, courseSlugFor, simplifyRDP, mercatorToLonLat } from '../../src/hole-overlay.js';

describe('overlay: swipe simplification (RDP)', () => {
    it('a noisy straight swipe collapses to its two ends', () => {
        const pts = Array.from({ length: 60 }, (_, i) => [Math.sin(i) * 0.4, i * 5]);
        expect(simplifyRDP(pts, 1.5)).toEqual([pts[0], pts[59]]);
    });
    it('a fade keeps its bend and an S-shape keeps both', () => {
        const fade = Array.from({ length: 60 }, (_, i) => { const t = i / 59; return [40 * t * t, 250 * t]; });
        const f = simplifyRDP(fade, 1.5);
        expect(f.length).toBeGreaterThanOrEqual(3);
        expect(f.length).toBeLessThanOrEqual(8);
        expect(f[0]).toEqual(fade[0]);
        expect(f[f.length - 1]).toEqual(fade[59]);
        const s = Array.from({ length: 80 }, (_, i) => { const t = i / 79; return [25 * Math.sin(t * 2 * Math.PI), 250 * t]; });
        const ss = simplifyRDP(s, 1.5);
        const xs = ss.map(p => p[0]);
        expect(Math.max(...xs)).toBeGreaterThan(20);
        expect(Math.min(...xs)).toBeLessThan(-20);
    });
    it('short inputs pass through', () => {
        expect(simplifyRDP([[0, 0]], 1)).toEqual([[0, 0]]);
        expect(simplifyRDP([[0, 0], [3, 4]], 1)).toEqual([[0, 0], [3, 4]]);
    });
});

const BRISBANE = [-27.4698, 153.0251];

describe('geo: frame maths', () => {
    it('distance and bearing agree with known values', () => {
        // 1 km due north of Brisbane
        const north = [BRISBANE[0] + 1000 / 111195, BRISBANE[1]];
        expect(distanceM(BRISBANE, north)).toBeCloseTo(1000, -1);
        expect(bearingDeg(BRISBANE, north)).toBeCloseTo(0, 0);
        const east = fromFrame({ origin: BRISBANE, bearing: 0 }, [500, 0]);
        expect(bearingDeg(BRISBANE, east)).toBeCloseTo(90, 0);
        expect(distanceM(BRISBANE, east)).toBeCloseTo(500, 0);
    });

    it('the green sits straight up the y axis of its hole frame, whatever the compass heading', () => {
        for (const bearing of [0, 47, 135, 200, 308.4, 359]) {
            const tee = BRISBANE;
            const green = fromFrame({ origin: tee, bearing }, [0, 380]);
            const frame = makeFrame(tee, green);
            expect(frame.bearing).toBeCloseTo(bearing, 2);
            const [x, y] = toFrame(frame, green);
            expect(x).toBeCloseTo(0, 1);
            expect(y).toBeCloseTo(380, 1);
        }
    });

    it('toFrame and fromFrame round-trip to centimetres', () => {
        const frame = { origin: BRISBANE, bearing: 123.4 };
        for (const p of [[12.3, 45.6], [-80, 310], [0, 0], [55, -20]]) {
            const back = toFrame(frame, fromFrame(frame, p));
            expect(back[0]).toBeCloseTo(p[0], 2);
            expect(back[1]).toBeCloseTo(p[1], 2);
        }
    });

    it('point-in-ring and distance-to-line behave on a square', () => {
        const f = { origin: BRISBANE, bearing: 0 };
        const sq = [[0, 0], [0, 40], [40, 40], [40, 0]].map(p => fromFrame(f, p));
        expect(pointInRing(fromFrame(f, [20, 20]), sq)).toBe(true);
        expect(pointInRing(fromFrame(f, [60, 20]), sq)).toBe(false);
        const line = [fromFrame(f, [0, 0]), fromFrame(f, [0, 300])];
        expect(distanceToLineM(fromFrame(f, [25, 150]), line)).toBeCloseTo(25, 0);
        expect(distanceToLineM(fromFrame(f, [0, 350]), line)).toBeCloseTo(50, 0);
    });
});

describe('geo: assigning OSM features to a hole', () => {
    const f = { origin: BRISBANE, bearing: 0 };
    const ring = (cx, cy, r = 10) => [[cx - r, cy - r], [cx - r, cy + r], [cx + r, cy + r], [cx + r, cy - r]].map(p => fromFrame(f, p));
    const hole = { line: [fromFrame(f, [0, 0]), fromFrame(f, [0, 360])] };
    const features = [
        { golf: 'tee', ring: ring(0, 0), id: 'my-tee' },
        { golf: 'tee', ring: ring(150, 0), id: 'other-tee' },
        { golf: 'fairway', ring: ring(5, 180, 20), id: 'my-fairway' },
        { golf: 'fairway', ring: ring(120, 180, 20), id: 'other-fairway' },
        { golf: 'bunker', ring: ring(30, 330, 5), id: 'greenside-bunker' },
        { golf: 'green', ring: ring(0, 360, 15), id: 'my-green' },
        { golf: 'green', ring: ring(90, 360, 15), id: 'neighbour-green' },
    ];
    it('keeps the tee at the start, the corridor features and the green at the end', () => {
        const got = assignFeaturesToHole(hole, features).map(x => x.id).sort();
        expect(got).toEqual(['greenside-bunker', 'my-fairway', 'my-green', 'my-tee']);
    });
    it('green front/back are the ring vertices nearest and farthest from the tee', () => {
        const frame = makeFrame(hole.line[0], fromFrame(f, [0, 360]));
        const { front, back } = greenFrontBack(frame, ring(0, 360, 15));
        expect(toFrame(frame, front)[1]).toBeCloseTo(345, 0);
        expect(toFrame(frame, back)[1]).toBeCloseTo(375, 0);
    });
    it('bbox pads by metres', () => {
        const [minLon, minLat, maxLon, maxLat] = bboxWGS84(hole.line, 25);
        expect(distanceM([minLat, BRISBANE[1]], BRISBANE)).toBeCloseTo(25, 0);
        expect(distanceM([maxLat, BRISBANE[1]], fromFrame(f, [0, 360]))).toBeCloseTo(25, 0);
        expect(maxLon).toBeGreaterThan(minLon);
    });
});

describe('overlay data as shipped', () => {
    const load = (slug) => JSON.parse(readFileSync(`public/courses/${slug}.json`, 'utf8'));
    it('Ashgrove and Redcliffe carry 18 holes with a tee, a green and polygons each', () => {
        for (const slug of ['ashgrove', 'redcliffe']) {
            const c = load(slug);
            const holes = Object.values(c.holes);
            expect(holes).toHaveLength(18);
            for (const h of holes) {
                expect(h.tee.lat).toBeLessThan(0);
                expect(h.green.centre.lat).toBeLessThan(0);
                expect(h.features.features.length).toBeGreaterThan(0);
                const len = distanceM([h.tee.lat, h.tee.lon], [h.green.centre.lat, h.green.centre.lon]);
                expect(len).toBeGreaterThan(80);
                expect(len).toBeLessThan(600);
            }
            expect(c.source.attribution).toMatch(/OpenStreetMap/);
        }
    });
    it('Keperra: OSM hole lines are physical holes 10-27, greens from the app GPS table, no polygons yet', () => {
        // OSM numbers Keperra's mapped holes 1-18 but they are the North/West
        // physical holes 10-27; the Old front nine (1-9) is not in OSM at all.
        const c = load('keperra');
        const nums = Object.keys(c.holes).map(Number).sort((a, b) => a - b);
        expect(nums).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]);
        const holes = Object.values(c.holes);
        expect(holes.every(h => h.green.source === 'app-gps')).toBe(true);
        expect(holes.every(h => h.line.length >= 2)).toBe(true);
        // Trace run 3b (PR #154, 2026-09-16): every back-nine hole has a real
        // traced green polygon, and every one except 23 (centreline ended
        // 209 m short) a fairwayLine centreline band. No Point landmarks are
        // merged yet (the renderer has no use for them).
        for (const h of holes) {
            const kinds = h.features.features.map(f => f.properties.golf);
            expect(kinds).toEqual(['green']);
            expect(h.features.features[0].properties.source).toBe('qld-lsp-trace');
            expect(h.features.features[0].geometry.type).toBe('Polygon');
            if (h.number === 23) expect(h.fairwayLine).toBeUndefined();
            else {
                expect(h.fairwayLine.length).toBeGreaterThanOrEqual(5);
                expect(h.fairwayLine.every(p => p.widthM >= 18 && p.widthM <= 60)).toBe(true);
            }
        }
        expect(c.attributions.some(a => /State of Queensland/.test(a))).toBe(true);
    });
    it('course names in COURSE_DATA resolve to a slug', () => {
        expect(courseSlugFor('Keperra – Old Course (9 holes)')).toBe('keperra');
        expect(courseSlugFor('Ashgrove GC')).toBe('ashgrove');
        expect(courseSlugFor('Redcliffe GC')).toBe('redcliffe');
        expect(courseSlugFor('Virginia GC - Championship (1-18)')).toBe('virginia');
        expect(courseSlugFor('Custom Course')).toBeNull();
    });
});

describe('overlay: curve storage', () => {
    it('resample keeps the ends, caps the count and rounds to 0.1 m', () => {
        const raw = Array.from({ length: 500 }, (_, i) => [i * 0.123456, i * 0.5]);
        const out = resample(raw, 48);
        expect(out.length).toBeLessThanOrEqual(49);
        expect(out[0]).toEqual([0, 0]);
        expect(out[out.length - 1]).toEqual([Math.round(499 * 0.123456 * 10) / 10, 249.5]);
        expect(out.every(([x, y]) => x === Math.round(x * 10) / 10 && y === Math.round(y * 10) / 10)).toBe(true);
        expect(resample([[1.23, 4.56], [7.89, 0.12]], 48)).toEqual([[1.2, 4.6], [7.9, 0.1]]);
    });
    it('carry is the straight-line distance from first to last point', () => {
        expect(curveCarryM([[0, 0], [10, 20], [30, 40]])).toBe(50);
        expect(curveCarryM(null)).toBeNull();
        expect(curveCarryM([[1, 1]])).toBeNull();
    });
});

describe('S6 Part 1: imagery extent mapping', () => {
    const keperra = JSON.parse(readFileSync('public/courses/keperra.json', 'utf8'));

    it('inverse-mercators the EPSG:3857 origin to (0, 0)', () => {
        const [lon, lat] = mercatorToLonLat(0, 0);
        expect(lon).toBeCloseTo(0, 6);
        expect(lat).toBeCloseTo(0, 6);
    });

    it('round-trips a real coordinate against the forward Mercator the build script uses', () => {
        // Hole 10's tee forwarded by the script's formulas (EPSG:3857 sphere,
        // R = 6378137) must inverse back to the same lat/lon.
        const hole = keperra.holes['10'];
        const R = 6378137;
        const mx = (hole.tee.lon / 180) * Math.PI * R;
        const my = Math.log(Math.tan(Math.PI / 4 + (hole.tee.lat * Math.PI) / 360)) * R;
        const [backLon, backLat] = mercatorToLonLat(mx, my);
        expect(backLon).toBeCloseTo(hole.tee.lon, 6);
        expect(backLat).toBeCloseTo(hole.tee.lat, 6);
    });

    it('puts the tee and the green inside every shipped imagery extent', () => {
        const holes = Object.entries(keperra.holes).filter(([, h]) => h.imagery);
        // The script ran for Keperra 10-27 — every hole must have shipped.
        expect(holes.length).toBe(Object.keys(keperra.holes).length);
        for (const [n, hole] of holes) {
            const [xmin, ymin, xmax, ymax] = hole.imagery.extent3857;
            const frame = makeFrame([hole.tee.lat, hole.tee.lon], [hole.green.centre.lat, hole.green.centre.lon]);
            // Image pixel (0,0) is top-left = the north-west corner.
            const quad = [
                mercatorToLonLat(xmin, ymax),
                mercatorToLonLat(xmax, ymax),
                mercatorToLonLat(xmax, ymin),
                mercatorToLonLat(xmin, ymin),
            ].map(([lon, lat]) => toFrame(frame, [lat, lon]));
            // The tee is the frame origin; the green centre sits on +y.
            expect(pointInRing([0, 0], quad), `hole ${n}: tee inside its imagery extent`).toBe(true);
            expect(
                pointInRing(toFrame(frame, [hole.green.centre.lat, hole.green.centre.lon]), quad),
                `hole ${n}: green inside its imagery extent`,
            ).toBe(true);
        }
    });
});
