// ==========================================
// geo.js — small, dependency-free geometry for hole overlays
// ==========================================
//
// Shared by scripts/fetch-osm-holes.mjs (Node, build time) and
// src/hole-overlay.js (browser). Pure functions only; no DOM, no Firebase.
//
// Frames: a "hole frame" is a local metric plane with the tee at the origin
// and the y axis pointing from tee to green centre, so every hole draws
// tee-bottom / green-top regardless of compass heading. Shot curves are
// stored in this frame (metres), never in pixels, so they survive a change
// of canvas size or of base map (schematic -> polygons -> imagery).

const R = 6371008.8; // mean Earth radius, metres
const toRad = (d) => d * Math.PI / 180;
const toDeg = (r) => r * 180 / Math.PI;

/** Great-circle distance in metres between two [lat, lon] points. */
export function distanceM(a, b) {
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

/** Initial compass bearing in degrees (0 = north, 90 = east) from a to b. */
export function bearingDeg(a, b) {
    const φ1 = toRad(a[0]), φ2 = toRad(b[0]), Δλ = toRad(b[1] - a[1]);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Build a hole frame: origin (tee) and the bearing to rotate so that the
 * tee -> green line points "up" (+y).
 */
export function makeFrame(tee, greenCentre) {
    return { origin: [tee[0], tee[1]], bearing: bearingDeg(tee, greenCentre) };
}

/**
 * Project a [lat, lon] into frame metres [x, y]: x to the golfer's right,
 * y towards the green. Equirectangular about the origin is accurate to
 * centimetres over a golf hole.
 */
export function toFrame(frame, p) {
    const lat0 = toRad(frame.origin[0]);
    const east = toRad(p[1] - frame.origin[1]) * Math.cos(lat0) * R;
    const north = toRad(p[0] - frame.origin[0]) * R;
    const θ = toRad(frame.bearing);
    // Rotate so that the bearing direction becomes +y.
    const x = east * Math.cos(θ) - north * Math.sin(θ);
    const y = east * Math.sin(θ) + north * Math.cos(θ);
    return [x, y];
}

/** Inverse of toFrame: frame metres back to [lat, lon]. */
export function fromFrame(frame, xy) {
    const θ = toRad(frame.bearing);
    const east = xy[0] * Math.cos(θ) + xy[1] * Math.sin(θ);
    const north = -xy[0] * Math.sin(θ) + xy[1] * Math.cos(θ);
    const lat0 = toRad(frame.origin[0]);
    return [
        frame.origin[0] + toDeg(north / R),
        frame.origin[1] + toDeg(east / (R * Math.cos(lat0))),
    ];
}

/** Centroid of a ring of [lat, lon] points (simple mean; fine at hole scale). */
export function centroid(ring) {
    let lat = 0, lon = 0;
    for (const p of ring) { lat += p[0]; lon += p[1]; }
    return [lat / ring.length, lon / ring.length];
}

/** Distance in metres from point p to the polyline (array of [lat, lon]). */
export function distanceToLineM(p, line) {
    if (line.length === 1) return distanceM(p, line[0]);
    // Work in a local flat frame around p for the perpendicular test.
    const frame = { origin: p, bearing: 0 };
    const q = [0, 0];
    let best = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
        const a = toFrame(frame, line[i]);
        const b = toFrame(frame, line[i + 1]);
        const abx = b[0] - a[0], aby = b[1] - a[1];
        const len2 = abx * abx + aby * aby;
        let t = len2 === 0 ? 0 : ((q[0] - a[0]) * abx + (q[1] - a[1]) * aby) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = a[0] + t * abx, cy = a[1] + t * aby;
        best = Math.min(best, Math.hypot(cx, cy));
    }
    return best;
}

/** Ray-casting point-in-polygon for a ring of [lat, lon]. */
export function pointInRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
        const hit = ((yi > p[0]) !== (yj > p[0]))
            && (p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi);
        if (hit) inside = !inside;
    }
    return inside;
}

/**
 * Bounding box [minLon, minLat, maxLon, maxLat] of many [lat, lon] points,
 * padded by `padM` metres.
 */
export function bboxWGS84(points, padM = 0) {
    let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
    for (const [lat, lon] of points) {
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    }
    const dLat = toDeg(padM / R);
    const dLon = toDeg(padM / (R * Math.cos(toRad((minLat + maxLat) / 2))));
    return [minLon - dLon, minLat - dLat, maxLon + dLon, maxLat + dLat];
}

/**
 * Assign OSM features to one hole. `hole` is { line: [[lat,lon]...] } and
 * `features` is [{ golf, ring:[[lat,lon]...], ...rest }]. Rule: the green
 * containing or nearest the last vertex, tees
 * near the first vertex, and fairway/bunker/water whose centroid lies
 * within `corridorM` of the hole line.
 */
export function assignFeaturesToHole(hole, features, { corridorM = 45, teeM = 40 } = {}) {
    const first = hole.line[0], last = hole.line[hole.line.length - 1];
    const out = [];
    let green = null, greenD = Infinity;
    for (const f of features) {
        if (!f.ring || f.ring.length < 3) continue;
        const c = centroid(f.ring);
        if (f.golf === 'green') {
            const d = pointInRing(last, f.ring) ? 0 : distanceM(last, c);
            if (d < greenD) { greenD = d; green = f; }
            continue;
        }
        if (f.golf === 'tee') {
            if (distanceM(first, c) <= teeM) out.push(f);
            continue;
        }
        if (distanceToLineM(c, hole.line) <= corridorM) out.push(f);
    }
    if (green && greenD <= 60) out.push(green);
    return out;
}

/**
 * Green front / back from the green ring: nearest and farthest ring vertex
 * from the tee, measured along the hole axis.
 */
export function greenFrontBack(frame, ring) {
    let front = null, back = null, fy = Infinity, by = -Infinity;
    for (const p of ring) {
        const y = toFrame(frame, p)[1];
        if (y < fy) { fy = y; front = p; }
        if (y > by) { by = y; back = p; }
    }
    return { front, back };
}
