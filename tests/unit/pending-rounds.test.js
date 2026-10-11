/**
 * Marker-attested cards — the client half.
 *
 * The security half is in tests/rules/pending-rounds.test.js, against a live
 * emulator. What matters here is the ONE line that makes the flow safe: on
 * approval the round's `uid` comes from the signed-in user and never from the
 * proposal. A pending document is written by somebody else, so treating any
 * field in it as authoritative about whose record this is would hand a marker
 * the write the whole design exists to deny them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({
    db: {},
    auth: { currentUser: { uid: 'playeruser0000000000000000', displayName: 'Dad' } },
    functions: {},
}));

const addDocMock = vi.fn(async () => ({ id: 'pending-1' }));
const setDocMock = vi.fn(async () => { });
const updateDocMock = vi.fn(async () => { });
const deleteDocMock = vi.fn(async () => { });
const getDocsMock = vi.fn(async () => ({ docs: [] }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, name) => ({ _path: name })),
    doc: vi.fn((_db, coll, id) => ({ _path: `${coll}/${id}`, id })),
    addDoc: (...a) => addDocMock(...a),
    setDoc: (...a) => setDocMock(...a),
    updateDoc: (...a) => updateDocMock(...a),
    deleteDoc: (...a) => deleteDocMock(...a),
    getDocs: (...a) => getDocsMock(...a),
    query: vi.fn((c) => c),
    where: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

import {
    PENDING, APPROVED, DECLINED, proposeRound, listPendingForMe, approve, decline, dismiss
} from '../../src/pending-rounds.js';

const ME = 'playeruser0000000000000000';
const MARKER = 'markeruser0000000000000000';

beforeEach(() => {
    addDocMock.mockClear(); setDocMock.mockClear();
    updateDocMock.mockClear(); deleteDocMock.mockClear(); getDocsMock.mockClear();
});

const round = (extra = {}) => ({
    roundId: 'round_123', course: 'Keperra', adjustedGross: 84,
    rating: 70.5, slope: 124, holesPlayed: 18, ...extra,
});

describe('proposing a card', () => {
    it('names the signed-in user as the marker and the other player as the owner', async () => {
        const id = await proposeRound({ playerUid: MARKER, playerName: 'Alex', round: round() });
        expect(id).toBe('pending-1');
        const [ref, data] = addDocMock.mock.calls[0];
        expect(ref._path).toBe('pending_rounds');
        expect(data.markerUid).toBe(ME);
        expect(data.playerUid).toBe(MARKER);
        expect(data.status).toBe(PENDING);
        expect(data.adjustedGross).toBe(84);
    });

    it('refuses to propose a card to yourself', async () => {
        // Your own round is written directly; a self-proposal is a card you
        // would have to sign twice.
        expect(await proposeRound({ playerUid: ME, round: round() })).toBeNull();
        expect(addDocMock).not.toHaveBeenCalled();
    });

    it('refuses when nobody is signed in', async () => {
        const cfg = await import('../../src/firebase-config.js');
        const saved = cfg.auth.currentUser;
        cfg.auth.currentUser = null;
        try {
            await expect(proposeRound({ playerUid: MARKER, round: round() }))
                .rejects.toThrow(/sign in/i);
            expect(addDocMock).not.toHaveBeenCalled();
        } finally {
            cfg.auth.currentUser = saved;
        }
    });
});

describe('approving a card', () => {
    const pending = (extra = {}) => ({
        id: 'pending-1', playerUid: ME, playerName: 'Dad',
        markerUid: MARKER, markerName: 'Alex', status: PENDING,
        proposedAt: 'SERVER_TS', ...round(), ...extra,
    });

    it('writes the round under YOUR uid, never the one in the document', async () => {
        // The line the whole design rests on. A pending document was written by
        // somebody else, so nothing in it decides whose record this becomes.
        await approve(pending({ uid: 'someone-else-entirely' }));
        const [, data] = setDocMock.mock.calls[0];
        expect(data.uid).toBe(ME);
    });

    it('keeps the provenance of who marked it', async () => {
        await approve(pending());
        const [, data] = setDocMock.mock.calls[0];
        expect(data.attestedBy).toBe(MARKER);
        expect(data.attestedByName).toBe('Alex');
    });

    it('does not carry the proposal\'s own bookkeeping into the round', async () => {
        await approve(pending());
        const [, data] = setDocMock.mock.calls[0];
        for (const field of ['playerUid', 'markerUid', 'status', 'proposedAt', 'id', 'playerName']) {
            expect(data[field]).toBeUndefined();
        }
    });

    it('marks the proposal approved once the round is written', async () => {
        await approve(pending());
        expect(setDocMock).toHaveBeenCalledTimes(1);
        const [ref, data] = updateDocMock.mock.calls[0];
        expect(String(ref._path)).toBe('pending_rounds/pending-1');
        expect(data.status).toBe(APPROVED);
    });

    it('refuses a card that is not yours, without writing anything', async () => {
        await expect(approve(pending({ playerUid: MARKER })))
            .rejects.toThrow(/not yours/i);
        expect(setDocMock).not.toHaveBeenCalled();
        expect(updateDocMock).not.toHaveBeenCalled();
    });

    it('refuses when nobody is signed in', async () => {
        const cfg = await import('../../src/firebase-config.js');
        const saved = cfg.auth.currentUser;
        cfg.auth.currentUser = null;
        try {
            await expect(approve(pending())).rejects.toThrow(/sign in/i);
            expect(setDocMock).not.toHaveBeenCalled();
        } finally {
            cfg.auth.currentUser = saved;
        }
    });
});

describe('declining and clearing', () => {
    it('declining marks the card without writing a round', async () => {
        await decline('pending-1');
        expect(setDocMock).not.toHaveBeenCalled();
        expect(updateDocMock.mock.calls[0][1].status).toBe(DECLINED);
    });

    it('dismissing removes the proposal', async () => {
        await dismiss('pending-1');
        expect(String(deleteDocMock.mock.calls[0][0]._path)).toBe('pending_rounds/pending-1');
    });
});

describe('listing', () => {
    it('returns the cards waiting for you', async () => {
        getDocsMock.mockResolvedValueOnce({
            docs: [{ id: 'p1', data: () => ({ playerName: 'Dad', adjustedGross: 84 }) }]
        });
        const out = await listPendingForMe();
        expect(out).toEqual([{ id: 'p1', playerName: 'Dad', adjustedGross: 84 }]);
    });

    it('returns nothing when signed out, rather than querying', async () => {
        const cfg = await import('../../src/firebase-config.js');
        const saved = cfg.auth.currentUser;
        cfg.auth.currentUser = null;
        try {
            expect(await listPendingForMe()).toEqual([]);
            expect(getDocsMock).not.toHaveBeenCalled();
        } finally {
            cfg.auth.currentUser = saved;
        }
    });
});
