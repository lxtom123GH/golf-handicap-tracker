// @vitest-environment jsdom
// ==========================================
// quick-log-save.test.js — one-tap logging saves through the wizard's own
// save path (saveShotData), never a fork of it: same shot document, same
// stroke/putt bookkeeping, same Undo. Real score-input over the shipped
// wizard markup; Firestore writes never settle (offline-writes harness).
// ==========================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({ sets: [], updates: [], deletes: [], n: 0, undoCards: [] }));

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(() => ({})), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
    doc: vi.fn((_db, col, id) => ({ id: id || `new_${++h.n}` })),
    getDoc: vi.fn(async () => ({ exists: () => false })),
    getDocs: vi.fn(() => new Promise(() => { })),
    setDoc: vi.fn((ref, payload) => { h.sets.push([ref.id, payload]); return new Promise(() => { }); }),
    updateDoc: vi.fn((ref, patch) => { h.updates.push([ref.id, patch]); return new Promise(() => { }); }),
    deleteDoc: vi.fn((ref) => { h.deletes.push(ref.id); return new Promise(() => { }); }),
}));
vi.mock('../../src/ui.js', () => ({ UI: { btnWizardDelete: null } }));
vi.mock('../../src/oncourse.js', () => ({
    loadHole: vi.fn(),
    getLastGpsFix: vi.fn(() => null),
    onGpsFix: vi.fn(() => () => { }),
    isGpsWatchActive: vi.fn(() => false),
    collectGpsBiasSample: vi.fn(async () => { }),
}));
vi.mock('../../src/course-data.js', () => ({ COURSE_DATA: {} }));
vi.mock('../../src/modules/card-render.js', () => ({ renderBagButtons: vi.fn(), shortClubLabel: vi.fn((c) => c) }));
vi.mock('../../src/modules/undo-card.js', () => ({
    showUndoCard: vi.fn((text, fn) => h.undoCards.push({ text, fn })),
    dismissUndoCard: vi.fn(),
}));
vi.mock('../../src/hole-overlay.js', () => ({
    courseSlugFor: () => 'keperra',
    loadCourseOverlay: vi.fn(async () => null),
    curveCarryM: (pts) => (pts && pts.length >= 2 ? Math.round(Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1])) : null),
    mountHoleOverlay: vi.fn(() => ({ frame: null, destroy() { }, setMode() { }, setCurves() { }, setGhosts() { } })),
}));

import { AppState } from '../../src/state.js';
import { quickLogShot, quickNudgeShot, quickUndo, quickLogWanted, setWizardActive } from '../../src/modules/score-input.js';

