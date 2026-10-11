// @vitest-environment jsdom
// ==========================================
// remove-shot.test.js — D30 (simplify 2026-10-07): one remove-shot path for
// the Undo card and 🗑️ Delete, and shot-list writes through mutateList.
// ==========================================
// The offline-writes harness: real AppState / oncourse / score-input /
// persistence, Firestore stubs whose writes never settle.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let autoId = 0;
const deleted = [];

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, name) => ({ _path: name })),
    query: vi.fn((c) => c), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    doc: vi.fn((_db, col, id) => (typeof col === 'string'
        ? { _path: `${col}/${id}`, id }
        : { _path: `auto/${++autoId}`, id: `auto-${autoId}` })),
    getDoc: vi.fn(() => new Promise(() => { })),
    getDocs: vi.fn(async () => ({ forEach: () => { }, size: 0 })),
    addDoc: vi.fn(() => new Promise(() => { })),
    setDoc: vi.fn(() => new Promise(() => { })),
    updateDoc: vi.fn(() => new Promise(() => { })),
    deleteDoc: vi.fn((ref) => { deleted.push(ref.id); return new Promise(() => { }); }),
    writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => new Promise(() => { })) })),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/ui.js', () => ({
    UI: { ocTeeSelect: null, ocAddedPlayersList: null, ocHoleEditorModal: null, penaltyModal: null, btnWizardDelete: null },
}));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));
vi.mock('../../src/whs.js', () => ({
    calculateDailyHandicap: vi.fn(() => 0), calculateHoleStableford: vi.fn(() => 2),
    convertStablefordToAGS: vi.fn(() => 45), scoringUnavailableReason: vi.fn(() => null),
}));
vi.mock('../../src/course-data.js', () => ({
    COURSE_DATA: {}, KEPERRA_GPS: {}, getStrokeIndex: vi.fn(() => null),
    isRatableTee: vi.fn(() => false), isPlausibleRating: vi.fn(() => true),
}));

import { AppState } from '../../src/state.js';
import { loadHole } from '../../src/oncourse.js';
import '../../src/persistence.js'; // the real stateChange → localStorage listener
import { saveShotData, deleteShotData } from '../../src/modules/score-input.js';
import { dismissUndoCard } from '../../src/modules/undo-card.js';

const settle = () => new Promise(r => setTimeout(r, 20));
const me = () => AppState.liveRoundGroups[0];
const snapshot = () => JSON.parse(localStorage.getItem('golf_round_state') || 'null');
const undoBtn = () => document.querySelector('.undo-card .undo-card-btn');

function startRound() {
    document.body.innerHTML = `
        <div id="oncourse-wizard"></div><div id="oc-hole-display"></div><div id="oc-par-display"></div>
        <select id="oc-par-select"></select><div id="oc-group-scores"></div>
        <button id="btn-oc-next-hole"></button><button id="btn-oc-track-shot"></button>
        <div id="hole-jumper-container"></div>`;
    document.body.className = '';
    localStorage.clear();
    AppState.currentUser = { uid: 'u1' };
    AppState.currentCoursePars = [4, 4, 3, 4, 5, 4, 3, 5, 4];
    AppState.currentRoundHoles = 9;
    AppState.currentTrackingMode = 'detailed';
    AppState.currentHoleShots = [];
    AppState.liveRoundGroups = [{ uid: 'u1', name: 'Alex', dailyHandicap: 7, scores: {}, compStats: {}, simpleStats: {} }];
    AppState.currentHole = 1;
    AppState.activeRoundId = `round_${++autoId}`;
    loadHole(); // the hole is loaded (a first load clears the shot list)
}

/** Open a stored shot in the wizard and tap 🗑️ (confirm accepted). */
async function deleteStored(id) {
    AppState.currentShotData = { ...AppState.currentHoleShots.find(s => s.id === id) };
    document.body.classList.add('active-wizard-mode');
    await deleteShotData();
}

