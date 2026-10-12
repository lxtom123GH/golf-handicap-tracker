// ==========================================
// quick-log.js — one-tap shot logging on the play map (pure part)
// ==========================================
//
// Map-first quick logging on the play map. In Map
// first, while walking (Play mode's full-screen map), a shot is logged
// straight on the map. No target button, no wizard, no mode switch:
//   - RIGHT rail: Plan, Actual, Undo. A chip must be ARMED before a finger
//     draws (a stray touch only pans). Plan + drag = the intended line from
//     the start dot; Actual + drag = the actual line, and that logs the shot.
//   - Actual with good GPS is ONE tap: the line runs from the start dot to
//     where you stand (the GPS marks the finish position). For a few seconds
//     after, a drag nudges it. Weak or no GPS: Actual arms drawing instead.
//   - LEFT rail: the club, preselected from the distance to the pin.
//
// Pure only (unit-tested). src/modules/play-mode.js does the DOM; the save
// goes through score-input.js's saveShotData, the wizard's own save path.

import { GPS_POLICY } from './gps-capture.js';
import { normalisePlayMode } from './play-mode.js';

/**
 * One-tap Actual: the fix must be as good as the hold-still capture would
 * accept, fresh, and far enough from the start that it is a finish (the
 * same 20 m the shot-start rule uses), not the ball you are standing over.
 */
export const QUICK_GPS = {
    maxAccuracyM: GPS_POLICY.acceptWindowM,
    maxAgeMs: 15_000,
    minFromStartM: 20,
    // Farther than this from the green you are not on this hole (the same
    // bound the Map first live follow uses).
    maxFromGreenM: 750,
};

/** How long a drag nudges a one-tap Actual line (the mock's ~6 s). */
export const QUICK_ADJUST_MS = 6000;

/** On the green (or nearly): the putter is the likely club. */
export const PUTT_M = 20;

/**
 * Is one-tap logging on? Map first shot entry + Play mode + a Detailed
 * round on a course with a map file. (Play mode itself still needs this
 * hole's map; without one the normal round screen and wizard are used.)
 */
export function quickLogWanted({ shotEntry, playMode, trackingMode, courseSlug } = {}) {
    return shotEntry === 'map'
        && normalisePlayMode(playMode) === 'on'
        && trackingMode !== 'simple'
        && !!courseSlug;
}

/**
 * The likely club for `distM` to the pin, as an index into a clubLadder()
 * (longest first, putter last): the shortest club whose guide carry still
 * gets there; the longest when none does; the putter within PUTT_M. With no
 * distance, the top of the ladder. -1 for an empty bag.
 */
export function likelyClubIndex(ladder, distM, { puttM = PUTT_M } = {}) {
    if (!Array.isArray(ladder) || !ladder.length) return -1;
    if (!Number.isFinite(distM)) return 0;
    const putter = ladder.findIndex(c => /putter/i.test(String(c?.val || '')));
    if (distM <= puttM && putter >= 0) return putter;
    let best = -1;
    ladder.forEach((c, i) => { if (Number.isFinite(c?.carry) && c.carry >= distM) best = i; });
    return best >= 0 ? best : 0;
}

/**
 * Can Actual be one tap right now? {ok, reason, distM}. reason is one of
 * 'no-gps' | 'weak' | 'stale' | 'no-frame' | 'off-hole' | 'at-start' when
 * it can't. fixXY / startXY / greenXY are hole-frame metres.
 */
export function oneTapActual({ fix, fixXY, startXY, greenXY = null, gpsLive, now = Date.now(), policy = QUICK_GPS } = {}) {
    if (!gpsLive || !fix) return { ok: false, reason: 'no-gps' };
    if (!Number.isFinite(fix.accuracyM) || fix.accuracyM > policy.maxAccuracyM) return { ok: false, reason: 'weak' };
    if (!(Number.isFinite(fix.at) && now - fix.at <= policy.maxAgeMs)) return { ok: false, reason: 'stale' };
    const xyOk = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
    if (!xyOk(fixXY) || !xyOk(startXY)) return { ok: false, reason: 'no-frame' };
    if (xyOk(greenXY) && Math.hypot(fixXY[0] - greenXY[0], fixXY[1] - greenXY[1]) > policy.maxFromGreenM) {
        return { ok: false, reason: 'off-hole' };
    }
    const distM = Math.hypot(fixXY[0] - startXY[0], fixXY[1] - startXY[1]);
    if (distM < policy.minFromStartM) return { ok: false, reason: 'at-start' };
    return { ok: true, reason: '', distM };
}

