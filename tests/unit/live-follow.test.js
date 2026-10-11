// liveFollowStep — the pure gate behind the Map first GPS follow
// (owner 2026-10-05: "like a GPS map ... direction of travel").
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), doc: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
    getDocs: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(), getDoc: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), orderBy: vi.fn(), writeBatch: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const { liveFollowStep, LIVE_FOLLOW } = await import('../../src/modules/score-input.js');
const green = [0, 380];

describe('liveFollowStep', () => {
    it('takes the first good fix on this hole', () => {
        expect(liveFollowStep(null, [10, 150], 5, green)).toEqual([10, 150]);
    });
    it('ignores a poor fix', () => {
        expect(liveFollowStep(null, [10, 150], LIVE_FOLLOW.maxAccuracyM + 1, green)).toBeNull();
        expect(liveFollowStep(null, [10, 150], NaN, green)).toBeNull();
    });
    it('ignores jitter under the minimum move, follows a real step', () => {
        expect(liveFollowStep([10, 150], [11, 151], 5, green)).toBeNull();
        expect(liveFollowStep([10, 150], [10, 160], 5, green)).toEqual([10, 160]);
    });
    it('ignores a fix far from this hole (next hole, car park)', () => {
        expect(liveFollowStep(null, [0, 380 - LIVE_FOLLOW.maxFromGreenM - 10], 5, green)).toBeNull();
    });
    it('rejects junk coordinates', () => {
        expect(liveFollowStep(null, [NaN, 1], 5, green)).toBeNull();
        expect(liveFollowStep(null, null, 5, green)).toBeNull();
    });
});
