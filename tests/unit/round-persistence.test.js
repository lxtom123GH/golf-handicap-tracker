// ==========================================
// round-persistence.test.js
// F-13 / F-14 / F-15 — the localStorage round snapshot
// ==========================================
//
// These exercise the REAL state.js Proxy and the REAL persistence.js
// stateChange listener; only Firestore and the DOM-cache module are mocked.
// The whole point of F-13 is that the Proxy cannot see an in-place mutation,
// so a test that stubs AppState would assume the conclusion away.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
    writeBatch: vi.fn(), deleteDoc: vi.fn()
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

vi.mock('../../src/ui.js', () => ({
    UI: { ocTeeSelect: null, ocAddedPlayersList: null, ocHoleEditorModal: null }
}));

vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

vi.mock('../../src/whs.js', () => ({
    calculateDailyHandicap: vi.fn(() => 0),
    calculateHoleStableford: vi.fn(() => 0),
    convertStablefordToAGS: vi.fn(() => 0),
    scoringUnavailableReason: vi.fn(() => null)
}));

vi.mock('../../src/course-data.js', () => ({
    COURSE_DATA: {}, KEPERRA_GPS: {}, getStrokeIndex: vi.fn(() => null), isRatableTee: vi.fn(() => false), isPlausibleRating: vi.fn(() => false)
}));

import { AppState } from '../../src/state.js';
import { loadHole, bindHoleNav } from '../../src/oncourse.js';
import { presentRestoredRound, saveRoundState } from '../../src/persistence.js';

const KEY = 'golf_round_state';
const snapshot = () => JSON.parse(localStorage.getItem(KEY) || 'null');

/** Put AppState into a mid-round shape, then bank a clean snapshot. */
function startRound(hole = 1, holes = 9) {
    AppState.currentUser = { uid: 'u1' };
    AppState.currentCoursePars = [4, 4, 3, 4, 5, 4, 3, 5, 4];
    AppState.currentRoundHoles = holes;
    AppState.liveRoundGroups = [{ uid: 'u1', name: 'Alex', scores: {}, compStats: {}, simpleStats: {} }];
    AppState.currentHole = hole;
    AppState.activeRoundId = 'round_1000';
}

describe('F-13 score taps reach localStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `
            <div id="oc-hole-display"></div>
            <div id="oc-par-display"></div>
            <select id="oc-par-select"></select>
            <div id="oc-group-scores"></div>
            <button id="btn-oc-prev-hole"></button>
            <button id="btn-oc-next-hole"></button>
        `;
        AppState.activeRoundId = null;
        startRound();
    });

    it('persists a stroke added with the + button', () => {
        loadHole();
        document.querySelector('.btn-grid-plus').click();

        expect(AppState.liveRoundGroups[0].scores[1]).toBe(1);
        expect(snapshot().liveRoundGroups[0].scores[1]).toBe(1);
    });

    it('persists a stroke removed with the − button', () => {
        loadHole();
        document.querySelector('.btn-grid-plus').click();
        document.querySelector('.btn-grid-plus').click();
        document.querySelector('.btn-grid-minus').click();

        expect(snapshot().liveRoundGroups[0].scores[1]).toBe(1);
    });

    it('persists fairway, GIR and putt taps', () => {
        loadHole();
        document.querySelector('.mini-stat:nth-child(1)').click(); // FW
        document.querySelector('.mini-stat:nth-child(2)').click(); // GIR
        document.querySelector('.putt-plus').click();

        const stats = snapshot().liveRoundGroups[0].simpleStats[1];
        expect(stats.fwy).toBe(true);
        expect(stats.gir).toBe(true);
        expect(stats.putts).toBe(1);
    });

    it('persists the FINAL hole, where Next opens the finish modal instead of incrementing', () => {
        startRound(9, 9);
        bindHoleNav();
        loadHole();
        document.querySelector('.btn-grid-plus').click();
        document.querySelector('.btn-grid-plus').click();

        // Nothing after this can rescue hole 9 — Next never increments here.
        expect(snapshot().liveRoundGroups[0].scores[9]).toBe(2);
    });

    it('saves on pagehide — the event a backgrounded phone actually fires', () => {
        loadHole();
        localStorage.removeItem(KEY);

        window.dispatchEvent(new Event('pagehide'));

        expect(snapshot().activeRoundId).toBe('round_1000');
    });

    it('saves when the tab goes hidden', () => {
        loadHole();
        localStorage.removeItem(KEY);
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

        document.dispatchEvent(new Event('visibilitychange'));

        expect(snapshot().activeRoundId).toBe('round_1000');
        vi.restoreAllMocks();
    });
});
