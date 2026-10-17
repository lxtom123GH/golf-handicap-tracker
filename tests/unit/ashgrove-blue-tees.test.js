import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { COURSE_DATA } from '../../src/course-data.js';

// Ashgrove mapping audit (2026-10-17): OSM put the tee point for 13, 14 and 18
// on the White/Red box. They now point at the Blue tee. Pin each hole's
// along-the-line length to within 3% of the Blue card length.
const c = JSON.parse(fs.readFileSync('public/courses/ashgrove.json', 'utf8'));
const blue = COURSE_DATA['Ashgrove GC']['Blue (Men)'];
const R = 6371000, rad = (x) => (x * Math.PI) / 180;
const hav = (a, b) => {
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
        + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};
const lineLength = (h) => h.line.slice(1).reduce((s, p, i) => s + hav(h.line[i], p), 0);

describe('Ashgrove Blue tees (audit 2026-10-17)', () => {
    it.each([13, 14, 18])('hole %i tee is the Blue tee: line starts at the tee, length within 3% of card', (n) => {
        const h = c.holes[n];
        expect(h.line[0]).toEqual(h.tee);
        const card = blue.lengths[n - 1];
        expect(Math.abs(lineLength(h) - card) / card).toBeLessThan(0.03);
    });
    it('front and back of each re-pointed green stay on opposite sides of the centre', () => {
        for (const n of [13, 14, 18]) {
            const g = c.holes[n].green;
            const t = c.holes[n].tee;
            expect(hav(t, g.front)).toBeLessThan(hav(t, g.centre));
            expect(hav(t, g.back)).toBeGreaterThan(hav(t, g.centre));
        }
    });
});
