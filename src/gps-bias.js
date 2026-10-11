// ============================================================
// gps-bias.js — S5: per-round GPS bias + map matching (PURE)
// ============================================================
// No Firebase, no DOM, no AppState. Everything takes plain data:
//   - estimateBias/applyBias work on {lat, lon} pairs (degrees in,
//     metre maths done locally with the equirectangular approximation,
//     fine at golf-course scales).
//   - snapToPlayable works in the hole frame (metres): the same frame
//     makeFrame(tee, green.centre) builds and toFrame converts into —
//     the overlay's own space — so the polygons come straight from the
//     course file converted once at the call site.
//
// Contracts (S5 brief): never move a fix more than 40 m; median, never
// mean (one bad sample cannot dominate); the caller owns the toggle and
// the raw-vs-corrected display split.

import { makeFrame, toFrame, pointInRing } from './geo.js';

const METRES_PER_DEG_LAT = 111320;
const BUFFER_M = 8;       // playable = shapes buffered by this
const MAX_MOVE_M = 40;    // never move a fix further than this
const STRIP_WIDTH_M = 38; // the schematic corridor width
const MAX_SAMPLES = 5;    // median of the LAST N pairs

function dLatToM(dLat) { return dLat * METRES_PER_DEG_LAT; }
function dLonToM(dLon, refLat) { return dLon * METRES_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180); }
function mToDLat(m) { return m / METRES_PER_DEG_LAT; }
function mToDLon(m, refLat) { return m / (METRES_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180)); }

