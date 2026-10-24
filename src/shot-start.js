// ==========================================
// shot-start.js — is the hold-still GPS fix this shot's START or its FINISH?
// A fix clearly beyond the tee area for shot 1, or far from the previous
// shot's finish for later shots, is where THIS shot finished.
// Pure, no imports; hole-frame metres
// (tee at [0, 0], y towards the green).
// ==========================================

export const SHOT_START = {
    // GPS margin beyond the tee area / distance from a later shot's start.
    nearM: 20,
    // Overlays may omit forward tees. Reserve 30 m before the GPS margin.
    teeForwardM: 30,
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
 * Later shots: 'finish' when the fix is more than nearM from a known start.
 * Shot 1 must be beyond the forward-most mapped tee plus nearM, with a
 * minimum allowance for unmapped forward tees. Sideways/backward fixes
 * cannot establish that the golfer has played up the hole.
 */
export function classifyCaptureRole({ shotNumber, fixXY, expectedStartXY: exp, teeXY = [], nearM = SHOT_START.nearM } = {}) {
    const fix = xyOf(fixXY);
    const start = xyOf(exp) || (exp == null && shotNumber === 1 ? [0, 0] : null);
    if (!fix || !start) return 'start';
    if (shotNumber === 1) {
        const forwardY = Math.max(SHOT_START.teeForwardM, ...teeXY.map(xyOf).filter(Boolean).map(p => p[1]));
        return fix[1] > forwardY + nearM ? 'finish' : 'start';
    }
    return Math.hypot(fix[0] - start[0], fix[1] - start[1]) > nearM ? 'finish' : 'start';
}
