import { userErrorMessage } from './user-messages.js';
// ==========================================================================
// hole-mapper.js — S6 Part 2: "Map this hole", hand-placed vertices
// ==========================================================================
// A person taps vertices on the shipped aerial image of a hole to trace
// tee, fairway, green, bunkers and water (Shot Scope / the SkyCaddie
// patent's model: a vertex every metre or two, straight-joined). The model
// below is pure — frame-metre coordinates in, plain objects out — so the
// unit tests run without a canvas. mountHoleMapper() (same file) wires it
// to the #hole-mapper card and its canvas.
//
// Coordinates: frame metres ([x, y] from makeFrame/toFrame — x to the
// golfer's right, y towards the green). The GeoJSON conversion to
// [lon, lat] rings happens at save time (mapperGeoJSON).
//
// Sizes are capped at the source of truth: ≤ 12 features per hole, ≤ 200
// vertices per feature (the same caps the Firestore rules enforce).
//
// The vertex goes where the golfer MEANS, 40 px above the finger so it is
// visible — a product call the owner may flip after trying it on the SE
// (flagged in the Part 1 review). Dragging keeps the grab offset so the
// vertex follows the finger 1:1 after the initial grab.

import { makeFrame, toFrame, fromFrame } from "./geo.js";
import { createGestureTracker, clampGestureZoom } from "./gestures.js";
// The EPSG:3857 inverse — the same maths S6 Part 1 uses to place the photo.
import { mercatorToLonLat } from "./hole-overlay.js";
import { golfTag } from "./golf-tags.js";

export const MAPPER_KINDS = ['tee', 'fairway', 'green', 'bunker', 'water'];

// Fill colours per kind — the same hues the overlay uses where they exist,
// distinct where it does not. Rendered at 40% alpha, stroke at full.
export const MAPPER_COLOURS = {
    tee: '#8b5cf6',
    fairway: '#16a34a',
    green: '#059669',
    bunker: '#f59e0b',
    water: '#2563eb',
};

export const MAPPER_LIMITS = { maxFeatures: 12, maxVertices: 200 };

/** A fresh, empty mapper state. */
export function createMapperModel({ activeKind = 'green' } = {}) {
    return {
        activeKind,
        features: [],   // closed rings: { id, kind, vertices: [[x, y], ...] }
        drafts: {},     // kind -> { vertices: [[x, y], ...] } — the open ring
        undoStack: [],
        nextId: 1,
    };
}

function draftOf(model, kind) {
    if (!model.drafts[kind]) model.drafts[kind] = { vertices: [] };
    return model.drafts[kind];
}

/** Ring area in m² (shoelace) — frame metres are metres. */
export function ringAreaM2(vertices) {
    if (!vertices || vertices.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < vertices.length; i++) {
        const [x1, y1] = vertices[i];
        const [x2, y2] = vertices[(i + 1) % vertices.length];
        sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum / 2);
}

function pushUndo(model, action) {
    model.undoStack.push(action);
}

function dropUndoFrom(model, index) {
    return model.undoStack.splice(index, 1)[0];
}

/**
 * Place a vertex on the open draft of `kind` (which becomes active).
 * Frame metres in. Returns { ok: true } or { ok: false, reason }.
 */
export function mapperAdd(model, kind, xy) {
    if (!MAPPER_KINDS.includes(kind)) return { ok: false, reason: 'bad-kind' };
    const closedCount = model.features.filter(f => f.kind === kind).length;
    if (model.features.length >= MAPPER_LIMITS.maxFeatures && !model.drafts[kind]) {
        return { ok: false, reason: 'max-features' };
    }
    const draft = draftOf(model, kind);
    if (closedCount + 1 > MAPPER_LIMITS.maxFeatures) return { ok: false, reason: 'max-features' };
    if (draft.vertices.length >= MAPPER_LIMITS.maxVertices) return { ok: false, reason: 'max-vertices' };
    model.activeKind = kind;
    draft.vertices.push([xy[0], xy[1]]);
    pushUndo(model, { type: 'add', kind });
    return { ok: true };
}

