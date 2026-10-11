// @vitest-environment jsdom
// ==========================================
// view-chip.test.js — glass chips PR 5: the visible Hole / Shot chip
// ==========================================
// Same harness as touch-measure.test.js: the real mountHoleOverlay on a
// stub 2D context.

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
    ctl = mountHoleOverlay(canvas, HOLE, { onChange: vi.fn(), ...opts });
    return canvas;
}
const chip = () => document.querySelector('.map-view-chip');

afterEach(() => { ctl?.destroy(); ctl = null; });

describe('glass chips PR 5: Hole / Shot view chip', () => {
    it('a shot view shows the chip, labelled with the view it switches TO', () => {
        const canvas = mount({ focus: { startXY: [0, 200], shotNumber: 2 }, startXY: [0, 200] });
        expect(canvas.dataset.viewMode).toBe('shot');
        expect(chip()).not.toBeNull();
        expect(chip().tagName).toBe('BUTTON');
        expect(chip().getAttribute('type')).toBe('button');
        expect(chip().textContent).toContain('Hole');
        expect(chip().getAttribute('aria-pressed')).toBe('false');
        expect(chip().parentElement.id).toBe('section-line');
    });

    it('tapping toggles shot ↔ hole, the label follows, and nothing is drawn', () => {
        const onChange = vi.fn();
        const canvas = mount({ focus: { startXY: [0, 200], shotNumber: 2 }, startXY: [0, 200], onChange });
        const mppShot = ctl.metresPerPx();
        chip().click();
        expect(canvas.dataset.viewMode).toBe('hole');
        expect(ctl.getViewMode()).toBe('hole');
        expect(chip().textContent).toContain('Shot');
        expect(chip().getAttribute('aria-pressed')).toBe('true');
        expect(ctl.metresPerPx()).toBeGreaterThan(mppShot); // the hole view is further out
        chip().click();
        expect(canvas.dataset.viewMode).toBe('shot');
        expect(chip().textContent).toContain('Hole');
        expect(onChange).not.toHaveBeenCalled();
        expect(ctl.getCurves().intended).toBeNull();
        expect(ctl.getMeasure()).toBeNull();
    });

    it('setViewMode (API) keeps the chip label in step', () => {
        mount({ focus: { startXY: [0, 200], shotNumber: 2 }, startXY: [0, 200] });
        ctl.setViewMode('hole');
        expect(chip().textContent).toContain('Shot');
        ctl.setViewMode('shot');
        expect(chip().textContent).toContain('Hole');
    });

    it('no shot view (no focus) → no chip: there is nothing to toggle', () => {
        mount({});
        expect(chip()).toBeNull();
    });

    it('destroy removes the chip (re-mounts, e.g. draw mode, never stack two)', () => {
        mount({ focus: { startXY: [0, 200], shotNumber: 2 }, startXY: [0, 200] });
        ctl.destroy(); ctl = null;
        expect(chip()).toBeNull();
    });
});