beforeEach(() => {
    Element.prototype.scrollIntoView ??= () => { }; // jsdom has none (the hole jumper calls it)
    deleted.length = 0;
    startRound();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { dismissUndoCard(); vi.restoreAllMocks(); });

describe('D30: deleting a saved plan never takes a stroke off the hole', () => {
    it('the plan goes, the hole keeps its strokes, and the wizard closes properly', async () => {
        me().scores[1] = 1;
        AppState.currentHoleShots = [
            { id: 's1', hole: 1, shotNumber: 1, club: 'Driver' },
            { id: 'p2', hole: 1, shotNumber: 2, planned: true, club: 'Putter' },
        ];
        await deleteStored('p2');
        expect(me().scores[1]).toBe(1);
        expect(me().simpleStats[1]?.putts ?? 0).toBe(0);
        expect(AppState.currentHoleShots.map(s => s.id)).toEqual(['s1']);
        expect(deleted).toEqual(['p2']);
        // Every other exit clears this; Play mode keeps its map off while set.
        expect(document.body.classList.contains('active-wizard-mode')).toBe(false);
        // ...and the change reached the round snapshot.
        expect(snapshot().liveRoundGroups[0].scores[1]).toBe(1);
        expect(snapshot().currentHoleShots.map(s => s.id)).toEqual(['s1']);
    });
});

describe('D30: Delete reverses what the shot added - putts, GIR, FW', () => {
    it('a logged putt: stroke, putt and the GIR it worked out all go', async () => {
        me().scores[1] = 2;
        AppState.currentShotData = { hole: 1, shotNumber: 3, club: 'Putter', puttControl: 'Short' };
        await Promise.race([saveShotData(), settle()]);
        dismissUndoCard();
        expect(me().scores[1]).toBe(3);
        expect(me().simpleStats[1]).toMatchObject({ putts: 1, gir: true });
        await deleteStored(AppState.currentHoleShots[0].id);
        expect(me().scores[1]).toBe(2);
        expect(me().simpleStats[1].putts).toBe(0);
        expect(me().simpleStats[1].gir).toBeUndefined();
        expect(snapshot().liveRoundGroups[0].scores[1]).toBe(2);
    });

    it('a GIR the golfer tapped stays when a putt is deleted', async () => {
        me().scores[1] = 3;
        me().simpleStats[1] = { gir: true, putts: 1 };
        AppState.currentHoleShots = [{ id: 'pt', hole: 1, shotNumber: 3, club: 'Putter' }];
        await deleteStored('pt');
        expect(me().scores[1]).toBe(2);
        expect(me().simpleStats[1]).toEqual({ gir: true, putts: 0 });
    });

    it('a fringe putt never counted as a putt, so Delete leaves putts alone', async () => {
        me().scores[1] = 3;
        me().simpleStats[1] = { putts: 1 };
        AppState.currentHoleShots = [{ id: 'fr', hole: 1, shotNumber: 3, club: 'Putter', isOffGreen: true }];
        await deleteStored('fr');
        expect(me().scores[1]).toBe(2);
        expect(me().simpleStats[1].putts).toBe(1);
    });

    it('shot 2 from the Rough: Delete drops the FW its lie worked out', async () => {
        me().scores[1] = 1;
        AppState.currentShotData = { hole: 1, shotNumber: 2, club: '7 Iron', lie: 'Rough' };
        await Promise.race([saveShotData(), settle()]);
        dismissUndoCard();
        expect(me().simpleStats[1]).toMatchObject({ fwy: false, fwyAuto: true });
        await deleteStored(AppState.currentHoleShots[0].id);
        expect(me().scores[1]).toBe(1);
        expect('fwy' in me().simpleStats[1]).toBe(false);
        expect('fwyAuto' in me().simpleStats[1]).toBe(false);
    });

    it('a FW the golfer set by hand stays when shot 2 is deleted', async () => {
        me().scores[1] = 2;
        me().simpleStats[1] = { fwy: true };
        AppState.currentHoleShots = [{ id: 's2', hole: 1, shotNumber: 2, club: '7 Iron', lie: 'Rough' }];
        await deleteStored('s2');
        expect(me().simpleStats[1].fwy).toBe(true);
    });

    it('reverses the STORED shot, not edits made in the open wizard before deleting', async () => {
        me().scores[1] = 2;
        me().simpleStats[1] = { putts: 0 };
        AppState.currentHoleShots = [{ id: 'd2', hole: 1, shotNumber: 2, club: '7 Iron' }];
        AppState.currentShotData = { id: 'd2', hole: 1, shotNumber: 2, club: 'Putter' }; // changed, not saved
        document.body.classList.add('active-wizard-mode');
        await deleteShotData();
        expect(me().scores[1]).toBe(1);
        expect(me().simpleStats[1].putts).toBe(0);
    });
});

describe('D30 (Codex P2): an edit keeps the putt count true, so a later Delete is exact', () => {
    it('a shot edited from 7 Iron to Putter counts a putt; deleting it takes that putt back', async () => {
        me().scores[1] = 3;
        me().simpleStats[1] = { putts: 1 };
        AppState.currentHoleShots = [
            { id: 'p3', hole: 1, shotNumber: 3, club: 'Putter' },
            { id: 's2', hole: 1, shotNumber: 2, club: '7 Iron' },
        ];
        AppState.currentShotData = { id: 's2', hole: 1, shotNumber: 2, club: 'Putter' };
        await Promise.race([saveShotData(), settle()]);
        expect(me().simpleStats[1].putts).toBe(2);
        await deleteStored('s2');
        expect(me().simpleStats[1].putts).toBe(1);
        expect(me().scores[1]).toBe(2);
    });

    it('a putt edited to a chip loses its putt; deleting it leaves the other putt alone', async () => {
        me().scores[1] = 3;
        me().simpleStats[1] = { putts: 2 };
        AppState.currentHoleShots = [
            { id: 'a', hole: 1, shotNumber: 2, club: 'Putter' },
            { id: 'b', hole: 1, shotNumber: 3, club: 'Putter' },
        ];
        AppState.currentShotData = { id: 'a', hole: 1, shotNumber: 2, club: 'SW' };
        await Promise.race([saveShotData(), settle()]);
        expect(me().simpleStats[1].putts).toBe(1);
        await deleteStored('a');
        expect(me().simpleStats[1].putts).toBe(1);
    });

    it('logging a planned putt counts the stroke and the putt', async () => {
        me().scores[1] = 2;
        AppState.currentHoleShots = [{ id: 'pp', hole: 1, shotNumber: 3, planned: true, club: 'Putter' }];
        AppState.currentShotData = { id: 'pp', hole: 1, shotNumber: 3, planned: true, club: 'Putter', puttControl: 'Short' };
        await Promise.race([saveShotData(), settle()]);
        expect(me().scores[1]).toBe(3);
        expect(me().simpleStats[1].putts).toBe(1);
    });
});

describe('D30: the Undo card goes through the same path', () => {
    it('Undo of a putt still takes back stroke, putt and GIR', async () => {
        me().scores[1] = 2;
        AppState.currentShotData = { hole: 1, shotNumber: 3, club: 'Putter', puttControl: 'Short' };
        await Promise.race([saveShotData(), settle()]);
        undoBtn().click();
        expect(me().scores[1]).toBe(2);
        expect(me().simpleStats[1].putts).toBe(0);
        expect(me().simpleStats[1].gir).toBeUndefined();
        expect(me().simpleStats[1].girAuto).toBeUndefined();
        expect(snapshot().currentHoleShots).toEqual([]);
    });
});

describe('D30: shot-list writes go through mutateList (D-03)', () => {
    it('editing a shot reaches the round snapshot even when nothing else saves', async () => {
        AppState.currentHoleShots = [{ id: 's1', hole: 1, shotNumber: 1, club: 'Driver' }];
        me().scores[1] = 1;
        localStorage.clear();
        AppState.currentShotData = { id: 's1', hole: 1, shotNumber: 1, club: '3 Wood' };
        localStorage.clear(); // only the edit's own write may fill it
        await Promise.race([saveShotData(), settle()]);
        expect(snapshot()?.currentHoleShots?.[0]?.club).toBe('3 Wood');
    });

    it('a new shot replaces the list (no in-place push)', async () => {
        const before = AppState.currentHoleShots;
        AppState.currentShotData = { hole: 1, shotNumber: 1, club: 'Driver' };
        await Promise.race([saveShotData(), settle()]);
        expect(before).toHaveLength(0);
        expect(AppState.currentHoleShots).toHaveLength(1);
    });
});
