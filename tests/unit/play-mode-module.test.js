// @vitest-environment jsdom
// Play mode wiring (src/modules/play-mode.js): the body class follows the
// round, the setting and the course map; the rail chips (GPS, Shot | Hole,
// group, club strip, Track, Routine) work. Owner 2026-10-06, Layout A.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    AppState: {},
    ctl: null,
    mounts: [],
    overlay: { holes: {
        19: { tee: { lat: 0, lon: 0 }, green: { centre: { lat: 0.002, lon: 0 } } },
        20: { tee: { lat: 0.01, lon: 0 }, green: { centre: { lat: 0.012, lon: 0 } } },
    } },
    fixListeners: [],
    // A tiny bag with made-up carries; the mocked ranking picks the club
    // nearest the distance (the real one is card-render's orderClubsFor).
    carry: { Driver: 210, '5 Iron': 170, '7 Iron': 146, PW: 105, Putter: null },
}));

vi.mock('../../src/state.js', () => ({
    AppState: h.AppState,
    mutateList: (key, fn) => { const c = [...h.AppState[key]]; fn(c); h.AppState[key] = c; },
}));
vi.mock('../../src/course-data.js', () => ({
    COURSE_DATA: { 'Keperra – West Course (9 holes)': { 'Blue (Men)': { physicalHoles: [19, 20] } } },
}));
vi.mock('../../src/hole-overlay.js', () => ({
    courseSlugFor: (n) => (String(n || '').includes('Keperra') ? 'keperra' : null),
    loadCourseOverlay: vi.fn(async () => h.overlay),
    mountHoleOverlay: vi.fn((canvas, hole, opts) => {
        const ctl = {
            destroy: vi.fn(), setStartMarker: vi.fn(), setViewMode: vi.fn(),
            setReadOnly: vi.fn(), setMode: vi.fn(), setAnchor: vi.fn(), setCurves: vi.fn(),
            opts, hole,
            frame: { origin: [0, 0], bearing: 0 }, greenXY: [0, 380],
        };
        h.mounts.push(ctl);
        return ctl;
    }),
}));
vi.mock('../../src/oncourse.js', () => ({
    onGpsFix: (cb) => { h.fixListeners.push(cb); return () => {}; },
    isGpsWatchActive: () => h.gpsOn === true,
    getLastGpsFix: () => h.lastFix ?? null,
}));
vi.mock('../../src/modules/card-render.js', () => ({
    currentBag: () => Object.keys(h.carry),
    flattenClubs: (bag, ordered) => ordered,
    orderClubsFor: (bag, d) => {
        const list = bag.map(v => ({ label: v, val: v }));
        if (d == null) return list;
        return list.filter(c => h.carry[c.val]).sort((a, b) => Math.abs(h.carry[a.val] - d) - Math.abs(h.carry[b.val] - d));
    },
    shortClubLabel: (v) => ({ Driver: 'Dr', '5 Iron': '5i', '7 Iron': '7i', PW: 'PW', Putter: 'Putter' })[v] || v,
}));

const settle = () => new Promise(r => setTimeout(r, 0));
const $ = (id) => document.getElementById(id);

function dom() {
    document.body.className = '';
    document.body.innerHTML = `
      <div id="oc-play-map" class="hidden"><canvas></canvas></div>
      <button id="btn-play-settings" aria-expanded="false"></button>
      <div id="play-settings-scrim" class="hidden"></div>
      <section id="play-settings-sheet" class="hidden" role="dialog">
        <select id="play-shot-entry"><option value="both">Both</option><option value="map">Map first</option></select>
        <button id="play-setting-gps" role="switch"></button>
        <button id="play-setting-awake" role="switch"></button>
        <button id="play-setting-rotate" role="switch"></button>
        <button id="play-settings-close"></button>
      </section>
      <div id="oc-exit-bar"></div>
      <div id="play-rail-left">
        <div id="play-slot-gps"></div>
        <button id="btn-play-view"></button>
        <div id="play-slot-group"></div>
        <div id="play-clubs">
          <button id="btn-pc-up"></button>
          <button class="pc-club"></button><button class="pc-club"></button><button class="pc-club"></button>
          <button id="btn-pc-down"></button>
          <div id="pc-sug"></div>
        </div>
        <div id="play-slot-track"></div>
      </div>
      <div id="hub">
        <div id="oc-score-sheet"><button id="btn-oc-score-sheet"></button></div>
        <div class="oc-track-wrap"><button id="btn-oc-track-shot">🎯 Track My Shot</button></div>
        <div id="oc-gps-widget"></div><button id="btn-big-numbers"></button>
        <button id="btn-play-gps"></button>
      </div>
      <button id="btn-toggle-gps"></button>
      <select id="shot-entry-select"><option value="both">Both</option><option value="map">Map first</option></select>
      <button class="wakelock-toggle" id="wake-round"></button>
      <input type="checkbox" id="rotate-map-toggle">
      <div id="oc-bottom-nav"><button id="btn-play-routine"></button></div>
      <input type="checkbox" id="play-mode-toggle" checked>
      <input type="number" id="play-reach" value="230">`;
}

