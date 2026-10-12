// @vitest-environment jsdom
// ==========================================
// map-first-fairway-style.test.js — Map first draws the light fairway.
// Map-first mounts should use the outline fairway style.
// switched the fairway back to the opaque fill. Map first uses play mode's
// light 'outline' style; the other shot-entry modes keep 'solid'. Same
// harness as live-follow-wiring.test.js (real score-input, fake overlay).
// ==========================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({ mounts: [], fixCbs: [], watch: false, lastFix: null }));

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
            opts, frame: { origin: [0, 0], bearing: 0 }, destroy() { }, setMode() { }, setGhosts() { }, setStartMarker() { },
            setCurves() { }, anchors: [],
            setLiveAnchor(xy) { this.anchors.push(xy); },
        };
        h.mounts.push(ctl);
        return ctl;
    }),
}));

import { AppState } from '../../src/state.js';
import { startNewShotInput, setWizardActive } from '../../src/modules/score-input.js';

const ROOT = path.resolve(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const mounted = () => vi.waitFor(() => { if (!h.mounts.length) throw new Error('not mounted'); });
// Start captures notify each listener when a position is accepted.
const fire = (fix) => [...h.fixCbs].forEach(cb => cb(fix));
const FIX = { lat: 0.001, lon: 0, accuracyM: 5, at: Date.now() };

beforeEach(() => {
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    document.body.innerHTML = doc.getElementById('oncourse-wizard').outerHTML;
    h.mounts.length = 0; h.fixCbs = []; h.watch = false; h.lastFix = null;
    AppState.currentUser = { uid: 'u1' };
    AppState.currentRoundCourseName = 'Keperra';
    AppState.currentCoursePars = [4, 4, 4];
    AppState.currentHole = 1;
    AppState.currentHoleShots = [];
    AppState.activeRoundId = 'r1';
    AppState.shotEntry = 'map';
});
afterEach(() => { AppState.shotEntry = 'both'; setWizardActive(false); });

describe('Map first fairway style', () => {
    it('Map first mounts the shot map with the light outline fairway', async () => {
        AppState.shotEntry = 'map';
        startNewShotInput(1);
        await mounted();
        expect(h.mounts[h.mounts.length - 1].opts.featureStyle).toBe('outline');
    });

    it.each(['both', 'draw'])('%s keeps the solid fairway', async (pref) => {
        AppState.shotEntry = pref;
        startNewShotInput(1);
        await mounted();
        expect(h.mounts[h.mounts.length - 1].opts.featureStyle ?? 'solid').toBe('solid');
    });
});
