// ==========================================
// offline-writes.test.js
// F-11 / F-12 / F-18 — flows that await a Firestore write
// ==========================================
//
// Offline model. Verified against a real Firestore emulator with the real SDK
// in tests/offline/firestore-offline.test.js (`npm run test:offline`): with the
// network disabled, setDoc / addDoc / writeBatch.commit() promises stay PENDING
// — they never resolve and never reject — while getDocs resolves from cache.
// The stubs below reproduce exactly that and nothing else, so what these tests
// assert is "the user-visible outcome does not wait on the server ack".

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let autoId = 0;
// A fresh round id per test: the save path refuses to re-save a round it has
// already handed off, which is the F-12 double-tap guard doing its job.
let roundId = 'round_1000';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {} }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, name) => ({ _path: name })),
    query: vi.fn((c) => c),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    // doc(collection(db,'shots')) mints an id CLIENT-side — no network needed.
    doc: vi.fn((_db, col, id) => (typeof col === 'string'
        ? { _path: `${col}/${id}`, id }
        : { _path: `${_db?._path || 'auto'}/${++autoId}`, id: `auto-${autoId}` })),
    getDoc: vi.fn(() => new Promise(() => { })),
    // Reads fall back to the local cache offline, so these DO settle.
    getDocs: vi.fn(async () => ({ forEach: () => { }, size: 0 })),
    // Writes never settle offline.
    addDoc: vi.fn(() => new Promise(() => { })),
    setDoc: vi.fn(() => new Promise(() => { })),
    updateDoc: vi.fn(() => new Promise(() => { })),
    deleteDoc: vi.fn(() => new Promise(() => { })),
    writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => new Promise(() => { })) }))
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

vi.mock('../../src/ui.js', () => ({
    UI: { ocTeeSelect: null, ocAddedPlayersList: null, ocHoleEditorModal: null, penaltyModal: null, btnWizardDelete: null }
}));

vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

vi.mock('../../src/whs.js', () => ({
    calculateDailyHandicap: vi.fn(() => 0),
    calculateHoleStableford: vi.fn(() => 2),
    convertStablefordToAGS: vi.fn(() => 45),
    scoringUnavailableReason: vi.fn(() => null)
}));

vi.mock('../../src/course-data.js', () => ({
    COURSE_DATA: {}, KEPERRA_GPS: {}, getStrokeIndex: vi.fn(() => null),
    isRatableTee: vi.fn(() => false),
    isPlausibleRating: vi.fn(() => true)
}));

import { AppState } from '../../src/state.js';
import { bindHoleNav, loadHole } from '../../src/oncourse.js';
import { saveShotData } from '../../src/modules/score-input.js';
import { bindGlobalRoundActions } from '../../src/modules/event-binders.js';
import { writeBatch, doc, getDocs, where } from 'firebase/firestore';

/** A save/log must complete within a tick — never wait on the server ack. */
const settleUi = () => new Promise(r => setTimeout(r, 20));

/**
 * Go offline the way the browser reports it. Combined with the never-settling
 * write stubs above this is the full offline picture: navigator says offline,
 * reads answer from cache, writes hang.
 */
function goOffline() {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
}

afterEach(() => { vi.restoreAllMocks(); });

function startRound() {
    AppState.currentUser = { uid: 'u1' };
    AppState.currentCoursePars = [4, 4, 3, 4, 5, 4, 3, 5, 4];
    AppState.currentRoundHoles = 9;
    AppState.currentRoundCourseName = 'Keperra - Old Course (9 holes)';
    AppState.currentRoundTee = 'White (Men)';
    AppState.currentRoundRatings = { rating: 34, slope: 121, par: 36, counting: true };
    AppState.currentTrackingMode = 'detailed';
    AppState.currentHoleShots = [];
    AppState.currentLiveCompId = null;
    AppState.liveRoundGroups = [{ uid: 'u1', name: 'Alex', dailyHandicap: 7, scores: { 1: 4 }, compStats: {}, simpleStats: {} }];
    AppState.currentHole = 1;
    roundId = `round_${Date.now()}_${autoId}`;
    AppState.activeRoundId = roundId;
}

const roundDom = () => {
    document.body.innerHTML = `
        <div id="oncourse-wizard"></div>
        <div id="oc-hole-display"></div>
        <div id="oc-par-display"></div>
        <select id="oc-par-select"></select>
        <div id="oc-group-scores"></div>
        <button id="btn-oc-prev-hole"></button>
        <button id="btn-oc-next-hole"></button>
        <button id="btn-oc-finish"></button>
        <button id="btn-oc-save-whs"></button>
        <button id="btn-oc-exit"></button>
        <button id="btn-oc-finish-abandon"></button>
        <button id="btn-oc-finish-close"></button>
        <select id="oc-finish-holes"><option value="9" selected>9</option></select>
        <div id="oncourse-hub"></div>
        <div id="oncourse-setup"></div>
        <div id="oc-finish-modal"></div>
        <div id="oc-exit-bar"></div>
        <div id="oc-sub-nav"></div>
        <div id="hole-jumper-container"></div>
        <div id="tab-oncourse"></div>
        <div id="locker-milestones"></div>
        <div id="oc-locker-room" class="hidden"><div id="locker-room-msg"></div><div id="locker-room-err"></div></div>
    `;
};