const ROOT = path.resolve(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FRAME = { origin: [-27.41, 152.95], bearing: 10 };
const me = () => AppState.liveRoundGroups.find(p => p.uid === 'u1');
const line = (y) => [[0, 0], [2, y / 2], [4, y]];

beforeEach(() => {
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    document.body.innerHTML = doc.getElementById('oncourse-wizard').outerHTML;
    document.body.className = 'round-active';
    h.sets.length = 0; h.updates.length = 0; h.deletes.length = 0; h.undoCards.length = 0;
    AppState.currentUser = { uid: 'u1' };
    AppState.currentRoundCourseName = 'Keperra – North Course (9 holes)';
    AppState.currentTrackingMode = 'detailed';
    AppState.currentCoursePars = [4, 4, 4];
    AppState.currentHole = 1;
    AppState.currentHoleShots = [];
    AppState.activeRoundId = 'r1';
    AppState.liveRoundGroups = [{ uid: 'u1', name: 'Me', scores: {}, simpleStats: {} }];
    AppState.nextShotDefaults = null;
    AppState.currentShotData = {};
    AppState.shotEntry = 'map';
});
afterEach(() => { AppState.shotEntry = 'both'; setWizardActive(false); });

const base = { frame: FRAME, slug: 'keperra', physical: 10, startXY: [0, 0], greenXY: [0, 360] };

describe('quickLogShot: logs a real shot without opening the wizard', () => {
    it('saves one shot document with both lines, the club and the hole frame; counts the stroke', async () => {
        const r = await quickLogShot({ ...base, actual: line(150), intended: line(160), club: '7 Iron' });
        expect(h.sets).toHaveLength(1);
        const [id, saved] = h.sets[0];
        expect(r.shotId).toBe(id);
        expect(saved).toMatchObject({
            uid: 'u1', roundId: 'r1', hole: 1, shotNumber: 1, club: '7 Iron',
            lineIntended: [{ x: 0, y: 0 }, { x: 2, y: 80 }, { x: 4, y: 160 }],
            lineActual: [{ x: 0, y: 0 }, { x: 2, y: 75 }, { x: 4, y: 150 }],
            lineFrame: { origin: { lat: -27.41, lon: 152.95 }, bearing: 10, courseSlug: 'keperra', physicalHole: 10 },
            distanceToPinM: 360,
        });
        expect(typeof saved.timestamp).toBe('string');
        expect(saved.derived).toBeTruthy(); // shape/start line from the lines, like a drawn wizard shot
        expect(saved.planned).toBeUndefined();
        expect(me().scores[1]).toBe(1);
        expect(AppState.currentHoleShots.map(s => s.id)).toEqual([id]);
        // The wizard never opened.
        expect(document.body.classList.contains('active-wizard-mode')).toBe(false);
        expect(document.getElementById('oncourse-wizard').classList.contains('hidden')).toBe(true);
        // The play map's Undo chip gets what the Undo card would (the card
        // itself would sit over the map's chips, so it stays away).
        expect(h.undoCards).toHaveLength(0);
        expect(r.undo).toMatchObject({ shotId: id, hole: 1, putt: false, girSet: false });
    });

    it('the next shot number follows the hole; the play-map club/routine pick fills empty fields', async () => {
        await quickLogShot({ ...base, actual: line(150), club: 'Driver' });
        AppState.nextShotDefaults = { roundId: 'r1', hole: 1, shotNumber: 2, club: '9 Iron', routinePre: 'Pass' };
        await quickLogShot({ ...base, startXY: [4, 150], actual: [[4, 150], [6, 300]] });
        const second = h.sets[1][1];
        expect(second).toMatchObject({ shotNumber: 2, club: '9 Iron', routines: { pre: 'Pass' } });
        expect(me().scores[1]).toBe(2);
    });

    it('one-tap Actual from GPS: the fix is this shot\'s finish (start stays at the tee)', async () => {
        const fix = { lat: -27.409, lon: 152.951, accuracyM: 5, at: 1234 };
        await quickLogShot({ ...base, actual: [[0, 0], [3, 148]], finishFix: fix });
        const saved = h.sets[0][1];
        expect(saved.startXY).toEqual({ x: 0, y: 0 });
        expect(saved.finishXY).toEqual({ x: 3, y: 148 });
        expect(saved.finishPos).toEqual({ lat: -27.409, lon: 152.951, accuracyM: 5, at: 1234 });
        expect(saved.gpsCapture).toMatchObject({ state: 'accepted', accuracyM: 5, role: 'finish' });
        expect(saved.startPos).toBeUndefined(); // no GPS start: the fix is not where it began
    });

    it('a pending plan saved from the wizard is the shot that gets logged (no second document)', async () => {
        AppState.currentHoleShots = [{ id: 'plan1', uid: 'u1', hole: 1, shotNumber: 1, planned: true, roundId: 'r1', lineIntended: [{ x: 0, y: 0 }, { x: 0, y: 170 }] }];
        const r = await quickLogShot({ ...base, actual: line(150) });
        expect(r.shotId).toBe('plan1');
        expect(h.sets).toHaveLength(0);
        expect(h.updates[0][0]).toBe('plan1');
        expect(h.updates[0][1]).toMatchObject({ planned: false, lineIntended: [{ x: 0, y: 0 }, { x: 0, y: 170 }] });
        expect(me().scores[1]).toBe(1);
    });

    it('refuses while the wizard has a shot open (the wizard owns it)', async () => {
        setWizardActive(true);
        const r = await quickLogShot({ ...base, actual: line(150) });
        expect(r).toBe(null);
        expect(h.sets).toHaveLength(0);
    });

    it('a putt logged from the map counts a putt, and Undo takes the stroke and the putt back', async () => {
        const r = await quickLogShot({ ...base, startXY: [0, 350], actual: [[0, 350], [0, 358]], club: 'Putter' });
        expect(me().simpleStats[1].putts).toBe(1);
        quickUndo({ kind: 'shot', shotId: r.shotId, undo: r.undo, shotNumber: r.shotNumber });
        expect(me().scores[1]).toBe(0);
        expect(me().simpleStats[1].putts).toBe(0);
        expect(h.deletes).toEqual([r.shotId]);
        expect(AppState.currentHoleShots).toHaveLength(0);
    });
});

describe('quickNudgeShot: drag the one-tap line in the nudge window', () => {
    it('moves the finish, marks it adjusted, and Undo puts it back', async () => {
        const fix = { lat: -27.409, lon: 152.951, accuracyM: 6, at: 1 };
        const r = await quickLogShot({ ...base, actual: [[0, 0], [3, 148]], finishFix: fix });
        const prev = quickNudgeShot(r.shotId, [[0, 0], [10, 140]], FRAME);
        const [id, patch] = h.updates.at(-1);
        expect(id).toBe(r.shotId);
        expect(patch.lineActual).toEqual([{ x: 0, y: 0 }, { x: 10, y: 140 }]);
        expect(patch.finishXY).toEqual({ x: 10, y: 140 });
        expect(patch.finishPos.accuracyM).toBe(3);
        expect(patch.gpsCapture).toMatchObject({ adjusted: true, role: 'finish' });
        expect(AppState.currentHoleShots[0].finishXY).toEqual({ x: 10, y: 140 });

        quickUndo({ kind: 'nudge', shotId: r.shotId, prev });
        expect(AppState.currentHoleShots[0].finishXY).toEqual({ x: 3, y: 148 });
        expect(h.updates.at(-1)[1].lineActual).toEqual([{ x: 0, y: 0 }, { x: 3, y: 148 }]);
        // Strokes untouched by a nudge or its undo.
        expect(me().scores[1]).toBe(1);
    });

    it('a shot that is gone is left alone', () => {
        expect(quickNudgeShot('nope', [[0, 0], [1, 50]], FRAME)).toBe(null);
    });
});

describe('quickLogWanted (live AppState)', () => {
    it('follows the shot-entry preference and the round type', () => {
        expect(quickLogWanted()).toBe(true);
        AppState.shotEntry = 'both';
        expect(quickLogWanted()).toBe(false);
        AppState.shotEntry = 'map';
        AppState.currentTrackingMode = 'simple';
        expect(quickLogWanted()).toBe(false);
    });
});
