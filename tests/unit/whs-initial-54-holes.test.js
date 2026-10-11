// ==========================================================================
// whs-initial-54-holes.test.js
// A first Handicap Index needs 54 holes of acceptable scores, not 3 rounds.
// ==========================================================================
//
// calculateIndex produced an index at the third counting differential, and
// with no index yet a nine is simply doubled (differential.js), so three
// nines - 27 holes - gave a player an index. Golf Australia requires 54
// holes (any mix of 9s and 18s). Everything after the gate - the 5.2 table,
// the adjustments, the caps, the 2024 nine-hole formula - is unchanged, and
// the exact numbers below pin that.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), getDocs: vi.fn(),
    increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const { calculateIndex } = await import('../../src/whs.js');
const { countCountingHoles } = await import('../../src/round-validity.js');
const { coldStartPreview } = await import('../../src/cold-start.js');

// CR 72 / SR 113: differential = AGS − 72.
const eighteen = (id, ags) => ({ id, rating: 72, slope: 113, adjustedGross: ags, holesPlayed: 18, notCounting: false });
// A nine on CR 36 / SR 113 with no prior index: (AGS − 36) doubled.
const nine = (id, ags) => ({ id, rating: 36, slope: 113, adjustedGross: ags, holesPlayed: 9, notCounting: false });
// A round stored before holesPlayed existed.
const legacy = (id, ags) => ({ id, rating: 72, slope: 113, adjustedGross: ags, notCounting: false });

describe('countCountingHoles', () => {
    it('counts 9 for a nine and 18 for an 18 or a legacy round', () => {
        expect(countCountingHoles([nine('a', 45), eighteen('b', 90), legacy('c', 90)])).toBe(45);
    });
    it('skips excluded and malformed rounds', () => {
        expect(countCountingHoles([eighteen('a', 90), { ...eighteen('b', 90), notCounting: true },
            { ...eighteen('c', 90), slope: 0 }])).toBe(18);
    });
});

describe('calculateIndex: 54 holes before a first index', () => {
    it('three nines (27 holes) give no index (they used to give one)', () => {
        const res = calculateIndex([nine('a', 46), nine('b', 47), nine('c', 48)]);
        expect(res.index).toBeNull();
        expect(res.usedIds).toEqual([]);
    });

    it('five nines (45 holes) still give no index', () => {
        const res = calculateIndex([nine('a', 46), nine('b', 47), nine('c', 48), nine('d', 49), nine('e', 50)]);
        expect(res.index).toBeNull();
    });

    it('six nines (54 holes) do: best 2 of 6, minus 1.0', () => {
        // Differentials 20, 22, 24, 26, 28, 30 → best two 20 & 22 → 21.0 − 1.0 = 20.0
        const res = calculateIndex([nine('a', 46), nine('b', 47), nine('c', 48), nine('d', 49), nine('e', 50), nine('f', 51)]);
        expect(res.index).toBe('20.0');
        expect(res.usedIds.sort()).toEqual(['a', 'b']);
        expect(res.details).toMatchObject({ scoresUsed: 2, of: 6, adj: -1 });
    });

    it('two 18s and a nine (45 holes) give no index', () => {
        expect(calculateIndex([eighteen('a', 90), eighteen('b', 92), nine('c', 46)]).index).toBeNull();
    });

    it('two 18s and two nines (54 holes) do: best 1 of 4, minus 1.0', () => {
        // Differentials 18, 20, 20, 22 → best one 18 → 18 − 1.0 = 17.0
        const res = calculateIndex([eighteen('a', 90), eighteen('b', 92), nine('c', 46), nine('d', 47)]);
        expect(res.index).toBe('17.0');
        expect(res.usedIds).toEqual(['a']);
    });

    it('three 18s are unchanged: best 1 of 3, minus 2.0', () => {
        // Differentials 18, 19, 20 → 18 − 2.0 = 16.0
        expect(calculateIndex([eighteen('a', 90), eighteen('b', 91), eighteen('c', 92)]).index).toBe('16.0');
    });

    it('old rounds with no holesPlayed still count as 18s', () => {
        expect(calculateIndex([legacy('a', 90), legacy('b', 91), legacy('c', 92)]).index).toBe('16.0');
    });

    it('excluded rounds do not count towards the 54', () => {
        const res = calculateIndex([eighteen('a', 90), eighteen('b', 91), { ...eighteen('c', 92), notCounting: true }]);
        expect(res.index).toBeNull();
    });

    it('an established record is unchanged (20 × 18: best 8, no adjustment)', () => {
        const rounds = Array.from({ length: 20 }, (_, i) => eighteen(`r${i}`, 90 + i));
        // Differentials 18..37 → best eight 18..25 → mean 21.5
        expect(calculateIndex(rounds).index).toBe('21.5');
    });
});

describe('the index progress copy counts holes', () => {
    it('says how many of 54 holes are in', () => {
        const html = coldStartPreview([nine('a', 46), nine('b', 47), nine('c', 48)], 'index');
        expect(html).toContain('27 of 54 counting holes');
        expect(html).toContain('27 to go');
    });
});
