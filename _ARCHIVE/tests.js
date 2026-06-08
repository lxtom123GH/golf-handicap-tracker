import { describe, it, expect } from './test-harness.js';
import { getAdjustmentFactor, calculateIndex } from './whs.js';

describe('WHS getAdjustmentFactor', () => {
    it('returns null for less than 3 scores', () => {
        expect(getAdjustmentFactor(2)).toBe(null);
    });

    it('returns correct adjustment for 3 scores', () => {
        const factor = getAdjustmentFactor(3);
        expect(factor.use).toBe(1);
        expect(factor.adj).toBe(-2.0);
    });

    it('returns correct adjustment for 10 scores', () => {
        const factor = getAdjustmentFactor(10);
        expect(factor.use).toBe(3);
        expect(factor.adj).toBe(0);
    });

    it('returns correct adjustment for 20+ scores', () => {
        const factor = getAdjustmentFactor(20);
        expect(factor.use).toBe(8);
        expect(factor.adj).toBe(0);

        const factor25 = getAdjustmentFactor(25);
        expect(factor25.use).toBe(8);
        expect(factor25.adj).toBe(0);
    });
});

describe('WHS calculateIndex', () => {
    it('returns 0 if no rounds', () => {
        const result = calculateIndex([]);
        expect(result.index).toEqual(0);
        expect(result.usedIds).toEqual([]);
    });

    it('returns 0 if less than 3 rounds', () => {
        // Mock rounds need at minimum slope, rated, and adjustedGross to calculate diff
        const result = calculateIndex([
            { id: '1', slope: 113, rating: 72, adjustedGross: 80 },
            { id: '2', slope: 113, rating: 72, adjustedGross: 82 }
        ]);
        expect(result.index).toEqual(0);
    });

    it('calculates correct index for exactly 3 rounds', () => {
        // Diff = (113 / slope) * (adjustedGross - rating)
        // R1: (113/113) * (82 - 72) = 10
        // R2: (113/113) * (85 - 72) = 13
        // R3: (113/113) * (80 - 72) = 8 (Lowest)
        // Use 1 lowest, adj -2.0. So 8 - 2 = 6.0

        const rounds = [
            { id: 'r1', slope: 113, rating: 72, adjustedGross: 82 },
            { id: 'r2', slope: 113, rating: 72, adjustedGross: 85 },
            { id: 'r3', slope: 113, rating: 72, adjustedGross: 80 }
        ];

        const result = calculateIndex(rounds);
        expect(result.index).toBe("6.0");
        expect(result.usedIds).toEqual(['r3']);
    });

    it('ignores rounds marked as notCounting', () => {
        const rounds = [
            { id: 'r1', slope: 113, rating: 72, adjustedGross: 72 }, // Diff: 0
            { id: 'r2', slope: 113, rating: 72, adjustedGross: 72 }, // Diff: 0
            { id: 'r3', slope: 113, rating: 72, adjustedGross: 72 }, // Diff: 0
            { id: 'r4', slope: 113, rating: 72, adjustedGross: 100, notCounting: true } // Substituted if not ignored, but will be ignored
        ];

        const result = calculateIndex(rounds);
        // Only 3 counting rounds, use 1, adj -2.0. Lowest diff is 0.
        // 0 - 2 = -2. But max index is 0. So it should be 0.
        expect(result.index).toBe("0.0");
    });
});
