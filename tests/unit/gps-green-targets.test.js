import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { COURSE_DATA, KEPERRA_GPS } from '../../src/course-data.js';
import { fromFrame, pointInRing } from '../../src/geo.js';
import { greenTargetsFromPlayer } from '../../src/green-targets.js';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../../src/ui.js', () => ({ UI: { ocTeeSelect: { value: 'Blue (Men)' } } }));
vi.mock('../../src/modules/card-render.js', () => ({ updateLiveLeaderboard: vi.fn(), renderDetailedReview: vi.fn(), renderBagButtons: vi.fn(), renderHoleJumper: vi.fn() }));
vi.mock('../../src/modules/score-input.js', () => ({ startNewShotInput: vi.fn(), loadExistingShotData: vi.fn(), syncShotWizardUI: vi.fn(), setWizardActive: vi.fn(), saveShotData: vi.fn(), deleteShotData: vi.fn(), showToast: vi.fn(), refreshTrackButtonLabel: vi.fn() }));
vi.mock('../../src/modules/event-binders.js', () => ({ bindAddPlayer: vi.fn(), bindCompQuickAdd: vi.fn(), bindSetupToggles: vi.fn(), bindCourseSelect: vi.fn(), bindStartRound: vi.fn(), bindGlobalRoundActions: vi.fn(), bindOcSubNav: vi.fn(), bindShotWizard: vi.fn() }));
vi.mock('../../src/hole-overlay.js', () => ({ courseSlugFor: () => 'keperra', loadCourseOverlay: vi.fn() }));

const courseName = 'Keperra – West Course (9 holes)';
const overlay = JSON.parse(readFileSync('public/courses/keperra.json', 'utf8'));
const hole = overlay.holes['19'];
const centre = [hole.green.centre.lat, hole.green.centre.lon];
const player = fromFrame({ origin: centre, bearing: 0 }, [80, -60]);
let state, UI, update, getDistance, loader, resolveOverlay;
const text = id => document.getElementById(id).textContent;

beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<span id="gps-front"></span><span id="gps-middle"></span><span id="gps-back"></span><span id="gps-distance-mode"></span>';
    ({ AppState: state } = await import('../../src/state.js'));
    ({ UI } = await import('../../src/ui.js'));
    Object.assign(UI, { gpsFront: document.getElementById('gps-front'), gpsMiddle: document.getElementById('gps-middle'), gpsBack: document.getElementById('gps-back') });
    ({ loadCourseOverlay: loader } = await import('../../src/hole-overlay.js'));
    loader.mockReturnValue(new Promise(resolve => { resolveOverlay = resolve; }));
    ({ updateGPSDistances: update, getDistance } = await import('../../src/oncourse.js'));
    Object.assign(state, { currentRoundCourseName: courseName, currentRoundTee: 'Blue (Men)', currentHole: 1, gpsAssist: false });
});

