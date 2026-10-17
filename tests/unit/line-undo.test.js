// @vitest-environment jsdom
// ==========================================
// line-undo.test.js — D29 (simplify 2026-10-07): the line Undo belongs to
// ONE shot, and Undo replaces the Clear button.
// ==========================================
// The real score-input over the shipped wizard markup (index.html); the
// overlay is a fake controller that reports strokes through onChange, the
// way hole-overlay.js does.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({ mounts: [] }));

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
    loadHole: vi.fn(), getLastGpsFix: vi.fn(() => null), onGpsFix: vi.fn(() => () => { }),
    isGpsWatchActive: vi.fn(() => false), collectGpsBiasSample: vi.fn(async () => { }),
}));
vi.mock('../../src/course-data.js', () => ({ COURSE_DATA: {} }));
vi.mock('../../src/modules/card-render.js', () => ({ renderBagButtons: vi.fn(), shortClubLabel: vi.fn((c) => c) }));
vi.mock('../../src/hole-overlay.js', () => ({
    courseSlugFor: () => 'keperra',
    loadCourseOverlay: vi.fn(async () => ({ holes: { 1: { tee: {}, green: { centre: { lat: 0, lon: 0 } } } } })),
    curveCarryM: (pts) => (pts && pts.length >= 2 ? Math.round(Math.abs(pts[pts.length - 1][1] - pts[0][1])) : null),
    mountHoleOverlay: vi.fn((canvas, hole, opts) => {
        const curves = { intended: opts.curves.intended, actual: opts.curves.actual, deflectAt: null };
        const frame = { origin: [0, 0], bearing: 0 };
        const ctl = {
            opts, frame, destroyed: false,
            destroy() { this.destroyed = true; },
            setMode() { }, setGhosts() { }, setStartMarker() { },
            setCurves(c) { Object.assign(curves, c); },
            clear(m) { curves[m] = null; opts.onChange({ mode: m, points: null, frame, curves: { ...curves } }); },
            // A finished swipe, as the real overlay reports it.
            stroke(m, pts) { curves[m] = pts; opts.onChange({ mode: m, points: pts, frame, curves: { ...curves } }); },
        };
        h.mounts.push(ctl);
        return ctl;
    }),
}));

import { AppState } from '../../src/state.js';
import { startNewShotInput, loadExistingShotData } from '../../src/modules/score-input.js';

const HTML = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
// Wait for the async overlay mount (course file + plan read) of the shot just opened.
const settle = () => vi.waitFor(() => {
    if (!h.mounts.length || h.mounts[h.mounts.length - 1].opts.focus.shotNumber !== AppState.currentShotData.shotNumber) throw new Error('not mounted');
});
const undoBtn = () => document.getElementById('btn-line-undo');
const live = () => h.mounts.filter(m => !m.destroyed).slice(-1)[0];
const LINE_A = [[0, 0], [0, 120]];
const LINE_B = [[0, 0], [5, 200]];

beforeEach(() => {
    // Pin the 'both' layout for tests that exercise the map-and-grids controls;
    // Map first's own Undo case sets 'map' explicitly below.
    AppState.shotEntry = 'both';
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    document.body.innerHTML = doc.getElementById('oncourse-wizard').outerHTML;
    h.mounts.length = 0;
    AppState.currentUser = { uid: 'u1' };
    AppState.currentRoundCourseName = 'Keperra';
    AppState.currentCoursePars = [4, 4, 4];
    AppState.currentHole = 1;
    AppState.currentHoleShots = [];
    AppState.liveRoundGroups = [{ uid: 'u1', scores: { 1: 0 }, simpleStats: {} }];
    AppState.activeRoundId = 'r1';
});

describe('D29: Undo never reaches another shot', () => {
    it('shot 2 Undo does not paste shot 1\'s earlier line', async () => {
        startNewShotInput(1);
        await settle();
        live().stroke('intended', LINE_A);
        live().stroke('intended', LINE_B); // history now holds LINE_A for shot 1
        const shot1 = AppState.currentShotData;
        expect(shot1.lineIntended).toEqual([{ x: 0, y: 0 }, { x: 5, y: 200 }]);

        AppState.currentHoleShots = [{ ...shot1, id: 's1' }];
        startNewShotInput(2);
        await settle();
        const shot2 = AppState.currentShotData;
        expect(shot2.shotNumber).toBe(2);
        // Nothing drawn yet on shot 2: there is nothing to undo.
        expect(undoBtn().classList.contains('hidden')).toBe(true);
        undoBtn().click();
        expect(shot2.lineIntended ?? null).toBeNull();
    });

    it('reopening a saved shot starts with an empty history too', async () => {
        startNewShotInput(1);
        await settle();
        live().stroke('intended', LINE_A);
        live().stroke('intended', LINE_B);
        AppState.currentHoleShots = [{ id: 'p2', hole: 1, shotNumber: 2, planned: true }];
        loadExistingShotData('p2');
        await settle();
        undoBtn().click();
        expect(AppState.currentShotData.lineIntended ?? null).toBeNull();
    });
});

