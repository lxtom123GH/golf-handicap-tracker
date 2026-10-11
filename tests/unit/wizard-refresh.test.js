// @vitest-environment jsdom
// ==========================================
// wizard-refresh.test.js — D31 (simplify 2026-10-07): the shot map mounts
// once per shot; a club tap, "didn't see it" or a GPS lock only repaints.
// ==========================================
// The real score-input over the shipped wizard markup; the overlay is a fake
// controller so every mount (and destroy) is counted.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({ mounts: [], fixListeners: [], gpsOn: false, lastFix: null }));

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
    doc: vi.fn(() => ({ id: 'x' })), getDoc: vi.fn(async () => ({ exists: () => false })),
    getDocs: vi.fn(() => new Promise(() => { })),
    setDoc: vi.fn(() => new Promise(() => { })), updateDoc: vi.fn(() => new Promise(() => { })),
    deleteDoc: vi.fn(() => new Promise(() => { })),
}));
vi.mock('../../src/ui.js', () => ({ UI: { btnWizardDelete: null } }));
vi.mock('../../src/oncourse.js', () => ({
    loadHole: vi.fn(), collectGpsBiasSample: vi.fn(async () => { }),
    getLastGpsFix: () => h.lastFix,
    isGpsWatchActive: () => h.gpsOn,
    onGpsFix: (cb) => { h.fixListeners.push(cb); return () => { h.fixListeners = h.fixListeners.filter(f => f !== cb); }; },
}));
vi.mock('../../src/course-data.js', () => ({ COURSE_DATA: {} }));
vi.mock('../../src/modules/card-render.js', () => ({ renderBagButtons: vi.fn(), shortClubLabel: vi.fn((c) => c) }));
vi.mock('../../src/hole-overlay.js', () => ({
    courseSlugFor: () => 'keperra',
    loadCourseOverlay: vi.fn(async () => ({ holes: { 1: { tee: { lat: -27.4, lon: 153 }, green: { centre: { lat: -27.398, lon: 153 } } } } })),
    curveCarryM: () => null,
    mountHoleOverlay: vi.fn((canvas, hole, opts) => {
        const ctl = {
            opts, destroyed: false, frame: { origin: [-27.4, 153], bearing: 0 },
            destroy() { this.destroyed = true; },
            setMode() { }, setGhosts() { }, setCurves() { },
            setStartMarker: vi.fn(), refocus: vi.fn(() => true),
        };
        h.mounts.push(ctl);
        return ctl;
    }),
}));

import { AppState } from '../../src/state.js';
import { startNewShotInput, refreshShotWizard } from '../../src/modules/score-input.js';

const HTML = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const BINDERS = fs.readFileSync(path.resolve(__dirname, '../../src/modules/event-binders.js'), 'utf8');
const live = () => h.mounts.filter(m => !m.destroyed);
const mounted = () => vi.waitFor(() => { if (!h.mounts.length) throw new Error('not mounted'); });
const quiet = () => new Promise(r => setTimeout(r, 30));

beforeEach(() => {
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    document.body.innerHTML = doc.getElementById('oncourse-wizard').outerHTML;
    h.mounts.length = 0;
    h.fixListeners = [];
    h.gpsOn = false;
    h.lastFix = null;
    AppState.currentUser = { uid: 'u1' };
    AppState.currentRoundCourseName = 'Keperra';
    AppState.currentCoursePars = [4, 4, 4];
    AppState.currentHole = 1;
    AppState.currentHoleShots = [];
    AppState.liveRoundGroups = [{ uid: 'u1', scores: { 1: 0 }, simpleStats: {} }];
    AppState.activeRoundId = 'r1';
});

