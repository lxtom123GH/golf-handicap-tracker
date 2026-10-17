// @vitest-environment jsdom
// ==========================================
// live-follow-overlay.test.js — Map first GPS follow on the real overlay
// ==========================================
// Codex P2 (post-merge review of #233): re-centring on the live fix must not
// depend on Rotate map; with rotation off the bearing simply stays tee-up.
// Same harness as view-chip.test.js: the real mountHoleOverlay, stub 2D ctx.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fromFrame, makeFrame } from '../../src/geo.js';
import { mountHoleOverlay } from '../../src/hole-overlay.js';

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

const TEE = [-27.4698, 153.0251];
const GREEN = fromFrame(makeFrame(TEE, fromFrame({ origin: TEE, bearing: 30 }, [0, 380])), [0, 380]);
const HOLE = { tee: { lat: TEE[0], lon: TEE[1] }, green: { centre: { lat: GREEN[0], lon: GREEN[1] } } };

let ctl;
function mount(opts) {
    HTMLCanvasElement.prototype.getContext = () => stubContext();
    document.body.innerHTML = '<div id="section-line"><canvas></canvas></div>';
    const canvas = document.querySelector('canvas');
    ctl = mountHoleOverlay(canvas, HOLE, { onChange: vi.fn(), focus: { startXY: [0, 0], shotNumber: 1 }, startXY: [0, 0], ...opts });
    return canvas;
}
afterEach(() => { ctl?.destroy(); ctl = null; });

describe('Map first live follow', () => {
    it('quick logging keeps both lines at the shot start when the GPS marker moves', () => {
        const onChange = vi.fn();
        const curves = { intended: [[0, 0], [0, 170]], actual: [[0, 0], [4, 150]] };
        const canvas = mount({ anchorFirst: true, curves, mode: 'actual', onChange });
        const [lat, lon] = fromFrame(ctl.frame, [3, 120]);
        ctl.setStartMarker({ lat, lon, quality: 'accepted', draggable: false });
        expect(canvas.dataset.start).toBe('0,0');
        expect(ctl.getCurves()).toMatchObject(curves);
        // GPS is not a completed draw, even while Actual is armed.
        expect(onChange).not.toHaveBeenCalled();
    });

    it('wizard GPS capture still reanchors both stored lines', () => {
        const onChange = vi.fn();
        mount({ curves: { intended: [[0, 0], [0, 170]], actual: [[0, 0], [4, 150]] }, onChange });
        const [lat, lon] = fromFrame(ctl.frame, [3, 120]);
        ctl.setStartMarker({ lat, lon, quality: 'accepted', draggable: true });
        for (const line of [ctl.getCurves().intended, ctl.getCurves().actual]) {
            expect(line[0][0]).toBeCloseTo(3);
            expect(line[0][1]).toBeCloseTo(120);
        }
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ anchorChanged: true }));
    });

    it('with Rotate map OFF the shot view still re-centres on you (no rotation)', () => {
        const canvas = mount({ autoRotate: false });
        const mpp0 = ctl.metresPerPx();
        ctl.setLiveAnchor([20, 250]); // 130 m out: the approach band
        expect(canvas.dataset.follow).toBe('20,250');
        expect(ctl.metresPerPx()).not.toBe(mpp0);
        expect(Number(canvas.dataset.autoRot)).toBe(0);
    });

    it('with Rotate map ON it re-centres AND turns you → green up', () => {
        const canvas = mount({ autoRotate: true });
        ctl.setLiveAnchor([40, 200]);
        expect(canvas.dataset.follow).toBe('40,200');
        expect(Number(canvas.dataset.autoRot)).not.toBe(0);
    });

    it('holds the framing inside 40 m of the green (only the dot moves)', () => {
        const canvas = mount({ autoRotate: true });
        ctl.setLiveAnchor([0, 360]);
        expect(canvas.dataset.liveAnchor).toBe('0,360');
        expect(canvas.dataset.follow).toBeUndefined();
    });
});
