// ==========================================
// play-mode.js (module) — the round on a full-screen map with glass chips
// ==========================================
//
// Owner 2026-10-06. While a round is on and Play mode is on (the default),
// body gets `play-mode`. The hole's aerial map fills the screen behind
// everything and the round's controls float on it as glass chips (Layout A,
// the owner-approved sketch 004 / a2-club-strip):
//   - top: the hole/par strip and its ⋯ (Review card, Map hole, Finish…);
//   - left rail: distances (the GPS pill) or 📡 Start GPS, 🎯 Shot | 🗺 Hole,
//     👥 the group sheet, and in Detailed rounds the club strip + Track;
//   - right rail: FW (Simple, par 4/5), putts, your score (GIR worked out);
//   - bottom: ← Prev, Routine (Detailed), Next →.
// Nothing new does the scoring: the chips are the same buttons with the
// same ids and handlers (moved into the rail slots while Play mode is on,
// put back after), so mutateList, persistence and the e2e contracts hold.
//
// The map is read-only here: one finger pans, two pinch/rotate, a long
// press measures. It opens on the SHOT view — your ball out to your reach
// (Settings, 230 m default) or to the green when that is closer — and 🎯
// flips to the whole hole. Lines are drawn in the shot wizard, as before.

import { AppState, mutateList } from '../state.js';
import { COURSE_DATA } from '../course-data.js';
import { courseSlugFor, loadCourseOverlay, mountHoleOverlay } from '../hole-overlay.js';
import { toFrame, distanceM } from '../geo.js';
import { currentBag, flattenClubs, orderClubsFor, shortClubLabel } from './card-render.js';
import {
    readPlayMode, writePlayMode, playModeWanted, physicalHoleFor, sheetHandleLabel,
    readReach, writeReach, clubLadder, stripWindow, nextRoutine, routineLabel,
    ballStartXY, fitInsetsFor,
} from '../play-mode.js';

// Declared before first use (minified-bundle TDZ pitfall).
let _bound = false;
let _ctl = null;
let _mountKey = null;
let _run = 0;
let _lastFix = null;
let _resizeTimer = null;
let _gpsMod = null;        // oncourse.js, once loaded (GPS on/off + last fix)
let _view = 'shot';        // 'shot' | 'hole' — back to 'shot' on every new hole
let _viewHoleKey = null;
let _ballXY = [0, 0];
let _frame = { key: null, frame: null }; // the mounted hole's frame (GPS → metres)
let _distToGreen = null;   // metres, ball → green centre (club suggestion)
let _clubs = { key: null, ladder: [], sel: 0, sug: -1 };
let _routineShot = { key: null, val: undefined }; // Detailed: per shot
let _course = { slug: null, data: null };       // this round's overlay file, once loaded
const _homes = new Map();  // moved chip id → { parent, next } to put it back

const el = (id) => document.getElementById(id);
const storage = () => { try { return window.localStorage; } catch { return null; } };
const roundActive = () => document.body.classList.contains('round-active') && !!AppState.activeRoundId;
const detailed = () => AppState.currentTrackingMode !== 'simple';
const holePar = () => Number(AppState.currentCoursePars?.[AppState.currentHole - 1]) || 4;
const holeShots = () => (AppState.currentHoleShots || []).filter(s => s.hole === AppState.currentHole && !s.planned);
const nextShotNumber = () => holeShots().length + 1;
const shotKey = () => `${AppState.activeRoundId}|${AppState.currentHole}|${nextShotNumber()}`;
const gpsLive = () => !!(_gpsMod && _gpsMod.isGpsWatchActive());
function selfIndex(list) {
    const uid = AppState.currentUser?.uid;
    const i = uid ? list.findIndex(p => p.uid === uid) : -1;
    return i >= 0 ? i : 0;
}

// ---- chips moved into the rails (same elements, same ids) ---------------

const SLOT_CHIPS = [
    ['play-slot-gps', ['oc-gps-widget', 'btn-big-numbers', 'btn-play-gps']],
    ['play-slot-group', ['btn-oc-score-sheet']],
    ['play-slot-track', ['btn-oc-track-shot']],
];

function dockChips() {
    for (const [slotId, ids] of SLOT_CHIPS) {
        const slot = el(slotId);
        if (!slot) continue;
        for (const id of ids) {
            const c = el(id);
            if (!c || c.parentElement === slot) continue;
            if (!_homes.has(id)) _homes.set(id, { parent: c.parentElement, next: c.nextSibling });
            slot.appendChild(c);
        }
    }
}

