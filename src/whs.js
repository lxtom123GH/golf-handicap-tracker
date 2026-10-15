// ==========================================
// whs.js
// Core World Handicap System Math & DB Logic
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, setDoc, deleteField } from "firebase/firestore";
import Chart from 'chart.js/auto';
import { AppState, normalizeRoundDoc } from './state.js';
import { UI } from './ui.js';
import { escapeHtml } from './escape.js';
import { renderIndexExplainer } from './modules/insights-render.js';
import { coldStartPreview } from './cold-start.js';
import { countCountingHoles, INITIAL_INDEX_HOLES } from './round-validity.js';
import { parseLocalDate } from './dates.js';
import { privateHandicapPath, mergeIndexHistories } from './index-history.js';
import { strokesReceived } from './stroke-allocation.js';
import { gaScoreRecord } from './ga-score-record.js';
import { expectedNineDifferential, roundDifferential } from './differential.js';
import { HandicapDecimal, formatHandicap, meanHandicap, roundHandicap } from './handicap-decimal.js';
import { isValidRound, isCountingRound, appExcludedReason } from './round-validity.js';

// Re-exported so `import { expectedNineDifferential } from './whs.js'` keeps
// working; the definitions now live in differential.js (F-6).
export { expectedNineDifferential, roundDifferential };

let unsubscribeWHS = null;

// Core WHS Math
/**
 * Determines the number of best scores to use and the adjustment factor based on the total number of rounds.
 * Follows the standard WHS lookup table (e.g., best 8 of 20).
 * 
 * @param {number} count - The total number of non-excluded rounds in the player's history.
 * @returns {Object|null} An object with 'use' (number of scores) and 'adj' (handicap adjustment), or null if count < 3.
 */
export function getAdjustmentFactor(count) {
    if (count < 3) return null;
    if (count === 3) return { use: 1, adj: -2.0 };
    if (count === 4) return { use: 1, adj: -1.0 };
    if (count === 5) return { use: 1, adj: 0 };
    if (count === 6) return { use: 2, adj: -1.0 };
    if (count >= 7 && count <= 8) return { use: 2, adj: 0 };
    if (count >= 9 && count <= 11) return { use: 3, adj: 0 };
    if (count >= 12 && count <= 14) return { use: 4, adj: 0 };
    if (count >= 15 && count <= 16) return { use: 5, adj: 0 };
    if (count >= 17 && count <= 18) return { use: 6, adj: 0 };
    // AUDIT W1 (2026-08-21): the published table's row for exactly 19 scores
    // is best 7; this fell through to the 20+ default and averaged best 8.
    if (count === 19) return { use: 7, adj: 0 };
    return { use: 8, adj: 0 }; // 20 scores
}

// -------------------------------------------------------------------------------- //
// NEW WHS STABLEFORD & AGS CALCULATIONS
// -------------------------------------------------------------------------------- //

/** GA Jan2026 §3H pp11–12. Apply the category's consistency factor before
 * whole-number rounding; halve the index for nine holes. Category is explicit,
 * never inferred from the tee or the viewer. Missing category/index is unknown.
 */
export function calculateDailyHandicap(handicapIndex, slopeRating, courseRating, par, holes = 18, category = null) {
    // PRODUCT SWEEP 2026-09-10 F-4: this returned 0 — a genuine scratch Daily
    // Handicap — for a player with no established index, so a real 26-marker
    // received no strokes for the whole round and nothing on screen said why.
    // "Cannot be computed" is now its own answer and every caller must handle
    // it; scoring off scratch by accident is the failure being prevented.
    if (!Number.isFinite(Number(handicapIndex)) || handicapIndex === null || handicapIndex === '') return null;
    if (!Number.isFinite(Number(slopeRating)) || Number(slopeRating) <= 0) return null;
    const factor = category === 'women' ? '1.0483' : category === 'men' ? '0.9986' : null;
    if (!factor) return null;
    const crAdj = (Number.isFinite(courseRating) && Number.isFinite(par))
        ? new HandicapDecimal(courseRating).minus(par) : 0;
    const index = new HandicapDecimal(Number(handicapIndex)).div(holes === 9 ? 2 : 1);
    return roundHandicap(index.times(Number(slopeRating)).div(113).plus(crAdj).times('0.93').times(factor), 0);
}

/**
 * Calculates Stableford points for a single hole based on the player's Daily Handicap.
 * Handles stroke indexing and provides "net par + 2" math.
 * 
 * @param {number} grossScore - The number of strokes taken on the hole.
 * @param {number} holePar - The par of the hole.
 * @param {number} holeStrokeIndex - The difficulty rank (1..holes) of the hole.
 * @param {number} dailyHandicap - The player's calculated Daily Handicap for the day.
 * @param {number} [holes=18] - Holes in the round; the stroke chart wraps at this.
 * @returns {number} The Stableford points earned (minimum 0).
 */
