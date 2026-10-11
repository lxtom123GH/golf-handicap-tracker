// Owner 2026-10-05: Play again card, remembered defaults and GPS course pick
// (src/modules/quick-start.js) driven over a small copy of the setup form.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
    AppState: {},
    UI: {},
    overlay: null,
}));

vi.mock('../../src/state.js', () => ({ AppState: h.AppState, mutateList: vi.fn() }));
vi.mock('../../src/ui.js', () => ({ UI: h.UI }));
vi.mock('../../src/dates.js', () => ({ localToday: () => '2026-10-06' }));
vi.mock('../../src/modules/event-binders.js', () => ({
    runStartRound: (...a) => h.start(...a),
    isStartRoundInFlight: () => h.inFlight === true,
}));
vi.mock('../../src/hole-overlay.js', () => ({
    courseSlugFor: (n) => ['keperra', 'ashgrove'].find(s => String(n || '').toLowerCase().includes(s)) || null,
    loadCourseOverlay: vi.fn(async (slug) => (slug === 'keperra' ? h.overlay : null)),
}));

import { COURSE_DATA } from '../../src/course-data.js';
import { recordSetup, lastSetupKey } from '../../src/last-setup.js';

const OLD18 = 'Keperra - Old (1-18)';
const WEST9 = 'Keperra – West Course (9 holes)';

function buildForm() {
    document.body.className = '';
    document.body.innerHTML = `
      <div id="oncourse-setup">
        <div id="oc-quick-start" class="hidden">
          <span id="oc-quick-start-here" class="hidden"></span>
          <div id="oc-quick-start-course"></div><div id="oc-quick-start-details"></div><div id="oc-quick-start-players"></div>
          <button id="btn-oc-play-again">Start this round</button>
        </div>
        <button id="btn-mode-simple" class="active">Simple</button><button id="btn-mode-detailed">Detailed</button>
        <button id="btn-round-9" class="active">9</button><button id="btn-round-18">18</button>
        <input type="date" id="oc-round-date" value="2026-01-01">
        <select id="oc-course-select">
          <option value="">-- Select Course --</option>
          <option value="Keperra – Old Course (9 holes)">Keperra – Old Course (9 holes)</option>
          <option value="${WEST9}">${WEST9}</option>
          <option value="${OLD18}">Keperra – Old + North (Par 72)</option>
          <option value="Ashgrove GC">Ashgrove GC</option>
          <option value="Custom Course">Custom Course…</option>
        </select>
        <p id="oc-course-gps-note" class="hidden"></p>
        <select id="oc-tee-select"><option value="">-- Select Course First --</option></select>
        <input id="oc-dh-override" value="7">
        <select id="oc-player-select">
          <option value="me">Alex</option>
          <option value="friend1">Jo</option>
          <optgroup label="Your guests" data-guests="1"><option value="guest_sam" data-hc="18">Sam (guest)</option></optgroup>
        </select>
        <select id="oc-side-game"><option value="">none</option><option value="skins">Skins</option></select>
        <select id="oc-link-comp"><option value="">none</option><option value="c1">Comp</option></select>
        <button id="btn-oc-start">Start Round</button>
      </div>`;
    const $ = (id) => document.getElementById(id);
    Object.assign(h.UI, {
        btnModeSimple: $('btn-mode-simple'), btnModeDetailed: $('btn-mode-detailed'),
        btnRound9: $('btn-round-9'), btnRound18: $('btn-round-18'),
        ocCourseSelect: $('oc-course-select'), ocTeeSelect: $('oc-tee-select'),
        ocPlayerSelect: $('oc-player-select'), ocLinkComp: $('oc-link-comp'), btnOcStart: $('btn-oc-start'),
    });
    // Stand-ins for the real binders (event-binders.js): toggles set state,
    // a course change refills the tees synchronously.
    h.UI.btnModeSimple.addEventListener('click', () => { h.AppState.currentTrackingMode = 'simple'; });
    h.UI.btnModeDetailed.addEventListener('click', () => { h.AppState.currentTrackingMode = 'detailed'; });
    h.UI.btnRound9.addEventListener('click', () => { h.AppState.currentRoundHoles = 9; });
    h.UI.btnRound18.addEventListener('click', () => { h.AppState.currentRoundHoles = 18; });
    h.UI.ocCourseSelect.addEventListener('change', () => {
        const tees = COURSE_DATA[h.UI.ocCourseSelect.value] || {};
        h.UI.ocTeeSelect.innerHTML = Object.keys(tees).map(t => `<option value="${t}">${t}</option>`).join('');
    });
    h.start = vi.fn(async () => {});
}

