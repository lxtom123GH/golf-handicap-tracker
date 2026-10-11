// One validity contract for surfaces that count WHS rounds.

import { isPlausibleRating } from './course-data.js';

export function isValidRound(round) {
    return !!round
        && typeof round.slope === 'number'
        && round.slope > 0
        && Number.isFinite(round.adjustedGross)
        && Number.isFinite(round.rating);
}

export function isCountingRound(round) {
    return isValidRound(round) && round.notCounting !== true;
}

/**
 * Why the APP (not the golfer) kept this round out of the index, as a short
 * label for the row, or null. Such a round must not be put back with
 * "Include": an unscorable card (no stroke index, or no index yet when it was
 * played) is stored with its RAW gross as adjustedGross - no per-hole cap -
 * and a round whose ratings fail the nine-aware check gives a wrong
 * differential. Rounds the golfer excluded by hand carry no reason and can be
 * included.
 *
 * The ratings check only runs when the round stored its par (On Course
 * rounds do). Manual, CSV and legacy rounds have no par, and guessing one
 * from holesPlayed would lock out old nines saved before holesPlayed existed;
 * the manual form stores its own reason since it gained the check.
 * @param {Object} round - A whs_rounds document.
 * @returns {string|null}
 */
export function appExcludedReason(round) {
    if (!round) return null;
    const stored = typeof round.notCountingReason === 'string' ? round.notCountingReason.trim() : '';
    if (stored) {
        if (/stroke index/i.test(stored)) return 'this tee has no stroke index, so the score isn’t capped';
        if (/Handicap Index isn.t established/i.test(stored)) {
            return 'played before you had an index, so the score isn’t capped';
        }
        return stored.replace(/[.\s]+$/, '');
    }
    if (Number(round.par) > 0 && !isPlausibleRating(round.rating, round.slope, Number(round.par))) {
        return "the course rating / slope don't look right for this round";
    }
    return null;
}

// Performance Insights intentionally has its own gate: stats are optional on
// a valid round, and the engine unlocks after three counting rounds carrying
// putts. Keep this predicate identical to computeCategoryInsights.
export function isPerformanceRound(round) {
    return !!round && round.stats && Number(round.stats.putts) > 0
        && round.notCounting !== true;
}

export function countCountingRounds(rounds = []) {
    return (Array.isArray(rounds) ? rounds : []).filter(isCountingRound).length;
}

export function countPerformanceRounds(rounds = []) {
    return (Array.isArray(rounds) ? rounds : []).filter(isPerformanceRound).length;
}

/** Holes a first Handicap Index needs (Golf Australia: 54, from 9s or 18s). */
export const INITIAL_INDEX_HOLES = 54;

/**
 * Holes in the player's counting rounds: 9 for a nine, 18 otherwise (an old
 * round with no holesPlayed was always treated as an 18, and still is).
 * @param {Array<Object>} rounds
 * @returns {number}
 */
export function countCountingHoles(rounds = []) {
    return (Array.isArray(rounds) ? rounds : [])
        .filter(isCountingRound)
        .reduce((n, r) => n + (r.holesPlayed === 9 ? 9 : 18), 0);
}
