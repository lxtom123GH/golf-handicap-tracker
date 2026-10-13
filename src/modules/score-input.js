import { AppState, mutateList } from '../state.js';
import { fairwayFromLie, derivedGir } from '../play-mode.js';
import { UI } from '../ui.js';
import { renderBagButtons, shortClubLabel } from './card-render.js';
import { showUndoCard, dismissUndoCard } from './undo-card.js';
import { db } from "../firebase-config.js";
import { collection, doc, setDoc, updateDoc, deleteDoc, getDocs, query, where, limit } from "firebase/firestore";
import { courseSlugFor, loadCourseOverlay, mountHoleOverlay, curveCarryM } from "../hole-overlay.js";
import { loadHole, getLastGpsFix, onGpsFix, isGpsWatchActive, collectGpsBiasSample } from "../oncourse.js";
import { COURSE_DATA } from "../course-data.js";
// S4: toFrame converts the GPS fix into the mounted overlay's hole frame;
// S10: fromFrame is its inverse — a dragged marker back to lat/lon.
import { toFrame, fromFrame } from "../geo.js";
// S7: pure ghost selection (tee shots + same shot number, current round excluded).
import { selectGhostShots } from "./ghost-lines.js";
// S10: the hold-still capture policy (pure) gates what chains onto shots.
import { createCapture, GPS_POLICY } from "../gps-capture.js";
// S1 Part A geometry: derive startLine/shape/missPattern from the swipes.
import { classifyCurve, missPatternFrom } from "../shot-shape.js";
import { classifyCaptureRole, expectedStartXY } from "../shot-start.js";
import { shotEntryVisibility } from "../shot-entry.js";
// S11: the step line, button labels and captions are pure functions of the shot.
import { wizardStepText, shotButtons, modeCaption, trackButtonLabel, loggedToast, undoCardText } from "../wizard-flow.js";

// S9 affordance: no shot-list UI exists yet, so nothing in the app calls
// loadExistingShotData — the E2E drives the app's own re-entry through this
// handle (the entry point a future shot list will use). A plain function
// reference; it holds no state and gates nothing. Gated to localhost — the
// same check the Firebase config uses to route to the emulators.
if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    window.loadExistingShotData = loadExistingShotData;
}

// ---- Hole overlay in the wizard (owner's idea 2026-09-16) ----
// The curve lives on the shot document as lineIntended / lineActual
// ([{x, y}] metres in the hole frame — Firestore rejects nested arrays) plus
// lineFrame {origin, bearing, courseSlug, physicalHole}.
let _lineCtl = null;
// Which round/course/hole _lineCtl was mounted for: the controller outlives the
// wizard, so a capture on the next hole must not use the last hole's frame.
let _lineCtlHoleKey = null;
const _holeKey = () => `${AppState.activeRoundId}|${AppState.currentRoundCourseName}|${AppState.currentHole}`;
// Owner 2026-10-05: the Map first view follows live GPS (unsubscribe fn).
let _liveFollowOff = null;
// Codex P2 (pass 3): when the GPS watch last stopped. The cached fix lives
// 90 s, so after an off/on it can predate the new watch; it never seeds.
let _gpsStoppedAt = 0;
if (typeof document !== 'undefined') {
    document.addEventListener('gps-watch-stopped', () => { _gpsStoppedAt = Date.now(); });
}
let _overlayHole = null; // S12 A3: the loaded overlay hole, for the Club row's d
// D31: each map mount takes a number; a mount that a newer one overtook
// (two awaits in flight) gives up instead of mounting a second map.
let _mountSeq = 0;
const toObjs = (pts) => (pts ? pts.map(([x, y]) => ({ x, y })) : null);
const toPairs = (objs) => (objs ? objs.map(o => [o.x, o.y]) : null);

// ---- S12 B1: full-height draw mode -----------------------------------------
// The wizard card carries .draw-mode; #section-line goes fixed full-screen
// (CSS) and the overlay re-mounts at the larger size. A small undo stack
// lets Undo revert the last stored curve in either mode.
let _drawMode = false;
const _curveUndo = [];
// S12 D2: the "Hit something" arm — with it on, the next TAP on the actual
// line places the deflection marker. Module-local, never persisted (the
// marker itself is, as lineActualDeflectAt on the shot).
let _deflectArmed = false;
function setDeflectArmed(on) {
    _deflectArmed = on;
    for (const id of ['btn-deflect', 'btn-line-deflect']) {
        document.getElementById(id)?.classList.toggle('active-choice', on);
    }
}
// The draw-mode state + chrome, without a re-mount (callers that are about
// to mount anyway — map-first shot opening — must not mount twice).
function applyDrawModeChrome(on) {
    _drawMode = on;
    document.getElementById('oncourse-wizard')?.classList.toggle('draw-mode', on);
    // Map first: the same full-screen map, with the club row and Log docked
    // underneath (style.css .map-first). ✎ inside a map-first round docks too.
    document.getElementById('oncourse-wizard')?.classList.toggle('map-first', on && mapFirstWanted());
    // The fixed version strip (z 1000) would sit over the docked club row.
    document.body.classList.toggle('map-first-open', on && mapFirstWanted());
    const done = document.getElementById('btn-line-done');
    if (done) {
        done.classList.toggle('hidden', !on);
        // D32: on the Map-first dock this button opens the rest of the form.
        const mf = on && mapFirstWanted();
        done.textContent = mf ? 'Details' : 'Done';
        done.setAttribute('aria-label', mf ? 'Details: the whole shot form' : 'Close draw mode');
    }
    document.getElementById('btn-line-draw')?.classList.toggle('hidden', on);
    refreshUndoButton();
}
function setDrawMode(on) {
    applyDrawModeChrome(on);
    syncShotLineOverlay().catch(e => console.warn('[overlay] not shown:', e));
}
/** Owner 2026-10-04 "the map isn't full screen": the 'map' shot-entry pref
 * opens every new shot on the full-screen map (draw mode). */
function mapFirstWanted() {
    return shotEntryVisibility(AppState.shotEntry).mapFirst;
}
/** The line the swipes are drawing right now ('intended' | 'actual'). */
function activeLineMode() {
    return document.querySelector('#section-line [data-line-mode].active-choice')?.getAttribute('data-line-mode') || 'intended';
}
/** D29 (simplify 2026-10-07): the line Undo history belongs to ONE shot.
 * Opening a shot empties it, so Undo on shot 2 can never paste shot 1's
 * earlier line into this one. */
function resetCurveUndo() {
    _curveUndo.length = 0;
}
/** D29: Undo works on the line under the active pill — its last stroke, or
 * (with none left) clearing it, as the Clear button did. Review P3: it never
 * reaches the other pill's line. */
function undoTarget() {
    const mode = activeLineMode();
    for (let i = _curveUndo.length - 1; i >= 0; i--) if (_curveUndo[i].mode === mode) return { mode, index: i };
    const d = AppState.currentShotData || {};
    const line = mode === 'actual' ? d.lineActual : d.lineIntended;
    return line && line.length ? { mode, index: -1 } : null;
}
/** D29: Undo shows whenever it can do something. In draw mode it keeps its
 * place in the docked row (disabled), so the centred row never shifts under
 * a thumb (review P3); in the normal wizard it hides. */
function refreshUndoButton() {
    const btn = document.getElementById('btn-line-undo');
    if (!btn) return;
    const can = !!undoTarget();
    btn.disabled = !can;
    btn.classList.toggle('hidden', !can && !_drawMode);
}
function undoLastCurve() {
    const d = AppState.currentShotData;
    if (!d) return;
    const target = undoTarget();
    if (!target) return;
    const last = target.index >= 0 ? _curveUndo.splice(target.index, 1)[0] : null;
    if (!last) {
        // D29: nothing drawn on this shot yet to take back (e.g. a reopened
        // plan) — Undo clears the active line, as Clear did. The clear runs
        // through onChange, so a second Undo brings the line back.
        const mode = activeLineMode();
        const line = mode === 'actual' ? d.lineActual : d.lineIntended;
        if (line && line.length) _lineCtl?.clear(mode);
        refreshUndoButton();
        return;
    }
    d[last.field] = last.prev ? toObjs(last.prev) : null;
    if (last.mode === 'actual') {
        // S12 D2: undo also reverts the deflection marker (index or cleared).
        d.lineActualDeflectAt = last.prevDeflectAt ?? null;
        _lineCtl?.setCurves({ actual: last.prev || null, deflectAt: d.lineActualDeflectAt });
    } else {
        _lineCtl?.setCurves({ intended: last.prev || null });
    }
    if (d.lineActual) applyDerivedShape(d);
    lineReadout();
}