function undockChips() {
    // Reverse order, so each saved `next` sibling is home again before use.
    for (const [id, home] of [..._homes.entries()].reverse()) {
        const c = el(id);
        if (!c || !home.parent || !home.parent.isConnected) continue;
        const next = home.next && home.next.parentNode === home.parent ? home.next : null;
        home.parent.insertBefore(c, next);
    }
    _homes.clear();
}

function teardown() {
    _run++;
    if (_ctl) { try { _ctl.destroy(); } catch { /* already gone */ } _ctl = null; }
    _mountKey = null;
    _lastFix = null; // Codex P2: never carry a position into the next round
    _frame = { key: null, frame: null };
    document.body.classList.remove('play-mode', 'play-sheet-open', 'play-detailed', 'play-simple', 'play-par3');
    el('oc-play-map')?.classList.add('hidden');
    undockChips();
    syncHandle();
}

function syncHandle() {
    const h = el('btn-oc-score-sheet');
    if (!h) return;
    const open = document.body.classList.contains('play-sheet-open');
    const n = (AppState.liveRoundGroups || []).length;
    h.textContent = sheetHandleLabel(n, open);
    h.setAttribute('aria-label', open ? 'Close the group sheet' : (n > 1 ? `Group scores (${n} players)` : 'Round details'));
    h.setAttribute('aria-expanded', String(open));
}

function insets() {
    const strip = el('oc-exit-bar')?.getBoundingClientRect();
    const nav = el('oc-bottom-nav')?.getBoundingClientRect();
    return fitInsetsFor({
        topChipsBottom: strip && strip.height > 0 ? strip.bottom : 0,
        bottomChipsTop: nav && nav.height > 0 ? nav.top : 0,
        viewportH: window.innerHeight,
    });
}

function markerFrom(fix) {
    return fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lon)
        ? { lat: fix.lat, lon: fix.lon, quality: 'accepted', draggable: false }
        : null;
}

/** Where the ball is, in this hole's frame (GPS first; see ballStartXY). */
function ballFor(frame) {
    const fresh = gpsLive() ? _lastFix : null;
    const fixXY = fresh && frame && Number.isFinite(fresh.lat) ? toFrame(frame, [fresh.lat, fresh.lon]) : null;
    const shots = holeShots();
    return ballStartXY({ fixXY, lastShot: shots[shots.length - 1] || null });
}

/** Put the round on the map (or take it off). Safe to call any time. */
export async function syncPlayMode() {
    const run = ++_run;
    const pref = readPlayMode(storage());
    const courseName = AppState.currentRoundCourseName;
    const slug = courseSlugFor(courseName);
    if (pref !== 'on' || !roundActive() || !slug) { teardown(); return; }

    const course = await loadCourseOverlay(slug);
    if (course) _course = { slug, data: course };
    if (run !== _run) return; // a newer sync (hole change, round end) won
    const teeData = COURSE_DATA[courseName]?.[AppState.currentRoundTee] || {};
    const physical = physicalHoleFor(teeData, AppState.currentHole);
    const hole = course?.holes?.[physical] || null;
    if (!playModeWanted({ pref, roundActive: roundActive(), hasHoleMap: !!hole })) { teardown(); return; }

    const map = el('oc-play-map');
    const canvas = map?.querySelector('canvas');
    if (!map || !canvas) return;
    // The shot wizard draws on its own map: one live overlay at a time, so
    // the play map comes off while it is open and back when it closes.
    if (document.body.classList.contains('active-wizard-mode')) {
        if (_ctl) { try { _ctl.destroy(); } catch { /* gone */ } _ctl = null; }
        _mountKey = null;
        return;
    }
    const b = document.body.classList;
    b.add('play-mode');
    b.toggle('play-detailed', detailed());
    b.toggle('play-simple', !detailed());
    b.toggle('play-par3', holePar() <= 3);
    map.classList.remove('hidden');
    dockChips();
    syncHandle();
    syncTrackLabel();
    syncRoutine();

    // A new hole opens on the shot view.
    const holeKey = `${AppState.activeRoundId}|${AppState.currentHole}`;
    if (holeKey !== _viewHoleKey) { _viewHoleKey = holeKey; _view = 'shot'; }

    // Codex P2: only a live fix is "you" — GPS switched off shows no marker
    // (and puts no GPS ball position) on the new hole.
    if (_gpsMod && !gpsLive()) _lastFix = null;
    else if (_gpsMod) _lastFix = _gpsMod.getLastGpsFix() || _lastFix;

    const fit = insets();
    const reach = readReach(storage());
    // The ball's GPS position needs this hole's frame: the mounted overlay's
    // when it is this hole, else the last shot / tee (re-anchored below).
    const frameKey = `${AppState.activeRoundId}|${slug}|${physical}`;
    const known = _frame.key === frameKey ? _frame.frame : null;
    const ball = ballFor(known);
    const key = [AppState.activeRoundId, slug, physical, `${window.innerWidth}x${window.innerHeight}`,
        Math.round(fit.top), Math.round(fit.bottom), _view, reach,
        Math.round(ball[0] / 10), Math.round(ball[1] / 10)].join('|');
    if (key === _mountKey && _ctl) { syncClubs(); return; }
    if (_ctl) { try { _ctl.destroy(); } catch { /* gone */ } _ctl = null; }
    _mountKey = key;
    _ballXY = ball;
    _ctl = mountHoleOverlay(canvas, hole, {
        readOnly: true,
        fill: true,
        fitInsets: fit,
        featureStyle: 'outline',
        focus: { startXY: ball, reachM: reach },
        viewMode: _view,
        imagery: hole.imagery?.url && hole.imagery?.extent3857
            ? { url: hole.imagery.url, extent3857: hole.imagery.extent3857, px: hole.imagery.px } : null,
        contextImagery: course.contextImagery?.url && course.contextImagery?.extent3857
            ? { url: course.contextImagery.url, extent3857: course.contextImagery.extent3857, px: course.contextImagery.px } : null,
        startMarker: markerFrom(_lastFix),
    });
    canvas.dataset.hole = String(physical);
    canvas.dataset.reach = String(reach);
    // First mount on this hole: now the frame is known, a GPS spot may move
    // the ball — re-anchor once (the frame is remembered, so it settles).
    if (!known && _ctl.frame) {
        _frame = { key: frameKey, frame: _ctl.frame };
        const real = ballFor(_ctl.frame);
        if (Math.hypot(real[0] - ball[0], real[1] - ball[1]) > 10) { _mountKey = null; syncPlayMode(); return; }
    }
    const g = _ctl.greenXY;
    _distToGreen = Array.isArray(g) ? Math.hypot(g[0] - ball[0], g[1] - ball[1]) : null;
    syncViewChip();
    syncClubs();
}

