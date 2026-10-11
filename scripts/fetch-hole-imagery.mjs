// ==========================================================================
// fetch-hole-imagery.mjs — S6 Part 1: ship Queensland aerial imagery
// ==========================================================================
// Fetches the Queensland Government aerial image for each hole's bboxWGS84
// from the open ImageServer and saves it into public/courses/imagery/, then
// writes hole.imagery = { url, extent3857, px } into the course file so the
// hole overlay can draw the photo under the base (S6 Part 1).
//
// This is a BUILD-TIME script. Nothing at runtime calls the ImageServer —
// the JPEGs ship with the app and the service worker caches them like the
// rest of /courses/.
//
// Usage:
//   node scripts/fetch-hole-imagery.mjs <slug> [holeNumber ...]
//   node scripts/fetch-hole-imagery.mjs keperra 10 11 12   (explicit list)
//   node scripts/fetch-hole-imagery.mjs keperra            (all holes)
//
// Licence: the imagery is © State of Queensland (DNRMME) CC BY-SA — the
// attribution string already lives in the course file's attributions and is
// rendered by score-input whenever the overlay is shown.

import fs from 'node:fs/promises';
import path from 'node:path';

const SERVER = 'https://spatial-img.information.qld.gov.au/arcgis/rest/services/Basemaps/LatestStateProgram_AllUsers/ImageServer';
const LONG_SIDE = 1024;
const MERC_R = 6378137; // WGS84 semi-major axis — EPSG:3857 sphere radius
const HALF = Math.PI * MERC_R;

// lon/lat (degrees) → EPSG:3857 metres (the inverse of hole-overlay's
// mercatorToLonLat; kept inline so this script stays dependency-free).
const to3857 = ([lon, lat]) => [
    (lon / 180) * HALF,
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * MERC_R,
];

// The ImageServer is a public shared service and occasionally answers
// 502/504 under load — retry gently rather than hammering it.
async function fetchRetry(url, tries = 4) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'golf-handicap-tracker imagery build script (contact: repo owner)' },
            });
            if (res.ok) return res;
            lastErr = new Error(`HTTP ${res.status}`);
        } catch (err) {
            lastErr = err;
        }
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
    throw lastErr;
}

const [slug, ...holeArgs] = process.argv.slice(2);
const force = holeArgs.includes('--force');
const only = holeArgs.filter((a) => a !== '--force').map(String);
if (!slug) {
    console.error('usage: node scripts/fetch-hole-imagery.mjs <slug> [holeNumber ...] [--force]');
    process.exit(1);
}

const coursePath = path.resolve(`public/courses/${slug}.json`);
const course = JSON.parse(await fs.readFile(coursePath, 'utf8'));
const wanted = only.length ? only : Object.keys(course.holes);
await fs.mkdir(path.resolve('public/courses/imagery'), { recursive: true });

// One hole failing (the shared server occasionally 500s on a single export)
// must not lose the rest of the batch — failures are collected and reported
// at the end with a non-zero exit so CI can re-run.
const failed = [];
let fetched = 0;
for (const n of wanted) {
    const hole = course.holes[n];
    if (!hole) {
        console.error(`hole ${n}: no record in ${slug}.json, skipped`);
        continue;
    }
    if (hole.imagery && !force) {
        console.log(`hole ${n}: imagery already present, skipped`);
        continue;
    }
    if (!hole.bboxWGS84) {
        console.error(`hole ${n}: no bboxWGS84, skipped`);
        continue;
    }
    try {
        await fetchHole(hole, n, slug);
        fetched++;
        // Be polite to a free public server between holes.
        await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
        failed.push(n);
        console.error(`hole ${n}: FAILED — ${err.message}`);
    }
}

async function fetchHole(hole, n, slug) {
    const [lonMin, latMin, lonMax, latMax] = hole.bboxWGS84;
    const [x0, y1] = to3857([lonMin, latMax]); // NW corner
    const [x1, y0] = to3857([lonMax, latMin]); // SE corner
    const wM = x1 - x0;
    const hM = y1 - y0;
    // 1024 px on the long side; the short side keeps the true aspect so the
    // pixels stay square (a square-stretched image would skew the affine).
    const [pxW, pxH] = wM >= hM
        ? [LONG_SIDE, Math.max(1, Math.round((LONG_SIDE * hM) / wM))]
        : [Math.max(1, Math.round((LONG_SIDE * wM) / hM)), LONG_SIDE];

    // f=json first: the response carries the exact extent (in the requested
    // imageSR = EPSG:3857), the pixel size and the href of the rendered JPG.
    const bbox = `${lonMin},${latMin},${lonMax},${latMax}`;
    const metaUrl = `${SERVER}/exportImage?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=${pxW},${pxH}&format=jpg&f=json`;
    const meta = await (await fetchRetry(metaUrl)).json();
    if (meta.error) throw new Error(`exportImage error ${JSON.stringify(meta.error)}`);

    const imgRes = await fetchRetry(meta.href);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const file = `public/courses/imagery/${slug}-${n}.jpg`;
    await fs.writeFile(path.resolve(file), buf);

    const ex = meta.extent;
    hole.imagery = {
        url: `/courses/imagery/${slug}-${n}.jpg`,
        extent3857: [ex.xmin, ex.ymin, ex.xmax, ex.ymax],
        px: [meta.width, meta.height],
    };
    console.log(`hole ${n}: ${file} ${(buf.length / 1024).toFixed(0)} KB ${meta.width}x${meta.height}`);
}

await fs.writeFile(coursePath, JSON.stringify(course));
console.log(`${fetched} hole(s) fetched; course file updated: ${coursePath}`);
if (failed.length) {
    console.error(`FAILED holes: ${failed.join(', ')} — re-run the script to retry them.`);
    process.exit(2);
}
