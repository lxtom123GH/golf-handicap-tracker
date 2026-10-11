// @vitest-environment jsdom
// ==========================================================================
// touch-measure.test.js — long-press the hole map to measure a distance
// ==========================================================================
//
// Owner 2026-10-04: "being able to put my finger on the map to find out the
// distance - ie how far to cover a creek or be short or a bunker". A press
// held still for MEASURE_HOLD_MS drops a target showing ball→target and
// target→green centre; a swipe still draws a line; a tap clears the target;
// the target is never saved (onChange never fires for it).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fromFrame, makeFrame } from '../../src/geo.js';
import {
    mountHoleOverlay, measureDistances, measureLabel, MEASURE_HOLD_MS,
} from '../../src/hole-overlay.js';

describe('measureDistances (pure)', () => {
    it('frame metres are true metres: a 3-4-5 triangle', () => {
        const d = measureDistances([0, 0], [30, 40], [30, 140]);
        expect(d.fromBallM).toBeCloseTo(50, 6);
        expect(d.toPinM).toBeCloseTo(100, 6);
    });
    it('no anchor measures from the tee (frame origin)', () => {
        expect(measureDistances(null, [0, 120], [0, 300]).fromBallM).toBeCloseTo(120, 6);
    });
    it('label rounds to whole metres', () => {
        expect(measureLabel({ fromBallM: 141.6, toPinM: 96.2 })).toBe('142 m · 96 to pin');
    });
});

// A no-op 2D context: every method is a stub, measureText has a width.
function stubContext() {
    const fns = {};
    return new Proxy({}, {
        get(_t, k) {
            if (k === 'measureText') return () => ({ width: 60 });
            if (!(k in fns)) fns[k] = () => {};
            return fns[k];
        },
        set() { return true; },
    });
}

// A real geographic hole: tee in Brisbane, green 300 m up the frame.
const TEE = [-27.4698, 153.0251];
const GREEN = fromFrame(makeFrame(TEE, fromFrame({ origin: TEE, bearing: 30 }, [0, 300])), [0, 300]);
const HOLE = { tee: { lat: TEE[0], lon: TEE[1] }, green: { centre: { lat: GREEN[0], lon: GREEN[1] } } };

function ptr(canvas, type, x, y, id = 1) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: x, clientY: y, pointerId: id, button: 0 });
    canvas.dispatchEvent(e);
}