const setGeo = ({ state = 'granted', fix = null } = {}) => {
    const getCurrentPosition = vi.fn((ok, err) => (fix ? ok({ coords: { latitude: fix[0], longitude: fix[1], accuracy: 20 } }) : err(new Error('no fix'))));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: vi.fn(async () => ({ state })) } });
    return getCurrentPosition;
};

const settle = () => new Promise(r => setTimeout(r, 0));

async function freshModule() {
    vi.resetModules();
    return import('../../src/modules/quick-start.js');
}

beforeEach(() => {
    for (const k of Object.keys(h.AppState)) delete h.AppState[k];
    Object.assign(h.AppState, {
        currentUser: { uid: 'me', displayName: 'Alex' }, activeRoundId: null,
        currentTrackingMode: 'simple', currentRoundHoles: 9, liveRoundGroups: [], roundSelfOptOut: false,
    });
    for (const k of Object.keys(h.UI)) delete h.UI[k];
    localStorage.clear();
    h.overlay = {
        name: 'Keperra Country Golf Club',
        holes: {
            1: { tee: { lat: -27.4092, lon: 152.9485 } },
            10: { tee: { lat: -27.4112, lon: 152.9524 } },
            19: { tee: { lat: -27.4079, lon: 152.9524 } },
        },
    };
    buildForm();
    setGeo({ state: 'prompt' });
});

afterEach(() => { vi.restoreAllMocks(); });

const remember = (over = {}) => recordSetup(localStorage, 'me', {
    course: OLD18, tee: 'Blue (Men)', holes: 18, mode: 'detailed',
    players: [{ uid: 'guest_sam', name: 'Sam', isGuest: true }], selfIncluded: true, ...over,
}, 1000);

describe('Play again card', () => {
    it('shows the last setup in plain words once the player list is ready', async () => {
        remember();
        const m = await freshModule();
        m.initQuickStart();
        expect(document.getElementById('oc-quick-start').classList.contains('hidden')).toBe(true);
        h.UI.ocPlayerSelect.dataset.ready = '1';
        document.dispatchEvent(new CustomEvent('oc-players-ready'));
        expect(document.getElementById('oc-quick-start').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('oc-quick-start-course').textContent).toBe('Keperra – Old + North (Par 72)');
        expect(document.getElementById('oc-quick-start-details').textContent).toBe('Blue (Men) tees · 18 holes · Detailed');
        expect(document.getElementById('oc-quick-start-players').textContent).toBe('Players: You, Sam (guest)');
    });

    it('one tap starts the same setup: course, tee, 18, Detailed, you + the saved guest, today, fresh handicap', async () => {
        remember();
        h.UI.ocPlayerSelect.dataset.ready = '1';
        h.UI.ocLinkComp.value = 'c1';
        document.getElementById('oc-side-game').value = 'skins';
        const m = await freshModule();
        m.initQuickStart();
        document.getElementById('btn-oc-play-again').click();
        await settle();
        expect(h.start).toHaveBeenCalledTimes(1);
        expect(h.UI.ocCourseSelect.value).toBe(OLD18);
        expect(h.UI.ocTeeSelect.value).toBe('Blue (Men)');
        expect(h.AppState.currentRoundHoles).toBe(18);
        expect(h.AppState.currentTrackingMode).toBe('detailed');
        expect(h.AppState.roundSelfOptOut).toBe(false);
        expect(h.AppState.liveRoundGroups.map(p => p.uid)).toEqual(['me', 'guest_sam']);
        expect(h.AppState.liveRoundGroups[1]).toMatchObject({ isGuest: true, dailyHandicapOverride: 18, scores: {} });
        expect(document.getElementById('oc-round-date').value).toBe('2026-10-06');
        expect(document.getElementById('oc-dh-override').value).toBe('');
        expect(document.getElementById('oc-side-game').value).toBe('');
        expect(h.UI.ocLinkComp.value).toBe('');
    });

    it('drops a guest who has since been deleted', async () => {
        remember();
        document.querySelector('option[value="guest_sam"]').remove();
        h.UI.ocPlayerSelect.dataset.ready = '1';
        const m = await freshModule();
        m.initQuickStart();
        expect(document.getElementById('oc-quick-start-players').textContent).toBe('Players: Just you');
        document.getElementById('btn-oc-play-again').click();
        await settle();
        expect(h.AppState.liveRoundGroups.map(p => p.uid)).toEqual(['me']);
    });

    it('falls back silently to the normal form when the remembered course is gone', async () => {
        remember({ course: 'Old Closed GC' });
        h.UI.ocPlayerSelect.dataset.ready = '1';
        const m = await freshModule();
        m.initQuickStart();
        expect(document.getElementById('oc-quick-start').classList.contains('hidden')).toBe(true);
        expect(h.UI.ocCourseSelect.value).toBe('');
    });

    it('stays hidden during a round', async () => {
        remember();
        h.UI.ocPlayerSelect.dataset.ready = '1';
        h.AppState.activeRoundId = 'round_1';
        const m = await freshModule();
        m.initQuickStart();
        expect(document.getElementById('oc-quick-start').classList.contains('hidden')).toBe(true);
    });
});

