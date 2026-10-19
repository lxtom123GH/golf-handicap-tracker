import { describe, expect, it } from 'vitest';
import { holeOrder, holePosition, nextHole, previousHole } from '../../src/round-hole-order.js';

describe('round hole order', () => {
    it('starts at the selected hole, wraps, and still includes every course hole once', () => {
        expect(holeOrder(9, 8)).toEqual([8, 9, 1, 2, 3, 4, 5, 6, 7]);
        expect(holeOrder(18, 10)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('steps in play order and identifies the first and final holes', () => {
        expect(holePosition(8, 9, 8)).toBe(0);
        expect(previousHole(8, 9, 8)).toBeNull();
        expect(nextHole(9, 9, 8)).toBe(1);
        expect(previousHole(1, 9, 8)).toBe(9);
        expect(nextHole(7, 9, 8)).toBeNull();
    });

    it('falls back to hole 1 when the stored start hole is outside this round', () => {
        expect(holeOrder(9, 18)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
});