describe('F-11 Detailed-mode shots are recorded offline', () => {
    beforeEach(() => {
        localStorage.clear();
        AppState.activeRoundId = null;
        roundDom();
        startRound();
        goOffline();
        AppState.currentShotData = { hole: 1, shotNumber: 2, club: '7 Iron', roundId };
    });

    it('adds the stroke without waiting for the server ack', async () => {
        await Promise.race([saveShotData(), settleUi()]);

        expect(AppState.liveRoundGroups[0].scores[1]).toBe(5);
        expect(AppState.currentHoleShots).toHaveLength(1);
        expect(AppState.currentHoleShots[0].id).toBeTruthy();
    });

    it('counts a putt and confirms with a toast offline', async () => {
        AppState.currentShotData = { hole: 1, shotNumber: 5, club: 'Putter', roundId };

        await Promise.race([saveShotData(), settleUi()]);

        expect(AppState.liveRoundGroups[0].simpleStats[1].putts).toBe(1);
        expect(document.body.textContent).toMatch(/logged/i); // S11: "Shot N logged · …"
    });

    it('persists the offline stroke to localStorage', async () => {
        await Promise.race([saveShotData(), settleUi()]);

        const saved = JSON.parse(localStorage.getItem('golf_round_state'));
        expect(saved.liveRoundGroups[0].scores[1]).toBe(5);
    });
});

describe('F-12 Save Round completes offline', () => {
    beforeEach(() => {
        localStorage.clear();
        AppState.activeRoundId = null;
        roundDom();
        startRound();
        goOffline();
        bindHoleNav();
        loadHole();
    });

    it('shows the Locker Room without waiting for the server ack', async () => {
        document.getElementById('btn-oc-save-whs').click();
        await settleUi();

        expect(AppState.activeTab).toBe('oc-locker-room');
        expect(document.getElementById('oc-locker-room').classList.contains('hidden')).toBe(false);
    });

    it('writes the resilient localStorage backup offline', async () => {
        document.getElementById('btn-oc-save-whs').click();
        await settleUi();

        const backups = Object.keys(localStorage).filter(k => k.startsWith('round_backup_'));
        expect(backups).toHaveLength(1);
        expect(JSON.parse(localStorage.getItem(backups[0])).players[0].scores[1]).toBe(4);
    });

    it('tells the player the round is saved locally, not synced', async () => {
        document.getElementById('btn-oc-save-whs').click();
        await settleUi();

        expect(document.getElementById('locker-room-msg').textContent).toMatch(/Locally/i);
    });

    it('a second tap cannot stack a duplicate competition write', async () => {
        AppState.currentLiveCompId = 'comp1';
        const btn = document.getElementById('btn-oc-save-whs');
        btn.click();
        btn.click();
        await settleUi();

        const { addDoc } = await import('firebase/firestore');
        expect(addDoc.mock.calls.filter(c => c[0]?._path === 'comp_rounds')).toHaveLength(1);
    });
});

