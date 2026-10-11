// ==========================================
// insights.js — pure performance analytics (benchmarks, tendencies, milestones)
// ==========================================
//
// No Firebase, no DOM — unit-testable. Consumed by modules/insights-render.js
// (WHS-tab Performance Insights + "why this index" trust card) and the Locker
// Room milestone chips.

import { isPerformanceRound } from './round-validity.js';

/**
 * Approximate amateur cohort benchmarks by handicap band, per 18 holes.
 * Sources: published Shot Scope / Arccos aggregate stats (2023-2025 public
 * summaries) — deliberately coarse and labelled "typical for your handicap"
 * in the UI. This is honest benchmarking, NOT true strokes gained (which
 * needs per-shot distance/lie baselines the app doesn't capture).
 */
export const HANDICAP_BENCHMARKS = [
    { maxHI: 5,   putts: 30, girPct: 56, firPct: 55 },
    { maxHI: 12,  putts: 32, girPct: 41, firPct: 50 },
    { maxHI: 20,  putts: 34, girPct: 27, firPct: 45 },
    { maxHI: 30,  putts: 36, girPct: 15, firPct: 40 },
    { maxHI: 200, putts: 38, girPct: 8,  firPct: 35 }
];

/** The benchmark row for a handicap index (null-safe → worst band). */
export function benchmarksFor(handicapIndex) {
    const hi = Number.isFinite(handicapIndex) ? handicapIndex : 54;
    return HANDICAP_BENCHMARKS.find(b => hi <= b.maxHI) || HANDICAP_BENCHMARKS[HANDICAP_BENCHMARKS.length - 1];
}

/**
 * Category insights from the player's counting rounds vs their cohort.
 * Rounds are normalised to per-18 figures using holesPlayed (default 18).
 * Only rounds carrying stats participate; returns null with fewer than 3.
 *
 * @param {Array<Object>} rounds - whs_rounds docs (need stats{putts,gir,fwy}, holesPlayed).
 * @param {number} handicapIndex
 * @returns {null|{categories: Array, focus: Object, roundsUsed: number}}
 */
export function computeCategoryInsights(rounds, handicapIndex) {
    const withStats = (rounds || []).filter(isPerformanceRound);
    if (withStats.length < 3) return null;

    let putts18 = 0, girPct = 0, firPct = 0;
    withStats.forEach(r => {
        const holes = r.holesPlayed === 9 ? 9 : 18;
        const scale = 18 / holes;
        putts18 += (Number(r.stats.putts) || 0) * scale;
        girPct += ((Number(r.stats.gir) || 0) / holes) * 100;
        firPct += ((Number(r.stats.fwy) || 0) / holes) * 100;
    });
    const n = withStats.length;
    putts18 /= n; girPct /= n; firPct /= n;

    const bench = benchmarksFor(handicapIndex);
    const categories = [
        {
            key: 'putting', label: 'Putting', unit: 'putts / 18',
            yours: Math.round(putts18 * 10) / 10, bench: bench.putts,
            // Putts convert 1:1 to strokes — the one honest strokes number here.
            deltaStrokes: Math.round((putts18 - bench.putts) * 10) / 10,
            betterWhenLower: true
        },
        {
            key: 'approach', label: 'Greens in regulation', unit: '% of holes',
            yours: Math.round(girPct), bench: bench.girPct,
            deltaStrokes: null, betterWhenLower: false
        },
        {
            key: 'driving', label: 'Fairways hit', unit: '% of holes',
            yours: Math.round(firPct), bench: bench.firPct,
            deltaStrokes: null, betterWhenLower: false
        }
    ];

    // Focus = the category furthest behind its benchmark, in relative terms.
    const gap = c => {
        const diff = c.betterWhenLower ? (c.yours - c.bench) : (c.bench - c.yours);
        return diff / Math.max(1, Math.abs(c.bench));
    };
    const focus = [...categories].sort((a, b) => gap(b) - gap(a))[0];

    return { categories, focus, roundsUsed: n };
}

/**
 * Per-club tendencies from detailed shot docs ({club, startLine, shape}).
 * @returns {Array<{club, count, topMiss, straightPct, lines: Object}>} sorted by usage.
 */