describe('live GPS green targets', () => {
    it('uses fixed points immediately while the polygon load is pending, even with assist off', () => {
        update(...player, 6);
        const k = KEPERRA_GPS[19];
        expect(text('gps-front')).toBe(`${Math.round(getDistance(...player, k[2], k[3]))}m`);
        expect(text('gps-back')).toBe(`${Math.round(getDistance(...player, k[4], k[5]))}m`);
        expect(text('gps-distance-mode')).toBe('fixed');
        expect(loader).toHaveBeenCalledWith('keperra');
    });

    it('switches to player-relative edges on physical hole 19, keeping the same middle', async () => {
        update(...player, 6);
        const middle = text('gps-middle');
        resolveOverlay(overlay);
        await Promise.resolve();
        update(...player, 6);
        const k = KEPERRA_GPS[19];
        const got = greenTargetsFromPlayer(player, [k[0], k[1]], hole.features, {});
        expect(got.mode).toBe('from you');
        expect(text('gps-front')).toBe(`${Math.round(getDistance(...player, ...got.front))}m`);
        expect(text('gps-back')).toBe(`${Math.round(getDistance(...player, ...got.back))}m`);
        expect(text('gps-middle')).toBe(middle);
        expect(text('gps-distance-mode')).toBe('from you');
        expect(COURSE_DATA[courseName]['Blue (Men)'].physicalHoles[0]).toBe(19);
    });

    it('physical hole 19 at the test position: fixed 98/101 m becomes 91/110 m, hard-coded', async () => {
        update(...player, 6);
        expect([text('gps-front'), text('gps-middle'), text('gps-back')]).toEqual(['98m', '100m', '101m']);
        resolveOverlay(overlay);
        await Promise.resolve();
        update(...player, 6);
        expect([text('gps-front'), text('gps-middle'), text('gps-back')]).toEqual(['91m', '100m', '110m']);

        // Independent of greenTargetsFromPlayer: walk the player→centre ray in
        // 5 cm steps and take the first/last points inside the traced ring.
        const ring = hole.features.features.find(f => f.properties.golf === 'green').geometry.coordinates[0]
            .map(([lon, lat]) => [lat, lon]);
        const inside = [];
        for (let t = 0; t <= 2; t += 0.0005) {
            const ll = fromFrame({ origin: centre, bearing: 0 }, [80 * (1 - t), -60 * (1 - t)]);
            if (pointInRing(ll, ring)) inside.push(getDistance(...player, ...ll));
        }
        expect(Math.round(inside[0])).toBe(91);
        expect(Math.round(inside[inside.length - 1])).toBe(110);
    });

    it('a hole change with the watcher off does not replay the stale fix onto the new hole', async () => {
        const { loadHole, getLastGpsFix, isGpsWatchActive } = await import('../../src/oncourse.js');
        update(...player, 6);
        const before = { ...getLastGpsFix() };
        const middle = text('gps-middle');
        expect(isGpsWatchActive()).toBe(false);
        state.currentHole = 2;
        try { loadHole(); } catch { /* unrelated hub DOM absent in this fixture */ }
        expect(getLastGpsFix().distM).toBe(before.distM);
        expect(text('gps-middle')).toBe(middle);
    });

    it('a failed or offline polygon load backs off instead of refiring per fix, then recovers', async () => {
        const flush = () => new Promise(resolve => setTimeout(resolve, 0));
        let now = 1_000_000;
        const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        loader.mockReset();
        loader.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null).mockResolvedValue(overlay);
        try {
            for (let i = 0; i < 3; i++) { update(...player, 6); await flush(); }
            expect(loader).toHaveBeenCalledTimes(1); // rejected: no refire on each ~1 s fix
            now += 31_000;
            for (let i = 0; i < 3; i++) { update(...player, 6); await flush(); }
            expect(loader).toHaveBeenCalledTimes(2); // resolved null (offline): not cached for good
            now += 31_000;
            update(...player, 6); await flush();
            update(...player, 6);
            expect(loader).toHaveBeenCalledTimes(3);
            expect(text('gps-distance-mode')).toBe('from you');
        } finally {
            clock.mockRestore();
            warn.mockRestore();
        }
    });

    it('decision 14: a stale Surveyor pin left in memory no longer moves the green', async () => {
        state.surveyData = { 1: { override: { lat: centre[0] + 0.01, lng: centre[1] } } }; // ~1.1 km away
        update(...player, 6);
        const k = KEPERRA_GPS[19];
        expect(text('gps-middle')).toBe(`${Math.round(getDistance(...player, k[0], k[1]))}m`);
    });

    it('publishes the same fix to the big view and uses the saved West tee after resume', async () => {
        document.body.insertAdjacentHTML('beforeend', '<button id="btn-big-numbers"></button><div id="big-numbers-view" class="hidden" tabindex="-1"><span id="big-hole"></span><span id="big-front"></span><span id="big-middle"></span><span id="big-back"></span></div>');
        const { initBigNumbersView } = await import('../../src/big-numbers.js');
        initBigNumbersView();
        state.currentCoursePars = [4, 5, 4, 4, 3, 4, 5, 3, 4];
        UI.ocTeeSelect.value = '';
        update(...player, 6);
        expect(document.getElementById('big-hole').textContent).toBe('Hole 19 · Par 4');
        for (const key of ['front', 'middle', 'back']) {
            expect(document.getElementById(`big-${key}`).textContent).toBe(text(`gps-${key}`).replace('m', ''));
        }
        state.currentHole = 2;
        update(...player, 6);
        expect(document.getElementById('big-hole').textContent).toBe('Hole 20 · Par 5');
    });
});

