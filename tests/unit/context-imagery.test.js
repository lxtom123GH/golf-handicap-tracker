// Course-wide context aerial (owner 2026-10-04: "instead of the khaki ...
// actually maps"). The context image must cover every hole's own crop with a
// margin, so rotation/shot framing never shows the flat ground fill.
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

const keperra = JSON.parse(readFileSync('public/courses/keperra.json', 'utf8'));
const R = 6378137;
const to3857 = (lon, lat) => [(lon / 180) * Math.PI * R, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R];

describe('course context imagery', () => {
    const ctx = keperra.contextImagery;

    it('ships for Keperra with a url, an EPSG:3857 extent and pixel size', () => {
        expect(ctx?.url).toBe('/courses/imagery/keperra-context.jpg');
        expect(ctx.extent3857).toHaveLength(4);
        expect(ctx.px).toHaveLength(2);
        const st = statSync('public' + ctx.url);
        expect(st.size).toBeGreaterThan(100_000);
        expect(st.size).toBeLessThan(4_000_000); // keep the offline cache sane
    });

    it('covers every hole bbox with at least 150 m to spare on all sides', () => {
        const [cx0, cy0, cx1, cy1] = ctx.extent3857;
        for (const [n, h] of Object.entries(keperra.holes)) {
            const [lonMin, latMin, lonMax, latMax] = h.bboxWGS84;
            const [x0, y0] = to3857(lonMin, latMin);
            const [x1, y1] = to3857(lonMax, latMax);
            // Mercator metres stretch by 1/cos(lat) at Keperra (~-27.4°).
            const margin = 150 / Math.cos((latMin * Math.PI) / 180);
            expect(x0 - cx0, `hole ${n} west margin`).toBeGreaterThan(margin);
            expect(y0 - cy0, `hole ${n} south margin`).toBeGreaterThan(margin);
            expect(cx1 - x1, `hole ${n} east margin`).toBeGreaterThan(margin);
            expect(cy1 - y1, `hole ${n} north margin`).toBeGreaterThan(margin);
        }
    });

    it('keeps square pixels (aspect of px matches aspect of the extent)', () => {
        const [x0, y0, x1, y1] = ctx.extent3857;
        expect(ctx.px[0] / ctx.px[1]).toBeCloseTo((x1 - x0) / (y1 - y0), 2);
    });
});
