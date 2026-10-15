// ==========================================================================
// whs-established-index.test.js
// The 54-hole minimum is for a FIRST index only (WHS Rule 5.2).
// ==========================================================================
//
// calculateIndex runs on every whs_rounds snapshot. With the 54-hole gate
// applied unconditionally, a player whose index rests on six nines who then
// marked one nine "not counting" (45 holes left) lost their index: the app
// showed none, while profiles/{uid} kept the old figure because a null index
// is never published. Once established, the index is recalculated from the
// scores available (five scores -> best 1, no adjustment).
//
// "Established" is read from persisted data: the index history
// (users/{uid}/private/handicap, or a legacy profiles/{uid}.indexHistory not
// yet migrated), which only updateUserHandicapIndexArray writes and only with
// a real index.
// A declared starting index (handicapIndex alone) does not count.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ profile: null, snapshotCb: null, updates: [], sets: [] }));

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {} }));
vi.mock('firebase/firestore', () => ({
    doc: vi.fn((_db, col, id) => ({ _path: `${col}/${id}` })),
    getDoc: vi.fn(async () => (h.profile
        ? { exists: () => true, data: () => h.profile }
        : { exists: () => false, data: () => ({}) })),
    setDoc: vi.fn(async (ref, data) => { h.sets.push(data); }),
    updateDoc: vi.fn(async (ref, data) => { h.updates.push(data); }),
    getDocs: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn((q, cb) => { h.snapshotCb = cb; return () => {}; }),
    addDoc: vi.fn(), serverTimestamp: vi.fn(), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const { calculateIndex, listenToWHSRounds } = await import('../../src/whs.js');
const { AppState } = await import('../../src/state.js');

// A nine on CR 36 / SR 113 with no prior index: (AGS − 36) doubled.
const nine = (id, ags, extra = {}) => ({ id, rating: 36, slope: 113, adjustedGross: ags, holesPlayed: 9, notCounting: false, ...extra });
// Six nines, differentials 20, 22, 24, 26, 28, 30; the best (a, 20) excluded.
const sixNinesOneExcluded = () => [
    nine('a', 46, { notCounting: true }), nine('b', 47), nine('c', 48),
    nine('d', 49), nine('e', 50), nine('f', 51)
];

async function fireSnapshot(rounds) {
    const snapshot = { forEach: (fn) => rounds.forEach(r => fn({ id: r.id, data: () => ({ ...r }) })) };
    await h.snapshotCb(snapshot);
    await new Promise(r => setTimeout(r, 0)); // let the profile publish settle
}

describe('calculateIndex: the 54-hole gate is for a first index only', () => {
    it('not established: 45 counting holes give no index', () => {
        expect(calculateIndex(sixNinesOneExcluded()).index).toBeNull();
    });

    it('45 holes leave only two complete pairs, so no new index is manufactured', () => {
        const res = calculateIndex(sixNinesOneExcluded(), null, null, true);
        expect(res.index).toBeNull();expect(res.usedIds).toEqual([]);
    });

    it('established still needs three scores (the 5.2 table starts at 3)', () => {
        expect(calculateIndex([nine('a', 46), nine('b', 47)], null, null, true).index).toBeNull();
    });
});

describe('listenToWHSRounds decides "established" from the stored profile', () => {
    beforeEach(() => {
        h.profile = null; h.snapshotCb = null; h.updates = []; h.sets = [];
        AppState.currentUser = { uid: 'u1' };
        AppState.viewingPlayerId = 'u1';
        AppState.handicapIndex = null;
        listenToWHSRounds();
    });

    it('a published indexHistory keeps the index after a nine is excluded', async () => {
        // Index first established at 20.0 from the six nines (doubled, no prior HI).
        h.profile = { handicapIndex: '20.0', indexHistory: [{ date: new Date().toISOString(), index: '20.0' }] };
        await fireSnapshot(sixNinesOneExcluded());
        // Fewer than three complete scores: retain the known index, publish nothing new.
        expect(AppState.handicapIndex).toBe('20.0');
        expect(h.updates).toEqual([]);expect(h.sets).toEqual([]);
    });

    it('no indexHistory: 45 holes give no index and nothing is published', async () => {
        h.profile = { displayName: 'New' };
        await fireSnapshot(sixNinesOneExcluded());
        expect(AppState.handicapIndex).toBeNull();
        expect(h.updates).toEqual([]);
        expect(h.sets).toEqual([]);
    });

    it('a declared starting index alone does not count as established', async () => {
        h.profile = { handicapIndex: '18.0', handicapIndexSource: 'declared' };
        await fireSnapshot(sixNinesOneExcluded());
        // No calculated index from 45 holes: the declared 18.0 stays the one in
        // use and on show (#261), and nothing is published over it.
        expect(AppState.handicapIndex).toBe('18.0');
        expect(h.updates).toEqual([]);
    });
});