function lineReadout() {
    const el = document.getElementById('line-readout');
    if (!el) return;
    const d = AppState.currentShotData || {};
    const parts = [];
    const i = curveCarryM(toPairs(d.lineIntended)), a = curveCarryM(toPairs(d.lineActual));
    if (i !== null) parts.push(`Intended ${i} m`);
    if (a !== null) parts.push(`Actual ${a} m`);
    if (i !== null && a !== null) parts.push(`(${a - i >= 0 ? '+' : ''}${a - i} m)`);
    // S4: the GPS-chained start note — the spec's acceptance string.
    if (d.startPos && typeof d.startPos.accuracyM === 'number') {
        parts.push(`Start from GPS (±${d.startPos.accuracyM} m)`);
    }
    // S9: an endpoint-only shot (flight unseen) has no drawn actual — its
    // finish is the GPS chain's measured point.
    if (d.actualEndpointOnly) parts.push('Finish from GPS');
    // S12 D2: the deflection marker says so.
    if (d.lineActualDeflectAt != null) parts.push('deflected');
    // S10: a dragged marker says so; a refusal explains itself. The refusal
    // note is module-local (never persisted on the shot).
    if (d.gpsCapture && d.gpsCapture.adjusted) parts.push('adjusted');
    if (!d.startPos && _gpsReadoutNote) parts.push(_gpsReadoutNote);
    // S1 Part B: the derived summary rides at the end — '· Start Right · Draw · 12 m long'.
    const dv = d.derived;
    if (dv) {
        if (dv.startLine) parts.push(`Start ${dv.startLine}`);
        if (dv.shape) parts.push(dv.shape);
        if (dv.finishOffset && typeof dv.finishOffset.longM === 'number') {
            const lm = Math.round(dv.finishOffset.longM);
            parts.push(`${Math.abs(lm)} m ${lm >= 0 ? 'long' : 'short'}`);
        }
    }
    el.textContent = parts.length ? parts.join(' · ') : 'Swipe the line you mean to hit; switch to Actual after the shot.';
    refreshWizardFlow();
    refreshUndoButton();
}

function setLineMode(mode) {
    // S9: flight unseen has no actual curve to draw — Actual is replaced by
    // the 'Finish from GPS' label and the canvas stays on the intended line.
    if (mode === 'actual' && AppState.currentShotData?.flightUnseen) mode = 'intended';
    _lineCtl?.setMode(mode);
    document.querySelectorAll('#section-line [data-line-mode]').forEach(b => {
        b.classList.toggle('active-choice', b.getAttribute('data-line-mode') === mode);
    });
    refreshWizardFlow(); // S11: the caption follows the active pill
    refreshUndoButton(); // D29: Undo follows the active pill's line
}

/**
 * S1 Part B: derive startLine/shape/missPattern from the swiped curves.
 * Always stored on d.derived (with a timestamp); the three wizard groups are
 * prefilled unless the golfer tapped a value manually (the *Manual flags set
 * in event-binders.js — a deliberate tap survives later swipes). Buttons-only
 * override: the derived values never overwrite a manual pick.
 */
function applyDerivedShape(d) {
    const derived = classifyCurve(d.lineActual, { intended: d.lineIntended, deflectAt: d.lineActualDeflectAt ?? null });
    // S4: a measured finish beats the drawn endpoint — for the offset only;
    // the drawn curve itself is stored unaltered.
    if (d.finishXY && d.lineIntended && d.lineIntended.length) {
        const ie = d.lineIntended[d.lineIntended.length - 1];
        derived.finishOffset = { longM: d.finishXY.y - ie.y, rightM: d.finishXY.x - ie.x };
    }
    d.derived = { ...derived, at: Date.now() };
    for (const [group, val] of [['startLine', derived.startLine], ['shape', derived.shape], ['missPattern', missPatternFrom(derived.finishOffset)]]) {
        if (val && !d[`${group}Manual`]) d[group] = val;
    }
    const wizard = document.getElementById('oncourse-wizard');
    if (wizard) highlightGroups(wizard, d);
}

/** S10: the golfer dragged the start marker — rewrite the position (±3 m by
 * definition of a deliberate placement), mark the capture adjusted, and let
 * the previous shot's finish follow to the same spot. The overlay passes its
 * own frame, so a slow mount elsewhere can't stale us. */
function _onStartDrag(xyFrame, frame) {
    const d = AppState.currentShotData;
    if (!d || !d.startPos || !frame) return;
    d.startXY = { x: Math.round(xyFrame[0] * 10) / 10, y: Math.round(xyFrame[1] * 10) / 10 };
    const [lat, lon] = fromFrame(frame, xyFrame);
    d.startPos = { ...d.startPos, lat, lon, accuracyM: 3 };
    d.gpsCapture = { ...d.gpsCapture, accuracyM: 3, adjusted: true };
    const shots = AppState.currentHoleShots || [];
    const prev = shots[shots.length - 1];
    if (prev && prev.id && prev.finishPos) {
        const finishPos = { ...prev.finishPos, lat, lon, accuracyM: 3 };
        const patch = { finishPos, finishXY: d.startXY };
        mutateList('currentHoleShots', (list) => {
            const last = list[list.length - 1];
            if (last && last.id === prev.id) {
                last.finishPos = finishPos;
                last.finishXY = d.startXY;
            }
        });
        updateDoc(doc(db, 'shots', prev.id), patch)
            .catch(e => console.warn('[s10] drag finish write not acked (offline or denied):', e?.code || e));
    }
    refreshShotWizard(); // D31: the overlay already moved the marker
}

// S3: hole plans. planId = <courseSlug>-<physicalHole>; the session cache
// holds the loaded line (or null = known absent) so each hole costs ONE
// read per round. The plan identity + cap live in hole-plan-card.js (the
// Part B editor shares them); the player side only ever reads.
export { planIdFor, PLAN_MAX_POINTS } from './hole-plan-card.js';
import { planIdFor } from './hole-plan-card.js';
const planCache = new Map();

const ghostCache = new Map();
// S7: how many of this golfer's shots on ONE hole the ghost query may read.
// See the checkpoint note at the query: with no orderBy the cap must sit
// above any realistic per-hole history or "last five" silently becomes
// "five arbitrary".
const GHOST_QUERY_CAP = 500;
function ghostModeStorage(value) {
    const valid = mode => mode === 'intended' || mode === 'both' || mode === 'none';
    let mode = valid(value) ? value : 'intended';
    try {
        if (value === undefined) {
            const stored = localStorage.getItem('golf.ghosts');
            mode = valid(stored) ? stored : 'intended';
        } else {
            localStorage.setItem('golf.ghosts', mode);
        }
    } catch {
        // Storage may be unavailable; retain the in-memory mode.
    }
    return mode;
}

let ghostMode = ghostModeStorage();

function updateGhostReadout(ghosts, mode) {
    const readout = document.getElementById('line-ghost-count');
    if (!readout) return;
    const count = ghosts?.intended?.length ?? 0;
    readout.textContent = `${count} previous line${count === 1 ? '' : 's'}`;
    readout.classList.toggle('hidden', mode === 'none' || count === 0);
}

async function loadGhosts(slug, physical, currentShotNumber) {
    try {
        const user = AppState.currentUser;
        if (!user) return { intended: [], actual: [] };

        const key = `${slug}-${physical}`;
        // S7 rebase fix: the trial read AppState.currentRoundId, which does
        // not exist (undefined) — so the cache scoped to `undefined ===
        // undefined` always hit and round 2 replayed round 1's empty docs.
        // The live field is activeRoundId (state.js:44, used by the write
        // path below and every round consumer).
        const activeRoundId = AppState.activeRoundId;
        // One query per hole PER ROUND: the cache entry is scoped to the round
        // that produced it, so a new round re-queries (the previous round's
        // own shots changed the answer, and its exclusion does too).
        const cached = ghostCache.get(key);
        if (cached && cached.roundId === activeRoundId) {
            return selectGhostShots(cached.docs, currentShotNumber, activeRoundId);
        }

        // S7 rebase: EQUALITY-ONLY query — no server-side orderBy. The spec's
        // composite (uid + courseSlug + physicalHole + timestamp desc) needed
        // a composite-index backfill that DEADLOCKED the persistent local
        // cache after a reload on the emulator (the trial's round-2 zero: the
        // query never settled). Equality filters ride single-field auto
        // indexes that always exist, and the ordering moves to the client —
        // the same most-recent-first selection, computed in pure code.
        //
        // Checkpoint (2026-09-20): the deviation stands, with one change.
        // A query with NO orderBy returns documents in document-id order, and
        // shot ids are random auto-ids — so `limit(50)` did not mean "the 50
        // most recent", it meant "50 arbitrary shots on this hole" once the
        // golfer had more than 50 there. "Your last five lines" would then
        // silently become five old ones. The cap is now far above any
        // realistic per-hole history (500 ≈ 125 rounds on one hole); reads
        // are billed per document actually returned, so a hole with 40 shots
        // still costs 40. Past the cap the answer degrades, and that is the
        // known limit of this approach: restoring the server-side orderBy
        // needs the composite index (kept in firestore.indexes.json) AND a
        // fix for the persistent-cache stall it triggered.
        const snapshot = await getDocs(query(
            collection(db, 'shots'),
            where('uid', '==', user.uid),
            where('lineFrame.courseSlug', '==', slug),
            where('lineFrame.physicalHole', '==', physical),
            limit(GHOST_QUERY_CAP)
        ));
        const docs = snapshot.docs.map(doc => doc.data())
            .sort((a, b) => String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? '')));
        ghostCache.set(key, { roundId: activeRoundId, docs });
        return selectGhostShots(docs, currentShotNumber, activeRoundId);
    } catch (error) {
        const code = error?.code ?? 'unknown';
        console.warn('[s7] ghost query failed:', code, error?.message || error, error?.stack || '');
        return { intended: [], actual: [] };
    }
}

