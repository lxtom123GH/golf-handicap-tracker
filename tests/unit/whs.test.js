import { describe, it, expect, vi } from 'vitest';
import { getAdjustmentFactor, calculateIndex, convertStablefordToAGS, calculateDailyHandicap, expectedNineDifferential, calculateHoleStableford } from '../../src/whs.js';

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
    // PRODUCT SWEEP 2026-09-10 F-4: this used to expect the number 0, which
    // downstream code could not tell apart from a genuine scratch handicap —
    // every new user was published as a scratch golfer and given no strokes.
    // "Not established" is null now. tests/unit/index-not-established.test.js
    // covers the rest of that contract.
    it('returns null, not 0, if no rounds', () => {
        expect(calculateIndex([])).toEqual({ index: null, usedIds: [] });
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

    it('ignores non-counting rounds (and allows a plus handicap — no 0 floor)', () => {
        const rounds = [
            { id: 'r1', slope: 113, rating: 72, adjustedGross: 72 }, // diff 0
            { id: 'r2', slope: 113, rating: 72, adjustedGross: 72 }, // diff 0
            { id: 'r3', slope: 113, rating: 72, adjustedGross: 72 }, // diff 0
            { id: 'r4', slope: 113, rating: 72, adjustedGross: 100, notCounting: true }
        ];
        // 3 counting scores: best 1 (0.0) with the −2.0 adjustment → a plus
        // handicap of −2.0. The previous "0.0" expectation encoded the old
        // Math.max(0, …) clamp, which is not part of WHS.
        const result = calculateIndex(rounds);
        expect(result.index).toBe("-2.0");
    });
});

// WHS soft/hard caps (Rules 5.7/5.8, used unchanged by Golf Australia): once a
// Low HI exists (established at 20+ scores), upward movement beyond
// Low HI + 3.0 is halved, and the index can never exceed Low HI + 5.0.
describe('WHS soft & hard caps against Low HI', () => {
    // 20 identical rounds so the raw index equals the differential value.
    const twentyRoundsAt = (diff) => Array.from({ length: 20 }, (_, i) => ({
        id: `r${i}`, slope: 113, rating: 72, adjustedGross: 72 + diff
    }));

    it('no caps while fewer than 20 scores exist, even with a Low HI', () => {
        const rounds = [
            { id: 'a', slope: 113, rating: 72, adjustedGross: 92 },
            { id: 'b', slope: 113, rating: 72, adjustedGross: 92 },
            { id: 'c', slope: 113, rating: 72, adjustedGross: 92 }
        ];
        // 3 scores: best 1 (20.0) − 2.0 = 18.0; a Low HI of 5.0 must NOT cap it.
        expect(calculateIndex(rounds, 5.0).index).toBe("18.0");
    });

    it('applies no cap when the raw index is within Low HI + 3.0', () => {
        // Raw = 12.0, Low HI 10.0 → inside the +3.0 buffer → unchanged.
        expect(calculateIndex(twentyRoundsAt(12), 10.0).index).toBe("12.0");
    });

    it('soft cap halves growth beyond Low HI + 3.0', () => {
        // Raw = 15.0, Low HI 10.0: 13.0 + (15.0 − 13.0) × 0.5 = 14.0.
        expect(calculateIndex(twentyRoundsAt(15), 10.0).index).toBe("14.0");
    });

    it('hard cap stops the index at Low HI + 5.0', () => {
        // Raw = 20.0, Low HI 10.0: soft cap gives 13 + 3.5 = 16.5 → hard cap 15.0.
        expect(calculateIndex(twentyRoundsAt(20), 10.0).index).toBe("15.0");
    });

    it('skips caps entirely when no Low HI is established', () => {
        expect(calculateIndex(twentyRoundsAt(20), null).index).toBe("20.0");
    });

    // REVIEW DEFECT 2 (2026-08-22): W2's recordCount was taken from raw
    // rounds.length — which counts MALFORMED rounds that W4 established are
    // not acceptable scores at all. The correct record size is: rounds passing
    // the W4 validity filter but BEFORE the notCounting filter (excluded-but-
    // acceptable counts; invalid data does not).
    describe('record size for the caps gate (W2×W4 interaction)', () => {
        const nineteenValid = () => Array.from({ length: 19 }, (_, i) => ({
            id: `v${i}`, slope: 113, rating: 72, adjustedGross: 72 + 30
        }));

        it('19 valid + 1 MALFORMED: caps do NOT apply (malformed is not an acceptable score)', () => {
            const rounds = [
                ...nineteenValid(),
                { id: 'poison', slope: 0, rating: 72, adjustedGross: 100 } // Infinity
            ];
            // recordCount must be 19 → no caps → raw 30.0 stands.
            // FAILS before the fix: raw length 20 → hard cap → 15.0.
            expect(calculateIndex(rounds, 10.0).index).toBe("30.0");
        });

        it('19 valid + 1 notCounting: caps DO apply (excluded-but-acceptable still counts)', () => {
            const rounds = [
                ...nineteenValid(),
                { id: 'excluded', slope: 113, rating: 72, adjustedGross: 102, notCounting: true }
            ];
            // recordCount 20 → hard cap Low HI + 5.0 → 15.0.
            // FAILS before W2's fix (count was counting-only = 19 → no caps → 30.0);
            // must STAY passing after the defect-2 re-ordering.
            expect(calculateIndex(rounds, 10.0).index).toBe("15.0");
        });
    });
});

