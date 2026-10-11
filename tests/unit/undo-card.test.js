// @vitest-environment jsdom
// ==========================================
// undo-card.test.js — glass chips PR 2: the 6 s Undo card after logging
// ==========================================
// Mock pattern from offline-writes.test.js: real AppState / oncourse /
// score-input, Firestore stubbed (writes never settle — offline-safe).

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
import { saveShotData, startNewShotInput } from '../../src/modules/score-input.js';
import { showUndoCard, dismissUndoCard, UNDO_CARD_MS } from '../../src/modules/undo-card.js';
import { undoCardText } from '../../src/wizard-flow.js';

const settle = () => new Promise(r => setTimeout(r, 20));
const card = () => document.querySelector('.undo-card');
const undoBtn = () => document.querySelector('.undo-card .undo-card-btn');
const statusTexts = () => [...document.querySelectorAll('[role="status"]')].map(e => e.textContent);

function startRound() {
    document.body.innerHTML = `
        <div id="oncourse-wizard"></div><div id="oc-hole-display"></div><div id="oc-par-display"></div>
        <select id="oc-par-select"></select><div id="oc-group-scores"></div>
        <button id="btn-oc-next-hole"></button><button id="btn-oc-track-shot"></button>
        <div id="hole-jumper-container"></div>`;
    AppState.currentUser = { uid: 'u1' };
    AppState.currentCoursePars = [4, 4, 3, 4, 5, 4, 3, 5, 4];
    AppState.currentRoundHoles = 9;
    AppState.currentTrackingMode = 'detailed';
    AppState.currentHoleShots = [];
    AppState.liveRoundGroups = [{ uid: 'u1', name: 'Alex', dailyHandicap: 7, scores: { 1: 1 }, compStats: {}, simpleStats: {} }];
    AppState.currentHole = 1;
    AppState.activeRoundId = `round_${++autoId}`;
}