async function syncShotLineOverlay() {
    const section = document.getElementById('section-line');
    const canvas = document.getElementById('shot-line-canvas');
    if (!section || !canvas) return;
    // S11: the mount is async; clear the view marker now so anyone waiting for
    // "the overlay is ready" (tests, and the step line) sees the new mount,
    // not the previous shot's.
    delete canvas.dataset.viewMode;
    const seq = ++_mountSeq;
    const slug = courseSlugFor(AppState.currentRoundCourseName);
    const course = slug ? await loadCourseOverlay(slug) : null;
    if (seq !== _mountSeq) return; // D31: a newer mount took over
    const teeData = COURSE_DATA[AppState.currentRoundCourseName]?.[AppState.currentRoundTee] || {};
    const physical = teeData.physicalHoles?.[AppState.currentHole - 1] || AppState.currentHole;
    const hole = course?.holes?.[physical] || null;
    _overlayHole = hole; // S12 A3: cached so the bag row can measure d
    // S12 B1: the draw-mode chrome follows the mount.
    document.getElementById('btn-line-draw')?.classList.toggle('hidden', _drawMode || !hole);
    document.getElementById('btn-line-done')?.classList.toggle('hidden', !_drawMode);
    refreshUndoButton();
    const doneBtn = document.getElementById('btn-line-done');
    if (doneBtn && !doneBtn.dataset.bound) {
        doneBtn.dataset.bound = '1';
        // Done is a sibling of the step line (its z-index must beat the bar),
        // outside the section's delegation — bound directly.
        doneBtn.addEventListener('click', () => setDrawMode(false));
    }
    stopLiveFollow();
    if (_lineCtl) { _lineCtl.destroy(); _lineCtl = null; }
    section.classList.toggle('hidden', !hole);
    // Map first on a course with no overlay file: there is no map to be
    // full-screen — drop back to the normal wizard rather than dock the
    // club row and Log over nothing.
    if (!hole && _drawMode) applyDrawModeChrome(false);
    if (!hole) return;
    // S3: the plan for this hole — ONE getDoc per hole per round (no
    // listener), cached by planId for the session. Offline the persistent
    // cache serves it; if the read fails, no plan and no error shown.
    const pid = planIdFor(slug, physical);
    let planLine = null;
    if (AppState.currentUser?.uid) {
        if (!planCache.has(pid)) {
            try {
                const { db } = await import('../firebase-config.js');
                const { doc, getDoc } = await import('firebase/firestore');
                const snap = await getDoc(doc(db, 'users', AppState.currentUser.uid, 'holePlans', pid));
                // Firestore stores the plan as [{x, y}] maps (no nested
                // arrays); the overlay wants [x, y] pairs — normalise once,
                // at cache-fill.
                const rawLine = snap.exists() ? (snap.data().line || null) : null;
                const pairs = Array.isArray(rawLine) ? rawLine.map((p) => [p.x, p.y]) : null;
                planCache.set(pid, pairs && pairs.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) ? pairs : null);
            } catch (err) {
                console.warn('hole plan load failed:', err?.message || err);
                planCache.set(pid, null);
            }
        }
        planLine = planCache.get(pid);
    }
    if (seq !== _mountSeq) return; // D31: superseded while the plan loaded
    // A capture may have replaced the shot while the plan was loading.
    const d = AppState.currentShotData;
    if (planLine && planLine.length >= 2) {
        d.planId = pid; // the shot records which plan it was scored against
    } else {
        planLine = null;
        delete d.planId;
    }
    const useBtn = document.getElementById('btn-line-use-plan');
    if (useBtn) useBtn.classList.toggle('hidden', !planLine);
    // S7: mount immediately with empty ghosts - the query is async and a
    // golfer can swipe the moment the canvas appears. loadGhosts applies via
    // setGhosts when it resolves (guarded against a re-mounted controller).
    let ghosts = { intended: [], actual: [] };
    if (!section.dataset.bound) {
        section.dataset.bound = '1';
        section.addEventListener('click', (e) => {
            const modeBtn = e.target.closest('[data-line-mode]');
            if (modeBtn) { setLineMode(modeBtn.getAttribute('data-line-mode')); return; }
            // S12 B1: full-height draw mode — the canvas re-mounts at the
            // larger size; stored curves are metres, nothing is lost.
            if (e.target.closest('#btn-line-draw')) { setDrawMode(true); return; }
            if (e.target.closest('#btn-line-undo')) { undoLastCurve(); return; }
            // S12 D2: "Hit something" — arm, tap the actual line, done.
            if (e.target.closest('#btn-deflect') || e.target.closest('#btn-line-deflect')) {
                setDeflectArmed(!_deflectArmed);
                showToast(_deflectArmed ? 'Tap where the ball struck' : 'Deflection off');
                return;
            }
            if (e.target.closest('#btn-line-ghosts')) {
                ghostMode = ghostModeStorage(
                    ghostMode === 'intended' ? 'both' :
                    ghostMode === 'both' ? 'none' : 'intended'
                );
                const controller = _lineCtl;
                const currentGhosts = controller?.state?.ghosts ?? { intended: [], actual: [] };
                if (controller) {
                    controller.state ??= {};
                    controller.state.ghosts = currentGhosts;
                    controller.state.ghostMode = ghostMode;
                }
                updateGhostReadout(currentGhosts, ghostMode);
                if (typeof controller?.setGhosts === 'function') {
                    controller.setGhosts({ ghosts: currentGhosts, ghostMode });
                } else {
                    void syncShotLineOverlay();
                }
                return;
            }
            // S3: one tap for players who agree with the coach — the plan
            // becomes the intended line (the same state a swipe would set).
            if (e.target.closest('#btn-line-use-plan')) {
                const planLine = planCache.get(planIdFor(slug, physical));
                if (planLine && _lineCtl) {
                    const d = { ...AppState.currentShotData };
                    _lineCtl.setCurves({ intended: planLine });
                    d.lineIntended = toObjs(planLine);
                    const f = _lineCtl.frame;
                    d.lineFrame = { origin: { lat: f.origin[0], lon: f.origin[1] }, bearing: f.bearing, courseSlug: slug, physicalHole: physical };
                    AppState.currentShotData = d;
                    setLineMode('intended');
                    lineReadout();
                }
            }
        });
    }
    const attr = document.getElementById('line-attribution');
    if (attr) {
        const list = course.attributions?.length ? course.attributions : [course.source?.attribution || '(c) OpenStreetMap contributors'];
        attr.textContent = 'Map data ' + list.join(' - ') + ' ';
        // OSM asks for a link to its licence wherever its data is shown.
        const link = document.createElement('a');
        link.href = 'https://www.openstreetmap.org/copyright';
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Licence';
        attr.appendChild(link);
    }
    const startMode = d.lineIntended && !d.lineActual && !d.flightUnseen ? 'actual' : 'intended';
    // S12 A2: ONE start point per shot, chosen here in priority order —
    // the measured GPS position (possibly dragged), else the previous
    // shot's finish (measured or drawn), else the tee. Passed once as
    // startXY; focus is derived from the same value.
    const shotStart = (() => {
        const prev = (AppState.currentHoleShots || []).filter(s => s.id !== d.id && s.hole === AppState.currentHole).slice(-1)[0];
        const prevEnd = prev?.finishXY ? [prev.finishXY.x, prev.finishXY.y]
            : (prev?.lineActual?.length ? [prev.lineActual[prev.lineActual.length - 1].x, prev.lineActual[prev.lineActual.length - 1].y] : null);
        return d.startXY ? [d.startXY.x, d.startXY.y] : (prevEnd || [0, 0]);
    })();
    if (_lineCtl) { _lineCtl.destroy(); _lineCtl = null; } // never two live maps
    _lineCtl = mountHoleOverlay(canvas, hole, {
        curves: { intended: toPairs(d.lineIntended), actual: toPairs(d.lineActual), deflectAt: d.lineActualDeflectAt ?? null },
        mode: startMode,
        // S11: frame the shot, not the hole.
        focus: { startXY: shotStart, shotNumber: d.shotNumber },
        // S12 A2: the anchor every curve starts from; green when measured.
        startXY: shotStart,
        startMeasured: !!d.startXY && d.gpsCapture?.role !== 'finish',
        // S12 C: opt-in auto-rotate — the shot view's up is anchor → green.
        // Map first (owner 2026-10-05, "like a GPS map"): target-up is the
        // default there unless the golfer turned Rotate map off in Settings.
        autoRotate: !!AppState.rotateMap || (mapFirstWanted() && _drawMode && rotateMapNotRefused()),
        // S3: the coach/self plan under the player's curves.
        plan: planLine,
        // S6 Part 1: the shipped aerial image under the base (Keperra holes
        // carry hole.imagery from the build script).
        ghosts,
        ghostMode,
        imagery: hole.imagery && hole.imagery.url && hole.imagery.extent3857
            ? { url: hole.imagery.url, extent3857: hole.imagery.extent3857, px: hole.imagery.px }
            : null,
        // One course-wide aerial under the hole crop (no flat fill at the edges).
        contextImagery: course.contextImagery && course.contextImagery.url && course.contextImagery.extent3857
            ? { url: course.contextImagery.url, extent3857: course.contextImagery.extent3857, px: course.contextImagery.px }
            : null,
        finishDot: d.actualEndpointOnly && d.finishXY ? [d.finishXY.x, d.finishXY.y] : null,
        startMarker: d.startPos
            ? { lat: d.startPos.lat, lon: d.startPos.lon, quality: d.gpsCapture?.state, draggable: true }
            : null,
        onStartDrag: _onStartDrag,
        // S12 D2: the overlay asks whether the "Hit something" arm is on and
        // tells us when a tap consumed it.
        deflectArmed: () => _deflectArmed,
        onDeflectPlaced: () => setDeflectArmed(false),
        onChange: ({ mode, points, frame, curves, anchorChanged }) => {
            // GPS capture replaces the shot record without remounting the map.
            // Read the live record so later strokes retain the captured position.
            const d = { ...AppState.currentShotData };
            // S12 B1: Undo reverts to whatever this mode held before the stroke.
            if (!anchorChanged) {
                _curveUndo.push({
                    mode,
                    field: mode === 'actual' ? 'lineActual' : 'lineIntended',
                    prev: mode === 'actual' ? toPairs(d.lineActual) : toPairs(d.lineIntended),
                    prevDeflectAt: mode === 'actual' ? (d.lineActualDeflectAt ?? null) : undefined,
                });
                if (_curveUndo.length > 10) _curveUndo.shift();
            }
            d.lineIntended = toObjs(curves.intended);
            d.lineActual = toObjs(curves.actual);
            // S12 D2: the deflection marker rides on the curves object.
            d.lineActualDeflectAt = curves.deflectAt ?? null;
            d.lineFrame = { origin: { lat: frame.origin[0], lon: frame.origin[1] }, bearing: frame.bearing, courseSlug: slug, physicalHole: physical };
            if (d.lineActual) applyDerivedShape(d);
            AppState.currentShotData = d;
            lineReadout();
        },
    });
    _lineCtlHoleKey = _holeKey();
    _lineCtl.state ??= {};
    _lineCtl.state.ghosts = ghosts;
    _lineCtl.state.ghostMode = ghostMode;
    updateGhostReadout(ghosts, ghostMode);
    const ctl = _lineCtl;
    loadGhosts(slug, physical, d?.shotNumber ?? 1).then((g) => {
        if (_lineCtl !== ctl) return; // a re-mount superseded this query
        ctl.setGhosts({ ghosts: g, ghostMode });
        updateGhostReadout(g, ghostMode);
    });
    setLineMode(startMode);
    lineReadout();
    applyShotEntryVisibility(); // S12 E: honour the preference on every shot mount
    if (_drawMode && mapFirstWanted()) startLiveFollow(ctl, hole);
}