// GA Jan2026 §5F(vii): two played nines form one completed score.
describe('Australian nine-hole pairing', () => {
    const nine = id => ({id,slope:126,rating:35,adjustedGross:45,holesPlayed:9});
    it('does not synthesize an unplayed half', () => expect(expectedNineDifferential(10)).toBeNull());
    it.each([20,null])('six nines create three scores, independent of prior index %s', prior => {
        const result=calculateIndex(['a','b','c','d','e','f'].map(nine),null,prior);
        // Each component rounds to9.0; combined18.0; best1of3 minus2.
        expect(result.index).toBe('16.0');expect(result.details.of).toBe(3);
    });
    it('does not alter an eighteen based on a prior index', () => {
        const rounds=['a','b','c'].map(id=>({id,slope:113,rating:72,adjustedGross:82}));
        expect(calculateIndex(rounds,null,20).index).toBe('8.0');
    });
});

// Golf Australia Daily Handicap: (HI × Slope/113 + (CR − Par)) × 0.93, rounded.
describe('calculateDailyHandicap (Golf Australia)', () => {
    it('applies the GA 0.93 multiplier on a neutral course', () => {
        // HI 10.0, slope 113, CR == Par: 10 × 0.93 = 9.3 → 9.
        expect(calculateDailyHandicap(10.0, 113, 72, 72, 18, 'men')).toBe(9);
    });

    it('includes the (CR − Par) term', () => {
        // HI 20.0, slope 125, CR 74, par 72: (20×125/113 + 2) × 0.93 = 22.43… → 22.
        expect(calculateDailyHandicap(20.0, 125, 74, 72, 18, 'men')).toBe(22);
    });

    it('handles a plus handicap', () => {
        // HI −2.0, slope 113, CR == Par: −2 × 0.93 = −1.86 → −2.
        expect(calculateDailyHandicap(-2.0, 113, 70, 70, 18, 'men')).toBe(-2);
    });

    // F-4: a missing index is not scratch. Returning 0 handed a brand-new
    // player a Daily Handicap of 0 and no strokes for the whole round.
    it('returns null for missing inputs', () => {
        expect(calculateDailyHandicap(undefined, 113, 72, 72, 18, 'men')).toBeNull();
        expect(calculateDailyHandicap(10, 0, 72, 72, 18, 'men')).toBeNull();
    });
});

// BL-4.01 / F1: par feeds adjustedGross (AGS = par + DH - (stableford - 36)).
// The old save hardcoded par=72, so a 9-hole par-36 round's AGS was inflated by
// 36 strokes, then poisoned the differential (113/slope)*(AGS - rating). These
// lock in that the real par must flow into AGS.
describe('convertStablefordToAGS par sensitivity', () => {
    it('uses the supplied par, not a constant', () => {
        // 36 stableford ("playing to handicap") => AGS == par + DH
        expect(convertStablefordToAGS(36, 0, 72)).toBe(72);
        expect(convertStablefordToAGS(36, 0, 36)).toBe(36);
        expect(convertStablefordToAGS(36, 0, 71)).toBe(71);
    });

    it('the wrong (72) par inflates AGS for a 9-hole par-36 round', () => {
        const stableford = 18, dh = 0;
        const correct = convertStablefordToAGS(stableford, dh, 36, 9);
        const corrupted = convertStablefordToAGS(stableford, dh, 72, 9);
        expect(corrupted - correct).toBe(36); // exactly the par error propagates into AGS
    });

    // PRODUCT SWEEP 2026-09-10 F-1: par was only half of the nine-hole problem.
    // The subtracted Stableford baseline was the constant 36 — the 18-hole
    // "played to handicap" total — so passing the right par still left the AGS
    // 18 strokes high. The two errors are independent and used to compound.
    it('the wrong (36) Stableford baseline inflates AGS by 18 on any nine', () => {
        const stableford = 18, dh = 0, ninePar = 36;
        const correct = convertStablefordToAGS(stableford, dh, ninePar, 9);
        const corrupted = convertStablefordToAGS(stableford, dh, ninePar, 18);
        expect(corrupted - correct).toBe(18);
        expect(correct).toBe(ninePar); // played to handicap over nine => AGS = par
    });

    it('folds in the daily handicap', () => {
        expect(convertStablefordToAGS(30, 10, 72)).toBe(72 + 10 - (30 - 36));
    });
});

