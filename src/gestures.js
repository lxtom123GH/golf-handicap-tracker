// ==========================================
// gestures.js — shared multi-pointer gesture maths (S12 Part C)
// ==========================================
//
// Lifted from hole-mapper.js's pinch-zoom + pan so the wizard overlay and
// the mapper track pointers the same way. One source of truth for:
// - pointer bookkeeping (down/move/up with ids),
// - the two-finger gesture state: pinch scale, pan translation and the
//   rotation by the angle between the pointers,
// - a pure view transform (scale + rotate about a centre) that round-trips.

/**
 * S12 C review B1: the 1-4x zoom clamp applies to the PRODUCT of the zoom
 * at gesture start and the raw pinch ratio — the tracker returns the raw
 * ratio; both callers (hole-overlay, hole-mapper) clamp through this.
 */
export function clampGestureZoom(startK, ratio) {
    return Math.max(1, Math.min(4, startK * ratio));
}

/**
 * Track active pointers; the two-finger gesture deltas come back from
 * move() relative to where the second finger landed.
 */
export function createGestureTracker() {
    const pointers = new Map(); // pointerId -> [x, y]
    let g0 = null;              // snapshot when the 2nd pointer landed

    const snapshot = () => {
        const [a, b] = [...pointers.values()];
        return {
            dist: Math.hypot(a[0] - b[0], a[1] - b[1]),
            angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
            mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        };
    };

    return {
        /** Register a pointer; returns the active count. */
        down(id, p) {
            pointers.set(id, p);
            if (pointers.size === 2) g0 = snapshot();
            return pointers.size;
        },
        /**
         * Update a pointer; with two down, returns the gesture deltas
         * { scale, rotateRad, panPx } relative to the gesture start, else null.
         */
        move(id, p) {
            if (!pointers.has(id)) return null;
            pointers.set(id, p);
            if (pointers.size === 2 && g0) {
                const now = snapshot();
                // S12 C review B1: return the RAW ratio — the [1,4] clamp
                // belongs on the PRODUCT (zoom-at-start x ratio) in each
                // caller (clampGestureZoom). Clamping the ratio here made
                // pinch-in impossible (ratio < 1 became exactly 1).
                // A degenerate start (both fingers on one pixel) divides by
                // zero — hold the scale rather than poisoning the view.
                const scale = g0.dist > 0 ? now.dist / g0.dist : 1;
                return {
                    scale,
                    rotateRad: now.angle - g0.angle,
                    panPx: [now.mid[0] - g0.mid[0], now.mid[1] - g0.mid[1]],
                };
            }
            return null;
        },
        /** Release a pointer; the gesture ends when fewer than two remain. */
        up(id) {
            pointers.delete(id);
            if (pointers.size < 2) g0 = null;
            return pointers.size;
        },
        get count() { return pointers.size; },
    };
}

/**
 * Pure scale+rotate-about-a-centre transform (S12 C: the wizard map's
 * gesture view). Rotation is a VIEW rotation — stored geometry stays in
 * the hole frame; callers rotate at draw time and un-rotate at input time.
 * fwd and inv are exact inverses of each other.
 *
 * @param {{scale?:number, rotateRad?:number, centre?:number[]}} t
 */
export function viewTransform({ scale = 1, rotateRad = 0, centre = [0, 0] } = {}) {
    const c = Math.cos(rotateRad), sn = Math.sin(rotateRad);
    const [cx, cy] = centre;
    return {
        fwd: ([x, y]) => [
            cx + scale * ((x - cx) * c - (y - cy) * sn),
            cy + scale * ((x - cx) * sn + (y - cy) * c),
        ],
        inv: ([x, y]) => {
            const dx = (x - cx) / scale, dy = (y - cy) / scale;
            return [cx + dx * c + dy * sn, cy - dx * sn + dy * c];
        },
    };
}
