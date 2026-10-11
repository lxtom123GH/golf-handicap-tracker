// @vitest-environment node
// ==========================================
// overlay-minified.test.js — the overlay must mount from the PRODUCTION bundle
// ==========================================
// Glass chips PR 5 regression. A guard written as a hoisted `var` flag read
// before its assignment passed every unit test (they run unminified) and
// crashed the mount in the Vite production build ("Cannot access 'O' before
// initialization"), taking down every e2e that opens the hole map. This
// bundles hole-overlay.js with the app's own Vite/Rollup + minifier and mounts
// THAT, so a TDZ / hoisting bug the minifier exposes fails here, in seconds.

import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { fromFrame, makeFrame } from '../../src/geo.js';

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

describe('hole overlay from the minified production bundle', () => {
    it('mounts, writes data-start, and the Hole / Shot chip toggles', async () => {
        const out = await build({
            configFile: false,
            logLevel: 'silent',
            build: {
                write: false,
                minify: true, // the default production minifier
                lib: { entry: path.resolve('src/hole-overlay.js'), formats: ['es'], fileName: 'overlay' },
            },
        });
        const chunk = (Array.isArray(out) ? out[0] : out).output.find(o => o.type === 'chunk');

        // esbuild needs the Node environment; the bundle runs in its own
        // jsdom window (module exports rewritten to a global for eval).
        const dom = new JSDOM('<div id="section-line"><canvas></canvas></div>', { runScripts: 'outside-only' });
        const { window } = dom;
        window.HTMLCanvasElement.prototype.getContext = () => stubContext();
        const code = chunk.code.replace(/export\s*\{([^}]*)\};?\s*$/, (_m, list) => {
            const pairs = list.split(',').map(s => s.trim()).filter(Boolean).map(s => {
                const [local, exported] = s.split(/\s+as\s+/);
                return `${JSON.stringify(exported || local)}: ${local}`;
            });
            return `window.__overlay = { ${pairs.join(', ')} };`;
        });
        expect(code).toContain('window.__overlay');
        window.eval(code);
        const mod = window.__overlay;

        const canvas = window.document.querySelector('canvas');
        const ctl = mod.mountHoleOverlay(canvas, HOLE, {
            focus: { startXY: [0, 200], shotNumber: 2 }, startXY: [0, 200], onChange() {},
        });
        expect(canvas.dataset.start).toBe('0,200');
        expect(canvas.dataset.viewMode).toBe('shot');
        const chip = window.document.querySelector('.map-view-chip');
        expect(chip.textContent).toContain('Hole');
        chip.click();
        expect(canvas.dataset.viewMode).toBe('hole');
        ctl.destroy();
        window.close();
    }, 60_000);
});
