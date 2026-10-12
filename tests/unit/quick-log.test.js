// ==========================================
// quick-log.test.js — one-tap logging on the play map
// The pure parts:
// when it is on, which club is likely, when Actual can be one tap, and the
// chip state machine (Plan / Actual / Undo).
// ==========================================

import { describe, it, expect } from 'vitest';
import {
    QUICK_GPS, QUICK_ADJUST_MS, quickLogWanted, likelyClubIndex, oneTapActual,
    quickInitial, quickReduce,
} from '../../src/quick-log.js';
import { clubLadder } from '../../src/play-mode.js';
import { GPS_POLICY } from '../../src/gps-capture.js';

const LADDER = clubLadder([
    { label: 'Dr', val: 'Driver' }, { label: '3W', val: '3 Wood' }, { label: '5i', val: '5 Iron' },
    { label: '7i', val: '7 Iron' }, { label: '9i', val: '9 Iron' }, { label: 'PW', val: 'PW' },
    { label: 'SW', val: 'SW' }, { label: 'Putter', val: 'Putter' },
]);
const at = (val) => LADDER.findIndex(c => c.val === val);

describe('quickLogWanted: Map first + Play mode + Detailed + a mapped course', () => {
    const on = { shotEntry: 'map', playMode: 'on', trackingMode: 'detailed', courseSlug: 'keperra' };
    it('is on only when all four hold', () => {
        expect(quickLogWanted(on)).toBe(true);
        expect(quickLogWanted({ ...on, shotEntry: 'both' })).toBe(false);
        expect(quickLogWanted({ ...on, playMode: 'off' })).toBe(false);
        expect(quickLogWanted({ ...on, trackingMode: 'simple' })).toBe(false);
        expect(quickLogWanted({ ...on, courseSlug: null })).toBe(false);
    });
    it('an unknown play-mode value is the default (on)', () => {
        expect(quickLogWanted({ ...on, playMode: undefined })).toBe(true);
    });
});

describe('likelyClubIndex: the club the distance to the pin calls for', () => {
    it('the shortest club that still gets there', () => {
        expect(LADDER[likelyClubIndex(LADDER, 150)].val).toBe('5 Iron'); // 5i ≈ 170, 7i ≈ 146
        expect(LADDER[likelyClubIndex(LADDER, 140)].val).toBe('7 Iron');
        expect(LADDER[likelyClubIndex(LADDER, 100)].val).toBe('PW');     // PW ≈ 105
        expect(LADDER[likelyClubIndex(LADDER, 40)].val).toBe('SW');
    });
    it('too far for any club: the longest (Driver from the tee)', () => {
        expect(LADDER[likelyClubIndex(LADDER, 371)].val).toBe('Driver');
    });
    it('on or by the green: the putter', () => {
        expect(likelyClubIndex(LADDER, 12)).toBe(at('Putter'));
        expect(likelyClubIndex(LADDER, 0)).toBe(at('Putter'));
    });
    it('no distance: the top of the ladder; no bag: -1', () => {
        expect(likelyClubIndex(LADDER, null)).toBe(0);
        expect(likelyClubIndex([], 150)).toBe(-1);
    });
    it('a bag without a putter never suggests a missing club', () => {
        const noPutter = LADDER.filter(c => c.val !== 'Putter');
        expect(noPutter[likelyClubIndex(noPutter, 5)].val).toBe('SW');
    });
});

describe('oneTapActual: one tap only with a good, fresh fix away from the start', () => {
    const now = 1_000_000;
    const fix = { lat: 1, lon: 2, accuracyM: 5, at: now - 1000 };
    const ok = { fix, fixXY: [3, 150], startXY: [0, 0], gpsLive: true, now };
    it('good GPS, walked to the ball: one tap', () => {
        const r = oneTapActual(ok);
        expect(r.ok).toBe(true);
        expect(Math.round(r.distM)).toBe(150);
    });
    it('accuracy within the hold-still accept bound is good; worse falls back to drawing', () => {
        expect(QUICK_GPS.maxAccuracyM).toBe(GPS_POLICY.acceptWindowM);
        expect(oneTapActual({ ...ok, fix: { ...fix, accuracyM: QUICK_GPS.maxAccuracyM } }).ok).toBe(true);
        expect(oneTapActual({ ...ok, fix: { ...fix, accuracyM: QUICK_GPS.maxAccuracyM + 1 } })).toMatchObject({ ok: false, reason: 'weak' });
        expect(oneTapActual({ ...ok, fix: { ...fix, accuracyM: null } })).toMatchObject({ ok: false, reason: 'weak' });
    });
    it('GPS off or no fix: draw', () => {
        expect(oneTapActual({ ...ok, gpsLive: false })).toMatchObject({ ok: false, reason: 'no-gps' });
        expect(oneTapActual({ ...ok, fix: null })).toMatchObject({ ok: false, reason: 'no-gps' });
    });
    it('a stale fix: draw', () => {
        expect(oneTapActual({ ...ok, fix: { ...fix, at: now - QUICK_GPS.maxAgeMs - 1 } })).toMatchObject({ ok: false, reason: 'stale' });
    });
    it('still standing at the start (logging before walking): draw, never a zero-length shot', () => {
        expect(oneTapActual({ ...ok, fixXY: [2, QUICK_GPS.minFromStartM - 1] })).toMatchObject({ ok: false, reason: 'at-start' });
    });
    it('a fix nowhere near this hole (car park, another hole): draw', () => {
        expect(oneTapActual({ ...ok, greenXY: [0, 360] }).ok).toBe(true);
        expect(oneTapActual({ ...ok, fixXY: [0, -500], greenXY: [0, 360] })).toMatchObject({ ok: false, reason: 'off-hole' });
    });
    it('no map frame yet: draw', () => {
        expect(oneTapActual({ ...ok, fixXY: null })).toMatchObject({ ok: false, reason: 'no-frame' });
    });
});

