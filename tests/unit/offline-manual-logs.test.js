// ==========================================
// offline-manual-logs.test.js
// PRODUCT SWEEP 2026-09-10, SECOND PASS — F-9
// ==========================================
//
// The first sweep's cross-cutting root cause said every flow that awaits a
// Firestore write and puts the user-visible outcome after it needs the same
// treatment. PR #135 applied it to three on-course flows. The two a golfer
// runs in exactly the same low-signal places were left alone, and both are
// worse than the on-course save was, because both leave the submit button
// DISABLED reading "Saving…":
//
//   "Log a past round"   (Handicap tab)  — whs.js addRound
//   "Log a practice drill" (Practice tab) — practice.js
//
// Offline model, as documented in tests/unit/offline-writes.test.js and
// verified against a real emulator in tests/offline/firestore-offline.test.js:
// with the network down a write promise stays PENDING — it never resolves and
// never rejects. So an await on it is an await forever, no alert, no error.
// The player's natural response is to reload and type the card in again, and
// because addDoc mints a new id every time, that produced a DUPLICATE round on
// reconnect.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let minted = 0;

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
    // The client-minted form needs no network — that is the fix.
    doc: vi.fn((dbOrCollRef, col, id) => (typeof col === 'string'
        ? { _path: `${col}/${id}`, id }
        : { _path: `${dbOrCollRef?._path}/minted-${++minted}`, id: `minted-${minted}` })),
    getDoc: vi.fn(() => new Promise(() => { })),
    getDocs: vi.fn(async () => ({ forEach: () => { }, size: 0 })),
    // Writes never settle offline.
    addDoc: vi.fn(() => new Promise(() => { })),
    setDoc: vi.fn(() => new Promise(() => { })),
    updateDoc: vi.fn(() => new Promise(() => { })),
    deleteDoc: vi.fn(() => new Promise(() => { })),
    writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => new Promise(() => { })) })),
    arrayUnion: vi.fn(), arrayRemove: vi.fn(), increment: vi.fn()
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('chart.js/auto', () => ({ default: vi.fn() }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

import { AppState } from '../../src/state.js';
import { addRound } from '../../src/whs.js';
import { setDoc, addDoc } from 'firebase/firestore';

/** A save must settle within a tick — never wait on the server ack. */
const settled = (promise, ms = 30) => {
    let done = null;
    promise.then(v => { done = { value: v }; }, e => { done = { error: e }; });
    return new Promise(r => setTimeout(() => r(done), ms));
};

describe('F-9 "Log a past round" does not hang offline', () => {
    beforeEach(() => {
        setDoc.mockClear();
        addDoc.mockClear();
        AppState.currentUser = { uid: 'u1' };
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('resolves without waiting for the server ack', async () => {
        const outcome = await settled(addRound('Keperra', 34, 121, 45, null, false, { holesPlayed: 9, datePlayed: '2026-09-01' }));
        // Before the fix this was still null at 30 ms — and at any later time.
        expect(outcome).not.toBeNull();
        expect(outcome.value).toBe(true);
    });

    it('hands the document to the SDK, whose local queue is the durability', async () => {
        await settled(addRound('Keperra', 34, 121, 45, null, false, { holesPlayed: 9, datePlayed: '2026-09-01' }));
        expect(setDoc).toHaveBeenCalledTimes(1);
        expect(String(setDoc.mock.calls[0][0]._path)).toMatch(/^whs_rounds\//);
        expect(setDoc.mock.calls[0][1]).toMatchObject({ uid: 'u1', course: 'Keperra', holesPlayed: 9 });
    });

    it('uses a client-minted id, so a retry cannot duplicate the round', async () => {
        await settled(addRound('Keperra', 34, 121, 45, null, false, { holesPlayed: 9, datePlayed: '2026-09-01' }));
        // addDoc mints server-side and returns a NEW id every call — which is
        // how a re-typed card became a second round on reconnect.
        expect(addDoc).not.toHaveBeenCalled();
        expect(setDoc.mock.calls[0][0].id).toBeTruthy();
    });

    it('still resolves promptly when online', async () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        const outcome = await settled(addRound('Keperra', 34, 121, 45, null, false, { holesPlayed: 18, datePlayed: '2026-09-01' }));
        expect(outcome.value).toBe(true);
    });

    it('still reports failure when the document cannot even be built', async () => {
        AppState.currentUser = null; // reading .uid throws inside the try
        const outcome = await settled(addRound('Keperra', 34, 121, 45));
        expect(outcome.value).toBe(false);
    });
});
