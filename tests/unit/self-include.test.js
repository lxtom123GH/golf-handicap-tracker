// ==========================================================================
// self-include.test.js — owner decision 2026-09-20: you are in your own round
// unless you removed yourself
// ==========================================================================

import { describe, it, expect, vi } from 'vitest';

// The function under test is pure; the module's transitive imports are not.
vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
    writeBatch: vi.fn(), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('chart.js/auto', () => ({ default: vi.fn() }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

import { withSelfIncluded } from '../../src/modules/event-binders.js';

const ME = { uid: 'me-uid', name: 'Alex' };
const GUEST = { uid: 'guest_abc', name: 'Brother One', scores: {}, compStats: {}, simpleStats: {} };

describe('withSelfIncluded', () => {
    it('prepends the signed-in golfer when a guest was added first', () => {
        const out = withSelfIncluded([GUEST], ME, false);
        expect(out.map(p => p.uid)).toEqual(['me-uid', 'guest_abc']);
        expect(out[0]).toMatchObject({ name: 'Alex', scores: {}, compStats: {}, simpleStats: {} });
    });
    it('leaves the group alone when self is already in it', () => {
        const groups = [GUEST, { ...ME, scores: {} }];
        expect(withSelfIncluded(groups, ME, false)).toBe(groups);
    });
    it('respects an explicit self-removal (the Remove button sets the opt-out)', () => {
        expect(withSelfIncluded([GUEST], ME, true).map(p => p.uid)).toEqual(['guest_abc']);
    });
    it('does nothing without a signed-in golfer and never mutates the input', () => {
        const groups = [GUEST];
        expect(withSelfIncluded(groups, null, false)).toBe(groups);
        withSelfIncluded(groups, ME, false);
        expect(groups).toHaveLength(1);
    });
});
