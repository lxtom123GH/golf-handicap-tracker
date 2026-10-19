// ==========================================
// side-games.js — pure side-game math (Skins, Match Play, Nassau)
// ==========================================
//
// Derived VIEWS over the live round's per-hole scores — no persistence, no
// Firebase, no DOM (unit-testable). All games are played NET: each player
// receives strokes per hole from their Daily Handicap against the tee's
// stroke index, using the same allocation as stableford scoring.
//
// Inputs use the liveRoundGroups shape: { uid, name, scores: {holeNum: gross},
// dailyHandicap }. Holes without a recorded score (0/undefined) for EVERY
// involved player are treated as not-yet-played and skipped.

import { strokesReceived } from './stroke-allocation.js';

/**
 * Strokes received on a single hole for a given Daily Handicap.
 *
 * PRODUCT SWEEP 2026-09-10 SECOND PASS F-3: this used to be a SECOND copy of
 * the allocation in whs.js with a hard-coded 18. The header comment above
 * claimed the two were identical, and they were — until PR #134 taught
 * calculateHoleStableford to wrap at the holes being played and left this one
 * alone. On a nine a 36-index player (Daily Handicap 16) then received 16
 * strokes in the Stableford column and 9 in the skins net, on the same screen,
 * in a game people play for money. There is now one allocation, in
 * stroke-allocation.js, and this is a named re-export of it.
 *
 * @param {number} dailyHandicap
 * @param {number} strokeIndex - The hole's difficulty rank, 1..holes.
 * @param {number} [holes=18] - Holes in the round; the chart wraps here.
 * @returns {number|null} Strokes received, or null if either input is unknown.
 */
export function strokesOnHole(dailyHandicap, strokeIndex, holes = 18) {
    return strokesReceived(dailyHandicap, strokeIndex, holes);
}

/**
 * Whether this round can be settled at all — the same question every scoring
 * surface asks, in the form side-games can answer without importing whs.js.
 *
 * F-4: netFor used to substitute the HOLE NUMBER for a missing stroke index
 * (the `|| hole` fallback the sweep removed from the other four call sites),
 * so the four Virginia tees that ship `strokeIndex: []` had skins settled
 * against a fabricated ranking while the leaderboard directly above showed a
 * dash. And `Number(null) || 0` put a player with no established index into
 * the money game off scratch.
 *
 * @param {Array<Object>} players
 * @param {Array<number>|null} strokeIndex
 * @returns {string|null} Why it cannot be settled, or null.
 */
export function sideGameUnavailableReason(players, strokeIndex) {
    if (!Array.isArray(strokeIndex) || strokeIndex.length === 0) {
        return "This tee publishes no stroke index, so side games can't be settled — gross scores only.";
    }
    const noDh = (players || []).filter(p => strokesReceived(p.dailyHandicap, 1, 18) === null);
    if (noDh.length) {
        const names = noDh.map(p => p.name || 'a player').join(', ');
        return `Side games need a Daily Handicap for every player — ${names} doesn't have one yet.`;
    }
    return null;
}

/** Net score for a player's hole, or null when it hasn't been scored. */
function netFor(player, hole, strokeIndex, holes) {
    const gross = player.scores ? player.scores[hole] : undefined;
    if (!gross || gross <= 0) return null;
    // No `|| hole` fallback: an absent stroke index is refused up front by
    // sideGameUnavailableReason, never invented here (F-4).
    const si = strokeIndex[hole - 1];
    const strokes = strokesReceived(player.dailyHandicap, si, holes);
    if (strokes === null) return null;
    return gross - strokes;
}

/**
 * Skins with carryover, net. A hole's skin (1 + any carried) goes to the
 * outright lowest net; ties carry the pot to the next hole. Holes are only
 * settled once EVERY player has a score for them.
 *
 * @param {Array<Object>} players - liveRoundGroups (2+ players).
 * @param {number} totalHoles - 9 or 18.
 * @param {Array<number>} strokeIndex - per-hole SI for the tee played.
 * @returns {{perPlayer: Object<string, number>, log: Array, carried: number}}
 *   perPlayer: skins won by uid; log: [{hole, winnerUid|null, name, value}];
 *   carried: skins still riding on the next unplayed hole.
 */
/** Course-hole keys in play order; defaults to 1..totalHoles. */
function playSequence(totalHoles, order) {
    if (Array.isArray(order) && order.length) return order.map(Number);
    return Array.from({ length: totalHoles }, (_, i) => i + 1);
}