function rotateMapNotRefused() {
    try { return localStorage.getItem('golf.rotateMap') !== 'off'; } catch { return true; }
}

/** Live-follow accuracy gate and minimum movement before the map re-turns. */
export const LIVE_FOLLOW = { maxAccuracyM: 20, minMoveM: 3, maxFromGreenM: 750 };

/**
 * Pure: should this fix move the map? `prev` is the last applied position
 * (hole-frame metres) or null. Refuses poor fixes, fixes far off this hole
 * (you are on another hole or in the car park) and jitter under minMoveM.
 */
export function liveFollowStep(prev, xy, accuracyM, greenXY, policy = LIVE_FOLLOW) {
    if (!xy || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return null;
    if (!(accuracyM <= policy.maxAccuracyM)) return null;
    if (greenXY && Math.hypot(greenXY[0] - xy[0], greenXY[1] - xy[1]) > policy.maxFromGreenM) return null;
    if (prev && Math.hypot(prev[0] - xy[0], prev[1] - xy[1]) < policy.minMoveM) return null;
    return [xy[0], xy[1]];
}

function startLiveFollow(ctl, hole) {
    stopLiveFollow();
    if (!ctl?.frame || !ctl.setLiveAnchor) return;
    const c = hole?.green?.centre;
    const greenXY = c && Number.isFinite(c.lat) ? toFrame(ctl.frame, [c.lat, c.lon]) : null;
    let applied = null;
    const take = (fix) => {
        if (!fix || _lineCtl !== ctl) return;
        const xy = toFrame(ctl.frame, [fix.lat, fix.lon]);
        const next = liveFollowStep(applied, xy, fix.accuracyM, greenXY);
        if (!next) return;
        applied = next;
        ctl.setLiveAnchor(next);
    };
    // Codex P2 (post-merge review): the cached fix outlives a GPS that was
    // turned off (90 s); only an active watch's fix is "where you are now".
    const seed = isGpsWatchActive() ? getLastGpsFix() : null;
    if (seed && (seed.at || 0) > _gpsStoppedAt) take(seed);
    const offFix = onGpsFix(take);
    // Codex P2 (re-review): the watch stopping (GPS off, or killed by an
    // error) sends no fix, so the dot would keep claiming the last position.
    // Clear it; a restarted watch's first fix shows it again.
    const onStop = () => {
        applied = null;
        if (_lineCtl === ctl) ctl.setLiveAnchor(null);
    };
    document.addEventListener('gps-watch-stopped', onStop);
    _liveFollowOff = () => { offFix(); document.removeEventListener('gps-watch-stopped', onStop); };
}

function stopLiveFollow() {
    if (_liveFollowOff) { _liveFollowOff(); _liveFollowOff = null; }
}

// S12 E: apply the shot-entry preference to the live wizard. Runs at shot
// mount and whenever the Settings select changes. Visibility is state-driven
// via the .hidden class only (Sydney Protocol [D-02]).
export function applyShotEntryVisibility() {
    const v = shotEntryVisibility(AppState.shotEntry);
    // Review fix: the preference can only SHOW what the mount would
    // have shown — no overlay hole means no section, and inside draw mode
    // (S12 B) the Draw button stays hidden; Done is the way out.
    document.getElementById('section-line')?.classList.toggle('hidden', !v.lineSection || !_overlayHole);
    document.getElementById('btn-line-draw')?.classList.toggle('hidden', !v.drawButton || _drawMode || !_overlayHole);
    const resultDetails = document.getElementById('shot-entry-result-details');
    if (resultDetails) {
        resultDetails.open = v.resultGridsOpen;
        resultDetails.classList.toggle('collapsed', !v.resultGridsOpen);
    }
    // In draw mode the intent grids collapse too (the swing-detail details
    // closes; the golfer can still tap it open — 'still there').
    if (!v.resultGridsOpen) {
        const swing = document.getElementById('section-swing-detail');
        if (swing) swing.open = false;
    }
    return v;
}

// S10: the active GPS capture session — module-local by contract (GPS is off
// AppState except through shot objects). { cap, unsub, tick, applied }
let _captureCtl = null;

/** 'ios' | 'android' | 'other' from the UA — rides on the shot's gpsCapture. */
function platformOf() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'other';
}

// S10: a one-shot reason the readout shows when the capture refuses —
// module-local, never persisted on the shot.
let _gpsReadoutNote = null;

function _teardownCapture() {
    if (!_captureCtl) return;
    if (_captureCtl.unsub) _captureCtl.unsub();
    if (_captureCtl.tick) clearInterval(_captureCtl.tick);
    _captureCtl = null;
    const ring = document.getElementById('gps-lock-ring');
    if (ring) ring.classList.add('hidden');
}

function _setRing(pct, accuracyM) {
    // The lock ring: an SVG arc that fills over the 4 s window, the live
    // accuracy in its centre.
    const ring = document.getElementById('gps-lock-ring');
    if (!ring) return;
    const arc = ring.querySelector('.gps-lock-arc');
    const label = ring.querySelector('.gps-lock-acc');
    if (arc) {
        const r = Number(arc.getAttribute('r')) || 18;
        const c = 2 * Math.PI * r;
        arc.style.strokeDashoffset = String(c * (1 - Math.max(0, Math.min(1, pct))));
    }
    if (label) label.textContent = accuracyM != null ? `±${Math.round(accuracyM)}` : '';
}

