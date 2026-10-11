// ==========================================
// stroke-allocation.js — how a Daily Handicap becomes strokes on a hole
// ==========================================
//
// One function, no imports, no DOM, no Firebase. It exists because this
// allocation was written out three times — in whs.js for Stableford, in
// side-games.js for skins/match play/nassau, and implicitly in the leaderboard
// — and the three copies disagreed the moment nine-hole rounds arrived
// (PRODUCT SWEEP 2026-09-10 SECOND PASS F-2/F-3). side-games.js is deliberately
// pure, so the shared code lives here rather than in whs.js, which pulls in
// Firebase and Chart.js.
//
// THE INVARIANT, which tests/unit/stroke-allocation.test.js pins: over a full
// round whose stroke indexes are a 1..holes permutation, the strokes handed out
// total exactly the Daily Handicap. That is only true when `holes` is the same
// number the Daily Handicap was computed for AND the scale the stroke index is
// published on. Passing a Daily Handicap built for eighteen holes with
// holes = 9 breaks it in both directions at once.

/**
 * Strokes a player receives on one hole.
 *
 * Positive Daily Handicaps: floor(DH / holes) on every hole, plus one more
 * where the hole's stroke index ≤ DH mod holes.
 *
 * Negative (plus) Daily Handicaps give strokes BACK starting at the EASIEST
 * hole — stroke index `holes` first (R&A: "a plus handicap player would reduce
 * the fixed scores starting at the stroke index 18 hole").
 *
 * @param {number} dailyHandicap - The player's Daily Handicap for this round.
 * @param {number} holeStrokeIndex - The hole's difficulty rank, 1..holes.
 * @param {number} [holes=18] - Holes in the round; the chart wraps at this and
 *   it must match the scale the stroke index is published on.
 * @returns {number|null} Strokes received (negative for a plus handicap), or
 *   null when either input is not a number — "unknown" is not "scratch", and
 *   coercing it to 0 is how a player with no established index ended up in a
 *   money game off scratch (F-4).
 */
export function strokesReceived(dailyHandicap, holeStrokeIndex, holes = 18) {
    const dh = Number(dailyHandicap);
    const si = Number(holeStrokeIndex);
    if (dailyHandicap === null || dailyHandicap === '' || !Number.isFinite(dh)) return null;
    if (holeStrokeIndex === null || holeStrokeIndex === '' || !Number.isFinite(si)) return null;
    const n = Number(holes) > 0 ? Number(holes) : 18;

    if (dh >= 0) {
        let strokes = Math.floor(dh / n);
        if (si <= (dh % n)) strokes += 1;
        return strokes;
    }
    // Exact mirror of the branch above, counting down from the easiest hole,
    // so the invariant holds for plus handicaps too. For the -n..0 range this
    // is identical to the Math.min(-dh, holes) form whs.js used to carry.
    const give = -dh;
    let strokes = -Math.floor(give / n);
    if (si > n - (give % n)) strokes -= 1;
    return strokes === 0 ? 0 : strokes; // normalise -0
}
