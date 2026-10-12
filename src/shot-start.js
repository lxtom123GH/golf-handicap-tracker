// ==========================================
// shot-start.js — is the hold-still GPS fix this shot's START or its FINISH?
// Owner decision 2026-10-11 (field test): the golfer sometimes logs a shot
// A fix far from the expected start
// (the tee for shot 1, else the previous shot's finish) is where THIS shot
// finished, not where it began. Pure, no imports; hole-frame metres
// (tee at [0, 0], y towards the green).
// ==========================================

export const SHOT_START = {
    // Farther than this from the expected start → the fix is the finish.
    nearM: 20,
};

function xyOf(p) {
    if (!p) return null;
    const xy = Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y];
    return Number.isFinite(xy[0]) && Number.isFinite(xy[1]) ? xy : null;
}

/**
 * Where this shot should start: the tee for shot 1; for shot 2+ the previous
 * shot's finishXY, else the end of its actual line; null when unknown.
 */
export function expectedStartXY({ shotNumber, prevShot } = {}) {
    if (shotNumber === 1) return [0, 0];
    if (!prevShot) return null;
    const fin = xyOf(prevShot.finishXY);
    if (fin) return fin;
    const line = prevShot.lineActual;
    return Array.isArray(line) && line.length ? xyOf(line[line.length - 1]) : null;
}

/**
 * 'finish' when the expected start is known and the fix is more than nearM
 * from that point is classified as this shot's finish; otherwise it is a start.
 * Shot 1 with no expected start passed uses the tee.
 */
export function classifyCaptureRole({ shotNumber, fixXY, expectedStartXY: exp, nearM = SHOT_START.nearM } = {}) {
    const fix = xyOf(fixXY);
    const start = xyOf(exp) || (exp == null && shotNumber === 1 ? [0, 0] : null);
    if (!fix || !start) return 'start';
    return Math.hypot(fix[0] - start[0], fix[1] - start[1]) > nearM ? 'finish' : 'start';
}
