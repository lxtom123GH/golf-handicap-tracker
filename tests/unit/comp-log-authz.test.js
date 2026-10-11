/**
 * PRODUCT SWEEP 2026-09-10, SECOND PASS — F-7.
 *
 * PR #136 added a client-side pre-check to the competition round form so the
 * user gets a clear message instead of a bare "Failed to log round." It read
 * `ownerId` and `invitedUIDs` off AppState.currentCompData — an object built
 * from three data-* attributes on an <option>, which has never carried either
 * field. So canLogForOthers() returned false on every path except
 * window.currentUserIsAdmin, and the competition OWNER could not enter a score
 * for a player in their own competition: "Invite them to the competition
 * first, or ask its owner to enter the score", said to the owner, about
 * somebody already invited.
 *
 * That is exactly the case firestore.rules:398-417 was widened to permit in
 * the same PR. Before #136 the write went through and the rules allowed it.
 * This suite pins the guard against the rule it mirrors.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
    writeBatch: vi.fn(), deleteDoc: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

import { AppState } from '../../src/state.js';
import { canLogForOthers, _setCompDocsForTest } from '../../src/competitions.js';

const OWNER = 'owner-uid';
const MATE = 'mate-uid';
const STRANGER = 'stranger-uid';

const comp = {
    id: 'comp1',
    name: 'Saturday Medal',
    ownerId: OWNER,
    invitedUIDs: [MATE]
};

describe('F-7 canLogForOthers reads the document that has the fields', () => {
    beforeEach(() => {
        _setCompDocsForTest([comp], 'comp1');
        delete window.currentUserIsAdmin;
        // The shape PR #136 was actually reading: no ownerId, no invitedUIDs.
        AppState.currentCompData = { name: 'Saturday Medal', rules: [], startingPoints: {} };
    });
    afterEach(() => { _setCompDocsForTest([], null); });

    it('lets the OWNER log a round for an invited player — the whole defect', () => {
        AppState.currentUser = { uid: OWNER };
        expect(canLogForOthers(MATE)).toBe(true);
    });

    it('lets an invited player log for the owner', () => {
        AppState.currentUser = { uid: MATE };
        expect(canLogForOthers(OWNER)).toBe(true);
    });

    it('lets one invited player log for another', () => {
        _setCompDocsForTest([{ ...comp, invitedUIDs: [MATE, 'mate2'] }], 'comp1');
        AppState.currentUser = { uid: MATE };
        expect(canLogForOthers('mate2')).toBe(true);
    });

    it('refuses a player who is not in the competition', () => {
        AppState.currentUser = { uid: STRANGER };
        expect(canLogForOthers(MATE)).toBe(false);
    });

    it('refuses logging FOR a player who is not in the competition', () => {
        AppState.currentUser = { uid: OWNER === MATE ? STRANGER : MATE };
        expect(canLogForOthers(STRANGER)).toBe(false);
    });

    it('still lets an admin log for anyone', () => {
        window.currentUserIsAdmin = true;
        AppState.currentUser = { uid: STRANGER };
        expect(canLogForOthers(STRANGER)).toBe(true);
    });

    it('refuses when nothing is loaded, rather than throwing', () => {
        _setCompDocsForTest([], null);
        AppState.currentCompData = null;
        AppState.currentUser = { uid: OWNER };
        expect(canLogForOthers(MATE)).toBe(false);
    });

    it('falls back to currentCompData when it carries the fields', () => {
        _setCompDocsForTest([], 'comp1');
        AppState.currentCompData = { ...comp };
        AppState.currentUser = { uid: OWNER };
        expect(canLogForOthers(MATE)).toBe(true);
    });
});