describe('D29: one Undo button instead of Undo + Clear', () => {
    it('the shipped wizard has no Clear button', () => {
        expect(document.getElementById('btn-line-clear')).toBeNull();
        expect(undoBtn()).not.toBeNull();
    });

    it('Undo shows once a line exists (outside draw mode too) and takes the stroke back', async () => {
        startNewShotInput(1);
        await settle();
        expect(undoBtn().classList.contains('hidden')).toBe(true);
        live().stroke('intended', LINE_A);
        expect(undoBtn().classList.contains('hidden')).toBe(false);
        undoBtn().click();
        expect(AppState.currentShotData.lineIntended ?? null).toBeNull();
        expect(undoBtn().classList.contains('hidden')).toBe(true);
    });

    it('on a reopened plan Undo clears its line, and a second Undo brings it back', async () => {
        AppState.currentHoleShots = [{
            id: 'p1', hole: 1, shotNumber: 1, planned: true,
            lineIntended: [{ x: 0, y: 0 }, { x: 0, y: 150 }],
        }];
        loadExistingShotData('p1');
        await settle();
        // The plan's line is on the Intended pill... but a planned shot
        // opens on Actual (step 2). Switch back to the intended line.
        document.querySelector('#section-line [data-line-mode="intended"]').click();
        expect(undoBtn().classList.contains('hidden')).toBe(false);
        undoBtn().click();
        expect(AppState.currentShotData.lineIntended ?? null).toBeNull();
        expect(undoBtn().classList.contains('hidden')).toBe(false); // the clear is undoable
        undoBtn().click();
        expect(AppState.currentShotData.lineIntended).toEqual([{ x: 0, y: 0 }, { x: 0, y: 150 }]);
    });

    it('review P3: Undo only touches the line under the active pill', async () => {
        startNewShotInput(1);
        await settle();
        live().stroke('intended', LINE_A);
        document.querySelector('#section-line [data-line-mode="actual"]').click();
        live().stroke('actual', LINE_B);
        undoBtn().click();
        expect(AppState.currentShotData.lineActual ?? null).toBeNull();
        // Nothing left on Actual: Undo can't reach the intended line.
        expect(undoBtn().disabled).toBe(true);
        undoBtn().click();
        expect(AppState.currentShotData.lineIntended).toEqual([{ x: 0, y: 0 }, { x: 0, y: 120 }]);
    });

    it('review P3: in draw mode Undo keeps its place (disabled) so the docked row never shifts', async () => {
        AppState.shotEntry = 'map';
        try {
            startNewShotInput(1);
            await settle();
            expect(undoBtn().classList.contains('hidden')).toBe(false);
            expect(undoBtn().disabled).toBe(true);
            live().stroke('intended', LINE_A);
            expect(undoBtn().disabled).toBe(false);
        } finally {
            AppState.shotEntry = 'both';
        }
    });
});

describe('D29 review: clearing the actual line drops its deflection marker', () => {
    it('the real overlay clear(\'actual\') reports deflectAt null', async () => {
        const real = await vi.importActual('../../src/hole-overlay.js');
        const { makeFrame, fromFrame } = await vi.importActual('../../src/geo.js');
        HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
            get: (_t, k) => (k === 'measureText' ? () => ({ width: 60 }) : () => { }), set: () => true,
        });
        document.body.innerHTML = '<canvas></canvas>';
        const canvas = document.querySelector('canvas');
        canvas.getBoundingClientRect = () => ({ width: 375, height: 400, top: 0, left: 0, right: 375, bottom: 400 });
        const TEE = [-27.4698, 153.0251];
        const G = fromFrame(makeFrame(TEE, fromFrame({ origin: TEE, bearing: 30 }, [0, 300])), [0, 300]);
        const onChange = vi.fn();
        const ctl = real.mountHoleOverlay(canvas, { tee: { lat: TEE[0], lon: TEE[1] }, green: { centre: { lat: G[0], lon: G[1] } } }, {
            curves: { intended: null, actual: [[0, 0], [0, 50], [10, 120]], deflectAt: 1 }, onChange,
        });
        ctl.clear('actual');
        expect(onChange.mock.calls.at(-1)[0].curves).toMatchObject({ actual: null, deflectAt: null });
        ctl.destroy();
    });
});

describe('D29 review P2: the plan editor\'s Clear names the line it clears', () => {
    it('every overlay clear() call in src passes a mode', () => {
        const dir = path.resolve(__dirname, '../../src');
        const files = ['modules/hole-plan-card.js', 'modules/score-input.js'];
        for (const f of files) {
            const src = fs.readFileSync(path.join(dir, f), 'utf8');
            expect(src, f).not.toMatch(/(ctl|_lineCtl)\??\.clear\(\s*\)/);
        }
    });
});
