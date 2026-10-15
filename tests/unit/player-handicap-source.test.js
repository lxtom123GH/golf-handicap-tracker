/**
 * PRODUCT SWEEP 2026-09-10, SECOND PASS — F-1.
 *
 * `getPlayerHandicap` is the ONLY place the on-course path learns a player's
 * Handicap Index. PR #137 taught `calculateIndex` and `calculateDailyHandicap`
 * to answer `null` for a player with no established index, and built a whole
 * UX on that answer — a dash in the Daily Handicap preview, an empty override
 * box, a round saved gross-only. None of it could ever fire, because this
 * function answered the NUMBER 0 (a scratch golfer) for a profile that carries
 * no index at all.
 *
 * Consequence, hand-calculated on Keperra Old (9): a genuine 26-marker who
 * shot 54 was given Daily Handicap -2 — a PLUS handicap, which ADDS strokes —
 * scored 1 Stableford point where Golf Australia gives 11, and had AGS 51
 * written to `whs_rounds` against a gross of 54.
 *
 * The suite that was supposed to cover this (`index-not-established.test.js`)
 * exercises the two whs.js functions in isolation and never touches the
 * function that feeds them. This is that missing test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));

const getDocMock = vi.fn();
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    addDoc: vi.fn(),
    serverTimestamp: vi.fn(),
    setDoc: vi.fn(),
    doc: vi.fn((_db, coll, id) => ({ coll, id })),
    updateDoc: vi.fn(),
    getDoc: (...args) => getDocMock(...args),
    getDocs: vi.fn(),
    writeBatch: vi.fn(),
    deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/ui.js', () => ({ UI: { ocTeeSelect: null, ocAddedPlayersList: null } }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));
vi.mock('../../src/course-data.js', () => ({
    COURSE_DATA: {},
    getStrokeIndex: vi.fn(() => null),
    holesForPar: (par) => (Number(par) > 0 && Number(par) <= 40 ? 9 : 18),
    isRatableTee: vi.fn(() => true),
    KEPERRA_GPS: {}
}));
vi.mock('../../src/state.js', () => ({
    AppState: {
        currentCoursePars: [],
        currentHole: 1,
        currentRoundHoles: 9,
        currentUser: { uid: 'new-golfer' },
        liveRoundGroups: []
    }
}));

import { getPlayerHandicap } from '../../src/oncourse.js';
import { calculateDailyHandicap, calculateHoleStableford, scoringUnavailableReason } from '../../src/whs.js';

const snap = (data) => ({ exists: () => data !== null, data: () => data });

describe('F-1 getPlayerHandicap is where "index not established" has to be born', () => {
    beforeEach(() => {
        getDocMock.mockReset();
        delete window.currentHandicapIndex;
    });

    it('answers null — not 0 — when the profile carries no handicapIndex', async () => {
        getDocMock.mockResolvedValue(snap({ displayName: 'New Golfer' }));
        await expect(getPlayerHandicap('new-golfer')).resolves.toBeNull();
    });

    it('answers null when the profile document does not exist at all', async () => {
        getDocMock.mockResolvedValue(snap(null));
        await expect(getPlayerHandicap('nobody')).resolves.toBeNull();
    });

    it('answers null when the read throws (offline, or rules refuse)', async () => {
        getDocMock.mockRejectedValue(new Error('permission-denied'));
        await expect(getPlayerHandicap('other-player')).resolves.toBeNull();
    });

    it('answers null when handicapIndex is stored as an unparseable value', async () => {
        getDocMock.mockResolvedValue(snap({ handicapIndex: '' }));
        await expect(getPlayerHandicap('broken')).resolves.toBeNull();
    });

    it('still returns a real established index as a number', async () => {
        getDocMock.mockResolvedValue(snap({ handicapIndex: 26.4 }));
        await expect(getPlayerHandicap('established')).resolves.toBe(26.4);
    });

    it('returns 0 for a genuine scratch golfer — 0 must keep meaning scratch', async () => {
        getDocMock.mockResolvedValue(snap({ handicapIndex: 0 }));
        await expect(getPlayerHandicap('scratch')).resolves.toBe(0);
    });

    // The chain this defect actually broke, end to end, with the real whs.js.
    it('the null now reaches calculateDailyHandicap, so the "—" branch can fire', async () => {
        getDocMock.mockResolvedValue(snap({ displayName: 'New Golfer' }));
        const hi = await getPlayerHandicap('new-golfer');
        // Keperra Old (9): slope 121, rating 34, par 36.
        expect(calculateDailyHandicap(hi, 121, 34, 36, 9, 'men')).toBeNull();
        // and the old behaviour is what a plus-2 looked like:
        expect(calculateDailyHandicap(0, 121, 34, 36, 9, 'men')).toBe(-2);
    });

    it('a null Daily Handicap makes the round unscorable, with a reason to show', async () => {
        getDocMock.mockResolvedValue(snap({ displayName: 'New Golfer' }));
        const hi = await getPlayerHandicap('new-golfer');
        const dh = calculateDailyHandicap(hi, 121, 34, 36, 9, 'men');
        expect(scoringUnavailableReason([4, 6, 7, 1, 8, 9, 2, 3, 5], dh)).toBeTruthy();
        // Before the fix dh was -2, scoringUnavailableReason returned null, and
        // every scoring surface proceeded as if the index were known:
        expect(scoringUnavailableReason([4, 6, 7, 1, 8, 9, 2, 3, 5], -2)).toBeNull();
    });

    it('the plus-2 that this produced really did cost a 26-marker ten points', () => {
        const pars = [5, 4, 4, 3, 5, 3, 4, 3, 5];
        const si = [4, 6, 7, 1, 8, 9, 2, 3, 5];
        const card = [7, 6, 6, 5, 8, 5, 6, 4, 7]; // gross 54
        const pts = (dh) => card.reduce((t, g, i) => t + calculateHoleStableford(g, pars[i], si[i], dh, 9), 0);
        expect(pts(-2)).toBe(1);   // what the app gave him
        expect(pts(11)).toBe(11);  // what Golf Australia gives him
    });
});
