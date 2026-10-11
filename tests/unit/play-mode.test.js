// @vitest-environment jsdom
// Play mode (owner 2026-10-06): the round on a full-screen map.
// Pure helpers, the overlay's read-only/fill options, and the module wiring.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fromFrame, makeFrame } from '../../src/geo.js';
import { mountHoleOverlay, MEASURE_HOLD_MS, computeShotView } from '../../src/hole-overlay.js';
import {
    PLAY_MODE_KEY, normalisePlayMode, readPlayMode, writePlayMode, playModeWanted,
    physicalHoleFor, sheetHandleLabel,
} from '../../src/play-mode.js';

describe('play mode preference (pure)', () => {
    it('is on unless explicitly off', () => {
        expect(normalisePlayMode(undefined)).toBe('on');
        expect(normalisePlayMode('weird')).toBe('on');
        expect(normalisePlayMode('off')).toBe('off');
    });
    it('reads/writes golf.playMode and survives a storage that throws', () => {
        const m = new Map();
        const st = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
        expect(readPlayMode(st)).toBe('on');
        writePlayMode(st, 'off');
        expect(m.get(PLAY_MODE_KEY)).toBe('off');
        expect(readPlayMode(st)).toBe('off');
        const boom = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
        expect(readPlayMode(boom)).toBe('on');
        expect(() => writePlayMode(boom, 'off')).not.toThrow();
    });
    it('needs the setting, a round and a hole map', () => {
        expect(playModeWanted({ pref: 'on', roundActive: true, hasHoleMap: true })).toBe(true);
        expect(playModeWanted({ pref: 'off', roundActive: true, hasHoleMap: true })).toBe(false);
        expect(playModeWanted({ pref: 'on', roundActive: false, hasHoleMap: true })).toBe(false);
        expect(playModeWanted({ pref: 'on', roundActive: true, hasHoleMap: false })).toBe(false);
    });
    it('maps the round hole to the physical hole (Keperra West starts at 19)', () => {
        expect(physicalHoleFor({ physicalHoles: [19, 20, 21] }, 2)).toBe(20);
        expect(physicalHoleFor({}, 4)).toBe(4);
    });
    it('names the sheet handle', () => {
        expect(sheetHandleLabel(1, false)).toBe('📊');
        expect(sheetHandleLabel(3, false)).toBe('👥 3');
        expect(sheetHandleLabel(3, true)).toBe('✕');
    });
});

// ---- overlay options --------------------------------------------------------
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
const GREEN = fromFrame(makeFrame(TEE, fromFrame({ origin: TEE, bearing: 30 }, [0, 300])), [0, 300]);
const HOLE = { tee: { lat: TEE[0], lon: TEE[1] }, green: { centre: { lat: GREEN[0], lon: GREEN[1] } } };
function ptr(canvas, type, x, y, id = 1) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: x, clientY: y, pointerId: id, button: 0 });
    canvas.dispatchEvent(e);
}

