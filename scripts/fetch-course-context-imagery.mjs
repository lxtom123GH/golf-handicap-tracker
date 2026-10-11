// ==========================================================================
// fetch-course-context-imagery.mjs — one course-wide aerial under every hole
// ==========================================================================
// The per-hole images (fetch-hole-imagery.mjs) are cropped tight to each
// hole's bbox. When the overlay rotates or frames a shot, the corners of that
// crop leave the canvas and the flat ground colour shows through — the owner
// called it "the khaki where there's no map" (2026-10-04). This script fetches
// ONE wider image covering the union of every hole bbox plus a margin and
// writes course.contextImagery = { url, extent3857, px }. hole-overlay draws
// it first, then the sharper per-hole image on top.
//
// BUILD-TIME only, same server, same licence and attribution as the per-hole
// images (© State of Queensland, CC BY-SA). Nothing at runtime calls the
// ImageServer; the service worker caches /courses/ like the rest.
//
// Usage:
//   node scripts/fetch-course-context-imagery.mjs <slug> [--pad 350] [--px 3072]

import fs from 'node:fs/promises';
import path from 'node:path';

const SERVER = 'https://spatial-img.information.qld.gov.au/arcgis/rest/services/Basemaps/LatestStateProgram_AllUsers/ImageServer';
const MERC_R = 6378137;
const HALF = Math.PI * MERC_R;
const to3857 = ([lon, lat]) => [
    (lon / 180) * HALF,
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * MERC_R,
];

async function fetchRetry(url, tries = 4) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'golf-handicap-tracker imagery build script (contact: repo owner)' } });
            if (res.ok) return res;
            lastErr = new Error(`HTTP ${res.status}`);
        } catch (err) { lastErr = err; }
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
    throw lastErr;
}

const args = process.argv.slice(2);
const slug = args[0];
const opt = (name, dflt) => { const i = args.indexOf(name); return i > 0 ? Number(args[i + 1]) : dflt; };
const PAD_M = opt('--pad', 350);   // metres of map beyond the outermost hole
const LONG_SIDE = opt('--px', 3072);
if (!slug) {
    console.error('usage: node scripts/fetch-course-context-imagery.mjs <slug> [--pad 350] [--px 3072]');
    process.exit(1);
}

const coursePath = path.resolve(`public/courses/${slug}.json`);
const course = JSON.parse(await fs.readFile(coursePath, 'utf8'));
const boxes = Object.values(course.holes).map((h) => h.bboxWGS84).filter(Boolean);
if (!boxes.length) { console.error('no hole has bboxWGS84'); process.exit(1); }

// Union of hole bboxes in EPSG:3857, padded. Mercator metres are stretched by
// 1/cos(lat), so the pad is scaled to stay ~PAD_M on the ground.
let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
for (const [lonMin, latMin, lonMax, latMax] of boxes) {
    const [ax, ay] = to3857([lonMin, latMin]);
    const [bx, by] = to3857([lonMax, latMax]);
    x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by);
}
const lat0 = boxes[0][1];
const pad = PAD_M / Math.cos((lat0 * Math.PI) / 180);
x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
const wM = x1 - x0, hM = y1 - y0;
const [pxW, pxH] = wM >= hM
    ? [LONG_SIDE, Math.round((LONG_SIDE * hM) / wM)]
    : [Math.round((LONG_SIDE * wM) / hM), LONG_SIDE];

const metaUrl = `${SERVER}/exportImage?bbox=${x0},${y0},${x1},${y1}&bboxSR=3857&imageSR=3857&size=${pxW},${pxH}&format=jpg&compressionQuality=70&f=json`;
const meta = await (await fetchRetry(metaUrl)).json();
if (meta.error) throw new Error(`exportImage error ${JSON.stringify(meta.error)}`);
const buf = Buffer.from(await (await fetchRetry(meta.href)).arrayBuffer());
await fs.mkdir(path.resolve('public/courses/imagery'), { recursive: true });
const file = `public/courses/imagery/${slug}-context.jpg`;
await fs.writeFile(path.resolve(file), buf);

const ex = meta.extent;
course.contextImagery = {
    url: `/courses/imagery/${slug}-context.jpg`,
    extent3857: [ex.xmin, ex.ymin, ex.xmax, ex.ymax],
    px: [meta.width, meta.height],
};
await fs.writeFile(coursePath, JSON.stringify(course));
const mPerPx = ((ex.xmax - ex.xmin) / meta.width) * Math.cos((lat0 * Math.PI) / 180);
console.log(`${file} ${(buf.length / 1024).toFixed(0)} KB ${meta.width}x${meta.height} (~${mPerPx.toFixed(2)} m/px); course file updated`);
