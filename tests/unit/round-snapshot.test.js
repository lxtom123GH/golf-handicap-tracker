// restoreDecision: whose round is the one saved on this phone? Pure, so the
// rule is pinned here without a DOM or the AppState Proxy.
import { describe, it, expect, beforeEach } from 'vitest';
import { restoreDecision, readRoundSnapshot } from '../../src/round-snapshot.js';

const p = uid => ({ uid, name: uid, scores: {} });
const snap = (extra = {}) => ({ activeRoundId: 'round_1', liveRoundGroups: [p('u1')], ...extra });

describe('restoreDecision', () => {
    it("is 'none' when there is no live round saved", () => {
        expect(restoreDecision(null, 'u1')).toBe('none');
        expect(restoreDecision({}, 'u1')).toBe('none');
        expect(restoreDecision({ activeRoundId: null, roundOwnerUid: 'u1' }, 'u1')).toBe('none');
    });

    it('goes by the recorded scorer, whoever is in the group', () => {
        expect(restoreDecision(snap({ roundOwnerUid: 'coach' }), 'coach')).toBe('present');
        expect(restoreDecision(snap({ roundOwnerUid: 'coach' }), 'u1')).toBe('foreign');
        expect(restoreDecision(snap({ roundOwnerUid: 'u1', liveRoundGroups: [] }), 'u1')).toBe('present');
    });

    it('falls back to group membership for a snapshot with no recorded scorer', () => {
        expect(restoreDecision(snap(), 'u1')).toBe('present');
        expect(restoreDecision(snap(), 'u2')).toBe('foreign');
        expect(restoreDecision(snap({ liveRoundGroups: 'corrupt' }), 'u1')).toBe('foreign');
        expect(restoreDecision(snap({ liveRoundGroups: [null, p('u1')] }), 'u1')).toBe('present');
    });

    it("is 'foreign' when nobody is signed in", () => {
        expect(restoreDecision(snap({ roundOwnerUid: 'u1' }), null)).toBe('foreign');
        expect(restoreDecision(snap(), undefined)).toBe('foreign');
    });
});

describe('readRoundSnapshot', () => {
    beforeEach(() => localStorage.clear());

    it('distinguishes an empty slot from unreadable saved data', () => {
        expect(readRoundSnapshot()).toBeNull();
        localStorage.setItem('golf_round_state', '{not json');
        expect(readRoundSnapshot()).toBeUndefined();
        localStorage.setItem('golf_round_state', '"a string"');
        expect(readRoundSnapshot()).toBeUndefined();
        localStorage.setItem('golf_round_state', JSON.stringify(snap()));
        expect(readRoundSnapshot().activeRoundId).toBe('round_1');
    });

    it('never deletes what it could not read', () => {
        localStorage.setItem('golf_round_state', '{not json');
        readRoundSnapshot();
        expect(localStorage.getItem('golf_round_state')).toBe('{not json');
    });
});