export function calculateHoleStableford(grossScore, holePar, holeStrokeIndex, dailyHandicap, holes = 18) {
    if (!grossScore || isNaN(grossScore) || grossScore === 0) return 0;
    if (!holePar || !holeStrokeIndex) return 0;

    // AUDIT W3 (2026-08-21): negative (plus) Daily Handicaps ADD strokes back
    // starting at the EASIEST hole — stroke index 18 first (GA stroke-index
    // guidance: a plus marker needs a hole-in-one on the SI 18 par 3 to score
    // 3 points; R&A: "a plus handicap player would reduce the fixed scores
    // starting at the stroke index 18 hole").
    //
    // PRODUCT SWEEP 2026-09-10 SECOND PASS F-3: the allocation itself now lives
    // in stroke-allocation.js, because side-games.js carried a second copy of
    // it with a hard-coded 18 and the two handed the same player different
    // numbers of strokes on the same screen the moment nines arrived.
    const strokes = strokesReceived(dailyHandicap, holeStrokeIndex, holes);
    // "Unknown" is not "scratch" (F-4). Callers ask scoringUnavailableReason
    // first; this is the backstop that stops a null Daily Handicap being
    // silently scored off 0 if one ever gets past them.
    if (strokes === null) return 0;

    const netScore = grossScore - strokes;
    return Math.max(0, holePar - netScore + 2);
}

/**
 * Why this round cannot be scored to Stableford, in words a player can act on
 * — or null when it can be scored.
 *
 * Two ways to arrive here, both introduced by earlier fixes refusing to invent
 * data: the tee publishes no stroke index (F-9), or the player has no
 * established Handicap Index so there is no Daily Handicap (F-4). Both used to
 * be papered over — the stroke index with SI = hole number, the handicap with
 * a Daily Handicap of 0 — and both corrupted the saved AGS and, through it,
 * the handicap index itself. Every scoring surface asks this one question so
 * they cannot disagree with each other the way they used to.
 *
 * @param {Array<number>|null} strokeIndex - From getStrokeIndex().
 * @param {number|null} dailyHandicap - From calculateDailyHandicap().
 * @returns {string|null} The reason, or null when scoring can proceed.
 */
export function scoringUnavailableReason(strokeIndex, dailyHandicap) {
    if (!Array.isArray(strokeIndex) || strokeIndex.length === 0) {
        return "This tee publishes no stroke index, so Stableford can't be scored — gross scores only, and this round won't count toward your index.";
    }
    if (!Number.isFinite(Number(dailyHandicap)) || dailyHandicap === null) {
        return "No Daily Handicap is available, so this round is gross-only. Check your index and handicap category, or enter a known Daily Handicap at Start Round.";
    }
    return null;
}

/**
 * Converts a total Stableford score back into a WHS-compliant Adjusted Gross Score (AGS).
 * This is used for handicap indexing when hole-by-hole gross scores aren't tracked.
 * Formula: Par + Daily Handicap - (Stableford Points - 2 × holes)
 *
 * The subtracted term is the "played exactly to handicap" Stableford total,
 * which is two points a hole: 36 over eighteen, 18 over nine.
 * PRODUCT SWEEP 2026-09-10 F-1: that figure was the constant 36, so every
 * nine-hole round was written to whs_rounds with an AGS roughly 18 strokes
 * worse than the player actually shot. An 18.0 index shooting 54 on a par-36
 * nine was stored as AGS 80, a Score Differential of 53.5 against a true ~20.
 * Because calculateIndex averages the BEST differentials, a player who mostly
 * plays nines had every differential inflated and their published index pinned
 * to the 54.0 ceiling. An earlier fix caught the other half of this — passing
 * the nine's real par instead of 72 — and left the baseline at 36.
 *
 * @param {number} totalStableford - The total Stableford points for the round.
 * @param {number} dailyHandicap - The Daily Handicap used during the round.
 * @param {number} coursePar - The total par for the holes played (36 for a par-72 nine).
 * @param {number} [holes=18] - Holes played; sets the two-points-a-hole baseline.
 * @returns {number} The theoretical Adjusted Gross Score.
 */
export function convertStablefordToAGS(totalStableford, dailyHandicap, coursePar, holes = 18) {
    // AGS = Par + Daily Handicap - (Stableford Points - 2 × holes)
    return coursePar + dailyHandicap - (totalStableford - 2 * holes);
}

// -------------------------------------------------------------------------------- //

/**
 * Core handicap indexing engine. Filters rounds, determines the best subset of
 * differentials, and calculates the rolling average for the WHS Handicap Index,
 * applying the WHS soft and hard caps against the player's Low HI.
 *
 * Existing cap implementation (GA threshold/date-window differences are listed
 * for follow-up in docs/GA-METHOD-DESIGN.md):
 * once a player has a Low HI (established at 20+ acceptable scores), upward
 * movement beyond Low HI + 3.0 is halved (soft cap) and the index can never
 * exceed Low HI + 5.0 (hard cap). PCC is not applied — it needs same-day field
 * data that only GOLF Link has, so differentials here are (113/slope)×(AGS−CR).
 *
 * @param {Array<Object>} rounds - Array of round documents from Firestore (newest first).
 * @param {number|null} [lowHI] - The player's Low HI (lowest index in the trailing
 *   365 days). Pass null/omit when no Low HI is established; caps are then skipped.
 * @param {number|null} [priorHI] - The player's current published Handicap Index,
 *   retained in the call signature; it no longer creates an unplayed nine.
 * @param {boolean} [established=false] - True once this app has published an
 *   index for the player (their index history is non-empty). The 54-hole
 *   minimum applies only to a FIRST index (Rule 5.2); after that the index is
 *   recalculated from whatever scores are available.
 * @returns {Object} { index: string, usedIds: string[] } - The capped 1-decimal index and the IDs used in the calc.
 */
