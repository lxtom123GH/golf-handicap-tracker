#!/usr/bin/env node
// ==========================================
// scripts/validate-traced-holes.mjs — sanity-check a traced overlay file
// ==========================================
//
//   node scripts/validate-traced-holes.mjs public/courses/keperra.traced.json
//
// The gate for machine-traced holes (docs/agent-briefs/HERMES-hole-tracing-brief.md).
// Exit 0 = every hole passes; otherwise each failure is printed with the
// hole number and the rule. Rules are geometric, not aesthetic: a human
// still eyeballs the PNGs before anything is merged.

import { readFileSync } from 'node:fs';
import { distanceM, makeFrame, toFrame, pointInRing, centroid, distanceToLineM } from '../src/geo.js';
import { KEPERRA_GPS } from '../src/course-data.js';

const path = process.argv[2];
if (!path) { console.error('usage: node scripts/validate-traced-holes.mjs <file.json>'); process.exit(2); }
const course = JSON.parse(readFileSync(path, 'utf8'));
const problems = [];
const fail = (n, msg) => problems.push(`hole ${n}: ${msg}`);

function ring(f) {
    if (f.geometry?.type !== 'Polygon') return null;
    const r = f.geometry.coordinates[0].map(([lon, lat]) => [lat, lon]);
    return r.length >= 4 ? r : null;
}
function selfIntersects(r) {
    const seg = (i) => [r[i], r[(i + 1) % r.length]];
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const hit = (p, q) => {
        const [a, b] = p, [c, d] = q;
        return (cross(a, b, c) * cross(a, b, d) < 0) && (cross(c, d, a) * cross(c, d, b) < 0);
    };
    for (let i = 0; i < r.length - 1; i++) for (let j = i + 2; j < r.length - 1; j++) {
        if (i === 0 && j === r.length - 2) continue;
        if (hit(seg(i), seg(j))) return true;
    }
    return false;
}