/** S4 chain + S10 metadata, from a capture decision. */
function _applyCapturedPositions(d) {
    if (!AppState.currentShotData) return;
    // The AppState proxy observes reference changes, so build a new shot
    // record and publish it after applying the capture result.
    const shotData = { ...AppState.currentShotData };
    const fix = d.fix;
    // A distant accepted fix may represent this shot's finish.
    // A fix far from where this shot should start (tee / previous finish) is
    // where THIS shot finished - see shot-start.js. Needs the frame; without
    // If no expected start is available, keep the existing capture behavior.
    const frame = _lineCtl?.frame && _lineCtlHoleKey === _holeKey() ? _lineCtl.frame : null;
    let role = 'start';
    let expected = null;
    if (fix && frame) {
        const prev = (AppState.currentHoleShots || []).filter(s => s.id !== shotData.id && s.hole === AppState.currentHole).slice(-1)[0] || null;
        expected = expectedStartXY({ shotNumber: shotData.shotNumber, prevShot: prev });
        role = classifyCaptureRole({ shotNumber: shotData.shotNumber, fixXY: toFrame(frame, [fix.lat, fix.lon]), expectedStartXY: expected });
    }
    const r1 = (v) => Math.round(v * 10) / 10;
    if (role === 'finish') {
        const [x, y] = toFrame(frame, [fix.lat, fix.lon]);
        delete shotData.startPos;
        shotData.startXY = { x: r1(expected[0]), y: r1(expected[1]) };
        shotData.finishPos = { lat: fix.lat, lon: fix.lon, accuracyM: Math.round(fix.accuracyM), at: fix.at };
        shotData.finishXY = { x: r1(x), y: r1(y) };
        _gpsReadoutNote = (shotData.shotNumber === 1 ? 'Start: tee' : 'Start: last shot') + ' · GPS = where this shot finished';
        if (shotData.lineActual) applyDerivedShape(shotData);
    } else if (fix) {
        shotData.startPos = { lat: fix.lat, lon: fix.lon, accuracyM: Math.round(fix.accuracyM), at: fix.at };
        // startXY (hole-frame metres) rides on the shot when a frame exists —
        // S4's field. The MARKER itself is geographic and survives a slow mount.
        if (frame) {
            const [x, y] = toFrame(frame, [fix.lat, fix.lon]);
            shotData.startXY = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
        }
    } else {
        delete shotData.startPos;
        delete shotData.startXY;
    }
    shotData.gpsCapture = {
        state: d.state,
        accuracyM: fix ? Math.round(fix.accuracyM) : null,
        fixCount: d.fixCount,
        elapsedMs: Math.round(d.elapsedMs),
        platform: platformOf(),
        role,
    };

    // S4: the previous shot of this hole gets this fix as its measured finish
    // (only when it has none — a re-opened shot keeps its own). Fire-and-forget
    // write with .catch (F-11); the local array mutates through mutateList (D-03).
    // Not for a 'finish' fix: that point is THIS shot's finish, not the last one's.
    if (fix && role === 'start') {
        const shots = AppState.currentHoleShots || [];
        const prev = shots[shots.length - 1];
        if (prev && prev.id && !prev.finishPos) {
            const finishPos = { lat: fix.lat, lon: fix.lon, accuracyM: Math.round(fix.accuracyM), at: fix.at };
            const patch = { finishPos };
            mutateList('currentHoleShots', (list) => {
                const last = list[list.length - 1];
                if (last && last.id === prev.id) {
                    last.finishPos = finishPos;
                    if (shotData.startXY) {
                        last.finishXY = shotData.startXY;
                        patch.finishXY = last.finishXY;
                    }
                    // S9: an endpoint-only previous shot (flight unseen) gets
                    // its derived + missPattern from the measured finish —
                    // carry and offset count, shape and start line do not.
                    if (last.actualEndpointOnly && last.finishXY) {
                        const start = last.startXY ? [last.startXY.x, last.startXY.y] : [0, 0];
                        last.derived = {
                            ...classifyCurve([start, [last.finishXY.x, last.finishXY.y]],
                                { intended: toPairs(last.lineIntended), endpointOnly: true }),
                            at: Date.now(),
                        };
                        patch.derived = last.derived;
                        const mp = missPatternFrom(last.derived.finishOffset);
                        if (mp && !last.missPattern) { last.missPattern = mp; patch.missPattern = mp; }
                    }
                }
            });
            updateDoc(doc(db, 'shots', prev.id), patch)
                .catch(e => console.warn('[s4] finish write not acked (offline or denied):', e?.code || e));
        }
    }

    // S10: nudge an already-mounted overlay to draw the marker now (the
    // geographic marker also draws itself on every later mount).
    if (fix && _lineCtl && role === 'start') {
        _lineCtl.setStartMarker({
            lat: fix.lat, lon: fix.lon,
            quality: d.state === 'lowConfidence' ? 'lowConfidence' : 'accepted',
            draggable: true,
        });
        // D31: a GPS lock moves the start and re-frames the shot view on it -
        // no re-mount, so a swipe in progress survives (the overlay leaves a
        // view the golfer is drawing on or has moved alone).
        if (shotData.startXY) _lineCtl.refocus?.([shotData.startXY.x, shotData.startXY.y]);
    }
    if (fix && !_lineCtl && d.state === 'lowConfidence') {
        _gpsReadoutNote = 'GPS is rough (±' + Math.round(fix.accuracyM) + ' m) — no map to correct it on';
    }
    AppState.currentShotData = shotData;
    refreshShotWizard();
}

/** S10: start the hold-still capture for this shot. */
function _beginCapture() {
    _teardownCapture();
    _gpsReadoutNote = null;
    // S10 review: a round with GPS off is a normal round — no watcher, no
    // capture, no ring, and above all no GPS note in the readout. Only an
    // active watcher that fails to produce a usable fix earns a refusal.
    if (!isGpsWatchActive()) return;
    const cap = createCapture();

    // Seed with the last fix if there is one (staleness/movement is the
    // capture's call, not ours).
    const seed = getLastGpsFix();
    if (seed) cap.push({ lat: seed.lat, lon: seed.lon, accuracyM: seed.accuracyM, speedMps: seed.speedMps ?? null, at: seed.at });

    const t0 = Date.now();
    const tick = setInterval(() => {
        const elapsed = Date.now() - t0;
        const d = cap.decide();
        _setRing(Math.min(1, elapsed / GPS_POLICY.windowMs), d.fix ? d.fix.accuracyM : null);
    }, 120);
    const ring = document.getElementById('gps-lock-ring');
    if (ring) ring.classList.remove('hidden');

    const finishWith = (d) => {
        clearInterval(tick);
        ctl.unsub();
        _setRing(1, d.fix ? d.fix.accuracyM : null);
        const ring2 = document.getElementById('gps-lock-ring');
        if (ring2) ring2.classList.add('hidden');
        if (d.state === 'accepted' || d.state === 'lowConfidence') {
            _gpsReadoutNote = null;
            _applyCapturedPositions(d);
        } else if (d.state === 'preciseOff') {
            _gpsReadoutNote = 'Precise Location is off — Settings › Privacy › Location Services › Safari Websites';
        } else {
            _gpsReadoutNote = d.fix ? `GPS refused: ${Math.round(d.fix.accuracyM)} m` : 'GPS refused: no fix';
        }
        _captureCtl = null;
        refreshShotWizard(); // D31: the ring and readout only - never a re-mount
    };

    const ctl = {
        cap,
        unsub: onGpsFix((fix) => {
            cap.push(fix);
            const d = cap.decide();
            if (d.state === 'accepted' || d.state === 'lowConfidence' || d.state === 'refused' || d.state === 'preciseOff') {
                finishWith(d);
            } else {
                _setRing(Math.min(1, (Date.now() - t0) / GPS_POLICY.windowMs), d.fix ? d.fix.accuracyM : null);
            }
        }),
        tick,
    };
    _captureCtl = ctl;
    // The window always ends with a decision, even with no new fixes.
    setTimeout(() => {
        if (_captureCtl === ctl) {
            const d = cap.decide({ final: true });
            finishWith(d);
        }
    }, GPS_POLICY.windowMs);
}

// ---- S11: the wizard says where you are and what each button does ----
function flowState() {
    const d = AppState.currentShotData || {};
    return {
        shotNumber: d.shotNumber || (AppState.currentHoleShots?.length || 0) + 1,
        hasIntended: !!(d.lineIntended && d.lineIntended.length >= 2),
        hasActual: !!(d.lineActual && d.lineActual.length >= 2),
        flightUnseen: !!d.flightUnseen,
    };
}

/** Step line, save buttons and mode caption from the shot's state. */
export function refreshWizardFlow() {
    const s = flowState();
    const step = document.getElementById('wizard-step');
    if (step) step.textContent = wizardStepText(s);
    const btns = shotButtons(s);
    const plan = document.getElementById('btn-save-plan');
    const log = document.getElementById('btn-save-shot-final');
    if (plan) { plan.classList.toggle('hidden', !btns.plan); if (btns.plan) plan.textContent = btns.plan; }
    if (log) { log.textContent = btns.log; log.classList.toggle('secondary', !!btns.plan); }
    // D32: the Map-first dock makes room for Save plan while it's offered.
    document.getElementById('oncourse-wizard')?.classList.toggle('plan-offered', !!btns.plan);
    const cap = document.getElementById('line-mode-caption');
    if (cap) {
        const active = document.querySelector('#section-line [data-line-mode].active-choice')?.getAttribute('data-line-mode') || 'intended';
        cap.textContent = modeCaption(active, s.flightUnseen);
    }
}

/** A plan saved for this hole and not yet logged, or null. */
function pendingPlannedShot() {
    const shots = AppState.currentHoleShots || [];
    for (let i = shots.length - 1; i >= 0; i--) if (shots[i]?.planned === true && shots[i].hole === AppState.currentHole) return shots[i];
    return null;
}

/** The hub button names the pending plan, if any (called from loadHole). */
export function refreshTrackButtonLabel() {
    const btn = document.getElementById('btn-oc-track-shot');
    if (!btn) return;
    const p = pendingPlannedShot();
    btn.textContent = trackButtonLabel(p ? p.shotNumber : null);
}

/**
 * S11: keep the intended line before the shot is hit. No stroke is counted;
 * the shot document carries planned:true until "Log shot N" clears it.
 * Same offline shape as saveShotData: local first, write never awaited.
 */
export function saveShotPlan() {
    if (!AppState.currentUser) return;
    const d = AppState.currentShotData;
    if (!d || !(d.lineIntended && d.lineIntended.length >= 2)) { showToast('Draw the line you mean to hit first'); return; }
    document.getElementById('oncourse-wizard').classList.add('hidden');
    // S12 B1: never carry draw mode out of the wizard.
    applyDrawModeChrome(false); // also clears map-first + its body class
    setWizardActive(false);
    d.planned = true;
    const payload = { uid: AppState.currentUser.uid, ...d };
    if (d.id) {
        const idx = AppState.currentHoleShots.findIndex(s => s.id === d.id);
        if (idx !== -1) mutateList('currentHoleShots', (list) => { list[idx] = { ...payload, id: d.id }; });
        updateDoc(doc(db, 'shots', d.id), payload).catch(e => console.error('Plan update failed to sync:', e));
    } else {
        const ref = doc(collection(db, 'shots'));
        mutateList('currentHoleShots', (list) => { list.push({ ...payload, id: ref.id }); });
        d.id = ref.id;
        setDoc(ref, payload).catch(e => console.error('Plan failed to sync:', e));
    }
    refreshTrackButtonLabel();
    showToast(`Plan saved · hit the shot, then Track My Shot`);
}

