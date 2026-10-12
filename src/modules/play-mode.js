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
//
// One-tap logging: with Map first
// shot entry in a Detailed round (body.play-quick) the map also logs the
// shot. Right rail: Plan / Actual / Undo; the club strip shows one club,
// the likely one. Arming Plan or Actual lets one finger draw (otherwise it
// pans, so a stray touch never draws); Actual with good GPS is one tap.
// The pure rules are src/quick-log.js; the save is score-input.js's.

import { AppState, mutateList } from '../state.js';
import { COURSE_DATA } from '../course-data.js';
import { courseSlugFor, loadCourseOverlay, mountHoleOverlay } from '../hole-overlay.js';
import { toFrame, distanceM } from '../geo.js';
import { normaliseShotEntry } from '../shot-entry.js';
import {
    quickLogWanted, likelyClubIndex, oneTapActual, quickInitial, quickReduce, QUICK_ADJUST_MS,
} from '../quick-log.js';
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
// One-tap logging. _quickOn: this round logs on the map (decided per sync).
let _quickOn = false;
let _quick = quickInitial();       // the chip state machine (src/quick-log.js)
let _quickHole = null;             // round|hole the Undo stack belongs to
let _quickPlanShot = null;         // the shot a drawn Plan is for
let _quickBusy = false;            // a log in flight: no second one
let _quickGps = null;              // { fix, fixXY } behind a one-tap Actual
let _adjustTimer = null;
let _holdStart = null;             // the nudge window keeps the logged shot in view
let _mounted = { slug: null, physical: null };

const el = (id) => document.getElementById(id);
const storage = () => { try { return window.localStorage; } catch { return null; } };
const roundActive = () => document.body.classList.contains('round-active') && !!AppState.activeRoundId;
const detailed = () => AppState.currentTrackingMode !== 'simple';
const holePar = () => Number(AppState.currentCoursePars?.[AppState.currentHole - 1]) || 4;
const holeShots = () => (AppState.currentHoleShots || []).filter(s => s.hole === AppState.currentHole && !s.planned);
const nextShotNumber = () => holeShots().length + 1;
const shotKey = () => `${AppState.activeRoundId}|${AppState.currentHole}|${nextShotNumber()}`;
const gpsLive = () => !!(_gpsMod && _gpsMod.isGpsWatchActive());
const quickWanted = () => quickLogWanted({
    shotEntry: normaliseShotEntry(AppState.shotEntry),
    playMode: readPlayMode(storage()),
    trackingMode: AppState.currentTrackingMode,
    courseSlug: courseSlugFor(AppState.currentRoundCourseName),
});
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

function gpsSettingOn() {
    return _gpsMod ? gpsLive() : storage()?.getItem('golf.gpsOn') === '1';
}

function syncPlaySettings() {
    const entry = el('play-shot-entry');
    if (entry) entry.value = normaliseShotEntry(el('shot-entry-select')?.value || AppState.shotEntry);
    const setSwitch = (id, on) => {
        const button = el(id);
        if (!button) return;
        button.setAttribute('aria-checked', String(on));
        const state = button.querySelector('strong');
        if (state) state.textContent = on ? 'On' : 'Off';
    };
    setSwitch('play-setting-gps', gpsSettingOn());
    setSwitch('play-setting-awake', !!document.querySelector('.wakelock-toggle.active'));
    setSwitch('play-setting-rotate', el('rotate-map-toggle')?.checked ?? AppState.rotateMap === true);
}

function closePlaySettings(restoreFocus = true) {
    el('play-settings-sheet')?.classList.add('hidden');
    el('play-settings-scrim')?.classList.add('hidden');
    el('btn-play-settings')?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) el('btn-play-settings')?.focus();
}