afterEach(() => { dismissUndoCard(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('undoCardText', () => {
    it('names shot, club, lie and actual carry — and keeps "logged"', () => {
        expect(undoCardText({ shotNumber: 2, clubLabel: '6i', lie: 'Fairway', carryM: 140.4 }))
            .toBe('Shot 2 logged · 6i · Fairway · 140 m');
    });
    it('leaves out what it does not know, never invents it', () => {
        expect(undoCardText({ shotNumber: 1, clubLabel: 'Dr' })).toBe('Shot 1 logged · Dr');
        expect(undoCardText({ shotNumber: 3, carryM: null, lie: '' })).toBe('Shot 3 logged');
        expect(undoCardText({ shotNumber: 3, carryM: 0 })).toBe('Shot 3 logged');
    });
});

describe('showUndoCard', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('is a role=status card with a 48px-class Undo button; Undo runs once and closes', () => {
        const onUndo = vi.fn();
        showUndoCard('Shot 2 logged · 6i', onUndo);
        expect(card().getAttribute('role')).toBe('status');
        expect(card().textContent).toContain('Shot 2 logged · 6i');
        undoBtn().click();
        expect(onUndo).toHaveBeenCalledTimes(1);
        expect(card()).toBeNull();
    });

    it('disappears on its own after 6 s without undoing', () => {
        vi.useFakeTimers();
        const onUndo = vi.fn();
        showUndoCard('x', onUndo);
        vi.advanceTimersByTime(UNDO_CARD_MS - 1);
        expect(card()).not.toBeNull();
        vi.advanceTimersByTime(1);
        expect(card()).toBeNull();
        expect(onUndo).not.toHaveBeenCalled();
        expect(UNDO_CARD_MS).toBe(6000);
    });

    it('a new card replaces the old one, whose undo lapses', () => {
        const a = vi.fn(), b = vi.fn();
        const first = showUndoCard('a', a);
        const staleBtn = first.querySelector('button');
        showUndoCard('b', b);
        expect(document.querySelectorAll('.undo-card')).toHaveLength(1);
        staleBtn.click();
        expect(a).not.toHaveBeenCalled();
    });
});

describe('logging a shot shows the Undo card; Undo reverses the save', () => {
    beforeEach(() => { deleted.length = 0; startRound(); });

    it('a new shot: card text, then Undo removes the shot, the stroke and the Firestore doc', async () => {
        AppState.currentShotData = {
            hole: 1, shotNumber: 2, club: '6 Iron', lie: 'Fairway',
            lineActual: [{ x: 0, y: 0 }, { x: 0, y: 140 }],
        };
        await Promise.race([saveShotData(), settle()]);
        expect(AppState.liveRoundGroups[0].scores[1]).toBe(2);
        expect(AppState.currentHoleShots).toHaveLength(1);
        expect(card().textContent).toContain('Shot 2 logged · 6i · Fairway · 140 m');

        const id = AppState.currentHoleShots[0].id;
        undoBtn().click();
        expect(AppState.currentHoleShots).toHaveLength(0);
        expect(AppState.liveRoundGroups[0].scores[1]).toBe(1);
        expect(deleted).toEqual([id]);
        expect(statusTexts().some(t => /Shot 2 undone/.test(t))).toBe(true);
        expect(card()).toBeNull();
    });

    it('Undo on a putt also takes back the putt and the GIR that save set', async () => {
        AppState.liveRoundGroups[0].scores[1] = 2;
        AppState.currentShotData = { hole: 1, shotNumber: 3, club: 'Putter', puttControl: 'Short' };
        await Promise.race([saveShotData(), settle()]);
        const st = AppState.liveRoundGroups[0].simpleStats[1];
        expect(st.putts).toBe(1);
        expect(st.gir).toBe(true);
        undoBtn().click();
        expect(st.putts).toBe(0);
        expect(st.gir).toBeUndefined();
        expect(AppState.liveRoundGroups[0].scores[1]).toBe(2);
    });

    it('a GIR that existed before the save survives Undo', async () => {
        AppState.liveRoundGroups[0].scores[1] = 2;
        AppState.liveRoundGroups[0].simpleStats[1] = { gir: true, putts: 1 };
        AppState.currentHoleShots = [{ id: 'old', hole: 1, club: 'Putter', shotNumber: 3 }];
        AppState.currentShotData = { hole: 1, shotNumber: 4, club: 'Putter', puttControl: 'Short' };
        await Promise.race([saveShotData(), settle()]);
        undoBtn().click();
        expect(AppState.liveRoundGroups[0].simpleStats[1]).toEqual({ gir: true, putts: 1 });
    });

    it('owner 2026-10-06: shot 2 from the Rough sets FW = missed on a par 4; Undo takes it back', async () => {
        AppState.currentCoursePars = [4, 4, 4];
        AppState.liveRoundGroups[0].scores[1] = 1;
        AppState.currentShotData = { hole: 1, shotNumber: 2, club: '7 Iron', lie: 'Rough' };
        await Promise.race([saveShotData(), settle()]);
        const st = AppState.liveRoundGroups[0].simpleStats[1];
        expect(st.fwy).toBe(false);
        undoBtn().click();
        expect('fwy' in st).toBe(false);
    });

    it('a FW the player set before survives Undo; a par 3 is never touched', async () => {
        AppState.currentCoursePars = [4, 3, 4];
        AppState.liveRoundGroups[0].simpleStats[1] = { fwy: true };
        AppState.currentShotData = { hole: 1, shotNumber: 2, club: '7 Iron', lie: 'Trees' };
        await Promise.race([saveShotData(), settle()]);
        expect(AppState.liveRoundGroups[0].simpleStats[1].fwy).toBe(false);
        undoBtn().click();
        expect(AppState.liveRoundGroups[0].simpleStats[1].fwy).toBe(true);

        AppState.currentHole = 2;
        AppState.currentShotData = { hole: 2, shotNumber: 2, club: 'PW', lie: 'Rough' };
        await Promise.race([saveShotData(), settle()]);
        expect(AppState.liveRoundGroups[0].simpleStats[2]?.fwy).toBeUndefined();
    });

    it('holing out keeps the plain toast (the hole auto-advances — no Undo)', async () => {
        AppState.liveRoundGroups[0].scores[1] = 3;
        AppState.currentShotData = { hole: 1, shotNumber: 4, club: 'Putter', puttControl: 'Holed' };
        await Promise.race([saveShotData(), settle()]);
        expect(card()).toBeNull();
        expect(statusTexts().some(t => /holed out/.test(t))).toBe(true);
    });

    it('editing an existing shot keeps the plain toast', async () => {
        AppState.currentHoleShots = [{ id: 's1', hole: 1, shotNumber: 1, club: 'Driver' }];
        AppState.currentShotData = { id: 's1', hole: 1, shotNumber: 1, club: '3 Wood' };
        await Promise.race([saveShotData(), settle()]);
        expect(card()).toBeNull();
        expect(statusTexts().some(t => /Shot 1 logged/.test(t))).toBe(true);
    });

    it('opening the next shot retires the card', async () => {
        AppState.currentShotData = { hole: 1, shotNumber: 2, club: '6 Iron' };
        await Promise.race([saveShotData(), settle()]);
        expect(card()).not.toBeNull();
        try { startNewShotInput(3); } catch { /* wizard DOM is minimal here */ }
        expect(card()).toBeNull();
        expect(AppState.currentHoleShots).toHaveLength(1);
    });

    it('after the hole changes, Undo refuses and says so instead of corrupting another hole', async () => {
        AppState.currentShotData = { hole: 1, shotNumber: 2, club: '6 Iron' };
        await Promise.race([saveShotData(), settle()]);
        AppState.currentHole = 2;
        undoBtn().click();
        expect(AppState.liveRoundGroups[0].scores[1]).toBe(2);
        expect(deleted).toEqual([]);
        expect(statusTexts().some(t => /no longer be undone/.test(t))).toBe(true);
    });
});

describe('owner 2026-10-06: Track opens with the club strip pick and the Routine chip', () => {
    beforeEach(startRound);
    const open = (n) => { try { startNewShotInput(n); } catch { /* minimal wizard DOM */ } };

    it('the next new shot starts with the picked club and Process & Commitment', () => {
        AppState.nextShotDefaults = { roundId: AppState.activeRoundId, hole: 1, shotNumber: 2, club: '7 Iron', routinePre: 'Pass' };
        open(2);
        expect(AppState.currentShotData).toMatchObject({ shotNumber: 2, club: '7 Iron', routines: { pre: 'Pass' } });
    });

    it('never leaks onto another shot, hole or round', () => {
        AppState.nextShotDefaults = { roundId: AppState.activeRoundId, hole: 1, shotNumber: 2, club: '7 Iron', routinePre: 'Fail' };
        open(3);
        expect(AppState.currentShotData.club).toBeUndefined();
        expect(AppState.currentShotData.routines).toBeUndefined();
        AppState.nextShotDefaults = { roundId: 'round_old', hole: 1, shotNumber: 2, club: '7 Iron' };
        open(2);
        expect(AppState.currentShotData.club).toBeUndefined();
    });
});

describe('Codex P2 (2026-10-06): planned shots get the Play-mode defaults and FW too', () => {
    beforeEach(startRound);

    it('reopening a planned shot fills only what the plan left empty', () => {
        AppState.currentHoleShots = [{ id: 'p2', hole: 1, shotNumber: 2, planned: true, routines: { pre: 'Fail' } }];
        AppState.nextShotDefaults = { roundId: AppState.activeRoundId, hole: 1, shotNumber: 2, club: 'PW', routinePre: 'Pass' };
        try { startNewShotInput(); } catch { /* minimal wizard DOM */ }
        expect(AppState.currentShotData).toMatchObject({ id: 'p2', club: 'PW', routines: { pre: 'Fail' } });
    });

    it('logging a planned shot 2 from the Rough sets FW = missed and counts the stroke', async () => {
        AppState.liveRoundGroups[0].scores[1] = 1;
        AppState.currentHoleShots = [{ id: 'p2', hole: 1, shotNumber: 2, planned: true }];
        AppState.currentShotData = { id: 'p2', hole: 1, shotNumber: 2, planned: true, club: '7 Iron', lie: 'Rough' };
        await Promise.race([saveShotData(), settle()]);
        expect(AppState.liveRoundGroups[0].scores[1]).toBe(2);
        expect(AppState.liveRoundGroups[0].simpleStats[1].fwy).toBe(false);
    });
});

describe('Codex P2 (2026-10-06): editing shot 2 keeps a hand-set FW unless the lie changed', () => {
    beforeEach(startRound);
    it('same lie: the recorded FW stays; a new lie: FW follows it', async () => {
        AppState.liveRoundGroups[0].scores[1] = 2;
        AppState.liveRoundGroups[0].simpleStats[1] = { fwy: true };
        AppState.currentHoleShots = [{ id: 's2', hole: 1, shotNumber: 2, club: '7 Iron', lie: 'Rough' }];
        AppState.currentShotData = { id: 's2', hole: 1, shotNumber: 2, club: '6 Iron', lie: 'Rough' };
        await Promise.race([saveShotData(), settle()]);
        expect(AppState.liveRoundGroups[0].simpleStats[1].fwy).toBe(true);
        AppState.currentShotData = { id: 's2', hole: 1, shotNumber: 2, club: '6 Iron', lie: 'Bunker' };
        await Promise.race([saveShotData(), settle()]);
        expect(AppState.liveRoundGroups[0].simpleStats[1].fwy).toBe(false);
    });
});

describe('Codex P2 (pass 4): a wizard opened before Play mode had the course takes the defaults late', () => {
    beforeEach(startRound);
    afterEach(() => document.body.classList.remove('active-wizard-mode'));
    it('fills only the empty club/routine of the open new shot', () => {
        document.body.classList.add('active-wizard-mode');
        AppState.currentShotData = { hole: AppState.currentHole, shotNumber: 1, roundId: AppState.activeRoundId };
        AppState.nextShotDefaults = { roundId: AppState.activeRoundId, hole: AppState.currentHole, shotNumber: 1, club: 'Driver', routinePre: 'yes' };
        document.dispatchEvent(new CustomEvent('play-shot-defaults'));
        expect(AppState.currentShotData.club).toBe('Driver');
        expect(AppState.currentShotData.routines).toEqual({ pre: 'yes' });
        AppState.currentShotData = { hole: AppState.currentHole, shotNumber: 1, roundId: AppState.activeRoundId, club: '3 Wood' };
        document.dispatchEvent(new CustomEvent('play-shot-defaults'));
        expect(AppState.currentShotData.club).toBe('3 Wood');
    });
});

describe('Codex P2 (pass 6): taking shot 2\'s lie off drops the FW it gave - not a hand-set one', () => {
    beforeEach(startRound);
    it('worked-out FW is cleared when the lie is removed', async () => {
        AppState.liveRoundGroups[0].scores[1] = 2;
        AppState.liveRoundGroups[0].simpleStats[1] = { fwy: false, fwyAuto: true }; // from 'Rough'
        AppState.currentHoleShots = [{ id: 's2', hole: 1, shotNumber: 2, club: '7 Iron', lie: 'Rough' }];
        AppState.currentShotData = { id: 's2', hole: 1, shotNumber: 2, club: '7 Iron', lie: null };
        await Promise.race([saveShotData(), settle()]);
        expect(AppState.liveRoundGroups[0].simpleStats[1].fwy).toBeUndefined();
    });
    it('a FW the player set by hand stays when the lie is removed', async () => {
        AppState.liveRoundGroups[0].scores[1] = 2;
        AppState.liveRoundGroups[0].simpleStats[1] = { fwy: true };
        AppState.currentHoleShots = [{ id: 's2', hole: 1, shotNumber: 2, club: '7 Iron', lie: 'Rough' }];
        AppState.currentShotData = { id: 's2', hole: 1, shotNumber: 2, club: '7 Iron', lie: null };
        await Promise.race([saveShotData(), settle()]);
        expect(AppState.liveRoundGroups[0].simpleStats[1].fwy).toBe(true);
    });
});

describe('Codex P2 (2634c1e review): a late Putter default switches the wizard to the putting sections', () => {
    beforeEach(startRound);
    afterEach(() => document.body.classList.remove('active-wizard-mode'));
    it('putting outcome shows; swing detail, miss pattern and lie hide', () => {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="section-putting-outcome" class="hidden"></div><details id="section-swing-detail"></details>
            <div id="section-miss-pattern"></div><div id="section-lie"></div>`);
        document.body.classList.add('active-wizard-mode');
        AppState.currentShotData = { hole: AppState.currentHole, shotNumber: 2, roundId: AppState.activeRoundId };
        AppState.nextShotDefaults = { roundId: AppState.activeRoundId, hole: AppState.currentHole, shotNumber: 2, club: 'Putter' };
        document.dispatchEvent(new CustomEvent('play-shot-defaults'));
        const hid = id => document.getElementById(id).classList.contains('hidden');
        expect(hid('section-putting-outcome')).toBe(false);
        expect(hid('section-swing-detail')).toBe(true);
        expect(hid('section-miss-pattern')).toBe(true);
        expect(hid('section-lie')).toBe(true);
    });
});