// ---- 🎯 Shot | 🗺 Hole ---------------------------------------------------

function syncViewChip() {
    const v = el('btn-play-view');
    if (!v) return;
    const shot = _view === 'shot';
    v.innerHTML = shot ? '🎯<span class="play-chip-lbl">Shot</span>' : '🗺️<span class="play-chip-lbl">Hole</span>';
    v.setAttribute('aria-label', shot ? 'Shot view — tap for the whole hole' : 'Whole hole — tap for the shot view');
    v.setAttribute('aria-pressed', String(shot));
}

// ---- club strip (Detailed) ------------------------------------------------

/**
 * Codex P2 (2026-10-06): Next Hole loads the hole and opens the first shot's
 * wizard straight away, before the async map mount. Set the strip's pick
 * (and the Routine) for the new hole synchronously from the cached course
 * file, so the auto-opened shot still starts with them. From the tee the
 * ball-to-green distance is the hole's length.
 */
function primeNextShot() {
    if (!detailed() || !roundActive() || readPlayMode(storage()) !== 'on') return;
    const name = AppState.currentRoundCourseName;
    const slug = courseSlugFor(name);
    if (!slug) return;
    if (_course.slug !== slug || !_course.data) {
        // Codex P2 (pass 4): cold start - the course file isn't here yet and
        // the wizard may already be open. Load it, prime, then hand the
        // defaults to the open shot (score-input fills only empty fields).
        const want = shotKey();
        loadCourseOverlay(slug).then(course => {
            if (!course || shotKey() !== want) return;
            _course = { slug, data: course };
            primeNextShot();
            document.dispatchEvent(new CustomEvent('play-shot-defaults'));
        }).catch(() => { /* no map: no defaults */ });
        return;
    }
    const teeData = COURSE_DATA[name]?.[AppState.currentRoundTee] || {};
    const hole = _course.data.holes?.[physicalHoleFor(teeData, AppState.currentHole)];
    // Only the tee shot: later shots wait for the map mount, which knows the
    // ball's real position (a stale distance would lock in a wrong pick).
    if (!hole || holeShots().length || !hole.tee || !hole.green?.centre) return;
    _distToGreen = distanceM([hole.tee.lat, hole.tee.lon], [hole.green.centre.lat, hole.green.centre.lon]);
    // Codex P2 (pass 3): a tee shot is played from the tee, so its pick uses
    // the tee distance - never the last GPS fix, which still measures to the
    // PREVIOUS hole's green until the next position callback.
    syncClubs(_distToGreen);
    if (_routineShot.key !== shotKey()) writeNextShot();
}

