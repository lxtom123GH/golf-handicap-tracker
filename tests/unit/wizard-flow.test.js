// ==========================================================================
// wizard-flow.test.js — S11 step line, buttons, captions (pure)
// ==========================================================================

import { describe, it, expect } from 'vitest';
import { wizardStepText, shotButtons, modeCaption, trackButtonLabel, loggedToast } from '../../src/wizard-flow.js';
import { computeShotView, anchorCurve, reanchorCurves } from '../../src/hole-overlay.js';

describe('S12 A2: anchorCurve — one start point per shot', () => {
    it('replaces the first point with the anchor and leaves the rest', () => {
        const pts = [[5, 5], [12, 30], [3, 61]];
        expect(anchorCurve(pts, [0, 0])).toEqual([[0, 0], [12, 30], [3, 61]]);
    });
    it('anchors a two-point swipe (the second sample survives)', () => {
        expect(anchorCurve([[9, 9], [40, 80]], [1, 2])).toEqual([[1, 2], [40, 80]]);
    });
    it('no anchor renders as stored (old shots)', () => {
        const pts = [[5, 5], [12, 30]];
        expect(anchorCurve(pts, null)).toEqual(pts);
    });
    it('never mutates the input', () => {
        const pts = [[5, 5], [12, 30]];
        anchorCurve(pts, [0, 0]);
        expect(pts).toEqual([[5, 5], [12, 30]]);
    });
    it('moves both stored starts when a later GPS fix changes the anchor', () => {
        const curves = {
            intended: [[0, 0], [12, 30], [3, 61]],
            actual: [[0, 0], [8, 24], [5, 45]],
            deflectAt: 1,
        };

        expect(reanchorCurves(curves, [2, 3])).toEqual({
            intended: [[2, 3], [12, 30], [3, 61]],
            actual: [[2, 3], [8, 24], [5, 45]],
            deflectAt: 1,
        });
        expect(curves.intended[0]).toEqual([0, 0]);
        expect(curves.actual[0]).toEqual([0, 0]);
    });
});

describe('S11 wizard flow: step text covers every state', () => {
    const cases = [];
    for (const hasIntended of [false, true]) for (const hasActual of [false, true]) for (const flightUnseen of [false, true]) {
        cases.push({ hasIntended, hasActual, flightUnseen });
    }
    it('eight combinations map to the three steps, naming the shot (S12 A1)', () => {
        expect(cases).toHaveLength(8);
        for (const c of cases) {
            const t = wizardStepText({ ...c, shotNumber: 2 });
            if (c.hasActual || c.flightUnseen) expect(t).toMatch(/^Shot 2 · check the buttons/);
            else if (c.hasIntended) expect(t).toMatch(/^Shot 2 · hit it/);
            else expect(t).toMatch(/^Shot 2 · draw the line/);
        }
        // A missing or zero shot number falls back to shot 1.
        expect(wizardStepText({})).toMatch(/^Shot 1 · draw/);
    });
    it('buttons: plan shows only with an intended line and no actual', () => {
        expect(shotButtons({ shotNumber: 1 })).toEqual({ plan: null, log: 'Log shot 1 · no line' });
        expect(shotButtons({ shotNumber: 2, hasIntended: true })).toEqual({ plan: 'Save plan', log: 'Log shot 2 · no actual' });
        expect(shotButtons({ shotNumber: 3, hasIntended: true, hasActual: true })).toEqual({ plan: null, log: 'Log shot 3' });
        expect(shotButtons({ shotNumber: 4, hasIntended: true, flightUnseen: true })).toEqual({ plan: null, log: 'Log shot 4' });
    });
    it('captions, hub label and toast name the action', () => {
        expect(modeCaption('intended', false)).toBe('Drawing: intended line');
        expect(modeCaption('actual', false)).toBe('Drawing: actual line');
        expect(modeCaption('actual', true)).toMatch(/Finish from GPS/);
        expect(trackButtonLabel(null)).toBe('🎯 Track My Shot');
        expect(trackButtonLabel(2)).toBe('🎯 Log shot 2 · draw what happened');
        expect(loggedToast(1, false)).toBe('Shot 1 logged · Track My Shot for the next one');
        expect(loggedToast(4, true)).toMatch(/holed out/);
    });
});

describe('S11 shot focus: framing bands', () => {
    const green = [0, 380];
    it('a full shot frames 30 m behind the start to the landing zone (240 m + 30), ±60 m', () => {
        const v = computeShotView([0, 0], green, 30);
        expect(v.minY).toBe(-30);
        expect(v.maxY).toBe(270);
        expect(v.minX).toBe(-60);
        expect(v.maxX).toBe(60);
        expect(v.band).toBe('full');
    });
    it('an approach frames to the green far edge + 25 m, ±50 m, and never behind the tee by more than 20 m', () => {
        const v = computeShotView([10, 200], green, 30);
        expect(v.band).toBe('approach');
        expect(v.minY).toBe(180);
        expect(v.maxY).toBe(380 + 15 + 25);
        // ±50 m around BOTH the start (x=10) and the green (x=0): -50 .. 60
        expect(v.minX).toBe(-50);
        expect(v.maxX).toBe(60);
    });
    it('on the green frames the green with 20 m padding', () => {
        const v = computeShotView([5, 370], green, 30);
        expect(v.band).toBe('green');
        expect(v.minY).toBe(380 - 15 - 20);
        expect(v.maxY).toBe(380 + 15 + 20);
    });
    it('a dogleg keeps both the start and the green inside the frame', () => {
        const v = computeShotView([-90, 150], green, 30);
        expect(v.minX).toBeLessThanOrEqual(-90 - 50);
        expect(v.maxX).toBeGreaterThanOrEqual(0 + 50);
    });
});