export function computeClubTendencies(shots) {
    const byClub = {};
    (shots || []).forEach(s => {
        if (!s || !s.club) return;
        // S11: a plan saved before the shot but never logged (round abandoned)
        // is not a shot; `planned` is cleared by the log path.
        if (s.planned === true) return;
        const c = byClub[s.club] || (byClub[s.club] = { club: s.club, count: 0, lines: {}, shapes: {}, results: {}, resultCount: 0 });
        c.count++;
        if (s.startLine) c.lines[s.startLine] = (c.lines[s.startLine] || 0) + 1;
        if (s.shape) c.shapes[s.shape] = (c.shapes[s.shape] || 0) + 1;
        // BL-MG-01: outcome vs target ("Short Right", "On Target", ...) — true
        // dispersion, stronger signal than start line when present. 'Unseen'
        // (honesty option for lost-in-flight balls) never counts as a miss.
        if (s.missPattern && s.missPattern !== 'Unseen') { c.results[s.missPattern] = (c.results[s.missPattern] || 0) + 1; c.resultCount++; }
    });

    return Object.values(byClub)
        .filter(c => c.count >= 5) // too few shots = noise, not a tendency
        .map(c => {
            const straight = c.lines.Straight || 0;
            const misses = Object.entries(c.lines).filter(([k]) => k !== 'Straight');
            misses.sort((a, b) => b[1] - a[1]);
            const resultMisses = Object.entries(c.results).filter(([k]) => k !== 'On Target');
            resultMisses.sort((a, b) => b[1] - a[1]);
            const onTarget = c.results['On Target'] || 0;
            return {
                club: c.club,
                count: c.count,
                straightPct: Math.round((straight / c.count) * 100),
                topMiss: misses.length && misses[0][1] > 0 ? misses[0][0] : null,
                lines: c.lines,
                // Dispersion (null until 5+ shots for this club carry missPattern):
                onTargetPct: c.resultCount >= 5 ? Math.round((onTarget / c.resultCount) * 100) : null,
                topResultMiss: c.resultCount >= 5 && resultMisses.length && resultMisses[0][1] > 0
                    ? { pattern: resultMisses[0][0], pct: Math.round((resultMisses[0][1] / c.resultCount) * 100) }
                    : null,
                results: c.results
            };
        })
        .sort((a, b) => b.count - a.count);
}

/**
 * Coarse club grouping for filtered dispersion views. Handles the default bag
 * ('Driver', '3 Wood', 'Mid Irons', '56', 'Putter') and sensible custom names.
 * @returns {'driver'|'woods'|'irons'|'wedges'|'putter'|'other'}
 */
export function clubGroup(club) {
    if (!club) return 'other';
    const c = String(club).toLowerCase();
    if (c.includes('putter')) return 'putter';
    if (c.includes('driver') || c === 'dr') return 'driver';
    if (c.includes('wood') || /^\d+\s*w$/.test(c) || c.includes('hybrid') || /^\d+\s*h$/.test(c)) return 'woods';
    if (c.includes('iron') || /^\d+\s*i$/.test(c)) return 'irons';
    if (c.includes('wedge') || /^[apgsl]w$/.test(c) || /^\d{2}$/.test(c)) return 'wedges';
    return 'other';
}

/**
 * Routine-vs-result correlation (coach idea #1, 2026-07-04): the wizard
 * records a pre-shot routine Pass/Fail AND (BL-MG-01) where the ball finished
 * vs target. This compares on-target rate with and without the routine.
 * Needs a minimum sample on both sides or the percentages are noise.
 *
 * @param {Array<Object>} shots - shot docs ({routines: {pre}, missPattern}).
 * @returns {null|{passN, failN, passOnPct, failOnPct, deltaPct}}
 */
export function computeRoutineImpact(shots) {
    const b = { Pass: { n: 0, on: 0 }, Fail: { n: 0, on: 0 } };
    (shots || []).forEach(s => {
        const r = s && s.routines && s.routines.pre;
        if (!r || !b[r] || !s.missPattern || s.missPattern === 'Unseen') return;
        b[r].n++;
        if (s.missPattern === 'On Target') b[r].on++;
    });
    if (b.Pass.n < 10 || b.Fail.n < 5) return null;
    const passOnPct = Math.round((b.Pass.on / b.Pass.n) * 100);
    const failOnPct = Math.round((b.Fail.on / b.Fail.n) * 100);
    return { passN: b.Pass.n, failN: b.Fail.n, passOnPct, failOnPct, deltaPct: passOnPct - failOnPct };
}