export function calculateIndex(rounds, lowHI = null, priorHI = null, established = false) {
    // Return early if no rounds at all
    // Not established is null, never 0 — see calculateDailyHandicap (F-4).
    if (!rounds || rounds.length === 0) return { "index": null, "usedIds": [] };

    // Filter out "notCounting" rounds. Each Score Differential is rounded to
    // one decimal BEFORE averaging, per WHS Rule 5.2.
    // AUDIT W4 (2026-08-21): also drop rounds whose inputs cannot form a
    // finite differential (slope <= 0/missing → Infinity that still inflates
    // the 5.2 table row; null/non-numeric adjustedGross or rating → NaN that
    // wins best-N selection because every NaN comparison is false). The rules
    // layer validates new client creates, but admin CSV import and legacy
    // docs can carry malformation straight into this engine.
    const record = gaScoreRecord(rounds);
    const scoreDiffs = record.completed;

    // The 5.2 table starts at three scores.
    if (scoreDiffs.length < 3) return { "index": null, "usedIds": [] };

    // An INITIAL index needs 54 holes of acceptable scores (Rule 5.2), not
    // three scores: three nines (27 holes) used to produce an index. Three
    // 18s, or any mix of 9s and 18s reaching 54, still does. Once an index has
    // been established it is recalculated from the scores available, so an
    // excluded or deleted nine must not wipe it (that left the app showing no
    // index while the profile kept the old one).
    if (!established && countCountingHoles(rounds) < INITIAL_INDEX_HOLES) return { "index": null, "usedIds": [] };

    const count = Math.min(scoreDiffs.length, 20);
    const rules = getAdjustmentFactor(count);

    // Consider only the most recent 'count' differentials
    const recentDiffs = scoreDiffs.slice(0, count);

    // Sort by differential ascending to find the best ones
    const sortedDiffs = [...recentDiffs].sort((a, b) => a.diff - b.diff);

    // Take the best 'use' differentials
    const bestDiffs = sortedDiffs.slice(0, rules.use);
    let avg = meanHandicap(bestDiffs.map(d => d.diff)).plus(rules.adj);
    const preCap = avg;
    let softCapped = false, hardCapped = false;

    // AUDIT W2 (2026-08-21), REVIEW DEFECT 2 (2026-08-22): Rules 5.7/5.8 gate
    // the caps on the player having 20 acceptable scores in the RECORD —
    // which includes excluded (notCounting) rounds but NOT malformed ones,
    // which are not acceptable scores at all. So the record size is taken
    // AFTER the W4 validity filter but BEFORE the notCounting filter.
    // Record size and counting size are different quantities under the rules:
    // the caps gate on the former, the 5.2 table row on the latter.
    const recordCount = gaScoreRecord(rounds.filter(isValidRound).map(r => ({ ...r, notCounting: false }))).completed.length;

    // Soft/hard caps apply only once a Low HI exists (WHS: 20+ scores).
    if (lowHI != null && Number.isFinite(lowHI) && recordCount >= 20) {
        const softCap = new HandicapDecimal(lowHI).plus(3);
        if (avg.gt(softCap)) { avg = softCap.plus(avg.minus(softCap).times('0.5')); softCapped = true; }
        const hardCap = new HandicapDecimal(lowHI).plus(5);
        if (avg.gt(hardCap)) { avg = hardCap; hardCapped = true; }
    }

    if (avg.gt(54)) avg = new HandicapDecimal(54);
    // No lower clamp: a negative value is a legitimate plus handicap.
    // `details` feeds the "Why this index?" trust card (additive, non-breaking).
    return {
        "index": formatHandicap(avg),
        "usedIds": bestDiffs.flatMap(d => d.ids),
        "details": {
            pendingNines: record.pending.length,
            scoresUsed: rules.use,
            of: count,
            adj: rules.adj,
            lowHI: (lowHI != null && Number.isFinite(lowHI)) ? lowHI : null,
            softCapped, hardCapped,
            preCap: roundHandicap(preCap)
        }
    };
}

/**
 * Reads a player's index history and public profile together. The history
 * lives in users/{uid}/private/handicap (player, coach, admin only); a legacy
 * profiles/{uid}.indexHistory left by the old storage is merged in until the
 * migration (or the player's next publish) removes it, so nothing is lost
 * between the deploy and the migration.
 *
 * @param {string} uid
 * @returns {Promise<{history: Array|null, profile: Object|null}>} history null
 *   = unknown (unreadable); profile null = unreadable, {} = no doc.
 */