function locate(model, target) {
    // target: { draft: kind, index } or { feature: id, index }
    if (target.draft && model.drafts[target.draft]) {
        const v = model.drafts[target.draft].vertices;
        if (target.index < 0 || target.index >= v.length) return null;
        return { list: v, index: target.index, isDraft: true, kind: target.draft };
    }
    const f = model.features.find(x => x.id === target.feature);
    if (f && target.index >= 0 && target.index < f.vertices.length) {
        return { list: f.vertices, index: target.index, isDraft: false, feature: f };
    }
    return null;
}

/** Drag a vertex (draft or closed feature) to a new frame position. */
export function mapperMove(model, target, xy) {
    const loc = locate(model, target);
    if (!loc) return { ok: false, reason: 'no-such-vertex' };
    const from = loc.list[loc.index];
    loc.list[loc.index] = [xy[0], xy[1]];
    pushUndo(model, {
        type: 'move',
        target: loc.isDraft ? { draft: loc.kind, index: loc.index } : { feature: loc.feature.id, index: loc.index },
        from,
    });
    return { ok: true };
}

/** Long-press delete: remove a vertex from a draft or a closed feature. */
export function mapperDelete(model, target) {
    const loc = locate(model, target);
    if (!loc) return { ok: false, reason: 'no-such-vertex' };
    const [removed] = loc.list.splice(loc.index, 1);
    pushUndo(model, {
        type: 'delete',
        target: loc.isDraft ? { draft: loc.kind, index: loc.index } : { feature: loc.feature.id, index: loc.index },
        vertex: removed,
    });
    return { ok: true };
}

/**
 * Close the open draft of `kind` (default: the active kind) into a feature.
 * Needs ≥ 3 vertices; respects the per-feature vertex cap.
 */
export function mapperClose(model, kind = model.activeKind) {
    const draft = model.drafts[kind];
    if (model.features.length >= MAPPER_LIMITS.maxFeatures) return { ok: false, reason: 'max-features' };
    if (!draft || draft.vertices.length < 3) return { ok: false, reason: 'too-few-vertices' };
    const feature = { id: model.nextId++, kind, vertices: draft.vertices };
    delete model.drafts[kind];
    model.features.push(feature);
    pushUndo(model, { type: 'close', kind, featureId: feature.id });
    return { ok: true, feature };
}

/** Undo the last add / move / delete / close. */
export function mapperUndo(model) {
    const action = model.undoStack[model.undoStack.length - 1];
    if (!action) return { ok: false, reason: 'nothing-to-undo' };
    if (action.type === 'add') {
        const draft = model.drafts[action.kind];
        draft.vertices.pop();
        if (!draft.vertices.length) delete model.drafts[action.kind];
        dropUndoFrom(model, model.undoStack.length - 1);
        return { ok: true };
    }
    if (action.type === 'move') {
        const loc = locate(model, action.target);
        if (!loc) return { ok: false, reason: 'undo-target-gone' };
        loc.list[loc.index] = action.from;
        dropUndoFrom(model, model.undoStack.length - 1);
        return { ok: true };
    }
    if (action.type === 'delete') {
        const loc = locate(model, action.target);
        if (!loc) return { ok: false, reason: 'undo-target-gone' };
        loc.list.splice(loc.index, 0, action.vertex);
        dropUndoFrom(model, model.undoStack.length - 1);
        return { ok: true };
    }
    if (action.type === 'close') {
        const idx = model.features.findIndex(f => f.id === action.featureId);
        if (idx === -1) return { ok: false, reason: 'undo-target-gone' };
        const [f] = model.features.splice(idx, 1);
        model.drafts[action.kind] = { vertices: f.vertices };
        dropUndoFrom(model, model.undoStack.length - 1);
        return { ok: true };
    }
    return { ok: false, reason: 'unknown-action' };
}