async function fresh() {
    vi.resetModules();
    return import('../../src/modules/play-mode.js');
}

function startRound(extra = {}) {
    Object.assign(h.AppState, {
        activeRoundId: 'round_1', currentRoundCourseName: 'Keperra – West Course (9 holes)',
        currentRoundTee: 'Blue (Men)', currentHole: 1, currentCoursePars: [4, 3],
        currentTrackingMode: 'detailed', currentHoleShots: [], currentUser: { uid: 'me' },
        liveRoundGroups: [{ uid: 'me', scores: {}, simpleStats: {} }, { uid: 'g', scores: {}, simpleStats: {} }],
        ...extra,
    });
    document.body.classList.add('round-active');
}

async function on(extra) {
    const m = await fresh();
    m.initPlayMode();
    startRound(extra);
    await settle(); await settle();
    return m;
}

beforeEach(() => {
    for (const k of Object.keys(h.AppState)) delete h.AppState[k];
    h.mounts.length = 0;
    h.fixListeners.length = 0;
    h.gpsOn = false;
    h.lastFix = null;
    localStorage.clear();
    // These cover the classic play map (shot entry 'both'). Map first adds
    // one-tap logging on the map (body.play-quick: one-club strip, start
    // from the last finish), covered in quick-log*.test.js and
    // one-tap-logging.spec.js. Pinned so the Map-first default
    // doesn't silently switch these tests to the one-tap layout.
    h.AppState.shotEntry = 'both';
    dom();
});