export function startNewShotInput(forcedShotNum = null) {
    // Glass chips PR 2: opening the next shot retires the last one's Undo —
    // undoing shot N under shot N+1's wizard would renumber the hole.
    dismissUndoCard();
    // S11: a plan saved for this hole reopens at step 2 instead of starting
    // a new shot — the golfer comes back to draw what happened.
    if (!forcedShotNum) {
        const pending = pendingPlannedShot();
        if (pending) { loadExistingShotData(pending.id, { mapFirst: mapFirstWanted(), playDefaults: true }); return; }
    }
    const shotNum = forcedShotNum || (AppState.currentHoleShots?.length || 0) + 1;
    // BL-DEC-01: snapshot the live GPS distance to the green centre at the
    // moment the shot is logged (fresh fixes only). Distance-bucketed
    // dispersion + Tiger-5 "bogey inside 150" both hang off this field.
    const fix = getLastGpsFix();
    // S10: positions now come from the hold-still capture, not a single fix —
    // the wizard opens immediately and the position resolves in the background.
    AppState.currentShotData = {
        hole: AppState.currentHole,
        shotNumber: shotNum,
        roundId: AppState.activeRoundId,
        timestamp: new Date().toISOString(),
        ...(fix && Number.isFinite(fix.distM) ? { distanceToPinM: fix.distM } : {})
    };
    resetCurveUndo(); // D29: a new shot starts with an empty line history
    // Owner 2026-10-06 (Play mode): the club picked on the map's club strip
    // and the Routine chip pre-fill this shot — only the shot they were set
    // for (same round, hole and shot number); every field stays editable.
    const pre = AppState.nextShotDefaults;
    if (pre && pre.roundId === AppState.activeRoundId && pre.hole === AppState.currentHole && pre.shotNumber === shotNum) {
        if (pre.club) AppState.currentShotData.club = pre.club;
        if (pre.routinePre) AppState.currentShotData.routines = { pre: pre.routinePre };
    }

    _beginCapture();

    // Set before the (single) overlay mount below so it mounts full height.
    applyDrawModeChrome(mapFirstWanted());
    setWizardActive(true);
    const wizard = document.getElementById('oncourse-wizard');
    if (wizard) {
        wizard.classList.remove('hidden');
        wizard.scrollTop = 0;
    }

    syncShotWizardUI();
}

/**
 * Codex P2 (pass 4): on a cold start the first tee shot's wizard can open
 * before Play mode has the course file to pick a club. Play mode fires
 * 'play-shot-defaults' once it has; the open NEW shot takes the club and
 * Routine - only into fields the golfer hasn't filled.
 */
export function applyLateShotDefaults() {
    const d = AppState.currentShotData;
    const pre = AppState.nextShotDefaults;
    if (!d || d.id || !document.body.classList.contains('active-wizard-mode')) return false;
    if (!pre || pre.roundId !== AppState.activeRoundId || pre.hole !== AppState.currentHole || pre.shotNumber !== d.shotNumber) return false;
    let changed = false;
    if (pre.club && !d.club) { d.club = pre.club; changed = true; }
    if (pre.routinePre && !d.routines?.pre) { d.routines = { ...(d.routines || {}), pre: pre.routinePre }; changed = true; }
    if (changed) {
        // Repaint only the club pills and Routine buttons. A full
        // syncShotWizardUI() would re-mount the wizard's map (a second
        // overlay, double chips, lost curve) - CI caught it.
        try { renderBagButtons(_anchorDistanceToGreenM()); } catch { /* bag markup not mounted */ }
        applyClubSections(d); // Codex P2: a late Putter shows the putting sections
        document.querySelectorAll('.wiz-routine-btn').forEach(btn => {
            const on = d.routines && d.routines[btn.getAttribute('data-routine')] === btn.getAttribute('data-val');
            btn.classList.toggle('active', !!on);
        });
    }
    return changed;
}
if (typeof document !== 'undefined') document.addEventListener('play-shot-defaults', applyLateShotDefaults);

export function loadExistingShotData(shotId, { mapFirst = false, playDefaults = false } = {}) {
    dismissUndoCard();
    const existing = AppState.currentHoleShots.find(s => s.id === shotId);
    if (existing) {
        AppState.currentShotData = { ...existing };
        resetCurveUndo(); // D29: this shot's Undo never reaches another shot's line
        // Codex P2 (2026-10-06): the map's club strip / Routine chip also
        // reach a planned shot — filling only what the plan left empty.
        if (playDefaults) {
            const pre = AppState.nextShotDefaults;
            const d = AppState.currentShotData;
            if (pre && pre.roundId === AppState.activeRoundId && pre.hole === AppState.currentHole && pre.shotNumber === d.shotNumber) {
                if (pre.club && !d.club) d.club = pre.club;
                if (pre.routinePre && !d.routines?.pre) d.routines = { ...(d.routines || {}), pre: pre.routinePre };
            }
        }
        // Editing an old shot opens the normal wizard; a pending plan reopened
        // by Track My Shot follows the map-first preference.
        applyDrawModeChrome(!!mapFirst);
        setWizardActive(true);
        const wizard = document.getElementById('oncourse-wizard');
        if (wizard) {
            wizard.classList.remove('hidden');
            wizard.scrollTop = 0;
        }
        // S9 affordance: no shot-list UI exists yet, so nothing in the app
        // calls this — the E2E drives the app's own re-entry through it (the
        // entry point a future shot list will use). Harmless handle, no state.
        syncShotWizardUI();
    }
}

// ---- S12 A3: the anchor's distance to the green centre, for the Club row ----
// From the mounted overlay when it is up (frame metres); else the S4 pin
// distance; else null (the row then keeps today's order).
function _anchorDistanceToGreenM() {
    const d = AppState.currentShotData || {};
    if (d.startXY && _lineCtl?.frame && _overlayHole?.green?.centre) {
        const [gx, gy] = toFrame(_lineCtl.frame, [_overlayHole.green.centre.lat, _overlayHole.green.centre.lon]);
        return Math.hypot(d.startXY.x - gx, d.startXY.y - gy);
    }
    return d.distanceToPinM ?? null;
}

/**
 * Synchronizes the visual state of the Shot Wizard UI to match the current in-memory shot data.
 * Updates button active states across all intent/result grids.
 * @returns {void}
 */
/**
 * The wizard sections that follow the club (putter vs full swing) and the
 * shot number (lie from shot 2). Shared by syncShotWizardUI and the late
 * Play-mode fill, which must not re-mount the map (Codex P2, 2026-10-06).
 */
function applyClubSections(data) {
    // Toggle Putter Section
    const puttingSection = document.getElementById('section-putting-outcome');
    if (puttingSection) puttingSection.classList.toggle('hidden', data.club !== 'Putter');

    // Owner feedback 2026-07-05 round 2: for a putt the whole swing-detail
    // block and the result grid are noise — putt control + line/read carry
    // the same information in putt language. Hiding them ends the putting
    // screen's scrolling; full-swing shots keep everything.
    const isPutter = data.club === 'Putter';
    const detailBlock = document.getElementById('section-swing-detail');
    if (detailBlock) detailBlock.classList.toggle('hidden', isPutter);
    const missSection = document.getElementById('section-miss-pattern');
    if (missSection) missSection.classList.toggle('hidden', isPutter);

    // Lie: shots 2+ only (shot 1 is the tee) and never for the putter.
    const lieSection = document.getElementById('section-lie');
    if (lieSection) {
        lieSection.classList.toggle('hidden', isPutter || (data.shotNumber || 1) < 2);
    }
}

/**
 * Open a shot: mount its map, then paint the wizard. Only a NEW shot or hole
 * (and the ✎ / Done size change) mounts. D31 (simplify 2026-10-07): anything
 * that changes an OPEN shot - a club tap, "didn't see it", a GPS lock, a
 * dragged start - calls refreshShotWizard() instead, because a re-mount
 * threw away a swipe in progress and reopened the result grid.
 */
export function syncShotWizardUI() {
    // Async on purpose: the overlay file is a fetch (cached after the first
    // hole); the rest of the wizard must not wait for it.
    syncShotLineOverlay().catch(e => console.warn('[overlay] not shown:', e));
    refreshShotWizard();
}

/** D31 review P3: turning "didn't see it" back off returns to the step the
 * shot is on (an intended line and no actual → the Actual pill), as the
 * re-mount used to. */
export function resumeLineStep() {
    const d = AppState.currentShotData || {};
    if (!_lineCtl || d.flightUnseen) return;
    if (d.lineIntended && d.lineIntended.length && !(d.lineActual && d.lineActual.length)) setLineMode('actual');
}

/** D31: the cheap refresh of an open shot - buttons, labels, sections. It
 * never touches the map. */
