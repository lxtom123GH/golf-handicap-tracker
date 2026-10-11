/**
 * PRODUCT SWEEP 2026-09-10, SECOND PASS — F-2, F-3, F-4.
 *
 * One round, one stroke allocation. Three surfaces were computing it from
 * three different numbers of holes:
 *
 *   F-2  The Daily Handicap was computed from the TEE's par (18 holes on
 *        Ashgrove) while the stroke chart wrapped at AppState.currentRoundHoles
 *        (9, the app's default). An 18.0 index got 12 strokes over the front
 *        nine where Golf Australia gives 9.
 *   F-3  side-games.js kept its own copy of the allocation with a hard-coded
 *        18, so the skins panel and the leaderboard directly above it handed
 *        the same player 9 and 16 strokes respectively over a nine.
 *   F-4  netFor() substituted the HOLE NUMBER for a missing stroke index — the
 *        `|| holeNumber` fallback the sweep removed from every other call site
 *        — and coerced a null Daily Handicap to scratch.
 *
 * The allocation now lives once, in src/stroke-allocation.js, and this file
 * pins the invariant that makes the three agree: over a full round of `holes`
 * holes whose stroke indexes are a 1..holes permutation, the strokes handed
 * out must total exactly the Daily Handicap.
 */
import { describe, it, expect } from 'vitest';
import { strokesReceived } from '../../src/stroke-allocation.js';
import { calculateHoleStableford, calculateDailyHandicap } from '../../src/whs.js';
import { strokesOnHole, computeSkins } from '../../src/side-games.js';

const permutation = (n) => Array.from({ length: n }, (_, i) => i + 1);
const totalStrokes = (dh, holes) =>
    permutation(holes).reduce((t, si) => t + strokesReceived(dh, si, holes), 0);

describe('the allocation invariant: strokes handed out == the Daily Handicap', () => {
    it('holds over eighteen for every Daily Handicap a golfer can have', () => {
        for (let dh = -10; dh <= 54; dh++) expect(totalStrokes(dh, 18)).toBe(dh);
    });

    it('holds over nine for every Daily Handicap a golfer can have', () => {
        for (let dh = -9; dh <= 27; dh++) expect(totalStrokes(dh, 9)).toBe(dh);
    });

    it('refuses to allocate against a Daily Handicap that is not a number', () => {
        // F-4: `Number(null) || 0` used to make an unestablished index play off
        // scratch in the money game while their own Stableford column read "—".
        expect(strokesReceived(null, 1, 18)).toBeNull();
        expect(strokesReceived(undefined, 1, 18)).toBeNull();
        expect(strokesReceived('', 1, 18)).toBeNull();
        expect(strokesReceived(NaN, 1, 18)).toBeNull();
        expect(strokesReceived(0, 1, 18)).toBe(0); // scratch is a real handicap
    });

    it('refuses to allocate against a stroke index that is not a number', () => {
        expect(strokesReceived(9, null, 18)).toBeNull();
        expect(strokesReceived(9, undefined, 18)).toBeNull();
    });
});