describe('play mode module', () => {
    it('opens the glass settings sheet and forwards changes through the existing setting controls', async () => {
        const sourceEntry = $('shot-entry-select');
        sourceEntry.addEventListener('change', () => { h.AppState.shotEntry = sourceEntry.value; });
        $('btn-toggle-gps').addEventListener('click', () => { h.gpsOn = !h.gpsOn; });
        $('wake-round').addEventListener('click', () => $('wake-round').classList.toggle('active'));
        $('rotate-map-toggle').addEventListener('change', () => {
            h.AppState.rotateMap = $('rotate-map-toggle').checked;
        });

        await on({ shotEntry: 'both', rotateMap: false });
        $('btn-play-settings').click();
        expect($('play-settings-sheet').classList.contains('hidden')).toBe(false);
        expect($('btn-play-settings').getAttribute('aria-expanded')).toBe('true');

        $('play-shot-entry').value = 'map';
        $('play-shot-entry').dispatchEvent(new Event('change', { bubbles: true }));
        expect(sourceEntry.value).toBe('map');
        expect(h.AppState.shotEntry).toBe('map');

        $('play-setting-gps').click();
        expect(h.gpsOn).toBe(true);
        $('play-setting-awake').click();
        expect($('wake-round').classList.contains('active')).toBe(true);
        $('play-setting-rotate').click();
        expect($('rotate-map-toggle').checked).toBe(true);
        expect(h.AppState.rotateMap).toBe(true);
    });

    it('turns on with the round on a mapped course: physical hole, read-only, full-screen, outline, shot view', async () => {
        await on();
        expect(document.body.classList.contains('play-mode')).toBe(true);
        expect($('oc-play-map').classList.contains('hidden')).toBe(false);
        const last = h.mounts.at(-1);
        expect(last.hole).toBe(h.overlay.holes[19]);
        expect(last.opts).toMatchObject({ readOnly: true, fill: true, featureStyle: 'outline', viewMode: 'shot' });
        expect(last.opts.focus).toEqual({ startXY: [0, 0], reachM: 230 });
        expect(document.querySelector('#oc-play-map canvas').dataset.hole).toBe('19');
    });

    it('turns off when the round ends, and puts the moved chips back', async () => {
        await on();
        expect($('btn-oc-track-shot').parentElement.id).toBe('play-slot-track');
        expect($('oc-gps-widget').parentElement.id).toBe('play-slot-gps');
        h.AppState.activeRoundId = null;
        document.body.classList.remove('round-active');
        await settle(); await settle();
        expect(document.body.classList.contains('play-mode')).toBe(false);
        expect(h.mounts.at(-1).destroy).toHaveBeenCalled();
        expect($('btn-oc-track-shot').parentElement.className).toBe('oc-track-wrap');
        expect($('btn-oc-score-sheet').parentElement.id).toBe('oc-score-sheet');
        // original order kept (the CSS sibling rules rely on it)
        expect([...$('hub').children].map(c => c.id).filter(Boolean)).toEqual(['oc-score-sheet', 'oc-gps-widget', 'btn-big-numbers', 'btn-play-gps']);
    });

    it('stays off on a course with no map, and when the setting is off', async () => {
        const m = await fresh();
        m.initPlayMode();
        startRound();
        h.AppState.currentRoundCourseName = 'McLeod GC';
        await m.syncPlayMode();
        expect(document.body.classList.contains('play-mode')).toBe(false);

        h.AppState.currentRoundCourseName = 'Keperra – West Course (9 holes)';
        const t = $('play-mode-toggle');
        t.checked = false;
        t.dispatchEvent(new Event('change'));
        await settle(); await settle();
        expect(localStorage.getItem('golf.playMode')).toBe('off');
        expect(document.body.classList.contains('play-mode')).toBe(false);
    });

    it('re-mounts only when the hole changes, not on every score tap', async () => {
        await on();
        const n = h.mounts.length;
        document.dispatchEvent(new CustomEvent('oc-hole-loaded')); // a score tap
        await settle(); await settle();
        expect(h.mounts.length).toBe(n);
        h.AppState.currentHole = 2;
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        await settle(); await settle();
        expect(h.mounts.length).toBeGreaterThan(n);
        expect(h.mounts.at(-1).hole).toBe(h.overlay.holes[20]);
        expect(document.body.classList.contains('play-par3')).toBe(true);
    });

    it('👥 pulls the group sheet up and down', async () => {
        await on();
        const btn = $('btn-oc-score-sheet');
        expect(btn.textContent).toBe('👥 2');
        btn.click();
        expect(document.body.classList.contains('play-sheet-open')).toBe(true);
        expect(btn.textContent).toBe('✕');
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        btn.click();
        expect(document.body.classList.contains('play-sheet-open')).toBe(false);
    });

    it('Start GPS uses the round GPS toggle; fixes put you on the map', async () => {
        const m = await fresh();
        m.initPlayMode();
        const toggle = vi.fn();
        $('btn-toggle-gps').addEventListener('click', toggle);
        $('btn-play-gps').click();
        expect(toggle).toHaveBeenCalledTimes(1);
        startRound();
        await settle(); await settle();
        h.fixListeners.forEach(cb => cb({ lat: -27.4, lon: 152.9 }));
        expect(h.mounts.at(-1).setStartMarker).toHaveBeenCalledWith({ lat: -27.4, lon: 152.9, quality: 'accepted', draggable: false });
    });

    it('📡 only ever starts GPS: a second tap while it is locating never turns it off (C27 review P2)', async () => {
        const m = await fresh();
        m.initPlayMode();
        await settle(); await settle(); // the oncourse.js import lands
        const toggle = vi.fn(() => { h.gpsOn = true; });
        $('btn-toggle-gps').addEventListener('click', toggle);
        try {
            $('btn-play-gps').click();
            $('btn-play-gps').click(); // no pill yet: the golfer taps again
            expect(toggle).toHaveBeenCalledTimes(1);
        } finally {
            h.gpsOn = false;
        }
    });

    it('never shows a stale "you": GPS off or a new round mounts with no marker (Codex P2)', async () => {
        const m = await fresh();
        m.initPlayMode();
        await settle(); // oncourse.js (GPS) loaded
        h.gpsOn = true;
        h.lastFix = { lat: 0.0001, lon: 0 };
        startRound();
        await settle(); await settle();
        expect(h.mounts.at(-1).opts.startMarker).toMatchObject({ lat: 0.0001, lon: 0 });
        h.gpsOn = false;
        h.AppState.currentHole = 2;
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        await settle(); await settle();
        expect(h.mounts.at(-1).hole).toBe(h.overlay.holes[20]);
        expect(h.mounts.at(-1).opts.startMarker).toBeNull();
    });

    it('GPS switched off mid-hole takes the marker off the map (Codex P2 re-review)', async () => {
        const m = await fresh();
        m.initPlayMode();
        await settle();
        h.gpsOn = true;
        h.lastFix = { lat: 0.0001, lon: 0 };
        startRound();
        await settle(); await settle();
        const n = h.mounts.length;
        h.gpsOn = false;
        $('oc-gps-widget').classList.add('hidden'); // what toggleGPS does
        await settle(); await settle();
        expect(h.mounts.length).toBeGreaterThan(n);
        expect(h.mounts.at(-1).opts.startMarker).toBeNull();
    });

    it('the shot wizard gets the only live map: play map off while it is open, back after', async () => {
        await on();
        document.body.classList.add('active-wizard-mode');
        await settle(); await settle();
        expect(h.mounts.every(c => c.destroy.mock.calls.length > 0)).toBe(true);
        const n = h.mounts.length;
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        await settle(); await settle();
        expect(h.mounts.length).toBe(n);
        document.body.classList.remove('active-wizard-mode');
        await settle(); await settle();
        expect(h.mounts.length).toBeGreaterThan(n);
        expect(document.body.classList.contains('play-mode')).toBe(true);
    });

    it('fits the hole between the top strip and the bottom chips; a moved bar re-fits', async () => {
        let navTop = 600;
        $('oc-exit-bar').getBoundingClientRect = () => ({ top: 8, bottom: 48, height: 40 });
        $('oc-bottom-nav').getBoundingClientRect = () => ({ top: navTop, bottom: 660, height: 52 });
        await on();
        const fit = h.mounts.at(-1).opts.fitInsets;
        expect(fit.top).toBe(56);
        expect(fit.bottom).toBe(window.innerHeight - 600 + 8);
        navTop = 560;
        const n = h.mounts.length;
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        await settle(); await settle();
        expect(h.mounts.length).toBeGreaterThan(n); // (earlier tests' instances share the mocks)
        expect(h.mounts.at(-1).opts.fitInsets.bottom).toBe(fit.bottom + 40);
    });
});