export function computeSkins(players, totalHoles, strokeIndex, holes = totalHoles, order = null) {
    const perPlayer = {};
    players.forEach(p => { perPlayer[p.uid] = 0; });
    const log = [];
    let carry = 0;

    const unavailable = sideGameUnavailableReason(players, strokeIndex);
    if (unavailable) return { perPlayer, log, carried: 0, unavailable };

    // Late starts (e.g. off the 9th) settle holes in the order they are
    // PLAYED, so carryovers go to the right hole; scores stay course-keyed.
    for (const h of playSequence(totalHoles, order)) {
        const nets = players.map(p => ({ p, net: netFor(p, h, strokeIndex, holes) }));
        if (nets.some(n => n.net === null)) break; // hole not fully played yet

        const min = Math.min(...nets.map(n => n.net));
        const winners = nets.filter(n => n.net === min);
        const value = 1 + carry;

        if (winners.length === 1) {
            const w = winners[0].p;
            perPlayer[w.uid] += value;
            log.push({ hole: h, winnerUid: w.uid, name: w.name, value });
            carry = 0;
        } else {
            log.push({ hole: h, winnerUid: null, name: null, value });
            carry = value;
        }
    }

    return { perPlayer, log, carried: carry, unavailable: null };
}

/**
 * Match play, net, exactly 2 players. Standard dormie/closed-out logic:
 * the match ends when a player is up by more holes than remain.
 *
 * @returns {{leaderUid: string|null, up: number, thru: number, closed: boolean,
 *   statusText: string}} e.g. "Alice 2 UP thru 6", "All square thru 4",
 *   "Alice wins 3&2".
 */
export function computeMatchPlay(p1, p2, totalHoles, strokeIndex, holes = totalHoles, order = null) {
    let diff = 0; // + means p1 up
    let thru = 0;
    let closed = false;

    const unavailable = sideGameUnavailableReason([p1, p2], strokeIndex);
    if (unavailable) {
        return { leaderUid: null, up: 0, thru: 0, closed: false, statusText: unavailable, unavailable };
    }

    // `thru` counts holes completed in play order, not the course hole
    // number, so a round started on the 9th reads "thru 3", not "thru 11".
    for (const h of playSequence(totalHoles, order)) {
        const n1 = netFor(p1, h, strokeIndex, holes);
        const n2 = netFor(p2, h, strokeIndex, holes);
        if (n1 === null || n2 === null) break;
        if (n1 < n2) diff++;
        else if (n2 < n1) diff--;
        thru += 1;
        const remaining = totalHoles - thru;
        if (Math.abs(diff) > remaining) { closed = true; break; }
    }

    const leader = diff > 0 ? p1 : diff < 0 ? p2 : null;
    const up = Math.abs(diff);
    let statusText;
    if (thru === 0) statusText = 'No holes completed yet';
    else if (closed) statusText = `${leader.name} wins ${up}&${totalHoles - thru}`;
    else if (thru === totalHoles) statusText = leader ? `${leader.name} wins ${up} UP` : 'Match halved';
    else statusText = leader ? `${leader.name} ${up} UP thru ${thru}` : `All square thru ${thru}`;

    return { leaderUid: leader ? leader.uid : null, up, thru, closed, statusText, unavailable: null };
}

/**
 * Nassau, net, exactly 2 players: three match-play bets — front nine, back
 * nine, and the overall 18. For a 9-hole round only the front bet applies.
 *
 * @returns {{front: Object, back: Object|null, overall: Object|null}} each a
 *   computeMatchPlay result.
 */
export function computeNassau(p1, p2, totalHoles, strokeIndex, holes = totalHoles, order = null) {
    // A segment is match play over a hole window; reuse computeMatchPlay by
    // slicing the players' scores into the window.
    const slice = (p, from, to) => {
        const scores = {};
        for (let h = from; h <= to; h++) {
            if (p.scores && p.scores[h]) scores[h - from + 1] = p.scores[h];
        }
        return { ...p, scores };
    };
    const sliceSI = (from, to) => {
        if (!strokeIndex) return null;
        return strokeIndex.slice(from - 1, to);
    };

    // The sliced stroke index keeps its ORIGINAL 1..holes values, so the
    // allocation scale stays the round's — passing 9 here would re-wrap an
    // 18-hole chart at nine, which is F-2 in miniature.
    // Each bet keeps its course-hole window but walks it in play order.
    const seq = Array.isArray(order) && order.length ? order.map(Number) : null;
    const window = (from, to) => seq ? seq.filter(h => h >= from && h <= to).map(h => h - from + 1) : null;
    const front = computeMatchPlay(slice(p1, 1, 9), slice(p2, 1, 9), 9, sliceSI(1, 9), holes, window(1, 9));
    if (totalHoles < 18) return { front, back: null, overall: null };

    const back = computeMatchPlay(slice(p1, 10, 18), slice(p2, 10, 18), 9, sliceSI(10, 18), holes, window(10, 18));
    const overall = computeMatchPlay(p1, p2, 18, strokeIndex, holes, seq);
    return { front, back, overall };
}