function median(list) {
    const s = [...list].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ------------------------------------------------------------
// Part A — bias estimate from truth pairs
// ------------------------------------------------------------

/**
 * samples: [{ fix: {lat, lon, accuracyM}, truth: {lat, lon} }]
 * Returns { dLat, dLon, n, rmsM } | null. Median offset of the last
 * MAX_SAMPLES pairs (dLat/dLon are the medians of fix − truth in DEGREES,
 * applied by subtracting). null under 2 pairs. rmsM = the RMS distance,
 * in metres, between the corrected fixes and their truths — the spread
 * AFTER correction, i.e. how much a bias-corrected fix can still be
 * trusted to wobble.
 */
export function estimateBias(samples) {
    if (!Array.isArray(samples) || samples.length < 2) return null;
    const pairs = samples.slice(-MAX_SAMPLES)
        .filter((s) => s?.fix && Number.isFinite(s.fix.lat) && Number.isFinite(s.fix.lon)
            && s?.truth && Number.isFinite(s.truth.lat) && Number.isFinite(s.truth.lon));
    if (pairs.length < 2) return null;

    const refLat = median(pairs.map((s) => s.truth.lat));
    const dLat = median(pairs.map((s) => s.fix.lat - s.truth.lat));
    const dLon = median(pairs.map((s) => s.fix.lon - s.truth.lon));

    // Spread after correction: RMS of |corrected − truth| in metres.
    const residualsM = pairs.map((s) => {
        const n = dLatToM(s.fix.lat - s.truth.lat) - dLatToM(dLat);
        const e = dLonToM(s.fix.lon - s.truth.lon, refLat) - dLonToM(dLon, refLat);
        return Math.hypot(n, e);
    });
    const rmsM = Math.sqrt(residualsM.reduce((a, r) => a + r * r, 0) / residualsM.length);
    // The offset's magnitude in metres (for display: "bias N m from K samples").
    const magM = Math.hypot(dLatToM(dLat), dLonToM(dLon, refLat));

    return { dLat, dLon, n: pairs.length, rmsM, magM };
}

/**
 * fix: {lat, lon, ...} — returns { lat, lon } with the bias subtracted.
 */
export function applyBias(fix, bias) {
    if (!bias || !Number.isFinite(bias.dLat) || !Number.isFinite(bias.dLon)
        || !fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) {
        return fix ? { lat: fix.lat, lon: fix.lon } : fix;
    }
    return { lat: fix.lat - bias.dLat, lon: fix.lon - bias.dLon };
}

// ------------------------------------------------------------
// Geometry (frame metres) — point/segment/polygon distances
// ------------------------------------------------------------

function distToSegmentM(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
    return { x: ax + t * abx, y: ay + t * aby, d: Math.hypot(px - (ax + t * abx), py - (ay + t * aby)) };
}

/**
 * Distance from p to the polygon's RAW boundary; 0 when inside (ray
 * cast). Outside, surface = the closest boundary point and out = the
 * unit outward direction (away from the polygon).
 */
function polygonBoundary(p, ring) {
    if (pointInRing(p, ring)) return { f: 0, surface: null };
    let best = null;
    for (let i = 0; i < ring.length - 1; i++) {
        const s = distToSegmentM(p[0], p[1], ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
        if (!best || s.d < best.d) best = s;
    }
    const dx = p[0] - best.x, dy = p[1] - best.y;
    const len = Math.hypot(dx, dy) || 1;
    return { f: best.d, surface: [best.x, best.y], out: [dx / len, dy / len] };
}

/**
 * Distance to a capsule: the polyline (points, metres) with a half-width.
 * f = the distance to the capsule's RAW surface (0 inside); outside,
 * surface = the closest surface point and out = the unit outward
 * direction.
 */
function capsuleBoundary(p, points, halfWidth) {
    let best = null;
    for (let i = 0; i < points.length - 1; i++) {
        const s = distToSegmentM(p[0], p[1], points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
        if (!best || s.d < best.d) best = s;
    }
    if (!best) return { f: 0, surface: null };
    if (best.d <= halfWidth) return { f: 0, surface: null };
    const dx = p[0] - best.x, dy = p[1] - best.y;
    const len = Math.hypot(dx, dy) || 1;
    const surface = [best.x + (dx / len) * halfWidth, best.y + (dy / len) * halfWidth];
    return { f: best.d - halfWidth, surface, out: [dx / len, dy / len] };
}

// ------------------------------------------------------------
// Part B — the playable union and the snap
// ------------------------------------------------------------

/**
 * Build the playable shapes for a hole, in frame metres. Playable =
 * union of the fairway polygons (or the fairwayLine band at its widths,
 * or the 38 m schematic strip along `line` when the hole has neither —
 * the same corridor the overlay draws), the green polygon(s) and the tee
 * polygon(s). The 8 m buffer is applied at query time, not by inflating
 * the shapes.
 */
export function buildPlayable(hole) {
    const frame = makeFrame([hole.tee.lat, hole.tee.lon], [hole.green.centre.lat, hole.green.centre.lon]);
    const P = (p) => toFrame(frame, [p.lat, p.lon]);
    const polys = [];
    const caps = [];

    const feats = hole.features?.features || [];
    const hasFairwayPoly = feats.some((f) => !f.line && f.properties?.golf === 'fairway');
    for (const f of feats) {
        if (f.line || f.geometry?.type !== 'Polygon') continue;
        const golf = f.properties?.golf;
        if (golf === 'fairway' || golf === 'green' || golf === 'tee') {
            polys.push(f.geometry.coordinates[0].map((c) => toFrame(frame, [c[1], c[0]])));
        }
    }
    if (!hasFairwayPoly && Array.isArray(hole.fairwayLine) && hole.fairwayLine.length >= 2) {
        // The centreline band at its per-point widths (metres).
        caps.push({
            pts: hole.fairwayLine.map((p) => P(p)),
            halfOf: (i) => (Number(hole.fairwayLine[i].widthM) || 35) / 2,
        });
    } else if (!hasFairwayPoly && Array.isArray(hole.line) && hole.line.length >= 2) {
        // The 38 m schematic strip along the centreline.
        caps.push({ pts: hole.line.map((p) => P(p)), halfOf: () => STRIP_WIDTH_M / 2 });
    }
    return { frame, polys, caps };
}

/**
 * xy in the hole frame (metres). Returns { xy, snapped, distM }:
 *  - inside the playable union (or its 8 m buffer) → unchanged,
 *    snapped=false, distM = 0 when strictly inside a shape, else the
 *    distance to the true boundary;
 *  - outside but a move of ≤ 40 m would reach the buffered edge → the
 *    point on that edge, snapped=true, distM = how far the fix moved;
 *  - further than that → unchanged, snapped=false, distM = the distance
 *    to the buffered edge (the golfer really is in the trees; do not
 *    lie).
 */
export function snapToPlayable(xy, hole) {
    const { polys, caps } = buildPlayable(hole);
    let best = null; // { f, surface, out } — the smallest raw boundary distance

    for (const ring of polys) {
        const r = polygonBoundary(xy, ring);
        if (r.f === 0) return { xy: [xy[0], xy[1]], snapped: false, distM: 0 };
        if (!best || r.f < best.f) best = r;
    }
    for (const cap of caps) {
        // Per-segment half-widths: evaluate the capsules around each point.
        for (let i = 0; i < cap.pts.length; i++) {
            const half = cap.halfOf(i);
            const segPts = cap.pts.slice(Math.max(0, i - 1), i + 2);
            if (segPts.length < 2) continue;
            const r = capsuleBoundary(xy, segPts, half);
            if (r.f === 0) return { xy: [xy[0], xy[1]], snapped: false, distM: 0 };
            if (!best || r.f < best.f) best = r;
        }
    }

    if (!best) return { xy: [xy[0], xy[1]], snapped: false, distM: Infinity };

    if (best.f <= BUFFER_M) {
        // Within the buffer: playable, unchanged.
        return { xy: [xy[0], xy[1]], snapped: false, distM: best.f };
    }
    const move = best.f - BUFFER_M; // to the buffered edge
    if (move <= MAX_MOVE_M) {
        return {
            xy: [best.surface[0] + best.out[0] * BUFFER_M, best.surface[1] + best.out[1] * BUFFER_M],
            snapped: true,
            distM: move,
        };
    }
    return { xy: [xy[0], xy[1]], snapped: false, distM: move };
}
