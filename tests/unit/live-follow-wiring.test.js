// @vitest-environment jsdom
// ==========================================
// live-follow-wiring.test.js — Map first GPS follow, score-input side.
// Codex P2s on #233: seed the live dot only from an ACTIVE watch, and clear
// it when the watch stops (turned off, or killed by a GPS error) instead of
// showing the last fix as where you are now. Real score-input over the
// shipped wizard markup; a fake overlay controller and a fake GPS module.
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
// The S10 start capture subscribes too: feed every listener, like a real fix.
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

describe('Map first live follow wiring', () => {
    it('a cached fix from a GPS that is OFF is not shown as where you are', async () => {
        h.watch = false; h.lastFix = FIX;
        startNewShotInput(1);
        await mounted();
        expect(h.mounts[0].anchors).toEqual([]);
    });

    it('an active watch seeds the dot, and later fixes move it', async () => {
        h.watch = true; h.lastFix = FIX;
        startNewShotInput(1);
        await mounted();
        const ctl = h.mounts[h.mounts.length - 1];
        const n = ctl.anchors.length;
        expect(n).toBeGreaterThan(0);
        expect(ctl.anchors[n - 1]).not.toBeNull();
        fire({ lat: 0.0015, lon: 0, accuracyM: 5, at: Date.now() });
        expect(ctl.anchors.length).toBe(n + 1);
    });

    it('the watch stopping clears the dot (no stale "you are here")', async () => {
        h.watch = true; h.lastFix = FIX;
        startNewShotInput(1);
        await mounted();
        const ctl = h.mounts[h.mounts.length - 1];
        h.watch = false;
        document.dispatchEvent(new CustomEvent('gps-watch-stopped'));
        expect(ctl.anchors[ctl.anchors.length - 1]).toBeNull();
        // ...and a restarted watch's first fix shows it again.
        h.watch = true;
        fire({ lat: 0.001, lon: 0, accuracyM: 5, at: Date.now() });
        expect(ctl.anchors[ctl.anchors.length - 1]).not.toBeNull();
    });

    it('closing the wizard stops following', async () => {
        h.watch = true;
        startNewShotInput(1);
        await mounted();
        const ctl = h.mounts[h.mounts.length - 1];
        setWizardActive(false);
        const n = ctl.anchors.length;
        fire({ lat: 0.0015, lon: 0, accuracyM: 5, at: Date.now() });
        expect(ctl.anchors.length).toBe(n);
    });
    it('a fix from BEFORE the GPS was switched off and on is not a seed', async () => {
        h.watch = true; h.lastFix = { ...FIX, at: Date.now() - 1000 };
        document.dispatchEvent(new CustomEvent('gps-watch-stopped')); // off...
        // ...and straight back on: the new watch has no fix yet.
        startNewShotInput(1);
        await mounted();
        const ctl = h.mounts[h.mounts.length - 1];
        expect(ctl.anchors.filter(Boolean)).toEqual([]);
        // The new watch's first fix shows the dot.
        fire({ lat: 0.001, lon: 0, accuracyM: 5, at: Date.now() + 1 });
        expect(ctl.anchors[ctl.anchors.length - 1]).not.toBeNull();
    });
});
