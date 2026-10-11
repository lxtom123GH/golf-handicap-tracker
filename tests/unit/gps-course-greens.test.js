// A4 (simplify 2026-10-07): GPS reads each course's own greens. Keperra's
// fixed table is Keperra's only - Ashgrove/Redcliffe/Virginia used to read it
// for physical holes 1-18 and came out 3-5 km off.
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fromFrame } from '../../src/geo.js';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../../src/ui.js', () => ({ UI: { ocTeeSelect: { value: 'Blue (Men)' } } }));
vi.mock('../../src/modules/card-render.js', () => ({ updateLiveLeaderboard: vi.fn(), renderDetailedReview: vi.fn(), renderBagButtons: vi.fn(), renderHoleJumper: vi.fn() }));
vi.mock('../../src/modules/score-input.js', () => ({ startNewShotInput: vi.fn(), loadExistingShotData: vi.fn(), syncShotWizardUI: vi.fn(), setWizardActive: vi.fn(), saveShotData: vi.fn(), deleteShotData: vi.fn(), showToast: vi.fn(), refreshTrackButtonLabel: vi.fn() }));
vi.mock('../../src/modules/event-binders.js', () => ({ bindAddPlayer: vi.fn(), bindCompQuickAdd: vi.fn(), bindSetupToggles: vi.fn(), bindCourseSelect: vi.fn(), bindStartRound: vi.fn(), bindGlobalRoundActions: vi.fn(), bindOcSubNav: vi.fn(), bindShotWizard: vi.fn() }));
vi.mock('../../src/hole-overlay.js', async () => {
    const real = await vi.importActual('../../src/hole-overlay.js');
    return { courseSlugFor: real.courseSlugFor, loadCourseOverlay: vi.fn() };
});

const ashgrove = JSON.parse(readFileSync('public/courses/ashgrove.json', 'utf8'));
const g1 = ashgrove.holes['1'].green;
const centre = [g1.centre.lat, g1.centre.lon];
const player = fromFrame({ origin: centre, bearing: 0 }, [0, -150]); // 150 m short of the centre
let state, UI, update, getDistance, getLastGpsFix, loader, resolveOverlay;
const text = id => document.getElementById(id).textContent;

beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<span id="gps-front"></span><span id="gps-middle"></span><span id="gps-back"></span><span id="gps-distance-mode"></span>';
    ({ AppState: state } = await import('../../src/state.js'));
    ({ UI } = await import('../../src/ui.js'));
    Object.assign(UI, { gpsFront: document.getElementById('gps-front'), gpsMiddle: document.getElementById('gps-middle'), gpsBack: document.getElementById('gps-back') });
    ({ loadCourseOverlay: loader } = await import('../../src/hole-overlay.js'));
    loader.mockReset();
    loader.mockReturnValue(new Promise(resolve => { resolveOverlay = resolve; }));
    ({ updateGPSDistances: update, getDistance, getLastGpsFix } = await import('../../src/oncourse.js'));
    Object.assign(state, { currentRoundCourseName: 'Ashgrove GC', currentRoundTee: 'Blue (Men)', currentHole: 1, gpsAssist: false, currentCoursePars: [] });
});

describe('GPS at a course that is not Keperra (A4)', () => {
    it('shows -- (never Keperra\'s green) until Ashgrove\'s own file loads', () => {
        update(...player, 6);
        expect(text('gps-middle')).toBe('---m');
        expect(loader).toHaveBeenCalledWith('ashgrove');
        // No stale or foreign distance reaches the club strip or a logged shot.
        expect(getLastGpsFix()?.distM ?? null).toBeNull();
    });

    it('reads Ashgrove hole 1\'s green from its course file: 150 m, not kilometres', async () => {
        update(...player, 6);
        resolveOverlay(ashgrove);
        await new Promise(r => setTimeout(r, 0));
        update(...player, 6);
        expect(text('gps-middle')).toBe('150m');
        expect(text('gps-front')).toBe(`${Math.round(getDistance(...player, g1.front.lat, g1.front.lon))}m`);
        expect(text('gps-back')).toBe(`${Math.round(getDistance(...player, g1.back.lat, g1.back.lon))}m`);
        expect(getLastGpsFix().distM).toBe(150);
    });

    it('re-aims the live fix the moment the course file lands, without waiting for the next fix', async () => {
        let success;
        vi.stubGlobal('navigator', { geolocation: { watchPosition: s => { success = s; return 7; }, clearWatch: vi.fn() } });
        const { resumeGpsIfWasOn, endRoundCleanup } = await import('../../src/oncourse.js');
        localStorage.setItem('golf.gpsOn', '1');
        try {
            resumeGpsIfWasOn();
            success({ coords: { latitude: player[0], longitude: player[1], accuracy: 6, speed: null }, timestamp: Date.now() });
            expect(text('gps-middle')).toBe('---m');
            resolveOverlay(ashgrove);
            await new Promise(r => setTimeout(r, 0));
            expect(text('gps-middle')).toBe('150m');
        } finally {
            document.body.insertAdjacentHTML('beforeend', '<div id="oncourse-setup"></div>');
            endRoundCleanup();
            localStorage.removeItem('golf.gpsOn');
            vi.unstubAllGlobals();
        }
    });

    it('fixes that arrive before the course file still warm the receiver (no stuck "GPS warming")', async () => {
        document.body.insertAdjacentHTML('beforeend', '<span id="oc-strip-gps" class="hidden"></span>');
        window.dispatchEvent(new Event('pageshow')); // a resume: the receiver starts cold
        update(...player, 6);
        update(...player, 6);
        resolveOverlay(ashgrove);
        await new Promise(r => setTimeout(r, 0));
        update(...player, 6, null, null, false);
        expect(text('oc-strip-gps')).toBe('150m · ±6');
    });

    it('a course with no map (Bulimba) shows -- rather than Keperra\'s hole 1', () => {
        state.currentRoundCourseName = 'Bulimba Course';
        update(...player, 6);
        expect(text('gps-middle')).toBe('---m');
        expect(getLastGpsFix()?.distM ?? null).toBeNull();
    });
});

describe('course file download (A4 review P2)', () => {
    it('a failed fetch is not cached: the next call downloads again', async () => {
        const { loadCourseOverlay } = await vi.importActual('../../src/hole-overlay.js');
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValue({ ok: true, json: async () => ashgrove });
        vi.stubGlobal('fetch', fetchMock);
        try {
            expect(await loadCourseOverlay('redcliffe')).toBeNull();
            expect(await loadCourseOverlay('redcliffe')).toBeNull();
            expect(await loadCourseOverlay('redcliffe')).toBe(ashgrove);
            expect(await loadCourseOverlay('redcliffe')).toBe(ashgrove);
            expect(fetchMock).toHaveBeenCalledTimes(3); // the good one is kept
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('no green for the new hole: the strip drops the previous number', () => {
        document.body.insertAdjacentHTML('beforeend', '<span id="oc-strip-gps" class="gps-acc-good">142m · ±6</span>');
        update(...player, 6);
        expect(text('oc-strip-gps')).toBe('--');
        expect(document.getElementById('oc-strip-gps').className).toBe('');
    });
});