describe('quickReduce: the chip state machine', () => {
    const line = (y) => [[0, 0], [0, y]];
    const step = (s, a) => quickReduce(s, a);

    it('idle → plan-armed → drawn → actual-armed → drawn (logs)', () => {
        let s = quickInitial();
        expect(s.armed).toBe(null);
        let r = step(s, { type: 'tap-plan' });
        expect(r.state.armed).toBe('plan');
        r = step(r.state, { type: 'drawn', pts: line(160) });
        expect(r.state.armed).toBe(null);
        expect(r.state.plan).toEqual(line(160));
        expect(r.effect).toEqual({ kind: 'plan' });
        r = step(r.state, { type: 'tap-actual', gpsOk: false });
        expect(r.state.armed).toBe('actual');
        expect(r.effect).toBe(null);
        r = step(r.state, { type: 'drawn', pts: line(150) });
        expect(r.state.armed).toBe(null);
        expect(r.effect).toEqual({ kind: 'log', source: 'drawn', actual: line(150), intended: line(160) });
    });

    it('a stray touch with nothing armed draws nothing', () => {
        const r = step(quickInitial(), { type: 'drawn', pts: line(80) });
        expect(r.effect).toBe(null);
        expect(r.state).toEqual(quickInitial());
    });

    it('tapping an armed chip again disarms it; the other chip swaps the arm', () => {
        let r = step(quickInitial(), { type: 'tap-plan' });
        r = step(r.state, { type: 'tap-plan' });
        expect(r.state.armed).toBe(null);
        r = step(r.state, { type: 'tap-plan' });
        r = step(r.state, { type: 'tap-actual', gpsOk: false });
        expect(r.state.armed).toBe('actual');
        r = step(r.state, { type: 'tap-actual', gpsOk: false });
        expect(r.state.armed).toBe(null);
    });

    it('Actual with good GPS logs in one tap, then opens the nudge window', () => {
        let r = step(quickInitial(), { type: 'tap-actual', gpsOk: true });
        expect(r.effect).toEqual({ kind: 'log', source: 'gps', intended: null });
        r = step(r.state, { type: 'logged', shotId: 's1', undo: { shotId: 's1' }, intended: null, adjust: true });
        expect(r.state.armed).toBe('adjust');
        // A drag in the window nudges the logged line, it never logs another shot.
        const n = step(r.state, { type: 'drawn', pts: line(140) });
        expect(n.effect).toEqual({ kind: 'nudge', shotId: 's1', actual: line(140) });
        expect(n.state.armed).toBe('adjust');
        // The window closes on its own.
        expect(step(r.state, { type: 'adjust-end' }).state.armed).toBe(null);
        expect(QUICK_ADJUST_MS).toBeGreaterThanOrEqual(4000);
    });

    it('a drawn Actual does not open the nudge window', () => {
        const r = step({ ...quickInitial(), armed: 'actual' }, { type: 'logged', shotId: 's1', undo: null, intended: null, adjust: false });
        expect(r.state.armed).toBe(null);
    });

    it('Undo takes back the last line first: nudge, then the shot (plan restored), then the plan', () => {
        let r = step(quickInitial(), { type: 'tap-plan' });
        r = step(r.state, { type: 'drawn', pts: line(160) });           // plan
        r = step(r.state, { type: 'tap-actual', gpsOk: true });
        r = step(r.state, { type: 'logged', shotId: 's1', undo: { shotId: 's1', putt: false }, intended: line(160), adjust: true });
        expect(r.state.plan).toBe(null);                                 // the shot took the plan
        r = step(r.state, { type: 'nudged', shotId: 's1', prev: { lineActual: 'before' } });

        r = step(r.state, { type: 'undo' });
        expect(r.effect).toEqual({ kind: 'undo', entry: { kind: 'nudge', shotId: 's1', prev: { lineActual: 'before' } } });
        r = step(r.state, { type: 'undo' });
        expect(r.effect.entry).toMatchObject({ kind: 'shot', shotId: 's1', undo: { shotId: 's1', putt: false } });
        expect(r.state.plan).toEqual(line(160));                         // the plan is back for a re-log
        r = step(r.state, { type: 'undo' });
        expect(r.effect.entry).toEqual({ kind: 'plan', prev: null });
        expect(r.state.plan).toBe(null);
        r = step(r.state, { type: 'undo' });
        expect(r.effect).toEqual({ kind: 'nothing' });
    });

    it('redrawing the plan keeps the earlier one for Undo', () => {
        let r = step(quickInitial(), { type: 'tap-plan' });
        r = step(r.state, { type: 'drawn', pts: line(160) });
        r = step(r.state, { type: 'tap-plan' });
        r = step(r.state, { type: 'drawn', pts: line(120) });
        expect(r.state.plan).toEqual(line(120));
        r = step(r.state, { type: 'undo' });
        expect(r.state.plan).toEqual(line(160));
    });

    it('Undo disarms; a new hole starts clean', () => {
        let r = step(quickInitial(), { type: 'tap-plan' });
        r = step(r.state, { type: 'undo' });
        expect(r.state.armed).toBe(null);
        r = step({ armed: 'plan', plan: line(9), undo: [{ kind: 'plan', prev: null }] }, { type: 'reset' });
        expect(r.state).toEqual(quickInitial());
    });

    it('never mutates the state it was given', () => {
        const s = Object.freeze({ armed: 'plan', plan: null, undo: Object.freeze([]) });
        expect(() => quickReduce(s, { type: 'drawn', pts: line(100) })).not.toThrow();
        expect(s.undo).toHaveLength(0);
    });
});