async function readHandicapDocs(uid) {
    const [priv, prof] = await Promise.allSettled([
        getDoc(doc(db, ...privateHandicapPath(uid))),
        getDoc(doc(db, "profiles", uid))
    ]);
    const profile = prof.status === 'fulfilled' ? (prof.value.exists() ? prof.value.data() : {}) : null;
    const legacy = profile && Array.isArray(profile.indexHistory) ? profile.indexHistory : null;
    if (priv.status === 'rejected') {
        // Unreadable private doc (offline with nothing cached, or rules not
        // deployed yet): the legacy copy is all there is. Without one the
        // history is unknown, not empty.
        console.warn("Private index history read failed:", priv.reason);
        return { history: legacy, profile };
    }
    const stored = priv.value.exists() && Array.isArray(priv.value.data().indexHistory)
        ? priv.value.data().indexHistory : null;
    // No private doc and the profile couldn't be read: a legacy history may
    // exist that we can't see.
    if (!stored && profile === null) return { history: null, profile };
    return { history: mergeIndexHistories(stored || [], legacy || []), profile };
}

/**
 * Low HI: the lowest published index within the trailing 365 days, read from
 * the player's index history (see readHandicapDocs; published HIs are exactly
 * what WHS defines Low HI against). Returns null when there is no usable
 * history — calculateIndex then skips the caps.
 *
 * @param {string} uid - The player whose Low HI to derive.
 * @returns {Promise<number|null>} The Low HI, or null when not established.
 */
async function fetchLowHI(uid) {
    try {
        const { history, profile } = await readHandicapDocs(uid);
        // established: null = unknown (the profile or history couldn't be
        // read). The 54-hole gate treats it as not established; Set starting
        // index stays closed, so an offline declaration can't replace a
        // published index.
        if (profile === null) return { lowHI: null, priorHI: null, established: null };
        const priorHI = parseFloat(profile.handicapIndex);
        // History unreadable but the profile isn't: its current index still
        // stays on show; only Low HI and "established" are
        // unknown.
        if (history === null) return { lowHI: null, priorHI: Number.isFinite(priorHI) ? priorHI : null, established: null };
        const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
        const recent = history
            .filter(h => h && h.date && new Date(h.date).getTime() >= cutoff)
            .map(h => parseFloat(h.index))
            .filter(Number.isFinite);
        // Established = this app has published a computed index before. Only
        // updateUserHandicapIndexArray writes the history, and only with a
        // real index; a declared starting index (handicapIndexSource
        // 'declared') writes handicapIndex alone and does not count.
        const established = history.some(h => h && Number.isFinite(parseFloat(h.index)));
        return {
            lowHI: recent.length ? Math.min(...recent) : null,
            priorHI: Number.isFinite(priorHI) ? priorHI : null,
            established
        };
    } catch (e) {
        console.warn("Low HI lookup failed; caps skipped this pass:", e);
        return { lowHI: null, priorHI: null, established: null };
    }
}

/**
 * The Handicap Index in effect when a backdated card was played: the last
 * indexHistory entry published before that day began. A card from last month
 * was converted with TODAY's index, so its Daily Handicap, Stableford-to-AGS
 * conversion and differential all used the wrong number.
 *
 * Limitation: indexHistory is stamped when the app published each index, not
 * when the rounds behind it were played. After a backfill session (several
 * old cards logged in one sitting) the history only moves from that day on,
 * so a card played between the backfilled rounds sees the index from before
 * the session. Deriving the index on a date from the rounds' own dates would
 * fix that; it is a bigger change than this lookup.
 *
 * @param {Array<{date:string, index:string}>|null} indexHistory - the player's index history
 *   (null while it hasn't loaded).
 * @param {string} datePlayed - The card's YYYY-MM-DD day.
 * @param {string} today - Today's YYYY-MM-DD (the player's day).
 * @returns {number|null|undefined} undefined = use the current index (no date,
 *   or today with nothing published since the day began and none before);
 *   null = no index was in effect then (or it can't be known yet);
 *   otherwise the index that day.
 */
export function indexOnDate(indexHistory, datePlayed, today) {
    const played = parseLocalDate(datePlayed);
    if (!played || !today || datePlayed > today) return undefined;
    // A card dated today uses the index in effect when the day began too: an
    // index published later today (another round saved) came after this one
    // was played (codex P2). With nothing published at all, today's card uses
    // the current one; with no history to hand (still loading, or offline)
    // it waits like any other date, so a later index can't slip in.
    const isToday = datePlayed === today;
    if (!Array.isArray(indexHistory)) return null;
    const start = played.getTime();
    let best = null;
    let publishedSince = false;
    for (const h of indexHistory) {
        const t = h && h.date ? new Date(h.date).getTime() : NaN;
        const idx = h ? parseFloat(h.index) : NaN;
        if (!Number.isFinite(t) || !Number.isFinite(idx)) continue;
        if (t >= start) { publishedSince = true; continue; }
        if (!best || t >= best.t) best = { t, idx };
    }
    if (best) return best.idx;
    return isToday && !publishedSince ? undefined : null;
}