describe('Play again: one start at a time', () => {
    it('does nothing while a Start Round is already resolving (no mixed course/roster)', async () => {
        remember();
        h.UI.ocPlayerSelect.dataset.ready = '1';
        const m = await freshModule();
        m.initQuickStart();
        h.UI.ocCourseSelect.value = 'Ashgrove GC';
        h.AppState.liveRoundGroups = [{ uid: 'me' }];
        h.inFlight = true;
        document.getElementById('btn-oc-play-again').click();
        await settle();
        h.inFlight = false;
        expect(h.start).not.toHaveBeenCalled();
        expect(h.UI.ocCourseSelect.value).toBe('Ashgrove GC');
        expect(h.AppState.liveRoundGroups).toEqual([{ uid: 'me' }]);
    });

    it('stays locked until the start settles, so a double tap starts once', async () => {
        remember();
        h.UI.ocPlayerSelect.dataset.ready = '1';
        let finish;
        h.start = vi.fn(() => new Promise(r => { finish = r; }));
        const m = await freshModule();
        m.initQuickStart();
        const btn = document.getElementById('btn-oc-play-again');
        btn.click();
        await settle();
        expect(btn.disabled).toBe(true);
        btn.click();
        await settle();
        expect(h.start).toHaveBeenCalledTimes(1);
        finish();
        await settle();
        expect(btn.disabled).toBe(false);
    });
});

describe('remembered defaults', () => {
    it('applies once the player list is ready when it needs it (you sat out, a friend played)', async () => {
        remember({ course: WEST9, tee: 'White (Men)', holes: 9, players: [{ uid: 'friend1', name: 'Jo' }], selfIncluded: false });
        const opts = h.UI.ocPlayerSelect.innerHTML;
        h.UI.ocPlayerSelect.innerHTML = ''; // still loading from Firestore
        const m = await freshModule();
        m.initQuickStart();
        expect(h.UI.ocCourseSelect.value).toBe('');
        h.UI.ocPlayerSelect.innerHTML = opts;
        h.UI.ocPlayerSelect.dataset.ready = '1';
        document.dispatchEvent(new CustomEvent('oc-players-ready'));
        expect(h.UI.ocCourseSelect.value).toBe(WEST9);
        expect(h.UI.ocTeeSelect.value).toBe('White (Men)');
        expect(document.getElementById('oc-quick-start-players').textContent).toBe('Players: Jo');
    });

    it('does not re-apply on a late player list once the player has chosen', async () => {
        remember();
        const m = await freshModule();
        m.initQuickStart();
        h.UI.ocCourseSelect.value = 'Ashgrove GC';
        h.UI.ocCourseSelect.dispatchEvent(new Event('change'));
        h.UI.ocPlayerSelect.dataset.ready = '1';
        document.dispatchEvent(new CustomEvent('oc-players-ready'));
        expect(h.UI.ocCourseSelect.value).toBe('Ashgrove GC');
    });

    it('opens the form on the last course, tee, length and mode; date is today', async () => {
        remember({ course: WEST9, tee: 'White (Men)', holes: 9, mode: 'detailed' });
        const m = await freshModule();
        m.initQuickStart();
        expect(h.UI.ocCourseSelect.value).toBe(WEST9);
        expect(h.UI.ocTeeSelect.value).toBe('White (Men)');
        expect(h.AppState.currentTrackingMode).toBe('detailed');
        expect(h.AppState.currentRoundHoles).toBe(9);
        expect(document.getElementById('oc-round-date').value).toBe('2026-10-06');
        // Players are not pre-added to the form: that is the card's job.
        expect(h.AppState.liveRoundGroups).toEqual([]);
    });

    it('re-applies after a round ends, unless the player already changed something', async () => {
        remember();
        const m = await freshModule();
        m.initQuickStart();
        // The player picks Ashgrove themselves…
        h.UI.ocCourseSelect.value = 'Ashgrove GC';
        h.UI.ocCourseSelect.dispatchEvent(new Event('change'));
        m.refreshQuickStart({ applyDefaults: true });
        expect(h.UI.ocCourseSelect.value).toBe('Ashgrove GC');
        // …a round later the screen is fresh again.
        document.dispatchEvent(new CustomEvent('oc-setup-reset'));
        expect(h.UI.ocCourseSelect.value).toBe(OLD18);
    });
});