function syncClubs(distOverride) {
    if (!el('play-clubs') || !detailed()) return;
    const bag = currentBag();
    const n = nextShotNumber();
    const par = holePar();
    const k = shotKey();
    const d = Number.isFinite(distOverride) ? distOverride
        : gpsLive() && Number.isFinite(_lastFix?.distM) ? _lastFix.distM : _distToGreen;
    if (k !== _clubs.key) {
        const ladder = clubLadder(flattenClubs(bag, orderClubsFor(bag, null, n, par)));
        // The app's existing distance ranking (the wizard's) picks; the
        // strip only shows it, with one longer above and one shorter below.
        const best = flattenClubs(bag, orderClubsFor(bag, d, n, par))[0]?.val;
        const sug = Math.max(0, ladder.findIndex(c => c.val === best));
        _clubs = { key: k, ladder, sel: sug, sug };
    }
    renderClubs();
}

function renderClubs() {
    const { ladder, sel, sug } = _clubs;
    const first = stripWindow(ladder.length, sel);
    document.querySelectorAll('#play-clubs .pc-club').forEach((btn, i) => {
        const c = ladder[first + i];
        btn.classList.toggle('hidden', !c);
        if (!c) return;
        btn.dataset.idx = String(first + i);
        btn.dataset.val = c.val;
        btn.classList.toggle('sel', first + i === sel);
        btn.setAttribute('aria-pressed', String(first + i === sel));
        btn.innerHTML = `${shortClubLabel(c.val)}${c.carry ? `<small>${c.carry}m</small>` : ''}`;
        btn.setAttribute('aria-label', `${c.val}${c.carry ? `, about ${c.carry} metres` : ''}${first + i === sug ? ', suggested' : ''}`);
    });
    const up = el('btn-pc-up'), down = el('btn-pc-down');
    if (up) up.disabled = sel <= 0;
    if (down) down.disabled = sel >= ladder.length - 1;
    const s = el('pc-sug');
    if (s) s.textContent = sel === sug ? 'SUGGESTED' : (ladder[sug] ? `SUGG. ${shortClubLabel(ladder[sug].val)}` : '');
    writeNextShot();
}

function pickClub(idx) {
    if (!_clubs.ladder.length) return;
    _clubs.sel = Math.min(_clubs.ladder.length - 1, Math.max(0, idx));
    renderClubs();
}

/** What Track opens with: this shot's club and routine (Detailed). */
function writeNextShot() {
    if (!detailed() || !AppState.activeRoundId) return;
    if (_routineShot.key !== shotKey()) _routineShot = { key: shotKey(), val: undefined };
    const club = _clubs.key === shotKey() ? _clubs.ladder[_clubs.sel]?.val || null : null;
    AppState.nextShotDefaults = {
        roundId: AppState.activeRoundId,
        hole: AppState.currentHole,
        shotNumber: nextShotNumber(),
        club,
        routinePre: _routineShot.val === 'ok' ? 'Pass' : (_routineShot.val === 'no' ? 'Fail' : null),
    };
}

// ---- Track: a short label on the rail ----------------------------------

function syncTrackLabel() {
    const t = el('btn-oc-track-shot');
    if (!t) return;
    const m = /Log shot (\d+)/.exec(t.textContent || '');
    t.dataset.short = m ? `Log ${m[1]}` : 'Track';
}

// ---- Routine (Detailed only: per shot, pre-fills the shot's routine) ------
// Decision 15 (2026-10-07): Simple rounds have no Routine chip. Its per-hole
// taps went to simpleStats[h].routine, which nothing read or saved.

function routineNow() {
    if (_routineShot.key !== shotKey()) _routineShot = { key: shotKey(), val: undefined };
    return _routineShot.val;
}

function syncRoutine() {
    const r = el('btn-play-routine');
    if (!r) return;
    const v = routineNow();
    r.textContent = routineLabel(v);
    r.classList.toggle('ok', v === 'ok');
    r.classList.toggle('no', v === 'no');
    r.setAttribute('aria-label', `Pre-shot routine: ${v === 'ok' ? 'done' : (v === 'no' ? 'skipped' : 'not set')}`);
}

function cycleRoutine() {
    if (!detailed()) return; // hidden in Simple rounds (decision 15)
    _routineShot = { key: shotKey(), val: nextRoutine(routineNow()) };
    writeNextShot();
    syncRoutine();
}

