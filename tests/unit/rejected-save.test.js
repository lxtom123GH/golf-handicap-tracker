// ==========================================
// rejected-save.test.js
// PRODUCT SWEEP 2026-09-10, SECOND PASS — F-5 (critical)
// ==========================================
//
// PR #135 made the cloud writes fire-and-forget, which is the right answer for
// the offline case it was aimed at: under persistentLocalCache an offline write
// promise never settles, so awaiting it hung the whole save. But it also
// deleted the only place a REJECTED write was ever noticed — `anyCloudFail`
// went from being set in the catch to being seeded once from navigator.onLine
// and never touched again.
//
// The distinction this file pins, and which the fix rests on: an OFFLINE write
// never rejects (Firestore queues it and replays on reconnect — verified
// against a real emulator in tests/offline/firestore-offline.test.js). So a
// rejection that actually ARRIVES is a real refusal, and the one thing
// "Round Saved Successfully" must never be shown for.
//
// It is not hypothetical. The app writes one whs_rounds document PER PLAYER in
// the group, and firestore.rules:315-318 allows only your own — a fact the
// repo's own green rules suite already proves (tests/rules/firestore.test.js:35
// asserts assertFails on exactly this write). So a player who marks a mate's
// card was told both rounds saved, and only theirs had.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let autoId = 0;
let roundId = 'round_2000';
let setDocBehaviour = () => Promise.resolve();