for (const [k, h] of Object.entries(course.holes || {})) {
    const n = Number(k);
    const app = course.slug === 'keperra' ? KEPERRA_GPS[n] : null;
    if (!h.tee || !h.green?.centre) { fail(n, 'missing tee or green.centre'); continue; }
    const tee = [h.tee.lat, h.tee.lon], gc = [h.green.centre.lat, h.green.centre.lon];
    const len = distanceM(tee, gc);
    const par = h.par;
    const range = par === 3 ? [80, 240] : par === 5 ? [380, 600] : [230, 460];
    if (par && (len < range[0] || len > range[1])) fail(n, `tee→green ${Math.round(len)} m is outside par-${par} range ${range.join('-')} m`);
    if (app && distanceM(gc, [app[0], app[1]]) > 10) fail(n, `green.centre is ${Math.round(distanceM(gc, [app[0], app[1]]))} m from KEPERRA_GPS[${n}] (max 10)`);
    const frame = makeFrame(tee, gc);
    const feats = h.features?.features || [];
    const byKind = {};
    for (const f of feats) {
        const kind = f.properties?.golf;
        // v3 (brief §7b.4): bunkers, water and tees may be Point landmarks.
        if (f.geometry?.type === 'Point') {
            if (!['bunker', 'water_hazard', 'lateral_water_hazard', 'tee', 'pin'].includes(kind)) { fail(n, `${kind}: a Point is only allowed for bunker/water/tee/pin`); continue; }
            const [lon, lat] = f.geometry.coordinates;
            const [x, y] = toFrame(frame, [lat, lon]);
            if (y < -80 || y > len + 80 || Math.abs(x) > 150) fail(n, `${kind} point at ${Math.round(x)},${Math.round(y)} m is outside the hole corridor`);
            (byKind[`${kind}:point`] ||= []).push([lat, lon]);
            continue;
        }
        const r = ring(f);
        if (!r) { fail(n, `${kind}: not a closed polygon with ≥3 vertices`); continue; }
        if (r.length > 200) fail(n, `${kind}: ${r.length} vertices (max 200)`);
        if (selfIntersects(r)) fail(n, `${kind}: polygon self-intersects`);
        // Water and rough are often one polygon shared by several holes (seen
        // in the OSM data for Redcliffe), so only the hole's own furniture
        // must stay inside the corridor.
        if (['tee', 'fairway', 'green', 'bunker'].includes(kind)) {
            for (const p of r) {
                const [x, y] = toFrame(frame, p);
                if (y < -80 || y > len + 80 || Math.abs(x) > 150) { fail(n, `${kind}: vertex ${Math.round(x)},${Math.round(y)} m is outside the hole corridor`); break; }
            }
        }
        (byKind[kind] ||= []).push(r);
    }
    const greens = byKind.green || [];
    if (greens.length !== 1) fail(n, `${greens.length} green polygons (need exactly 1)`);
    else {
        const g = greens[0];
        if (!pointInRing(gc, g) && distanceM(gc, centroid(g)) > 8) fail(n, 'green polygon does not contain green.centre');
        let fy = Infinity, by = -Infinity;
        for (const p of g) { const y = toFrame(frame, p)[1]; fy = Math.min(fy, y); by = Math.max(by, y); }
        if (by - fy < 12 || by - fy > 55) fail(n, `green depth ${Math.round(by - fy)} m (expect 12-55)`);
    }
    // Brief §7b: a fairway may arrive as a centreline with widths instead of
    // (or as well as) a polygon. Check it in the hole frame.
    if (Array.isArray(h.fairwayLine)) {
        const fl = h.fairwayLine;
        if (fl.length < 3) fail(n, `fairwayLine has ${fl.length} points (min 3)`);
        fl.forEach((p, i) => {
            const w = Number(p.widthM);
            if (!(w >= 18 && w <= 60)) fail(n, `fairwayLine[${i}] widthM ${p.widthM} (expect 18-60)`);
            const [x, y] = toFrame(frame, [p.lat, p.lon]);
            if (y < -80 || y > len + 80 || Math.abs(x) > 150) fail(n, `fairwayLine[${i}] at ${Math.round(x)},${Math.round(y)} m is outside the hole corridor`);
            // v3: when OSM's hole line exists it is the reference corridor; a
            // centreline 40 m to the side of it is on the wrong ground (PR #152
            // holes 12/13/22 sat 24-51 m off the line from a tile-mapping bug).
            const osmLine = (h.line || []).map(q => [q.lat, q.lon]);
            if (osmLine.length >= 2 && distanceToLineM([p.lat, p.lon], osmLine) > 45) fail(n, `fairwayLine[${i}] is ${Math.round(distanceToLineM([p.lat, p.lon], osmLine))} m from the OSM hole line (max 45)`);
        });
        if (fl.length) {
            const first = toFrame(frame, [fl[0].lat, fl[0].lon]);
            const last = toFrame(frame, [fl[fl.length - 1].lat, fl[fl.length - 1].lon]);
            if (Math.hypot(first[0], first[1]) > 200) fail(n, 'fairwayLine starts more than 200 m from the tee');
            if (Math.hypot(last[0], last[1] - len) > 60) fail(n, 'fairwayLine ends more than 60 m from the green centre');
        }
    }
    // v3: a tee polygon is not needed when the tee datum is OSM's or a tee Point landmark exists.
    const teeDatumOk = h.tee?.source === 'osm' || (byKind['tee:point'] || []).length > 0;
    if (!(byKind.tee || []).length && !teeDatumOk) fail(n, 'no tee polygon (or tee.source osm / tee Point)');
    for (const tp of byKind['tee:point'] || []) if (distanceM(tp, tee) > 45) fail(n, 'a tee Point is > 45 m from hole.tee');
    for (const t of byKind.tee || []) if (distanceM(centroid(t), tee) > 45) fail(n, 'a tee polygon is > 45 m from hole.tee');
    if (par !== 3 && !(byKind.fairway || []).length && !(Array.isArray(h.fairwayLine) && h.fairwayLine.length >= 3)) fail(n, 'no fairway polygon or fairwayLine on a par 4/5');
    const line = (h.line || []).map(p => [p.lat, p.lon]);
    for (const fw of byKind.fairway || []) {
        if (line.length >= 2 && distanceToLineM(centroid(fw), line) > 60) fail(n, 'fairway centroid > 60 m from the hole line');
    }
    if (!h.features?.source?.provider) fail(n, 'features.source.provider missing (imagery + model provenance)');
    // v3 (review of PR #152): a traced hole must say which pixels it came
    // from, or a coordinate-mapping bug cannot be found or fixed.
    if (String(h.features?.source?.provider || '').includes('trace')) {
        const s = h.features.source;
        if (!Array.isArray(s.extent3857) || s.extent3857.length !== 4) fail(n, 'features.source.extent3857 missing (brief §4)');
        if (!Array.isArray(s.px) || s.px.length !== 2) fail(n, 'features.source.px missing (brief §4)');
        if (!s.imageUrl) fail(n, 'features.source.imageUrl missing (brief §4)');
    }
    if (!Array.isArray(h.bboxWGS84) || h.bboxWGS84.length !== 4) fail(n, 'bboxWGS84 missing (brief §4)');

    // v2 (review of PR #145, 2026-09-16): containment and distance rules
    // alone let manufactured geometry through — greens rescaled into tiny
    // polygons around the anchor, fairways clamped into 4 m ribbons, hazards
    // copied between holes. Sizes and shapes are now checked too.
    const areaM2 = (r) => {
        const pts = r.slice(0, -1).map(p => toFrame(frame, p));
        let a = 0;
        for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
        return Math.abs(a) / 2;
    };
    const lengthAlongAxis = (r) => { const ys = r.map(p => toFrame(frame, p)[1]); return Math.max(...ys) - Math.min(...ys); };
    if (greens.length === 1) {
        const g = greens[0];
        const a = areaM2(g);
        if (a < 200 || a > 1500) fail(n, `green area ${Math.round(a)} m² (expect 200-1500; a real green, not a shape around the anchor)`);
        if (g.length - 1 < 8) fail(n, `green has ${g.length - 1} vertices (min 8; trace the edge, do not synthesise)`);
    }
    // OSM often splits one fairway into several polygons, so judge the union:
    // total area, and mean width = total area / axis length covered.
    const fws = byKind.fairway || [];
    if (fws.length) {
        const total = fws.reduce((s, fw) => s + areaM2(fw), 0);
        const ys = fws.flatMap(fw => fw.map(p => toFrame(frame, p)[1]));
        const len = Math.max(...ys) - Math.min(...ys);
        const w = len > 0 ? total / len : 0;
        // Floors calibrated on the OSM files: Ashgrove's real fairways are
        // narrow (10-17 m mean, 3,000-4,000 m²); the PR #145 ribbons were 2-7 m.
        if (par !== 3 && total < 2500) fail(n, `fairway area ${Math.round(total)} m² (min 2500 on a par 4/5)`);
        if (w < 8 || w > 70) fail(n, `fairway mean width ${Math.round(w)} m (expect 8-70; ribbons and canopy are both wrong)`);
    }
    for (const t of byKind.tee || []) { const a = areaM2(t); if (a < 40 || a > 1500) fail(n, `tee area ${Math.round(a)} m² (expect 40-1500)`); }
    const hazards = [...(byKind.bunker || []), ...(byKind.water_hazard || []), ...(byKind.lateral_water_hazard || [])];
    const seen = new Set();
    for (const hz of hazards) {
        const a = Math.round(areaM2(hz));
        if (a < 15 || a > 6000) fail(n, `hazard area ${a} m² (expect 15-6000)`);
        const sig = `${a}:${hz.length}`;
        if (seen.has(sig) && a >= 60) fail(n, `two hazards with identical area ${a} m² and vertex count (a copied polygon)`);
        seen.add(sig);
    }
}
// Confidence that never varies is a placeholder, not a measurement.
{
    const confs = Object.values(course.holes || {}).map(h => h.features?.source?.confidence).filter(c => typeof c === 'number');
    if (confs.length >= 6 && new Set(confs).size === 1) problems.push(`all ${confs.length} holes report confidence ${confs[0]} — record the model's real per-hole value or omit it`);
}

if (problems.length) { console.error(problems.join('\n')); console.error(`\n${problems.length} problem(s)`); process.exit(1); }
console.log(`OK: ${Object.keys(course.holes || {}).length} holes in ${path} pass`);
