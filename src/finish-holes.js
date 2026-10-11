// finish-holes.js — Simplify C20 (2026-10-07): the finish screen's
// "Confirm Holes Played" default and its mismatch line.
//
// The save converts every scored hole against whatever this dropdown says
// (parForHolesPlayed / convertStablefordToAGS), so 9 holes of points left on
// an 18-hole default gave a far-too-high AGS. The dropdown stays visible and
// editable (it is the WHS checkpoint); only its default changes, and a line
// says so when the holes scored don't match the choice. Pure, unit-tested.

/** Hole numbers with a recorded score (> 0), ascending. */
export function scoredHoles(scores) {
    return Object.entries(scores || {})
        .filter(([, s]) => Number(s) > 0)
        .map(([h]) => Number(h))
        .filter(h => Number.isInteger(h) && h > 0)
        .sort((a, b) => a - b);
}

/**
 * 9 when the round is a nine, or an 18 where nobody scored more than nine
 * holes (you walked in at the turn, or played only the back nine);
 * otherwise the round's length.
 * @param {Array<{scores?:Object}>} groups
 * @param {number} roundHoles - the round's planned length (9 or 18)
 */
export function defaultHolesPlayed(groups, roundHoles) {
    if (Number(roundHoles) !== 18) return 9;
    const most = Math.max(0, ...(groups || []).map(p => scoredHoles(p?.scores).length));
    return most > 9 ? 18 : 9;
}

/**
 * Why a round can't count when nine holes are saved off an 18-hole tee, or
 * null. The app has no nine-hole Course Rating for an 18-hole tee, and the
 * 18-hole rating against a nine-hole score gives a differential far too low.
 * @param {number} holesPlayed - the Finish choice (9 or 18)
 * @param {number} teePar - the round's tee par
 * @returns {string|null}
 */
export function nineOnEighteenReason(holesPlayed, teePar) {
    if (Number(holesPlayed) !== 9 || !(Number(teePar) > 40)) return null;
    return 'Nine holes off an 18-hole tee: there is no nine-hole Course Rating for it, so this round is saved but not counted in your index.';
}

/** WHS: an 18-hole score needs at least 14 holes played. */
export const MIN_HOLES_FOR_EIGHTEEN = 14;

/**
 * Why an 18-hole save can't count when too few holes were scored, or null.
 * Under WHS an 18-hole score is acceptable only when at least 14 holes were
 * played; with fewer, choosing 18 converted the missing holes as zero points
 * and stored an AGS far too high.
 * @param {number} holesPlayed - the Finish choice (9 or 18)
 * @param {number} scoredCount - holes this player scored
 * @returns {string|null}
 */
export function tooFewForEighteenReason(holesPlayed, scoredCount) {
    const n = Number(scoredCount) || 0;
    if (Number(holesPlayed) !== 18 || n >= MIN_HOLES_FOR_EIGHTEEN) return null;
    return `Only ${n} hole${n === 1 ? '' : 's'} scored: an 18-hole score needs at least ${MIN_HOLES_FOR_EIGHTEEN} holes played, so this round is saved but not counted in your index.`;
}

/**
 * Stableford points for the holes of an 18 that were not played. WHS counts a
 * hole not played as net par, which is 2 Stableford points; without this each
 * missing hole scored 0 and pushed the AGS up 2 strokes.
 * @param {number} holesPlayed - the Finish choice (9 or 18)
 * @param {number} scoredCount - holes this player scored
 * @returns {number}
 */
export function unplayedNetParPoints(holesPlayed, scoredCount) {
    if (Number(holesPlayed) !== 18) return 0;
    return 2 * Math.max(0, 18 - (Number(scoredCount) || 0));
}

/** The warning line, or '' when the holes scored match the choice. */
export function holesMismatchText(scoredCount, chosen) {
    const n = Number(scoredCount) || 0;
    const c = Number(chosen) || 0;
    if (n === c) return '';
    return `You scored ${n} hole${n === 1 ? '' : 's'} but chose ${c}.`;
}