function bindPlaySettings() {
    const gear = el('btn-play-settings');
    const sheet = el('play-settings-sheet');
    if (!gear || !sheet) return;
    gear.addEventListener('click', () => {
        syncPlaySettings();
        el('play-settings-scrim')?.classList.remove('hidden');
        sheet.classList.remove('hidden');
        gear.setAttribute('aria-expanded', 'true');
        el('play-shot-entry')?.focus();
    });
    el('play-settings-close')?.addEventListener('click', () => closePlaySettings());
    el('play-settings-scrim')?.addEventListener('click', () => closePlaySettings());
    sheet.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !sheet.classList.contains('hidden')) closePlaySettings();
    });

    el('play-shot-entry')?.addEventListener('change', (event) => {
        const source = el('shot-entry-select');
        if (!source) return;
        source.value = normaliseShotEntry(event.currentTarget.value);
        source.dispatchEvent(new Event('change', { bubbles: true }));
        syncPlaySettings();
        // The existing shot-entry handler writes the preference and reapplies
        // wizard visibility. Re-sync the map rail too, so Map-first quick
        // logging follows the new choice without waiting for another hole.
        syncPlayMode();
    });
    el('play-setting-gps')?.addEventListener('click', () => {
        const wantOn = el('play-setting-gps')?.getAttribute('aria-checked') !== 'true';
        if (gpsSettingOn() !== wantOn) el('btn-toggle-gps')?.click();
        syncPlaySettings();
    });
    el('play-setting-awake')?.addEventListener('click', () => {
        const wantOn = el('play-setting-awake')?.getAttribute('aria-checked') !== 'true';
        const source = document.querySelector('.wakelock-toggle');
        if (source?.classList.contains('active') !== wantOn) source?.click();
        window.setTimeout(syncPlaySettings, 0);
    });
    el('play-setting-rotate')?.addEventListener('click', () => {
        const wantOn = el('play-setting-rotate')?.getAttribute('aria-checked') !== 'true';
        const source = el('rotate-map-toggle');
        if (source && source.checked !== wantOn) {
            source.checked = wantOn;
            source.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncPlaySettings();
    });
}

function teardown() {
    _run++;
    if (_ctl) { try { _ctl.destroy(); } catch { /* already gone */ } _ctl = null; }
    _mountKey = null;
    _lastFix = null; // Codex P2: never carry a position into the next round
    _frame = { key: null, frame: null };
    document.body.classList.remove('play-mode', 'play-sheet-open', 'play-detailed', 'play-simple', 'play-par3', 'play-quick');
    _quickOn = false;
    _holdStart = null;
    clearTimeout(_adjustTimer);
    _quick = quickInitial();
    _quickHole = null;
    closePlaySettings(false);
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

function syncHoleChip() {
    const chip = el('btn-play-hole');
    if (!chip) return;
    chip.textContent = `Hole ${AppState.currentHole || 1} ▾`;
    chip.setAttribute('aria-label', `Jump to hole ${AppState.currentHole || 1}`);
    chip.setAttribute('aria-expanded', String(!el('hole-jumper-container')?.classList.contains('hidden')));
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

/** One-tap logging: where the next shot starts — the last shot's finish
 * (measured or drawn), else the tee. Never the GPS. */
function chainStart() {
    const shots = holeShots();
    return ballStartXY({ fixXY: null, lastShot: shots[shots.length - 1] || null });
}

/** Where the ball is, in this hole's frame (GPS first; see ballStartXY). */
function ballFor(frame) {
    // One-tap logging: the shot starts at the tee / last finish; the GPS is
    // where you are — the GPS marks the finish position.
    const fresh = gpsLive() && !_quickOn ? _lastFix : null;
    // While a one-tap line can still be nudged, the view stays on that shot.
    if (_quickOn && _holdStart) return [..._holdStart];
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
    _quickOn = detailed() && quickWanted();
    b.toggle('play-quick', _quickOn);
    syncQuickHole();
    map.classList.remove('hidden');
    dockChips();
    syncHandle();
    syncHoleChip();
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
        Math.round(ball[0] / 10), Math.round(ball[1] / 10), _quickOn ? `q${ball.map(Math.round).join(',')}` : ''].join('|');
    if (key === _mountKey && _ctl) { syncClubs(); applyQuick(); return; }
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
        // One-tap logging: the start dot new lines are anchored to; the map
        // stays read-only (pans) until Plan or Actual is armed.
        ...(_quickOn ? { startXY: ball, anchorFirst: true, onChange: onQuickDrawn } : {}),
    });
    _mounted = { slug, physical };
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
    applyQuick();
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
        // One-tap logging: the club the distance from the START to the pin
        // calls for (the GPS is where the last shot finished, not this one).
        const g = _ctl?.greenXY;
        const fromStart = Array.isArray(g) ? Math.hypot(g[0] - chainStart()[0], g[1] - chainStart()[1]) : d;
        const sug = _quickOn ? Math.max(0, likelyClubIndex(ladder, Number.isFinite(distOverride) ? distOverride : fromStart))
            : Math.max(0, ladder.findIndex(c => c.val === best));
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
    if (_quickOn) {
        // Mock A: one club, a 'likely' badge (or ↺ the likely one), and the
        // next club up / down named on ▲ / ▼.
        if (s) s.textContent = sel === sug ? 'likely' : (ladder[sug] ? `↺ ${shortClubLabel(ladder[sug].val)}` : '');
        if (up) up.innerHTML = `▲<small>${ladder[sel - 1] ? shortClubLabel(ladder[sel - 1].val) : ''}</small>`;
        if (down) down.innerHTML = `<small>${ladder[sel + 1] ? shortClubLabel(ladder[sel + 1].val) : ''}</small>▼`;
    } else {
        if (s) s.textContent = sel === sug ? 'SUGGESTED' : (ladder[sug] ? `SUGG. ${shortClubLabel(ladder[sug].val)}` : '');
        if (up && up.textContent !== '▲') up.textContent = '▲';
        if (down && down.textContent !== '▼') down.textContent = '▼';
    }
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
        // One-tap logging: a Plan drawn on the map goes into the wizard too.
        plan: quickPlanForWizard(),
    };
}