describe('🎯 Shot | 🗺 Hole and your reach', () => {
    it('the chip flips the same map between views; a new hole opens on the shot view', async () => {
        await on();
        const n = h.mounts.length;
        $('btn-play-view').click();
        expect(h.mounts.at(-1).setViewMode).toHaveBeenCalledWith('hole');
        expect($('btn-play-view').textContent).toContain('Hole');
        document.dispatchEvent(new CustomEvent('oc-hole-loaded')); // a score tap: no re-mount
        await settle(); await settle();
        expect(h.mounts.length).toBe(n);
        h.AppState.currentHole = 2;
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        await settle(); await settle();
        expect(h.mounts.at(-1).opts.viewMode).toBe('shot');
    });

    it('the reach setting frames the shot view (and is kept)', async () => {
        await on();
        const r = $('play-reach');
        r.value = '184';
        r.dispatchEvent(new Event('change'));
        await settle(); await settle();
        expect(r.value).toBe('180');
        expect(localStorage.getItem('golf.playReach')).toBe('180');
        expect(h.mounts.at(-1).opts.focus.reachM).toBe(180);
    });

    it('frames from the last shot\'s finish, then follows your GPS when you walk up', async () => {
        const m = await fresh();
        m.initPlayMode();
        await settle();
        startRound({ currentHoleShots: [{ hole: 1, shotNumber: 1, finishXY: { x: 4, y: 220 } }] });
        await settle(); await settle();
        expect(h.mounts.at(-1).opts.focus.startXY).toEqual([4, 220]);
        h.gpsOn = true;
        h.fixListeners.forEach(cb => cb({ lat: 0.0027, lon: 0, distM: 80 })); // ~300 m up the hole
        await settle(); await settle();
        const xy = h.mounts.at(-1).opts.focus.startXY;
        expect(Math.round(xy[1])).toBe(300);
    });
});

