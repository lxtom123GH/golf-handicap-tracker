// @vitest-environment jsdom
// ==========================================
// GPS capture-role wiring with synthetic mapped-hole positions.

// Real score-input over the shipped wizard markup; a fake overlay controller
// (frame: tee at the origin, y up the hole) and a fake GPS module. Same
// scaffolding as live-follow-wiring.test.js.
// ==========================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({ mounts: [], fixCbs: [], watch: true, lastFix: null, updates: [] }));

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
    doc: vi.fn((_db, col, id) => ({ id: id || 'x' })),
    getDoc: vi.fn(async () => ({ exists: () => true,
        data: () => ({ line: [{ x: 0, y: 0 }, { x: 0, y: 120 }] }) })),
    getDocs: vi.fn(() => new Promise(() => { })),
    setDoc: vi.fn(() => new Promise(() => { })),
    updateDoc: vi.fn((ref, patch) => { h.updates.push([ref.id, patch]); return new Promise(() => { }); }),
    deleteDoc: vi.fn(() => new Promise(() => { })),
}));
vi.mock('../../src/ui.js', () => ({ UI: { btnWizardDelete: null } }));
vi.mock('../../src/oncourse.js', () => ({
    loadHole: vi.fn(),
    getLastGpsFix: vi.fn(() => h.lastFix),
    onGpsFix: vi.fn((cb) => { h.fixCbs.push(cb); return () => { h.fixCbs = h.fixCbs.filter(c => c !== cb); }; }),
    isGpsWatchActive: vi.fn(() => h.watch),
    collectGpsBiasSample: vi.fn(async () => { }),
}));
vi.mock('../../src/course-data.js', () => ({ COURSE_DATA: {} }));
vi.mock('../../src/modules/card-render.js', () => ({ renderBagButtons: vi.fn(), shortClubLabel: vi.fn((c) => c) }));
vi.mock('../../src/hole-overlay.js', () => ({
    courseSlugFor: () => 'keperra',
    loadCourseOverlay: vi.fn(async () => ({ holes: { 1: { tee: { lat: 0, lon: 0 }, green: { centre: { lat: 0.003, lon: 0 } } } } })),
    curveCarryM: () => null,
    mountHoleOverlay: vi.fn((canvas, hole, opts) => {
        const ctl = {
            opts, frame: { origin: [0, 0], bearing: 0 }, destroy() { }, setMode() { }, setGhosts() { },
            setCurves() { }, setLiveAnchor() { },
            markers: [], refocused: [],
            setStartMarker(m) { this.markers.push(m); },
            refocus(xy) { this.refocused.push(xy); return true; },
        };
        h.mounts.push(ctl);
        return ctl;
    }),
}));

import { AppState } from '../../src/state.js';
import { startNewShotInput, setWizardActive } from '../../src/modules/score-input.js';
import { fromFrame } from '../../src/geo.js';
import { getDoc } from 'firebase/firestore';
import { loadCourseOverlay } from '../../src/hole-overlay.js';

