/**
 * gps-capture.js — S10 Part A: pure GPS capture policy.
 * (brief: docs/agent-briefs/overlay-followons/S10-gps-capture-policy.md)
 *
 * No imports. Replaces S4's single-fix ≤25 m gate: hold still for a 4 s
 * window, accept two good fixes in a row immediately, flag low confidence
 * instead of silently accepting, refuse when it is hopeless, and detect
 * iOS Precise Location being off. Every number lives in GPS_POLICY — the
 * tests cite this object, never a bare literal.
 */

export const GPS_POLICY = {
    acceptNowM: 8,        // accept immediately when this good and the previous fix was good
    acceptPrevM: 10,      // "previous usable fix ≤ 10 m" convergence bound (rule text)
    acceptWindowM: 12,    // best fix inside the window must be this good to accept
    lowConfidenceM: 30,   // 12-30 m: saved as lowConfidence, marker draggable
    windowMs: 4000,       // hold-still window
    maxFixAgeMs: 2000,    // a fix older than this is stale
    maxSpeedMps: 0.7,     // moving = not at the ball
    preciseOffM: 1000,    // accuracy above this = iOS Precise Location off
};

/**
 * Feed fixes as they arrive; ask for the decision whenever the caller likes.
 * `now` is injectable so tests can walk the clock; defaults to Date.now.
 */
export function createCapture(now = Date.now, policy = GPS_POLICY) {
    const t0 = now();
    const usable = [];   // fixes kept for consideration, in arrival order
    let ignored = 0;
    let state = 'waiting';
    let decided = null;  // frozen decision once accepted/lowConfidence/refused/preciseOff

    const bestFix = () => {
        // Best = smallest accuracy; ties → newest.
        let best = null;
        for (const f of usable) {
            if (!best) { best = f; continue; }
            if (f.accuracyM < best.accuracyM) best = f;
            else if (f.accuracyM === best.accuracyM && f.at > best.at) best = f;
        }
        return best;
    };

    const finish = (st, fix, reason) => {
        state = st;
        decided = {
            state: st,
            fix: fix || null,
            fixCount: { usable: usable.length, ignored },
            elapsedMs: now() - t0,
            reason: reason || '',
        };
        return decided;
    };

    return {
        /** fix: { lat, lon, accuracyM, speedMps|null, at }. */
        push(fix) {
            if (decided) return decided;   // decision is frozen; late fixes are noise
            if (!fix || typeof fix.accuracyM !== 'number' || typeof fix.at !== 'number') {
                ignored++;
                return decided || { state, fix: null, fixCount: { usable: usable.length, ignored }, elapsedMs: now() - t0, reason: 'malformed fix' };
            }
            const stale = (now() - fix.at) > policy.maxFixAgeMs;
            const moving = fix.speedMps != null && fix.speedMps > policy.maxSpeedMps;
            if (stale || moving) {
                ignored++;
                return decided || { state, fix: null, fixCount: { usable: usable.length, ignored }, elapsedMs: now() - t0, reason: stale ? 'stale fix' : 'moving' };
            }

            // Precise Location off: the first two usable fixes both hopeless.
            if (
                state !== 'preciseOff' &&
                usable.length === 1 &&
                usable[0].accuracyM > policy.preciseOffM &&
                fix.accuracyM > policy.preciseOffM
            ) {
                return finish('preciseOff', bestFix(), 'accuracy far above policy — Precise Location is likely off');
            }

            usable.push(fix);

            // Convergence: this fix ≤ acceptNowM AND the previous usable
            // fix was ≤ acceptPrevM — two good fixes in a row. A lone good
            // fix waits (the window decides).
            const prev = usable[usable.length - 2] || null;
            if (prev && prev.accuracyM <= policy.acceptPrevM && fix.accuracyM <= policy.acceptNowM) {
                return finish('accepted', fix, 'converged: two good fixes in a row');
            }
            return decided || { state, fix: bestFix(), fixCount: { usable: usable.length, ignored }, elapsedMs: now() - t0, reason: 'waiting' };
        },

        /** Call any time; final=true forces the window-end decision. */
        decide({ final = false } = {}) {
            if (decided) return decided;
            const elapsed = now() - t0;
            if (!final && elapsed < policy.windowMs) {
                return { state, fix: bestFix(), fixCount: { usable: usable.length, ignored }, elapsedMs: elapsed, reason: 'window open' };
            }
            const best = bestFix();
            if (!best) return finish('refused', null, 'no usable fix inside the window');
            if (best.accuracyM <= policy.acceptWindowM) return finish('accepted', best, 'best fix in window good enough');
            if (best.accuracyM <= policy.lowConfidenceM) return finish('lowConfidence', best, 'best fix in window weak — draggable');
            return finish('refused', best, `best fix ${Math.round(best.accuracyM)} m — too far off`);
        },
    };
}
