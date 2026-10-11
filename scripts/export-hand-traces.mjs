/**
 * scripts/export-hand-traces.mjs - S6 Part 2b: pull hand-traced hole
 * features (the "Map this hole" card's output) out of Firestore and merge
 * them into the shipped course file, ready for the existing validator and
 * merge pipeline.
 *
 * OWNER-RUN ONLY. Reads production Firestore through the Admin SDK with the
 * owner's credentials (mirrors scripts/seed_test_rounds.mjs). Default mode
 * is --dry-run, which needs no credentials at all.
 *
 *   node scripts/export-hand-traces.mjs --course keperra                (dry run)
 *   node scripts/export-hand-traces.mjs --course keperra --write
 *   node scripts/export-hand-traces.mjs --course keperra --key sa.json --write
 *
 * What it does with the data:
 *   1. Reads every users/{uid}/holeTraces/{course}-{hole} doc for the course
 *      (newest updatedAt wins if several golfers traced the same hole).
 *   2. Converts the Firestore-safe storage shape (geometry.ring, points as
 *      {lon, lat} maps — Firestore forbids arrays nested in arrays) back to
 *      real GeoJSON: geometry.coordinates = [ring], ring closed.
 *   3. Re-validates the caps the client enforces: <= 12 features per hole,
 *      <= 200 vertices per closed ring, polygon rings only. A doc that fails
 *      is reported and skipped, never merged.
 *   4. --write merges the accepted traces into public/courses/<slug>.traced.json
 *      (creating the file from <slug>.json if it does not exist), marking each
 *      feature source: { provider: 'hand-trace', imagery }. The tracer's uid
 *      is never written: the course files are public, so provenance stays
 *      non-identifying (provider, imagery, tracedAt).
 *      Run scripts/validate-traced-holes.mjs and
 *      scripts/merge-traced-holes.mjs afterwards, exactly as for a model run.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { golfTag } from '../src/golf-tags.js';
import { stripIdentity } from './strip-identity.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? null : (args[i + 1]?.startsWith('--') ? true : args[i + 1]);
};
const has = (name) => args.includes(`--${name}`);

const course = opt('course');
if (!course) {
    console.error('usage: node scripts/export-hand-traces.mjs --course <slug> [--write] [--key <sa.json>] [--emulator]');
    process.exit(1);
}
const write = has('write');
const LIMITS = { maxFeatures: 12, maxVertices: 200 };

// ---- Firestore-safe -> GeoJSON -------------------------------------------
// Saved: { type:'Feature', properties:{golf}, geometry:{ type:'Polygon', ring:[{lon,lat},...] } }
// Export: { type:'Feature', properties:{golf, source}, geometry:{ type:'Polygon', coordinates:[ring] } }
function toGeoFeature(stored) {
    const ring = stored.geometry?.ring;
    if (!Array.isArray(ring) || ring.length < 4) return { error: `ring has ${ring?.length ?? 0} points (need >= 4)` };
    if (ring.length > LIMITS.maxVertices + 1) return { error: `ring has ${ring.length} points (cap ${LIMITS.maxVertices} + closure)` };
    for (const p of ring) {
        if (typeof p?.lon !== 'number' || typeof p?.lat !== 'number') return { error: 'ring point missing lon/lat' };
    }
    const closed = ring[0].lon === ring[ring.length - 1].lon && ring[0].lat === ring[ring.length - 1].lat;
    if (!closed) ring.push({ ...ring[0] }); // GeoJSON rings close
    return {
        type: 'Feature',
        properties: {
            // Older traces were saved as golf: 'water', which the course map
            // never drew; normalise to the OSM tag on the way out.
            golf: golfTag(stored.properties?.golf || 'unknown'),
            source: { provider: 'hand-trace', imagery: stored._imagery || null },
        },
        geometry: { type: 'Polygon', coordinates: [ring.map((p) => [p.lon, p.lat])] },
    };
}

// ---- load -----------------------------------------------------------------
let traces;
if (write || has('emulator')) {
    // Admin SDK path (also the emulator path — no credentials needed there).
    const { default: admin } = await import(path.resolve('functions/node_modules/firebase-admin/lib/index.js'));
    const options = { projectId: 'golf-handicap-tracker-b677c' };
    if (has('emulator')) {
        process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
        options.projectId = 'golf-handicap-tracker-b677c';
    } else if (opt('key')) {
        options.credential = admin.credential.cert(JSON.parse(fs.readFileSync(path.resolve(opt('key')), 'utf8')));
    } else {
        options.credential = admin.credential.applicationDefault();
    }
    admin.initializeApp(options);
    const db = admin.firestore();
    const users = await db.collection('users').listDocuments();
    traces = [];
    for (const u of users) {
        const snap = await u.collection('holeTraces').where('features.meta.courseSlug', '==', course).get()
            .catch(() => null);
        if (!snap) continue;
        for (const d of snap.docs) {
            traces.push({ uid: u.id, id: d.id, data: d.data() });
        }
    }
} else {
    console.error('dry run needs --emulator (or --write with credentials): the traces live in Firestore, not on disk');
    process.exit(1);
}

if (!traces.length) {
    console.log(`no hand traces for course "${course}"`);
    process.exit(0);
}

// ---- validate + convert ----------------------------------------------------
const byHole = {}; // holeNumber -> { trace, features }
let skipped = 0;
for (const t of traces) {
    const hole = String(t.data.features?.meta?.physicalHole ?? '');
    if (!hole) { console.error(`skip ${t.id}: no physicalHole`); skipped++; continue; }
    const fs_ = t.data.features?.features || [];
    if (fs_.length > LIMITS.maxFeatures) { console.error(`skip ${t.id}: ${fs_.length} features exceeds the cap`); skipped++; continue; }
    const features = [];
    let bad = null;
    for (const f of fs_) {
        const geo = toGeoFeature({ ...f, _imagery: t.data.source?.imagery || null });
        if (geo.error) { bad = geo.error; break; }
        features.push(geo);
    }
    if (bad) { console.error(`skip ${t.id}: ${bad}`); skipped++; continue; }
    const updatedAt = t.data.updatedAt || '';
    const prev = byHole[hole];
    if (!prev || updatedAt > prev.trace.data.updatedAt) {
        byHole[hole] = { trace: t, features };
    } else {
        console.log(`hole ${hole}: an older trace from ${t.uid} is superseded`);
    }
}

// ---- merge -----------------------------------------------------------------
const coursePath = path.resolve(`public/courses/${course}.json`);
const tracedPath = path.resolve(`public/courses/${course}.traced.json`);
const base = JSON.parse(fs.readFileSync(coursePath, 'utf8'));
let out;
if (fs.existsSync(tracedPath)) {
    out = JSON.parse(fs.readFileSync(tracedPath, 'utf8'));
} else {
    out = JSON.parse(JSON.stringify(base));
    out.source = {
        provider: 'hand-trace',
        tracedAt: new Date().toISOString(),
        licence: 'CC BY-SA',
        attribution: '© State of Queensland (Department of Natural Resources and Mines, Manufacturing and Regional and Rural Development) CC BY-SA',
    };
    out.notes = ['hand-traced holes via the Map this hole card (S6 Part 2)'];
}
out.holes = out.holes || {};
let merged = 0;
for (const [hole, { trace, features }] of Object.entries(byHole)) {
    const h = out.holes[hole];
    if (!h) { console.error(`hole ${hole}: not in ${course}.json, skipped`); skipped++; continue; }
    if (!write) {
        console.log(`[dry-run] hole ${hole}: would merge ${features.length} feature(s) from ${trace.uid}`);
        merged++;
        continue;
    }
    h.features = {
        type: 'FeatureCollection',
        source: {
            provider: 'hand-trace',
            imagery: trace.data.source?.imagery || null,
            tracedAt: trace.data.updatedAt,
        },
        features,
    };
    merged++;
}

if (write) {
    // Public file: drop any identity key, including ones an older export left.
    fs.writeFileSync(tracedPath, JSON.stringify(stripIdentity(out)));
    console.log(`wrote ${tracedPath} (${merged} hole(s) merged, ${skipped} skipped)`);
    console.log('next: node scripts/validate-traced-holes.mjs, then scripts/merge-traced-holes.mjs');
} else {
    console.log(`dry run: ${merged} hole(s) would merge, ${skipped} skipped. Pass --write to write.`);
}