describe('F-2 the stroke chart must wrap where the Daily Handicap was computed', () => {
    // Ashgrove GC Blue (Men): slope 124, CR 67, par 68 — an 18-hole record.
    // Front-nine stroke indexes are on the 1..18 scale.
    const FRONT_NINE_SI = [1, 11, 7, 18, 14, 13, 17, 6, 15];

    it('reproduces the regression: an 18-hole DH on a 9-hole chart over-allocates', () => {
        const dh18 = calculateDailyHandicap(18.0, 124, 67, 68, 18);
        expect(dh18).toBe(17);
        // What shipped: DH computed for 18, chart wrapped at 9.
        const shipped = FRONT_NINE_SI.reduce((t, si) => t + strokesReceived(dh18, si, 9), 0);
        expect(shipped).toBe(12);
        // What the same DH allocates on its OWN chart, over these nine holes.
        const consistent = FRONT_NINE_SI.reduce((t, si) => t + strokesReceived(dh18, si, 18), 0);
        expect(consistent).toBe(8);
        // What Golf Australia gives for a nine: the index is halved and the
        // nine's own CR/par used, then allocated over a 1..9 chart.
        const dh9 = calculateDailyHandicap(18.0, 124, 33.5, 34, 9);
        expect(dh9).toBe(9);
        expect(permutation(9).reduce((t, si) => t + strokesReceived(dh9, si, 9), 0)).toBe(9);
    });

    it('calculateHoleStableford allocates the same as strokesReceived', () => {
        for (const holes of [9, 18]) {
            for (let dh = -6; dh <= 40; dh++) {
                for (const si of permutation(holes)) {
                    // par 4, gross 4: points = 2 + strokes received.
                    const pts = calculateHoleStableford(4, 4, si, dh, holes);
                    expect(pts).toBe(Math.max(0, 2 + strokesReceived(dh, si, holes)));
                }
            }
        }
    });
});

describe('F-3 the side games allocate off the same chart as the leaderboard', () => {
    it('strokesOnHole agrees with strokesReceived at every holes/DH/SI', () => {
        for (const holes of [9, 18]) {
            for (let dh = -9; dh <= 36; dh++) {
                for (const si of permutation(holes)) {
                    expect(strokesOnHole(dh, si, holes)).toBe(strokesReceived(dh, si, holes));
                }
            }
        }
    });

    it('a 36 index over a nine gets the same strokes in skins and in Stableford', () => {
        // The review's case: DH 16 over nine. Side games gave 9, Stableford 16.
        const dh = 16, holes = 9;
        const viaSideGames = permutation(holes).reduce((t, si) => t + strokesOnHole(dh, si, holes), 0);
        const viaStableford = permutation(holes)
            .reduce((t, si) => t + (calculateHoleStableford(4, 4, si, dh, holes) - 2), 0);
        expect(viaSideGames).toBe(16);
        expect(viaStableford).toBe(16);
    });

    it('the default is still 18, so the existing eighteen-hole callers are unchanged', () => {
        expect(strokesOnHole(9, 5)).toBe(1);
        expect(strokesOnHole(20, 2)).toBe(2);
        expect(strokesOnHole(-2, 18)).toBe(-1);
    });
});

describe('F-4 side games refuse to invent a stroke index or a Daily Handicap', () => {
    const two = (aScores, bScores, aDh, bDh) => ([
        { uid: 'a', name: 'A', scores: aScores, dailyHandicap: aDh },
        { uid: 'b', name: 'B', scores: bScores, dailyHandicap: bDh }
    ]);
    const three = { 1: 5, 2: 5, 3: 5 };

    it('settles nothing when the tee publishes no stroke index', () => {
        // Virginia GC Championship ships strokeIndex: []. Before the fix the
        // panel fabricated SI = hole number and awarded A all three holes.
        const r = computeSkins(two(three, three, 9, 0), 9, []);
        expect(r.unavailable).toBeTruthy();
        expect(r.perPlayer).toEqual({ a: 0, b: 0 });
        expect(r.log).toEqual([]);
    });

    it('settles nothing when a player has no Daily Handicap', () => {
        const r = computeSkins(two(three, three, null, 9), 9, permutation(9));
        expect(r.unavailable).toBeTruthy();
        expect(r.perPlayer).toEqual({ a: 0, b: 0 });
    });

    it('still settles a normal round', () => {
        const r = computeSkins(two({ 1: 4, 2: 5, 3: 5 }, { 1: 5, 2: 5, 3: 5 }, 0, 0), 9, permutation(9));
        expect(r.unavailable).toBeFalsy();
        expect(r.perPlayer.a).toBe(1);
        expect(r.perPlayer.b).toBe(0);
    });
});
