#!/usr/bin/env node
// ==========================================
// scripts/fetch-osm-holes.mjs — build-time OSM hole overlays
// ==========================================
//
// Run once per course (never from the app at runtime — the public Overpass
// endpoint rate-limits), commit the output:
//
//   node scripts/fetch-osm-holes.mjs ashgrove redcliffe keperra
//
// Writes public/courses/<slug>.json with, per hole: tee, green (centre /
// front / back), the OSM hole line, the hole frame bearing, a padded bbox
// and the clipped GeoJSON features. Data is © OpenStreetMap contributors,
// ODbL (https://www.openstreetmap.org/copyright) — keep the attribution in
// the app.

import { writeFileSync, mkdirSync } from 'node:fs';
import { assignFeaturesToHole, bboxWGS84, centroid, distanceM, greenFrontBack, makeFrame } from '../src/geo.js';
import { KEPERRA_GPS } from '../src/course-data.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const BBOX = '-27.75,152.70,-27.05,153.35'; // greater Brisbane
const COURSES = {
    ashgrove: { pattern: 'Ashgrove', name: 'Ashgrove Golf Club' },
    redcliffe: { pattern: 'Redcliffe', name: 'Redcliffe Golf Club' },
    keperra: { pattern: 'Keperra', name: 'Keperra Country Golf Club' },
    virginia: { pattern: 'Virginia', name: 'Virginia Golf Club' },
};
const KEEP = new Set(['hole', 'tee', 'fairway', 'green', 'bunker', 'water_hazard', 'lateral_water_hazard', 'rough', 'pin']);

async function overpass(query, tries = 4) {
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(OVERPASS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'golf-handicap-tracker/overlay-build' },
                body: 'data=' + encodeURIComponent(query),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            console.error(`  overpass retry ${i + 1}: ${e.message}`);
            await new Promise(r => setTimeout(r, 20000 * (i + 1)));
        }
    }
    throw new Error('Overpass gave up');
}

function ringOf(el) {
    if (el.type === 'way' && el.geometry) return el.geometry.map(g => [g.lat, g.lon]);
    if (el.type === 'relation' && el.members) {
        const outer = el.members.find(m => m.role === 'outer' && m.geometry);
        if (outer) return outer.geometry.map(g => [g.lat, g.lon]);
    }
    return null;
}

function toGeoJSON(f) {
    const coords = f.ring.map(([lat, lon]) => [lon, lat]);
    const closed = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1];
    return {
        type: 'Feature',
        properties: { golf: f.golf, osmId: f.osmId, name: f.name || undefined },
        geometry: closed || f.golf !== 'hole'
            ? { type: 'Polygon', coordinates: [closed ? coords : [...coords, coords[0]]] }
            : { type: 'LineString', coordinates: coords },
    };
}

