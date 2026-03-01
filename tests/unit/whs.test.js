import { describe, it, expect, vi } from 'vitest';
import { getAdjustmentFactor, calculateIndex } from '../../whs.js';

// Mock dependencies that rely on DOM or Firebase
vi.mock('../../firebase-config.js', () => ({
    db: {},
    auth: {}
}));
vi.mock('https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    addDoc: vi.fn(),
    serverTimestamp: vi.fn(),
    doc: vi.fn(),
    getDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn()
}));
vi.mock('../../state.js', () => ({
    AppState: { currentRounds: [] }
}));
vi.mock('../../ui.js', () => ({
    UI: {}
}));

describe('WHS getAdjustmentFactor', () => {
    it('returns null for less than 3 scores', () => {
        expect(getAdjustmentFactor(2)).toBe(null);
    });

    it('returns correct adjustment for 3 scores', () => {
        expect(getAdjustmentFactor(3)).toEqual({ use: 1, adj: -2.0 });
    });

    it('returns correct adjustment for 8 scores', () => {
        expect(getAdjustmentFactor(8)).toEqual({ use: 2, adj: 0 });
    });

    it('returns correct adjustment for 20+ scores', () => {
        expect(getAdjustmentFactor(20)).toEqual({ use: 8, adj: 0 });
        expect(getAdjustmentFactor(25)).toEqual({ use: 8, adj: 0 });
    });
});

describe('WHS calculateIndex', () => {
    it('returns 0 if no rounds', () => {
        expect(calculateIndex([])).toEqual({ index: 0, usedIds: [] });
    });

    it('calculates correct index for exactly 3 rounds', () => {
        // Diff = (113 / slope) * (adjustedGross - rating)
        const rounds = [
            { id: 'r1', slope: 113, rating: 72, adjustedGross: 82 }, // diff: 10
            { id: 'r2', slope: 113, rating: 72, adjustedGross: 85 }, // diff: 13
            { id: 'r3', slope: 113, rating: 72, adjustedGross: 80 }  // diff: 8 (lowest)
        ];
        // Rules for 3 scores: use 1, adj -2.0 = 8 - 2 = 6.0
        const result = calculateIndex(rounds);
        expect(result.index).toBe("6.0");
        expect(result.usedIds).toEqual(['r3']);
    });

    it('ignores non-counting rounds', () => {
        const rounds = [
            { id: 'r1', slope: 113, rating: 72, adjustedGross: 72 }, // diff 0
            { id: 'r2', slope: 113, rating: 72, adjustedGross: 72 }, // diff 0
            { id: 'r3', slope: 113, rating: 72, adjustedGross: 72 }, // diff 0
            { id: 'r4', slope: 113, rating: 72, adjustedGross: 100, notCounting: true }
        ];
        const result = calculateIndex(rounds);
        expect(result.index).toBe("0.0");
    });
});