// The latest calculateIndex result and whose rounds it came from.
let _lastCalculated = { uid: null, index: null };

/**
 * Whether the app has calculated an index from this player's rounds in the
 * current snapshot: the index string, null when it hasn't, or undefined when
 * the listener isn't on this player (unknown).
 * @param {string} uid
 * @returns {string|null|undefined}
 */
export function calculatedIndexFor(uid) {
    return _lastCalculated.uid === uid ? _lastCalculated.index : undefined;
}

/**
 * The player's index history (see readHandicapDocs): [] when there is none,
 * null when it couldn't be read (offline with nothing cached). The two must
 * stay distinct: an unreadable history is not "no index on that date", and is
 * worth retrying.
 * @param {string} uid
 * @returns {Promise<Array|null>}
 */
export async function fetchIndexHistory(uid) {
    try {
        return (await readHandicapDocs(uid)).history;
    } catch (e) {
        console.warn("Index history lookup failed:", e);
        return null;
    }
}

/**
 * Sets up a real-time Firestore listener for the currently viewed player's rounds.
 * Automatically recalculates the handicap index on every data change.
 */
export function listenToWHSRounds() {
    if (unsubscribeWHS) unsubscribeWHS();

    if (AppState.viewingPlayerId === null) {
        AppState.currentRounds = [];
        return;
    }

    const q = query(
        collection(db, "whs_rounds"),
        where("uid", "==", AppState.viewingPlayerId),
        orderBy("date", "desc")
    );

    if (UI.loadingState) UI.loadingState.classList.remove('hidden');
    if (UI.emptyState) UI.emptyState.classList.add('hidden');
    // Hidden until this player's snapshot says whether it applies, so a coach's
    // own button never shows over a student's header.
    document.getElementById('btn-set-start-index')?.classList.add('hidden');

    unsubscribeWHS = onSnapshot(q, async (snapshot) => {
        if (UI.loadingState) UI.loadingState.classList.add('hidden');

        const newRounds = [];
        snapshot.forEach((doc) => {
            newRounds.push(normalizeRoundDoc({ id: doc.id, ...doc.data() }));
        });

        const viewed = AppState.viewingPlayerId;
        const { lowHI, priorHI, established } = await fetchLowHI(viewed);
        // A coach who switched players while the profile read was pending: this
        // snapshot is for the previous player. Applying it would show their index
        // (and could publish it to the coach's own profile).
        if (AppState.viewingPlayerId !== viewed) return;
        const { index, usedIds, details } = calculateIndex(newRounds, lowHI, priorHI, established);
        _lastCalculated = { uid: viewed, index };
        // Until the rounds establish one, the index on the profile (a declared
        // starting index) is the one in use: On Course reads it for Daily
        // Handicaps, without manufacturing an unplayed nine. Showing
        // "—" instead made a declared index look unsaved after every reload.
        const shownIndex = index != null ? index
            : (Number.isFinite(priorHI) ? formatHandicap(priorHI) : null);
        renderIndexExplainer(index, details, newRounds); // "Why this index?" trust card

        // Batch updates to state
        AppState.usedIds = usedIds;
        AppState.handicapIndex = shownIndex;
        AppState.currentRounds = newRounds;
        syncStartingIndexButton(index, shownIndex, established);

        // Only publish a real index. Writing the "not established" signal to
        // profiles/{uid} is how every new user ended up on the coach directory
        // as a scratch golfer (F-4); a declared starting index set through the
        // dashboard field stays untouched until 54 counting holes establish one.
        if (index != null && AppState.currentUser && AppState.viewingPlayerId === AppState.currentUser.uid) {
            updateUserHandicapIndexArray(index);
        }
    }, (err) => {
        console.error("WHS Listen Error:", err);
        if (UI.loadingState) UI.loadingState.classList.add('hidden');
    });
}

// ==========================================
// Handicap Trend Chart (Chart.js)
// ==========================================
let _trendChart = null;

/**
 * Initializes and renders a Line Chart showing the player's handicap differential trend over time.
 * Uses Chart.js for data visualization.
 * 
 * @param {Array<Object>} rounds - The array of rounds to visualize.
 */
export function renderTrendChart(rounds) {
    const canvas = document.getElementById('handicap-chart');
    const noData = document.getElementById('chart-no-data');
    if (!canvas) return;

    // Filter to counting rounds with valid data, sorted oldest → newest
    const counting = gaScoreRecord(rounds || []).completed.reverse();

    if (counting.length < 3) {
        canvas.style.display = 'none';
        if (noData) {
            noData.innerHTML = coldStartPreview(rounds, 'trend');
            noData.classList.remove('hidden');
        }
        return;
    }
    canvas.style.display = '';
    if (noData) noData.classList.add('hidden');

    const labels = counting.map(r => {
        const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
        return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    });
    // F-6: the chart plotted the raw nine-hole figure while the index used the
    // scaled one, so a player mixing nines and eighteens saw a saw-tooth that
    // was an artefact of the display rather than of their golf.
    const diffs = counting.map(r => r.diff);

    // Destroy previous chart instance
    if (_trendChart) { _trendChart.destroy(); _trendChart = null; }

    _trendChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Differential',
                data: diffs,
                borderColor: '#3867d6',
                backgroundColor: 'rgba(56,103,214,0.08)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#3867d6',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` Differential: ${ctx.parsed.y}`
                    }
                }
            },
            scales: {
                y: {
                    reverse: false,
                    title: { display: true, text: 'Differential (lower = better)' },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

/**
 * Tells listeners (the Log a past round form's cached index history) that a
 * new history entry was just written. Fired once the write is issued, not when
 * it settles: Firestore's local cache already serves it to the next read, and
 * offline the promise never settles.
 * @returns {void}
 */
function announceIndexHistoryChanged() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('index-history-changed'));
}