/**
 * The save payload: every closed feature as a FeatureCollection with closed
 * [lon, lat] rings. `hole` supplies the frame (tee → green centre); `meta`
 * carries { authorUid, imagery, courseSlug, physicalHole }.
 *
 * Firestore CANNOT store arrays nested directly in arrays — neither a raw
 * GeoJSON ring [[[lon, lat], ...]] nor a coordinates:[ ring ] wrapper is
 * legal at the write ("Nested arrays are not supported"). With
 * `firestoreSafe` each point is a {lon, lat} map and the ring lives on
 * `geometry.ring` (a map holding the array — legal). The export script
 * re-wraps it into real GeoJSON (geometry.coordinates = [ring]) on export.
 */
export function mapperGeoJSON(model, hole, meta = {}, { firestoreSafe = false } = {}) {
    const frame = makeFrame([hole.tee.lat, hole.tee.lon], [hole.green.centre.lat, hole.green.centre.lon]);
    const point = ([x, y]) => {
        const [lat, lon] = fromFrame(frame, [x, y]);
        return firestoreSafe ? { lon, lat } : [lon, lat];
    };
    const features = model.features.map((f) => {
        const ringLL = f.vertices.map(point);
        const geometry = firestoreSafe
            ? { type: 'Polygon', ring: [...ringLL, ringLL[0]] }
            : { type: 'Polygon', coordinates: [[...ringLL, ringLL[0]]] };
        return {
            type: 'Feature',
            // OSM tag, not the UI kind: water saves as water_hazard so the
            // course map draws it (golf-tags.js).
            properties: { golf: golfTag(f.kind) },
            geometry,
        };
    });
    return {
        type: 'FeatureCollection',
        features,
        meta,
    };
}

// ==========================================================================
// The card controller: #hole-mapper canvas interactions + rendering
// ==========================================================================
// One finger places/drags/deletes vertices; two fingers pinch-zoom (1-4x)
// and pan. The Save button is disabled until Part 2b wires the Firestore
// write (users/{uid}/holeTraces).

const TOUCH_OFFSET_PX = 40;   // vertex sits this far above the finger
const GRAB_RADIUS_PX = 16;    // hit radius for grabbing a vertex
const LONG_PRESS_MS = 500;

/**
 * Mount the mapper onto the #hole-mapper card for one hole. Returns
 * { model, destroy } — the binder calls destroy() when the card closes.
 */