// ============================================================================
// WHS AUDIT 2026-08-21 — maths correctness against the published Rules of
// Handicapping. Every test below FAILS against the current src/whs.js on
// purpose: each failure proves a defect (all since fixed).
// ============================================================================

describe('WHS AUDIT W1 — getAdjustmentFactor table (Rules of Handicapping 5.2)', () => {
    // The published table: 19 scores → best 7, adj 0. The current code has no
    // case for 19 and falls through to `return { use: 8, adj: 0 }`, so a player
    // with exactly 19 scores gets their best EIGHT averaged — a different index
    // than the same record at 20 scores would produce for the wrong reason.
    it('uses the best SEVEN differentials when there are exactly 19 scores', () => {
        expect(getAdjustmentFactor(19)).toEqual({ use: 7, adj: 0 });
    });

    it('the full published table holds', () => {
        expect(getAdjustmentFactor(3)).toEqual({ use: 1, adj: -2.0 });
        expect(getAdjustmentFactor(4)).toEqual({ use: 1, adj: -1.0 });
        expect(getAdjustmentFactor(5)).toEqual({ use: 1, adj: 0 });
        expect(getAdjustmentFactor(6)).toEqual({ use: 2, adj: -1.0 });
        expect(getAdjustmentFactor(7)).toEqual({ use: 2, adj: 0 });
        expect(getAdjustmentFactor(8)).toEqual({ use: 2, adj: 0 });
        expect(getAdjustmentFactor(9)).toEqual({ use: 3, adj: 0 });
        expect(getAdjustmentFactor(10)).toEqual({ use: 3, adj: 0 });
        expect(getAdjustmentFactor(11)).toEqual({ use: 3, adj: 0 });
        expect(getAdjustmentFactor(12)).toEqual({ use: 4, adj: 0 });
        expect(getAdjustmentFactor(13)).toEqual({ use: 4, adj: 0 });
        expect(getAdjustmentFactor(14)).toEqual({ use: 4, adj: 0 });
        expect(getAdjustmentFactor(15)).toEqual({ use: 5, adj: 0 });
        expect(getAdjustmentFactor(16)).toEqual({ use: 5, adj: 0 });
        expect(getAdjustmentFactor(17)).toEqual({ use: 6, adj: 0 });
        expect(getAdjustmentFactor(18)).toEqual({ use: 6, adj: 0 });
        expect(getAdjustmentFactor(19)).toEqual({ use: 7, adj: 0 }); // FAILS today: returns 8
        expect(getAdjustmentFactor(20)).toEqual({ use: 8, adj: 0 });
    });
});

describe('WHS AUDIT W2 — caps must apply from 20 scores in the RECORD, not counting rounds', () => {
    // Rule 5.7/5.8 gate the caps on the player having 20 acceptable scores in
    // their scoring record. calculateIndex gates on `count >= 20` where count =
    // Math.min(scoreDiffs.length, 20) AFTER filtering out notCounting rounds.
    // A player whose record holds 20+ scores but who has excluded some (a
    // normal WHS operation) silently loses cap protection: an inflated raw
    // average sails past Low HI + 5.0 unclamped.
    it('applies the hard cap when the record has 20+ scores but only 18 are counting', () => {
        const twentyAt = (diff) => Array.from({ length: 20 }, (_, i) => ({
            id: `r${i}`, slope: 113, rating: 72, adjustedGross: 72 + diff
        }));
        const rounds = [
            ...twentyAt(30).slice(0, 18),
            { id: 'x1', slope: 113, rating: 72, adjustedGross: 82, notCounting: true },
            { id: 'x2', slope: 113, rating: 72, adjustedGross: 83, notCounting: true },
            { id: 'x3', slope: 113, rating: 72, adjustedGross: 84, notCounting: true }
        ];
        // 18 counting scores → best 6 → avg 30.0; Low HI 10.0 → hard cap 15.0.
        // FAILS today: count = 18 < 20 so no cap is applied → "30.0".
        expect(calculateIndex(rounds, 10.0).index).toBe("15.0");
    });
});

