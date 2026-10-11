/**
 * functions/lib/intent.js — S8: the intent-vs-execution maths, server-side.
 *
 * WHY A COPY. The client files (`src/shot-shape.js`, `src/intent-analysis.js`)
 * are ESM and live outside the functions deploy bundle, which only uploads
 * `functions/`. So this is a faithful CommonJS port, and
 * `tests/unit/intent-parity.test.js` runs BOTH implementations over the same
 * fixtures and fails the build if they ever disagree. If you change one, change
 * the other in the same commit — the parity test is what makes that safe.
 *
 * Pure: no Firestore, no DOM, no network. Curves are metres in the hole frame
 * (x = right of the tee-green axis, y = down-range).
 */

const SHAPE_THRESHOLDS = {
    minChordM: 15,
    startAngleDeg: 4,
    bendStraightM: 3,
    bendShapedM: 10,
    missOnTargetM: 10,
    startSampleFraction: 0.2,
};

const MIN_SHOTS_FOR_PATTERN = 5;

/** Label for the pooled fallback when no shot names a club (see summariseShots). */
const ALL_CLUBS = 'Your shots';

const EMPTY_COUNTS = { Left: 0, Straight: 0, Right: 0 };
const EMPTY_SHAPES = { Hook: 0, Draw: 0, Straight: 0, Fade: 0, Slice: 0 };

function normalise(pts) {
    if (!Array.isArray(pts)) return null;
    const out = [];
    for (const p of pts) {
        if (Array.isArray(p)) {
            if (p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') return null;
            out.push([p[0], p[1]]);
        } else if (p && typeof p === 'object' && typeof p.x === 'number' && typeof p.y === 'number') {
            out.push([p.x, p.y]);
        } else {
            return null;
        }
    }
    return out;
}

function dist(a, b) {
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function pointAtFraction(pts, fraction) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
        const d = dist(pts[i - 1], pts[i]);
        segs.push(d);
        total += d;
    }
    const target = total * fraction;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
        const d = segs[i - 1];
        if (acc + d >= target && d > 0) {
            const t = (target - acc) / d;
            return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
                pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
        }
        acc += d;
    }
    return pts[pts.length - 1];
}

/** Port of src/shot-shape.js classifyCurve. Keep in step; parity test guards. */
function classifyCurve(pts, { intended = null, endpointOnly = false, deflectAt = null } = {}) {
    const nulls = { startLine: null, shape: null, carryM: null, startAngleDeg: null, bendM: null, finishOffset: null };
    const p = normalise(pts);
    if (!p || p.length < 2) return { ...nulls };
    const chord = dist(p[0], p[p.length - 1]);
    if (chord < SHAPE_THRESHOLDS.minChordM) return { ...nulls };

    const k = Number.isInteger(deflectAt) && deflectAt > 0 && deflectAt < p.length - 1 ? deflectAt : null;
    const shapePts = k != null ? p.slice(0, k + 1) : p;

    const s = pointAtFraction(shapePts, SHAPE_THRESHOLDS.startSampleFraction);
    const startAngleDeg = Math.atan2(s[0] - p[0][0], s[1] - p[0][1]) * 180 / Math.PI;

    const dx = shapePts[shapePts.length - 1][0] - p[0][0];
    const dy = shapePts[shapePts.length - 1][1] - p[0][1];
    const segChord = Math.max(dist(p[0], shapePts[shapePts.length - 1]), 1e-6);
    const nx = dy / segChord;
    const ny = -dx / segChord;
    let bendM = 0;
    for (const q of shapePts) {
        const perp = (q[0] - p[0][0]) * nx + (q[1] - p[0][1]) * ny;
        if (Math.abs(perp) > Math.abs(bendM)) bendM = perp;
    }

    const startLine = startAngleDeg < -SHAPE_THRESHOLDS.startAngleDeg ? 'Left'
        : startAngleDeg > SHAPE_THRESHOLDS.startAngleDeg ? 'Right' : 'Straight';
    const absBend = Math.abs(bendM);
    let shape = 'Straight';
    if (absBend > SHAPE_THRESHOLDS.bendShapedM) shape = bendM > 0 ? 'Slice' : 'Hook';
    else if (absBend > SHAPE_THRESHOLDS.bendStraightM) shape = bendM > 0 ? 'Fade' : 'Draw';

    let finishOffset = null;
    const ip = normalise(intended);
    if (ip && ip.length >= 2) {
        const ae = p[p.length - 1];
        const ie = ip[ip.length - 1];
        finishOffset = { longM: ae[1] - ie[1], rightM: ae[0] - ie[0] };
    }

    if (endpointOnly) {
        return { startLine: null, shape: null, carryM: Math.round(chord), startAngleDeg: null, bendM: null, finishOffset };
    }

    return { startLine, shape, carryM: Math.round(chord), startAngleDeg, bendM, finishOffset };
}

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

