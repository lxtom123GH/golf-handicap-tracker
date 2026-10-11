import { toFrame, fromFrame, pointInRing } from './geo.js';

const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const validLL = p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite)
    && Math.abs(p[0]) < 90 && Math.abs(p[1]) <= 180;

/** Targets on the player → centre ray (continued through the green), [lat, lon].
 * On the green, front is zero metres; at the centre there is no direction,
 * so use fixed points. Missing/invalid geometry preserves those exact points.
 */
export function greenTargetsFromPlayer(player, centre, features, fixed) {
    const fallback = { ...fixed, mode: 'fixed' };
    if (!validLL(player) || !validLL(centre)) return fallback;
    const feature = features?.features?.find?.(f => f?.properties?.golf === 'green');
    const rings = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== 'Polygon' || !Array.isArray(rings) || rings.length !== 1) return fallback;
    const coords = rings[0];
    if (!Array.isArray(coords) || coords.length < 3) return fallback;
    const ring = coords.map(p => Array.isArray(p) ? [p[1], p[0]] : null);
    if (!ring.every(validLL) || !pointInRing(centre, ring)) return fallback;

    const frame = { origin: centre, bearing: 0 };
    const p = toFrame(frame, player);
    const direction = [-p[0], -p[1]];
    if (Math.hypot(...direction) < 0.001) return fallback;
    const vertices = ring.map(ll => toFrame(frame, ll));
    let area = 0;
    const hits = [];
    for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i], b = vertices[(i + 1) % vertices.length];
        area += cross(a, b);
        const edge = [b[0] - a[0], b[1] - a[1]];
        const denominator = cross(direction, edge);
        if (Math.abs(denominator) < 1e-9) continue;
        const offset = [a[0] - p[0], a[1] - p[1]];
        const t = cross(offset, edge) / denominator;
        const u = cross(offset, direction) / denominator;
        if (t >= -1e-8 && u >= -1e-8 && u <= 1 + 1e-8) hits.push(Math.max(0, t));
    }
    if (Math.abs(area) < 0.01 || !hits.length) return fallback;
    hits.sort((a, b) => a - b);
    const entry = pointInRing(player, ring) ? 0 : hits[0];
    const exit = hits[hits.length - 1];
    if (exit < 1 || exit - entry < 1e-8) return fallback;
    const at = t => fromFrame(frame, [p[0] + t * direction[0], p[1] + t * direction[1]]);
    return { front: entry === 0 ? player : at(entry), back: at(exit), mode: 'from you' };
}