describe('WHS AUDIT W3 — plus-handicap stroke allocation (negative Daily Handicap)', () => {
    // GA/R&A convention for a negative (plus) Course/Daily Handicap: strokes
    // are ADDED BACK starting at the EASIEST hole (stroke index 18 first). The
    // current code computes floor(DH/18) and DH % 18, which for DH < 0 yields
    // strokesReceived <= 0 but allocates the fractional part against the
    // HARDEST holes (SI <= remainder never fires for negative remainder), so a
    // −1 marker plays every hole at net par instead of conceding a stroke on
    // SI 18. Verified convention: Brisbane GC/GA stroke-index guidance ("a Plus
    // Marker would require a hole-in-one on SI 18 par 3 to score 3 points") and
    // R&A Stableford ("a plus handicap player would reduce the fixed scores
    // starting at the stroke index 18 hole").
    it('a −1 daily handicap concedes one stroke back on stroke index 18', () => {
        // Correct: SI 18 fixed score = par − 1 → gross 4 is one over → 1 point.
        // Every other hole unadjusted → gross 4 vs par 4 → 2 points.
        expect(calculateHoleStableford(4, 4, 18, -1)).toBe(1);
        // FAILS today: the code applies Math.floor(−1/18) = −1 strokes to EVERY
        // hole, so SI 1 also returns 1 — the concession is spread across all 18
        // holes instead of concentrated on the easiest one (a 17-point swing).
        expect(calculateHoleStableford(4, 4, 1, -1)).toBe(2);
    });

    it('a −2 daily handicap adds strokes back on SI 18 and SI 17 only', () => {
        expect(calculateHoleStableford(4, 4, 18, -2)).toBe(1);
        expect(calculateHoleStableford(4, 4, 17, -2)).toBe(1);
        // FAILS today: returns 1 — SI 16 should be untouched by a −2 handicap.
        expect(calculateHoleStableford(4, 4, 16, -2)).toBe(2);
    });
});

describe('WHS AUDIT W4 — malformed rounds must not poison the differential', () => {
    // normalizeRoundDoc does NOT sanitise rating/slope/adjustedGross, and
    // calculateIndex divides by r.slope unchecked. Two distinct failure modes:
    // (a) a null adjustedGross yields NaN, and NaN comparisons are always
    // false, so the poisoned round sorts as the "best" differential and wins
    // the best-N selection; (b) a slope-0 round yields Infinity — which does
    // NOT win best-N (Infinity sorts last) but still COUNTS toward the record,
    // inflating `count` and moving the player up the 5.2 table (e.g. 3 real
    // scores + 1 poison round = count 4 → adjustment −1.0 instead of −2.0).
    it('excludes a NaN-adjustedGross round from selection instead of winning best-N', () => {
        const rounds = [
            { id: 'good1', slope: 113, rating: 72, adjustedGross: 80 },  // diff 8
            { id: 'good2', slope: 113, rating: 72, adjustedGross: 90 },  // diff 18
            { id: 'good3', slope: 113, rating: 72, adjustedGross: 85 },  // diff 13
            { id: 'bad',   slope: 113, rating: 72, adjustedGross: null } // poison
        ];
        const result = calculateIndex(rounds);
        // 3 valid counting scores → best 1 (8.0) with the −2.0 adjustment → 6.0.
        // FAILS without the guard: the NaN round wins best-N → "-74.0".
        // (With the guard, the poison round is excluded entirely — it does not
        // occupy a table slot either; a malformed round is not an acceptable
        // score under the rules.)
        expect(result.index).toBe("6.0");
        expect(result.usedIds).toEqual(['good1']);
    });

    it('excludes a slope-0 round from the record count so the 5.2 table row is right', () => {
        const rounds = [
            { id: 'g1', slope: 113, rating: 72, adjustedGross: 80 },   // diff 8
            { id: 'g2', slope: 113, rating: 72, adjustedGross: 81 },   // diff 9
            { id: 'g3', slope: 113, rating: 72, adjustedGross: 82 },   // diff 10
            { id: 'poison', slope: 0, rating: 72, adjustedGross: 100 } // Infinity
        ];
        const result = calculateIndex(rounds);
        // Three real scores → best 1 with −2.0 → 8 − 2 = 6.0.
        // FAILS today: the poison round counts, table row for count=4 says
        // use 1 adj −1.0 → 8 − 1 = 7.0.
        expect(result.index).toBe("6.0");
        expect(result.usedIds).toEqual(['g1']);
    });

    it('excludes imported numeric strings just like other malformed inputs', () => {
        const rounds = [
            { id: 's1', slope: '113', rating: '72', adjustedGross: '80' },
            { id: 's2', slope: '113', rating: '72', adjustedGross: '81' },
            { id: 's3', slope: '113', rating: '72', adjustedGross: '82' }
        ];

        expect(calculateIndex(rounds).index).toBeNull();
    });
});