/**
 * Stack-style putt diagnosis (BL-OC2): a missed putt is either a stroke
 * problem (didn't start on the intended line) or a read problem (started on
 * line, wrong line). Splits the two from the wizard's puttLine/puttRead taps.
 *
 * @param {Array<Object>} shots - shot docs; only Putter shots carrying a
 *   puttLine or puttRead tap participate.
 * @returns {null|{taps:number, onLinePct:number|null, goodReadPct:number|null,
 *   verdict:string|null}} null under 6 tagged putts (too noisy to speak).
 *   verdict names the weaker skill when the gap is ≥15 points.
 */
export function computePuttDiagnostics(shots) {
    let lineN = 0, lineOn = 0, readN = 0, readGood = 0;
    (shots || []).forEach(s => {
        if (!s || s.club !== 'Putter') return;
        if (s.puttLine) { lineN++; if (s.puttLine === 'On Line') lineOn++; }
        if (s.puttRead) { readN++; if (s.puttRead === 'Good Read') readGood++; }
    });
    const taps = Math.max(lineN, readN);
    if (taps < 6) return null;
    const onLinePct = lineN ? Math.round((lineOn / lineN) * 100) : null;
    const goodReadPct = readN ? Math.round((readGood / readN) * 100) : null;
    let verdict = null;
    if (onLinePct !== null && goodReadPct !== null) {
        if (goodReadPct - onLinePct >= 15) verdict = 'stroke';
        else if (onLinePct - goodReadPct >= 15) verdict = 'read';
    }
    return { taps, onLinePct, goodReadPct, verdict };
}

/**
 * Before/after a completed drill (coach idea #3): average the key per-round
 * stats for up to `n` stat-carrying counting rounds either side of the
 * completion date. Attribution is left to the coach — this reports the
 * numbers, not causality.
 *
 * @param {Array<Object>} rounds - whs_rounds docs; date may be a Firestore
 *   Timestamp ({toDate}) or Date. Rounds are normalised per-18.
 * @param {number} completedAtMs - drill completion time in epoch millis.
 * @returns {null|{before: Object, after: Object}} each side:
 *   {rounds, putts, gir, fwy, stableford} (nulls where no data). Null overall
 *   unless BOTH sides have at least 2 usable rounds.
 */
export function computeDrillImpact(rounds, completedAtMs, n = 5) {
    const usable = (rounds || []).filter(r =>
        r && r.stats && Number(r.stats.putts) > 0 && r.notCounting !== true && r.date);
    const ms = r => (r.date.toDate ? r.date.toDate() : new Date(r.date)).getTime();
    const before = usable.filter(r => ms(r) < completedAtMs).sort((a, b) => ms(b) - ms(a)).slice(0, n);
    const after = usable.filter(r => ms(r) >= completedAtMs).sort((a, b) => ms(a) - ms(b)).slice(0, n);
    if (before.length < 2 || after.length < 2) return null;

    const avg = list => {
        let putts = 0, gir = 0, fwy = 0, stb = 0, stbN = 0;
        list.forEach(r => {
            const scale = 18 / (r.holesPlayed === 9 ? 9 : 18);
            putts += (Number(r.stats.putts) || 0) * scale;
            gir += (Number(r.stats.gir) || 0) * scale;
            fwy += (Number(r.stats.fwy) || 0) * scale;
            if (Number(r.totalStableford) > 0) { stb += Number(r.totalStableford) * scale; stbN++; }
        });
        const n2 = list.length;
        const r1 = x => Math.round(x * 10) / 10;
        return {
            rounds: n2,
            putts: r1(putts / n2),
            gir: r1(gir / n2),
            fwy: r1(fwy / n2),
            stableford: stbN ? r1(stb / stbN) : null
        };
    };
    return { before: avg(before), after: avg(after) };
}

