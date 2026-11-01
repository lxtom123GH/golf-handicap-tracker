// ==========================================
// hole-overlay.js — draw the hole, then draw the shot on it
// ==========================================
//
// Owner's idea (2026-09-16): before a shot, swipe the intended line and
// finish on an overlay of the hole; after it, swipe what actually happened.
// Intent-versus-result per club over many rounds is the data.
//
// Data: public/courses/<slug>.json from scripts/fetch-osm-holes.mjs (OSM
// polygons where OSM has them — Ashgrove, Redcliffe — else the hole line
// and pin, else nothing). Rendering is a rotated local-metre frame with the
// tee at the bottom and the green at the top (src/geo.js). Curves are
// stored in that frame in metres, never in pixels.
//
// No AppState writes happen here: the caller gets `onChange` and decides
// where the curve goes (score-input.js puts it on currentShotData).

import { makeFrame, toFrame, distanceM } from "./geo.js";
import { createGestureTracker, clampGestureZoom } from "./gestures.js";

// EPSG:3857 (Web Mercator) inverse — the Queensland ImageServer reports its
// export extent in this CRS. S6 Part 1 maps the extent's corners to lat/lon
// so the hole frame can place the image. Pure and exported for the unit test.
const MERC_R = 6378137;
export function mercatorToLonLat(x, y) {
    return [
        (x / MERC_R) * 180 / Math.PI,
        (2 * Math.atan(Math.exp(y / MERC_R)) - Math.PI / 2) * 180 / Math.PI,
    ];
}

const SLUGS = ['keperra', 'ashgrove', 'redcliffe', 'virginia'];
const cache = new Map();

/** Which overlay file a COURSE_DATA course name maps to, or null. */
export function courseSlugFor(courseName) {
    const n = String(courseName || '').toLowerCase();
    return SLUGS.find(s => n.includes(s)) || null;
}

/** Fetch (once) the overlay file for a course; null when absent or offline.
 * Only a loaded file is kept: a failed or empty fetch is forgotten, so the
 * next caller tries again (off Keperra the GPS greens come from this file). */
export async function loadCourseOverlay(slug) {
    if (!slug) return null;
    if (cache.has(slug)) return cache.get(slug);
    const p = fetch(`/courses/${slug}.json`)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
        .then(data => {
            // A hole without a usable frame follows the existing no-map path.
            // Both the renderer and GPS capture need these four coordinates;
            // letting a partial hole through can reject the pending shot save.
            const holes = Object.entries(data?.holes || {});
            const usable = holes.filter(([, hole]) => [
                hole?.tee?.lat, hole?.tee?.lon,
                hole?.green?.centre?.lat, hole?.green?.centre?.lon,
            ].every(Number.isFinite));
            if (usable.length !== holes.length) data = { ...data, holes: Object.fromEntries(usable) };
            if (!data && cache.get(slug) === p) cache.delete(slug);
            return data;
        });
    cache.set(slug, p);
    return p;
}

const FILL = {
    fairway: '#a3e635', green: '#4ade80', tee: '#86efac',
    bunker: '#fde68a', water_hazard: '#93c5fd', lateral_water_hazard: '#93c5fd', rough: '#bbf7d0',
};
const DRAW_ORDER = ['rough', 'fairway', 'water_hazard', 'lateral_water_hazard', 'bunker', 'tee', 'green'];
const CURVE = { intended: '#2563eb', actual: '#f97316' };

/**
 * Catmull-Rom through pixel points p, as cubic Béziers (tension 1/6).
 * Exported for S2's intent panel (same spline, different canvas).
 */
export function splinePath(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    if (p.length === 2) { ctx.lineTo(p[1][0], p[1][1]); return; }
    for (let i = 0; i < p.length - 1; i++) {
        const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
        ctx.bezierCurveTo(
            p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
            p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
            p2[0], p2[1]);
    }
}

/**
 * S12 A2: every shot has exactly one start point. The raw swipe's first
 * sample is dropped and replaced by the anchor — before simplification —
 * so both curves begin at the ball no matter where the thumb landed.
 * Old shots re-render as stored (this runs only on pointer-up).
 */
export function anchorCurve(points, anchor) {
    if (!anchor) return (points || []).slice();
    return [[anchor[0], anchor[1]], ...(points || []).slice(1)];
}

/** Move each stored curve's first point with a later GPS or marker anchor. */
export function reanchorCurves(curves, anchor) {
    if (!curves || !anchor) return curves;
    let changed = false;
    const next = { ...curves };
    for (const mode of ['intended', 'actual']) {
        const points = curves[mode];
        if (!Array.isArray(points) || points.length < 2) continue;
        if (points[0][0] === anchor[0] && points[0][1] === anchor[1]) continue;
        next[mode] = anchorCurve(points, anchor);
        changed = true;
    }
    return changed ? next : curves;
}

/**
 * S11: the part of the hole that matters for the shot being logged, as a
 * hole-frame extent (metres). Three bands by distance from the start point
 * to the green centre; the start and the green always both fit.
 *   full     (d > 240): 30 m behind the start to min(d, 300)+40 ahead, ±70 m
 *   approach (40 < d ≤ 240): 20 m behind to the green's far edge + 25, ±50 m
 *   green    (d ≤ 40): the green with 20 m padding
 */
/**
 * S12 B2: the padded extent that fits every point — the auto-extend target.
 * Each axis pads by 15% of its own span; a span below MIN_EXTENT (40 m) is
 * widened to it first so a single point still frames a usable area.
 * @param {Array<[number,number]>} points
 * @param {number} pad fraction (0.15)
 */
