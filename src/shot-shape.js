/**
 * shot-shape.js — pure geometry for S1 Part A (brief:
 * docs/agent-briefs/overlay-followons/S1-derive-taps-from-curves.md).
 *
 * Curves are metres in the hole frame (src/geo.js): x = right of the
 * tee-green axis, y = down-range toward the hole. No imports: this file
 * must stay DOM- and Firebase-free.
 *
 * All labels assume a right-handed golfer; a later profile.handedness
 * flips them at the UI layer.
 */

export const SHAPE_THRESHOLDS = {
    /** Chord (first->last) under this: the curve is too short to say. */
    minChordM: 15,
    /** |start angle| beyond this many degrees is Left/Right. */
    startAngleDeg: 4,
    /** |bend| at or under this is Straight. */
    bendStraightM: 3,
    /** |bend| beyond this is Hook/Slice (between: Draw/Fade). */
    bendShapedM: 10,
    /** |finish offset| at or under this on both axes is On Target. */
    missOnTargetM: 10,
    /** Fraction of cumulative length where start angle is sampled. */
    startSampleFraction: 0.2,
};

function normalise(pts) {
    if (!Array.isArray(pts)) return null;
    const out = [];
    for (const p of pts) {
        if (Array.isArray(p)) {
            if (p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') return null;
            out.push([p[0], p[1]]);
        } else if (p && typeof p === 'object' && typeof p.x === 'number' && typeof p.y === 'number') {
            out.push([p.x, p.y]);
        } else {
            return null;
        }
    }
    return out;
}

function dist(a, b) {
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Point at `fraction` of the polyline's cumulative length (linear interp). */
function pointAtFraction(pts, fraction) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
        const d = dist(pts[i - 1], pts[i]);
        segs.push(d);
        total += d;
    }
    const target = total * fraction;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
        const d = segs[i - 1];
        if (acc + d >= target && d > 0) {
            const t = (target - acc) / d;
            return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
                pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
        }
        acc += d;
    }
    return pts[pts.length - 1];
}

/**
 * Classify a curve in hole-frame metres ([{x,y}] or [[x,y]]).
 * Returns null fields when the curve is too short to say.
 */
export function classifyCurve(pts, { intended = null, endpointOnly = false, deflectAt = null } = {}) {
    const nulls = { startLine: null, shape: null, carryM: null, startAngleDeg: null, bendM: null, finishOffset: null };
    const p = normalise(pts);
    if (!p || p.length < 2) return { ...nulls };
    const chord = dist(p[0], p[p.length - 1]);
    if (chord < SHAPE_THRESHOLDS.minChordM) return { ...nulls };

    // S12 D2: a deflected actual classifies on the pre-kick segment [0..k]
    // only — the shot's shape and start line are what the ball did BEFORE
    // it hit something. Carry and finish offset stay true (the real end).
    const k = Number.isInteger(deflectAt) && deflectAt > 0 && deflectAt < p.length - 1 ? deflectAt : null;
    const shapePts = k != null ? p.slice(0, k + 1) : p;

    // Start angle: hole axis is +y; + angle = right of it.
    const s = pointAtFraction(shapePts, SHAPE_THRESHOLDS.startSampleFraction);
    const startAngleDeg = Math.atan2(s[0] - p[0][0], s[1] - p[0][1]) * 180 / Math.PI;

    // Bend: largest-magnitude signed perpendicular offset from the chord.
    // Right normal of the travel direction: positive = curved right.
    const dx = shapePts[shapePts.length - 1][0] - p[0][0];
    const dy = shapePts[shapePts.length - 1][1] - p[0][1];
    const segChord = Math.max(dist(p[0], shapePts[shapePts.length - 1]), 1e-6);
    const nx = dy / segChord;
    const ny = -dx / segChord;
    let bendM = 0;
    for (const q of shapePts) {
        const perp = (q[0] - p[0][0]) * nx + (q[1] - p[0][1]) * ny;
        if (Math.abs(perp) > Math.abs(bendM)) bendM = perp;
    }

    const startLine = startAngleDeg < -SHAPE_THRESHOLDS.startAngleDeg ? 'Left'
        : startAngleDeg > SHAPE_THRESHOLDS.startAngleDeg ? 'Right' : 'Straight';
    const absBend = Math.abs(bendM);
    let shape = 'Straight';
    if (absBend > SHAPE_THRESHOLDS.bendShapedM) shape = bendM > 0 ? 'Slice' : 'Hook';
    else if (absBend > SHAPE_THRESHOLDS.bendStraightM) shape = bendM > 0 ? 'Fade' : 'Draw';

    let finishOffset = null;
    const ip = normalise(intended);
    if (ip && ip.length >= 2) {
        const ae = p[p.length - 1];
        const ie = ip[ip.length - 1];
        finishOffset = { longM: ae[1] - ie[1], rightM: ae[0] - ie[0] };
    }

    // S9: endpoint-only shots (flight unseen + a GPS finish) have carry and
    // offset but no shape or start line — the flight was never seen.
    if (endpointOnly) {
        return { startLine: null, shape: null, carryM: Math.round(chord), startAngleDeg: null, bendM: null, finishOffset };
    }

    return { startLine, shape, carryM: Math.round(chord), startAngleDeg, bendM, finishOffset };
}

/**
 * 'On Target' | 'Long' | 'Short' | 'Left' | 'Right' | 'Long Left' | ... | null
 * Strings follow the existing index.html missPattern data-vals.
 */
export function missPatternFrom(finishOffset) {
    if (!finishOffset || typeof finishOffset.longM !== 'number' || typeof finishOffset.rightM !== 'number') return null;
    const t = SHAPE_THRESHOLDS.missOnTargetM;
    if (Math.abs(finishOffset.longM) <= t && Math.abs(finishOffset.rightM) <= t) return 'On Target';
    const longPart = finishOffset.longM > t ? 'Long' : finishOffset.longM < -t ? 'Short' : '';
    const rightPart = finishOffset.rightM > t ? 'Right' : finishOffset.rightM < -t ? 'Left' : '';
    if (longPart && rightPart) return `${longPart} ${rightPart}`;
    return longPart || rightPart;
}