export function refreshShotWizard() {
    renderBagButtons(_anchorDistanceToGreenM());

    const wizard = document.getElementById('oncourse-wizard');
    if (!wizard) return;

    // Owner feedback 2026-07-05: "it doesn't tell you what shot you're on".
    const title = document.getElementById('wizard-title');
    if (title) {
        const n = AppState.currentShotData.shotNumber;
        title.textContent = n
            ? `🎯 Hole ${AppState.currentShotData.hole || AppState.currentHole} — Shot ${n}`
            : '🎯 Shot Command Center';
    }

    // Reset the intent/result buttons only — [data-group] excludes the bag
    // pills, whose active state renderBagButtons() just painted (stripping
    // them here was why picking a club showed no highlight from shot 2 on).
    const data = AppState.currentShotData;
    highlightGroups(wizard, data);
    // S4: the readout carries the GPS-start note even without an overlay —
    // courses with no OSM hole still chain shots by GPS.
    lineReadout();

    // Populate routines
    document.querySelectorAll('.wiz-routine-btn').forEach(btn => {
        const field = btn.getAttribute('data-routine');
        const val = btn.getAttribute('data-val');
        if (data.routines && data.routines[field] === val) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Show/Hide delete
    if (UI.btnWizardDelete) {
        UI.btnWizardDelete.classList.toggle('hidden', !data.id);
    }

    applyClubSections(data);
    const detailBlock = document.getElementById('section-swing-detail');

    // The swing-detail block is collapsed by default (fewer mid-round taps);
    // pop it open when re-editing a shot that already carries detail.
    if (detailBlock && (data.startLine || data.trajectory || data.strikeQuality || data.shape)) {
        detailBlock.open = true;
    }

    // Flight-unseen: dim line/trajectory/shape (strike stays — you feel a
    // thin one without seeing it). The toggle records intent, not absence.
    // S9: the Actual button becomes the 'Finish from GPS' label — there is
    // no curve to draw; the GPS chain supplies the finish. The label is
    // restored whenever flightUnseen is off (the string is static).
    const flightBtn = document.getElementById('wiz-toggle-flight-unseen');
    if (flightBtn) flightBtn.classList.toggle('active-choice', !!data.flightUnseen);
    wizard.querySelectorAll('[data-group="startLine"], [data-group="trajectory"]')
        .forEach(b => b.classList.toggle('wiz-dimmed', !!data.flightUnseen));
    const shapeSection = document.getElementById('section-shape');
    if (shapeSection) shapeSection.classList.toggle('wiz-dimmed', !!data.flightUnseen);
    const actualBtn = wizard.querySelector('[data-line-mode="actual"]');
    // D31: "didn't see it" with the Actual pill on - swipes go back to the
    // intended line (the re-mount used to do this).
    if (data.flightUnseen && actualBtn?.classList.contains('active-choice')) setLineMode('intended');
    if (actualBtn) {
        if (data.flightUnseen) {
            actualBtn.textContent = 'Finish from GPS';
            actualBtn.classList.add('wiz-dimmed');
            actualBtn.classList.remove('active-choice');
        } else if (actualBtn.textContent !== 'Actual') {
            actualBtn.textContent = 'Actual';
            actualBtn.classList.remove('wiz-dimmed');
        }
    }

    const offGreenBtn = document.getElementById('wiz-toggle-offgreen');
    if (offGreenBtn) offGreenBtn.classList.toggle('active-choice', !!data.isOffGreen);
}

/**
 * S1 Part B: mark the active-choice button for each populated data-group.
 * Extracted from syncShotWizardUI so applyDerivedShape can re-highlight just
 * the grids after a swipe without recomputing the whole wizard. Strips every
 * [data-group] button first — the bag pills keep their own paint.
 */
export function highlightGroups(wizard, data) {
    if (!wizard) return;
    wizard.querySelectorAll('.btn-grid-compact[data-group]').forEach(btn => btn.classList.remove('active-choice'));
    ['startLine', 'trajectory', 'strikeQuality', 'shape', 'puttControl', 'missPattern', 'lie', 'puttLine', 'puttRead'].forEach(group => {
        if (data[group]) {
            const btn = wizard.querySelector(`[data-group="${group}"][data-val="${data[group]}"]`);
            if (btn) btn.classList.add('active-choice');
        }
    });
}

export function setWizardActive(isActive) {
    if (isActive) {
        document.body.classList.add('active-wizard-mode');
    } else {
        document.body.classList.remove('active-wizard-mode');
        // Map first (Codex P3): Log, Save plan and Cancel all close through
        // here — draw mode, .map-first and the body class all reset, so the
        // version strip is never left hidden behind a closed map.
        applyDrawModeChrome(false);
        stopLiveFollow();
    }
}

export async function saveShotData() {
    if (!AppState.currentUser) return;
    // Owner feedback 2026-07-05: the app let multiple putts be marked Holed on
    // one hole — physically impossible. Guard NEW shots once a hole-out exists.
    if (!AppState.currentShotData.id
        && AppState.currentShotData.puttControl === 'Holed'
        && (AppState.currentHoleShots || []).some(sh => sh.puttControl === 'Holed')) {
        showToast("You've already holed out on this hole 🎉");
        return;
    }
    document.getElementById('oncourse-wizard').classList.add('hidden');
    // S12 B1: never carry draw mode out of the wizard.
    applyDrawModeChrome(false); // also clears map-first + its body class
    setWizardActive(false); // Deactivate wizard mode
    // S9: flight unseen stores an endpoint-only shot — no drawn actual; the
    // GPS chain (the next shot's start) supplies the finish later. Toggling
    // flightUnseen off restores a normal shot (consumers treat the missing
    // flag as false; old shots never grow the field).
    if (AppState.currentShotData.flightUnseen) {
        AppState.currentShotData.lineActual = null;
        AppState.currentShotData.actualEndpointOnly = true;
    } else {
        delete AppState.currentShotData.actualEndpointOnly;
    }
    // S11: logging a planned shot counts its stroke now and clears the flag.
    const wasPlanned = AppState.currentShotData.planned === true;
    if (wasPlanned) AppState.currentShotData.planned = false;
    const payload = { uid: AppState.currentUser.uid, ...AppState.currentShotData };
    // S7 ghost lines: the ghost query orders by `timestamp` — Firestore
    // silently drops docs missing the orderBy field, so every stored shot
    // must carry one. saveShotPlan stamps planned shots; this is the
    // direct-log path (the trial's round-2 query returned 0 precisely
    // because non-planned shots had no timestamp). ISO like saveShotPlan.
    if (!payload.timestamp) payload.timestamp = new Date().toISOString();
    // Glass chips PR 2: what Undo must reverse for a NEW shot (null = no card).
    let undoInfo = null;
    try {
        if (AppState.currentShotData.id) {
            const shotId = AppState.currentShotData.id;
            const idx = AppState.currentHoleShots.findIndex(s => s.id === shotId);
            const before = idx !== -1 ? AppState.currentHoleShots[idx] : null;
            // D30: the shot list changes through mutateList (D-03), so an
            // edit reaches the round snapshot even when nothing else saves.
            if (idx !== -1) mutateList('currentHoleShots', (list) => { list[idx] = { ...payload, id: shotId }; });
            // Codex P2 (2026-10-06): logging a planned shot 2, or CHANGING shot
            // 2's lie later, answers FW the same way as a new shot does. An
            // edit that leaves the lie alone keeps whatever FW is recorded
            // (the golfer may have set it by hand on the normal screen).
            const lieChanged = wasPlanned || !before || before.lie !== payload.lie;
            const fwyEdit = !lieChanged ? undefined : fairwayFromLie({
                shotNumber: payload.shotNumber,
                par: AppState.currentCoursePars[AppState.currentHole - 1] || 4,
                lie: payload.lie,
            });
            const me = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser.uid);
            // Codex P2 (pass 6): shot 2's lie taken OFF - a FW worked out from
            // the old lie (fwyAuto) no longer stands. A hand-set FW stays.
            const parNow = AppState.currentCoursePars[AppState.currentHole - 1] || 4;
            const hadLieFw = fairwayFromLie({ shotNumber: payload.shotNumber, par: parNow, lie: before?.lie }) !== undefined;
            const stNow = me?.simpleStats?.[AppState.currentHole];
            const clearFwy = lieChanged && fwyEdit === undefined && hadLieFw && !!stNow?.fwyAuto;
            // D30 (Codex P2): the putt count follows an edit (club changed to
            // or from Putter, fringe toggled) and a logged plan, so the card
            // always matches the stored shots - which is what removeShot reads.
            const puttDelta = before ? (puttCounted(payload) ? 1 : 0) - (puttCounted(before) ? 1 : 0) : 0;
            if (me && (wasPlanned || fwyEdit !== undefined || clearFwy || puttDelta !== 0)) {
                mutateList('liveRoundGroups', () => {
                    if (wasPlanned) me.scores[AppState.currentHole] = (me.scores[AppState.currentHole] || 0) + 1;
                    if (puttDelta !== 0) {
                        if (!me.simpleStats[AppState.currentHole]) me.simpleStats[AppState.currentHole] = {};
                        const stP = me.simpleStats[AppState.currentHole];
                        stP.putts = Math.max(0, (stP.putts || 0) + puttDelta);
                        rederiveAutoGir(me, AppState.currentHole);
                    }
                    if (fwyEdit !== undefined) {
                        if (!me.simpleStats[AppState.currentHole]) me.simpleStats[AppState.currentHole] = {};
                        me.simpleStats[AppState.currentHole].fwy = fwyEdit;
                        me.simpleStats[AppState.currentHole].fwyAuto = true;
                    } else if (clearFwy) {
                        delete stNow.fwy;
                        delete stNow.fwyAuto;
                    }
                });
                loadHole();
            }
            // F-11: fire-and-forget — see the comment on the new-shot branch.
            updateDoc(doc(db, "shots", shotId), payload)
                .catch(e => console.error("Shot update failed to sync:", e));
        } else {
            // F-11: every local mutation happens BEFORE the write, and the write
            // is never awaited. Under persistentLocalCache a write promise
            // resolves only on the server ack, so offline this function stopped
            // dead here: the wizard had already closed (it closes above), the
            // stroke was never counted, no putts, no GIR, no toast — and the
            // catch never ran either, because an offline write never rejects.
            // doc(collection(...)) mints the id client-side, so the local record
            // is complete immediately and the write replays on reconnect.
            const shotRef = doc(collection(db, "shots"));
            mutateList('currentHoleShots', (list) => { list.push({ ...payload, id: shotRef.id }); });
            undoInfo = { shotId: shotRef.id, hole: AppState.currentHole, putt: false, girSet: false };
            const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser.uid);
            if (p) {
                // mutateList so the Proxy set trap fires and the stroke reaches
                // localStorage (F-13) — p is a plain object inside the array.
                mutateList('liveRoundGroups', () => {
                    p.scores[AppState.currentHole] = (p.scores[AppState.currentHole] || 0) + 1;

                    // TASK 1: Automated GIR Logic
                    const holeIdx = AppState.currentHole - 1;
                    const par = AppState.currentCoursePars[holeIdx] || 4;
                    const realPutts = AppState.currentHoleShots.filter(s =>
                        s.hole === AppState.currentHole && s.club === 'Putter' && !s.isOffGreen
                    );
                    if (payload.club === 'Putter' && !payload.isOffGreen &&
                        realPutts.length === 1 && payload.shotNumber <= (par - 1)) {
                        if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                        const stG = p.simpleStats[AppState.currentHole];
                        // D30: a GIR this putt worked out is marked girAuto, so
                        // removing the shot later can take it back; a GIR the
                        // golfer tapped is left alone.
                        if (!stG.gir) { undoInfo.girSet = true; stG.girAuto = true; }
                        stG.gir = true;
                    }

                    // Owner 2026-10-06: Detailed rounds never press FW — the lie
                    // picked for shot 2 (where the tee shot finished) answers it
                    // on a par 4/5. Undo puts back what was there.
                    const fwy = fairwayFromLie({ shotNumber: payload.shotNumber, par, lie: payload.lie });
                    if (fwy !== undefined) {
                        if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                        const st = p.simpleStats[AppState.currentHole];
                        undoInfo.fwy = { had: Object.prototype.hasOwnProperty.call(st, 'fwy'), prev: st.fwy, prevAuto: !!st.fwyAuto };
                        st.fwy = fwy;
                        st.fwyAuto = true;
                    }

                    // TASK 2: Putter Stats (Exclude Fringe)
                    if (payload.club === 'Putter' && !payload.isOffGreen) {
                        if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                        p.simpleStats[AppState.currentHole].putts = (p.simpleStats[AppState.currentHole].putts || 0) + 1;
                        undoInfo.putt = true;
                    }
                });

                loadHole();
            }
            setDoc(shotRef, payload).catch(e => console.error("Shot failed to sync:", e));
        }
        const holed = payload.puttControl === 'Holed';
        // Glass chips PR 2: a new, non-holed shot gets the 6 s Undo card.
        // Edits, logged plans and hole-outs (which auto-advance the hole)
        // keep the plain toast — there is nothing safe to undo in one tap.
        if (undoInfo && !holed) {
            const carry = curveCarryM(toPairs(payload.lineActual));
            showUndoCard(undoCardText({
                shotNumber: payload.shotNumber,
                clubLabel: payload.club ? shortClubLabel(payload.club) : '',
                lie: payload.lie,
                carryM: carry,
            }), () => undoLoggedShot({ ...undoInfo, shotNumber: payload.shotNumber }));
        } else {
            dismissUndoCard();
            showToast(loggedToast(payload.shotNumber, holed));
        }
        refreshTrackButtonLabel();

        // Owner feedback 2026-07-05: holing the putt ends the hole — move on
        // automatically instead of leaving the player parked on a done hole.
        // The next-hole button carries the right behaviour for free (finish
        // modal on the last hole; detailed-mode wizard auto-open on the next).
        if (payload.puttControl === 'Holed') {
            // S5 Part C: holing out means the golfer is standing on the
            // green — the everyday truth pair. A fix fresher than 30 s
            // counts; older fixes say nothing about where the hole is.
            const holeFix = getLastGpsFix();
            if (holeFix && holeFix.at && Date.now() - holeFix.at < 30_000) {
                collectGpsBiasSample({ lat: holeFix.lat, lon: holeFix.lon, accuracyM: holeFix.accuracyM }).catch(() => {});
            }
            const nextBtn = document.getElementById('btn-oc-next-hole');
            if (nextBtn) setTimeout(() => nextBtn.click(), 600);
        }
    } catch (e) {
        showToast("Error saving shot.");
    }
}