// ---- One-tap logging: Plan / Actual / Undo on the map -------------------

const toObjs = (pts) => pts.map(([x, y]) => ({ x, y }));
const toPairs = (objs) => (Array.isArray(objs) ? objs.map(o => [o.x, o.y]) : null);
const lineLen = (pts) => (pts && pts.length >= 2
    ? Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) : 0);

/** The Undo stack belongs to one hole; a plan to one shot. */
function syncQuickHole() {
    const hk = `${AppState.activeRoundId}|${AppState.currentHole}`;
    if (hk !== _quickHole) {
        _quickHole = hk;
        _holdStart = null;
        clearTimeout(_adjustTimer);
        _quick = quickReduce(_quick, { type: 'reset' }).state;
    }
    // A plan whose shot was logged some other way (the wizard) is spent.
    if (_quick.plan && _quickPlanShot !== shotKey()) _quick = { ..._quick, plan: null };
}

function quickPlanForWizard() {
    const f = _ctl?.frame;
    if (!_quickOn || !_quick.plan || !f || _quickPlanShot !== shotKey()) return null;
    return {
        lineIntended: toObjs(_quick.plan),
        lineFrame: { origin: { lat: f.origin[0], lon: f.origin[1] }, bearing: f.bearing, courseSlug: _mounted.slug, physicalHole: _mounted.physical },
    };
}

/** The shot the nudge window is on (the newest logged one on the stack). */
function adjustShot() {
    const e = [..._quick.undo].reverse().find(x => x.kind === 'shot');
    return e ? (AppState.currentHoleShots || []).find(s => s.id === e.shotId) || null : null;
}

/** What the map shows: the line being made, else the last shot's lines. */
function quickCurves() {
    if (_quick.armed === 'adjust') {
        const s = adjustShot();
        return { intended: toPairs(s?.lineIntended), actual: toPairs(s?.lineActual) };
    }
    const pending = (AppState.currentHoleShots || []).find(s => s.planned === true && s.hole === AppState.currentHole);
    const plan = _quick.plan || toPairs(pending?.lineIntended) || null;
    if (plan || _quick.armed) return { intended: plan, actual: null };
    const last = holeShots().slice(-1)[0];
    return { intended: toPairs(last?.lineIntended), actual: toPairs(last?.lineActual) };
}

/** Can Actual be one tap right now (src/quick-log.js oneTapActual)? */
function quickGps() {
    const fix = gpsLive() ? _lastFix : null;
    const frame = _ctl?.frame || null;
    const fixXY = fix && frame && Number.isFinite(fix.lat) ? toFrame(frame, [fix.lat, fix.lon]) : null;
    return { ...oneTapActual({ fix, fixXY, startXY: chainStart(), greenXY: _ctl?.greenXY || null, gpsLive: gpsLive() }), fix, fixXY };
}

/** The overlay, chips and hint follow the state machine. */
function applyQuick() {
    syncQuickChips();
    const canvas = el('oc-play-map')?.querySelector('canvas');
    if (!_quickOn || !_ctl) return;
    const draw = !!_quick.armed;
    _ctl.setReadOnly?.(!draw);
    if (draw) _ctl.setMode(_quick.armed === 'plan' ? 'intended' : 'actual');
    const s = _quick.armed === 'adjust' ? adjustShot() : null;
    _ctl.setAnchor?.(s?.startXY ? [s.startXY.x, s.startXY.y] : (toPairs(s?.lineActual)?.[0] || chainStart()));
    const c = quickCurves();
    _ctl.setCurves({ intended: c.intended, actual: c.actual });
    if (canvas) {
        canvas.dataset.quick = _quick.armed || 'idle';
        canvas.dataset.plan = String(_quick.plan?.length || 0);
    }
}