describe('club strip (Detailed)', () => {
    const shown = () => [...document.querySelectorAll('#play-clubs .pc-club')].map(b => b.dataset.val);
    const sel = () => document.querySelector('#play-clubs .pc-club.sel')?.dataset.val;

    it('opens on the suggested club, longer above, shorter below', async () => {
        // ball at the tee, green 380 m away: the ranking picks the Driver
        await on();
        expect(sel()).toBe('Driver');
        expect($('pc-sug').textContent).toBe('SUGGESTED');
        // from 150 m: 7 Iron, with 5 Iron above and PW below
        h.AppState.currentHoleShots = [{ hole: 1, shotNumber: 1, finishXY: { x: 0, y: 230 } }];
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        await settle(); await settle();
        expect(shown()).toEqual(['5 Iron', '7 Iron', 'PW']);
        expect(sel()).toBe('7 Iron');
    });

    it('arrows step through the bag; the label keeps the suggestion; Track gets the pick', async () => {
        await on({ currentHoleShots: [{ hole: 1, shotNumber: 1, finishXY: { x: 0, y: 230 } }] });
        $('btn-pc-down').click();
        expect(sel()).toBe('PW');
        expect($('pc-sug').textContent).toBe('SUGG. 7i');
        expect(h.AppState.nextShotDefaults).toMatchObject({ roundId: 'round_1', hole: 1, shotNumber: 2, club: 'PW' });
        $('btn-pc-up').click(); $('btn-pc-up').click(); $('btn-pc-up').click(); $('btn-pc-up').click();
        expect(sel()).toBe('Driver');
        expect($('btn-pc-up').disabled).toBe(true);
        document.querySelectorAll('#play-clubs .pc-club')[1].click();
        expect(sel()).toBe('5 Iron');
    });

    it('Track carries a short label', async () => {
        await on();
        expect($('btn-oc-track-shot').dataset.short).toBe('Track');
        $('btn-oc-track-shot').textContent = '🎯 Log shot 2 · draw what happened';
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        await settle(); await settle();
        expect($('btn-oc-track-shot').dataset.short).toBe('Log 2');
    });
});

describe('Routine chip', () => {
    // Decision 15 (2026-10-07): no Routine chip in Simple rounds. Its taps went
    // to simpleStats[h].routine, which nothing read or saved.
    it('Simple: the chip does nothing and writes nothing (it is hidden there)', async () => {
        await on({ currentTrackingMode: 'simple' });
        expect(document.body.classList.contains('play-simple')).toBe(true);
        const before = JSON.stringify(h.AppState.liveRoundGroups);
        const r = $('btn-play-routine');
        r.click();
        expect(r.textContent).toBe('Routine');
        expect(JSON.stringify(h.AppState.liveRoundGroups)).toBe(before);
    });

    it('Detailed: pre-fills the next shot\'s Process & Commitment; a new shot starts blank', async () => {
        await on();
        $('btn-play-routine').click();
        expect(h.AppState.nextShotDefaults).toMatchObject({ shotNumber: 1, routinePre: 'Pass' });
        $('btn-play-routine').click();
        expect(h.AppState.nextShotDefaults.routinePre).toBe('Fail');
        h.AppState.currentHoleShots = [{ hole: 1, shotNumber: 1 }];
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        await settle(); await settle();
        expect($('btn-play-routine').textContent).toBe('Routine');
        expect(h.AppState.nextShotDefaults).toMatchObject({ shotNumber: 2, routinePre: null });
    });
});

describe('Codex P2 (2026-10-06): Next Hole opens the wizard at once — the defaults are already set', () => {
    it('the new hole\'s club + routine are written synchronously on hole-load', async () => {
        await on({ currentCoursePars: [4, 4] });
        h.AppState.currentHole = 2;
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        // no await: Next Hole calls startNewShotInput() straight after loadHole()
        expect(h.AppState.nextShotDefaults).toMatchObject({ hole: 2, shotNumber: 1, club: 'Driver' });
    });
});

describe('Codex P2 (pass 3): the tee shot is primed from the tee, not a stale GPS distance', () => {
    it('a fix still measuring to the previous green does not pick the new tee club', async () => {
        await on({ currentCoursePars: [4, 4] });
        h.gpsOn = true;
        h.fixListeners.forEach(cb => cb({ lat: 0.0027, lon: 0, distM: 80 })); // last hole: 80 m to ITS green
        h.AppState.currentHole = 2;
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        expect(h.AppState.nextShotDefaults).toMatchObject({ hole: 2, shotNumber: 1, club: 'Driver' });
    });
});

describe('Codex P2 (pass 4): cold start - priming waits for the course file, then tells the open wizard', () => {
    it('hole-load before the course is cached still sets the tee defaults and fires play-shot-defaults', async () => {
        const m = await fresh();
        m.initPlayMode();
        const fired = vi.fn();
        document.addEventListener('play-shot-defaults', fired);
        startRound({ currentCoursePars: [4, 3] });
        document.body.classList.add('active-wizard-mode'); // Detailed auto-opens shot 1
        document.dispatchEvent(new CustomEvent('oc-hole-loaded'));
        await settle(); await settle();
        expect(h.AppState.nextShotDefaults).toMatchObject({ hole: 1, shotNumber: 1, club: 'Driver' });
        expect(fired).toHaveBeenCalled();
        document.removeEventListener('play-shot-defaults', fired);
        document.body.classList.remove('active-wizard-mode');
    });
});