/**
 * Publishes the newly calculated Handicap Index: the current value to the
 * public profiles/{uid}.handicapIndex, the dated trail (last 50) to the
 * private users/{uid}/private/handicap.indexHistory.
 *
 * A legacy profiles/{uid}.indexHistory is merged into the private doc and
 * deleted from the profile, but only after the private write is confirmed, so
 * a rejected or still-queued write never loses it. If the private doc is
 * refused for lack of permission (the client deployed before the rules), the
 * trail goes to the legacy field as before; the new rules refuse that write,
 * so it only lands while the old rules are live.
 *
 * @param {string} index - The current 1-decimal handicap index string.
 */
async function updateUserHandicapIndexArray(index) {
    if (!AppState.currentUser) return;
    try {
        const uid = AppState.currentUser.uid;
        const profRef = doc(db, "profiles", uid);
        const privRef = doc(db, ...privateHandicapPath(uid));
        const [privRead, profRead] = await Promise.allSettled([getDoc(privRef), getDoc(profRef)]);
        if (profRead.status === 'rejected') throw profRead.reason;
        // The private doc refused outright: the old rules are still live (the
        // client deploys first). The legacy field is the only store they allow.
        const oldRules = privRead.status === 'rejected' && privRead.reason && privRead.reason.code === 'permission-denied';
        // Any other unreadable private doc: publishing would overwrite a
        // history we can't see.
        if (privRead.status === 'rejected' && !oldRules) throw privRead.reason;
        const privSnap = oldRules ? null : privRead.value;
        const profSnap = profRead.value;
        const profile = profSnap.exists() ? profSnap.data() : null;
        const legacy = profile && Array.isArray(profile.indexHistory) ? profile.indexHistory : null;
        const hasLegacyField = !!profile && profile.indexHistory !== undefined;
        const stored = privSnap && privSnap.exists() && Array.isArray(privSnap.data().indexHistory)
            ? privSnap.data().indexHistory : [];
        let history = mergeIndexHistories(stored, legacy || []);

        // Publish if empty or if the last recorded index is different.
        const last = history[history.length - 1];
        const publish = !last || last.index !== index;
        if (publish) history = mergeIndexHistories(history, [{ date: new Date().toISOString(), index: index }]);

        if (oldRules) {
            if (!publish && profile && String(profile.handicapIndex) === String(index)) return;
            const fields = publish ? { handicapIndex: index, indexHistory: history } : { handicapIndex: index };
            const write = profile ? updateDoc(profRef, fields) : setDoc(profRef, fields, { merge: true });
            if (publish) announceIndexHistoryChanged();
            await write;
            return;
        }

        // Write the private trail when it grows, or to take over a legacy one.
        const privWrite = (publish || legacy) ? setDoc(privRef, { indexHistory: history, updatedAt: serverTimestamp() }) : null;
        // On Course reads handicapIndex. It is rewritten on publish, and when
        // the history already ends on this index but the profile holds
        // something else: a starting index declared while the calculated one
        // was briefly gone (a round marked not counting, then back).
        const profWrite = (publish || !profile || String(profile.handicapIndex) !== String(index))
            ? (profile ? updateDoc(profRef, { handicapIndex: index }) : setDoc(profRef, { handicapIndex: index }, { merge: true }))
            : null;
        if (publish) announceIndexHistoryChanged();

        const [privResult, profResult] = await Promise.allSettled([privWrite, profWrite]);
        if (profResult.status === 'rejected') console.error("Failed to update profile handicap index:", profResult.reason);
        if (privResult.status === 'rejected') {
            console.error("Failed to write private index history:", privResult.reason);
            if (privResult.reason && privResult.reason.code === 'permission-denied' && publish) {
                await updateDoc(profRef, { indexHistory: history }).catch(() => { });
            }
            return;
        }
        if (privWrite && hasLegacyField) await updateDoc(profRef, { indexHistory: deleteField() });
    } catch (e) {
        console.error("Failed to update profile handicap array:", e);
    }
}

/**
 * Reads a typed Handicap Index. Golf Australia prints a plus handicap as
 * "+1.2", which is an index of -1.2; parseFloat("+1.2") is 1.2, about 2.5
 * strokes the wrong way on every Daily Handicap. "-1.2" is accepted too.
 * @param {string} typed - The prompt's text.
 * @returns {number} The index (negative for a plus handicap), or NaN.
 */