/**
 * D30 (simplify 2026-10-07): the ONE way a shot leaves the hole. The Undo
 * card and the wizard's 🗑️ Delete both come here, and it reverses exactly
 * what the shot added to the card, through mutateList (D-03):
 *  - a stroke, only if the shot was counted. A saved plan never added one,
 *    so deleting a plan must not take a stroke off the hole (the hole's
 *    gross reaches the round and WHS);
 *  - its putt (Putter, not from the fringe);
 *  - a GIR or FW the app worked out (girAuto / fwyAuto). A value the golfer
 *    tapped by hand stays.
 * `exact` is what the save recorded (the Undo card). Without it (Delete,
 * any time later) the same effects are worked out from the stored shot.
 * The Firestore delete goes fire-and-forget like every other write (F-11).
 * @param {Object} shot the stored shot (from currentHoleShots)
 * @param {{putt:boolean, girSet:boolean, fwy?:{had:boolean, prev:*, prevAuto:boolean}}|null} exact
 */
/** D30: does this stored shot count as a putt on the card? (Putter, on the
 * green, and played - a plan counts nothing.) */
function puttCounted(s) {
    return !!s && s.planned !== true && s.club === 'Putter' && !s.isOffGreen;
}

/** D30: a GIR the app worked out (girAuto) follows the hole's score and
 * putts; one the golfer tapped is theirs. Call inside mutateList. */
function rederiveAutoGir(p, hole) {
    const st = p.simpleStats?.[hole];
    if (!st?.girAuto) return;
    const g = derivedGir({ par: AppState.currentCoursePars[hole - 1] || 4, gross: p.scores[hole] || 0, putts: st.putts });
    if (g === null) { delete st.gir; delete st.girAuto; } else st.gir = g;
}

function removeShot(shot, exact = null) {
    const hole = shot.hole || AppState.currentHole;
    mutateList('currentHoleShots', (list) => {
        const i = list.findIndex(s => s.id === shot.id);
        if (i !== -1) list.splice(i, 1);
    });
    const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser.uid);
    if (p) {
        const counted = shot.planned !== true;
        const par = AppState.currentCoursePars[hole - 1] || 4;
        const putt = exact ? !!exact.putt : puttCounted(shot);
        mutateList('liveRoundGroups', () => {
            if (counted) p.scores[hole] = Math.max(0, (p.scores[hole] || 0) - 1);
            const st = p.simpleStats?.[hole];
            if (!st) return;
            if (putt) st.putts = Math.max(0, (st.putts || 0) - 1);
            if (exact) {
                if (exact.girSet) { delete st.gir; delete st.girAuto; }
                if (exact.fwy) {
                    if (exact.fwy.had) st.fwy = exact.fwy.prev; else delete st.fwy;
                    if (exact.fwy.prevAuto) st.fwyAuto = true; else delete st.fwyAuto;
                }
            } else if (counted && st.fwyAuto
                && fairwayFromLie({ shotNumber: shot.shotNumber, par, lie: shot.lie }) !== undefined) {
                // The FW was worked out from this shot's lie: it no longer stands.
                delete st.fwy;
                delete st.fwyAuto;
            }
            // A GIR the app worked out follows the new score and putts.
            rederiveAutoGir(p, hole);
        });
        loadHole();
    }
    if (AppState.currentShotData?.id === shot.id) AppState.currentShotData = {};
    refreshTrackButtonLabel();
    deleteDoc(doc(db, "shots", shot.id))
        .catch(e => console.error("Shot removal failed to sync:", e));
}

/**
 * Glass chips PR 2: reverse a just-logged NEW shot (the Undo card), with
 * exactly what that save recorded. No confirm(): the tap on Undo is the
 * confirmation.
 * @param {{shotId:string, hole:number, putt:boolean, girSet:boolean, shotNumber:number}} u
 */
export function undoLoggedShot(u) {
    if (!AppState.currentUser || !u?.shotId) return;
    // The hole moved on (its shot list was cleared) or the shot is already
    // gone: say so rather than silently doing nothing.
    const shot = u.hole === AppState.currentHole
        ? (AppState.currentHoleShots || []).find(s => s.id === u.shotId) : null;
    if (!shot) {
        showToast('That shot can no longer be undone here — edit it from the hole review');
        return;
    }
    removeShot(shot, u);
    showToast(`Shot ${u.shotNumber} undone`);
}

export async function deleteShotData() {
    if (!AppState.currentUser || !AppState.currentShotData.id) return;
    if (!confirm("Are you sure you want to delete this shot?")) return;

    document.getElementById('oncourse-wizard').classList.add('hidden');
    // D30: close like every other exit — Play mode keeps its map off while
    // active-wizard-mode is set. (This also clears draw mode / Map first.)
    setWizardActive(false);
    const shotId = AppState.currentShotData.id;
    // What was COUNTED is the stored record, not the open (maybe edited) copy.
    const shot = (AppState.currentHoleShots || []).find(s => s.id === shotId) || { ...AppState.currentShotData };
    try {
        removeShot(shot);
        showToast(shot.planned === true ? "Plan deleted 🗑️" : "Shot Deleted 🗑️");
    } catch (e) {
        console.error(e);
        showToast("Error deleting shot.");
    }
}

export function showToast(message) {
    const toast = document.createElement('div');
    // role=status makes screen readers announce the toast without stealing focus.
    toast.setAttribute('role', 'status');
    // .app-toast: taps pass through to the Log/club area underneath
    // (style.css). The inline styles below must never set pointer-events.
    toast.className = 'app-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
        border-radius: 20px; z-index: 10000; font-size: 0.9rem;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}
