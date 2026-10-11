// ==========================================================================
// exclude-confirm.test.js
// Exclude asks before it takes a round out of the index.
// ==========================================================================
//
// One stray tap on Exclude dropped a round from the handicap with no
// warning. Include (putting a golfer-excluded round back) doesn't ask.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const fs = vi.hoisted(() => ({ updates: [] }));

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    doc: vi.fn((_db, col, id) => ({ _path: `${col}/${id}` })),
    updateDoc: vi.fn(async (ref, data) => { fs.updates.push({ ref, data }); }),
    getDoc: vi.fn(), setDoc: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const base = { id: 'r1', uid: 'u1', course: 'Keperra - Old', rating: 70.5, slope: 124, adjustedGross: 88,
    holesPlayed: 18, notCounting: false, date: new Date(2026, 7, 16) };

async function setup(round, { me = 'u1', admin = false } = {}) {
    vi.resetModules();
    fs.updates = [];
    const { AppState } = await import('../../src/state.js');
    AppState.currentUser = { uid: me };
    AppState.viewingPlayerId = round.uid;
    AppState.currentRounds = [round];
    window.currentUserIsAdmin = admin;
    await import('../../src/whs.js');
    window.alert = vi.fn();
}

describe('Exclude confirms first', () => {
    beforeEach(() => { window.confirm = vi.fn(() => true); });

    it('names the round and excludes it on OK', async () => {
        await setup(base);
        await window.toggleCountingRules('r1');
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(window.confirm.mock.calls[0][0]).toContain('Keperra - Old');
        expect(window.confirm.mock.calls[0][0]).toContain(new Date(2026, 7, 16).toLocaleDateString());
        expect(fs.updates).toEqual([{ ref: { _path: 'whs_rounds/r1' }, data: { notCounting: true } }]);
    });

    it('writes nothing on Cancel', async () => {
        window.confirm = vi.fn(() => false);
        await setup(base);
        await window.toggleCountingRules('r1');
        expect(fs.updates).toEqual([]);
    });

    it('Include does not ask', async () => {
        await setup({ ...base, notCounting: true });
        await window.toggleCountingRules('r1');
        expect(window.confirm).not.toHaveBeenCalled();
        expect(fs.updates[0].data).toEqual({ notCounting: false });
    });

    it('an admin excluding a player round says their handicap, not yours', async () => {
        await setup({ ...base, uid: 'player' }, { me: 'admin', admin: true });
        await window.toggleCountingRules('r1');
        expect(window.confirm.mock.calls[0][0]).toMatch(/from their handicap/);
        expect(fs.updates).toHaveLength(1);
    });

    it('a coach is refused before any prompt', async () => {
        await setup({ ...base, uid: 'student' }, { me: 'coach' });
        await window.toggleCountingRules('r1');
        expect(window.confirm).not.toHaveBeenCalled();
        expect(fs.updates).toEqual([]);
    });
});