export function parseDeclaredIndex(typed) {
    const s = String(typed).trim().replace(',', '.');
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
    const value = parseFloat(s);
    return s.startsWith('+') ? -value : value;
}

/**
 * "Set starting index": how a golfer arriving with an existing GA handicap
 * declares it. PRODUCT SWEEP 2026-09-10 F-4 made the header's number input
 * save what was typed; but that input was live at any time, even after the
 * app had calculated an index, and On Course reads the stored value for every
 * Daily Handicap, so one stray thumb changed the next round's strokes. The
 * number is text now, and this button only shows on the golfer's own
 * dashboard while the app has no calculated index (see syncStartingIndexButton).
 *
 * The declared value is a STARTING index: calculateIndex overwrites it through
 * updateUserHandicapIndexArray once 54 counting holes establish a real one.
 * @returns {void}
 */
export function bindStartingIndexButton() {
    const btn = document.getElementById('btn-set-start-index');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', async () => {
        // A coach viewing a student never gets here (the button is hidden),
        // but the write must not depend on that.
        if (!AppState.currentUser || AppState.viewingPlayerId !== AppState.currentUser.uid) return;
        // Hidden once an index is established (see syncStartingIndexButton).
        if (_indexEstablished) return;
        const typed = prompt("Your current Golf Australia Handicap Index (e.g. 18.4, or +1.2 for a plus handicap):");
        if (typed === null || String(typed).trim() === '') return;
        const value = parseDeclaredIndex(typed);
        // WHS range, matching the input's own min/max: a plus handicap is
        // legitimate, 54.0 is the ceiling.
        if (!Number.isFinite(value) || value < -10 || value > 54) {
            alert("Enter your Handicap Index between -10.0 and 54.0.");
            return;
        }
        const index = formatHandicap(value);
        // Use it straight away. Offline, Firestore queues the write and the
        // promise only settles on reconnect (possibly after the round), so
        // applying it after the await left the header on a dash and On
        // Course with no Daily Handicap. Same order as the round save.
        const previous = AppState.handicapIndex;
        AppState.handicapIndex = index;
        syncStartingIndexButton(null, index);
        try {
            await setDoc(doc(db, "profiles", AppState.currentUser.uid), {
                handicapIndex: index,
                // Marks it as the player's own declaration rather than a
                // figure this app computed, so the distinction survives.
                handicapIndexSource: 'declared'
            }, { merge: true });
        } catch (e) {
            console.error("Failed to save declared handicap index:", e);
            // Rejected outright (e.g. permissions), not merely queued: undo,
            // unless a snapshot has replaced it in the meantime.
            if (AppState.handicapIndex === index) AppState.handicapIndex = previous;
            alert("Couldn't save your Handicap Index. Check your connection and try again.");
        }
    });
}

// Set by syncStartingIndexButton for the viewed player; the click handler
// refuses a declaration over an established index.
let _indexEstablished = false;

/**
 * Shows "Set starting index" only on the golfer's own dashboard and only while
 * the app has never calculated an index from their rounds. Under WHS a
 * starting index is for a player who has never had one: once the app has
 * published an index (established), a dip below three counting scores keeps
 * the last published index rather than inviting a declaration over it.
 * @param {string|null} calculatedIndex - calculateIndex's result for the viewed player.
 * @param {string|null} [shownIndex] - The index on show (declared or last published).
 * @param {boolean|null} [established=false] - The app has published an index
 *   before; null = unknown (profile unreadable), which keeps the button closed.
 * @returns {void}
 */
export function syncStartingIndexButton(calculatedIndex, shownIndex = null, established = false) {
    _indexEstablished = established !== false;
    const btn = document.getElementById('btn-set-start-index');
    if (!btn) return;
    const own = !!AppState.currentUser && AppState.viewingPlayerId === AppState.currentUser.uid;
    btn.classList.toggle('hidden', !(own && calculatedIndex == null && established === false));
    const sub = UI.indexSubtextEl || document.getElementById('index-subtext');
    if (sub && calculatedIndex == null && shownIndex != null) {
        // One line at 375px: the Set starting index button is still shown
        // here, and a two-line subtext pushed the banner past its budget.
        // A coach viewing a student sees the student's, not their own.
        sub.textContent = established === true
            ? (own ? 'Your last published index' : 'Last published index')
            : (own ? 'Your starting index, until rounds set one' : 'Starting index, until rounds set one');
    }
}

/**
 * Saves a new manual round entry to Firestore.
 * 
 * @param {string} course - Name of the golf course.
 * @param {number} rating - Scratch rating.
 * @param {number} slope - Slope rating.
 * @param {number} adjustedGross - Final WHS Adjusted Gross Score.
 * @param {Object} [stats] - Optional performance statistics (putts, gir, etc).
 * @param {boolean} [notCounting=false] - Whether the round is excluded from the handicap index.
 * @param {Object} [opts] - visibility, holesPlayed and the date played.
 * @param {string} [opts.datePlayed] - The YYYY-MM-DD day from the form's Date Played.
 * @returns {Promise<boolean>} Success status.
 */