function modeOf(counts) {
    let best = null, bestN = -1;
    for (const [k, n] of Object.entries(counts)) {
        if (n > bestN) { best = k; bestN = n; }
    }
    return bestN > 0 ? best : null;
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const sd = (xs) => {
    if (xs.length === 0) return null;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length);
};

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

/** Port of src/intent-analysis.js sentenceFor. */
function sentenceFor(summary) {
    if (!summary || summary.n < MIN_SHOTS_FOR_PATTERN) {
        return `Log ${MIN_SHOTS_FOR_PATTERN} ${(summary && summary.club) || 'club'} shots with both lines to see your pattern.`;
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

/** Port of src/intent-analysis.js summariseClub, plus S8's start-angle gap. */
function summariseClub(shots) {
    const club = (shots && shots.length && shots[0].club) || '';

    const planned = { startLine: { ...EMPTY_COUNTS }, shape: { ...EMPTY_SHAPES } };
    const executed = { startLine: { ...EMPTY_COUNTS }, shape: { ...EMPTY_SHAPES } };
    const longs = [], rights = [], angleGaps = [];
    let n = 0;

    for (const shot of shots || []) {
        if (shot && shot.planned === true) continue;
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
            const stored = shot.derived && shot.derived.startLine ? shot.derived : null;
            const exec = stored || classifyCurve(shot.lineActual);
            if (exec.startLine in executed.startLine) executed.startLine[exec.startLine]++;
            if (exec.shape in executed.shape) executed.shape[exec.shape]++;
            // S8: how far the ball STARTED from where the plan started, in
            // degrees. Recomputed from the curves so a shot whose stored
            // derived predates S1's angle field still counts.
            const execAngles = classifyCurve(shot.lineActual);
            if (typeof plan.startAngleDeg === 'number' && typeof execAngles.startAngleDeg === 'number') {
                angleGaps.push(execAngles.startAngleDeg - plan.startAngleDeg);
            }
        }

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
        startAngleGapDeg: mean(angleGaps),
        sentence: '',
    };
    summary.sentence = sentenceFor(summary);
    return summary;
}

/**
 * S8: group a flat shot list by club and rank the clubs whose execution is
 * furthest from the plan. `gapType` names what to practise:
 *   'start line' — the ball leaves on a different line from the plan
 *   'shape'      — it curves differently from the plan
 *   'distance'   — it finishes long or short of the planned end
 * Returns { clubs: [...summaries], basis: [{club, gapType, gapValue}] }.
 */
function summariseShots(shots, { minShots = MIN_SHOTS_FOR_PATTERN, maxClubs = 2 } = {}) {
    const byClub = new Map();
    const unlabelled = [];
    for (const shot of shots || []) {
        const club = shot && typeof shot.club === 'string' ? shot.club.trim() : '';
        if (!club) {
            if (shot) unlabelled.push(shot);
            continue;
        }
        if (!byClub.has(club)) byClub.set(club, []);
        byClub.get(club).push(shot);
    }

    const clubs = [];
    for (const [, group] of byClub) {
        const s = summariseClub(group);
        if (s.n >= minShots) clubs.push(s);
    }

    // Found on the owner's own data 2026-09-20: every shot he had drawn both
    // lines on carried NO club — he was testing the drawing flow and never
    // tapped the club row. Refusing to say anything because a button went
    // untapped is the app being pedantic: the swing data is right there. So
    // when no club reaches the threshold, fall back to one pooled group. The
    // advice loses the club name and keeps everything else.
    if (!clubs.length && unlabelled.length >= minShots) {
        const pooled = summariseClub(unlabelled.map(s => ({ ...s, club: ALL_CLUBS })));
        if (pooled.n >= minShots) clubs.push(pooled);
    }

    const scored = [];
    for (const s of clubs) {
        const angle = typeof s.startAngleGapDeg === 'number' ? Math.abs(s.startAngleGapDeg) : 0;
        const long = typeof s.finish.meanLongM === 'number' ? Math.abs(s.finish.meanLongM) : 0;
        const shapeChanged = modeOf(s.planned.shape) !== modeOf(s.executed.shape);
        // One club, one lesson: rank by the biggest single gap. Degrees and
        // metres are not comparable, so each is scored against its own
        // "worth practising" threshold and the largest ratio wins.
        const candidates = [
            { gapType: 'start line', gapValue: Math.round(angle * 10) / 10, unit: 'deg', ratio: angle / SHAPE_THRESHOLDS.startAngleDeg },
            { gapType: 'distance', gapValue: Math.round(long), unit: 'm', ratio: long / SHAPE_THRESHOLDS.missOnTargetM },
            { gapType: 'shape', gapValue: shapeChanged ? 1 : 0, unit: '', ratio: shapeChanged ? 1 : 0 },
        ];
        candidates.sort((a, b) => b.ratio - a.ratio);
        const top = candidates[0];
        if (top.ratio < 1) continue; // inside tolerance: nothing to fix
        scored.push({ club: s.club, gapType: top.gapType, gapValue: top.gapValue, unit: top.unit, ratio: top.ratio, summary: s });
    }

    scored.sort((a, b) => b.ratio - a.ratio);
    const picked = scored.slice(0, maxClubs);
    return {
        clubs,
        basis: picked.map(({ club, gapType, gapValue, unit }) => ({ club, gapType, gapValue, unit })),
        picked,
    };
}

/**
 * S8: the prompt section. Summaries only — never raw curves (token cost and
 * privacy, and the model cannot use coordinates anyway). Empty string when
 * there is nothing to say, so the prompt is byte-identical to pre-S8.
 */
function intentPromptSection(shots, opts) {
    const { clubs, picked } = summariseShots(shots, opts);
    if (!picked.length) return '';
    const considered = clubs.reduce((sum, c) => sum + c.n, 0);
    const lines = picked.map(({ club, gapType, gapValue, unit, summary }) => {
        const direction = gapType === 'start line'
            ? (summary.startAngleGapDeg > 0 ? 'right of' : 'left of')
            : gapType === 'distance'
                ? (summary.finish.meanLongM > 0 ? 'past' : 'short of')
                : 'different from';
        const gap = unit ? `${Math.abs(gapValue)}${unit === 'deg' ? '°' : ' m'} ${direction} plan` : `${direction} plan`;
        return `- ${club} (${summary.n} shots): ${summary.sentence} Gap: ${gapType}, ${gap}.`;
    });
    return `\nIntent vs execution (${considered} shots with both lines):\n${lines.join('\n')}`;
}

module.exports = {
    SHAPE_THRESHOLDS,
    MIN_SHOTS_FOR_PATTERN,
    ALL_CLUBS,
    classifyCurve,
    summariseClub,
    sentenceFor,
    summariseShots,
    intentPromptSection,
};