/**
 * Personal-best milestones for a just-saved round vs prior history, compared
 * within the same holesPlayed class (a 9-hole 38 isn't an 18-hole record).
 *
 * @param {Object} round - {totalGross, totalStableford, holesPlayed, stats}
 * @param {Array<Object>} priorRounds - the player's earlier whs_rounds docs.
 * @returns {Array<string>} human-ready milestone strings (may be empty).
 */
export function computeMilestones(round, priorRounds) {
    const out = [];
    if (!round) return out;
    const holes = round.holesPlayed === 9 ? 9 : 18;
    const same = (priorRounds || []).filter(r => ((r.holesPlayed === 9 ? 9 : 18) === holes));

    const total = same.length + 1;
    if (same.length === 0) out.push(`🎉 First ${holes}-hole round on your record!`);
    if ([10, 25, 50, 100].includes(total)) out.push(`🏅 That's your ${total}th ${holes}-hole round!`);

    const bestOf = (fn, better) => {
        const vals = same.map(fn).filter(v => Number.isFinite(v) && v > 0);
        if (!vals.length) return false;
        const best = better === 'low' ? Math.min(...vals) : Math.max(...vals);
        const mine = fn(round);
        return Number.isFinite(mine) && mine > 0 && (better === 'low' ? mine < best : mine > best);
    };

    if (bestOf(r => Number(r.totalGross), 'low')) out.push(`🏆 New personal best gross: ${round.totalGross} (${holes} holes)!`);
    if (bestOf(r => Number(r.totalStableford), 'high')) out.push(`🔥 Best stableford yet: ${round.totalStableford} points!`);
    if (bestOf(r => r.stats && Number(r.stats.putts), 'low')) out.push(`🥌 Fewest putts ever: ${round.stats.putts}!`);
    if (bestOf(r => r.stats && Number(r.stats.gir), 'high')) out.push(`🎯 Most greens in regulation: ${round.stats.gir}!`);
    if (bestOf(r => r.stats && Number(r.stats.fwy), 'high')) out.push(`🚀 Most fairways hit: ${round.stats.fwy}!`);

    return out;
}

/**
 * BL-DEC-01: Tiger-5 card-wrecker detection (Scott Fawcett / DECADE). Three
 * of the five are computable from the per-hole detail live rounds now save
 * (holeScores: [{h, par, gross, putts}]): double bogeys, par-5 bogeys and
 * three-putts. #4 (bogey with a wedge in hand) needs per-shot distances and
 * lands when enough shots carry distanceToPinM; #5 (blown easy saves) is a
 * judgment call and stays out of automation.
 *
 * @param {Object} round - a whs_rounds doc (needs Array holeScores).
 * @returns {null|{doubles, par5Bogeys, threePutts, total, per18, parts: string[]}}
 */
export function computeTiger5(round) {
    const holes = round && Array.isArray(round.holeScores) ? round.holeScores : null;
    if (!holes || !holes.length) return null;

    let doubles = 0, par5Bogeys = 0, threePutts = 0;
    holes.forEach(hs => {
        const par = Number(hs.par) || 4;
        const gross = Number(hs.gross) || 0;
        if (!gross) return;
        if (gross >= par + 2) doubles++;
        if (par === 5 && gross > par) par5Bogeys++;
        if (Number(hs.putts) >= 3) threePutts++;
    });

    const total = doubles + par5Bogeys + threePutts;
    const per18 = Math.round((total * (18 / holes.length)) * 10) / 10;
    const parts = [];
    if (doubles) parts.push(`${doubles} double${doubles > 1 ? 's' : ''}+`);
    if (par5Bogeys) parts.push(`${par5Bogeys} par-5 bogey${par5Bogeys > 1 ? 's' : ''}`);
    if (threePutts) parts.push(`${threePutts} three-putt${threePutts > 1 ? 's' : ''}`);
    return { doubles, par5Bogeys, threePutts, total, per18, parts };
}