describe('GPS course pick', () => {
    it('never asks for location: no permission, no position request', async () => {
        const gcp = setGeo({ state: 'prompt', fix: [-27.4079, 152.9524] });
        const m = await freshModule();
        await m.gpsPickCourse();
        expect(gcp).not.toHaveBeenCalled();
        expect(h.UI.ocCourseSelect.value).toBe('');
    });

    it('picks the nine whose first tee you are at, and says why', async () => {
        setGeo({ fix: [-27.4080, 152.9523] }); // at the West 1st tee (physical 19)
        const m = await freshModule();
        await m.gpsPickCourse();
        expect(h.UI.ocCourseSelect.value).toBe(WEST9);
        expect(document.getElementById('oc-course-gps-note').textContent).toMatch(/You're at Keperra Country Golf Club/);
        expect(document.getElementById('oc-course-gps-note').classList.contains('hidden')).toBe(false);
    });

    it('offers the Play again card for the club you are at', async () => {
        recordSetup(localStorage, 'me', { course: WEST9, tee: 'Blue (Men)', holes: 9, mode: 'simple', players: [], selfIncluded: true }, 500);
        // Most recent overall is Ashgrove.
        recordSetup(localStorage, 'me', { course: 'Ashgrove GC', tee: 'Blue (Men)', holes: 18, mode: 'detailed', players: [], selfIncluded: true }, 2000);
        h.UI.ocPlayerSelect.dataset.ready = '1';
        setGeo({ fix: [-27.4080, 152.9523] });
        const m = await freshModule();
        m.initQuickStart();
        expect(document.getElementById('oc-quick-start-course').textContent).toBe('Ashgrove GC');
        await settle(); await settle();
        await m.gpsPickCourse();
        expect(document.getElementById('oc-quick-start-course').textContent).toBe(WEST9);
        expect(document.getElementById('oc-quick-start-here').classList.contains('hidden')).toBe(false);
        expect(h.UI.ocCourseSelect.value).toBe(WEST9);
    });

    it('does not override a course the player already picked', async () => {
        setGeo({ fix: [-27.4080, 152.9523] });
        const m = await freshModule();
        m.initQuickStart();
        h.UI.ocCourseSelect.value = 'Ashgrove GC';
        h.UI.ocCourseSelect.dispatchEvent(new Event('change'));
        await m.gpsPickCourse();
        expect(h.UI.ocCourseSelect.value).toBe('Ashgrove GC');
    });

    it('does nothing far from any known course', async () => {
        setGeo({ fix: [-27.5, 153.1] });
        const m = await freshModule();
        await m.gpsPickCourse();
        expect(h.UI.ocCourseSelect.value).toBe('');
        expect(localStorage.getItem(lastSetupKey('me'))).toBeNull();
    });
});
