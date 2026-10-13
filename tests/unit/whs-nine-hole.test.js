import { describe, it, expect } from 'vitest';
import { calculateDailyHandicap, calculateHoleStableford, convertStablefordToAGS } from '../../src/whs.js';
import { COURSE_DATA } from '../../src/course-data.js';

// ============================================================================
// PRODUCT SWEEP 2026-09-10 — the nine-hole handicap path.
//
// Every test in this file FAILED against ee8eec5 on purpose; each failure is
// a defect a real user hits the moment they play nine holes, which is the
// DEFAULT selection on the finish-round screen (index.html:1135-1138).
//
// The four defects are one story. A nine-hole round is scored with an
// 18-hole Stableford baseline (F-1), against an un-halved Daily Handicap
// (F-2), allocated by an 18-hole stroke chart (F-2/F-3), on tee records whose
// stroke indexes are not nine-hole indexes at all (F-3) — and if the round is
// typed in by hand instead, none of it is even labelled as nine holes (F-6).
// ============================================================================

describe('F-1 convertStablefordToAGS uses a per-hole Stableford baseline', () => {
    // "Playing to your handicap" is 2 points a hole: 36 over eighteen, 18 over
    // nine. The constant 36 in the old implementation was the 18-hole figure,
    // so a nine-hole round was credited as though the player had scored 18
    // points fewer than they did — AGS inflated by ~18 strokes.
    it('a player who plays exactly to handicap scores AGS = par + DH, over either distance', () => {
        expect(convertStablefordToAGS(36, 0, 72, 18)).toBe(72);
        expect(convertStablefordToAGS(18, 0, 36, 9)).toBe(36);
    });

    it('reproduces the reported case: an 18.0 index, 54 gross on a par-36 nine', () => {
        // From the sweep: Keperra Old Course (9 holes) / White, CR 34 / SR 121 /
        // par 36, double bogey on every hole. With the halved Daily Handicap of
        // 7 (F-2) the card is worth 9 points.
        const ags = convertStablefordToAGS(9, 7, 36, 9);
        expect(ags).toBe(52);              // 36 + 7 - (9 - 18)
        expect(ags).toBeLessThan(60);      // the defect stored 80 against a gross of 54
    });

    it('defaults to eighteen holes so existing call sites are unchanged', () => {
        expect(convertStablefordToAGS(30, 10, 72)).toBe(convertStablefordToAGS(30, 10, 72, 18));
    });
});

describe('F-2 calculateDailyHandicap halves the index over nine holes', () => {
    // Golf Australia, 9-hole Daily Handicap:
    //   ((GA Handicap / 2 x 9-hole Slope / 113) + (9-hole CR - 9-hole Par)) x 0.93
    // https://help.miclub.com.au/support/solutions/articles/14000159379
    it('gives an 18.0 index 7 strokes over a nine, not 16', () => {
        expect(calculateDailyHandicap(18.0, 121, 34, 36, 9, 'men')).toBe(7);
    });

    it('leaves the eighteen-hole formula exactly as it was', () => {
        expect(calculateDailyHandicap(10.0, 113, 72, 72, 18, 'men')).toBe(9);
        expect(calculateDailyHandicap(20.0, 125, 74, 72, 18, 'men')).toBe(22);
        expect(calculateDailyHandicap(-2.0, 113, 70, 70, 18, 'men')).toBe(-2);
    });

    it('a nine is worth about half an eighteen for the same player and tee', () => {
        const full = calculateDailyHandicap(18.0, 121, 68, 72, 18, 'men');
        const half = calculateDailyHandicap(18.0, 121, 34, 36, 9, 'men');
        expect(Math.abs(half - full / 2)).toBeLessThanOrEqual(1);
    });
});

describe('F-2/F-3 calculateHoleStableford allocates strokes over the holes played', () => {
    it('wraps at nine, not eighteen, when nine holes are played', () => {
        // DH 12 over nine = one stroke on every hole, a second on SI 1-3.
        // Bogey (5 on a par 4) at SI 1 is therefore net 3 -> 3 points.
        expect(calculateHoleStableford(5, 4, 1, 12, 9)).toBe(3);
        // SI 4 gets only the single stroke -> net 4 -> 2 points.
        expect(calculateHoleStableford(5, 4, 4, 12, 9)).toBe(2);
    });

    it('is unchanged over eighteen holes', () => {
        expect(calculateHoleStableford(5, 4, 1, 12)).toBe(2);
        expect(calculateHoleStableford(4, 4, 18, -1)).toBe(1);
        expect(calculateHoleStableford(4, 4, 1, -1)).toBe(2);
    });

    it('gives a plus marker their strokes back from the easiest hole of the nine', () => {
        // DH -1 over nine concedes a stroke on SI 9, not SI 18 (which no nine has).
        expect(calculateHoleStableford(4, 4, 9, -1, 9)).toBe(1);
        expect(calculateHoleStableford(4, 4, 1, -1, 9)).toBe(2);
    });
});

describe('F-3 every tee stroke index is a permutation of 1..n', () => {
    // A nine-hole tee carrying the 18-hole chart row means stroke allocation
    // depends on which nine you picked rather than on your handicap: at DH 7
    // the same player got a stroke on 7 of 9 holes at West and 1 of 9 at Old.
    const tees = [];
    for (const [courseName, teeSet] of Object.entries(COURSE_DATA)) {
        for (const [teeName, tee] of Object.entries(teeSet)) {
            if (Array.isArray(tee.strokeIndex) && tee.strokeIndex.length > 0) {
                tees.push([`${courseName} / ${teeName}`, tee.strokeIndex]);
            }
        }
    }

    it('has tees to check (guards against an empty sweep passing vacuously)', () => {
        expect(tees.length).toBeGreaterThan(10);
    });

    it.each(tees)('%s', (_label, strokeIndex) => {
        const expected = Array.from({ length: strokeIndex.length }, (_, i) => i + 1);
        expect([...strokeIndex].sort((a, b) => a - b)).toEqual(expected);
    });
});