const ROOT = path.resolve(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FRAME = { origin: [0, 0], bearing: 0 };
const mounted = () => vi.waitFor(() => { if (!h.mounts.length) throw new Error('not mounted'); });
const fire = (fix) => [...h.fixCbs].forEach(cb => cb(fix));
/** Two good fixes at frame metres xy → the capture accepts at once. */
function standAt(xy) {
    const [lat, lon] = fromFrame(FRAME, xy);
    fire({ lat, lon, accuracyM: 6, speedMps: null, at: Date.now() });
    fire({ lat, lon, accuracyM: 3, speedMps: null, at: Date.now() });
}
const near = (a, b, tol = 0.2) => Math.abs(a - b) <= tol;

function prevShot() {
    return {
        id: 'shot_1', hole: 1, shotNumber: 1, club: 'Dr',
        lineActual: [{ x: 0, y: 0 }, { x: 0, y: 100 }],
        lineIntended: [{ x: 0, y: 0 }, { x: 0, y: 110 }],
    };
}

beforeEach(() => {
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    document.body.innerHTML = doc.getElementById('oncourse-wizard').outerHTML;
    h.mounts.length = 0; h.fixCbs = []; h.watch = true; h.lastFix = null; h.updates.length = 0;
    AppState.currentUser = { uid: 'u1' };
    AppState.currentRoundCourseName = 'Keperra';
    AppState.currentCoursePars = [4, 4, 4];
    AppState.currentHole = 1;
    AppState.currentHoleShots = [];
    AppState.activeRoundId = 'r1';
    AppState.shotEntry = 'map';
});
afterEach(() => { AppState.shotEntry = 'both'; setWizardActive(false); });

describe('GPS capture role — start or finish of this shot', () => {
    it('mounts the captured position when GPS resolves while the plan loads', async () => {
        let resolvePlan;
        getDoc.mockImplementationOnce(() => new Promise(resolve => { resolvePlan = resolve; }));
        startNewShotInput();
        await vi.waitFor(() => expect(resolvePlan).toBeTypeOf('function'));
        standAt([0, 5]);
        const captured = AppState.currentShotData;
        resolvePlan({ exists: () => true,
            data: () => ({ line: [{ x: 0, y: 0 }, { x: 0, y: 120 }] }) });
        await mounted();
        expect(captured.startPos).toBeDefined();
        expect(h.mounts[0].opts.startMarker).toMatchObject({
            lat: captured.startPos.lat, lon: captured.startPos.lon,
        });
        expect(AppState.currentShotData.planId).toBeDefined();
    });

    it('keeps a plan selected after GPS replaces the shot record', async () => {
        startNewShotInput();
        await mounted();
        standAt([0, 123]);
        const captured = AppState.currentShotData;
        document.getElementById('btn-line-use-plan').click();
        expect(AppState.currentShotData.lineIntended).toEqual([{ x: 0, y: 0 }, { x: 0, y: 120 }]);
        expect(AppState.currentShotData.finishXY).toEqual({ x: 0, y: 123 });
        expect(AppState.currentShotData.gpsCapture).toEqual(captured.gpsCapture);
        expect(AppState.currentShotData).not.toBe(captured);
    });

    it.each([[0, 5], [0, 123]])('keeps curves drawn after a capture at [%s, %s] metres', async (x, y) => {
        startNewShotInput();
        await mounted();
        const ctl = h.mounts[h.mounts.length - 1];
        standAt([x, y]);
        const captured = AppState.currentShotData;
        const intended = [[0, 0], [0, 120]];
        const actual = [[0, 0], [5, 125]];
        ctl.opts.onChange({ mode: 'actual', points: actual, frame: FRAME,
            curves: { intended, actual } });
        expect(AppState.currentShotData.lineActual).toEqual([{ x: 0, y: 0 }, { x: 5, y: 125 }]);
        expect(AppState.currentShotData.lineIntended).toEqual([{ x: 0, y: 0 }, { x: 0, y: 120 }]);
        expect(AppState.currentShotData.gpsCapture).toEqual(captured.gpsCapture);
        expect(AppState.currentShotData.derived).toBeDefined();
        expect(AppState.currentShotData).not.toBe(captured);
        expect(h.mounts).toHaveLength(1);
    });

    it('tee shot logged 123 m up the hole: start stays on the tee, the fix is this shot\'s finish', async () => {
        startNewShotInput();
        await mounted();
        const ctl = h.mounts[h.mounts.length - 1];
        const beforeCapture = AppState.currentShotData;
        standAt([-2.2, 122.8]);
        const d = AppState.currentShotData;
        expect(d).not.toBe(beforeCapture);
        expect(d.shotNumber).toBe(1);
        expect(d.startXY).toEqual({ x: 0, y: 0 });
        expect(d.startPos).toBeUndefined();
        expect(d.finishPos).toMatchObject({ accuracyM: 3 });
        expect(near(d.finishXY.x, -2.2) && near(d.finishXY.y, 122.8)).toBe(true);
        expect(d.gpsCapture).toMatchObject({ state: 'accepted', role: 'finish' });
        // The anchor is not moved onto the fix, and the view is not re-framed there.
        expect(ctl.markers).toEqual([]);
        expect(ctl.refocused).toEqual([]);
        expect(h.updates).toEqual([]);
        expect(document.getElementById('line-readout').textContent).toMatch(/where this shot finished/);
    });

    it('keeps a forward tee 30 m ahead of the mapped origin as the start', async () => {
        startNewShotInput();
        await mounted();
        standAt([0, 30]);
        const d = AppState.currentShotData;
        expect(d.startXY).toEqual({ x: 0, y: 30 });
        expect(d.startPos).toMatchObject({ accuracyM: 3 });
        expect(d.finishXY).toBeUndefined();
        expect(d.gpsCapture.role).toBe('start');
    });

    it.each(['Point', 'Polygon', 'MultiPolygon'])('uses mapped %s tees farther forward than the allowance', async (type) => {
        const [lat, lon] = fromFrame(FRAME, [0, 80]);
        const point = [lon, lat];
        const coordinates = type === 'Point' ? point : type === 'Polygon' ? [[point]] : [[[point]]];
        loadCourseOverlay.mockResolvedValueOnce({ holes: { 1: {
            tee: { lat: 0, lon: 0 }, green: { centre: { lat: 0.003, lon: 0 } },
            features: { features: [{ properties: { golf: 'tee' }, geometry: { type, coordinates } }] },
        } } });
        startNewShotInput();
        await mounted();
        standAt([0, 80]);
        expect(AppState.currentShotData.startXY).toEqual({ x: 0, y: 80 });
        expect(AppState.currentShotData.finishXY).toBeUndefined();
        expect(AppState.currentShotData.gpsCapture.role).toBe('start');
    });

    it('tee shot logged on the tee (5 m away): unchanged — the fix is the start', async () => {
        startNewShotInput();
        await mounted();
        const ctl = h.mounts[h.mounts.length - 1];
        standAt([3, 4]);
        const d = AppState.currentShotData;
        expect(d.startPos).toMatchObject({ accuracyM: 3 });
        expect(near(d.startXY.x, 3) && near(d.startXY.y, 4)).toBe(true);
        expect(d.finishPos).toBeUndefined();
        expect(d.finishXY).toBeUndefined();
        expect(d.gpsCapture.role).toBe('start');
        expect(ctl.markers.length).toBe(1);
        expect(ctl.refocused.length).toBe(1);
    });

    it('shot 2 logged 60 m past the previous finish: previous shot untouched, start = previous finish', async () => {
        AppState.currentHoleShots = [prevShot()];
        startNewShotInput();
        await mounted();
        const ctl = h.mounts[h.mounts.length - 1];
        standAt([0, 160]);
        const d = AppState.currentShotData;
        expect(d.shotNumber).toBe(2);
        expect(d.startXY).toEqual({ x: 0, y: 100 });
        expect(near(d.finishXY.y, 160)).toBe(true);
        expect(d.gpsCapture.role).toBe('finish');
        const prev = AppState.currentHoleShots[0];
        expect(prev.finishPos).toBeUndefined();
        expect(prev.finishXY).toBeUndefined();
        expect(h.updates).toEqual([]);
        expect(ctl.markers).toEqual([]);
    });

    it('shot 2 logged near the previous finish (6 m)', async () => {
        AppState.currentHoleShots = [prevShot()];
        startNewShotInput();
        await mounted();
        const ctl = h.mounts[h.mounts.length - 1];
        standAt([0, 106]);
        const d = AppState.currentShotData;
        expect(d.gpsCapture.role).toBe('start');
        expect(near(d.startXY.y, 106)).toBe(true);
        expect(d.finishXY).toBeUndefined();
        const prev = AppState.currentHoleShots[0];
        expect(prev.finishPos).toEqual(d.startPos);
        expect(prev.finishXY).toEqual(d.startXY);
        expect(h.updates.length).toBe(1);
        expect(h.updates[0][0]).toBe('shot_1');
        expect(ctl.markers.length).toBe(1);
    });

    it('no frame for THIS hole (only the last hole\'s map is left): old behaviour, the fix is the start', async () => {
        // Leave a controller mounted on hole 1, then open hole 2 (no overlay
        // hole in the fake course, so nothing new mounts).
        startNewShotInput();
        await mounted();
        setWizardActive(false);
        AppState.currentHole = 2;
        AppState.currentHoleShots = [];
        startNewShotInput();
        standAt([0, 123]);
        const d = AppState.currentShotData;
        expect(d.startPos).toBeDefined();
        // The last hole's frame is not used: no startXY in the wrong frame.
        expect(d.startXY).toBeUndefined();
        expect(d.finishPos).toBeUndefined();
        expect(d.gpsCapture.role).toBe('start');
    });
});