export async function addRound(course, rating, slope, adjustedGross, stats = null, notCounting = false, { visibility = 'private', holesPlayed = 18, datePlayed = null, notCountingReason = null } = {}) {
    try {
        // PRODUCT SWEEP 2026-09-10 F-8: the "Log a past round" form has a
        // REQUIRED Date Played that nothing read, and this wrote the moment of
        // entry instead. Backfilling a season of cards — the normal way a new
        // player seeds a handicap — collapsed every round onto today, in typing
        // order, which is exactly the ordering `orderBy("date","desc")` uses to
        // pick the most recent 20. The entry instant is still recorded, as
        // createdAt, where it cannot masquerade as the date played.
        const played = parseLocalDate(datePlayed);
        const roundData = {
            uid: AppState.currentUser.uid,
            course: course,
            rating: rating,
            slope: slope,
            adjustedGross: adjustedGross,
            date: played || serverTimestamp(),
            createdAt: serverTimestamp(),
            notCounting: notCounting,
            // PRODUCT SWEEP 2026-09-10 F-6: this field used to be omitted
            // entirely, so calculateIndex's WHS 5.1b nine-to-eighteen scaling
            // (whs.js, `if (r.holesPlayed === 9)`) never fired for a manually
            // logged round. The same nine gave an index of 17.3 through the
            // on-course tracker and 8.3 through this form.
            holesPlayed: holesPlayed === 9 ? 9 : 18,
            // AUDIT A1 fix: explicit shareability. Default 'private' — the
            // feed fan-out (functions/index.js onRoundCreated) publishes only
            // rounds explicitly marked public.
            visibility: visibility === 'public' ? 'public' : 'private'
        };
        if (stats && (stats.putts || stats.fwy || stats.gir)) {
            roundData.stats = stats;
        }
        // Same field the On Course save writes: why the app, not the golfer,
        // kept this round out of the index.
        if (notCountingReason) roundData.notCountingReason = notCountingReason;
        // PRODUCT SWEEP 2026-09-10 SECOND PASS F-9: this used to `await addDoc`.
        // Under persistentLocalCache an offline write promise NEVER settles —
        // it does not resolve and it does not reject — so the caller in
        // app-v4.js parked on this line with the submit button disabled and
        // reading "Saving…", indefinitely, with no alert and no error. The
        // natural response is to reload and type the card in again, and because
        // addDoc mints a new id every time, that produced a DUPLICATE round the
        // moment signal returned.
        //
        // The document is durable in Firestore's own IndexedDB queue the instant
        // it is handed over, so the honest answer is "saved" as soon as the
        // write is issued. Minting the id client-side (doc(collection(...)))
        // needs no network and makes the write idempotent, which is why the
        // on-course save survives a double tap and this did not.
        const ref = doc(collection(db, "whs_rounds"));
        setDoc(ref, roundData).catch(e => console.error("Cloud Save Fail (addRound):", e));
        return true;
    } catch (e) {
        console.error("Error adding document: ", e);
        return false;
    }
}

/**
 * Utility for global deletion of a round record.
 */
window.deleteWhsRound = async function (id) {
    if (confirm("Are you sure you want to delete this round?")) {
        await deleteDoc(doc(db, "whs_rounds", id));
    }
};

/** "the 16/08/2026 round at Keperra - Old" for confirm prompts. */
function roundLabel(round) {
    let d = round.date;
    if (d && typeof d.toDate === 'function') d = d.toDate();
    else if (typeof d === 'string') d = new Date(d);
    const day = (d instanceof Date && !isNaN(d)) ? `the ${d.toLocaleDateString()} round` : 'this round';
    return round.course ? `${day} at ${round.course}` : day;
}

/**
 * Utility for toggling whether a specific round should count towards the handicap index.
 */
window.toggleCountingRules = async function (id) {
    const roundDoc = AppState.currentRounds.find(r => r.id === id);
    if (!roundDoc) return;
    const isCurrentlyNotCounting = roundDoc.notCounting === true;
    // The row offers no Include for these; refuse here too, so no other
    // route can put an uncapped or unratable score into the index.
    const why = isCurrentlyNotCounting ? appExcludedReason(roundDoc) : null;
    if (why) {
        const whose = AppState.currentUser && AppState.currentUser.uid === roundDoc.uid ? 'your' : 'their';
        alert(`This round can't count towards ${whose} handicap: ${why}.`);
        return;
    }

    // Check permission - must be owner or admin
    if (AppState.currentUser && (AppState.currentUser.uid === roundDoc.uid || window.currentUserIsAdmin)) {
        // One stray tap used to drop a round from the index with no warning.
        const whose = AppState.currentUser.uid === roundDoc.uid ? 'your' : 'their';
        if (!isCurrentlyNotCounting && !confirm(`Exclude ${roundLabel(roundDoc)} from ${whose} handicap? It stays in the record, and can be included again.`)) {
            return;
        }
        await updateDoc(doc(db, "whs_rounds", id), {
            notCounting: !isCurrentlyNotCounting
        });
    } else {
        alert("Permission denied");
    }
};