describe('touch-to-measure state machine', () => {
    let canvas, onChange, ctl;
    beforeEach(() => {
        vi.useFakeTimers();
        HTMLCanvasElement.prototype.getContext = () => stubContext();
        document.body.innerHTML = '<div><canvas></canvas></div>';
        canvas = document.querySelector('canvas');
        onChange = vi.fn();
        ctl = mountHoleOverlay(canvas, HOLE, { onChange, startXY: [0, 50] });
    });
    afterEach(() => { ctl.destroy(); vi.useRealTimers(); });

    it('a long-press enters measure, drag moves it, lift pins it; never onChange, never a curve', () => {
        ptr(canvas, 'pointerdown', 160, 100);
        ptr(canvas, 'pointermove', 162, 101); // jitter under the 8 px slop
        vi.advanceTimersByTime(MEASURE_HOLD_MS + 20);
        const m0 = ctl.getMeasure();
        expect(m0).not.toBeNull();
        expect(canvas.dataset.measure).toMatch(/^\d+,\d+$/);
        // Distances agree with the pure helper from the anchor and green.
        const exp = measureDistances([0, 50], m0.xy, [0, 300]);
        expect(m0.fromBallM).toBeCloseTo(exp.fromBallM, 3);
        expect(m0.toPinM).toBeCloseTo(exp.toPinM, 1);
        // Drag: the target follows the finger, no stroke.
        ptr(canvas, 'pointermove', 160, 60);
        const m1 = ctl.getMeasure();
        expect(m1.xy[1]).toBeGreaterThan(m0.xy[1]); // finger up the screen → towards the green
        ptr(canvas, 'pointerup', 160, 60);
        expect(ctl.getMeasure()).not.toBeNull(); // pinned after lift
        expect(ctl.state.drawing).toBeNull();
        expect(ctl.getCurves().intended).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('a quick swipe still draws a line and never measures', () => {
        ptr(canvas, 'pointerdown', 160, 200);
        for (let i = 1; i <= 10; i++) ptr(canvas, 'pointermove', 160 + i, 200 - i * 12);
        vi.advanceTimersByTime(MEASURE_HOLD_MS * 3);
        ptr(canvas, 'pointerup', 170, 80);
        expect(ctl.getMeasure()).toBeNull();
        expect(canvas.dataset.measure).toBeUndefined();
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(ctl.getCurves().intended.length).toBeGreaterThanOrEqual(2);
    });

    it('a slow drag that starts moving before the hold still draws', () => {
        ptr(canvas, 'pointerdown', 160, 200);
        vi.advanceTimersByTime(MEASURE_HOLD_MS - 100);
        ptr(canvas, 'pointermove', 160, 180); // 20 px — cancels the hold
        vi.advanceTimersByTime(MEASURE_HOLD_MS);
        ptr(canvas, 'pointermove', 160, 100);
        ptr(canvas, 'pointerup', 160, 100);
        expect(ctl.getMeasure()).toBeNull();
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('a tap clears a pinned target without starting a line', () => {
        ptr(canvas, 'pointerdown', 160, 100);
        vi.advanceTimersByTime(MEASURE_HOLD_MS + 20);
        ptr(canvas, 'pointerup', 160, 100);
        expect(ctl.getMeasure()).not.toBeNull();
        ptr(canvas, 'pointerdown', 100, 150);
        ptr(canvas, 'pointerup', 100, 150);
        expect(ctl.getMeasure()).toBeNull();
        expect(canvas.dataset.measure).toBeUndefined();
        expect(ctl.getCurves().intended).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('a new long-press moves a pinned target; clearMeasure() removes it', () => {
        ptr(canvas, 'pointerdown', 160, 100);
        vi.advanceTimersByTime(MEASURE_HOLD_MS + 20);
        ptr(canvas, 'pointerup', 160, 100);
        const a = ctl.getMeasure().xy;
        ptr(canvas, 'pointerdown', 120, 180);
        vi.advanceTimersByTime(MEASURE_HOLD_MS + 20);
        ptr(canvas, 'pointerup', 120, 180);
        const b = ctl.getMeasure().xy;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(1);
        ctl.clearMeasure();
        expect(ctl.getMeasure()).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('a second finger during the hold becomes a gesture, not a measure', () => {
        ptr(canvas, 'pointerdown', 160, 100, 1);
        ptr(canvas, 'pointerdown', 200, 140, 2);
        vi.advanceTimersByTime(MEASURE_HOLD_MS + 20);
        expect(ctl.getMeasure()).toBeNull();
        // ...and the resting first finger never saves a line (Codex P2).
        ptr(canvas, 'pointerup', 160, 100, 1);
        ptr(canvas, 'pointerup', 200, 140, 2);
        expect(ctl.getCurves().intended).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('touch-to-measure with the "Hit something" arm on', () => {
    it('a tap on the actual line clears the target and still places the deflection', () => {
        vi.useFakeTimers();
        HTMLCanvasElement.prototype.getContext = () => stubContext();
        document.body.innerHTML = '<div><canvas></canvas></div>';
        const canvas = document.querySelector('canvas');
        const onChange = vi.fn();
        const onDeflectPlaced = vi.fn();
        const actual = [[0, 50], [0, 120], [0, 200]];
        const ctl = mountHoleOverlay(canvas, HOLE, {
            onChange, startXY: [0, 50], curves: { actual }, deflectArmed: () => true, onDeflectPlaced,
        });
        // Pin a target somewhere off the line.
        ptr(canvas, 'pointerdown', 40, 40);
        vi.advanceTimersByTime(MEASURE_HOLD_MS + 20);
        ptr(canvas, 'pointerup', 40, 40);
        expect(ctl.getMeasure()).not.toBeNull();
        // The target sits under the finger, so the pinned (40,40) target
        // gives the px→metre mapping (hole view, no rotation): find the px
        // of actual[1] = [0, 120] from it.
        const m = ctl.getMeasure().xy, mpp = ctl.metresPerPx();
        const tx = 40 + (0 - m[0]) / mpp, ty = 40 - (120 - m[1]) / mpp;
        onChange.mockClear();
        ptr(canvas, 'pointerdown', tx, ty);
        ptr(canvas, 'pointerup', tx, ty);
        expect(ctl.getMeasure()).toBeNull();
        expect(ctl.getCurves().deflectAt).toBe(1);
        expect(onDeflectPlaced).toHaveBeenCalledTimes(1);
        ctl.destroy();
        vi.useRealTimers();
    });
});
