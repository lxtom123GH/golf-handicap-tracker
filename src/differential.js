// ==========================================
// differential.js — a round's Score Differential, on one scale
// ==========================================
//
// Pure: no Firebase, no DOM, no Chart.js. It lives outside whs.js because the
// two surfaces that DISPLAY a differential — the Scoring Record in ui.js and
// the coach's roster in coach.js — cannot import whs.js without a cycle
// (whs.js already imports ui.js). That import barrier is why PR #134 scaled
// the differential the INDEX uses and left the ones the player READS unscaled
// (PRODUCT SWEEP 2026-09-10 SECOND PASS F-6).
import { HandicapDecimal, grossDifferentialDecimal, roundHandicap } from './handicap-decimal.js';

/**
 * Expected 9-hole Score Differential for the UNPLAYED nine when scaling a
 * 9-hole score to an 18-hole differential — WHS Rules of Handicapping 5.1b
 * (2024 revision, adopted by Golf Australia in April 2024):
 *   Expected Score Differential = (0.52 × Handicap Index) + 1.2
 * Returns null when the player has no usable Handicap Index yet — the caller
 * then falls back to doubling the played nine (the pre-2024 method), which is
 * the least-surprising behaviour for a brand-new record.
 *
 * @param {number} handicapIndex - The player's Handicap Index at calc time.
 * @returns {number|null} The expected differential for nine holes, or null.
 */
export function expectedNineDifferential(handicapIndex) {
    if (!Number.isFinite(handicapIndex)) return null;
    return new HandicapDecimal(handicapIndex).times('0.52').plus('1.2').toNumber();
}

/**
 * A round's Score Differential, on the 18-hole scale the Handicap Index uses.
 *
 * PRODUCT SWEEP 2026-09-10 SECOND PASS F-6: PR #134 taught calculateIndex to
 * scale a nine-hole differential to eighteen (WHS 5.1b), and left the four
 * places a differential is DISPLAYED still printing the raw nine-hole figure.
 * A player who plays nines therefore saw a Scoring Record whose Differential
 * column read 15.9, several rows carrying the asterisk that means "this is one
 * of the differentials your index is built from" — with the index above
 * reading 31.8, and no way to reconcile the two from anything on screen. The
 * trend chart plotted the same halved series, so a player who mixes nines and
 * eighteens saw a saw-tooth that was an artefact of the display. The coach's
 * Improving/Declining badge averaged the two scales together.
 *
 * One function, used by calculateIndex and by every surface that shows the
 * number, so the shown figure is by construction the used figure.
 *
 * @param {Object} round - A whs_rounds document (slope, rating, adjustedGross,
 *   holesPlayed).
 * @param {number|null} priorHI - The player's Handicap Index at calc time; a
 *   nine's unplayed half is estimated from it, or doubled when it is unknown.
 * @returns {number|null} The differential to one decimal, or null if the round
 *   cannot produce one.
 */
export function roundDifferential(round, priorHI = null) {
    if (!round || typeof round.slope !== 'number' || round.slope <= 0) return null;
    if (!Number.isFinite(round.adjustedGross) || !Number.isFinite(round.rating)) return null;

    let diff = grossDifferentialDecimal(round);
    if (round.holesPlayed === 9) {
        // WHS 5.1b (2024): add the expected differential for the unplayed nine,
        // or double the played nine when no index exists yet.
        // Number(null) is 0, which is finite — coercing here would silently
        // turn "no index yet" into "scratch" and estimate 1.2 for the unplayed
        // nine instead of doubling. The display sites can hand this a string,
        // so the coercion has to be explicit about which values mean "unknown".
        const hi = (priorHI === null || priorHI === undefined || priorHI === '')
            ? NaN : Number(priorHI);
        const expected = expectedNineDifferential(hi);
        diff = diff.plus((expected != null) ? expected : diff);
    }
    return roundHandicap(diff);
}