export function fitBounds(points, pad = 0.15) {
    const MIN_EXTENT = 40;
    const pts = (points || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!pts.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const spanX = Math.max(maxX - minX, MIN_EXTENT), spanY = Math.max(maxY - minY, MIN_EXTENT);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const hx = spanX / 2 * (1 + pad * 2), hy = spanY / 2 * (1 + pad * 2);
    return { minX: cx - hx, maxX: cx + hx, minY: cy - hy, maxY: cy + hy };
}

/**
 * S12 B2: the pure re-frame trigger — true when a pointer in device pixels
 * sits within `margin` px of any canvas edge (pointer capture keeps events
 * flowing outside the element, so negatives count as "at the edge").
 */
export function nearEdge(px, py, w, h, margin = 24) {
    return px <= margin || px >= w - margin || py <= margin || py >= h - margin;
}

export function computeShotView(startXY, greenC, greenDepthM = 30, reachM = 240) {
    const [sx, sy] = startXY, [gx, gy] = greenC;
    const d = Math.hypot(gx - sx, gy - sy);
    const half = Math.max(12, greenDepthM / 2);
    let band, minY, maxY, halfW;
    // A full shot frames the landing zone (a drive carries ~200-240 m for
    // this app's players), not the green: that is what makes the drawing
    // area bigger than the whole-hole view on a 375 px phone.
    if (d > reachM) { band = 'full'; minY = sy - 30; maxY = sy + Math.min(d, reachM) + 30; halfW = 60; }
    else if (d > 40) { band = 'approach'; minY = sy - 20; maxY = gy + half + 25; halfW = 50; }
    else { band = 'green'; minY = gy - half - 20; maxY = gy + half + 20; halfW = 40; }
    const minX = Math.min(sx, gx) - halfW, maxX = Math.max(sx, gx) + halfW;
    if (band === 'full') { return { band, minX: Math.min(sx - halfW, minX), maxX: Math.max(sx + halfW, maxX), minY, maxY }; }
    return { band, minX, maxX, minY, maxY };
}

/**
 * Mount the overlay on a <canvas>. Returns a controller:
 *   setMode('intended'|'actual'), clear(mode), getCurves(), destroy(),
 *   setViewMode('shot'|'hole'), metresPerPx().
 * `curves` may carry existing {intended, actual} arrays of [xM, yM].
 * `focus` ({ startXY:[x,y]|null, shotNumber }) enables the S11 shot view;
 * `viewMode` defaults to 'shot' when focus is given, else 'hole'.
 */
// Touch-to-measure: the long-press target's two distances, in metres.
// Frame metres are true metres (geo.js toFrame is an equirectangular
// projection), so a plain hypot is the distance. `anchorXY` is the ball (or
// the tee [0,0] when there is no anchor); `greenXY` is the green centre.
export const MEASURE_HOLD_MS = 350;
export const MEASURE_SLOP_PX = 8;
export function measureDistances(anchorXY, targetXY, greenXY) {
    const a = anchorXY || [0, 0];
    return {
        fromBallM: Math.hypot(targetXY[0] - a[0], targetXY[1] - a[1]),
        toPinM: Math.hypot(greenXY[0] - targetXY[0], greenXY[1] - targetXY[1]),
    };
}
export function measureLabel({ fromBallM, toPinM }) {
    return `${Math.round(fromBallM)} m · ${Math.round(toPinM)} to pin`;
}

export function mountHoleOverlay(canvas, hole, { curves = {}, mode = 'intended', ghosts = null, ghostMode = 'intended', startMarker = null, finishDot = null, imagery = null, contextImagery = null, plan = null, focus = null, viewMode = null, onStartDrag = null, onChange, startXY = null, startMeasured = false, autoRotate = false, deflectArmed = null, onDeflectPlaced = null, readOnly = false, fill = false, fitInsets = null, featureStyle = 'solid', anchorFirst = false } = {}) {
    const tee = [hole.tee.lat, hole.tee.lon];
    const gc = [hole.green.centre.lat, hole.green.centre.lon];
    const frame = makeFrame(tee, gc);
    const P = (ll) => toFrame(frame, ll);

    // Everything we will draw, in frame metres, to size the view.
    // Polygons and lines only; Point landmarks (brief §7b.4) are data for
    // later features and must not reach the polygon path, whose destructuring
    // would throw on a bare [lon, lat].
    const feats = (hole.features?.features || [])
        .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'LineString'))
        .map(f => ({
            golf: f.properties.golf,
            pts: (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates)
                .map(([lon, lat]) => P([lat, lon])),
            line: f.geometry.type === 'LineString',
        }));
    const lineM = (hole.line || []).map(p => P([p.lat, p.lon]));
    // Brief §7b: fairway as a centreline with widths (metres), stroked as a band.
    const fairwayM = (hole.fairwayLine || []).map(p => ({ xy: P([p.lat, p.lon]), w: Number(p.widthM) || 35 }));
    const greenM = { c: P(gc), f: hole.green.front ? P([hole.green.front.lat, hole.green.front.lon]) : null, b: hole.green.back ? P([hole.green.back.lat, hole.green.back.lon]) : null };
    // Schematic strip whenever there is no fairway polygon: a hole with only
    // a traced green (Keperra after trace run 2) still needs a corridor to
    // draw on, and the real green then sits on top of it.
    const schematic = !feats.some(f => !f.line && f.golf === 'fairway');
    const all = [[0, 0], greenM.c, ...lineM, ...feats.flatMap(f => f.pts),
        ...fairwayM.flatMap(p => [[p.xy[0] - p.w / 2, p.xy[1]], [p.xy[0] + p.w / 2, p.xy[1]]])];
    if (schematic) all.push([-30, -10], [30, -10], [-30, greenM.c[1] + 25], [30, greenM.c[1] + 25]);
    // Whole-hole extent (also the inset's frame).
    const holeExt = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const [x, y] of all) { holeExt.minX = Math.min(holeExt.minX, x); holeExt.maxX = Math.max(holeExt.maxX, x); holeExt.minY = Math.min(holeExt.minY, y); holeExt.maxY = Math.max(holeExt.maxY, y); }
    const edgeM = 12;
    holeExt.minX -= edgeM; holeExt.maxX += edgeM; holeExt.minY -= edgeM; holeExt.maxY += edgeM;

    // S11: the shot view frames what matters for this shot (three distance
    // bands from the start point); the hole view is the old whole-hole fit.
    // Stored curves are hole-frame metres either way — only the window moves.
    const greenDepth = greenM.f && greenM.b ? Math.hypot(greenM.b[0] - greenM.f[0], greenM.b[1] - greenM.f[1]) : 28;
    let shotExt = focus ? computeShotView(focus.startXY || [0, 0], greenM.c, greenDepth, focus.reachM || 240) : null;
    let currentView = viewMode || (shotExt ? 'shot' : 'hole');
    // S12 B2: auto-extend — when a stroke runs the shot view past the frame,
    // the view re-fits {anchor, stroke so far, green} and is remembered here
    // until the mode switches.
    let _view = null;
    let _tween = null;

    // Fit: width comes from the element, height from the extent's aspect,
    // clamped so an SE still sees the club buttons below it. Re-run on a
    // view switch; the canvas height may change between modes.
    const cssW = Math.max(200, Math.round(canvas.getBoundingClientRect().width || canvas.clientWidth || 320));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let minX, maxX, minY, maxY, cssH, s, ox, oy;
    let viewChip = null; // glass chips PR 5 — built below, once the view exists
    // Scale + offsets for the current extent. Two kinds of inset keep the
    // hole clear of what floats over the canvas:
    // - fitInsets (play mode): fixed px for the play-mode chips;
    // - pad (Map first full-screen, owner 2026-10-05: "can the map with the
    //   glass chips take up the entire screen?"): the canvas fills the
    //   viewport and the glass header/dock float OVER it; pad is how much of
    //   the canvas they cover, measured in applyView. Rotation pivots on the
    //   window between them and canvas-anchored chips clear the bars.
    const insetTop = Math.max(0, Number(fitInsets?.top) || 0);
    const insetBottom = Math.max(0, Number(fitInsets?.bottom) || 0);
    let pad = { top: 0, bottom: 0 };
    function fitScale() {
        const top = insetTop + pad.top, bottom = insetBottom + pad.bottom;
        const availH = Math.max(pad.top || pad.bottom ? 40 : 80, cssH - top - bottom);
        s = Math.min(cssW / (maxX - minX), availH / (maxY - minY));
        ox = (cssW - (maxX - minX) * s) / 2;
        oy = bottom + (availH - (maxY - minY) * s) / 2; // oy is the bottom margin
        if (fill) { // play mode: the fitted frame, for layout checks
            canvas.dataset.fitW = String(Math.round((maxX - minX) * s));
            canvas.dataset.fitH = String(Math.round((maxY - minY) * s));
            canvas.dataset.fitTop = String(Math.round(cssH - oy - (maxY - minY) * s));
        }
    }
    // The rotation/zoom pivot: the centre of the window between the Map-first
    // bars (the canvas centre everywhere else, as before).
    const pivot = () => [cssW / 2, pad.top + Math.max(40, cssH - pad.top - pad.bottom) / 2];
    function applyView() {
        const ext = currentView === 'shot' ? (_view || shotExt) : holeExt;
        if (!ext) return;
        minX = ext.minX; maxX = ext.maxX; minY = ext.minY; maxY = ext.maxY;
        const aspect = (maxY - minY) / (maxX - minX);
        // S12 A2 review: the canvas bottom must stay above the wizard's
        // sticky footer without scrolling — the shared rule from S10/S11,
        // now mechanical. The footer is sticky: it overlays the card's
        // visible bottom (bottom:-15px), so the space the canvas may use
        // is footer top − canvas top − 8. When the footer is in flow (a
        // short card) its top tracks the canvas and the cap is a no-op.
        // The 200 px readability floor yields to the footer rule down to
        // 140 px; no wizard chrome (mapper tests, plan cards) → 300 ceiling.
        // S12 B1: draw mode is exempt — the section is fixed full-screen,
        // so the space is the viewport minus the 64 px top bar and the
        // 56 px bottom row.
        let cap = 300;
        let fullScreen = false; // Map first (not play mode's `fill` option)
        pad = { top: 0, bottom: 0 };
        try {
            const wizard = canvas.closest('#oncourse-wizard');
            if (wizard?.classList.contains('map-first')) {
                // Map first: the canvas IS the screen. Measure the floating
                // glass header (bottom) and the highest docked control (top)
                // so the hole fits the window between them.
                const cTop = canvas.getBoundingClientRect().top;
                cap = Math.max(240, Math.floor(window.innerHeight - cTop));
                fullScreen = true;
                const head = wizard.querySelector('#wizard-step')?.getBoundingClientRect();
                const tops = ['.line-tools', '#line-readout', '#section-lie', '#section-putting-outcome', '#section-weapon', '.wizard-footer']
                    .map(sel => wizard.querySelector(sel)?.getBoundingClientRect())
                    .filter(r => r && r.height > 0 && Number.isFinite(r.top))
                    .map(r => r.top);
                const floor = tops.length ? Math.min(...tops) : window.innerHeight;
                pad = {
                    top: head && head.height > 0 ? Math.max(0, Math.round(head.bottom - cTop)) : 0,
                    bottom: Math.max(0, Math.round(cTop + cap - floor)),
                };
            } else if (wizard?.classList.contains('draw-mode')) {
                cap = Math.max(240, window.innerHeight - 64 - 56 - 8);
            } else {
                const footer = wizard?.querySelector('.wizard-footer');
                if (wizard && footer) {
                    const available = footer.getBoundingClientRect().top
                        - canvas.getBoundingClientRect().top - 8;
                    // Owner 2026-09-20 ("still not taking up as much of the
                    // screen as I'd like"): the 300 px ceiling was the limit on
                    // a modern phone, not the footer. Let the map take every
                    // pixel down to the footer; 560 only stops a tablet.
                    cap = Math.max(140, Math.min(560, Math.floor(available)));
                }
            }
        } catch { /* measuring must never break the mount */ }
        cssH = fullScreen ? cap : Math.max(140, Math.min(cap, Math.round(cssW * aspect)));
        // Play mode (owner 2026-10-06): the map IS the round screen — it
        // takes the whole container, and the hole is fitted between the
        // glass chips at the top and bottom (fitInsets, px).
        if (fill) cssH = Math.max(140, Math.round(canvas.parentElement?.getBoundingClientRect().height || window.innerHeight));
        canvas.width = cssW * dpr; canvas.height = cssH * dpr;
        canvas.style.height = `${cssH}px`;
        canvas.parentElement?.style.setProperty('--map-pad-top', `${pad.top}px`);
        canvas.parentElement?.style.setProperty('--map-pad-bottom', `${pad.bottom}px`);
        fitScale();
        canvas.dataset.viewMode = currentView;
        // applyView runs on mount before the chip exists: viewChip is a
        // plain `let` declared above the first applyView() and stays null
        // until the chip is built. (A hoisted-var flag was folded away by
        // the minifier and crashed the mount in the production build.)
        if (viewChip) { syncViewChip(); placeViewChip(); }
        canvas.dataset.mpp = String(Math.round((1 / (s * view2.k)) * 1000) / 1000);
        // Resizing the bitmap resets the 2D context, including the dpr
        // transform set at mount — re-apply it or everything draws at 1/dpr.
        const c2 = canvas.getContext('2d');
        c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // S12 C: the gesture view — scale (1-4x), rotation about the canvas
    // centre and pan, on TOP of the automatic view. Stored geometry stays
    // in the hole frame: rotate at draw time (toPx), un-rotate at input
    // time (toM). autoRotate points the shot view up along anchor → green.
    // Declared BEFORE the first applyView() call — applyView writes mpp
    // through it.
    const view2 = { k: 1, rot: 0, panX: 0, panY: 0 };
    let _autoRot = 0;
    // In base px the y axis flips, so the from→green direction is
    // (gdx, −gdy); rotate it onto screen-up (0, −1).
    const rotFrom = (xy) => -Math.PI / 2 - Math.atan2(-(greenM.c[1] - xy[1]), greenM.c[0] - xy[0]);
    if (autoRotate && currentView === 'shot' && shotExt && focus?.startXY) {
        _autoRot = rotFrom(focus.startXY);
        view2.rot = _autoRot;
    }
    // Owner 2026-10-05 ("like a GPS map ... direction of travel"): the live
    // GPS position, hole-frame metres. While the view is automatic (no
    // pinch/rotate by the golfer) the shot view re-centres on it and turns so
    // you → green points up. The shot's recorded start never moves with it.
    let liveXY = null;
    // Codex P2: inside this distance of the green centre a few metres of GPS
    // error swings the you → green bearing wildly, so the map holds its last
    // heading and framing there and only the dot moves.
    const HOLD_HEADING_M = 40;
    function followLive(xy) {
        // Codex P2 (post-merge review): re-centring does not depend on the
        // rotation - with Rotate map off the view still follows you (tee-up);
        // only the bearing stays put.
        if (!(focus && viewIsAutomatic() && !state.drawing && currentView === 'shot')) return false;
        if (Math.hypot(greenM.c[0] - xy[0], greenM.c[1] - xy[1]) < HOLD_HEADING_M) return false;
        shotExt = computeShotView(xy, greenM.c, greenDepth, focus.reachM || 240);
        if (autoRotate) {
            _autoRot = rotFrom(xy);
            view2.rot = _autoRot;
        }
        _view = null;
        applyView();
        canvas.dataset.autoRot = String(Math.round(_autoRot * 1000) / 1000);
        canvas.dataset.follow = xy.map(v => Math.round(v)).join(',');
        redraw();
        return true;
    }
    const viewIsAutomatic = () => view2.k === 1 && view2.rot === _autoRot
        && view2.panX === 0 && view2.panY === 0;
    applyView();
    const toPx = ([x, y]) => {
        const bx = ox + (x - minX) * s, by = cssH - oy - (y - minY) * s;
        if (view2.k === 1 && view2.rot === 0 && view2.panX === 0 && view2.panY === 0) return [bx, by];
        const [cx, cy] = pivot();
        const dx = bx - cx, dy = by - cy;
        const c = Math.cos(view2.rot), sn = Math.sin(view2.rot);
        return [cx + view2.k * (dx * c - dy * sn) + view2.panX, cy + view2.k * (dx * sn + dy * c) + view2.panY];
    };
    const toM = ([px, py]) => {
        if (view2.k === 1 && view2.rot === 0 && view2.panX === 0 && view2.panY === 0) {
            return [(px - ox) / s + minX, (cssH - oy - py) / s + minY];
        }
        const [cx, cy] = pivot();
        const dx = (px - view2.panX - cx) / view2.k, dy = (py - view2.panY - cy) / view2.k;
        const c = Math.cos(view2.rot), sn = Math.sin(view2.rot);
        const bx = cx + dx * c + dy * sn, by = cy - dx * sn + dy * c;
        return [(bx - ox) / s + minX, (cssH - oy - by) / s + minY];
    };

    // S12 C: the Reset chip — any manual gesture shows it; tapping returns
    // to the automatic view (auto-rotate included) and hides it again.
    const resetChip = document.createElement('button');
    resetChip.type = 'button';
    resetChip.textContent = 'Reset';
    resetChip.className = 'map-reset-chip hidden';
    resetChip.setAttribute('aria-label', 'Reset the map view');
    canvas.parentElement?.appendChild(resetChip);
    resetChip.addEventListener('click', () => {
        view2.k = 1; view2.rot = _autoRot; view2.panX = 0; view2.panY = 0;
        resetChip.classList.add('hidden');
        // Codex P2: fixes that arrived while the golfer had the view are
        // applied now, so Reset snaps back to where you actually stand.
        if (liveXY && followLive(liveXY)) return;
        _view = null; applyView(); redraw();
    });

    // Glass chips PR 5 (owner-approved mockup 2026-10-04): a visible Hole /
    // Shot chip, top-left — the inset tap below was the only switch and
    // nobody found it. A real button, so it never starts a stroke, a
    // gesture or a measure. Only when both views exist (shotExt).
    const chipEl = document.createElement('button');
    chipEl.type = 'button';
    chipEl.className = 'map-view-chip';
    function syncViewChip() {
        // The label names the view a tap switches TO.
        const toHole = currentView === 'shot';
        chipEl.textContent = toHole ? '⛳ Hole' : '🎯 Shot';
        chipEl.setAttribute('aria-label', toHole ? 'Show the whole hole' : 'Show this shot');
        chipEl.setAttribute('aria-pressed', String(currentView === 'hole'));
    }
    // Bottom-left of the canvas (positioned against it, not #section-line,
    // whose tools row sits above): the top-left is ✎ + the length label,
    // the top-right is the inset + Reset. Re-placed whenever the canvas
    // height changes (applyView).
    function placeViewChip() {
        if (!chipEl.isConnected) return;
        chipEl.style.left = `${canvas.offsetLeft + 8}px`;
        chipEl.style.top = `${canvas.offsetTop + canvas.offsetHeight - pad.bottom - 52}px`;
    }
    function toggleView() {
        currentView = currentView === 'shot' ? 'hole' : 'shot';
        _view = null; // S12 B2: the auto-extend frame is shot-view only
        applyView(); redraw();
    }
    if (shotExt) {
        syncViewChip();
        canvas.parentElement?.appendChild(chipEl);
        placeViewChip();
        chipEl.addEventListener('click', toggleView);
        viewChip = chipEl;
    }

    // S11 inset: a 72 px whole-hole thumbnail, top-right, showing the current
    // window. Tapping it toggles shot ↔ hole view. Only drawn when both
    // views exist.
    const INSET = { size: 72, margin: 6 };
    function insetBox() { return { x: cssW - INSET.size - INSET.margin, y: INSET.margin + pad.top + (fill ? insetTop : 0), w: INSET.size, h: INSET.size }; }
    function inInset(px, py) { const b = insetBox(); return !!shotExt && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h; }
    function drawInset() {
        if (!shotExt) return;
        const b = insetBox();
        const w = holeExt.maxX - holeExt.minX, h = holeExt.maxY - holeExt.minY;
        const k = Math.min((b.w - 6) / w, (b.h - 6) / h);
        const tx = ([x, y]) => [b.x + 3 + (x - holeExt.minX) * k + ((b.w - 6) - w * k) / 2, b.y + b.h - 3 - (y - holeExt.minY) * k - ((b.h - 6) - h * k) / 2];
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(b.x, b.y, b.w, b.h, 6) : ctx.rect(b.x, b.y, b.w, b.h); ctx.fill(); ctx.stroke();
        // corridor: the band or line, thin
        const path = fairwayM.length >= 2 ? fairwayM.map(p => p.xy) : (lineM.length >= 2 ? lineM : [[0, 0], greenM.c]);
        ctx.strokeStyle = FILL.fairway; ctx.lineWidth = Math.max(2, 30 * k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); path.forEach((p, i) => { const [x, y] = tx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
        const [gx, gy] = tx(greenM.c); ctx.fillStyle = FILL.green; ctx.beginPath(); ctx.arc(gx, gy, Math.max(2.5, 12 * k), 0, Math.PI * 2); ctx.fill();
        const [tX, tY] = tx([0, 0]); ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(tX, tY, 2, 0, Math.PI * 2); ctx.fill();
        // the current window
        const [x0, y0] = tx([minX, maxY]), [x1, y1] = tx([maxX, minY]);
        ctx.strokeStyle = currentView === 'shot' ? '#2563eb' : '#64748b'; ctx.lineWidth = 1.5;
        ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        ctx.restore();
    }

    let ctx = canvas.getContext('2d');
    const mainCtx = ctx;
    // featureStyle 'outline': two off-screen layers, reused across redraws
    // (a pan redraws every frame). Cleared and matched to the canvas each use.
    const _outline = [null, null];
    function outlineLayer(i) {
        const c = _outline[i] || (_outline[i] = document.createElement('canvas'));
        if (c.width !== canvas.width || c.height !== canvas.height) { c.width = canvas.width; c.height = canvas.height; }
        const x = c.getContext('2d');
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, c.width, c.height);
        if (typeof mainCtx.getTransform === 'function') x.setTransform(mainCtx.getTransform());
        return { c, x };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const state = { mode, ghosts, ghostMode, curves: { intended: curves.intended || null, actual: curves.actual || null, deflectAt: curves.deflectAt ?? null }, drawing: null, plan: plan || null };
    // Touch-to-measure target (see the pointer section). Declared here so
    // redraw() can read it whenever it first runs.
    const measure = { xy: null, live: false };

    // S6 Part 1: the shipped Queensland aerial image under the base. The
    // <img> loads async — the flat fill shows until it arrives, then a
    // redraw swaps it in. The URL is a static /courses/imagery/ file that
    // the build script ships (never a runtime ImageServer call).
    let imageryImg = null;
    if (imagery && imagery.url && imagery.extent3857) {
        const img = new Image();
        img.onload = () => { imageryImg = img; redraw(); };
        img.src = imagery.url;
    }
    // Owner 2026-10-04 ("instead of the khaki ... actually maps"): one wider
    // course aerial drawn first, so rotation/framing never exposes the flat
    // ground colour past the edge of the tight per-hole crop. Optional —
    // courses without it keep the old behaviour exactly.
    let contextImg = null;
    if (contextImagery && contextImagery.url && contextImagery.extent3857) {
        const img = new Image();
        img.onload = () => { contextImg = img; redraw(); };
        img.src = contextImagery.url;
    }

    function poly(pts, close) {
        ctx.beginPath();
        pts.forEach((p, i) => { const [x, y] = toPx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        if (close) ctx.closePath();
    }
    // The image's Web-Mercator extent mapped through lat/lon → hole frame →
    // px. Four corner positions; the affine solves from three (top-left,
    // top-right, bottom-left) — at hole scale (a few hundred metres) the
    // Mercator-vs-equirectangular divergence is far below a pixel.
    // Sun readability: the photo draws at full opacity and every polygon /
    // band layer above it keeps FULL alpha — the schematic lines stay
    // saturated and readable in direct sun; the photo is only the ground.
    function drawImagery(image = imageryImg, meta = imagery) {
        const [xmin, ymin, xmax, ymax] = meta.extent3857;
        const corners = [ // image pixel (0,0) is top-left = north-west
            mercatorToLonLat(xmin, ymax), // NW
            mercatorToLonLat(xmax, ymax), // NE
            mercatorToLonLat(xmin, ymin), // SW
        ].map(([lon, lat]) => P([lat, lon]))
            .map(toPx)
            .map(([x, y]) => [x * dpr, y * dpr]); // affine runs in device px
        const [nw, ne, sw] = corners;
        const iw = image.naturalWidth || (meta.px && meta.px[0]);
        const ih = image.naturalHeight || (meta.px && meta.px[1]);
        if (!iw || !ih) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.setTransform(
            (ne[0] - nw[0]) / iw, (ne[1] - nw[1]) / iw,
            (sw[0] - nw[0]) / ih, (sw[1] - nw[1]) / ih,
            nw[0], nw[1],
        );
        ctx.drawImage(image, 0, 0);
        ctx.restore();
    }
    function drawBase() {
        // Owner 2026-09-20 ("rotating smears the image"): nothing ever cleared
        // the bitmap. Unrotated, the photo or the fill covered every pixel so
        // it never showed; under S12 C's rotation the photo's corners leave
        // the frame and the previous frame stayed in the gaps. Clear in
        // device pixels, then lay the ground colour under everything.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        ctx.fillStyle = '#d9f0d3';
        ctx.fillRect(0, 0, cssW, cssH);
        if (contextImg) drawImagery(contextImg, contextImagery);
        if (imageryImg) drawImagery();
        // Owner 2026-10-06 (play mode): featureStyle 'outline' draws the
        // fairway/green/bunkers as a thin white edge over a faint tint, so the
        // real grass, trees and bunkers show through; 'solid' is the classic
        // look (the wizard keeps it). Drawn off-screen, then composited.
        const drawFeatures = (_grow = 0, _mono = null) => {
        const hasGreenPoly = feats.some(f => !f.line && f.golf === 'green');
        if (schematic) {
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.strokeStyle = _mono || FILL.fairway;
            if (fairwayM.length >= 2) {
                // Brief §7b: a centreline with widths, stroked as a spline band
                // — the same model as OSM golf=hole and Garmin's schematic.
                // Per-segment width via short spline pieces; round caps blend them.
                const px = fairwayM.map(p => toPx(p.xy));
                for (let i = 0; i < px.length - 1; i++) {
                    ctx.lineWidth = ((fairwayM[i].w + fairwayM[i + 1].w) / 2) * s + _grow;
                    const seg = [px[i - 1] || px[i], px[i], px[i + 1], px[i + 2] || px[i + 1]];
                    ctx.beginPath(); ctx.moveTo(seg[1][0], seg[1][1]);
                    ctx.bezierCurveTo(
                        seg[1][0] + (seg[2][0] - seg[0][0]) / 6, seg[1][1] + (seg[2][1] - seg[0][1]) / 6,
                        seg[2][0] - (seg[3][0] - seg[1][0]) / 6, seg[2][1] - (seg[3][1] - seg[1][1]) / 6,
                        seg[2][0], seg[2][1]);
                    ctx.stroke();
                }
            } else {
                // Rounded strip from tee to green along the hole line (or straight).
                const path = lineM.length >= 2 ? lineM : [[0, 0], greenM.c];
                ctx.lineWidth = 38 * s + _grow;
                poly(path, false); ctx.stroke();
            }
            if (!hasGreenPoly) {
                const depth = greenM.f && greenM.b ? Math.max(18, Math.hypot(greenM.b[0] - greenM.f[0], greenM.b[1] - greenM.f[1])) : 28;
                const [gx, gy] = toPx(greenM.c);
                ctx.fillStyle = _mono || FILL.green;
                ctx.beginPath(); ctx.ellipse(gx, gy, 14 * s + _grow / 2, (depth / 2) * s + _grow / 2, 0, 0, Math.PI * 2); ctx.fill();
            }
        }
        // Real polygons, whatever the base: on a schematic hole these are the
        // traced green (and later bunkers) drawn over the strip.
        for (const kind of DRAW_ORDER) {
            for (const f of feats) {
                if (f.golf !== kind || f.line) continue;
                ctx.fillStyle = _mono || FILL[kind] || '#cbd5e1';
                poly(f.pts, true); ctx.fill();
                if (_grow) { ctx.strokeStyle = _mono; ctx.lineWidth = _grow; ctx.stroke(); }
                if (kind === 'green' && !_mono) { ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1; ctx.stroke(); }
            }
        }
        };
        if (featureStyle !== 'outline') drawFeatures();
        else {
            // Edge: everything drawn 3.5 px fat in white, then the true shapes
            // punched out — leaves a clean outline even where the fairway's
            // spline pieces overlap. Tint: the true shapes once, at 12 %.
            const edge = outlineLayer(0), tint = outlineLayer(1);
            try {
                ctx = edge.x;
                drawFeatures(3.5, 'rgba(255,255,255,0.95)');
                edge.x.globalCompositeOperation = 'destination-out';
                drawFeatures(0, '#000');
                edge.x.globalCompositeOperation = 'source-over';
                ctx = tint.x;
                drawFeatures(0, '#ffffff');
            } finally {
                ctx = mainCtx;
            }
            mainCtx.save(); mainCtx.setTransform(1, 0, 0, 1, 0, 0);
            mainCtx.globalAlpha = 0.12; mainCtx.drawImage(tint.c, 0, 0);
            mainCtx.globalAlpha = 1; mainCtx.drawImage(edge.c, 0, 0);
            mainCtx.restore();
        }
        if (lineM.length >= 2) {
            ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(30,41,59,0.35)'; ctx.lineWidth = 1;
            poly(lineM, false); ctx.stroke(); ctx.setLineDash([]);
        }
        // (S7: the tee/pin tail moved to drawMarkers - see below.)
    }
    // S7: previous rounds' lines, faint, under everything the golfer draws.
    function drawGhosts() {
        if (!state.ghosts || state.ghostMode === 'none') return;
        ctx.save();
        ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const layers = state.ghostMode === 'both'
            ? [['intended', 'rgba(37,99,235,0.18)'], ['actual', 'rgba(249,115,22,0.18)']]
            : [['intended', 'rgba(37,99,235,0.18)']];
        for (const [kind, color] of layers) {
            ctx.strokeStyle = color;
            for (const pts of state.ghosts[kind] || []) {
                if (!Array.isArray(pts) || pts.length < 2) continue;
                splinePath(ctx, pts.map(toPx));
                ctx.stroke();
            }
        }
        ctx.restore();
    }
    // S7: the tee/pin markers moved here out of drawBase so ghosts always
    // draw UNDER them (ghost lines must never hide the markers).
    function drawMarkers() {
        // Tee and pin.
        const [tx, ty] = toPx([0, 0]);
        ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI * 2); ctx.fill();
        const [px, py] = toPx(greenM.c);
        ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 12); ctx.stroke();
        ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(px, py - 12); ctx.lineTo(px + 7, py - 9); ctx.lineTo(px, py - 6); ctx.fill();
        // Length label.
        const len = Math.round(distanceM(tee, gc));
        ctx.fillStyle = 'rgba(30,41,59,0.7)'; ctx.font = '600 11px Outfit, sans-serif'; ctx.textAlign = 'left';
        // Play mode (fill): the rails sit on the corners — the strip names the hole.
        // Map first full-screen (pad.top): Penalty sits on that corner and the
        // glass header names the shot.
        if (!fill && !pad.top) ctx.fillText(`${len} m tee → centre`, 6, 14);
    }
    function drawCurve(pts, color, live) {
        if (!pts || pts.length < 2) return;
        ctx.strokeStyle = color; ctx.lineWidth = live ? 4 : 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        // Live: the raw samples (already dense). Stored: a Catmull-Rom spline
        // through the few control points, so a thumb swipe reads as a shot
        // shape, not a polyline.
        if (live) { poly(pts, false); ctx.stroke(); }
        else { splinePath(ctx, pts.map(toPx)); ctx.stroke(); }
        const [ex, ey] = toPx(pts[pts.length - 1]);
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill();
    }
    function redraw() {
        drawBase();
        // S3: the coach/self plan — a dashed violet spline under everything
        // the player draws, with a small label at its end.
        if (state.plan && state.plan.length >= 2) {
            const pts = state.plan.map(toPx);
            ctx.save();
            ctx.globalAlpha = 0.45;
            splinePath(ctx, pts);
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([7, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
            const [ex, ey] = pts[pts.length - 1];
            ctx.font = '11px system-ui, sans-serif';
            ctx.fillStyle = '#7c3aed';
            ctx.fillText('plan', ex + 6, ey - 6);
            ctx.restore();
        }
        // S7: ghosts sit above the base/features but UNDER the tee/pin
        // markers and under the golfer's own lines.
        drawGhosts();
        drawMarkers();
        for (const m of ['intended', 'actual']) {
            const pts = state.drawing && state.drawing.mode === m ? state.drawing.pts : state.curves[m];
            drawCurve(pts, CURVE[m], !!(state.drawing && state.drawing.mode === m));
        }
        // S12 D2: the deflection marker — an amber cross at the point the
        // ball "hit something" (the golfer taps it on the actual line).
        if (state.curves.deflectAt != null && state.curves.actual
            && state.curves.actual[state.curves.deflectAt]) {
            const [dx0, dy0] = toPx(state.curves.actual[state.curves.deflectAt]);
            ctx.save();
            ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(dx0 - 7, dy0 - 7); ctx.lineTo(dx0 + 7, dy0 + 7);
            ctx.moveTo(dx0 + 7, dy0 - 7); ctx.lineTo(dx0 - 7, dy0 + 7);
            ctx.stroke();
            ctx.restore();
        }
        // S9: an endpoint-only shot (flight unseen) shows its GPS finish as a
        // single orange dot — there is no curve to draw.
        if (finishDot) {
            const [fx, fy] = toPx(finishDot);
            ctx.fillStyle = '#f97316';
            ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2); ctx.fill();
        }
        // S4/S10: the GPS-chained start — a hollow "you are here" ring.
        // Green when accepted, amber when low confidence (draggable either way).
        if (startMark.xy) {
            const [cx, cy] = toPx(startMark.xy);
            ctx.strokeStyle = startMark.quality === 'lowConfidence' ? '#f59e0b' : '#10b981';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, startMark.draggable ? 8 : 6, 0, Math.PI * 2); ctx.stroke();
            if (startMark.draggable) {
                ctx.fillStyle = ctx.strokeStyle;
                ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
            }
        }
        // S12 A2: the anchor — the one start point both curves share. Filled
        // dot: green when measured (GPS), grey when inferred (previous finish
        // or the tee). Under the ring when both exist.
        const anchor = anchorXY();
        if (anchor) {
            const [ax, ay] = toPx(anchor);
            ctx.fillStyle = startIsMeasured ? '#10b981' : '#94a3b8';
            ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
        }
        // Live GPS: a blue "you" dot with a white rim, like a phone map.
        if (liveXY) {
            const [lx, ly] = toPx(liveXY);
            ctx.save();
            ctx.fillStyle = 'rgba(37,99,235,0.18)';
            ctx.beginPath(); ctx.arc(lx, ly, 14, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#2563eb'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(lx, ly, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.restore();
        }
        drawMeasure();
        drawInset(); // S11: last, so it sits over everything
    }
    // Touch-to-measure: ring at the target, thin lines ball→target→green,
    // and a pill label. While the finger is down the label floats well above
    // it (a thumb would hide it); once pinned it sits just above the ring.
    function drawMeasure() {
        if (!measure.xy) return;
        const a = anchorXY() || [0, 0];
        const [ax, ay] = toPx(a), [tx, ty] = toPx(measure.xy), [gx, gy] = toPx(greenM.c);
        ctx.save();
        ctx.lineCap = 'round';
        for (const [x0, y0, x1, y1] of [[ax, ay, tx, ty], [tx, ty, gx, gy]]) {
            ctx.setLineDash([]); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3.5;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            ctx.setLineDash([6, 5]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.75;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
        ctx.setLineDash([]);
        const R = measure.live ? 14 : 10;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.arc(tx, ty, R, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(tx, ty, R, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx - R - 5, ty); ctx.lineTo(tx - R + 4, ty); ctx.moveTo(tx + R - 4, ty); ctx.lineTo(tx + R + 5, ty);
        ctx.moveTo(tx, ty - R - 5); ctx.lineTo(tx, ty - R + 4); ctx.moveTo(tx, ty + R - 4); ctx.lineTo(tx, ty + R + 5);
        ctx.stroke();
        ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(tx, ty, 2, 0, Math.PI * 2); ctx.fill();
        // Label pill.
        const text = measureLabel(measureDistances(a, measure.xy, greenM.c));
        ctx.font = '700 15px Outfit, system-ui, sans-serif';
        const w = Math.ceil(ctx.measureText(text).width) + 18, h = 26;
        const lift = measure.live ? 64 : R + 12;
        let lx = Math.max(4, Math.min(cssW - w - 4, tx - w / 2));
        let ly = ty - lift - h;
        if (ly < 4) ly = Math.min(cssH - h - 4, ty + (measure.live ? 40 : R + 10)); // no room above: below
        ctx.fillStyle = 'rgba(15,23,42,0.88)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(lx, ly, w, h, 13); else ctx.rect(lx, ly, w, h);
        ctx.fill();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, lx + w / 2, ly + h / 2 + 1);
        ctx.restore();
    }

    // S10: the marker is GEOGRAPHIC (lat/lon) so it survives the async mount —
    // the frame position derives here, wherever the capture caught us.
    // Review P3: mutable, so a GPS lock after the mount turns the dot green.
    let startIsMeasured = !!startMeasured;
    let startMark = startMarker
        ? { xy: toFrame(frame, [startMarker.lat, startMarker.lon]),
            quality: startMarker.quality || 'accepted',
            draggable: !!startMarker.draggable }
        : { xy: null, quality: 'accepted', draggable: false };

    // S12 A2: THE start point of this shot — the dragged marker if the
    // golfer moved it, else the passed startXY (metres), else none (the
    // curves then render as stored, e.g. old shots).
    // One-tap logging (play map): the start dot is the shot chain's start
    // (tee / last finish) and the GPS ring is "you" (where the ball finished),
    // so anchorFirst lets startXY win over the marker.
    const anchorXY = () => (anchorFirst && startXY ? [startXY[0], startXY[1]]
        : (startMark.xy ? [...startMark.xy] : (startXY ? [startXY[0], startXY[1]] : null)));
    const reanchorStoredCurves = (anchor) => {
        const next = reanchorCurves(state.curves, anchor);
        if (next === state.curves) return;
        state.curves = next;
        onChange?.({ mode: state.mode, points: state.curves[state.mode], frame, curves: { ...state.curves }, anchorChanged: true });
    };
    canvas.dataset.start = anchorXY() ? anchorXY().map(v => Math.round(v * 10) / 10).join(',') : '';
    canvas.dataset.readOnly = String(!!readOnly);

    // Pointer capture: one finger draws; two fingers pinch/pan/rotate the
    // view (S12 C, gestures.js). The canvas has touch-action:none.
    const local = (e) => { const r = canvas.getBoundingClientRect(); return toM([e.clientX - r.left, e.clientY - r.top]); };
    const gestures = createGestureTracker();
    let _g0 = null;            // view2 snapshot when the 2nd finger landed
    // Touch-to-measure. A press held still (< MEASURE_SLOP_PX) for
    // MEASURE_HOLD_MS turns the pending stroke into a measure target; the
    // tiny stroke is discarded. `live` = finger still down. A pinned target
    // stays until a tap (cleared, no line) or the next long-press. Never
    // reaches state.curves or onChange — it is a look, not a record.
    let _holdTimer = null;
    let _lastPx = null;
    const cancelHold = () => { if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; } };
    const writeMeasureAttr = () => {
        if (!measure.xy) { delete canvas.dataset.measure; return; }
        const d = measureDistances(anchorXY(), measure.xy, greenM.c);
        canvas.dataset.measure = `${Math.round(d.fromBallM)},${Math.round(d.toPinM)}`;
    };
    function enterMeasure() {
        _holdTimer = null;
        if (!state.drawing || state.drawing.excursion >= MEASURE_SLOP_PX || _g0) return;
        state.drawing = null;
        measure.xy = toM(_lastPx);
        measure.live = true;
        writeMeasureAttr();
        try { navigator.vibrate?.(10); } catch { /* haptics are optional */ }
        redraw();
    }
    function clearMeasure() {
        cancelHold();
        measure.xy = null; measure.live = false;
        writeMeasureAttr();
        redraw();
    }
    const onDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        // S12 C: a second pointer turns the stroke into a gesture — commit
        // whatever is drawn first (same store path as pointer-up).
        const count = gestures.down(e.pointerId, [e.clientX, e.clientY]);
        if (count === 2) {
            cancelHold();
            if (measure.live) { measure.live = false; writeMeasureAttr(); }
            // Touch-to-measure review (Codex P2): a stroke that never left the
            // slop is a finger resting before a pinch, not a line — drop it
            // instead of committing a ball-to-touch curve.
            if (state.drawing && state.drawing.excursion < MEASURE_SLOP_PX) state.drawing = null;
            if (state.drawing && readOnly) state.drawing = null; // play mode: a pan, never a line
            if (state.drawing) finishStroke(e);
            state.dragging = false;
            _g0 = { k: view2.k, rot: view2.rot, panX: view2.panX, panY: view2.panY };
            return;
        }
        // S11: a tap on the inset toggles shot ↔ hole view; never draws.
        {
            const r = canvas.getBoundingClientRect();
            if (inInset(e.clientX - r.left, e.clientY - r.top)) {
                toggleView();
                e.preventDefault();
                return;
            }
        }
        try { canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetic ids (tests) have no active pointer */ }
        let p0 = local(e);
        // S10: a press on the marker drags it (16 px hit radius) instead of
        // starting a curve — the golfer corrects a wrong position directly.
        if (startMark.draggable && startMark.xy) {
            const [cx, cy] = toPx(startMark.xy);
            const r = canvas.getBoundingClientRect();
            if (Math.hypot(e.clientX - r.left - cx, e.clientY - r.top - cy) <= 16) {
                state.dragging = true;
                e.preventDefault();
                redraw();
                return;
            }
        }
        // S12 A2: the swipe no longer decides where a shot begins — the
        // anchor does (pointer-up replaces the first sample with it). The
        // old S4 15 m snap is superseded: anchoring is unconditional.
        const r = canvas.getBoundingClientRect();
        state.drawing = { mode: state.mode, pts: [p0], px: [e.clientX - r.left, e.clientY - r.top], excursion: 0, overMeasure: !!measure.xy };
        // Play mode: one finger pans the map instead of drawing a line.
        if (readOnly) state.drawing.pan0 = [view2.panX, view2.panY];
        _lastPx = [e.clientX - r.left, e.clientY - r.top];
        cancelHold();
        _holdTimer = setTimeout(enterMeasure, MEASURE_HOLD_MS);
        e.preventDefault();
        redraw();
    };
    // S12 B2: animate the shot view to a new extent over ~200 ms (ease-out).
    // The bitmap is untouched — only the metre-per-pixel transform moves, so
    // an in-progress stroke (metres) stays exactly where it is. Timer-driven
    // (not rAF): timers fire in headless runners, where rAF throttles.
    function tweenTo(ext) {
        if (!ext) return;
        const from = { minX, maxX, minY, maxY };
        const t0 = performance.now();
        if (_tween) { clearTimeout(_tween); _tween = null; }
        const step = () => {
            const k = Math.min(1, (performance.now() - t0) / 200);
            const e = 1 - Math.pow(1 - k, 2);
            minX = from.minX + (ext.minX - from.minX) * e;
            maxX = from.maxX + (ext.maxX - from.maxX) * e;
            minY = from.minY + (ext.minY - from.minY) * e;
            maxY = from.maxY + (ext.maxY - from.maxY) * e;
            fitScale();
            canvas.dataset.mpp = String(Math.round((1 / (s * view2.k)) * 1000) / 1000);
            redraw();
            if (k < 1) { _tween = setTimeout(step, 16); } else { _tween = null; }
        };
        _tween = setTimeout(step, 16);
    }

    // S12 B2: re-frame the shot view around {anchor, stroke so far, green}
    // with 15% padding — the "landed outside the frame" auto-extend.
    function autoExtend() {
        if (currentView !== 'shot') return;
        const pts = [greenM.c, ...(anchorXY() ? [anchorXY()] : []), ...state.drawing.pts];
        const ext = fitBounds(pts, 0.15);
        if (ext) { _view = ext; tweenTo(ext); }
    }

    const onMove = (e) => {
        // S12 C: two fingers gesture the view (pinch/pan/rotate).
        const g = gestures.move(e.pointerId, [e.clientX, e.clientY]);
        if (g && _g0) {
            view2.k = clampGestureZoom(_g0.k, g.scale);
            view2.rot = _g0.rot + g.rotateRad;
            view2.panX = _g0.panX + g.panPx[0];
            view2.panY = _g0.panY + g.panPx[1];
            canvas.dataset.mpp = String(Math.round((1 / (s * view2.k)) * 1000) / 1000);
            resetChip.classList.remove('hidden');
            redraw();
            e.preventDefault();
            return;
        }
        if (state.dragging) {
            startMark.xy = local(e);
            redraw();
            e.preventDefault();
            return;
        }
        if (measure.live) {
            measure.xy = local(e);
            writeMeasureAttr();
            redraw();
            e.preventDefault();
            return;
        }
        if (!state.drawing) return;
        if (readOnly) {
            // Play mode: a one-finger drag pans (never a stored line); a
            // still finger stays a long-press measure.
            const rr = canvas.getBoundingClientRect();
            const dx = e.clientX - rr.left - state.drawing.px[0];
            const dy = e.clientY - rr.top - state.drawing.px[1];
            _lastPx = [e.clientX - rr.left, e.clientY - rr.top];
            state.drawing.excursion = Math.max(state.drawing.excursion, Math.hypot(dx, dy));
            if (state.drawing.excursion >= MEASURE_SLOP_PX) {
                cancelHold();
                view2.panX = state.drawing.pan0[0] + dx;
                view2.panY = state.drawing.pan0[1] + dy;
                resetChip.classList.remove('hidden');
                redraw();
            }
            e.preventDefault();
            return;
        }
        const p = local(e);
        const r = canvas.getBoundingClientRect();
        _lastPx = [e.clientX - r.left, e.clientY - r.top];
        state.drawing.excursion = Math.max(state.drawing.excursion,
            Math.hypot(e.clientX - r.left - state.drawing.px[0], e.clientY - r.top - state.drawing.px[1]));
        if (state.drawing.excursion >= MEASURE_SLOP_PX) cancelHold();
        const last = state.drawing.pts[state.drawing.pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) * s >= 3) { state.drawing.pts.push(p); redraw(); }
        // S12 B2: near the canvas edge in shot view — grow the frame and keep
        // drawing from the same finger. S12 C review R1: NEVER while a manual
        // gesture view is active (zoomed/rotated/panned) — re-fitting the base
        // frame under a transformed view makes the map jump; Reset restores it.
        // (r is already in scope from the excursion tracking above.)
        if (currentView === 'shot' && !_tween && viewIsAutomatic()
            && nearEdge(e.clientX - r.left, e.clientY - r.top, cssW, cssH, 24)) {
            autoExtend();
        }
        e.preventDefault();
    };
    const onUp = (e) => {
        // S12 C: a gesture finger lifts — the gesture ends when fewer than
        // two remain; the last finger idles (no accidental draw-through:
        // its moves see no active stroke, its up sees no _g0).
        const remaining = gestures.up(e.pointerId);
        if (_g0) {
            if (remaining === 0) _g0 = null;
            if (e) e.preventDefault();
            return;
        }
        cancelHold();
        if (measure.live) {
            // Lift: the target stays pinned with its label.
            measure.live = false;
            writeMeasureAttr();
            redraw();
            if (e) e.preventDefault();
            return;
        }
        if (state.dragging) {
            state.dragging = false;
            const xy = startMark.xy ? [...startMark.xy] : null;
            // S12 A2: the anchor follows the dragged marker.
            if (xy) reanchorStoredCurves(xy);
            canvas.dataset.start = anchorXY() ? anchorXY().map(v => Math.round(v * 10) / 10).join(',') : '';
            writeMeasureAttr(); // a pinned target's ball distance follows the marker
            redraw();
            if (xy && onStartDrag) onStartDrag(xy, frame);
            if (e) e.preventDefault();
            return;
        }
        if (!state.drawing) return;
        // Touch-to-measure: a tap while a target is pinned only clears it —
        // no line, no deflection.
        // Codex P2: with the "Hit something" arm on, the tap clears the
        // target AND still places the deflection below.
        if (state.drawing.overMeasure && state.drawing.excursion < MEASURE_SLOP_PX) {
            clearMeasure();
            if (!(typeof deflectArmed === 'function' && deflectArmed())) {
                state.drawing = null;
                if (e) e.preventDefault();
                return;
            }
        }
        // S12 D2: a TAP (finger barely moved) with the "Hit something" arm
        // on places the deflection marker at the nearest stored point of the
        // actual line — within a finger-radius of where the golfer tapped.
        if (state.drawing.excursion < 8 && typeof deflectArmed === 'function' && deflectArmed()) {
            const tap = local(e);
            const r = canvas.getBoundingClientRect();
            const tapPx = [e.clientX - r.left, e.clientY - r.top];
            let best = -1, bestD = Infinity;
            const ac = state.curves.actual || [];
            for (let i = 0; i < ac.length; i++) {
                const q = toPx(ac[i]);
                const d = Math.hypot(q[0] - tapPx[0], q[1] - tapPx[1]);
                if (d < bestD) { bestD = d; best = i; }
            }
            state.drawing = null;
            if (best >= 0 && bestD <= 18 && best < ac.length - 0) {
                state.curves.deflectAt = best;
                onChange?.({ mode: 'actual', points: ac, frame, curves: { ...state.curves } });
                if (typeof onDeflectPlaced === 'function') onDeflectPlaced();
            }
            redraw();
            if (e) e.preventDefault();
            return;
        }
        // Play mode never stores a line.
        if (readOnly) {
            state.drawing = null;
            redraw();
            if (e) e.preventDefault();
            return;
        }
        // Simplify the raw swipe to its few real bends (Ramer-Douglas-Peucker,
        // tolerance 1.5% of the canvas width in metres), then cap. The stored
        // curve is control points; the spline is drawn at render time.
        finishStroke(e);
    };
    // S12 B2/C: simplify the raw swipe (Ramer-Douglas-Peucker, tolerance
    // 1.5% of the canvas width in metres), anchor it, store it, and settle
    // the frame. Shared by pointer-up and the two-finger commit.
    function finishStroke(e) {
        const epsM = (cssW * 0.015) / s;
        // S12 D1: filter the input, store few points — the stored curve is
        // the smoothed result (ma5 → RDP → chaikin ×2 → re-simplify → cap).
        const pts = smoothStoredCurve(state.drawing.pts, epsM);
        const m = state.drawing.mode;
        state.drawing = null;
        if (pts.length >= 2) {
            // S12 A2: one start point per shot — the stored curve begins at
            // the anchor (the dragged marker if the golfer moved it), for
            // BOTH the intended and the actual curve.
            const anchor = anchorXY();
            state.curves[m] = anchorCurve(pts, anchor);
            onChange?.({ mode: m, points: state.curves[m], frame, curves: { ...state.curves } });
            // S12 B2: settle the frame around {anchor, both curves, green}.
            if (currentView === 'shot') {
                const all = [greenM.c, ...(anchor ? [anchor] : []),
                    ...(state.curves.intended || []), ...(state.curves.actual || [])];
                const ext = fitBounds(all, 0.15);
                if (ext) { _view = ext; tweenTo(ext); }
            }
        }
        redraw();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    redraw();

    return {
        frame,
        // Play mode: the green centre in hole-frame metres (club suggestion).
        greenXY: greenM.c,
        schematic,
        // S7 rebase fix: expose the overlay's internal state. The trial's
        // toggle read controller.state.ghosts while setGhosts wrote the
        // closure `state` — two different objects, so the toggle always saw
        // empty ghosts and hid the count. One shared object now.
        state,
        // S11: shot ↔ hole view; metresPerPx lets a test prove the shot view is closer.
        setViewMode(m) { if (m === 'shot' && !shotExt) return; currentView = m === 'shot' ? 'shot' : 'hole'; _view = null; applyView(); redraw(); },
        getViewMode() { return currentView; },
        metresPerPx() { return 1 / (s * view2.k); },
        /** Live GPS fix in hole-frame metres (null clears). Follows only
         * while the view is automatic; a golfer's pinch/rotate wins until
         * Reset. Ignored on a hole with no shot view. */
        setLiveAnchor(xy) {
            liveXY = xy ? [xy[0], xy[1]] : null;
            canvas.dataset.liveAnchor = liveXY ? liveXY.map(v => Math.round(v)).join(',') : '';
            if (!liveXY || !followLive(liveXY)) redraw();
        },
        setMode(m) { state.mode = m; },
        /** One-tap logging: the play map draws only while a Plan/Actual chip
         * is armed; otherwise one finger pans (a stray touch never draws).
         * Takes effect from the next touch. */
        setReadOnly(on) { readOnly = !!on; canvas.dataset.readOnly = String(readOnly); },
        /** One-tap logging: move the start dot new strokes are anchored to. */
        setAnchor(xy) {
            startXY = Array.isArray(xy) && xy.every(Number.isFinite) ? [xy[0], xy[1]] : null;
            canvas.dataset.start = anchorXY() ? anchorXY().map(v => Math.round(v * 10) / 10).join(',') : '';
            redraw();
        },
        setCurves(c) { if (c.intended !== undefined) state.curves.intended = c.intended; if (c.actual !== undefined) state.curves.actual = c.actual; if (c.deflectAt !== undefined) state.curves.deflectAt = c.deflectAt; redraw(); },
        setPlan(p) { state.plan = p; redraw(); },
        // S7: apply ghost data/mode after an async query (mount-first design).
        setGhosts(next) {
            if (next && 'ghosts' in next) state.ghosts = next.ghosts;
            if (next && next.ghostMode) state.ghostMode = next.ghostMode;
            redraw();
        },
        setStartMarker(next) {
            // S10: { lat, lon, quality: 'accepted'|'lowConfidence', draggable }
            // Geographic — the frame position re-derives from THIS mount's frame.
            if (typeof next?.lat === 'number') {
                startMark.xy = toFrame(frame, [next.lat, next.lon]);
                startIsMeasured = true; // review P3: a GPS start is a measured one (green dot)
                // On the quick-log map GPS is the golfer's position, not
                // the shot start. Moving it must never edit or log a line.
                if (!anchorFirst) reanchorStoredCurves(startMark.xy);
            }
            if ('quality' in next) startMark.quality = next.quality;
            if ('draggable' in next) startMark.draggable = next.draggable;
            canvas.dataset.start = anchorXY() ? anchorXY().map(v => Math.round(v * 10) / 10).join(',') : '';
            redraw();
        },
        // D31: the shot's start moved (a GPS lock) - re-frame the automatic
        // shot view on it without a re-mount. Never mid-stroke, mid-drag, after
        // an auto-extend, or once the golfer has zoomed/panned/rotated.
        // Review P2: the new frame (and auto-rotate angle) is ALWAYS kept, so a
        // later Reset / Shot chip / end of an auto-extend frames the new start;
        // only the immediate re-frame waits when the golfer is busy.
        // Review pass 2 (P2): the angle never drifts from view2.rot behind the
        // golfer's back - while the view is automatic both move together, and
        // mid-stroke/drag the angle waits for the next shot (rotating would
        // move the line under the finger).
        refocus(xy) {
            if (!focus || !Array.isArray(xy) || !xy.every(Number.isFinite)) return false;
            const wasAutomatic = viewIsAutomatic();
            const busy = !!(state.drawing || state.dragging || measure.live); // review P3: a held measure too
            shotExt = computeShotView(xy, greenM.c, greenDepth, focus.reachM || 240);
            if (autoRotate && !(wasAutomatic && busy)) {
                const gdx = greenM.c[0] - xy[0], gdy = greenM.c[1] - xy[1];
                _autoRot = -Math.PI / 2 - Math.atan2(-gdy, gdx);
                if (wasAutomatic) view2.rot = _autoRot;
            }
            if (currentView !== 'shot' || busy || _view || !wasAutomatic) { redraw(); return false; }
            applyView();
            redraw();
            return true;
        },
        // D29 review: clearing the actual line also drops its "Hit something"
        // marker - an index into a line that no longer exists.
        clear(m) { state.curves[m] = null; if (m === 'actual') state.curves.deflectAt = null; onChange?.({ mode: m, points: null, frame, curves: { ...state.curves } }); redraw(); },
        getCurves() { return { ...state.curves }; },
        // Touch-to-measure: the pinned/live target, or null.
        getMeasure() {
            if (!measure.xy) return null;
            return { xy: [...measure.xy], ...measureDistances(anchorXY(), measure.xy, greenM.c) };
        },
        clearMeasure,
        redraw,
        destroy() {
            cancelHold();
            resetChip.remove();
            chipEl.remove();
            if (_tween) { clearTimeout(_tween); _tween = null; }
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointercancel', onUp);
        },
    };
}

/**
 * Ramer-Douglas-Peucker: keep only the points that bend the line by more
 * than `eps` (same units as the points). A straight swipe becomes 2 points,
 * a draw or fade 3-5, a deliberate S-shape keeps both bends.
 */
export function simplifyRDP(pts, eps) {
    if (pts.length <= 2) return pts.slice();
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let idx = 0, dmax = -1;
    for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        const d = len2 === 0
            ? Math.hypot(p[0] - a[0], p[1] - a[1])
            : Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.sqrt(len2);
        if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax <= eps) return [a, b];
    return simplifyRDP(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplifyRDP(pts.slice(idx), eps));
}

/** Keep at most `max` points, evenly by index, rounded to 0.1 m. */

// ==========================================
// S12 D1: curve smoothing — filter the input, store few points, evaluate
// at render.
// ==========================================

/**
 * One pass of a 5-sample moving average (centred, clamped at the edges).
 * The first and last samples are kept EXACTLY — the anchor and the finish
 * are deliberate placements, not noise.
 */
export function movingAverage5(pts) {
    if (!pts || pts.length < 3) return pts ? pts.map(p => [...p]) : pts;
    const out = [pts[0].slice()];
    for (let i = 1; i < pts.length - 1; i++) {
        let sx = 0, sy = 0, n = 0;
        for (let j = Math.max(0, i - 2); j <= Math.min(pts.length - 1, i + 2); j++) {
            sx += pts[j][0]; sy += pts[j][1]; n++;
        }
        out.push([sx / n, sy / n]);
    }
    out.push(pts[pts.length - 1].slice());
    return out;
}

/**
 * Two-round Chaikin corner cutting: each segment spawns Q (3/4 from the
 * start) and R (1/4 from the start); endpoints survive every round. A
 * straight line stays straight (collinear offspring).
 */
export function chaikinSubdivide(pts, rounds = 2) {
    let cur = pts.map(p => [...p]);
    for (let r = 0; r < rounds; r++) {
        const next = [cur[0].slice()];
        for (let i = 0; i < cur.length - 1; i++) {
            const a = cur[i], b = cur[i + 1];
            next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
            next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
        }
        next.push(cur[cur.length - 1].slice());
        cur = next;
    }
    return cur;
}

/**
 * The D1 storage pipeline: ma5 (endpoints kept) → RDP (coarse, the real
 * bends) → chaikin ×2 (rounded, but point-hungry) → one SMALL RDP pass
 * (collinear runs collapse back to few points; real rounded bends — whose
 * points sit >0.3 m off their local chord — survive) → cap 48. The stored
 * curve is the smoothed result: a jittery straight line stores ≤4 points
 * with sub-metre deviation; an S-curve keeps both bends.
 */
export function smoothStoredCurve(rawPts, epsM, maxPts = 48) {
    const smoothed = chaikinSubdivide(simplifyRDP(movingAverage5(rawPts), epsM), 2);
    const epsFinal = Math.min(0.5, epsM / 4);
    return resample(simplifyRDP(smoothed, epsFinal), maxPts);
}

export function resample(pts, max) {
    const out = [];
    const n = pts.length;
    const step = n <= max ? 1 : (n - 1) / (max - 1);
    for (let i = 0; i < n; i += step) {
        const p = pts[Math.round(i)];
        out.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    }
    const last = pts[n - 1];
    const tail = out[out.length - 1];
    if (tail[0] !== Math.round(last[0] * 10) / 10 || tail[1] !== Math.round(last[1] * 10) / 10) {
        out.push([Math.round(last[0] * 10) / 10, Math.round(last[1] * 10) / 10]);
    }
    return out;
}

/** Straight-line carry in metres from the first to the last point of a curve. */
export function curveCarryM(pts) {
    if (!pts || pts.length < 2) return null;
    const a = pts[0], b = pts[pts.length - 1];
    return Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]));
}
