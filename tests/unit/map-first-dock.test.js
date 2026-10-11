// @vitest-environment jsdom
// ==========================================
// map-first-dock.test.js — D32 (simplify 2026-10-07, bigger move 1): the
// Map-first dock. Real score-input over the shipped wizard markup; a fake
// overlay controller.
// ==========================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    curveCarryM: (pts) => (pts && pts.length >= 2 ? 100 : null),
    mountHoleOverlay: vi.fn((canvas, hole, opts) => {
        const curves = { intended: null, actual: null, deflectAt: null };
        const ctl = {
            opts, frame: { origin: [0, 0], bearing: 0 }, destroy() { }, setMode() { }, setGhosts() { }, setStartMarker() { },
            setCurves(c) { Object.assign(curves, c); },
            stroke(m, pts) { curves[m] = pts; opts.onChange({ mode: m, points: pts, frame: this.frame, curves: { ...curves } }); },
        };
        h.mounts.push(ctl);
        return ctl;
    }),
}));

import { AppState } from '../../src/state.js';
import { startNewShotInput, setWizardActive } from '../../src/modules/score-input.js';

const ROOT = path.resolve(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'src/style.css'), 'utf8');
const mounted = () => vi.waitFor(() => { if (!h.mounts.length) throw new Error('not mounted'); });
const $ = (id) => document.getElementById(id);

beforeEach(() => {
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    document.body.innerHTML = doc.getElementById('oncourse-wizard').outerHTML;
    h.mounts.length = 0;
    AppState.currentUser = { uid: 'u1' };
    AppState.currentRoundCourseName = 'Keperra';
    AppState.currentCoursePars = [4, 4, 4];
    AppState.currentHole = 1;
    AppState.currentHoleShots = [];
    AppState.activeRoundId = 'r1';
});
afterEach(() => { AppState.shotEntry = 'both'; setWizardActive(false); });

describe('D32: Done is "Details" on the Map-first dock', () => {
    it('map first says Details; plain draw mode keeps Done', async () => {
        AppState.shotEntry = 'map';
        startNewShotInput(1);
        await mounted();
        expect($('btn-line-done').textContent).toBe('Details');
        expect($('btn-line-done').getAttribute('aria-label')).toMatch(/Details/);
        setWizardActive(false);
        expect($('btn-line-done').textContent).toBe('Done');
    });

    it('the button\'s look moved to style.css (an inline width would clip "Details")', () => {
        const doc = new DOMParser().parseFromString(HTML, 'text/html');
        expect(doc.getElementById('btn-line-done').getAttribute('style')).toBeNull();
        expect(CSS).toMatch(/#btn-line-done\s*\{[^}]*position:\s*fixed[^}]*min-width:\s*44px/);
    });
});

describe('D32: Save plan is on the dock while it is offered', () => {
    it('an intended line (no actual) marks the wizard plan-offered; an actual line clears it', async () => {
        AppState.shotEntry = 'map';
        startNewShotInput(1);
        await mounted();
        const wiz = $('oncourse-wizard');
        expect(wiz.classList.contains('plan-offered')).toBe(false);
        h.mounts[0].stroke('intended', [[0, 0], [0, 150]]);
        expect(wiz.classList.contains('plan-offered')).toBe(true);
        expect($('btn-save-plan').classList.contains('hidden')).toBe(false);
        h.mounts[0].stroke('actual', [[0, 0], [5, 140]]);
        expect(wiz.classList.contains('plan-offered')).toBe(false);
    });

    it('style.css no longer hides Save plan in map first', () => {
        expect(CSS).not.toMatch(/\.map-first \.wizard-footer \.wizard-save-plan\s*\{\s*display:\s*none/);
        expect(CSS).toMatch(/\.map-first \.wizard-footer \.wizard-save-plan\s*\{[^}]*position:\s*fixed/);
    });
});

describe('D32: lie, putt result, ✕, Penalty and the GPS ring are docked on the map', () => {
    it('each has a map-first rule that brings it out from under the map', () => {
        for (const sel of ['#section-lie', '#section-putting-outcome', '#btn-wizard-cancel', '#btn-wizard-penalty', '#gps-lock-ring']) {
            const blocks = CSS.split('}').filter(b => b.includes(`.map-first ${sel}`) && b.includes('{'));
            expect(blocks.some(b => /position:\s*fixed/.test(b.split('{')[1])), sel).toBe(true);
        }
    });

    it('the dock keeps Short / Holed / Past and drops the putt line/read rows to Details', () => {
        const doc = new DOMParser().parseFromString(HTML, 'text/html');
        const grid = doc.querySelector('#section-putting-outcome > .putt-control-grid');
        expect([...grid.querySelectorAll('[data-group="puttControl"]')].map(b => b.dataset.val)).toEqual(['Short', 'Holed', 'Past']);
        expect(CSS).toMatch(/\.map-first #section-putting-outcome > :not\(\.putt-control-grid\)\s*\{\s*display:\s*none/);
        // An inline display would beat that rule: the rows it hides carry none.
        for (const el of doc.querySelectorAll('#section-putting-outcome > :not(.putt-control-grid)')) {
            expect(el.getAttribute('style') || '', el.className || el.tagName).not.toMatch(/display/);
        }
    });

    it('adds no !important', () => {
        expect((CSS.match(/!important/g) || []).length).toBe(51);
    });
});