function syncQuickChips() {
    const plan = el('btn-quick-plan'), actual = el('btn-quick-actual'), undo = el('btn-quick-undo');
    if (!plan || !actual || !undo || !_quickOn) return;
    const g = quickGps();
    plan.classList.toggle('on', _quick.armed === 'plan');
    plan.setAttribute('aria-pressed', String(_quick.armed === 'plan'));
    const aOn = _quick.armed === 'actual' || _quick.armed === 'adjust';
    actual.classList.toggle('on', aOn);
    actual.setAttribute('aria-pressed', String(aOn));
    actual.dataset.oneTap = String(g.ok);
    const sub = actual.querySelector('.pq-sub');
    const acc = g.fix && Number.isFinite(g.fix.accuracyM) ? Math.round(g.fix.accuracyM) : null;
    if (sub) sub.textContent = g.ok ? `📍 here · ±${acc} m` : (g.reason === 'weak' ? `GPS ±${acc ?? '?'} m · draw` : 'draw it');
    actual.setAttribute('aria-label', g.ok ? 'Actual: log this shot as finishing where you stand' : 'Actual: then drag where the shot finished');
    undo.disabled = !_quick.undo.length;
    // The hint, as in the mock: where this shot starts, then what to do.
    const n = nextShotNumber();
    const l1 = el('play-quick-hint')?.querySelector('.pq-l1');
    const l2 = el('play-quick-hint')?.querySelector('.pq-l2');
    if (l1) l1.textContent = `Shot ${n} · Start: ${holeShots().length ? 'last finish' : 'tee'}${gpsLive() ? ' · GPS = where it finished' : ''}`;
    if (l2) {
        const why = { weak: `GPS ±${acc ?? '?'} m is weak — `, 'no-gps': 'GPS off — ', stale: 'GPS lost — ', 'off-hole': 'GPS is off this hole — ', 'at-start': 'You are at the start — ', 'no-frame': '' }[g.reason] || '';
        l2.textContent = _quick.armed === 'plan' ? 'Drag on the map — the plan runs from the start dot'
            : _quick.armed === 'actual' ? `${why}drag to where it finished`
                : _quick.armed === 'adjust' ? 'Logged at your GPS spot — drag to nudge it, or carry on'
                    : g.ok ? 'At your ball? Tap Actual (1 tap). Plan first if you like.'
                        : 'Tap Plan or Actual, then drag on the map';
    }
}

function dispatchQuick(action) {
    const { state, effect } = quickReduce(_quick, action);
    _quick = state;
    if (effect) runQuickEffect(effect);
    // The nudge window is over: the view moves on to the next shot's start.
    if (_holdStart && _quick.armed !== 'adjust' && !_quickBusy) {
        _holdStart = null;
        syncPlayMode();
    }
    applyQuick();
    if (detailed() && AppState.activeRoundId) writeNextShot();
}

function startAdjustWindow() {
    clearTimeout(_adjustTimer);
    _adjustTimer = setTimeout(() => dispatchQuick({ type: 'adjust-end' }), QUICK_ADJUST_MS);
}

function quickToast(msg) {
    import('./score-input.js').then(m => m.showToast(msg)).catch(() => { /* no toast */ });
}

function runQuickEffect(effect) {
    if (effect.kind === 'plan') {
        _quickPlanShot = shotKey();
        const club = _clubs.ladder[_clubs.sel];
        quickToast(`Plan ${Math.round(lineLen(_quick.plan))} m${club ? ` · ${shortClubLabel(club.val)}` : ''}`);
    } else if (effect.kind === 'log') {
        logQuickShot(effect);
    } else if (effect.kind === 'nudge') {
        const frame = _ctl?.frame;
        import('./score-input.js').then(m => {
            const prev = m.quickNudgeShot(effect.shotId, effect.actual, frame);
            if (prev) { dispatchQuick({ type: 'nudged', shotId: effect.shotId, prev }); startAdjustWindow(); m.showToast(`Nudged · ${Math.round(lineLen(effect.actual))} m`); }
        }).catch(e => console.warn('[PlayMode] nudge not saved:', e));
    } else if (effect.kind === 'undo') {
        const entry = effect.entry;
        clearTimeout(_adjustTimer);
        if (entry.kind === 'plan') { _quickPlanShot = shotKey(); quickToast('↶ Plan undone'); return; }
        import('./score-input.js').then(m => {
            m.quickUndo({ ...entry, shotNumber: entry.undo?.shotNumber });
            if (entry.kind === 'nudge') m.showToast('↶ Nudge undone');
            _quickPlanShot = shotKey(); // the shot it took is back to log again
            applyQuick();
        }).catch(e => console.warn('[PlayMode] undo failed:', e));
    } else if (effect.kind === 'nothing') {
        quickToast('Nothing to undo');
    }
}