describe('F-18 Abandon round works offline', () => {
    beforeEach(() => {
        localStorage.clear();
        AppState.activeRoundId = null;
        roundDom();
        startRound();
        goOffline();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        writeBatch.mockClear();
        doc.mockClear();
        bindGlobalRoundActions();
    });

    it('leaves the round immediately, without waiting for the server ack', async () => {
        document.getElementById('btn-oc-exit').click();
        await settleUi();

        expect(AppState.activeRoundId).toBeNull();
        expect(AppState.liveRoundGroups).toHaveLength(0);
        expect(localStorage.getItem('golf_round_state')).toBeNull();
        expect(document.getElementById('oncourse-setup').classList.contains('hidden')).toBe(false);
    });

    // Review P1 (PR #245): a whs_rounds delete in the same batch was refused
    // by the rules (no such doc for an unsaved round → resource is null) and
    // took the shot deletes down with it. Abandon never touches whs_rounds.
    it('never deletes a whs_rounds doc (it would sink the shot deletes)', async () => {
        document.getElementById('btn-oc-exit').click();
        await settleUi();

        expect(doc.mock.calls.filter(c => c[1] === 'whs_rounds')).toHaveLength(0);
    });

    // Simplify C21: ⋯ → ✕ Abandon used to only clear the round and left its
    // shots behind. It now runs the same flow as the summary's Abandon.
    it('⋯ Abandon deletes the round\'s shots too', async () => {
        const shotRefs = [{ _path: 'shots/a' }, { _path: 'shots/b' }];
        getDocs.mockImplementationOnce(async () => ({ forEach: (fn) => shotRefs.forEach(ref => fn({ ref })), size: 2 }));
        document.getElementById('btn-oc-exit').click();
        await settleUi();

        const batch = writeBatch.mock.results.at(-1).value;
        const deleted = batch.delete.mock.calls.map(c => c[0]._path);
        expect(deleted).toEqual(['shots/a', 'shots/b']);
        expect(batch.commit).toHaveBeenCalledTimes(1);
    });

    // Review P2: the shots read rule needs uid == you; an unfiltered query is
    // refused whole online, so the shots were never actually deleted.
    it('lists only your own shots of the round (the rules refuse an unfiltered query)', async () => {
        where.mockClear();
        document.getElementById('btn-oc-exit').click();
        await settleUi();

        expect(where).toHaveBeenCalledWith('uid', '==', 'u1');
        expect(where).toHaveBeenCalledWith('roundId', '==', roundId);
    });

    it('a refused shots read still leaves the round, and commits nothing', async () => {
        getDocs.mockImplementationOnce(async () => { throw new Error('permission-denied'); });
        document.getElementById('btn-oc-exit').click();
        await settleUi();

        expect(AppState.activeRoundId).toBeNull();
        expect(writeBatch).not.toHaveBeenCalled();
    });

    // Review P3: a double-tap asked twice.
    it('a double-tap on ✕ Abandon asks once', async () => {
        const btn = document.getElementById('btn-oc-exit');
        btn.click();
        btn.click();
        await settleUi();
        btn.click(); // round gone: no prompt at all
        await settleUi();

        expect(window.confirm).toHaveBeenCalledTimes(1);
    });

    // Review P1: saving doesn't end the round, and a reload in the locker room
    // restores it as live. Abandoning it then must keep the saved round.
    it('a round already saved (its backup carries the id) is left, never deleted', async () => {
        localStorage.setItem('round_backup_1', JSON.stringify({ roundId, players: [], synced: true }));
        getDocs.mockClear();
        document.getElementById('btn-oc-exit').click();
        await settleUi();

        expect(window.confirm.mock.calls[0][0]).toMatch(/already sent to save/);
        expect(AppState.activeRoundId).toBeNull();
        expect(writeBatch).not.toHaveBeenCalled();
        expect(getDocs).not.toHaveBeenCalled();
    });

    // Review P2 (Codex): a round saved before the upgrade has an id-less
    // backup and no marker. A backup written after the round started is its save.
    it('a round saved before the upgrade (id-less backup, no marker) is still left', async () => {
        const started = Number(roundId.split('_')[1]);
        localStorage.setItem(`round_backup_${started + 60_000}`, JSON.stringify({ players: [], synced: true }));
        getDocs.mockClear();
        document.getElementById('btn-oc-exit').click();
        await settleUi();

        expect(window.confirm.mock.calls[0][0]).toMatch(/already sent to save/);
        expect(writeBatch).not.toHaveBeenCalled();
        expect(getDocs).not.toHaveBeenCalled();
    });

    it('an id-less backup from an EARLIER round does not block deleting this one', async () => {
        const started = Number(roundId.split('_')[1]);
        localStorage.setItem(`round_backup_${started - 60_000}`, JSON.stringify({ players: [], synced: true }));
        document.getElementById('btn-oc-exit').click();
        await settleUi();

        expect(window.confirm.mock.calls[0][0]).toMatch(/shots will be deleted/);
        expect(getDocs).toHaveBeenCalled();
    });

    it('a saved round whose backups were pruned for space is still left (the saved-round marker)', async () => {
        localStorage.setItem('golf_last_saved_round', roundId);
        getDocs.mockClear();
        document.getElementById('btn-oc-exit').click();
        await settleUi();

        expect(window.confirm.mock.calls[0][0]).toMatch(/already sent to save/);
        expect(writeBatch).not.toHaveBeenCalled();
    });

    it('Save, then ⋯ Abandon in the same session: the saved round is left, not deleted', async () => {
        bindHoleNav();
        document.getElementById('btn-oc-save-whs').click();
        await settleUi();
        localStorage.clear(); // only the in-memory "this round was saved" remains
        writeBatch.mockClear();
        window.confirm.mockClear();
        document.getElementById('btn-oc-exit').click();
        await settleUi();

        expect(window.confirm.mock.calls[0][0]).toMatch(/already sent to save/);
        expect(writeBatch).not.toHaveBeenCalled();
    });

    it('the summary\'s ✕ Abandon round runs the same flow (one confirm, shots deleted)', async () => {
        bindHoleNav();
        getDocs.mockClear();
        document.getElementById('btn-oc-finish-abandon').click();
        await settleUi();

        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(window.confirm.mock.calls[0][0]).toMatch(/shots will be deleted/);
        expect(AppState.activeRoundId).toBeNull();
        expect(writeBatch).toHaveBeenCalledTimes(1);
        expect(getDocs).toHaveBeenCalledTimes(1); // the shots read
        expect(doc.mock.calls.filter(c => c[1] === 'whs_rounds')).toHaveLength(0);
    });
});
