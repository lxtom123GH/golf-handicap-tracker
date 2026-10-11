/**
 * intent-analysis.js — S2 Part A: pure aggregation over shot documents.
 * (brief: docs/agent-briefs/overlay-followons/S2-intent-vs-execution.md)
 *
 * Curves arrive as frame metres ([{x,y}] or [[x,y]]). The only import is
 * shot-shape.js (S1) so the thresholds have one source of truth. Read-only —
 * nothing here touches Firestore.
 */

import { classifyCurve } from './shot-shape.js';

const EMPTY_COUNTS = { Left: 0, Straight: 0, Right: 0 };
const EMPTY_SHAPES = { Hook: 0, Draw: 0, Straight: 0, Fade: 0, Slice: 0 };

/** Minimum shots before a pattern can be stated. */
export const MIN_SHOTS_FOR_PATTERN = 5;

function toPairs(curve) {
    if (!Array.isArray(curve)) return null;
    const out = [];
    for (const p of curve) {
        if (Array.isArray(p)) {
            if (typeof p[0] !== 'number' || typeof p[1] !== 'number') return null;
            out.push([p[0], p[1]]);
        } else if (p && typeof p === 'object' && typeof p.x === 'number' && typeof p.y === 'number') {
            out.push([p.x, p.y]);
        } else {
            return null;
        }
    }
    return out.length >= 2 ? out : null;
}

/**
 * Rotate and translate both curves so the intended line starts at (0,0) and
 * its chord points +y. Returns null when the shot lacks both curves. A
 * rotated copy of the same curve overlays itself (checkpoint test).
 */
export function normaliseToIntent(shot) {
    if (!shot) return null;
    const intended = toPairs(shot.lineIntended);
    const actual = toPairs(shot.lineActual);
    if (!intended || !actual) return null;
    const o = intended[0];
    const chordX = intended[intended.length - 1][0] - o[0];
    const chordY = intended[intended.length - 1][1] - o[1];
    // Angle of the intended chord away from +y; rotating every offset by -θ
    // maps the chord onto the +y axis.
    const theta = Math.atan2(chordX, chordY);
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const map = (curve) => curve.map(([x, y]) => {
        const dx = x - o[0], dy = y - o[1];
        return [dx * cos - dy * sin, dx * sin + dy * cos];
    });
    return { intended: map(intended), actual: map(actual) };
}

function modeOf(counts) {
    let best = null, bestN = -1;
    for (const [k, n] of Object.entries(counts)) {
        if (n > bestN) { best = k; bestN = n; }
    }
    return bestN > 0 ? best : null;
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
/** Population standard deviation (the ellipse is over the observed set). */
const sd = (xs) => {
    if (xs.length === 0) return null;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length);
};

/**
 * Aggregate the shots of ONE club (caller filters) into the planned-vs-
 * executed summary. Shots without both curves are skipped, never crash —
 * EXCEPT endpoint-only shots (S9: flight unseen + a GPS finish), which count
 * in n and in the finish ellipse while contributing nothing to the executed
 * shape/start-line counts. Planned/executed labels come from classifyCurve on
 * the RAW frame curves — the start line is relative to the hole axis, not to
 * the normalised frame. Executed prefers the stored derived (S1) and
 * recomputes only for old shots.
 */
export function summariseClub(shots) {
    const club = (shots && shots.length && shots[0].club) || '';

    const planned = { startLine: { ...EMPTY_COUNTS }, shape: { ...EMPTY_SHAPES } };
    const executed = { startLine: { ...EMPTY_COUNTS }, shape: { ...EMPTY_SHAPES } };
    const longs = [], rights = [];
    let n = 0;

    for (const shot of shots || []) {
        if (shot?.planned === true) continue; // S11: planned, never played
        if (!shot) continue;
        const intended = toPairs(shot.lineIntended);
        const actual = toPairs(shot.lineActual);
        const endpoint = !!shot.actualEndpointOnly;
        if (!intended || (!actual && !endpoint)) continue;
        n++;

        const plan = classifyCurve(shot.lineIntended);
        if (plan.startLine in planned.startLine) planned.startLine[plan.startLine]++;
        if (plan.shape in planned.shape) planned.shape[plan.shape]++;

        if (!endpoint) {
            const exec = (shot.derived && shot.derived.startLine)
                ? shot.derived
                : classifyCurve(shot.lineActual);
            if (exec.startLine in executed.startLine) executed.startLine[exec.startLine]++;
            if (exec.shape in executed.shape) executed.shape[exec.shape]++;
        }

        // Finish offset: prefer the stored (possibly GPS-measured) offset,
        // else compute it from the raw curves.
        const fo = (shot.derived && shot.derived.finishOffset) || finishOffsetRaw(shot);
        if (fo && typeof fo.longM === 'number' && typeof fo.rightM === 'number') {
            longs.push(fo.longM);
            rights.push(fo.rightM);
        }
    }

    const summary = {
        club, n,
        planned, executed,
        finish: { meanLongM: mean(longs), meanRightM: mean(rights), sdLongM: sd(longs), sdRightM: sd(rights) },
        sentence: '',
    };
    summary.sentence = sentenceFor(summary);
    return summary;
}

function finishOffsetRaw(shot) {
    const intended = toPairs(shot.lineIntended);
    const actual = toPairs(shot.lineActual);
    if (!intended || !actual) return null;
    const ie = intended[intended.length - 1];
    const ae = actual[actual.length - 1];
    return { longM: ae[1] - ie[1], rightM: ae[0] - ie[0] };
}

const START_WORD = { Left: 'left', Straight: 'centre', Right: 'right' };
const SHAPE_WORD = { Hook: 'hook', Draw: 'draw', Straight: 'hit it straight', Fade: 'fade', Slice: 'slice' };

/** The one-sentence verdict over a club summary. */
export function sentenceFor(summary) {
    if (!summary || summary.n < MIN_SHOTS_FOR_PATTERN) {
        return `Log ${MIN_SHOTS_FOR_PATTERN} ${summary?.club || 'club'} shots with both lines to see your pattern.`;
    }
    const phrase = (word) => (word === 'hit it straight' ? 'hit it straight' : `${word} it`);
    const pStart = START_WORD[modeOf(summary.planned.startLine)] || 'centre';
    const pShape = SHAPE_WORD[modeOf(summary.planned.shape)] || 'swing it';
    const eStart = START_WORD[modeOf(summary.executed.startLine)] || 'centre';
    const eShape = SHAPE_WORD[modeOf(summary.executed.shape)] || 'swing it';
    if (pStart === eStart && pShape === eShape) {
        return `You do what you plan: start ${pStart}, ${pShape}.`;
    }
    return `You plan to start ${pStart} and ${phrase(pShape)}. You start ${eStart} and ${phrase(eShape)}.`;
}