async function buildCourse(slug) {
    const { pattern, name } = COURSES[slug];
    console.log(`== ${slug}`);
    const q = `
[out:json][timeout:180];
nwr["leisure"="golf_course"]["name"~"${pattern}",i](${BBOX})->.course;
.course map_to_area->.a;
(
  nwr["golf"](area.a);
);
out tags geom;
`;
    const res = await overpass(q);
    const els = res.elements || [];
    const holes = [];
    const features = [];
    const pins = [];
    for (const el of els) {
        const golf = el.tags?.golf;
        if (!KEEP.has(golf)) continue;
        if (golf === 'pin' && el.type === 'node') { pins.push({ ref: el.tags.ref, p: [el.lat, el.lon] }); continue; }
        const ring = ringOf(el);
        if (!ring) continue;
        if (golf === 'hole') holes.push({ ref: el.tags.ref, par: el.tags.par ? Number(el.tags.par) : null, handicap: el.tags.handicap ? Number(el.tags.handicap) : null, line: ring, osmId: `${el.type}/${el.id}` });
        else features.push({ golf, ring, osmId: `${el.type}/${el.id}`, name: el.tags.name });
    }
    console.log(`  ${holes.length} holes, ${features.length} polygons, ${pins.length} pins`);

    const out = { slug, name, source: { provider: 'osm', fetchedAt: new Date().toISOString(), licence: 'ODbL', attribution: '© OpenStreetMap contributors' }, holes: {} };
    for (const h of holes) {
        let n = Number(h.ref);
        if (!Number.isFinite(n)) continue;
        // Keperra: OSM numbers its 18 mapped holes 1-18, but they are the
        // club's physical holes 10-27 (checked 2026-09-16: every OSM pin is
        // within 6 m of KEPERRA_GPS[n+9] and 50-160 m from KEPERRA_GPS[n]).
        // Renumber by the nearest app green so the wizard shows the right hole.
        let appGreen = null;
        if (slug === 'keperra') {
            const end = h.line[h.line.length - 1];
            const near = Object.entries(KEPERRA_GPS)
                .map(([k, v]) => ({ k: Number(k), v, d: distanceM(end, [v[0], v[1]]) }))
                .sort((a, b) => a.d - b.d)[0];
            if (!near || near.d > 60) { console.warn(`  keperra osm hole ${n}: no app green within 60 m, skipped`); continue; }
            n = near.k;
            appGreen = near.v;
        }
        const tee = h.line[0];
        const mine = assignFeaturesToHole(h, features);
        const green = mine.find(f => f.golf === 'green');
        // Pins carry no ref at Keperra; take the one nearest the hole line's end.
        const end = h.line[h.line.length - 1];
        const pin = pins.find(p => Number(p.ref) === n)
            || pins.map(p => ({ p, d: distanceM(end, p.p) })).filter(x => x.d <= 60).sort((a, b) => a.d - b.d)[0]?.p;
        const greenCentre = appGreen ? [appGreen[0], appGreen[1]] : green ? centroid(green.ring) : (pin ? pin.p : h.line[h.line.length - 1]);
        const frame = makeFrame(tee, greenCentre);
        const fb = appGreen ? { front: [appGreen[2], appGreen[3]], back: [appGreen[4], appGreen[5]] }
            : green ? greenFrontBack(frame, green.ring) : { front: null, back: null };
        const pts = [...h.line, ...mine.flatMap(f => f.ring)];
        out.holes[n] = {
            number: n, par: h.par, handicap: h.handicap,
            tee: { lat: tee[0], lon: tee[1] },
            green: {
                centre: { lat: greenCentre[0], lon: greenCentre[1] },
                front: fb.front ? { lat: fb.front[0], lon: fb.front[1] } : null,
                back: fb.back ? { lat: fb.back[0], lon: fb.back[1] } : null,
                source: appGreen ? 'app-gps' : green ? 'osm-polygon' : (pin ? 'osm-pin' : 'hole-line-end'),
            },
            line: h.line.map(([lat, lon]) => ({ lat, lon })),
            dogleg: h.line.slice(1, -1).map(([lat, lon]) => ({ lat, lon })),
            axisBearing: Math.round(frame.bearing * 10) / 10,
            bboxWGS84: bboxWGS84(pts, 25),
            features: { type: 'FeatureCollection', features: mine.map(toGeoJSON) },
        };
    }
    const nums = Object.keys(out.holes).map(Number).sort((a, b) => a - b);
    const withPolys = nums.filter(n => out.holes[n].features.features.length > 0).length;
    console.log(`  holes ${nums[0]}-${nums[nums.length - 1]} (${nums.length}), ${withPolys} with polygons`);
    mkdirSync('public/courses', { recursive: true });
    const path = `public/courses/${slug}.json`;
    writeFileSync(path, JSON.stringify(out));
    console.log(`  wrote ${path} (${Math.round(JSON.stringify(out).length / 1024)} KB)`);
}

const slugs = process.argv.slice(2);
if (!slugs.length) { console.error('usage: node scripts/fetch-osm-holes.mjs <slug...>  slugs: ' + Object.keys(COURSES).join(' ')); process.exit(1); }
for (const s of slugs) {
    if (!COURSES[s]) { console.error(`unknown slug ${s}`); process.exit(1); }
    await buildCourse(s);
    if (slugs.indexOf(s) < slugs.length - 1) await new Promise(r => setTimeout(r, 15000));
}