describe('D31: an open shot repaints without re-mounting its map', () => {
    it('refreshShotWizard paints the open shot and never mounts', async () => {
        startNewShotInput(1);
        await mounted();
        await quiet();
        expect(h.mounts).toHaveLength(1);
        AppState.currentShotData.club = '7 Iron';
        refreshShotWizard();
        await quiet();
        expect(h.mounts).toHaveLength(1);
        expect(live()).toHaveLength(1);
    });

    it('the club tap and "didn\'t see it" handlers call the cheap refresh, not the mount', () => {
        expect(BINDERS).not.toMatch(/syncShotWizardUI\(\)/);
        expect((BINDERS.match(/refreshShotWizard\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    it('"didn\'t see it" with Actual on puts swipes back on the intended line', async () => {
        startNewShotInput(1);
        await mounted();
        document.querySelector('#section-line [data-line-mode="actual"]').click();
        AppState.currentShotData.flightUnseen = true;
        refreshShotWizard();
        expect(document.querySelector('#section-line [data-line-mode="intended"]').classList.contains('active-choice')).toBe(true);
    });

    it('a GPS lock moves the marker and re-frames - one map, no re-mount', async () => {
        h.gpsOn = true;
        const at = Date.now();
        h.lastFix = { lat: -27.399, lon: 153, accuracyM: 5, speedMps: 0, at, distM: 120 };
        startNewShotInput(1);
        await mounted();
        await quiet();
        expect(h.mounts).toHaveLength(1);
        const ctl = h.mounts[0];
        // A second good fix: the hold-still capture converges and applies.
        h.fixListeners.forEach(cb => cb({ lat: -27.399, lon: 153, accuracyM: 4, speedMps: 0, at: Date.now() }));
        await quiet();
        expect(AppState.currentShotData.startPos).toBeTruthy();
        expect(ctl.setStartMarker).toHaveBeenCalled();
        expect(ctl.refocus).toHaveBeenCalled();
        expect(h.mounts).toHaveLength(1);
        expect(ctl.destroyed).toBe(false);
    });

    it('two mounts racing leave exactly one live map', async () => {
        startNewShotInput(1);
        startNewShotInput(1);
        await mounted();
        await quiet();
        expect(live()).toHaveLength(1);
    });
});

describe('D31: the real overlay re-frames on a moved start without a re-mount', () => {
    async function mountReal(extra = {}) {
        const real = await vi.importActual('../../src/hole-overlay.js');
        const { makeFrame, fromFrame } = await vi.importActual('../../src/geo.js');
        HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
            get: (_t, k) => (k === 'measureText' ? () => ({ width: 60 }) : () => { }), set: () => true,
        });
        document.body.innerHTML = '<canvas></canvas>';
        const canvas = document.querySelector('canvas');
        canvas.getBoundingClientRect = () => ({ width: 375, height: 400, top: 0, left: 0, right: 375, bottom: 400 });
        const TEE = [-27.4698, 153.0251];
        const G = fromFrame(makeFrame(TEE, fromFrame({ origin: TEE, bearing: 0 }, [0, 420])), [0, 420]);
        const hole = { tee: { lat: TEE[0], lon: TEE[1] }, green: { centre: { lat: G[0], lon: G[1] } } };
        const ctl = real.mountHoleOverlay(canvas, hole, { focus: { startXY: [0, 0], shotNumber: 1 }, startXY: [0, 0], onChange: () => { }, ...extra });
        return { ctl, canvas };
    }

    it('refocus moves the shot view to the new start', async () => {
        const { ctl, canvas } = await mountReal();
        const mpp0 = canvas.dataset.mpp;
        expect(ctl.refocus([0, 250])).toBe(true);
        expect(canvas.dataset.viewMode).toBe('shot');
        // From 250 m out, the view frames a much shorter shot: closer zoom.
        expect(Number(canvas.dataset.mpp)).toBeLessThan(Number(mpp0));
        ctl.destroy();
    });

    it('setStartMarker moves the anchor (data-start) too', async () => {
        const { ctl, canvas } = await mountReal();
        const { fromFrame } = await vi.importActual('../../src/geo.js');
        const [lat, lon] = fromFrame(ctl.frame, [3, 120]);
        ctl.setStartMarker({ lat, lon, quality: 'accepted', draggable: true });
        expect(canvas.dataset.start).toBe('3,120');
        ctl.destroy();
    });

    it('refocus leaves the hole view alone', async () => {
        const { ctl } = await mountReal();
        ctl.setViewMode('hole');
        expect(ctl.refocus([0, 250])).toBe(false);
        ctl.destroy();
    });

    it('review P2: a refocus while zoomed keeps the new frame for the next Reset', async () => {
        const { ctl, canvas } = await mountReal();
        const mpp0 = Number(canvas.dataset.mpp);
        ctl.setViewMode('hole');
        expect(ctl.refocus([0, 250])).toBe(false); // busy: no immediate re-frame
        ctl.setViewMode('shot'); // the Shot chip: frames the NEW start
        expect(Number(canvas.dataset.mpp)).toBeLessThan(mpp0);
        ctl.destroy();
    });
});

describe('D31 review pass 2: refocus with auto-rotate never strands the view', () => {
    it('after a drawn stroke (auto-extended view) the view stays automatic', async () => {
        const real = await vi.importActual('../../src/hole-overlay.js');
        const { makeFrame, fromFrame } = await vi.importActual('../../src/geo.js');
        HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
            get: (_t, k) => (k === 'measureText' ? () => ({ width: 60 }) : () => { }), set: () => true,
        });
        document.body.innerHTML = '<canvas></canvas>';
        const canvas = document.querySelector('canvas');
        canvas.getBoundingClientRect = () => ({ width: 375, height: 400, top: 0, left: 0, right: 375, bottom: 400 });
        canvas.setPointerCapture = () => { };
        const TEE = [-27.4698, 153.0251];
        const G = fromFrame(makeFrame(TEE, fromFrame({ origin: TEE, bearing: 0 }, [0, 420])), [0, 420]);
        const hole = { tee: { lat: TEE[0], lon: TEE[1] }, green: { centre: { lat: G[0], lon: G[1] } } };
        const onChange = vi.fn();
        const ctl = real.mountHoleOverlay(canvas, hole, { focus: { startXY: [0, 0], shotNumber: 1 }, startXY: [0, 0], autoRotate: true, onChange });
        const ptr = (type, x, y) => {
            const e = new Event(type, { bubbles: true, cancelable: true });
            Object.assign(e, { clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: 'touch', isPrimary: true });
            canvas.dispatchEvent(e);
        };
        ptr('pointerdown', 187, 350);
        for (let i = 1; i <= 8; i++) ptr('pointermove', 187 + i * 3, 350 - i * 30);
        ptr('pointerup', 211, 110);
        expect(onChange).toHaveBeenCalled();
        ctl.refocus([30, 200]); // a GPS lock after the stroke, angle changes
        ctl.setViewMode('hole');
        ctl.setViewMode('shot'); // the Shot chip clears the auto-extend frame
        // Still automatic: the next lock re-frames immediately.
        expect(ctl.refocus([30, 210])).toBe(true);
        ctl.destroy();
    });
});

describe('D31 review P3: turning "didn\'t see it" off returns to the Actual step', () => {
    it('an intended line and no actual puts the Actual pill back on', async () => {
        startNewShotInput(1);
        await mounted();
        const { resumeLineStep } = await import('../../src/modules/score-input.js');
        AppState.currentShotData.lineIntended = [{ x: 0, y: 0 }, { x: 0, y: 100 }];
        AppState.currentShotData.flightUnseen = false;
        resumeLineStep();
        expect(document.querySelector('#section-line [data-line-mode="actual"]').classList.contains('active-choice')).toBe(true);
    });
});