// ---- GPS ------------------------------------------------------------------

function onFix(fix) {
    _lastFix = fix;
    const m = markerFrom(fix);
    if (_ctl && m) _ctl.setStartMarker(m);
    // Walked up to the ball: the shot view (and the suggestion) follow.
    if (_ctl && _ctl.frame && document.body.classList.contains('play-mode') && gpsLive()) {
        const now = ballFor(_ctl.frame);
        if (Math.hypot(now[0] - _ballXY[0], now[1] - _ballXY[1]) > 20) {
            _clubs.key = null; // re-suggest from the new spot
            syncPlayMode();
        }
    }
}

export function initPlayMode() {
    if (_bound) return;
    _bound = true;

    // Settings: the switch (on by default) and your reach.
    const toggle = el('play-mode-toggle');
    if (toggle) {
        toggle.checked = readPlayMode(storage()) === 'on';
        toggle.addEventListener('change', () => {
            writePlayMode(storage(), toggle.checked ? 'on' : 'off');
            syncPlayMode();
        });
    }
    const reach = el('play-reach');
    if (reach) {
        reach.value = String(readReach(storage()));
        reach.addEventListener('change', () => {
            writeReach(storage(), reach.value);
            reach.value = String(readReach(storage()));
            _mountKey = null;
            syncPlayMode();
        });
    }

    // 👥 the group (and the round's details) in a glass sheet.
    el('btn-oc-score-sheet')?.addEventListener('click', () => {
        document.body.classList.toggle('play-sheet-open');
        syncHandle();
    });

    // 📡 Start GPS: the same toggle as the ⋯ sheet's GPS button, but start
    // only. The chip stays up until the first fix (up to 15 s on a cold
    // phone), so a second tap must not switch GPS back off (C27 review P2).
    el('btn-play-gps')?.addEventListener('click', () => {
        if (!gpsLive()) el('btn-toggle-gps')?.click();
    });

    // 🎯 Shot ↔ 🗺 Hole: the same overlay, only the window moves.
    el('btn-play-view')?.addEventListener('click', () => {
        _view = _view === 'shot' ? 'hole' : 'shot';
        if (_ctl) _ctl.setViewMode(_view);
        if (_mountKey) _mountKey = _mountKey.replace(/\|(shot|hole)\|/, `|${_view}|`);
        syncViewChip();
    });

    el('btn-pc-up')?.addEventListener('click', () => pickClub(_clubs.sel - 1));
    el('btn-pc-down')?.addEventListener('click', () => pickClub(_clubs.sel + 1));
    el('play-clubs')?.addEventListener('click', (e) => {
        const c = e.target.closest?.('.pc-club');
        if (c && c.dataset.idx) pickClub(Number(c.dataset.idx));
    });

    el('btn-play-routine')?.addEventListener('click', cycleRoutine);

    // Every hole load (start, Next/Prev, jump, score tap, restore, a shot logged).
    document.addEventListener('oc-hole-loaded', () => { syncHandle(); primeNextShot(); syncPlayMode(); });

    // Round start / end flip body.round-active.
    // The shot wizard opening / closing flips body.active-wizard-mode.
    const bodyState = () => `${document.body.classList.contains('round-active')}|${document.body.classList.contains('active-wizard-mode')}`;
    let wasActive = bodyState();
    new MutationObserver(() => {
        const now = bodyState();
        if (now === wasActive) return;
        wasActive = now;
        syncPlayMode();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Codex P2: GPS switched off mid-hole hides the pill — take "you" off
    // the map then too (re-mount without the marker).
    const pill = el('oc-gps-widget');
    if (pill) {
        let shown = !pill.classList.contains('hidden');
        new MutationObserver(() => {
            const now = !pill.classList.contains('hidden');
            if (now === shown) return;
            shown = now;
            if (!now && !gpsLive()) _lastFix = null;
            _mountKey = null;
            syncPlayMode();
        }).observe(pill, { attributes: true, attributeFilter: ['class'] });
    }

    // Rotation / browser chrome changes re-fit the map.
    window.addEventListener('resize', () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => { _mountKey = null; syncPlayMode(); }, 200);
    });

    // You on the map, from the round's GPS watcher (never starts GPS itself).
    import('../oncourse.js').then(m => {
        _gpsMod = m;
        m.onGpsFix(onFix);
        const last = m.isGpsWatchActive() ? m.getLastGpsFix() : null;
        if (last) onFix(last);
    }).catch(e => console.warn('[PlayMode] GPS marker off:', e));

    syncPlayMode(); // a round restored before this module loaded
}