describe('GPS preference after geolocation errors', () => {
    it.each([2, 3])('retains GPS on after error %s and resumes on reload', async code => {
        const { resumeGpsIfWasOn, isGpsWatchActive, endRoundCleanup } = await import('../../src/oncourse.js');
        let error;
        const watchPosition = vi.fn((success, failure) => { error = failure; return 42; });
        const clearWatch = vi.fn();
        vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            localStorage.setItem('golf.gpsOn', '1');
            resumeGpsIfWasOn();
            error({ code }); // no recent fix: slow first fix / unavailable position
            expect(clearWatch).toHaveBeenCalledWith(42);
            expect(isGpsWatchActive()).toBe(false);
            expect(localStorage.getItem('golf.gpsOn')).toBe('1');
            resumeGpsIfWasOn();
            expect(watchPosition).toHaveBeenCalledTimes(2);
            document.body.insertAdjacentHTML('beforeend', '<div id="oncourse-setup"></div>');
            endRoundCleanup();
            expect(localStorage.getItem('golf.gpsOn')).toBeNull();
            expect(isGpsWatchActive()).toBe(false);
        } finally {
            localStorage.removeItem('golf.gpsOn');
            vi.unstubAllGlobals();
            log.mockRestore();
        }
    });

    it('a GPS restart is cold again: no fix is called good until two arrive (C27 review P3)', async () => {
        const { resumeGpsIfWasOn, endRoundCleanup } = await import('../../src/oncourse.js');
        document.body.insertAdjacentHTML('beforeend', '<span id="oc-strip-gps"></span><div id="oncourse-setup"></div>');
        let success, error;
        vi.stubGlobal('navigator', { geolocation: { watchPosition: (s, f) => { success = s; error = f; return 42; }, clearWatch: vi.fn() } });
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fix = (n) => success({ coords: { latitude: player[0] + n * 1e-6, longitude: player[1], accuracy: 6, speed: null }, timestamp: Date.now() });
        try {
            localStorage.setItem('golf.gpsOn', '1');
            resumeGpsIfWasOn();
            fix(1); fix(2);
            expect(text('oc-strip-gps')).toMatch(/^\d+m · ±6$/); // warm
            error({ code: 3 }); // watcher stops, the on-choice is kept
            resumeGpsIfWasOn(); // ...and restarts
            fix(3);
            expect(text('oc-strip-gps')).toBe('GPS warming');
            fix(4);
            expect(text('oc-strip-gps')).toMatch(/^\d+m · ±6$/);
        } finally {
            endRoundCleanup();
            localStorage.removeItem('golf.gpsOn');
            vi.unstubAllGlobals();
            log.mockRestore();
        }
    });

    it('the 📡 chip says it is locating from start until the first fix', async () => {
        const { resumeGpsIfWasOn, endRoundCleanup } = await import('../../src/oncourse.js');
        document.body.insertAdjacentHTML('beforeend', '<button id="btn-play-gps" aria-label="Start GPS"></button><div id="oncourse-setup"></div>');
        let success;
        vi.stubGlobal('navigator', { geolocation: { watchPosition: s => { success = s; return 42; }, clearWatch: vi.fn() } });
        const chip = document.getElementById('btn-play-gps');
        try {
            localStorage.setItem('golf.gpsOn', '1');
            resumeGpsIfWasOn();
            expect(chip.classList.contains('is-locating')).toBe(true);
            expect(chip.getAttribute('aria-busy')).toBe('true');
            success({ coords: { latitude: player[0], longitude: player[1], accuracy: 6, speed: null }, timestamp: Date.now() });
            expect(chip.classList.contains('is-locating')).toBe(false);
            expect(chip.getAttribute('aria-label')).toBe('Start GPS');
        } finally {
            endRoundCleanup();
            localStorage.removeItem('golf.gpsOn');
            vi.unstubAllGlobals();
        }
    });

    it('forgets GPS on when permission is denied', async () => {
        const { resumeGpsIfWasOn } = await import('../../src/oncourse.js');
        let error;
        vi.stubGlobal('navigator', { geolocation: {
            watchPosition: (success, failure) => { error = failure; return 42; }, clearWatch: vi.fn(),
        } });
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            localStorage.setItem('golf.gpsOn', '1');
            resumeGpsIfWasOn();
            error({ code: 1 });
            expect(localStorage.getItem('golf.gpsOn')).toBeNull();
        } finally {
            vi.unstubAllGlobals();
            log.mockRestore();
        }
    });
});