vi.mock('../../src/firebase-config.js', () => ({
    db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {}
}));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, name) => ({ _path: name })),
    query: vi.fn((c) => c),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    doc: vi.fn((_db, col, id) => (typeof col === 'string'
        ? { _path: `${col}/${id}`, id }
        : { _path: `${_db?._path || 'auto'}/${++autoId}`, id: `auto-${autoId}` })),
    getDoc: vi.fn(() => new Promise(() => { })),
    getDocs: vi.fn(async () => ({ forEach: () => { }, size: 0 })),
    addDoc: vi.fn(() => Promise.resolve({ id: 'comp-1' })),
    setDoc: vi.fn((...args) => setDocBehaviour(...args)),
    updateDoc: vi.fn(() => Promise.resolve()),
    deleteDoc: vi.fn(() => Promise.resolve()),
    writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) }))
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/ui.js', () => ({
    UI: { ocTeeSelect: null, ocAddedPlayersList: null, ocHoleEditorModal: null, penaltyModal: null, btnWizardDelete: null }
}));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));
vi.mock('../../src/whs.js', () => ({
    calculateDailyHandicap: vi.fn(() => 7),
    calculateHoleStableford: vi.fn(() => 2),
    convertStablefordToAGS: vi.fn(() => 45),
    scoringUnavailableReason: vi.fn(() => null)
}));
const proposeMock = vi.fn(async () => 'pending-1');
vi.mock('../../src/pending-rounds.js', () => ({
    proposeRound: (...a) => proposeMock(...a),
}));
vi.mock('../../src/guests.js', () => ({
    isGuestId: (uid) => typeof uid === 'string' && uid.startsWith('guest_') && uid.length > 6,
}));
vi.mock('../../src/course-data.js', () => ({
    COURSE_DATA: {}, KEPERRA_GPS: {}, getStrokeIndex: vi.fn(() => [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    isRatableTee: vi.fn(() => false),
    isPlausibleRating: vi.fn(() => true),
    holesForPar: (par) => (Number(par) > 0 && Number(par) <= 40 ? 9 : 18)
}));

import { AppState } from '../../src/state.js';
import { bindHoleNav, loadHole } from '../../src/oncourse.js';
import { setDoc } from 'firebase/firestore';

const settleUi = () => new Promise(r => setTimeout(r, 20));

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
        <select id="oc-finish-holes"><option value="9" selected>9</option></select>
        <div id="oncourse-hub"></div>
        <div id="oncourse-setup"></div>
        <div id="oc-finish-modal"></div>
        <div id="oc-exit-bar"></div>
        <div id="oc-sub-nav"></div>
        <div id="hole-jumper-container"></div>
        <div id="tab-oncourse"></div>
        <div id="locker-milestones"></div>
        <div id="oc-locker-room" class="hidden">
            <div id="locker-room-msg"></div>
            <p id="locker-room-err" class="hidden"></p>
            <p id="locker-room-note" class="hidden"></p>
        </div>`;
};

function startRound(players) {
    AppState.currentUser = { uid: 'u1' };
    AppState.currentCoursePars = [4, 4, 3, 4, 5, 4, 3, 5, 4];
    AppState.currentRoundHoles = 9;
    AppState.currentRoundCourseName = 'Keperra – Old Course (9 holes)';
    AppState.currentRoundTee = 'White (Men)';
    AppState.currentRoundRatings = { rating: 34, slope: 121, par: 36, counting: true };
    AppState.currentTrackingMode = 'simple';
    AppState.currentHoleShots = [];
    AppState.currentLiveCompId = null;
    AppState.viewingPlayerId = 'u1';
    AppState.liveRoundGroups = players;
    AppState.currentHole = 1;
    roundId = `round_${Date.now()}_${++autoId}`;
    AppState.activeRoundId = roundId;
}

const self = () => ({ uid: 'u1', name: 'Alex', dailyHandicap: 7, dailyHandicapHoles: 9, scores: { 1: 4 }, compStats: {}, simpleStats: {} });
const guest = () => ({ uid: 'guest_dad', name: 'Dad', isGuest: true, dailyHandicap: 18, dailyHandicapHoles: 9, scores: { 1: 6 }, compStats: {}, simpleStats: {} });
const partner = () => ({ uid: 'u2', name: 'Bob', dailyHandicap: 12, dailyHandicapHoles: 9, scores: { 1: 5 }, compStats: {}, simpleStats: {} });

const whsWrites = () => setDoc.mock.calls.filter(c => String(c[0]?._path).startsWith('whs_rounds'));
const save = async () => { document.getElementById('btn-oc-save-whs').click(); await settleUi(); };

describe('F-5 a save that is REFUSED never reports success', () => {
    beforeEach(() => {
        localStorage.clear();
        setDoc.mockClear();
        setDocBehaviour = () => Promise.resolve();
        delete window.currentUserIsAdmin;
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        AppState.activeRoundId = null;
        roundDom();
        startRound([self()]);
        bindHoleNav();
        loadHole();
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('says Saved Successfully when the write is accepted', async () => {
        await save();
        expect(document.getElementById('locker-room-msg').textContent).toMatch(/Successfully/i);
        expect(document.getElementById('locker-room-err').classList.contains('hidden')).toBe(true);
    });

    it('does NOT say Saved Successfully when the rules refuse the write', async () => {
        setDocBehaviour = () => Promise.reject(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
        await save();
        expect(document.getElementById('locker-room-msg').textContent).not.toMatch(/Saved Successfully/i);
        expect(document.getElementById('locker-room-err').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('locker-room-err').textContent).toBeTruthy();
    });

    it('marks the local backup unsynced when the write was refused', async () => {
        setDocBehaviour = () => Promise.reject(new Error('permission-denied'));
        await save();
        const key = Object.keys(localStorage).find(k => k.startsWith('round_backup_'));
        expect(JSON.parse(localStorage.getItem(key)).synced).toBe(false);
    });

    it('still does not wait on the server ack — a hanging write is not a failure', async () => {
        setDocBehaviour = () => new Promise(() => { }); // offline: never settles
        await save();
        expect(AppState.activeTab).toBe('oc-locker-room');
        // Online + never-settling is not a refusal, so no error banner.
        expect(document.getElementById('locker-room-err').classList.contains('hidden')).toBe(true);
    });
});

describe('F-5 a group round does not write documents the rules will refuse', () => {
    beforeEach(() => {
        localStorage.clear();
        setDoc.mockClear();
        setDocBehaviour = () => Promise.resolve();
        delete window.currentUserIsAdmin;
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        AppState.activeRoundId = null;
        roundDom();
        startRound([self(), partner()]);
        bindHoleNav();
        loadHole();
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('writes only the signed-in player to whs_rounds', async () => {
        await save();
        const paths = whsWrites().map(c => c[0]._path);
        expect(paths).toEqual([`whs_rounds/${roundId}_u1`]);
        // Before the fix a second document was written for u2 and refused by
        // firestore.rules:315-318, while the screen said both had saved.
        expect(paths.some(p => p.endsWith('_u2'))).toBe(false);
    });

    it('tells the player, by name, whose card did not reach their record', async () => {
        await save();
        const note = document.getElementById('locker-room-note');
        expect(note.classList.contains('hidden')).toBe(false);
        expect(note.textContent).toContain('Bob');
    });

    it('says nothing of the sort for a solo round', async () => {
        startRound([self()]);
        await save();
        expect(document.getElementById('locker-room-note').textContent).not.toContain('Bob');
    });

    it('an admin may write for the whole group — that route is still open', async () => {
        window.currentUserIsAdmin = true;
        startRound([self(), partner()]);
        await save();
        const paths = whsWrites().map(c => c[0]._path).sort();
        expect(paths).toEqual([`whs_rounds/${roundId}_u1`, `whs_rounds/${roundId}_u2`].sort());
    });
});


describe('F-5 a guest IS written, because they are a golfer you own', () => {
    beforeEach(() => {
        localStorage.clear();
        setDoc.mockClear();
        setDocBehaviour = () => Promise.resolve();
        delete window.currentUserIsAdmin;
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        AppState.activeRoundId = null;
        roundDom();
        startRound([self(), guest()]);
        bindHoleNav();
        loadHole();
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it("writes the guest's round as well as your own", async () => {
        await save();
        const paths = whsWrites().map(c => c[0]._path).sort();
        expect(paths).toEqual([
            `whs_rounds/${roundId}_guest_dad`,
            `whs_rounds/${roundId}_u1`,
        ].sort());
    });

    it('names you as the guest owner, which is what the rule checks', async () => {
        await save();
        const guestWrite = whsWrites().find(c => String(c[0]._path).includes('guest_dad'));
        expect(guestWrite[1].guestOwnerUid).toBe('u1');
        expect(guestWrite[1].uid).toBe('guest_dad');
    });

    it('does NOT put a guestOwnerUid on your own round', async () => {
        await save();
        const mine = whsWrites().find(c => String(c[0]._path).endsWith('_u1'));
        expect(mine[1].guestOwnerUid).toBeUndefined();
    });

    it('says nothing about partners not being saved, because none were skipped', async () => {
        await save();
        const note = document.getElementById('locker-room-note');
        expect(note.textContent).not.toContain('kept for this round only');
    });

    it('a REGISTERED partner is not written directly - their card is PROPOSED', async () => {
        // The distinction the whole design rests on. A guest has no account, so
        // the host writes their round. A registered player has one, so only they
        // may write their own record - their card is sent for them to sign.
        proposeMock.mockClear();
        startRound([self(), partner(), guest()]);
        await save();

        const paths = whsWrites().map(c => c[0]._path);
        expect(paths.some(p => p.endsWith('_guest_dad'))).toBe(true);
        expect(paths.some(p => p.endsWith('_u2'))).toBe(false);

        expect(proposeMock).toHaveBeenCalledTimes(1);
        const proposed = proposeMock.mock.calls[0][0];
        expect(proposed.playerUid).toBe('u2');
        expect(proposed.playerName).toBe('Bob');

        const note = document.getElementById('locker-room-note').textContent;
        expect(note).toContain('Bob');
        expect(note).toMatch(/sent to them to approve/i);
    });

    it('nobody is proposed a card in a solo round', async () => {
        proposeMock.mockClear();
        startRound([self()]);
        await save();
        expect(proposeMock).not.toHaveBeenCalled();
    });

    it('a guest is never sent a card to approve - they have no account', async () => {
        proposeMock.mockClear();
        startRound([self(), guest()]);
        await save();
        expect(proposeMock).not.toHaveBeenCalled();
    });
});