/**
 * BL-DEC-01: strategy-period comparison — the owner's "DECADE from 1 Aug,
 * review 1 Dec" idea. Buckets counting rounds into date-labelled periods and
 * averages the per-18 numbers so approaches can be compared like-for-like.
 * Sample size is surfaced (small ones must be labelled in the UI, not hidden).
 *
 * @param {Array<Object>} rounds - whs_rounds docs (date, stats, holeScores?).
 * @param {Array<Object>} periods - [{name, start: 'YYYY-MM-DD', end?: 'YYYY-MM-DD'|null}]
 * @returns {Array<Object>} one row per period: {name, start, end, rounds,
 *   stableford, putts, tiger5, tiger5Rounds} (nulls where no data).
 */
export function computeStrategyComparison(rounds, periods) {
    const ms = r => {
        if (!r.date) return NaN;
        return (r.date.toDate ? r.date.toDate() : new Date(r.date)).getTime();
    };
    const usable = (rounds || []).filter(r => r && r.notCounting !== true && Number.isFinite(ms(r)));

    return (periods || []).map(p => {
        const startMs = new Date(p.start + 'T00:00:00').getTime();
        const endMs = p.end ? new Date(p.end + 'T23:59:59').getTime() : Infinity;
        const inPeriod = usable.filter(r => ms(r) >= startMs && ms(r) <= endMs);

        let stb = 0, stbN = 0, putts = 0, puttsN = 0, t5 = 0, t5N = 0;
        inPeriod.forEach(r => {
            const scale = 18 / (r.holesPlayed === 9 ? 9 : 18);
            if (Number(r.totalStableford) > 0) { stb += Number(r.totalStableford) * scale; stbN++; }
            if (r.stats && Number(r.stats.putts) > 0) { putts += Number(r.stats.putts) * scale; puttsN++; }
            const tiger = computeTiger5(r);
            if (tiger) { t5 += tiger.per18; t5N++; }
        });
        const r1 = x => Math.round(x * 10) / 10;
        return {
            name: p.name, start: p.start, end: p.end || null,
            rounds: inPeriod.length,
            stableford: stbN ? r1(stb / stbN) : null,
            putts: puttsN ? r1(putts / puttsN) : null,
            tiger5: t5N ? r1(t5 / t5N) : null,
            tiger5Rounds: t5N
        };
    });
}

/**
 * BL-DEC-02: the player's dominant miss over their approach clubs (irons +
 * wedges + woods — the clubs you aim greens with), for strategy-aware aim
 * hints. Needs 10+ result-tapped shots or returns null.
 * @returns {null|{pattern: string, pct: number, n: number}}
 */
export function overallMissBias(shots) {
    const counts = {};
    let n = 0;
    (shots || []).forEach(s => {
        if (!s || !s.missPattern || s.missPattern === 'Unseen' || s.missPattern === 'On Target') {
            if (s && s.missPattern === 'On Target') n++;
            return;
        }
        const g = clubGroup(s.club);
        if (g === 'putter' || g === 'driver') return; // green-attack clubs only
        counts[s.missPattern] = (counts[s.missPattern] || 0) + 1;
        n++;
    });
    if (n < 10) return null;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] < 3) return null;
    return { pattern: top[0], pct: Math.round((top[1] / n) * 100), n };
}

/**
 * Owner feedback 2026-07-05: the simple-mode stats can contradict the score
 * ("GIR + 10 putts + gross 4"). Non-blocking sanity check — returns one
 * human message or null. Deliberately gentle: mid-round flow beats rigour,
 * so we warn, never block.
 *
 * The maths: gross = strokes-to-green + putts, and GIR means
 * strokes-to-green ≤ par − 2, so with GIR: gross ≤ (par − 2) + putts.
 * And you can't have more putts than total strokes.
 */
export function holeStatsSanity({ par, gross, putts, gir } = {}) {
    const g = Number(gross) || 0;
    const p = Number(putts) || 0;
    if (!g) return null; // no score yet — nothing to contradict

    if (p > 0 && p >= g) {
        return `🤔 ${p} putt${p > 1 ? 's' : ''} but only ${g} stroke${g > 1 ? 's' : ''} total — check one of them.`;
    }
    if (gir && p > 0 && Number(par) >= 3 && g > (Number(par) - 2) + p) {
        return `🤔 GIR on a par ${par} with ${p} putt${p > 1 ? 's' : ''} caps the score at ${(Number(par) - 2) + p} — you've entered ${g}.`;
    }
    return null;
}
