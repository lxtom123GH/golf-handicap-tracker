// Decision 12 (simplify 2026-10-07): GPS starts with the round on a mapped
// course; keep-awake remembers the last choice; the keep-awake nag toast goes.
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ toast: null }));
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../../src/ui.js', () => ({ UI: { ocTeeSelect: { value: 'Blue (Men)' } } }));
vi.mock('../../src/modules/card-render.js', () => ({ updateLiveLeaderboard: vi.fn(), renderDetailedReview: vi.fn(), renderBagButtons: vi.fn(), renderHoleJumper: vi.fn() }));
vi.mock('../../src/modules/score-input.js', () => ({ startNewShotInput: vi.fn(), loadExistingShotData: vi.fn(), syncShotWizardUI: vi.fn(), setWizardActive: vi.fn(), saveShotData: vi.fn(), deleteShotData: vi.fn(), showToast: (...a) => h.toast(...a), refreshTrackButtonLabel: vi.fn() }));
vi.mock('../../src/modules/event-binders.js', () => ({ bindAddPlayer: vi.fn(), bindCompQuickAdd: vi.fn(), bindSetupToggles: vi.fn(), bindCourseSelect: vi.fn(), bindStartRound: vi.fn(), bindGlobalRoundActions: vi.fn(), bindOcSubNav: vi.fn(), bindShotWizard: vi.fn() }));

let oc, watchPosition, clearWatch, fail, log;
beforeEach(async () => {
    vi.resetModules();
    h.toast = vi.fn();
    document.body.innerHTML = '<div id="oncourse-setup"></div>';
    watchPosition = vi.fn((s, f) => { fail = f; return 7; });
    clearWatch = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch }, wakeLock: { request: vi.fn() } });
    log = vi.spyOn(console, 'error').mockImplementation(() => {});
    oc = await import('../../src/oncourse.js');
});
afterEach(() => {
    oc.endRoundCleanup();
    localStorage.removeItem('golf.gpsOn');
    vi.unstubAllGlobals();
    log.mockRestore();
});

describe('GPS starts with the round on a mapped course', () => {
    it.each(['Keperra – West Course (9 holes)', 'Ashgrove GC', 'Redcliffe GC', 'Virginia GC - Championship (1-18)'])('%s: on', name => {
        expect(oc.startGpsForRound(name)).toBe(true);
        expect(watchPosition).toHaveBeenCalledTimes(1);
        expect(oc.isGpsWatchActive()).toBe(true);
        expect(localStorage.getItem('golf.gpsOn')).toBe('1'); // a reload resumes it
    });

    it.each(['Bulimba Course', 'McLeod GC', 'Custom Course', ''])('%s (no map): stays off', name => {
        expect(oc.startGpsForRound(name)).toBe(false);
        expect(watchPosition).not.toHaveBeenCalled();
    });

    it('never switches a running watch off', () => {
        oc.startGpsForRound('Ashgrove GC');
        expect(oc.startGpsForRound('Ashgrove GC')).toBe(false);
        expect(clearWatch).not.toHaveBeenCalled();
        expect(oc.isGpsWatchActive()).toBe(true);
    });

    it('a golfer who refused location gets no toast, and it is not retried on reload', () => {
        oc.startGpsForRound('Ashgrove GC');
        fail({ code: 1 });
        expect(h.toast).not.toHaveBeenCalled();
        expect(oc.isGpsWatchActive()).toBe(false);
        expect(localStorage.getItem('golf.gpsOn')).toBeNull();
    });
    it.each([2, 3])('a cold start (error %s before any fix) keeps trying quietly', code => {
        oc.startGpsForRound('Ashgrove GC');
        fail({ code });
        expect(h.toast).not.toHaveBeenCalled();
        expect(oc.isGpsWatchActive()).toBe(true);
        expect(clearWatch).not.toHaveBeenCalled();
    });

    it('a GPS started by hand still reports its errors', () => {
        localStorage.setItem('golf.gpsOn', '1');
        oc.resumeGpsIfWasOn();
        fail({ code: 3 });
        expect(h.toast).toHaveBeenCalledWith('GPS Error');
    });
});

describe('the keep-awake nag toast is gone', () => {
    it('loading a hole with keep-awake off shows no toast', () => {
        document.body.insertAdjacentHTML('beforeend', '<button class="wakelock-toggle"></button>');
        try { oc.loadHole(); } catch { /* hub DOM absent in this fixture */ }
        expect(h.toast).not.toHaveBeenCalledWith(expect.stringMatching(/awake/i));
        expect(oc.notifyWakeLockOnRoundStart).toBeUndefined();
    });
});