export function mountHoleMapper({ canvas, hole, slug, holeNumber, attributions = [] }) {
    const card = canvas.closest('#hole-mapper');
    // A double tap on Open / "Map this hole" can mount twice before the
    // binder's own close runs (it awaits the overlay first): the newest mount
    // always replaces an older live one, so listeners never stack.
    if (card?._mapper?.destroy) {
        card._mapper.destroy();
        card.classList.remove('hidden');
    }
    const model = createMapperModel();
    // destroy() (simplify review A8): every listener below is registered with
    // this signal, so one abort() removes them all. Before, the handle had no
    // destroy at all: the ✕ threw, the next open never mounted, and the card's
    // buttons kept the previous mount's listeners (stacked per mount).
    const listeners = new AbortController();
    const on = { signal: listeners.signal };
    let destroyed = false;
    const frame = makeFrame([hole.tee.lat, hole.tee.lon], [hole.green.centre.lat, hole.green.centre.lon]);

    // Fit: the imagery extent when the hole has it, else a tee-to-green box.
    let cornersFrame = [[-60, -40], [60, -40], [60, 420], [-60, 420]];
    let imageryImg = null;
    let imageryMeanTone = null; // CSS colour — the photo's mean, for the corners
    const imagery = hole.imagery || null;
    if (imagery && imagery.extent3857) {
        const [xmin, ymin, xmax, ymax] = imagery.extent3857;
        cornersFrame = [mercatorToLonLat(xmin, ymax), mercatorToLonLat(xmax, ymax), mercatorToLonLat(xmax, ymin), mercatorToLonLat(xmin, ymin)]
            .map(([lon, lat]) => toFrame(frame, [lat, lon]));
        const img = new Image();
        img.onload = () => {
            if (destroyed) return; // a slow photo must not paint over the next mount
            imageryImg = img;
            // Mean tone: a 1x1 downscale averages every pixel — fills the
            // flat corners behind the rotated photo so they read as ground
            // (the Part 1 review follow-up).
            try {
                const oc = document.createElement('canvas');
                oc.width = 1; oc.height = 1;
                const octx = oc.getContext('2d');
                octx.drawImage(img, 0, 0, 1, 1);
                const [r, g, bl] = octx.getImageData(0, 0, 1, 1).data;
                imageryMeanTone = `rgb(${r},${g},${bl})`;
            } catch { imageryMeanTone = '#c9c2b2'; }
            render();
        };
        img.src = imagery.url;
    }
    if (imagery && imagery.url) {
        const el = document.getElementById('mapper-attribution');
        if (el) el.textContent = attributions.join(' · ');
    }

    // Fit-space px (the S6 Part 1 maths), then a zoom/pan view on top.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of cornersFrame) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const pad = 8;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cssW = 320, cssH = 320, s = 1, ox = 0, oy = 0;
    const view = { z: 1, tx: 0, ty: 0 };

    function sizeCanvas() {
        cssW = Math.max(200, Math.round(canvas.getBoundingClientRect().width || 320));
        cssH = Math.max(240, Math.min(420, Math.round(cssW * ((maxY - minY) / (maxX - minX)))));
        canvas.width = cssW * dpr; canvas.height = cssH * dpr;
        canvas.style.height = `${cssH}px`;
        s = Math.min(cssW / (maxX - minX), cssH / (maxY - minY));
        ox = (cssW - (maxX - minX) * s) / 2;
        oy = (cssH - (maxY - minY) * s) / 2;
    }
    sizeCanvas();

    const toBase = ([x, y]) => [ox + (x - minX) * s, cssH - oy - (y - minY) * s];
    // view: screen = centre + (base - centre) * z + t
    const toScreen = (b) => [cssW / 2 + (b[0] - cssW / 2) * view.z + view.tx, cssH / 2 + (b[1] - cssH / 2) * view.z + view.ty];
    const fromScreen = ([sx, sy]) => {
        const bx = (sx - cssW / 2 - view.tx) / view.z + cssW / 2;
        const by = (sy - cssH / 2 - view.ty) / view.z + cssH / 2;
        return [(bx - ox) / s + minX, (cssH - oy - by) / s + minY];
    };
    const clampView = () => {
        view.tx = Math.max(-(view.z - 1) * cssW / 2, Math.min((view.z - 1) * cssW / 2, view.tx));
        view.ty = Math.max(-(view.z - 1) * cssH / 2, Math.min((view.z - 1) * cssH / 2, view.ty));
    };

    // All vertices (drafts + closed) with where they live, for hit tests.
    function allVertices() {
        const out = [];
        for (const [kind, d] of Object.entries(model.drafts)) {
            d.vertices.forEach((v, i) => out.push({ kind, target: { draft: kind, index: i }, v }));
        }
        for (const f of model.features) {
            f.vertices.forEach((v, i) => out.push({ kind: f.kind, target: { feature: f.id, index: i }, v }));
        }
        return out;
    }

    function nearestVertex(sx, sy) {
        let best = null;
        let bestD = GRAB_RADIUS_PX;
        for (const item of allVertices()) {
            const p = toScreen(toBase(item.v));
            const d = Math.hypot(p[0] - sx, p[1] - sy);
            if (d <= bestD) { bestD = d; best = item; }
        }
        return best;
    }

    const ctx = canvas.getContext('2d');

    function drawImagery() {
        // Mean-tone the whole canvas first: the rotated photo leaves flat
        // corners, and they read as ground instead of a bright schematic
        // green (the Part 1 review follow-up).
        if (imageryMeanTone) {
            ctx.fillStyle = imageryMeanTone;
            ctx.fillRect(0, 0, cssW, cssH);
        }
        const screen = cornersFrame.map(toBase).map(toScreen).map(([x, y]) => [x * dpr, y * dpr]);
        // cornersFrame order is [NW, NE, SE, SW] — the affine needs the
        // image's top-left, top-right and BOTTOM-LEFT, i.e. NW, NE, SW
        // (index 3). Using index 2 (SE) skews the photo into a thin strip.
        const nw = screen[0], ne = screen[1], sw = screen[3];
        const iw = imageryImg.naturalWidth || (imagery.px && imagery.px[0]);
        const ih = imageryImg.naturalHeight || (imagery.px && imagery.px[1]);
        if (!iw || !ih) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.setTransform(
            (ne[0] - nw[0]) / iw, (ne[1] - nw[1]) / iw,
            (sw[0] - nw[0]) / ih, (sw[1] - nw[1]) / ih,
            nw[0], nw[1],
        );
        ctx.drawImage(imageryImg, 0, 0);
        ctx.restore();
        drawReference();
    }

    // The Part 2b review addition: the hole's existing data — OSM line,
    // fairway band, traced green — drawn FAINTLY under the vertices as a
    // tracing reference. Never interactive; the mapper's rings sit on top.
    function drawReference() {
        ctx.save();
        ctx.globalAlpha = 0.35;
        const lineLL = (hole.line || []).map(p => toScreen(toBase(toFrame(frame, [p.lat, p.lon]))));
        if (lineLL.length >= 2) {
            ctx.beginPath();
            lineLL.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            ctx.strokeStyle = '#1d4ed8';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        const band = (hole.fairwayLine || []).map(p => toScreen(toBase(toFrame(frame, [p.lat, p.lon]))));
        if (band.length >= 2) {
            ctx.beginPath();
            band.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            ctx.strokeStyle = '#15803d';
            ctx.lineWidth = 12;
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.18;
            ctx.stroke();
            ctx.globalAlpha = 0.35;
        }
        const greenRing = [];
        for (const f of hole.features?.features || []) {
            if (f.properties?.golf === 'green' && f.geometry?.type === 'Polygon') {
                for (const [lon, lat] of f.geometry.coordinates[0]) greenRing.push(toScreen(toBase(toFrame(frame, [lat, lon]))));
                break;
            }
        }
        if (greenRing.length >= 3) {
            ctx.beginPath();
            greenRing.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            ctx.closePath();
            ctx.strokeStyle = '#059669';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();
    }

    function render() {
        if (destroyed) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (imageryImg) {
            drawImagery();
        } else {
            ctx.fillStyle = '#d9f0d3';
            ctx.fillRect(0, 0, cssW, cssH);
            drawReference();
        }
        const drawRing = (verts, kind, closed) => {
            if (!verts.length) return;
            const pts = verts.map(v => toScreen(toBase(v)));
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            const colour = MAPPER_COLOURS[kind] || '#059669';
            if (closed) {
                ctx.closePath();
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = colour;
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            ctx.strokeStyle = colour;
            ctx.lineWidth = 2;
            ctx.stroke();
        };
        for (const f of model.features) drawRing(f.vertices, f.kind, true);
        for (const [kind, d] of Object.entries(model.drafts)) drawRing(d.vertices, kind, false);
        // Crosshairs on every vertex.
        for (const item of allVertices()) {
            const [sx, sy] = toScreen(toBase(item.v));
            const colour = MAPPER_COLOURS[item.kind] || '#059669';
            ctx.strokeStyle = colour;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx, sy, 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx - 10, sy); ctx.lineTo(sx - 3, sy);
            ctx.moveTo(sx + 3, sy); ctx.lineTo(sx + 10, sy);
            ctx.moveTo(sx, sy - 10); ctx.lineTo(sx, sy - 3);
            ctx.moveTo(sx, sy + 3); ctx.lineTo(sx, sy + 10);
            ctx.stroke();
        }
        const status = document.getElementById('mapper-status');
        if (status) {
            const draft = model.drafts[model.activeKind];
            const n = draft ? draft.vertices.length : 0;
            const area = draft ? ringAreaM2(draft.vertices) : 0;
            status.textContent = `${model.activeKind} · open ring ${n} vertex${n === 1 ? '' : 'es'}`
                + (n >= 3 ? ` · ${Math.round(area)} m²` : ' (need 3 to close)')
                + ` · saved features ${model.features.length}/${MAPPER_LIMITS.maxFeatures}`;
        }
    }

    // ---- pointer state machine: tap = place, drag = move, long-press = delete,
    // two pointers = pinch-zoom + pan (S12 C: the bookkeeping lives in the
    // shared gestures.js — the overlay's gesture layer uses the same one) ----
    const gestures = createGestureTracker();
    let grab = null;            // { item, grabOffset } — dragging a vertex
    let downAt = 0;
    let downPos = null;
    let moved = false;
    let pressTimer = null;
    let gStart = null;          // { z, tx, ty } when the 2nd pointer landed

    function localPos(e) {
        const r = canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    }

    function onDown(e) {
        e.preventDefault();
        canvas.setPointerCapture?.(e.pointerId);
        const p = localPos(e);
        if (gestures.down(e.pointerId, p) === 2) {
            clearTimeout(pressTimer);
            grab = null;
            gStart = { z: view.z, tx: view.tx, ty: view.ty };
            return;
        }
        downAt = Date.now();
        downPos = p;
        moved = false;
        const hit = nearestVertex(p[0], p[1]);
        grab = hit
            ? { item: hit, grabOffset: [toScreen(toBase(hit.v))[0] - p[0], toScreen(toBase(hit.v))[1] - p[1]] }
            : null;
        clearTimeout(pressTimer);
        if (hit) {
            pressTimer = setTimeout(() => {
                // Long-press deletes the grabbed vertex.
                mapperDelete(model, hit.target);
                grab = null;
                render();
            }, LONG_PRESS_MS);
        }
    }

    function onMove(e) {
        const g = gestures.move(e.pointerId, localPos(e));
        if (g && gStart) {
            view.z = clampGestureZoom(gStart.z, g.scale);
            view.tx = gStart.tx + g.panPx[0];
            view.ty = gStart.ty + g.panPx[1];
            clampView();
            render();
            return;
        }
        if (!gestures.count) return;
        const p = localPos(e);
        if (downPos && Math.hypot(p[0] - downPos[0], p[1] - downPos[1]) > 10) {
            moved = true;
            clearTimeout(pressTimer);
        }
        if (grab && moved) {
            const nv = fromScreen([p[0] + grab.grabOffset[0], p[1] + grab.grabOffset[1]]);
            mapperMove(model, grab.item.target, nv);
            render();
        }
    }

    function onUp(e) {
        const p = localPos(e);
        const remaining = gestures.up(e.pointerId);
        clearTimeout(pressTimer);
        if (remaining >= 1) return; // other finger still down
        gStart = null;
        const dt = Date.now() - downAt;
        if (grab && moved) { grab = null; downPos = null; return; } // finished a drag
        if (dt < 400 && !moved && downPos) {
            // Tap: place a vertex 40 px above the finger (TOUCH_OFFSET_PX).
            const target = fromScreen([p[0], p[1] - TOUCH_OFFSET_PX]);
            const res = mapperAdd(model, model.activeKind, target);
            if (!res.ok) {
                const el = document.getElementById('mapper-status');
                if (el) el.textContent = `cannot add: ${res.reason}`;
            }
            render();
        }
        grab = null;
        downPos = null;
    }

    // ---- pills + buttons ----
    const pillsWrap = document.getElementById('mapper-pills');
    if (pillsWrap) {
        pillsWrap.innerHTML = '';
        for (const kind of MAPPER_KINDS) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mapper-pill' + (kind === model.activeKind ? ' active' : '');
            b.dataset.kind = kind;
            b.textContent = kind[0].toUpperCase() + kind.slice(1);
            b.addEventListener('click', () => {
                model.activeKind = kind;
                pillsWrap.querySelectorAll('.mapper-pill').forEach(x => x.classList.toggle('active', x.dataset.kind === kind));
                render();
            }, on);
            pillsWrap.appendChild(b);
        }
    }
    const btnUndo = document.getElementById('btn-mapper-undo');
    const btnClose = document.getElementById('btn-mapper-close-ring');
    const btnExit = document.getElementById('btn-mapper-exit');
    if (btnUndo) btnUndo.addEventListener('click', () => { mapperUndo(model); render(); }, on);
    if (btnClose) btnClose.addEventListener('click', () => {
        const res = mapperClose(model);
        if (!res.ok) {
            const el = document.getElementById('mapper-status');
            if (el) el.textContent = `cannot close: ${res.reason}`;
        }
        render();
    }, on);
    if (btnExit) btnExit.addEventListener('click', () => destroy(), on);

    // S6 Part 2b: the save. Writes users/{uid}/holeTraces/{slug}-{hole} with
    // the FeatureCollection (closed [lon, lat] rings), the author, the
    // imagery provenance and updatedAt — the shape the export script pulls
    // and the rules cap. Needs ≥ 1 closed feature.
    //
    // Same pattern as shots and S4: NEVER await the Firestore write. Under
    // the persistent local cache the write promise resolves only on the
    // server ack, so offline it would hang the button forever (the F-9/F-11
    // class). The local cache has the write immediately; a REJECTION is a
    // real refusal (rules, not signed in) — an offline write never rejects.
    const btnSave = document.getElementById('btn-mapper-save');
    if (btnSave) {
        // The card ships the button disabled (2a, before the save existed);
        // the mount enables it — enabling is not awaiting the write.
        btnSave.disabled = false;
        btnSave.title = 'Save the areas drawn on this hole';
        btnSave.addEventListener('click', async () => {
            const status = document.getElementById('mapper-status');
            if (!model.features.length) {
                if (status) status.textContent = 'No area is ready to save. Join the last point to the first to close an area, then choose Save.';
                return;
            }
            try {
                const { AppState } = await import('./state.js');
                const { db } = await import('./firebase-config.js');
                const { doc, setDoc } = await import('firebase/firestore');
                const uid = AppState.currentUser?.uid;
                if (!uid) throw Object.assign(new Error('not signed in'), { code: 'unauthenticated' });
                const payload = {
                    features: mapperGeoJSON(model, hole, {
                        authorUid: uid,
                        imagery: imagery?.url || null,
                        courseSlug: slug,
                        physicalHole: Number(holeNumber),
                    }, { firestoreSafe: true }),
                    authorUid: uid,
                    source: { provider: 'hand-trace', imagery: imagery?.url || null },
                    updatedAt: new Date().toISOString(),
                };
                const write = setDoc(doc(db, 'users', uid, 'holeTraces', `${slug}-${Number(holeNumber)}`), payload);
                // The status line is shared with the next mount: a closed
                // mapper must not write into another hole's status.
                if (status && !destroyed) status.textContent = `${payload.features.features.length} map area(s) queued. Reconnect to finish syncing.`;
                write.catch((err) => {
                    const el = document.getElementById('mapper-status');
                    if (el && !destroyed) el.textContent = userErrorMessage(err, 'Could not save this map. Keep it open, check your connection and try Save again.');
                });
            } catch (err) {
                if (status && !destroyed) status.textContent = userErrorMessage(err, 'Could not save this map. Keep it open, check your connection and try Save again.');
            }
        }, on);
    }

    canvas.addEventListener('pointerdown', onDown, on);
    canvas.addEventListener('pointermove', onMove, on);
    canvas.addEventListener('pointerup', onUp, on);
    canvas.addEventListener('pointercancel', onUp, on);
    canvas.style.touchAction = 'none';

    document.getElementById('mapper-hole-label').textContent = `${slug} · hole ${holeNumber}`;

    function destroy() {
        if (destroyed) return; // the ✕ reaches both this mount and the binder
        destroyed = true;
        clearTimeout(pressTimer);
        listeners.abort();
        card.classList.add('hidden');
        if (card._mapper === handle) card._mapper = null;
    }

    render();
    // Test/inspection handle on the card element: the model and the imagery
    // corners in screen px (the layout assertion checks the photo fits).
    const handle = {
        model,
        cornersScreen: () => cornersFrame.map(toBase).map(toScreen),
        canvasSize: () => ({ w: cssW, h: cssH }),
        destroy,
    };
    card._mapper = handle;
    return handle;
}
