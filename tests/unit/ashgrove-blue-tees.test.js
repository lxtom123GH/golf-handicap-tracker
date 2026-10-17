// Ashgrove holes 13, 14 and 18: the OSM hole line starts at the White/Red
// tee, so the app read 145 / 419 / 238 m against Blue card lengths of
// 186 / 457 / 254 m. The tee points now sit on the Blue (back) tees from the
// aerial audit of 2026-10-17 (QLD 2022 orthophoto, Esri 2025, club map, club
// flyover). Distance = tee -> dogleg points -> green centre, i.e. how the
// hole plays; must be within 3 % of the Blue card length.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { distanceM } from '../../src/geo.js';
import { COURSE_DATA } from '../../src/course-data.js';

const course = JSON.parse(readFileSync('public/courses/ashgrove.json', 'utf8'));
const blue = COURSE_DATA['Ashgrove GC']['Blue (Men)'];
const ll = p => [p.lat, p.lon];

function playedLengthM(h) {
    const pts = [ll(h.tee), ...(h.dogleg || []).map(ll), ll(h.green.centre)];
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += distanceM(pts[i - 1], pts[i]);
    return m;
}

describe('Ashgrove Blue tees (13, 14, 18)', () => {
    for (const n of [13, 14, 18]) {
        it(`hole ${n}: tee to green centre within 3% of the Blue card`, () => {
            const h = course.holes[String(n)];
            const card = blue.lengths[n - 1];
            const m = playedLengthM(h);
            expect(Math.abs(m - card) / card).toBeLessThan(0.03);
        });

        it(`hole ${n}: the hole line starts at the tee point`, () => {
            const h = course.holes[String(n)];
            expect(h.line[0]).toEqual(h.tee);
        });

        it(`hole ${n}: the tee lies inside the hole's bbox and aerial extent`, () => {
            const h = course.holes[String(n)];
            const [w, s, e, nn] = h.bboxWGS84;
            expect(h.tee.lon).toBeGreaterThanOrEqual(w);
            expect(h.tee.lon).toBeLessThanOrEqual(e);
            expect(h.tee.lat).toBeGreaterThanOrEqual(s);
            expect(h.tee.lat).toBeLessThanOrEqual(nn);
            const R = 6378137;
            const x = R * h.tee.lon * Math.PI / 180;
            const y = R * Math.log(Math.tan(Math.PI / 4 + h.tee.lat * Math.PI / 360));
            const [x0, y0, x1, y1] = h.imagery.extent3857;
            expect(x).toBeGreaterThanOrEqual(x0);
            expect(x).toBeLessThanOrEqual(x1);
            expect(y).toBeGreaterThanOrEqual(y0);
            expect(y).toBeLessThanOrEqual(y1);
        });
    }
});
