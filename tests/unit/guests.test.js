/**
 * Guest golfers — the client half.
 *
 * The security half is in tests/rules/guests.test.js, against a live emulator.
 * What matters here is the id: `guest_` is not cosmetic. Without it, anyone
 * could create `guests/<a real golfer's uid>`, name themselves its owner, and
 * write rounds into that golfer's handicap index. Firebase Auth uids are
 * 28-character alphanumerics and never contain an underscore, so the prefix is
 * what makes a guest id incapable of naming a real account — and the client must
 * not mint one that breaks it, or the user meets a permission error nobody can
 * explain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({
    db: {}, auth: { currentUser: { uid: 'hostuser000000000000000000' } }, functions: {}
}));

const setDocMock = vi.fn(async () => { });
const getDocsMock = vi.fn(async () => ({ docs: [] }));
const deleteDocMock = vi.fn(async () => { });

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, name) => ({ _path: name })),
    doc: vi.fn((_db, coll, id) => ({ _path: `${coll}/${id}`, id })),
    setDoc: (...a) => setDocMock(...a),
    getDocs: (...a) => getDocsMock(...a),
    deleteDoc: (...a) => deleteDocMock(...a),
    query: vi.fn((c) => c),
    where: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

import {
    GUEST_ID_PREFIX, isGuestId, newGuestId, createGuest, listGuests, deleteGuest
} from '../../src/guests.js';

beforeEach(() => {
    setDocMock.mockClear();
    getDocsMock.mockClear();
    deleteDocMock.mockClear();
});

describe('a guest id can never name a real account', () => {
    it('always carries the prefix', () => {
        for (let i = 0; i < 50; i++) {
            expect(newGuestId().startsWith(GUEST_ID_PREFIX)).toBe(true);
        }
    });

    it('is unique across mints, so two guests never share a handicap record', () => {
        const ids = new Set(Array.from({ length: 200 }, newGuestId));
        expect(ids.size).toBe(200);
    });

    it('recognises a guest id and rejects everything that is not one', () => {
        expect(isGuestId('guest_abc123')).toBe(true);
        // A Firebase Auth uid: 28 alphanumerics, no underscore. This is the
        // shape the prefix exists to be distinguishable from.
        expect(isGuestId('hostuser000000000000000000')).toBe(false);
        expect(isGuestId('guest_')).toBe(false);      // prefix alone is not an id
        expect(isGuestId('')).toBe(false);
        expect(isGuestId(null)).toBe(false);
        expect(isGuestId(undefined)).toBe(false);
        expect(isGuestId(12345)).toBe(false);
        expect(isGuestId('notguest_abc')).toBe(false);
    });
});

describe('creating a guest', () => {
    it('writes the guest under the signed-in owner', async () => {
        const guest = await createGuest('  Brother  ');
        expect(guest.name).toBe('Brother');
        expect(isGuestId(guest.uid)).toBe(true);

        const [ref, data] = setDocMock.mock.calls[0];
        expect(String(ref._path)).toBe(`guests/${guest.uid}`);
        expect(data.ownerUid).toBe('hostuser000000000000000000');
        expect(data.displayName).toBe('Brother');
    });

    it('refuses a nameless guest rather than writing an unlabelled record', async () => {
        await expect(createGuest('')).rejects.toThrow(/needs a name/i);
        await expect(createGuest('   ')).rejects.toThrow(/needs a name/i);
        expect(setDocMock).not.toHaveBeenCalled();
    });

    it('refuses a name the rules would reject, before the round trip', async () => {
        await expect(createGuest('x'.repeat(61))).rejects.toThrow(/too long/i);
        expect(setDocMock).not.toHaveBeenCalled();
    });

    it('refuses when nobody is signed in', async () => {
        const cfg = await import('../../src/firebase-config.js');
        const saved = cfg.auth.currentUser;
        cfg.auth.currentUser = null;
        try {
            await expect(createGuest('Brother')).rejects.toThrow(/sign in/i);
            expect(setDocMock).not.toHaveBeenCalled();
        } finally {
            cfg.auth.currentUser = saved;
        }
    });
});

describe('listing and removing guests', () => {
    it('returns the owner\'s guests with their names', async () => {
        getDocsMock.mockResolvedValueOnce({
            docs: [
                { id: 'guest_a', data: () => ({ displayName: 'Dad' }) },
                { id: 'guest_b', data: () => ({ displayName: 'Brother' }) },
            ]
        });
        // Owner 2026-09-20: each guest also carries a remembered daily
        // handicap; absent means null (automatic), never 0.
        expect(await listGuests()).toEqual([
            { uid: 'guest_a', name: 'Dad', dailyHandicap: null },
            { uid: 'guest_b', name: 'Brother', dailyHandicap: null },
        ]);
    });

    it('reads a remembered daily handicap, keeping scratch (0) and rejecting junk', async () => {
        getDocsMock.mockResolvedValueOnce({
            docs: [
                { id: 'guest_a', data: () => ({ displayName: 'Sam', dailyHandicap: 18 }) },
                { id: 'guest_b', data: () => ({ displayName: 'Scratch', dailyHandicap: 0 }) },
                { id: 'guest_c', data: () => ({ displayName: 'Junk', dailyHandicap: 'abc' }) },
            ]
        });
        expect(await listGuests()).toEqual([
            { uid: 'guest_a', name: 'Sam', dailyHandicap: 18 },
            { uid: 'guest_b', name: 'Scratch', dailyHandicap: 0 },
            { uid: 'guest_c', name: 'Junk', dailyHandicap: null },
        ]);
    });

    it('returns nothing when nobody is signed in, rather than querying', async () => {
        const cfg = await import('../../src/firebase-config.js');
        const saved = cfg.auth.currentUser;
        cfg.auth.currentUser = null;
        try {
            expect(await listGuests()).toEqual([]);
            expect(getDocsMock).not.toHaveBeenCalled();
        } finally {
            cfg.auth.currentUser = saved;
        }
    });

    it('refuses to delete anything that is not a guest', async () => {
        await expect(deleteGuest('hostuser000000000000000000')).rejects.toThrow(/not a guest/i);
        expect(deleteDocMock).not.toHaveBeenCalled();
    });

    it('deletes a guest but leaves their rounds alone', async () => {
        // A handicap record built over a season must not evaporate because the
        // host tidied a dropdown.
        await deleteGuest('guest_abc');
        expect(deleteDocMock).toHaveBeenCalledTimes(1);
        expect(String(deleteDocMock.mock.calls[0][0]._path)).toBe('guests/guest_abc');
    });
});