describe('mountHoleOverlay read-only + fill (play mode map)', () => {
    let canvas, onChange, ctl;
    beforeEach(() => {
        vi.useFakeTimers();
        HTMLCanvasElement.prototype.getContext = () => stubContext();
        document.body.innerHTML = '<div class="wrap"><canvas></canvas></div>';
        const wrap = document.querySelector('.wrap');
        wrap.getBoundingClientRect = () => ({ width: 375, height: 667, top: 0, left: 0, right: 375, bottom: 667 });
        canvas = document.querySelector('canvas');
        canvas.getBoundingClientRect = () => ({ width: 375, height: 667, top: 0, left: 0, right: 375, bottom: 667 });
        onChange = vi.fn();
    });
    afterEach(() => { ctl?.destroy(); vi.useRealTimers(); });

    it('fills the container height instead of the hole aspect', () => {
        ctl = mountHoleOverlay(canvas, HOLE, { readOnly: true, fill: true, onChange });
        expect(canvas.style.height).toBe('667px');
    });

    it('fits the hole between the insets (closer = more metres per px)', () => {
        ctl = mountHoleOverlay(canvas, HOLE, { readOnly: true, fill: true });
        const open = ctl.metresPerPx();
        ctl.destroy();
        ctl = mountHoleOverlay(canvas, HOLE, { readOnly: true, fill: true, fitInsets: { top: 120, bottom: 260 } });
        expect(ctl.metresPerPx()).toBeGreaterThan(open);
    });

    it('a one-finger drag pans and never stores a line', () => {
        ctl = mountHoleOverlay(canvas, HOLE, { readOnly: true, fill: true, onChange });
        ptr(canvas, 'pointerdown', 100, 400);
        ptr(canvas, 'pointermove', 140, 300);
        ptr(canvas, 'pointermove', 180, 200);
        ptr(canvas, 'pointerup', 180, 200);
        expect(ctl.getCurves().intended).toBeNull();
        expect(ctl.getCurves().actual).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
        expect(document.querySelector('.map-reset-chip').classList.contains('hidden')).toBe(false);
    });

    it('a long press still measures, from your GPS spot', () => {
        ctl = mountHoleOverlay(canvas, HOLE, {
            readOnly: true, fill: true, onChange,
            startMarker: { lat: TEE[0], lon: TEE[1], quality: 'accepted', draggable: false },
        });
        ptr(canvas, 'pointerdown', 180, 300);
        vi.advanceTimersByTime(MEASURE_HOLD_MS + 20);
        ptr(canvas, 'pointerup', 180, 300);
        expect(ctl.getMeasure()).not.toBeNull();
        expect(ctl.getCurves().intended).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('without readOnly the same drag still draws (wizard unchanged)', () => {
        ctl = mountHoleOverlay(canvas, HOLE, { onChange });
        ptr(canvas, 'pointerdown', 100, 250);
        ptr(canvas, 'pointermove', 140, 200);
        ptr(canvas, 'pointermove', 180, 120);
        ptr(canvas, 'pointerup', 180, 120);
        expect(onChange).toHaveBeenCalled();
    });
});

describe('shot view reach (owner 2026-10-06: "no point showing 250 m")', () => {
    it('frames the ball out to YOUR reach, not a fixed 240 m', () => {
        const v = computeShotView([0, 0], [0, 400], 30, 230);
        expect(v.band).toBe('full');
        expect(v.maxY).toBe(260); // 230 m + 30 m beyond
        expect(computeShotView([0, 0], [0, 400], 30).maxY).toBe(270); // the wizard's default stays 240
    });
    it('inside your reach it frames ball → green (the approach)', () => {
        const v = computeShotView([0, 250], [0, 400], 30, 230);
        expect(v.band).toBe('approach');
        expect(v.minY).toBe(230);
        expect(v.maxY).toBe(400 + 15 + 25);
    });
});

describe('featureStyle outline (owner 2026-10-06: "very light transparency")', () => {
    function spyContext(log) {
        return new Proxy({}, {
            get(_t, k) {
                if (k === 'measureText') return () => ({ width: 60 });
                if (k === 'getTransform') return () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
                return (...a) => { log.push([k, a[0]]); };
            },
            set(_t, k, v) { log.push(['set:' + String(k), v]); return true; },
        });
    }
    function mountWith(style) {
        const logs = [];
        HTMLCanvasElement.prototype.getContext = function () { const l = []; logs.push({ el: this, l }); return spyContext(l); };
        document.body.innerHTML = '<div class="wrap"><canvas></canvas></div>';
        const c = document.querySelector('canvas');
        c.getBoundingClientRect = () => ({ width: 375, height: 667, top: 0, left: 0, right: 375, bottom: 667 });
        const ctl = mountHoleOverlay(c, HOLE, { readOnly: true, fill: true, featureStyle: style });
        const main = logs.filter(e => e.el === c).flatMap(e => e.l);
        ctl.destroy();
        return { main, layers: logs.filter(e => e.el !== c) };
    }
    it('outline draws the shapes off-screen and composites a faint tint + an edge', () => {
        const { main, layers } = mountWith('outline');
        expect(layers.length).toBe(2);
        expect(main.filter(([k]) => k === 'drawImage').length).toBeGreaterThanOrEqual(2);
        expect(main.some(([k, v]) => k === 'set:globalAlpha' && v === 0.12)).toBe(true);
        expect(layers.some(e => e.l.some(([k, v]) => k === 'set:globalCompositeOperation' && v === 'destination-out'))).toBe(true);
    });
    it('solid (the wizard) is unchanged: no off-screen layers', () => {
        const { layers } = mountWith('solid');
        expect(layers.length).toBe(0);
    });
});