/** Save the shot through the wizard's own save path (score-input.js). */
async function logQuickShot(effect) {
    if (_quickBusy || !_ctl?.frame) return;
    const frame = _ctl.frame;
    const start = chainStart(); // not the view's ball: the nudge window may still hold the last shot
    let actual = effect.actual;
    let finishFix = null;
    if (effect.source === 'gps') {
        if (!_quickGps) return;
        actual = [start, _quickGps.fixXY];
        finishFix = _quickGps.fix;
    }
    // A plan saved from the wizard is logged too; Undo gives its line back.
    const pending = (AppState.currentHoleShots || []).find(s => s.planned === true && s.hole === AppState.currentHole);
    const intendedUsed = effect.intended || toPairs(pending?.lineIntended) || null;
    _quickBusy = true;
    // One tap: keep the view on this shot while it can be nudged.
    if (effect.source === 'gps') _holdStart = start;
    try {
        const m = await import('./score-input.js');
        const club = _clubs.key === shotKey() ? _clubs.ladder[_clubs.sel]?.val || null : null;
        const res = await m.quickLogShot({
            actual, intended: effect.intended, frame, slug: _mounted.slug, physical: _mounted.physical,
            club, startXY: start, greenXY: _ctl?.greenXY || null, finishFix,
        });
        if (!res?.shotId) { _holdStart = null; quickToast('Shot not logged — try again'); return; }
        const clubLbl = club ? ` · ${shortClubLabel(club)}` : '';
        quickToast(`✓ Shot ${res.shotNumber} logged${clubLbl} · ${Math.round(lineLen(actual))} m`);
        dispatchQuick({
            type: 'logged', shotId: res.shotId, intended: intendedUsed,
            // A logged wizard plan has no exact record (null): its Undo
            // takes the stored shot off instead (score-input quickUndo).
            undo: res.undo ? { ...res.undo, shotNumber: res.shotNumber } : null,
            adjust: effect.source === 'gps',
        });
        if (effect.source === 'gps') startAdjustWindow();
    } catch (e) {
        _holdStart = null;
        console.warn('[PlayMode] one-tap log failed:', e);
    } finally {
        _quickBusy = false;
        _quickGps = null;
    }
}

/** A line finished on the play map (only while a chip is armed). */
function onQuickDrawn({ points }) {
    const pts = Array.isArray(points) ? points.map(p => [p[0], p[1]]) : null;
    // A flick shorter than a few metres is a stray touch, not a shot.
    if (!pts || lineLen(pts) < 5) { applyQuick(); return; }
    dispatchQuick({ type: 'drawn', pts });
}

function tapQuickActual() {
    if (_quickBusy) return;
    const g = quickGps();
    _quickGps = g.ok ? { fix: g.fix, fixXY: g.fixXY } : null;
    dispatchQuick({ type: 'tap-actual', gpsOk: g.ok });
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
    if (_quickOn) syncQuickChips(); // one tap or draw follows the GPS
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

    bindPlaySettings();

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

    // The glass chip opens the existing hole strip, whose buttons all call
    // oncourse.js's jumpToHole path.
    el('btn-play-hole')?.addEventListener('click', () => {
        el('btn-oc-hole-strip')?.click();
        syncHoleChip();
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
        if (!c || !c.dataset.idx) return;
        // One-tap logging shows only the pick: tapping it goes back to the
        // likely club (mock A).
        if (_quickOn && Number(c.dataset.idx) === _clubs.sel) { pickClub(_clubs.sug); return; }
        pickClub(Number(c.dataset.idx));
    });

    // One-tap logging: Plan / Actual / Undo on the right rail.
    el('btn-quick-plan')?.addEventListener('click', () => { if (!_quickBusy) dispatchQuick({ type: 'tap-plan' }); });
    el('btn-quick-actual')?.addEventListener('click', tapQuickActual);
    el('btn-quick-undo')?.addEventListener('click', () => { if (!_quickBusy) dispatchQuick({ type: 'undo' }); });

    el('btn-play-routine')?.addEventListener('click', cycleRoutine);

    // Every hole load (start, Next/Prev, jump, score tap, restore, a shot logged).
    document.addEventListener('oc-hole-loaded', () => { syncHandle(); syncHoleChip(); primeNextShot(); syncPlayMode(); });

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