// ---- The chip state machine ------------------------------------------------
// armed: null (map pans; nothing draws) | 'plan' | 'actual' | 'adjust' (the
// nudge window after a one-tap Actual). plan: the intended line waiting for
// its Actual ([x, y] pairs). undo: what Undo takes back, newest last:
//   {kind:'plan', prev}                      — a plan drawn (prev = the one before)
//   {kind:'shot', shotId, undo, intended}    — a shot logged (undo = what the save did)
//   {kind:'nudge', shotId, prev}             — a one-tap line nudged (prev = the fields before)

export function quickInitial() {
    return { armed: null, plan: null, undo: [] };
}

/**
 * One step. Returns {state, effect}; effect tells the caller what to do
 * (null = nothing): {kind:'plan'} | {kind:'log', source:'gps'|'drawn', ...}
 * | {kind:'nudge', shotId, actual} | {kind:'undo', entry} | {kind:'nothing'}.
 */
export function quickReduce(s, a) {
    const st = s || quickInitial();
    const lastShot = () => [...st.undo].reverse().find(e => e.kind === 'shot') || null;
    switch (a?.type) {
        case 'tap-plan':
            return { state: { ...st, armed: st.armed === 'plan' ? null : 'plan' }, effect: null };
        case 'tap-actual':
            if (a.gpsOk) return { state: { ...st, armed: null }, effect: { kind: 'log', source: 'gps', intended: st.plan } };
            return { state: { ...st, armed: st.armed === 'actual' ? null : 'actual' }, effect: null };
        case 'drawn': {
            if (st.armed === 'plan') {
                return {
                    state: { ...st, armed: null, plan: a.pts, undo: [...st.undo, { kind: 'plan', prev: st.plan }] },
                    effect: { kind: 'plan' },
                };
            }
            if (st.armed === 'actual') {
                return { state: { ...st, armed: null }, effect: { kind: 'log', source: 'drawn', actual: a.pts, intended: st.plan } };
            }
            if (st.armed === 'adjust') {
                const shot = lastShot();
                return { state: st, effect: shot ? { kind: 'nudge', shotId: shot.shotId, actual: a.pts } : null };
            }
            return { state: st, effect: null }; // nothing armed: a stray touch draws nothing
        }
        case 'logged':
            return {
                state: {
                    ...st, plan: null, armed: a.adjust ? 'adjust' : null,
                    undo: [...st.undo, { kind: 'shot', shotId: a.shotId, undo: a.undo || null, intended: a.intended || null }],
                },
                effect: null,
            };
        case 'nudged':
            return { state: { ...st, undo: [...st.undo, { kind: 'nudge', shotId: a.shotId, prev: a.prev }] }, effect: null };
        case 'adjust-end':
            return { state: st.armed === 'adjust' ? { ...st, armed: null } : st, effect: null };
        case 'undo': {
            if (!st.undo.length) return { state: { ...st, armed: null }, effect: { kind: 'nothing' } };
            const entry = st.undo[st.undo.length - 1];
            const rest = st.undo.slice(0, -1);
            let plan = st.plan;
            if (entry.kind === 'plan') plan = entry.prev;
            else if (entry.kind === 'shot') plan = entry.intended; // the line it took, back for a re-log
            return { state: { armed: null, plan, undo: rest }, effect: { kind: 'undo', entry } };
        }
        case 'reset':
            return { state: quickInitial(), effect: null };
        default:
            return { state: st, effect: null };
    }
}
