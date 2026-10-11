// ==========================================
// storage-resilience.test.js
// F-14 / F-15 — the round snapshot must survive a full disk and a wrong uid
// ==========================================
//
// These exercise the REAL state.js Proxy and the REAL persistence.js
// stateChange listener; only Firestore and the DOM-cache module are mocked,
// because both defects live in the interaction between the two.

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

describe('F-14 the round snapshot survives a full localStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        AppState.activeRoundId = null;
        startRound();
    });

    it('prunes stale round_backup_* keys and retries instead of throwing', () => {
        localStorage.setItem('round_backup_1000', 'old');
        localStorage.setItem('round_backup_2000', 'newer');

        // The Node/jsdom fallback has its own prototype; spy on the active store.
        const storagePrototype = Object.getPrototypeOf(localStorage);
        const real = storagePrototype.setItem;
        let full = true;
        const spy = vi.spyOn(storagePrototype, 'setItem').mockImplementation(function (k, v) {
            if (full && k === KEY) {
                full = false; // one throw, as a real quota trip behaves after a prune
                const err = new Error('QuotaExceededError');
                err.name = 'QuotaExceededError';
                throw err;
            }
            return real.call(this, k, v);
        });

        try {
            expect(() => saveRoundState()).not.toThrow();
            expect(spy).toHaveBeenCalledTimes(2); // prove the quota throw and retry both ran
        } finally { spy.mockRestore(); }

        expect(snapshot().activeRoundId).toBe('round_1000');
        expect(localStorage.getItem('round_backup_1000')).toBeNull();
    });
});

describe('F-15 a round belonging to another uid is hidden, never erased', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        AppState.activeRoundId = null;
        startRound();
    });

    it('leaves the snapshot on disk when the signed-in uid is not in the group', () => {
        expect(snapshot().activeRoundId).toBe('round_1000');

        presentRestoredRound('someone-else');

        expect(snapshot()).not.toBeNull();
        expect(snapshot().activeRoundId).toBe('round_1000');
        expect(snapshot().liveRoundGroups[0].uid).toBe('u1');
        expect(document.body.classList.contains('round-active')).toBe(false);
    });

    it('the rightful owner still finds the round after a wrong-user boot', () => {
        presentRestoredRound('someone-else');

        // Fresh boot for the real owner: hydrate from what is still on disk.
        const saved = snapshot();
        expect(saved.liveRoundGroups.some(p => p.uid === 'u1')).toBe(true);
    });
});
